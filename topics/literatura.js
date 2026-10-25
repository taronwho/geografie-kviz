// Téma Literatura: spisovatelé a básníci, literární díla a postavy (data/literatura.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatYear, formatFacts, shuffle, eraNearness, personSimilarity, censorName, normalizeAnswer, rankBySimilarity, takeDistinct,
        isRealPhoto, nameAnswers, buildTimeline, isAnswerMatch, centuryOf, centuryLabel
    } = core;

    const CATEGORIES = [
        { key: 'spisovatele', label: 'Spisovatelé a básníci', one: 'spisovatel', icon: 'feather', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } },
        { key: 'dila', label: 'Literární díla', one: 'dílo', icon: 'book', question: 'Které dílo to je?', placeholder: 'Napiš název díla…', ask: 'Co je', sort: { by: 'y' } },
        { key: 'postavy', label: 'Literární postavy', one: 'postava', icon: 'drama', question: 'Která postava to je?', placeholder: 'Napiš jméno postavy…', ask: 'Kdo je', sort: { by: 'name' } }
    ];

    // Jak často se u díla a postavy ptáme na autora a u spisovatele či díla na století
    const AUTHOR_QUIZ_SHARE = 0.4;
    const CENTURY_QUIZ_SHARE = 0.25;
    const THIS_YEAR = new Date().getFullYear();

    // Díla s obecným názvem (Básně, Povídky, Deník) napsalo víc autorů – na autora se u nich neptáme
    const GENERIC_TITLE = /^(básně|povídky|písně|sonety|deník|paměti|dopisy|eseje|pohádky|bajky|balady|elegie|ódy)$/iu;

    // --- Pomocníci nad daty ---
    const indexes = new WeakMap();
    const indexOf = (ctx) => {
        if (!indexes.has(ctx.items)) {
            const byId = new Map(ctx.items.map(item => [item.q, item]));
            const worksBy = new Map();
            const surnames = new Map();
            for (const item of ctx.items) {
                if (item.c === 'dila' && item.f && item.f.byq) worksBy.set(item.f.byq, [...(worksBy.get(item.f.byq) || []), item]);
                const surname = item.c === 'spisovatele' ? surnameOf(item.n) : null;
                if (surname) surnames.set(normalizeAnswer(surname), [...(surnames.get(normalizeAnswer(surname)) || []), item]);
            }
            indexes.set(ctx.items, { byId, worksBy, surnames, fame: new Map(ctx.items.map((item, index) => [item.q, index])) });
        }
        return indexes.get(ctx.items);
    };
    const authorOf = (item, ctx) => item.c !== 'spisovatele' && item.f && item.f.byq ? indexOf(ctx).byId.get(item.f.byq) || null : null;

    // Příjmení slavného (Čapek, Shakespeare) – bez přípon „mladší“ a římských číslic
    const NAME_SUFFIX = /^(mladší|starší|ml\.|st\.|jr\.|sr\.|[IVX]+\.?)$/iu;
    const surnameOf = (name) => {
        const words = name.split(' ').filter(word => !NAME_SUFFIX.test(word));
        const last = words[words.length - 1] || '';
        return words.length >= 2 && last.length >= 4 && /^\p{Lu}/u.test(last) ? last : null;
    };
    // Psaná odpověď: u spisovatelů příjmení, které v tématu nemá nikdo jiný (u Dumasů jen ten nejznámější), u děl a postav kratší názvy
    const nameAliases = (item, ctx) => {
        const aliases = [...(item.al || [])];
        if (item.c === 'spisovatele' && ctx && ctx.items) {
            const surname = surnameOf(item.n);
            const namesakes = surname ? indexOf(ctx).surnames.get(normalizeAnswer(surname)) || [] : [];
            const others = namesakes.filter(other => other.q !== item.q);
            if (surname && (others.length === 0 || (item.k === 1 && others.every(other => other.k === 0) && namesakes[0] === item))) aliases.push(surname);
        }
        return aliases.filter(alias => normalizeAnswer(alias) !== normalizeAnswer(item.n));
    };

    // Latinské tvary (Vergilius → „Vergilia“, Maro → „Marona“) jádro neskloňuje a krátká slova (Li Po, Tu Fu) nezakryje – celé jméno se zakryje doslova
    const latinForms = (name) => name.split(/\s+/).flatMap(word => /^\p{Lu}\p{L}{3,}(us|os)$/u.test(word) ? [word.slice(0, -2)]
        : /^\p{Lu}\p{L}{2,}o$/u.test(word) ? [`${word}n`] : []);
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const censorPerson = (text, person, ctx) => {
        const censored = censorName(text, [person.n, core.displayName(person.t || ''), ...nameAliases(person, ctx), ...latinForms(person.n)].join(', '));
        return core.mergeCensored(censored.replace(new RegExp(escapeRegExp(person.n), 'giu'), '[***]'));
    };

    const lifeRange = (f) => f.born === undefined ? '' : f.died !== undefined ? `${formatYear(f.born)}–${formatYear(f.died)}` : `nar. ${formatYear(f.born)}`;

    // --- Fakta ---
    // mode: druh otázky ('name', 'author', 'century'), 'result' nebo 'card'
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        const withYears = mode !== 'century';
        if (item.c === 'spisovatele') {
            const facts = [];
            if (answered && f.born !== undefined) facts.push({ label: 'Život', value: lifeRange(f) });
            if (answered && f.born !== undefined) facts.push({ label: 'Století', value: centuryRange(f.born, f.died) });
            facts.push(...formatFacts(item, [['land', 'Země', v => v], ['lang', 'Jazyk', v => v], ['genre', 'Žánr', v => v], ['mov', 'Směr', v => v]]));
            if (f.nobel) facts.push({ label: 'Nobelova cena', value: f.nobel === 1 ? 'za literaturu' : `za literaturu (${f.nobel})` });
            if (answered) facts.push(...formatFacts(item, [['work', 'Slavné dílo', v => v]]));
            return facts;
        }
        if (item.c === 'dila') {
            const facts = [];
            if (f.year !== undefined && withYears && mode !== 'author') facts.push({ label: 'Vznik', value: formatYear(f.year) });
            if (answered && f.year !== undefined) facts.push({ label: 'Století', value: centuryLabel(centuryOf(f.year)) });
            facts.push(...formatFacts(item, [['genre', 'Žánr', v => v], ['lang', 'Jazyk', v => v]]));
            // Autor, jehož jméno je v názvu (Ezop – Ezopovy bajky), by u otázky na název prozradil odpověď
            if (mode !== 'author' && (answered || !(f.by && core.isFactVisible(f.by, item.n)))) facts.push(...formatFacts(item, [['by', 'Autor', v => v]]));
            if (answered) facts.push(...formatFacts(item, [['chars', 'Postavy', v => v]]));
            return facts;
        }
        const facts = formatFacts(item, [['land', 'Země', v => v]]);
        if (mode !== 'author') facts.push(...formatFacts(item, [['by', 'Autor', v => v]]));
        if (answered) facts.push(...formatFacts(item, [['work', 'Dílo', v => v]]));
        return facts;
    };
    const centuryRange = (from, to) => {
        const first = centuryOf(from);
        const last = to === undefined ? first : centuryOf(to);
        if (first === last) return centuryLabel(first);
        if (first > 0) return `${first}.–${last}. století`;
        return last < 0 ? `${-first}.–${-last}. století př. n. l.` : `${centuryLabel(first)} – ${centuryLabel(last)}`;
    };

    // --- Časová osa s literárními milníky (blízkost 1), českými (2 u českých položek) a světovými událostmi ---
    const LITERARY_EVENTS = [
        [-700, 'Homérovy eposy'], [1321, 'Dantova Božská komedie'], [1450, 'Gutenbergův knihtisk'], [1605, 'Cervantesův Don Quijote'],
        [1774, 'Goethův Werther'], [1836, 'Máchův Máj'], [1855, 'Babička Boženy Němcové'], [1869, 'Tolstého Vojna a mír'],
        [1901, 'první Nobelova cena za literaturu'], [1915, 'Kafkova Proměna'], [1920, 'Čapkova R.U.R.'], [1921, 'Haškův Švejk'],
        [1949, 'Orwellův román 1984'], [1954, 'Tolkienův Pán prstenů'], [1997, 'první kniha o Harrym Potterovi']
    ];
    const CZECH_EVENTS = [[1348, 'založení Karlovy univerzity'], [1415, 'upálení Jana Husa'], [1620, 'bitva na Bílé hoře'], [1781, 'zrušení nevolnictví'],
        [1918, 'vznik Československa'], [1948, 'komunistický převrat'], [1968, 'pražské jaro'], [1989, 'sametová revoluce']];
    const WORLD_EVENTS = [[-44, 'zavraždění Caesara'], [476, 'pád Západořímské říše'], [1492, 'objevení Ameriky'], [1618, 'začátek třicetileté války'],
        [1789, 'Velká francouzská revoluce'], [1848, 'revoluce v Evropě'], [1914, 'začátek 1. světové války'], [1939, 'začátek 2. světové války'],
        [1945, 'konec 2. světové války'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi'], [2001, 'útoky 11. září']];
    const anchorsFor = (item) => [
        ...LITERARY_EVENTS.map(([year, text]) => [year, text, 1]),
        ...CZECH_EVENTS.map(([year, text]) => [year, text, item.cz === 1 ? 2 : 0]),
        ...WORLD_EVENTS.map(([year, text]) => [year, text, 0])
    ];
    const timelineOf = (item) => {
        const f = item.f || {};
        // Událost by neměla prozradit jméno, název ani autora
        const hide = [item.n, f.by, f.work].filter(Boolean).join(', ');
        const base = { type: 'timeline', points: [], hide, anchors: anchorsFor(item) };
        if (item.c === 'spisovatele') return f.born === undefined ? null : { ...base, spans: [{ kind: 'life', from: f.born, to: f.died ?? THIS_YEAR }] };
        return f.year === undefined ? null : { ...base, spans: [], points: [f.year] };
    };
    // Osa bez letopočtů (u otázky na století) jen tehdy, když na ní jsou aspoň dvě známé události
    const blindTimelineOf = (item) => {
        const spec = timelineOf(item);
        if (!spec) return null;
        const blind = { ...spec, blind: true, name: 'osa bez letopočtů', icon: 'calendar-range' };
        return buildTimeline(blind, 340).anchors.length >= 2 ? blind : null;
    };

    // --- Otázka na století: u spisovatele narození (celý život, když je v jednom století), u díla vydání ---
    // Rok narození u starověkých autorů bývá jen odhad (−800, 500) – na takový se neptáme
    const isEstimate = (year) => year < 1500 && year % 50 === 0;
    const centuryEvent = (item) => {
        const f = item.f || {};
        const ending = item.sx === 'f' ? 'a' : '';
        if (item.c === 'spisovatele' && f.born !== undefined && !isEstimate(f.born) && !(f.died !== undefined && f.died <= f.born)) {
            if (f.died !== undefined && !isEstimate(f.died) && centuryOf(f.born) === centuryOf(f.died) && f.died % 100 !== 0) {
                return { year: f.born, title: `Ve kterém století žil${ending}?` };
            }
            return { year: f.born, title: `Ve kterém století se narodil${ending}?` };
        }
        if (item.c === 'dila' && f.year !== undefined && !isEstimate(f.year)) return { year: f.year, title: 'Ve kterém století dílo vzniklo?' };
        return null;
    };
    const centuryQuestion = (item, rng) => {
        const event = centuryEvent(item);
        // Rok 1900 patří do 19. století, většina lidí by ale řekla 20. – takovou otázku vynecháme; stejně tak letopočet v názvu (1984)
        if (!event || event.year % 100 === 0 || event.year > THIS_YEAR || /\d{3,4}/.test(item.n)) return null;
        const century = centuryOf(event.year);
        const shift = (offset) => {
            let result = century + offset;
            if (century < 0 && result >= 0) result += 1;
            if (century > 0 && result <= 0) result -= 1;
            return result;
        };
        // Nesprávná století co nejblíž: obě sousední, pak o dvě dál (budoucí ne)
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
            placeholder: 'Napiš století, třeba 19',
            answerLabel: centuryLabel(century)
        };
    };
    // Současníci: známí spisovatelé, kteří tehdy žili (nejdřív ze stejné země), u díla jiná známá díla z doby kolem vydání
    const contemporariesOf = (item, ctx, year) => {
        const f = item.f || {};
        const { fame } = indexOf(ctx);
        const near = (list, score) => list.filter(other => other.q !== item.q && other.k === 1 && !/\d/.test(other.n) && other.q !== f.byq)
            .sort((a, b) => score(b) - score(a) || fame.get(a.q) - fame.get(b.q)).slice(0, 3).map(other => other.n);
        if (item.c === 'spisovatele') {
            return near(ctx.items.filter(other => other.c === 'spisovatele' && other.f.born <= year && year <= (other.f.died ?? THIS_YEAR)),
                other => (other.f.land === f.land ? 1 : 0));
        }
        return near(ctx.items.filter(other => other.c === 'dila' && other.f.year !== undefined && Math.abs(other.f.year - year) <= 15 && other.f.byq !== f.byq),
            other => (other.f.lang === f.lang ? 1 : 0));
    };

    // --- Otázka na autora (dílo, postava) ---
    const otherWorksOf = (item, ctx) => (indexOf(ctx).worksBy.get(item.f.byq) || []).filter(other => other.q !== item.q && other.n !== item.f.work).slice(0, 2).map(other => other.n);
    const portraitOf = (author) => author && author.im && author.ih && isRealPhoto(author.im)
        ? { type: 'image', file: author.im, hash: author.ih, name: 'portrét autora', icon: 'user' } : null;
    const authorSimilarity = (author, other) => {
        const f = author.f || {};
        const g = other.f || {};
        let score = (author.k === other.k ? 3 : 0) + personSimilarity(author, other);
        if (f.land && f.land === g.land) score += 2;
        if (f.lang && f.lang === g.lang) score += 2;
        if (f.genre && f.genre === g.genre) score += 1;
        return score;
    };
    const authorQuestion = (item, ctx, rng) => {
        const author = authorOf(item, ctx);
        if (!author || GENERIC_TITLE.test(item.n)) return null;
        const excluded = new Set([author.q, ...(item.xa || [])]);
        // Autor, jehož jméno je v názvu (Hamlet × Shakespeare ne, ale „Deník Anne Frankové“ ano), by byl nápadný
        const candidates = ctx.items.filter(other => other.c === 'spisovatele' && !excluded.has(other.q) && !censorName(item.n, other.n).includes('[***]'));
        const wrong = takeDistinct(rankBySimilarity(candidates, other => authorSimilarity(author, other), rng), 3, new Set([normalizeAnswer(author.n)]), other => other.n);
        if (wrong.length < 3 || censorName(item.n, author.n).includes('[***]')) return null;
        return {
            type: 'author',
            title: item.c === 'postavy' ? 'Kdo tuto postavu vymyslel?' : 'Kdo to napsal?',
            showName: true,
            choices: shuffle([author, ...wrong], rng).map(other => ({ id: other.q, label: other.n, correct: other.q === author.q })),
            accepted: nameAnswers(author, nameAliases(author, ctx)),
            placeholder: 'Napiš jméno autora…',
            answerLabel: author.n
        };
    };

    // Roky a století z textu u otázky na století zmizí
    const hideYears = (text) => text.replace(/(?<![\p{L}\d])\d{1,4}(?!\d)(\.\s*(?:století|stol\.))?/gu, '[***]');

    // --- Nápovědy podle druhu otázky ---
    const factsStep = (facts, label, icon) => ({ kind: 'facts', label, icon, facts });
    const hintsOf = (item, ctx, type) => {
        const f = item.f || {};
        if (type === 'author') {
            const author = authorOf(item, ctx);
            if (item.c === 'postavy') {
                return [
                    factsStep(formatFacts(item, [['land', 'Země', v => v]]), 'původ', 'map-pin'),
                    factsStep(f.work ? [{ label: 'Dílo', value: f.work }] : [], 'dílo', 'book'),
                    { kind: 'visual', spec: portraitOf(author) }
                ];
            }
            const works = otherWorksOf(item, ctx);
            const origin = [
                ...(f.year !== undefined ? [{ label: 'Vznik', value: formatYear(f.year) }] : []),
                ...formatFacts(item, [['genre', 'Žánr', v => v], ['lang', 'Jazyk', v => v]])
            ];
            return [
                factsStep(origin, 'vznik díla', 'calendar'),
                factsStep(works.length ? [{ label: 'Další díla autora', value: works.join(', ') }] : [], 'další díla', 'library'),
                { kind: 'visual', spec: portraitOf(author) }
            ];
        }
        if (type === 'century') {
            const event = centuryEvent(item);
            const contemporaries = event ? contemporariesOf(item, ctx, event.year) : [];
            if (item.c === 'spisovatele') {
                return [
                    factsStep(contemporaries.length ? [{ label: 'Tehdy žili', value: contemporaries.join(', ') }] : [], 'současníci', 'users'),
                    factsStep(f.work ? [{ label: 'Slavné dílo', value: f.work }] : [], 'slavné dílo', 'book'),
                    { kind: 'visual', spec: blindTimelineOf(item) }
                ];
            }
            return [
                factsStep(f.by ? [{ label: 'Autor', value: f.by }] : [], 'autor', 'feather'),
                factsStep(contemporaries.length ? [{ label: 'Ve stejné době vyšlo', value: contemporaries.join(', ') }] : [], 'současná díla', 'library'),
                { kind: 'visual', spec: blindTimelineOf(item) }
            ];
        }
        // Otázka na název: od obecného (země, žánr) přes časovou osu a fotku po slavné dílo, u díla postavy
        if (item.c === 'spisovatele') {
            return [
                { kind: 'facts', facts: factsOf(item, type) },
                { kind: 'visual', spec: timelineOf(item) },
                { kind: 'photo' },
                factsStep(f.work ? [{ label: 'Slavné dílo', value: f.work }] : [], 'slavné dílo', 'book')
            ];
        }
        if (item.c === 'dila') {
            return [
                { kind: 'facts', facts: factsOf(item, type) },
                factsStep(f.chars ? [{ label: 'Postavy', value: f.chars }] : [], 'postavy', 'drama')
            ];
        }
        return [
            { kind: 'facts', facts: factsOf(item, type) },
            { kind: 'photo' },
            factsStep(f.work ? [{ label: 'Dílo', value: f.work }] : [], 'dílo', 'book')
        ];
    };

    const categoryOne = (item) => (CATEGORIES.find(category => category.key === item.c) || {}).one || '';
    const subtitle = (item) => {
        const f = item.f || {};
        if (item.c === 'spisovatele') return [lifeRange(f), f.land].filter(Boolean).join(' · ') || categoryOne(item);
        if (item.c === 'dila') return [f.by, f.year !== undefined ? formatYear(f.year) : ''].filter(Boolean).join(' · ') || categoryOne(item);
        return [f.work, f.by].filter(Boolean).join(' · ') || categoryOne(item);
    };

    return {
        id: 'literatura',
        title: 'Literatura',
        icon: 'book-open',
        emoji: '📚',
        color: 'teal',
        dataFile: 'data/literatura.json',
        subtitleIcon: 'feather',
        words: {
            question: 'Kdo nebo co to je?',
            one: 'spisovatel',
            next: 'Další otázka',
            atlas: 'Atlas literatury',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavní spisovatelé, knihy a postavy'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: stejné pohlaví a doba, stejná země a jazyk, žánr; u díla díla téhož autora, u postavy postavy z téhož díla
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            let score = item.c === 'dila' ? eraNearness(f.y, g.y) : personSimilarity(item, other);
            if (f.land && f.land === g.land) score += 2;
            if (f.lang && f.lang === g.lang) score += 2;
            if (f.genre && f.genre === g.genre) score += 2;
            if (item.c !== 'spisovatele' && f.byq && f.byq === g.byq) score += 4;
            if (item.c === 'postavy' && f.work && f.work === g.work) score += 2;
            if (item.cz === 1 && other.cz === 1) score += 1;
            return score;
        },
        nameAliases,

        // U díla a postavy občas „Kdo to napsal?“, u spisovatele a díla „Ve kterém století…?“
        specialQuestion: (item, ctx, rng) => {
            const roll = rng();
            if (item.c !== 'spisovatele' && roll < AUTHOR_QUIZ_SHARE) return authorQuestion(item, ctx, rng);
            if (item.c !== 'postavy' && roll >= 1 - CENTURY_QUIZ_SHARE) return centuryQuestion(item, rng);
            return null;
        },
        // U otázky na autora zmizí z popisu autor, u otázky na století letopočty; jméno či název zůstane
        censor: (type, text, item, ctx) => {
            if (type === 'author') {
                const author = authorOf(item, ctx);
                return author ? censorPerson(text, author, ctx) : text;
            }
            if (type === 'name' && item.c !== 'dila') return censorPerson(text, item, ctx);
            if (type === 'century') return hideYears(core.stripBrackets(text).replace(/\s{2,}/g, ' '));
            return null;
        },
        // Kterého jiného spisovatele hráč napsal u otázky na autora
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'author') return null;
            const author = authorOf(item, ctx);
            const match = author && ctx.items.find(other => other.c === 'spisovatele' && other.q !== author.q && isAnswerMatch(answer, nameAnswers(other, nameAliases(other, ctx))));
            return match ? { topic: 'literatura', id: match.q } : null;
        },
        hints: hintsOf,
        visual: (item) => timelineOf(item),
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle,
        isCzech: (item) => item.cz === 1
    };
});
