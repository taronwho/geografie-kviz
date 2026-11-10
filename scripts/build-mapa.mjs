// Mapy pro otázku „Ukaž na mapě“: data/mapa.json z Natural Earth (volné dílo). Svět (pevnina, jezera a hranice států 1:50m,
// Mercatorovo zobrazení, šířka 8000 jednotek) a Česko (hranice 1:10m, kraje a hlavní řeky, Lambertovo azimutální zobrazení,
// 1000 jednotek). Mapy z question-map.js (MAP_REGIONS) mají cesty SVG už v souřadnicích své mapy, zjednodušené a oříznuté
// s rezervou za okrajem výřezu (na vysokém displeji je vidět víc než výřez). Žádné popisky – mapa nesmí prozradit názvy.
// Mapa světa navíc kreslí to, na co se hra ptá a co vrstva 1:50m nemá (z vrstev 1:10m): malé ostrovy z položek otázek
// (Lošinj, Aigina, Capri…), jezera z položek otázek (Balaton, Ženevské, Bodamské, Gardské…) a nejmenší ostrovní státy.
// Hranice končí na nakresleném pobřeží (žádné čáry v moři) a plochy států odpovídají státům ve hře (Somálsko se
// Somalilandem, Kypr se severem). Proto se mapa sestavuje až po datech témat (data/zemepis.json a další).
// Kontrola výsledku: npm run audit:mapa (scripts/audit-mapa.mjs).
// Spuštění: npm run build:mapa (s BUILD_CACHE=složka se stažené vrstvy uloží a další běh je nestahuje)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { layer, polygonsOf, linesOf, ringKm2, planarArea, simplify, clipPolygon, clipLine } from './lib/natural-earth.mjs';
import { dissolve, runsBetween, ringPath, trimToLand, landTester, pickIslands, interiorPoint, RingSet, SegmentIndex } from './lib/mapa-podklad.mjs';

const require = createRequire(import.meta.url);
const MapQuestion = require('../question-map.js');

// Zjednodušení (Douglas–Peucker) v jednotkách mapy (svět: jednotka asi 5 km na rovníku, Česko asi 0,5 km)
const TOLERANCE = 0.5;
const CZECH_TOLERANCE = 0.35;
// Jezera od této rozlohy (km²) – menší by na mapě kontinentu byla jen tečka; jezera, na která se hra ptá, i menší
const MIN_LAKE_KM2 = 450;
const MIN_ASKED_LAKE_KM2 = 20;
// Pevnina menší než tolik čtverečních jednotek se vynechá (ostrůvek pod pixel)
const MIN_RING_AREA = 0.6;
// Ostrov, který by zjednodušením zanikl, zůstane jako nejmenší trojúhelník (půl čtvereční jednotky, u plochy státu
// čtverec): u vrstvy 1:50m od této rozlohy (km²), u ostrovů a států z položek otázek vždy
const KEEP_ISLAND_KM2 = 4;
// Ostrovy a jezera z položek otázek (vrstvy 1:10m): jemnější zjednodušení a menší nejmenší plocha; ostrov nejvýš této
// rozlohy (větší má i vrstva 1:50m)
const FINE_TOLERANCE = 0.3;
const FINE_RING_AREA = 0.45;
const MAX_ISLAND_KM2 = 3000;
// Plochy států: mnohoúhelník do této rozlohy (km²) se zjednoduší jemně jako pevnina, větší třikrát hruběji
const SMALL_AREA_KM2 = 5000;
// Souostroví z položek otázek: ostrovy v okruhu podle rozlohy souostroví (km), jen souostroví do této rozlohy (km²)
const GROUP_RADIUS_KM = [10, 60];
const MAX_GROUP_KM2 = 3000;
// Konec hranice se dotáhne k pobřeží, když je od něj nejvýš tolik jednotek; dál od břehu než SEA_UNITS je čára v moři
const SNAP_UNITS = 1.5;
const SEA_UNITS = 0.6;
// Státy ve hře, které Natural Earth vede po částech: QID státu → QID částí (plocha se sloučí, hranice mezi nimi se nekreslí)
const MERGED_STATES = { Q1045: ['Q34754'], Q229: ['Q23681'] };
// Hranice, kterou vrstva hranic 1:50m nemá (konec sousední hranice by visel ve vzduchu): Keňa × Jižní Súdán podél
// trojúhelníku Ilemi – doplní se z obvodu státu [QID, odkud, kam] (délka, šířka)
const MISSING_BORDERS = [['Q114', [34.38, 4.62], [35.27, 5.49]]];
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
    // Mnohoúhelníky v jednotkách mapy: [[{ closed, seamEdge, onSeam }, …], …]. keepKm2: vnější kroužek aspoň této
    // rozlohy (km²), který by zjednodušením zanikl, zůstane jako nejmenší trojúhelník (ostrůvek jako tečka)
    const prepare = (polygons, ringTolerance = tolerance, { minArea = MIN_RING_AREA, keepKm2 = Infinity, square = false } = {}) => {
        const result = [];
        for (const polygon of polygons) {
            // Kroužky jednoho mnohoúhelníku (obrys a díry – Kaspické moře je díra v Eurasii) musí zůstat v jedné cestě,
            // jinak by se díra vykreslila jako pevnina: má-li některý kroužek šev, jde do vrstvy se švem celý mnohoúhelník
            const prepared = [];
            polygon.forEach((ring, ringIndex) => {
                const projected = project(ring);
                if (!projected) return;
                const clipped = clipPolygon(projected.slice(0, -1), box);
                if (clipped.length < 3) return;
                let simplified = roundPoints(simplify([...clipped, clipped[0]], ringTolerance, point => point.seam));
                if (simplified.length < 4 || planarArea(simplified) < minArea) {
                    if (ringIndex > 0 || !(ringKm2(ring) >= keepKm2)) return;
                    // Půlka čtverce mřížky, ve které leží těžiště (u ploch států celý čtverec, ať v něm leží i hlavní město)
                    const mx = clipped.reduce((sum, point) => sum + point[0], 0) / clipped.length;
                    const my = clipped.reduce((sum, point) => sum + point[1], 0) / clipped.length;
                    const cx = Math.floor(mx), cy = Math.floor(my);
                    simplified = square ? [[cx, cy], [cx + 1, cy], [cx + 1, cy + 1], [cx, cy + 1], [cx, cy]]
                        : mx - cx + my - cy <= 1 ? [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx, cy]] : [[cx + 1, cy + 1], [cx, cy + 1], [cx + 1, cy], [cx + 1, cy + 1]];
                    simplified.dot = true;
                }
                const closed = simplified.slice(0, -1);
                closed.dot = Boolean(simplified.dot);
                // Šev na 180. poledníku (Fidži, Čukotka): výplň bez obrysu, obrys zvlášť bez úseků podél švu
                const seamEdge = (i) => Boolean(closed[i].seam && closed[(i + 1) % closed.length].seam);
                prepared.push({ closed, seamEdge, onSeam: closed.some((_, i) => seamEdge(i)) });
            });
            if (prepared.length) result.push(prepared);
        }
        return result;
    };
    const emit = (preparedPolygons) => {
        const plain = [];
        const seam = [];
        const seamStroke = [];
        for (const prepared of preparedPolygons) {
            const polygonOnSeam = prepared.some(entry => entry.onSeam);
            for (const { closed, seamEdge, onSeam } of prepared) {
                if (!polygonOnSeam) { plain.push(encode(closed, true)); continue; }
                seam.push(encode(closed, true));
                if (!onSeam) { seamStroke.push(encode(closed, true)); continue; }
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
    const rings = (polygons, ringTolerance, options) => emit(prepare(polygons, ringTolerance, options));
    // Lomené čáry v jednotkách mapy (oříznuté výřezem, zjednodušené, zaokrouhlené)
    const polylines = (list, lineTolerance = tolerance) => {
        const result = [];
        for (const line of list) {
            const projected = project(line);
            if (!projected) continue;
            for (const piece of clipLine(projected, box)) {
                const points = roundPoints(simplify(piece, lineTolerance));
                if (points.length > 1) result.push(points);
            }
        }
        return result;
    };
    const lines = (list, lineTolerance) => polylines(list, lineTolerance).map(points => encode(points, false)).join('');

    const stats = {};
    const coarse = prepare(sources.land, tolerance, { keepKm2: detail ? Infinity : KEEP_ISLAND_KM2 });
    let landPolygons = coarse;
    if (!detail) {
        // Ostrovy z položek otázek (1:10m) jen tam, kde nezasahují do už nakreslené pevniny (pravidlo sudá–lichá by
        // z překryvu udělalo vodu) ani do sebe navzájem; ostrov z 1:50m zmenšený na tečku podrobnější obrys nahradí
        const solid = coarse.filter(polygon => !polygon[0].closed.dot);
        const dots = coarse.filter(polygon => polygon[0].closed.dot);
        const drawnRings = solid.flatMap(polygon => polygon.map(entry => entry.closed));
        const drawn = new RingSet(drawnRings);
        const extra = [];
        // Body kroužku a bod jistě uvnitř něj (stejný ostrov ze dvou vrstev má vrcholy na sobě, ne v sobě)
        const probes = (ring) => [...ring, interiorPoint(ring)];
        const fine = prepare(sources.islands, FINE_TOLERANCE, { minArea: FINE_RING_AREA, keepKm2: 0 });
        // Nejdřív skutečné obrysy, tečky nakonec (tečka nesmí zabrat místo obrysu sousedního ostrova)
        for (const polygon of [...fine.filter(entry => !entry[0].closed.dot), ...fine.filter(entry => entry[0].closed.dot)]) {
            const outer = polygon[0].closed;
            const own = new RingSet([outer]);
            const added = extra.map(entry => entry[0].closed);
            if (probes(outer).some(([x, y]) => drawn.contains(x, y) || added.some(ring => new RingSet([ring]).contains(x, y)))) continue;
            if ([...drawnRings, ...added].some(ring => probes(ring).some(([x, y]) => own.contains(x, y)))) continue;
            extra.push(polygon);
        }
        const extraSet = new RingSet(extra.map(entry => entry[0].closed));
        const keptDots = dots.filter(polygon => !probes(polygon[0].closed).some(([x, y]) => extraSet.contains(x, y)));
        stats.islands = extra.length;
        landPolygons = [...solid, ...keptDots, ...extra];
    }
    const land = emit(landPolygons);
    const layers = { land: land.plain };
    if (land.seam) Object.assign(layers, { seam: land.seam, seamCoast: land.seamStroke });
    if (!detail) {
        const landRings = landPolygons.flatMap(polygon => polygon.map(entry => entry.closed));
        const landSet = new RingSet(landRings);
        const coast = new SegmentIndex(16);
        landRings.forEach(ring => coast.addLine(ring, true, 0));
        // Jezera: jen na nakreslené pevnině
        const lakes = prepare(sources.lakes, FINE_TOLERANCE, { minArea: FINE_RING_AREA }).filter(polygon => polygon[0].closed.some(([x, y]) => landSet.contains(x, y)));
        stats.lakes = lakes.length;
        const lakePaths = emit(lakes);
        if (lakePaths.plain || lakePaths.seam) layers.lakes = lakePaths.plain + lakePaths.seam;
        // Hranice: jen po nakreslené pevnině (čára v moři se vypustí), konec blízko břehu se k němu dotáhne
        const isDry = (x, y) => landSet.contains(x, y) || Boolean(coast.nearest(x, y, SEA_UNITS));
        const pieces = polylines(sources.borders).flatMap(points => trimToLand(points, isDry)).map(roundPoints).filter(points => points.length > 1);
        const junctions = new SegmentIndex(16);
        pieces.forEach((points, index) => junctions.addLine(points, false, index));
        pieces.forEach((points, index) => {
            if (Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 1) return;
            for (const end of [0, points.length - 1]) {
                const [x, y] = points[end];
                if (junctions.nearest(x, y, 0.75, tag => tag !== index)) continue;
                const shore = coast.nearest(x, y, SNAP_UNITS);
                if (!shore || shore.distance < 0.5) continue;
                const snapped = [Math.round(shore.x), Math.round(shore.y)];
                if (snapped[0] === x && snapped[1] === y) continue;
                if (end === 0) points.unshift(snapped); else points.push(snapped);
            }
        });
        stats.borders = pieces.length;
        layers.borders = pieces.map(points => encode(points, false)).join('');
    } else {
        layers.borders = lines(sources.czechBorders);
        layers.rivers = lines(sources.czechRivers, tolerance * 1.5);
        layers.inner = lines(sources.krajeInner);
        const home = rings([[sources.czechOutline]]);
        layers.home = home.plain;
    }
    // Plochy pro „Tvůj tip: Thajsko“ (kam hráč klepl) a obrys státu ve výsledku: státy světa, v Česku kraje; hrubší obrys
    // stačí. Stát nebo ostrov, který by při hrubém zjednodušení zanikl (Monako, Nauru, Maledivy), se vezme jemněji
    // a nejmenší jako trojúhelník; menší plochy jsou první, ať se v enklávě najde vnitřní stát (Vatikán, ne Itálie).
    const areas = (detail ? sources.kraje : sources.countries).map(({ name, polygons }) => {
        // Malý stát nebo ostrov (do SMALL_AREA_KM2) stejně podrobně jako pevnina, ať zvýrazněný obrys sedí s mapou
        const coarseArea = (polygon) => prepare([polygon], tolerance * (detail ? 2 : ringKm2(polygon[0]) < SMALL_AREA_KM2 ? 1 : 3));
        const fineArea = (polygon, keepKm2) => prepare([polygon], FINE_TOLERANCE, { minArea: FINE_RING_AREA, keepKm2, square: true });
        let prepared = polygons.flatMap(polygon => { const kept = coarseArea(polygon); return kept.length || detail ? kept : fineArea(polygon, KEEP_ISLAND_KM2); });
        if (!detail && !prepared.length) prepared = polygons.flatMap(polygon => fineArea(polygon, 0));
        const shape = emit(prepared);
        const size = prepared.reduce((sum, polygon) => sum + planarArea(polygon[0].closed), 0);
        return { n: name, d: shape.plain + shape.seam, size };
    }).filter(area => area.d);
    if (!detail) {
        areas.sort((a, b) => a.size - b.size);
        console.log(`  svět: ${stats.islands} ostrovů z položek otázek, ${stats.lakes} jezer, ${stats.borders} úseků hranic, ${areas.length} ploch států`);
    }
    return {
        center: region.center,
        frame: [frame.width, frame.height],
        layers: Object.fromEntries(Object.entries(layers).filter(([, value]) => value)),
        areas: areas.map(({ n, d }) => ({ n, d }))
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

const [land, lakes, borders50, borders10, admin1, riversMain, riversEurope, countries50, land10, minor10, lakes10, lakes10europe, lakes10america] = await Promise.all([
    layer('ne_50m_land'), layer('ne_50m_lakes'), layer('ne_50m_admin_0_boundary_lines_land'), layer('ne_10m_admin_0_boundary_lines_land'),
    layer('ne_10m_admin_1_states_provinces'), layer('ne_10m_rivers_lake_centerlines'), layer('ne_10m_rivers_europe'), layer('ne_50m_admin_0_countries'),
    layer('ne_10m_land'), layer('ne_10m_minor_islands'), layer('ne_10m_lakes'), layer('ne_10m_lakes_europe'), layer('ne_10m_lakes_north_america')
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
    // Palestinská území pod jménem státu ze hry (Stát Palestina), ať se obrys státu ve výsledku vezme z podkladové mapy
    Q23681: 'Severní Kypr', Q23792: COUNTRY_NAMES.Q219060 || 'Palestina', Q25228: 'Anguilla', Q25230: 'Guernsey', Q25279: 'Curaçao', Q25305: 'Britské Panenské ostrovy',
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

// Plochy států: stát vedený po částech se sloučí do jedné plochy bez vnitřní hranice
const featureOf = (qid) => countries50.features.find(feature => feature.properties.WIKIDATAID === qid);
const mergedParts = new Set(Object.values(MERGED_STATES).flat());
const countryAreas = countries50.features.filter(feature => !mergedParts.has(feature.properties.WIKIDATAID)).map(feature => {
    const parts = (MERGED_STATES[feature.properties.WIKIDATAID] || []).map(featureOf).filter(Boolean);
    const polygons = polygonsOf(feature.geometry);
    if (!parts.length) return { name: countryName(feature.properties), polygons };
    const merged = dissolve([...polygons, ...parts.flatMap(part => polygonsOf(part.geometry))].flat());
    return { name: countryName(feature.properties), polygons: [merged] };
});
// Hranice států: bez čar mezi částmi sloučeného státu, s doplněnými úseky, které vrstva hranic nemá
let borderLines = borders50.features.flatMap(feature => linesOf(feature.geometry));
for (const [qid, parts] of Object.entries(MERGED_STATES)) {
    const main = polygonsOf(featureOf(qid).geometry).map(polygon => polygon[0]);
    const rest = parts.map(featureOf).filter(Boolean).flatMap(part => polygonsOf(part.geometry).map(polygon => polygon[0]));
    const before = borderLines.length;
    borderLines = borderLines.filter(line => !runsBetween(line, main, rest));
    console.log(`  ${countryName(featureOf(qid).properties)}: ${before - borderLines.length} vnitřních hranic vypuštěno`);
}
for (const [qid, from, to] of MISSING_BORDERS) {
    const distance = (ring, [x, y]) => Math.min(...ring.map(point => Math.hypot(point[0] - x, point[1] - y)));
    const ring = polygonsOf(featureOf(qid).geometry).map(polygon => polygon[0]).sort((a, b) => distance(a, from) - distance(b, from))[0];
    if (distance(ring, from) > 0.05 || distance(ring, to) > 0.05) throw new Error(`Doplněná hranice ${qid}: obvod státu u ${from} nebo ${to} nenalezen`);
    borderLines.push(ringPath(ring, from, to));
}

// Položky otázek: ostrovy a místa na ostrovech, která vrstva 1:50m nemá, a jezera (podle QID)
const landPolygons = land.features.flatMap(feature => polygonsOf(feature.geometry));
const onCoarseLand = landTester(landPolygons);
const places = [];
const askedLakes = new Map();
for (const topicId of MapQuestion.MAP_TOPICS) {
    const { items } = JSON.parse(readFileSync(new URL(`../data/${topicId}.json`, import.meta.url), 'utf8'));
    for (const item of items) {
        const rule = (MapQuestion.KINDS[topicId] || {})[item.c];
        if (!(rule === true || (Array.isArray(rule) && rule.includes(item.ty))) || !Number.isFinite(item.la) || !Number.isFinite(item.lo)) continue;
        const group = MapQuestion.groupOf(item);
        if (!group) continue;
        if (group.id === 'jezera') { askedLakes.set(item.q, { lat: item.la, lon: item.lo }); continue; }
        if (['more', 'reky', 'pohori', 'regiony', 'staty'].includes(group.id) || (item.co || []).includes('Q213')) continue;
        if (item.ty === 'souostroví') {
            const area = (item.f || {}).area;
            if (!(area > 0 && area <= MAX_GROUP_KM2)) continue;
            places.push({ lat: item.la, lon: item.lo, radiusKm: Math.max(GROUP_RADIUS_KM[0], Math.min(GROUP_RADIUS_KM[1], 1.5 * Math.sqrt(area))) });
        } else places.push({ lat: item.la, lon: item.lo, nearKm: group.id === 'ostrovy' ? 4 : 2 });
    }
}
const finePolygons = [...land10.features, ...minor10.features].flatMap(feature => polygonsOf(feature.geometry));
// (co už vrstva 1:50m kreslí, vyřadí až porovnání v jednotkách mapy – buildRegion)
const askedIslands = pickIslands(places, finePolygons, () => false, { maxKm2: MAX_ISLAND_KM2, areaOf: ringKm2 });
// Pevnina států, kterou vrstva pevniny nemá (nejmenší ostrovní státy jsou jen ve vrstvě států)
const stateIslands = countries50.features.flatMap(feature => polygonsOf(feature.geometry)).filter(polygon => {
    if (ringKm2(polygon[0]) > MAX_ISLAND_KM2) return false;
    const lon = polygon[0].reduce((sum, point) => sum + point[0], 0) / polygon[0].length;
    const lat = polygon[0].reduce((sum, point) => sum + point[1], 0) / polygon[0].length;
    return !onCoarseLand(lon, lat);
});
console.log(`  ostrovy navíc: ${askedIslands.length} z položek otázek (1:10m), ${stateIslands.length} z vrstvy států`);
// Jezera: velká z 1:50m; ta, na která se hra ptá, i menší – z 1:50m, jinak z 1:10m (podle QID Wikidat)
const lakeQid = (feature) => feature.properties.wikidataid || feature.properties.WIKIDATAID || '';
const drawnLakes = new Set();
const lakePolygons = [];
for (const feature of lakes.features) {
    const asked = askedLakes.has(lakeQid(feature));
    for (const polygon of polygonsOf(feature.geometry)) {
        if (ringKm2(polygon[0]) < (asked ? MIN_ASKED_LAKE_KM2 : MIN_LAKE_KM2)) continue;
        lakePolygons.push(polygon);
        if (asked) drawnLakes.add(lakeQid(feature));
    }
}
// Jezero z otázek, které mezi nakreslenými ještě není: podle QID, jinak mnohoúhelník jezera, ve kterém leží bod položky
const coveredLake = (qid) => {
    const { lat, lon } = askedLakes.get(qid);
    return drawnLakes.has(qid) || lakePolygons.some(polygon => new RingSet([polygon[0]]).contains(lon, lat));
};
let fineLakes = 0;
for (const source of [lakes10, lakes10europe, lakes10america]) {
    const taken = new Set();
    const candidates = source.features.flatMap(feature => polygonsOf(feature.geometry).filter(polygon => ringKm2(polygon[0]) >= MIN_ASKED_LAKE_KM2).map(polygon => ({ qid: lakeQid(feature), polygon })));
    for (const qid of askedLakes.keys()) {
        if (coveredLake(qid)) continue;
        const { lat, lon } = askedLakes.get(qid);
        const byQid = candidates.filter(candidate => candidate.qid === qid);
        const found = byQid.length ? byQid : candidates.filter(candidate => new RingSet([candidate.polygon[0]]).contains(lon, lat)).slice(0, 1);
        for (const { polygon } of found) { lakePolygons.push(polygon); taken.add(qid); fineLakes++; }
    }
    for (const qid of taken) drawnLakes.add(qid);
}
console.log(`  jezera: ${lakePolygons.length - fineLakes} z 1:50m, ${fineLakes} z 1:10m podle položek otázek (${drawnLakes.size} z ${askedLakes.size} jezer z otázek)`);

const sources = {
    land: landPolygons,
    islands: [...stateIslands, ...askedIslands],
    lakes: lakePolygons,
    borders: borderLines,
    czechBorders: borders10.features.flatMap(feature => linesOf(feature.geometry)),
    czechRivers: [...riverLines(riversMain, CZECH_RIVERS.ne_10m_rivers_lake_centerlines), ...riverLines(riversEurope, CZECH_RIVERS.ne_10m_rivers_europe)],
    countries: countryAreas,
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
    source: 'Natural Earth 5.1.2 (volné dílo): svět – pevnina, jezera a hranice 1:50m, malé ostrovy a jezera z položek otázek 1:10m; Česko – hranice, kraje a řeky 1:10m',
    generated: new Date().toISOString().slice(0, 10),
    regions
}));
console.log('mapa.json: hotovo');
