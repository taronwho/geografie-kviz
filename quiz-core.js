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
    // Vážený los (jedno volání rng): váha 1 všem = totéž jako pickRandom; nekladné nebo chybné váhy se berou jako 1
    const pickWeighted = (items, weightOf, rng) => {
        const weights = items.map(item => { const weight = Number(weightOf(item)); return Number.isFinite(weight) && weight > 0 ? weight : 1; });
        let target = rng() * weights.reduce((sum, weight) => sum + weight, 0);
        for (let i = 0; i < items.length; i++) { target -= weights[i]; if (target < 0) return items[i]; }
        return items[items.length - 1];
    };
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
        // Zápolský → Zápolští, Nasavská → Nasavští, Německý → Němečtí: množné číslo rodu na -ský/-cký mění sk → št, ck → čt
        if (word.length >= 6 && /[sc]k[ýáé]$/iu.test(word)) stems.add(`${word.slice(0, -3)}${/c/iu.test(word.slice(-3, -2)) ? 'čt' : 'št'}`);
        // Přemyslovna → Přemyslovci (rod), Meitnerová → Meitner (příjmení bez ženské přípony)
        if (word.length >= 8 && /ovna$/iu.test(word)) stems.add(word.slice(0, -2));
        if (word.length >= 7 && /ová$/iu.test(word)) stems.add(word.slice(0, -3));
        (SPECIAL_STEMS[word.toLowerCase()] || []).forEach(stem => stems.add(stem));
        // Litva → litevský, Moldava → moldavský: souhláska + va se v přídavném jménu rozšíří na -ev- (Litev…)
        if (word.length >= 4 && /[^aeiouyáéěíóúůý]va$/iu.test(word)) stems.add(`${word.slice(0, -2)}ev`);
        // Krátké jméno zakončené samohláskou (Frey, Búri, Peru) se skloňuje od celého slova: Freyem, Búriho, Peruánec
        if (word.length >= 4 && word.length <= 5 && /^\p{Lu}/u.test(word) && /[aeiouyáéěíóúůý]$/iu.test(word) && word.replace(/[aeiouyáéěíóúůý]+$/iu, '').length < 4) stems.add(word);
        // Přídavné jméno od podstatného: stříbrný → stříbr(a), dusičná → dusič(nan); podstatné na -ec/-ek: vápenec → vápen(atý),
        // prachovec → prachov(á), pazourek → pazour(ový). Jen delší slova a kmen aspoň o pěti písmenech, ať se nezakrývají běžná slova.
        if (word.length >= 7 && /[^aeiouyáéíóúůýě]n[ýáé]$/iu.test(word)) stems.add(word.slice(0, -2));
        if (word.length >= 7 && /[^aeiouyáéíóúůýě](?:ec|ek)$/iu.test(word) && !/(?:ec|ek)$/u.test(word.slice(0, -2))) stems.add(word.slice(0, -2));
        // Řecká jména na -os/-us se skloňují od kmene s -ov-: Fobos → Fobovi, Fobovým
        if (word.length >= 5 && word.length <= 8 && /^\p{Lu}.*(?:os|us)$/u.test(word)) { stems.add(`${word.slice(0, -2)}ov`); stems.add(word.slice(0, -2)); }
        // Latinské a řecké koncovky: Carcharodontosaurus → Carcharodontosauridae, Aepyceros → Aepycerotinae, Hippolytos → Hippolyta
        if (word.length >= 8 && /(?:us|um|os|is)$/iu.test(word)) stems.add(word.slice(0, -2));
        // Přídavná jména od míst (kubánský → Kuba, mexický → Mexiko, kanadský → Kanada, africký → Afrika)
        // i velkým písmenem na začátku názvu (Malajský poloostrov → Malajsie, Bavorský → Bavorsko), jen s kmenem aspoň 4 písmena
        const place = word.length >= 7 && word.match(/^(.{3,}?)(?:ánsk|ansk|ijsk|sk)[ýáéí]$|^(.{3,}c)k[ýáéí]$/u);
        if (place && (/^\p{Ll}/u.test(word) || (place[1] || place[2]).length >= 4)) {
            stems.add(place[1] || place[2]);
            if (place[2]) stems.add(place[2].slice(0, -1) + 'k');
        }
        for (const stem of [...stems]) {
            for (const [pattern, replacement] of STEM_ALTERNATIONS) {
                if (pattern.test(stem)) stems.add(stem.replace(pattern, replacement));
            }
            // c → č v odvozeném přídavném jménu (cykloadice → cykloadiční, substituce → substituční), jen u delších slov na -ce
            if (word.length >= 7 && /ce$/iu.test(word) && /c$/iu.test(stem)) stems.add(`${stem.slice(0, -1)}č`);
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
    // Delší kmen se najde i s jinou čárkou nebo háčkem v samohlásce: Babylonie × Babylón, Valentinianus × valentiniánská
    const VOWEL_VARIANTS = { a: 'aáà', e: 'eéěè', i: 'iíì', o: 'oóô', u: 'uúůù', y: 'yý' };
    const accentTolerant = (stem) => [...stem].map(letter => {
        const base = letter.normalize('NFD')[0].toLowerCase();
        return VOWEL_VARIANTS[base] && !/[ăâîôûäöü]/iu.test(letter) ? `[${VOWEL_VARIANTS[base]}]` : escapeRegExp(letter);
    }).join('');
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
                parts.push((stem.length >= 6 ? accentTolerant(stem) : escapeRegExp(stem)) + (stem.length >= 4 ? '\\p{L}*' : SHORT_STEM_ENDINGS));
                if (FOREIGN_DIACRITICS.test(stem)) parts.push(escapeRegExp(withoutDiacritics(stem)) + (stem.length >= 4 ? '\\p{L}*' : SHORT_STEM_ENDINGS));
            }
        }
        if (parts.length === 0) return null;
        return new RegExp(NOT_LETTER_BEFORE + COMPOUND_PREFIX + '(?:' + parts.join('|') + ')' + NOT_LETTER_AFTER, 'giu');
    };

    // Zkratky (USA, ČR, ČLR) jen jako celé slovo a s velkými písmeny, ať nezakryjí běžná slova
    const isAbbreviation = (word) => /^\p{Lu}{2,4}$/u.test(word);

    const censorWords = (text, phrase) => {
        // Dvojtečka, středník a uvozovky ve slovech neruší (Pán prstenů: Návrat krále – „prstenů:“ jinak kmen nenajde)
        const words = stripBrackets(phrase).trim().split(/[\s,\-–:;!?„“”"…\/]+/).filter(Boolean);
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

    // Zakrytí nesmí prozradit tvar odpovědi. Slova, která v názvu jen spojují jeho části (Liška a pes, Obrazce na planině Nazca,
    // Pán prstenů: Návrat krále, Cesta do fantazie), mezi dvěma zakrytými místy by ho ukázala: „[***] a [***]“ má mezi
    // možnostmi jen jedna odpověď tvaru „X a Y“. Zakrytá místa oddělená jen takovými slovy, mezerami a interpunkcí uvnitř
    // věty (pomlčka, dvojtečka, čárka) se proto slijí do jednoho bloku – blok zakrývá celý výskyt jména.
    const JOINING_WORDS = ['a', 'i', 'o', 'u', 'v', 've', 'z', 'ze', 's', 'se', 'k', 'ke', 'na', 'do', 'od', 'po', 'pro', 'při', 'za', 'nad', 'pod', 'před',
        'mezi', 'bez', 'aneb', 'čili', 'nebo', 'of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'de', 'del', 'della', 'di', 'da', 'du', 'des', 'la', 'le', 'les',
        'el', 'al', 'y', 'e', 'et', 'und', 'der', 'die', 'das', 'den', 'dem', 'von', 'van', 'zu', 'am', 'an', 'im', 'auf', 'en', 'och', 'og'];
    const JOIN_UNIT = `(?:[\\s\\-–—:,&'’+/]|(?<![\\p{L}\\p{N}])(?:${JOINING_WORDS.join('|')})(?![\\p{L}\\p{N}]))`;
    const JOINED_MARKS = new RegExp(`\\[\\*\\*\\*\\]${JOIN_UNIT}*\\[\\*\\*\\*\\]`, 'giu');
    // Sousední zakrytá slova jako jeden blok – podle počtu [***] by šlo poznat, z kolika slov se odpověď skládá
    // Iniciály těsně před zakrytým jménem (C. S. [***], J. R. R. [***]) by jméno prozradily – patří k němu
    const mergeCensored = (text) => {
        let result = String(text ?? '')
            .replace(/(?<![\p{L}\d])(?:\p{Lu}\.\s?){1,4}(?=\[\*\*\*\])/gu, '')
            // Saint, Sankt, San, St. těsně před zakrytým jménem (Saint [***] u St. Louis) je jeho součást
            .replace(/(?<![\p{L}\d])(?:Saint|Sankt|Santa|Santo|San|São|St\.|Sv\.)[\s\-–]+(?=\[\*\*\*\])/gu, '');
        for (let previous = ''; previous !== result;) {
            previous = result;
            result = result.replace(JOINED_MARKS, '[***]');
        }
        return result;
    };

    const censorName = (text, name) => {
        // Po vypuštěné závorce nezůstane „ ,“ ani „,,“
        const res = stripBrackets(text).replace(/\s{2,}/g, ' ').replace(/\s+(?=[,.;:])/g, '').replace(/([,;])[,;]+/g, '$1');
        return mergeCensored(censorWords(res, name));
    };

    const NATIONALITY_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:americk|rusk|německ|francouzsk|italsk|japonsk|čínsk|kanadsk|australsk|britsk)\\p{L}*', 'giu');
    const CONTINENT_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:Evrop(?:a|y|ě|u|ou)|Asi(?:e|i|í)|Afri(?:ka|ky|ce|ku|kou)|Ameri(?:ka|ky|ce|ku|kou)|Austráli(?:e|i|í)|Antarktid(?:a|y|ě|u|ou)|Oceáni(?:e|i|í)|(?:evropsk|asijsk|africk|australsk|antarktick)\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const CZECH_PATTERN = new RegExp(NOT_LETTER_BEFORE + '(?:v Česku|v České republice|v ČR|na Moravě|ve Slezsku|v Čechách|česk\\p{L}*|moravsk\\p{L}*|slezsk\\p{L}*)' + NOT_LETTER_AFTER, 'giu');
    const REGION_PATTERN = /(?:v okrese|v provincii|ve státě|v regionu|v kraji|na kontinentu|v americkém státě|na ostrově|v pohoří|ve spolkové zemi|v departementu|v prefektuře|v kantonu|v župě|ve vojvodství|v hrabství|v oblasti|v autonomní oblasti|v distriktu|v gubernii|v emirátu) \p{Lu}[\p{Ll}-]+(?: \p{Lu}[\p{Ll}-]+)*/gu;
    // Víceslovný název regionu celý (ve státě New York, v kraji Grand Est), jinak by zbylo „[***] York“
    // Region přídavným jménem: v Jihomoravském kraji, ve Středočeském kraji, v Plzeňském regionu
    const REGION_ADJECTIVE_PATTERN = /(?<![\p{L}\p{N}])(?:v|ve) \p{Lu}\p{Ll}+(?:ém|ím) (?:kraji|okrese|regionu|vojvodství|kantonu|departementu|hrabství)(?![\p{L}\p{N}])/gu;

    // Místo hned po slově „značka“ (značka N, se značkou m, značí se A) – tam se zakryje i jednopísmenná značka
    // i hned za názvem na začátku úvodu („Watt, W je jednotka výkonu“ – závorka se značkou z úvodu vypadla jen napůl)
    const AFTER_SYMBOL_WORD = '(?:(?:[Zz]načk\\p{L}*|[Ss]ymbol\\p{L}*|[Zz]kratk\\p{L}*|[Zz]načí se|[Oo]značuje se|[Oo]značení)\\s*:?\\s+|^\\p{Lu}[\\p{L}\\-]*,\\s*)';

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

    // Podíl zakrytých míst ve slovech textu: věta jako „[***] práci konanou [***] silou“ (zakryté víc než ~30 %) nedává smysl
    const MAX_CENSORED_SHARE = 0.3;
    const countRealWords = (text) => String(text || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word)).length;
    const censoredShare = (text) => {
        const marks = (String(text || '').match(/\[\*\*\*\]/g) || []).length;
        const total = marks + countRealWords(text);
        return total ? marks / total : 0;
    };
    // Popis, jehož zakrytá verze je skoro samá mezera, nahradí následující věty úvodu, které se zakrývají méně
    // (a mají aspoň minWords skutečných slov); přeskočená věta i použité věty z dalších vět zmizí.
    // censor = zakrytí textu tak, jak ho uvidí hráč; startOk = smí věta začínat popis (ne „Jeho…“, „Ten…“)?
    const splitSentences = (text) => String(text || '').split(/(?<=[.!?])\s+(?=\p{Lu}|\d)/u).filter(Boolean);
    // Kolik slov psaných malým písmenem ze zadání zakrytí odstranilo (běžné slovo v názvu, např. „práci“ a „silou“ u Mechanické práce);
    // zakrytý výčet jmen (Marie Salomea [***], rozená [***]) smysl neztrácí, běžná slova ano
    const maskedCommonWords = (original, censored) => {
        const lowercase = (text) => (String(text).match(/(?<![\p{L}\p{N}])\p{Ll}[\p{L}\p{N}'’]*/gu) || []).map(normalizeAnswer);
        const left = new Map();
        for (const word of lowercase(censored)) left.set(word, (left.get(word) || 0) + 1);
        return lowercase(original).filter(word => (left.get(word) || 0) > 0 ? (left.set(word, left.get(word) - 1), false) : true).length;
    };
    const isNonsense = (original, censored, maxShare) => censoredShare(censored) > maxShare && maskedCommonWords(original, censored) >= 1;
    const chooseDescription = (description, more, censor, { maxShare = MAX_CENSORED_SHARE, minWords = 14, startOk = () => true } = {}) => {
        if (!description || !more || !isNonsense(description, censor(description), maxShare)) return { description, more };
        const sentences = splitSentences(`${description} ${more}`);
        for (let start = 1; start < sentences.length; start++) {
            if (!startOk(sentences[start])) continue;
            for (let end = start + 1; end <= Math.min(sentences.length, start + 3); end++) {
                const window = sentences.slice(start, end).join(' ');
                const censored = censor(window);
                if (!isNonsense(window, censored, maxShare) && censoredShare(censored) <= maxShare && countRealWords(censored) >= minWords) {
                    return { description: window, more: sentences.slice(end).join(' ') };
                }
            }
        }
        return { description, more };
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
    // Vzdálenost pro psanou odpověď: jako levenshtein, ale dvě přehozená sousední písmena (Kundear – Kundera) jsou jeden překlep
    const typoDistance = (a, b) => {
        if (a === b) return 0;
        const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
        for (let i = 1; i <= a.length; i++) {
            const row = [i];
            for (let j = 1; j <= b.length; j++) {
                row[j] = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
            }
            rows.push(row);
        }
        return rows[a.length][b.length];
    };

    // Překlep se toleruje po slovech (v delším slově jeden, v dlouhém dva); čísla a římské číslice musí sedět přesně,
    // jinak by „Ludvík XV.“ prošel za Ludvíka XIV. a „15. století“ za 14.
    const isExactToken = (word) => /\d/.test(word) || /^[ivxlcdm]+$/.test(word);
    const wordTolerance = (word) => isExactToken(word) || word.length <= 4 ? 0 : word.length <= 8 ? 1 : 2;
    // Římské číslice (Karel IV., Ludvík XIV.) a řadové číslovky (První světová válka) lze napsat i číslem: Karel 4, 1. světová válka.
    // Obě strany se převedou na arabská čísla a porovnají se i tak.
    const ROMAN_PATTERN = /^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})$/;
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
    const ORDINAL_WORDS = [[/^prvni$/, 1], [/^druh[yae]$/, 2], [/^treti$/, 3], [/^ctvrt[yae]$/, 4], [/^pat[yae]$/, 5], [/^sest[yae]$/, 6],
        [/^sedm[yae]$/, 7], [/^osm[yae]$/, 8], [/^devat[yae]$/, 9], [/^desat[yae]$/, 10]];
    const withArabicNumbers = (text) => normalizeAnswer(String(text ?? '').replace(/(?<![\p{L}\d])([IVXivx]+)\.?(?![\p{L}\d])/gu,
        (match, roman) => (roman.length > 1 || roman === roman.toUpperCase()) && ROMAN_PATTERN.test(roman.toUpperCase()) ? String(romanToNumber(roman.toLowerCase())) : match))
        .split(' ').map(word => { const ordinal = ORDINAL_WORDS.find(([pattern]) => pattern.test(word)); return ordinal ? String(ordinal[1]) : word; }).join(' ');
    // Slova v libovolném pořadí (Hus Jan = Jan Hus): každé slovo očekávané odpovědi najde vlastní slovo zadané odpovědi
    const matchesAnyOrder = (givenWords, words) => {
        if (givenWords.length !== words.length || words.length < 2 || words.length > 6) return false;
        const free = [...givenWords];
        // Napřed přesné shody, potom ty s překlepem – jinak by překlep „ukradl“ cizí slovo
        const rest = words.filter(word => { const i = free.indexOf(word); if (i < 0) return true; free.splice(i, 1); return false; });
        return rest.every(word => { const i = free.findIndex(other => typoDistance(other, word) <= wordTolerance(word)); if (i < 0) return false; free.splice(i, 1); return true; });
    };
    const matchesOne = (given, expected) => {
        if (!given || !expected) return false;
        if (given === expected) return true;
        const givenWords = given.split(' ');
        const words = expected.split(' ');
        if (words.length === givenWords.length) {
            if (words.every((word, i) => typoDistance(givenWords[i], word) <= wordTolerance(word))) return true;
            if (matchesAnyOrder(givenWords, words)) return true;
        }
        // Chybějící nebo přebývající mezera („Jan Hus“ – „Janhus“) u slov bez čísel
        return words.length !== givenWords.length && !words.some(isExactToken)
            && typoDistance(given.replace(/ /g, ''), expected.replace(/ /g, '')) <= Math.min(wordTolerance(expected.replace(/ /g, '')), 1);
    };
    const isAnswerMatch = (input, acceptedAnswers) => {
        const given = normalizeAnswer(input);
        if (!given) return false;
        const givenForms = [...new Set([given, withArabicNumbers(input)])];
        return acceptedAnswers.some(answer => {
            const expected = normalizeAnswer(answer);
            if (!expected) return false;
            const expectedForms = [...new Set([expected, withArabicNumbers(answer)])];
            return givenForms.some(form => expectedForms.some(other => matchesOne(form, other)));
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

    // --- Ochrana před prozrazením odpovědi ---
    // Zakrytí názvu (censorName) zná skloňování a odvozená přídavná jména, ne však všechno: skloněné krátké příjmení (Poea),
    // přepisy jmen (Beneš = Beneș = Benesch), rodná jména a další tvary jména přímo v textu. Proto text po zakrytí projde ještě
    // jednou jedinou společnou funkcí (maskLeaks): každé slovo, které se tvarem podobá některému slovu odpovědi (po odstranění
    // diakritiky a sjednocení přepisů), se zakryje. Používají ji všechna témata a všechny druhy otázek – popis, další věty
    // úvodu i fakta v nápovědách – a to s odpovědí otázky, ne jen s názvem položky (u „Kdo to napsal?“ se zakrývá autor).

    const FOLD_LETTERS = { æ: 'ae', œ: 'oe', ø: 'o', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h' };
    // Slovo bez diakritiky a velikosti písmen, s přepisy hlásek, které se v jménech střídají: Beneš = Beneș = Benes = Benesch,
    // Čajkovskij = Tchaikovsky, Dvořák = Dvorak, Schönberg = Schoenberg, Wagner = Vagner
    const foldPlain = (word) => word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[æœøßłđðþıħ]/g, letter => FOLD_LETTERS[letter]);
    const phonetic = (folded) => folded
        .replace(/tsch|tch|cz|cs/g, 'c').replace(/sch|sh|sz/g, 's').replace(/zh/g, 'z').replace(/ph/g, 'f').replace(/ck/g, 'k')
        .replace(/w/g, 'v').replace(/[yj]/g, 'i').replace(/(.)\1+/g, '$1');
    const foldKeys = (word) => {
        const plain = foldPlain(word);
        const keys = new Set([phonetic(plain)]);
        // Německý přepis přehlásky po souhlásce: Mueller = Müller (ale Poe zůstane Poe)
        const collapsed = plain.replace(/(?<=[^aeiouy])(oe|ue|ae)/g, match => match[0]);
        if (collapsed !== plain && collapsed.length >= 4) keys.add(phonetic(collapsed));
        return [...keys];
    };
    // Krátké jméno (Poe, Li, Pú) se skloňuje i tvoří přivlastňovací tvary: Poea, Poeovi, Poeova, Poeovský
    const SHORT_NAME_TAIL = /^(?:[aeiouy]|em|ou|um|uv|ovi|ove|ova|ovy|ovu|ovo|ovym|ovou|ovych|ovsky|ovska|ovske)?$/;
    const commonPrefixLength = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
    // Souvisí slovo textu (a) se slovem odpovědi (t)? Obojí už je ve složené podobě foldKeys.
    // capital = slovo textu je velkým písmenem, proper = slovo odpovědi je vlastní jméno (velké písmeno): obecná slova odpovědi
    // (architektura, domácí) se hledají jen v téže podobě, ne podle kmene – jinak by se zakryla příbuzná slova (architekti)
    const keysRelated = (a, t, capital, proper) => {
        if (a === t) return true;
        if (!proper) return false;
        // Tři písmena a méně: jen jako jméno velkým písmenem a s běžnou koncovkou, ať se nezakryjí běžná slova
        if (t.length <= 3) return capital && a.length > t.length && a.startsWith(t) && SHORT_NAME_TAIL.test(a.slice(t.length));
        if (a.length < 3) return false;
        const shorter = Math.min(a.length, t.length);
        // Společný kmen (skloňování, přivlastňování, odvozená slova): Kafka – Kafkovi, Beneš – Benešova; slovo textu nejvýš o tři
        // písmena kratší než slovo odpovědi (Antimonit – antimon), jinak by jméno zakrylo i své základní slovo (Pepřovník – pepř)
        const common = commonPrefixLength(a, t);
        if (common >= 4 && common >= shorter * 0.7 && t.length - a.length <= 3) return true;
        // Jiný zápis nebo překlep: o jedno písmeno u pěti a víc, o dvě u osmi a víc
        const limit = shorter >= 8 ? 2 : shorter >= 5 ? 1 : 0;
        return limit > 0 && levenshtein(a, t) <= limit;
    };

    // Slova odpovědi, podle kterých se hledá (jen taková, která jméno opravdu prozradí): bez předložek, členů, římských číslic
    // a obecných slov názvu (park, řeka, bitva – isGeneric), ta ve větě zůstávají
    const answerTokens = (names, isGeneric = () => false) => {
        const tokens = new Map();
        for (const name of names) {
            const words = stripBrackets(String(name || '')).split(/[^\p{L}\p{M}]+/u).filter(Boolean);
            const specific = words.filter(word => !isGeneric(word));
            for (const word of (specific.length ? specific : words)) {
                if (CENSOR_SKIP_WORDS.has(word.toLowerCase()) || isRomanNumeral(word)) continue;
                // Malé slovo ve víceslovném názvu (hudební romantismus, Jahodník obecný) je jen přívlastek: zakrývá ho případně až zakrytí názvu,
                // tady by zbytečně rušilo běžný text; jednoslovný název malým písmenem (romantismus, secesní) se hledá celý
                if (words.length > 1 && !/^\p{Lu}/u.test(word)) continue;
                const keys = foldKeys(word);
                if (keys[0].length < 3) continue;
                if (!tokens.has(keys[0])) tokens.set(keys[0], { keys, proper: /^\p{Lu}/u.test(word) });
            }
        }
        return [...tokens.values()];
    };
    const wordKeySet = (texts) => new Set(texts.flatMap(text => (String(text || '').match(/[\p{L}\p{M}]+/gu) || []).map(word => foldKeys(word)[0])));
    const LETTER_RUN = /[\p{L}\p{M}]+/gu;
    const relatesToAnswer = (word, tokens, keepKeys) => {
        if (word.length < 3 || keepKeys.has(foldKeys(word)[0])) return false;
        const keys = foldKeys(word);
        const capital = /^\p{Lu}/u.test(word);
        return tokens.some(token => token.keys.some(t => keys.some(a => keysRelated(a, t, capital, token.proper))));
    };
    // Slova textu, která prozrazují odpověď (pro testy a statistiky): [{ word, index }]
    const findLeaks = (text, names, { isGeneric = () => false, keep = [] } = {}) => {
        const tokens = answerTokens(names, isGeneric);
        const keepKeys = wordKeySet(keep);
        const found = [];
        for (const match of String(text || '').matchAll(LETTER_RUN)) if (relatesToAnswer(match[0], tokens, keepKeys)) found.push({ word: match[0], index: match.index });
        return found;
    };
    // Jiné tvary jména přímo v textu: „rodným jménem Karl Böhnich“, „německy Brünn“, „též Beneș“ – za značkou následuje jméno
    const VARIANT_WORDS = ['rodným jménem', 'vlastním jménem', 'původním jménem', 'občanským jménem', 'uměleckým jménem', 'rozen\\p{L}*', 'též',
        'anglicky', 'německy', 'latinsky', 'řecky', 'rusky', 'polsky', 'italsky', 'španělsky', 'francouzsky', 'rumunsky', 'maďarsky', 'slovensky', 'hebrejsky',
        'arabsky', 'čínsky', 'japonsky', 'korejsky', 'turecky', 'nizozemsky', 'švédsky', 'norsky', 'dánsky', 'finsky', 'portugalsky', 'ukrajinsky', 'persky',
        'hindsky', 'bulharsky', 'srbsky', 'chorvatsky', 'slovinsky'];
    // Značka může být i na začátku věty (Též, Německy), ale jméno za ní musí být velkým písmenem – proto bez příznaku i
    const VARIANT_MARKERS = `(?:${VARIANT_WORDS.map(word => `[${word[0].toUpperCase()}${word[0]}]${word.slice(1)}`).join('|')})`;
    const NAME_WORD = '(?:\\[\\*\\*\\*\\]|\\p{Lu}\\.|\\p{Lu}[\\p{L}\'’\\-]+)';
    const NAME_RUN = `${NAME_WORD}(?:[ \\u00a0]+${NAME_WORD})*`;
    const VARIANT_PATTERN = new RegExp(`(?<![\\p{L}])(${VARIANT_MARKERS})(\\s*:?\\s+)(${NAME_RUN})`, 'gu');
    // Přivlastňovací a přídavná jména velkým písmenem (Nobelovu cenu, Americký) nejsou součást jména
    // Tituly a druhy děl na začátku věty (Prezident [***], Kniha [***]) nejsou součást jména
    const NOT_NAME_START = /^(?:Prezident|Král|Královna|Císař|Papež|Sir|Lord|Lady|Doktor|Dr|Profesor|Pan|Paní|Hrabě|Kníže|Car|Generál|Kapitán|Kniha|Román|Film|Báseň|Bitva|Skladatel|Spisovatel|Malíř|Herec|Režisér|Chemik|Fyzik|Architekt|Zpěvák|Sv|St|Svatý|Svatá|Saint|Sankt|Santa|San|Rod|Rodina|Skupina|Kapela)$/u;
    const ADJECTIVE_LIKE = /(?:ov[áaéeuúyoůí]|ův|[sc]k[ýáéíou]|ní|ný|ná|né)$/u;
    // Je odpověď jméno osoby (dvě až čtyři slova velkým písmenem, případně s předložkou: Edgar Allan Poe, Leonardo da Vinci)?
    const isPersonName = (name) => {
        const words = stripBrackets(String(name || '')).trim().split(/\s+/);
        return words.length >= 2 && words.length <= 4 && !/\d/.test(name)
            && words.every(word => /^\p{Lu}/u.test(word) || NAME_PARTICLES_LOWER.has(word.toLowerCase()));
    };
    const NAME_PARTICLES_LOWER = new Set(['z', 'ze', 'de', 'da', 'di', 'del', 'della', 'van', 'von', 'der', 'den', 'ten', 'ter', 'la', 'le', 'al', 'el', 'bin', 'ibn', 'ben', 'af', 'zu', 'dos', 'du', 'y']);

    // Zakrytí všeho, co se podobá odpovědi: slova textu podobná slovu odpovědi, jiné tvary jména za značkou (rodné jméno, přepis
    // v cizím jazyce) a – u osob – sousední jména velkým písmenem (Karl [***] Böhnich). keep = slova, která hráč vidí v zadání
    // (název díla u „Kdo to napsal?“) a zakrýt se nemají.
    const maskLeaks = (text, names, { isGeneric = () => false, keep = [], runs = null } = {}) => {
        if (!text) return text;
        const tokens = answerTokens(names, isGeneric);
        if (!tokens.length) return text;
        const keepKeys = wordKeySet(keep);
        let result = text.replace(LETTER_RUN, word => relatesToAnswer(word, tokens, keepKeys) ? '[***]' : word);
        // Jiný tvar jména za značkou jen tehdy, když věta jméno odpovědi už zakryla (Poe, rodným jménem Edgar Poe): značka u jiné věci
        // (francouzsky Cathédrale u slohu, který je odpovědí) žádnou odpověď neprozrazuje
        result = result.replace(VARIANT_PATTERN, (match, marker, gap, run, offset, whole) => {
            const sentence = whole.slice(0, offset).split(/[.!?]\s/).pop();
            return !sentence.includes('[***]') ? match : `${marker}${gap}${run.replace(LETTER_RUN, word => word.length >= 2 && !isRomanNumeral(word) && !keepKeys.has(foldKeys(word)[0]) ? '[***]' : word)}`;
        });
        // Věta, která začíná jménem osoby, je o předmětu otázky: jména velkým písmenem v řadě, ve které je zakrytá část, patří
        // k odpovědi (Karl [***] Böhnich se narodil…). Jména uprostřed věty (název série vedle autora) a tituly se nezakrývají.
        const person = runs === null ? names.some(isPersonName) : runs;
        if (person && result.includes('[***]')) {
            // Zakrytá část mezi dvěma jmény velkým písmenem (Karl [***] Böhnich) je prostřední část jména
            const looksLikeName = (word) => !isRomanNumeral(word) && !ADJECTIVE_LIKE.test(word) && !NOT_NAME_START.test(word) && !keepKeys.has(foldKeys(word)[0]);
            result = result.replace(/(?<![\p{L}\p{N}])(\p{Lu}[\p{L}'’\-]+)([ \u00a0]+\[\*\*\*\][ \u00a0]+)(\p{Lu}[\p{L}'’\-]+)(?![\p{L}\p{N}])/gu,
                (match, before, middle, after) => looksLikeName(before) && looksLikeName(after) ? `[***]${middle}[***]` : match);
            result = result.replace(/(^|[.!?]\s+)((?:(?:\[\*\*\*\]|\p{Lu}[\p{L}'’.\-]*|de|da|di|del|della|van|von|der|le|la|bin|ibn)(?:[  ]+|(?=,)))+)/gu, (match, start, head) => {
                if (!head.includes('[***]')) return match;
                return start + head.replace(LETTER_RUN, word => /^\p{Lu}/u.test(word) && word.length >= 2 && !isRomanNumeral(word) && !ADJECTIVE_LIKE.test(word) && !NOT_NAME_START.test(word)
                    && !keepKeys.has(foldKeys(word)[0]) ? '[***]' : word);
            });
        }
        return mergeCensored(result);
    };

    // --- Společné zakrývání popisu: jedna cesta pro všechna témata a druhy otázek ---

    // Obecná slova názvu (poloostrov, národní park, řeka, bitva) v popisu zůstanou – nic neprozradí a bez nich by věta
    // nedávala smysl („Malajský poloostrov je [***] v jihovýchodní Asii“)
    const GENERIC_NAME_WORDS = new Set(['národní', 'park', 'přírodní', 'rezervace', 'chráněná', 'krajinná', 'oblast', 'poloostrov', 'ostrov', 'ostrovy',
        'souostroví', 'moře', 'záliv', 'zátoka', 'jezero', 'řeka', 'hora', 'pohoří', 'vodopád', 'vodopády', 'poušť', 'nížina', 'průliv', 'kanál', 'údolí',
        'katedrála', 'chrám', 'kostel', 'bazilika', 'hrad', 'zámek', 'palác', 'most', 'věž', 'muzeum', 'náměstí', 'klášter', 'mešita', 'synagoga',
        'bitva', 'válka', 'obléhání', 'revoluce', 'povstání', 'říše', 'království', 'císařství', 'republika', 'jednotka', 'energie', 'síla', 'kyselina', 'kyseliny',
        'socha', 'pomník', 'busta', 'obraz', 'portrét', 'album', 'opera', 'symfonie', 'koncert', 'píseň', 'film', 'román', 'povídka', 'báseň']);
    // Běžná slova, která se v názvech tématu opakují (teplota v Curieova, Néelova, Debyeova teplota; sodný v názvech solí):
    // sama o sobě odpověď neprozradí a zakrytá by z věty udělala nesmysl („[***], při které se materiály stávají…“)
    const genericWordsOf = (ctx) => {
        if (!ctx.genericWords) {
            const counts = new Map();
            for (const other of ctx.items) {
                for (const word of new Set(other.n.split(/\s+/).slice(1).filter(word => /^\p{Ll}{4,}$/u.test(word)).map(word => word.toLocaleLowerCase('cs')))) counts.set(word, (counts.get(word) || 0) + 1);
            }
            ctx.genericWords = new Set([...counts].filter(([, count]) => count >= 4).map(([word]) => word));
        }
        return ctx.genericWords;
    };
    const isGenericWord = (word, extra) => GENERIC_NAME_WORDS.has(word.toLocaleLowerCase('cs')) || Boolean(extra && extra.has(word.toLocaleLowerCase('cs')));
    const specificWords = (names, extra = null) => names.filter(Boolean).map(name => {
        const words = name.split(/\s+/);
        const kept = words.filter(word => !isGenericWord(word, extra));
        return kept.length ? kept.join(' ') : name;
    }).join(', ');
    // Obecné slovo názvu hned vedle zakryté části zmizí s ní („[***] park“ u Jurského parku, „Národní park [***]“) –
    // samostatně („je národní park v…“) zůstane
    const absorbGenericWords = (text, names, mark = '[***]', extra = null) => {
        const generic = [...new Set(names.filter(Boolean).flatMap(name => name.split(/\s+/))
            .filter(word => isGenericWord(word, extra)))];
        if (!generic.length || !text.includes(mark)) return text;
        const stems = generic.map(word => escapeRegExp(word.slice(0, Math.max(3, word.length - 2)))).join('|');
        const markPattern = escapeRegExp(mark);
        const after = new RegExp(`${markPattern}(?:\\s+(?:${stems})\\p{L}*(?![\\p{L}]))+`, 'giu');
        const before = new RegExp(`(?<![\\p{L}])(?:(?:${stems})\\p{L}*\\s+)+${markPattern}`, 'giu');
        return text.replace(after, mark).replace(before, mark);
    };
    // Přezdívka nebo rodné jméno, které začíná stejně jako jméno (Bert a Berthold u Bertolta Brechta)
    const hideNicknames = (text, item) => {
        const roots = [item.n, displayName(item.t)].join(' ').split(/[\s\-–,.]+/).filter(word => word.length >= 5)
            .map(word => normalizeAnswer(word).slice(0, 4));
        return mergeCensored(text.replace(/(?<![\p{L}\p{N}])\p{Lu}\p{L}{3,}/gu, word => roots.includes(normalizeAnswer(word).slice(0, 4)) ? '[***]' : word));
    };
    // Jména ostatních nabízených možností v popisu (s Iljou Muromcem a Aljošou Popovičem) by je hned vyřadila
    const CHOICE_MARK = '';
    // Zakrývají se jen slova, která možnost odliší: slovo společné víc možnostem (cyklistika u Dráhové a Silniční cyklistiky,
    // olympijské u her) ani slovo, které hráč vidí v otázce či štítku (sonda u „Co je to za sondu nebo přístroj?“), nic nevyřadí
    // a zakryté by z popisu udělalo nesmysl („Disciplína sportovní [***]“, „Vesmírná [***] NASA“)
    const choiceStem = (word) => { const plain = normalizeAnswer(word); return plain.slice(0, Math.max(3, Math.min(5, plain.length - 1))); };
    const hideOtherChoices = (text, question, ctx, visible = '') => {
        if (!text || question.match) return text;
        if (!ctx.itemNames) ctx.itemNames = new Set(ctx.items.map(other => normalizeAnswer(other.n)));
        const wordsOf = (label) => stripBrackets(String(label || '')).split(/[\s,\-–]+/).filter(word => /[\p{L}\p{N}]/u.test(word));
        const counts = new Map();
        for (const choice of question.choices) for (const stem of new Set(wordsOf(choice.label).map(choiceStem))) counts.set(stem, (counts.get(stem) || 0) + 1);
        const shown = new Set(wordsOf(`${question.title || ''} ${visible}`).map(choiceStem));
        const distinct = (word) => /^\d+$/.test(word) || !(counts.get(choiceStem(word)) > 1 || shown.has(choiceStem(word)));
        const labels = question.choices.filter(choice => !choice.correct && ctx.itemNames.has(normalizeAnswer(choice.label))).map(choice => {
            const words = wordsOf(choice.label);
            // Víceslovná možnost: jen odlišující slova a z nich ne přívlastky malým písmenem (fotbalová, pohybové, česká – možnost
            // nevyřadí); jednoslovná (Kyslík, Vlk) celá
            if (words.length < 2) return choice.label;
            return words.filter((word, index) => distinct(word) && (index === 0 || !/^\p{Ll}/u.test(word)) && /\p{L}{2,}|\d{3,}/u.test(word)).join(' ');
        }).filter(Boolean);
        const extra = genericWordsOf(ctx);
        return labels.length ? absorbGenericWords(censorName(text, specificWords(labels, extra)), labels, '[***]', extra).replaceAll('[***]', CHOICE_MARK) : text;
    };
    // Popis bez odpovědi: téma může zakrývat po svém (u otázky na stát stát), jinak se zakryje název položky
    const censorForItem = (type, text, item, ctx) => {
        if (!text) return '';
        const custom = ctx.topic.censor ? ctx.topic.censor(type, text, item, ctx) : null;
        if (custom !== null && custom !== undefined) return custom;
        const aliases = ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : [];
        const names = [item.n, displayName(item.t), ...aliases];
        const extra = genericWordsOf(ctx);
        return hideNicknames(mergeCensored(absorbGenericWords(censorName(text, specificWords(names, extra)), names, '[***]', extra)), item);
    };
    // Co je odpověď na otázku: u otázky na název název položky, jeho titulek a další názvy (vědecký název druhu je schválně
    // poslední nápovědou), u ostatních druhů všechny přijímané odpovědi (autor, režisér, stát…); století, značky a vzorce
    // se nekontrolují (krátká značka by „našla“ kdeco)
    const answerNamesOf = (question, item, aliases = []) => {
        if (question.match) return [];
        if (question.type === 'name') return [item.n, displayName(item.t || ''), ...aliases.filter(alias => alias !== (item.f || {}).lat)].filter(Boolean);
        return [...(question.accepted || []), question.answerLabel].filter(Boolean);
    };
    const answerNamesFor = (question, item, ctx) => answerNamesOf(question, item, ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : []);
    // --- Tvar odpovědi: slovo těsně u zakrytého místa, které z možností vybírá ---
    // Po zakrytí nesmí v textu zůstat slovo, podle kterého by šlo správnou možnost vybrat nebo možnosti zúžit: spojka „a“ vedle
    // [***] u Lišky a psa (jiná možnost tvar „X a Y“ nemá), číslo „5“ v „[***] 5“ mezi pražskými obvody, „[***] horniny“ mezi
    // dvěma horninami a dvěma vyvřelinami. Takové je každé slovo správné možnosti, které nemají všechny nesprávné. Zakryté
    // místo ho pohltí – blok zakryje celý výskyt jména. Slovo společné všem možnostem (Praha u čtyř obvodů) nic neprozradí.
    // Slova možnosti podle kmene (hornina × horniny, Praha × Prahy), čísla celá
    const choiceTokens = (label) => normalizeAnswer(label).split(' ').filter(Boolean).map(token => /^\d+$/.test(token) ? token : choiceStem(token));
    const distinctiveTokens = (question) => {
        const choices = (question && question.choices) || [];
        const correct = choices.filter(choice => choice.correct);
        if (correct.length !== 1 || choices.length < 2) return new Set();
        const wrong = choices.filter(choice => !choice.correct).map(choice => new Set(choiceTokens(choice.label)));
        return new Set(choiceTokens(correct[0].label).filter(token => !wrong.every(tokens => tokens.has(token))));
    };
    const MARK = '[***]';
    const NEIGHBOUR_GAP = "[\\s\\-–—:,&'’+/]*";
    const LEFT_NEIGHBOUR = new RegExp(`(?<![\\p{L}\\p{N}])([\\p{L}\\p{N}]+)${NEIGHBOUR_GAP}$`, 'u');
    const RIGHT_NEIGHBOUR = new RegExp(`^${NEIGHBOUR_GAP}([\\p{L}\\p{N}]+)(?![\\p{L}\\p{N}])`, 'u');
    // Slova vedle zakrytých míst, která prozradí tvar odpovědi: [{ word, start, end }] (end = konec zakrytého místa vpravo,
    // start = začátek zakrytého místa vlevo; úsek start–end se zakryje)
    const structureLeaks = (text, question) => {
        const distinct = distinctiveTokens(question);
        const value = String(text || '');
        if (!distinct.size || !value.includes(MARK)) return [];
        const leaks = [];
        for (let index = value.indexOf(MARK); index >= 0; index = value.indexOf(MARK, index + MARK.length)) {
            const left = LEFT_NEIGHBOUR.exec(value.slice(0, index));
            if (left && distinct.has(choiceTokens(left[1])[0])) leaks.push({ word: left[1], start: index - left[0].length, end: index + MARK.length });
            const right = RIGHT_NEIGHBOUR.exec(value.slice(index + MARK.length));
            if (right && distinct.has(choiceTokens(right[1])[0])) leaks.push({ word: right[1], start: index, end: index + MARK.length + right[0].length });
        }
        return leaks;
    };
    const sealStructure = (text, question) => {
        let result = String(text || '');
        for (let round = 0; round < 20; round++) {
            const [leak] = structureLeaks(result, question);
            if (!leak) break;
            result = mergeCensored(`${result.slice(0, leak.start)}${MARK}${result.slice(leak.end)}`);
        }
        return result;
    };

    // Text pro hráče bez odpovědi: zakrytí názvu (téma nebo jádro), potom kontrola všech tvarů jména (maskLeaks)
    // a nakonec tvaru odpovědi (sealStructure)
    // Co hráč vidí v zadání (název u otázky na autora, desetiletí, stát…), se v textu nikdy nezakrývá: nic neprozradí
    // a „[***] hodin“ u seriálu 24 hodin by jen mátlo. Název se před zakrýváním schová za značku, kterou žádné
    // pravidlo zakrytí nezasáhne (znak bez písmen a číslic), a po zakrytí se vrátí.
    const SHOWN_NAME_MARK = '\uE000';
    const protectShownName = (text, name) => {
        const shown = String(name || '').trim();
        if (shown.length < 2) return { text, restore: value => value };
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(shown)}(?![\\p{L}\\p{N}])`, 'giu');
        const found = [];
        const marked = String(text).replace(pattern, (match) => { found.push(match); return SHOWN_NAME_MARK; });
        if (!found.length) return { text, restore: value => value };
        return { text: marked, restore: value => { let index = 0; return value.replace(new RegExp(SHOWN_NAME_MARK, 'g'), () => found[index++] || ''); } };
    };
    const hideAnswer = (text, question, item, ctx, { keep = [] } = {}) => {
        if (!text) return '';
        const shown = protectShownName(text, question.showName ? item.n : '');
        const category = (ctx.topic.categories || []).find(entry => entry.key === item.c) || {};
        const hidden = hideOtherChoices(shown.text, question, ctx, [item.ty, category.one].filter(Boolean).join(' '));
        const censored = mergeCensored(censorForItem(question.type, hidden, item, ctx).replaceAll(CHOICE_MARK, '[***]'));
        const masked = maskLeaks(censored, answerNamesFor(question, item, ctx), { isGeneric: (word) => isGenericWord(word, genericWordsOf(ctx)), keep: [question.title, question.showName ? item.n : '', item.ty, ...(ctx.topic.keepWords ? ctx.topic.keepWords(question.type, item, ctx) : []), ...keep] });
        return shown.restore(sealStructure(masked, question));
    };

    // Věta vytržená z kontextu („Doprovázejí boha Rea…“, „Část odborníků se k tomuto výkladu kloní…“) nedává smysl
    const OUT_OF_CONTEXT = /^(?:ten|ta|to|ti|ty|tento|tato|toto|tito|tyto|tomuto|tohoto|této|těchto|tuto|tím|jeho|její|jejich|on|ona|ono|oni|ony|část|ostatní|také|rovněž|dále|však|proto|tam|zde|odtud|později|nicméně|přesto)(?![\p{L}])/iu;
    // Popis, který se po zakrytí skoro celý skládá z [***], hráči nic neřekne a skrývá podezřelé zbytky jmen: zahodí se
    // a otázku nesou ostatní nápovědy (fakta, fotka, osa)
    const MAX_USABLE_CENSORED_SHARE = 0.5;
    // Popis a další věty úvodu tak, jak je uvidí hráč. fetched = { description, more, fallback } z processWikiText;
    // special = otázka zvláštního druhu (další věty se pak nepoužijí)
    // origin = odkud text je: 'article' (úvod článku z Wikipedie), 'fallback' (krátký popis z Wikidat, když Wikipedie
    // neodpověděla) nebo 'withheld' (téma text před odpovědí neukazuje – úvod článku o kraji či městě by ho prozradil i se
    // zakrytým názvem). Nápovědou smí být jen text z článku; náhradní ani zadržený text nápovědou nikdy není.
    const buildQuestionTexts = (item, ctx, question, fetched, { special = false } = {}) => {
        if (ctx.topic.withholdText && ctx.topic.withholdText(question.type, item, ctx)) {
            return { text: fetched, questionText: '', moreText: '', origin: 'withheld' };
        }
        const censorText = (value) => hideAnswer(value, question, item, ctx);
        const text = fetched.fallback ? fetched
            : { ...fetched, ...chooseDescription(fetched.description, fetched.more, censorText, { startOk: sentence => !OUT_OF_CONTEXT.test(sentence) }) };
        let questionText = censorText(text.description);
        if (!fetched.fallback && censoredShare(questionText) > MAX_USABLE_CENSORED_SHARE) questionText = '';
        const moreText = special || !text.more ? '' : censorText(stripFactSentences(text.more, ctx.topic.facts(item, ctx, question.type)));
        return { text, questionText, moreText, origin: fetched.fallback ? 'fallback' : 'article' };
    };
    // Prozrazuje fakt odpověď (nebo začíná stejným kořenem jako ona)? Takový fakt se jako nápověda nenabídne.
    // Zkratka v odpovědi rozepsaná ve faktu: kometa C/2022 E3 (ZTF) a objevitel Zwicky Transient Facility
    const spellsAcronym = (value, names) => {
        const acronyms = names.flatMap(name => String(name || '').match(/(?<![\p{L}\p{N}])\p{Lu}{3,6}(?![\p{L}\p{N}])/gu) || []).filter(word => !isRomanNumeral(word));
        if (!acronyms.length) return false;
        const initials = value.split(/[\s\-–]+/).filter(word => /^\p{Lu}/u.test(word)).map(word => word[0]).join('');
        return acronyms.some(acronym => initials.includes(acronym));
    };
    const factRevealsAnswer = (fact, names, { isGeneric = () => false, rootNames = '' } = {}) => {
        const value = String(fact.value);
        return names.length > 0 && (findLeaks(value, names, { isGeneric }).length > 0 || censorName(value, names.join(', ')).includes('[***]')
            || (Boolean(rootNames) && sharesWordRoot(value, rootNames)) || spellsAcronym(value, names));
    };

    // --- Položky témat: místa, osobnosti, druhy, prvky… (formát data/<téma>.json) ---

    // Okruh: null = celé téma, „c:klíč“ = kategorie, jinak zvláštní okruh z dat (pole g u položky)
    const inCollection = (item, collectionId) => {
        if (!collectionId) return true;
        if (collectionId.startsWith('c:')) return item.c === collectionId.slice(2);
        return (item.g || []).includes(collectionId);
    };
    // Úrovně obtížnosti (sčítají se): known = Základní (k: 1, zná většina lidí), all = Mudrlant (i méně známé, bez expertních),
    // expert = Mudrlant Expert (všechno včetně perliček, x: 1)
    const levelOf = (item) => (item && item.k === 1 ? 1 : item && item.x ? 3 : 2);
    const TIER_LEVEL = { known: 1, all: 2, expert: 3 };
    const tierLevel = (tier) => TIER_LEVEL[tier] || 3;
    const filterItems = (items, { tier = 'expert', collection = null } = {}) =>
        items.filter(item => levelOf(item) <= tierLevel(tier) && inCollection(item, collection));

    // Nejdřív kategorie (v pořadí z tématu), potom položka v ní – jinak by převážila nejpočetnější kategorie.
    // Položka s nq (no question) je jen k učení: obrázek otázky by odpověď prozradil celý (vlajka, která je celá nápisem –
    // OSCE, РСФСР) – otázkou se stane, jen když jiná není
    // weightOf(item) = volitelná váha položky uvnitř kategorie (kalibrace obtížnosti z answer-stats.js, jen trénink bez semínka);
    // bez ní (dnešní otázky, výzvy, turnaje) se losuje rovnoměrně a se stejnými voláními rng jako dřív
    const pickItem = (allItems, rng, recentIds = [], categoryOrder = [], weightOf = null) => {
        const pickOne = (list) => weightOf ? pickWeighted(list, weightOf, rng) : pickRandom(list, rng);
        const askable = allItems.filter(item => !item.nq);
        const pool = askable.length ? askable : allItems;
        const present = new Set(pool.map(item => item.c));
        const categoryKeys = [...categoryOrder.filter(key => present.has(key)), ...[...present].filter(key => !categoryOrder.includes(key))];
        const categoryKey = pickRandom(categoryKeys, rng);
        const inCategory = pool.filter(item => item.c === categoryKey);
        const recent = new Map(recentIds.map((id, index) => [id, index]));
        const fresh = inCategory.filter(item => !recent.has(item.q));
        if (fresh.length) return pickOne(fresh);
        // Všechno už bylo: z polovičky hrané nejdávněji, ať se hned neopakuje právě odehraná otázka
        const oldestFirst = [...inCategory].sort((a, b) => recent.get(b.q) - recent.get(a.q));
        return pickOne(oldestFirst.slice(0, Math.ceil(oldestFirst.length / 2)));
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
    // Blízká doba (rok položky f.y): stejné století 3 body, sousední 2, do tří století 1; tisíc a víc let vedle sebe
    // (Spartakus a Ajman az-Zaváhirí, oba „vojevůdce“) je nápadné – takový kandidát ztrácí, i když má stejný druh (+4)
    const eraNearness = (a, b) => {
        if (a === undefined || b === undefined) return 0;
        const distance = Math.abs(centuryOf(a) - centuryOf(b));
        return distance === 0 ? 3 : distance === 1 ? 2 : distance <= 3 ? 1 : distance <= 6 ? 0 : distance <= 10 ? -2 : -5;
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
    // Přídavná jména národností v popisu („český a rakouský dirigent“, „anglická rocková skupina“): když položka nemá zemi
    // v datech, je to záložní zdroj. Kmen přídavného jména → dnešní stát.
    const DEMONYMS = [
        ['americk', 'Spojené státy americké'], ['britsk', 'Spojené království'], ['anglick', 'Spojené království'], ['skotsk', 'Spojené království'],
        ['velšsk', 'Spojené království'], ['irsk', 'Irsko'], ['francouzsk', 'Francie'], ['německ', 'Německo'], ['rakousk', 'Rakousko'], ['italsk', 'Itálie'],
        ['španělsk', 'Španělsko'], ['portugalsk', 'Portugalsko'], ['nizozemsk', 'Nizozemsko'], ['holandsk', 'Nizozemsko'], ['belgick', 'Belgie'],
        ['švýcarsk', 'Švýcarsko'], ['švédsk', 'Švédsko'], ['norsk', 'Norsko'], ['dánsk', 'Dánsko'], ['finsk', 'Finsko'], ['islandsk', 'Island'],
        ['polsk', 'Polsko'], ['maďarsk', 'Maďarsko'], ['rumunsk', 'Rumunsko'], ['bulharsk', 'Bulharsko'], ['řeck', 'Řecko'], ['rusk', 'Rusko'],
        ['sovětsk', 'Rusko'], ['ukrajinsk', 'Ukrajina'], ['bělorus', 'Bělorusko'], ['česk', 'Česko'], ['československ', 'Česko'], ['slovensk', 'Slovensko'],
        ['chorvatsk', 'Chorvatsko'], ['srbsk', 'Srbsko'], ['slovinsk', 'Slovinsko'], ['bosensk', 'Bosna a Hercegovina'], ['litevsk', 'Litva'],
        ['lotyšsk', 'Lotyšsko'], ['estonsk', 'Estonsko'], ['turecký', 'Turecko'], ['tureck', 'Turecko'], ['čínsk', 'Čína'], ['japonsk', 'Japonsko'],
        ['jihokorejsk', 'Jižní Korea'], ['severokorejsk', 'Severní Korea'], ['korejsk', 'Jižní Korea'], ['tchajwansk', 'Tchaj-wan'], ['mongolsk', 'Mongolsko'],
        ['indick', 'Indie'], ['pákistánsk', 'Pákistán'], ['íránsk', 'Írán'], ['persk', 'Írán'], ['izraelsk', 'Izrael'], ['egyptsk', 'Egypt'],
        ['kanadsk', 'Kanada'], ['mexick', 'Mexiko'], ['brazilsk', 'Brazílie'], ['argentinsk', 'Argentina'], ['chilsk', 'Chile'], ['kubánsk', 'Kuba'],
        ['kolumbijsk', 'Kolumbie'], ['peruánsk', 'Peru'], ['venezuelsk', 'Venezuela'], ['uruguayjsk', 'Uruguay'], ['australsk', 'Austrálie'],
        ['novozélandsk', 'Nový Zéland'], ['jihoafrick', 'Jihoafrická republika'], ['nigerijsk', 'Nigérie'], ['keňsk', 'Keňa'], ['etiopsk', 'Etiopie'],
        ['arménsk', 'Arménie'], ['gruzínsk', 'Gruzie'], ['thajsk', 'Thajsko'], ['vietnamsk', 'Vietnam'], ['filipínsk', 'Filipíny'], ['indonésk', 'Indonésie'],
        ['saúdskoarabsk', 'Saúdská Arábie'], ['irack', 'Irák'], ['syrsk', 'Sýrie'], ['libanonsk', 'Libanon'], ['marock', 'Maroko'],
        ['alžírsk', 'Alžírsko'], ['tunisk', 'Tunisko'], ['jamajsk', 'Jamajka']
    ];
    const landFromDescription = (description) => {
        const words = String(description || '').replace(/\([^)]*\)/g, ' ').toLocaleLowerCase('cs').split(/[\s,;]+/).filter(Boolean);
        for (const word of words) {
            if (/^(?:a|i)$/u.test(word)) continue;
            // Přídavné jméno národnosti na začátku popisu; první slovo, které jím není (herec, skupina), řadu ukončí
            const part = word.split('-')[0];
            const found = /(?:ský|cký|ská|cká|ské|cké)$/u.test(word) ? DEMONYMS.filter(([stem]) => part.startsWith(stem)).sort((a, b) => b[0].length - a[0].length)[0] : undefined;
            if (!found) return '';
            return found[1];
        }
        return '';
    };
    const landCache = new WeakMap();
    // Dnešní stát (a případné další) osoby či díla: země z dat, jinak česká stopa (cz), jinak národnost z popisu
    const landsOf = (item) => {
        if (!item) return [];
        let lands = landCache.get(item);
        if (!lands) {
            const land = item.f && item.f.land;
            const list = (Array.isArray(land) ? land : String(land || '').split(', ')).map(name => MODERN_LAND[name] || name).filter(Boolean);
            // Česká stopa a národnost z popisu jen u osob a děl (mají rok narození, vzniku nebo autora); u druhů, prvků a míst by byly zavádějící
            const origin = item.f && (item.f.born !== undefined || item.f.by !== undefined || item.f.year !== undefined || item.f.from !== undefined);
            lands = [...new Set(list.length ? list.slice(0, 3) : origin ? [landFromDescription(item.d) || (item.cz === 1 ? 'Česko' : '')].filter(Boolean) : [])];
            landCache.set(item, lands);
        }
        return lands;
    };
    const landOf = (item) => landsOf(item)[0] || '';
    // Kultura jmen: skupiny států s podobnými jmény a oblasti, do kterých skupiny patří. Nesprávné možnosti se hledají napřed ve
    // stejném státě, potom v téže skupině (k Fellinimu Italové a další románské jazyky), oblasti, na kontinentu a až nakonec jinde.
    const CULTURE_GROUPS = {
        anglo: ['Spojené státy americké', 'Spojené království', 'Irsko', 'Kanada', 'Austrálie', 'Nový Zéland', 'Jihoafrická republika', 'Jamajka', 'Barbados', 'Bermudy', 'Svatá Lucie', 'Zimbabwe'],
        german: ['Německo', 'Rakousko', 'Švýcarsko', 'Lichtenštejnsko'],
        lowlands: ['Nizozemsko', 'Belgie', 'Lucembursko'],
        nordic: ['Švédsko', 'Norsko', 'Dánsko', 'Finsko', 'Island'],
        romance: ['Francie', 'Itálie', 'Španělsko', 'Portugalsko', 'Rumunsko', 'Vatikán', 'Monako', 'Malta', 'Moldavsko'],
        westslavic: ['Česko', 'Slovensko', 'Polsko'],
        eastslavic: ['Rusko', 'Ukrajina', 'Bělorusko'],
        southslavic: ['Srbsko', 'Chorvatsko', 'Slovinsko', 'Bulharsko', 'Bosna a Hercegovina', 'Černá Hora', 'Severní Makedonie', 'Kosovo'],
        hungarian: ['Maďarsko'],
        baltic: ['Litva', 'Lotyšsko', 'Estonsko'],
        greek: ['Řecko', 'Kypr', 'Albánie'],
        latam: ['Mexiko', 'Brazílie', 'Argentina', 'Chile', 'Peru', 'Kolumbie', 'Venezuela', 'Kuba', 'Ekvádor', 'Bolívie', 'Uruguay', 'Paraguay', 'Guatemala', 'Nikaragua', 'Haiti', 'Dominikánská republika', 'Kostarika', 'Panama'],
        eastasia: ['Čína', 'Japonsko', 'Jižní Korea', 'Severní Korea', 'Tchaj-wan', 'Mongolsko'],
        southeastasia: ['Thajsko', 'Vietnam', 'Filipíny', 'Malajsie', 'Indonésie', 'Myanmar', 'Kambodža', 'Singapur', 'Laos', 'Východní Timor', 'Brunej'],
        southasia: ['Indie', 'Pákistán', 'Bangladéš', 'Srí Lanka', 'Nepál', 'Bhútán', 'Maledivy'],
        arab: ['Egypt', 'Libye', 'Tunisko', 'Alžírsko', 'Maroko', 'Súdán', 'Sýrie', 'Irák', 'Saúdská Arábie', 'Libanon', 'Jordánsko', 'Kuvajt', 'Katar', 'Stát Palestina', 'Spojené arabské emiráty', 'Omán', 'Jemen', 'Bahrajn'],
        persian: ['Írán', 'Afghánistán', 'Tádžikistán'],
        turkic: ['Turecko', 'Ázerbájdžán', 'Kazachstán', 'Kyrgyzstán', 'Uzbekistán', 'Turkmenistán'],
        caucasus: ['Gruzie', 'Arménie'],
        hebrew: ['Izrael'],
        africa: ['Nigérie', 'Keňa', 'Etiopie', 'Ghana', 'Senegal', 'Kamerun', 'Uganda', 'Pobřeží slonoviny', 'Libérie', 'Burkina Faso', 'Tanzanie', 'Mali', 'Mosambik', 'Angola', 'Alžírsko', 'Svazijsko', 'Kapverdy', 'Madagaskar', 'Mauricius'],
        oceania: ['Tonga', 'Nauru', 'Samoa', 'Fidži', 'Papua Nová Guinea']
    };
    const CULTURE_AREAS = {
        west: ['anglo', 'german', 'lowlands', 'nordic', 'romance', 'westslavic', 'eastslavic', 'southslavic', 'hungarian', 'baltic', 'greek', 'latam'],
        asia: ['eastasia', 'southeastasia', 'southasia'],
        mideast: ['arab', 'persian', 'turkic', 'caucasus', 'hebrew'],
        africa: ['africa'],
        oceania: ['oceania']
    };
    // Dvě kultury mimo Evropu a Ameriku sousedí s Asií (Blízký východ, Střední Asie) – k japonskému jménu spíš korejské než švédské
    const CULTURE_NEIGHBOURS = { asia: ['mideast'], mideast: ['asia', 'africa'], africa: ['mideast'] };
    const cultureOfLand = new Map();
    for (const [group, lands] of Object.entries(CULTURE_GROUPS)) {
        const area = Object.keys(CULTURE_AREAS).find(key => CULTURE_AREAS[key].includes(group));
        for (const land of lands) if (!cultureOfLand.has(land)) cultureOfLand.set(land, { group, area });
    }
    // Stát mimo tabulku skupin se zařadí aspoň podle kontinentu z tabulky států (oblast bez skupiny)
    const CONTINENT_AREA = { EU: 'west', NA: 'west', SA: 'west', AS: 'asia', AF: 'africa', OC: 'oceania' };
    const cultureInfo = (land) => cultureOfLand.get(land) || (CONTINENT_AREA[continentByLand.get(land)] ? { group: `kontinent:${continentByLand.get(land)}`, area: CONTINENT_AREA[continentByLand.get(land)] } : null);
    // Vzdálenost dvou států: 0 stejný stát, 1 stejná skupina, 2 stejná oblast, 3 sousední oblast, 4 jiná (neznámý stát: neutrální 2,5)
    const cultureDistance = (a, b) => {
        if (a === b) return 0;
        const ca = cultureInfo(a);
        const cb = cultureInfo(b);
        if (!ca || !cb) return 2.5;
        if (ca.group === cb.group) return 1;
        if (ca.area === cb.area) return 2;
        return (CULTURE_NEIGHBOURS[ca.area] || []).includes(cb.area) ? 3 : 4;
    };
    const CULTURE_POINTS = [10, 5, 1, -3, -8];
    // Kulturní blízkost položek (osoby a díla se zemí): stát +10, skupina +5, oblast +1, sousední oblast −3, jiná −8 – víc než shoda doby
    // či směru, protože jediné čínské jméno mezi nizozemskými je poznat hned. Položka bez země nic neříká (0). Čech mezi cizinci −2.
    // Jen u položek se zemí (osoby a díla) – místa, druhy, prvky a vlajky mají vlastní pravidla. landFn = jak se zjistí země
    // (téma může místo původu osoby dosadit zemi místa: bitva, stavba).
    const cultureScore = (item, other, landFn = landsOf) => {
        const a = landFn(item);
        if (!a || !a.length) return 0;
        const b = landFn(other);
        let score = 0;
        if (b && b.length) {
            const distance = Math.min(...a.map(x => Math.min(...b.map(y => cultureDistance(x, y)))));
            const lower = Math.floor(distance);
            score += lower === distance ? CULTURE_POINTS[distance] : (CULTURE_POINTS[lower] + CULTURE_POINTS[lower + 1]) / 2;
        }
        if ((item.cz === 1) !== (other.cz === 1)) score -= 2;
        return score;
    };

    // Země položek pro výběr podle kultury: téma může položku vyjmout (culture(item, ctx) vrátí [] – místa a vlajky mají vlastní
    // pravidla, olympiády by podle pořadatele nabízely sporné hry téhož města) nebo dosadit jinou zemi (stát místa bitvy a stavby);
    // undefined = země osoby či díla (landsOf)
    const cultureLandsFor = (topic, ctx) => topic.culture ? (item) => {
        const lands = topic.culture(item, ctx);
        return lands === undefined ? landsOf(item) : [].concat(lands || []).filter(Boolean);
    } : landsOf;

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

    // Zmiňuje text (krátký popis položky) název jiné položky jako celek, i skloněný či jako část slova (monokarboxylová –
    // Karboxylová kyselina)? Popis „X je Y“ říká, že X je druh Y – Y by pak byla druhá správná možnost
    const normalizedWords = new Map();
    const wordsNormalized = (text) => {
        if (!normalizedWords.has(text)) normalizedWords.set(text, normalizeAnswer(text).split(' ').filter(Boolean));
        return normalizedWords.get(text);
    };
    const mentionsName = (text, name) => {
        const words = wordsNormalized(name);
        if (!text || !words.length || (words.length === 1 && words[0].length < 5)) return false;
        const textWords = wordsNormalized(text);
        const stems = words.map(word => word.length >= 5 ? word.slice(0, word.length - 2) : word);
        const fits = (textWord, stem) => stem.length < 4 ? textWord === stem : textWord.startsWith(stem) || (stem.length >= 6 && textWord.includes(stem));
        return textWords.some((_, start) => stems.every((stem, i) => textWords[start + i] !== undefined && fits(textWords[start + i], stem)));
    };
    // Nadřazený pojem položky (Organická kyselina k Mastné kyselině, Elementární částice k Mionu): v popisu položky přímo,
    // nebo v popisu pojmu, který popis položky zmiňuje (mastná → monokarboxylová → karboxylová kyselina → organická kyselina)
    const broaderTerms = (item, items) => {
        if (!item.d) return () => false;
        const mentioned = items.filter(other => other.c === item.c && other.q !== item.q && other.d && mentionsName(item.d, other.n));
        return (other) => mentionsName(item.d, other.n) || mentioned.some(middle => middle.q !== other.q && mentionsName(middle.d, other.n));
    };

    // Nesprávné možnosti názvu: položky stejné kategorie seřazené podle podobnosti. Základ dá jádro – stejně známé
    // (ke známé odpovědi známé možnosti) a stejného typu (k anglickému králi angličtí králové, k průlivu průlivy);
    // zbytek přidá téma funkcí similarity(other) – blízká místa, stejné století a pohlaví, stejná čeleď…
    // Náhoda ve výběru: z podobně dobrých kandidátů se losuje, ať se u téže položky možnosti střídají; menší než nejmenší
    // rozdíl vah (stejný typ +4 proti známosti 3), takže los nepřehlasuje podobnost
    const CHOICE_JITTER = 0.9;
    // Pod touto hodnotou je kandidát jen nouzová možnost (téma ho srazilo, třeba region jiného státu)
    const CHOICE_FLOOR = -20;
    // culture(item) = země položky pro výběr podle kultury (výchozí landsOf; téma může zvolit jinou, např. zemi místa bitvy)
    const buildItemChoices = (item, items, rng, similarity = () => 0, culture = landsOf) => {
        // Ke známé odpovědi známá možnost váží víc – jinak by známá odpověď mezi samými neznámými byla nápadná
        const tier = (other) => other.k !== item.k ? 0 : item.k === 1 ? 3 : 2;
        // Společné okruhy (stejná doba, země, žánr): drobný bonus za každý, nejvýš tři
        const groupBonus = (other) => Math.min(3, (item.g || []).filter(group => (other.g || []).includes(group)).length) * 0.8;
        // Druh (tenista, malířka, hlavní město) je vidět u otázky – nesprávná možnost jiného druhu by byla poznat hned
        const broader = broaderTerms(item, items);
        const score = (other) => tier(other) + (item.ty && other.ty === item.ty ? 4 : 0) + (similarity(other) || 0) + cultureScore(item, other, culture) + groupBonus(other)
            - (isNamePart(item.n, other.n) || broader(other) ? 100 : 0) + rng() * CHOICE_JITTER;
        // Možnost, jejíž název je přijímanou odpovědí správné položky (nebo naopak), by byla druhá správná: Katedrála Notre-Dame
        // (Paříž) u katedrály v Rouenu, jejíž článek se jmenuje Katedrála Notre-Dame (Rouen)
        const namesOf = (other) => [other.n, displayName(other.t || '')].map(normalizeAnswer).filter(Boolean);
        const ownNames = new Set(namesOf(item));
        const entries = shuffle(items.filter(other => other.c === item.c && other.q !== item.q && !namesOf(other).some(name => ownNames.has(name))), rng)
            .map(candidate => ({ candidate, value: score(candidate) }))
            .filter(entry => entry.value > -Infinity)
            .sort((a, b) => b.value - a.value);
        const taken = new Set([normalizeAnswer(item.n)]);
        let distractors = takeDistinct(entries.map(entry => entry.candidate), 3, taken, other => other.n);
        // Ke známé položce aspoň jedna známá možnost, i když ze stejné země jsou jen méně známé (jinak by známá odpověď mezi
        // samými neznámými byla nápadná): nahradí nejhorší z vybraných nejlepší známou ze stejné oblasti kultury
        if (item.k === 1 && distractors.length === 3 && !distractors.some(other => other.k === 1)) {
            const own = culture(item) || [];
            const sameArea = (other) => !own.length || Math.min(...own.map(x => Math.min(...((culture(other) || []).map(y => cultureDistance(x, y)).concat([2.5]))))) <= 2;
            // Jen kandidát bez velké srážky (cizí stát u regionu, část názvu správné odpovědi): ten je mimo hru i tady
            const known = entries.find(entry => entry.candidate.k === 1 && entry.value > CHOICE_FLOOR && !distractors.includes(entry.candidate) && sameArea(entry.candidate)
                && !taken.has(normalizeAnswer(entry.candidate.n)));
            if (known) distractors = [...distractors.slice(0, 2), known.candidate];
        }
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
    // Osobnost (má rok narození) se dá napsat i samým příjmením (Einstein, da Vinci) nebo s iniciálou (A. Einstein).
    // Panovníci s číslem a přízviskem (Karel IV., Alexandr Veliký) a názvy s tečkou či číslem příjmení nemají
    const NAME_PARTICLES = new Set(['z', 'ze', 'de', 'da', 'di', 'del', 'della', 'van', 'von', 'der', 'den', 'ten', 'ter', 'la', 'le', 'al', 'el', 'bin', 'ibn', 'ben', 'af', 'zu', 'dos', 'du']);
    const EPITHETS = new Set(['veliký', 'veliká', 'velký', 'velká', 'svatý', 'svatá', 'český', 'česká', 'mladší', 'starší', 'ukrutný', 'pobožný', 'dobrý', 'moudrý',
        'smělý', 'krutý', 'hrozný', 'sličný', 'spravedlivý', 'štědrý', 'zbožný', 'učený', 'slavný', 'ctihodný', 'statečný', 'nebojácný', 'prostý', 'plešatý', 'lysý',
        'rudovousý', 'dobyvatel', 'vyznavač', 'apoštol', 'mučedník', 'jr.', 'sr.', 'junior', 'senior']);
    const surnameAnswers = (item) => {
        if (!item || !item.n || !item.f || item.f.born === undefined || item.c === 'panovnik') return [];
        const words = item.n.split(/\s+/);
        if (words.length < 2 || words.length > 4 || /[\d.]/.test(item.n)) return [];
        // Čínská a korejská jména mají příjmení napřed (Mao Ce-tung, Kim Čong-un, Tchu Jou-jou): příjmením je první slovo,
        // ne rodné jméno za ním; dvoupísmenné (Li, Si) by bylo nejednoznačné
        if (words.length === 2 && /^\p{Lu}\p{Ll}{0,5}$/u.test(words[0]) && /^\p{Lu}\p{Ll}*-\p{Ll}+$/u.test(words[1])) return words[0].length >= 3 ? [words[0]] : [];
        let start = words.length - 1;
        while (start > 1 && NAME_PARTICLES.has(words[start - 1].toLowerCase())) start--;
        const surname = words.slice(start).join(' ');
        if (surname.length < 3 || CENSOR_SKIP_WORDS.has(surname.toLowerCase())) return [];
        // Přízvisko není příjmení: „mladší“ by platilo pro Agrippinu i Drusa, „Veliký“ pro Alberta i Basileia, „Česká“ pro Anežku i Marii
        const last = words[words.length - 1];
        if (/^\p{Ll}/u.test(last) || EPITHETS.has(last.toLocaleLowerCase('cs'))) return [];
        return [...new Set([surname, last, `${words[0].charAt(0)}. ${surname}`])];
    };
    const nameAnswers = (item, extra = []) => [item.n, item.t, displayName(item.t || ''), ...surnameAnswers(item), ...extra].filter(Boolean);
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
    const isFactVisible = (value, text, label = '') => {
        // Rok, který už je v popisu („z roku 1980“ a fakt Rok 1980)
        if (/^\d{3,4}$/.test(String(value).trim())) return new RegExp(`(?<!\\d)${String(value).trim()}(?!\\d)`).test(text);
        // Období (882–1240, 379–395 n. l.): vidět jsou oba roky
        const range = String(value).trim().match(/^(\d{3,4})\s*[–-]\s*(\d{3,4})((?: př\.)? n\. l\.)?$/u);
        if (range) return [range[1], range[2]].every(year => isFactVisible(range[3] ? `${year}${range[3]}` : year, text, label));
        // Hodnota beze slov (4'33") je vidět, když text má stejná čísla za sebou
        if (!/\p{L}/u.test(String(value)) && /\d/.test(String(value)) && ` ${normalizeAnswer(text)} `.includes(` ${normalizeAnswer(value)} `)) return true;
        // Rok s letopočtem (680 n. l., 199 př. n. l.), který už je v textu („dne 10. října 680“, „roku 199 př. n. l.“)
        const era = String(value).trim().match(/^(\d{1,4}) (př\. )?n\. l\.$/u);
        if (era) return new RegExp(`(?<![\\d,.])${era[1]}(?![\\d]|[,.]\\d)${era[2] ? '[^.\\d]{0,12}př' : '(?!\\s*př)'}`, 'u').test(text);
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
        // Trojpísmenné slovo hodnoty (měď, pes) je vidět jen jako začátek odvozeného slova textu (měďnatý, psovití – ne medvěd)
        // (i slovo samo: sci-fi), a stejně odvozená delší slova (síra → sírový, stříbro → stříbrný, fluor → fluorid)
        const DERIVED = /^(?:ov|nat|it|icit|ist|ecn|id|n[yaeiu])/;
        const shortSeen = (word) => haystack.split(' ').some(other => other === word || (other.startsWith(word) && DERIVED.test(other.slice(word.length))));
        const derivedSeen = (word) => {
            const stem = word.replace(/[aeiouy]+$/, '');
            return stem.length >= 3 && haystack.split(' ').some(other => other.startsWith(stem) && DERIVED.test(other.slice(stem.length)));
        };
        // Trojpísmenné slovo hodnoty musí být vidět také (Panthera leo přidá „leo“, i když rod Panthera už hráč zná)
        // Krátké jméno (Jan, Ron, Sam) i ve skloněném tvaru (Janem Svěrákem)
        const CASE_ENDING = /^(?:a|u|e|em|ovi|ou|y|i|ov[aeiouy]|ovou|ovym)$/;
        const nameSeen = (word) => haystack.split(' ').some(other => other.startsWith(word) && CASE_ENDING.test(other.slice(word.length)));
        const shortsSeen = (part) => {
            const proper = new Set((String(part).match(/\p{Lu}\p{L}*/gu) || []).map(normalizeAnswer));
            return normalizeAnswer(part).split(' ').filter(word => word.length === 3 && !/\d/.test(word) && !PLAIN_WORDS.has(word))
                .every(word => shortSeen(word) || (proper.has(word) && nameSeen(word)));
        };
        const wordsSeen = (part) => {
            const words = normalizeAnswer(part).split(' ').filter(significant);
            if (words.length > 0 && words.every(seen) && shortsSeen(part)) return true;
            const all = normalizeAnswer(part).split(' ').filter(word => word.length >= 3 && !/\d/.test(word));
            return all.length > 0 && all.every(word => word.length === 3 ? shortSeen(word) : seen(word) || derivedSeen(word));
        };
        // Počet, který text říká se slovem z popisku faktu („hraná 18 hráči“ a Hráčů na hřišti: 18 za tým)
        const labelRoots = normalizeAnswer(label).split(' ').filter(word => word.length >= 4).map(word => word.slice(0, 4));
        const countSeen = (part) => {
            const numbers = part.match(/\d+/g) || [];
            if (!numbers.length || !labelRoots.length || normalizeAnswer(part).split(' ').some(word => significant(word))) return false;
            return numbers.every(number => [...String(text).matchAll(new RegExp(`(?<![\\d,.])${number}(?![\\d]|[,.]\\d)\\s+(\\p{L}+)`, 'gu'))]
                .some(match => labelRoots.includes(normalizeAnswer(match[1]).slice(0, 4))));
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
        return String(value).split(/,\s+/).every(part => wordsSeen(part) || (keySeen(part) && shortsSeen(part)) || countSeen(part));
    };
    const dropKnownFacts = (facts, text) => facts.filter(fact => !isFactVisible(fact.value, text, fact.label));

    // Osa (stáří období, tvrdost…), jejíž hodnotu už říká text otázky („před 251,9 až 201,4 miliony let“), nic nepřidá: poznáme ji podle čísel
    // v popisku hodnoty (desetinná čísla a čísla od tří číslic; jednociferná by se v textu našla náhodou). Tisíce se píšou s mezerou (11 700).
    const scaleKnown = (spec, text) => {
        if (!spec || spec.type !== 'scale') return false;
        const normalize = (value) => String(value).replace(/(\d)[ \u00a0](?=\d{3}(?!\d))/g, '$1').replace(/(\d)\.(?=\d)/g, '$1,');
        const tokens = (normalize(spec.valueLabel || '').match(/\d+(?:,\d+)?/g) || []).filter(token => token.includes(',') || token.length >= 3);
        if (!tokens.length) return false;
        const haystack = normalize(text);
        return tokens.every(token => new RegExp(`(?<![\\d,])${token}(?![\\d]|,\\d)`).test(haystack));
    };
    // Časová osa, jejíž roky už říká text otázky nebo další věty, nic nepřidá. Rok z Wikidat a rok v textu se často liší
    // o rok či dva (obraz „datovaný do roku 1516“, Wikidata 1515; narození podle jiného kalendáře), proto stačí rok v textu
    // vzdálený nejvýš YEAR_SLACK let. Bere se letopočet od 100 do 2100, který není délkou ani počtem (1515 m, 1200 obyvatel).
    // Osa bez letopočtů (blind, otázka na století) roky neukazuje, takže nápovědou zůstane.
    const YEAR_SLACK = 5;
    const YEAR_IN_TEXT = /(?<![\d,.])(\d{3,4})(?!\d|[,.]\d|\s?(?:m\b|km|cm|mm|kg|g\b|t\b|l\b|%|obyv|lidí|osob|stran|kusů|mil|tis))/g;
    const timelineKnown = (spec, text) => {
        if (!spec || spec.type !== 'timeline' || spec.blind) return false;
        const years = [...(spec.points || []), ...(spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100);
        if (!years.length) return false;
        // Datum 15.10.1842 = 15. 10. 1842 (rok za tečkou data je letopočet, ne desetinné číslo)
        const dated = String(text || '').replace(/(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.\s?(?=\d{3,4}(?!\d))/g, '$1. $2. ');
        const inText = [...dated.matchAll(YEAR_IN_TEXT)].map(match => Number(match[1])).filter(year => year >= 100 && year <= 2100);
        return years.every(year => inText.some(seen => Math.abs(seen - year) <= YEAR_SLACK));
    };

    // Jméno nesprávné možnosti ve faktu (u Kerberose „Sourozenci: Chiméra, Hydra“, u Dia „Děti: Athéna, Apollón“) by ji
    // vyřadilo – kdo bere sourozence, ten je mezi možnostmi nehledá. Ze seznamu hodnot (čárka, „a“) se taková jména
    // vypustí, fakt bez zbytku zmizí. Porovnává se celé jméno bez diakritiky, nejen začátek.
    const SINGULAR_LABELS = { 'Rodiče': 'Rodič', Sourozenci: 'Sourozenec', Partneři: 'Partner', Partnerky: 'Partnerka', Děti: 'Dítě', Synové: 'Syn', Dcery: 'Dcera' };
    const dropChoiceNames = (facts, labels) => {
        const hidden = new Set((labels || []).map(normalizeAnswer).filter(Boolean));
        if (!hidden.size) return facts;
        const result = [];
        for (const fact of facts) {
            const value = String(fact.value);
            const parts = value.split(/,\s+|\s+a\s+/);
            const kept = parts.filter(part => !hidden.has(normalizeAnswer(part)));
            if (!kept.length) continue;
            result.push(kept.length === parts.length ? fact : { ...fact, label: kept.length === 1 ? SINGULAR_LABELS[fact.label] || fact.label : fact.label, value: kept.join(', ') });
        }
        return result;
    };

    // Slovo nápovědy a slovo odpovědi začínají stejně (antimon × antimonit, Babylón × Babylonie, valentiniánská × Valentinianus):
    // aspoň 4 shodná písmena a víc než ~65 % kratšího slova. Hodí se pro fakta u otázky na název – prozradila by kořen jména.
    const sharesWordRoot = (text, names) => {
        const nameWords = [...new Set(normalizeAnswer(names).split(' ').filter(word => word.length >= 5))];
        const textWords = normalizeAnswer(text).split(' ').filter(word => word.length >= 4 && !/\d/.test(word));
        const common = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
        return textWords.some(word => nameWords.some(other => { const length = common(word, other); return length >= 4 && length >= Math.min(word.length, other.length) * 0.65; }));
    };

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
    const inverseMercatorY = (y) => Math.atan(Math.sinh(y * Math.PI / 180)) * 180 / Math.PI;
    // Zeměpisné délky obrysu (ring = [délka×10, šířka×10, …]) pro mapu se středem v délce lon: obrys přes 180. poledník (Fidži,
    // Čukotka) se rozbalí, aby body navazovaly (skok 179,9° → −179,9° by jinak nakreslil čáru přes celou mapu), a celý se posune
    // o ±360°, aby ležel co nejblíž středu mapy
    const ringLons = (ring, lon) => {
        const lons = [];
        for (let i = 0; i < ring.length; i += 2) {
            let value = ring[i] / 10;
            if (lons.length) value += Math.round((lons[lons.length - 1] - value) / 360) * 360;
            lons.push(value);
        }
        const mean = lons.reduce((sum, value) => sum + value, 0) / (lons.length || 1);
        const shift = Math.round((lon - mean) / 360) * 360;
        return shift ? lons.map(value => value + shift) : lons;
    };
    const buildBlindMap = (world, { lat, lon, spanLon, width, height, highlightIso }) => {
        const scale = width / spanLon;
        const centerY = mercatorY(lat);
        const shapes = [];
        for (const country of world.countries) {
            let path = '';
            for (const ring of country.r) {
                const lons = ringLons(ring, lon);
                let ringPath = '';
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for (let i = 0; i < ring.length; i += 2) {
                    const x = (lons[i / 2] - lon) * scale + width / 2;
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

    // Kolik pixelů obrysů (pobřeží a hranic) je ve výřezu slepé mapy – uvnitř velkého státu (Rusko, USA, Brazílie)
    // bývá výřez jednolitá plocha bez jediné čáry
    const visibleOutline = (world, { lat, lon, spanLon, width, height }) => {
        const scale = width / spanLon;
        const centerY = mercatorY(lat);
        let total = 0;
        for (const country of world.countries) {
            for (const ring of country.r) {
                const lons = ringLons(ring, lon);
                let px = null, py = null;
                for (let i = 0; i < ring.length; i += 2) {
                    const x = (lons[i / 2] - lon) * scale + width / 2;
                    const y = height / 2 - (mercatorY(ring[i + 1] / 10) - centerY) * scale;
                    // Úsek se počítá, když je jeho střed ve výřezu (na odhad stačí)
                    if (px !== null && (px + x) / 2 >= 0 && (px + x) / 2 <= width && (py + y) / 2 >= 0 && (py + y) / 2 <= height) total += Math.hypot(x - px, y - py);
                    px = x; py = y;
                }
            }
        }
        return total;
    };
    const inRing = (ring, x, y, step = 2) => {
        let inside = false;
        for (let i = 0, j = ring.length - step; i < ring.length; j = i, i += step) {
            const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };
    // Šířka výřezu slepé mapy uvnitř velkého státu: když je výřez skoro celý pevnina a obrysů (pobřeží, hranic) v něm je
    // míň, než měří obvod mapy, mapa se oddálí (nejvýš na trojnásobek), až jsou vidět čáry, podle kterých se dá zorientovat.
    // Výřez s mořem (ostrovy, pobřeží) se nechá, jak je
    const onLand = (world, lat, lon) => world.countries.some(country => country.r.some(ring => inRing(ring, ((lon + 540) % 360 - 180) * 10, lat * 10)));
    const landShare = (world, { lat, lon, spanLon, width, height }) => {
        const scale = width / spanLon;
        let land = 0, total = 0;
        for (let i = 1; i < 6; i++) {
            for (let j = 1; j < 4; j++) {
                const x = lon + (i / 6 - 0.5) * spanLon;
                const y = mercatorY(lat) + (0.5 - j / 4) * height / scale;
                total++;
                if (onLand(world, inverseMercatorY(y), x)) land++;
            }
        }
        return land / total;
    };
    const blindMapSpan = (world, { lat, lon, spanLon, width, height }) => {
        const limit = Math.max(spanLon, Math.min(spanLon * 3, 100));
        const bare = (span) => visibleOutline(world, { lat, lon, spanLon: span, width, height }) < width + height
            && landShare(world, { lat, lon, spanLon: span, width, height }) > 0.8;
        if (!onLand(world, lat, lon)) return spanLon;
        let span = spanLon;
        while (span < limit && bare(span)) span = Math.min(span * 1.25, limit);
        return Math.round(span);
    };

    // --- Slepá mapa regionu (data/regiony.json, vlajky regionů a měst, znaky českých krajů a měst) ---
    // Celý stát s hranicemi svých krajů, spolkových zemí, provincií… a se sousedy; hledaný region zvýrazněný a tečka na něm.
    // Data jsou v Mercatorově zobrazení: x = zeměpisná délka, y = mercatorY(šířka), cesty celočíselně po q stupních, rozdílově.
    // f = rámec státu [x0, y0, x1, y1] (u Ruska chybí – celé by se nevešlo), i = regiony položek: b = rámec, p = tečka, r = obrys
    // Okraj kolem rámce; výřez kolem regionu, když se celý stát nevejde (Rusko, Chile či Kanada na nízkém širokém panelu),
    // nejširší výřez s celým státem a nejmenší výřez ve stupních
    const REGIONAL_PAD = 1.12;
    const REGIONAL_WINDOW = [40, 100];
    const REGIONAL_MAX_FIT = 130;
    const REGIONAL_MIN_SPAN = 3;
    const regionalView = (entry, target, aspect) => {
        const fit = ([x0, y0, x1, y1]) => Math.max(x1 - x0, (y1 - y0) * aspect);
        const box = target.b || [target.p[0], target.p[1], target.p[0], target.p[1]];
        if (entry.f) {
            const union = [Math.min(entry.f[0], box[0]), Math.min(entry.f[1], box[1]), Math.max(entry.f[2], box[2]), Math.max(entry.f[3], box[3])];
            // m = nejmenší výřez dat (u města se částmi desetiny stupně), jinak REGIONAL_MIN_SPAN
            const span = Math.max(fit(union) * REGIONAL_PAD, entry.m || REGIONAL_MIN_SPAN);
            if (span <= REGIONAL_MAX_FIT) return { x: (union[0] + union[2]) / 2, y: (union[1] + union[3]) / 2, span };
        }
        const span = Math.min(Math.max(fit(box) * 1.5, REGIONAL_WINDOW[0]), REGIONAL_WINDOW[1]);
        return { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2, span };
    };
    // Čísla cest po pěti bitech ve znacích base64url (šestý bit = pokračuje další znak), znaménko v nejnižším bitu
    const REGIONAL_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const DIGIT_VALUES = Object.fromEntries([...REGIONAL_DIGITS].map((digit, value) => [digit, value]));
    const decodeNumbers = (text) => {
        const numbers = [];
        let value = 0, shift = 1;
        for (const digit of text) {
            const chunk = DIGIT_VALUES[digit];
            value += (chunk & 31) * shift;
            if (chunk & 32) { shift *= 32; continue; }
            numbers.push(value % 2 ? -(value + 1) / 2 : value / 2);
            value = 0; shift = 1;
        }
        return numbers;
    };
    // Cesta SVG z rozdílově zapsaných prstenců (closed) či lomených čar; co je celé mimo výřez, se vynechá
    const regionalPath = (list, q, project, width, height, closed) => {
        let d = '';
        for (const text of list || []) {
            const encoded = decodeNumbers(text);
            let x = 0, y = 0, part = '';
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < encoded.length; i += 2) {
                x += encoded[i]; y += encoded[i + 1];
                const [px, py] = project(x * q, y * q);
                part += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
                minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            }
            if (maxX >= 0 && minX <= width && maxY >= 0 && minY <= height) d += closed ? `${part}Z` : part;
        }
        return d;
    };
    // Výřez a vrstvy regionální slepé mapy: own = stát, others = sousedé, region = hledaný region (jen když ho data znají),
    // lines = hranice regionů uvnitř státu, lakes = velká jezera; dot = tečka na hledaném místě (v px), regionSize = delší strana
    // rámce regionu v px (malý region potřebuje kolem tečky kroužek, aby byl vidět)
    // view = { lat, lon, span } jiný výřez (přiblížení na možnosti, tlačítka +/−), others = ostatní možnosti jako šedé tečky
    const buildRegionalMap = (entry, { item, lat, lon, width, height, view: wanted = null, others = [] }) => {
        const known = item && entry.i && entry.i[item];
        const target = known || { p: [lon, mercatorY(lat)] };
        const view = wanted ? { x: wanted.lon, y: mercatorY(wanted.lat), span: wanted.span } : regionalView(entry, target, width / height);
        const scale = width / view.span;
        const project = (x, y) => [(x - view.x) * scale + width / 2, height / 2 - (y - view.y) * scale];
        const layer = (list, closed = true) => regionalPath(list, entry.q, project, width, height, closed);
        const [dotX, dotY] = project(target.p[0], target.p[1]);
        return {
            lat: inverseMercatorY(view.y), lon: view.x, span: view.span,
            layers: { others: layer(entry.o), own: layer(entry.c), region: known ? layer(known.r) : '', lines: layer(entry.l, false), lakes: layer(entry.w) },
            dot: { x: dotX, y: dotY },
            others: others.map(point => { const [x, y] = project(point.lon, mercatorY(point.lat)); return { x, y }; }),
            regionSize: known && known.b ? Math.max(known.b[2] - known.b[0], known.b[3] - known.b[1]) * scale : 0
        };
    };


    // Výřez slepé mapy, jak ho nakreslí visuals.js, a data, ze kterých se kreslí: 'city' (části města), 'country' (regiony
    // státu) nebo 'world' (obrysy států). regions = data/regiony.json, world = data/world.json (null = nenačtené), width a height
    // = panel v px, zoom = násobek šířky výřezu z tlačítek +/− (2 = oddálit). Výchozí výřez: u regionu celý stát (u městské
    // části město), jinak výřez tématu kolem místa, uvnitř velkého státu oddálený, až jsou vidět hranice (blindMapSpan).
    // Přiblížení na možnosti (spec.fit) platí, jen když zabere nejvýš FIT_SHARE výchozího výřezu; oddálená mapa přejde
    // za rámcem dat na hrubší data (město → stát → svět).
    const COVER_FACTOR = 1.6;
    const mapExtent = (spec, { regions = null, world = null, width = 360, height = 224, zoom = 1 } = {}) => {
        const aspect = width / height;
        const regional = spec.regional || null;
        const country = regional && regions && regions.countries ? regions.countries[regional.country] || null : null;
        const city = regional && regional.city && regions && regions.cities ? regions.cities[regional.city] || null : null;
        const viewOf = (entry) => {
            const known = entry.i && entry.i[regional.item];
            const view = regionalView(entry, known || { p: [spec.lon, mercatorY(spec.lat)] }, aspect);
            return { lat: inverseMercatorY(view.y), lon: view.x, span: view.span };
        };
        let base = city ? viewOf(city) : country ? viewOf(country) : { lat: spec.lat, lon: spec.lon, span: spec.span };
        if (!city && !country && world && !spec.highlightIso) base = { ...base, span: blindMapSpan(world, { lat: base.lat, lon: base.lon, spanLon: base.span, width, height }) };
        const fitted = Boolean(spec.fit) && spec.fit.span <= base.span * FIT_SHARE;
        const view = fitted ? spec.fit : base;
        const span = Math.min(view.span * zoom, 360);
        const covers = (entry) => Boolean(entry) && span <= (entry.f ? Math.max(entry.f[2] - entry.f[0], (entry.f[3] - entry.f[1]) * aspect) * REGIONAL_PAD * COVER_FACTOR : REGIONAL_WINDOW[1]);
        const source = covers(city) ? 'city' : covers(country) ? 'country' : 'world';
        return { lat: view.lat, lon: view.lon, span, fitted, source, entry: source === 'city' ? city : source === 'country' ? country : null };
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
    // frozen = dny zachráněné ochranou série (rewards.js): série přes ně pokračuje, do délky se nepočítají
    const computeStreak = (dailyResults, todayKey, frozen = null) => {
        const saved = frozen instanceof Set ? frozen : new Set(frozen || []);
        let day = dailyResults[todayKey] ? todayKey : shiftDayKey(todayKey, -1);
        let streak = 0;
        for (let guard = 0; guard < 4000; guard++) {
            if (dailyResults[day] && dailyResults[day].correct) streak++;
            else if (!saved.has(day)) break;
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
    // Sovy titulů: jedenáct ilustrací icons/topics/sova-titul-1 … 11, každá patří k jednomu nebo několika po sobě jdoucím titulům;
    // číslo = úroveň prvního titulu stupně (Zvědavec 1, Učeň 7, Student 12, Znalec 18, Učenec 27, Odborník 36, Mistr 45, Docent 56, Mudrc 68,
    // Legenda 84, Mudrlant 100 – nejvyšší titul má vlastní sovu)
    const TITLE_OWL_FROM = [1, 7, 12, 18, 27, 36, 45, 56, 68, 84, 100];
    // Stupeň sovy titulu 1–11 pro úroveň
    const titleOwlTier = (level) => Math.max(1, TITLE_OWL_FROM.filter(from => level >= from).length);
    // Další titul (kdy a jaký), null na konci
    const nextTitle = (level) => LEVEL_TITLES.find(entry => entry.from > level) || null;
    // Za odpověď: správná 10 XP a 5 za každý bod (nejvýš 4 body, psaním dvojnásobek), špatná 2 XP za pokus, vzdání nic;
    // za otázku v opakování karet (review) polovina
    const answerXp = ({ correct, points = 0, gaveUp = false, review = false }) => {
        const xp = correct ? 10 + 5 * points : gaveUp ? 0 : 2;
        return review ? Math.ceil(xp / 2) : xp;
    };
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
        challenges: 0, wins: 0, winRun: 0, bestWinRun: 0, created: 0, perfectChallenges: 0, dailyCorrect: 0, fixed: 0, days: 0, lastDay: '', topics: {}, topicRun: {}, topicBest: {}, tourBest: 0, tourWins: 0,
        // Odehrané zápasy turnajů, zopakované karty (review.js) a týdny se všemi splněnými cíli (goals.js)
        tourPlayed: 0, reviewed: 0, weeksDone: 0,
        // Kvíz dne (dohrané dny, nejdelší série, bez chyby), Bleskovka a Přežití (rekord, hry, hry s aspoň 10 správnými / 15 přežitými),
        // Ukaž na mapě, Odhadni a Seřaď (zodpovězené, s plnými body nebo do 10 %), sdílené obrázky, otevřené truhly a použité ochrany série
        quizDone: 0, quizBestStreak: 0, quizPerfect: 0, blitzBest: 0, survivalBest: 0, blitzGames: 0, survivalGames: 0, blitzTen: 0, survivalFifteen: 0,
        mapAnswered: 0, mapExact: 0, estimateAnswered: 0, estimateGood: 0, orderAnswered: 0, orderPerfect: 0, sharedImages: 0, chestsOpened: 0, freezesUsed: 0,
        // Tajemná otázka dne (mystery.js): vyřešené dny
        mysterySolved: 0,
        // Boss týdne (boss.js): dohrané souboje a týdny s výhrou
        bossFights: 0, bossWins: 0
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
    addGroup('odpovedi', 'Správné odpovědi', 'target', (c) => c.correct, (g) => g === 1 ? 'První správná odpověď.' : `${g} správných odpovědí.`,
        [T(1, 'První krok', 'prvni-krok'), T(10, 'Rozjezd'), T(50, 'Pětapadesátka'), T(100, 'Stovka', 'stovka'), T(250, 'Čtvrt tisíce'), T(500, 'Pětistovka'),
            T(1000, 'Tisícovka', 'tisicovka'), T(2500, 'Dva a půl tisíce'), T(5000, 'Pět tisíc'), T(10000, 'Deset tisíc')]);
    addGroup('rada', 'Správně v řadě', 'zap', (c) => c.bestRun, (g) => `${g} správných odpovědí v řadě.`,
        [T(5, 'Rozcvička'), T(10, 'Střelec', 'strelec'), T(25, 'Neomylný', 'neomylny'), T(50, 'Bez chyby'), T(100, 'Stroj'), T(200, 'Nekonečná řada')]);
    addGroup('serie', 'Série dní', 'flame', (c) => c.bestStreak, (g) => `Série ${g} dní dnešních otázek.`,
        [T(3, 'Tři dny'), T(7, 'Týden s Mudrlantem', 'tyden'), T(14, 'Dva týdny'), T(30, 'Věrný měsíc', 'mesic'), T(60, 'Dva měsíce'), T(100, 'Stovka dní'), T(200, 'Dvě stě dní'), T(365, 'Celý rok')]);
    addGroup('dny', 'Dny ve hře', 'calendar-check', (c) => c.days, (g) => `Hrál jsi ${g} různých dní.`,
        [T(5, 'Stálý host'), T(15, 'Pravidelný'), T(30, 'Měsíc ve hře'), T(60, 'Ostřílený'), T(100, 'Sto her'), T(200, 'Veterán'), T(365, 'Rok s Mudrlantem')]);
    addGroup('dokonale', 'Dokonalé dny', 'sun', (c) => c.perfectDays, (g) => g === 1 ? 'Všechny dnešní otázky v jednom dni.' : `${g}× všechny dnešní otázky v jednom dni.`,
        [T(1, 'Dokonalý den', 'dokonaly-den'), T(3, 'Trojka dokonalých'), T(7, 'Týden dokonalosti'), T(14, 'Dva týdny dokonalosti'), T(30, 'Mistr dne'), T(60, 'Perfekcionista')]);
    addGroup('dnes', 'Dnešní otázky', 'calendar-days', (c) => c.dailyCorrect, (g) => `${g} správných dnešních otázek.`,
        [T(10, 'Denní rutina'), T(50, 'Padesát dnů'), T(100, 'Sto dnešních'), T(250, 'Čtvrt tisíce dnešních'), T(500, 'Pět set dnešních'), T(1000, 'Tisíc dnešních')]);
    addGroup('bez-napovedy', 'Bez nápovědy', 'eye-off', (c) => c.noHint, (g) => `${g} správných odpovědí bez jediné nápovědy.`,
        [T(10, 'Čistá hlava'), T(25, 'Bez nápovědy', 'bez-napovedy'), T(100, 'Sebejistý'), T(500, 'Neprůstřelný'), T(1000, 'Jasnozřivý'), T(2500, 'Jasnovidec')]);
    addGroup('psani', 'Psaní odpovědí', 'keyboard', (c) => c.typedCorrect, (g) => `${g} správných odpovědí napsaných ručně.`,
        [T(10, 'Písmák'), T(25, 'Pisatel', 'pisatel'), T(100, 'Mistr pera'), T(500, 'Kaligraf'), T(1000, 'Strojopisec'), T(2500, 'Mistr klávesnice')]);
    addGroup('tezke', 'Těžké otázky', 'pickaxe', (c) => c.hardCorrect, (g) => `${g} správných u těžších, méně známých otázek.`,
        [T(10, 'Do hloubky', 'do-hloubky'), T(50, 'Hlubinný průzkum'), T(200, 'Král hlubin'), T(500, 'Císař hlubin'), T(1000, 'Hlubinný velmistr')]);
    addGroup('chyby', 'Opravené chyby', 'repeat', (c) => c.fixed, (g) => `Opravil jsi ${g} dřívějších chyb.`,
        [T(10, 'Poučený'), T(50, 'Pracant na sobě'), T(200, 'Z chyb se člověk učí'), T(500, 'Věčný student'), T(1000, 'Mistr nápravy')]);
    addGroup('vyzvy', 'Výzvy', 'swords', (c) => c.challenges, (g) => g === 1 ? 'Dohraj první výzvu.' : `Dohraj ${g} výzev.`,
        [T(1, 'Soupeř', 'soupere'), T(5, 'Pravidelný soupeř'), T(25, 'Zkušený bojovník'), T(100, 'Stovka výzev'), T(250, 'Matador výzev'), T(500, 'Legenda arény')]);
    addGroup('vyhry', 'Výhry ve výzvách', 'trophy', (c) => c.wins, (g) => g === 1 ? 'Vyhraj výzvu proti jinému hráči.' : `Vyhraj ${g} výzev.`,
        [T(1, 'Vítěz', 'vitez'), T(5, 'Pětkrát nejlepší'), T(10, 'Gladiátor', 'gladiator'), T(25, 'Šampion'), T(50, 'Dobyvatel'), T(100, 'Nepřemožitelný')]);
    addGroup('vyhry-v-rade', 'Výhry v řadě', 'crown', (c) => c.bestWinRun, (g) => `${g} výher ve výzvách v řadě.`,
        [T(3, 'Hattrick'), T(5, 'Pětka v řadě'), T(10, 'Neporazitelný'), T(15, 'Nezastavitelný'), T(25, 'Nedotknutelný')]);
    addGroup('zalozene', 'Založené výzvy', 'users', (c) => c.created, (g) => `Založ ${g} ${g === 1 ? 'výzvu' : g < 5 ? 'výzvy' : 'výzev'}.`,
        [T(1, 'Vyzyvatel'), T(10, 'Organizátor'), T(50, 'Pán turnajů'), T(100, 'Mistr ceremonií'), T(250, 'Velkoorganizátor')]);
    addGroup('perfektni-vyzvy', 'Dokonalé výzvy', 'star', (c) => c.perfectChallenges, (g) => g === 1 ? 'Všechny otázky ve výzvě správně.' : `${g}× všechny otázky ve výzvě správně.`,
        [T(1, 'Bezchybný'), T(5, 'Pětkrát bezchybný'), T(25, 'Dokonalost sama'), T(50, 'Bezchybný mistr'), T(100, 'Stovka bez chyby')]);
    addGroup('uroven', 'Úrovně', 'graduation-cap', (c, x) => x.level, (g) => `Dosáhni úrovně ${g}.`,
        [T(5, 'Úroveň 5'), T(10, 'Úroveň 10', 'znalec'), T(20, 'Úroveň 20'), T(35, 'Úroveň 35', 'mudrc'), T(50, 'Úroveň 50'), T(65, 'Úroveň 65'), T(80, 'Úroveň 80'), T(100, 'Úroveň 100')]);
    addGroup('poznane', 'Poznané položky', 'book-open', (c, x) => x.learned, (g) => `Poznal jsi ${g} různých položek.`,
        [T(100, 'Sto poznaných'), T(500, 'Pět set poznaných'), T(1000, 'Tisíc poznaných'), T(3000, 'Tři tisíce poznaných'), T(5000, 'Pět tisíc poznaných'), T(10000, 'Deset tisíc poznaných')]);
    // Všestrannost: v kolika různých tématech hráč už správně odpověděl; hvězdy mistrovství v nějakém tématu a ve všech tématech
    const starsText = (g) => `${g} ${g === 1 ? 'hvězdu' : g < 5 ? 'hvězdy' : 'hvězd'}`;
    addGroup('vsestrannost', 'Všestrannost', 'globe', (c) => Object.keys(c.topics || {}).length, (g) => g >= 14 ? `Správná odpověď ve všech ${g} tématech.` : `Správná odpověď v ${g} různých tématech.`,
        [T(3, 'Rozhlížející se'), T(6, 'Všímavý'), T(9, 'Rozhledný'), T(12, 'Znalec mnoha oborů'), T(14, 'Všestranný', 'vsestranny')]);
    addGroup('hvezdy', 'Hvězdy mistrovství', 'star', (c, x) => Math.max(0, ...Object.values(x.topicStars || {})), (g) => `Získej ${starsText(g)} mistrovství v některém tématu.`,
        [T(1, 'První hvězda'), T(2, 'Dvě hvězdy'), T(3, 'Hvězdář', 'hvezdar'), T(4, 'Hvězda první velikosti'), T(5, 'Mistr oboru', 'mistr-oboru')]);
    addGroup('vsechna-temata', 'Mistr všech témat', 'crown', (c, x) => { const stars = Object.values(x.topicStars || {}); return x.topicCount && stars.length >= x.topicCount ? Math.min(...stars) : 0; }, (g) => `Získej ${starsText(g)} mistrovství ve všech tématech.`,
        [T(1, 'Všude začátečník'), T(2, 'Všude učeň'), T(3, 'Všude hvězdář'), T(4, 'Všude znalec'), T(5, 'Mistr všeho')]);
    // Za každé téma pět stupňů podle počtu správných odpovědí v něm (medaile má ilustraci tématu)
    const TOPIC_BADGES = [
        ['zemepis', 'Zeměpis', ['Poutník', 'Cestovatel', 'Objevitel', 'Světoběžník', 'Pán zeměkoule']], ['vlajky', 'Vlajky a znaky', ['Praporečník', 'Vlajkonoš', 'Heraldik', 'Vexilolog', 'Pán vlajek']],
        ['historie', 'Historie', ['Kronikář', 'Dějepisec', 'Pán času', 'Historik', 'Pán dějin']], ['mytologie', 'Mytologie', ['Pověrčivý', 'Bájeslovec', 'Zasvěcenec', 'Znalec bohů', 'Pán Olympu']],
        ['biologie', 'Biologie', ['Přírodovědec', 'Biolog', 'Pán přírody', 'Ekolog', 'Pán života']], ['geologie', 'Geologie', ['Sběratel', 'Geolog', 'Pán kamenů', 'Paleontolog', 'Pán země']],
        ['chemie', 'Chemie', ['Laborant', 'Chemik', 'Alchymista', 'Profesor chemie', 'Pán prvků']], ['fyzika', 'Fyzika', ['Experimentátor', 'Fyzik', 'Pán energie', 'Astrofyzik', 'Pán vesmíru']],
        ['umeni', 'Výtvarné umění', ['Divák galerie', 'Znalec umění', 'Mecenáš', 'Kurátor', 'Pán galerií']], ['architektura', 'Architektura', ['Stavitel', 'Architekt', 'Pán katedrál', 'Urbanista', 'Pán měst']],
        ['hudba', 'Hudba', ['Posluchač', 'Hudebník', 'Mistr tónů', 'Skladatel', 'Pán symfonií']], ['literatura', 'Literatura', ['Čtenář', 'Knihomol', 'Literát', 'Redaktor', 'Pán knihovny']],
        ['film', 'Film', ['Divák', 'Filmař', 'Režisér', 'Producent', 'Pán Hollywoodu']], ['sport', 'Sport', ['Fanoušek', 'Sportovec', 'Šampion sportu', 'Trenér', 'Pán stadionů']]
    ];
    TOPIC_BADGES.forEach(([topic, label, names]) => addGroup(`tema-${topic}`, label, 'medal', (c) => (c.topics || {})[topic] || 0,
        (g) => `${g} správných odpovědí v tématu ${label}.`, [T(25, names[0]), T(100, names[1]), T(300, names[2]), T(600, names[3]), T(1000, names[4])], { topic }));
    // Zběhlost v tématu: série správných odpovědí v něm. Stupeň 12 (nebo 3 hvězdy mistrovství v tématu) odemyká vtipný doplněk Mudrlanta,
    // ostatní stupně jsou další cíle
    const SKILL_RUN = 12;
    const SKILL_STARS = 3;
    const SKILL_TITLES = {
        zemepis: 'Navigátor', vlajky: 'Praporečník', historie: 'Pamětník', mytologie: 'Posel bohů', biologie: 'Lovec motýlů', geologie: 'Havíř',
        chemie: 'Pyrotechnik', fyzika: 'Geniální šílenec', umeni: 'Malíř', architektura: 'Stavbyvedoucí', hudba: 'Pěvecká hvězda',
        literatura: 'Básník', film: 'Kinomaniak', sport: 'Olympionik'
    };
    const SKILL_RANKS = {
        zemepis: ['Mapař', 'Kapitán', 'Admirál', 'Magellan'], vlajky: ['Stožárník', 'Standartonoš', 'Praporní mistr', 'Velitel praporů'],
        historie: ['Letopisec', 'Archivář', 'Kustod', 'Pán věků'], mytologie: ['Vypravěč', 'Věštec', 'Polobůh', 'Olympan'],
        biologie: ['Pozorovatel', 'Entomolog', 'Zoolog', 'Pán džungle'], geologie: ['Kutil', 'Zlatokop', 'Mineralog', 'Pán podzemí'],
        chemie: ['Míchač', 'Destilatér', 'Nobelista', 'Mendělejev'], fyzika: ['Měřič', 'Teoretik', 'Newton', 'Einstein'],
        umeni: ['Skicář', 'Impresionista', 'Mistr štětce', 'Velikán umění'], architektura: ['Zedník', 'Projektant', 'Hlavní architekt', 'Pán věží'],
        hudba: ['Zpěvák', 'Kapelník', 'Virtuos', 'Maestro'], literatura: ['Rýmovník', 'Spisovatel', 'Dramatik', 'Laureát'],
        film: ['Komparzista', 'Herec', 'Scenárista', 'Oscarový'], sport: ['Běžec', 'Závodník', 'Medailista', 'Legenda sportu']
    };
    TOPIC_BADGES.forEach(([topic, label]) => addGroup(`zbehly-${topic}`, `Zběhlost: ${label}`, 'medal',
        (c, x) => Math.max(((c.topicBest || {})[topic]) || 0, (((x && x.topicStars) || {})[topic] || 0) >= SKILL_STARS ? SKILL_RUN : 0),
        (g) => g === SKILL_RUN ? `${g} správných odpovědí v řadě v tématu ${label} nebo ${SKILL_STARS} hvězdy mistrovství v něm.` : `${g} správných odpovědí v řadě v tématu ${label}.`,
        [T(5, SKILL_RANKS[topic][0]), T(SKILL_RUN, SKILL_TITLES[topic], `zbehly-${topic}`), T(25, SKILL_RANKS[topic][1]), T(50, SKILL_RANKS[topic][2]), T(100, SKILL_RANKS[topic][3])], { topic }));
    // Turnaje: nejlepší umístění (1 = hrál, 2 = čtvrtfinále, 3 = semifinále, 4 = bronz, 5 = stříbro, 6 = vítěz) a vyhrané zápasy; počítadla dosazuje aplikace z databáze
    addGroup('turnaje', 'Turnaje', 'trophy', (c) => c.tourBest, (g) => ({ 1: 'Odehraj týdenní turnaj.', 2: 'Dostaň se v turnaji do čtvrtfinále.', 3: 'Dostaň se v turnaji do semifinále.', 4: 'Získej v turnaji bronz.', 5: 'Získej v turnaji stříbro.', 6: 'Vyhraj týdenní turnaj.' }[g]),
        [T(1, 'Turnajový hráč', 'turnaj-ucast'), T(2, 'Čtvrtfinalista', 'turnaj-ctvrtfinale'), T(3, 'Semifinalista', 'turnaj-semifinale'), T(4, 'Bronz z turnaje', 'turnaj-bronz'), T(5, 'Stříbro z turnaje', 'turnaj-stribro'), T(6, 'Mistr turnaje', 'turnaj-zlato')]);
    addGroup('turnaj-postupy', 'Vyhrané zápasy v turnajích', 'swords', (c) => c.tourWins, (g) => `${g} ${g === 1 ? 'vyhraný zápas' : 'vyhraných zápasů'} v turnajích.`,
        [T(1, 'První postup'), T(5, 'Pětkrát dál'), T(15, 'Turnajový matador'), T(30, 'Turnajový stratég'), T(60, 'Pán pavouka')]);
    // Týdenní cíle (goals.js): týdny, ve kterých hráč splnil všechny tři cíle
    addGroup('tydenni-cile', 'Týdenní cíle', 'goal', (c) => c.weeksDone, (g) => g === 1 ? 'Splň všechny tři cíle jednoho týdne.' : `${g} týdnů se všemi třemi splněnými cíli.`,
        [T(1, 'Cílevědomý', 'tydenni-cile'), T(5, 'Pět týdnů cílů'), T(10, 'Deset týdnů cílů'), T(20, 'Dvacet týdnů cílů'), T(52, 'Rok cílů')]);
    // Kvíz dne (daily-quiz.js): dohrané dny, nejdelší série a kvízy bez chyby
    addGroup('kviz-dne', 'Kvíz dne', 'timer', (c) => c.quizDone, (g) => g === 1 ? 'Dohraj svůj první Kvíz dne.' : `Dohraj ${g} Kvízů dne.`,
        [T(1, 'Kvízový nováček', 'kviz-dne'), T(10, 'Deset Kvízů dne'), T(50, 'Padesát Kvízů dne'), T(100, 'Sto Kvízů dne'), T(365, 'Rok Kvízů dne')]);
    addGroup('kviz-serie', 'Série Kvízu dne', 'flame', (c) => c.quizBestStreak, (g) => `Hraj Kvíz dne ${g} dní v řadě.`,
        [T(3, 'Kvízová trojka'), T(7, 'Kvízový týden', 'kviz-tyden'), T(14, 'Dva kvízové týdny'), T(30, 'Kvízový měsíc'), T(100, 'Sto kvízových dní')]);
    addGroup('kviz-perfekt', 'Kvíz dne bez chyby', 'sparkles', (c) => c.quizPerfect, (g) => g === 1 ? 'Všech 10 otázek Kvízu dne správně.' : `${g}× všech 10 otázek Kvízu dne správně.`,
        [T(1, 'Desítka', 'kviz-perfekt'), T(5, 'Pět dokonalých kvízů'), T(20, 'Kvízový mistr'), T(50, 'Kvízová legenda'), T(100, 'Sto desítek')]);
    // Bleskovka a Přežití (modes.js): nejlepší výsledek jedné hry v kterémkoli tématu nebo v Mixu
    addGroup('bleskovka', 'Bleskovka', 'zap', (c) => c.blitzBest, (g) => `V Bleskovce ${g} správných odpovědí za 60 sekund.`,
        [T(8, 'Rozběh'), T(12, 'Rychlík'), T(16, 'Blesk'), T(20, 'Hromovládce'), T(25, 'Rychlost světla')]);
    addGroup('preziti', 'Přežití', 'heart', (c) => c.survivalBest, (g) => `V Přežití přežij ${g} otázek v jedné hře.`,
        [T(10, 'Přeživší'), T(20, 'Houževnatý'), T(35, 'Nezdolný'), T(50, 'Nesmrtelný'), T(75, 'Legenda přežití')]);
    // Ukaž na mapě (plné body = tip v kruhu plných bodů), Odhadni číslo (do 10 %, u letopočtů a čísel o pár let či kusů) a Seřaď (celé pořadí)
    addGroup('mapa', 'Ukaž na mapě', 'crosshair', (c) => c.mapExact, (g) => `${g}× plné body v otázce Ukaž na mapě.`,
        [T(5, 'Kartograf'), T(25, 'Zeměměřič'), T(100, 'Živá mapa'), T(250, 'Živý glóbus'), T(500, 'Mistr map')]);
    addGroup('odhad', 'Přesné odhady', 'gauge', (c) => c.estimateGood, (g) => `${g} přesných odhadů (aspoň 3 body v otázce Odhadni číslo).`,
        [T(5, 'Odhadce'), T(25, 'Bystré oko'), T(100, 'Živé měřidlo'), T(250, 'Mistr odhadu'), T(500, 'Lidská kalkulačka')]);
    addGroup('serad', 'Seřaď bez chyby', 'list-ordered', (c) => c.orderPerfect, (g) => `${g}× celé pořadí správně v otázce Seřaď.`,
        [T(5, 'Pořádkumilovný'), T(25, 'Srovnávač'), T(100, 'Mistr pořadí'), T(250, 'Dokonalý pořádek'), T(500, 'Vládce pořadí')]);
    // Tajemná otázka dne (mystery.js): vyřešené tajemné otázky (jednou za den)
    addGroup('detektiv', 'Detektiv', 'telescope', (c) => c.mysterySolved, (g) => g === 1 ? 'Vyřeš svou první Tajemnou otázku dne.' : `Vyřeš ${g} Tajemných otázek dne.`,
        [T(1, 'Detektiv', 'detektiv'), T(7, 'Bystrý detektiv'), T(30, 'Mistr detektiv'), T(100, 'Slavný detektiv'), T(365, 'Legenda detektivů')]);
    // --- Album sbírky (album.js): milníky celé sbírky a celé sekce alba. Hodnotu dosazuje aplikace: x.album = { percent, sections: { sekce: procenta } }
    // (procenta jsou zaokrouhlená dolů, 100 znamená opravdu všechno). Odznaky alba se do alba samy nepočítají (album.js), jinak by 100 % nešlo
    // získat. Tituly jsou bez rodu (popisují sbírku, ne hráče; „Sběratel“ už je odznak geologie), jde je mít jako titul u jména.
    // Za 100 % je navíc rámeček Sběratelský (look.js).
    const ALBUM_MILESTONES = [[25, 'Sběratelská vášeň'], [50, 'Velká sbírka'], [75, 'Mistrovská sbírka'], [100, 'Legenda sbírky']];
    addGroup('sberatel', 'Sběratel', 'library', (c, x) => (x && x.album ? x.album.percent : 0), (g) => g >= 100 ? 'Celé album sbírky: všechno, co jde sbírat.' : `Album sbírky na ${g}\u00a0%.`,
        ALBUM_MILESTONES.map(([goal, title]) => T(goal, title, `sberatel-${goal}`)));
    // Celá sekce alba (krátký seznam: sekce, kde je celá sbírka opravdu úspěch; taláry, rámečky a barvy doplňků titul nemají)
    const ALBUM_SECTION_TITLES = [['avatars', 'Postavičky', 'Celý zvěřinec'], ['accessories', 'Doplňky Mudrlanta', 'Módní ikona'], ['themes', 'Barevná témata', 'Duhová duše'],
        ['badges', 'Odznaky', 'Síň slávy'], ['diplomas', 'Diplomy', 'Živá encyklopedie']];
    ALBUM_SECTION_TITLES.forEach(([section, label, title]) => addGroup(`album-${section}`, `Album: ${label}`, 'library',
        (c, x) => (x && x.album && x.album.sections ? x.album.sections[section] || 0 : 0), () => `Celá sekce alba ${label} (100\u00a0%).`, [T(100, title, `album-${section}`)]));
    const isAlbumBadge = (id) => /^(sberatel-\d+|album-[a-z]+)$/.test(String(id));
    // Barvy medailí alba: 25 % bronz, 50 % zlato, 75 % vínová, 100 % diamant; celá sekce zlatá
    BADGES.filter(badge => isAlbumBadge(badge.id) && (badge.group !== 'sberatel' || badge.goal === 50)).forEach(badge => { badge.tone = 'gold'; });
    // --- Boss týdne (boss.js): emblém za každého poraženého bosse (portrét v kulatém rámu), jeden stupeň na bosse. Hodnotu dosazuje aplikace:
    // x.bosses = { id bosse: týden první výhry }. Titul „Přemožitel …“ jde mít u jména a emblém vystavit ve Vitríně (b:boss-<id>).
    // Stejná id a pořadí jako BOSSES v boss.js (hlídá tests/boss.test.js); bossové budou přibývat po tématech, skupiny jen na konec.
    const BOSS_EMBLEMS = [
        ['kapitan', 'Kapitán Mudrlant', 'Kapitána Mudrlanta', 'Přemožitel Kapitána'], ['rytir', 'Rytíř Mudrlant', 'Rytíře Mudrlanta', 'Přemožitel Rytíře'],
        ['alchymista', 'Alchymista', 'Alchymistu', 'Přemožitel Alchymisty'], ['amper', 'Profesor Ampér', 'Profesora Ampéra', 'Přemožitel Profesora Ampéra'],
        ['maestro', 'Maestro', 'Maestra', 'Přemožitel Maestra'], ['druid', 'Druid', 'Druida', 'Přemožitel Druida'],
        ['olympan', 'Olympan', 'Olympana', 'Přemožitel Olympana'], ['reziser', 'Režisér', 'Režiséra', 'Přemožitel Režiséra']
    ];
    BOSS_EMBLEMS.forEach(([id, name, whom, title]) => addGroup(`boss-${id}`, `Boss týdne: ${name}`, 'swords', (c, x) => (x && x.bosses && x.bosses[id] ? 1 : 0),
        () => `Poraz bosse týdne ${whom}.`, [T(1, title, `boss-${id}`)]));
    const isBossBadge = (id) => /^boss-[a-z]+$/.test(String(id));
    BADGES.filter(badge => isBossBadge(badge.id)).forEach(badge => { badge.tone = 'gold'; });
    const BADGE_BY_ID =Object.fromEntries(BADGES.map(badge => [badge.id, badge]));
    const normalizeCounters = (counters) => ({ ...EMPTY_COUNTERS, ...(counters || {}), topics: { ...((counters && counters.topics) || {}) },
        topicRun: { ...((counters && counters.topicRun) || {}) }, topicBest: { ...((counters && counters.topicBest) || {}) } });
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

    // --- Nápovědy otázky: jedna cesta pro hru (app.js) i audit (scripts/lib/audit.mjs) ---
    //
    // Zásada: nápověda se nabídne jen tehdy, když přidá něco nového. Známé je už to, co hráč vidí bez nápovědy – otázka, štítek
    // druhu a kategorie, popisek obrázku, to, co mají všechny čtyři možnosti společné („Praha“ u čtyř obvodů) – a všechno,
    // co ukázaly dřívější nápovědy (text, další věty, fakta, roky na ose). Text, který nevznikl z článku (náhradní popis
    // z Wikidat, zadržený text), nápovědou není nikdy – pozná se podle původu (origin z buildQuestionTexts), ne podle znění.

    // Slova, která v porovnání textů nic nenesou (spojky, zájmena, pomocná slovesa)
    const PLAIN_WORDS = new Set(['jako', 'jeho', 'jeji', 'jejich', 'ktery', 'ktera', 'ktere', 'kteri', 'kterou', 'kterem', 'kterym', 'kterych', 'jsou', 'byl', 'byla',
        'bylo', 'byli', 'byly', 'bude', 'jest', 'take', 'tak', 'ale', 'nebo', 'jen', 'uz', 'nez', 'aby', 'pro', 'pri', 'pred', 'pod', 'nad', 'mezi', 'jeden',
        'jedna', 'jedno', 'jednoho', 'jedne', 'jednim', 'tento', 'tato', 'toto', 'tyto', 'tohoto', 'teto', 'tomto', 'tim', 'ten', 'ta', 'to', 'se', 'si', 'je',
        'jej', 'ji', 'jim', 'nim', 'nich', 'ni', 'ze', 've', 'na', 'do', 'od', 'po', 'za', 'ke', 'kde', 'kdy', 'co', 'cim', 'coz', 'take', 'rovnez', 'pak',
        'the', 'and', 'of', 'des', 'les', 'der', 'die', 'das', 'und', 'von']);
    const contentWords = (text) => normalizeAnswer(String(text || '').replace(/\[\*\*\*\]/g, ' ')).split(' ')
        .filter(word => word && (/\d/.test(word) || word.length >= 3) && !PLAIN_WORDS.has(word));
    // Klíč slova pro porovnání bez koncovek (geoglyfy × geoglyfů, obrazce × obrazců); čísla celá
    const wordKey = (word) => /^\d+$/.test(word) ? word : word.slice(0, Math.max(3, Math.min(5, word.length - 2)));
    // Slova textu, která v known ještě nebyla
    const newWords = (text, known) => {
        const keys = new Set(contentWords(known).map(wordKey));
        return contentWords(text).filter(word => !keys.has(wordKey(word)));
    };
    // Přidá text něco nového? Aspoň tři nová slova (u kratšího textu všechna) a aspoň čtvrtina jeho slov – jinak je to
    // stejný nebo skoro stejný text jako dřív (další věty, které opakují popis)
    const MIN_NEW_WORDS = 3;
    const MIN_NEW_SHARE = 0.25;
    const addsInformation = (text, known) => {
        const words = contentWords(text);
        if (!words.length) return false;
        const fresh = newWords(text, known).length;
        return fresh >= Math.min(MIN_NEW_WORDS, words.length) && fresh / words.length >= MIN_NEW_SHARE;
    };
    // Co mají všechny možnosti společné (Praha u Praha 1 až Praha 22): nic nerozliší, hráč to ví z možností samých
    const commonChoiceText = (question) => {
        const choices = (question && question.choices) || [];
        if (choices.length < 2) return '';
        const rest = choices.slice(1).map(choice => new Set(choiceTokens(choice.label)));
        return normalizeAnswer(choices[0].label).split(' ').filter(word => word && rest.every(tokens => tokens.has(choiceTokens(word)[0]))).join(' ');
    };

    // Slepá mapa v měřítku, které rozliší možnosti: když všechny možnosti leží blízko sebe (obvody jednoho města, místa jednoho
    // státu), mapa se přiblíží na ně – na celé zemi by byla tečka tam, kde ji čekají všechny možnosti. Ostatní možnosti jsou na
    // mapě šedé tečky. Jen přiblížení: rozložené možnosti nechají výřez tématu (rozhodne mapExtent). fit = { lat, lon, span }
    // (střed a šířka ve stupních délky), others = poloha ostatních možností; výřez se vejde i do nízkého panelu (FIT_ASPECT).
    const FIT_PAD = 1.8;
    const FIT_ASPECT = 2;
    const MIN_FIT_SPAN = 0.08;
    // Přiblížit, jen když možnosti zaberou nejvýš tolik výřezu tématu
    const FIT_SHARE = 0.5;
    // Nejužší výřez, na kterém obrysy států ještě něco ukážou (ve stupních délky)
    const WORLD_MIN_SPAN = 2;
    const pointOf = (other, ctx) => {
        const coords = ctx.topic.coords ? ctx.topic.coords(other, ctx) : other.la !== undefined ? { lat: other.la, lon: other.lo } : null;
        return coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon) ? coords : null;
    };
    const choicePoints = (question, ctx) => {
        if (!question || question.type !== 'name' || question.match || !ctx.byId) return [];
        return (question.choices || []).map(choice => {
            const other = ctx.byId.get(choice.id);
            const point = other && pointOf(other, ctx);
            return point ? { lat: point.lat, lon: point.lon, correct: Boolean(choice.correct) } : null;
        }).filter(Boolean);
    };
    const choicesView = (points) => {
        const lons = points.map(point => point.lon);
        const ys = points.map(point => mercatorY(point.lat));
        const lonRange = Math.max(...lons) - Math.min(...lons);
        if (lonRange > 180) return null;
        const span = Math.max(Math.max(lonRange, (Math.max(...ys) - Math.min(...ys)) * FIT_ASPECT) * FIT_PAD, MIN_FIT_SPAN);
        return { lat: inverseMercatorY((Math.max(...ys) + Math.min(...ys)) / 2), lon: (Math.max(...lons) + Math.min(...lons)) / 2, span: Math.round(span * 1000) / 1000 };
    };
    const fitMapToChoices = (spec, question, ctx) => {
        if (!spec || spec.type !== 'map') return spec;
        const points = choicePoints(question, ctx);
        if (points.length < 2 || points.filter(point => point.correct).length !== 1) return spec;
        const view = choicesView(points);
        if (!view) return spec;
        // Obrysy států (svět 1 : 110 mil.) jsou na užším výřezu nepoužitelné: možnosti blíž u sebe (mrakodrapy jednoho města)
        // mapa bez dat regionů nerozliší a místo, které mají společné, hráč z možností zná – taková mapa nápovědou není
        if (!spec.regional && view.span < WORLD_MIN_SPAN) return null;
        // Jestli se přiblíží, rozhodne mapExtent podle výchozího výřezu (u regionu celý stát z dat) a FIT_SHARE
        return { ...spec, fit: view, others: points.filter(point => !point.correct).map(({ lat, lon }) => ({ lat, lon })) };
    };

    // Nápovědy z plánu kroků: 'photo', 'text' (popis u otázky s obrázkem), 'excerpt' (další věty), 'visual', 'facts'.
    // known = co hráč ví bez nápovědy (otázka, štítek, popisek obrázku, společné části možností), visibleText = zadání a volně
    // viditelný popis, shared = hodnoty faktů, které mají všechny možnosti (nic mezi nimi nerozliší);
    // describeVisual(spec) → { name, icon } nebo null (neznámý druh obrázku)
    const buildHints = (plan, { photoUrl = null, visibleText = '', known = '', shared = new Set(), answers = [], textPhotos = new Set(), omit = [], rootCheck = false,
        extraGeneric = null, photoMasks = {}, describeVisual = () => null } = {}) => {
        // Fakt prozradí odpověď i tehdy, když obsahuje kterýkoli její tvar nebo začíná stejným kořenem jako jméno
        // (Těží se z něj: antimon u Antimonitu); společná kontrola s popisem (factRevealsAnswer)
        const rootNames = rootCheck && answers.length ? specificWords(answers, extraGeneric) : '';
        const revealsAnswer = (fact) => factRevealsAnswer(fact, answers, { isGeneric: (word) => isGenericWord(word, extraGeneric), rootNames });
        const hints = [];
        // Co už hráč viděl: zadání, známé věci a obsah všech dřívějších nápověd (text, další věty, fakta, roky na ose)
        let shownBefore = '';
        const seen = () => `${visibleText} · ${known} · ${shownBefore}`;
        for (const step of plan || []) {
            let hint = null;
            if (step.kind === 'photo' && photoUrl) hint = { kind: 'photo', label: 'fotka', icon: 'image' };
            // Popis u otázky s obrázkem: jen text z článku a jen když přidá něco nového; název díla (showName) je nový vždy
            if (step.kind === 'text') {
                const text = step.origin === 'article' && countRealWords(step.text) >= 3 && addsInformation(step.text, seen()) ? step.text : '';
                if (text || step.name) hint = { kind: 'text', text, name: step.name || '', label: step.name ? (text ? 'název a popis' : 'název') : 'popis', icon: 'quote' };
            }
            // Další věty z úvodu článku (bez jména), jen když nejsou (skoro) stejné jako to, co už hráč četl
            if (step.kind === 'excerpt' && step.text && addsInformation(step.text, seen())) hint = { kind: 'excerpt', text: step.text, label: 'další věty', icon: 'book-open' };
            // Obrázek s napsanou odpovědí (portrét autora se jménem) nápovědou není
            const textImage = step.spec && step.spec.type === 'image' && textPhotos.has(step.spec.file);
            const visual = step.kind === 'visual' && step.spec ? describeVisual(step.spec) : null;
            if (visual && !timelineKnown(step.spec, seen()) && !scaleKnown(step.spec, seen()) && !textImage) {
                const masks = step.spec.type === 'image' && photoMasks[step.spec.file];
                // Událost na časové ose se jménem odpovědi (autor, režisér) by ji prozradila: vynechá se jako události s hádanou položkou
                const spec = step.spec.type === 'timeline' && answers.length ? { ...step.spec, hide: [step.spec.hide, ...answers].filter(Boolean).join(', ') } : step.spec;
                hint = { kind: 'visual', spec: masks ? { ...spec, masks } : spec, label: visual.name, icon: visual.icon };
            }
            if (step.kind === 'facts') {
                // omit = jména nesprávných možností (Sourozenci: Chiméra, Hydra u Kerberose by je vyřadili)
                const facts = dropChoiceNames(dropKnownFacts(step.facts || [], seen()), omit)
                    .filter(fact => !shared.has(String(fact.value)) && !revealsAnswer(fact));
                // extra = vlastní nápověda tématu; po odpovědi se ukáže i mezi fakty
                if (facts.length) hint = { kind: 'facts', facts, label: step.label || 'čísla a fakta', icon: step.icon || 'info', extra: Boolean(step.label) };
            }
            if (!hint) continue;
            if (hint.kind === 'text') shownBefore += ` · ${hint.name} ${hint.text}`;
            if (hint.kind === 'excerpt') shownBefore += ` · ${hint.text}`;
            if (hint.kind === 'facts') shownBefore += ` · ${hint.facts.map(fact => fact.value).join(' · ')}`;
            if (hint.kind === 'visual' && hint.spec.type === 'timeline' && !hint.spec.blind) {
                shownBefore += ` · ${[...(hint.spec.points || []), ...(hint.spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100).join(' · ')}`;
            }
            let key = hint.kind;
            for (let n = 2; hints.some(other => other.key === key); n++) key = `${hint.kind}-${n}`;
            hints.push({ key, ...hint });
        }
        return hints;
    };

    // Kolik slov skutečného textu (bez zakrytých míst) má popis mít, aby z něj šla odpověď poznat nebo aspoň odhadnout,
    // a kolik další věty, aby byly nápovědou
    const MIN_DESCRIPTION_WORDS = 14;
    const MIN_EXCERPT_WORDS = 8;
    // Nápovědy jedné otázky: plán tématu (u století současníci a osa bez letopočtů, u vzorce složení), jinak fotka → obrazová
    // nápověda → čísla a fakta; před ně další věty úvodu a u otázky s obrázkem popis. texts = výsledek buildQuestionTexts,
    // shown = obrázek otázky (topic.questionImage), special = otázka zvláštního druhu. Vrátí nápovědy, fakta ukázaná hned
    // v okně (u chudého popisu), thin a to, co hráč vidí bez nápovědy (visibleText, known).
    const planRound = ({ item, ctx, question, texts, typeLabel, shown = null, special = false, photoUrl = null, describeVisual = () => null, photoMasks = {}, textPhotos = new Set() }) => {
        const { topic } = ctx;
        const category = (topic.categories || []).find(entry => entry.key === item.c) || { key: item.c, label: item.c, one: topic.words.one };
        const { questionText = '', moreText = '', origin = 'article' } = texts;
        // Příliš chudý popis („Zimbabwský politik.“) nestačí k odpovědi: když je popis jediná opora otázky, je „thin“
        const thin = !shown && !special && (origin !== 'article' || countRealWords(questionText) < MIN_DESCRIPTION_WORDS);
        const visual = topic.visual ? topic.visual(item, ctx, question.type) : null;
        // Otázka na mapě nápovědy nemá (popis i fakta by místo prozradily)
        const basePlan = question.type === 'map' ? [] : (topic.hints && topic.hints(item, ctx, question.type))
            || [{ kind: 'photo' }, { kind: 'visual', spec: visual }, { kind: 'facts', facts: topic.facts(item, ctx, question.type) }];
        // Pokračování úvodu článku (zakryté stejně jako popis) je první, nejlevnější nápověda; bez dost skutečných slov se vynechá
        const withExcerpt = countRealWords(moreText) >= MIN_EXCERPT_WORDS ? [{ kind: 'excerpt', text: moreText }, ...basePlan] : basePlan;
        // U otázky s obrázkem (obraz, vlajka, nerost…) se hádá z obrázku; popis je až první nápověda, ne hned viditelná záložka
        const plan = shown ? [{ kind: 'text', text: questionText, origin, name: question.showName ? item.n : '' }, ...withExcerpt] : withExcerpt;
        // Bez nápovědy hráč vidí otázku, štítek a (bez obrázku) popis s názvem díla; u otázky s obrázkem jsou název i popis až
        // v první nápovědě. Známé je i to, co mají společné všechny možnosti
        const visibleText = [question.title, typeLabel, ...(shown ? [] : [question.showName ? item.n : '', questionText])].filter(Boolean).join(' · ');
        const known = [category.one, category.label, shown && shown.label, commonChoiceText(question)].filter(Boolean).join(' · ');
        // Fakt, který mají všechny nesprávné možnosti stejný jako správná, mezi nimi nepomůže vybrat
        const wrongItems = question.type === 'name' && ctx.byId ? (question.choices || []).filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)).filter(Boolean) : [];
        // Porovnává se hodnota bez ohledu na popisek: nápověda tématu ji může nazvat jinak než seznam faktů (Stát × Patří k: USA
        // u čtyř amerických států)
        const factValues = (other) => new Set(topic.facts(other, ctx, question.type).map(fact => String(fact.value)));
        const wrongFacts = wrongItems.map(factValues);
        const shared = new Set(wrongFacts.length ? [...factValues(item)].filter(value => wrongFacts.every(values => values.has(value))) : []);
        let hints = buildHints(plan, {
            // Fotka, kterou otázka ukazuje hned, už nápovědou není; fotka s napsanou odpovědí také ne
            photoUrl: (shown && shown.file === item.im) || textPhotos.has(item.im) ? null : photoUrl,
            visibleText, known, shared, answers: answerNamesFor(question, item, ctx), textPhotos, photoMasks, describeVisual,
            rootCheck: question.type === 'name', extraGeneric: genericWordsOf(ctx),
            omit: question.match ? [] : (question.choices || []).filter(choice => !choice.correct).map(choice => choice.label)
        }).map(hint => hint.kind === 'visual' && hint.spec.type === 'map' ? { ...hint, spec: fitMapToChoices(hint.spec, question, ctx) } : hint)
            .filter(hint => !(hint.kind === 'visual' && !hint.spec));
        let leadFacts = [];
        if (thin) {
            ({ hints, leadFacts } = takeLeadFacts(hints));
            // Fakta ukázaná hned v okně hráč zná: nápověda, která je jen opakuje (osa s roky vlády, které už jsou mezi fakty), vypadne
            const lead = `${visibleText} · ${known} · ${leadFacts.map(fact => fact.value).join(' · ')}`;
            hints = hints.map(hint => hint.kind === 'facts' ? { ...hint, facts: dropKnownFacts(hint.facts, lead) } : hint)
                .filter(hint => !(hint.kind === 'facts' && !hint.facts.length) && !(hint.kind === 'visual' && (timelineKnown(hint.spec, lead) || scaleKnown(hint.spec, lead))));
        }
        return { hints, leadFacts, thin, visibleText, known, visual };
    };

    return {
        EMPTY_COUNTERS, BADGES, BADGE_GROUPS, BADGE_BY_ID, earnedBadgeIds, compactBadges, expandBadges, normalizeCounters,
        ALBUM_MILESTONES, ALBUM_SECTION_TITLES, isAlbumBadge,
        // Boss týdne: emblémy poražených bossů (odznaky boss-<id>)
        BOSS_EMBLEMS, isBossBadge,
        MAX_LEVEL, LEVEL_XP, questionsForLevel, xpForLevel, levelFromXp, levelProgress, LEVEL_TITLES, titleForLevel, nextTitle, TITLE_OWL_FROM, titleOwlTier, answerXp, DAILY_XP, DAILY_ALL_XP, streakXp, MASTERY_STEPS, masteryStars, nextMastery,
        UNKNOWN_COUNTRY, INTERNATIONAL_WATERS, CZECHIA_QID, AFTER_SYMBOL_WORD, TILE_SIZE, COUNTRIES, CONTINENT_NAMES,
        SATELLITE_TILES, OSM_TILES,
        escapeHtml, stripBrackets, isRealPhoto, commonsPhotoUrl, commonsFileUrl, displayName, plural, formatPoints,
        getDayKey, shiftDayKey, formatDayKey, createSeededRandom, pickRandom, pickWeighted, shuffle,
        ELEMENT_FAMILIES, elementFamily, periodicPosition,
        maskLeaks, findLeaks, answerTokens, foldKeys, isPersonName, genericWordsOf, isGenericWord, specificWords, absorbGenericWords, hideNicknames, CHOICE_MARK, hideOtherChoices,
        censorForItem, answerNamesOf, answerNamesFor, hideAnswer, OUT_OF_CONTEXT, buildQuestionTexts, factRevealsAnswer, GENERIC_NAME_WORDS,
        JOINING_WORDS, distinctiveTokens, structureLeaks, sealStructure, contentWords, newWords, addsInformation, commonChoiceText,
        choicePoints, choicesView, fitMapToChoices, FIT_SHARE, WORLD_MIN_SPAN, buildHints, planRound, MIN_DESCRIPTION_WORDS, MIN_EXCERPT_WORDS,
        setCountries, landOf, landsOf, landFromDescription, cultureDistance, CULTURE_GROUPS, cultureScore, cultureLandsFor, getWordStems, censorName, mergeCensored, censorCountry, isKnownCountry, processWikiText, stripFactSentences, takeLeadFacts, normalizeAnswer, levenshtein, isAnswerMatch, isSymbolMatch, isCenturyMatch, isFormulaMatch, formulaCounts, checkAnswer,
        inCollection, filterItems, levelOf, tierLevel, pickItem, sortItems, getCountryNames, getContinent, continentAt, getCountryAliases,
        distanceKm, nearness, STATE_STEPS, sharesGroup, eraNearness, personSimilarity, rankBySimilarity, takeDistinct,
        buildItemChoices, buildCountryChoices, findAnswerItem, findAnswerCountry, updateMistakes, nameAnswers, countryAnswers,
        pointsFor, dropKnownFacts, scaleKnown, timelineKnown, dropChoiceNames, sharesWordRoot, chooseDescription, censoredShare, MAX_CENSORED_SHARE, isFactVisible, formatNumber, formatPopulation, formatYear, formatFacts, getMapSpan, buildBlindMap, blindMapSpan, visibleOutline,
        mercatorY, inverseMercatorY, ringLons, regionalView, buildRegionalMap, mapExtent, REGIONAL_WINDOW, REGIONAL_DIGITS, decodeNumbers,
        buildTimeline, centuryOf, centuryLabel, computeStreak, buildShareText, getTileLayout
    };
});
