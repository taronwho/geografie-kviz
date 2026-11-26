// Postup bonusových funkcí v účtu (schéma 52, tabulka bonus_progress): přihlášený hráč nepřijde o Cestovní pas, odškrtané položky okruhů
// a Můj obor, Skládačku, Seřaď to, Jednohubku ani Statistiky pro nadšence, když vymění telefon nebo hraje na dvou zařízeních.
// Čistá logika bez DOMu a bez sítě: app.js (oddíl „Postup bonusových funkcí v účtu“) načte stav ze zařízení a z účtu, zavolá sync()
// a výsledek zapíše zpět do zařízení a (podmíněně podle čísla verze řádku) do účtu.
//
// Slučování (nic se neztratí, ani když dvě zařízení zapisují současně – server přijme zápis jen ke stejné verzi, jinak se sloučí znovu):
// - Množiny se sjednotí: poznané položky (mudrlant.learned; z nich je i odškrtávací seznam okruhu), razítka pasu, pečeti okruhů,
//   složené skládačky, odehraná Řazení dne. U data prvního získání vyhraje dřívější („dřív“ = '' je nejdřív).
// - Rekordy se berou jako maximum (nejlepší série Jednohubky, dnešní XP se stropem ve stejný den, nejčastější záměny).
// - Počítadla (odehrané hry, odpovědi a souhrny Statistik) se nesčítají naslepo: každé zařízení má v účtu svůj díl (dev[id].c) a zařízení
//   si pamatuje, kolik z cizích dílů už má v sobě započítáno (meta.base). Vlastní díl = místní − base; místní = vlastní + součet cizích.
//   Dvě zařízení hrající souběžně se tak sečtou přesně jednou. Nejvýš MAX_DEVICES zařízení má vlastní díl, starší se sloučí do gone.
// - Do účtu jdou jen agregáty: ze Statistik souhrny po dnech, tématech a okruzích, ne jednotlivé odpovědi; rozehraná hra, poslední volba
//   a „naposledy složené“ zůstávají jen v zařízení. Velikost je omezená (LIMIT bajtů JSON; server přijme nejvýš 512 KiB).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantBonusSync = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const VERSION = 1;
    const META_KEY = 'mudrlant.bonussync';
    // Do účtu nejvýš tolik bajtů JSON (server: 524 288 bajtů textu jsonb, ten má po čárkách a dvojtečkách mezery navíc)
    const LIMIT = 380000;
    const MAX_DEVICES = 4;
    // Id zařízení, jejichž díl už je v gone (vrátí-li se, začne pod novým id a starý díl si nepřičte podruhé)
    const MAX_GONE_IDS = 60;
    // Stejné stropy jako v modulech (passport.js, obor.js, puzzle.js, sorting.js, statistiky.js)
    const MAX_LEARNED = 20000;
    const MAX_FIELDS = 40;
    const MAX_PUZZLES = 2000;
    const SORTING_DAYS = 62;
    const MAX_PAIRS = 150;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const TOPIC = /^[a-z0-9-]{1,24}$/;
    const ITEM = /^[A-Za-z0-9:_.-]{1,40}$/;
    const QID = /^Q\d{1,12}$/;
    const KEY = /^[A-Za-z0-9_|:.-]{1,90}$/;
    const DEVICE = /^[a-z0-9]{6,24}$/;
    const CONTINENTS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'];
    const PASSPORT_TOPICS = ['zemepis', 'vlajky'];

    const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    // Vlastní hodnota klíče (ne zděděná z Object.prototype, např. u tématu „constructor“)
    const own = (object, key) => (has(object, key) ? object[key] : undefined);
    const safeKey = (key) => KEY.test(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
    const num = (value, max = 1e13) => (Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : 0);
    const isDay = (value) => typeof value === 'string' && DAY.test(value);
    const dayOrEmpty = (value) => value === '' || isDay(value);
    // Dřívější den; '' (den neznámý, zpětně doplněné) je nejdřív
    const earlier = (a, b) => (a === undefined ? b : b === undefined ? a : a === '' || b === '' ? '' : a < b ? a : b);
    const later = (a, b) => (a > b ? a : b);
    const bytes = (text) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : unescape(encodeURIComponent(text)).length);
    // JSON se seřazenými klíči (porovnání, jestli se účet změnil)
    const stable = (value) => {
        if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
        if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
        return JSON.stringify(value === undefined ? null : value);
    };
    const idList = (list, pattern, max) => (Array.isArray(list) ? [...new Set(list.filter(id => typeof id === 'string' && pattern.test(id)))].slice(-max) : []);
    // Sjednocení: pořadí z prvního seznamu, nové z druhého na konec
    const union = (a, b, max) => { const set = new Set(a); for (const id of b) set.add(id); return [...set].slice(-max); };
    const dayXp = (raw) => (isObject(raw) && isDay(raw.day) ? { day: raw.day, xp: num(raw.xp, 100000) } : { day: '', xp: 0 });
    // Dnešní XP se stropem: pozdější den vyhrává, ve stejný den větší XP (strop pak platí přes obě zařízení)
    const mergeDayXp = (a, b) => { const x = dayXp(a); const y = dayXp(b); return x.day > y.day ? x : y.day > x.day ? y : { day: x.day, xp: Math.max(x.xp, y.xp) }; };

    // --- Počítadla jako strom čísel (objekty a pole, listy čísla); sčítání, odečítání (nejméně 0) a maximum po listech ---
    const treeClean = (value, depth = 0) => {
        if (depth > 5) return undefined;
        if (Array.isArray(value)) return value.slice(0, 12).map(item => (Array.isArray(item) || isObject(item) ? treeClean(item, depth + 1) : num(item)));
        if (isObject(value)) {
            const out = {};
            for (const [key, item] of Object.entries(value)) {
                if (!safeKey(key)) continue;
                const clean = typeof item === 'number' ? num(item) : treeClean(item, depth + 1);
                if (clean !== undefined && !treeZero(clean)) out[key] = clean;
            }
            return out;
        }
        return num(value);
    };
    const treeZero = (value) => (Array.isArray(value) ? value.every(treeZero) : isObject(value) ? Object.keys(value).length === 0 : !value);
    const combine = (a, b, op) => {
        if (Array.isArray(a) || Array.isArray(b)) {
            const left = Array.isArray(a) ? a : [];
            const right = Array.isArray(b) ? b : [];
            return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => combine(left[i], right[i], op));
        }
        if (isObject(a) || isObject(b)) {
            const left = isObject(a) ? a : {};
            const right = isObject(b) ? b : {};
            const out = {};
            for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
                const value = combine(left[key], right[key], op);
                if (!treeZero(value)) out[key] = value;
            }
            return out;
        }
        return op(typeof a === 'number' ? a : 0, typeof b === 'number' ? b : 0);
    };
    const add = (a, b) => combine(a, b, (x, y) => x + y);
    const sub = (a, b) => combine(a, b, (x, y) => Math.max(0, x - y));
    const max = (a, b) => combine(a, b, (x, y) => Math.max(x, y));
    const STATS_COUNTERS = ['days', 't', 'm', 'k', 'h', 'w', 'ms'];
    const pick = (state, keys) => { const out = {}; for (const key of keys) if (state[key] !== undefined) out[key] = state[key]; return out; };
    // Počítadla ze stavů v zařízení (chybějící modul = prázdná část)
    const countersOf = (local) => treeClean({
        stats: local.stats ? pick(local.stats, STATS_COUNTERS) : {},
        skladacka: local.skladacka ? pick(local.skladacka, ['done', 'guessed']) : {},
        sorting: local.sorting ? pick(local.sorting, ['games', 'perfect', 'cards']) : {},
        snack: local.snack ? pick(local.snack, ['played', 'correct']) : {}
    });

    // --- Části dokumentu v účtu (vše čištěné: data z účtu se berou jako cizí vstup) ---
    const cleanLearned = (raw) => {
        const out = {};
        if (isObject(raw)) for (const [topic, ids] of Object.entries(raw)) { if (!TOPIC.test(topic)) continue; const list = idList(ids, ITEM, MAX_LEARNED); if (list.length) out[topic] = list; }
        return out;
    };
    const mergeLearned = (a, b) => {
        const out = { ...a };
        for (const [topic, ids] of Object.entries(b)) out[topic] = union(own(out, topic) || [], ids, MAX_LEARNED);
        return out;
    };
    const dayMap = (raw, keyOk) => {
        const out = {};
        if (isObject(raw)) for (const [key, day] of Object.entries(raw)) if (keyOk(key) && dayOrEmpty(day)) out[key] = day;
        return out;
    };
    const mergeDayMap = (a, b) => { const out = { ...a }; for (const [key, day] of Object.entries(b)) out[key] = earlier(out[key], day); return out; };
    const cleanPassport = (raw) => {
        const v = isObject(raw) ? raw : {};
        const stamps = dayMap(v.stamps, key => QID.test(key));
        const done = dayMap(v.done, key => CONTINENTS.includes(key));
        return { stamps, done, seen: idList(v.seen, QID, 400).filter(id => has(stamps, id)), doneSeen: idList(v.doneSeen, /^[A-Z]{2}$/, 6).filter(id => has(done, id)) };
    };
    const mergePassport = (a, b) => ({
        stamps: mergeDayMap(a.stamps, b.stamps), done: mergeDayMap(a.done, b.done),
        seen: union(a.seen, b.seen, 400), doneSeen: union(a.doneSeen, b.doneSeen, 6)
    });
    const oborKey = (key) => typeof key === 'string' && key.length <= 90 && /^[a-z0-9-]{1,24}\|[^|]{1,60}$/.test(key);
    const cleanObor = (raw) => {
        const v = isObject(raw) ? raw : {};
        const fields = {};
        if (isObject(v.fields)) {
            for (const [key, field] of Object.entries(v.fields)) {
                if (!oborKey(key) || !isObject(field)) continue;
                fields[key] = { cursor: typeof field.cursor === 'string' && ITEM.test(field.cursor) ? field.cursor : null, at: num(field.at),
                    label: typeof field.label === 'string' ? field.label.slice(0, 80) : '' };
            }
        }
        return { current: typeof v.current === 'string' && has(fields, v.current) ? v.current : null, fields: trimFields(fields), seals: dayMap(v.seals, oborKey) };
    };
    const trimFields = (fields) => Object.fromEntries(Object.entries(fields).sort((x, y) => y[1].at - x[1].at).slice(0, MAX_FIELDS));
    const mergeObor = (a, b) => {
        const fields = { ...a.fields };
        // Rozehraný obor: novější pozice vyhrává
        for (const [key, field] of Object.entries(b.fields)) if (!fields[key] || field.at > fields[key].at) fields[key] = field;
        const kept = trimFields(fields);
        const current = a.current && kept[a.current] ? a.current : b.current && kept[b.current] ? b.current : null;
        return { current, fields: kept, seals: mergeDayMap(a.seals, b.seals) };
    };
    const cleanPuzzle = (raw) => {
        const v = isObject(raw) ? raw : {};
        const got = {};
        if (isObject(v.got)) for (const [variant, ids] of Object.entries(v.got)) { if (!/^[a-z]{1,12}$/.test(variant)) continue; const list = idList(ids, QID, MAX_PUZZLES); if (list.length) got[variant] = list; }
        return { got, ...dayXp(v) };
    };
    const mergePuzzle = (a, b) => {
        const got = { ...a.got };
        for (const [variant, ids] of Object.entries(b.got)) got[variant] = union(own(got, variant) || [], ids, MAX_PUZZLES);
        return { got, ...mergeDayXp(a, b) };
    };
    const cleanSorting = (raw) => {
        const v = isObject(raw) ? raw : {};
        const daily = {};
        if (isObject(v.daily)) {
            for (const [day, entry] of Object.entries(v.daily)) {
                if (isDay(day) && isObject(entry) && num(entry.attempts, 1000)) daily[day] = { attempts: num(entry.attempts, 1000), spec: typeof entry.spec === 'string' && /^[a-z0-9:_-]{0,40}$/.test(entry.spec) ? entry.spec : '' };
            }
        }
        return { daily: trimDays(daily), ...dayXp(v) };
    };
    const trimDays = (daily) => Object.fromEntries(Object.entries(daily).sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, SORTING_DAYS));
    const mergeSorting = (a, b) => {
        const daily = { ...a.daily };
        // Řazení dne je dohrané, když je dohrané kdekoli (XP za něj se pak nevyplatí podruhé); lepší výsledek = méně pokusů
        for (const [day, entry] of Object.entries(b.daily)) if (!daily[day] || entry.attempts < daily[day].attempts) daily[day] = entry;
        return { daily: trimDays(daily), ...mergeDayXp(a, b) };
    };
    const cleanSnack = (raw) => { const v = isObject(raw) ? raw : {}; return { best: num(v.best, 1000000), ...dayXp(v) }; };
    const mergeSnack = (a, b) => ({ best: Math.max(a.best, b.best), ...mergeDayXp(a, b) });
    const cleanLabel = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '');
    const cleanStats = (raw) => {
        const v = isObject(raw) ? raw : {};
        const x = {};
        if (isObject(v.x)) {
            for (const [key, value] of Object.entries(v.x)) {
                if (!Array.isArray(value) || !/^[a-z0-9-]{1,24}\|[^|]{1,40}\|[^|]{1,40}$/.test(key)) continue;
                const right = cleanLabel(value[1]);
                const wrong = cleanLabel(value[2]);
                if (num(value[0]) && right && wrong) x[key] = [num(value[0], 1e7), right, wrong, isDay(value[3]) ? value[3] : ''];
            }
        }
        return { since: isDay(v.since) ? v.since : '', x: trimPairs(x) };
    };
    const trimPairs = (x) => Object.fromEntries(Object.entries(x).sort((p, q) => q[1][0] - p[1][0] || (p[1][3] < q[1][3] ? 1 : p[1][3] > q[1][3] ? -1 : 0)).slice(0, MAX_PAIRS));
    // Záměny: kolikrát = maximum (počet ze dvou zařízení se nedá rozdělit, nejčastější se ale neztratí), popisky z pozdějšího výskytu
    const mergeStats = (a, b) => {
        const x = { ...a.x };
        for (const [key, value] of Object.entries(b.x)) {
            const mine = x[key];
            if (!mine) { x[key] = value; continue; }
            const newer = value[3] > mine[3] ? value : mine;
            x[key] = [Math.max(mine[0], value[0]), newer[1], newer[2], later(mine[3], value[3])];
        }
        const since = a.since && b.since ? (a.since < b.since ? a.since : b.since) : a.since || b.since;
        return { since, x: trimPairs(x) };
    };
    const PARTS = {
        learned: { clean: cleanLearned, merge: mergeLearned },
        passport: { clean: cleanPassport, merge: mergePassport },
        obor: { clean: cleanObor, merge: mergeObor },
        skladacka: { clean: cleanPuzzle, merge: mergePuzzle },
        sorting: { clean: cleanSorting, merge: mergeSorting },
        snack: { clean: cleanSnack, merge: mergeSnack },
        stats: { clean: cleanStats, merge: mergeStats }
    };
    const PART_IDS = Object.keys(PARTS);

    const cleanDevices = (raw) => {
        const list = [];
        if (isObject(raw)) for (const [id, entry] of Object.entries(raw)) if (DEVICE.test(id) && isObject(entry)) list.push([id, { at: num(entry.at), c: treeClean(entry.c) }]);
        return list;
    };
    // Dokument z účtu, vyčištěný; víc zařízení, než se drží, se nezahodí, ale přičte do gone (součet zůstane stejný)
    const cleanDoc = (raw) => {
        const v = isObject(raw) ? raw : {};
        const doc = { v: VERSION };
        for (const id of PART_IDS) doc[id] = PARTS[id].clean(v[id]);
        let gone = treeClean(v.gone);
        let goneIds = idList(v.goneIds, DEVICE, MAX_GONE_IDS);
        const devices = cleanDevices(v.dev).sort((a, b) => b[1].at - a[1].at);
        for (const [id, entry] of devices.slice(MAX_DEVICES * 2)) { gone = add(gone, entry.c); goneIds = union(goneIds, [id], MAX_GONE_IDS); }
        doc.dev = Object.fromEntries(devices.slice(0, MAX_DEVICES * 2));
        doc.gone = gone;
        doc.goneIds = goneIds;
        return doc;
    };
    const emptyDoc = () => cleanDoc(null);

    // --- Ze stavů modulů do částí dokumentu a zpět ---
    const partsOf = (local) => ({
        learned: local.learned ? cleanLearned(local.learned) : null,
        passport: local.passport ? cleanPassport(local.passport) : null,
        obor: local.obor ? cleanObor(local.obor) : null,
        skladacka: local.skladacka ? cleanPuzzle(local.skladacka) : null,
        sorting: local.sorting ? cleanSorting(local.sorting) : null,
        snack: local.snack ? cleanSnack(local.snack) : null,
        stats: local.stats ? cleanStats(local.stats) : null
    });
    // Sloučenou část a počítadla zapíše do stavu modulu (ostatní pole stavu zůstanou, jak jsou v zařízení)
    const applyParts = (local, merged, counters) => {
        const out = {};
        if (local.learned) out.learned = mergeLearned(local.learned, merged.learned);
        if (local.passport) {
            const before = local.passport;
            const stamps = { ...before.stamps };
            for (const [id, day] of Object.entries(merged.passport.stamps)) stamps[id] = has(stamps, id) ? earlier(stamps[id], day) : day;
            const done = { ...before.done };
            for (const [id, day] of Object.entries(merged.passport.done)) done[id] = has(done, id) ? earlier(done[id], day) : day;
            // Razítka z jiného zařízení se v pasu „nebouchnou“ jako nová: berou se jako viděná
            const arrived = Object.keys(stamps).filter(id => !has(before.stamps, id));
            const arrivedDone = Object.keys(done).filter(id => !has(before.done || {}, id));
            const filled = { ...(before.filled || {}) };
            // Z účtu přibyly poznané státy či vlajky: pas je zpětně doplní (razítko „dřív“), až se téma načte
            for (const topic of PASSPORT_TOPICS) {
                const mine = new Set((local.learned && local.learned[topic]) || []);
                if ((merged.learned[topic] || []).some(id => !mine.has(id))) delete filled[topic];
            }
            out.passport = { ...before, stamps, done, filled,
                seen: union(union(before.seen || [], merged.passport.seen, 1e6), arrived, 1e6).filter(id => has(stamps, id)),
                doneSeen: union(union(before.doneSeen || [], merged.passport.doneSeen, 6), arrivedDone, 6).filter(id => has(done, id)) };
        }
        if (local.obor) {
            const fields = { ...(local.obor.fields || {}) };
            for (const [key, field] of Object.entries(merged.obor.fields)) if (!fields[key] || field.at > (fields[key].at || 0)) fields[key] = field;
            const kept = trimFields(fields);
            const seals = { ...(local.obor.seals || {}) };
            for (const [key, day] of Object.entries(merged.obor.seals)) seals[key] = has(seals, key) ? earlier(seals[key], day) : day;
            const current = local.obor.current && kept[local.obor.current] ? local.obor.current : merged.obor.current && kept[merged.obor.current] ? merged.obor.current : null;
            out.obor = { ...local.obor, current, fields: kept, seals };
        }
        if (local.skladacka) {
            const got = { ...(local.skladacka.got || {}) };
            for (const [variant, ids] of Object.entries(merged.skladacka.got)) got[variant] = union(Array.isArray(own(got, variant)) ? got[variant] : [], ids, MAX_PUZZLES);
            const c = counters.skladacka || {};
            out.skladacka = { ...local.skladacka, got, ...mergeDayXp(local.skladacka, merged.skladacka), done: c.done || 0, guessed: c.guessed || 0 };
        }
        if (local.sorting) {
            const daily = { ...(local.sorting.daily || {}) };
            for (const [day, entry] of Object.entries(merged.sorting.daily)) if (!daily[day] || entry.attempts < daily[day].attempts) daily[day] = entry;
            const c = counters.sorting || {};
            out.sorting = { ...local.sorting, daily, ...mergeDayXp(local.sorting, merged.sorting), games: c.games || 0, perfect: c.perfect || 0, cards: c.cards || 0 };
        }
        if (local.snack) {
            const snack = local.snack;
            const c = counters.snack || {};
            const best = Math.max(num(snack.best), merged.snack.best);
            // Nejlepší série z jiného zařízení: tady skončená, nový rekord je až nad ní (oslava jen jednou, viz snack.js past)
            const past = merged.snack.best > num(snack.best) ? Math.max(num(snack.past), merged.snack.best) : num(snack.past);
            const played = c.played || 0;
            out.snack = { ...snack, ...mergeDayXp(snack, merged.snack), played, correct: Math.min(c.correct || 0, played), best, past: Math.min(past, best) };
        }
        // Každé počítadlo Statistik se přepíše (chybějící = prázdné, parse v statistiky.js doplní nuly)
        if (local.stats) out.stats = { ...local.stats, ...Object.fromEntries(STATS_COUNTERS.map(key => [key, own(counters.stats || {}, key) || {}])), since: merged.stats.since, x: mergeStats(cleanStats(local.stats), merged.stats).x };
        return out;
    };

    // --- Sloučení zařízení s účtem ---
    // local = { learned, passport, obor, skladacka, sorting, snack, stats } (stavy z parse modulů, null = modul chybí; jeho část v účtu zůstane)
    // remote = dokument z účtu (nebo null), meta = mudrlant.bonussync ({ device, user, base }), user = id účtu
    // Vrací { local: nové stavy modulů, doc: dokument do účtu, upload: liší se od účtu, tooBig: nevejde se, meta: nové meta }
    const sync = ({ local = {}, remote = null, meta = null, user = '', now = Date.now(), newDevice } = {}) => {
        const doc = cleanDoc(remote);
        const metaIn = isObject(meta) ? meta : {};
        const sameUser = metaIn.user === user;
        let device = typeof metaIn.device === 'string' && DEVICE.test(metaIn.device) ? metaIn.device : '';
        // base patří k účtu: po přihlášení jiným účtem se všechno v zařízení bere jako vlastní (jako XP a odznaky v syncProgress)
        let base = sameUser ? treeClean(metaIn.base) : {};
        // Jiné zařízení přičetlo můj dlouho nehraný díl do gone: ten díl je teď „cizí“ a zařízení pokračuje pod novým id
        if (device && sameUser && doc.goneIds.includes(device) && !has(doc.dev, device)) { base = add(base, treeClean(metaIn.own)); device = ''; }
        if (!device) device = newDevice ? newDevice() : makeDevice();
        const mine = own(doc.dev, device);
        const ownCounters = max(sub(countersOf(local), base), mine ? mine.c : {});
        let gone = doc.gone;
        const others = Object.entries(doc.dev).filter(([id]) => id !== device).sort((a, b) => b[1].at - a[1].at);
        let goneIds = doc.goneIds;
        for (const [id, entry] of others.slice(MAX_DEVICES - 1)) { gone = add(gone, entry.c); goneIds = union(goneIds, [id], MAX_GONE_IDS); }
        const kept = others.slice(0, MAX_DEVICES - 1);
        const othersSum = kept.reduce((sum, [, entry]) => add(sum, entry.c), gone);
        const counters = add(ownCounters, othersSum);
        const parts = partsOf(local);
        const merged = {};
        for (const id of PART_IDS) merged[id] = parts[id] ? PARTS[id].merge(parts[id], doc[id]) : doc[id];
        const ownSame = mine && stable(mine.c) === stable(ownCounters);
        // Zařízení bez vlastních počítadel (a bez záznamu v účtu) se do dev nezapisuje
        const dev = Object.fromEntries(kept);
        if (mine || !treeZero(ownCounters)) dev[device] = { at: ownSame ? mine.at : now, c: ownCounters };
        const next = { v: VERSION, ...merged, dev, gone, goneIds };
        // Příliš velký dokument: nejdřív bez záměn Statistik, jinak se do účtu nezapíše (zařízení si sloučená data nechá)
        let tooBig = bytes(JSON.stringify(next)) > LIMIT;
        if (tooBig) { next.stats = { ...next.stats, x: {} }; tooBig = bytes(JSON.stringify(next)) > LIMIT; }
        return {
            local: applyParts(local, merged, counters), doc: next, upload: !tooBig && stable(next) !== stable(doc), tooBig,
            meta: { v: VERSION, device, user, base: othersSum, own: ownCounters }
        };
    };
    const makeDevice = () => {
        let text = '';
        try {
            const random = new Uint8Array(9);
            (typeof crypto !== 'undefined' ? crypto : require('node:crypto').webcrypto).getRandomValues(random);
            text = Array.from(random, value => (value % 36).toString(36)).join('');
        } catch (e) { text = Math.random().toString(36).slice(2, 11); }
        return `d${Date.now().toString(36)}${text}`.slice(0, 24).toLowerCase();
    };

    return { VERSION, META_KEY, LIMIT, MAX_DEVICES, PART_IDS, stable, bytes, treeClean, add, sub, max, countersOf, cleanDoc, emptyDoc, partsOf, applyParts, sync, makeDevice };
});
