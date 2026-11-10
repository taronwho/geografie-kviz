// Průběh řeky z cest relace OpenStreetMap (type=waterway) pro data/mapa-tvary.json: z cest se složí síť (uzly = konce
// cest), v každé souvislé části se vybere hlavní tok (nejdelší z nejkratších cest mezi dvěma konci sítě) a vedlejší
// ramena, náhony a slepé odbočky odpadnou. Dřív se cesty jen řetězily za sebou a z ramen vznikaly krátké „ostny“
// (čára se vydala ramenem tam a po hlavním toku zpátky).
import { lineKm } from './mapa-tvary-geo.mjs';

const MAIN_ROLES = new Set(['', 'main_stream', 'main']);
const SIDE_WATERWAYS = new Set(['riverbank', 'dock', 'boatyard', 'dam', 'weir', 'lock_gate', 'ditch', 'drain', 'fish_pass']);

// Cesty relace ({ role, waterway, line }) nebo starší zápis mezipaměti (jen čáry) → čáry hlavního toku
export const mainWays = (ways) => {
    if (!Array.isArray(ways)) return [];
    if (ways.length && Array.isArray(ways[0])) return ways.filter(line => line.length >= 2);
    const usable = ways.filter(way => way && Array.isArray(way.line) && way.line.length >= 2 && !SIDE_WATERWAYS.has(way.waterway || ''));
    const main = usable.filter(way => MAIN_ROLES.has(way.role || ''));
    // Relace bez rolí hlavního toku (všechno „side_stream“ nebo vlastní role): vezme se všechno, hlavní tok vybere síť
    return (main.length ? main : usable).map(way => way.line);
};

const pointKm = ([x1, y1], [x2, y2]) => Math.hypot((x2 - x1) * 111.32 * Math.cos((y1 + y2) / 2 * Math.PI / 180), (y2 - y1) * 110.57);

// Nejkratší cesty z uzlu (Dijkstra s haldou): { dist, prev: uzel → [předchozí uzel, hrana] }
const shortestFrom = (adjacency, start) => {
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const heap = [[0, start]];
    const push = (entry) => {
        heap.push(entry);
        for (let i = heap.length - 1; i > 0;) {
            const parent = (i - 1) >> 1;
            if (heap[parent][0] <= heap[i][0]) break;
            [heap[parent], heap[i]] = [heap[i], heap[parent]];
            i = parent;
        }
    };
    const pop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            for (let i = 0; ;) {
                const left = 2 * i + 1, right = left + 1;
                let smallest = i;
                if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
                if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
                if (smallest === i) break;
                [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
                i = smallest;
            }
        }
        return top;
    };
    while (heap.length) {
        const [d, node] = pop();
        if (d > dist.get(node)) continue;
        for (const edge of adjacency.get(node) || []) {
            const next = d + edge.km;
            if (next < (dist.has(edge.to) ? dist.get(edge.to) : Infinity)) {
                dist.set(edge.to, next);
                prev.set(edge.to, [node, edge]);
                push([next, edge.to]);
            }
        }
    }
    return { dist, prev };
};

const farthest = (dist) => {
    let best = null, far = -1;
    for (const [node, d] of dist) if (d > far) { far = d; best = node; }
    return best;
};

// Čáry ([[lon, lat], …]) → hlavní tok: jedna lomená čára za každou souvislou část sítě (od nejdelší); části kratší než
// minShare nejdelší odpadnou. snapKm: konce cest blíž než tolik km se berou jako spojené (přerušení u jezu, hranice
// dvou editací); gapKm: části, jejichž konce leží do této vzdálenosti, se spojí do jedné čáry (řeka přes jezero bez cesty)
export const mainStem = (lines, { minShare = 0.03, snapKm = 0.05, gapKm = 0 } = {}) => {
    const usable = lines.filter(line => line.length >= 2);
    if (!usable.length) return [];
    const key = ([x, y]) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
    // Uzly: konce cest; blízké konce (do snapKm) se sloučí přes mřížku
    const nodes = new Map();
    let nextId = 0;
    const cell =Math.max(snapKm, 0.001) / 100;  // stupně, hrubě
    const grid = new Map();
    const nodeOf = (point) => {
        const k = key(point);
        if (nodes.has(k)) return nodes.get(k);
        const gx = Math.floor(point[0] / cell), gy = Math.floor(point[1] / cell);
        if (snapKm > 0) {
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                for (const other of grid.get(`${gx + dx},${gy + dy}`) || []) {
                    if (pointKm(other.point, point) <= snapKm) { nodes.set(k, other.id); return other.id; }
                }
            }
        }
        const id = nextId++;
        nodes.set(k, id);
        const gk = `${gx},${gy}`;
        if (!grid.has(gk)) grid.set(gk, []);
        grid.get(gk).push({ id, point });
        return id;
    };
    const adjacency = new Map();
    const addEdge = (from, to, edge) => {
        if (!adjacency.has(from)) adjacency.set(from, []);
        adjacency.get(from).push({ ...edge, to });
    };
    usable.forEach((line, index) => {
        const a = nodeOf(line[0]), b = nodeOf(line[line.length - 1]);
        const km = lineKm(line);
        if (a === b) { if (!adjacency.has(a)) adjacency.set(a, []); return; }  // uzavřená smyčka (ostrov) k délce nepřispěje
        addEdge(a, b, { index, km, reversed: false });
        addEdge(b, a, { index, km, reversed: true });
    });
    const seen = new Set();
    const stems = [];
    for (const start of adjacency.keys()) {
        if (seen.has(start)) continue;
        const first = shortestFrom(adjacency, start);
        for (const node of first.dist.keys()) seen.add(node);
        const a = farthest(first.dist);
        const second = shortestFrom(adjacency, a);
        const b = farthest(second.dist);
        const path = [];
        for (let node = b; node !== a;) {
            const [from, edge] = second.prev.get(node);
            path.push(edge);
            node = from;
        }
        // path vede od b k a (po hranách proti směru hledání): složí se čára od a k b
        const points = [];
        for (const edge of path.reverse()) {
            const line = edge.reversed ? usable[edge.index].slice().reverse() : usable[edge.index];
            points.push(...(points.length ? line.slice(1) : line));
        }
        if (points.length >= 2) stems.push({ line: points, km: second.dist.get(b) });
    }
    stems.sort((x, y) => y.km - x.km);
    if (!stems.length) return [];
    let kept = stems.filter(stem => stem.km >= minShare * stems[0].km).map(stem => stem.line);
    // Spojení částí přes krátké mezery (jezero, přehrada, chybějící kousek): nejbližší dvojice konců pod gapKm
    for (let merged = true; merged && gapKm > 0 && kept.length > 1;) {
        merged = false;
        let best = null;
        for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
            for (const ei of [0, 1]) for (const ej of [0, 1]) {
                const d = pointKm(ei ? kept[i][kept[i].length - 1] : kept[i][0], ej ? kept[j][kept[j].length - 1] : kept[j][0]);
                if (d <= gapKm && (!best || d < best.d)) best = { d, i, j, ei, ej };
            }
        }
        if (best) {
            const first = best.ei ? kept[best.i] : kept[best.i].slice().reverse();     // končí u mezery
            const second = best.ej ? kept[best.j].slice().reverse() : kept[best.j];    // začíná u mezery
            kept = [...kept.filter((_, index) => index !== best.i && index !== best.j), [...first, ...second]];
            merged = true;
        }
    }
    return kept;
};

// Úhel otočení ve vrcholu b (0 = rovně, 180 = zpátky) v rovině kolem b
export const turnDeg = (a, b, c) => {
    const k = Math.cos(b[1] * Math.PI / 180);
    const ux = (b[0] - a[0]) * k, uy = b[1] - a[1], vx = (c[0] - b[0]) * k, vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (!lu || !lv) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180 / Math.PI;
};

// Odstranění ostnů: vrchol, ve kterém se čára otočí o víc než maxTurn stupňů a kratší z obou úseků má pod maxKm
export const removeSpikes = (line, maxTurn = 150, maxKm = 2) => {
    const points = line.slice();
    for (let changed = true; changed && points.length > 2;) {
        changed = false;
        for (let i = 1; i < points.length - 1; i++) {
            if (turnDeg(points[i - 1], points[i], points[i + 1]) > maxTurn && Math.min(pointKm(points[i - 1], points[i]), pointKm(points[i], points[i + 1])) < maxKm) {
                points.splice(i, 1);
                changed = true;
                break;
            }
        }
    }
    return points;
};
