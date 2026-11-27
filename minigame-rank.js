// Pořadí dne v minihrách dne: Řazení dne (sorting.js, počet pokusů do správného pořadí) a Skládačka dne (puzzle.js, počet tahů).
// Stejně jako u ostatních denních her: přihlášený hráč po dohrání (i při opětovném otevření hotové hry) pošle výsledek na server
// (blok 53 v supabase/schema.sql, social.js minigameSubmit; jeden výsledek na hráče a den, první platí, den počítá server) a ve výsledku
// uvidí pruh „3. místo z 12 · napoprvé 40 %“ (vzhled jako pruh Řetězovky) s tlačítkem Pořadí: okno s nejlepšími hráči a přáteli
// (záložky Všichni / Přátelé jako u Kvízu dne, moje řádka zvýrazněná). Pořadí je jen mezi hráči stejné varianty: u Skládačky stejný
// obrázek (bez internetu se místo vlajky skládá obrys, ten není stejně těžký), u Řazení stejná vlastnost; ostatní se jen spočítají.
// Nepřihlášený hráč vidí výzvu k přihlášení; databáze bez bloku 53 (starší schéma) srovnání neukáže vůbec.
// Čistá logika a HTML nahoře (testy v Node: tests/minigame-rank.test.js), napojení na server a okno v createController.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantMinigameRank = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const esc = (value) => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const playersWord = (count) => plural(count, 'hráč', 'hráči', 'hráčů');
    const DAY = /^\d{4}-\d{2}-\d{2}$/;

    // Hry: meze hodnot stejné jako na serveru (minigame_results_values), nejlepší možný výsledek (best) a texty
    const GAMES = {
        sorting: {
            id: 'sorting', title: 'Řazení dne', min: 1, max: 200, best: 1, variant: /^[a-z0-9-]{1,40}$/,
            word: (n) => plural(n, 'pokus', 'pokusy', 'pokusů'), first: 'napoprvé', firstLong: 'Seřadilo napoprvé',
            other: 'jiná vlastnost', login: 'Po přihlášení uvidíš své pořadí dne a kolik hráčů seřadilo karty napoprvé.'
        },
        puzzle: {
            id: 'puzzle', title: 'Skládačka dne', min: 16, max: 2000, best: 16, variant: /^(flag|outline):Q\d{1,12}$/,
            word: (n) => plural(n, 'tah', 'tahy', 'tahů'), first: 'bez chyby', firstLong: 'Složilo bez chybného tahu',
            other: 'jiný obrázek, třeba obrys místo vlajky', login: 'Po přihlášení uvidíš své pořadí dne a kolik hráčů složilo obrázek bez chybného tahu.'
        }
    };
    const DIALOG_TITLE = 'Pořadí dne';
    const SECONDARY = 'flex min-w-0 items-center justify-center gap-1.5 rounded-2xl btn-3d-light bg-white px-2 py-2.5 text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100';

    // Výsledek k odeslání: { value, variant } v mezích hry, jinak null (starý záznam bez vlastnosti, nesmyslné číslo)
    const submission = (game, result) => {
        const spec = GAMES[game];
        if (!spec || !result) return null;
        const value = Math.floor(Number(result.value));
        const variant = String(result.variant || '');
        if (!Number.isFinite(value) || value < spec.min || !spec.variant.test(variant)) return null;
        return { value: Math.min(spec.max, value), variant };
    };
    // Varianta Skládačky dne: 'flag:Q…' / 'outline:Q…'
    const puzzleVariant = (variant, id) => `${variant}:${id}`;

    // Shrnutí pro pruh i okno: „3. místo z 12 · napoprvé 40 % · nejlepší 1 pokus“
    const summary = (game, board, { me = true } = {}) => {
        const spec = GAMES[game];
        const parts = [];
        if (me && board.me && board.me.rank) parts.push(`${board.me.rank}. místo z ${board.players}`);
        else parts.push(playersWord(board.players));
        parts.push(`${spec.first} ${board.first_pct} %`);
        if (board.best) parts.push(`nejlepší ${spec.word(board.best)}`);
        return parts;
    };
    const otherNote = (game, count) => (count ? `Mimo toto pořadí (${GAMES[game].other}): ${playersWord(count)}.` : '');

    // Pruh ve výsledku: state = { board } (null = načítá se, false = nedostupné), guest (nepřihlášený), canLogin; '' = nic (starší databáze)
    const stripHtml = ({ game, board, guest = false, canLogin = false, missing = false }) => {
        const spec = GAMES[game];
        if (!spec || missing) return '';
        let body;
        if (guest) {
            if (!canLogin) return '';
            body = `<p class="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(spec.login)}</p><button type="button" data-action="mg-rank-login" class="${SECONDARY} shrink-0"><i data-lucide="log-in" class="h-4 w-4"></i> Přihlásit se</button>`;
        } else if (board === null || board === undefined) body = '<p class="min-w-0 flex-1 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Načítám pořadí dne…</p>';
        else if (board === false) body = '<p class="min-w-0 flex-1 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Pořadí dne teď není k dispozici.</p>';
        else {
            const [first, ...rest] = summary(game, board);
            const lead = board.me && board.me.rank ? `<b class="text-slate-900 dark:text-white">${esc(first)}</b>` : esc(first);
            body = `<p data-mg-summary class="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200">${lead}${rest.map(part => ` · ${esc(part)}`).join('')}</p>
                <button type="button" data-action="mg-rank-open" data-game="${game}" class="${SECONDARY} shrink-0"><i data-lucide="list-ordered" class="h-4 w-4"></i> Pořadí</button>`;
        }
        return `<section data-mg-rank="${game}" class="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">${body}</section>`;
    };

    // Řádek pořadí (jako v okně pořadí Řetězovky): místo, obrázek, přezdívka, výsledek; moje řádka zvýrazněná
    const rowHtml = (game, row, h) => `
        <li data-mg-row="${esc(row.id)}" class="flex min-h-[2rem] items-center gap-2 rounded-xl px-1.5 py-0.5 ${row.me ? 'bg-gold-50 ring-1 ring-gold-300 dark:bg-gold-950/50 dark:ring-gold-700' : ''}">
            <span class="w-6 shrink-0 text-center text-[12px] font-black text-slate-500 dark:text-slate-400">${row.rank === 1 ? '🏆' : `${row.rank}.`}</span>
            ${h && h.avatarHtml ? h.avatarHtml(row, 'h-6 w-6 text-xs', !row.me) : ''}
            <span data-player-name class="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight text-slate-800 dark:text-slate-100">${esc(row.display_name || 'Hráč')}${row.me ? ' (ty)' : ''}</span>
            <span class="shrink-0 text-right text-[13px] font-black text-slate-700 dark:text-slate-200">${esc(row.value === GAMES[game].best ? `${GAMES[game].word(row.value)} ✓` : GAMES[game].word(row.value))}</span>
        </li>`;
    const note = (text) => `<p class="rounded-2xl bg-white px-3 py-3 text-center text-sm font-semibold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">${esc(text)}</p>`;
    // Okno pořadí: záložky Všichni / Přátelé (jako Kvíz dne), shrnutí, seznam, poznámka o jiné variantě (zavírá se křížkem v nadpisu okna,
    // ať se deset řádek vejde i na 360×640)
    const dialogHtml = ({ game, tab = 'all', board, friends }, h) => {
        const spec = GAMES[game];
        const toggle = (id, label) => `<button type="button" role="tab" data-mg-tab="${id}" aria-selected="${tab === id}" class="flex min-h-[2.5rem] flex-1 items-center justify-center rounded-xl px-2 text-[13px] font-black ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`;
        let body;
        let other = 0;
        if (tab === 'friends') {
            if (friends === null || friends === undefined) body = note('Načítám přátele…');
            else if (!friends) body = note('Přátele se teď nepodařilo načíst.');
            else {
                other = friends.other;
                const list = friends.rows.length ? `<ol class="flex flex-col gap-0.5">${friends.rows.map(row => rowHtml(game, row, h)).join('')}</ol>` : '';
                if (!friends.friends) body = note('Zatím nemáš přátele. Najdeš je na záložce Soupeři: u Přátel klepni na plus.');
                else if (!friends.rows.some(row => !row.me)) body = `${list}${note('Z přátel dnes ještě nikdo nehrál.')}`;
                else body = list;
            }
        } else if (board === null || board === undefined) body = note('Načítám pořadí…');
        else if (!board) body = note('Pořadí se teď nepodařilo načíst.');
        else {
            other = board.other;
            const mine = board.me && board.me.rank && !board.top.some(row => row.me)
                ? `<li aria-hidden="true" class="text-center text-sm font-black leading-none text-slate-400">⋯</li>${rowHtml(game, { ...(h && h.meRow ? h.meRow : {}), id: 'me', rank: board.me.rank, value: board.me.value, me: true }, h)}` : '';
            body = board.top.length ? `<ol class="flex flex-col gap-0.5">${board.top.map(row => rowHtml(game, row, h)).join('')}${mine}</ol>` : note('Zatím nikdo nedohrál. Budeš první!');
        }
        const head = board ? `${summary(game, board, { me: false }).join(' · ')}` : '';
        return `
            <div data-mg-dialog="${game}" class="flex flex-col gap-2">
                <p class="text-[13px] font-semibold text-slate-600 dark:text-slate-300">${esc(spec.title)}${head ? ` · ${esc(head)}` : ''}</p>
                <div role="tablist" class="flex gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${toggle('all', 'Všichni')}${toggle('friends', 'Přátelé')}</div>
                <div data-mg-list>${body}</div>
                ${other ? `<p data-mg-other class="text-[12px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${esc(otherNote(game, other))}</p>` : ''}
            </div>`;
    };

    // --- Napojení (prohlížeč) ---
    // deps: social (minigameSubmit/Board/Friends), auth, signedUser, startLogin, showDialog, renderIcons, avatarHtml, meRow, appContent,
    // touchTip (otevřené okno pořadí: tip Pořadí v Minihrách dne už není potřeba)
    const REFRESH_MS = 20000;
    const createController = (deps) => {
        const views = {}; // game → { day, board, friends, tab, sent, missing, at, busy }
        const ranked = () => Boolean(deps.social && deps.social.minigameBoard && deps.auth && deps.auth.isConfigured() && deps.signedUser());
        const canLogin = () => Boolean(deps.social && deps.auth && deps.auth.isConfigured()) && !deps.signedUser();
        const viewFor = (game, day) => {
            const user = deps.signedUser();
            const owner = user ? user.id : '';
            if (!views[game] || views[game].day !== day || views[game].owner !== owner) views[game] = { day, owner, board: null, friends: null, tab: 'all', sent: false, missing: false, at: 0, busy: null };
            return views[game];
        };
        const helpers = () => ({ avatarHtml: deps.avatarHtml, meRow: deps.meRow ? deps.meRow() : {} });
        const strip = (game, day) => {
            if (!GAMES[game] || !DAY.test(String(day || ''))) return '';
            if (!ranked()) return stripHtml({ game, guest: true, canLogin: canLogin() });
            const view = viewFor(game, day);
            return stripHtml({ game, board: view.board, missing: view.missing });
        };
        const dialogOpen = () => { const overlay = typeof document !== 'undefined' ? document.getElementById('dialog-overlay') : null; return Boolean(overlay && overlay.dataset.title === DIALOG_TITLE && overlay.querySelector('[data-mg-dialog]')); };
        const repaint = (game, day) => {
            const el = deps.appContent && deps.appContent.querySelector(`[data-mg-rank="${game}"]`);
            if (el) {
                const html = strip(game, day);
                if (html) { el.outerHTML = html; const fresh = deps.appContent.querySelector(`[data-mg-rank="${game}"]`); if (fresh) deps.renderIcons(fresh); } else el.remove();
            }
            const overlay = dialogOpen() ? document.querySelector(`#dialog-overlay [data-mg-dialog="${game}"]`) : null;
            if (overlay) showRanking(game);
        };
        // Odeslání (jednou za den a hru; server přijme jen první výsledek) a načtení pořadí; volá se při každém zobrazení výsledku
        const sync = (game, day, result) => {
            if (!GAMES[game] || !DAY.test(String(day || '')) || !ranked()) return Promise.resolve();
            const view = viewFor(game, day);
            if (view.missing) return Promise.resolve();
            if (view.busy) return view.busy;
            if (view.sent && view.board && Date.now() - view.at < REFRESH_MS) return Promise.resolve();
            view.busy = (async () => {
                const sending = !view.sent ? submission(game, result) : null;
                if (sending) {
                    try {
                        const saved = await deps.social.minigameSubmit(game, day, sending.value, sending.variant);
                        if (saved === null) { view.missing = true; return; }
                        view.sent = true;
                    } catch (error) { /* bez spojení: zkusí se při dalším otevření výsledku */ }
                }
                const [board, friends] = await Promise.all([
                    deps.social.minigameBoard(game, day).catch(() => false),
                    deps.social.minigameFriends(game, day).catch(() => false)
                ]);
                if (board === null || friends === null) { view.missing = true; return; }
                view.board = board || false;
                view.friends = friends || false;
                view.at = Date.now();
            })().finally(() => { view.busy = null; if (views[game] === view) repaint(game, day); });
            return view.busy;
        };
        const showRanking = (game) => {
            const view = views[game];
            if (!view || !deps.showDialog) return;
            deps.showDialog(DIALOG_TITLE, dialogHtml({ game, tab: view.tab, board: view.board, friends: view.friends }, helpers()), {
                onClick: (event) => {
                    const tab = event.target.closest('[data-mg-tab]');
                    if (!tab) return;
                    view.tab = tab.dataset.mgTab === 'friends' ? 'friends' : 'all';
                    showRanking(game);
                }
            });
            if (deps.renderIcons) deps.renderIcons(document.getElementById('dialog-overlay'));
            if (deps.touchTip) deps.touchTip('minigameRank');
        };
        const actions = {
            'mg-rank-open': (button) => { if (GAMES[button.dataset.game] && views[button.dataset.game]) showRanking(button.dataset.game); },
            'mg-rank-login': () => { if (deps.startLogin) deps.startLogin(); }
        };
        return { actions, strip, sync, debug: () => views };
    };

    return { GAMES, DIALOG_TITLE, submission, puzzleVariant, summary, otherNote, stripHtml, rowHtml, dialogHtml, createController };
});
