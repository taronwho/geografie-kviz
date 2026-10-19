// Čistá logika kvízu bez práce s DOM a sítí – používá ji aplikace (app.js) i testy (tests/)
(function (root, factory) {
    const core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.GeoQuizCore = core;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';

    const UNKNOWN_COUNTRY = 'Neznámá poloha';
    const INTERNATIONAL_WATERS = 'Mezinárodní vody / Oceán';
    const CZECHIA_QID = 'Q213';
    const TILE_SIZE = 256;

    // Kategorie míst ze sady data/places.json; mapSpan = kolik stupňů zeměpisné délky ukáže slepá mapa
    const CATEGORIES = [
        { key: 'stat', label: 'Státy', one: 'stát', icon: 'flag', emoji: '🗺️', mapSpan: 70 },
        { key: 'mesto', label: 'Města', one: 'město', icon: 'building-2', emoji: '🏙️', mapSpan: 24 },
        { key: 'hora', label: 'Hory a sopky', one: 'hora', icon: 'mountain', emoji: '🏔️', mapSpan: 24 },
        { key: 'reka', label: 'Řeky', one: 'řeka', icon: 'waves', emoji: '🏞️', mapSpan: 24 },
        { key: 'jezero', label: 'Jezera a moře', one: 'vodní plocha', icon: 'droplets', emoji: '🌊', mapSpan: 30 },
        { key: 'ostrov', label: 'Ostrovy', one: 'ostrov', icon: 'palmtree', emoji: '🏝️', mapSpan: 30 },
        { key: 'priroda', label: 'Příroda a krajina', one: 'přírodní místo', icon: 'leaf', emoji: '🌿', mapSpan: 24 },
        { key: 'stavba', label: 'Stavby a památky', one: 'stavba', icon: 'landmark', emoji: '🏛️', mapSpan: 24 }
    ];
    const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(category => [category.key, category]));
    const getCategory = (key) => CATEGORY_BY_KEY[key] || { key, label: key, one: 'místo', icon: 'map-pin', emoji: '📍', mapSpan: 24 };

    const CONTINENT_NAMES = { EU: 'Evropa', AS: 'Asie', AF: 'Afrika', NA: 'Severní Amerika', SA: 'Jižní Amerika', OC: 'Austrálie a Oceánie', AN: 'Antarktida' };

    // Mapové dlaždice: satelitní snímek NASA bez popisků (nápověda) a OpenStreetMap s popisky (po odhalení)
    const SATELLITE_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
    const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    // Další přijímané názvy a zkratky států pro psané odpovědi a zakrývání: [Wikidata ID, název podle Wikidat, kontinent, další názvy]
    const COUNTRIES = [
        ['Q213', 'Česko', 'EU', ['Česká republika', 'ČR']], ['Q183', 'Německo', 'EU'], ['Q40', 'Rakousko', 'EU'], ['Q214', 'Slovensko', 'EU'],
        ['Q36', 'Polsko', 'EU'], ['Q28', 'Maďarsko', 'EU'], ['Q142', 'Francie', 'EU'], ['Q38', 'Itálie', 'EU'], ['Q29', 'Španělsko', 'EU'],
        ['Q45', 'Portugalsko', 'EU'], ['Q145', 'Spojené království', 'EU', ['Velká Británie', 'Británie', 'UK']], ['Q27', 'Irsko', 'EU'],
        ['Q55', 'Nizozemsko', 'EU', ['Holandsko']], ['Q31', 'Belgie', 'EU'], ['Q32', 'Lucembursko', 'EU'], ['Q39', 'Švýcarsko', 'EU'],
        ['Q35', 'Dánsko', 'EU'], ['Q20', 'Norsko', 'EU'], ['Q34', 'Švédsko', 'EU'], ['Q33', 'Finsko', 'EU'], ['Q189', 'Island', 'EU'],
        ['Q191', 'Estonsko', 'EU'], ['Q211', 'Lotyšsko', 'EU'], ['Q37', 'Litva', 'EU'], ['Q212', 'Ukrajina', 'EU'], ['Q159', 'Rusko', 'EU', ['Ruská federace']],
        ['Q184', 'Bělorusko', 'EU'], ['Q217', 'Moldavsko', 'EU'], ['Q218', 'Rumunsko', 'EU'], ['Q219', 'Bulharsko', 'EU'], ['Q41', 'Řecko', 'EU'],
        ['Q224', 'Chorvatsko', 'EU'], ['Q215', 'Slovinsko', 'EU'], ['Q403', 'Srbsko', 'EU'], ['Q225', 'Bosna a Hercegovina', 'EU', ['Bosna']],
        ['Q236', 'Černá Hora', 'EU'], ['Q222', 'Albánie', 'EU'], ['Q221', 'Severní Makedonie', 'EU', ['Makedonie']], ['Q233', 'Malta', 'EU'],
        ['Q229', 'Kypr', 'EU'], ['Q43', 'Turecko', 'AS'], ['Q148', 'Čína', 'AS', ['Čínská lidová republika', 'ČLR']], ['Q17', 'Japonsko', 'AS'],
        ['Q884', 'Jižní Korea', 'AS', ['Korea', 'Korejská republika']], ['Q668', 'Indie', 'AS'], ['Q843', 'Pákistán', 'AS'], ['Q252', 'Indonésie', 'AS'],
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
        if (!fileName || !/\.(jpe?g|webp)$/i.test(fileName)) return false;
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

    // \b v JavaScriptu nezná česká písmena, proto hranice slov přes Unicode třídy
    const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
    const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])';
    const CENSOR_SKIP_WORDS = new Set(['nad', 'pod', 'na', 've', 'de', 'la', 'le', 'les', 'des', 'du', 'di', 'da', 'del', 'der', 'die', 'das', 'am', 'an', 'im', 'of', 'the', 'and', 'et', 'san', 'saint', 'sankt']);
    const STEM_ALTERNATIONS = [
        [/h$/iu, 'z'], [/h$/iu, 'ž'], [/g$/iu, 'z'], [/g$/iu, 'ž'], [/ch$/iu, 'š'], [/k$/iu, 'c'], [/k$/iu, 'č'],
        [/r$/iu, 'ř'], [/ň$/iu, 'n'], [/ť$/iu, 't'], [/ď$/iu, 'd']
    ];
    const SHORT_VOWELS = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ů': 'u', 'ý': 'y', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ý': 'Y' };
    // Krátký kmen by s libovolnou koncovkou zakryl i nesouvisející slova (Peru → „pe…“), proto jen běžné pádové a přídavné koncovky
    const SHORT_STEM_ENDINGS = '(?:(?:sk|ck|eck|ick|ijsk|ánsk|uánsk|ansk|ensk|ěnsk)(?:ý|á|é|ého|ém|ému|ou|ých|ým|ými|í)|ie|ii|ií|ou|em|ím|ům|ách|ech|ích|ami|[aueěiyoíé])?';
    // Složená přídavná jména: jihokorejský, severoamerický, novozélandský
    const COMPOUND_PREFIX = '(?:(?:jiho|severo)(?:východo|západo)?|východo|západo|středo|novo)?';

    // Kmeny slova pro skloňované tvary a odvozená přídavná jména:
    // Praha → Prah/Praz/Praž (Praze, pražský), Korea → Kore/Kor (Koreji), Itálie → Itál/Ital (italský),
    // Sněžka → Sněžk/Sněžc, Hradec → Hradc, Plzeň → Plzn
    const getWordStems = (word) => {
        const stems = new Set([word.replace(/[aeiouyáéěíóúůý]$/iu, ''), word.replace(/[aeiouyáéěíóúůý]+$/iu, '')]);
        for (const stem of [...stems]) {
            for (const [pattern, replacement] of STEM_ALTERNATIONS) {
                if (pattern.test(stem)) stems.add(stem.replace(pattern, replacement));
            }
        }
        // Pohyblivé e (Hradec → Hradci) jen u delších kmenů, z „Per“ (Peru) by jinak vzniklo „Pr“ a zakrylo „pro“
        for (const stem of [...stems]) {
            if (stem.length >= 5) stems.add(stem.replace(/e([^aeiouyáéěíóúůý])$/iu, '$1'));
        }
        for (const stem of [...stems]) {
            stems.add(stem.replace(/[áéíóúůýÁÉÍÓÚÝ]/g, ch => SHORT_VOWELS[ch]));
        }
        // Dvoupísmenné kmeny jen u krátkých názvů (Aš), jinak by zakrývaly běžná slova
        return [...stems].filter(stem => stem.length >= 3 || (stem.length === 2 && word.length <= 3));
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
        return new RegExp(NOT_LETTER_BEFORE + COMPOUND_PREFIX + '(?:' + parts.join('|') + ')' + NOT_LETTER_AFTER, 'giu');
    };

    // Zkratky (USA, ČR, ČLR) jen jako celé slovo a s velkými písmeny, ať nezakryjí běžná slova
    const isAbbreviation = (word) => /^\p{Lu}{2,4}$/u.test(word);

    const censorWords = (text, phrase) => {
        const words = stripBrackets(phrase).trim().split(/[\s,\-–]+/);
        const abbreviations = words.filter(isAbbreviation);
        const pattern = buildWordsPattern(words.filter(word => !isAbbreviation(word)));
        let res = pattern ? text.replace(pattern, '[***]') : text;
        if (abbreviations.length) {
            res = res.replace(new RegExp(NOT_LETTER_BEFORE + '(?:' + abbreviations.map(escapeRegExp).join('|') + ')' + NOT_LETTER_AFTER, 'gu'), '[***]');
        }
        return res;
    };

    const censorName = (text, name) => {
        const res = stripBrackets(text).replace(/\s{2,}/g, ' ');
        return censorWords(res, name);
    };

    const NATIONALITY_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:americk|rusk|německ|francouzsk|italsk|japonsk|čínsk|kanadsk|australsk|britsk)\\p{L}*', 'giu');
    const CONTINENT_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:Evrop(?:a|y|ě|u|ou)|Asi(?:e|i|í)|Afri(?:ka|ky|ce|ku|kou)|Ameri(?:ka|ky|ce|ku|kou)|Austráli(?:e|i|í)|Antarktid(?:a|y|ě|u|ou)|Oceáni(?:e|i|í)|(?:evropsk|asijsk|africk|australsk|antarktick)\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const CZECH_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:v Česku|v České republice|v ČR|na Moravě|ve Slezsku|v Čechách|česk\\p{L}*|moravsk\\p{L}*|slezsk\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const REGION_PATTERN = /(?:v okrese|v provincii|ve státě|v regionu|v kraji|na kontinentu|v americkém státě|na ostrově|v pohoří|ve spolkové zemi|v departementu|v prefektuře|v kantonu|v župě|ve vojvodství|v hrabství|v oblasti|v autonomní oblasti|v distriktu|v gubernii|v emirátu) \p{Lu}[\p{Ll}-]+/gu;
    // Region přídavným jménem: v Jihomoravském kraji, ve Středočeském kraji, v Plzeňském regionu
    const REGION_ADJECTIVE_PATTERN = /(?<![\p{L}\p{N}])(?:v|ve) \p{Lu}\p{Ll}+(?:ém|ím) (?:kraji|okrese|regionu|vojvodství|kantonu|departementu|hrabství)(?![\p{L}\p{N}])/gu;

    const isKnownCountry = (country) => Boolean(country) && country !== UNKNOWN_COUNTRY && country !== INTERNATIONAL_WATERS;

    // aliases: další názvy a zkratky státu (USA, ČR, Ruská federace…) – zakryjí se také
    const censorCountry = (text, country, aliases = []) => {
        let res = stripBrackets(text).replace(/\s{2,}/g, ' ');
        res = res
            .replace(NATIONALITY_PATTERN, '[***]')
            .replace(CONTINENT_PATTERN, '[***]')
            .replace(CZECH_PATTERN, '[***]')
            .replace(REGION_PATTERN, '[***]')
            .replace(REGION_ADJECTIVE_PATTERN, '[***]');

        if (!isKnownCountry(country)) return res;
        return censorWords(res, [country, ...aliases].join(', '));
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
        const KEPT_DOT = '\uE000';
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

    // Odpovědi porovnáváme bez diakritiky, velikosti písmen a závorek, s tolerancí drobných překlepů
    const normalizeAnswer = (text) => stripBrackets(String(text ?? ''))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

    // Náhled fotky z Wikimedia Commons přímo z upload.wikimedia.org (bez přesměrování na plné rozlišení);
    // hash = první dva znaky MD5 názvu souboru, spočítané při sestavení sady míst
    const commonsPhotoUrl = (fileName, hash, width = 960) => {
        const name = encodeURIComponent(fileName.replace(/ /g, '_'));
        return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash}/${name}/${width}px-${name}`;
    };

    // Výběr míst: dnešní místo jen ze známých ze všech kategorií, trénink podle nastavení a bez nedávno hraných
    const filterPlaces = (places, { categories, tier }) =>
        places.filter(place => categories.includes(place.c) && (tier === 'all' || place.k === 1));
    // Nejdřív kategorie, potom místo v ní – jinak by převážila města, kterých je v sadě nejvíc
    const pickPlace = (pool, rng, recentIds = []) => {
        const categoryKeys = CATEGORIES.map(category => category.key).filter(key => pool.some(place => place.c === key));
        const categoryKey = pickRandom(categoryKeys, rng);
        const inCategory = pool.filter(place => place.c === categoryKey);
        const recent = new Set(recentIds);
        const fresh = inCategory.filter(place => !recent.has(place.q));
        return pickRandom(fresh.length ? fresh : inCategory, rng);
    };

    const getCountryNames = (place, countries) => (place.co || []).map(id => countries[id] && countries[id].name).filter(Boolean);
    const getContinent = (place, countries) => {
        const country = (place.co || []).map(id => countries[id]).find(c => c && c.continent);
        return country ? country.continent : '';
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

    // Nesprávné možnosti názvu: místa stejné kategorie, přednostně stejného typu (k průlivu průlivy, ne jezera),
    // podobně známá a ze stejného kontinentu
    const buildPlaceChoices = (place, places, countries, rng) => {
        const continent = getContinent(place, countries);
        const taken = new Set([normalizeAnswer(place.n)]);
        const sameCategory = places.filter(other => other.c === place.c && other.q !== place.q);
        const sameType = (other) => Boolean(place.ty) && other.ty === place.ty;
        const sameTier = (other) => other.k === place.k;
        const sameContinent = (other) => Boolean(continent) && getContinent(other, countries) === continent;
        const sources = [
            [sameType, sameTier, sameContinent], [sameType, sameTier], [sameType],
            [sameTier, sameContinent], [sameTier], []
        ].map(conditions => sameCategory.filter(other => conditions.every(condition => condition(other))));
        const distractors = [];
        for (const source of sources) distractors.push(...pickDistinct(source.map(other => other.n), 3 - distractors.length, taken, rng));
        return shuffle([{ label: place.n, correct: true }, ...distractors.map(label => ({ label, correct: false }))], rng);
    };

    // Nesprávné možnosti státu: jiné státy ze stejného kontinentu
    const buildCountryChoices = (countryId, countries, rng) => {
        const correct = countries[countryId];
        const others = Object.entries(countries).filter(([id]) => id !== countryId);
        const taken = new Set([normalizeAnswer(correct.name)]);
        const distractors = pickDistinct(others.filter(([, c]) => c.continent === correct.continent).map(([, c]) => c.name), 3, taken, rng);
        distractors.push(...pickDistinct(others.map(([, c]) => c.name), 3 - distractors.length, taken, rng));
        return shuffle([{ label: correct.name, correct: true }, ...distractors.map(label => ({ label, correct: false }))], rng);
    };

    // Na stát se ptáme jen u míst v jednom známém státě, ne u států a ne když stát prozradí už název (Česká Lípa)
    const canAskForCountry = (place, countries) => {
        if (place.c === 'stat' || (place.co || []).length !== 1 || !countries[place.co[0]]) return false;
        const countryName = countries[place.co[0]].name;
        return !censorCountry(place.n, countryName, getCountryAliases(place.co)).includes('[***]');
    };

    const getCountryAliases = (countryIds = []) => COUNTRIES.filter(c => countryIds.includes(c.id)).flatMap(c => c.aliases);

    const getAcceptedAnswers = (round) => {
        if (round.quizType === 'name') {
            const countryAliases = round.category === 'stat' ? getCountryAliases([round.id]) : [];
            return [round.name, round.title, displayName(round.title || ''), ...countryAliases].filter(Boolean);
        }
        const aliases = COUNTRIES.filter(c => (round.countryIds || []).includes(c.id)).flatMap(c => [c.name, ...c.aliases]);
        return [...(round.countryNames || []), ...aliases];
    };

    // Nápovědy v pořadí: popis (hned) → fotka → slepá mapa → fakta; chybějící krok se vynechá
    const getHintSteps = ({ hasPhoto, hasFacts }) => [hasPhoto && 'photo', 'map', hasFacts && 'facts'].filter(Boolean);

    // Body: na začátku tolik, kolik je úrovní (4 s fotkou, 3 bez ní), každá nápověda o bod méně; psaná odpověď dvojnásobek
    const pointsFor = (level, levelCount, typed) => Math.max(levelCount - level + 1, 1) * (typed ? 2 : 1);

    // Fakta na konec: čísla z Wikidat v češtině
    const formatNumber = (value) => Number(value).toLocaleString('cs-CZ');
    const formatPopulation = (value) => value >= 1e6
        ? `${(value / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil.`
        : formatNumber(value);
    const FACT_FORMATS = [
        ['cap', 'Hlavní město', value => value],
        ['pop', 'Počet obyvatel', formatPopulation],
        ['area', 'Rozloha', value => `${formatNumber(value)} km²`],
        ['elev', 'Nadmořská výška', value => `${formatNumber(value)} m`],
        ['len', 'Délka', value => `${formatNumber(value)} km`],
        ['h', 'Výška', value => `${formatNumber(value)} m`],
        ['year', 'Vznik', value => value < 0 ? `${-value} př. n. l.` : String(value)],
        ['mouth', 'Ústí do', value => value]
    ];
    const buildFacts = (place, countries, quizType) => {
        const facts = [];
        const countryNames = getCountryNames(place, countries);
        if (quizType === 'name' && place.c !== 'stat' && countryNames.length) facts.push({ label: countryNames.length > 1 ? 'Státy' : 'Stát', value: countryNames.join(', ') });
        const continent = getContinent(place, countries);
        if (continent) facts.push({ label: 'Kontinent', value: CONTINENT_NAMES[continent] });
        for (const [key, label, format] of FACT_FORMATS) {
            const value = (place.f || {})[key];
            const isMissing = value === undefined || value === null || value === '' || (typeof value === 'number' && value <= 0 && key !== 'year');
            if (!isMissing) facts.push({ label, value: format(value) });
        }
        return facts;
    };

    // Šířka výřezu slepé mapy ve stupních: podle kategorie, u velkých míst (státy, oceány, velké ostrovy, dlouhé řeky)
    // podle rozlohy nebo délky, ať se vejdou celá i se sousedstvím; u otázky na stát širší, ať mapa odpověď hned neprozradí
    const getMapSpan = (place, quizType) => {
        const facts = place.f || {};
        const base = place.c === 'stat' ? 14 : getCategory(place.c).mapSpan * (quizType === 'location' ? 1.5 : 1);
        const area = facts.area || (place.c === 'stat' ? 100000 : 0);
        const sizeSpan = Math.max(area ? Math.sqrt(area) / 111 * 6 : 0, facts.len ? facts.len / 111 * 0.8 : 0);
        return Math.round(Math.min(Math.max(base, sizeSpan), 120));
    };

    // Slepá mapa: obrysy států bez popisků v Mercatorově zobrazení, zadaný bod uprostřed
    const mercatorY = (lat) => {
        const radians = Math.max(Math.min(lat, 85), -85) * Math.PI / 180;
        return Math.log(Math.tan(Math.PI / 4 + radians / 2)) * 180 / Math.PI;
    };
    const buildBlindMap = (world, { lat, lon, spanLon, width, height, highlightIso }) => {
        const scale = width / spanLon;
        const centerY = mercatorY(lat);
        const shapes = [];
        for (const country of world.countries) {
            let path = '';
            for (const ring of country.r) {
                let lonSum = 0;
                for (let i = 0; i < ring.length; i += 2) lonSum += ring[i];
                // Obrys posunout o ±360°, aby ležel co nejblíž středu (mapa přes 180. poledník)
                const shift = Math.round((lon - lonSum / (ring.length / 2) / 10) / 360) * 360;
                let ringPath = '';
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for (let i = 0; i < ring.length; i += 2) {
                    const x = (ring[i] / 10 + shift - lon) * scale + width / 2;
                    const y = height / 2 - (mercatorY(ring[i + 1] / 10) - centerY) * scale;
                    ringPath += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
                if (maxX >= 0 && minX <= width && maxY >= 0 && minY <= height) path += `${ringPath}Z`;
            }
            if (path) shapes.push({ id: country.id, d: path, highlight: Boolean(highlightIso) && country.id === highlightIso });
        }
        return shapes;
    };


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
        const levels = `${result.hintLevel}/${result.levelCount || result.hintLevel}`;
        const outcome = result.correct
            ? `✅ ${formatPoints(result.points)} · nápověda ${levels}${result.typed ? ' · napsáno' : ''}`
            : `❌ tentokrát ne · nápověda ${levels}`;
        const categoryInfo = getCategory(category);
        return [
            `Geo Kvíz · ${formatDayKey(dayKey)}`,
            `${categoryInfo.emoji} ${categoryInfo.label}`,
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
        UNKNOWN_COUNTRY, INTERNATIONAL_WATERS, CZECHIA_QID, TILE_SIZE, COUNTRIES, CATEGORIES, CONTINENT_NAMES,
        SATELLITE_TILES, OSM_TILES,
        escapeHtml, stripBrackets, isRealPhoto, commonsPhotoUrl, displayName, plural, formatPoints,
        getDayKey, shiftDayKey, formatDayKey, createSeededRandom, pickRandom, shuffle, getCategory,
        getWordStems, censorName, censorCountry, isKnownCountry, processWikiText, normalizeAnswer, levenshtein, isAnswerMatch,
        filterPlaces, pickPlace, getCountryNames, getContinent, buildPlaceChoices, buildCountryChoices, canAskForCountry,
        getCountryAliases, getAcceptedAnswers, getHintSteps, pointsFor, buildFacts, getMapSpan, buildBlindMap,
        computeStreak, buildShareText, getTileLayout
    };
});
