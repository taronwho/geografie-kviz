// Obrysy plošných míst a průběh řek pro „Ukaž na mapě“ (data/mapa-tvary.json ze scripts/build-mapa-tvary.mjs): formát
// zápisu, rozumné souřadnice a bod položky uvnitř svého obrysu nebo těsně u něj (u řeky u čáry).
//
// Pravidlo dekódování (stejné musí mít aplikace): obrys = prstence oddělené „;“, prstenec = celá čísla oddělená „,“
// v tisícinách stupně; první dvojice je (šířka, délka) prvního bodu, každá další dvojice je rozdíl (Δšířka, Δdélka)
// od předchozího bodu. Poslední bod se s prvním nespojuje opakováním (prstenec je uzavřený implicitně). Bod je uvnitř
// podle pravidla sudá–lichá přes všechny prstence obrysu. Délka je v prstenci souvislá, může přesáhnout ±180.
// Čára (řeka): text začíná „~“, za ním lomené čáry oddělené „;“ zapsané stejně jako prstenec (první bod, pak rozdíly),
// ale NEuzavřené – úsek z posledního bodu do prvního neexistuje; vzdálenost se měří od nejbližšího úseku.
// Obrysy mají plošná místa zeměpisu (jezera, ostrovy, příroda včetně CHKO a národních přírodních rezervací, pohoří,
// státy), řeky zeměpisu (čáry) a regiony a kraje Česka z vlajek. Zdroje a licence: docs/MAPA-ZDROJE.md.
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
    priroda: ['národní park', 'poušť', 'poloostrov', 'chráněná krajinná oblast', 'národní přírodní rezervace'],
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
    // Zdroje s povinným uvedením původu (CC BY 4.0) musí být v hlavičce souboru jmenované
    assert.match(data.source, /GMBA Mountain Inventory v2.*CC BY 4\.0/);
    assert.match(data.source, /AOPK ČR.*CC BY 4\.0/);
    assert.match(data.source, /SeaVoX.*CC BY 4\.0/);
    // Mořské oblasti IHO z Marine Regions mají licenci CC BY-NC-SA – nesmí se mezi zdroji objevit
    assert.doesNotMatch(data.source, /IHO|NC/);
    assert.ok(Object.keys(data.shapes).length >= 2900, `obrysů jen ${Object.keys(data.shapes).length}`);
    assert.ok(Buffer.byteLength(raw) <= 1300 * 1024, `soubor má ${Math.round(Buffer.byteLength(raw) / 1024)} kB`);
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

test('mapa-tvary.json: pokrytí – známá pohoří, řeky a chráněná území Česka', () => {
    const count = (list, filter) => list.filter(filter).length;
    const ranges = zemepis.items.filter(item => item.c === 'hora' && item.ty === 'pohoří');
    const rivers = zemepis.items.filter(item => item.c === 'reka');
    const has = (item) => Boolean(data.shapes[item.q]);
    assert.ok(count(ranges, has) >= 225, `pohoří s obrysem jen ${count(ranges, has)} z ${ranges.length}`);
    assert.ok(count(ranges, item => item.k === 1 && has(item)) >= 76, `známých pohoří s obrysem jen ${count(ranges, item => item.k === 1 && has(item))}`);
    assert.ok(count(rivers, has) >= 530, `řek s čárou jen ${count(rivers, has)} z ${rivers.length}`);
    assert.ok(count(rivers, item => item.k === 1 && has(item)) >= 135, 'známé řeky');
    const chko = zemepis.items.filter(item => item.ty === 'chráněná krajinná oblast');
    assert.equal(count(chko, has), chko.length, 'každá CHKO má obrys');
    assert.ok(count(zemepis.items, item => item.ty === 'národní přírodní rezervace' && has(item)) >= 80, 'národní přírodní rezervace');
});

test('mapa-tvary.json: pohoří – Krkonoše, Šumava, Hrubý Jeseník, Kavkaz, Apeniny, Dolomity a Alpy', () => {
    // Česká pohoří (geomorfologické členění AOPK ČR, jen území Česka)
    const krkonose = shapeFor('Q214644', 'Krkonoše');
    assert.equal(distanceKm(krkonose, 50.736, 15.74), 0, 'Sněžka v Krkonoších');
    assert.ok(distanceKm(krkonose, 50.767, 15.056) > 10, 'Liberec mimo Krkonoše');
    assert.ok(distanceKm(krkonose, ...PRAHA) > 60, 'Praha mimo Krkonoše');
    const sumava = shapeFor('Q157290', 'Šumava');
    assert.equal(distanceKm(sumava, 49.02, 13.58), 0, 'Kvilda na Šumavě');
    assert.ok(distanceKm(sumava, 49.75, 13.38) > 30, 'Plzeň mimo Šumavu');
    assert.ok(distanceKm(sumava, 48.97, 14.47) > 15, 'České Budějovice mimo Šumavu');
    const jesenik = shapeFor('Q280987', 'Hrubý Jeseník');
    assert.equal(distanceKm(jesenik, 50.083, 17.231), 0, 'Praděd v Hrubém Jeseníku');
    assert.ok(distanceKm(jesenik, 49.59, 17.25) > 20, 'Olomouc mimo Hrubý Jeseník');
    assert.equal(distanceKm(shapeFor('Q1365195', 'Moravskoslezské Beskydy'), 49.546, 18.447), 0, 'Lysá hora v Moravskoslezských Beskydech');
    assert.equal(distanceKm(shapeFor('Q215573', 'Beskydy'), 49.546, 18.447), 0, 'Lysá hora v Beskydech');
    // Světová pohoří (GMBA Mountain Inventory)
    const kavkaz = shapeFor('Q5477', 'Kavkaz');
    assert.equal(distanceKm(kavkaz, 43.35, 42.44), 0, 'Elbrus na Kavkaze');
    assert.equal(distanceKm(kavkaz, 42.7, 44.52), 0, 'Kazbek na Kavkaze');
    assert.ok(distanceKm(kavkaz, 47.23, 39.72) > 150, 'Rostov na Donu mimo Kavkaz');
    const apeniny = shapeFor('Q1285', 'Apeniny');
    assert.equal(distanceKm(apeniny, 42.47, 13.57), 0, 'Gran Sasso v Apeninách');
    assert.ok(distanceKm(apeniny, 41.9, 12.5) > 10, 'Řím mimo Apeniny');
    assert.ok(distanceKm(apeniny, 45.44, 12.33) > 80, 'Benátky mimo Apeniny');
    const dolomity = shapeFor('Q1283', 'Dolomity');
    assert.equal(distanceKm(dolomity, 46.43, 11.85), 0, 'Marmolada v Dolomitech');
    assert.ok(distanceKm(dolomity, 45.44, 12.33) > 40, 'Benátky mimo Dolomity');
    // Alpy zůstávají rozumné i po výměně zdroje: Mont Blanc a Gotthard uvnitř, Milán, Mnichov a Praha venku
    const alpy = shapeFor('Q1286', 'Alpy');
    assert.equal(distanceKm(alpy, 45.83, 6.86), 0, 'Mont Blanc v Alpách');
    assert.equal(distanceKm(alpy, 46.56, 8.56), 0, 'Gotthard v Alpách');
    assert.ok(distanceKm(alpy, 45.46, 9.19) > 10, 'Milán mimo Alpy');
    assert.ok(distanceKm(alpy, 48.14, 11.58) > 20, 'Mnichov mimo Alpy');
    assert.ok(distanceKm(alpy, ...PRAHA) > 150, 'Praha mimo Alpy');
    // Žádné pohoří není drobná ploška (rezervace místo pohoří): bez známé rozlohy aspoň 50 km², jinak v rozmezí 5× od ní
    const KM2 = (ring) => {
        let sum = 0;
        for (let i = 0; i < ring.length; i++) {
            const [y1, x1] = ring[i], [y2, x2] = ring[(i + 1) % ring.length];
            sum += (x2 - x1) / 1000 * Math.PI / 180 * (2 + Math.sin(y1 / 1000 * Math.PI / 180) + Math.sin(y2 / 1000 * Math.PI / 180));
        }
        return Math.abs(sum * 6371 * 6371 / 2);
    };
    const tiny = [];
    for (const item of zemepis.items) {
        if (item.c !== 'hora' || item.ty !== 'pohoří' || !data.shapes[item.q]) continue;
        const area = decode(data.shapes[item.q]).reduce((sum, ring) => sum + KM2(ring), 0);
        const known = item.f && item.f.area;
        // Jednotky geomorfologického členění ČR jsou úřední a smí být i menší (Pavlovské vrchy, Rýchory)
        if (known > 0 ? (area > 5.5 * known || area < known / 5.5) : area < 9) tiny.push(`${item.n}: ${Math.round(area)} km² (Wikidata ${known || '–'})`);
    }
    assert.deepEqual(tiny, []);
});

test('mapa-tvary.json: řeky – Jang-c’-ťiang a Nil v celé délce, žádné ostny', () => {
    // Jang-c'-ťiang od pramenů (Tchuo-tchuo, Tchung-tchien, Ťin-ša) po ústí
    const jangc = shapeFor('Q5413', "Jang-c'-ťiang");
    assert.ok(lineKm(jangc, 29.56, 106.55) < 20, 'Čchung-čching');
    assert.ok(lineKm(jangc, 30.59, 114.3) < 20, 'Wu-chan');
    assert.ok(lineKm(jangc, 32.06, 118.78) < 20, 'Nanking');
    assert.ok(lineKm(jangc, 33.0, 97.0) < 40, 'Jü-šu na horním toku (Tchung-tchien)');
    assert.ok(Math.min(...jangc.flat().map(([, lon]) => lon)) < 92000, 'horní tok až k pramenům v Tibetu');
    assert.ok(lengthKm(jangc) > 4200, `nakreslená délka ${Math.round(lengthKm(jangc))} km`);
    const item = items.get('Q5413');
    assert.ok(lineKm(jangc, item.la, item.lo) < 150, 'bod položky (pramen) u čáry');
    // Nil s Bílým Nilem až k Viktoriinu jezeru
    const nil = shapeFor('Q3392', 'Nil');
    assert.ok(lineKm(nil, 30.05, 31.23) < 15, 'Káhira');
    assert.ok(lineKm(nil, 4.85, 31.6) < 20, 'Džuba');
    assert.ok(lineKm(nil, 0.42, 33.2) < 30, 'Jinja u Viktoriina jezera');
    // Sázava z OpenStreetMap: celý tok od Žďáru po Davli
    const sazava = shapeFor('Q38771', 'Sázava');
    assert.ok(lineKm(sazava, 49.56, 15.94) < 5, 'Žďár nad Sázavou');
    assert.ok(lineKm(sazava, 49.89, 14.4) < 5, 'Davle');
    // Osten = čára se ve vrcholu otočí o víc než 150° a kratší ze dvou úseků má pod 2 km (rameno tam a zpátky)
    const spikes = [];
    for (const [qid, text] of Object.entries(data.shapes)) {
        if (!isLine(text)) continue;
        for (const line of decode(text)) {
            for (let i = 1; i < line.length - 1; i++) {
                const k = Math.cos(line[i][0] / 1000 * Math.PI / 180);
                const ux = (line[i][1] - line[i - 1][1]) * k, uy = line[i][0] - line[i - 1][0];
                const vx = (line[i + 1][1] - line[i][1]) * k, vy = line[i + 1][0] - line[i][0];
                const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
                if (!lu || !lv) continue;
                const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180 / Math.PI;
                // tisícina stupně ≈ 0,111 km
                if (turn > 150 && Math.min(lu, lv) * 0.111 < 2) spikes.push(`${items.get(qid).n}: vrchol ${i}`);
            }
        }
    }
    assert.deepEqual(spikes, []);
    assert.ok(isLine(data.shapes.Q131574), 'Vltava je čára');
});

test('mapa-tvary.json: nová moře, průliv a chráněná krajinná oblast', () => {
    const keltske = shapeFor('Q81499', 'Keltské moře');
    assert.equal(distanceKm(keltske, 50.0, -8.0), 0, 'Keltské moře jihozápadně od Irska');
    assert.ok(distanceKm(keltske, 53.35, -6.26) > 50, 'Dublin mimo Keltské moře');
    assert.equal(distanceKm(shapeFor('Q204703', 'Moře Scotia'), -57, -45), 0, 'Moře Scotia');
    // Průliv nakreslený v OpenStreetMap osou: obal čáry
    const calais = shapeFor('Q159898', 'Calaiská úžina');
    assert.equal(distanceKm(calais, 51.0, 1.5), 0, 'mezi Doverem a Calais');
    assert.ok(distanceKm(calais, 51.5, -0.12) > 40, 'Londýn mimo úžinu');
    assert.ok(distanceKm(calais, 48.85, 2.35) > 100, 'Paříž mimo úžinu');
    // CHKO Pálava: Děvín i Mikulov uvnitř, Brno venku
    const palava = shapeFor('Q1815090', 'CHKO Pálava');
    assert.equal(distanceKm(palava, 48.868, 16.652), 0, 'Děvín v CHKO Pálava');
    assert.ok(distanceKm(palava, 49.2, 16.61) > 20, 'Brno mimo CHKO Pálava');
    // Žádná CHKO nepokrývá Prahu ani Brno
    for (const item of zemepis.items) {
        if (item.ty !== 'chráněná krajinná oblast' || !data.shapes[item.q]) continue;
        const rings = decode(data.shapes[item.q]);
        assert.ok(distanceKm(rings, ...PRAHA) > 3, `${item.n} pokrývá Prahu`);
        assert.ok(distanceKm(rings, 49.195, 16.608) > 3, `${item.n} pokrývá Brno`);
    }
});

test('sestavení obrysů: hlavní tok řeky ze sítě cest, ostny, obal čáry a WKT', async () => {
    const { mainStem, mainWays, removeSpikes } = await import('../scripts/lib/mapa-tvary-reky.mjs');
    const { bufferLine, sphericalKm2, inRings, polygonsFromOrientedRings } = await import('../scripts/lib/mapa-tvary-geo.mjs');
    const { parseWkt } = await import('../scripts/lib/mapa-tvary-zdroje.mjs');
    // Hlavní tok A–B–C–D, rameno B–X–C (delší oklika) a slepý náhon z C: zůstane jedna čára od A po D bez odboček
    const ways = [
        { role: 'main_stream', waterway: 'river', line: [[14.0, 50.0], [14.1, 50.0]] },
        { role: 'main_stream', waterway: 'river', line: [[14.2, 50.0], [14.1, 50.0]] },   // obráceně zapsaná cesta
        { role: '', waterway: 'river', line: [[14.1, 50.0], [14.15, 50.05], [14.2, 50.0]] },   // rameno kolem ostrova
        { role: 'main_stream', waterway: 'river', line: [[14.2, 50.0], [14.3, 50.0]] },
        { role: '', waterway: 'canal', line: [[14.2, 50.0], [14.21, 49.99]] },            // slepý náhon
        { role: 'side_stream', waterway: 'river', line: [[14.0, 50.0], [13.9, 50.2]] },   // vedlejší rameno podle role
        { role: 'main_stream', waterway: 'riverbank', line: [[14.0, 50.0], [14.0, 50.1]] }
    ];
    const lines = mainWays(ways);
    assert.equal(lines.length, 5, 'bez side_stream a bez břehů');
    const stems = mainStem(lines);
    assert.equal(stems.length, 1);
    const stem = stems[0][0][0] < stems[0][stems[0].length - 1][0] ? stems[0] : stems[0].slice().reverse();
    assert.deepEqual(stem, [[14.0, 50.0], [14.1, 50.0], [14.2, 50.0], [14.3, 50.0]]);
    // Starší mezipaměť (jen čáry) projde beze změny
    assert.equal(mainWays([[[1, 1], [2, 2]], [[2, 2]]]).length, 1);
    // Dvě části s mezerou 1,4 km: s gapKm se spojí, bez něj zůstanou dvě
    const split = [[[14.0, 50.0], [14.1, 50.0]], [[14.12, 50.0], [14.3, 50.0]]];
    assert.equal(mainStem(split).length, 2);
    assert.equal(mainStem(split, { gapKm: 3 }).length, 1);
    // Osten: krátká odbočka tam a zpátky zmizí, pravá zatáčka zůstane
    assert.deepEqual(removeSpikes([[14.0, 50.0], [14.1, 50.0], [14.09, 50.001], [14.2, 50.0]]), [[14.0, 50.0], [14.09, 50.001], [14.2, 50.0]]);
    assert.equal(removeSpikes([[14.0, 50.0], [14.1, 50.0], [14.1, 50.1], [14.2, 50.1]]).length, 4);
    // Obal čáry: 100 km dlouhá osa s poloměrem 10 km má kolem 2 × 10 × 100 + π × 100 km² a obsahuje střed
    const ring = bufferLine([[14.0, 50.0], [15.398, 50.0]], 10);
    const area = sphericalKm2(ring);
    assert.ok(area > 2150 && area < 2450, `plocha obalu ${Math.round(area)} km²`);
    assert.ok(inRings([ring], [14.7, 50.05]) && !inRings([ring], [14.7, 50.2]));
    // WKT včetně kolekce a předpony souřadnicového systému
    const parsed = parseWkt('<http://www.opengis.net/def/crs/OGC/1.3/CRS84> GEOMETRYCOLLECTION(POINT(1 2),POLYGON((0 0,0 1,1 1,0 0),(0.1 0.1,0.1 0.2,0.2 0.2,0.1 0.1)),MULTIPOLYGON(((5 5,5 6,6 6,5 5))),LINESTRING(3 3,4 4))');
    assert.equal(parsed.polygons.length, 2);
    assert.equal(parsed.polygons[0].length, 2, 'prstenec a díra');
    assert.deepEqual(parsed.lines, [[[3, 3], [4, 4]]]);
    // Shapefile: vnější prstence a díry podle směru oběhu, malé díry odpadnou
    const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const bigHole = [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]], smallHole = [[1, 1], [1.5, 1], [1.5, 1.5], [1, 1.5], [1, 1]];
    const polygons = polygonsFromOrientedRings([outer, bigHole, smallHole]);
    assert.equal(polygons.length, 1);
    assert.equal(polygons[0].length, 2, 'velká díra zůstane, malá ne');
});
