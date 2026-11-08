#!/usr/bin/env node
// Audit kvality otázek všech témat: npm run audit:questions [-- --topic=zemepis,historie --sample=300 --limit=200 --wiki=cesta.json --out=reports/audit-otazek.md --json=reports/audit-otazek.json]
// Projde položky a všechny druhy otázek, které téma umí (viz scripts/lib/audit.mjs), a hlásí: odpověď prozrazenou v zadání nebo nápovědách,
// nápovědy opakující popis, rozbité či příliš podobné možnosti, nesprávné možnosti jiné země/doby než správná, chudé popisy, rozbité odkazy
// na obrázky a nejednoznačné psané odpovědi (aliasy). Výstup: reports/audit-otazek.md (čitelný souhrn) a reports/audit-otazek.json (vše).
// Exit kód je nenulový jen u jistých chyb (prozrazení, tvar odpovědi v zakrytí, dvě správné možnosti, rozbitý obrázek, nápověda ze
// šablony nebo bez nového obsahu, slepá mapa v nevhodném měřítku), které nejsou v scripts/audit-allowlist.json.
// --sample=N: rovnoměrný vzorek asi N položek z každého tématu (rychlá kontrola); --all: i chudé popisy po jednom (jinak jen počty);
// --wiki=soubor: uložené úvody článků z Wikipedie ({ "Titulek": "text" }) – bez něj se hodnotí krátký popis z Wikidat (jako při výpadku sítě).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { TOPIC_IDS, isCritical, loadAllowlist, isAllowed } from './lib/audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;
const limit = args.limit ? Number(args.limit) : Infinity;
const sample = args.sample ? Number(args.sample) : 0;
const out = path.resolve(ROOT, args.out || 'reports/audit-otazek.md');
const jsonOut = path.resolve(ROOT, args.json || 'reports/audit-otazek.json');
const quiet = args.quiet === 'true';
const allowlist = loadAllowlist();

const KIND_LABELS = {
    prozrazeno: 'Odpověď prozrazená v popisu či nápovědě (kritické)', moznosti: 'Rozbité možnosti: dvě správné, prázdná, stejné (kritické)', obrazek: 'Rozbitý odkaz na obrázek (kritické)',
    tvar: 'Zakrytí ukazuje tvar odpovědi („[***] a [***]“, slovo u zakrytí jen ze správné možnosti) (kritické)',
    sablona: 'Nápověda z náhradního nebo obecného textu (šablona) (kritické)', 'prazdna-napoveda': 'Nápověda nic nepřidá k tomu, co hráč už viděl (kritické)',
    'mapa-meritko': 'Slepá mapa v měřítku, které možnosti nerozliší (kritické)',
    duplicita: 'Nápověda opakuje popis', 'moznosti-podobne': 'Příliš podobná nesprávná možnost', 'moznosti-zeme': 'Nesprávné možnosti z jiné země než správná',
    'moznosti-doba': 'Nesprávné možnosti z jiné doby než správná', 'moznosti-malo': 'Málo možností', aliasy: 'Nejednoznačná psaná odpověď (alias platí pro víc položek)',
    'obrazek-sdileny': 'Stejná fotka u víc položek okruhu (duplicita, nebo cizí fotka)', 'chudy-popis': 'Chudý nebo krátký popis', 'bez-napovedy': 'Otázka bez nápovědy', data: 'Rozbitá data'
};
const kinds = Object.keys(KIND_LABELS);
const started = Date.now();

// Témata se auditují paralelně ve vláknech (jedno téma = jedna úloha)
const runTopics = () => new Promise((resolve, reject) => {
    const queue = [...topics];
    const results = [];
    const workers = Array.from({ length: Math.max(1, Math.min(os.cpus().length, queue.length)) }, () => new Worker(new URL('./lib/audit-worker.mjs', import.meta.url), { workerData: { wiki: args.wiki || null } }));
    let running = workers.length;
    const next = (worker) => {
        const id = queue.shift();
        if (!id) { worker.terminate(); if (--running === 0) resolve(results); return; }
        worker.postMessage({ id, limit, sample });
    };
    for (const worker of workers) {
        worker.on('message', (result) => {
            results.push(result);
            if (!quiet) process.stderr.write(`${result.id}: ${result.items}/${result.total} položek, ${result.findings.length} nálezů (${result.seconds} s)\n`);
            next(worker);
        });
        worker.on('error', reject);
        next(worker);
    }
});

const results = (await runTopics()).sort((a, b) => topics.indexOf(a.id) - topics.indexOf(b.id));
const all = results.flatMap(entry => entry.findings);
const critical = all.filter(finding => isCritical(finding) && !isAllowed(finding, allowlist));
const allowed = all.filter(finding => isCritical(finding) && isAllowed(finding, allowlist));
const countBy = (list, key) => list.reduce((map, finding) => map.set(finding[key], (map.get(finding[key]) || 0) + 1), new Map());
const byKind = countBy(all, 'kind');
// Chudé popisy jsou desetitisíce řádků šumu (bez Wikipedie je skoro každý popis krátký): do výpisu jen počty, po jednom s --all
const listed = all.filter(finding => args.all === 'true' || finding.kind !== 'chudy-popis');

// --- JSON ---
const order = (finding) => (isCritical(finding) ? (isAllowed(finding, allowlist) ? 1 : 0) : 2);
const sorted = [...listed].sort((a, b) => order(a) - order(b) || a.topic.localeCompare(b.topic) || a.kind.localeCompare(b.kind) || String(a.name).localeCompare(String(b.name), 'cs'));
const generated = new Date().toISOString();
fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
fs.writeFileSync(jsonOut, `${JSON.stringify({
    generated, options: { topics, sample: sample || null, limit: Number.isFinite(limit) ? limit : null, wiki: args.wiki || null },
    summary: {
        items: results.reduce((sum, entry) => sum + entry.items, 0), findings: all.length, critical: critical.length, allowed: allowed.length,
        byKind: Object.fromEntries(kinds.map(kind => [kind, byKind.get(kind) || 0])),
        byTopic: Object.fromEntries(results.map(entry => [entry.id, { items: entry.items, total: entry.total, findings: entry.findings.length, byKind: Object.fromEntries(countBy(entry.findings, 'kind')) }]))
    },
    findings: sorted.map(finding => ({ ...finding, critical: isCritical(finding), allowed: isCritical(finding) && isAllowed(finding, allowlist) }))
}, null, 1)}\n`);

// --- Čitelný souhrn ---
const escapeCell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const row = (finding) => `| ${escapeCell(finding.topic)} | ${escapeCell(finding.name)} (${escapeCell(finding.q)}) | ${escapeCell(finding.type)} | ${escapeCell(finding.problem)} | ${escapeCell(finding.snippet)} |`;
const lines = ['# Audit otázek', ''];
lines.push(`Vygenerováno ${generated.slice(0, 16).replace('T', ' ')} UTC skriptem \`npm run audit:questions\` (${topics.length} témat, ${results.reduce((sum, entry) => sum + entry.items, 0)} z ${results.reduce((sum, entry) => sum + entry.total, 0)} položek${sample ? `, vzorek ${sample} na téma` : ''}, ${Math.round((Date.now() - started) / 1000)} s). Úplný výpis je v \`${path.relative(ROOT, jsonOut)}\`.`);
lines.push(args.wiki ? `Popis otázek: uložené úvody z Wikipedie (${(json => Object.keys(json.items && typeof json.items === 'object' ? json.items : json).length)(JSON.parse(fs.readFileSync(path.resolve(args.wiki), 'utf8')))} článků), jinak krátký popis z Wikidat.` : 'Popis otázek: krátký popis z Wikidat (pole `d`, jako při výpadku Wikipedie); úvody z Wikipedie se načítají až ve hře (`--wiki=soubor` je doplní), proto „chudý popis“ vychází skoro u všech položek.');
lines.push('', '## Souhrn', '');
lines.push(`- Nálezů celkem: **${all.length}**, jistých chyb (kritických): **${critical.length}**${allowed.length ? ` (+ ${allowed.length} ve výjimkách scripts/audit-allowlist.json)` : ''}. Exit kód: ${critical.length ? 1 : 0}.`);
lines.push('', '| Problém | Počet |', '|---|---:|');
for (const kind of kinds) lines.push(`| ${KIND_LABELS[kind]} | ${byKind.get(kind) || 0} |`);
lines.push('', '| Téma | Položek | Nálezů | Prozrazeno | Možnosti | Obrázky | Jiná země/doba | Podobné | Aliasy | Duplicita |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const entry of results) {
    const counts = countBy(entry.findings, 'kind');
    lines.push(`| ${entry.title} | ${entry.items} | ${entry.findings.length} | ${counts.get('prozrazeno') || 0} | ${(counts.get('moznosti') || 0) + (counts.get('moznosti-malo') || 0)} | ${counts.get('obrazek') || 0} | ${(counts.get('moznosti-zeme') || 0) + (counts.get('moznosti-doba') || 0)} | ${counts.get('moznosti-podobne') || 0} | ${counts.get('aliasy') || 0} | ${counts.get('duplicita') || 0} |`);
}
const byType = countBy(all.filter(finding => finding.kind === 'prozrazeno'), 'type');
if (byType.size) lines.push('', `Prozrazení podle druhu otázky: ${[...byType].sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type} ${count}`).join(', ')}.`);
const header = ['| Téma | Položka | Druh | Problém | Úryvek |', '|---|---|---|---|---|'];
if (critical.length) {
    lines.push('', '## Jisté chyby (kritické)', '', ...header);
    for (const finding of sorted.filter(item => isCritical(item) && !isAllowed(item, allowlist)).slice(0, 150)) lines.push(row(finding));
    if (critical.length > 150) lines.push('', `… a dalších ${critical.length - 150} v JSON.`);
}
lines.push('', '## Podezřelé a nejisté (ukázky, zbytek v JSON)', '');
for (const kind of kinds) {
    const list = sorted.filter(finding => finding.kind === kind && !isCritical(finding));
    if (!list.length) continue;
    lines.push(`### ${KIND_LABELS[kind]} (${list.length})`, '', ...header);
    for (const finding of list.slice(0, 12)) lines.push(row(finding));
    lines.push('');
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join('\n')}\n`);

if (!quiet) {
    process.stderr.write(`\nNálezů: ${all.length}, jistých chyb: ${critical.length}${allowed.length ? ` (+${allowed.length} ve výjimkách)` : ''}; zpráva: ${path.relative(ROOT, out)}, ${path.relative(ROOT, jsonOut)}\n`);
    for (const finding of critical.slice(0, 40)) process.stderr.write(`  ! ${finding.topic}/${finding.name} [${finding.type}] ${finding.problem} – ${finding.snippet}\n`);
    if (critical.length > 40) process.stderr.write(`  … a dalších ${critical.length - 40}\n`);
}
process.exit(critical.length ? 1 : 0);
