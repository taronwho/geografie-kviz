// Mapy pro otázku „Ukaž na mapě“: data/mapa.json z Natural Earth (volné dílo). Svět (pevnina, jezera a hranice států 1:50m,
// zobrazení Equal Earth, šířka 8000 jednotek) a Česko (hranice 1:10m, kraje a hlavní řeky, Lambertovo azimutální zobrazení,
// 1000 jednotek). Mapy z question-map.js (MAP_REGIONS) mají cesty SVG už v souřadnicích své mapy, zjednodušené a oříznuté
// s rezervou za okrajem výřezu (na vysokém displeji je vidět víc než výřez). Žádné popisky – mapa nesmí prozradit názvy.
// Spuštění: npm run build:mapa (s BUILD_CACHE=složka se stažené vrstvy uloží a další běh je nestahuje)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { layer, polygonsOf, linesOf, ringKm2, planarArea, simplify, clipPolygon, clipLine } from './lib/natural-earth.mjs';

const require = createRequire(import.meta.url);
const MapQuestion = require('../question-map.js');

// Zjednodušení (Douglas–Peucker) v jednotkách mapy (svět: jednotka asi 4,5 km, Česko asi 0,5 km)
const TOLERANCE = 0.5;
const CZECH_TOLERANCE = 0.35;
// Jezera od této rozlohy (km²) – menší by na mapě kontinentu byla jen tečka
const MIN_LAKE_KM2 = 800;
// Pevnina menší než tolik čtverečních jednotek se vynechá (ostrůvek pod pixel)
const MIN_RING_AREA = 0.6;
// Poměr stran mapy na displeji (šířka/výška), pro který musí data stačit i mimo výřez
const ASPECT_RANGE = [0.55, 2.2];
// Hlavní řeky na mapě Česka (Natural Earth 1:10m: hlavní řeky a doplněk pro Evropu)
const CZECH_RIVERS = { ne_10m_rivers_lake_centerlines: ['Vltava', 'Elbe', 'Oder', 'Morava', 'Donau'], ne_10m_rivers_europe: ['Eger', 'Sázava', 'Dyje'] };

const SEAM = 179.9999;
const onSeam = ([lon]) => Math.abs(lon) >= SEAM;

// Zápis cesty SVG: první bod absolutně, další relativně, celá čísla (záporné číslo nepotřebuje mezeru)
const join = (numbers) => numbers.map((n, i) => (i > 0 && n >= 0 ? ' ' : '') + n).join('');
const roundPoints = (points) => {
    const rounded = [];
    for (const source of points) {
        const point = [Math.round(source[0]), Math.round(source[1])];
        point.seam = Boolean(source.seam);
        const last = rounded[rounded.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) rounded.push(point);
        else last.seam = last.seam || point.seam;
    }
    return rounded;
};
const encode = (points, closed) => {
    if (points.length < 2) return '';
    const deltas = [];
    for (let i = 1; i < points.length; i++) deltas.push(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return `M${join(points[0])}l${join(deltas)}${closed ? 'z' : ''}`;
};

const buildRegion = (region, sources) => {
    const frame = MapQuestion.frameOf(region);
    const { angle } = MapQuestion.projectionOf(region);
    const detail = Boolean(region.detail);
    const tolerance = detail ? CZECH_TOLERANCE : TOLERANCE;
    const padX = Math.max(0, (frame.height * ASPECT_RANGE[1] - frame.width) / 2) + 24;
    const padY = Math.max(0, (frame.width / ASPECT_RANGE[0] - frame.height) / 2) + 24;
    const box = { x0: -padX, y0: -padY, x1: frame.width + padX, y1: frame.height + padY };
    const project = (ring) => {
        // Jen to, co je na přivrácené straně Země (dál od středu by zobrazení body roztahovalo)
        if (ring.every(([lon, lat]) => angle(lat, lon) > 100) || ring.some(([lon, lat]) => angle(lat, lon) > 175)) return null;
        return ring.map(point => { const projected = frame.toMap(point[1], point[0]); projected.seam = onSeam(point); return projected; });
    };
    const rings = (polygons, ringTolerance = tolerance) => {
        const plain = [];
        const seam = [];
        const seamStroke = [];
        for (const polygon of polygons) {
            for (const ring of polygon) {
                const projected = project(ring);
                if (!projected) continue;
                const clipped = clipPolygon(projected.slice(0, -1), box);
                if (clipped.length < 3) continue;
                const simplified = roundPoints(simplify([...clipped, clipped[0]], ringTolerance, point => point.seam));
                if (simplified.length < 4 || planarArea(simplified) < MIN_RING_AREA) continue;
                const closed = simplified.slice(0, -1);
                // Šev na 180. poledníku (Fidži, Čukotka): výplň bez obrysu, obrys zvlášť bez úseků podél švu
                const seamEdge = (i) => closed[i].seam && closed[(i + 1) % closed.length].seam;
                if (!closed.some((_, i) => seamEdge(i))) { plain.push(encode(closed, true)); continue; }
                seam.push(encode(closed, true));
                // Obrys začne hned za úsekem švu, ať se kus podél pobřeží nerozdělí
                const start = (closed.findIndex((_, i) => seamEdge(i)) + 1) % closed.length;
                let piece = [closed[start]];
                for (let step = 0; step < closed.length; step++) {
                    const i = (start + step) % closed.length;
                    const next = closed[(i + 1) % closed.length];
                    if (seamEdge(i)) {
                        if (piece.length > 1) seamStroke.push(encode(piece, false));
                        piece = [next];
                    } else piece.push(next);
                }
                if (piece.length > 1) seamStroke.push(encode(piece, false));
            }
        }
        return { plain: plain.join(''), seam: seam.join(''), seamStroke: seamStroke.join('') };
    };
    const lines = (list, lineTolerance = tolerance) => {
        const paths = [];
        for (const line of list) {
            const projected = project(line);
            if (!projected) continue;
            for (const piece of clipLine(projected, box)) {
                const points = roundPoints(simplify(piece, lineTolerance));
                if (points.length > 1) paths.push(encode(points, false));
            }
        }
        return paths.join('');
    };

    const land = rings(sources.land);
    const layers = { land: land.plain };
    if (land.seam) Object.assign(layers, { seam: land.seam, seamCoast: land.seamStroke });
    if (!detail) {
        const lakes = rings(sources.lakes);
        if (lakes.plain || lakes.seam) layers.lakes = lakes.plain + lakes.seam;
        layers.borders = lines(sources.borders);
    } else {
        layers.borders = lines(sources.czechBorders);
        layers.rivers = lines(sources.czechRivers, tolerance * 1.5);
        layers.inner = lines(sources.krajeInner);
        const home = rings([[sources.czechOutline]]);
        layers.home = home.plain;
    }
    // Plochy pro „Tvůj tip: Thajsko“ (kam hráč klepl): státy světa, v Česku kraje; hrubší obrys stačí
    const areas = (detail ? sources.kraje : sources.countries).map(({ name, polygons }) => {
        const shape = rings(polygons, tolerance * (detail ? 2 : 3));
        return { n: name, d: shape.plain + shape.seam };
    }).filter(area => area.d);
    return {
        center: region.center,
        frame: [frame.width, frame.height],
        layers: Object.fromEntries(Object.entries(layers).filter(([, value]) => value)),
        areas
    };
};

// Kraje: hranice mezi kraji (úsek ve dvou krajích) a obrys Česka (úsek jen v jednom kraji) z jednoho souboru krajů
const krajeTopology = (features) => {
    const key = ([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`;
    const edges = new Map();
    for (const feature of features) {
        for (const polygon of polygonsOf(feature.geometry)) {
            for (const ring of polygon) {
                for (let i = 1; i < ring.length; i++) {
                    const a = key(ring[i - 1]);
                    const b = key(ring[i]);
                    if (a === b) continue;
                    const id = a < b ? `${a}|${b}` : `${b}|${a}`;
                    const edge = edges.get(id) || { a, b, count: 0 };
                    edge.count++;
                    edges.set(id, edge);
                }
            }
        }
    }
    const point = (text) => text.split(',').map(Number);
    const chains = (selected) => {
        const adjacency = new Map();
        for (const edge of selected) {
            for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
                if (!adjacency.has(from)) adjacency.set(from, []);
                adjacency.get(from).push({ to, edge });
            }
        }
        const used = new Set();
        const result = [];
        const walk = (start, first) => {
            const line = [start];
            let current = start;
            let step = first;
            while (step && !used.has(step.edge)) {
                used.add(step.edge);
                current = step.to;
                line.push(current);
                const next = (adjacency.get(current) || []).filter(candidate => !used.has(candidate.edge));
                step = adjacency.get(current).length === 2 ? next[0] : null;
            }
            return line.map(point);
        };
        // Nejdřív od uzlů (kde se stýkají tři kraje), pak uzavřené smyčky (Praha uprostřed Středočeského kraje)
        for (const [node, list] of adjacency) if (list.length !== 2) for (const step of list) if (!used.has(step.edge)) result.push(walk(node, step));
        for (const [node, list] of adjacency) for (const step of list) if (!used.has(step.edge)) result.push(walk(node, step));
        return result;
    };
    const all = [...edges.values()];
    const inner = chains(all.filter(edge => edge.count >= 2));
    const outline = chains(all.filter(edge => edge.count === 1)).sort((a, b) => b.length - a.length)[0];
    return { inner, outline };
};

const [land, lakes, borders50, borders10, admin1, riversMain, riversEurope, countries50] = await Promise.all([
    layer('ne_50m_land'), layer('ne_50m_lakes'), layer('ne_50m_admin_0_boundary_lines_land'), layer('ne_10m_admin_0_boundary_lines_land'),
    layer('ne_10m_admin_1_states_provinces'), layer('ne_10m_rivers_lake_centerlines'), layer('ne_10m_rivers_europe'), layer('ne_50m_admin_0_countries')
]);
const kraje = admin1.features.filter(feature => feature.properties.adm0_a3 === 'CZE');
if (kraje.length !== 14) throw new Error(`Čekám 14 krajů Česka, je jich ${kraje.length}`);
const topology = krajeTopology(kraje);
const riverLines = (data, names) => data.features.filter(feature => names.includes(feature.properties.name)).flatMap(feature => linesOf(feature.geometry));
// Česká jména států z data/countries.json (podle Wikidat), závislá území a sporná místa doplněná zde
const COUNTRY_NAMES = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8')).countries).map(([qid, country]) => [qid, country.name]));
const TERRITORY_NAMES = {
    Q11703: 'Americké Panenské ostrovy', Q1183: 'Portoriko', Q126125: 'Svatý Martin', Q129003: 'Francouzská jižní a antarktická území',
    Q131198: 'Heardův ostrov a McDonaldovy ostrovy', Q13353: 'Montserrat', Q133888: 'Ashmorův a Cartierův ostrov', Q14773: 'Macao', Q16635: 'Guam',
    Q16641: 'Americká Samoa', Q16644: 'Severní Mariany', Q18221: 'Turks a Caicos', Q21203: 'Aruba', Q223: 'Grónsko', Q23635: 'Bermudy',
    Q23681: 'Severní Kypr', Q23792: 'Palestina', Q25228: 'Anguilla', Q25230: 'Guernsey', Q25279: 'Curaçao', Q25305: 'Britské Panenské ostrovy',
    Q25362: 'Svatý Bartoloměj', Q26273: 'Svatý Martin', Q26988: 'Cookovy ostrovy', Q30971: 'Francouzská Polynésie', Q31057: 'Norfolk',
    Q333946: 'Siačen', Q33788: 'Nová Kaledonie', Q34020: 'Niue', Q34497: 'Svatá Helena', Q34617: 'Saint Pierre a Miquelon', Q34754: 'Somaliland',
    Q35086: 'Jižní Georgie a Jižní Sandwichovy ostrovy', Q35555: 'Wallis a Futuna', Q35672: 'Pitcairnovy ostrovy', Q43448: 'Britské indickooceánské území',
    Q4628: 'Faerské ostrovy', Q51: 'Antarktida', Q5689: 'Alandy', Q5785: 'Kajmanské ostrovy', Q6250: 'Západní Sahara', Q8646: 'Hongkong',
    Q9648: 'Falklandy', Q9676: 'Ostrov Man', Q785: 'Jersey', Q4824275: 'Australská území v Indickém oceánu'
};
const countryName = (properties) => COUNTRY_NAMES[properties.WIKIDATAID] || TERRITORY_NAMES[properties.WIKIDATAID];
const missingNames = countries50.features.filter(feature => !countryName(feature.properties)).map(feature => feature.properties.NAME);
if (missingNames.length) throw new Error(`Chybí české jméno státu: ${missingNames.join(', ')}`);
const KRAJ_NAMES = { Prague: 'Praha', Vysočina: 'Kraj Vysočina' };
const sources = {
    land: land.features.flatMap(feature => polygonsOf(feature.geometry)),
    lakes: lakes.features.flatMap(feature => polygonsOf(feature.geometry)).filter(polygon => ringKm2(polygon[0]) >= MIN_LAKE_KM2),
    borders: borders50.features.flatMap(feature => linesOf(feature.geometry)),
    czechBorders: borders10.features.flatMap(feature => linesOf(feature.geometry)),
    czechRivers: [...riverLines(riversMain, CZECH_RIVERS.ne_10m_rivers_lake_centerlines), ...riverLines(riversEurope, CZECH_RIVERS.ne_10m_rivers_europe)],
    countries: countries50.features.map(feature => ({ name: countryName(feature.properties), polygons: polygonsOf(feature.geometry) })),
    kraje: kraje.map(feature => ({ name: KRAJ_NAMES[feature.properties.name] || `${feature.properties.name} kraj`, polygons: polygonsOf(feature.geometry) })),
    krajeInner: topology.inner,
    czechOutline: topology.outline
};

const regions = {};
for (const region of MapQuestion.MAP_REGIONS) {
    regions[region.id] = buildRegion(region, sources);
    const size = [...Object.values(regions[region.id].layers), ...regions[region.id].areas.map(area => area.d)].reduce((total, path) => total + path.length, 0);
    console.log(`  ${region.id}: ${Math.round(size / 1024)} kB (${Object.keys(regions[region.id].layers).join(', ')})`);
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/mapa.json', import.meta.url), JSON.stringify({
    source: 'Natural Earth 5.1.2 (volné dílo): svět – pevnina, jezera a hranice 1:50m; Česko – hranice, kraje a řeky 1:10m',
    generated: new Date().toISOString().slice(0, 10),
    regions
}));
console.log('mapa.json: hotovo');
