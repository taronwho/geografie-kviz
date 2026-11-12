// Mudrlantova kronika: týden v kostce (pondělí až neděle podle pražského času). Čistá logika bez úložiště a bez DOMu, HTML jen z dat.
// Aplikace (app.js) si v mudrlant.week vede lehké denní záznamy (record): odpovědi, správné, body, XP, otázky po tématech, nově poznané
// položky s jednou ukázkou, nejdelší sérii správných, denní dobu (ráno, den, večer, noc), výzvy (výhry, prohry), výhry v turnaji a mapy.
// Dny bez záznamu (z doby před kronikou) se doplní z toho, co aplikace pamatuje odjakživa: dnešní otázky (mudrlant.stats daily)
// a Kvíz dne (mudrlant.dailyQuiz days). Od neděle 18:00 do konce pondělí ukáže úvod pruh „Tvůj týden v kostce je hotový“ (jednou za týden).
// Testy: tests/chronicle.test.js (týden, souhrn, srovnání, tituly), tests/e2e-chronicle.test.js (pruh, okno, sdílení).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantChronicle = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const KEY = 'mudrlant.week';
    // Kolik dní záznamů se drží (deset týdnů: stačí na minulý týden i srovnání s předminulým)
    const KEEP_DAYS = 70;
    // Pruh na úvodu: od neděle 18:00 (Praha); v pondělí za minulý týden
    const STRIP_HOUR = 18;
    // Pruh jen za týden, ve kterém se hrálo aspoň tolik dní (jinak není co shrnovat; kronika jde otevřít z Mého postupu vždy)
    const STRIP_MIN_DAYS = 2;
    const DAY_MS = 86400000;
    // Vlastní obrázek pruhu na úvodu (sova s kronikou, docs/OBRAZKY.md č. 205): po dodání sem 'sova-kronika'
    // (icons/topics/sova-kronika.webp); do té doby je v pruhu sova titulu týdne
    const STRIP_ART = null;
    const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    // Denní doba odpovědi (hodina v Praze): 0 = ráno (5–9), 1 = den (9–17), 2 = večer (17–22), 3 = noc (22–5)
    const partOfDay = (hour) => (hour >= 5 && hour < 9 ? 0 : hour >= 9 && hour < 17 ? 1 : hour >= 17 && hour < 22 ? 2 : 3);

    // --- Dny a týdny (Praha) ---
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => typeof day === 'string' && DAY_PATTERN.test(day) && Number.isFinite(parseDay(day));
    const parseDay = (day) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
    };
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(parseDay(day) + count * DAY_MS);
    // Den, hodina a den v týdnu (0 = pondělí) v Praze; bez Intl podle UTC
    const pragueNow = (now = new Date()) => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const day = `${get('year')}-${get('month')}-${get('day')}`;
            const hour = Number(get('hour')) % 24;
            if (isDay(day) && Number.isFinite(hour)) return { day, hour, weekday: (new Date(parseDay(day)).getUTCDay() + 6) % 7 };
        } catch (error) { /* bez Intl se vezme UTC */ }
        const day = dayOf(now.getTime());
        return { day, hour: now.getUTCHours(), weekday: (now.getUTCDay() + 6) % 7 };
    };
    // Pondělí týdne, do kterého den patří
    const weekOf = (day) => addDays(day, -((new Date(parseDay(day)).getUTCDay() + 6) % 7));
    const weekDays = (week) => Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const shortDay = (day) => { const time = parseDay(day); return Number.isFinite(time) ? `${new Date(time).getUTCDate()}. ${new Date(time).getUTCMonth() + 1}.` : ''; };
    // „3. – 9. 11.“, přes konec měsíce „27. 10. – 2. 11.“
    const weekLabel = (week) => {
        const end = addDays(week, 6);
        return week.slice(5, 7) === end.slice(5, 7) ? `${Number(week.slice(8))}. – ${shortDay(end)}` : `${shortDay(week)} – ${shortDay(end)}`;
    };
    const thisWeek = (now = new Date()) => weekOf(pragueNow(now).day);
    const lastWeek = (now = new Date()) => addDays(thisWeek(now), -7);
    // Týden, za který má úvod ukázat pruh: neděle od 18:00 = právě končící týden, pondělí = minulý týden; jinak null
    const stripWeek = (now = new Date()) => {
        const { day, hour, weekday } = pragueNow(now);
        if (weekday === 6 && hour >= STRIP_HOUR) return weekOf(day);
        if (weekday === 0) return addDays(weekOf(day), -7);
        return null;
    };

    // --- Záznamy ---
    const whole = (value, max = 1e7) => (Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0);
    const cleanText = (value, max = 80) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    const TOPIC_ID = /^[a-z0-9-]{1,24}$/;
    const NUMBERS = ['a', 'c', 'p', 'xp', 'n', 'run', 'cw', 'cl', 'cp', 'tw', 'm', 'q'];
    // Den záznamu: a = odpovědi, c = správně, p = body, xp, n = nově poznané položky, ex = ukázka [název, téma], run = nejdelší série
    // správných v řadě, h = odpovědi podle denní doby, t = { téma: [odpovědi, správně] }, cw / cl / cp = výzvy vyhrané / prohrané / dohrané,
    // tw = vyhrané zápasy turnaje, m = otázky na mapě, q = otázky Kvízu dne
    const cleanDay = (row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
        const out = {};
        for (const key of NUMBERS) if (whole(row[key])) out[key] = whole(row[key]);
        if (Array.isArray(row.h) && row.h.some(value => whole(value))) out.h = [0, 1, 2, 3].map(i => whole(row.h[i]));
        if (row.t && typeof row.t === 'object' && !Array.isArray(row.t)) {
            const topics = {};
            for (const [id, pair] of Object.entries(row.t)) if (TOPIC_ID.test(id) && Array.isArray(pair) && whole(pair[0])) topics[id] = [whole(pair[0]), Math.min(whole(pair[0]), whole(pair[1]))];
            if (Object.keys(topics).length) out.t = topics;
        }
        if (Array.isArray(row.ex) && cleanText(row.ex[0])) out.ex = [cleanText(row.ex[0]), TOPIC_ID.test(String(row.ex[1])) ? row.ex[1] : ''];
        return out;
    };
    const parse = (raw) => {
        const state = { v: 1, seen: '', days: {} };
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
        if (isDay(raw.seen)) state.seen = raw.seen;
        if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
            Object.keys(raw.days).filter(isDay).sort().slice(-KEEP_DAYS).forEach(day => {
                const row = cleanDay(raw.days[day]);
                if (row) state.days[day] = row;
            });
        }
        return state;
    };
    // Připíše událost do dne (Praha). event: { answered, correct, points, xp, topic, run, map, quiz, learned: { name, topic },
    // challenge: 'win' | 'loss' | 'played', tourWins }. Vrátí nový stav (starší dny než KEEP_DAYS zmizí).
    const record = (stateInput, event = {}, now = new Date()) => {
        const state = parse(stateInput);
        const { day, hour } = pragueNow(now);
        const row = { ...(state.days[day] || {}) };
        const add = (key, value) => { const v = whole(value); if (v) row[key] = whole((row[key] || 0) + v); };
        if (event.answered) {
            add('a', 1);
            if (event.correct) add('c', 1);
            add('p', event.points);
            const h = Array.isArray(row.h) ? row.h.slice() : [0, 0, 0, 0];
            h[partOfDay(hour)] += 1;
            row.h = h;
            if (event.topic && TOPIC_ID.test(event.topic)) {
                const t = { ...(row.t || {}) };
                const pair = t[event.topic] ? t[event.topic].slice() : [0, 0];
                pair[0] += 1;
                if (event.correct) pair[1] += 1;
                t[event.topic] = pair;
                row.t = t;
            }
            if (event.map) add('m', 1);
            if (event.quiz) add('q', 1);
        }
        add('xp', event.xp);
        if (whole(event.run) > (row.run || 0)) row.run = whole(event.run);
        if (event.learned && cleanText(event.learned.name)) {
            add('n', 1);
            // Ukázka objevu: poslední poznaná položka dne
            row.ex = [cleanText(event.learned.name), TOPIC_ID.test(String(event.learned.topic)) ? event.learned.topic : ''];
        }
        if (event.challenge === 'win') { add('cw', 1); add('cp', 1); }
        else if (event.challenge === 'loss') { add('cl', 1); add('cp', 1); }
        else if (event.challenge === 'played') add('cp', 1);
        add('tw', event.tourWins);
        state.days[day] = cleanDay(row);
        const cut = addDays(day, -(KEEP_DAYS - 1));
        for (const key of Object.keys(state.days)) if (key < cut) delete state.days[key];
        return state;
    };
    const markSeen = (stateInput, week) => ({ ...parse(stateInput), seen: isDay(week) ? week : '' });

    // --- Souhrn týdne ---
    // legacy = { daily: mudrlant.stats daily ({ téma: { den: { correct, points } } }), quiz: Kvíz dne days ({ den: { answered, correct, score } }) }
    // doplní dny bez záznamu (z doby před kronikou); Kvíz dne počítá dny i ze záznamů (q)
    const legacyDay = (day, legacy) => {
        const row = { a: 0, c: 0, p: 0, t: {} };
        for (const [topic, days] of Object.entries((legacy && legacy.daily) || {})) {
            const result = days && days[day];
            if (!result || typeof result !== 'object' || !TOPIC_ID.test(topic)) continue;
            row.a += 1;
            if (result.correct) row.c += 1;
            row.p += whole(result.points);
            row.t[topic] = [1, result.correct ? 1 : 0];
        }
        const quiz = legacy && legacy.quiz && legacy.quiz[day];
        if (quiz && whole(quiz.answered)) {
            row.a += whole(quiz.answered, 50);
            row.c += Math.min(whole(quiz.answered, 50), whole(quiz.correct, 50));
            row.q = whole(quiz.answered, 50);
        }
        return row.a ? row : null;
    };
    const summarize = (stateInput, week, legacy = null) => {
        const state = parse(stateInput);
        const days = weekDays(week);
        const sum = { week, end: days[6], label: weekLabel(week), answered: 0, correct: 0, points: 0, xp: 0, learned: 0, example: null, bestRun: 0,
            hours: [0, 0, 0, 0], challenges: { played: 0, won: 0, lost: 0 }, tourWins: 0, maps: 0, quizDays: 0, played: [], activeDays: 0, topics: [], recorded: 0 };
        const topics = {};
        for (const day of days) {
            const own = state.days[day] || null;
            const row = own && own.a ? own : (legacyDay(day, legacy) || own || {});
            if (own) sum.recorded += 1;
            const quiz = legacy && legacy.quiz && legacy.quiz[day];
            const answered = whole(row.a);
            sum.played.push(answered > 0);
            if (answered) sum.activeDays += 1;
            sum.answered += answered;
            sum.correct += Math.min(answered, whole(row.c));
            sum.points += whole(row.p);
            // XP, objevy, výzvy a turnaj jsou jen v záznamu dne (i v den bez odpovědi, třeba XP za cíl nebo výhra v turnaji)
            const extra = own || {};
            sum.xp += whole(extra.xp);
            sum.learned += whole(extra.n);
            if (extra.ex) sum.example = { name: extra.ex[0], topic: extra.ex[1] || null };
            sum.bestRun = Math.max(sum.bestRun, whole(extra.run));
            if (Array.isArray(row.h)) row.h.forEach((value, i) => { sum.hours[i] += whole(value); });
            sum.challenges.won += whole(extra.cw);
            sum.challenges.lost += whole(extra.cl);
            sum.challenges.played += Math.max(whole(extra.cp), whole(extra.cw) + whole(extra.cl));
            sum.tourWins += whole(extra.tw);
            sum.maps += whole(row.m);
            if (whole(row.q) || (quiz && whole(quiz.answered))) sum.quizDays += 1;
            for (const [id, pair] of Object.entries(row.t || {})) {
                const entry = topics[id] || (topics[id] = { id, answered: 0, correct: 0 });
                entry.answered += whole(pair[0]);
                entry.correct += Math.min(whole(pair[0]), whole(pair[1]));
            }
        }
        sum.topics = Object.values(topics).sort((a, b) => b.answered - a.answered || b.correct - a.correct || a.id.localeCompare(b.id));
        sum.top = sum.topics[0] || null;
        sum.accuracy = sum.answered ? Math.round(sum.correct / sum.answered * 100) : null;
        return sum;
    };
    // Pruh na úvodu: týden pruhu (stripWeek), ještě neviděný, s aspoň STRIP_MIN_DAYS dny hraní; vrátí souhrn nebo null
    const stripSummary = (stateInput, legacy = null, now = new Date()) => {
        const week = stripWeek(now);
        if (!week || parse(stateInput).seen === week) return null;
        const summary = summarize(stateInput, week, legacy);
        return summary.activeDays >= STRIP_MIN_DAYS ? summary : null;
    };

    // --- Srovnání, titul a cíl ---
    const formatNumber = (value) => String(whole(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    const plural = (count, one, few, many) => `${formatNumber(count)} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    // Odpovědi oproti minulému týdnu: { kind: 'more' | 'less' | 'same' | 'new' | 'none', pct, text }
    const compare = (current, previous) => {
        const now = whole(current && current.answered);
        const before = whole(previous && previous.answered);
        if (!now && !before) return { kind: 'none', pct: 0, text: '' };
        if (!before) return { kind: 'new', pct: 0, text: 'Minulý týden bez otázek – pěkný rozjezd!' };
        const pct = Math.round((now - before) / before * 100);
        if (pct > 0) return { kind: 'more', pct, text: `o ${pct} % víc než minulý týden` };
        if (pct < 0) return { kind: 'less', pct: -pct, text: `o ${-pct} % méně než minulý týden` };
        return { kind: 'same', pct: 0, text: 'stejně jako minulý týden' };
    };
    // Titul za téma (téma s aspoň polovinou otázek týdne)
    const TOPIC_TITLES = {
        zemepis: 'Zeměpisný cestovatel týdne', vlajky: 'Vlajkonoš týdne', historie: 'Strážce dějin týdne', mytologie: 'Znalec bájí týdne',
        biologie: 'Přírodovědec týdne', geologie: 'Badatel podzemí týdne', chemie: 'Alchymista týdne', fyzika: 'Génius fyziky týdne',
        umeni: 'Galerijní duše týdne', architektura: 'Stavitel týdne', hudba: 'Hudební duše týdne', literatura: 'Knihomol týdne',
        film: 'Filmový fanoušek týdne', sport: 'Sportovní duše týdne'
    };
    // Titul týdne podle jednoduchých pravidel (první, které platí); owl = póza sovy (icons/topics/sova-<owl>.webp)
    // titles = { téma: název tématu } pro text
    const verdict = (s, titles = {}) => {
        const share = (value) => (s.answered ? value / s.answered : 0);
        const topicTitle = (id) => titles[id] || id;
        if (!s.answered) return { id: 'klid', title: 'Odpočívající sova', text: 'Tenhle týden si Mudrlant odpočinul. Příště to rozjedeme!', owl: 'spi' };
        if (s.answered >= 10 && share(s.hours[3]) >= 0.4) return { id: 'nocni', title: 'Noční sova týdne', text: 'Nejvíc otázek padlo po desáté večer. Moudrost nikdy nespí!', owl: 'premysleni' };
        if (s.answered >= 10 && share(s.hours[0]) >= 0.4) return { id: 'ranni', title: 'Ranní ptáče týdne', text: 'Nejvíc otázek padlo před devátou ráno. Kdo ráno vstává…', owl: 'radost' };
        if (s.challenges.won >= 3) return { id: 'postrach', title: 'Postrach soupeřů', text: `${plural(s.challenges.won, 'vyhraná výzva', 'vyhrané výzvy', 'vyhraných výzev')} – soupeři mají respekt.`, owl: 'vitez' };
        if (s.activeDays === 7) return { id: 'neunavny', title: 'Neúnavný Mudrlant', text: 'Sedm dní ze sedmi. Ani den bez Mudrlanta!', owl: 'serie' };
        if (s.answered >= 30 && s.accuracy >= 90) return { id: 'ostrostrelec', title: 'Ostrostřelec týdne', text: `${s.accuracy} % správně. Skoro bez chyby!`, owl: 'oslava' };
        if (s.top && s.top.answered >= 10 && share(s.top.answered) >= 0.5) {
            return { id: `tema-${s.top.id}`, topic: s.top.id, title: TOPIC_TITLES[s.top.id] || `${topicTitle(s.top.id)}: hvězda týdne`,
                text: `Téma ${topicTitle(s.top.id)} vedlo s ${plural(s.top.answered, 'otázkou', 'otázkami', 'otázkami')}.`, owl: s.top.id === 'zemepis' ? 'dalekohled' : 'radost' };
        }
        if (s.topics.length >= 6) return { id: 'vsestranny', title: 'Všestranný Mudrlant', text: `${plural(s.topics.length, 'téma', 'témata', 'různých témat')} za jediný týden.`, owl: 'oslava' };
        return { id: 'zvedavy', title: 'Zvídavá sova týdne', text: 'Každá otázka se počítá. Příští týden zase!', owl: 'radost' };
    };
    // Cíl na příští týden: { id, text, topic? }; topics = [{ id, title }] v pořadí aplikace (první nehrané téma se nabídne)
    const nextGoal = (s, topics = []) => {
        if (!s.answered) return { id: 'zacni', text: 'Zkus příští týden aspoň 3 dny dnešních otázek. Stačí pár minut denně.' };
        if (s.activeDays < 4) {
            const target = Math.min(7, s.activeDays + 2);
            return { id: 'dny', text: `Příští týden zkus hrát aspoň ${plural(target, 'den', 'dny', 'dní')}. Stačí dnešní otázky.` };
        }
        if (s.answered >= 10 && s.accuracy < 60) return { id: 'presnost', text: 'Nebraň se nápovědám a projdi si Moje chyby v Učení. Přesnost hned poroste.' };
        const played = new Set(s.topics.map(topic => topic.id));
        const fresh = topics.find(topic => !played.has(topic.id));
        if (fresh) return { id: 'tema', topic: fresh.id, text: `Dej šanci tématu ${fresh.title}. Tenhle týden zůstalo stranou.` };
        const target = Math.max(10, Math.ceil(s.answered * 1.1 / 5) * 5);
        return { id: 'vic', text: `Překonej ${plural(target, 'odpověď', 'odpovědi', 'odpovědí')}. To je o 10 % víc než teď.` };
    };

    // --- Sdílení ---
    const shareText = (s, v, url = '') => {
        const parts = [`${plural(s.answered, 'odpověď', 'odpovědi', 'odpovědí')}`];
        if (s.accuracy !== null) parts.push(`${s.accuracy} % správně`);
        if (s.xp) parts.push(`+${formatNumber(s.xp)} XP`);
        parts.push(`${s.activeDays} ${s.activeDays === 1 ? 'den' : s.activeDays >= 2 && s.activeDays <= 4 ? 'dny' : 'dní'} ze 7`);
        return [`Můj týden v Mudrlantovi (${s.label}): ${parts.join(', ')}. Titul: ${v.title}.`, url].filter(Boolean).join('\n');
    };
    // Vstup karty do share-card.js (ShareCard.render): mřížka = dny týdne (hrané zeleně)
    const POSES = { spi: 'premysleni', premysleni: 'premysleni', radost: 'radost', vitez: 'vitez', serie: 'serie', oslava: 'oslava', dalekohled: 'radost' };
    const cardInput = (s, v, { robe, url, appName } = {}) => ({
        kicker: 'Můj týden v Mudrlantovi',
        headline: s.accuracy === null ? '0' : `${s.accuracy} %`,
        detail: `${plural(s.answered, 'odpověď', 'odpovědi', 'odpovědí')} · +${formatNumber(s.xp)} XP`,
        note: `${v.title} · ${s.activeDays} z 7 dní`,
        grid: s.played.map(played => (played ? true : null)),
        day: s.end, robe, pose: POSES[v.owl] || 'radost', url, appName
    });

    // --- Okno (příběh ve 3–5 kartách) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    // Stránky: úvod s titulem, čísla, téma a objev, souboje (jen když nějaké byly) a závěr s cílem a sdílením
    const pagesFor = (s) => ['titul', 'cisla', 'tema', ...(s.challenges.played || s.tourWins || s.quizDays ? ['souboje'] : []), 'zaver'];
    const dotsHtml = (s) => `
        <ol class="flex justify-center gap-1.5" aria-label="Dny týdne">${s.played.map((played, i) => `
            <li class="flex flex-col items-center gap-0.5"><span class="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black ${played ? 'bg-gold-400 text-brand-950' : 'bg-white/15 text-white/60'}" aria-label="${WEEKDAYS[i]}: ${played ? 'hráno' : 'bez hry'}">${played ? '✓' : '·'}</span><span class="text-[10px] font-bold text-white/80">${WEEKDAYS[i]}</span></li>`).join('')}
        </ol>`;
    const stat = (value, label, attr = '') => `<div class="flex min-w-0 flex-col items-center rounded-2xl bg-white/10 px-1 py-2 short:py-1.5"${attr}><span class="text-2xl font-black leading-none tabular-nums text-white short:text-xl">${value}</span><span class="mt-1 text-center text-[11px] font-bold leading-tight text-white/80">${label}</span></div>`;
    // h = { topicIcon(topic, cls), uiArt(name, cls), topicById } z app.js; ctx = { page, pages, comparison, goal, verdict, toggle (null | 'last' | 'this') }
    const pageHtml = (s, ctx, h) => {
        const v = ctx.verdict;
        const page = ctx.pages[ctx.page];
        const topicOf = (id) => (h.topicById && h.topicById[id]) || null;
        const owl = (name, cls) => h.uiArt(`sova-${name}`, cls);
        let body = '';
        if (page === 'titul') {
            body = `
                ${owl(v.owl, 'mx-auto h-28 w-28 short:h-20 short:w-20')}
                <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">Titul týdne</p>
                <h3 class="text-2xl font-black leading-tight short:text-xl" data-kr-title>${esc(v.title)}</h3>
                <p class="text-sm font-semibold leading-snug text-white/90">${esc(v.text)}</p>
                ${dotsHtml(s)}
                <p class="text-[12px] font-bold text-white/80">${s.activeDays ? `Hráno ${s.activeDays} ${s.activeDays === 1 ? 'den' : s.activeDays <= 4 ? 'dny' : 'dní'} ze 7` : 'Zatím ani jeden den'}</p>`;
        } else if (page === 'cisla') {
            const cmp = ctx.comparison;
            body = `
                <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">Týden v číslech</p>
                <div class="grid w-full grid-cols-3 gap-1.5">
                    ${stat(formatNumber(s.answered), s.answered === 1 ? 'odpověď' : s.answered >= 2 && s.answered <= 4 ? 'odpovědi' : 'odpovědí', ' data-kr-answered')}
                    ${stat(s.accuracy === null ? '–' : `${s.accuracy} %`, 'správně', ' data-kr-accuracy')}
                    ${stat(`+${formatNumber(s.xp)}`, 'XP', ' data-kr-xp')}
                </div>
                ${cmp.text ? `<p class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-black ${cmp.kind === 'less' ? 'bg-white/10 text-white' : 'bg-gold-400 text-brand-950'}" data-kr-compare="${cmp.kind}">${cmp.kind === 'more' ? '▲ ' : cmp.kind === 'less' ? '▼ ' : ''}${esc(cmp.text.charAt(0).toUpperCase() + cmp.text.slice(1))}</p>` : ''}
                <div class="flex w-full items-center gap-2.5 rounded-2xl bg-white/10 p-2 text-left">${owl('serie', 'h-12 w-12 short:h-10 short:w-10')}<span class="min-w-0"><span class="block text-[11px] font-black uppercase tracking-wider text-gold-300">Nejlepší série</span><span class="block text-base font-black leading-tight" data-kr-run>${s.bestRun ? `${plural(s.bestRun, 'správná', 'správné', 'správných')} v řadě` : s.answered ? 'Série se teprve rozjíždí' : 'Zatím bez série'}</span></span></div>
                <p class="text-[12px] font-bold text-white/80">${s.points ? `Body za odpovědi: ${formatNumber(s.points)}` : ''}</p>`;
        } else if (page === 'tema') {
            const top = s.top && topicOf(s.top.id);
            const example = s.example && s.example.name;
            body = `
                <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">Téma týdne</p>
                ${top ? `${h.topicIcon(top, 'mx-auto h-20 w-20 short:h-14 short:w-14')}
                <h3 class="text-xl font-black leading-tight" data-kr-topic="${esc(top.id)}">${esc(top.title)}</h3>
                <p class="text-sm font-semibold text-white/90">${plural(s.top.answered, 'otázka', 'otázky', 'otázek')} · ${Math.round(s.top.correct / s.top.answered * 100)} % správně${s.topics.length > 1 ? ` · celkem ${plural(s.topics.length, 'téma', 'témata', 'témat')}` : ''}</p>`
        : `${owl('premysleni', 'mx-auto h-20 w-20 short:h-14 short:w-14')}<p class="text-sm font-semibold text-white/90">Téma týdne se teprve hledá.</p>`}
                <div class="w-full rounded-2xl bg-white/10 p-2.5 text-left" data-kr-discovery>
                    <p class="text-[11px] font-black uppercase tracking-wider text-gold-300">Objev týdne</p>
                    <p class="text-base font-black leading-tight">${s.learned ? `${plural(s.learned, 'nová poznaná položka', 'nové poznané položky', 'nových poznaných položek')}` : 'Tentokrát bez nových položek'}</p>
                    ${example ? `<p class="mt-0.5 truncate text-[13px] font-semibold text-white/90">Třeba <b class="text-white" data-kr-example>${esc(example)}</b>${s.example.topic && topicOf(s.example.topic) ? ` · ${esc(topicOf(s.example.topic).title)}` : ''}</p>` : s.learned ? '' : '<p class="mt-0.5 text-[13px] font-semibold text-white/90">Každá nová správná odpověď se zapíše do kroniky.</p>'}
                </div>`;
        } else if (page === 'souboje') {
            const c = s.challenges;
            body = `
                ${owl(c.won ? 'vitez' : 'vyzva', 'mx-auto h-24 w-24 short:h-16 short:w-16')}
                <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">Souboje a Kvíz dne</p>
                <div class="grid w-full grid-cols-3 gap-1.5">
                    ${stat(String(c.won), c.won === 1 ? 'výhra' : c.won >= 2 && c.won <= 4 ? 'výhry' : 'výher', ' data-kr-won')}
                    ${stat(String(c.lost), c.lost === 1 ? 'prohra' : c.lost >= 2 && c.lost <= 4 ? 'prohry' : 'proher', ' data-kr-lost')}
                    ${stat(String(s.quizDays), 'Kvíz dne', ' data-kr-quiz')}
                </div>
                <p class="text-sm font-semibold leading-snug text-white/90">${c.played ? `${plural(c.played, 'dohraná výzva', 'dohrané výzvy', 'dohraných výzev')}${c.won > c.lost ? ' a víc výher než proher!' : '.'}` : 'Výzvu si můžeš dát s přáteli ve Více hráčích.'}${s.tourWins ? ` V turnaji ${plural(s.tourWins, 'vyhraný zápas', 'vyhrané zápasy', 'vyhraných zápasů')}.` : ''}</p>`;
        } else {
            const goal = ctx.goal;
            const goalTopic = goal.topic && topicOf(goal.topic);
            body = `
                ${owl('oslava', 'mx-auto h-24 w-24 short:h-16 short:w-16')}
                <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">Na příští týden</p>
                <div class="flex w-full items-center gap-2.5 rounded-2xl bg-white/10 p-2.5 text-left" data-kr-goal="${esc(goal.id)}">${goalTopic ? h.topicIcon(goalTopic, 'h-11 w-11') : owl('tip', 'h-11 w-11')}<p class="min-w-0 text-sm font-bold leading-snug">${esc(goal.text)}</p></div>
                <p class="text-[12px] font-bold text-white/80">Pochlub se svým týdnem obrázkem.</p>
                <button type="button" data-kr-share class="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-400 px-4 py-2.5 text-base font-black text-brand-950 shadow-md"><i data-lucide="share-2" class="h-5 w-5"></i> Sdílet obrázek</button>`;
        }
        const bars = ctx.pages.map((_, i) => `<span class="h-1 flex-1 rounded-full ${i <= ctx.page ? 'bg-gold-300' : 'bg-white/25'}"></span>`).join('');
        const toggle = ctx.toggle ? `
            <div class="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800" role="tablist" aria-label="Který týden">
                ${[['last', 'Minulý týden'], ['this', 'Tento týden']].map(([id, label]) => `<button type="button" role="tab" aria-selected="${ctx.toggle === id}" data-kr-week="${id}" class="min-h-[2.5rem] rounded-xl text-[13px] font-black ${ctx.toggle === id ? 'bg-white text-brand-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`).join('')}
            </div>` : '';
        const last = ctx.page === ctx.pages.length - 1;
        return `
            <div class="flex flex-col gap-2" data-chronicle data-kr-page="${page}" data-kr-week-key="${esc(s.week)}">
                ${toggle}
                <div data-kr-card class="relative flex h-[27rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-950 p-4 text-white shadow-lg short:h-[20.5rem] short:p-3">
                    <div class="flex gap-1" aria-hidden="true">${bars}</div>
                    <p class="mt-1.5 flex items-center justify-between text-[11px] font-bold text-white/80"><span>Týden ${esc(s.label)}</span><span>${ctx.page + 1}/${ctx.pages.length}</span></p>
                    <div class="flex flex-1 flex-col items-center justify-center gap-2 text-center short:gap-1.5" role="status">${body}</div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button type="button" data-kr-prev class="flex min-h-[2.75rem] items-center justify-center gap-1 rounded-2xl btn-3d-light bg-white px-3 text-sm font-bold text-slate-800 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100"${ctx.page ? '' : ' disabled'}><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět</button>
                    <button type="button" data-kr-next class="flex min-h-[2.75rem] items-center justify-center gap-1 rounded-2xl btn-3d bg-brand-700 px-3 text-sm font-black text-white">${last ? 'Hotovo' : 'Dál'} ${last ? '<i data-lucide="check" class="h-4 w-4"></i>' : '<i data-lucide="chevron-right" class="h-4 w-4"></i>'}</button>
                </div>
            </div>`;
    };
    // Pruh na úvodu (místo pruhu cílů týdne, stejná výška): otevřít a skrýt
    const stripHtml = (s, v, h) => `
        <div id="weekly-goals" data-chronicle-strip="${esc(s.week)}" class="flex min-h-[2.5rem] w-full items-center gap-1 rounded-2xl bg-gradient-to-r from-brand-700 to-brand-900 pl-2 pr-0.5 text-white shadow-md ring-1 ring-brand-900/20">
            <button type="button" data-action="chronicle-open" class="flex min-h-[2.5rem] min-w-0 flex-1 items-center gap-1.5 text-left" aria-label="Tvůj týden v kostce je hotový: ${esc(v.title)}. Otevřít kroniku týdne">
                ${h.uiArt(STRIP_ART || `sova-${v.owl}`, 'h-8 w-8 -my-1.5 -ml-1')}
                <span class="min-w-0 flex-1"><span class="block truncate text-[12px] font-black leading-tight">Tvůj týden v kostce je hotový</span><span class="block truncate text-[10.5px] font-bold leading-tight text-gold-200">${esc(v.title)} · ${esc(s.label)}</span></span>
                <span class="shrink-0 rounded-lg bg-gold-400 px-2 py-1 text-[11px] font-black text-brand-950">Otevřít</span>
            </button>
            <button type="button" data-action="chronicle-dismiss" aria-label="Skrýt kroniku týdne" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/80"><i data-lucide="x" class="h-4 w-4"></i></button>
        </div>`;

    return {
        KEY, KEEP_DAYS, STRIP_HOUR, STRIP_MIN_DAYS, WEEKDAYS, TOPIC_TITLES, partOfDay, pragueNow, weekOf, weekDays, weekLabel, addDays, thisWeek, lastWeek, stripWeek,
        parse, record, markSeen, summarize, stripSummary, compare, verdict, nextGoal, shareText, cardInput, pagesFor, pageHtml, stripHtml
    };
});
