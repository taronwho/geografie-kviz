// Téma Literatura: spisovatelé a básníci, literární díla a postavy; divadelní hry, pohádky a dětská literatura, jazyky a písma, filozofové
// (data/literatura.json)
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
        { key: 'spisovatele', label: 'Spisovatelé a básníci', one: 'spisovatel', icon: 'feather', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } },
        { key: 'dila', label: 'Literární díla', one: 'dílo', icon: 'book', question: 'Které dílo to je?', placeholder: 'Napiš název díla…', sort: { by: 'y' } },
        { key: 'postavy', label: 'Literární postavy', one: 'postava', icon: 'drama', question: 'Která postava to je?', placeholder: 'Napiš jméno postavy…', sort: { by: 'name' } },
        { key: 'hry', label: 'Divadelní hry', one: 'hra', icon: 'theater', question: 'Která hra to je?', placeholder: 'Napiš název hry…', sort: { by: 'y' } },
        { key: 'pohadky', label: 'Pohádky a dětská literatura', one: 'pohádka', icon: 'castle', question: 'Která pohádka to je?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'jazyky', label: 'Jazyky a písma', one: 'jazyk', icon: 'languages', question: 'Který jazyk to je?', placeholder: 'Napiš název jazyka nebo písma…', sort: { by: 'name' } },
        { key: 'filozofove', label: 'Filozofové', one: 'filozof', icon: 'lightbulb', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } }
    ];
    // Kategorie rozšíření (vlastní otázky, nápovědy a podobnost možností) a kategorie osob (život, století, portrét)
    const EXTRA = new Set(['hry', 'pohadky', 'jazyky', 'filozofove']);
    const PEOPLE = new Set(['spisovatele', 'filozofove']);
    const isScript = (item) => item.c === 'jazyky' && Boolean((item.f || {}).script);

    // Jak často se u díla a postavy ptáme na autora, u spisovatele či díla na století a u postavy jednoho díla na dílo
    const AUTHOR_QUIZ_SHARE = 0.4;
    const CENTURY_QUIZ_SHARE = 0.25;
    const WORK_QUIZ_SHARE = 0.3;
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
            const worksByName = new Map();
            for (const item of ctx.items) {
                if (item.c === 'dila' && item.f && item.f.byq) worksBy.set(item.f.byq, [...(worksBy.get(item.f.byq) || []), item]);
                if (item.c === 'dila') for (const name of [item.n, core.displayName(item.t || '')]) if (name && !worksByName.has(normalizeAnswer(name))) worksByName.set(normalizeAnswer(name), item);
                const surname = PEOPLE.has(item.c) ? surnameOf(item.n) : null;
                const key = surname && (item.c === 'spisovatele' ? normalizeAnswer(surname) : `${item.c}:${normalizeAnswer(surname)}`);
                if (key) surnames.set(key, [...(surnames.get(key) || []), item]);
            }
            indexes.set(ctx.items, { byId, worksBy, surnames, worksByName, fame: new Map(ctx.items.map((item, index) => [item.q, index])) });
        }
        return indexes.get(ctx.items);
    };
    const authorOf = (item, ctx) => item.c !== 'spisovatele' && item.f && item.f.byq ? indexOf(ctx).byId.get(item.f.byq) || null : null;
    // Dílo postavy, když je v tématu (Hobit, Kmotr); jinak má postava jen jeho název (Stopařův průvodce po Galaxii)
    const workOf = (item, ctx) => item.c === 'postavy' && item.f && item.f.work ? indexOf(ctx).worksByName.get(normalizeAnswer(item.f.work)) || null : null;

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
        if (PEOPLE.has(item.c) && ctx && ctx.items) {
            const surname = surnameOf(item.n);
            const key = surname && (item.c === 'spisovatele' ? normalizeAnswer(surname) : `${item.c}:${normalizeAnswer(surname)}`);
            const namesakes = key ? indexOf(ctx).surnames.get(key) || [] : [];
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
        if (EXTRA.has(item.c)) return extraFacts(item, mode);
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
    const WORLD_EVENTS = [[-776, 'první olympijské hry'], [-753, 'založení Říma'], [-490, 'bitva u Marathónu'], [-447, 'stavba Parthenónu'],
        [-399, 'smrt Sókrata'], [-323, 'smrt Alexandra Velikého'], [-44, 'zavraždění Caesara'], [-27, 'vznik římského císařství'],
        [79, 'výbuch Vesuvu'], [313, 'Milánský edikt'], [476, 'pád Západořímské říše'], [800, 'korunovace Karla Velikého'],
        [1096, 'první křížová výprava'], [1347, 'morová epidemie v Evropě'], [1453, 'pád Konstantinopole'], [1492, 'objevení Ameriky'], [1618, 'začátek třicetileté války'],
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
        if (PEOPLE.has(item.c)) return f.born === undefined ? null : { ...base, spans: [{ kind: 'life', from: f.born, to: f.died ?? THIS_YEAR }] };
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
        if (PEOPLE.has(item.c) && f.born !== undefined && !isEstimate(f.born) && !(f.died !== undefined && f.died <= f.born)) {
            if (f.died !== undefined && !isEstimate(f.died) && centuryOf(f.born) === centuryOf(f.died) && f.died % 100 !== 0) {
                return { year: f.born, title: `Ve kterém století žil${ending}?` };
            }
            return { year: f.born, title: `Ve kterém století se narodil${ending}?` };
        }
        if (item.c === 'dila' && f.year !== undefined && !isEstimate(f.year)) return { year: f.year, title: 'Ve kterém století dílo vzniklo?' };
        if (item.c === 'hry' && f.year !== undefined && !isEstimate(f.year)) return { year: f.year, title: 'Ve kterém století hra vznikla?' };
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
        if (PEOPLE.has(item.c)) {
            // Stejná generace (narození do 30 let od sebe), nejdřív ze stejné země a mezi cizími cizí (k Murakamimu ne samí Češi);
            // u filozofa jiní filozofové
            return near(ctx.items.filter(other => other.c === item.c && other.f.born !== undefined && Math.abs(other.f.born - year) <= 30),
                other => (other.f.land === f.land ? 2 : 0) + ((other.cz === 1) === (item.cz === 1) ? 1 : 0) - Math.abs(other.f.born - year) / 20);
        }
        // U hry jiné hry a díla
        return near(ctx.items.filter(other => (other.c === 'dila' || (item.c === 'hry' && other.c === 'hry')) && other.f.year !== undefined && Math.abs(other.f.year - year) <= 15 && other.f.byq !== f.byq),
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
        const wrong = takeDistinct(rankBySimilarity(candidates, other => authorSimilarity(author, other) + core.cultureScore(author, other), rng), 3, new Set([normalizeAnswer(author.n)]), other => other.n);
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

    // --- Otázka na dílo postavy: „Ze kterého díla je tato postava?“ (jen u postavy jednoho díla – u Gandalfa či Holmese ne) ---
    // Nesprávná díla jsou od jiných autorů (v jiném díle téhož autora by postava mohla vystupovat také), ze stejné země,
    // jazyka a doby; ne díla, v jejichž názvu je jméno postavy, ani díla, mezi jejichž postavami je
    const workNames = (item, ctx) => {
        const work = workOf(item, ctx);
        return [...new Set([item.f.work, ...(item.f.wa || []), ...(work ? nameAnswers(work, nameAliases(work, ctx)) : [])].filter(Boolean))];
    };
    const workQuestion = (item, ctx, rng) => {
        const f = item.f || {};
        if (!f.wq || !f.work || censorName(f.work, item.n).includes('[***]')) return null;
        const work = workOf(item, ctx);
        const accepted = workNames(item, ctx);
        const taken = new Set(accepted.map(normalizeAnswer));
        const base = work || { cz: item.cz, gr: item.gr, f: { y: f.y, land: f.land } };
        const candidates = ctx.items.filter(other => other.c === 'dila' && other.q !== (work && work.q) && !taken.has(normalizeAnswer(other.n))
            && !(f.byq && other.f.byq === f.byq) && !(f.by && other.f.by === f.by) && !GENERIC_TITLE.test(other.n)
            && !censorName(other.n, item.n).includes('[***]') && !(other.f.chars || '').split(', ').includes(item.n));
        const score = (other) => eraNearness(base.f.y, other.f.y) + (base.f.land && base.f.land === other.f.land ? 3 : 0)
            + (base.f.lang && base.f.lang === other.f.lang ? 2 : 0) + (base.gr && base.gr === other.gr ? 2 : 0)
            + ((item.cz === 1) === (other.cz === 1) ? 1 : -3) + (other.k === 1 ? 1 : 0);
        const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, taken, other => other.n);
        if (wrong.length < 3) return null;
        const correct = { id: work ? work.q : `dilo-${normalizeAnswer(f.work)}`, label: f.work, correct: true };
        return {
            type: 'work',
            title: 'Ze kterého díla je tato postava?',
            showName: true,
            choices: shuffle([correct, ...wrong.map(other => ({ id: other.q, label: other.n, correct: false }))], rng),
            accepted,
            placeholder: 'Napiš název díla…',
            answerLabel: f.work
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
        // Otázka na dílo: země → autor → fotka (filmová podoba postavy dílo napoví nejvíc)
        if (type === 'work') {
            return [
                factsStep(formatFacts(item, [['land', 'Země', v => v]]), 'původ', 'map-pin'),
                factsStep(f.by ? [{ label: 'Autor', value: f.by }] : [], 'autor', 'feather'),
                { kind: 'photo' }
            ];
        }
        if (type === 'century') {
            const event = centuryEvent(item);
            const contemporaries = event ? contemporariesOf(item, ctx, event.year) : [];
            if (PEOPLE.has(item.c)) {
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
        if (EXTRA.has(item.c)) return extraHints(item, ctx, type);
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

    // --- Rozšíření: divadelní hry, pohádky a dětská literatura, jazyky a písma, filozofové ---
    const EXTRA_SHARES = {
        hry: { author: 0.4, century: 0.75 },
        pohadky: { author: 0.4, origin: 0.75 },
        jazyky: { branch: 0.3, script: 0.7 },
        filozofove: { century: 0.7 }
    };
    const list = (value) => [].concat(value || []).filter(Boolean);
    const joinList = (value) => list(value).join(', ');
    // Počet mluvčích slovy: asi 230 milionů, asi 1,2 miliardy
    const speakersLabel = (count) => {
        if (!count) return '';
        const decimal = (value) => String(value).replace('.', ',');
        if (count >= 1e9) return `asi ${decimal(Math.round(count / 1e8) / 10)} miliardy`;
        if (count >= 1e6) {
            const millions = count >= 1e7 ? Math.round(count / 1e6) : Math.round(count / 1e5) / 10;
            return `asi ${decimal(millions)} ${millions >= 5 ? 'milionů' : millions >= 2 ? 'miliony' : 'milionu'}`;
        }
        const thousands = Math.round(count / 1e3);
        return count >= 1e3 ? `asi ${thousands} ${thousands >= 5 ? 'tisíc' : 'tisíce'}` : `asi ${count}`;
    };
    // Autor pohádky: sběratel lidové pohádky ji zapsal, autor napsal
    const byLabel = (item) => item.c === 'pohadky' && item.f.byk === 'sběratel' ? 'Zapsal' : 'Autor';
    const officialLabel = (f) => f.no ? `${f.off.join(', ')} a další` : joinList(f.off);

    const extraFacts = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (item.c === 'filozofove') {
            const facts = [];
            if (answered && f.born !== undefined) facts.push({ label: 'Život', value: lifeRange(f) }, { label: 'Století', value: centuryRange(f.born, f.died) });
            facts.push(...formatFacts(item, [['land', 'Země', v => v], ['mov', 'Směr', v => v]]));
            if (answered) facts.push(...formatFacts(item, [['work', 'Slavné dílo', v => v]]));
            return facts;
        }
        if (isScript(item)) {
            const facts = formatFacts(item, [['year', 'Vznik', v => formatYear(v)]]);
            if (answered) facts.push(...formatFacts(item, [['langs', 'Píše se jím', joinList]]));
            return facts;
        }
        if (item.c === 'jazyky') {
            const facts = [];
            if (answered) facts.push(...formatFacts(item, [['br', 'Jazyková skupina', v => v]]));
            facts.push(...formatFacts(item, [['fam', 'Jazyková rodina', v => v], ['sp', 'Mluvčí', speakersLabel], ['scr', 'Písmo', joinList]]));
            if (answered) facts.push(...formatFacts(item, [['off', 'Úřední jazyk v', () => officialLabel(f)]]));
            return facts;
        }
        // Hra a pohádka
        const facts = [];
        if (f.year !== undefined && mode !== 'century') facts.push({ label: 'Vznik', value: formatYear(f.year) });
        if (answered && f.year !== undefined) facts.push({ label: 'Století', value: centuryLabel(centuryOf(f.year)) });
        facts.push(...formatFacts(item, [['land', 'Země', v => v]]));
        if (item.c === 'hry') facts.push(...formatFacts(item, [['lang', 'Jazyk', v => v], ['th', 'Divadlo', v => v]]));
        if (mode !== 'author' && mode !== 'creator' && f.by && (answered || !revealsName(item, f.by))) {
            facts.push({ label: byLabel(item), value: f.by });
        }
        return facts;
    };

    const extraSubtitle = (item) => {
        const f = item.f || {};
        if (item.c === 'filozofove') return [lifeRange(f), f.land].filter(Boolean).join(' · ');
        if (isScript(item)) return [item.ty, f.year !== undefined ? formatYear(f.year) : ''].filter(Boolean).join(' · ');
        if (item.c === 'jazyky') return [f.br || f.fam, speakersLabel(f.sp)].filter(Boolean).join(' · ');
        return [f.by, f.year !== undefined ? formatYear(f.year) : f.land].filter(Boolean).join(' · ');
    };

    // Nesprávné možnosti: jazyk k jazyku ze stejné skupiny a rodiny (písmo k písmu), filozof k filozofovi ze stejné doby a země,
    // hra ke hře a pohádka k pohádce ze stejné země a doby (česká k české)
    const extraSimilarity = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        if (item.c === 'jazyky') {
            if (isScript(item) !== isScript(other)) return -20;
            if (isScript(item)) return eraNearness(f.year, g.year) + (item.ty === other.ty ? 2 : 0) + (item.k === other.k ? 1 : 0);
            return (f.br && f.br === g.br ? 4 : 0) + (f.fam && f.fam === g.fam ? 2 : 0) + (list(f.scr)[0] && list(f.scr)[0] === list(g.scr)[0] ? 1 : 0)
                + ((item.ty === 'jazyk') === (other.ty === 'jazyk') ? 1 : -2) + (item.k === other.k ? 1 : 0);
        }
        const czech = (item.cz === 1) === (other.cz === 1) ? 1 : -3;
        if (item.c === 'filozofove') return personSimilarity(item, other) + (f.land && f.land === g.land ? 3 : 0) + (f.mov && f.mov === g.mov ? 2 : 0) + czech;
        const kind = item.c === 'pohadky' ? ((item.ty === 'kniha pro děti') === (other.ty === 'kniha pro děti') ? 2 : -6) : (item.ty === other.ty ? 1 : 0);
        return eraNearness(f.y, g.y) + (f.land && f.land === g.land ? 3 : 0) + (f.by && f.by === g.by ? 2 : 0) + kind + czech;
    };

    // Autor hry (bez autora mezi spisovateli tématu) a pohádky: nesprávné možnosti jsou autoři jiných her a pohádek
    const authorSurname = (name) => {
        const words = String(name || '').split(' ');
        return !/ a /u.test(name) && words.length >= 2 && words[words.length - 1].length >= 3 ? words[words.length - 1] : null;
    };
    const creatorAnswers = (name, ctx, category) => {
        const surname = /Grimm/u.test(name) ? 'Grimmové' : authorSurname(name);
        const shared = surname && (ctx.items || []).some(other => other.c === category && other.f.by && other.f.by !== name
            && normalizeAnswer(authorSurname(other.f.by) || '') === normalizeAnswer(surname));
        const pair = / a /u.test(name) ? name.split(' a ').map(part => authorSurname(part)).filter(Boolean) : [];
        return [name, ...(surname && !shared ? [surname] : []), ...(pair.length === 2 ? [pair.join(' a ')] : []), ...(/Grimm/u.test(name) ? ['Grimm', 'bratři Grimmové'] : [])];
    };
    const revealsName = (item, name) => censorName(item.n, name).includes('[***]') || core.factRevealsAnswer({ label: '', value: name }, [item.n]);
    const creatorQuestion = (item, ctx, rng) => {
        const f = item.f || {};
        if (!f.by || !ctx.items || revealsName(item, f.by)) return null;
        const candidates = ctx.items.filter(other => other.c === item.c && other.q !== item.q && other.f.by && normalizeAnswer(other.f.by) !== normalizeAnswer(f.by)
            && !revealsName(item, other.f.by));
        const wrong = takeDistinct(rankBySimilarity(candidates, other => extraSimilarity(item, other) - (other.f.by === f.by ? 50 : 0), rng), 3,
            new Set([normalizeAnswer(f.by)]), other => other.f.by).map(other => other.f.by);
        if (wrong.length < 3) return null;
        const title = item.c === 'hry' ? 'Kdo hru napsal?' : item.ty === 'kniha pro děti' ? 'Kdo knihu napsal?' : item.ty === 'sbírka pohádek'
            ? (f.byk === 'sběratel' ? 'Kdo pohádky sebral?' : 'Kdo sbírku napsal?') : f.byk === 'sběratel' ? 'Kdo pohádku zapsal?' : 'Kdo pohádku napsal?';
        return {
            type: 'creator',
            title,
            showName: true,
            choices: shuffle([f.by, ...wrong], rng).map(name => ({ id: `autor-${name}`, label: name, correct: name === f.by })),
            accepted: creatorAnswers(f.by, ctx, item.c),
            placeholder: 'Napiš jméno…',
            answerLabel: f.by
        };
    };
    // Odkud pohádka pochází: nesprávné možnosti jsou země jiných pohádek (sousední evropské, ne Japonsko k Německu)
    const originQuestion = (item, ctx, rng) => {
        // Česká pohádka: Česko, nebo Slovensko? (lidové pohádky obou zemí se prolínají) – na zemi se neptáme
        const land = (item.f || {}).land;
        if (!land || !ctx.items || item.cz === 1) return null;
        const lands = [...new Set(ctx.items.filter(other => other.c === 'pohadky' && other.f.land && other.f.land !== land && !/^(Československo|Slovensko)$/u.test(other.f.land))
            .map(other => other.f.land))];
        const ranked = rankBySimilarity(lands, other => core.cultureScore({ f: { land } }, { f: { land: other } }), rng);
        const wrong = ranked.slice(0, 3);
        if (wrong.length < 3) return null;
        return {
            type: 'origin',
            title: item.ty === 'kniha pro děti' ? 'Ze které země kniha pochází?' : item.ty === 'sbírka pohádek' ? 'Odkud sbírka pochází?' : 'Odkud pohádka pochází?',
            showName: true,
            choices: shuffle([land, ...wrong], rng).map(name => ({ id: `zeme-${name}`, label: name, correct: name === land })),
            accepted: [land],
            placeholder: 'Napiš zemi…',
            answerLabel: land
        };
    };
    // Jazyková skupina a písmo: nesprávné možnosti jsou skupiny (písma) jiných jazyků, nejdřív ze stejné rodiny
    const branchLabel = (branch) => String(branch || '').split(' ')[0].replace(/é$/u, 'á');
    const BRANCH_STEM = (branch) => String(branch || '').split(' ')[0].replace(/(ské|cké|ké)$/u, '');
    const branchQuestion = (item, ctx, rng) => {
        const f = item.f || {};
        if (!f.br || !ctx.items || normalizeAnswer(item.n).includes(normalizeAnswer(BRANCH_STEM(f.br)))) return null;
        const others = ctx.items.filter(other => other.c === 'jazyky' && !isScript(other) && other.f.br && other.f.br !== f.br);
        const ranked = rankBySimilarity(others, other => (other.f.fam && other.f.fam === f.fam ? 3 : 0) + (other.k === 1 ? 1 : 0), rng);
        const wrong = takeDistinct(ranked, 3, new Set([normalizeAnswer(f.br)]), other => other.f.br).map(other => other.f.br);
        if (wrong.length < 3) return null;
        // Možnosti přídavným jménem (slovanská, germánská): slovo „jazyky“ by měly všechny a nápovědy s ním by hra vyřadila
        const answer = branchLabel(f.br);
        return {
            type: 'branch',
            title: 'Do které jazykové skupiny patří?',
            showName: true,
            choices: shuffle([f.br, ...wrong], rng).map(name => ({ id: `skupina-${name}`, label: branchLabel(name), correct: name === f.br })),
            accepted: [answer, f.br.split(' ')[0]],
            placeholder: 'Napiš jazykovou skupinu…',
            answerLabel: answer
        };
    };
    const scriptQuestion = (item, ctx, rng) => {
        const scripts = list((item.f || {}).scr);
        if (!scripts.length || !ctx.items) return null;
        const own = new Set(scripts.map(normalizeAnswer));
        // Nesprávná písma z těch, kterými píše víc jazyků (ne klingonské), náhodně z deseti nejčastějších
        const usage = new Map();
        for (const other of ctx.items) if (other.c === 'jazyky' && !isScript(other) && other.ty !== 'umělý jazyk') for (const name of list(other.f.scr)) usage.set(name, (usage.get(name) || 0) + 1);
        const pool = [...usage].filter(([name]) => !own.has(normalizeAnswer(name)) && !/^(hiragana|katakana)$/u.test(name)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name);
        const wrong = shuffle(pool, rng).slice(0, 3);
        if (wrong.length < 3) return null;
        return {
            type: 'script',
            title: 'Jakým písmem se píše?',
            showName: true,
            choices: shuffle([scripts[0], ...wrong], rng).map(name => ({ id: `pismo-${name}`, label: name, correct: name === scripts[0] })),
            accepted: scripts,
            placeholder: 'Napiš písmo…',
            answerLabel: scripts[0]
        };
    };
    const extraQuestion = (item, ctx, rng, roll) => {
        const shares = EXTRA_SHARES[item.c];
        if (item.c === 'hry') {
            if (roll < shares.author) return authorOf(item, ctx) ? authorQuestion(item, ctx, rng) : creatorQuestion(item, ctx, rng);
            return roll >= shares.century ? centuryQuestion(item, rng) : null;
        }
        if (item.c === 'pohadky') {
            if (roll < shares.author) return creatorQuestion(item, ctx, rng);
            return roll >= shares.origin ? originQuestion(item, ctx, rng) : null;
        }
        if (item.c === 'jazyky') {
            if (isScript(item)) return null;
            if (roll < shares.branch) return branchQuestion(item, ctx, rng);
            return roll >= shares.script ? scriptQuestion(item, ctx, rng) : null;
        }
        return roll >= shares.century ? centuryQuestion(item, rng) : null;
    };

    // Zakrytí: u otázky na autora jeho jméno, u otázky na zemi země a národnost, u skupiny jazyků její název (západoslovanský),
    // u písma jeho název; u otázky na název filozofa jeho jméno jako u spisovatele (u ostatních jádro hry)
    const LAND_WORDS = {
        'Německo': 'německ', 'Francie': 'francouz', 'Dánsko': 'dánsk', 'Česko': 'česk', 'Rusko': 'rusk', 'Itálie': 'italsk', 'Norsko': 'norsk',
        'Slovensko': 'slovensk', 'Persie': 'persk|arabsk|orientáln', 'Indie': 'indick|sanskrt', 'Spojené království': 'anglick|britsk|skotsk',
        'Spojené státy americké': 'americk', 'Švédsko': 'švédsk', 'Polsko': 'polsk', 'Japonsko': 'japonsk', 'Čína': 'čínsk', 'Rakousko': 'rakousk'
    };
    const extraCensor = (type, text, item, ctx) => {
        const f = item.f || {};
        if (type === 'name') return item.c === 'filozofove' ? censorPerson(text, item, ctx) : null;
        if (type === 'creator') return core.mergeCensored(censorName(text, creatorAnswers(f.by, ctx, item.c).join(', ')).replace(/(?<![\p{L}])Grimm\p{L}*/gu, '[***]'));
        if (type === 'origin') {
            const words = LAND_WORDS[f.land];
            const masked = words ? text.replace(new RegExp(`(?<![\\p{L}])\\p{L}*(?:${words})\\p{L}*`, 'giu'), '[***]') : text;
            // Autor prozradí zemi (Andersen – Dánsko)
            return core.censorCountry(f.by ? censorName(masked, creatorAnswers(f.by, ctx, item.c).join(', ')) : masked, f.land);
        }
        if (type === 'branch') {
            const stem = BRANCH_STEM(f.br);
            return core.mergeCensored(text.replace(new RegExp(`(?<![\\p{L}])\\p{L}*${stem}\\p{L}*`, 'giu'), '[***]'));
        }
        if (type === 'script') {
            const stems = list(f.scr).map(name => escapeRegExp(name.split(' ')[0].slice(0, Math.max(4, name.split(' ')[0].length - 2))));
            return core.mergeCensored(text.replace(new RegExp(`(?<![\\p{L}])\\p{L}*(?:${stems.join('|')})\\p{L}*`, 'giu'), '[***]'));
        }
        return null;
    };

    // Nápovědy: hra a pohádka – vznik a země, autor (u otázky na název), fotka; jazyk – rodina a mluvčí, písmo, státy; písmo – vznik,
    // ukázka písma, jazyky; filozof – země a směr, časová osa, portrét, slavné dílo
    const extraHints = (item, ctx, type) => {
        const f = item.f || {};
        if (type === 'creator') {
            const others = (ctx.items || []).filter(other => other.c === item.c && other.q !== item.q && other.f.by === f.by && !revealsName(other, f.by)).slice(0, 2).map(other => other.n);
            return [
                factsStep(formatFacts(item, [['land', 'Země', v => v], ['year', 'Vznik', v => formatYear(v)]]), 'původ', 'map-pin'),
                factsStep(others.length ? [{ label: item.c === 'hry' ? 'Další hry autora' : 'Další díla autora', value: others.join(', ') }] : [], 'další díla', 'library')
            ];
        }
        if (type === 'origin') {
            return [
                factsStep(f.year !== undefined ? [{ label: 'Vznik', value: formatYear(f.year) }] : [], 'vznik', 'calendar'),
                factsStep(f.by ? [{ label: byLabel(item), value: f.by }] : [], 'autor', 'feather')
            ];
        }
        if (type === 'branch') {
            return [
                factsStep(formatFacts(item, [['fam', 'Jazyková rodina', v => v], ['sp', 'Mluvčí', speakersLabel]]), 'rodina a mluvčí', 'network'),
                factsStep(formatFacts(item, [['scr', 'Písmo', joinList]]), 'písmo', 'type'),
                factsStep(formatFacts(item, [['off', 'Úřední jazyk v', () => officialLabel(f)]]), 'státy', 'map-pin')
            ];
        }
        if (type === 'script') {
            return [
                factsStep(formatFacts(item, [['fam', 'Jazyková rodina', v => v], ['sp', 'Mluvčí', speakersLabel]]), 'rodina a mluvčí', 'users'),
                factsStep(formatFacts(item, [['br', 'Jazyková skupina', v => v]]), 'skupina', 'network'),
                factsStep(formatFacts(item, [['off', 'Úřední jazyk v', () => officialLabel(f)]]), 'státy', 'map-pin')
            ];
        }
        if (item.c === 'filozofove') {
            return [
                { kind: 'facts', facts: extraFacts(item, type) },
                { kind: 'visual', spec: timelineOf(item) },
                { kind: 'photo' },
                factsStep(f.work ? [{ label: 'Slavné dílo', value: f.work }] : [], 'slavné dílo', 'book')
            ];
        }
        if (isScript(item)) {
            return [
                { kind: 'facts', facts: extraFacts(item, type) },
                { kind: 'photo' },
                factsStep(f.langs ? [{ label: 'Píše se jím', value: joinList(f.langs) }] : [], 'jazyky', 'languages')
            ];
        }
        if (item.c === 'jazyky') {
            return [
                factsStep(formatFacts(item, [['fam', 'Jazyková rodina', v => v], ['sp', 'Mluvčí', speakersLabel]]), 'rodina a mluvčí', 'users'),
                factsStep(formatFacts(item, [['scr', 'Písmo', joinList]]), 'písmo', 'type'),
                factsStep(formatFacts(item, [['off', 'Úřední jazyk v', () => officialLabel(f)]]), 'státy', 'map-pin')
            ];
        }
        // Hra a pohádka: vznik a země, autor, fotka
        const origin = [...(f.year !== undefined ? [{ label: 'Vznik', value: formatYear(f.year) }] : []), ...formatFacts(item, [['land', 'Země', v => v]]),
            ...(item.c === 'hry' ? formatFacts(item, [['th', 'Divadlo', v => v]]) : [])];
        return [
            factsStep(origin, 'vznik a původ', 'calendar'),
            factsStep(f.by && !revealsName(item, f.by) ? [{ label: byLabel(item), value: f.by }] : [], 'autor', 'feather'),
            { kind: 'photo' }
        ];
    };

    const categoryOne = (item) => (CATEGORIES.find(category => category.key === item.c) || {}).one || '';
    const subtitle = (item) => {
        const f = item.f || {};
        if (EXTRA.has(item.c)) return extraSubtitle(item) || categoryOne(item);
        if (item.c === 'spisovatele') return [lifeRange(f), f.land].filter(Boolean).join(' · ') || categoryOne(item);
        if (item.c === 'dila') return [f.by, f.year !== undefined ? formatYear(f.year) : ''].filter(Boolean).join(' · ') || categoryOne(item);
        return [f.work, f.by].filter(Boolean).join(' · ') || categoryOne(item);
    };

    // Hlavní obrázek, který neukazuje osobnost nebo dílo (quiz-core.js offSubjectRule, npm run audit:obrazky): hrob, pamětní deska,
    // známka; u díla mapa (stejná mapa Narnie u šesti knih), výstava o autorovi nebo budova divadla
    const offSubjectPhoto = core.offSubjectRule({
        words: { spisovatele: core.OFF_SUBJECT.memorial, filozofove: core.OFF_SUBJECT.memorial, dila: ['map', 'mapa', 'karte', 'carte'] },
        ids: ['Q25338', 'Q1051472']
    });

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
        offSubjectPhoto,

        // Nesprávné možnosti: stejné pohlaví a doba, stejná země a jazyk, žánr; u díla díla téhož autora, u postavy postavy z téhož díla
        similarity: (item, other) => {
            if (EXTRA.has(item.c)) return extraSimilarity(item, other);
            const f = item.f || {};
            const g = other.f || {};
            let score = item.c === 'dila' ? eraNearness(f.y, g.y) : personSimilarity(item, other);
            if (f.land && f.land === g.land) score += 3;
            if (f.lang && f.lang === g.lang) score += 3;
            if (f.genre && f.genre === g.genre) score += 2;
            if (item.c !== 'spisovatele' && f.byq && f.byq === g.byq) score += 4;
            if (item.c === 'postavy' && f.work && f.work === g.work) score += 2;
            // Česká × cizí mezi možnostmi by správnou prozradila (k Brechtovi Vančura a Havel)
            score += (item.cz === 1) === (other.cz === 1) ? 1 : -3;
            return score;
        },
        nameAliases,

        // U díla a postavy občas „Kdo to napsal?“, u spisovatele a díla „Ve kterém století…?“, u postavy jednoho díla „Ze kterého díla je?“
        specialQuestion: (item, ctx, rng) => {
            const roll = rng();
            if (EXTRA.has(item.c)) return extraQuestion(item, ctx, rng, roll);
            if (item.c !== 'spisovatele' && roll < AUTHOR_QUIZ_SHARE) return authorQuestion(item, ctx, rng);
            if (item.c === 'postavy' && roll >= 1 - WORK_QUIZ_SHARE) return workQuestion(item, ctx, rng);
            if (item.c !== 'postavy' && roll >= 1 - CENTURY_QUIZ_SHARE) return centuryQuestion(item, rng);
            return null;
        },
        // U otázky na autora zmizí z popisu autor, u otázky na století letopočty; jméno či název zůstane
        censor: (type, text, item, ctx) => {
            if (type === 'author') {
                const author = authorOf(item, ctx);
                return author ? censorPerson(text, author, ctx) : text;
            }
            if (EXTRA.has(item.c) && type !== 'author' && type !== 'century') return extraCensor(type, text, item, ctx);
            if (type === 'name' && item.c !== 'dila') return censorPerson(text, item, ctx);
            // U otázky na dílo zmizí název díla i jeho autor (podle autora by bylo dílo hned jasné)
            if (type === 'work') {
                const author = authorOf(item, ctx);
                const withoutWork = censorName(text, workNames(item, ctx).join(', '));
                const withoutAuthor = author ? censorPerson(withoutWork, author, ctx) : item.f.by ? censorName(withoutWork, item.f.by) : withoutWork;
                // Skloněné krátké příjmení (Maye, Poea) zakryje až společné hledání všech tvarů jména
                const authorNames = [author && author.n, item.f.by].filter(Boolean);
                return core.mergeCensored(authorNames.length ? core.maskLeaks(withoutAuthor, authorNames, { keep: [item.n] }) : withoutAuthor);
            }
            if (type === 'century') return hideYears(core.stripBrackets(text).replace(/\s{2,}/g, ' '));
            return null;
        },
        // Kterého jiného spisovatele hráč napsal u otázky na autora
        findAnswer: (type, answer, item, ctx) => {
            if (type === 'work') {
                const own = new Set(workNames(item, ctx).map(normalizeAnswer));
                const other = ctx.items.find(candidate => candidate.c === 'dila' && !own.has(normalizeAnswer(candidate.n)) && isAnswerMatch(answer, nameAnswers(candidate, nameAliases(candidate, ctx))));
                return other ? { topic: 'literatura', id: other.q } : null;
            }
            if (type !== 'author') return null;
            const author = authorOf(item, ctx);
            const match = author && ctx.items.find(other => other.c === 'spisovatele' && other.q !== author.q && isAnswerMatch(answer, nameAnswers(other, nameAliases(other, ctx))));
            return match ? { topic: 'literatura', id: match.q } : null;
        },
        hints: hintsOf,
        visual: (item) => timelineOf(item),
        // Otázka podle druhu: písmo, kniha pro děti, sbírka pohádek
        questionTitle: (item) => isScript(item) ? 'Které písmo to je?' : item.c === 'pohadky' && item.ty === 'kniha pro děti' ? 'Která kniha to je?'
            : item.c === 'pohadky' && item.ty === 'sbírka pohádek' ? 'Která sbírka to je?' : null,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle,
        isCzech: (item) => item.cz === 1
    };
});
