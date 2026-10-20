// Téma Chemie: chemické prvky, sloučeniny a látky, chemici (data/chemie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatFacts, formatNumber, formatYear, elementFamily, periodicPosition, stripBrackets, censorName, displayName, shuffle, normalizeAnswer,
        sharesGroup, personSimilarity, rankBySimilarity, takeDistinct
    } = core;

    const CATEGORIES = [
        { key: 'prvky', label: 'Chemické prvky', one: 'prvek', icon: 'grid-3x3', question: 'Který prvek to je?', placeholder: 'Napiš název prvku…', sort: { by: 'z' } },
        { key: 'latky', label: 'Sloučeniny a látky', one: 'látka', icon: 'beaker', question: 'Co je to za látku?', placeholder: 'Napiš název látky…', sort: { by: 'name' } },
        { key: 'chemici', label: 'Chemici', one: 'chemik', icon: 'user', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } }
    ];

    // Jak často se u prvku ptáme na značku a u látky na vzorec
    const SYMBOL_QUIZ_SHARE = 0.4;
    const FORMULA_QUIZ_SHARE = 0.35;

    const celsius = (value) => `${formatNumber(value)} °C`;
    // Hustota plynů je tisíckrát menší (vodík 0,00009 g/cm³) – zaokrouhlením by z ní byla nula
    const density = (value) => `${formatNumber(value >= 0.01 ? value : Number(value.toPrecision(2)))} g/cm³`;
    const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
    const plainFormula = (formula) => formula.replace(/[₀-₉]/g, digit => String(SUBSCRIPTS.indexOf(digit)));
    const symbolsOf = (formula) => formula.match(/[A-Z][a-z]?/g) || [];
    const firstWord = (name) => normalizeAnswer(name.split(' ')[0]);
    // Jak moc se vzorce shodují v prvcích (0 až 1)
    const elementOverlap = (a, b) => {
        const left = new Set(symbolsOf(a || ''));
        const right = new Set(symbolsOf(b || ''));
        const shared = [...left].filter(symbol => right.has(symbol)).length;
        return left.size + right.size ? shared / new Set([...left, ...right]).size : 0;
    };
    const similarLength = (a, b) => Boolean(a && b) && Math.abs(plainFormula(a).length - plainFormula(b).length) <= 2;
    // Vzorec v obvyklém zápisu: Wikidata mají u některých látek jen Hillův zápis (ClHO místo HClO, CNNa místo NaCN),
    // který by mezi možnostmi nápadně trčel
    const METALS = /^(Li|Na|K|Rb|Cs|Be|Mg|Ca|Sr|Ba|Al|Fe|Cu|Zn|Ag|Au|Hg|Pb|Sn|Mn|Cr|Ni|Co|Ti)$/;
    const looksUsual = (formula) => {
        const symbols = symbolsOf(formula);
        if (symbols.length > 1 && /^(Cl|Br|I|F)$/.test(symbols[0])) return false;
        return !(symbols.includes('C') && !symbols.includes('H') && symbols.some(symbol => METALS.test(symbol)));
    };
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    // Názvy prvků ve vzorci (H₂SO₄ → vodík, síra, kyslík) – nápověda k otázce na vzorec
    const elementNames = new WeakMap();
    const elementNamesOf = (formula, ctx) => {
        if (!elementNames.has(ctx.items)) {
            elementNames.set(ctx.items, new Map(ctx.items.filter(other => other.c === 'prvky').map(other => [other.f.sym, other.n.toLowerCase()])));
        }
        return [...new Set(symbolsOf(formula || ''))].map(symbol => elementNames.get(ctx.items).get(symbol)).filter(Boolean);
    };

    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (item.c === 'prvky') {
            const family = elementFamily(f.z);
            const facts = [];
            if (answered) facts.push({ label: 'Značka', value: f.sym }, { label: 'Protonové číslo', value: String(f.z) });
            if (answered && f.lat && normalizeAnswer(f.lat) !== normalizeAnswer(item.n)) facts.push({ label: 'Latinsky', value: capitalize(f.lat) });
            if (answered && f.ar) facts.push({ label: 'Atomová hmotnost', value: formatNumber(f.ar) });
            if (family) facts.push({ label: 'Skupina prvků', value: family.label });
            if (f.year !== undefined) facts.push({ label: 'Objeven', value: f.year < 1000 ? 'známý od starověku' : String(f.year) });
            return [...facts, ...formatFacts(item, [['disc', 'Objevitel', v => v], ['named', 'Pojmenován po', v => v],
                ['melt', 'Teplota tání', celsius], ['boil', 'Teplota varu', celsius], ['dens', 'Hustota', density]])];
        }
        if (item.c === 'latky') {
            // Vzorec je nejsilnější nápověda – mezi fakty až na konci, u otázky na vzorec vůbec
            const formula = mode === 'formula' ? [] : [['formula', 'Vzorec', v => v]];
            return formatFacts(item, [['molar', 'Molární hmotnost', v => `${formatNumber(v)} g/mol`], ['melt', 'Teplota tání', celsius],
                ['boil', 'Teplota varu', celsius], ['dens', 'Hustota', density], ...formula]);
        }
        const facts = formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear], ['land', 'Země', v => v]], ['born', 'died']);
        if (f.nobel) facts.push({ label: 'Nobelova cena', value: 'za chemii' });
        return facts;
    };

    // Časová osa chemika s milníky chemie
    const CHEMISTRY_EVENTS = [
        [1661, 'Boyle: Skeptický chemik', 1], [1774, 'objev kyslíku', 1], [1789, 'zákon zachování hmotnosti', 1],
        [1803, 'Daltonova atomová teorie', 1], [1828, 'syntéza močoviny', 1], [1869, 'periodická tabulka prvků', 1],
        [1898, 'objev radia a polonia', 1], [1901, 'první Nobelovy ceny', 1], [1911, 'objev atomového jádra', 1],
        [1928, 'objev penicilinu', 1], [1938, 'štěpení uranu', 1], [1953, 'struktura DNA', 1], [1985, 'objev fullerenů', 1],
        [1492, 'objevení Ameriky'], [1618, 'začátek třicetileté války'], [1914, 'začátek 1. světové války'],
        [1939, 'začátek 2. světové války'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi']
    ];

    const visualOf = (item, ctx, mode) => {
        const f = item.f || {};
        if (item.c === 'prvky') return f.z ? { type: 'periodic', z: f.z } : null;
        // Strukturní vzorec prozradí vzorec – u otázky na vzorec ho neukážeme
        if (item.c === 'latky') return item.sv && item.sh && mode !== 'formula' ? { type: 'image', file: item.sv, hash: item.sh, name: 'strukturní vzorec', icon: 'network' } : null;
        if (f.born === undefined || f.died === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to: f.died }], points: [], hide: item.n, anchors: CHEMISTRY_EVENTS };
    };

    // Značka do popisu nepatří: dvoupísmenná jako samostatné slovo, jednopísmenná jen ve vzorci (O₂), aby nezmizelo „o“ nebo „C“ ve větě
    const hideSymbol = (text, symbol) => {
        const pattern = symbol.length > 1
            ? new RegExp(`(?<![\\p{L}])${escapeRegExp(symbol)}(?![\\p{Ll}])`, 'gu')
            : new RegExp(`(?<![\\p{L}])${escapeRegExp(symbol)}(?=[₀-₉\\d])`, 'gu');
        return text.replace(pattern, '[***]').replace(/\s{2,}/g, ' ');
    };

    return {
        id: 'chemie',
        title: 'Chemie',
        icon: 'flask-conical',
        emoji: '⚗️',
        color: 'sky',
        dataFile: 'data/chemie.json',
        subtitleIcon: 'atom',
        words: {
            question: 'Co je to?',
            one: 'látka',
            next: 'Další otázka',
            atlas: 'Atlas chemie',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Běžné prvky a látky, slavní chemici'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: prvky ze stejné skupiny a z okolí v tabulce, látky stejného druhu (kyselina ke kyselinám)
        // a podobného složení, chemici stejného pohlaví a doby
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            if (item.c === 'prvky') {
                const a = periodicPosition(f.z);
                const b = periodicPosition(g.z);
                return ((elementFamily(f.z) || {}).key === (elementFamily(g.z) || {}).key ? 3 : 0)
                    + (a && b && a.col === b.col && !a.fBlock ? 2 : 0) + (a && b && a.period === b.period ? 1 : 0) + (Math.abs(f.z - g.z) <= 3 ? 1 : 0);
            }
            if (item.c === 'latky') {
                return (firstWord(item.n) === firstWord(other.n) ? 3 : 0) + Math.round(elementOverlap(f.formula, g.formula) * 3)
                    + (sharesGroup(item, other) ? 2 : 0) + (similarLength(f.formula, g.formula) ? 2 : 0)
                    // Stejná koncovka názvu: methan – ethan, propan; ethanol – methanol
                    + (normalizeAnswer(item.n).slice(-3) === normalizeAnswer(other.n).slice(-3) ? 1 : 0);
            }
            return personSimilarity(item, other) + (Boolean(f.nobel) === Boolean(g.nobel) ? 1 : 0);
        },

        specialQuestion: (item, ctx, rng) => {
            const f = item.f || {};
            if (item.c === 'prvky') {
                if (!(rng() < SYMBOL_QUIZ_SHARE) || !f.sym) return null;
                // Značku, kterou je vidět už v názvu (Helium → He, Neon → Ne), by nebylo co hádat
                if (normalizeAnswer(item.n).startsWith(f.sym.toLowerCase())) return null;
                // Matoucí možnosti: značky začínající stejným písmenem (Fe – F, Fr, Fm), jinak prvky z okolí v tabulce (W – Mo, Re, Ta)
                const others = ctx.items.filter(other => other.c === 'prvky' && other.f.sym && other.f.sym !== f.sym);
                const position = periodicPosition(f.z);
                const score = (other) => (other.f.sym[0] === f.sym[0] ? 5 : 0) + (other.k === item.k ? 1 : 0) + (() => {
                    const near = periodicPosition(other.f.z);
                    return near && position ? (near.col === position.col ? 2 : 0) + (near.period === position.period ? 2 : 0) : 0;
                })();
                const wrong = takeDistinct(rankBySimilarity(others, score, rng), 3, new Set([f.sym]), other => other.f.sym, symbol => symbol)
                    .map(other => other.f.sym);
                return {
                    type: 'symbol',
                    title: 'Jakou značku má tento prvek?',
                    showName: true,
                    choices: shuffle([f.sym, ...wrong], rng).map(symbol => ({ id: `znacka-${symbol}`, label: symbol, correct: symbol === f.sym })),
                    match: 'symbol',
                    accepted: [f.sym],
                    placeholder: 'Napiš značku, třeba Fe',
                    answerLabel: f.sym
                };
            }
            if (item.c === 'latky') {
                // Jen jednoduché vzorce (H₂SO₄ ano, C₄₃H₆₆N₁₂O₁₂S₂ ne)
                if (!(rng() < FORMULA_QUIZ_SHARE) || !f.formula || plainFormula(f.formula).length > 9 || !looksUsual(f.formula)) return null;
                // Nesprávné vzorce: ze stejných prvků a podobně dlouhé (k H₂SO₄ třeba H₂SO₃, H₂S, SO₃), přednostně látky stejného druhu
                const candidates = ctx.items.filter(other => other.c === 'latky' && other.f.formula && other.f.formula !== f.formula
                    && plainFormula(other.f.formula).length <= 9 && looksUsual(other.f.formula));
                const score = (other) => Math.round(elementOverlap(f.formula, other.f.formula) * 4)
                    + (similarLength(f.formula, other.f.formula) ? 1 : 0)
                    + (firstWord(item.n) === firstWord(other.n) || sharesGroup(item, other) ? 1 : 0);
                const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, new Set([plainFormula(f.formula)]), other => other.f.formula, plainFormula)
                    .map(other => other.f.formula);
                if (wrong.length < 3) return null;
                return {
                    type: 'formula',
                    title: 'Jaký vzorec má tato látka?',
                    showName: true,
                    choices: shuffle([f.formula, ...wrong], rng).map(formula => ({ id: `vzorec-${formula}`, label: formula, correct: formula === f.formula })),
                    match: 'symbol',
                    accepted: [f.formula],
                    placeholder: 'Napiš vzorec, třeba H2O',
                    answerLabel: f.formula
                };
            }
            return null;
        },
        // Nápovědy: u značky latinský název (Natrium → Na), u vzorce prvky, ze kterých je, a molární hmotnost;
        // fotka bílého prášku ani teplota tání by tu nepomohly
        hints: (item, ctx, type) => {
            const f = item.f || {};
            if (type === 'symbol') {
                const latin = f.lat && normalizeAnswer(f.lat) !== normalizeAnswer(item.n) ? capitalize(f.lat) : null;
                return [{ kind: 'facts', label: 'latinský název', icon: 'scroll', facts: latin ? [{ label: 'Latinsky', value: latin }] : [] }];
            }
            if (type === 'formula') {
                const elements = elementNamesOf(f.formula, ctx);
                return [
                    { kind: 'facts', label: 'složení', icon: 'atom', facts: elements.length ? [{ label: 'Prvky', value: elements.join(', ') }] : [] },
                    { kind: 'facts', label: 'molární hmotnost', icon: 'scale', facts: f.molar ? [{ label: 'Molární hmotnost', value: `${formatNumber(f.molar)} g/mol` }] : [] }
                ];
            }
            return null;
        },
        // Popis: u otázky na značku zmizí značka, u otázky na vzorec vzorec; u otázky na název k tomu i název
        censor: (type, text, item) => {
            const f = item.f || {};
            // Skupiny vitamínů (vitamín A) vzorec nemají
            const hideFormula = (value) => f.formula ? [f.formula, plainFormula(f.formula)].reduce((result, formula) => result.split(formula).join('[***]'), value) : value;
            const plain = stripBrackets(text).replace(/\s{2,}/g, ' ').replace(/\s+([,;.?!])/g, '$1');
            if (type === 'symbol') return hideSymbol(plain, f.sym);
            if (type === 'formula') return hideFormula(plain);
            if (type !== 'name' || item.c === 'chemici') return null;
            const withoutName = censorName(text, [item.n, displayName(item.t || '')].join(', '));
            return item.c === 'prvky' ? hideSymbol(withoutName, f.sym) : hideFormula(withoutName);
        },

        visual: visualOf,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            if (item.c === 'prvky') return `${f.sym} · protonové číslo ${f.z}`;
            if (item.c === 'latky') return f.formula || '';
            return [f.born !== undefined ? `${formatYear(f.born)}–${f.died !== undefined ? formatYear(f.died) : ''}` : '', f.land].filter(Boolean).join(' · ');
        },
        isCzech: (item) => item.cz === 1
    };
});
