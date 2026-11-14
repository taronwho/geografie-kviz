#!/usr/bin/env node
// Vazby pro Řetězovku z Wikidat (data/retezovka.json), které data témat nemají: rodiště a místo úmrtí osobností (P19, P20),
// manželé, rodiče a děti (P26, P22, P25, P40), učitel a žák (P1066, P802), nástupce v úřadu či na trůně (P39 s kvalifikátory
// P1365, P1366), pohoří hory (P4552, i nadřazené pohoří), stát, kde druh žije jako endemit (P183), a koho zobrazuje obraz či socha
// (P180: postavy mytologie a osobnosti, Zrození Venuše → Venuše, Napoleonova korunovace → Napoleon).
// Jen mezi známými položkami témat (k = 1, stejný práh známosti jako zbytek aplikace): obě strany vazby musí být v datech, takže
// soubor neobsahuje nic, co hra neumí ukázat. Řetězovka (chain.js buildGraph) z těchto dvojic QID staví hrany grafu.
//   node scripts/build-retezovka.mjs        (BUILD_CACHE=složka: mezivýsledky dotazů do souborů)
import { readFileSync, writeFileSync } from 'node:fs';
import { inBatches, id, cached, values, readCountries } from './lib/wikidata.mjs';

const read = (topic) => JSON.parse(readFileSync(new URL(`../data/${topic}.json`, import.meta.url), 'utf8')).items;
const known = (topic, categories) => read(topic).filter(item => item && item.k === 1 && categories.includes(item.c) && /^Q\d+$/.test(item.q));

// Osobnosti všech témat (jako uzly Řetězovky)
const PEOPLE = {
    hudba: ['skladatele', 'hudebnici'], literatura: ['spisovatele'], umeni: ['umelci', 'fotografove', 'ilustratori'], architektura: ['architekti'],
    film: ['herci', 'reziseri'], sport: ['sportovci'], historie: ['statnik', 'osobnost', 'panovnik'], fyzika: ['fyzici', 'astronomove'], chemie: ['chemici']
};
const people = [...new Set(Object.entries(PEOPLE).flatMap(([topic, categories]) => known(topic, categories).map(item => item.q)))];
const personSet = new Set(people);
// Města (všechna ze Zeměpisu: rodiště nemusí být mezi nejznámějšími městy, hra si známost ohlídá sama)
const cities = new Set(read('zemepis').filter(item => item && item.c === 'mesto' && /^Q\d+$/.test(item.q)).map(item => item.q));
const mountains = read('zemepis').filter(item => item && item.c === 'hora' && /^Q\d+$/.test(item.q));
const peaks = mountains.filter(item => item.k === 1 && item.ty !== 'pohoří').map(item => item.q);
const ranges = new Set(mountains.filter(item => item.ty === 'pohoří').map(item => item.q));
const BIO = ['savci', 'ptaci', 'ryby', 'plazi', 'hmyz', 'bezobratli', 'rostliny', 'houby'];
const species = known('biologie', BIO).map(item => item.q);
const countries = new Set(Object.keys(readCountries()));
const artworks = known('umeni', ['obrazy', 'sochy']).map(item => item.q);
const myths = new Set(read('mytologie').filter(item => item && item.k === 1 && /^Q\d+$/.test(item.q)).map(item => item.q));

console.log(`Osobnosti ${people.length}, města ${cities.size}, hory ${peaks.length}, pohoří ${ranges.size}, druhy ${species.length}`);
const edges = { born: [], died: [], spouse: [], parent: [], teacher: [], successor: [], range: [], endemic: [], depicts: [] };
const seen = new Set();
const add = (rel, a, b) => {
    if (!a || !b || a === b) return;
    const key = `${rel}|${a}|${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges[rel].push([a, b]);
};

// 1. Osobnosti: místa a vztahy mezi nimi
const PERSON_PROPS = { P19: 'born', P20: 'died', P26: 'spouse', P22: 'father', P25: 'mother', P40: 'child', P1066: 'studentOf', P802: 'student' };
const personRows = await cached('retezovka-osobnosti', async () => {
    const rows = [];
    await inBatches(people, 120, (batch) => `SELECT ?p ?prop ?o WHERE { VALUES ?p { ${values(batch)} } VALUES ?prop { ${Object.keys(PERSON_PROPS).map(p => `wdt:${p}`).join(' ')} } ?p ?prop ?o . FILTER(isIRI(?o)) }`,
        (row) => rows.push([id(row.p.value), id(row.prop.value), id(row.o.value)]));
    return rows;
});
for (const [p, prop, o] of personRows) {
    const kind = PERSON_PROPS[prop];
    if (kind === 'born' && cities.has(o)) add('born', p, o);
    else if (kind === 'died' && cities.has(o)) add('died', p, o);
    else if (!personSet.has(o)) continue;
    else if (kind === 'spouse') add('spouse', p < o ? p : o, p < o ? o : p);
    else if (kind === 'father' || kind === 'mother') add('parent', o, p);
    else if (kind === 'child') add('parent', p, o);
    else if (kind === 'studentOf') add('teacher', o, p);
    else if (kind === 'student') add('teacher', p, o);
}

// 2. Nástupci v úřadu (panovníci, prezidenti): kvalifikátory výroku „zastávaná funkce“
const successionRows = await cached('retezovka-nastupci', async () => {
    const rows = [];
    await inBatches(people, 120, (batch) => `SELECT ?p ?succ ?pred WHERE { VALUES ?p { ${values(batch)} } ?p p:P39 ?st . OPTIONAL { ?st pq:P1366 ?succ } OPTIONAL { ?st pq:P1365 ?pred } }`,
        (row) => rows.push([id(row.p.value), row.succ ? id(row.succ.value) : '', row.pred ? id(row.pred.value) : '']));
    return rows;
});
for (const [p, succ, pred] of successionRows) {
    if (succ && personSet.has(succ)) add('successor', p, succ);
    if (pred && personSet.has(pred)) add('successor', pred, p);
}

// 3. Pohoří hor: nejbližší pohoří v datech (Mont Blanc → masiv Mont Blanc → … → Alpy); nadřazená pohoří se hledají po patrech
const rangeRows = await cached('retezovka-pohori', async () => {
    const parents = new Map();
    let frontier = [...peaks];
    for (let level = 0; level < 5 && frontier.length; level++) {
        const found = [];
        await inBatches(frontier, 150, (batch) => `SELECT ?x ?r WHERE { VALUES ?x { ${values(batch)} } ?x wdt:P4552 ?r . }`, (row) => found.push([id(row.x.value), id(row.r.value)]));
        found.forEach(([x, r]) => parents.set(x, [...(parents.get(x) || []), r]));
        frontier = [...new Set(found.map(([, r]) => r))].filter(r => !parents.has(r));
    }
    return [...parents].map(([x, list]) => [x, list]);
});
const parentsOf = new Map(rangeRows);
for (const peak of peaks) {
    let level = parentsOf.get(peak) || [];
    for (let depth = 0; depth < 5 && level.length; depth++) {
        const hit = level.find(r => ranges.has(r));
        if (hit) { add('range', peak, hit); break; }
        level = [...new Set(level.flatMap(r => parentsOf.get(r) || []))];
    }
}

// 4. Endemity: stát, kde druh žije a nikde jinde (jen státy z tabulky států)
const endemicRows = await cached('retezovka-endemity', async () => {
    const rows = [];
    await inBatches(species, 150, (batch) => `SELECT ?s ?c WHERE { VALUES ?s { ${values(batch)} } ?s wdt:P183 ?c . }`, (row) => rows.push([id(row.s.value), id(row.c.value)]));
    return rows;
});
const endemicBy = new Map();
for (const [s, c] of endemicRows) endemicBy.set(s, [...(endemicBy.get(s) || []), c]);
// Jen druhy s jediným údajem, který je státem (endemit ostrova nebo pohoří by byl sporný)
for (const [s, list] of endemicBy) if (list.length === 1 && countries.has(list[0])) add('endemic', s, list[0]);

// 5. Koho zobrazuje výtvarné dílo (jen postavy mytologie a osobnosti z dat; dílo s víc než třemi zobrazenými nejde jednoznačně ptát)
const depictRows = await cached('retezovka-zobrazuje', async () => {
    const rows = [];
    await inBatches(artworks, 150, (batch) => `SELECT ?a ?d WHERE { VALUES ?a { ${values(batch)} } ?a wdt:P180 ?d . }`, (row) => rows.push([id(row.a.value), id(row.d.value)]));
    return rows;
});
const depicted = new Map();
for (const [a, d] of depictRows) if (myths.has(d) || personSet.has(d)) depicted.set(a, [...(depicted.get(a) || []), d]);
for (const [a, list] of depicted) if (list.length <= 3) list.forEach(d => add('depicts', a, d));

for (const list of Object.values(edges)) list.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
const out = { generated: new Date().toISOString().slice(0, 10), source: 'Wikidata (CC0)', edges };
writeFileSync(new URL('../data/retezovka.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log(Object.entries(edges).map(([rel, list]) => `${rel} ${list.length}`).join(', '));
