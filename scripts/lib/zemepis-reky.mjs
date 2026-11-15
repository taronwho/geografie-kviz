// Další státy řek (pole ca u položek okruhu reka v data/zemepis.json): státy, kterými řeka také teče, kde pramení, tvoří hranici
// nebo kam sahá její povodí, ale Wikidata je nemají jako stát (P17, pole co). Garonna pramení ve Španělsku, Spréva krátce teče
// Českem, Siret pramení na Ukrajině, Purus v Peru. Takový stát nesmí být nesprávnou možností („Která z těchto řek teče ve
// Španělsku?“ s Garonnou mezi nesprávnými, Dobývání conquest.js) a otázka „Ve kterém státě to je?“ (topics/zemepis.js) se na takovou
// řeku neptá, protože by jedna odpověď nestačila.
// Zdroje: 1. průběh řeky (data/mapa-tvary.json, čára „~…“) proti hranicím států Natural Earth 1:10m – body po 1 km, stát, ve kterém
// bod leží, a každý stát do 2 km od bodu (hraniční řeky, pramen u hranice); stát s aspoň 1 km se počítá;
// 2. Wikidata: stát povodí (P205) a stát správní jednotky řeky (P131 → P17).
// Použití: build-zemepis.mjs před zápisem dat a npm run build:reky (doplní jen pole ca do hotových dat, bez nového stahování míst).
import { readFileSync, existsSync } from 'node:fs';
import { layer, polygonsOf } from './natural-earth.mjs';
import { sparql, values, id, cached, inBatches } from './wikidata.mjs';

const KM_PER_DEGREE = 111.32;
const STEP_KM = 1;
const TOLERANCE_KM = 2;
const MIN_KM = 1;
const CELL = 0.1;

// Čára řeky z data/mapa-tvary.json: „~“, úseky oddělené „;“, v úseku první bod (šířka, délka v tisícinách stupně) a pak rozdíly
const decodeLine = (encoded) => String(encoded).replace(/^~/, '').split(';').map(text => {
    const numbers = text.split(',').map(Number);
    const points = [];
    let lat = 0, lon = 0;
    for (let i = 0; i + 1 < numbers.length; i += 2) { lat += numbers[i]; lon += numbers[i + 1]; points.push([lon / 1000, lat / 1000]); }
    return points;
}).filter(points => points.length >= 2);

// Hranice států jako mřížka úseků (rychlé hledání států do 2 km od bodu) a mnohoúhelníky s obdélníky (bod uvnitř státu)
export const borderIndex = (features) => {
    const polygons = [];
    const grid = new Map();
    const cellKey = (cx, cy) => `${cx}:${cy}`;
    for (const feature of features) {
        const q = feature.properties && feature.properties.WIKIDATAID;
        if (!q) continue;
        for (const rings of polygonsOf(feature.geometry)) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
            polygons.push({ q, rings, box: [x0, y0, x1, y1] });
            for (const ring of rings) {
                for (let i = 1; i < ring.length; i++) {
                    const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
                    for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++) {
                        for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
                            const key = cellKey(cx, cy);
                            if (!grid.has(key)) grid.set(key, []);
                            grid.get(key).push([ax, ay, bx, by, q]);
                        }
                    }
                }
            }
        }
    }
    const inRing = (x, y, ring) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };
    const containing = (x, y) => {
        const found = polygons.find(p => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3]
            && inRing(x, y, p.rings[0]) && !p.rings.slice(1).some(hole => inRing(x, y, hole)));
        return found ? found.q : null;
    };
    // Státy, jejichž hranice je do tolerance od bodu
    const near = (x, y, toleranceKm) => {
        const cos = Math.max(0.2, Math.cos(y * Math.PI / 180));
        const result = new Set();
        const reachX = Math.ceil(toleranceKm / KM_PER_DEGREE / cos / CELL), reachY = Math.ceil(toleranceKm / KM_PER_DEGREE / CELL);
        const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        for (let dx = -reachX; dx <= reachX; dx++) {
            for (let dy = -reachY; dy <= reachY; dy++) {
                for (const [ax, ay, bx, by, q] of grid.get(cellKey(cx + dx, cy + dy)) || []) {
                    if (result.has(q)) continue;
                    const px = (x - ax) * cos, py = y - ay, sx = (bx - ax) * cos, sy = by - ay;
                    const length = sx * sx + sy * sy;
                    const t = length ? Math.max(0, Math.min(1, (px * sx + py * sy) / length)) : 0;
                    if (Math.hypot(px - t * sx, py - t * sy) * KM_PER_DEGREE <= toleranceKm) result.add(q);
                }
            }
        }
        return result;
    };
    return { containing, near };
};

// Kilometry řeky ve státech (i do 2 km od hranice): Map QID → km
export const lineCountries = (encoded, index, { step = STEP_KM, tolerance = TOLERANCE_KM } = {}) => {
    const km = new Map();
    for (const line of decodeLine(encoded)) {
        // Stát se mění jen přes hranici: daleko od hranic stačí stát předchozího bodu
        let current = null, fresh = false;
        for (let i = 1; i < line.length; i++) {
            const [ax, ay] = line[i - 1], [bx, by] = line[i];
            const cos = Math.cos(ay * Math.PI / 180);
            const length = Math.hypot((bx - ax) * cos, by - ay) * KM_PER_DEGREE;
            const steps = Math.max(1, Math.ceil(length / step));
            for (let s = 0; s < steps; s++) {
                const t = (s + 0.5) / steps;
                const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
                const close = index.near(x, y, tolerance);
                if (close.size || !fresh) { current = index.containing(x, y); fresh = !close.size; }
                const hit = new Set(close);
                if (current) hit.add(current);
                for (const q of hit) km.set(q, (km.get(q) || 0) + length / steps);
            }
        }
    }
    return km;
};

// Stát povodí (P205) a stát správní jednotky (P131 → P17) z Wikidat
const wikidataQuery = (qids) => `
SELECT ?item ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?item wdt:P205 ?v } UNION { ?item wdt:P131 ?unit . ?unit wdt:P17 ?v }
}`;
const wikidataCountries = (qids) => cached(`zemepis-reky-staty-${qids.length}`, async () => {
    const result = {};
    await inBatches(qids, 80, wikidataQuery, (row) => {
        const item = id(row.item.value);
        (result[item] = result[item] || []).push(id(row.v.value));
    }, sparql);
    return result;
});

// Doplní pole ca u řek (položky okruhu reka s druhem řeka); vrátí počet řek s doplněnými státy
export const addRiverCountries = async (items, countries, { shapesFile = new URL('../../data/mapa-tvary.json', import.meta.url), log = console.log } = {}) => {
    const rivers = items.filter(item => item.c === 'reka');
    const shapes = existsSync(shapesFile) ? JSON.parse(readFileSync(shapesFile, 'utf8')).shapes || {} : {};
    log(`Státy ${rivers.length} řek podle průběhu (Natural Earth 1:10m) a Wikidat…`);
    const index = borderIndex((await layer('ne_10m_admin_0_countries')).features);
    const wikidata = await wikidataCountries(rivers.map(item => item.q).sort());
    let added = 0;
    for (const item of rivers) {
        const own = new Set(item.co || []);
        const found = new Set(wikidata[item.q] || []);
        const shape = shapes[item.q];
        if (typeof shape === 'string' && shape.startsWith('~')) {
            for (const [q, km] of lineCountries(shape, index)) if (km >= MIN_KM) found.add(q);
        }
        const also = [...found].filter(q => countries[q] && !own.has(q)).sort();
        // Pole ca hned za co (čitelnost dat), bez něj se položka nezmění
        const entries = Object.entries(item).filter(([key]) => key !== 'ca');
        if (also.length) { entries.splice(entries.findIndex(([key]) => key === 'co') + 1, 0, ['ca', also]); added++; }
        Object.keys(item).forEach(key => delete item[key]);
        Object.assign(item, Object.fromEntries(entries));
    }
    log(`  ${added} řek teče i jinými státy, než mají ve Wikidatech (pole ca)`);
    return added;
};
