// Chemie: doplnění vydaných dat (data/chemie.json) bez nového stažení celého tématu – node scripts/build-chemie.mjs --doplnit
// Celé sestavení by kvůli návštěvnosti článků (API Wikipedie) a změnám ve Wikidatech přeskládalo úrovně a pořadí položek;
// doplnění jen přidává: nositele Nobelovy ceny za chemii, kteří v datech chybí, fakt Nobelova cena (rok a za co) u všech chemiků
// a kategorii Materiály a suroviny (lib/chemie-materialy.mjs). Stávající položky zůstanou se stejným ID, názvem, popisem, fotkou
// i úrovní; materiály, které byly v Pojmech a metodách, se přesunou do nové kategorie (okruhy si nechají). Na konci porovná
// stará a nová data: žádné ID nesmí zmizet a úroveň (k, x) se nesmí změnit.
import { readFileSync } from 'node:fs';
import { qlever, id, values, inBatches, imageFields, compact, writeTopic } from './wikidata.mjs';
import { NOBEL_CHEMISTRY, nobelQuery, nobelFieldsOf, chemistItem } from './chemie-nobel.mjs';
import { MATERIALS, MATERIAL_COLLECTIONS, materialFacts, materialImage } from './chemie-materialy.mjs';

const DATA_FILE = new URL('../../data/chemie.json', import.meta.url);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// Nejméně známá čtvrtina chemiků (podle počtu jazykových verzí článku) je pro experty – stejný podíl jako u sestavení (EXPERT_SHARE)
const EXPERT_SHARE = 0.27;

// Podrobnosti položek: článek, český název a popis, fotka, život, pohlaví, občanství, ocenění, počet jazykových verzí
const fetchDetails = async (qids) => {
    const result = new Map(qids.map(qid => [qid, {}]));
    const SINGLE = new Set(['t', 'n', 'd', 'im', 'born', 'died', 'sex', 'sl']);
    await inBatches(qids, 150, (batch) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(batch)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wdt:P569 ?v BIND("born" AS ?p) }
  UNION { ?item wdt:P570 ?v BIND("died" AS ?p) }
  UNION { ?item wdt:P21 ?v BIND("sex" AS ?p) }
  UNION { ?item wdt:P27 ?v BIND("cit" AS ?p) }
  UNION { ?item wdt:P166 ?v BIND("award" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE.has(key)) { if (!(key in entry)) entry[key] = key === 'sl' ? Number(v) : v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return result;
};
const fetchLabels = async (qids) => {
    const result = new Map();
    if (!qids.length) return result;
    await inBatches(qids, 400, (batch) => `SELECT ?item ?l WHERE { VALUES ?item { ${values(batch)} } ?item rdfs:label ?l FILTER(LANG(?l) = "cs") }`,
        (row) => result.set(id(row.item.value), row.l.value), qlever);
    return result;
};

export const updatePublished = async () => {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    const items = data.items;
    const before = new Map(items.map(item => [item.q, { k: item.k, x: item.x, c: item.c, n: item.n }]));
    const byId = new Map(items.map(item => [item.q, item]));
    const names = new Set(items.map(item => item.n.toLowerCase()));

    // --- Nositelé Nobelovy ceny za chemii, kteří v datech chybí (bez fotky je dřív vyřadilo pravidlo IMAGE_FROM) ---
    const laureates = (await qlever(`SELECT DISTINCT ?p WHERE { ?p wdt:P166 wd:${NOBEL_CHEMISTRY} .
  ?a schema:about ?p . ?a schema:isPartOf <https://cs.wikipedia.org/> }`)).map(row => id(row.p.value));
    const missing = laureates.filter(qid => !byId.has(qid));
    const chemistIds = items.filter(item => item.c === 'chemici').map(item => item.q);
    // Počet jazykových verzí všech chemiků: noví laureáti se zařadí mezi experty podle stejného pořadí jako ostatní
    const people = await fetchDetails([...new Set([...missing, ...chemistIds])]);
    const citizenship = await fetchLabels([...new Set(missing.flatMap(qid => people.get(qid).cit || []))]);
    const sitelinks = (qid) => people.get(qid).sl || 0;
    const added = [];
    for (const qid of missing) {
        const item = chemistItem(qid, people.get(qid), (q) => citizenship.get(q));
        if (!item || names.has(item.n.toLowerCase())) { console.warn(`Laureát ${qid} se nedá přidat (chybí článek, rok narození, nebo je jméno už použité)`); continue; }
        names.add(item.n.toLowerCase());
        items.push(item);
        added.push(item);
    }
    const chemists = items.filter(item => item.c === 'chemici');
    const bySitelinks = [...chemists].sort((a, b) => sitelinks(a.q) - sitelinks(b.q));
    const expertLine = sitelinks(bySitelinks[Math.floor(bySitelinks.length * EXPERT_SHARE)].q);
    for (const item of added) if (!item.k && sitelinks(item.q) < expertLine) item.x = 1;
    console.log(`Laureáti doplnění: ${added.map(item => `${item.n}${item.x ? ' (expert)' : ''}`).join(', ') || 'žádní'}`);

    // --- Nobelovy ceny všech chemiků (rok a za co) ---
    const rows = [];
    await inBatches(chemists.map(item => item.q), 150, nobelQuery, (row) => rows.push(row), qlever);
    const fields = nobelFieldsOf(rows);
    for (const item of chemists) {
        delete item.f.np;
        delete item.f.ny;
        if (fields[item.q]) Object.assign(item.f, fields[item.q]);
    }
    console.log(`Chemici s Nobelovou cenou: ${chemists.filter(item => item.f.np).length} (za chemii ${chemists.filter(item => item.f.nobel).length})`);

    // --- Materiály a suroviny ---
    const materialDetails = await fetchDetails(MATERIALS.map(([qid]) => qid));
    let moved = 0;
    let created = 0;
    for (const [qid, okruh, level, facts] of MATERIALS) {
        const existing = byId.get(qid);
        if (existing) {
            // Přesun z Pojmů a metod (nebo opakované doplnění): ID, název, popis, fotka, úroveň i okruhy zůstanou, přibude okruh a fakta
            if (existing.c !== 'materialy' && existing.c !== 'pojmy') { console.warn(`${existing.n}: je v kategorii ${existing.c}, nepřesouvám`); continue; }
            if (existing.c === 'pojmy') moved++;
            existing.c = 'materialy';
            if (okruh && !(existing.g || []).includes(okruh)) existing.g = [...(existing.g || []), okruh];
            existing.f = { ...existing.f, ...materialFacts(facts) };
            const wanted = level === 1 ? 'k' : level === 3 ? 'x' : '-';
            const actual = existing.k === 1 ? 'k' : existing.x ? 'x' : '-';
            if (wanted !== actual) console.warn(`${existing.n}: úroveň v datech (${actual}) jiná než v seznamu materiálů (${wanted}) – zůstává z dat`);
            continue;
        }
        const detail = materialDetails.get(qid);
        if (!detail || !detail.t) { console.warn(`Materiál ${qid} nemá český článek`); continue; }
        const name = facts.n || capitalize(detail.n || detail.t.replace(/ \(.*\)$/, ''));
        if (names.has(name.toLowerCase())) { console.warn(`Materiál ${name} (${qid}): jméno už je v datech`); continue; }
        names.add(name.toLowerCase());
        const item = compact({
            q: qid, t: detail.t, n: name, c: 'materialy', k: level === 1 ? 1 : 0, d: detail.d, ...imageFields(materialImage(facts, detail.im)),
            f: materialFacts(facts), g: okruh ? [okruh] : undefined
        });
        if (level === 3) item.x = 1;
        items.push(item);
        byId.set(qid, item);
        created++;
    }
    console.log(`Materiály: ${moved} přesunuto z Pojmů a metod, ${created} nových`);

    // --- Okruhy: nové na konec, nositelé Nobelovy ceny podle roku ceny ---
    for (const collection of MATERIAL_COLLECTIONS) if (!data.collections.some(other => other.id === collection.id)) data.collections.push(collection);
    const nobelCollection = data.collections.find(collection => collection.id === 'nobelova-cena-chemie');
    if (nobelCollection) nobelCollection.sort = { by: 'ny' };
    for (const item of added) if (item.f.nobel) item.g = ['nobelova-cena-chemie'];

    // --- Kontrola: nic nezmizelo, úrovně stávajících položek stejné, jména jednou ---
    const after = new Map(items.map(item => [item.q, item]));
    const lost = [...before.keys()].filter(qid => !after.has(qid));
    const changed = [...before].filter(([qid, old]) => after.has(qid) && (after.get(qid).k !== old.k || after.get(qid).x !== old.x || after.get(qid).n !== old.n));
    if (lost.length || changed.length) throw new Error(`Doplnění by změnilo stávající položky: zmizelo ${lost.join(', ') || 'nic'}, změněno ${changed.map(([qid]) => qid).join(', ') || 'nic'}`);
    if (new Set(items.map(item => item.n.toLowerCase())).size !== items.length) throw new Error('Jméno položky se opakuje');
    const movedNames = [...before].filter(([qid, old]) => old.c !== after.get(qid).c).map(([qid]) => after.get(qid).n);
    console.log(`Přesunuto do Materiálů a surovin (${movedNames.length}): ${movedNames.join(', ')}`);
    for (const key of [...new Set(items.map(item => item.c))]) {
        const list = items.filter(item => item.c === key);
        console.log(`  ${key}: ${list.length} (Základní ${list.filter(item => item.k === 1).length}, Expert ${list.filter(item => item.x).length}, s fotkou ${list.filter(item => item.im).length})`);
    }
    writeTopic('chemie', data);
};
