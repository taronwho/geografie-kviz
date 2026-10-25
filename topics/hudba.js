// Téma Hudba: skladatelé, hudebníci a zpěváci, kapely a slavná díla (data/hudba.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatYear, formatFacts, shuffle, eraNearness, personSimilarity, censorName, normalizeAnswer, rankBySimilarity, takeDistinct,
        isRealPhoto, nameAnswers, buildTimeline, isAnswerMatch
    } = core;

    const PERSON = { question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } };
    const CATEGORIES = [
        { key: 'skladatele', label: 'Skladatelé', one: 'skladatel', icon: 'piano', ...PERSON },
        { key: 'hudebnici', label: 'Hudebníci a zpěváci', one: 'hudebník', icon: 'mic-vocal', ...PERSON },
        { key: 'kapely', label: 'Kapely', one: 'kapela', icon: 'guitar', question: 'Co je to za kapelu?', placeholder: 'Napiš název kapely…', ask: 'Co je', sort: { by: 'y' } },
        { key: 'dila', label: 'Slavná díla', one: 'dílo', icon: 'music-2', question: 'Které dílo to je?', placeholder: 'Napiš název…', ask: 'Co je', sort: { by: 'y' } }
    ];
    const isPerson = (item) => item.c === 'skladatele' || item.c === 'hudebnici';

    // Jak často se u díla ptáme na autora a u skladatele na období
    const AUTHOR_QUIZ_SHARE = 0.4;
    const PERIOD_QUIZ_SHARE = 0.3;
    const THIS_YEAR = new Date().getFullYear();

    // Hudební období (u skladatele určené při sestavení dat jen tam, kde je zařazení jasné)
    const PERIODS = [
        { key: 'renesance', label: 'renesance', accepted: ['renesance', 'renesanční hudba', 'renesanční'] },
        { key: 'baroko', label: 'baroko', accepted: ['baroko', 'barokní hudba', 'barokní'] },
        { key: 'klasicismus', label: 'klasicismus', accepted: ['klasicismus', 'klasicistní hudba', 'klasicistní', 'hudební klasicismus'] },
        { key: 'romantismus', label: 'romantismus', accepted: ['romantismus', 'romantická hudba', 'romantický', 'hudební romantismus'] },
        { key: 'moderna', label: '20. století', accepted: ['20. století', 'hudba 20. století', '20', 'moderna', 'moderní hudba'] }
    ];
    const periodOf = (item) => PERIODS.find(period => period.key === (item.f || {}).per);

    // Dílo s obecným názvem (Requiem, Symfonie č. 5) složilo víc skladatelů – na autora se u něj neptáme
    const GENERIC_TITLE = /^(requiem|mše|te deum|stabat mater|gloria|magnificat|ave maria|missa|symfonie|koncert|sonáta|kvartet|suita|předehra|serenáda|nokturno|valčík|rapsodie|ouvertura|toccata|tokáta|fuga|preludium)(?![\p{L}])/iu;

    // --- Pomocníci nad daty ---
    const indexes = new WeakMap();
    const indexOf = (ctx) => {
        if (!indexes.has(ctx.items)) {
            const byId = new Map(ctx.items.map(item => [item.q, item]));
            const worksBy = new Map();
            const surnames = new Map();
            for (const item of ctx.items) {
                if (item.c === 'dila' && item.f && item.f.byq) worksBy.set(item.f.byq, [...(worksBy.get(item.f.byq) || []), item]);
                const surname = isPerson(item) ? surnameOf(item.n) : null;
                if (surname) surnames.set(normalizeAnswer(surname), [...(surnames.get(normalizeAnswer(surname)) || []), item]);
            }
            indexes.set(ctx.items, { byId, worksBy, surnames, fame: new Map(ctx.items.map((item, index) => [item.q, index])) });
        }
        return indexes.get(ctx.items);
    };
    const authorOf = (item, ctx) => item.c === 'dila' && item.f && item.f.byq ? indexOf(ctx).byId.get(item.f.byq) || null : null;

    // Příjmení slavného (Mozart, Smetana) – bez přípon „mladší“ a římských číslic
    const NAME_SUFFIX = /^(mladší|starší|ml\.|st\.|jr\.|sr\.|[IVX]+\.?)$/iu;
    const surnameOf = (name) => {
        const words = name.split(' ').filter(word => !NAME_SUFFIX.test(word));
        const last = words[words.length - 1] || '';
        return words.length >= 2 && last.length >= 4 && /^\p{Lu}/u.test(last) ? last : null;
    };
    // Psaná odpověď: u osob příjmení, které v tématu nemá nikdo jiný (u Bachů jen ten nejznámější),
    // u kapel název bez „The“, u děl kratší název
    const nameAliases = (item, ctx) => {
        const aliases = [...(item.al || [])];
        if (isPerson(item) && ctx && ctx.items) {
            const surname = surnameOf(item.n);
            const namesakes = surname ? indexOf(ctx).surnames.get(normalizeAnswer(surname)) || [] : [];
            const others = namesakes.filter(other => other.q !== item.q);
            if (surname && (others.length === 0 || (item.k === 1 && others.every(other => other.k === 0) && namesakes[0] === item))) aliases.push(surname);
        }
        if (item.c === 'kapely' && /^The /u.test(item.n)) aliases.push(item.n.slice(4));
        return aliases.filter(alias => normalizeAnswer(alias) !== normalizeAnswer(item.n));
    };

    // Latinské tvary jmen jádro neskloňuje (Amadeus → „Amadea“) – v popisu se zakryje i kmen
    const latinForms = (name) => name.split(/\s+/).filter(word => /^\p{Lu}\p{L}{3,}(us|os)$/u.test(word)).map(word => word.slice(0, -2));
    const censorPerson = (text, person, ctx) => censorName(text, [person.n, core.displayName(person.t || ''), ...nameAliases(person, ctx), ...latinForms(person.n)].join(', '));

    // Období: „1685–1750“, žijící „nar. 1958“
    const lifeRange = (f) => f.born === undefined ? '' : f.died !== undefined ? `${formatYear(f.born)}–${formatYear(f.died)}` : `nar. ${formatYear(f.born)}`;

    // --- Fakta ---
    // mode: druh otázky ('name', 'author', 'period'), 'result' nebo 'card'
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        const period = periodOf(item);
        if (isPerson(item)) {
            const facts = [];
            if (answered && f.born !== undefined) facts.push({ label: 'Život', value: lifeRange(f) });
            facts.push(...formatFacts(item, [['land', 'Země', v => v]]));
            if (period && mode !== 'period') facts.push({ label: 'Období', value: period.label });
            facts.push(...formatFacts(item, [['genre', 'Žánr', v => v]]));
            if (answered) facts.push(...formatFacts(item, [['band', 'Kapela', v => v], ['work', 'Slavné dílo', v => v]]));
            return facts;
        }
        if (item.c === 'kapely') {
            const facts = formatFacts(item, [['land', 'Země', v => v], ['genre', 'Žánr', v => v]]);
            if (f.from !== undefined) facts.push({ label: 'Založena', value: String(f.from) });
            if (answered) facts.push(...formatFacts(item, [['city', 'Místo vzniku', v => v], ['members', 'Členové', v => v], ['work', 'Slavné dílo', v => v]]));
            return facts;
        }
        const facts = [];
        if (f.year !== undefined && mode !== 'author') facts.push({ label: 'Rok', value: formatYear(f.year) });
        facts.push(...formatFacts(item, [['genre', 'Žánr', v => v], ['land', 'Země', v => v]]));
        if (mode !== 'author') facts.push(...formatFacts(item, [['by', 'Autor', v => v]]));
        if (answered) facts.push(...relatedOf(item));
        return facts;
    };

    // Souvislosti díla: libreto, album, na kterém píseň vyšla, a píseň z alba
    const relatedOf = (item) => formatFacts(item, [['lib', 'Libreto', v => v], ['album', 'Album', v => v], ['song', 'Píseň z alba', v => v]]);

    // --- Časová osa s milníky hudby (blízkost 1), českými (2 u českých položek) a světovými událostmi ---
    const MUSIC_EVENTS = [
        [1597, 'první opera'], [1700, 'vynález klavíru'], [1750, 'smrt J. S. Bacha'], [1787, 'Mozartův Don Giovanni v Praze'],
        [1824, 'Beethovenova 9. symfonie'], [1866, 'Smetanova Prodaná nevěsta'], [1877, 'Edisonův fonograf'], [1893, 'Dvořákova Novosvětská'],
        [1913, 'Stravinského Svěcení jara'], [1920, 'první rozhlasové vysílání'], [1948, 'první dlouhohrající deska'], [1954, 'Elvis Presley: první singl'],
        [1962, 'první singl Beatles'], [1969, 'festival Woodstock'], [1981, 'vznik MTV'], [1982, 'první CD'], [2005, 'vznik YouTube'], [2008, 'vznik Spotify']
    ];
    const CZECH_EVENTS = [[1348, 'založení Karlovy univerzity'], [1620, 'bitva na Bílé hoře'], [1883, 'otevření Národního divadla'], [1918, 'vznik Československa'],
        [1968, 'pražské jaro'], [1976, 'proces s Plastic People'], [1989, 'sametová revoluce']];
    const WORLD_EVENTS = [[1492, 'objevení Ameriky'], [1618, 'začátek třicetileté války'], [1789, 'Velká francouzská revoluce'], [1848, 'revoluce v Evropě'],
        [1914, 'začátek 1. světové války'], [1939, 'začátek 2. světové války'], [1945, 'konec 2. světové války'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi'],
        [2001, 'útoky 11. září']];
    const anchorsFor = (item) => [
        ...MUSIC_EVENTS.map(([year, text]) => [year, text, 1]),
        ...CZECH_EVENTS.map(([year, text]) => [year, text, item.cz === 1 ? 2 : 0]),
        ...WORLD_EVENTS.map(([year, text]) => [year, text, 0])
    ];
    const timelineOf = (item) => {
        const f = item.f || {};
        // Událost by neměla prozradit jméno ani kapelu či autora
        const hide = [item.n, f.band, f.by].filter(Boolean).join(', ');
        const base = { type: 'timeline', points: [], hide, anchors: anchorsFor(item) };
        if (isPerson(item)) {
            if (f.born === undefined) return null;
            return { ...base, spans: [{ kind: 'life', from: f.born, to: f.died ?? THIS_YEAR }] };
        }
        // Kapela: rok založení (rok rozpadu bývá ve Wikidatech až po pozdějším obnovení), dílo: rok vzniku
        const year = item.c === 'kapely' ? f.from : f.year;
        return year === undefined ? null : { ...base, spans: [], points: [year] };
    };
    // Osa bez letopočtů (u otázky na období) jen tehdy, když na ní jsou aspoň dvě známé události
    const blindTimelineOf = (item) => {
        const spec = timelineOf(item);
        if (!spec) return null;
        const blind = { ...spec, spans: spec.spans.filter(span => span.kind === 'life'), blind: true, name: 'osa bez letopočtů', icon: 'calendar-range' };
        return buildTimeline(blind, 340).anchors.length >= 2 ? blind : null;
    };

    // Současníci: známí skladatelé, kteří žili v polovině jeho tvorby (nejdřív ze stejné země)
    const contemporariesOf = (item, ctx) => {
        const f = item.f || {};
        if (f.born === undefined || f.died === undefined) return [];
        const year = Math.round((f.born + 20 + f.died) / 2);
        const { fame } = indexOf(ctx);
        return ctx.items
            .filter(other => other.q !== item.q && other.c === 'skladatele' && other.k === 1 && other.f.born <= year - 15 && year <= (other.f.died ?? THIS_YEAR))
            .sort((a, b) => (b.f.land === f.land) - (a.f.land === f.land) || fame.get(a.q) - fame.get(b.q))
            .slice(0, 3).map(other => other.n);
    };
    // Další díla téhož autora (u otázky na autora) – nejznámější, bez hádaného díla
    const otherWorksOf = (item, ctx) => (indexOf(ctx).worksBy.get(item.f.byq) || []).filter(other => other.q !== item.q).slice(0, 2).map(other => other.n);

    // Portrét autora (u otázky na autora poslední nápověda)
    const portraitOf = (author) => author && author.im && author.ih && isRealPhoto(author.im)
        ? { type: 'image', file: author.im, hash: author.ih, name: author.c === 'kapely' ? 'fotka kapely' : 'portrét autora', icon: 'user' } : null;

    // Ve 20. století rozhoduje desetiletí (ABBA ke Carpenters, ne k Nirvaně), století by bylo moc hrubé
    const decadeNearness = (a, b) => {
        if (a === undefined || b === undefined || a < 1900 || b < 1900) return 0;
        const distance = Math.abs(a - b);
        return distance <= 8 ? 3 : distance <= 15 ? 2 : distance <= 30 ? 1 : 0;
    };

    // --- Zvláštní otázky ---
    // Nesprávní autoři: ze stejné kategorie, podobné doby, země a žánru; bez autorů stejnojmenných děl
    const authorSimilarity = (author, other, item, ctx) => {
        const f = author.f || {};
        const g = other.f || {};
        let score = (author.k === other.k ? 3 : 0) + (author.ty && author.ty === other.ty ? 2 : 0) + ((author.cz === 1) === (other.cz === 1) ? 2 : 0);
        // Ke skladateli opery skladatelé oper, k albu kapely s alby
        if ((indexOf(ctx).worksBy.get(other.q) || []).some(work => work.ty === item.ty)) score += 2;
        score += isPerson(author) ? personSimilarity(author, other) : eraNearness(f.y, g.y);
        if (f.land && f.land === g.land) score += 2;
        if (f.per && f.per === g.per) score += 2;
        if (author.gr && author.gr === other.gr) score += 3;
        return score + decadeNearness(f.y, g.y);
    };
    const authorQuestion = (item, ctx, rng) => {
        const author = authorOf(item, ctx);
        if (!author || GENERIC_TITLE.test(item.n)) return null;
        const excluded = new Set([author.q, ...(item.xa || [])]);
        // Autor, jehož jméno je v názvu díla, by byl nápadný
        const candidates = ctx.items.filter(other => other.c === author.c && !excluded.has(other.q) && !censorName(item.n, other.n).includes('[***]'));
        const wrong = takeDistinct(rankBySimilarity(candidates, other => authorSimilarity(author, other, item, ctx), rng), 3, new Set([normalizeAnswer(author.n)]), other => other.n);
        if (wrong.length < 3 || censorName(item.n, author.n).includes('[***]')) return null;
        const kind = (item.f || {}).kind;
        return {
            type: 'author',
            title: kind === 'album' ? 'Čí je to album?' : kind === 'pisen' ? 'Čí je to píseň?' : 'Kdo to složil?',
            showName: true,
            choices: shuffle([author, ...wrong], rng).map(other => ({ id: other.q, label: other.n, correct: other.q === author.q })),
            accepted: nameAnswers(author, nameAliases(author, ctx)),
            placeholder: author.c === 'kapely' ? 'Napiš název kapely…' : 'Napiš jméno…',
            answerLabel: author.n
        };
    };
    const periodQuestion = (item, rng) => {
        const period = periodOf(item);
        if (!period) return null;
        const index = PERIODS.indexOf(period);
        // Nesprávná období co nejbližší (k baroku renesance, klasicismus a romantismus)
        const wrong = PERIODS.filter(other => other !== period)
            .sort((a, b) => Math.abs(PERIODS.indexOf(a) - index) - Math.abs(PERIODS.indexOf(b) - index) || PERIODS.indexOf(a) - PERIODS.indexOf(b)).slice(0, 3);
        return {
            type: 'period',
            title: 'Do kterého hudebního období patří?',
            showName: true,
            choices: shuffle([period, ...wrong], rng).map(other => ({ id: `obdobi-${other.key}`, label: other.label, correct: other === period })),
            accepted: period.accepted,
            placeholder: 'Napiš období, třeba baroko',
            answerLabel: period.label
        };
    };

    // Z popisu u otázky na období zmizí období, směry a letopočty (prozradily by odpověď)
    const PERIOD_WORDS = /(?<![\p{L}])(?:renesan|barok|klasicis|klasicist|romanti|modern|impresionis|expresionis|neoklasic|avantgard|vídeňsk)\p{L}*/giu;
    const hideYears = (text) => text.replace(/(?<![\p{L}\d])\d{1,4}(?!\d)(\.\s*(?:století|stol\.))?/gu, '[***]');

    // --- Nápovědy podle druhu otázky ---
    const factsStep = (facts, label, icon) => ({ kind: 'facts', label, icon, facts });
    const pick = (item, mode, labels) => factsOf(item, mode).filter(fact => labels.includes(fact.label));
    const hintsOf = (item, ctx, type) => {
        const f = item.f || {};
        if (type === 'author') {
            const author = authorOf(item, ctx);
            const works = otherWorksOf(item, ctx);
            const origin = [
                ...(f.year !== undefined ? [{ label: 'Rok', value: formatYear(f.year) }] : []),
                ...formatFacts(item, [['genre', 'Žánr', v => v], ['land', 'Země', v => v]])
            ];
            return [
                factsStep(origin, 'vznik díla', 'calendar'),
                factsStep(works.length ? [{ label: 'Další díla autora', value: works.join(', ') }] : [], 'další díla', 'music-2'),
                { kind: 'visual', spec: portraitOf(author) }
            ];
        }
        if (type === 'period') {
            const contemporaries = contemporariesOf(item, ctx);
            return [
                factsStep(contemporaries.length ? [{ label: 'Tehdy tvořili', value: contemporaries.join(', ') }] : [], 'současníci', 'users'),
                factsStep(f.work ? [{ label: 'Slavné dílo', value: f.work }] : [], 'slavné dílo', 'music-2'),
                { kind: 'visual', spec: blindTimelineOf(item) },
                factsStep(f.born !== undefined && f.died !== undefined ? [{ label: 'Život', value: lifeRange(f) }] : [], 'roky života', 'calendar-range')
            ];
        }
        // Otázka na název: od obecného (země, žánr) přes časovou osu a fotku po slavné dílo
        if (isPerson(item)) {
            // Kapela se jménem hledaného (The Jackson 5) by prozradila odpověď – ta se vynechá
            const band = f.band && !censorPerson(f.band, item, ctx).includes('[***]') ? f.band : undefined;
            const known = [['Slavné dílo', f.work], ['Kapela', band]].filter(([, value]) => value).map(([label, value]) => ({ label, value }));
            return [
                { kind: 'facts', facts: factsOf(item, type) },
                { kind: 'visual', spec: timelineOf(item) },
                { kind: 'photo' },
                factsStep(known, f.work ? (band ? 'dílo a kapela' : 'slavné dílo') : 'kapela', f.work ? 'music-2' : 'users')
            ];
        }
        if (item.c === 'kapely') {
            const known = [['members', 'Členové'], ['work', 'Slavné dílo']].filter(([key]) => f[key]).map(([key, label]) => ({ label, value: f[key] }));
            return [
                { kind: 'facts', facts: factsOf(item, type) },
                { kind: 'visual', spec: timelineOf(item) },
                { kind: 'photo' },
                factsStep(known, 'členové a díla', 'users')
            ];
        }
        // Dílo: fotka by často ukázala plakát s názvem – jen fakta (rok, žánr, autor) a souvislosti (libreto, album, píseň z alba)
        const related = relatedOf(item);
        return [
            { kind: 'facts', facts: factsOf(item, type) },
            factsStep(related, f.lib ? 'libreto' : f.song ? 'píseň z alba' : 'album', f.lib ? 'scroll-text' : 'disc-3')
        ];
    };

    const subtitle = (item) => {
        const f = item.f || {};
        if (isPerson(item)) return [lifeRange(f), f.land].filter(Boolean).join(' · ') || categoryOne(item);
        if (item.c === 'kapely') return [f.from !== undefined ? `od ${f.from}` : '', f.land].filter(Boolean).join(' · ') || categoryOne(item);
        return [f.by, f.year !== undefined ? formatYear(f.year) : ''].filter(Boolean).join(' · ') || categoryOne(item);
    };
    const categoryOne = (item) => (CATEGORIES.find(category => category.key === item.c) || {}).one || '';

    return {
        id: 'hudba',
        title: 'Hudba',
        icon: 'music',
        emoji: '🎵',
        color: 'pink',
        dataFile: 'data/hudba.json',
        subtitleIcon: 'calendar-range',
        words: {
            question: 'Kdo nebo co to je?',
            one: 'hudebník',
            next: 'Další otázka',
            atlas: 'Atlas hudby',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavní skladatelé, zpěváci, kapely a díla'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: stejné pohlaví a doba, stejná země, období a žánrová skupina; u díla díla téhož autora a druhu
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            let score = isPerson(item) ? personSimilarity(item, other) : eraNearness(f.y, g.y);
            if (f.land && f.land === g.land) score += 2;
            if (f.per && f.per === g.per) score += 2;
            if (item.gr && item.gr === other.gr) score += 3;
            score += decadeNearness(f.y, g.y);
            if (item.c === 'dila') score += (f.byq && f.byq === g.byq ? 4 : 0) + (f.kind === g.kind ? 3 : 0);
            if ((item.cz === 1) === (other.cz === 1)) score += 2;
            return score;
        },
        nameAliases,

        // U díla občas „Kdo to složil?“ (u alba a písně „Čí je to?“), u skladatele „Do kterého období patří?“
        specialQuestion: (item, ctx, rng) => {
            const roll = rng();
            if (item.c === 'dila') return roll < AUTHOR_QUIZ_SHARE ? authorQuestion(item, ctx, rng) : null;
            if (item.c === 'skladatele') return roll < PERIOD_QUIZ_SHARE ? periodQuestion(item, rng) : null;
            return null;
        },
        // U otázky na autora zmizí z popisu autor (i v latinském tvaru), u otázky na období období a letopočty; název díla či jméno zůstane
        censor: (type, text, item, ctx) => {
            if (type === 'author') {
                const author = authorOf(item, ctx);
                return author ? censorPerson(text, author, ctx) : text;
            }
            if (type === 'name' && isPerson(item)) return censorPerson(text, item, ctx);
            if (type === 'period') return hideYears(core.stripBrackets(text).replace(/\s{2,}/g, ' ').replace(PERIOD_WORDS, '[***]'));
            return null;
        },
        // Kterou jinou osobnost či kapelu hráč napsal u otázky na autora
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'author') return null;
            const author = authorOf(item, ctx);
            const match = author && ctx.items.find(other => other.c === author.c && other.q !== author.q && isAnswerMatch(answer, nameAnswers(other, nameAliases(other, ctx))));
            return match ? { topic: 'hudba', id: match.q } : null;
        },
        hints: hintsOf,
        visual: (item) => timelineOf(item),
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle,
        isCzech: (item) => item.cz === 1
    };
});
