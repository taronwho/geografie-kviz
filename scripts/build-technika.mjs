// Téma Technika a vynálezy: data/technika.json z Wikidat – vynálezci, vynálezy a stroje, auta a automobilky, vlaky a tramvaje,
// letadla a vzducholodě, lodě a ponorky, počítače a elektronika, internet a software, technické stavby (elektrárny, letiště, metra,
// kosmodromy, tunely) a slavné firmy.
// Spuštění: npm run build:technika (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování; PAGEVIEWS_OFFLINE=1 = návštěvnost
// jen z mezipaměti). Položky z ručních seznamů (lib/technika-sources.mjs) a z tříd Wikidat; co už je v jiném tématu, se vynechá.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sparql, id, values, parsePoint, fileName, imageFields, yearOf, compact, sleep, readCountries, writeTopic, cleanDescription } from './lib/wikidata.mjs';
import { topicPageviews, assignLevels, levelGroups, levelSummary } from './lib/fame-levels.mjs';
import { cachedByKey } from './lib/zemepis-levels.mjs';
import { CATEGORY_SOURCES, GLOBAL_EXCLUDE, PERSON_WORKS, INVENTION_FACTS, NAME_OVERRIDES, DESCRIPTION_OVERRIDES } from './lib/technika-sources.mjs';

// Národnost z popisu („jihokorejský výrobce automobilů“ → Jižní Korea) stejně jako ve hře (quiz-core.js)
const core = createRequire(import.meta.url)('../quiz-core.js');

const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q1206012', 'Q191077']);
const FEMALE = 'Q6581072';
const THIS_YEAR = new Date().getFullYear();
const CATEGORY_ORDER = ['vynalezci', 'vynalezy', 'auta', 'vlaky', 'letadla', 'lode', 'elektronika', 'software', 'stavby', 'firmy'];
const countries = readCountries();

// --- 1. krok: co už je v jiných tématech (stejná položka nemá být ve dvou tématech) ---
const OTHER = new Set();
const OTHER_TITLES = new Set();
for (const file of readdirSync(new URL('../data/', import.meta.url))) {
    const topicId = file.replace(/\.json$/, '');
    if (!/^(zemepis|historie|biologie|chemie|fyzika|vlajky|mytologie|geologie|umeni|architektura|hudba|literatura|film|sport)$/.test(topicId)) continue;
    const data = JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
    for (const item of data.items) { OTHER.add(item.q); if (item.t) OTHER_TITLES.add(item.t); }
}
const run = (query) => sparql(query);

// --- 2. krok: ruční seznamy (podle názvu článku) a nejznámější položky tříd ---
const parseEntry = (entry) => {
    const flag = entry[0] === '*' ? 'known' : entry[0] === '!' ? 'never' : null;
    const name = flag ? entry.slice(1) : entry;
    return name.endsWith('@en') ? { en: name.slice(0, -3), flag } : { title: name, flag };
};
const esc = (text) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const lookupTitles = async (titles) => {
    const found = {};
    for (let i = 0; i < titles.length; i += 60) {
        const batch = titles.slice(i, i + 60);
        const rows = await run(`SELECT ?title ?item ?sl WHERE {
            VALUES ?title { ${batch.map(title => `"${esc(title)}"@cs`).join(' ')} }
            ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?title .
            ?item wikibase:sitelinks ?sl . }`);
        for (const row of rows) found[row.title.value] = { q: id(row.item.value), sl: Number(row.sl.value) };
        await sleep(400);
    }
    return found;
};
const lookupEnglish = async (labels) => {
    const found = {};
    for (const label of labels) {
        const rows = await run(`SELECT ?item ?title ?sl WHERE {
            VALUES ?name { "${esc(label)}"@en "${esc(label)}"@mul } ?item rdfs:label ?name .
            ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?title .
            ?item wikibase:sitelinks ?sl . } ORDER BY DESC(?sl) LIMIT 1`);
        if (rows[0]) found[label] = { q: id(rows[0].item.value), title: rows[0].title.value, sl: Number(rows[0].sl.value) };
        await sleep(300);
    }
    return found;
};
const classPool = async (cls, limit) => {
    const rows = await run(`SELECT ?item ?title ?sl WHERE {
        ?item wdt:P31 wd:${cls} .
        ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?title .
        ?item wikibase:sitelinks ?sl . } ORDER BY DESC(?sl) LIMIT ${limit * 3}`);
    return rows.map(row => ({ q: id(row.item.value), title: row.title.value, sl: Number(row.sl.value), cls }));
};

console.log('Hledám položky…');
// Mezipaměť po názvech a třídách (BUILD_CACHE): po úpravě ručních seznamů se dohledá jen to, co v ní ještě není
const allTitles = [];
const allEnglish = [];
for (const source of Object.values(CATEGORY_SOURCES)) {
    for (const entry of source.forced.map(parseEntry)) entry.en ? allEnglish.push(entry.en) : allTitles.push(entry.title);
}
const none = (keys, found) => Object.fromEntries(keys.map(key => [key, found[key] || null]));
const byTitle = await cachedByKey('technika-titles', allTitles, async (missing) => none(missing, await lookupTitles(missing)));
const byEnglish = await cachedByKey('technika-english', allEnglish, async (missing) => none(missing, await lookupEnglish(missing)));
const poolKeys = Object.values(CATEGORY_SOURCES).flatMap(source => source.classes.map(([cls, limit]) => `${cls}:${limit}`));
const pools = await cachedByKey('technika-pools', poolKeys, async (missing) => {
    const result = {};
    for (const key of missing) {
        const [cls, limit] = key.split(':');
        result[key] = await classPool(cls, Number(limit));
        await sleep(500);
    }
    return result;
});
const candidates = {
    byTitle, byEnglish,
    pools: Object.fromEntries(Object.entries(CATEGORY_SOURCES).map(([category, source]) => [category, source.classes.map(([cls, limit]) => ({ cls, limit, rows: pools[`${cls}:${limit}`] }))]))
};

const picked = new Map();
const missing = [];
const isExcluded = (title, source) => GLOBAL_EXCLUDE.test(title) || source.exclude.some(pattern => pattern.test(title));
for (const category of CATEGORY_ORDER) {
    const source = CATEGORY_SOURCES[category];
    for (const entry of source.forced.map(parseEntry)) {
        const hit = entry.en ? candidates.byEnglish[entry.en] : candidates.byTitle[entry.title];
        if (!hit) { missing.push(`${category}: ${entry.en || entry.title}`); continue; }
        const title = entry.en ? hit.title : entry.title;
        if (OTHER.has(hit.q) || OTHER_TITLES.has(title) || picked.has(hit.q) || isExcluded(title, source)) continue;
        picked.set(hit.q, { q: hit.q, t: title, sl: hit.sl, c: category, flag: entry.flag, forced: true });
    }
}
for (const category of CATEGORY_ORDER) {
    const source = CATEGORY_SOURCES[category];
    for (const { limit, rows } of candidates.pools[category] || []) {
        let taken = 0;
        for (const row of rows) {
            if (taken >= limit) break;
            if (OTHER.has(row.q) || OTHER_TITLES.has(row.title) || isExcluded(row.title, source)) continue;
            if (!picked.has(row.q)) picked.set(row.q, { q: row.q, t: row.title, sl: row.sl, c: category, cls: row.cls });
            taken++;
        }
    }
}
if (missing.length) console.log(`\nNenalezeno (${missing.length}):\n  ${missing.join('\n  ')}`);
console.log(`Kandidátů: ${picked.size}`);

// --- 3. krok: podrobnosti z Wikidat po dávkách ---
const qids = [...picked.keys()];
const details = await cachedByKey('technika-details', qids, async (wanted) => {
    const result = Object.fromEntries(wanted.map(q => [q, { rel: {}, dates: {}, nums: {} }]));
    for (let i = 0; i < wanted.length; i += 40) {
        const batch = wanted.slice(i, i + 40);
        const basics = await run(`SELECT ?item ?label ?desc ?img WHERE { VALUES ?item { ${values(batch)} }
            OPTIONAL { ?item rdfs:label ?label FILTER(lang(?label) = 'cs') }
            OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc) = 'cs') }
            OPTIONAL { ?item wdt:P18 ?img } }`);
        for (const row of basics) {
            const entry = result[id(row.item.value)];
            if (row.label && !entry.label) entry.label = row.label.value;
            if (row.desc && !entry.desc) entry.desc = row.desc.value;
            if (row.img && !entry.img) entry.img = row.img.value;
        }
        const dates = await run(`SELECT ?item ?p ?date WHERE { VALUES ?item { ${values(batch)} }
            VALUES ?p { wdt:P569 wdt:P570 wdt:P571 wdt:P577 wdt:P606 wdt:P729 wdt:P1619 wdt:P580 wdt:P575 wdt:P576 wdt:P582 wdt:P730 wdt:P746 wdt:P2754 }
            ?item ?p ?date . }`);
        for (const row of dates) {
            const year = yearOf(row.date.value);
            if (year === undefined) continue;
            const key = id(row.p.value);
            const entry = result[id(row.item.value)].dates;
            entry[key] = entry[key] === undefined ? year : Math.min(entry[key], year);
        }
        const relations = await run(`SELECT ?item ?p ?v ?vl WHERE { VALUES ?item { ${values(batch)} }
            VALUES ?p { wdt:P31 wdt:P176 wdt:P178 wdt:P287 wdt:P61 wdt:P112 wdt:P159 wdt:P17 wdt:P495 wdt:P27 wdt:P21 wdt:P131 wdt:P137 wdt:P106 wdt:P800 wdt:P749 wdt:P127 wdt:P279 wdt:P452 wdt:P8047 wdt:P1071 }
            ?item ?p ?v . FILTER(isIRI(?v))
            OPTIONAL { ?v rdfs:label ?vl FILTER(lang(?vl) = 'cs') } }`);
        for (const row of relations) {
            const key = id(row.p.value);
            const entry = result[id(row.item.value)].rel;
            const value = { q: id(row.v.value), l: row.vl ? row.vl.value : '' };
            entry[key] = entry[key] || [];
            if (!entry[key].some(other => other.q === value.q)) entry[key].push(value);
        }
        const numbers = await run(`SELECT ?item ?k ?v WHERE { VALUES ?item { ${values(batch)} }
            { ?item wdt:P625 ?v . BIND('coord' AS ?k) }
            UNION { ?item p:P2109/psn:P2109/wikibase:quantityAmount ?v . BIND('watt' AS ?k) }
            UNION { ?item p:P2052/psn:P2052/wikibase:quantityAmount ?v . BIND('speed' AS ?k) }
            UNION { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?v . BIND('len' AS ?k) }
            UNION { ?item wdt:P1092 ?v . BIND('built' AS ?k) }
            UNION { ?item wdt:P3872 ?v . BIND('pax' AS ?k) }
            UNION { ?item wdt:P1128 ?v . BIND('staff' AS ?k) } }`);
        for (const row of numbers) {
            const entry = result[id(row.item.value)].nums;
            const key = row.k.value;
            if (key === 'coord') { if (!entry.coord) entry.coord = row.v.value; continue; }
            const value = Number(row.v.value);
            if (Number.isFinite(value)) entry[key] = Math.max(entry[key] || 0, value);
        }
        process.stdout.write(`  podrobnosti ${Math.min(i + 40, wanted.length)}/${wanted.length}\r`);
        await sleep(500);
    }
    return result;
});

// Jména, která jsou ve všech jazycích stejná (iPhone, Facebook, Toyota), mají Wikidata jen jako vícejazyčný štítek (mul), ne český
const unlabeled = qids.filter(q => details[q] && !details[q].label);
const mulLabels = await cachedByKey('technika-mul', unlabeled, async (wanted) => {
    const result = Object.fromEntries(wanted.map(q => [q, null]));
    for (let i = 0; i < wanted.length; i += 80) {
        const rows = await run(`SELECT ?item ?label WHERE { VALUES ?item { ${values(wanted.slice(i, i + 80))} } ?item rdfs:label ?label FILTER(lang(?label) = 'mul') }`);
        for (const row of rows) result[id(row.item.value)] = row.label.value;
        await sleep(400);
    }
    return result;
});
for (const q of unlabeled) if (mulLabels[q]) details[q].label = mulLabels[q];

// Položka, jejíž první obrázek je kresba, logo nebo TIF (iPhone ve vektoru, logo Trabantu), dostane jinou hodnotu P18, pokud je fotkou
const isPhotoFile = (url) => Boolean(url) && core.isRealPhoto(fileName(url).replace(/\.png$/i, '.jpg'));
const drawn = qids.filter(q => details[q] && details[q].img && !isPhotoFile(details[q].img));
const otherImages = await cachedByKey('technika-images', drawn, async (wanted) => {
    const result = Object.fromEntries(wanted.map(q => [q, []]));
    for (let i = 0; i < wanted.length; i += 80) {
        const rows = await run(`SELECT ?item ?img WHERE { VALUES ?item { ${values(wanted.slice(i, i + 80))} } ?item wdt:P18 ?img }`);
        for (const row of rows) result[id(row.item.value)].push(row.img.value);
        await sleep(400);
    }
    return result;
});
for (const q of drawn) {
    const photo = (otherImages[q] || []).find(isPhotoFile);
    if (photo) details[q].img = photo;
}

// --- 4. krok: položky podle kategorií ---
const has = (entry, key, q) => (entry.rel[key] || []).some(value => value.q === q);
const labelsOf = (entry, key) => (entry.rel[key] || []).map(value => value.l).filter(Boolean);
const qidsOf = (entry, key) => (entry.rel[key] || []).map(value => value.q);
const countryName = (q, fallback = '') => (countries[q] && countries[q].name) || fallback;
// Země z výroků (P17 stát, P495 země původu, P27 občanství); historické státy českým názvem z Wikidat
const landOf = (entry, keys) => {
    for (const key of keys) {
        for (const value of entry.rel[key] || []) {
            const name = countryName(value.q, value.l);
            if (name) return { name, q: value.q };
        }
    }
    return null;
};
const words = (text) => String(text || '').toLowerCase();
const firstYear = (entry, keys) => keys.map(key => entry.dates[key]).find(year => Number.isInteger(year) && year <= THIS_YEAR);

// Druh položky (štítek u otázky): podle popisu a tříd
const kindOf = (category, entry, item) => {
    const desc = words(entry.desc);
    const title = words(item.t);
    const classes = new Set([...qidsOf(entry, 'P31'), ...qidsOf(entry, 'P279')]);
    // Druh i podle názvů tříd (P31, P279), když popis chybí (Wii, Dreamcast: „domácí herní konzole“)
    const classText = words([...labelsOf(entry, 'P31'), ...labelsOf(entry, 'P279')].join(' '));
    const test = (pattern) => pattern.test(desc) || pattern.test(title) || pattern.test(classText);
    if (category === 'vynalezci') {
        const female = has(entry, 'P21', FEMALE);
        const NOUNS = [['vynálezce', 'vynálezkyně'], ['konstruktér', 'konstruktérka'], ['inženýr', 'inženýrka'], ['informatik', 'informatička'], ['programátor', 'programátorka'],
            ['průmyslník', 'průmyslnice'], ['podnikatel', 'podnikatelka'], ['letec', 'letkyně'], ['matematik', 'matematička'], ['fyzik', 'fyzička'], ['chemik', 'chemička'],
            ['kosmonaut', 'kosmonautka'], ['technik', 'technička'], ['mechanik', 'mechanička'], ['zbrojíř', 'zbrojířka'], ['manažer', 'manažerka', 'manažér'],
            ['pilot', 'pilotka'], ['designér', 'designérka'], ['elektrotechnik', 'elektrotechnička'], ['vědec', 'vědkyně'], ['tvůrce', 'tvůrkyně'], ['ceo', 'ceo']];
        const found = desc.split(/[\s,;()]+/u).map(word => NOUNS.find(pair => pair.includes(word))).find(Boolean);
        if (found && found[0] === 'ceo') return female ? 'manažerka' : 'manažer';
        return found ? found[female ? 1 : 0] : female ? 'vynálezkyně' : 'vynálezce';
    }
    if (category === 'vynalezy') {
        if (/tramvaj|trolejbus|autobus|automobil|motocykl|vrtulník|kolo$|koloběžk|segway|vznášedl|lanov|vozidl|dopravní prostředek|raket|ponork|letoun|balón|vzducholo|loď|lokomotiv|metro|maglev|monorail|kluzák|rogalo|hydroplán|parník|plachetnic|ledoborec|tanker|tank/u.test(title + ' ' + desc)) return 'dopravní prostředek';
        if (/spotřebič|chladnič|pračk|žehlič|kávovar|toustovač|vysoušeč|konvic|myčk|sušičk|vysavač|odšťavňovač|mixér|sporák|vařič|trouba/u.test(title + ' ' + desc)) return 'domácí spotřebič';
        if (/lékař|zdravot|srdc|srdeční|inzulin|sluch|tomograf|rezonanc|defibril|kardio|naslouch/u.test(title + ' ' + desc)) return 'zdravotnický přístroj';
        if (/(?<!pří)stroj|jeřáb|rypadl|buldozer|traktor|kombajn|pila|vrtačk|kladkostroj|dopravník|turbín|generátor|motor|převodovk|ložisk|kolo|kladka|šroub/u.test(title + ' ' + desc)) return 'stroj';
        if (/elektronick|počítač|disk|usb|wi-fi|bluetooth|paměť|obrazovk|monitor|modem|router|tiskárn|skener|kopírk|telefon|tablet|notebook|konzol|hodinky|čtečk|kamera|fotoaparát|televiz|rozhlas|mikrofon|reproduktor|sluchátk|dvd|vhs|magnetofon|kompaktní/u.test(title + ' ' + desc)) return 'přístroj';
        return 'vynález';
    }
    if (category === 'auta') {
        // Firma: třída automobilky či podniku (Tesla je „veřejně obchodovaná společnost“), nebo popis začínající výrobcem
        const COMPANY = ['Q786820', 'Q10429667', 'Q4830453', 'Q6881511', 'Q891723', 'Q783794', 'Q167037', 'Q15081030'];
        if (COMPANY.some(cls => qidsOf(entry, 'P31').includes(cls)) || /^(\p{L}+ ){0,2}(automobilka|výrobce|značka)(?!\p{L})/u.test(desc)) return 'automobilka';
        if (/nákladní/u.test(desc)) return 'nákladní automobil';
        if (/elektromobil|elektrický automobil|elektroauto/u.test(desc)) return 'elektromobil';
        if (/sportovní|supersport|závodní/u.test(desc)) return 'sportovní automobil';
        if (/terénní|suv/u.test(desc)) return 'terénní automobil';
        if (/dodávk|užitkov/u.test(desc)) return 'užitkový automobil';
        return 'osobní automobil';
    }
    if (category === 'vlaky') {
        if (test(/tramvaj/u)) return 'tramvaj';
        if (test(/trať|magistrál/u)) return 'železniční trať';
        if (classes.has('Q13402959') || test(/vysokorychlostn|maglev|magnetick/u)) return 'vysokorychlostní vlak';
        if (test(/parní lokomotiv|parních lokomotiv/u)) return 'parní lokomotiva';
        if (test(/elektrick\p{L}* lokomotiv/u)) return 'elektrická lokomotiva';
        if (test(/motorov\p{L}* lokomotiv|dieselov|dieselelektr/u)) return 'motorová lokomotiva';
        if (test(/elektrick\p{L}* jednotk/u)) return 'elektrická jednotka';
        if (test(/motorov\p{L}* jednotk|motorov\p{L}* vůz|motorák/u)) return 'motorový vůz';
        if (classes.has('Q15141321') || classes.has('Q67454740') || test(/vlakov\p{L}* spoj|vlak\b|expres/u)) return 'vlak';
        if (test(/lokomotiv/u)) return 'lokomotiva';
        return 'železniční vozidlo';
    }
    if (category === 'letadla') {
        if (classes.has('Q133585') || test(/vzducholo/u)) return 'vzducholoď';
        if (test(/vrtulník/u)) return 'vrtulník';
        if (test(/bezpilotn|dron/u)) return 'bezpilotní letoun';
        if (test(/bombard/u)) return 'bombardér';
        if (test(/stíhac|stíhač|bitevní letoun|víceúčelov/u)) return 'stíhací letoun';
        if (test(/dopravní letadl|dopravní letoun|dopravní proudov|osobní letadl|úzkotrup|širokotrup|regionální/u)) return 'dopravní letadlo';
        if (test(/transportní|nákladní/u)) return 'transportní letoun';
        if (test(/cvičn|akrobati/u)) return 'cvičný letoun';
        if (test(/průzkum/u)) return 'průzkumný letoun';
        if (test(/kluzák|větroň/u)) return 'kluzák';
        return 'letadlo';
    }
    if (category === 'lode') {
        if (test(/ponork/u) || classes.has('Q2811')) return 'ponorka';
        if (test(/letadlov/u) || classes.has('Q17205')) return 'letadlová loď';
        if (test(/bitevní loď|bitevní lodí|bitevní křižník/u) || classes.has('Q182531')) return 'bitevní loď';
        if (test(/křižník|torpédoborec|fregat|korvet|válečn/u) || classes.has('Q161705')) return 'válečná loď';
        if (test(/výletní|okružní plavb/u) || classes.has('Q39804')) return 'výletní loď';
        if (test(/zaoceánsk|transatlantick|osobní parník|parní loď|parník/u) || classes.has('Q697196')) return 'parník';
        if (test(/plachetn|bark|galeon|karak|fregata|klipr|šalupa/u) || classes.has('Q170483')) return 'plachetnice';
        if (test(/ledoborec/u)) return 'ledoborec';
        if (test(/vor/u)) return 'vor';
        if (test(/batyskaf|hlubinn/u)) return 'hlubinné plavidlo';
        if (test(/kontejner|tanker|nákladní|ropn/u)) return 'nákladní loď';
        return 'loď';
    }
    if (category === 'elektronika') {
        if (test(/kapesní herní|přenosná herní|handheld/u) || classes.has('Q941818')) return 'kapesní herní konzole';
        if (test(/herní konzol|videoherní konzol/u) || classes.has('Q17589470')) return 'herní konzole';
        if (test(/chytrý telefon|smartphone/u)) return 'chytrý telefon';
        if (test(/mobilní telefon|telefon/u)) return 'mobilní telefon';
        if (test(/tablet/u)) return 'tablet';
        if (test(/notebook|laptop/u)) return 'notebook';
        if (test(/hodinky/u)) return 'chytré hodinky';
        if (test(/přehrávač|walkman|discman|sluchátk/u)) return 'hudební přehrávač';
        if (test(/fotoaparát|kamera/u)) return 'fotoaparát';
        if (test(/čtečk/u)) return 'čtečka knih';
        if (test(/počítač|computer|mikropočítač/u) || classes.has('Q55990535') || classes.has('Q473708')) return 'počítač';
        return 'přístroj';
    }
    if (category === 'software') {
        if (classes.has('Q9143') || test(/programovací jazyk|značkovací jazyk|dotazovací jazyk|stylový jazyk|jazyk pro/u)) return 'programovací jazyk';
        if (classes.has('Q9135') || classes.has('Q920890') || test(/operační systém|distribuce linuxu|linuxová distribuce/u)) return 'operační systém';
        if (classes.has('Q6368') || test(/webový prohlížeč|prohlížeč/u)) return 'webový prohlížeč';
        if (classes.has('Q3220391') || test(/sociální síť|sociální médi/u)) return 'sociální síť';
        if (test(/kryptoměn/u)) return 'kryptoměna';
        if (test(/vyhledávač/u)) return 'vyhledávač';
        if (test(/videohr|počítačová hra/u)) return 'počítačová hra';
        if (test(/komunikační|zasílání zpráv|messenger|videohovor|chat/u)) return 'komunikační aplikace';
        if (test(/streamovac|hudební služb|video služb|videoslužb/u)) return 'streamovací služba';
        if (test(/server|web|portál|internetov/u)) return 'webová služba';
        return 'program';
    }
    if (category === 'stavby') {
        if (test(/jadern\p{L}* elektrár/u) || classes.has('Q134447')) return 'jaderná elektrárna';
        if (test(/vodní elektrár|přečerpávac|hydroelektr|přehrad|hráz/u) || classes.has('Q15911738')) return 'vodní elektrárna';
        if (test(/elektrár|teplár/u) || classes.has('Q6558431')) return 'tepelná elektrárna';
        if (test(/letiště/u) || classes.has('Q644371') || classes.has('Q1248784')) return 'letiště';
        if (test(/metro|u-bahn|podzemní dráh/u) || classes.has('Q5503')) return 'metro';
        if (test(/kosmodrom|kosmické středisko|kosmické centrum|vesmírné středisko|space|starbase|základna/u) || classes.has('Q194188')) return 'kosmodrom';
        if (test(/tunel/u)) return 'tunel';
        if (test(/urychlovač/u)) return 'urychlovač částic';
        return 'technická stavba';
    }
    return 'firma';
};

// Země položky pro kulturu jmen a nápovědy
const LAND_KEYS = {
    vynalezci: ['P27'], vynalezy: ['P495'], auta: ['P495', 'P17'], vlaky: ['P495', 'P17'], letadla: ['P495', 'P17'], lode: ['P8047', 'P17', 'P495'],
    elektronika: ['P495', 'P17'], software: ['P495', 'P17'], stavby: ['P17'], firmy: ['P17', 'P495']
};
// Výrobce (u aut, vlaků, letadel, lodí a přístrojů), vývojář (software), u firem a automobilek zakladatelé
// Smluvní výrobci elektroniky (Foxconn skládá Wii, Wistron Xbox 360) nejsou „výrobcem“, jak ho zná hráč: přednost má značka
const CONTRACT_MAKERS = /^(Foxconn|Wistron|Quanta Computer|Flex Ltd\.|PEGATRON|Jabil|Celestica|Compal|Inventec|Luxshare)$/u;
const makerOf = (category, entry) => {
    const pickOf = (...keys) => keys.flatMap(key => labelsOf(entry, key)).find(name => !CONTRACT_MAKERS.test(name)) || '';
    if (category === 'software') return pickOf('P178');
    if (category === 'lode') return pickOf('P176');
    if (category === 'elektronika') return pickOf('P178', 'P176');
    return pickOf('P176', 'P178');
};

const items = [];
for (const base of picked.values()) {
    const entry = details[base.q];
    if (!entry || !entry.label) continue;
    const category = base.c;
    const item = { q: base.q, t: base.t, n: /\p{Lu}/u.test(entry.label.split(" ")[0]) ? entry.label : entry.label.charAt(0).toUpperCase() + entry.label.slice(1), c: category, k: base.flag === 'known' ? 1 : 0, sl: base.sl, flag: base.flag };
    const desc = entry.desc ? cleanDescription(entry.desc) : '';
    // Firma ani stavba není osoba (John Deere – kovář, Krupp – rod)
    if (category !== 'vynalezci' && qidsOf(entry, 'P31').includes('Q5')) continue;
    item.n = NAME_OVERRIDES[`${category}:${item.n}`] || NAME_OVERRIDES[item.n] || item.n;
    if (DESCRIPTION_OVERRIDES[item.n]) item.d = DESCRIPTION_OVERRIDES[item.n];
    else if (desc && !/(?<!\p{L})(já|jsem|nemám|mám|koukat)(?!\p{L})/iu.test(desc)) item.d = desc;
    item.ty = kindOf(category, entry, item);
    Object.assign(item, imageFields(entry.img));
    // Rozcestník (Jeřáb, Tiskárna, Kombajn) do tématu nepatří: popis i fotka by byly k ničemu
    if (qidsOf(entry, 'P31').includes('Q4167410') || /^rozcestník/u.test(desc)) continue;
    const f = {};
    // Země: národnost z popisu (je to, jak ji uvádí česká Wikipedie), jinak výroky; Československo, Předlitavsko a české země = Česko
    const spoken = core.landFromDescription(DESCRIPTION_OVERRIDES[item.n] || desc);
    const land = landOf(entry, LAND_KEYS[category]);
    const czech = [...qidsOf(entry, 'P27'), ...qidsOf(entry, 'P17'), ...qidsOf(entry, 'P495'), ...qidsOf(entry, 'P8047')].some(q => CZECH_STATES.has(q))
        || /^(český|česká|české|čeští|československ)/u.test(desc);
    if (spoken) f.land = spoken;
    else if (land) f.land = CZECH_STATES.has(land.q) || czech && /Rakousk|Předlitavsko|Habsbursk/u.test(land.name) ? 'Česko' : land.name;
    if (category === 'vynalezci') {
        if (!qidsOf(entry, 'P31').includes('Q5')) continue;
        const born = entry.dates.P569;
        const died = entry.dates.P570;
        if (!Number.isInteger(born)) continue;
        Object.assign(f, { born, ...(Number.isInteger(died) ? { died } : {}) });
        if (has(entry, 'P21', FEMALE)) item.sx = 'f';
        // Čím se proslavil(a): ruční seznam (Wikidata mají u P800 i města a nesouvisející díla)
        if (PERSON_WORKS[item.n]) f.work = PERSON_WORKS[item.n];
        f.y = born + 30;
    } else if (category === 'stavby') {
        const point = parsePoint(entry.nums.coord);
        if (point) { item.la = point.lat; item.lo = point.lon; }
        const co = qidsOf(entry, 'P17').filter(q => countries[q]);
        if (co.length) item.co = co.slice(0, 2);
        const city = labelsOf(entry, 'P131').find(name => !countries[name]);
        if (city) f.city = city;
        const opened = firstYear(entry, ['P1619', 'P729', 'P571', 'P580']);
        if (opened) f.from = opened;
        if (entry.nums.watt && /elektrár/u.test(item.ty)) f.mw = Math.round(entry.nums.watt / 1e6);
        if (entry.nums.pax && item.ty === 'letiště') f.pax = Math.round(entry.nums.pax);
        const operator = labelsOf(entry, 'P137')[0];
        if (operator) f.op = operator;
        f.y = f.from;
    } else if (category === 'firmy' || item.ty === 'automobilka') {
        const founded = firstYear(entry, ['P571', 'P580']);
        if (founded) f.from = founded;
        // Zakladatelé jen osoby (ne „Ústřední výbor…“ či mateřská firma)
        const founders = labelsOf(entry, 'P112').filter(name => /^\p{Lu}[\p{L}.'’-]*( (\p{Lu}[\p{L}.'’-]*|von|van|de|da))+$/u.test(name)).slice(0, 2);
        if (founders.length) f.fd = founders.join(', ');
        const hq = labelsOf(entry, 'P159')[0];
        if (hq) f.hq = hq;
        const ended = entry.dates.P576;
        if (Number.isInteger(ended) && ended >= (founded || -Infinity)) f.to = ended;
        f.y = f.from;
    } else {
        const maker = makerOf(category, entry);
        if (maker && maker.toLowerCase() !== item.n.toLowerCase()) f.mk = maker;
        const keys = category === 'letadla' ? ['P606', 'P729', 'P571', 'P577'] : category === 'lode' ? ['P2754', 'P729', 'P571', 'P606'] : category === 'vynalezy' ? ['P575', 'P571', 'P577']
            : category === 'software' || category === 'elektronika' ? ['P577', 'P571', 'P729'] : ['P729', 'P571', 'P577', 'P606', 'P580'];
        const year = firstYear(entry, keys);
        if (year) f.year = year;
        const end = firstYear(entry, ['P730', 'P582', 'P576', 'P746']);
        if (end && year && end >= year) f.end = end;
        if (category === 'vynalezy') {
            // Rok a vynálezce u obecných vynálezů Wikidata uvádějí nespolehlivě (lednička 1856, spojka „Karl Benz“): jen ruční seznam
            delete f.year;
            delete f.end;
            delete f.mk;
            const known = INVENTION_FACTS[item.n];
            if (known) Object.assign(f, compact({ year: known[0], by: known[1], land: known[2] }));
        }
        if (entry.nums.speed && ['vlaky', 'letadla'].includes(category)) f.speed = Math.round(entry.nums.speed * 3.6);
        if (entry.nums.len && category === 'lode') f.len = Math.round(entry.nums.len);
        if (entry.nums.built && ['letadla', 'auta', 'vlaky', 'elektronika'].includes(category)) f.built = Math.round(entry.nums.built);
        f.y = f.year;
    }
    if (czech || (item.co || []).includes('Q213')) item.cz = 1;
    item.f = compact(f);
    if (item.f.y === undefined) delete item.f.y;
    items.push(item);
}

// Země modelu bez vlastního údaje podle výrobce v datech (Škoda Superb → Škoda Auto → Česko); u českého výrobce i česká stopa
{
    const makers = new Map();
    for (const item of items) if (item.f.land && (item.ty === 'automobilka' || item.c === 'firmy')) for (const name of [item.n, item.t]) makers.set(name.toLowerCase(), item);
    for (const item of items) {
        const maker = item.f.mk && makers.get(item.f.mk.toLowerCase());
        if (!maker) continue;
        if (!item.f.land || maker.f.land === 'Česko') item.f.land = maker.f.land;
        if (maker.cz === 1) item.cz = 1;
    }
}

// Jména jednou: druhá položka se stejným názvem dostane upřesnění z článku (Mini (automobil))
{
    const byName = new Map();
    const twins = new Set();
    for (const item of items.sort((a, b) => b.sl - a.sl)) {
        if (byName.has(item.n.toLowerCase())) item.n = item.t;
        // Ani název článku nerozliší (dvě položky téhož jména a článku): zůstane jen známější
        if (byName.has(item.n.toLowerCase())) { twins.add(item); continue; }
        byName.set(item.n.toLowerCase(), item);
    }
    for (let i = items.length - 1; i >= 0; i--) if (twins.has(items[i])) items.splice(i, 1);
}
// Stejný obrázek u dvou položek otázka nerozliší: zůstane známější
{
    const seen = new Set();
    for (const item of [...items].sort((a, b) => b.sl - a.sl)) {
        if (!item.im) continue;
        if (seen.has(item.im)) { delete item.im; delete item.ih; } else seen.add(item.im);
    }
}

// Stroje a dopravní prostředky se hádají z fotky (topics/technika.js questionImage): bez fotky do tématu nepatří, s kresbou či
// schématem (SVG, GIF, název s „diagram“, „logo“…) zůstanou v učení, otázkou nejsou (nq); fotka výrobku v PNG je fotka
{
    const PHOTO_CATEGORIES = new Set(['vynalezy', 'auta', 'vlaky', 'letadla', 'lode', 'elektronika']);
    const asksPhoto = (item) => PHOTO_CATEGORIES.has(item.c) && item.ty !== 'automobilka' && item.ty !== 'železniční trať';
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (!asksPhoto(item)) continue;
        if (!item.im) items.splice(i, 1);
        else if (!core.isRealPhoto(item.im.replace(/\.png$/i, '.jpg'))) item.nq = 1;
    }
}

// --- 5. krok: okruhy ---
const MAKER_TOPICS = (item) => `${item.n} ${item.f.mk || ''}`;
const COLLECTIONS = [
    { id: 'cesko', label: 'Česká technika', text: 'Vynálezci, stroje, vozidla a firmy z Česka', test: item => item.cz === 1 },
    { id: 'skoda', label: 'Škoda', text: 'Auta, tramvaje, lokomotivy a podniky se jménem Škoda', test: item => /škod/iu.test(MAKER_TOPICS(item)) },
    { id: 'automobilky', label: 'Automobilky', text: 'Značky a výrobci aut', test: item => item.ty === 'automobilka' },
    { id: 'sportovni-auta', label: 'Sportovní auta', test: item => item.ty === 'sportovní automobil' },
    { id: 'tramvaje', label: 'Tramvaje', test: item => item.ty === 'tramvaj' },
    { id: 'vysokorychlostni-vlaky', label: 'Rychlovlaky', text: 'Vysokorychlostní vlaky a maglevy', test: item => item.ty === 'vysokorychlostní vlak' },
    { id: 'lokomotivy', label: 'Lokomotivy', test: item => /lokomotiva$/u.test(item.ty) },
    { id: 'dopravni-letadla', label: 'Dopravní letadla', test: item => item.ty === 'dopravní letadlo' },
    { id: 'vojenska-letadla', label: 'Vojenská letadla', text: 'Stíhačky, bombardéry a vojenské vrtulníky', test: item => ['stíhací letoun', 'bombardér'].includes(item.ty) },
    { id: 'vrtulniky', label: 'Vrtulníky', test: item => item.ty === 'vrtulník' },
    { id: 'valecne-lode', label: 'Válečné lodě', text: 'Bitevní a letadlové lodě, křižníky a ponorky', test: item => ['bitevní loď', 'letadlová loď', 'válečná loď', 'ponorka'].includes(item.ty) },
    { id: 'zaoceanske-lode', label: 'Parníky a výletní lodě', test: item => ['parník', 'výletní loď'].includes(item.ty) },
    { id: 'herni-konzole', label: 'Herní konzole', test: item => /herní konzole$/u.test(item.ty) },
    { id: 'telefony', label: 'Mobilní telefony', test: item => /telefon$/u.test(item.ty) },
    { id: 'pocitace', label: 'Počítače', test: item => item.ty === 'počítač' },
    { id: 'programovaci-jazyky', label: 'Programovací jazyky', test: item => item.ty === 'programovací jazyk' },
    { id: 'operacni-systemy', label: 'Operační systémy', test: item => item.ty === 'operační systém' },
    { id: 'socialni-site', label: 'Sociální sítě a komunikace', test: item => ['sociální síť', 'komunikační aplikace'].includes(item.ty) },
    { id: 'elektrarny', label: 'Elektrárny', test: item => /elektrárna$/u.test(item.ty) },
    { id: 'letiste', label: 'Letiště', test: item => item.ty === 'letiště' },
    { id: 'metro', label: 'Metro', test: item => item.ty === 'metro' },
    { id: 'informatici', label: 'Průkopníci počítačů', text: 'Informatici, programátoři a zakladatelé počítačových firem',
        test: item => item.c === 'vynalezci' && (/informati|programát|počítač|software|internet|web/u.test(`${item.ty} ${item.d || ''}`)) },
    { id: 'prukopnici-letectvi', label: 'Průkopníci letectví a kosmonautiky', test: item => item.c === 'vynalezci' && /let(ec|kyně|ad|oun|ectv)|aviati|raket|kosmonaut|konstruktér letadel/u.test(`${item.ty} ${item.d || ''}`) }
];
const assignGroups = () => {
    for (const item of items) {
        const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
        if (groups.length) item.g = groups; else delete item.g;
    }
};
assignGroups();
const collections = COLLECTIONS.map(({ test, ...collection }) => ({ ...collection, sort: { by: 'y' } }));

// --- 6. krok: úrovně obtížnosti (lib/fame-levels.mjs) ---
// Známé: ruční hvězdičky a k nim nejznámější čtvrtina kategorie (jazykové verze a návštěvnost české Wikipedie);
// nejméně známá čtvrtina je pro experty (ruční hvězdičky nikdy)
const pageviews = await topicPageviews('technika-pageviews', items.map(item => item.t), { offline: process.env.PAGEVIEWS_OFFLINE === '1' });
// Položka z třídy, kterou na české Wikipedii skoro nikdo nečte (vietnamská letiště, nafouknuté jazykové verze), do tématu nepatří
const MIN_VIEWS = 600;
for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const views = pageviews[item.t];
    if (!picked.get(item.q).forced && views !== undefined && views < MIN_VIEWS) items.splice(i, 1);
}
for (const item of items) {
    item._ = { sl: item.sl, pv: pageviews[item.t], pool: item.c, never: item.flag === 'never', protect: item.flag === 'known' };
}
assignGroups();
const promoted = assignLevels(items, {
    // Čtvrtina kategorie, v menší kategorii aspoň 32 známých (na základní úroveň je třeba dost otázek), nejvýš 40 %
    knownShare: (pool) => Math.min(0.4, Math.max(0.25, 32 / items.filter(item => item._.pool === pool).length)),
    expertShare: () => 0.27,
    pvWeight: () => 0.6,
    ceiling: () => 0.5,
    groups: levelGroups(items, collections)
});
console.log(`Povýšeno kvůli spodní hranici okruhu: ${promoted.map(([group, name]) => `${name} (${group})`).join(', ')}`);

// Pořadí v kategorii podle známosti (data témat jsou v kategorii seřazená podle známosti: Dnešní otázky, Kvíz dne)
items.sort((a, b) => CATEGORY_ORDER.indexOf(a.c) - CATEGORY_ORDER.indexOf(b.c) || a._.pct - b._.pct);
for (const item of items) { delete item._; delete item.sl; delete item.flag; }

for (const category of CATEGORY_ORDER) console.log(levelSummary(category, items.filter(item => item.c === category)));
for (const collection of collections) console.log(levelSummary(`okruh ${collection.id}`, items.filter(item => (item.g || []).includes(collection.id))));
console.log(levelSummary('celkem', items));
writeTopic('technika', { collections, items });
