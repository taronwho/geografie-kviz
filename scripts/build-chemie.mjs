// Téma Chemie: data/chemie.json z Wikidat (přes QLever) – chemické prvky, sloučeniny a látky, chemici
// Spuštění: npm run build:chemie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { createRequire } from 'node:module';
import { qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';
import { landByDescription } from './lib/nationality.mjs';
import { CONCEPT_CLASSES, CONCEPT_TITLES, GROUP_CATEGORY } from './lib/chemie-concepts.mjs';
import { assignLevels, levelSummary, pageviewsByTitle } from './lib/veda-levels.mjs';

// Skupiny prvků a jejich místo v tabulce zná jádro aplikace – stejná pravidla pro data i nápovědu
const { elementFamily } = createRequire(import.meta.url)('../quiz-core.js');
// Vzorce, které Wikidata uvádí jen v Hillově zápisu (BaO₄S, ClH₄N) nebo s překlepem (KCIO₃ s velkým I místo l)
// Názvy, jejichž krátký popis prozrazuje odpověď jinou podobou slova (modrá – modř, polymerizační – polymerizace); mezi otázky nepatří
const LEAKY_NAMES = new Set(['Aniontová adiční polymerizace', 'Pařížská modř']);
const FORMULA_FIXES = {
    'Síran amonný': '(NH₄)₂SO₄', 'Síran barnatý': 'BaSO₄', 'Síran železnatý': 'FeSO₄', 'Síran hlinitý': 'Al₂(SO₄)₃', 'Oxid sírový': 'SO₃', 'Fluorid sírový': 'SF₆',
    'Oxid fosforečný': 'P₄O₁₀', 'Dusičnan olovnatý': 'Pb(NO₃)₂', 'Dusičnan vápenatý': 'Ca(NO₃)₂', 'Bromovodík': 'HBr', 'Fluorovodík': 'HF', 'Chlorid amonný': 'NH₄Cl',
    'Chlorid měďnatý': 'CuCl₂', 'Hydroxid-oxid hlinitý': 'AlO(OH)', 'Uhličitan draselný': 'K₂CO₃', 'Uhličitan hořečnatý': 'MgCO₃', 'Uhličitan amonný': '(NH₄)₂CO₃',
    'Kyanid sodný': 'NaCN', 'Fosgen': 'COCl₂', 'Chlorečnan draselný': 'KClO₃', 'Kyselina chlorečná': 'HClO₃', 'Kyselina chlorná': 'HClO', 'Kyselina chromová': 'H₂CrO₄',
    'Močovina': 'CO(NH₂)₂', 'Octan sodný': 'CH₃COONa'
};
// Hustota pevné látky a kapaliny, kterou Wikidata uvádějí tisíckrát menší (chlorid amonný 1,527 g/cm³, ne 0,0015)
const DENSITY_FIXES = { 'Chlorid amonný': 1.527, 'Kyselina kyanovodíková': 0.687 };
// Wolfram není pojmenován po vlku (Wikidata uvádějí vlka obecného kvůli německému „Wolf Rahm“)
const NOT_NAMED_AFTER = new Set(['Wolfram']);

const ELEMENT = 'Q11344';
const CHEMICAL_ENTITY = 'Q113145171';
// Skupina izomerů – tak jsou ve Wikidatech vedené třeba glukóza nebo fruktóza
const ISOMER_GROUP = 'Q15711994';
const CHEMIST = 'Q593644';
const NOBEL_CHEMISTRY = 'Q44585';
const FEMALE = 'Q6581072';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);

// Prvky, které zná každý (k nim všechny do čísla 38)
const KNOWN_ELEMENTS = new Set([47, 50, 53, 54, 55, 56, 74, 78, 79, 80, 82, 86, 88, 92, 94]);
const LIMITS = { latky: { limit: 800 }, chemici: { limit: 400 }, reakce: { limit: 300 }, pojmy: { limit: 520 } };
// Úrovně (scripts/lib/veda-levels.mjs): podíl nejznámějších položek kategorie, které jsou známé (prvky určuje KNOWN_ELEMENTS)
const KNOWN_SHARE = { prvky: 0, latky: 0.22, chemici: 0.22, reakce: 0.22, pojmy: 0.26 };
// Na známou ji kvůli malému okruhu jde povýšit jen položku z lepší poloviny kategorie (podle známosti) nebo s návštěvností článku
const PROMOTE_PCT = 0.55;
const PROMOTE_PV = 6000;
// Od tohoto pořadí (podle počtu jazykových verzí) musí mít látka a chemik aspoň fotku či strukturní vzorec – dál už jsou méně známí
// a obrázek je jediné, co otázku oživí
const IMAGE_FROM = { latky: 400, chemici: 200 };
// Okruh látek má mít aspoň tolik položek – chybějící doplní i méně známé látky nad limit (vitamíny a aminokyseliny jsou skoro uzavřené)
const COLLECTION_MIN = { oxidy: 100, uhlovodiky: 100, leciva: 90, hormony: 40, cukry: 35, alkoholy: 35, aminokyseliny: 30, hydroxidy: 22, vitaminy: 22 };
const collectionMin = (id) => COLLECTION_MIN[id] ?? 20;
// Vitamíny a hormony podle českých názvů: třídy ve Wikidatech jsou u nich nespolehlivé (kumarin „vitamín“, testosteron ne „hormon“)
const VITAMINS = ['vitamín A', 'vitamín B6', 'vitamín B12', 'vitamín D', 'vitamín E', 'vitamín K', 'retinol', 'beta-karoten', 'thiamin', 'riboflavin', 'kyselina nikotinová', 'niacin', 'nikotinamid', 'kyselina pantothenová',
    'pyridoxin', 'biotin', 'kyselina listová', 'kobalamin', 'kyanokobalamin', 'vitamín C', 'kyselina askorbová', 'cholekalciferol',
    'ergokalciferol', 'tokoferol', 'alfa-tokoferol', 'fylochinon', 'menachinon'];
// (český název nebo název článku – u bílkovinných hormonů se liší: článek Růstový hormon, název somatotropin)
const HORMONES = ['adrenalin', 'noradrenalin', 'dopamin', 'serotonin', 'melatonin', 'oxytocin', 'vazopresin', 'kortizol', 'kortikosteron',
    'testosteron', 'estradiol', 'estron', 'estriol', 'progesteron', 'aldosteron', 'thyroxin', 'trijodthyronin', 'inzulin', 'glukagon',
    'histamin', 'acetylcholin', 'kyselina gama-aminomáselná', 'endorfin', 'beta-endorfin', 'leptin', 'gastrin', 'sekretin', 'kalcitonin',
    'růstový hormon', 'prolaktin', 'thyreotropní hormon', 'adrenokortikotropní hormon', 'folitropin', 'lutropin', 'parathormon', 'erythropoetin',
    'ghrelin', 'cholecystokinin', 'somatostatin', 'dehydroepiandrosteron', 'dihydrotestosteron', 'kortikoliberin', 'angiotenzin', 'adiponektin',
    'anandamid', 'enkefalin', 'substance p', 'antidiuretický hormon', 'choriogonadotropin', 'kyselina glutamová'];
// Aminokyseliny: dvacet stavebních (a selenocystein, pyrolysin) a nejznámější další; ve Wikidatech mají různé třídy (threonin žádnou „amino acid“)
const AMINO_ACIDS = ['glycin', 'alanin', 'valin', 'leucin', 'isoleucin', 'prolin', 'fenylalanin', 'tryptofan', 'methionin', 'serin', 'threonin', 'cystein',
    'l-cystein', 'tyrosin', 'asparagin', 'glutamin', 'kyselina asparagová', 'kyselina glutamová', 'lysin', 'arginin', 'histidin', 'selenocystein', 'pyrolysin',
    'ornitin', 'citrulin', 'β-alanin', 'sarkosin', 'taurin', 'homocystein', 'dimethylglycin', 'kyselina gama-aminomáselná', 'kreatin'];
const listed = (list) => (name, title = '') => list.some(entry => entry.toLowerCase() === name.toLowerCase() || entry.toLowerCase() === title.toLowerCase());
const isVitamin = listed(VITAMINS);
const isHormone = listed(HORMONES);
const isAminoAcid = listed(AMINO_ACIDS);
// Herbicid glyfosát je ve Wikidatech „secondary amino acid“, mezi aminokyseliny ve škole nepatří
const NOT_AMINO_ACIDS = /^glyfosát$/iu;

// Relativní atomové hmotnosti (IUPAC, zaokrouhlené); u nestabilních prvků nejstabilnější izotop.
// Wikidata mají u látek jen monoizotopovou hmotnost (NaCl 57,96 místo 58,44), molární hmotnost se proto počítá ze vzorce.
const ATOMIC_WEIGHTS = {
    H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
    Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078,
    Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
    Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224,
    Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71,
    Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
    Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05,
    Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
    Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03,
    Np: 237, Pu: 244, Am: 243, Cm: 247, Bk: 247, Cf: 251, Es: 252, Fm: 257, Md: 258, No: 259, Lr: 266, Rf: 267, Db: 268,
    Sg: 269, Bh: 270, Hs: 269, Mt: 278, Ds: 281, Rg: 282, Cn: 285, Nh: 286, Fl: 289, Mc: 290, Lv: 293, Ts: 294, Og: 294
};
// Molární hmotnost ze vzorce (i se závorkami a krystalovou vodou: Ca(OH)₂, CuSO₄·5H₂O); neznámý zápis = bez údaje
const groupMass = (text) => {
    const stack = [0];
    const pattern = /([A-Z][a-z]?|\(|\)|\[|\])(\d*)/g;
    let position = 0;
    let match;
    while ((match = pattern.exec(text))) {
        if (match.index !== position) return null;
        position = pattern.lastIndex;
        const [, token, digits] = match;
        const count = digits ? Number(digits) : 1;
        if (token === '(' || token === '[') {
            if (digits) return null;
            stack.push(0);
        } else if (token === ')' || token === ']') {
            const inner = stack.pop();
            if (!stack.length) return null;
            stack[stack.length - 1] += inner * count;
        } else {
            if (!ATOMIC_WEIGHTS[token]) return null;
            stack[stack.length - 1] += ATOMIC_WEIGHTS[token] * count;
        }
    }
    return position === text.length && stack.length === 1 ? stack[0] : null;
};
const molarMassOf = (formula) => {
    const plain = formula.replace(/[₀-₉]/g, digit => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit))).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, '');
    let total = 0;
    for (const part of plain.split(/[·•]/)) {
        const [, multiplier, body] = /^(\d*)(.*)$/.exec(part);
        const mass = groupMass(body);
        if (mass === null || !body) return undefined;
        total += (multiplier ? Number(multiplier) : 1) * mass;
    }
    return Math.round(total * 100) / 100;
};

const firstValue = (list) => (list || [])[0];
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const max = (list) => list && list.length ? Math.max(...list) : undefined;
const round = (value, digits) => value === undefined ? undefined : Number(Number(value).toPrecision(digits));
const kelvinToCelsius = (k) => k === undefined ? undefined : Math.round((k - 273.15) * 10) / 10;
// Teplota tání a varu; když by látka tála až nad bodem varu (astat ve Wikidatech), je jeden údaj chybný – nevíme který
const phaseTemperatures = (detail) => {
    const melt = kelvinToCelsius(max(detail.melt));
    const boil = kelvinToCelsius(max(detail.boil));
    return melt !== undefined && boil !== undefined && melt > boil ? {} : { melt, boil };
};

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
// Latinské názvy prvků – nápověda k otázce na značku (Natrium → Na)
const latinNames = new Map(await cached('chemie-latin', async () => {
    const rows = await qlever(`SELECT ?el ?l WHERE { VALUES ?el { ${values(elements.map(element => element.q))} } ?el rdfs:label ?l FILTER(LANG(?l) = "la") }`);
    return rows.map(row => [id(row.el.value), row.l.value]);
}));

// --- Látky: chemické látky s českým článkem a vzorcem ---
// Prvních 2500 podle počtu jazykových verzí; méně známé (do 8 verzí) jen jako doplněk malých okruhů (oxidy, léčiva) nad limit
const COMPOUND_QUERY = (filter) => `SELECT DISTINCT ?c ?sl WHERE { VALUES ?type { wd:${CHEMICAL_ENTITY} wd:${ISOMER_GROUP} } ?c wdt:P31 ?type . ?c wdt:P274 ?f .
  ?a schema:about ?c . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?c wikibase:sitelinks ?sl ${filter} }`;
const compoundCandidates = await cached('chemie-compounds-2500', async () => {
    const rows = await qlever(COMPOUND_QUERY(''));
    return rows.map(row => [id(row.c.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]).slice(0, 2500);
});
const COMPOUND_MIN_SL = 8;
const moreCompounds = await cached('chemie-compounds-more', async () => {
    const rows = await qlever(COMPOUND_QUERY(`FILTER(?sl >= ${COMPOUND_MIN_SL})`));
    return rows.map(row => [id(row.c.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);
});
const candidateIds = new Set(compoundCandidates.map(([qid]) => qid));
for (const [qid, sl] of moreCompounds) if (!candidateIds.has(qid)) { candidateIds.add(qid); compoundCandidates.push([qid, sl]); }
// Oxidy, hydroxidy a cukry podle názvu článku i bez třídy ve Wikidatech (oxid manganičitý, oxid germaničitý ji nemají)
const namedCompounds = await cached('chemie-compounds-named', async () => {
    const rows = await qlever(`SELECT DISTINCT ?c ?sl WHERE { ?c wdt:P274 ?f . ?a schema:about ?c . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?t .
  ?c wikibase:sitelinks ?sl FILTER(?sl >= ${COMPOUND_MIN_SL} && (STRSTARTS(?t, "Oxid ") || STRSTARTS(?t, "Hydroxid ") || STRENDS(?t, "óza"))) }`);
    return rows.map(row => [id(row.c.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);
});
for (const [qid, sl] of namedCompounds) if (!candidateIds.has(qid)) { candidateIds.add(qid); compoundCandidates.push([qid, sl]); }
// Vitamíny, hormony a aminokyseliny, které obecný dotaz nenajde (jiná třída ve Wikidatech), podle českého názvu nebo názvu článku
const mustCompounds = await cached('chemie-must-2', async () => {
    const names = [...new Set([...VITAMINS, ...HORMONES, ...AMINO_ACIDS])];
    const labels = names.flatMap(name => [name, capitalize(name)]);
    const byLabel = await qlever(`SELECT ?c ?sl WHERE { VALUES ?l { ${labels.map(name => `"${name}"@cs`).join(' ')} } ?c rdfs:label ?l .
  ?a schema:about ?c . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?c wikibase:sitelinks ?sl }`);
    const byTitle = await qlever(`SELECT ?c ?sl WHERE { VALUES ?t { ${names.map(name => `"${capitalize(name)}"@cs`).join(' ')} } ?a schema:name ?t .
  ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:about ?c . ?c wikibase:sitelinks ?sl }`);
    return [...byLabel, ...byTitle].map(row => [id(row.c.value), Number(row.sl.value)]);
});
for (const [qid, sl] of mustCompounds) if (!candidateIds.has(qid)) { candidateIds.add(qid); compoundCandidates.push([qid, sl]); }
compoundCandidates.sort((a, b) => b[1] - a[1]);
console.log(`Látky (kandidáti): ${compoundCandidates.length}`);

// --- Chemici: povoláním chemik, s českým článkem ---
// a nositelé Nobelovy ceny za chemii (i biochemici a fyzici, kteří chemik ve Wikidatech nejsou)
const chemistCandidates = await cached('chemie-chemists-1000', async () => {
    const rows = await qlever(`SELECT DISTINCT ?p ?sl WHERE { { ?p wdt:P106 wd:${CHEMIST} } UNION { ?p wdt:P166 wd:${NOBEL_CHEMISTRY} } .
  ?a schema:about ?p . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?p wikibase:sitelinks ?sl }`);
    return rows.map(row => [id(row.p.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]).slice(0, 1000);
});
console.log(`Chemici (kandidáti): ${chemistCandidates.length}`);

// --- Reakce, procesy a pojmy (lib/chemie-concepts.mjs): podle druhu ve Wikidatech a ručního seznamu názvů článků ---
const DISAMBIGUATION = 'Q4167410';
const TITLE_GROUP = new Map(Object.entries(CONCEPT_TITLES).flatMap(([group, titles]) => titles.map(title => [title, group])));
const conceptList = await cached('chemie-concepts-2', async () => {
    const found = new Map();
    const add = (qid, sl, group) => { if (!found.has(qid) || found.get(qid)[1] < sl) found.set(qid, [qid, sl, group]); };
    for (const [cls, min, group] of CONCEPT_CLASSES) {
        const rows = await qlever(`SELECT DISTINCT ?i ?sl WHERE { ?i wdt:P31 wd:${cls} . ?i wikibase:sitelinks ?sl FILTER(?sl >= ${min}) .
  ?a schema:about ?i . ?a schema:isPartOf <https://cs.wikipedia.org/> }`);
        for (const row of rows) add(id(row.i.value), Number(row.sl.value), group);
    }
    // Izotopy: Uran-235, Uhlík-14, deuterium
    const isotopes = await qlever(`SELECT DISTINCT ?i ?sl ?t WHERE { ?i wdt:P31 wd:Q25276 . ?i wikibase:sitelinks ?sl FILTER(?sl >= 8) .
  ?a schema:about ?i . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?t }`);
    for (const row of isotopes) if (/^\p{Lu}\p{Ll}+-\d+$|^(Deuterium|Tritium)$/u.test(row.t.value)) add(id(row.i.value), Number(row.sl.value), 'izotopy');
    const titles = [...TITLE_GROUP.keys()];
    for (let i = 0; i < titles.length; i += 100) {
        const rows = await qlever(`SELECT DISTINCT ?i ?sl ?t WHERE { VALUES ?t { ${titles.slice(i, i + 100).map(title => `"${title}"@cs`).join(' ')} }
  ?a schema:name ?t . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:about ?i . ?i wikibase:sitelinks ?sl }`);
        for (const row of rows) add(id(row.i.value), Number(row.sl.value), TITLE_GROUP.get(row.t.value));
    }
    return [...found.values()].sort((a, b) => b[1] - a[1]);
});
console.log(`Reakce a pojmy (kandidáti): ${conceptList.length}`);

// --- Podrobnosti ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, st: 1, born: 1, died: 1, sex: 1 };
const allIds = [...elements.map(element => element.q), ...compoundCandidates.map(([q]) => q), ...chemistCandidates.map(([q]) => q), ...conceptList.map(([q]) => q)];
const fetchDetails = async (list) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 150, (qids) => `SELECT ?item ?p ?v WHERE {
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
    return result;
};
const details = new Map(await cached('chemie-details', async () => [...await fetchDetails(allIds)]));
// Kandidáti přidaní po uložení mezipaměti se dočtou zvlášť (i s vlastní mezipamětí)
const missingDetails = [...new Set(allIds.filter(qid => !details.has(qid)))];
if (missingDetails.length) {
    for (const [qid, detail] of await cached(`chemie-details-extra-${missingDetails.length}`, async () => [...await fetchDetails(missingDetails)])) details.set(qid, detail);
}
// České názvy odkazovaných položek (objevitelé, pojmenováno po, druhy látek, země) a anglické názvy tříd látek pro okruhy
const referenced = [...new Set([...details.values()].flatMap(detail => [...(detail.disc || []), ...(detail.named || []), ...(detail.cit || []),
    ...(detail.type || []), ...(detail.sub || []), ...(detail.role || [])]))].filter(q => /^Q\d+$/.test(q));
const fetchLabels = async (list) => {
    const result = [];
    await inBatches(list, 400, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]), qlever);
    return result;
};
const labels = new Map(await cached('chemie-labels', () => fetchLabels(referenced)));
const missingLabels = referenced.filter(q => !labels.has(`en:${q}`) && !labels.has(`cs:${q}`));
if (missingLabels.length) for (const [key, label] of await cached(`chemie-labels-extra-${missingLabels.length}`, () => fetchLabels(missingLabels))) labels.set(key, label);
const cs = (qid) => labels.get(`cs:${qid}`);
const en = (qid) => labels.get(`en:${qid}`) || '';

// --- Položky ---
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
            lat: latinNames.get(element.q),
            ar: ATOMIC_WEIGHTS[element.sym],
            fam: familyOf(element.z),
            year: yearOf(firstValue(detail.found)),
            disc: discoverer.slice(0, 2).join(', ') || undefined,
            named: NOT_NAMED_AFTER.has(capitalize(detail.n)) ? undefined : (detail.named || []).map(cs).filter(Boolean)[0],
            ...phaseTemperatures(detail),
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
// Hydroxid v Hillově zápisu (CaH₂O₂) jako Ca(OH)₂
const hydroxideFormula = (formula) => {
    const match = /^([A-Z][a-z]?)?H([₀-₉]*)O([₀-₉]*)([A-Z][a-z]?)?$/.exec(formula);
    if (!match || Boolean(match[1]) === Boolean(match[4]) || match[2] !== match[3]) return formula;
    const metal = match[1] || match[4];
    return match[2] && match[2] !== '₁' ? `${metal}(OH)${match[2]}` : `${metal}OH`;
};
// Anorganický vzorec v Hillově zápisu s kyslíkem před dalším prvkem (O₂Pb, O₄PbS, H₂O₄Se, O₆P₄) v obvyklém pořadí:
// vodík, ostatní prvky, kyslík nakonec (PbO₂, PbSO₄, H₂SeO₄, P₄O₆); u fluoridů kyslíku (OF₂) a hydroxidů pořadí zůstane
const oxygenLast = (formula) => {
    if (!/^(?:[A-Z][a-z]?[₀-₉]*)+$/.test(formula)) return formula;
    const parts = formula.match(/[A-Z][a-z]?[₀-₉]*/g);
    const symbol = (part) => part.replace(/[₀-₉]+$/, '');
    const oxygen = parts.findIndex(part => symbol(part) === 'O');
    if (parts.some(part => symbol(part) === 'C') || oxygen < 0 || !parts.slice(oxygen + 1).some(part => !/^(H|O|F)$/.test(symbol(part)))) return formula;
    const hydrogen = parts.filter(part => symbol(part) === 'H');
    const others = parts.filter(part => !/^(H|O)$/.test(symbol(part)));
    return [...hydrogen, ...others, parts[oxygen]].join('');
};
// ions = i nabité vzorce (thiamin, acetylcholin jsou kationty)
const pickFormula = (list, ions = false) => {
    const clean = (list || []).filter(formula => ions || !/[⁺⁻]/.test(formula));
    if (!clean.length) return undefined;
    return oxygenLast(clean.find(formula => !isHill(formula)) || clean[0]);
};
const toPlain = (formula) => formula.replace(/[₀-₉]/g, digit => String(SUBSCRIPTS.indexOf(digit)));

// --- Okruhy (určené už tady, aby je šlo doplnit i látkami nad limit) ---
const element = (family) => (item) => item.c === 'prvky' && item.f.fam === family;
const compound = (test) => (item) => item.c === 'latky' && test(item);
const onlyCHO = (item) => /^(C[₀-₉]*)(H[₀-₉]*)?(O[₀-₉]*)?$/.test(item.f.formula) && /O/.test(item.f.formula);
const countOf = (item, symbol) => { const match = new RegExp(`${symbol}([₀-₉]*)(?![a-z])`).exec(item.f.formula); return match ? Number(toPlain(match[1]) || 1) : 0; };
const carbons = (item) => countOf(item, 'C');
// Počet násobných vazeb a kruhů (u aromatického jádra aspoň 4)
const unsaturation = (item) => carbons(item) - countOf(item, 'H') / 2 + 1;
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
    // Fenoly (eugenol, thymol – OH na aromatickém jádře) mezi alkoholy nepatří; poznají se podle počtu násobných vazeb a kruhů
    { id: 'alkoholy', label: 'Alkoholy', sort: BY_NAME, test: compound(item => onlyCHO(item) && carbons(item) <= 10 && /(ol|alkohol)$/i.test(item.n)
        && !/fenol$|^eukalyptol$/i.test(item.n) && !/phenol|catechol|thujaplicin|ether/.test(item.kinds) && (unsaturation(item) < 4 || /alkohol/i.test(item.n))) },
    // Cukerné alkoholy (sorbitol, maltitol) a cukerné kyseliny cukry nejsou
    { id: 'cukry', label: 'Cukry (sacharidy)', sort: BY_NAME, test: compound(item => onlyCHO(item) && !/itol$|^kyselina/i.test(item.n) && !/sugar alcohol|sugar acid/.test(item.kinds)
        && (/saccharide|carbohydrate|sugar/.test(item.kinds) || /[óo]za$/i.test(item.n))) },
    // Aminokyseliny podle seznamu a třídy ve Wikidatech („amino acid“, „l-amino acid“, „beta-amino acid“ – ne léčiva a „excitatory amino acid antagonist“)
    { id: 'aminokyseliny', label: 'Aminokyseliny', sort: BY_NAME, test: compound(item => isAminoAcid(item.n, item.t)
        || (/(^|\| )[\w-]*( [\w-]+)? ?amino acids?( \||$)/.test(item.kinds) && !/medication|drug|hallucinogen|herbicide|tranquilizer|anticonvulsant|antagonist|agonist|alkaloid/.test(item.kinds)
            && !NOT_AMINO_ACIDS.test(item.n))) },
    { id: 'vitaminy', label: 'Vitamíny', text: 'A, B, C, D, E, K a provitamíny', sort: BY_NAME, test: compound(item => isVitamin(item.n, item.t)
        || (/vitamin [abcdek]\b/.test(item.kinds) && !/antagonist/.test(item.kinds))) },
    { id: 'hormony', label: 'Hormony a neuropřenašeče', sort: BY_NAME, test: compound(item => isHormone(item.n, item.t)
        || (/hormone|neurotransmitter/.test(item.kinds) && !/plant hormone|antagonist|antiprogest/.test(item.kinds))) },
    { id: 'leciva', label: 'Léčiva', sort: BY_NAME, test: compound(item => /medication|analgesic|antibiotic|antiviral|anti-inflammatory|anticonvulsant|benzodiazepine/.test(item.kinds)
        && !/neurotransmitter|hormone|chemical weapon|recreational|psychoactive|stimulant|narcotic|opioid|poison|explosive/.test(item.kinds)) },
    { id: 'jmenne-reakce', label: 'Jmenné reakce', text: 'Grignardova, Dielsova–Alderova…', sort: BY_NAME, test: item => item.grp === 'jmenne-reakce' },
    { id: 'typy-reakci', label: 'Typy reakcí a děje', text: 'Oxidace, hoření, koroze, neutralizace…', sort: BY_NAME, test: item => item.grp === 'typy-reakci' },
    { id: 'prumyslove-procesy', label: 'Průmyslové procesy', text: 'Haber–Bosch, Solvay, krakování…', sort: BY_NAME, test: item => item.grp === 'prumyslove-procesy' },
    { id: 'zakladni-pojmy', label: 'Základní pojmy', text: 'Mol, pH, vazby, elektronegativita…', sort: BY_NAME, test: item => item.grp === 'zakladni-pojmy' },
    { id: 'skupiny-latek', label: 'Skupiny látek', text: 'Alkany, estery, steroidy, soli…', sort: BY_NAME, test: item => item.grp === 'skupiny-latek' },
    { id: 'slitiny-smesi', label: 'Slitiny, směsi a materiály', text: 'Ocel, bronz, sklo, benzín…', sort: BY_NAME, test: item => item.grp === 'slitiny-smesi' },
    { id: 'metody', label: 'Metody a laboratorní pomůcky', text: 'Destilace, titrace, byreta, kahan…', sort: BY_NAME, test: item => item.grp === 'metody' },
    { id: 'zakony', label: 'Zákony a pravidla', text: 'Avogadro, Boyle, Hess, Le Chatelier…', sort: BY_NAME, test: item => item.grp === 'zakony' },
    { id: 'izotopy', label: 'Izotopy', text: 'Uran-235, uhlík-14, deuterium…', sort: BY_NAME, test: item => item.grp === 'izotopy' },
    { id: 'nobelova-cena-chemie', label: 'Nositelé Nobelovy ceny za chemii', sort: { by: 'y' }, test: item => item.c === 'chemici' && item.f.nobel === 1 }
];
// Okruhy látek podle názvu, vzorce a druhu (anglické názvy tříd a rolí z Wikidat)
const kindsOf = (detail) => [...(detail.type || []), ...(detail.sub || []), ...(detail.role || [])].map(en).join(' | ').toLowerCase();
const names = new Set(items.map(item => item.n.toLowerCase()));
let compoundRank = 0;
const collectionCounts = {};
// Doplněk nad limit: izomery a deriváty s lokanty a předponami (but-2-en, 2-methylbutan-2-ol, o-xylen, (E)-stilben) a radikály ne,
// pokud nejsou dost známé
const ISOMER_NAME = /\d|^\p{L}-|^\(|radikál/iu;
const ISOMER_MIN_SL = 30;
const FILLER_IMAGELESS_SL = 20;
for (const [qid, sl] of compoundCandidates) {
    const detail = details.get(qid);
    if (!detail || !detail.n || !detail.t) continue;
    const name = capitalize(detail.n);
    const curated = isVitamin(detail.n, detail.t) || isHormone(detail.n, detail.t) || isAminoAcid(detail.n, detail.t);
    let formula = FORMULA_FIXES[name] || pickFormula(detail.formula) || (curated ? pickFormula(detail.formula, true) : undefined);
    // Bez vzorce jen skupiny vitamínů (vitamín A je víc látek)
    if (!formula && !curated) continue;
    if (formula && /^hydroxid/iu.test(name)) {
        // Hydroxid bez vodíku ve vzorci je chyba v datech
        if (!/H/.test(formula)) continue;
        formula = hydroxideFormula(formula);
    }
    if (names.has(name.toLowerCase())) continue;
    // Bez fotky a vzorce jen dost známá látka jako doplněk malého okruhu (oxid měďný); vzorec se ptá i bez obrázku
    const imageless = !detail.im && !detail.st;
    if (LEAKY_NAMES.has(name) || (compoundRank >= IMAGE_FROM.latky && !curated && imageless && !(compoundRank >= LIMITS.latky.limit && sl >= FILLER_IMAGELESS_SL))) continue;
    // Částice, směsi a ionty sem nepatří (alfa částice má „vzorec“ He)
    if (/částice|iont|kation|anion|radikál/iu.test(detail.d || '') && !/látka|sloučenina/iu.test(detail.d || '')) continue;
    // Nad limit jen látky do okruhu, který je zatím malý (vitamíny, cukry, alkoholy)
    const probe = { c: 'latky', n: name, t: detail.t, f: { formula }, kinds: kindsOf(detail) };
    const groups = COLLECTIONS.filter(collection => collection.test(probe));
    if (compoundRank >= LIMITS.latky.limit && !curated) {
        if (!groups.some(collection => (collectionCounts[collection.id] || 0) < collectionMin(collection.id))) continue;
        if (ISOMER_NAME.test(name) && sl < ISOMER_MIN_SL) continue;
    }
    for (const collection of groups) collectionCounts[collection.id] = (collectionCounts[collection.id] || 0) + 1;
    names.add(name.toLowerCase());
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: 'latky',
        d: detail.d,
        ...imageFields(detail.im),
        sv: detail.st ? imageFields(detail.st).im : undefined,
        sh: detail.st ? imageFields(detail.st).ih : undefined,
        f: compact({
            formula,
            plain: formula ? toPlain(formula) : undefined,
            molar: formula ? molarMassOf(formula) : undefined,
            ...phaseTemperatures(detail),
            dens: DENSITY_FIXES[name] ?? (detail.dens ? round(max(detail.dens) / 1000, 4) : undefined)
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
    if (chemistRank >= IMAGE_FROM.chemici && !detail.im) continue;
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
        k: isCzech ? 1 : 0,
        ty: detail.sex === FEMALE ? 'chemička' : 'chemik',
        sx: detail.sex === FEMALE ? 'f' : undefined,
        d: detail.d,
        cz: isCzech ? 1 : undefined,
        ...imageFields(detail.im),
        f: compact({
            born,
            died: yearOf(detail.died),
            // Příslušnost podle popisu (Boris Johnson ve Wikidatech: USA)
            land: landByDescription(detail.d, (detail.cit || []).map(cs)),
            nobel: nobel ? 1 : undefined,
            y: born + 35
        })
    }));
    chemistRank++;
}

// Reakce a pojmy: kategorie podle okruhu; položky bez českého článku, rozcestníky a to, co už je prvkem či látkou, se vynechají
// Položky, jejichž popis prozrazuje název jinou podobou slova (modrá – modř, polymerizační – polymerizace)
const CONCEPT_SKIP = LEAKY_NAMES;
const usedImages = new Set(items.map(item => item.im).filter(Boolean));
const conceptCounts = { reakce: 0, pojmy: 0 };
for (const [qid, , group] of conceptList) {
    const detail = details.get(qid);
    const category = GROUP_CATEGORY[group];
    if (!detail || !detail.n || !detail.t || (detail.type || []).includes(DISAMBIGUATION) || CONCEPT_SKIP.has(capitalize(detail.n))) continue;
    if (conceptCounts[category] >= LIMITS[category].limit) continue;
    const name = capitalize(detail.n);
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: category,
        k: 0,
        d: detail.d,
        ...imageFields(detail.im && !usedImages.has(detail.im) ? detail.im : undefined),
        f: {},
        grp: group,
        kinds: kindsOf(detail)
    }));
    conceptCounts[category]++;
}

for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS
    .map(({ test, ...collection }) => collection)
    .filter(collection => items.filter(item => (item.g || []).includes(collection.id)).length >= 5);
for (const item of items) { delete item.kinds; delete item.grp; }

// --- Úrovně obtížnosti (Základní / Mudrlant / Expert) ---
// Známost: jazykové verze článku a návštěvnost článku na české Wikipedii; prvky do stroncia a nejznámější těžší prvky (KNOWN_ELEMENTS)
// a čeští chemici jsou známí vždy
const sitelinks = new Map([...elements.map(entry => [entry.q, entry.sl]), ...compoundCandidates, ...chemistCandidates, ...conceptList.map(([qid, sl]) => [qid, sl])]);
const pageviews = await pageviewsByTitle('chemie-pageviews', items.map(item => item.t));
for (const item of items) item._ = { sl: sitelinks.get(item.q) || 0, pv: pageviews[item.t], pool: item.c, fixed: item.k === 1 };
const levelGroups = [
    ...collections.map(collection => ({ id: collection.id, members: items.filter(item => (item.g || []).includes(collection.id)) })),
    ...['prvky', 'latky', 'reakce', 'pojmy', 'chemici'].map(key => ({ id: `kategorie ${key}`, members: items.filter(item => item.c === key) }))
];
const promoted = assignLevels(items, { groups: levelGroups, knownShare: pool => KNOWN_SHARE[pool],
    ceiling: item => item._.pct <= PROMOTE_PCT || (item._.pv || 0) >= PROMOTE_PV });
console.log(`Povýšeno na známé kvůli okruhům: ${promoted.length}`);
for (const [group, name] of promoted) console.log(`  ${group}: ${name}`);
for (const key of ['prvky', 'latky', 'reakce', 'pojmy', 'chemici']) console.log('  ' + levelSummary(key, items.filter(item => item.c === key)));
for (const collection of collections) console.log('  ' + levelSummary(`okruh ${collection.label}`, items.filter(item => (item.g || []).includes(collection.id))));
console.log('  ' + levelSummary('celkem', items));
for (const item of items) delete item._;

for (const category of ['prvky', 'latky', 'reakce', 'pojmy', 'chemici']) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.im).length} s fotkou)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('chemie', { collections, items });
