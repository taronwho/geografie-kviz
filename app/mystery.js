// Tajemná otázka dne: každý den (pražský čas) jedna tajemná položka (místo, osobnost, věc) pro všechny hráče. Nápovědy se odkrývají
// během dne podle hodin (1. o půlnoci, 2. v 7:00, pak každé dvě hodiny do 17:00 a 8. ve 20:00); poslední je nejsilnější (ostrá fotka).
// Hráč má na celý den 3 tipy (psaná odpověď, v poslední nápovědě i výběr z možností). Body: uhodnuto s 1. nápovědou 10 bodů, s každou
// další o bod méně (s 8. 3 body), každý předchozí špatný tip ubere bod (nejméně 1). Druhý den se na úvodu ukáže odpověď a jak si vedli ostatní.
// Nápovědy jsou hlavně krátké a netextové: ano/ne, vzdálenost a směr od Prahy, doba (desetiletí, století), indicie a související jméno
// z dat položky (riddleOf), pak fakta, slepá mapa a jen málo přísně zakrytého textu; nakonec rozmazaná a ostrá fotka.
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
    const CLUE_HOURS = [0, 7, 9, 11, 13, 15, 17, 20];
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
    // Přísné zakrytí textových nápověd (Tajemná otázka má být těžká): kromě odpovědi zmizí i státy a národnosti (kmeny z chain.js,
    // „německé“, „Německa“), vlastní jména uprostřed věty („Západní [***]“ → „[***]“) a letopočty („1961–1989“ → „****–****“).
    // Zůstane, o jaký druh věci jde a co se o ní ví obecně; sousední zakrytá slova se slijí do jednoho [***].
    const chainApi = () => {
        try { if (typeof module === 'object' && module.exports && typeof require === 'function') return require('./chain.js'); } catch (error) { /* bez řetězovky jen vlastní jména */ }
        return (typeof self !== 'undefined' && self.MudrlantChain) || null;
    };
    // Jádro (quiz-core.js) pro kontinent a zakrytí odpovědi v indiciích; v prohlížeči je načtené před tímto skriptem
    const coreApi = () => {
        try { if (typeof module === 'object' && module.exports && typeof require === 'function') return require('./quiz-core.js'); } catch (error) { /* bez jádra bez indicií */ }
        return (typeof self !== 'undefined' && self.MudrlantCore) || null;
    };
    let nationalityRe;
    const nationalityPattern = () => {
        if (nationalityRe !== undefined) return nationalityRe;
        const api = chainApi();
        // I množné číslo s měkčením (řecký → řečtí, český → čeští, nizozemský → nizozemští)
        const soft = (stem) => [stem, stem.replace(/ck$/, 'čt').replace(/sk$/, 'št')];
        const stems = api && api.COUNTRY_WORDS ? [...new Set(Object.values(api.COUNTRY_WORDS).flatMap(words => words.slice(2)).flatMap(soft))] : [];
        nationalityRe = stems.length ? new RegExp(`(?<![\\p{L}])(?:${stems.sort((a, b) => b.length - a.length).join('|')})\\p{L}*`, 'giu') : null;
        return nationalityRe;
    };
    const hasNationality = (text) => { const pattern = nationalityPattern(); if (!pattern) return false; pattern.lastIndex = 0; return pattern.test(String(text || '')); };
    const strongMask = (text) => {
        let out = String(text || '');
        const nat = nationalityPattern();
        if (nat) out = out.replace(nat, MARK);
        // Vlastní jména: slovo s velkým písmenem, které nezačíná větu (ani po uvozovce či závorce na začátku věty)
        out = out.replace(/\p{Lu}[\p{L}\-']*/gu, (word, offset, whole) => {
            const before = whole.slice(0, offset).replace(/[„"“(‚'\s]+$/u, '');
            return !before || /[.!?:]$/.test(before) ? word : MARK;
        });
        out = out.replace(/(?<![\d])(1\d{3}|20\d{2})(?![\d])/g, '****');
        // Sousední zakrytá místa jako jedno (i přes spojku „a“ ne – ta zůstane, ať je věta čitelná)
        return out.replace(/\[\*\*\*\](?:\s+\[\*\*\*\])+/g, MARK);
    };
    const realWords = (text) => String(text || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word)).length;
    const sentencesOf = (text) => String(text || '').split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u).map(part => part.trim()).filter(part => realWords(part) >= 3);
    // Nanejvýš dvě věty a asi 240 znaků (první věta vždy celá) – textová nápověda nemá být stěna textu
    const briefText = (sentences, max = 240) => sentences.slice(0, 2).reduce((text, sentence) => (!text ? sentence : text.length + sentence.length < max ? `${text} ${sentence}` : text), '');
    // „M _ _ _ _ _ _ _ _ _“: první písmeno, ostatní písmena jako podtržítka, slova oddělená mezerou navíc
    const answerPattern = (name) => {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        return words.map((word, wi) => [...word].map((char, ci) => (wi === 0 && ci === 0 ? char.toLocaleUpperCase('cs') : /[\p{L}\p{N}]/u.test(char) ? '_' : char)).join(' ')).join('   ');
    };
    // Jak moc nápověda prozrazuje odpověď (zhruba 0 = skoro nic, 1 = skoro jistě). Věta popisu: zakryté výskyty odpovědi (každý dává
    // kontext, třeba „Západní [***]“), vlastní jména uprostřed věty, letopočty a délka; fakt: vlastní jméno nebo letopočet v hodnotě
    // prozradí víc než číslo; obrázek tématu (slepá mapa, osa) je uprostřed. Text i po přísném zakrytí napoví víc než fakta a mapa
    // (souvislosti jako „symbol studené války“), proto má přirážku a textové nápovědy přicházejí až po nich.
    const YEAR = /(?<![\d.,])(1\d{3}|20\d{2})(?![\d.,])/g;
    const textScore = (text) => {
        const plain = String(text || '');
        const masks = (plain.match(/\[\*\*\*\]/g) || []).length;
        const words = plain.replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word));
        const proper = words.filter((word, i) => i > 0 && /^\p{Lu}/u.test(word.replace(/^[„"“(‚']+/u, ''))).length;
        const years = (plain.match(YEAR) || []).length;
        return 0.2 + Math.min(0.32, masks * 0.08) + Math.min(0.42, proper * 0.07) + Math.min(0.3, years * 0.1) + Math.min(0.2, words.length / 120);
    };
    // Související jméno (krátká nápověda): osobnost, místo nebo dílo z faktů, od středně silných (architekt, autor, rodiče, klub)
    // po silné (slavné dílo, kapela, hlavní město, protějšek boha), které přijdou až před fotkou
    const RELATED_LABELS = ['Architekt', 'Autor', 'Libreto', 'Objevitel', 'Vynálezce', 'Pojmenován po', 'Pojmenována po', 'Pojmenováno po', 'Otec', 'Matka', 'Rodiče',
        'Partner', 'Partnerka', 'Partnerky', 'Partneři', 'Sourozenec', 'Sourozenci', 'Klub', 'Kluby', 'Domácí tým', 'Domácí týmy', 'Domácí aréna', 'Soutěž', 'Zahájil',
        'Součást', 'Rod', 'Ústí do', 'Provozovatel', 'Odrůda nerostu', 'Naleziště v Česku', 'Typické příklady', 'Architekti',
        'Město', 'Sbírka', 'Místo', 'Místo vzniku', 'Pořadatel', 'Umístění', 'Na obrázku', 'Slavná stavba', 'Slavné stavby', 'Kapela', 'Členové', 'Postavy', 'Dílo', 'Film', 'Filmy',
        'Slavné dílo', 'Slavná díla', 'Olympijští vítězové', 'Hlavní město', 'Protějšek v římské mytologii', 'Protějšek v řecké mytologii'];
    const STRONG_RELATED = new Set(RELATED_LABELS.slice(RELATED_LABELS.indexOf('Město')));
    // Fakt, který říká, kde to je nebo odkud to je (stát, město, kraj), nebo jméno, se kterým to souvisí, prozradí víc než číslo:
    // přijde až po mapě; slavné dílo, kapela nebo hlavní město skoro až před fotkou
    const PLACE_LABELS = new Set(['Stát', 'Státy', 'Země', 'Země původu', 'Země vynálezce', 'Místo', 'Místo vzniku', 'Město', 'Kraj', 'Hlavní město', 'Pořadatel', 'Umístění', 'Naleziště v Česku', 'Známá naleziště']);
    // Vědecký a latinský název bývá odpovědi podobný (Canis familiaris, Hydrogenium)
    const NAME_LABELS = new Set(['Vědecký název', 'Latinsky']);
    const labelScore = (label) => (STRONG_RELATED.has(label) ? 1 : NAME_LABELS.has(label) ? 0.4 : PLACE_LABELS.has(label) || RELATED_LABELS.includes(label) ? 0.2 : label === 'Kontinent' ? 0.05 : 0);
    const factScore = (fact) => 0.12 + (/\p{Lu}/u.test(fact.value) ? 0.12 : 0) + ((String(fact.value).match(YEAR) || []).length ? 0.06 : 0) + labelScore(fact.label);
    // Nejsilnější fakt, který ještě smí být v první nápovědě (číslo, rok, obecné slovo nebo jedno jméno – ne stát, dílo ani rodiče)
    const OPENER_MAX = 0.3;
    // Krátké nápovědy jsou slabé (hrubá doba, ano/ne, vzdálenost u míst v Česku), indicie a vzdálenost do světa uprostřed, související
    // jméno (autor, architekt, rodiče) až mezi větami popisu a silné (slavné dílo, kapela, hlavní město) úplně nakonec před fotkou
    const partScore = (part) => {
        if (part.type === 'facts') return part.facts.reduce((total, fact) => total + factScore(fact), 0);
        if (part.type === 'text') return 0.35 + textScore(part.text);
        if (part.type === 'visual') return 0.55;
        if (part.type === 'yesno') return 0.1 + 0.03 * part.items.length;
        if (part.type === 'era') return 0.2;
        if (part.type === 'compass') return part.km <= COMPASS_NEAR_KM ? 0.18 : 0.42;
        if (part.type === 'keywords') return 0.4 + 0.03 * part.words.length;
        if (part.type === 'related') return part.strong ? 1.4 : 0.9;
        return 0.3;
    };
    const revealScore = (clue) => clue.parts.reduce((sum, part) => sum + partScore(part), 0);

    // --- Krátké nápovědy z dat (místo dlouhých textů): vzdálenost a směr od Prahy, ano/ne, doba, indicie a související jméno ---
    const NBSP = '\u00a0';
    const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    const groupDigits = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    const fold = (text) => String(text || '').toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Vzdálenost a směr od Prahy (Staroměstské náměstí). Vzdálenost po povrchu Země (haversine), zaokrouhlená podle velikosti
    // (do 100 km na 10 km, do 1 000 km na 50 km, dál na 100 km); směr jako na mapě (loxodroma, stálý kurz): Tokio je na východ
    // a New York na západ, ne „na severovýchod“ a „na severozápad“ podle nejkratší cesty přes sever
    const PRAGUE = { lat: 50.0875, lon: 14.4213 };
    const DIRECTIONS = ['na sever', 'na severovýchod', 'na východ', 'na jihovýchod', 'na jih', 'na jihozápad', 'na západ', 'na severozápad'];
    const COMPASS_MIN_KM = 10;
    // Do této vzdálenosti je to „u nás“ (Česko a těsné okolí): silná, ale brzká nápověda
    const COMPASS_NEAR_KM = 300;
    const RAD = Math.PI / 180;
    const haversineKm = (a, b) => {
        const dLat = (b.lat - a.lat) * RAD;
        const dLon = (b.lon - a.lon) * RAD;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
        return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
    };
    const bearingDeg = (a, b) => {
        let dLon = (b.lon - a.lon) * RAD;
        if (Math.abs(dLon) > Math.PI) dLon -= Math.sign(dLon) * 2 * Math.PI;
        const clamp = (lat) => Math.max(-89, Math.min(89, lat)) * RAD;
        const dPsi = Math.log(Math.tan(Math.PI / 4 + clamp(b.lat) / 2) / Math.tan(Math.PI / 4 + clamp(a.lat) / 2));
        return (Math.atan2(dLon, dPsi) / RAD + 360) % 360;
    };
    const roundKm = (km) => (km < 100 ? Math.round(km / 10) * 10 : km < 1000 ? Math.round(km / 50) * 50 : Math.round(km / 100) * 100);
    const validCoords = (coords) => Boolean(coords) && Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lon))
        && Math.abs(Number(coords.lat)) <= 90 && Math.abs(Number(coords.lon)) <= 180;
    // { km, deg (0 = sever, po 45°), dir: 'na sever', text: 'Asi 300 km na sever od Prahy' }; v Praze (do 10 km) bez směru
    const compassOf = (coords) => {
        if (!validCoords(coords)) return null;
        const point = { lat: Number(coords.lat), lon: Number(coords.lon) };
        const km = haversineKm(PRAGUE, point);
        if (km < COMPASS_MIN_KM) return { km: 0, deg: 0, dir: '', text: `Méně než ${COMPASS_MIN_KM} km od středu Prahy` };
        const index = Math.round(bearingDeg(PRAGUE, point) / 45) % 8;
        const rounded = roundKm(km);
        return { km: rounded, deg: index * 45, dir: DIRECTIONS[index], text: `Asi ${groupDigits(rounded)} km ${DIRECTIONS[index]} od Prahy` };
    };
    // Kdy vzdálenost nedává smysl: řeka (souřadnice jsou jen jeden bod dlouhého toku), Česko samo a odpověď s Prahou v názvu
    // (Pražský hrad, Praha 5 – „od Prahy“ by ji prozradilo)
    const compassFor = (data) => {
        if (!data || !validCoords(data.coords)) return null;
        if (data.topic === 'zemepis' && data.category === 'reka') return null;
        if (data.category === 'stat' && data.isCzech) return null;
        if (/(?<![\p{L}])pra(?:h|z)/u.test(fold(data.name))) return null;
        return compassOf(data.coords);
    };

    // Doba jako hrubý údaj: od roku 1800 desetiletí („60. léta 20. století“), od roku 1000 polovina století, dřív století, před rokem
    // 1000 př. n. l. tisíciletí. Století se počítá přesně (1900 je ještě 19. století: „přelom 19. a 20. století“).
    const centuryOf = (year) => (year > 0 ? Math.ceil(year / 100) : -Math.ceil(-year / 100));
    const centuryText = (century) => (century > 0 ? `${century}. století` : `${-century}. století př. n. l.`);
    const inCentury = (year) => ((year % 100) + 100) % 100;
    const halfOf = (year) => (inCentury(year) === 0 || inCentury(year) > 50 ? 2 : 1);
    const decadeOf = (year) => (year >= 1800 && inCentury(year) >= 10 ? inCentury(year) - (inCentury(year) % 10) : null);
    const eraOfYear = (year) => {
        if (!Number.isInteger(year) || year === 0 || year < -10000) return '';
        if (year >= 1000 && inCentury(year) === 0) return `přelom ${centuryOf(year)}. a ${centuryOf(year) + 1}. století`;
        if (year >= 1800) return decadeOf(year) !== null ? `${decadeOf(year)}. léta ${centuryOf(year)}. století` : `začátek ${centuryOf(year)}. století`;
        if (year >= 1000) return `${halfOf(year)}. polovina ${centuryOf(year)}. století`;
        if (year > -1000) return centuryText(centuryOf(year));
        return `${Math.ceil(-year / 1000)}. tisíciletí př. n. l.`;
    };
    // Rozpětí (doba působení, vlády, války): jedno desetiletí nebo dvě sousední, polovina století, století, nebo „19.–20. století“
    const eraOfSpan = (from, to) => {
        if (!Number.isInteger(from) || !Number.isInteger(to) || from === 0 || to === 0) return '';
        if (to < from) [from, to] = [to, from];
        if (from === to) return eraOfYear(from);
        const first = centuryOf(from);
        const last = centuryOf(to);
        if (first === last) {
            const a = decadeOf(from);
            const b = decadeOf(to);
            if (a !== null && b !== null && a === b) return `${a}. léta ${first}. století`;
            if (a !== null && b !== null && b - a === 10) return `${a}. a ${b}. léta ${first}. století`;
            if (first > 0 && halfOf(from) === halfOf(to)) return `${halfOf(from)}. polovina ${first}. století`;
            return centuryText(first);
        }
        if (first > 0) return `${first}.–${last}. století`;
        if (last < 0) return `${-first}.–${-last}. století př. n. l.`;
        return `${centuryText(first)} – ${last}. století n. l.`;
    };

    // Co znamená rok u věci nebo události podle tématu: pole s rokem vzniku (a konce), druh (made = věc, event = událost,
    // found = objev, invent = vynález) a kategorie, kde rok opravdu je rokem vzniku (u hory nebo parku znamená něco jiného)
    const MADE = {
        zemepis: { cats: ['mesto', 'stavba'], keys: ['year'], kind: 'made' },
        architektura: { cats: ['stavby'], keys: ['y'], kind: 'made' },
        historie: { cats: ['bitva', 'udalosti', 'rise'], keys: ['year', 'from'], ends: ['end', 'to'], kind: 'event' },
        hudba: { cats: ['kapely', 'opery', 'dila'], keys: ['year', 'from'], kind: 'made' },
        literatura: { cats: ['dila'], keys: ['year'], kind: 'made' },
        umeni: { cats: ['sochy', 'obrazy'], keys: ['year'], kind: 'made' },
        film: { cats: ['filmy', 'animovane', 'serialy'], keys: ['year'], ends: ['end'], kind: 'made' },
        sport: { cats: ['olympiady', 'kluby', 'sportoviste', 'souteze', 'sporty'], keys: ['year', 'opened', 'from'], kind: 'made', events: ['olympiady'] },
        fyzika: { cats: ['vesmir', 'vynalezy', 'mise', 'pojmy'], keys: ['year'], kind: 'found', inventions: ['vynalezy'], events: ['mise'] },
        chemie: { cats: ['prvky'], keys: ['year'], kind: 'found' }
    };
    const ERA_LABELS = { made: 'Doba vzniku', event: 'Doba', found: 'Doba objevu', invent: 'Doba vzniku' };
    const madeOf = (item, topicId) => {
        const rule = MADE[topicId];
        const f = item.f || {};
        if (!rule || !rule.cats.includes(item.c) || num(f.born) !== null) return null;
        const key = rule.keys.find(name => Number.isInteger(f[name]) && f[name] !== 0);
        if (!key) return null;
        const endKey = (rule.ends || []).find(name => Number.isInteger(f[name]) && f[name] !== 0 && f[name] >= f[key]);
        const kind = (rule.events || []).includes(item.c) ? 'event' : (rule.inventions || []).includes(item.c) ? 'invent' : rule.kind;
        return { from: f[key], to: endKey ? f[endKey] : f[key], kind, label: topicId === 'historie' && item.c === 'rise' ? 'Doba trvání' : ERA_LABELS[kind] };
    };
    // Doba působení osobnosti: od úřadu, vlády nebo kariéry (from), jinak od dvaceti let; do konce (to), smrti, nebo dodnes
    // (kdo se narodil před víc než sto lety a smrt v datech nemá, nežije – pak jen do roku, kterým ho data připomínají)
    const personSpan = (f, year) => {
        const born = num(f.born);
        const died = num(f.died);
        if (born === null) return null;
        let start = num(f.from);
        if (start === null) start = died !== null && died - born < 25 ? born : born + 20;
        let end = num(f.to);
        if (end === null) end = died !== null ? died : born >= year - 100 ? year : Math.max(start, num(f.y) || start);
        start = Math.round(Math.min(start, year));
        end = Math.round(Math.min(Math.max(start, end), year));
        // Dlouhé působení, které do dalšího století jen nakoukne (Verdi 1833–1901), patří do jednoho století, ne „19.–20. století“
        if (end - start >= 20 && start > 0) {
            if (inCentury(end) >= 1 && inCentury(end) <= 3) end -= inCentury(end);
            if (inCentury(start) >= 97) start += 101 - inCentury(start);
        }
        return { from: start, to: end };
    };
    const eraOf = (item, topicId, year) => {
        const f = item.f || {};
        if (topicId === 'geologie' || topicId === 'biologie' || topicId === 'mytologie') return null;
        const life = personSpan(f, year);
        if (life) {
            const value = eraOfSpan(life.from, life.to);
            return value ? { label: topicId === 'historie' && item.c === 'panovnik' ? 'Doba vlády' : 'Doba působení', value } : null;
        }
        const made = madeOf(item, topicId);
        if (!made || made.from > year) return null;
        const value = made.to !== made.from ? eraOfSpan(made.from, made.to) : eraOfYear(made.from);
        return value ? { label: made.label, value } : null;
    };

    // Ano/ne: jen výroky, které z dat platí jistě (hranice „víc než X“ není těsně u hodnoty – data bývají zaokrouhlená)
    const pickStep = (value, steps, margin = 0.06, gap = 0) => {
        let best = null;
        for (const step of steps) {
            if (Math.abs(value - step) <= Math.max(step * margin, gap)) continue;
            const distance = Math.abs(Math.log(value / step));
            if (!best || distance < best.distance) best = { step, distance };
        }
        return best ? best.step : null;
    };
    const AGE_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000];
    const AGE_QUESTIONS = { made: (step) => `Je to starší než ${groupDigits(step)} let?`, event: (step) => `Stalo se to před víc než ${groupDigits(step)} lety?`,
        found: (step) => `Je objev starší než ${groupDigits(step)} let?`, invent: (step) => `Je vynález starší než ${groupDigits(step)} let?` };
    const ageStatement = (made, year) => {
        const oldest = year - made.from;
        const newest = year - made.to;
        if (newest < 3) return null;
        const step = pickStep((oldest + newest) / 2, AGE_STEPS, 0.06, 2);
        if (!step) return null;
        if (newest > step + Math.max(2, step * 0.06)) return { q: AGE_QUESTIONS[made.kind](step), a: true };
        if (oldest < step - Math.max(2, step * 0.06)) return { q: AGE_QUESTIONS[made.kind](step), a: false };
        return null;
    };
    const HEIGHT_STEPS = { hora: [500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000], stavba: [10, 20, 50, 100, 200, 300, 500] };
    const POP_STEPS = [[1e4, `10${NBSP}000`], [1e5, `100${NBSP}000`], [1e6, 'milion'], [1e7, `10${NBSP}milionů`], [1e8, `100${NBSP}milionů`], [1e9, 'miliardu']];
    const MASS_STEPS = [[0.01, `10${NBSP}g`], [0.1, `100${NBSP}g`], [1, `1${NBSP}kg`], [10, `10${NBSP}kg`], [100, `100${NBSP}kg`], [1000, 'tunu']];
    const LENGTH_STEPS = [100, 200, 500, 1000, 2000, 3000, 5000];
    const CZECHIA = 'Q213';
    const CZECHIA_AREA = 78871;
    // Státy na pomezí Evropy a Asie (Turecko, Gruzie, Ázerbájdžán, Arménie, Kypr, Kazachstán) a Rusko jako celek: „Je to v Evropě?“
    // by nemělo jednu odpověď
    const BORDER_STATES = new Set(['Q43', 'Q230', 'Q227', 'Q399', 'Q229', 'Q232']);
    const RUSSIA = 'Q159';
    const METALS = new Set(['alkalicke-kovy', 'kovy-alkalickych-zemin', 'ostatni-kovy', 'prechodne-kovy', 'lanthanoidy', 'aktinoidy']);
    const NONMETALS = new Set(['nekovy', 'vzacne-plyny', 'halogeny']);
    // Jak daleko od středu sahá velké místo (stát, ostrov, pohoří): poloměr kruhu stejné plochy, nebo polovina délky, s rezervou
    // na protáhlý tvar; „Je to na jižní polokouli?“ se ptá, jen když je celé místo jistě na jedné straně rovníku
    const extentDeg = (item) => {
        const f = item.f || {};
        const area = num(f.area);
        const length = num(f.len);
        const radius = Math.max(area ? Math.sqrt(area / Math.PI) : 0, length ? length / 2 : 0);
        return (item.c === 'stat' || item.c === 'ostrov' ? 3 : 1) + 1.5 * radius / 111;
    };
    const yesNoOf = (item, { topicId, coords, continent, year, typeLabel = '' }) => {
        const f = item.f || {};
        const groups = new Set(item.g || []);
        const where = [];
        const when = [];
        const what = [];
        // Kde: kontinent a polokoule (jen u míst). V okolí Prahy je Evropa jasná, tam se neptá.
        if (validCoords(coords) && continent) {
            const states = item.co || [];
            const border = states.some(id => BORDER_STATES.has(id)) || (item.c === 'stat' && item.q === RUSSIA);
            if (!border && haversineKm(PRAGUE, coords) > 600) where.push({ q: 'Je to v Evropě?', a: continent === 'EU' });
            if (continent !== 'EU' && !(topicId === 'zemepis' && item.c === 'reka') && Math.abs(coords.lat) > extentDeg(item)) {
                where.push({ q: 'Je to na jižní polokouli?', a: coords.lat < 0 });
            }
        }
        if ((topicId === 'zemepis' || topicId === 'vlajky') && groups.has('hlavni-mesta') && !fold(typeLabel).includes('hlavni mesto')) where.push({ q: 'Je to hlavní město státu?', a: true });
        // Kdy: osobnost nežije, věc nebo událost je starší než…
        if (num(f.born) !== null) {
            if (num(f.died) !== null || f.born < year - 110) when.push({ q: 'Žije ještě?', a: false });
        } else {
            const made = madeOf(item, topicId);
            const statement = made && ageStatement(made, year);
            if (statement) when.push(statement);
        }
        // Co: velikost, ocenění a vlastnosti, které data uvádějí přesně
        const more = (q, value, step) => { if (step !== null) what.push({ q, a: value > step }); };
        if (topicId === 'zemepis') {
            const height = item.c === 'hora' ? num(f.elev) : item.c === 'stavba' ? num(f.h) : null;
            if (height !== null && height > 0) { const step = pickStep(height, HEIGHT_STEPS[item.c]); more(`Je vyšší než ${groupDigits(step)} m?`, height, step); }
            const pop = ['mesto', 'stat', 'ostrov'].includes(item.c) ? num(f.pop) : null;
            if (pop !== null && pop > 0) {
                const step = pickStep(pop, POP_STEPS.map(([value]) => value), 0.08);
                if (step !== null) more(`Má víc než ${POP_STEPS.find(([value]) => value === step)[1]} obyvatel?`, pop, step);
            }
            const area = ['stat', 'ostrov', 'jezero'].includes(item.c) ? num(f.area) : null;
            if (area !== null && area >= 5000 && item.q !== CZECHIA && Math.abs(area / CZECHIA_AREA - 1) > 0.08) what.push({ q: 'Je větší než Česko?', a: area > CZECHIA_AREA });
            const length = item.c === 'reka' ? num(f.len) : null;
            if (length !== null && length > 0) { const step = pickStep(length, LENGTH_STEPS); more(`Je delší než ${groupDigits(step)} km?`, length, step); }
        }
        if (f.unesco || ((topicId === 'zemepis' || topicId === 'architektura') && groups.has('unesco'))) what.push({ q: 'Je na seznamu UNESCO?', a: true });
        if (topicId === 'biologie') {
            if (['VU', 'EN', 'CR'].includes(f.iucn)) what.push({ q: 'Je to ohrožený druh?', a: true });
            else if (f.iucn === 'LC') what.push({ q: 'Je to ohrožený druh?', a: false });
            else if (f.iucn === 'EX' || f.iucn === 'EW') what.push({ q: 'Je to vyhynulý druh?', a: true });
            const mass = num(f.mass);
            if (mass !== null && mass > 0) {
                const step = pickStep(mass, MASS_STEPS.map(([value]) => value), 0.1);
                if (step !== null) more(`Může vážit víc než ${MASS_STEPS.find(([value]) => value === step)[1]}?`, mass, step);
            }
            if (groups.has('nase-priroda')) what.push({ q: 'Vyskytuje se v naší přírodě?', a: true });
            if (groups.has('domaci-zvirata')) what.push({ q: 'Je to domácí zvíře?', a: true });
        }
        if (topicId === 'chemie' && item.c === 'prvky') {
            if (METALS.has(f.fam)) what.push({ q: 'Je to kov?', a: true });
            else if (NONMETALS.has(f.fam)) what.push({ q: 'Je to kov?', a: false });
            const melt = num(f.melt);
            const boil = num(f.boil);
            if (f.fam === 'vzacne-plyny' || (boil !== null && boil < 10)) what.push({ q: 'Je za pokojové teploty plyn?', a: true });
            else if ((boil !== null && boil > 30) || (melt !== null && melt > 30)) what.push({ q: 'Je za pokojové teploty plyn?', a: false });
        }
        if (topicId === 'geologie' && Array.isArray(f.h) && f.h.length === 2 && f.h.every(value => num(value) !== null)) {
            // Mohsova stupnice: nehet má tvrdost asi 2,5, sklo asi 5,5
            if (f.h[1] <= 2) what.push({ q: 'Poškrábe se nehtem?', a: true });
            else if (f.h[0] >= 3) what.push({ q: 'Poškrábe se nehtem?', a: false });
            if (f.h[0] >= 6) what.push({ q: 'Je tvrdší než sklo?', a: true });
            else if (f.h[1] <= 5) what.push({ q: 'Je tvrdší než sklo?', a: false });
        }
        if (num(f.gold) > 0) what.push({ q: 'Má olympijské zlato?', a: true });
        if (f.nobel) what.push({ q: 'Má Nobelovu cenu?', a: true });
        if (f.osc && num(f.born) !== null) what.push({ q: 'Má Oscara?', a: true });
        // Nanejvýš tři, střídavě kde, kdy a co
        const result = [];
        for (let i = 0; result.length < 3 && i < 3; i++) [where, when, what].forEach(list => { if (list[i] && result.length < 3) result.push(list[i]); });
        return result;
    };

    // Indicie: krátká slova ze strukturovaných faktů (sloh, směr, žánr, materiál, řád, oblast boha…) a okruhů položky. Nikdy z volného
    // textu; slovo nesmí prozradit odpověď, stát ani národnost (přísné zakrytí ho nechá beze změny) a nesmí opakovat druh položky.
    const KEYWORD_LABELS = ['Sloh', 'Směr', 'Období', 'Žánr', 'Jazyk', 'Materiál', 'Technika', 'Sport', 'Post', 'Disciplína', 'Vybavení', 'Řád', 'Čeleď', 'Jedlost',
        'Skupina FCI', 'Oblast', 'Symboly', 'Skupina', 'Složení', 'Využití', 'Druh', 'Veličina', 'Život'];
    // Okruhy, které už řekla nápověda ano/ne
    const YESNO_GROUPS = new Set(['hlavni-mesta', 'unesco', 'nase-priroda', 'domaci-zvirata']);
    const CONTINENT_WORD = /(?<![\p{L}])(?:evrop|asi[ei]|asij|afri|ameri|austral|oceani|antarkt)/u;
    // Okruh podle doby (Šedesátá léta, Středověk, Literatura 19. století) by jen opakoval nápovědu Doba
    const ERA_WORD = /(?<![\p{L}])(?:leta?|stoleti|tisicileti|pravek|starovek|stredovek|novovek)(?![\p{L}])/u;
    const wordsOf = (text) => fold(text).split(/[^\p{L}]+/u).filter(word => word.length >= 4);
    // Společný začátek slova (most × Mosty a přehrady, tenis × tenistka); size = kolik písmen se porovná
    const sharesStem = (text, others, size = 4) => wordsOf(text).some(word => word.length >= size && others.some(other => other.length >= size && other.slice(0, size) === word.slice(0, size)));
    // Dvě indicie se stejným slovem (pop rock × Rock a punk, sci-fi × Sci-fi a fantasy) nebo jedna uvnitř druhé (elektropop × Pop)
    const overlaps = (a, b) => {
        const words = (text) => fold(text).split(/[^\p{L}]+/u).filter(word => word.length >= 3);
        const left = words(a);
        const right = words(b);
        return left.some(word => right.includes(word)) || (left.length === 1 && fold(b).includes(left[0])) || (right.length === 1 && fold(a).includes(right[0]));
    };
    const listOf = (value) => String(value || '').split(/,\s+/).map(part => part.trim()).filter(Boolean);
    const riddleOf = (item, { ctx, question, typeLabel = '', facts = [], year = new Date().getUTCFullYear() } = {}) => {
        try {
            if (!item || !ctx || !ctx.topic) return null;
            const core = coreApi();
            const topicId = ctx.topic.id;
            const coords = ctx.topic.coords ? ctx.topic.coords(item, ctx) : null;
            const continent = core && ctx.countries && (item.co || []).length ? core.getContinent(item, ctx.countries) : '';
            const reveals = answerGuard(core, question, item, ctx);
            const countryNames = Object.values(ctx.countries || {}).map(country => fold(country && country.name)).filter(name => name.length >= 3);
            const namesCountry = (text) => { const value = ` ${fold(text).replace(/[^\p{L}]+/gu, ' ')} `; return countryNames.some(name => value.includes(` ${name.replace(/[^\p{L}]+/gu, ' ')} `)); };
            const category = (ctx.topic.categories || []).find(entry => entry.key === item.c) || {};
            const kinds = [typeLabel, item.ty, category.one, category.label, ctx.topic.title].flatMap(wordsOf);
            const list = Array.isArray(facts) ? facts.filter(fact => fact && fact.label && fact.value !== undefined && fact.value !== '') : [];
            const factValues = (label) => list.filter(fact => fact.label === label).flatMap(fact => listOf(fact.value));
            // Indicie: nejdřív první hodnota každého faktu, pak okruhy, pak druhé hodnoty faktů
            const sources = KEYWORD_LABELS.map(factValues).filter(values => values.length);
            const collections = new Map((ctx.collections || []).map(entry => [entry.id, entry.label]));
            // Okruh jako výčet („Kostely, kláštery a mešity“) nebo podle doby indicií není
            const groupLabels = (item.g || []).filter(id => !YESNO_GROUPS.has(id)).map(id => collections.get(id))
                .filter(label => label && !label.includes(',') && !ERA_WORD.test(fold(label)));
            const candidates = [...sources.map(values => values[0]), ...groupLabels, ...sources.map(values => values[1]).filter(Boolean)];
            // Jméno z faktů (Sbírka: Louvre, Město: Praha) indicií není, je to související jméno; Prahu už říká vzdálenost od Prahy
            const names = new Set(RELATED_LABELS.flatMap(factValues).map(fold));
            const keywords = [];
            for (const raw of candidates) {
                const word = String(raw).trim();
                if (keywords.length >= 3) break;
                if (word.length < 3 || word.length > 28 || word.split(/\s+/).length > 4 || /\d/.test(word) || !/\p{L}/u.test(word)) continue;
                if (strongMask(word) !== word || CONTINENT_WORD.test(fold(word)) || namesCountry(word) || sharesStem(word, kinds)) continue;
                if (names.has(fold(word)) || /(?<![\p{L}])pra[hz]/u.test(fold(word))) continue;
                // Dvě indicie o tomtéž (šelmy z řádu i z okruhu, rock a „Rock a punk“) by jen zabraly místo
                if (keywords.some(other => fold(other) === fold(word) || sharesStem(word, wordsOf(other), 5) || overlaps(word, other))) continue;
                if (reveals(word)) continue;
                keywords.push(word);
            }
            let related = null;
            for (const label of RELATED_LABELS) {
                const value = factValues(label)[0];
                if (!value || value.length > 48 || !/\p{L}/u.test(value) || namesCountry(value) || CONTINENT_WORD.test(fold(value))) continue;
                // Národnost (české stavovské povstání) by prozradila zemi stejně jako v textu
                if (hasNationality(value)) continue;
                if (keywords.some(word => fold(word) === fold(value)) || reveals(value)) continue;
                related = { name: value, strong: STRONG_RELATED.has(label) };
                break;
            }
            return {
                yesno: yesNoOf(item, { topicId, coords: validCoords(coords) ? { lat: Number(coords.lat), lon: Number(coords.lon) } : null, continent, year, typeLabel }),
                era: eraOf(item, topicId, year),
                keywords: keywords.length >= 2 ? keywords : [],
                related
            };
        } catch (error) {
            return null;
        }
    };
    // Prozrazuje text odpověď? Stejné zakrytí jako popis otázky (hideAnswer) a stejná kontrola jako fakta nápověd (factRevealsAnswer:
    // tvar jména, společný kořen, zkratka); bez jádra je podezřelé všechno
    const answerGuard = (core, rawQuestion, item, ctx) => {
        if (!core || !rawQuestion || !core.hideAnswer) return () => true;
        // Možnosti tajemná otázka neukazuje: zakrývá se jen odpověď, ne jména nesprávných možností (kočkovití × Kočka bažinná)
        const question = { ...rawQuestion, choices: (rawQuestion.choices || []).filter(choice => choice && choice.correct) };
        const answers = core.answerNamesFor(question, item, ctx);
        const extra = core.genericWordsOf(ctx);
        const rootNames = answers.length ? core.specificWords(answers, extra) : '';
        return (text) => {
            const value = String(text || '');
            if (!value.trim()) return true;
            try {
                return core.hideAnswer(value, question, item, ctx).includes(MARK)
                    || core.factRevealsAnswer({ value }, answers, { isGeneric: (word) => core.isGenericWord(word, extra), rootNames });
            } catch (error) {
                return true;
            }
        };
    };
    const letterCount = (name) => (String(name || '').match(/[\p{L}\p{N}]/gu) || []).length;
    const wordCount = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).length;
    // Uložená otázka dne pochází z localStorage: krátké nápovědy jen v očekávaném tvaru (starší otázka je nemá vůbec)
    const shortText = (value, max = 80) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
    const cleanRiddle = (raw) => {
        if (!raw || typeof raw !== 'object') return { yesno: [], era: null, keywords: [], related: null };
        const yesno = (Array.isArray(raw.yesno) ? raw.yesno : []).filter(entry => entry && shortText(entry.q) && typeof entry.a === 'boolean').slice(0, 3).map(entry => ({ q: shortText(entry.q), a: entry.a }));
        const era = raw.era && shortText(raw.era.label, 30) && shortText(raw.era.value, 60) ? { label: shortText(raw.era.label, 30), value: shortText(raw.era.value, 60) } : null;
        const keywords = (Array.isArray(raw.keywords) ? raw.keywords : []).map(word => shortText(word, 32)).filter(Boolean).slice(0, 3);
        const related = raw.related && shortText(raw.related.name, 60) ? { name: shortText(raw.related.name, 60), strong: Boolean(raw.related.strong) } : null;
        return { yesno, era, keywords: keywords.length >= 2 ? keywords : [], related };
    };
    // Přesný fakt přijde až po hrubé nápovědě, která o něm mluví (počet obyvatel po „Má víc než milion obyvatel?“, rok po době vzniku),
    // a nebude ani v první nápovědě – jinak by ano/ne a doba nic nepřidaly
    const COVERS = [
        [/obyvatel/, ['Počet obyvatel']], [/větší než Česko/, ['Rozloha']], [/vyšší než/, ['Nadmořská výška', 'Výška']], [/delší než/, ['Délka']],
        [/ohrožený|vyhynulý/, ['Ohrožení']], [/vážit/, ['Hmotnost']], [/kov\?/, ['Skupina prvků']], [/nehtem|sklo/, ['Tvrdost']],
        [/Nobelovu/, ['Nobelova cena']], [/Oscara/, ['Oscar']], [/olympijské zlato/, ['Olympijské zlato']], [/Žije ještě/, ['Úmrtí', 'Život']],
        [/starší než|před víc než/, ['Vznik', 'Objeven', 'Objeveno', 'Premiéra', 'Rok', 'Založena', 'Založen', 'Otevřeno', 'Od roku', 'Doba']]
    ];
    const ERA_COVERS = ['Vznik', 'Objeven', 'Objeveno', 'Premiéra', 'Rok', 'Založena', 'Založen', 'Otevřeno', 'Od roku', 'Doba', 'Doba trvání',
        'Narození', 'Úmrtí', 'Život', 'Vláda', 'V úřadu', 'Kariéra', 'Termín'];
    // Osm nápověd z dat otázky (tvar createRoundData v app.js): data = { typeLabel, questionText, hints, leadFacts, photoUrl, questionImage,
    // name, coords, topic, category, isCzech, riddle, question: { choices } }. 1. druh a téma (a nejslabší fakt), pak krátké nápovědy
    // (ano/ne, vzdálenost a směr od Prahy, doba, indicie, související jméno), fakta, obrazová nápověda tématu (slepá mapa, osa…) a věty
    // popisu (odpověď i vlastní jména zakrytá) – seřazené od nejslabší; předposlední rozmazaná fotka; poslední ostrá fotka.
    // Každá nápověda: { n, hour, title, icon, parts: [{ type: 'type' | 'facts' | 'text' | 'visual' | 'photo' | 'yesno' | 'compass' | 'era'
    // | 'keywords' | 'related' | 'pattern' | 'choices' | 'note', … }] }
    const buildClues = (data, { topicTitle = '' } = {}) => {
        const hints = (data && Array.isArray(data.hints)) ? data.hints : [];
        const riddle = cleanRiddle(data && data.riddle);
        // Fakt, ze kterého je indicie, odpadne celý (indicie je jeho hádankovou podobou); související jméno z výčtu ve faktu chybí
        // (Kluby: Juventus FC bez Realu Madrid); dobu nahradí i fakt „Století“
        const clueWords = new Set(riddle.keywords.map(fold));
        const used = new Set([...clueWords, ...(riddle.related ? [fold(riddle.related.name)] : [])]);
        const covered = new Set([...COVERS.filter(([pattern]) => riddle.yesno.some(entry => pattern.test(entry.q))).flatMap(([, labels]) => labels),
            ...(riddle.era ? [...ERA_COVERS, 'Století'] : [])]);
        const seen = new Set();
        const facts = [...((data && data.leadFacts) || []), ...hints.filter(hint => hint.kind === 'facts').flatMap(hint => hint.facts || [])]
            .filter(fact => fact && fact.label && fact.value !== undefined && fact.value !== '')
            .filter(fact => { const key = `${fact.label}|${fact.value}`; if (seen.has(key)) return false; seen.add(key); return true; })
            .map(fact => ({ label: String(fact.label), value: String(fact.value) }))
            .filter(fact => !listOf(fact.value).some(part => clueWords.has(fold(part))))
            // Výčet (Kluby: Real Madrid CF, Juventus FC) bez jména, které už je souvisejícím jménem
            .map(fact => (listOf(fact.value).length > 1 && listOf(fact.value).some(part => used.has(fold(part))) ? { ...fact, value: listOf(fact.value).filter(part => !used.has(fold(part))).join(', ') } : fact))
            .filter(fact => fact.value && !used.has(fold(fact.value)) && !(riddle.era && fact.label === 'Století'));
        const weight = (fact) => factScore(fact) + (covered.has(fact.label) ? 0.15 : 0);
        const sentences = sentencesOf(data && data.questionText).map(strongMask).filter(part => realWords(part) >= 3);
        // Úryvek z článku bez vět, které už jsou v popisu (článek často začíná stejně), nanejvýš dvě věty
        const said = new Set(sentences.map(text => text.toLocaleLowerCase('cs')));
        const extraTexts = hints.filter(hint => (hint.kind === 'excerpt' || hint.kind === 'text') && hint.text)
            .map(hint => briefText(sentencesOf(strongMask(hint.text)).filter(text => !said.has(text.toLocaleLowerCase('cs'))))).filter(text => realWords(text) >= 3);
        const visuals = hints.filter(hint => hint.kind === 'visual' && hint.spec).map(hint => ({ spec: hint.spec, label: hint.label || 'obrázek', icon: hint.icon || 'map' }));
        const photo = (data && data.questionImage && data.questionImage.url) || (hints.some(hint => hint.kind === 'photo') && data.photoUrl) || null;
        const name = (data && data.name) || '';
        const middle = photo ? CLUES - 3 : CLUES - 2;
        // První nápověda: druh a nejslabší fakt (ne ten, o kterém mluví ano/ne nebo doba); ostatní fakta od nejslabšího
        const ranked = facts.map((fact, index) => ({ fact, index })).sort((a, b) => weight(a.fact) - weight(b.fact) || a.index - b.index).map(entry => entry.fact);
        const opener = ranked.find(fact => !covered.has(fact.label) && weight(fact) <= OPENER_MAX) || null;
        // Střední nápovědy: krátké nápovědy, fakta, věty popisu (každá zvlášť), obrázky tématu (slepá mapa, osa…) a úryvek z článku;
        // seřadí se podle toho, jak moc odpověď prozrazují (revealScore), od nejslabší. Popis s letopočty, vlastními jmény a několika
        // zakrytými výskyty odpovědi („Západní [***]… Východního [***]“) tak přijde až po slepé mapě, krátká obecná věta naopak brzy.
        // keep = co se nechá, když je materiálu víc, než se vejde (nejdřív vypadne úryvek a další věty – textu má být málo)
        const queue = [];
        const factQueue = ranked.filter(fact => fact !== opener);
        const takeFacts = (count, keep) => {
            const part = factQueue.splice(0, count);
            if (part.length) queue.push({ title: 'Fakta', icon: 'info', keep, bonus: part.filter(fact => covered.has(fact.label)).length * 0.15, parts: [{ type: 'facts', facts: part }] });
        };
        if (riddle.yesno.length) queue.push({ title: 'Ano, nebo ne', icon: 'circle-check', keep: 0, parts: [{ type: 'yesno', items: riddle.yesno }] });
        const compass = compassFor(data);
        if (compass) queue.push({ title: 'Od Prahy', icon: 'compass', keep: 0, parts: [{ type: 'compass', ...compass }] });
        if (riddle.era) queue.push({ title: 'Doba', icon: 'hourglass', keep: 0, parts: [{ type: 'era', label: riddle.era.label, value: riddle.era.value }] });
        if (riddle.keywords.length) queue.push({ title: 'Indicie', icon: 'lightbulb', keep: 0, parts: [{ type: 'keywords', words: riddle.keywords }] });
        if (riddle.related) queue.push({ title: 'Souvislost', icon: 'network', keep: 0, parts: [{ type: 'related', name: riddle.related.name, strong: riddle.related.strong }] });
        takeFacts(1, 1);
        // Úvodní věta popisu je definice („X je …“) a prozradí nejvíc: dostane přirážku, ať přijde až po ostatních větách
        sentences.slice(0, 3).forEach((text, i) => queue.push({ title: 'Z popisu', icon: 'quote', sentence: true, lead: i === 0, keep: i === 0 ? 1 : i === 1 ? 2 : 4, parts: [{ type: 'text', text }] }));
        takeFacts(2, 2);
        // Obrázek tématu (slepá mapa, osa) není text: zůstane vždy
        visuals.slice(0, 2).forEach((visual, i) => queue.push({ title: visual.label.charAt(0).toUpperCase() + visual.label.slice(1), icon: visual.icon, keep: i === 0 ? 0 : 3, parts: [{ type: 'visual', spec: visual.spec }] }));
        extraTexts.slice(0, 1).forEach(text => queue.push({ title: 'Z článku', icon: 'book-open', keep: 4, parts: [{ type: 'text', text }] }));
        while (factQueue.length) takeFacts(2, 3);
        queue.forEach((entry, index) => { entry.order = index; entry.score = revealScore(entry) + (entry.lead ? 0.35 : 0) + (entry.bonus || 0); });
        // Do pěti (šesti) nápověd se vejde nanejvýš osm (devět) kousků, víc by byla zase stěna textu
        const budget = middle + 3;
        const kept = new Set([...queue].sort((a, b) => a.keep - b.keep || a.order - b.order).slice(0, budget));
        const chosen = queue.filter(entry => kept.has(entry)).sort((a, b) => a.score - b.score || a.order - b.order);
        // První zobrazená věta je „Z popisu“, další „Další věta popisu“
        let sentenceSeen = false;
        chosen.forEach(entry => { if (entry.sentence) { if (sentenceSeen) { entry.title = 'Další věta popisu'; entry.icon = 'book-open'; } sentenceSeen = true; } ['sentence', 'lead', 'order', 'score', 'keep', 'bonus'].forEach(key => delete entry[key]); });
        // Záložní nápověda, když data nestačí: jen počet slov (žádná písmena ani konce odpovědi – hádanka má zůstat hádankou)
        const fallbacks = [
            { title: 'Délka odpovědi', icon: 'ruler', parts: [{ type: 'note', text: `Odpověď má ${plural(wordCount(name), 'slovo', 'slova', 'slov')}.` }] }
        ];
        const slots = [];
        if (chosen.length <= middle) {
            slots.push(...chosen);
            // Co nezbude ani na záložní nápovědy (velmi krátká odpověď), přidá k poslední záložní nápovědě poznámku, že nic nového nepřibylo
            for (let i = 0; slots.length < middle; i++) slots.push(fallbacks[i] || { title: 'Bez nové nápovědy', icon: 'hourglass', parts: [{ type: 'note', text: 'Tahle hodina nic nového nepřinesla. Zkus to s tím, co už víš.' }] });
        } else {
            // Víc materiálu než míst: sousední kousky se spojí, nejdřív ty nejmenší (krátké nápovědy k sobě, delší text zůstane sám),
            // nanejvýš dva do jedné nápovědy; přesný fakt se nespojí s hrubou nápovědou o něm (rok vedle doby vzniku by ji prozradil)
            const sizeOf = (group) => group.reduce((sum, entry) => sum + entry.parts.reduce((total, part) => total + (part.type === 'text' ? 1 + part.text.length / 120
                : part.type === 'visual' ? 2.5 : part.type === 'yesno' ? 1 + 0.2 * part.items.length : part.type === 'facts' ? 0.6 + 0.4 * part.facts.length : 1), 0), 0);
            const coarse = (group) => group.some(entry => entry.parts.some(part => part.type === 'yesno' || part.type === 'era'));
            const exact = (group) => group.some(entry => entry.parts.some(part => part.type === 'facts' && part.facts.some(fact => covered.has(fact.label))));
            const clash = (a, b) => (coarse(a) && exact(b)) || (exact(a) && coarse(b));
            // Dva texty spolu jen v nouzi (byla by z nich zase stěna textu)
            const texts = (group) => group.filter(entry => entry.parts.some(part => part.type === 'text')).length;
            const groups = chosen.map(entry => [entry]);
            while (groups.length > middle) {
                let best = -1;
                let bestSize = Infinity;
                for (const strict of [true, false]) {
                    for (let i = 0; i + 1 < groups.length; i++) {
                        const merged = [...groups[i], ...groups[i + 1]];
                        if (strict && (merged.length > 2 || clash(groups[i], groups[i + 1]))) continue;
                        const size = sizeOf(merged) + (texts(merged) > 1 ? 2 : 0);
                        // Při shodě pozdější dvojice: později smí být nápověda větší
                        if (size <= bestSize) { best = i; bestSize = size; }
                    }
                    if (best >= 0) break;
                }
                groups.splice(best, 2, [...groups[best], ...groups[best + 1]]);
            }
            groups.forEach(group => slots.push(group.length === 1 ? group[0] : { title: group.map(entry => (entry.title === 'Další věta popisu' ? 'Z popisu' : entry.title)).filter((title, index, all) => all.indexOf(title) === index).join(' · '), icon: group[group.length - 1].icon, parts: group.flatMap(entry => entry.parts) }));
        }
        const first = { title: 'Co hledáme', icon: 'telescope', parts: [{ type: 'type', topic: topicTitle, label: (data && data.typeLabel) || '' }, ...(opener ? [{ type: 'facts', facts: [opener] }] : [])] };
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
    // Malá růžice: světové strany (S, V, J, Z) a šipka z Prahy (tečka uprostřed) ve směru místa; otočení je atribut SVG, ne inline styl
    const compassSvg = (part) => `<svg viewBox="-30 -30 60 60" class="h-16 w-16 shrink-0" aria-hidden="true">
            <circle r="28" stroke-width="2" class="fill-violet-50 stroke-violet-200 dark:fill-violet-950 dark:stroke-violet-800"></circle>
            ${[['S', 0, -20], ['V', 20, 0], ['J', 0, 20], ['Z', -20, 0]].map(([letter, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" class="fill-slate-500 text-[9px] font-black dark:fill-slate-400">${letter}</text>`).join('')}
            ${part.dir ? `<path transform="rotate(${Number(part.deg) || 0})" d="M0 -15 L5.5 -5 L1.8 -5 L1.8 3 L-1.8 3 L-1.8 -5 L-5.5 -5 Z" class="fill-violet-700 dark:fill-violet-300"></path>` : ''}
            <circle r="3.2" stroke-width="1.2" class="fill-gold-400 stroke-white dark:stroke-slate-900"></circle>
        </svg>`;
    const partHtml = (part, clue, h, view) => {
        if (part.type === 'type') {
            return `<p class="flex flex-wrap items-center gap-1.5 text-[14px] font-bold text-slate-700 dark:text-slate-200">${part.topic ? `<span class="rounded-lg bg-violet-100 px-2 py-0.5 text-[12px] font-black text-violet-800 dark:bg-violet-900/60 dark:text-violet-100">${esc(part.topic)}</span>` : ''}${part.label ? `<span>Hledáme: <b class="text-slate-900 dark:text-white">${esc(part.label)}</b></span>` : ''}</p>`;
        }
        if (part.type === 'facts') return factsHtml(part.facts);
        // Ano/ne: otázka a odpověď jako odznak (zelené Ano, červené Ne)
        if (part.type === 'yesno') {
            return `<ul data-mystery-yesno class="flex flex-col gap-1">${part.items.map(entry => `<li class="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900/60"><span class="min-w-0 flex-1 text-[14px] font-bold leading-snug text-slate-800 dark:text-slate-100">${esc(entry.q)}</span><span class="flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[12px] font-black ${entry.a ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-100' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/70 dark:text-rose-100'}"><i data-lucide="${entry.a ? 'check' : 'x'}" class="h-3.5 w-3.5"></i>${entry.a ? 'Ano' : 'Ne'}</span></li>`).join('')}</ul>`;
        }
        if (part.type === 'compass') {
            const [head, ...rest] = part.dir ? [`Asi ${groupDigits(part.km)} km`, part.dir, 'od Prahy'] : [`Do ${COMPASS_MIN_KM} km`, 'od středu Prahy'];
            return `<div data-mystery-compass class="flex items-center gap-3">${compassSvg(part)}<p class="min-w-0 flex-1 leading-tight"><span class="block text-[22px] font-black text-slate-900 dark:text-white">${esc(head)}</span><span class="block text-[14px] font-bold text-slate-600 dark:text-slate-300">${esc(rest.join(' '))}</span></p></div>`;
        }
        if (part.type === 'era') {
            return `<p data-mystery-era class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900/60"><span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${esc(part.label)}</span><b class="text-[15px] font-black leading-snug text-slate-800 dark:text-slate-100">${esc(part.value)}</b></p>`;
        }
        if (part.type === 'keywords') {
            return `<ul data-mystery-keywords class="flex flex-wrap gap-1.5">${part.words.map(word => `<li class="rounded-full bg-violet-100 px-3 py-1 text-[14px] font-black leading-snug text-violet-900 dark:bg-violet-900/60 dark:text-violet-50">${esc(word)}</li>`).join('')}</ul>`;
        }
        if (part.type === 'related') {
            return `<p data-mystery-related class="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900/60"><span class="text-[13px] font-bold text-slate-600 dark:text-slate-300">Souvisí s:</span><b class="text-[16px] font-black leading-snug text-slate-900 dark:text-white">${esc(part.name)}</b></p>`;
        }
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
        sentencesOf, answerPattern, letterCount, strongMask, textScore, revealScore, buildClues, pointsFor, xpFor,
        PRAGUE, haversineKm, bearingDeg, roundKm, compassOf, compassFor, eraOfYear, eraOfSpan, eraOf, yesNoOf, riddleOf, answerGuard,
        parseState, newEntry, cleanEntry, statusOf, tipsLeft, addTip, wrongTips, shareGrid, shareText, cardInput,
        homeText, homeCardHtml, statsHtml, screenHtml, MARK
    };
});
