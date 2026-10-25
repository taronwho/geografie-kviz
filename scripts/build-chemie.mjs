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
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);

// Prvky, které zná každý (k nim všechny do čísla 38)
const KNOWN_ELEMENTS = new Set([47, 50, 53, 54, 55, 56, 74, 78, 79, 80, 82, 86, 88, 92, 94]);
const LIMITS = { latky: { limit: 400, known: 110 }, chemici: { limit: 200, known: 60 } };
// Okruh látek má mít aspoň tolik položek – chybějící doplní i méně známé látky nad limit
const COLLECTION_MIN = 20;
// Vitamíny a hormony podle českých názvů: třídy ve Wikidatech jsou u nich nespolehlivé (kumarin „vitamín“, testosteron ne „hormon“)
const VITAMINS = ['vitamín A', 'vitamín B6', 'vitamín B12', 'vitamín D', 'vitamín E', 'vitamín K', 'retinol', 'beta-karoten', 'thiamin', 'riboflavin', 'kyselina nikotinová', 'niacin', 'nikotinamid', 'kyselina pantothenová',
    'pyridoxin', 'biotin', 'kyselina listová', 'kobalamin', 'kyanokobalamin', 'vitamín C', 'kyselina askorbová', 'cholekalciferol',
    'ergokalciferol', 'tokoferol', 'alfa-tokoferol', 'fylochinon', 'menachinon'];
const HORMONES = ['adrenalin', 'noradrenalin', 'dopamin', 'serotonin', 'melatonin', 'oxytocin', 'vazopresin', 'kortizol', 'kortikosteron',
    'testosteron', 'estradiol', 'estron', 'estriol', 'progesteron', 'aldosteron', 'thyroxin', 'trijodthyronin', 'inzulin', 'glukagon',
    'histamin', 'acetylcholin', 'kyselina gama-aminomáselná', 'endorfin', 'beta-endorfin', 'leptin', 'gastrin', 'sekretin', 'kalcitonin'];
const isVitamin = (name) => VITAMINS.some(vitamin => vitamin.toLowerCase() === name.toLowerCase());
const isHormone = (name) => HORMONES.includes(name.toLowerCase());

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
const compoundCandidates = await cached('chemie-compounds-2500', async () => {
    const rows = await qlever(`SELECT DISTINCT ?c ?sl WHERE { VALUES ?type { wd:${CHEMICAL_ENTITY} wd:${ISOMER_GROUP} } ?c wdt:P31 ?type . ?c wdt:P274 ?f .
  ?a schema:about ?c . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?c wikibase:sitelinks ?sl }`);
    return rows.map(row => [id(row.c.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]).slice(0, 2500);
});
// Vitamíny a hormony, které obecný dotaz nenajde (jiná třída ve Wikidatech), podle českého názvu
const mustCompounds = await cached('chemie-must', async () => {
    const labels = [...VITAMINS, ...HORMONES].flatMap(name => [name, capitalize(name)]);
    const rows = await qlever(`SELECT ?c ?sl WHERE { VALUES ?l { ${labels.map(name => `"${name}"@cs`).join(' ')} } ?c rdfs:label ?l .
  ?a schema:about ?c . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?c wikibase:sitelinks ?sl }`);
    return rows.map(row => [id(row.c.value), Number(row.sl.value)]);
});
for (const [qid, sl] of mustCompounds) if (!compoundCandidates.some(([other]) => other === qid)) compoundCandidates.push([qid, sl]);
compoundCandidates.sort((a, b) => b[1] - a[1]);
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
// Kandidáti přidaní po uložení mezipaměti se dočtou zvlášť
const missingDetails = allIds.filter(qid => !details.has(qid));
if (missingDetails.length) for (const [qid, detail] of await fetchDetails(missingDetails)) details.set(qid, detail);
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
if (missingLabels.length) for (const [key, label] of await fetchLabels(missingLabels)) labels.set(key, label);
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
            named: (detail.named || []).map(cs).filter(Boolean)[0],
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
// ions = i nabité vzorce (thiamin, acetylcholin jsou kationty)
const pickFormula = (list, ions = false) => {
    const clean = (list || []).filter(formula => ions || !/[⁺⁻]/.test(formula));
    if (!clean.length) return undefined;
    return clean.find(formula => !isHill(formula)) || clean[0];
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
    { id: 'aminokyseliny', label: 'Aminokyseliny', sort: BY_NAME, test: compound(item => /amino acid/.test(item.kinds)) },
    { id: 'vitaminy', label: 'Vitamíny', text: 'A, B, C, D, E, K a provitamíny', sort: BY_NAME, test: compound(item => isVitamin(item.n)
        || (/vitamin [abcdek]\b/.test(item.kinds) && !/antagonist/.test(item.kinds))) },
    { id: 'hormony', label: 'Hormony a neuropřenašeče', sort: BY_NAME, test: compound(item => isHormone(item.n)
        || (/hormone|neurotransmitter/.test(item.kinds) && !/plant hormone|antagonist|antiprogest/.test(item.kinds))) },
    { id: 'leciva', label: 'Léčiva', sort: BY_NAME, test: compound(item => /medication|analgesic|antibiotic|antiviral|anti-inflammatory|anticonvulsant|benzodiazepine/.test(item.kinds)
        && !/neurotransmitter|hormone|chemical weapon|recreational|psychoactive|stimulant|narcotic|opioid|poison|explosive/.test(item.kinds)) },
    { id: 'nobelova-cena-chemie', label: 'Nositelé Nobelovy ceny za chemii', sort: { by: 'y' }, test: item => item.c === 'chemici' && item.f.nobel === 1 }
];
// Okruhy látek podle názvu, vzorce a druhu (anglické názvy tříd a rolí z Wikidat)
const kindsOf = (detail) => [...(detail.type || []), ...(detail.sub || []), ...(detail.role || [])].map(en).join(' | ').toLowerCase();
const names = new Set(items.map(item => item.n.toLowerCase()));
let compoundRank = 0;
const collectionCounts = {};
for (const [qid] of compoundCandidates) {
    const detail = details.get(qid);
    if (!detail || !detail.n || !detail.t) continue;
    const name = capitalize(detail.n);
    const curated = isVitamin(detail.n) || isHormone(detail.n);
    let formula = pickFormula(detail.formula) || (curated ? pickFormula(detail.formula, true) : undefined);
    // Bez vzorce jen skupiny vitamínů (vitamín A je víc látek)
    if (!formula && !curated) continue;
    if (formula && /^hydroxid/iu.test(name)) {
        // Hydroxid bez vodíku ve vzorci je chyba v datech
        if (!/H/.test(formula)) continue;
        formula = hydroxideFormula(formula);
    }
    if (names.has(name.toLowerCase())) continue;
    // Částice, směsi a ionty sem nepatří (alfa částice má „vzorec“ He)
    if (/částice|iont|kation|anion|radikál/iu.test(detail.d || '') && !/látka|sloučenina/iu.test(detail.d || '')) continue;
    // Nad limit jen látky do okruhu, který je zatím malý (vitamíny, cukry, alkoholy)
    const probe = { c: 'latky', n: name, f: { formula }, kinds: kindsOf(detail) };
    const groups = COLLECTIONS.filter(collection => collection.test(probe));
    if (compoundRank >= LIMITS.latky.limit && !curated && !groups.some(collection => (collectionCounts[collection.id] || 0) < COLLECTION_MIN)) continue;
    for (const collection of groups) collectionCounts[collection.id] = (collectionCounts[collection.id] || 0) + 1;
    names.add(name.toLowerCase());
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
            plain: formula ? toPlain(formula) : undefined,
            molar: formula ? molarMassOf(formula) : undefined,
            ...phaseTemperatures(detail),
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
