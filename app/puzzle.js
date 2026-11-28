// Skládačka: krátká hmatová minihra – složit obrázek z dílků. Co se skládá: vlajka státu (obrázek z Wikimedia Commons, stažený jako blob:
// bez názvu souboru – photo-blob.js – a překreslený do vlastního obrázku přes canvas), nebo obrys státu (data/mapa-tvary.json, vykreslený
// jako SVG). Mřížka 2×2, 3×3 nebo 4×4 dílků; dílek se přetáhne (myš i dotyk) nebo klepnutím vybere a položí. Na správném místě
// zapadne (cvaknutí přes sound.js, krátká vibrace) a už se nehne; jinam se vrátí do zásobníku. Stejné dílky (třeba dva červené pruhy
// polské vlajky, moře kolem obrysu) jsou zaměnitelné: pozná se to z pixelů (pieceGroups), takže hráč nikdy nepoloží „správný“ dílek
// na „špatné“ místo, které vypadá stejně. Dvakrát nesedící dílek ukáže, kam patří. Bez časovače, bez trestů, tahy se jen počítají.
// Po složení název, krátký fakt a velké Další; předem jde jednou tipnout, co to je (bonus XP). Sbírka složených (X / Y) a malé XP
// s denním stropem (jako modes.js) se ukládají v zařízení (mudrlant.skladacka) a sbírka i Skládačky dne se synchronizují do účtu (bonus-sync.js).
// Skládačka dne: jednou denně stejná pro všechny, 4 × 4, střídavě vlajka a obrys; API daily() / openDaily() pro jiné obrazovky.
// Čistá logika bez DOMu je nahoře (testy v Node: tests/puzzle.test.js), obrazovky a ovládání v createController; app.js dodá jen napojení
// (data témat, obrysy, XP, hlavička) a dlaždici Skládačka na záložce Hrát mezi Režimy.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantPuzzle = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const STORAGE_KEY = 'mudrlant.skladacka';
    // Obrázek režimu (dlaždice, úvod): do dodání obrázku č. 560 (sova skládá dílky) odznak s ikonou Lucide puzzle
    const ART = null; // č. 560 'skladacka'
    const VARIANTS = {
        flag: { id: 'flag', title: 'Vlajka', plural: 'Vlajky', icon: 'flag', topic: 'vlajky', what: 'vlajku státu' },
        outline: { id: 'outline', title: 'Obrys státu', plural: 'Obrysy států', icon: 'map', topic: 'zemepis', what: 'obrys státu' }
    };
    const VARIANT_IDS = ['flag', 'outline'];
    const SIZES = [4, 9, 16];
    // XP za složení podle počtu dílků, bonus za uhodnutí předem a denní strop (bonus se do stropu počítá také)
    const SIZE_XP = { 4: 2, 9: 4, 16: 6 };
    const GUESS_XP = 2;
    const DAILY_XP_CAP = 40;
    // Po kolika nepovedených položeních téhož dílku se ukáže, kam patří
    const HINT_AFTER = 2;
    // Kolik naposledy složených se hned nezopakuje
    const RECENT = 8;
    // Dílky v zásobníku jsou menší než na desce
    const TRAY_SCALE = 0.7;
    // Podpis dílku pro zaměnitelnost: S × S vzorků na dílek; dílky jsou stejné, když se žádný vzorek neliší víc než o SAME_MAX
    const SAMPLE = 24;
    const SAME_MAX = 16;
    // Skládačka dne: jednou denně stejná pro všechny, 4 × 4 dílky; XP jednou za den mimo denní strop (bonus za tip také),
    // ve sbírce se počítá jako obyčejné složení. Den se střídá: sudý den (od 1. 1. 1970) vlajka, lichý obrys státu.
    const DAILY_SIZE = 16;
    const DAILY_XP = 15;
    const DAILY_DAYS = 62;
    // Kolik vlajek dne se zkusí (stejné pořadí pro všechny), než se místo vlajky skládá obrys téhož státu (bez internetu)
    const DAILY_FLAG_TRIES = 3;
    // Pro výběr dne stačí známé státy, když jich je aspoň tolik
    const DAILY_KNOWN_MIN = 20;

    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const sideOf = (size) => Math.round(Math.sqrt(size));
    const formatNumber = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // --- Pravidla na úvodní obrazovku (ikona Lucide a věta) ---
    const rules = () => [
        { icon: 'hand', text: 'Dílek přetáhni na jeho místo, nebo ho klepnutím vyber a klepni na místo.' },
        { icon: 'check', text: 'Na svém místě dílek zapadne a už se nehne.' },
        { icon: 'lightbulb', text: `Když dílek ${HINT_AFTER}× nesedí, ukáže se, kam patří.` },
        { icon: 'circle-help', text: 'Víš dřív, co skládáš? Jednou si tipni o bonus.' }
    ];

    // --- Uložený stav: sbírka složených (podle varianty), naposledy složené, zvolená varianta a velikost, dnešní XP ---
    const ID = /^Q\d{1,12}$/;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    // Odehrané Skládačky dne: den → { moves, v (varianta), id }; drží se posledních DAILY_DAYS dní
    const trimDaily = (daily) => Object.fromEntries(Object.entries(daily).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, DAILY_DAYS));
    const parseDaily = (raw) => {
        const daily = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            for (const [day, entry] of Object.entries(raw)) {
                if (!DAY.test(day) || !entry || typeof entry !== 'object' || !count(entry.moves, 10000)) continue;
                daily[day] = { moves: count(entry.moves, 10000), v: VARIANT_IDS.includes(entry.v) ? entry.v : '', id: typeof entry.id === 'string' && ID.test(entry.id) ? entry.id : '' };
            }
        }
        return trimDaily(daily);
    };
    const count = (value, max = 100000) => Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : 0;
    const ids = (list, max) => Array.isArray(list) ? [...new Set(list.filter(id => typeof id === 'string' && ID.test(id)))].slice(-max) : [];
    const parse = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const got = {};
        const recent = {};
        for (const id of VARIANT_IDS) {
            got[id] = ids(data.got && data.got[id], 2000);
            recent[id] = ids(data.recent && data.recent[id], RECENT);
        }
        return {
            v: 1,
            variant: VARIANT_IDS.includes(data.variant) ? data.variant : 'flag',
            size: SIZES.includes(data.size) ? data.size : 9,
            got, recent,
            done: count(data.done),
            guessed: count(data.guessed),
            day: typeof data.day === 'string' && DAY.test(data.day) ? data.day : '',
            xp: count(data.xp, DAILY_XP_CAP),
            daily: parseDaily(data.daily)
        };
    };
    const forDay = (state, dayKey) => state.day === dayKey ? state : { ...state, day: dayKey, xp: 0 };
    const xpLeftToday = (state, dayKey) => Math.max(0, DAILY_XP_CAP - forDay(state, dayKey).xp);
    const choose = (state, change) => ({
        ...state,
        variant: VARIANT_IDS.includes(change.variant) ? change.variant : state.variant,
        size: SIZES.includes(change.size) ? change.size : state.size
    });
    // Sbírka varianty: kolik z dostupných je složeno (složené, které v datech už nejsou, se nepočítají)
    const collection = (state, variant, available) => {
        const set = new Set(available);
        const have = state.got[variant].filter(id => set.has(id)).length;
        return { have, total: set.size, full: set.size > 0 && have >= set.size };
    };

    // --- Výběr další skládačky: nejdřív nesložené známé, pak nesložené, pak cokoli mimo naposledy složené ---
    // candidates = [{ id, known }]; rng = Math.random nebo semínko v testech
    const pickNext = (candidates, state, variant, rng = Math.random, avoid = '') => {
        const got = new Set(state.got[variant]);
        const recent = new Set([...state.recent[variant], avoid].filter(Boolean));
        const fresh = candidates.filter(item => !got.has(item.id) && !recent.has(item.id));
        const tiers = [fresh.filter(item => item.known), fresh, candidates.filter(item => !recent.has(item.id)), candidates.filter(item => item.id !== avoid), candidates];
        const pool = tiers.find(tier => tier.length) || [];
        return pool.length ? pool[Math.floor(rng() * pool.length) % pool.length] : null;
    };

    // Možnosti tipu: správná a tři jiné, přednostně ze stejného světadílu; zamíchané
    const guessOptions = (item, candidates, rng = Math.random, total = 4) => {
        const others = candidates.filter(other => other.id !== item.id && other.name !== item.name);
        const shuffled = (list) => list.map(value => ({ value, key: rng() })).sort((a, b) => a.key - b.key).map(entry => entry.value);
        const near = shuffled(others.filter(other => item.continent && other.continent === item.continent));
        const far = shuffled(others.filter(other => !(item.continent && other.continent === item.continent)));
        const picked = [...near, ...far].slice(0, total - 1);
        return shuffled([item, ...picked]).map(option => ({ id: option.id, name: option.name, correct: option.id === item.id }));
    };

    // --- Hra: dílek p patří na místo p; groups[p] = skupina stejně vypadajících dílků (stejná skupina = zaměnitelné) ---
    const shuffleOrder = (size, rng) => {
        const order = Array.from({ length: size }, (_, i) => i);
        for (let attempt = 0; attempt < 8; attempt++) {
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1)) % (i + 1);
                [order[i], order[j]] = [order[j], order[i]];
            }
            // Zásobník nemá být seřazený (pak by šlo jen opisovat pořadí)
            if (size < 2 || order.some((piece, index) => piece !== index)) break;
        }
        return order;
    };
    const normalGroups = (groups, size) => {
        const list = Array.isArray(groups) && groups.length === size ? groups : Array.from({ length: size }, (_, i) => i);
        // Číslo skupiny = první dílek skupiny (stejné hodnoty, stejná skupina)
        const first = new Map();
        return list.map((group, index) => { if (!first.has(group)) first.set(group, index); return first.get(group); });
    };
    // daily = den Skládačky dne ('' = volná hra)
    const createGame = ({ variant, size, item, groups = null, rng = Math.random, daily = '' }) => {
        const n = SIZES.includes(size) ? size : 9;
        return {
            variant, size: n, side: sideOf(n), item, daily,
            groups: normalGroups(groups, n),
            slots: Array(n).fill(null),
            tray: shuffleOrder(n, rng),
            moves: 0, misses: {}, guess: null, done: false
        };
    };
    const placedCount = (game) => game.slots.filter(piece => piece !== null).length;
    const inTray = (game, piece) => game.tray.includes(piece);
    const fits = (game, piece, slot) => Number.isInteger(slot) && slot >= 0 && slot < game.size && game.slots[slot] === null && game.groups[piece] === game.groups[slot];
    // Položení dílku na místo: { game, result: 'placed' | 'wrong' | 'taken' | 'none' }; tah se počítá u položení i nepovedeného pokusu
    const place = (game, piece, slot) => {
        if (game.done || !inTray(game, piece) || !Number.isInteger(slot) || slot < 0 || slot >= game.size) return { game, result: 'none' };
        if (game.slots[slot] !== null) return { game, result: 'taken' };
        if (!fits(game, piece, slot)) {
            return { game: { ...game, moves: game.moves + 1, misses: { ...game.misses, [piece]: (game.misses[piece] || 0) + 1 } }, result: 'wrong' };
        }
        const slots = game.slots.slice();
        slots[slot] = piece;
        const tray = game.tray.map(entry => (entry === piece ? null : entry));
        const next = { ...game, slots, tray, moves: game.moves + 1 };
        next.done = slots.every(entry => entry !== null);
        return { game: next, result: 'placed' };
    };
    // Kam dílek patří (volná místa jeho skupiny), když už HINT_AFTER× nesedí; jinak []
    const hintFor = (game, piece) => (game.misses[piece] || 0) >= HINT_AFTER
        ? game.slots.map((entry, slot) => (entry === null && game.groups[slot] === game.groups[piece] ? slot : -1)).filter(slot => slot >= 0) : [];
    // Tip, co se skládá: jen jednou a jen před dokončením
    const canGuess = (game) => !game.done && !game.guess;
    const guess = (game, option) => canGuess(game) && option ? { ...game, guess: { id: option.id, name: option.name, correct: Boolean(option.correct) } } : game;

    // Konec skládačky: sbírka, naposledy složené, XP s rozpisem a denním stropem; Skládačka dne (game.daily = její den) jen jednou
    const finish = (state, game, dayKey) => {
        if (game.daily) return finishDaily(state, game, dayKey);
        const day = forDay(state, dayKey);
        const variant = game.variant;
        const id = game.item.id;
        const fresh = !day.got[variant].includes(id);
        const guessed = Boolean(game.guess && game.guess.correct);
        const base = SIZE_XP[game.size] || 0;
        const earned = base + (guessed ? GUESS_XP : 0);
        const room = Math.max(0, DAILY_XP_CAP - day.xp);
        const paid = Math.min(earned, room);
        const parts = [];
        const basePaid = Math.min(base, paid);
        if (basePaid > 0) parts.push({ label: `za složení (${plural(game.size, 'dílek', 'dílky', 'dílků')})`, xp: basePaid });
        if (paid - basePaid > 0) parts.push({ label: 'za uhodnutí předem', xp: paid - basePaid });
        const note = earned <= paid ? '' : paid > 0
            ? `Dnešní strop ${DAILY_XP_CAP} XP za Skládačku je naplněný.`
            : `Dnešní strop ${DAILY_XP_CAP} XP za Skládačku je vyčerpaný – sbírka roste dál.`;
        const next = {
            ...day,
            got: { ...day.got, [variant]: fresh ? [...day.got[variant], id] : day.got[variant] },
            recent: { ...day.recent, [variant]: [...day.recent[variant].filter(other => other !== id), id].slice(-RECENT) },
            done: day.done + 1,
            guessed: day.guessed + (guessed ? 1 : 0),
            xp: day.xp + paid
        };
        return { state: next, fresh, guessed, xp: { total: paid, parts, note } };
    };
    const finishDaily = (state, game, dayKey) => {
        const day = forDay(state, dayKey);
        const variant = game.variant;
        const id = game.item.id;
        const fresh = !day.got[variant].includes(id);
        const guessed = Boolean(game.guess && game.guess.correct);
        // Dohrané už jinde (jiné zařízení, účet): bez XP, zapíše se jen sbírka
        const already = Boolean(day.daily[game.daily]);
        const parts = already ? [] : [{ label: 'za Skládačku dne', xp: DAILY_XP }, ...(guessed ? [{ label: 'za uhodnutí předem', xp: GUESS_XP }] : [])];
        const next = {
            ...day,
            got: { ...day.got, [variant]: fresh ? [...day.got[variant], id] : day.got[variant] },
            done: day.done + 1,
            guessed: day.guessed + (guessed ? 1 : 0),
            daily: already ? day.daily : trimDaily({ ...day.daily, [game.daily]: { moves: Math.max(1, game.moves), v: variant, id } })
        };
        return { state: next, fresh, guessed, already, xp: { total: parts.reduce((sum, part) => sum + part.xp, 0), parts, note: already ? 'Skládačka dne už je dnes dohraná – XP za ni byly připsané.' : '' } };
    };

    // --- Skládačka dne: stejná pro všechny (pořadí států z pevného semínka, den po dni dál), varianta podle dne ---
    const dayNumber = (day) => { const [y, m, d] = String(day).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
    // Generátor se semínkem (stejný jako createSeededRandom v quiz-core.js)
    const seeded = (seedText) => {
        let value = 2166136261;
        for (let i = 0; i < seedText.length; i++) value = Math.imul(value ^ seedText.charCodeAt(i), 16777619);
        value >>>= 0;
        return () => {
            value = (value + 0x6D2B79F5) >>> 0;
            let t = value;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const mod = (a, n) => ((a % n) + n) % n;
    const dailyVariant = (day) => (mod(dayNumber(day), 2) === 0 ? 'flag' : 'outline');
    // Státy pro Skládačku dne: s vlajkou z Commons i s obrysem (v den vlajky jde bez internetu složit obrys téhož státu); známé, když jich je dost
    const dailyPool = (flags, outlines) => {
        const outlineIds = new Set(outlines.map(item => item.id));
        const both = flags.filter(item => outlineIds.has(item.id));
        const base = both.length ? both : [...flags, ...outlines];
        const known = base.filter(item => item.known);
        return [...new Set((known.length >= DAILY_KNOWN_MIN ? known : base).map(item => item.id))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    };
    // Plán dne: varianta a pořadí států (první je skládačka dne, další jen když se vlajka nenačte); dílky zamíchané semínkem dne
    const dailyPlan = (day, flags, outlines) => {
        const pool = dailyPool(flags, outlines);
        if (!pool.length) return null;
        const rng = seeded('skladacka-dne');
        const order = pool.map(id => ({ id, key: rng() })).sort((a, b) => a.key - b.key).map(entry => entry.id);
        const start = mod(dayNumber(day), order.length);
        const ids = Array.from({ length: Math.min(DAILY_FLAG_TRIES, order.length) }, (_, i) => order[(start + i) % order.length]);
        return { day, variant: dailyVariant(day), ids, size: DAILY_SIZE, seed: `skladacka-dne|${day}` };
    };
    const dailyDone = (state, day) => state.daily[day] || null;
    // Pořadí pokusů o obrázek dne [varianta, stát]: dohraná = její varianta a stát (pak obrys/vlajka téhož); jinak plán dne
    // (vlajka: až DAILY_FLAG_TRIES států v pevném pořadí, pak obrys prvního – jde i bez internetu; obrys: obrys, pak vlajka)
    const dailyAttempts = (plan, entry) => {
        const other = (variant) => (variant === 'flag' ? 'outline' : 'flag');
        const list = [];
        if (entry && entry.v && entry.id) list.push([entry.v, entry.id], [other(entry.v), entry.id]);
        if (plan.variant === 'flag') { plan.ids.forEach(id => list.push(['flag', id])); list.push(['outline', plan.ids[0]]); }
        else list.push(['outline', plan.ids[0]], ['flag', plan.ids[0]]);
        return list;
    };

    // --- Zaměnitelné dílky z pixelů: pixels = RGBA (Uint8ClampedArray) obrázku side*S × side*S, průhledné = bílé ---
    const pieceGroups = (pixels, side, sample = SAMPLE, max = SAME_MAX) => {
        const width = side * sample;
        const n = side * side;
        const value = (x, y, channel) => {
            const at = (y * width + x) * 4;
            const alpha = pixels[at + 3] / 255;
            return pixels[at + channel] * alpha + 255 * (1 - alpha);
        };
        const same = (a, b) => {
            const ax = (a % side) * sample, ay = Math.floor(a / side) * sample;
            const bx = (b % side) * sample, by = Math.floor(b / side) * sample;
            for (let y = 0; y < sample; y++) {
                for (let x = 0; x < sample; x++) {
                    for (let channel = 0; channel < 3; channel++) {
                        if (Math.abs(value(ax + x, ay + y, channel) - value(bx + x, by + y, channel)) > max) return false;
                    }
                }
            }
            return true;
        };
        const groups = [];
        for (let piece = 0; piece < n; piece++) {
            let group = piece;
            for (let earlier = 0; earlier < piece; earlier++) {
                if (groups[earlier] === earlier && same(earlier, piece)) { group = earlier; break; }
            }
            groups.push(group);
        }
        return groups;
    };

    // --- Obrys státu z data/mapa-tvary.json (prstence v tisícinách stupně, první bod a pak rozdíly) ---
    const decodeRings = (encoded) => {
        if (typeof encoded !== 'string' || !encoded || encoded.startsWith('~')) return [];
        return encoded.split(';').map(text => {
            const numbers = text.split(',').map(Number);
            const ring = [];
            let lat = 0, lon = 0;
            for (let i = 0; i + 1 < numbers.length; i += 2) {
                lat += numbers[i];
                lon += numbers[i + 1];
                ring.push([lat / 1000, lon / 1000]);
            }
            return ring;
        }).filter(ring => ring.length >= 3 && ring.every(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)));
    };
    const KM_PER_DEGREE = 111.32;
    const boxOf = (points) => points.reduce((box, [lat, lon]) => ({
        s: Math.min(box.s, lat), n: Math.max(box.n, lat), w: Math.min(box.w, lon), e: Math.max(box.e, lon)
    }), { s: Infinity, n: -Infinity, w: Infinity, e: -Infinity });
    // Plocha prstence (rovinně kolem jeho prvního bodu, délka zkrácená podle šířky bodu): na obrys státu přesné dost
    const ringKm2 = (ring) => {
        const [lat0, lon0] = ring[0];
        const xy = ring.map(([lat, lon]) => [(lon - lon0) * Math.cos(lat * Math.PI / 180), lat - lat0]);
        let sum = 0;
        for (let i = 0; i < xy.length; i++) {
            const [x1, y1] = xy[i];
            const [x2, y2] = xy[(i + 1) % xy.length];
            sum += x1 * y2 - x2 * y1;
        }
        return Math.abs(sum) / 2 * KM_PER_DEGREE * KM_PER_DEGREE;
    };
    // Obrys pro skládačku: jen hlavní území a ostrovy blízko něj (zámořská území Francie, Azory, Galapágy pryč), jinak by byla
    // pevnina malá tečka. Moc malé (do MIN_KM2), moc protáhlé (Chile) nebo řídké (souostroví v širém oceánu) se nepoužijí: null.
    const MIN_KM2 = 1500;
    const MIN_FILL = 0.1;
    const ASPECT = [0.3, 3.4];
    // Deska má poměr stran nejvýš 1 : 2; užší obrys se doplní mořem po stranách
    const BOARD_ASPECT = [0.5, 2];
    const outlineArt = (encoded) => {
        const rings = decodeRings(encoded).map(ring => ({ ring, box: boxOf(ring), km2: ringKm2(ring) }));
        if (!rings.length) return null;
        const main = rings.reduce((best, ring) => (ring.km2 > best.km2 ? ring : best));
        let cluster = { ...main.box };
        const kept = new Set([main]);
        // Přidává ostrovy, které leží blízko už vybraného území (vzdálenost podle velikosti území, aspoň 2°)
        for (let changed = true; changed;) {
            changed = false;
            const k = Math.cos(((cluster.s + cluster.n) / 2) * Math.PI / 180);
            const reach = Math.max(2, 0.5 * Math.max(cluster.n - cluster.s, (cluster.e - cluster.w) * k));
            for (const ring of rings) {
                if (kept.has(ring)) continue;
                const gapLat = Math.max(0, ring.box.s - cluster.n, cluster.s - ring.box.n);
                const gapLon = Math.max(0, ring.box.w - cluster.e, cluster.w - ring.box.e) * k;
                if (Math.max(gapLat, gapLon) <= reach) {
                    kept.add(ring);
                    cluster = { s: Math.min(cluster.s, ring.box.s), n: Math.max(cluster.n, ring.box.n), w: Math.min(cluster.w, ring.box.w), e: Math.max(cluster.e, ring.box.e) };
                    changed = true;
                }
            }
        }
        const chosen = rings.filter(ring => kept.has(ring));
        const km2 = chosen.reduce((sum, ring) => sum + ring.km2, 0);
        const k = Math.cos(((cluster.s + cluster.n) / 2) * Math.PI / 180);
        const w = (cluster.e - cluster.w) * k;
        const h = cluster.n - cluster.s;
        if (km2 < MIN_KM2 || !(w > 0) || !(h > 0)) return null;
        const aspect = w / h;
        const fill = km2 / (w * h * KM_PER_DEGREE * KM_PER_DEGREE);
        if (aspect < ASPECT[0] || aspect > ASPECT[1] || fill < MIN_FILL) return null;
        // Okraj kolem obrysu (6 % delší strany) a doplnění na poměr desky
        const pad = Math.max(w, h) * 0.06;
        let boxW = w + 2 * pad, boxH = h + 2 * pad;
        if (boxW / boxH < BOARD_ASPECT[0]) boxW = boxH * BOARD_ASPECT[0];
        if (boxW / boxH > BOARD_ASPECT[1]) boxH = boxW / BOARD_ASPECT[1];
        const scale = 1000 / Math.max(boxW, boxH);
        const width = Math.round(boxW * scale);
        const height = Math.round(boxH * scale);
        const x0 = (boxW - w) / 2, y0 = (boxH - h) / 2;
        const fmt = (value) => String(Math.round(value * 10) / 10);
        const path = chosen.map(({ ring }) => ring.map(([lat, lon], index) =>
            `${index ? 'L' : 'M'}${fmt((x0 + (lon - cluster.w) * k) * scale)} ${fmt((y0 + (cluster.n - lat)) * scale)}`).join('') + 'Z').join('');
        return { kind: 'outline', path, width, height, stroke: Math.max(2, Math.round(Math.max(width, height) * 0.006)), km2: Math.round(km2) };
    };

    // --- Rozložení obrazovky: deska a zásobník pod ní (col), nebo vedle ní (row, úzký vysoký obrázek); vrátí největší desku ---
    // aspect = šířka / výška obrázku; width a height = místo pro desku se zásobníkem; gap = mezera mezi dílky v zásobníku, between = mezi deskou a zásobníkem
    const layoutFor = ({ aspect, side, width, height, gap = 6, between = 10, scale = TRAY_SCALE }) => {
        const n = side * side;
        const options = [];
        // Pod sebou: zásobník má side sloupců a side řádků
        {
            const byWidth = Math.min(width, (width - (side - 1) * gap) / scale);
            const byHeight = (height - between - (side - 1) * gap) / (1 + scale) * aspect;
            const boardW = Math.min(byWidth, byHeight);
            if (boardW > 0) options.push({ dir: 'col', boardW, cols: side, rows: side });
        }
        // Vedle sebe: zkusí počet sloupců zásobníku, aby se vešel výškou
        for (let cols = 1; cols <= side; cols++) {
            const rows = Math.ceil(n / cols);
            const byWidth = (width - between - (cols - 1) * gap) / (1 + cols * scale / side);
            const byHeight = height * aspect;
            const byTray = (height - (rows - 1) * gap) * aspect * side / (rows * scale);
            const boardW = Math.min(byWidth, byHeight, byTray);
            if (boardW > 0) options.push({ dir: 'row', boardW, cols, rows });
        }
        if (!options.length) return null;
        // Větší deska vyhrává; pod sebou má přednost, když je skoro stejně velká (méně neobvyklé rozložení)
        const best = options.reduce((top, option) => (option.boardW > top.boardW * (option.dir === 'row' && top.dir === 'col' ? 1.12 : 1) ? option : top));
        const boardW = Math.floor(best.boardW / side) * side;
        const pieceW = boardW / side;
        const pieceH = Math.floor(pieceW / aspect * 100) / 100;
        const cellW = Math.floor(pieceW * scale * 100) / 100;
        const cellH = Math.floor(pieceH * scale * 100) / 100;
        return {
            dir: best.dir,
            board: { w: boardW, h: Math.round(pieceH * side * 100) / 100 },
            piece: { w: pieceW, h: pieceH },
            cell: { w: cellW, h: cellH },
            tray: { cols: best.cols, rows: best.rows, w: Math.ceil(best.cols * cellW + (best.cols - 1) * gap), h: Math.ceil(best.rows * cellH + (best.rows - 1) * gap) }
        };
    };

    // --- Fakt po složení ---
    const CONTINENTS = { EU: 'v Evropě', AS: 'v Asii', AF: 'v Africe', NA: 'v Severní Americe', SA: 'v Jižní Americe', OC: 'v Oceánii' };
    const capitalized = (text) => text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
    // item: data tématu (zemepis: stát s d, f.cap, f.area; vlajky: vlajka s f.cap, f.year), continent = kód světadílu z countries.json
    const factsFor = (variant, source, continent) => {
        const f = (source && source.f) || {};
        const lines = [];
        if (variant === 'outline') {
            const about = source && typeof source.d === 'string' && source.d ? capitalized(source.d) : CONTINENTS[continent] ? `Stát ${CONTINENTS[continent]}` : '';
            if (about) lines.push(`${about}${f.cap ? ` · hlavní město ${f.cap}` : ''}`);
            else if (f.cap) lines.push(`Hlavní město ${f.cap}`);
            if (Number.isFinite(f.area) && f.area > 0) lines.push(`Rozloha ${formatNumber(f.area)} km²`);
        } else {
            const where = CONTINENTS[continent] ? `Stát ${CONTINENTS[continent]}` : '';
            if (where || f.cap) lines.push([where, f.cap ? `${where ? 'hlavní' : 'Hlavní'} město ${f.cap}` : ''].filter(Boolean).join(' · '));
            if (Number.isFinite(f.year) && f.year > 0) lines.push(`Vlajka se užívá od roku ${f.year}`);
        }
        return lines.slice(0, 2);
    };

    // Kandidáti varianty z dat tématu: vlajky = vlajky států (jeden stát, obrázek z Commons), obrysy = státy z Zeměpisu s obrysem
    const flagCandidates = (items, countries) => items
        .filter(item => item && item.c === 'vlajka' && Array.isArray(item.co) && item.co.length === 1 && countries[item.co[0]] && item.im && item.ih)
        .map(item => ({ id: item.co[0], known: item.k === 1, name: countries[item.co[0]].name, continent: countries[item.co[0]].continent,
            image: { file: item.im, hash: item.ih }, facts: factsFor('flag', item, countries[item.co[0]].continent) }));
    const outlineCandidates = (items, countries, shapes) => items
        .filter(item => item && item.c === 'stat' && countries[item.q] && typeof shapes[item.q] === 'string')
        .map(item => ({ item, art: outlineArt(shapes[item.q]) }))
        .filter(entry => entry.art)
        .map(({ item, art }) => ({ id: item.q, known: item.k === 1, name: countries[item.q].name, continent: countries[item.q].continent,
            art, facts: factsFor('outline', item, countries[item.q].continent) }));

    // ===================== Obrazovky (prohlížeč) =====================
    const esc = (text) => String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const CARD = 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-sm';
    const BUTTON = 'btn-3d flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-gradient-to-b from-teal-500 to-teal-700 py-3.5 text-lg font-black text-white shadow-lg transition-all active:scale-95 short:py-3';
    const BACK_LINK = 'flex min-h-[2.75rem] w-fit items-center gap-1 rounded-lg pr-3 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white';
    const CHIP = 'flex shrink-0 items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-sm font-black tabular-nums leading-none text-slate-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/70';
    const badge = (cls = 'h-9 w-9', icon = 'h-5 w-5', uiArt = null) => ART && uiArt
        ? uiArt(ART, cls)
        : `<span class="flex ${cls} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-700 text-white shadow-sm"><i data-lucide="puzzle" class="${icon}"></i></span>`;

    // Celý obrázek skládačky (SVG obsah ve viewBoxu 0 0 width height)
    const artInner = (art) => art.kind === 'outline'
        ? `<rect width="${art.width}" height="${art.height}" class="fill-sky-100 dark:fill-sky-950"/><path d="${art.path}" fill-rule="evenodd" stroke-width="${art.stroke}" stroke-linejoin="round" class="fill-emerald-500 stroke-emerald-800 dark:fill-emerald-600 dark:stroke-emerald-200"/>`
        : `<image href="${esc(art.src)}" width="${art.width}" height="${art.height}" preserveAspectRatio="none"/>`;
    // Výřez jednoho dílku (piece = jeho správné místo)
    const pieceSvg = (art, side, piece) => {
        const w = art.width / side, h = art.height / side;
        return `<svg viewBox="${(piece % side) * w} ${Math.floor(piece / side) * h} ${w} ${h}" preserveAspectRatio="none" class="pointer-events-none block h-full w-full" aria-hidden="true" focusable="false">${artInner(art)}</svg>`;
    };
    const wholeSvg = (art, cls) => `<svg viewBox="0 0 ${art.width} ${art.height}" preserveAspectRatio="xMidYMid meet" class="${cls}" aria-hidden="true" focusable="false">${artInner(art)}</svg>`;

    // Obrázek vlajky: blob: přes photo-blob.js, pak do vlastního canvasu (zmenšený, bez názvu souboru) → vlastní blob a podpisy dílků
    const loadPicture = (src) => new Promise((resolve, reject) => {
        const image = new root.Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Obrázek se nenačetl'));
        image.src = src;
    });
    const canvasOf = (w, h) => { const canvas = root.document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; };
    // Podpisy: obrázek zmenšený na side*SAMPLE čtverečků (vykreslení podle drawArt), pak pieceGroups; když canvas nejde, každý dílek je jiný
    const groupsByPixels = (side, drawArt) => {
        try {
            const size = side * SAMPLE;
            const canvas = canvasOf(size, size);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            drawArt(ctx, size, size);
            return pieceGroups(ctx.getImageData(0, 0, size, size).data, side);
        } catch (error) {
            return null;
        }
    };
    const drawOutline = (art) => (ctx, w, h) => {
        const Path = root.Path2D;
        ctx.save();
        ctx.scale(w / art.width, h / art.height);
        const path = new Path(art.path);
        ctx.fillStyle = '#1f9d55';
        ctx.fill(path, 'evenodd');
        ctx.lineWidth = art.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#14532d';
        ctx.stroke(path);
        ctx.restore();
    };

    const createController = (deps) => {
        const doc = root.document;
        let state = parse(deps.readJson(STORAGE_KEY));
        let game = null;      // právě ukázaná skládačka (volná, Skládačka dne, nebo jen prohlížený výsledek Skládačky dne)
        let freeGame = null;  // rozehraná volná skládačka (jen v paměti: po odchodu jde dohrát, dokud se aplikace nezavře)
        let dailyGame = null; // rozehraná Skládačka dne (také jen v paměti, zvlášť, ať se volnou hrou neztratí)
        let fromHome = false; // Skládačka dne otevřená ze záložky Dnes (akce puzzle-today): Zpět vede zpátky tam, ne na úvod Skládačky
        let phase = 'intro';  // 'intro' | 'loading' | 'play' | 'done' | 'error'
        let selected = null;  // vybraný dílek (klepnutím)
        let message = '';     // řádek stavu pod deskou (i pro čtečku)
        let guessing = false; // místo zásobníku možnosti tipu
        let outcome = null;   // výsledek po složení (sbírka, XP)
        let error = null;
        let snapSlot = -1;    // místo, kam dílek právě zapadl (animace)
        let flyFrom = null;   // odkud dílek letí do místa (po tažení)
        let loadToken = 0;
        let layoutObserver = null;
        let doneTimer = null;
        const candidatesCache = {};
        const save = () => deps.writeJson(STORAGE_KEY, state);
        const today = () => deps.getDayKey();
        const stillMotion = () => Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const live = () => deps.getScreen() === 'puzzle';
        const icons = (element) => deps.renderIcons(element || deps.appContent);

        const loadCandidates = (variant) => {
            if (!candidatesCache[variant]) {
                candidatesCache[variant] = (async () => {
                    const [ctx, countries] = await Promise.all([deps.loadTopic(VARIANTS[variant].topic), deps.loadCountries()]);
                    if (variant === 'flag') return flagCandidates(ctx.items, countries);
                    const shapes = await deps.loadShapes();
                    return outlineCandidates(ctx.items, countries, shapes || {});
                })().catch(err => { delete candidatesCache[variant]; throw err; });
            }
            return candidatesCache[variant];
        };
        const knownCounts = {};
        const refreshCounts = () => Promise.all(VARIANT_IDS.map(variant => loadCandidates(variant).then(list => { knownCounts[variant] = list.map(item => item.id); }, () => null)))
            .then(() => { if (live() && phase === 'intro') render(); });

        // Vlajka: obrázek z Commons (náhled PNG, když nejde, původní soubor) → vlastní canvas → vlastní blob a skupiny dílků
        const prepareFlag = async (candidate, side) => {
            const urls = [deps.commonsPhotoUrl(candidate.image.file, candidate.image.hash, 500), deps.commonsFileUrl(candidate.image.file, candidate.image.hash)];
            for (const url of urls) {
                const loaded = deps.photoBlob ? await deps.photoBlob.load(url).catch(() => null) : { src: url };
                if (!loaded) continue;
                const image = await loadPicture(loaded.src).catch(() => null);
                if (!image || !image.naturalWidth || !image.naturalHeight) continue;
                const scale = Math.min(1, 600 / image.naturalWidth);
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                const groups = groupsByPixels(side, (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h));
                let src = loaded.src;
                try {
                    const canvas = canvasOf(width, height);
                    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    if (blob) src = root.URL.createObjectURL(blob);
                } catch (err) { /* canvas nejde (cizí obrázek bez CORS): ukáže se blob z photo-blob.js */ }
                return { art: { kind: 'image', src, width, height, own: src !== loaded.src }, groups };
            }
            return null;
        };
        const revoke = (src) => { try { root.URL.revokeObjectURL(src); } catch (err) { /* nic */ } };
        // Nová skládačka na místo (slot 'free' / 'daily' / '' = jen prohlížená); vlastní blob vlajky, kterou už nic nedrží, se uvolní
        const setGame = (next, slot) => {
            const before = [game, freeGame, dailyGame];
            game = next;
            if (slot === 'free') freeGame = next;
            if (slot === 'daily') dailyGame = next;
            for (const old of new Set(before)) {
                if (old && old !== game && old !== freeGame && old !== dailyGame && old.item.art.own && old.item.art.src !== next.item.art.src) revoke(old.item.art.src);
            }
        };
        // Tah nebo tip: nový stav téže skládačky (i na jejím místě, aby šla po odchodu dohrát)
        const updateGame = (next) => {
            if (freeGame === game) freeGame = next;
            if (dailyGame === game) dailyGame = next;
            game = next;
        };
        // Obrázek skládačky: vlajka (null, když se nenačte) nebo obrys; s podpisy dílků
        const makeArt = async (variant, candidate, side) => {
            if (variant === 'flag') return prepareFlag(candidate, side);
            return candidate.art ? { art: candidate.art, groups: groupsByPixels(side, drawOutline(candidate.art)) } : null;
        };

        // --- Úvod ---
        const variantCard = (variant) => {
            const def = VARIANTS[variant];
            const list = knownCounts[variant];
            const stats = list ? collection(state, variant, list) : null;
            const on = state.variant === variant;
            const share = stats && stats.total ? Math.round(stats.have / stats.total * 100) : 0;
            return `
                <button type="button" data-action="puzzle-variant" data-variant="${variant}" aria-pressed="${on}" class="flex min-h-[4.5rem] min-w-0 flex-col items-start gap-1 rounded-2xl border-2 px-3 py-2 text-left transition-colors short:min-h-[4rem] short:py-1.5 ${on ? 'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-100' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}">
                    <span class="flex w-full items-center gap-1.5 text-[15px] font-black leading-tight"><i data-lucide="${def.icon}" class="h-4 w-4 shrink-0"></i><span class="min-w-0 flex-1 truncate">${esc(def.title)}</span><i data-lucide="${on ? 'circle-check' : 'circle'}" class="h-4 w-4 shrink-0 ${on ? '' : 'opacity-40'}"></i></span>
                    <span data-puzzle-count="${variant}" class="text-xs font-bold tabular-nums leading-tight text-slate-600 dark:text-slate-300">${stats ? `Sbírka ${stats.have} / ${stats.total}` : 'Sbírka …'}</span>
                    <span class="block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span data-puzzle-bar="${share}" class="block h-full rounded-full bg-teal-500"></span></span>
                </button>`;
        };
        const sizeButton = (size) => {
            const on = state.size === size;
            const side = sideOf(size);
            return `<button type="button" data-action="puzzle-size" data-size="${size}" aria-pressed="${on}" aria-label="${plural(size, 'dílek', 'dílky', 'dílků')} (${side} × ${side})" class="flex min-h-[3rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-1 leading-tight transition-colors short:min-h-[2.75rem] ${on ? 'border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-600' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}"><span class="text-lg font-black tabular-nums">${size}</span><span class="text-[11px] font-bold ${on ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}">${side} × ${side}</span></button>`;
        };
        // Karta Skládačka dne nahoře na úvodu: nesplněná = Hrát (nebo Pokračovat), splněná = fajfka, počet tahů a Ukázat
        const dailyCard = () => {
            const info = dailyInfo();
            const button = info.done
                ? 'btn-3d-light bg-white text-slate-700 dark:bg-slate-700 dark:text-slate-100'
                : 'btn-3d bg-gradient-to-b from-teal-500 to-teal-700 text-white';
            return `
                <section data-puzzle-daily="${info.done ? 'done' : 'open'}" class="${CARD} flex items-center gap-3 px-3 py-2.5 short:py-2" aria-labelledby="puzzle-daily-title">
                    <div class="min-w-0 flex-1">
                        <h3 id="puzzle-daily-title" class="flex items-center gap-1.5 text-[15px] font-black leading-tight text-slate-800 dark:text-slate-50"><i data-lucide="${info.done ? 'circle-check' : 'calendar-days'}" class="h-4 w-4 shrink-0 ${info.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-600 dark:text-teal-400'}"></i> Skládačka dne</h3>
                        <p data-puzzle-daily-label class="mt-0.5 truncate text-[13px] font-bold leading-snug ${info.done ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}">${esc(info.done ? info.label : `${info.label} · +${DAILY_XP} XP`)}</p>
                    </div>
                    <button type="button" data-action="puzzle-daily" class="${button} flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-2xl px-4 text-sm font-black">
                        <i data-lucide="${info.done ? 'eye' : 'play'}" class="h-4 w-4"></i> ${info.done ? 'Ukázat' : info.playing ? 'Pokračovat' : 'Hrát'}
                    </button>
                </section>`;
        };
        const renderIntro = () => {
            const left = xpLeftToday(state, today());
            const resume = freeGame && !freeGame.done;
            const xpText = left > 0
                ? `Za složení ${SIZE_XP[4]}–${SIZE_XP[16]} XP, za tip +${GUESS_XP} XP · dnes ještě až ${left} XP`
                : `Dnešní strop ${DAILY_XP_CAP} XP je vyčerpaný – sbírka roste dál.`;
            deps.appContent.innerHTML = `
                <div id="puzzle-intro" data-puzzle-phase="intro" class="fade-in flex min-h-full w-full flex-col gap-3 bg-slate-50 p-4 short:gap-2 short:p-3 dark:bg-slate-900">
                    <div class="flex items-center gap-3">
                        ${badge('h-14 w-14 short:h-12 short:w-12', 'h-7 w-7', deps.uiArt)}
                        <div class="min-w-0">
                            <h2 class="text-2xl font-black leading-tight text-slate-800 dark:text-slate-50">Skládačka</h2>
                            <p class="text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">Slož obrázek z dílků. Bez časovače, v klidu.</p>
                        </div>
                    </div>
                    ${dailyCard()}
                    <div class="grid grid-cols-2 gap-2" role="group" aria-label="Co skládat">${VARIANT_IDS.map(variantCard).join('')}</div>
                    <div class="grid grid-cols-3 gap-2" role="group" aria-label="Počet dílků">${SIZES.map(sizeButton).join('')}</div>
                    <ul class="${CARD} flex flex-col gap-2 p-3 short:gap-1.5 short:p-2.5">
                        ${rules().map(rule => `<li class="flex items-center gap-2.5 text-[13px] font-semibold leading-snug text-slate-700 short:text-[12.5px] dark:text-slate-200"><i data-lucide="${rule.icon}" class="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400"></i><span>${esc(rule.text)}</span></li>`).join('')}
                    </ul>
                    <p data-puzzle-xp class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">${esc(xpText)}</p>
                    <div class="mt-auto flex flex-col gap-1">
                        ${resume ? `<button type="button" data-action="puzzle-resume" class="${BUTTON}"><i data-lucide="play" class="h-5 w-5"></i> Pokračovat ve skládání</button>` : ''}
                        <button type="button" data-action="puzzle-start" class="${resume ? 'flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-[1.2rem] bg-slate-200 px-4 py-2.5 text-base font-bold text-slate-700 active:scale-95 dark:bg-slate-800 dark:text-slate-200' : BUTTON}"><i data-lucide="${resume ? 'shuffle' : 'puzzle'}" class="h-5 w-5"></i> ${resume ? 'Nová skládačka' : 'Skládat'}</button>
                    </div>
                </div>`;
            deps.appContent.querySelectorAll('[data-puzzle-bar]').forEach(bar => bar.style.setProperty('width', `${bar.dataset.puzzleBar}%`));
        };

        const renderLoading = () => {
            deps.appContent.innerHTML = `
                <div id="puzzle-loading" data-puzzle-phase="loading" class="flex min-h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center dark:bg-slate-900">
                    ${badge('bob h-16 w-16', 'h-8 w-8', deps.uiArt)}
                    <p class="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Chystám skládačku…</p>
                </div>`;
        };
        const renderError = () => {
            const offline = root.navigator && root.navigator.onLine === false;
            const flag = state.variant === 'flag';
            deps.appContent.innerHTML = `
                <div id="puzzle-error" data-puzzle-phase="error" class="fade-in flex min-h-full flex-col items-center justify-center gap-2 bg-slate-50 p-8 text-center dark:bg-slate-900">
                    <i data-lucide="${offline ? 'wifi-off' : 'search-x'}" class="mb-2 h-14 w-14 text-slate-300 dark:text-slate-600"></i>
                    <h2 class="text-xl font-bold text-slate-700 dark:text-slate-200">${offline ? 'Chyba spojení' : 'Skládačka se nepřipravila'}</h2>
                    <p class="mb-3 text-slate-500 dark:text-slate-400">${flag ? 'Vlajku se nepodařilo stáhnout. Zkontroluj připojení k internetu, nebo zkus obrys státu – ten jde i bez internetu.' : 'Zkus to prosím znovu.'}</p>
                    <button type="button" data-action="puzzle-start" class="rounded-2xl bg-teal-700 px-6 py-3 font-bold text-white shadow-lg active:scale-95">Zkusit znovu</button>
                    ${flag ? '<button type="button" data-action="puzzle-variant" data-variant="outline" data-start="1" class="rounded-2xl px-4 py-3 font-bold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300">Skládat obrys státu</button>' : ''}
                    <button type="button" data-action="puzzle-intro" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět</button>
                </div>`;
        };

        // --- Hra ---
        const statusText = () => {
            if (message) return message;
            if (selected !== null) return 'Dílek je vybraný. Klepni na místo, kam patří.';
            return placedCount(game) ? `Složeno ${placedCount(game)} z ${game.size}.` : 'Přetáhni dílek na desku, nebo ho klepnutím vyber.';
        };
        const renderPlay = () => {
            const g = game;
            const hints = selected !== null ? hintFor(g, selected) : [];
            const slots = g.slots.map((piece, slot) => {
                const row = Math.floor(slot / g.side) + 1, col = (slot % g.side) + 1;
                if (piece !== null) {
                    return `<div data-pz-slot="${slot}" data-filled="1" class="relative overflow-hidden ${slot === snapSlot ? 'pz-snap' : ''}" role="img" aria-label="Místo ${row}. řádek, ${col}. sloupec: dílek sedí">${pieceSvg(g.item.art, g.side, piece)}</div>`;
                }
                const hinted = hints.includes(slot);
                return `<button type="button" data-pz-slot="${slot}" aria-label="Místo ${row}. řádek, ${col}. sloupec${hinted ? ' – sem dílek patří' : ''}" class="relative outline-dashed outline-1 -outline-offset-1 outline-slate-300 transition-colors dark:outline-slate-600 ${hinted ? 'pz-hint bg-gold-200/70 outline-2 outline-gold-500 dark:bg-gold-700/40 dark:outline-gold-400' : 'hover:bg-teal-100/60 dark:hover:bg-teal-900/40'}"></button>`;
            }).join('');
            const tray = guessing ? guessPanel() : g.tray.map((piece, index) => piece === null
                ? '<span aria-hidden="true" class="block aspect-[var(--pz-ratio)] rounded-md border border-dashed border-slate-200 dark:border-slate-700/70"></span>'
                : `<button type="button" data-pz-piece="${piece}" aria-pressed="${selected === piece}" aria-label="Dílek ${index + 1}${selected === piece ? ', vybraný' : ''}" class="pz-piece relative block aspect-[var(--pz-ratio)] touch-none select-none overflow-hidden rounded-md shadow-md ring-1 ring-slate-300/80 transition-transform dark:ring-slate-600 ${selected === piece ? 'z-10 scale-[1.06] ring-[3px] ring-teal-500 dark:ring-teal-400' : ''}">${pieceSvg(g.item.art, g.side, piece)}</button>`).join('');
            const name = g.guess && g.guess.correct ? g.item.name : '';
            deps.appContent.innerHTML = `
                <div id="puzzle-screen" data-puzzle-phase="play" data-size="${g.size}" data-variant="${g.variant}" class="flex h-full min-h-0 w-full flex-col gap-2 bg-slate-50 p-3 pb-2 dark:bg-slate-900">
                    <div data-pz-top class="flex items-center gap-2">
                        <span class="${CHIP}" aria-label="Složeno ${placedCount(g)} z ${g.size}"><i data-lucide="puzzle" class="h-4 w-4 text-teal-600 dark:text-teal-400"></i><span data-pz-placed>${placedCount(g)}</span><span class="text-xs font-bold text-slate-500 dark:text-slate-400">/ ${g.size}</span></span>
                        <span class="${CHIP}" aria-label="Tahy: ${g.moves}"><span class="text-xs font-bold text-slate-500 dark:text-slate-400">Tahy</span><span data-pz-moves>${g.moves}</span></span>
                        <span class="min-w-0 flex-1"></span>
                        ${name ? `<span data-pz-named class="min-w-0 truncate rounded-xl bg-emerald-50 px-2.5 py-1.5 text-sm font-black text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800">${esc(name)}</span>` : ''}
                        ${canGuess(g) ? `<button type="button" data-action="puzzle-guess" aria-expanded="${guessing}" class="flex min-h-[2.5rem] shrink-0 items-center gap-1.5 rounded-xl btn-3d-light bg-white px-2.5 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-100"><i data-lucide="circle-help" class="h-4 w-4 text-gold-600 dark:text-gold-400"></i> Co to je?</button>` : ''}
                    </div>
                    <div data-pz-area class="flex min-h-0 flex-1 items-center justify-center">
                        <div data-pz-wrap class="flex items-center justify-center gap-2.5">
                            <div data-pz-board class="grid h-[var(--pz-board-h)] w-[var(--pz-board-w)] shrink-0 ${['', '', 'grid-cols-2 grid-rows-2', 'grid-cols-3 grid-rows-3', 'grid-cols-4 grid-rows-4'][g.side]} overflow-hidden rounded-lg bg-white shadow-inner ring-1 ring-slate-300 dark:bg-slate-800 dark:ring-slate-600 ${g.done ? 'pz-complete' : ''}" role="group" aria-label="Deska ${g.side} × ${g.side}">${slots}</div>
                            <div data-pz-tray class="grid w-[var(--pz-tray-w)] shrink-0 gap-1.5 ${guessing ? 'grid-cols-2' : 'grid-cols-1'}" role="group" aria-label="${guessing ? 'Co to je?' : 'Zásobník dílků'}">${tray}</div>
                        </div>
                    </div>
                    <p data-pz-status role="status" class="min-h-[2.5rem] text-center text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(statusText())}</p>
                </div>`;
            icons(deps.appContent.querySelector('[data-pz-top]'));
            if (guessing) icons(deps.appContent.querySelector('[data-pz-tray]'));
            layout();
            bindPlay();
        };
        const guessPanel = () => {
            const options = game.options || [];
            return options.map(option => `<button type="button" data-action="puzzle-guess-pick" data-id="${esc(option.id)}" class="btn-3d-light flex min-h-[3rem] items-center justify-center rounded-xl bg-white px-2 py-1.5 text-center text-sm font-bold leading-tight text-slate-700 dark:bg-slate-700 dark:text-slate-100">${esc(option.name)}</button>`).join('')
                + '<button type="button" data-action="puzzle-guess-cancel" class="col-span-2 flex min-h-[2.75rem] items-center justify-center gap-1 text-sm font-bold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět ke skládání</button>';
        };
        // Velikost desky a zásobníku podle volného místa (CSS proměnné přes CSSOM; inline styly CSP nedovolí)
        const layout = () => {
            const screen = deps.appContent.querySelector('#puzzle-screen');
            if (!screen || !game) return;
            const area = screen.querySelector('[data-pz-area]');
            const wrap = screen.querySelector('[data-pz-wrap]');
            const tray = screen.querySelector('[data-pz-tray]');
            const art = game.item.art;
            const fit = layoutFor({ aspect: art.width / art.height, side: game.side, width: area.clientWidth, height: area.clientHeight, gap: 6, between: 10 });
            if (!fit) return;
            screen.style.setProperty('--pz-board-w', `${fit.board.w}px`);
            screen.style.setProperty('--pz-board-h', `${fit.board.h}px`);
            screen.style.setProperty('--pz-ratio', `${art.width / game.side} / ${art.height / game.side}`);
            wrap.classList.toggle('flex-col', fit.dir === 'col');
            wrap.classList.toggle('flex-row', fit.dir === 'row');
            if (guessing) {
                screen.style.setProperty('--pz-tray-w', `${Math.min(area.clientWidth, Math.max(fit.board.w, 280))}px`);
                tray.classList.remove(...['grid-cols-1', 'grid-cols-3', 'grid-cols-4']);
            } else {
                screen.style.setProperty('--pz-tray-w', `${fit.tray.w}px`);
                tray.classList.remove(...['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4']);
                tray.classList.add(['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][fit.tray.cols]);
            }
        };
        const watchLayout = () => {
            if (layoutObserver || typeof root.ResizeObserver !== 'function') return;
            let last = '';
            layoutObserver = new root.ResizeObserver(() => {
                const key = `${deps.appContent.clientWidth}x${deps.appContent.clientHeight}`;
                if (key === last) return;
                last = key;
                if (live() && phase === 'play') layout();
            });
            layoutObserver.observe(deps.appContent);
        };

        // Zvuk a vibrace zapadnutí; po složení celého obrázku slavnostní tón
        const snapFeedback = (done) => {
            if (!deps.sound) return;
            deps.sound.play(done ? 'puzzle' : 'snap');
            deps.sound.vibrate(done ? 'puzzle' : 'snap');
        };
        // Pokus o položení (klepnutím i tažením); from = obdélník, odkud dílek přiletěl (tažení), jinak null
        const attempt = (piece, slot, from = null) => {
            if (!game || game.done) return 'none';
            const { game: next, result } = place(game, piece, slot);
            if (result === 'none' || result === 'taken') return result;
            updateGame(next);
            if (result === 'placed') {
                selected = null;
                snapSlot = slot;
                flyFrom = from;
                const left = game.size - placedCount(game);
                message = game.done ? 'Hotovo! Obrázek je složený.' : `Zapadl. ${left === 1 ? 'Zbývá 1 dílek.' : left <= 4 ? `Zbývají ${left} dílky.` : `Zbývá ${left} dílků.`}`;
                snapFeedback(game.done);
                renderPlay();
                animateSnap();
                if (game.done) scheduleDone();
            } else {
                const hint = hintFor(game, piece).length > 0;
                selected = piece;
                message = hint ? 'Sem nepatří. Zvýrazněné místo je správné.' : 'Sem tenhle dílek nepatří. Zkus jiné místo.';
                snapSlot = -1;
                renderPlay();
            }
            return result;
        };
        const animateSnap = () => {
            const target = snapSlot >= 0 ? deps.appContent.querySelector(`[data-pz-slot="${snapSlot}"]`) : null;
            if (target && flyFrom && !stillMotion() && typeof target.animate === 'function') {
                const to = target.getBoundingClientRect();
                const dx = flyFrom.left + flyFrom.width / 2 - (to.left + to.width / 2);
                const dy = flyFrom.top + flyFrom.height / 2 - (to.top + to.height / 2);
                target.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.05)` }, { transform: 'translate(0, 0) scale(1)' }], { duration: 140, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
            }
            flyFrom = null;
        };
        const scheduleDone = () => {
            clearTimeout(doneTimer);
            const g = game;
            doneTimer = setTimeout(() => { if (game === g && live()) completeGame(); }, stillMotion() ? 400 : 750);
        };
        const completeGame = () => {
            // Stav znovu ze zařízení: Skládačku dne mohl mezitím dohrát jiné zařízení (synchronizace účtu)
            state = parse(deps.readJson(STORAGE_KEY));
            const result = finish(state, game, today());
            state = result.state;
            save();
            outcome = { ...result, xp: result.xp.total || result.xp.note ? deps.awardXp(result.xp) : result.xp };
            phase = 'done';
            render();
        };

        // --- Tažení (myš, dotyk, pero): dílek ze zásobníku na místo; klepnutí bez pohybu = výběr ---
        let drag = null;
        // Dotyk: překreslí se až po dokončení dotyku (touchend míří na dílek; kdyby zmizel dřív, prohlížeč by mohl spolknout další klepnutí)
        const later = (event, fn) => (event.pointerType === 'touch' ? setTimeout(fn, 0) : fn());
        const DRAG_START = 6;
        const slotAt = (x, y) => {
            const hit = doc.elementFromPoint(x, y);
            const slot = hit && hit.closest ? hit.closest('[data-pz-slot]') : null;
            return slot && deps.appContent.contains(slot) ? slot : null;
        };
        const moveGhost = (x, y) => {
            if (!drag || !drag.ghost) return;
            drag.ghost.style.transform = `translate(${x - drag.offX}px, ${y - drag.offY}px)`;
            const slot = slotAt(x, y);
            if (slot !== drag.over) {
                if (drag.over) drag.over.classList.remove('pz-over');
                drag.over = slot && !slot.dataset.filled ? slot : null;
                if (drag.over) drag.over.classList.add('pz-over');
            }
        };
        const startGhost = (event) => {
            const board = deps.appContent.querySelector('[data-pz-board]');
            const slotRect = board ? board.firstElementChild.getBoundingClientRect() : drag.source.getBoundingClientRect();
            const sourceRect = drag.source.getBoundingClientRect();
            const ghost = doc.createElement('div');
            ghost.className = 'pz-ghost pointer-events-none fixed left-0 top-0 z-[80] overflow-hidden rounded-md shadow-2xl ring-2 ring-teal-500';
            ghost.setAttribute('aria-hidden', 'true');
            ghost.innerHTML = pieceSvg(game.item.art, game.side, drag.piece);
            ghost.style.width = `${slotRect.width}px`;
            ghost.style.height = `${slotRect.height}px`;
            // Dílek drží pod prstem na stejném místě, jaké hráč chytil (poměrně ke zvětšenému dílku)
            drag.offX = (event.clientX - sourceRect.left) / sourceRect.width * slotRect.width;
            drag.offY = (event.clientY - sourceRect.top) / sourceRect.height * slotRect.height;
            doc.body.appendChild(ghost);
            drag.ghost = ghost;
            drag.source.classList.add('opacity-30');
            selected = null;
        };
        const endDrag = (event, cancelled) => {
            const current = drag;
            drag = null;
            if (!current) return;
            if (current.over) current.over.classList.remove('pz-over');
            if (!current.ghost) return;
            // Klik, který po tažení přijde, nic nevybere
            pointerTapUntil = Date.now() + 800;
            const slot = cancelled ? null : slotAt(event.clientX, event.clientY);
            later(event, () => drop(current, slot, cancelled));
        };
        const drop = (current, slot, cancelled) => {
            const ghost = current.ghost;
            const ghostRect = ghost.getBoundingClientRect();
            const result = slot && slot.isConnected && !slot.dataset.filled ? attempt(current.piece, Number(slot.dataset.pzSlot), ghostRect) : 'none';
            if (result === 'placed') { ghost.remove(); return; }
            // Zpět do zásobníku (bez trestu)
            const back = deps.appContent.querySelector(`[data-pz-piece="${current.piece}"]`);
            if (back) back.classList.remove('opacity-30');
            if (back && !stillMotion() && typeof ghost.animate === 'function') {
                const to = back.getBoundingClientRect();
                const anim = ghost.animate([{ transform: ghost.style.transform, opacity: 1 }, { transform: `translate(${to.left}px, ${to.top}px) scale(${to.width / ghostRect.width}, ${to.height / ghostRect.height})`, opacity: 0.4 }],
                    { duration: 180, easing: 'ease-in', fill: 'forwards' });
                anim.onfinish = () => ghost.remove();
                anim.oncancel = () => ghost.remove();
            } else ghost.remove();
            if (result === 'none' && !cancelled && game && !game.done && slot === null) {
                message = 'Dílek se vrátil do zásobníku.';
                const status = deps.appContent.querySelector('[data-pz-status]');
                if (status) status.textContent = message;
            }
        };
        const tapPiece = (id) => {
            if (!game || game.done || !game.tray.includes(id)) return;
            selected = selected === id ? null : id;
            message = '';
            snapSlot = -1;
            renderPlay();
            const again = deps.appContent.querySelector(`[data-pz-piece="${id}"]`);
            if (again) again.focus({ preventScroll: true });
        };
        const tapSlot = (index) => {
            if (!game || game.done || game.slots[index] !== null) return;
            if (selected === null) {
                message = 'Nejdřív vyber dílek ze zásobníku.';
                const status = deps.appContent.querySelector('[data-pz-status]');
                if (status) status.textContent = message;
                return;
            }
            const result = attempt(selected, index);
            // Po položení fokus na další dílek v zásobníku (klávesnice), po nepovedeném zůstane na místě
            const next = result === 'placed' ? deps.appContent.querySelector('[data-pz-piece]') : deps.appContent.querySelector(`[data-pz-slot="${index}"]`);
            if (next && next.focus) next.focus({ preventScroll: true });
        };
        // Klepnutí se vyřídí už při puštění (pointerup), ne až kliknutím: po tažení prstem prohlížeč někdy další klik spolkne.
        // Klik, který po klepnutí přijde (detail > 0), se pak přeskočí; klik z klávesnice (Enter, mezerník: detail 0) platí vždy.
        let pointerTapUntil = 0;
        let press = null;
        const bindPlay = () => {
            const screen = deps.appContent.querySelector('#puzzle-screen');
            if (!screen) return;
            screen.addEventListener('pointerdown', (event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                const piece = event.target.closest('[data-pz-piece]');
                const slot = event.target.closest('button[data-pz-slot]');
                press = slot ? { slot: Number(slot.dataset.pzSlot), id: event.pointerId, x: event.clientX, y: event.clientY } : null;
                if (!piece || drag) return;
                drag = { piece: Number(piece.dataset.pzPiece), source: piece, x: event.clientX, y: event.clientY, ghost: null, over: null, id: event.pointerId };
                // Dotyk má zachycení ukazatele sám od sebe (implicitní), myš a pero ho potřebují, aby tažení neuteklo mimo dílek
                if (event.pointerType !== 'touch') { try { piece.setPointerCapture(event.pointerId); } catch (err) { /* nic */ } }
            });
            screen.addEventListener('pointermove', (event) => {
                if (!drag || event.pointerId !== drag.id) return;
                if (!drag.ghost) {
                    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START) return;
                    startGhost(event);
                }
                event.preventDefault();
                moveGhost(event.clientX, event.clientY);
            });
            screen.addEventListener('pointerup', (event) => {
                if (drag && event.pointerId === drag.id) {
                    if (drag.ghost) { endDrag(event, false); return; }
                    const piece = drag.piece;
                    drag = null;
                    pointerTapUntil = Date.now() + 800;
                    later(event, () => tapPiece(piece));
                    return;
                }
                const tapped = press;
                press = null;
                if (tapped && tapped.id === event.pointerId && Math.hypot(event.clientX - tapped.x, event.clientY - tapped.y) < 12) {
                    pointerTapUntil = Date.now() + 800;
                    later(event, () => tapSlot(tapped.slot));
                }
            });
            screen.addEventListener('pointercancel', (event) => { press = null; if (drag && event.pointerId === drag.id) endDrag(event, true); });
            screen.addEventListener('lostpointercapture', (event) => { if (drag && event.pointerId === drag.id && drag.ghost) endDrag(event, false); });
            screen.addEventListener('click', (event) => {
                const piece = event.target.closest('[data-pz-piece]');
                const slot = event.target.closest('button[data-pz-slot]');
                if (!piece && !slot) return;
                if (event.detail > 0 && Date.now() < pointerTapUntil) { event.preventDefault(); return; }
                if (piece) tapPiece(Number(piece.dataset.pzPiece));
                else tapSlot(Number(slot.dataset.pzSlot));
            });
        };

        // --- Po složení ---
        const renderDone = () => {
            const g = game;
            const variant = VARIANTS[g.variant];
            const list = knownCounts[g.variant] || [];
            const stats = collection(state, g.variant, list);
            const guessLine = !g.guess ? '' : g.guess.correct
                ? `<p data-pz-guess="1" class="flex items-center gap-1.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-300"><i data-lucide="circle-check" class="h-4 w-4 shrink-0"></i> Uhodnuto dřív, než bylo hotovo!</p>`
                : `<p data-pz-guess="0" class="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300"><i data-lucide="info" class="h-4 w-4 shrink-0"></i> Tip byl ${esc(g.guess.name)}. Příště to vyjde.</p>`;
            deps.appContent.innerHTML = `
                <div id="puzzle-done" data-puzzle-phase="done" class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-4 short:gap-2 short:p-3 dark:bg-slate-900">
                    <div class="flex min-h-0 flex-1 items-center justify-center">
                        ${wholeSvg(g.item.art, 'pz-reveal max-h-[34dvh] w-full max-w-[20rem] rounded-lg drop-shadow-md short:max-h-[28dvh]')}
                    </div>
                    <div data-verdict tabindex="-1" class="flex flex-col gap-1 outline-none">
                        <p class="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${esc(g.daily ? 'Skládačka dne' : variant.title)} · ${plural(g.size, 'dílek', 'dílky', 'dílků')} · ${plural(g.moves, 'tah', 'tahy', 'tahů')}</p>
                        <div class="flex items-center gap-2.5">
                            <span data-pz-flag aria-hidden="true" class="hidden h-6 max-w-[3.25rem] shrink-0 overflow-hidden rounded-[5px] bg-white ring-1 ring-slate-300 dark:ring-slate-500"></span>
                            <h2 data-pz-name class="min-w-0 text-2xl font-black leading-tight text-slate-800 dark:text-slate-50">${esc(g.item.name)}</h2>
                        </div>
                        ${(g.item.facts || []).map(line => `<p class="text-[13.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(line)}</p>`).join('')}
                        ${guessLine}
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        ${g.review ? `<span data-pz-daily-done class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-black text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"><i data-lucide="circle-check" class="h-4 w-4"></i> Skládačka dne je hotová</span>` : ''}
                        <span data-pz-collection class="inline-flex items-center gap-1.5 rounded-full ${outcome && outcome.fresh ? 'bg-gold-400 text-brand-950' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'} px-3 py-1 text-[13px] font-black"><i data-lucide="${outcome && outcome.fresh ? 'sparkles' : 'layers'}" class="h-4 w-4"></i> ${outcome && outcome.fresh ? (stats.full ? 'Celá sbírka je složená' : 'Nové ve sbírce') : 'Už ve sbírce'} · ${stats.have} / ${stats.total}</span>
                    </div>
                    ${g.daily && deps.rank ? deps.rank.strip('puzzle', g.daily) : ''}
                    ${outcome && (outcome.xp.total || outcome.xp.note) ? `<div data-pz-xp class="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">${deps.xpLine(outcome.xp, 'text-slate-700 dark:text-slate-200')}${outcome.xp.note ? `<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">${esc(outcome.xp.note)}</p>` : ''}</div>` : ''}
                    <div class="flex items-center gap-2">
                        <button type="button" data-action="puzzle-intro" class="flex min-h-[3.25rem] shrink-0 items-center justify-center gap-1.5 rounded-[1.2rem] bg-slate-200 px-4 text-base font-bold text-slate-700 active:scale-95 dark:bg-slate-800 dark:text-slate-200"><i data-lucide="${g.daily ? 'chevron-left' : 'settings-2'}" class="h-5 w-5"></i> ${g.daily ? 'Zpět' : 'Změnit'}</button>
                        ${g.daily
                            ? `<button type="button" data-action="puzzle-start" class="${BUTTON} min-h-[3.25rem] min-w-0 flex-1">Hrát volně <i data-lucide="arrow-right" class="h-6 w-6"></i></button>`
                            : `<button type="button" data-action="puzzle-next" class="${BUTTON} min-h-[3.25rem] min-w-0 flex-1 text-xl">Další <i data-lucide="arrow-right" class="h-6 w-6"></i></button>`}
                    </div>
                </div>`;
            miniFlag(g);
            const verdict = deps.appContent.querySelector('[data-verdict]');
            if (verdict) verdict.focus({ preventScroll: true });
            // Pořadí dne (minigame-rank.js): výsledek Skládačky dne na server (server vezme první) a pořadí mezi hráči stejného obrázku
            if (g.daily && deps.rank) deps.rank.sync('puzzle', g.daily, { value: g.moves, variant: `${g.variant}:${g.item.id}` });
        };
        // Malá vlajka státu u názvu: u vlajky ze skládačky samé, u obrysu z tématu Vlajky (náhled z Commons přes photo-blob.js).
        // Když se nenačte, zůstane skrytá. Rámeček, aby byla vidět i bílá vlajka v tmavém režimu.
        const miniFlag = (g) => {
            const holder = deps.appContent.querySelector('[data-pz-flag]');
            if (!holder) return;
            const show = (src) => {
                if (!holder.isConnected || !src) return;
                const img = doc.createElement('img');
                img.alt = '';
                img.className = 'block h-full w-auto max-w-none';
                img.onload = () => { holder.classList.remove('hidden'); holder.dataset.pzFlag = 'shown'; };
                img.onerror = () => holder.remove();
                img.src = src;
                holder.appendChild(img);
            };
            if (g.item.art.kind === 'image') { show(g.item.art.src); return; }
            if (!deps.commonsPhotoUrl) return;
            // Obrázek vlajky státu z tématu Vlajky (stejná data jako varianta Vlajka)
            const imageOf = g.item.flagImage ? Promise.resolve(g.item.flagImage)
                : loadCandidates('flag').then(list => { const flag = list.find(item => item.id === g.item.id); return flag ? flag.image : null; });
            imageOf.then(image => {
                if (!image || !holder.isConnected) return null;
                const url = deps.commonsPhotoUrl(image.file, image.hash, 120);
                return (deps.photoBlob && deps.photoBlob.attach ? deps.photoBlob.attach(url, holder) : Promise.resolve({ src: url })).then(result => show(result && result.src));
            }).catch(() => null);
        };

        const render = () => {
            if (!live()) return;
            if (phase === 'intro') renderIntro();
            else if (phase === 'loading') renderLoading();
            else if (phase === 'error') renderError();
            else if (phase === 'done' && game) renderDone();
            else if (game) { renderPlay(); return afterRender(true); }
            afterRender(false);
        };
        const afterRender = (playing) => {
            icons();
            deps.updateControlsUI();
            if (!playing) deps.appContent.scrollTo(0, 0);
        };

        // --- Akce ---
        const open = () => {
            fromHome = false;
            deps.setScreen('puzzle');
            state = parse(deps.readJson(STORAGE_KEY));
            phase = 'intro';
            if (deps.touchTip) deps.touchTip('puzzle');
            watchLayout();
            render();
            refreshCounts();
        };
        const start = async (avoid = '') => {
            fromHome = false;
            if (deps.sound && deps.sound.unlock) deps.sound.unlock();
            clearTimeout(doneTimer);
            const token = ++loadToken;
            const variant = state.variant;
            const size = state.size;
            phase = 'loading';
            selected = null; message = ''; guessing = false; outcome = null; snapSlot = -1;
            deps.setScreen('puzzle');
            render();
            try {
                const candidates = await loadCandidates(variant);
                knownCounts[variant] = candidates.map(item => item.id);
                if (token !== loadToken || !live()) return;
                const tried = new Set();
                let made = null;
                // Když se vlajka nenačte, zkusí se ještě dvě jiné
                for (let tries = 0; tries < 3 && !made; tries++) {
                    const candidate = pickNext(candidates.filter(item => !tried.has(item.id)), state, variant, Math.random, avoid);
                    if (!candidate) break;
                    tried.add(candidate.id);
                    const picture = await makeArt(variant, candidate, sideOf(size));
                    if (token !== loadToken) { if (picture && picture.art.own) revoke(picture.art.src); return; }
                    if (!picture) continue;
                    made = { candidate, art: picture.art, groups: picture.groups };
                }
                if (token !== loadToken || !live()) { if (made && made.art.own) revoke(made.art.src); return; }
                if (!made) throw new Error('Skládačka se nepřipravila');
                const item = { ...made.candidate, art: made.art };
                const created = createGame({ variant, size, item, groups: made.groups });
                created.options = guessOptions(made.candidate, candidates);
                setGame(created, 'free');
                phase = 'play';
                render();
            } catch (err) {
                if (token !== loadToken) return;
                error = err;
                phase = 'error';
                render();
            }
        };
        // --- Skládačka dne ---
        const dailyInfo = () => {
            const day = today();
            const entry = dailyDone(state, day);
            const variant = entry && entry.v ? entry.v : dailyVariant(day);
            const playing = Boolean(!entry && dailyGame && dailyGame.daily === day && !dailyGame.done);
            return {
                day, done: Boolean(entry), moves: entry ? entry.moves : 0, variant, playing, xp: entry ? 0 : DAILY_XP, title: 'Skládačka dne',
                label: entry ? `Hotovo · ${plural(entry.moves, 'tah', 'tahy', 'tahů')}` : `${VARIANTS[variant].title} · ${plural(DAILY_SIZE, 'dílek', 'dílky', 'dílků')}`
            };
        };
        const startDaily = async () => {
            if (deps.sound && deps.sound.unlock) deps.sound.unlock();
            clearTimeout(doneTimer);
            const token = ++loadToken;
            const day = today();
            state = parse(deps.readJson(STORAGE_KEY));
            const entry = dailyDone(state, day);
            selected = null; message = ''; guessing = false; outcome = null; snapSlot = -1;
            deps.setScreen('puzzle');
            if (deps.touchTip) deps.touchTip('puzzleDaily');
            // Rozehraná Skládačka dne pokračuje
            if (!entry && dailyGame && dailyGame.daily === day && !dailyGame.done) {
                game = dailyGame;
                phase = 'play';
                render();
                return;
            }
            phase = 'loading';
            render();
            try {
                const [flags, outlines] = await Promise.all([loadCandidates('flag').catch(() => []), loadCandidates('outline').catch(() => [])]);
                if (token !== loadToken || !live()) return;
                if (flags.length) knownCounts.flag = flags.map(item => item.id);
                if (outlines.length) knownCounts.outline = outlines.map(item => item.id);
                const plan = dailyPlan(day, flags, outlines);
                if (!plan) throw new Error('Skládačka dne nejde sestavit');
                const side = sideOf(DAILY_SIZE);
                let made = null;
                for (const [variant, id] of dailyAttempts(plan, entry)) {
                    const candidate = (variant === 'flag' ? flags : outlines).find(item => item.id === id);
                    if (!candidate) continue;
                    const picture = await makeArt(variant, candidate, side);
                    if (token !== loadToken || !live()) { if (picture && picture.art.own) revoke(picture.art.src); return; }
                    if (picture) { made = { variant, candidate, ...picture }; break; }
                }
                if (!made) throw new Error('Skládačka dne se nepřipravila');
                // U obrysu malá vlajka z tématu Vlajky
                const flagItem = flags.find(item => item.id === made.candidate.id);
                const item = { ...made.candidate, art: made.art, flagImage: flagItem ? flagItem.image : null };
                const created = createGame({ variant: made.variant, size: DAILY_SIZE, item, groups: made.groups, rng: seeded(plan.seed), daily: day });
                created.options = guessOptions(made.candidate, made.variant === 'flag' ? flags : outlines, seeded(`${plan.seed}|tip`));
                if (entry) {
                    // Už dohraná: jen výsledek (bez XP)
                    created.slots = created.slots.map((_, index) => index);
                    created.tray = created.tray.map(() => null);
                    created.moves = entry.moves;
                    created.done = true;
                    created.review = true;
                    setGame(created, '');
                    phase = 'done';
                } else {
                    setGame(created, 'daily');
                    if (plan.variant === 'flag' && made.variant === 'outline') message = 'Vlajka se teď nenačetla, dnes se skládá obrys státu.';
                    phase = 'play';
                }
                render();
            } catch (err) {
                if (token !== loadToken) return;
                error = err;
                phase = 'error';
                render();
            }
        };
        const openDaily = () => {
            deps.setScreen('puzzle');
            watchLayout();
            startDaily();
            refreshCounts();
        };

        const leave = () => {
            loadToken++;
            clearTimeout(doneTimer);
            if (game && game.done && phase === 'play') completeGame();
            selected = null; guessing = false;
            if (drag && drag.ghost) drag.ghost.remove();
            drag = null;
            fromHome = false;
            deps.renderHome();
        };
        const actions = {
            'puzzle-open': () => open(),
            'puzzle-start': () => start(),
            'puzzle-resume': () => { if (freeGame && !freeGame.done) { game = freeGame; phase = 'play'; message = ''; render(); } },
            'puzzle-next': () => start(game && !game.daily ? game.item.id : ''),
            'puzzle-daily': () => openDaily(),
            'puzzle-today': () => { fromHome = true; openDaily(); },
            'puzzle-intro': () => { if (fromHome) { leave(); return; } loadToken++; phase = 'intro'; render(); refreshCounts(); },
            'puzzle-variant': (button) => {
                state = choose(state, { variant: button.dataset.variant });
                save();
                if (button.dataset.start) start(); else render();
            },
            'puzzle-size': (button) => { state = choose(state, { size: Number(button.dataset.size) }); save(); render(); },
            'puzzle-guess': () => { if (game && canGuess(game)) { guessing = !guessing; selected = null; message = guessing ? 'Co skládáš? Vyber jednu možnost – tipnout jde jen jednou.' : ''; renderPlay(); icons(); } },
            'puzzle-guess-cancel': () => { guessing = false; message = ''; renderPlay(); icons(); },
            'puzzle-guess-pick': (button) => {
                if (!game || !canGuess(game)) return;
                const option = (game.options || []).find(entry => entry.id === button.dataset.id);
                if (!option) return;
                updateGame({ ...guess(game, option), options: game.options });
                guessing = false;
                message = option.correct ? `Správně, je to ${game.item.name}! Bonus +${GUESS_XP} XP po složení.` : 'Tohle to není. Skládej dál, uvidíš.';
                if (deps.sound && option.correct) deps.sound.play('correct');
                renderPlay();
                icons();
            }
        };
        // Popis místa v hlavičce aplikace
        const placeLabel = () => ({ icon: 'puzzle', text: game && phase !== 'intro' ? (game.daily ? 'Skládačka dne' : `Skládačka · ${VARIANTS[game.variant].title}`) : 'Skládačka' });
        const homeTile = () => ({ title: 'Skládačka', label: 'Skládačka: slož vlajku nebo obrys státu z dílků', art: (cls) => badge(cls, 'h-5 w-5', deps.uiArt) });
        // Šipka zpět: ze hry (načítání, chyby, výsledku) na úvod Skládačky (rozehraná skládačka zůstane), z úvodu domů
        const back = () => {
            if (phase === 'intro') { leave(); return; }
            loadToken++;
            clearTimeout(doneTimer);
            if (game && game.done && phase === 'play') { completeGame(); return; }
            if (fromHome) { leave(); return; }
            phase = 'intro';
            guessing = false;
            render();
            refreshCounts();
        };
        // Veřejné API Skládačky dne (např. pro záložku Dnes): daily() = { day, done, moves, variant, playing, xp, title, label };
        // openDaily() nebo akce data-action="puzzle-daily" otevře rovnou Skládačku dne (dohranou jako výsledek); puzzle-today totéž ze záložky
        // Dnes (Zpět pak vede na Dnes)
        const daily = () => { if (phase !== 'play') state = parse(deps.readJson(STORAGE_KEY)); return dailyInfo(); };
        return { actions, open, openDaily, daily, leave, back, place: placeLabel, homeTile, isPlaying: () => live() && phase === 'play', calm: () => phase !== 'play' && phase !== 'loading' };
    };

    return {
        STORAGE_KEY, ART, VARIANTS, VARIANT_IDS, SIZES, SIZE_XP, GUESS_XP, DAILY_XP_CAP, HINT_AFTER, RECENT, TRAY_SCALE, SAMPLE, SAME_MAX,
        DAILY_SIZE, DAILY_XP, DAILY_DAYS, DAILY_FLAG_TRIES, DAILY_KNOWN_MIN,
        MIN_KM2, MIN_FILL, rules, parse, forDay, xpLeftToday, choose, collection, pickNext, guessOptions, shuffleOrder, createGame, placedCount, fits, place,
        hintFor, canGuess, guess, finish, dailyVariant, dailyPool, dailyPlan, dailyDone, dailyAttempts, seeded, pieceGroups, decodeRings, outlineArt, layoutFor, factsFor, flagCandidates, outlineCandidates, sideOf,
        createController
    };
});
