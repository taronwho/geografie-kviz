// Téma Geologie: nerosty, drahé kameny, horniny a geologická období (data/geologie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatNumber, censorName, mergeCensored, stripBrackets, shuffle, rankBySimilarity, takeDistinct, formulaCounts, isFormulaMatch } = core;

    const CATEGORIES = [
        { key: 'nerosty', label: 'Nerosty', one: 'nerost', icon: 'gem', question: 'Co je to za nerost?', placeholder: 'Napiš název nerostu…', sort: { by: 'name' } },
        { key: 'kameny', label: 'Drahé kameny', one: 'drahý kámen', icon: 'diamond', question: 'Co je to za drahý kámen?', placeholder: 'Napiš název kamene…', sort: { by: 'name' } },
        { key: 'horniny', label: 'Horniny', one: 'hornina', icon: 'mountain', question: 'Co je to za horninu?', placeholder: 'Napiš název horniny…', sort: { by: 'name' } },
        { key: 'obdobi', label: 'Geologická období', one: 'období', icon: 'hourglass', question: 'Které je to období?', placeholder: 'Napiš období…', sort: { by: 'from', desc: true } }
    ];
    const isMineral = (item) => item.c === 'nerosty' || item.c === 'kameny';

    // Jak často se ptáme na tvrdost a vzorec (nerosty, drahé kameny) a na skupinu horniny; jinak na název podle fotky
    const HARDNESS_SHARE = 0.2;
    const FORMULA_SHARE = { nerosty: 0.4, kameny: 0.3 };
    const GROUP_SHARE = 0.45;

    // --- Mohsova stupnice ---
    const MOHS = [[1, 'mastek', 'Mastek'], [2, 'sádrovec', 'Sádrovec'], [3, 'kalcit', 'Kalcit'], [4, 'fluorit', 'Fluorit'], [5, 'apatit', 'Apatit'],
        [6, 'živec', 'Ortoklas'], [7, 'křemen', 'Křemen'], [8, 'topaz', 'Topaz'], [9, 'korund', 'Korund'], [10, 'diamant', 'Diamant']];
    const decimal = (value) => formatNumber(Math.round(value * 100) / 100);
    const hardnessText = (h) => h[0] === h[1] ? decimal(h[0]) : `${decimal(h[0])}–${decimal(h[1])}`;
    const singleHardness = (item) => {
        const h = (item.f || {}).h;
        return h && h[0] === h[1] && h[0] >= 1 && Number.isInteger(h[0] * 2) ? h[0] : null;
    };
    // Stupnice s deseti srovnávacími nerosty; u otázky na název nerost Mohsovy stupnice svou značku nepojmenuje (prozradila by ho)
    const mohsScale = (item, mode) => ({
        type: 'scale',
        name: 'tvrdost',
        icon: 'gauge',
        min: 1,
        max: 10,
        value: Math.max(item.f.hm, 1),
        valueLabel: `tvrdost ${hardnessText(item.f.h)}`,
        ticks: MOHS.map(([value, label, name]) => ({ value, label: mode !== 'result' && name === item.n ? String(value) : label })),
        minLabel: 'měkký',
        maxLabel: 'tvrdý',
        describe: `Mohsova stupnice tvrdosti od mastku (1) po diamant (10) s vyznačenou tvrdostí ${hardnessText(item.f.h)}.`
    });
    // Polní zkouška tvrdosti: nehet 2,5, měděná mince 3,5, nůž a sklo 5,5, ocelový pilník 6,5
    const scratchTest = (value) => value < 2.5 ? 'Rýpe do něj i nehet.'
        : value < 3.5 ? 'Nehet ne, ale měděná mince do něj rýpe.'
            : value < 5.5 ? 'Mince ne, ale nůž do něj rýpe.'
                : value < 6.5 ? 'Sám rýpe do skla, ocelový pilník ale rýpe do něj.'
                    : value < 7.5 ? 'Rýpe do skla i do oceli.'
                        : value < 9.5 ? 'Rýpe i do křemene.' : 'Rýpe do všech ostatních nerostů.';
    // Srovnání se stupnicí: stejně tvrdý srovnávací nerost, jinak sousedé na stupnici
    const mohsComparison = (item, value) => {
        const same = MOHS.find(([v, , name]) => v === value && name !== item.n);
        if (same) return { label: 'Stejně tvrdý jako', value: same[1] };
        const softer = MOHS.filter(([v, , name]) => v < value && name !== item.n).pop();
        const harder = MOHS.find(([v, , name]) => v > value && name !== item.n);
        const parts = [softer ? `tvrdší než ${softer[1]}` : '', harder ? `měkčí než ${harder[1]}` : ''].filter(Boolean);
        return { label: 'Na Mohsově stupnici', value: parts.join(', ') };
    };

    // --- Třídy nerostů (Strunz) ---
    const CLASS_NAMES = { 1: 'prvky', 2: 'sulfidy', 3: 'halogenidy', 4: 'oxidy a hydroxidy', 5: 'uhličitany', 6: 'boritany', 7: 'sírany', 8: 'fosforečnany', 9: 'křemičitany', 10: 'organické nerosty' };
    const className = (f) => {
        if (!f.cls) return '';
        if (f.cls === 2 && f.formula && !/S(?![a-z])/.test(f.formula)) return 'sulfidy a příbuzné (arsenidy, telluridy)';
        if (f.cls === 5 && f.sub === 'N') return 'dusičnany';
        if (f.cls === 7 && f.sub === 'F') return 'chromany';
        if (f.cls === 7 && f.sub === 'G') return 'molybdenany a wolframany';
        if (f.cls === 8 && /As/.test(f.formula || '')) return 'arseničnany';
        if (f.cls === 8 && /V(?![a-z])/.test(f.formula || '')) return 'vanadičnany';
        return CLASS_NAMES[f.cls] || '';
    };
    // Mateřský nerost v 2. pádě (odrůda křemene)
    const GENITIVE = { 'korund': 'korundu', 'beryl': 'berylu', 'křemen': 'křemene', 'chalcedon': 'chalcedonu', 'chryzoberyl': 'chryzoberylu', 'granát': 'granátu' };

    // --- Vzorce ---
    const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
    const plainFormula = (formula) => formula.replace(/[₀-₉]/g, digit => String(SUBSCRIPTS.indexOf(digit)));
    const symbolsOf = (formula) => formula.match(/[A-Z][a-z]?/g) || [];
    const ELEMENT_NAMES = {
        H: 'vodík', Li: 'lithium', Be: 'beryllium', B: 'bor', C: 'uhlík', N: 'dusík', O: 'kyslík', F: 'fluor', Na: 'sodík', Mg: 'hořčík', Al: 'hliník',
        Si: 'křemík', P: 'fosfor', S: 'síra', Cl: 'chlor', K: 'draslík', Ca: 'vápník', Ti: 'titan', V: 'vanad', Cr: 'chrom', Mn: 'mangan', Fe: 'železo',
        Co: 'kobalt', Ni: 'nikl', Cu: 'měď', Zn: 'zinek', As: 'arsen', Se: 'selen', Br: 'brom', Sr: 'stroncium', Zr: 'zirkonium', Mo: 'molybden',
        Ag: 'stříbro', Cd: 'kadmium', Sn: 'cín', Sb: 'antimon', Te: 'tellur', I: 'jod', Ba: 'baryum', W: 'wolfram', Au: 'zlato', Hg: 'rtuť',
        Pb: 'olovo', Bi: 'bismut', U: 'uran', Ce: 'cer'
    };
    const elementsOf = (formula) => [...new Set(symbolsOf(formula))].map(symbol => ELEMENT_NAMES[symbol]).filter(Boolean);
    // Na vzorec se ptáme jen u jasného a krátkého zápisu (FeS₂ ano, (Ca,Na)(Mg,Fe)… ani SiO₂·nH₂O ne)
    const canAskFormula = (item) => {
        const formula = (item.f || {}).formula;
        return Boolean(formula) && plainFormula(formula).length <= 14 && Boolean(formulaCounts(plainFormula(formula)))
            && symbolsOf(formula).every(symbol => ELEMENT_NAMES[symbol]);
    };
    const elementOverlap = (a, b) => {
        const left = new Set(symbolsOf(a));
        const right = new Set(symbolsOf(b));
        const shared = [...left].filter(symbol => right.has(symbol)).length;
        return shared / new Set([...left, ...right]).size;
    };
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // --- Horniny ---
    const GROUPS = {
        hlubinna: { label: 'Hlubinná vyvřelina', accepted: ['hlubinná vyvřelina', 'hlubinné vyvřeliny', 'hlubinná vyvřelá hornina', 'hlubinná', 'hlubinná hornina', 'plutonická', 'plutonit', 'intruzivní', 'vyvřelá', 'vyvřelina', 'magmatická'] },
        vylevna: { label: 'Výlevná vyvřelina', accepted: ['výlevná vyvřelina', 'výlevné vyvřeliny', 'výlevná vyvřelá hornina', 'výlevná', 'sopečná', 'vulkanická', 'vulkanit', 'efuzivní', 'vyvřelá', 'vyvřelina', 'magmatická'] },
        usazena: { label: 'Usazená hornina', accepted: ['usazená hornina', 'usazené horniny', 'usazená', 'usazenina', 'sedimentární', 'sediment'] },
        premenena: { label: 'Přeměněná hornina', accepted: ['přeměněná hornina', 'přeměněné horniny', 'přeměněná', 'metamorfovaná', 'metamorfní', 'metamorfit'] }
    };
    const GROUP_NAMES = { ...Object.fromEntries(Object.entries(GROUPS).map(([key, group]) => [key, group.label.toLowerCase()])), zilna: 'žilná vyvřelina', sporna: '' };
    const IGNEOUS = ['hlubinna', 'vylevna', 'zilna'];
    // Slova, která v popisu prozradí skupinu horniny (vyvřelá, sedimentární, metamorfovaná, z lávy…)
    const GROUP_WORDS = /(?<![\p{L}])(?:vyvřel|vyvřen|magmat|hlubinn|výlevn|výlev|vulkan|sopečn|sopk|intruz|plutoni|efuz|láv|usazen|usazov|sediment|přeměn|metamorf|žiln)\p{L}*/giu;

    // --- Geologická období ---
    const LEVELS = { eon: 'eon', 'éra': 'éra', perioda: 'perioda', epocha: 'epocha' };
    const PARENT_GENITIVE = { 'Prvohory': 'prvohor', 'Druhohory': 'druhohor', 'Třetihory': 'třetihor', 'Čtvrtohory': 'čtvrtohor' };
    // Stáří v milionech let slovy: 4 600 → 4,6 mld. let, 0,0117 → 11 700 let
    const ago = (value) => value >= 1000 ? `${formatNumber(value / 1000)} mld. let` : value >= 1 ? `${formatNumber(value)} mil. let`
        : value > 0 ? `${formatNumber(Math.round(value * 1e6))} let` : 'dnes';
    const periodRange = (f) => {
        if (f.to === 0) return `před ${ago(f.from)} až dodnes`;
        if (f.from < 1000 && f.to >= 1) return `před ${formatNumber(f.from)}–${formatNumber(f.to)} mil. let`;
        if (f.from >= 1000 && f.to >= 1000) return `před ${formatNumber(f.from / 1000)}–${formatNumber(f.to / 1000)} mld. let`;
        return `před ${ago(f.from)} až ${ago(f.to)}`;
    };
    const ageScale = (item) => ({
        type: 'scale',
        name: 'stáří',
        icon: 'hourglass',
        min: 0.01,
        max: 4600,
        log: true,
        value: Math.max(item.f.from, 0.01),
        valueLabel: `začátek před ${ago(item.f.from)}`,
        ticks: [{ value: 0.01, label: '10 tis.' }, { value: 1, label: '1 mil.' }, { value: 100, label: '100 mil.' }, { value: 1000, label: '1 mld.' }, { value: 4600, label: '4,6 mld.' }],
        minLabel: 'dnes',
        maxLabel: 'vznik Země',
        describe: `Logaritmická osa stáří od dneška po vznik Země; období začalo před ${ago(item.f.from)}.`
    });
    const paleoMap = (item) => item.f.map && item.f.mh ? { type: 'image', file: item.f.map, hash: item.f.mh, name: 'mapa světa v té době', icon: 'globe' } : null;

    // --- Fakta ---
    const fact = (label, value) => value ? [{ label, value }] : [];
    const mineralFacts = (item, mode) => {
        const f = item.f || {};
        return [
            ...fact('Odrůda nerostu', f.par),
            ...fact('Třída', className(f)),
            ...fact('Krystalová soustava', f.sys),
            ...fact('Barva', f.col),
            ...(mode !== 'hardness' && f.h ? fact('Tvrdost', hardnessText(f.h)) : []),
            ...fact('Vryp', f.str),
            ...(f.dens ? fact('Hustota', `${decimal(f.dens)} g/cm³`) : []),
            ...(item.c === 'nerosty' ? fact('Těží se z něj', f.ore) : []),
            ...fact('Původ', f.org),
            ...fact('Naleziště v Česku', f.czl),
            ...fact('Známá naleziště', f.loc),
            ...(mode !== 'formula' ? fact('Vzorec', f.formula) : [])
        ];
    };
    const rockFacts = (item, mode) => {
        const f = item.f || {};
        return [
            ...(mode !== 'group' ? fact('Skupina', GROUP_NAMES[f.grp]) : []),
            ...fact('Složení', f.comp),
            ...fact('Vzhled a vznik', f.orig),
            ...fact('Využití', f.use),
            ...fact('Naleziště v Česku', f.czl)
        ];
    };
    const periodFacts = (item) => {
        const f = item.f || {};
        return [
            ...fact('Jednotka', LEVELS[f.lvl]),
            ...fact('Patří do', f.par),
            ...fact('Doba', periodRange(f)),
            ...fact('Život', f.life)
        ];
    };
    const factsOf = (item, ctx, mode) => isMineral(item) ? mineralFacts(item, mode) : item.c === 'horniny' ? rockFacts(item, mode) : periodFacts(item);
    const pick = (facts, labels) => facts.filter(entry => labels.includes(entry.label));

    // --- Zvláštní otázky ---
    const hardnessQuestion = (item, rng) => {
        const value = singleHardness(item);
        // Nesprávné hodnoty co nejblíž (k 7 nejdřív 6 a 8), se stejnou desetinnou částí, v rozsahu stupnice
        const options = [1, 2, 3, 4, 5, 6].flatMap(step => [value - step, value + step]).filter(other => other >= 1 && other <= 10);
        const wrong = rankBySimilarity(options, other => -Math.abs(other - value), rng).slice(0, 3);
        const label = decimal(value);
        return {
            type: 'hardness',
            title: 'Jakou má tvrdost podle Mohse?',
            showName: true,
            choices: shuffle([value, ...wrong], rng).map(other => ({ id: `tvrdost-${other}`, label: decimal(other), correct: other === value })),
            accepted: [...new Set([label, String(value)])],
            placeholder: 'Napiš číslo od 1 do 10',
            answerLabel: label
        };
    };
    const formulaQuestion = (item, ctx, rng) => {
        const f = item.f;
        // Nesprávné vzorce: z podobných prvků a stejné třídy (k FeS₂ třeba FeAsS, CuFeS₂, PbS), nikdy stejné složení (kalcit × aragonit)
        const candidates = ctx.items.filter(other => isMineral(other) && other.q !== item.q && canAskFormula(other)
            && !isFormulaMatch(plainFormula(other.f.formula), [plainFormula(f.formula)]));
        const score = (other) => Math.round(elementOverlap(f.formula, other.f.formula) * 4) + (other.f.cls === f.cls ? 2 : 0)
            + (Math.abs(plainFormula(other.f.formula).length - plainFormula(f.formula).length) <= 2 ? 1 : 0);
        const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, new Set([plainFormula(f.formula)]), other => other.f.formula, plainFormula)
            .map(other => other.f.formula);
        if (wrong.length < 3) return null;
        return {
            type: 'formula',
            title: 'Jaký má vzorec?',
            showName: true,
            choices: shuffle([f.formula, ...wrong], rng).map(formula => ({ id: `vzorec-${plainFormula(formula)}`, label: formula, correct: formula === f.formula })),
            match: 'formula',
            accepted: [f.formula],
            placeholder: 'Napiš vzorec, třeba FeS2',
            answerLabel: f.formula
        };
    };
    const groupQuestion = (item, rng) => {
        const answer = item.f.grp;
        return {
            type: 'group',
            title: 'Do které skupiny hornin patří?',
            showName: true,
            choices: shuffle(Object.keys(GROUPS), rng).map(key => ({ id: `skupina-${key}`, label: GROUPS[key].label, correct: key === answer })),
            accepted: GROUPS[answer].accepted,
            placeholder: 'Napiš skupinu, třeba usazená',
            answerLabel: GROUPS[answer].label
        };
    };
    // Tvrdost jen u známých nerostů s jedním číslem tvrdosti (u rozpětí 6–6,5 by mohly platit dvě odpovědi)
    const canAskHardness = (item) => isMineral(item) && singleHardness(item) !== null
        && (item.k === 1 || MOHS.some(([, , name]) => name === item.n));

    // --- Zakrytí v popisu ---
    const tidy = (text) => stripBrackets(text).replace(/\s{2,}/g, ' ').replace(/\s+([,;.?!])/g, '$1');
    // U otázky na tvrdost čísla a pořadí ve větách o tvrdosti (kalcit je „třetím“ nerostem stupnice, mastek „nejměkčí“)
    const HARDNESS_SENTENCE = /tvrdost|Mohs|stupnic|nejměkč|nejtvrdš/i;
    const hideHardness = (text) => tidy(text).split(/(?<=[.!?])\s+/).map(sentence => HARDNESS_SENTENCE.test(sentence)
        ? sentence.replace(/\d+(?:[,.]\d+)?(?:\s*[-–]\s*\d+(?:[,.]\d+)?)?/g, '[***]')
            .replace(/(?<![\p{L}])(?:nejměkč|nejtvrdš|prvn|druh|třet|čtvrt|pát|šest|sedm|osm|devát|desát)\p{L}*/giu, '[***]')
        : sentence).join(' ');
    const hideFormula = (text, formula) => [formula, plainFormula(formula)].reduce((result, form) => result.replace(new RegExp(escapeRegExp(form), 'g'), '[***]'), tidy(text));
    const hideGroup = (text) => mergeCensored(tidy(text).replace(GROUP_WORDS, '[***]'));

    // --- Nápovědy ---
    const hintsOf = (item, ctx, type) => {
        const f = item.f || {};
        const facts = factsOf(item, ctx, type);
        if (type === 'hardness') {
            const value = singleHardness(item);
            return [
                { kind: 'facts', label: 'zkouška tvrdosti', icon: 'hammer', facts: [{ label: 'Zkouška', value: scratchTest(value) }] },
                { kind: 'facts', label: 'srovnání', icon: 'gauge', facts: [mohsComparison(item, value)] }
            ];
        }
        if (type === 'formula') {
            return [
                { kind: 'facts', label: 'třída', icon: 'layers', facts: [...fact('Třída', className(f)), ...(item.c === 'nerosty' ? fact('Těží se z něj', f.ore) : [])] },
                { kind: 'facts', label: 'složení', icon: 'atom', facts: fact('Prvky', elementsOf(f.formula).join(', ')) }
            ];
        }
        if (type === 'group') {
            return [
                { kind: 'facts', label: 'složení', icon: 'gem', facts: pick(facts, ['Složení']) },
                { kind: 'facts', label: 'vzhled a vznik', icon: 'layers', facts: pick(facts, ['Vzhled a vznik']) }
            ];
        }
        if (item.c === 'nerosty') {
            // Třída, soustava a barva (aplikace vynechá, co mají stejné všechny možnosti) → tvrdost → vryp a hustota → ruda a naleziště → vzorec
            return [
                { kind: 'facts', facts: pick(facts, ['Třída', 'Krystalová soustava', 'Barva']) },
                { kind: 'visual', spec: f.h ? mohsScale(item, type) : null },
                { kind: 'facts', label: 'vryp a hustota', icon: 'microscope', facts: pick(facts, ['Vryp', 'Hustota']) },
                { kind: 'facts', label: 'těžba a naleziště', icon: 'pickaxe', facts: pick(facts, ['Těží se z něj', 'Naleziště v Česku']) },
                { kind: 'facts', label: 'vzorec', icon: 'flask-conical', facts: pick(facts, ['Vzorec']) }
            ];
        }
        if (item.c === 'kameny') {
            return [
                { kind: 'facts', facts: pick(facts, ['Odrůda nerostu', 'Barva']) },
                { kind: 'visual', spec: f.h ? mohsScale(item, type) : null },
                { kind: 'facts', label: 'původ a naleziště', icon: 'map-pin', facts: pick(facts, ['Původ', 'Naleziště v Česku', 'Známá naleziště']) },
                { kind: 'facts', label: 'vzorec', icon: 'flask-conical', facts: pick(facts, ['Vzorec']) }
            ];
        }
        if (item.c === 'horniny') {
            return [
                { kind: 'facts', facts: pick(facts, ['Skupina', 'Složení']) },
                { kind: 'facts', label: 'vzhled a vznik', icon: 'layers', facts: pick(facts, ['Vzhled a vznik']) },
                { kind: 'facts', label: 'využití a naleziště', icon: 'map-pin', facts: pick(facts, ['Využití', 'Naleziště v Česku']) }
            ];
        }
        // Období: zařazení → mapa světa → život → stáří na ose
        return [
            { kind: 'facts', facts: pick(facts, ['Jednotka', 'Patří do']) },
            { kind: 'visual', spec: paleoMap(item) },
            { kind: 'facts', label: 'život', icon: 'leaf', facts: pick(facts, ['Život']) },
            { kind: 'visual', spec: ageScale(item) }
        ];
    };

    const visualOf = (item, ctx, mode) => {
        const f = item.f || {};
        if (isMineral(item)) return f.h && mode !== 'hardness' ? mohsScale(item, mode) : null;
        if (item.c === 'obdobi') return ageScale(item);
        return null;
    };

    const subtitle = (item) => {
        const f = item.f || {};
        if (item.c === 'nerosty') return [className(f), f.formula].filter(Boolean).join(' · ');
        if (item.c === 'kameny') return [f.par ? `odrůda ${GENITIVE[f.par] || f.par}` : f.org || className(f), f.formula].filter(Boolean).join(' · ');
        if (item.c === 'horniny') return GROUP_NAMES[f.grp] || '';
        return [f.par ? `${LEVELS[f.lvl]} ${PARENT_GENITIVE[f.par] || ''}`.trim() : LEVELS[f.lvl], periodRange(f)].filter(Boolean).join(' · ');
    };

    // Nesprávné možnosti: kameny, které by se na fotce nepoznaly, ani nadřazené období (jura × druhohory) se nesejdou
    const conflicts = (item, other) => ((item.f || {}).cf || []).includes(other.n) || ((other.f || {}).cf || []).includes(item.n)
        || (item.c === 'obdobi' && (item.f.par === other.n || other.f.par === item.n));

    return {
        id: 'geologie',
        title: 'Geologie',
        icon: 'gem',
        emoji: '💎',
        color: 'yellow',
        dataFile: 'data/geologie.json',
        subtitleIcon: 'layers',
        words: {
            question: 'Co je to?',
            one: 'nerost',
            next: 'Další otázka',
            atlas: 'Atlas nerostů a hornin',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Známé nerosty, drahé kameny, horniny a období',
            czechBadge: 'Česká stopa'
        },
        categories: CATEGORIES,

        // Nerosty stejné třídy a barvy (k pyritu chalkopyrit, markazit), kameny stejné barvy (k rubínu almandin, jaspis),
        // horniny stejné skupiny, období stejné úrovně a blízké doby
        similarity: (item, other) => {
            if (conflicts(item, other)) return -Infinity;
            const f = item.f || {};
            const g = other.f || {};
            if (item.c === 'nerosty') {
                return (f.cls && f.cls === g.cls ? 3 : 0) + (f.cg && f.cg === g.cg ? 2 : 0) + (f.ore && g.ore ? 1 : 0)
                    + (f.sys && f.sys === g.sys ? 1 : 0) + ((item.cz === 1) === (other.cz === 1) ? 1 : 0);
            }
            if (item.c === 'kameny') {
                return (f.cg && f.cg === g.cg ? 4 : 0) + (f.par && f.par === g.par ? 1 : 0) + (Boolean(f.org) === Boolean(g.org) ? 1 : 0);
            }
            if (item.c === 'horniny') {
                return (f.grp === g.grp ? 3 : IGNEOUS.includes(f.grp) && IGNEOUS.includes(g.grp) ? 1 : 0) + ((item.cz === 1) === (other.cz === 1) ? 1 : 0);
            }
            return (f.lvl === g.lvl ? 3 : 0) + (f.par && f.par === g.par ? 2 : 0)
                - Math.round(Math.abs(Math.log10(Math.max(f.from, 0.01)) - Math.log10(Math.max(g.from, 0.01))));
        },
        nameAliases: (item) => (item.f || {}).al || [],

        specialQuestion: (item, ctx, rng) => {
            const roll = rng();
            if (isMineral(item)) {
                if (roll < HARDNESS_SHARE && canAskHardness(item)) return hardnessQuestion(item, rng);
                if (roll < FORMULA_SHARE[item.c] && canAskFormula(item)) return formulaQuestion(item, ctx, rng);
                return null;
            }
            if (item.c === 'horniny' && roll < GROUP_SHARE && GROUPS[item.f.grp]) return groupQuestion(item, rng);
            return null;
        },
        // Fotka nerostu, kamene či horniny je vidět hned v otázce – bez ní by se nedalo poznávat
        questionImage: (item) => {
            if (!item.im || !item.ih) return null;
            if (item.c === 'nerosty') return { file: item.im, hash: item.ih, label: 'Nerost', icon: 'gem' };
            if (item.c === 'kameny') return { file: item.im, hash: item.ih, label: 'Kámen', icon: 'diamond' };
            if (item.c === 'horniny') return { file: item.im, hash: item.ih, label: 'Hornina', icon: 'mountain' };
            return null;
        },
        censor: (type, text, item) => {
            if (type === 'hardness') return hideHardness(text);
            if (type === 'formula') return hideFormula(text, item.f.formula);
            if (type === 'group') return hideGroup(text);
            return null;
        },
        hints: hintsOf,
        visual: visualOf,
        facts: factsOf,
        subtitle,
        isCzech: (item) => item.cz === 1
    };
});
