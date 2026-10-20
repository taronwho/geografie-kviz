// Téma Zeměpis: státy, města, hory, řeky, vodní plochy, ostrovy, příroda a stavby (data/zemepis.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        CONTINENT_NAMES, CZECHIA_QID, getCountryNames, getContinent, getCountryAliases, censorCountry,
        buildCountryChoices, findAnswerCountry, countryAnswers, formatFacts, formatNumber, formatPopulation, formatYear, getMapSpan,
        distanceKm, nearness, STATE_STEPS
    } = core;

    // mapSpan = kolik stupňů zeměpisné délky ukáže slepá mapa; sort = pořadí při procházení kategorie v učení
    const CATEGORIES = [
        { key: 'stat', label: 'Státy', one: 'stát', icon: 'flag', mapSpan: 14, sort: { by: 'name' } },
        { key: 'mesto', label: 'Města', one: 'město', icon: 'building-2', mapSpan: 24, sort: { by: 'pop', desc: true } },
        { key: 'hora', label: 'Hory a sopky', one: 'hora', icon: 'mountain', mapSpan: 24, sort: { by: 'elev', desc: true } },
        { key: 'reka', label: 'Řeky', one: 'řeka', icon: 'waves', mapSpan: 24, sort: { by: 'len', desc: true } },
        { key: 'jezero', label: 'Jezera a moře', one: 'vodní plocha', icon: 'droplets', mapSpan: 30, sort: { by: 'area', desc: true } },
        { key: 'ostrov', label: 'Ostrovy', one: 'ostrov', icon: 'palmtree', mapSpan: 30, sort: { by: 'area', desc: true } },
        { key: 'priroda', label: 'Příroda a krajina', one: 'přírodní místo', icon: 'leaf', mapSpan: 24, sort: { by: 'name' } },
        { key: 'stavba', label: 'Stavby a památky', one: 'stavba', icon: 'landmark', mapSpan: 24, sort: { by: 'name' } }
    ];

    // Jak často se místo „Co je to za místo?“ ptáme „Ve kterém státě to je?“ (jen kde to dává smysl)
    const LOCATION_QUIZ_SHARE = 0.35;

    // Na stát se ptáme jen u míst v jednom známém státě, ne u států a ne když stát prozradí už název (Česká Lípa)
    const canAskForCountry = (item, countries) => {
        if (item.c === 'stat' || (item.co || []).length !== 1 || !countries[item.co[0]]) return false;
        return !censorCountry(item.n, countries[item.co[0]].name, getCountryAliases(item.co)).includes('[***]');
    };

    // Hlavní číslo kategorie – podobně velká místa jsou lepší nesprávné možnosti (velkoměsto k velkoměstu)
    const SIZE_FACT = { stat: 'area', mesto: 'pop', hora: 'elev', reka: 'len', jezero: 'area', ostrov: 'area' };
    const isComparable = (a, b) => a > 0 && b > 0 && a / b > 0.4 && a / b < 2.5;

    // Střed státu podle položky státu v datech (pro nejbližší státy u otázky „Ve kterém státě to je?“)
    const centres = new WeakMap();
    const countryCentres = (items) => {
        if (!centres.has(items)) centres.set(items, new Map(items.filter(item => item.c === 'stat' && item.la !== undefined).map(item => [item.q, item])));
        return centres.get(items);
    };

    const FACT_FORMATS = [
        ['cap', 'Hlavní město', value => value],
        ['pop', 'Počet obyvatel', formatPopulation],
        ['area', 'Rozloha', value => `${formatNumber(value)} km²`],
        ['elev', 'Nadmořská výška', value => `${formatNumber(value)} m`],
        ['len', 'Délka', value => `${formatNumber(value)} km`],
        ['h', 'Výška', value => `${formatNumber(value)} m`],
        ['year', 'Vznik', formatYear],
        ['mouth', 'Ústí do', value => value]
    ];

    // Kde místo leží: státy, u států a míst mimo státy kontinent
    const subtitle = (item, { countries }) => {
        const countryNames = getCountryNames(item, countries);
        if (item.c !== 'stat' && countryNames.length) return countryNames.join(', ');
        const continent = getContinent(item, countries);
        if (continent) return CONTINENT_NAMES[continent];
        return item.c === 'jezero' ? 'Mezinárodní vody' : 'Mimo území států';
    };

    return {
        id: 'zemepis',
        title: 'Zeměpis',
        icon: 'globe-2',
        emoji: '🌍',
        color: 'emerald',
        dataFile: 'data/zemepis.json',
        // Dnešní místo zůstává stejné jako v dřívějším Geo Kvízu
        dailySeed: 'geo-kviz-',
        words: {
            question: 'Co je to za místo?',
            one: 'místo',
            next: 'Další místo',
            atlas: 'Atlas míst',
            placeholder: 'Napiš název místa…',
            tierKnown: 'Hlavní města, velké řeky, slavné stavby'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: místa poblíž, ze stejného státu (jinak kontinentu) a podobně velká
        similarity: (item, other, { countries }) => {
            // U států rozhodují hlavně sousedé, velikost jen trochu
            const isState = item.c === 'stat';
            let score = item.la !== undefined && other.la !== undefined ? nearness(distanceKm(item, other), isState ? STATE_STEPS : undefined) : 0;
            const sharesCountry = item.c !== 'stat' && (item.co || []).some(country => (other.co || []).includes(country));
            const continent = getContinent(item, countries);
            // Jiný kontinent skoro vyřadí (k Novému Zélandu ne Francie, i když je známá)
            const otherContinent = getContinent(other, countries);
            score += sharesCountry ? 2 : continent && continent === otherContinent ? 1 : continent && otherContinent ? -3 : 0;
            const key = SIZE_FACT[item.c];
            if (key && isComparable((item.f || {})[key], (other.f || {})[key])) score += isState ? 0.5 : 1;
            return score;
        },

        // U států platí i jejich běžné zkratky a názvy (USA, ČR…)
        nameAliases: (item) => item.c === 'stat' ? getCountryAliases([item.q]) : [],

        // Občas otázka „Ve kterém státě to je?“ – název místa je pak vidět a z popisu zmizí stát, národnost i kontinent
        specialQuestion: (item, { countries, items }, rng) => {
            if (!(rng() < LOCATION_QUIZ_SHARE && canAskForCountry(item, countries))) return null;
            const countryId = item.co[0];
            const countryName = countries[countryId].name;
            return {
                type: 'location',
                title: 'Ve kterém státě to je?',
                showName: true,
                // Nesprávné možnosti: státy nejblíž místu (u Prahy Slovensko, Rakousko, Polsko…)
                choices: buildCountryChoices(countryId, countries, rng, (id) => {
                    const centre = item.la !== undefined ? countryCentres(items || []).get(id) : null;
                    return centre ? distanceKm(item, centre) : undefined;
                }).map(choice => ({ ...choice, topic: 'zemepis' })),
                accepted: countryAnswers([countryId], [countryName]),
                placeholder: 'Napiš stát…',
                answerLabel: countryName
            };
        },
        censor: (type, text, item, { countries }) => type === 'location'
            ? censorCountry(text, countries[item.co[0]].name, getCountryAliases(item.co))
            : null,
        findAnswer: (type, answer, item, { countries }) => {
            if (type !== 'location') return null;
            const countryId = findAnswerCountry(answer, item.co || [], countries);
            return countryId ? { topic: 'zemepis', id: countryId } : null;
        },

        // Slepá mapa: obrysy států bez popisků, místo uprostřed, u států zvýrazněný celý stát;
        // u otázky na stát širší výřez, ať mapa odpověď hned neprozradí
        visual: (item, { countries }, mode) => {
            const category = CATEGORIES.find(c => c.key === item.c) || CATEGORIES[0];
            const facts = { ...(item.f || {}) };
            if (item.c === 'stat' && !facts.area) facts.area = 100000;
            const base = category.mapSpan * (mode === 'location' && item.c !== 'stat' ? 1.5 : 1);
            return {
                type: 'map',
                lat: item.la,
                lon: item.lo,
                span: getMapSpan(facts, base),
                highlightIso: item.c === 'stat' && countries[item.q] ? countries[item.q].iso : '',
                label: item.c === 'stat' ? 'Stát je uprostřed' : 'Místo je uprostřed'
            };
        },

        // mode: 'name' / 'location' (nápověda u otázky), 'result' (po odpovědi), 'card' (okno a atlas – stát a kontinent ukazuje podtitulek)
        facts: (item, { countries }, mode) => {
            const facts = [];
            const countryNames = getCountryNames(item, countries);
            if ((mode === 'name' || mode === 'result') && item.c !== 'stat' && countryNames.length) {
                facts.push({ label: countryNames.length > 1 ? 'Státy' : 'Stát', value: countryNames.join(', ') });
            }
            const continent = getContinent(item, countries);
            if (mode !== 'card' && continent) facts.push({ label: 'Kontinent', value: CONTINENT_NAMES[continent] });
            return [...facts, ...formatFacts(item, FACT_FORMATS)];
        },

        subtitle,
        coords: (item) => ({ lat: item.la, lon: item.lo }),
        isCzech: (item) => (item.co || []).includes(CZECHIA_QID)
    };
});
