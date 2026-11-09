// Téma Fyzika: data/fyzika.json z Wikidat (přes QLever) – fyzikální veličiny, jednotky, zákony a jevy, částice, vesmír, kosmické mise a přístroje,
// fyzici a astronomové
// Spuštění: npm run build:fyzika (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { qlever, id, values, imageFields, yearOf, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';
import { landByDescription } from './lib/nationality.mjs';
import { INVENTIONS } from './lib/fyzika-inventions.mjs';

const PHYSICIST = 'Q169470';
const NOBEL_PHYSICS = 'Q38104';
const FEMALE = 'Q6581072';
const SUN = 'Q525';
const CURRENCY = 'Q8142';
const SI_BASE_UNIT = 'Q223662';
const SI_DERIVED_UNIT = 'Q208469';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);

const LIMITS = {
    veliciny: { limit: 120, known: 45 },
    jednotky: { limit: 120, known: 50 },
    pojmy: { limit: 260 },
    castice: { limit: 60 },
    vesmir: { limit: 520, known: 80 },
    mise: { limit: 140 },
    fyzici: { limit: 560, known: 110 },
    astronomove: { limit: 260 },
    // Kolik vynálezů (kromě českých) je známých
    vynalezy: { known: 30 }
};
// Počet jazykových verzí článku, od kterého je položka známá (fyzici a astronomové: Galilei, Gagarin; zákony a jevy, částice, konstanty)
const KNOWN_SL = { fyzici: 100, astronomove: 75, pojmy: 75, castice: 60, mise: 55 };
// Vesmírná tělesa: souhvězdí zná každý podle seznamu, ostatní od tolika jazykových verzí článku
const KNOWN_SPACE_SL = { 'měsíc': 80, 'hvězda': 60, galaxie: 70, mlhovina: 61, 'hvězdokupa': 100, kometa: 65, planetka: 70, 'trpasličí planeta': 60 };
// Hvězdokupy, které zná i laik (Plejády mají hodně jazykových verzí samy)
// Fotky bez uvedené licence na Commons (viz reports/licence-problemy.md)
const BAD_PHOTOS = new Set(['Ross128.jpg']);
const KNOWN_SPACE_NAMES = ['Hyády', 'Hvězdokupa Jesličky', 'Omega Centauri', 'Messier 13'];
// Souhvězdí, která zná každý (znamení zvěrokruhu a nejznámější hvězdné obrazce); ostatní souhvězdí jsou méně známá
const KNOWN_CONSTELLATIONS = ['Beran', 'Býk', 'Blíženci', 'Rak', 'Lev', 'Panna', 'Váhy', 'Štír', 'Střelec', 'Kozoroh', 'Vodnář', 'Ryby', 'Orion', 'Velká medvědice',
    'Malá medvědice', 'Kasiopeja', 'Labuť', 'Lyra', 'Orel', 'Jižní kříž', 'Pegas', 'Perseus', 'Herkules', 'Andromeda', 'Velký pes', 'Malý pes', 'Severní koruna',
    'Kentaur', 'Drak', 'Cefeus', 'Vozka', 'Pastýř', 'Hadonoš', 'Plejády'];
// Zákony, principy a teorie (z tříd Wikidat „fyzikální zákon“, „vědecký zákon“, „teorie“ – ty obsahují i Godwinův zákon a genetický kód, proto ruční výběr podle ID)
const PINNED_CONCEPTS = ['Q38433', 'Q11382', 'Q41591', 'Q134465', 'Q83219', 'Q83152', 'Q181404', 'Q173356', 'Q181328', 'Q170282', 'Q187672', 'Q179916', 'Q171340',
    'Q190760', 'Q51500', 'Q181465', 'Q192288', 'Q704747', 'Q3235565', 'Q3235671', 'Q193698', 'Q273711', 'Q210546', 'Q214336', 'Q212986', 'Q331041', 'Q217351',
    'Q210009', 'Q2305665', 'Q333094', 'Q392416', 'Q753007', 'Q856634', 'Q1195250', 'Q936481', 'Q255996', 'Q838055', 'Q1144564', 'Q2481895', 'Q2902868',
    'Q11452', 'Q11455', 'Q43514', 'Q323', 'Q103983', 'Q35875', 'Q44746', 'Q46344', 'Q2362761', 'Q46202', 'Q200286', 'Q193068', 'Q76250', 'Q845345', 'Q163214',
    'Q83213', 'Q178036', 'Q124131', 'Q13082', 'Q45003', 'Q169973', 'Q133673', 'Q185674', 'Q131594', 'Q76436'];
// Další jevy, pojmy a přístroje podle anglického názvu: vybere se položka s tímto názvem a nejvíc jazykovými verzemi (a českým článkem)
const CONCEPT_LABELS = ['Compton scattering', 'Zeeman effect', 'Stark effect', 'Hall effect', 'Casimir effect', 'quantum tunnelling', 'superfluidity', 'interference',
    'diffraction', 'refraction', 'total internal reflection', 'Cherenkov radiation', 'Hawking radiation', 'gravitational wave', 'gravitational lens',
    'radioactive decay', 'nuclear fission', 'piezoelectricity', 'ferromagnetism', 'static electricity', 'resonance', 'buoyancy', 'surface tension', 'capillary action',
    'thermal expansion', 'greenhouse effect', 'rainbow', 'aurora', 'black-body radiation', 'Meissner effect', 'Josephson effect', 'Seebeck effect', 'Peltier effect',
    'triboelectric effect', 'Magnus effect', 'centrifugal force', 'friction', 'inertia', 'free fall', 'weightlessness', 'standing wave', 'Schwarzschild radius',
    'event horizon', 'quantum entanglement', 'time dilation', 'length contraction', 'twin paradox', "Schrödinger's cat", 'quantum superposition', 'sonic boom',
    'dispersion', 'Rayleigh scattering', 'mirage', 'lightning', 'plasma', 'radioactivity', 'electromagnetic radiation', 'electromagnetic spectrum', 'absolute zero',
    'triple point', 'thermodynamic equilibrium', 'Carnot cycle', 'dark matter', 'dark energy', 'cosmic microwave background', 'expansion of the universe',
    'cosmic inflation', 'neutron star', 'pulsar', 'quasar', 'white dwarf', 'supernova', 'wormhole', 'antimatter', 'laser', 'X-ray', 'ultrasound', 'electric current',
    'magnetic field', 'electric field', 'gravity', 'double-slit experiment', 'Michelson–Morley experiment', 'Cavendish experiment',
    'Stern–Gerlach experiment', 'Geiger–Marsden experiment', 'Davisson–Germer experiment', 'Oil drop experiment', 'Eddington experiment',
    'Schrödinger equation', 'Maxwell\'s equations', 'Heisenberg\'s uncertainty principle', 'standard model', 'string theory', 'quantum mechanics', 'thermodynamics',
    'speed of sound', 'Mach number'];
// Částice a příbuzné pojmy z mikrosvěta podle anglického názvu (k částicím z tříd Wikidat)
const PARTICLE_LABELS = ['photon', 'atom', 'molecule', 'ion', 'antiparticle', 'alpha particle', 'positronium'];
// Kosmické sondy, lodě, dalekohledy a přístroje podle anglického názvu (jen s fotkou)
const PINNED_MISSIONS = ['Q165585', 'Q48546', 'Q182008', 'Q48558', 'Q182539', 'Q275444', 'Q2113134', 'Q604428', 'Q65049774', 'Q47482008', 'Q48814715', 'Q210199',
    'Q48496', 'Q1526343', 'Q113169', 'Q156081', 'Q208231'];
const MISSION_LABELS = ['pendulum', 'Foucault pendulum', "Newton's cradle", 'Faraday cage', 'Van de Graaff generator', 'Tesla coil', 'Leyden jar', 'voltaic pile', 'Sputnik 1', 'Explorer 1', 'Vostok 1', 'Apollo 11', 'Apollo 13', 'Apollo 8', 'Voyager 1', 'Voyager 2', 'Pioneer 10', 'Pioneer 11',
    'New Horizons', 'Mars Express', 'Rosetta', 'Philae', 'Parker Solar Probe',
    'Kepler space telescope', 'Transiting Exoplanet Survey Satellite', 'Chandra X-ray Observatory', 'Spitzer Space Telescope', 'Hubble Space Telescope',
    'James Webb Space Telescope', 'Skylab', 'International Space Station', 'Space Shuttle', 'Space Shuttle Challenger', 'Space Shuttle Columbia',
    'Space Shuttle Discovery', 'Space Shuttle Atlantis', 'Space Shuttle Endeavour', 'Saturn V', 'Falcon 9', 'Luna 2', 'Luna 9', 'Lunokhod 1',
    'Magellan', 'Mariner 10', 'Hipparcos', 'Wilkinson Microwave Anisotropy Probe', 'Cosmic Background Explorer', 'Fermi Gamma-ray Space Telescope', 'Vanguard 1',
    'Sputnik 2', 'Telstar 1', "Chang'e 4", 'Tiangong space station', 'Artemis 1', 'Space Launch System', 'Ariane 5', 'Large Hadron Collider',
    'tokamak', 'ITER', 'cyclotron', 'synchrotron', 'cloud chamber', 'bubble chamber', 'Geiger counter', 'electron microscope', 'scanning tunneling microscope',
    'mass spectrometer', 'oscilloscope', 'thermometer', 'barometer', 'seismograph', 'spectroscope', 'interferometer', 'LIGO', 'Arecibo Observatory',
    'Very Large Telescope', 'Atacama Large Millimeter Array', 'Event Horizon Telescope', 'radio telescope', 'refracting telescope', 'reflecting telescope',
    'Tevatron', 'Large Electron–Positron Collider', 'Relativistic Heavy Ion Collider', 'Super-Kamiokande', 'Apollo 17', 'Luna 3', 'Venera 7',
    'Mars Pathfinder', 'Europa Clipper', 'Starliner', 'Crew Dragon', 'Buran', 'Salyut 1', 'Tiangong-1', 'Shenzhou 5', 'Gemini 4', 'Mercury-Atlas 6'];

// Veličiny, které do fyziky ve škole nepatří, i když mají ve Wikidatech jednotku
const NOT_PHYSICS = /index tělesné|tempo|kvantové číslo|atomové číslo|nukleonové číslo|zeměpisná|obsah alkoholu|bodový|úrok|sazba|bitov|snímkov|bezrozměr|informac|rozlišovací|poloměr|rychlost světla|elementární náboj|konstanta/iu;
// Fyzici, které Wikidata nevedou povoláním jako fyziky (Newton) nebo kteří patří k české fyzice
const MUST_PHYSICISTS = ['Q935', 'Q937', 'Q8963', 'Q36620', 'Q46830', 'Q17714', 'Q93996', 'Q84284', 'Q627985', 'Q1361390'];
// Veličiny, které Wikidata nevedou s doporučenou jednotkou (teplota, elektrický proud), a jejich jednotky SI
const MUST_QUANTITIES = { Q11466: 'Q11579', Q11651: 'Q25272' };
// Co jednotka měří, kde Wikidata uvádějí méně obvyklou veličinu první
const MEASURES_OVERRIDES = { Q11579: 'teplota', Q25272: 'elektrický proud' };
// Jednotky, které do fyziky nepatří (kalendář, informatika) nebo jsou konstantou
const NOT_UNITS = /^(1|týden|měsíc|rok|den|rychlost světla|pixel|procento|bit|bajt|sluneční hmotnost|zvláštní práva čerpání|galaktický rok|procentní bod|bazický bod|\p{L}*bajt|oktet|planckův náboj|sverdrup)$/iu;
// Značky, které Wikidata uvádějí jinak, než se u nás píšou (tuna „MT“, unce „℥“)
const SYMBOL_OVERRIDES = { Q191118: 't', Q48013: 'oz' };
// Násobek jednotky SI: předpona a za ní jednotka SI (kilometr, mikrogram, femtometr, centimetr krychlový), ne decibel,
// kilopond nebo kilometr za hodinu; kilogram na metr krychlový je odvozená jednotka
const SI_PREFIX = '(?:yokto|zepto|atto|femto|piko|nano|mikro|mili|centi|deci|deka|hekto|kilo|mega|giga|tera|peta|exa)';
const SI_UNIT_NAME = '(?:metr|gram|sekund|ampér|kelvin|mol|kandel|newton|joule|watt|pascal|hertz|volt|ohm|coulomb|farad|henry|tesla|weber|siemens|gray|sievert|lumen|lux|radián|steradián|katal|becquerel)';
const isSIMultipleName = (name) => name.toLowerCase() === 'gram' || (new RegExp(`^${SI_PREFIX}${SI_UNIT_NAME}`, 'iu').test(name)
    && !/^kilogram/iu.test(name) && !/hodin|minut|den|rok/iu.test(name));
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
    const physicists = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P106/wdt:P279* wd:${PHYSICIST} } UNION { VALUES ?x { ${values(MUST_PHYSICISTS)} } } ${csArticle('?x')} }`));
    const astronomers = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P106 wd:Q11063 } UNION { ?x wdt:P106 wd:Q752129 } UNION { ?x wdt:P106 wd:Q11631 } ${csArticle('?x')} FILTER(?sl >= 28) }`));
    const nebulae = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:Q42372 . ${csArticle('?x')} FILTER(?sl >= 30) }`));
    const clusters = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31/wdt:P279* wd:Q168845 . ${csArticle('?x')} FILTER(?sl >= 40) }`));
    const constants = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { ?x wdt:P31 wd:Q173227 . ${csArticle('?x')} FILTER(?sl >= 30) }`));
    const particles = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { { ?x wdt:P279* wd:Q43116 } UNION { ?x wdt:P279* wd:Q177013 } UNION { ?x wdt:P31 wd:Q22675015 }
  ${csArticle('?x')} FILTER(?sl >= 28) }`));
    // Ruční výběr podle anglického názvu: nejvíc jazykových verzí z položek s tímto názvem a českým článkem
    const resolveLabels = async (labels) => {
        const rows = await qlever(`SELECT ?l ?x ?sl WHERE { VALUES ?l { ${labels.map(label => `${JSON.stringify(label)}@en`).join(' ')} } ?x rdfs:label ?l . ${csArticle('?x')} }`);
        const best = new Map();
        for (const row of rows) {
            const label = row.l.value;
            if (!best.has(label) || Number(row.sl.value) > best.get(label)[1]) best.set(label, [id(row.x.value), Number(row.sl.value)]);
        }
        return [...best].map(([label, [qid, sl]]) => [qid, sl, label]);
    };
    const resolvedConcepts = await resolveLabels([...new Set(CONCEPT_LABELS)]);
    const resolvedMissions = await resolveLabels([...new Set(MISSION_LABELS)]);
    const resolvedParticles = await resolveLabels(PARTICLE_LABELS);
    const pinnedMissions = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?x { ${values(PINNED_MISSIONS)} } ${csArticle('?x')} }`));
    const pinned = fromRows(await qlever(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?x { ${values(PINNED_CONCEPTS)} } ${csArticle('?x')} }`));
    const byDesc = (list) => list.sort((a, b) => b[1] - a[1]);
    return {
        quantities: byDesc(quantities),
        units: byDesc([...new Map([...units, ...quantityUnits])]),
        space: [
            ...byDesc(solar).map(([q, sl]) => [q, sl, 'solar']),
            ['Q525', 999, 'hvezda'], ['Q405', 999, 'mesic'],
            ...byDesc(moons).filter(([, sl]) => sl >= 25).map(([q, sl]) => [q, sl, 'mesic']),
            ...byDesc(stars).filter(([, sl]) => sl >= 32).map(([q, sl]) => [q, sl, 'hvezda']),
            ...byDesc(galaxies).filter(([, sl]) => sl >= 45).map(([q, sl]) => [q, sl, 'galaxie']),
            ...byDesc(constellations).map(([q, sl]) => [q, sl, 'souhvezdi']),
            ...byDesc(nebulae).map(([q, sl]) => [q, sl, 'mlhovina']),
            ...byDesc(clusters).map(([q, sl]) => [q, sl, 'hvezdokupa'])
        ],
        physicists: byDesc(physicists).slice(0, 1000),
        astronomers: byDesc(astronomers).slice(0, 480),
        concepts: [...byDesc(pinned).map(([q, sl]) => [q, sl, 'pinned']), ...byDesc(resolvedConcepts), ...byDesc(constants).map(([q, sl]) => [q, sl, 'konstanta'])],
        particles: [...byDesc(particles), ...byDesc(resolvedParticles)],
        missions: byDesc([...pinnedMissions.map(([q, sl]) => [q, sl, 'pinned']), ...resolvedMissions])
    };
});
console.log(`Kandidáti: ${candidates.quantities.length} veličin, ${candidates.units.length} jednotek, ${candidates.space.length} těles, ${candidates.physicists.length} fyziků, ${candidates.astronomers.length} astronomů, ${candidates.concepts.length} pojmů, ${candidates.particles.length} částic, ${candidates.missions.length} misí a přístrojů`);

// --- Podrobnosti ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1, born: 1, died: 1, sex: 1, found: 1, launch: 1, inc: 1 };
const allIds = [...new Set([...candidates.quantities, ...candidates.units, ...candidates.space, ...candidates.physicists, ...candidates.astronomers, ...candidates.concepts,
    ...candidates.particles, ...candidates.missions].map(([q]) => q))];
// Podrobnosti po dávkách: osoby (fyzici, astronomové) lehčím dotazem, ostatní položky všemi vlastnostmi
const COMMON_BRANCHES = [
    `{ ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }`,
    `{ ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }`,
    `{ ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }`,
    `{ ?item wdt:P18 ?v BIND("im" AS ?p) }`
];
const PERSON_BRANCHES = [
    `{ ?item wdt:P569 ?v BIND("born" AS ?p) }`,
    `{ ?item wdt:P570 ?v BIND("died" AS ?p) }`,
    `{ ?item wdt:P21 ?v BIND("sex" AS ?p) }`,
    `{ ?item wdt:P27 ?v BIND("cit" AS ?p) }`
];
const BODY_BRANCHES = [
    `{ ?item wdt:P416 ?v BIND("qsym" AS ?p) }`,
    `{ ?item wdt:P7973 ?v BIND("latex" AS ?p) }`,
    `{ ?item wdt:P5061 ?v BIND(LANG(?v) AS ?lang) BIND("usym" AS ?p) }`,
    `{ ?item wdt:P8111 ?v BIND("units" AS ?p) }`,
    `{ ?item wdt:P111 ?v BIND("measures" AS ?p) }`,
    `{ ?item wdt:P31 ?v BIND("type" AS ?p) }`,
    `{ ?item wdt:P397 ?v BIND("parent" AS ?p) }`,
    `{ ?item wdt:P61 ?v BIND("disc" AS ?p) }`,
    `{ ?item wdt:P575 ?v BIND("found" AS ?p) }`,
    `{ ?item wdt:P619 ?v BIND("launch" AS ?p) }`,
    `{ ?item wdt:P571 ?v BIND("inc" AS ?p) }`,
    `{ ?item wdt:P138 ?v BIND("named" AS ?p) }`,
    `{ ?item wdt:P137 ?v BIND("op" AS ?p) }`,
    `{ ?item wdt:P59 ?v BIND("const" AS ?p) }`,
    `{ ?item wdt:P279 ?v BIND("sub" AS ?p) }`,
    `{ ?item p:P2386/psn:P2386/wikibase:quantityAmount ?v BIND("diam" AS ?p) }`,
    `{ ?item p:P2067/psn:P2067/wikibase:quantityAmount ?v BIND("mass" AS ?p) }`,
    `{ ?item p:P2583/psn:P2583/wikibase:quantityAmount ?v BIND("dist" AS ?p) }`,
    `{ ?item p:P2146/psn:P2146/wikibase:quantityAmount ?v BIND("period" AS ?p) }`
];
const detailsQuery = (branches) => (qids) => `SELECT ?item ?p ?v ?lang WHERE {
  VALUES ?item { ${values(qids)} }
  ${[...COMMON_BRANCHES, ...branches].join('\n  UNION ')}
}`;
const personIds = new Set([...candidates.physicists, ...candidates.astronomers].map(([q]) => q));
const quantityIds = new Set(candidates.quantities.map(([q]) => q));
const unitIds = new Set(candidates.units.map(([q]) => q));
const spaceIds = new Set(candidates.space.map(([q]) => q));
const onRowTo = (result) => (row) => {
    const entry = result.get(id(row.item.value));
    const key = row.p.value;
    const raw = row.v.value;
    const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
    if (key === 'usym') entry.usym = [...(entry.usym || []), { v, lang: row.lang ? row.lang.value : '' }];
    else if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
    else if (['diam', 'mass', 'dist', 'period'].includes(key)) entry[key] = [...(entry[key] || []), Number(v)];
    else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
};
// Každá skupina položek má vlastní, lehčí dotaz (jen vlastnosti, které se u ní používají) a vlastní mezipaměť
const fetchGroup = async (name, ids, size, branches) => {
    const fetchIds = (list, suffix) => cached(`fyzika-details-${name}${suffix}`, async () => {
        const result = new Map(list.map(qid => [qid, {}]));
        await inBatches(list, size, detailsQuery(branches), onRowTo(result), qlever);
        return [...result];
    });
    const base = await fetchIds(ids, '');
    // Položky, které přibyly po uložení mezipaměti, se dočtou zvlášť
    const have = new Set(base.map(([qid]) => qid));
    const missing = ids.filter(qid => !have.has(qid));
    return missing.length ? [...base, ...await fetchIds(missing, `-extra-${missing.length}`)] : base;
};
const branchesOf = (...keys) => [...PERSON_BRANCHES, ...BODY_BRANCHES].filter(clause => keys.includes((/BIND\("(\w+)" AS \?p\)/.exec(clause) || [])[1]));
const NOBEL_BRANCH = `{ ?item wdt:P166 wd:${NOBEL_PHYSICS} BIND(wd:${NOBEL_PHYSICS} AS ?v) BIND("award" AS ?p) }`;
const groups = [
    ['persons', allIds.filter(qid => personIds.has(qid)), 200, [...branchesOf('born', 'died', 'sex', 'cit'), NOBEL_BRANCH]],
    ['quantities', allIds.filter(qid => quantityIds.has(qid) && !personIds.has(qid)), 200, branchesOf('qsym', 'latex', 'units', 'measures', 'type', 'usym')],
    ['units', allIds.filter(qid => unitIds.has(qid) && !quantityIds.has(qid) && !personIds.has(qid)), 200, branchesOf('usym', 'measures', 'type')],
    ['space', allIds.filter(qid => spaceIds.has(qid) && !quantityIds.has(qid) && !unitIds.has(qid) && !personIds.has(qid)), 200,
        branchesOf('type', 'parent', 'disc', 'found', 'const')],
    ['bodies', allIds.filter(qid => spaceIds.has(qid) && !quantityIds.has(qid) && !unitIds.has(qid) && !personIds.has(qid)), 200,
        branchesOf('diam', 'mass', 'dist', 'period')],
    ['other', allIds.filter(qid => ![personIds, quantityIds, unitIds, spaceIds].some(set => set.has(qid))), 150, branchesOf('type', 'found', 'launch', 'inc', 'named', 'op')]
];
const details = new Map(allIds.map(qid => [qid, {}]));
for (const [name, ids, size, branches] of groups) {
    for (const [qid, entry] of await fetchGroup(name, ids, size, branches)) if (details.has(qid)) Object.assign(details.get(qid), entry);
}
const referenced = [...new Set([...details.values()].flatMap(detail => [...(detail.type || []), ...(detail.parent || []), ...(detail.disc || []),
    ...(detail.cit || []), ...(detail.measures || []), ...(detail.units || []), ...(detail.named || []), ...(detail.op || []), ...(detail.const || [])]))].filter(q => /^Q\d+$/.test(q));
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

// Po kom je jednotka pojmenovaná (newton – Isaac Newton): nápověda k otázce na značku a na to, co měří
const eponyms = new Map(await cached('fyzika-eponyms', async () => {
    const rows = await qlever(`SELECT ?unit ?l WHERE { VALUES ?unit { ${values(candidates.units.map(([qid]) => qid))} }
  ?unit wdt:P138 ?person . ?person wdt:P31 wd:Q5 . ?person rdfs:label ?l FILTER(LANG(?l) = "cs") }`);
    return rows.map(row => [id(row.unit.value), row.l.value]);
}));

// Jednotky: co měří, značka, zda patří do SI
rank = 0;
for (const [qid] of candidates.units) {
    const detail = usable(qid);
    if (!detail || rank >= LIMITS.jednotky.limit || NOT_UNITS.test(detail.n)) continue;
    const symbol = SYMBOL_OVERRIDES[qid] || unitSymbol(detail);
    // Co jednotka měří: přednost má veličina, kterou máme mezi veličinami (u voltu napětí, ne „elektrotonický potenciál“)
    const measured = (detail.measures || []).map(cs).filter(Boolean);
    const quantityItems = items.filter(item => item.c === 'veliciny');
    const known = quantityItems.find(item => measured.some(label => label.toLowerCase() === item.n.toLowerCase()));
    const measures = MEASURES_OVERRIDES[qid] || (known ? known.n.toLowerCase() : undefined) || measured[0] || (quantityItems.find(item => item.f.unitId === qid) || {}).n?.toLowerCase();
    if (!symbol || !measures) continue;
    // Kilometr, miligram, gram: násobky a díly jednotek SI, ne odvozené jednotky
    const isMultiple = isSIMultipleName(detail.n) && !SI_BASE.includes(qid);
    const system = SI_BASE.includes(qid) ? 'základní jednotka SI' : isMultiple ? 'násobek jednotky SI' : isSI(qid) ? 'odvozená jednotka SI' : 'mimo soustavu SI';
    const added = addItem({
        q: qid, t: detail.t, n: capitalize(detail.n), c: 'jednotky', k: rank < LIMITS.jednotky.known || SI_BASE.includes(qid) ? 1 : 0, d: detail.d,
        ...imageFields(detail.im),
        f: compact({ usym: symbol, measures, system, named: eponyms.get(qid) })
    });
    if (added) rank++;
}

// Vesmír: druh tělesa podle zdroje a typu
const PLANETS = ['Q308', 'Q313', 'Q2', 'Q111', 'Q319', 'Q193', 'Q324', 'Q332'];
const solarKind = (detail) => {
    const types = (detail.type || []).map(en).join(' | ').toLowerCase();
    if (/hypothetical|fictional|myth|legend/.test(types)) return null;
    if (/(^|\| )dwarf planet($| \|)/.test(types)) return 'trpasličí planeta';
    if (/comet/.test(types)) return 'kometa';
    // Planety jsou jen ty skutečné (Varuna nebo Quaoar planety nejsou, i když to typ ve Wikidatech napovídá)
    if (PLANETS.includes(detail.q)) return 'planeta';
    if (/asteroid|minor planet|trans-neptunian|cubewano|plutino/.test(types)) return 'planetka';
    return null;
};
const KIND_LABELS = { mesic: 'měsíc', hvezda: 'hvězda', galaxie: 'galaxie', souhvezdi: 'souhvězdí', mlhovina: 'mlhovina', hvezdokupa: 'hvězdokupa' };
// Kolik nejznámějších těles každého druhu (planetek a komet má česká Wikipedie stovky)
const KIND_LIMITS = { 'planeta': 20, 'trpasličí planeta': 10, 'planetka': 20, 'kometa': 15, 'měsíc': 45, 'hvězda': 105, 'galaxie': 25, 'souhvězdí': 88, 'mlhovina': 40, 'hvězdokupa': 30 };
const kindCounts = {};
rank = 0;
for (const [qid, sl, source] of candidates.space) {
    const detail = usable(qid);
    // Těleso bez fotky (tyč, hvězda bez snímku) se na obrázku poznat nedá
    if (!detail || rank >= LIMITS.vesmir.limit || !detail.im || BAD_PHOTOS.has(imageFields(detail.im).im)) continue;
    const types = (detail.type || []).map(en).join(' | ').toLowerCase();
    // Hypotetická tělesa, mlhoviny a černé díry mezi hvězdy nepatří
    const skipTypes = ['mlhovina', 'hvezdokupa'].includes(source) ? /hypothetical|fictional|myth|legend|religio/ : /hypothetical|fictional|myth|legend|religio|nebula|black hole|radio source/;
    if (skipTypes.test(types)) continue;
    const kind = source === 'solar' ? solarKind({ ...detail, q: qid }) : KIND_LABELS[source];
    if (kind === 'planetka' && sl < 40) continue;
    if (!kind || (kindCounts[kind] || 0) >= KIND_LIMITS[kind]) continue;
    const parent = (detail.parent || []).map(cs).filter(Boolean)[0];
    const lightYears = max(detail.dist) ? max(detail.dist) / 9.4607e15 : undefined;
    const added = addItem({
        q: qid, t: detail.t, n: capitalize(detail.n), c: 'vesmir', ty: kind, d: detail.d,
        k: kind === 'planeta' || ['Q525', 'Q405'].includes(qid) || KNOWN_SPACE_NAMES.includes(capitalize(detail.n))
            || (kind === 'souhvězdí' ? KNOWN_CONSTELLATIONS.includes(capitalize(detail.n)) : sl >= KNOWN_SPACE_SL[kind]) ? 1 : 0,
        ...imageFields(detail.im),
        f: {
            kind,
            parent: kind === 'měsíc' || kind === 'planeta' ? parent : undefined,
            const: ['hvězda', 'mlhovina', 'hvězdokupa', 'galaxie'].includes(kind) ? (detail.const || []).map(cs).filter(Boolean)[0] : undefined,
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

// Hvězdy se společnou fotkou (souhvězdí s Velkým vozem u Dubhe, Alkaidu, Meraku…) se na obrázku nepoznají: žádná z nich
const starPhotos = new Map();
for (const item of items.filter(other => other.c === 'vesmir' && other.ty === 'hvězda')) starPhotos.set(item.im, (starPhotos.get(item.im) || 0) + 1);
for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].c === 'vesmir' && items[i].ty === 'hvězda' && starPhotos.get(items[i].im) > 1) items.splice(i, 1);
}

// Fyzici: povoláním fyzik a fyzik i v popisu (nebo Nobelova cena za fyziku)
rank = 0;
for (const [qid, sl] of candidates.physicists) {
    const detail = usable(qid);
    if (!detail || (rank >= LIMITS.fyzici.limit && !MUST_PHYSICISTS.includes(qid)) || (!detail.im && !MUST_PHYSICISTS.includes(qid))) continue;
    const nobel = (detail.award || []).includes(NOBEL_PHYSICS);
    const born = yearOf(detail.born);
    if (born === undefined || (!nobel && !MUST_PHYSICISTS.includes(qid) && !/fyzi(k|čk)/iu.test(detail.d || ''))) continue;
    const isCzech = (detail.cit || []).some(q => CZECH_STATES.has(q));
    const added = addItem({
        q: qid, t: detail.t, n: detail.n, c: 'fyzici', k: sl >= KNOWN_SL.fyzici || isCzech ? 1 : 0,
        ty: detail.sex === FEMALE ? 'fyzička' : 'fyzik', sx: detail.sex === FEMALE ? 'f' : undefined, d: detail.d, cz: isCzech ? 1 : undefined,
        ...imageFields(detail.im),
        f: { born, died: yearOf(detail.died), land: landByDescription(detail.d, (detail.cit || []).map(cs)), nobel: nobel ? 1 : undefined, y: born + 35 }
    });
    if (added) rank++;
}

// Astronomové, astrofyzici a kosmonauti (fyzici, kteří jsou i astronomy, zůstanou mezi fyziky)
rank = 0;
for (const [qid, sl] of candidates.astronomers) {
    const detail = usable(qid);
    // Sultan bin Salmán Al Saúd: jméno státu v jeho jménu
    if (!detail || rank >= LIMITS.astronomove.limit || !detail.im || qid === 'Q379946') continue;
    const born = yearOf(detail.born);
    const kind = /kosmonaut|astronaut|taikonaut/iu.test(detail.d || '') ? 'kosmonaut' : /astronom|astrofyzik|kosmolog/iu.test(detail.d || '') ? 'astronom' : null;
    if (born === undefined || !kind) continue;
    const female = detail.sex === FEMALE;
    const isCzech = (detail.cit || []).some(q => CZECH_STATES.has(q));
    const added = addItem({
        q: qid, t: detail.t, n: detail.n, c: 'astronomove', k: sl >= KNOWN_SL.astronomove || isCzech ? 1 : 0,
        ty: kind === 'kosmonaut' ? (female ? 'kosmonautka' : 'kosmonaut') : (female ? 'astronomka' : 'astronom'), sx: female ? 'f' : undefined, d: detail.d, cz: isCzech ? 1 : undefined,
        ...imageFields(detail.im),
        f: { born, died: yearOf(detail.died), land: landByDescription(detail.d, (detail.cit || []).map(cs)), y: born + 35 }
    });
    if (added) rank++;
}

// Částice: elementární i složené; skupina (lepton, kvark, boson…) podle názvu
const PARTICLE_SKIP = /valenční|delokalizovaný|nespárovaný|solvatovaný|^generace$|pentakvark|tetrakvark|temný foton|hyperjádro|axino|gravitino|superpartner|boson [xy]|boson w a z|majoron|^baryon (delta|lambda|sigma|ksí|omega)|^mezon |^kvark [udcstb]$|^(elektronové|mionové|tauonové) neutrino$|^anti(neutrino|neutron)|^kaon$|hyperon|axion|^pion$|magnetický monopól/iu;
const PARTICLE_GROUPS = [[/kvark/iu, 'kvark'], [/neutrin|elektron|pozitron|mion|tauon|lepton/iu, 'lepton'], [/foton|gluon|boson|graviton/iu, 'boson'],
    [/proton|neutron|baryon|nukleon/iu, 'baryon'], [/mezon|pion|kaon/iu, 'mezon'], [/hadron/iu, 'hadron'], [/fermion/iu, 'fermion']];
rank = 0;
for (const [qid, sl] of candidates.particles) {
    const detail = usable(qid);
    if (!detail || rank >= LIMITS.castice.limit) continue;
    const name = capitalize(detail.n);
    if (PARTICLE_SKIP.test(name) || items.some(item => item.q === qid)) continue;
    const group = (PARTICLE_GROUPS.find(([pattern]) => pattern.test(name)) || [])[1];
    const added = addItem({
        q: qid, t: detail.t, n: name, c: 'castice', k: sl >= KNOWN_SL.castice ? 1 : 0, ty: 'částice', d: detail.d,
        ...imageFields(detail.im),
        f: compact({ group })
    });
    if (added) rank++;
}

// Zákony, principy, teorie, jevy, konstanty a pokusy: ruční výběr (ID a anglické názvy), konstanty z třídy Wikidat
const CONCEPT_SKIP = /^(světelný rok|atmosféra|elektronvolt|chandrasekharova mez|tolmanova|klasický poloměr|loschmidtova|bohrův poloměr)/iu;
// Pojmy, které nejsou jev (objekty a abstraktní pojmy)
const PLAIN_CONCEPT = /supernova|pulsar|kvasar|trpaslík|neutronová hvězda|červí díra|antihmota|temná|laser|plazma|kvantum|^spin$|vlnová funkce|pole$|horizont událostí|schwarzschildův poloměr|skupenství/iu;
// Druh se řídí i popisem: myšlenkový experiment (Schrödingerova kočka, Paradox dvojčat) není jev a k ultrazvuku nepatří
const conceptType = (name, source, description = '') => {
    if (source === 'konstanta') return 'konstanta';
    if (/experiment|pokus/iu.test(name) || /^(?:myšlenkový )?(?:experiment|pokus)|myšlenkový experiment/iu.test(description)) return 'experiment';
    if (/teorie|velký třesk|heliocentr|model|mechanika|termodynamika/iu.test(name)) return 'teorie';
    if (PLAIN_CONCEPT.test(name)) return 'pojem';
    if (/zákon|pravidlo|rovnice|věta|zásada|teorém|rovnice/iu.test(name)) return 'zákon';
    if (/princip/iu.test(name)) return 'princip';
    return 'jev';
};
rank = 0;
for (const [qid, sl, source] of candidates.concepts) {
    const detail = usable(qid);
    if (!detail || rank >= LIMITS.pojmy.limit) continue;
    const name = capitalize(detail.n);
    if (CONCEPT_SKIP.test(name) || items.some(item => item.q === qid)) continue;
    const named = (detail.named || []).map(cs).filter(Boolean)[0];
    const added = addItem({
        q: qid, t: detail.t, n: name, c: 'pojmy', k: sl >= KNOWN_SL.pojmy ? 1 : 0, ty: conceptType(name, source, detail.d), d: detail.d,
        ...imageFields(detail.im),
        f: compact({ named: /^\p{Lu}/u.test(named || '') ? named : undefined, year: yearOf(detail.found) })
    });
    if (added) rank++;
}

// Kosmické sondy, lodě, dalekohledy a přístroje: jen s fotkou; druh podle typů ve Wikidatech
const missionKind = (detail) => {
    const types = (detail.type || []).map(en).join(' | ').toLowerCase();
    const name = capitalize(detail.n || '');
    if (/tokamak|^iter$/iu.test(name)) return 'přístroj';
    if (/space station|space laboratory/.test(types)) return 'kosmická stanice';
    if (/human spaceflight|crewed spacecraft/.test(types)) return 'pilotovaný let';
    if (/telescope/.test(types) || /dalekohled|teleskop|refraktor|reflektor/iu.test(name)) return 'dalekohled';
    if (/observatory|interferometer/.test(types)) return 'observatoř';
    if (/accelerator|collider|synchrotron|cyclotron/.test(types) || /urychlovač|synchrotron|cyklotron/iu.test(name)) return 'urychlovač částic';
    if (/spacecraft model/.test(types)) return 'kosmická loď';
    if (/rocket/.test(types)) return 'raketa';
    if (/probe|lander|rover|space mission|orbiter|sample-return/.test(types)) return 'kosmická sonda';
    if (/artificial satellite/.test(types)) return 'družice';
    if (/spacecraft/.test(types)) return 'kosmická loď';
    return 'přístroj';
};
// Instituty a laboratoře (Fermilab) nejsou přístroje
const NOT_INSTRUMENT_TYPE = /research institute|national laboratory|aviation accident/;
rank = 0;
for (const [qid, sl] of candidates.missions) {
    const detail = usable(qid);
    if (!detail || rank >= LIMITS.mise.limit || !detail.im || items.some(item => item.q === qid)) continue;
    if (NOT_INSTRUMENT_TYPE.test((detail.type || []).map(en).join(' | ').toLowerCase())) continue;
    const name = capitalize(detail.n);
    const operator = (detail.op || []).map(cs).filter(Boolean)[0];
    const added = addItem({
        q: qid, t: detail.t, n: name, c: 'mise', k: sl >= KNOWN_SL.mise ? 1 : 0, ty: missionKind(detail), d: detail.d,
        ...imageFields(detail.im),
        f: compact({ year: yearOf(detail.launch) ?? yearOf(detail.inc) ?? yearOf(detail.found), op: operator })
    });
    if (added) rank++;
}
// Vynálezy: ruční výběr s vynálezcem, rokem a zemí (scripts/lib/fyzika-inventions.mjs), název, popis a fotka z Wikidat.
// Vynálezce je jen údaj u vynálezu, ne položka – fyzici tak nejsou dvakrát; přístroje, které už jsou mezi misemi a přístroji
// (teploměr, barometr, Voltův sloup), se vynechají
const inventionLiteral = (label) => /@cs$/.test(label) ? `${JSON.stringify(label.slice(0, -3))}@cs` : `${JSON.stringify(label)}@en`;
const inventionRows = await cached('fyzika-vynalezy', async () => {
    const rows = await qlever(`SELECT ?l ?x ?sl WHERE { VALUES ?l { ${INVENTIONS.map(([label]) => inventionLiteral(label)).join(' ')} } ?x rdfs:label ?l . ${csArticle('?x')} }`);
    const best = new Map();
    for (const row of rows) {
        const label = `${row.l.value}${row.l['xml:lang'] === 'cs' ? '@cs' : ''}`;
        const sl = Number(row.sl.value);
        if (!best.has(label) || best.get(label)[1] < sl) best.set(label, [id(row.x.value), sl]);
    }
    const qids = [...new Set([...best.values()].map(([qid]) => qid))];
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, 150, detailsQuery([]), onRowTo(result), qlever);
    return [...best].map(([label, [qid, sl]]) => [label, qid, sl, result.get(qid)]);
});
const inventionByLabel = new Map(inventionRows.map(([label, qid, sl, detail]) => [label, { qid, sl, detail }]));
const inventions = INVENTIONS.map(([label, by, year, land, not]) => ({ ...inventionByLabel.get(label), by, year, land, not }))
    .filter(entry => entry.qid && entry.detail && entry.detail.t && !items.some(item => item.q === entry.qid));
// Známé: nejvíc jazykových verzí článku (telefon, žárovka, automobil) a české vynálezy
const knownInventions = new Set(inventions.filter(entry => entry.land !== 'Česko').sort((a, b) => b.sl - a.sl).slice(0, LIMITS.vynalezy.known).map(entry => entry.qid));
for (const entry of inventions) {
    const detail = { ...entry.detail };
    if (!detail.n) detail.n = detail.t.replace(/ \(.*\)$/, '');
    addItem({
        q: entry.qid, t: detail.t, n: capitalize(detail.n), c: 'vynalezy', k: knownInventions.has(entry.qid) || entry.land === 'Česko' ? 1 : 0, ty: 'vynález', d: detail.d,
        cz: entry.land === 'Česko' ? 1 : undefined,
        ...imageFields(detail.im),
        f: compact({ by: entry.by, year: entry.year, land: entry.land, xn: entry.not, y: entry.year })
    });
}

console.log('pojmy:', items.filter(item => item.c === 'pojmy').map(item => `${item.n} [${item.ty}${item.k ? ',k' : ''}]`).join('; '));
console.log('částice:', items.filter(item => item.c === 'castice').map(item => item.n).join('; '));
console.log('mise:', items.filter(item => item.c === 'mise').map(item => `${item.n} [${item.ty}${item.k ? ',k' : ''}]`).join('; '));

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
    { id: 'nasobky-jednotek-si', label: 'Násobky jednotek SI', text: 'Kilometr, centimetr, gram…', test: unit(item => item.f.system === 'násobek jednotky SI') },
    { id: 'jednotky-mimo-si', label: 'Jednotky mimo SI', text: 'Palce, míle, kalorie, světelné roky…', test: unit(item => item.f.system === 'mimo soustavu SI') },
    { id: 'elektrina-magnetismus', label: 'Elektřina a magnetismus', test: item => quantity(q => ELECTRIC_UNITS.test(q.f.unit))(item) || unit(u => ELECTRIC_UNITS.test(u.n))(item) },
    { id: 'teplo', label: 'Teplo a termika', test: item => quantity(q => THERMAL.test(q.n) || THERMAL.test(q.f.unit))(item) },
    { id: 'mechanika', label: 'Mechanika', text: 'Pohyb, síla, energie, tlak',
        test: quantity(q => /^(metr|kilogram|sekunda|newton|joule|watt|pascal|metr za sekundu|metr za sekundu na druhou|metr čtvereční|metr krychlový|kilogram na metr krychlový|newton metr|radián za sekundu)$/iu.test(q.f.unit) && !THERMAL.test(q.n)) },
    { id: 'slunecni-soustava', label: 'Sluneční soustava', text: 'Slunce, planety, trpasličí planety a Měsíc', test: item => space('planeta', 'trpasličí planeta')(item) || ['Q525', 'Q405'].includes(item.q) },
    { id: 'mesice', label: 'Měsíce planet', test: space('měsíc') },
    { id: 'hvezdy', label: 'Hvězdy', test: space('hvězda') },
    { id: 'souhvezdi', label: 'Souhvězdí', test: space('souhvězdí') },
    { id: 'galaxie', label: 'Galaxie', test: space('galaxie') },
    { id: 'komety-planetky', label: 'Komety a planetky', test: space('kometa', 'planetka') },
    { id: 'mlhoviny-hvezdokupy', label: 'Mlhoviny a hvězdokupy', text: 'Mlhovina v Orionu, Plejády…', test: space('mlhovina', 'hvězdokupa') },
    { id: 'zakony', label: 'Zákony, principy a teorie', text: 'Newtonovy zákony, Ohmův zákon, teorie relativity…', test: item => item.c === 'pojmy' && ['zákon', 'princip', 'teorie'].includes(item.ty) },
    { id: 'jevy', label: 'Fyzikální jevy a pokusy', text: 'Dopplerův jev, supravodivost, pokus s dvojštěrbinou…', test: item => item.c === 'pojmy' && ['jev', 'experiment'].includes(item.ty) },
    { id: 'konstanty', label: 'Fyzikální konstanty', text: 'Planckova konstanta, rychlost světla…', test: item => item.c === 'pojmy' && item.ty === 'konstanta' },
    { id: 'castice', label: 'Částice', text: 'Elektron, proton, kvark, foton, Higgsův boson…', test: item => item.c === 'castice' },
    { id: 'kosmicke-mise', label: 'Kosmické sondy a lodě', text: 'Voyager, Apollo, Hubble, vesmírné stanice',
        test: item => item.c === 'mise' && ['kosmická sonda', 'družice', 'kosmická loď', 'kosmická stanice', 'raketa', 'dalekohled', 'pilotovaný let'].includes(item.ty) },
    { id: 'pristroje', label: 'Přístroje a urychlovače', text: 'Urychlovače, mikroskopy, detektory, dalekohledy', test: item => item.c === 'mise' && ['přístroj', 'urychlovač částic', 'observatoř'].includes(item.ty) },
    { id: 'astronomove', label: 'Astronomové', sort: { by: 'y' }, test: item => item.c === 'astronomove' && ['astronom', 'astronomka'].includes(item.ty) },
    { id: 'kosmonauti', label: 'Kosmonauti a astronauti', sort: { by: 'y' }, test: item => item.c === 'astronomove' && ['kosmonaut', 'kosmonautka'].includes(item.ty) },
    { id: 'nobelova-cena-fyzika', label: 'Nositelé Nobelovy ceny za fyziku', sort: { by: 'y' }, test: item => item.c === 'fyzici' && item.f.nobel === 1 },
    { id: 'ceske-vynalezy', label: 'České vynálezy', text: 'Lodní šroub, ruchadlo, kostkový cukr, kontaktní čočka…', sort: { by: 'year' }, test: item => item.c === 'vynalezy' && item.f.land === 'Česko' },
    { id: 'vynalezy-do-1800', label: 'Vynálezy do roku 1800', text: 'Od papíru a knihtisku po parní stroj', sort: { by: 'year' }, test: item => item.c === 'vynalezy' && item.f.year < 1800 },
    { id: 'vynalezy-19-stoleti', label: 'Vynálezy 19. století', text: 'Telefon, žárovka, automobil…', sort: { by: 'year' }, test: item => item.c === 'vynalezy' && item.f.year >= 1800 && item.f.year < 1900 },
    { id: 'vynalezy-20-stoleti', label: 'Vynálezy 20. a 21. století', text: 'Letadlo, televize, počítačová myš…', sort: { by: 'year' }, test: item => item.c === 'vynalezy' && item.f.year >= 1900 }
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
