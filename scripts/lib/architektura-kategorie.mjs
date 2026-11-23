// Architektura: kategorie Hrady a zámky, Mosty a tunely a Mrakodrapy a rekordní stavby (data/architektura.json)
// Hrady, zámky, královské paláce, mosty, mrakodrapy, věže a přehrady z kategorie stavby se přesunou do nové kategorie (id i úroveň
// zůstanou, c0 = 'stavby' pamatuje původní kategorii kvůli původnímu generátoru Řetězovky, chain-legacy.js) a k nim přibydou další
// z Wikidat (přes QLever): české a světové hrady a zámky, mosty, tunely, mrakodrapy, věže a přehrady s fotkou a českým článkem.
// Úroveň nových položek podle počtu jazykových verzí článku (české ×1,3) a známosti v Zeměpisu – návštěvnost české Wikipedie
// (API cs.wikipedia.org) se nestahuje. Spouští build-architektura.mjs (celé sestavení i jen tento krok: --kategorie).
import { qlever, id, values, parsePoint, imageFields, yearOf, compact, cached, inBatches, CZECHIA, buildingTypeFromName, sleep } from './wikidata.mjs';
import { cachedByKey, czechPageviews } from './zemepis-levels.mjs';
import { fameOf as statsFame } from './umeni-levels.mjs';

export const NEW_CATEGORIES = ['hrady', 'mosty', 'mrakodrapy'];
export const BUILDING_CATEGORIES = new Set(['stavby', ...NEW_CATEGORIES]);

// Druh stavby podle českých názvů typů (P31): první pravidlo v pořadí, které některý typ splní (i pro build-architektura.mjs)
export const BUILDING_TYPES = [
    [/katedrál/, 'katedrála'], [/bazilik|basilica/, 'bazilika'], [/mešit/, 'mešita'], [/synagog/, 'synagoga'],
    [/klášter|monastýr|opatství|lávra/, 'klášter'], [/kapl/, 'kaple'], [/kostel|cerkev|kostelík/, 'kostel'], [/chrám/, 'chrám'],
    [/přehrad/, 'přehrada'], [/most|viadukt|akvadukt/, 'most'], [/tunel/, 'tunel'],
    [/hrad|pevnost|fort/, 'hrad'], [/zámek|letohrádek|rezidence/, 'zámek'], [/palác/, 'palác'], [/radnic/, 'radnice'], [/parlament/, 'budova parlamentu'],
    [/amfiteátr|divadl|opera|odeon|koncertní sál/, 'divadlo'], [/stadion|aréna/, 'stadion'],
    [/mrakodrap|výšková budova/, 'mrakodrap'], [/věž|rozhledna|vysílač|maják/, 'věž'], [/nádraží|stanice/, 'nádraží'],
    [/vítězný oblouk|brán/, 'brána'], [/mauzoleum|hrobka|krematori/, 'hrobka'], [/hradb/, 'hradby'], [/vila/, 'vila'], [/muze|galeri/, 'muzeum'],
    [/knihovn/, 'knihovna'], [/univerzit|škol|akademi/, 'škola'], [/nemocnic/, 'nemocnice'], [/hotel/, 'hotel'],
    [/obchodní dům|obchodní centrum|bazar|tržnic/, 'obchodní dům'], [/kancelář|administrativní/, 'kancelářská budova'],
    [/dům|budova/, 'budova']
];

// --- Přesun položek ze staveb ---

// Druhy staveb nové kategorie (u nových položek i u přesunu)
const TYPES_OF = { hrady: ['hrad', 'zámek', 'pevnost', 'palác'], mosty: ['most', 'tunel'], mrakodrapy: ['mrakodrap', 'věž', 'přehrada'] };
const CATEGORY_OF_TYPE = new Map(Object.entries(TYPES_OF).flatMap(([category, types]) => types.map(type => [type, category])));
// Paláce, které byly sídlem panovníka (královské, císařské, knížecí, chánské): česky spíš zámek, patří k hradům a zámkům.
// Městské šlechtické paláce, sídla úřadů, muzea a paláce kultury zůstávají mezi stavbami.
const ROYAL_PALACES = new Set(['Q182147', 'Q170495', 'Q211818', 'Q208559', 'Q29286', 'Q2854543', 'Q732489', 'Q156316', 'Q498261', 'Q1055311', 'Q171517',
    'Q211053', 'Q750444', 'Q530129', 'Q940733', 'Q206101', 'Q1056152', 'Q1740560', 'Q1123987', 'Q863932', 'Q7722735', 'Q599223', 'Q7461', 'Q1066641',
    'Q1073173', 'Q147994', 'Q1540732', 'Q604921', 'Q677383', 'Q1072284', 'Q234048', 'Q2376970', 'Q1501534', 'Q1635704', 'Q879941', 'Q51105', 'Q1478288',
    'Q2456319', 'Q991665', 'Q3175595', 'Q80290', 'Q71229', 'Q4132', 'Q210610', 'Q151330', 'Q205666', 'Q274141', 'Q272162', 'Q338889', 'Q477157',
    'Q873769', 'Q525811', 'Q482485', 'Q500681', 'Q69513', 'Q852429', 'Q62364', 'Q565521', 'Q867537', 'Q1370087', 'Q1202239', 'Q2628708', 'Q321783',
    'Q1164788', 'Q2340793', 'Q2429287']);
// Stavby bez druhu (nebo s nepřesným druhem), které do nové kategorie patří: [kategorie, druh]
const MOVE_WITH_TYPE = {
    Q47473: ['hrady', 'palác'], Q2315050: ['hrady', 'palác'], Q639208: ['hrady', 'hrad'], Q390418: ['mosty', 'most'], Q685484: ['mrakodrapy', 'mrakodrap'],
    Q2734953: ['mrakodrapy', 'mrakodrap'], Q754194: ['mrakodrapy', 'věž'], Q208234: ['mrakodrapy', 'věž'], Q172822: ['mrakodrapy', 'přehrada']
};
// Druh „hrad“ či „zámek“ (nebo věž) mají ve Wikidatech i města, zahrady, hradby, muzea a parky a salety (Tři Grácie), vinařství
// (Château Margaux), městské brány a vyhlídky – ty zůstávají mezi stavbami
const STAY = new Set(['Q179046', 'Q499527', 'Q625149', 'Q89917', 'Q596642', 'Q574740', 'Q838691', 'Q1048381', 'Q115253', 'Q1091155', 'Q12060369',
    'Q10854363', 'Q1063236', 'Q1488700', 'Q1509185', 'Q445762', 'Q27865889']);

// Kam stavba patří: { c, ty } nebo null (zůstává mezi stavbami)
export const moveTarget = (item) => {
    if (item.c !== 'stavby' || STAY.has(item.q)) return null;
    if (MOVE_WITH_TYPE[item.q]) return { c: MOVE_WITH_TYPE[item.q][0], ty: MOVE_WITH_TYPE[item.q][1] };
    if (item.ty === 'palác') return ROYAL_PALACES.has(item.q) ? { c: 'hrady' } : null;
    const category = CATEGORY_OF_TYPE.get(item.ty);
    return category ? { c: category } : null;
};

// --- Nové položky z Wikidat ---

// Třídy Wikidat (P31/P279*), druh stavby, když typy žádný neurčí, a nejmenší počet jazykových verzí ve světě a v Česku
const SOURCES = [
    { cls: 'Q23413', category: 'hrady', ty: 'hrad', world: 20, cz: 6 },
    { cls: 'Q751876', category: 'hrady', ty: 'zámek', world: 20, cz: 6 },
    { cls: 'Q17715832', category: 'hrady', ty: 'hrad', world: 16, cz: 6 },
    { cls: 'Q57831', category: 'hrady', ty: 'hrad', world: 24, cz: 6 },
    { cls: 'Q1785071', category: 'hrady', ty: 'hrad', world: 24, cz: 6 },
    { cls: 'Q53536964', category: 'hrady', ty: 'palác', world: 20, cz: 6 },
    { cls: 'Q12280', category: 'mosty', ty: 'most', world: 24, cz: 6 },
    { cls: 'Q44377', category: 'mosty', ty: 'tunel', world: 13, cz: 4 },
    { cls: 'Q11303', category: 'mrakodrapy', ty: 'mrakodrap', world: 27, cz: 5 },
    { cls: 'Q11166728', category: 'mrakodrapy', ty: 'věž', world: 15, cz: 5 },
    { cls: 'Q12518', category: 'mrakodrapy', ty: 'věž', world: 24, cz: 6 },
    { cls: 'Q12323', category: 'mrakodrapy', ty: 'přehrada', world: 25, cz: 99 }
];
// Kolik nových položek nejvýš (nejznámější podle jazykových verzí) – ve světě a z Česka
const LIMITS = { hrady: { world: 110, cz: 90 }, mosty: { world: 60, cz: 14 }, mrakodrapy: { world: 45, cz: 12 } };
// Nejvýš tolik nových položek jednoho druhu (přehrady: jen ty nejslavnější)
const TYPE_LIMITS = { 'přehrada': 8 };
// Typy, podle kterých položka není stavba nové kategorie (mýtus, město, naleziště, vinařství, klášter, bunkr, plánovaná stavba, socha…)
// (kostel, muzeum či hotel pozná druh stavby: je v pořadí BUILDING_TYPES před hradem nebo mrakodrapem)
const ODD_TYPE = /mytick|fiktiv|loď|město|vesnice|^obec|osada|vinařstv|vinice|klášter|opatství|tvrz|bunkr|srub|plánovan|navrhovan|projekt|linka|metro|železniční trať|stezka|socha|orloj|pagod|zaniklá stavba/u;
// Typy, které vadí, jen když žádný typ neurčí druh stavby (Pražský hrad je hrad i hradiště, Minaret Džám i archeologická lokalita)
const WEAK_ODD_TYPE = /hradiště|archeolog|univerzit|park|zahrad|hřbitov|ulice|náměstí|důl|vodní nádrž|^jez$|kanál|průplav|historický region/u;
// Druh podle typu, který BUILDING_TYPES nezná
const TYPE_HINTS = [[/kreml/, 'hrad'], [/minaret|bašta/, 'věž'], [/hráz/, 'přehrada'], [/lávka/, 'most']];
// Věž, která je hlavně chrámem (gopuram hinduistického chrámu)
const RELIGIOUS = /chrám|kostel|mešit|klášter|katedrál|pagod/iu;
// Fotka (ne mapa, plán ani schéma) – nové položky jen se skutečnou fotkou
const isPhoto = (url) => /\.(jpe?g|webp)$/i.test(url) && !/(?<![\p{L}])(map|mapa|karte|карта|plan|plán|schema|схема|scheme)(?![\p{L}])/iu.test(decodeURIComponent(url.split('/').pop()));
const ODD_NAME = /nádrž|jezero|klášter|kostel|chrám|stezka|lanovka|metro|výtah/iu;
const ODD_DESCRIPTION = /archeologick|plánovan|navrhovan|ve výstavbě|nedokončen|zaniklý|zaniklá|zbořen|neexistující|fiktivní|smyšlen|vinařstv/iu;
// Položky, které pravidla propustí, ale do kvízu nepatří: celá místa a města (Terezín, Josefov, Suomenlinna, Carcassonne, Kernavė,
// Namhansanseong, Masada, Akrokorint, opevnění Olomouce), exkláva Peñón de Vélez de la Gomera, tři sanmarinské pevnosti v jedné
// položce, památník Devátá pevnost, mapa místo fotky (pevnost svaté Alžběty, Rokský tunel), operace Gold, nedostavěný Two World
// Trade Center a hinduistický chrám Brihadišvára
const EXCLUDED = new Set(['Q523489', 'Q55974123', 'Q1292442', 'Q389269', 'Q215315', 'Q562529', 'Q186312', 'Q420810', 'Q1295985', 'Q191146',
    'Q2287080', 'Q665266', 'Q4240278', 'Q932910', 'Q427974', 'Q1127212', 'Q916943']);
// Známé nejsou, i když je návštěvnost a jazykové verze nad mezí: Montsoreau (propagace), rekordní, ale u nás neznámé stavby
// (stožár KVLY-TV, Central Park Tower, Lærdalský tunel, starý Gotthardský tunel vedle známého úpatního), Kvirinálský palác,
// hrad Poenari, přehrady Vajont a etiopská GERD
const NEVER_KNOWN = new Set(['Q1143049', 'Q1120886', 'Q2631701', 'Q303563', 'Q688618', 'Q223079', 'Q1013551', 'Q22335', 'Q1542454']);
// Známé i bez velkého počtu jazykových verzí (u nás je zná skoro každý)
const ALWAYS_KNOWN = new Set([]);
// Podíl nejméně známých nových položek kategorie, které jsou jen pro experty
const EXPERT_SHARE = 0.27;
// Nejvyšší hodnoty, které ještě dávají smysl (chybné jednotky ve Wikidatech: výška v mm, délka v cm)
const MAX_HEIGHT = 1000;
const MAX_LENGTH = 200000;
const THIS_YEAR = new Date().getFullYear();

const isQid = (q) => /^Q\d+$/.test(q);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
export const normalizeName = (text) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s*\(.*\)$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const TYPE_WORD = /hrad|zámek|palác|most|věž|pevnost|tunel|přehrad|maják|rozhledn|vysílač|viadukt|akvadukt|lávk/iu;

// Podrobnosti po dávkách (jedna položka = objekt s poli z dotazu; víc hodnot v poli)
const SINGLE = { t: 1, n: 1, d: 1, im: 1, coord: 1 };
const DETAILS = `
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P131 ?v BIND("loc" AS ?p) }
  UNION { ?item wdt:P84 ?v BIND("arch" AS ?p) }
  UNION { ?item wdt:P149 ?v BIND("style" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("year" AS ?p) }
  UNION { ?item wdt:P1619 ?v BIND("open" AS ?p) }
  UNION { ?item wdt:P576 ?v BIND("gone" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P1435 ?v BIND("her" AS ?p) }
  UNION { ?item p:P2048 ?hs . ?hs psn:P2048/wikibase:quantityAmount ?hv . ?hs wikibase:rank ?hr . BIND(IF(EXISTS { ?hs pq:P518 ?hp }, "q", "") AS ?hq) BIND(CONCAT(STR(?hv), "|", STR(?hr), "|", ?hq) AS ?v) BIND("h" AS ?p) }
  UNION { ?item p:P2043 ?lens . ?lens psn:P2043/wikibase:quantityAmount ?lenv . ?lens wikibase:rank ?lenr . BIND(IF(EXISTS { ?lens pq:P518 ?lenp }, "q", "") AS ?lenq) BIND(CONCAT(STR(?lenv), "|", STR(?lenr), "|", ?lenq) AS ?v) BIND("len" AS ?p) }`;
const fetchDetails = async (list, details = DETAILS) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 80, (qids) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(qids)} } ${details} }`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (key === 'sl') entry.sl = Number(v);
        else if (key === 'h' || key === 'len') entry[key] = [...(entry[key] || []), v];
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    for (const entry of result.values()) for (const key of ['h', 'len']) if (entry[key]) entry[key] = pickMeasure(entry[key]);
    return result;
};
// Výška či délka z více výroků („hodnota|pořadí|q“, q = jen pro část stavby, P518): výrok s přednostním pořadím, jinak bez
// omezení na část stavby (největší – s anténou, celý most), jinak nejmenší z omezených (Hooverova přehrada: hráz 221 m, ne 376 m)
const pickMeasure = (rows) => {
    const parsed = rows.map(row => row.split('|')).map(([value, rank, part]) => ({ value: Number(value), rank: rank.split('#').pop(), part: part === 'q' }))
        .filter(row => Number.isFinite(row.value) && row.rank !== 'DeprecatedRank');
    const preferred = parsed.filter(row => row.rank === 'PreferredRank');
    if (preferred.length) return Math.max(...preferred.map(row => row.value));
    const whole = parsed.filter(row => !row.part);
    if (whole.length) return Math.max(...whole.map(row => row.value));
    return parsed.length ? Math.min(...parsed.map(row => row.value)) : undefined;
};
// Jen výška a délka (u přesunutých položek)
const MEASURES = `
  { ?item p:P2048 ?hs . ?hs psn:P2048/wikibase:quantityAmount ?hv . ?hs wikibase:rank ?hr . BIND(IF(EXISTS { ?hs pq:P518 ?hp }, "q", "") AS ?hq) BIND(CONCAT(STR(?hv), "|", STR(?hr), "|", ?hq) AS ?v) BIND("h" AS ?p) }
  UNION { ?item p:P2043 ?lens . ?lens psn:P2043/wikibase:quantityAmount ?lenv . ?lens wikibase:rank ?lenr . BIND(IF(EXISTS { ?lens pq:P518 ?lenp }, "q", "") AS ?lenq) BIND(CONCAT(STR(?lenv), "|", STR(?lenr), "|", ?lenq) AS ?v) BIND("len" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }`;
const pause = () => sleep(1500);

const minYear = (list) => {
    const years = (list || []).map(yearOf).filter(year => year !== undefined);
    return years.length ? Math.min(...years) : undefined;
};
const metres = (value, max) => value > 0 && value <= max ? Math.round(value) : undefined;

// items: dosavadní položky tématu (upraví se na místě a vrátí se nové pole v pořadí), published: položky ze zveřejněných dat,
// zemepis: data Zeměpisu (známé památky), countries: data/countries.json, styleOf(detail, typy) → { st, y } | null (sloh nové stavby), groupsOf(item) → okruhy,
// cityOf(locIds, point, parents, labels) → město
export const extendCategories = async ({ items, published, zemepis, countries, styleOf, groupsOf, cityOf }) => {
    const publishedById = new Map(published.map(item => [item.q, item]));
    const wasBuilding = (q) => {
        const old = publishedById.get(q);
        return Boolean(old) && (old.c === 'stavby' || old.c0 === 'stavby');
    };
    // 1. Přesun ze staveb (pole c0 hned za c, ať zůstane pořadí klíčů)
    const moved = [];
    for (const [index, item] of items.entries()) {
        const target = moveTarget(item);
        if (!target) continue;
        const next = {};
        for (const [key, value] of Object.entries(item)) {
            if (key === 'c') {
                next.c = target.c;
                if (wasBuilding(item.q)) next.c0 = 'stavby';
            } else if (key === 'c0') continue;
            else next[key] = value;
            if (key === 'k' && target.ty && !item.ty) next.ty = target.ty;
        }
        if (target.ty) next.ty = target.ty;
        items[index] = next;
        moved.push(next);
    }
    console.log(`Přesunuto ze staveb: ${moved.length} (${NEW_CATEGORIES.map(c => `${c} ${moved.filter(item => item.c === c).length}`).join(', ')})`);

    // 2. Výška a délka mrakodrapů, věží, mostů a tunelů v nových kategoriích (a jazykové verze kvůli pořadí a slávě)
    const present = items.filter(item => NEW_CATEGORIES.includes(item.c));
    const measures = new Map(await cached(`architektura-kategorie-rozmery-${present.length}`, async () => [...await fetchDetails(present.map(item => item.q), MEASURES)]));
    const fameOfPresent = new Map();
    for (const item of present) {
        const detail = measures.get(item.q) || {};
        const f = item.f || (item.f = {});
        const h = metres(detail.h, MAX_HEIGHT);
        const len = metres(detail.len, MAX_LENGTH);
        if (item.c === 'mrakodrapy' && h && f.h === undefined) f.h = h;
        if (item.c === 'mosty' && len && f.len === undefined) f.len = len;
    }

    // 3. Kandidáti nových položek po třídách (malé dotazy po sobě, s prodlevou)
    const known = new Set(items.map(item => item.q));
    const candidates = new Map();
    for (const source of SOURCES) {
        const rows = await cached(`architektura-kategorie-${source.cls}`, async () => {
            const found = await qlever(`SELECT ?b (MAX(?links) AS ?sl) (MAX(?inCz) AS ?cz) WHERE { ?b wdt:P31/wdt:P279* wd:${source.cls} . ?b wdt:P18 ?im . ?b wdt:P625 ?pt .
  ?a schema:about ?b . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?b wikibase:sitelinks ?links .
  BIND(IF(EXISTS { ?b wdt:P17 wd:${CZECHIA} }, 1, 0) AS ?inCz) FILTER(?links >= ${source.world} || (?inCz = 1 && ?links >= ${source.cz})) } GROUP BY ?b`);
            await pause();
            return found.map(row => [id(row.b.value), Number(row.sl.value), Number(row.cz.value)]);
        });
        for (const [q, sl, cz] of rows) {
            if (known.has(q) || EXCLUDED.has(q)) continue;
            if (!candidates.has(q)) candidates.set(q, { q, sl, cz: cz === 1, sources: [] });
            candidates.get(q).sources.push(source);
        }
    }
    const candidateIds = [...candidates.keys()].sort();
    console.log(`Kandidáti nových položek: ${candidateIds.length}`);
    const details = new Map(await cached(`architektura-kategorie-udaje-${candidateIds.length}`, async () => [...await fetchDetails(candidateIds)]));
    // Jen stavby (P31/P279* architektonická struktura)
    const structures = new Set(await cached(`architektura-kategorie-stavby-${candidateIds.length}`, async () => {
        const found = [];
        await inBatches(candidateIds, 300, (qids) => `SELECT DISTINCT ?b WHERE { VALUES ?b { ${values(qids)} } ?b wdt:P31/wdt:P279* wd:Q811979 }`,
            (row) => found.push(id(row.b.value)), qlever);
        return found;
    }));
    // Správní zařazení (pro město, do tří úrovní) a české názvy typů, míst a architektů
    const parents = new Map(await cached(`architektura-kategorie-mista-${candidateIds.length}`, async () => {
        const found = new Map();
        let level = [...new Set([...details.values()].flatMap(detail => detail.loc || []))].filter(isQid);
        for (let depth = 0; depth < 3 && level.length; depth++) {
            const next = new Set();
            await inBatches(level, 300, (qids) => `SELECT ?x ?p WHERE { VALUES ?x { ${values(qids)} } ?x wdt:P131 ?p }`, (row) => {
                const x = id(row.x.value);
                const p = id(row.p.value);
                found.set(x, [...(found.get(x) || []), p]);
                if (!found.has(p)) next.add(p);
            }, qlever);
            level = [...next].filter(q => !found.has(q));
        }
        return [...found];
    }));
    const referenced = [...new Set([...[...details.values()].flatMap(detail => [...(detail.type || []), ...(detail.loc || []), ...(detail.arch || [])]),
        ...[...parents.values()].flat()])].filter(isQid).sort();
    const labels = new Map(await cached(`architektura-kategorie-nazvy-${referenced.length}`, async () => {
        const result = [];
        await inBatches(referenced, 400, (qids) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(qids)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
            (row) => result.push([id(row.item.value), row.l.value]), qlever);
        return result;
    }));
    const cs = (q) => labels.get(q);
    const typeLabels = (detail) => (detail.type || []).map(cs).filter(Boolean).map(label => label.toLowerCase());
    const typeOf = (detail) => {
        const types = typeLabels(detail);
        const found = BUILDING_TYPES.find(([pattern]) => types.some(label => pattern.test(label)));
        return found ? found[1] : 'stavba';
    };

    // 4. Nové položky
    const zemepisItems = zemepis.items;
    const zemepisKnown = new Set(zemepisItems.filter(item => item.k === 1).map(item => item.q));
    const names = new Set(items.flatMap(item => [normalizeName(item.n), item.n.toLowerCase()]));
    const architects = new Map(items.filter(item => item.c === 'architekti').map(item => [item.q, item]));
    // 4a. Co do nové kategorie patří (druh, fotka, rok, poloha)
    const accepted = [];
    for (const candidate of candidates.values()) {
        const detail = details.get(candidate.q);
        if (!detail || !detail.t || !detail.im || detail.gone || !structures.has(candidate.q) || !isPhoto(detail.im)) continue;
        const types = typeLabels(detail);
        if (types.some(label => ODD_TYPE.test(label)) || ODD_DESCRIPTION.test(detail.d || '')) continue;
        // Druh: z typů Wikidat (kreml je hrad, minaret věž), když žádný nesedí, z třídy, odkud položka přišla; jiný druh
        // (kostel, muzeum, hotel, budova) sem nepatří
        const found = typeOf(detail);
        const hint = TYPE_HINTS.find(([pattern]) => types.some(label => pattern.test(label)));
        const ty = CATEGORY_OF_TYPE.has(found) ? found : hint ? hint[1] : found === 'stavba' ? candidate.sources[0].ty : null;
        if (!ty || (found === 'stavba' && !hint && types.some(label => WEAK_ODD_TYPE.test(label)))) continue;
        if (ty === 'palác' && !candidate.sources.some(other => other.ty === 'palác')) continue;
        const category = CATEGORY_OF_TYPE.get(ty);
        if (!category || !candidate.sources.some(other => other.category === category)) continue;
        if (['věž', 'mrakodrap'].includes(ty) && RELIGIOUS.test(detail.d || '')) continue;
        const year = minYear(detail.year) ?? minYear(detail.open);
        if (year !== undefined && (year > THIS_YEAR || year < -3000)) continue;
        // Otevření v budoucnu (tunel ve výstavbě)
        if (minYear(detail.open) > THIS_YEAR) continue;
        const point = parsePoint((detail.coord || '').replace(/^POINT/i, 'Point'));
        if (!point) continue;
        const cz = (detail.co || []).includes(CZECHIA);
        const h = metres(detail.h, MAX_HEIGHT);
        // Mrakodrapy a televizní věže ve světě jen rekordní (aspoň 300, resp. 150 m) nebo hodně známé
        if (!cz && ty === 'mrakodrap' && !(h >= 300 || candidate.sl >= 35)) continue;
        if (!cz && ty === 'věž' && candidate.sources.every(other => other.cls === 'Q11166728') && !(h >= 150 || candidate.sl >= 25)) continue;
        accepted.push({ candidate, detail, types, ty, category, cz, year, point, h });
    }
    // 4b. Sláva: návštěvnost článku české Wikipedie za rok 2025 (REST API Wikimedia) a jazykové verze, české ×1,3 (stejně jako
    // umeni-levels.mjs fameOf) – i u přesunutých položek, podle nich se nové zařadí
    const titles = [...accepted.map(entry => entry.detail.t), ...present.map(item => item.t)];
    const pageviews = await cachedByKey('architektura-kategorie-navstevnost-2025', titles, czechPageviews);
    const fameFor = (title, sl, cz) => statsFame({ pv: pageviews[title], sl, cz });
    for (const item of present) fameOfPresent.set(item.q, fameFor(item.t, (measures.get(item.q) || {}).sl, item.cz));
    for (const entry of accepted) entry.fame = fameFor(entry.detail.t, entry.candidate.sl, entry.cz);
    // Mez známosti nové položky v kategorii (zvlášť české a ostatní): aspoň tak slavná jako čtvrtina nejméně slavných dosud
    // známých položek kategorie a slavnější než 90 % ostatních
    const quantile = (list, share) => {
        const sorted = [...list].sort((a, b) => a - b);
        return sorted.length ? sorted[Math.floor(share * (sorted.length - 1))] : Infinity;
    };
    const knownFame = {};
    for (const category of NEW_CATEGORIES) {
        for (const cz of [true, false]) {
            const list = present.filter(item => item.c === category && Boolean(item.cz) === cz);
            const fames = (known) => list.filter(item => (item.k === 1) === known).map(item => fameOfPresent.get(item.q));
            knownFame[`${category}|${cz}`] = Math.max(quantile(fames(true), 0.25), quantile(fames(false), 0.9));
            const show = (values) => [0.1, 0.25, 0.5, 0.75, 0.9].map(share => Math.round(quantile(values, share))).join('/');
            console.log(`  sláva ${category} ${cz ? 'Česko' : 'svět'}: známé ${show(fames(true))}, ostatní ${show(fames(false))}, noví kandidáti ${show(accepted.filter(entry => entry.category === category && entry.cz === cz).map(entry => entry.fame))}, mez ${Math.round(knownFame[`${category}|${cz}`])}`);
        }
    }
    // 4c. Nejslavnější do limitu (zveřejněné položky vždy), název bez kolize
    const taken = {};
    const fresh = [];
    for (const { candidate, detail, types, ty: found, category, cz, year, point, h, fame } of accepted.sort((a, b) => b.fame - a.fame || (a.candidate.q < b.candidate.q ? -1 : 1))) {
        const stratum = cz ? 'cz' : 'world';
        const published = publishedById.has(candidate.q);
        if (!published && ((taken[`${category}|${stratum}`] || 0) >= LIMITS[category][stratum] || (taken[found] || 0) >= (TYPE_LIMITS[found] ?? Infinity))) continue;
        let name = capitalize(detail.n || detail.t.replace(/ \(.*\)$/, ''));
        if (/^Q\d+$/.test(name) || ODD_NAME.test(name)) continue;
        if (!TYPE_WORD.test(name) && TYPE_WORD.test(detail.t) && normalizeName(detail.t).includes(normalizeName(name))) name = detail.t.replace(/ \(.*\)$/, '');
        // Jedna položka na název: stejně pojmenovaná stavba dostane název článku s upřesněním (Most Svobody (Budapešť))
        if (names.has(normalizeName(name))) name = detail.t;
        if (names.has(name.toLowerCase())) continue;
        const ty = buildingTypeFromName(name, found);
        if (CATEGORY_OF_TYPE.get(ty) !== category) continue;
        names.add(normalizeName(name));
        names.add(name.toLowerCase());
        taken[`${category}|${stratum}`] = (taken[`${category}|${stratum}`] || 0) + 1;
        taken[found] = (taken[found] || 0) + 1;
        const authors = (detail.arch || []).filter(isQid);
        const authorNames = authors.map(q => (architects.get(q) || {}).n || cs(q)).filter(Boolean);
        const style = styleOf(detail, types);
        const len = metres(detail.len, MAX_LENGTH);
        // Rok: zaokrouhlený rok před rokem 1500 (1300 = „14. století“) a hrad či zámek „postavený“ po roce 1900 (rok založení
        // muzea, rekonstrukce) Wikidata uvádějí jen přibližně nebo chybně – takový rok se vynechá
        const shown = style ? style.y : year;
        const castleYear = category === 'hrady' && shown >= 1900;
        fresh.push({
            q: candidate.q,
            t: detail.t,
            n: name,
            c: category,
            k: 0,
            ty,
            d: detail.d,
            cz: cz ? 1 : undefined,
            la: point.lat,
            lo: point.lon,
            co: (detail.co || []).filter(q => countries[q]),
            ...imageFields(detail.im),
            f: compact({
                st: style ? style.st : undefined,
                y: shown === undefined || (shown < 1500 && shown % 50 === 0) || castleYear ? undefined : shown,
                arch: authorNames.length && authorNames.length === authors.length ? authorNames.join(', ') : undefined,
                aq: authors.length === 1 && architects.has(authors[0]) ? authors[0] : undefined,
                city: cityOf((detail.loc || []).filter(isQid), point, parents, labels),
                unesco: (detail.her || []).includes('Q9259') ? 1 : undefined,
                h: category === 'mrakodrapy' ? h : undefined,
                len: category === 'mosty' ? len : undefined
            }),
            _: { fame, zemepis: zemepisKnown.has(candidate.q) }
        });
    }
    for (const category of NEW_CATEGORIES) {
        const list = fresh.filter(item => item.c === category);
        console.log(`Nové ${category}: ${list.length} (Česko ${list.filter(item => item.cz).length})`);
    }

    // 5. Úrovně nových položek: známé podle slávy (nebo známé v Zeměpisu), expertní nejméně slavný podíl kategorie;
    // zveřejněné položky si úroveň nechávají
    for (const item of fresh) {
        const old = publishedById.get(item.q);
        if (old && old.c === item.c) {
            item.k = old.k;
            if (old.x) item.x = 1;
            continue;
        }
        const famous = item._.fame >= knownFame[`${item.c}|${Boolean(item.cz)}`];
        item.k = !NEVER_KNOWN.has(item.q) && (ALWAYS_KNOWN.has(item.q) || item._.zemepis || famous) ? 1 : 0;
    }
    for (const category of NEW_CATEGORIES) {
        for (const cz of [true, false]) {
            const list = fresh.filter(item => item.c === category && Boolean(item.cz) === cz && !publishedById.has(item.q));
            const rest = list.filter(item => item.k !== 1).sort((a, b) => a._.fame - b._.fame);
            for (const item of rest.slice(0, Math.round(EXPERT_SHARE * list.length))) item.x = 1;
        }
    }

    // 6. Pořadí: v kategorii od nejslavnější; nové položky se zařadí mezi přesunuté (ty si pořadí nechají, i vůči ostatním stavbám)
    const fameOf = (item) => item._ ? item._.fame : fameOfPresent.get(item.q) || 0;
    const queues = new Map(NEW_CATEGORIES.map(category => [category, fresh.filter(item => item.c === category).sort((a, b) => fameOf(b) - fameOf(a))]));
    const ordered = [];
    const lastIndex = new Map();
    items.forEach((item, index) => { if (NEW_CATEGORIES.includes(item.c)) lastIndex.set(item.c, index); });
    // Kategorie bez přesunutých položek: nové za poslední stavbou
    const lastBuilding = items.reduce((last, item, index) => (BUILDING_CATEGORIES.has(item.c) ? index : last), -1);
    items.forEach((item, index) => {
        if (NEW_CATEGORIES.includes(item.c)) {
            const queue = queues.get(item.c);
            while (queue.length && fameOf(queue[0]) > fameOf(item)) ordered.push(queue.shift());
        }
        ordered.push(item);
        if (NEW_CATEGORIES.includes(item.c) && lastIndex.get(item.c) === index) ordered.push(...queues.get(item.c).splice(0));
        if (index === lastBuilding) for (const queue of queues.values()) ordered.push(...queue.splice(0));
    });

    // 7. Okruhy nových položek a minimum známých v okruhu (aspoň max(3, 25 %)), nejvýš 40 % expertních – jen u nových položek
    for (const item of fresh) {
        const groups = groupsOf(item);
        if (groups.length) item.g = groups;
    }
    const groupIds = [...new Set(ordered.flatMap(item => groupsOf(item)))];
    const promoted = [];
    for (const group of groupIds) {
        const members = ordered.filter(item => groupsOf(item).includes(group));
        if (members.length < 8) continue;
        const floor = Math.min(members.length, Math.max(3, Math.ceil(0.25 * members.length)));
        let knownCount = members.filter(item => item.k === 1).length;
        for (const item of members.filter(other => other._ && other.k !== 1 && !NEVER_KNOWN.has(other.q) && !publishedById.has(other.q)).sort((a, b) => fameOf(b) - fameOf(a))) {
            if (knownCount >= floor) break;
            item.k = 1;
            delete item.x;
            knownCount++;
            promoted.push(`${group}: ${item.n}`);
        }
        const experts = members.filter(item => item.x);
        const over = experts.length - Math.floor(0.4 * members.length);
        for (const item of experts.filter(other => other._).sort((a, b) => fameOf(b) - fameOf(a)).slice(0, Math.max(0, over))) delete item.x;
    }
    if (promoted.length) console.log(`Povýšené kvůli minimu okruhu: ${promoted.join('; ')}`);
    for (const item of fresh) {
        if (item.k === 1) delete item.x;
        delete item._;
    }
    for (const category of NEW_CATEGORIES) {
        const list = ordered.filter(item => item.c === category);
        console.log(`${category}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expertních ${list.filter(item => item.x).length}, nových ${fresh.filter(item => item.c === category).length})`);
    }
    return ordered;
};
