// Kontroly mapy pro otázku „Ukaž na mapě“ (scripts/audit-mapa.mjs, tests/audit-mapa.test.js): podkladová mapa světa
// a Česka (data/mapa.json), polohy položek, obrysy (data/mapa-tvary.json – jen čtení), sestavení otázek a pokrytí.
// Každá kontrola vrací nálezy { severity, section, code, text, … }; severity: critical (chyba, kterou hráč uvidí a která
// se dá opravit v podkladové mapě nebo v opravách) > high > medium > low > info.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parsePath, RingSet, SegmentIndex, ringArea, bboxOf, interiorPoint, selfCrossings, haversineKm, lineKm, sphericalKm2, insideGeoRings,
    shapeKm2, geoBox, boxDiagonalKm, samplesInside, distanceToLinesKm, lineComponents
} from './audit-mapa-geo.mjs';
import { WATER, LAKES, SMALL_LAKES, LAND, CZECH_CITIES, CZECH_RIVERS, TERRITORY_OF, DISPUTED, INLAND_SEAS, AREA_ALIASES } from './audit-mapa-known.mjs';

const require = createRequire(import.meta.url);
const core = require('../../quiz-core.js');
const MQ = require('../../question-map.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const SECTIONS = {
    svet: 'Podkladová mapa světa', cesko: 'Podkladová mapa Česka', staty: 'Státy na mapě', polohy: 'Polohy položek',
    tvary: 'Obrysy (data/mapa-tvary.json)', otazky: 'Sestavení otázek', opravy: 'Soubor oprav'
};

// Tolerance (jednotky mapy světa: 1 jednotka = 5 km na rovníku, 2,5 km na 60° šířky)
const BORDER_OK_UNITS = 1.5;        // konec hranice smí být tak daleko od břehu, jezera nebo jiné hranice
const BORDER_CRITICAL_UNITS = 4;    // dál je to hranice „do ztracena“ (chybějící moře, jezero, nebo čára v moři)
const COUNTRY_TOLERANCE_KM = 25;    // místo smí ležet tak daleko za hranicí státu, který uvádí (hrubý obrys ploch států)
const SEA_TOLERANCE_KM = 60;        // místo v moři nebo na nenakresleném ostrůvku: tak daleko od plochy svého státu
const FAR_KM = 300;                 // dál už je to jiný stát / jiné místo

const norm = (text) => core.normalizeAnswer(text);
const round = (n, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;
const fmt = (lat, lon) => `${round(lat, 2)}, ${round(lon, 2)}`;

export const loadData = (root = ROOT) => {
    const read = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    const map = read('data/mapa.json');
    const shapes = read('data/mapa-tvary.json').shapes || {};
    const fixes = existsSync(path.join(root, 'data/mapa-opravy.json')) ? read('data/mapa-opravy.json') : {};
    const countries = read('data/countries.json').countries;
    core.setCountries(countries);
    const topics = Object.fromEntries(MQ.MAP_TOPICS.map(id => [id, read(`data/${id}.json`).items]));
    const skip = fixes.skip || {};
    const points = fixes.points || {};
    return { map, shapes, fixes: { ...fixes, skip, points }, countries, topics, mapData: { ...map, shapes, skip, points } };
};

// --- Podkladová mapa jako geometrie ------------------------------------------------------------------------------------

export class Basemap {
    constructor(regionData, regionId) {
        this.data = regionData;
        this.id = regionId;
        this.frame = MQ.frameOf(regionId);
        this.parts = Object.fromEntries(Object.entries(regionData.layers || {}).map(([name, d]) => [name, parsePath(d)]));
        const rings = (name) => (this.parts[name] || []).map(part => part.points);
        // Pevnina se kreslí jako dvě cesty (land a seam), každá zvlášť pravidlem sudá–lichá
        this.landLayers = ['land', 'seam'].filter(name => this.parts[name]).map(name => ({ name, rings: rings(name), set: new RingSet(rings(name)) }));
        this.allLand = new RingSet(this.landLayers.flatMap(layer => layer.rings));
        this.lakeSet = new RingSet(rings('lakes'));
        this.areas = (regionData.areas || []).map(area => {
            const areaRings = parsePath(area.d).map(part => part.points);
            return { name: area.n, rings: areaRings, set: new RingSet(areaRings), box: bboxOf(areaRings.flat()) };
        });
        this.areaByName = new Map(this.areas.map(area => [norm(area.name), area]));
        // Pobřeží (bez úseků podél švu na 180. poledníku a spodní hrany na 85° j. š.) a břehy jezer
        this.coast = new SegmentIndex(16);
        this.shore = new SegmentIndex(16);
        this.edgeY = regionData.center && this.frame.region.projection ? this.frame.toMap(-85, 0)[1] : Infinity;
        for (const layer of this.landLayers) {
            layer.rings.forEach((ring, index) => {
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    if (this.isSeamSegment(ring[j], ring[i])) continue;
                    this.coast.add(ring[j][0], ring[j][1], ring[i][0], ring[i][1], `${layer.name}:${index}`);
                }
            });
        }
        rings('lakes').forEach((ring, index) => this.shore.addLine(ring, true, index));
    }
    isSeamSegment(a, b) {
        if (!this.frame.region.projection) return false;
        const width = this.frame.width;
        return (a[0] <= 0.5 && b[0] <= 0.5) || (a[0] >= width - 0.5 && b[0] >= width - 0.5) || (a[1] >= this.edgeY - 0.5 && b[1] >= this.edgeY - 0.5);
    }
    toMap(lat, lon) { return this.frame.toMap(lat, lon); }
    unitsPerKm(lat) { return this.frame.unitsPerKmAt(lat); }
    landXY(x, y) { return this.landLayers.some(layer => layer.set.contains(x, y)); }
    lakeXY(x, y) { return this.lakeSet.contains(x, y); }
    isLand(lat, lon) { const [x, y] = this.toMap(lat, lon); return this.landXY(x, y); }
    isLake(lat, lon) { const [x, y] = this.toMap(lat, lon); return this.lakeXY(x, y); }
    // Vzdálenost k nejbližšímu pobřeží v km (do maxKm, jinak Infinity)
    coastKm(lat, lon, maxKm = 100) {
        const [x, y] = this.toMap(lat, lon);
        const hit = this.coast.nearest(x, y, maxKm * this.unitsPerKm(lat));
        return hit ? hit.distance / this.unitsPerKm(lat) : Infinity;
    }
    shoreKm(lat, lon, maxKm = 100) {
        const [x, y] = this.toMap(lat, lon);
        const hit = this.shore.nearest(x, y, maxKm * this.unitsPerKm(lat));
        return hit ? hit.distance / this.unitsPerKm(lat) : Infinity;
    }
    landNear(lat, lon, km) { return this.isLand(lat, lon) || this.coastKm(lat, lon, km) <= km; }
    areasXY(x, y) {
        const hits = [];
        for (const area of this.areas) {
            if (x < area.box[0] || x > area.box[2] || y < area.box[1] || y > area.box[3]) continue;
            if (area.set.contains(x, y)) hits.push(area.name);
        }
        return hits;
    }
    areaAt(lat, lon) { const [x, y] = this.toMap(lat, lon); return this.areasXY(x, y)[0] || null; }
    // Vzdálenost bodu od plochy (0 uvnitř) v km
    kmToArea(name, lat, lon) {
        const area = this.areaByName.get(norm(name));
        if (!area) return Infinity;
        const [x0, y] = this.toMap(lat, lon);
        if (area.set.contains(x0, y)) return 0;
        let best = Infinity;
        // Na mapě světa i přes šev na 180. poledníku (Kiribati, Fidži): bod posunutý o šířku mapy
        for (const x of this.frame.region.projection ? [x0, x0 - this.frame.width, x0 + this.frame.width] : [x0]) {
            for (const ring of area.rings) {
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    const [ax, ay] = ring[j];
                    const dx = ring[i][0] - ax, dy = ring[i][1] - ay;
                    const length = dx * dx + dy * dy;
                    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
                    const distance = Math.hypot(ax + t * dx - x, ay + t * dy - y);
                    if (distance < best) best = distance;
                }
            }
        }
        return best / this.unitsPerKm(lat);
    }
    // Plochy do dané vzdálenosti od bodu (hrubý obrys plochy u pobřeží bod těsně mine)
    areasNear(lat, lon, km) {
        const [x, y] = this.toMap(lat, lon);
        const reach = km * this.unitsPerKm(lat);
        return this.areas.filter(area => x >= area.box[0] - reach && x <= area.box[2] + reach && y >= area.box[1] - reach && y <= area.box[3] + reach && this.kmToArea(area.name, lat, lon) <= km).map(area => area.name);
    }
}

// --- 1. Podkladová mapa světa ------------------------------------------------------------------------------------------

export const checkWorld = (world, add) => {
    const frame = world.frame;
    const stats = {};
    // Známá moře, jezera a pevnina
    for (const [name, lat, lon] of WATER) {
        const [x, y] = world.toMap(lat, lon);
        if (world.landXY(x, y) && !world.lakeXY(x, y)) add('critical', 'svet', 'voda-jako-pevnina', `${name} (${fmt(lat, lon)}) je na mapě nakreslené jako pevnina`, { lat, lon });
    }
    for (const [name, lat, lon] of LAKES) {
        if (!world.isLake(lat, lon)) add('critical', 'svet', 'velke-jezero-chybi', `Velké jezero ${name} (${fmt(lat, lon)}) na mapě chybí`, { lat, lon });
    }
    for (const [name, lat, lon] of SMALL_LAKES) {
        if (!world.isLake(lat, lon)) add('medium', 'svet', 'zname-jezero-chybi', `Známé menší jezero ${name} (${fmt(lat, lon)}) na mapě není nakreslené`, { lat, lon });
    }
    for (const [name, lat, lon] of LAND) {
        const [x, y] = world.toMap(lat, lon);
        if (!world.landXY(x, y)) add('critical', 'svet', 'pevnina-jako-voda', `${name} (${fmt(lat, lon)}) na mapě není pevnina`, { lat, lon });
        else if (world.lakeXY(x, y)) add('critical', 'svet', 'pevnina-jako-jezero', `${name} (${fmt(lat, lon)}) leží na mapě v jezeře`, { lat, lon });
    }
    stats.samples = { water: WATER.length, lakes: LAKES.length + SMALL_LAKES.length, land: LAND.length };

    // Kroužky pevniny: díra (kroužek uvnitř jiné pevniny) musí být skutečné vnitrozemské moře a ležet ve stejné cestě jako
    // její pevnina (jinak se vykreslí jako pevnina – chyba s Kaspickým mořem); ostrov pohlcený zjednodušeným pobřežím
    // by se naopak vykreslil jako voda
    const inlandSeas = INLAND_SEAS.map(([name, lat, lon]) => ({ name, xy: world.toMap(lat, lon), found: false }));
    let holes = 0;
    for (const layer of world.landLayers) {
        const others = world.landLayers.filter(other => other !== layer);
        for (const ring of layer.rings) {
            const [x, y] = interiorPoint(ring);
            const own = layer.set.depth(x, y, ring);
            const foreign = others.reduce((sum, other) => sum + other.set.depth(x, y), 0);
            if (own % 2 === 0 && foreign % 2 === 0) continue;
            const area = ringArea(ring);
            const place = frame.fromMap(x, y);
            const sea = inlandSeas.find(entry => new RingSet([ring]).contains(entry.xy[0], entry.xy[1]));
            if (own % 2 === 1) {
                holes++;
                if (sea) { sea.found = true; continue; }
                add(area >= 20 ? 'critical' : 'medium', 'svet', 'ostrov-jako-dira',
                    `Kroužek pevniny u ${fmt(place.lat, place.lon)} (${round(area)} j²) leží uvnitř jiné pevniny ve vrstvě ${layer.name}: vykreslí se jako voda (ostrov pohlcený zjednodušeným pobřežím)`, { lat: place.lat, lon: place.lon, area });
            } else if (sea || area >= 20) {
                add('critical', 'svet', 'dira-v-jine-vrstve',
                    `Kroužek u ${fmt(place.lat, place.lon)} (${round(area)} j²) ve vrstvě ${layer.name} je dírou pevniny z jiné vrstvy${sea ? ` (${sea.name})` : ''}: vykreslí se jako pevnina`, { lat: place.lat, lon: place.lon, area });
            } else {
                add('low', 'svet', 'ostrov-na-pevnine',
                    `Ostrůvek u ${fmt(place.lat, place.lon)} (${round(area)} j²) ve vrstvě ${layer.name} leží na pevnině z jiné vrstvy (zjednodušené pobřeží ho pohltilo; obrys se kreslí přes pevninu)`, { lat: place.lat, lon: place.lon, area });
            }
        }
    }
    for (const sea of inlandSeas) if (!sea.found) add('critical', 'svet', 'vnitrozemske-more-chybi', `${sea.name} není dírou v pevnině (vykreslí se jako pevnina)`);
    stats.rings = Object.fromEntries(world.landLayers.map(layer => [layer.name, layer.rings.length]));
    stats.holes = holes;

    // Hranice států: každý konec čáry musí končit u pobřeží, břehu jezera, jiné hranice (nebo sám na sobě – enkláva),
    // případně na okraji mapy; čára nesmí vést mořem
    const borders = (world.parts.borders || []).map(part => part.points);
    const lines = new SegmentIndex(16);
    borders.forEach((line, index) => lines.addLine(line, false, index));
    const search = 60;
    let ends = 0;
    let worst = 0;
    borders.forEach((line, index) => {
        const first = line[0];
        const last = line[line.length - 1];
        const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) <= 0.75;
        for (const end of closed ? [] : [first, last]) {
            ends++;
            const [x, y] = end;
            const candidates = [
                world.coast.nearest(x, y, search), world.shore.nearest(x, y, search), lines.nearest(x, y, search, tag => tag !== index)
            ].filter(Boolean).map(hit => hit.distance);
            if (x <= 1 || x >= frame.width - 1) candidates.push(0);
            // Konec na sobě samé (smyčka zakončená na vlastní čáře)
            const self = lines.nearest(x, y, search, (tag, segment) => tag === index && Math.hypot(segment[0] - x, segment[1] - y) > 2 && Math.hypot(segment[2] - x, segment[3] - y) > 2);
            if (self) candidates.push(self.distance);
            const distance = candidates.length ? Math.min(...candidates) : search;
            worst = Math.max(worst, distance);
            if (distance <= BORDER_OK_UNITS) continue;
            const place = frame.fromMap(x, y);
            const km = distance / world.unitsPerKm(place.lat);
            const inSea = !world.landXY(x, y);
            add(distance > BORDER_CRITICAL_UNITS ? 'critical' : 'medium', 'svet', 'hranice-do-ztracena',
                `Hranice končí u ${fmt(place.lat, place.lon)} ${round(km)} km (${round(distance, 1)} j) od ${inSea ? 'pobřeží – v moři' : 'nejbližšího pobřeží, jezera či hranice'}`,
                { lat: place.lat, lon: place.lon, km: round(km), units: round(distance, 1), inSea });
        }
        // Čára vedená mořem (sporná námořní hranice): podíl bodů čáry v moři dál od břehu
        const probes = [];
        for (let i = 1; i < line.length; i++) {
            const steps = Math.max(1, Math.ceil(Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) / 2));
            for (let step = 0; step < steps; step++) probes.push([line[i - 1][0] + (line[i][0] - line[i - 1][0]) * step / steps, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * step / steps]);
        }
        const wet = probes.filter(([x, y]) => !world.landXY(x, y) && !world.coast.nearest(x, y, BORDER_OK_UNITS));
        if (wet.length >= 3 && wet.length / probes.length > 0.3) {
            const place = frame.fromMap(wet[0][0], wet[0][1]);
            add('high', 'svet', 'hranice-v-mori', `Hranice u ${fmt(place.lat, place.lon)} vede z ${Math.round(100 * wet.length / probes.length)} % mořem (${wet.length * 2} j)`, { lat: place.lat, lon: place.lon });
        }
    });
    stats.borders = { lines: borders.length, ends, worstUnits: round(worst, 2) };

    // Jezera: každé leží na pevnině (jinak by bylo jen modrou skvrnou v moři)
    const lakeRings = (world.parts.lakes || []).map(part => part.points);
    for (const ring of lakeRings) {
        const [x, y] = interiorPoint(ring);
        if (world.landXY(x, y)) continue;
        const place = frame.fromMap(x, y);
        add('low', 'svet', 'jezero-mimo-pevninu', `Jezero u ${fmt(place.lat, place.lon)} (${round(ringArea(ring))} j²) neleží na nakreslené pevnině`, { lat: place.lat, lon: place.lon });
    }
    stats.lakes = lakeRings.length;

    // Šev na 180. poledníku: vrstva s obrysem (land, seamCoast) nesmí mít úsek podél okraje mapy (svislá čára přes Čukotku)
    const seamSegments = (parts) => parts.reduce((count, part) => {
        const points = part.points;
        let found = 0;
        for (let i = 1; i <= points.length - (part.closed ? 0 : 1); i++) {
            const a = points[i - 1], b = points[i % points.length];
            const onSeam = (a[0] <= 0.5 && b[0] <= 0.5) || (a[0] >= frame.width - 0.5 && b[0] >= frame.width - 0.5);
            if (onSeam && Math.abs(a[1] - b[1]) > 1) found++;
        }
        return count + found;
    }, 0);
    for (const name of ['land', 'seamCoast']) {
        const count = seamSegments(world.parts[name] || []);
        if (count) add('critical', 'svet', 'sev-jako-pobrezi', `Vrstva ${name} má ${count} úseků podél 180. poledníku: nakreslí se jako svislé pobřeží`);
    }
    if (world.parts.seam && !world.parts.seamCoast) add('critical', 'svet', 'sev-bez-obrysu', 'Pevnina na švu (seam) nemá vrstvu s obrysem (seamCoast)');
    // Antarktida: výřez končí na 57° j. š., pevnina pod ním je jen pro vysoké displeje; nic z ní nesmí zasahovat do výřezu
    const south = frame.fromMap(0, frame.height).lat;
    let antarcticInFrame = 0;
    for (let lon = -179; lon < 180; lon += 2) for (let lat = south + 0.2; lat < south + 3; lat += 0.7) if (lat < -60 && world.isLand(lat, lon)) antarcticInFrame++;
    const antarctica = world.isLand(-80, 0) || world.isLand(-80, 100);
    stats.antarctica = { frameSouth: round(south, 1), drawnBelowFrame: antarctica };
    if (antarcticInFrame) add('medium', 'svet', 'antarktida-ve-vyrezu', `Do výřezu (jižní okraj ${round(south, 1)}°) zasahuje pevnina Antarktidy`);
    const bottom = (world.parts.seamCoast || []).reduce((count, part) => count + part.points.filter((point, i) => i > 0 && point[1] >= world.edgeY - 0.5 && part.points[i - 1][1] >= world.edgeY - 0.5 && Math.abs(point[0] - part.points[i - 1][0]) > 50).length, 0);
    if (bottom) add('low', 'svet', 'antarktida-spodni-hrana', `Spodní hrana Antarktidy na 85° j. š. se kreslí jako pobřeží (${bottom} dlouhých úseků; je pod výřezem, vidět jen na vysokém displeji)`);
    return stats;
};

// Volitelně: porovnání s Natural Earth 1:50m (zdroj mapy) v mřížce – pevnina zdroje × pevnina mapy dál od pobřeží
export const checkAgainstSource = (world, sourceLand, add, step = 0.5) => {
    const polygons = sourceLand.map(polygon => polygon.map(ring => ring.map(([lon, lat]) => [lon, lat])));
    const sets = polygons.map(polygon => ({ outer: new RingSet([polygon[0]]), holes: new RingSet(polygon.slice(1)), box: bboxOf(polygon[0]) }));
    const inSource = (lat, lon) => sets.some(set => lon >= set.box[0] && lon <= set.box[2] && lat >= set.box[1] && lat <= set.box[3] && set.outer.contains(lon, lat) && !set.holes.contains(lon, lat));
    const mismatches = [];
    let compared = 0;
    const top = world.frame.fromMap(0, 0).lat;
    for (let lat = -84.75; lat < top; lat += step) {
        for (let lon = -179.75; lon < 180; lon += step) {
            const [x, y] = world.toMap(lat, lon);
            const drawn = world.landXY(x, y);
            const real = inSource(lat, lon);
            compared++;
            if (drawn === real) continue;
            if (world.coast.nearest(x, y, 3)) continue;
            mismatches.push({ lat, lon, drawn });
        }
    }
    // Shluky sousedních bodů = jedna chyba
    const seen = new Set();
    const key = (m) => `${m.lat},${m.lon}`;
    const byKey = new Map(mismatches.map(m => [key(m), m]));
    for (const start of mismatches) {
        if (seen.has(key(start))) continue;
        const cluster = [];
        const queue = [start];
        seen.add(key(start));
        while (queue.length) {
            const current = queue.pop();
            cluster.push(current);
            for (const [dLat, dLon] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
                const next = byKey.get(`${current.lat + dLat},${current.lon + dLon}`);
                if (next && !seen.has(key(next))) { seen.add(key(next)); queue.push(next); }
            }
        }
        const lat = cluster.reduce((sum, m) => sum + m.lat, 0) / cluster.length;
        const lon = cluster.reduce((sum, m) => sum + m.lon, 0) / cluster.length;
        add(cluster.length >= 4 ? 'critical' : 'medium', 'svet', start.drawn ? 'zdroj-voda-mapa-pevnina' : 'zdroj-pevnina-mapa-voda',
            `U ${fmt(lat, lon)} je na mapě ${start.drawn ? 'pevnina, ve zdroji (Natural Earth) voda' : 'voda, ve zdroji (Natural Earth) pevnina'} (${cluster.length} bodů mřížky ${step}°)`, { lat, lon, points: cluster.length });
    }
    return { compared, mismatches: mismatches.length };
};

// --- Podkladová mapa Česka --------------------------------------------------------------------------------------------

export const checkCzech = (czech, add) => {
    const frame = czech.frame;
    const home = (czech.parts.home || []).map(part => part.points);
    if (home.length !== 1) add('critical', 'cesko', 'obrys', `Obrys Česka má ${home.length} kroužků (má být jeden)`);
    if (czech.areas.length !== 14) add('critical', 'cesko', 'kraje', `Mapa Česka má ${czech.areas.length} krajů (má být 14)`);
    for (const [name, lat, lon, kraj] of CZECH_CITIES) {
        const found = czech.areaAt(lat, lon);
        if (found !== kraj) add('critical', 'cesko', 'kraj-mesta', `${name} padne na mapě Česka do „${found}“ místo „${kraj}“`);
    }
    // Kraje pokrývají celé Česko a nepřekrývají se
    const homeSet = new RingSet(home);
    let inside = 0, none = 0, twice = 0;
    for (let x = 2; x < frame.width; x += 4) {
        for (let y = 2; y < frame.height; y += 4) {
            if (!homeSet.contains(x, y)) continue;
            inside++;
            const hits = czech.areasXY(x, y).length;
            if (!hits) none++;
            if (hits > 1) twice++;
        }
    }
    if (none / inside > 0.01) add('high', 'cesko', 'kraje-diry', `${round(100 * none / inside, 1)} % Česka neleží v žádném kraji`);
    if (twice / inside > 0.01) add('high', 'cesko', 'kraje-prekryv', `${round(100 * twice / inside, 1)} % Česka leží ve dvou krajích zároveň`);
    // Řeky: známá místa leží u nakreslené řeky; žádný dlouhý skok (spojené nesouvisející úseky)
    const rivers = new SegmentIndex(16);
    const riverLines = (czech.parts.rivers || []).map(part => part.points);
    riverLines.forEach((line, index) => rivers.addLine(line, false, index));
    for (const [name, lat, lon] of CZECH_RIVERS) {
        const [x, y] = czech.toMap(lat, lon);
        const hit = rivers.nearest(x, y, 60);
        const km = hit ? hit.distance / czech.unitsPerKm(lat) : Infinity;
        if (km > 6) add('high', 'cesko', 'reka-chybi', `${name}: nejbližší nakreslená řeka je ${Number.isFinite(km) ? `${round(km)} km` : 'daleko'} od ${fmt(lat, lon)}`);
    }
    // Hranice krajů končí na obrysu Česka nebo na jiné hranici kraje (Praha je uzavřená smyčka)
    const outline = new SegmentIndex(16);
    home.forEach(ring => outline.addLine(ring, true, 'home'));
    const inner = (czech.parts.inner || []).map(part => part.points);
    const innerIndex = new SegmentIndex(16);
    inner.forEach((line, index) => innerIndex.addLine(line, false, index));
    let dangling = 0;
    inner.forEach((line, index) => {
        const first = line[0], last = line[line.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1) return;
        for (const [x, y] of [first, last]) {
            const hits = [outline.nearest(x, y, 30), innerIndex.nearest(x, y, 30, tag => tag !== index)].filter(Boolean).map(hit => hit.distance);
            const distance = hits.length ? Math.min(...hits) : 30;
            if (distance > 3) { dangling++; const place = frame.fromMap(x, y); add('high', 'cesko', 'hranice-kraje-do-ztracena', `Hranice kraje končí u ${fmt(place.lat, place.lon)} ${round(distance / czech.unitsPerKm(place.lat))} km od obrysu Česka i jiné hranice`); }
        }
    });
    // Státní hranice okolních států končí na jiné hranici, obrysu Česka nebo na okraji mapových dat
    const borders = (czech.parts.borders || []).map(part => part.points);
    const borderIndex = new SegmentIndex(16);
    borders.forEach((line, index) => borderIndex.addLine(line, false, index));
    const all = borders.flat();
    const box = all.length ? bboxOf(all) : [0, 0, 0, 0];
    borders.forEach((line, index) => {
        const first = line[0], last = line[line.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1) return;
        for (const [x, y] of [first, last]) {
            if (x <= box[0] + 2 || x >= box[2] - 2 || y <= box[1] + 2 || y >= box[3] - 2) continue;
            if (x < -frame.width * 0.2 || x > frame.width * 1.2 || y < -frame.height * 0.2 || y > frame.height * 1.2) continue;
            const hits = [outline.nearest(x, y, 30), borderIndex.nearest(x, y, 30, tag => tag !== index)].filter(Boolean).map(hit => hit.distance);
            const distance = hits.length ? Math.min(...hits) : 30;
            if (distance > 3) { const place = frame.fromMap(x, y); add('medium', 'cesko', 'hranice-do-ztracena', `Státní hranice na mapě Česka končí u ${fmt(place.lat, place.lon)} ${round(distance / czech.unitsPerKm(place.lat))} km od jiné hranice`); }
        }
    });
    return { kraje: czech.areas.length, rivers: riverLines.length, innerLines: inner.length, borderLines: borders.length, danglingInner: dangling };
};

// --- Státy -------------------------------------------------------------------------------------------------------------

const areaNameOf = (name) => AREA_ALIASES[name] || name;

export const checkStates = (world, data, add) => {
    const { countries, topics } = data;
    const zemepis = topics.zemepis || [];
    let withArea = 0;
    for (const [qid, country] of Object.entries(countries)) {
        if (world.areaByName.has(norm(areaNameOf(country.name)))) withArea++;
        else add('critical', 'staty', 'stat-bez-plochy', `Stát ${country.name} (${qid}) nemá na mapě světa plochu (areas): nejde ukázat „Tvůj tip: …“ ani obrys z podkladové mapy`, { q: qid, name: country.name });
    }
    const states = zemepis.filter(item => item.c === 'stat');
    let capitals = 0;
    for (const item of states) {
        const area = world.areaByName.get(norm(item.n));
        if (!area) {
            add('high', 'staty', 'stat-jmeno-plochy', `Položka státu ${item.n} (${item.q}) nemá plochu stejného jména: obrys ve výsledku se vezme z data/mapa-tvary.json místo z podkladové mapy`, { q: item.q, name: item.n });
            continue;
        }
        // Hlavní město (položka města se jménem z f.cap a stejným státem) leží v ploše státu
        const capital = item.f && item.f.cap ? zemepis.find(city => city.c === 'mesto' && city.n === item.f.cap && (city.co || []).includes(item.q)) : null;
        if (capital) {
            capitals++;
            const km = world.kmToArea(item.n, capital.la, capital.lo);
            if (km > COUNTRY_TOLERANCE_KM) add(km > 100 ? 'critical' : 'high', 'staty', 'hlavni-mesto-mimo', `Hlavní město ${capital.n} leží ${round(km)} km mimo plochu státu ${item.n}`, { q: item.q, name: item.n, km: round(km) });
        }
        // Bod státu (po opravě z data/mapa-opravy.json): špendlík ve výsledku, když hráč netipuje nebo trefí stát
        const [la, lo] = Array.isArray(data.fixes.points[item.q]) ? data.fixes.points[item.q] : [item.la, item.lo];
        const km = world.kmToArea(item.n, la, lo);
        if (km > 0) add(km > 150 ? 'medium' : 'info', 'staty', 'bod-statu-mimo', `Bod státu ${item.n} (${fmt(la, lo)}) leží ${round(km)} km mimo jeho plochu (špendlík ve výsledku je v moři nebo u souseda)`, { q: item.q, name: item.n, km: round(km) });
    }
    // Překryvy ploch a pevnina bez státu: mřížka po 4 jednotkách
    const step = 4;
    const pairs = new Map();
    const samples = new Map();
    let stateless = 0;
    const gaps = new Map();
    for (let x = step / 2; x < world.frame.width; x += step) {
        for (let y = step / 2; y < world.frame.height; y += step) {
            const hits = world.areasXY(x, y);
            for (const name of hits) samples.set(name, (samples.get(name) || 0) + 1);
            if (hits.length > 1) {
                for (let a = 0; a < hits.length; a++) for (let b = a + 1; b < hits.length; b++) { const pair = [hits[a], hits[b]].sort().join(' × '); pairs.set(pair, (pairs.get(pair) || 0) + 1); }
            }
            if (!hits.length && world.landXY(x, y) && !world.coast.nearest(x, y, 4)) {
                stateless++;
                const place = world.frame.fromMap(x, y);
                const cell = `${Math.round(place.lat / 4) * 4},${Math.round(place.lon / 4) * 4}`;
                gaps.set(cell, (gaps.get(cell) || 0) + 1);
            }
        }
    }
    for (const [pair, count] of pairs) {
        const [a, b] = pair.split(' × ');
        const smaller = Math.min(samples.get(a), samples.get(b));
        const share = count / smaller;
        if (share >= 0.15 && count >= 3) add('high', 'staty', 'plochy-prekryv', `Plochy ${pair} se překrývají z ${Math.round(share * 100)} % menší z nich`, { pair, share: round(share, 2) });
        else if (share >= 0.05 && count >= 3) add('low', 'staty', 'plochy-prekryv', `Plochy ${pair} se překrývají z ${Math.round(share * 100)} % menší z nich (hrubý obrys)`, { pair, share: round(share, 2) });
    }
    for (const [cell, count] of [...gaps].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
        if (count >= 4) add(count >= 40 ? 'medium' : 'low', 'staty', 'pevnina-bez-statu', `Pevnina kolem ${cell.replace(',', ', ')} neleží v ploše žádného státu (${count} bodů mřížky, asi ${count * 16} j²)`, { cell, count });
    }
    return { countries: Object.keys(countries).length, withArea, areas: world.areas.length, stateItems: states.length, capitalsChecked: capitals, overlapPairs: pairs.size, statelessLandPoints: stateless };
};

// --- Otázky: které položky se ptají a jak --------------------------------------------------------------------------------

// Položka s opravami z data/mapa-opravy.json (stejně jako aplikace): vyřazená se neptá, opravená poloha nahradí la/lo
export const askable = (data) => {
    const result = [];
    const all = [];
    for (const [topicId, items] of Object.entries(data.topics)) {
        // Otázka se sestaví jen se stejnojmennými položkami tématu místo se všemi: dvojznačnost i doplnění druhu do zadání
        // závisí jen na nich (a hledání stejného jména mezi tisíci položek u každé otázky by trvalo minuty)
        const sameName = new Map();
        for (const item of items) {
            const key = norm(item.n);
            if (!sameName.has(key)) sameName.set(key, []);
            sameName.get(key).push(item);
        }
        for (const original of items) {
            const ctx = { topic: { id: topicId }, items: sameName.get(norm(original.n)), countries: data.countries };
            const rule = (MQ.KINDS[topicId] || {})[original.c];
            if (!rule || !Number.isFinite(original.la)) continue;
            const group = MQ.groupOf(original);
            if (!group || !group.topics.includes(topicId)) continue;
            const allowed = rule === true || (Array.isArray(rule) && rule.includes(original.ty));
            const entry = { topicId, item: original, group: group.id, allowed, question: null, skipped: Boolean(data.fixes.skip[original.q]), moved: false, sameName: ctx.items };
            all.push(entry);
            if (!allowed || entry.skipped) continue;
            const fixed = data.fixes.points[original.q];
            const item = Array.isArray(fixed) ? { ...original, la: fixed[0], lo: fixed[1] } : original;
            entry.moved = item !== original;
            entry.placed = item;
            // Bez klíčů skip a points (aplikace je umí sama; tady jsou už použité), ať výsledek nezávisí na verzi question-map.js
            entry.question = MQ.buildQuestion(item, ctx, { regions: data.map.regions, shapes: data.shapes });
            if (entry.question) result.push(entry);
        }
    }
    return { asked: result, all };
};

// Státy, které položka uvádí (item.co → jména; sportoviště má jen jméno státu)
const claimedStates = (item, countries) => {
    const names = (item.co || []).map(qid => countries[qid] && countries[qid].name).filter(Boolean);
    if (!names.length && item.f && typeof item.f.land === 'string') names.push(item.f.land);
    return names;
};
const acceptsArea = (areaName, claimed, lat, lon) => {
    if (!areaName) return false;
    if (claimed.includes(areaName) || areaName === 'Antarktida') return true;
    if ((TERRITORY_OF[areaName] || []).some(state => claimed.includes(state))) return true;
    return DISPUTED.some(({ box, states }) => lat >= box[0] && lat <= box[1] && lon >= box[2] && lon <= box[3] && states.includes(areaName) && states.some(state => claimed.includes(state)));
};
const SHAPE_KINDS = new Set(['staty', 'regiony', 'pohori', 'reky', 'more', 'jezera', 'ostrovy', 'priroda']);
const LAND_KINDS = new Set(['staty', 'regiony', 'pohori', 'ostrovy', 'priroda']);
const UNIQUE_PLACE_KINDS = new Set(['mesta', 'hory', 'ostrovy', 'jezera', 'staty', 'regiony', 'reky', 'pohori', 'more']);

export const checkPositions = (world, data, asked, add) => {
    const stats = { checked: 0, countryChecked: 0, lakesDrawn: 0, lakesNotDrawn: 0 };
    // Města podle jména (jen jednoznačná jména se použijí)
    const cityIndex = new Map();
    for (const city of (data.topics.zemepis || []).filter(item => item.c === 'mesto' && Number.isFinite(item.la))) {
        const key = norm(city.n);
        if (!cityIndex.has(key)) cityIndex.set(key, []);
        cityIndex.get(key).push(city);
    }
    for (const entry of asked) {
        const { item, question, topicId, group } = entry;
        const lat = question.map.lat, lon = question.map.lon;
        const base = { q: item.q, name: item.n, topic: topicId, kind: group, k: item.k || 0, lat, lon };
        stats.checked++;
        // Stát
        const claimed = claimedStates(item, data.countries);
        if (claimed.length && group !== 'more' && group !== 'staty') {
            stats.countryChecked++;
            const [x, y] = world.toMap(lat, lon);
            const found = world.areasXY(x, y);
            // Bod těsně za hrubým obrysem ploch (pobřeží, hranice): platí i plochy do tolerance
            const near = found.some(name => acceptsArea(name, claimed, lat, lon)) ? found : world.areasNear(lat, lon, found.length ? COUNTRY_TOLERANCE_KM : SEA_TOLERANCE_KM);
            if (![...found, ...near].some(name => acceptsArea(name, claimed, lat, lon))) {
                const candidates = [...claimed, ...Object.entries(TERRITORY_OF).filter(([, states]) => states.some(state => claimed.includes(state))).map(([territory]) => territory)];
                const km = Math.min(...candidates.map(name => world.kmToArea(name, lat, lon)));
                const wide = SHAPE_KINDS.has(group) && Boolean(question.map.shape);
                // Místo na ostrově bez plochy státu (zámořská území, která mapa států nemá) není chyba polohy;
                // historické události uvádějí i tehdejší státy (bitva v dnešním Polsku „v Rusku“)
                const soft = wide || !found.length || topicId === 'historie';
                const severity = km > FAR_KM ? (soft ? 'medium' : 'high') : (soft ? 'low' : 'medium');
                const where = found.length ? `ve státě ${found[0]}` : (world.landXY(x, y) ? 'na pevnině bez plochy státu' : 'v moři');
                add(found.length ? severity : 'info', 'polohy', found.length ? 'jiny-stat' : 'bez-plochy-statu', `${item.n}: bod ${fmt(lat, lon)} leží ${where}, ${Number.isFinite(km) ? `${round(km)} km od` : 'mimo'} ${claimed.slice(0, 3).join(', ')}${claimed.length > 3 ? '…' : ''}`,
                    { ...base, km: Number.isFinite(km) ? round(km) : null, found: found[0] || null, claimed });
            }
        }
        // Bodová místa: hrubé souřadnice (celé stupně = poloha jen přibližná, událost na velkém území) a místo daleko
        // od města, které položka sama uvádí (f.city u staveb, f.place u bitev a událostí)
        if (!question.map.shape) {
            const whole = (value) => Math.abs(value - Math.round(value * 2) / 2) < 1e-9;
            if (whole(item.la) && whole(item.lo)) {
                add(question.map.region === 'cesko' ? 'medium' : 'low', 'polohy', 'hruba-poloha', `${item.n}: souřadnice ${item.la}, ${item.lo} jsou jen na půl stupně (asi ±40 km) – poloha je přibližná nebo jde o událost na velkém území`, base);
            }
            const placeName = item.f && (item.f.city || item.f.place);
            // Jen město ve státě položky a jen jednoznačné jméno (Mérida ve Španělsku × v Mexiku); k ruční kontrole –
            // špatně může být bod i uvedené město (Leeds Castle neleží v Leedsu, Vítkov je i vrch v Praze)
            const cities = (placeName ? cityIndex.get(norm(placeName)) || [] : []).filter(city => (city.co || []).some(qid => (item.co || []).includes(qid)));
            if (cities.length === 1) {
                const km = haversineKm([lat, lon], [cities[0].la, cities[0].lo]);
                const limit = group === 'bitvy' || group === 'udalosti' ? 120 : 60;
                if (km > limit) add('low', 'polohy', 'daleko-od-mesta', `${item.n}: bod ${fmt(lat, lon)} je ${round(km)} km od města ${cities[0].n}, které položka uvádí jako místo (špatně může být bod i uvedené město)`, { ...base, km: round(km) });
            }
        }
        // Pevnina a voda
        if (question.map.region !== 'cesko') {
            // Ostrovy a souostroví řeší kontrola obrysů (nenakresleno); bod státu v moři je v oddíle Státy
            if (LAND_KINDS.has(group) && group !== 'ostrovy' && group !== 'staty' && question.map.shape && !world.landNear(lat, lon, 25)) {
                add('medium', 'polohy', 'bod-v-mori', `${item.n}: bod ${fmt(lat, lon)} leží v moři dál než 25 km od nakreslené pevniny`, base);
            }
            if (group === 'jezera') {
                if (world.isLake(lat, lon) || world.shoreKm(lat, lon, 10) <= 10) stats.lakesDrawn++;
                else {
                    stats.lakesNotDrawn++;
                    if (!world.landNear(lat, lon, 10)) add('low', 'polohy', 'jezero-v-mori', `${item.n}: bod jezera ${fmt(lat, lon)} leží na mapě v moři (laguna nebo záliv, který podkladová mapa kreslí jako moře)`, base);
                }
            }
            if (group === 'more') {
                if (world.isLand(lat, lon) && !world.isLake(lat, lon) && world.coastKm(lat, lon, 30) > 30) add('low', 'polohy', 'more-na-pevnine', `${item.n}: bod ${fmt(lat, lon)} leží na pevnině dál než 30 km od pobřeží`, base);
            }
            if (group === 'reky' && !world.landNear(lat, lon, 30)) add('low', 'polohy', 'reka-v-mori', `${item.n}: bod řeky ${fmt(lat, lon)} leží v moři dál než 30 km od břehu`, base);
        }
    }
    // Stejné souřadnice u různých míst
    const byPoint = new Map();
    for (const entry of asked) {
        const key = `${round(entry.question.map.lat, 3)},${round(entry.question.map.lon, 3)}`;
        if (!byPoint.has(key)) byPoint.set(key, []);
        byPoint.get(key).push(entry);
    }
    let sharedSites = 0;
    for (const [key, entries] of byPoint) {
        const distinct = [...new Map(entries.map(entry => [entry.item.q, entry])).values()];
        if (distinct.length < 2) continue;
        const names = new Set(distinct.map(entry => norm(entry.item.n)));
        if (names.size < 2) continue;
        // U míst s obrysem bod o výsledku nerozhoduje (měří se od obrysu): vadí jen stejný bod u dvou míst bez obrysu
        const unique = distinct.filter(entry => UNIQUE_PLACE_KINDS.has(entry.group) && !entry.question.map.shape);
        const sameKind = unique.some(a => unique.some(b => a !== b && a.group === b.group));
        if (sameKind) add('medium', 'polohy', 'stejne-souradnice', `Stejné souřadnice ${key.replace(',', ', ')}: ${distinct.map(entry => `${entry.item.n} (${entry.group}, ${entry.item.q})`).join(' × ')}`, { key, items: distinct.map(entry => entry.item.q) });
        else sharedSites++;
    }
    stats.sharedSites = sharedSites;
    return stats;
};

// --- Obrysy ------------------------------------------------------------------------------------------------------------

const KIND_MIN_KM2 = { pohori: 200, regiony: 5, priroda: 1 };
const SEA_MOUTH = /moře|oceán|záliv|zátoka|průliv|atlantik|pacifik|lamanš|kanál|fjord|úžina|delta/iu;

export const checkShapes = (world, data, asked, add) => {
    const byName = new Map();
    for (const entry of asked) if (entry.topicId === 'zemepis' && !byName.has(norm(entry.item.n))) byName.set(norm(entry.item.n), entry);
    const ranked = [];
    const stats = { shapes: Object.keys(data.shapes).length, checked: 0, lines: 0, flagged: 0, orphan: 0, basemapOutline: 0 };
    const usedQids = new Set(Object.values(data.topics).flat().map(item => item.q));
    stats.orphan = Object.keys(data.shapes).filter(qid => !usedQids.has(qid)).length;
    for (const entry of asked) {
        const { item, question, group } = entry;
        if (!question.map.shape) continue;
        stats.checked++;
        const rings = MQ.decodeShape(question.map.shape);
        const lat = question.map.lat, lon = question.map.lon;
        const reasons = [];
        const reason = (code, score, text) => reasons.push({ code, score: Math.round(score), text });
        const metrics = {};
        const claimed = claimedStates(item, data.countries);
        const inCzechia = question.map.region === 'cesko';
        if (!rings.length) { reason('prazdny', 100, 'obrys se nepodařilo rozložit (žádný kroužek)'); }
        else if (rings.line) {
            stats.lines++;
            const km = rings.reduce((sum, line) => sum + lineKm(line), 0);
            const pointKm = distanceToLinesKm(rings, lat, lon);
            metrics.km = round(km);
            metrics.pointKm = round(pointKm);
            const length = item.f && item.f.len;
            if (length > 0) {
                const ratio = km / length;
                metrics.lengthRatio = round(ratio, 2);
                if (ratio < 0.5 || ratio > 1.3) reason('delka', 10 + 25 * Math.abs(Math.log2(ratio)), `čára má ${round(km)} km, řeka podle dat ${length} km (${round(ratio, 2)}×)`);
            }
            if (pointKm > 50) reason('bod-daleko', 20 + Math.min(60, pointKm / 10), `bod položky je ${round(pointKm)} km od čáry`);
            const parts = lineComponents(rings, 8);
            metrics.pieces = rings.length;
            metrics.components = parts.components;
            if (parts.components > 1 && parts.gapKm > 20) reason('mezera', Math.min(60, 10 + parts.gapKm / 4), `čára je přerušená: ${parts.components} nesouvislé části, mezera ${round(parts.gapKm)} km`);
            // Body podél čáry: v moři, mimo uvedené státy
            const probes = [];
            for (const line of rings) {
                for (let i = 0; i < line.length; i++) {
                    probes.push(line[i]);
                    if (i) probes.push([(line[i][0] + line[i - 1][0]) / 2, (line[i][1] + line[i - 1][1]) / 2]);
                }
            }
            const wet = probes.filter(([la, lo]) => !world.landNear(la, lo, 15)).length / probes.length;
            metrics.seaShare = round(wet, 2);
            if (wet > 0.12) reason('v-mori', 10 + wet * 100, `${Math.round(wet * 100)} % čáry vede mořem (dál než 15 km od nakreslené pevniny)`);
            if (claimed.length) {
                const foreign = probes.filter(([la, lo]) => {
                    const [x, y] = world.toMap(la, lo);
                    const found = world.areasXY(x, y);
                    return found.length && !found.some(name => acceptsArea(name, claimed, la, lo)) && Math.min(...claimed.map(name => world.kmToArea(name, la, lo))) > COUNTRY_TOLERANCE_KM;
                }).length / probes.length;
                metrics.foreignShare = round(foreign, 2);
                if (foreign > 0.25) reason('mimo-stat', 10 + foreign * 60, `${Math.round(foreign * 100)} % čáry leží ve státech, které řeka neuvádí`);
            }
            // Ústí: řeka ústící do moře má konec u pobřeží, řeka ústící do jiné řeky nebo jezera z dat u jeho obrysu
            const mouth = item.f && item.f.mouth;
            const ends = rings.flatMap(line => [line[0], line[line.length - 1]]);
            if (mouth && !inCzechia) {
                const target = byName.get(norm(mouth));
                const targetShape = target && target.question.map.shape ? MQ.decodeShape(target.question.map.shape) : null;
                if (targetShape && targetShape.length) {
                    const km2 = Math.min(...ends.map(([la, lo]) => (!targetShape.line && insideGeoRings(targetShape, la, lo) ? 0 : distanceToLinesKm(targetShape, la, lo, !targetShape.line))));
                    metrics.mouthKm = round(km2);
                    if (km2 > 60) reason('usti', Math.min(50, 15 + km2 / 10), `žádný konec čáry není u ústí (${mouth}): nejblíž ${round(km2)} km`);
                } else if (SEA_MOUTH.test(mouth)) {
                    const km2 = Math.min(...ends.map(([la, lo]) => (world.isLand(la, lo) ? Math.min(world.coastKm(la, lo, 400), world.shoreKm(la, lo, 400)) : 0)));
                    metrics.mouthKm = Number.isFinite(km2) ? round(km2) : null;
                    if (km2 > 60) reason('usti', Math.min(50, 15 + (Number.isFinite(km2) ? km2 : 400) / 10), `řeka ústí do „${mouth}“, ale žádný konec čáry není u pobřeží (nejblíž ${Number.isFinite(km2) ? `${round(km2)} km` : 'přes 400 km'})`);
                }
            }
            if (rings.some(line => line.length < 2)) reason('kratka-cara', 5, 'úsek s jediným bodem');
        } else {
            const box = geoBox(rings);
            const diagonal = boxDiagonalKm(box);
            const inside = insideGeoRings(rings, lat, lon);
            const pointKm = inside ? 0 : distanceToLinesKm(rings, lat, lon, true);
            const km2 = shapeKm2(rings);
            metrics.km2 = round(km2);
            metrics.pointKm = round(pointKm);
            metrics.rings = rings.length;
            if (box.lon1 - box.lon0 > 180) reason('pres-pul-sveta', 40, `obrys je široký ${round(box.lon1 - box.lon0)}° délky`);
            if (!inside && pointKm > Math.max(20, 0.15 * diagonal)) reason('bod-mimo', 25 + Math.min(60, 100 * pointKm / Math.max(diagonal, 1)), `bod položky leží ${round(pointKm)} km mimo obrys (obrys měří ${round(diagonal)} km)`);
            const area = item.f && item.f.area;
            if (area > 0 && km2 > 0) {
                const ratio = km2 / area;
                metrics.areaRatio = round(ratio, 2);
                const limit = group === 'staty' || group === 'more' ? 3 : 2.5;
                // Bod uvnitř obrysu: stejně často je špatně údaj o rozloze v datech (f.area) jako obrys – menší váha
                if (ratio > limit || ratio < 1 / limit) reason('rozloha', Math.min(inside ? 28 : 90, 10 + 22 * Math.abs(Math.log2(ratio))), `obrys má ${round(km2)} km², podle dat ${area} km² (${round(ratio, 2)}×${inside ? '; bod leží uvnitř – může být špatně i rozloha v datech' : ''})`);
            } else if (!(km2 > 0)) reason('nulova-plocha', 80, 'obrys má nulovou plochu');
            if (group === 'pohori' && item.f && item.f.len > 0) {
                const ratio = diagonal / item.f.len;
                metrics.lengthRatio = round(ratio, 2);
                if (ratio < 0.3 || ratio > 3) reason('delka-pohori', 12 + 15 * Math.abs(Math.log2(ratio)), `obrys měří ${round(diagonal)} km, pohoří podle dat ${item.f.len} km (${round(ratio, 2)}×)`);
            }
            if (KIND_MIN_KM2[group] && km2 < KIND_MIN_KM2[group] && !(area > 0 && area < KIND_MIN_KM2[group] * 2)) reason('prilis-maly', 30, `obrys má jen ${round(km2, 1)} km² (podezřele malý mnohoúhelník pro ${group})`);
            // Vzorky uvnitř obrysu proti podkladové mapě
            const samples = samplesInside(rings, 140);
            // Ostrůvek nebo ministát menší než pár čtverečních jednotek mapy je nakreslený jen jako tečka: stačí pevnina u bodu
            const dot = km2 * world.unitsPerKm(lat) ** 2 < 4 && world.landNear(lat, lon, 8);
            metrics.dot = dot || undefined;
            if (samples.length >= 3 && !inCzechia && !dot) {
                const xy = samples.map(([la, lo]) => world.toMap(la, lo));
                const land = xy.filter(([x, y]) => world.landXY(x, y)).length / xy.length;
                const lake = xy.filter(([x, y]) => world.lakeXY(x, y)).length / xy.length;
                metrics.landShare = round(land, 2);
                const tinyState = group === 'staty' && (world.areaByName.get(norm(item.n)) || { rings: [] }).rings.reduce((sum, ring) => sum + ringArea(ring), 0) < 40;
                if (LAND_KINDS.has(group) && !tinyState) {
                    if (land === 0 && !world.landNear(lat, lon, 6)) reason('nenakresleno', group === 'staty' ? 45 : 35, 'na podkladové mapě v místě obrysu žádná pevnina není (hráč hledá místo, které na mapě nevidí)');
                    else if (land < 0.6) {
                        const marine = item.ty === 'národní park' || item.ty === 'souostroví' || group === 'staty';
                        reason('na-vode', (marine ? 5 : 15) + (0.6 - land) * (marine ? 40 : 90), `jen ${Math.round(land * 100)} % obrysu leží na nakreslené pevnině`);
                    }
                }
                if (group === 'more' && land > 0.3) reason('na-pevnine', 15 + (land - 0.3) * 110, `${Math.round(land * 100)} % obrysu moře leží na nakreslené pevnině`);
                if (group === 'jezera') {
                    metrics.lakeShare = round(lake, 2);
                    const drawn = world.isLake(lat, lon) || lake > 0.2;
                    metrics.drawn = drawn;
                    if (drawn && lake < 0.5) reason('jezero-nesedi', 15 + (0.5 - lake) * 50, `jen ${Math.round(lake * 100)} % obrysu leží v jezeře nakresleném na mapě`);
                    // Laguna, kterou podkladová mapa kreslí jako záliv moře (Maracaibo): zvýraznění je vidět, jen to na mapě není jezero
                    if (land < 0.5) reason('jezero-je-more', 6, `podkladová mapa kreslí jezero jako záliv moře (${Math.round((1 - land) * 100)} % obrysu na vodě)`);
                }
                if (claimed.length && group !== 'more' && group !== 'jezera') {
                    let known = 0, own = 0;
                    xy.forEach(([x, y], i) => {
                        const found = world.areasXY(x, y);
                        if (!found.length) return;
                        known++;
                        if (found.some(name => acceptsArea(name, claimed, samples[i][0], samples[i][1]))) own++;
                    });
                    if (known >= 3) {
                        const share = own / known;
                        metrics.ownShare = round(share, 2);
                        const limit = group === 'regiony' || group === 'staty' ? 0.85 : 0.7;
                        if (share < limit) reason('mimo-stat', 12 + (limit - share) * 90, `jen ${Math.round(share * 100)} % obrysu leží ve státech, které položka uvádí (${claimed.slice(0, 3).join(', ')})`);
                    }
                }
                // Stát: obrys má pokrývat plochu státu na podkladové mapě (zvýrazní se plocha, body se počítají z obrysu)
                if (group === 'staty') {
                    const area2 = world.areaByName.get(norm(item.n));
                    // Ostrovní ministát (plocha na mapě pod 40 čtverečních jednotek) je na mapě jen pár zaokrouhlených
                    // kroužků: přesné krytí s obrysem nejde čekat
                    if (area2 && area2.rings.reduce((sum, ring) => sum + ringArea(ring), 0) >= 40) {
                        const [x0, y0, x1, y1] = area2.box;
                        let total = 0, covered = 0;
                        const stepX = Math.max(0.5, (x1 - x0) / 24), stepY = Math.max(0.5, (y1 - y0) / 24);
                        for (let x = x0 + stepX / 2; x < x1; x += stepX) {
                            for (let y = y0 + stepY / 2; y < y1; y += stepY) {
                                if (!area2.set.contains(x, y)) continue;
                                total++;
                                const place = world.frame.fromMap(x, y);
                                if (insideGeoRings(rings, place.lat, place.lon)) covered++;
                            }
                        }
                        if (total >= 4) {
                            metrics.areaCovered = round(covered / total, 2);
                            if (covered / total < 0.85) reason('stat-nesedi-s-mapou', 15 + (0.85 - covered / total) * 80, `obrys pokrývá jen ${Math.round(100 * covered / total)} % plochy státu na podkladové mapě`);
                        }
                        const inArea = xy.filter(([x, y]) => area2.set.contains(x, y)).length / xy.length;
                        metrics.inArea = round(inArea, 2);
                        if (inArea < 0.8) reason('stat-nesedi-s-mapou', 15 + (0.8 - inArea) * 80, `jen ${Math.round(inArea * 100)} % obrysu leží v ploše státu na podkladové mapě (zvýrazní se jiná plocha, než ze které se počítají body)`);
                    }
                }
            }
            // Obrys z podkladové mapy (ostrov, jezero): použije se, když plocha sedí 0,5–2×; jinak je vidět rozdíl proti mapě
            if (!inCzechia && !dot && (group === 'ostrovy' || group === 'jezera')) {
                const [x, y] = world.toMap(lat, lon);
                const set = group === 'ostrovy' ? world.allLand : world.lakeSet;
                const around = set.smallestAround(x, y);
                if (around) {
                    const wanted = rings.reduce((sum, ring) => sum + ringArea(ring.map(([la, lo]) => world.toMap(la, lo))), 0);
                    const ratio = around.area / wanted;
                    metrics.basemapRatio = round(ratio, 2);
                    if (ratio > 0.5 && ratio < 2) stats.basemapOutline++;
                    else if (group === 'jezera' || ratio < 50) reason('jiny-nez-mapa', 8 + Math.min(25, 8 * Math.abs(Math.log2(ratio))), `${group === 'ostrovy' ? 'ostrov' : 'jezero'} na podkladové mapě je ${round(ratio, 2)}× větší než obrys (zvýrazní se obrys, ne tvar z mapy)`);
                }
            }
            // Geometrie: křížení, drobné kroužky, nudle
            let crossings = 0, tiny = 0, degenerate = 0;
            let largest = null;
            for (const ring of rings) {
                const ringKm2 = sphericalKm2(ring);
                if (!largest || ringKm2 > largest.km2) largest = { ring, km2: ringKm2 };
                if (ring.length < 4) degenerate++;
                if (ringKm2 < Math.max(0.05, km2 * 0.0005)) tiny++;
                if (ring.length <= 600) crossings += selfCrossings(ring.map(([la, lo]) => [lo * Math.cos(la * Math.PI / 180), la]));
            }
            if (crossings) reason('krizeni', 6 + Math.min(24, crossings * 3), `obrys se sám kříží (${crossings}×)`);
            if (tiny >= 4) reason('drobne-krouzky', 4 + Math.min(10, tiny), `${tiny} drobných kroužků (pod 0,05 % plochy)`);
            if (degenerate && rings.length === degenerate) reason('trojuhelnik', 20, 'obrys je jen trojúhelník');
            if (largest && largest.km2 > 0) {
                const perimeter = lineKm([...largest.ring, largest.ring[0]]);
                const compact = 4 * Math.PI * largest.km2 / (perimeter * perimeter);
                metrics.compact = round(compact, 3);
                if (compact < 0.02 && group !== 'more') reason('nudle', 14, `největší kroužek je úzká nudle (kompaktnost ${round(compact, 3)})`);
            }
        }
        const score = reasons.reduce((sum, entry2) => sum + entry2.score, 0);
        if (reasons.length) {
            stats.flagged++;
            ranked.push({ q: item.q, name: item.n, kind: group, k: item.k || 0, topic: entry.topicId, ty: item.ty || '', lat, lon, score, reasons, metrics });
        }
    }
    ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'cs'));
    for (const shape of ranked) {
        const severity = shape.score >= 60 ? 'high' : shape.score >= 30 ? 'medium' : 'low';
        add(severity, 'tvary', shape.reasons[0].code, `${shape.name} (${shape.kind}): ${shape.reasons.map(entry => entry.text).join('; ')}`, { q: shape.q, name: shape.name, kind: shape.kind, k: shape.k, score: shape.score });
    }
    return { stats, ranked };
};

// --- Sestavení otázek ----------------------------------------------------------------------------------------------------

const TITLE_PATTERNS = [
    ['Kde leží …?', /^Kde leží .+\?$/u], ['Kde stojí …?', /^Kde stojí .+\?$/u], ['Kudy teče …?', /^Kudy teče .+\?$/u],
    ['Kde se odehrála bitva …?', /^Kde se odehrála (bitva|námořní bitva) .+\?$/u], ['Kde se odehrálo obléhání …?', /^Kde se odehrálo obléhání .+\?$/u],
    ['Kde se konala …?', /^Kde se konala .+\?$/u], ['Kde byla podepsána …?', /^Kde byla podepsána .+\?$/u], ['… – kde se to stalo?', /^.+ – kde se to stalo\?$/u]
];
const FEMININE_MEETING = /(konference|schůzka|schůze|rada|porada)(\s|$)/iu;
const FEMININE_TREATY = /(smlouva|dohoda|úmluva|charta|deklarace)(\s|$)/iu;

export const checkQuestions = (data, asked, all, add) => {
    const patterns = Object.fromEntries(TITLE_PATTERNS.map(([label]) => [label, { count: 0, examples: [] }]));
    const disambiguated = [];
    const stats = { built: asked.length, views: { cesko: 0, world: 0, continent: 0 } };
    for (const entry of asked) {
        const { item, question, group, topicId } = entry;
        const map = question.map;
        const base = { q: item.q, name: item.n, topic: topicId, kind: group, k: item.k || 0 };
        // Poloměry bodů
        if (!(Number.isInteger(map.full) && Number.isInteger(map.zero) && map.full > 0 && map.zero > map.full)) add('critical', 'otazky', 'polomery', `${item.n}: poloměry bodů full ${map.full}, zero ${map.zero}`, base);
        else if (map.full > 1500 || map.zero > 6000) add('high', 'otazky', 'polomery-velke', `${item.n}: plné body do ${map.full} km, žádné od ${map.zero} km`, base);
        // Oblast a pohled
        const region = MQ.REGION_BY_ID[map.region];
        if (!region || region.id === 'svet') add('critical', 'otazky', 'oblast', `${item.n}: neznámá oblast ${map.region}`, base);
        else {
            if (!MQ.insideFrame(region, map.lat, map.lon)) add('critical', 'otazky', 'mimo-vyrez', `${item.n}: bod leží mimo výřez oblasti ${region.label}`, base);
            const frame = MQ.frameOf(region);
            const [x, y] = frame.toMap(map.lat, map.lon);
            const edge = Math.min(x / frame.width, 1 - x / frame.width, y / frame.height, 1 - y / frame.height);
            if ((map.view === 'cesko') !== (region.id === 'cesko')) add('critical', 'otazky', 'pohled', `${item.n}: pohled ${map.view} v oblasti ${region.id}`, base);
            if (map.view === 'continent') {
                if (MQ.viewFor(item) !== 'continent') add('critical', 'otazky', 'pohled', `${item.n}: pohled na kontinent, i když má začínat na světě`, base);
                if (edge < 0.18 - 1e-9) add('critical', 'otazky', 'pohled-okraj', `${item.n}: pohled na kontinent, ale bod je ${Math.round(edge * 100)} % od okraje výřezu (má být aspoň 18 %)`, base);
                if (map.shape) {
                    const projection = MQ.projectionOf(region);
                    const out = MQ.decodeShape(map.shape).flat().filter(([lat, lon]) => {
                        if (projection.angle(lat, lon) > 80) return true;
                        const [px, py] = frame.toMap(lat, lon);
                        return px < frame.width * 0.06 || px > frame.width * 0.94 || py < frame.height * 0.06 || py > frame.height * 0.94;
                    }).length;
                    if (out) add('critical', 'otazky', 'pohled-obrys', `${item.n}: pohled na kontinent, ale ${out} bodů obrysu leží u okraje nebo mimo výřez`, base);
                }
            }
            if (region.id === 'cesko' && edge < 0.02) add('low', 'otazky', 'okraj-mapy', `${item.n}: bod je na samém okraji mapy Česka`, base);
        }
        stats.views[map.view] = (stats.views[map.view] || 0) + 1;
        if (!['cesko', 'world', 'continent'].includes(map.view)) add('critical', 'otazky', 'pohled', `${item.n}: neznámý pohled ${map.view}`, base);
        if (map.kind !== group) add('critical', 'otazky', 'druh', `${item.n}: druh otázky ${map.kind} neodpovídá skupině ${group}`, base);
        if (MQ.needsShape(item) && !map.shape) add('critical', 'otazky', 'bez-obrysu', `${item.n}: plošné místo bez obrysu`, base);
        if (map.shape && MQ.isLine(map.shape) !== (item.c === 'reka')) add('critical', 'otazky', 'cara', `${item.n}: ${item.c === 'reka' ? 'řeka má plochu místo čáry' : 'čára u místa, které není řeka'}`, base);
        // Zadání
        const title = question.title;
        const pattern = TITLE_PATTERNS.find(([, regex]) => regex.test(title));
        if (!pattern) add('critical', 'otazky', 'zadani', `${item.n}: zadání „${title}“ neodpovídá žádnému vzoru`, base);
        else { patterns[pattern[0]].count++; if (patterns[pattern[0]].examples.length < 6 && (patterns[pattern[0]].count % 37 === 1 || patterns[pattern[0]].count <= 2)) patterns[pattern[0]].examples.push(title); }
        if (!/^\p{Lu}|^\d|^[„"«]/u.test(title)) add('high', 'otazky', 'zadani-male-pismeno', `Zadání začíná malým písmenem: „${title}“`, base);
        if (/\s{2,}|undefined|null|NaN/.test(title)) add('critical', 'otazky', 'zadani', `Rozbité zadání: „${title}“`, base);
        if (/^Kde se konala /u.test(title) && !FEMININE_MEETING.test(item.n)) add('medium', 'otazky', 'zadani-rod', `Zadání nesedí v rodě: „${title}“`, base);
        if (/^Kde byla podepsána /u.test(title) && !FEMININE_TREATY.test(item.n)) add('medium', 'otazky', 'zadani-rod', `Zadání nesedí v rodě: „${title}“`, base);
        if (title !== MQ.titleFor(item)) disambiguated.push({ ...base, title });
        if (question.answerLabel !== item.n) add('critical', 'otazky', 'odpoved', `${item.n}: odpověď „${question.answerLabel}“`, base);
    }
    // Stejné jméno u různých míst: zadání musí říct druh
    const byName = new Map();
    for (const entry of asked) {
        const key = norm(entry.item.n);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(entry);
    }
    let sameNames = 0;
    for (const entries of byName.values()) {
        const distinct = [...new Map(entries.map(entry => [entry.item.q, entry])).values()];
        if (distinct.length < 2) continue;
        const apart = distinct.some(a => distinct.some(b => a !== b && haversineKm([a.question.map.lat, a.question.map.lon], [b.question.map.lat, b.question.map.lon]) > 30));
        if (!apart) continue;
        sameNames++;
        // Zadání bez doplněného druhu u míst, která se od sebe liší (jedna zpráva na skupinu jmen)
        const plain = distinct.filter(entry => entry.question.title === MQ.titleFor(entry.item) && !(entry.item.ty && norm(entry.item.n).includes(norm(entry.item.ty))));
        if (!plain.length) continue;
        const sameKind = plain.some(entry => distinct.some(other => other !== entry && other.group === entry.group
            && haversineKm([entry.question.map.lat, entry.question.map.lon], [other.question.map.lat, other.question.map.lon]) > 30));
        const sameTopic = plain.some(entry => distinct.some(other => other !== entry && other.topicId === entry.topicId && other.group !== entry.group));
        const list = distinct.map(entry => `${entry.item.n} (${entry.group}, ${entry.topicId}, ${entry.item.q})`).join(' × ');
        // Stejný druh ve dvou tématech hra nerozliší vůbec; jiný druh rozliší štítek nad otázkou (Region · na mapě), v témže
        // tématu má navíc zadání druh doplnit
        add(sameKind ? 'medium' : sameTopic ? 'low' : 'info', 'otazky', 'stejne-jmeno',
            `Stejné jméno bez druhu v zadání („${plain[0].question.title}“): ${list}${sameKind ? ' – stejný druh, otázky se neliší' : sameTopic ? '' : ' – různá témata, rozliší jen štítek druhu nad otázkou'}`,
            { name: distinct[0].item.n, items: distinct.map(entry => entry.item.q) });
    }
    stats.sameNames = sameNames;
    stats.disambiguated = disambiguated.length;
    return { stats, patterns, disambiguated };
};

// --- Pokrytí -----------------------------------------------------------------------------------------------------------

export const coverage = (world, asked, all) => {
    const rows = MQ.MAP_GROUPS.map(group => ({ id: group.id, label: group.label, levels: { 1: { items: 0, built: 0, shape: 0 }, 0: { items: 0, built: 0, shape: 0 } }, skipped: 0, notAllowed: 0 }));
    const byId = Object.fromEntries(rows.map(row => [row.id, row]));
    for (const entry of all) {
        const row = byId[entry.group];
        const level = row.levels[entry.item.k === 1 ? 1 : 0];
        level.items++;
        if (entry.skipped) row.skipped++;
        if (!entry.allowed) row.notAllowed++;
        if (entry.question) { level.built++; if (entry.question.map.shape) level.shape++; }
    }
    return rows;
};

// Proč se na položku mapa neptá (položky povoleného druhu s polohou): důvod → položky
export const notAsked = (data, all) => {
    const reasons = {
        opravy: 'vyřazeno v data/mapa-opravy.json', 'bez-obrysu': 'plošné místo nebo řeka bez obrysu v data/mapa-tvary.json',
        'cesko-mimo': 'položka uvádí Česko mezi více státy, ale bod leží mimo mapu Česka (regionFor nevrátí oblast)',
        'bez-kontinentu': 'položka uvádí jen státy, které hra nezná (SSSR, nacistické Německo…), nebo státy z více kontinentů bez většiny – kontinent se neurčí, i když bod leží ve výřezu',
        'mimo-vyrez': 'bod leží mimo výřez svého kontinentu (odlehlé ostrovy, Sibiř u státu Rusko, Antarktida)',
        dvojznacne: 'stejné jméno má jiné místo téhož druhu dál než 30 km', 'cesko-pravidla': 'Česko na mapě Česka nebo stavba ve velkém českém městě',
        'mimo-pevninu': 'bod neleží na nakreslené pevnině (moře, nenakreslený ostrov)'
    };
    const result = Object.fromEntries(Object.keys(reasons).map(code => [code, { label: reasons[code], items: [] }]));
    const shapes = data.shapes;
    for (const entry of all) {
        if (entry.question || !entry.allowed) continue;
        const item = entry.item;
        let code;
        if (entry.skipped) code = 'opravy';
        else if (MQ.needsShape(item) && typeof shapes[item.q] !== 'string') code = 'bez-obrysu';
        else {
            const region = MQ.regionFor(item, data.countries);
            if (!region) {
                const czech = (item.co || []).includes(core.CZECHIA_QID) && (item.co || []).length > 1;
                const byPoint = MQ.regionFor({ ...item, co: [] }, data.countries);
                code = czech ? 'cesko-mimo' : (item.co || []).length && !core.getContinent(item, data.countries) && byPoint ? 'bez-kontinentu' : 'mimo-vyrez';
            }
            else if (MQ.isAmbiguous(item, entry.sameName)) code = 'dvojznacne';
            else if (!MQ.candidate(item, { topic: { id: entry.topicId }, items: [item], countries: data.countries }, null)) code = 'cesko-pravidla';
            else code = 'mimo-pevninu';
        }
        result[code].items.push({ q: item.q, name: item.n, kind: entry.group, topic: entry.topicId, k: item.k || 0 });
    }
    return result;
};

// --- Soubor oprav --------------------------------------------------------------------------------------------------------

export const checkFixes = (data, add) => {
    const qids = new Map(Object.entries(data.topics).flatMap(([topicId, items]) => items.map(item => [item.q, { item, topicId }])));
    const { skip, points } = data.fixes;
    for (const [qid, reason] of Object.entries(skip)) {
        if (!qids.has(qid)) add('critical', 'opravy', 'neznama-polozka', `skip: ${qid} není v datech témat s mapou`);
        if (typeof reason !== 'string' || reason.length < 8) add('critical', 'opravy', 'bez-duvodu', `skip: ${qid} nemá důvod`);
    }
    for (const [qid, point] of Object.entries(points)) {
        const found = qids.get(qid);
        if (!found) { add('critical', 'opravy', 'neznama-polozka', `points: ${qid} není v datech témat s mapou`); continue; }
        if (!Array.isArray(point) || point.length !== 2 || !(Math.abs(point[0]) <= 90) || !(Math.abs(point[1]) <= 180)) { add('critical', 'opravy', 'spatny-bod', `points: ${qid} nemá bod [šířka, délka]`); continue; }
        if (skip[qid]) add('critical', 'opravy', 'dvakrat', `${qid} je v skip i points`);
        const moved = haversineKm([found.item.la, found.item.lo], point);
        if (moved < 1) add('low', 'opravy', 'zbytecna', `points: ${found.item.n} (${qid}) se od polohy v datech liší jen o ${round(moved, 1)} km – oprava už není potřeba`);
        if (!(data.fixes.notes || {})[qid]) add('critical', 'opravy', 'bez-duvodu', `points: ${found.item.n} (${qid}) nemá důvod v notes`);
    }
    return { skip: Object.keys(skip).length, points: Object.keys(points).length };
};

// --- Celý audit ----------------------------------------------------------------------------------------------------------

export const runAudit = ({ root = ROOT, sourceLand = null, only = null } = {}) => {
    const data = loadData(root);
    const findings = [];
    const add = (severity, section, code, text, extra = {}) => findings.push({ severity, section, code, text, ...extra });
    const want = (name) => !only || only.includes(name);
    const world = new Basemap(data.map.regions.svet, 'svet');
    const czech = new Basemap(data.map.regions.cesko, 'cesko');
    const stats = {};
    if (want('svet')) stats.svet = checkWorld(world, add);
    if (want('svet') && sourceLand) stats.zdroj = checkAgainstSource(world, sourceLand, add);
    if (want('cesko')) stats.cesko = checkCzech(czech, add);
    if (want('staty')) stats.staty = checkStates(world, data, add);
    let result = { findings, stats, data, world, czech };
    if (want('polohy') || want('tvary') || want('otazky')) {
        const { asked, all } = askable(data);
        if (want('polohy')) stats.polohy = checkPositions(world, data, asked, add);
        if (want('tvary')) { const shapes = checkShapes(world, data, asked, add); stats.tvary = shapes.stats; result.shapes = shapes.ranked; }
        if (want('otazky')) { const questions = checkQuestions(data, asked, all, add); stats.otazky = questions.stats; result.patterns = questions.patterns; result.disambiguated = questions.disambiguated; }
        result.coverage = coverage(world, asked, all);
        result.notAsked = notAsked(data, all);
        result.asked = asked;
    }
    if (want('opravy')) stats.opravy = checkFixes(data, add);
    const order = Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index]));
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    result.counts = Object.fromEntries(SEVERITIES.map(severity => [severity, findings.filter(finding => finding.severity === severity).length]));
    return result;
};
