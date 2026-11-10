// Pomocníky pro podkladovou mapu (scripts/build-mapa.mjs): sloučení sousedních mnohoúhelníků, hranice oříznuté podle
// nakreslené pevniny, výběr ostrovů a jezer, na které se hra ptá a které hrubší vrstva nemá. Čisté funkce (testy
// v tests/audit-mapa.test.js).
import { RingSet, SegmentIndex, bboxOf, interiorPoint, haversineKm } from './audit-mapa-geo.mjs';

// Sloučení sousedních prstenců (Somálsko se Somalilandem, Kypr se severem): společné hrany se vyruší a ze zbylých se složí
// nové prstence; pravidlo sudá–lichá dá stejnou plochu bez vnitřní hranice
export const dissolve = (rings) => {
    const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const counts = new Map();
    const edges = [];
    for (const ring of rings) {
        const points = ring.length > 1 && key(ring[0]) === key(ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            const ka = key(a), kb = key(b);
            if (ka === kb) continue;
            const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
            counts.set(id, (counts.get(id) || 0) + 1);
            edges.push({ a, b, ka, kb, id });
        }
    }
    if (![...counts.values()].some(count => count > 1)) return rings;
    const remaining = new Map();
    for (const edge of edges) if (counts.get(edge.id) % 2 === 1 && !remaining.has(edge.id)) remaining.set(edge.id, edge);
    const byVertex = new Map();
    for (const edge of remaining.values()) {
        for (const vertex of [edge.ka, edge.kb]) {
            if (!byVertex.has(vertex)) byVertex.set(vertex, []);
            byVertex.get(vertex).push(edge);
        }
    }
    const used = new Set();
    const out = [];
    for (const start of remaining.values()) {
        if (used.has(start.id)) continue;
        used.add(start.id);
        const ring = [start.a];
        let current = start.kb, point = start.b;
        while (current !== start.ka) {
            ring.push(point);
            const next = (byVertex.get(current) || []).find(edge => !used.has(edge.id));
            if (!next) break;
            used.add(next.id);
            if (next.ka === current) { current = next.kb; point = next.b; } else { current = next.ka; point = next.a; }
        }
        if (ring.length >= 3) out.push([...ring, ring[0]]);
    }
    return out;
};

// Vzdálenost bodu od obvodu prstence ve stupních (rovinně)
const ringDistance = ([x, y], ring) => {
    let best = Infinity;
    for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const dx = ring[i][0] - ax, dy = ring[i][1] - ay;
        const length = dx * dx + dy * dy;
        const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
    return best;
};
// Čára vede po společné hranici dvou sad prstenců (hranice mezi částmi sloučeného státu)
export const runsBetween = (line, ringsA, ringsB, eps = 0.05) => {
    const near = (point, rings) => rings.some(ring => ringDistance(point, ring) <= eps);
    const shared = line.filter(point => near(point, ringsA) && near(point, ringsB)).length;
    return shared / line.length >= 0.8;
};

// Úsek obvodu prstence mezi dvěma místy (kratší cestou): doplnění hranice, kterou vrstva hranic nemá
export const ringPath = (ring, from, to) => {
    const points = ring.slice(0, -1);
    const nearest = (target) => points.reduce((best, point, index) => (Math.hypot(point[0] - target[0], point[1] - target[1]) < Math.hypot(points[best][0] - target[0], points[best][1] - target[1]) ? index : best), 0);
    const a = nearest(from), b = nearest(to);
    const forward = [];
    for (let i = a; ; i = (i + 1) % points.length) { forward.push(points[i]); if (i === b) break; }
    const backward = [];
    for (let i = a; ; i = (i + points.length - 1) % points.length) { backward.push(points[i]); if (i === b) break; }
    return forward.length <= backward.length ? forward : backward;
};

// Hranice oříznutá podle nakreslené pevniny (v jednotkách mapy): úseky v moři se vypustí (námořní hranice, čára
// protažená do zálivu), krátký úsek přes vodu uprostřed čáry (úzký průliv, ústí řeky) zůstane. Vrací kusy čáry.
export const trimToLand = (points, isDry, { step = 0.5, bridge = 4, minPiece = 1.5 } = {}) => {
    if (points.length < 2) return [];
    // Vzorky podél čáry: [x, y, index úseku, je to vrchol]
    const samples = [];
    for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1];
        const [bx, by] = points[i];
        const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
        for (let k = i === 1 ? 0 : 1; k <= count; k++) samples.push({ x: ax + (bx - ax) * k / count, y: ay + (by - ay) * k / count, vertex: k === 0 || k === count, at: Math.hypot(bx - ax, by - ay) / count });
    }
    const dry = samples.map(sample => isDry(sample.x, sample.y));
    // Krátké mokré úseky uvnitř čáry se překlenou
    for (let i = 0; i < samples.length;) {
        if (dry[i]) { i++; continue; }
        let j = i;
        let length = 0;
        while (j < samples.length && !dry[j]) { length += samples[j].at; j++; }
        if (i > 0 && j < samples.length && length <= bridge) for (let k = i; k < j; k++) dry[k] = true;
        i = j;
    }
    const pieces = [];
    let piece = null;
    samples.forEach((sample, i) => {
        if (!dry[i]) { piece = null; return; }
        const edge = i === 0 || !dry[i - 1] || i === samples.length - 1 || !dry[i + 1];
        if (!piece) { piece = []; pieces.push(piece); }
        if (sample.vertex || edge) piece.push([sample.x, sample.y]);
    });
    const length = (line) => line.reduce((sum, point, i) => (i ? sum + Math.hypot(point[0] - line[i - 1][0], point[1] - line[i - 1][1]) : 0), 0);
    return pieces.filter(line => line.length > 1 && (pieces.length === 1 || length(line) >= minPiece));
};

// Pevnina v zeměpisných souřadnicích [délka, šířka]: je bod na některém mnohoúhelníku (vnější prstenec bez děr)?
export const landTester = (polygons) => {
    const outer = new RingSet(polygons.map(polygon => polygon[0]));
    const holes = new RingSet(polygons.flatMap(polygon => polygon.slice(1)));
    return (lon, lat) => outer.contains(lon, lat) && !holes.contains(lon, lat);
};

// Ostrovy z podrobnější vrstvy (1:10m), na které se hra ptá a které hrubší pevnina (1:50m) nemá.
// places = [{ lat, lon, radiusKm }] (radiusKm > 0 u souostroví: všechny ostrovy v okruhu, jinak ostrov s bodem nebo
// nejbližší do nearKm); fine = mnohoúhelníky podrobné vrstvy; onCoarse(lon, lat) = bod na hrubší pevnině.
export const pickIslands = (places, fine, onCoarse, { maxKm2 = 3000, nearKm = 4, perGroup = 12, areaOf } = {}) => {
    const candidates = fine.map(polygon => {
        const ring = polygon[0];
        const box = bboxOf(ring);
        return { polygon, ring, box, km2: areaOf(ring), set: null };
    }).filter(entry => entry.km2 <= maxKm2);
    const index = new Map();
    for (const entry of candidates) {
        for (let cx = Math.floor(entry.box[0]); cx <= Math.floor(entry.box[2]); cx++) {
            for (let cy = Math.floor(entry.box[1]); cy <= Math.floor(entry.box[3]); cy++) {
                const key = `${cx},${cy}`;
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(entry);
            }
        }
    }
    const around = (lon, lat, reach) => {
        const found = new Set();
        for (let cx = Math.floor(lon - reach); cx <= Math.floor(lon + reach); cx++) for (let cy = Math.floor(lat - reach); cy <= Math.floor(lat + reach); cy++) for (const entry of index.get(`${cx},${cy}`) || []) found.add(entry);
        return [...found];
    };
    const contains = (entry, lon, lat) => {
        if (lon < entry.box[0] || lon > entry.box[2] || lat < entry.box[1] || lat > entry.box[3]) return false;
        entry.set = entry.set || new RingSet([entry.ring]);
        return entry.set.contains(lon, lat);
    };
    const distanceKm = (entry, lon, lat) => {
        const cos = Math.max(0.05, Math.cos(lat * Math.PI / 180));
        return ringDistance([lon * cos, lat], entry.ring.map(([x, y]) => [x * cos, y])) * 111.2;
    };
    const picked = new Set();
    for (const place of places) {
        const limitKm = place.nearKm || nearKm;
        const reach = Math.max(0.2, (place.radiusKm || limitKm) / 111 / Math.max(0.2, Math.cos(place.lat * Math.PI / 180)));
        const nearby = around(place.lon, place.lat, reach);
        let chosen = [];
        if (place.radiusKm > 0) {
            chosen = nearby.filter(entry => haversineKm([place.lat, place.lon], [(entry.box[1] + entry.box[3]) / 2, (entry.box[0] + entry.box[2]) / 2]) <= place.radiusKm)
                .sort((a, b) => b.km2 - a.km2).slice(0, perGroup);
        } else {
            const inside = nearby.find(entry => contains(entry, place.lon, place.lat));
            if (inside) chosen = [inside];
            else {
                const closest = nearby.map(entry => ({ entry, km: distanceKm(entry, place.lon, place.lat) })).filter(hit => hit.km <= limitKm).sort((a, b) => a.km - b.km)[0];
                if (closest) chosen = [closest.entry];
            }
        }
        for (const entry of chosen) {
            const [x, y] = interiorPoint(entry.ring);
            if (!onCoarse(x, y)) picked.add(entry);
        }
    }
    return [...picked].map(entry => entry.polygon);
};

export { RingSet, SegmentIndex, interiorPoint };
