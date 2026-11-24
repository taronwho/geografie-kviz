// Vlajky a znaky – rozšíření o měny (kategorie meny „Měny a bankovky“): dnešní měny států, měny, které nahradilo euro nebo jiná
// měna (německá marka, koruna československá), a historické mince (pražský groš, tolar, dukát, denár).
//
// Používá build-vlajky.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/vlajky.json (node scripts/build-vlajky.mjs
// --doplnit). Dosavadní položky tématu se nemění (id, kategorie i úroveň zůstanou); měny, které už v datech jsou, si úroveň nechají.
//
// Kandidáti: měny států z Wikidat (P38 u států v data/countries.json – bez data konce dnešní, s datem konce dřívější), ruční
// seznam českých měn a historických mincí; jen s článkem na české Wikipedii, bez kryptoměn a bez položek, které má jiné téma
// (data/*.json). Obrázek (P18) jen bankovka nebo mince podle názvu souboru (ne symbol, logo, budova ani fotka trhu); obrázky
// jsou z Wikimedia Commons (svobodné licence, kontrola scripts/build-licenses.mjs). Nápis na bankovce s názvem měny najde OCR
// (scripts/photo-text.mjs) – taková fotka se jako nápověda nenabídne, jen po odpovědi a v atlasu.
//
// Známost: ruční seznam měn, které zná běžný Čech (KNOWN), doplněný spodní hranicí okruhů (scripts/lib/fame-levels.mjs);
// pro experty nejméně známá část podle jazykových verzí a návštěvnosti článku na české Wikipedii (EXPERT_SHARE).
import { readFileSync, readdirSync } from 'node:fs';
import { qlever, sparql, id, values, fileName, thumbHash, compact, cached, inBatches, yearOf } from './wikidata.mjs';
import { topicPageviews, assignLevels, levelSummary } from './fame-levels.mjs';

export const CATEGORY = 'meny';

const run = process.env.WIKIDATA_ENDPOINT === 'wdqs' ? (query) => sparql(query) : (query) => qlever(query, 2).catch(() => sparql(query));

// Dřívější měny států (P38 s datem konce): jen s aspoň tolika jazykovými verzemi (méně známé jsou jen přechodné měny)
const FORMER_MIN_SITELINKS = 40;
// Ruční seznam: české a československé měny, historické mince a drobné jednotky
const MANUAL = {
    // Měny českých zemí (koruna československá, protektorátní, rakousko-uherská, zlatý) a Slovenska
    Q103219993: 'zaniklá měna', Q700835: 'zaniklá měna', Q303713: 'zaniklá měna', Q306306: 'zaniklá měna', Q178874: 'zaniklá měna',
    // Historické mince
    Q539573: 'historická mince', Q162528: 'historická mince', Q202018: 'historická mince', Q187776: 'historická mince', Q208041: 'historická mince',
    Q231455: 'historická mince', Q384102: 'historická mince', Q1083662: 'historická mince', Q921668: 'historická mince', Q376895: 'historická mince',
    Q1430760: 'historická mince', Q918094: 'historická mince', Q127441: 'historická mince', Q599170: 'historická mince', Q424754: 'historická mince',
    Q18776: 'historická mince', Q848960: 'historická mince', Q3776933: 'historická mince', Q917019: 'historická mince', Q661854: 'historická mince',
    // Dřívější měny bez státu z data/countries.json (sovětský rubl, jugoslávský dinár, východoněmecká marka, říšská marka, livre)
    Q615640: 'zaniklá měna', Q373429: 'zaniklá měna', Q157011: 'zaniklá měna', Q155009: 'zaniklá měna', Q607248: 'zaniklá měna',
    // Drobné jednotky (setina koruny, dolaru, libry, rublu, marky)
    Q558904: 'drobná jednotka', Q58093: 'drobná jednotka', Q234129: 'drobná jednotka', Q1415602: 'drobná jednotka', Q165717: 'drobná jednotka'
};
// Měny bez státu, ke kterým patří (stát z data/countries.json): Sovětský svaz → Rusko by bylo nepřesné, proto jen ruční údaj země
const LAND = {
    Q103219993: 'Československo', Q700835: 'Protektorát Čechy a Morava', Q303713: 'Rakousko-Uhersko', Q306306: 'Rakousko-Uhersko', Q615640: 'Sovětský svaz',
    Q373429: 'Jugoslávie', Q157011: 'Německá demokratická republika', Q155009: 'Německá říše', Q607248: 'Francouzské království', Q539573: 'České království',
    Q162528: 'Svatá říše římská', Q208041: 'Starověký Řím', Q231455: 'Římská a Byzantská říše', Q384102: 'Starověké Řecko', Q1083662: 'Starověké Řecko',
    Q921668: 'Starověké Řecko', Q376895: 'Starověký Řím', Q1430760: 'Francouzské království', Q918094: 'Království Anglie', Q127441: 'Byzantská říše',
    Q599170: 'Starověký Řím', Q424754: 'Osmanská říše', Q18776: 'Rakousko a jihoněmecké státy', Q917019: 'Yap (Mikronésie)', Q661854: 'Osmanská říše',
    Q187776: 'Evropa', Q202018: 'Evropa', Q848960: 'Střední Evropa', Q3776933: 'Čechy'
};
// Doba ražby, kterou Wikidata nemají (pražský groš podle české Wikipedie 1300–1547, první tolar – guldiner – 1486,
// římský denár od roku 211 př. n. l.)
const PERIODS = { Q539573: [1300, 1547], Q162528: [1486, undefined], Q187776: [-211, undefined] };
// Drobné jednotky: čeho jsou setinou (nápověda a údaj po odpovědi)
const PARTS = { Q558904: 'setina koruny', Q58093: 'setina dolaru, eura a dalších měn', Q234129: 'setina libry', Q1415602: 'setina rublu a hřivny', Q165717: 'setina marky' };
// Další přijímané odpovědi (běžné české tvary)
const ALIASES = {
    Q131016: ['česká koruna'], Q103219993: ['československá koruna', 'Kčs'], Q25224: ['britská libra', 'libra'], Q4917: ['dolar', 'US dolar'],
    Q123213: ['polský zlotý'], Q173751: ['kazašské tenge', 'kazachstánské tenge'], Q183435: ['mongolský tugrik'], Q131645: ['rumunský leu'],
    Q16068: ['marka', 'D-marka'], Q131309: ['izraelský šekel', 'šekel'], Q39099: ['renminbi'], Q1546443: ['drachma'], Q203354: ['markka']
};
// Měny se státem z data/countries.json, které Wikidata u státu (P38) nemají
const EXTRA_STATES = { Q178874: ['Q214'] };
// Česká stopa: měny českých zemí
const CZECH = new Set(['Q131016', 'Q103219993', 'Q700835', 'Q303713', 'Q306306', 'Q539573', 'Q162528', 'Q558904', 'Q3776933']);
// Vynechané: obecné jednotky a skupiny měn (dinár, dirham, CFA frank), oběžné mince eura, zúčtovací jednotky, kryptoměny,
// měny neuznaných států a přechodné měny se stejným jménem jako dnešní (kubánské konvertibilní peso vedle kubánského pesa)
const SKIP = new Set(['Q191830', 'Q572664', 'Q191511', 'Q274474', 'Q572213', 'Q522295', 'Q363958', 'Q221828', 'Q1573250', 'Q731350', 'Q200979', 'Q1983857',
    'Q737384', 'Q14083', 'Q244696', 'Q339180', 'Q1189842', 'Q213142', 'Q125352135', 'Q56349362', 'Q6442872', 'Q134397947', 'Q96051466', 'Q542236', 'Q542304',
    'Q542238', 'Q834305', 'Q718101', 'Q2414435', 'Q1329465', 'Q2629054', 'Q1130620', 'Q107474036']);
// Kryptoměny a podobné (druh z Wikidat)
const CRYPTO_TYPES = new Set(['Q13479982', 'Q25401607', 'Q39049892', 'Q55648452']);
// Názvy, které Wikidata nemají česky nebo je mají jinak než článek (malé písmeno, „Ománský rial“)
const NAMES = { Q861690: 'Západoafrický frank', Q847739: 'Středoafrický frank', Q272290: 'Ománský rijál', Q204656: 'Peruánský sol', Q4916: 'Euro',
    Q165717: 'Fenik', Q58093: 'Cent', Q1430760: 'Louis d’or', Q918094: 'Guinea', Q917019: 'Rai', Q162528: 'Tolar', Q376895: 'As', Q203354: 'Finská marka' };
// Měny, které zná běžný Čech (Základní): sousedé a velké státy, měny před eurem u sousedů a v oblíbených zemích, české měny a mince
const KNOWN = new Set(['Q4916', 'Q4917', 'Q25224', 'Q8146', 'Q39099', 'Q41044', 'Q25344', 'Q131016', 'Q123213', 'Q47190', 'Q80524', 'Q172872', 'Q81893',
    'Q122922', 'Q132643', 'Q25417', 'Q1104069', 'Q259502', 'Q172540', 'Q131645', 'Q173117', 'Q4730', 'Q202040', 'Q177882', 'Q131309', 'Q199462', 'Q181907',
    'Q26360', 'Q16068', 'Q178874', 'Q103219993', 'Q204992', 'Q184172', 'Q189097', 'Q208730', 'Q1546443', 'Q788472', 'Q615640', 'Q539573', 'Q162528',
    'Q202018', 'Q187776', 'Q558904', 'Q58093', 'Q303713', 'Q1472704', 'Q172524', 'Q125999', 'Q41588', 'Q192090', 'Q131473',
    // Tunisko a Egypt jezdí Češi k moři
    'Q4602']);
// Podíl nejméně známých položek jen pro experty (jako u ostatních kategorií tématu)
const EXPERT_SHARE = 0.3;
// Obrázek měny (P18) bývá bankovka nebo mince; symbol, logo, mapa, budova, padělky, návrh a fotky lidí ne
const OFF_FILE = /(?:symbol|sign\b|logo|unicode|map\b|festival|rain\b|counterfeit|building|headquart|aftermath|proposal|t-shirt|\bbag\b)/iu;
// Zimbabwe u státu (P38) uvádí koš cizích měn (dolar, libra, jen, jüan, rupie, rand) – ty se mu nepřipisují
const MULTI_CURRENCY_STATES = new Set(['Q954']);

const simplify = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value.value.startsWith('http://www.wikidata.org/entity/') ? id(value.value) : value.value]));
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Ostatní témata: ID položek v data/*.json kromě Vlajek a znaků (žádná duplicita mezi tématy)
const otherTopicIds = () => {
    const dir = new URL('../../data/', import.meta.url);
    const ids = new Map();
    for (const file of readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'vlajky.json')) {
        try {
            const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
            for (const item of (Array.isArray(data.items) ? data.items : [])) if (item && item.q) ids.set(item.q, file.replace(/\.json$/, ''));
        } catch { /* jiný formát dat (licence, mapy) */ }
    }
    return ids;
};

// Druhá část názvu (forint, zlotý, dolar): jednotka, kterou hráč napíše; „Koruna česká“ → koruna
const unitOf = (name) => {
    const words = name.split(/\s+/);
    if (words.length === 1) return name;
    if (/^\p{Lu}\p{Ll}+(?:ský|ská|ské|cký|cká|cké)$/u.test(words[0])) return words.slice(1).join(' ');
    if (/^(?:Koruna|Dolar|Dirham|Gulden|Libra|Frank)$/u.test(words[0])) return words[0];
    return null;
};

export const extendVlajky = async ({ items, collections, countries }) => {
    const report = { added: [], skipped: [], duplicates: [] };
    const used = otherTopicIds();
    const own = new Set(items.filter(item => item.c !== CATEGORY).map(item => item.q));
    // Měny, které už v datech jsou: úroveň a okruhy se jim nemění (pokrok hráčů je na nich)
    const before = new Map(items.filter(item => item.c === CATEGORY).map(item => [item.q, item]));

    // --- 1. Měny států (P38) ---
    const stateIds = Object.keys(countries);
    const stateRows = await cached('vlajky-meny-states', async () => {
        const result = [];
        await inBatches(stateIds, 80, (batch) => `SELECT ?state ?cur ?end WHERE { VALUES ?state { ${values(batch)} } ?state p:P38 ?s . ?s ps:P38 ?cur ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?s pq:P582 ?end } }`, (row) => result.push(simplify(row)), run);
        return result;
    });
    const currentStates = new Map();
    const formerStates = new Map();
    for (const row of stateRows) {
        const target = row.end ? formerStates : currentStates;
        if (!target.has(row.cur)) target.set(row.cur, new Set());
        target.get(row.cur).add(row.state);
    }
    // Stát, který dnešní měnu přestal používat a jinou má (P38 bez konce i s koncem): měna je pro něj dřívější
    const candidateIds = [...new Set([...currentStates.keys(), ...formerStates.keys(), ...Object.keys(MANUAL)])].filter(q => !SKIP.has(q));

    // --- 2. Podrobnosti ---
    const detailRows = await cached('vlajky-meny-details', async () => {
        const result = [];
        await inBatches(candidateIds, 50, (batch) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(batch)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P498 ?v BIND("iso" AS ?p) }
  UNION { ?item wdt:P5061 ?v BIND("sym" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("img" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("start" AS ?p) }
  UNION { ?item wdt:P580 ?v BIND("start2" AS ?p) }
  UNION { ?item wdt:P576 ?v BIND("end" AS ?p) }
  UNION { ?item wdt:P582 ?v BIND("end2" AS ?p) }
  UNION { ?item wdt:P31 ?v BIND("type" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("land" AS ?p) }
  UNION { ?item wdt:P1365 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("prev" AS ?p) }
  UNION { ?item wdt:P1366 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("next" AS ?p) }
  UNION { ?item wdt:P562 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("bank" AS ?p) }
}`, (row) => result.push(simplify(row)), run);
        return result;
    });
    const LISTS = { img: 'imgs', sym: 'syms', type: 'types', prev: 'prev', next: 'next', bank: 'bank', iso: 'iso', land: 'lands', start: 'starts', start2: 'starts2', end: 'ends', end2: 'ends' };
    const details = new Map();
    for (const row of detailRows) {
        const entry = details.get(row.item) || { imgs: [], syms: [], types: [], prev: [], next: [], bank: [], iso: [], lands: [], starts: [], starts2: [], ends: [] };
        const value = row.p === 'img' ? fileName(row.v) : row.v;
        if (LISTS[row.p]) { if (!entry[LISTS[row.p]].includes(value)) entry[LISTS[row.p]].push(value); }
        else if (row.p === 'sl') entry.sl = Number(row.v);
        else if (!(row.p in entry)) entry[row.p] = row.v;
        details.set(row.item, entry);
    }

    // --- 3. Položky ---
    const fresh = [];
    for (const q of candidateIds) {
        const entry = details.get(q);
        if (!entry || !entry.t) { report.skipped.push(`${q} (bez článku na české Wikipedii)`); continue; }
        if (entry.types.some(type => CRYPTO_TYPES.has(type))) { report.skipped.push(`${entry.t} (kryptoměna)`); continue; }
        if (used.has(q)) { report.duplicates.push(`${entry.t} (${used.get(q)})`); continue; }
        if (own.has(q)) { report.duplicates.push(`${entry.t} (už v tématu)`); continue; }
        // Konec: poslední (litevský litas 1922–1941 a 1993–2015); zavedení: začátek platnosti (P580), jinak vznik (P571), nejdřívější
        const ends = entry.ends.map(yearOf).filter(Number.isFinite);
        const end = ends.length ? Math.max(...ends) : undefined;
        const starts = (entry.starts2.length ? entry.starts2 : entry.starts).map(yearOf).filter(Number.isFinite);
        const start = starts.length ? Math.min(...starts) : undefined;
        const home = entry.lands.filter(state => countries[state]);
        const current = [...(currentStates.get(q) || [])].filter(state => countries[state] && (!MULTI_CURRENCY_STATES.has(state) || home.includes(state)));
        const manual = MANUAL[q];
        // Měna s datem konce u státu i u sebe (bulharský lev od 2026) je dřívější, i když ji stát v P38 ještě uvádí bez konce
        const isCurrent = !manual && current.length > 0 && !end;
        const former = [...(formerStates.get(q) || []), ...(EXTRA_STATES[q] || [])].filter(state => countries[state]);
        if (!isCurrent && !manual && !(former.length && entry.sl >= FORMER_MIN_SITELINKS)) continue;
        const name = NAMES[q] || capitalize(entry.t.replace(/ \(.*\)$/, ''));
        // Měna země, která už není (Československo, Rakousko-Uhersko): země z ručního seznamu, ne dnešní stát
        const states = LAND[q] ? [] : isCurrent ? current : former.length ? former : (EXTRA_STATES[q] || []);
        const img = entry.imgs.find(file => !OFF_FILE.test(file));
        if (entry.imgs.length && !img) report.skipped.push(`obrázek ${entry.imgs.join(', ')} (${name}: ne bankovka ani mince)`);
        const symbols = entry.syms.filter(sym => sym && sym !== entry.iso[0] && sym.length <= 4);
        const unit = unitOf(name);
        fresh.push(compact({
            q, t: entry.t, n: name, c: CATEGORY,
            ty: manual || (isCurrent ? 'měna' : 'zaniklá měna'),
            cz: CZECH.has(q) ? 1 : undefined,
            // Státy, kde se měnou platí (platilo); domovský stát (vydává ji) první, pak podle abecedy
            co: states.length ? states.slice().sort((a, b) => (home.includes(b) - home.includes(a)) || countries[a].name.localeCompare(countries[b].name, 'cs')) : undefined,
            d: entry.d,
            im: img, ih: img ? thumbHash(img) : undefined,
            f: compact({
                iso: entry.iso.find(code => /^[A-Z]{3}$/.test(code)),
                sym: symbols.length ? symbols.slice(0, 2).join(', ') : undefined,
                from: PERIODS[q] ? PERIODS[q][0] : start, to: isCurrent ? undefined : PERIODS[q] ? PERIODS[q][1] : end,
                land: states.length ? undefined : LAND[q],
                part: PARTS[q],
                prev: entry.prev.length ? entry.prev.slice(0, 2).join(', ') : undefined,
                next: entry.next.length ? entry.next.slice(0, 2).join(', ') : undefined,
                bank: entry.bank.length ? entry.bank.slice(0, 1).join(', ') : undefined
            }),
            _: { sl: entry.sl || 0, unit }
        }));
    }
    // Stejný název dvakrát (dva záznamy jedné měny) – zůstane známější
    const seen = new Map();
    for (const item of [...fresh].sort((a, b) => b._.sl - a._.sl)) {
        const key = item.n.toLocaleLowerCase('cs');
        if (seen.has(key)) { report.skipped.push(`${item.n} ${item.q} (stejný název jako ${seen.get(key)})`); item._.drop = true; } else seen.set(key, item.q);
    }
    const list = fresh.filter(item => !item._.drop);
    // Jednotka jako další přijímaná odpověď (forint, zlotý), jen když ji nemá jiná měna (dolar, frank ne)
    const unitCount = new Map();
    for (const item of list) if (item._.unit) unitCount.set(item._.unit.toLocaleLowerCase('cs'), (unitCount.get(item._.unit.toLocaleLowerCase('cs')) || 0) + 1);
    for (const item of list) {
        const unit = item._.unit;
        const aliases = [...(unit && unit !== item.n && unitCount.get(unit.toLocaleLowerCase('cs')) === 1 ? [unit] : []), ...(ALIASES[item.q] || [])];
        if (aliases.length) item.al = [...new Set(aliases)];
    }

    // --- 4. Okruhy ---
    // Kontinent domovského státu (americký dolar Severní Amerika, i když jím platí Ekvádor nebo Palau); euro Evropa
    const continentOf = (item) => item.q === 'Q4916' ? 'EU' : (item.co || []).length ? countries[item.co[0]].continent : null;
    const today = (item) => item.ty === 'měna';
    const euroStates = currentStates.get('Q4916') || new Set();
    const beforeEuro = (item) => item.ty === 'zaniklá měna' && (item.f.to || 0) >= 1999 && (item.co || []).some(state => euroStates.has(state));
    const NEW_COLLECTIONS = [
        { id: 'meny-evropy', label: 'Měny Evropy', test: item => today(item) && (continentOf(item) === 'EU' || item.q === 'Q4916') },
        { id: 'meny-asie', label: 'Měny Asie', test: item => today(item) && continentOf(item) === 'AS' },
        { id: 'meny-afriky', label: 'Měny Afriky', test: item => today(item) && continentOf(item) === 'AF' },
        // Oceánie samostatně by měla jen deset měn (skoro samé dolary) – s Amerikou, kde jsou dolary také
        { id: 'meny-ameriky-oceanie', label: 'Měny Ameriky a Oceánie', text: 'Dolary, pesa, Austrálie a ostrovy Tichomoří', test: item => today(item) && ['NA', 'SA', 'OC'].includes(continentOf(item)) },
        { id: 'meny-pred-eurem', label: 'Měny před eurem', text: 'Marka, frank, lira, peseta…', test: beforeEuro },
        { id: 'zanikle-meny', label: 'Zaniklé měny', text: 'Koruna československá, sovětský rubl…', test: item => item.ty === 'zaniklá měna' && !beforeEuro(item) },
        { id: 'historicke-mince', label: 'Historické mince', text: 'Groš, tolar, dukát, denár…', test: item => item.ty === 'historická mince' || item.ty === 'drobná jednotka' }
    ];
    for (const item of list) {
        const groups = NEW_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
        if (groups.length) item.g = groups;
    }
    for (const collection of NEW_COLLECTIONS) {
        if (!collections.some(other => other.id === collection.id)) collections.push(Object.fromEntries(Object.entries(collection).filter(([key]) => key !== 'test')));
    }

    // --- 5. Úrovně: známé podle ručního seznamu, experti podle jazykových verzí a návštěvnosti české Wikipedie ---
    const pageviews = await topicPageviews('vlajky-meny-pageviews', list.map(item => item.t), { offline: process.env.PAGEVIEWS_OFFLINE === '1' });
    for (const item of list) {
        item.k = KNOWN.has(item.q) ? 1 : 0;
        item._ = { ...item._, pv: pageviews[item.t], pool: CATEGORY, never: !KNOWN.has(item.q) && item.ty === 'drobná jednotka' };
    }
    const groups = [
        ...NEW_COLLECTIONS.map(collection => ({ id: collection.id, members: list.filter(item => (item.g || []).includes(collection.id)) })),
        { id: `c:${CATEGORY}`, members: list }
    ];
    const promoted = assignLevels(list, { expertShare: () => EXPERT_SHARE, pvWeight: () => 0.6, ceiling: () => 0.25, groups });
    report.promoted = promoted.map(([group, name]) => `${name} (${group})`);
    // Měny z dřívějšího sestavení: úroveň zůstane
    for (const item of list) {
        const old = before.get(item.q);
        if (!old) continue;
        item.k = old.k;
        if (old.x) item.x = old.x; else delete item.x;
    }
    // Pořadí podle známosti (Tajemná otázka a atlas berou začátek kategorie jako nejznámější)
    list.sort((a, b) => (b.k || 0) - (a.k || 0) || a._.pct - b._.pct);
    report.summary = [levelSummary('měny', list), ...NEW_COLLECTIONS.map(collection => levelSummary(`okruh ${collection.id}`, list.filter(item => (item.g || []).includes(collection.id))))];
    for (const item of list) delete item._;
    // Zmizelá měna z dřívějšího sestavení zůstane (pokrok hráčů)
    const kept = new Set(list.map(item => item.q));
    const lost = [...before.values()].filter(item => !kept.has(item.q));
    report.lost = lost.map(item => item.n);
    const rest = items.filter(item => item.c !== CATEGORY);
    items.length = 0;
    items.push(...rest, ...list, ...lost);
    report.added = list.filter(item => !before.has(item.q)).map(item => `${item.n} (${item.ty}${item.k ? ', známá' : item.x ? ', expert' : ''})`);
    return report;
};

export const printReport = (report) => {
    console.log(`Měny: nové ${report.added.length}\n  ${report.added.join('\n  ')}`);
    if (report.promoted.length) console.log(`Spodní hranice známých povýšila: ${report.promoted.join(', ')}`);
    console.log(`Duplicity s jinými tématy (vynechané): ${report.duplicates.join(', ') || 'žádné'}`);
    console.log(`Vynecháno: ${report.skipped.length}\n  ${report.skipped.join('\n  ')}`);
    if (report.lost.length) console.log(`Zůstaly z dřívějška (už je Wikidata nevedou): ${report.lost.join(', ')}`);
    console.log(report.summary.join('\n'));
};
