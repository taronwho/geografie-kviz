// Téma Sport: mezipaměť po klíčích (BUILD_CACHE=složka) – uložené položky se znovu nestahují, dostahují se jen nové.
// Soubor drží { entries: [[klíč, hodnota], …], tried: [klíče] } (starší soubor jen pole [[klíč, hodnota], …]);
// tried = klíče, na které už se ptalo (i ty, ke kterým Wikidata nic nevrátila – událost mimo olympijské hry).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// fetchMissing(klíče) → [[klíč, hodnota], …]; vrací Map všech uložených a nově stažených.
// retryMissing: klíče, ke kterým se nic nevrátilo, se příště zkusí znovu (výpadek sítě), jinak se berou jako vyřízené
export const cachedEntries = async (name, keys, fetchMissing, { retryMissing = false } = {}) => {
    const dir = process.env.BUILD_CACHE;
    const file = dir && `${dir}/${name}.json`;
    const stored = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { entries: [] };
    const entries = Array.isArray(stored) ? stored : stored.entries;
    const tried = new Set(Array.isArray(stored) ? entries.map(([key]) => key) : stored.tried || entries.map(([key]) => key));
    const result = new Map(entries);
    const missing = [...new Set(keys)].filter(key => !tried.has(key));
    if (missing.length) {
        console.log(`  ${name}: dostahuji ${missing.length} z ${new Set(keys).size}`);
        const fetched = new Map(await fetchMissing(missing));
        for (const [key, value] of fetched) result.set(key, value);
        missing.filter(key => !retryMissing || fetched.has(key)).forEach(key => tried.add(key));
        if (file) {
            mkdirSync(dir, { recursive: true });
            writeFileSync(file, JSON.stringify({ entries: [...result], tried: [...tried] }));
        }
    } else console.log(`  (z mezipaměti ${file})`);
    return result;
};
