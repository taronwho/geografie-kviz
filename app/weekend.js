// Tematické víkendy: některé víkendy mají téma („Víkend historie“) a otázky z něj dávají dvojnásobek XP za odpověď, od pátku 18:00
// do neděle 24:00 pražského času. Rozpis je pevný a pro všechny stejný (bez serveru: XP počítá aplikace, server ho jen nechá růst):
// víkendy se číslují od pátku EPOCH po týdnech, téma má každý druhý víkend (sudé číslo) a témata se střídají v pořadí ROTATION.
// Každé téma tak přijde na řadu jednou za tolik dvoutýdnů, kolik je témat. Nové téma se do rozpisu přidá až od začátku dalšího celého
// kola (ROTATION_STEPS), ať se už ohlášené víkendy nezmění. V pátek před 18:00 už úvod ohlásí, že večer začíná („soon“).
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
    const ROTATION = ['historie', 'zemepis', 'biologie', 'umeni', 'fyzika', 'literatura', 'vlajky', 'hudba', 'chemie', 'film', 'mytologie', 'architektura', 'geologie', 'sport', 'jidlo', 'technika'];
    // Kola rozpisu: od tematického víkendu číslo from (0 = EPOCH, 1 = o dva týdny později…) se střídá prvních count témat z ROTATION,
    // znovu od začátku. Jídlo a pití a Technika a vynálezy přibyly od 3. kola (tematický víkend 28 = pátek 29. 1. 2027), první dvě kola měla 14 témat.
    const ROTATION_STEPS = [{ from: 0, count: 14 }, { from: 28, count: 16 }];
    // „Víkend historie“: název tématu ve 2. pádě (stejné tvary jako diplomy v rewards.js)
    const GENITIVE = {
        zemepis: 'zeměpisu', vlajky: 'vlajek a znaků', historie: 'historie', mytologie: 'mytologie', biologie: 'biologie', geologie: 'geologie',
        chemie: 'chemie', fyzika: 'fyziky', umeni: 'výtvarného umění', architektura: 'architektury', hudba: 'hudby', literatura: 'literatury',
        film: 'filmu', sport: 'sportu a her', technika: 'techniky a vynálezů', jidlo: 'jídla a pití'
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
        const slot = index / 2;
        const step = ROTATION_STEPS.filter(entry => slot >= entry.from).pop() || ROTATION_STEPS[0];
        return ROTATION[mod(slot - step.from, step.count)];
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
    // Podtitulek řádku na záložce Dnes (řádek i čip kreslí app.js jednotným stylem)
    const rowText = (weekend) => (weekend.state === 'soon' ? '2× XP · dnes od 18:00' : '2× XP · do neděle');

    return { EPOCH, START_HOUR, MULTIPLIER, ROTATION, ROTATION_STEPS, GENITIVE, pragueParts, indexOf, topicOf, titleOf, at, active, multiplier, upcoming, formatDay, bannerLabel, rowText };
});
