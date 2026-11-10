// Úrovně obtížnosti podle známosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“) pro témata
// Vlajky a znaky, Geologie a Mytologie – stejný postup jako u zeměpisu, biologie, hudby a filmu.
//
// Známost položky: pořadí podle počtu jazykových verzí Wikipedie (sitelinks) a podle návštěvnosti článku na české Wikipedii
// (co Češi opravdu čtou), obojí uvnitř skupiny (pool: kategorie, česká místa a postavy zvlášť).
// 1. Známé: co určí pravidla tématu (ruční seznamy, nejznámější státy) a doplnění na podíl skupiny (knownShare).
// 2. Spodní hranice: každý okruh a kategorie od 8 položek má aspoň max(3, 25 %) známých – povýšit jde jen položku, která je
//    ve své skupině dost známá (pořadí do ceiling), a ne položku, která známá být nesmí (never).
// 3. Expert: nejméně známé položky skupiny (expertShare), kromě chráněných (protect).
// 4. Horní hranice: okruh má nejvýš expertMax položek jen pro experty – nejznámější z nich zůstanou v úrovni Mudrlant.
import { cachedByKey, czechPageviews, knownFloor } from './zemepis-levels.mjs';

export { knownFloor };

// Návštěvnost článků české Wikipedie za rok 2025 (mezipaměť po článcích v BUILD_CACHE/<name>.json);
// offline = jen z mezipaměti (ladění pravidel, když API Wikimedie odmítá)
export const topicPageviews = (name, titles, { offline = false } = {}) =>
    cachedByKey(name, titles.filter(Boolean), offline ? async () => ({}) : (missing) => czechPageviews(missing, { parallel: 3 }));

// Pořadí známosti ve skupině (0 = nejznámější, 1 = nejméně známá): vážený průměr pořadí podle jazykových verzí a návštěvnosti.
// list = [{ sl, pv }] → Map(položka → pořadí)
export const fameRanks = (list, pvWeight = 0.5) => {
    const rank = (key) => {
        const sorted = [...list].sort((a, b) => (b[key] || 0) - (a[key] || 0));
        return new Map(sorted.map((entry, index) => [entry, list.length > 1 ? index / (list.length - 1) : 0]));
    };
    const bySl = rank('sl');
    const byPv = rank('pv');
    const hasPv = list.some(entry => entry.pv !== undefined);
    return new Map(list.map(entry => [entry, hasPv && entry.pv !== undefined ? (1 - pvWeight) * bySl.get(entry) + pvWeight * byPv.get(entry) : bySl.get(entry)]));
};

export const EXPERT_MAX_SHARE = 0.45;

// items: položky s k (0/1 z pravidel tématu) a pomocnými daty item._ = { sl, pv, pool, never, protect }
// options:
//   knownShare(pool) – podíl nejznámějších položek skupiny, které jsou známé (doplní k pravidlům tématu; 0 = nic)
//   expertShare(pool) – podíl nejméně známých položek skupiny jen pro experty
//   pvWeight(pool) – váha návštěvnosti české Wikipedie v pořadí (0–1)
//   ceiling(item) – nejvyšší pořadí známosti (0–1), se kterým smí položka kvůli spodní hranici okruhu postoupit mezi známé
//   groups – [{ id, members }] okruhy a kategorie (spodní hranice známých, horní hranice expertů)
//   expertMax – nejvyšší podíl expertů v okruhu
export const assignLevels = (items, { knownShare = () => 0, expertShare, pvWeight = () => 0.5, ceiling, groups, expertMax = EXPERT_MAX_SHARE }) => {
    const pools = new Map();
    for (const item of items) {
        if (!pools.has(item._.pool)) pools.set(item._.pool, []);
        pools.get(item._.pool).push(item);
    }
    for (const [pool, list] of pools) {
        const entries = list.map(item => ({ item, sl: item._.sl, pv: item._.pv }));
        const ranks = fameRanks(entries, pvWeight(pool));
        for (const entry of entries) entry.item._.pct = ranks.get(entry);
        list.sort((a, b) => a._.pct - b._.pct);
        for (const item of list) {
            item.k = item.k === 1 && !item._.never ? 1 : 0;
            delete item.x;
        }
        const target = Math.round(list.length * knownShare(pool));
        let known = list.filter(item => item.k === 1).length;
        for (const item of list) {
            if (known >= target) break;
            if (item.k || item._.never) continue;
            item.k = 1;
            known++;
        }
    }
    const promoted = [];
    for (const group of [...groups].sort((a, b) => a.members.length - b.members.length)) {
        const need = knownFloor(group.members.length);
        let known = group.members.filter(item => item.k === 1).length;
        if (known >= need) continue;
        const rest = group.members.filter(item => !item.k && !item._.never && item._.pct <= ceiling(item)).sort((a, b) => a._.pct - b._.pct);
        for (const item of rest) {
            if (known >= need) break;
            item.k = 1;
            known++;
            promoted.push([group.id, item.n]);
        }
    }
    for (const [pool, list] of pools) {
        const share = expertShare(pool);
        list.forEach((item, index) => {
            if (!item.k && !item._.protect && index >= list.length * (1 - share)) item.x = 1;
        });
    }
    for (const group of groups) {
        const experts = group.members.filter(item => item.x).sort((a, b) => a._.pct - b._.pct);
        const excess = experts.length - Math.floor(group.members.length * expertMax);
        for (const item of experts.slice(0, Math.max(0, excess))) delete item.x;
    }
    return promoted;
};

// Okruhy a kategorie jako skupiny pro assignLevels
export const levelGroups = (items, collections) => [
    ...collections.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) })),
    ...[...new Set(items.map(item => item.c))].map(category => ({ id: `c:${category}`, members: items.filter(item => item.c === category) }))
];

// Přehled úrovní pro výpis: název: celkem (Základní n = %, Expert n = %)
export const levelSummary = (label, list) => {
    const known = list.filter(item => item.k === 1).length;
    const expert = list.filter(item => item.k !== 1 && item.x).length;
    const pct = (n) => list.length ? Math.round(100 * n / list.length) : 0;
    return `${label}: ${list.length} (Základní ${known} = ${pct(known)} %, Expert ${expert} = ${pct(expert)} %)`;
};
