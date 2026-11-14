#!/usr/bin/env node
// Audit Řetězovky (chain.js) na skutečných datech: vygeneruje řetězy dne na --days dní od --from (semínko dne, stejně jako aplikace)
// a --practice cvičných řetězů a spočítá rozložení vazeb, šablon a oborů, nejčastější uzly a uzly-rozcestníky (státy, města), opakování
// v řetězu i mezi dny (stejný rozcestník do 7 dní), „odpovědi zadarmo“ (odpověď plyne z dřívějších článků: stavba stojí v Londýně
// → „ve kterém státě stojí“, návrat k uzlu, odpověď mezi možnostmi nebo v textu dřívější otázky), triviální otázky na hlavní město
// a stát a řetězy, které se nesestavily nebo potřebovaly nouzovou úroveň. Kontrola odpovědí zadarmo je nezávislá na generátoru:
// vychází jen z hotového řetězu a z polohy uzlů v grafu (město, stát, muzeum).
//   node scripts/audit-retezovka.mjs --label=before|after [--days=365 --practice=1000 --from=2026-11-15 --workers=4]
// Výsledek: reports/retezovka-audit.json (čísla podle štítku) a reports/retezovka-audit.md (srovnání před a po, ukázky řetězů).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Chain = require('../chain.js');
const core = require('../quiz-core.js');

// Graf jako v aplikaci: témata Chain.SOURCES z data/, tabulka států a vazby z Wikidat (Chain.EXTRA_FILE), když je generátor zná
const loadGraph = () => {
    const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const sources = Object.fromEntries(Chain.SOURCES.map(topic => [topic, read(`data/${topic}.json`).items]));
    const countries = read('data/countries.json').countries;
    const extra = Chain.EXTRA_FILE && fs.existsSync(path.join(ROOT, Chain.EXTRA_FILE)) ? read(Chain.EXTRA_FILE) : null;
    return Chain.buildGraph(sources, countries, extra);
};

if (!isMainThread) {
    const graph = loadGraph();
    const { days, practice } = workerData;
    const out = { daily: [], practice: [] };
    for (const day of days) {
        const started = Date.now();
        let chain = null;
        try { chain = Chain.dailyChain(graph, day); } catch (error) { chain = null; }
        out.daily.push({ day, chain, ms: Date.now() - started });
    }
    for (const seed of practice) {
        const started = Date.now();
        let chain = null;
        try { chain = Chain.practiceChain(graph, `audit-${seed}`); } catch (error) { chain = null; }
        out.practice.push({ seed, chain, ms: Date.now() - started });
    }
    parentPort.postMessage(out);
} else {
    const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
    const label = args.label || 'after';
    const DAYS = Number(args.days || 365);
    const PRACTICE = Number(args.practice || 1000);
    const FROM = args.from || '2026-11-15';
    const WORKERS = Math.max(1, Math.min(Number(args.workers || os.cpus().length || 2), 8));
    const JSON_FILE = path.join(ROOT, 'reports/retezovka-audit.json');
    const MD_FILE = path.join(ROOT, 'reports/retezovka-audit.md');

    const started = Date.now();
    const graph = loadGraph();
    const days = Array.from({ length: DAYS }, (_, i) => Chain.addDays(FROM, i));
    const seeds = Array.from({ length: PRACTICE }, (_, i) => i);
    const parts = Array.from({ length: WORKERS }, (_, w) => ({ days: days.filter((_, i) => i % WORKERS === w), practice: seeds.filter((_, i) => i % WORKERS === w) }));
    const results = await Promise.all(parts.map(part => new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: part });
        worker.once('message', resolve);
        worker.once('error', reject);
    })));
    const daily = results.flatMap(r => r.daily).sort((a, b) => a.day.localeCompare(b.day));
    const practice = results.flatMap(r => r.practice).sort((a, b) => a.seed - b.seed);

    // --- Pomocné ---
    const node = (id) => graph.nodes.get(id) || null;
    const HUB_KINDS = new Set(['country', 'city', 'continent']);
    const isHub = (id) => { const n = node(id); return Boolean(n && HUB_KINDS.has(n.kind)); };
    const nameOf = (id) => (node(id) || {}).name || id;
    // Přímé „obaly“ uzlu podle grafu (město, stát, muzeum, místo) a jejich obaly (město → stát): to, co hráč ví, když zná uzel
    const containersOf = (id, depth = 0) => {
        const n = node(id);
        if (!n || depth > 4) return [];
        const direct = [n.city, n.country, n.museum, n.place].filter(value => typeof value === 'string' && value && value !== id);
        return [...new Set([...direct, ...direct.flatMap(other => containersOf(other, depth + 1))])];
    };
    const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
    const top = (map, n = 20) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);
    const pct = (part, whole) => (whole ? Math.round(1000 * part / whole) / 10 : 0);
    const TRIVIAL_RELS = new Set(['capital', 'capitalOf', 'cityCountry', 'countryCity']);
    const domainOf = (question) => question.domain || (Chain.FAMILY && Chain.FAMILY[question.rel]) || question.rel;
    const templateOf = (question) => `${question.rel}${Number.isInteger(question.tpl) ? `#${question.tpl}` : ''}`;
    const nodesOf = (chain) => [chain.start.id, ...chain.questions.map(question => question.to.id)];

    // Odpovědi zadarmo v jednom řetězu: [{ k, kind, text }]
    const freeAnswers = (chain) => {
        const found = [];
        const known = new Map(); // uzel → místa, kde podle dřívějších článků je (i s obaly: město → stát)
        const learn = (thing, place) => {
            if (!known.has(thing)) known.set(thing, new Set());
            [place, ...containersOf(place)].forEach(id => known.get(thing).add(id));
        };
        const seen = [chain.start.id];
        const shownOptions = new Set();
        const texts = [];
        chain.questions.forEach((question, index) => {
            const a = question.from.id;
            const b = question.to.id;
            const where = `${index + 1}. článek „${question.text}“ → ${question.to.name}`;
            if (seen.includes(b)) found.push({ k: index + 1, kind: 'revisit', text: `${where}: uzel už v řetězu byl` });
            if ((known.get(a) || new Set()).has(b)) found.push({ k: index + 1, kind: 'implied', text: `${where}: plyne z dřívějších článků (${[...known.get(a)].map(nameOf).join(', ')})` });
            if (shownOptions.has(b)) found.push({ k: index + 1, kind: 'shown-option', text: `${where}: odpověď byla mezi možnostmi dřívější otázky` });
            // Celé jméno jako samostatná slova (ne část slova: „Vídeň“ v „k vidění“, „Ludvík XVI.“ v „Ludvík XVIII.“)
            const plain = ` ${core.normalizeAnswer(question.to.name)} `;
            if (plain.length >= 6 && texts.some(text => ` ${core.normalizeAnswer(text)} `.includes(plain))) found.push({ k: index + 1, kind: 'shown-text', text: `${where}: odpověď stojí v textu dřívější otázky` });
            // Co článek prozradil: b leží v a, nebo a leží v b
            if (containersOf(a).includes(b)) learn(a, b);
            if (containersOf(b).includes(a)) learn(b, a);
            // Vysvětlení po odpovědi může říct víc (stát, město): taková místa jsou od té chvíle známá také
            for (const fact of question.reveals || []) if (fact && fact.thing && fact.place) learn(fact.thing, fact.place);
            question.options.forEach(option => shownOptions.add(option.id));
            texts.push(question.text);
            if (question.explain) texts.push(question.explain);
            seen.push(b);
        });
        return found;
    };

    const analyse = (rows, { daily: isDaily }) => {
        const chains = rows.filter(row => row.chain);
        const relCount = new Map();
        const tplCount = new Map();
        const domainCount = new Map();
        const kindCount = new Map();
        const nodeUse = new Map();
        const hubChains = new Map();
        const free = new Map();
        const freeExamples = [];
        const levels = new Map();
        let questions = 0;
        let trivial = 0;
        let trivialChains = 0;
        let geoHops = 0;
        let geoPairs = 0;
        let chainsGeo3 = 0;
        let hubsPerChain = 0;
        let maxHubs = 0;
        let chainsHub3 = 0;
        let repeatedInChain = 0;
        let domainsPerChain = 0;
        let ms = 0;
        for (const row of rows) ms += row.ms;
        for (const { chain } of chains) {
            bump(levels, chain.level || 0);
            const ids = nodesOf(chain);
            if (new Set(ids).size !== ids.length) repeatedInChain += 1;
            ids.forEach(id => bump(nodeUse, id));
            const hubs = [...new Set(ids.filter(isHub))];
            hubs.forEach(id => bump(hubChains, id));
            hubsPerChain += hubs.length;
            maxHubs = Math.max(maxHubs, hubs.length);
            if (hubs.length >= 3) chainsHub3 += 1;
            let chainTrivial = 0;
            let chainGeo = 0;
            let previousGeo = false;
            const domains = new Set();
            for (const question of chain.questions) {
                questions += 1;
                bump(relCount, question.rel);
                bump(tplCount, templateOf(question));
                bump(domainCount, domainOf(question));
                domains.add(domainOf(question));
                bump(kindCount, question.to.kind);
                const fromKind = question.from.kind;
                const toKind = question.to.kind;
                const isTrivial = TRIVIAL_RELS.has(question.rel) || (fromKind === 'city' && toKind === 'country') || (fromKind === 'country' && toKind === 'city');
                if (isTrivial) { trivial += 1; chainTrivial += 1; }
                const geo = HUB_KINDS.has(toKind);
                if (geo) { geoHops += 1; chainGeo += 1; }
                if (geo && previousGeo) geoPairs += 1;
                previousGeo = geo;
            }
            if (chainTrivial) trivialChains += 1;
            if (chainGeo >= 3) chainsGeo3 += 1;
            domainsPerChain += domains.size;
            for (const entry of freeAnswers(chain)) {
                bump(free, entry.kind);
                if (freeExamples.length < 12) freeExamples.push(entry.text);
            }
        }
        // Mezi dny (jen řetěz dne): stejný rozcestník do 7 dní, stejný uzel do 7 dní, stejný začátek do 30 dní
        const days = { hubRepeatDays: 0, hubRepeats: 0, nodeRepeatDays: 0, startRepeats: 0, sharedWithYesterday: 0 };
        if (isDaily) {
            for (let i = 0; i < rows.length; i++) {
                const chain = rows[i].chain;
                if (!chain) continue;
                const ids = nodesOf(chain);
                const before = rows.slice(Math.max(0, i - 7), i).filter(row => row.chain).flatMap(row => nodesOf(row.chain));
                const repeatedHubs = ids.filter(id => isHub(id) && before.includes(id));
                if (repeatedHubs.length) days.hubRepeatDays += 1;
                days.hubRepeats += repeatedHubs.length;
                if (ids.some(id => !isHub(id) && before.includes(id))) days.nodeRepeatDays += 1;
                if (rows.slice(Math.max(0, i - 30), i).some(row => row.chain && row.chain.start.id === chain.start.id)) days.startRepeats += 1;
                if (i && rows[i - 1].chain) days.sharedWithYesterday += ids.filter(id => nodesOf(rows[i - 1].chain).includes(id)).length;
            }
        }
        const n = chains.length || 1;
        return {
            chains: rows.length, built: chains.length, failed: rows.length - chains.length, levels: Object.fromEntries(levels), msPerChain: Math.round(ms / (rows.length || 1)),
            questions, distinctNodes: nodeUse.size, distinctStarts: new Set(chains.map(row => row.chain.start.id)).size,
            relations: Object.fromEntries(top(relCount, 200)), templates: tplCount.size, domains: Object.fromEntries(top(domainCount, 50)), answerKinds: Object.fromEntries(top(kindCount, 50)),
            domainsPerChain: Math.round(10 * domainsPerChain / n) / 10,
            topNodes: top(nodeUse, 25).map(([id, count]) => ({ name: nameOf(id), kind: (node(id) || {}).kind || '', count, share: pct(count, n) })),
            topHubs: top(hubChains, 15).map(([id, count]) => ({ name: nameOf(id), kind: (node(id) || {}).kind || '', chains: count, share: pct(count, n) })),
            hubsPerChain: Math.round(100 * hubsPerChain / n) / 100, maxHubs, chainsHub3: pct(chainsHub3, n), repeatedInChain,
            geoHopsPerChain: Math.round(100 * geoHops / n) / 100, geoPairs, chainsGeo3: pct(chainsGeo3, n),
            trivial, trivialShare: pct(trivial, questions), trivialChains: pct(trivialChains, n),
            free: Object.fromEntries(free), freeTotal: [...free.values()].reduce((a, b) => a + b, 0), freeChains: chains.filter(row => freeAnswers(row.chain).length).length, freeExamples,
            days: isDaily ? { ...days, sharedWithYesterday: Math.round(100 * days.sharedWithYesterday / Math.max(1, rows.length - 1)) / 100 } : null
        };
    };
    const metrics = { label, generated: new Date().toISOString().slice(0, 10), from: FROM, daily: analyse(daily, { daily: true }), practice: analyse(practice, { daily: false }),
        examples: daily.slice(0, 10).filter(row => row.chain).map(row => ({ day: row.day, start: row.chain.start.name, questions: row.chain.questions.map(question => ({
            k: question.k, rel: question.rel, text: question.text, answer: question.to.name, options: question.options.map(option => option.name), explain: question.explain || '' })) })) };
    const stored = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : {};
    stored[label] = metrics;
    fs.writeFileSync(JSON_FILE, `${JSON.stringify(stored, null, 1)}\n`);

    // --- Zpráva (srovnání štítků before a after, co je k dispozici) ---
    const labels = ['before', 'after'].filter(key => stored[key]);
    const title = { before: 'Před (původní generátor)', after: 'Po (nový generátor)' };
    const lines = ['# Audit Řetězovky', '', `Vygenerováno skriptem \`node scripts/audit-retezovka.mjs --label=…\` (${labels.map(key => `${key}: ${stored[key].generated}`).join(', ')}).`,
        `Řetězy dne: ${DAYS} dní od ${FROM} (semínko dne jako v aplikaci), cvičné řetězy: ${PRACTICE} (semínka audit-0 …).`,
        'Odpovědi zadarmo se počítají nezávisle na generátoru jen z hotového řetězu a z polohy uzlů v grafu (město, stát, muzeum).', ''];
    const row = (name, pick) => `| ${name} | ${labels.map(key => pick(stored[key])).join(' | ')} |`;
    const head = `| Ukazatel | ${labels.map(key => title[key]).join(' | ')} |`;
    const rule = `|---|${labels.map(() => '---').join('|')}|`;
    for (const part of ['daily', 'practice']) {
        lines.push(`## ${part === 'daily' ? 'Řetězovka dne' : 'Cvičná řetězovka'}`, '', head, rule);
        const m = (s) => s[part];
        lines.push(row('Řetězů (sestaveno / nesestaveno)', s => `${m(s).built} / ${m(s).failed}`));
        lines.push(row('Nouzová úroveň hledání (počty podle úrovně)', s => Object.entries(m(s).levels).map(([lvl, c]) => `${lvl}: ${c}`).join(', ')));
        lines.push(row('Čas na řetěz (ms)', s => m(s).msPerChain));
        lines.push(row('Různých vazeb / šablon otázek', s => `${Object.keys(m(s).relations).length} / ${m(s).templates}`));
        lines.push(row('Oborů v řetězu (průměr)', s => m(s).domainsPerChain));
        lines.push(row('Různých uzlů / začátků', s => `${m(s).distinctNodes} / ${m(s).distinctStarts}`));
        lines.push(row('Rozcestníků (stát, město) v řetězu: průměr / nejvíc', s => `${m(s).hubsPerChain} / ${m(s).maxHubs}`));
        lines.push(row('Řetězy se 3+ rozcestníky', s => `${m(s).chainsHub3} %`));
        lines.push(row('Zeměpisných skoků (odpověď stát/město) na řetěz', s => m(s).geoHopsPerChain));
        lines.push(row('Dva zeměpisné skoky po sobě (počet)', s => m(s).geoPairs));
        lines.push(row('Řetězy se 3+ zeměpisnými skoky', s => `${m(s).chainsGeo3} %`));
        lines.push(row('Triviální otázky hlavní město / stát', s => `${m(s).trivial} (${m(s).trivialShare} % otázek, v ${m(s).trivialChains} % řetězů)`));
        lines.push(row('Odpovědi zadarmo (celkem / řetězů)', s => `${m(s).freeTotal} / ${m(s).freeChains}`));
        lines.push(row('… plyne z dřívějších článků (implied)', s => m(s).free.implied || 0));
        lines.push(row('… návrat k uzlu (revisit)', s => m(s).free.revisit || 0));
        lines.push(row('… odpověď mezi možnostmi dřívější otázky', s => m(s).free['shown-option'] || 0));
        lines.push(row('… odpověď v textu dřívější otázky', s => m(s).free['shown-text'] || 0));
        lines.push(row('Řetězy s opakovaným uzlem', s => m(s).repeatedInChain));
        if (part === 'daily') {
            lines.push(row('Dny se stejným rozcestníkem jako v posledních 7 dnech', s => `${m(s).days.hubRepeatDays} (${m(s).days.hubRepeats} opakování)`));
            lines.push(row('Dny se stejným jiným uzlem jako v posledních 7 dnech', s => m(s).days.nodeRepeatDays));
            lines.push(row('Stejný začátek do 30 dní', s => m(s).days.startRepeats));
            lines.push(row('Společných uzlů se včerejškem (průměr)', s => m(s).days.sharedWithYesterday));
        }
        lines.push('');
        for (const key of labels) {
            const s = stored[key][part];
            lines.push(`### ${title[key]}: ${part === 'daily' ? 'řetěz dne' : 'cvičný řetěz'}`, '');
            lines.push(`- **Obory (podíl otázek):** ${Object.entries(s.domains).map(([d, c]) => `${d} ${pct(c, s.questions)} %`).join(', ')}`);
            lines.push(`- **Vazby:** ${Object.entries(s.relations).map(([r, c]) => `${r} ${c}`).join(', ')}`);
            lines.push(`- **Druhy odpovědí:** ${Object.entries(s.answerKinds).map(([r, c]) => `${r} ${c}`).join(', ')}`);
            lines.push(`- **Nejčastější rozcestníky (podíl řetězů):** ${s.topHubs.map(h => `${h.name} ${h.share} %`).join(', ') || '–'}`);
            lines.push(`- **Nejčastější uzly:** ${s.topNodes.slice(0, 15).map(h => `${h.name} (${h.count})`).join(', ')}`);
            if (s.freeExamples.length) lines.push('- **Ukázky odpovědí zadarmo:**', ...s.freeExamples.slice(0, 6).map(text => `  - ${text}`));
            lines.push('');
        }
    }
    for (const key of labels) {
        lines.push(`## Ukázky řetězů dne: ${title[key]}`, '');
        for (const example of stored[key].examples.slice(0, 10)) {
            lines.push(`### ${example.day}: ${example.start}`, '');
            for (const q of example.questions) lines.push(`${q.k}. ${q.text} → **${q.answer}** _(${q.options.join(' · ')})_${q.explain ? `  \n   ${q.explain}` : ''}`);
            lines.push('');
        }
    }
    fs.writeFileSync(MD_FILE, `${lines.join('\n')}\n`);
    const d = metrics.daily;
    const p = metrics.practice;
    console.log(`${label}: ${Math.round((Date.now() - started) / 1000)} s; denní ${d.built}/${d.chains}, volné odpovědi ${d.freeTotal} (${d.freeChains} řetězů), triviální ${d.trivialShare} %, rozcestníky ${d.hubsPerChain}/řetěz, opakovaný rozcestník do 7 dní ${d.days.hubRepeatDays} dní; cvičné ${p.built}/${p.chains}, volné ${p.freeTotal}`);
}
