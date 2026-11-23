// Téma Jídlo a pití: pokrmy, pečivo a sladkosti, sýry, ovoce, zelenina, koření a bylinky, nápoje, víno, pivo a destiláty,
// kuchaři a gastronomové (data/jidlo.json ze scripts/build-jidlo.mjs)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatNumber, shuffle, normalizeAnswer, personSimilarity, buildCountryChoices, countryAnswers, censorCountry, getCountryAliases,
        findAnswerCountry, getContinent, CONTINENT_NAMES
    } = core;

    const CATEGORIES = [
        { key: 'pokrmy', label: 'Pokrmy', one: 'pokrm', icon: 'soup', question: 'Co je to za pokrm?', placeholder: 'Napiš pokrm…', sort: { by: 'name' } },
        { key: 'sladkosti', label: 'Pečivo a sladkosti', one: 'pečivo či sladkost', icon: 'croissant', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'syry', label: 'Sýry', one: 'sýr', icon: 'milk', question: 'Který sýr to je?', placeholder: 'Napiš sýr…', sort: { by: 'name' } },
        { key: 'ovoce', label: 'Ovoce a ořechy', one: 'ovoce', icon: 'apple', question: 'Co je to?', placeholder: 'Napiš ovoce nebo ořech…', sort: { by: 'name' } },
        { key: 'zelenina', label: 'Zelenina a luštěniny', one: 'zelenina', icon: 'carrot', question: 'Co je to?', placeholder: 'Napiš zeleninu…', sort: { by: 'name' } },
        { key: 'koreni', label: 'Koření a bylinky', one: 'koření', icon: 'leafy-green', question: 'Co je to?', placeholder: 'Napiš koření nebo bylinku…', sort: { by: 'name' } },
        { key: 'napoje', label: 'Káva, čaj a nealko', one: 'nápoj', icon: 'coffee', question: 'Co je to za nápoj?', placeholder: 'Napiš nápoj…', sort: { by: 'name' } },
        { key: 'alkohol', label: 'Víno, pivo a destiláty', one: 'nápoj', icon: 'wine', question: 'Co je to?', placeholder: 'Napiš nápoj nebo odrůdu…', sort: { by: 'name' } },
        { key: 'kuchari', label: 'Kuchaři a gastronomové', one: 'osobnost', icon: 'chef-hat', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'born' } }
    ];
    const categoryOf = (item) => CATEGORIES.find(category => category.key === item.c) || CATEGORIES[0];
    const THIS_YEAR = new Date().getFullYear();
    const isPerson = (item) => item.c === 'kuchari';
    // Ovoce, zelenina a koření: rostliny (čeleď, vědecký název), země původu u nich nic neříká
    const PLANTS = new Set(['ovoce', 'zelenina', 'koreni']);
    const isPlant = (item) => PLANTS.has(item.c);

    // Jak často se ptáme „Ze které země pochází?“ (pokrmy, sýry, nápoje, kuchaři s jedním dnešním státem v tabulce států)
    const ORIGIN_SHARE = 0.3;
    const ORIGIN_TITLES = {
        pokrmy: 'Ze které země pochází tento pokrm?', sladkosti: 'Ze které země pochází?', syry: 'Ze které země pochází tento sýr?',
        napoje: 'Ze které země pochází tento nápoj?', alkohol: 'Ze které země pochází?', kuchari: 'Ze které země pochází?'
    };

    // Další přijímané psané odpovědi (běžné tvary a cizí zápisy)
    const ALIASES = {
        'Suši': ['sushi'], 'Rámen': ['ramen'], 'Phở': ['pho'], 'Phad thai': ['pad thai'], 'Taco': ['tacos'], 'Kuskus': ['couscous'],
        'Smažený sýr': ['smažák'], 'Svíčková na smetaně': ['svíčková'], 'Vepřo knedlo zelo': ['vepřo-knedlo-zelo'], 'Hranolky': ['french fries'],
        'Brynzové halušky': ['bryndzové halušky', 'halušky s brynzou'], 'Česneková polévka': ['česnečka'], 'Bramboračka': ['bramborová polévka'],
        'Cheesecake': ['sýrový koláč'], 'Americká kobliha': ['donut', 'doughnut'], 'Palačinka': ['palačinky'], 'Makronky': ['makronka'],
        'Hroznové víno': ['hrozny', 'hrozen'], 'Arašídy': ['burské oříšky', 'buráky', 'arašíd'], 'Kešu': ['kešu ořechy'], 'Jedlý kaštan': ['kaštan', 'kaštany'],
        'Brambor': ['brambory'], 'Rajče': ['rajčata', 'paradajka'], 'Batáty': ['sladké brambory', 'batát'], 'Hlávkový salát': ['salát'], 'Fazole': ['fazol'],
        'Žampion': ['pečárka'], 'Kadeřávek': ['kapusta kadeřavá', 'kale'], 'Okurka': ['okurky'], 'Rukola': ['roketa'],
        'Pepř': ['černý pepř'], 'Mletá paprika': ['sladká paprika'], 'Římský kmín': ['kmín římský', 'cumin'],
        'Kola': ['cola'], 'Mačča': ['matcha'], 'Boba čaj': ['bubble tea'], 'Moccacino': ['mocha', 'caffè mocha'], 'Masala chai': ['masala čaj', 'čaj masala'],
        'Pivo plzeňského typu': ['pilsner', 'plzeňské pivo'], 'Šampaňské': ['champagne'], 'Cuba Libre': ['rum s kolou'], 'Gin s tonikem': ['gin tonic'],
        'Rakije': ['rakija'], 'Ryzlink rýnský': ['riesling'], 'Rulandské modré': ['pinot noir'], 'Rulandské šedé': ['pinot gris'],
        'Tramín červený': ['gewürztraminer', 'tramín'], 'Veltlínské zelené': ['grüner veltliner']
    };
    // Kolik položek tématu má stejný vědecký název (po načtení dat se nemění)
    const latinIndex = new WeakMap();
    const latinCount = (ctx, lat) => {
        const items = (ctx && ctx.items) || [];
        if (!latinIndex.has(items)) {
            const counts = new Map();
            for (const other of items) if (other.f && other.f.lat) counts.set(normalizeAnswer(other.f.lat), (counts.get(normalizeAnswer(other.f.lat)) || 0) + 1);
            latinIndex.set(items, counts);
        }
        return latinIndex.get(items).get(normalizeAnswer(lat)) || 0;
    };
    // Slova, která v popisu prozradí zemi (u otázky na zemi původu): přídavné jméno státu a kuchyně
    const censorOrigin = (text, item, ctx) => {
        const id = item.f.co;
        const country = ((ctx.countries || {})[id] || {}).name;
        return country ? censorCountry(text, country, getCountryAliases([id])) : censorCountry(text, null);
    };

    // --- Otázka na zemi původu ---

    // Stát původu, na který se dá ptát: jediný dnešní stát v tabulce a název ho neprozradí (u Řeckého salátu ne, u Vídeňského řízku
    // ano – město v názvu jen napoví). Na české položky (svíčková, Pohlreich) se neptá, odpověď by byla zadarmo
    const originCountry = (item, countries) => {
        const id = item.f && item.f.co;
        if (!id || !countries || !countries[id] || item.cz === 1) return null;
        const words = [countries[id].name, ...getCountryAliases([id])];
        return words.some(word => core.isFactVisible(word, item.n)) ? null : id;
    };
    const originChoices = (id, item, ctx, rng) => {
        const countries = ctx.countries;
        const origins = new Set(ctx.items.filter(other => other.c === item.c && other.f && other.f.co && countries[other.f.co]).map(other => other.f.co));
        origins.delete(id);
        // Nejdřív země původu jiných položek z téhož kontinentu (k Itálii Francie a Španělsko), pak sousední státy
        const ranked = shuffle([...origins], rng).sort((a, b) => (countries[b].continent === countries[id].continent) - (countries[a].continent === countries[id].continent));
        const wrong = ranked.slice(0, 3);
        const fallback = buildCountryChoices(id, countries, rng).filter(choice => !choice.correct && !wrong.includes(choice.id)).map(choice => choice.id);
        const picked = [...wrong, ...fallback].slice(0, 3);
        return shuffle([id, ...picked], rng).map(qid => ({ id: qid, label: countries[qid].name, correct: qid === id, topic: 'zemepis' }));
    };
    const originQuestion = (item, ctx, rng) => {
        const id = originCountry(item, ctx.countries);
        if (!id) return null;
        const name = ctx.countries[id].name;
        return {
            type: 'location',
            title: ORIGIN_TITLES[item.c] || 'Ze které země pochází?',
            showName: true,
            choices: originChoices(id, item, ctx, rng),
            accepted: countryAnswers([id], [name]),
            placeholder: 'Napiš stát…',
            answerLabel: name
        };
    };

    // --- Fakta ---

    const lifeRange = (f) => (f.died !== undefined ? `${f.born}–${f.died}` : `* ${f.born}`);
    const personFacts = (item, mode) => {
        const f = item.f || {};
        const full = mode === 'result' || mode === 'card';
        return [
            full ? { label: 'Život', value: lifeRange(f) } : null,
            f.land ? { label: 'Země', value: f.land } : null,
            (f.jobs || []).length ? { label: 'Povolání', value: f.jobs.join(', ') } : null
        ].filter(Boolean);
    };
    const abvText = (abv) => `${formatNumber(abv)} %`;
    // Slova se stejným začátkem (hrách, hrášek, Hrachová; ryby, ryb): bez diakritiky první tři písmena; obecná slova druhu
    // (polévka, omáčka, sýr…) se nepočítají
    const KIND_WORDS = new Set(['polevka', 'omacka', 'salat', 'syr', 'vino', 'pivo', 'caj', 'kava', 'likér', 'liker', 'dort', 'kolac', 'chleb']);
    const wordsOf = (text, min = 4) => normalizeAnswer(text).split(/[^a-z0-9]+/).filter(word => word.length >= min && !KIND_WORDS.has(word));
    const sharesStem = (a, b) => { const bs = wordsOf(b, 3); return wordsOf(a).some(word => bs.some(other => other.slice(0, 3) === word.slice(0, 3))); };
    // Surovina, která je slovem odpovědi (u Hrachové polévky hrášek, u Kuřecí polévky kuřecí maso), by odpověď prozradila
    const leaksName = (value, item) => sharesStem(value, `${item.n} ${core.displayName(item.t || '')}`) || core.findLeaks(String(value), [item.n, core.displayName(item.t || '')]).length > 0;
    const foodFacts = (item, mode) => {
        const f = item.f || {};
        const full = mode === 'result' || mode === 'card';
        const origin = mode !== 'location';
        const mat = (f.mat || []).filter(value => !leaksName(value, item));
        return [
            origin && f.land && !isPlant(item) ? { label: 'Země původu', value: f.land } : null,
            origin && f.cuisine ? { label: 'Kuchyně', value: f.cuisine } : null,
            mat.length ? { label: mat.length > 1 ? 'Suroviny' : 'Surovina', value: mat.join(', ') } : null,
            f.course ? { label: 'Chod', value: f.course } : null,
            f.abv ? { label: 'Obsah alkoholu', value: abvText(f.abv) } : null,
            f.color ? { label: 'Barva', value: f.color } : null,
            f.year ? { label: 'Vznik', value: String(f.year) } : null,
            f.fam ? { label: 'Čeleď', value: f.fam } : null,
            full && f.lat ? { label: 'Vědecký název', value: f.lat } : null
        ].filter(Boolean);
    };
    const factsOf = (item, ctx, mode) => (isPerson(item) ? personFacts(item, mode) : foodFacts(item, mode));

    // Časová osa života kuchaře či gastronoma (jako u sportovců): od narození do smrti, nebo dodnes
    const WORLD_EVENTS = [
        [1765, 'první restaurace v Paříži'], [1789, 'Velká francouzská revoluce'], [1826, 'Rettigová vydala Domácí kuchařku'], [1842, 'první plzeňský ležák'],
        [1900, 'první průvodce Michelin'], [1914, 'začátek 1. světové války'], [1939, 'začátek 2. světové války'], [1945, 'konec 2. světové války'],
        [1955, 'první McDonald’s Raye Kroca'], [1969, 'přistání na Měsíci'], [1989, 'pád Berlínské zdi'], [2001, 'útoky 11. září'], [2020, 'pandemie covidu']
    ];
    const personTimeline = (item) => {
        const f = item.f || {};
        if (f.born === undefined) return null;
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to: f.died ?? THIS_YEAR }], points: [], hide: item.n, anchors: WORLD_EVENTS.map(([year, text]) => [year, text, 0]) };
    };

    // --- Nápovědy ---

    // Kuchař: země a povolání, fotka, nakonec roky života. Roky jako fakta, ne osa: když je hra ukáže hned jako rozlišující údaj,
    // fakt se z nápovědy sám vypustí (osa by jen opakovala, co hráč už viděl); osa se ukáže po odpovědi
    const lifeFacts = (item) => {
        const f = item.f || {};
        return [f.born !== undefined ? { label: 'Narození', value: String(f.born) } : null, f.died !== undefined ? { label: 'Úmrtí', value: String(f.died) } : null].filter(Boolean);
    };
    const personHints = (item, type) => [
        { kind: 'facts', facts: personFacts(item, type).filter(fact => type !== 'location' || fact.label !== 'Země') },
        { kind: 'photo' },
        { kind: 'facts', label: 'život', icon: 'calendar-range', facts: lifeFacts(item) }
    ];
    // Jídlo a nápoje: odkud a z čeho, pak fotka, nakonec další podrobnosti (chod, obsah alkoholu, barva, vznik)
    const foodHints = (item, type) => {
        // Co už říká krátký popis (u sašimi „ze syrových ryb“ a surovina ryby), nápověda nepřidá
        const facts = foodFacts(item, type).filter(fact => !sharesStem(String(fact.value), item.d || ''));
        const take = (labels) => facts.filter(fact => labels.includes(fact.label));
        if (isPlant(item)) {
            const lat = (item.f || {}).lat;
            return [
                { kind: 'facts', facts: take(['Čeleď', 'Suroviny', 'Surovina', 'Barva', 'Kuchyně']) },
                { kind: 'photo' },
                { kind: 'facts', label: 'vědecký název', icon: 'microscope', facts: lat ? [{ label: 'Vědecký název', value: lat }] : [] }
            ];
        }
        if (type === 'location') {
            return [
                { kind: 'facts', label: 'suroviny', icon: 'utensils', facts: take(['Suroviny', 'Surovina', 'Chod', 'Obsah alkoholu']) },
                { kind: 'photo' }
            ];
        }
        return [
            { kind: 'facts', facts: take(['Země původu', 'Kuchyně', 'Suroviny', 'Surovina']) },
            { kind: 'photo' },
            { kind: 'facts', label: 'podrobnosti', icon: 'info', facts: take(['Chod', 'Obsah alkoholu', 'Barva', 'Vznik']) }
        ];
    };
    // Kontinent jako první nápověda otázky na zemi původu
    const originHints = (item, ctx) => {
        const continent = getContinent({ co: [item.f.co] }, ctx.countries || {});
        return [
            { kind: 'facts', label: 'kontinent', icon: 'globe', facts: continent ? [{ label: 'Kontinent', value: CONTINENT_NAMES[continent] }] : [] },
            ...foodHints(item, 'location')
        ];
    };

    // --- Nesprávné možnosti ---

    // Stejný druh (polévka k polévkám, kořenová zelenina ke kořenové, likér k likérům), u rostlin stejná čeleď, u ostatních stejná země
    // a kontinent původu; kuchaři stejného pohlaví a doby, Čech k Čechům
    const continentOf = (item, ctx) => (item.f && item.f.co && ctx && ctx.countries && ctx.countries[item.f.co] ? ctx.countries[item.f.co].continent : '');
    const similarity = (item, other, ctx) => {
        const f = item.f || {};
        const g = other.f || {};
        if (isPerson(item)) {
            return personSimilarity(item, other) + (f.land && f.land === g.land ? 2 : 0) + ((item.cz === 1) === (other.cz === 1) ? 2 : -3)
                + (item.ty === other.ty ? 2 : 0);
        }
        // Druh je u otázky vidět (štítek „polévka“): přednost před zemí, ta řadí až položky téhož druhu (jako sport u sportovců);
        // u položky bez druhu (obecný „pokrm“) jen mírně, ať rozhoduje země původu
        let score = item.ty ? (item.ty === other.ty ? 14 : -14) : (other.ty ? 0 : 4);
        if (isPlant(item)) {
            if (f.fam && f.fam === g.fam) score += 3;
        } else {
            const continent = continentOf(item, ctx);
            // Stejná první země původu (Tête de Moine „Švýcarsko, Francie“ ke švýcarským sýrům), jinak aspoň jedna společná, jinak kontinent
            const lands = String(f.land || '').split(', ').filter(Boolean);
            const otherLands = String(g.land || '').split(', ').filter(Boolean);
            if (lands.length && lands[0] === otherLands[0]) score += 5;
            else if (lands.some(land => otherLands.includes(land))) score += 2;
            else if (continent && continent === continentOf(other, ctx)) score += 1;
            if ((item.cz === 1) === (other.cz === 1)) score += 1;
        }
        // Stejně známé (Pizza k Hamburgeru, ne ke Kibbehu)
        if ((item.k === 1) === (other.k === 1)) score += 1;
        return score;
    };

    // Hlavní obrázek mimo téma (quiz-core.js offSubjectRule, npm run audit:obrazky): u osobností hrob a deska, u jídla a pití
    // logo, etiketa, cedule, plakát a známka (název výrobku by prozradil odpověď)
    const LABELS = ['logo', 'label', 'etiketa', 'etikett', 'etiquette', 'sign', 'cedule', 'poster', 'plakat', 'advert', 'reklama', 'stamp', 'briefmarke', 'menu', 'packaging'];
    const offSubjectPhoto = core.offSubjectRule({
        words: { kuchari: core.OFF_SUBJECT.memorial, '*': LABELS }
    });

    return {
        id: 'jidlo',
        title: 'Jídlo a pití',
        icon: 'utensils',
        emoji: '🍽️',
        color: 'fuchsia',
        dataFile: 'data/jidlo.json',
        subtitleIcon: 'chef-hat',
        words: {
            question: 'Co je to?',
            one: 'pojem',
            next: 'Další otázka',
            atlas: 'Atlas jídla a pití',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Známá jídla a nápoje, běžné ovoce, zelenina, koření a slavní kuchaři',
            czechBadge: 'Česká stopa'
        },
        categories: CATEGORIES,
        offSubjectPhoto,

        similarity,
        // Ovoce, zelenina a koření nemají „kulturu jmen“ (rostliny, ne díla); jídlo, nápoje a lidé podle země původu
        culture: (item) => (isPlant(item) ? [] : undefined),
        // Psané odpovědi: běžné tvary a cizí zápisy, u rostlin i vědecký název (jen když ho nemá jiná položka: paprika i kapie jsou Capsicum annuum)
        nameAliases: (item, ctx) => [...(ALIASES[item.n] || []),
            ...(isPlant(item) && item.f && item.f.lat && /\s/.test(item.f.lat) && latinCount(ctx, item.f.lat) === 1 ? [item.f.lat] : [])],

        // Občas „Ze které země pochází?“ – název je vidět
        specialQuestion: (item, ctx, rng) => {
            if (isPlant(item)) return null;
            if (!(rng() < ORIGIN_SHARE)) return null;
            return originQuestion(item, ctx, rng);
        },
        censor: (type, text, item, ctx) => (type === 'location' ? censorOrigin(text, item, ctx) : null),
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'location') return null;
            const id = findAnswerCountry(answer, [originCountry(item, ctx.countries)].filter(Boolean), ctx.countries || {});
            return id ? { topic: 'zemepis', id } : null;
        },

        hints: (item, ctx, type) => {
            if (type === 'location') return isPerson(item) ? personHints(item, type) : originHints(item, ctx);
            return isPerson(item) ? personHints(item, type) : foodHints(item, type);
        },
        visual: (item, ctx, mode) => (isPerson(item) && mode !== 'location' ? personTimeline(item) : null),
        facts: factsOf,
        subtitle: (item) => {
            const f = item.f || {};
            if (isPerson(item)) return [lifeRange(f), item.ty, f.land].filter(Boolean).join(' · ');
            if (isPlant(item)) return [item.ty || categoryOf(item).one, f.lat].filter(Boolean).join(' · ');
            return [item.ty || categoryOf(item).one, f.land].filter(Boolean).join(' · ');
        },
        isCzech: (item) => item.cz === 1
    };
});
