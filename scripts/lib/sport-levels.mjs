// Téma Sport: úrovně obtížnosti (k = 1 „Základní“, bez příznaku „Mudrlant“, x = 1 „Mudrlant Expert“), stejně jako
// u zeměpisu a literatury.
//
// Sláva položky (item._.fame) je hlavně počet jazykových verzí článku; české položky ×3 (čeští hráči je znají líp,
// než ukazuje počet verzí). Ručně vybrané známé položky (k už od pravidel tématu) zůstávají známé.
// 1. Známé: nejslavnější podíl každé skupiny kategorie (stratumOf: české a ostatní, u sportovců i podle sportu – jinak by
//    známé byly skoro jen fotbalisté) – jen nad minimální slávou kategorie.
// 2. Okruhy: nejslavnějších okruhKnown (28 %) každého okruhu; okruh od 8 položek má aspoň max(3, 25 %) známých,
//    do tohoto minima i méně slavné položky (aspoň relax × minimální sláva).
// 3. Expert: nejméně slavný podíl každé skupiny (české položky menší podíl); chráněné položky (olympijské sporty) nikdy.
// 4. Okruh nejvýš z okruhExpert (40 %) expertní: nejslavnější z expertních se vrátí do Mudrlanta.

export const FLOOR_MIN_SIZE = 8;
export const knownFloor = (size) => size < FLOOR_MIN_SIZE ? 0 : Math.min(size, Math.max(3, Math.ceil(size * 0.25)));

// items: položky s k a item._ = { fame, never?, protect? }; groups: [{ id, members }] (okruhy)
// categories: { [kategorie]: { known, czechKnown?, minKnown, expert, czechExpert? } }; stratumOf(item) = klíč skupiny v kategorii
export const assignLevels = (items, { categories, groups, stratumOf = (item) => (item.cz ? 'cz' : 'svet'), okruhKnown = 0.28, okruhFloor = 0.25, relax = 0.6, okruhExpert = 0.4 }) => {
    const fame = (item) => item._.fame || 0;
    const byFameDesc = (list) => [...list].sort((a, b) => fame(b) - fame(a));
    const canBeKnown = (item, minFame) => item.k !== 1 && !item._.never && fame(item) >= minFame;
    const strata = (category) => {
        const byKey = new Map();
        for (const item of items.filter(other => other.c === category)) {
            const key = stratumOf(item);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(item);
        }
        return [...byKey.values()];
    };
    const promoted = [];

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
