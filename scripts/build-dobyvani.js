// Mapy pro Dobývání (conquest.js): data/dobyvani-<mapa>.json a sousedství s regiony v supabase/schema.sql (blok „21: Dobývání“).
// Státy jsou z data/world.json (Natural Earth 1:110m, sdílené hranice mají v datech stejné body, takže na sebe po promítnutí přesně
// navazují), kraje Česka z data/regiony.json. Každá mapa má vlastní Lambertovo azimutální stejnoploché zobrazení se středem
// v oblasti, výřez (delší strana 1000 jednotek), území s českým názvem, rodem (pro texty kroniky), cestou SVG, bodem pro popisek
// a ikony (pól nedostupnosti největší části), sousedy (společná hranice a námořní spoje), regiony a pozadí (ostatní pevnina).
// Graf sousedství musí být souvislý: ostrovy bez námořního spoje se připojí k nejbližšímu území.
// Spuštění: node scripts/build-dobyvani.js (zapíše data i SQL; s --check jen ověří, že jsou aktuální)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const world = require('../data/world.json');
const countries = require('../data/countries.json').countries;
const regiony = require('../data/regiony.json');
const vlajky = require('../data/vlajky.json').items;
const SCHEMA = path.join(ROOT, 'supabase', 'schema.sql');
const SQL_START = '-- dobyvani:data:start (vygenerováno: node scripts/build-dobyvani.js, ručně neupravovat)';
const SQL_END = '-- dobyvani:data:end';

const RAD = Math.PI / 180;
const EARTH_KM = 6371;
// Delší strana mapy v jednotkách SVG; souřadnice se zaokrouhlí na desetiny
const UNITS = 1000;
// Okraj výřezu, za kterým se tvary ořežou (podíl delší strany); mapa se při posunu nedívá dál než na kraj výřezu
const CLIP_MARGIN = 0.02;

// Lambertovo azimutální stejnoploché zobrazení se středem lat0, lon0 (jednotková koule, y nahoru)
const laea = (lat0, lon0) => {
    const sin0 = Math.sin(lat0 * RAD), cos0 = Math.cos(lat0 * RAD);
    return (lat, lon) => {
        const phi = lat * RAD, dl = (((lon - lon0 + 540) % 360) - 180) * RAD;
        const sinP = Math.sin(phi), cosP = Math.cos(phi), cosL = Math.cos(dl);
        const k = Math.sqrt(2 / Math.max(1e-12, 1 + sin0 * sinP + cos0 * cosP * cosL));
        return [k * cosP * Math.sin(dl), k * (cos0 * sinP - sin0 * cosP * cosL)];
    };
};

// --- Názvy a rod (texty kroniky: „Německo dobyto“, „Francie dobyta“, „Kypr dobyt“, „Filipíny dobyty“) ---
// Rod podle konce názvu (-o, -í střední; -a, -e ženský; souhláska mužský); výjimky a množné číslo ručně
const GENDER = {
    Q30: 'p', Q928: 'p', Q878: 'p', Q778: 'p', Q1246: 'n', Q912: 'n', Q967: 'n', Q1020: 'n', Q954: 'n', Q1013: 'n', Q790: 'n', Q298: 'n', Q419: 'n',
    Q242: 'n', Q965: 'n', Q1008: 'n', Q1044: 'f', Q1007: 'f', Q733: 'm', Q77: 'm', Q754: 'm', Q190930: 'm', Q921: 'm', Q574: 'm', Q225: 'f', Q236: 'f', Q221: 'f', Q145: 'n',
    Q1085: 'f'
};
const genderOf = (qid, name) => {
    if (GENDER[qid]) return GENDER[qid];
    const last = name.trim().split(/\s+/).pop();
    if (/[oí]$/.test(last)) return 'n';
    if (/[ae]$/.test(last)) return 'f';
    return 'm';
};

// Kraje Česka: QID → [název, v kom/čem, koho/čeho, krajské město]. Praha je díra ve Středočeském kraji (druhý prstenec).
const KRAJE = {
    Q1085: ['Praha', 'v Praze', 'Prahy', ''],
    Q188399: ['Středočeský kraj', 've Středočeském kraji', 'Středočeského kraje', ''],
    Q188373: ['Jihočeský kraj', 'v Jihočeském kraji', 'Jihočeského kraje', 'České Budějovice'],
    Q46070: ['Plzeňský kraj', 'v Plzeňském kraji', 'Plzeňského kraje', 'Plzeň'],
    Q191091: ['Karlovarský kraj', 'v Karlovarském kraji', 'Karlovarského kraje', 'Karlovy Vary'],
    Q192702: ['Ústecký kraj', 'v Ústeckém kraji', 'Ústeckého kraje', 'Ústí nad Labem'],
    Q193266: ['Liberecký kraj', 'v Libereckém kraji', 'Libereckého kraje', 'Liberec'],
    Q193295: ['Královéhradecký kraj', 'v Královéhradeckém kraji', 'Královéhradeckého kraje', 'Hradec Králové'],
    Q193317: ['Pardubický kraj', 'v Pardubickém kraji', 'Pardubického kraje', 'Pardubice'],
    Q190930: ['Kraj Vysočina', 'v Kraji Vysočina', 'Kraje Vysočina', 'Jihlava'],
    Q192697: ['Jihomoravský kraj', 'v Jihomoravském kraji', 'Jihomoravského kraje', 'Brno'],
    Q193307: ['Olomoucký kraj', 'v Olomouckém kraji', 'Olomouckého kraje', 'Olomouc'],
    Q192536: ['Zlínský kraj', 've Zlínském kraji', 'Zlínského kraje', 'Zlín'],
    Q190550: ['Moravskoslezský kraj', 'v Moravskoslezském kraji', 'Moravskoslezského kraje', 'Ostrava']
};

// --- Mapy ---
// frame = body [šířka, délka], kolem kterých je výřez; regions = id → [název, QID území]; sea = námořní spoje navíc;
// seaKm = spoje mezi územími s pobřežím blíž než tolik km (jen u map, kde nejsou vyjmenované); maxPlayers podle počtu území
const MAPS = [
    {
        id: 'evropa', title: 'Evropa', center: [53, 15],
        frame: [[66.6, -24.6], [63.3, -22.6], [36.9, -9.6], [36.0, -5.8], [34.5, 24.5], [34.6, 34.6], [36.2, 44.8], [41.2, 44.8], [71.2, 25.8], [69.4, 44.8]],
        // Rusko jen evropská část (za výřezem se ořízne), Turecko celé; trpasličí státy v datech 1:110m nejsou
        regions: {
            'britske-ostrovy': ['Britské ostrovy', ['Q145', 'Q27']],
            'severske-zeme': ['Severské země', ['Q189', 'Q20', 'Q34', 'Q33', 'Q35']],
            pobalti: ['Pobaltí', ['Q191', 'Q211', 'Q37']],
            'pyrenejsky-poloostrov': ['Pyrenejský poloostrov', ['Q29', 'Q45']],
            'zapadni-evropa': ['Západní Evropa', ['Q142', 'Q31', 'Q55', 'Q32', 'Q39']],
            'stredni-evropa': ['Střední Evropa', ['Q183', 'Q36', 'Q213', 'Q214', 'Q40', 'Q28', 'Q215']],
            balkan: ['Balkán', ['Q224', 'Q225', 'Q403', 'Q236', 'Q1246', 'Q222', 'Q221']],
            'vychodni-evropa': ['Východní Evropa', ['Q159', 'Q184', 'Q212', 'Q217', 'Q218', 'Q219']],
            stredomori: ['Itálie a Středomoří', ['Q38', 'Q41', 'Q229', 'Q43']]
        },
        // Námořní spoje ze zadání (docs/NOVE-MODY.md): Velká Británie–Francie, Irsko–Velká Británie, Island–Norsko a Velká Británie,
        // Dánsko–Švédsko a Norsko, Kypr–Řecko a Turecko, Estonsko–Finsko, Itálie–Albánie (Sardinie a Korsika jsou u svých států)
        sea: [['Q145', 'Q142'], ['Q27', 'Q145'], ['Q189', 'Q20'], ['Q189', 'Q145'], ['Q35', 'Q34'], ['Q35', 'Q20'], ['Q229', 'Q41'], ['Q229', 'Q43'], ['Q191', 'Q33'], ['Q38', 'Q222']],
        seaKm: 0, maxPlayers: 8
    },
    {
        id: 'afrika', title: 'Afrika', center: [2, 18],
        frame: [[37.4, -17.6], [37.4, 51.5], [-35.0, 17.0], [-35.0, 32.0], [11.8, 51.4], [14.8, -17.6], [-25.6, 50.3]],
        regions: {
            'severni-afrika': ['Severní Afrika', ['Q1028', 'Q262', 'Q948', 'Q1016', 'Q79']],
            sahel: ['Sahel', ['Q1025', 'Q912', 'Q965', 'Q1032', 'Q657', 'Q1049']],
            'zapadni-pobrezi': ['Západní pobřeží', ['Q1041', 'Q1005', 'Q1007', 'Q1006', 'Q1044', 'Q1014']],
            'guinejsky-zaliv': ['Guinejský záliv', ['Q1008', 'Q117', 'Q945', 'Q962', 'Q1033']],
            'stredni-afrika': ['Střední Afrika', ['Q1009', 'Q983', 'Q1000', 'Q971', 'Q974', 'Q929']],
            'africky-roh': ['Africký roh', ['Q115', 'Q986', 'Q977', 'Q1045', 'Q958']],
            'vychodni-afrika': ['Východní Afrika', ['Q114', 'Q1036', 'Q1037', 'Q967', 'Q924']],
            'jizni-afrika': ['Jižní Afrika', ['Q258', 'Q1013', 'Q1050', 'Q1030', 'Q963', 'Q954']],
            zambezi: ['Zambezi a Madagaskar', ['Q916', 'Q953', 'Q1020', 'Q1029', 'Q1019']]
        },
        // Nigérie a Čad mají společný kousek hranice v Čadském jezeře (data 1:110m ho nemají)
        land: [['Q1033', 'Q657']], sea: [], seaKm: 120, maxPlayers: 8
    },
    {
        id: 'asie', title: 'Asie', center: [33, 92],
        frame: [[42.0, 26.0], [36.0, 26.5], [12.5, 43.0], [5.5, 80.0], [-10.8, 105.0], [-10.8, 125.0], [5.0, 127.5], [45.5, 147.5], [35.0, 142.0], [57.0, 140.0], [58.0, 95.0], [57.0, 60.0], [46.0, 40.0]],
        regions: {
            'blizky-vychod': ['Blízký východ', ['Q43', 'Q858', 'Q822', 'Q801', 'Q810', 'Q796']],
            arabie: ['Arabský poloostrov', ['Q851', 'Q805', 'Q842', 'Q878', 'Q846', 'Q817']],
            kavkaz: ['Kavkaz a Írán', ['Q230', 'Q399', 'Q227', 'Q794']],
            'sibir-step': ['Sibiř a step', ['Q159', 'Q232', 'Q711']],
            'stredni-asie': ['Střední Asie', ['Q265', 'Q874', 'Q863', 'Q813', 'Q889']],
            'indicky-subkontinent': ['Indický subkontinent', ['Q843', 'Q668', 'Q837', 'Q917', 'Q902', 'Q854']],
            'dalny-vychod': ['Dálný východ', ['Q148', 'Q423', 'Q884', 'Q17', 'Q865']],
            indocina: ['Indočína', ['Q836', 'Q869', 'Q819', 'Q424', 'Q881']],
            'malajske-souostrovi': ['Malajské souostroví', ['Q833', 'Q921', 'Q252', 'Q574', 'Q928']]
        },
        // Japonsko a Jižní Korea přes Korejský průliv
        sea: [['Q17', 'Q884']], seaKm: 170, maxPlayers: 8
    },
    {
        id: 'amerika', title: 'Amerika', center: [12, -82],
        frame: [[71.5, -156.0], [60.0, -166.0], [72.0, -95.0], [62.0, -64.0], [47.5, -52.5], [-7.5, -34.8], [-55.8, -67.5], [-53.0, -75.0], [32.0, -118.0]],
        regions: {
            'severni-amerika': ['Severní Amerika', ['Q16', 'Q30', 'Q96']],
            'stredni-amerika': ['Střední Amerika', ['Q774', 'Q242', 'Q783', 'Q792', 'Q811', 'Q800', 'Q804']],
            karibik: ['Karibik', ['Q241', 'Q778', 'Q766', 'Q790', 'Q786', 'Q754']],
            'sever-jizni-ameriky': ['Sever Jižní Ameriky', ['Q739', 'Q717', 'Q734', 'Q730']],
            andy: ['Andy', ['Q736', 'Q419', 'Q750', 'Q298']],
            'brazilie-jih': ['Brazílie a jih', ['Q155', 'Q414', 'Q77', 'Q733']]
        },
        sea: [], seaKm: 230, maxPlayers: 8
    },
    {
        id: 'cesko', title: 'Česko', center: [49.8, 15.5], kraje: true,
        frame: [[51.06, 14.32], [48.55, 14.33], [50.25, 12.09], [49.55, 18.86]],
        regions: {
            'stredni-cechy': ['Střední Čechy', ['Q1085', 'Q188399']],
            jihozapad: ['Jihozápad', ['Q188373', 'Q46070']],
            severozapad: ['Severozápad', ['Q191091', 'Q192702']],
            severovychod: ['Severovýchod', ['Q193266', 'Q193295', 'Q193317']],
            jihovychod: ['Jihovýchod', ['Q190930', 'Q192697']],
            morava: ['Střední Morava a Slezsko', ['Q193307', 'Q192536', 'Q190550']]
        },
        sea: [], seaKm: 0, maxPlayers: 6
    }
];

// --- Geometrie ---
const ringArea = (ring) => { let s = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); return s / 2; };
const clipRing = (points, box) => {
    let output = points;
    for (const [axis, value, keep] of [[0, box.x0, (v) => v >= box.x0], [0, box.x1, (v) => v <= box.x1], [1, box.y0, (v) => v >= box.y0], [1, box.y1, (v) => v <= box.y1]]) {
        const input = output;
        output = [];
        for (let i = 0; i < input.length; i++) {
            const cur = input[i], prev = input[(i + input.length - 1) % input.length];
            const cross = () => { const t = (value - prev[axis]) / (cur[axis] - prev[axis]); return [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]; };
            if (keep(cur[axis])) { if (!keep(prev[axis])) output.push(cross()); output.push(cur); } else if (keep(prev[axis])) output.push(cross());
        }
        if (!output.length) break;
    }
    return output;
};
const round1 = (v) => Math.round(v * 10) / 10;
// Čísla cesty SVG: mezera jen tam, kde další číslo nezačíná znaménkem minus
const joinNumbers = (numbers) => numbers.map((n, i) => (i > 0 && n >= 0 ? ' ' : '') + n).join('');
// Cesta SVG: první bod absolutně, další relativně (desetiny počítané ze zaokrouhlených bodů, takže se chyba nesčítá), opakované body vynechané
const ringsPath = (rings) => rings.map(ring => {
    let d = '', px = 0, py = 0;
    const rest = [];
    ring.forEach(([x, y], i) => {
        const rx = round1(x), ry = round1(y);
        if (i === 0) { d = `M${joinNumbers([rx, ry])}`; px = rx; py = ry; return; }
        const dx = round1(rx - px), dy = round1(ry - py);
        if (!dx && !dy) return;
        rest.push(dx, dy);
        px = rx; py = ry;
    });
    return `${d}l${joinNumbers(rest)}z`;
}).join('');
const pointInRing = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};
const segmentDistance = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// Pól nedostupnosti (bod uvnitř nejdál od okraje) mřížkovým hledáním se zjemňováním; rings = vnější prstenec a díry
const poleOf = (rings) => {
    const outer = rings[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const inside = (x, y) => pointInRing(x, y, outer) && !rings.slice(1).some(hole => pointInRing(x, y, hole));
    const distance = (x, y) => { let best = Infinity; for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) best = Math.min(best, segmentDistance(x, y, ring[j], ring[i])); return best; };
    let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, d: -1 };
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, span = Math.max(x1 - x0, y1 - y0);
    for (let step = 0; step < 6; step++) {
        const n = 24;
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
            const x = cx - span / 2 + span * i / n, y = cy - span / 2 + span * j / n;
            if (!inside(x, y)) continue;
            const d = distance(x, y);
            if (d > best.d) best = { x, y, d };
        }
        cx = best.x; cy = best.y; span /= 4;
    }
    return best;
};

// --- Zdrojová data ---
// Body world.json jsou v desetinách stupně [délka, šířka, …]; státy bez kódu podle polohy (Severní Kypr, Somaliland, Kosovo)
const NO_ID = [{ qid: 'Q229', lat: 35.2, lon: 33.4 }, { qid: 'Q1045', lat: 10.4, lon: 46.1 }, { qid: 'Q1246', lat: 42.5, lon: 21.0 }];
const byIso = new Map(Object.entries(countries).filter(([, c]) => c.iso).map(([qid, c]) => [c.iso, qid]));
const worldShapes = new Map(); // QID → [prstence [[lon, lat]]]
const background = []; // prstence pevniny, která nepatří žádnému státu ve hře (Grónsko, Západní Sahara…)
for (const country of world.countries) {
    const rings = country.r.map(ring => { const pts = []; for (let i = 0; i < ring.length; i += 2) pts.push([ring[i] / 10, ring[i + 1] / 10]); return pts; });
    let qid = country.id ? byIso.get(country.id) : null;
    if (!country.id) {
        const pts = rings.flat();
        const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const known = NO_ID.find(entry => Math.abs(entry.lat - lat) < 1.5 && Math.abs(entry.lon - lon) < 1.5);
        qid = known ? known.qid : null;
    }
    if (!qid) { background.push(...rings); continue; }
    worldShapes.set(qid, [...(worldShapes.get(qid) || []), ...rings]);
}
// Kraje: Mercator ve stupních po q (regiony.json), Praha = díra ve Středočeském kraji
const krajShapes = () => {
    const cz = regiony.countries.Q213;
    const decode = (text) => { const n = core.decodeNumbers(text); const pts = []; let x = 0, y = 0; for (let i = 0; i < n.length; i += 2) { x += n[i]; y += n[i + 1]; pts.push([x * cz.q, core.inverseMercatorY(y * cz.q)]); } return pts; };
    const shapes = new Map();
    for (const [qid, entry] of Object.entries(cz.i)) {
        const rings = entry.r.map(decode);
        if (qid === 'Q188399') { shapes.set('Q1085', [rings[1]]); shapes.set(qid, rings); } else shapes.set(qid, rings);
    }
    return shapes;
};

// --- Sestavení mapy ---
const buildMap = (config) => {
    const project = laea(config.center[0], config.center[1]);
    const regionOf = new Map();
    for (const [region, [, members]] of Object.entries(config.regions)) members.forEach(qid => regionOf.set(qid, region));
    const shapes = config.kraje ? krajShapes() : worldShapes;
    const ids = [...regionOf.keys()];
    for (const qid of ids) if (!shapes.has(qid)) throw new Error(`${config.id}: chybí tvar ${qid}`);
    // Výřez: obdélník kolem bodů frame, delší strana UNITS
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [lat, lon] of config.frame) { const [x, y] = project(lat, lon); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.03;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const scale = UNITS / Math.max(x1 - x0, y1 - y0);
    const width = Math.round((x1 - x0) * scale), height = Math.round((y1 - y0) * scale);
    const toMap = (lon, lat) => { const [x, y] = project(lat, lon); return [(x - x0) * scale, (y1 - y) * scale]; };
    const margin = UNITS * CLIP_MARGIN;
    const box = { x0: -margin, y0: -margin, x1: width + margin, y1: height + margin };
    // Prstence státu v jednotkách mapy, ořezané výřezem, s orientací vnější prstenec / díra; spojené do mnohoúhelníků
    const polygonsOf = (rings, isKraj) => {
        const projected = rings.map(ring => {
            // Za odvrácenou polokoulí (přes 100° od středu) se nekreslí (Aljaška u Evropy apod.)
            const pts = ring.map(([lon, lat]) => toMap(lon, lat));
            return clipRing(pts, box);
        }).filter(ring => ring.length >= 3 && Math.abs(ringArea(ring)) > 0.05);
        // Vnější prstence a díry: díra leží uvnitř většího prstence
        const sorted = projected.map(ring => ({ ring, area: Math.abs(ringArea(ring)) })).sort((a, b) => b.area - a.area);
        const polygons = [];
        for (const { ring, area } of sorted) {
            const host = !isKraj ? polygons.find(poly => pointInRing(ring[0][0], ring[0][1], poly.rings[0]) && area < poly.area) : null;
            if (host) host.rings.push(ring); else polygons.push({ rings: [ring], area });
        }
        return polygons;
    };
    const territories = [];
    const geometry = new Map();
    for (const qid of ids) {
        let polygons = polygonsOf(shapes.get(qid), Boolean(config.kraje));
        // Středočeský kraj má Prahu jako díru
        if (config.kraje && qid === 'Q188399') polygons = [{ rings: [polygons[0].rings[0], ...polygons.slice(1).map(p => p.rings[0])], area: polygons[0].area }];
        if (!polygons.length) throw new Error(`${config.id}: ${qid} je mimo výřez`);
        geometry.set(qid, polygons);
        const main = polygons[0];
        const pole = poleOf(main.rings);
        const all = polygons.flatMap(p => p.rings[0]);
        const bx = all.map(p => p[0]), by = all.map(p => p[1]);
        const kraj = KRAJE[qid];
        const name = kraj ? kraj[0] : countries[qid].name;
        const entry = {
            id: qid, n: name, g: genderOf(qid, name), reg: regionOf.get(qid),
            d: ringsPath(polygons.flatMap(p => p.rings)),
            a: [round1(pole.x), round1(pole.y)], r: round1(pole.d),
            b: [Math.floor(Math.min(...bx)), Math.floor(Math.min(...by)), Math.ceil(Math.max(...bx)), Math.ceil(Math.max(...by))],
            nb: []
        };
        if (kraj) Object.assign(entry, { loc: kraj[1], gen: kraj[2], ...(kraj[3] ? { seat: kraj[3] } : {}) });
        const flag = vlajky.find(item => (kraj ? item.q === qid && item.c === 'cesko' : item.c === 'vlajka' && (item.co || []).length === 1 && item.co[0] === qid));
        if (flag && flag.im && flag.ih) entry.fl = [flag.im, flag.ih];
        territories.push(entry);
    }
    // Sousedství po souši: společný bod hranice (stejné souřadnice v datech po zaokrouhlení), u krajů blízké body
    const keyOf = ([x, y]) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
    const pointSets = new Map(ids.map(qid => [qid, new Set(geometry.get(qid).flatMap(p => p.rings.flat()).map(keyOf))]));
    const links = new Map(ids.map(qid => [qid, new Map()]));
    const link = (a, b, sea) => { if (a === b || links.get(a).has(b)) return; links.get(a).set(b, sea); links.get(b).set(a, sea); };
    // Hranice na okraji výřezu (ořez) společná není: body ležící na rámečku se nepočítají
    const onFrame = (key) => { const [x, y] = key.split(',').map(v => Number(v) / 4); return Math.abs(x - box.x0) < 0.3 || Math.abs(x - box.x1) < 0.3 || Math.abs(y - box.y0) < 0.3 || Math.abs(y - box.y1) < 0.3; };
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        let shared = 0;
        for (const key of pointSets.get(ids[i])) if (pointSets.get(ids[j]).has(key) && !onFrame(key)) shared++;
        if (shared >= 2) link(ids[i], ids[j], false);
    }
    // Námořní spoje: vyjmenované a pobřeží blíž než seaKm, když spojnice nejbližších bodů vede přes moře (ne přes třetí stát:
    // Gambie a Guinea sousedy nejsou); vzdálenost bodů tvarů v km
    const lonLatPoints = new Map(ids.map(qid => [qid, shapes.get(qid).flat()]));
    const km = (a, b) => core.distanceKm({ la: a[1], lo: a[0] }, { la: b[1], lo: b[0] });
    const nearest = (a, b) => { let best = { d: Infinity }; for (const p of lonLatPoints.get(a)) for (const q of lonLatPoints.get(b)) { const d = km(p, q); if (d < best.d) best = { d, p, q }; } return best; };
    const landRings = [...worldShapes.values(), background].flat().map(ring => {
        const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
        return { ring, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    });
    const onLand = (lon, lat) => landRings.some(({ ring, box: [bx0, by0, bx1, by1] }) => lon >= bx0 && lon <= bx1 && lat >= by0 && lat <= by1 && pointInRing(lon, lat, ring));
    const overSea = ({ p, q }) => { for (let k = 2; k <= 18; k++) { const t = k / 20; if (onLand(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)) return false; } return true; };
    for (const [a, b] of config.sea) { if (!links.has(a) || !links.has(b)) throw new Error(`${config.id}: námořní spoj ${a}–${b}`); link(a, b, true); }
    for (const [a, b] of config.land || []) { if (!links.has(a) || !links.has(b)) throw new Error(`${config.id}: hranice ${a}–${b}`); link(a, b, false); }
    const gaps = new Map();
    const gapOf = (a, b) => { const key = a < b ? `${a}|${b}` : `${b}|${a}`; if (!gaps.has(key)) gaps.set(key, nearest(a, b)); return gaps.get(key); };
    if (config.seaKm) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        if (links.get(ids[i]).has(ids[j])) continue;
        const gap = gapOf(ids[i], ids[j]);
        if (gap.d <= config.seaKm && overSea(gap)) link(ids[i], ids[j], true);
    }
    // Souvislost: oddělené skupiny se připojí nejkratším námořním spojem
    for (;;) {
        const seen = new Set([ids[0]]);
        const queue = [ids[0]];
        while (queue.length) for (const next of links.get(queue.shift()).keys()) if (!seen.has(next)) { seen.add(next); queue.push(next); }
        if (seen.size === ids.length) break;
        let best = null;
        for (const a of seen) for (const b of ids) if (!seen.has(b)) { const d = gapOf(a, b).d; if (!best || d < best.d) best = { a, b, d }; }
        link(best.a, best.b, true);
    }
    for (const entry of territories) entry.nb = [...links.get(entry.id).keys()].sort();
    const sea = [];
    for (const [a, others] of links) for (const [b, isSea] of others) if (isSea && a < b) sea.push([a, b]);
    // Pozadí: ostatní pevnina ve výřezu (u Česka okolní státy z world.json)
    const bgRings = (config.kraje ? [...worldShapes.entries()].filter(([qid]) => qid !== 'Q213').flatMap(([, rings]) => rings)
        : [...background, ...[...worldShapes.entries()].filter(([qid]) => !regionOf.has(qid)).flatMap(([, rings]) => rings)]);
    // U krajů je kolem celá pevnina (sousední státy 1:110m by k hranici krajů 1:10m nepasovaly): pozadí je celý výřez bez moře
    const land = config.kraje ? [[[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]]
        : bgRings.map(ring => clipRing(ring.map(([lon, lat]) => toMap(lon, lat)), box)).filter(ring => ring.length >= 3 && Math.abs(ringArea(ring)) > 0.5);
    const treasures = Math.max(1, Math.min(5, Math.floor(ids.length / 8)));
    return {
        id: config.id, title: config.title, w: width, h: height,
        // Zobrazení pro body z dat témat (najdi na mapě, místo v kraji): laea se středem c, posun a měřítko
        proj: { c: config.center, x0: Number(x0.toFixed(6)), y1: Number(y1.toFixed(6)), k: Number(scale.toFixed(4)) },
        maxPlayers: Math.min(config.maxPlayers, Math.floor(ids.length / 2)), treasures,
        regions: Object.entries(config.regions).map(([id, [name, members]]) => ({ id, n: name, t: members })),
        t: territories, sea,
        land: land.length ? ringsPath(land) : ''
    };
};

// --- SQL (sousedství a regiony pro server) ---
const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;
const buildSql = (maps) => {
    const lines = [SQL_START];
    lines.push(`delete from public.conquest_links where map not in (${maps.map(m => sqlText(m.id)).join(', ')});`);
    lines.push(`delete from public.conquest_regions where map not in (${maps.map(m => sqlText(m.id)).join(', ')});`);
    lines.push(`delete from public.conquest_maps where id not in (${maps.map(m => sqlText(m.id)).join(', ')});`);
    for (const map of maps) {
        lines.push(`-- Mapa ${map.title}: ${map.t.length} území, ${map.regions.length} regionů`);
        lines.push(`insert into public.conquest_maps (id, title, territories, treasures, max_players) values (${sqlText(map.id)}, ${sqlText(map.title)}, ${map.t.length}, ${map.treasures}, ${map.maxPlayers})
    on conflict (id) do update set title = excluded.title, territories = excluded.territories, treasures = excluded.treasures, max_players = excluded.max_players;`);
        lines.push(`delete from public.conquest_regions where map = ${sqlText(map.id)};`);
        lines.push(`insert into public.conquest_regions (map, territory, region) values\n    ${map.t.map(t => `(${sqlText(map.id)}, ${sqlText(t.id)}, ${sqlText(t.reg)})`).join(',\n    ')};`);
        lines.push(`delete from public.conquest_links where map = ${sqlText(map.id)};`);
        const pairs = map.t.flatMap(t => t.nb.map(other => `(${sqlText(map.id)}, ${sqlText(t.id)}, ${sqlText(other)})`));
        lines.push(`insert into public.conquest_links (map, a, b) values\n    ${pairs.join(',\n    ')};`);
    }
    lines.push(SQL_END);
    return lines.join('\n');
};

const run = () => {
    const check = process.argv.includes('--check');
    const maps = MAPS.map(buildMap);
    let stale = false;
    for (const map of maps) {
        const file = path.join(ROOT, 'data', `dobyvani-${map.id}.json`);
        const text = `${JSON.stringify(map)}\n`;
        const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        if (old !== text) { stale = true; if (!check) fs.writeFileSync(file, text); }
        console.log(`dobyvani-${map.id}.json: ${map.t.length} území, ${map.regions.length} regionů, ${map.sea.length} námořních spojů, ${(text.length / 1024).toFixed(1)} kB, ${map.w}×${map.h}`);
    }
    const sql = buildSql(maps);
    const schema = fs.readFileSync(SCHEMA, 'utf8');
    const start = schema.indexOf(SQL_START), end = schema.indexOf(SQL_END);
    if (start < 0 || end < 0) {
        console.log('V schema.sql chybí značky bloku dat Dobývání – SQL se nezapsalo.');
    } else {
        const next = schema.slice(0, start) + sql + schema.slice(end + SQL_END.length);
        if (next !== schema) { stale = true; if (!check) fs.writeFileSync(SCHEMA, next); }
    }
    if (check && stale) { console.error('Data Dobývání nejsou aktuální: spusť node scripts/build-dobyvani.js'); process.exit(1); }
};

if (require.main === module) run();
module.exports = { MAPS, KRAJE, genderOf, laea, buildMap, buildSql, SQL_START, SQL_END };
