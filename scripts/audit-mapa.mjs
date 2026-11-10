#!/usr/bin/env node
// Kontrola mapy pro otázku „Ukaž na mapě“: npm run audit:mapa [-- --source --wikidata --only=svet,staty --out=… --json=… --quiet]
// Projde podkladovou mapu světa a Česka (data/mapa.json: moře a pevnina na známých místech, díry v pevnině, hranice končící
// „do ztracena“, jezera, plochy států, šev na 180. poledníku), polohy položek (bod ve státě, který položka uvádí, na pevnině
// či ve vodě podle druhu, stejné souřadnice), obrysy z data/mapa-tvary.json (jen čtení: bod uvnitř, rozloha a délka proti datům,
// pevnina × voda proti podkladové mapě, stát, mezery v řekách, ústí, křížení) a sestavení otázek (poloměry, pohled, zadání,
// stejnojmenná místa). Výstup: reports/audit-mapy.md (čitelný souhrn) a reports/audit-mapy.json (vše).
// Exit kód je nenulový při kritickém nálezu (podkladová mapa, státy, sestavení otázek, soubor oprav). Obrysy kritické nejsou:
// řadí se podle podezřelosti pro opravu v scripts/build-mapa-tvary.mjs.
// --source: porovná pevninu s Natural Earth 1:50m (zdroj mapy; s BUILD_CACHE z mezipaměti, jinak ze sítě)
// --wikidata: u podezřelých poloh dohledá souřadnice P625 na Wikidatech (QLever) a napíše, jestli data sedí s Wikidaty
// Poznámky z ruční prohlídky map (reports/audit-mapy-poznamky.md) se vloží na konec zprávy.
// Opravy poloh a vyřazení míst se zapisují ručně do data/mapa-opravy.json (skip: QID → důvod, points: QID → [šířka, délka],
// notes: QID → důvod opravy polohy) – aplikace je použije při sestavení otázky.
import fs from 'node:fs';
import path from 'node:path';
import { runAudit, ROOT, SEVERITIES, SECTIONS } from './lib/audit-mapa-checks.mjs';
import { haversineKm } from './lib/audit-mapa-geo.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const out = path.resolve(ROOT, args.out || 'reports/audit-mapy.md');
const jsonOut = path.resolve(ROOT, args.json || 'reports/audit-mapy.json');
const quiet = args.quiet === 'true';
const only = args.only ? args.only.split(',') : null;
const started = Date.now();
const log = (text) => { if (!quiet) process.stderr.write(`${text}\n`); };

let sourceLand = null;
if (args.source === 'true') {
    const { layer, polygonsOf } = await import('./lib/natural-earth.mjs');
    sourceLand = (await layer('ne_50m_land')).features.flatMap(feature => polygonsOf(feature.geometry));
    log(`Natural Earth 1:50m: ${sourceLand.length} mnohoúhelníků pevniny`);
}

const result = runAudit({ sourceLand, only });
const { findings, stats, counts, data } = result;

// Souřadnice z Wikidat k podezřelým polohám (volitelně)
if (args.wikidata === 'true') {
    const { qlever, values, sleep, id, parsePoint } = await import('./lib/wikidata.mjs');
    const suspects = findings.filter(finding => finding.section === 'polohy' && finding.q && /^Q\d+$/.test(finding.q));
    const qids = [...new Set(suspects.map(finding => finding.q))];
    const coordinates = {};
    for (let i = 0; i < qids.length; i += 150) {
        const rows = await qlever(`SELECT ?x ?c WHERE { VALUES ?x { ${values(qids.slice(i, i + 150))} } ?x wdt:P625 ?c }`);
        for (const row of rows) {
            const point = parsePoint(row.c.value);
            if (point) (coordinates[id(row.x.value)] = coordinates[id(row.x.value)] || []).push([point.lat ?? point[0], point.lon ?? point[1]]);
        }
        await sleep(1000);
    }
    for (const finding of suspects) {
        const found = coordinates[finding.q] || [];
        finding.wikidata = found.map(([lat, lon]) => [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000]);
        const nearest = found.length ? Math.min(...found.map(point => haversineKm(point, [finding.lat, finding.lon]))) : null;
        finding.wikidataKm = nearest === null ? null : Math.round(nearest);
        finding.text += nearest === null ? ' · Wikidata: bez souřadnic' : nearest < 5 ? ' · Wikidata: stejná poloha' : ` · Wikidata: ${finding.wikidata.map(point => point.join(', ')).join(' | ')} (${Math.round(nearest)} km od dat)`;
    }
    log(`Wikidata: ${Object.keys(coordinates).length}/${qids.length} položek se souřadnicemi`);
}

// --- Zpráva --------------------------------------------------------------------------------------------------------------

const SEVERITY_LABELS = { critical: 'kritické', high: 'vysoké', medium: 'střední', low: 'nízké', info: 'informace' };
const escape = (text) => String(text).replace(/\|/g, '\\|');
const lines = [];
const push = (...rows) => lines.push(...rows);
const levelName = (k) => (k === 1 ? 'Z' : 'P');
const criticalSections = ['svet', 'cesko', 'staty', 'polohy', 'otazky', 'opravy'];
const critical = findings.filter(finding => finding.severity === 'critical' && criticalSections.includes(finding.section));
const exitCode = critical.length ? 1 : 0;

push('# Audit mapy „Ukaž na mapě“', '');
push(`Vygenerováno ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC skriptem \`npm run audit:mapa\`${args.source === 'true' ? ' (s porovnáním se zdrojem Natural Earth)' : ''}${args.wikidata === 'true' ? ' (s dohledáním souřadnic na Wikidatech)' : ''}. Úplný výpis je v \`reports/audit-mapy.json\`.`);
push(`Podkladová mapa: \`data/mapa.json\` (${Math.round(fs.statSync(path.join(ROOT, 'data/mapa.json')).size / 1024)} kB, ${data.map.generated}); obrysy: \`data/mapa-tvary.json\` (${Object.keys(data.shapes).length} obrysů); opravy: \`data/mapa-opravy.json\` (${Object.keys(data.fixes.skip).length} vyřazených míst, ${Object.keys(data.fixes.points).length} opravených poloh).`, '');
push('## Souhrn', '');
push(`- Nálezů celkem: **${findings.length}**, kritických: **${critical.length}**. Exit kód: ${exitCode}.`);
if (result.asked) push(`- Otázek na mapě: **${result.asked.length}** (z toho ${result.asked.filter(entry => entry.item.k === 1).length} na úrovni Základní).`);
push('');
push(`| Oblast | ${SEVERITIES.map(severity => SEVERITY_LABELS[severity]).join(' | ')} |`, `|---|${SEVERITIES.map(() => '---:').join('|')}|`);
for (const [section, label] of Object.entries(SECTIONS)) {
    const row = SEVERITIES.map(severity => findings.filter(finding => finding.section === section && finding.severity === severity).length);
    push(`| ${label} | ${row.join(' | ')} |`);
}
push('');

const table = (section, { limit = 200, columns = false, minSeverity = 'info' } = {}) => {
    const max = SEVERITIES.indexOf(minSeverity);
    const rows = findings.filter(finding => finding.section === section && SEVERITIES.indexOf(finding.severity) <= max);
    if (!rows.length) { push('Bez nálezů.', ''); return; }
    if (columns) {
        push('| Závažnost | Téma | Druh | Úr. | Místo | Nález |', '|---|---|---|---|---|---|');
        for (const finding of rows.slice(0, limit)) push(`| ${SEVERITY_LABELS[finding.severity]} | ${finding.topic || ''} | ${finding.kind || ''} | ${finding.k === undefined ? '' : levelName(finding.k)} | ${escape(finding.name || '')} ${finding.q ? `(${finding.q})` : ''} | ${escape(finding.text)} |`);
    } else {
        push('| Závažnost | Kontrola | Nález |', '|---|---|---|');
        for (const finding of rows.slice(0, limit)) push(`| ${SEVERITY_LABELS[finding.severity]} | ${finding.code} | ${escape(finding.text)} |`);
    }
    if (rows.length > limit) push('', `… a dalších ${rows.length - limit} (viz JSON).`);
    push('');
};

if (stats.svet) {
    push('## Podkladová mapa světa', '');
    push(`Kontrolní body: ${stats.svet.samples.water} moří a zálivů, ${stats.svet.samples.lakes} jezer, ${stats.svet.samples.land} míst na pevnině. Kroužků pevniny: ${Object.entries(stats.svet.rings).map(([name, count]) => `${name} ${count}`).join(', ')}; děr v pevnině ${stats.svet.holes}; jezer ${stats.svet.lakes}; hranic ${stats.svet.borders.lines} čar s ${stats.svet.borders.ends} volnými konci (nejhorší konec ${stats.svet.borders.worstUnits} j od břehu/hranice).`);
    push(`Antarktida: výřez končí na ${stats.svet.antarctica.frameSouth}° j. š.; pevnina pod výřezem ${stats.svet.antarctica.drawnBelowFrame ? 'je nakreslená (vidět jen na vysokém displeji při oddálení)' : 'není nakreslená'}.`);
    if (stats.zdroj) push(`Porovnání se zdrojem (Natural Earth 1:50m, mřížka 0,5°): ${stats.zdroj.compared} bodů, ${stats.zdroj.mismatches} neshod dál než 3 j od pobřeží.`);
    push('');
    table('svet');
}
if (stats.cesko) {
    push('## Podkladová mapa Česka', '');
    push(`Krajů ${stats.cesko.kraje}, řek ${stats.cesko.rivers} čar, hranic krajů ${stats.cesko.innerLines} čar, státních hranic ${stats.cesko.borderLines} čar.`, '');
    table('cesko');
}
if (stats.staty) {
    push('## Státy na mapě', '');
    push(`Států v data/countries.json: ${stats.staty.countries}, s plochou na mapě: ${stats.staty.withArea}; ploch na mapě ${stats.staty.areas}; položek států ${stats.staty.stateItems}, zkontrolovaných hlavních měst ${stats.staty.capitalsChecked}; bodů pevniny bez státu ${stats.staty.statelessLandPoints}.`, '');
    table('staty', { minSeverity: 'low' });
    const info = findings.filter(finding => finding.section === 'staty' && finding.severity === 'info');
    if (info.length) push(`Informace (${info.length}): bod státu mimo jeho plochu do 150 km – ${info.map(finding => `${finding.name} ${finding.km} km`).join(', ')}.`, '');
}
if (stats.polohy) {
    push('## Polohy položek', '');
    push(`Zkontrolováno ${stats.polohy.checked} otázek, u ${stats.polohy.countryChecked} stát podle plochy na mapě (tolerance ${25} km, v moři ${60} km). Jezera: ${stats.polohy.lakesDrawn} nakreslených na podkladové mapě, ${stats.polohy.lakesNotDrawn} ne. Míst se stejnými souřadnicemi a jiným jménem (stavby, bitvy… na stejném místě): ${stats.polohy.sharedSites}.`, '');
    table('polohy', { columns: true, limit: 300 });
}
if (result.shapes) {
    push('## Obrysy (data/mapa-tvary.json) – podle podezřelosti', '');
    push(`Zkontrolováno ${stats.tvary.checked} obrysů otázek (z toho ${stats.tvary.lines} řek), podezřelých ${stats.tvary.flagged}; obrysů bez položky ${stats.tvary.orphan}; u ${stats.tvary.basemapOutline} ostrovů a jezer se ve výsledku použije obrys z podkladové mapy.`);
    push('Skóre sčítá důvody (bod mimo obrys, rozloha/délka proti datům, pevnina × voda proti podkladové mapě, jiný stát, mezera, ústí, křížení). Obrysy opravuje `scripts/build-mapa-tvary.mjs`; tady se jen hlásí.', '');
    const byCode = {};
    for (const shape of result.shapes) for (const reason of shape.reasons) byCode[reason.code] = (byCode[reason.code] || 0) + 1;
    push(`Důvody: ${Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code} ${count}`).join(', ')}.`, '');
    push('| # | Skóre | Druh | Úr. | Místo | Důvody |', '|---:|---:|---|---|---|---|');
    result.shapes.slice(0, 150).forEach((shape, index) => push(`| ${index + 1} | ${shape.score} | ${shape.kind} | ${levelName(shape.k)} | ${escape(shape.name)} (${shape.q}) | ${escape(shape.reasons.map(reason => reason.text).join('; '))} |`));
    if (result.shapes.length > 150) push('', `… a dalších ${result.shapes.length - 150} (viz JSON).`);
    push('');
}
if (stats.otazky) {
    push('## Sestavení otázek', '');
    push(`Otázek ${stats.otazky.built}; pohled: Česko ${stats.otazky.views.cesko}, celý svět ${stats.otazky.views.world}, kontinent ${stats.otazky.views.continent}; skupin stejnojmenných míst dál než 30 km od sebe ${stats.otazky.sameNames}; zadání s doplněným druhem ${stats.otazky.disambiguated}.`, '');
    table('otazky', { columns: true, limit: 200 });
    push('### Zadání podle vzoru (k ruční kontrole)', '', '| Vzor | Počet | Ukázky |', '|---|---:|---|');
    for (const [label, entry] of Object.entries(result.patterns)) push(`| ${label} | ${entry.count} | ${escape(entry.examples.join(' · '))} |`);
    push('');
    if (result.disambiguated.length) {
        push('### Zadání s doplněným druhem (stejné jméno u jiného druhu místa)', '');
        push(result.disambiguated.map(entry => `„${entry.title}“`).join(' · '), '');
    }
}
if (result.coverage) {
    push('## Pokrytí', '', 'Položek s polohou / otázek na mapě / z toho s obrysem; úroveň Základní (k = 1) a Pokročilá (ostatní).', '');
    push('| Druh | Základní: položek | otázek | s obrysem | Pokročilá: položek | otázek | s obrysem | Vyřazeno opravami |', '|---|---:|---:|---:|---:|---:|---:|---:|');
    const total = { 1: { items: 0, built: 0, shape: 0 }, 0: { items: 0, built: 0, shape: 0 }, skipped: 0 };
    for (const row of result.coverage) {
        push(`| ${row.label} | ${row.levels[1].items} | ${row.levels[1].built} | ${row.levels[1].shape} | ${row.levels[0].items} | ${row.levels[0].built} | ${row.levels[0].shape} | ${row.skipped} |`);
        for (const level of [1, 0]) for (const key of ['items', 'built', 'shape']) total[level][key] += row.levels[level][key];
        total.skipped += row.skipped;
    }
    push(`| **Celkem** | ${total[1].items} | ${total[1].built} | ${total[1].shape} | ${total[0].items} | ${total[0].built} | ${total[0].shape} | ${total.skipped} |`, '');
}
if (result.notAsked) {
    push('### Proč se mapa na místo neptá', '', 'Položky povoleného druhu s polohou, ze kterých otázka na mapě nevznikne; vypsané jsou jen položky úrovně Základní.', '');
    push('| Důvod | Základní | Pokročilá | Položky úrovně Základní |', '|---|---:|---:|---|');
    for (const entry of Object.values(result.notAsked)) {
        const basic = entry.items.filter(item => item.k === 1);
        const names = basic.slice(0, 60).map(item => `${item.name} (${item.kind})`).join(', ');
        push(`| ${entry.label} | ${basic.length} | ${entry.items.length - basic.length} | ${escape(names)}${basic.length > 60 ? ` … a dalších ${basic.length - 60}` : ''} |`);
    }
    push('');
}
if (stats.opravy) {
    push('## Opravy (data/mapa-opravy.json)', '');
    const names = new Map(Object.values(data.topics).flat().map(item => [item.q, item.n]));
    table('opravy');
    const skip = Object.entries(data.fixes.skip);
    if (skip.length) { push('### Vyřazená místa', '', '| Místo | Důvod |', '|---|---|'); for (const [qid, reason] of skip) push(`| ${escape(names.get(qid) || '?')} (${qid}) | ${escape(reason)} |`); push(''); }
    const points = Object.entries(data.fixes.points);
    if (points.length) { push('### Opravené polohy', '', '| Místo | Poloha | Důvod |', '|---|---|---|'); for (const [qid, point] of points) push(`| ${escape(names.get(qid) || '?')} (${qid}) | ${point.join(', ')} | ${escape((data.fixes.notes || {})[qid] || '')} |`); push(''); }
}

// Ručně psané poznámky z prohlídky vykreslených map (obrysy k opravě, chyby mimo dosah kontroly) se vloží beze změny
const notesFile = path.join(ROOT, 'reports/audit-mapy-poznamky.md');
if (!only && fs.existsSync(notesFile)) push('## Ruční prohlídka', '', fs.readFileSync(notesFile, 'utf8').trim(), '');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join('\n')}\n`);
fs.writeFileSync(jsonOut, `${JSON.stringify({
    generated: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), exitCode, counts, stats,
    findings, shapes: result.shapes || [], patterns: result.patterns || {}, disambiguated: result.disambiguated || [], coverage: result.coverage || [], notAsked: result.notAsked || {}
}, null, 1)}\n`);

log(`Nálezů ${findings.length}: ${SEVERITIES.map(severity => `${SEVERITY_LABELS[severity]} ${counts[severity]}`).join(', ')} (${Math.round((Date.now() - started) / 1000)} s)`);
for (const finding of critical.slice(0, 40)) log(`  KRITICKÉ [${finding.section}/${finding.code}] ${finding.text}`);
log(`Zpráva: ${path.relative(ROOT, out)}, ${path.relative(ROOT, jsonOut)}`);
process.exit(exitCode);
