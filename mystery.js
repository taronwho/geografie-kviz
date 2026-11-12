// Tajemná otázka dne: každý den (pražský čas) jedna tajemná položka (místo, osobnost, věc) pro všechny hráče. Nápovědy se odkrývají
// během dne podle hodin (1. o půlnoci, 2. ve 4:00, pak každé dvě hodiny až 8. v 16:00); poslední je nejsilnější (první písmeno a čtyři možnosti).
// Hráč má na celý den 3 tipy (psaná odpověď, v poslední nápovědě i výběr z možností). Body: uhodnuto s 1. nápovědou 10 bodů, s každou
// další o bod méně (s 8. 3 body), každý předchozí špatný tip ubere bod (nejméně 1). Druhý den se na úvodu ukáže odpověď a jak si vedli ostatní.
// Čistá logika bez DOMu a sítě (výběr položky ze semínka dne, rozvrh nápověd v pražském čase i při změně času, body, XP, uložený stav, text
// ke sdílení bez prozrazení) a vykreslení jako HTML; app.js napojí data témat (createRoundData), server (social.js, schéma 19) a klepnutí.
// Testy: tests/mystery.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantMystery = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const CLUES = 8;
    // Hodina (pražský čas), od které je nápověda n (index n - 1) vidět; stejné pole má server (mystery_clues_at v supabase/schema.sql)
    const CLUE_HOURS = [0, 4, 6, 8, 10, 12, 14, 16];
    const MAX_TIPS = 3;
    const MAX_POINTS = 10;
    // XP za vyřešení: základ a 2 XP za každý bod (10 bodů = 30 XP jako dokončený Kvíz dne, 3 body = 16 XP)
    const XP_BASE = 10;
    const XP_PER_POINT = 2;
    const KEY = 'mudrlant.mystery';
    const HISTORY_DAYS = 40;

    // --- Dny a hodiny (Praha) ---
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => DAY_PATTERN.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(Date.parse(`${day}T00:00:00Z`) + count * 86400000);
    const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
    let pragueFormat = null;
    try {
        pragueFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    } catch (error) { /* bez Intl se počítá v UTC */ }
    // Pražské datum a čas okamžiku: { day: 'RRRR-MM-DD', minutes: minuty od pražské půlnoci, wall: pražský čas jako by byl v UTC (ms) }
    const pragueClock = (now = Date.now()) => {
        const time = now instanceof Date ? now.getTime() : Number(now);
        if (pragueFormat) {
            const parts = {};
            pragueFormat.formatToParts(new Date(time)).forEach(part => { parts[part.type] = part.value; });
            const hour = Number(parts.hour) % 24;
            const day = `${parts.year}-${parts.month}-${parts.day}`;
            if (isDay(day)) {
                return { day, minutes: hour * 60 + Number(parts.minute), wall: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second)) };
            }
        }
        const date = new Date(time);
        return { day: dayOf(time), minutes: date.getUTCHours() * 60 + date.getUTCMinutes(), wall: time - (time % 1000) };
    };
    const pragueDay = (now = Date.now()) => pragueClock(now).day;
    // Okamžik (ms UTC), kdy je v Praze den day a hodina hour:00. Hodiny nápověd (0, 4–16) nejsou v hodině, která se při změně času
    // přeskočí nebo zopakuje (2:00–3:00), takže je převod jednoznačný.
    const pragueTime = (day, hour, minute = 0) => {
        const [y, m, d] = day.split('-').map(Number);
        const target = Date.UTC(y, m - 1, d, hour, minute);
        let guess = target;
        for (let i = 0; i < 3; i++) guess = target - (pragueClock(guess).wall - guess);
        return guess;
    };
    // Kolik nápověd je v okamžiku now vidět (1–8)
    const cluesAt = (now = Date.now()) => {
        const { minutes } = pragueClock(now);
        return Math.max(1, CLUE_HOURS.filter(hour => hour * 60 <= minutes).length);
    };
    const clueTime = (day, n) => pragueTime(day, CLUE_HOURS[Math.max(1, Math.min(CLUES, n)) - 1]);
    const hourLabel = (n) => `${CLUE_HOURS[n - 1]}:00`;
    // Další nápověda dnes: { n, label: '14:00' } nebo null (všech osm je venku)
    const nextClue = (now = Date.now()) => {
        const shown = cluesAt(now);
        return shown < CLUES ? { n: shown + 1, label: hourLabel(shown + 1) } : null;
    };
    // Čas okamžiku v Praze „9:41“
    const formatClock = (time) => {
        const { minutes } = pragueClock(time);
        return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
    };
    // „12. 11.“ a „12. 11. 2026“
    const formatDay = (day, withYear = false) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? `${Number(match[3])}. ${Number(match[2])}.${withYear ? ` ${match[1]}` : ''}` : '';
    };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const pointsWord = (count) => plural(count, 'bod', 'body', 'bodů');
    const tipsWord = (count) => plural(count, 'tip', 'tipy', 'tipů');
    // „zbývá 1 tip“, „zbývají 2 tipy“, „zbývá 5 tipů“
    const leftWord = (count) => `${count >= 2 && count <= 4 ? 'zbývají' : 'zbývá'} ${tipsWord(count)}`;
    // „s 1 nápovědou“, „s 3 nápovědami“
    const withClues = (count) => `s ${String(count).replace('.', ',')} ${count === 1 ? 'nápovědou' : 'nápovědami'}`;
    // „1 nápověda“, „3 nápovědy“, „5 nápověd“, „3,4 nápovědy“
    const cluesWord = (count) => {
        if (!Number.isInteger(count)) return `${String(count).replace('.', ',')} nápovědy`;
        return plural(count, 'nápověda', 'nápovědy', 'nápověd');
    };

    // --- Náhoda ze semínka (stejná pro všechny hráče, jako v daily-quiz.js) ---
    const hash32 = (text) => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
        return hash >>> 0;
    };
    const seededRandom = (seedText) => {
        let state = hash32(seedText);
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const shuffle = (list, rng) => {
        const result = [...list];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    };
    const seedFor = (day) => `mudrlant-tajemna-${day}`;

    // --- Výběr tajemné položky ---
    // Téma dne: témata se střídají v blocích (každé téma jednou za tolik dní, kolik je témat) v pořadí zamíchaném pro blok;
    // na přelomu bloků se téma nezopakuje dva dny po sobě
    const blockOrder = (block, ids) => shuffle(ids, seededRandom(`mudrlant-tajemna-blok-${block}`));
    const topicForDay = (day, topicIds) => {
        const ids = [...new Set(topicIds || [])].filter(Boolean).sort();
        if (!ids.length) return null;
        if (ids.length === 1) return ids[0];
        const number = dayNumber(day);
        const block = Math.floor(number / ids.length);
        const order = blockOrder(block, ids);
        const previous = blockOrder(block - 1, ids);
        if (order[0] === previous[previous.length - 1]) [order[0], order[1]] = [order[1], order[0]];
        return order[((number % ids.length) + ids.length) % ids.length];
    };
    // Skutečná fotka z Commons (ne vlajka, mapa či znak ve formátu SVG/PNG)
    const hasPhoto = (item) => Boolean(item && item.ih && /\.(jpe?g|webp)$/i.test(String(item.im || '')));
    const factCount = (item) => (item && item.f && typeof item.f === 'object' ? Object.keys(item.f).length : 0);
    // Kandidáti: známé položky (k: 1), na které se dá ptát, s fotkou a aspoň dvěma fakty, z první čtvrtiny kategorie
    // (data témat jsou v kategorii seřazená podle známosti – tajemná otázka má být hádanka na to nejznámější, ne na podrobnosti);
    // bez nich postupně volnější výběr
    // Od 13. 11. 2026 jen nejznámější čtvrtina kategorie a aspoň dva fakty; dřívější dny (už rozehrané) zůstávají, jak byly
    const EASY_FROM = '2026-11-13';
    const candidatesOf = (items, day = EASY_FROM) => {
        const easy = String(day) >= EASY_FROM;
        const list = (items || []).filter(item => item && item.q && item.n);
        const known = list.filter(item => item.k === 1 && !item.nq);
        const byCategory = new Map();
        known.forEach(item => { if (!byCategory.has(item.c)) byCategory.set(item.c, []); byCategory.get(item.c).push(item); });
        const famous = new Set();
        byCategory.forEach(group => group.slice(0, Math.max(1, Math.ceil(group.length / (easy ? 4 : 2)))).forEach(item => famous.add(item.q)));
        const tiers = [
            ...(easy ? [known.filter(item => famous.has(item.q) && hasPhoto(item) && factCount(item) > 1)] : []),
            known.filter(item => famous.has(item.q) && hasPhoto(item) && factCount(item) > 0),
            known.filter(item => hasPhoto(item) && factCount(item) > 0),
            known.filter(item => hasPhoto(item)),
            known,
            list.filter(item => !item.nq),
            list
        ];
        return tiers.find(tier => tier.length) || [];
    };
    // Položka dne v tématu: nejmenší otisk (semínko dne + id), takže nová data změní výběr jen tam, kde nová položka vyhraje
    const pickItem = (day, topicId, items) => {
        let best = null;
        let bestHash = Infinity;
        for (const item of candidatesOf(items, day)) {
            const value = hash32(`${seedFor(day)}|${topicId}|${item.q}`);
            if (value < bestHash || (value === bestHash && String(item.q) < String(best.q))) { best = item; bestHash = value; }
        }
        return best;
    };

    // --- Nápovědy ---
    const MARK = '[***]';
    const realWords = (text) => String(text || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word)).length;
    const sentencesOf = (text) => String(text || '').split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u).map(part => part.trim()).filter(part => realWords(part) >= 3);
    // „M _ _ _ _ _ _ _ _ _“: první písmeno, ostatní písmena jako podtržítka, slova oddělená mezerou navíc
    const answerPattern = (name) => {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        return words.map((word, wi) => [...word].map((char, ci) => (wi === 0 && ci === 0 ? char.toLocaleUpperCase('cs') : /[\p{L}\p{N}]/u.test(char) ? '_' : char)).join(' ')).join('   ');
    };
    const letterCount = (name) => (String(name || '').match(/[\p{L}\p{N}]/gu) || []).length;
    const wordCount = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).length;
    // Osm nápověd z dat otázky (tvar createRoundData v app.js): data = { typeLabel, questionText, hints, leadFacts, photoUrl, questionImage,
    // name, question: { choices } }. 1. druh a téma (a první fakt), pak fakta, věty popisu (odpověď zakrytá), obrazová nápověda tématu
    // (slepá mapa, osa…), další věty; předposlední rozmazaná fotka; poslední ostrá fotka.
    // Každá nápověda: { n, hour, title, icon, parts: [{ type: 'type' | 'facts' | 'text' | 'visual' | 'photo' | 'pattern' | 'choices' | 'note', … }] }
    const buildClues = (data, { topicTitle = '' } = {}) => {
        const hints = (data && Array.isArray(data.hints)) ? data.hints : [];
        const seen = new Set();
        const facts = [...((data && data.leadFacts) || []), ...hints.filter(hint => hint.kind === 'facts').flatMap(hint => hint.facts || [])]
            .filter(fact => fact && fact.label && fact.value !== undefined && fact.value !== '')
            .filter(fact => { const key = `${fact.label}|${fact.value}`; if (seen.has(key)) return false; seen.add(key); return true; })
            .map(fact => ({ label: String(fact.label), value: String(fact.value) }));
        const sentences = sentencesOf(data && data.questionText);
        const extraTexts = hints.filter(hint => (hint.kind === 'excerpt' || hint.kind === 'text') && hint.text && realWords(hint.text) >= 3).map(hint => hint.text);
        const visuals = hints.filter(hint => hint.kind === 'visual' && hint.spec).map(hint => ({ spec: hint.spec, label: hint.label || 'obrázek', icon: hint.icon || 'map' }));
        const photo = (data && data.questionImage && data.questionImage.url) || (hints.some(hint => hint.kind === 'photo') && data.photoUrl) || null;
        const name = (data && data.name) || '';
        // Fronta středních nápověd od nejslabší: fakt, první věta, fakt, obrázek tématu, další věty, zbytek faktů
        const queue = [];
        const factQueue = facts.slice(1);
        const takeFacts = (count) => { const part = factQueue.splice(0, count); if (part.length) queue.push({ title: 'Fakta', icon: 'info', parts: [{ type: 'facts', facts: part }] }); };
        takeFacts(1);
        if (sentences[0]) queue.push({ title: 'Z popisu', icon: 'quote', parts: [{ type: 'text', text: sentences[0] }] });
        takeFacts(2);
        visuals.slice(0, 1).forEach(visual => queue.push({ title: visual.label.charAt(0).toUpperCase() + visual.label.slice(1), icon: visual.icon, parts: [{ type: 'visual', spec: visual.spec }] }));
        if (sentences.length > 1) queue.push({ title: 'Další věty popisu', icon: 'book-open', parts: [{ type: 'text', text: sentences.slice(1, 3).join(' ') }] });
        extraTexts.slice(0, 1).forEach(text => queue.push({ title: 'Z článku', icon: 'book-open', parts: [{ type: 'text', text }] }));
        visuals.slice(1, 2).forEach(visual => queue.push({ title: visual.label.charAt(0).toUpperCase() + visual.label.slice(1), icon: visual.icon, parts: [{ type: 'visual', spec: visual.spec }] }));
        while (factQueue.length) takeFacts(2);
        // Záložní nápověda, když data nestačí: jen počet slov (žádná písmena ani konce odpovědi – hádanka má zůstat hádankou)
        const fallbacks = [
            { title: 'Délka odpovědi', icon: 'ruler', parts: [{ type: 'note', text: `Odpověď má ${plural(wordCount(name), 'slovo', 'slova', 'slov')}.` }] }
        ];
        const middle = photo ? CLUES - 3 : CLUES - 2;
        const slots = [];
        if (queue.length <= middle) {
            slots.push(...queue);
            // Co nezbude ani na záložní nápovědy (velmi krátká odpověď), přidá k poslední záložní nápovědě poznámku, že nic nového nepřibylo
            for (let i = 0; slots.length < middle; i++) slots.push(fallbacks[i] || { title: 'Bez nové nápovědy', icon: 'hourglass', parts: [{ type: 'note', text: 'Tahle hodina nic nového nepřinesla. Zkus to s tím, co už víš.' }] });
        } else {
            // Víc materiálu než míst: rozdělí se rovnoměrně, pozdější nápovědy dostanou víc
            for (let i = 0; i < middle; i++) {
                const from = Math.floor(i * queue.length / middle);
                const to = Math.floor((i + 1) * queue.length / middle);
                const group = queue.slice(from, to);
                slots.push(group.length === 1 ? group[0] : { title: group.map(entry => entry.title).filter((title, index, all) => all.indexOf(title) === index).join(' a '), icon: group[group.length - 1].icon, parts: group.flatMap(entry => entry.parts) });
            }
        }
        const first = { title: 'Co hledáme', icon: 'telescope', parts: [{ type: 'type', topic: topicTitle, label: (data && data.typeLabel) || '' }, ...(facts[0] ? [{ type: 'facts', facts: [facts[0]] }] : [])] };
        const blurred = photo ? [{ title: 'Rozmazaná fotka', icon: 'image', parts: [{ type: 'photo', url: photo, blur: true }] }] : [];
        // Poslední nápověda: ostrá fotka (bez možností a bez písmen – ty hádanku úplně prozradily); bez fotky další věty popisu
        const finalParts = photo ? [{ type: 'photo', url: photo, blur: false }]
            : sentences.length > 3 ? [{ type: 'text', text: sentences.slice(3, 5).join(' ') }]
                : [{ type: 'note', text: 'Víc už Mudrlant neprozradí. Zkus to s tím, co víš.' }];
        const final = { title: photo ? 'Ostrá fotka' : 'Poslední nápověda', icon: photo ? 'image' : 'sparkles', parts: finalParts };
        return [first, ...slots, ...blurred, final].map((clue, index) => ({ ...clue, n: index + 1, hour: CLUE_HOURS[index] }));
    };

    // --- Body a XP ---
    // clues = kolik nápověd bylo vidět při správném tipu, wrong = kolik špatných tipů bylo předtím
    const pointsFor = (clues, wrong = 0) => Math.max(1, MAX_POINTS + 1 - Math.max(1, Math.min(CLUES, clues)) - Math.max(0, wrong));
    const xpFor = (points) => (points > 0 ? XP_BASE + XP_PER_POINT * Math.min(MAX_POINTS, points) : 0);

    // --- Uložený stav v zařízení (mudrlant.mystery) ---
    // days: { den: { topic, q, tips: [{ text, correct, clues, at }], solved, clues, points, at (čas vyřešení), xp, synced, dismissed, seen } }
    // rounds: { den: data otázky } = otázka dne pro nápovědy (stejná po celý den, i když se změní data nebo Wikipedie); jen poslední dva dny
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const cleanTip = (tip) => (tip && typeof tip === 'object' ? { text: String(tip.text || '').slice(0, 80), correct: Boolean(tip.correct), clues: Math.max(1, whole(tip.clues, CLUES)), at: whole(tip.at, 1e14) } : null);
    const cleanEntry = (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const tips = [];
        for (const tip of (Array.isArray(raw.tips) ? raw.tips : []).slice(0, MAX_TIPS)) {
            const clean = cleanTip(tip);
            if (!clean) break;
            tips.push(clean);
            if (clean.correct) break;
        }
        const solvedTip = tips.find(tip => tip.correct);
        return {
            topic: typeof raw.topic === 'string' ? raw.topic.slice(0, 40) : '', q: typeof raw.q === 'string' ? raw.q.slice(0, 40) : '',
            name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : '',
            tips, solved: Boolean(solvedTip), clues: solvedTip ? solvedTip.clues : tips.length ? tips[tips.length - 1].clues : 0,
            points: solvedTip ? pointsFor(solvedTip.clues, tips.indexOf(solvedTip)) : 0, at: solvedTip ? solvedTip.at : 0,
            xp: whole(raw.xp, 1000), synced: Number.isInteger(raw.synced) ? Math.max(0, Math.min(raw.synced, tips.length)) : 0,
            dismissed: Boolean(raw.dismissed), seen: whole(raw.seen, CLUES)
        };
    };
    const parseState = (raw) => {
        const state = { v: 1, days: {}, rounds: {} };
        if (!raw || typeof raw !== 'object') return state;
        if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
            Object.keys(raw.days).filter(isDay).sort().slice(-HISTORY_DAYS).forEach(day => {
                const entry = cleanEntry(raw.days[day]);
                if (entry) state.days[day] = entry;
            });
        }
        if (raw.rounds && typeof raw.rounds === 'object' && !Array.isArray(raw.rounds)) {
            const valid = (round) => Boolean(round && typeof round === 'object' && round.question && Array.isArray(round.question.accepted));
            Object.keys(raw.rounds).filter(day => isDay(day) && valid(raw.rounds[day])).sort().slice(-2).forEach(day => { state.rounds[day] = raw.rounds[day]; });
        }
        return state;
    };
    const newEntry = (pick = {}) => cleanEntry({ topic: pick.topic, q: pick.q, name: pick.name, tips: [] });
    const statusOf = (entry) => (!entry ? 'new' : entry.solved ? 'solved' : entry.tips.length >= MAX_TIPS ? 'failed' : entry.tips.length ? 'open' : 'new');
    const tipsLeft = (entry) => (entry && !entry.solved ? Math.max(0, MAX_TIPS - entry.tips.length) : entry && entry.solved ? 0 : MAX_TIPS);
    // Tip hráče: vrátí nový záznam (nic nemění, když je hotovo)
    const addTip = (entry, { text, correct, clues, at }) => {
        const status = statusOf(entry);
        if (status === 'solved' || status === 'failed') return entry;
        return cleanEntry({ ...entry, tips: [...entry.tips, { text, correct, clues, at }] });
    };
    const wrongTips = (entry) => (entry ? entry.tips.filter(tip => !tip.correct).length : 0);

    // --- Sdílení (bez odpovědi) ---
    // 🔍 za každou nápovědu, která byla vidět navíc před správným tipem, ❌ za špatný tip, ✅ za správný
    const shareGrid = (entry) => {
        if (!entry || !entry.tips.length) return '';
        const lastClues = entry.tips[entry.tips.length - 1].clues;
        return `${'🔍'.repeat(Math.max(0, lastClues - 1))}${entry.tips.map(tip => (tip.correct ? '✅' : '❌')).join('')}`;
    };
    const shareText = ({ appName = 'Mudrlant', day, entry, url = '' }) => [
        `${appName} · Tajemná otázka ${formatDay(day)}`,
        shareGrid(entry),
        entry && entry.solved ? `${entry.clues}. nápověda · ${pointsWord(entry.points)}` : 'tentokrát nevyřešeno',
        url
    ].filter(Boolean).join(' · ');
    // Karta obrázku ke sdílení (share-card.js): mřížka = tipy (správně / špatně), nic z odpovědi
    const cardInput = ({ day, entry, robe, url, appName }) => ({
        kicker: 'Tajemná otázka dne', headline: entry.solved ? 'Vyřešeno!' : 'Tentokrát ne',
        detail: entry.solved ? `${entry.clues}. nápověda · ${pointsWord(entry.points)}` : `${tipsWord(entry.tips.length)} bez úspěchu`,
        grid: entry.tips.map(tip => tip.correct), note: entry.solved && entry.clues <= 2 ? 'Detektivní instinkt!' : 'Uhodneš to rychleji?',
        day, robe, pose: entry.solved ? (entry.points >= 8 ? 'vitez' : 'radost') : 'premysleni', url, appName
    });

    // --- Vykreslení (HTML; h = pomocné funkce z app.js: topicIcon, photoFrame, visualFrame, avatarHtml, xpLine) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const art = (name, cls) => `<img src="icons/topics/${name}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    const ART = 'sova-dalekohled';
    const LABEL = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const SECONDARY = 'flex min-w-0 items-center justify-center gap-1.5 rounded-2xl btn-3d-light bg-white px-2 py-2.5 text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100';
    const PRIMARY = 'flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white disabled:opacity-50';

    // Stav pro kartu na úvodu: view = { kind: 'today' | 'reveal', status, shown, next, entry, name, stats }
    const homeText = (view) => {
        if (view.kind === 'reveal') {
            const stats = view.stats && view.stats.players ? ` · uhodlo ${view.stats.solved_pct} %` : '';
            return `Odpověď: ${view.name || '?'}${stats}`;
        }
        if (view.status === 'solved') return `Vyřešeno v ${view.solvedAt} ${withClues(view.entry.clues)}`;
        if (view.status === 'failed') return 'Tentokrát ne · odpověď zítra';
        return `Nápověda ${view.shown}/${CLUES}${view.next ? ` · další v ${view.next.label}` : ` · ${leftWord(tipsLeft(view.entry))}`}`;
    };
    // Kompaktní pruh (na nízkém displeji jeden řádek nadpisu a stavu, aby se úvod vešel bez posouvání); zlatá tečka = nová nápověda
    const homeCardHtml = (view) => {
        const text = homeText(view);
        const title = view.kind === 'reveal' ? 'Včerejší tajemná otázka' : 'Tajemná otázka dne';
        const fresh = view.kind === 'today' && view.status !== 'solved' && view.status !== 'failed' && view.shown > (view.entry ? view.entry.seen : 0);
        const icon = view.kind === 'reveal' ? 'eye' : view.status === 'solved' ? 'circle-check' : view.status === 'failed' ? 'moon' : 'telescope';
        return `
            <div id="mystery-card" data-mystery-kind="${view.kind}" data-mystery-status="${view.status || ''}" class="relative flex w-full shrink-0 items-stretch overflow-hidden rounded-[1.1rem] bg-gradient-to-r from-indigo-950 via-violet-900 to-indigo-900 text-white shadow-sm ring-1 ring-violet-400/40">
                <button type="button" data-action="${view.kind === 'reveal' ? 'mystery-reveal' : 'mystery-open'}" aria-label="${esc(`${title}: ${text}`)}" class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1 text-left transition-all active:scale-[0.99] short:py-0.5">
                    <span class="relative flex shrink-0">${art(ART, 'h-9 w-9 -my-1 short:h-7 short:w-7')}${fresh ? '<span aria-hidden="true" data-mystery-new class="absolute -right-0.5 top-0 h-2.5 w-2.5 rounded-full bg-gold-400 ring-2 ring-violet-900"></span>' : ''}</span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-[13px] font-black leading-[1.15] text-gold-200 short:text-[12px] short:leading-none">${esc(title)}</span>
                        <span data-mystery-text class="block truncate text-[11px] font-bold leading-[1.15] text-violet-100 short:leading-tight">${esc(text)}</span>
                    </span>
                    <i data-lucide="${icon}" class="h-4 w-4 shrink-0 text-gold-300"></i>
                </button>
                ${view.kind === 'reveal' ? '<button type="button" data-action="mystery-dismiss" aria-label="Skrýt včerejší tajemnou otázku" class="flex w-10 shrink-0 items-center justify-center border-l border-white/15 text-violet-100"><i data-lucide="x" class="h-4 w-4"></i></button>' : ''}
            </div>`;
    };

    const factsHtml = (facts) => `<dl class="grid grid-cols-2 gap-1.5">${facts.map(fact => `<div class="rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900/60"><dt class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${esc(fact.label)}</dt><dd class="text-[14px] font-bold leading-snug text-slate-800 dark:text-slate-100">${esc(fact.value)}</dd></div>`).join('')}</dl>`;
    const partHtml = (part, clue, h, view) => {
        if (part.type === 'type') {
            return `<p class="flex flex-wrap items-center gap-1.5 text-[14px] font-bold text-slate-700 dark:text-slate-200">${part.topic ? `<span class="rounded-lg bg-violet-100 px-2 py-0.5 text-[12px] font-black text-violet-800 dark:bg-violet-900/60 dark:text-violet-100">${esc(part.topic)}</span>` : ''}${part.label ? `<span>Hledáme: <b class="text-slate-900 dark:text-white">${esc(part.label)}</b></span>` : ''}</p>`;
        }
        if (part.type === 'facts') return factsHtml(part.facts);
        if (part.type === 'text') return `<p class="text-[14px] font-medium italic leading-snug text-slate-700 dark:text-slate-200">„${esc(part.text)}“</p>`;
        if (part.type === 'note') return `<p class="text-[14px] font-bold leading-snug text-slate-700 dark:text-slate-200">${esc(part.text)}</p>`;
        if (part.type === 'pattern') return `<p data-mystery-pattern aria-label="${esc(`První písmeno ${part.text.charAt(0)}, ${plural(part.letters, 'písmeno', 'písmena', 'písmen')}`)}" class="break-words rounded-xl bg-violet-50 px-3 py-2 text-center font-mono text-lg font-black tracking-wider text-violet-900 dark:bg-violet-950/60 dark:text-violet-100">${esc(part.text)}</p>`;
        if (part.type === 'visual') return h.visualFrame ? h.visualFrame(part.spec, `mystery-visual-${clue.n}`) : '';
        if (part.type === 'photo') {
            // Ostrá fotka, až když je odkrytá i poslední nápověda; dřív (a v rozmazané nápovědě) rozmazaná
            const blur = part.blur && !view.finished;
            return `<div class="relative h-44 overflow-hidden rounded-2xl">${blur ? `<div data-mystery-photo="blur" data-url="${esc(part.url)}" class="absolute -inset-4 scale-110 bg-cover bg-center blur-lg" aria-hidden="true"></div><span class="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">Rozmazaná fotka</span>` : h.photoFrame ? h.photoFrame(`id="mystery-photo-${clue.n}" data-mystery-photo="sharp" data-url="${esc(part.url)}"`) : ''}</div>`;
        }
        if (part.type === 'choices') {
            if (!view.canGuess) return '';
            return `<div data-mystery-choices class="grid grid-cols-2 gap-1.5">${part.choices.map((label, index) => `<button type="button" data-action="mystery-choice" data-index="${index}" class="btn-3d-light min-h-[2.75rem] rounded-xl bg-white px-2 py-1.5 text-sm font-bold leading-tight text-slate-700 dark:bg-slate-700 dark:text-slate-100">${esc(label)}</button>`).join('')}</div>`;
        }
        return '';
    };
    const clueHtml = (clue, view, h) => {
        const open = clue.n <= view.shown;
        if (!open) {
            return `<li data-mystery-clue="${clue.n}" data-locked class="flex items-center gap-2.5 rounded-2xl border-2 border-dashed border-slate-300 px-3 py-2 text-[13px] font-bold text-slate-500 dark:border-slate-600 dark:text-slate-400"><i data-lucide="lock" class="h-4 w-4 shrink-0"></i><span class="min-w-0 flex-1">${clue.n}. nápověda</span><span class="shrink-0">v ${esc(hourLabel(clue.n))}</span></li>`;
        }
        const newest = clue.n === view.shown && !view.finished;
        return `
            <li data-mystery-clue="${clue.n}" class="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ${newest ? 'ring-2 ring-violet-500 dark:ring-violet-400' : 'ring-slate-200/70 dark:ring-slate-700/70'} dark:bg-slate-800/70">
                <h3 class="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-violet-800 dark:text-violet-200"><i data-lucide="${clue.icon}" class="h-4 w-4"></i><span class="min-w-0 flex-1">${clue.n}. ${esc(clue.title)}</span><span class="shrink-0 font-bold normal-case tracking-normal text-slate-500 dark:text-slate-400">${esc(hourLabel(clue.n))}</span></h3>
                ${clue.parts.map(part => partHtml(part, clue, h, view)).join('')}
            </li>`;
    };
    // Komunita: stats = null (načítá se), false (nedostupné), { hidden } (až po vyřešení), nebo { players, solved, solved_pct, fastest, avg_clues };
    // friends = { rows, friends, rank } nebo null/false
    const statsHtml = ({ stats, friends, guest = false, canLogin = false }, h) => {
        let body;
        if (guest) {
            body = `<p class="text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${canLogin ? 'Po přihlášení uvidíš, kolik hráčů tajemnou otázku uhodlo a jak si vedli tvoji přátelé.' : 'Výsledky ostatních jsou jen pro přihlášené hráče.'}</p>${canLogin ? `<button type="button" data-action="mystery-login" class="${SECONDARY} w-full"><i data-lucide="log-in" class="h-4 w-4"></i> Přihlásit se přes Google</button>` : ''}`;
        } else if (stats === null || stats === undefined) body = '<p class="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Načítám, jak si vedli ostatní…</p>';
        else if (stats === false) body = '<p class="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Výsledky ostatních teď nejsou k dispozici.</p>';
        else if (stats.hidden) body = '<p class="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Jak si vedli ostatní, uvidíš po vyřešení (nebo zítra).</p>';
        else if (!stats.players) body = '<p class="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Zatím nikdo netipoval. Budeš první!</p>';
        else {
            const line = [`Uhodlo ${stats.solved_pct} % hráčů`, stats.fastest ? `nejrychlejší v ${stats.fastest}` : '', stats.solved && stats.avg_clues ? `průměrně ${withClues(stats.avg_clues)}` : ''].filter(Boolean).join(', ');
            const rows = friends && Array.isArray(friends.rows) && friends.rows.length ? `
                <ol data-mystery-friends class="flex flex-col gap-1">
                    ${friends.rows.map(row => `<li data-mystery-row="${esc(row.id)}" class="flex items-center gap-2 rounded-xl px-1.5 py-1 ${row.me ? 'bg-violet-50 ring-1 ring-violet-300 dark:bg-violet-950/50 dark:ring-violet-700' : ''}"><span class="w-6 shrink-0 text-center text-[12px] font-black text-slate-500 dark:text-slate-400">${row.rank}.</span>${h.avatarHtml ? h.avatarHtml(row, 'h-7 w-7 text-sm', !row.me) : ''}<span data-player-name class="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">${esc(row.display_name || 'Hráč')}${row.me ? ' (ty)' : ''}</span><span class="shrink-0 text-right text-[11px] font-bold text-slate-600 dark:text-slate-300">${row.solved ? `${esc(pointsWord(row.points))} · ${row.clues}. nápověda` : 'nevyřešeno'}</span></li>`).join('')}
                </ol>` : friends && friends.friends === 0 ? '<p class="text-[12px] font-semibold text-slate-500 dark:text-slate-400">Přátele si přidáš v profilu hráče.</p>' : '';
            const rank = friends && friends.rank && friends.rows && friends.rows.length > 1 ? `<p data-mystery-friend-rank class="text-[13px] font-black text-violet-800 dark:text-violet-200">Mezi přáteli ${friends.rank}. z ${friends.rows.length}</p>` : '';
            body = `<p data-mystery-community class="text-[14px] font-bold leading-snug text-slate-800 dark:text-slate-100">${esc(line)}</p>${rank}${rows}`;
        }
        return `<section id="mystery-stats" class="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70"><h2 class="${LABEL}">Jak si vedli ostatní</h2>${body}</section>`;
    };
    // Obrazovka: view = { day, past, shown, next, clues, entry, name, canGuess, finished, guest, canLogin, stats, friends, xp, placeholder, pointsNow }
    const screenHtml = (view, h) => {
        const entry = view.entry || newEntry();
        const status = statusOf(entry);
        const left = tipsLeft(entry);
        const header = view.past ? `Tajemná otázka · ${formatDay(view.day, true)}` : `Tajemná otázka dne · ${formatDay(view.day, true)}`;
        const summary = status === 'solved' ? `Vyřešeno v ${formatClock(entry.at)} ${withClues(entry.clues)} · ${pointsWord(entry.points)}`
            : status === 'failed' ? (view.past ? 'Tentokrát nevyřešeno' : 'Tipy došly. Odpověď se dozvíš zítra.')
                : view.past ? 'Nevyřešeno' : `Nápověda ${view.shown}/${CLUES}${view.next ? ` · další v ${view.next.label}` : ''}`;
        const tips = entry.tips.length ? `<ul data-mystery-tips class="flex flex-wrap justify-center gap-1.5">${entry.tips.map(tip => `<li class="flex items-center gap-1 rounded-lg ${tip.correct ? 'bg-emerald-400/25' : 'bg-rose-400/25'} px-2 py-0.5 text-[12px] font-bold text-white"><i data-lucide="${tip.correct ? 'check' : 'x'}" class="h-3.5 w-3.5"></i>${esc(tip.text || 'tip')}</li>`).join('')}</ul>` : '';
        const reveal = (view.past || status === 'solved') && view.name ? `<p data-mystery-answer class="mt-1 text-2xl font-black leading-tight text-gold-200">${esc(view.name)}</p>` : '';
        const form = view.canGuess ? `
            <form id="mystery-form" class="flex flex-col gap-1.5" autocomplete="off">
                <label for="mystery-input" class="${LABEL} px-1">Tvůj tip · ${esc(tipsWord(left))} na celý den · teď za ${esc(pointsWord(view.pointsNow))}</label>
                <div class="flex gap-2">
                    <input id="mystery-input" name="answer" type="text" enterkeyhint="send" placeholder="${esc(view.placeholder || 'Co to je?')}" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-800 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400">
                    <button type="submit" aria-label="Odeslat tip" class="btn-3d flex items-center justify-center rounded-xl bg-violet-700 px-4 text-white shadow-md"><i data-lucide="send" class="h-5 w-5"></i></button>
                </div>
            </form>` : '';
        const clues = (view.clues || []).slice().sort((a, b) => b.n - a.n).filter(clue => clue.n <= view.shown);
        const locked = view.past || view.finished ? [] : (view.clues || []).filter(clue => clue.n > view.shown).slice(0, 1);
        return `
            <div id="mystery-screen" data-mystery-status="${status}" class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-4 pb-6 short:gap-2 short:p-3 dark:bg-slate-900">
                <div class="rounded-[1.5rem] bg-gradient-to-br from-indigo-950 via-violet-900 to-indigo-900 px-4 pb-3 pt-3 text-center text-white shadow-lg short:pt-2">
                    ${art(status === 'solved' ? 'sova-oslava' : ART, 'mx-auto h-16 w-16 short:h-12 short:w-12')}
                    <p class="mt-1 text-[11px] font-black uppercase tracking-widest text-gold-300">${esc(header)}</p>
                    ${reveal}
                    <p data-mystery-summary class="mt-0.5 text-[14px] font-bold text-violet-100">${esc(summary)}</p>
                    ${tips ? `<div class="mt-2">${tips}</div>` : ''}
                    ${view.xp ? h.xpLine(view.xp) : ''}
                </div>
                ${view.notice ? `<p data-mystery-notice role="status" class="rounded-2xl bg-rose-50 px-3 py-2 text-center text-[13px] font-bold text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-100 dark:ring-rose-800">${esc(view.notice)}</p>` : ''}
                ${form}
                ${status === 'solved' || status === 'failed' || view.past ? `
                    <div class="grid grid-cols-2 gap-2">
                        <button type="button" data-action="mystery-share" class="${SECONDARY}"><i data-lucide="share-2" class="h-4 w-4 shrink-0"></i> Sdílet výsledek</button>
                        <button type="button" data-action="mystery-share-image" class="${SECONDARY}"><i data-lucide="image" class="h-4 w-4 shrink-0"></i> Sdílet obrázek</button>
                    </div>` : ''}
                ${status === 'solved' || status === 'failed' || view.past ? statsHtml(view, h) : ''}
                <ol class="flex flex-col gap-2" aria-label="Nápovědy">${clues.map(clue => clueHtml(clue, view, h)).join('')}${locked.map(clue => clueHtml(clue, view, h)).join('')}</ol>
                ${!view.past && !view.finished ? `<p class="px-1 text-[12px] font-semibold leading-snug text-slate-500 dark:text-slate-400">Stejná tajemná otázka pro všechny. Nápovědy přibývají během dne (${CLUE_HOURS.map(hour => `${hour}:00`).join(', ')}). Čím dřív uhodneš, tím víc bodů: s 1. nápovědou ${MAX_POINTS}, s každou další o bod méně a každý špatný tip bod ubere.</p>` : ''}
                <div class="sticky bottom-0 z-10 -mx-4 -mb-6 mt-auto flex flex-col gap-2 bg-slate-50/95 px-4 pb-6 pt-2 backdrop-blur short:-mx-3 short:px-3 dark:bg-slate-900/95">
                    ${view.past ? `<div class="grid grid-cols-2 gap-2"><button type="button" data-action="mystery-dismiss" class="${SECONDARY}"><i data-lucide="eye-off" class="h-4 w-4 shrink-0"></i> Skrýt z úvodu</button><button type="button" data-action="mystery-open" class="${SECONDARY}"><i data-lucide="telescope" class="h-4 w-4 shrink-0"></i> Dnešní otázka</button></div>` : ''}
                    <button type="button" data-action="mystery-home" class="${PRIMARY}"><i data-lucide="house" class="h-5 w-5"></i> Zpět domů</button>
                </div>
            </div>`;
    };

    return {
        CLUES, CLUE_HOURS, MAX_TIPS, MAX_POINTS, XP_BASE, XP_PER_POINT, KEY, ART,
        isDay, addDays, pragueClock, pragueDay, pragueTime, cluesAt, clueTime, hourLabel, nextClue, formatClock, formatDay, pointsWord, tipsWord, withClues, cluesWord,
        hash32, seededRandom, seedFor, topicForDay, hasPhoto, candidatesOf, pickItem, leftWord,
        sentencesOf, answerPattern, letterCount, buildClues, pointsFor, xpFor,
        parseState, newEntry, cleanEntry, statusOf, tipsLeft, addTip, wrongTips, shareGrid, shareText, cardInput,
        homeText, homeCardHtml, statsHtml, screenHtml, MARK
    };
});
