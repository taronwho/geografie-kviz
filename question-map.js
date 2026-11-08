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

    const { distanceKm, getContinent, continentAt, CZECHIA_QID, normalizeAnswer, escapeHtml, formatPoints, pointsFor } = core;

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
    // Okraj výřezu kolem krajních míst (podíl delší strany), ať místo na hranici oblasti není přímo na kraji mapy
    const FRAME_MARGIN = 0.04;
    const REGION_BY_ID = Object.fromEntries(REGIONS.map(region => [region.id, region]));

    // Delší strana výřezu má na mapě 1000 jednotek (souřadnice cest v data/mapa.json)
    const FRAME_UNITS = 1000;
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

    // Výřez oblasti v jednotkách mapy: obdélník kolem promítnutého boxu, delší strana FRAME_UNITS; diagonála v km určuje body
    const frames = new Map();
    const frameOf = (regionOrId) => {
        const region = typeof regionOrId === 'string' ? REGION_BY_ID[regionOrId] : regionOrId;
        if (!region) return null;
        if (frames.has(region.id)) return frames.get(region.id);
        const { forward, inverse } = projector(region.center[0], region.center[1]);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [lat, lon] of region.bounds) {
            const [x, y] = forward(lat, lon);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        const margin = Math.max(x1 - x0, y1 - y0) * FRAME_MARGIN;
        x0 -= margin; x1 += margin; y0 -= margin; y1 += margin;
        const scale = FRAME_UNITS / Math.max(x1 - x0, y1 - y0);
        const frame = {
            region,
            scale,
            width: Math.round((x1 - x0) * scale),
            height: Math.round((y1 - y0) * scale),
            diagonalKm: Math.round(Math.hypot(x1 - x0, y1 - y0) * EARTH_KM),
            // Poloha a jednotky mapy (x doprava, y dolů)
            toMap: (lat, lon) => { const [x, y] = forward(lat, lon); return [(x - x0) * scale, (y1 - y) * scale]; },
            fromMap: (mx, my) => { const [lat, lon] = inverse(mx / scale + x0, y1 - my / scale); return { lat, lon }; },
            // Kolik jednotek mapy je jeden kilometr (u středu výřezu, pro kruh plných bodů)
            unitsPerKm: scale / EARTH_KM
        };
        frames.set(region.id, frame);
        return frame;
    };

    // Místo leží ve výřezu oblasti (na přivrácené polokouli a uvnitř obdélníku mapy)
    const insideFrame = (region, lat, lon) => {
        const frame = frameOf(region);
        if (projector(region.center[0], region.center[1]).angle(lat, lon) > 90) return false;
        const [x, y] = frame.toMap(lat, lon);
        return x >= 0 && y >= 0 && x <= frame.width && y <= frame.height;
    };

    // Oblast mapy pro místo: v Česku Česko, jinak kontinent místa (getContinent podle státu a polohy); mimo výřez žádná
    // (stadiony ve sportu stát nemají, jen jeho název: v Česku podle něj, kontinent podle polohy)
    const regionFor = (item, countries = {}) => {
        if (!item || !Number.isFinite(item.la) || !Number.isFinite(item.lo)) return null;
        const czech = (item.co || []).includes(CZECHIA_QID) || (!item.co && (item.f || {}).land === 'Česko');
        if (czech) return insideFrame(REGION_BY_ID.cesko, item.la, item.lo) ? REGION_BY_ID.cesko : null;
        const continent = (item.co || []).length ? getContinent(item, countries) : continentAt(item.la, item.lo);
        const region = REGIONS.find(candidate => candidate.continent && candidate.continent === continent);
        return region && insideFrame(region, item.la, item.lo) ? region : null;
    };

    // --- Které položky ---

    // Jen místa, která jsou na mapě opravdu bod: města, vrcholy a sopky (ne pohoří), jezera a nádrže (ne moře, zálivy
    // a průliv), ostrovy (ne souostroví), stavby, z přírody vodopády, jeskyně, skály a národní parky; ze sportu stadiony,
    // haly a okruhy. Řeky jsou čáry, ne body, a vynechávají se.
    const KINDS = {
        zemepis: {
            mesto: true,
            hora: ['hora', 'stratovulkán', 'sopka'],
            jezero: ['jezero', 'přehradní nádrž', 'laguna'],
            ostrov: ['ostrov'],
            stavba: true,
            priroda: ['vodopád', 'jeskyně', 'skála', 'skalní suk', 'národní park']
        },
        sport: { sportoviste: true }
    };
    // Plošná místa: kdo klepne kamkoli na ostrov nebo jezero, má plné body i dál od jeho středu (poloměr podle rozlohy)
    const AREA_CATEGORIES = new Set(['jezero', 'ostrov', 'priroda']);
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
    const candidate = (item, ctx) => {
        const topicId = ctx && ctx.topic && ctx.topic.id;
        if (!item || !kindAllowed(topicId, item) || item.nq) return null;
        const region = regionFor(item, (ctx && ctx.countries) || {});
        if (!region) return null;
        if (region.id === 'cesko' && item.c !== 'mesto' && BIG_CZECH_CITIES.some(city => distanceKm(item, city) < BIG_CITY_KM)) return null;
        if (isAmbiguous(item, ctx && ctx.items)) return null;
        return region;
    };

    // --- Body ---

    // Plné body do 3 % diagonály výřezu (u plošných míst navíc poloměr místa), žádné od 20 %; mezi tím postupně ubývají
    const FULL_SHARE = 0.03;
    const ZERO_SHARE = 0.2;
    const radiiFor = (item, region) => {
        const frame = frameOf(region);
        const area = (item.f || {}).area;
        const extra = AREA_CATEGORIES.has(item.c) && area > 0 ? Math.min(Math.sqrt(area / Math.PI), frame.diagonalKm * 0.08) : 0;
        return { full: Math.round(frame.diagonalKm * FULL_SHARE + extra), zero: Math.round(frame.diagonalKm * ZERO_SHARE + extra) };
    };
    // Nejvíc bodů: jako otázka bez nápovědy (při psaní dvojnásobek), aby otázka zapadla do bodů i XP ostatních otázek
    const maxPoints = (typed) => pointsFor(1, Boolean(typed));
    // max bodů do plného poloměru, pak nejvýš max − 1 a lineárně dolů; 0 až od nulového poloměru. Body jsou celé číslo
    // 0…max, správně = aspoň bod (stejně jako u ostatních otázek: correct = points > 0)
    const pointsForDistance = (km, { full, zero }, max) => {
        if (!(km >= 0)) return 0;
        if (km <= full) return max;
        if (km >= zero) return 0;
        return Math.max(1, Math.min(max - 1, Math.ceil((zero - km) / (zero - full) * (max - 1))));
    };
    const scoreGuess = (map, guess, max) => {
        const km = distanceKm({ la: guess.lat, lo: guess.lon }, { la: map.lat, lo: map.lon });
        return { km, points: pointsForDistance(km, map, max) };
    };

    // Vzdálenost pro hráče: „méně než 1 km“, „3,4 km“, „37 km“, „1 240 km“
    const formatKm = (km) => {
        if (km < 1) return 'méně než 1 km';
        const rounded = km < 10 ? Math.round(km * 10) / 10 : km < 1000 ? Math.round(km) : Math.round(km / 10) * 10;
        return `${rounded.toLocaleString('cs-CZ')} km`;
    };

    // --- Otázka ---

    // „Kde stojí“ u staveb, jinak „Kde leží“ (sloveso má stejný tvar v jednotném i množném čísle: leží Niagarské vodopády)
    const LYING_BUILDINGS = new Set(['archeologická lokalita', 'starověké město', 'náměstí', 'historické centrum', 'park', 'hřbitov', 'zahrada']);
    const titleFor = (item) => `${item.c === 'stavba' && !LYING_BUILDINGS.has(item.ty) || item.c === 'sportoviste' ? 'Kde stojí' : 'Kde leží'} ${item.n}?`;

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
    const onDrawnLand = (regionData, frame, lat, lon) => {
        const [x, y] = frame.toMap(lat, lon);
        const tolerance = COAST_TOLERANCE_KM * frame.unitsPerKm;
        const rings = [...layerRings(regionData, 'land'), ...layerRings(regionData, 'seam')];
        let inside = false;
        for (const ring of rings) if (insideRing(x, y, ring)) inside = !inside;
        return inside || rings.some(ring => distanceToRing(x, y, ring) <= tolerance);
    };

    // Otázka na mapě pro položku, nebo null (místo v moři mimo nakreslenou pevninu, chybějící mapa oblasti)
    const buildQuestion = (item, ctx, mapData) => {
        const region = candidate(item, ctx);
        const regionData = region && mapData && mapData.regions && mapData.regions[region.id];
        if (!regionData) return null;
        const frame = frameOf(region);
        if (item.c !== 'jezero' && !onDrawnLand(regionData, frame, item.la, item.lo)) return null;
        return {
            type: 'map',
            title: titleFor(item),
            showName: true,
            choices: [],
            accepted: [],
            placeholder: '',
            answerLabel: item.n,
            map: { region: region.id, lat: item.la, lon: item.lo, ...radiiFor(item, region) }
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

    // --- Vykreslení a ovládání (jen v prohlížeči) ---

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const MAX_ZOOM = 8;
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
    const createMapView = (container, regionData, frame, { interactive = false, marks = {}, onPlace = null, onConfirm = null, focus = null } = {}) => {
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
        if (marks.target && marks.full) {
            const [cx, cy] = project(marks.target);
            circle = svgElement('circle', { cx, cy, r: marks.full * frame.unitsPerKm, 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke', class: 'fill-emerald-500/15 stroke-emerald-600 dark:fill-emerald-400/15 dark:stroke-emerald-400' });
            overlay.appendChild(circle);
        }
        if (marks.target && marks.guess) {
            line = svgElement('polyline', { points: greatCircle(marks.guess, marks.target).map(project).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), 'stroke-width': 2.5, 'stroke-dasharray': '6 5', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', class: 'fill-none stroke-slate-800 dark:stroke-white' });
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
            const z = Math.max(1, Math.min(MAX_ZOOM, zoom));
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
            zoomButtons.forEach(button => { button.disabled = button.dataset.mapZoom === 'in' ? view.zoom >= MAX_ZOOM - 1e-6 : view.zoom <= 1 + 1e-6; });
        };
        let frameRequest = 0;
        const redraw = () => { if (!frameRequest) frameRequest = root.requestAnimationFrame(() => { frameRequest = 0; draw(); }); };
        const zoomAround = (factor, mx, my) => {
            const zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom * factor));
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
            const pad = Math.max(...[Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map(span => span * 0.35), frame.width * 0.06);
            const spanW = Math.max(...xs) - Math.min(...xs) + 2 * pad;
            const spanH = Math.max(...ys) - Math.min(...ys) + 2 * pad;
            const zoom = Math.min(box.base.w / spanW, box.base.h / spanH, MAX_ZOOM / 2);
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
                const zoom = Math.max(1, Math.min(MAX_ZOOM, gesture.view.zoom * factor));
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
        const region = REGION_BY_ID[question.map.region] || REGIONS[0];
        const max = maxPoints(ui.typed);
        const placed = Boolean(ui.guess);
        return `
            <div class="${ui.fresh ? 'fade-in ' : ''}flex min-h-full w-full flex-col gap-2 bg-slate-50 p-3 dark:bg-slate-900">
                <div class="relative flex flex-col items-center gap-1 text-center">
                    ${ui.extraTop || ''}
                    <span class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${ui.style.solid}">
                        <i data-lucide="${escapeHtml(ui.categoryIcon)}" class="h-3 w-3"></i> ${escapeHtml(data.typeLabel)} · ukaž na mapě
                    </span>
                    <h2 class="text-[22px] font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(question.title)}</h2>
                    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Plné ${formatPoints(max)} do ${formatKm(question.map.full)}, čím blíž, tím víc bodů</p>
                </div>
                <section class="relative min-h-[13rem] flex-1 overflow-hidden rounded-2xl border ${MAP_FRAME}">
                    <div data-map-question tabindex="0" role="application" aria-label="Mapa ${escapeHtml(region.label)} bez popisků. Klepni, kde místo leží; šipkami tip posuneš, plus a minus přiblíží, Enter potvrdí." class="absolute inset-0 overflow-hidden rounded-2xl"></div>
                    ${ZOOM_BUTTONS}
                    <span class="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(region.label)}</span>
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
        try {
            const regionData = await regionDataOf(loadMap, question.map.region);
            if (!element.isConnected) return null;
            const button = screen.querySelector('[data-action="map-confirm"]');
            return createMapView(element, regionData, frameOf(question.map.region), {
                interactive: true,
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
        const distance = result ? `Vedle o ${formatKm(result.km)}` : 'Bez tipu – tady to je';
        return `
            <div class="absolute inset-0 ${MAP_FRAME}">
                <div id="map-guess" class="absolute inset-0 overflow-hidden" role="img" aria-label="${escapeHtml(`Mapa ${(REGION_BY_ID[question.map.region] || {}).label || ''}: ${result ? `tvůj tip a správné místo, ${distance.toLowerCase()}` : 'správné místo'}.`)}"></div>
                ${ZOOM_BUTTONS}
                <div class="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
                    <span data-map-distance class="rounded-lg bg-black/70 px-2.5 py-1 text-sm font-black text-white">${escapeHtml(distance)}</span>
                    <span class="inline-flex items-center gap-2.5 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm dark:bg-slate-900/85 dark:text-slate-200">
                        <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full bg-emerald-600"></span>Správně</span>
                        ${result ? '<span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full bg-brand-600"></span>Tvůj tip</span>' : ''}
                    </span>
                </div>
            </div>`;
    };
    const mountResult = async (element, data, result, { loadMap }) => {
        const question = data.question;
        const target = { lat: question.map.lat, lon: question.map.lon };
        try {
            const regionData = await regionDataOf(loadMap, question.map.region);
            if (!element.isConnected) return null;
            const frame = frameOf(question.map.region);
            // Bez tipu jen správné místo s kruhem plných bodů
            const fullPoints = [0, 90, 180, 270].map(bearing => {
                const [x, y] = frame.toMap(target.lat, target.lon);
                const r = question.map.full * frame.unitsPerKm;
                return frame.fromMap(x + r * Math.cos(bearing * RAD), y + r * Math.sin(bearing * RAD));
            });
            const guess = result ? { lat: result.lat, lon: result.lon } : null;
            return createMapView(element, regionData, frame, {
                marks: { guess, target, full: question.map.full },
                focus: [target, ...(guess ? [guess] : []), ...fullPoints]
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
                <div data-verdict tabindex="-1" class="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 outline-none dark:border-rose-800 dark:bg-rose-900/30">
                    ${ui.uiArt('sova-smutek', 'h-[4.5rem] w-[4.5rem] -my-3')}
                    <div>
                        <p class="font-black text-rose-800 dark:text-rose-200">Tentokrát bez odpovědi</p>
                        <p class="text-sm text-rose-800 dark:text-rose-300">${name} je na mapě zeleně</p>
                        ${ui.xpLine(round.xp, 'text-rose-800 dark:text-rose-300')}
                    </div>
                </div>`;
        }
        const full = result.points >= result.max;
        const good = result.points > 0;
        const tone = good ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30' : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/30';
        const text = good ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300';
        const heading = full ? `Trefa! +${formatPoints(result.points)}` : good ? `Blízko! +${formatPoints(result.points)}` : 'Tentokrát vedle';
        const detail = full ? `Vedle jen o ${formatKm(result.km)}` : good ? `Vedle o ${formatKm(result.km)} · plné body do ${formatKm(data.question.map.full)}`
            : `Vedle o ${formatKm(result.km)} · body jen do ${formatKm(data.question.map.zero)}`;
        return `
            <div data-verdict tabindex="-1" class="flex items-center gap-3 rounded-2xl border px-4 py-3 outline-none ${tone}">
                ${ui.uiArt(good ? 'sova-radost' : 'sova-smutek', 'h-[4.5rem] w-[4.5rem] -my-3')}
                <div>
                    <p class="font-black ${good ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'}">${heading}</p>
                    <p class="text-sm ${text}">${escapeHtml(detail)}</p>
                    ${ui.xpLine(round.xp, text)}
                </div>
            </div>`;
    };

    const api = {
        REGIONS, REGION_BY_ID, FRAME_UNITS, KINDS, GAP_KEY, MIN_GAP, MAX_GAP, MAX_ZOOM, FULL_SHARE, ZERO_SHARE, COAST_TOLERANCE_KM,
        projector, frameOf, insideFrame, regionFor, candidate, isAmbiguous, radiiFor, maxPoints, pointsForDistance, scoreGuess, formatKm,
        titleFor, ringsOf, onDrawnLand, buildQuestion, isDue, nextQuestion, evaluate, greatCircle,
        questionScreen, mountQuestion, resultPane, mountResult, resultBanner
    };
    return api;
});
