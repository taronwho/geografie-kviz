// Čistá logika kvízu bez práce s DOM a sítí – používá ji aplikace (app.js) i testy (tests/)
(function (root, factory) {
    const core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.GeoQuizCore = core;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';

    const CATEGORY_CITY = 'Město / Sídlo';
    const UNKNOWN_COUNTRY = 'Neznámá poloha';
    const INTERNATIONAL_WATERS = 'Mezinárodní vody / Oceán';
    const CZECHIA_QID = 'Q213';
    const MAX_HINT_LEVEL = 3;
    const TILE_SIZE = 256;

    // Mapové dlaždice: satelitní snímek NASA bez popisků (nápověda) a OpenStreetMap s popisky (po odhalení)
    const SATELLITE_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
    const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    // S každou nápovědou se satelitní snímek oddálí: okolí → širší region → kontinent
    const SATELLITE_ZOOM_BY_HINT = { 1: 7, 2: 5, 3: 3 };

    const CATEGORY_EMOJI = {
        'Město / Sídlo': '🏙️',
        'Hora / Pohoří': '🏔️',
        'Vodní plocha': '🌊',
        'Ostrov': '🏝️',
        'Stát / Region': '🗺️',
        'Přírodní úkaz': '🌿'
    };

    // Zjednodušená hranice Česka [délka, šířka] podle Natural Earth 1:50m
    const CZECH_BORDER = [
        [18.83,49.51],[18.6,49.49],[18.37,49.34],[18.16,49.26],[18.08,49.07],[17.91,49],[17.76,48.89],[17.48,48.83],[17.19,48.86],[17.13,48.84],
        [17.06,48.78],[16.95,48.6],[16.88,48.7],[16.54,48.8],[16.48,48.8],[16.37,48.74],[16.06,48.75],[15.82,48.86],[15.7,48.86],[15.31,48.97],
        [15.16,48.95],[15.07,49],[14.99,49],[14.92,48.77],[14.79,48.75],[14.71,48.67],[14.69,48.6],[14.49,48.63],[14.37,48.58],[14.19,48.58],
        [14.05,48.6],[13.99,48.69],[13.82,48.77],[13.55,48.96],[13.44,48.96],[13.29,49.1],[13.14,49.16],[12.92,49.33],[12.81,49.33],[12.68,49.41],
        [12.39,49.74],[12.51,49.9],[12.46,49.96],[12.21,50.1],[12.09,50.3],[12.17,50.29],[12.28,50.18],[12.45,50.35],[12.55,50.39],[12.76,50.43],
        [12.94,50.41],[13.02,50.49],[13.18,50.51],[13.24,50.58],[13.38,50.62],[13.44,50.6],[13.56,50.7],[13.9,50.76],[14.37,50.9],[14.25,51],
        [14.28,51.03],[14.55,50.99],[14.63,50.91],[14.61,50.86],[14.72,50.82],[14.98,50.89],[14.99,51.01],[15.26,50.96],[15.28,50.88],[15.36,50.81],
        [15.73,50.74],[15.95,50.67],[16.01,50.61],[16.28,50.66],[16.36,50.62],[16.42,50.57],[16.38,50.52],[16.21,50.42],[16.34,50.37],[16.64,50.1],
        [16.99,50.24],[16.88,50.43],[17.15,50.38],[17.42,50.25],[17.7,50.31],[17.74,50.23],[17.71,50.19],[17.59,50.16],[17.63,50.12],[17.88,49.97],
        [18.03,50.04],[18.3,49.91],[18.35,49.93],[18.56,49.88],[18.6,49.76],[18.81,49.61],[18.83,49.51]
    ];

    // Státy pro možnosti odpovědí: [Wikidata ID, název podle Wikidat, kontinent, další přijímané názvy]
    const COUNTRIES = [
        ['Q213', 'Česko', 'EU', ['Česká republika', 'ČR']], ['Q183', 'Německo', 'EU'], ['Q40', 'Rakousko', 'EU'], ['Q214', 'Slovensko', 'EU'],
        ['Q36', 'Polsko', 'EU'], ['Q28', 'Maďarsko', 'EU'], ['Q142', 'Francie', 'EU'], ['Q38', 'Itálie', 'EU'], ['Q29', 'Španělsko', 'EU'],
        ['Q45', 'Portugalsko', 'EU'], ['Q145', 'Spojené království', 'EU', ['Velká Británie', 'Británie', 'UK']], ['Q27', 'Irsko', 'EU'],
        ['Q55', 'Nizozemsko', 'EU', ['Holandsko']], ['Q31', 'Belgie', 'EU'], ['Q32', 'Lucembursko', 'EU'], ['Q39', 'Švýcarsko', 'EU'],
        ['Q35', 'Dánsko', 'EU'], ['Q20', 'Norsko', 'EU'], ['Q34', 'Švédsko', 'EU'], ['Q33', 'Finsko', 'EU'], ['Q189', 'Island', 'EU'],
        ['Q191', 'Estonsko', 'EU'], ['Q211', 'Lotyšsko', 'EU'], ['Q37', 'Litva', 'EU'], ['Q212', 'Ukrajina', 'EU'], ['Q159', 'Rusko', 'EU'],
        ['Q184', 'Bělorusko', 'EU'], ['Q217', 'Moldavsko', 'EU'], ['Q218', 'Rumunsko', 'EU'], ['Q219', 'Bulharsko', 'EU'], ['Q41', 'Řecko', 'EU'],
        ['Q224', 'Chorvatsko', 'EU'], ['Q215', 'Slovinsko', 'EU'], ['Q403', 'Srbsko', 'EU'], ['Q225', 'Bosna a Hercegovina', 'EU', ['Bosna']],
        ['Q236', 'Černá Hora', 'EU'], ['Q222', 'Albánie', 'EU'], ['Q221', 'Severní Makedonie', 'EU', ['Makedonie']], ['Q233', 'Malta', 'EU'],
        ['Q229', 'Kypr', 'EU'], ['Q43', 'Turecko', 'AS'], ['Q148', 'Čína', 'AS', ['Čínská lidová republika']], ['Q17', 'Japonsko', 'AS'],
        ['Q884', 'Jižní Korea', 'AS', ['Korea']], ['Q668', 'Indie', 'AS'], ['Q843', 'Pákistán', 'AS'], ['Q252', 'Indonésie', 'AS'],
        ['Q869', 'Thajsko', 'AS'], ['Q881', 'Vietnam', 'AS'], ['Q928', 'Filipíny', 'AS'], ['Q833', 'Malajsie', 'AS'], ['Q794', 'Írán', 'AS'],
        ['Q796', 'Irák', 'AS'], ['Q851', 'Saúdská Arábie', 'AS'], ['Q801', 'Izrael', 'AS'], ['Q810', 'Jordánsko', 'AS'],
        ['Q232', 'Kazachstán', 'AS'], ['Q711', 'Mongolsko', 'AS'], ['Q837', 'Nepál', 'AS'],
        ['Q30', 'Spojené státy americké', 'NA', ['USA', 'Spojené státy', 'Amerika']], ['Q16', 'Kanada', 'NA'], ['Q96', 'Mexiko', 'NA'],
        ['Q155', 'Brazílie', 'SA'], ['Q414', 'Argentina', 'SA'], ['Q298', 'Chile', 'SA'], ['Q419', 'Peru', 'SA'], ['Q739', 'Kolumbie', 'SA'],
        ['Q717', 'Venezuela', 'SA'], ['Q736', 'Ekvádor', 'SA'], ['Q750', 'Bolívie', 'SA'],
        ['Q79', 'Egypt', 'AF'], ['Q1028', 'Maroko', 'AF'], ['Q262', 'Alžírsko', 'AF'], ['Q948', 'Tunisko', 'AF'], ['Q1033', 'Nigérie', 'AF'],
        ['Q114', 'Keňa', 'AF'], ['Q115', 'Etiopie', 'AF'], ['Q924', 'Tanzanie', 'AF'], ['Q258', 'Jihoafrická republika', 'AF', ['JAR']],
        ['Q1019', 'Madagaskar', 'AF'], ['Q408', 'Austrálie', 'OC'], ['Q664', 'Nový Zéland', 'OC']
    ].map(([id, name, continent, aliases = []]) => ({ id, name, continent, aliases }));

    // Známá místa jako záložní nesprávné možnosti, když jich Wikipedie nedá dost
    const FALLBACK_PLACES = {
        'Město / Sídlo': ['Brno', 'Ostrava', 'Vídeň', 'Krakov', 'Lyon', 'Porto', 'Kodaň', 'Dublin', 'Toronto', 'Ósaka'],
        'Hora / Pohoří': ['Sněžka', 'Lysá hora', 'Mont Blanc', 'Matterhorn', 'Kilimandžáro', 'Elbrus', 'Aconcagua', 'Triglav'],
        'Vodní plocha': ['Labe', 'Vltava', 'Dunaj', 'Rýn', 'Bajkal', 'Balaton', 'Lipno', 'Ženevské jezero'],
        'Ostrov': ['Kréta', 'Sicílie', 'Madeira', 'Bali', 'Korsika', 'Rujána', 'Tasmánie', 'Mallorca'],
        'Stát / Region': ['Bavorsko', 'Toskánsko', 'Tyrolsko', 'Katalánsko', 'Slezsko', 'Provence', 'Skotsko', 'Sasko'],
        'Přírodní úkaz': ['Macocha', 'Grand Canyon', 'Sahara', 'Pravčická brána', 'Plitvická jezera', 'Atacama', 'Údolí smrti', 'Yellowstonský národní park']
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripBrackets = (text) => text.replace(/[\[\(][^[\]()]*[\]\)]/g, '');
    // Hlavní obrázek článku bývá i vlajka, znak nebo mapa – jako nápověda se hodí jen skutečná fotka
    const NON_PHOTO_WORDS = new Set([
        'flag', 'flags', 'vlajka', 'coat', 'arms', 'erb', 'znak', 'wappen', 'blason', 'escudo', 'stemma', 'herb', 'logo', 'seal', 'emblem',
        'symbol', 'locator', 'location', 'lokace', 'poloha', 'map', 'maps', 'mapa', 'mapka', 'karte', 'carte', 'diagram', 'plan', 'plán',
        'scheme', 'schema', 'chart', 'signature', 'podpis', 'orthographic', 'projection', 'administrative', 'divisions', 'svg'
    ]);
    const isRealPhoto = (fileName) => {
        if (!fileName || !/\.(jpe?g|webp|tiff?)$/i.test(fileName)) return false;
        return !fileName.toLowerCase().split(/[^\p{L}]+/u).some(word => NON_PHOTO_WORDS.has(word));
    };

    const displayName = (title) => stripBrackets(title).replace(/\s{2,}/g, ' ').trim();

    const plural = (count, one, few, many) => {
        const n = Math.abs(count);
        if (n === 1) return `${count} ${one}`;
        if (n >= 2 && n <= 4) return `${count} ${few}`;
        return `${count} ${many}`;
    };
    const formatPoints = (count) => plural(count, 'bod', 'body', 'bodů');

    const getDayKey = (date = new Date()) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const shiftDayKey = (dayKey, days) => {
        const [y, m, d] = dayKey.split('-').map(Number);
        return getDayKey(new Date(y, m - 1, d + days));
    };
    const formatDayKey = (dayKey) => {
        const [y, m, d] = dayKey.split('-').map(Number);
        return `${d}. ${m}. ${y}`;
    };

    // Generátor náhodných čísel se semínkem – dnešní místo je díky němu pro všechny stejné
    const createSeededRandom = (seedText) => {
        let state = 2166136261;
        for (let i = 0; i < seedText.length; i++) state = Math.imul(state ^ seedText.charCodeAt(i), 16777619);
        state >>>= 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const pickRandom = (items, rng) => items[Math.floor(rng() * items.length)];
    const shuffle = (items, rng) => {
        const result = [...items];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    };

    const isInsideCzechia = (lat, lon) => {
        let inside = false;
        for (let i = 0, j = CZECH_BORDER.length - 1; i < CZECH_BORDER.length; j = i++) {
            const [xi, yi] = CZECH_BORDER[i];
            const [xj, yj] = CZECH_BORDER[j];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };

    const inferGeoCategory = (text) => {
        const t = text.substring(0, 300).toLowerCase();

        const categories = [
            { name: 'Město / Sídlo', keywords: ['město', 'metropole', 'obec ', 'vesnice', 'sídlo', 'čtvrť', 'předměstí'] },
            { name: 'Stát / Region', keywords: ['stát ', 'státem', 'republika', 'království', 'provincie', 'region', 'kraj ', 'území', 'hrabství', 'departement', 'emirát'] },
            { name: 'Ostrov', keywords: ['ostrov', 'poloostrov', 'atol', 'souostroví'] },
            { name: 'Hora / Pohoří', keywords: ['hora ', 'vrch ', 'sopka', 'pohoří', 'masiv', 'štíty', 'nejvyšší bod'] },
            { name: 'Vodní plocha', keywords: ['řeka', 'jezero', 'moře', 'záliv', 'průliv', 'vodopád', 'rybník', 'přehrada', 'oceán', 'průplav'] },
            { name: 'Přírodní úkaz', keywords: ['poušť', 'národní park', 'údolí', 'jeskyně', 'propast', 'ledovec', 'prales', 'planina', 'chráněná krajinná'] }
        ];

        let bestCategory = null;
        let minIndex = Infinity;

        for (const cat of categories) {
            for (const kw of cat.keywords) {
                const idx = t.indexOf(kw);
                if (idx !== -1 && idx < minIndex) {
                    minIndex = idx;
                    bestCategory = cat.name;
                }
            }
        }
        return bestCategory;
    };

    const getCategoryIconName = (category) => {
        if (category === 'Město / Sídlo') return 'building-2';
        if (category === 'Hora / Pohoří') return 'mountain';
        if (category === 'Vodní plocha') return 'waves';
        if (category === 'Ostrov') return 'palmtree';
        if (category === 'Stát / Region') return 'flag';
        if (category === 'Přírodní úkaz') return 'leaf';
        return 'map-pin';
    };

    // \b v JavaScriptu nezná česká písmena, proto hranice slov přes Unicode třídy
    const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
    const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])';
    const CENSOR_SKIP_WORDS = new Set(['nad', 'pod', 'na', 've', 'de', 'la', 'le', 'les', 'des', 'du', 'di', 'da', 'del', 'der', 'die', 'das', 'am', 'an', 'im', 'of', 'the', 'and', 'et', 'san', 'saint', 'sankt']);
    const STEM_ALTERNATIONS = [[/h$/iu, 'z'], [/g$/iu, 'z'], [/ch$/iu, 'š'], [/k$/iu, 'c'], [/r$/iu, 'ř'], [/ň$/iu, 'n'], [/ť$/iu, 't'], [/ď$/iu, 'd']];
    // Krátký kmen by s libovolnou koncovkou zakryl i nesouvisející slova (Peru → „pe…“), proto jen běžné pádové a přídavné koncovky
    const SHORT_STEM_ENDINGS = '(?:(?:sk|ck|ick|ijsk|ánsk|ansk|ensk)(?:ý|á|é|ého|ém|ému|ou|ých|ým|ými|í)|ie|ii|ií|ou|em|ím|ům|ách|ech|ích|ami|[aueěiyoíé])?';

    // Kmeny slova pro skloňované tvary: Praha → Prah/Praz (Praze), Sněžka → Sněžk/Sněžc, Hradec → Hradc, Plzeň → Plzn
    const getWordStems = (word) => {
        const stems = new Set([word.replace(/[aeiouyáéěíóúůý]+$/iu, '')]);
        for (const stem of [...stems]) {
            for (const [pattern, replacement] of STEM_ALTERNATIONS) {
                if (pattern.test(stem)) stems.add(stem.replace(pattern, replacement));
            }
        }
        for (const stem of [...stems]) {
            stems.add(stem.replace(/e([^aeiouyáéěíóúůý])$/iu, '$1'));
        }
        return [...stems].filter(stem => stem.length >= 2);
    };

    const buildWordsPattern = (words) => {
        const parts = [];
        for (const word of words) {
            if (word.length < 2 || CENSOR_SKIP_WORDS.has(word.toLowerCase())) continue;
            for (const stem of getWordStems(word)) {
                parts.push(escapeRegExp(stem) + (stem.length >= 4 ? '\\p{L}*' : SHORT_STEM_ENDINGS));
            }
        }
        if (parts.length === 0) return null;
        return new RegExp(NOT_LETTER_BEFORE + '(?:' + parts.join('|') + ')' + NOT_LETTER_AFTER, 'giu');
    };

    const censorWords = (text, phrase) => {
        const pattern = buildWordsPattern(stripBrackets(phrase).trim().split(/[\s,\-–]+/));
        return pattern ? text.replace(pattern, '[***]') : text;
    };

    const censorName = (text, name) => {
        const res = stripBrackets(text).replace(/\s{2,}/g, ' ');
        return censorWords(res, name);
    };

    const NATIONALITY_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:americk|rusk|německ|francouzsk|italsk|japonsk|čínsk|kanadsk|australsk|britsk)\\p{L}*', 'giu');
    const CONTINENT_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:Evrop(?:a|y|ě|u|ou)|Asi(?:e|i|í)|Afri(?:ka|ky|ce|ku|kou)|Ameri(?:ka|ky|ce|ku|kou)|Austráli(?:e|i|í)|Antarktid(?:a|y|ě|u|ou)|Oceáni(?:e|i|í)|(?:evropsk|asijsk|africk|australsk|antarktick)\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const CZECH_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:v Česku|v České republice|v ČR|na Moravě|ve Slezsku|v Čechách|česk\\p{L}*|moravsk\\p{L}*|slezsk\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const REGION_PATTERN = /(?:v okrese|v provincii|ve státě|v regionu|v kraji|na kontinentu|v americkém státě|na ostrově|v pohoří) \p{Lu}[\p{Ll}-]+/gu;

    const isKnownCountry = (country) => Boolean(country) && country !== UNKNOWN_COUNTRY && country !== INTERNATIONAL_WATERS;

    const censorCountry = (text, country) => {
        let res = stripBrackets(text).replace(/\s{2,}/g, ' ');
        res = res
            .replace(NATIONALITY_PATTERN, '[***]')
            .replace(CONTINENT_PATTERN, '[***]')
            .replace(CZECH_PATTERN, '[***]')
            .replace(REGION_PATTERN, '[***]');

        if (!isKnownCountry(country)) return res;
        return censorWords(res, country);
    };

    const processWikiText = (extract) => {
        let cleanExtract = stripBrackets(stripBrackets(extract));
        cleanExtract = cleanExtract.replace(/\s+([,;.?!])/g, '$1').replace(/\s{2,}/g, ' ');

        cleanExtract = cleanExtract
            .replace(/\btzv\./gi, 'takzvaně')
            .replace(/\bnapř\./gi, 'například')
            .replace(/\bmj\./gi, 'mimo jiné')
            .replace(/\btj\./gi, 'to jest')
            .replace(/\batd\./gi, 'a tak dále');

        // Tečky, které nekončí větu (zkratky, řadové číslovky, „m n. m.“), dočasně schováme
        const KEPT_DOT = '';
        cleanExtract = cleanExtract
            .replace(/(?<!\p{L})hl\. m\./giu, `hl${KEPT_DOT} m${KEPT_DOT}`)
            .replace(/(?<!\p{L})(sv|st|č|ul|odd|mt|dr|ing|gen|resp|příp|cca)\.(?=\s)/giu, `$1${KEPT_DOT}`)
            .replace(/\.(?=\s*[\p{Ll}\d,;:])/gu, KEPT_DOT);

        const sentences = (cleanExtract.match(/[^.!?]+[.!?]+/g) || [cleanExtract])
            .map(s => s.replaceAll(KEPT_DOT, '.').trim().replace(/^[,;:\s]+/, '').replace(/\s{2,}/g, ' '))
            .filter(s => s.length > 1);

        // Popis skládáme z vět, dokud nemá rozumnou délku – úvody menších míst mívají jen krátké věty
        const descriptionParts = [];
        let index = 0;
        while (index < sentences.length && descriptionParts.length < 3 && descriptionParts.join(' ').length < 120) {
            descriptionParts.push(sentences[index++]);
        }
        const description = descriptionParts.join(' ') || cleanExtract.replaceAll(KEPT_DOT, '.').trim().slice(0, 300);
        let funFacts = sentences.slice(index).filter(s => s.length > 30).slice(0, 3);

        if (funFacts.length === 0) funFacts = ['Toto místo je natolik specifické, že další zajímavosti najdete přímo v detailu na Wikipedii.'];

        return { description, funFacts };
    };

    const getPopulation = (text) => {
        const matchNormal = text.match(/([0-9]{1,3}(?:[\s.][0-9]{3})+|[0-9]{1,5})\s*(?:stálých\s*)?obyvatel/i);
        if (matchNormal) return parseInt(matchNormal[1].replace(/[\s.]/g, ''), 10);
        const matchMil = text.match(/([0-9.,]+)\s*(?:milionů|milionu|mil\.)\s*obyvatel/i);
        if (matchMil) return 1000000;
        const matchTis = text.match(/([0-9.,]+)\s*(?:tisíc|tis\.)\s*obyvatel/i);
        if (matchTis) return parseFloat(matchTis[1].replace(/,/g, '.')) * 1000;
        return null;
    };

    // Odpovědi porovnáváme bez diakritiky, velikosti písmen a závorek, s tolerancí drobných překlepů
    const normalizeAnswer = (text) => stripBrackets(String(text ?? ''))
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    const levenshtein = (a, b) => {
        if (a === b) return 0;
        let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const current = [i];
            for (let j = 1; j <= b.length; j++) {
                current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            previous = current;
        }
        return previous[b.length];
    };

    const isAnswerMatch = (input, acceptedAnswers) => {
        const given = normalizeAnswer(input);
        if (!given) return false;
        return acceptedAnswers.some(answer => {
            const expected = normalizeAnswer(answer);
            if (!expected) return false;
            const tolerance = expected.length <= 4 ? 0 : expected.length <= 8 ? 1 : 2;
            return levenshtein(given, expected) <= tolerance;
        });
    };

    const pickDistinct = (names, count, taken, rng) => {
        const picked = [];
        for (const name of shuffle(names, rng)) {
            if (picked.length >= count) break;
            const key = normalizeAnswer(name);
            if (!key || taken.has(key)) continue;
            taken.add(key);
            picked.push(name);
        }
        return picked;
    };

    // Nesprávné možnosti: nejdřív známá místa ze stejné kategorie z Wikipedie, pak záložní seznam
    const buildNameChoices = (answerTitle, category, pools, rng) => {
        const answer = displayName(answerTitle);
        const taken = new Set([normalizeAnswer(answer)]);
        const sources = [
            pools.notable.filter(p => p.category === category).map(p => displayName(p.title)),
            FALLBACK_PLACES[category] || [],
            pools.all.filter(p => p.category === category).map(p => displayName(p.title)),
            Object.values(FALLBACK_PLACES).flat()
        ];
        const distractors = [];
        for (const names of sources) {
            distractors.push(...pickDistinct(names, 3 - distractors.length, taken, rng));
        }
        return shuffle([{ label: answer, correct: true }, ...distractors.map(label => ({ label, correct: false }))], rng);
    };

    // U míst ve více státech je správnou možností první z nich, ostatní se mezi chybnými neobjeví
    const buildCountryChoices = (countryIds, countryNames, rng) => {
        const known = COUNTRIES.find(c => countryIds.includes(c.id));
        const taken = new Set(countryNames.map(normalizeAnswer));
        const others = COUNTRIES.filter(c => !countryIds.includes(c.id));
        const sameContinent = others.filter(c => known && c.continent === known.continent).map(c => c.name);
        const distractors = pickDistinct(sameContinent, 3, taken, rng);
        distractors.push(...pickDistinct(others.map(c => c.name), 3 - distractors.length, taken, rng));
        return shuffle([{ label: countryNames[0], correct: true }, ...distractors.map(label => ({ label, correct: false }))], rng);
    };

    // Místo je samo státem (Řecko má ve Wikidatech jako stát samo sebe)
    const isCountryItself = ({ title, ownQid, countryIds, countryNames }) =>
        countryIds.includes(ownQid) || countryNames.some(name => normalizeAnswer(name) === normalizeAnswer(displayName(title)));

    // Na stát se ptáme, jen když ho známe a když ho neprozradí už samotný název (Česká Lípa, Řecké ostrovy)
    const canAskForCountry = ({ title, ownQid, countryIds, countryNames, countrySource }) => {
        if (countrySource !== 'P17' || countryNames.length === 0) return false;
        if (isCountryItself({ title, ownQid, countryIds, countryNames })) return false;
        return !censorCountry(displayName(title), countryNames.join(', ')).includes('[***]');
    };

    const getAcceptedAnswers = (location) => {
        if (location.quizType === 'name') return [location.name, displayName(location.name)];
        const aliases = COUNTRIES.filter(c => (location.countryIds || []).includes(c.id)).flatMap(c => [c.name, ...c.aliases]);
        return [...(location.countryNames || []), ...aliases];
    };

    // Body podle počtu použitých nápověd, napsaná odpověď se počítá dvojnásobně
    const BASE_POINTS = { 1: 3, 2: 2, 3: 1 };
    const pointsFor = (hintLevel, typed) => (BASE_POINTS[hintLevel] || 1) * (typed ? 2 : 1);

    // Série = počet po sobě jdoucích dní se správnou odpovědí, dnešek se počítá, jen pokud už je odehraný
    const computeStreak = (dailyResults, todayKey) => {
        let day = dailyResults[todayKey] ? todayKey : shiftDayKey(todayKey, -1);
        let streak = 0;
        while (dailyResults[day] && dailyResults[day].correct) {
            streak++;
            day = shiftDayKey(day, -1);
        }
        return streak;
    };

    const buildShareText = ({ dayKey, category, result, streak, url }) => {
        const outcome = result.correct
            ? `✅ ${formatPoints(result.points)} · nápovědy ${result.hintLevel}/${MAX_HINT_LEVEL}${result.typed ? ' · napsáno' : ''}`
            : `❌ tentokrát ne · nápovědy ${result.hintLevel}/${MAX_HINT_LEVEL}`;
        return [
            `Geo Kvíz · ${formatDayKey(dayKey)}`,
            `${CATEGORY_EMOJI[category] || '📍'} ${category}`,
            outcome,
            `🔥 Série: ${streak}`,
            url
        ].filter(Boolean).join('\n');
    };

    // Dlaždice (podle šablony s {z}/{x}/{y}), které pokryjí výřez width × height se zadaným bodem uprostřed
    const getTileLayout = (lat, lon, zoom, width, height, template = OSM_TILES) => {
        const scale = TILE_SIZE * 2 ** zoom;
        const sin = Math.min(Math.max(Math.sin(lat * Math.PI / 180), -0.9999), 0.9999);
        const centerX = (lon + 180) / 360 * scale;
        const centerY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
        const left = centerX - width / 2;
        const top = centerY - height / 2;
        const tileCount = 2 ** zoom;
        const tiles = [];
        for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor((left + width) / TILE_SIZE); tx++) {
            for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor((top + height) / TILE_SIZE); ty++) {
                if (ty < 0 || ty >= tileCount) continue;
                tiles.push({
                    url: template.replace('{z}', zoom).replace('{x}', ((tx % tileCount) + tileCount) % tileCount).replace('{y}', ty),
                    left: Math.round(tx * TILE_SIZE - left),
                    top: Math.round(ty * TILE_SIZE - top)
                });
            }
        }
        return tiles;
    };

    return {
        CATEGORY_CITY, UNKNOWN_COUNTRY, INTERNATIONAL_WATERS, CZECHIA_QID, MAX_HINT_LEVEL, TILE_SIZE, COUNTRIES, FALLBACK_PLACES,
        SATELLITE_TILES, OSM_TILES, SATELLITE_ZOOM_BY_HINT,
        escapeHtml, stripBrackets, isRealPhoto, displayName, plural, formatPoints,
        getDayKey, shiftDayKey, formatDayKey, createSeededRandom, pickRandom, shuffle,
        isInsideCzechia, inferGeoCategory, getCategoryIconName, getWordStems, censorName, censorCountry, isKnownCountry,
        processWikiText, getPopulation, normalizeAnswer, levenshtein, isAnswerMatch,
        buildNameChoices, buildCountryChoices, isCountryItself, canAskForCountry, getAcceptedAnswers, pointsFor, computeStreak, buildShareText, getTileLayout
    };
});
