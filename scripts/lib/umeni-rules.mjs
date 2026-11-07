// Pravidla tématu Výtvarné umění sdílená sestavením (build-umeni.mjs) a testy
//
// Představitelé uměleckých směrů (fakt „Představitelé“ u směru)
//
// Wikidata u směru (P135 „hnutí“ osoby) vedou každého, kdo má mezi povoláními i malíře – i spisovatele Hermanna Hesseho
// u secese nebo krále Pchúmipchona u expresionismu. Proto:
//  - představitelem je jen výtvarník, fotograf či architekt, kterého téma Výtvarné umění nebo Architektura vede jako
//    vlastní položku (tam se dostane jen ten, pro koho je umění hlavním povoláním),
//  - pořadí: známost (počet jazykových verzí článku) dělená odmocninou počtu směrů osoby – kdo patří hlavně k tomuto
//    směru, má přednost (u impresionismu Monet a Renoir před Matissem, který má směrů pět).
import { readFileSync, existsSync } from 'node:fs';

// Dotaz na kandidáty (query.wikidata.org): osoby s povoláním ze seznamu, směrem ?item, českým článkem a aspoň 25 jazykovými verzemi;
// movs = kolik směrů osoba má celkem
export const repsQuery = (qids, occupations, human = 'Q5') => `SELECT ?item ?v ?sl ?name (MIN(?b) AS ?born) (COUNT(DISTINCT ?other) AS ?movs) WHERE {
  VALUES ?item { ${qids.map(q => `wd:${q}`).join(' ')} }
  VALUES ?occ { ${occupations.map(q => `wd:${q}`).join(' ')} }
  ?v wdt:P135 ?item ; wdt:P106 ?occ ; wdt:P31 wd:${human} .
  ?a schema:about ?v ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?name . ?v wikibase:sitelinks ?sl .
  ?v wdt:P135 ?other .
  OPTIONAL { ?v wdt:P569 ?b }
  FILTER(?sl >= 25)
} GROUP BY ?item ?v ?sl ?name`;

// Řádek dotazu → kandidát { q, n, sl, movs, born }
export const repOfRow = (row, id) => ({
    q: id(row.v.value),
    n: row.name.value.replace(/ \(.*\)$/, ''),
    sl: Number(row.sl.value),
    movs: row.movs ? Number(row.movs.value) : 1,
    born: row.born ? row.born.value : undefined
});

const score = (rep) => rep.sl / Math.sqrt(Math.max(1, rep.movs || 1));

// Představitelé směru: jen osoby z `allowed` (QID položek umělců a architektů), bez opakování, podle skóre
export const pickReps = (candidates, allowed) => candidates
    .filter((rep, index, all) => rep.n && allowed.has(rep.q) && all.findIndex(other => other.q === rep.q || other.n === rep.n) === index)
    .sort((a, b) => score(b) - score(a));

// Architekti z tématu Architektura (data/architektura.json) – Gropius u Bauhausu, Otto Wagner u vídeňské secese
export const architectIds = (file = new URL('../../data/architektura.json', import.meta.url)) => {
    if (!existsSync(file)) return new Set();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return new Set((data.items || []).filter(item => item.c === 'architekti').map(item => item.q));
};

// Název díla: český štítek Wikidat bývá i cizí (Portinari Altarpiece, Washington Crossing the Delaware, Beethovenfries, De geograaf).
// Pak platí název českého článku (Portinarův triptych) a cizí název zůstane jako další přijímaná odpověď (al).
// Cizí = má cizí člen či předložku (the, of, de, los, der…), kterou článek nemá, nebo nemá žádné české písmeno, které článek má.
const FOREIGN_WORDS = /(?:^|\s)(?:the|of|and|with|de|del|los|las|la|le|les|der|die|das|het|een)(?=\s|$)/iu;
const CZECH_LETTERS = /[ěščřžýáíéůúťďň]/iu;
export const czechWorkName = (label, title) => {
    if (!title || !label || title.toLocaleLowerCase('cs') === label.toLocaleLowerCase('cs')) return { n: label || title };
    const foreign = FOREIGN_WORDS.test(label) ? !FOREIGN_WORDS.test(title) : !CZECH_LETTERS.test(label) && CZECH_LETTERS.test(title);
    return foreign ? { n: title, al: [label] } : { n: label };
};
