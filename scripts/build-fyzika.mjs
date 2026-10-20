// Téma Fyzika: data/fyzika.json z Wikidat (přes QLever) – fyzikální veličiny, jednotky, vesmír, fyzici
// Spuštění: npm run build:fyzika (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

const PHYSICIST = 'Q169470';
const NOBEL_PHYSICS = 'Q38104';
const FEMALE = 'Q6581072';
const SUN = 'Q525';
const CURRENCY = 'Q8142';
const SI_BASE_UNIT = 'Q223662';
const SI_DERIVED_UNIT = 'Q208469';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q1131475', 'Q153136', 'Q28513']);

const LIMITS = {
    veliciny: { limit: 120, known: 45 },
    jednotky: { limit: 120, known: 50 },
    vesmir: { limit: 300, known: 80 },
    fyzici: { limit: 200, known: 60 }
};
// Veličiny, které do fyziky ve škole nepatří, i když mají ve Wikidatech jednotku
const NOT_PHYSICS = /index tělesné|tempo|kvantové číslo|atomové číslo|nukleonové číslo|zeměpisná|obsah alkoholu|bodový|úrok|sazba|bitov|snímkov|bezrozměr|informac|rozlišovací|poloměr|rychlost světla|elementární náboj|konstanta/iu;
// Fyzici, které Wikidata nevedou povoláním jako fyziky (Newton) nebo kteří patří k české fyzice
const MUST_PHYSICISTS = ['Q935', 'Q937', 'Q8963', 'Q36620', 'Q46830', 'Q17714', 'Q93996', 'Q84284', 'Q627985', 'Q1361390'];
// Veličiny, které Wikidata nevedou s doporučenou jednotkou (teplota, elektrický proud), a jejich jednotky SI
const MUST_QUANTITIES = { Q11466: 'Q11579', Q11651: 'Q25272' };
// Co jednotka měří, kde Wikidata uvádějí méně obvyklou veličinu první
const MEASURES_OVERRIDES = { Q11579: 'teplota', Q25272: 'elektrický proud' };
// Jednotky, které do fyziky nepatří (kalendář, informatika) nebo jsou konstantou
const NOT_UNITS = /^(1|týden|měsíc|rok|den|rychlost světla|pixel|procento|bit|bajt|sluneční hmotnost)$/iu;
// Sedm základních jednotek SI
const SI_BASE = ['Q11573', 'Q11570', 'Q11574', 'Q25272', 'Q11579', 'Q41509', 'Q83216'];

const fromRows = (rows, key = 'x') => rows.map(row => [id(row[key].value), Number(row.sl.value)]);
const csArticle = (variable) => `?a schema:about ${variable} . ?a schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;

// --- Kandidáti ---
const candidates = await cached('fyzika-candidates', async () => {
    const quantities = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P8111 ?u } UNION { VALUES ?x { ${values(Object.keys(MUST_QUANTITIES))} } } ${csArticle('?x')} }`));
    const units = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P111 ?q . ?x wdt:P5061 ?s . ${csArticle('?x')}
  FILTER NOT EXISTS { ?x wdt:P31 wd:${CURRENCY} } }`));
    const quantityUnits = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?q wdt:P8111 ?x . ?qa schema:about ?q . ?qa schema:isPartOf <https://cs.wikipedia.org/> . ${csArticle('?x')} }`));
    const solar = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P397 wd:${SUN} . ${csArticle('?x')} }`));
    const moons = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:Q2537 . ${csArticle('?x')} }`));
    const stars = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:Q523 . ${csArticle('?x')} }`));
    const galaxies = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:Q318 . ${csArticle('?x')} }`));
    const constellations = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31 wd:Q8928 . ${csArticle('?x')} }`));
    const physicists = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P106 wd:${PHYSICIST} } UNION { VALUES ?x { ${values(MUST_PHYSICISTS)} } } ${csArticle('?x')} }`));
    const byDesc = (list) => list.sort((a, b) => b[1] - a[1]);
    return {
        quantities: byDesc(quantities),
        units: byDesc([...new Map([...units, ...quantityUnits])]),
        space: [
            ...byDesc(solar).map(([q, sl]) => [q, sl, 'solar']),
            ['Q525', 999, 'hvezda'], ['Q405', 999, 'mesic'],
            ...byDesc(moons).filter(([, sl]) => sl >= 25).map(([q, sl]) => [q, sl, 'mesic']),
            ...byDesc(stars).filter(([, sl]) => sl >= 45).map(([q, sl]) => [q, sl, 'hvezda']),
            ...byDesc(galaxies).filter(([, sl]) => sl >= 45).map(([q, sl]) => [q, sl, 'galaxie']),
            ...byDesc(constellations).map(([q, sl]) => [q, sl, 'souhvezdi'])
        ],
        physicists: byDesc(physicists).slice(0, 500)
    };
});
console.log(`Kandidáti: ${candidates.quantities.length} veličin, ${candidates.units.length} jednotek, ${candidates.space.length} těles, ${candidates.physicists.length} fyziků`);

// --- Podrobnosti ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, born: 1, died: 1, sex: 1, found: 1 };
const allIds = [...new Set([...candidates.quantities, ...candidates.units, ...candidates.space, ...candidates.physicists].map(([q]) => q))];
const details = new Map(await cached('fyzika-details', async () => {
    const result = new Map(allIds.map(qid => [qid, {}]));
    await inBatches(allIds, 150, (qids) => `SELECT ?item ?p ?v ?lang WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P416 ?v BIND("qsym" AS ?p) }
  UNION { ?item wdt:P7973 ?v BIND("latex" AS ?p) }
  UNION { ?item wdt:P5061 ?v BIND(LANG(?v) AS ?lang) BIND("usym" AS ?p) }
  UNION { ?item wdt:P8111 ?v BIND("units" AS ?p) }
  UNION { ?item wdt:P111 ?v BIND("measures" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P397 ?v BIND("parent" AS ?p) }
  UNION { ?item wdt:P61 ?v BIND("disc" AS ?p) }
  UNION { ?item wdt:P575 ?v BIND("found" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P166 ?v BIND("award" AS ?p) }
  UNION { ?item p:P2386/psn:P2386/wikibase:quantityAmount ?v BIND("diam" AS ?p) }
  UNION { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?v BIND("mass" AS ?p) }
  UNION { ?item p:P2583/psn:P2583/wikibase:quantityAmount ?v BIND("dist" AS ?p) }
  UNION { ?item p:P2146/psn:P2146/wikibase:quantityAmount ?v BIND("period" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (key === 'usym') entry.usym = [...(entry.usym || []), { v, lang: row.lang ? row.lang.value : '' }];
        else if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (['diam', 'mass', 'dist', 'period'].includes(key)) entry[key] = [...(entry[key] || []), Number(v)];
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return [...result];
}));
const referenced = [...new Set([...details.values()].flatMap(detail => [...(detail.type || []), ...(detail.parent || []), ...(detail.disc || []),
    ...(detail.cit || []), ...(detail.measures || []), ...(detail.units || [])]))].filter(q => /^Q\d+$/.test(q));
const labels = new Map(await cached('fyzika-labels', async () => {
    const result = [];
    await inBatches(referenced, 400, (qids) => `SELECT ?item ?lang ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en") }`,
        (row) => result.push([`${row.lang.value}:${id(row.item.value)}`, row.l.value]), qlever);
    return result;
}));
const cs = (qid) => labels.get(`cs:${qid}`) || (details.get(qid) || {}).n;
const en = (qid) => labels.get(`en:${qid}`) || '';

// --- Pomocníci ---
const max = (list) => list && list.length ? Math.max(...list) : undefined;
const round = (value, digits) => value === undefined ? undefined : Number(Number(value).toPrecision(digits));
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// Značka jednotky: mezinárodní (mul), anglická, jinak první
const unitSymbol = (detail) => {
    const list = detail.usym || [];
    return (list.find(entry => entry.lang === 'mul') || list.find(entry => entry.lang === 'en') || list[0] || {}).v;
};
// Značka veličiny: řetězec, jinak zjednodušený LaTeX (\vec{F} → F, \rho → ρ)
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
    rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Phi: 'Φ', Omega: 'Ω', Delta: 'Δ', Theta: 'Θ', Psi: 'Ψ' };
const fromLatex = (latex) => latex
    .replace(/\\(vec|mathbf|boldsymbol|mathrm|mathit|bar|hat)\{([^}]*)\}/g, '$2')
    .replace(/\\([A-Za-z]+)/g, (match, name) => GREEK[name] || '')
    .replace(/[{}\s]/g, '').replace(/_([A-Za-z0-9])/g, '$1');
const quantitySymbol = (detail) => {
    const plain = (detail.qsym || []).find(symbol => symbol.length <= 3);
    if (plain) return plain;
    const latex = (detail.latex || []).map(fromLatex).find(symbol => symbol && symbol.length <= 3);
    return latex || undefined;
};
const isSI = (qid) => {
    const types = (details.get(qid) || {}).type || [];
    return types.includes(SI_BASE_UNIT) || types.includes(SI_DERIVED_UNIT) || SI_BASE.includes(qid)
        || /SI (base|derived) unit|SI unit with special name|coherent/i.test(types.map(en).join(' | '));
};

const items = [];
const names = new Set();
const addItem = (item) => {
    if (names.has(item.n.toLowerCase())) return false;
    names.add(item.n.toLowerCase());
    items.push(compact(item));
    return true;
};
// Název: český, jinak název článku (některé položky mají jen mezinárodní název, třeba Albert Einstein)
const usable = (qid) => {
    const detail = details.get(qid);
    if (!detail || !detail.t) return null;
    if (!detail.n) detail.n = detail.t.replace(/ \(.*\)$/, '');
    return detail;
};

// Veličiny: jednotka SI (z doporučených jednotek ta, která do SI patří)
let rank = 0;
for (const [qid] of candidates.quantities) {
    const detail = usable(qid);
    if (!detail || NOT_PHYSICS.test(detail.n) || rank >= LIMITS.veliciny.limit) continue;
    const units = [...(detail.units || []), ...(MUST_QUANTITIES[qid] ? [MUST_QUANTITIES[qid]] : [])].filter(unit => cs(unit));
    const siUnit = units.find(isSI) || units[0];
    if (!siUnit) continue;
    const added = addItem({
        q: qid, t: detail.t, n: capitalize(detail.n), c: 'veliciny', k: rank < LIMITS.veliciny.known ? 1 : 0, d: detail.d,
        ...imageFields(detail.im),
        f: { sym: quantitySymbol(detail), unit: cs(siUnit), usym: unitSymbol(details.get(siUnit) || {}), unitId: siUnit }
    });
    if (added) rank++;
}

// Jednotky: co měří, značka, zda patří do SI
rank = 0;
for (const [qid] of candidates.units) {
    const detail = usable(qid);
    if (!detail || rank >= LIMITS.jednotky.limit || NOT_UNITS.test(detail.n)) continue;
    const symbol = unitSymbol(detail);
    // Co jednotka měří: přednost má veličina, kterou máme mezi veličinami (u voltu napětí, ne „elektrotonický potenciál“)
    const measured = (detail.measures || []).map(cs).filter(Boolean);
    const quantityItems = items.filter(item => item.c === 'veliciny');
    const known = quantityItems.find(item => measured.some(label => label.toLowerCase() === item.n.toLowerCase()));
    const measures = MEASURES_OVERRIDES[qid] || (known ? known.n.toLowerCase() : undefined) || measured[0] || (quantityItems.find(item => item.f.unitId === qid) || {}).n?.toLowerCase();
    if (!symbol || !measures) continue;
    const system = SI_BASE.includes(qid) ? 'základní jednotka SI' : isSI(qid) ? 'odvozená jednotka SI' : 'mimo soustavu SI';
    const added = addItem({
        q: qid, t: detail.t, n: capitalize(detail.n), c: 'jednotky', k: rank < LIMITS.jednotky.known || SI_BASE.includes(qid) ? 1 : 0, d: detail.d,
        ...imageFields(detail.im),
        f: { usym: symbol, measures, system }
    });
    if (added) rank++;
}

// Vesmír: druh tělesa podle zdroje a typu
const solarKind = (detail) => {
    const types = (detail.type || []).map(en).join(' | ').toLowerCase();
    if (/hypothetical|fictional|myth|legend/.test(types)) return null;
    if (/(^|\| )dwarf planet($| \|)/.test(types)) return 'trpaslicí planeta';
    if (/comet/.test(types)) return 'kometa';
    if (/planet/.test(types) && !/minor planet|exoplanet/.test(types)) return 'planeta';
    if (/asteroid|minor planet/.test(types)) return 'planetka';
    return null;
};
const KIND_LABELS = { mesic: 'měsíc', hvezda: 'hvězda', galaxie: 'galaxie', souhvezdi: 'souhvězdí' };
// Kolik nejznámějších těles každého druhu (planetek a komet má česká Wikipedie stovky)
const KIND_LIMITS = { 'planeta': 20, 'trpaslicí planeta': 10, 'planetka': 20, 'kometa': 15, 'měsíc': 45, 'hvězda': 60, 'galaxie': 25, 'souhvězdí': 88 };
const kindCounts = {};
rank = 0;
for (const [qid, sl, source] of candidates.space) {
    const detail = usable(qid);
    if (!detail || rank >= LIMITS.vesmir.limit) continue;
    const types = (detail.type || []).map(en).join(' | ').toLowerCase();
    // Hypotetická tělesa, mlhoviny a černé díry mezi hvězdy nepatří
    if (/hypothetical|fictional|myth|legend|religio|nebula|black hole|radio source/.test(types)) continue;
    const kind = source === 'solar' ? solarKind(detail) : KIND_LABELS[source];
    if (kind === 'planetka' && sl < 40) continue;
    if (!kind || (kindCounts[kind] || 0) >= KIND_LIMITS[kind]) continue;
    const parent = (detail.parent || []).map(cs).filter(Boolean)[0];
    const lightYears = max(detail.dist) ? max(detail.dist) / 9.4607e15 : undefined;
    const added = addItem({
        q: qid, t: detail.t, n: capitalize(detail.n), c: 'vesmir', k: rank < LIMITS.vesmir.known || ['planeta', 'trpaslicí planeta'].includes(kind) ? 1 : 0,
        ty: kind, d: detail.d,
        ...imageFields(detail.im),
        f: {
            kind,
            parent: kind === 'měsíc' || kind === 'planeta' ? parent : undefined,
            // Průměr v km, hmotnost v kg, vzdálenost ve světelných letech, oběžná doba ve dnech
            diam: max(detail.diam) ? round(max(detail.diam) / 1000, 4) : undefined,
            mass: round(max(detail.mass), 3),
            ly: kind === 'hvězda' || kind === 'galaxie' ? round(lightYears, 3) : undefined,
            period: max(detail.period) ? round(max(detail.period) / 86400, 4) : undefined,
            year: yearOf(detail.found),
            disc: (detail.disc || []).map(cs).filter(Boolean)[0]
        }
    });
    if (added) {
        rank++;
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;
    }
}

// Fyzici: povoláním fyzik a fyzik i v popisu (nebo Nobelova cena za fyziku)
rank = 0;
for (const [qid] of candidates.physicists) {
    const detail = usable(qid);
    if (!detail || (rank >= LIMITS.fyzici.limit && !MUST_PHYSICISTS.includes(qid))) continue;
    const nobel = (detail.award || []).includes(NOBEL_PHYSICS);
    const born = yearOf(detail.born);
    if (born === undefined || (!nobel && !MUST_PHYSICISTS.includes(qid) && !/fyzi(k|čk)/iu.test(detail.d || ''))) continue;
    const isCzech = (detail.cit || []).some(q => CZECH_STATES.has(q));
    const added = addItem({
        q: qid, t: detail.t, n: detail.n, c: 'fyzici', k: rank < LIMITS.fyzici.known || isCzech ? 1 : 0,
        ty: detail.sex === FEMALE ? 'fyzička' : 'fyzik', d: detail.d, cz: isCzech ? 1 : undefined,
        ...imageFields(detail.im),
        f: { born, died: yearOf(detail.died), land: (detail.cit || []).map(cs).filter(Boolean)[0], nobel: nobel ? 1 : undefined, y: born + 35 }
    });
    if (added) rank++;
}

// --- Okruhy ---
const ELECTRIC_UNITS = /ampér|volt|ohm|coulomb|farad|henry|tesla|weber|siemens/iu;
const THERMAL = /tepl|entropi|entalpi|kelvin/iu;
const quantity = (test) => (item) => item.c === 'veliciny' && test(item);
const unit = (test) => (item) => item.c === 'jednotky' && test(item);
const space = (...kinds) => (item) => item.c === 'vesmir' && kinds.includes(item.f.kind);
const BY_NAME = { by: 'name' };
const COLLECTIONS = [
    { id: 'zakladni-jednotky-si', label: 'Základní jednotky SI', text: 'Metr, kilogram, sekunda, ampér, kelvin, mol, kandela', test: unit(item => item.f.system === 'základní jednotka SI') },
    { id: 'odvozene-jednotky-si', label: 'Odvozené jednotky SI', test: unit(item => item.f.system === 'odvozená jednotka SI') },
    { id: 'jednotky-mimo-si', label: 'Jednotky mimo SI', text: 'Palce, míle, kalorie, světelné roky…', test: unit(item => item.f.system === 'mimo soustavu SI') },
    { id: 'elektrina-magnetismus', label: 'Elektřina a magnetismus', test: item => quantity(q => ELECTRIC_UNITS.test(q.f.unit))(item) || unit(u => ELECTRIC_UNITS.test(u.n))(item) },
    { id: 'teplo', label: 'Teplo a termika', test: item => quantity(q => THERMAL.test(q.n) || THERMAL.test(q.f.unit))(item) },
    { id: 'mechanika', label: 'Mechanika', text: 'Pohyb, síla, energie, tlak',
        test: quantity(q => /^(metr|kilogram|sekunda|newton|joule|watt|pascal|metr za sekundu|metr za sekundu na druhou|metr čtvereční|metr krychlový|kilogram na metr krychlový|newton metr|radián za sekundu)$/iu.test(q.f.unit) && !THERMAL.test(q.n)) },
    { id: 'slunecni-soustava', label: 'Sluneční soustava', text: 'Slunce, planety, trpasličí planety a Měsíc', test: item => space('planeta', 'trpaslicí planeta')(item) || ['Q525', 'Q405'].includes(item.q) },
    { id: 'mesice', label: 'Měsíce planet', test: space('měsíc') },
    { id: 'hvezdy', label: 'Hvězdy', test: space('hvězda') },
    { id: 'souhvezdi', label: 'Souhvězdí', test: space('souhvězdí') },
    { id: 'galaxie', label: 'Galaxie', test: space('galaxie') },
    { id: 'komety-planetky', label: 'Komety a planetky', test: space('kometa', 'planetka') },
    { id: 'nobelova-cena-fyzika', label: 'Nositelé Nobelovy ceny za fyziku', sort: { by: 'y' }, test: item => item.c === 'fyzici' && item.f.nobel === 1 }
].map(collection => ({ sort: BY_NAME, ...collection }));
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
    if (item.f) delete item.f.unitId;
}
for (const category of Object.keys(LIMITS)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.im).length} s fotkou)`);
}
for (const collection of COLLECTIONS) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('fyzika', { collections: COLLECTIONS.map(({ test, ...collection }) => collection), items });
