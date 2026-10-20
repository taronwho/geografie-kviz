// Téma Fyzika: fyzikální veličiny, jednotky, vesmír a fyzici (data/fyzika.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatFacts, formatNumber, formatYear, censorName, stripBrackets, shuffle, normalizeAnswer,
        personSimilarity, rankBySimilarity, takeDistinct
    } = core;

    const CATEGORIES = [
        { key: 'veliciny', label: 'Fyzikální veličiny', one: 'veličina', icon: 'gauge', question: 'Která veličina to je?', placeholder: 'Napiš název veličiny…', sort: { by: 'name' } },
        { key: 'jednotky', label: 'Jednotky', one: 'jednotka', icon: 'ruler', question: 'Která jednotka to je?', placeholder: 'Napiš název jednotky…', sort: { by: 'name' } },
        { key: 'vesmir', label: 'Vesmír', one: 'vesmírné těleso', icon: 'orbit', question: 'Co je to za těleso?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'fyzici', label: 'Fyzici', one: 'fyzik', icon: 'user', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', portrait: true, sort: { by: 'y' } }
    ];

    // Jak často se u veličiny ptáme na jednotku a u jednotky na značku nebo na to, co měří
    const UNIT_QUIZ_SHARE = 0.4;
    const SYMBOL_QUIZ_SHARE = 0.25;
    const MEASURES_QUIZ_SHARE = 0.2;

    // Velká čísla vědecky: 5,97 × 10²⁴
    const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const scientific = (value) => {
        if (value < 1e7) return formatNumber(Math.round(value * 100) / 100);
        const exponent = Math.floor(Math.log10(value));
        const mantissa = Math.round(value / 10 ** exponent * 100) / 100;
        return `${formatNumber(mantissa)} × 10${String(exponent).split('').map(digit => SUPERSCRIPTS[digit]).join('')}`;
    };
    const days = (value) => value >= 730 ? `${formatNumber(Math.round(value / 365.25 * 10) / 10)} let` : `${formatNumber(Math.round(value * 10) / 10)} dní`;
    const unitLabel = (f) => f.usym ? `${f.unit} (${f.usym})` : f.unit;

    const factsOf = (item, mode) => {
        const f = item.f || {};
        if (item.c === 'veliciny') {
            const facts = formatFacts(item, [['sym', 'Značka', v => v]]);
            if (mode !== 'unit' && f.unit) facts.push({ label: 'Jednotka SI', value: unitLabel(f) });
            return facts;
        }
        if (item.c === 'jednotky') {
            return formatFacts(item, [
                ...(mode === 'usymbol' ? [] : [['usym', 'Značka', v => v]]),
                ...(mode === 'measures' ? [] : [['measures', 'Veličina', v => v]]),
                ['system', 'Soustava', v => v]
            ]);
        }
        if (item.c === 'vesmir') {
            return formatFacts(item, [['parent', 'Obíhá kolem', v => v], ['diam', 'Průměr', v => `${scientific(v)} km`], ['mass', 'Hmotnost', v => `${scientific(v)} kg`],
                ['ly', 'Vzdálenost', v => `${scientific(v)} světelných let`], ['period', 'Oběžná doba', days], ['year', 'Objeveno', formatYear], ['disc', 'Objevitel', v => v]]);
        }
        const facts = formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear], ['land', 'Země', v => v]], ['born', 'died']);
        if (f.nobel) facts.push({ label: 'Nobelova cena', value: 'za fyziku' });
        return facts;
    };

    // Časová osa fyzika s milníky fyziky a pár světovými událostmi
    const PHYSICS_EVENTS = [
        [-250, 'Archimédův zákon', 1], [1543, 'Koperníkova soustava', 1], [1609, 'Galileiho dalekohled', 1], [1687, 'Newtonovy zákony pohybu', 1],
        [1752, 'pokus s drakem v bouřce', 1], [1800, 'první elektrický článek', 1], [1831, 'elektromagnetická indukce', 1],
        [1865, 'Maxwellovy rovnice', 1], [1895, 'objev rentgenového záření', 1], [1896, 'objev radioaktivity', 1],
        [1905, 'speciální teorie relativity', 1], [1915, 'obecná teorie relativity', 1], [1925, 'kvantová mechanika', 1],
        [1945, 'první jaderný výbuch', 1], [1957, 'první umělá družice', 1], [1969, 'přistání na Měsíci', 1],
        [2012, 'objev Higgsova bosonu', 1], [2015, 'zachycení gravitačních vln', 1],
        [1492, 'objevení Ameriky'], [1618, 'začátek třicetileté války'], [1789, 'Velká francouzská revoluce'],
        [1914, 'začátek 1. světové války'], [1939, 'začátek 2. světové války'], [1989, 'pád Berlínské zdi']
    ];
    const visualOf = (item) => {
        const f = item.f || {};
        if (item.c !== 'fyzici' || f.born === undefined || f.died === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to: f.died }], points: [], hide: item.n, anchors: PHYSICS_EVENTS };
    };

    // Obor fyziky (mechanika, elektřina a magnetismus, teplo): u veličiny z jejích okruhů, u jednotky z veličiny, kterou měří
    const FIELDS = ['mechanika', 'elektrina-magnetismus', 'teplo'];
    const quantityIndex = new WeakMap();
    const fieldsOf = (item, ctx) => {
        const own = (item.g || []).filter(group => FIELDS.includes(group));
        if (item.c !== 'jednotky' || !ctx || !ctx.items) return own;
        if (!quantityIndex.has(ctx.items)) {
            quantityIndex.set(ctx.items, new Map(ctx.items.filter(other => other.c === 'veliciny').map(other => [other.n.toLowerCase(), other])));
        }
        const quantity = quantityIndex.get(ctx.items).get(((item.f || {}).measures || '').toLowerCase());
        return [...new Set([...own, ...(quantity ? (quantity.g || []).filter(group => FIELDS.includes(group)) : [])])];
    };
    const sameField = (a, b, ctx) => {
        const fields = fieldsOf(a, ctx);
        return fields.length > 0 && fieldsOf(b, ctx).some(field => fields.includes(field));
    };

    // Značka jednotky v textu: víceznaková jako samostatné slovo, jednoznaková (V, N, J) jen za číslem („230 V“), ať nezmizí předložka
    const hideSymbol = (text, symbol) => {
        if (!symbol) return text;
        const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = symbol.length > 1
            ? new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'gu')
            : new RegExp(`(?<=\\d\\s?)${escaped}(?![\\p{L}])`, 'gu');
        return text.replace(pattern, '[***]');
    };

    return {
        id: 'fyzika',
        title: 'Fyzika',
        icon: 'atom',
        emoji: '🔭',
        color: 'violet',
        dataFile: 'data/fyzika.json',
        subtitleIcon: 'gauge',
        words: {
            question: 'Co je to?',
            one: 'pojem',
            next: 'Další otázka',
            atlas: 'Atlas fyziky',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Základní veličiny a jednotky, známá tělesa a fyzici'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: veličiny se stejnou jednotkou nebo z téhož oboru (energie – práce – teplo), jednotky téže
        // veličiny (metr – stopa – palec), tělesa téhož druhu kolem téhož tělesa (měsíce Jupiteru), fyzici stejného pohlaví a doby
        similarity: (item, other, ctx) => {
            const f = item.f || {};
            const g = other.f || {};
            if (item.c === 'veliciny') return (f.unit && f.unit === g.unit ? 3 : 0) + (sameField(item, other, ctx) ? 2 : 0);
            if (item.c === 'jednotky') return (f.measures && f.measures === g.measures ? 4 : 0) + (f.system === g.system ? 1 : 0) + (sameField(item, other, ctx) ? 2 : 0);
            if (item.c === 'vesmir') return (f.kind === g.kind ? 3 : 0) + (f.parent && f.parent === g.parent ? 3 : 0);
            return personSimilarity(item, other) + (Boolean(f.nobel) === Boolean(g.nobel) ? 1 : 0);
        },

        specialQuestion: (item, ctx, rng) => {
            const f = item.f || {};
            const same = ctx.items.filter(other => other.c === item.c && other.q !== item.q);
            // Nejpodobnější položky téže kategorie (z téhož oboru), jejich hodnota key jako nesprávné možnosti
            // Značky se porovnávají přesně (m a m² jsou různé), názvy bez diakritiky a velikosti písmen
            const rankedValues = (key, correct, extra = () => 0) => {
                const keyOf = key === 'usym' ? (value) => value : normalizeAnswer;
                return takeDistinct(rankBySimilarity(same.filter(other => other.f[key]), other => (sameField(item, other, ctx) ? 2 : 0) + extra(other), rng),
                    3, new Set([keyOf(correct)]), other => other.f[key], keyOf).map(other => other.f[key]);
            };
            if (item.c === 'veliciny') {
                if (!(rng() < UNIT_QUIZ_SHARE) || !f.unit) return null;
                // Jednotky z téhož oboru a podobně složené (k newtonu joule, pascal, watt; ne bit za sekundu)
                const wrong = rankedValues('unit', f.unit, other => (/[/·⋅ ]/.test(other.f.usym || '') === /[/·⋅ ]/.test(f.usym || '') ? 1 : 0));
                if (wrong.length < 3) return null;
                const symbols = new Map(same.map(other => [other.f.unit, other.f.usym]));
                const label = (unit) => unit === f.unit ? unitLabel(f) : symbols.get(unit) ? `${unit} (${symbols.get(unit)})` : unit;
                return {
                    type: 'unit',
                    title: 'Jaká je jednotka SI této veličiny?',
                    showName: true,
                    choices: shuffle([f.unit, ...wrong], rng).map(unit => ({ id: `jednotka-${unit}`, label: label(unit), correct: unit === f.unit })),
                    accepted: [f.unit, f.usym].filter(Boolean),
                    placeholder: 'Napiš jednotku, třeba newton',
                    answerLabel: unitLabel(f)
                };
            }
            if (item.c === 'jednotky') {
                const roll = rng();
                if (roll < SYMBOL_QUIZ_SHARE && f.usym) {
                    // Značky jednotek téže veličiny nebo oboru a stejné soustavy (k Pa: bar, atm, N…)
                    const wrong = rankedValues('usym', f.usym, other => (other.f.measures === f.measures ? 3 : 0) + (other.f.system === f.system ? 1 : 0));
                    if (wrong.length < 3) return null;
                    return {
                        type: 'usymbol',
                        title: 'Jakou značku má tato jednotka?',
                        showName: true,
                        choices: shuffle([f.usym, ...wrong], rng).map(symbol => ({ id: `znacka-${symbol}`, label: symbol, correct: symbol === f.usym })),
                        accepted: [f.usym],
                        placeholder: 'Napiš značku, třeba Pa',
                        answerLabel: f.usym
                    };
                }
                if (roll < SYMBOL_QUIZ_SHARE + MEASURES_QUIZ_SHARE && f.measures) {
                    // Veličiny z téhož oboru (k tlaku síla, energie, výkon), ne „počet“ nebo „informace“
                    const wrong = rankedValues('measures', f.measures, other => (other.f.system === f.system ? 1 : 0));
                    if (wrong.length < 3) return null;
                    return {
                        type: 'measures',
                        title: 'Co měří tato jednotka?',
                        showName: true,
                        choices: shuffle([f.measures, ...wrong], rng).map(measures => ({ id: `velicina-${measures}`, label: measures, correct: measures === f.measures })),
                        accepted: [f.measures],
                        placeholder: 'Napiš veličinu, třeba tlak',
                        answerLabel: f.measures
                    };
                }
            }
            return null;
        },
        // Popis bez hledané jednotky, značky nebo veličiny (název položky u těchto otázek zůstane)
        censor: (type, text, item) => {
            const f = item.f || {};
            const plain = stripBrackets(text).replace(/\s{2,}/g, ' ').replace(/\s+([,;.?!])/g, '$1');
            if (type === 'unit') return hideSymbol(censorName(plain, f.unit), f.usym);
            if (type === 'usymbol') return hideSymbol(plain, f.usym);
            if (type === 'measures') return censorName(plain, f.measures);
            // U otázky na jednotku nesmí zůstat ani její značka
            if (type === 'name' && item.c === 'jednotky') return hideSymbol(censorName(plain, [item.n, item.t].join(', ')), f.usym);
            return null;
        },

        visual: visualOf,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            if (item.c === 'veliciny') return [f.sym ? `značka ${f.sym}` : '', f.unit ? `jednotka ${f.usym || f.unit}` : ''].filter(Boolean).join(' · ');
            if (item.c === 'jednotky') return [f.usym, f.measures].filter(Boolean).join(' · ');
            if (item.c === 'vesmir') return [f.kind, f.parent ? `obíhá kolem: ${f.parent}` : ''].filter(Boolean).join(' · ');
            return [f.born !== undefined ? `${formatYear(f.born)}–${f.died !== undefined ? formatYear(f.died) : ''}` : '', f.land].filter(Boolean).join(' · ');
        },
        isCzech: (item) => item.cz === 1
    };
});
