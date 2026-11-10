// Geometrie obrysů a čar pro data/mapa-tvary.json (scripts/build-mapa-tvary.mjs): příprava prstenců a čar kolem bodu
// položky, rozloha, vzdálenost, sloučení sousedních mnohoúhelníků, zjednodušení a zápis.
//
// Zápis plochy: prstence oddělené „;“, prstenec = celá čísla oddělená „,“ v tisícinách stupně: první dvojice je
// (šířka, délka) prvního bodu, další dvojice rozdíly od předchozího bodu; prstenec je uzavřený implicitně.
// Zápis čáry (řeka): celý text začíná „~“, za ním lomené čáry oddělené „;“ zapsané stejně jako prstenec, ale NEuzavřené.
import { simplify, planarArea } from './natural-earth.mjs';

export const UNIT = 1000;              // tisíciny stupně
export const LINE_PREFIX = '~';
const EARTH_KM = 6371.0088;

// Délka souvislá (přes 180. poledník pokračuje za ±180) a celá posunutá o násobek 360° co nejblíž délce lon0
const continuous = (points, lon0) => {
    for (let i = 1; i < points.length; i++) {
        while (points[i][0] - points[i - 1][0] > 180) points[i][0] -= 360;
        while (points[i][0] - points[i - 1][0] < -180) points[i][0] += 360;
    }
    const mean = points.reduce((sum, p) => sum + p[0], 0) / (points.length || 1);
    const shift = Math.round((lon0 - mean) / 360) * 360;
    if (shift) points.forEach(p => { p[0] += shift; });
    return points;
};

// Prstenec bez opakovaného posledního bodu, délka souvislá a posunutá o násobek 360° co nejblíž bodu položky
export const prepareRing = (ring, lon0) => {
    const points = ring.map(([x, y]) => [x, y]);
    if (points.length > 1) {
        const [fx, fy] = points[0];
        const [lx, ly] = points[points.length - 1];
        if (fx === lx && fy === ly) points.pop();
    }
    return continuous(points, lon0);
};
export const prepareLine = (line, lon0) => continuous(line.map(([x, y]) => [x, y]), lon0);

// Rozloha prstence na kouli v km² (bez znaménka)
export const sphericalKm2 = (points) => {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        sum += (x2 - x1) * Math.PI / 180 * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
    }
    return Math.abs(sum * EARTH_KM * EARTH_KM / 2);
};

export const inRings = (rings, [x, y]) => {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
    }
    return inside;
};

// Nejmenší vzdálenost bodu od úseků (rovinně v km kolem bodu); closed = i úsek z posledního bodu do prvního
const segmentsKm = (paths, [lon, lat], closed) => {
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    let best = Infinity;
    for (const pathPoints of paths) {
        const start = closed ? 0 : 1;
        for (let i = start, j = closed ? pathPoints.length - 1 : 0; i < pathPoints.length; j = i++) {
            const ax = (pathPoints[j][0] - lon) * kx, ay = (pathPoints[j][1] - lat) * ky;
            const bx = (pathPoints[i][0] - lon) * kx, by = (pathPoints[i][1] - lat) * ky;
            const dx = bx - ax, dy = by - ay;
            const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
            best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
        }
        if (!closed && pathPoints.length === 1) best = Math.min(best, Math.hypot((pathPoints[0][0] - lon) * kx, (pathPoints[0][1] - lat) * ky));
    }
    return best;
};

// Vzdálenost bodu [lon, lat] od obrysu v km (0 uvnitř); přibližně v rovině kolem bodu, s ohledem na posun o 360°
export const distanceKm = (rings, [lon, lat]) => {
    let best = Infinity;
    for (const shift of [0, -360, 360]) {
        const point = [lon + shift, lat];
        if (inRings(rings, point)) return 0;
        best = Math.min(best, segmentsKm(rings, point, true));
    }
    return best;
};
// Vzdálenost bodu od lomených čar v km
export const lineDistanceKm = (lines, [lon, lat]) => Math.min(...[0, -360, 360].map(shift => segmentsKm(lines, [lon + shift, lat], false)));

const haversineKm = ([x1, y1], [x2, y2]) => {
    const r = Math.PI / 180;
    const a = Math.sin((y2 - y1) * r / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin((x2 - x1) * r / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};
export const lineKm = (line) => line.reduce((sum, p, i) => (i ? sum + haversineKm(line[i - 1], p) : 0), 0);

export const bboxOf = (rings) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) for (const [x, y] of ring) {
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
    }
    return box;
};
export const diagonalDeg = (box) => Math.hypot(box[2] - box[0], box[3] - box[1]);
export const sizeKm = (box) => Math.hypot((box[2] - box[0]) * 111.32 * Math.cos((box[1] + box[3]) / 2 * Math.PI / 180), (box[3] - box[1]) * 110.57);

// Rozloha sudá–lichá z rozložených mnohoúhelníků (vnější prstenec minus díry)
export const polygonsKm2 = (polygons) => polygons.reduce((sum, rings) => sum + Math.max(0, sphericalKm2(rings[0]) - rings.slice(1).reduce((s, r) => s + sphericalKm2(r), 0)), 0);

// Sloučení sousedních prstenců (kraje regionu, části státu rozdělené 180. poledníkem): společné hrany se vyruší a ze
// zbylých hran se složí nové prstence. Pravidlo sudá–lichá dá stejný výsledek, jen bez vnitřních hranic.
export const dissolve = (rings) => {
    const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const counts = new Map();
    const edges = [];
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            const ka = key(a), kb = key(b);
            if (ka === kb) continue;
            const k = edgeKey(ka, kb);
            counts.set(k, (counts.get(k) || 0) + 1);
            edges.push({ a, b, ka, kb, k });
        }
    }
    const shared = [...counts.values()].some(count => count > 1);
    if (!shared) return rings;
    // Zbylé hrany (lichý počet výskytů), z každé dvojice shodných zůstane nic
    const remaining = new Map();
    for (const edge of edges) {
        const count = counts.get(edge.k);
        if (count % 2 === 0) continue;
        if (remaining.has(edge.k)) continue;
        remaining.set(edge.k, edge);
    }
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
        if (used.has(start.k)) continue;
        used.add(start.k);
        const ring = [start.a];
        let current = start.kb, point = start.b;
        while (current !== start.ka) {
            ring.push(point);
            const next = (byVertex.get(current) || []).find(edge => !used.has(edge.k));
            if (!next) break;
            used.add(next.k);
            if (next.ka === current) { current = next.kb; point = next.b; } else { current = next.ka; point = next.a; }
        }
        if (ring.length >= 3) out.push(ring);
    }
    return out;
};

// Douglas–Peucker uzavřeného prstence: rozdělí se v nejvzdálenějším bodě od prvního, oba konce zůstanou
const simplifyRing = (ring, tolerance) => {
    if (ring.length <= 4) return ring;
    let far = 0, worst = -1;
    ring.forEach(([x, y], i) => {
        const d = (x - ring[0][0]) ** 2 + (y - ring[0][1]) ** 2;
        if (d > worst) { worst = d; far = i; }
    });
    const first = simplify(ring.slice(0, far + 1), tolerance);
    const second = simplify([...ring.slice(far), ring[0]], tolerance);
    return [...first, ...second.slice(1, -1)];
};

// Zaokrouhlení na tisíciny stupně a vypuštění opakovaných bodů (u prstence i posledního shodného s prvním)
const quantize = (points, closed = true) => {
    const out = [];
    for (const [x, y] of points) {
        const q = [Math.round(x * UNIT), Math.round(y * UNIT)];
        const last = out[out.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
    }
    while (closed && out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
    return out;
};

export const encodeRing = (ring) => {
    const numbers = [ring[0][1], ring[0][0]];
    for (let i = 1; i < ring.length; i++) numbers.push(ring[i][1] - ring[i - 1][1], ring[i][0] - ring[i - 1][0]);
    return numbers.join(',');
};
// Opak zápisu (stejné pravidlo jako v testu a v aplikaci): [[[lat, lon], …], …] ve stupních; u čáry (předpona „~“)
// lomené čáry místo prstenců
export const decodeShape = (text) => text.replace(LINE_PREFIX, '').split(';').map(part => {
    const numbers = part.split(',').map(Number);
    const ring = [];
    let lat = 0, lon = 0;
    for (let i = 0; i < numbers.length; i += 2) {
        lat += numbers[i];
        lon += numbers[i + 1];
        ring.push([lat / UNIT, lon / UNIT]);
    }
    return ring;
});

// Zjednodušení celého obrysu pod strop počtu bodů; vrací { text, rings (stupně [lon, lat]), points }
// Volby: maxPoints, minTolerance (stupně), toleranceShare (podíl úhlopříčky rámečku), ringShare (menší prstence než
// tento podíl největšího se vynechají; u mnoha prstenců práh roste)
// toleranceBasis 'largest': tolerance z rámečku největšího prstence (souostrovní stát přes půl oceánu by jinak své
// ostrovy slil do bodu)
export const compress = (rings, { maxPoints = 150, minTolerance = 0.005, toleranceShare = 0.005, ringShare: share0 = 0.01, manyRings = 8, toleranceBasis = 'all' } = {}) => {
    const areas = rings.map(planarArea);
    const largest = Math.max(...areas);
    const diagonal = diagonalDeg(bboxOf(toleranceBasis === 'largest' ? [rings[areas.indexOf(largest)]] : rings));
    let tolerance = Math.max(minTolerance, toleranceShare * diagonal);
    let ringShare = share0;
    for (let round = 0; round < 40; round++) {
        const kept = [];
        rings.forEach((ring, i) => {
            if (areas[i] < ringShare * largest && areas[i] !== largest) return;
            const q = quantize(simplifyRing(ring, tolerance));
            if (q.length >= 3 && planarArea(q) > 0) kept.push(q);
        });
        const points = kept.reduce((sum, ring) => sum + ring.length, 0);
        if (kept.length && points <= maxPoints) {
            return { text: kept.map(encodeRing).join(';'), rings: kept.map(ring => ring.map(([x, y]) => [x / UNIT, y / UNIT])), points };
        }
        if (!kept.length) return null;
        // Moc bodů: hrubší tolerance a u mnoha prstenců i vyšší práh malých ostrůvků
        tolerance *= 1.25;
        if (kept.length > manyRings) ringShare *= 1.6;
    }
    return null;
};

// Spojení úseků čáry, které na sebe navazují (konec jednoho = začátek druhého), do co nejdelších lomených čar
export const joinLines = (lines) => {
    const key = ([x, y]) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
    let pieces = lines.filter(line => line.length >= 2).map(line => line.slice());
    for (let changed = true; changed;) {
        changed = false;
        const ends = new Map();
        pieces.forEach((line, index) => {
            for (const [end, k] of [[0, key(line[0])], [1, key(line[line.length - 1])]]) {
                if (!ends.has(k)) ends.set(k, []);
                ends.get(k).push({ index, end });
            }
        });
        for (const list of ends.values()) {
            if (list.length !== 2 || list[0].index === list[1].index) continue;
            const [a, b] = list;
            let first = pieces[a.index], second = pieces[b.index];
            if (a.end === 0) first = first.slice().reverse();     // konec first se má dotýkat
            if (b.end === 1) second = second.slice().reverse();   // začátek second se má dotýkat
            const joined = [...first, ...second.slice(1)];
            pieces = pieces.filter((_, i) => i !== a.index && i !== b.index);
            pieces.push(joined);
            changed = true;
            break;
        }
    }
    return pieces;
};

// Zjednodušení čar pod strop počtu bodů; krátké odbočky (rameno delty, kus kanálu) pod minShare celkové délky odpadnou
// Vrací { text (s předponou „~“), lines (stupně [lon, lat]), points }
export const compressLines = (lines, { maxPoints = 200, toleranceShare = 0.004, minTolerance = 0.003, minShare = 0.02 } = {}) => {
    const lengths = lines.map(lineKm);
    const total = lengths.reduce((a, b) => a + b, 0);
    const longest = Math.max(...lengths);
    let tolerance = Math.max(minTolerance, toleranceShare * diagonalDeg(bboxOf(lines)));
    let share = minShare;
    for (let round = 0; round < 40; round++) {
        const kept = [];
        lines.forEach((line, i) => {
            if (lengths[i] < share * total && lengths[i] !== longest) return;
            const q = quantize(simplify(line, tolerance), false);
            if (q.length >= 2) kept.push(q);
        });
        const points = kept.reduce((sum, line) => sum + line.length, 0);
        if (kept.length && points <= maxPoints) {
            return { text: LINE_PREFIX + kept.map(encodeRing).join(';'), lines: kept.map(line => line.map(([x, y]) => [x / UNIT, y / UNIT])), points };
        }
        if (!kept.length) return null;
        tolerance *= 1.25;
        if (kept.length > 6) share *= 1.5;
    }
    return null;
};
