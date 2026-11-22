// Odměny, které lákají hrát dál (bez peněz, nic se nekupuje):
// - Truhla Mudrlanta: za všechny tři cíle týdne (goals.js) jedna truhla. Vždy v ní je věc pro Mudrlanta, kterou hráč ještě nemá:
//   doplněk, barva doplňků, rámeček, talár nebo barevné téma z look.js – z věcí, které by jinak odemkl až vyšší úrovní (nejbližších
//   NEAREST takových), nebo věc jen z truhly (look.js chest: doplňky a Kapybara v lázních). Občas (RARE_CHANCE) místo ní vzácná věc,
//   která jde získat jen z truhly (look.js rare: true, obrázkové rámečky a Zmrzlinový kornout).
//   Věci za odznaky (turnaje, zběhlost v tématu) truhla nedává, ty patří k úspěchu. K tomu ochrana série, dokud jich
//   hráč nemá plný počet. Když už má všechno, dá CHEST_XP XP. Každá věc nejvýš jednou (žádné duplicity).
// - Ochrana série: nejvýš MAX_FREEZES. Z truhly a za každých 7 dní v řadě dnešních otázek (některého tématu) nebo Kvízu dne (nejvýš
//   jedna za den z každého zdroje). Když hráč vynechá právě jeden den, ochrana se při dalším spuštění použije sama: jedna ochrana zachrání
//   ten den pro všechny série (dnešní otázky všech témat i Kvíz dne), série pokračuje (zachráněný den se do délky nepočítá). Chrání se
//   jen série aspoň MIN_PROTECTED dní; dva vynechané dny v řadě ochrana nezachrání.
// - Diplomy: za plné mistrovství tématu (5 hvězdiček) obrázek k sdílení (kreslí share-card.js); den zisku se pamatuje.
// Čistá logika a HTML bez DOMu; okna, animaci truhly a napojení na hru dělá app.js (oddíl „Odměny“).
// - Sezóna Mudrlanta (season.js): stav sezóny (season = tento měsíc, past = minulý kvůli dovybrání) je tady, ať se ukládá a slučuje
//   s ostatními odměnami; počítání stupňů, odměny a okna jsou v season.js. Věci ze sezóny jsou v gifts (i postavičky a tituly).
// Stav v zařízení (mudrlant.rewards), po přihlášení i v účtu (profiles.rewards, schéma 9): merge() sjednotí obě strany.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantLook || (isNode ? require('./look.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantRewards = api;
})(typeof self !== 'undefined' ? self : this, (Look) => {
    'use strict';
    const KEY = 'mudrlant.rewards';
    const MAX_FREEZES = 2;
    const MIN_PROTECTED = 3;
    const FREEZE_EVERY = 7;
    const CHEST_XP = 250;
    // Robotí postavičky (look.js ROBOT_AVATARS): robot se odemkne po tolika porážkách v Dobývání
    const ROBOT_WINS = 3;
    const NEAREST = 6;
    // Druhy věcí v truhle (klíče katalogu look.js) a jak se jmenují v textech
    const GIFT_CATEGORIES = ['accessories', 'colors', 'frames', 'robes', 'themes'];
    const KIND_NAMES = { accessories: 'doplněk Mudrlanta', colors: 'barva doplňků', frames: 'rámeček profilu', robes: 'talár Mudrlanta', themes: 'barevné téma', avatars: 'postavička', titles: 'titul u jména' };
    // Věci, které hráč může mít jako dárek: z truhly (GIFT_CATEGORIES) a navíc ze Sezónní truhly (postavička a titul)
    const OWN_CATEGORIES = [...GIFT_CATEGORIES, 'avatars', 'titles'];
    // Druhy, ze kterých truhla dává jen věci určené pro truhlu (look.js chest a rare), věci za úroveň ne: postavičky za úroveň
    // patří k úrovni (Kapybara v lázních je jen z truhly, Zmrzlinový kornout vzácný dárek)
    const CHEST_ONLY_CATEGORIES = ['avatars'];
    const CHEST_CATEGORIES = [...GIFT_CATEGORIES, ...CHEST_ONLY_CATEGORIES];
    const LIMITS = { chests: 80, ready: 12, frozen: 90, frozenTopic: 30, frozenTopics: 30, earned: 40 };

    // --- Dny (RRRR-MM-DD) ---
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const isDay = (day) => DAY.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
    const formatDay = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : ''; };
    // ISO týden dne jako „2026-W46“ (stejně jako player_items_week ve schema.sql; klíč pomůcky z truhly chest:<týden>)
    const isoWeek = (day) => {
        if (!isDay(day)) return '';
        const date = new Date(`${day}T00:00:00Z`);
        const weekday = (date.getUTCDay() + 6) % 7;
        date.setUTCDate(date.getUTCDate() - weekday + 3);
        const year = date.getUTCFullYear();
        const first = new Date(Date.UTC(year, 0, 4));
        const week = 1 + Math.round(((date - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
        return `${year}-W${String(week).padStart(2, '0')}`;
    };

    // --- Stav ---
    const ID = /^[a-z0-9-]{1,30}$/;
    const KEY_PATTERN = /^[a-z]:\d{4}-\d{2}-\d{2}$/;
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const catalogIds = (category) => (Look && Look.CATALOG[category] ? Look.CATALOG[category].map(item => item.id) : null);
    const cleanIds = (list, category) => {
        const known = catalogIds(category);
        return [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && ID.test(id) && (!known || known.includes(id))))];
    };
    const lastDays = (list, limit) => [...new Set((Array.isArray(list) ? list : []).filter(isDay))].sort().slice(-limit);
    const REWARD = /^(?:xp|(accessories|colors|frames|robes|themes|avatars):[a-z0-9-]{1,30})$/;
    const empty = () => ({ v: 1, gifts: Object.fromEntries(OWN_CATEGORIES.map(category => [category, []])), chests: {}, ready: [], freezes: 0, freezesAt: 0, frozen: [], frozenQuiz: [], frozenTopics: {}, earned: [], checked: '', diplomas: {}, robots: {}, name: '', season: null, past: null });

    // --- Sezóna (season.js): { id: 'RRRR-MM', startXp, claimed: { stupeň: odměna } }, minulá sezóna navíc endXp ---
    // Odměna stupně: části spojené „+“: 'kategorie:id' (věc), 'freeze' (ochrana série), 'xp:N'
    const SEASON_ID = /^\d{4}-(?:0[1-9]|1[0-2])$/;
    // pomucka:<druh> = pomůcka do Dobývání (Ankh vzkříšení od bloku 39) nebo Řetězovky místo věci (season.js POMUCKA_TIERS, blok 30 ve schema.sql)
    const SEASON_PART = '(?:freeze|xp:\\d{1,4}|pomucka:(?:fifty|extra_move|chain_rescue|revive)|(?:accessories|colors|frames|robes|themes|avatars|titles):[a-z0-9-]{1,30})';
    const SEASON_REWARD = new RegExp(`^${SEASON_PART}(?:\\+${SEASON_PART}){0,5}$`);
    const SEASON_TIERS = 20;
    const cleanSeason = (raw, past = false) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !SEASON_ID.test(String(raw.id || ''))) return null;
        const claimed = raw.claimed && typeof raw.claimed === 'object' && !Array.isArray(raw.claimed) ? raw.claimed : {};
        const record = { id: raw.id, startXp: whole(raw.startXp, 1e9), claimed: Object.fromEntries(Object.entries(claimed)
            .filter(([tier, reward]) => /^\d{1,2}$/.test(tier) && Number(tier) >= 1 && Number(tier) <= SEASON_TIERS && typeof reward === 'string' && SEASON_REWARD.test(reward))
            .sort(([a], [b]) => Number(a) - Number(b))) };
        if (past) record.endXp = Math.max(record.startXp, whole(raw.endXp, 1e9));
        return record;
    };
    // Sloučení dvou záznamů téže sezóny: menší startXp (kdo ji začal počítat dřív), větší endXp (konec zapsaný zařízením, které viselo
    // déle; přesnější je ten nižší jen u zařízení bez novějšího postupu, proto vyhrává větší) a všechny vybrané stupně (při shodě ten první)
    const mergeSeasonRecord = (a, b) => {
        const merged = { id: a.id, startXp: Math.min(a.startXp, b.startXp), claimed: Object.fromEntries(Object.entries({ ...b.claimed, ...a.claimed }).sort(([x], [y]) => Number(x) - Number(y))) };
        if (a.endXp !== undefined || b.endXp !== undefined) merged.endXp = Math.max(merged.startXp, a.endXp ?? 0, b.endXp ?? 0);
        return merged;
    };
    // Sezóna a minulá sezóna z obou stran: záznamy se seskupí podle měsíce (zařízení, které už přešlo do nového měsíce, má starou sezónu
    // jako past), nejnovější je season, předchozí past. Novější sezóna tak nahradí starší a dovybrané stupně staré se neztratí.
    const mergeSeasons = (sides) => {
        const byId = new Map();
        for (const record of sides.filter(Boolean)) byId.set(record.id, byId.has(record.id) ? mergeSeasonRecord(byId.get(record.id), record) : record);
        const ids = [...byId.keys()].sort().reverse();
        const season = ids[0] ? { ...byId.get(ids[0]) } : null;
        if (season) delete season.endXp;
        const pastRecord = ids[1] ? byId.get(ids[1]) : null;
        return { season, past: pastRecord ? { ...pastRecord, endXp: pastRecord.endXp ?? pastRecord.startXp } : null };
    };
    const parse = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const state = empty();
        const gifts = data.gifts && typeof data.gifts === 'object' ? data.gifts : {};
        for (const category of OWN_CATEGORIES) state.gifts[category] = cleanIds(gifts[category], category);
        const chests = data.chests && typeof data.chests === 'object' && !Array.isArray(data.chests) ? data.chests : {};
        state.chests = Object.fromEntries(Object.entries(chests).filter(([week, reward]) => isDay(week) && typeof reward === 'string' && REWARD.test(reward)).sort(([a], [b]) => a.localeCompare(b)).slice(-LIMITS.chests));
        state.ready = lastDays(data.ready, LIMITS.ready).filter(week => !state.chests[week]);
        state.freezes = whole(data.freezes, MAX_FREEZES);
        state.freezesAt = whole(data.freezesAt, 1e13);
        state.frozen = lastDays(data.frozen, LIMITS.frozen);
        state.frozenQuiz = lastDays(data.frozenQuiz, LIMITS.frozen);
        const topicDays = data.frozenTopics && typeof data.frozenTopics === 'object' && !Array.isArray(data.frozenTopics) ? data.frozenTopics : {};
        state.frozenTopics = Object.fromEntries(Object.entries(topicDays).filter(([topic]) => ID.test(topic))
            .map(([topic, days]) => [topic, lastDays(days, LIMITS.frozenTopic)]).filter(([, days]) => days.length).slice(0, LIMITS.frozenTopics));
        state.earned = [...new Set((Array.isArray(data.earned) ? data.earned : []).filter(key => typeof key === 'string' && KEY_PATTERN.test(key)))].slice(-LIMITS.earned);
        state.checked = isDay(data.checked) ? data.checked : '';
        const diplomas = data.diplomas && typeof data.diplomas === 'object' && !Array.isArray(data.diplomas) ? data.diplomas : {};
        state.diplomas = Object.fromEntries(Object.entries(diplomas).filter(([topic, day]) => ID.test(topic) && isDay(day)));
        const robots = data.robots && typeof data.robots === 'object' && !Array.isArray(data.robots) ? data.robots : {};
        state.robots = Object.fromEntries(Object.entries(robots).filter(([id, count]) => ID.test(id) && Number.isFinite(Number(count)) && Number(count) > 0).map(([id, count]) => [id, Math.min(ROBOT_WINS, Math.floor(Number(count)))]));
        state.name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim().slice(0, 30) : '';
        state.season = cleanSeason(data.season);
        state.past = cleanSeason(data.past, true);
        if (state.past && state.season && state.past.id >= state.season.id) state.past = null;
        return state;
    };

    // --- Truhla ---
    // Věci, které hráč má z truhly: { category: [ids] } (look.js je přidá k odemčeným)
    const gifts = (state) => parse(state).gifts;
    const owns = (state, category, id) => parse(state).gifts[category].includes(id);
    // Truhla, která čeká na otevření (nejstarší), nebo null
    const pendingChest = (state) => { const s = parse(state); return s.ready.find(week => !s.chests[week]) || null; };
    // Splněné všechny cíle týdne: truhla týdne (jen jednou za týden)
    const addChest = (state, week) => {
        const s = parse(state);
        if (!isDay(week) || s.chests[week] || s.ready.includes(week)) return s;
        return { ...s, ready: [...s.ready, week].sort().slice(-LIMITS.ready) };
    };
    // Kandidáti do truhly: věci odemykané úrovní (ne odznakem) a věci jen z truhly (chest v look.js), které hráč ještě nemá; od těch,
    // které by odemkl nejdřív. Věc jen z truhly se řadí podle svého čísla chest, jako by se odemykala na té úrovni (když už ji hráč
    // přerostl, je mezi nejbližšími, dokud ji nedostane). ctx = { level, badges } jako u look.js
    const giftRank = (item) => item.chest || item.level || 1;
    const candidates = (state, ctx) => {
        const s = parse(state);
        if (!Look) return [];
        return CHEST_CATEGORIES.flatMap(category => (Look.CATALOG[category] || [])
            // noGift: odměna jen za svůj cíl (Bílý talár až na úrovni 100), truhla ani sezóna ji nedají dřív;
            // rare: vzácný dárek jen z truhly (rareCandidates), mezi běžné věci (ani do Sezóny) nepatří; diploma: legendární postavička jen za diplom;
            // postavičky (CHEST_ONLY_CATEGORIES) jen ty z truhly (chest), ne za úroveň
            .filter(item => !item.badge && !item.diploma && !item.robot && !item.noGift && !item.league && !item.rare && (item.chest || (!CHEST_ONLY_CATEGORIES.includes(category) && (item.level || 1) > 1)) && !s.gifts[category].includes(item.id) && !Look.isUnlocked(item, { ...ctx, gifts: null }))
            .map(item => ({ category, item })))
            .sort((a, b) => giftRank(a.item) - giftRank(b.item) || CHEST_CATEGORIES.indexOf(a.category) - CHEST_CATEGORIES.indexOf(b.category));
    };
    // Vzácné věci jen z truhly (look.js rare: true, např. obrázkové rámečky Duha s mráčky a Růže a trny), které hráč ještě nemá.
    // Truhla dá některou z nich s pravděpodobností RARE_CHANCE místo běžné věci, a když běžné věci došly, určitě (než začne dávat XP).
    const RARE_CHANCE = 0.1;
    const rareCandidates = (state) => {
        const s = parse(state);
        if (!Look) return [];
        return CHEST_CATEGORIES.flatMap(category => (Look.CATALOG[category] || []).filter(item => item.rare && !s.gifts[category].includes(item.id)).map(item => ({ category, item })));
    };
    // Výběr věci: vzácná (viz výše), jinak los z NEAREST nejbližších, jiný druh než minulá truhla, když to jde.
    // Hod na vzácnou věc je vysoké číslo (rng() ≥ 1 − RARE_CHANCE), takže rng = () => 0 dá vždy běžnou věc jako dřív.
    const pickGift = (state, ctx, rng = Math.random) => {
        const list = candidates(state, ctx);
        const rare = rareCandidates(state);
        if (rare.length && (!list.length || rng() >= 1 - RARE_CHANCE)) return rare[Math.min(rare.length - 1, Math.floor(rng() * rare.length))];
        if (!list.length) return null;
        const s = parse(state);
        const last = Object.keys(s.chests).sort().map(week => s.chests[week]).filter(reward => reward !== 'xp').pop();
        const lastCategory = last ? last.split(':')[0] : null;
        const near = list.slice(0, NEAREST);
        const fresh = near.filter(entry => entry.category !== lastCategory);
        const pool = fresh.length ? fresh : near;
        return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    };
    // Otevření truhly týdne: věc (nebo XP, když už hráč má všechno) a ochrana série, dokud jich nemá plný počet.
    // Vrátí { state, gift: { category, item } | null, xp, freeze }; truhla, která nečeká, nic nedá (gift null, xp 0)
    const openChest = (state, week, ctx, { rng = Math.random, now = Date.now() } = {}) => {
        let s = parse(state);
        if (!s.ready.includes(week) || s.chests[week]) return { state: s, gift: null, xp: 0, freeze: false, opened: false };
        const gift = pickGift(s, ctx, rng);
        const xp = gift ? 0 : CHEST_XP;
        s = { ...s, ready: s.ready.filter(entry => entry !== week), chests: { ...s.chests, [week]: gift ? `${gift.category}:${gift.item.id}` : 'xp' } };
        if (gift) s.gifts = { ...s.gifts, [gift.category]: [...s.gifts[gift.category], gift.item.id] };
        const earned = earnFreeze(s, `c:${week}`, now);
        return { state: earned.state, gift, xp, freeze: earned.gained, opened: true };
    };
    // Co dala truhla týdne (pro přehled): { category, item } nebo { xp } nebo null
    const chestReward = (state, week) => {
        const reward = parse(state).chests[week];
        if (!reward) return null;
        if (reward === 'xp') return { xp: CHEST_XP };
        const [category, id] = reward.split(':');
        const item = Look ? Look.find(category, id) : null;
        return item ? { category, item } : null;
    };

    // --- Ochrana série ---
    // Nová ochrana (key = zdroj a den, např. „q:2026-11-08“, každý jen jednou); nad strop se nepřidá. Vrátí { state, gained }
    const earnFreeze = (state, key, now = Date.now()) => {
        const s = parse(state);
        if (!KEY_PATTERN.test(key) || s.earned.includes(key)) return { state: s, gained: false };
        const earned = [...s.earned, key].slice(-LIMITS.earned);
        if (s.freezes >= MAX_FREEZES) return { state: { ...s, earned }, gained: false };
        return { state: { ...s, earned, freezes: s.freezes + 1, freezesAt: now }, gained: true };
    };
    // Série končící dnem day: dny, kdy ok(day), po sobě; zachráněný den (frozen) se přeskočí a nepočítá
    const streakEndingAt = (ok, day, frozen = []) => {
        const saved = frozen instanceof Set ? frozen : new Set(frozen);
        let count = 0;
        let cursor = day;
        for (let guard = 0; guard < 4000 && isDay(cursor); guard++) {
            if (ok(cursor)) count += 1;
            else if (!saved.has(cursor)) break;
            cursor = addDays(cursor, -1);
        }
        return count;
    };
    // Série k dnešku (dnešek se počítá, jen když je splněný; jinak se počítá od včerejška) se zachráněnými dny
    const bridgedStreak = (ok, today, frozen = []) => streakEndingAt(ok, ok(today) ? today : addDays(today, -1), frozen);
    // Dny zachráněné ochranou série, které platí pro danou sérii: starší (frozen, ochrana tehdy platila pro všechny série) a nové jen pro Kvíz dne
    // (frozenQuiz, použije se sama) nebo jen pro jedno téma Dnešních otázek (frozenTopics, hráč ji použije ručně)
    const frozenForQuiz = (state) => { const s = parse(state); return [...s.frozen, ...s.frozenQuiz]; };
    const frozenForTopic = (state, topic) => { const s = parse(state); return [...s.frozen, ...(s.frozenTopics[topic] || [])]; };
    // Automatická ochrana po spuštění (jednou denně) jen pro Kvíz dne: včerejšek nevyšel a před ním běžela série aspoň MIN_PROTECTED dní → použije
    // se ochrana a den se zapíše do frozenQuiz. Série dnešních otázek se samy nechrání, ty zachrání hráč ručně (rescuable, rescueTopic).
    // series = [{ id, ok(day) }]. Vrátí { state, used, day, saved: [id série] }
    const checkFreeze = (state, today, series, now = Date.now()) => {
        const s = parse(state);
        if (!isDay(today) || s.checked === today) return { state: s, used: false, day: null, saved: [] };
        const checked = { ...s, checked: today };
        const day = addDays(today, -1);
        const bridged = frozenForQuiz(s);
        if (bridged.includes(day) || s.freezes < 1) return { state: checked, used: false, day: null, saved: [] };
        const saved = (series || []).filter(entry => !entry.ok(day) && streakEndingAt(entry.ok, addDays(day, -1), bridged) >= MIN_PROTECTED).map(entry => entry.id);
        if (!saved.length) return { state: checked, used: false, day: null, saved: [] };
        return { state: { ...checked, freezes: s.freezes - 1, freezesAt: now, frozenQuiz: lastDays([...s.frozenQuiz, day], LIMITS.frozen) }, used: true, day, saved };
    };
    // Série dnešních otázek, které jde ručně zachránit ochranou: včerejšek nevyšel (a není už zachráněný) a před ním běžela série aspoň MIN_PROTECTED
    // dní; ochrana musí být k mání. topics = [{ id, ok(day) }]. Vrátí [{ id, day, length }] od nejdelší série
    const rescuable = (state, today, topics) => {
        const s = parse(state);
        if (!isDay(today) || s.freezes < 1) return [];
        const day = addDays(today, -1);
        return (topics || []).map(entry => {
            const bridged = frozenForTopic(s, entry.id);
            if (!ID.test(String(entry.id)) || entry.ok(day) || bridged.includes(day)) return null;
            const length = streakEndingAt(entry.ok, addDays(day, -1), bridged);
            return length >= MIN_PROTECTED ? { id: entry.id, day, length } : null;
        }).filter(Boolean).sort((a, b) => b.length - a.length);
    };
    // Ruční záchrana jedné série dnešních otázek: spotřebuje jednu ochranu a zapíše včerejšek do frozenTopics tohoto tématu. Vrátí { state, saved, day, length }
    const rescueTopic = (state, today, entry, now = Date.now()) => {
        const s = parse(state);
        const found = rescuable(s, today, [entry])[0];
        if (!found) return { state: s, saved: false, day: null, length: 0 };
        const days = lastDays([...(s.frozenTopics[found.id] || []), found.day], LIMITS.frozenTopic);
        return { state: { ...s, freezes: s.freezes - 1, freezesAt: now, frozenTopics: { ...s.frozenTopics, [found.id]: days } }, saved: true, day: found.day, length: found.length };
    };
    // Série dosáhla násobku 7 dní: ochrana za zdroj (q = Kvíz dne, d = dnešní otázky) a den
    const streakFreeze = (state, source, day, streak, now = Date.now()) => (streak > 0 && streak % FREEZE_EVERY === 0 ? earnFreeze(state, `${source}:${day}`, now) : { state: parse(state), gained: false });

    // --- Diplomy ---
    // „Mistr zeměpisu“: tvar názvu tématu ve 2. pádě
    const DIPLOMA_NAMES = {
        zemepis: 'zeměpisu', vlajky: 'vlajek a znaků', historie: 'historie', mytologie: 'mytologie', biologie: 'biologie', geologie: 'geologie',
        chemie: 'chemie', fyzika: 'fyziky', umeni: 'výtvarného umění', architektura: 'architektury', hudba: 'hudby', literatura: 'literatury',
        film: 'filmu', sport: 'sportu', jidlo: 'jídla a pití'
    };
    const diplomaTitle = (topic) => `Mistr ${DIPLOMA_NAMES[topic && topic.id] || (topic && topic.title ? topic.title.toLocaleLowerCase('cs') : 'oboru')}`;
    // Nové diplomy podle hvězd mistrovství ({ téma: hvězdy }, plné = full): vrátí { state, fresh: [téma] }
    const noteDiplomas = (state, topicStars, today, full = 5) => {
        const s = parse(state);
        const fresh = Object.entries(topicStars || {}).filter(([topic, stars]) => stars >= full && ID.test(topic) && !s.diplomas[topic]).map(([topic]) => topic);
        if (!fresh.length || !isDay(today)) return { state: s, fresh: [] };
        return { state: { ...s, diplomas: { ...s.diplomas, ...Object.fromEntries(fresh.map(topic => [topic, today])) } }, fresh };
    };
    // Roboti (hra s boty v Dobývání): porážky v robots ({ id robota: počet, nejvýš ROBOT_WINS }); po třetí porážce je robot postavička
    // (dar v gifts.avatars), po všech 26 oba Robosovy. Vrací { state, news: [{ id, title, count, unlocked, final }] } za roboty, kterých se týká porážka
    const robotPool = () => (Look ? Look.AVATARS.filter(item => item.robot && !item.robotAll) : []);
    const noteRobots = (state, defeated) => {
        let s = parse(state);
        const pool = new Map(robotPool().map(item => [item.id, item]));
        const news = [];
        for (const id of [...new Set(Array.isArray(defeated) ? defeated : [])].filter(id => pool.has(id))) {
            const before = s.robots[id] || 0;
            if (before >= ROBOT_WINS) continue;
            const count = before + 1;
            s = { ...s, robots: { ...s.robots, [id]: count } };
            if (count >= ROBOT_WINS && !s.gifts.avatars.includes(id)) s = { ...s, gifts: { ...s.gifts, avatars: [...s.gifts.avatars, id] } };
            news.push({ id, title: pool.get(id).title, count, unlocked: count >= ROBOT_WINS, final: false });
        }
        const all = robotPool().every(item => s.gifts.avatars.includes(item.id));
        if (all) {
            const bosses = Look.AVATARS.filter(item => item.robotAll && !s.gifts.avatars.includes(item.id));
            if (bosses.length) {
                s = { ...s, gifts: { ...s.gifts, avatars: [...s.gifts.avatars, ...bosses.map(item => item.id)] } };
                bosses.forEach(item => news.push({ id: item.id, title: item.title, count: ROBOT_WINS, unlocked: true, final: true }));
            }
        }
        return { state: s, news };
    };
    const setName = (state, name) => ({ ...parse(state), name: String(name || '').replace(/\s+/g, ' ').trim().slice(0, 30) });

    // --- Odměny za sérii dní: stupně skupiny odznaků „serie“ (quiz-core), ke kterým patří věc z katalogu (look.js: rámečky Jiskra
    // za 7 dní, Plamenný za 30, Stovka za 100, Věčný oheň za 365; další věc se k odznaku jen připíše do katalogu) ---
    // badges = stupně skupiny (Core.BADGE_GROUPS, id 'serie'), earned = získané odznaky { id: den }, streak = nejdelší běžící série dní.
    // Vrátí nejbližší nezískanou odměnu { badge, goal, rewards: [{ category, item }], left } nebo null (všechny má)
    const nextStreakReward = (badges, earned, streak) => {
        if (!Look) return null;
        const next = (badges || []).find(badge => Look.rewardsForBadge(badge.id).length && !(earned && earned[badge.id]));
        if (!next) return null;
        return { badge: next, goal: next.goal, rewards: Look.rewardsForBadge(next.id), left: Math.max(1, next.goal - Math.max(0, Math.floor(Number(streak) || 0))) };
    };
    // „Další odměna za sérii: Stovka za 100 dní (zbývá 37)“
    const streakRewardText = (next) => `Další odměna za sérii: ${next.rewards.map(entry => entry.item.title).join(' a ')} za ${next.goal} dní (zbývá ${next.left})`;

    // --- Účet: co se ukládá do profiles.rewards a jak se spojí se zařízením ---
    const payload = (state) => {
        const s = parse(state);
        return { v: 1, gifts: s.gifts, chests: s.chests, ready: s.ready, freezes: s.freezes, freezesAt: s.freezesAt, frozen: s.frozen, frozenQuiz: s.frozenQuiz, frozenTopics: s.frozenTopics, earned: s.earned, diplomas: s.diplomas, robots: s.robots, season: s.season, past: s.past };
    };
    // Sjednocení: věci, truhly, zachráněné dny a diplomy se sčítají (u diplomu dřívější den); počet ochran platí z novější změny;
    // sezóna: tatáž sezóna = menší startXp a sjednocené stupně, novější sezóna nahradí starší (ta zůstane jako past)
    const merge = (localInput, remoteInput) => {
        const local = parse(localInput);
        const remote = parse(remoteInput);
        const chests = { ...remote.chests, ...local.chests };
        const diplomas = { ...remote.diplomas };
        for (const [topic, day] of Object.entries(local.diplomas)) if (!diplomas[topic] || day < diplomas[topic]) diplomas[topic] = day;
        const newer = remote.freezesAt > local.freezesAt ? remote : local;
        return parse({
            ...local,
            gifts: Object.fromEntries(OWN_CATEGORIES.map(category => [category, [...new Set([...local.gifts[category], ...remote.gifts[category]])]])),
            chests,
            ready: [...local.ready, ...remote.ready].filter(week => !chests[week]),
            freezes: newer.freezes, freezesAt: newer.freezesAt,
            frozen: [...local.frozen, ...remote.frozen],
            frozenQuiz: [...local.frozenQuiz, ...remote.frozenQuiz],
            frozenTopics: Object.fromEntries([...new Set([...Object.keys(local.frozenTopics), ...Object.keys(remote.frozenTopics)])]
                .map(topic => [topic, [...(local.frozenTopics[topic] || []), ...(remote.frozenTopics[topic] || [])]])),
            earned: [...new Set([...remote.earned, ...local.earned])].sort((a, b) => a.slice(2).localeCompare(b.slice(2))),
            diplomas,
            robots: Object.fromEntries([...new Set([...Object.keys(local.robots), ...Object.keys(remote.robots)])].map(id => [id, Math.max(local.robots[id] || 0, remote.robots[id] || 0)])),
            ...mergeSeasons([local.season, local.past, remote.season, remote.past])
        });
    };
    const stable = (value) => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    const samePayload = (a, b) => stable(payload(a)) === stable(payload(b));
    // Nic k uložení do účtu: žádná odměna a sezóna jen založená (bez vyzvednutého stupně, bez minulé). Začátek sezóny se do účtu zapíše
    // s první skutečnou odměnou; do té doby ho jiné zařízení počítá samo (season.js shift), ať první přihlášení nic zbytečně nezapisuje
    const isEmpty = (state) => { const s = parse(state); return !s.past && (!s.season || !Object.keys(s.season.claimed).length) && samePayload({ ...s, season: null }, empty()); };

    // --- HTML (h = pomocné funkce z app.js: esc, art, topicIcon, styleOf, frameClass) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const freezeWord = (count) => (count === 1 ? 'ochrana' : count >= 2 && count <= 4 ? 'ochrany' : 'ochran');
    // Štít s počtem ochran u série (jen když nějakou má)
    const freezeChip = (count, attrs = '') => (count > 0 ? `<span ${attrs} data-freeze-chip class="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-sky-100 py-px pl-0.5 pr-1 text-[10px] font-black leading-tight text-sky-800 ring-1 ring-sky-200 dark:bg-sky-900/50 dark:text-sky-200 dark:ring-sky-800" title="Ochrana série: ${count} z ${MAX_FREEZES}" aria-label="Ochrana série: ${count} z ${MAX_FREEZES}"><img src="icons/topics/ochrana-serie.webp" alt="" class="h-4 w-4 shrink-0 object-contain">${count}</span>` : '');
    // Malá truhla (vysvětlení, okno truhly): obrázek icons/topics/truhla.webp. Řádek „Truhla Mudrlanta čeká“ na záložce Dnes kreslí app.js
    // (chestRowHtml), truhla se v něm pohupuje (src/input.css, .chest-mini)
    const chestSvg = (cls = 'h-40 w-40') => `
        <span class="${cls} chest-svg relative inline-flex items-center justify-center" aria-hidden="true">
            <img src="icons/topics/truhla.webp" alt="" class="relative h-full w-full object-contain drop-shadow-md">
        </span>`;
    // Ochrana série: obrázek štítu s plamenem (icons/topics/ochrana-serie.webp)
    const freezeArt = (cls = 'h-7 w-7') => `<img src="icons/topics/ochrana-serie.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    // Ukázka věci (obrázek doplňku, sova v taláru, kulička tématu, barva, rámeček)
    const COLOR_DOT = {
        cervena: 'bg-red-600', oranzova: 'bg-orange-500', zluta: 'bg-yellow-400', zelena: 'bg-green-600', modra: 'bg-blue-600', fialova: 'bg-purple-600',
        ruzova: 'bg-pink-400', cerna: 'bg-neutral-900 ring-1 ring-white/40', vlastni: 'bg-[conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]'
    };
    const previewHtml = ({ category, item }, h = {}, size = 'h-20 w-20') => {
        if (category === 'accessories') return `<img src="icons/doplnky/${esc(item.id)}-ikona.webp" alt="" class="${size} object-contain drop-shadow-lg">`;
        if (category === 'avatars') return `<img src="icons/avatars/${esc(item.id)}.webp" alt="" class="${size} object-contain drop-shadow-lg">`;
        // Vlastní barva obleku (robe-color.js): vínová sova s ukázkovou barvou, přebarví ji look-robes.js
        if (category === 'robes' && item.custom) return `<img src="icons/topics/sova-vitej.webp" alt="" data-keep data-robe-color="185.0" class="${size} object-contain drop-shadow-lg">`;
        if (category === 'robes') return `<img src="icons/topics/sova-vitej${item.id === 'vinova' ? '' : `-${esc(item.id)}`}.webp" alt="" data-keep class="${size} object-contain drop-shadow-lg">`;
        if (category === 'themes') return `<span data-theme="${esc(item.id)}" class="block ${size} rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-800 shadow-lg ring-4 ring-white/70"></span>`;
        if (category === 'colors') return `<span class="block ${size} rounded-full ${COLOR_DOT[item.id] || 'bg-slate-400'} shadow-lg ring-4 ring-white/70"></span>`;
        if (category === 'frames') return `<span class="relative flex ${size} items-center justify-center rounded-full bg-white${h.frameClass ? h.frameClass(item.id) : ''}"><img src="icons/logo.webp" alt="" class="h-[78%] w-[78%] object-contain"></span>`;
        return '';
    };
    // Řádek s další odměnou za sérii (výsledek dnešní otázky, okno ochrany série): ukázka věci a text; h.frameClass z app.js
    const streakRewardHtml = (next, h = {}, cls = '') => !next ? '' : `
        <p data-streak-reward class="flex min-w-0 items-center gap-1.5 text-[11px] font-bold leading-tight text-slate-600 dark:text-slate-300 ${cls}" title="${esc(streakRewardText(next))}">
            <span class="flex h-5 w-5 shrink-0 items-center justify-center text-[0.75rem]">${previewHtml(next.rewards[0], h, 'h-5 w-5')}</span>
            <span class="min-w-0 truncate">Další odměna za sérii: <b class="text-slate-800 dark:text-slate-100">${esc(next.rewards.map(entry => entry.item.title).join(' a '))}</b> za ${next.goal} dní <span class="whitespace-nowrap text-gold-700 dark:text-gold-300">(zbývá ${next.left})</span></span>
        </p>`;
    // Okno truhly (animace v src/input.css, .chest-*). Zavřená: truhla je velké tlačítko, za ní pulzuje zlatá záře, kolem se třpytí
    // jiskry a pod ní je nápověda. Po otevření (opened) je na stejném místě otevřená truhla: obě truhly leží v jedné buňce mřížky ve
    // stejném měřítku (.chest-lid-open), takže výměna vypadá jako zvednutí víka; za ní paprsky a kruh světla, jiskry vyletí ven, z truhly
    // vystoupá věc (nebo XP) a pod ní se objeví popis, ochrana série a tlačítka. Otevřená truhla je v HTML už předem (načte se dopředu).
    const SPARKS = 8;
    // look = vzhled jiné truhly se stejným otevíráním (Zlatá truhla, gold.js chestOptions): kicker, title, closed a open (obrázky),
    // tint (pozlacení obrázku filtrem .gold-tint), card (třída karty) a note(opened) (věta pod věcí); bez něj Truhla Mudrlanta
    const chestStageHtml = (opened, h, look = {}) => {
        // Kulatá věc (téma, barva, rámeček, XP) je menší a výš, ať nezakryje víko; téma a barva se lesknou (.chest-orb)
        const category = opened && opened.gift ? opened.gift.category : 'xp';
        const round = ['themes', 'colors', 'frames', 'xp'].includes(category);
        // (u rámečku větší písmo = silnější kroužek, .frame v src/input.css; obrázkový prsten je dvakrát širší než obrázek, proto menší obrázek)
        const art = category === 'frames' && opened.gift.item.art;
        const size = art ? 'h-16 w-16 text-[2rem]' : round ? `h-[4.5rem] w-[4.5rem]${category === 'frames' ? ' text-[2.5rem]' : ''}` : 'h-[5.5rem] w-[5.5rem]';
        const prize = !opened ? '' : opened.gift ? previewHtml(opened.gift, h, size) : `
            <span class="flex ${size} flex-col items-center justify-center rounded-full bg-gradient-to-br from-gold-200 to-gold-500 text-brand-950 shadow-lg ring-4 ring-white/70"><i data-lucide="star" class="h-7 w-7"></i><span class="text-sm font-black leading-none">+${opened.xp}</span></span>`;
        return `
            <div data-chest-stage class="chest-stage ${opened ? 'chest-opened' : 'chest-waiting'} relative flex w-full flex-col items-center">
                <div class="relative z-10 flex h-24 w-full items-end justify-center">${opened ? `<div data-chest-prize class="chest-prize${round ? ' mb-3' : ''}${category === 'themes' || category === 'colors' ? ' chest-orb' : ''}">${prize}</div>` : ''}</div>
                <button type="button" data-chest-go aria-label="Otevřít truhlu" class="chest-box relative -mt-10 block h-40 w-40 rounded-3xl" ${opened ? 'disabled' : ''}>
                    <span class="chest-halo" aria-hidden="true"></span>
                    ${opened ? '<span class="chest-rays" aria-hidden="true"></span>' : ''}
                    <span class="chest-ring" aria-hidden="true"></span>
                    <span class="chest-sparks" aria-hidden="true">${'<span class="chest-spark"></span>'.repeat(SPARKS)}</span>
                    <span class="chest-body grid h-full w-full${look.tint ? ' gold-tint' : ''}" aria-hidden="true">
                        <img src="icons/topics/${esc(look.closed || 'truhla')}.webp" alt="" class="chest-lid-closed h-full w-full object-contain drop-shadow-lg">
                        <img src="icons/topics/${esc(look.open || 'truhla-otevrena')}.webp" alt="" class="chest-lid-open h-full w-full object-contain drop-shadow-lg">
                    </span>
                </button>
            </div>`;
    };
    const chestHtml = ({ opened = null, look = {} } = {}, h = {}) => {
        const note = opened && look.note ? look.note(opened) : '';
        const result = opened ? (opened.gift ? `
            <div data-chest-reveal class="chest-show-1 relative z-10 flex flex-col items-center gap-1 text-center">
                <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">${opened.gift.item.rare ? 'Vzácný ' : ''}${esc(KIND_NAMES[opened.gift.category])}</p>
                <p data-chest-item class="text-2xl font-black leading-tight text-white">${esc(opened.gift.item.title)}</p>
                <p class="text-xs font-semibold leading-snug text-white/80">${note ? esc(note) : opened.gift.item.rare ? 'Vzácný dárek, který jde získat jen z truhly. Teď je tvůj.' : opened.gift.item.chest ? 'Tahle věc je jen v Truhle Mudrlanta. Teď je tvoje.' : `Jinak by se odemkl až na úrovni ${opened.gift.item.level}. Teď je tvůj.`}</p>
            </div>` : `
            <div data-chest-reveal class="chest-show-1 relative z-10 flex flex-col items-center gap-1 text-center">
                <p data-chest-item class="text-3xl font-black text-gold-300">+${opened.xp} XP</p>
                <p class="text-xs font-semibold leading-snug text-white/80">${esc(note || 'Všechny věci pro Mudrlanta už máš, tak aspoň body zkušeností.')}</p>
            </div>`) : '';
        const freeze = opened && opened.freeze ? `<p data-chest-freeze class="chest-show-2 relative z-10 flex items-center gap-1.5 rounded-xl bg-sky-500/20 px-3 py-1.5 text-xs font-black text-sky-100 ring-1 ring-sky-300/40">${freezeArt('h-6 w-6 -my-1')} A navíc ochrana série</p>` : '';
        // Vzácně (los na serveru, blok 30, 37 a 39) i pomůcka: opened.pomucka = { kind, name, place ('do Dobývání' | 'do Řetězovky') }; h.itemArt = pečeť
        // pomůcky z app.js
        const pomucka = opened && opened.pomucka ? `<p data-chest-pomucka class="chest-show-2 relative z-10 flex items-center gap-1.5 rounded-xl bg-violet-500/25 px-3 py-1.5 text-xs font-black text-violet-50 ring-1 ring-violet-300/50">${h.itemArt ? h.itemArt(opened.pomucka.kind, 'h-6 w-6 -my-1') : ''} A navíc pomůcka ${esc(opened.pomucka.place || 'do Dobývání')}: ${esc(opened.pomucka.name)}</p>` : '';
        // Vzácnost do Dobývání (los na serveru, blok 38): opened.pattern = { id, name }; h.patternArt = vzorek výplně území z app.js
        const pattern = opened && opened.pattern ? `<p data-chest-pattern class="chest-show-2 relative z-10 flex items-center gap-1.5 rounded-xl bg-gold-400/20 px-3 py-1.5 text-xs font-black text-gold-100 ring-1 ring-gold-300/50">${h.patternArt ? h.patternArt(opened.pattern.id, 'h-6 w-8 -my-1') : ''} A navíc vzácná výplň území do Dobývání: ${esc(opened.pattern.name)}</p>` : '';
        const actions = opened
            ? `<div class="chest-show-3 relative z-10 flex w-full gap-2">${opened.gift && opened.gift.category !== 'colors' ? `<button type="button" data-chest-wear class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl btn-3d bg-gold-500 px-3 py-3 text-base font-black text-brand-950"><i data-lucide="sparkles" class="h-5 w-5"></i> ${opened.gift.category === 'themes' ? 'Použít' : 'Nasadit'}</button>` : ''}<button type="button" data-chest-close class="flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-white/15 px-3 py-3 text-base font-bold text-white">${opened.gift && opened.gift.category !== 'colors' ? 'Později' : 'Super!'}</button></div>`
            : `<p class="chest-hint relative z-10 flex items-center gap-1.5 rounded-full bg-gold-400/15 px-3.5 py-1.5 text-sm font-black text-gold-200 ring-1 ring-gold-300/40"><i data-lucide="sparkles" class="h-4 w-4"></i> Klepni na truhlu</p>
               <button type="button" data-chest-close class="relative z-10 -mb-2 min-h-[2.5rem] px-4 text-xs font-bold text-white/70 underline underline-offset-2">Otevřu ji později</button>`;
        return `
            <div data-chest-card class="${look.card ? `${esc(look.card)} ` : ''}flex w-full max-w-xs flex-col items-center gap-3 rounded-[1.8rem] bg-gradient-to-b from-brand-800 to-brand-950 p-5 text-white shadow-2xl ring-2 ring-gold-400">
                <div class="relative z-10 text-center">
                    <p class="text-[11px] font-black uppercase tracking-widest text-gold-300">${esc(look.kicker || 'Cíle týdne splněné')}</p>
                    <h2 class="text-xl font-black leading-tight">${esc(look.title || 'Truhla Mudrlanta')}</h2>
                </div>
                ${chestStageHtml(opened, h, look)}
                ${result}${freeze}${pomucka}${pattern}${actions}
            </div>`;
    };
    // Řádek v Mém postupu: ochrana série, truhla týdne a diplomy (každé otevře vlastní okno)
    // album = { percent, art } (album.js): čtvrtá dlaždice Album sbírky, dlaždice jsou pak ve dvou řadách po dvou
    // S albem čtyři dlaždice: na vyšším displeji 2 × 2, na nízkém (short:) jedna řada svislých dlaždic s kratšími popisky, ať se Můj postup
    // i s kartou sezóny vejde bez posouvání (na nízkém displeji se schová konec popisku, třída short:hidden)
    // extra = další dlaždice z jiných modulů (Zlatá otázka, gold.js progressTile): { kind, icon (HTML), title, short (název na nízkém
    // displeji), value, ready (zvýrazněná jako čekající truhla) }; pátá dlaždice je na vyšším displeji přes celou šířku
    const progressHtml = ({ freezes = 0, chest = null, lastReward = null, diplomas = 0, topics = 14, album = null, extra = [] } = {}) => {
        const count = 3 + (album ? 1 : 0) + extra.length;
        const squeeze = count >= 4;
        const READY = 'bg-gold-100 ring-2 ring-gold-400 dark:bg-gold-900/40';
        const tile = (kind, icon, title, value, attrs = '', tone = 'bg-white dark:bg-slate-800', ready = false, wide = false) => `
                <button type="button" data-rewards-info="${kind}" class="${wide ? 'col-span-2 short:col-span-1 ' : ''}flex min-w-0 items-center gap-1.5 rounded-xl ${tone} p-1.5 text-left shadow-sm${squeeze ? ' short:flex-col short:gap-0.5 short:px-0.5 short:py-1 short:text-center' : ''}">
                    ${icon}
                    <span class="min-w-0${squeeze ? ' short:w-full' : ''}"><span class="block truncate text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">${title}</span><span ${attrs} class="block truncate text-[10.5px] font-bold leading-tight ${ready ? 'text-gold-800 dark:text-gold-200' : 'text-slate-500 dark:text-slate-400'}">${value}</span></span>
                </button>`;
        const more = extra.map((entry, index) => tile(esc(entry.kind), entry.icon, entry.short ? `<span class="short:hidden">${esc(entry.title)}</span><span class="hidden short:inline">${esc(entry.short)}</span>` : esc(entry.title),
            esc(entry.value), `data-${esc(entry.kind)}-tile-value`, entry.ready ? READY : 'bg-white dark:bg-slate-800', Boolean(entry.ready), count === 5 && index === extra.length - 1));
        return `
        <div data-rewards-section>
            <h3 class="mb-1 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Odměny</h3>
            <div class="grid ${count >= 5 ? 'grid-cols-2 short:grid-cols-5' : count === 4 ? 'grid-cols-2 short:grid-cols-4' : 'grid-cols-3'} gap-1">
                ${tile('freeze', freezeArt(), 'Ochrana', `${freezes} z ${MAX_FREEZES}`, 'data-freeze-count')}
                ${tile('chest', chestSvg('h-7 w-7 shrink-0'), 'Truhla', chest ? 'Čeká!' : lastReward ? esc(lastReward) : 'Za 3 cíle', '', chest ? READY : 'bg-white dark:bg-slate-800', Boolean(chest))}
                ${tile('diplomas', '<img src="icons/topics/diplom.webp" alt="" class="h-7 w-7 shrink-0 object-contain drop-shadow-sm">', 'Diplomy', `${diplomas} / ${topics}`, 'data-diploma-count')}
                ${album ? tile('album', `<img src="icons/topics/${esc(album.art)}.webp" alt="" class="h-7 w-7 shrink-0 object-contain drop-shadow-sm">`, 'Album<span class="short:hidden"> sbírky</span>', `${album.percent} %<span class="short:hidden"> sbírky</span>`, 'data-album-tile-value') : ''}
                ${more.join('')}
            </div>
        </div>`;
    };
    // Vysvětlení série a ochrany série (okno z plamene a štítu v hlavičce, z Mého postupu a z Dnešních otázek): co je série, co dává, ochrana.
    // streak = nejdelší běžící série dní (null = neukazovat). XP za sérii: quiz-core.js streakXp a daily-quiz.js (2 XP za den, strop 10 dní);
    // rámečky za sérii: look.js (Jiskra, Plamenný, Stovka, Věčný oheň); Ankh vzkříšení za sérii Kvízu dne: blok 39 ve schema.sql
    const daysWordOf = (count) => `${count} ${count === 1 ? 'den' : count >= 2 && count <= 4 ? 'dny' : 'dní'}`;
    // Kdy a proč ochrana zabrala (poslední záznamy ze zařízení): [{ day: zachráněný den, reasons: ['Dnešní otázka z Geologie: odpověď nebyla správná (série 9 dní)', …] }]
    const freezeLogHtml = (log) => {
        const rows = (Array.isArray(log) ? log : []).filter(entry => entry && isDay(entry.day) && Array.isArray(entry.reasons) && entry.reasons.length).slice(0, 5);
        return !rows.length ? '' : `<div data-freeze-log><b>Kdy ochrana zabrala:</b>
            <ul class="mt-0.5 flex flex-col gap-1">${rows.map(entry => `<li class="rounded-xl bg-sky-50 px-2 py-1 dark:bg-sky-900/30"><b>${esc(formatDay(entry.day))}</b>: ${entry.reasons.map(esc).join('; ')}</li>`).join('')}</ul></div>`;
    };
    // rescue = kolik sérií Dnešních otázek jde teď ručně zachránit (tlačítko nahoře, jen když nějaká jde)
    const freezeHelpHtml = (freezes, streak = null, log = [], rescue = 0) => `
        <div class="flex flex-col gap-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200" data-freeze-help>
            ${rescue > 0 ? `<button type="button" data-action="streak-rescue" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-2.5 text-[14px] font-black text-white">${freezeArt('h-6 w-6')} Zachránit sérii (${rescue})</button>` : ''}
            <div class="grid grid-cols-2 gap-1.5" data-streak-now>
                ${streak === null ? '' : `<p class="flex items-center gap-1.5 rounded-2xl bg-amber-50 p-2 font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"><img src="icons/topics/serie.webp" alt="" class="-my-1 h-8 w-8 shrink-0 object-contain drop-shadow-sm"><span class="min-w-0 leading-tight">Série<br><b class="text-[15px]">${streak ? daysWordOf(streak) : 'zatím žádná'}</b></span></p>`}
                <p class="${streak === null ? 'col-span-2 ' : ''}flex items-center gap-1.5 rounded-2xl bg-sky-50 p-2 font-bold text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">${freezeArt('h-8 w-8 -my-1')}<span class="min-w-0 leading-tight">Ochrana série<br><b class="text-[15px]">${freezes} z ${MAX_FREEZES}</b></span></p>
            </div>
            <p data-streak-what><b>Série</b> = kolik dní v řadě hraješ. Každé téma Dnešních otázek má svou sérii (stačí v něm každý den správně odpovědět na dnešní otázku), Kvíz dne má vlastní (stačí ho každý den dohrát). Plamen nahoře ukazuje tvou nejdelší. Vynechaný den ji vynuluje.</p>
            <div data-streak-gives><b>Co ti série dá:</b>
                <ul class="mt-0.5 flex list-disc flex-col gap-0.5 pl-5 marker:text-amber-500">
                    <li>Víc XP: +2 XP za každý den série ke každé dnešní otázce i ke Kvízu dne, nejvýš +20 XP.</li>
                    <li>Rámečky za 7, 30, 100 a 365 dní v řadě.</li>
                    <li>Za každých ${FREEZE_EVERY} dní v řadě ochranu série.</li>
                    <li>Za 7, 30, 100 a 365 dní Kvízu dne Ankh vzkříšení do Dobývání.</li>
                </ul>
            </div>
            <p><b>Ochrana série:</b> u Kvízu dne se po vynechaném dni použije sama, u Dnešních otázek ji použiješ ručně (nabídne se ti). Chrání série od ${MIN_PROTECTED} dní, dva vynechané dny v řadě nezachrání. Dostaneš ji za každých ${FREEZE_EVERY} dní v řadě a z Truhly Mudrlanta, mít můžeš nejvýš ${MAX_FREEZES}.</p>
            ${freezeLogHtml(log)}
        </div>`;
    const chestHelpHtml = (lastReward) => `
        <div class="flex flex-col gap-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200" data-chest-help>
            <div class="flex items-center gap-3">${chestSvg('h-14 w-14 shrink-0')}<p>Splň všechny tři cíle týdne a dostaneš Truhlu Mudrlanta.</p></div>
            <p>V truhle je vždy něco nového pro Mudrlanta: doplněk, barva doplňků, rámeček, talár nebo barevné téma, které by se ti jinak odemklo až později. Občas v ní je vzácný rámeček, který jinde nezískáš. Nic se neopakuje. Často v ní najdeš i ochranu série.</p>
            ${lastReward ? `<p class="text-xs font-bold text-slate-500 dark:text-slate-400">Minule: ${esc(lastReward)}</p>` : ''}
        </div>`;
    // Diplomy v Mém postupu: mřížka 7 × 2 témat (získané barevně, ostatní šedé se zámkem), klepnutím podrobnosti
    const diplomasHtml = (rows, h) => {
        const have = rows.filter(row => row.earned).length;
        return `
        <div data-diplomas>
            <div class="mb-1.5 flex items-center justify-between gap-2"><h3 class="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400"><img src="icons/topics/diplom.webp" alt="" class="h-6 w-6 shrink-0 object-contain drop-shadow-sm">Diplomy</h3><span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${have} / ${rows.length}</span></div>
            <p class="mb-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Za plné mistrovství tématu (5 hvězdiček) dostaneš diplom, který můžeš sdílet, a legendární postavičku.</p>
            <ul class="grid grid-cols-7 gap-1">${rows.map(row => `
                <li><button type="button" data-diploma="${esc(row.topic.id)}" aria-label="${esc(`${row.title}: ${row.earned ? `získán ${formatDay(row.day)}` : `chybí ${row.missing} poznaných položek`}`)}" title="${esc(row.earned ? row.title : `${row.title}: poznej ještě ${row.missing} položek`)}" class="relative flex aspect-square w-full items-center justify-center rounded-xl ${row.earned ? `${h.styleOf(row.topic).soft} ring-2 ring-gold-400` : 'bg-slate-100 dark:bg-slate-700/60'}">
                    <span class="${row.earned ? '' : 'opacity-40 grayscale'}">${h.topicIcon(row.topic, 'h-7 w-7', '', 'h-5 w-5')}</span>
                    ${row.earned ? '<span class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-brand-950 ring-2 ring-white dark:ring-slate-800"><i data-lucide="award" class="h-2.5 w-2.5"></i></span>' : '<span class="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-white ring-1 ring-white dark:bg-slate-400 dark:text-slate-900 dark:ring-slate-800"><i data-lucide="lock" class="h-2.5 w-2.5"></i></span>'}
                </button></li>`).join('')}</ul>
        </div>`;
    };
    // Legendární postavička za diplom tématu (look.js diploma) v okně diplomu; obrázek kreslí h.avatar z app.js, bez něj (nebo bez postavičky) nic.
    // Nezískaný diplom: řádek „Odměna: …“ se šedou postavičkou. Získaný: čtvercové tlačítko vedle Sdílet a Stáhnout (okno s náhledem diplomu
    // se jinak na 360 × 640 nevejde), klepnutím app.js otevře výběr v Nastavení → Profil → Legendy.
    const legendOf = (row) => (Look && Look.rewardsForDiploma ? Look.rewardsForDiploma(row.topic.id).find(reward => reward.category === 'avatars') : null);
    const legendHtml = (row, h) => {
        const entry = legendOf(row);
        if (!entry || !h || !h.avatar) return '';
        return `<p data-diploma-legend-info="${esc(entry.item.id)}" class="flex items-center gap-2.5 rounded-2xl bg-gold-50 px-2.5 py-1 text-[12px] font-semibold leading-snug text-gold-900 ring-1 ring-gold-300 dark:bg-gold-900/20 dark:text-gold-100 dark:ring-gold-700">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center opacity-50 grayscale">${h.avatar(entry.item.id, 'h-10 w-10')}</span>
            <span class="min-w-0">Odměna: legendární postavička <b>${esc(entry.item.title)}</b> do profilového obrázku.</span></p>`;
    };
    const legendButton = (row, h) => {
        const entry = legendOf(row);
        if (!entry || !h || !h.avatar) return '';
        const label = `Legendární postavička ${entry.item.title} je tvoje: vybrat jako profilový obrázek`;
        return `<button type="button" data-diploma-legend="${esc(entry.item.id)}" aria-label="${esc(label)}" title="${esc(label)}" class="flex w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-gold-50 ring-1 ring-gold-300 active:scale-95 dark:bg-gold-900/20 dark:ring-gold-700">${h.avatar(entry.item.id, 'h-11 w-11')}</button>`;
    };
    // Okno jednoho diplomu: získaný = náhled (plátno vloží app.js do [data-diploma-preview]), jméno na diplomu, Sdílet a Stáhnout;
    // nezískaný = co chybí; u obou legendární postavička za diplom
    const diplomaDialogHtml = (row, { name = '', needName = false } = {}, h) => row.earned ? `
        <div class="flex flex-col gap-2.5" data-diploma-dialog="${esc(row.topic.id)}">
            <div data-diploma-preview class="flex aspect-[4/5] w-full items-center short:mx-auto short:w-[90%] justify-center overflow-hidden rounded-2xl bg-slate-100 shadow-inner dark:bg-slate-900"><p class="text-xs font-semibold text-slate-500 dark:text-slate-400" role="status">Kreslím diplom…</p></div>
            <label class="flex items-center gap-2 text-[12px] font-bold text-slate-600 dark:text-slate-300"><span class="shrink-0">Jméno na diplomu</span>
                <input type="text" data-diploma-name maxlength="30" value="${esc(name)}" placeholder="${needName ? 'Tvoje jméno' : ''}" class="h-9 min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"></label>
            <div class="flex gap-2">
                <button type="button" data-diploma-share class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl btn-3d bg-brand-700 px-3 py-3 text-[15px] font-black text-white"><i data-lucide="share-2" class="h-5 w-5"></i> Sdílet</button>
                <button type="button" data-diploma-download class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-200 px-3 py-3 text-[15px] font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-100"><i data-lucide="download" class="h-5 w-5"></i> Stáhnout</button>
                ${legendButton(row, h)}
            </div>
        </div>` : `
        <div class="flex flex-col gap-3" data-diploma-dialog="${esc(row.topic.id)}" data-diploma-locked>
            <div class="flex items-center gap-3">${h.topicIcon(row.topic, 'h-12 w-12', `rounded-xl p-2 ${h.styleOf(row.topic).soft}`, 'h-8 w-8')}
                <div class="min-w-0"><p class="text-base font-black leading-tight text-slate-800 dark:text-slate-100">${esc(row.title)}</p>
                <p class="text-[12px] font-semibold text-slate-600 dark:text-slate-300">Poznáno ${row.known} z ${row.needed} položek</p></div></div>
            <span class="block h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full bg-gold-500" data-progress="${Math.round(Math.min(1, row.known / row.needed) * 100)}"></span></span>
            <p class="text-[13px] leading-snug text-slate-700 dark:text-slate-200">Diplom dostaneš za plné mistrovství tématu: aspoň jednou správně poznej ${row.needed} různých položek. Chybí ti ještě <b>${row.missing}</b>.</p>
            ${legendHtml(row, h)}
        </div>`;

    return {
        KEY, MAX_FREEZES, MIN_PROTECTED, FREEZE_EVERY, CHEST_XP, NEAREST, GIFT_CATEGORIES, CHEST_CATEGORIES, CHEST_ONLY_CATEGORIES, OWN_CATEGORIES, KIND_NAMES, DIPLOMA_NAMES, SEASON_TIERS, SEASON_REWARD, cleanSeason, mergeSeasons,
        isDay, addDays, formatDay, isoWeek, empty, parse, gifts, owns, pendingChest, addChest, candidates, RARE_CHANCE, rareCandidates, pickGift, openChest, chestReward,
        earnFreeze, streakEndingAt, bridgedStreak, checkFreeze, streakFreeze, diplomaTitle, noteDiplomas, frozenForQuiz, frozenForTopic, rescuable, rescueTopic, ROBOT_WINS, robotPool, noteRobots, setName, payload, merge, samePayload, isEmpty,
        nextStreakReward, streakRewardText, streakRewardHtml,
        freezeWord, freezeChip, freezeArt, freezeLogHtml, chestSvg, previewHtml, chestHtml, progressHtml, freezeHelpHtml, chestHelpHtml, diplomasHtml, diplomaDialogHtml
    };
});
