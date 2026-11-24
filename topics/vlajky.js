// Téma Vlajky a znaky: vlajky a státní znaky států, znaky českých krajů, měst a zemí, vlajky území a organizací, měny a mince (data/vlajky.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { CONTINENT_NAMES, getCountryAliases, censorCountry, censorName, normalizeAnswer, formatFacts, formatNumber, formatPopulation, formatYear, getMapSpan, distanceKm, nearness, STATE_STEPS,
        shuffle, buildCountryChoices, countryAnswers, findAnswerCountry, isFactVisible, isRealPhoto } = core;

    const STATE = { placeholder: 'Napiš stát…', sort: { by: 'name' } };
    const CATEGORIES = [
        { key: 'vlajka', label: 'Vlajky států', one: 'vlajka státu', icon: 'flag', question: 'Čí je to vlajka?', ...STATE },
        { key: 'znak', label: 'Státní znaky', one: 'státní znak', icon: 'shield', question: 'Čí je to státní znak?', ...STATE },
        { key: 'cesko', label: 'Znaky krajů a měst', one: 'znak', icon: 'castle', question: 'Čí je to znak?', placeholder: 'Napiš kraj nebo město…', sort: { by: 'name' } },
        { key: 'uzemi', label: 'Území a organizace', one: 'vlajka', icon: 'globe', question: 'Čí je to vlajka?', placeholder: 'Napiš území nebo organizaci…', sort: { by: 'name' } },
        { key: 'regiony', label: 'Regiony států', one: 'region', icon: 'map', question: 'Který region to je?', placeholder: 'Napiš region…', sort: { by: 'name' } },
        { key: 'mesta', label: 'Města světa', one: 'město', icon: 'building-2', question: 'Které město to je?', placeholder: 'Napiš město…', sort: { by: 'name' } },
        { key: 'historie', label: 'Zaniklé státy', one: 'zaniklý stát', icon: 'hourglass', question: 'Který zaniklý stát to je?', placeholder: 'Napiš stát…', sort: { by: 'name' } },
        // Měny států (dnešní i zaniklé) a historické mince; bez obrázku v otázce – na bankovce je název napsaný
        { key: 'meny', label: 'Měny a bankovky', one: 'měna', icon: 'banknote', question: 'Která měna to je?', placeholder: 'Napiš měnu…', sort: { by: 'name' } }
    ];
    const isCurrency = (item) => item.c === 'meny';
    const isState = (item) => item.c === 'vlajka' || item.c === 'znak';
    // Regiony a města mají vlajku nebo znak (pole it: v = vlajka, z = znak)
    const isFlag = (item) => item.c === 'vlajka' || item.c === 'uzemi' || item.c === 'historie' || item.it === 'v';
    // Mezinárodní organizace; „sdružení“ místo „organizace“ u názvů, které slovo organizace obsahují (štítek druhu by odpověď prozradil)
    const isOrganization = (item) => item.ty === 'organizace' || item.ty === 'sdružení';
    const isRegionLike = (item) => item.c === 'regiony' || item.c === 'mesta' || item.c === 'historie';
    const isTownLike = (item) => item.c === 'cesko' && item.ty !== 'kraj' && item.ty !== 'historická země';

    // --- Podobnost obrázků podle barevného podpisu (mřížka 12 × 6, v každém políčku převládající barva) ---
    const COLS = 12;
    const ROWS = 6;
    // Příbuzné barvy se počítají napůl (červená × vínová, modrá × světle modrá, žlutá × oranžová, bílá × stříbrná)
    const NEAR = { RM: 0.5, BL: 0.5, YO: 0.4, RO: 0.3, WS: 0.5, KS: 0.2, YN: 0.3, ON: 0.3, MN: 0.3 };
    const cellScore = (a, b) => a === b ? 1 : NEAR[a + b] || NEAR[b + a] || 0;
    // Rozložení: políčka na stejném místě; prázdné pozadí znaku („.“ u obou) se nepočítá
    const layoutScore = (a, b, flipX, flipY) => {
        let sum = 0;
        let cells = 0;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const first = a[y * COLS + x];
                const second = b[(flipY ? ROWS - 1 - y : y) * COLS + (flipX ? COLS - 1 - x : x)];
                if (first === '.' && second === '.') continue;
                cells++;
                sum += cellScore(first, second);
            }
        }
        return cells ? sum / cells : 0;
    };
    const shares = (signature) => {
        const counts = new Map();
        for (const letter of signature) if (letter !== '.') counts.set(letter, (counts.get(letter) || 0) + 1);
        const total = [...counts.values()].reduce((sum, n) => sum + n, 0) || 1;
        return new Map([...counts].map(([letter, n]) => [letter, n / total]));
    };
    // Podobnost vzhledu 0–1: rozložení barev (i zrcadlově – Irsko × Pobřeží slonoviny, Polsko × Indonésie, o něco méně)
    // a zastoupení barev (Rusko × Nizozemsko)
    const lookAlike = (a, b) => {
        if (!a || !b || a.length !== b.length) return 0;
        const layout = Math.max(layoutScore(a, b, false, false), 0.85 * layoutScore(a, b, true, false),
            0.85 * layoutScore(a, b, false, true), 0.8 * layoutScore(a, b, true, true));
        const [sa, sb] = [shares(a), shares(b)];
        let palette = 0;
        for (const [letter, share] of sa) palette += Math.min(share, sb.get(letter) || 0);
        return 0.6 * layout + 0.4 * palette;
    };
    // Vlajky, které se od sebe skoro nedají rozeznat – spolu v možnostech nebudou (otázka by neměla jednu odpověď)
    const TWINS = [['Q657', 'Q218'], ['Q252', 'Q235']];
    const isTwin = (item, other) => item.c === 'vlajka' && other.c === 'vlajka'
        && TWINS.some(pair => pair.includes(item.co[0]) && pair.includes(other.co[0]));

    // Stejný vzor, který z barev poznat nejde (skandinávský kříž, britská vlajka v rohu, půlměsíc, trikolóra) – Finsko
    // ke Švédsku, ne k Rusku
    const PATTERN_BONUS = { 'skandinavske-krize': 5, 'britska-vlajka': 5, pulmesic: 2, trikolory: 1.5 };
    const sharedPattern = (item, other) => Object.entries(PATTERN_BONUS)
        .reduce((sum, [group, bonus]) => sum + ((item.g || []).includes(group) && (other.g || []).includes(group) ? bonus : 0), 0);

    // Přezdívky vlajek, které stát prozradí (Dannebrog), a tvary, které zakrytí názvu mine („Vlajka Nového Zélandu“)
    const NICKNAMES = {
        Q35: ['Dannebrog'], Q145: ['Union Jack', 'Union Flag'], Q30: ['Stars and Stripes', 'Old Glory'], Q17: ['Hinomaru', 'Nisshóki'],
        Q664: ['Nového Zélandu', 'Novém Zélandu', 'Nový Zéland'], Q16: ['Maple Leaf'], Q142: ['Tricolore'], Q155: ['Auriverde']
    };

    const continentOf = (item, { countries }) => {
        const country = countries && countries[(item.co || [])[0]];
        return item.c === 'uzemi' ? (item.f || {}).cont || (country && country.continent) : country && country.continent;
    };
    const continentFact = (item, ctx) => {
        const continent = continentOf(item, ctx);
        return continent && item.c !== 'cesko' ? [{ label: 'Kontinent', value: CONTINENT_NAMES[continent] }] : [];
    };

    // Krajské město, které kraj prozradí názvem (Plzeň – Plzeňský kraj), se jako nápověda nenabídne
    const seatRevealsRegion = (seat, region) => normalizeAnswer(seat).split(' ').filter(word => word.length >= 3)
        .some(word => normalizeAnswer(region).includes(word.slice(0, 3)));

    const FACT_FORMATS = {
        state: [['cap', 'Hlavní město', v => v], ['area', 'Rozloha', v => `${formatNumber(v)} km²`]],
        cesko: [['kraj', 'Kraj', v => v], ['seat', 'Krajské město', v => v], ['pop', 'Počet obyvatel', formatPopulation], ['area', 'Rozloha', v => `${formatNumber(v)} km²`]],
        uzemi: [['hq', 'Sídlo', v => v], ['year', 'Založení', formatYear]],
        regiony: [['cap', 'Správní centrum', v => v], ['pop', 'Počet obyvatel', formatPopulation], ['area', 'Rozloha', v => `${formatNumber(v)} km²`]],
        mesta: [['pop', 'Počet obyvatel', formatPopulation]]
    };
    // Zaniklý stát: kdy existoval
    const lifespanOf = (item) => {
        const { from, to } = item.f || {};
        if (from === undefined && to === undefined) return null;
        return { label: 'Existoval', value: `${from !== undefined ? formatYear(from) : '?'}–${to !== undefined ? formatYear(to) : ''}` };
    };
    const factsOf = (item, ctx, mode) => {
        const f = item.f || {};
        const continent = mode === 'card' ? [] : continentFact(item, ctx);
        if (isState(item)) {
            const adopted = item.c === 'vlajka' && mode !== 'name' && f.year > 0 ? [{ label: 'Vlajka přijata', value: formatYear(f.year) }] : [];
            return [...continent, ...formatFacts(item, FACT_FORMATS.state), ...adopted];
        }
        if (item.c === 'cesko') return formatFacts(item, FACT_FORMATS.cesko);
        if (item.c === 'historie') return [lifespanOf(item)].filter(Boolean);
        if (item.c === 'regiony' || item.c === 'mesta') {
            const owner = ctx.countries && ctx.countries[(item.co || [])[0]];
            const capital = item.c === 'mesta' && (item.f || {}).capital ? [{ label: 'Význam', value: 'hlavní město státu' }] : [];
            return [...continent, ...(owner ? [{ label: item.c === 'mesta' ? 'Stát' : 'Patří k', value: owner.name }] : []), ...capital, ...formatFacts(item, FACT_FORMATS[item.c])];
        }
        const country = ctx.countries && ctx.countries[(item.co || [])[0]];
        return [...continent, ...(country ? [{ label: 'Patří k', value: country.name }] : []), ...formatFacts(item, FACT_FORMATS.uzemi)];
    };

    // Slepá mapa: u státu zvýrazněný stát, u měst, krajů a území bod uprostřed
    const PRAGUE = 'Q1085';
    const mapOf = (item, { countries }) => {
        if (item.la === undefined || item.lo === undefined) return null;
        if (isState(item)) {
            return {
                type: 'map', lat: item.la, lon: item.lo, span: getMapSpan({ area: (item.f || {}).area || 100000 }, 14),
                highlightIso: countries && countries[item.co[0]] ? countries[item.co[0]].iso : '', label: 'Stát je uprostřed'
            };
        }
        const span = item.c === 'cesko' ? 6 : item.c === 'mesta' ? 8 : item.c === 'regiony' ? 14 : 24;
        // Regiony, města a české znaky: celý stát s hranicemi krajů (data/regiony.json), region zvýrazněný, místo tečkou;
        // pro stát bez dat obrysy států s místem uprostřed
        if ((item.c === 'regiony' || item.c === 'mesta' || item.c === 'cesko') && (item.co || [])[0]) {
            // Pražská městská část: mapa Prahy s hranicemi částí (data/regiony.json, cities), jinak celý stát
            if (item.ty === 'městská část') return { type: 'map', lat: item.la, lon: item.lo, span: 0.6, highlightIso: '', label: 'Městská část je vyznačená tečkou', regional: { country: item.co[0], city: PRAGUE, item: item.q } };
            const label = item.c === 'regiony' || item.ty === 'kraj' ? 'Region je vyznačený tečkou' : `${isTownLike(item) || item.c === 'mesta' ? 'Město' : 'Místo'} je vyznačené tečkou`;
            return { type: 'map', lat: item.la, lon: item.lo, span, highlightIso: '', label, regional: { country: item.co[0], item: item.q } };
        }
        const label = item.c === 'historie' ? 'Střed státu' : 'Území je uprostřed';
        return { type: 'map', lat: item.la, lon: item.lo, span, highlightIso: '', label };
    };
    const imageOf = (item) => item.im ? { type: 'image', file: item.im, hash: item.ih, name: isFlag(item) ? 'vlajka' : 'znak', icon: isFlag(item) ? 'flag' : 'shield' } : null;
    // Vlajka státu jako nápověda u otázky na jeho znak
    const flagIndex = new WeakMap();
    const flagOfState = (item, { items }) => {
        if (!items) return null;
        if (!flagIndex.has(items)) flagIndex.set(items, new Map(items.filter(other => other.c === 'vlajka').map(other => [other.co[0], other])));
        return flagIndex.get(items).get(item.co[0]) || null;
    };

    // Nápovědy od nejméně prozrazující: stát – kontinent, slepá mapa, hlavní město (u znaku vlajka);
    // město – počet obyvatel, mapa, kraj; kraj – obyvatelé a rozloha, mapa, krajské město; území – kontinent, mapa, stát
    const hintsOf = (item, ctx) => {
        const f = item.f || {};
        const facts = (list) => ({ kind: 'facts', facts: list.filter(Boolean) });
        const fact = (key, label, format = v => v) => f[key] !== undefined ? { label, value: format(f[key]) } : null;
        if (isState(item)) {
            // U znaku je poslední nápovědou vlajka státu (prozradí ho asi jako hlavní město, ale naučí víc)
            const flag = item.c === 'znak' ? flagOfState(item, ctx) : null;
            return [facts(continentFact(item, ctx)), { kind: 'visual', spec: mapOf(item, ctx) },
                flag ? { kind: 'visual', spec: imageOf(flag) } : facts([fact('cap', 'Hlavní město')])];
        }
        if (item.c === 'cesko') {
            if (isTownLike(item)) return [facts([fact('pop', 'Počet obyvatel', formatPopulation)]), { kind: 'visual', spec: mapOf(item, ctx) }, facts([fact('kraj', 'Kraj')])];
            const seat = f.seat && !seatRevealsRegion(f.seat, item.n) ? { label: 'Krajské město', value: f.seat } : null;
            return [facts([fact('pop', 'Počet obyvatel', formatPopulation), fact('area', 'Rozloha', v => `${formatNumber(v)} km²`)]),
                { kind: 'visual', spec: mapOf(item, ctx) }, facts([seat])];
        }
        if (item.c === 'historie') return [facts([lifespanOf(item)]), { kind: 'visual', spec: mapOf(item, ctx) }];
        if (item.c === 'regiony' || item.c === 'mesta') {
            const owner = ctx.countries && ctx.countries[(item.co || [])[0]];
            const size = item.c === 'regiony' ? facts([fact('pop', 'Počet obyvatel', formatPopulation), fact('area', 'Rozloha', v => `${formatNumber(v)} km²`)]) : facts([fact('pop', 'Počet obyvatel', formatPopulation)]);
            return [item.c === 'mesta' ? facts(continentFact(item, ctx)) : size, { kind: 'visual', spec: mapOf(item, ctx) }, facts([owner ? { label: 'Stát', value: owner.name } : null])];
        }
        if (isOrganization(item)) return [facts([fact('year', 'Založení', formatYear)]), facts([fact('hq', 'Sídlo')])];
        const country = ctx.countries && ctx.countries[(item.co || [])[0]];
        return [facts(continentFact(item, ctx)), { kind: 'visual', spec: mapOf(item, ctx) }, facts([country ? { label: 'Patří k', value: country.name } : null])];
    };

    // Úvod článku o městě, kraji, regionu, zaniklém státu či novém území by odpověď prozradil i se zakrytým názvem („druhé
    // největší město v Česku“, „stát na jihovýchodě USA“), proto se před odpovědí neukáže vůbec (celý popis až po odpovědi).
    // Náhradní obecná věta („Znak jednoho z českých měst. Kterému patří?“) by nic nepřidala k otázce, štítku a možnostem –
    // otázka proto popis jako nápovědu nemá a nápovědy začínají fakty a mapou.
    const withholdsText = (item) => item.c === 'cesko' || isRegionLike(item) || Boolean(item.gen);
    // Slova označující typ celku, která se v odpovědi psát nemusí (Kraj Vysočina, Stát Texas, Prefektura Kagawa)
    const ADMIN_WORDS = /^(?:kraj|oblast|region|stát|provincie|prefektura|kanton|župa|spolková země|země|departement|republika|autonomní oblast|autonomní republika|vojvodství|hrabství|guvernorát|okrug)\s+|\s+(?:kraj|oblast|region|stát|provincie|prefektura|kanton|župa|země|departement|republika|vojvodství|hrabství)$/iu;
    // Další přijímané názvy: zkratky států (USA, ČR), u krajů jméno bez slova kraj, u území a organizací z dat (OSN, NATO)
    const aliasesOf = (item) => {
        if (isState(item)) return getCountryAliases(item.co);
        const aliases = [...(item.al || [])];
        if (item.c === 'regiony' || item.c === 'mesta' || item.c === 'historie') aliases.push(item.n.replace(ADMIN_WORDS, '').trim());
        if (item.ty === 'kraj') aliases.push(item.n.replace(/^Kraj /u, '').replace(/ kraj$/u, ''));
        return aliases.filter(alias => normalizeAnswer(alias) !== normalizeAnswer(item.n));
    };

    // Region státu: jen regiony téhož státu, k tomu sousední (blízko středu) a podobně velké podle počtu obyvatel (podobně známé);
    // region jiného státu dostane velkou srážku, takže se použije, jen když stát nemá aspoň tři další regiony
    const REGION_STEPS = [250, 500, 900, 1500, 2500];
    const OTHER_STATE = -60;
    const regionScore = (item, other, look) => {
        const own = (item.co || [])[0];
        if (!own || own !== (other.co || [])[0]) return OTHER_STATE + look * 0.01;
        let score = look;
        if (item.la !== undefined && other.la !== undefined) score += nearness(distanceKm(item, other), REGION_STEPS) * 0.6;
        const a = Number((item.f || {}).pop);
        const b = Number((other.f || {}).pop);
        if (a > 0 && b > 0) score += Math.max(0, 1.5 - Math.abs(Math.log10(a / b)));
        return score;
    };

    const subtitle = (item, ctx) => {
        if (item.c === 'cesko') return (item.f || {}).kraj || 'Česko';
        if (item.c === 'historie') return 'Zaniklý stát';
        const country = ctx.countries && ctx.countries[(item.co || [])[0]];
        if ((item.c === 'uzemi' || item.c === 'regiony' || item.c === 'mesta') && country) return country.name;
        if (isOrganization(item)) return 'Mezinárodní organizace';
        const continent = continentOf(item, ctx);
        return continent ? CONTINENT_NAMES[continent] : '';
    };

    // --- Měny a bankovky (kategorie meny: dnešní a zaniklé měny států, historické mince a drobné jednotky) ---
    // Položka: co = státy, kde se měnou platí (platilo), domovský stát první; f = { iso, sym, from, to, land (země bez státu v datech),
    // prev (nahradila), next (nahrazena), bank (centrální banka), part (čeho je drobná jednotka setinou) }. Na bankovce bývá název
    // napsaný – obrázek je jen po odpovědi a v atlasu.
    const EURO = 'Q4916';
    const isPeriodKind = (item) => item.ty === 'historická mince' || item.ty === 'drobná jednotka';
    const homeOf = (item, countries) => {
        const id = (item.co || [])[0];
        return id && countries && countries[id] ? id : null;
    };
    const currencyContinent = (item, countries) => {
        if (item.q === EURO) return 'EU';
        const home = homeOf(item, countries);
        return home ? countries[home].continent : null;
    };
    const stateNamesOf = (item, countries) => (item.co || []).map(id => countries && countries[id] && countries[id].name).filter(Boolean);
    const statesLabel = (item, countries) => {
        const names = stateNamesOf(item, countries);
        return names.length > 4 ? `${names.slice(0, 3).join(', ')} a další (celkem ${names.length})` : names.join(', ');
    };
    // Slova se stejným začátkem (Maďarsko – maďarský, Rakousko-Uhersko – rakousko-uherská): bez diakritiky první čtyři písmena
    const stemsOf = (text) => normalizeAnswer(text).split(/[^a-z0-9]+/).filter(word => word.length >= 4).map(word => word.slice(0, 4));
    const sharesStem = (a, b) => { const bs = stemsOf(b); return stemsOf(a).some(stem => bs.includes(stem)); };
    // Symbol bez písmen (₹, ₽, €, £, $) nic nenapoví slovem; písmena (Ft, Kč, zł) jsou zkratkou názvu – ukážou se až po odpovědi.
    // Bez znaku centu (¢ u kanadského dolaru) a nových symbolů z let 2024–2025 (⃀, ⃃), které telefony zatím nezobrazí
    const plainSymbol = (item) => String((item.f || {}).sym || '').split(', ')
        .find(sym => sym && !/[\p{L}\d¢]/u.test(sym) && ![...sym].some(char => char.codePointAt(0) >= 0x20C0 && char.codePointAt(0) <= 0x20CF)) || null;
    const periodFact = (item) => {
        const { from, to } = item.f || {};
        // Popisky, které rozlišující údaj (quiz-core.js YEAR_LABELS) čte jako roky: Od roku, Doba
        if (item.ty === 'měna') return from !== undefined ? { label: 'Od roku', value: formatYear(from) } : null;
        const label = 'Doba';
        if (from !== undefined && to !== undefined) return { label, value: from < 0 || to < 0 ? `${formatYear(from)} – ${formatYear(to)}` : `${from}–${to}` };
        if (from !== undefined) return { label: 'Od roku', value: formatYear(from) };
        if (to !== undefined) return { label: 'Platila do', value: formatYear(to) };
        return null;
    };
    const continentFactOf = (item, ctx) => {
        const continent = currencyContinent(item, ctx.countries);
        return continent && !isPeriodKind(item) ? { label: 'Kontinent', value: CONTINENT_NAMES[continent] } : null;
    };
    // Země bez státu v datech (Československo, Starověký Řím); jen když ji název neprozradí (Rakousko-uherská koruna)
    const landFact = (item) => {
        const land = (item.f || {}).land;
        return land && !sharesStem(land, item.n) ? { label: 'Země', value: land } : null;
    };
    const currencyFacts = (item, ctx, mode) => {
        const f = item.f || {};
        const full = mode === 'result' || mode === 'card';
        const states = statesLabel(item, ctx.countries);
        const symbol = plainSymbol(item);
        // Značka z písmen (Ft, Kč, zł) je zkratkou názvu: až po odpovědi a nikdy jako rozlišující údaj (quiz-core CLUE_NEVER)
        const letters = String(f.sym || '').split(', ').filter(sym => sym && sym !== symbol).join(', ');
        return [
            mode === 'card' ? null : continentFactOf(item, ctx),
            periodFact(item),
            mode !== 'usymbol' && symbol ? { label: 'Symbol', value: symbol } : null,
            full && letters ? { label: 'Značka', value: letters } : null,
            full && f.iso ? { label: 'Kód ISO', value: f.iso } : null,
            full && states ? { label: item.ty === 'měna' ? 'Platí se v' : 'Platilo se v', value: states } : null,
            full && f.land ? { label: 'Platilo se v', value: f.land } : null,
            full && f.part ? { label: 'Drobná jednotka', value: f.part } : null,
            full && f.prev ? { label: 'Nahradila', value: f.prev } : null,
            full && f.next ? { label: 'Nahrazena', value: f.next } : null,
            full && f.bank ? { label: 'Vydává', value: f.bank } : null
        ].filter(Boolean);
    };
    // Vlajka domovského státu (u eura vlajka Evropské unie) – poslední nápověda a mapa po odpovědi
    const homeFlagOf = (item, ctx) => {
        if (!ctx.items) return null;
        if (item.q === EURO) return ctx.items.find(other => other.c === 'uzemi' && other.n === 'Evropská unie') || null;
        return homeOf(item, ctx.countries) ? flagOfState({ co: [item.co[0]] }, ctx) : null;
    };
    const banknoteImage = (item) => item.im ? { type: 'image', file: item.im, hash: item.ih, name: isRealPhoto(item.im) ? 'fotka' : 'bankovka', icon: 'banknote' } : null;
    // Po odpovědi a v atlasu: kresba či sken bankovky (fotku ukáže okno samo), jinak mapa domovského státu
    const currencyVisual = (item, ctx, mode) => {
        if (mode !== 'result' && mode !== 'card') return null;
        if (item.im && !isRealPhoto(item.im)) return banknoteImage(item);
        const flag = item.q === EURO ? null : homeFlagOf(item, ctx);
        return flag ? mapOf(flag, ctx) : null;
    };
    // Nápovědy od nejméně prozrazující: kontinent a doba, kód ISO a symbol, nakonec vlajka státu (u mincí země). Fotka bankovky či mince
    // nápovědou není: název měny bývá napsaný cizím jazykem či písmem a OCR (data/photo-text.json) ho najde jen někdy; ukáže se po odpovědi
    const currencyHints = (item, ctx, type) => {
        const f = item.f || {};
        const facts = (list, extra = {}) => ({ kind: 'facts', ...extra, facts: list.filter(Boolean) });
        if (type === 'location') {
            return [facts([continentFactOf(item, ctx)], { label: 'kontinent', icon: 'globe' }), facts([periodFact(item), plainSymbol(item) ? { label: 'Symbol', value: plainSymbol(item) } : null])];
        }
        if (type === 'usymbol') return [facts([continentFactOf(item, ctx), periodFact(item)]), facts([f.iso ? { label: 'Kód ISO', value: f.iso } : null])];
        if (type !== 'name') return null;
        if (isPeriodKind(item) || !homeOf(item, ctx.countries)) {
            return [facts([periodFact(item)]), facts([continentFactOf(item, ctx), landFact(item), f.part ? { label: 'Drobná jednotka', value: f.part } : null])];
        }
        const flag = homeFlagOf(item, ctx);
        const symbol = plainSymbol(item);
        return [
            facts([continentFactOf(item, ctx), periodFact(item)]),
            facts([f.iso ? { label: 'Kód ISO', value: f.iso } : null, symbol ? { label: 'Symbol', value: symbol } : null]),
            flag ? { kind: 'visual', spec: imageOf(flag) } : facts([{ label: item.ty === 'měna' ? 'Platí se v' : 'Platilo se v', value: statesLabel(item, ctx.countries) }])
        ];
    };
    const currencySubtitle = (item, ctx) => {
        const states = statesLabel(item, ctx.countries);
        if (item.ty === 'měna') return states || 'Měna';
        return [item.ty === 'zaniklá měna' ? 'Zaniklá měna' : item.ty === 'drobná jednotka' ? 'Drobná jednotka' : 'Historická mince', (item.f || {}).land || states].filter(Boolean).join(' · ');
    };
    // Nesprávné možnosti: stejný druh (dnešní k dnešním, mince k mincím), u dnešních stejný kontinent a blízký stát, stejná jednotka
    // (dolar k dolarům, dinár k dinárům); u zaniklých podobná doba konce, u mincí podobná doba
    const unitWord = (name) => normalizeAnswer(name).split(' ').pop();
    const currencySimilarity = (item, other, ctx) => {
        let score = item.ty === other.ty ? 0 : -10;
        const f = item.f || {};
        const g = other.f || {};
        if (isPeriodKind(item)) {
            if (f.from !== undefined && g.from !== undefined) score += Math.max(0, 3 - Math.abs(f.from - g.from) / 300);
            return score + (item.cz === other.cz ? 0.5 : 0);
        }
        const continent = currencyContinent(item, ctx.countries);
        if (continent && continent === currencyContinent(other, ctx.countries)) score += 3;
        if (unitWord(item.n) === unitWord(other.n)) score += 1.5;
        const [a, b] = [homeFlagOf(item, ctx), homeFlagOf(other, ctx)];
        if (a && b && a.la !== undefined && b.la !== undefined) score += nearness(distanceKm(a, b), STATE_STEPS) * 0.5;
        if (item.ty === 'zaniklá měna' && f.to !== undefined && g.to !== undefined) score += Math.max(0, 2 - Math.abs(f.to - g.to) / 25);
        return score;
    };

    // Otázky se jménem měny: „Ve kterém státě se platí touto měnou?“ (jen jeden stát a název ho neprozradí: zlotý, tenge, drachma)
    // a „Jaký symbol má tato měna?“ (symbol bez písmen: ₹, ₽, €)
    const LOCATION_SHARE = 0.35;
    const SYMBOL_SHARE = 0.25;
    const soleState = (item, countries) => {
        if ((item.ty !== 'měna' && item.ty !== 'zaniklá měna') || (item.co || []).length !== 1 || item.cz === 1) return null;
        const id = homeOf(item, countries);
        if (!id) return null;
        return [countries[id].name, ...getCountryAliases([id])].some(word => isFactVisible(word, item.n) || sharesStem(word, item.n)) ? null : id;
    };
    const locationQuestion = (item, ctx, rng) => {
        const countries = ctx.countries || {};
        const id = soleState(item, countries);
        if (!id) return null;
        // Dva státy s měnou z téhož kontinentu a jeden odjinud (nápověda Kontinent jednu vyřadí); chybějící doplní sousedé
        const homes = new Set(ctx.items.filter(other => isCurrency(other) && other.ty === 'měna').map(other => homeOf(other, countries)).filter(Boolean));
        homes.delete(id);
        const shuffled = shuffle([...homes], rng);
        const same = shuffled.filter(qid => countries[qid].continent === countries[id].continent);
        const other = shuffled.filter(qid => countries[qid].continent !== countries[id].continent);
        const wrong = [...same.slice(0, other.length ? 2 : 3), ...other.slice(0, 1), ...same.slice(2)].slice(0, 3);
        const fallback = buildCountryChoices(id, countries, rng).filter(choice => !choice.correct && !wrong.includes(choice.id)).map(choice => choice.id);
        const picked = [...wrong, ...fallback].slice(0, 3);
        const name = countries[id].name;
        return {
            type: 'location',
            title: item.ty === 'měna' ? 'Ve kterém státě se platí touto měnou?' : 'Ve kterém státě se touto měnou platilo?',
            showName: true,
            choices: shuffle([id, ...picked], rng).map(qid => ({ id: qid, label: countries[qid].name, correct: qid === id, topic: 'zemepis' })),
            accepted: countryAnswers([id], [name]),
            placeholder: 'Napiš stát…',
            answerLabel: name
        };
    };
    const symbolQuestion = (item, ctx, rng) => {
        const symbol = plainSymbol(item);
        if (!symbol || item.ty !== 'měna') return null;
        const continent = currencyContinent(item, ctx.countries);
        // Symboly jiných měn: známé a ze stejného kontinentu napřed
        const others = ctx.items.filter(other => isCurrency(other) && other.ty === 'měna' && other.q !== item.q && plainSymbol(other) && plainSymbol(other) !== symbol)
            .map(other => ({ symbol: plainSymbol(other), score: (other.k === 1 ? 2 : 0) + (currencyContinent(other, ctx.countries) === continent ? 1 : 0) + rng() * 2 }))
            .sort((a, b) => b.score - a.score);
        const wrong = [...new Set(others.map(other => other.symbol))].slice(0, 3);
        if (wrong.length < 3) return null;
        return {
            type: 'usymbol',
            title: 'Jaký symbol má tato měna?',
            showName: true,
            choices: shuffle([symbol, ...wrong], rng).map(value => ({ id: `symbol-${value}`, label: value, correct: value === symbol })),
            // Symbol (₹, ₽) na klávesnici napsat nejde – jen výběr z možností
            choicesOnly: true,
            match: 'symbol',
            accepted: [symbol],
            answerLabel: symbol
        };
    };
    const currencyQuestion = (item, ctx, rng) => {
        const roll = rng();
        if (roll < LOCATION_SHARE) return locationQuestion(item, ctx, rng);
        if (roll < LOCATION_SHARE + SYMBOL_SHARE) return symbolQuestion(item, ctx, rng);
        return null;
    };
    // Zakrytí popisu: u otázky na měnu i státy, kde se jí platí, kód ISO a symbol (prozradí zemi i název); u otázky na stát státy,
    // u otázky na symbol symbol
    const censorCurrency = (type, text, item, ctx) => {
        const f = item.f || {};
        const countries = ctx && ctx.countries;
        const symbols = String(f.sym || '').split(', ').filter(Boolean);
        // Symbol jen jako samostatný znak či zkratka („L“ u leku ne uprostřed slova)
        const escape = (sym) => sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hideSymbols = (value) => symbols.reduce((result, sym) => result.replace(new RegExp(`(?<![\\p{L}\\d])${escape(sym)}(?![\\p{L}\\d])`, 'gu'), '[***]'), value);
        const hideStates = (value) => (item.co || []).filter(id => countries && countries[id])
            .reduce((result, id) => censorCountry(result, countries[id].name, getCountryAliases([id])), value);
        if (type === 'usymbol') return hideSymbols(text);
        if (type === 'location') return hideStates(text);
        if (type !== 'name') return null;
        let result = hideStates(censorCountry(text, item.n, [...aliasesOf(item), ...(f.iso ? [f.iso] : [])]));
        if (f.land) result = censorName(result, f.land);
        return hideSymbols(result);
    };

    return {
        id: 'vlajky',
        title: 'Vlajky a znaky',
        icon: 'flag',
        emoji: '🚩',
        color: 'blue',
        dataFile: 'data/vlajky.json',
        subtitleIcon: 'map-pin',
        words: {
            question: 'Čí je to vlajka?',
            one: 'vlajka',
            next: 'Další vlajka',
            atlas: 'Atlas vlajek a znaků',
            placeholder: 'Napiš stát…',
            tierKnown: 'Vlajky a znaky známých států, krajů a měst'
        },
        categories: CATEGORIES,

        // Vlajky mají vlastní pravidla (podobný vzhled, sousedé), ne kulturu jmen osob
        culture: () => [],

        // Regiony států: nesprávné možnosti se berou jen ze stejného státu (jinak by hráč cizí region vyřadil podle státu, „Santiago“
        // u státu USA); region jiného státu přijde na řadu, jen když jich stát v datech nemá dost (Spojené království)
        sameCountry: ['regiony'],

        // Nesprávné možnosti: hlavně podobně vypadající vlajky a znaky, k tomu sousedé a stejný kontinent
        similarity: (item, other, ctx) => {
            if (isCurrency(item)) return currencySimilarity(item, other, ctx);
            if (isTwin(item, other)) return -Infinity;
            let score = lookAlike(item.sg, other.sg) * (item.c === 'cesko' ? 6 : 10) + sharedPattern(item, other);
            if (item.c === 'regiony') return regionScore(item, other, score);
            // Města: vlajky stejného státu se pletou nejvíc, zaniklé státy se srovnávají podle doby
            if (item.c === 'mesta') score += (item.co || [])[0] && item.co[0] === (other.co || [])[0] ? 2 : 0;
            if (item.c === 'historie') score += item.f && other.f && item.f.from !== undefined && other.f.from !== undefined ? Math.max(0, 2 - Math.abs(item.f.from - other.f.from) / 60) : 0;
            if (item.c === 'cesko') return score + ((item.f || {}).kraj && item.f.kraj === (other.f || {}).kraj ? 1.5 : 0);
            if (item.la !== undefined && other.la !== undefined) score += nearness(distanceKm(item, other), STATE_STEPS) * 0.5;
            const continent = continentOf(item, ctx);
            if (continent && continent === continentOf(other, ctx)) score += 1;
            return score;
        },
        nameAliases: (item) => aliasesOf(item),
        withholdText: (type, item) => type === 'name' && withholdsText(item),
        censor: (type, text, item, ctx) => {
            if (isCurrency(item)) return censorCurrency(type, text, item, ctx);
            if (type !== 'name' || withholdsText(item)) return null;
            // U území i stát, ke kterému patří („dánského závislého území“, „federálních států USA“) – je až poslední nápovědou
            const owner = !isState(item) && ctx && ctx.countries && ctx.countries[(item.co || [])[0]];
            if (owner) {
                const own = censorCountry(text, item.n, [...aliasesOf(item), ...(item.cw || [])]);
                return censorCountry(own, owner.name, getCountryAliases([item.co[0]]));
            }
            // I hlavní město – úvod článku o vlajce ho občas zmíní
            const capital = isState(item) && item.f && item.f.cap ? item.f.cap.split(', ') : [];
            const nicknames = isState(item) ? NICKNAMES[item.co[0]] || [] : [];
            return censorCountry(text, item.n, [...aliasesOf(item), ...(item.cw || []), ...capital, ...nicknames]);
        },
        questionImage: (item) => item.im && !isCurrency(item) ? { file: item.im, hash: item.ih, label: isFlag(item) ? 'Vlajka' : 'Znak', icon: isFlag(item) ? 'flag' : 'shield' } : null,
        hints: (item, ctx, type) => isCurrency(item) ? currencyHints(item, ctx, type) : type === 'name' ? hintsOf(item, ctx) : null,
        // V atlasu obrázek samotný, jinak (po odpovědi) slepá mapa
        visual: (item, ctx, mode) => isCurrency(item) ? currencyVisual(item, ctx, mode) : mode === 'card' ? imageOf(item) : mapOf(item, ctx),
        facts: (item, ctx, mode) => isCurrency(item) ? currencyFacts(item, ctx, mode) : factsOf(item, ctx, mode),
        subtitle: (item, ctx) => isCurrency(item) ? currencySubtitle(item, ctx) : subtitle(item, ctx),
        // Měny: občas „Ve kterém státě se platí touto měnou?“ nebo „Jaký symbol má tato měna?“ (název je vidět)
        specialQuestion: (item, ctx, rng) => isCurrency(item) ? currencyQuestion(item, ctx, rng) : null,
        findAnswer: (type, answer, item, ctx) => {
            if (!isCurrency(item) || type !== 'location') return null;
            const id = findAnswerCountry(answer, [soleState(item, ctx.countries)].filter(Boolean), ctx.countries || {});
            return id ? { topic: 'zemepis', id } : null;
        },
        coords: (item) => item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1,
        lookAlike
    };
});
