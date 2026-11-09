// Biologie: úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“).
//
// Známost organismu, plemene nebo části těla: pořadí podle počtu jazykových verzí Wikipedie (sitelinks – u ptáků a savců je
// roboti nafoukli) a podle návštěvnosti článku na české Wikipedii (co Češi opravdu čtou); obojí se porovnává uvnitř kategorie.
// Základ známých položek určí build (nejznámější v kategorii, naše příroda, domácí zvířata); každý okruh pak dostane
// aspoň čtvrtinu známých (Základní hraje většina hráčů) – ale povýšit jde jen položku, která je opravdu dost známá.
import { cachedByKey, knownFloor } from './zemepis-levels.mjs';
import { sleep } from './wikidata.mjs';

const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';

// Návštěvnost článků české Wikipedie za posledních 60 dní (MediaWiki API, 50 článků v jednom dotazu): { titulek: počet }
const fetchPageviews = async (titles) => {
    const result = {};
    for (let i = 0; i < titles.length; i += 50) {
        const batch = titles.slice(i, i + 50);
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
                    if (attempt === 6) throw error;
                    await sleep(5000 * attempt);
                }
            }
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
    for (const title of titles) if (!Object.hasOwn(result, title)) result[title] = 0;
    return result;
};
export const czechPageviews = (titles) => cachedByKey('biologie-pageviews', titles, fetchPageviews);

// Podíl nejméně známých položek kategorie (podle pořadí známosti), které jsou jen pro experty
export const EXPERT_SHARE = 0.27;
// Nejvýš tolik položek okruhu je jen pro experty
export const EXPERT_MAX_SHARE = 0.5;

// Úrovně. items mají k (0/1) z pravidel buildu a pomocná data item._ = { sl, pv, pool, fixed } (pool = skupina, ve které se
// známost porovnává: kategorie, u plemen psi a kočky zvlášť; fixed = známá vždy, nikdy pro experty).
// options:
//   ceiling(item) – smí se položka stát známou kvůli spodní hranici okruhu? (velmi neznámé druhy ne)
//   knownShare(pool) – podíl nejznámějších položek skupiny, které jsou známé (u skupin, kde známé neurčil build)
//   expertShare(pool) – podíl nejméně známých položek skupiny, které jsou pro experty
//   groups – [{ id, members }] okruhy a kategorie, ve kterých platí spodní hranice známých položek
export const assignLevels = (items, { ceiling, expertShare = () => EXPERT_SHARE, knownShare = () => 0, groups }) => {
    const pools = new Map();
    for (const item of items) {
        if (!pools.has(item._.pool)) pools.set(item._.pool, []);
        pools.get(item._.pool).push(item);
    }
    // Pořadí známosti: průměr pořadí podle jazykových verzí a podle návštěvnosti (0 = nejznámější, 1 = nejméně známá)
    for (const [pool, list] of pools) {
        const rank = (key) => {
            const sorted = [...list].sort((a, b) => (b._[key] || 0) - (a._[key] || 0));
            return new Map(sorted.map((item, index) => [item, list.length > 1 ? index / (list.length - 1) : 0]));
        };
        const bySl = rank('sl');
        const byPv = rank('pv');
        for (const item of list) item._.pct = item._.pv === undefined ? bySl.get(item) : (bySl.get(item) + byPv.get(item)) / 2;
        // Skupina, u které build známé položky neurčil: nejznámější podle pořadí
        const share = knownShare(pool);
        if (share) [...list].sort((a, b) => a._.pct - b._.pct).forEach((item, index) => { if (index < Math.round(list.length * share)) item.k = 1; });
    }
    // Spodní hranice: v každém okruhu a kategorii aspoň max(3, 25 %) známých – doplní se nejznámější z ostatních, jen pokud na to mají
    const promoted = [];
    for (const group of [...groups].sort((a, b) => a.members.length - b.members.length)) {
        const need = knownFloor(group.members.length);
        let known = group.members.filter(item => item.k === 1).length;
        if (known >= need) continue;
        const rest = group.members.filter(item => !item.k && ceiling(item)).sort((a, b) => a._.pct - b._.pct);
        for (const item of rest) {
            if (known >= need) break;
            item.k = 1;
            known++;
            promoted.push([group.id, item.n]);
        }
    }
    // Pro experty: nejméně známé položky skupiny (z těch, které nejsou známé)
    for (const [pool, list] of pools) {
        const sorted = [...list].sort((a, b) => a._.pct - b._.pct);
        const share = expertShare(pool);
        sorted.forEach((item, index) => {
            if (!item.k && !item._.fixed && index >= sorted.length * (1 - share)) item.x = 1;
        });
    }
    for (const item of items) if (item.k) delete item.x;
    // Horní hranice expertů: v okruhu nejvýš polovina položek jen pro experty, aby úroveň Mudrlant přidala k Základní dost nového
    // (okruhy doplněné méně známými druhy – orchideje, vyhynulé druhy); nejznámější z expertů zůstanou v úrovni Mudrlant
    for (const group of groups) {
        const experts = group.members.filter(item => item.x).sort((a, b) => a._.pct - b._.pct);
        const excess = experts.length - Math.floor(group.members.length * EXPERT_MAX_SHARE);
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
