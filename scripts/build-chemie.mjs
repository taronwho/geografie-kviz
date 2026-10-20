// Téma Chemie: data/chemie.json z Wikidat (přes QLever) – chemické prvky, sloučeniny a látky, chemici
// Spuštění: npm run build:chemie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { createRequire } from 'node:module';
import { qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

// Skupiny prvků a jejich místo v tabulce zná jádro aplikace – stejná pravidla pro data i nápovědu
const { elementFamily } = createRequire(import.meta.url)('../quiz-core.js');

const ELEMENT = 'Q11344';
const CHEMICAL_ENTITY = 'Q113145171';
// Skupina izomerů – tak jsou ve Wikidatech vedené třeba glukóza nebo fruktóza
const ISOMER_GROUP = 'Q15711994';
const CHEMIST = 'Q593644';
const NOBEL_CHEMISTRY = 'Q44585';
const FEMALE = 'Q6581072';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q1131475', 'Q153136', 'Q28513']);

// Prvky, které zná každý (k nim všechny do čísla 38)
const KNOWN_ELEMENTS = new Set([47, 50, 53, 54, 55, 56, 74, 78, 79, 80, 82, 86, 88, 92, 94]);
const LIMITS = { latky: { limit: 400, known: 110 }, chemici: { limit: 200, known: 60 } };

const firstValue = (list) => (list || [])[0];
const max = (list) => list && list.length ? Math.max(...list) : undefined;
const round = (value, digits) => value === undefined ? undefined : Number(Number(value).toPrecision(digits));
const kelvinToCelsius = (k) => k === undefined ? undefined : Math.round((k - 273.15) * 10) / 10;

// --- Prvky ---
const elements = await cached('chemie-elements', async () => {
    const rows = await qlever(`SELECT ?el ?z ?sym ?sl WHERE { ?el wdt:P31 wd:${ELEMENT} . ?el wdt:P1086 ?z . ?el wdt:P246 ?sym . ?el wikibase:sitelinks ?sl }`);
    const byZ = new Map();
    for (const row of rows) {
        const z = Number(row.z.value);
        if (!Number.isInteger(z) || z < 1 || z > 118) continue;
        if (!byZ.has(z) || byZ.get(z).sl < Number(row.sl.value)) byZ.set(z, { q: id(row.el.value), z, sym: row.sym.value, sl: Number(row.sl.value) });
    }
    return [...byZ.values()].sort((a, b) => a.z - b.z);
});
console.log(`Prvky: ${elements.length}`);

// --- Látky: chemické látky s českým článkem a vzorcem ---
const compoundCandidates = await cached('chemie-compounds', async () => {
    const rows = await qlever(`SELECT DISTINCT ?c ?sl WHERE { VALUES ?type { wd:${CHEMICAL_ENTITY} wd:${ISOMER_GROUP} } ?c wdt:P31 ?type . ?c wdt:P274 ?f .
  ?a schema:about ?c . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?c wikibase:sitelinks ?sl }`);
    return rows.map(row => [id(row.c.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]).slice(0, 900);
});
console.log(`Látky (kandidáti): ${compoundCandidates.length}`);

// --- Chemici: povoláním chemik, s českým článkem ---
const chemistCandidates = await cached('chemie-chemists', async () => {
    const rows = await qlever(`SELECT DISTINCT ?p ?sl WHERE { ?p wdt:P106 wd:${CHEMIST} .
  ?a schema:about ?p . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?p wikibase:sitelinks ?sl }`);
    return rows.map(row => [id(row.p.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]).slice(0, 400);
});
console.log(`Chemici (kandidáti): ${chemistCandidates.length}`);

// --- Podrobnosti ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, st: 1, born: 1, died: 1, sex: 1 };
const allIds = [...elements.map(element => element.q), ...compoundCandidates.map(([q]) => q), ...chemistCandidates.map(([q]) => q)];
const details = new Map(await cached('chemie-details', async () => {
    const result = new Map(allIds.map(qid => [qid, {}]));
    await inBatches(allIds, 150, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P117 ?v BIND("st" AS ?p) }
  UNION { ?item wdt:P274 ?v BIND("formula" AS ?p) }
  UNION { ?item wdt:P61 ?v BIND("disc" AS ?p) }
  UNION { ?item wdt:P575 ?v BIND("found" AS ?p) }
  UNION { ?item wdt:P138 ?v BIND("named" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P279 ?v BIND("sub" AS ?p) }
  UNION { ?item wdt:P2868 ?v BIND("role" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P166 ?v BIND("award" AS ?p) }
  UNION { ?item p:P2101/psn:P2101/wikibase:quantityAmount ?v BIND("melt" AS ?p) }
  UNION { ?item p:P2102/psn:P2102/wikibase:quantityAmount ?v BIND("boil" AS ?p) }
  UNION { ?item p:P2054/psn:P2054/wikibase:quantityAmount ?v BIND("dens" AS ?p) }
  UNION { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?v BIND("mass" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (['melt', 'boil', 'dens', 'mass'].includes(key)) entry[key] = [...(entry[key] || []), Number(v)];
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return [...result];
}));
// České názvy odkazovaných položek (objevitelé, pojmenováno po, druhy látek, země) a anglické názvy tříd látek pro okruhy
const referenced = [...new Set([...details.values()].flatMap(detail => [...(detail.disc || []), ...(detail.named || []), ...(detail.cit || []),
    ...(detail.type || []), ...(detail.sub || []), ...(detail.role || [])]))].filter(q => /^Q\d+$/.test(q));
const labels = new Map(await cached('chemie-labels', async () => {
    const result = [];
    await inBatches(referenced, 400, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]), qlever);
    return result;
}));
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';

// --- Položky ---
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const items = [];

const familyOf = (z) => elementFamily(z).key;

for (const element of elements) {
    const detail = details.get(element.q);
    if (!detail || !detail.n) continue;
    const discoverer = (detail.disc || []).map(cs).filter(Boolean);
    items.push(compact({
        q: element.q,
        t: detail.t || capitalize(detail.n),
        n: capitalize(detail.n),
        c: 'prvky',
        k: element.z <= 38 || KNOWN_ELEMENTS.has(element.z) ? 1 : 0,
        d: detail.d,
        ...imageFields(detail.im),
        f: compact({
            z: element.z,
            sym: element.sym,
            fam: familyOf(element.z),
            year: yearOf(firstValue(detail.found)),
            disc: discoverer.slice(0, 2).join(', ') || undefined,
            named: (detail.named || []).map(cs).filter(Boolean)[0],
            melt: kelvinToCelsius(max(detail.melt)),
            boil: kelvinToCelsius(max(detail.boil)),
            // Hustota v g/cm³ (Wikidata ji normalizují na kg/m³)
            dens: detail.dens ? round(max(detail.dens) / 1000, 4) : undefined
        })
    }));
}

// Vzorec: přednost má obvyklý zápis (NaOH, Na₂CO₃) před Hillovým (HNaO, CNa₂O₃)
const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const symbolsOf = (formula) => (formula.match(/[A-Z][a-z]?/g) || []);
const isHill = (formula) => {
    const symbols = symbolsOf(formula);
    const rest = symbols.includes('C') ? symbols.slice(symbols[1] === 'H' ? 2 : 1) : symbols;
    return (!symbols.includes('C') || symbols[0] === 'C') && rest.every((symbol, i) => i === 0 || rest[i - 1] <= symbol);
};
const pickFormula = (list) => {
    const clean = (list || []).filter(formula => !/[⁺⁻]/.test(formula));
    if (!clean.length) return undefined;
    return clean.find(formula => !isHill(formula)) || clean[0];
};
const toPlain = (formula) => formula.replace(/[₀-₉]/g, digit => String(SUBSCRIPTS.indexOf(digit)));

// Okruhy látek podle názvu, vzorce a druhu (anglické názvy tříd a rolí z Wikidat)
const kindsOf = (detail) => [...(detail.type || []), ...(detail.sub || []), ...(detail.role || [])].map(en).join(' | ').toLowerCase();
const names = new Set(items.map(item => item.n.toLowerCase()));
let compoundRank = 0;
for (const [qid] of compoundCandidates) {
    const detail = details.get(qid);
    if (!detail || !detail.n || !detail.t) continue;
    const formula = pickFormula(detail.formula);
    if (!formula) continue;
    const name = capitalize(detail.n);
    if (names.has(name.toLowerCase())) continue;
    // Částice, směsi a ionty sem nepatří (alfa částice má „vzorec“ He)
    if (/částice|iont|kation|anion|radikál/iu.test(detail.d || '') && !/látka|sloučenina/iu.test(detail.d || '')) continue;
    if (compoundRank >= LIMITS.latky.limit) break;
    names.add(name.toLowerCase());
    const mass = max(detail.mass);
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: 'latky',
        k: compoundRank < LIMITS.latky.known ? 1 : 0,
        d: detail.d,
        ...imageFields(detail.im),
        sv: detail.st ? imageFields(detail.st).im : undefined,
        sh: detail.st ? imageFields(detail.st).ih : undefined,
        f: compact({
            formula,
            plain: toPlain(formula),
            // Molární hmotnost v g/mol (Wikidata mají hmotnost molekuly v daltonech, normalizovanou na kg)
            molar: mass ? round(mass / 1.66053906660e-27, 4) : undefined,
            melt: kelvinToCelsius(max(detail.melt)),
            boil: kelvinToCelsius(max(detail.boil)),
            dens: detail.dens ? round(max(detail.dens) / 1000, 4) : undefined
        }),
        kinds: kindsOf(detail)
    }));
    compoundRank++;
}

let chemistRank = 0;
for (const [qid] of chemistCandidates) {
    const detail = details.get(qid);
    if (!detail || !detail.t) continue;
    // Někteří mají jen mezinárodní název (mul) – pak název článku
    if (!detail.n) detail.n = detail.t.replace(/ \(.*\)$/, '');
    const born = yearOf(detail.born);
    if (born === undefined || chemistRank >= LIMITS.chemici.limit) continue;
    // Povolání „chemik“ mají ve Wikidatech i polyhistoři a politici (Leonardo, Thatcherová) – chemik musí být i v popisu
    const nobel = (detail.award || []).includes(NOBEL_CHEMISTRY);
    if (!nobel && !/chemi(k|čk)/iu.test(detail.d || '')) continue;
    const name = detail.n;
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    const isCzech = (detail.cit || []).some(q => CZECH_STATES.has(q));
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: 'chemici',
        k: chemistRank < LIMITS.chemici.known || isCzech ? 1 : 0,
        ty: detail.sex === FEMALE ? 'chemička' : 'chemik',
        sx: detail.sex === FEMALE ? 'f' : undefined,
        d: detail.d,
        cz: isCzech ? 1 : undefined,
        ...imageFields(detail.im),
        f: compact({
            born,
            died: yearOf(detail.died),
            land: (detail.cit || []).map(cs).filter(Boolean)[0],
            nobel: nobel ? 1 : undefined,
            y: born + 35
        })
    }));
    chemistRank++;
}

// --- Okruhy ---
const element = (family) => (item) => item.c === 'prvky' && item.f.fam === family;
const compound = (test) => (item) => item.c === 'latky' && test(item);
const onlyCHO = (item) => /^(C[₀-₉]*)(H[₀-₉]*)?(O[₀-₉]*)?$/.test(item.f.formula) && /O/.test(item.f.formula);
const carbons = (item) => { const match = /^C([₀-₉]*)/.exec(item.f.formula); return match ? Number(toPlain(match[1]) || 1) : 0; };
const nameStarts = (...prefixes) => (item) => prefixes.some(prefix => item.n.toLowerCase().startsWith(prefix));
const BY_Z = { by: 'z' };
const BY_NAME = { by: 'name' };
const COLLECTIONS = [
    { id: 'prvky-1-3-periody', label: 'Prvky 1.–3. periody', text: 'Od vodíku po argon', sort: BY_Z, test: item => item.c === 'prvky' && item.f.z <= 18 },
    { id: 'alkalicke-kovy', label: 'Alkalické kovy', sort: BY_Z, test: element('alkalicke-kovy') },
    { id: 'kovy-alkalickych-zemin', label: 'Kovy alkalických zemin', sort: BY_Z, test: element('kovy-alkalickych-zemin') },
    { id: 'prechodne-kovy', label: 'Přechodné kovy', sort: BY_Z, test: element('prechodne-kovy') },
    { id: 'lanthanoidy', label: 'Lanthanoidy', sort: BY_Z, test: element('lanthanoidy') },
    { id: 'aktinoidy', label: 'Aktinoidy', sort: BY_Z, test: element('aktinoidy') },
    { id: 'halogeny', label: 'Halogeny', sort: BY_Z, test: element('halogeny') },
    { id: 'vzacne-plyny', label: 'Vzácné plyny', sort: BY_Z, test: element('vzacne-plyny') },
    { id: 'nekovy', label: 'Nekovy', text: 'Bez halogenů a vzácných plynů', sort: BY_Z, test: element('nekovy') },
    { id: 'polokovy', label: 'Polokovy', sort: BY_Z, test: element('polokovy') },
    { id: 'kyseliny', label: 'Kyseliny', sort: BY_NAME, test: compound(nameStarts('kyselina')) },
    { id: 'hydroxidy', label: 'Hydroxidy', sort: BY_NAME, test: compound(nameStarts('hydroxid')) },
    { id: 'oxidy', label: 'Oxidy', sort: BY_NAME, test: compound(nameStarts('oxid')) },
    { id: 'soli', label: 'Soli', text: 'Chloridy, sírany, dusičnany, uhličitany…', sort: BY_NAME,
        test: compound(nameStarts('chlorid', 'síran', 'dusičnan', 'uhličitan', 'hydrogenuhličitan', 'fosforečnan', 'manganistan', 'jodid', 'bromid', 'fluorid', 'sulfid', 'dusitan', 'chlorečnan', 'kyanid')) },
    { id: 'uhlovodiky', label: 'Uhlovodíky', sort: BY_NAME, test: compound(item => /^C[₀-₉]*H[₀-₉]*$/.test(item.f.formula)) },
    // Alkoholy a cukry: jen z uhlíku, vodíku a kyslíku; alkoholy jednoduché (steroidy s -ol ne), fenol alkohol není
    { id: 'alkoholy', label: 'Alkoholy', sort: BY_NAME, test: compound(item => onlyCHO(item) && carbons(item) <= 6 && /(ol|alkohol)$/i.test(item.n) && !/fenol$/i.test(item.n)) },
    { id: 'cukry', label: 'Cukry (sacharidy)', sort: BY_NAME, test: compound(item => onlyCHO(item) && (/saccharide|carbohydrate|sugar/.test(item.kinds) || /[óo]za$/i.test(item.n))) },
    { id: 'aminokyseliny', label: 'Aminokyseliny', sort: BY_NAME, test: compound(item => /amino acid/.test(item.kinds)) },
    { id: 'vitaminy', label: 'Vitamíny', sort: BY_NAME, test: compound(item => /vitamin/.test(item.kinds) || /^vitamín/i.test(item.n)) },
    { id: 'hormony', label: 'Hormony a neuropřenašeče', sort: BY_NAME, test: compound(item => /hormone|neurotransmitter/.test(item.kinds)) },
    { id: 'leciva', label: 'Léčiva', sort: BY_NAME, test: compound(item => /medication|analgesic|antibiotic|antiviral|anti-inflammatory|anticonvulsant|benzodiazepine/.test(item.kinds)
        && !/neurotransmitter|hormone|chemical weapon|recreational|psychoactive|stimulant|narcotic|opioid|poison|explosive/.test(item.kinds)) },
    { id: 'nobelova-cena-chemie', label: 'Nositelé Nobelovy ceny za chemii', sort: { by: 'y' }, test: item => item.c === 'chemici' && item.f.nobel === 1 }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS
    .map(({ test, ...collection }) => collection)
    .filter(collection => items.filter(item => (item.g || []).includes(collection.id)).length >= 5);
for (const item of items) delete item.kinds;

for (const category of ['prvky', 'latky', 'chemici']) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.im).length} s fotkou)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('chemie', { collections, items });
