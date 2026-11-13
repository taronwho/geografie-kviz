#!/usr/bin/env node
// Slavné vynálezy a objevy pro otázky Časové souvislosti (time-questions.js): data/vynalezy.json.
// Doplňuje vynálezy tématu Fyzika (scripts/lib/fyzika-inventions.mjs) o objevy (rentgenové záření, penicilin, Tutanchamonova hrobka…)
// a o vynálezy, které v tématu nejsou. Seznam je ruční: jen známé věci s jasným rokem (bez „kolem roku“ a bez sporů o prvenství),
// rok podle českých učebnic a encyklopedií. Položka se najde podle anglického názvu (nebo českého s příponou @cs) a musí mít článek
// na české Wikipedii; z Wikidat se vezme český název, článek, fotka a počet jazykových verzí a rok se porovná s Wikidaty
// (P575 doba objevu či vynálezu, P571 vznik, P585 okamžik, P580 začátek, přesnost aspoň na rok). Položka, u které Wikidata
// uvádějí jiný rok o víc než YEAR_SLACK let, se vynechá a vypíše (opravit seznam, nebo ji ověřit a označit checked).
// Spuštění: npm run build:vynalezy (pak npm run build:souvislosti)
import { writeFileSync } from 'node:fs';
import { sparql, id, imageFields, yearOf, compact, sleep } from './lib/wikidata.mjs';

const YEAR_SLACK = 2;
// [název (en, nebo cs s @cs), druh, rok, kdo, domovské téma, volby]
// druh: vynalez | objev; téma = kam věc patří (otázky ve hře tématu, nesprávné možnosti z jiných témat jen známé);
// volby: name = český název do hry místo štítku Wikidat, checked = rok ověřený ručně (Wikidata uvádějí jiný údaj, třeba rok patentu)
const ENTRIES = [
    // Vynálezy, které v tématu Fyzika nejsou
    ['microscope', 'vynalez', 1590, 'Zacharias Janssen', 'fyzika', { name: 'Mikroskop' }],
    ['telescope', 'vynalez', 1608, 'Hans Lippershey', 'fyzika', { name: 'Dalekohled' }],
    ["Pascal's calculator", 'vynalez', 1642, 'Blaise Pascal', 'fyzika', { name: 'Pascalina' }],
    ['guillotine', 'vynalez', 1792, 'Joseph-Ignace Guillotin', 'historie'],
    ['canning', 'vynalez', 1810, 'Nicolas Appert', 'chemie', { name: 'Konzerva' }],
    ['Braille', 'vynalez', 1824, 'Louis Braille', 'fyzika', { name: 'Braillovo písmo' }],
    ['Coca-Cola', 'vynalez', 1886, 'John Pemberton', 'chemie'],
    ['aspirin', 'vynalez', 1897, 'Felix Hoffmann', 'chemie', { name: 'Aspirin', checked: true }],
    ['Bakelite', 'vynalez', 1907, 'Leo Baekeland', 'chemie'],
    ['kardiostimulátor@cs', 'vynalez', 1958, 'Rune Elmqvist', 'fyzika'],
    ['laser', 'vynalez', 1960, 'Theodore Maiman', 'fyzika'],
    ['ARPANET@cs', 'vynalez', 1969, 'Agentura DARPA', 'fyzika', { name: 'ARPANET' }],
    ['microprocessor', 'vynalez', 1971, 'Federico Faggin', 'fyzika'],
    ['Walkman', 'vynalez', 1979, 'Sony', 'fyzika'],
    ['compact disc', 'vynalez', 1979, 'Philips a Sony', 'fyzika', { name: 'CD' }],
    // Objevy: fyzika a astronomie (Wikidata u myšlenek a jevů rok objevu často neuvádějí: checked = rok podle učebnic,
    // u objevu vydáním díla rok vydání – Koperník 1543, Newton 1687)
    ['heliocentrism', 'objev', 1543, 'Mikuláš Koperník', 'fyzika', { checked: true }],
    ["Kepler's laws of planetary motion", 'objev', 1609, 'Johannes Kepler', 'fyzika'],
    ["Newton's law of universal gravitation", 'objev', 1687, 'Isaac Newton', 'fyzika', { checked: true }],
    ['elektromagnetická indukce@cs', 'objev', 1831, 'Michael Faraday', 'fyzika', { checked: true }],
    ['X-ray', 'objev', 1895, 'Wilhelm Conrad Röntgen', 'fyzika', { name: 'Rentgenové záření', checked: true }],
    ['radioactivity', 'objev', 1896, 'Henri Becquerel', 'fyzika', { checked: true }],
    ['electron', 'objev', 1897, 'Joseph John Thomson', 'fyzika'],
    ['superconductivity', 'objev', 1911, 'Heike Kamerlingh Onnes', 'fyzika', { checked: true }],
    ['atomic nucleus', 'objev', 1911, 'Ernest Rutherford', 'fyzika', { checked: true }],
    ['neutron', 'objev', 1932, 'James Chadwick', 'fyzika'],
    ['positron', 'objev', 1932, 'Carl David Anderson', 'fyzika'],
    ['nuclear fission', 'objev', 1938, 'Otto Hahn', 'fyzika', { name: 'Jaderné štěpení', checked: true }],
    ['cosmic microwave background', 'objev', 1964, 'Arno Penzias a Robert Wilson', 'fyzika', { name: 'Reliktní záření' }],
    ['pulsar', 'objev', 1967, 'Jocelyn Bellová', 'fyzika', { name: 'Pulzar' }],
    ['Higgs boson', 'objev', 2012, 'CERN', 'fyzika'],
    ['ozone depletion', 'objev', 1985, 'Joseph Farman', 'chemie', { name: 'Ozonová díra', checked: true }],
    // Objevy: biologie a medicína
    ['cell', 'objev', 1665, 'Robert Hooke', 'biologie', { name: 'Buňka', checked: true }],
    ['Bacteria', 'objev', 1676, 'Antoni van Leeuwenhoek', 'biologie', { name: 'Bakterie' }],
    ['Mendelian inheritance', 'objev', 1865, 'Gregor Johann Mendel', 'biologie', { name: 'Mendelovy zákony dědičnosti', checked: true }],
    ['insulin', 'objev', 1921, 'Frederick Banting', 'biologie', { name: 'Inzulin', checked: true }],
    ['penicillin', 'objev', 1928, 'Alexander Fleming', 'biologie', { name: 'Penicilin' }],
    ['Latimeria', 'objev', 1938, 'Marjorie Courtenay-Latimerová', 'biologie', { name: 'Latimérie' }],
    // Objevy: archeologie
    ['Rosetta Stone', 'objev', 1799, 'Pierre-François Bouchard', 'historie', { name: 'Rosettská deska' }],
    ['Antikythera mechanism', 'objev', 1901, 'potápěči lovící houby', 'historie'],
    ['Venus of Willendorf', 'objev', 1908, 'Josef Szombathy', 'historie'],
    ['Venus of Dolní Věstonice', 'objev', 1925, 'Karel Absolon', 'historie'],
    ['Lascaux', 'objev', 1940, 'Marcel Ravidat', 'historie', { name: 'Jeskyně Lascaux' }],
    ['Terracotta Army', 'objev', 1974, 'Jang Č’-fa', 'historie'],
    ['Ötzi', 'objev', 1991, 'Erika a Helmut Simonovi', 'historie', { checked: true }]
];

const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const literal = (label) => /@cs$/.test(label) ? `${JSON.stringify(label.slice(0, -3))}@cs` : `${JSON.stringify(label)}@en`;

// 1. Položky podle názvu: s článkem na české Wikipedii, nejvíc jazykových verzí
const rows = await sparql(`SELECT ?l ?x ?sl WHERE {
  VALUES ?l { ${ENTRIES.map(([label]) => literal(label)).join(' ')} }
  ?x rdfs:label ?l . ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> . ?x wikibase:sitelinks ?sl . }`);
const best = new Map();
for (const row of rows) {
    const label = `${row.l.value}${row.l['xml:lang'] === 'cs' ? '@cs' : ''}`;
    const sl = Number(row.sl.value);
    if (!best.has(label) || best.get(label).sl < sl) best.set(label, { qid: id(row.x.value), sl });
}
await sleep(500);
// 2. Český název, článek, fotka a roky (jen s přesností aspoň na rok)
const qids = [...new Set([...best.values()].map(entry => entry.qid))];
const details = new Map(qids.map(qid => [qid, { years: {} }]));
const detailRows = await sparql(`SELECT ?x ?p ?v ?prec ?title ?label ?image WHERE {
  VALUES ?x { ${qids.map(qid => `wd:${qid}`).join(' ')} }
  { ?x rdfs:label ?label . FILTER(LANG(?label) = "cs") }
  UNION { ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?title . }
  UNION { ?x wdt:P18 ?image . }
  ${['P575', 'P571', 'P585', 'P580'].map(p => `UNION { ?x p:${p} ?s . ?s psv:${p} ?node . ?node wikibase:timeValue ?v ; wikibase:timePrecision ?prec . BIND("${p}" AS ?p) }`).join('\n  ')}
}`);
for (const row of detailRows) {
    const detail = details.get(id(row.x.value));
    if (!detail) continue;
    if (row.label && !detail.label) detail.label = row.label.value;
    if (row.title) detail.title = row.title.value;
    if (row.image && !detail.image) detail.image = row.image.value;
    if (row.p && Number(row.prec.value) >= 9) {
        const year = yearOf(row.v.value);
        if (year !== undefined) (detail.years[row.p.value] = detail.years[row.p.value] || []).push(year);
    }
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const items = [];
const problems = [];
for (const [label, kind, year, by, topic, options = {}] of ENTRIES) {
    const found = best.get(label);
    const detail = found && details.get(found.qid);
    if (!found || !detail || !detail.title) { problems.push(`${label}: nenalezeno (bez článku na české Wikipedii)`); continue; }
    // Rok z Wikidat: doba objevu či vynálezu, jinak vznik, okamžik, začátek (nejdřívější údaj)
    const property = ['P575', 'P571', 'P585', 'P580'].find(key => (detail.years[key] || []).length);
    const wikidataYear = property ? Math.min(...detail.years[property]) : undefined;
    const agrees = wikidataYear !== undefined && Math.abs(wikidataYear - year) <= YEAR_SLACK;
    if (wikidataYear !== undefined && !agrees && !options.checked) { problems.push(`${label} (${found.qid}): rok ${year}, Wikidata ${property} ${wikidataYear} – vynecháno`); continue; }
    if (wikidataYear === undefined && !options.checked) { problems.push(`${label} (${found.qid}): Wikidata rok neuvádějí – vynecháno (ověřit a označit checked)`); continue; }
    const name = options.name || capitalize(detail.label || detail.title.replace(/ \(.*\)$/, ''));
    items.push(compact({
        q: found.qid, t: detail.title, n: name, kind, year, by, tp: topic, sl: found.sl,
        wd: wikidataYear, wp: property, ok: options.checked && !agrees ? 'ucebnice' : undefined, ...imageFields(detail.image)
    }));
}
items.sort((a, b) => a.year - b.year);
writeFileSync(new URL('../data/vynalezy.json', import.meta.url), `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), items }, null, 0).replace(/\},\{/g, '},\n{')}\n`);
console.log(`data/vynalezy.json: ${items.length} položek (${items.filter(item => item.kind === 'objev').length} objevů)`);
for (const line of problems) console.log(`  ! ${line}`);
