// Geometrie pro kontrolu mapy (scripts/audit-mapa.mjs): rozbor cest SVG z data/mapa.json, bod v ploše, vzdálenost
// k nejbližšímu úseku přes mřížku, rozloha a délka na kouli, průsečíky úseků. Bez závislostí, vše čisté funkce.

const RAD = Math.PI / 180;
export const EARTH_KM = 6371;

// --- Cesty SVG podkladové mapy (M x y l dx dy … z) ---------------------------------------------------------------------

// Cesta → [{ points: [[x, y], …], closed }]: uzavřený kroužek (z) nemá první bod na konci zopakovaný
export const parsePath = (d) => {
    const parts = [];
    let current = null;
    let x = 0, y = 0;
    const tokens = String(d || '').match(/[MlLzZ]|-?\d+(?:\.\d+)?/g) || [];
    let command = '';
    for (let i = 0; i < tokens.length;) {
        const token = tokens[i];
        if (/[MlLzZ]/.test(token)) {
            command = token;
            i++;
            if (command === 'z' || command === 'Z') { if (current) { current.closed = true; parts.push(current); } current = null; }
            continue;
        }
        const a = Number(tokens[i]);
        const b = Number(tokens[i + 1]);
        i += 2;
        if (command === 'M') { if (current) parts.push(current); x = a; y = b; current = { points: [[x, y]], closed: false }; command = 'l'; }
        else if (command === 'l') { x += a; y += b; current.points.push([x, y]); }
        else if (command === 'L') { x = a; y = b; current.points.push([x, y]); }
    }
    if (current) parts.push(current);
    return parts;
};

export const bboxOf = (points) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
};

export const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(sum / 2);
};

export const insideRing = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

// Kroužek připravený na mnoho dotazů „je bod uvnitř“: velký kroužek (kontinent má tisíce bodů) má hrany roztříděné
// do vodorovných pásů, takže dotaz projde jen hrany ve výšce bodu
class IndexedRing {
    constructor(points) {
        this.points = points;
        this.box = bboxOf(points);
        this.bands = null;
        if (points.length > 64) {
            const height = this.box[3] - this.box[1];
            this.size = Math.max(height / Math.min(512, Math.ceil(points.length / 8)), 1e-9);
            this.bands = new Map();
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const y0 = Math.min(points[i][1], points[j][1]), y1 = Math.max(points[i][1], points[j][1]);
                if (y0 === y1) continue;
                for (let band = Math.floor((y0 - this.box[1]) / this.size); band <= Math.floor((y1 - this.box[1]) / this.size); band++) {
                    let list = this.bands.get(band);
                    if (!list) this.bands.set(band, list = []);
                    list.push(i, j);
                }
            }
        }
    }
    contains(x, y) {
        const [x0, y0, x1, y1] = this.box;
        if (x < x0 || x > x1 || y < y0 || y > y1) return false;
        if (!this.bands) return insideRing(x, y, this.points);
        const list = this.bands.get(Math.floor((y - y0) / this.size));
        if (!list) return false;
        const points = this.points;
        let inside = false;
        for (let k = 0; k < list.length; k += 2) {
            const [xi, yi] = points[list[k]];
            const [xj, yj] = points[list[k + 1]];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }
}

// Sada kroužků: sudá–lichá (bod uvnitř lichého počtu kroužků)
const NO_RINGS = [];
export class RingSet {
    constructor(rings) {
        this.rings = rings.map(points => new IndexedRing(points));
        // Hrubá mřížka: které kroužky mohou bod obsahovat (tisíce ostrovů, miliony dotazů)
        this.grid = null;
        if (this.rings.length > 12) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const { box } of this.rings) { x0 = Math.min(x0, box[0]); y0 = Math.min(y0, box[1]); x1 = Math.max(x1, box[2]); y1 = Math.max(y1, box[3]); }
            this.origin = [x0, y0];
            this.cell = Math.max((x1 - x0) / 128, (y1 - y0) / 128, 1e-9);
            this.grid = new Map();
            for (const ring of this.rings) {
                for (let cx = Math.floor((ring.box[0] - x0) / this.cell); cx <= Math.floor((ring.box[2] - x0) / this.cell); cx++) {
                    for (let cy = Math.floor((ring.box[1] - y0) / this.cell); cy <= Math.floor((ring.box[3] - y0) / this.cell); cy++) {
                        const key = cx * 1024 + cy;
                        let list = this.grid.get(key);
                        if (!list) this.grid.set(key, list = []);
                        list.push(ring);
                    }
                }
            }
        }
    }
    near(x, y) {
        if (!this.grid) return this.rings;
        return this.grid.get(Math.floor((x - this.origin[0]) / this.cell) * 1024 + Math.floor((y - this.origin[1]) / this.cell)) || NO_RINGS;
    }
    depth(x, y, skip = null) {
        let depth = 0;
        for (const ring of this.near(x, y)) if (ring.points !== skip && ring.contains(x, y)) depth++;
        return depth;
    }
    contains(x, y) { return this.depth(x, y) % 2 === 1; }
    // Nejmenší kroužek, který bod obsahuje (jezero, ostrov)
    smallestAround(x, y) {
        let best = null;
        for (const ring of this.near(x, y)) {
            if (!ring.contains(x, y)) continue;
            const area = ringArea(ring.points);
            if (!best || area < best.area) best = { ring: ring.points, area };
        }
        return best;
    }
}

// Bod jistě uvnitř kroužku: střed nejširšího úseku na vodorovné přímce v polovině výšky (těžiště může ležet mimo)
export const interiorPoint = (ring) => {
    const [, y0, , y1] = bboxOf(ring);
    for (const share of [0.5, 0.37, 0.63, 0.21, 0.79]) {
        const y = y0 + (y1 - y0) * share + 1e-7;
        const xs = [];
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y)) xs.push((xj - xi) * (y - yi) / (yj - yi) + xi);
        }
        xs.sort((a, b) => a - b);
        let best = null;
        for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
        if (best && best[1] > best[0]) return [(best[0] + best[1]) / 2, y];
    }
    return ring[0];
};

// Mřížka úseků: nejbližší úsek k bodu do dané vzdálenosti (úsek nese značku – index čáry, vrstvu…)
export class SegmentIndex {
    constructor(cell = 16) {
        this.cell = cell;
        this.cells = new Map();
        this.count = 0;
    }
    key(cx, cy) { return cx * 100003 + cy; }
    add(ax, ay, bx, by, tag) {
        const segment = [ax, ay, bx, by, tag];
        const c = this.cell;
        const x0 = Math.floor(Math.min(ax, bx) / c), x1 = Math.floor(Math.max(ax, bx) / c);
        const y0 = Math.floor(Math.min(ay, by) / c), y1 = Math.floor(Math.max(ay, by) / c);
        for (let cx = x0; cx <= x1; cx++) {
            for (let cy = y0; cy <= y1; cy++) {
                const key = this.key(cx, cy);
                let list = this.cells.get(key);
                if (!list) this.cells.set(key, list = []);
                list.push(segment);
            }
        }
        this.count++;
    }
    addLine(points, closed, tag) {
        for (let i = 1; i < points.length; i++) this.add(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], tag);
        if (closed && points.length > 2) this.add(points[points.length - 1][0], points[points.length - 1][1], points[0][0], points[0][1], tag);
    }
    // { distance, tag, x, y } nejbližšího úseku do max (filter(tag, segment) vybere, které úseky se počítají), jinak null
    nearest(x, y, max, filter = null) {
        const c = this.cell;
        const x0 = Math.floor((x - max) / c), x1 = Math.floor((x + max) / c);
        const y0 = Math.floor((y - max) / c), y1 = Math.floor((y + max) / c);
        let best = null;
        for (let cx = x0; cx <= x1; cx++) {
            for (let cy = y0; cy <= y1; cy++) {
                const list = this.cells.get(this.key(cx, cy));
                if (!list) continue;
                for (const segment of list) {
                    if (filter && !filter(segment[4], segment)) continue;
                    const [ax, ay, bx, by] = segment;
                    const dx = bx - ax, dy = by - ay;
                    const length = dx * dx + dy * dy;
                    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
                    const px = ax + t * dx, py = ay + t * dy;
                    const distance = Math.hypot(px - x, py - y);
                    if (distance <= max && (!best || distance < best.distance)) best = { distance, tag: segment[4], x: px, y: py };
                }
            }
        }
        return best;
    }
}

// Protínají se úsečky ab a cd uvnitř (ne jen dotyk v koncovém bodě)?
export const segmentsCross = (a, b, c, d) => {
    const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};
// Počet křížení kroužku se sebou samým (nesousední úseky)
export const selfCrossings = (ring, closed = true) => {
    const n = ring.length;
    const count = closed ? n : n - 1;
    let crossings = 0;
    for (let i = 0; i < count; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        for (let j = i + 2; j < count; j++) {
            if (closed && i === 0 && j === count - 1) continue;
            if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) crossings++;
        }
    }
    return crossings;
};

// --- Zeměpisné souřadnice [šířka, délka] ------------------------------------------------------------------------------

export const haversineKm = (a, b) => {
    const dLat = (b[0] - a[0]) * RAD;
    const dLon = (b[1] - a[1]) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};
export const lineKm = (line) => line.reduce((sum, point, i) => (i ? sum + haversineKm(line[i - 1], point) : 0), 0);

// Rozloha kroužku na kouli v km² (kroužek [šířka, délka], délka souvislá i přes 180. poledník)
export const sphericalKm2 = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[i][1] - ring[j][1]) * RAD * (2 + Math.sin(ring[j][0] * RAD) + Math.sin(ring[i][0] * RAD));
    }
    return Math.abs(sum * EARTH_KM * EARTH_KM / 2);
};

// Bod [šířka, délka] v kroužcích sudá–lichá (délka bodu se posune ke kroužku, kroužky přes 180. poledník jsou souvislé)
export const insideGeoRings = (rings, lat, lon) => {
    let inside = false;
    for (const ring of rings) {
        const shift = Math.round((ring[0][1] - lon) / 360) * 360;
        const x = lon + shift;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [yi, xi] = ring[i];
            const [yj, xj] = ring[j];
            if ((yi > lat) !== (yj > lat) && x < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
        }
    }
    return inside;
};

// Rozloha obrysu sudá–lichá: kroužek uvnitř lichého počtu jiných je díra (odečte se)
export const shapeKm2 = (rings) => {
    let total = 0;
    for (const ring of rings) {
        const others = rings.filter(other => other !== ring);
        const hole = insideGeoRings(others, ring[0][0], ring[0][1]);
        total += (hole ? -1 : 1) * sphericalKm2(ring);
    }
    return Math.max(0, total);
};

export const geoBox = (rings) => {
    let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
    for (const ring of rings) for (const [lat, lon] of ring) { if (lat < lat0) lat0 = lat; if (lat > lat1) lat1 = lat; if (lon < lon0) lon0 = lon; if (lon > lon1) lon1 = lon; }
    return { lat0, lat1, lon0, lon1 };
};
export const boxDiagonalKm = (box) => haversineKm([box.lat0, box.lon0], [box.lat1, Math.min(box.lon1, box.lon0 + 359.9)]);

// Body rovnoměrně uvnitř obrysu (mřížka přes obdélník, kolem `wanted` bodů); u malého obrysu aspoň jeho těžiště
export const samplesInside = (rings, wanted = 150) => {
    const box = geoBox(rings);
    const height = box.lat1 - box.lat0;
    const width = box.lon1 - box.lon0;
    if (!(height > 0) || !(width > 0)) return [];
    const samples = [];
    for (let side = Math.ceil(Math.sqrt(wanted)); side <= 96 && samples.length < wanted / 3; side *= 2) {
        samples.length = 0;
        for (let i = 0; i < side; i++) {
            for (let k = 0; k < side; k++) {
                const lat = box.lat0 + (i + 0.5) / side * height;
                const lon = box.lon0 + (k + 0.5) / side * width;
                if (insideGeoRings(rings, lat, lon)) samples.push([lat, lon]);
            }
        }
    }
    return samples;
};

// Vzdálenost bodu od lomené čáry / okraje kroužků v km (rovinně kolem bodu)
export const distanceToLinesKm = (lines, lat, lon, closed = false) => {
    const cos = Math.max(0.05, Math.cos(lat * RAD));
    const K = Math.PI * EARTH_KM / 180;
    let best = Infinity;
    for (const line of lines) {
        const local = line.map(([la, lo]) => { let d = lo - lon; d -= Math.round(d / 360) * 360; return [d * cos * K, (la - lat) * K]; });
        for (let i = closed ? 0 : 1, j = closed ? local.length - 1 : 0; i < local.length; j = i++) {
            const [xi, yi] = local[i];
            const [xj, yj] = local[j];
            const dx = xi - xj, dy = yi - yj;
            const length = dx * dx + dy * dy;
            const t = length ? Math.max(0, Math.min(1, -(xj * dx + yj * dy) / length)) : 0;
            const km = Math.hypot(xj + t * dx, yj + t * dy);
            if (km < best) best = km;
        }
    }
    return best;
};

// Souvislé skupiny čar řeky: dvě čáry patří k sobě, když se některý konec jedné blíží k druhé do gapKm.
// Vrací { components, gapKm } – počet skupin a největší mezera mezi skupinou a zbytkem řeky.
export const lineComponents = (lines, joinKm = 5) => {
    const n = lines.length;
    if (n <= 1) return { components: n, gapKm: 0 };
    const parent = lines.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const near = Array.from({ length: n }, () => new Array(n).fill(Infinity));
    for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
            if (a === b) continue;
            const ends = [lines[a][0], lines[a][lines[a].length - 1]];
            const km = Math.min(...ends.map(([lat, lon]) => distanceToLinesKm([lines[b]], lat, lon)));
            near[a][b] = Math.min(near[a][b], km);
            near[b][a] = Math.min(near[b][a], km);
        }
    }
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (near[a][b] <= joinKm) parent[find(a)] = find(b);
    const groups = new Map();
    for (let i = 0; i < n; i++) { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(i); }
    let gapKm = 0;
    if (groups.size > 1) {
        for (const members of groups.values()) {
            let nearest = Infinity;
            for (const a of members) for (let b = 0; b < n; b++) if (!members.includes(b)) nearest = Math.min(nearest, near[a][b]);
            gapKm = Math.max(gapKm, nearest);
        }
    }
    return { components: groups.size, gapKm };
};
