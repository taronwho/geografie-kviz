// Tabulka dnešních států pro všechna témata: data/countries.json (český název, kontinent, číselný kód ISO pro slepou mapu)
// Spuštění: npm run build:countries
import { writeFileSync, mkdirSync } from 'node:fs';
import { sparql, id, CONTINENTS } from './lib/wikidata.mjs';

// Nizozemské a Dánské království (celky i se zámořím) by se pletly s Nizozemskem a Dánskem – místo nich
// samotné Nizozemsko a Dánsko, které ve Wikidatech jako suverénní stát vedené nejsou
const EXCLUDED_STATES = new Set(['Q29999', 'Q756617']);
const ADDED_STATES = { Q55: { name: 'Nizozemsko', continent: 'EU', iso: '528' }, Q35: { name: 'Dánsko', continent: 'EU', iso: '208' } };
// Státy na dvou kontinentech podle hlavního území (Kazachstán a Turecko leží převážně v Asii, Rusko se počítá k Evropě);
// místa v nich zařadí podle polohy getContinent v quiz-core.js
const CONTINENT_OVERRIDES = { Q232: 'AS', Q43: 'AS', Q159: 'EU' };

const rows = await sparql(`
SELECT ?c ?label ?iso (GROUP_CONCAT(DISTINCT ?cont; separator="|") AS ?continents) WHERE {
  ?c wdt:P31 wd:Q3624078 .
  FILTER NOT EXISTS { ?c wdt:P576 [] }
  ?c rdfs:label ?label FILTER(LANG(?label) = "cs")
  OPTIONAL { ?c wdt:P299 ?iso }
  OPTIONAL { ?c wdt:P30 ?cont }
} GROUP BY ?c ?label ?iso`);

const countries = {};
for (const row of rows) {
    const qid = id(row.c.value);
    if (EXCLUDED_STATES.has(qid)) continue;
    const continent = (row.continents ? row.continents.value : '').split('|').map(id).map(q => CONTINENTS[q]).find(Boolean);
    countries[qid] = { name: row.label.value, continent: CONTINENT_OVERRIDES[qid] || continent || '', iso: row.iso ? row.iso.value : '' };
}
Object.assign(countries, ADDED_STATES);

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/countries.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), countries }));
console.log(`countries.json: ${Object.keys(countries).length} států`);
