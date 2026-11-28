// Téma Technika a vynálezy: vynálezci a průkopníci, vynálezy a stroje, auta a automobilky, vlaky a tramvaje, letadla, lodě,
// počítače a elektronika, internet a software, elektrárny, letiště a metra a slavné firmy (data/technika.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatNumber, formatYear, censorName, censorCountry, mergeCensored, stripBrackets, shuffle, normalizeAnswer, isAnswerMatch,
        personSimilarity, rankBySimilarity, takeDistinct, eraNearness, nameAnswers, getCountryNames
    } = core;

    const CATEGORIES = [
        { key: 'vynalezci', label: 'Vynálezci a průkopníci', one: 'vynálezce', icon: 'user', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'born' } },
        { key: 'vynalezy', label: 'Vynálezy a stroje', one: 'vynález', icon: 'lightbulb', question: 'Co je to?', placeholder: 'Napiš, co to je…', sort: { by: 'name' } },
        { key: 'auta', label: 'Auta a automobilky', one: 'auto', icon: 'car', question: 'Co je to za auto?', placeholder: 'Napiš značku a model…', sort: { by: 'name' } },
        { key: 'vlaky', label: 'Vlaky a tramvaje', one: 'vlak', icon: 'train-front', question: 'Co je to za vlak?', placeholder: 'Napiš vlak nebo řadu…', sort: { by: 'y' } },
        { key: 'letadla', label: 'Letadla a vzducholodě', one: 'letadlo', icon: 'plane', question: 'Co je to za letadlo?', placeholder: 'Napiš letadlo…', sort: { by: 'y' } },
        { key: 'lode', label: 'Lodě a ponorky', one: 'loď', icon: 'ship', question: 'Která loď to je?', placeholder: 'Napiš jméno lodi…', sort: { by: 'y' } },
        { key: 'elektronika', label: 'Počítače a elektronika', one: 'přístroj', icon: 'cpu', question: 'Co je to za přístroj?', placeholder: 'Napiš přístroj…', sort: { by: 'y' } },
        { key: 'software', label: 'Internet a software', one: 'program', icon: 'code', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'stavby', label: 'Elektrárny, letiště a metra', one: 'technická stavba', icon: 'factory', question: 'Co je to za stavbu?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'firmy', label: 'Slavné firmy', one: 'firma', icon: 'building-2', question: 'Která firma to je?', placeholder: 'Napiš firmu…', sort: { by: 'name' } }
    ];

    // Zadání podle druhu (štítek ty): letiště mezi elektrárnami nebo automobilka mezi modely by byly poznat hned, proto mají
    // druhy s vlastním zadáním mezi možnostmi jen sebe (similarity)
    const KIND_TITLES = {
        automobilka: 'Která automobilka to je?', tramvaj: 'Co je to za tramvaj?', 'železniční trať': 'Která železniční trať to je?',
        'parní lokomotiva': 'Co je to za lokomotivu?', 'elektrická lokomotiva': 'Co je to za lokomotivu?', 'motorová lokomotiva': 'Co je to za lokomotivu?', lokomotiva: 'Co je to za lokomotivu?',
        vrtulník: 'Co je to za vrtulník?', vzducholoď: 'Která vzducholoď to je?', ponorka: 'Která ponorka to je?',
        'herní konzole': 'Která herní konzole to je?', 'kapesní herní konzole': 'Která herní konzole to je?', 'mobilní telefon': 'Který telefon to je?', 'chytrý telefon': 'Který telefon to je?',
        počítač: 'Který počítač to je?', 'programovací jazyk': 'Který programovací jazyk to je?', 'operační systém': 'Který operační systém to je?',
        'webový prohlížeč': 'Který webový prohlížeč to je?', 'sociální síť': 'Která sociální síť to je?', letiště: 'Které letiště to je?', metro: 'Které metro to je?',
        'jaderná elektrárna': 'Která elektrárna to je?', 'vodní elektrárna': 'Která elektrárna to je?', 'tepelná elektrárna': 'Která elektrárna to je?',
        kosmodrom: 'Který kosmodrom to je?', tunel: 'Který tunel to je?'
    };
    const titleOfKind = (item) => KIND_TITLES[item.ty] || null;
    // Kategorie, kde je otázkou fotka (auto, vlak, letadlo, loď, přístroj, stroj); u osob, firem, softwaru a staveb je fotka nápovědou
    const PHOTO_QUESTION = new Set(['vynalezy', 'auta', 'vlaky', 'letadla', 'lode', 'elektronika']);
    // Fotka výrobku bývá v PNG (výřez bez pozadí): počítá se jako fotka, kresba, schéma či logo (SVG, „diagram“, „logo“) ne
    const isPhotoQuestion = (item) => PHOTO_QUESTION.has(item.c) && item.ty !== 'automobilka' && item.ty !== 'železniční trať' && Boolean(item.im && item.ih)
        && core.isRealPhoto(String(item.im).replace(/\.png$/i, '.jpg'));
    const isCompany = (item) => item.c === 'firmy' || item.ty === 'automobilka';

    // Jak často se ptáme na výrobce, zemi firmy a dobu vzniku
    const MAKER_QUIZ_SHARE = 0.25;
    const COUNTRY_QUIZ_SHARE = 0.35;
    const DECADE_QUIZ_SHARE = 0.2;
    const THIS_YEAR = new Date().getFullYear();

    // --- Rejstříky (po načtení dat se nemění) ---
    const indexes = new WeakMap();
    const indexOf = (ctx) => {
        const items = (ctx && ctx.items) || [];
        if (!indexes.has(items)) {
            const byName = new Map();
            for (const item of items) for (const name of [item.n, item.t]) if (name && !byName.has(normalizeAnswer(name))) byName.set(normalizeAnswer(name), item);
            // Příjmení osob a krátké názvy modelů (Octavia, Spitfire), které jsou v datech jen jednou: psaná odpověď je přijme
            const counts = new Map();
            const count = (word) => counts.set(normalizeAnswer(word), (counts.get(normalizeAnswer(word)) || 0) + 1);
            for (const item of items) for (const word of new Set(shortNames(item))) count(word);
            const fullNames = new Set(items.map(item => normalizeAnswer(item.n)));
            indexes.set(items, { byName, counts, fullNames });
        }
        return indexes.get(items);
    };
    // Kandidáti na zkrácenou psanou odpověď: příjmení osoby, u modelu název bez značky (Škoda Octavia → Octavia)
    const shortNames = (item) => {
        const words = String(item.n || '').replace(/\s*\([^)]*\)$/u, '').split(/\s+/u);
        if (item.c === 'vynalezci') return words.length > 1 ? [words[words.length - 1]] : [];
        if (['auta', 'letadla', 'elektronika', 'vlaky'].includes(item.c) && words.length === 2 && item.ty !== 'automobilka') return [words[1]];
        return [];
    };

    // --- Osoby: časová osa se světovými (u českých osob i českými) událostmi ---
    const WORLD_EVENTS = [
        [1453, 'pád Konstantinopole'], [1492, 'objevení Ameriky'], [1517, 'počátek reformace'], [1618, 'začátek třicetileté války'], [1776, 'nezávislost USA'],
        [1789, 'Velká francouzská revoluce'], [1815, 'bitva u Waterloo'], [1848, 'revoluce v Evropě'], [1861, 'občanská válka v USA'], [1914, 'začátek 1. světové války'],
        [1939, 'začátek 2. světové války'], [1945, 'konec 2. světové války'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi'], [2001, 'útoky 11. září'], [2020, 'pandemie covidu']
    ];
    const CZECH_EVENTS = [
        [1620, 'bitva na Bílé hoře'], [1781, 'zrušení nevolnictví'], [1848, 'zrušení roboty'], [1918, 'vznik Československa'], [1938, 'Mnichovská dohoda'],
        [1948, 'komunistický převrat'], [1968, 'pražské jaro'], [1989, 'sametová revoluce'], [1993, 'vznik České republiky']
    ];
    const anchorsFor = (item) => [...(item.cz === 1 ? CZECH_EVENTS.map(([year, text]) => [year, text, 1]) : []), ...WORLD_EVENTS];
    const lifeRange = (f) => f.born === undefined ? '' : f.died === undefined ? `* ${f.born}` : `${formatYear(f.born)}–${formatYear(f.died)}`;
    const personTimeline = (item) => {
        const f = item.f || {};
        if (f.born === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to: f.died ?? Math.min(f.born + 90, THIS_YEAR) }], points: [], hide: item.n, anchors: anchorsFor(item) };
    };
    // Příjmení osoby jako psaná odpověď (Edison, Křižík), jen když ho nemá jiná položka
    const nameAliasesOf = (item, ctx) => {
        const { counts, fullNames } = indexOf(ctx);
        return shortNames(item).filter(word => word.length >= 4 && !/\d/.test(word) && counts.get(normalizeAnswer(word)) === 1 && !fullNames.has(normalizeAnswer(word)));
    };

    // --- Fakta ---
    const YEAR_LABELS = { vynalezy: 'Vznik', auta: 'Výroba od', vlaky: 'V provozu od', letadla: 'První let', lode: 'Vznik', elektronika: 'Uvedení na trh', software: 'Vznik' };
    const MAKER_LABELS = { software: 'Vývojář', lode: 'Výrobce' };
    const countriesOf = (item, ctx) => getCountryNames(item, (ctx && ctx.countries) || {});
    const landFact = (item, ctx) => {
        const names = item.c === 'stavby' ? countriesOf(item, ctx) : [];
        const value = names.length ? names.join(', ') : (item.f || {}).land;
        return value ? { label: 'Země', value } : null;
    };
    const yearHidden = (mode) => mode === 'decade' || mode === 'century';
    const factsOf = (item, ctx, mode) => {
        const f = item.f || {};
        const full = mode === 'result' || mode === 'card';
        const facts = [];
        const add = (label, value) => { if (value !== undefined && value !== null && value !== '') facts.push({ label, value: String(value) }); };
        if (item.c === 'vynalezci') {
            // Roky života ukáže v nápovědě časová osa (fakt s rokem narození by ji zopakoval)
            if (full) add('Život', lifeRange(f));
            if (f.land) add('Země', f.land);
            add('Známé dílo', f.work);
            return facts;
        }
        if (item.c === 'stavby') {
            const land = landFact(item, ctx);
            if (land && mode !== 'location') facts.push(land);
            if (mode !== 'location') add('Místo', f.city);
            if (!yearHidden(mode)) add('Otevřeno', f.from !== undefined ? formatYear(f.from) : '');
            if (f.mw) add('Výkon', `${formatNumber(f.mw)} MW`);
            if (f.pax) add('Cestujících za rok', formatNumber(f.pax));
            add('Provozovatel', f.op);
            // Místo či provozovatel ve jménu stavby (Metro ve Vídni – Vídeň, Letiště Václava Havla Praha – Letiště Praha) by název prozradil
            return mode === 'name' ? facts.filter(fact => !['Místo', 'Provozovatel'].includes(fact.label) || !censorName(item.n, fact.value).includes('[***]')) : facts;
        }
        if (isCompany(item)) {
            if (mode !== 'location') add('Země', f.land);
            if (!yearHidden(mode)) add('Založení', f.from !== undefined ? formatYear(f.from) : '');
            add(f.fd && f.fd.includes(',') ? 'Zakladatelé' : 'Zakladatel', f.fd);
            if (mode !== 'location') add('Sídlo', f.hq);
            if (full && f.to !== undefined) add('Zánik', formatYear(f.to));
            // Zakladatel či sídlo ve jménu firmy (Bosch – Robert Bosch, Škoda Plzeň – Plzeň) by název prozradili
            const named = (value) => censorName(item.n, value).includes('[***]') || censorName(value, item.n).includes('[***]');
            return mode === 'name' ? facts.filter(fact => !['Sídlo', 'Zakladatel', 'Zakladatelé'].includes(fact.label) || !named(fact.value)) : facts;
        }
        // Výrobce se slovem z názvu (Škoda Auto u Škody Octavie, Dropbox, Inc.) by u otázky na název jen opakoval název
        if (mode !== 'maker' && !(f.mk && sharesWord(f.mk, item.n))) add(MAKER_LABELS[item.c] || 'Výrobce', f.mk);
        if (mode !== 'maker' || item.c !== 'auta') add('Země', f.land);
        if (!yearHidden(mode)) add(YEAR_LABELS[item.c] || 'Vznik', f.year !== undefined ? formatYear(f.year) : '');
        if (item.c === 'vynalezy') add('Vynálezce', f.by);
        if (f.speed) add('Nejvyšší rychlost', `${formatNumber(f.speed)} km/h`);
        if (f.len) add('Délka', `${formatNumber(f.len)} m`);
        if (f.built) add('Vyrobeno', `${formatNumber(f.built)} kusů`);
        if (full && f.end !== undefined && item.c === 'lode') add('Konec služby', formatYear(f.end));
        return facts;
    };
    const pick = (facts, labels) => facts.filter(fact => labels.includes(fact.label));
    const wordsOf = (text) => normalizeAnswer(text).split(' ').filter(word => word.length >= 3);
    const sharesWord = (a, b) => wordsOf(a).some(word => wordsOf(b).includes(word));

    // --- Výrobce: „Kdo to vyrobil?“ (PlayStation – Sony, Concorde, TGV), jen když název výrobce neprozradí ---
    const firstWord = (text) => normalizeAnswer(String(text || '').split(/[\s-]+/u)[0]);
    const makerItem = (name, ctx) => indexOf(ctx).byName.get(normalizeAnswer(name)) || null;
    const canAskMaker = (item) => ['vlaky', 'letadla', 'elektronika', 'software'].includes(item.c) && Boolean(item.f && item.f.mk)
        && !censorName(item.n, item.f.mk).includes('[***]') && !normalizeAnswer(item.n).includes(firstWord(item.f.mk));
    const makerQuestion = (item, ctx, rng) => {
        const f = item.f;
        const own = firstWord(f.mk);
        // Výrobci stejné kategorie, přednostně ze stejné země a doby; ne stejná firma pod jiným jménem (Sony × Sony Interactive)
        const candidates = ctx.items.filter(other => other.c === item.c && other.q !== item.q && other.f && other.f.mk && firstWord(other.f.mk) !== own);
        const score = (other) => (other.f.land && other.f.land === f.land ? 2 : 0) + eraNearness(f.y, other.f.y) + (other.ty === item.ty ? 1 : 0);
        const wrong = takeDistinct(rankBySimilarity(candidates, score, rng), 3, new Set([normalizeAnswer(f.mk)]), other => firstWord(other.f.mk)).map(other => other.f.mk);
        if (wrong.length < 3) return null;
        const idOf = (name) => (makerItem(name, ctx) || {}).q || `vyrobce-${normalizeAnswer(name).replace(/ /g, '-')}`;
        return {
            type: 'maker',
            title: item.c === 'software' ? 'Kdo to vyvinul?' : 'Kdo to vyrobil?',
            showName: true,
            choices: shuffle([f.mk, ...wrong], rng).map(name => ({ id: idOf(name), label: name, correct: name === f.mk })),
            accepted: [f.mk],
            placeholder: item.c === 'software' ? 'Napiš vývojáře…' : 'Napiš výrobce…',
            answerLabel: f.mk
        };
    };
    // Další výrobky téhož výrobce (nápověda u otázky na výrobce)
    const otherProducts = (item, ctx) => ctx.items.filter(other => other.q !== item.q && other.f && other.f.mk === item.f.mk && other.k === 1).slice(0, 2).map(other => other.n);

    // --- Země firmy a automobilky: „Ze které země pochází?“ ---
    const countryIdOf = (name, ctx) => Object.keys((ctx && ctx.countries) || {}).find(qid => ctx.countries[qid].name === name) || null;
    const countryQuestion = (item, ctx, rng) => {
        const land = item.f && item.f.land;
        if (!land || !countryIdOf(land, ctx)) return null;
        // Země ostatních firem stejného druhu (k Japonsku Jižní Korea a Čína, k Česku Německo a Rakousko)
        const lands = [...new Set(ctx.items.filter(other => isCompany(other) && other.f && other.f.land && other.f.land !== land && countryIdOf(other.f.land, ctx)).map(other => other.f.land))];
        const wrong = takeDistinct(rankBySimilarity(lands, other => -core.cultureDistance(land, other), rng), 3, new Set([normalizeAnswer(land)]), other => other);
        if (wrong.length < 3) return null;
        const accepted = [land, ...core.getCountryAliases([countryIdOf(land, ctx)])];
        return {
            type: 'location',
            title: item.ty === 'automobilka' ? 'Ze které země automobilka pochází?' : 'Ze které země firma pochází?',
            showName: true,
            choices: shuffle([land, ...wrong], rng).map(name => ({ id: countryIdOf(name, ctx), topic: 'zemepis', label: name, correct: name === land })),
            accepted,
            placeholder: 'Napiš stát…',
            answerLabel: land
        };
    };

    // --- Doba vzniku: „Ve kterém desetiletí…?“ (od roku 1900), u starších firem století ---
    const decadeLabel = (decade) => decade >= 1910 && decade < 2000 ? `${decade % 100}. léta` : `${decade}. léta`;
    const decadeAnswers = (decade) => [...new Set([decadeLabel(decade), `${decade}. léta`, `${decade}`, ...(decade >= 1910 && decade < 2000 ? [`${decade % 100}`] : []),
        ...Array.from({ length: 10 }, (_, i) => String(decade + i))])];
    const DECADE_TITLES = {
        letadla: 'Ve kterém desetiletí poprvé vzlétlo?', elektronika: 'Ve kterém desetiletí přišlo na trh?', software: 'Ve kterém desetiletí to vzniklo?',
        firmy: 'Ve kterém desetiletí byla firma založena?', automobilka: 'Ve kterém desetiletí byla automobilka založena?'
    };
    const CENTURY_TITLES = { firmy: 'Ve kterém století byla firma založena?', automobilka: 'Ve kterém století byla automobilka založena?' };
    const yearOf = (item) => (isCompany(item) ? item.f.from : item.f.year);
    const hasYearInName = (name) => /(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)/.test(name || '');
    const timeQuestion = (item, rng) => {
        const year = yearOf(item);
        const key = item.ty === 'automobilka' ? 'automobilka' : item.c;
        if (!Number.isInteger(year) || year > THIS_YEAR || hasYearInName(item.n) || !DECADE_TITLES[key]) return null;
        if (year >= 1900) {
            const decade = Math.floor(year / 10) * 10;
            const last = Math.floor(THIS_YEAR / 10) * 10;
            const wrong = [...shuffle([-10, 10], rng), ...shuffle([-20, 20], rng), ...shuffle([-30, 30], rng)].map(offset => decade + offset)
                .filter(other => other >= 1900 && other <= last).slice(0, 3);
            if (wrong.length < 3) return null;
            return {
                type: 'decade',
                title: DECADE_TITLES[key],
                showName: true,
                choices: shuffle([decade, ...wrong], rng).map(other => ({ id: `desetileti-${other}`, label: decadeLabel(other), correct: other === decade })),
                accepted: decadeAnswers(decade),
                match: 'symbol',
                placeholder: 'Napiš desetiletí, třeba 80. léta',
                answerLabel: decadeLabel(decade)
            };
        }
        // Rok na přelomu století (1800) by byl chyták, starší věci než firmy se neptají
        if (!CENTURY_TITLES[key] || year % 100 <= 3 || year % 100 >= 97) return null;
        const century = core.centuryOf(year);
        // Firmy vznikají od 16. století (Husqvarna 1689): starší století by byla zjevně mimo
        const wrong = [...shuffle([-1, 1], rng), ...shuffle([-2, 2], rng), ...shuffle([-3, 3], rng)].map(offset => century + offset).filter(other => other >= 16 && other <= 20).slice(0, 3);
        if (wrong.length < 3) return null;
        return {
            type: 'century',
            title: CENTURY_TITLES[key],
            showName: true,
            choices: shuffle([century, ...wrong], rng).map(other => ({ id: `stoleti-${other}`, label: core.centuryLabel(other), correct: other === century })),
            match: 'century',
            century,
            accepted: [core.centuryLabel(century)],
            placeholder: 'Napiš století, třeba 19',
            answerLabel: core.centuryLabel(century)
        };
    };
    const ERA_WORDS = /(?<![\p{L}])(?:dvacát\p{L}*|devatenáct\p{L}*|osmnáct\p{L}*|šedesát\p{L}*|sedmdesát\p{L}*|osmdesát\p{L}*|devadesát\p{L}*|padesát\p{L}*|čtyřicát\p{L}*|třicát\p{L}*)\s+(?:let\p{L}*|lét\p{L}*|stolet\p{L}*)/giu;
    const hideYears = (text) => mergeCensored(stripBrackets(text).replace(/\s{2,}/g, ' ')
        .replace(/(?<![\p{L}\d])\d{1,4}(?:\.\s*(?:let\p{L}*|lét\p{L}*|století|stol\.))?(?!\d)/gu, '[***]').replace(ERA_WORDS, '[***]'));
    // Věci z let kolem (nápověda u otázky na dobu)
    const aroundOf = (item, ctx) => {
        const year = yearOf(item);
        return ctx.items.filter(other => other.c === item.c && other.q !== item.q && other.k === 1 && Number.isInteger(yearOf(other)) && Math.abs(yearOf(other) - year) <= 3 && !hasYearInName(other.n))
            .sort((a, b) => Math.abs(yearOf(a) - year) - Math.abs(yearOf(b) - year)).slice(0, 2).map(other => other.n);
    };

    // --- Nápovědy podle druhu otázky (od nejméně po nejvíc prozrazující) ---
    const placeMap = (item, span) => item.la === undefined ? null
        : { type: 'map', lat: item.la, lon: item.lo, span, highlightIso: '', label: 'Stavba je uprostřed' };
    const hintsOf = (item, ctx, type) => {
        const facts = factsOf(item, ctx, type);
        if (type === 'maker') {
            const others = otherProducts(item, ctx);
            return [
                { kind: 'facts', label: 'země a doba', icon: 'flag', facts: pick(facts, ['Země', YEAR_LABELS[item.c]]) },
                { kind: 'facts', label: 'další výrobky', icon: 'factory', facts: others.length ? [{ label: 'Další výrobky', value: others.join(', ') }] : [] },
                { kind: 'photo' }
            ];
        }
        if (type === 'location') {
            return [
                { kind: 'facts', label: 'založení', icon: 'calendar', facts: pick(facts, ['Založení']) },
                { kind: 'facts', label: 'zakladatelé', icon: 'user', facts: pick(facts, ['Zakladatel', 'Zakladatelé']) },
                { kind: 'photo' }
            ];
        }
        if (type === 'decade' || type === 'century') {
            const around = aroundOf(item, ctx);
            return [
                { kind: 'facts', label: 'výrobce a země', icon: 'factory', facts: facts.filter(fact => !['Vyrobeno'].includes(fact.label)) },
                { kind: 'facts', label: 've stejné době', icon: 'calendar-range', facts: around.length ? [{ label: 'Ve stejné době', value: around.join(', ') }] : [] }
            ];
        }
        if (item.c === 'vynalezci') {
            // Země, pak dílo, nakonec fotka – podle ní slavné osobnosti pozná každý. Časová osa jen po odpovědi: roky života bývají
            // v popisu a rozlišující údaj je ukáže hned, osa by je jen opakovala
            return [
                { kind: 'facts', label: 'země', icon: 'flag', facts: pick(facts, ['Země']) },
                { kind: 'facts', label: 'známé dílo', icon: 'lightbulb', facts: pick(facts, ['Známé dílo']) },
                { kind: 'photo' }
            ];
        }
        if (item.c === 'stavby') {
            return [
                { kind: 'facts', label: 'země a doba', icon: 'flag', facts: pick(facts, ['Země', 'Otevřeno']) },
                { kind: 'visual', spec: placeMap(item, 24) },
                { kind: 'facts', label: 'místo a provoz', icon: 'map-pin', facts: pick(facts, ['Místo', 'Výkon', 'Cestujících za rok', 'Provozovatel']) },
                { kind: 'photo' }
            ];
        }
        if (isCompany(item)) {
            return [
                { kind: 'facts', label: 'země a založení', icon: 'flag', facts: pick(facts, ['Země', 'Založení']) },
                { kind: 'facts', label: 'zakladatelé a sídlo', icon: 'user', facts: pick(facts, ['Zakladatel', 'Zakladatelé', 'Sídlo']) },
                { kind: 'photo' }
            ];
        }
        // Stroje a dopravní prostředky: fotka je otázkou (popis je první nápovědou), pak země a doba, nakonec výrobce a čísla
        return [
            { kind: 'facts', label: 'země a doba', icon: 'flag', facts: pick(facts, ['Země', YEAR_LABELS[item.c], 'Vynálezce']) },
            { kind: 'facts', label: 'výrobce a čísla', icon: 'factory', facts: pick(facts, [MAKER_LABELS[item.c] || 'Výrobce', 'Nejvyšší rychlost', 'Délka', 'Vyrobeno']) },
            { kind: 'photo' }
        ];
    };

    // --- Nesprávné možnosti ---
    // Druh je u otázky vidět (štítek, u druhů s vlastním zadáním i zadání): jiný druh mezi nimi by byl poznat hned
    const similarity = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        if (item.c === 'vynalezci') {
            return personSimilarity(item, other) + (item.ty === other.ty ? 3 : 0) + (f.land && f.land === g.land ? 2 : 0) + ((item.cz === 1) === (other.cz === 1) ? 1 : -3);
        }
        if ((titleOfKind(item) || titleOfKind(other)) && titleOfKind(item) !== titleOfKind(other)) return -30;
        if (isCompany(item) !== isCompany(other)) return -30;
        const sameMaker = f.mk && g.mk && firstWord(f.mk) === firstWord(g.mk);
        return (item.ty === other.ty ? 4 : -4) + eraNearness(f.y, g.y) + (sameMaker ? (item.c === 'auta' ? 5 : 3) : 0)
            + (f.land && f.land === g.land ? 2 : 0) + ((item.cz === 1) === (other.cz === 1) ? 1 : 0);
    };

    // Hlavní obrázek, který neukazuje osobnost (hrob, pamětní deska, známka) nebo stavbu (mapa, plán, logo, model)
    const offSubjectPhoto = core.offSubjectRule({
        words: { vynalezci: core.OFF_SUBJECT.memorial, stavby: core.OFF_SUBJECT.depiction, firmy: ['logo'] },
        ids: []
    });

    return {
        id: 'technika',
        title: 'Technika a vynálezy',
        shortTitle: 'Technika',
        icon: 'cog',
        emoji: '⚙️',
        color: 'cyan',
        dataFile: 'data/technika.json',
        subtitleIcon: 'cog',
        words: {
            question: 'Kdo nebo co to je?',
            one: 'pojem',
            next: 'Další otázka',
            atlas: 'Atlas techniky',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavní vynálezci, známé stroje, dopravní prostředky a firmy',
            czechBadge: 'Česká stopa'
        },
        categories: CATEGORIES,
        offSubjectPhoto,
        similarity,
        // Stavby se řadí podle státu, kde stojí; ostatní podle země původu (f.land)
        culture: (item, ctx) => item.c === 'stavby' ? countriesOf(item, ctx).slice(0, 3) : undefined,
        questionTitle: (item) => titleOfKind(item),
        nameAliases: (item, ctx) => nameAliasesOf(item, ctx),

        // Výrobce (vlaky, letadla, přístroje, software), země firmy a automobilky, desetiletí vzniku
        specialQuestion: (item, ctx, rng) => {
            const roll = rng();
            if (isCompany(item)) {
                if (roll < COUNTRY_QUIZ_SHARE) return countryQuestion(item, ctx, rng);
                if (roll < COUNTRY_QUIZ_SHARE + DECADE_QUIZ_SHARE) return timeQuestion(item, rng);
                return null;
            }
            if (roll < MAKER_QUIZ_SHARE && canAskMaker(item)) return makerQuestion(item, ctx, rng);
            if (roll >= 1 - DECADE_QUIZ_SHARE) return timeQuestion(item, rng);
            return null;
        },
        censor: (type, text, item, ctx) => {
            if (type === 'maker') return censorName(stripBrackets(text).replace(/\s{2,}/g, ' '), item.f.mk);
            if (type === 'location') {
                const qid = countryIdOf(item.f.land, ctx);
                return censorCountry(text, item.f.land, [...(qid ? core.getCountryAliases([qid]) : []), item.f.hq].filter(Boolean));
            }
            if (type === 'decade' || type === 'century') return hideYears(text);
            return null;
        },
        findAnswer: (type, answer, item, ctx) => {
            if (type === 'maker') {
                const found = ctx.items.find(other => isCompany(other) && isAnswerMatch(answer, nameAnswers(other, [])));
                return found ? { topic: 'technika', id: found.q } : null;
            }
            if (type === 'location') {
                const qid = Object.keys(ctx.countries || {}).find(id => isAnswerMatch(answer, [ctx.countries[id].name, ...core.getCountryAliases([id])]));
                return qid ? { topic: 'zemepis', id: qid } : null;
            }
            return null;
        },
        // Fotka stroje či dopravního prostředku je otázka sama – je vidět hned, fotka už pak nápovědou není
        questionImage: (item, ctx, type) => (type === 'name' && isPhotoQuestion(item) ? { file: item.im, hash: item.ih, label: 'Fotka', icon: 'image' } : null),
        hints: hintsOf,
        visual: (item, ctx, mode) => {
            if (item.c === 'vynalezci') return mode === 'name' ? null : personTimeline(item);
            if (item.c === 'stavby') return mode === 'name' ? null : placeMap(item, 12);
            return null;
        },
        facts: factsOf,
        subtitle: (item, ctx) => {
            const f = item.f || {};
            if (item.c === 'vynalezci') return [lifeRange(f), item.ty, f.land].filter(Boolean).join(' · ');
            if (item.c === 'stavby') return [item.ty, f.city || countriesOf(item, ctx || {})[0]].filter(Boolean).join(' · ');
            if (isCompany(item)) return [item.ty === 'automobilka' ? '' : item.ty, f.land, f.from !== undefined ? `od ${formatYear(f.from)}` : ''].filter(Boolean).join(' · ');
            return [item.ty, f.mk, f.year !== undefined ? formatYear(f.year) : ''].filter(Boolean).join(' · ');
        },
        coords: (item) => item.c === 'stavby' && item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1
    };
});
