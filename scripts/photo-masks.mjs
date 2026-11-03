// Zakrytí napsané odpovědi na fotkách: u fotek z data/photo-text.json najde OCR (tesseract) polohu slov názvu položky
// a zapíše obdélníky přes ně do data/photo-masks.json ({ soubor: [[x, y, šířka, výška], …] } jako podíl rozměrů fotky).
// Aplikace pak přes ta místa dá rozmazaný obdélník a fotku jako nápovědu ukáže. Obdélník je protažený přes celý řádek
// nápisu a s okrajem, ať zakryje i písmena, která OCR přečetlo špatně.
//
// Spuštění: npm run audit:photo-masks [-- téma téma…]   (nejdřív npm run audit:photo-text)
// Náhled: PREVIEW=složka npm run audit:photo-masks -- sport   uloží fotky s vykresleným zakrytím (potřebuje ImageMagick)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../quiz-core.js');
const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(process.env.OCR_CACHE || path.join(ROOT, '.cache', 'ocr'), 'boxes');
const OUT = path.join(ROOT, 'data', 'photo-masks.json');
const FLAGGED = path.join(ROOT, 'data', 'photo-text.json');
const PREVIEW = process.env.PREVIEW || '';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(CACHE, { recursive: true });
if (PREVIEW) fs.mkdirSync(PREVIEW, { recursive: true });

// Stejná slova a shoda jako v photo-text.mjs
const GENERIC = new Set(['národní', 'park', 'hrad', 'zámek', 'most', 'kostel', 'katedrála', 'chrám', 'palác', 'věž', 'ostrov', 'řeka', 'hora',
    'jezero', 'moře', 'válka', 'bitva', 'socha', 'obraz', 'film', 'album', 'opera', 'symfonie', 'svatý', 'svatého', 'saint', 'the', 'and', 'von', 'van', 'der', 'della']);
const plain = (text) => core.normalizeAnswer(text).replace(/[^a-z0-9]+/g, ' ').trim();
const nameWords = (item) => {
    const words = new Set();
    for (const name of [item.n, core.displayName(item.t || ''), ...(item.al || [])].filter(Boolean)) {
        for (const word of name.split(/[\s,.:;!?()'"–-]+/)) {
            const key = plain(word);
            if (GENERIC.has(word.toLocaleLowerCase('cs')) || GENERIC.has(key)) continue;
            if (key.length >= 4 || (key.length === 3 && /^\p{Lu}{3}$/u.test(word))) words.add(key);
        }
    }
    return [...words];
};
const matches = (token, word) => token === word
    || (word.length >= 6 && Math.abs(token.length - word.length) <= 1 && core.levenshtein(token, word) <= 1)
    // Slovo slepené s okolím („LOLITAVolume“) nebo rozdělené čtením
    || (word.length >= 5 && token.length > word.length && token.includes(word));

const download = async (url) => {
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
            if (response.status === 429 || response.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
            if (!response.ok) return null;
            return Buffer.from(await response.arrayBuffer());
        } catch {
            await sleep(2000);
        }
    }
    return null;
};

// Slova s polohou (tesseract TSV) – stejný náhled 500 px jako u čtení textu
const readWords = async (item, image) => {
    const cached = path.join(CACHE, `${item.im.replace(/[^\w.-]+/g, '_').slice(0, 180)}.tsv`);
    let tsv;
    if (fs.existsSync(cached)) tsv = fs.readFileSync(cached, 'utf8');
    else {
        const { stdout } = await run('tesseract', [image, '-', '--psm', '11', 'tsv'], { timeout: 20000, maxBuffer: 4 << 20, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
        tsv = stdout;
        fs.writeFileSync(cached, tsv);
    }
    return tsv.split('\n').slice(1).map(line => line.split('\t')).filter(cols => cols.length >= 12 && cols[0] === '5' && cols[11].trim())
        .map(cols => ({ block: cols[2], par: cols[3], line: cols[4], left: +cols[6], top: +cols[7], width: +cols[8], height: +cols[9], text: cols[11] }));
};

const imageSize = async (image) => {
    const { stdout } = await run('identify', ['-format', '%w %h', image]);
    const [width, height] = stdout.trim().split(' ').map(Number);
    return { width, height };
};

// Obdélníky: hledané slovo a sousední slova téhož řádku (celé jméno „VLADIMIR NABOKOV“), s okrajem
const masksFor = (words, wanted, size) => {
    const hits = words.filter(word => {
        const key = plain(word.text).replace(/ /g, '');
        return key.length >= 3 && wanted.some(name => matches(key, name));
    });
    const boxes = [];
    for (const hit of hits) {
        const sameLine = words.filter(word => word.block === hit.block && word.par === hit.par && word.line === hit.line);
        // Sousedé na řádku, kteří jsou blízko (mezera do dvou výšek písma)
        let left = hit.left;
        let right = hit.left + hit.width;
        let changed = true;
        while (changed) {
            changed = false;
            for (const word of sameLine) {
                const gap = Math.max(word.left - right, left - (word.left + word.width));
                if (gap > 0 && gap <= hit.height * 2 && plain(word.text).length >= 1) {
                    left = Math.min(left, word.left);
                    right = Math.max(right, word.left + word.width);
                    changed = true;
                }
            }
        }
        const top = Math.min(...sameLine.filter(word => word.left >= left && word.left + word.width <= right).map(word => word.top), hit.top);
        const bottom = Math.max(...sameLine.filter(word => word.left >= left && word.left + word.width <= right).map(word => word.top + word.height), hit.top + hit.height);
        const lineHeight = bottom - top;
        // Protažení: do stran o 0,8 výšky písma, nahoru a dolů o 0,4
        const box = [left - lineHeight * 0.8, top - lineHeight * 0.4, right - left + lineHeight * 1.6, lineHeight * 1.8];
        const clamped = [Math.max(0, box[0]), Math.max(0, box[1])];
        clamped.push(Math.min(size.width, box[0] + box[2]) - clamped[0], Math.min(size.height, box[1] + box[3]) - clamped[1]);
        boxes.push(clamped);
    }
    // Překrývající se obdélníky sloučit
    const merged = [];
    for (const box of boxes) {
        const overlap = merged.find(other => box[0] < other[0] + other[2] && other[0] < box[0] + box[2] && box[1] < other[1] + other[3] && other[1] < box[1] + box[3]);
        if (overlap) {
            const x = Math.min(overlap[0], box[0]);
            const y = Math.min(overlap[1], box[1]);
            overlap[2] = Math.max(overlap[0] + overlap[2], box[0] + box[2]) - x;
            overlap[3] = Math.max(overlap[1] + overlap[3], box[1] + box[3]) - y;
            overlap[0] = x;
            overlap[1] = y;
        } else merged.push([...box]);
    }
    const round = (value) => Math.round(value * 10000) / 10000;
    return merged.map(([x, y, w, h]) => [round(x / size.width), round(y / size.height), round(w / size.width), round(h / size.height)]);
};

// Náhled: rozmazaný a ztmavený obdélník se zaoblením, jak ho vykreslí aplikace
const renderPreview = async (image, masks, size, out) => {
    const args = [image];
    for (const [x, y, w, h] of masks) {
        const px = Math.round(x * size.width);
        const py = Math.round(y * size.height);
        const pw = Math.max(1, Math.round(w * size.width));
        const ph = Math.max(1, Math.round(h * size.height));
        args.push('(', '+clone', '-crop', `${pw}x${ph}+${px}+${py}`, '+repage', '-blur', '0x14', '-fill', '#0f172a', '-colorize', '55%', ')',
            '-geometry', `+${px}+${py}`, '-composite');
    }
    args.push('-quality', '88', out);
    await run('convert', args);
};

const flagged = JSON.parse(fs.readFileSync(FLAGGED, 'utf8'));
const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const topics = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(flagged);
for (const topic of topics) {
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${topic}.json`), 'utf8')).items;
    const byId = new Map(items.map(item => [item.q, item]));
    let masked = 0;
    for (const id of flagged[topic] || []) {
        const item = byId.get(id);
        if (!item || (ONLY.length && !ONLY.includes(item.n))) continue;
        const body = await download(core.commonsPhotoUrl(item.im, item.ih, 500));
        if (!body) { console.log(`${topic}: ${item.n} – nestaženo`); continue; }
        const image = path.join(CACHE, `img-${process.pid}.jpg`);
        fs.writeFileSync(image, body);
        try {
            const size = await imageSize(image);
            const masks = masksFor(await readWords(item, image), nameWords(item), size);
            if (masks.length) {
                result[item.im] = masks;
                masked++;
            }
            const area = masks.reduce((sum, [, , w, h]) => sum + w * h, 0);
            console.log(`${topic}: ${item.n} – ${masks.length} obdélník(y), ${Math.round(area * 100)} % plochy`);
            if (PREVIEW) {
                const safe = item.n.replace(/[^\p{L}\d]+/gu, '-');
                fs.copyFileSync(image, path.join(PREVIEW, `${topic}-${safe}-puvodni.jpg`));
                if (masks.length) await renderPreview(image, masks, size, path.join(PREVIEW, `${topic}-${safe}-zakryto.jpg`));
            }
        } finally {
            fs.rmSync(image, { force: true });
        }
    }
    console.log(`${topic}: zakrytí u ${masked} fotek`);
}
if (!PREVIEW) fs.writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.keys(result).sort().map(key => [key, result[key]])))}\n`);
