// Společné články položek: npm run build:clanky (po sestavení dat témat; asi 3 minuty, s BUILD_CACHE=složka jen jednou)
// Doplní do dat témat pole w = článek české Wikipedie po přesměrování, když se liší od titulku t (Boson W → Bosony W a Z) a vypíše
// skupiny položek se stejným článkem, popisem nebo společným článkem („X a Y“). Takové položky hra nedá mezi možnosti jedné
// otázky (quiz-core.js sameArticle). Ostatní údaje i pořadí položek zůstanou, výběr dnešních otázek ani Kvízu dne se nezmění.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { articleTargets, addArticleTargets } from './lib/clanky.mjs';

const require = createRequire(import.meta.url);
const core = require('../quiz-core.js');
const TOPICS = ['architektura', 'biologie', 'chemie', 'film', 'fyzika', 'geologie', 'historie', 'hudba', 'literatura', 'mytologie', 'sport', 'umeni', 'vlajky', 'zemepis'];
const files = Object.fromEntries(TOPICS.map(id => [id, new URL(`../data/${id}.json`, import.meta.url)]));
const data = Object.fromEntries(TOPICS.map(id => [id, JSON.parse(readFileSync(files[id], 'utf8'))]));
const titles = TOPICS.flatMap(id => data[id].items.map(item => item.t));
console.log(`Přesměrování ${new Set(titles).size} článků…`);
const targets = await articleTargets(titles);
for (const id of TOPICS) {
    const before = JSON.stringify(data[id]);
    const count = addArticleTargets(data[id].items, targets);
    const after = JSON.stringify(data[id]);
    if (after !== before) writeFileSync(files[id], after);
    // Skupiny v kategorii, které by se jako možnosti jedné otázky překrývaly
    const groups = [];
    const byCategory = new Map();
    for (const item of data[id].items) { if (!byCategory.has(item.c)) byCategory.set(item.c, []); byCategory.get(item.c).push(item); }
    for (const list of byCategory.values()) {
        const seen = new Set();
        for (const item of list) {
            if (seen.has(item.q)) continue;
            const group = list.filter(other => other === item || core.sameArticle(item, other));
            if (group.length > 1) { group.forEach(other => seen.add(other.q)); groups.push(group); }
        }
    }
    console.log(`data/${id}.json: přesměrované články ${count}, skupiny se společným článkem ${groups.length}`);
    for (const group of groups) console.log(`   ${group.map(item => `${item.n} [${item.w || item.t}]`).join(' · ')}`);
}
