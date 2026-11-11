// Ligové sezóny (schéma 18): sezóna = kalendářní měsíc podle pražského času, výsledek hráče = nejvyšší liga, které v měsíci dosáhl
// (počítá databáze z rating_history, funkce league_seasons). Za vrchol skončené sezóny Zlato, Platina, Diamant nebo Mistr má hráč rámeček
// profilu (look.js LEAGUE_FRAMES, liga-*); vyšší liga dává i rámečky nižších a rámeček zůstane navždy. Nejlepší liga se pamatuje v zařízení
// (KEY), takže rámečky platí i bez připojení a oslava nového rámečku přijde jen jednou.
// Čistá logika a HTML bez DOMu (jako rewards.js); okno Ligové sezóny, pruh na kartě ligy, oslavu a vitrínu napojuje app.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantRating || (isNode ? require('./rating.js') : null), root.MudrlantLook || (isNode ? require('./look.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantLeagueSeasons = api;
})(typeof self !== 'undefined' ? self : this, (Rating, Look) => {
    'use strict';
    const KEY = 'mudrlant.leagueSeasons';
    const LEAGUES = ['bronz', 'stribro', 'zlato', 'platina', 'diamant', 'mistr'];
    const NAMES = { bronz: 'Bronz', stribro: 'Stříbro', zlato: 'Zlato', platina: 'Platina', diamant: 'Diamant', mistr: 'Mistr' };
    // Odměny za vrchol skončené sezóny: liga → rámeček (look.js); genitive pro „Dosáhni Platiny…“
    const REWARDS = [
        { league: 'zlato', frame: 'liga-zlato', genitive: 'Zlata' },
        { league: 'platina', frame: 'liga-platina', genitive: 'Platiny' },
        { league: 'diamant', frame: 'liga-diamant', genitive: 'Diamantu' },
        { league: 'mistr', frame: 'liga-mistr', genitive: 'Mistra' }
    ];
    const FRAME_TITLES = { 'liga-zlato': 'Zlatá sezóna', 'liga-platina': 'Platinová sezóna', 'liga-diamant': 'Diamantová sezóna', 'liga-mistr': 'Mistrovská sezóna' };
    const frameTitle = (frame) => { const item = Look && Look.find ? Look.find('frames', frame) : null; return item ? item.title : (FRAME_TITLES[frame] || frame); };
    const leagueName = (id) => NAMES[id] || '';
    const rank = (league) => LEAGUES.indexOf(league);
    const higher = (a, b) => (rank(a) >= rank(b) ? a : b);
    const leagueFrom = (league) => (Rating && Rating.leagueById ? Rating.leagueById(league).from : { zlato: 1250, platina: 1400, diamant: 1550, mistr: 1700 }[league]);

    // --- Měsíce podle pražského času ---
    const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
    const MONTHS_OF = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
    const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
    const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
    const isMonth = (value) => typeof value === 'string' && MONTH.test(value);
    const pad = (n) => String(n).padStart(2, '0');
    let pragueFormat = null;
    // Den v Praze { year, month, day }; prohlížeč bez časových pásem vezme místní čas
    const pragueDate = (now = new Date()) => {
        try {
            pragueFormat = pragueFormat || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: 'numeric', day: 'numeric' });
            const parts = Object.fromEntries(pragueFormat.formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
            if (parts.year && parts.month && parts.day) return { year: parts.year, month: parts.month, day: parts.day };
        } catch (e) { /* bez časových pásem */ }
        return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    };
    const monthOf = (now = new Date()) => { const d = pragueDate(now); return `${d.year}-${pad(d.month)}`; };
    const addMonths = (month, count) => {
        const m = MONTH.exec(String(month));
        if (!m) return '';
        const index = Number(m[1]) * 12 + Number(m[2]) - 1 + count;
        return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
    };
    // Kolik dní sezóny zbývá včetně dneška (poslední den měsíce = 1)
    const daysLeft = (now = new Date()) => { const d = pragueDate(now); return new Date(Date.UTC(d.year, d.month, 0)).getUTCDate() - d.day + 1; };
    const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
    const leftText = (n) => (n <= 1 ? 'poslední den' : `ještě ${plural(n, 'den', 'dny', 'dní')}`);
    const monthIndex = (month) => Number(MONTH.exec(month)[2]) - 1;
    const monthName = (month) => (isMonth(month) ? MONTHS[monthIndex(month)] : '');
    const monthLabel = (month) => (isMonth(month) ? `${MONTHS[monthIndex(month)]} ${month.slice(0, 4)}` : '');
    const monthOfName = (month) => (isMonth(month) ? MONTHS_OF[monthIndex(month)] : '');
    const monthShort = (month) => (isMonth(month) ? MONTHS_SHORT[monthIndex(month)] : '');

    // --- Odpověď serveru (league_seasons) ---
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    // { month: běžící měsíc, seasons: [{ month, league, peak, games, finished }] nejnovější první (běžící a 12 skončených), best } nebo null
    const clean = (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isMonth(raw.month)) return null;
        const oldest = addMonths(raw.month, -12);
        const seen = new Set();
        const seasons = (Array.isArray(raw.seasons) ? raw.seasons : [])
            .filter(row => row && isMonth(row.month) && LEAGUES.includes(row.league) && row.month <= raw.month && row.month >= oldest && !seen.has(row.month) && seen.add(row.month))
            .map(row => ({ month: row.month, league: row.league, peak: whole(row.peak, 5000), games: whole(row.games, 100000), finished: row.month < raw.month }))
            .sort((a, b) => b.month.localeCompare(a.month));
        const b = raw.best;
        const best = b && typeof b === 'object' && isMonth(b.month) && LEAGUES.includes(b.league) && b.month < raw.month ? { month: b.month, league: b.league, peak: whole(b.peak, 5000) } : null;
        return { month: raw.month, seasons, best };
    };
    const currentSeason = (data) => (data ? data.seasons.find(row => row.month === data.month) || null : null);
    const seasonOf = (data, month) => (data ? data.seasons.find(row => row.month === month && row.finished) || null : null);
    // Posledních count skončených měsíců (nejnovější první) se sezónou, nebo null, když hráč v měsíci nehrál
    const history = (data, count = 12) => (data ? Array.from({ length: count }, (_, i) => { const month = addMonths(data.month, -1 - i); return { month, season: seasonOf(data, month) }; }) : []);

    // --- Uložený stav v zařízení: nejlepší liga skončené sezóny (rámečky platí i bez připojení), poslední odpověď serveru a čí byla ---
    const ID = /^[0-9a-zA-Z-]{1,40}$/;
    const parseCache = (raw) => {
        const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        return {
            v: 1, best: LEAGUES.includes(c.best) ? c.best : null, bestMonth: isMonth(c.bestMonth) ? c.bestMonth : null,
            user: typeof c.user === 'string' && ID.test(c.user) ? c.user : null, data: clean(c.data), at: whole(c.at, 1e13)
        };
    };
    const cachedBest = (raw) => parseCache(raw).best;
    // Sezóny přihlášeného hráče z uloženého stavu (jiný účet = nic)
    const cachedData = (raw, user) => { const c = parseCache(raw); return c.user && c.user === user ? c.data : null; };
    // Nová odpověď serveru: nejlepší liga se jen zvyšuje; fresh = nově odemčené odměny k oslavě (nejvyšší první). Na zařízení, které o sezónách
    // zatím nic neví, se slaví jen úspěch z právě skončené sezóny (starší rámečky se odemknou potichu).
    const adopt = (raw, response, user, now = Date.now()) => {
        const cache = parseCache(raw);
        const data = clean(response);
        if (!data) return { cache, fresh: [] };
        const known = cache.best;
        const best = higher(known, data.best ? data.best.league : null);
        const bestMonth = data.best && data.best.league === best ? data.best.month : cache.bestMonth;
        let fresh = REWARDS.filter(reward => rank(reward.league) > rank(known) && rank(reward.league) <= rank(best));
        if (!cache.data && !known && !(data.best && data.best.month === addMonths(data.month, -1))) fresh = [];
        return { cache: { v: 1, best, bestMonth, user: ID.test(String(user || '')) ? String(user) : null, data, at: whole(now, 1e13) }, fresh: fresh.reverse() };
    };
    const unlockedFrames = (best) => REWARDS.filter(reward => rank(best) >= rank(reward.league)).map(reward => reward.frame);

    // Co dál: secured = rámečky, které hráč dostane po konci běžící sezóny (vrchol měsíce už na ně stačí), next = nejbližší další odměna,
    // need = kolik bodů ratingu do její ligy chybí (z ratingu teď; null bez ratingu)
    const goal = (data, best, rating) => {
        const current = currentSeason(data);
        const pending = current ? current.league : null;
        const secured = REWARDS.filter(reward => rank(reward.league) > rank(best) && rank(reward.league) <= rank(pending));
        const next = REWARDS.find(reward => rank(reward.league) > Math.max(rank(best), rank(pending))) || null;
        const value = Math.floor(Number(rating));
        const need = next && rating !== null && rating !== undefined && Number.isFinite(value) ? Math.max(0, leagueFrom(next.league) - value) : null;
        return { current, secured, next, need };
    };
    const securedText = (g, month) => {
        const top = g.secured[g.secured.length - 1];
        return top ? `Rámeček ${frameTitle(top.frame)} máš jistý, dostaneš ho 1. ${MONTHS_OF[monthIndex(addMonths(month, 1))]}.` : '';
    };
    const nextText = (g, month) => (g.next
        ? `Dosáhni ${g.next.genitive} do konce ${monthOfName(month)} a získáš rámeček ${frameTitle(g.next.frame)}.`
        : 'Máš všechny rámečky ligových sezón. Mistra můžeš obhajovat každý měsíc.');

    // --- HTML (pomocníci h od app.js: esc, emblem(liga, cls), frameAvatar(rámeček, cls)) ---
    const HEADING = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    // Pruh pod kartou ligy (Více hráčů): sezóna, kolik dní zbývá a co je další odměna; klepnutí otevře okno Ligové sezóny
    const stripHtml = ({ data, best, rating, now = new Date() }, h) => {
        const g = goal(data, best, rating);
        const top = g.secured[g.secured.length - 1] || g.next;
        const line = g.secured.length ? `Rámeček ${frameTitle(top.frame)} máš jistý` : g.next ? `Dosáhni ${g.next.genitive} a získáš rámeček` : 'Máš všechny rámečky sezón';
        const head = `Ligová sezóna ${monthName(data.month)} · ${leftText(daysLeft(now))}`;
        return `<button type="button" data-action="league-seasons" aria-label="${h.esc(`Ligové sezóny: ${head}. ${line}`)}" class="flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl bg-gold-50 px-2 py-1 text-left ring-1 ring-gold-300/70 active:scale-[0.98] dark:bg-slate-900/60 dark:ring-gold-700/60" data-league-strip>
            <span class="flex h-8 w-8 shrink-0 items-center justify-center">${top ? h.frameAvatar(top.frame, 'h-7 w-7 text-sm') : h.emblem('mistr', 'h-8 w-8')}</span>
            <span class="min-w-0 flex-1"><span class="block text-[12px] font-black leading-tight text-slate-800 dark:text-slate-100">${h.esc(head)}</span><span class="block text-[11px] font-bold leading-tight text-gold-800 dark:text-gold-300">${h.esc(line)}</span></span>
            <i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-gold-800 dark:text-gold-300"></i>
        </button>`;
    };
    // Okno Ligové sezóny: běžící sezóna (vrchol zatím, kolik dní zbývá, další odměna), rámečky za sezóny a minulé sezóny s vystavením do vitríny.
    // view = { data, best, rating, now, selected: měsíc vybrané minulé sezóny, showcase: { on(entry), count, busy } | null (vitrína není) }
    const dialogHtml = ({ data, best, rating, now = new Date(), selected = null, showcase = null }, h) => {
        const g = goal(data, best, rating);
        const cur = g.current;
        const left = daysLeft(now);
        const top = g.secured[g.secured.length - 1] || g.next;
        const advice = [securedText(g, data.month), nextText(g, data.month), g.next && g.need ? `Chybí ti ${plural(g.need, 'bod', 'body', 'bodů')} ratingu.` : ''].filter(Boolean).join(' ');
        const now_ = `
            <section data-season-now class="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-3 text-white shadow-sm short:p-2.5">
                <div class="flex items-center gap-3">
                    <span class="flex h-14 w-14 shrink-0 items-center justify-center short:h-12 short:w-12">${cur ? h.emblem(cur.league, 'h-full w-full') : h.emblem('bronz', 'h-full w-full opacity-40 grayscale')}</span>
                    <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">Ligová sezóna ${h.esc(monthLabel(data.month))}</p>
                        <p class="text-lg font-black leading-tight" data-season-peak>${cur ? `Nejvýš zatím: ${h.esc(leagueName(cur.league))}` : 'Zatím bez výsledku'}</p>
                        <p class="text-[12px] font-semibold leading-snug text-white/85">${cur ? `${cur.peak} · ${plural(cur.games, 'výzva', 'výzvy', 'výzev')} · ` : 'Zahraj výzvu proti jinému hráči · '}${h.esc(leftText(left))}</p>
                    </div>
                </div>
                <div class="mt-2.5 flex items-center gap-2.5 rounded-xl bg-white/10 p-2 short:mt-2" data-season-goal>
                    <span class="flex h-12 w-12 shrink-0 items-center justify-center">${top ? h.frameAvatar(top.frame, 'h-10 w-10 text-xl') : h.emblem('mistr', 'h-11 w-11')}</span>
                    <p class="min-w-0 flex-1 text-[12.5px] font-bold leading-snug">${h.esc(advice)}</p>
                </div>
            </section>`;
        const rewards = `
            <section>
                <h3 class="${HEADING} mb-1 px-0.5">Rámečky za vrchol sezóny</h3>
                <ul class="grid grid-cols-4 gap-1.5">${REWARDS.map(reward => {
                    const earned = rank(best) >= rank(reward.league);
                    return `<li data-season-reward="${reward.league}" ${earned ? 'data-earned' : ''} class="flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 pb-1 pt-2 shadow-sm ${earned ? 'bg-gold-50 ring-2 ring-gold-400 dark:bg-slate-800' : 'bg-white dark:bg-slate-800'}" title="${h.esc(frameTitle(reward.frame))}">
                        <span class="flex h-11 w-11 items-center justify-center short:h-10 short:w-10 ${earned ? '' : 'opacity-50 grayscale'}">${h.frameAvatar(reward.frame, 'h-9 w-9 text-lg')}</span>
                        <span class="mt-0.5 text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">${leagueName(reward.league)}</span>
                        <span class="flex items-center gap-0.5 text-[10px] font-bold leading-tight short:sr-only ${earned ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}"><i data-lucide="${earned ? 'check' : 'lock'}" class="h-3 w-3"></i>${earned ? 'Máš' : 'Zamčeno'}</span>
                    </li>`;
                }).join('')}</ul>
            </section>`;
        const past = history(data);
        const tiles = past.map(({ month, season }) => {
            const shown = Boolean(season && showcase && showcase.on(`l:${month}:${season.league}`));
            return `<li><button type="button" data-season-month="${month}" ${season ? '' : 'disabled'} aria-pressed="${selected === month}" aria-label="${h.esc(`${monthLabel(month)}: ${season ? leagueName(season.league) : 'bez výsledku'}`)}"
                class="relative flex w-full flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 pt-1.5 ${season ? 'bg-white shadow-sm active:scale-95 dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-800/50'} ${selected === month ? 'ring-2 ring-brand-600' : ''}">
                ${season ? h.emblem(season.league, 'h-7 w-7') : '<span class="flex h-7 w-7 items-center justify-center text-sm font-black text-slate-400 dark:text-slate-500">–</span>'}
                <span class="text-[10px] font-bold leading-none ${season ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}">${monthShort(month)}</span>
                ${shown ? '<span class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-brand-950 ring-2 ring-slate-50 dark:ring-slate-900" data-season-shown><i data-lucide="gem" class="h-2.5 w-2.5"></i></span>' : ''}
            </button></li>`;
        }).join('');
        const pick = selected ? seasonOf(data, selected) : null;
        const played = past.filter(item => item.season).length;
        const detail = pick
            ? `<div data-season-detail="${selected}" class="flex min-h-[3rem] items-center gap-2 rounded-xl bg-white p-1.5 pl-2 shadow-sm dark:bg-slate-800">
                ${h.emblem(pick.league, 'h-9 w-9')}
                <p class="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-slate-600 dark:text-slate-300"><b class="block text-[13px] font-black capitalize text-slate-800 dark:text-slate-100">${h.esc(monthLabel(selected))}: ${h.esc(leagueName(pick.league))}</b>${pick.peak} · ${plural(pick.games, 'výzva', 'výzvy', 'výzev')}</p>
                ${showcase ? showcase.toggle(`l:${selected}:${pick.league}`) : ''}
            </div>`
            : `<p data-season-detail class="flex min-h-[3rem] items-center rounded-xl px-1 text-[12px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${played
                ? (showcase ? 'Klepni na minulou sezónu a můžeš ji vystavit ve svém profilu.' : 'Klepni na minulou sezónu a uvidíš její výsledek.')
                : 'Minulé sezóny tu přibudou, až odehraješ výzvy proti jiným hráčům.'}</p>`;
        return `
            <div class="flex flex-col gap-3 short:gap-2" data-league-seasons>
                ${now_}
                ${rewards}
                <section>
                    <h3 class="${HEADING} mb-1 px-0.5">Minulé sezóny</h3>
                    <ol class="grid grid-cols-6 gap-1">${tiles}</ol>
                </section>
                ${detail}
            </div>`;
    };

    return {
        KEY, LEAGUES, REWARDS, rank, leagueName, frameTitle, monthOf, addMonths, daysLeft, leftText, monthName, monthLabel, monthOfName, monthShort, isMonth,
        clean, currentSeason, seasonOf, history, parseCache, cachedBest, cachedData, adopt, unlockedFrames, goal, securedText, nextText, stripHtml, dialogHtml
    };
});
