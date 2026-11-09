// Film: známost a úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“).
//
// Známost filmu, seriálu nebo filmaře: pořadí podle počtu jazykových verzí Wikipedie (sitelinks) a podle návštěvnosti článku
// na české Wikipedii (co Češi opravdu čtou), obojí uvnitř skupiny (kategorie, české položky zvlášť). České filmy a seriály mají
// jazykových verzí málo (televizní pohádky 5–9), u nich rozhoduje hlavně návštěvnost.
// Známé položky: ruční seznamy (Pelíšky, Arabela, Greta Garbo) a nejznámější čtvrtina skupiny; každý okruh pak dostane aspoň
// max(3, 25 %) známých (Základní hraje většina hráčů) – povýšit jde jen položku, která je opravdu dost známá.
import { cachedByKey, knownFloor } from './zemepis-levels.mjs';
import { sleep } from './wikidata.mjs';

const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';

// Návštěvnost článků české Wikipedie za posledních 60 dní (MediaWiki API, 50 článků v jednom dotazu): { titulek: počet }.
// Při přetížení (429) se čeká déle; co se nepodaří, se do mezipaměti neuloží a příští běh se zeptá znovu
const fetchPageviews = async (titles) => {
    const result = {};
    const failed = new Set();
    let failedInRow = 0;
    for (let i = 0; i < titles.length; i += 50) {
        const batch = titles.slice(i, i + 50);
        // API dlouho odmítá: zbytek se zkusí příští běh
        if (failedInRow >= 2) { batch.forEach(title => failed.add(title)); continue; }
        let extra = {};
        for (;;) {
            const params = new URLSearchParams({ action: 'query', prop: 'pageviews', pvipdays: '60', format: 'json', formatversion: '2', titles: batch.join('|'), ...extra });
            let body = null;
            for (let attempt = 1; attempt <= 6 && !body; attempt++) {
                try {
                    const response = await fetch(`https://cs.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    body = await response.json();
                } catch (error) {
                    if (attempt === 6) console.warn(`  návštěvnost: ${error.message}, dávka ${i / 50 + 1} vynechána`);
                    else await sleep(10000 * attempt);
                }
            }
            if (!body) { batch.forEach(title => failed.add(title)); failedInRow++; break; }
            failedInRow = 0;
            const renamed = new Map(((body.query || {}).normalized || []).map(entry => [entry.to, entry.from]));
            for (const page of (body.query || {}).pages || []) {
                if (!page.pageviews) continue;
                const title = renamed.get(page.title) || page.title;
                result[title] = (result[title] || 0) + Object.values(page.pageviews).reduce((sum, views) => sum + (views || 0), 0);
            }
            if (!body.continue || !body.continue.pvipcontinue) break;
            extra = { pvipcontinue: body.continue.pvipcontinue, continue: body.continue.continue };
        }
        if ((i / 50) % 20 === 19) process.stdout.write(`  návštěvnost ${i + 50}/${titles.length}\r`);
        await sleep(400);
    }
    // Článek bez záznamu = 0 (aby se na něj příští běh znovu neptal)
    for (const title of titles) if (!Object.hasOwn(result, title) && !failed.has(title)) result[title] = 0;
    if (failed.size) console.warn(`  návštěvnost chybí u ${failed.size} článků (zkusí se příště)`);
    return result;
};
// offline = jen z mezipaměti (ladění pravidel, když API Wikimedie odmítá)
export const filmPageviews = (titles, { offline = false } = {}) => cachedByKey('film-pageviews', titles, offline ? async () => ({}) : fetchPageviews);

// Pořadí známosti ve skupině (0 = nejznámější, 1 = nejméně známá): průměr pořadí podle jazykových verzí a návštěvnosti,
// u českých položek váží návštěvnost víc (pvWeight). list = [{ sl, pv }] → Map(položka → pořadí)
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

// Nejvýš tolik položek okruhu je jen pro experty (úroveň Mudrlant má k Základní přidat dost nového)
export const EXPERT_MAX_SHARE = 0.45;

// Úrovně. items mají pomocná data item._ = { sl, pv, pool, hand, never, minor }:
//   pool – skupina, ve které se známost porovnává (kategorie, české položky zvlášť)
//   hand – známá vždy (ruční seznam nejznámějších), never – nikdy známá (ruční seznam), minor – známá jen z ručního seznamu
//   (zahraniční filmař s jediným filmem v datech – hvězdy indické televize)
// options:
//   knownShare(pool), expertShare(pool) – podíl nejznámějších (známé) a nejméně známých (pro experty) položek skupiny
//   pvWeight(pool) – váha návštěvnosti české Wikipedie v pořadí známosti
//   ceiling – nejvyšší pořadí známosti (0–1), se kterým se položka smí stát známou kvůli spodní hranici okruhu
//   groups – [{ id, members }] okruhy a kategorie, ve kterých platí spodní hranice známých a horní hranice pro experty
export const assignLevels = (items, { knownShare, expertShare, pvWeight, ceiling, groups }) => {
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
        // Známé: ruční seznam a nejznámější podle pořadí, dokud jich není podíl skupiny
        const target = Math.round(list.length * knownShare(pool));
        let known = 0;
        for (const item of list) {
            item.k = item._.hand ? 1 : 0;
            if (item.k) known++;
        }
        for (const item of list) {
            if (known >= target) break;
            if (item.k || item._.never || item._.minor) continue;
            item.k = 1;
            known++;
        }
    }
    // Spodní hranice: v každém okruhu a kategorii aspoň max(3, 25 %) známých – doplní se nejznámější z ostatních, jen pokud na to mají
    const promoted = [];
    for (const group of [...groups].sort((a, b) => a.members.length - b.members.length)) {
        const need = knownFloor(group.members.length);
        let known = group.members.filter(item => item.k === 1).length;
        if (known >= need) continue;
        const rest = group.members.filter(item => !item.k && !item._.never && !item._.minor && item._.pct <= ceiling)
            .sort((a, b) => a._.pct - b._.pct);
        for (const item of rest) {
            if (known >= need) break;
            item.k = 1;
            known++;
            promoted.push([group.id, item.n]);
        }
    }
    // Pro experty: nejméně známé položky skupiny (z těch, které nejsou známé)
    for (const [pool, list] of pools) {
        const share = expertShare(pool);
        list.forEach((item, index) => {
            if (!item.k && index >= list.length * (1 - share)) item.x = 1;
            else delete item.x;
        });
    }
    // Horní hranice expertů v okruhu: nejznámější z expertů zůstanou v úrovni Mudrlant
    for (const group of groups) {
        const experts = group.members.filter(item => item.x).sort((a, b) => a._.pct - b._.pct);
        const excess = experts.length - Math.floor(group.members.length * EXPERT_MAX_SHARE);
        for (const item of experts.slice(0, Math.max(0, excess))) delete item.x;
    }
    return promoted;
};

// Přehled úrovní pro výpis: název, celkem, Základní, Expert
export const levelSummary = (label, list) => {
    const known = list.filter(item => item.k === 1).length;
    const expert = list.filter(item => item.k !== 1 && item.x).length;
    const pct = (n) => list.length ? Math.round(100 * n / list.length) : 0;
    return `${label}: ${list.length} (Základní ${known} = ${pct(known)} %, Expert ${expert} = ${pct(expert)} %)`;
};
