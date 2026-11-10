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
// postprocess(čára ve stupních) → čára: úprava zjednodušené čáry před zaokrouhlením (odstranění ostnů u řek z OpenStreetMap)
export const compressLines = (lines, { maxPoints = 200, toleranceShare = 0.004, minTolerance = 0.003, minShare = 0.02, postprocess = null } = {}) => {
    const lengths = lines.map(lineKm);
    const total = lengths.reduce((a, b) => a + b, 0);
    const longest = Math.max(...lengths);
    let tolerance = Math.max(minTolerance, toleranceShare * diagonalDeg(bboxOf(lines)));
    let share = minShare;
    for (let round = 0; round < 40; round++) {
        const kept = [];
        lines.forEach((line, i) => {
            if (lengths[i] < share * total && lengths[i] !== longest) return;
            let q = quantize(simplify(line, tolerance), false);
            // Úprava až na zaokrouhlených bodech (zaokrouhlení úhly mírně mění)
            if (postprocess) q = quantize(postprocess(q.map(([x, y]) => [x / UNIT, y / UNIT])), false);
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

// --- doplňky: obal čáry, podíl pevniny, orientace prstenců -------------------------------------------------------------

// Obal lomené čáry o poloměru radiusKm (průliv nakreslený v OpenStreetMap jen osou): jeden prstenec [lon, lat] –
// levá strana, půlkruh na konci, pravá strana zpět, půlkruh na začátku. Čára se nejdřív zjednoduší na třetinu poloměru,
// aby se obal v zatáčkách nekřížil.
export const bufferLine = (line, radiusKm) => {
    if (!line || line.length < 2 || !(radiusKm > 0)) return null;
    const lat0 = line.reduce((sum, p) => sum + p[1], 0) / line.length;
    const kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 110.57;
    let points = simplify(line.map(([x, y]) => [x * kx, y * ky]), radiusKm / 3);
    points = points.filter((p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-6);
    if (points.length < 2) return null;
    const normals = [];
    for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1][0] - points[i][0], dy = points[i + 1][1] - points[i][1];
        const length = Math.hypot(dx, dy);
        normals.push([-dy / length, dx / length]);
    }
    const side = (sign) => points.map((p, i) => {
        const a = normals[Math.max(0, i - 1)], b = normals[Math.min(normals.length - 1, i)];
        let nx = a[0] + b[0], ny = a[1] + b[1];
        const length = Math.hypot(nx, ny) || 1;
        nx /= length; ny /= length;
        const miter = Math.min(2, 1 / Math.max(0.2, nx * a[0] + ny * a[1]));
        return [p[0] + sign * nx * radiusKm * miter, p[1] + sign * ny * radiusKm * miter];
    });
    const cap = (center, from, to) => {
        // půlkruh od bodu from k bodu to kolem středu (ve směru z levé strany na pravou přes čelo)
        const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
        let a1 = Math.atan2(to[1] - center[1], to[0] - center[0]);
        while (a1 > a0) a1 -= 2 * Math.PI;
        const out = [];
        for (let step = 1; step < 6; step++) { const a = a0 + (a1 - a0) * step / 6; out.push([center[0] + radiusKm * Math.cos(a), center[1] + radiusKm * Math.sin(a)]); }
        return out;
    };
    const left = side(1), right = side(-1);
    const last = points.length - 1;
    const ring = [...left, ...cap(points[last], left[last], right[last]), ...right.reverse(), ...cap(points[0], right[right.length - 1], left[0])];
    return ring.map(([x, y]) => [x / kx, y / ky]);
};

// Rejstřík pevniny z mnohoúhelníků ([[prstenec, díry…], …], [lon, lat]): isLand(bod), share(prstence obrysu) = podíl
// vzorků uvnitř obrysu, které leží na pevnině (null, když se do obrysu žádný vzorek netrefil), coastKm(bod, strop) =
// vzdálenost k nejbližšímu pobřeží
export const landIndex = (polygons) => {
    const rings = polygons.flat().filter(ring => ring.length >= 3).map(ring => ({ ring, box: bboxOf([ring]) }));
    const CELL = 2;
    const grid = new Map();
    for (const entry of rings) {
        for (let gx = Math.floor(entry.box[0] / CELL); gx <= Math.floor(entry.box[2] / CELL); gx++) {
            for (let gy = Math.floor(entry.box[1] / CELL); gy <= Math.floor(entry.box[3] / CELL); gy++) {
                const key = `${gx},${gy}`;
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push(entry);
            }
        }
    }
    const wrap = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;
    const isLand = ([lon0, lat]) => {
        const lon = wrap(lon0);
        let inside = false;
        for (const { ring, box } of grid.get(`${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`) || []) {
            if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
            if (inRings([ring], [lon, lat])) inside = !inside;
        }
        return inside;
    };
    const share = (shape, samples = 18) => {
        const box = bboxOf(shape);
        let total = 0, land = 0;
        for (let i = 0; i < samples; i++) for (let j = 0; j < samples; j++) {
            const point = [box[0] + (box[2] - box[0]) * (i + 0.5) / samples, box[1] + (box[3] - box[1]) * (j + 0.5) / samples];
            if (!inRings(shape, point)) continue;
            total++;
            if (isLand(point)) land++;
        }
        return total >= 8 ? land / total : null;
    };
    const coastKm = ([lon0, lat], maxKm = 150) => {
        const lon = wrap(lon0);
        const reach = Math.ceil(maxKm / 111 / CELL / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        const seen = new Set();
        let best = maxKm;
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -1; dy <= 1; dy++) {
            for (const entry of grid.get(`${Math.floor(lon / CELL) + dx},${Math.floor(lat / CELL) + dy}`) || []) {
                if (seen.has(entry)) continue;
                seen.add(entry);
                best = Math.min(best, segmentsKm([entry.ring], [lon, lat], true));
            }
        }
        return best;
    };
    return { isLand, share, coastKm };
};

// Prstence ze shapefile (vnější a díry podle směru oběhu) → mnohoúhelníky [[vnější], …] s dírami u největšího;
// díry menší než minHoleShare celkové plochy se zahodí (zářezy údolí uvnitř pohoří)
export const polygonsFromOrientedRings = (rings, minHoleShare = 0.08) => {
    const signed = (ring) => { let sum = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); return sum; };
    const measured = rings.filter(ring => ring.length >= 4).map(ring => ({ ring, signed: signed(ring) })).sort((a, b) => Math.abs(b.signed) - Math.abs(a.signed));
    if (!measured.length) return [];
    const outerSign = Math.sign(measured[0].signed) || 1;
    const outers = measured.filter(m => Math.sign(m.signed) === outerSign);
    const total = outers.reduce((sum, m) => sum + Math.abs(m.signed), 0);
    const holes = measured.filter(m => Math.sign(m.signed) !== outerSign && Math.abs(m.signed) >= minHoleShare * total);
    return outers.map((m, i) => (i ? [m.ring] : [m.ring, ...holes.map(h => h.ring)]));
};

// Rozloha obrysu podle pravidla sudá–lichá v km²: prstenec ležící uvnitř lichého počtu větších je díra
export const evenOddKm2 = (rings) => {
    const sorted = rings.map(ring => ({ ring, area: sphericalKm2(ring) })).sort((a, b) => b.area - a.area);
    let total = 0;
    sorted.forEach((entry, index) => {
        const depth = sorted.slice(0, index).filter(other => inRings([other.ring], entry.ring[0])).length;
        total += depth % 2 ? -entry.area : entry.area;
    });
    return Math.max(0, total);
};
