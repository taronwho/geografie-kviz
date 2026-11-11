// Sezóna Mudrlanta: měsíční cesta odměn (jako „season pass“, ale celá zdarma). Sezóna = kalendářní měsíc v Praze („Sezóna Listopad
// 2026“), XP sezóny = XP získané od jejího začátku (kdo aplikaci poprvé otevře uprostřed měsíce, počítá se od té chvíle). 20 stupňů
// s rostoucími kroky; každý dosažený stupeň se vyzvedne klepnutím a dá odměnu:
// - většina stupňů věc pro Mudrlanta, kterou hráč ještě nemá (stejný výběr jako Truhla Mudrlanta: nejbližší věci odemykané úrovní,
//   nikdy věci za odznaky), na stupních FREEZE_TIERS ochranu série (když jich hráč nemá plný počet, jinak věc);
// - 10. stupeň „Truhla v půli sezóny“: dvě věci naráz (truhla s obřadem jako Truhla Mudrlanta);
// - 20. stupeň „Sezónní truhla“: doplněk, rámeček a postavička toho měsíce (Look.SEASON_BUNDLES, jen co už v katalogu je) a titul
//   „Šampion sezóny“. Věci ze sezóny má hráč navždy, jinak se získat nedají (exclusive v look.js).
// Výběr věci je losovaný, ale stejný na všech zařízeních: los je určený sezónou, stupněm a hráčem (rngFor).
// Po konci měsíce jde dosažené a nevyzvednuté stupně minulé sezóny vyzvednout ještě GRACE_DAYS dní, pak propadnou.
// Stav je v odměnách (rewards.js: season, past; sloučení mezi zařízeními tam). Okna a napojení na hru dělá app.js (oddíl „Sezóna“).
//
// Kalibrace stupňů (STEPS) podle skutečných vzorců XP (quiz-core.js answerXp, DAILY_XP, DAILY_ALL_XP, streakXp; daily-quiz.js;
// modes.js xpPer a denní strop; goals.js), průměr ~22 XP za otázku (quiz-core AVERAGE_XP_PER_QUESTION):
// - Aktivní hráč, 15–20 minut denně: Kvíz dne (10 otázek ≈ 200 XP + 30 za dokončení + série až 20 + občas 20 bez chyby ≈ 250 XP),
//   10–14 dnešních otázek (10–14 × (22 + 15 za dnešní otázku + ~16 za sérii) + 50 za všechna témata ≈ 500–800 XP), ~5–15 otázek
//   procvičování nebo Mixu (110–330 XP) a cíle týdne (~(3 × 100 + 200 bonus) / 7 ≈ 70 XP denně) → ~950–1 400 XP za den.
//   Za ~20 hracích dní 19 000–28 000 XP → celá cesta (19 100 XP) vyjde i hráči, který hraje spíš kratší čtvrthodinku.
// - Příležitostný hráč: ~10 dní v měsíci po 5–8 minutách (Kvíz dne nebo pár dnešních otázek ≈ 350–450 XP) → 3 500–6 500 XP
//   = stupeň 8–12 (3 050 / 4 550 / 6 450 XP).
// - První stupně jsou blízko (200, 450, 750 XP): první krátká hra dá první odměnu, aktivní hráč má první den 3–4 stupně.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantLook || (isNode ? require('./look.js') : null), root.MudrlantRewards || (isNode ? require('./rewards.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantSeason = api;
})(typeof self !== 'undefined' ? self : this, (Look, Rewards) => {
    'use strict';
    const TIERS = 20;
    // XP na další stupeň (stupeň 1 = 200 XP od začátku sezóny); součet 19 100 XP
    const STEPS = [200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1450, 1600, 1800, 2000, 2200];
    // Kolik XP sezóny je potřeba celkem na stupeň 1–20
    const THRESHOLDS = STEPS.reduce((list, step) => [...list, (list[list.length - 1] || 0) + step], []);
    const GRACE_DAYS = 7;
    const FREEZE_TIERS = [3, 7, 13, 17];
    const DOUBLE_TIER = 10;
    const BUNDLE_TIER = 20;
    // Když už hráč všechno má (a ochran má plno): body zkušeností místo věci
    const FALLBACK_XP = 150;
    // Obrázky Sezónní truhly, až budou (icons/topics/<jméno>.webp); do té doby obyčejná truhla ve fialovo-stříbrném světle
    const SEASON_CHEST_ART = null; // { closed: 'sezonni-truhla', open: 'sezonni-truhla-otevrena' }
    const MONTHS = Look ? Look.SEASON_MONTHS : ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
    // 2. pád měsíce („odměny listopadu“)
    const MONTHS_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

    // --- Dny a měsíce (Praha) ---
    const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const SEASON = /^(\d{4})-(0[1-9]|1[0-2])$/;
    const parseDay = (day) => { const m = DAY.exec(String(day || '')); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN; };
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const pragueDay = (now = new Date()) => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const text = `${get('year')}-${get('month')}-${get('day')}`;
            if (Number.isFinite(parseDay(text))) return text;
        } catch (error) { /* bez Intl se vezme UTC */ }
        return dayOf(new Date(now).getTime());
    };
    const isSeason = (id) => SEASON.test(String(id || ''));
    const seasonOf = (day) => String(day).slice(0, 7);
    const monthOf = (id) => Number(String(id).slice(5, 7));
    const yearOf = (id) => Number(String(id).slice(0, 4));
    const pad2 = (n) => String(n).padStart(2, '0');
    const shiftSeason = (id, by) => { const index = yearOf(id) * 12 + monthOf(id) - 1 + by; return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`; };
    // „Listopad 2026“
    const label = (id) => (isSeason(id) ? `${MONTHS[monthOf(id) - 1]} ${yearOf(id)}` : '');
    const monthName = (id) => (isSeason(id) ? MONTHS[monthOf(id) - 1] : '');
    // Poslední den sezóny (RRRR-MM-DD)
    const lastDay = (id) => dayOf(Date.UTC(yearOf(id), monthOf(id), 0));
    // Kolik dní sezóny zbývá včetně dneška (0 = skončila)
    const daysLeft = (id, today) => Math.max(0, Math.round((parseDay(lastDay(id)) - parseDay(today)) / 86400000) + 1);
    // Poslední den, kdy jde vyzvednout odměny skončené sezóny (7. den dalšího měsíce)
    const graceEnd = (id) => `${shiftSeason(id, 1)}-${pad2(GRACE_DAYS)}`;
    const inGrace = (id, today) => isSeason(id) && today > lastDay(id) && today <= graceEnd(id);
    const formatDay = (day) => { const m = DAY.exec(String(day || '')); return m ? `${Number(m[3])}. ${Number(m[2])}.` : ''; };
    // První sezóna (spuštění Sezóny Mudrlanta)
    const LAUNCH = '2026-11';
    // Kdy jde sezónní věc (source 'season' s month, look.js) získat, pro Album sbírky (album.js setAvailability, napojuje app.js):
    // 'active' = sezóna jejího měsíce právě běží, 'ended' = sezóna jejího měsíce od spuštění už proběhla (vrátí se za rok),
    // 'upcoming' = ještě nebyla (v albu skrytá); jiná věc null (album rozhodne samo podle dat)
    const availability = (item, category, today) => {
        if (!item || item.source !== 'season' || !item.month || !DAY.test(String(today || ''))) return null;
        const current = seasonOf(today);
        if (monthOf(current) === item.month) return 'active';
        for (let back = 1; back <= 11; back++) {
            const id = shiftSeason(current, -back);
            if (id < LAUNCH) break;
            if (monthOf(id) === item.month) return 'ended';
        }
        return 'upcoming';
    };
    const daysWord = (n) => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');

    // --- Stupně ---
    const tierOf = (seasonXp) => THRESHOLDS.filter(need => seasonXp >= need).length;
    // Postup: { xp, tier (dosažený 0–20), next (null na konci), into / needed = XP v kroku k dalšímu stupni, ratio 0–1 }
    const progressOf = (seasonXp) => {
        const xp = Math.max(0, Math.floor(Number(seasonXp) || 0));
        const tier = tierOf(xp);
        if (tier >= TIERS) return { xp, tier, next: null, into: STEPS[TIERS - 1], needed: STEPS[TIERS - 1], ratio: 1 };
        const base = tier ? THRESHOLDS[tier - 1] : 0;
        return { xp, tier, next: tier + 1, into: xp - base, needed: STEPS[tier], ratio: Math.min(1, (xp - base) / STEPS[tier]) };
    };
    // Co stupeň dává: 'item' (věc), 'freeze' (ochrana série), 'double' (dvě věci v truhle), 'bundle' (Sezónní truhla)
    const kindOf = (tier) => (tier === BUNDLE_TIER ? 'bundle' : tier === DOUBLE_TIER ? 'double' : FREEZE_TIERS.includes(tier) ? 'freeze' : 'item');
    // XP sezóny: běžící = od začátku do teď, minulá = od začátku do konce (endXp)
    const xpOf = (record, xp, past = false) => (!record ? 0 : Math.max(0, (past ? record.endXp ?? record.startXp : Math.floor(Number(xp) || 0)) - record.startXp));

    // --- Stav (v rewards.js) ---
    const parse = (state) => Rewards.parse(state);
    // Sezóna podle dneška: první spuštění v měsíci ji založí od teď, nový měsíc přesune běžící do past (s XP na konci). Vrátí { state, changed }
    const ensure = (state, { today, xp }) => {
        const s = parse(state);
        const id = seasonOf(today);
        const now = Math.max(0, Math.floor(Number(xp) || 0));
        if (!isSeason(id)) return { state: s, changed: false };
        if (!s.season) return { state: { ...s, season: { id, startXp: now, claimed: {} } }, changed: true };
        if (s.season.id >= id) return { state: s, changed: false };
        return { state: { ...s, past: { ...s.season, endXp: Math.max(s.season.startXp, now) }, season: { id, startXp: now, claimed: {} } }, changed: true };
    };
    // Postup z účtu zvedl XP v zařízení o delta (XP získané jinde, ne v sezóně tady): začátky sezón (a konec minulé) se posunou o totéž,
    // ať se cizí XP nezapočítá jako XP sezóny. Sloučení s účtem pak vezme menší startXp, takže XP z jiného zařízení v téže sezóně se
    // vrátí, pokud ho to zařízení do účtu zapsalo (rewards.js mergeSeasons).
    const shift = (state, delta) => {
        const s = parse(state);
        const by = Math.max(0, Math.floor(Number(delta) || 0));
        if (!by) return s;
        return {
            ...s,
            season: s.season ? { ...s.season, startXp: s.season.startXp + by } : null,
            past: s.past ? { ...s.past, startXp: s.past.startXp + by, endXp: s.past.endXp + by } : null
        };
    };
    // Dosažené a nevyzvednuté stupně: [{ which: 'season' | 'past', id, tier }] (nejdřív minulá sezóna, ta propadne dřív)
    const pending = (state, { today, xp }) => {
        const s = parse(state);
        const list = [];
        if (s.past && inGrace(s.past.id, today)) {
            const reached = tierOf(xpOf(s.past, xp, true));
            for (let tier = 1; tier <= reached; tier++) if (!s.past.claimed[tier]) list.push({ which: 'past', id: s.past.id, tier });
        }
        if (s.season && s.season.id === seasonOf(today)) {
            const reached = tierOf(xpOf(s.season, xp));
            for (let tier = 1; tier <= reached; tier++) if (!s.season.claimed[tier]) list.push({ which: 'season', id: s.season.id, tier });
        }
        return list;
    };
    // Přehled pro okna: běžící sezóna (postup, dny do konce) a minulá s nevyzvednutými stupni, dokud jdou vyzvednout
    const info = (state, { today, xp }) => {
        const s = parse(state);
        const list = pending(s, { today, xp });
        const record = s.season && s.season.id === seasonOf(today) ? s.season : null;
        const past = s.past && inGrace(s.past.id, today) ? s.past : null;
        return {
            record, id: record ? record.id : seasonOf(today), progress: progressOf(xpOf(record, xp)), daysLeft: daysLeft(seasonOf(today), today),
            pending: list, current: list.filter(entry => entry.which === 'season'), pastPending: list.filter(entry => entry.which === 'past'),
            past, pastUntil: past ? graceEnd(past.id) : '', pastProgress: past ? progressOf(xpOf(past, xp, true)) : null
        };
    };

    // --- Los (stejný na všech zařízeních) ---
    const hash = (text) => { let h = 2166136261; for (const char of String(text)) { h ^= char.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const mulberry = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rngFor = (id, tier, user = 'host') => mulberry(hash(`sezona|${id}|${tier}|${user || 'host'}`));
    // Odměna stupně jako text (rewards.js SEASON_REWARD) a zpět jako části
    const encode = (parts) => parts.map(part => (part.freeze ? 'freeze' : part.xp ? `xp:${part.xp}` : `${part.category}:${part.item.id}`)).join('+');
    const decode = (text) => String(text || '').split('+').map(token => {
        if (token === 'freeze') return { freeze: true };
        if (token.startsWith('xp:')) return { xp: Number(token.slice(3)) || 0 };
        const [category, id] = token.split(':');
        const item = Look ? Look.find(category, id) : null;
        return item ? { category, item } : null;
    }).filter(Boolean);
    // Věc, kterou hráč nemá: výběr Truhly Mudrlanta (Rewards.candidates, nejbližší NEAREST věci podle úrovně), přednostně jiného druhu
    // než minulé věci; avoid = druhy, kterým se vyhnout, taken = už vybrané věci
    const pickItem = (state, ctx, rng, avoid = [], taken = []) => {
        const list = Rewards.candidates(state, ctx).filter(entry => !taken.some(other => other.category === entry.category && other.item.id === entry.item.id));
        if (!list.length) return null;
        const near = list.slice(0, Rewards.NEAREST);
        const fresh = near.filter(entry => !avoid.includes(entry.category));
        const pool = fresh.length ? fresh : near;
        return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    };
    const owns = (s, category, id) => Boolean(s.gifts[category] && s.gifts[category].includes(id));
    // Vyzvednutí stupně. ctx = { level, badges } (jako look.js), user = id hráče nebo 'host'. Vrátí { state, opened, tier, kind, id,
    // which, parts: [{ category, item } | { freeze } | { xp }], xp (body zkušeností navíc) }; nedosažený nebo už vybraný stupeň nic nedá
    const claim = (state, { which = 'season', tier, ctx = { level: 1, badges: {} }, xp = 0, today, user = 'host', now = Date.now() } = {}) => {
        let s = parse(state);
        const record = which === 'past' ? s.past : s.season;
        const none = { state: s, opened: false, tier, kind: kindOf(tier), id: record ? record.id : '', which, parts: [], xp: 0 };
        if (!record || !Number.isInteger(tier) || tier < 1 || tier > TIERS || record.claimed[tier]) return none;
        if (which === 'past' ? !inGrace(record.id, today) : record.id !== seasonOf(today)) return none;
        if (tierOf(xpOf(record, xp, which === 'past')) < tier) return none;
        const rng = rngFor(record.id, tier, user);
        const kind = kindOf(tier);
        const lastCategory = (() => {
            const previous = Object.keys(record.claimed).map(Number).filter(other => other < tier).sort((a, b) => b - a)[0];
            const part = previous ? decode(record.claimed[previous]).find(entry => entry.category) : null;
            return part ? part.category : null;
        })();
        const parts = [];
        const roomForFreeze = () => s.freezes + parts.filter(part => part.freeze).length < Rewards.MAX_FREEZES;
        const addItem = (avoid) => { const item = pickItem(s, ctx, rng, avoid, parts.filter(part => part.item)); if (item) parts.push(item); return Boolean(item); };
        const addSmall = () => { if (roomForFreeze() && !parts.some(part => part.freeze)) parts.push({ freeze: true }); else parts.push({ xp: FALLBACK_XP }); };
        if (kind === 'bundle') {
            const bundle = Look ? Look.seasonBundle(monthOf(record.id)) : [];
            parts.push(...bundle.filter(entry => !owns(s, entry.category, entry.item.id)));
            // Truhla nesmí být prázdná (hráč už měsíc kdysi dohrál): aspoň jedna věc navíc
            if (!parts.some(part => part.category !== 'titles')) { if (!addItem([])) addSmall(); }
        } else if (kind === 'double') {
            // Dvě věci různého druhu; když chybí, ochrana série nebo body
            if (addItem(lastCategory ? [lastCategory] : [])) { if (!addItem(parts.map(part => part.category))) addSmall(); } else { if (roomForFreeze()) parts.push({ freeze: true }); parts.push({ xp: FALLBACK_XP }); }
        } else if (kind === 'freeze') {
            if (roomForFreeze()) parts.push({ freeze: true });
            else if (!addItem(lastCategory ? [lastCategory] : [])) parts.push({ xp: FALLBACK_XP });
        } else if (!addItem(lastCategory ? [lastCategory] : [])) addSmall();
        // Zapsání: věci mezi dárky, ochrana série (nejvýš plný počet), stupeň vyzvednutý
        const gifts = { ...s.gifts };
        for (const part of parts.filter(entry => entry.item)) gifts[part.category] = [...new Set([...(gifts[part.category] || []), part.item.id])];
        const freezes = parts.filter(part => part.freeze).length;
        const updated = { ...record, claimed: { ...record.claimed, [tier]: encode(parts) } };
        s = { ...s, gifts, [which]: updated };
        if (freezes) s = { ...s, freezes: Math.min(Rewards.MAX_FREEZES, s.freezes + freezes), freezesAt: now };
        return { state: parse(s), opened: true, tier, kind, id: record.id, which, parts, xp: parts.reduce((sum, part) => sum + (part.xp || 0), 0) };
    };

    // --- HTML (h = pomocné funkce z app.js: frameClass) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const formatXp = (value) => Math.round(value).toLocaleString('cs-CZ').replace(/\s/g, ' ');
    const KIND_NAMES = { ...(Rewards ? Rewards.KIND_NAMES : {}), titles: 'titul u jména', avatars: 'postavička' };
    const mm = (id) => pad2(monthOf(id));
    // Znak sezóny: logo Mudrlanta v rámečku měsíce (CSS .frame-sezona-MM)
    const emblemHtml = (id, cls = 'h-10 w-10', text = 'text-[1.6rem]') => `<span class="relative flex ${cls} ${text} shrink-0 items-center justify-center rounded-full bg-white frame frame-sezona-${mm(id)}" aria-hidden="true"><img src="icons/logo.webp" alt="" class="h-[80%] w-[80%] object-contain"></span>`;
    // Ukázka části odměny (věc, ochrana, XP, titul, postavička)
    const prizeHtml = (part, h = {}, size = 'h-16 w-16') => {
        if (part.freeze) return Rewards.freezeArt(`${size} drop-shadow-lg`);
        if (part.xp) return `<span class="flex ${size} flex-col items-center justify-center rounded-full bg-gradient-to-br from-gold-200 to-gold-500 text-brand-950 shadow-lg ring-4 ring-white/70"><i data-lucide="star" class="h-1/3 w-1/3"></i><span class="text-[0.8rem] font-black leading-none">+${part.xp}</span></span>`;
        if (part.category === 'titles') return `<span class="season-title-orb flex ${size} items-center justify-center rounded-full bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 text-brand-950 shadow-lg ring-4 ring-white/70"><i data-lucide="crown" class="h-1/2 w-1/2"></i></span>`;
        if (part.category === 'avatars') return `<img src="icons/avatars/${esc(part.item.id)}.webp" alt="" class="${size} object-contain drop-shadow-lg">`;
        return Rewards.previewHtml(part, h, size);
    };
    const partName = (part) => (part.freeze ? 'Ochrana série' : part.xp ? `+${part.xp} XP` : part.item.title);
    // Jméno v seznamu víc věcí naráz, ať je jasné, co to je („Listopadový rámeček“, „titul Šampion sezóny“, „téma Zlatá“)
    const partLabel = (part) => {
        if (!part.item) return partName(part);
        const title = part.item.title;
        if (part.category === 'frames') return /[ýí]$/.test(title) ? `${title} rámeček` : `rámeček ${title}`;
        if (part.category === 'titles') return `titul ${title}`;
        if (part.category === 'themes') return `téma ${title}`;
        if (part.category === 'colors') return `barva ${title.toLocaleLowerCase('cs')}`;
        if (part.category === 'avatars') return `postavička ${title}`;
        return title;
    };
    // Věta pod odměnou (bez rodu hráče)
    const revealNote = (kind, parts) => {
        if (kind === 'bundle') return `Věci sezóny se jinak získat nedají. Patří ti navždy${parts.some(part => part.category === 'avatars') ? ', postavičku najdeš v Nastavení → Profil' : ''}.`;
        const items = parts.filter(part => part.item);
        if (items.length === 1 && items[0].item.chest) return 'Tahle věc je jen v Truhle Mudrlanta a v Sezóně. Patří ti navždy.';
        if (items.length === 1 && items[0].item.level) return `Odemčeno dřív, jinak až od úrovně ${items[0].item.level}.`;
        if (items.length) return 'Odemčeno dřív, než by přišlo s úrovní.';
        if (parts.some(part => part.freeze)) return 'Zachrání ti jeden vynechaný den.';
        return 'Všechny věci už máš, tak aspoň body zkušeností.';
    };
    const partKind = (part) => (part.freeze ? 'ochrana série' : part.xp ? 'body zkušeností' : KIND_NAMES[part.category] || '');
    // Malá ikona stupně na cestě (nevyzvednutý: co ho čeká)
    const tierIconHtml = (tier, id, ready = false) => {
        const kind = kindOf(tier);
        if (kind === 'bundle') return emblemHtml(id, 'h-7 w-7', 'text-[1.1rem]');
        if (kind === 'double') return Rewards.chestSvg('h-7 w-7');
        if (kind === 'freeze') return Rewards.freezeArt('h-7 w-7');
        return `<span class="flex h-7 w-7 items-center justify-center rounded-full ${ready ? 'bg-white/80 text-violet-700' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200'}"><i data-lucide="sparkles" class="h-4 w-4"></i></span>`;
    };
    const TIER_TEXT = { item: 'Věc pro Mudrlanta, kterou ještě nemáš', freeze: 'Ochrana série (při plném počtu věc)', double: 'Truhla v půli sezóny: dvě věci naráz', bundle: 'Sezónní truhla: rámeček měsíce a titul Šampion sezóny' };
    const bundleText = (id) => {
        const names = (Look ? Look.seasonBundle(monthOf(id)) : []).map(entry => (entry.category === 'titles' ? `titul ${entry.item.title}` : entry.category === 'frames' ? `${entry.item.title} rámeček` : entry.category === 'avatars' ? `postavička ${entry.item.title}` : entry.item.title));
        return names.length ? `Sezónní truhla: ${names.join(', ')}` : TIER_TEXT.bundle;
    };
    const tierText = (tier, id) => (kindOf(tier) === 'bundle' ? bundleText(id) : TIER_TEXT[kindOf(tier)]);
    const countText = (n) => `${n} ${n === 1 ? 'odměna' : n >= 2 && n <= 4 ? 'odměny' : 'odměn'}`;

    // Pruh na úvodu (místo cílů týdne, jako Truhla Mudrlanta): čekající odměny sezóny, klepnutím se vyzvedne první
    const stripHtml = ({ id, count, past = false, until = '' }) => `
            <button type="button" id="weekly-goals" data-action="season-claim" data-season-ready class="season-strip season-m${mm(id)} flex min-h-[2.5rem] w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left text-white shadow-md ring-2 transition-all active:scale-[0.98]">
                ${emblemHtml(id, 'h-7 w-7 -my-1 -ml-0.5 season-mini', 'text-[1.1rem]')}
                <span class="min-w-0 flex-1 truncate text-[12px] font-black leading-tight">${past ? `Sezóna ${esc(monthName(id))}: ${countText(count)} jen do ${formatDay(until)}` : `Sezóna ${esc(monthName(id))}: ${count === 1 ? 'čeká odměna' : `čekají ${countText(count)}`}`}</span>
                <span class="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-black text-violet-900">Vyzvednout</span>
            </button>`;

    // Karta v Mém postupu: znak, stupeň, ukazatel k dalšímu stupni, dny do konce; vpravo Vyzvednout s počtem (nebo šipka do okna)
    const cardHtml = (view) => {
        const { id, progress, daysLeft: left, pending: list } = view;
        const count = list.length;
        const step = progress.next ? `${formatXp(progress.into)} / ${formatXp(progress.needed)} XP` : 'Cesta je celá!';
        return `
        <div data-season-card class="season-card season-m${mm(id)} relative flex items-center gap-1.5 overflow-hidden rounded-2xl p-1.5 pl-2 text-white shadow-sm">
            <button type="button" data-season-open aria-label="Sezóna ${esc(label(id))}: stupeň ${progress.tier} z ${TIERS}, ${step}, ${left} ${daysWord(left)} do konce. Zobrazit cestu odměn" class="flex min-w-0 flex-1 items-center gap-2 text-left">
                ${emblemHtml(id, 'h-10 w-10', 'text-[1.5rem]')}
                <span class="min-w-0 flex-1">
                    <span class="flex items-baseline justify-between gap-2"><span class="truncate text-[13px] font-black leading-tight">Sezóna ${esc(monthName(id))}</span><span class="shrink-0 text-[11px] font-black text-white/90" data-season-level title="Stupeň ${progress.tier} z ${TIERS}">${progress.tier}/${TIERS}</span></span>
                    <span class="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/25" aria-hidden="true"><span class="season-bar block h-full w-0 rounded-full" data-progress="${Math.round(progress.ratio * 100)}"></span></span>
                    <span class="mt-0.5 flex items-center justify-between gap-2 text-[10.5px] font-bold leading-tight text-white/85"><span class="truncate">${step}</span><span class="shrink-0">${left === 1 ? 'poslední den' : `<span class="max-[380px]:hidden">zbývá </span>${left} ${daysWord(left)}`}</span></span>
                </span>
            </button>
            ${count ? `<button type="button" data-season-claim aria-label="Vyzvednout ${countText(count)}" class="season-claim relative flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-xl bg-white pl-2 pr-1.5 text-[12px] font-black text-violet-900 shadow-md"><i data-lucide="sparkles" class="h-4 w-4"></i><span class="max-[380px]:hidden">Vzít</span><span class="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gold-500 px-1 text-[11px] text-brand-950" data-season-count>${count}</span></button>`
                : '<i data-lucide="chevron-right" class="h-5 w-5 shrink-0 text-white/70" aria-hidden="true"></i>'}
        </div>`;
    };

    // Okno sezóny: hlavička (znak, stupeň, ukazatel, dny), případně nevyzvednuté odměny minulé sezóny, celá cesta 20 stupňů (5 × 4)
    // a pod ní popis zvoleného stupně. Dlaždice: zamčená (šedá, XP potřebné na stupeň), čeká (zlatá, svítí), vyzvednutá (co dala).
    const pathHtml = (view, { selected = null, h = {} } = {}) => {
        const { id, record, progress, daysLeft: left, current, pastPending, past, pastUntil } = view;
        const claimed = record ? record.claimed : {};
        const waiting = new Set(current.map(entry => entry.tier));
        const pick = selected || (current[0] ? current[0].tier : Math.min(TIERS, progress.tier + 1));
        const tile = (tier) => {
            const got = claimed[tier] ? decode(claimed[tier]) : null;
            const ready = waiting.has(tier);
            const state = got ? 'claimed' : ready ? 'ready' : 'locked';
            const special = tier === DOUBLE_TIER || tier === BUNDLE_TIER;
            const icon = got && got.length ? `<span class="flex h-7 w-7 items-center justify-center">${prizeHtml(got[0], h, 'h-7 w-7')}</span>` : tierIconHtml(tier, id, ready);
            const foot = got ? '<i data-lucide="check" class="h-3 w-3 stroke-[3]"></i>' : ready ? 'Vzít!' : `${THRESHOLDS[tier - 1] >= 10000 ? `${String(Math.round(THRESHOLDS[tier - 1] / 100) / 10).replace('.', ',')}k` : formatXp(THRESHOLDS[tier - 1])}`;
            const text = `Stupeň ${tier}: ${got ? `vyzvednuto – ${got.map(partName).join(', ')}` : ready ? 'odměna čeká, klepni a vyzvedni ji' : `za ${formatXp(THRESHOLDS[tier - 1])} XP v sezóně`}`;
            const tone = state === 'ready' ? 'season-ready bg-gradient-to-b from-gold-100 to-gold-300 text-brand-950 ring-2 ring-gold-500 shadow-md'
                : state === 'claimed' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-300 dark:bg-slate-800 dark:text-emerald-300 dark:ring-emerald-700'
                    : `bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400${special ? ' ring-1 ring-violet-300 dark:ring-violet-700' : ''}`;
            return `<li><button type="button" data-season-tier="${tier}" data-state="${state}" aria-label="${esc(text)}" aria-pressed="${tier === pick}" class="season-tile relative flex h-[3.6rem] w-full flex-col items-center justify-between rounded-xl px-0.5 pb-1 pt-1 short:h-[3.3rem] ${tone}${tier === pick ? ' outline outline-2 outline-offset-1 outline-violet-600 dark:outline-violet-400' : ''}">
                <span class="absolute left-1 top-0.5 text-[9px] font-black leading-none opacity-80">${tier}</span>
                <span class="${state === 'locked' ? 'opacity-55 grayscale-[60%]' : ''}">${icon}</span>
                <span class="text-[9.5px] font-black leading-none tabular-nums">${foot}</span>
            </button></li>`;
        };
        const tiers = Array.from({ length: TIERS }, (_, index) => tile(index + 1)).join('');
        const got = claimed[pick] ? decode(claimed[pick]) : null;
        const detail = got ? `Vyzvednuto: ${got.map(part => `${partName(part)} (${partKind(part)})`).join(', ')}` : waiting.has(pick) ? `${tierText(pick, id)}. Čeká na tebe!` : `${tierText(pick, id)}. Za ${formatXp(THRESHOLDS[pick - 1])} XP v sezóně${progress.xp < THRESHOLDS[pick - 1] ? ` (chybí ${formatXp(THRESHOLDS[pick - 1] - progress.xp)})` : ''}.`;
        const total = pastPending.length + current.length;
        return `
        <div class="flex flex-col gap-2" data-season-path="${esc(id)}">
            <div class="season-card season-m${mm(id)} flex items-center gap-2.5 rounded-2xl p-2.5 text-white shadow-sm">
                ${emblemHtml(id, 'h-14 w-14', 'text-[2rem]')}
                <div class="min-w-0 flex-1">
                    <p class="flex items-baseline justify-between gap-2"><span class="text-lg font-black leading-tight">Stupeň ${progress.tier} <span class="text-sm text-white/80">z ${TIERS}</span></span><span class="shrink-0 text-[11px] font-bold text-white/85" title="XP získané v této sezóně">${formatXp(progress.xp)} XP</span></p>
                    <span class="mt-1 block h-2 overflow-hidden rounded-full bg-white/25" aria-hidden="true"><span class="season-bar block h-full w-0 rounded-full" data-progress="${Math.round(progress.ratio * 100)}"></span></span>
                    <p class="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] font-bold leading-tight text-white/85"><span class="min-w-0 truncate">${progress.next ? `${formatXp(progress.into)} / ${formatXp(progress.needed)} XP do stupně ${progress.next}` : 'Cesta je hotová!'}</span><span class="shrink-0">${left === 1 ? 'poslední den' : `zbývá ${left} ${daysWord(left)}`}</span></p>
                </div>
            </div>
            ${past && pastPending.length ? `<button type="button" data-season-claim-past class="flex min-h-[2.5rem] items-center gap-2 rounded-2xl bg-gold-100 px-2.5 py-1.5 text-left text-[12px] font-black leading-snug text-gold-900 ring-2 ring-gold-400 dark:bg-gold-900/40 dark:text-gold-100">${emblemHtml(past.id, 'h-7 w-7', 'text-[1.1rem]')}<span class="min-w-0 flex-1">Sezóna ${esc(label(past.id))}: ${countText(pastPending.length)} vyzvedni do ${formatDay(pastUntil)}</span><i data-lucide="chevron-right" class="h-4 w-4 shrink-0"></i></button>` : ''}
            <ol class="grid grid-cols-5 gap-1.5" aria-label="Cesta odměn sezóny">${tiers}</ol>
            <p class="min-h-[2.1rem] text-[12px] font-semibold leading-snug text-slate-700 dark:text-slate-200" data-season-detail role="status"><b>Stupeň ${pick}:</b> ${esc(detail)}</p>
            ${total ? `<button type="button" data-season-claim class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-violet-700 px-4 py-3 text-[15px] font-black text-white"><i data-lucide="sparkles" class="h-5 w-5"></i>Vyzvednout ${countText(total)}</button>` : ''}
        </div>`;
    };

    // Odhalení odměny stupně (okno přes celou obrazovku, jako Truhla Mudrlanta; animace .chest-* a .season-* v src/input.css).
    // Běžný stupeň: pečeť sezóny, po klepnutí praskne a vystoupá z ní věc. 10. stupeň: truhla se dvěma věcmi. 20. stupeň: Sezónní
    // truhla (fialovo-stříbrná, se stuhou sezóny), věci vyjdou jedna po druhé vějířem.
    const SPARKS = 8;
    const revealHtml = ({ id, tier, opened = null, next = 0, h = {} }) => {
        const kind = kindOf(tier);
        const chest = kind === 'double' || kind === 'bundle';
        const parts = opened ? opened.parts : [];
        const fan = parts.length > 1;
        const size = fan ? (parts.length > 2 ? 'h-[3.4rem] w-[3.4rem]' : 'h-16 w-16') : 'h-[5rem] w-[5rem]';
        const prizes = parts.map((part, index) => `<div data-season-prize class="chest-prize season-fan-${index + 1}${part.category === 'frames' ? ' text-[2.2rem]' : ''}">${prizeHtml(part, h, size)}</div>`).join('');
        const art = SEASON_CHEST_ART && kind === 'bundle' ? SEASON_CHEST_ART : { closed: 'truhla', open: 'truhla-otevrena' };
        const body = chest ? `
                        <img src="icons/topics/${art.closed}.webp" alt="" class="chest-lid-closed h-full w-full object-contain drop-shadow-lg">
                        <img src="icons/topics/${art.open}.webp" alt="" class="chest-lid-open h-full w-full object-contain drop-shadow-lg">` : `
                        <span class="chest-lid-closed season-seal flex items-center justify-center"><span class="season-seal-face flex flex-col items-center justify-center"><span class="text-[10px] font-black uppercase tracking-widest">stupeň</span><span class="text-[2.6rem] font-black leading-none">${tier}</span></span></span>
                        <span class="chest-lid-open season-seal season-seal-open"></span>`;
        const title = kind === 'bundle' ? 'Sezónní truhla' : kind === 'double' ? 'Truhla v půli sezóny' : 'Odměna sezóny';
        const result = !opened ? '' : `
            <div data-season-reveal class="chest-show-1 relative z-10 flex flex-col items-center gap-1 text-center">
                ${parts.length === 1 ? `<p class="text-[11px] font-black uppercase tracking-widest text-gold-300">${esc(partKind(parts[0]))}</p>` : ''}
                <p data-season-item class="${parts.length > 1 ? 'text-lg' : 'text-2xl'} font-black leading-tight text-white">${parts.length > 1 ? parts.map(part => esc(partLabel(part))).join(' · ') : esc(partName(parts[0]))}</p>
                <p class="text-xs font-semibold leading-snug text-white/80">${esc(revealNote(kind, parts))}</p>
            </div>`;
        const wearable = parts.find(part => part.item && part.category !== 'colors');
        const actions = opened
            ? `<div class="chest-show-3 relative z-10 flex w-full gap-2">${wearable ? `<button type="button" data-season-wear class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl btn-3d bg-gold-500 px-3 py-3 text-base font-black text-brand-950"><i data-lucide="sparkles" class="h-5 w-5"></i> ${wearable.category === 'themes' ? 'Použít' : 'Nasadit'}</button>` : ''}${next ? `<button type="button" data-season-next class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/20 px-3 py-3 text-base font-black text-white">Další <span class="rounded-full bg-gold-500 px-1.5 text-[12px] text-brand-950">${next}</span></button>` : `<button type="button" data-season-close class="flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-white/15 px-3 py-3 text-base font-bold text-white">${wearable ? 'Později' : 'Super!'}</button>`}</div>`
            : `<p class="chest-hint relative z-10 flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-black text-white ring-1 ring-white/30"><i data-lucide="sparkles" class="h-4 w-4"></i> ${chest ? 'Klepni na truhlu' : 'Klepni na pečeť'}</p>
               <button type="button" data-season-close class="relative z-10 -mb-2 min-h-[2.5rem] px-4 text-xs font-bold text-white/70 underline underline-offset-2">Později</button>`;
        return `
            <div data-season-card class="season-reveal season-m${mm(id)}${kind === 'bundle' ? ' season-royal' : ''} relative flex w-full max-w-xs flex-col items-center gap-3 rounded-[1.8rem] p-5 text-white shadow-2xl ring-2">
                <button type="button" data-season-close data-season-x aria-label="Zavřít" class="absolute right-1.5 top-1.5 z-20 flex h-10 w-10 items-center justify-center rounded-full text-white/70"><i data-lucide="x" class="h-5 w-5"></i></button>
                ${kind === 'bundle' ? `<p class="season-ribbon relative z-10 -mt-1 px-6 py-1 text-[12px] font-black uppercase tracking-wider">Sezóna ${esc(label(id))}</p>` : ''}
                <div class="relative z-10 text-center">
                    <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">${kind === 'bundle' ? 'Celá cesta sezóny' : `${esc(label(id))} · stupeň ${tier}`}</p>
                    <h2 class="text-xl font-black leading-tight">${title}</h2>
                </div>
                <div data-chest-stage class="chest-stage ${opened ? 'chest-opened' : 'chest-waiting'}${chest ? '' : ' season-seal-stage'} relative flex w-full flex-col items-center">
                    <div class="relative z-10 flex h-24 w-full items-end justify-center gap-1.5${fan ? ' season-fan' : ''}">${opened ? prizes : ''}</div>
                    <button type="button" data-season-go aria-label="${chest ? 'Otevřít truhlu' : 'Rozlomit pečeť'}" class="chest-box relative -mt-10 block h-40 w-40 rounded-3xl" ${opened ? 'disabled' : ''}>
                        <span class="chest-halo" aria-hidden="true"></span>
                        ${opened ? '<span class="chest-rays" aria-hidden="true"></span>' : ''}
                        <span class="chest-ring" aria-hidden="true"></span>
                        <span class="chest-sparks" aria-hidden="true">${'<span class="chest-spark"></span>'.repeat(SPARKS)}</span>
                        <span class="chest-body grid h-full w-full" aria-hidden="true">${body}
                        </span>
                    </button>
                </div>
                ${result}${actions}
            </div>`;
    };

    return {
        TIERS, STEPS, THRESHOLDS, GRACE_DAYS, FREEZE_TIERS, DOUBLE_TIER, BUNDLE_TIER, FALLBACK_XP, SEASON_CHEST_ART, MONTHS, MONTHS_GEN,
        pragueDay, isSeason, seasonOf, monthOf, shiftSeason, label, monthName, lastDay, daysLeft, graceEnd, inGrace, formatDay, LAUNCH, availability,
        tierOf, progressOf, kindOf, xpOf, ensure, shift, pending, info, rngFor, encode, decode, pickItem, claim,
        emblemHtml, prizeHtml, partName, partKind, tierText, stripHtml, cardHtml, pathHtml, revealHtml
    };
});
