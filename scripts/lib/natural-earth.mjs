// Společné pomocníky pro mapy z Natural Earth (build-mapa.mjs, build-regiony.mjs): stažení vrstvy, rozbor geometrie,
// zjednodušení a ořez
import { cached } from './wikidata.mjs';

const NATURAL_EARTH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson';
export const layer = (name) => cached(`natural-earth-${name}`, async () => {
    const response = await fetch(`${NATURAL_EARTH}/${name}.geojson`);
    if (!response.ok) throw new Error(`Stažení ${name} selhalo: HTTP ${response.status}`);
    return response.json();
});

export const polygonsOf = (geometry) => !geometry ? [] : geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
export const linesOf = (geometry) => !geometry ? [] : geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];

// Přibližná rozloha prstence v km² (pro výběr jezer)
export const ringKm2 = (ring) => {
    let sum = 0;
    const lat = ring.reduce((total, point) => total + point[1], 0) / ring.length;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    return Math.abs(sum / 2) * 111.32 * 111.32 * Math.cos(lat * Math.PI / 180);
};
export const planarArea = (points) => {
    let sum = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) sum += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1]);
    return Math.abs(sum / 2);
};

// Douglas–Peucker; keep = body, které musí zůstat (švy na 180. poledníku)
export const simplify = (points, tolerance, keep = () => false) => {
    if (points.length <= 2) return points;
    const marked = new Uint8Array(points.length);
    marked[0] = 1;
    marked[points.length - 1] = 1;
    points.forEach((point, index) => { if (keep(point)) marked[index] = 1; });
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [first, last] = stack.pop();
        const [ax, ay] = points[first];
        const [bx, by] = points[last];
        const dx = bx - ax, dy = by - ay;
        const length = Math.hypot(dx, dy);
        let worst = -1, index = -1;
        for (let i = first + 1; i < last; i++) {
            const [px, py] = points[i];
            const distance = length ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length : Math.hypot(px - ax, py - ay);
            if (marked[i]) { stack.push([first, i], [i, last]); worst = -2; break; }
            if (distance > worst) { worst = distance; index = i; }
        }
        if (worst === -2) continue;
        if (worst > tolerance) { marked[index] = 1; stack.push([first, index], [index, last]); }
    }
    return points.filter((_, i) => marked[i]);
};

// Ořez mnohoúhelníku obdélníkem (Sutherland–Hodgman); body nesou příznak švu (průsečík leží na švu, jen když oba konce)
export const clipPolygon = (points, box) => {
    const edges = [
        [p => p[0] >= box.x0, 'x', box.x0],
        [p => p[0] <= box.x1, 'x', box.x1],
        [p => p[1] >= box.y0, 'y', box.y0],
        [p => p[1] <= box.y1, 'y', box.y1]
    ];
    let output = points;
    for (const [inside, axis, value] of edges) {
        const input = output;
        output = [];
        if (!input.length) break;
        for (let i = 0; i < input.length; i++) {
            const current = input[i];
            const previous = input[(i + input.length - 1) % input.length];
            const cross = () => {
                const t = axis === 'x' ? (value - previous[0]) / (current[0] - previous[0]) : (value - previous[1]) / (current[1] - previous[1]);
                const point = [previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t];
                point.seam = Boolean(previous.seam && current.seam);
                return point;
            };
            if (inside(current)) {
                if (!inside(previous)) output.push(cross());
                output.push(current);
            } else if (inside(previous)) output.push(cross());
        }
    }
    return output;
};

// Ořez lomené čáry obdélníkem (Liang–Barsky po úsecích) – vrací souvislé kusy uvnitř
export const clipLine = (points, box) => {
    const pieces = [];
    let piece = [];
    const flush = () => { if (piece.length > 1) pieces.push(piece); piece = []; };
    for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        const dx = x1 - x0, dy = y1 - y0;
        let t0 = 0, t1 = 1, visible = true;
        for (const [p, q] of [[-dx, x0 - box.x0], [dx, box.x1 - x0], [-dy, y0 - box.y0], [dy, box.y1 - y0]]) {
            if (p === 0) { if (q < 0) { visible = false; break; } continue; }
            const t = q / p;
            if (p < 0) { if (t > t1) { visible = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { visible = false; break; } if (t < t1) t1 = t; }
        }
        if (!visible) { flush(); continue; }
        const start = [x0 + dx * t0, y0 + dy * t0];
        const end = [x0 + dx * t1, y0 + dy * t1];
        if (!piece.length) piece.push(start);
        piece.push(end);
        if (t1 < 1) flush();
    }
    flush();
    return pieces;
};
