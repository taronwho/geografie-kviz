// Zeměpis: známost míst a úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“).
//
// Známost: u míst ve světě počet jazykových verzí Wikipedie (sitelinks), u míst v Česku návštěvnost článku na české
// Wikipedii za rok – jazykové verze tam roboti nafoukli (každé město v Česku jich má přes 20), návštěvnost ne.
// U měst v Česku navíc počet obyvatel a správní význam (krajské, statutární, okresní město).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { sleep } from './wikidata.mjs';

// Mezipaměť po klíčích (BUILD_CACHE=složka): stáhne jen klíče, které v uloženém souboru ještě nejsou → { klíč: hodnota }
export const cachedByKey = async (name, keys, fetchMissing) => {
    const dir = process.env.BUILD_CACHE;
    const file = dir && `${dir}/${name}.json`;
    const stored = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const missing = [...new Set(keys)].filter(key => !Object.hasOwn(stored, key));
    if (missing.length) Object.assign(stored, await fetchMissing(missing));
    else console.log(`  (z mezipaměti ${file})`);
    if (file) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify(stored));
    }
    return stored;
};

const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/cs.wikipedia/all-access/user';

// Návštěvnost článků české Wikipedie za rok (lidé, ne roboti): { titulek: počet }. Pár dotazů souběžně, při 429 se čeká.
export const czechPageviews = async (titles, { from = '2025010100', to = '2025123100', parallel = 2 } = {}) => {
    const result = {};
    const queue = [...new Set(titles)];
    let done = 0;
    const fetchOne = async (title) => {
        const url = `${PAGEVIEWS}/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${from}/${to}`;
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
                // 404 = článek bez záznamu návštěvnosti (nový nebo přejmenovaný)
                if (response.status === 404) return 0;
                if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
                const body = await response.json();
                return (body.items || []).reduce((sum, row) => sum + (row.views || 0), 0);
            } catch (error) {
                // Neúspěch se do mezipaměti neuloží, příští běh se zeptá znovu
                if (attempt === 6) { console.warn(`  návštěvnost ${title}: ${error.message}`); return undefined; }
                await sleep(5000 * attempt);
            }
        }
        return undefined;
    };
    const worker = async () => {
        while (queue.length) {
            const title = queue.shift();
            const views = await fetchOne(title);
            if (views !== undefined) result[title] = views;
            if (++done % 50 === 0) process.stdout.write(`  návštěvnost ${done}/${titles.length}\r`);
            await sleep(60);
        }
    };
    await Promise.all(Array.from({ length: parallel }, worker));
    return result;
};

// Podíl, kolik míst skupiny se počítá mezi známá: aspoň max(3, 25 %) u skupin od 8 míst
export const KNOWN_FLOOR_SHARE = 0.25;
export const KNOWN_FLOOR_MIN = 3;
export const FLOOR_MIN_SIZE = 8;
export const knownFloor = (size) => size < FLOOR_MIN_SIZE ? 0 : Math.min(size, Math.max(KNOWN_FLOOR_MIN, Math.ceil(size * KNOWN_FLOOR_SHARE)));

const quantile = (sorted, share) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0;

// Úrovně: items mají k (0/1) z vlastních pravidel tématu a pomocná data v item._ = { sitelinks, czech, pv, … }.
// options:
//   czechPool(item) – skupina míst v Česku, ve které se známost porovnává (města, hrady a zámky, chráněné krajinné oblasti…)
//   czechKnown(item, index, list) – je místo v Česku známé? (list = česká místa skupiny seřazená podle známosti)
//   czechExpert(item, index, list) – je místo v Česku jen pro experty?
//   worldExpertShare – kolik nejméně známých míst ve světě (podle jazykových verzí v kategorii) je pro experty
//   isProtected(item) – místo nikdy není pro experty (státy, hlavní města, osmitisícovky…)
//   ceiling(item) – může se místo stát známým kvůli spodní hranici okruhu? (velmi neznámá místa ne)
//   groups – [{ id, label, members }] okruhy a kategorie, u kterých platí spodní hranice známých míst
export const assignLevels = (items, options) => {
    const { czechPool, czechKnown, czechExpert, worldExpertShare, isProtected, ceiling, groups } = options;
    const fameOf = (item) => item._.czech ? item._.pv || 0 : item._.sitelinks || 0;
    // Pořadí známosti ve skupině míst v Česku, ve světě v kategorii (0 = nejznámější, 1 = nejméně známé)
    const pools = new Map();
    for (const item of items) {
        const key = item._.czech ? `cz|${czechPool(item)}` : `svet|${item.c}`;
        if (!pools.has(key)) pools.set(key, []);
        pools.get(key).push(item);
    }
    for (const [key, list] of pools) {
        list.sort((a, b) => fameOf(b) - fameOf(a));
        list.forEach((item, index) => { item._.pct = list.length > 1 ? index / (list.length - 1) : 0; });
        if (key.startsWith('cz|')) {
            list.forEach((item, index) => {
                if (!item.k && czechKnown(item, index, list)) item.k = 1;
            });
            list.forEach((item, index) => {
                if (!item.k && czechExpert(item, index, list)) item.x = 1;
            });
        } else {
            const limit = quantile(list.map(fameOf).sort((a, b) => a - b), worldExpertShare(list[0].c));
            for (const item of list) if (!item.k && !isProtected(item) && fameOf(item) < limit) item.x = 1;
        }
    }
    // Spodní hranice: v každém okruhu a kategorii aspoň čtvrtina známých míst – doplní se nejznámější z ostatních
    // (česká místa mají přednost), ale jen ta, která na známá místa mají (ceiling); místa pro experty ne
    const promoted = [];
    for (const group of [...groups].sort((a, b) => a.members.length - b.members.length)) {
        const need = knownFloor(group.members.length);
        let known = group.members.filter(item => item.k === 1).length;
        if (known >= need) continue;
        const rest = group.members.filter(item => !item.k && !item.x && ceiling(item))
            .sort((a, b) => a._.pct * (a._.czech ? 0.7 : 1) - b._.pct * (b._.czech ? 0.7 : 1));
        for (const item of rest) {
            if (known >= need) break;
            item.k = 1;
            known++;
            promoted.push([group.id, item.n]);
        }
    }
    for (const item of items) if (item.k) delete item.x;
    return promoted;
};

// Přehled úrovní pro výpis: [název, celkem, známých, pro experty]
export const levelSummary = (label, list) => {
    const known = list.filter(item => item.k === 1).length;
    const expert = list.filter(item => item.k !== 1 && item.x).length;
    const pct = (n) => list.length ? Math.round(100 * n / list.length) : 0;
    return `${label}: ${list.length} (Základní ${known} = ${pct(known)} %, Expert ${expert} = ${pct(expert)} %)`;
};
