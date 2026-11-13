// Kamarádské sázky: k výzvě konkrétnímu hráči (podle přezdívky, příteli, odveta) jde vsadit 10, 25 nebo 50 XP a přidat jednu z 8 hlášek.
// Vyzvaný sázku před hrou přijme, nebo hraje bez ní. Až dohrají oba, kdo vyhraje, vklad získá, a kdo prohraje, o něj přijde (nikdy pod hranici své úrovně),
// remíza nic. Vsadit jde nejvýš tolik, kolik hráč získal za posledních 7 dní. Server (supabase/schema.sql, blok 21) hlídá pravidla a mění XP
// v účtu; tady je čistá logika (vklady, hlášky, stav sázky pro řádek výzvy, sladění XP v zařízení se součty výher a proher v účtu), vykreslení
// jako HTML, sypání mincí k vítězi (Web Animations API) a volání serveru. app.js napojí okno Vyzvat, detail a výsledek výzvy, seznam výzev
// a profil hráče přes createController. Testy: tests/bets.test.js, tests/sql-bets.test.js, tests/e2e-bets.test.js.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantBets = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    // Obrázky (docs/NOVE-MODY.md č. 241–243): do dodání mince a hromádka z CSS (třídy .bet-coin a .bet-pile v src/input.css)
    // a sova s pohárem; po dodání stačí doplnit jména souborů icons/topics/<jméno>.webp
    const ART = {
        coin: null, // č. 241 mince
        pile: null, // č. 242 mince-hromadka
        owl: 'sova-vyzva', // č. 243 sova-sazka
        // Symboly skupin odznaků (icons/topics/<jméno>.webp, app.js badgeArtOf): truhla s pokladem a koruna řady výher, do dodání č. 243 sova-sazka
        badges: { sazky: 'truhla', 'sazky-v-rade': 'odznak-vyhry-v-rade' }
    };
    const STAKES = [10, 25, 50];
    const MAX_STAKE = 50;
    const OFFER_DAYS = 7;
    const KEY = 'mudrlant.bets';
    // Hlášky k sázce (pořadí = číslo v databázi 0–7, nové jen na konec). Hravé, bez rodu, nikoho neurážejí.
    const TAUNTS = [
        'Tohle dám levou zadní!',
        'Připrav si peněženku!',
        'Mám to v malíčku!',
        'Mince už slyším cinkat.',
        'Ať vyhraje lepší hlava!',
        'Zkus mě dohnat!',
        'Znám odpovědi i ze spaní.',
        'Uvidíme, kdo je tu mudrlant!'
    ];
    const STATES = ['offered', 'accepted', 'declined'];
    const OUTCOMES = ['win', 'loss', 'draw'];

    const whole = (value, min, max) => { const n = Math.floor(Number(value)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null; };
    const cleanStake = (value) => (STAKES.includes(Number(value)) ? Number(value) : 0);
    const cleanTaunt = (value) => (value === null || value === undefined || value === '' ? null : Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < TAUNTS.length ? Number(value) : null);
    const tauntText = (index) => (cleanTaunt(index) === null ? '' : TAUNTS[Number(index)]);
    // Další / předchozí hláška v kolečku: null (bez hlášky) → 0 → … → 7 → null
    const nextTaunt = (current, step = 1) => {
        const order = [null, ...TAUNTS.map((_, i) => i)];
        const at = order.indexOf(cleanTaunt(current));
        return order[(at + (step < 0 ? order.length - 1 : 1)) % order.length];
    };
    const minus = '−';
    const formatDelta = (delta) => { const n = Math.round(Number(delta) || 0); return n > 0 ? `+${n} XP` : n < 0 ? `${minus}${-n} XP` : `±0 XP`; };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const winsWord = (n) => plural(n, 'výhra', 'výhry', 'výher');
    const lossesWord = (n) => plural(n, 'prohra', 'prohry', 'proher');
    const drawsWord = (n) => plural(n, 'remíza', 'remízy', 'remíz');
    const betsWord = (n) => plural(n, 'sázka', 'sázky', 'sázek');

    // Vklady pro okno Vyzvat: Bez sázky a 10/25/50 XP; vyšší než limit (XP za 7 dní bez otevřených sázek) nejde vybrat. limit null = neví se.
    const stakeOptions = (limit) => [{ value: 0, enabled: true }, ...STAKES.map(value => ({ value, enabled: limit === null || limit === undefined || value <= limit }))];
    const limitNote = (limit) => (limit === null || limit === undefined ? '' : limit < STAKES[0]
        ? `Na sázku potřebuješ aspoň ${STAKES[0]} XP z posledních 7 dní. Zahraj si a zkus to znovu.`
        : `Vsadit můžeš nejvýš ${Math.min(limit, MAX_STAKE)} XP: tolik máš z posledních 7 dní.`);

    // --- Data ze serveru (challenge_stakes, challenge_settle_stake): jen tvarově platné hodnoty ---
    const isCode = (value) => typeof value === 'string' && /^[A-Z0-9]{6}$/.test(value);
    const isId = (value) => typeof value === 'string' && /^[0-9a-zA-Z-]{1,40}$/.test(value);
    const cleanRow = (row) => {
        if (!row || typeof row !== 'object' || !isCode(row.id)) return null;
        const state = STATES.includes(row.state) ? row.state : null;
        return {
            id: row.id, stake: state ? cleanStake(row.stake) : 0, state, taunt: cleanTaunt(row.taunt), role: row.role === 'creator' ? 'creator' : 'opponent',
            other: isId(row.other) ? row.other : null, expired: row.expired === true, settled: row.settled === true, otherSettled: row.other_settled === true,
            delta: whole(row.delta, -MAX_STAKE, MAX_STAKE), done: row.done === true, otherDone: row.other_done === true,
            outcome: OUTCOMES.includes(row.outcome) ? row.outcome : null, fresh: row.fresh === true,
            xp: whole(row.xp, 0, 500000), won: whole(row.won, 0, 100000000), lost: whole(row.lost, 0, 100000000)
        };
    };
    const cleanStats = (stats) => {
        const s = stats && typeof stats === 'object' ? stats : {};
        const n = (value) => whole(value, 0, 1000000) || 0;
        return { bets: n(s.bets), wins: n(s.wins), losses: n(s.losses), draws: n(s.draws), balance: whole(s.balance, -100000000, 100000000) || 0, best: n(s.best), streak: n(s.streak) };
    };
    const cleanOverview = (data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return {
            limit: whole(data.limit, 0, MAX_STAKE) || 0, weekXp: whole(data.week_xp, 0, 1000000) || 0, open: whole(data.open, 0, 1000000) || 0,
            stats: cleanStats(data.stats), rows: (Array.isArray(data.rows) ? data.rows : []).map(cleanRow).filter(Boolean).slice(0, 60)
        };
    };

    // Co ukázat u výzvy: offer (čeká na mou odpověď), pending (čeká na odpověď soupeře), active (sázka platí), won / lost / draw (vyrovnaná),
    // settling (dohráno, vyrovná se), declined (bez sázky), null = žádná sázka
    const viewOf = (row) => {
        if (!row || !row.state || !row.stake) return null;
        if (row.state === 'declined' || (row.state === 'offered' && row.expired)) return { kind: 'declined', stake: row.stake, delta: 0 };
        if (row.state === 'offered') return { kind: row.role === 'opponent' && !row.done ? 'offer' : 'pending', stake: row.stake, delta: 0 };
        if (!row.outcome) return { kind: 'active', stake: row.stake, delta: 0 };
        if (!row.settled) return { kind: 'settling', stake: row.stake, delta: 0, outcome: row.outcome };
        return { kind: row.outcome === 'win' ? 'won' : row.outcome === 'loss' ? 'lost' : 'draw', stake: row.stake, delta: row.delta || 0, outcome: row.outcome };
    };

    // --- Sladění XP v zařízení se součty v účtu (profiles.bet_won, bet_lost) ---
    // seen = { won, lost } součty, které zařízení už do svých XP započítalo; totals = součty v účtu. Nové prohry se odečtou (jen nad hranicí
    // úrovně: floorOf(xp) = XP, od kterých platí aktuální úroveň), nové výhry přičtou. Bez záznamu (nové zařízení) se jen zapamatují:
    // XP z účtu, které zařízení převezme, je už obsahují.
    const reconcile = (seen, totals, xp, floorOf) => {
        const won = whole(totals && totals.won, 0, 100000000);
        const lost = whole(totals && totals.lost, 0, 100000000);
        const current = Math.max(0, Math.floor(Number(xp) || 0));
        if (won === null || lost === null) return { xp: current, seen: seen || null, change: 0 };
        const known = seen && Number.isFinite(seen.won) && Number.isFinite(seen.lost) ? seen : null;
        if (!known || won < known.won || lost < known.lost) return { xp: current, seen: { won, lost }, change: 0 };
        const floor = Math.min(current, Math.max(0, Math.floor(Number(floorOf(current)) || 0)));
        const minusXp = Math.min(lost - known.lost, current - floor);
        const next = Math.min(500000, current - minusXp + (won - known.won));
        return { xp: next, seen: { won, lost }, change: next - current };
    };
    // Zařízení právě samo vyrovnalo sázku (result z challenge_settle_stake): změnu připíše hned a zapamatuje si ji
    const settledLocally = (seen, result) => {
        const delta = whole(result && result.delta, -MAX_STAKE, MAX_STAKE) || 0;
        const base = seen && Number.isFinite(seen.won) && Number.isFinite(seen.lost) ? seen
            : { won: Math.max(0, (whole(result && result.won, 0, 1e8) || 0) - Math.max(delta, 0)), lost: Math.max(0, (whole(result && result.lost, 0, 1e8) || 0) - Math.max(-delta, 0)) };
        return { won: base.won + Math.max(delta, 0), lost: base.lost + Math.max(-delta, 0) };
    };
    // Odečet prohry v zařízení: nikdy pod hranici aktuální úrovně
    const applyDelta = (xp, delta, floorOf) => {
        const current = Math.max(0, Math.floor(Number(xp) || 0));
        const d = Math.round(Number(delta) || 0);
        if (d >= 0) return Math.min(500000, current + d);
        const floor = Math.min(current, Math.max(0, Math.floor(Number(floorOf(current)) || 0)));
        return current - Math.min(-d, current - floor);
    };

    // Uložený stav v zařízení: { users: { <id>: { won, lost } }, shown: [kódy výzev, u kterých se mince už sypaly] }
    const parseLedger = (value) => {
        const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const users = {};
        Object.entries(v.users && typeof v.users === 'object' ? v.users : {}).slice(0, 20).forEach(([id, entry]) => {
            if (isId(id) && entry && Number.isFinite(entry.won) && Number.isFinite(entry.lost) && entry.won >= 0 && entry.lost >= 0) users[id] = { won: Math.floor(entry.won), lost: Math.floor(entry.lost) };
        });
        return { users, shown: (Array.isArray(v.shown) ? v.shown : []).filter(isCode).slice(-80) };
    };
    // Odznaky Sázkař a Neomylný sázkař (quiz-core.js): počítadla z přehledu sázek na serveru
    const countersFrom = (stats) => { const s = cleanStats(stats); return { bets: s.bets, betBestRun: s.best }; };

    // --- Vykreslení (h = { esc, art(name, cls), avatar(player, cls) }) ---
    const coinHtml = (cls = 'h-4 w-4') => (ART.coin ? `<img src="icons/topics/${ART.coin}.webp" alt="" aria-hidden="true" class="${cls} shrink-0 object-contain">` : `<span aria-hidden="true" class="bet-coin ${cls}"></span>`);
    // Hromádka mincí: tři sloupečky mincí s mincí navrchu (do dodání obrázku č. 242)
    const pileHtml = (cls = '') => (ART.pile ? `<img src="icons/topics/${ART.pile}.webp" alt="" aria-hidden="true" data-bet-pile class="h-12 w-16 shrink-0 object-contain ${cls}">`
        : `<span aria-hidden="true" data-bet-pile class="bet-pile ${cls}"><span class="bet-stack bet-stack-3"></span><span class="bet-stack bet-stack-5"></span><span class="bet-stack bet-stack-2"></span></span>`);
    const BADGE_TONES = {
        offer: 'bg-gold-400 text-brand-950 ring-gold-500', pending: 'bg-white text-gold-800 ring-gold-400 dark:bg-slate-800 dark:text-gold-200 dark:ring-gold-600',
        active: 'bg-gold-100 text-gold-900 ring-gold-300 dark:bg-gold-900/50 dark:text-gold-100 dark:ring-gold-700', settling: 'bg-gold-100 text-gold-900 ring-gold-300 dark:bg-gold-900/50 dark:text-gold-100 dark:ring-gold-700',
        won: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:ring-emerald-700',
        lost: 'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-900/50 dark:text-rose-200 dark:ring-rose-700',
        draw: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600'
    };
    // Mince u výzvy v seznamu (Poslední výzvy, Čekají na tebe): vklad, nebo vyrovnaná částka
    const badgeHtml = (view) => {
        if (!view || view.kind === 'declined') return '';
        const won = view.kind === 'won' || view.kind === 'lost' || view.kind === 'draw';
        const text = won ? formatDelta(view.delta).replace(' XP', '') : `${view.stake}`;
        const label = { offer: `Nabídka sázky ${view.stake} XP`, pending: `Sázka ${view.stake} XP čeká na odpověď`, active: `Sázka ${view.stake} XP`, settling: `Sázka ${view.stake} XP`,
            won: `Vyhraná sázka ${formatDelta(view.delta)}`, lost: `Prohraná sázka ${formatDelta(view.delta)}`, draw: `Sázka ${view.stake} XP, remíza` }[view.kind];
        return `<span data-stake-badge="${view.kind}" title="${label}" class="inline-flex shrink-0 items-center gap-0.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-[10px] font-black leading-none tabular-nums ring-1 ${BADGE_TONES[view.kind]}">${coinHtml('h-3.5 w-3.5')}<span class="sr-only">${label}</span><span aria-hidden="true">${text}</span></span>`;
    };

    // Volba sázky v okně Vyzvat (jen výzva konkrétnímu hráči): rozbalovací řádek jako Téma a Nastavení (data-ch-open="stake"),
    // v něm vklady, hláška pro soupeře (šipkami dokola) a limit. state = { stake, taunt, limit, open, note }
    const pickerHtml = (state, h) => {
        const stake = cleanStake(state.stake);
        const taunt = cleanTaunt(state.taunt);
        const open = Boolean(state.open);
        const summary = stake ? `${stake} XP${taunt !== null ? ` · „${TAUNTS[taunt]}“` : ''}` : 'Bez sázky';
        const chip = (option) => {
            const active = option.value === stake;
            const label = option.value ? `${option.value} XP` : 'Bez sázky';
            return `<button type="button" data-stake-pick="${option.value}" aria-pressed="${active}" ${option.enabled ? '' : 'aria-disabled="true"'}
                class="flex min-h-[2.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1 text-[12px] font-black leading-tight active:scale-[0.97] ${active
                    ? 'border-gold-500 bg-gold-50 text-gold-900 dark:border-gold-400 dark:bg-gold-900/40 dark:text-gold-100'
                    : 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200'} ${option.enabled ? '' : 'opacity-50'}">${option.value
                    ? `<span class="flex items-center gap-1">${coinHtml('h-4 w-4')}${option.value}</span><span class="text-[10px] font-bold opacity-75">XP</span>`
                    : `<span>Bez</span><span class="text-[10px] font-bold opacity-75">sázky</span>`}<span class="sr-only">${label}</span></button>`;
        };
        const tauntRow = stake ? `
            <div class="mt-2 flex items-center gap-1 rounded-xl bg-gold-50 p-0.5 ring-1 ring-gold-200 dark:bg-gold-900/25 dark:ring-gold-800/70" data-taunt-row>
                <button type="button" data-taunt-step="-1" aria-label="Předchozí hláška" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gold-800 active:scale-95 dark:text-gold-200"><i data-lucide="chevron-left" class="h-5 w-5"></i></button>
                <button type="button" data-taunt-step="1" aria-live="polite" class="min-h-[2.5rem] min-w-0 flex-1 px-1 text-center text-[13px] font-black italic leading-tight ${taunt === null ? 'text-slate-500 dark:text-slate-400' : 'text-gold-900 dark:text-gold-100'}"><span class="sr-only">Hláška pro soupeře: </span>${taunt === null ? 'Bez hlášky' : `„${h.esc(TAUNTS[taunt])}“`}</button>
                <button type="button" data-taunt-step="1" aria-label="Další hláška" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gold-800 active:scale-95 dark:text-gold-200"><i data-lucide="chevron-right" class="h-5 w-5"></i></button>
            </div>` : '';
        const note = state.note || limitNote(state.limit);
        const body = open ? `
            <div class="border-t border-slate-100 px-3 pb-3 pt-2.5 dark:border-slate-700" data-stake-picker>
                <div class="grid grid-cols-4 gap-1.5" role="group" aria-label="Sázka">${stakeOptions(state.limit).map(chip).join('')}</div>
                ${tauntRow}
                <div class="mt-1.5 flex items-center gap-2">
                    <p data-stake-note class="min-w-0 flex-1 text-[11px] font-semibold leading-snug ${state.note ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}">${h.esc(note || 'Kdo vyhraje, vklad získá. Kdo prohraje, o něj přijde. Úroveň nikdy neklesne.')}</p>
                    <button type="button" data-stake-help aria-label="Jak fungují sázky" title="Jak to funguje?" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-50 text-base font-black text-brand-950 ring-1 ring-gold-300/70 active:scale-95 dark:bg-gold-900/20 dark:text-gold-200 dark:ring-gold-700/60">?</button>
                </div>
            </div>` : '';
        return `
            <div class="rounded-2xl bg-white shadow-sm dark:bg-slate-800/70 ${stake ? 'ring-2 ring-gold-400 dark:ring-gold-500' : ''}" data-stake-card>
                <button type="button" data-ch-open="stake" aria-expanded="${open}" class="flex w-full items-center gap-3 px-3 py-2 text-left short:py-1.5">
                    ${coinHtml('h-5 w-5')}
                    <span class="min-w-0 flex-1"><span class="block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Sázka</span><span data-stake-summary class="block truncate text-[14px] font-bold ${stake ? 'text-gold-800 dark:text-gold-200' : 'text-slate-800 dark:text-slate-100'}">${h.esc(summary)}</span></span>
                    <i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i>
                </button>
                ${body}
            </div>`;
    };

    // Hláška soupeře jako bublina od jeho obrázku
    const tauntBubble = (taunt, h, cls = '') => (cleanTaunt(taunt) === null ? '' : `<p data-taunt class="relative rounded-2xl rounded-tl-md bg-white px-3 py-1.5 text-[13px] font-black italic leading-snug text-brand-900 shadow-sm ring-1 ring-gold-300 dark:bg-slate-800 dark:text-gold-100 dark:ring-gold-700 ${cls}">„${h.esc(TAUNTS[cleanTaunt(taunt)])}“</p>`);

    // Nabídka sázky v detailu výzvy (vyzvaný ještě nehrál): vklad, co znamená výhra a prohra, hláška; tlačítka Přijmout sázku / Hrát bez sázky
    // dá app.js pod kartu (stejně velká jako Hrát výzvu)
    const offerHtml = ({ stake, taunt, name, limit }, h) => {
        const short = limit !== null && limit !== undefined && limit < stake;
        return `
            <div data-stake-offer class="bet-glow rounded-2xl bg-gradient-to-br from-gold-100 via-gold-50 to-white p-2.5 ring-2 ring-gold-400 dark:from-gold-900/60 dark:via-slate-800 dark:to-slate-800 dark:ring-gold-500">
                <div class="flex items-center gap-2.5">
                    ${pileHtml('bet-pile-sm')}
                    <div class="min-w-0 flex-1">
                        <p class="text-[17px] font-black leading-tight text-gold-900 dark:text-gold-100">Sázka ${stake} XP</p>
                        <p class="text-[12px] font-semibold leading-snug text-slate-700 dark:text-slate-300"><b>${h.esc(name)}</b> sází. Výhra ti dá <b class="text-emerald-700 dark:text-emerald-300">+${stake} XP</b>, prohra vezme <b class="text-rose-700 dark:text-rose-300">${minus}${stake} XP</b>. Úroveň neklesne.</p>
                    </div>
                    <button type="button" data-stake-help aria-label="Jak fungují sázky" title="Jak to funguje?" class="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full text-base font-black text-gold-800 active:scale-95 dark:text-gold-200">?</button>
                </div>
                ${tauntBubble(taunt, h, 'mt-2')}
                ${short ? `<p data-stake-short class="mt-1.5 text-[11.5px] font-bold leading-snug text-rose-700 dark:text-rose-300">${h.esc(limitNote(limit))}</p>` : ''}
            </div>`;
    };

    // Stav sázky v detailu výzvy a na výsledku, když ještě není rozhodnutá: jedna řádka s mincí
    const statusText = (view, name) => {
        if (!view) return '';
        if (view.kind === 'pending') return `Sázka ${view.stake} XP čeká, až ji ${name} přijme. Bez přijetí se hraje bez sázky.`;
        if (view.kind === 'active') return `Sázka ${view.stake} XP platí. Rozhodne se, až dohrajete oba.`;
        if (view.kind === 'settling') return `Sázka ${view.stake} XP: vyrovnávám…`;
        if (view.kind === 'declined') return 'Hraje se bez sázky.';
        return '';
    };
    const statusHtml = (view, name, h) => {
        const text = statusText(view, name);
        if (!text) return '';
        const muted = view.kind === 'declined';
        return `<p data-stake-status="${view.kind}" class="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-bold leading-snug ${muted ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-gold-50 text-gold-900 ring-1 ring-gold-300 dark:bg-gold-900/30 dark:text-gold-100 dark:ring-gold-700'}">${coinHtml('h-5 w-5')}<span class="min-w-0">${h.esc(text)}</span></p>`;
    };

    // Výsledek sázky: já vlevo, soupeř vpravo, hromádka mincí u vítěze (při remíze uprostřed) a věta pod tím. Mince se k vítězi sypou v pour().
    // h = { esc, avatar(player, cls), name(player) }
    const resultLine = (view) => (view.kind === 'won' ? 'Sázka je tvoje!' : view.kind === 'lost' ? 'Sázka tentokrát nevyšla.' : 'Remíza: vklady zůstávají.');
    const resultSub = (view) => (view.kind === 'won' ? 'Mince soupeře putují k tobě.' : view.kind === 'lost'
        ? (view.delta === 0 ? 'Úroveň je v bezpečí, XP zůstávají.' : 'Mince putují k soupeři. Úroveň ti zůstává.') : 'Nikdo nic nezískal ani neztratil.');
    // Krátká věta pro sevřenou podobu (detail výzvy v okně): vklad i výsledek v jedné řádce
    const compactLine = (view) => (view.kind === 'won' ? `Sázka ${view.stake} XP je tvoje!` : view.kind === 'lost' ? `Sázka ${view.stake} XP nevyšla.` : `Sázka ${view.stake} XP: remíza.`);
    // compact = v okně (detail výzvy): menší obrázky bez jmen (jména jsou v pořadí nad tím) a jedna řádka textu
    const resultHtml = ({ view, me, other, compact = false }, h) => {
        if (!view || !['won', 'lost', 'draw'].includes(view.kind)) return '';
        const side = view.kind === 'won' ? 'me' : view.kind === 'lost' ? 'other' : 'middle';
        const align = side === 'me' ? 'justify-start' : side === 'other' ? 'justify-end' : 'justify-center';
        const tone = view.kind === 'won' ? 'text-emerald-700 dark:text-emerald-300' : view.kind === 'lost' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200';
        // Vítěz má zlatý kroužek a korunku; mezi hráči čárkovaná cesta, po které mince putují
        const person = (player, who) => {
            const winner = side === who;
            return `<span data-bet-side="${who}" class="relative flex ${compact ? 'w-12' : 'w-[4.5rem]'} shrink-0 flex-col items-center gap-0.5">
                ${winner ? `<span aria-hidden="true" class="absolute ${compact ? '-top-2' : '-top-2.5'} z-10 text-gold-500 drop-shadow-sm dark:text-gold-300"><i data-lucide="crown" class="h-4 w-4 fill-gold-300 dark:fill-gold-500"></i></span>` : ''}
                <span class="rounded-full ${winner ? 'ring-[3px] ring-gold-400 ring-offset-2 ring-offset-gold-50 dark:ring-offset-slate-800' : 'opacity-90'}">${h.avatar(player, compact ? 'h-9 w-9 text-lg' : 'h-11 w-11 text-xl')}</span>
                ${compact ? '' : `<span class="max-w-full truncate text-[10px] font-black text-slate-600 dark:text-slate-300">${who === 'me' ? 'Ty' : h.esc(h.name(player))}</span>`}</span>`;
        };
        const lane = `<span class="relative flex min-w-0 flex-1 ${align} px-1" data-bet-lane><span aria-hidden="true" class="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-gold-300 dark:border-gold-700"></span><span class="relative${compact ? ' scale-90' : ''}">${pileHtml()}</span></span>`;
        const delta = view.kind === 'draw' ? '' : `<span class="tabular-nums">${h.esc(formatDelta(view.delta))}</span>`;
        if (compact) {
            return `
            <div data-bet-result="${view.kind}" class="relative overflow-visible rounded-2xl bg-gradient-to-br from-gold-100 via-white to-gold-50 px-2.5 pb-2 pt-2.5 shadow-sm ring-2 ring-gold-300 dark:from-gold-900/50 dark:via-slate-800 dark:to-slate-800 dark:ring-gold-700">
                <div class="flex items-center">${person(me, 'me')}${lane}${person(other, 'other')}</div>
                <p data-bet-line class="mt-1 text-center text-[14px] font-black leading-tight ${tone}">${h.esc(compactLine(view))} ${delta}</p>
            </div>`;
        }
        return `
            <div data-bet-result="${view.kind}" class="relative overflow-visible rounded-2xl bg-gradient-to-br from-gold-100 via-white to-gold-50 p-2.5 shadow-sm ring-2 ring-gold-300 dark:from-gold-900/50 dark:via-slate-800 dark:to-slate-800 dark:ring-gold-700">
                <p class="text-center text-[11px] font-black uppercase tracking-widest text-gold-800 dark:text-gold-200">Sázka ${view.stake} XP</p>
                <div class="mt-1.5 flex items-center">${person(me, 'me')}${lane}${person(other, 'other')}</div>
                <p data-bet-line class="mt-1.5 text-center text-[16px] font-black leading-tight ${tone}">${h.esc(resultLine(view))} ${delta}</p>
                <p class="text-center text-[11.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${h.esc(resultSub(view))}</p>
            </div>`;
    };

    // Sázková bilance (profil hráče, okno Kamarádské sázky): +/− XP, výhry, prohry, remízy
    const balanceHtml = (stats, h, { label = 'Sázky' } = {}) => {
        const s = cleanStats(stats);
        if (!s.bets) return '';
        const tone = s.balance > 0 ? 'bg-emerald-600 text-white' : s.balance < 0 ? 'bg-rose-600 text-white' : 'bg-slate-500 text-white';
        const chip = (text, cls) => `<span class="rounded-lg px-2 py-0.5 text-[12px] font-black ${cls}">${h.esc(text)}</span>`;
        return `<div data-bet-balance class="flex flex-wrap items-center justify-center gap-1.5"><p class="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">${coinHtml('h-3.5 w-3.5')}${h.esc(label)}</p>${chip(formatDelta(s.balance), tone)}${chip(winsWord(s.wins), 'bg-gold-100 text-gold-900 dark:bg-gold-900/50 dark:text-gold-100')}${chip(lossesWord(s.losses), 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}</div>`;
    };

    // Okno Kamarádské sázky (pravidla, moje bilance a limit)
    const helpHtml = (overview, h) => {
        const POINT = 'flex gap-2 text-[13px] leading-snug text-slate-600 dark:text-slate-300';
        const DOT = '<span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500"></span>';
        const o = overview || null;
        const s = o ? o.stats : null;
        return `
            <div data-bet-help class="flex flex-col gap-3">
                <div class="flex items-center gap-3">${h.art(ART.owl, 'h-16 w-16 -my-1')}<p class="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">Ve výzvě kamarádovi můžeš vsadit trochu XP. Kdo vyhraje, bere si vklad.</p></div>
                <ul class="flex flex-col gap-1.5">
                    <li class="${POINT}">${DOT}<span>Vsadit jde <b class="text-slate-800 dark:text-slate-100">10, 25 nebo 50 XP</b>, nejvýš tolik, kolik máš z posledních 7 dní.</span></li>
                    <li class="${POINT}">${DOT}<span>Soupeř sázku přijme, nebo zvolí <b class="text-slate-800 dark:text-slate-100">Hrát bez sázky</b>.</span></li>
                    <li class="${POINT}">${DOT}<span>Až dohrajete oba, kdo vyhraje, vklad získá, a kdo prohraje, o něj přijde. Při remíze se nic nemění.</span></li>
                    <li class="${POINT}">${DOT}<span>Tvoje <b class="text-slate-800 dark:text-slate-100">úroveň nikdy neklesne</b>: odečte se jen to, co máš nad její hranicí.</span></li>
                </ul>
                ${o ? `<div class="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800" data-bet-mine>
                    ${s && s.bets ? balanceHtml(s, h, { label: 'Moje sázky' }) : '<p class="text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">Zatím žádná rozhodnutá sázka.</p>'}
                    <p class="mt-1.5 text-center text-[12px] font-bold text-gold-800 dark:text-gold-200">${h.esc(o.limit >= STAKES[0] ? `Teď můžeš vsadit až ${o.limit} XP.` : limitNote(o.limit))}</p>
                </div>` : ''}
            </div>`;
    };

    // --- Sypání mincí k vítězi: mince letí obloukem od poraženého k vítězi a cinkají; vítěz se zhoupne. Při omezeném pohybu nic (výsledek stojí). ---
    const pour = (panel, { reduced = false, sound = null, coins = 9 } = {}) => {
        if (!panel || typeof panel.animate !== 'function' || reduced) return false;
        const kind = panel.dataset.betResult;
        if (kind !== 'won' && kind !== 'lost') return false;
        const winner = panel.querySelector(`[data-bet-side="${kind === 'won' ? 'me' : 'other'}"]`);
        const loser = panel.querySelector(`[data-bet-side="${kind === 'won' ? 'other' : 'me'}"]`);
        const pile = panel.querySelector('[data-bet-pile]');
        if (!winner || !loser) return false;
        const box = panel.getBoundingClientRect();
        const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - box.left, y: r.top + Math.min(r.height, 44) / 2 - box.top }; };
        const from = center(loser);
        const to = center(winner);
        const doc = panel.ownerDocument;
        if (pile && pile.animate) pile.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 0, transform: 'scale(0.4)', offset: 0.55 }, { opacity: 1, transform: 'scale(1.12)', offset: 0.85 }, { opacity: 1, transform: 'scale(1)' }], { duration: 1500, easing: 'ease-out' });
        for (let i = 0; i < coins; i++) {
            const coin = doc.createElement('span');
            coin.className = 'bet-coin bet-flying h-5 w-5';
            coin.setAttribute('aria-hidden', 'true');
            coin.style.left = `${from.x - 10}px`;
            coin.style.top = `${from.y - 10}px`;
            panel.appendChild(coin);
            const dx = to.x - from.x + (i % 3 - 1) * 6;
            const dy = to.y - from.y + (i % 2) * 4;
            const lift = 34 + (i % 4) * 9;
            const flight = coin.animate([
                { transform: 'translate(0, 0) scale(0.6) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.15}px, ${dy * 0.15 - lift * 0.6}px) scale(1) rotate(90deg)`, opacity: 1, offset: 0.15 },
                { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(1.05) rotate(240deg)`, opacity: 1, offset: 0.55 },
                { transform: `translate(${dx}px, ${dy}px) scale(0.7) rotate(400deg)`, opacity: 0.9 }
            ], { duration: 820, delay: 120 + i * 85, easing: 'cubic-bezier(0.35, 0.1, 0.4, 1)', fill: 'backwards' });
            const done = () => coin.remove();
            flight.onfinish = done;
            flight.oncancel = done;
            setTimeout(done, 3000);
        }
        winner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14) rotate(-4deg)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 420, delay: 120 + coins * 85 + 500, easing: 'ease-out' });
        if (sound) setTimeout(() => sound('coins'), 260);
        return true;
    };

    // --- Server (Supabase REST, schéma 21): bez funkcí v databázi (404) se sázky v aplikaci schovají ---
    class BetsError extends Error { constructor(message, status) { super(message); this.status = status; } }
    const createApi = (env = {}) => {
        const win = env.window || root;
        let missing = false;
        const config = () => (win && win.MUDRLANT_CONFIG) || {};
        const call = async (name, body, retried = false) => {
            if (missing) return null;
            const auth = win && win.MudrlantAuth;
            const token = auth ? await auth.accessToken(retried) : null;
            if (!token) throw new BetsError('Přihlas se.', 401);
            const base = String(config().supabaseUrl || '').replace(/\/+$/, '');
            const response = await (env.fetch || win.fetch)(`${base}/rest/v1/rpc/${name}`, {
                method: 'POST', headers: { apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
            });
            if (response.status === 401 && !retried) return call(name, body, true);
            if (response.status === 404) { missing = true; return null; }
            if (!response.ok) {
                let detail = '';
                try { detail = String((await response.json()).message || ''); } catch (error) { /* bez těla */ }
                throw new BetsError(/[ěščřžýáíéúůďťň]/i.test(detail) ? detail : 'Sázku se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.', response.status);
            }
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        };
        return {
            missing: () => missing,
            stakes: async () => cleanOverview(await call('challenge_stakes', {})),
            offer: async (code, amount, taunt) => cleanRow(await call('challenge_offer_stake', { code, amount: cleanStake(amount), taunt_id: cleanTaunt(taunt) })),
            answer: async (code, accept) => cleanRow(await call('challenge_answer_stake', { code, accept: Boolean(accept) })),
            settle: async (code) => cleanRow(await call('challenge_settle_stake', { code })),
            stats: async (player) => { const data = await call('challenge_stake_stats', { player }); return data && typeof data === 'object' ? cleanStats(data) : null; }
        };
    };

    // --- Řízení v aplikaci: přehled mých sázek, automatické vyrovnání, sladění XP a odznaky ---
    // h = { api, user(), read(key), write(key, value), withProgress(task), applyXp(delta), floorOf(xp), setCounters({ bets, betBestRun }), paint(),
    //       notify(result) }
    const createController = (h) => {
        let data = null; // { userId, overview }
        let loading = null;
        const settling = new Set();
        const ledger = () => parseLedger(h.read(KEY));
        const saveLedger = (value) => h.write(KEY, value);
        const mine = (user = h.user()) => (user && data && data.userId === user.id ? data.overview : null);
        const rowFor = (code) => { const o = mine(); return o ? o.rows.find(row => row.id === code) || null : null; };
        const remember = (row) => {
            const o = mine();
            if (!o || !row) return;
            const at = o.rows.findIndex(item => item.id === row.id);
            if (at >= 0) o.rows[at] = { ...o.rows[at], ...row }; else o.rows.unshift(row);
        };
        const counters = (overview) => { if (overview) h.setCounters(countersFrom(overview.stats)); };
        // Vyrovnání jedné sázky (jen když je co): XP se v zařízení připíše hned, pod zámkem postupu (souběžné sladění by ho přepsalo)
        const settle = async (code) => {
            const user = h.user();
            if (!user || !isCode(code) || settling.has(code)) return null;
            settling.add(code);
            try {
                let result = null;
                await h.withProgress(async () => {
                    result = await h.api.settle(code);
                    if (!result || !result.fresh) return false;
                    const state = ledger();
                    state.users[user.id] = settledLocally(state.users[user.id], result);
                    saveLedger(state);
                    h.applyXp(result.delta || 0);
                    return true;
                });
                if (result) remember(result);
                if (result && result.fresh) {
                    const overview = await h.api.stakes().catch(() => null);
                    if (overview && h.user() && h.user().id === user.id) { data = { userId: user.id, overview }; counters(overview); }
                }
                return result;
            } finally { settling.delete(code); }
        };
        // Přehled po načtení výzev: dohrané a nevyrovnané sázky se vyrovnají (výhra oslavou, prohra krátkou zprávou)
        const refresh = async (user = h.user()) => {
            if (!user || h.api.missing()) return null;
            if (loading) return loading;
            loading = (async () => {
                try {
                    const overview = await h.api.stakes();
                    if (!overview || !h.user() || h.user().id !== user.id) return null;
                    data = { userId: user.id, overview };
                    counters(overview);
                    h.paint();
                    const due = overview.rows.filter(row => row.state === 'accepted' && row.outcome && !row.settled);
                    for (const row of due) {
                        const result = await settle(row.id).catch(() => null);
                        if (result && result.fresh) h.notify(result);
                    }
                    if (due.length) h.paint();
                    return mine(user);
                } catch (error) { return null; } finally { loading = null; }
            })();
            return loading;
        };
        // Sladění XP v zařízení před sloučením s účtem (syncProgress): vrátí nové XP zařízení
        const reconcileXp = (userId, xp, totals) => {
            if (!isId(userId) || !totals || totals.bet_won === undefined || totals.bet_lost === undefined) return xp;
            const state = ledger();
            const result = reconcile(state.users[userId], { won: totals.bet_won, lost: totals.bet_lost }, xp, h.floorOf);
            if (result.seen && (!state.users[userId] || state.users[userId].won !== result.seen.won || state.users[userId].lost !== result.seen.lost)) {
                state.users[userId] = result.seen;
                saveLedger(state);
            }
            return result.xp;
        };
        // Mince se u výsledku sypou jen jednou na zařízení
        const firstShow = (code) => {
            const state = ledger();
            if (state.shown.includes(code)) return false;
            state.shown = [...state.shown, code].slice(-80);
            saveLedger(state);
            return true;
        };
        return {
            refresh, settle, rowFor, remember, reconcileXp, firstShow, overview: () => mine(),
            limit: () => { const o = mine(); return o ? o.limit : null; },
            view: (code) => viewOf(rowFor(code)),
            available: () => !h.api.missing(),
            reset: () => { data = null; }
        };
    };

    return {
        ART, STAKES, MAX_STAKE, OFFER_DAYS, KEY, TAUNTS, STATES,
        cleanStake, cleanTaunt, tauntText, nextTaunt, formatDelta, betsWord, winsWord, lossesWord, drawsWord, stakeOptions, limitNote,
        cleanRow, cleanStats, cleanOverview, viewOf, reconcile, settledLocally, applyDelta, parseLedger, countersFrom,
        coinHtml, pileHtml, badgeHtml, pickerHtml, tauntBubble, offerHtml, statusText, statusHtml, resultLine, resultSub, resultHtml, balanceHtml, helpHtml, pour,
        BetsError, createApi, createController
    };
});
