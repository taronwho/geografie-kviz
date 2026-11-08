// Okruhy tématu Biologie mimo strom taxonů: plemena psů a koček a lidské tělo (kosti, svaly, orgány a žlázy).
// Volá je scripts/build-biologie.mjs; dotazy jdou přes query.wikidata.org (strom taxonů tu potřeba není), mezivýsledky do BUILD_CACHE.
import { sparql, id, values, imageFields, compact, cached, inBatches, sleep } from './wikidata.mjs';

const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const csArticle = (variable) => `?a schema:about ${variable} ; schema:isPartOf <https://cs.wikipedia.org/> . ${variable} wikibase:sitelinks ?sl .`;
const max = (list) => list && list.length ? Math.max(...list) : undefined;
const round = (value, digits) => value === undefined ? undefined : Number(value.toPrecision(digits));

// Podrobnosti po dávkách: jednoduché hodnoty (první), seznamy, čísla
const fetchDetails = (name, qids, branches, size = 60) => cached(name, async () => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, size, (batch) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(batch)} }
  { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  ${branches.join('\n  ')}
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (!(entry[row.p.value] || []).includes(v)) entry[row.p.value] = [...(entry[row.p.value] || []), v];
    });
    return [...result];
});
const first = (detail, key) => (detail[key] || [])[0];
const labelsOf = (name, qids) => cached(name, async () => {
    const result = [];
    await inBatches(qids, 300, (batch) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(batch)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
        (row) => result.push([id(row.item.value), row.l.value]));
    return result;
});

// Úvodní sekce článků české Wikipedie (šablona Infobox – plemeno: skupina FCI) po 50 článcích
const wikiLeads = (name, titles) => cached(name, async () => {
    const result = [];
    for (let i = 0; i < titles.length; i += 50) {
        const params = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', formatversion: '2', redirects: '1', titles: titles.slice(i, i + 50).join('|') });
        for (let attempt = 1; attempt <= 6; attempt++) {
            try {
                const response = await fetch(`https://cs.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const pages = ((await response.json()).query || {}).pages || [];
                for (const page of pages) {
                    const text = (((page.revisions || [])[0] || {}).slots || {}).main;
                    if (text && text.content) result.push([page.title, text.content.slice(0, 4000)]);
                }
                break;
            } catch (error) {
                if (attempt === 6) throw error;
                await sleep(5000 * attempt);
            }
        }
        await sleep(1500);
    }
    return result;
});

// --- Plemena psů a koček ---
const DOG_BREED = 'Q39367';
const CAT_BREED = 'Q43577';
const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585']);
// Skupiny FCI (v pořadí čísel skupin) podle infoboxu české Wikipedie („9: Společenští a doprovodní psi“, „[[Teriéři]]“):
// krátký název pro nápovědu a okruh
const FCI_GROUPS = [
    ['ovcaci', 'ovčáčtí, pasteveční a honáčtí psi', /ovčá|pastev|honáck|honáč/iu],
    ['pinci', 'pinčové, knírači, molossoidi a salašníci', /pinč|knírač|molos|salaš/iu],
    ['terieri', 'teriéři', /teri[éeě]/iu],
    ['jezevcici', 'jezevčíci', /jezevčí/iu],
    ['spicove', 'špicové a primitivní plemena', /špic|primitiv/iu],
    ['honici', 'honiči a barváři', /honič|barvář/iu],
    ['ohari', 'ohaři', /ohař/iu],
    ['slidici', 'slídiči, retrívři a vodní psi', /slídič|retrív|(?<!\p{L})vodní/iu],
    ['spolecenska', 'společenská plemena', /společen/iu],
    ['chrti', 'chrti', /chrt/iu]
];
// Nejznámější česká a československá plemena (vždy mezi známými)
const CZECH_BREEDS_KNOWN = new Set(['Československý vlčák', 'Český fousek', 'Chodský pes', 'Pražský krysařík', 'Český teriér', 'Český strakatý pes']);
// Šelmy a kříženci, které Wikidata vedou jako plemeno, i když jde o divoký druh (dingo) nebo nejde o plemeno v pravém smyslu
const NOT_BREEDS = new Set(['Q38584', 'Q144']);
const NOT_BREED_NAME = /dingo/iu;
const BREEDS_LIMIT = 260;
const BREEDS_KNOWN = 0.27;

export const buildBreeds = async ({ takenIds, takenNames }) => {
    const candidates = await cached('biologie-plemena-candidates', async () => {
        const rows = await sparql(`SELECT DISTINCT ?item ?kind ?sl WHERE { VALUES (?cls ?kind) { (wd:${DOG_BREED} "pes") (wd:${CAT_BREED} "kocka") } ?item wdt:P31 ?cls . ${csArticle('?item')} }`);
        return rows.map(row => [id(row.item.value), row.kind.value, Number(row.sl.value)]);
    });
    const ordered = [...new Map(candidates.map(([qid, kind, sl]) => [qid, { qid, kind, sl }])).values()]
        .filter(entry => !NOT_BREEDS.has(entry.qid) && !takenIds.has(entry.qid)).sort((a, b) => b.sl - a.sl);
    const details = new Map(await fetchDetails('biologie-plemena-details', ordered.map(entry => entry.qid), [
        'UNION { ?item wdt:P495 ?v BIND("land" AS ?p) }',
        'UNION { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?v BIND("mass" AS ?p) }',
        'UNION { ?item p:P2048/psn:P2048/wikibase:quantityAmount ?v BIND("hgt" AS ?p) }',
        'UNION { ?item p:P2250/psn:P2250/wikibase:quantityAmount ?v BIND("life" AS ?p) }'
    ]));
    const countries = new Map(await labelsOf('biologie-plemena-countries', [...new Set([...details.values()].flatMap(detail => detail.land || []))]));
    const leads = new Map(await wikiLeads('biologie-plemena-wiki', ordered.map(entry => first(details.get(entry.qid) || {}, 't')).filter(Boolean)));
    const fciOf = (title) => {
        const match = /skupina FCI\s*=\s*([^\n|]*(?:\|[^\n=]*\]\])?)/iu.exec(leads.get(title) || '');
        if (!match) return undefined;
        const text = match[1].replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').trim();
        // Číslo skupiny („9: …“, „skupina 1 (…)“) platí přednostně, jinak název skupiny
        const number = /^(?:skupina\s*)?(\d{1,2})(?!\d)/iu.exec(text);
        if (number && FCI_GROUPS[Number(number[1]) - 1]) return FCI_GROUPS[Number(number[1]) - 1];
        return FCI_GROUPS.find(([, , pattern]) => pattern.test(text));
    };
    const items = [];
    const counts = { pes: 0, kocka: 0 };
    for (const entry of ordered) {
        const detail = details.get(entry.qid) || {};
        const title = first(detail, 't');
        const label = first(detail, 'n') || (title || '').replace(/ \(.*\)$/, '');
        const isCzech = (detail.land || []).some(qid => CZECH_STATES.has(qid));
        // Bez fotky se plemeno poznat nedá; česká plemena se vezmou i nad limit
        if (!title || !label || !first(detail, 'im') || NOT_BREED_NAME.test(label) || (items.length >= BREEDS_LIMIT && !isCzech)) continue;
        const name = capitalize(label);
        if (takenNames.has(name.toLowerCase())) continue;
        takenNames.add(name.toLowerCase());
        const lands = (detail.land || []).map(qid => countries.get(qid)).filter(Boolean);
        const fci = entry.kind === 'pes' ? fciOf(title) : undefined;
        const life = max((detail.life || []).map(Number));
        counts[entry.kind]++;
        items.push(compact({
            q: entry.qid,
            t: title,
            n: name,
            c: 'plemena',
            ty: entry.kind === 'pes' ? 'psí plemeno' : 'kočičí plemeno',
            d: first(detail, 'd'),
            ...imageFields(first(detail, 'im')),
            f: compact({
                kind: entry.kind,
                // Česko a Československo jako Česko (u plemen z doby Československa se hra ptá na dnešní stát)
                land: isCzech ? 'Česko' : lands[0],
                fci: fci ? fci[1] : undefined,
                mass: round(max((detail.mass || []).map(Number)), 3),
                hgt: round(max((detail.hgt || []).map(Number)), 3),
                life: life ? Math.round(life / 31557600) || undefined : undefined
            }),
            sl: entry.sl,
            fg: fci ? fci[0] : undefined,
            czb: isCzech ? 1 : undefined
        }));
    }
    // Známost: v každém druhu (psi, kočky) nejvíc jazykových verzí, k tomu nejznámější česká plemena
    for (const kind of ['pes', 'kocka']) {
        const list = items.filter(item => item.f.kind === kind).sort((a, b) => b.sl - a.sl);
        list.forEach((item, index) => { item.k = index < Math.round(list.length * BREEDS_KNOWN) || CZECH_BREEDS_KNOWN.has(item.n) ? 1 : 0; });
    }
    console.log(`plemena: ${counts.pes} psů, ${counts.kocka} koček, ${items.filter(item => item.f.fci).length} se skupinou FCI`);
    return items;
};

// --- Lidské tělo ---
// Kandidáti: anatomické struktury s identifikátorem Terminologia Anatomica (P1323) nebo FMA (P1402) a článkem na české Wikipedii;
// druh podle tříd Wikidat a názvu, soustava a část těla podle názvu (Wikidata je uvádějí nejednotně)
const BONE = 'Q265868';
const MUSCLE = 'Q7365';
const GLAND = 'Q9647';
const BONE_NAME = /kost|obratel|čéška|žebro|čelist|lopatka|kostrč|jazylka|^atlas$|kladívko|kovadlinka|třmínek|článek prstu|záprstí|zánártí|zápěstí|^nárt$|čepovec/iu;
const NOT_BONE = /zubovin|dřeň|^lidská kostra$|^kost$|kostní tkáň/iu;
const MUSCLE_NAME = /sval|bránice|bedrovec|ohýbač|natahovač|zdvihač|vzpřimovač|napínač|^lýtko$/iu;
const NOT_MUSCLE = /svalovin|uzel|vlákn|svazek|systém|dno|^sval$|^svaly |dýchací/iu;
const GLAND_NAME = /žláz|příštítn|hypofýz|šišink|nadledvin|brzlík/iu;
const NOT_GLAND = /soustava|s vnější sekrecí$|s vnitřní sekrecí$|^žláza$/iu;
// Orgány (bez kostí, svalů a žláz): soustava, do které patří
const ORGAN_SYSTEMS = {
    'trávicí soustava': ['jícen', 'žaludek', 'tenké střevo', 'tlusté střevo', 'dvanáctník', 'lačník', 'kyčelník', 'slepé střevo', 'apendix', 'konečník', 'játra',
        'žlučník', 'hltan', 'slinivka břišní', 'zub', 'dáseň', 'patro'],
    'dýchací soustava': ['plíce', 'hrtan', 'průdušnice', 'průduška', 'hlasivky', 'příklopka hrtanová', 'plicní sklípek', 'nosní dutina'],
    'oběhová soustava': ['srdce', 'aorta'],
    'nervová soustava': ['mozek', 'mícha', 'mozeček', 'koncový mozek', 'mezimozek', 'prodloužená mícha', 'varolův most', 'střední mozek', 'hypothalamus',
        'hipokampus', 'thalamus', 'mozková kůra', 'lidský mozek', 'mozkový kmen'],
    'smyslová soustava': ['oko', 'ucho', 'nos', 'jazyk', 'sítnice', 'rohovka', 'duhovka', 'oční čočka', 'ušní bubínek', 'hlemýžď', 'eustachova trubice',
        'zornice', 'bělima', 'cévnatka', 'sklivec', 'ušní boltec', 'vnitřní ucho', 'střední ucho'],
    'vylučovací soustava': ['ledvina', 'močový měchýř', 'močovod', 'močová trubice'],
    'rozmnožovací soustava': ['děloha', 'vaječník', 'vejcovod', 'varle', 'předstojná žláza', 'chámovod', 'placenta', 'nadvarle'],
    'soustava žláz s vnitřní sekrecí': ['štítná žláza', 'hypofýza', 'šišinka', 'nadledvina', 'příštítná tělíska'],
    'imunitní a mízní soustava': ['slezina', 'mandle', 'mízní uzlina', 'brzlík', 'kostní dřeň', 'krční mandle', 'nosní mandle'],
    'kožní soustava': ['kůže', 'potní žláza', 'mazová žláza', 'nehet', 'pokožka', 'škára'],
    'trávicí a vylučovací soustava': []
};
const SYSTEM_OF = new Map(Object.entries(ORGAN_SYSTEMS).flatMap(([system, names]) => names.map(name => [name, system])));
// Slinné žlázy patří k trávení, mléčná žláza k rozmnožování
const GLAND_SYSTEMS = [[/slin|příušn/iu, 'trávicí soustava'], [/mléčn|cowper|bartholin|předstojn/iu, 'rozmnožovací soustava'], [/potní|mazov|ekrinn/iu, 'kožní soustava'],
    [/slzn/iu, 'smyslová soustava'], [/nadledvin|šišink|hypofýz|štítn|příštítn/iu, 'soustava žláz s vnitřní sekrecí']];
// Část těla kosti či svalu podle názvu (pánev napřed: kyčelní není čelní)
const BODY_PARTS = [
    ['pánev', /pánevn|kyčeln|sedací|stydk|bedrov|bedern|hýžď/iu],
    ['hlava', /(?<!\p{L})(čeln|týln|temenn|spánkov|klínov|čichov|slzn|nosní|lícn|patrov|radličn)|čelist|jazylk|kladívk|kovadlink|třmínek|sluchov|žvýkac|mimick|okohybn|ciliárn|dvojbříškat|napínač bubínku|zdvihač hlavy/iu],
    ['páteř a hrudník', /obratel|atlas|čepovec|kostrč|křížov|žebr|hrudní kost|bránic|prsní|trapézov|zádov|vzpřimovač|břišní|skalen|scalen/iu],
    ['horní končetina', /klíční|lopatk|pažní|vřetenn|loketn|zápěst|záprst|prst|člunkovit|poloměsíčit|trojhrann|hráškov|mnohohrann|hlavat|hákov|deltov|hřebenov|podlopatkov|obl[ýé] sval|ohýbač/iu],
    ['dolní končetina', /stehenn|čéšk|holenn|lýtk|hlezenn|patn|krychlov|nárt|zánárt|krejčovsk|pološlašit|povázk|stehna/iu]
];
// Vnější pohlavní orgány a další části, které do rodinného kvízu nepatří, a obecné pojmy (kost, orgán, soustava)
const BODY_EXCLUDED = /pochva|penis|vulva|klitoris|šourek|předkožk|žalud|stydké pysky|pysky|panenská blána|bradavk|řitní|^prs$|^orgán$|soustava|^tkáň|buňk|^krev|^lidské tělo$|^kostra/iu;
// Fotky: jen kresby a schémata (SVG, PNG, GIF a ilustrace z anatomických atlasů), ne fotografie preparátů a operací
const DIAGRAM_FILE = /\.(svg|png|gif)$|gray\d|sobo|blausen|servier|openstax|^\d{4} |illu|diagram|anatom|scheme|schema|drawing|animation|model|dummy|3d|lateral|anterior|posterior|superior|inferior|view/iu;
const GORY_FILE = /dissect|cadaver|autops|surgery|surgical|operat|specimen|histolog|micrograph|tem\b|sem\b|patholog|tumou?r|biops|x-?ray|ct scan|mri|endoscop|lesion|wound|injur|fetus|abortion|preparát|leber|schaf|sheep|pig|cow|dog|cat|rabbit|lamb|horse|naked|nude|genital|vagin|penis|labia/iu;
// Fotky preparátů, které vzor názvu nepozná (spodina mozku, brzlík), a lékařské snímky
const BAD_BODY_IMAGES = new Set(['Human brain inferior view description.JPG', 'Human thymus posterior view.jpg', 'SD-OCT Optic Disc Cross-Sections.png']);
// Hlavní orgány, které výsledek dotazu podle identifikátorů občas nevrátí (srdce, kůže, žaludek)
const PINNED_BODY = [['Q1072', 256], ['Q1074', 184], ['Q1029907', 171]];
const BODY_LIMIT = 260;
const BODY_KNOWN = 0.3;

export const buildBody = async ({ takenIds, takenNames }) => {
    const candidates = await cached('biologie-telo-candidates', async () => {
        const rows = await sparql(`SELECT DISTINCT ?item ?sl WHERE { { ?item wdt:P1323 [] } UNION { ?item wdt:P1402 [] } ${csArticle('?item')} FILTER(?sl >= 10) }`);
        return rows.map(row => [id(row.item.value), Number(row.sl.value)]);
    });
    const ordered = [...new Map([...candidates, ...PINNED_BODY]).entries()].filter(([qid]) => !takenIds.has(qid)).sort((a, b) => b[1] - a[1]);
    const bodyBranches = [
        'UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "la") BIND("la" AS ?p) }',
        `UNION { VALUES (?root ?v) { (wd:${BONE} "kost") (wd:${MUSCLE} "sval") (wd:${GLAND} "zlaza") } ?item wdt:P279+ ?root BIND("root" AS ?p) }`
    ];
    const details = new Map(await fetchDetails('biologie-telo-details', ordered.map(([qid]) => qid), bodyBranches, 40));
    // Položky přidané po uložení mezipaměti se dočtou zvlášť
    const missing = ordered.map(([qid]) => qid).filter(qid => !details.has(qid));
    if (missing.length) for (const [qid, detail] of await fetchDetails(`biologie-telo-details-${missing.length}`, missing, bodyBranches, 40)) details.set(qid, detail);
    // Anglické názvy: jen pro hledání nápisu na obrázku (popisek „Pancreas“ na schématu slinivky), odpovědí nejsou
    const english = new Map(await cached('biologie-telo-en', async () => {
        const result = [];
        await inBatches(ordered.map(([qid]) => qid), 300, (batch) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(batch)} } ?item rdfs:label ?l FILTER(LANG(?l) = "en") }`,
            (row) => result.push([id(row.item.value), row.l.value]));
        return result;
    }));
    const items = [];
    const sitelinks = new Map(ordered);
    for (const [qid] of ordered) {
        const detail = details.get(qid) || {};
        const title = first(detail, 't');
        const label = first(detail, 'n') || (title || '').replace(/ \(.*\)$/, '');
        if (!title || !label || BODY_EXCLUDED.test(label) || items.length >= BODY_LIMIT) continue;
        const lower = label.toLocaleLowerCase('cs');
        const roots = detail.root || [];
        let kind = null;
        if (roots.includes('kost') && BONE_NAME.test(lower) && !NOT_BONE.test(lower)) kind = 'kost';
        else if (roots.includes('sval') && MUSCLE_NAME.test(lower) && !NOT_MUSCLE.test(lower)) kind = 'sval';
        else if (GLAND_NAME.test(lower) && !NOT_GLAND.test(lower)) kind = 'žláza';
        else if (SYSTEM_OF.has(lower)) kind = 'orgán';
        if (!kind) continue;
        const name = capitalize(label);
        if (takenNames.has(lower)) continue;
        takenNames.add(lower);
        const system = kind === 'kost' ? 'kosterní soustava' : kind === 'sval' ? 'svalová soustava'
            : SYSTEM_OF.get(lower) || (GLAND_SYSTEMS.find(([pattern]) => pattern.test(lower)) || [])[1];
        const part = kind === 'kost' || kind === 'sval' ? (BODY_PARTS.find(([, pattern]) => pattern.test(lower)) || [])[0] : undefined;
        // Drobné a málo známé žlázy bez jasné soustavy (Littrého žláza) se vynechají
        if (!system) { takenNames.delete(lower); continue; }
        // Kresba nebo schéma z Commons; fotografie preparátů a orgánů zvířat se nepoužijí
        // U pohlavních orgánů obrázek vůbec ne
        const image = system === 'rozmnožovací soustava' ? undefined : (detail.im || []).map(url => imageFields(url))
            .find(fields => fields.im && DIAGRAM_FILE.test(fields.im) && !GORY_FILE.test(fields.im) && !BAD_BODY_IMAGES.has(fields.im));
        // Latinský název: jen jiný než český (lebka – cranium), ne stejný (atlas)
        const latin = (detail.la || []).find(text => text && text.toLocaleLowerCase('cs') !== lower && /^\p{L}[\p{L} ]+$/u.test(text));
        items.push(compact({
            q: qid,
            t: title,
            n: name,
            c: 'telo',
            ty: kind,
            d: first(detail, 'd'),
            ...(image || {}),
            al: [...new Set([latin, english.get(qid)].filter(Boolean).map(text => text.toLocaleLowerCase('cs')))],
            f: compact({ sys: system, part, lat: latin ? latin.toLocaleLowerCase('cs') : undefined }),
            sl: sitelinks.get(qid)
        }));
    }
    const ranked = [...items].sort((a, b) => b.sl - a.sl);
    ranked.forEach((item, index) => { item.k = index < Math.round(items.length * BODY_KNOWN) ? 1 : 0; });
    console.log(`lidské tělo: ${items.length} (${['kost', 'sval', 'orgán', 'žláza'].map(kind => `${kind} ${items.filter(item => item.ty === kind).length}`).join(', ')}), s obrázkem ${items.filter(item => item.im).length}`);
    return items;
};

// Okruhy pro učení (u nových položek se počítají zvlášť; ostatní okruhy biologie jdou podle předků)
export const EXTRA_COLLECTIONS = [
    { id: 'psi-plemena', label: 'Psí plemena', test: item => item.c === 'plemena' && item.f.kind === 'pes' },
    { id: 'kocici-plemena', label: 'Kočičí plemena', test: item => item.c === 'plemena' && item.f.kind === 'kocka' },
    { id: 'ceska-plemena', label: 'Česká plemena', text: 'Český fousek, chodský pes, československý vlčák…', test: item => item.c === 'plemena' && item.czb === 1 },
    ...FCI_GROUPS.map(([key, label]) => ({ id: `fci-${key}`, label: capitalize(label), text: 'Skupina plemen podle FCI', test: item => item.c === 'plemena' && item.fg === key })),
    { id: 'kosti', label: 'Kosti', sort: { by: 'name' }, test: item => item.c === 'telo' && item.ty === 'kost' },
    { id: 'svaly', label: 'Svaly', test: item => item.c === 'telo' && item.ty === 'sval' },
    { id: 'organy', label: 'Orgány', test: item => item.c === 'telo' && item.ty === 'orgán' },
    { id: 'zlazy', label: 'Žlázy', test: item => item.c === 'telo' && item.ty === 'žláza' },
    { id: 'lebka', label: 'Kosti a svaly hlavy', test: item => item.c === 'telo' && item.f.part === 'hlava' },
    { id: 'koncetiny', label: 'Kosti a svaly končetin', test: item => item.c === 'telo' && /končetina/u.test(item.f.part || '') },
    { id: 'traveni', label: 'Trávicí soustava', test: item => item.c === 'telo' && item.f.sys === 'trávicí soustava' },
    { id: 'nervova-soustava', label: 'Nervová soustava a smysly', test: item => item.c === 'telo' && /nervová|smyslová/u.test(item.f.sys || '') }
].map(collection => ({ sort: { by: 'name' }, ...collection }));
