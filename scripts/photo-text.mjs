// Fotky, na kterých je napsaná odpověď (jméno na startovním čísle, název na plakátu, ceduli nebo obalu alba).
// Každou fotku položky přečte OCR (tesseract) a když text obsahuje slovo názvu položky, zapíše ji do data/photo-text.json.
// Aplikace takovou fotku jako nápovědu nenabídne. Přečtené texty se ukládají do mezipaměti, takže po přidání tématu
// nebo položek se čtou jen nové fotky.
//
// Spuštění: npm run audit:photo-text [-- téma téma…]   (potřebuje program tesseract: apt-get install tesseract-ocr)
// Proměnné: OCR_CACHE = složka mezipaměti (výchozí .cache/ocr), OCR_PARALLEL = počet souběžných fotek (výchozí 4)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../quiz-core.js');
const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = process.env.OCR_CACHE || path.join(ROOT, '.cache', 'ocr');
const PARALLEL = Number(process.env.OCR_PARALLEL || 4);
const OUT = path.join(ROOT, 'data', 'photo-text.json');
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/mudrlant)';
// Nejdřív témata, kde je text na fotkách nejčastější
const ORDER = ['sport', 'film', 'hudba', 'literatura', 'historie', 'architektura', 'mytologie', 'umeni', 'zemepis', 'fyzika', 'chemie', 'geologie', 'biologie', 'vlajky'];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

fs.mkdirSync(CACHE, { recursive: true });
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const allTopics = [...indexHtml.matchAll(/topics\/([a-z]+)\.js/g)].map(match => match[1]);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : [...ORDER.filter(id => allTopics.includes(id)), ...allTopics.filter(id => !ORDER.includes(id))];

// Slova názvu, podle kterých se odpověď na fotce pozná: aspoň 4 písmena (zkratky jako BTS celé), bez obecných slov
const GENERIC = new Set(['národní', 'park', 'hrad', 'zámek', 'most', 'kostel', 'katedrála', 'chrám', 'palác', 'věž', 'ostrov', 'řeka', 'hora',
    'jezero', 'moře', 'válka', 'bitva', 'socha', 'obraz', 'film', 'album', 'opera', 'symfonie', 'svatý', 'svatého', 'saint', 'the', 'and', 'von', 'van', 'der', 'della']);
const plain = (text) => core.normalizeAnswer(text).replace(/[^a-z0-9]+/g, ' ').trim();
const nameWords = (item) => {
    const names = [item.n, core.displayName(item.t || ''), ...(item.al || [])].filter(Boolean);
    const words = new Set();
    for (const name of names) {
        for (const word of name.split(/[\s,.:;!?()'"–-]+/)) {
            const key = plain(word);
            if (GENERIC.has(word.toLocaleLowerCase('cs')) || GENERIC.has(key)) continue;
            if (key.length >= 4 || (key.length === 3 && /^\p{Lu}{3}$/u.test(word))) words.add(key);
        }
    }
    return [...words];
};
// Shoda s tolerancí jednoho přečteného znaku u delších slov (OCR čte „POWELL“ i jako „poWELL“ nebo „P0WELL“)
const found = (tokens, word) => tokens.some(token => token === word
    || (word.length >= 6 && Math.abs(token.length - word.length) <= 1 && core.levenshtein(token, word) <= 1));

const cacheFile = (file) => path.join(CACHE, `${file.replace(/[^\w.-]+/g, '_').slice(0, 180)}.txt`);
const readText = async (item) => {
    const cached = cacheFile(item.im);
    if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
    const url = core.commonsPhotoUrl(item.im, item.ih, 500);
    let body = null;
    for (let attempt = 0; attempt < 6 && !body; attempt++) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
            if (response.status === 429 || response.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
            if (!response.ok) break;
            body = Buffer.from(await response.arrayBuffer());
        } catch {
            await sleep(2000);
        }
    }
    if (!body) return null;
    const image = path.join(CACHE, `img-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`);
    fs.writeFileSync(image, body);
    let text = '';
    try {
        // Řídký text (psm 11) najde i nápisy rozházené po fotce – startovní čísla, cedule, plakáty
        // Jedno vlákno na fotku (souběžně jich běží víc) a nejvýš 15 s – rušná fotka by jinak četla i minuty
        const { stdout } = await run('tesseract', [image, '-', '--psm', '11'], { timeout: 15000, maxBuffer: 1 << 20, env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
        text = stdout;
    } catch {
        text = '';
    } finally {
        fs.rmSync(image, { force: true });
    }
    fs.writeFileSync(cached, text);
    return text;
};

const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => {
    const sorted = Object.fromEntries(Object.keys(result).sort().map(key => [key, [...new Set(result[key])].sort()]));
    fs.writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
};

for (const topic of wanted) {
    const file = path.join(ROOT, 'data', `${topic}.json`);
    if (!fs.existsSync(file)) continue;
    // OCR_SKIP=starý-soubor.json: položky, které v něm už byly (a jsou přečtené), se nečtou znovu a jejich dosavadní výsledek zůstane
    const skip = process.env.OCR_SKIP ? new Set((JSON.parse(fs.readFileSync(process.env.OCR_SKIP, 'utf8')).items || []).map(item => item.q)) : new Set();
    const items = (JSON.parse(fs.readFileSync(file, 'utf8')).items || []).filter(item => item.im && item.ih && core.isRealPhoto(item.im) && !skip.has(item.q));
    const flagged = new Set((result[topic] || []).filter(qid => skip.has(qid)));
    let done = 0;
    let missing = 0;
    const queue = [...items];
    const worker = async () => {
        while (queue.length) {
            const item = queue.shift();
            const text = await readText(item);
            if (text === null) missing++;
            const tokens = plain(text || '').split(' ').filter(Boolean);
            const words = nameWords(item);
            if (words.length && words.some(word => found(tokens, word))) flagged.add(item.q);
            if (++done % 100 === 0) console.log(`${topic}: ${done}/${items.length}, s textem odpovědi ${flagged.size}`);
        }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    result[topic] = [...flagged];
    save();
    console.log(`${topic}: hotovo – ${items.length} fotek, s textem odpovědi ${flagged.size}${missing ? `, nestaženo ${missing}` : ''}`);
}
