// Obrysy plošných míst pro „Ukaž na mapě“ (data/mapa-tvary.json ze scripts/build-mapa-tvary.mjs): formát zápisu,
// rozumné souřadnice a bod položky uvnitř svého obrysu nebo těsně u něj.
//
// Pravidlo dekódování (stejné musí mít aplikace): obrys = prstence oddělené „;“, prstenec = celá čísla oddělená „,“
// v tisícinách stupně; první dvojice je (šířka, délka) prvního bodu, každá další dvojice je rozdíl (Δšířka, Δdélka)
// od předchozího bodu. Poslední bod se s prvním nespojuje opakováním (prstenec je uzavřený implicitně). Bod je uvnitř
// podle pravidla sudá–lichá přes všechny prstence obrysu. Délka je v prstenci souvislá, může přesáhnout ±180.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'mapa-tvary.json');
const raw = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
const zemepis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'zemepis.json'), 'utf8'));
const items = new Map(zemepis.items.map(item => [item.q, item]));
const KINDS = {
    jezero: ['jezero', 'přehradní nádrž', 'laguna', 'moře', 'zátoka', 'průliv'],
    ostrov: ['ostrov', 'souostroví'],
    priroda: ['národní park', 'poušť', 'poloostrov']
};

// → [[[lat, lon], …], …] v tisícinách stupně
const decode = (text) => text.split(';').map(part => {
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
const near = (rings, item) => distanceKm(rings, item.la, item.lo) <= Math.max(15, 0.05 * sizeKm(rings));

test('mapa-tvary.json: hlavička, zdroje a velikost', () => {
    assert.match(data.generated, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(data.source, /Natural Earth/);
    assert.match(data.source, /OpenStreetMap/);
    assert.match(data.source, /ODbL/);
    assert.ok(Object.keys(data.shapes).length >= 500, `obrysů jen ${Object.keys(data.shapes).length}`);
    assert.ok(Buffer.byteLength(raw) <= 450 * 1024, `soubor má ${Math.round(Buffer.byteLength(raw) / 1024)} kB`);
});

test('mapa-tvary.json: každý obrys patří plošné položce zeměpisu a dá se dekódovat', () => {
    const problems = [];
    for (const [qid, text] of Object.entries(data.shapes)) {
        const item = items.get(qid);
        if (!item || !(KINDS[item.c] || []).includes(item.ty)) { problems.push(`${qid}: není plošná položka zeměpisu`); continue; }
        assert.match(text, /^-?\d+(,-?\d+)*(;-?\d+(,-?\d+)*)*$/, qid);
        const rings = decode(text);
        for (const ring of rings) {
            if (ring.length < 3) problems.push(`${qid} ${item.n}: prstenec se ${ring.length} body`);
            ring.forEach(([lat, lon], i) => {
                if (Math.abs(lat) > 90000 || Math.abs(lon) > 540000) problems.push(`${qid} ${item.n}: souřadnice mimo rozsah ${lat},${lon}`);
                const [plat, plon] = ring[i ? i - 1 : ring.length - 1];
                if (plat === lat && plon === lon) problems.push(`${qid} ${item.n}: opakovaný bod ${i}`);
                if (i && Math.abs(lon - plon) > 180000) problems.push(`${qid} ${item.n}: skok délky přes 180°`);
            });
        }
        if (!near(rings, item)) problems.push(`${qid} ${item.n}: bod položky ${Math.round(distanceKm(rings, item.la, item.lo))} km od obrysu`);
    }
    assert.deepEqual(problems, []);
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
