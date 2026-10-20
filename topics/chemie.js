// Téma Chemie: chemické prvky, sloučeniny a látky, chemici (data/chemie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatFacts, formatNumber, formatYear, elementFamily, stripBrackets, censorName, displayName, shuffle } = core;

    const CATEGORIES = [
        { key: 'prvky', label: 'Chemické prvky', one: 'prvek', icon: 'atom', question: 'Který prvek to je?', placeholder: 'Napiš název prvku…', sort: { by: 'z' } },
        { key: 'latky', label: 'Sloučeniny a látky', one: 'látka', icon: 'test-tube', question: 'Co je to za látku?', placeholder: 'Napiš název látky…', sort: { by: 'name' } },
        { key: 'chemici', label: 'Chemici', one: 'chemik', icon: 'user', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } }
    ];

    // Jak často se u prvku ptáme na značku a u látky na vzorec
    const SYMBOL_QUIZ_SHARE = 0.4;
    const FORMULA_QUIZ_SHARE = 0.35;

    const celsius = (value) => `${formatNumber(value)} °C`;
    const density = (value) => `${formatNumber(value)} g/cm³`;
    const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
    const plainFormula = (formula) => formula.replace(/[₀-₉]/g, digit => String(SUBSCRIPTS.indexOf(digit)));
    const symbolsOf = (formula) => formula.match(/[A-Z][a-z]?/g) || [];
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (item.c === 'prvky') {
            const family = elementFamily(f.z);
            const facts = [];
            if (answered) facts.push({ label: 'Značka', value: f.sym }, { label: 'Protonové číslo', value: String(f.z) });
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

        // Nesprávné možnosti: prvky ze stejné skupiny, látky se stejným prvním prvkem
        groupOf: (item) => item.c === 'prvky' ? ((elementFamily(item.f.z) || {}).key || '')
            : item.c === 'latky' ? (symbolsOf(item.f.formula || '')[0] || '') : '',

        specialQuestion: (item, ctx, rng) => {
            const f = item.f || {};
            if (item.c === 'prvky') {
                if (!(rng() < SYMBOL_QUIZ_SHARE) || !f.sym) return null;
                // Matoucí možnosti: značky začínající stejným písmenem (Fe – F, Fr, Fm), jinak jakékoli
                const others = ctx.items.filter(other => other.c === 'prvky' && other.f.sym && other.f.sym !== f.sym).map(other => other.f.sym);
                const similar = shuffle(others.filter(symbol => symbol[0] === f.sym[0]), rng);
                const wrong = [...similar, ...shuffle(others.filter(symbol => symbol[0] !== f.sym[0]), rng)].slice(0, 3);
                return {
                    type: 'symbol',
                    title: 'Jakou značku má tento prvek?',
                    showName: true,
                    choices: shuffle([f.sym, ...wrong], rng).map(symbol => ({ id: `znacka-${symbol}`, label: symbol, correct: symbol === f.sym })),
                    accepted: [f.sym],
                    placeholder: 'Napiš značku, třeba Fe',
                    answerLabel: f.sym
                };
            }
            if (item.c === 'latky') {
                // Jen jednoduché vzorce (H₂SO₄ ano, C₄₃H₆₆N₁₂O₁₂S₂ ne)
                if (!(rng() < FORMULA_QUIZ_SHARE) || !f.formula || plainFormula(f.formula).length > 9) return null;
                const elements = new Set(symbolsOf(f.formula));
                const others = [...new Set(ctx.items
                    .filter(other => other.c === 'latky' && other.f.formula && other.f.formula !== f.formula && plainFormula(other.f.formula).length <= 9)
                    .map(other => other.f.formula))];
                const sharing = shuffle(others.filter(formula => symbolsOf(formula).some(symbol => elements.has(symbol))), rng);
                const wrong = [...sharing, ...shuffle(others, rng)].filter((formula, i, list) => list.indexOf(formula) === i).slice(0, 3);
                if (wrong.length < 3) return null;
                return {
                    type: 'formula',
                    title: 'Jaký vzorec má tato látka?',
                    showName: true,
                    choices: shuffle([f.formula, ...wrong], rng).map(formula => ({ id: `vzorec-${formula}`, label: formula, correct: formula === f.formula })),
                    accepted: [f.formula, plainFormula(f.formula)],
                    placeholder: 'Napiš vzorec, třeba H2O',
                    answerLabel: f.formula
                };
            }
            return null;
        },
        // Popis: u otázky na značku zmizí značka, u otázky na vzorec vzorec; u otázky na název k tomu i název
        censor: (type, text, item) => {
            const f = item.f || {};
            const hideFormula = (value) => [f.formula, plainFormula(f.formula)].reduce((result, formula) => result.split(formula).join('[***]'), value);
            const plain = stripBrackets(text).replace(/\s{2,}/g, ' ');
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
