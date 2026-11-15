// Tematické víkendy: některé víkendy mají téma („Víkend historie“) a otázky z něj dávají dvojnásobek XP za odpověď, od pátku 18:00
// do neděle 24:00 pražského času. Rozpis je pevný a pro všechny stejný (bez serveru: XP počítá aplikace, server ho jen nechá růst):
// víkendy se číslují od pátku EPOCH po týdnech, téma má každý druhý víkend (sudé číslo) a témata se střídají v pořadí ROTATION.
// Každé téma tak přijde na řadu jednou za 28 týdnů. V pátek před 18:00 už úvod ohlásí, že večer začíná („soon“).
// Čistá logika a HTML bez DOMu; banner na úvodu, XP navíc v awardXp a tip napojuje app.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantWeekend = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const DAY_MS = 86400000;
    const WEEK_MS = 7 * DAY_MS;
    // První víkend rozpisu (pátek); víkend 0 má téma ROTATION[0]
    const EPOCH = '2026-01-02';
    const START_HOUR = 18;
    const MULTIPLIER = 2;
    // Pořadí témat: obory se střídají (humanitní, přírodní, umění, sport), ať dva víkendy po sobě nejsou podobné
    const ROTATION = ['historie', 'zemepis', 'biologie', 'umeni', 'fyzika', 'literatura', 'vlajky', 'hudba', 'chemie', 'film', 'mytologie', 'architektura', 'geologie', 'sport'];
    // „Víkend historie“: název tématu ve 2. pádě (stejné tvary jako diplomy v rewards.js)
    const GENITIVE = {
        zemepis: 'zeměpisu', vlajky: 'vlajek a znaků', historie: 'historie', mytologie: 'mytologie', biologie: 'biologie', geologie: 'geologie',
        chemie: 'chemie', fyzika: 'fyziky', umeni: 'výtvarného umění', architektura: 'architektury', hudba: 'hudby', literatura: 'literatury',
        film: 'filmu', sport: 'sportu'
    };
    const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const dayMs = (day) => { const m = DAY.exec(String(day || '')); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN; };
    const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(dayMs(day) + count * DAY_MS);

    // Pražský den, den v týdnu (1 = pondělí … 7 = neděle) a hodina pro okamžik now; bez Intl s časovými pásmy se vezme UTC + 1
    const pragueParts = (now = new Date()) => {
        const time = now instanceof Date ? now.getTime() : Number(now);
        try {
            const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time));
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const day = `${get('year')}-${get('month')}-${get('day')}`;
            const hour = Number(get('hour'));
            if (Number.isFinite(dayMs(day)) && Number.isFinite(hour)) return { day, weekday: ((new Date(dayMs(day)).getUTCDay() + 6) % 7) + 1, hour, minute: Number(get('minute')) || 0 };
        } catch (error) { /* bez Intl níže */ }
        const shifted = new Date(time + 3600000);
        return { day: shifted.toISOString().slice(0, 10), weekday: ((shifted.getUTCDay() + 6) % 7) + 1, hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
    };
    // Číslo víkendu (pátek RRRR-MM-DD) od EPOCH a jeho téma (null = víkend bez tématu)
    const indexOf = (friday) => Math.round((dayMs(friday) - dayMs(EPOCH)) / WEEK_MS);
    const mod = (value, by) => ((value % by) + by) % by;
    const topicOf = (friday) => {
        const index = indexOf(friday);
        if (!Number.isFinite(index) || mod(index, 2) !== 0) return null;
        return ROTATION[mod(index / 2, ROTATION.length)];
    };
    const titleOf = (topic) => (GENITIVE[topic] ? `Víkend ${GENITIVE[topic]}` : '');
    // Víkend, do kterého okamžik patří: { friday, topic, title, state: 'active' | 'soon', endsDay } nebo null (všední den,
    // víkend bez tématu). 'soon' = pátek před 18:00 (banner ohlásí večerní začátek). endsDay = neděle (konec ve 24:00).
    const at = (now = new Date()) => {
        const p = pragueParts(now);
        let friday = null;
        let state = 'active';
        if (p.weekday === 5) { friday = p.day; if (p.hour < START_HOUR) state = 'soon'; }
        else if (p.weekday === 6) friday = addDays(p.day, -1);
        else if (p.weekday === 7) friday = addDays(p.day, -2);
        if (!friday) return null;
        const topic = topicOf(friday);
        return topic ? { friday, topic, title: titleOf(topic), state, endsDay: addDays(friday, 2) } : null;
    };
    // Běžící tematický víkend (jen 'active'), jinak null
    const active = (now = new Date()) => { const weekend = at(now); return weekend && weekend.state === 'active' ? weekend : null; };
    // Násobek XP za odpověď z tématu topic v okamžiku now (2 o tematickém víkendu jeho tématu, jinak 1)
    const multiplier = (topic, now = new Date()) => { const weekend = active(now); return weekend && weekend.topic === topic ? MULTIPLIER : 1; };
    // Nejbližší tematické víkendy od dneška (včetně běžícího): [{ friday, topic, title }], count kusů
    const upcoming = (now = new Date(), count = 3) => {
        const p = pragueParts(now);
        // Pátek tohoto týdne (od pondělí do neděle); běžící víkend se počítá taky
        let friday = addDays(p.day, 5 - p.weekday);
        const list = [];
        for (let guard = 0; list.length < count && guard < 60; guard++, friday = addDays(friday, 7)) {
            const topic = topicOf(friday);
            if (topic) list.push({ friday, topic, title: titleOf(topic) });
        }
        return list;
    };
    const formatDay = (day) => { const m = DAY.exec(String(day || '')); return m ? `${Number(m[3])}. ${Number(m[2])}.` : ''; };

    // --- HTML (h = pomocné funkce z app.js: topicIcon(id, cls), topicTitle(id)) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    // Text pro čtečku i titulek banneru
    const bannerLabel = (weekend, h = {}) => {
        const topicTitle = h.topicTitle ? h.topicTitle(weekend.topic) : weekend.topic;
        return weekend.state === 'soon'
            ? `${weekend.title}: dnes od 18:00 do neděle 24:00 dvojnásobek XP za otázky z tématu ${topicTitle}`
            : `${weekend.title}: do neděle 24:00 dvojnásobek XP za otázky z tématu ${topicTitle}. Klepni a hraj`;
    };
    // Pruh na úvodu (jeden řádek, ať se úvod vejde i na 360×640): ikona tématu, „Víkend historie · 2× XP“, kdy končí, tlačítko Hrát
    const bannerHtml = (weekend, h = {}) => {
        if (!weekend) return '';
        const soon = weekend.state === 'soon';
        return `
            <button type="button" id="weekend-banner" data-action="weekend-play" data-topic="${esc(weekend.topic)}" data-weekend-state="${weekend.state}" aria-label="${esc(bannerLabel(weekend, h))}" title="${esc(bannerLabel(weekend, h))}" class="weekend-strip flex min-h-[2.25rem] w-full items-center gap-2 rounded-2xl px-2 py-1 text-left text-white shadow-md ring-2 ring-gold-400/70 transition-all active:scale-[0.98]">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/90 short:h-6 short:w-6">${h.topicIcon ? h.topicIcon(weekend.topic, 'h-6 w-6 short:h-5 short:w-5') : '<i data-lucide="calendar-days" class="h-4 w-4 text-brand-800"></i>'}</span>
                <span class="min-w-0 flex-1 truncate text-[12px] font-black leading-tight">${esc(weekend.title)} <span class="font-bold text-gold-200">· ${soon ? 'dnes od 18:00' : 'do neděle'}</span></span>
                <span class="weekend-x2 shrink-0 rounded-lg bg-gold-400 px-1.5 py-0.5 text-[11px] font-black text-brand-950">2× XP</span>
                ${soon ? '' : '<span class="shrink-0 rounded-lg bg-white px-2 py-0.5 text-[11px] font-black text-brand-900">Hrát</span>'}
            </button>`;
    };

    // Když se pruh na záložku Dnes nevejde, ukáže se místo něj malý čip v řadě příležitostných čipů (app.js fitHome): ikona tématu a 2×
    const chipHtml = (weekend, h = {}) => !weekend ? '' : `
            <button type="button" id="weekend-chip" data-action="weekend-play" data-topic="${esc(weekend.topic)}" data-weekend-state="${weekend.state}" aria-label="${esc(bannerLabel(weekend, h))}" title="${esc(bannerLabel(weekend, h))}" class="weekend-strip flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-full px-2.5 text-white shadow-md ring-2 ring-gold-400/70 active:scale-[0.97]">
                <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-white/90">${h.topicIcon ? h.topicIcon(weekend.topic, 'h-5 w-5') : ''}</span>
                <span class="weekend-x2 rounded-md bg-gold-400 px-1 text-[10px] font-black leading-tight text-brand-950">2× XP</span>
            </button>`;

    return { chipHtml, EPOCH, START_HOUR, MULTIPLIER, ROTATION, GENITIVE, pragueParts, indexOf, topicOf, titleOf, at, active, multiplier, upcoming, formatDay, bannerLabel, bannerHtml };
});
