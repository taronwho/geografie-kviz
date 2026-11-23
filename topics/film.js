// Téma Film: filmy, animované filmy, seriály, režiséři, herci a herečky, televizní pořady, večerníčky, komiksy a anime (data/film.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatYear, censorName, shuffle, normalizeAnswer, rankBySimilarity, takeDistinct } = core;

    const PERSON = { question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } };
    const CATEGORIES = [
        { key: 'filmy', label: 'Filmy', one: 'film', icon: 'film', question: 'Který film to je?', placeholder: 'Napiš název filmu…', sort: { by: 'y' } },
        { key: 'animovane', label: 'Animované filmy', one: 'animovaný film', icon: 'wand-sparkles', question: 'Který animovaný film to je?', placeholder: 'Napiš název filmu…', sort: { by: 'y' } },
        { key: 'serialy', label: 'Seriály', one: 'seriál', icon: 'popcorn', question: 'Který seriál to je?', placeholder: 'Napiš název seriálu…', sort: { by: 'y' } },
        { key: 'reziseri', label: 'Režiséři', one: 'režisér', icon: 'video', ...PERSON },
        { key: 'herci', label: 'Herci a herečky', one: 'herec', icon: 'drama', ...PERSON },
        { key: 'porady', label: 'Televizní pořady', one: 'pořad', icon: 'mic-vocal', question: 'Který pořad to je?', placeholder: 'Napiš název pořadu…', sort: { by: 'y' } },
        { key: 'vecernicky', label: 'Večerníčky', one: 'večerníček', icon: 'moon', question: 'Který večerníček to je?', placeholder: 'Napiš název večerníčku…', sort: { by: 'y' } },
        { key: 'komiksy', label: 'Komiksy a anime', one: 'komiks', icon: 'zap', question: 'Co je to?', placeholder: 'Napiš název nebo jméno…', sort: { by: 'y' } }
    ];
    // Film i animovaný film (otázky na režii a desetiletí premiéry); seriál, večerníček a televizní pořad mají vysílání, stanici
    // a otázku na tvůrce (u pořadu na moderátora)
    const isFilm = (item) => item.c === 'filmy' || item.c === 'animovane';
    const SERIES_LIKE = new Set(['serialy', 'vecernicky', 'porady']);
    const isSeries = (item) => SERIES_LIKE.has(item.c);
    // Komiksy a anime: postavy a týmy (Superman, X-Men, Pikachu) a díla (komiksové série a stripy, manga, anime seriály)
    const isComic = (item) => item.c === 'komiksy';
    const isCharacter = (item) => isComic(item) && /postav|tým|klub/u.test(item.ty || '');
    const isWork = (item) => isFilm(item) || isSeries(item) || isComic(item);
    // Stejný druh díla (nesprávné možnosti, nápověda „ve stejné době“): filmy s filmy, jinak stejná kategorie, postavy s postavami
    const sameKind = (a, b) => isFilm(a) ? isFilm(b) : a.c === b.c && isCharacter(a) === isCharacter(b);

    // Jak často se u filmu ptáme na režiséra a na desetiletí premiéry (jinak na název)
    const DIRECTOR_QUIZ_SHARE = 0.25;
    const DECADE_QUIZ_SHARE = 0.2;
    // U animovaného filmu režie, studio a desetiletí, u seriálu tvůrce a desetiletí začátku vysílání (hranice podílů)
    const ANIMATED_SHARES = { director: 0.2, studio: 0.4, decade: 0.6 };
    const SERIES_SHARES = { creator: 0.25, decade: 0.45 };
    // U komiksu a anime tvůrce a desetiletí prvního vydání (prvního výskytu postavy)
    const COMIC_SHARES = { creator: 0.25, decade: 0.45 };
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
            const surnames = items.filter(other => !isWork(other)).map(other => [other.q, surnameOf(other.n)]).filter(([, surname]) => surname);
            // (core.fuzzyTwins = porovnání každého s každým přes isAnswerMatch, jen bez dvojic, které se splést nemohou)
            const twins = core.fuzzyTwins(surnames);
            surnameCache.set(items, new Set(surnames.filter(([qid, surname]) => surname.length >= 3 && !twins.has(qid)).map(([qid]) => qid)));
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
                if (!isWork(other) || !other.n.includes(': ')) continue;
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
    // Roky vysílání seriálu: „1977–1981“, běžící „od 2016“
    // (u večerníčku bez konce jen rok začátku – večerníčky mají omezený počet dílů, „od 1975“ by vypadalo, že se točí dál)
    const airedLabel = (f, item) => f.end !== undefined ? `${f.year}–${f.end}` : item && item.c === 'vecernicky' ? String(f.year) : `od ${f.year}`;
    const seasonsLabel = (count) => `${count} ${count === 1 ? 'řada' : count < 5 ? 'řady' : 'řad'}`;
    const episodesLabel = (count) => `${count} ${count === 1 ? 'díl' : count < 5 ? 'díly' : 'dílů'}`;
    const authorLabel = (f) => f.byk === 'scénář' ? 'Scénář' : f.byk === 'předloha' ? 'Předloha' : 'Tvůrce';
    // Lidé seriálu: herci, u animovaného večerníčku hlasy (vypravěč), u pořadu moderátoři
    const peopleOf = (item) => {
        const f = item.f || {};
        if (item.c === 'porady') return { label: 'Moderace', hint: 'moderace', icon: 'mic-vocal', list: f.host || [] };
        if (item.c === 'vecernicky' && item.ty !== 'hraný seriál') return { label: (f.cast || []).length > 1 ? 'Hlasy' : 'Hlas', hint: 'hlasy', icon: 'users', list: f.cast || [] };
        if (isComic(item)) return { label: 'Hlasy', hint: 'hlasy', icon: 'users', list: f.cast || [] };
        return { label: 'Hrají', hint: 'hrají', icon: 'users', list: f.cast || [] };
    };
    const rozsah = (f) => [f.seasons > 1 ? seasonsLabel(f.seasons) : '', f.eps ? episodesLabel(f.eps) : ''].filter(Boolean).join(', ');
    // Tvůrci komiksu nebo postavy (u anime seriálu přesunutého ze seriálů jeden tvůrce)
    const creatorsOf = (item) => [].concat((item.f || {}).by || []);
    // Rok komiksu: první výskyt postavy, první vydání díla, u anime seriálu vysílání
    const comicYearFact = (item) => {
        const f = item.f || {};
        if (item.ty === 'anime seriál') return { label: 'Vysílání', value: airedLabel(f) };
        if (!isCharacter(item) && f.end !== undefined) return { label: 'Vydávání', value: `${f.year}–${f.end}` };
        return { label: 'Poprvé', value: String(f.year) };
    };
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (isSeries(item)) {
            const facts = [];
            if (mode !== 'decade' && f.year !== undefined) facts.push({ label: 'Vysílání', value: airedLabel(f, item) });
            // Žánr pořadu je jeho druh (vidět u otázky), mezi fakty by se opakoval
            if (f.gen && list(f.gen) !== item.ty) facts.push({ label: 'Žánr', value: list(f.gen) });
            if (f.land) facts.push({ label: 'Země', value: list(f.land) });
            if (f.bw) facts.push({ label: 'Obraz', value: 'černobílý' });
            if (f.seasons > 1 || f.eps) facts.push({ label: 'Rozsah', value: rozsah(f) });
            if (f.net && mode !== 'decade') facts.push({ label: item.c === 'porady' ? 'Stanice' : 'Vysílala', value: list(f.net) });
            // Tvůrce, režie a herci (hlasy, moderátoři) jsou samostatné nápovědy, mezi fakty až po odpovědi
            if (answered && f.by) facts.push({ label: authorLabel(f), value: f.by });
            if (answered && f.dir && item.c === 'vecernicky') facts.push({ label: 'Režie', value: list(f.dir) });
            const people = peopleOf(item);
            if (answered && people.list.length) facts.push({ label: people.label, value: list(people.list) });
            return facts;
        }
        if (isComic(item)) {
            const facts = [];
            if (mode !== 'decade' && f.year !== undefined) facts.push(comicYearFact(item));
            if (f.gen) facts.push({ label: 'Žánr', value: list(f.gen) });
            if (f.land) facts.push({ label: 'Země', value: list(f.land) });
            if (f.pub) facts.push({ label: 'Vydavatel', value: f.pub });
            if (f.studio) facts.push({ label: 'Studio', value: f.studio });
            if (f.seasons > 1 || f.eps) facts.push({ label: 'Rozsah', value: rozsah(f) });
            if (f.net && mode !== 'decade') facts.push({ label: 'Vysílala', value: list(f.net) });
            // Tvůrci, vlastní jméno postavy a herci z filmů jsou samostatné nápovědy, mezi fakty až po odpovědi
            const creators = creatorsOf(item);
            if (answered && creators.length) facts.push({ label: creators.length > 1 ? 'Tvůrci' : 'Tvůrce', value: list(creators) });
            if (answered && f.real) facts.push({ label: 'Vlastním jménem', value: f.real });
            if (answered && f.act) facts.push({ label: 'Ve filmech', value: list(f.act) });
            if (answered && f.cast) facts.push({ label: 'Hlasy', value: list(f.cast) });
            return facts;
        }
        if (isFilm(item)) {
            const facts = [];
            if (mode !== 'decade' && f.year !== undefined) facts.push({ label: 'Rok', value: String(f.year) });
            if (f.gen) facts.push({ label: 'Žánr', value: list(f.gen) });
            if (f.land) facts.push({ label: 'Země', value: list(f.land) });
            if (mode !== 'decade' && f.len) facts.push({ label: 'Délka', value: `${f.len} min` });
            if (f.osc) facts.push({ label: 'Oscar', value: 'za nejlepší film' });
            if (f.studio && mode !== 'studio') facts.push({ label: 'Studio', value: f.studio });
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
        [1932, 'první festival v Benátkách', 1], [1935, 'první barevné filmy Technicolor', 1], [1939, 'začátek 2. světové války', 0],
        [1945, 'konec 2. světové války', 0], [1946, 'první festival v Cannes', 1], [1953, 'nástup širokoúhlého filmu', 1],
        [1959, 'francouzská nová vlna', 1], [1963, 'atentát na Kennedyho', 0], [1969, 'přistání na Měsíci', 0], [1980, 'nástup videokazet', 1],
        [1989, 'pád Berlínské zdi', 0], [1995, 'první počítačově animovaný film', 1], [1997, 'nástup DVD', 1], [2001, 'útoky 11. září', 0],
        [2007, 'nástup streamování filmů', 1], [2009, 'nástup 3D kin', 1], [2020, 'zavřená kina kvůli covidu', 0]
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
        if (isWork(item)) return f.year !== undefined ? { type: 'timeline', spans: [], points: [f.year], hide: item.n, anchors: anchorsFor(item) } : null;
        if (f.born === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to: f.died ?? Math.min(THIS_YEAR, f.born + 100) }], points: [], hide: item.n, anchors: anchorsFor(item) };
    };

    // Osa bez letopočtů (u otázky na desetiletí) jen tehdy, když na ní jsou aspoň dvě známé události
    const blindTimelineOf = (item) => {
        const spec = timelineOf(item);
        if (!spec) return null;
        const blind = { ...spec, blind: true, name: 'osa bez letopočtů', icon: 'calendar-range' };
        return core.buildTimeline(blind, 340).anchors.length >= 2 ? blind : null;
    };

    // --- Nesprávné možnosti ---
    const AMERICA = new Set(['USA', 'Kanada', 'Spojené státy americké']);
    const bornCloseness = (a, b) => Math.max(0, 6 - Math.abs(((a.f || {}).born ?? Infinity) - ((b.f || {}).born ?? -Infinity)) / 10);
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
        const score = (other) => personScore(director, other) + (other.k === director.k ? 1 : 0) + core.cultureScore(director, other);
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
    // Otázka na desetiletí podle druhu: film premiéra, seriál, večerníček, pořad a anime začátek vysílání, komiks první vydání,
    // postava první výskyt
    const DECADE_TITLES = { 'postavy': 'Ve kterém desetiletí se postavy poprvé objevily?', 'postava': 'Ve kterém desetiletí se postava poprvé objevila?', 'tým': 'Ve kterém desetiletí tým vznikl?',
        'klub': 'Ve kterém desetiletí klub vznikl?', 'manga': 'Ve kterém desetiletí začala manga vycházet?' };
    const decadeTitle = (item) => {
        if (isSeries(item) || item.ty === 'anime seriál') return 'Ve kterém desetiletí se začal vysílat?';
        if (!isComic(item)) return 'Ve kterém desetiletí měl premiéru?';
        const key = Object.keys(DECADE_TITLES).find(word => (item.ty || '').includes(word));
        return key ? DECADE_TITLES[key] : 'Ve kterém desetiletí začal komiks vycházet?';
    };
    const decadeQuestion = (item, rng) => {
        const f = item.f || {};
        const title = decadeTitle(item);
        // Jen jisté desetiletí (premiéra ani natáčení nejsou na přelomu) a název bez letopočtu
        if (!f.dq || f.year === undefined || f.year < 1900 || /\d{4}/.test(item.n)) return null;
        const decade = decadeOf(f.year);
        const last = decadeOf(THIS_YEAR);
        const wrong = [...shuffle([-10, 10], rng), ...shuffle([-20, 20], rng), ...shuffle([-30, 30], rng)]
            .map(offset => decade + offset).filter(other => other >= 1890 && other <= last).slice(0, 3);
        return {
            type: 'decade',
            title,
            showName: true,
            choices: shuffle([decade, ...wrong], rng).map(other => ({ id: `desetileti-${other}`, label: decadeLabel(other), correct: other === decade })),
            accepted: decadeAnswers(decade),
            match: 'symbol',
            placeholder: 'Napiš desetiletí, třeba 60. léta',
            answerLabel: decadeLabel(decade)
        };
    };
    // Známé filmy (u seriálu seriály) z let kolem premiéry (bez letopočtu v názvu) – nápověda k desetiletí
    const contemporaries = (item, ctx) => {
        const f = item.f || {};
        return (ctx.items || []).filter(other => isWork(other) && sameKind(item, other) && other.q !== item.q && other.k === 1 && !/\d/.test(other.n)
            && Math.abs(((other.f || {}).year ?? Infinity) - f.year) <= 2)
            .sort((a, b) => ((b.cz === 1) === (item.cz === 1) ? 1 : 0) - ((a.cz === 1) === (item.cz === 1) ? 1 : 0)
                || Math.abs(a.f.year - f.year) - Math.abs(b.f.year - f.year))
            .slice(0, 3).map(other => other.n);
    };

    // Tvůrce seriálu (u českých seriálů bez tvůrce autor scénáře): nesprávné možnosti jsou tvůrci podobných seriálů
    // (stejná doba, země a druh), psát jde i samotné příjmení, když ho nemá jiný tvůrce
    const seriesScore = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        return yearCloseness(f.year, g.year) + ((f.land || [])[0] && (f.land || [])[0] === (g.land || [])[0] ? 2 : 0)
            + ((item.cz === 1) === (other.cz === 1) ? 3 : -3) + (item.ty === other.ty ? 2 : 0) + (item.k === other.k ? 1 : 0);
    };
    const creatorSurname = (name) => {
        const words = String(name || '').split(' ');
        return words.length >= 2 && words[words.length - 1].length >= 3 ? words[words.length - 1] : null;
    };
    // Všechna jména tvůrců a moderátorů v kategorii (příjmení jako psaná odpověď jen tehdy, když ho nemá nikdo jiný)
    const peopleNames = (other) => isComic(other) ? creatorsOf(other) : other.c === 'porady' ? (other.f.host || []) : [].concat(other.f.by || []);
    const creatorAnswers = (name, ctx, category = 'serialy') => {
        const surname = creatorSurname(name);
        const shared = surname && ((ctx && ctx.items) || []).some(other => other.c === category && peopleNames(other).some(otherName => otherName !== name
            && normalizeAnswer(creatorSurname(otherName) || '') === normalizeAnswer(surname)));
        return [name, ...(surname && !shared ? [surname] : [])];
    };
    // Jméno (tvůrce, moderátora) v názvu by odpověď prozradilo: Columbo, Show Jana Krause
    const revealsName = (item, names) => [].concat(names).some(name => censorName(item.n, name).includes('[***]')
        || core.factRevealsAnswer({ label: '', value: name }, [item.n]));
    const CREATOR_TITLES = {
        serialy: { 'scénář': 'Kdo napsal scénář seriálu?', 'tvůrce': 'Kdo seriál vytvořil?' },
        vecernicky: { 'scénář': 'Kdo napsal scénář večerníčku?', 'předloha': 'Kdo napsal předlohu večerníčku?', 'tvůrce': 'Kdo večerníček vytvořil?' }
    };
    const creatorQuestion = (item, ctx, rng) => {
        const f = item.f || {};
        if (!f.by || !ctx.items || revealsName(item, f.by)) return null;
        // Seriál: tvůrci (scenáristé) jiných seriálů; večerníček: autoři jiných večerníčků (předloha, scénář i tvůrce)
        const candidates = ctx.items.filter(other => other.c === item.c && other.q !== item.q && other.f.by && (item.c !== 'serialy' || other.f.byk === f.byk)
            && normalizeAnswer(other.f.by) !== normalizeAnswer(f.by));
        const wrong = takeDistinct(rankBySimilarity(candidates, other => seriesScore(item, other), rng), 3, new Set([normalizeAnswer(f.by)]), other => other.f.by).map(other => other.f.by);
        if (wrong.length < 3) return null;
        const titles = CREATOR_TITLES[item.c] || CREATOR_TITLES.serialy;
        return {
            type: 'creator',
            title: titles[f.byk] || titles['tvůrce'],
            showName: true,
            choices: shuffle([f.by, ...wrong], rng).map(name => ({ id: `tvurce-${name}`, label: name, correct: name === f.by })),
            accepted: creatorAnswers(f.by, ctx, item.c),
            placeholder: 'Napiš jméno…',
            answerLabel: f.by
        };
    };
    // Další seriály (večerníčky) téhož tvůrce (nápověda k otázce na tvůrce)
    const otherSeriesOf = (item, ctx) => (ctx.items || []).filter(other => other.c === item.c && other.q !== item.q && other.f.by === item.f.by).slice(0, 2).map(other => other.n);

    // Moderátor pořadu: nesprávné možnosti jsou moderátoři podobných pořadů (stejná doba, země a druh), ne další moderátoři téhož pořadu
    const hostQuestion = (item, ctx, rng) => {
        const hosts = (item.f || {}).host || [];
        if (!hosts.length || !ctx.items || revealsName(item, hosts)) return null;
        const own = new Set(hosts.map(normalizeAnswer));
        const candidates = ctx.items.filter(other => other.c === 'porady' && other.q !== item.q && (other.f.host || []).length && !other.f.host.some(name => own.has(normalizeAnswer(name))));
        const wrong = takeDistinct(rankBySimilarity(candidates, other => seriesScore(item, other), rng), 3, new Set(own), other => other.f.host[0]).map(other => other.f.host[0]);
        if (wrong.length < 3) return null;
        return {
            type: 'host',
            title: 'Kdo pořad moderoval?',
            showName: true,
            choices: shuffle([hosts[0], ...wrong], rng).map(name => ({ id: `moderator-${name}`, label: name, correct: name === hosts[0] })),
            accepted: [...new Set(hosts.flatMap(name => creatorAnswers(name, ctx, 'porady')))],
            placeholder: 'Napiš jméno…',
            answerLabel: hosts[0]
        };
    };
    const otherShowsOf = (item, ctx) => {
        const own = new Set(((item.f || {}).host || []).map(normalizeAnswer));
        return (ctx.items || []).filter(other => other.c === 'porady' && other.q !== item.q && (other.f.host || []).some(name => own.has(normalizeAnswer(name))) && !revealsName(other, other.f.host))
            .slice(0, 2).map(other => other.n);
    };

    // --- Komiksy a anime ---
    // Podobnost: postava k postavě a dílo k dílu (druh je vidět u otázky), stejný vydavatel, země a doba, české k českým
    const comicScore = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        return (isCharacter(item) === isCharacter(other) ? 0 : -20) + (f.pub && f.pub === g.pub ? 3 : 0) + ((f.land || [])[0] && (f.land || [])[0] === (g.land || [])[0] ? 2 : 0)
            + yearCloseness(f.year, g.year) + ((item.cz === 1) === (other.cz === 1) ? 3 : -3) + ((item.sx === 'f') === (other.sx === 'f') ? 1 : 0)
            - (creatorsOf(item).some(name => creatorsOf(other).includes(name)) ? 2 : 0);
    };
    const CREATOR_COMIC_TITLES = [['tým', 'Kdo tým vytvořil?'], ['klub', 'Kdo klub vymyslel?'], ['postav', 'Kdo postavu vytvořil?'], ['manga', 'Kdo mangu vytvořil?'],
        ['anime', 'Kdo seriál vytvořil?']];
    const comicCreatorTitle = (item) => (CREATOR_COMIC_TITLES.find(([word]) => (item.ty || '').includes(word)) || [null, 'Kdo komiks vytvořil?'])[1];
    // Tvůrce komiksu nebo postavy: správná je první ze jmen (Stan Lee u Spider-Mana), nesprávné jsou tvůrci jiných komiksů,
    // nikdy spolutvůrce (Steve Ditko); psát jde kterékoli ze jmen
    const comicCreatorQuestion = (item, ctx, rng) => {
        const own = creatorsOf(item);
        if (!own.length || !ctx.items || revealsName(item, own)) return null;
        const ownKeys = new Set(own.map(normalizeAnswer));
        const candidates = ctx.items.filter(other => isComic(other) && other.q !== item.q && creatorsOf(other).length && !creatorsOf(other).some(name => ownKeys.has(normalizeAnswer(name))));
        const wrong = takeDistinct(rankBySimilarity(candidates, other => comicScore(item, other), rng), 3, new Set(ownKeys), other => creatorsOf(other)[0]).map(other => creatorsOf(other)[0]);
        if (wrong.length < 3) return null;
        return {
            type: 'creator',
            title: comicCreatorTitle(item),
            showName: true,
            choices: shuffle([own[0], ...wrong], rng).map(name => ({ id: `tvurce-${name}`, label: name, correct: name === own[0] })),
            accepted: [...new Set(own.flatMap(name => creatorAnswers(name, ctx, 'komiksy')))],
            placeholder: 'Napiš jméno…',
            answerLabel: own[0]
        };
    };
    // Další komiksy a postavy téhož tvůrce (nápověda k otázce na tvůrce)
    const otherComicsOf = (item, ctx) => {
        const own = new Set(creatorsOf(item).map(normalizeAnswer));
        return (ctx.items || []).filter(other => isComic(other) && other.q !== item.q && creatorsOf(other).some(name => own.has(normalizeAnswer(name))) && other.k === 1)
            .slice(0, 2).map(other => other.n);
    };
    // Nápovědy ke komiksu: o komiksu (rok, země, vydavatel) → tvůrci → vlastní jméno a herci z filmů (u postavy);
    // u otázky na tvůrce jeho další komiksy, u desetiletí známé komiksy (postavy) z té doby
    const comicHints = (item, ctx, type) => {
        const f = item.f || {};
        const creators = creatorsOf(item);
        const creatorHint = { kind: 'facts', label: creators.length > 1 ? 'tvůrci' : 'tvůrce', icon: 'pen-line',
            facts: creators.length && !revealsName(item, creators) ? [{ label: creators.length > 1 ? 'Tvůrci' : 'Tvůrce', value: list(creators) }] : [] };
        const personFacts = [...(f.real ? [{ label: 'Vlastním jménem', value: f.real }] : []), ...(f.act ? [{ label: 'Ve filmech', value: f.act.join(', ') }] : []),
            ...(f.cast ? [{ label: 'Hlasy', value: f.cast.slice(0, 3).join(', ') }] : [])].filter(fact => !revealsName(item, fact.value));
        const personLabel = !isCharacter(item) ? 'hlasy' : f.real && f.act ? 'jméno a filmy' : f.real ? 'vlastní jméno' : 've filmech';
        const personHint = { kind: 'facts', label: personLabel, icon: 'users', facts: personFacts };
        if (type === 'creator') {
            const others = otherComicsOf(item, ctx);
            return [
                { kind: 'facts', label: 'o komiksu', icon: 'zap', facts: factsOf(item, 'creator') },
                personHint,
                { kind: 'facts', label: 'další díla', icon: 'book-open', facts: others.length ? [{ label: 'Další díla', value: others.join(', ') }] : [] }
            ];
        }
        if (type === 'decade') {
            const same = contemporaries(item, ctx);
            return [
                { kind: 'facts', label: 'země a vydavatel', icon: 'zap', facts: factsOf(item, 'decade') },
                { kind: 'visual', spec: blindTimelineOf(item) },
                creatorHint,
                personHint,
                { kind: 'facts', label: 've stejné době', icon: 'calendar-range', facts: same.length ? [{ label: 'Ve stejné době', value: same.join(', ') }] : [] }
            ];
        }
        return [{ kind: 'facts', facts: factsOf(item, 'name') }, creatorHint, personHint];
    };

    // Studio animovaného filmu: nesprávné možnosti jsou studia, která točila ve stejné době (k Pixaru DreamWorks a Blue Sky, ne Disney –
    // filmy Pixaru vydával Disney, byla by to druhá správná odpověď)
    const STUDIO_CLASHES = { Pixar: ['Walt Disney'], 'Walt Disney': ['Pixar'] };
    const STUDIO_ALIASES = { 'Walt Disney': ['Disney', 'Walt Disney Pictures'], 'Studio Ghibli': ['Ghibli'], 'Blue Sky Studios': ['Blue Sky'], 'Toei Animation': ['Toei'],
        'Sony Pictures Animation': ['Sony'], 'Warner Bros.': ['Warner'], DreamWorks: ['DreamWorks Animation'], 'Krátký film Praha': ['Krátký film'] };
    const STUDIO_WORDS = ['Walt Disney', 'Disney', 'Pixar', 'DreamWorks', 'Studio Ghibli', 'Ghibli', 'Illumination', 'Blue Sky', 'Aardman', 'Laika',
        'Sony Pictures', 'Warner', 'Toei', 'Krátký film'];
    const studioQuestion = (item, ctx, rng) => {
        const f = item.f || {};
        if (!f.studio || !ctx.items) return null;
        const films = ctx.items.filter(other => other.c === 'animovane' && other.f.studio);
        const studios = [...new Set(films.map(other => other.f.studio))].filter(studio => studio !== f.studio && !(STUDIO_CLASHES[f.studio] || []).includes(studio));
        // Nejbližší film studia rokem; studio ze stejné země (japonské k japonskému)
        const closeness = (studio) => {
            const own = films.filter(other => other.f.studio === studio);
            const nearest = Math.min(...own.map(other => Math.abs((other.f.year ?? 0) - (f.year ?? 0))));
            const sameLand = own.some(other => (other.f.land || [])[0] === (f.land || [])[0]);
            return (nearest <= 5 ? 3 : nearest <= 15 ? 2 : nearest <= 30 ? 1 : 0) + (sameLand ? 2 : 0) + rng();
        };
        const wrong = studios.map(studio => [studio, closeness(studio)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([studio]) => studio);
        // Studio v názvu filmu (Disneyho …) by odpověď prozradilo
        if (wrong.length < 3 || censorName(item.n, STUDIO_WORDS.join(', ')).includes('[***]')) return null;
        return {
            type: 'studio',
            title: 'Které studio film natočilo?',
            showName: true,
            choices: shuffle([f.studio, ...wrong], rng).map(studio => ({ id: `studio-${studio}`, label: studio, correct: studio === f.studio })),
            accepted: [f.studio, ...(STUDIO_ALIASES[f.studio] || [])],
            placeholder: 'Napiš studio, třeba Pixar',
            answerLabel: f.studio
        };
    };
    const otherStudioFilms = (item, ctx) => (ctx.items || []).filter(other => other.c === 'animovane' && other.q !== item.q && other.f.studio === item.f.studio && other.k === 1)
        .slice(0, 2).map(other => other.n);

    // Nápovědy k seriálu: o seriálu (vysílání, žánr, země, rozsah, stanice) → herci → tvůrce; u otázky na tvůrce jeho další seriály,
    // u desetiletí známé seriály z té doby
    // Popisky nápověd podle kategorie: o seriálu / večerníčku / pořadu, další seriály / večerníčky / pořady
    const SERIES_WORDS = {
        serialy: { about: 'o seriálu', others: 'další seriály', Others: 'Další seriály', icon: 'popcorn' },
        vecernicky: { about: 'o večerníčku', others: 'další večerníčky', Others: 'Další večerníčky', icon: 'moon' },
        porady: { about: 'o pořadu', others: 'další pořady', Others: 'Další pořady', icon: 'mic-vocal' }
    };
    const seriesHints = (item, ctx, type) => {
        const f = item.f || {};
        const words = SERIES_WORDS[item.c] || SERIES_WORDS.serialy;
        const people = peopleOf(item);
        const shown = people.list.slice(0, 3).join(', ');
        const castHint = { kind: 'facts', label: people.hint, icon: people.icon, facts: shown && !revealsName(item, people.list.slice(0, 3)) ? [{ label: people.label, value: shown }] : [] };
        // U večerníčku je autor i režie (Václav Čtvrtek, Zdeněk Smetana); bez autora jen režie
        const authorFacts = [...(f.by ? [{ label: authorLabel(f), value: f.by }] : []), ...(item.c === 'vecernicky' && f.dir ? [{ label: 'Režie', value: list(f.dir) }] : [])];
        const authorHint = { kind: 'facts', label: f.byk === 'scénář' ? 'scénář' : f.byk === 'předloha' ? 'předloha' : !f.by && item.c === 'vecernicky' ? 'režie' : 'tvůrce', icon: 'pen-line', facts: authorFacts };
        if (type === 'host') {
            const others = otherShowsOf(item, ctx);
            return [
                { kind: 'facts', label: words.about, icon: words.icon, facts: factsOf(item, 'host') },
                { kind: 'facts', label: words.others, icon: 'clapperboard', facts: others.length ? [{ label: words.Others, value: others.join(', ') }] : [] }
            ];
        }
        if (type === 'creator') {
            const others = otherSeriesOf(item, ctx);
            return [
                { kind: 'facts', label: words.about, icon: words.icon, facts: factsOf(item, 'creator') },
                castHint,
                { kind: 'facts', label: words.others, icon: 'clapperboard', facts: others.length ? [{ label: words.Others, value: others.join(', ') }] : [] }
            ];
        }
        if (type === 'decade') {
            const same = contemporaries(item, ctx);
            return [
                { kind: 'facts', label: 'žánr a země', icon: words.icon, facts: factsOf(item, 'decade') },
                { kind: 'visual', spec: blindTimelineOf(item) },
                castHint,
                authorHint,
                { kind: 'facts', label: 've stejné době', icon: 'calendar-range', facts: same.length ? [{ label: 'Ve stejné době', value: same.join(', ') }] : [] }
            ];
        }
        return [{ kind: 'facts', facts: factsOf(item, 'name') }, castHint, authorHint];
    };

    const QUESTION_TITLES = [['postavy', 'Které postavy to jsou?'], ['postava', 'Která postava to je?'], ['tým', 'Který tým to je?'], ['klub', 'Který klub to je?'],
        ['manga', 'Která manga to je?'], ['anime', 'Které anime to je?']];

    // Hlavní obrázek osobnosti, který ji neukazuje (hrob, pamětní deska, známka; quiz-core.js offSubjectRule, npm run audit:obrazky)
    const offSubjectPhoto = core.offSubjectRule({ words: { herci: core.OFF_SUBJECT.memorial, reziseri: core.OFF_SUBJECT.memorial } });

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
            tierKnown: 'Slavné filmy, seriály, režiséři, herci, pořady a komiksy'
        },
        categories: CATEGORIES,
        offSubjectPhoto,

        // Nesprávné možnosti: filmy ze stejné země, doby a žánru (bez stejného režiséra – jinak by nápověda „režie“ nepomohla);
        // filmaři stejného pohlaví, doby a země, české k českým
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            if (!isWork(item)) return personScore(item, other);
            if (isComic(item)) return comicScore(item, other);
            if (isSeries(item)) return seriesScore(item, other) + ((f.gen || [])[0] && (g.gen || []).includes(f.gen[0]) ? 2 : 0) - (f.by && f.by === g.by ? 3 : 0);
            return yearCloseness(f.year, g.year) + ((f.land || [])[0] && (f.land || [])[0] === (g.land || [])[0] ? 2 : 0)
                + ((f.gen || [])[0] && (g.gen || []).includes(f.gen[0]) ? 2 : 0) + ((item.cz === 1) === (other.cz === 1) ? 2 : 0)
                - ((f.dir || []).some(name => (g.dir || []).includes(name)) ? 3 : 0);
        },
        nameAliases: (item, ctx) => isWork(item) ? filmAliases(item, ctx) : personAliases(item, ctx),

        // U filmu občas „Kdo film režíroval?“ (jen u jediného režiséra z dat) nebo „Ve kterém desetiletí měl premiéru?“,
        // u animovaného filmu i „Které studio film natočilo?“, u seriálu „Kdo seriál vytvořil?“ a desetiletí začátku vysílání
        specialQuestion: (item, ctx, rng) => {
            if (isSeries(item)) {
                const roll = rng();
                if (roll < SERIES_SHARES.creator) return item.c === 'porady' ? hostQuestion(item, ctx, rng) : creatorQuestion(item, ctx, rng);
                if (roll < SERIES_SHARES.decade) return decadeQuestion(item, rng);
                return null;
            }
            // Komiks a anime: „Kdo postavu vytvořil?“, „Ve kterém desetiletí se postava poprvé objevila?“
            if (isComic(item)) {
                const roll = rng();
                if (roll < COMIC_SHARES.creator) return comicCreatorQuestion(item, ctx, rng);
                if (roll < COMIC_SHARES.decade) return decadeQuestion(item, rng);
                return null;
            }
            if (item.c === 'animovane') {
                const roll = rng();
                if (roll < ANIMATED_SHARES.director) return directorQuestion(item, ctx, rng);
                if (roll < ANIMATED_SHARES.studio) return studioQuestion(item, ctx, rng);
                if (roll < ANIMATED_SHARES.decade) return decadeQuestion(item, rng);
                return null;
            }
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
            if (isSeries(item)) return seriesHints(item, ctx, type);
            if (isComic(item)) return comicHints(item, ctx, type);
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
            if (type === 'studio') {
                const others = otherStudioFilms(item, ctx);
                return [
                    { kind: 'facts', label: 'o filmu', icon: 'film', facts: factsOf(item, 'studio').filter(fact => fact.label !== 'Délka') },
                    castHint,
                    directionHint,
                    { kind: 'facts', label: 'další filmy', icon: 'clapperboard', facts: others.length ? [{ label: 'Další filmy', value: others.join(', ') }] : [] }
                ];
            }
            if (type === 'decade') {
                const same = contemporaries(item, ctx);
                return [
                    { kind: 'facts', label: 'žánr a země', icon: 'film', facts: factsOf(item, 'decade').filter(fact => fact.label !== 'Oscar') },
                    // Osa bez letopočtů: jen známé události před a po filmu
                    { kind: 'visual', spec: blindTimelineOf(item) },
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
            if (type === 'creator' && isComic(item)) return censorName(text, creatorsOf(item).flatMap(name => creatorAnswers(name, ctx, 'komiksy')).join(', '));
            if (type === 'creator' && item.f && item.f.by) return censorName(text, creatorAnswers(item.f.by, ctx, item.c).join(', '));
            if (type === 'host') return censorName(text, (item.f.host || []).flatMap(name => creatorAnswers(name, ctx, 'porady')).join(', '));
            if (type === 'studio') return censorName(text, STUDIO_WORDS.join(', '));
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
        visual: (item, ctx, mode) => !isWork(item) || mode === 'result' || mode === 'card' ? timelineOf(item) : null,
        facts: (item, ctx, mode) => factsOf(item, mode),
        // Otázka podle druhu: postava, tým, manga, anime, komiks (kategorie Komiksy a anime je smíšená)
        questionTitle: (item) => isComic(item) ? (QUESTION_TITLES.find(([word]) => (item.ty || '').includes(word)) || [null, 'Který komiks to je?'])[1] : null,
        subtitle: (item) => {
            const f = item.f || {};
            if (isComic(item)) return [f.year, f.pub || (f.land || [])[0]].filter(Boolean).join(' · ');
            if (isSeries(item)) return [f.year !== undefined ? airedLabel(f, item) : '', (f.land || [])[0]].filter(Boolean).join(' · ');
            if (isFilm(item)) return [f.year, (f.dir || [])[0]].filter(Boolean).join(' · ');
            const life = f.died !== undefined ? `${formatYear(f.born)}–${formatYear(f.died)}` : `nar. ${formatYear(f.born)}`;
            return [life, f.land].filter(Boolean).join(' · ');
        },
        isCzech: (item) => item.cz === 1
    };
});
