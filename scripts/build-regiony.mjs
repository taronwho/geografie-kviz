// Slepé mapy regionů: data/regiony.json z Natural Earth 1:10m (volné dílo). Pro každý stát, který má v tématu Vlajky a znaky
// okruh Regiony států, a pro Česko (znaky krajů a měst): obrys státu, sousedé, hranice jeho krajů, spolkových zemí, států
// či provincií, velká jezera a obrys každého regionu z okruhu. Bez popisků – mapa nesmí prozradit názvy.
// Souřadnice v Mercatorově zobrazení (x = délka, y = mercatorY(šířka)) jako celá čísla po q stupních, zapsané rozdílově;
// q odpovídá asi půl pixelu na telefonu. Výřez počítá za běhu quiz-core.js (regionalView) podle velikosti panelu.
// Spuštění: npm run build:regiony (s BUILD_CACHE=složka se stažené vrstvy uloží a další běh je nestahuje)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { layer, polygonsOf, ringKm2, planarArea, simplify, clipPolygon, clipLine } from './lib/natural-earth.mjs';
import { encodePoints } from './lib/regional-encode.mjs';

const require = createRequire(import.meta.url);
const { mercatorY, inverseMercatorY, regionalView } = require('../quiz-core.js');
const vlajky = JSON.parse(readFileSync(new URL('../data/vlajky.json', import.meta.url), 'utf8'));

const CZECHIA = 'Q213';
// Poměr stran panelu (šířka/výška) od vysokého po nízký pruh na malém telefonu – data musí stačit pro všechny
const ASPECTS = [1.2, 1.8, 3];
// Šířka panelu nápovědy na telefonu (px): podle ní zjednodušení (půl pixelu) a nejmenší jezero (6 px napříč)
const PANEL_WIDTH = 360;
// Ostrovy a exklávy dál než tolik jednotek od zbytku státu (Aljaška, Havaj, Kanárské ostrovy, Velikonoční ostrov, Svalbard)
// do rámce státu nepatří
const CLUSTER_GAP = 3;
// Rámec, který se na mapu vejde celý (šířka ve stupních délky, výška v jednotkách Mercatora); větší stát (Rusko) rámec nemá
// a mapa ukáže okolí regionu
const MAX_FRAME = [100, 62];
// Daleký sever a jih Mercator roztahuje – rámec končí na 72° (Kanadské arktické souostroví by mapu zmenšilo na proužek)
const FRAME_MAX_LAT = 72;
// Shoda regionu s položkou podle polohy: rozloha se smí lišit nejvýš tolikrát (jinak jde o jiný celek, např. jazykové společenství)
const AREA_RATIO = 1.6;
// Sousední státy se zjednoduší víc než hledaný stát
const NEIGHBOUR_COARSER = 1.6;

// Krym a Sevastopol patří Ukrajině (Natural Earth je vede pod Ruskem; položky okruhu je mají u Ukrajiny)
const countryOf = (p) => p.adm0_a3 === 'RUS' && ['Crimea', 'Sevastopol'].includes(p.name) ? 'UKR' : p.adm0_a3;
// Regiony na úrovni položek: Natural Earth má ve Francii, Itálii, Španělsku a Belgii jemnější dělení (departementy, provincie)
// s vyšším celkem v poli region, ve Spojeném království hrabství v zemích (geonunit); Norsko má stav před sloučením
// v roce 2020 – kraje, které zůstaly sloučené i po rozdělení v roce 2024, se spojí
const NORWAY_2024 = {
    'Aust-Agder': 'Agder', 'Vest-Agder': 'Agder', Hedmark: 'Innlandet', Oppland: 'Innlandet',
    'Nord-Trøndelag': 'Trøndelag', 'Sør-Trøndelag': 'Trøndelag', Hordaland: 'Vestland', 'Sogn og Fjordane': 'Vestland'
};
const groupOf = (p, a3) => ['FRA', 'ITA', 'ESP', 'BEL'].includes(a3) ? p.region || p.name
    : a3 === 'GBR' ? p.geonunit : a3 === 'NOR' ? NORWAY_2024[p.name] || p.name : p.adm1_code;

const project = ([lon, lat]) => [lon, mercatorY(lat)];
const clampLat = ([x, y]) => [x, Math.max(Math.min(y, mercatorY(FRAME_MAX_LAT)), mercatorY(-FRAME_MAX_LAT))];
const bboxOf = (points) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of points) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    return box;
};
const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const boxGap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const intersects = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const inRing = (ring, [x, y]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};
// Mnohoúhelník = [vnější prstenec, díry…] v promítnutých souřadnicích
const inPolygon = (polygon, point) => inRing(polygon[0], point) && !polygon.slice(1).some(hole => inRing(hole, point));

// Rámec souvislé části: mnohoúhelníky blíž než CLUSTER_GAP od sebe tvoří skupinu, rámec má skupina s největší rozlohou
// (ve Francii pevnina s Korsikou, ne Francouzská Guyana – největší jednotlivý mnohoúhelník departementů)
const clusterBox = (polygons) => {
    // Rozloha v Mercatorově zobrazení roste s druhou mocninou sečny šířky – opraví se, ať arktické ostrovy nepřeváží pevninu
    const parts = polygons.map(polygon => {
        const box = bboxOf(polygon[0]);
        const lat = inverseMercatorY((box[1] + box[3]) / 2) * Math.PI / 180;
        return { box: bboxOf(polygon[0].map(clampLat)), area: planarArea(polygon[0]) * Math.cos(lat) ** 2 };
    }).filter(part => part.area > 0);
    if (!parts.length) return null;
    const clusters = [];
    for (const part of parts.sort((a, b) => b.area - a.area)) {
        const near = clusters.filter(cluster => cluster.parts.some(member => boxGap(member.box, part.box) <= CLUSTER_GAP));
        const merged = { parts: [part, ...near.flatMap(cluster => cluster.parts)] };
        for (const cluster of near) clusters.splice(clusters.indexOf(cluster), 1);
        clusters.push(merged);
    }
    const largest = clusters.reduce((best, cluster) => {
        const area = cluster.parts.reduce((sum, member) => sum + member.area, 0);
        return area > best.area ? { cluster, area } : best;
    }, { cluster: null, area: -1 }).cluster;
    return largest.parts.map(member => member.box).reduce(unionBox);
};

// Místo pro tečku uvnitř regionu: bod položky, když v regionu leží, jinak bod největšího mnohoúhelníku nejdál od okraje
const insidePoint = (polygons, point) => {
    if (polygons.some(polygon => inPolygon(polygon, point))) return point;
    const largest = polygons.reduce((best, polygon) => planarArea(polygon[0]) > planarArea(best[0]) ? polygon : best);
    const [x0, y0, x1, y1] = bboxOf(largest[0]);
    const edge = largest.flat();
    const step = Math.max(1, Math.floor(edge.length / 400));
    let best = null, bestDistance = -1;
    for (let i = 1; i < 30; i++) {
        for (let j = 1; j < 30; j++) {
            const candidate = [x0 + (x1 - x0) * i / 30, y0 + (y1 - y0) * j / 30];
            if (!inPolygon(largest, candidate)) continue;
            let distance = Infinity;
            for (let k = 0; k < edge.length; k += step) distance = Math.min(distance, Math.hypot(edge[k][0] - candidate[0], edge[k][1] - candidate[1]));
            if (distance > bestDistance) { best = candidate; bestDistance = distance; }
        }
    }
    return best || largest[0][0];
};

// Topologie: úsek hranice sdílený dvěma oblastmi je jejich společná hranice, úsek jen v jedné oblasti pobřeží
const pointKey = ([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`;
const buildEdges = (features) => {
    const edges = new Map();
    features.forEach(feature => {
        for (const polygon of feature.raw) {
            for (const ring of polygon) {
                for (let i = 1; i < ring.length; i++) {
                    const a = pointKey(ring[i - 1]);
                    const b = pointKey(ring[i]);
                    if (a === b) continue;
                    const id = a < b ? `${a}|${b}` : `${b}|${a}`;
                    const edge = edges.get(id) || { a, b, pa: ring[i - 1], pb: ring[i], owners: [] };
                    edge.owners.push(feature);
                    edges.set(id, edge);
                }
            }
        }
    });
    return [...edges.values()];
};
const adjacencyOf = (edges) => {
    const adjacency = new Map();
    for (const edge of edges) {
        for (const [from, to, point] of [[edge.a, edge.b, edge.pb], [edge.b, edge.a, edge.pa]]) {
            if (!adjacency.has(from)) adjacency.set(from, []);
            adjacency.get(from).push({ to, point, edge });
        }
    }
    return adjacency;
};
// Uzavřené prstence z hranice celku (každý uzel má dva úseky, v místě dotyku čtyři)
const ringsOf = (edges) => {
    const adjacency = adjacencyOf(edges);
    const used = new Set();
    const rings = [];
    for (const edge of edges) {
        if (used.has(edge)) continue;
        used.add(edge);
        const ring = [edge.pa, edge.pb];
        let current = edge.b;
        while (current !== edge.a) {
            const next = adjacency.get(current).find(step => !used.has(step.edge));
            if (!next) break;
            used.add(next.edge);
            ring.push(next.point);
            current = next.to;
        }
        if (ring.length > 3) rings.push(ring);
    }
    return rings;
};
// Lomené čáry mezi uzly (kde se stýkají tři regiony nebo region a pobřeží), k tomu uzavřené smyčky (Berlín v Braniborsku)
const chainsOf = (edges) => {
    const adjacency = adjacencyOf(edges);
    const used = new Set();
    const chains = [];
    const walk = (start, startPoint, first) => {
        const line = [startPoint];
        let step = first;
        while (step && !used.has(step.edge)) {
            used.add(step.edge);
            line.push(step.point);
            const next = adjacency.get(step.to).filter(candidate => !used.has(candidate.edge));
            step = adjacency.get(step.to).length === 2 ? next[0] : null;
        }
        return line;
    };
    const pointOf = (node, list) => list[0].edge.a === node ? list[0].edge.pa : list[0].edge.pb;
    for (const [node, list] of adjacency) if (list.length !== 2) for (const step of list) if (!used.has(step.edge)) chains.push(walk(node, pointOf(node, list), step));
    for (const [node, list] of adjacency) for (const step of list) if (!used.has(step.edge)) chains.push(walk(node, pointOf(node, list), step));
    return chains;
};

// Zápis cest: scripts/lib/regional-encode.mjs (rozdílově po q, base64url)
// minArea = nejmenší ostrůvek (v jednotkách², výchozí asi tři pixely napříč); obrys hledaného regionu i menší
const encodeRings = (rings, box, tolerance, q, minArea = (tolerance * 6) ** 2) => {
    const out = [];
    for (const ring of rings) {
        const clipped = clipPolygon(ring.map(project), box);
        if (clipped.length < 3) continue;
        const simplified = simplify([...clipped, clipped[0]], tolerance).slice(0, -1);
        if (simplified.length < 3 || planarArea(simplified) < minArea) continue;
        const encoded = encodePoints(simplified, q);
        if (encoded.count >= 3) out.push(encoded.text);
    }
    return out;
};
const encodeLines = (lines, box, tolerance, q) => {
    const out = [];
    for (const line of lines) {
        for (const piece of clipLine(line.map(project), box)) {
            const encoded = encodePoints(simplify(piece, tolerance), q);
            if (encoded.count >= 2) out.push(encoded.text);
        }
    }
    return out;
};
const round2 = (values) => values.map(value => Math.round(value * 100) / 100);

const [admin1, lakes] = await Promise.all([layer('ne_10m_admin_1_states_provinces'), layer('ne_10m_lakes')]);
const features = admin1.features.map(feature => {
    const raw = polygonsOf(feature.geometry);
    const polygons = raw.map(polygon => polygon.map(ring => ring.map(project)));
    const country = countryOf(feature.properties);
    const km2 = raw.reduce((sum, polygon) => sum + ringKm2(polygon[0]) - polygon.slice(1).reduce((holes, hole) => holes + ringKm2(hole), 0), 0);
    return { props: feature.properties, country, raw, polygons, km2, box: polygons.map(polygon => bboxOf(polygon[0])).reduce(unionBox, [Infinity, Infinity, -Infinity, -Infinity]) };
});
const featureAt = (point) => features.find(feature => point[0] >= feature.box[0] && point[0] <= feature.box[2] && point[1] >= feature.box[1] && point[1] <= feature.box[3]
    && feature.polygons.some(polygon => inPolygon(polygon, point)));
const lakePolygons = lakes.features.flatMap(feature => polygonsOf(feature.geometry))
    .map(polygon => ({ raw: polygon, km2: ringKm2(polygon[0]), box: bboxOf(polygon[0].map(project)) }));

// Položky s mapou regionu: regiony států, města světa a české znaky; státy podle okruhu regionů a Česko
const items = vlajky.items.filter(item => item.la !== undefined && ['regiony', 'mesta', 'cesko'].includes(item.c) && (item.co || [])[0]);
const countryIds = [...new Set([...items.filter(item => item.c === 'regiony').map(item => item.co[0]), CZECHIA])].sort();

const countries = {};
const report = [];
for (const qid of countryIds) {
    const own = items.filter(item => item.co[0] === qid);
    // Kód státu v Natural Earth: kde leží většina jeho položek
    const votes = new Map();
    for (const item of own) {
        const feature = featureAt(project([item.lo, item.la]));
        if (feature) votes.set(feature.country, (votes.get(feature.country) || 0) + 1);
    }
    const a3 = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    const focus = features.filter(feature => feature.country === a3);
    focus.forEach(feature => { feature.group = groupOf(feature.props, a3); });
    const groups = new Map();
    for (const feature of focus) {
        if (!groups.has(feature.group)) groups.set(feature.group, { features: [], area: 0 });
        const group = groups.get(feature.group);
        group.features.push(feature);
        group.area += feature.km2;
    }
    const frameBox = clusterBox(focus.flatMap(feature => feature.polygons));
    const fits = frameBox[2] - frameBox[0] <= MAX_FRAME[0] && frameBox[3] - frameBox[1] <= MAX_FRAME[1];
    const entry = { a: a3 };
    if (fits) entry.f = round2(frameBox);

    // Region každé položky okruhu (u Česka krajů): podle Wikidat, jinak podle polohy s kontrolou rozlohy
    const targets = new Map();
    for (const item of own.filter(item => item.c === 'regiony' || item.ty === 'kraj')) {
        const point = project([item.lo, item.la]);
        const byId = focus.find(feature => feature.props.wikidataid === item.q);
        const ratioOf = (group) => item.f && item.f.area ? group.area / item.f.area : 1;
        const fair = (group) => ratioOf(group) <= AREA_RATIO && ratioOf(group) >= 1 / AREA_RATIO;
        // Podle polohy: region, ve kterém bod leží, a když nesedí rozlohou (bod v hlavním městě, které je samostatným
        // regionem uprostřed svého kraje), region kolem něj s nejbližší rozlohou
        const byPoint = focus.find(feature => feature.polygons.some(polygon => inPolygon(polygon, point)));
        const around = [...groups.values()].filter(group => fair(group) && group.features.some(feature => point[0] >= feature.box[0]
            && point[0] <= feature.box[2] && point[1] >= feature.box[1] && point[1] <= feature.box[3]))
            .sort((a, b) => Math.abs(Math.log(ratioOf(a))) - Math.abs(Math.log(ratioOf(b))))[0];
        const group = byId ? groups.get(byId.group) : byPoint && fair(groups.get(byPoint.group)) ? groups.get(byPoint.group) : around;
        const accepted = Boolean(group);
        report.push(`${a3} ${item.n}: ${accepted ? `${byId ? 'Wikidata' : 'poloha'} → ${group.features.length > 1 ? `${group.features.length}× ` : ''}${group.features[0].props.name}` : 'jen tečka'} (rozloha ${group ? ratioOf(group).toFixed(2) : '-'}×)`);
        if (!accepted) continue;
        const polygons = group.features.flatMap(feature => feature.polygons);
        targets.set(item.q, { group, b: clusterBox(polygons), p: insidePoint(polygons, point) });
    }

    // Výřezy všech položek pro všechny poměry stran → oblast, kterou data pokryjí; nejmenší výřez určí zjednodušení
    let box = null;
    let minSpan = Infinity;
    for (const item of own) {
        const target = targets.get(item.q) || { p: project([item.lo, item.la]) };
        for (const aspect of ASPECTS) {
            const view = regionalView(entry, target, aspect);
            const rect = [view.x - view.span / 2, view.y - view.span / aspect / 2, view.x + view.span / 2, view.y + view.span / aspect / 2];
            box = box ? unionBox(box, rect) : rect;
            if (aspect === ASPECTS[1]) minSpan = Math.min(minSpan, view.span);
        }
    }
    const margin = Math.max(box[2] - box[0], box[3] - box[1]) * 0.03;
    box = [box[0] - margin, box[1] - margin, box[2] + margin, box[3] + margin];
    const clipBox = { x0: box[0], y0: box[1], x1: box[2], y1: box[3] };
    const tolerance = minSpan / PANEL_WIDTH * 0.5;
    const q = Number(tolerance.toPrecision(2));
    entry.q = q;

    // Hranice: obrys státu a sousedů (úsek v jedné oblasti státu), hranice regionů (úsek ve dvou regionech státu)
    const nearby = features.filter(feature => intersects(feature.box, box));
    const edges = buildEdges(nearby);
    const countryEdges = new Map();
    const inner = [];
    for (const edge of edges) {
        const byCountry = new Map();
        for (const owner of edge.owners) byCountry.set(owner.country, (byCountry.get(owner.country) || 0) + 1);
        for (const [country, count] of byCountry) {
            if (count !== 1) continue;
            if (!countryEdges.has(country)) countryEdges.set(country, []);
            countryEdges.get(country).push(edge);
        }
        if (edge.owners.length === 2 && edge.owners.every(owner => owner.country === a3) && edge.owners[0].group !== edge.owners[1].group) inner.push(edge);
    }
    entry.c = encodeRings(ringsOf(countryEdges.get(a3) || []), clipBox, tolerance, q);
    // Sousedé jen pro orientaci – hrubší zjednodušení
    entry.o = [...countryEdges].filter(([country]) => country !== a3).flatMap(([, list]) => encodeRings(ringsOf(list), clipBox, tolerance * NEIGHBOUR_COARSER, q));
    entry.l = encodeLines(chainsOf(inner), clipBox, tolerance, q);
    // Jezera, která jsou na nejmenším výřezu aspoň 6 px napříč (hranice regionů jimi vedou – jezero je překryje)
    const kmPerPixel = minSpan * 111.32 * Math.cos(((box[1] + box[3]) / 2) * Math.PI / 180) / PANEL_WIDTH;
    const minLake = (kmPerPixel * 6) ** 2;
    entry.w = lakePolygons.filter(lake => lake.km2 >= minLake && intersects(lake.box, box)).flatMap(lake => encodeRings(lake.raw, clipBox, tolerance, q));

    entry.i = {};
    for (const [itemId, target] of targets) {
        const groupEdges = edges.filter(edge => edge.owners.filter(owner => owner.country === a3 && owner.group === target.group.features[0].group).length === 1);
        entry.i[itemId] = { b: round2(target.b), p: round2(target.p), r: encodeRings(ringsOf(groupEdges), clipBox, tolerance, q, 0) };
    }
    countries[qid] = entry;
    const size = JSON.stringify(entry).length;
    console.log(`  ${qid} ${a3}: ${Math.round(size / 1024)} kB, regionů ${targets.size}/${own.filter(item => item.c === 'regiony' || item.ty === 'kraj').length}, ${fits ? 'celý stát' : 'okolí regionu'}, q ${q}`);
}

// Městské části (cities) staví scripts/build-casti-mest.mjs z OpenStreetMap – při novém sestavení regionů zůstanou
const previous = (() => { try { return JSON.parse(readFileSync(new URL('../data/regiony.json', import.meta.url), 'utf8')); } catch (e) { return {}; } })();
writeFileSync(new URL('../data/regiony.json', import.meta.url), JSON.stringify({
    source: 'Natural Earth 5.1.2 (volné dílo): regiony států (admin 1) a jezera 1:10m',
    generated: new Date().toISOString().slice(0, 10),
    countries,
    ...(previous.cities ? { citiesSource: previous.citiesSource, cities: previous.cities } : {})
}));
if (process.env.REGIONY_REPORT) writeFileSync(process.env.REGIONY_REPORT, report.join('\n'));
console.log(`regiony.json: ${countryIds.length} států`);
