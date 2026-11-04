// Jádro Mudrlanta: čistá logika kvízu bez práce s DOM a sítí, společná pro všechna témata (topics/*.js).
// Používá ji aplikace (app.js) i testy (tests/).
(function (root, factory) {
    const core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.MudrlantCore = core;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';

    const UNKNOWN_COUNTRY = 'Neznámá poloha';
    const INTERNATIONAL_WATERS = 'Mezinárodní vody / Oceán';
    const CZECHIA_QID = 'Q213';
    const TILE_SIZE = 256;

    const CONTINENT_NAMES = { EU: 'Evropa', AS: 'Asie', AF: 'Afrika', NA: 'Severní Amerika', SA: 'Jižní Amerika', OC: 'Austrálie a Oceánie', AN: 'Antarktida' };

    // Mapové dlaždice: satelitní snímek NASA bez popisků (nápověda) a OpenStreetMap s popisky (po odhalení)
    const SATELLITE_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
    const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    // Další přijímané názvy a zkratky států pro psané odpovědi a zakrývání: [Wikidata ID, název podle Wikidat, kontinent, další názvy]
    const COUNTRIES = [
        ['Q213', 'Česko', 'EU', ['Česká republika', 'ČR']], ['Q183', 'Německo', 'EU'], ['Q40', 'Rakousko', 'EU'], ['Q214', 'Slovensko', 'EU'],
        ['Q36', 'Polsko', 'EU'], ['Q28', 'Maďarsko', 'EU'], ['Q142', 'Francie', 'EU'], ['Q38', 'Itálie', 'EU'], ['Q29', 'Španělsko', 'EU'],
        ['Q45', 'Portugalsko', 'EU'], ['Q145', 'Spojené království', 'EU', ['Velká Británie', 'Británie', 'UK', 'Anglie']], ['Q27', 'Irsko', 'EU'],
        ['Q55', 'Nizozemsko', 'EU', ['Holandsko']], ['Q31', 'Belgie', 'EU'], ['Q32', 'Lucembursko', 'EU'], ['Q39', 'Švýcarsko', 'EU'],
        ['Q35', 'Dánsko', 'EU'], ['Q20', 'Norsko', 'EU'], ['Q34', 'Švédsko', 'EU'], ['Q33', 'Finsko', 'EU'], ['Q189', 'Island', 'EU'],
        ['Q191', 'Estonsko', 'EU'], ['Q211', 'Lotyšsko', 'EU'], ['Q37', 'Litva', 'EU'], ['Q212', 'Ukrajina', 'EU'], ['Q159', 'Rusko', 'EU', ['Ruská federace']],
        ['Q184', 'Bělorusko', 'EU', ['Belarus']], ['Q217', 'Moldavsko', 'EU', ['Moldova']], ['Q218', 'Rumunsko', 'EU'], ['Q219', 'Bulharsko', 'EU'], ['Q41', 'Řecko', 'EU'],
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
        ['Q1019', 'Madagaskar', 'AF'], ['Q408', 'Austrálie', 'OC'], ['Q664', 'Nový Zéland', 'OC'],
        // Další běžné názvy a zkratky (psaná odpověď je přijme, popis je zakryje)
        ['Q974', 'Konžská demokratická republika', 'AF', ['DR Kongo', 'Demokratická republika Kongo', 'KDR', 'Kongo']],
        ['Q971', 'Konžská republika', 'AF', ['Kongo', 'Kongo-Brazzaville']], ['Q878', 'Spojené arabské emiráty', 'AS', ['SAE', 'Emiráty']],
        ['Q836', 'Myanmar', 'AS', ['Barma']], ['Q865', 'Tchaj-wan', 'AS', ['Taiwan', 'Tchajwan', 'Čínská republika']],
        ['Q423', 'Severní Korea', 'AS', ['KLDR', 'Korejská lidově demokratická republika']], ['Q1011', 'Kapverdy', 'AF', ['Kapverdské ostrovy']],
        ['Q237', 'Vatikán', 'EU', ['Svatý stolec', 'Městský stát Vatikán']], ['Q219060', 'Stát Palestina', 'AS', ['Palestina']],
        ['Q1050', 'Svazijsko', 'AF', ['Eswatini']], ['Q574', 'Východní Timor', 'AS', ['Timor-Leste']],
        ['Q786', 'Dominikánská republika', 'NA', ['Dominikána']]
    ].map(([id, name, continent, aliases = []]) => ({ id, name, continent, aliases }));

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Závorky pryč, zakrytí [***] z předchozího kroku ale zůstane (zakrývá se i ve více krocích po sobě)
    const stripBrackets = (text) => text.replace(/\[\*\*\*\]|[\[\(][^[\]()]*[\]\)]/g, (match) => match === '[***]' ? match : '');
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
    // Předložky a členy (i al- v Abú Bakr al-Bagdádí), které by zakryly běžná slova („al“ by vzalo i „ale“)
    const CENSOR_SKIP_WORDS = new Set(['nad', 'pod', 'na', 've', 'de', 'la', 'le', 'les', 'des', 'du', 'di', 'da', 'del', 'der', 'die', 'das', 'am', 'an', 'im', 'of', 'the', 'and', 'et', 'san', 'saint', 'sankt',
        'al', 'el', 'ad', 'as', 'ar', 'az', 'ibn', 'bin', 'ben', 'von', 'van', 'zu', 'den', 'ten', 'ter', 'dos', 'do', 'y']);
    // Římská číslice (Karel IV.) – zakrytá by v textu schovala i čísla jiných panovníků a nic by nepřidala
    const isRomanNumeral = (word) => /^[IVXLC]+\.?$/.test(word);
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
    // Přídavná jména, která se z názvu nedají odvodit pravidlem (Kypr → kyperský, Bosna → bosenský)
    const SPECIAL_STEMS = { kypr: ['Kyper'], bosna: ['Bosen'], mauritius: ['Mauricij', 'Mauric'], 'srí': ['Srílan'], lanka: ['Lansk'] };
    const getWordStems = (word) => {
        const stems = new Set([word.replace(/[aeiouyáéěíóúůý]$/iu, ''), word.replace(/[aeiouyáéěíóúůý]+$/iu, '')]);
        // Rody a národy v množném čísle: Přemyslovci → Přemyslovec, přemyslovský; Lucemburkové → Lucemburk, Lucemburků
        if (word.length >= 7 && /ovci$/iu.test(word)) stems.add(word.slice(0, -2));
        if (word.length >= 7 && /ové$/iu.test(word)) stems.add(word.slice(0, -3));
        // Kyrgyzstán → kyrgyzský, Tádžikistán → tádžický: bez koncovky -stán; Jamajka → jamajský
        if (word.length >= 8 && /stán$/iu.test(word)) stems.add(word.replace(/i?stán$/iu, ''));
        if (word.length >= 6 && /jka$/iu.test(word)) stems.add(word.slice(0, -2));
        (SPECIAL_STEMS[word.toLowerCase()] || []).forEach(stem => stems.add(stem));
        // Litva → litevský, Moldava → moldavský: souhláska + va se v přídavném jménu rozšíří na -ev- (Litev…)
        if (word.length >= 4 && /[^aeiouyáéěíóúůý]va$/iu.test(word)) stems.add(`${word.slice(0, -2)}ev`);
        // Přídavná jména od míst (kubánský → Kuba, mexický → Mexiko, kanadský → Kanada, africký → Afrika)
        const place = /^\p{Ll}/u.test(word) && word.length >= 7 && word.match(/^(.{3,}?)(?:ánsk|ansk|ijsk|sk)[ýáéí]$|^(.{3,}c)k[ýáéí]$/u);
        if (place) {
            stems.add(place[1] || place[2]);
            if (place[2]) stems.add(place[2].slice(0, -1) + 'k');
        }
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

    // Písmena s diakritikou, která čeština nemá (Vũng Tàu, São Paulo): text je často píše bez ní (Vung Tau)
    const FOREIGN_DIACRITICS = /[^\p{L}a-záčďéěíňóřšťúůýž]|[àâãäåæçèêëìîïñòôõöøùûüÿāăąćĉċēĕėęĝğġģĥħĩīĭįıĵķĺļľŀłńņŉŋōŏőœŕŗśŝşţŧũūŭűųŵŷźżǎǐǒǔ]/iu;
    const UMLAUTS = { 'ö': 'oe', 'ü': 'ue', 'ä': 'ae', 'Ö': 'Oe', 'Ü': 'Ue', 'Ä': 'Ae' };
    const UMLAUTS_BACK = { oe: 'ö', ue: 'ü', ae: 'ä' };
    const withoutDiacritics = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
    const buildWordsPattern = (words, phrases = []) => {
        // Celé víceslovné názvy doslova (Si-an, Wu-i – po slovech by byly moc krátké)
        const parts = phrases.map(phrase => escapeRegExp(phrase));
        for (const word of words) {
            if (word.length < 2 || CENSOR_SKIP_WORDS.has(word.toLowerCase()) || isRomanNumeral(word)) continue;
            // Slovo samo (Saná – z kmene „San“ by koncovka á nevyšla), dvoupísmenné ne (Si by vzalo i „si“)
            const forms = word.length >= 3 ? [word] : [];
            if (FOREIGN_DIACRITICS.test(word)) forms.push(withoutDiacritics(word));
            // Německý přepis přehlásek: Schönberg = Schoenberg, Müller = Mueller
            const umlauts = word.replace(/[öüä]/giu, ch => UMLAUTS[ch]);
            const plain = word.replace(/(?<=\p{L})(oe|ue|ae)/giu, ch => UMLAUTS_BACK[ch.toLowerCase()]);
            for (const variant of [umlauts, plain]) if (variant !== word && variant.length >= 3) forms.push(variant);
            for (const form of forms) parts.push(escapeRegExp(form));
            for (const stem of getWordStems(word)) {
                parts.push(escapeRegExp(stem) + (stem.length >= 4 ? '\\p{L}*' : SHORT_STEM_ENDINGS));
                if (FOREIGN_DIACRITICS.test(stem)) parts.push(escapeRegExp(withoutDiacritics(stem)) + (stem.length >= 4 ? '\\p{L}*' : SHORT_STEM_ENDINGS));
            }
        }
        if (parts.length === 0) return null;
        return new RegExp(NOT_LETTER_BEFORE + COMPOUND_PREFIX + '(?:' + parts.join('|') + ')' + NOT_LETTER_AFTER, 'giu');
    };

    // Zkratky (USA, ČR, ČLR) jen jako celé slovo a s velkými písmeny, ať nezakryjí běžná slova
    const isAbbreviation = (word) => /^\p{Lu}{2,4}$/u.test(word);

    const censorWords = (text, phrase) => {
        const words = stripBrackets(phrase).trim().split(/[\s,\-–]+/);
        const abbreviations = words.filter(word => isAbbreviation(word) && !isRomanNumeral(word));
        const hyphenated = stripBrackets(phrase).split(',').map(name => name.trim()).filter(name => /\p{L}[\-–]\p{L}/u.test(name));
        const pattern = buildWordsPattern(words.filter(word => !isAbbreviation(word)), hyphenated);
        let res = pattern ? text.replace(pattern, '[***]') : text;
        if (abbreviations.length) {
            res = res.replace(new RegExp(NOT_LETTER_BEFORE + '(?:' + abbreviations.map(escapeRegExp).join('|') + ')' + NOT_LETTER_AFTER, 'gu'), '[***]');
        }
        // Dvoupísmenné slovo s velkým písmenem (Medvídek Pú, Ang Lee) jako celé slovo a jen s velkým písmenem
        const shortCapitals = words.filter(word => /^\p{Lu}\p{Ll}$/u.test(word) && !CENSOR_SKIP_WORDS.has(word.toLowerCase()));
        if (shortCapitals.length) {
            res = res.replace(new RegExp(NOT_LETTER_BEFORE + '(?:' + shortCapitals.map(escapeRegExp).join('|') + ')' + NOT_LETTER_AFTER, 'gu'), '[***]');
        }
        return res;
    };

    // Sousední zakrytá slova jako jeden blok – podle počtu [***] by šlo poznat, z kolika slov se odpověď skládá
    // Iniciály těsně před zakrytým jménem (C. S. [***], J. R. R. [***]) by jméno prozradily – patří k němu
    const mergeCensored = (text) => text
        .replace(/(?<![\p{L}\d])(?:\p{Lu}\.\s?){1,4}(?=\[\*\*\*\])/gu, '')
        .replace(/\[\*\*\*\](?:[\s\-–]+\[\*\*\*\])+/g, '[***]');

    const censorName = (text, name) => {
        // Po vypuštěné závorce nezůstane „ ,“ ani „,,“
        const res = stripBrackets(text).replace(/\s{2,}/g, ' ').replace(/\s+(?=[,.;:])/g, '').replace(/([,;])[,;]+/g, '$1');
        return mergeCensored(censorWords(res, name));
    };

    const NATIONALITY_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:americk|rusk|německ|francouzsk|italsk|japonsk|čínsk|kanadsk|australsk|britsk)\\p{L}*', 'giu');
    const CONTINENT_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:Evrop(?:a|y|ě|u|ou)|Asi(?:e|i|í)|Afri(?:ka|ky|ce|ku|kou)|Ameri(?:ka|ky|ce|ku|kou)|Austráli(?:e|i|í)|Antarktid(?:a|y|ě|u|ou)|Oceáni(?:e|i|í)|(?:evropsk|asijsk|africk|australsk|antarktick)\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const CZECH_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:v Česku|v České republice|v ČR|na Moravě|ve Slezsku|v Čechách|česk\\p{L}*|moravsk\\p{L}*|slezsk\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const REGION_PATTERN = /(?:v okrese|v provincii|ve státě|v regionu|v kraji|na kontinentu|v americkém státě|na ostrově|v pohoří|ve spolkové zemi|v departementu|v prefektuře|v kantonu|v župě|ve vojvodství|v hrabství|v oblasti|v autonomní oblasti|v distriktu|v gubernii|v emirátu) \p{Lu}[\p{Ll}-]+/gu;
    // Region přídavným jménem: v Jihomoravském kraji, ve Středočeském kraji, v Plzeňském regionu
    const REGION_ADJECTIVE_PATTERN = /(?<![\p{L}\p{N}])(?:v|ve) \p{Lu}\p{Ll}+(?:ém|ím) (?:kraji|okrese|regionu|vojvodství|kantonu|departementu|hrabství)(?![\p{L}\p{N}])/gu;

    // Místo hned po slově „značka“ (značka N, se značkou m, značí se A) – tam se zakryje i jednopísmenná značka
    const AFTER_SYMBOL_WORD = '(?:[Zz]načk\\p{L}*|[Ss]ymbol\\p{L}*|[Zz]kratk\\p{L}*|[Zz]načí se|[Oo]značuje se|[Oo]značení)\\s*:?\\s+';

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

        if (!isKnownCountry(country)) return mergeCensored(res);
        return mergeCensored(censorWords(res, [country, ...aliases].join(', ')));
    };

    // Vzorce z Wikipedie ({\displaystyle E=mc^{2}}) jsou v textu nečitelné – i s vnořenými závorkami pryč
    const stripMath = (text) => {
        let result = text;
        for (let start = result.indexOf('{\\displaystyle'); start >= 0; start = result.indexOf('{\\displaystyle')) {
            let depth = 0;
            let end = start;
            for (; end < result.length; end++) {
                if (result[end] === '{') depth++;
                if (result[end] === '}' && --depth === 0) break;
            }
            result = result.slice(0, start) + result.slice(end + 1);
        }
        return result;
    };

    const processWikiText = (extract) => {
        let cleanExtract = stripBrackets(stripBrackets(stripMath(extract)));
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
            // Iniciály jmen (J. R. R. Tolkien, Arthur C. Clarke) větu nekončí
            .replace(/(?<![\p{L}])(\p{Lu})\.(?=\s?\p{Lu}\p{Ll})|(?<![\p{L}])(\p{Lu})\.(?=\s?\p{Lu}\.)/gu, (match, a, b) => `${a || b}${KEPT_DOT}`)
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
        // Bez zajímavostí se sekce prostě nezobrazí (výplňová věta by se tvářila jako zajímavost)
        const funFacts = sentences.slice(index).filter(s => s.length > 30).slice(0, 3);
        // Další věty úvodu hned za popisem (nejvýš tři, do ~420 znaků): pozdější nápověda s víc textem k hádání
        const moreParts = [];
        for (const sentence of sentences.slice(index)) {
            if (moreParts.length >= 3 || moreParts.join(' ').length + sentence.length > 420) break;
            moreParts.push(sentence);
        }
        const more = moreParts.join(' ');

        return { description, funFacts, more };
    };

    // Věty textu, které říkají totéž co nápověda „Fakta“ (hlavní město, počet obyvatel, rozloha, rok…): z nápovědy s dalšími
    // větami se vyřadí, ať hráč nedostane fakta dřív, než si o ně řekne. Čísla se porovnávají jen přítomností (text je často
    // zaokrouhluje jinak: 208 000 km² × 207 597 km²), slova podle prvních pěti písmen.
    const stripFactSentences = (text, facts) => {
        const values = (facts || []).map(fact => String(fact.value));
        const hasNumbers = values.some(value => /\d/.test(value));
        const words = new Set(values.flatMap(value => (value.match(/\p{L}{4,}/gu) || []).map(word => word.toLowerCase().slice(0, 5))));
        return String(text || '').split(/(?<=[.!?])\s+(?=\p{Lu}|\[)/u).filter(sentence => {
            if (hasNumbers && /\d/.test(sentence)) return false;
            return !(sentence.match(/\p{L}{4,}/gu) || []).some(word => words.has(word.toLowerCase().slice(0, 5)));
        }).join(' ');
    };

    // Chudá otázka, kterou se nepodařilo vyměnit: první fakta (rok, země, obor) se ukážou hned v okně, ne až po nápovědě
    const LEAD_FACTS = 3;
    const takeLeadFacts = (hints) => {
        const index = hints.findIndex(hint => hint.kind === 'facts' && !hint.extra);
        if (index < 0) return { hints, leadFacts: [] };
        const leadFacts = hints[index].facts.slice(0, LEAD_FACTS);
        const rest = hints[index].facts.slice(LEAD_FACTS);
        const next = rest.length ? hints.map((hint, i) => i === index ? { ...hint, facts: rest } : hint) : hints.filter((_, i) => i !== index);
        return { hints: next, leadFacts };
    };

    // Odpovědi porovnáváme bez diakritiky, velikosti písmen a závorek, s tolerancí drobných překlepů
    // Bez diakritiky a velikosti písmen; zvláštní písmena přepsaná (Sjælland = sjaelland), jiné abecedy (ω) zůstanou
    const LETTERS = { æ: 'ae', œ: 'oe', ø: 'o', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };
    const normalizeAnswer = (text) => stripBrackets(String(text ?? ''))
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[æœøßłđðþı]/g, letter => LETTERS[letter])
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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

    // Překlep se toleruje po slovech (v delším slově jeden, v dlouhém dva); čísla a římské číslice musí sedět přesně,
    // jinak by „Ludvík XV.“ prošel za Ludvíka XIV. a „15. století“ za 14.
    const isExactToken = (word) => /\d/.test(word) || /^[ivxlcdm]+$/.test(word);
    const wordTolerance = (word) => isExactToken(word) || word.length <= 4 ? 0 : word.length <= 8 ? 1 : 2;
    const isAnswerMatch = (input, acceptedAnswers) => {
        const given = normalizeAnswer(input);
        if (!given) return false;
        const givenWords = given.split(' ');
        return acceptedAnswers.some(answer => {
            const expected = normalizeAnswer(answer);
            if (!expected) return false;
            if (given === expected) return true;
            const words = expected.split(' ');
            if (words.length === givenWords.length) return words.every((word, i) => levenshtein(givenWords[i], word) <= wordTolerance(word));
            // Chybějící nebo přebývající mezera („Jan Hus“ – „Janhus“) u slov bez čísel
            return !words.some(isExactToken) && levenshtein(given.replace(/ /g, ''), expected.replace(/ /g, '')) <= Math.min(wordTolerance(expected.replace(/ /g, '')), 1);
        });
    };
    // Značka nebo vzorec přesně (m ≠ m², CO ≠ CO₂); horní a dolní indexy jako obyčejné číslice, bez mezer;
    // velikost písmen jen tam, kde by rozhodovala (m – M)
    // Oddělovače se nepočítají: N·m = N m = Nm, A⋅h = Ah, l.y. = ly
    const normalizeSymbol = (text, caseSensitive) => {
        const plain = String(text ?? '').normalize('NFKC').replace(/[\s·⋅•*.]+/g, '');
        return caseSensitive ? plain : plain.toLowerCase();
    };
    const isSymbolMatch = (input, symbols, caseSensitive = false) => {
        const given = normalizeSymbol(input, caseSensitive);
        return Boolean(given) && symbols.some(symbol => normalizeSymbol(symbol, caseSensitive) === given);
    };
    // Složení vzorce (počet atomů každého prvku), i se závorkami a krystalovou vodou; null, když to vzorec není
    const formulaCounts = (text) => {
        const plain = String(text ?? '').normalize('NFKC').replace(/\s+/g, '');
        if (!plain || !/^[A-Za-z0-9()[\]·⋅.*]+$/.test(plain)) return null;
        const total = new Map();
        for (const part of plain.split(/[·⋅.*]/)) {
            const [, coefficient, body] = /^(\d*)(.*)$/.exec(part);
            const stack = [new Map()];
            const tokens = body.match(/[A-Z][a-z]?|\d+|./g) || [];
            const add = (map, element, n) => map.set(element, (map.get(element) || 0) + n);
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (token === '(' || token === '[') {
                    stack.push(new Map());
                    continue;
                }
                const count = /^\d+$/.test(tokens[i + 1] || '') ? Number(tokens[++i]) : 1;
                if (token === ')' || token === ']') {
                    if (stack.length < 2) return null;
                    const group = stack.pop();
                    for (const [element, n] of group) add(stack[stack.length - 1], element, n * count);
                } else if (/^[A-Z][a-z]?$/.test(token)) {
                    add(stack[stack.length - 1], token, count);
                } else {
                    return null;
                }
            }
            if (stack.length !== 1) return null;
            for (const [element, n] of stack[0]) total.set(element, (total.get(element) || 0) + n * Number(coefficient || 1));
        }
        return total.size ? total : null;
    };
    const sameCounts = (a, b) => Boolean(a && b) && a.size === b.size && [...a].every(([key, n]) => b.get(key) === n);
    // Vzorec stejného složení platí taky (C2H5OH i C2H6O u ethanolu, CH3COOH i C2H4O2)
    const isFormulaMatch = (input, formulas) => isSymbolMatch(input, formulas)
        || formulas.some(formula => sameCounts(formulaCounts(input), formulaCounts(formula)));

    const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    const romanToNumber = (text) => {
        let total = 0;
        for (let i = 0; i < text.length; i++) {
            const value = ROMAN_VALUES[text[i]];
            const next = ROMAN_VALUES[text[i + 1]] || 0;
            total += value < next ? -value : value;
        }
        return total;
    };
    // Století: číslo (i římské – XIV. století) a zda jde o dobu před naším letopočtem („5. století př. n. l.“, „5 pnl“, „-5“)
    const isCenturyMatch = (input, century) => {
        const text = normalizeAnswer(input);
        const digits = /\d+/.exec(text);
        // Římské číslo: nejdelší slovo z římských číslic (ve „v XIV. století př. n. l.“ je to XIV, ne předložka v ani l)
        const roman = text.split(' ').filter(word => /^[ivxlc]+$/.test(word)).sort((a, b) => b.length - a.length)[0];
        const number = digits ? Number(digits[0]) : roman ? romanToNumber(roman) : NaN;
        if (!number) return false;
        const beforeChrist = /(^|\s)(pr|pred|pnl|bc)(\s|$)/.test(text) || /^-/.test(String(input).trim());
        return number === Math.abs(century) && beforeChrist === (century < 0);
    };
    // Odpověď podle druhu otázky: match = 'century' | 'symbol' | 'formula', jinak názvy s tolerancí překlepů a případně i přesné značky
    const checkAnswer = (input, question) => {
        if (question.match === 'century') return isCenturyMatch(input, question.century);
        if (question.match === 'formula') return isFormulaMatch(input, question.accepted);
        if (question.match === 'symbol') return isSymbolMatch(input, question.accepted, question.caseSensitive);
        return isAnswerMatch(input, question.accepted) || isSymbolMatch(input, question.symbols || [], question.caseSensitive);
    };

    // Náhled fotky z Wikimedia Commons přímo z upload.wikimedia.org (bez přesměrování na plné rozlišení);
    // hash = první dva znaky MD5 názvu souboru, spočítané při sestavení sady míst
    const commonsPhotoUrl = (fileName, hash, width = 960) => {
        const name = encodeURIComponent(fileName.replace(/ /g, '_'));
        // Náhled kresby SVG (mapy rozšíření) je obrázek PNG
        const thumb = /\.svg$/i.test(fileName) ? `${name}.png` : name;
        return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash}/${name}/${width}px-${thumb}`;
    };
    // Původní soubor – když je obrázek menší než požadovaný náhled, Commons ho nezvětší a náhled nevrátí
    const commonsFileUrl = (fileName, hash) => `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash}/${encodeURIComponent(fileName.replace(/ /g, '_'))}`;

    // --- Položky témat: místa, osobnosti, druhy, prvky… (formát data/<téma>.json) ---

    // Okruh: null = celé téma, „c:klíč“ = kategorie, jinak zvláštní okruh z dat (pole g u položky)
    const inCollection = (item, collectionId) => {
        if (!collectionId) return true;
        if (collectionId.startsWith('c:')) return item.c === collectionId.slice(2);
        return (item.g || []).includes(collectionId);
    };
    const filterItems = (items, { tier = 'all', collection = null } = {}) =>
        items.filter(item => (tier === 'all' || item.k === 1) && inCollection(item, collection));

    // Nejdřív kategorie (v pořadí z tématu), potom položka v ní – jinak by převážila nejpočetnější kategorie
    const pickItem = (pool, rng, recentIds = [], categoryOrder = []) => {
        const present = new Set(pool.map(item => item.c));
        const categoryKeys = [...categoryOrder.filter(key => present.has(key)), ...[...present].filter(key => !categoryOrder.includes(key))];
        const categoryKey = pickRandom(categoryKeys, rng);
        const inCategory = pool.filter(item => item.c === categoryKey);
        const recent = new Map(recentIds.map((id, index) => [id, index]));
        const fresh = inCategory.filter(item => !recent.has(item.q));
        if (fresh.length) return pickRandom(fresh, rng);
        // Všechno už bylo: z polovičky hrané nejdávněji, ať se hned neopakuje právě odehraná otázka
        const oldestFirst = [...inCategory].sort((a, b) => recent.get(b.q) - recent.get(a.q));
        return pickRandom(oldestFirst.slice(0, Math.ceil(oldestFirst.length / 2)), rng);
    };

    // Řazení pro systematické procházení okruhu: podle názvu, nebo podle faktu (výška, rok…) – položky bez údaje na konec
    const collator = typeof Intl !== 'undefined' ? new Intl.Collator('cs') : null;
    const compareNames = (a, b) => collator ? collator.compare(a.n, b.n) : a.n.localeCompare(b.n);
    const sortItems = (items, sort = { by: 'name' }) => [...items].sort((a, b) => {
        if (!sort || sort.by === 'name') return compareNames(a, b);
        const va = (a.f || {})[sort.by];
        const vb = (b.f || {})[sort.by];
        if (va === undefined && vb === undefined) return compareNames(a, b);
        if (va === undefined) return 1;
        if (vb === undefined) return -1;
        return (sort.desc ? vb - va : va - vb) || compareNames(a, b);
    });

    const getCountryNames = (item, countries) => (item.co || []).map(id => countries[id] && countries[id].name).filter(Boolean);
    // Širší Evropa mezi Atlantikem a Uralem, se Špicberky, Kyprem, Kavkazem i Krétou (hrubě, jen pro zámoří a Sibiř)
    const isInEurope = (lat, lon) => lat >= 34 && lat <= 82 && lon >= -32 && lon <= 69 && !(lon > 60 && lat < 69);
    // Jasně Evropa: bez Malé Asie za Bosporem, Zakavkazska a Kazachstánu za Kaspickým mořem (pro Thrákii u Turecka)
    const isClearlyEurope = (lat, lon) => isInEurope(lat, lon) && lat >= 35
        && !(lat < 42.3 && lon > 26 && !(lat > 40.6 && lon < 29.01)) && !(lon > 40 && lat < 44) && !(lon > 50 && lat < 51.5);
    // Kontinent mimo Evropu podle polohy (jen hrubě – pro zámoří a státy na dvou kontinentech)
    const continentAt = (lat, lon) => {
        if (isInEurope(lat, lon)) return 'EU';
        if (lat > 50 && (lon > 60 || lon < -168)) return 'AS';
        if ((lon > 110 || lon < -120) && lat < 25) return 'OC';
        if (lon < -25) return lat > 13 || (lat > 11 && lon > -72) || (lat > 7 && lon < -77) ? 'NA' : 'SA';
        if (lat < 37 && lon >= -26 && (lon < 60 || lat < -5 && lon < 80) && !(lon > 34 && lat > 12) && !(lon > 25 && lat > 32)) return 'AF';
        return 'AS';
    };
    // Místa státu, který leží na dvou kontinentech nebo má zámoří (Sibiř, Ankara, Réunion, Tahiti), podle polohy;
    // stát sám podle tabulky států (Rusko je evropský stát)
    const getContinent = (item, countries) => {
        // U více států kontinent většiny (Polynésie: Oceánie, ne Severní Amerika podle USA na prvním místě), bez většiny žádný
        const known = (item.co || []).map(id => countries[id]).filter(c => c && c.continent);
        const counts = new Map();
        for (const c of known) counts.set(c.continent, (counts.get(c.continent) || 0) + 1);
        const [top, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] || ['', 0];
        const continent = known.length <= 1 ? (known[0] ? known[0].continent : '') : (topCount * 2 > known.length || top === known[0].continent && topCount * 2 === known.length ? top : '');
        if (!continent || item.c === 'stat' || item.la === undefined || item.lo === undefined) return continent;
        if (continent === 'EU') return continentAt(item.la, item.lo);
        if (continent === 'AS' && isClearlyEurope(item.la, item.lo)) return 'EU';
        return continent;
    };

    // --- Nesprávné možnosti: co nejpodobnější správné odpovědi, aby nebyla poznat na první pohled ---

    // Vzdálenost dvou míst ({ la, lo }) v kilometrech
    const distanceKm = (a, b) => {
        const rad = Math.PI / 180;
        const dLat = (b.la - a.la) * rad;
        const dLon = (b.lo - a.lo) * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.la * rad) * Math.cos(b.la * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
    };
    // Body za blízkost: čím blíž, tím podobnější (města v okolí); u států jemnější stupně, ať vyhrají sousedé
    const PLACE_STEPS = [300, 1000, 2500, 6000];
    const STATE_STEPS = [300, 500, 800, 1200, 2000, 4000];
    const nearness = (km, steps = PLACE_STEPS) => {
        const index = steps.findIndex(limit => km < limit);
        return index === -1 ? 0 : steps.length - index;
    };
    // Mají položky společný okruh (šelmy, kyseliny, mechanika…)?
    const sharesGroup = (a, b) => (a.g || []).some(group => (b.g || []).includes(group));
    // Blízká doba (rok položky f.y): stejné století 3 body, sousední 2, do tří století 1
    const eraNearness = (a, b) => {
        if (a === undefined || b === undefined) return 0;
        const distance = Math.abs(centuryOf(a) - centuryOf(b));
        return distance === 0 ? 3 : distance === 1 ? 2 : distance <= 3 ? 1 : 0;
    };
    // --- Kultura nesprávných možností: k Číňanovi Číňané, k Angličanovi Angličané, ne jediný Evropan mezi Asiaty ---
    // Země osoby či díla (f.land) se převede na dnešní stát (historické státy na nástupce) a z něj kontinent
    const MODERN_LAND = {
        'USA': 'Spojené státy americké', 'Československo': 'Česko', 'České království': 'Česko', 'České knížectví': 'Česko', 'Čechy': 'Česko',
        'Protektorát Čechy a Morava': 'Česko', 'Předlitavsko': 'Rakousko', 'Rakouské císařství': 'Rakousko', 'Rakousko-Uhersko': 'Rakousko',
        'Habsburská monarchie': 'Rakousko', 'Rakouské arcivévodství': 'Rakousko', 'Rakouské vévodství': 'Rakousko', 'Uhersko': 'Maďarsko',
        'starověký Řím': 'Itálie', 'Starověký Řím': 'Itálie', 'Západořímská říše': 'Itálie', 'Papežský stát': 'Itálie', 'Italské království': 'Itálie',
        'Benátská republika': 'Itálie', 'Florentská republika': 'Itálie', 'Janovská republika': 'Itálie', 'Sienská republika': 'Itálie',
        'Toskánské velkovévodství': 'Itálie', 'Neapolské království': 'Itálie', 'Sicilské království': 'Itálie', 'Sardinské království': 'Itálie',
        'Milánské vévodství': 'Itálie', 'Savojské vévodství': 'Itálie', 'Italská sociální republika': 'Itálie', 'Syrakusy': 'Itálie',
        'Starověké Řecko': 'Řecko', 'Athény': 'Řecko', 'Sparta': 'Řecko', 'Théby': 'Řecko', 'Makedonské království': 'Řecko', 'Epiros': 'Řecko',
        'Byzantská říše': 'Turecko', 'Osmanská říše': 'Turecko', 'Pontské království': 'Turecko', 'Seldžucká říše': 'Turecko',
        'starověký Egypt': 'Egypt', 'Ptolemaiovský Egypt': 'Egypt', 'Egyptské království': 'Egypt', 'Egyptský ejálet': 'Egypt', 'Nová říše': 'Egypt',
        'Fátimovský chalífát': 'Egypt', 'starověké Kartágo': 'Tunisko', 'Numidské království': 'Alžírsko',
        'Anglické království': 'Spojené království', 'Anglie': 'Spojené království', 'Skotsko': 'Spojené království', 'Skotské království': 'Spojené království',
        'Wales': 'Spojené království', 'Severní Irsko': 'Spojené království', 'Království Velké Británie': 'Spojené království',
        'Spojené království Velké Británie a Irska': 'Spojené království', 'Britské impérium': 'Spojené království', 'Wessexské království': 'Spojené království',
        'Northumbrijské království': 'Spojené království', 'Mercijské království': 'Spojené království', 'Kentské království': 'Spojené království',
        'Gaelské Irsko': 'Irsko', 'Sovětský svaz': 'Rusko', 'Ruské impérium': 'Rusko', 'Ruské carství': 'Rusko', 'Kyjevská Rus': 'Ukrajina',
        'Ruská sovětská federativní socialistická republika': 'Rusko', 'Moskevské velkoknížectví': 'Rusko', 'Vladimirsko-suzdalské knížectví': 'Rusko',
        'Svatá říše římská': 'Německo', 'Pruské království': 'Německo', 'Německá říše': 'Německo', 'Německé císařství': 'Německo',
        'Výmarská republika': 'Německo', 'nacistické Německo': 'Německo', 'Západní Německo': 'Německo', 'Německá demokratická republika': 'Německo',
        'Bavorské království': 'Německo', 'Bavorské vévodství': 'Německo', 'Württemberské království': 'Německo', 'Saské království': 'Německo',
        'Saské kurfiřtství': 'Německo', 'Braniborské markrabství': 'Německo', 'Hesenské velkovévodství': 'Německo', 'Hesensko-Kasselsko': 'Německo',
        'Bádenské velkovévodství': 'Německo', 'Falcké kurfiřtství': 'Německo', 'Kolínské kurfiřtství': 'Německo', 'Nasavské vévodství': 'Německo',
        'Hamburk': 'Německo', 'Rýnský spolek': 'Německo', 'Franská říše': 'Francie', 'Karolínská říše': 'Francie', 'Západofranská říše': 'Francie',
        'Francouzské království': 'Francie', 'Lotrinské vévodství': 'Francie', 'Burgundské království': 'Francie', 'druhé Burgundské království': 'Francie',
        'Flandry': 'Belgie', 'Habsburské Nizozemí': 'Belgie', 'Nizozemské království': 'Nizozemsko', 'Spojené provincie nizozemské': 'Nizozemsko',
        'Sedmnáct provincií': 'Nizozemsko', 'Dánské království': 'Dánsko', 'Dánsko-Norsko': 'Dánsko', 'Norské království': 'Norsko',
        'Islandské společenství': 'Island', 'Portugalské království': 'Portugalsko', 'Kastilská koruna': 'Španělsko', 'Kastilské království': 'Španělsko',
        'Aragonská koruna': 'Španělsko', 'Navarrské království': 'Španělsko', 'Asturské království': 'Španělsko', 'Mallorské království': 'Španělsko',
        'Granadský emirát': 'Španělsko', 'Španělské impérium': 'Španělsko', 'Vizigóti': 'Španělsko', 'Polsko-litevská unie': 'Polsko',
        'Polské království': 'Polsko', 'Polské knížectví': 'Polsko', 'Litevské velkoknížectví': 'Litva', 'Jugoslávie': 'Srbsko',
        'Jugoslávské království': 'Srbsko', 'Socialistická federativní republika Jugoslávie': 'Srbsko', 'Království Srbů, Chorvatů a Slovinců': 'Srbsko',
        'Srbsko a Černá Hora': 'Srbsko', 'Srbské království': 'Srbsko', 'Rumunské království': 'Rumunsko', 'Valašské knížectví': 'Rumunsko',
        'Sedmihradské knížectví': 'Rumunsko', 'První bulharská říše': 'Bulharsko', 'Albánská socialistická lidová republika': 'Albánie',
        'Persie': 'Írán', 'Achaimenovská říše': 'Írán', 'Sásánovská říše': 'Írán', 'Safíovská říše': 'Írán', 'Parthská říše': 'Írán',
        'Íránské císařství': 'Írán', 'Seleukovská říše': 'Sýrie', 'Umajjovský chalífát': 'Sýrie', 'Abbásovský chalífát': 'Irák', 'Rášidský chalífát': 'Saúdská Arábie',
        'Babylonie': 'Irák', 'Novobabylonská říše': 'Irák', 'Hidžáz': 'Saúdská Arábie', 'Izraelské království': 'Izrael', 'Judské království': 'Izrael',
        'Herodovské království': 'Izrael', 'Hasmoneovské království': 'Izrael', 'Jeruzalémské království': 'Izrael', 'Mandátní Palestina': 'Izrael',
        'Čching': 'Čína', 'Ming': 'Čína', 'Jüan': 'Čína', 'Sung': 'Čína', 'Chan': 'Čína', 'Wej': 'Čína', 'Suej': 'Čína', 'Čou': 'Čína', 'Šang': 'Čína',
        'Čchin': 'Čína', 'Liou Sung': 'Čína', 'Čínská republika': 'Čína', 'Tibet': 'Čína', 'Mongolská říše': 'Mongolsko', 'Hunská říše': 'Mongolsko',
        'Britská Indie': 'Indie', 'Maurjovská říše': 'Indie', 'Guptovská říše': 'Indie', 'Mughalská říše': 'Indie', 'Maráthská říše': 'Indie',
        'Kušánská říše': 'Indie', 'Durránská říše': 'Afghánistán', 'Afghánský islámský stát': 'Afghánistán', 'Dynastie Čoson': 'Jižní Korea',
        'Silla': 'Jižní Korea', 'Korea': 'Jižní Korea', 'Vietnamská demokratická republika': 'Vietnam', 'Etiopské císařství': 'Etiopie',
        'Zululand': 'Jihoafrická republika', 'Libyjské království': 'Libye', 'Incká říše': 'Peru', 'Místokrálovství Peru': 'Peru',
        'Havajské království': 'Spojené státy americké', 'Portoriko': 'Spojené státy americké', 'Urartu': 'Arménie'
    };
    let continentByLand = new Map();
    // Aplikace a testy předají seznam států (data/countries.json), odkud se vezme kontinent
    const setCountries = (countries) => {
        continentByLand = new Map(Object.values(countries || {}).filter(country => country && country.name).map(country => [country.name, country.continent]));
    };
    const landOf = (item) => {
        const land = item && item.f && item.f.land;
        const first = String(Array.isArray(land) ? land[0] || '' : land || '').split(', ')[0];
        return first ? MODERN_LAND[first] || first : '';
    };
    // Kulturní oblasti podle jmen a dějin: Západ (Evropa, Amerika, Austrálie), východní, jižní, jihovýchodní a střední Asie,
    // Blízký východ, Afrika (Turecko, Írán a Kavkaz k Blízkému východu)
    const ASIA_REGIONS = {
        east: ['Čína', 'Japonsko', 'Jižní Korea', 'Severní Korea', 'Mongolsko', 'Tchaj-wan'],
        south: ['Indie', 'Pákistán', 'Bangladéš', 'Srí Lanka', 'Nepál', 'Bhútán', 'Maledivy', 'Afghánistán'],
        southeast: ['Indonésie', 'Singapur', 'Východní Timor', 'Kambodža', 'Laos', 'Malajsie', 'Myanmar', 'Thajsko', 'Vietnam', 'Brunej', 'Filipíny'],
        central: ['Uzbekistán', 'Kazachstán', 'Kyrgyzstán', 'Tádžikistán', 'Turkmenistán']
    };
    const regionOfLand = (land) => {
        const continent = continentByLand.get(land);
        if (!continent) return '';
        if (continent === 'AF') return /^(Egypt|Libye|Tunisko|Alžírsko|Maroko)$/.test(land) ? 'mideast' : 'africa';
        if (continent !== 'AS') return 'west';
        return Object.keys(ASIA_REGIONS).find(region => ASIA_REGIONS[region].includes(land)) || 'mideast';
    };
    // Mírně kladné = stejná kultura (stát +2, oblast +1 – témata mají vlastní váhy země), jiná oblast −8 – víc než shoda doby
    // či směru, protože jediné čínské jméno mezi nizozemskými je poznat hned. Položka bez země se počítá k Západu (většina dat). Čech mezi cizinci −2.
    // Jen u položek se zemí (osoby a díla) – místa, druhy, prvky a vlajky mají vlastní pravidla.
    const cultureScore = (item, other) => {
        const a = landOf(item);
        const b = landOf(other);
        if (!a) return 0;
        let score = 0;
        if (a === b) score += 2;
        else {
            const ra = regionOfLand(a);
            const rb = b ? regionOfLand(b) : 'west';
            if (ra && rb) score += ra === rb ? 1 : -8;
        }
        if ((item.cz === 1) !== (other.cz === 1)) score -= 2;
        return score;
    };

    // Osoby: jiné pohlaví skoro vyřadí (jediná žena mezi muži by byla poznat hned), jinak rozhoduje doba
    const personSimilarity = (item, other) => ((item.sx === 'f') !== (other.sx === 'f') ? -20 : 0)
        + eraNearness((item.f || {}).y, (other.f || {}).y);
    // Seřadí kandidáty od nejpodobnějšího; stejně podobné náhodně (semínko), nekonečně záporné skóre vyřadí
    const rankBySimilarity = (candidates, score, rng) => shuffle(candidates, rng)
        .map(candidate => ({ candidate, value: score(candidate) }))
        .filter(entry => entry.value > -Infinity)
        .sort((a, b) => b.value - a.value)
        .map(entry => entry.candidate);
    // Z pořadí vezme první, jejichž název se ještě neobjevil; keyOf určí, co je „stejné“ (u vzorců a značek přesný zápis,
    // protože bez dolních indexů a horních indexů by H₂O a H₂O₂ i m a m² splynuly)
    const takeDistinct = (ranked, count, taken, nameOf, keyOf = normalizeAnswer) => {
        const picked = [];
        for (const candidate of ranked) {
            if (picked.length >= count) break;
            const key = keyOf(nameOf(candidate));
            if (!key || taken.has(key)) continue;
            taken.add(key);
            picked.push(candidate);
        }
        return picked;
    };

    // Je jeden název celý obsažený v druhém (Síla – Tíhová síla, Energie – Vnitřní energie, i se skloněním: Rychlost –
    // Velikost rychlosti, sokol – sokol stěhovavý)? Taková možnost by byla sporná, proto přijde na řadu až po všech
    // ostatních. Krátká slova a římské číslice
    // musí sedět přesně (Václav II. a Václav III. sporní nejsou)
    const isNamePart = (a, b) => {
        const [shorter, longer] = [normalizeAnswer(a).split(' '), normalizeAnswer(b).split(' ')].sort((x, y) => x.length - y.length);
        const matches = (word) => longer.some(other => other === word || (word.length >= 5 && other.startsWith(word.slice(0, word.length - 2))));
        return shorter.length < longer.length && shorter.every(matches);
    };

    // Nesprávné možnosti názvu: položky stejné kategorie seřazené podle podobnosti. Základ dá jádro – stejně známé
    // (ke známé odpovědi známé možnosti) a stejného typu (k anglickému králi angličtí králové, k průlivu průlivy);
    // zbytek přidá téma funkcí similarity(other) – blízká místa, stejné století a pohlaví, stejná čeleď…
    const buildItemChoices = (item, items, rng, similarity = () => 0) => {
        // Ke známé odpovědi známá možnost váží víc – jinak by známá odpověď mezi samými neznámými byla nápadná
        const tier = (other) => other.k !== item.k ? 0 : item.k === 1 ? 3 : 2;
        // Druh (tenista, malířka, hlavní město) je vidět u otázky – nesprávná možnost jiného druhu by byla poznat hned
        const score = (other) => tier(other) + (item.ty && other.ty === item.ty ? 4 : 0) + (similarity(other) || 0) + cultureScore(item, other)
            - (isNamePart(item.n, other.n) ? 100 : 0);
        const ranked = rankBySimilarity(items.filter(other => other.c === item.c && other.q !== item.q), score, rng);
        const distractors = takeDistinct(ranked, 3, new Set([normalizeAnswer(item.n)]), other => other.n);
        return shuffle([
            { id: item.q, label: item.n, correct: true },
            ...distractors.map(other => ({ id: other.q, label: other.n, correct: false }))
        ], rng);
    };

    // Nesprávné možnosti státu: nejbližší státy (distanceOf(id) = vzdálenost od hádaného místa v km, když je známá),
    // jinak státy ze stejného kontinentu
    const buildCountryChoices = (countryId, countries, rng, distanceOf = () => undefined) => {
        const correct = countries[countryId];
        const score = ([id, country]) => {
            const km = distanceOf(id);
            return (country.continent === correct.continent ? 2 : 0) + (km === undefined ? 0 : nearness(km, STATE_STEPS));
        };
        const ranked = rankBySimilarity(Object.entries(countries).filter(([id]) => id !== countryId), score, rng);
        const distractors = takeDistinct(ranked, 3, new Set([normalizeAnswer(correct.name)]), ([, country]) => country.name);
        return shuffle([
            { id: countryId, label: correct.name, correct: true },
            ...distractors.map(([id, country]) => ({ id, label: country.name, correct: false }))
        ], rng);
    };

    // Kterou jinou položku hráč napsal – ať se o ní může hned dočíst (nejdřív ze stejné kategorie)
    const findAnswerItem = (answer, item, items) => {
        const others = items.filter(other => other.q !== item.q);
        const match = others.filter(other => other.c === item.c).find(other => isAnswerMatch(answer, [other.n]))
            || others.find(other => isAnswerMatch(answer, [other.n]));
        return match ? match.q : null;
    };
    // Který jiný stát hráč napsal (u otázky „Ve kterém státě to je?“)
    const findAnswerCountry = (answer, excludeIds, countries) => {
        const match = Object.entries(countries)
            .find(([id, country]) => !excludeIds.includes(id) && isAnswerMatch(answer, [country.name, ...getCountryAliases([id])]));
        return match ? match[0] : null;
    };

    // Seznam k zopakování (klíče „téma:ID“): chyba položku přidá na začátek, správná odpověď ji odebere
    const updateMistakes = (mistakes, key, correct, max = 300) => {
        const rest = mistakes.filter(other => other !== key);
        return correct ? rest : [key, ...rest].slice(0, max);
    };

    const getCountryAliases = (countryIds = []) => COUNTRIES.filter(c => countryIds.includes(c.id)).flatMap(c => c.aliases);
    // Přijímané psané odpovědi: název, titulek článku i bez upřesnění v závorce, případně další názvy z tématu
    const nameAnswers = (item, extra = []) => [item.n, item.t, displayName(item.t || ''), ...extra].filter(Boolean);
    const countryAnswers = (countryIds, countryNames) => [
        ...countryNames,
        ...COUNTRIES.filter(c => countryIds.includes(c.id)).flatMap(c => [c.name, ...c.aliases])
    ];

    // Nápovědy v pořadí: popis (hned) → fotka → obrazová nápověda tématu (mapa, časová osa…) → fakta; chybějící krok se vynechá
    // Body: bez nápovědy vždy 4 (i když otázka nápověd tolik nemá), každá použitá nápověda o bod méně, aspoň 1;
    // level = 1 + počet použitých nápověd; psaná odpověď dvojnásobek
    const MAX_POINTS = 4;
    const pointsFor = (level, typed) => Math.max(MAX_POINTS - level + 1, 1) * (typed ? 2 : 1);

    // Fakt, který hráč už vidí v zadání nebo popisu („Místo: Sudoměř“ u „bitvy u Sudoměře“), nápovědu nepřidá.
    // Slovo se hledá podle kmene (začátku), ať se najde i v jiném pádě; čísla a krátká slova se neporovnávají.
    const stemOf = (word) => word.slice(0, Math.max(4, Math.ceil(word.length * 0.7)));
    // Slovo je vidět i tehdy, když z některého slova textu vychází (vorvaň → vorvaňovití, hřib → hřibovité,
    // s pohyblivým e: klouzek → klouzkovité, orel → orlovití)
    const isFactVisible = (value, text) => {
        // Rok, který už je v popisu („z roku 1980“ a fakt Rok 1980)
        if (/^\d{3,4}$/.test(String(value).trim())) return new RegExp(`(?<!\\d)${String(value).trim()}(?!\\d)`).test(text);
        // Číslo s jednotkou, které už je v popisu („Je dlouhá 47 km“ a fakt Délka 47 km; „1 042 km²“ = „1042 km2“)
        const measure = String(value).trim().match(/^(\d[\d\s\u00a0\u202f]*(?:,\d+)?)\s*([^\d\s].*)?$/u);
        if (measure) {
            const joined = (number) => number.replace(/(\d)[\s\u00a0\u202f]+(?=\d{3}(?!\d))/gu, '$1');
            const number = joined(measure[1].trim());
            const unit = (measure[2] || '').replace(/[^\p{L}]/gu, '');
            const plain = joined(text);
            const after = unit ? `\\s*(?:${unit}(?![\\p{L}])|${unit.slice(0, 1)}\\p{L}*)` : '';
            if ((unit || number.replace(/\D/g, '').length >= 4)
                && new RegExp(`(?<![\\d,])${escapeRegExp(number)}(?![\\d]|,\\d)${after}`, 'iu').test(plain)) return true;
            if (/^[\d\s\u00a0\u202f,]+$/u.test(String(value).trim())) return false;
        }
        const haystack = normalizeAnswer(text);
        const significant = (word) => word.length >= 4 && !/^\d+$/.test(word);
        const textWords = haystack.split(' ').filter(significant);
        const rootsOf = (other) => [other.slice(0, Math.max(3, other.length - 1)), other.replace(/e([^aeiouy])$/, '$1')];
        // Krátké slovo textu jen s příponou skupiny (pes → psovití), jinak by „ps“ našlo i pstruhy
        const shortWords = haystack.split(' ').filter(word => word.length === 3 && /^\p{L}+$/u.test(word));
        const seen = (word) => haystack.includes(stemOf(word))
            || textWords.some(other => word.length <= other.length + 6 && rootsOf(other).some(root => root.length >= 3 && word.startsWith(root)))
            || shortWords.some(other => [other, other.replace(/e([^aeiouy])$/, '$1')].some(root => word.startsWith(`${root}ov`)));
        const wordsSeen = (part) => {
            const words = normalizeAnswer(part).split(' ').filter(significant);
            return words.length > 0 && words.every(seen);
        };
        // Vlastní jméno pozná zakrývací stroj i ve skloňovaném či přídavném tvaru: „J. R. R. Tolkiena“ = John Ronald Reuel
        // Tolkien (podle příjmení), „čínský malíř“ = Čína. Seznam (Mona Lisa, Poslední večeře) je vidět, když jsou vidět všechny
        const marks = (part) => (part.match(/\[\*\*\*\]/g) || []).length;
        const before = marks(text);
        const keySeen = (part) => {
            // Klíč: poslední vlastní jméno (příjmení) a poslední slovo (Spojené státy americké → americký)
            const words = part.split(/\s+/).map(word => word.replace(/[^\p{L}\-]/gu, '')).filter(word => word.length >= 3);
            const proper = words.filter(word => /^\p{Lu}/u.test(word));
            // Poslední slovo jen jako přídavné jméno od jména (americké, britský) – obecné slovo (království) by našlo kdeco
            const last = words[words.length - 1];
            const keys = [...new Set([proper[proper.length - 1], last && /(?:sk|ck)[ýáéí]$/u.test(last) ? last : null].filter(Boolean))];
            return keys.some(key => marks(censorName(text, key)) > before);
        };
        return String(value).split(/,\s+/).every(part => wordsSeen(part) || keySeen(part));
    };
    const dropKnownFacts = (facts, text) => facts.filter(fact => !isFactVisible(fact.value, text));

    // Fakta na konec: čísla z Wikidat v češtině
    const formatNumber = (value) => Number(value).toLocaleString('cs-CZ');
    const formatPopulation = (value) => value >= 1e6
        ? `${(value / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil.`
        : formatNumber(value);
    const formatYear = (value) => value < 0 ? `${-value} př. n. l.` : value < 1000 ? `${value} n. l.` : String(value);
    // formats: [[klíč faktu, popisek, formátovací funkce], …] – chybějící a nulové údaje se vynechají (rok i záporný)
    const formatFacts = (item, formats, yearKeys = ['year']) => {
        const facts = [];
        for (const [key, label, format] of formats) {
            const value = (item.f || {})[key];
            const isMissing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
                || (typeof value === 'number' && value <= 0 && !yearKeys.includes(key));
            if (!isMissing) facts.push({ label, value: format(value) });
        }
        return facts;
    };

    // Šířka výřezu slepé mapy ve stupních: základ podle kategorie, u velkých míst (státy, oceány, velké ostrovy,
    // dlouhé řeky) podle rozlohy nebo délky, ať se vejdou celá i se sousedstvím
    const getMapSpan = (facts, base) => {
        const sizeSpan = Math.max(facts.area ? Math.sqrt(facts.area) / 111 * 6 : 0, facts.len ? facts.len / 111 * 0.8 : 0);
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


    // --- Časová osa (historie, vědci…) ---

    const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
    // Odhad šířky znaku popisku v px (písmo 11 px) a mezera mezi popisky
    const CHAR_WIDTH = 5.6;
    const LABEL_GAP = 8;
    const formatTick = (year) => year < 0 ? `${-year} př. n. l.` : String(year);

    // Rozvržení časové osy na šířku width: dílky s roky, pruhy období, body událostí a nejvýš tři orientační události.
    // anchors = [[rok, text, blízkost]] dodá téma (čím vyšší blízkost, tím větší přednost; světové události 0);
    // nevybere se událost, která by prozradila odpověď (hide = jméno, které se nesmí objevit), ani letopočet hádané položky
    // blind = osa bez letopočtů (nápověda u otázky na století): bez značek let a události bez roků, širší okolí,
    // ať jsou vidět známé události před i po
    const buildTimeline = ({ spans = [], points = [], hide = '', anchors: events = [], blind = false }, width, margin = 24) => {
        const years = [...spans.flatMap(span => [span.from, span.to ?? span.from]), ...points].filter(Number.isFinite);
        const min = Math.min(...years);
        const max = Math.max(...years);
        // Okolí hádaného období: polovina jeho délky na každou stranu, aspoň 40 (bez letopočtů 100) a nejvýš 300 let
        // Osa bez letopočtů širší okolí – ve starověku a raném středověku jsou známé události řidší
        const blindPad = min < -500 ? 300 : min < 1000 ? 200 : 100;
        const pad = Math.min(Math.max((max - min) * 0.5, blind ? blindPad : 40), blind ? Math.max(300, blindPad) : 300);
        const start = min - pad;
        // Do budoucnosti osa nesahá dál než pár let za dnešek
        const end = Math.min(max + pad, Math.max(max + 10, 2030));
        // Značky na kulatých letech uvnitř osy, nejvýš 5
        const tickCount = (step) => Math.floor(end / step) - Math.ceil(start / step) + 1;
        const step = NICE_STEPS.find(candidate => tickCount(candidate) <= 5) || 5000;
        const x = (year) => Math.round(margin + (year - start) / (end - start) * (width - 2 * margin));
        const ticks = [];
        if (!blind) for (let year = Math.ceil(start / step) * step; year <= end; year += step) ticks.push({ x: x(year), year, label: formatTick(year) });
        const bars = spans.map(span => ({ kind: span.kind, x: x(span.from), width: x(span.to ?? span.from + 1) - x(span.from) }));
        const own = new Set(years);
        const candidates = events
            .filter(([year, text]) => year > start && year < end && !own.has(year) && !(hide && censorName(text, hide).includes('[***]')))
            .map(([year, text, near]) => ({ x: x(year), year, label: blind ? text : `${formatTick(year)} ${text}`, near: Number(near) || 0 }));
        // Nejdřív blízké dějiny, z nich ty nejblíž středu hádaného období; každý popisek do jednoho ze dvou řádků tak,
        // aby se s žádným jiným nepřekrýval a nevyčníval z osy (šířku textu odhadneme podle počtu znaků)
        const center = x((min + max) / 2);
        const placed = [];
        for (const anchor of candidates.sort((a, b) => b.near - a.near || Math.abs(a.x - center) - Math.abs(b.x - center))) {
            if (placed.length >= 3) break;
            const textWidth = anchor.label.length * CHAR_WIDTH + 6;
            const align = anchor.x - textWidth / 2 < 4 ? 'start' : anchor.x + textWidth / 2 > width - 4 ? 'end' : 'middle';
            const left = align === 'start' ? anchor.x : align === 'end' ? anchor.x - textWidth : anchor.x - textWidth / 2;
            if (left < 2 || left + textWidth > width - 2) continue;
            const span = [left - LABEL_GAP, left + textWidth + LABEL_GAP];
            // Svislé čárky událostí nesmí splývat
            if (placed.some(other => Math.abs(other.x - anchor.x) < 14)) continue;
            const row = [0, 1].find(r => placed.filter(other => other.row === r).every(other => span[1] <= other.span[0] || span[0] >= other.span[1]));
            if (row === undefined) continue;
            placed.push({ ...anchor, row, align, span });
        }
        const anchors = placed.map(({ near, span, ...anchor }) => anchor);
        return {
            start, end, ticks, bars, points: points.map(year => ({ x: x(year), year })),
            anchors: anchors.sort((a, b) => a.x - b.x)
        };
    };

    // --- Periodická tabulka (chemie) ---

    const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
    // Skupiny prvků podle protonového čísla (polonium patří k ostatním kovům, astat k halogenům)
    const ELEMENT_FAMILIES = [
        ['alkalicke-kovy', 'alkalický kov', [3, 11, 19, 37, 55, 87]],
        ['kovy-alkalickych-zemin', 'kov alkalických zemin', [4, 12, 20, 38, 56, 88]],
        ['lanthanoidy', 'lanthanoid', range(57, 71)],
        ['aktinoidy', 'aktinoid', range(89, 103)],
        ['halogeny', 'halogen', [9, 17, 35, 53, 85, 117]],
        ['vzacne-plyny', 'vzácný plyn', [2, 10, 18, 36, 54, 86, 118]],
        ['polokovy', 'polokov', [5, 14, 32, 33, 51, 52]],
        ['nekovy', 'nekov', [1, 6, 7, 8, 15, 16, 34]],
        ['prechodne-kovy', 'přechodný kov', [...range(21, 30), ...range(39, 48), ...range(72, 80), ...range(104, 112)]],
        ['ostatni-kovy', 'nepřechodný kov', [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116]]
    ];
    const elementFamily = (z) => {
        const family = ELEMENT_FAMILIES.find(([, , list]) => list.includes(z));
        return family ? { key: family[0], label: family[1] } : null;
    };
    // Místo prvku v tabulce s 18 sloupci: perioda, sloupec (= skupina) a řádek na obrázku;
    // lanthanoidy a aktinoidy jsou ve dvou řádcích pod tabulkou (řádek 9 a 10)
    const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118];
    const periodicPosition = (z) => {
        const period = PERIOD_ENDS.findIndex(end => z <= end) + 1;
        if (period < 1) return null;
        const index = z - (period === 1 ? 1 : PERIOD_ENDS[period - 2] + 1);
        if (period === 1) return { period, row: 1, col: z === 1 ? 1 : 18 };
        if (period <= 3) return { period, row: period, col: index < 2 ? index + 1 : index + 11 };
        if (period <= 5) return { period, row: period, col: index + 1 };
        if (index < 2) return { period, row: period, col: index + 1 };
        if (index <= 16) return { period, row: period + 3, col: index + 1, fBlock: true };
        return { period, row: period, col: index - 13 };
    };

    // Století roku: 1346 → 14, 1300 → 13, −44 → −1 (1. století př. n. l.)
    const centuryOf = (year) => year > 0 ? Math.ceil(year / 100) : -Math.ceil(-year / 100) || -1;
    const centuryLabel = (century) => century > 0 ? `${century}. století` : `${-century}. století př. n. l.`;

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

    const buildShareText = ({ appName, topic, dayKey, result, streak, url }) => {
        // Použité nápovědy z dostupných (levelCount = 1 + počet nápověd otázky)
        const levels = `${result.hintLevel - 1}/${(result.levelCount || result.hintLevel) - 1}`;
        const outcome = result.correct
            ? `✅ ${formatPoints(result.points)} · nápovědy ${levels}${result.typed ? ' · napsáno' : ''}`
            : `❌ tentokrát ne · nápovědy ${levels}`;
        return [
            `${appName} · ${topic.emoji} ${topic.title} · ${formatDayKey(dayKey)}`,
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

    // --- Postup hráče: zkušenosti (XP), úrovně, tituly a mistrovství témat ---

    const MAX_LEVEL = 100;
    // Kolik XP je potřeba celkem na každou úroveň. Zpočátku to jde rychle (úroveň 2 po pár otázkách), pak čím dál pomaleji:
    // celkem 330 000 XP na úroveň 100 = asi 15 000 otázek při průměru ~22 XP na otázku. Hodnoty jsou zaokrouhlené
    // (na 10, 50, 100, 500, 1 000 XP podle velikosti), ať se v tabulce dobře čtou.
    const LEVEL_XP_TOTAL = 330000;
    const niceXp = (value) => value < 500 ? Math.round(value / 10) * 10 : value < 2000 ? Math.round(value / 50) * 50
        : value < 10000 ? Math.round(value / 100) * 100 : value < 50000 ? Math.round(value / 500) * 500 : Math.round(value / 1000) * 1000;
    const LEVEL_XP = (() => {
        const linear = 60;
        const quad = (LEVEL_XP_TOTAL - linear * (MAX_LEVEL - 1)) / ((MAX_LEVEL - 1) * (MAX_LEVEL - 1));
        return Array.from({ length: MAX_LEVEL }, (_, index) => index === 0 ? 0 : niceXp(linear * index + quad * index * index));
    })();
    const AVERAGE_XP_PER_QUESTION = 22;
    const xpForLevel = (level) => LEVEL_XP[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
    // Zhruba kolik otázek je třeba odehrát na danou úroveň (podle průměrných XP)
    const questionsForLevel = (level) => Math.round(xpForLevel(level) / AVERAGE_XP_PER_QUESTION);
    const levelFromXp = (xp) => {
        let level = 1;
        while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
        return level;
    };
    // level, XP v této úrovni, XP potřebné na další (0 na nejvyšší úrovni) a poměr 0–1 pro ukazatel
    const levelProgress = (xp) => {
        const level = levelFromXp(xp);
        if (level >= MAX_LEVEL) return { level, into: xp - xpForLevel(level), needed: 0, ratio: 1 };
        const base = xpForLevel(level);
        const needed = xpForLevel(level + 1) - base;
        return { level, into: xp - base, needed, ratio: Math.min(1, (xp - base) / needed) };
    };
    // 31 titulů na 100 úrovní: nový titul zhruba každé 3–4 úrovně
    const LEVEL_TITLES = [
        [1, 'Zvědavec'], [3, 'Čtenář'], [5, 'Posluchač'], [7, 'Učeň'], [9, 'Žák'], [12, 'Student'], [15, 'Zasvěcenec'], [18, 'Znalec'],
        [21, 'Badatel'], [24, 'Zkoumatel'], [27, 'Učenec'], [30, 'Vzdělanec'], [33, 'Erudit'], [36, 'Odborník'], [39, 'Specialista'],
        [42, 'Expert'], [45, 'Mistr'], [48, 'Magistr'], [52, 'Doktor'], [56, 'Docent'], [60, 'Profesor'], [64, 'Akademik'],
        [68, 'Mudrc'], [72, 'Vševěd'], [76, 'Velemistr'], [80, 'Polyhistor'], [84, 'Legenda'], [88, 'Strážce vědění'], [92, 'Orákulum'],
        [96, 'Archimudrc'], [100, 'Mudrlant']
    ].map(([from, title]) => ({ from, title }));
    const titleForLevel = (level) => LEVEL_TITLES.filter(entry => level >= entry.from).pop().title;
    // Další titul (kdy a jaký), null na konci
    const nextTitle = (level) => LEVEL_TITLES.find(entry => entry.from > level) || null;
    // Za odpověď: správná 10 XP a 5 za každý bod (nejvýš 4 body, psaním dvojnásobek), špatná 2 XP za pokus, vzdání nic
    const answerXp = ({ correct, points = 0, gaveUp = false }) => correct ? 10 + 5 * points : gaveUp ? 0 : 2;
    const DAILY_XP = 15;
    const DAILY_ALL_XP = 50;
    const STREAK_XP_CAP = 10;
    // Bonus za správnou dnešní otázku podle série dní (2 XP za den série, nejvýš 10 dní)
    const streakXp = (streak) => 2 * Math.min(Math.max(0, streak), STREAK_XP_CAP);
    // Mistrovství tématu 0–5 hvězdiček podle počtu různých správně poznaných položek
    const MASTERY_STEPS = [5, 20, 60, 150, 300];
    const masteryStars = (known) => MASTERY_STEPS.filter(step => known >= step).length;
    const nextMastery = (known) => MASTERY_STEPS.find(step => known < step) || 0;

    // --- Odznaky: počítadla se ukládají s postupem. Odznak = skupina + stupeň (cíl); kdo splní vyšší stupeň, má i nižší.
    // value(c, x) je aktuální hodnota pro ukazatel „87 / 100“. x = { level, learned, topicStars: { téma: hvězdy }, topicCount } ---
    const EMPTY_COUNTERS = {
        answered: 0, correct: 0, typedCorrect: 0, noHint: 0, hardCorrect: 0, run: 0, bestRun: 0, bestStreak: 0, perfectDays: 0,
        challenges: 0, wins: 0, winRun: 0, bestWinRun: 0, created: 0, perfectChallenges: 0, dailyCorrect: 0, fixed: 0, days: 0, lastDay: '', topics: {}
    };
    const number = (value) => Number.isFinite(value) ? value : 0;
    // Barva medaile podle stupně ve skupině: bronz, stříbro, zlato, vínová a nejvyšší diamantová
    const toneFor = (index, count) => count >= 4 && index === count - 1 ? 'diamond' : count >= 4 && index === count - 2 ? 'brand'
        : index < count / 3 ? 'bronze' : index < count * 2 / 3 ? 'silver' : 'gold';
    const BADGE_GROUPS = [];
    const BADGES = [];
    // tiers: [{ goal, title, id? }]; text(goal) = popis podle cíle
    const addGroup = (id, title, icon, value, text, tiers, extra = {}) => {
        const group = { id, title, icon, badges: [], topic: extra.topic || null };
        tiers.forEach((tier, index) => {
            const badge = {
                id: tier.id || `${id}-${tier.goal}`, group: id, icon, tone: toneFor(index, tiers.length), title: tier.title, text: text(tier.goal),
                goal: tier.goal, value: (c, x) => number(value(c, x)), topic: extra.topic || null
            };
            badge.test = (c, x) => badge.value(c, x) >= badge.goal;
            group.badges.push(badge);
            BADGES.push(badge);
        });
        BADGE_GROUPS.push(group);
    };
    const T = (goal, title, id) => ({ goal, title, id });
    addGroup('odpovedi', 'Správné odpovědi', 'target', (c) => c.correct, (g) => `${g} správných odpovědí.`,
        [T(1, 'První krok', 'prvni-krok'), T(10, 'Rozjezd'), T(50, 'Pětapadesátka'), T(100, 'Stovka', 'stovka'), T(250, 'Čtvrt tisíce'), T(500, 'Pětistovka'),
            T(1000, 'Tisícovka', 'tisicovka'), T(2500, 'Dva a půl tisíce'), T(5000, 'Pět tisíc'), T(10000, 'Deset tisíc')]);
    addGroup('rada', 'Správně v řadě', 'zap', (c) => c.bestRun, (g) => `${g} správných odpovědí v řadě.`,
        [T(5, 'Rozcvička'), T(10, 'Střelec', 'strelec'), T(25, 'Neomylný', 'neomylny'), T(50, 'Bez chyby'), T(100, 'Stroj')]);
    addGroup('serie', 'Série dní', 'flame', (c) => c.bestStreak, (g) => `Série ${g} dní dnešních otázek.`,
        [T(3, 'Tři dny'), T(7, 'Týden s Mudrlantem', 'tyden'), T(14, 'Dva týdny'), T(30, 'Věrný měsíc', 'mesic'), T(60, 'Dva měsíce'), T(100, 'Stovka dní'), T(200, 'Dvě stě dní'), T(365, 'Celý rok')]);
    addGroup('dny', 'Dny ve hře', 'calendar-check', (c) => c.days, (g) => `Hrál jsi ${g} různých dní.`,
        [T(5, 'Stálý host'), T(15, 'Pravidelný'), T(30, 'Měsíc ve hře'), T(60, 'Ostřílený'), T(100, 'Sto her'), T(200, 'Veterán'), T(365, 'Rok s Mudrlantem')]);
    addGroup('dokonale', 'Dokonalé dny', 'sun', (c) => c.perfectDays, (g) => g === 1 ? 'Všechny dnešní otázky v jednom dni.' : `${g}× všechny dnešní otázky v jednom dni.`,
        [T(1, 'Dokonalý den', 'dokonaly-den'), T(3, 'Trojka dokonalých'), T(7, 'Týden dokonalosti'), T(14, 'Dva týdny dokonalosti'), T(30, 'Mistr dne')]);
    addGroup('dnes', 'Dnešní otázky', 'calendar-days', (c) => c.dailyCorrect, (g) => `${g} správných dnešních otázek.`,
        [T(10, 'Denní rutina'), T(50, 'Padesát dnů'), T(100, 'Sto dnešních'), T(250, 'Čtvrt tisíce dnešních')]);
    addGroup('bez-napovedy', 'Bez nápovědy', 'eye-off', (c) => c.noHint, (g) => `${g} správných odpovědí bez jediné nápovědy.`,
        [T(10, 'Čistá hlava'), T(25, 'Bez nápovědy', 'bez-napovedy'), T(100, 'Sebejistý'), T(500, 'Neprůstřelný')]);
    addGroup('psani', 'Psaní odpovědí', 'keyboard', (c) => c.typedCorrect, (g) => `${g} správných odpovědí napsaných ručně.`,
        [T(10, 'Písmák'), T(25, 'Pisatel', 'pisatel'), T(100, 'Mistr pera'), T(500, 'Kaligraf')]);
    addGroup('tezke', 'Těžké otázky', 'pickaxe', (c) => c.hardCorrect, (g) => `${g} správných u těžších, méně známých otázek.`,
        [T(10, 'Do hloubky', 'do-hloubky'), T(50, 'Hlubinný průzkum'), T(200, 'Král hlubin')]);
    addGroup('chyby', 'Opravené chyby', 'repeat', (c) => c.fixed, (g) => `Opravil jsi ${g} dřívějších chyb.`,
        [T(10, 'Poučený'), T(50, 'Pracant na sobě'), T(200, 'Z chyb se člověk učí')]);
    addGroup('vyzvy', 'Výzvy', 'swords', (c) => c.challenges, (g) => g === 1 ? 'Dohraj první výzvu.' : `Dohraj ${g} výzev.`,
        [T(1, 'Soupeř', 'soupere'), T(5, 'Pravidelný soupeř'), T(25, 'Zkušený bojovník'), T(100, 'Stovka výzev')]);
    addGroup('vyhry', 'Výhry ve výzvách', 'trophy', (c) => c.wins, (g) => g === 1 ? 'Vyhraj výzvu proti jinému hráči.' : `Vyhraj ${g} výzev.`,
        [T(1, 'Vítěz', 'vitez'), T(5, 'Pětkrát nejlepší'), T(10, 'Gladiátor', 'gladiator'), T(25, 'Šampion'), T(50, 'Dobyvatel'), T(100, 'Nepřemožitelný')]);
    addGroup('vyhry-v-rade', 'Výhry v řadě', 'crown', (c) => c.bestWinRun, (g) => `${g} výher ve výzvách v řadě.`,
        [T(3, 'Hattrick'), T(5, 'Pětka v řadě'), T(10, 'Neporazitelný')]);
    addGroup('zalozene', 'Založené výzvy', 'users', (c) => c.created, (g) => `Založ ${g} ${g === 1 ? 'výzvu' : g < 5 ? 'výzvy' : 'výzev'}.`,
        [T(1, 'Vyzyvatel'), T(10, 'Organizátor'), T(50, 'Pán turnajů')]);
    addGroup('perfektni-vyzvy', 'Dokonalé výzvy', 'star', (c) => c.perfectChallenges, (g) => g === 1 ? 'Všechny otázky ve výzvě správně.' : `${g}× všechny otázky ve výzvě správně.`,
        [T(1, 'Bezchybný'), T(5, 'Pětkrát bezchybný'), T(25, 'Dokonalost sama')]);
    addGroup('uroven', 'Úrovně', 'graduation-cap', (c, x) => x.level, (g) => `Dosáhni úrovně ${g}.`,
        [T(5, 'Úroveň 5'), T(10, 'Úroveň 10', 'znalec'), T(20, 'Úroveň 20'), T(35, 'Úroveň 35', 'mudrc'), T(50, 'Úroveň 50'), T(65, 'Úroveň 65'), T(80, 'Úroveň 80'), T(100, 'Úroveň 100')]);
    addGroup('poznane', 'Poznané položky', 'book-open', (c, x) => x.learned, (g) => `Poznal jsi ${g} různých položek.`,
        [T(100, 'Sto poznaných'), T(500, 'Pět set poznaných'), T(1000, 'Tisíc poznaných'), T(3000, 'Tři tisíce poznaných')]);
    // Všestrannost: tři hvězdy / pět hvězd mistrovství v nějakém tématu, ve všech tématech
    addGroup('vsestrannost', 'Všestrannost', 'globe', (c) => Object.keys(c.topics || {}).length, (g, x) => `Správná odpověď ve všech ${g} tématech.`,
        [T(14, 'Všestranný', 'vsestranny')]);
    addGroup('hvezdy', 'Hvězdy mistrovství', 'star', (c, x) => Math.max(0, ...Object.values(x.topicStars || {})), (g) => `${g} hvězdy mistrovství v některém tématu.`,
        [T(3, 'Hvězdář', 'hvezdar'), T(5, 'Mistr oboru', 'mistr-oboru')]);
    addGroup('vsechna-temata', 'Mistr všech témat', 'crown', (c, x) => { const stars = Object.values(x.topicStars || {}); return x.topicCount && stars.length >= x.topicCount ? Math.min(...stars) : 0; }, (g) => `${g} hvězdy mistrovství ve všech tématech.`,
        [T(1, 'Všude začátečník'), T(3, 'Všude hvězdář'), T(5, 'Mistr všeho')]);
    // Za každé téma tři stupně podle počtu správných odpovědí v něm (medaile má ilustraci tématu)
    const TOPIC_BADGES = [
        ['zemepis', 'Zeměpis', ['Poutník', 'Cestovatel', 'Objevitel']], ['vlajky', 'Vlajky a znaky', ['Praporečník', 'Vlajkonoš', 'Heraldik']],
        ['historie', 'Historie', ['Kronikář', 'Dějepisec', 'Pán času']], ['mytologie', 'Mytologie', ['Pověrčivý', 'Bájeslovec', 'Zasvěcenec']],
        ['biologie', 'Biologie', ['Přírodovědec', 'Biolog', 'Pán přírody']], ['geologie', 'Geologie', ['Sběratel', 'Geolog', 'Pán kamenů']],
        ['chemie', 'Chemie', ['Laborant', 'Chemik', 'Alchymista']], ['fyzika', 'Fyzika', ['Experimentátor', 'Fyzik', 'Pán energie']],
        ['umeni', 'Výtvarné umění', ['Divák galerie', 'Znalec umění', 'Mecenáš']], ['architektura', 'Architektura', ['Stavitel', 'Architekt', 'Pán katedrál']],
        ['hudba', 'Hudba', ['Posluchač', 'Hudebník', 'Mistr tónů']], ['literatura', 'Literatura', ['Čtenář', 'Knihomol', 'Literát']],
        ['film', 'Film', ['Divák', 'Filmař', 'Režisér']], ['sport', 'Sport', ['Fanoušek', 'Sportovec', 'Šampion sportu']]
    ];
    TOPIC_BADGES.forEach(([topic, label, names]) => addGroup(`tema-${topic}`, label, 'medal', (c) => (c.topics || {})[topic] || 0,
        (g) => `${g} správných odpovědí v tématu ${label}.`, [T(25, names[0]), T(100, names[1]), T(300, names[2])], { topic }));
    const BADGE_BY_ID = Object.fromEntries(BADGES.map(badge => [badge.id, badge]));
    const normalizeCounters = (counters) => ({ ...EMPTY_COUNTERS, ...(counters || {}), topics: { ...((counters && counters.topics) || {}) } });
    // Odznaky, které podle počítadel a postupu hráč splnil (ids), v pořadí definice
    const earnedBadgeIds = (counters, x) => {
        const c = normalizeCounters(counters);
        return BADGES.filter(badge => badge.test(c, x)).map(badge => badge.id);
    };
    // Do účtu se ukládá jen nejvyšší získaný stupeň každé skupiny (méně dat); po načtení se nižší stupně dopočítají
    const compactBadges = (ids) => {
        const have = new Set(ids);
        return BADGE_GROUPS.flatMap(group => { const owned = group.badges.filter(badge => have.has(badge.id)); return owned.length ? [owned[owned.length - 1].id] : []; });
    };
    const expandBadges = (ids) => {
        const have = new Set(ids);
        const result = new Set();
        BADGE_GROUPS.forEach(group => {
            const top = group.badges.map(badge => badge.id).reduce((index, id, i) => have.has(id) ? i : index, -1);
            for (let i = 0; i <= top; i++) result.add(group.badges[i].id);
        });
        return [...result];
    };

    return {
        EMPTY_COUNTERS, BADGES, BADGE_GROUPS, BADGE_BY_ID, earnedBadgeIds, compactBadges, expandBadges, normalizeCounters,
        MAX_LEVEL, LEVEL_XP, questionsForLevel, xpForLevel, levelFromXp, levelProgress, LEVEL_TITLES, titleForLevel, nextTitle, answerXp, DAILY_XP, DAILY_ALL_XP, streakXp, MASTERY_STEPS, masteryStars, nextMastery,
        UNKNOWN_COUNTRY, INTERNATIONAL_WATERS, CZECHIA_QID, AFTER_SYMBOL_WORD, TILE_SIZE, COUNTRIES, CONTINENT_NAMES,
        SATELLITE_TILES, OSM_TILES,
        escapeHtml, stripBrackets, isRealPhoto, commonsPhotoUrl, commonsFileUrl, displayName, plural, formatPoints,
        getDayKey, shiftDayKey, formatDayKey, createSeededRandom, pickRandom, shuffle,
        ELEMENT_FAMILIES, elementFamily, periodicPosition,
        setCountries, landOf, cultureScore, getWordStems, censorName, mergeCensored, censorCountry, isKnownCountry, processWikiText, stripFactSentences, takeLeadFacts, normalizeAnswer, levenshtein, isAnswerMatch, isSymbolMatch, isCenturyMatch, isFormulaMatch, formulaCounts, checkAnswer,
        inCollection, filterItems, pickItem, sortItems, getCountryNames, getContinent, continentAt, getCountryAliases,
        distanceKm, nearness, STATE_STEPS, sharesGroup, eraNearness, personSimilarity, rankBySimilarity, takeDistinct,
        buildItemChoices, buildCountryChoices, findAnswerItem, findAnswerCountry, updateMistakes, nameAnswers, countryAnswers,
        pointsFor, dropKnownFacts, isFactVisible, formatNumber, formatPopulation, formatYear, formatFacts, getMapSpan, buildBlindMap,
        buildTimeline, centuryOf, centuryLabel, computeStreak, buildShareText, getTileLayout
    };
});
