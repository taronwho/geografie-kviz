// Obrysy plošných míst a průběh řek pro „Ukaž na mapě“ (data/mapa-tvary.json ze scripts/build-mapa-tvary.mjs): formát
// zápisu, rozumné souřadnice a bod položky uvnitř svého obrysu nebo těsně u něj (u řeky u čáry).
//
// Pravidlo dekódování (stejné musí mít aplikace): obrys = prstence oddělené „;“, prstenec = celá čísla oddělená „,“
// v tisícinách stupně; první dvojice je (šířka, délka) prvního bodu, každá další dvojice je rozdíl (Δšířka, Δdélka)
// od předchozího bodu. Poslední bod se s prvním nespojuje opakováním (prstenec je uzavřený implicitně). Bod je uvnitř
// podle pravidla sudá–lichá přes všechny prstence obrysu. Délka je v prstenci souvislá, může přesáhnout ±180.
// Čára (řeka): text začíná „~“, za ním lomené čáry oddělené „;“ zapsané stejně jako prstenec (první bod, pak rozdíly),
// ale NEuzavřené – úsek z posledního bodu do prvního neexistuje; vzdálenost se měří od nejbližšího úseku.
// Obrysy mají plošná místa zeměpisu (jezera, ostrovy, příroda, pohoří, státy), řeky zeměpisu (čáry) a regiony a kraje
// Česka z vlajek.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'mapa-tvary.json');
const raw = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
const zemepis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'zemepis.json'), 'utf8'));
const vlajky = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vlajky.json'), 'utf8'));
const KINDS = {
    jezero: ['jezero', 'přehradní nádrž', 'laguna', 'moře', 'zátoka', 'průliv'],
    ostrov: ['ostrov', 'souostroví'],
    priroda: ['národní park', 'poušť', 'poloostrov'],
    hora: ['pohoří']
};
const isRegion = (item) => item.c === 'regiony' || (item.c === 'cesko' && item.ty === 'kraj');
const isArea = (item) => (KINDS[item.c] || []).includes(item.ty) || item.c === 'stat';
// Položka, ke které obrys patří: nejdřív zeměpis (plochy, státy, řeky), pak regiony z vlajek
const items = new Map();
for (const item of zemepis.items) if (isArea(item) || item.c === 'reka') items.set(item.q, item);
for (const item of vlajky.items) if (isRegion(item) && !items.has(item.q)) items.set(item.q, item);
const isLine = (text) => text.startsWith('~');

// → [[[lat, lon], …], …] v tisícinách stupně (u čáry bez předpony „~“ lomené čáry)
const decode = (text) => text.replace(/^~/, '').split(';').map(part => {
    const numbers = part.split(',').map(Number);
    assert.equal(numbers.length % 2, 0, 'sudý počet čísel');
    const ring = [];
    let lat = 0, lon = 0;
    for (let i = 0; i < numbers.length; i += 2) {
        lat += numbers[i];
        lon += numbers[i + 1];
        ring.push([lat, lon]);
    }
    return ring;
});

const inside = (rings, lat, lon) => {
    let result = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [yi, xi] = ring[i];
            const [yj, xj] = ring[j];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) result = !result;
        }
    }
    return result;
};

// Vzdálenost bodu (stupně) od obrysu v km, 0 uvnitř; délka i posunutá o ±360°
const distanceKm = (rings, latDeg, lonDeg) => {
    let best = Infinity;
    const kx = 111.32 * Math.cos(latDeg * Math.PI / 180), ky = 110.57;
    for (const shift of [0, -360, 360]) {
        const lat = latDeg * 1000, lon = (lonDeg + shift) * 1000;
        if (inside(rings, lat, lon)) return 0;
        for (const ring of rings) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const ax = (ring[j][1] - lon) / 1000 * kx, ay = (ring[j][0] - lat) / 1000 * ky;
                const bx = (ring[i][1] - lon) / 1000 * kx, by = (ring[i][0] - lat) / 1000 * ky;
                const dx = bx - ax, dy = by - ay;
                const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
                best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
            }
        }
    }
    return best;
};

const sizeKm = (rings) => {
    const points = rings.flat();
    const lats = points.map(p => p[0] / 1000), lons = points.map(p => p[1] / 1000);
    const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
    return Math.hypot((lo1 - lo0) * 111.32 * Math.cos((la0 + la1) / 2 * Math.PI / 180), (la1 - la0) * 110.57);
};
// Bod souostrovního státu smí ležet v moři mezi ostrovy
const near = (rings, item) => distanceKm(rings, item.la, item.lo) <= Math.max(15, (item.c === 'stat' ? 0.35 : 0.05) * sizeKm(rings));

// Vzdálenost bodu od lomených čar v km (úseky jen mezi sousedními body, čára se neuzavírá)
const lineKm = (lines, latDeg, lonDeg) => {
    let best = Infinity;
    const kx = 111.32 * Math.cos(latDeg * Math.PI / 180), ky = 110.57;
    for (const shift of [0, -360, 360]) {
        const lat = latDeg * 1000, lon = (lonDeg + shift) * 1000;
        for (const line of lines) {
            for (let i = 1; i < line.length; i++) {
                const ax = (line[i - 1][1] - lon) / 1000 * kx, ay = (line[i - 1][0] - lat) / 1000 * ky;
                const bx = (line[i][1] - lon) / 1000 * kx, by = (line[i][0] - lat) / 1000 * ky;
                const dx = bx - ax, dy = by - ay;
                const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
                best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
            }
        }
    }
    return best;
};
// Délka čar v km (po úsecích po kouli)
const lengthKm = (lines) => lines.reduce((sum, line) => sum + line.slice(1).reduce((s, [lat, lon], i) => {
    const [plat, plon] = line[i];
    const r = Math.PI / 180000;
    const a = Math.sin((lat - plat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(plat * r) * Math.sin((lon - plon) * r / 2) ** 2;
    return s + 2 * 6371 * Math.asin(Math.sqrt(a));
}, 0), 0);
// Bod řeky u čáry: 30 km, u řeky s čárou aspoň z poloviny délky (Natural Earth bez horního toku) 12 % délky, nejvýš 800 km
const riverLimit = (lines, item) => {
    const len0 = item.f && item.f.len;
    return len0 > 0 && lengthKm(lines) >= 0.5 * len0 ? Math.max(30, Math.min(800, 0.12 * len0)) : 30;
};

test('mapa-tvary.json: hlavička, zdroje a velikost', () => {
    assert.match(data.generated, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(data.source, /Natural Earth/);
    assert.match(data.source, /OpenStreetMap/);
    assert.match(data.source, /ODbL/);
    assert.ok(Object.keys(data.shapes).length >= 500, `obrysů jen ${Object.keys(data.shapes).length}`);
    assert.ok(Object.keys(data.shapes).length >= 2000, `obrysů jen ${Object.keys(data.shapes).length}`);
    assert.ok(Buffer.byteLength(raw) <= 900 * 1024, `soubor má ${Math.round(Buffer.byteLength(raw) / 1024)} kB`);
});

test('mapa-tvary.json: každý obrys patří plošné položce (řeka čáře) a dá se dekódovat', () => {
    const problems = [];
    for (const [qid, text] of Object.entries(data.shapes)) {
        const item = items.get(qid);
        if (!item) { problems.push(`${qid}: není plošná položka zeměpisu, řeka ani region`); continue; }
        const line = isLine(text);
        if (line !== (item.c === 'reka')) { problems.push(`${qid} ${item.n}: ${line ? 'čára u plochy' : 'plocha u řeky'}`); continue; }
        assert.match(text, /^~?-?\d+(,-?\d+)*(;-?\d+(,-?\d+)*)*$/, qid);
        const rings = decode(text);
        for (const ring of rings) {
            if (ring.length < (line ? 2 : 3)) problems.push(`${qid} ${item.n}: ${line ? 'čára' : 'prstenec'} se ${ring.length} body`);
            ring.forEach(([lat, lon], i) => {
                if (Math.abs(lat) > 90000 || Math.abs(lon) > 540000) problems.push(`${qid} ${item.n}: souřadnice mimo rozsah ${lat},${lon}`);
                if (line && !i) return;  // čára se neuzavírá: první bod nemá předchůdce
                const [plat, plon] = ring[i ? i - 1 : ring.length - 1];
                if (plat === lat && plon === lon) problems.push(`${qid} ${item.n}: opakovaný bod ${i}`);
                if (i && Math.abs(lon - plon) > 180000) problems.push(`${qid} ${item.n}: skok délky přes 180°`);
            });
        }
        if (line) {
            const d = lineKm(rings, item.la, item.lo);
            if (d > riverLimit(rings, item)) problems.push(`${qid} ${item.n}: bod řeky ${Math.round(d)} km od čáry`);
        } else if (!near(rings, item)) problems.push(`${qid} ${item.n}: bod položky ${Math.round(distanceKm(rings, item.la, item.lo))} km od obrysu`);
    }
    assert.deepEqual(problems, []);
});

test('mapa-tvary.json: čára řeky se dekóduje bez uzavření', () => {
    // Dvě lomené čáry: (50,14) → (50,15) → (51,15) a (49,14) → (49,13)
    const rings = decode('~50000,14000,0,1000,1000,0;49000,14000,0,-1000');
    assert.deepEqual(rings, [[[50000, 14000], [50000, 15000], [51000, 15000]], [[49000, 14000], [49000, 13000]]]);
    // Bod (50,6° s. š., 14,6° v. d.) leží na neexistujícím úseku (51,15) → (50,14); k čáře (50,15) → (51,15) má ~28 km
    assert.ok(Math.abs(lineKm(rings, 50.6, 14.6) - 28.3) < 1, `${lineKm(rings, 50.6, 14.6)}`);
    assert.ok(lineKm(rings, 50, 14.5) < 0.1, 'na úseku');
    assert.ok(Math.abs(lineKm(rings, 49, 12) - 73) < 1, 'za koncem čáry se měří ke konci');
    for (const [qid, text] of Object.entries(data.shapes)) if (isLine(text)) assert.equal(items.get(qid).c, 'reka', qid);
});

test('mapa-tvary.json: známá místa leží ve svém obrysu', () => {
    const SAMPLE = {
        Q6383: 'Balaton', Q5513: 'Bajkal', Q5484: 'Kaspické moře', Q1693: 'Severní moře', Q6583: 'Sahara', Q34374: 'Kréta',
        Q23666: 'Velká Británie', Q864799: 'Národní park Šumava', Q351: 'Yellowstonský národní park', Q545: 'Baltské moře', Q4918: 'Středozemní moře'
    };
    for (const [qid, name] of Object.entries(SAMPLE)) {
        const item = items.get(qid);
        if (!item || !(KINDS[item.c] || []).includes(item.ty)) continue;  // v zeměpisu (zatím) není
        assert.equal(item.n, name, qid);
        assert.ok(data.shapes[qid], `${name} nemá obrys`);
        const rings = decode(data.shapes[qid]);
        assert.ok(near(rings, item), `${name}: bod položky mimo obrys`);
    }
    // Kontrola opačným směrem: obrys nesmí pokrýt cizí místo
    const praha = [50.08, 14.42];
    for (const qid of ['Q6383', 'Q6583', 'Q1693', 'Q864799']) {
        if (data.shapes[qid]) assert.ok(distanceKm(decode(data.shapes[qid]), ...praha) > 50, `${qid} pokrývá Prahu`);
    }
    // Sahara pokryje Tamanrasset, Kréta vnitrozemí mezi Rethymnem a Iraklionem
    if (data.shapes.Q6583) assert.equal(distanceKm(decode(data.shapes.Q6583), 22.79, 5.52), 0);
    if (data.shapes.Q34374) assert.equal(distanceKm(decode(data.shapes.Q34374), 35.24, 24.8), 0);
});

// Obrys položky (musí existovat); jméno kontroluje, že QID pořád patří stejnému místu
const shapeFor = (qid, name) => {
    const item = items.get(qid);
    assert.ok(item, `${name} (${qid}) v datech není`);
    assert.equal(item.n, name, qid);
    assert.ok(data.shapes[qid], `${name} nemá obrys`);
    return decode(data.shapes[qid]);
};
const PRAHA = [50.08, 14.42];

test('mapa-tvary.json: státy – Česko, Mongolsko, Rusko a Fidži přes 180. poledník', () => {
    const cesko = shapeFor('Q213', 'Česko');
    assert.equal(distanceKm(cesko, ...PRAHA), 0, 'Praha v Česku');
    assert.equal(distanceKm(cesko, 49.2, 16.61), 0, 'Brno v Česku');
    assert.ok(distanceKm(cesko, 48.21, 16.37) > 20, 'Vídeň mimo Česko');
    assert.ok(distanceKm(cesko, 51.05, 13.74) > 10, 'Drážďany mimo Česko');
    // Praha nesmí ležet v žádném jiném státě
    for (const [qid, text] of Object.entries(data.shapes)) {
        const item = items.get(qid);
        if (qid === 'Q213' || item.c !== 'stat') continue;
        assert.ok(distanceKm(decode(text), ...PRAHA) > 0, `Praha leží v ${item.n}`);
    }
    const mongolsko = shapeFor('Q711', 'Mongolsko');
    assert.equal(distanceKm(mongolsko, 47.92, 106.92), 0, 'Ulánbátar v Mongolsku');
    assert.ok(distanceKm(mongolsko, 39.9, 116.4) > 100, 'Peking mimo Mongolsko');
    // Rusko: prstence souvislé přes 180. poledník (Čukotka), Moskva, Vladivostok i Čukotka uvnitř; tip západní délkou
    // na Čukotce je uvnitř taky (posun o 360°)
    const rusko = shapeFor('Q159', 'Rusko');
    assert.equal(distanceKm(rusko, 55.75, 37.62), 0, 'Moskva v Rusku');
    assert.equal(distanceKm(rusko, 43.12, 131.9), 0, 'Vladivostok v Rusku');
    assert.equal(distanceKm(rusko, 67.5, 172), 0, 'Čukotka před 180. poledníkem');
    assert.equal(distanceKm(rusko, 66.5, -172), 0, 'Čukotka za 180. poledníkem');
    assert.ok(distanceKm(rusko, 50.45, 30.52) > 50, 'Kyjev mimo Rusko');
    // Fidži: Suva uvnitř, ostrovy za 180. poledníkem posunuté k bodu položky (délka nad 180°, ne skok)
    const fidzi = shapeFor('Q712', 'Fidži');
    assert.equal(distanceKm(fidzi, -18.1, 178.45), 0, 'Suva na Fidži');
    assert.ok(fidzi.flat().every(([, lon]) => lon > 170000 && lon < 190000), 'Fidži kolem 180. poledníku bez skoku');
    // Spojené státy: Denver i Anchorage
    const usa = shapeFor('Q30', 'Spojené státy americké');
    assert.equal(distanceKm(usa, 39.74, -104.99), 0, 'Denver');
    assert.equal(distanceKm(usa, 61.22, -149.9), 0, 'Anchorage');
});

test('mapa-tvary.json: regiony a kraje – Bavorsko, Texas, Jihomoravský a Středočeský kraj', () => {
    const bavorsko = shapeFor('Q707471', 'Bavorsko');
    assert.equal(distanceKm(bavorsko, 48.14, 11.58), 0, 'Mnichov v Bavorsku');
    assert.ok(distanceKm(bavorsko, ...PRAHA) > 50, 'Praha mimo Bavorsko');
    const texas = shapeFor('Q19000', 'Texas');
    assert.equal(distanceKm(texas, 30.27, -97.74), 0, 'Austin v Texasu');
    assert.ok(distanceKm(texas, 35.47, -97.52) > 50, 'Oklahoma City mimo Texas');
    assert.equal(distanceKm(shapeFor('Q192697', 'Jihomoravský kraj'), 49.2, 16.61), 0, 'Brno v Jihomoravském kraji');
    // Praha je ve Středočeském kraji díra
    const stredocesky = shapeFor('Q188399', 'Středočeský kraj');
    assert.ok(distanceKm(stredocesky, ...PRAHA) > 0, 'Praha není ve Středočeském kraji');
    assert.equal(distanceKm(stredocesky, 50.15, 14.1), 0, 'Kladno ve Středočeském kraji');
});

test('mapa-tvary.json: pohoří – Alpy a Himálaj', () => {
    const alpy = shapeFor('Q1286', 'Alpy');
    assert.ok(distanceKm(alpy, 46.56, 8.56) < 15, 'Gotthard v Alpách');
    assert.ok(distanceKm(alpy, ...PRAHA) > 150, 'Praha mimo Alpy');
    const himalaj = shapeFor('Q5451', 'Himálaj');
    assert.ok(distanceKm(himalaj, 27.99, 86.93) < 30, 'Everest v Himálaji');
    assert.ok(distanceKm(himalaj, 22.57, 88.36) > 200, 'Kalkata mimo Himálaj');
});

test('mapa-tvary.json: řeky – Dunaj, Nil a Vltava jako čáry u svých měst', () => {
    for (const [qid, name] of [['Q1653', 'Dunaj'], ['Q3392', 'Nil'], ['Q131574', 'Vltava']]) {
        const item = items.get(qid);
        assert.ok(isLine(data.shapes[qid] || ''), `${name} není čára`);
        assert.ok(lineKm(shapeFor(qid, name), item.la, item.lo) <= 30, `${name}: bod položky dál než 30 km od čáry`);
    }
    const dunaj = shapeFor('Q1653', 'Dunaj');
    assert.ok(lineKm(dunaj, 48.21, 16.37) < 10, 'Dunaj ve Vídni');
    assert.ok(lineKm(dunaj, 47.5, 19.04) < 10, 'Dunaj v Budapešti');
    assert.ok(lineKm(dunaj, ...PRAHA) > 150, 'Dunaj daleko od Prahy');
    assert.ok(lineKm(shapeFor('Q3392', 'Nil'), 30.05, 31.23) < 15, 'Nil v Káhiře');
    const vltava = shapeFor('Q131574', 'Vltava');
    assert.ok(lineKm(vltava, ...PRAHA) < 5, 'Vltava v Praze');
    assert.ok(lineKm(vltava, 48.97, 14.47) < 5, 'Vltava v Českých Budějovicích');
});
