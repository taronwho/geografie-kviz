// Téma Film: filmy, režiséři, herci a herečky (data/film.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatYear, censorName, shuffle, normalizeAnswer, rankBySimilarity, takeDistinct } = core;

    const PERSON = { question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'y' } };
    const CATEGORIES = [
        { key: 'filmy', label: 'Filmy', one: 'film', icon: 'film', question: 'Který film to je?', placeholder: 'Napiš název filmu…', sort: { by: 'y' } },
        { key: 'reziseri', label: 'Režiséři', one: 'režisér', icon: 'video', ...PERSON },
        { key: 'herci', label: 'Herci a herečky', one: 'herec', icon: 'drama', ...PERSON }
    ];
    const isFilm = (item) => item.c === 'filmy';

    // Jak často se u filmu ptáme na režiséra a na desetiletí premiéry (jinak na název)
    const DIRECTOR_QUIZ_SHARE = 0.25;
    const DECADE_QUIZ_SHARE = 0.2;
    const THIS_YEAR = new Date().getFullYear();
    const withoutDiacritics = (text) => text.normalize('NFD').replace(/\p{M}/gu, '');
    const list = (values) => [].concat(values || []).join(', ');

    // --- Desetiletí ---
    const decadeOf = (year) => Math.floor(year / 10) * 10;
    // „60. léta“ ve 20. století, „2010. léta“ a „1900. léta“ jinde (ať se nepletou 10. léta dvou století)
    const decadeLabel = (decade) => decade >= 1910 && decade < 2000 ? `${decade % 100}. léta` : `${decade}. léta`;
    const DECADE_WORDS = { 1910: 'desátá', 1920: 'dvacátá', 1930: 'třicátá', 1940: 'čtyřicátá', 1950: 'padesátá', 1960: 'šedesátá', 1970: 'sedmdesátá',
        1980: 'osmdesátá', 1990: 'devadesátá', 2000: 'nultá', 2010: 'desátá' };
    // Psaná odpověď přesně (šedesátá a sedmdesátá se liší jen o dvě písmena): „60. léta“, „1960“, „šedesátá léta“, i rok z toho desetiletí
    const decadeAnswers = (decade) => {
        const short = decade >= 1910 && decade < 2000 ? [`${decade % 100}. léta`, `${decade % 100}`, `${decade % 100}s`] : [];
        const word = DECADE_WORDS[decade] ? [`${DECADE_WORDS[decade]} léta`, DECADE_WORDS[decade]] : [];
        const years = Array.from({ length: 10 }, (_, i) => String(decade + i));
        return [...new Set([decadeLabel(decade), `${decade}. léta`, `${decade}s`, ...short, ...word, ...years].flatMap(text => [text, withoutDiacritics(text)]))];
    };
    // Z popisu u otázky na desetiletí zmizí letopočty a desetiletí slovy („v 60. letech“, „šedesátých let“)
    const hideYears = (text) => core.stripBrackets(text).replace(/\s{2,}/g, ' ')
        .replace(/(?<![\p{L}\d])\d{1,4}(?:\.\s*(?:let\p{L}*|lét\p{L}*|století))?(?![\d])/gu, '[***]')
        .replace(/(?<![\p{L}])(?:desát|dvacát|třicát|čtyřicát|padesát|šedesát|sedmdesát|osmdesát|devadesát|nult)\p{L}*/giu, '[***]');

    // --- Osoby: jméno a psaná odpověď ---
    const PARTICLES = new Set(['de', 'del', 'della', 'di', 'da', 'van', 'von', 'der', 'le', 'la', 'du']);
    const surnameOf = (name) => {
        const words = name.replace(/\s+(Jr\.|ml\.|st\.)$/u, '').split(' ');
        if (words.length < 2) return null;
        const last = words[words.length - 1];
        const particle = words[words.length - 2];
        return PARTICLES.has(particle.toLowerCase()) && words.length >= 3 ? `${particle} ${last}` : last;
    };
    // Příjmení jen tehdy, když se s překlepem nedá splést s příjmením jiného filmaře (Jan a Zdeněk Svěrákovi)
    const surnameCache = new WeakMap();
    const safeSurnames = (items) => {
        if (!surnameCache.has(items)) {
            const surnames = items.filter(other => !isFilm(other)).map(other => [other.q, surnameOf(other.n)]).filter(([, surname]) => surname);
            surnameCache.set(items, new Set(surnames.filter(([qid, surname]) => surname.length >= 3
                && !surnames.some(([other, name]) => other !== qid && core.isAnswerMatch(name, [surname]))).map(([qid]) => qid)));
        }
        return surnameCache.get(items);
    };
    const personAliases = (item, ctx) => {
        const surname = surnameOf(item.n);
        return surname && safeSurnames((ctx && ctx.items) || [item]).has(item.q) ? [surname] : [];
    };
    // Film: původní název (Pulp Fiction, The Godfather), část před „aneb“ (Limonádový Joe) a před dvojtečkou, když je jedinečná
    const prefixCache = new WeakMap();
    const prefixCounts = (items) => {
        if (!prefixCache.has(items)) {
            const counts = new Map();
            for (const other of items) {
                if (!isFilm(other) || !other.n.includes(': ')) continue;
                const prefix = normalizeAnswer(other.n.split(': ')[0]);
                counts.set(prefix, (counts.get(prefix) || 0) + 1);
            }
            prefixCache.set(items, counts);
        }
        return prefixCache.get(items);
    };
    const filmAliases = (item, ctx) => {
        const f = item.f || {};
        const aliases = [];
        if (f.orig) aliases.push(f.orig);
        if (item.n.includes(' aneb ')) aliases.push(item.n.split(' aneb ')[0]);
        if (item.n.includes(': ') && prefixCounts((ctx && ctx.items) || [item]).get(normalizeAnswer(item.n.split(': ')[0])) === 1) {
            const prefix = item.n.split(': ')[0];
            if (prefix.length >= 4) aliases.push(prefix);
        }
        return aliases;
    };

    const directorOf = (item, ctx) => {
        const qid = item.f && item.f.dirq;
        if (!qid || !ctx) return null;
        return (ctx.byId ? ctx.byId.get(qid) : (ctx.items || []).find(other => other.q === qid)) || null;
    };

    // --- Fakta ---
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (isFilm(item)) {
            const facts = [];
            if (mode !== 'decade' && f.year !== undefined) facts.push({ label: 'Rok', value: String(f.year) });
            if (f.gen) facts.push({ label: 'Žánr', value: list(f.gen) });
            if (f.land) facts.push({ label: 'Země', value: list(f.land) });
            if (mode !== 'decade' && f.len) facts.push({ label: 'Délka', value: `${f.len} min` });
            if (f.osc) facts.push({ label: 'Oscar', value: 'za nejlepší film' });
            // Režie a herci jsou samostatné nápovědy, mezi fakty až po odpovědi
            if (answered && f.dir) facts.push({ label: 'Režie', value: list(f.dir) });
            if (answered && f.cast) facts.push({ label: 'Hrají', value: list(f.cast) });
            return facts;
        }
        const facts = answered ? core.formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear]], ['born', 'died']) : [];
        if (f.land) facts.push({ label: 'Země', value: f.land });
        if (f.osc) facts.push({ label: 'Oscar', value: item.c === 'reziseri' ? 'ano' : 'za herecký výkon' });
        if (f.films) facts.push({ label: f.films.length > 1 ? 'Filmy' : 'Film', value: list(f.films) });
        return facts;
    };

    // --- Časová osa s milníky filmu ---
    const FILM_EVENTS = [
        [1895, 'první filmové promítání', 1], [1914, 'začátek 1. světové války', 0], [1927, 'nástup zvukového filmu', 1], [1929, 'první Oscary', 1],
        [1932, 'první festival v Benátkách', 1], [1939, 'začátek 2. světové války', 0], [1945, 'konec 2. světové války', 0], [1946, 'první festival v Cannes', 1],
        [1969, 'přistání na Měsíci', 0], [1989, 'pád Berlínské zdi', 0], [1995, 'první počítačově animovaný film', 1], [2001, 'útoky 11. září', 0],
        [2007, 'nástup streamování filmů', 1]
    ];
    const CZECH_EVENTS = [
        [1898, 'první české filmy'], [1918, 'vznik Československa'], [1933, 'otevření ateliérů Barrandov'], [1945, 'znárodnění kinematografie'],
        [1946, 'první festival v Karlových Varech'], [1948, 'komunistický převrat'], [1963, 'nástup české nové vlny'], [1968, 'pražské jaro'],
        [1989, 'sametová revoluce'], [1993, 'vznik České republiky']
    ];
    const anchorsFor = (item) => {
        const own = item.cz === 1 ? CZECH_EVENTS.map(([year, text]) => [year, text, 2]) : [];
        const years = new Set(own.map(([year]) => year));
        return [...own, ...FILM_EVENTS.filter(([year]) => !years.has(year))];
    };
    const timelineOf = (item) => {
        const f = item.f || {};
        if (isFilm(item)) return f.year !== undefined ? { type: 'timeline', spans: [], points: [f.year], hide: item.n, anchors: anchorsFor(item) } : null;
        if (f.born === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to: f.died ?? Math.min(THIS_YEAR, f.born + 100) }], points: [], hide: item.n, anchors: anchorsFor(item) };
    };

    // --- Nesprávné možnosti ---
    const AMERICA = new Set(['USA', 'Kanada', 'Spojené státy americké']);
    const bornCloseness = (a, b) => Math.max(0, 6 - Math.abs(((a.f || {}).born ?? Infinity) - ((b.f || {}).born ?? -Infinity)) / 15);
    const personScore = (item, other) => ((item.sx === 'f') !== (other.sx === 'f') ? -20 : 0) + bornCloseness(item, other)
        + ((item.f || {}).land && item.f.land === (other.f || {}).land ? 2 : 0)
        + (AMERICA.has((item.f || {}).land) === AMERICA.has((other.f || {}).land) ? 1 : 0) + ((item.cz === 1) === (other.cz === 1) ? 2 : 0);
    const yearCloseness = (a, b) => {
        const distance = Math.abs((a ?? Infinity) - (b ?? -Infinity));
        return distance <= 5 ? 3 : distance <= 10 ? 2 : distance <= 20 ? 1 : 0;
    };

    // --- Zvláštní otázky ---
    const directorQuestion = (item, ctx, rng) => {
        const director = directorOf(item, ctx);
        if (!director || !ctx.items) return null;
        const score = (other) => personScore(director, other) + (other.k === director.k ? 1 : 0);
        const candidates = ctx.items.filter(other => other.c === 'reziseri' && other.q !== director.q);
        const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, new Set([normalizeAnswer(director.n)]), other => other.n);
        if (wrong.length < 3) return null;
        return {
            type: 'director',
            title: 'Kdo film režíroval?',
            showName: true,
            choices: shuffle([director, ...wrong], rng).map(other => ({ id: other.q, label: other.n, correct: other.q === director.q })),
            accepted: [...new Set([director.n, director.t, ...personAliases(director, ctx)].filter(Boolean))],
            placeholder: 'Napiš jméno režiséra…',
            answerLabel: director.n
        };
    };
    const decadeQuestion = (item, rng) => {
        const f = item.f || {};
        // Jen jisté desetiletí (premiéra ani natáčení nejsou na přelomu) a název bez letopočtu
        if (!f.dq || f.year === undefined || f.year < 1900 || /\d{4}/.test(item.n)) return null;
        const decade = decadeOf(f.year);
        const last = decadeOf(THIS_YEAR);
        const wrong = [...shuffle([-10, 10], rng), ...shuffle([-20, 20], rng), ...shuffle([-30, 30], rng)]
            .map(offset => decade + offset).filter(other => other >= 1890 && other <= last).slice(0, 3);
        return {
            type: 'decade',
            title: 'Ve kterém desetiletí měl premiéru?',
            showName: true,
            choices: shuffle([decade, ...wrong], rng).map(other => ({ id: `desetileti-${other}`, label: decadeLabel(other), correct: other === decade })),
            accepted: decadeAnswers(decade),
            match: 'symbol',
            placeholder: 'Napiš desetiletí, třeba 60. léta',
            answerLabel: decadeLabel(decade)
        };
    };
    // Známé filmy z let kolem premiéry (bez letopočtu v názvu) – nápověda k desetiletí
    const contemporaries = (item, ctx) => {
        const f = item.f || {};
        return (ctx.items || []).filter(other => isFilm(other) && other.q !== item.q && other.k === 1 && !/\d/.test(other.n)
            && Math.abs(((other.f || {}).year ?? Infinity) - f.year) <= 2)
            .sort((a, b) => ((b.cz === 1) === (item.cz === 1) ? 1 : 0) - ((a.cz === 1) === (item.cz === 1) ? 1 : 0)
                || Math.abs(a.f.year - f.year) - Math.abs(b.f.year - f.year))
            .slice(0, 3).map(other => other.n);
    };

    return {
        id: 'film',
        title: 'Film',
        icon: 'clapperboard',
        emoji: '🎬',
        color: 'rose',
        dataFile: 'data/film.json',
        subtitleIcon: 'clapperboard',
        words: {
            question: 'Co je to?',
            one: 'film',
            next: 'Další otázka',
            atlas: 'Filmový atlas',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavné filmy, režiséři a herci'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: filmy ze stejné země, doby a žánru (bez stejného režiséra – jinak by nápověda „režie“ nepomohla);
        // filmaři stejného pohlaví, doby a země, české k českým
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            if (!isFilm(item)) return personScore(item, other);
            return yearCloseness(f.year, g.year) + ((f.land || [])[0] && (f.land || [])[0] === (g.land || [])[0] ? 2 : 0)
                + ((f.gen || [])[0] && (g.gen || []).includes(f.gen[0]) ? 2 : 0) + ((item.cz === 1) === (other.cz === 1) ? 2 : 0)
                - ((f.dir || []).some(name => (g.dir || []).includes(name)) ? 3 : 0);
        },
        nameAliases: (item, ctx) => isFilm(item) ? filmAliases(item, ctx) : personAliases(item, ctx),

        // U filmu občas „Kdo film režíroval?“ (jen u jediného režiséra z dat) nebo „Ve kterém desetiletí měl premiéru?“
        specialQuestion: (item, ctx, rng) => {
            if (!isFilm(item)) return null;
            const roll = rng();
            if (roll < DIRECTOR_QUIZ_SHARE) return directorQuestion(item, ctx, rng);
            if (roll < DIRECTOR_QUIZ_SHARE + DECADE_QUIZ_SHARE) return decadeQuestion(item, rng);
            return null;
        },
        // Plakáty filmů na Commons skoro nejsou, takže film se hádá z popisu a nápověd: rok, žánr a země → herci → režie.
        // U režiséra: o filmu → herci (bez režiséra samotného) → jeho další filmy; u desetiletí: žánr a země → herci → režie →
        // známé filmy z té doby
        hints: (item, ctx, type) => {
            if (!isFilm(item)) return null;
            const f = item.f || {};
            const director = directorOf(item, ctx);
            const cast = (f.cast || []).filter(name => !director || name !== director.n).slice(0, 3);
            const castHint = { kind: 'facts', label: 'hrají', icon: 'users', facts: cast.length ? [{ label: 'Hrají', value: cast.join(', ') }] : [] };
            const directionHint = { kind: 'facts', label: 'režie', icon: 'video', facts: f.dir ? [{ label: 'Režie', value: list(f.dir) }] : [] };
            if (type === 'director') {
                const others = ((director && director.f.films) || []).filter(name => normalizeAnswer(name) !== normalizeAnswer(item.n));
                return [
                    { kind: 'facts', label: 'o filmu', icon: 'film', facts: factsOf(item, 'director').filter(fact => fact.label !== 'Délka') },
                    castHint,
                    { kind: 'facts', label: 'další filmy', icon: 'clapperboard', facts: others.length ? [{ label: 'Další filmy', value: others.join(', ') }] : [] }
                ];
            }
            if (type === 'decade') {
                const same = contemporaries(item, ctx);
                return [
                    { kind: 'facts', label: 'žánr a země', icon: 'film', facts: factsOf(item, 'decade').filter(fact => fact.label !== 'Oscar') },
                    castHint,
                    directionHint,
                    { kind: 'facts', label: 've stejné době', icon: 'calendar-range', facts: same.length ? [{ label: 'Ve stejné době', value: same.join(', ') }] : [] }
                ];
            }
            return [{ kind: 'facts', facts: factsOf(item, 'name') }, castHint, directionHint];
        },
        // Popis: u režiséra zmizí jeho jméno, u desetiletí letopočty
        censor: (type, text, item, ctx) => {
            if (type === 'director') {
                const director = directorOf(item, ctx);
                return director ? censorName(text, [director.n, director.t, ...personAliases(director, ctx)].join(', ')) : null;
            }
            if (type === 'decade') return hideYears(text);
            return null;
        },
        // Napsaný jiný režisér u otázky na režii
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'director') return null;
            const other = ctx.items.find(candidate => candidate.c === 'reziseri' && candidate.q !== (item.f || {}).dirq
                && core.isAnswerMatch(answer, [candidate.n, ...personAliases(candidate, ctx)]));
            return other ? { topic: 'film', id: other.q } : null;
        },

        // Osa: u filmaře život s milníky filmu; u filmu jen po odpovědi (rok je mezi fakty)
        visual: (item, ctx, mode) => !isFilm(item) || mode === 'result' || mode === 'card' ? timelineOf(item) : null,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            if (isFilm(item)) return [f.year, (f.dir || [])[0]].filter(Boolean).join(' · ');
            const life = f.died !== undefined ? `${formatYear(f.born)}–${formatYear(f.died)}` : `nar. ${formatYear(f.born)}`;
            return [life, f.land].filter(Boolean).join(' · ');
        },
        isCzech: (item) => item.cz === 1
    };
});
