// Téma Výtvarné umění: obrazy, sochy, malíři a sochaři (data/umeni.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatYear, formatFacts, censorName, shuffle, normalizeAnswer, eraNearness, rankBySimilarity, takeDistinct, centuryLabel } = core;

    const CATEGORIES = [
        { key: 'obrazy', label: 'Obrazy', one: 'obraz', icon: 'frame', question: 'Co je to za obraz?', placeholder: 'Napiš název obrazu…', sort: { by: 'y' } },
        { key: 'sochy', label: 'Sochy', one: 'socha', icon: 'person-standing', question: 'Co je to za sochu?', placeholder: 'Napiš název sochy…', sort: { by: 'y' } },
        { key: 'umelci', label: 'Malíři a sochaři', one: 'umělec', icon: 'brush', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } }
    ];
    const isWork = (item) => item.c === 'obrazy' || item.c === 'sochy';

    // Jak často se u díla ptáme na autora a na umělecký směr (jinak na název)
    const AUTHOR_QUIZ_SHARE = 0.3;
    const STYLE_QUIZ_SHARE = 0.2;

    // Umělecké směry v časovém pořadí: na ty s accepted se dá ptát (od sousedních se jasně liší), ostatní jen pojmenujeme.
    // Psaná odpověď se u směru porovnává přesně (bez překlepů) – impresionismus a expresionismus se liší jen o dvě písmena.
    const STYLES = [
        { key: 'gotika', label: 'gotika', accepted: ['gotika', 'gotický', 'gotické', 'gotická'] },
        { key: 'renesance', label: 'renesance', accepted: ['renesance', 'renesanční'] },
        { key: 'baroko', label: 'baroko', accepted: ['baroko', 'barokní'] },
        { key: 'klasicismus', label: 'klasicismus', accepted: ['klasicismus', 'klasicistní', 'neoklasicismus'] },
        { key: 'romantismus', label: 'romantismus', accepted: ['romantismus', 'romantický', 'romantické'] },
        { key: 'realismus', label: 'realismus', accepted: ['realismus', 'realistický', 'realistické'] },
        { key: 'impresionismus', label: 'impresionismus', accepted: ['impresionismus', 'impresionistický', 'impresionistické'] },
        { key: 'secese', label: 'secese', accepted: ['secese', 'secesní', 'art nouveau'] },
        { key: 'expresionismus', label: 'expresionismus', accepted: ['expresionismus', 'expresionistický', 'expresionistické'] },
        { key: 'kubismus', label: 'kubismus', accepted: ['kubismus', 'kubistický', 'kubistické'] },
        { key: 'surrealismus', label: 'surrealismus', accepted: ['surrealismus', 'surrealistický', 'surrealistické'] },
        { key: 'popart', label: 'pop-art', accepted: ['pop-art', 'pop art', 'popart'] }
    ];
    const OTHER_STYLE_LABELS = {
        manyrismus: 'manýrismus', rokoko: 'rokoko', akademismus: 'akademismus', postimpresionismus: 'postimpresionismus', symbolismus: 'symbolismus',
        avantgarda: 'avantgarda', abstrakce: 'abstraktní umění'
    };
    const styleLabel = (key) => (STYLES.find(style => style.key === key) || {}).label || OTHER_STYLE_LABELS[key];
    // Slova všech směrů (i v jiném tvaru) – z popisu u otázky na směr zmizí, ať se nedá vybírat vylučováním
    const STYLE_WORDS = /(?<![\p{L}])(?:goti[kc]|renesan|barok|neoklasici|klasici|romanti|realis|surrealis|postimpresion|impresion|neoimpresion|seces|art nouveau|expresion|kubis|pop[- ]?art|manýris|rokok|symbolis|fauvis|futuris|dadais|abstrakt)\p{L}*/giu;

    const THIS_YEAR = new Date().getFullYear();
    // Renesanční mistři známí křestním jménem
    const FIRST_NAME_KNOWN = /^(Leonardo|Michelangelo|Rafael)\b/;
    const withoutDiacritics = (text) => text.normalize('NFD').replace(/\p{M}/gu, '');
    // Vznik díla: „kolem 1503“, „2. století př. n. l.“, u pravěku „kolem 29 000 př. n. l.“
    const yearText = (f) => {
        if (f.year !== undefined) return `${f.ya ? 'kolem ' : ''}${formatYear(f.year)}`;
        if (f.yc === undefined) return undefined;
        return f.yc <= -30 ? `kolem ${core.formatNumber(-f.yc * 100)} př. n. l.` : centuryLabel(f.yc);
    };
    // Evropský umělec k evropským – k Davidovi se nehodí Hokusai
    const EUROPE = new Set(['Česko', 'Slovensko', 'Československo', 'Itálie', 'Francie', 'Španělsko', 'Nizozemsko', 'Flandry', 'Belgie', 'Německo',
        'Rakousko', 'Švýcarsko', 'Spojené království', 'Anglie', 'Skotsko', 'Irsko', 'Rusko', 'Sovětský svaz', 'Ukrajina', 'Bělorusko', 'Polsko',
        'Maďarsko', 'Rumunsko', 'Bulharsko', 'Srbsko', 'Chorvatsko', 'Slovinsko', 'Řecko', 'Portugalsko', 'Norsko', 'Švédsko', 'Dánsko', 'Finsko',
        'Island', 'Litva', 'Lotyšsko', 'Estonsko']);
    const sameWorld = (a, b) => Boolean(a && b) && EUROPE.has(a) === EUROPE.has(b);
    // Umělci stejného pohlaví a co nejbližšího roku narození (k Davidu Černému současníci, ne Štursa)
    const artistSimilarity = (a, b) => {
        const distance = Math.abs(((a.f || {}).born ?? Infinity) - ((b.f || {}).born ?? -Infinity));
        return ((a.sx === 'f') !== (b.sx === 'f') ? -20 : 0) + Math.max(0, 6 - distance / 20);
    };
    const life = (f) => f.born === undefined ? undefined : f.died === undefined ? `nar. ${formatYear(f.born)}` : `${formatYear(f.born)}–${formatYear(f.died)}`;
    const movementsOf = (f) => (f.mov && f.mov.length ? [].concat(f.mov) : (f.mk || []).map(styleLabel).filter(Boolean)).slice(0, 2).join(', ');

    // --- Autor díla a jména umělců ---
    const authorOf = (item, ctx) => {
        const qid = item.f && item.f.bq;
        if (!qid || !ctx) return null;
        return (ctx.byId ? ctx.byId.get(qid) : (ctx.items || []).find(other => other.q === qid)) || null;
    };
    // Příjmení pro psanou odpověď (Picasso, van Gogh, da Vinci; Leonardo, Michelangelo, Rafael i křestním jménem),
    // jen když se s překlepem nedá splést s příjmením jiného umělce (Manet – Monet)
    const PARTICLES = new Set(['da', 'de', 'di', 'del', 'della', 'van', 'von', 'der', 'den', 'le', 'la', 'z', 'ze']);
    const surnameOf = (name) => {
        const words = name.replace(/\s+(mladší|starší)$/u, '').split(' ');
        if (words.length < 2) return null;
        const last = words[words.length - 1];
        const particle = words[words.length - 2];
        return PARTICLES.has(particle) && words.length >= 3 ? `${particle} ${last}` : last;
    };
    const aliasCache = new WeakMap();
    const safeSurnames = (items) => {
        if (!aliasCache.has(items)) {
            const surnames = items.filter(other => other.c === 'umelci').map(other => [other.q, surnameOf(other.n)]).filter(([, surname]) => surname);
            aliasCache.set(items, new Set(surnames.filter(([qid, surname]) => surname.length >= 3
                && !surnames.some(([other, name]) => other !== qid && core.isAnswerMatch(name, [surname]))).map(([qid]) => qid)));
        }
        return aliasCache.get(items);
    };
    const artistAliases = (item, ctx) => {
        const aliases = [];
        const surname = surnameOf(item.n);
        if (surname && safeSurnames((ctx && ctx.items) || [item]).has(item.q)) aliases.push(surname);
        const first = FIRST_NAME_KNOWN.exec(item.n);
        if (first && first[1] !== item.n) aliases.push(first[1]);
        return aliases;
    };

    // --- Fakta ---
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (isWork(item)) {
            const facts = [];
            if (mode !== 'author' && f.by) facts.push({ label: 'Autor', value: f.by });
            if (mode !== 'author' && f.land) facts.push({ label: 'Země', value: f.land });
            if (mode !== 'style' && f.mov) facts.push({ label: 'Směr', value: f.mov });
            // Rok ukazuje časová osa; mezi fakty jen po odpovědi a tam, kde osa není (známe jen století)
            if (answered || f.year === undefined) {
                const when = yearText(f);
                if (when) facts.push({ label: 'Vznik', value: when });
            }
            return [...facts, ...formatFacts(item, [['tech', item.c === 'sochy' ? 'Materiál' : 'Technika', v => v], ['coll', 'Sbírka', v => v]])];
        }
        const facts = answered ? formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear]], ['born', 'died']) : [];
        if (f.land) facts.push({ label: 'Země', value: f.land });
        const movements = movementsOf(f);
        if (movements) facts.push({ label: 'Směr', value: movements });
        if (f.works && f.works.length) facts.push({ label: f.works.length > 1 ? 'Slavná díla' : 'Slavné dílo', value: f.works.join(', ') });
        return facts;
    };

    // --- Časová osa s milníky dějin umění ---
    // [rok, událost, blízkost (umělecké 1, světové 0), směr, který událost prozradí]
    const ART_EVENTS = [
        [-447, 'stavba Parthenónu', 1], [476, 'pád Západořímské říše', 0], [800, 'korunovace Karla Velikého', 0],
        [1163, 'začátek stavby Notre-Dame', 1], [1347, 'morová epidemie v Evropě', 0], [1450, 'Gutenbergův knihtisk', 0],
        [1453, 'pád Konstantinopole', 0], [1492, 'objevení Ameriky', 0], [1506, 'začátek stavby chrámu sv. Petra', 1],
        [1517, 'počátek reformace', 0], [1618, 'začátek třicetileté války', 0], [1648, 'konec třicetileté války', 0],
        [1682, 'Versailles sídlem krále', 1], [1776, 'nezávislost USA', 0], [1789, 'Velká francouzská revoluce', 0],
        [1815, 'bitva u Waterloo', 0], [1839, 'vynález fotografie', 1], [1848, 'revoluce v Evropě', 0],
        [1863, 'Salon odmítnutých v Paříži', 1], [1874, 'první výstava impresionistů', 1, 'impresionismus'], [1889, 'stavba Eiffelovy věže', 1],
        [1895, 'první filmové promítání', 1], [1907, 'počátky kubismu', 1, 'kubismus'], [1914, 'začátek 1. světové války', 0],
        [1919, 'založení Bauhausu', 1], [1924, 'manifest surrealismu', 1, 'surrealismus'], [1939, 'začátek 2. světové války', 0],
        [1945, 'konec 2. světové války', 0], [1969, 'přistání na Měsíci', 0], [1989, 'pád Berlínské zdi', 0], [2001, 'útoky 11. září', 0]
    ];
    const CZECH_EVENTS = [
        [1348, 'založení Karlovy univerzity'], [1357, 'začátek stavby Karlova mostu'], [1415, 'upálení Jana Husa'], [1583, 'Rudolf II. sídlí v Praze'],
        [1620, 'bitva na Bílé hoře'], [1781, 'zrušení nevolnictví'], [1796, 'založení pražské obrazárny'], [1881, 'otevření Národního divadla'],
        [1887, 'založení Spolku Mánes'], [1907, 'první výstava Osmy'], [1918, 'vznik Československa'], [1938, 'Mnichovská dohoda'],
        [1948, 'komunistický převrat'], [1968, 'pražské jaro'], [1989, 'sametová revoluce']
    ];
    // U českých položek mají přednost české události; u otázky na směr jen události, které směr nejmenují
    const anchorsFor = (item, withStyles = true) => {
        const own = item.cz === 1 ? CZECH_EVENTS.map(([year, text]) => [year, text, 2]) : [];
        const years = new Set(own.map(([year]) => year));
        return [...own, ...ART_EVENTS.filter(([year, , , style]) => !years.has(year) && (withStyles || !style))];
    };
    const timelineOf = (item, mode) => {
        const f = item.f || {};
        if (isWork(item)) {
            if (f.year === undefined || f.year < -3000) return null;
            return { type: 'timeline', spans: [], points: [f.year], hide: item.n, anchors: anchorsFor(item, mode !== 'style') };
        }
        if (f.born === undefined) return null;
        const to = f.died ?? Math.min(THIS_YEAR, f.born + 100);
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to }], points: [], hide: item.n, anchors: anchorsFor(item) };
    };

    // --- Zvláštní otázky ---
    const authorQuestion = (item, ctx, rng) => {
        const author = authorOf(item, ctx);
        if (!author || !ctx.items) return null;
        const a = author.f || {};
        // Nesprávní autoři: stejný obor (k obrazu malíři, k soše sochaři), pohlaví a doba, podobný směr a známost
        const sculptor = (other) => /sochař/u.test(other.ty || '');
        const wantSculptor = item.c === 'sochy';
        const shares = (other) => (a.mk || []).some(key => ((other.f || {}).mk || []).includes(key));
        const score = (other) => artistSimilarity(author, other) + (sculptor(other) === wantSculptor ? 3 : -2) + (shares(other) ? 2 : 0)
            + (sameWorld(a.land, (other.f || {}).land) ? 2 : 0) + (other.k === author.k ? 1 : 0) + ((other.cz === 1) === (author.cz === 1) ? 1 : 0);
        const candidates = ctx.items.filter(other => other.c === 'umelci' && other.q !== author.q);
        const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, new Set([normalizeAnswer(author.n)]), other => other.n);
        if (wrong.length < 3) return null;
        const verb = item.c === 'sochy' ? 'Kdo vytvořil tuto sochu?' : item.ty === 'kresba' ? 'Kdo to nakreslil?' : 'Kdo to namaloval?';
        return {
            type: 'author',
            title: verb,
            showName: true,
            choices: shuffle([author, ...wrong], rng).map(other => ({ id: other.q, label: other.n, correct: other.q === author.q })),
            accepted: [...new Set([author.n, author.t, ...artistAliases(author, ctx)].filter(Boolean))],
            placeholder: 'Napiš jméno autora…',
            answerLabel: author.n
        };
    };
    const styleQuestion = (item, ctx, rng) => {
        const index = STYLES.findIndex(style => style.key === (item.f || {}).st);
        if (index < 0) return null;
        // Autor, kterého řadí i k jinému směru z otázky (Manet k realismu i impresionismu), by dal dvě obhajitelné odpovědi
        const author = authorOf(item, ctx);
        if (author && ((author.f || {}).mk || []).some(key => key !== item.f.st && STYLES.some(style => style.key === key))) return null;
        // Nesprávné směry co nejblíž v čase: sousední, pak o dva a o tři dál
        const wrong = [...shuffle([-1, 1], rng), ...shuffle([-2, 2], rng), ...shuffle([-3, 3], rng)]
            .map(offset => STYLES[index + offset]).filter(Boolean).slice(0, 3);
        const style = STYLES[index];
        return {
            type: 'style',
            title: 'Ke kterému uměleckému směru patří?',
            showName: true,
            choices: shuffle([style, ...wrong], rng).map(other => ({ id: `smer-${other.key}`, label: other.label, correct: other.key === style.key })),
            // Přesně, ale i bez háčků a čárek
            accepted: [...new Set(style.accepted.flatMap(word => [word, withoutDiacritics(word)]))],
            match: 'symbol',
            placeholder: 'Napiš směr, třeba baroko',
            answerLabel: style.label
        };
    };

    return {
        id: 'umeni',
        title: 'Výtvarné umění',
        icon: 'palette',
        emoji: '🎨',
        color: 'orange',
        dataFile: 'data/umeni.json',
        subtitleIcon: 'palette',
        words: {
            question: 'Co je to?',
            one: 'dílo',
            next: 'Další otázka',
            atlas: 'Galerie umění',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavné obrazy, sochy a umělci'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: díla stejného autora a směru či doby, umělci stejného pohlaví, doby a směru; české k českým
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            const sameMovement = (f.mk || []).some(key => (g.mk || []).includes(key));
            const sameCzech = (item.cz === 1) === (other.cz === 1) ? 1 : 0;
            const land = (f.land && f.land === g.land ? 1 : 0) + (sameWorld(f.land, g.land) ? 1 : 0);
            if (item.c === 'umelci') return artistSimilarity(item, other) + (sameMovement ? 2 : 0) + land + sameCzech;
            return (f.by && f.by === g.by ? 4 : 0) + (sameMovement ? 3 : 0) + eraNearness(f.y, g.y) + land + sameCzech;
        },
        nameAliases: (item, ctx) => item.c === 'umelci' ? artistAliases(item, ctx) : [],

        // U díla občas „Kdo to namaloval?“ (jen u jistého autora z dat) nebo „Ke kterému směru patří?“ (jen u jasného směru)
        specialQuestion: (item, ctx, rng) => {
            if (!isWork(item)) return null;
            const roll = rng();
            if (roll < AUTHOR_QUIZ_SHARE) return authorQuestion(item, ctx, rng);
            if (roll < AUTHOR_QUIZ_SHARE + STYLE_QUIZ_SHARE) return styleQuestion(item, ctx, rng);
            return null;
        },
        // Obraz či socha je vidět hned v otázce – bez něj by otázka nedávala smysl
        questionImage: (item) => isWork(item) && item.im && item.ih
            ? { file: item.im, hash: item.ih, label: item.c === 'sochy' ? 'Socha' : 'Obraz', icon: item.c === 'sochy' ? 'person-standing' : 'frame' } : null,
        // Nápovědy u autora: kdy a kde dílo vzniklo → odkud autor byl a kdy žil → jeho další díla;
        // u směru: technika a sbírka → časová osa bez událostí, které by směr pojmenovaly → autor
        hints: (item, ctx, type) => {
            const f = item.f || {};
            if (type === 'author') {
                const author = authorOf(item, ctx) || { f: {} };
                const a = author.f || {};
                const others = (a.works || []).filter(name => normalizeAnswer(name) !== normalizeAnswer(item.n)).slice(0, 3);
                return [
                    { kind: 'facts', label: 'o díle', icon: item.c === 'sochy' ? 'person-standing' : 'frame', facts: [
                        yearText(f) ? { label: 'Vznik', value: yearText(f) } : null, f.mov ? { label: 'Směr', value: f.mov } : null,
                        f.coll ? { label: 'Sbírka', value: f.coll } : null].filter(Boolean) },
                    { kind: 'facts', label: 'o autorovi', icon: 'user', facts: [
                        a.land ? { label: 'Země', value: a.land } : null, life(a) ? { label: 'Život', value: life(a) } : null].filter(Boolean) },
                    { kind: 'facts', label: 'další díla', icon: 'brush', facts: others.length ? [{ label: 'Další díla', value: others.join(', ') }] : [] }
                ];
            }
            if (type === 'style') {
                return [
                    { kind: 'facts', label: 'technika a sbírka', icon: 'frame', facts: formatFacts(item, [['tech', item.c === 'sochy' ? 'Materiál' : 'Technika', v => v],
                        ['coll', 'Sbírka', v => v], ['land', 'Země', v => v]]) },
                    { kind: 'visual', spec: timelineOf(item, 'style') },
                    { kind: 'facts', label: 'autor', icon: 'user', facts: f.by ? [{ label: 'Autor', value: f.by }] : [] }
                ];
            }
            return null;
        },
        // Popis: u autora zmizí jméno autora, u směru všechny směry (i letopočty století nechá – nejsou odpovědí)
        censor: (type, text, item, ctx) => {
            if (type === 'author') {
                const author = authorOf(item, ctx);
                return author ? censorName(text, [author.n, author.t, ...artistAliases(author, ctx)].join(', ')) : null;
            }
            if (type === 'style') return core.stripBrackets(text).replace(/\s{2,}/g, ' ').replace(STYLE_WORDS, '[***]');
            return null;
        },
        // Napsaný jiný umělec u otázky na autora
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'author') return null;
            const other = ctx.items.find(candidate => candidate.c === 'umelci' && candidate.q !== (item.f || {}).bq
                && core.isAnswerMatch(answer, [candidate.n, ...artistAliases(candidate, ctx)]));
            return other ? { topic: 'umeni', id: other.q } : null;
        },

        visual: (item, ctx, mode) => mode === 'author' ? null : timelineOf(item, mode),
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            if (isWork(item)) return [f.by, yearText(f)].filter(Boolean).join(' · ') || (CATEGORIES.find(c => c.key === item.c) || {}).one;
            return [life(f), f.land].filter(Boolean).join(' · ') || item.ty || 'umělec';
        },
        isCzech: (item) => item.cz === 1
    };
});
