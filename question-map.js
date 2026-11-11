// Otázka „Ukaž na mapě“: hráč klepne na slepou mapu (obrysy bez popisků), kde místo leží, a dostane body podle vzdálenosti.
// Mapy jsou v data/mapa.json (scripts/build-mapa.mjs z Natural Earth): výřez celého kontinentu, u míst v Česku Česko s kraji a řekami.
// Logika bez DOM (výběr položek a výřezu, zobrazení, body) je testovaná v tests/question-map.test.js; vykreslení a ovládání mapy
// (klepnutí, posun, přiblížení tlačítky, kolečkem i dvěma prsty) běží jen v prohlížeči. Aplikace volá jen několik háčků (app.js).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore, root);
    if (isNode) module.exports = api;
    else root.MudrlantMapQuestion = api;
})(typeof self !== 'undefined' ? self : this, (core, root) => {
    'use strict';

    const { distanceKm, getContinent, continentAt, CZECHIA_QID, normalizeAnswer, escapeHtml, formatPoints, pointsFor, createSeededRandom } = core;

    // --- Výřezy map ---

    // Pevný výřez pro každou oblast: neprozradí víc než kontinent (u míst v Česku celé Česko), ať je mapa férová.
    // center = střed zobrazení [šířka, délka]; bounds = krajní místa oblasti [šířka, délka], výřez je obdélník kolem nich
    // (s okrajem FRAME_MARGIN). Místo patří do oblasti podle kontinentu (u Česka podle státu) a jen tehdy, když leží ve výřezu
    // (Azory, Havaj, Svalbard ani Grónsko ne: výřez kontinentu by se kvůli nim zbytečně zvětšil).
    const REGIONS = [
        { id: 'cesko', label: 'Česko', center: [49.8, 15.47], detail: true,
            bounds: [[51.056, 14.316], [48.552, 14.333], [50.252, 12.091], [49.55, 18.859]] },
        { id: 'evropa', label: 'Evropa', center: [53, 16], continent: 'EU',
            bounds: [[66.6, -24.6], [63.3, -22.5], [36.9, -9.6], [36, -5.6], [34.7, 24.1], [34.6, 34.6], [41.2, 49.5], [56.5, 50.5], [71.2, 25.8], [69.8, 41.5]] },
        { id: 'afrika', label: 'Afrika', center: [3, 18], continent: 'AF',
            bounds: [[37.5, 9.8], [35.8, -6], [17.2, -25.4], [14.8, -25.4], [-34.9, 20], [-20.5, 57.8], [-21.4, 55.4], [11.9, 51.4], [31.6, 34.2]] },
        { id: 'asie', label: 'Asie', center: [32, 95], continent: 'AS',
            bounds: [[39.2, 26], [12.6, 43.2], [-11, 124.5], [-9, 116], [45.5, 148], [56.2, 162.5], [59.7, 151], [57, 60.7], [41.2, 26.5]] },
        { id: 'severni-amerika', label: 'Severní Amerika', center: [45, -100], continent: 'NA',
            bounds: [[65.6, -168.2], [71.4, -156.8], [70, -100], [60.5, -64.5], [47.6, -52.6], [13.1, -59.4], [7.2, -80.6], [22.8, -110]] },
        { id: 'jizni-amerika', label: 'Jižní Amerika', center: [-20, -64], continent: 'SA',
            bounds: [[12.5, -72], [10.8, -61], [-7.2, -34.8], [-3.9, -32.3], [-55.9, -67.3], [-52, -75.6], [-0.4, -91.7], [-18.3, -70.4]] },
        { id: 'oceanie', label: 'Austrálie a Oceánie', center: [-22, 155], continent: 'OC',
            bounds: [[-22, 113.3], [-11, 131], [7.6, 134.5], [-17, 179.9], [-21.3, -175.1], [-13.7, -171.6], [-46.9, 167.8], [-43.7, 146.8], [-35.1, 117]] }
    ];
    // Mapa, na které hráč hledá: celý svět (neprozradí ani kontinent), u míst v Česku podrobná mapa Česka. Oblast místa
    // (kontinent) dál určuje poloměry bodů. Svět je v zobrazení Equal Earth (stejnoploché, kontinenty bez velkého zkreslení),
    // bez Antarktidy dole; víc jednotek mapy, ať jsou obrysy i při velkém přiblížení přesné.
    // Svět v Mercatorově zobrazení (jako mapy v telefonu): tvary pevnin jsou všude věrné, jen sever a jih vycházejí větší;
    // od 83° s. š. do 61° j. š. (s Drakeovým průlivem, bez Antarktidy)
    const WORLD = { id: 'svet', label: 'Svět', projection: 'mercator', center: [0, 0], units: 8000, bounds: [[83, -180], [83, 180], [-61, -180], [-61, 180], [0, -180], [0, 180]] };
    // Okraj výřezu kolem krajních míst (podíl delší strany), ať místo na hranici oblasti není přímo na kraji mapy
    const FRAME_MARGIN = 0.04;
    const REGION_BY_ID = Object.fromEntries([...REGIONS, WORLD].map(region => [region.id, region]));
    // Mapy v data/mapa.json a mapa pro otázku: Česko pro místa v Česku, jinak svět
    const MAP_REGIONS = [REGION_BY_ID.cesko, WORLD];
    const mapRegionOf = (regionId) => (regionId === 'cesko' ? REGION_BY_ID.cesko : WORLD);

    // Delší strana výřezu má na mapě 1000 jednotek (souřadnice cest v data/mapa.json)
    const FRAME_UNITS = 1000;
    // Nejvíc přiblížení: mapa Česka 32×, svět 256× (na displeji telefonu pak asi 150 km, obrysy jsou z 1:50m)
    const MAX_ZOOM = 32;
    const WORLD_MAX_ZOOM = 256;
    const EARTH_KM = 6371;
    const RAD = Math.PI / 180;

    // Lambertovo azimutální stejnoploché zobrazení se středem v oblasti (jako v atlasech): kontinent bez velkého zkreslení
    // u pólů a i přes datovou hranici (Oceánie). Souřadnice na jednotkové kouli, y nahoru.
    const projector = (lat0, lon0) => {
        const sin0 = Math.sin(lat0 * RAD);
        const cos0 = Math.cos(lat0 * RAD);
        const forward = (lat, lon) => {
            const phi = lat * RAD;
            const dl = (lon - lon0) * RAD;
            const sinP = Math.sin(phi);
            const cosP = Math.cos(phi);
            const cosL = Math.cos(dl);
            const denominator = 1 + sin0 * sinP + cos0 * cosP * cosL;
            const k = denominator > 1e-12 ? Math.sqrt(2 / denominator) : 0;
            return [k * cosP * Math.sin(dl), k * (cos0 * sinP - sin0 * cosP * cosL)];
        };
        const inverse = (x, y) => {
            const rho = Math.hypot(x, y);
            if (rho < 1e-12) return [lat0, lon0];
            const c = 2 * Math.asin(Math.min(1, rho / 2));
            const sinC = Math.sin(c);
            const cosC = Math.cos(c);
            const lat = Math.asin(Math.max(-1, Math.min(1, cosC * sin0 + y * sinC * cos0 / rho))) / RAD;
            const lon = lon0 + Math.atan2(x * sinC, rho * cos0 * cosC - y * sin0 * sinC) / RAD;
            return [lat, ((lon + 540) % 360) - 180];
        };
        // Úhlová vzdálenost od středu ve stupních (co je za polokoulí, mapa nekreslí)
        const angle = (lat, lon) => {
            const phi = lat * RAD;
            const cosine = sin0 * Math.sin(phi) + cos0 * Math.cos(phi) * Math.cos((lon - lon0) * RAD);
            return Math.acos(Math.max(-1, Math.min(1, cosine))) / RAD;
        };
        return { forward, inverse, angle };
    };

    // Equal Earth (Šavrič, Patterson, Jenny 2018) se středním poledníkem lon0: x, y na jednotkové kouli, y nahoru
    const EQUAL_EARTH = [1.340264, -0.081106, 0.000893, 0.003796];
    const equalEarth = (lon0 = 0) => {
        const [A1, A2, A3, A4] = EQUAL_EARTH;
        const M = Math.sqrt(3) / 2;
        const polynomial = (t) => { const t2 = t * t, t6 = t2 * t2 * t2; return [t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)), A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)]; };
        const forward = (lat, lon) => {
            const theta = Math.asin(M * Math.sin(lat * RAD));
            // ±180° zůstane na svém okraji mapy (Fidži i Čukotka jsou v datech rozdělené na 180. poledníku)
            const delta = lon - lon0;
            const lambda = (delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta) * RAD;
            const [y, derivative] = polynomial(theta);
            return [2 * Math.sqrt(3) * lambda * Math.cos(theta) / (3 * derivative), y];
        };
        const inverse = (x, y) => {
            let theta = y / A1;
            for (let i = 0; i < 12; i++) {
                const [value, derivative] = polynomial(theta);
                const step = (value - y) / derivative;
                theta -= step;
                if (Math.abs(step) < 1e-12) break;
            }
            const derivative = polynomial(theta)[1];
            const lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(theta) / M))) / RAD;
            const lon = lon0 + 3 * x * derivative / (2 * Math.sqrt(3) * Math.cos(theta)) / RAD;
            return [lat, Math.max(-180, Math.min(180, lon))];
        };
        // Celý svět je vidět (nic není „za polokoulí“)
        return { forward, inverse, angle: () => 0 };
    };
    // Mercatorovo zobrazení se středním poledníkem lon0 (x, y na jednotkové kouli, y nahoru)
    const mercator = (lon0 = 0) => {
        const forward = (lat, lon) => {
            const delta = lon - lon0;
            const lambda = (delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta) * RAD;
            const phi = Math.max(-85, Math.min(85, lat)) * RAD;
            return [lambda, Math.log(Math.tan(Math.PI / 4 + phi / 2))];
        };
        const inverse = (x, y) => [(2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD, Math.max(-180, Math.min(180, lon0 + x / RAD))];
        return { forward, inverse, angle: () => 0 };
    };
    const projectionOf = (region) => (region.projection === 'mercator' ? mercator(region.center[1]) : region.projection === 'equalEarth' ? equalEarth(region.center[1]) : projector(region.center[0], region.center[1]));

    // Výřez oblasti v jednotkách mapy: obdélník kolem promítnutého boxu, delší strana FRAME_UNITS (u světa víc); diagonála
    // v km určuje body. Nejvíc přiblížení: kolem 150 km na šířku displeje (jako dřív 32× u kontinentu), u Česka 32×.
    const frames = new Map();
    const frameOf = (regionOrId) => {
        const region = typeof regionOrId === 'string' ? REGION_BY_ID[regionOrId] : regionOrId;
        if (!region) return null;
        if (frames.has(region.id)) return frames.get(region.id);
        const { forward, inverse } = projectionOf(region);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [lat, lon] of region.bounds) {
            const [x, y] = forward(lat, lon);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        const margin = region.projection ? 0 : Math.max(x1 - x0, y1 - y0) * FRAME_MARGIN;
        x0 -= margin; x1 += margin; y0 -= margin; y1 += margin;
        const scale = (region.units || FRAME_UNITS) / Math.max(x1 - x0, y1 - y0);
        const frame = {
            region,
            scale,
            width: Math.round((x1 - x0) * scale),
            height: Math.round((y1 - y0) * scale),
            diagonalKm: Math.round(Math.hypot(x1 - x0, y1 - y0) * EARTH_KM),
            // Poloha a jednotky mapy (x doprava, y dolů)
            toMap: (lat, lon) => { const [x, y] = forward(lat, lon); return [(x - x0) * scale, (y1 - y) * scale]; },
            fromMap: (mx, my) => { const [lat, lon] = inverse(mx / scale + x0, y1 - my / scale); return { lat, lon }; },
            // Kolik jednotek mapy je jeden kilometr (u středu výřezu; tolerance pobřeží)
            unitsPerKm: scale / EARTH_KM,
            // Kolik jednotek je kilometr na dané šířce (v Mercatorově zobrazení k pólům přibývá)
            unitsPerKmAt: (lat) => scale / EARTH_KM / (region.projection === 'mercator' ? Math.max(0.1, Math.cos(lat * RAD)) : 1),
            maxZoom: region.projection ? WORLD_MAX_ZOOM : MAX_ZOOM
        };
        frames.set(region.id, frame);
        return frame;
    };

    // Místo leží ve výřezu oblasti (na přivrácené polokouli a uvnitř obdélníku mapy)
    const insideFrame = (region, lat, lon) => {
        const frame = frameOf(region);
        if (projectionOf(region).angle(lat, lon) > 90) return false;
        const [x, y] = frame.toMap(lat, lon);
        return x >= 0 && y >= 0 && x <= frame.width && y <= frame.height;
    };

    // Oblast mapy pro místo: v Česku Česko, jinak kontinent místa (getContinent podle státu a polohy); mimo výřez žádná
    // (stadiony ve sportu stát nemají, jen jeho název: v Česku podle něj, kontinent podle polohy)
    const regionFor = (item, countries = {}) => {
        if (!item || !Number.isFinite(item.la) || !Number.isFinite(item.lo)) return null;
        const czech = (item.co || []).includes(CZECHIA_QID) || (!item.co && (item.f || {}).land === 'Česko');
        if (czech && insideFrame(REGION_BY_ID.cesko, item.la, item.lo)) return REGION_BY_ID.cesko;
        // Jen v Česku, ale mimo mapu Česka: žádná; Česko mezi více státy (Karpaty) jde na kontinent
        if (czech && (item.co || []).length <= 1) return null;
        // Kontinent podle státu; stát, který hra nezná (SSSR u bitev), podle polohy. Mimo výřez kontinentu zkusí kontinent
        // podle polohy (Rusko má bod na Sibiři) a plocha s obrysem (stát, řeka) se bere i tak – začíná na mapě světa
        const byState = (item.co || []).length ? getContinent(item, countries) : '';
        const regionOf = (continent) => REGIONS.find(candidate => candidate.continent && candidate.continent === continent) || null;
        // Hledá se na mapě světa: místo mimo ni (Antarktida pod 61° j. š.) se neptá
        if (!insideFrame(WORLD, item.la, item.lo)) return null;
        const first = regionOf(byState || continentAt(item.la, item.lo));
        if (first && insideFrame(first, item.la, item.lo)) return first;
        const second = regionOf(continentAt(item.la, item.lo));
        if (second && insideFrame(second, item.la, item.lo)) return second;
        return needsShape(item) ? first || second : null;
    };

    // --- Které položky ---

    // Jen místa, která jsou na mapě opravdu bod: města, vrcholy a sopky (ne pohoří), jezera a nádrže (ne moře, zálivy
    // a průliv), ostrovy (ne souostroví), stavby, z přírody vodopády, jeskyně, skály a národní parky; ze sportu stadiony,
    // haly a okruhy. Řeky jsou čáry, ne body, a vynechávají se.
    const KINDS = {
        zemepis: {
            mesto: true,
            hora: ['hora', 'stratovulkán', 'sopka'],
            jezero: ['jezero', 'přehradní nádrž', 'laguna', 'moře', 'zátoka', 'průliv'],
            ostrov: ['ostrov', 'souostroví'],
            stavba: true,
            priroda: ['vodopád', 'jeskyně', 'skála', 'skalní suk', 'národní park', 'chráněná krajinná oblast', 'národní přírodní rezervace', 'poušť', 'poloostrov']
        },
        sport: { sportoviste: true },
        // Bitvy v jednom místě (ne války, tažení a revoluce) a události s jedním místem (konference, smlouva, havárie…)
        historie: {
            bitva: ['bitva', 'námořní bitva', 'obléhání', 'útok', 'letecké bombardování města', 'bombardování', 'kobercové bombardování', 'vojenská operace'],
            udalosti: ['havárie', 'mírová smlouva', 'zemětřesení', 'smlouva', 'konference', 'masakr', 'koncil', 'požár', 'atentát', 'proces', 'výbuch sopky', 'korunovace', 'tsunami']
        },
        architektura: { stavby: true },
        vlajky: { regiony: true }
    };
    // Státy, řeky, pohoří a regiony se doplní do zeměpisu (jen s obrysem)
    KINDS.zemepis.stat = true;
    KINDS.zemepis.reka = ['řeka'];
    KINDS.zemepis.hora = [...KINDS.zemepis.hora, 'pohoří'];
    // Místa, která jsou na mapě jen jako plocha nebo čára (moře, stát, řeka, pohoří, region…): ptá se na ně jen s obrysem
    // (data/mapa-tvary.json)
    const SHAPE_ONLY = new Set(['moře', 'zátoka', 'průliv', 'souostroví', 'poušť', 'poloostrov', 'pohoří', 'řeka']);
    const SHAPE_ONLY_CATEGORIES = new Set(['stat', 'reka', 'regiony']);
    const needsShape = (item) => SHAPE_ONLY.has(item.ty) || SHAPE_ONLY_CATEGORIES.has(item.c);
    // Plošná místa: kdo klepne kamkoli na ostrov nebo jezero, má plné body i dál od jeho středu (poloměr podle rozlohy)
    const AREA_CATEGORIES = new Set(['jezero', 'ostrov', 'priroda', 'stat', 'reka', 'regiony', 'hora']);

    // Druhy mapových otázek pro střídání v režimu Ukaž na mapě: každý druh přijde zhruba stejně často (ne samé stadiony)
    const MAP_GROUPS = [
        { id: 'mesta', label: 'Město', topics: ['zemepis'], test: item => item.c === 'mesto' },
        { id: 'staty', label: 'Stát', topics: ['zemepis'], test: item => item.c === 'stat' },
        { id: 'hory', label: 'Hora', topics: ['zemepis'], test: item => item.c === 'hora' && item.ty !== 'pohoří' },
        { id: 'pohori', label: 'Pohoří', topics: ['zemepis'], test: item => item.c === 'hora' && item.ty === 'pohoří' },
        { id: 'reky', label: 'Řeka', topics: ['zemepis'], test: item => item.c === 'reka' },
        { id: 'jezera', label: 'Jezero', topics: ['zemepis'], test: item => item.c === 'jezero' && ['jezero', 'přehradní nádrž', 'laguna'].includes(item.ty) },
        { id: 'more', label: 'Moře a zálivy', topics: ['zemepis'], test: item => item.c === 'jezero' && ['moře', 'zátoka', 'průliv'].includes(item.ty) },
        { id: 'ostrovy', label: 'Ostrov', topics: ['zemepis'], test: item => item.c === 'ostrov' },
        { id: 'priroda', label: 'Příroda', topics: ['zemepis'], test: item => item.c === 'priroda' },
        { id: 'stavby', label: 'Stavba', topics: ['zemepis', 'architektura'], test: item => item.c === 'stavba' || item.c === 'stavby' },
        { id: 'bitvy', label: 'Bitva', topics: ['historie'], test: item => item.c === 'bitva' },
        { id: 'udalosti', label: 'Událost', topics: ['historie'], test: item => item.c === 'udalosti' },
        { id: 'regiony', label: 'Region', topics: ['vlajky'], test: item => item.c === 'regiony' },
        { id: 'sportoviste', label: 'Sportoviště', topics: ['sport'], test: item => item.c === 'sportoviste' }
    ];
    const MAP_TOPICS = [...new Set(MAP_GROUPS.flatMap(group => group.topics))];
    const groupOf = (item) => MAP_GROUPS.find(group => group.test(item)) || null;
    // Stavba ve velkém městě by byla jen otázkou „kde je to město“ (na mapě Česka má plný počet bodů poloměr asi 17 km):
    // takové se v Česku nekladou (Pražský hrad, Špilberk, stadiony v Praze)
    const BIG_CZECH_CITIES = [{ la: 50.083, lo: 14.421 }, { la: 49.195, lo: 16.608 }, { la: 49.835, lo: 18.282 }, { la: 49.747, lo: 13.378 }];
    const BIG_CITY_KM = 8;

    const kindAllowed = (topicId, item) => {
        const rule = (KINDS[topicId] || {})[item.c];
        return rule === true || (Array.isArray(rule) && rule.includes(item.ty));
    };

    // Stejně pojmenovaná místa stejného druhu daleko od sebe (Smrk v Jizerských horách i v Beskydech, Birmingham, Victoria)
    // by otázka nerozlišila; jiný druh rozliší štítek nad otázkou (Moskva město × řeka)
    const sameNames = new WeakMap();
    // Stejné jméno u jiného druhu (ostrov Irsko × stát Irsko): otázka doplní druh, ať je jasné, na co se ptá
    const namesByCategory = new WeakMap();
    const sameNameElsewhere = (item, items) => {
        if (!Array.isArray(items)) return false;
        if (!namesByCategory.has(items)) {
            const names = new Map();
            for (const other of items) {
                if (!Number.isFinite(other.la)) continue;
                const key = normalizeAnswer(other.n);
                if (!names.has(key)) names.set(key, new Set());
                names.get(key).add(other.c);
            }
            namesByCategory.set(items, names);
        }
        const categories = namesByCategory.get(items).get(normalizeAnswer(item.n));
        return Boolean(categories && [...categories].some(category => category !== item.c));
    };
    const KIND_WORDS = { 'suverénní stát': 'stát', velkoměsto: 'město', 'hlavní město': 'město', metropole: 'město', stratovulkán: 'sopka' };
    const isAmbiguous = (item, items) => {
        if (!Array.isArray(items)) return false;
        if (!sameNames.has(items)) {
            const byName = new Map();
            for (const other of items) {
                if (!Number.isFinite(other.la)) continue;
                const key = `${other.c}\u0000${normalizeAnswer(other.n)}`;
                if (!byName.has(key)) byName.set(key, []);
                byName.get(key).push(other);
            }
            sameNames.set(items, byName);
        }
        return (sameNames.get(items).get(`${item.c}\u0000${normalizeAnswer(item.n)}`) || []).some(other => other !== item && other.q !== item.q && distanceKm(item, other) > 30);
    };

    // Může se na položku ptát mapou? Vrací oblast, nebo null. Nepotřebuje mapová data (to, jestli místo není v moři mimo
    // nakreslenou pevninu, zkontroluje buildQuestion).
    // S mapovými daty (mapData) se plošná místa bez obrysu vyřadí hned (výběr v režimu Ukaž na mapě)
    // Opravy z kontroly mapy (data/mapa-opravy.json, scripts/audit-mapa.mjs): skip = místo se na mapě neptá (špatná nebo
    // nejasná poloha), points = opravená poloha [šířka, délka] místo té z dat tématu
    const isSkipped = (item, mapData) => Boolean(mapData && mapData.skip && item && mapData.skip[item.q]);
    const placed = (item, mapData) => {
        const fixed = mapData && mapData.points && item && mapData.points[item.q];
        return Array.isArray(fixed) && Number.isFinite(fixed[0]) && Number.isFinite(fixed[1]) ? { ...item, la: fixed[0], lo: fixed[1] } : item;
    };
    const candidate = (original, ctx, mapData = null) => {
        const topicId = ctx && ctx.topic && ctx.topic.id;
        const item = placed(original, mapData);
        if (!item || !kindAllowed(topicId, item) || item.nq || isSkipped(item, mapData)) return null;
        if (needsShape(item) && mapData && !shapeOf(mapData, item)) return null;
        const region = regionFor(item, (ctx && ctx.countries) || {});
        if (!region) return null;
        // „Kde leží Česko?“ na mapě Česka nemá smysl
        if (region.id === 'cesko' && item.c === 'stat') return null;
        if (region.id === 'cesko' && !['mesto', 'reka', 'jezero', 'regiony'].includes(item.c) && BIG_CZECH_CITIES.some(city => distanceKm(item, city) < BIG_CITY_KM)) return null;
        if (isAmbiguous(original, ctx && ctx.items)) return null;
        return region;
    };

    // --- Obrysy plošných míst (park, jezero, moře, ostrov) ---

    // data/mapa-tvary.json: kroužky oddělené „;“, v kroužku první bod (šířka, délka v tisícinách stupně) a pak rozdíly
    const decodedShapes = new Map();
    // Čára (řeka) začíná „~“: úseky se neuzavírají a vzdálenost se měří k čáře (rings.line = true)
    const isLine = (encoded) => typeof encoded === 'string' && encoded.startsWith('~');
    const decodeShape = (encoded) => {
        if (typeof encoded !== 'string' || !encoded) return [];
        if (decodedShapes.has(encoded)) return decodedShapes.get(encoded);
        const line = isLine(encoded);
        const rings = (line ? encoded.slice(1) : encoded).split(';').map(text => {
            const numbers = text.split(',').map(Number);
            const ring = [];
            let lat = 0, lon = 0;
            for (let i = 0; i + 1 < numbers.length; i += 2) {
                lat += numbers[i];
                lon += numbers[i + 1];
                ring.push([lat / 1000, lon / 1000]);
            }
            return ring;
        }).filter(ring => ring.length >= (line ? 2 : 3));
        if (line) rings.line = true;
        if (decodedShapes.size > 200) decodedShapes.clear();
        decodedShapes.set(encoded, rings);
        return rings;
    };
    const shapeOf = (mapData, item) => (mapData && mapData.shapes && item && typeof mapData.shapes[item.q] === 'string' ? mapData.shapes[item.q] : null);
    // Vzdálenost tipu od plochy v km: uvnitř 0, jinak k nejbližšímu okraji (rovinně kolem tipu, na pár set km přesné dost)
    const KM_PER_DEGREE = Math.PI * EARTH_KM / 180;
    // Nejbližší bod plochy nebo čáry k tipu: { km, lat, lon, inside } – uvnitř plochy km = 0 (čára ve výsledku pak vede
    // k nejbližšímu místu řeky nebo břehu, ne k prameni či středu)
    const nearestOnShape = (rings, { lat, lon }) => {
        const cos = Math.max(0.05, Math.cos(lat * RAD));
        // Bod kroužku v km kolem tipu (délka přes 180. poledník k tipu nejblíž)
        const local = ([la, lo]) => {
            let dlon = lo - lon;
            dlon -= Math.round(dlon / 360) * 360;
            return [dlon * cos * KM_PER_DEGREE, (la - lat) * KM_PER_DEGREE];
        };
        let inside = false;
        let best = { km: Infinity, x: 0, y: 0 };
        for (const ring of rings) {
            const points = ring.map(local);
            // U čáry jen úseky mezi sousedními body (bez uzavření), uvnitř být nejde
            for (let i = rings.line ? 1 : 0, j = rings.line ? 0 : points.length - 1; i < points.length; j = i++) {
                const [xi, yi] = points[i];
                const [xj, yj] = points[j];
                if (!rings.line && (yi > 0) !== (yj > 0) && 0 < (xj - xi) * (0 - yi) / (yj - yi) + xi) inside = !inside;
                const dx = xi - xj, dy = yi - yj;
                const length = dx * dx + dy * dy;
                const t = length ? Math.max(0, Math.min(1, -(xj * dx + yj * dy) / length)) : 0;
                const x = xj + t * dx, y = yj + t * dy;
                const km = Math.hypot(x, y);
                if (km < best.km) best = { km, x, y };
            }
        }
        const nearest = { lat: lat + best.y / KM_PER_DEGREE, lon: ((lon + best.x / (cos * KM_PER_DEGREE) + 540) % 360) - 180 };
        return inside ? { km: 0, inside: true, lat, lon } : { km: best.km, inside: false, ...nearest };
    };
    // Vzdálenost tipu od plochy v km: uvnitř 0, jinak k nejbližšímu okraji (rovinně kolem tipu, na pár set km přesné dost)
    const distanceToShapeKm = (rings, point) => nearestOnShape(rings, point).km;

    // --- Body ---

    // Kulatá vzdálenost pro hranice bodů (hráč vidí „do 200 km“, ne „do 222 km“): 1, 5, 10, 50 nebo 100 km podle velikosti
    const roundKm = (km) => {
        const step = km < 10 ? 1 : km < 50 ? 5 : km < 200 ? 10 : km < 1000 ? 50 : 100;
        return Math.max(1, Math.round(km / step) * step);
    };
    // Plné body do 3 % diagonály výřezu (u plošných míst navíc poloměr místa), žádné od 20 %; mezi tím postupně ubývají
    const FULL_SHARE = 0.03;
    const ZERO_SHARE = 0.2;
    // U čáry (řeka) poloviční poloměry: řeka je dlouhá, „někde u ní“ je snazší než u bodu
    const radiiFor = (item, region, withShape = false, line = false) => {
        const frame = frameOf(region);
        const area = (item.f || {}).area;
        // S obrysem se měří od okraje plochy, poloměr podle rozlohy už není potřeba
        const extra = !withShape && AREA_CATEGORIES.has(item.c) && area > 0 ? Math.min(Math.sqrt(area / Math.PI), frame.diagonalKm * 0.08) : 0;
        const share = line ? 0.5 : 1;
        return { full: roundKm(frame.diagonalKm * FULL_SHARE * share + extra), zero: roundKm(frame.diagonalKm * ZERO_SHARE * share + extra) };
    };
    // Nejvíc bodů: jako otázka bez nápovědy (při psaní dvojnásobek), aby otázka zapadla do bodů i XP ostatních otázek
    const maxPoints = (typed) => pointsFor(1, Boolean(typed));
    // Hranice bodů [{ points, km }] od plných po 1 bod: max do plného poloměru, pak rovnoměrně ubývá až po nulový poloměr;
    // každá hranice je kulatá vzdálenost (hráč je vidí v otázce). Body jsou celé číslo 0…max, správně = aspoň bod.
    const pointTiers = ({ full, zero }, max) => {
        const tiers = [{ points: max, km: roundKm(full) }];
        for (let points = max - 1; points >= 1; points--) {
            const km = roundKm(zero - (points - 1) / Math.max(1, max - 1) * (zero - full));
            tiers.push({ points, km: Math.max(km, tiers[tiers.length - 1].km + 1) });
        }
        return tiers;
    };
    const pointsForDistance = (km, radii, max) => {
        if (!(km >= 0)) return 0;
        const tier = pointTiers(radii, max).find(entry => km <= entry.km);
        return tier ? tier.points : 0;
    };
    // U plochy se měří od okraje (uvnitř = 0 km, plný počet bodů), jinak od bodu místa
    const scoreGuess = (map, guess, max) => {
        const km = map.shape ? distanceToShapeKm(decodeShape(map.shape), guess) : distanceKm({ la: guess.lat, lo: guess.lon }, { la: map.lat, lo: map.lon });
        return { km, points: pointsForDistance(km, map, max) };
    };

    // Vzdálenost pro hráče: „méně než 1 km“, „3,4 km“, „37 km“, „1 240 km“
    const formatKm = (km) => {
        if (km < 1) return 'méně než 1 km';
        const rounded = km < 10 ? Math.round(km * 10) / 10 : km < 1000 ? Math.round(km) : Math.round(km / 10) * 10;
        return `${rounded.toLocaleString('cs-CZ')} km`;
    };

    // --- Otázka ---

    // Místo daleko od okraje výřezu kontinentu (okraj 18 %) a celý obrys uvnitř (okraj 6 %) – jinak by bylo na kraji mapy
    // nebo z ní vyčuhovalo a popisek kontinentu by mátl (Tatarstán na východním okraji Evropy)
    const CENTER_EDGE = 0.18;
    const SHAPE_EDGE = 0.06;
    const wellInside = (region, item, shape) => {
        const frame = frameOf(region);
        const projection = projectionOf(region);
        const inside = (edge) => ([lat, lon]) => {
            if (projection.angle(lat, lon) > 80) return false;
            const [x, y] = frame.toMap(lat, lon);
            return x >= frame.width * edge && x <= frame.width * (1 - edge) && y >= frame.height * edge && y <= frame.height * (1 - edge);
        };
        if (!inside(CENTER_EDGE)([item.la, item.lo])) return false;
        return !shape || decodeShape(shape).every(ring => ring.every(inside(SHAPE_EDGE)));
    };
    // Pohled na začátku: celý svět (těžší, neprozradí kontinent), nebo rovnou kontinent místa. Střídá se napůl podle QID místa,
    // takže stejné místo má u všech hráčů (výzva, zápas) stejný pohled.
    const viewFor = (item) => {
        let hash = 0;
        for (const char of String(item.q || item.n || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        return hash % 2 ? 'continent' : 'world';
    };

    // „Kde stojí“ u staveb, jinak „Kde leží“ (sloveso má stejný tvar v jednotném i množném čísle: leží Niagarské vodopády)
    const LYING_BUILDINGS = new Set(['archeologická lokalita', 'starověké město', 'náměstí', 'historické centrum', 'park', 'hřbitov', 'zahrada']);
    const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
    const titleFor = (item) => {
        const name = item.n;
        if (item.c === 'reka') return `Kudy teče ${name}?`;
        if (item.c === 'bitva') {
            if (/^(Bitva|Námořní bitva) /u.test(name)) return `Kde se odehrála ${lowerFirst(name)}?`;
            if (/^Obléhání /u.test(name)) return `Kde se odehrálo ${lowerFirst(name)}?`;
            return `${name} – kde se to stalo?`;
        }
        if (item.c === 'udalosti') {
            // Rod podle podstatného jména v názvu: Vídeňský kongres se konal, Jaltská konference se konala
            if (item.ty === 'konference' || item.ty === 'koncil') {
                const verb = /(kongres|summit|sjezd|koncil|sněm|mítink)/iu.test(name) ? 'konal' : /(konference|schůzka|porada)/iu.test(name) ? 'konala' : '';
                if (verb) return `Kde se ${verb} ${name}?`;
                return `${name} – kde se to stalo?`;
            }
            if (/smlouva|dohoda/iu.test(name)) return `Kde byla podepsána ${name}?`;
            return `${name} – kde se to stalo?`;
        }
        const standing = ((item.c === 'stavba' || item.c === 'stavby') && !LYING_BUILDINGS.has(item.ty)) || item.c === 'sportoviste';
        return `${standing ? 'Kde stojí' : 'Kde leží'} ${name}?`;
    };

    // Bod uvnitř nakreslené pevniny nebo jezera (jinak by hráč hledal ostrov, který na mapě není): mapa z data/mapa.json
    const parsedRings = new WeakMap();
    const ringsOf = (path) => {
        const rings = [];
        let ring = null;
        let x = 0, y = 0;
        const tokens = String(path || '').match(/[MlLzZ]|-?\d+(?:\.\d+)?/g) || [];
        let command = '';
        for (let i = 0; i < tokens.length;) {
            const token = tokens[i];
            if (/[MlLzZ]/.test(token)) { command = token; i++; if (command === 'z' || command === 'Z') { if (ring) rings.push(ring); ring = null; } continue; }
            const a = Number(tokens[i]);
            const b = Number(tokens[i + 1]);
            i += 2;
            if (command === 'M') { if (ring) rings.push(ring); x = a; y = b; ring = [[x, y]]; command = 'l'; }
            else if (command === 'l') { x += a; y += b; ring.push([x, y]); }
            else if (command === 'L') { x = a; y = b; ring.push([x, y]); }
        }
        if (ring) rings.push(ring);
        return rings;
    };
    const layerRings = (regionData, layer) => {
        if (!parsedRings.has(regionData)) parsedRings.set(regionData, {});
        const cache = parsedRings.get(regionData);
        if (!cache[layer]) cache[layer] = ringsOf((regionData.layers || {})[layer]);
        return cache[layer];
    };
    const insideRing = (x, y, ring) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };
    const distanceToRing = (x, y, ring) => {
        let best = Infinity;
        for (let i = 1; i < ring.length; i++) {
            const [ax, ay] = ring[i - 1];
            const [bx, by] = ring[i];
            const dx = bx - ax, dy = by - ay;
            const length = dx * dx + dy * dy;
            const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
            best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
        }
        return best;
    };
    // Na pevnině nebo do tolerance od pobřeží (přístavní město, malý ostrov zjednodušený do pár bodů)
    const COAST_TOLERANCE_KM = 12;
    // Ostrov musí být opravdu nakreslený (Capri v 1:50m není, jen pobřeží vedle), tolerance jen na zaokrouhlení obrysu
    const ISLAND_TOLERANCE_KM = 3;
    const onDrawnLand = (regionData, frame, lat, lon, toleranceKm = COAST_TOLERANCE_KM) => {
        const [x, y] = frame.toMap(lat, lon);
        const tolerance = toleranceKm * frame.unitsPerKmAt(lat);
        const rings = [...layerRings(regionData, 'land'), ...layerRings(regionData, 'seam')];
        let inside = false;
        for (const ring of rings) if (insideRing(x, y, ring)) inside = !inside;
        return inside || rings.some(ring => distanceToRing(x, y, ring) <= tolerance);
    };

    // Stát (na mapě Česka kraj), do kterého místo padne: data/mapa.json areas, jinak null (moře, okolí Česka)
    const parsedAreas = new WeakMap();
    const areaAt = (regionData, frame, lat, lon) => {
        if (!regionData || !Array.isArray(regionData.areas)) return null;
        if (!parsedAreas.has(regionData)) parsedAreas.set(regionData, regionData.areas.map(area => ({ name: area.n, rings: ringsOf(area.d) })));
        const [x, y] = frame.toMap(lat, lon);
        const hit = parsedAreas.get(regionData).find(area => area.rings.reduce((inside, ring) => (insideRing(x, y, ring) ? !inside : inside), false));
        return hit ? hit.name : null;
    };

    // Obrys z podkladové mapy (cesta SVG v jednotkách mapy): stát podle plochy státu (areas), ostrov nejmenší kroužek pevniny
    // a jezero kroužek jezer, které obsahují místo a mají podobnou velikost jako obrys z data/mapa-tvary.json; jinak null
    const ringArea = (ring) => {
        let sum = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
        return Math.abs(sum / 2);
    };
    const ringPath = (ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
    const basemapOutline = (regionData, frame, question, shape) => {
        if (!regionData) return null;
        const kind = question.map.kind;
        if (kind === 'staty') {
            const area = (regionData.areas || []).find(entry => normalizeAnswer(entry.n) === normalizeAnswer(question.answerLabel));
            return area ? area.d : null;
        }
        const layer = kind === 'ostrovy' ? 'land' : kind === 'jezera' ? 'lakes' : null;
        if (!layer) return null;
        const [x, y] = frame.toMap(question.map.lat, question.map.lon);
        const wanted = shape.reduce((sum, ring) => sum + ringArea(ring.map(([lat, lon]) => frame.toMap(lat, lon))), 0);
        const ring = layerRings(regionData, layer).filter(candidate => insideRing(x, y, candidate)).sort((a, b) => ringArea(a) - ringArea(b))[0];
        if (!ring || !wanted) return null;
        const ratio = ringArea(ring) / wanted;
        return ratio > 0.5 && ratio < 2 ? ringPath(ring) : null;
    };

    // Otázka na mapě pro položku, nebo null (místo v moři mimo nakreslenou pevninu, chybějící mapa oblasti)
    const buildQuestion = (original, ctx, mapData) => {
        const region = candidate(original, ctx, mapData);
        const item = placed(original, mapData);
        const shown = region && mapRegionOf(region.id);
        const regionData = shown && mapData && mapData.regions && mapData.regions[shown.id];
        if (!regionData) return null;
        const shape = AREA_CATEGORIES.has(item.c) ? shapeOf(mapData, item) : null;
        const group = groupOf(item);
        if (!shape && item.c !== 'jezero' && !onDrawnLand(regionData, frameOf(shown), item.la, item.lo, item.c === 'ostrov' ? ISLAND_TOLERANCE_KM : COAST_TOLERANCE_KM)) return null;
        // Ostrov s obrysem musí být na podkladové mapě nakreslený (jinak by hráč hledal v moři místo, které nevidí)
        if (shape && item.ty === 'ostrov' && !onDrawnLand(regionData, frameOf(shown), item.la, item.lo, COAST_TOLERANCE_KM)) return null;
        // Pohled: u Česka mapa Česka, jinak napůl celý svět a napůl rovnou kontinent (podle místa, pro všechny hráče stejně);
        // kontinent jen tehdy, když místo i celý jeho obrys leží pohodlně uvnitř výřezu (Tatarstán u okraje Evropy ne)
        const view = region.id === 'cesko' ? 'cesko' : viewFor(item) === 'continent' && wellInside(region, item, shape) ? 'continent' : 'world';
        return {
            type: 'map',
            title: sameNameElsewhere(original, ctx && ctx.items) && item.ty && !normalizeAnswer(item.n).includes(normalizeAnswer(item.ty))
                ? titleFor({ ...item, n: `${KIND_WORDS[item.ty] || item.ty} ${item.n}` }) : titleFor(item),
            showName: true,
            choices: [],
            accepted: [],
            placeholder: '',
            answerLabel: item.n,
            map: { region: region.id, view, lat: item.la, lon: item.lo, ...radiiFor(item, region, Boolean(shape), isLine(shape)), ...(shape ? { shape } : {}),
                ...(group ? { kind: group.id } : {}), ...(group && group.id === 'regiony' ? { label: group.label } : {}) }
        };
    };

    // Kdy přijde otázka na mapě: po nejméně MIN_GAP vhodných otázkách napůl náhodou, po MAX_GAP vždy – v průměru každá
    // osmá vhodná otázka. Počítadlo je v zařízení (GAP_KEY), takže první otázky nové hry jsou vždy obvyklé.
    const GAP_KEY = 'mudrlant.mapGap';
    const MIN_GAP = 6;
    const MAX_GAP = 10;
    const isDue = (gap, rng) => gap >= MAX_GAP || (gap >= MIN_GAP && rng() < 0.5);
    // storage = { read, write } (počítadlo), loadMap = načtení data/mapa.json; vrací otázku, nebo null (obvyklá otázka)
    const nextQuestion = async (item, ctx, { storage, rng = Math.random, loadMap }) => {
        if (!candidate(item, ctx)) return null;
        const stored = Number(storage.read());
        const gap = Number.isFinite(stored) && stored > 0 ? Math.min(stored, MAX_GAP) : 0;
        if (!isDue(gap, rng)) { storage.write(gap + 1); return null; }
        let question = null;
        try { question = buildQuestion(item, ctx, await loadMap()); } catch (error) { question = null; }
        storage.write(question ? 0 : gap + 1);
        return question;
    };

    // --- Otázky na mapě ve hře pro víc hráčů (výzva i výzva skupině a odveta, zápas turnaje) ---
    // Oba hráči musí dostat stejnou otázku, proto o otázce na mapě nerozhoduje počítadlo v zařízení, ale semínko otázky: vlastní řada
    // náhodných čísel ze semínka `<semínko otázky>:mapa` (rng otázky se nemění, takže ostatní otázky vyjdou jako dřív). Na mapě je asi
    // desetina otázek, a jen z těch, jejichž položka na mapu jde (candidate a buildQuestion); ostatní zůstanou obyčejné, takže otázek
    // na mapě je ve hře nejvýš asi desetina. Testy: api.multiplayerShare, nebo window.MUDRLANT_MAP_SHARE nastavené před načtením skriptu.
    // Starší aplikace o otázkách na mapě ve výzvě neví (ze stejného semínka sestaví obyčejnou otázku), proto je mají jen hry, které
    // to výslovně nesou: výzva se semínkem končícím MULTIPLAYER_SEED_MARK (zakládá ji nová aplikace, social.js createChallenge)
    // a turnaj s týdnem od MULTIPLAYER_TOURNAMENTS_FROM (semínko turnaje skládá databáze). Výzvy a turnaje starších verzí zůstanou
    // bez mapy na všech zařízeních. Hru s mapou ve starší aplikaci srovná uložená otázka na serveru (zamrzlé otázky, schéma 17): platí
    // otázka toho, kdo ji sestavil první, a otázka na mapě má proto i jednu možnost (správnou), aby ji starší aplikace přijala a zahrála.
    const MULTIPLAYER_SHARE = 0.1;
    const START_SHARE = root && typeof root.MUDRLANT_MAP_SHARE === 'number' ? root.MUDRLANT_MAP_SHARE : MULTIPLAYER_SHARE;
    const MULTIPLAYER_SEED_MARK = '.mapa';
    const MULTIPLAYER_TOURNAMENTS_FROM = '2026-11-16';
    const seedAllowsMaps = (seed) => typeof seed === 'string' && seed.endsWith(MULTIPLAYER_SEED_MARK);
    const tournamentAllowsMaps = (tournament) => Boolean(tournament) && typeof tournament.week_start === 'string'
        && /^\d{4}-\d{2}-\d{2}/.test(tournament.week_start) && tournament.week_start.slice(0, 10) >= MULTIPLAYER_TOURNAMENTS_FROM;
    // Má být otázka s tímto semínkem na mapě (když na ni její položka jde)? Pro všechny hráče stejně.
    const multiplayerDue = (seedText, share = api.multiplayerShare) => typeof seedText === 'string' && seedText.length > 0
        && createSeededRandom(`${seedText}:mapa`)() < share;
    // Otázka na mapě do hry pro víc hráčů, nebo null (položka na mapu nejde: hraje se obyčejná otázka)
    const multiplayerQuestion = (item, ctx, mapData) => {
        const question = buildQuestion(item, ctx, mapData);
        return question ? { ...question, choices: [{ id: item.q, label: question.answerLabel, correct: true }] } : null;
    };
    // Uložená otázka na mapě (ze serveru) jde zahrát: úplné údaje o místě
    const playableMap = (question) => Boolean(question && question.type === 'map' && question.map && typeof question.map === 'object'
        && typeof question.map.region === 'string' && Number.isFinite(question.map.lat) && Number.isFinite(question.map.lon)
        && Number.isFinite(question.map.full) && Number.isFinite(question.map.zero) && question.map.full >= 0 && question.map.zero >= question.map.full);

    // Výsledek odpovědi pro uložení do kola (round.map): kam hráč klepl, jak daleko to bylo a za kolik bodů
    const evaluate = (question, guess, typed) => {
        if (!question || !question.map || !guess || !Number.isFinite(guess.lat) || !Number.isFinite(guess.lon)) return null;
        const max = maxPoints(typed);
        const { km, points } = scoreGuess(question.map, guess, max);
        return { lat: guess.lat, lon: guess.lon, km: Math.round(km * 10) / 10, points, max };
    };

    // Body velkého kruhu mezi dvěma místy (čára mezi tipem a správným místem)
    const greatCircle = (a, b, steps = 24) => {
        const vector = ({ lat, lon }) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
        const va = vector(a);
        const vb = vector(b);
        const omega = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
        if (omega < 1e-6) return [a, b];
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const wa = Math.sin((1 - t) * omega) / Math.sin(omega);
            const wb = Math.sin(t * omega) / Math.sin(omega);
            const [x, y, z] = [0, 1, 2].map(k => wa * va[k] + wb * vb[k]);
            points.push({ lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD });
        }
        return points;
    };

    // Místo ve vzdálenosti km a směru bearing (stupně od severu) od bodu: kruh plných bodů v jakémkoli zobrazení
    const destination = ({ lat, lon }, km, bearing) => {
        const delta = km / EARTH_KM;
        const phi = lat * RAD;
        const theta = bearing * RAD;
        const phi2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(theta));
        const lambda2 = lon * RAD + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * Math.sin(phi2));
        return { lat: phi2 / RAD, lon: ((lambda2 / RAD + 540) % 360) - 180 };
    };
    const circleAround = (center, km, steps = 72) => Array.from({ length: steps }, (_, i) => destination(center, km, i * 360 / steps));

    // --- Vykreslení a ovládání (jen v prohlížeči) ---

    const SVG_NS = 'http://www.w3.org/2000/svg';
    // Vrstvy mapy v pořadí kreslení; třídy celé kvůli Tailwindu. Česko: okolní státy tlumeně, Česko výrazně s kraji a řekami.
    const LAYERS = {
        continent: [
            ['land', 'fill-amber-50 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-400', 0.7],
            ['seam', 'fill-amber-50 dark:fill-slate-600', 0],
            ['seamCoast', 'fill-none stroke-slate-400 dark:stroke-slate-400', 0.7],
            ['lakes', 'fill-sky-200 stroke-slate-400 dark:fill-sky-950 dark:stroke-slate-400', 0.6],
            ['borders', 'fill-none stroke-slate-400 dark:stroke-slate-400', 0.6]
        ],
        detail: [
            ['land', 'fill-slate-100 stroke-none dark:fill-slate-700', 0],
            ['home', 'fill-amber-50 stroke-none dark:fill-slate-600', 0],
            ['rivers', 'fill-none stroke-sky-500 dark:stroke-sky-400', 1.1],
            ['inner', 'fill-none stroke-slate-400 dark:stroke-slate-400', 0.8, '4 3'],
            ['borders', 'fill-none stroke-slate-400 dark:stroke-slate-500', 0.9],
            ['home', 'fill-none stroke-slate-600 dark:stroke-slate-300', 1.6]
        ]
    };
    const svgElement = (tag, attributes = {}) => {
        const element = root.document.createElementNS(SVG_NS, tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    };
    // Značky v pixelech obrazovky (nemění se s přiblížením): tip hráče = terčík v barvě aplikace, správné místo = zelený špendlík
    const guessMark = () => {
        const group = svgElement('g', { 'data-mark': 'guess' });
        group.appendChild(svgElement('circle', { r: 11, class: 'fill-brand-600/25 stroke-none' }));
        group.appendChild(svgElement('circle', { r: 6.5, 'stroke-width': 2.5, class: 'fill-brand-600 stroke-white dark:stroke-slate-900' }));
        group.appendChild(svgElement('circle', { r: 2, class: 'fill-white' }));
        return group;
    };
    const targetMark = () => {
        const group = svgElement('g', { 'data-mark': 'target' });
        group.appendChild(svgElement('path', { d: 'M0 0C-2-6-9-9.5-9-16.5a9 9 0 1 1 18 0C9-9.5 2-6 0 0z', 'stroke-width': 2, class: 'fill-emerald-600 stroke-white dark:stroke-slate-900' }));
        group.appendChild(svgElement('circle', { cy: -16.5, r: 3.2, class: 'fill-white' }));
        return group;
    };

    // Mapa oblasti v kontejneru: posun tažením, přiblížení tlačítky (data-map-zoom), kolečkem a dvěma prsty; s onPlace
    // klepnutí položí tip (hráč ho může přesunout dalším klepnutím). marks = { guess, target, full } ve stupních a km.
    const createMapView = (container, regionData, frame, { interactive = false, marks = {}, onPlace = null, onConfirm = null, focus = null, focusPad = 0.35 } = {}) => {
        container.textContent = '';
        const svg = svgElement('svg', { class: 'absolute inset-0 h-full w-full touch-none select-none', 'aria-hidden': 'true', focusable: 'false' });
        const layers = svgElement('g');
        for (const [name, className, width, dash] of LAYERS[frame.region.detail ? 'detail' : 'continent']) {
            const d = (regionData.layers || {})[name];
            if (!d) continue;
            const attributes = { d, class: className, 'fill-rule': 'evenodd', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
            if (width) attributes['stroke-width'] = width;
            if (dash) attributes['stroke-dasharray'] = dash;
            layers.appendChild(svgElement('path', attributes));
        }
        svg.appendChild(layers);
        const overlay = svgElement('g');
        svg.appendChild(overlay);
        container.appendChild(svg);

        const state = { guess: marks.guess || null, base: null, view: null, zoom: 1 };
        const pins = {};
        let line = null;
        let circle = null;
        const project = ({ lat, lon }) => frame.toMap(lat, lon);
        // Kruh plných bodů a čára mezi tipem a správným místem (v jednotkách mapy, s přiblížením rostou)
        if (marks.outline) {
            overlay.appendChild(svgElement('path', { d: marks.outline, 'fill-rule': 'evenodd', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'data-target-shape': '', class: 'fill-emerald-500/30 stroke-emerald-600 dark:fill-emerald-400/30 dark:stroke-emerald-400' }));
        } else if (marks.shape && marks.shape.length) {
            // Plocha místa (park, jezero, moře): celá je přesná trefa; kroužek přes 180. poledník zůstane v kuse
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            const d = marks.shape.map(ring => {
                let previous = null;
                return `M${ring.map(([lat, lon]) => {
                    let [x, y] = project({ lat, lon });
                    if (previous !== null && Math.abs(x - previous) > frame.width / 2) x += Math.sign(previous - x) * frame.width;
                    previous = x;
                    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join('L')}${marks.shape.line ? '' : 'Z'}`;
            }).join('');
            const GREEN_FILL = 'fill-emerald-500 stroke-emerald-500 dark:fill-emerald-400 dark:stroke-emerald-400';
            const GREEN_LINE = 'fill-none stroke-emerald-600 dark:stroke-emerald-400';
            // Obrys je z podrobnějšího zdroje než podkladová mapa (fjordy, zálivy): zvýraznění se proto ořízne podle jejího
            // pobřeží – pevninské místo (poloostrov, park, region) na pevninu, moře a záliv na vodu – a hrana jde po nakresleném
            // břehu. Obrys se před oříznutím o kousek rozšíří, ať u břehu nezbude nevybarvený proužek.
            const buffer = Math.max(2, Math.min(16, Math.hypot(x1 - x0, y1 - y0) * 0.06));
            const land = marks.clip && !marks.shape.line && x1 - x0 < frame.width / 2
                ? [...layerRings(regionData, 'land'), ...layerRings(regionData, 'seam')].filter(ring => {
                    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
                    for (const [x, y] of ring) { a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y); }
                    return a1 >= x0 - buffer && a0 <= x1 + buffer && b1 >= y0 - buffer && b0 <= y1 + buffer;
                }).map(ringPath).join('') : '';
            // Záliv jezera (Georgian Bay): jezero je na mapě voda uvnitř pevniny, do masky vody se vrací
            const nearRings = (layer) => layerRings(regionData, layer).filter(ring => ring.some(([x, y]) => x >= x0 - buffer && x <= x1 + buffer && y >= y0 - buffer && y <= y1 + buffer)).map(ringPath).join('');
            const lakes = marks.clip === 'water' && !marks.shape.line ? nearRings('lakes') : '';
            if (marks.shape.line) {
                // Řeka jako výrazná čára
                overlay.appendChild(svgElement('path', { d, 'stroke-width': 4, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-target-shape': '', class: GREEN_LINE }));
            } else if (land || marks.clip === 'water') {
                const id = `mapa-${Math.random().toString(36).slice(2, 9)}`;
                const sea = marks.clip === 'water';
                const box = { x: x0 - 2 * buffer, y: y0 - 2 * buffer, width: x1 - x0 + 4 * buffer, height: y1 - y0 + 4 * buffer };
                const units = { maskUnits: 'userSpaceOnUse', ...box };
                const white = () => svgElement('rect', { ...box, fill: '#fff' });
                const landShape = (fill, stroke = 'none') => svgElement('path', { d: land || 'M0,0', 'fill-rule': 'evenodd', fill, stroke, 'stroke-width': buffer, 'stroke-linejoin': 'round' });
                const mask = (name, children) => { const element = svgElement('mask', { id: `${id}-${name}`, ...units }); children.forEach(child => element.appendChild(child)); return element; };
                const defs = svgElement('defs');
                // kde se vybarvuje (pevnina, nebo voda), kde jde hrana po břehu (rozšířený obrys) a kde po obrysu (dál od břehu)
                const lakeShape = () => svgElement('path', { d: lakes || 'M0,0', 'fill-rule': 'evenodd', fill: '#fff' });
                defs.appendChild(mask('fill', sea ? [white(), landShape('#000'), lakeShape()] : [landShape('#fff')]));
                defs.appendChild(mask('coast', [svgElement('path', { d, 'fill-rule': 'evenodd', fill: '#fff', stroke: '#fff', 'stroke-width': buffer, 'stroke-linejoin': 'round' })]));
                defs.appendChild(mask('edge', sea ? [white(), landShape('#000', '#000'), lakeShape()] : [landShape('#fff', '#000')]));
                // rozšíření obrysu jen u břehu (na otevřené vodě a ve vnitrozemí končí výplň přesně na čáře obrysu)
                defs.appendChild(mask('near', [svgElement('path', { d: land || 'M0,0', fill: 'none', stroke: '#fff', 'stroke-width': 2 * buffer, 'stroke-linejoin': 'round' })]));
                overlay.appendChild(defs);
                const filled = svgElement('g', { mask: `url(#${id}-fill)`, opacity: 0.3, 'data-target-shape': '' });
                filled.appendChild(svgElement('path', { d, 'fill-rule': 'evenodd', 'stroke-width': 0, class: GREEN_FILL }));
                const widened = svgElement('g', { mask: `url(#${id}-near)` });
                widened.appendChild(svgElement('path', { d, 'fill-rule': 'evenodd', 'stroke-width': buffer, 'stroke-linejoin': 'round', class: GREEN_FILL }));
                filled.appendChild(widened);
                overlay.appendChild(filled);
                if (land) {
                    const coast = svgElement('g', { mask: `url(#${id}-coast)` });
                    coast.appendChild(svgElement('path', { d: land + lakes, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', class: GREEN_LINE }));
                    overlay.appendChild(coast);
                }
                const edge = svgElement('g', { mask: `url(#${id}-edge)` });
                edge.appendChild(svgElement('path', { d, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', class: GREEN_LINE }));
                overlay.appendChild(edge);
            } else {
                // Vnitrozemská plocha: zelená výplň s obrysem
                overlay.appendChild(svgElement('path', { d, 'fill-rule': 'evenodd', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'data-target-shape': '', class: 'fill-emerald-500/30 stroke-emerald-600 dark:fill-emerald-400/30 dark:stroke-emerald-400' }));
            }
        } else if (marks.target && marks.full) {
            // Kruh na zeměkouli (na mapě světa u pólů protáhlý); přes okraj mapy u 180. poledníku se jen ořízne
            const points = circleAround(marks.target, marks.full).map(project);
            const [tx] = project(marks.target);
            const unwrapped = points.map(([x, y]) => [Math.abs(x - tx) > frame.width / 2 ? x + Math.sign(tx - x) * frame.width : x, y]);
            circle = svgElement('polygon', { points: unwrapped.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke', 'data-full-circle': '', class: 'fill-emerald-500/15 stroke-emerald-600 dark:fill-emerald-400/15 dark:stroke-emerald-400' });
            overlay.appendChild(circle);
        }
        if (marks.target && marks.guess && !marks.noLine) {
            // Přes 180. poledník (Fidži, Samoa) se čára na okraji mapy přeruší a pokračuje z druhého okraje
            const pieces = [[]];
            greatCircle(marks.guess, marks.target).map(project).forEach((point, i, all) => {
                if (i > 0 && Math.abs(point[0] - all[i - 1][0]) > frame.width / 2) pieces.push([]);
                pieces[pieces.length - 1].push(point);
            });
            const d = pieces.filter(piece => piece.length > 1).map(piece => `M${piece.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`).join('');
            line = svgElement('path', { d, 'data-map-line': '', 'stroke-width': 2.5, 'stroke-dasharray': '6 5', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', class: 'fill-none stroke-slate-800 dark:stroke-white' });
            overlay.appendChild(line);
        }
        if (marks.target) { pins.target = targetMark(); overlay.appendChild(pins.target); }

        // Výřez při přiblížení 1: celý rámec oblasti vepsaný do kontejneru (u vyššího displeje je vidět víc nad a pod ním)
        const measure = () => {
            const rect = svg.getBoundingClientRect();
            const width = rect.width || container.clientWidth || 360;
            const height = rect.height || container.clientHeight || 360;
            const aspect = width / height;
            const base = frame.width / frame.height > aspect
                ? { w: frame.width, h: frame.width / aspect }
                : { w: frame.height * aspect, h: frame.height };
            base.x = (frame.width - base.w) / 2;
            base.y = (frame.height - base.h) / 2;
            return { rect: { left: rect.left, top: rect.top, width, height }, base };
        };
        let box = measure();
        const clampView = (cx, cy, zoom) => {
            const z = Math.max(1, Math.min(frame.maxZoom, zoom));
            const w = box.base.w / z;
            const h = box.base.h / z;
            const x = Math.max(box.base.x, Math.min(box.base.x + box.base.w - w, cx - w / 2));
            const y = Math.max(box.base.y, Math.min(box.base.y + box.base.h - h, cy - h / 2));
            return { x, y, w, h, zoom: z };
        };
        let view = clampView(frame.width / 2, frame.height / 2, 1);
        const zoomButtons = container.parentElement ? container.parentElement.querySelectorAll('[data-map-zoom]') : [];
        const draw = () => {
            svg.setAttribute('viewBox', `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`);
            const perPixel = view.w / box.rect.width;
            for (const [kind, pin] of Object.entries(pins)) {
                const point = kind === 'guess' ? state.guess : marks.target;
                if (!point) continue;
                const [x, y] = project(point);
                pin.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${perPixel.toFixed(4)})`);
            }
            zoomButtons.forEach(button => { button.disabled = button.dataset.mapZoom === 'in' ? view.zoom >= frame.maxZoom - 1e-6 : view.zoom <= 1 + 1e-6; });
        };
        let frameRequest = 0;
        const redraw = () => { if (!frameRequest) frameRequest = root.requestAnimationFrame(() => { frameRequest = 0; draw(); }); };
        const zoomAround = (factor, mx, my) => {
            const zoom = Math.max(1, Math.min(frame.maxZoom, view.zoom * factor));
            // Bod pod prstem (kurzorem) zůstane na místě
            const fx = (mx - view.x) / view.w;
            const fy = (my - view.y) / view.h;
            const w = box.base.w / zoom;
            const h = box.base.h / zoom;
            view = clampView(mx - fx * w + w / 2, my - fy * h + h / 2, zoom);
            // Tlačítka a kolečko hned (stav tlačítek přiblížení sedí po každém klepnutí), tažení a prsty po snímcích
            draw();
        };
        const toMap = (clientX, clientY) => [view.x + (clientX - box.rect.left) / box.rect.width * view.w, view.y + (clientY - box.rect.top) / box.rect.height * view.h];

        const placeGuess = (mx, my) => {
            const guess = frame.fromMap(mx, my);
            state.guess = { lat: Math.round(guess.lat * 1e4) / 1e4, lon: Math.round(guess.lon * 1e4) / 1e4 };
            if (!pins.guess) { pins.guess = guessMark(); overlay.appendChild(pins.guess); }
            redraw();
            if (onPlace) onPlace(state.guess);
        };
        if (state.guess) { pins.guess = guessMark(); overlay.appendChild(pins.guess); }

        // Výchozí výřez: u výsledku oba body (a kruh plných bodů) s okrajem, jinak celá oblast
        if (focus) {
            const points = focus.map(project);
            const xs = points.map(p => p[0]);
            const ys = points.map(p => p[1]);
            const pad = Math.max(...[Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map(span => span * focusPad),
                focusPad < 0.2 ? frame.width * 0.01 : frame.region.projection ? 300 * frame.unitsPerKmAt(focus[0].lat) : frame.width * 0.06);
            const spanW = Math.max(...xs) - Math.min(...xs) + 2 * pad;
            const spanH = Math.max(...ys) - Math.min(...ys) + 2 * pad;
            const zoom = Math.min(box.base.w / spanW, box.base.h / spanH, frame.maxZoom / 8);
            view = clampView((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, zoom);
        }

        // Ovládání: jeden prst klepne (tip) nebo táhne (posun), dva prsty přibližují; tlačítka, kolečko, klávesy
        const pointers = new Map();
        let gesture = null;
        const TAP_SLOP = 8;
        svg.addEventListener('pointerdown', (event) => {
            if (event.button !== undefined && event.button > 0) return;
            box = measure();
            try { svg.setPointerCapture(event.pointerId); } catch (e) { /* starší prohlížeč */ }
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 1) gesture = { kind: 'tap', start: { x: event.clientX, y: event.clientY }, view };
            else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                gesture = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, view, mid: toMap((a.x + b.x) / 2, (a.y + b.y) / 2) };
            }
        });
        svg.addEventListener('pointermove', (event) => {
            if (!pointers.has(event.pointerId) || !gesture) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (gesture.kind === 'pinch' && pointers.size >= 2) {
                const [a, b] = [...pointers.values()];
                const factor = Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance;
                const zoom = Math.max(1, Math.min(frame.maxZoom, gesture.view.zoom * factor));
                const w = box.base.w / zoom;
                const h = box.base.h / zoom;
                // Střed mezi prsty drží stejné místo mapy
                const fx = ((a.x + b.x) / 2 - box.rect.left) / box.rect.width;
                const fy = ((a.y + b.y) / 2 - box.rect.top) / box.rect.height;
                view = clampView(gesture.mid[0] - fx * w + w / 2, gesture.mid[1] - fy * h + h / 2, zoom);
                redraw();
                return;
            }
            const dx = event.clientX - gesture.start.x;
            const dy = event.clientY - gesture.start.y;
            if (gesture.kind === 'tap' && Math.hypot(dx, dy) > TAP_SLOP) gesture.kind = 'pan';
            if (gesture.kind === 'pan') {
                const start = gesture.view;
                view = clampView(start.x + start.w / 2 - dx / box.rect.width * start.w, start.y + start.h / 2 - dy / box.rect.height * start.h, start.zoom);
                redraw();
            }
        });
        const release = (event) => {
            if (!pointers.has(event.pointerId)) return;
            pointers.delete(event.pointerId);
            if (event.type === 'pointerup' && gesture && gesture.kind === 'tap' && interactive && pointers.size === 0) placeGuess(...toMap(event.clientX, event.clientY));
            // Po zvednutí jednoho ze dvou prstů už klepnutí neplatí
            if (gesture && gesture.kind === 'pinch' && pointers.size === 1) {
                const [rest] = [...pointers.values()];
                gesture = { kind: 'pan', start: rest, view };
            }
            if (!pointers.size) gesture = null;
        };
        svg.addEventListener('pointerup', release);
        svg.addEventListener('pointercancel', release);
        svg.addEventListener('wheel', (event) => {
            event.preventDefault();
            box = measure();
            zoomAround(event.deltaY < 0 ? 1.25 : 1 / 1.25, ...toMap(event.clientX, event.clientY));
        }, { passive: false });
        zoomButtons.forEach(button => button.addEventListener('click', () => {
            box = measure();
            // Přiblížení míří na tip, když je vidět, jinak doprostřed
            const [gx, gy] = state.guess ? project(state.guess) : [NaN, NaN];
            const visible = gx >= view.x && gx <= view.x + view.w && gy >= view.y && gy <= view.y + view.h;
            zoomAround(button.dataset.mapZoom === 'in' ? 2 : 0.5, visible ? gx : view.x + view.w / 2, visible ? gy : view.y + view.h / 2);
        }));
        if (interactive) {
            // Klávesnice: šipky posunou tip (první stisk ho položí doprostřed), + a − přiblíží, Enter potvrdí
            container.addEventListener('keydown', (event) => {
                const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                if (step) {
                    event.preventDefault();
                    const [x, y] = state.guess ? project(state.guess) : [view.x + view.w / 2, view.y + view.h / 2];
                    placeGuess(state.guess ? x + step[0] * view.w * 0.03 : x, state.guess ? y + step[1] * view.h * 0.03 : y);
                } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAround(2, view.x + view.w / 2, view.y + view.h / 2); }
                else if (event.key === '-') { event.preventDefault(); zoomAround(0.5, view.x + view.w / 2, view.y + view.h / 2); }
                else if (event.key === 'Enter' && state.guess && onConfirm) { event.preventDefault(); onConfirm(); }
            });
        }
        // Otočení telefonu nebo změna okna: stejné přiblížení a střed, nový poměr stran
        if (root.ResizeObserver) {
            const observer = new root.ResizeObserver(() => {
                if (!svg.isConnected) { observer.disconnect(); return; }
                const center = [view.x + view.w / 2, view.y + view.h / 2];
                box = measure();
                view = clampView(center[0], center[1], view.zoom);
                redraw();
            });
            observer.observe(container);
        }
        draw();
        return { svg, state, get view() { return view; }, zoomIn: () => zoomAround(2, view.x + view.w / 2, view.y + view.h / 2), project };
    };

    // Obrazovka otázky: název místa, mapa přes celou volnou výšku, tlačítko Potvrdit; ui = { style, categoryIcon, typed, extraTop, report }
    const ZOOM_BUTTONS = `
        <div class="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md dark:border-slate-600 dark:bg-slate-800/95">
            <button type="button" data-map-zoom="in" aria-label="Přiblížit mapu" class="flex h-11 w-11 items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="plus" class="h-5 w-5"></i></button>
            <button type="button" data-map-zoom="out" aria-label="Oddálit mapu" class="flex h-11 w-11 items-center justify-center border-t border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="minus" class="h-5 w-5"></i></button>
        </div>`;
    const MAP_FRAME = 'border-sky-200 bg-sky-200 dark:border-slate-700 dark:bg-sky-950';
    const confirmLabel = (placed) => placed ? 'Potvrdit' : 'Nejdřív klepni na mapu';
    const questionScreen = (data, ui) => {
        const question = data.question;
        const region = mapRegionOf(question.map.region);
        const max = maxPoints(ui.typed);
        const placed = Boolean(ui.guess);
        const tiers = pointTiers(question.map, max);
        // Popisek oblasti: mapa Česka, nebo kontinent, když otázka začíná rovnou na něm (u celého světa žádný – nic neprozradí)
        const badge = !region.projection ? region.label : question.map.view === 'continent' ? (REGION_BY_ID[question.map.region] || {}).label : '';
        const line = isLine(question.map.shape);
        const edge = line ? ' od řeky' : question.map.shape ? ' od okraje' : '';
        return `
            <div class="${ui.fresh ? 'fade-in ' : ''}flex min-h-full w-full flex-col gap-2 bg-slate-50 p-3 dark:bg-slate-900">
                <div class="relative flex flex-col items-center gap-1 text-center">
                    ${ui.extraTop || ''}
                    <span class="inline-flex ${ui.labelClass || 'max-w-full'} items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${ui.style.solid}">
                        <i data-lucide="${escapeHtml(ui.categoryIcon)}" class="h-3 w-3 shrink-0"></i> <span class="leading-tight">${escapeHtml(question.map.label || data.typeLabel)} · na mapě</span>
                    </span>
                    <h2 class="text-[22px] font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(question.title)}</h2>
                    <button type="button" data-map-tiers-toggle aria-expanded="false" aria-controls="map-tiers" class="inline-flex min-h-[1.5rem] items-center gap-1 rounded-lg px-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-700/60">
                        <i data-lucide="target" class="h-3.5 w-3.5"></i> Plné ${formatPoints(max)} ${line ? `do ${formatKm(tiers[0].km)} od řeky` : question.map.shape ? `uvnitř i do ${formatKm(tiers[0].km)} od okraje` : `do ${formatKm(tiers[0].km)}`} <i data-lucide="chevron-down" class="h-3.5 w-3.5"></i>
                    </button>
                    <div id="map-tiers" data-map-tiers hidden><p class="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">${tiers.map(tier => `<span class="whitespace-nowrap">${formatPoints(tier.points)} do ${formatKm(tier.km)}${edge}</span>`).join('')}<span class="whitespace-nowrap">dál 0 bodů</span></p></div>
                </div>
                <section class="relative min-h-[13rem] flex-1 overflow-hidden rounded-2xl border ${MAP_FRAME}">
                    <div data-map-question tabindex="0" role="application" aria-label="${region.projection ? 'Mapa světa' : `Mapa ${escapeHtml(region.label)}`} bez popisků. Klepni, kde místo leží; šipkami tip posuneš, plus a minus přiblíží, Enter potvrdí." class="absolute inset-0 overflow-hidden rounded-2xl"></div>
                    ${ZOOM_BUTTONS}
                    ${badge ? `<span data-map-badge class="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(badge)}</span>` : ''}
                </section>
                <button type="button" data-action="map-confirm" ${placed ? '' : 'disabled'} class="btn-3d flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white shadow-md transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${ui.style.button}">
                    <i data-lucide="check" class="h-5 w-5"></i> <span data-map-confirm-label>${confirmLabel(placed)}</span>
                </button>
                <div class="flex items-center justify-center gap-1">
                    <button type="button" data-action="give-up" class="flex min-h-[2.75rem] items-center gap-2 px-3 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                        <i data-lucide="eye" class="h-4 w-4"></i> Nevím, ukázat odpověď
                    </button>
                    ${ui.report || ''}
                </div>
            </div>`;
    };

    // Zobrazí zprávu místo mapy (data se nenačetla)
    const showFailure = (element) => {
        const failure = root.document.createElement('p');
        failure.className = 'absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-600 dark:text-slate-300';
        failure.textContent = 'Mapu se nepodařilo načíst. Zkus to znovu s internetem, nebo klepni na „Nevím“.';
        element.textContent = '';
        element.appendChild(failure);
    };
    const regionDataOf = async (loadMap, regionId) => {
        const data = await loadMap();
        const regionData = data && data.regions && data.regions[regionId];
        if (!regionData) throw new Error(`Mapa oblasti ${regionId} chybí`);
        return regionData;
    };

    // Otázka: mapa s tipem hráče; onPlace(guess) uloží tip do kola, onConfirm potvrdí (Enter na mapě)
    const mountQuestion = async (screen, data, { guess = null, loadMap, onPlace, onConfirm }) => {
        const element = screen.querySelector('[data-map-question]');
        if (!element) return null;
        const question = data.question;
        // Hranice bodů (4 b do …, 3 b do …): klepnutí na „Plné body do …“ je rozbalí a zase sbalí
        const tiersToggle = screen.querySelector('[data-map-tiers-toggle]');
        const tiersList = screen.querySelector('[data-map-tiers]');
        if (tiersToggle && tiersList) {
            tiersToggle.addEventListener('click', () => {
                tiersList.hidden = !tiersList.hidden;
                tiersToggle.setAttribute('aria-expanded', String(!tiersList.hidden));
            });
        }
        try {
            const shown = mapRegionOf(question.map.region);
            const regionData = await regionDataOf(loadMap, shown.id);
            if (!element.isConnected) return null;
            const button = screen.querySelector('[data-action="map-confirm"]');
            // Otázka „na kontinentu“ začne přiblížená na výřez kontinentu (oddálit jde i na celý svět)
            const continent = question.map.view === 'continent' && shown.projection ? REGION_BY_ID[question.map.region] : null;
            const start = continent ? continent.bounds.map(([lat, lon]) => ({ lat, lon })).filter(point => Math.abs(point.lon - continent.center[1]) <= 180) : null;
            return createMapView(element, regionData, frameOf(shown), {
                interactive: true,
                ...(start ? { focus: start, focusPad: 0.04 } : {}),
                marks: { guess },
                onConfirm,
                onPlace: (placed) => {
                    if (button) {
                        button.disabled = false;
                        const label = button.querySelector('[data-map-confirm-label]');
                        if (label) label.textContent = confirmLabel(true);
                    }
                    onPlace(placed);
                }
            });
        } catch (error) {
            console.error(error);
            showFailure(element);
            return null;
        }
    };

    // Výsledek: záložka s mapou (tip, správné místo, čára mezi nimi, kruh plných bodů) a vzdáleností
    const resultPane = (data, result) => {
        const question = data.question;
        const edge = isLine(question.map.shape) ? ' od řeky' : question.map.shape ? ' od okraje' : '';
        const distance = !result ? 'Bez tipu – tady to je' : edge === ' od okraje' && result.km === 0 ? 'Uvnitř – přesná trefa' : `Vedle o ${formatKm(result.km)}${edge}`;
        return `
            <div class="absolute inset-0 ${MAP_FRAME}">
                <div id="map-guess" class="absolute inset-0 overflow-hidden" role="img" aria-label="${escapeHtml(`${question.map.region === 'cesko' ? 'Mapa Česka' : 'Mapa světa'}: ${result ? `tvůj tip a správné místo, ${distance.toLowerCase()}` : 'správné místo'}.`)}"></div>
                ${ZOOM_BUTTONS}
                <div class="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
                    <span data-map-distance class="rounded-lg bg-black/70 px-2.5 py-1 text-sm font-black text-white">${escapeHtml(distance)}</span>
                    <span class="inline-flex items-center gap-2.5 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm dark:bg-slate-900/85 dark:text-slate-200">
                        <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full bg-emerald-600"></span>Správně</span>
                        ${result ? '<span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full bg-brand-600"></span>Tvůj tip<span data-map-guess-area></span></span>' : ''}
                    </span>
                </div>
            </div>`;
    };
    const mountResult = async (element, data, result, { loadMap }) => {
        const question = data.question;
        const target = { lat: question.map.lat, lon: question.map.lon };
        try {
            const shown = mapRegionOf(question.map.region);
            const regionData = await regionDataOf(loadMap, shown.id);
            if (!element.isConnected) return null;
            const frame = frameOf(shown);
            // Bez tipu jen správné místo s kruhem plných bodů
            // Jen body na stejné straně mapy jako správné místo (obrys přes 180. poledník má délky i mimo ±180°)
            const sameSide = (point) => shown.id === 'cesko' || (Math.abs(point.lon - target.lon) <= 180 && Math.abs(point.lon) <= 180);
            // U plochy výřez podle jejího obrysu (okraj kolem ní dá focus), jinak kruh plných bodů
            const shape = question.map.shape ? decodeShape(question.map.shape) : null;
            // Výřez jen podle části obrysu u správného místa: zámořská území (Francie a Francouzská Guyana) ho neroztáhnou
            const nearby = (rings) => {
                const boxes = rings.map(ring => {
                    const lats = ring.map(point => point[0]);
                    const lons = ring.map(point => point[1] - Math.round((point[1] - target.lon) / 360) * 360);
                    const box = { ring, lat0: Math.min(...lats), lat1: Math.max(...lats), lon0: Math.min(...lons), lon1: Math.max(...lons) };
                    box.size = Math.hypot(box.lat1 - box.lat0, box.lon1 - box.lon0);
                    box.gap = Math.hypot(Math.max(box.lat0 - target.lat, 0, target.lat - box.lat1), Math.max(box.lon0 - target.lon, 0, target.lon - box.lon1));
                    return box;
                });
                const main = boxes.reduce((a, b) => (b.gap < a.gap || (b.gap === a.gap && b.size > a.size) ? b : a));
                const reach = Math.max(main.size * 1.2, 6);
                return boxes.filter(box => box === main || box.gap <= reach).map(box => box.ring);
            };
            const shapePoints = shape ? nearby(shape).flat().filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 64)) === 0).map(([lat, lon]) => ({ lat, lon: lon - Math.round((lon - target.lon) / 360) * 360 })) : [];
            const fullPoints = shape ? shapePoints.filter(sameSide) : [0, 90, 180, 270].map(bearing => destination(target, question.map.full, bearing)).filter(sameSide);
            const guess = result ? { lat: result.lat, lon: result.lon } : null;
            // Kam hráč klepl: „Tvůj tip · Thajsko“ (u míst v Česku kraj)
            const areaLabel = guess && element.parentElement && element.parentElement.querySelector('[data-map-guess-area]');
            const area = areaLabel && areaAt(regionData, frame, guess.lat, guess.lon);
            if (area) areaLabel.textContent = ` · ${area}`;
            // Obrys plochy z podkladové mapy (stát, ostrov, jezero), ať zvýrazněná plocha sedí přesně s mapou; jinak z obrysů
            const outline = shape && !shape.line ? basemapOutline(regionData, frame, question, shape) : null;
            // U plochy nebo řeky vede čára k nejbližšímu místu (břeh, řeka), tam je i zelený špendlík; tip uvnitř plochy čáru nemá
            const nearest = shape && guess ? nearestOnShape(shape, guess) : null;
            const pin = nearest && !nearest.inside ? { lat: nearest.lat, lon: nearest.lon } : target;
            return createMapView(element, regionData, frame, {
                marks: { guess, target: pin, full: question.map.full, shape, outline, noLine: Boolean(nearest && nearest.inside),
                    // Na mapě světa se plocha ořízne podle pobřeží podkladové mapy: moře a zálivy na vodu, ostatní na pevninu
                    clip: !shown.projection || !shape || shape.line ? null : question.map.kind === 'more' ? 'water' : ['ostrovy', 'priroda', 'pohori', 'regiony', 'staty'].includes(question.map.kind) ? 'land' : null },
                // Tip za 180. poledníkem by výřez roztáhl přes celý svět: pak jen správné místo (čára vede k okraji mapy)
                focus: [pin, ...(guess && sameSide(guess) ? [guess] : []), ...fullPoints]
            });
        } catch (error) {
            console.error(error);
            showFailure(element);
            return null;
        }
    };

    // Verdikt nad výsledkem: trefa / blízko / vedle, body a vzdálenost; ui = { uiArt, xpLine }
    const resultBanner = (data, round, ui) => {
        const result = round.map || null;
        const name = escapeHtml(data.question.answerLabel);
        if (!result) {
            return `
                <div data-verdict tabindex="-1" class="relative flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 outline-none dark:border-rose-800 dark:bg-rose-900/30">
                    ${ui.uiArt('sova-smutek', 'h-[4.5rem] w-[4.5rem] -my-3')}
                    <div>
                        <p class="pr-10 font-black text-rose-800 dark:text-rose-200">Tentokrát bez odpovědi</p>
                        <p class="text-sm text-rose-800 dark:text-rose-300">${name} je na mapě zeleně</p>
                        ${ui.totalLine ? ui.totalLine('text-rose-800 dark:text-rose-300') : ''}
                        ${ui.xpLine(round.xp, 'text-rose-800 dark:text-rose-300')}
                    </div>
                </div>`;
        }
        const full = result.points >= result.max;
        const good = result.points > 0;
        const tone = good ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30' : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/30';
        const text = good ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300';
        const heading = full ? `Trefa! +${formatPoints(result.points)}` : good ? `Blízko! +${formatPoints(result.points)}` : 'Tentokrát vedle';
        const edge = isLine(data.question.map.shape) ? ' od řeky' : data.question.map.shape ? ' od okraje' : '';
        const detail = full ? (edge === ' od okraje' && result.km === 0 ? 'Tip je přímo uvnitř' : `Vedle jen o ${formatKm(result.km)}${edge}`)
            : good ? `Vedle o ${formatKm(result.km)}${edge} · plné body do ${formatKm(data.question.map.full)}`
            : `Vedle o ${formatKm(result.km)}${edge} · body jen do ${formatKm(data.question.map.zero)}`;
        return `
            <div data-verdict tabindex="-1" class="relative flex items-center gap-3 rounded-2xl border px-4 py-3 outline-none ${tone}">
                ${ui.uiArt(good ? 'sova-radost' : 'sova-smutek', 'h-[4.5rem] w-[4.5rem] -my-3')}
                <div>
                    <p class="pr-10 font-black ${good ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'}">${heading}</p>
                    <p class="text-sm ${text}">${escapeHtml(detail)}</p>
                    ${ui.totalLine ? ui.totalLine(text) : ''}
                    ${ui.xpLine(round.xp, text)}
                </div>
            </div>`;
    };

    const api = {
        REGIONS, REGION_BY_ID, WORLD, MAP_REGIONS, mapRegionOf, FRAME_UNITS, KINDS, GAP_KEY, MIN_GAP, MAX_GAP, MAX_ZOOM, WORLD_MAX_ZOOM,
        FULL_SHARE, ZERO_SHARE, COAST_TOLERANCE_KM, projector, equalEarth, projectionOf, frameOf, roundKm, pointTiers, destination, insideFrame, regionFor, candidate, isAmbiguous, radiiFor, maxPoints, pointsForDistance, scoreGuess, formatKm,
        titleFor, ringsOf, onDrawnLand, areaAt, decodeShape, isLine, shapeOf, distanceToShapeKm, nearestOnShape, mercator, viewFor, SHAPE_ONLY, needsShape, MAP_GROUPS, MAP_TOPICS, groupOf, buildQuestion, isDue, nextQuestion, evaluate, greatCircle,
        questionScreen, mountQuestion, resultPane, mountResult, resultBanner,
        MULTIPLAYER_SHARE, multiplayerShare: START_SHARE, MULTIPLAYER_SEED_MARK, MULTIPLAYER_TOURNAMENTS_FROM, seedAllowsMaps, tournamentAllowsMaps, multiplayerDue,
        multiplayerQuestion, playableMap
    };
    return api;
});
