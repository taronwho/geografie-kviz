// Téma Jídlo a pití: data/jidlo.json z Wikidat – pokrmy, pečivo a sladkosti, sýry, ovoce, zelenina, koření a byliny,
// nealkoholické nápoje, víno, pivo a destiláty, kuchaři a gastronomové
// Spuštění: npm run build:jidlo (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
//
// Položky: ručně vybrané články české Wikipedie (scripts/lib/jidlo-lists.mjs; known = zná je většina lidí) a k nim méně známé
// z tříd Wikidat (AUTO: sýry, odrůdy révy, pivní styly, pálenky, likéry, koktejly, kávové nápoje, čaje, kuchaři).
// Známost: ruční seznam (k = 1), jinak počet jazykových verzí článku (sitelinks, české položky ×3); návštěvnost české Wikipedie
// z tohoto prostředí stáhnout nejde. Fakta z Wikidat: země původu (P495), suroviny (P186), kuchyně (P2012), chod (P8431),
// vznik (P571), obsah alkoholu (P2665), barva (P462), vědecký název a čeleď rostliny (P225, P1582, P171); u osob život,
// státní občanství a povolání.
import { LISTS } from './lib/jidlo-lists.mjs';
import { sparql, qlever, id, values, imageFields, thumbHash, yearOf, compact, cached, writeTopic, readCountries, sleep } from './lib/wikidata.mjs';

const CATEGORIES = Object.keys(LISTS);
// Česko, Československo, České království, Čechy, Morava; Slovensko
const CZECH = new Set(['Q213', 'Q33946', 'Q42585', 'Q39193', 'Q43266', 'Q1350']);
const SLOVAK = new Set(['Q214']);
const FEMALE = 'Q6581072';
const THIS_YEAR = new Date().getFullYear();
// Značky a výrobky (fotka lahve či obalu s názvem by odpověď prozradila, OCR fotek tu neběží): z tříd se nepřidávají
const BRAND_CLASSES = new Set(['Q167270', 'Q431289', 'Q2424752', 'Q1802801', 'Q17537576', 'Q16323605', 'Q61470', 'Q11410']);
// Obecné pojmy z tříd, které nejsou položkou k hádání (Druhy piv, Čerstvý sýr…)
const AUTO_SKIP = /^(Druhy|Seznam|Čerstvý sýr|Tvrdý sýr|Měkký sýr|Ovčí sýr|Kozí sýr|Smetanový sýr|Polotvrdý sýr|Kávový nápoj|Čaj|Káva|Likér|Pálenka|Koktejl|Pivo|Víno)$/u;
// Fotky, které ukazují něco jiného nebo nesou název (ručně ověřené): položka zůstane bez fotky
const NO_PHOTO = new Set(['Q742408']);
// Z tříd ručně vyřazené: značky a výrobky (lahev s etiketou), jiné názvy či podoby už zařazené položky (Mozzarella di Bufala vedle
// mozzarelly, Trolínské = Modrý Portugal), články o něčem jiném (Elixír = léková forma, České pivo = dějiny piva) a herci
const AUTO_EXCLUDE = new Set(['Cointreau', 'Amarula', 'Chartreuse', 'Rīgas Melnais balzams', 'Unicum', 'Vana Tallinn', 'Galliano', 'Goldwasser', 'Elixír',
    'České pivo', 'Žigulovské', 'Mozzarella di Bufala Campana', 'Le Touarég', 'Výběrová káva', 'Trolínské', 'David Burtka']);
// Skutečná fotka z Commons u známých položek, které mají ve Wikidatech jen PNG, GIF či TIFF (koláž, kresba) nebo žádnou (ručně vybrané)
const PHOTO_OVERRIDES = {
    Q187495: 'Baklava 1.jpg', Q209889: 'Mascarpone 2.jpg', Q7229863: 'Cucurbita 2011 G1.jpg', Q1111359: 'Salvia officinalis close up.jpg',
    Q2370943: 'Dried bay leaves.jpg', Q715858: 'A bubble tea with tapioca pearls, July 2018.jpg', Q1827: 'Red Wine Glass.jpg', Q355751: 'M-A-Careme.jpg',
    // Stejná fotka jako jiná položka (Dort = Schwarzwaldský dort, Kuře na paprice = Paprikáš, Kapusta = Zelí, Oplatka = Zmrzlina) nebo jiné jídlo
    // (Halušky = boršč s haluškami)
    Q130186: 'Torte 1a.jpg', Q645522: 'Chicken paprikash.jpg', Q14328596: 'Brassica oleracea var. sabauda JdP.jpg',
    Q117072235: 'Milk flavored peanut wafer biscuits.jpg', Q1575225: 'Halušky s klobásou.jpg'
};
// Země původu podle QID, kde ji Wikidata mají špatně (Španělský ptáček „ze Švýcarska“)
const LAND_FIXES = { Q9293083: ['Česko', 'Q213'] };

// Druhy podle štítků v seznamech: štítek u otázky (ty) a okruh
const TYPES = {
    polevka: 'polévka', omacka: 'omáčka', salat: 'salát', testoviny: 'těstoviny', fast: '',
    pecivo: 'pečivo', sladke: 'sladké pečivo', zakusek: 'zákusek', dort: 'dort', dezert: 'dezert', mrazeny: 'mražený dezert',
    cukrovinka: 'cukrovinka', cukrovi: 'cukroví', plisen: 'plísňový sýr',
    malvice: 'ovoce', peckovice: 'ovoce', bobule: 'drobné ovoce', citrus: 'citrus', tropicke: 'tropické ovoce', orech: 'ořech',
    odruda: '', koren: 'kořenová zelenina', hlizy: 'hlíza', plod: 'plodová zelenina', cibule: 'cibulová zelenina',
    kostal: 'košťálová zelenina', list: 'listová zelenina', lusten: 'luštěnina', houba: 'jedlá houba', rasa: 'jedlá řasa',
    koreni: 'koření', bylina: 'bylinka', smes: 'směs koření', dochucovadlo: 'dochucovadlo',
    kava: 'kávový nápoj', caj: 'čaj', limo: 'nealkoholický nápoj', mleko: 'mléčný nápoj',
    pivo: 'pivo', vino: 'víno', destilat: 'destilát', liker: 'likér', koktejl: 'koktejl'
};
// Štítek u osob podle pohlaví
const PERSON_TYPES = {
    '': ['kuchař', 'kuchařka'], autor: ['autor kuchařek', 'autorka kuchařek'], znacka: ['podnikatel', 'podnikatelka'],
    sladek: ['sládek', 'sládková'], cukrar: ['cukrář', 'cukrářka'], gastronom: ['gastronom', 'gastronomka'], vynalezce: ['vynálezce', 'vynálezkyně'],
    statnik: ['státník', 'státnice']
};

// Méně známé položky z tříd Wikidat: [kategorie, vzor pro ?item, nejmenší počet jazykových verzí, štítek]
const AUTO = [
    ['syry', '?item (wdt:P31|wdt:P279)/wdt:P279* wd:Q10943 .', 12, ''],
    ['alkohol', '?item wdt:P31 wd:Q958314 .', 8, 'odruda'],
    ['alkohol', '{ ?item wdt:P31 wd:Q1998962 } UNION { ?item wdt:P279 wd:Q44 } .', 12, 'pivo'],
    ['alkohol', '?item wdt:P279+ wd:Q56139 .', 16, 'destilat'],
    ['alkohol', '?item wdt:P279+ wd:Q178780 .', 16, 'liker'],
    ['alkohol', '{ ?item wdt:P31 wd:Q134768 } UNION { ?item wdt:P279 wd:Q134768 } .', 22, 'koktejl'],
    ['napoje', '?item wdt:P279+ wd:Q37756327 .', 14, 'kava'],
    ['napoje', '?item wdt:P279+ wd:Q6097 .', 14, 'caj'],
    ['kuchari', '?item wdt:P31 wd:Q5 ; wdt:P106 ?job . VALUES ?job { wd:Q3499072 wd:Q156839 } .', 12, '']
];

// --- Načtení ---

const lit = (text) => `${JSON.stringify(text)}@cs`;
const parseEntry = (entry) => {
    const [spec, tagText = ''] = entry.split('#');
    const [title, name] = spec.split('=');
    return { title, name: name || null, tags: tagText.split(',').map(tag => tag.trim()).filter(Boolean) };
};

// Ruční seznamy: název článku → QID
const listed = [];
for (const category of CATEGORIES) {
    for (const [level, entries] of [['known', LISTS[category].known], ['more', LISTS[category].more]]) {
        for (const entry of entries) listed.push({ category, known: level === 'known', ...parseEntry(entry) });
    }
}
console.log(`Ruční seznamy: ${listed.length} položek`);
const titleRows = await cached('jidlo-tituly', async () => {
    const rows = [];
    const titles = [...new Set(listed.map(entry => entry.title))];
    for (let i = 0; i < titles.length; i += 80) {
        const batch = titles.slice(i, i + 80);
        rows.push(...await sparql(`SELECT ?title ?item WHERE { VALUES ?title { ${batch.map(lit).join(' ')} }
            ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?title . }`));
        await sleep(400);
    }
    return rows.map(row => [row.title.value, id(row.item.value)]);
});
const qidOfTitle = new Map(titleRows);
const missing = listed.filter(entry => !qidOfTitle.has(entry.title));
if (missing.length) console.warn(`  bez článku: ${missing.map(entry => entry.title).join(', ')}`);

// Z tříd Wikidat
const autoRows = await cached('jidlo-auto', async () => {
    const rows = [];
    for (const [category, pattern, min, tag] of AUTO) {
        const found = await sparql(`SELECT DISTINCT ?item ?sl WHERE { ${pattern}
            ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> . ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${min}) }`);
        console.log(`  ${category} ${tag || ''}: ${found.length}`);
        rows.push(...found.map(row => [category, id(row.item.value), tag]));
        await sleep(800);
    }
    return rows;
});

// Kandidáti: ruční seznamy mají přednost (kategorie, název, štítky), první výskyt vyhrává
const candidates = new Map();
for (const entry of listed) {
    const q = qidOfTitle.get(entry.title);
    if (q && !candidates.has(q)) candidates.set(q, { q, ...entry, listed: true });
}
for (const [category, q, tag] of autoRows) {
    if (!candidates.has(q)) candidates.set(q, { q, category, known: false, name: null, tags: tag ? [tag] : [], listed: false });
}
const qids = [...candidates.keys()];
console.log(`Kandidátů: ${qids.length}`);

// Základ: český článek, počet jazykových verzí, fotky, krátký popis. Ze všech fotek (P18) přednost má skutečná fotka (JPEG):
// PNG, SVG, GIF či TIFF bývá mapa, kresba nebo logo a hra ho jako nápovědu neukáže (quiz-core.js isRealPhoto)
const isRealPhoto = (url) => /\.(jpe?g|webp)$/i.test(url || '');
const basics = await cached('jidlo-zaklad-fotky', async () => {
    const rows = [];
    for (let i = 0; i < qids.length; i += 120) {
        rows.push(...await sparql(`SELECT ?item ?title ?sl (GROUP_CONCAT(DISTINCT STR(?img); separator="|") AS ?ims) (SAMPLE(?d) AS ?desc) WHERE { VALUES ?item { ${values(qids.slice(i, i + 120))} }
            ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?title . ?item wikibase:sitelinks ?sl .
            OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?item schema:description ?d FILTER(lang(?d) = 'cs') } } GROUP BY ?item ?title ?sl`));
        await sleep(400);
    }
    return rows.map(row => {
        const images = row.ims && row.ims.value ? row.ims.value.split('|').sort() : [];
        return { q: id(row.item.value), title: row.title.value, sl: Number(row.sl.value), im: images.find(isRealPhoto) || images[0] || '', d: row.desc ? row.desc.value : '' };
    });
});

// Vlastnosti (dlouhý tvar: položka, vlastnost, hodnota, český název hodnoty)
const PROPS = ['P31', 'P279', 'P495', 'P186', 'P2012', 'P8431', 'P571', 'P2665', 'P462', 'P225', 'P1582', 'P27', 'P106', 'P569', 'P570', 'P21', 'P171', 'P105'];
const claims = await cached('jidlo-vlastnosti', async () => {
    const rows = [];
    for (let i = 0; i < qids.length; i += 60) {
        const found = await sparql(`SELECT ?item ?prop ?v ?vl WHERE { VALUES ?item { ${values(qids.slice(i, i + 60))} }
            VALUES ?prop { ${PROPS.map(p => `wdt:${p}`).join(' ')} } ?item ?prop ?v .
            OPTIONAL { ?v rdfs:label ?vl FILTER(lang(?vl) = 'cs') } }`);
        rows.push(...found.map(row => [id(row.item.value), id(row.prop.value), row.v.type === 'uri' ? id(row.v.value) : row.v.value, row.vl ? row.vl.value : '']));
        process.stdout.write(`  vlastnosti ${Math.min(i + 60, qids.length)}/${qids.length}\r`);
        await sleep(400);
    }
    return rows;
});
const claimsOf = new Map();
for (const [q, prop, value, label] of claims) {
    if (!claimsOf.has(q)) claimsOf.set(q, {});
    const bag = claimsOf.get(q);
    (bag[prop] = bag[prop] || []).push({ v: value, l: label });
}
const get = (q, prop) => (claimsOf.get(q) || {})[prop] || [];
const labels = (q, prop) => [...new Set(get(q, prop).map(value => value.l).filter(Boolean))];

// Rostliny: vědecký název a čeleď (položka je taxon, nebo plodem taxonu P1582)
const taxonOf = (q) => get(q, 'P225').length ? q : ((get(q, 'P1582')[0] || {}).v || null);
const taxa = [...new Set(qids.map(taxonOf).filter(Boolean))];
const taxonInfo = await cached('jidlo-taxony', async () => {
    // Předci po čeleď přes QLever (cesta P171* na query.wikidata.org vyprší)
    const rows = [];
    for (let i = 0; i < taxa.length; i += 80) {
        rows.push(...await qlever(`SELECT ?t ?lat ?faml WHERE { VALUES ?t { ${values(taxa.slice(i, i + 80))} }
            OPTIONAL { ?t wdt:P225 ?lat }
            OPTIONAL { ?t wdt:P171* ?fam . ?fam wdt:P105 wd:Q35409 . ?fam rdfs:label ?faml FILTER(LANG(?faml) = "cs") } }`));
        await sleep(400);
    }
    return rows.map(row => [id(row.t.value), row.lat ? row.lat.value : '', row.faml ? row.faml.value : '']);
});
const taxonById = new Map();
for (const [t, lat, fam] of taxonInfo) {
    const entry = taxonById.get(t) || { lat: '', fam: '' };
    taxonById.set(t, { lat: entry.lat || lat, fam: entry.fam || fam });
}

// --- Položky ---

const countries = readCountries();
const stripBrackets = (text) => String(text || '').replace(/\s*\([^)]*\)/g, '').trim();
// Suroviny (P186): obecná slova, latinské a chemické názvy pryč, rostlina → potravina (lilek brambor → brambor)
const MATERIAL_SKIP = new Set(['voda', 'teplá voda', 'pitná voda', 'led', 'kostka ledu', 'potravina', 'surovina', 'ingredience', 'jídlo', 'potravinová přísada',
    'ochucovadlo', 'chuť', 'nadívání', 'zvýrazňovač chuti', 'sladidlo', 'Saccharomyces cerevisiae', 'Penicillium roqueforti', 'Syzygium', 'Theobromin',
    'theofylin', 'stimulans', 'třísloviny', 'Coconut jelly', 'SCOBY', 'Dedo', 'rostlinný materiál', 'plod', 'list', 'slupka', 'borka', 'pupen', 'halit',
    'žula', 'sud', 'ovoce', 'zelenina', 'omáčka', 'bobule', 'lák', 'pekařský výrobek', 'těsto z tuku, vajec, cukru a mouky', 'žvýkačková báze', 'maltóza',
    'glukóza', 'sacharóza', 'kypřidlo', 'kypřicí prášek', 'hydrogenuhličitan sodný', 'poleva', 'skladokaz moučný', 'kofein', 'koření']);
const MATERIAL_NAMES = {
    'lilek brambor': 'brambor', 'rajče jedlé': 'rajče', 'cibule kuchyňská': 'cibule', 'cibule zimní': 'cibule', 'bazalka pravá': 'bazalka',
    'bedrník anýz': 'anýz', 'pepřovník černý': 'pepř', 'tamarind indický': 'tamarind', 'slivoň švestka': 'švestka', 'ječmen setý': 'ječmen',
    'chmel otáčivý': 'chmel', 'locika setá': 'hlávkový salát', 'brukev zelná': 'zelí', 'řepa obecná': 'řepa', 'fazol zahradní': 'fazole',
    'ředkev setá bílá': 'ředkev', 'kávovník statný': 'káva', 'třtinovník cukrový': 'cukrová třtina', 'agáve modrá': 'agáve', 'yzop lékařský': 'yzop',
    'saturejka zahradní': 'saturejka', 'buvol domácí': 'buvolí mléko', 'Tuňák': 'tuňák', 'Palmový cukr': 'palmový cukr', 'slepičí vejce': 'vejce',
    'badyáník pravý': 'badyán', 'Čokoládová zmrzlina': 'čokoládová zmrzlina', 'Ricotta': 'ricotta', 'Pecorino': 'pecorino', 'Ementál': 'ementál',
    'Camembert': 'camembert', 'Raclette': 'raclette', 'Tempeh': 'tempeh', 'Guanciale': 'guanciale', 'Grenadina': 'grenadina'
};
const materialsOf = (q) => [...new Set(labels(q, 'P186').map(label => MATERIAL_NAMES[label] || label).filter(label => !MATERIAL_SKIP.has(label)))].slice(0, 4);
// Krátké popisy z Wikidat s chybou nebo jen „druh rostliny“ (u plodu či zeleniny matou): oprava podle QID, jinak druh položky
const DESCRIPTION_FIXES = { Q1150728: 'tradiční způsob přípravy a podávání kávy' };
const PLANT_DESCRIPTION = /^(druh|rod|rostlinný druh|druh rostliny|druh rostlin|druh stromu|rostlina|taxon)\b/u;
// Jen rostlinné čeledi (-ovité): u medu je „čeledí“ včela
// Země původu: dnešní stát z tabulky států (pro otázku „Odkud pochází?“) a název do faktů
const originOf = (q) => {
    const list = get(q, 'P495').filter(value => value.l);
    const modern = list.filter(value => countries[value.v]);
    return { names: [...new Set(list.map(value => value.l))].slice(0, 2), modern: [...new Set(modern.map(value => value.v))] };
};
const yearFrom = (q, prop) => {
    const years = get(q, prop).map(value => yearOf(value.v)).filter(year => Number.isInteger(year));
    return years.length ? Math.min(...years) : undefined;
};
const typeFromTags = (tags) => tags.map(tag => TYPES[tag]).find(type => type !== undefined && type !== '') || '';
const PLANT_CATEGORIES = new Set(['ovoce', 'zelenina', 'koreni']);
// Obsah alkoholu: Wikidata ho mají v procentech, někdy jako podíl (0,4)
const abvOf = (q) => {
    const raw = Number((get(q, 'P2665')[0] || {}).v);
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    const pct = raw < 1 ? raw * 100 : raw;
    return pct <= 96 ? Math.round(pct * 10) / 10 : undefined;
};

const items = [];
const skipped = [];
for (const base of basics) {
    const cand = candidates.get(base.q);
    if (!cand) continue;
    const q = base.q;
    const classes = new Set([...get(q, 'P31'), ...get(q, 'P279')].map(value => value.v));
    const isHuman = classes.has('Q5');
    const brand = [...classes].some(cls => BRAND_CLASSES.has(cls));
    const name = cand.name || stripBrackets(base.title);
    if (!cand.listed && (brand || AUTO_SKIP.test(name) || AUTO_EXCLUDE.has(name) || !base.im || /značk/u.test(base.d))) { skipped.push(name); continue; }
    // Z tříd jen ti, kdo jsou kuchaři hlavně (P106 kuchař mají i herci, sportovci a dozorce z koncentračního tábora)
    if (!cand.listed && cand.category === 'kuchari' && !/kuchař|cukrář|gastronom|restaurat/u.test(base.d)) { skipped.push(name); continue; }
    if (cand.category === 'kuchari' && !isHuman) { skipped.push(name); continue; }
    if (cand.category !== 'kuchari' && isHuman) { skipped.push(name); continue; }
    const photo = NO_PHOTO.has(q) ? {} : Object.hasOwn(PHOTO_OVERRIDES, q) ? { im: PHOTO_OVERRIDES[q], ih: thumbHash(PHOTO_OVERRIDES[q]) } : imageFields(base.im);
    // Méně známá položka bez skutečné fotky (jen mapa, logo či kresba) by byla otázka bez obrazové nápovědy
    if (!cand.known && !isRealPhoto(photo.im)) { skipped.push(`${name} (bez fotky)`); continue; }
    const origin = Object.hasOwn(LAND_FIXES, q) ? { names: [LAND_FIXES[q][0]], modern: [LAND_FIXES[q][1]] } : originOf(q);
    const tags = cand.tags;
    const f = {};
    let cz = tags.includes('cz') || origin.modern.some(country => CZECH.has(country)) || get(q, 'P495').some(value => CZECH.has(value.v));
    let sk = origin.modern.some(country => SLOVAK.has(country));
    let ty = typeFromTags(tags);
    let sx;
    if (isHuman) {
        const born = yearFrom(q, 'P569');
        const died = yearFrom(q, 'P570');
        if (born === undefined) { skipped.push(`${name} (bez roku narození)`); continue; }
        sx = get(q, 'P21').some(value => value.v === FEMALE) ? 'f' : undefined;
        const lands = labels(q, 'P27').map(label => label === 'Spojené státy americké' ? label : label).slice(0, 2);
        const czech = get(q, 'P27').some(value => CZECH.has(value.v));
        cz = cz || czech;
        const role = Object.keys(PERSON_TYPES).find(key => key && tags.includes(key)) || '';
        ty = PERSON_TYPES[role][sx === 'f' ? 1 : 0];
        Object.assign(f, compact({ born, died, land: lands.join(', '), y: Math.min(born + 40, died ?? THIS_YEAR) }));
        const jobs = labels(q, 'P106').filter(job => !/^(kuchař|kuchařka|šéfkuchař|šéfkuchařka)$/u.test(job)).slice(0, 3);
        if (jobs.length) f.jobs = jobs;
    } else {
        const taxon = taxonOf(q);
        const plant = taxon ? taxonById.get(taxon) : null;
        const materials = materialsOf(q);
        // Odrůdy révy: země původu ve Wikidatech hromadně „Itálie, Francie“ (i u Syrahu), rok je rok registrace – obojí pryč;
        // u sýrů a vín je rok obvykle rokem chráněného označení původu (Sherry 1933)
        const grape = classes.has('Q958314');
        const noYear = grape || cand.category === 'syry' || tags.includes('vino');
        if (grape) { origin.names = []; origin.modern = []; }
        Object.assign(f, compact({
            land: origin.names.join(', '),
            cuisine: labels(q, 'P2012').slice(0, 2).join(', '),
            mat: materials,
            course: labels(q, 'P8431').slice(0, 2).join(', '),
            // Rok vzniku jen od roku 1500 (dřív jde o pověsti: preclík 610) a ne u odrůd révy (Wikidata u nich mají rok registrace)
            year: (() => { const year = yearFrom(q, 'P571'); return year && year >= 1500 && year <= THIS_YEAR && !noYear ? year : undefined; })(),
            abv: abvOf(q),
            color: labels(q, 'P462').slice(0, 2).join(', '),
            lat: PLANT_CATEGORIES.has(cand.category) && plant && /ité$/u.test(plant.fam) ? plant.lat : undefined,
            fam: PLANT_CATEGORIES.has(cand.category) && plant && /ité$/u.test(plant.fam) ? plant.fam : undefined
        }));
        if (origin.modern.length === 1) f.co = origin.modern[0];
        if (!ty && cand.category === 'syry') ty = 'sýr';
        if (!ty && cand.category === 'alkohol' && grape) ty = 'odrůda vinné révy';
        if (!ty && cand.category === 'ovoce' && tags.includes('odruda')) ty = /hrušn/u.test(labels(q, 'P279').join(' ') + labels(q, 'P31').join(' ')) ? 'odrůda hrušně' : 'odrůda jablka';
    }
    // Popis začínající velkým přídavným jménem („Japonský zelený čaj“, „Italský chléb“) jako ostatní malým písmenem
    let d = (DESCRIPTION_FIXES[q] || base.d).replace(/^(\p{Lu})(\p{Ll}+(?:ský|ská|ské|cký|cká|cké|ní)\s)/u, (all, first, rest) => first.toLocaleLowerCase('cs') + rest);
    if (PLANT_CATEGORIES.has(cand.category) && PLANT_DESCRIPTION.test(d)) d = ty || '';
    items.push(compact({
        q, t: base.title, n: name, c: cand.category, k: cand.known ? 1 : 0, ty, d,
        ...photo, f, sx, cz: cz ? 1 : undefined, sk: sk ? 1 : undefined, sl: base.sl, tags, listed: cand.listed || undefined
    }));
}
console.log(`Položek: ${items.length}, vynecháno: ${skipped.length}`);
if (skipped.length) console.log(`  ${skipped.slice(0, 60).join(', ')}`);

// Stejný název dvakrát (Pecorino je sýr i odrůda révy): drží se ruční položka, z tříd první
const seenNames = new Set(items.filter(item => item.listed).map(item => item.n.toLowerCase()));
for (let i = 0; i < items.length; i++) {
    if (items[i].listed) continue;
    const key = items[i].n.toLowerCase();
    if (seenNames.has(key)) { skipped.push(`${items[i].n} (stejný název)`); items.splice(i, 1); i--; } else seenNames.add(key);
}

// --- Okruhy ---

const tagged = (...tags) => (item) => (item.tags || []).some(tag => tags.includes(tag));
const landIs = (...names) => (item) => String(item.f.land || '').split(', ').some(land => names.includes(land));
const continentOf = (item) => item.f.co && countries[item.f.co] ? countries[item.f.co].continent : '';
const BY_NAME = { by: 'name' };
const COLLECTIONS = [
    { id: 'ceska-kuchyne', label: 'Česká kuchyně', text: 'Svíčková, knedlíky, kulajda a další české pokrmy', test: item => item.c === 'pokrmy' && item.cz },
    { id: 'italska-kuchyne', label: 'Italská kuchyně', test: item => ['pokrmy', 'sladkosti'].includes(item.c) && landIs('Itálie', 'Italské království')(item) },
    { id: 'asijska-kuchyne', label: 'Asijská kuchyně', text: 'Japonsko, Čína, Korea, Indie a jihovýchodní Asie', test: item => item.c === 'pokrmy' && continentOf(item) === 'AS' },
    { id: 'polevky', label: 'Polévky', test: item => item.c === 'pokrmy' && tagged('polevka')(item) },
    { id: 'omacky', label: 'Omáčky a dipy', test: item => item.c === 'pokrmy' && tagged('omacka')(item) },
    { id: 'rychle-obcerstveni', label: 'Rychlé občerstvení', text: 'Hamburger, pizza, kebab, hranolky…', test: tagged('fast') },
    { id: 'testoviny', label: 'Těstoviny', test: tagged('testoviny') },
    { id: 'pecivo', label: 'Chléb a pečivo', test: item => item.c === 'sladkosti' && tagged('pecivo')(item) },
    { id: 'ceske-sladkosti', label: 'České sladkosti a pečivo', text: 'Vánočka, buchty, koláče, kremrole…', test: item => item.c === 'sladkosti' && item.cz },
    { id: 'dorty-a-zakusky', label: 'Dorty a zákusky', test: tagged('dort', 'zakusek') },
    { id: 'dezerty', label: 'Dezerty', text: 'Tiramisu, palačinky, pudink, zmrzlina…', test: tagged('dezert', 'mrazeny') },
    { id: 'cukrovinky', label: 'Cukrovinky a cukroví', test: tagged('cukrovinka', 'cukrovi') },
    { id: 'italske-syry', label: 'Italské sýry', test: item => item.c === 'syry' && landIs('Itálie')(item) },
    { id: 'francouzske-syry', label: 'Francouzské sýry', test: item => item.c === 'syry' && landIs('Francie')(item) },
    { id: 'plisnove-syry', label: 'Plísňové sýry', test: item => item.c === 'syry' && tagged('plisen')(item) },
    { id: 'ceske-a-slovenske-syry', label: 'České a slovenské sýry', test: item => item.c === 'syry' && (item.cz || item.sk || landIs('Slovensko')(item)) },
    { id: 'tropicke-ovoce', label: 'Tropické ovoce', test: tagged('tropicke') },
    { id: 'citrusy', label: 'Citrusy', test: tagged('citrus') },
    { id: 'drobne-ovoce', label: 'Drobné ovoce', text: 'Jahody, maliny, borůvky, rybíz…', test: tagged('bobule') },
    { id: 'nase-ovoce', label: 'Ovoce z naší zahrady', text: 'Jablka, hrušky, švestky, třešně, meruňky…', test: tagged('malvice', 'peckovice') },
    { id: 'orechy', label: 'Ořechy', test: tagged('orech') },
    { id: 'odrudy-ovoce', label: 'Odrůdy jablek a hrušek', test: item => item.c === 'ovoce' && tagged('odruda')(item) },
    { id: 'kostalova-zelenina', label: 'Košťálová zelenina', text: 'Zelí, kapusta, květák, brokolice, kedluben', test: tagged('kostal') },
    { id: 'korenova-zelenina', label: 'Kořenová zelenina a hlízy', test: tagged('koren', 'hlizy') },
    { id: 'plodova-zelenina', label: 'Plodová zelenina', text: 'Rajčata, papriky, okurky, dýně, lilek', test: tagged('plod') },
    { id: 'cibulova-a-listova', label: 'Cibulová a listová zelenina', test: tagged('cibule', 'list') },
    { id: 'lusteniny', label: 'Luštěniny', test: tagged('lusten') },
    { id: 'bylinky', label: 'Bylinky', test: tagged('bylina') },
    { id: 'koreni', label: 'Koření', text: 'Pepř, skořice, vanilka, šafrán…', test: tagged('koreni', 'smes') },
    { id: 'kava', label: 'Káva', test: tagged('kava') },
    { id: 'caj', label: 'Čaj', test: tagged('caj') },
    { id: 'mlecne-napoje', label: 'Mléko a mléčné nápoje', test: tagged('mleko') },
    { id: 'pivo', label: 'Pivo', text: 'Ležák, IPA, porter, stout…', test: tagged('pivo') },
    { id: 'vino', label: 'Víno', test: tagged('vino') },
    { id: 'odrudy-revy', label: 'Odrůdy vinné révy', text: 'Ryzlink, Chardonnay, Merlot, Frankovka…', test: item => item.c === 'alkohol' && (tagged('odruda')(item) || item.ty === 'odrůda vinné révy') },
    { id: 'destilaty', label: 'Destiláty', text: 'Whisky, vodka, rum, slivovice…', test: tagged('destilat') },
    { id: 'likery', label: 'Likéry', test: tagged('liker') },
    { id: 'koktejly', label: 'Koktejly', test: tagged('koktejl') },
    { id: 'cesti-kuchari', label: 'Čeští kuchaři', sort: { by: 'born' }, test: item => item.c === 'kuchari' && item.cz },
    { id: 'slavni-sefkuchari', label: 'Slavní šéfkuchaři', text: 'Michelinské hvězdy a televizní pořady', sort: { by: 'born' },
        test: item => item.c === 'kuchari' && !item.cz && ['kuchař', 'kuchařka'].includes(item.ty) }
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS.map(({ id: cid, label, text, sort }) => compact({ id: cid, label, text, sort: sort || BY_NAME }));

// --- Známost a úrovně ---
// Známé = ruční seznam; méně známé seřazené podle slávy (jazykové verze, české a slovenské ×3), nejméně slavná třetina jen pro experty
const fameOf = (item) => (item.sl || 1) * (item.cz || item.sk ? 3 : 1);
const EXPERT_SHARE = 0.35;
for (const category of CATEGORIES) {
    const rest = items.filter(item => item.c === category && item.k !== 1).sort((a, b) => fameOf(a) - fameOf(b));
    rest.slice(0, Math.floor(rest.length * EXPERT_SHARE)).forEach(item => { item.x = 1; });
}
// V kategorii od nejznámějších (známé napřed): Tajemná otázka a Kvíz dne berou první část kategorie jako nejsnazší
items.sort((a, b) => CATEGORIES.indexOf(a.c) - CATEGORIES.indexOf(b.c) || (b.k || 0) - (a.k || 0) || fameOf(b) - fameOf(a) || a.n.localeCompare(b.n, 'cs'));
for (const category of CATEGORIES) {
    const list = items.filter(item => item.c === category);
    console.log(`${category}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length}, s fotkou ${list.filter(item => item.im).length})`);
}
for (const collection of COLLECTIONS) {
    const members = items.filter(item => (item.g || []).includes(collection.id));
    console.log(`  okruh ${collection.id}: ${members.length} (známých ${members.filter(item => item.k === 1).length})`);
}
for (const item of items) { delete item.sl; delete item.tags; delete item.sk; delete item.listed; }

writeTopic('jidlo', { collections, items });
