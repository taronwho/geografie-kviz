// Přehled série Kvízu dne: kalendář posledních týdnů s tím, jak který den dopadl (dohráno, rozehráno a počítá se, zachráněno ochranou série,
// vynecháno, bez záznamu, dnes ještě nehráno), zvýrazněná současná série, nejdelší série a po klepnutí na den i čas dohrání.
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
    // Kalendář: posledních tolik týdnů (sloupce Po–Ne), vejde se na šířku telefonu 360 px
    const WEEKS = 10;
    const QUESTIONS = 10;
    const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => DAY.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
    // Pondělí týdne
    const weekOf = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const daysWord = (count) => plural(count, 'den', 'dny', 'dní');
    const pointsWord = (count) => plural(count, 'bod', 'body', 'bodů');
    const WEEKDAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
    const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
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
    //   'loading' (účet se načítá; dny bez záznamu jako u failed), frozen (zachráněné dny pro Kvíz dne), log (mudrlant.freezeLog: [{ day, at? }]), serverBest (nejlepší série podle serveru), weeks }
    // Stav dne: done (dohráno), partial (rozehráno, počítá se), saved (zachráněno ochranou), missed (vynecháno), unknown (bez záznamu),
    // today (dnes ještě nehráno), progress (dnes rozehráno), null = budoucí den
    const build = (input = {}) => {
        const today = isDay(input.today) ? input.today : addDays(new Date().toISOString().slice(0, 10), 0);
        const account = ['ok', 'failed', 'loading'].includes(input.account) ? input.account : 'none';
        const days = merge(input.local, account === 'ok' ? input.server : null);
        // Ze zachráněných dnů se počítají jen ty, které nejsou odehrané a nejsou v budoucnosti
        const saved = new Set((Array.isArray(input.frozen) ? input.frozen : []).filter(day => isDay(day) && day < today && !(days[day] && days[day].answered > 0)));
        const playedList = playedOf(days, today);
        const played = new Set(playedList);
        const known = [...Object.keys(days).filter(day => days[day].answered > 0), ...saved].sort();
        const first = known[0] || '';
        const usedAt = {};
        for (const entry of Array.isArray(input.log) ? input.log : []) if (entry && isDay(entry.day) && Number.isFinite(entry.at) && !usedAt[entry.day]) usedAt[entry.day] = entry.at;
        const runs = runsOf(played, saved);
        const current = currentOf(played, saved, today);
        // Dny současné série (odehrané i zachráněné), v kalendáři zvýrazněné
        const currentDays = new Set();
        if (current) for (let day = played.has(today) ? today : addDays(today, -1), guard = 0; guard < 4000 && (played.has(day) || saved.has(day)); guard++, day = addDays(day, -1)) currentDays.add(day);
        const best = Math.max(current, whole(input.serverBest, 100000), ...runs.map(run => run.length));
        // Úsek, který skončil den před vynechaným dnem (u vynechaného dne se ukáže, jaká série tam skončila)
        const endedBefore = {};
        for (const run of runs) endedBefore[addDays(run.to, 1)] = run;
        const statusOf = (day) => {
            if (day > today) return null;
            const entry = days[day];
            if (day === today) return entry && entry.done ? 'done' : entry && entry.answered > 0 ? 'progress' : 'today';
            if (entry && entry.answered > 0) return entry.done ? 'done' : 'partial';
            if (saved.has(day)) return 'saved';
            // Bez záznamu: před prvním známým dnem, nebo přihlášený hráč, jehož účet se nenačetl (mohl hrát na jiném zařízení)
            if (!first || day < first || account === 'failed' || account === 'loading') return 'unknown';
            return 'missed';
        };
        const weeks = Math.max(1, Math.min(26, whole(input.weeks, 26) || WEEKS));
        const start = addDays(weekOf(today), -7 * (weeks - 1));
        const columns = [];
        const counts = { done: 0, partial: 0, saved: 0, missed: 0, unknown: 0 };
        for (let w = 0; w < weeks; w++) {
            const column = [];
            for (let d = 0; d < 7; d++) {
                const day = addDays(start, w * 7 + d);
                const status = statusOf(day);
                if (!status) { column.push(null); continue; }
                if (counts[status] !== undefined) counts[status] += 1;
                column.push({ day, status, current: currentDays.has(day) });
            }
            columns.push(column);
        }
        return { today, start, account, days, saved: [...saved].sort(), usedAt, played: playedList, first, runs, current, currentDays, best, endedBefore, columns, counts, statusOf };
    };

    // Popis dne (řádek pod kalendářem): co se ten den stalo a kdy, odkud záznam je
    const sourceText = (entry) => (entry.account && entry.device ? 'v účtu i v zařízení' : entry.account ? 'v účtu' : 'jen v tomto zařízení');
    // Kdy: „v 21:47“, nebo s datem, když to bylo jiný den (po půlnoci, záchrana ochranou ráno)
    const whenText = (day, at) => {
        const clock = pragueClock(at);
        if (!clock) return '';
        return clock.day === day ? `v ${clock.time}` : `${formatDay(clock.day)} v ${clock.time}`;
    };
    const dayDetail = (view, day) => {
        const status = view.statusOf(day);
        const entry = view.days[day];
        const title = day === view.today ? `Dnes (${longDay(day)})` : longDay(day).replace(/^./, char => char.toUpperCase());
        const run = view.endedBefore[day];
        const score = entry ? `${entry.correct}/${QUESTIONS} správně, ${pointsWord(entry.score)}` : '';
        let text = '';
        // Dohráno krátce po půlnoci: patří k tomuto dni, ne k předchozímu večeru (nejčastější důvod „hrál jsem, a série spadla“)
        const clock = entry && entry.at && entry.atDone ? pragueClock(entry.at) : null;
        const night = clock && clock.day === day && Number(clock.time.split(':')[0]) < 5 ? ' (po půlnoci, patří k tomuto dni, ne k předchozímu večeru)' : '';
        if (status === 'done') text = [`Dohráno${clock ? ` ${whenText(day, entry.at)}${night}` : ''}`, score, sourceText(entry)].join(' · ');
        else if (status === 'partial') text = [`Rozehráno (${entry.answered} z ${QUESTIONS} otázek), do série se počítá`, entry.at ? `poslední odpověď ${whenText(day, entry.at)}` : '', sourceText(entry)].filter(Boolean).join(' · ');
        else if (status === 'saved') text = `Nehráno, sérii zachránila ochrana série${view.usedAt[day] ? ` (použita ${whenText(day, view.usedAt[day])})` : ''}`;
        else if (status === 'missed') text = `Kvíz dne nebyl odehraný${run ? `, tady skončila série ${daysWord(run.length)} (${formatDay(run.from)} – ${formatDay(run.to)})` : ''}${run && run.length >= 3 ? '. Ochrana série nebyla k mání, nebo šlo o druhý vynechaný den' : ''}`;
        else if (status === 'unknown') text = view.account === 'loading' ? 'Bez záznamu v tomto zařízení; načítám záznamy z účtu…' : view.account === 'failed' ? 'Bez záznamu v tomto zařízení; záznamy z účtu se teď nenačetly' : 'Bez záznamu (dřív než první uložený Kvíz dne)';
        else if (status === 'progress') text = `Rozehráno (${entry.answered} z ${QUESTIONS} otázek): dohraj ho do půlnoci a série poroste`;
        else if (status === 'today') text = 'Ještě nehráno, na Kvíz dne je čas do půlnoci';
        return { day, status, title, text };
    };

    // --- HTML okna ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const STATUS = {
        done: { label: 'Dohráno', cls: 'bg-brand-600 text-white dark:bg-brand-500', mark: '✓' },
        partial: { label: 'Rozehráno, počítá se', cls: 'bg-brand-600 text-white dark:bg-brand-500', mark: '✓' },
        saved: { label: 'Zachráněno ochranou série', short: 'Zachráněno ochranou', cls: 'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100', mark: '' },
        missed: { label: 'Vynecháno', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', mark: '×' },
        unknown: { label: 'Bez záznamu', cls: 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400', mark: '' },
        today: { label: 'Dnes ještě nehráno', cls: 'bg-white text-slate-500 ring-2 ring-inset ring-amber-400 dark:bg-slate-900 dark:text-slate-300', mark: '?' },
        progress: { label: 'Dnes rozehráno', cls: 'bg-white text-slate-500 ring-2 ring-inset ring-amber-400 dark:bg-slate-900 dark:text-slate-300', mark: '…' }
    };
    // Den současné série (odehraný): zlatý; legenda jen to podstatné
    const CURRENT_CLS = 'bg-amber-400 text-amber-950 dark:bg-amber-400 dark:text-amber-950';
    const LEGEND = [['current', 'Současná série'], ['done', 'Odehráno'], ['saved', 'Zachráněno ochranou'], ['missed', 'Vynecháno']];
    const clsOf = (cell) => (cell.current && (cell.status === 'done' || cell.status === 'partial') ? CURRENT_CLS : STATUS[cell.status].cls);
    const shieldImg = (cls) => `<img src="icons/topics/ochrana-serie.webp" alt="" class="${cls} object-contain">`;
    const mark = (status) => (status === 'saved' ? shieldImg('h-4 w-4') : esc(STATUS[status].mark));
    const cellHtml = (cell, selected) => {
        if (!cell) return '<span aria-hidden="true"></span>';
        const meta = STATUS[cell.status];
        const ring = cell.day === selected ? ' outline outline-2 outline-offset-1 outline-amber-500' : '';
        return `<button type="button" data-qs-day="${cell.day}" data-qs-status="${cell.status}" aria-pressed="${cell.day === selected}" aria-label="${esc(`${longDay(cell.day)}: ${meta.label}${cell.current ? ', současná série' : ''}`)}" class="flex h-[1.55rem] w-full items-center justify-center rounded-[5px] text-[11px] font-black leading-none short:h-[1.35rem] ${clsOf(cell)}${ring}">${mark(cell.status)}</button>`;
    };
    // view = build(...), selected = vybraný den, freezes = ochrany k mání (0–2), max = strop
    const dialogHtml = (view, { selected = view.today, freezes = 0, max = 2, topicStreak = 0 } = {}) => {
        const pick = view.statusOf(selected) ? selected : view.today;
        const detail = dayDetail(view, pick);
        const months = view.columns.map((column, w) => {
            const firstDay = column.map(cell => cell && cell.day).find(day => day && day.slice(8) === '01') || (w === 0 ? view.start : '');
            return `<span class="truncate text-[9px] font-bold leading-none text-slate-500 dark:text-slate-400">${firstDay ? MONTHS_SHORT[Number(firstDay.slice(5, 7)) - 1] : ''}</span>`;
        }).join('');
        const rows = [0, 1, 2, 3, 4, 5, 6].map(d => `<span class="flex items-center text-[9px] font-bold leading-none text-slate-500 dark:text-slate-400">${d % 2 === 0 ? WEEKDAYS[d].replace(/^./, c => c.toUpperCase()) : ''}</span>${view.columns.map(column => cellHtml(column[d], pick)).join('')}`).join('');
        const legend = LEGEND.map(([status, label]) => `<span class="inline-flex items-center gap-1"><span class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[8px] font-black leading-none ${status === 'current' ? CURRENT_CLS : STATUS[status].cls}">${status === 'saved' ? shieldImg('h-3 w-3') : esc(STATUS[status === 'current' ? 'done' : status].mark)}</span>${esc(label)}</span>`).join('');
        const source = view.account === 'ok' ? '' : view.account === 'loading' ? 'Načítám záznamy z účtu…' : view.account === 'failed' ? 'Záznamy z účtu se nenačetly, ukazuji jen toto zařízení.' : 'Ze záznamů v tomto zařízení.';
        return `
            <div class="flex flex-col gap-2 text-[13px] leading-snug text-slate-700 short:gap-1.5 dark:text-slate-200" data-quiz-streak-view>
                <div class="grid grid-cols-3 gap-1.5 whitespace-nowrap text-center text-[11.5px] leading-tight" data-qs-summary>
                    <p class="rounded-xl bg-amber-50 px-0.5 py-1.5 font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Teď <b class="text-[13px]" data-qs-current>${esc(daysWord(view.current))}</b></p>
                    <p class="rounded-xl bg-amber-50 px-0.5 py-1.5 font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Nejdelší <b class="text-[13px]" data-qs-best>${esc(daysWord(view.best))}</b></p>
                    <p class="rounded-xl bg-sky-50 px-0.5 py-1.5 font-bold text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">Ochrana <b class="text-[13px]" data-qs-freezes>${esc(`${freezes} z ${max}`)}</b></p>
                </div>
                <div class="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
                    <div class="grid ${view.columns.length === WEEKS ? 'grid-cols-[1.1rem_repeat(10,minmax(0,1fr))]' : 'grid-flow-col'} gap-[3px]" data-qs-calendar role="group" aria-label="${esc(`Kalendář Kvízu dne od ${longDay(view.start)} do ${longDay(view.today)}`)}">
                        <span aria-hidden="true"></span>${months}${rows}
                    </div>
                    <div class="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400" aria-hidden="true">${legend}</div>
                </div>
                <p class="min-h-[2.6rem] rounded-2xl bg-white px-2.5 py-1.5 shadow-sm short:py-1 short:text-[12.5px] ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70" data-qs-detail data-qs-detail-day="${detail.day}" role="status"><b>${esc(detail.title)}:</b> ${esc(detail.text)}</p>
                <p class="text-[11.5px] text-slate-500 dark:text-slate-400" data-qs-note>Klepni na den a uvidíš, co se ten den stalo. Den končí o půlnoci (čas v Česku), kvíz dohraný po ní patří k dalšímu dni.${source ? ` ${esc(source)}` : ''}${topicStreak > 0 ? ' Dnešní otázky mají vlastní série po tématech.' : ''}</p>
            </div>`;
    };

    return { WEEKS, isDay, addDays, weekOf, formatDay, longDay, pragueClock, whenText, merge, playedOf, serverPlayed, currentOf, runsOf, build, dayDetail, dialogHtml, STATUS };
});
