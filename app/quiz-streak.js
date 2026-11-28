// Přehled série Kvízu dne: obyčejný měsíční kalendář (šipkami po měsících s daty, nejdál dnešní) s tím, jak který den dopadl: odehrané dny
// jako souvislý pás (současná série zlatě), zachráněno ochranou (štít), vynecháno (jemně červeně s ×), dnes orámovaný, bez záznamu a budoucí
// šedě; nahoře současná a nejdelší série a ochrany, po klepnutí na den krátký řádek s časem dohrání a výsledkem. Uživatel 26. 11. 2026:
// předchozí podoba (mřížka týdnů jako heatmapa, dlouhé texty) byla nepřehledná.
// Hráč si tak může sám ověřit, proč má sérii, jakou má (hlášení 26. 11. 2026: „myslel jsem, že jsem včera hrál, a přišel jsem o sérii“).
// Zdroje: odehrané dny tohoto zařízení (mudrlant.dailyQuiz, daily-quiz.js; čas dohrání od 27. 11. 2026), řádky přihlášeného hráče
// v účtu (daily_quiz_results, schéma 7: začátek, poslední odpověď a dohrání podle serveru) a zachráněné dny (rewards.js frozen a frozenQuiz,
// synchronizované s účtem) s časem použití ochrany z mudrlant.freezeLog (od 27. 11. 2026). Série se počítá ze sjednocení zařízení a účtu
// stejně jako DailyQuiz.streakOf: den se počítá, když je odehraný aspoň kus kvízu (dnešek jen dohraný), zachráněný den sérii nepřeruší.
// Den bez záznamu před prvním známým kvízem (nebo když se účet nenačetl) je „bez záznamu“, ne „vynechaný“.
// Čistá logika bez DOMu a sítě + HTML okna; app.js načte data a napojí klepnutí. Testy: tests/quiz-streak.test.js, tests/e2e-quiz-streak.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantQuizStreak = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const QUESTIONS = 10;
    const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => DAY.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
    // Pondělí týdne
    const weekOf = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const daysWord = (count) => plural(count, 'den', 'dny', 'dní');
    const WEEKDAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
    const formatDay = (day) => { const m = DAY.exec(String(day || '')); return m ? `${Number(m[3])}. ${Number(m[2])}.` : ''; };
    const weekdayOf = (day) => WEEKDAYS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7];
    const longDay = (day) => `${weekdayOf(day)} ${formatDay(day)}`;

    // Čas v Praze (den kvízu je pražský): { day: 'RRRR-MM-DD', time: 'H:MM' } z ms nebo z ISO textu serveru
    let pragueFormat = null;
    try { pragueFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) { /* bez Intl UTC */ }
    const toMs = (value) => (typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN);
    const pragueClock = (value) => {
        const ms = toMs(value);
        if (!Number.isFinite(ms) || ms <= 0) return null;
        if (pragueFormat) {
            try {
                const parts = Object.fromEntries(pragueFormat.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
                const day = `${parts.year}-${parts.month}-${parts.day}`;
                if (isDay(day)) return { day, time: `${Number(parts.hour) % 24}:${parts.minute}` };
            } catch (e) { /* neplatné datum */ }
        }
        const iso = new Date(ms).toISOString();
        return { day: iso.slice(0, 10), time: `${Number(iso.slice(11, 13))}:${iso.slice(14, 16)} UTC` };
    };

    // --- Sloučení záznamů zařízení a účtu ---
    // local = days z mudrlant.dailyQuiz ({ den: { answered, correct, score, time_ms, done, at? } }), server = řádky daily_quiz_results
    // ([{ day, answered, correct, score, time_ms, started_at, last_at, finished_at }]) nebo null (host, účet se nenačetl).
    // Vrátí { den: { answered, correct, score, time_ms, done, at (ms dohrání nebo poslední odpovědi), atDone, device, account } }
    const merge = (local, server) => {
        const clean = (row) => {
            const answered = whole(row.answered, QUESTIONS);
            return { answered, correct: whole(row.correct, QUESTIONS), score: whole(row.score, 40), time_ms: whole(row.time_ms, 36000000), done: answered >= QUESTIONS || (Boolean(row.done) && answered > 0) };
        };
        const found = {};
        for (const [day, row] of Object.entries(local && typeof local === 'object' ? local : {})) if (isDay(day) && row && typeof row === 'object') (found[day] = found[day] || {}).device = row;
        for (const row of Array.isArray(server) ? server : []) if (row && isDay(row.day)) (found[row.day] = found[row.day] || {}).account = row;
        const out = {};
        for (const [day, { device, account }] of Object.entries(found)) {
            const d = device ? clean(device) : null;
            const a = account ? clean(account) : null;
            // Víc odpovědí vyhrává (při shodě účet: jeho čas a body měří server)
            const useAccount = a && (!d || a.answered >= d.answered);
            const base = useAccount ? a : d;
            const at = useAccount ? toMs(account.finished_at || account.last_at) : toMs(device.at);
            out[day] = { ...base, done: Boolean((d && d.done) || (a && a.done)), at: Number.isFinite(at) && at > 0 ? at : null,
                atDone: useAccount ? Boolean(account.finished_at) : Boolean(d.done), device: Boolean(d), account: Boolean(a) };
        }
        return out;
    };
    // Dny, které se počítají do série: odehraný aspoň kus (dnešek jen dohraný) – stejně jako DailyQuiz.playedDays a daily_quiz_streaks
    const playedOf = (days, today) => Object.keys(days).filter(day => day <= today && days[day].answered > 0 && (day !== today || days[day].done)).sort();
    // Odehrané dny účtu (pro sérii ze sjednocení zařízení a účtu)
    const serverPlayed = (rows, today) => playedOf(merge(null, rows), today);

    // Série k dnešku: dnešek se počítá, jen když je odehraný; přes zachráněné dny pokračuje, do délky se nepočítají (= DailyQuiz.streakOf)
    const currentOf = (played, saved, today) => {
        let day = played.has(today) ? today : addDays(today, -1);
        let count = 0;
        for (let guard = 0; guard < 4000 && (played.has(day) || saved.has(day)); guard++) { if (played.has(day)) count += 1; day = addDays(day, -1); }
        return count;
    };
    // Souvislé úseky série (od nejnovějšího): { from, to, length (odehrané dny), saved: [zachráněné dny uvnitř] }; zachráněný den úsek spojí
    const runsOf = (played, saved) => {
        const sorted = [...played].sort();
        const runs = [];
        let run = null;
        for (const day of sorted) {
            if (run) {
                const gap = [];
                let cursor = addDays(run.to, 1);
                for (let guard = 0; guard < 400 && cursor < day && saved.has(cursor); guard++) { gap.push(cursor); cursor = addDays(cursor, 1); }
                if (cursor === day) { run.to = day; run.length += 1; run.saved.push(...gap); continue; }
                runs.push(run);
            }
            run = { from: day, to: day, length: 1, saved: [] };
        }
        if (run) runs.push(run);
        return runs.reverse();
    };

    // --- Přehled ---
    // input: { today, local (days ze zařízení), server (řádky účtu | null), account: 'none' (host) | 'ok' | 'failed' (účet se nenačetl),
    //   'loading' (účet se načítá; dny bez záznamu jako u failed), frozen (zachráněné dny pro Kvíz dne), log (mudrlant.freezeLog: [{ day, at? }]), serverBest (nejlepší série podle serveru) }
    // Stav dne: done (dohráno), partial (rozehráno, počítá se), saved (zachráněno ochranou), missed (vynecháno), unknown (bez záznamu),
    // today (dnes ještě nehráno), progress (dnes rozehráno), null = budoucí den
    const build = (input = {}) => {
        const today = isDay(input.today) ? input.today : new Date().toISOString().slice(0, 10);
        const account = ['ok', 'failed', 'loading'].includes(input.account) ? input.account : 'none';
        const days = merge(input.local, account === 'ok' ? input.server : null);
        // Ze zachráněných dnů se počítají jen ty, které nejsou odehrané a nejsou v budoucnosti
        const saved = new Set((Array.isArray(input.frozen) ? input.frozen : []).filter(day => isDay(day) && day < today && !(days[day] && days[day].answered > 0)));
        const playedList = playedOf(days, today);
        const played = new Set(playedList);
        const known = [...Object.keys(days).filter(day => days[day].answered > 0 && day <= today), ...saved].sort();
        const first = known[0] || '';
        const usedAt = {};
        for (const entry of Array.isArray(input.log) ? input.log : []) if (entry && isDay(entry.day) && Number.isFinite(entry.at) && !usedAt[entry.day]) usedAt[entry.day] = entry.at;
        const runs = runsOf(played, saved);
        const current = currentOf(played, saved, today);
        // Dny současné série (odehrané i zachráněné), v kalendáři zlatě
        const currentDays = new Set();
        if (current) for (let day = played.has(today) ? today : addDays(today, -1), guard = 0; guard < 4000 && (played.has(day) || saved.has(day)); guard++, day = addDays(day, -1)) currentDays.add(day);
        const best = Math.max(current, whole(input.serverBest, 100000), ...runs.map(run => run.length));
        const statusOf = (day) => {
            if (!isDay(day) || day > today) return null;
            const entry = days[day];
            if (day === today) return entry && entry.done ? 'done' : entry && entry.answered > 0 ? 'progress' : 'today';
            if (entry && entry.answered > 0) return entry.done ? 'done' : 'partial';
            if (saved.has(day)) return 'saved';
            // Bez záznamu: před prvním známým dnem, nebo přihlášený hráč, jehož účet se nenačetl (mohl hrát na jiném zařízení)
            if (!first || day < first || account === 'failed' || account === 'loading') return 'unknown';
            return 'missed';
        };
        // Měsíce kalendáře: od měsíce prvního záznamu po dnešní (nejvýš 6 zpět, víc dní zařízení ani účet nedrží)
        const months = [];
        const last = today.slice(0, 7);
        for (let month = first ? first.slice(0, 7) : last, guard = 0; month <= last && guard < 24; guard++) {
            months.push(month);
            const [y, m] = month.split('-').map(Number);
            month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
        }
        return { today, account, days, saved: [...saved].sort(), usedAt, played: playedList, first, runs, current, currentDays, best, months: months.slice(-6), statusOf };
    };

    // Den v pásu série: odehraný (dnešek dohraný) nebo zachráněný; pás spojí sousední dny stejné barvy (současná série zlatě)
    const BANDED = new Set(['done', 'partial', 'saved']);
    const bandOf = (view, day) => {
        const status = view.statusOf(day);
        if (!BANDED.has(status)) return '';
        return view.currentDays.has(day) ? 'current' : 'played';
    };
    // Mřížka měsíce RRRR-MM: týdny (Po–Ne) po 7 buňkách, null = den mimo měsíc; buňka { day, n (číslo dne), status, band, broke, joinLeft, joinRight }
    const monthGrid = (view, month) => {
        const firstDay = `${month}-01`;
        if (!isDay(firstDay)) return [];
        const rows = [];
        for (let start = weekOf(firstDay); start.slice(0, 7) <= month && rows.length < 6; start = addDays(start, 7)) {
            rows.push(Array.from({ length: 7 }, (_, d) => {
                const day = addDays(start, d);
                if (day.slice(0, 7) !== month) return null;
                const band = bandOf(view, day);
                const prev = addDays(day, -1);
                const next = addDays(day, 1);
                const status = view.statusOf(day);
                // Vynechaný den hned po odehraném (tady série skončila) dostane × a kroužek; další vynechané dny jen červené číslo (méně šumu)
                return { day, n: Number(day.slice(8)), status, band, broke: status === 'missed' && BANDED.has(view.statusOf(prev)),
                    joinLeft: Boolean(band) && d > 0 && prev.slice(0, 7) === month && bandOf(view, prev) === band,
                    joinRight: Boolean(band) && d < 6 && next.slice(0, 7) === month && bandOf(view, next) === band };
            }));
        }
        return rows;
    };
    const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
    const monthTitle = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

    // Detail dne pod kalendářem: jen krátce, co se ten den stalo („St 25. 11. · vynecháno“, „Čt 26. 11. · 18:17 · 7/10, 28 b“)
    // Kdy: „18:17“, nebo s datem, když to bylo jiný den
    const whenText = (day, at) => {
        const clock = pragueClock(at);
        if (!clock) return '';
        return clock.day === day ? clock.time : `${formatDay(clock.day)} ${clock.time}`;
    };
    const dayDetail = (view, day) => {
        const status = view.statusOf(day);
        const entry = view.days[day];
        const title = longDay(day).replace(/^./, char => char.toUpperCase());
        const when = entry && entry.at ? whenText(day, entry.at) : '';
        let parts = [];
        if (status === 'done') parts = [entry.atDone ? when : '', `${entry.correct}/${QUESTIONS}, ${entry.score} b`];
        else if (status === 'partial') parts = [`rozehráno ${entry.answered}/${QUESTIONS}, počítá se`];
        else if (status === 'saved') parts = ['zachráněno ochranou'];
        else if (status === 'missed') parts = ['vynecháno'];
        else if (status === 'unknown') parts = [view.account === 'loading' ? 'načítám účet…' : view.account === 'failed' ? 'bez záznamu, účet se nenačetl' : 'bez záznamu'];
        else if (status === 'progress') parts = [`rozehráno ${entry.answered}/${QUESTIONS}, dohraj do půlnoci`];
        else if (status === 'today') parts = ['ještě nehráno'];
        const text = parts.filter(Boolean).join(' · ');
        return { day, status, title, text, line: status ? `${title} · ${text}` : '' };
    };

    // --- HTML okna ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const STATUS = {
        done: 'Dohráno', partial: 'Rozehráno, počítá se', saved: 'Zachráněno ochranou série', missed: 'Vynecháno', unknown: 'Bez záznamu',
        today: 'Dnes ještě nehráno', progress: 'Dnes rozehráno'
    };
    // Barvy: pás série (zlatá = současná, tlumená barva hábitu = starší), vynechaný den jemně červeně (kde série skončila, s × a kroužkem),
    // bez záznamu šedě
    const BAND = {
        current: 'bg-amber-300 text-amber-950 dark:bg-amber-400 dark:text-amber-950',
        played: 'bg-brand-200 text-brand-900 dark:bg-brand-800 dark:text-brand-50'
    };
    const INNER = {
        missed: 'text-rose-700 dark:text-rose-300',
        unknown: 'text-slate-500 dark:text-slate-400',
        today: 'text-slate-800 dark:text-slate-100',
        progress: 'text-slate-800 dark:text-slate-100'
    };
    const shieldImg = (cls) => `<img src="icons/topics/ochrana-serie.webp" alt="" class="${cls} object-contain">`;
    const cellHtml = (cell, selected, today) => {
        if (!cell) return '<span aria-hidden="true"></span>';
        if (!cell.status) return `<span aria-hidden="true" class="flex h-8 items-center justify-center text-[13px] font-semibold text-slate-300 short:h-7 dark:text-slate-600">${cell.n}</span>`;
        const band = cell.band ? `${BAND[cell.band]} ${cell.joinLeft ? '' : 'rounded-l-full'} ${cell.joinRight ? '' : 'rounded-r-full'}` : '';
        const ring = cell.day === today ? ' ring-2 ring-inset ring-slate-800 dark:ring-slate-100' : '';
        const pick = cell.day === selected ? ' outline outline-2 outline-offset-1 outline-sky-500' : '';
        const badge = cell.status === 'saved' ? shieldImg('absolute -right-1.5 -top-1 h-4 w-4')
            : cell.broke ? '<span aria-hidden="true" class="absolute -right-1 -top-1 text-[10px] font-black leading-none text-rose-600 dark:text-rose-300">×</span>' : '';
        const broke = cell.broke ? ' ring-1 ring-inset ring-rose-400 dark:ring-rose-400/80' : '';
        const label = `${longDay(cell.day)}: ${STATUS[cell.status]}${cell.band === 'current' ? ', současná série' : ''}${cell.day === today ? ', dnes' : ''}`;
        return `<button type="button" data-qs-day="${cell.day}" data-qs-status="${cell.status}" data-qs-band="${cell.band}" aria-pressed="${cell.day === selected}" aria-label="${esc(label)}" class="flex h-8 w-full items-center justify-center short:h-7 ${band}"><span class="relative flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold leading-none short:h-6 short:w-6 ${cell.band ? '' : INNER[cell.status] || ''}${broke}${ring}${pick}">${cell.n}${badge}</span></button>`;
    };
    const WEEK_HEAD = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const swatch = (cls) => `<span class="inline-block h-2.5 w-4 rounded-full ${cls}"></span>`;
    // view = build(...), month = zobrazený měsíc RRRR-MM, selected = vybraný den (jen v zobrazeném měsíci), freezes = ochrany k mání (0–2), max = strop
    const dialogHtml = (view, { month = view.today.slice(0, 7), selected = view.today, freezes = 0, max = 2 } = {}) => {
        const shown = view.months.includes(month) ? month : view.months[view.months.length - 1];
        const at = view.months.indexOf(shown);
        const prev = at > 0 ? view.months[at - 1] : '';
        const next = at < view.months.length - 1 ? view.months[at + 1] : '';
        const pick = selected && selected.slice(0, 7) === shown && view.statusOf(selected) ? selected : '';
        const detail = pick ? dayDetail(view, pick) : null;
        const rows = monthGrid(view, shown);
        const arrow = (target, icon, label) => `<button type="button" ${target ? `data-qs-month="${target}"` : 'disabled'} aria-label="${label}" class="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 disabled:opacity-25 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="${icon}" class="h-5 w-5"></i></button>`;
        const source = view.account === 'loading' ? ' Načítám účet…' : view.account === 'failed' ? ' Účet se nenačetl, ukazuji toto zařízení.' : '';
        const chip = (cls, label, value, attr) => `<p class="rounded-xl px-0.5 py-1 font-bold ${cls}">${label} <b class="text-[13px]" ${attr}>${esc(value)}</b></p>`;
        return `
            <div class="flex flex-col gap-2 text-[13px] leading-snug text-slate-700 short:gap-1.5 dark:text-slate-200" data-quiz-streak-view>
                <div class="grid grid-cols-3 gap-1.5 whitespace-nowrap text-center text-[11.5px] leading-tight" data-qs-summary>
                    ${chip('bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100', 'Teď', daysWord(view.current), 'data-qs-current')}
                    ${chip('bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100', 'Nejdelší', daysWord(view.best), 'data-qs-best')}
                    ${chip('bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100', 'Ochrana', `${freezes} z ${max}`, 'data-qs-freezes')}
                </div>
                <div class="rounded-2xl bg-white px-2 pb-2 pt-1 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70" data-qs-calendar data-qs-shown="${shown}">
                    <div class="flex items-center justify-between">
                        ${arrow(prev, 'chevron-left', 'Předchozí měsíc')}
                        <p class="text-[15px] font-black text-slate-800 dark:text-slate-100" data-qs-month-title aria-live="polite">${esc(monthTitle(shown))}</p>
                        ${arrow(next, 'chevron-right', 'Další měsíc')}
                    </div>
                    <div class="grid grid-cols-7 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400" aria-hidden="true">${WEEK_HEAD.map(day => `<span>${day}</span>`).join('')}</div>
                    <div class="mt-1 grid grid-cols-7 gap-y-1" role="group" aria-label="${esc(`Kvíz dne, ${monthTitle(shown)}`)}">${rows.map(row => row.map(cell => cellHtml(cell, pick, view.today)).join('')).join('')}</div>
                    <p class="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 whitespace-nowrap text-[11px] font-semibold text-slate-500 dark:text-slate-400" aria-hidden="true" data-qs-legend>
                        <span class="inline-flex items-center gap-0.5">${swatch(BAND.current)}série</span>
                        <span class="inline-flex items-center gap-0.5">${swatch(BAND.played)}odehráno</span>
                        <span class="inline-flex items-center gap-0.5">${shieldImg('h-3 w-3')}ochrana</span>
                        <span class="inline-flex items-center gap-0.5"><span class="font-black text-rose-600 dark:text-rose-300">×</span>vynecháno</span>
                    </p>
                </div>
                <p class="flex min-h-[2.25rem] items-center rounded-2xl bg-white px-3 py-1.5 font-semibold shadow-sm ring-1 ring-slate-200/70 short:min-h-[2rem] short:py-1 dark:bg-slate-800/70 dark:ring-slate-700/70" data-qs-detail data-qs-detail-day="${detail ? detail.day : ''}" role="status">${detail ? `<span><b>${esc(detail.title)}</b> · ${esc(detail.text)}</span>` : '<span class="text-slate-500 dark:text-slate-400">Klepni na den.</span>'}</p>
                <p class="text-center text-[11.5px] text-slate-500 dark:text-slate-400" data-qs-note>Den končí o půlnoci.${esc(source)}</p>
            </div>`;
    };

    return { isDay, addDays, weekOf, formatDay, longDay, pragueClock, whenText, merge, playedOf, serverPlayed, currentOf, runsOf, build, monthGrid, monthTitle, dayDetail, dialogHtml, STATUS };
});
