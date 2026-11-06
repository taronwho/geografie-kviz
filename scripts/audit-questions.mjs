#!/usr/bin/env node
// Audit kvality otázek všech témat: npm run audit:otazky [-- --topic=zemepis,historie --limit=200 --wiki=cesta.json --out=reports/audit-otazek.md]
// Projde všechny položky a všechny druhy otázek, které téma umí (viz scripts/lib/audit.mjs), zapíše reports/audit-otazek.md
// a skončí nenulově, když najde kritický problém (prozrazená odpověď, rozbité možnosti), který není ve scripts/audit-allowlist.json.
// --wiki=soubor: uložené úvody článků z Wikipedie ({ "Titulek": "text" }) – bez něj se hodnotí krátký popis z Wikidat (jako při výpadku sítě).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_IDS, auditTopic, isCritical, loadAllowlist, isAllowed } from './lib/audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;
const limit = args.limit ? Number(args.limit) : Infinity;
const out = path.resolve(ROOT, args.out || 'reports/audit-otazek.md');
const wiki = args.wiki ? JSON.parse(fs.readFileSync(path.resolve(ROOT, args.wiki), 'utf8')) : null;
const quiet = args.quiet === 'true';
const allowlist = loadAllowlist();

const KIND_LABELS = {
    prozrazeno: '1 · odpověď prozrazená v popisu či nápovědě', duplicita: '2 · nápověda opakuje popis', moznosti: '3 · rozbité možnosti',
    'moznosti-malo': '3b · málo možností', 'chudy-popis': '4 · chudý popis', 'bez-napovedy': '4b · bez nápovědy', data: '5 · rozbitá data'
};
const started = Date.now();
const all = [];
const perTopic = [];
for (const id of topics) {
    const startedTopic = Date.now();
    const { topic, items, findings } = auditTopic(id, { limit, wiki, onProgress: (done, total) => { if (!quiet) process.stderr.write(`  ${id}: ${done}/${total}\r`); } });
    perTopic.push({ id, title: topic.title, items, findings });
    all.push(...findings);
    if (!quiet) process.stderr.write(`${id}: ${items} položek, ${findings.length} nálezů (${Math.round((Date.now() - startedTopic) / 1000)} s)\n`);
}
const critical = all.filter(finding => isCritical(finding) && !isAllowed(finding, allowlist));
const allowed = all.filter(finding => isCritical(finding) && isAllowed(finding, allowlist));

// --- Zpráva ---
const escapeCell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const countBy = (list, key) => list.reduce((map, finding) => map.set(finding[key], (map.get(finding[key]) || 0) + 1), new Map());
const kinds = Object.keys(KIND_LABELS);
const lines = [];
lines.push('# Audit otázek', '');
lines.push(`Vygenerováno ${new Date().toISOString().slice(0, 16).replace('T', ' ')} skriptem \`npm run audit:otazky\` (${topics.length} témat, ${perTopic.reduce((sum, entry) => sum + entry.items, 0)} položek, ${Math.round((Date.now() - started) / 1000)} s).`);
lines.push(wiki ? `Popis otázek: uložené úvody z Wikipedie (${Object.keys(wiki).length} článků), jinak krátký popis z Wikidat.` : 'Popis otázek: krátký popis z Wikidat (pole `d`, jako při výpadku Wikipedie); úvody z Wikipedie se načítají až ve hře (`--wiki=soubor` je doplní).');
lines.push('', '## Souhrn', '');
lines.push(`- Nálezů celkem: **${all.length}**, kritických (prozrazení, možnosti): **${critical.length}**${allowed.length ? ` (+ ${allowed.length} ve výjimkách scripts/audit-allowlist.json)` : ''}.`);
lines.push('', '| Problém | Počet |', '|---|---:|');
for (const kind of kinds) lines.push(`| ${KIND_LABELS[kind]} | ${countBy(all, 'kind').get(kind) || 0} |`);
lines.push('', '| Téma | Položek | Nálezů | Prozrazeno | Duplicita | Možnosti | Chudý popis | Bez nápovědy | Data |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const entry of perTopic) {
    const counts = countBy(entry.findings, 'kind');
    lines.push(`| ${entry.title} | ${entry.items} | ${entry.findings.length} | ${counts.get('prozrazeno') || 0} | ${counts.get('duplicita') || 0} | ${(counts.get('moznosti') || 0) + (counts.get('moznosti-malo') || 0)} | ${counts.get('chudy-popis') || 0} | ${counts.get('bez-napovedy') || 0} | ${counts.get('data') || 0} |`);
}
const byType = countBy(all.filter(finding => finding.kind === 'prozrazeno'), 'type');
if (byType.size) lines.push('', `Prozrazení podle druhu otázky: ${[...byType].sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type} ${count}`).join(', ')}.`);
lines.push('', '## Nálezy', '');
lines.push('Kritické (1 a 3) jsou v tabulce první. Úryvek je text, ve kterém se problém našel (popis po zakrytí, hodnota faktu, možnosti).', '');
lines.push('| Téma | Položka | q | Otázka | Problém | Úryvek |', '|---|---|---|---|---|---|');
const order = (finding) => (isCritical(finding) ? 0 : 1);
const sorted = [...all].sort((a, b) => order(a) - order(b) || a.topic.localeCompare(b.topic) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'cs'));
for (const finding of sorted) {
    const mark = isCritical(finding) ? (isAllowed(finding, allowlist) ? '⚪ ' : '🔴 ') : '';
    lines.push(`| ${escapeCell(finding.topic)} | ${escapeCell(finding.name)} | ${escapeCell(finding.q)} | ${escapeCell(finding.type)} | ${mark}${escapeCell(KIND_LABELS[finding.kind] ? finding.kind : finding.kind)}: ${escapeCell(finding.problem)} | ${escapeCell(finding.snippet)} |`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join('\n')}\n`);
if (args.json) fs.writeFileSync(path.resolve(ROOT, args.json), JSON.stringify(all, null, 1));

if (!quiet) {
    process.stderr.write(`\nNálezů: ${all.length}, kritických: ${critical.length}${allowed.length ? ` (+${allowed.length} ve výjimkách)` : ''}; zpráva: ${path.relative(ROOT, out)}\n`);
    for (const finding of critical.slice(0, 40)) process.stderr.write(`  🔴 ${finding.topic}/${finding.name} [${finding.type}] ${finding.problem} — ${finding.snippet}\n`);
    if (critical.length > 40) process.stderr.write(`  … a dalších ${critical.length - 40}\n`);
}
process.exit(critical.length ? 1 : 0);
