// Téma Architektura: stavby s jasným slohem, architektonické slohy a architekti (data/architektura.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatYear, formatFacts, censorName, mergeCensored, stripBrackets, shuffle, normalizeAnswer, isAnswerMatch, rankBySimilarity, takeDistinct,
        personSimilarity, eraNearness, getCountryNames, nameAnswers
    } = core;

    const CATEGORIES = [
        { key: 'stavby', label: 'Stavby', one: 'stavba', icon: 'church', question: 'Co je to za stavbu?', placeholder: 'Napiš název stavby…', sort: { by: 'y' } },
        { key: 'slohy', label: 'Slohy', one: 'sloh', icon: 'columns-3', question: 'Který sloh to je?', placeholder: 'Napiš sloh…', sort: { by: 'y' } },
        { key: 'architekti', label: 'Architekti', one: 'architekt', icon: 'pen-tool', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } }
    ];

    // U stavby se nejčastěji ptáme na sloh, u stavby se slavným architektem i na autora; název stavby zná i zeměpis
    const ARCHITECT_QUIZ_SHARE = 0.3;
    const STYLE_QUIZ_SHARE = 0.8;

    // Slohy: slova, která sloh v popisu prozradí (začátky slov, i novogotický, rokokový…), další přijímané odpovědi
    // a slohy, které se s ním nesmí sejít mezi možnostmi (gotika × novogotika – na fotce by šlo o obojí)
    const STYLE_INFO = {
        recko: { words: ['řeck', 'antick', 'antik', 'helén'], aliases: ['řecká architektura', 'antická architektura', 'antika', 'řecký sloh', 'starověké Řecko'] },
        rim: { words: ['řím', 'antick', 'antik'], aliases: ['římská architektura', 'antická architektura', 'antika', 'římský sloh', 'starověký Řím'] },
        byzantsky: { words: ['byzan', 'novobyzan', 'neobyzan'], aliases: ['byzantská architektura', 'byzantský', 'Byzanc'] },
        islamska: { words: ['islám', 'maursk', 'mudéjar', 'mughal', 'mughál', 'mogul', 'osmansk', 'seldžu'], aliases: ['islámský sloh', 'islámská', 'maurský sloh', 'osmanská architektura', 'mughalská architektura'] },
        romansky: { words: ['román', 'romanik', 'novorom', 'neorom'], aliases: ['románská architektura', 'romanika', 'románský', 'románský styl'] },
        gotika: { words: ['gotik', 'gotic', 'gotič', 'gotis', 'novogot', 'neogot', 'pseudogot'], aliases: ['gotický sloh', 'gotická architektura', 'gotický', 'gotická'] },
        renesance: { words: ['renesan', 'novorenesan', 'neorenesan', 'manýris'], aliases: ['renesanční', 'renesanční architektura', 'renesanční sloh'] },
        baroko: { words: ['barok', 'novobarok', 'neobarok', 'rokok'], aliases: ['barokní', 'barokní architektura', 'barokní sloh'] },
        'barokni-gotika': { words: ['barok', 'gotik', 'gotic', 'gotič', 'santiniho'], aliases: ['barokně gotický sloh', 'Santiniho gotika'] },
        rokoko: { words: ['rokok', 'barok'], aliases: ['rokokový', 'rokoková architektura', 'rokokový sloh'] },
        klasicismus: { words: ['klasici', 'neoklasici', 'empír', 'palladi'], aliases: ['klasicistní', 'klasicistní architektura', 'neoklasicismus', 'klasicistní sloh'] },
        empir: { words: ['empír', 'klasici'], aliases: ['empírový', 'empírový sloh', 'empire'] },
        historismus: { words: ['historis', 'historizu', 'eklekti', 'novogot', 'novorenesan', 'novobarok', 'novorom', 'neogot', 'neorenesan', 'neobarok', 'pseudo'],
            aliases: ['historizující sloh', 'eklektismus', 'eklekticismus'] },
        novogotika: { words: ['novogot', 'neogot', 'pseudogot', 'gotik', 'gotic', 'gotič', 'historis'], aliases: ['novogotický', 'neogotika', 'pseudogotika', 'novogotický sloh'] },
        novoromansky: { words: ['novorom', 'neorom', 'román', 'historis'], aliases: ['novorománský', 'neorománský sloh', 'novoromanika'] },
        novorenesance: { words: ['novorenesan', 'neorenesan', 'renesan', 'historis'], aliases: ['novorenesanční', 'neorenesance', 'novorenesanční sloh'] },
        novobaroko: { words: ['novobarok', 'neobarok', 'barok', 'historis'], aliases: ['novobarokní', 'neobaroko', 'novobarokní sloh'] },
        novobyzantsky: { words: ['novobyzan', 'neobyzan', 'byzan', 'historis', 'rusk'], aliases: ['novobyzantský', 'neobyzantský sloh', 'rusko-byzantský sloh'] },
        secese: { words: ['secesn', 'secese', 'secesi', 'art nouveau', 'jugendstil', 'modernism', 'modernist'], aliases: ['secesní', 'secesní sloh', 'art nouveau', 'katalánský modernismus', 'jugendstil'] },
        kubismus: { words: ['kubis', 'rondokubis'], aliases: ['kubistický', 'český kubismus', 'rondokubismus', 'kubistický sloh'] },
        artdeco: { words: ['art deco', 'art-deco', 'artdeco', 'rondokubis'], aliases: ['artdeco', 'art-deco'] },
        funkcionalismus: { words: ['funkcional', 'internacionál', 'mezinárodní sloh', 'mezinárodní styl', 'bauhaus'], aliases: ['funkcionalistický', 'mezinárodní sloh', 'internacionální styl', 'funkcionalistický sloh'] },
        socrealismus: { words: ['socialistick', 'socrealis', 'sorel', 'stalinsk'], aliases: ['sorela', 'socrealismus', 'stalinský empír', 'socialistický klasicismus'] },
        brutalismus: { words: ['brutalis'], aliases: ['brutalistický', 'brutalistní'] },
        postmodernismus: { words: ['postmodern'], aliases: ['postmoderna', 'postmoderní', 'postmoderní architektura'] },
        hightech: { words: ['high-tech', 'high tech', 'hightech'], aliases: ['high tech', 'hightech', 'high-tech architektura'] },
        dekonstruktivismus: { words: ['dekonstruktiv', 'dekonstrukc'], aliases: ['dekonstruktivistický', 'dekonstrukce'] }
    };
    const CONFLICTS = [
        ['gotika', 'novogotika'], ['gotika', 'barokni-gotika'], ['baroko', 'barokni-gotika'], ['baroko', 'novobaroko'], ['baroko', 'rokoko'],
        ['novobaroko', 'rokoko'], ['renesance', 'novorenesance'], ['romansky', 'novoromansky'], ['byzantsky', 'novobyzantsky'], ['byzantsky', 'islamska'],
        ['klasicismus', 'empir'], ['recko', 'rim'], ['kubismus', 'artdeco'], ['postmodernismus', 'dekonstruktivismus'], ['postmodernismus', 'hightech'],
        ['funkcionalismus', 'hightech'], ['funkcionalismus', 'brutalismus'], ['funkcionalismus', 'postmodernismus'],
        ...['novogotika', 'novoromansky', 'novorenesance', 'novobaroko', 'novobyzantsky'].map(key => ['historismus', key])
    ];
    const isConflict = (a, b) => a === b || CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stylePatterns = new Map();
    const stylePattern = (key) => {
        if (!stylePatterns.has(key)) {
            const words = (STYLE_INFO[key] || { words: [] }).words.map(word => escapeRegExp(word).replace(/[ -]/g, '[ -]?'));
            stylePatterns.set(key, words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})[\\p{L}-]*`, 'giu') : null);
        }
        return stylePatterns.get(key);
    };
    const tidy = (text) => stripBrackets(text).replace(/\s{2,}/g, ' ').replace(/\s+([,;.?!])/g, '$1');
    // Popis bez slohu (gotický, novogotický, gotiky…)
    const hideStyle = (text, key) => {
        const pattern = stylePattern(key);
        return pattern ? mergeCensored(tidy(text).replace(pattern, '[***]')) : tidy(text);
    };
    const revealsStyle = (text, key) => hideStyle(text, key).includes('[***]');

    // Rejstříky položek podle ID a slohů podle klíče (ctx.items se během hry nemění)
    const indexes = new WeakMap();
    const indexOf = (ctx) => {
        if (!indexes.has(ctx.items)) {
            const byId = new Map(ctx.items.map(item => [item.q, item]));
            const styles = new Map(ctx.items.filter(item => item.c === 'slohy').map(item => [item.f.key, item]));
            const fame = new Map(ctx.items.map((item, index) => [item.q, index]));
            indexes.set(ctx.items, { byId, styles, fame });
        }
        return indexes.get(ctx.items);
    };
    const styleItem = (key, ctx) => key ? indexOf(ctx).styles.get(key) || null : null;
    const styleName = (key, ctx) => {
        const style = styleItem(key, ctx);
        return style ? style.n : '';
    };
    const architectOf = (item, ctx) => {
        const architect = item.f && item.f.aq ? indexOf(ctx).byId.get(item.f.aq) : null;
        return architect && architect.c === 'architekti' ? architect : null;
    };
    // Nejznámější položky podle podmínky: nejdřív známé, pak v pořadí dat (podle počtu jazykových verzí)
    const famous = (ctx, test, count) => ctx.items.filter(test)
        .sort((a, b) => (b.k || 0) - (a.k || 0) || indexOf(ctx).fame.get(a.q) - indexOf(ctx).fame.get(b.q))
        .slice(0, count);

    // Příjmení slavného architekta jako psaná odpověď (Gaudí, Santini), jen když ho nemá jiný architekt v datech
    const surnames = new WeakMap();
    const surnameOf = (name) => {
        const words = name.replace(/\s*\(.*\)$/, '').split(' ').filter(word => !/^(von|van|der|de|da|di|del|z|ze)$/i.test(word));
        return words.length > 1 ? words[words.length - 1] : '';
    };
    const architectAliases = (item, ctx) => {
        if (!ctx || !ctx.items) return [];
        if (!surnames.has(ctx.items)) {
            const counts = new Map();
            for (const other of ctx.items.filter(candidate => candidate.c === 'architekti')) {
                const surname = surnameOf(other.n);
                for (const form of new Set([surname, surname.split('-')[0]].filter(Boolean))) counts.set(normalizeAnswer(form), (counts.get(normalizeAnswer(form)) || 0) + 1);
            }
            surnames.set(ctx.items, counts);
        }
        const counts = surnames.get(ctx.items);
        const surname = surnameOf(item.n);
        return [...new Set([surname, surname.split('-')[0]])].filter(form => form && form.length >= 4 && counts.get(normalizeAnswer(form)) === 1);
    };
    const styleAnswers = (style) => [style.n, ...((STYLE_INFO[style.f.key] || {}).aliases || [])];

    // --- Časová osa: rok stavby, období slohu, život architekta – se světovými (u českých položek českými) událostmi ---
    const WORLD_EVENTS = [
        [-776, 'první olympijské hry'], [-509, 'vznik římské republiky'], [-44, 'zavraždění Caesara'], [1, 'počátek letopočtu'],
        [476, 'pád Západořímské říše'], [622, 'počátek islámu'], [800, 'korunovace Karla Velikého'], [1066, 'bitva u Hastingsu'],
        [1096, 'první křížová výprava'], [1347, 'morová epidemie v Evropě'], [1453, 'pád Konstantinopole'], [1492, 'objevení Ameriky'],
        [1517, 'počátek reformace'], [1618, 'začátek třicetileté války'], [1648, 'konec třicetileté války'], [1776, 'nezávislost USA'],
        [1789, 'Velká francouzská revoluce'], [1815, 'bitva u Waterloo'], [1848, 'revoluce v Evropě'], [1914, 'začátek 1. světové války'],
        [1939, 'začátek 2. světové války'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi'], [2001, 'útoky 11. září']
    ];
    const CZECH_EVENTS = [
        [863, 'příchod Cyrila a Metoděje'], [935, 'zavraždění sv. Václava'], [1212, 'Zlatá bula sicilská'], [1306, 'vymření Přemyslovců'],
        [1348, 'založení Karlovy univerzity'], [1415, 'upálení Jana Husa'], [1526, 'nástup Habsburků'], [1620, 'bitva na Bílé hoře'],
        [1781, 'zrušení nevolnictví'], [1918, 'vznik Československa'], [1948, 'komunistický převrat'], [1968, 'pražské jaro'], [1989, 'sametová revoluce']
    ];
    const anchorsFor = (item) => [...(item.cz === 1 ? CZECH_EVENTS.map(([year, text]) => [year, text, 1]) : []), ...WORLD_EVENTS];
    const timeline = (item, spans, points, extra = {}) => (spans.length || points.length)
        ? { type: 'timeline', spans, points, hide: item.n, anchors: anchorsFor(item), ...extra } : null;

    const styleSpan = (style) => style ? [{ kind: 'reign', from: style.f.from, to: Math.min(style.f.to, new Date().getFullYear()) }] : [];
    const visualOf = (item, ctx, mode) => {
        const f = item.f || {};
        if (item.c === 'stavby') {
            // U otázky na název slepá mapa, u otázky na sloh rok stavby na ose; po odpovědi stavba v období svého slohu
            if (mode === 'name') return item.la !== undefined ? { type: 'map', lat: item.la, lon: item.lo, span: 24, highlightIso: '', label: 'Stavba je uprostřed' } : null;
            if (mode === 'style') return f.y !== undefined ? timeline(item, [], [f.y]) : null;
            if (mode === 'architect') return null;
            const style = styleItem(f.st, ctx);
            return timeline(item, styleSpan(style), f.y !== undefined ? [f.y] : [], { spanLabel: style ? style.n.toLowerCase() : 'sloh' });
        }
        if (item.c === 'slohy') return timeline(item, styleSpan(item), [], { spanLabel: 'období' });
        if (f.born === undefined) return null;
        return timeline(item, [{ kind: 'life', from: f.born, to: f.died ?? Math.min(f.born + 90, new Date().getFullYear()) }], []);
    };

    const lifeRange = (f) => f.born === undefined ? '' : f.died === undefined ? `nar. ${formatYear(f.born)}` : `${formatYear(f.born)}–${formatYear(f.died)}`;
    // Další slavná stavba architekta (kromě té, na kterou se ptáme)
    const otherWorkOf = (architect, item, ctx) => {
        const works = famous(ctx, other => other.c === 'stavby' && other.q !== item.q && other.f.aq === architect.q, 2).map(other => other.n);
        return works.length ? works : architect.f.work && architect.f.work !== item.n ? [architect.f.work] : [];
    };

    const factsOf = (item, ctx, mode) => {
        const f = item.f || {};
        const countries = ctx.countries || {};
        if (item.c === 'stavby') {
            const facts = [];
            if (mode !== 'style' && styleName(f.st, ctx)) facts.push({ label: 'Sloh', value: styleName(f.st, ctx) });
            if (f.y !== undefined) facts.push({ label: 'Vznik', value: formatYear(f.y) });
            if (mode !== 'architect' && f.arch) facts.push({ label: f.arch.includes(',') ? 'Architekti' : 'Architekt', value: f.arch });
            const countryNames = getCountryNames(item, countries);
            if (countryNames.length) facts.push({ label: 'Země', value: countryNames.join(', ') });
            if (f.city) facts.push({ label: 'Město', value: f.city });
            return facts;
        }
        if (item.c === 'slohy') {
            const facts = [{ label: 'Období', value: f.per }];
            if (mode === 'result' || mode === 'card') {
                const buildings = famous(ctx, other => other.c === 'stavby' && other.f.st === f.key, 3).map(other => other.n);
                const architects = famous(ctx, other => other.c === 'architekti' && other.f.st === f.key, 3).map(other => other.n);
                if (f.ex) facts.push({ label: 'Na obrázku', value: f.ex });
                if (buildings.length) facts.push({ label: 'Slavné stavby', value: buildings.join(', ') });
                if (architects.length) facts.push({ label: 'Architekti', value: architects.join(', ') });
            }
            return facts;
        }
        return [
            ...formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear], ['land', 'Země', v => v]], ['born', 'died']),
            ...(styleName(f.st, ctx) ? [{ label: 'Sloh', value: styleName(f.st, ctx) }] : []),
            ...formatFacts(item, [['work', 'Slavná stavba', v => v]])
        ];
    };

    // --- Zvláštní otázky u staveb ---
    const canAskStyle = (item, ctx) => item.c === 'stavby' && Boolean(styleItem(item.f.st, ctx)) && !revealsStyle(item.n, item.f.st);
    const canAskArchitect = (item, ctx) => {
        const architect = architectOf(item, ctx);
        // Ne když název architekta prozradí (Kotěrova vila, Gaudího palác)
        return Boolean(architect) && !censorName(item.n, [architect.n, ...architectAliases(architect, ctx)].join(', ')).includes('[***]');
    };
    const styleQuestion = (item, ctx, rng) => {
        const answer = styleItem(item.f.st, ctx);
        // Nesprávné slohy: z blízké doby (ke gotice románský sloh, renesance), ne sporné dvojice; přednostně známé
        const mid = (style) => (style.f.from + style.f.to) / 2;
        const secondary = item.f.no || [];
        const candidates = ctx.items.filter(other => other.c === 'slohy' && !isConflict(other.f.key, answer.f.key) && !secondary.includes(other.f.key));
        const score = (other) => -Math.round(Math.abs(mid(other) - mid(answer)) / 120) + (other.k === 1 ? 1 : 0);
        // Ani nesprávné možnosti mezi sebou nejsou sporná dvojice (klasicismus a empír by vedle sebe jen mátly)
        const wrong = [];
        for (const other of rankBySimilarity(candidates, score, rng)) {
            if (wrong.length < 3 && !wrong.some(picked => isConflict(picked.f.key, other.f.key))) wrong.push(other);
        }
        return {
            type: 'style',
            title: 'Jaký je to sloh?',
            showName: true,
            choices: shuffle([answer, ...wrong], rng).map(style => ({ id: style.q, label: style.n, correct: style.q === answer.q })),
            accepted: styleAnswers(answer),
            placeholder: 'Napiš sloh, třeba gotika',
            answerLabel: answer.n
        };
    };
    const architectQuestion = (item, ctx, rng) => {
        const answer = architectOf(item, ctx);
        const g = answer.f;
        // Nesprávní architekti: stejné doby a pohlaví, stejného slohu a země
        const candidates = ctx.items.filter(other => other.c === 'architekti' && other.q !== answer.q);
        const score = (other) => personSimilarity(answer, other) + (g.st && other.f.st === g.st ? 2 : 0) + (g.land && other.f.land === g.land ? 1 : 0)
            + (other.k === answer.k ? 1 : 0);
        const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, new Set([normalizeAnswer(answer.n)]), other => other.n);
        return {
            type: 'architect',
            title: 'Kdo ji navrhl?',
            showName: true,
            choices: shuffle([answer, ...wrong], rng).map(other => ({ id: other.q, label: other.n, correct: other.q === answer.q })),
            accepted: nameAnswers(answer, architectAliases(answer, ctx)),
            placeholder: 'Napiš jméno architekta…',
            answerLabel: answer.n
        };
    };

    // Nápovědy podle druhu otázky (od nejméně po nejvíc prozrazující)
    const hintsOf = (item, ctx, type) => {
        const f = item.f || {};
        const countries = ctx.countries || {};
        const place = [
            ...(getCountryNames(item, countries).length ? [{ label: 'Země', value: getCountryNames(item, countries).join(', ') }] : []),
            ...(f.city ? [{ label: 'Město', value: f.city }] : [])
        ];
        if (item.c === 'stavby' && type === 'style') {
            // Kde stavba stojí, kdo ji navrhl, kdy vznikla (doba sloh skoro prozradí) a nakonec slavné stavby stejného slohu
            // U české stavby přednostně české (k Obecnímu domu Hlavní nádraží, ne Casa Milà)
            const alike = famous(ctx, other => other.c === 'stavby' && other.q !== item.q && other.f.st === f.st && other.k === 1, 30)
                .sort((a, b) => ((b.cz === 1) === (item.cz === 1)) - ((a.cz === 1) === (item.cz === 1))).slice(0, 2).map(other => other.n);
            return [
                { kind: 'facts', label: 'místo', icon: 'map-pin', facts: place },
                { kind: 'facts', label: 'architekt', icon: 'pen-tool', facts: f.arch ? [{ label: f.arch.includes(',') ? 'Architekti' : 'Architekt', value: f.arch }] : [] },
                { kind: 'visual', spec: visualOf(item, ctx, 'style') },
                { kind: 'facts', label: 'stejný sloh', icon: 'church', facts: alike.length ? [{ label: 'Ve stejném slohu', value: alike.join(', ') }] : [] }
            ];
        }
        if (item.c === 'stavby' && type === 'architect') {
            const architect = architectOf(item, ctx);
            const other = architect ? otherWorkOf(architect, item, ctx) : [];
            return [
                { kind: 'facts', label: 'sloh a doba', icon: 'columns-3', facts: [
                    ...(styleName(f.st, ctx) ? [{ label: 'Sloh', value: styleName(f.st, ctx) }] : []),
                    ...(f.y !== undefined ? [{ label: 'Vznik', value: formatYear(f.y) }] : [])
                ] },
                { kind: 'facts', label: 'architekt', icon: 'user', facts: architect ? [
                    ...(architect.f.land ? [{ label: 'Země architekta', value: architect.f.land }] : []),
                    ...(lifeRange(architect.f) ? [{ label: architect.sx === 'f' ? 'Žila' : 'Žil', value: lifeRange(architect.f) }] : [])
                ] : [] },
                { kind: 'facts', label: 'další stavba', icon: 'church', facts: other.length ? [{ label: architect.sx === 'f' ? 'Navrhla také' : 'Navrhl také', value: other.join(', ') }] : [] }
            ];
        }
        if (item.c === 'stavby') {
            // Sloh a doba (sloh mají nesprávné možnosti často stejný – takový fakt aplikace vynechá), slepá mapa, místo a autor
            return [
                { kind: 'facts', facts: factsOf(item, ctx, type).filter(fact => fact.label === 'Sloh' || fact.label === 'Vznik') },
                { kind: 'visual', spec: visualOf(item, ctx, 'name') },
                { kind: 'facts', label: 'místo', icon: 'map-pin', facts: place },
                { kind: 'facts', label: 'architekt', icon: 'pen-tool', facts: f.arch ? [{ label: f.arch.includes(',') ? 'Architekti' : 'Architekt', value: f.arch }] : [] }
            ];
        }
        if (item.c === 'slohy') {
            // Architekti slohu, slavné stavby, nakonec období na časové ose
            const architects = famous(ctx, other => other.c === 'architekti' && other.f.st === f.key, 3).map(other => other.n);
            const buildings = famous(ctx, other => other.c === 'stavby' && other.f.st === f.key && other.n !== f.ex, 3).map(other => other.n);
            return [
                { kind: 'facts', label: 'architekti', icon: 'pen-tool', facts: architects.length ? [{ label: 'Architekti', value: architects.join(', ') }] : [] },
                { kind: 'facts', label: 'slavné stavby', icon: 'church', facts: buildings.length ? [{ label: 'Slavné stavby', value: buildings.join(', ') }] : [] },
                { kind: 'visual', spec: visualOf(item, ctx, type) }
            ];
        }
        return null;
    };

    const subtitle = (item, ctx) => {
        const f = item.f || {};
        if (item.c === 'stavby') {
            return [styleName(f.st, ctx), f.y !== undefined ? formatYear(f.y) : '', f.city || getCountryNames(item, ctx.countries || {})[0]].filter(Boolean).join(' · ');
        }
        if (item.c === 'slohy') return f.per || '';
        return [lifeRange(f), f.land].filter(Boolean).join(' · ') || item.ty || '';
    };

    return {
        id: 'architektura',
        title: 'Architektura',
        icon: 'landmark',
        emoji: '🏛️',
        color: 'stone',
        dataFile: 'data/architektura.json',
        subtitleIcon: 'columns-3',
        words: {
            question: 'Co je to?',
            one: 'stavba',
            next: 'Další otázka',
            atlas: 'Atlas architektury',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavné stavby, hlavní slohy a architekti',
            czechBadge: 'Česká stopa'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: stavby stejného slohu, druhu a země (k Notre-Dame gotické katedrály), slohy z blízké doby
        // (nikdy sporná dvojice), architekti stejné doby, slohu a země
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            if (item.c === 'stavby') {
                return (f.st === g.st ? 3 : isConflict(f.st, g.st) ? -2 : 0) + eraNearness(f.y, g.y)
                    + ((item.co || []).some(country => (other.co || []).includes(country)) ? 1 : 0) + ((item.cz === 1) === (other.cz === 1) ? 1 : 0);
            }
            if (item.c === 'slohy') {
                if (isConflict(f.key, g.key)) return -Infinity;
                return -Math.round(Math.abs((f.from + f.to) / 2 - (g.from + g.to) / 2) / 120);
            }
            return personSimilarity(item, other) + (f.st && f.st === g.st ? 2 : 0) + (f.land && f.land === g.land ? 1 : 0)
                + ((item.cz === 1) === (other.cz === 1) ? 1 : 0);
        },
        nameAliases: (item, ctx) => {
            if (item.c === 'slohy') return (STYLE_INFO[item.f.key] || {}).aliases || [];
            if (item.c === 'architekti') return architectAliases(item, ctx);
            return [];
        },

        // U stavby „Jaký je to sloh?“ (fotka v otázce), u stavby se slavným autorem i „Kdo ji navrhl?“
        specialQuestion: (item, ctx, rng) => {
            if (item.c !== 'stavby') return null;
            const roll = rng();
            if (roll < ARCHITECT_QUIZ_SHARE && canAskArchitect(item, ctx)) return architectQuestion(item, ctx, rng);
            if (roll < STYLE_QUIZ_SHARE && canAskStyle(item, ctx)) return styleQuestion(item, ctx, rng);
            return null;
        },
        // Obrázek, na který se otázka ptá: stavba, u slohu jeho ukázka
        questionImage: (item) => {
            if (!item.im || !item.ih) return null;
            if (item.c === 'stavby') return { file: item.im, hash: item.ih, label: 'Stavba', icon: 'church' };
            if (item.c === 'slohy') return { file: item.im, hash: item.ih, label: 'Ukázka', icon: 'columns-3' };
            return null;
        },
        censor: (type, text, item, ctx) => {
            if (type === 'style') return hideStyle(text, item.f.st);
            if (type === 'architect') {
                const architect = architectOf(item, ctx);
                return architect ? censorName(text, [architect.n, ...architectAliases(architect, ctx)].join(', ')) : null;
            }
            if (type === 'name' && item.c === 'slohy') return hideStyle(censorName(text, styleAnswers(item).join(', ')), item.f.key);
            return null;
        },
        findAnswer: (type, answer, item, ctx) => {
            const category = type === 'style' ? 'slohy' : type === 'architect' ? 'architekti' : null;
            if (!category) return null;
            const found = ctx.items.find(other => other.c === category
                && isAnswerMatch(answer, category === 'slohy' ? styleAnswers(other) : nameAnswers(other, architectAliases(other, ctx))));
            return found ? { topic: 'architektura', id: found.q } : null;
        },
        hints: hintsOf,
        visual: visualOf,
        facts: factsOf,
        subtitle,
        coords: (item) => item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1
    };
});
