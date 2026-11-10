// Výtvarné umění a Architektura: úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“) –
// stejný postup jako u hudby a sportu.
//
// Sláva položky (item._.fame, fameOf) = geometrický průměr návštěvnosti článku české Wikipedie (czechPageviewsBatch) a počtu jazykových
// verzí článku; české položky ×1,3 (čeští hráči je znají líp, než ukazuje počet verzí). Ručně vybrané známé položky
// (item._.always: CZECH_KNOWN, známé památky zeměpisu) jsou známé vždy, item._.never (bez always) známé není nikdy.
// 1. Známé: nejslavnější podíl každé skupiny kategorie (stratumOf: české a ostatní) – jen nad minimální slávou kategorie.
// 2. Okruhy: nejslavnějších okruhKnown (26 %) každého okruhu; okruh od 8 položek má aspoň max(3, 25 %) známých,
//    do tohoto minima i méně slavné položky (aspoň relax × minimální sláva kategorie).
// 3. Expert: nejméně slavný podíl každé skupiny (české položky menší podíl); chráněné položky (item._.protect) nikdy.
// 4. Okruh nejvýš z okruhExpert (40 %) expertní: nejslavnější z expertních se vrátí do Mudrlanta.

export const CZECH_BONUS = 1.3;
export const FLOOR_MIN_SIZE = 8;
export const knownFloor = (size) => size < FLOOR_MIN_SIZE ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));

// Sláva z návštěvnosti (pv) a počtu jazykových verzí (sl); chybějící údaj se počítá jako 1
export const fameOf = ({ pv, sl, cz }) => Math.sqrt(Math.max(pv || 0, 1) * Math.max(sl || 0, 1)) * (cz ? CZECH_BONUS : 1);

// items: položky s item._ = { fame, always?, never?, protect? }; groups: [{ id, members }] (okruhy)
// categories: { [kategorie]: { known, czechKnown?, minKnown, expert, czechExpert? } } – kategorie mimo seznam si úrovně nechávají
// stratumOf(item) = klíč skupiny v kategorii. Vrací [[okruh, název]] položek povýšených kvůli minimu okruhu.
export const assignLevels = (items, { categories, groups, stratumOf = (item) => (item.cz ? 'cz' : 'svet'), okruhKnown = 0.26, okruhFloor = 0.25, relax = 0.6, okruhExpert = 0.4 }) => {
    const fame = (item) => item._.fame || 0;
    const byFameDesc = (list) => [...list].sort((a, b) => fame(b) - fame(a));
    const leveled = (item) => Object.hasOwn(categories, item.c);
    const canBeKnown = (item, minFame) => leveled(item) && item.k !== 1 && !item._.never && fame(item) >= minFame;
    const strata = (category) => {
        const byKey = new Map();
        for (const item of items.filter(other => other.c === category)) {
            const key = stratumOf(item);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(item);
        }
        return [...byKey.values()];
    };
    for (const item of items) {
        if (!leveled(item)) continue;
        delete item.x;
        item.k = item._.always ? 1 : 0;
    }
    for (const [category, level] of Object.entries(categories)) {
        for (const stratum of strata(category)) {
            const target = Math.round((stratum[0].cz ? level.czechKnown ?? level.known : level.known) * stratum.length);
            let known = stratum.filter(item => item.k === 1).length;
            for (const item of byFameDesc(stratum)) {
                if (known >= target) break;
                if (canBeKnown(item, level.minKnown)) { item.k = 1; known++; }
            }
        }
    }
    const promoted = [];
    for (const group of groups) {
        if (group.members.length < FLOOR_MIN_SIZE) continue;
        const list = byFameDesc(group.members);
        for (const [share, factor] of [[okruhKnown, 1], [okruhFloor, relax]]) {
            const target = Math.max(3, Math.ceil(share * list.length));
            let known = list.filter(item => item.k === 1).length;
            for (const item of list) {
                if (known >= target) break;
                if (canBeKnown(item, categories[item.c].minKnown * factor)) {
                    item.k = 1;
                    known++;
                    promoted.push([group.id, item.n]);
                }
            }
        }
    }
    for (const [category, level] of Object.entries(categories)) {
        for (const stratum of strata(category)) {
            const share = stratum[0].cz ? level.czechExpert ?? level.expert : level.expert;
            const rest = byFameDesc(stratum.filter(item => item.k !== 1 && !item._.protect)).reverse();
            for (const item of rest.slice(0, Math.round(share * stratum.length))) item.x = 1;
        }
    }
    for (const group of groups) {
        const experts = byFameDesc(group.members.filter(item => item.x));
        const over = experts.length - Math.floor(okruhExpert * group.members.length);
        for (const item of experts.slice(0, Math.max(0, over))) delete item.x;
    }
    for (const item of items) if (item.k === 1) delete item.x;
    return promoted;
};

// Přehled pro výpis: název: celkem (Základní n = %, Expert n = %)
export const levelSummary = (label, list) => {
    const known = list.filter(item => item.k === 1).length;
    const expert = list.filter(item => item.k !== 1 && item.x).length;
    const pct = (n) => list.length ? Math.round(100 * n / list.length) : 0;
    return `${label}: ${list.length} (Základní ${known} = ${pct(known)} %, Expert ${expert} = ${pct(expert)} %)`;
};

// Sláva po kategoriích pro výpis (kvantily 10/25/50/75/90 %)
export const fameQuantiles = (items, category) => {
    const fames = items.filter(item => item.c === category).map(item => item._.fame || 0).sort((a, b) => a - b);
    return fames.length ? [0.1, 0.25, 0.5, 0.75, 0.9].map(share => Math.round(fames[Math.floor(share * (fames.length - 1))])).join(' / ') : '-';
};

// Návštěvnost článků české Wikipedie za posledních 60 dní po 50 článcích (API MediaWiki, prop=pageviews) – REST API po jednom
// článku (czechPageviews v zemepis-levels.mjs) bývá při sdílené síti přetížené (HTTP 429). Přepočteno na rok (×365/60),
// přesměrovaný či normalizovaný název se počítá k titulku, na který se ptalo. → { titulek: počet }
const API = 'https://cs.wikipedia.org/w/api.php';
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const DAYS = 60;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const czechPageviewsBatch = async (titles, { size = 50 } = {}) => {
    const result = {};
    const list = [...new Set(titles)];
    for (let i = 0; i < list.length; i += size) {
        const batch = list.slice(i, i + size);
        const views = new Map();
        const aliases = new Map(batch.map(title => [title, title]));
        let next = {};
        for (let page = 0; page < 20 && next; page++) {
            const params = new URLSearchParams({ action: 'query', prop: 'pageviews', pvipdays: String(DAYS), redirects: '1', format: 'json', formatversion: '2',
                titles: batch.join('|'), ...next });
            let body;
            for (let attempt = 1; attempt <= 6 && !body; attempt++) {
                try {
                    const response = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    body = await response.json();
                } catch (error) {
                    if (attempt === 6) throw new Error(`návštěvnost: ${error.message}`);
                    await wait(5000 * attempt);
                }
            }
            const query = body.query || {};
            for (const step of [...(query.normalized || []), ...(query.redirects || [])]) {
                for (const [title, target] of aliases) if (target === step.from) aliases.set(title, step.to);
            }
            for (const found of query.pages || []) {
                const sum = Object.values(found.pageviews || {}).reduce((total, value) => total + (value || 0), 0);
                views.set(found.title, (views.get(found.title) || 0) + sum);
            }
            next = body.continue ? Object.fromEntries(Object.entries(body.continue).filter(([key]) => key !== 'continue')) : null;
        }
        for (const [title, target] of aliases) result[title] = Math.round((views.get(target) || 0) * 365 / DAYS);
        process.stdout.write(`  návštěvnost ${Math.min(i + size, list.length)}/${list.length}\r`);
        await wait(300);
    }
    return result;
};
