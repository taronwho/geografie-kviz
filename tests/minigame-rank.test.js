// Pořadí dne v minihrách dne (minigame-rank.js): co se pošle na server, shrnutí, pruh ve výsledku, okno pořadí a napojení (odeslání jednou,
// starší databáze bez bloku 53, nepřihlášený hráč).
const test = require('node:test');
const assert = require('node:assert/strict');
const MR = require('../minigame-rank.js');

const board = (extra = {}) => ({ day: '2026-11-27', players: 12, other: 0, first: 5, first_pct: 42, best: 1, me: { value: 2, rank: 3, variant: 'rozloha' },
    top: [{ rank: 1, id: 'b', display_name: 'Bára', value: 1, me: false }, { rank: 3, id: 'a', display_name: 'Ája <b>', value: 2, me: true }], ...extra });

test('submission: meze jako na serveru, varianta podle hry', () => {
    assert.deepEqual(MR.submission('sorting', { value: 3, variant: 'zemepis-hora-vyska' }), { value: 3, variant: 'zemepis-hora-vyska' });
    assert.deepEqual(MR.submission('sorting', { value: 999, variant: 'x' }), { value: 200, variant: 'x' }, 'nad strop se ořízne');
    assert.equal(MR.submission('sorting', { value: 0, variant: 'x' }), null);
    assert.equal(MR.submission('sorting', { value: 2, variant: '' }), null, 'starý záznam bez vlastnosti');
    assert.equal(MR.submission('puzzle', { value: 15, variant: 'flag:Q213' }), null, 'méně tahů než dílků');
    assert.deepEqual(MR.submission('puzzle', { value: 17, variant: MR.puzzleVariant('outline', 'Q213') }), { value: 17, variant: 'outline:Q213' });
    assert.equal(MR.submission('puzzle', { value: 17, variant: 'vlajka:Q1' }), null);
    assert.equal(MR.submission('snack', { value: 17, variant: 'x' }), null);
});

test('summary a poznámka o jiné variantě: správné tvary slov', () => {
    assert.deepEqual(MR.summary('sorting', board()), ['3. místo z 12', 'napoprvé 42 %', 'nejlepší 1 pokus']);
    assert.deepEqual(MR.summary('puzzle', board({ best: 16, me: null })), ['12 hráčů', 'bez chyby 42 %', 'nejlepší 16 tahů']);
    assert.equal(MR.otherNote('puzzle', 3), 'Mimo toto pořadí (jiný obrázek, třeba obrys místo vlajky): 3 hráči.');
    assert.equal(MR.otherNote('sorting', 1), 'Mimo toto pořadí (jiná vlastnost): 1 hráč.');
    assert.equal(MR.otherNote('sorting', 0), '');
});

test('stripHtml: načítání, chyba, výsledek, host s přihlášením, starší databáze', () => {
    assert.match(MR.stripHtml({ game: 'sorting', board: null }), /Načítám pořadí dne/);
    assert.match(MR.stripHtml({ game: 'sorting', board: false }), /není k dispozici/);
    const done = MR.stripHtml({ game: 'sorting', board: board() });
    assert.match(done, /data-mg-rank="sorting"/);
    assert.match(done, /<b[^>]*>3\. místo z 12<\/b> · napoprvé 42 % · nejlepší 1 pokus/);
    assert.match(done, /data-action="mg-rank-open" data-game="sorting"/);
    const guest = MR.stripHtml({ game: 'puzzle', guest: true, canLogin: true });
    assert.match(guest, /data-action="mg-rank-login"/);
    assert.match(guest, /bez chybného tahu/);
    assert.equal(MR.stripHtml({ game: 'puzzle', guest: true, canLogin: false }), '', 'bez účtů v aplikaci nic');
    assert.equal(MR.stripHtml({ game: 'puzzle', board: board(), missing: true }), '', 'starší databáze');
    assert.doesNotMatch(done, /style=/, 'bez inline stylů (CSP)');
});

test('dialogHtml: záložky, zvýrazněná moje řádka, moje místo mimo nejlepší, přátelé, jiná varianta', () => {
    const h = { avatarHtml: (row) => `<span data-avatar="${row.id}"></span>`, meRow: { display_name: 'Já' } };
    const all = MR.dialogHtml({ game: 'sorting', tab: 'all', board: board(), friends: null }, h);
    assert.match(all, /data-mg-tab="all" aria-selected="true"/);
    assert.match(all, /data-mg-row="a" class="[^"]*ring-gold-300/);
    assert.match(all, /Ája &lt;b&gt; \(ty\)/);
    assert.match(all, /1 pokus ✓/);
    assert.match(all, /Řazení dne · 12 hráčů · napoprvé 42 %/);
    // Moje místo mimo nejlepších 10: řádka pod tečkami
    const far = MR.dialogHtml({ game: 'puzzle', board: board({ best: 16, me: { value: 40, rank: 14 }, top: [{ rank: 1, id: 'b', display_name: 'Bára', value: 16 }], other: 2 }) }, h);
    assert.match(far, /⋯[\s\S]*14\.[\s\S]*Já \(ty\)[\s\S]*40 tahů/);
    assert.match(far, /data-mg-other[^>]*>Mimo toto pořadí \(jiný obrázek, třeba obrys místo vlajky\): 2 hráči\./);
    assert.match(MR.dialogHtml({ game: 'puzzle', board: board({ top: [], me: null }) }, h), /Budeš první/);
    assert.match(MR.dialogHtml({ game: 'puzzle', tab: 'friends', board: board(), friends: { friends: 0, other: 0, rows: [] } }, h), /Zatím nemáš přátele/);
    assert.match(MR.dialogHtml({ game: 'puzzle', tab: 'friends', board: board(), friends: { friends: 2, other: 0, rows: [{ rank: 1, id: 'a', display_name: 'Ája', value: 20, me: true }] } }, h), /nikdo nehrál/);
    assert.match(MR.dialogHtml({ game: 'puzzle', tab: 'friends', board: board(), friends: false }, h), /nepodařilo načíst/);
});

test('createController: výsledek se pošle jednou, pořadí se načte, starší databáze srovnání skryje, host vidí přihlášení', async () => {
    const calls = [];
    let missing = false;
    let user = { id: 'u1' };
    const social = {
        minigameSubmit: async (...args) => { calls.push(['submit', ...args]); return missing ? null : { value: args[2], rank: 1, variant: args[3] }; },
        minigameBoard: async (game, day) => { calls.push(['board', game, day]); return missing ? null : board(); },
        minigameFriends: async () => (missing ? null : { friends: 1, other: 0, rows: [] })
    };
    const ctl = MR.createController({ social, auth: { isConfigured: () => true }, signedUser: () => user, renderIcons: () => {}, appContent: null });
    assert.match(ctl.strip('sorting', '2026-11-27'), /Načítám/);
    await ctl.sync('sorting', '2026-11-27', { value: 2, variant: 'rozloha' });
    assert.deepEqual(calls.filter(c => c[0] === 'submit'), [['submit', 'sorting', '2026-11-27', 2, 'rozloha']]);
    assert.match(ctl.strip('sorting', '2026-11-27'), /3\. místo z 12/);
    // Opětovné otevření hned potom: nic znovu
    await ctl.sync('sorting', '2026-11-27', { value: 2, variant: 'rozloha' });
    assert.equal(calls.filter(c => c[0] === 'submit').length, 1);
    assert.equal(calls.filter(c => c[0] === 'board').length, 1);
    // Starší databáze (404 → null): pruh zmizí a dál se nic neposílá
    missing = true;
    await ctl.sync('puzzle', '2026-11-27', { value: 20, variant: 'flag:Q213' });
    assert.equal(ctl.strip('puzzle', '2026-11-27'), '');
    await ctl.sync('puzzle', '2026-11-27', { value: 20, variant: 'flag:Q213' });
    assert.equal(calls.filter(c => c[0] === 'submit' && c[1] === 'puzzle').length, 1);
    // Nepřihlášený: výzva k přihlášení, nic se neposílá
    user = null;
    assert.match(ctl.strip('sorting', '2026-11-27'), /mg-rank-login/);
    await ctl.sync('sorting', '2026-11-28', { value: 1, variant: 'rozloha' });
    assert.equal(calls.filter(c => c[0] === 'submit').length, 2);
});
