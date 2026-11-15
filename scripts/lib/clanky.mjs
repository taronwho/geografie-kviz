// Článek české Wikipedie položky po přesměrování (pole w): Boson W i Boson Z jsou přesměrování na společný článek „Bosony W a Z“,
// jehož úvod sedí na obě položky. Hra pak dvě položky téhož článku nedá mezi možnosti jedné otázky (quiz-core.js sameArticle).
// Dotaz na API Wikipedie po 50 titulcích (redirects=1, normalizace velkého písmene a podtržítek); výsledek { titulek: cíl }
// jen pro titulky, které vedou jinam. Mezipaměť BUILD_CACHE/<name>.json.
import { cachedByKey } from './zemepis-levels.mjs';
import { sleep } from './wikidata.mjs';

const API = 'https://cs.wikipedia.org/w/api.php';
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';

const fetchTargets = async (titles) => {
    const result = {};
    for (let i = 0; i < titles.length; i += 50) {
        const batch = titles.slice(i, i + 50);
        const body = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: batch.join('|') });
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                const response = await fetch(API, { method: 'POST', headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(60000) });
                if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
                const query = (await response.json()).query || {};
                const normalized = new Map((query.normalized || []).map(entry => [entry.from, entry.to]));
                const redirects = new Map((query.redirects || []).map(entry => [entry.from, entry.to]));
                for (const title of batch) {
                    const plain = normalized.get(title) || title;
                    // Přesměrování na oddíl článku (Boson Z → Bosony W a Z#…) je ten článek
                    const target = redirects.get(plain);
                    result[title] = target ? target.replace(/#.*$/, '') : plain;
                }
                break;
            } catch (error) {
                if (attempt === 6) throw error;
                await sleep(5000 * attempt);
            }
        }
        if ((i / 50) % 20 === 0) process.stdout.write(`  články ${Math.min(i + 50, titles.length)}/${titles.length}\r`);
        await sleep(100);
    }
    return result;
};

// Titulky → cílový článek (jen když se liší od titulku)
export const articleTargets = async (titles, name = 'clanky-presmerovani') => {
    const all = await cachedByKey(name, [...new Set(titles.filter(Boolean))].sort(), fetchTargets);
    return Object.fromEntries(Object.entries(all).filter(([title, target]) => target && target !== title));
};

// Doplní pole w (cílový článek po přesměrování) za pole t; vrátí počet položek s w
export const addArticleTargets = (items, targets) => {
    let count = 0;
    for (const item of items) {
        const target = item.t ? targets[item.t] : null;
        const entries = Object.entries(item).filter(([key]) => key !== 'w');
        if (target) { entries.splice(entries.findIndex(([key]) => key === 't') + 1, 0, ['w', target]); count++; }
        Object.keys(item).forEach(key => delete item[key]);
        Object.assign(item, Object.fromEntries(entries));
    }
    return count;
};
