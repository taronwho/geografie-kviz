// Téma Biologie: data/biologie.json z Wikidat – savci, ptáci, plazi a obojživelníci, ryby, hmyz, další bezobratlí, rostliny, houby
// a pravěcí tvorové. Strom taxonů je velký, proto dotazy jdou přes QLever (query.wikidata.org na nich vyprší).
// Spuštění: npm run build:biologie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
import { qlever, id, values, imageFields, compact, cached, inBatches, writeTopic, sleep } from './lib/wikidata.mjs';

const RANK = { class: 'Q37517', order: 'Q36602', family: 'Q35409', genus: 'Q34740', species: 'Q7432' };

// Kategorie podle předků (vědecká jména); pořadí = přednost (ptáci jsou ve Wikidatech i mezi plazy, dinosauři také)
// limit = kolik nejznámějších vzít, known = kolik z nich je „známých“
const CATEGORIES = [
    { key: 'pravek', roots: ['Dinosauria', 'Pterosauria', 'Plesiosauria', 'Ichthyosauria', 'Trilobita'], except: ['Aves'], genus: true, limit: 120, known: 30 },
    { key: 'savci', roots: ['Mammalia'], limit: 600, known: 130 },
    { key: 'ptaci', roots: ['Aves'], limit: 500, known: 100 },
    { key: 'plazi', roots: ['Reptilia', 'Amphibia'], limit: 300, known: 60 },
    { key: 'ryby', roots: ['Actinopterygii', 'Chondrichthyes'], limit: 250, known: 50 },
    { key: 'hmyz', roots: ['Insecta'], limit: 250, known: 50 },
    { key: 'bezobratli', roots: ['Arachnida', 'Crustacea', 'Myriapoda', 'Mollusca', 'Cnidaria', 'Echinodermata', 'Annelida'], limit: 200, known: 40 },
    { key: 'rostliny', roots: ['Plantae'], limit: 700, known: 140 },
    { key: 'houby', roots: ['Fungi'], limit: 150, known: 30 }
];

// Domácí zvířata nemají ve Wikidatech taxonomickou úroveň (jsou podtřídou divokého druhu) – vybraná podle ID a podle názvu
const DOMESTIC_IDS = ['Q144', 'Q146', 'Q726', 'Q830', 'Q787', 'Q7368', 'Q2934', 'Q19707', 'Q780', 'Q9394', 'Q42710', 'Q16529344', 'Q3736439'];
const DOMESTIC = ['morče domácí', 'krocan domácí', 'lama krotká', 'velbloud dvouhrbý', 'bourec morušový', 'včela medonosná',
    'andulka vlnkovaná', 'zlatá rybka', 'holub domácí', 'alpaka'];
// Domácí zvířata, jejichž předky Wikidata přes podtřídu nenajdou: zařazení převezmou od divokého předka
const DOMESTIC_WILD = { Q144: 'Canis lupus', Q830: 'Bos primigenius', Q16529344: 'Anser anser', Q3736439: 'Anas platyrhynchos', Q780: 'Gallus gallus', Q7368: 'Ovis orientalis' };
// Pravěcí tvorové: sitelinky jsou u nich zkreslené roboty, známé jsou tyhle (rody)
const FAMOUS_PREHISTORIC = new Set(['Tyrannosaurus', 'Triceratops', 'Stegosaurus', 'Velociraptor', 'Diplodocus', 'Brachiosaurus', 'Spinosaurus',
    'Ankylosaurus', 'Iguanodon', 'Allosaurus', 'Parasaurolophus', 'Pteranodon', 'Apatosaurus', 'Brontosaurus', 'Pachycephalosaurus',
    'Plesiosaurus', 'Ichthyosaurus', 'Pterodactylus', 'Quetzalcoatlus', 'Giganotosaurus', 'Carnotaurus', 'Compsognathus', 'Oviraptor',
    'Gallimimus', 'Protoceratops', 'Argentinosaurus', 'Elasmosaurus', 'Liopleurodon', 'Deinonychus', 'Therizinosaurus', 'Dilophosaurus',
    'Maiasaura', 'Edmontosaurus', 'Microraptor', 'Baryonyx', 'Corythosaurus', 'Styracosaurus', 'Plateosaurus', 'Coelophysis', 'Dimorphodon']);
// Řád podle školní systematiky tam, kde se Wikidata liší (kytovci jsou tam uvnitř sudokopytníků)
const ORDER_OVERRIDES = { Cetacea: 'kytovci' };

// Naše příroda: běžné druhy české přírody (vědecká jména)
const NATIVE = new Set([
    // savci
    'Vulpes vulpes', 'Capreolus capreolus', 'Cervus elaphus', 'Sus scrofa', 'Lepus europaeus', 'Sciurus vulgaris', 'Erinaceus europaeus',
    'Erinaceus roumanicus', 'Meles meles', 'Lutra lutra', 'Castor fiber', 'Lynx lynx', 'Canis lupus', 'Martes martes', 'Martes foina',
    'Mustela erminea', 'Mustela nivalis', 'Talpa europaea', 'Apodemus sylvaticus', 'Myodes glareolus', 'Microtus arvalis',
    'Rattus norvegicus', 'Mus musculus', 'Glis glis', 'Cricetus cricetus', 'Ondatra zibethicus', 'Felis silvestris', 'Ursus arctos',
    'Dama dama', 'Ovis gmelini', 'Myotis myotis', 'Nyctalus noctula', 'Pipistrellus pipistrellus', 'Sorex araneus', 'Neomys fodiens',
    'Procyon lotor', 'Nyctereutes procyonoides', 'Alces alces', 'Rupicapra rupicapra', 'Marmota marmota', 'Muscardinus avellanarius',
    // ptáci
    'Parus major', 'Cyanistes caeruleus', 'Erithacus rubecula', 'Turdus merula', 'Turdus philomelos', 'Passer domesticus', 'Passer montanus',
    'Pica pica', 'Corvus corax', 'Corvus cornix', 'Corvus corone', 'Corvus frugilegus', 'Coloeus monedula', 'Garrulus glandarius',
    'Ciconia ciconia', 'Ciconia nigra', 'Ardea cinerea', 'Buteo buteo', 'Falco tinnunculus', 'Falco peregrinus', 'Accipiter gentilis',
    'Accipiter nisus', 'Milvus milvus', 'Haliaeetus albicilla', 'Aquila chrysaetos', 'Strix aluco', 'Bubo bubo', 'Asio otus', 'Athene noctua',
    'Tyto alba', 'Dendrocopos major', 'Dryocopus martius', 'Picus viridis', 'Hirundo rustica', 'Delichon urbicum', 'Apus apus',
    'Sturnus vulgaris', 'Fringilla coelebs', 'Carduelis carduelis', 'Chloris chloris', 'Pyrrhula pyrrhula', 'Emberiza citrinella',
    'Alauda arvensis', 'Motacilla alba', 'Sitta europaea', 'Troglodytes troglodytes', 'Phoenicurus ochruros', 'Oriolus oriolus',
    'Cuculus canorus', 'Upupa epops', 'Alcedo atthis', 'Cygnus olor', 'Anas platyrhynchos', 'Aythya fuligula', 'Fulica atra',
    'Gallinula chloropus', 'Phasianus colchicus', 'Perdix perdix', 'Tetrao urogallus', 'Columba palumbus', 'Columba livia',
    'Streptopelia decaocto', 'Chroicocephalus ridibundus', 'Vanellus vanellus', 'Grus grus', 'Phalacrocorax carbo', 'Podiceps cristatus',
    'Merops apiaster', 'Lanius collurio', 'Bombycilla garrulus', 'Aegithalos caudatus', 'Regulus regulus', 'Luscinia megarhynchos',
    // plazi a obojživelníci
    'Vipera berus', 'Natrix natrix', 'Coronella austriaca', 'Zamenis longissimus', 'Lacerta agilis', 'Lacerta viridis', 'Zootoca vivipara',
    'Anguis fragilis', 'Emys orbicularis', 'Bufo bufo', 'Bufotes viridis', 'Salamandra salamandra', 'Rana temporaria', 'Pelophylax esculentus',
    'Hyla arborea', 'Bombina bombina', 'Triturus cristatus', 'Lissotriton vulgaris', 'Ichthyosaura alpestris',
    // ryby
    'Cyprinus carpio', 'Salmo trutta', 'Esox lucius', 'Silurus glanis', 'Perca fluviatilis', 'Sander lucioperca', 'Anguilla anguilla',
    'Tinca tinca', 'Abramis brama', 'Rutilus rutilus', 'Carassius gibelio', 'Thymallus thymallus', 'Salmo salar', 'Oncorhynchus mykiss',
    'Lota lota', 'Barbus barbus', 'Squalius cephalus', 'Gobio gobio', 'Cottus gobio', 'Hypophthalmichthys molitrix',
    // hmyz a další bezobratlí
    'Apis mellifera', 'Lucanus cervus', 'Coccinella septempunctata', 'Melolontha melolontha', 'Papilio machaon', 'Aglais io', 'Aglais urticae',
    'Vanessa atalanta', 'Pieris brassicae', 'Gonepteryx rhamni', 'Iphiclides podalirius', 'Formica rufa', 'Vespa crabro', 'Vespula vulgaris',
    'Bombus terrestris', 'Pyrrhocoris apterus', 'Gryllus campestris', 'Cetonia aurata', 'Leptinotarsa decemlineata', 'Musca domestica',
    'Culex pipiens', 'Ixodes ricinus', 'Anax imperator', 'Calopteryx virgo', 'Mantis religiosa', 'Carabus auratus', 'Geotrupes stercorarius',
    'Lampyris noctiluca', 'Cerambyx cerdo', 'Rosalia alpina', 'Araneus diadematus', 'Argiope bruennichi', 'Tegenaria domestica',
    'Helix pomatia', 'Arion vulgaris', 'Lumbricus terrestris', 'Astacus astacus', 'Hirudo medicinalis', 'Porcellio scaber',
    // rostliny
    'Quercus robur', 'Quercus petraea', 'Fagus sylvatica', 'Picea abies', 'Pinus sylvestris', 'Betula pendula', 'Tilia cordata',
    'Tilia platyphyllos', 'Acer platanoides', 'Acer pseudoplatanus', 'Fraxinus excelsior', 'Abies alba', 'Larix decidua', 'Carpinus betulus',
    'Alnus glutinosa', 'Salix alba', 'Salix caprea', 'Populus tremula', 'Sorbus aucuparia', 'Sambucus nigra', 'Corylus avellana',
    'Rosa canina', 'Prunus spinosa', 'Crataegus monogyna', 'Taxus baccata', 'Juniperus communis', 'Ulmus glabra', 'Aesculus hippocastanum',
    'Robinia pseudoacacia', 'Taraxacum officinale', 'Bellis perennis', 'Leucanthemum vulgare', 'Papaver rhoeas', 'Centaurea cyanus',
    'Galanthus nivalis', 'Convallaria majalis', 'Anemone nemorosa', 'Pulsatilla vulgaris', 'Pulsatilla pratensis', 'Urtica dioica',
    'Plantago major', 'Plantago lanceolata', 'Matricaria chamomilla', 'Hypericum perforatum', 'Vaccinium myrtillus', 'Vaccinium vitis-idaea',
    'Fragaria vesca', 'Rubus idaeus', 'Rubus fruticosus', 'Viscum album', 'Hedera helix', 'Calluna vulgaris', 'Primula veris',
    'Trifolium pratense', 'Trifolium repens', 'Chelidonium majus', 'Equisetum arvense', 'Dryopteris filix-mas', 'Ranunculus acris',
    'Caltha palustris', 'Achillea millefolium', 'Tussilago farfara', 'Arnica montana', 'Atropa belladonna', 'Digitalis purpurea',
    'Lilium martagon', 'Cypripedium calceolus', 'Nymphaea alba', 'Typha latifolia', 'Phragmites australis', 'Leucojum vernum',
    'Hepatica nobilis', 'Viola odorata', 'Cichorium intybus', 'Malva sylvestris', 'Chamaenerion angustifolium', 'Impatiens noli-tangere',
    'Aconitum napellus', 'Gentiana asclepiadea', 'Daphne mezereum', 'Lamium album', 'Salvia pratensis', 'Thymus serpyllum',
    // houby
    'Boletus edulis', 'Boletus reticulatus', 'Amanita muscaria', 'Amanita phalloides', 'Amanita pantherina', 'Amanita rubescens',
    'Cantharellus cibarius', 'Macrolepiota procera', 'Armillaria mellea', 'Leccinum scabrum', 'Leccinum aurantiacum', 'Imleria badia',
    'Suillus luteus', 'Lactarius deliciosus', 'Morchella esculenta', 'Pleurotus ostreatus', 'Fomes fomentarius', 'Laetiporus sulphureus',
    'Coprinus comatus', 'Agaricus campestris', 'Russula emetica', 'Gyromitra esculenta', 'Calvatia gigantea', 'Hydnum repandum',
    'Craterellus cornucopioides', 'Rubroboletus satanas', 'Tylopilus felleus', 'Clitocybe nebularis', 'Phallus impudicus', 'Xerocomellus chrysenteron'
]);

const IUCN = {
    Q211005: 'LC', Q719675: 'NT', Q278113: 'VU', Q11394: 'EN', Q219127: 'CR', Q239509: 'EW', Q237350: 'EX', Q3245245: 'DD'
};

// --- 1. krok: kořeny stromu (podle vědeckého jména, při shodě jmen ten s nejvíce články) ---
const rootNames = [...new Set(CATEGORIES.flatMap(category => [...category.roots, ...(category.except || [])]))];
const roots = new Map(await cached('biologie-roots', async () => {
    const rows = await qlever(`SELECT ?t ?name ?sl WHERE { VALUES ?name { ${rootNames.map(name => `"${name}"`).join(' ')} } ?t wdt:P225 ?name . ?t wikibase:sitelinks ?sl }`);
    const best = new Map();
    for (const row of rows) {
        const sl = Number(row.sl.value);
        if (!best.has(row.name.value) || best.get(row.name.value).sl < sl) best.set(row.name.value, { q: id(row.t.value), sl });
    }
    return [...best].map(([name, { q }]) => [name, q]);
}));
for (const name of rootNames) if (!roots.has(name)) throw new Error(`Taxon ${name} ve Wikidatech není`);
console.log(`Kořeny: ${[...roots].map(([name, q]) => `${name}=${q}`).join(', ')}`);

// --- 2. krok: kandidáti – druhy (u pravěku i rody) s článkem na české Wikipedii a domácí zvířata ---
// Domácí zvířata podle českého názvu (při shodě názvů to s nejvíce články)
const domestic = new Map(await cached('biologie-domestic', async () => {
    const rows = await qlever(`SELECT ?item ?l ?sl WHERE { VALUES ?l { ${DOMESTIC.map(name => `"${name}"@cs`).join(' ')} } ?item rdfs:label ?l . ?item wikibase:sitelinks ?sl }`);
    const byId = await qlever(`SELECT ?item ?sl WHERE { VALUES ?item { ${values(DOMESTIC_IDS)} } ?item wikibase:sitelinks ?sl }`);
    const best = new Map(byId.map(row => [id(row.item.value), { q: id(row.item.value), sl: Number(row.sl.value) }]));
    for (const row of rows) {
        const sl = Number(row.sl.value);
        if (!best.has(row.l.value) || best.get(row.l.value).sl < sl) best.set(row.l.value, { q: id(row.item.value), sl });
    }
    console.log(`domácí zvířata: ${best.size} z ${DOMESTIC.length}`);
    return [...best.values()].map(({ q, sl }) => [q, sl]);
}));
const candidates = new Map(await cached('biologie-candidates', async () => {
    const result = new Map();
    for (const category of CATEGORIES) {
        for (const rootName of category.roots) {
            const ranks = category.genus ? `wd:${RANK.species} wd:${RANK.genus}` : `wd:${RANK.species}`;
            const rows = await qlever(`SELECT DISTINCT ?item ?sl WHERE {
  ?item wdt:P171+ wd:${roots.get(rootName)} . ?item wdt:P105 ?rank . VALUES ?rank { ${ranks} }
  ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?item wikibase:sitelinks ?sl }`);
            for (const row of rows) result.set(id(row.item.value), Number(row.sl.value));
            console.log(`${rootName}: ${rows.length}`);
            await sleep(300);
        }
    }
    return [...result];
}));
for (const [q, sl] of domestic) candidates.set(q, sl);

// --- 3. krok: podrobnosti a předkové po dávkách ---
const ordered = [...candidates.entries()].sort((a, b) => b[1] - a[1]).map(([qid]) => qid);
console.log(`Podrobnosti k ${ordered.length} kandidátům…`);
const SINGLE = { t: 1, n: 1, d: 1, im: 1, rm: 1, lat: 1, iucn: 1, edib: 1 };
const fetchDetails = async (list) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 200, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P181 ?v BIND("rm" AS ?p) }
  UNION { ?item wdt:P225 ?v BIND("lat" AS ?p) }
  UNION { ?item wdt:P141 ?v BIND("iucn" AS ?p) }
  UNION { ?item wdt:P789 ?v BIND("edib" AS ?p) }
  UNION { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?v BIND("mass" AS ?p) }
  UNION { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?v BIND("len" AS ?p) }
  UNION { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?v BIND("hgt" AS ?p) }
  UNION { ?item p:P2250/psn:P2250/wikibase:quantityAmount ?v BIND("life" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else entry[key] = [...(entry[key] || []), Number(v)];
    }, qlever);
    return result;
};
const details = new Map(await cached('biologie-details', async () => [...await fetchDetails(ordered)]));
// Kandidáti přidaní po uložení mezipaměti (třeba nová domácí zvířata) se dočtou zvlášť
const missingDetails = ordered.filter(qid => !details.has(qid));
if (missingDetails.length) for (const [qid, detail] of await fetchDetails(missingDetails)) details.set(qid, detail);
const lineage = new Map(await cached('biologie-lineage', async () => {
    const result = new Map(ordered.map(qid => [qid, []]));
    await inBatches(ordered, 150, (qids) => `SELECT ?item ?anc ?name ?rank ?label WHERE {
  VALUES ?item { ${values(qids)} }
  ?item wdt:P171+ ?anc . ?anc wdt:P225 ?name .
  OPTIONAL { ?anc wdt:P105 ?rank } OPTIONAL { ?anc rdfs:label ?label FILTER(LANG(?label) = "cs") }
}`, (row) => {
        const list = result.get(id(row.item.value));
        const q = id(row.anc.value);
        if (list.some(entry => entry.q === q)) return;
        list.push(compact({ q, name: row.name.value, rank: row.rank ? id(row.rank.value) : undefined, label: row.label ? row.label.value : undefined }));
    }, qlever);
    return [...result];
}));
// Domácí zvířata jsou podtřídou divokého druhu (P279) – předky dohledáme přes něj
const domesticLineage = new Map(await cached('biologie-domestic-lineage', async () => {
    const result = new Map([...domestic.keys()].map(qid => [qid, []]));
    const rows = await qlever(`SELECT ?item ?anc ?name ?rank ?label WHERE {
  VALUES ?item { ${values([...domestic.keys()])} }
  ?item (wdt:P171|wdt:P279)+ ?anc . ?anc wdt:P225 ?name .
  OPTIONAL { ?anc wdt:P105 ?rank } OPTIONAL { ?anc rdfs:label ?label FILTER(LANG(?label) = "cs") }
}`);
    for (const row of rows) {
        const list = result.get(id(row.item.value));
        const q = id(row.anc.value);
        if (list.some(entry => entry.q === q)) continue;
        list.push(compact({ q, name: row.name.value, rank: row.rank ? id(row.rank.value) : undefined, label: row.label ? row.label.value : undefined }));
    }
    return [...result];
}));
const lineageOfSpecies = (latin) => {
    const wild = [...details].find(([, detail]) => detail.lat === latin);
    return wild ? lineage.get(wild[0]) || [] : [];
};
for (const [qid, ancestors] of domesticLineage) {
    const wild = DOMESTIC_WILD[qid] ? lineageOfSpecies(DOMESTIC_WILD[qid]) : [];
    if (wild.length) lineage.set(qid, wild);
    else if (!(lineage.get(qid) || []).length) lineage.set(qid, ancestors);
}

const edibilityLabels = new Map(await cached('biologie-edibility', async () => {
    const ids = [...new Set([...details.values()].map(detail => detail.edib).filter(Boolean))];
    if (!ids.length) return [];
    const rows = await qlever(`SELECT ?item ?l WHERE { VALUES ?item { ${values(ids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`);
    return rows.map(row => [id(row.item.value), row.l.value]);
}));

// --- 4. krok: položky ---
const categoryOf = (ancestors) => {
    const names = new Set(ancestors.map(ancestor => ancestor.name));
    const category = CATEGORIES.find(c => c.roots.some(root => names.has(root)) && !(c.except || []).some(name => names.has(name)));
    return category ? category.key : null;
};
// Třída, řád, čeleď: český název, jinak vědecký
const levelOf = (ancestors, rank) => {
    if (rank === RANK.order) {
        const override = Object.keys(ORDER_OVERRIDES).find(name => ancestors.some(ancestor => ancestor.name === name));
        if (override) return ORDER_OVERRIDES[override];
    }
    const ancestor = ancestors.find(entry => entry.rank === rank);
    return ancestor ? (ancestor.label || ancestor.name) : undefined;
};
const CATEGORY_ONE = { savci: 'savec', ptaci: 'pták', plazi: 'plaz', ryby: 'ryba', hmyz: 'hmyz', bezobratli: 'bezobratlý', rostliny: 'rostlina', houby: 'houba', pravek: 'pravěk' };
const max = (list) => list && list.length ? Math.max(...list) : undefined;
const round = (value, digits) => value === undefined ? undefined : Number(value.toPrecision(digits));
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const items = [];
const rankByCategory = {};
const names = new Set();
for (const qid of ordered) {
    const detail = details.get(qid);
    const ancestors = lineage.get(qid) || [];
    const category = categoryOf(ancestors);
    if (!category || !detail.t || !detail.n || !detail.im) continue;
    const genus = (detail.lat || '').split(' ')[0];
    const isFamousPrehistoric = category === 'pravek' && FAMOUS_PREHISTORIC.has(genus);
    // Bez českého jména (jen vědecké) nejde o druh, který by Čech znal; pravěcí tvorové se jmenují latinsky i česky
    if (category !== 'pravek' && detail.lat && detail.n.toLowerCase() === detail.lat.toLowerCase()) continue;
    let name = capitalize(detail.n);
    // Stejné jméno u různých organismů (liška obecná šelma i houba): druhý dostane upřesnění
    if (names.has(name.toLowerCase())) {
        const other = items.find(item => item.n.toLowerCase() === name.toLowerCase());
        if (!other || other.c === category) continue;
        name = `${name} (${CATEGORY_ONE[category]})`;
    }
    const settings = CATEGORIES.find(c => c.key === category);
    const isNative = NATIVE.has(detail.lat);
    const isDomestic = domestic.has(qid);
    const rank = rankByCategory[category] || 0;
    if (rank >= settings.limit && !isNative && !isDomestic && !isFamousPrehistoric) continue;
    rankByCategory[category] = rank + 1;
    names.add(name.toLowerCase());
    const ancestorNames = new Set(ancestors.map(ancestor => ancestor.name));
    const life = max(detail.life);
    const rangeMap = imageFields(detail.rm);
    items.push(compact({
        q: qid,
        t: detail.t,
        n: name,
        c: category,
        k: (category === 'pravek' ? isFamousPrehistoric : rank < settings.known) || isNative || isDomestic ? 1 : 0,
        d: detail.d,
        cz: isNative ? 1 : undefined,
        ...imageFields(detail.im),
        rm: rangeMap.im,
        rh: rangeMap.ih,
        f: compact({
            lat: detail.lat,
            cls: levelOf(ancestors, RANK.class),
            ord: levelOf(ancestors, RANK.order),
            fam: levelOf(ancestors, RANK.family),
            iucn: IUCN[detail.iucn],
            mass: round(max(detail.mass), 3),
            len: round(max(detail.len), 3),
            hgt: round(max(detail.hgt), 3),
            life: life ? Math.round(life / 31557600) || undefined : undefined,
            edib: detail.edib ? edibilityLabels.get(detail.edib) : undefined
        }),
        // Pro okruhy: vědecká jména předků a domácí zvíře
        anc: ancestorNames,
        dom: isDomestic
    }));
}

// --- 5. krok: okruhy ---
const under = (...taxa) => (item) => taxa.some(name => item.anc.has(name));
const BY_NAME = { by: 'name' };
const COLLECTIONS = [
    { id: 'nase-priroda', label: 'Naše příroda', text: 'Zvířata, rostliny a houby, které potkáš v Česku', test: item => item.cz === 1 },
    { id: 'domaci-zvirata', label: 'Domácí zvířata', test: item => item.dom },
    { id: 'selmy', label: 'Šelmy', test: under('Carnivora') },
    { id: 'hlodavci', label: 'Hlodavci', test: under('Rodentia') },
    { id: 'primati', label: 'Primáti', test: under('Primates') },
    { id: 'kytovci', label: 'Kytovci', text: 'Velryby, delfíni a sviňuchy', test: under('Cetacea') },
    { id: 'sudokopytnici', label: 'Sudokopytníci', text: 'Bez kytovců', test: item => under('Artiodactyla')(item) && !under('Cetacea')(item) },
    { id: 'lichokopytnici', label: 'Lichokopytníci', test: under('Perissodactyla') },
    { id: 'letouni', label: 'Letouni', test: under('Chiroptera') },
    { id: 'vacnatci', label: 'Vačnatci', test: under('Marsupialia') },
    { id: 'dravci', label: 'Dravci', test: under('Accipitriformes', 'Falconiformes') },
    { id: 'sovy', label: 'Sovy', test: under('Strigiformes') },
    { id: 'pevci', label: 'Pěvci', test: under('Passeriformes') },
    { id: 'vrubozobi', label: 'Vrubozobí', text: 'Kachny, husy a labutě', test: under('Anseriformes') },
    { id: 'papousci', label: 'Papoušci', test: under('Psittaciformes') },
    { id: 'hadi', label: 'Hadi', test: under('Serpentes') },
    { id: 'zelvy', label: 'Želvy', test: under('Testudines') },
    { id: 'obojzivelnici', label: 'Obojživelníci', test: under('Amphibia') },
    { id: 'zraloci', label: 'Žraloci', test: under('Selachimorpha', 'Selachii') },
    { id: 'motyli', label: 'Motýli', test: under('Lepidoptera') },
    { id: 'brouci', label: 'Brouci', test: under('Coleoptera') },
    { id: 'blanokridli', label: 'Blanokřídlí', text: 'Včely, vosy, čmeláci a mravenci', test: under('Hymenoptera') },
    { id: 'pavoukovci', label: 'Pavoukovci', test: under('Arachnida') },
    { id: 'mekkysi', label: 'Měkkýši', test: under('Mollusca') },
    { id: 'jehlicnany', label: 'Jehličnany', test: under('Pinopsida', 'Pinales', 'Pinophyta') },
    { id: 'ruzovite', label: 'Růžovité', test: under('Rosaceae') },
    { id: 'hvezdnicovite', label: 'Hvězdnicovité', test: under('Asteraceae') },
    { id: 'lipnicovite', label: 'Trávy (lipnicovité)', test: under('Poaceae') },
    { id: 'orchideje', label: 'Orchideje (vstavačovité)', test: under('Orchidaceae') },
    { id: 'bobovite', label: 'Bobovité', test: under('Fabaceae') },
    { id: 'kaktusy', label: 'Kaktusy', test: under('Cactaceae') },
    { id: 'jedle-houby', label: 'Jedlé houby', test: item => item.c === 'houby' && /^jedl/u.test(item.f.edib || '') },
    { id: 'jedovate-houby', label: 'Jedovaté houby', test: item => item.c === 'houby' && /jedovat|smrteln/u.test(item.f.edib || '') },
    { id: 'dinosauri', label: 'Dinosauři', test: item => item.c === 'pravek' && under('Dinosauria')(item) },
    { id: 'ohrozene', label: 'Ohrožené druhy', text: 'Ohrožené a kriticky ohrožené podle IUCN', test: item => ['EN', 'CR', 'EW'].includes(item.f.iucn) },
    { id: 'vyhynule', label: 'Vyhynulé druhy', text: 'Vyhynulé v posledních staletích (IUCN)', test: item => item.f.iucn === 'EX' }
].map(collection => ({ sort: BY_NAME, ...collection }));
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS
    .map(({ test, ...collection }) => collection)
    .filter(collection => items.filter(item => (item.g || []).includes(collection.id)).length >= 5);
for (const item of items) { delete item.anc; delete item.dom; }

for (const category of CATEGORIES) {
    const inCategory = items.filter(item => item.c === category.key);
    console.log(`${category.key}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.rm).length} s mapou rozšíření)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);
const missingNative = [...NATIVE].filter(name => !items.some(item => item.f.lat === name));
if (missingNative.length) console.log(`Naše příroda – chybí: ${missingNative.join(', ')}`);

writeTopic('biologie', { collections, items });
