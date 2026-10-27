// Téma Vlajky a znaky: data/vlajky.json z Wikidat – vlajky a státní znaky dnešních států, znaky českých krajů,
// měst a historických zemí, vlajky území a mezinárodních organizací.
// Podobnost vlajek (Čad × Rumunsko, Irsko × Pobřeží slonoviny) se počítá z barev původních obrázků z Commons:
// každý obrázek dostane „podpis“ – mřížku 12 × 6 políček, v každém převládající barva (W bílá, R červená…).
// Spuštění: npm run build:vlajky (potřebuje data/countries.json; s BUILD_CACHE=složka bez opakovaného stahování)
import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { qlever, sparql, id, values, parsePoint, fileName, thumbHash, compact, cached, inBatches, readCountries, writeTopic, sleep, CZECHIA } from './lib/wikidata.mjs';

// QLever, a když je přetížený, query.wikidata.org (dotazy jsou malé, zvládne je i ten)
const run = (query) => qlever(query).catch(() => sparql(query));

const countries = readCountries();
const STATE_IDS = Object.keys(countries);
const USER_AGENT = 'MudrlantBuild/1.0 (https://github.com/taronwho/geografie-kviz)';

// Kolik nejznámějších vlajek a znaků (podle počtu jazykových verzí článku o státu) patří mezi známé
const KNOWN_FLAGS = 90;
// Státní znaky zná běžný člověk jen u pár států (sousedé, velmoci, výrazné znaky) – podle počtu článků by mezi
// známými byly i znaky Ázerbájdžánu či Thajska
const KNOWN_ARMS = ['Q213', 'Q214', 'Q183', 'Q40', 'Q36', 'Q28', 'Q39', 'Q30', 'Q16', 'Q96', 'Q159', 'Q212', 'Q145', 'Q142', 'Q29', 'Q222', 'Q17', 'Q668', 'Q79'];
// Známá území a organizace (ostatní mezi méně známými)
const KNOWN_OTHERS = ['Q458', 'Q1065', 'Q7184', 'Q21', 'Q22', 'Q980', 'Q223', 'Q1183', 'Q8646', 'Q1439', 'Q99', 'Q782', 'Q1410', 'Q4628', 'Q797'];
// Sousedé Česka (okruh Česko a sousedé)
const NEIGHBOURS = ['Q213', 'Q214', 'Q36', 'Q183', 'Q40'];

// Skandinávský kříž a britská vlajka v rohu se z barev poznat nedají – podle seznamu (státy i území)
const NORDIC_CROSS = ['Q35', 'Q20', 'Q34', 'Q33', 'Q189', 'Q4628', 'Q5689'];
const UNION_JACK = ['Q145', 'Q408', 'Q664', 'Q672', 'Q712', 'Q23635', 'Q782', 'Q5785', 'Q25228', 'Q46197', 'Q3359409'];

// Území a mezinárodní organizace s vlastní vlajkou (jen ty s článkem o vlajce na české Wikipedii) a další přijímané názvy;
// Nová Kaledonie má dvě úřední vlajky a Rada Evropy stejnou vlajku jako EU – otázka by neměla jednu odpověď
const ORGANIZATIONS = {
    Q458: ['EU'], Q1065: ['OSN', 'Spojené národy'], Q7184: ['NATO', 'Severoatlantická aliance'], Q7159: ['AU'], Q7785: ['Commonwealth', 'Společenství národů']
};
// Sídlo organizací, u nichž Wikidata uvádějí víc měst (Evropská unie i Štrasburk a Lucemburk), a Commonwealthu (chybí)
const ORGANIZATION_SEATS = { Q458: 'Brusel', Q7159: 'Addis Abeba', Q7785: 'Londýn' };
const TERRITORIES = {
    Q21: [], Q25228: [], Q25263: [], Q3995: ['Baskicko'], Q980: [], Q23635: [], Q12130: [], Q4628: ['Faerské ostrovy', 'Faery'], Q1410: [],
    Q223: [], Q8646: [], Q1183: [], Q22: [], Q5689: ['Ålandy', 'Åland'], Q797: [], Q816: [], Q26988: [], Q30971: [], Q25230: [], Q782: ['Havajské ostrovy'],
    Q5785: ['Kajmany'], Q99: [], Q5813: [], Q14773: ['Macau'], Q26253: [], Q31057: [], Q9676: ['Ostrov Man'], Q35672: [], Q1439: [], Q36823: []
};
// Státy, které Wikidata u území uvádějí jako celé království (Grónsko → Dánské království)
const STATE_ALIASES = { Q756617: 'Q35', Q29999: 'Q55' };

// Česko: kraje, města (krajská, statutární a nad 20 000 obyvatel) a historické země
const CZ_REGION = 'Q38911';
const CZ_TOWN = 'Q15978299';
const CZ_STATUTORY = 'Q257978';
const CZ_REGIONAL_CAPITAL = 'Q12031379';
const PRAGUE = 'Q1085';
const CZ_TOWN_MIN_POPULATION = 20000;
// Malý znak Česka je zároveň znakem Čech – psaná odpověď „Česko“ u Čech proto platí taky
const CZ_LANDS = { Q39193: ['Čechy', ['Česko', 'Česká republika']], Q43266: ['Morava', []], Q45551: ['Slezsko', ['České Slezsko']] };

// --- Barevný podpis obrázku ---

// Pojmenované barvy vlajek a znaků (nejbližší podle vnímané barvy v prostoru Lab)
const PALETTE = {
    W: [255, 255, 255], S: [170, 170, 170], K: [20, 20, 20], R: [210, 16, 52], M: [125, 25, 50], O: [245, 130, 30],
    Y: [252, 209, 22], G: [0, 140, 70], B: [0, 40, 130], L: [80, 160, 220], N: [140, 90, 50]
};
const toLab = ([r, g, b]) => {
    const linear = (c) => { const v = c / 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
    const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
    const xyz = [(lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047, lr * 0.2126 + lg * 0.7152 + lb * 0.0722, (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883];
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const [fx, fy, fz] = xyz.map(f);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const PALETTE_LAB = Object.entries(PALETTE).map(([letter, rgb]) => [letter, toLab(rgb)]);
const classCache = new Map();
const colorClass = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    if (!classCache.has(key)) {
        const lab = toLab([r, g, b]);
        let best = null;
        let bestDistance = Infinity;
        for (const [letter, target] of PALETTE_LAB) {
            const distance = (lab[0] - target[0]) ** 2 + (lab[1] - target[1]) ** 2 + (lab[2] - target[2]) ** 2;
            if (distance < bestDistance) [best, bestDistance] = [letter, distance];
        }
        classCache.set(key, best);
    }
    return classCache.get(key);
};

// Dekodér PNG (náhledy z Commons): barevné typy 0, 2, 3, 4, 6 v hloubce do 8 bitů, bez prokládání
const decodePng = (buffer) => {
    if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
    let width, height, depth, colorType, interlace, palette = null, transparency = null;
    const chunks = [];
    for (let offset = 8; offset + 8 <= buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') [width, height, depth, colorType, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
        else if (type === 'PLTE') palette = data;
        else if (type === 'tRNS') transparency = data;
        else if (type === 'IDAT') chunks.push(data);
        else if (type === 'IEND') break;
        offset += 12 + length;
    }
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (!channels || interlace || depth > 8) return null;
    const bitsPerPixel = channels * depth;
    const step = Math.max(1, bitsPerPixel >> 3);
    const stride = Math.ceil(width * bitsPerPixel / 8);
    const raw = inflateSync(Buffer.concat(chunks));
    const rows = [];
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = Buffer.alloc(stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= step ? out[x - step] : 0;
            const b = previous[x];
            const c = x >= step ? previous[x - step] : 0;
            let predictor = 0;
            if (filter === 1) predictor = a;
            else if (filter === 2) predictor = b;
            else if (filter === 3) predictor = (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
                predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            out[x] = (line[x] + predictor) & 255;
        }
        rows.push(out);
        previous = out;
    }
    // Vzorek o hloubce pod 8 bitů (paleta 1, 2, 4 bity na pixel)
    const sample = (row, index) => {
        if (depth === 8) return row[index];
        const bit = index * depth;
        return (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    };
    const scale = (value) => depth === 8 ? value : Math.round(value * 255 / ((1 << depth) - 1));
    const pixel = (x, y) => {
        const row = rows[y];
        if (colorType === 3) {
            const index = sample(row, x);
            const alpha = transparency && index < transparency.length ? transparency[index] : 255;
            return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], alpha];
        }
        if (colorType === 0) { const v = scale(sample(row, x)); return [v, v, v, 255]; }
        if (colorType === 4) return [row[x * 2], row[x * 2], row[x * 2], row[x * 2 + 1]];
        if (colorType === 2) return [row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255];
        return [row[x * 4], row[x * 4 + 1], row[x * 4 + 2], row[x * 4 + 3]];
    };
    return { width, height, pixel };
};

// Podpis: 12 sloupců × 6 řádků (dělitelné 2 i 3 – dvojbarevné i trojbarevné pruhy padnou na hranice políček),
// v každém políčku převládající barva, „.“ = průhledné pozadí znaku
const COLS = 12;
const ROWS = 6;
const signatureOf = (image) => {
    const counts = Array.from({ length: COLS * ROWS }, () => new Map());
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            const [r, g, b, a] = image.pixel(x, y);
            const letter = a < 128 ? '.' : colorClass(r, g, b);
            const cell = counts[Math.floor(y * ROWS / image.height) * COLS + Math.floor(x * COLS / image.width)];
            cell.set(letter, (cell.get(letter) || 0) + 1);
        }
    }
    return counts.map(cell => [...cell].sort((a, b) => b[1] - a[1])[0]?.[0] || '.').join('');
};

// Jednoduchý rasterizér SVG (náhledy z Commons server při hromadném stahování odmítá – 429 – a původní SVG je malé):
// vyplněné tvary (rect, circle, ellipse, polygon, path, use) s transformacemi, třídami ze <style> a přechody (bere se
// prostřední barva); obrys, text, ořez a masky se ignorují – pro mřížku 12 × 6 políček to stačí
const NAMED_COLORS = {
    white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
    navy: [0, 0, 128], gold: [255, 215, 0], orange: [255, 165, 0], maroon: [128, 0, 0], purple: [128, 0, 128], silver: [192, 192, 192],
    gray: [128, 128, 128], grey: [128, 128, 128], lime: [0, 255, 0], aqua: [0, 255, 255], cyan: [0, 255, 255], teal: [0, 128, 128],
    olive: [128, 128, 0], fuchsia: [255, 0, 255], magenta: [255, 0, 255], brown: [165, 42, 42], crimson: [220, 20, 60],
    darkred: [139, 0, 0], darkblue: [0, 0, 139], darkgreen: [0, 100, 0], skyblue: [135, 206, 235], lightblue: [173, 216, 230],
    royalblue: [65, 105, 225], forestgreen: [34, 139, 34], goldenrod: [218, 165, 32], darkgoldenrod: [184, 134, 11],
    saddlebrown: [139, 69, 19], sienna: [160, 82, 45], tan: [210, 180, 140], beige: [245, 245, 220], ivory: [255, 255, 240],
    whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
    darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105], dimgrey: [105, 105, 105], orangered: [255, 69, 0],
    firebrick: [178, 34, 34], steelblue: [70, 130, 180], dodgerblue: [30, 144, 255], deepskyblue: [0, 191, 255], khaki: [240, 230, 140],
    chocolate: [210, 105, 30], peru: [205, 133, 63], wheat: [245, 222, 179], pink: [255, 192, 203], violet: [238, 130, 238],
    indigo: [75, 0, 130], seagreen: [46, 139, 87], limegreen: [50, 205, 50], darkorange: [255, 140, 0], midnightblue: [25, 25, 112]
};
const parseColor = (value) => {
    if (!value) return undefined;
    const text = value.trim().toLowerCase();
    if (text === 'none' || text === 'transparent') return null;
    let match = /^#([0-9a-f]{3,8})$/.exec(text);
    if (match) {
        const hex = match[1].length <= 4 ? match[1].split('').map(c => c + c).join('') : match[1];
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    match = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/.exec(text);
    if (match) return [1, 3, 5].map(i => Math.round(Number(match[i]) * (match[i + 1] ? 2.55 : 1)));
    return NAMED_COLORS[text];
};

// --- XML ---
const decodeEntities = (text) => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const parseXml = (text) => {
    const root = { name: '#root', attrs: {}, children: [], text: '' };
    const stack = [root];
    const source = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\]\s*)?>/i, '').replace(/<\?[\s\S]*?\?>/g, '');
    const tag = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
    let match;
    while ((match = tag.exec(source))) {
        const top = stack[stack.length - 1];
        if (match[1] !== undefined || match[6] !== undefined) { top.text += match[1] !== undefined ? match[1] : decodeEntities(match[6]); continue; }
        const name = match[3].replace(/^svg:/, '');
        if (match[2]) {
            const index = stack.map(node => node.name).lastIndexOf(name);
            if (index > 0) stack.length = index;
            continue;
        }
        const attrs = {};
        const attr = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let a;
        while ((a = attr.exec(match[4]))) attrs[a[1]] = decodeEntities(a[2] !== undefined ? a[2] : a[3]);
        const node = { name, attrs, children: [], text: '' };
        top.children.push(node);
        if (!match[5]) stack.push(node);
    }
    return root;
};

// --- Transformace (matice a b c d e f) ---
const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const IDENTITY = [1, 0, 0, 1, 0, 0];
const parseTransform = (text) => {
    let m = IDENTITY;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let match;
    while ((match = re.exec(text || ''))) {
        const v = (match[2].match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);
        let t = IDENTITY;
        if (match[1] === 'matrix' && v.length === 6) t = v;
        else if (match[1] === 'translate') t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
        else if (match[1] === 'scale') t = [v[0], 0, 0, v[1] === undefined ? v[0] : v[1], 0, 0];
        else if (match[1] === 'rotate') {
            const r = (v[0] || 0) * Math.PI / 180;
            const [cx, cy] = [v[1] || 0, v[2] || 0];
            t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        } else if (match[1] === 'skewX') t = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0];
        else if (match[1] === 'skewY') t = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
        m = multiply(m, t);
    }
    return m;
};
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// --- Cesty: podcesty jako seznamy bodů (křivky rozdělené na úsečky) ---
const CURVE_STEPS = 8;
const arcPoints = (x1, y1, rx, ry, angle, large, sweep, x2, y2) => {
    if (!rx || !ry) return [[x2, y2]];
    const phi = angle * Math.PI / 180;
    const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = cos * dx + sin * dy;
    const y1p = -sin * dx + cos * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lambda = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2;
    if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
    const num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2;
    const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2)));
    const cxp = coef * rx * y1p / ry;
    const cyp = -coef * ry * x1p / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const angleOf = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const start = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    if (sweep && delta < 0) delta += 2 * Math.PI;
    const steps = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 8)));
    return Array.from({ length: steps }, (_, i) => {
        const t = start + delta * (i + 1) / steps;
        return [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
    });
};
const parsePath = (d) => {
    const tokens = (d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    const subpaths = [];
    let current = null;
    let [x, y, sx, sy] = [0, 0, 0, 0];
    let [lastControlX, lastControlY, lastCommand] = [0, 0, ''];
    let i = 0;
    let command = '';
    const number = () => Number(tokens[i++]);
    // A: příznaky large-arc a sweep bývají slepené („a1 1 0 011 1“)
    const flag = () => {
        const token = tokens[i];
        if (token.length > 1 && /^[01]/.test(token)) { tokens[i] = token.slice(1); return Number(token[0]); }
        i++;
        return Number(token);
    };
    const lineTo = (nx, ny) => { if (!current) { current = [[x, y]]; subpaths.push(current); } current.push([nx, ny]); x = nx; y = ny; };
    const cubic = (x1, y1, x2, y2, ex, ey) => {
        const [x0, y0] = [x, y];
        for (let s = 1; s <= CURVE_STEPS; s++) {
            const t = s / CURVE_STEPS;
            const u = 1 - t;
            lineTo(u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * ex, u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * ey);
        }
        [lastControlX, lastControlY] = [x2, y2];
    };
    const quad = (x1, y1, ex, ey) => {
        const [x0, y0] = [x, y];
        for (let s = 1; s <= CURVE_STEPS; s++) {
            const t = s / CURVE_STEPS;
            const u = 1 - t;
            lineTo(u * u * x0 + 2 * u * t * x1 + t * t * ex, u * u * y0 + 2 * u * t * y1 + t * t * ey);
        }
        [lastControlX, lastControlY] = [x1, y1];
    };
    while (i < tokens.length) {
        if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
        else if (!command) { i++; continue; }
        const rel = command === command.toLowerCase();
        const [ox, oy] = rel ? [x, y] : [0, 0];
        switch (command.toUpperCase()) {
            case 'M': {
                const [nx, ny] = [number() + ox, number() + oy];
                current = [[nx, ny]];
                subpaths.push(current);
                [x, y, sx, sy] = [nx, ny, nx, ny];
                command = rel ? 'l' : 'L';
                break;
            }
            case 'L': lineTo(number() + ox, number() + oy); break;
            case 'H': lineTo(number() + (rel ? x : 0), y); break;
            case 'V': lineTo(x, number() + (rel ? y : 0)); break;
            case 'C': { const v = [number() + ox, number() + oy, number() + ox, number() + oy, number() + ox, number() + oy]; cubic(...v); break; }
            case 'S': {
                const [cx, cy] = /[CS]/i.test(lastCommand) ? [2 * x - lastControlX, 2 * y - lastControlY] : [x, y];
                const v = [number() + ox, number() + oy, number() + ox, number() + oy];
                cubic(cx, cy, ...v);
                break;
            }
            case 'Q': { const v = [number() + ox, number() + oy, number() + ox, number() + oy]; quad(...v); break; }
            case 'T': {
                const [cx, cy] = /[QT]/i.test(lastCommand) ? [2 * x - lastControlX, 2 * y - lastControlY] : [x, y];
                quad(cx, cy, number() + ox, number() + oy);
                break;
            }
            case 'A': {
                const [rx, ry, angle] = [number(), number(), number()];
                const [large, sweep] = [flag(), flag()];
                const [ex, ey] = [number() + ox, number() + oy];
                for (const point of arcPoints(x, y, rx, ry, angle, large, sweep, ex, ey)) lineTo(...point);
                [x, y] = [ex, ey];
                break;
            }
            case 'Z':
                [x, y] = [sx, sy];
                current = null;
                // Čísla po Z jsou chyba zápisu – přeskočí se
                command = '';
                break;
            default: i++;
        }
        lastCommand = command;
        if (Number.isNaN(x) || Number.isNaN(y)) return subpaths.filter(path => path.every(([px, py]) => !Number.isNaN(px) && !Number.isNaN(py)));
    }
    return subpaths;
};
const ellipsePoints = (cx, cy, rx, ry) => Array.from({ length: 32 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 16), cy + ry * Math.sin(i * Math.PI / 16)]);
const num = (value, fallback = 0) => { const n = parseFloat(value); return Number.isFinite(n) ? n : fallback; };
const shapeOf = (node) => {
    const a = node.attrs;
    switch (node.name) {
        case 'rect': {
            const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
            return w > 0 && h > 0 ? [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]] : [];
        }
        case 'circle': return [ellipsePoints(num(a.cx), num(a.cy), num(a.r), num(a.r))];
        case 'ellipse': return [ellipsePoints(num(a.cx), num(a.cy), num(a.rx), num(a.ry))];
        case 'polygon': case 'polyline': {
            const v = (a.points || '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
            const points = [];
            for (let i = 0; i + 1 < v.length; i += 2) points.push([Number(v[i]), Number(v[i + 1])]);
            return [points];
        }
        case 'path': return parsePath(a.d);
        default: return [];
    }
};

// --- Kreslení: vzorkovací mřížka, tvary v pořadí dokumentu (pozdější překryje dřívější) ---
const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'linearGradient', 'radialGradient', 'title', 'desc', 'metadata', 'style', 'text', 'filter', 'marker', 'font', 'image', 'foreignObject']);
const INHERITED = ['fill', 'fill-opacity', 'fill-rule', 'display', 'visibility'];
const styleRules = (root) => {
    const rules = new Map();
    const visit = (node) => {
        if (node.name === 'style') {
            const re = /([^{}]+)\{([^}]*)\}/g;
            let match;
            while ((match = re.exec(node.text))) {
                const props = declarations(match[2]);
                for (const selector of match[1].split(',')) {
                    const cls = /^\s*(?:\w+)?\.([\w-]+)\s*$/.exec(selector);
                    if (cls) rules.set(cls[1], { ...rules.get(cls[1]), ...props });
                }
            }
        }
        node.children.forEach(visit);
    };
    visit(root);
    return rules;
};
const declarations = (text) => Object.fromEntries((text || '').split(';').map(part => part.split(':')).filter(part => part.length >= 2)
    .map(([key, ...rest]) => [key.trim(), rest.join(':').trim().replace(/\s*!important$/, '')]));

const rasterizeSvg = (text, width, height) => {
    const root = parseXml(text);
    const svg = (function find(node) { return node.name === 'svg' ? node : node.children.map(find).find(Boolean); })(root);
    if (!svg) return null;
    const ids = new Map();
    (function index(node) { if (node.attrs.id) ids.set(node.attrs.id, node); node.children.forEach(index); })(svg);
    const classes = styleRules(svg);
    const viewBox = (svg.attrs.viewBox || '').split(/[\s,]+/).map(Number);
    const [vx, vy, vw, vh] = viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0 ? viewBox : [0, 0, num(svg.attrs.width, 0), num(svg.attrs.height, 0)];
    if (!(vw > 0 && vh > 0)) return null;
    // Obraz se roztáhne na celou mřížku (jako náhled rozdělený na políčka)
    const base = [width / vw, 0, 0, height / vh, -vx * width / vw, -vy * height / vh];
    const pixels = new Array(width * height).fill(null);

    const gradientColor = (id, depth = 0) => {
        const node = ids.get(id);
        if (!node || depth > 5) return undefined;
        const stops = node.children.filter(child => child.name === 'stop');
        if (!stops.length) {
            const href = node.attrs['xlink:href'] || node.attrs.href;
            return href ? gradientColor(href.slice(1), depth + 1) : undefined;
        }
        const stop = stops[Math.floor((stops.length - 1) / 2)];
        return parseColor(stop.attrs['stop-color'] || declarations(stop.attrs.style)['stop-color'] || 'black');
    };
    const resolveFill = (value) => {
        if (value === undefined) return [0, 0, 0];
        const ref = /url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(value);
        if (ref) return gradientColor(ref[1]) || null;
        if (value === 'currentColor') return [0, 0, 0];
        const color = parseColor(value);
        return color === undefined ? null : color;
    };
    const fill = (subpaths, matrix, color, evenOdd) => {
        const edges = [];
        for (const path of subpaths) {
            const points = path.map(point => apply(matrix, point));
            for (let i = 0; i < points.length; i++) {
                const [p, q] = [points[i], points[(i + 1) % points.length]];
                if (p[1] !== q[1]) edges.push(p[1] < q[1] ? [p[0], p[1], q[0], q[1], 1] : [q[0], q[1], p[0], p[1], -1]);
            }
        }
        if (!edges.length) return;
        const minY = Math.max(0, Math.floor(Math.min(...edges.map(e => e[1]))));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(...edges.map(e => e[3]))));
        for (let row = minY; row <= maxY; row++) {
            const y = row + 0.5;
            const crossings = [];
            for (const [x1, y1, x2, y2, dir] of edges) {
                if (y < y1 || y >= y2) continue;
                crossings.push([x1 + (y - y1) * (x2 - x1) / (y2 - y1), dir]);
            }
            crossings.sort((a, b) => a[0] - b[0]);
            let winding = 0;
            for (let k = 0; k < crossings.length - 1; k++) {
                winding += evenOdd ? 1 : crossings[k][1];
                const inside = evenOdd ? winding % 2 === 1 : winding !== 0;
                if (!inside) continue;
                const from = Math.max(0, Math.ceil(crossings[k][0] - 0.5));
                const to = Math.min(width - 1, Math.floor(crossings[k + 1][0] - 0.5));
                for (let col = from; col <= to; col++) pixels[row * width + col] = color;
            }
        }
    };
    const render = (node, matrix, inherited, depth = 0) => {
        if (depth > 30 || SKIP.has(node.name)) return;
        const style = { ...inherited };
        for (const key of INHERITED) if (node.attrs[key] !== undefined) style[key] = node.attrs[key];
        for (const cls of (node.attrs.class || '').split(/\s+/)) Object.assign(style, Object.fromEntries(INHERITED.map(key => [key, (classes.get(cls) || {})[key]]).filter(([, v]) => v !== undefined)));
        const inline = declarations(node.attrs.style);
        for (const key of INHERITED) if (inline[key] !== undefined) style[key] = inline[key];
        const opacity = num(inline.opacity !== undefined ? inline.opacity : node.attrs.opacity, 1);
        if (style.display === 'none' || style.visibility === 'hidden' || opacity < 0.3) return;
        let m = multiply(matrix, parseTransform(node.attrs.transform));
        if (node.name === 'use') {
            const target = ids.get((node.attrs['xlink:href'] || node.attrs.href || '').slice(1));
            if (!target) return;
            m = multiply(m, [1, 0, 0, 1, num(node.attrs.x), num(node.attrs.y)]);
            if (target.name === 'symbol') target.children.forEach(child => render(child, m, style, depth + 1));
            else render({ ...target, name: target.name === 'svg' ? 'g' : target.name }, m, style, depth + 1);
            return;
        }
        // switch: první větev bez rozšíření (Illustrator do první dává vlastní data)
        if (node.name === 'switch') {
            const branch = node.children.find(child => child.name !== 'foreignObject' && !child.attrs.requiredExtensions);
            if (branch) render(branch, m, style, depth + 1);
            return;
        }
        if (node.name === 'g' || node.name === 'svg' || node.name === 'a') {
            if (node !== svg && node.name === 'svg') m = multiply(m, [1, 0, 0, 1, num(node.attrs.x), num(node.attrs.y)]);
            node.children.forEach(child => render(child, m, style, depth + 1));
            return;
        }
        const color = resolveFill(style.fill);
        if (!color || num(style['fill-opacity'], 1) < 0.3) return;
        const subpaths = shapeOf(node).filter(path => path.length >= 3);
        if (subpaths.length) fill(subpaths, m, color, style['fill-rule'] === 'evenodd');
    };
    render(svg, base, {});
    return { width, height, pixel: (x, y) => { const c = pixels[y * width + x]; return c ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0]; } };
};

const commonsOriginal = (file) => {
    const hash = thumbHash(file);
    return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash}/${encodeURIComponent(file.replace(/ /g, '_'))}`;
};
// Stažení s ohledem na přetížení: při 429 počká, kolik server řekne (Retry-After)
const download = async (url) => {
    for (let attempt = 1; attempt <= 5; attempt++) {
        let wait = 10;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
            if (response.ok) return Buffer.from(await response.arrayBuffer());
            console.warn(`  HTTP ${response.status} ${url}`);
            if (response.status !== 429 && response.status < 500) return null;
            wait = Number(response.headers.get('retry-after')) || wait;
        } catch (error) {
            console.warn(`  ${error.message}`);
        }
        await sleep(1000 * wait * attempt);
    }
    return undefined;
};
// Podpis souboru z Commons z původního souboru: SVG vlastním rasterizérem, PNG dekodérem; JPEG a GIF podpis nemají (null).
// undefined = soubor se nepodařilo stáhnout (příští běh to zkusí znovu)
const imageSignature = async (file) => {
    if (!/\.(svg|png)$/i.test(file)) return null;
    const buffer = await download(commonsOriginal(file));
    if (!buffer) return buffer;
    try {
        const image = /\.svg$/i.test(file) ? rasterizeSvg(buffer.toString('utf8'), COLS * 8, ROWS * 8) : decodePng(buffer);
        return image ? signatureOf(image) : null;
    } catch (error) {
        console.warn(`  ${file}: ${error.message}`);
        return null;
    }
};

// --- 1. krok: státy – vlajka, znak, hlavní město, poloha ---
const stateRows = await cached('vlajky-states', async () => {
    const result = [];
    await inBatches(STATE_IDS, 40, (qids) => `
SELECT ?item ?p ?v ?rank ?end WHERE {
  VALUES ?item { ${values(qids)} }
  { ?item p:P41 ?s . ?s ps:P41 ?v ; wikibase:rank ?rank . OPTIONAL { ?s pq:P582 ?end } BIND("flagImg" AS ?p) }
  UNION { ?item p:P94 ?s . ?s ps:P94 ?v ; wikibase:rank ?rank . OPTIONAL { ?s pq:P582 ?end } BIND("armsImg" AS ?p) }
  UNION { ?item wdt:P163 ?v BIND("flag" AS ?p) }
  UNION { ?item wdt:P237 ?v BIND("arms" AS ?p) }
  UNION { ?item wdt:P36 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("cap" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P2046 ?v BIND("area" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
}`, (row) => result.push(simplify(row)), run);
    return result;
});

function simplify(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value.value.startsWith('http://www.wikidata.org/entity/') ? id(value.value) : value.value]));
}
// QLever píše souřadnice jako „POINT(…)“, parsePoint čeká „Point(…)“
const pointOf = (wkt) => parsePoint((wkt || '').replace(/^POINT\(/, 'Point('));
// Platný obrázek: tvrzení bez data konce a ne zastaralé; přednost má preferované, pak běžný název souboru
// (bez letopočtů, bez obchodní, válečné či rubové varianty)
const VARIANT_FILE = /\(\d{4}[–-]\d{4}\)|civil|war |ensign|reverse|pantone|digital|state flag|bandera de|variant|restyle|\(state\)|grey|royal|great|greater|middle|lesser|military|merchant|imperial|standard/i;
const currentImage = (statements) => {
    // Soubor s uzavřeným obdobím v názvu („Emblem of Laos (1991-2025)“) je starý, i když mu Wikidata konec neuvádějí
    const valid = statements.filter(s => !s.end && !/Deprecated/.test(s.rank) && !/\(\d{4}[–-]\d{4}\)/.test(s.file));
    const ranked = [...valid].sort((a, b) => (/Preferred/.test(b.rank) - /Preferred/.test(a.rank)) || (VARIANT_FILE.test(a.file) - VARIANT_FILE.test(b.file)));
    return ranked[0] ? ranked[0].file : null;
};

const states = new Map(STATE_IDS.map(q => [q, { flagImgs: [], armsImgs: [], cap: [] }]));
for (const row of stateRows) {
    const state = states.get(row.item);
    if (!state || row.v === undefined) continue;
    if (row.p === 'flagImg' || row.p === 'armsImg') state[`${row.p}s`].push({ file: fileName(row.v), rank: row.rank, end: row.end });
    else if (row.p === 'cap') { if (!state.cap.includes(row.v)) state.cap.push(row.v); }
    else state[row.p] = row.v;
}

// --- 2. krok: položky vlajek a znaků (článek na české Wikipedii, popis, co zobrazují, známost) ---
const symbolIds = [...states.values()].flatMap(state => [state.flag, state.arms]).filter(q => /^Q\d+$/.test(q || ''));

// --- 3. krok: Česko – kraje, města a historické země ---
const czechRows = await cached('vlajky-czech', async () => {
    const rows = await run(`
SELECT ?item ?type ?t ?label ?pop ?img ?coord ?kraj ?sl ?area WHERE {
  VALUES ?type { wd:${CZ_REGION} wd:${CZ_TOWN} }
  ?item wdt:P17 wd:${CZECHIA} ; wdt:P31 ?type ; wdt:P94 ?img ; wikibase:sitelinks ?sl .
  ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t .
  ?item rdfs:label ?label FILTER(LANG(?label) = "cs")
  OPTIONAL { ?item wdt:P1082 ?pop }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P2046 ?area }
  OPTIONAL { ?item wdt:P131+ ?kraj . ?kraj wdt:P31 wd:${CZ_REGION} }
}`);
    const extra = await run(`
SELECT ?item ?type WHERE { VALUES ?type { wd:${CZ_STATUTORY} wd:${CZ_REGIONAL_CAPITAL} } ?item wdt:P31 ?type ; wdt:P17 wd:${CZECHIA} }`);
    const lands = await run(`
SELECT ?item ?t ?label ?img ?coord ?sl WHERE {
  VALUES ?item { ${values(Object.keys(CZ_LANDS))} }
  ?item wdt:P94 ?img ; wikibase:sitelinks ?sl .
  ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t .
  ?item rdfs:label ?label FILTER(LANG(?label) = "cs")
  OPTIONAL { ?item wdt:P625 ?coord }
}`);
    return { rows: rows.map(simplify), extra: extra.map(simplify), lands: lands.map(simplify) };
});

// --- 4. krok: území a organizace ---
const otherIds = [...Object.keys(ORGANIZATIONS), ...Object.keys(TERRITORIES)];
const otherRows = await cached('vlajky-other', async () => {
    const result = [];
    await inBatches(otherIds, 40, (qids) => `
SELECT ?item ?p ?v ?rank ?end WHERE {
  VALUES ?item { ${values(qids)} }
  { ?item p:P41 ?s . ?s ps:P41 ?v ; wikibase:rank ?rank . OPTIONAL { ?s pq:P582 ?end } BIND("flagImg" AS ?p) }
  UNION { ?item wdt:P163 ?v BIND("flag" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item wdt:P625 ?v BIND("coord" AS ?p) }
  UNION { ?item wdt:P17 ?v BIND("co" AS ?p) }
  UNION { ?item wdt:P30 ?v BIND("cont" AS ?p) }
  UNION { ?item wdt:P159 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("hq" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("year" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
}`, (row) => result.push(simplify(row)), run);
    return result;
});
const others = new Map(otherIds.map(q => [q, { flagImgs: [], co: [], cont: [], flags: [] }]));
for (const row of otherRows) {
    const other = others.get(row.item);
    if (!other || row.v === undefined) continue;
    if (row.p === 'flagImg') other.flagImgs.push({ file: fileName(row.v), rank: row.rank, end: row.end });
    else if (row.p === 'co' || row.p === 'cont') { const v = STATE_ALIASES[row.v] || row.v; if (!other[row.p].includes(v)) other[row.p].push(v); }
    else if (row.p === 'flag') { if (!other.flags.includes(row.v)) other.flags.push(row.v); }
    else if (!(row.p in other)) other[row.p] = row.v;
}
// Vlajka území, ne státu, k němuž patří (u zámořských území Wikidata uvádějí i vlajku Francie)
const stateFlags = new Set([...states.values()].map(state => state.flag));
for (const other of others.values()) {
    other.flag = other.flags.find(q => !stateFlags.has(q));
    if (other.flag) symbolIds.push(other.flag);
}

// Podrobnosti položek vlajek a znaků: článek, popis, jazykové verze, co zobrazují (hvězda, půlměsíc, slunce)
const symbolRows = await cached('vlajky-symbols', async () => {
    const result = [];
    await inBatches([...new Set(symbolIds)], 60, (qids) => `
SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P571 ?v BIND("year" AS ?p) }
  UNION { ?item wdt:P180 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("shows" AS ?p) }
}`, (row) => result.push(simplify(row)), run);
    return result;
});
const symbols = new Map();
for (const row of symbolRows) {
    const symbol = symbols.get(row.item) || { shows: [] };
    if (row.p === 'shows') symbol.shows.push(row.v);
    else if (!(row.p in symbol)) symbol[row.p] = row.v;
    symbols.set(row.item, symbol);
}

// --- 5. krok: položky ---
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const yearOfDate = (value) => { const match = /^(-?\d+)-/.exec(value || ''); return match ? Number(match[1]) : undefined; };
// Slova, která v popisu prozradí stát a nevycházejí z jeho názvu: přídavné jméno z názvu článku („Litevská vlajka“)
// a tvar v 2. pádě („Státní znak Litvy“, „Vlajka Grónska“)
const censorWordsOf = (title) => {
    const words = [];
    const adjective = /^(\p{Lu}\p{Ll}+á) (?:vlajka|státní znak)$/u.exec(title);
    if (adjective) words.push(adjective[1]);
    const genitive = /^(?:Státní znak|Vlajka|Znak) (.+)$/u.exec(title);
    if (genitive) words.push(genitive[1].replace(/^(?:státu|ostrova|hlavního města|města) /u, ''));
    return words;
};
const knownRank = (list, key) => new Map([...list].sort((a, b) => b[key] - a[key]).map((entry, index) => [entry.q, index]));

const items = [];
const stateEntries = [...states.entries()].map(([q, state]) => ({ q, ...state, sl: Number(state.sl) || 0 }));
const stateRank = knownRank(stateEntries, 'sl');
for (const state of stateEntries) {
    const country = countries[state.q];
    const point = pointOf(state.coord);
    const capital = state.cap.slice(0, 3).join(', ');
    const base = {
        n: country.name,
        cz: state.q === CZECHIA ? 1 : undefined,
        co: [state.q],
        la: point ? point.lat : undefined,
        lo: point ? point.lon : undefined
    };
    const facts = { cap: capital || undefined, area: state.area ? Math.round(Number(state.area)) : undefined };
    const flagFile = currentImage(state.flagImgs);
    const flag = symbols.get(state.flag);
    if (flagFile && flag && flag.t) {
        items.push(compact({
            q: state.flag, t: flag.t, ...base, c: 'vlajka',
            k: stateRank.get(state.q) < KNOWN_FLAGS || state.q === CZECHIA ? 1 : 0,
            d: flag.d, im: flagFile, ih: thumbHash(flagFile),
            cw: censorWordsOf(flag.t),
            f: compact({ ...facts, year: yearOfDate(flag.year) }),
            shows: flag.shows
        }));
    }
    const armsFile = currentImage(state.armsImgs);
    const arms = symbols.get(state.arms);
    if (armsFile && arms && arms.t) {
        items.push(compact({
            q: state.arms, t: arms.t, ...base, c: 'znak',
            k: KNOWN_ARMS.includes(state.q) ? 1 : 0,
            d: arms.d, im: armsFile, ih: thumbHash(armsFile),
            cw: censorWordsOf(arms.t),
            f: facts
        }));
    }
}

// Česko: kraje (bez Prahy, ta je mezi městy), města a historické země
const statutory = new Set(czechRows.extra.filter(row => row.type === CZ_STATUTORY).map(row => row.item));
const regionalCapitals = new Set(czechRows.extra.filter(row => row.type === CZ_REGIONAL_CAPITAL).map(row => row.item));
const czechEntries = new Map();
for (const row of czechRows.rows) {
    const entry = czechEntries.get(row.item) || { q: row.item, types: new Set(), t: row.t, n: row.label, sl: Number(row.sl), krajIds: new Set() };
    entry.types.add(row.type);
    if (row.pop) entry.pop = Math.max(entry.pop || 0, Math.round(Number(row.pop)));
    if (row.area) entry.area = Math.round(Number(row.area));
    entry.coord = entry.coord || row.coord;
    // Znak: první nalezený soubor (u měst bývá jediný)
    entry.img = entry.img || fileName(row.img);
    if (row.kraj) entry.krajIds.add(row.kraj);
    czechEntries.set(row.item, entry);
}
const regionNames = new Map([...czechEntries.values()].filter(entry => entry.types.has(CZ_REGION)).map(entry => [entry.q, entry.n]));
const regionCapitalOf = new Map();
for (const entry of czechEntries.values()) {
    if (regionalCapitals.has(entry.q)) for (const kraj of entry.krajIds) regionCapitalOf.set(kraj, entry.n);
}
const KNOWN_TOWNS = 12;
const towns = [...czechEntries.values()]
    .filter(entry => entry.q === PRAGUE || (entry.types.has(CZ_TOWN) && (statutory.has(entry.q) || regionalCapitals.has(entry.q) || entry.pop >= CZ_TOWN_MIN_POPULATION)))
    .sort((a, b) => (b.pop || 0) - (a.pop || 0));
for (const [index, town] of towns.entries()) {
    const point = pointOf(town.coord);
    const kraj = [...town.krajIds].map(q => regionNames.get(q)).find(Boolean);
    items.push(compact({
        q: town.q, t: town.t, n: town.n.replace(/ \(.*\)$/, ''), c: 'cesko', k: index < KNOWN_TOWNS || regionalCapitals.has(town.q) ? 1 : 0,
        ty: 'město', cz: 1, co: [CZECHIA], la: point && point.lat, lo: point && point.lon,
        im: town.img, ih: thumbHash(town.img),
        f: compact({ pop: town.pop, kraj: town.q === PRAGUE ? undefined : kraj, capital: regionalCapitals.has(town.q) ? 1 : undefined, statutory: statutory.has(town.q) ? 1 : undefined })
    }));
}
for (const region of [...czechEntries.values()].filter(entry => entry.types.has(CZ_REGION) && entry.q !== PRAGUE)) {
    const point = pointOf(region.coord);
    items.push(compact({
        q: region.q, t: region.t, n: region.n, c: 'cesko', k: 0, ty: 'kraj', cz: 1, co: [CZECHIA],
        la: point && point.lat, lo: point && point.lon, im: region.img, ih: thumbHash(region.img),
        f: compact({ pop: region.pop, area: region.area, seat: regionCapitalOf.get(region.q) })
    }));
}
for (const land of czechRows.lands) {
    if (items.some(item => item.q === land.item)) continue;
    const point = pointOf(land.coord);
    const file = fileName(land.img);
    const [name, aliases] = CZ_LANDS[land.item];
    items.push(compact({
        q: land.item, t: land.t, n: name, al: aliases, c: 'cesko', k: 1, ty: 'historická země', cz: 1, co: [CZECHIA],
        la: point && point.lat, lo: point && point.lon, im: file, ih: thumbHash(file), f: {}
    }));
}

// Území a organizace: jen s vlastním článkem o vlajce
const CONTINENT_IDS = { Q46: 'EU', Q48: 'AS', Q15: 'AF', Q49: 'NA', Q18: 'SA', Q538: 'OC', Q55643: 'OC', Q3960: 'OC', Q51: 'AN' };
for (const [q, other] of others) {
    const flag = symbols.get(other.flag);
    const file = currentImage(other.flagImgs);
    if (!file || !flag || !flag.t || !other.n) continue;
    const isOrganization = q in ORGANIZATIONS;
    const point = pointOf(other.coord);
    const country = other.co.find(c => countries[c] && c !== q);
    items.push(compact({
        q: other.flag, t: flag.t, n: capitalize(other.n), c: 'uzemi',
        k: KNOWN_OTHERS.includes(q) ? 1 : 0,
        ty: isOrganization ? 'organizace' : 'území',
        d: flag.d, im: file, ih: thumbHash(file),
        cw: censorWordsOf(flag.t),
        al: (isOrganization ? ORGANIZATIONS : TERRITORIES)[q],
        co: country ? [country] : undefined,
        la: !isOrganization && point ? point.lat : undefined,
        lo: !isOrganization && point ? point.lon : undefined,
        f: compact({
            cont: isOrganization ? undefined : (other.cont.map(c => CONTINENT_IDS[c]).find(Boolean) || (country && countries[country].continent) || undefined),
            hq: isOrganization ? ORGANIZATION_SEATS[q] || other.hq : undefined,
            year: isOrganization ? yearOfDate(other.year) : undefined
        }),
        shows: flag.shows,
        src: q
    }));
}

// Stejný název dvakrát v jedné kategorii (stát i území) by byl sporný – zůstane první
const seen = new Set();
const unique = items.filter(item => {
    const key = `${item.c}:${item.n.toLocaleLowerCase('cs')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
});

// --- 6. krok: barevné podpisy obrázků ---
console.log(`Barevné podpisy ${unique.length} obrázků…`);
// Stahování trvá dlouho – rozpracované podpisy se průběžně ukládají, ať přerušení nezačíná znovu
// (soubor v BUILD_CACHE; podpisy se ukládají průběžně a nestažené se příště doplní)
const signatures = new Map();
{
    const dir = process.env.BUILD_CACHE;
    const file = dir && `${dir}/vlajky-signatures-partial.json`;
    if (file && existsSync(file)) for (const [image, signature] of JSON.parse(readFileSync(file, 'utf8'))) signatures.set(image, signature);
    const save = () => { if (file) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify([...signatures])); } };
    let missing = 0;
    // Nejdřív vlajky (na jejich podobnosti záleží nejvíc), pak znaky
    const order = ['vlajka', 'uzemi', 'znak', 'cesko'];
    const queue = [...unique].sort((a, b) => order.indexOf(a.c) - order.indexOf(b.c));
    for (const [index, item] of queue.entries()) {
        if (signatures.has(item.im)) continue;
        const signature = await imageSignature(item.im);
        if (signature === undefined) missing++;
        else signatures.set(item.im, signature);
        process.stdout.write(`  ${index + 1}/${unique.length}\r`);
        if (index % 5 === 0) save();
        await sleep(1500);
    }
    save();
    if (missing) console.warn(`  ${missing} obrázků se nepodařilo stáhnout – spusť sestavení znovu`);
}
for (const item of unique) {
    const signature = signatures.get(item.im);
    if (signature) item.sg = signature;
}

// --- 7. krok: okruhy ---
const stateOf = (item) => (item.c === 'vlajka' || item.c === 'znak') ? item.co[0] : item.src;
const isFlag = (item) => item.c === 'vlajka';
const continentOf = (item) => countries[item.co ? item.co[0] : ''] ? countries[item.co[0]].continent : (item.f || {}).cont;
// Trikolóra: tři stejně široké pruhy různých barev (svisle nebo vodorovně), znak uprostřed nevadí
const isTricolour = (signature) => {
    if (!signature) return false;
    const cell = (x, y) => signature[y * COLS + x];
    const bands = (count, horizontal) => Array.from({ length: 3 }, (_, band) => {
        const letters = new Map();
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            if (Math.floor((horizontal ? y : x) * 3 / count) !== band) continue;
            letters.set(cell(x, y), (letters.get(cell(x, y)) || 0) + 1);
        }
        const [letter, n] = [...letters].sort((a, b) => b[1] - a[1])[0];
        return { letter, share: n / (COLS * ROWS / 3) };
    });
    return [bands(ROWS, true), bands(COLS, false)].some(list => list.every(band => band.share >= 0.8)
        && new Set(list.map(band => band.letter)).size === 3);
};
const shows = (item, pattern) => (item.shows || []).some(text => pattern.test(text));
const COLLECTIONS = [
    { id: 'vlajky-evropy', label: 'Vlajky Evropy', test: item => isFlag(item) && continentOf(item) === 'EU' },
    { id: 'vlajky-asie', label: 'Vlajky Asie', test: item => isFlag(item) && continentOf(item) === 'AS' },
    { id: 'vlajky-afriky', label: 'Vlajky Afriky', test: item => isFlag(item) && continentOf(item) === 'AF' },
    { id: 'vlajky-severni-ameriky', label: 'Vlajky Severní a Střední Ameriky', test: item => isFlag(item) && continentOf(item) === 'NA' },
    { id: 'vlajky-jizni-ameriky', label: 'Vlajky Jižní Ameriky', test: item => isFlag(item) && continentOf(item) === 'SA' },
    { id: 'vlajky-oceanie', label: 'Vlajky Austrálie a Oceánie', test: item => isFlag(item) && continentOf(item) === 'OC' },
    { id: 'trikolory', label: 'Trikolóry', text: 'Tři pruhy – snadno se pletou', test: item => isFlag(item) && isTricolour(item.sg) },
    { id: 'skandinavske-krize', label: 'Skandinávské kříže', test: item => (isFlag(item) || item.c === 'uzemi') && NORDIC_CROSS.includes(stateOf(item)) },
    { id: 'britska-vlajka', label: 'S britskou vlajkou', test: item => (isFlag(item) || item.c === 'uzemi') && UNION_JACK.includes(stateOf(item)) },
    { id: 'hvezdy', label: 'Vlajky s hvězdami', test: item => isFlag(item) && shows(item, /hvězd|souhvězdí/iu) },
    { id: 'pulmesic', label: 'Vlajky s půlměsícem', test: item => isFlag(item) && shows(item, /půlměsíc/iu) },
    { id: 'slunce', label: 'Vlajky se sluncem', test: item => isFlag(item) && shows(item, /slunce/iu) },
    { id: 'cesko-a-sousede', label: 'Česko a sousedé', text: 'Vlajky a znaky', test: item => (isFlag(item) || item.c === 'znak') && NEIGHBOURS.includes(stateOf(item)) },
    { id: 'znaky-evropy', label: 'Státní znaky Evropy', test: item => item.c === 'znak' && continentOf(item) === 'EU' },
    { id: 'kraje', label: 'Kraje a historické země', test: item => item.c === 'cesko' && item.ty !== 'město' },
    { id: 'krajska-mesta', label: 'Krajská města', test: item => item.c === 'cesko' && item.ty === 'město' && (item.f.capital || item.q === PRAGUE) },
    { id: 'organizace', label: 'Mezinárodní organizace', test: item => item.c === 'uzemi' && item.ty === 'organizace' }
];
for (const item of unique) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);
// Pomocné údaje pro okruhy už v datech nejsou potřeba
for (const item of unique) { delete item.shows; delete item.src; }

for (const category of ['vlajka', 'znak', 'cesko', 'uzemi']) {
    const inCategory = unique.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (${inCategory.filter(item => item.k).length} známých, ${inCategory.filter(item => item.sg).length} s podpisem)`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${unique.filter(item => (item.g || []).includes(collection.id)).length}`);

writeTopic('vlajky', { collections, items: unique });
