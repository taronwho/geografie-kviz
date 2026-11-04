// Připraví obrysy států pro slepou mapu: data/world.json (Natural Earth 1:110m přes world-atlas, volné dílo)
// Spuštění: npm run build:world
import { writeFileSync, mkdirSync } from 'node:fs';

const SOURCE = 'https://unpkg.com/world-atlas@2.0.2/countries-110m.json';

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Stažení ${SOURCE} selhalo: HTTP ${response.status}`);
const topology = await response.json();

// Dekódování TopoJSON: oblouky jsou kvantované a zapsané rozdílově
const { scale, translate } = topology.transform;
const arcs = topology.arcs.map(arc => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
});
const arcPoints = (index) => index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
const ring = (indexes) => indexes.flatMap((index, i) => (i === 0 ? arcPoints(index) : arcPoints(index).slice(1)));

// Body v desetinách stupně jako celá čísla, ploše za sebou: [lon, lat, lon, lat, …]
const encodeRing = (points) => points.flatMap(([lon, lat]) => [Math.round(lon * 10), Math.round(lat * 10)]);

const countries = topology.objects.countries.geometries
    .filter(geometry => geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
    .map(geometry => {
        const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
        return { id: geometry.id || '', r: polygons.flatMap(polygon => polygon.map(indexes => encodeRing(ring(indexes)))) };
    });

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/world.json', import.meta.url), JSON.stringify({ source: 'Natural Earth 1:110m (world-atlas 2.0.2)', countries }));
console.log(`world.json: ${countries.length} států`);
