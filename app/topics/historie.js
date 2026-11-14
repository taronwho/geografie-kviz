// Téma Historie: panovníci, prezidenti a státníci, osobnosti, bitvy, války a revoluce, události, říše a státy minulosti (data/historie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatYear, formatFacts, centuryOf, centuryLabel, getCountryNames, shuffle, eraNearness, personSimilarity, buildCountryChoices, countryAnswers,
        censorCountry, getCountryAliases, findAnswerCountry, distanceKm, censorName } = core;

    const PERSON = { question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } };
    const CATEGORIES = [
        { key: 'panovnik', label: 'Panovníci', one: 'panovník', icon: 'crown', ...PERSON, spanLabel: 'vláda' },
        { key: 'statnik', label: 'Prezidenti a státníci', one: 'státník', icon: 'scale', ...PERSON, spanLabel: 'v úřadu' },
        { key: 'osobnost', label: 'Osobnosti', one: 'osobnost', icon: 'user', ...PERSON, spanLabel: 'v úřadu' },
        { key: 'bitva', label: 'Bitvy, války a revoluce', one: 'událost', icon: 'swords', question: 'Která bitva, válka nebo revoluce to je?', placeholder: 'Napiš název…', sort: { by: 'y' } },
        { key: 'udalosti', label: 'Události', one: 'událost', icon: 'calendar-days', question: 'Která událost to je?', placeholder: 'Napiš název události…', sort: { by: 'y' } },
        { key: 'rise', label: 'Říše a státy minulosti', one: 'stát', icon: 'castle', question: 'Který stát to je?', placeholder: 'Napiš název státu…', sort: { by: 'y' } }
    ];
    const isPerson = (item) => item.c === 'panovnik' || item.c === 'statnik' || item.c === 'osobnost';
    // Událost je součástí jiné (f.war: Říjnová revoluce → Ruská revoluce, bitva u Azincourtu → stoletá válka)
    // Událost má stejná fakta jako bitva (rok, místo, součást) a slepou mapu, když je známé místo
    const isEvent = (item) => item.c === 'bitva' || item.c === 'udalosti';
    // Smlouvy, listiny a konference se „podepisují“ a „konají“, ostatní události se „staly“
    const isTreaty = (item) => item.c === 'udalosti' && /smlouva|listina/u.test(item.ty || '');
    const EVENT_GROUPS = [['dohody', /smlouva|listina|konference|koncil|proces|korunovace/u], ['katastrofy', /zemětřesení|epidemie|hladomor|požár|povodeň|havárie|výbuch sopky|krize/u],
        ['nasili', /masakr|atentát|převrat|protest|invaze/u], ['vypravy', /expedice/u]];
    const eventGroup = (item) => item.c === 'udalosti' ? (EVENT_GROUPS.find(([, pattern]) => pattern.test(item.ty || '')) || [])[0] : undefined;
    const isPartOf = (part, whole) => Boolean((part.f || {}).war) && part.f.war.toLocaleLowerCase('cs') === whole.n.toLocaleLowerCase('cs');
    const categoryOf = (item) => CATEGORIES.find(category => category.key === item.c) || CATEGORIES[0];

    // Jak často se místo „Kdo to je?“ ptáme na století (u události ještě na stát)
    const CENTURY_QUIZ_SHARE = 0.3;
    const COUNTRY_QUIZ_SHARE = 0.5;

    // Otázka na století se ptá na jeden okamžik (nástup, narození, vznik), ne na celý život –
    // kdo žil na přelomu století (Eliška Přemyslovna 1292–1330), patřil by do obou
    // Rok narození u starověkých osob bývá jen odhad (−3000, 500) – na takový se neptáme
    const isEstimate = (year) => year < 1500 && year % 50 === 0;
    const THIS_YEAR = new Date().getFullYear();
    // Nesmyslné údaje z Wikidat (úmrtí před narozením, konec před začátkem, budoucnost) otázku na století vyřadí
    const hasValidDates = (f) => !(f.born !== undefined && f.died !== undefined && f.died <= f.born)
        && !(f.year !== undefined && f.end !== undefined && f.end < f.year)
        && !(f.from !== undefined && f.to !== undefined && f.to < f.from)
        && [f.born, f.died, f.from, f.year].every(year => year === undefined || year <= THIS_YEAR);
    const centuryEvent = (item) => {
        const f = item.f || {};
        if (!hasValidDates(f)) return null;
        const ending = item.sx === 'f' ? 'a' : '';
        if (item.c === 'panovnik' && f.from !== undefined) return { year: f.from, title: `Ve kterém století začal${ending} vládnout?` };
        // Úřad i u papežů a dalších osobností – narození je u nich často jen odhad
        if (isPerson(item) && f.from !== undefined) return { year: f.from, title: `Ve kterém století nastoupil${ending} do úřadu?` };
        if (isPerson(item) && f.born !== undefined && !isEstimate(f.born)) return { year: f.born, title: `Ve kterém století se narodil${ending}?` };
        if (isPerson(item) && f.died !== undefined && !isEstimate(f.died)) return { year: f.died, title: `Ve kterém století zemřel${ending}?` };
        if (isTreaty(item) && f.year !== undefined) return { year: f.year, title: 'Ve kterém století byla podepsána?' };
        if (isEvent(item) && f.year !== undefined) {
            const spansCenturies = f.end !== undefined && centuryOf(f.end) !== centuryOf(f.year);
            return { year: f.year, title: spansCenturies ? 'Ve kterém století to začalo?' : item.c === 'udalosti' ? 'Ve kterém století se to stalo?' : 'Ve kterém století se to odehrálo?' };
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
        if (isEvent(item)) return [f.year, f.end];
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
    // Místo války, která se vedla ve více státech, nesmí být jen jeden z nich (Válka v Pásmu Gazy → Írán)
    const placeOf = (item, countries) => {
        const place = (item.f || {}).place;
        const names = countries ? getCountryNames(item, countries) : [];
        return place && names.length > 2 && names.includes(place) ? undefined : place;
    };
    const factsOf = (item, mode, countries) => {
        const f = { ...(item.f || {}), place: placeOf(item, countries) };
        const withYears = mode !== 'century';
        // Po odpovědi a v atlasu i století, ať se dá učit
        const [from, to] = periodOf(item);
        const century = (mode === 'result' || mode === 'card') && from !== undefined ? [{ label: 'Století', value: centuryRange(from, to) }] : [];
        if (isPerson(item)) {
            const facts = withYears ? formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear]], ['born', 'died']) : [];
            if (withYears && f.from !== undefined) facts.push({ label: item.c === 'panovnik' ? 'Vláda' : 'V úřadu', value: range(f.from, f.to) });
            return [...facts, ...century, ...formatFacts(item, [['dyn', 'Rod', v => v], ['land', 'Země', v => v]])];
        }
        if (isEvent(item)) {
            const facts = withYears ? [{ label: f.end ? 'Doba' : 'Rok', value: range(f.year, f.end) }] : [];
            // U otázky na stát místo ani stát nezazní
            const where = mode === 'location' ? [] : [['place', 'Místo', v => v]];
            const state = item.c === 'udalosti' && mode !== 'location' && countries ? getCountryNames(item, countries) : [];
            return [...facts, ...century, ...formatFacts({ ...item, f }, [['war', 'Součást', v => v], ...where]),
                ...(state.length && state.length <= 2 && !state.includes(f.place) ? [{ label: state.length > 1 ? 'Státy' : 'Stát', value: state.join(', ') }] : [])];
        }
        const facts = withYears ? [{ label: 'Doba trvání', value: range(f.from, f.to) }] : [];
        return [...facts, ...century, ...formatFacts(item, [['cap', 'Hlavní město', v => v]])];
    };

    // Orientační události na časové ose: světové pro všechny, k tomu události ze stejných dějin
    // (u anglického krále anglické, u českého české) – ty mají přednost
    const WORLD_EVENTS = [
        [-2560, 'pyramidy v Gíze'], [-1750, 'Chammurapiho zákoník'], [-1550, 'počátek Nové říše v Egyptě'], [-1279, 'nástup Ramesse II.'],
        [-1200, 'pád Tróje'], [-1000, 'král David v Jeruzalémě'], [-776, 'první olympijské hry'],
        [-753, 'založení Říma'], [-490, 'bitva u Marathónu'], [-447, 'stavba Parthenónu'], [-399, 'smrt Sókrata'],
        [-323, 'smrt Alexandra Velikého'], [-221, 'sjednocení Číny'], [-44, 'zavraždění Caesara'], [-27, 'vznik římského císařství'],
        [1, 'počátek letopočtu'], [79, 'výbuch Vesuvu'], [313, 'Milánský edikt'], [395, 'rozdělení Římské říše'],
        [476, 'pád Západořímské říše'], [622, 'počátek islámu'], [732, 'bitva u Poitiers'], [800, 'korunovace Karla Velikého'],
        [962, 'vznik Svaté říše římské'], [1054, 'rozkol církve na západní a východní'], [1066, 'bitva u Hastingsu'], [1096, 'první křížová výprava'], [1215, 'Magna charta'], [1291, 'konec křižáckých států'], [1347, 'morová epidemie v Evropě'], [1453, 'pád Konstantinopole'], [1492, 'objevení Ameriky'],
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
        // U otázky na stát by mapa odpověď prozradila
        if (mode === 'location') return null;
        if (isEvent(item) && item.la !== undefined) {
            return { type: 'map', lat: item.la, lon: item.lo, span: 24, highlightIso: '', label: 'Místo je uprostřed' };
        }
        if (mode === 'century') return null;
        return withAnchors(item, timelineOf(item));
    };
    const yearsOf = (spec) => [...spec.spans.flatMap(span => [span.from, span.to]), ...spec.points].filter(Number.isFinite);
    const withAnchors = (item, spec) => spec && yearsOf(spec).length ? { ...spec, anchors: eventsFor(item, yearsOf(spec)) } : null;
    const timelineOf = (item) => {
        const f = item.f || {};
        if (isPerson(item)) {
            const spans = [];
            // Žijící (narozen před méně než 100 lety, bez úmrtí): život i úřad až do dneška
            const alive = f.died === undefined && f.born !== undefined && f.born > THIS_YEAR - 100;
            const died = alive ? THIS_YEAR : f.died;
            if (f.born !== undefined && died !== undefined) spans.push({ kind: 'life', from: f.born, to: died });
            if (f.from !== undefined) spans.push({ kind: 'reign', from: f.from, to: f.to ?? (alive ? THIS_YEAR : f.died ?? f.from) });
            return spans.length ? { type: 'timeline', spans, points: [], hide: item.n, spanLabel: categoryOf(item).spanLabel } : null;
        }
        if (isEvent(item)) {
            if (f.year === undefined) return null;
            return f.end ? { type: 'timeline', spans: [{ kind: 'reign', from: f.year, to: f.end }], points: [], hide: item.n, spanLabel: 'trvání' }
                : { type: 'timeline', spans: [], points: [f.year], hide: item.n };
        }
        if (f.from === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'reign', from: f.from, to: f.to }], points: [], hide: item.n, spanLabel: 'trvání' };
    };

    // Nápovědy k otázce na století: fotka, mapa místa ani fakta (rod, místo bitvy) století neprozradí.
    // Pomůže, kdo v té době žil a co se tehdy dělo, a osa bez letopočtů se známými událostmi před a po.
    const fameIndex = new WeakMap();
    const fameOf = (other, ctx) => {
        if (!fameIndex.has(ctx.items)) fameIndex.set(ctx.items, new Map(ctx.items.map((candidate, index) => [candidate.q, index])));
        return fameIndex.get(ctx.items).get(other.q) ?? Infinity;
    };
    const contemporariesOf = (item, ctx, year) => {
        const regions = cachedRegions(item);
        const sameHistory = (other) => cachedRegions(other).some(region => regions.includes(region));
        // Jména bez číslic (jinak by mohla prozradit rok) a nejdřív ze stejných dějin, pak ta nejznámější
        const pick = (candidates, score, count) => candidates
            .filter(other => other.q !== item.q && other.k === 1 && !/\d/.test(other.n))
            .map(other => ({ other, score: score(other) }))
            .sort((a, b) => b.score - a.score || fameOf(a.other, ctx) - fameOf(b.other, ctx))
            .slice(0, count).map(({ other }) => other.n);
        // Současníci, kteří byli tehdy činní (vládli, tvořili), ne jen naživu – ke Si Ťin-pchingovi ne Thatcherová
        const activeYear = (other) => other.f.from ?? other.f.y ?? other.f.born + 40;
        const people = pick(ctx.items.filter(other => isPerson(other) && other.f && other.f.born <= year && year <= (other.f.died ?? THIS_YEAR)
            && Math.abs(activeYear(other) - year) <= 30),
            other => (sameHistory(other) ? 2 : 0) - Math.abs(activeYear(other) - year) / 15, 3);
        const events = pick(ctx.items.filter(other => isEvent(other) && other.f && Math.abs(other.f.year - year) <= 10),
            other => (item.f.war && other.f.war === item.f.war ? 3 : 0) + (sameHistory(other) ? 1 : 0), 2);
        return [
            people.length ? { label: 'Tehdy žili', value: people.join(', ') } : null,
            events.length ? { label: 'Ve stejné době', value: events.join(', ') } : null
        ].filter(Boolean);
    };
    // Osa bez letopočtů jen tehdy, když na ní jsou aspoň dvě známé události (jinak nic neřekne)
    const blindTimelineOf = (item) => {
        const spec = withAnchors(item, timelineOf(item));
        if (!spec) return null;
        const blind = { ...spec, blind: true, name: 'osa bez letopočtů', icon: 'calendar-range' };
        return core.buildTimeline(blind, 340).anchors.length >= 2 ? blind : null;
    };

    const subtitle = (item, { countries }) => {
        const f = item.f || {};
        if (isPerson(item)) {
            const life = f.born !== undefined ? range(f.born, f.died) : '';
            return [life, f.land].filter(Boolean).join(' · ') || categoryOf(item).one;
        }
        if (isEvent(item)) return [range(f.year, f.end), placeOf(item, countries) || getCountryNames(item, countries)[0]].filter(Boolean).join(' · ');
        return range(f.from, f.to);
    };

    // Roky a století z textu u otázky na století zmizí
    const hideYears = (text) => text.replace(/(?<![\p{L}\d])\d{1,4}(?!\d)(\.\s*(?:století|stol\.))?/gu, '[***]');
    // Slova, která dobu prozradí (konflikt studené války, sovětské jednotky, za druhé světové války)
    const ERA_WORDS = /(?<![\p{L}])(?:studen\p{L}* válk\p{L}*|(?:první|druh\p{L}*|1\.|2\.) světov\p{L}* válk\p{L}*|sovětsk\p{L}*|SSSR|nacist\p{L}*|nacismu|komunist\p{L}*|bolševi\p{L}*|napoleonsk\p{L}*|středověk\p{L}*|novověk\p{L}*|starověk\p{L}*|antick\p{L}*|pravěk\p{L}*|raně novověk\p{L}*)(?![\p{L}])/giu;
    const hideEra = (text) => core.mergeCensored(hideYears(text).replace(ERA_WORDS, '[***]'));

    // --- Otázka „Ve kterém dnešním státě se to stalo?“ (u události s jedním známým státem, jehož název ani místo nejsou v názvu) ---
    const eventCountry = (item, countries) => {
        const known = (item.co || []).filter(qid => countries && countries[qid]);
        if (item.c !== 'udalosti' || known.length !== 1 || (item.co || []).length > 2) return null;
        const name = countries[known[0]].name;
        const place = (item.f || {}).place;
        const words = [name, ...getCountryAliases([known[0]]), place].filter(Boolean);
        return words.some(word => core.isFactVisible(word, item.n)) ? null : known[0];
    };
    // Středy států podle měst a událostí v datech (vzdálenost pro nesprávné možnosti: k Rakousku Německo a Česko, ne Peru)
    const centresCache = new WeakMap();
    const countryCentres = (items) => {
        if (!centresCache.has(items)) {
            const sums = new Map();
            for (const other of items) {
                if (other.la === undefined || (other.co || []).length !== 1) continue;
                const sum = sums.get(other.co[0]) || { lat: 0, lon: 0, n: 0 };
                sums.set(other.co[0], { lat: sum.lat + other.la, lon: sum.lon + other.lo, n: sum.n + 1 });
            }
            centresCache.set(items, new Map([...sums].map(([qid, sum]) => [qid, { la: sum.lat / sum.n, lo: sum.lon / sum.n }])));
        }
        return centresCache.get(items);
    };
    const countryQuestion = (item, ctx, rng) => {
        const countryId = eventCountry(item, ctx.countries);
        if (!countryId) return null;
        const name = ctx.countries[countryId].name;
        return {
            type: 'location',
            title: isTreaty(item) ? 'Ve kterém dnešním státě byla podepsána?' : 'Ve kterém dnešním státě se to stalo?',
            showName: true,
            choices: buildCountryChoices(countryId, ctx.countries, rng, (id) => {
                const centre = item.la !== undefined ? countryCentres(ctx.items || []).get(id) : null;
                return centre ? distanceKm(item, centre) : undefined;
            }).map(choice => ({ ...choice, topic: 'zemepis' })),
            accepted: countryAnswers([countryId], [name]),
            placeholder: 'Napiš stát…',
            answerLabel: name
        };
    };

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
            tierKnown: 'Slavní panovníci, prezidenti, bitvy a události'
        },
        categories: CATEGORIES,

        // Bitvy se řadí podle státu, kde se odehrály (osoby podle země, ze které pocházejí)
        culture: (item, ctx) => isEvent(item) ? core.getCountryNames(item, (ctx && ctx.countries) || {}).slice(0, 3) : undefined,

        // Nesprávné možnosti: stejné pohlaví a podobná doba, stejné dějiny (anglický král k anglickým), rod, válka
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            // Část a celek (Říjnová revoluce a Ruská revoluce, bitva u Azincourtu a stoletá válka) by byly dvě správné odpovědi
            if (isPartOf(item, other) || isPartOf(other, item)) return -100;
            let score = isPerson(item) ? personSimilarity(item, other) : eraNearness(f.y, g.y);
            if (isPerson(item) && f.dyn && f.dyn === g.dyn) score += 1;
            // Osoby: blízká doba i v rámci století (k Disraelimu Gladstone, ne Sunak) a stejná země
            if (isPerson(item) && f.y !== undefined && g.y !== undefined) score += Math.max(0, 3 - Math.abs(f.y - g.y) / 30);
            if (isPerson(item) && f.land && f.land === g.land) score += 2;
            if (isEvent(item) && f.war && f.war === g.war) score += 3;
            // Události stejné skupiny (ke smlouvě smlouvy a kongresy, k zemětřesení katastrofy a epidemie)
            if (item.c === 'udalosti' && eventGroup(item) && eventGroup(item) === eventGroup(other)) score += 3;
            const regions = cachedRegions(item);
            if (regions.length && cachedRegions(other).some(region => regions.includes(region))) score += 2;
            return score;
        },

        // Občas „Ve kterém století začal vládnout?“ (narodila se, odehrálo se…) – jméno je pak vidět a z popisu zmizí letopočty
        specialQuestion: (item, ctx, rng) => {
            const roll = rng();
            if (item.c === 'udalosti' && roll >= CENTURY_QUIZ_SHARE && roll < COUNTRY_QUIZ_SHARE) return countryQuestion(item, ctx, rng);
            if (!(roll < CENTURY_QUIZ_SHARE)) return null;
            const event = centuryEvent(item);
            // Rok 1300 patří do 13. století, většina lidí by ale řekla 14. – takovou otázku vynecháme;
            // stejně tak, když je letopočet vidět už v názvu („Pád Akkonu (1291)“)
            // Doba nesmí být poznat už z názvu (Sovětská válka v Afghánistánu, Druhá světová válka)
            if (!event || event.year % 100 === 0 || /\d{3,4}/.test(item.n) || new RegExp(ERA_WORDS.source, 'iu').test(item.n)) return null;
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
                match: 'century',
                century,
                accepted: [centuryLabel(century)],
                placeholder: 'Napiš století, třeba 14',
                answerLabel: centuryLabel(century)
            };
        },
        censor: (type, text, item, ctx) => {
            if (type === 'century') return hideEra(text);
            // U otázky na stát zmizí stát, národnost i místo (Versailles prozradí Francii)
            if (type === 'location') {
                const countryId = eventCountry(item, ctx.countries);
                if (!countryId) return null;
                const place = (item.f || {}).place;
                const hidden = censorCountry(text, ctx.countries[countryId].name, getCountryAliases([countryId]));
                return place ? censorName(hidden, place) : hidden;
            }
            return null;
        },
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'location') return null;
            const countryId = findAnswerCountry(answer, item.co || [], ctx.countries || {});
            return countryId ? { topic: 'zemepis', id: countryId } : null;
        },
        hints: (item, ctx, type) => {
            // Stát: fakta bez místa a státu, fotka, osa
            if (type === 'location') return [{ kind: 'facts', facts: factsOf(item, 'location', ctx.countries) }, { kind: 'photo' }, { kind: 'visual', spec: withAnchors(item, timelineOf(item)) }];
            if (type !== 'century') return null;
            const event = centuryEvent(item);
            return [
                { kind: 'facts', label: 'současníci', icon: 'users', facts: event ? contemporariesOf(item, ctx, event.year) : [] },
                { kind: 'visual', spec: blindTimelineOf(item) }
            ];
        },

        visual: visualOf,
        regionsOf,
        facts: (item, ctx, mode) => factsOf(item, mode, ctx.countries),
        subtitle,
        coords: (item) => item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1
    };
});
