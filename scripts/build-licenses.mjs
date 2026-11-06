// Licence obrázků z Wikimedia Commons: pro každý soubor `im` ze všech data/*.json stáhne z Commons API autora, licenci
// a odkaz na stránku souboru a označí soubory, které nejdou komerčně použít (NC, ND, „fair use“, chybějící licence).
//   node scripts/build-licenses.mjs [--offline] [--force] [--limit N]
//     --offline  nic nestahuje, jen doplní strukturu (seznam souborů podle témat) do data/licenses.json a sestaví report
//     --force    stáhne znovu i soubory, které už v mezipaměti jsou
//     --limit N  stáhne nejvýš N dávek (zkouška)
// Výstup: data/licenses.json (mezipaměť i data pro licence.html) a reports/licence-problemy.md (seznam k nahrazení před vydáním).
// Spouští se lokálně, nebo v GitHub Action .github/workflows/licenses.yml (workflow_dispatch), která výsledek commitne.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_FILE = join(ROOT, 'data', 'licenses.json');
export const REPORT_FILE = join(ROOT, 'reports', 'licence-problemy.md');
export const API = 'https://commons.wikimedia.org/w/api.php';
export const USER_AGENT = 'Mudrlant/1.0 (kviz; github taronwho/geografie-kviz)';
export const BATCH = 50;
// Soubory s daty témat: položky mají `im` (název souboru na Commons); countries/world/photo-* žádné nemají
const SKIP_FILES = new Set(['licenses.json']);

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Název souboru tak, jak ho Commons normalizuje: podtržítka na mezery, první písmeno velké, bez předpony File:
export const normalizeName = (name) => {
    const plain = String(name || '').trim().replace(/^(?:File|Soubor):/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return plain ? plain[0].toUpperCase() + plain.slice(1) : '';
};
export const toTitle = (name) => `File:${normalizeName(name)}`;
// Stránka souboru na Commons (odkaz pro licence.html se z názvu dopočítá, do mezipaměti se ukládá jen jiná adresa)
export const filePageUrl = (name) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(normalizeName(name).replace(/ /g, '_'))}`;

export const chunk = (list, size = BATCH) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

// Text bez HTML (autor bývá odkaz nebo i celá tabulka), zkrácený
export const stripHtml = (html, max = 120) => {
    const text = String(html || '')
        .replace(/<br\s*\/?>/gi, ', ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
};

// Soubory ze všech témat: název → seznam témat (stejný obrázek může mít víc témat)
export const collectFiles = (dataDir = join(ROOT, 'data')) => {
    const topics = readdirSync(dataDir).filter(file => file.endsWith('.json') && !SKIP_FILES.has(file)).sort();
    const files = new Map();
    const used = [];
    for (const file of topics) {
        const data = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
        const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
        const topic = file.replace(/\.json$/, '');
        let count = 0;
        for (const item of items) {
            if (!item || typeof item.im !== 'string' || !item.im.trim()) continue;
            const name = normalizeName(item.im);
            if (!files.has(name)) files.set(name, new Set());
            files.get(name).add(topic);
            count++;
        }
        if (count) used.push(topic);
    }
    return { topics: used, files };
};

// Označení problému podle metadat: 'nc' (nekomerční), 'nd' (bez odvozenin), 'nc-nd', 'fair' (fair use), 'none' (bez licence), 'missing' (soubor na Commons není)
export const flagFor = (meta) => {
    if (!meta) return 'none';
    const text = [meta.LicenseShortName, meta.License, meta.UsageTerms, meta.LicenseUrl].map(field => String((field && field.value) || '')).join(' ');
    if (/fair[\s-]?use|non-free/i.test(text)) return 'fair';
    const nc = /\bNC\b|non-?commercial|nekomer/i.test(text);
    const nd = /\bND\b|no-?deriv/i.test(text);
    if (nc && nd) return 'nc-nd';
    if (nc) return 'nc';
    if (nd) return 'nd';
    const short = String((meta.LicenseShortName && meta.LicenseShortName.value) || '').trim();
    const copyrighted = String((meta.Copyrighted && meta.Copyrighted.value) || '').toLowerCase();
    // Volná díla mají Copyrighted=False (často i bez LicenseShortName); jinak bez licence = nelze doložit právo užití
    if (!short && copyrighted !== 'false') return 'none';
    return '';
};

// Záznam pro mezipaměť z jedné stránky odpovědi API (kompaktní: a = autor, l = licence, u = odkaz na licenci, p = stránka souboru jen když není standardní, flag jen při problému)
export const parsePage = (page) => {
    if (!page) return null;
    if (page.missing !== undefined || page.invalid !== undefined) return { flag: 'missing' };
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info) return { flag: 'missing' };
    const meta = info.extmetadata || {};
    const entry = {};
    const author = stripHtml(meta.Artist && meta.Artist.value);
    const credit = stripHtml(meta.Credit && meta.Credit.value, 80);
    if (author) entry.a = author;
    else if (credit) entry.a = credit;
    const license = stripHtml(meta.LicenseShortName && meta.LicenseShortName.value, 60);
    if (license) entry.l = license;
    const url = String((meta.LicenseUrl && meta.LicenseUrl.value) || '').trim();
    if (/^https?:\/\//.test(url)) entry.u = url;
    const name = normalizeName(page.title);
    if (info.descriptionurl && info.descriptionurl !== filePageUrl(name)) entry.p = info.descriptionurl;
    const flag = flagFor(meta);
    if (flag) entry.flag = flag;
    return entry;
};

// Celá odpověď API na dávku: normalizované názvy (API vrací `normalized` from→to, stránky s title File:…) → záznamy podle názvu bez předpony
export const parseResponse = (response, requested) => {
    const result = new Map();
    const pages = (response && response.query && response.query.pages) || {};
    for (const page of Object.values(pages)) {
        if (!page || !page.title) continue;
        const entry = parsePage(page);
        if (entry) result.set(normalizeName(page.title), entry);
    }
    // Co API neuvedlo (přesměrování, chyba), zůstane nestažené a zkusí se příště
    return result;
};

export const readCache = (file = CACHE_FILE) => {
    if (!existsSync(file)) return { generated: '', topics: [], files: {} };
    try {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        return { generated: data.generated || '', topics: Array.isArray(data.topics) ? data.topics : [], files: data.files && typeof data.files === 'object' ? data.files : {} };
    } catch (error) {
        return { generated: '', topics: [], files: {} };
    }
};

// Záznam je stažený, když má licenci, autora nebo označení (jen `t` = zatím neznámý)
export const isFetched = (entry) => Boolean(entry && (entry.l || entry.a || entry.u || entry.flag));

// Sloučení: seznam souborů z dat (s tématy) + co už je v mezipaměti; soubory, které z dat zmizely, se vyhodí
export const mergeIndex = (cache, collected) => {
    const topics = collected.topics;
    const files = {};
    for (const [name, topicSet] of [...collected.files.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'))) {
        const old = cache.files[name] || {};
        const { t, ...rest } = old;
        files[name] = { ...rest, t: [...topicSet].map(topic => topics.indexOf(topic)).filter(index => index >= 0).sort((a, b) => a - b) };
    }
    return { generated: cache.generated || '', topics, files };
};

export const writeCache = (data, file = CACHE_FILE) => {
    mkdirSync(dirname(file), { recursive: true });
    // Řádek na soubor: čitelné rozdíly v gitu, přitom skoro stejně malé jako jeden řádek
    const lines = Object.entries(data.files).map(([name, entry]) => `    ${JSON.stringify(name)}: ${JSON.stringify(entry)}`);
    writeFileSync(file, `{\n  "generated": ${JSON.stringify(data.generated)},\n  "topics": ${JSON.stringify(data.topics)},\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`);
};

// Jedno volání API s opakováním: 429 podle Retry-After, 5xx a výpadky s rostoucí pauzou
export const fetchBatch = async (names, { fetchImpl = fetch, attempts = 8, log = console } = {}) => {
    const params = new URLSearchParams({ action: 'query', prop: 'imageinfo', iiprop: 'extmetadata|url', iiextmetadatalanguage: 'cs', titles: names.map(toTitle).join('|'), format: 'json', formatversion: '2', maxlag: '5' });
    for (let attempt = 1; attempt <= attempts; attempt++) {
        let status;
        let wait = Math.min(15000 * attempt, 120000);
        try {
            // POST: dávka dlouhých názvů by v adrese překročila limit délky (HTTP 414)
            const response = await fetchImpl(API, { method: 'POST', headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
            if (response.ok) {
                const data = await response.json();
                if (data && data.error && data.error.code === 'maxlag') { status = 'maxlag'; }
                else return parseResponse(data, names);
            } else {
                status = `HTTP ${response.status}`;
                const retryAfter = Number(response.headers && response.headers.get && response.headers.get('retry-after'));
                if (response.status === 429 && retryAfter > 0) wait = Math.min(retryAfter * 1000 + 1000, 180000);
                else if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new Error(`Commons API odmítlo dotaz (${status})`);
            }
        } catch (error) {
            if (/odmítlo dotaz/.test(error.message)) throw error;
            status = error.message;
        }
        if (attempt < attempts) { log.warn(`  ${status}, zkouším znovu za ${Math.round(wait / 1000)} s (${attempt}/${attempts})`); await sleep(wait); }
    }
    throw new Error('Commons API neodpovídá (příliš mnoho požadavků nebo výpadek)');
};

export const FLAG_LABELS = { 'nc-nd': 'nekomerční a bez odvozenin (NC-ND)', nc: 'nekomerční (NC)', nd: 'bez odvozenin (ND)', fair: 'fair use / nesvobodný', none: 'bez uvedené licence', missing: 'soubor na Commons neexistuje' };
const FLAG_ORDER = ['nc-nd', 'nc', 'nd', 'fair', 'none', 'missing'];

// Report problémových souborů podle témat (Markdown); vrací text
export const buildReport = (data, { now = new Date() } = {}) => {
    const entries = Object.entries(data.files);
    const fetched = entries.filter(([, entry]) => isFetched(entry));
    const problems = fetched.filter(([, entry]) => entry.flag);
    const topicName = (index) => data.topics[index] || '?';
    const lines = [];
    lines.push('# Obrázky k nahrazení před komerčním vydáním', '');
    lines.push(`Sestaveno ${now.toISOString().slice(0, 10)} skriptem \`scripts/build-licenses.mjs\` z metadat Wikimedia Commons (\`data/licenses.json\`).`);
    lines.push('Uvedené soubory mají licenci, která nedovoluje komerční užití nebo úpravy (ořez, překrytí), jsou „fair use“, nebo licenci neuvádějí.');
    lines.push('Před vydáním v Google Play je nutné je nahradit jiným obrázkem (nebo položku ponechat bez fotky). Licence CC BY, CC BY-SA, CC0 a volná díla jsou v pořádku,');
    lines.push('vyžadují jen uvedení autora a licence – to dělá stránka Zdroje a licence (`licence.html`).', '');
    lines.push('## Souhrn', '');
    lines.push(`- souborů celkem: **${entries.length}**, s načtenými metadaty: **${fetched.length}**, zatím nestaženo: **${entries.length - fetched.length}**`);
    lines.push(`- problémových: **${problems.length}**`);
    for (const flag of FLAG_ORDER) {
        const count = problems.filter(([, entry]) => entry.flag === flag).length;
        if (count) lines.push(`  - ${FLAG_LABELS[flag]}: ${count}`);
    }
    lines.push('', '## Počty podle témat', '', '| Téma | Souborů | Problémových | NC | ND | NC-ND | fair use | bez licence | chybí |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    data.topics.forEach((topic, index) => {
        const inTopic = entries.filter(([, entry]) => Array.isArray(entry.t) && entry.t.includes(index));
        const bad = inTopic.filter(([, entry]) => entry.flag);
        const count = (flag) => bad.filter(([, entry]) => entry.flag === flag).length;
        lines.push(`| ${topic} | ${inTopic.length} | ${bad.length} | ${count('nc')} | ${count('nd')} | ${count('nc-nd')} | ${count('fair')} | ${count('none')} | ${count('missing')} |`);
    });
    lines.push('', '## Seznam souborů', '');
    if (!problems.length) lines.push(fetched.length ? 'Žádný problémový soubor.' : 'Metadata zatím nebyla stažena (spusť `node scripts/build-licenses.mjs` nebo akci „Licence obrázků“).');
    for (const flag of FLAG_ORDER) {
        const list = problems.filter(([, entry]) => entry.flag === flag);
        if (!list.length) continue;
        lines.push(`### ${FLAG_LABELS[flag]} (${list.length})`, '', '| Soubor | Témata | Licence | Autor |', '| --- | --- | --- | --- |');
        for (const [name, entry] of list) {
            const cell = (text) => String(text || '').replace(/\|/g, '\\|');
            lines.push(`| [${cell(name)}](${entry.p || filePageUrl(name)}) | ${(entry.t || []).map(topicName).join(', ')} | ${cell(entry.l || '–')} | ${cell(entry.a || '–')} |`);
        }
        lines.push('');
    }
    return `${lines.join('\n').trimEnd()}\n`;
};

export const writeReport = (data, file = REPORT_FILE) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buildReport(data));
};

// Hlavní běh: načte data a mezipaměť, stáhne chybějící, průběžně ukládá
export const main = async (argv = process.argv.slice(2), { fetchImpl = fetch, log = console } = {}) => {
    const offline = argv.includes('--offline');
    const force = argv.includes('--force');
    const limitIndex = argv.indexOf('--limit');
    const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : Infinity;
    const collected = collectFiles();
    const data = mergeIndex(force ? { generated: '', topics: [], files: {} } : readCache(), collected);
    const pending = Object.entries(data.files).filter(([, entry]) => !isFetched(entry)).map(([name]) => name);
    log.log(`Souborů ${Object.keys(data.files).length} ve ${data.topics.length} tématech, bez metadat ${pending.length}.`);
    let failure = null;
    if (!offline && pending.length) {
        const batches = chunk(pending).slice(0, limit);
        let done = 0;
        for (const names of batches) {
            try {
                const result = await fetchBatch(names, { fetchImpl, log });
                for (const name of names) {
                    const entry = result.get(name);
                    if (entry) data.files[name] = { ...entry, t: data.files[name].t };
                }
                done++;
                if (done % 10 === 0 || done === batches.length) { data.generated = new Date().toISOString().slice(0, 10); writeCache(data); log.log(`  ${done}/${batches.length} dávek`); }
                await sleep(1000);
            } catch (error) {
                failure = error;
                log.error(`Stahování přerušeno: ${error.message}`);
                break;
            }
        }
    }
    if (!data.generated) data.generated = new Date().toISOString().slice(0, 10);
    writeCache(data);
    writeReport(data);
    const left = Object.values(data.files).filter(entry => !isFetched(entry)).length;
    const problems = Object.values(data.files).filter(entry => entry.flag).length;
    log.log(`Zapsáno ${CACHE_FILE} a ${REPORT_FILE}: problémových ${problems}, bez metadat ${left}.`);
    return { failure, left, problems };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().then(({ failure, left }) => {
        if (failure) process.exit(1);
        if (left && !process.argv.includes('--offline') && !process.argv.includes('--limit')) process.exit(2);
    }).catch(error => { console.error(error); process.exit(1); });
}
