// Téma Vlajky a znaky: vlajky a státní znaky států, znaky českých krajů, měst a zemí, vlajky území a organizací (data/vlajky.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { CONTINENT_NAMES, getCountryAliases, censorCountry, normalizeAnswer, formatFacts, formatNumber, formatPopulation, formatYear, getMapSpan, distanceKm, nearness, STATE_STEPS } = core;

    const STATE = { placeholder: 'Napiš stát…', sort: { by: 'name' } };
    const CATEGORIES = [
        { key: 'vlajka', label: 'Vlajky států', one: 'vlajka státu', icon: 'flag', question: 'Čí je to vlajka?', ...STATE },
        { key: 'znak', label: 'Státní znaky', one: 'státní znak', icon: 'shield', question: 'Čí je to státní znak?', ...STATE },
        { key: 'cesko', label: 'Znaky krajů a měst', one: 'znak', icon: 'castle', question: 'Čí je to znak?', placeholder: 'Napiš kraj nebo město…', sort: { by: 'name' } },
        { key: 'uzemi', label: 'Území a organizace', one: 'vlajka', icon: 'globe', question: 'Čí je to vlajka?', placeholder: 'Napiš území nebo organizaci…', sort: { by: 'name' } },
        { key: 'regiony', label: 'Regiony států', one: 'region', icon: 'map', question: 'Který region to je?', placeholder: 'Napiš region…', sort: { by: 'name' } },
        { key: 'mesta', label: 'Města světa', one: 'město', icon: 'building-2', question: 'Které město to je?', placeholder: 'Napiš město…', sort: { by: 'name' } },
        { key: 'historie', label: 'Zaniklé státy', one: 'zaniklý stát', icon: 'hourglass', question: 'Který zaniklý stát to je?', placeholder: 'Napiš stát…', sort: { by: 'name' } }
    ];
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
    const mapOf = (item, { countries }) => {
        if (item.la === undefined || item.lo === undefined) return null;
        if (isState(item)) {
            return {
                type: 'map', lat: item.la, lon: item.lo, span: getMapSpan({ area: (item.f || {}).area || 100000 }, 14),
                highlightIso: countries && countries[item.co[0]] ? countries[item.co[0]].iso : '', label: 'Stát je uprostřed'
            };
        }
        const span = item.c === 'cesko' ? 6 : item.c === 'mesta' ? 8 : item.c === 'regiony' ? 14 : 24;
        const label = item.c === 'mesta' || isTownLike(item) ? 'Město je uprostřed' : item.c === 'regiony' ? 'Místo je uprostřed' : item.c === 'historie' ? 'Střed státu' : 'Území je uprostřed';
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

    // Popis u českých znaků: úvod článku o městě či kraji by odpověď prozradil i se zakrytým názvem
    // („druhé největší město v Česku“), proto jen obecná věta – celý popis se ukáže po odpovědi
    const czechDescription = (item) => {
        if (item.ty === 'kraj') return 'Znak jednoho z českých krajů. Kterému patří?';
        if (item.ty === 'historická země') return 'Znak jedné z historických českých zemí. Které patří?';
        if (item.ty === 'obec') return 'Znak jedné z českých obcí. Které patří?';
        if (item.ty === 'městská část') return 'Znak jedné z pražských městských částí. Které patří?';
        // Bez „krajské“ – nesprávné možnosti bývají i jiná města
        return 'Znak jednoho z českých měst. Kterému patří?';
    };
    // Regiony, města, zaniklé státy a nová území: úvod článku by prozradil název i stát, proto jen obecná věta (celý popis po odpovědi)
    const genericDescription = (item) => {
        const what = item.it === 'z' ? 'Znak' : 'Vlajka';
        if (item.c === 'regiony') return `${what} jednoho z regionů světa (státu, země, provincie či oblasti). Kterému patří?`;
        if (item.c === 'mesta') return `${what} jednoho z velkých měst světa. Kterému patří?`;
        if (item.c === 'historie') return 'Vlajka státu, který dnes už neexistuje. Který to byl?';
        return isOrganization(item) ? 'Vlajka mezinárodní organizace nebo sdružení. Které patří?' : 'Vlajka jednoho ze závislých či sporných území. Kterému patří?';
    };
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

    const subtitle = (item, ctx) => {
        if (item.c === 'cesko') return (item.f || {}).kraj || 'Česko';
        if (item.c === 'historie') return 'Zaniklý stát';
        const country = ctx.countries && ctx.countries[(item.co || [])[0]];
        if ((item.c === 'uzemi' || item.c === 'regiony' || item.c === 'mesta') && country) return country.name;
        if (isOrganization(item)) return 'Mezinárodní organizace';
        const continent = continentOf(item, ctx);
        return continent ? CONTINENT_NAMES[continent] : '';
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

        // Nesprávné možnosti: hlavně podobně vypadající vlajky a znaky, k tomu sousedé a stejný kontinent
        similarity: (item, other, ctx) => {
            if (isTwin(item, other)) return -Infinity;
            let score = lookAlike(item.sg, other.sg) * (item.c === 'cesko' ? 6 : 10) + sharedPattern(item, other);
            // Regiony a města: vlajky stejného státu se pletou nejvíc, zaniklé státy se srovnávají podle doby
            if (item.c === 'regiony' || item.c === 'mesta') score += (item.co || [])[0] && item.co[0] === (other.co || [])[0] ? 2 : 0;
            if (item.c === 'historie') score += item.f && other.f && item.f.from !== undefined && other.f.from !== undefined ? Math.max(0, 2 - Math.abs(item.f.from - other.f.from) / 60) : 0;
            if (item.c === 'cesko') return score + ((item.f || {}).kraj && item.f.kraj === (other.f || {}).kraj ? 1.5 : 0);
            if (item.la !== undefined && other.la !== undefined) score += nearness(distanceKm(item, other), STATE_STEPS) * 0.5;
            const continent = continentOf(item, ctx);
            if (continent && continent === continentOf(other, ctx)) score += 1;
            return score;
        },
        nameAliases: (item) => aliasesOf(item),
        censor: (type, text, item, ctx) => {
            if (type !== 'name') return null;
            if (item.c === 'cesko') return czechDescription(item);
            if (isRegionLike(item) || item.gen) return genericDescription(item);
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
        questionImage: (item) => item.im ? { file: item.im, hash: item.ih, label: isFlag(item) ? 'Vlajka' : 'Znak', icon: isFlag(item) ? 'flag' : 'shield' } : null,
        hints: (item, ctx, type) => type === 'name' ? hintsOf(item, ctx) : null,
        // V atlasu obrázek samotný, jinak (po odpovědi) slepá mapa
        visual: (item, ctx, mode) => mode === 'card' ? imageOf(item) : mapOf(item, ctx),
        facts: factsOf,
        subtitle,
        coords: (item) => item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1,
        lookAlike
    };
});
