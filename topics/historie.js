// Téma Historie: panovníci, prezidenti a státníci, osobnosti, bitvy, války a revoluce, říše a státy minulosti (data/historie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatYear, formatFacts, centuryOf, centuryLabel, getCountryNames, shuffle, eraNearness, personSimilarity } = core;

    // portrait: fotky osob se zarovnají nahoru, ať je vidět obličej
    const PERSON = { question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', portrait: true, sort: { by: 'y' } };
    const CATEGORIES = [
        { key: 'panovnik', label: 'Panovníci', one: 'panovník', icon: 'crown', ...PERSON, spanLabel: 'vláda' },
        { key: 'statnik', label: 'Prezidenti a státníci', one: 'státník', icon: 'scale', ...PERSON, spanLabel: 'v úřadu' },
        { key: 'osobnost', label: 'Osobnosti', one: 'osobnost', icon: 'user', ...PERSON, spanLabel: 'v úřadu' },
        { key: 'bitva', label: 'Bitvy, války a revoluce', one: 'událost', icon: 'swords', question: 'Která bitva, válka nebo revoluce to je?', placeholder: 'Napiš název…', sort: { by: 'y' } },
        { key: 'rise', label: 'Říše a státy minulosti', one: 'stát', icon: 'castle', question: 'Který stát to je?', placeholder: 'Napiš název státu…', sort: { by: 'y' } }
    ];
    const isPerson = (item) => item.c === 'panovnik' || item.c === 'statnik' || item.c === 'osobnost';
    const categoryOf = (item) => CATEGORIES.find(category => category.key === item.c) || CATEGORIES[0];

    // Jak často se místo „Kdo to je?“ ptáme na století
    const CENTURY_QUIZ_SHARE = 0.3;

    // Otázka na století se ptá na jeden okamžik (nástup, narození, vznik), ne na celý život –
    // kdo žil na přelomu století (Eliška Přemyslovna 1292–1330), patřil by do obou
    const centuryEvent = (item) => {
        const f = item.f || {};
        const ending = item.sx === 'f' ? 'a' : '';
        if (item.c === 'panovnik' && f.from !== undefined) return { year: f.from, title: `Ve kterém století začal${ending} vládnout?` };
        if (item.c === 'statnik' && f.from !== undefined) return { year: f.from, title: `Ve kterém století nastoupil${ending} do úřadu?` };
        if (isPerson(item) && f.born !== undefined) return { year: f.born, title: `Ve kterém století se narodil${ending}?` };
        if (isPerson(item) && f.died !== undefined) return { year: f.died, title: `Ve kterém století zemřel${ending}?` };
        if (item.c === 'bitva' && f.year !== undefined) {
            const spansCenturies = f.end !== undefined && centuryOf(f.end) !== centuryOf(f.year);
            return { year: f.year, title: spansCenturies ? 'Ve kterém století to začalo?' : 'Ve kterém století se to odehrálo?' };
        }
        if (item.c === 'rise' && f.from !== undefined) return { year: f.from, title: 'Ve kterém století tento stát vznikl?' };
        return null;
    };
    // Století celého období („13.–14. století“), ve výsledku a v atlasu
    const centuryRange = (from, to) => {
        const first = centuryOf(from);
        const last = to === undefined ? first : centuryOf(to);
        if (first === last) return centuryLabel(first);
        if (first > 0 || last < 0) return first > 0 ? `${first}.–${last}. století` : `${-first}.–${-last}. století př. n. l.`;
        return `${centuryLabel(first)} – ${centuryLabel(last)}`;
    };
    const periodOf = (item) => {
        const f = item.f || {};
        if (isPerson(item)) return f.born !== undefined ? [f.born, f.died] : [f.y, f.y];
        if (item.c === 'bitva') return [f.year, f.end];
        return f.from !== undefined ? [f.from, f.to] : [f.y, f.y];
    };

    // Období: „871–899“, „753–509 př. n. l.“, „27 př. n. l. – 476“
    const range = (from, to) => {
        if (to === undefined || to === from) return formatYear(from);
        if (from < 0 && to < 0) return `${-from}–${-to} př. n. l.`;
        if (from < 0) return `${formatYear(from)} – ${formatYear(to)}`;
        return to < 1000 ? `${from}–${formatYear(to)}` : `${from}–${to}`;
    };

    // Fakta: roky se u otázky na století vynechají (prozradily by odpověď)
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const withYears = mode !== 'century';
        // Po odpovědi a v atlasu i století, ať se dá učit
        const [from, to] = periodOf(item);
        const century = (mode === 'result' || mode === 'card') && from !== undefined ? [{ label: 'Století', value: centuryRange(from, to) }] : [];
        if (isPerson(item)) {
            const facts = withYears ? formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear]], ['born', 'died']) : [];
            if (withYears && f.from !== undefined) facts.push({ label: item.c === 'panovnik' ? 'Vláda' : 'V úřadu', value: range(f.from, f.to) });
            return [...facts, ...century, ...formatFacts(item, [['dyn', 'Rod', v => v], ['land', 'Země', v => v]])];
        }
        if (item.c === 'bitva') {
            const facts = withYears ? [{ label: f.end ? 'Doba' : 'Rok', value: range(f.year, f.end) }] : [];
            return [...facts, ...century, ...formatFacts(item, [['war', 'Součást', v => v], ['place', 'Místo', v => v]])];
        }
        const facts = withYears ? [{ label: 'Doba trvání', value: range(f.from, f.to) }] : [];
        return [...facts, ...century, ...formatFacts(item, [['cap', 'Hlavní město', v => v]])];
    };

    // Orientační události na časové ose: světové pro všechny, k tomu události ze stejných dějin
    // (u anglického krále anglické, u českého české) – ty mají přednost
    const WORLD_EVENTS = [
        [-2560, 'pyramidy v Gíze'], [-776, 'první olympijské hry'], [-753, 'založení Říma'], [-44, 'zavraždění Caesara'],
        [1, 'počátek letopočtu'], [476, 'pád Západořímské říše'], [622, 'počátek islámu'], [800, 'korunovace Karla Velikého'],
        [1096, 'první křížová výprava'], [1347, 'morová epidemie v Evropě'], [1453, 'pád Konstantinopole'], [1492, 'objevení Ameriky'],
        [1517, 'počátek reformace'], [1648, 'konec třicetileté války'], [1776, 'nezávislost USA'], [1789, 'Velká francouzská revoluce'],
        [1815, 'bitva u Waterloo'], [1848, 'revoluce v Evropě'], [1914, 'začátek 1. světové války'], [1918, 'konec 1. světové války'],
        [1939, 'začátek 2. světové války'], [1945, 'konec 2. světové války'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi'],
        [2001, 'útoky 11. září']
    ];
    const REGIONS = {
        cesko: {
            match: /(?<!\p{L})(česk|čech|morav)/iu,
            events: [[863, 'příchod Cyrila a Metoděje'], [935, 'zavraždění sv. Václava'], [1085, 'první český král'], [1212, 'Zlatá bula sicilská'],
                [1278, 'bitva na Moravském poli'], [1306, 'vymření Přemyslovců'], [1348, 'založení Karlovy univerzity'], [1415, 'upálení Jana Husa'],
                [1526, 'nástup Habsburků'], [1620, 'bitva na Bílé hoře'], [1781, 'zrušení nevolnictví'], [1918, 'vznik Československa'],
                [1938, 'Mnichovská dohoda'], [1948, 'komunistický převrat'], [1968, 'pražské jaro'], [1989, 'sametová revoluce'], [1993, 'vznik České republiky']]
        },
        anglie: {
            match: /(?<!\p{L})(angli|brit|skot|wessex|spojené království)/iu,
            collections: ['anglicti-panovnici', 'plantageneti', 'tudorovci', 'stuartovci', 'windsorove', 'britsti-premieri', 'stoleta-valka'],
            events: [[43, 'římská invaze do Británie'], [410, 'odchod Římanů z Británie'], [793, 'vikingové v Lindisfarne'], [1066, 'bitva u Hastingsu'],
                [1215, 'Magna charta'], [1337, 'začátek stoleté války'], [1455, 'začátek válek růží'], [1534, 'vznik anglikánské církve'],
                [1588, 'porážka španělské Armady'], [1642, 'anglická občanská válka'], [1707, 'vznik Velké Británie'], [1805, 'bitva u Trafalgaru'],
                [1940, 'bitva o Británii']]
        },
        francie: {
            match: /(?<!\p{L})(franc|frans|galie)/iu,
            collections: ['francouzsti-panovnici', 'karlovci', 'valoisove', 'bourboni', 'napoleonske-valky', 'stoleta-valka'],
            events: [[496, 'křest Chlodvíka'], [843, 'rozdělení Franské říše'], [987, 'nástup Kapetovců'], [1337, 'začátek stoleté války'],
                [1429, 'Johanka z Arku u Orléansu'], [1572, 'Bartolomějská noc'], [1598, 'edikt nantský'], [1789, 'Velká francouzská revoluce'],
                [1804, 'Napoleon císařem'], [1830, 'červencová revoluce'], [1870, 'pád druhého císařství'], [1958, 'vznik páté republiky']]
        },
        nemecko: {
            match: /(?<!\p{L})(něm|prus|svatá říše|svaté říše|rakous|bavor|sas|habsbur|hohenzollern)/iu,
            collections: ['cisari-srr', 'hohenzollernove', 'nemecti-kancleri', 'habsburkove', 'tricetileta-valka'],
            events: [[962, 'vznik Svaté říše římské'], [1077, 'cesta do Canossy'], [1356, 'Zlatá bula Karla IV.'], [1517, 'počátek reformace'],
                [1618, 'začátek třicetileté války'], [1683, 'obléhání Vídně Turky'], [1740, 'nástup Marie Terezie'], [1806, 'zánik Svaté říše římské'],
                [1866, 'prusko-rakouská válka'], [1871, 'sjednocení Německa'], [1933, 'nástup nacistů k moci'], [1961, 'stavba Berlínské zdi'],
                [1990, 'sjednocení Německa']]
        },
        rusko: {
            match: /(?<!\p{L})(rus|sovět|kyjev|moskv)/iu,
            collections: ['rusti-panovnici', 'romanovci'],
            events: [[862, 'počátek Rusi'], [988, 'křest Kyjevské Rusi'], [1240, 'mongolský vpád'], [1480, 'konec tatarské nadvlády'],
                [1613, 'nástup Romanovců'], [1703, 'založení Petrohradu'], [1812, 'Napoleonovo tažení na Moskvu'], [1861, 'zrušení nevolnictví'],
                [1917, 'Říjnová revoluce'], [1941, 'napadení SSSR Německem'], [1991, 'rozpad SSSR']]
        },
        usa: {
            match: /(?<!\p{L})(spojené státy|spojených států|americk)/iu,
            collections: ['prezidenti-usa'],
            events: [[1607, 'založení Jamestownu'], [1620, 'plavba lodi Mayflower'], [1776, 'Deklarace nezávislosti'], [1803, 'koupě Louisiany'],
                [1861, 'začátek občanské války'], [1865, 'zrušení otroctví'], [1929, 'velká hospodářská krize'], [1941, 'útok na Pearl Harbor'],
                [1963, 'atentát na Kennedyho'], [2001, 'útoky 11. září']]
        },
        rim: {
            match: /(?<!\p{L})(řím|římsk|byzan)/iu,
            collections: ['rimsti-cisari', 'juliovsko-claudiovska'],
            events: [[-509, 'vznik římské republiky'], [-264, 'první punská válka'], [-218, 'Hannibal v Itálii'], [-44, 'zavraždění Caesara'],
                [-27, 'vznik císařství'], [64, 'požár Říma'], [79, 'výbuch Vesuvu'], [313, 'Milánský edikt'], [395, 'rozdělení říše'],
                [476, 'pád Západořímské říše'], [1453, 'pád Konstantinopole']]
        },
        egypt: {
            match: /egypt|faraon|ptolema/iu,
            collections: ['faraoni'],
            events: [[-2560, 'pyramidy v Gíze'], [-1274, 'bitva u Kadeše'], [-525, 'perský vpád'], [-332, 'Alexandr Veliký v Egyptě'],
                [-30, 'Egypt římskou provincií']]
        }
    };
    // Ke kterým dějinám položka patří: podle okruhů, země, rodu, místa a popisu
    const regionsOf = (item) => {
        const f = item.f || {};
        // Svatá říše římská patří k německým dějinám, ne k Římu
        const text = [f.land, f.place, f.war, f.dyn, f.cap, item.ty, item.n].filter(Boolean).join(' · ').replace(/svat[áé] říš[ei] římsk[áé]/giu, 'Svatá říše');
        return Object.keys(REGIONS).filter(key => (key === 'cesko' && item.cz === 1) || REGIONS[key].match.test(text)
            || (REGIONS[key].collections || []).some(id => (item.g || []).includes(id)));
    };
    const regionCache = new WeakMap();
    const cachedRegions = (item) => {
        if (!regionCache.has(item)) regionCache.set(item, regionsOf(item));
        return regionCache.get(item);
    };
    // Události pro osu kolem let položky (osa sahá nejvýš 300 let na každou stranu)
    const eventsFor = (item, years) => {
        const min = Math.min(...years) - 320;
        const max = Math.max(...years) + 320;
        // Hlavní dějiny (první v pořadí) mají přednost před vedlejšími
        const near = regionsOf(item).flatMap((key, index) => REGIONS[key].events.map(([year, text]) => [year, text, index === 0 ? 2 : 1]));
        const nearYears = new Set(near.map(([year]) => year));
        return [...near, ...WORLD_EVENTS.filter(([year]) => !nearYears.has(year))].filter(([year]) => year >= min && year <= max);
    };

    // Časová osa (u bitev se souřadnicemi slepá mapa); u otázky na století by roky na ose prozradily odpověď
    const visualOf = (item, ctx, mode) => {
        const visual = timelineOf(item, ctx, mode);
        if (!visual || visual.type !== 'timeline') return visual;
        const years = [...visual.spans.flatMap(span => [span.from, span.to]), ...visual.points].filter(Number.isFinite);
        return years.length ? { ...visual, anchors: eventsFor(item, years) } : null;
    };
    const timelineOf = (item, ctx, mode) => {
        const f = item.f || {};
        if (item.c === 'bitva' && item.la !== undefined) {
            return { type: 'map', lat: item.la, lon: item.lo, span: 24, highlightIso: '', label: 'Místo je uprostřed' };
        }
        if (mode === 'century') return null;
        if (isPerson(item)) {
            const spans = [];
            if (f.born !== undefined && f.died !== undefined) spans.push({ kind: 'life', from: f.born, to: f.died });
            if (f.from !== undefined) spans.push({ kind: 'reign', from: f.from, to: f.to ?? f.died ?? f.from });
            return spans.length ? { type: 'timeline', spans, points: [], hide: item.n, spanLabel: categoryOf(item).spanLabel } : null;
        }
        if (item.c === 'bitva') {
            return f.end ? { type: 'timeline', spans: [{ kind: 'reign', from: f.year, to: f.end }], points: [], hide: item.n, spanLabel: 'trvání' }
                : { type: 'timeline', spans: [], points: [f.year], hide: item.n };
        }
        return { type: 'timeline', spans: [{ kind: 'reign', from: f.from, to: f.to }], points: [], hide: item.n, spanLabel: 'trvání' };
    };

    const subtitle = (item, { countries }) => {
        const f = item.f || {};
        if (isPerson(item)) {
            const life = f.born !== undefined ? range(f.born, f.died) : '';
            return [life, f.land].filter(Boolean).join(' · ') || categoryOf(item).one;
        }
        if (item.c === 'bitva') return [range(f.year, f.end), f.place || getCountryNames(item, countries)[0]].filter(Boolean).join(' · ');
        return range(f.from, f.to);
    };

    // Roky a století z textu u otázky na století zmizí
    const hideYears = (text) => text.replace(/(?<![\p{L}\d])\d{1,4}(?!\d)(\.\s*(?:století|stol\.))?/gu, '[***]');

    return {
        id: 'historie',
        title: 'Historie',
        icon: 'scroll',
        emoji: '📜',
        color: 'amber',
        dataFile: 'data/historie.json',
        subtitleIcon: 'calendar-range',
        words: {
            question: 'Kdo nebo co to je?',
            one: 'osobnost',
            next: 'Další otázka',
            atlas: 'Atlas dějin',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavní panovníci, prezidenti, bitvy'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: stejné pohlaví a podobná doba, stejné dějiny (anglický král k anglickým), rod, válka
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            let score = isPerson(item) ? personSimilarity(item, other) : eraNearness(f.y, g.y);
            if (isPerson(item) && f.dyn && f.dyn === g.dyn) score += 1;
            if (item.c === 'bitva' && f.war && f.war === g.war) score += 3;
            const regions = cachedRegions(item);
            if (regions.length && cachedRegions(other).some(region => regions.includes(region))) score += 2;
            return score;
        },

        // Občas „Ve kterém století začal vládnout?“ (narodila se, odehrálo se…) – jméno je pak vidět a z popisu zmizí letopočty
        specialQuestion: (item, ctx, rng) => {
            if (!(rng() < CENTURY_QUIZ_SHARE)) return null;
            const event = centuryEvent(item);
            // Rok 1300 patří do 13. století, většina lidí by ale řekla 14. – takovou otázku vynecháme
            if (!event || event.year % 100 === 0) return null;
            const century = centuryOf(event.year);
            // Nesprávná století co nejblíž: obě sousední, pak o dvě dál (u Washingtona 17., 19., 16. – ne 15. nebo 21.)
            const shift = (offset) => {
                let result = century + offset;
                if (century < 0 && result >= 0) result += 1;
                if (century > 0 && result <= 0) result -= 1;
                return result;
            };
            const wrong = [...shuffle([-1, 1], rng), ...shuffle([-2, 2], rng), ...shuffle([-3, 3], rng)].map(shift)
                .filter(c => c <= 21 && !(c === 21 && century < 20)).slice(0, 3);
            return {
                type: 'century',
                title: event.title,
                showName: true,
                choices: shuffle([century, ...wrong], rng).map(c => ({ id: `stoleti-${c}`, label: centuryLabel(c), correct: c === century })),
                accepted: century > 0 ? [String(century), `${century}.`, centuryLabel(century)] : [centuryLabel(century)],
                placeholder: 'Napiš století, třeba 14',
                answerLabel: centuryLabel(century)
            };
        },
        censor: (type, text) => type === 'century' ? hideYears(text) : null,

        visual: visualOf,
        regionsOf,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle,
        coords: (item) => item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1
    };
});
