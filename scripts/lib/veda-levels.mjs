// Chemie a Fyzika: úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“) – stejný postup jako Biologie.
//
// Známost položky = průměr jejího pořadí podle počtu jazykových verzí článku (sitelinks) a podle návštěvnosti článku na české Wikipedii
// za rok (co Češi opravdu čtou – školní pojmy jako destilace, Ohmův zákon nebo setrvačnost čtou žáci a studenti); pořadí se počítá
// uvnitř skupiny (pool): kategorie, u vesmíru druh tělesa, u astronomů zvlášť kosmonauti.
// Známé: vybrané položky vždy (fixed: prvky do stroncia, planety, souhvězdí zvěrokruhu, základní jednotky SI, české vynálezy), k nim
// nejznámější ~22–28 % skupiny; okruh od 8 položek má aspoň max(3, 25 %) známých – povýšit jde jen položku, která je dost známá (ceiling).
// Expert: nejméně známých ~27 % skupiny (nikdy vybrané položky); v okruhu nejvýš 45 % položek jen pro experty. Ostatní = Mudrlant.
import { cachedByKey, czechPageviews, knownFloor } from './zemepis-levels.mjs';

export { knownFloor };
export const EXPERT_SHARE = 0.27;
export const EXPERT_MAX_SHARE = 0.45;
export const RELAXED_PCT = 0.8;

// Návštěvnost článků české Wikipedie za rok 2025 (mezipaměť po titulcích v BUILD_CACHE/<name>.json)
export const pageviewsByTitle = (name, titles) => cachedByKey(name, titles, (missing) => czechPageviews(missing, { parallel: 3 }));

// items mají pomocná data item._ = { sl, pv, pool, fixed, never }:
//   fixed – známá vždy (a nikdy pro experty), never – známá nikdy (obskurní položka s nafouknutým počtem jazykových verzí)
// options:
//   knownShare(pool) – podíl nejznámějších položek skupiny, které jsou známé (vybrané se do něj počítají)
//   expertShare(pool) – podíl nejméně známých položek skupiny, které jsou jen pro experty
//   ceiling(item) – smí se položka stát známou kvůli spodní hranici okruhu?
//   groups – [{ id, members }] okruhy a kategorie, ve kterých platí spodní hranice známých a horní hranice expertů
// Vrací [[okruh, název]] položek, které se známými staly jen kvůli spodní hranici okruhu.
export const assignLevels = (items, { knownShare, expertShare = () => EXPERT_SHARE, ceiling, groups, expertMax = EXPERT_MAX_SHARE }) => {
    const pools = new Map();
    for (const item of items) {
        delete item.x;
        item.k = item._.fixed ? 1 : 0;
        if (!pools.has(item._.pool)) pools.set(item._.pool, []);
        pools.get(item._.pool).push(item);
    }
    // Pořadí známosti ve skupině (0 = nejznámější, 1 = nejméně známá); bez návštěvnosti jen podle jazykových verzí
    const sortedPools = new Map();
    for (const [pool, list] of pools) {
        const rank = (key) => {
            const sorted = [...list].sort((a, b) => (b._[key] || 0) - (a._[key] || 0));
            return new Map(sorted.map((item, index) => [item, list.length > 1 ? index / (list.length - 1) : 0]));
        };
        const bySl = rank('sl');
        const byPv = rank('pv');
        for (const item of list) item._.pct = item._.pv === undefined ? bySl.get(item) : (bySl.get(item) + byPv.get(item)) / 2;
        const sorted = [...list].sort((a, b) => a._.pct - b._.pct);
        sortedPools.set(pool, sorted);
        const target = Math.round(list.length * knownShare(pool));
        let known = list.filter(item => item.k === 1).length;
        for (const item of sorted) {
            if (known >= target) break;
            if (item.k || item._.never) continue;
            item.k = 1;
            known++;
        }
    }
    // Spodní hranice: v každém okruhu a kategorii aspoň max(3, 25 %) známých – doplní se nejznámější z ostatních, jen pokud na to mají
    // Když na to v okruhu nestačí dost známé položky (lanthanoidy), doplní se i méně známé, ale z lepších RELAXED_PCT skupiny
    const promoted = [];
    for (const allowed of [ceiling, item => item._.pct <= RELAXED_PCT]) {
        for (const group of [...groups].sort((a, b) => a.members.length - b.members.length)) {
            const need = knownFloor(group.members.length);
            let known = group.members.filter(item => item.k === 1).length;
            if (known >= need) continue;
            const rest = group.members.filter(item => !item.k && !item._.never && allowed(item)).sort((a, b) => a._.pct - b._.pct);
            for (const item of rest) {
                if (known >= need) break;
                item.k = 1;
                known++;
                promoted.push([group.id, item.n]);
            }
        }
    }
    // Pro experty: nejméně známé položky skupiny, které nejsou známé
    for (const [pool, sorted] of sortedPools) {
        const count = Math.round(sorted.length * expertShare(pool));
        const rest = sorted.filter(item => !item.k && !item._.fixed).reverse();
        for (const item of rest.slice(0, count)) item.x = 1;
    }
    // Horní hranice expertů v okruhu: nejznámější z nich zůstanou v úrovni Mudrlant, aby Mudrlant přidal k Základní dost nového
    for (const group of groups) {
        const experts = group.members.filter(item => item.x).sort((a, b) => a._.pct - b._.pct);
        const excess = experts.length - Math.floor(group.members.length * expertMax);
        for (const item of experts.slice(0, Math.max(0, excess))) delete item.x;
    }
    return promoted;
};

// Přehled úrovní pro výpis
export const levelSummary = (label, list) => {
    const known = list.filter(item => item.k === 1).length;
    const expert = list.filter(item => item.k !== 1 && item.x).length;
    const pct = (n) => list.length ? Math.round(100 * n / list.length) : 0;
    return `${label}: ${list.length} (Základní ${known} = ${pct(known)} %, Expert ${expert} = ${pct(expert)} %)`;
};
