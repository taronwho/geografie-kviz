// Téma Biologie: savci, ptáci, plazi a obojživelníci, ryby, hmyz, další bezobratlí, rostliny, houby a pravěcí tvorové (data/biologie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatFacts, formatNumber, censorName, shuffle, normalizeAnswer } = core;

    const ANIMAL = { question: 'Co je to za zvíře?', placeholder: 'Napiš název zvířete…' };
    const CATEGORIES = [
        { key: 'savci', label: 'Savci', one: 'savec', icon: 'paw-print', ...ANIMAL },
        { key: 'ptaci', label: 'Ptáci', one: 'pták', icon: 'bird', question: 'Co je to za ptáka?', placeholder: 'Napiš název ptáka…' },
        { key: 'plazi', label: 'Plazi a obojživelníci', one: 'plaz nebo obojživelník', icon: 'turtle', ...ANIMAL },
        { key: 'ryby', label: 'Ryby', one: 'ryba', icon: 'fish', question: 'Co je to za rybu?', placeholder: 'Napiš název ryby…' },
        { key: 'hmyz', label: 'Hmyz', one: 'hmyz', icon: 'bug', ...ANIMAL },
        { key: 'bezobratli', label: 'Další bezobratlí', one: 'bezobratlý živočich', icon: 'shell', ...ANIMAL },
        { key: 'rostliny', label: 'Rostliny', one: 'rostlina', icon: 'flower-2', question: 'Co je to za rostlinu?', placeholder: 'Napiš název rostliny…' },
        { key: 'houby', label: 'Houby', one: 'houba', icon: 'sprout', question: 'Co je to za houbu?', placeholder: 'Napiš název houby…' },
        { key: 'pravek', label: 'Pravěcí tvorové', one: 'pravěký tvor', icon: 'hourglass', question: 'Co je to za pravěkého tvora?', placeholder: 'Napiš název…' }
    ].map(category => ({ sort: { by: 'name' }, ...category }));
    const isPlantLike = (item) => item.c === 'rostliny' || item.c === 'houby';

    // Jak často se místo „Co je to za zvíře?“ ptáme „Do kterého řádu patří?“ (u rostlin a hub na čeleď)
    const TAXON_QUIZ_SHARE = 0.3;
    const IUCN = {
        LC: 'málo dotčený', NT: 'téměř ohrožený', VU: 'zranitelný', EN: 'ohrožený', CR: 'kriticky ohrožený',
        EW: 'vyhynulý v přírodě', EX: 'vyhynulý', DD: 'chybí údaje'
    };

    const formatMass = (kg) => kg >= 1000 ? `${formatNumber(Math.round(kg / 100) / 10)} t` : kg >= 1 ? `${formatNumber(Math.round(kg * 10) / 10)} kg` : `${formatNumber(Math.round(kg * 10000) / 10)} g`;
    const formatLength = (m) => m >= 1 ? `${formatNumber(Math.round(m * 100) / 100)} m` : m >= 0.01 ? `${formatNumber(Math.round(m * 1000) / 10)} cm` : `${formatNumber(Math.round(m * 10000) / 10)} mm`;
    const upTo = (format) => (value) => `až ${format(value)}`;

    // Úroveň zařazení, na kterou se ptá otázka „Kam patří?“: u živočichů řád, u rostlin a hub čeleď
    const taxonLevel = (item) => isPlantLike(item)
        ? { key: 'fam', parent: 'ord', title: 'Do které čeledi patří?', label: 'Čeleď' }
        : { key: 'ord', parent: 'cls', title: 'Do kterého řádu patří?', label: 'Řád' };

    const factsOf = (item, mode) => {
        const f = item.f || {};
        // U otázky „Kam patří?“ zařazení od hledané úrovně níž chybí
        const hidden = mode === 'taxon' ? (isPlantLike(item) ? ['fam'] : ['ord', 'fam']) : [];
        const levels = [['cls', 'Třída'], ['ord', 'Řád'], ['fam', 'Čeleď']].filter(([key]) => !hidden.includes(key));
        const facts = formatFacts(item, [
            ...levels.map(([key, label]) => [key, label, v => v]),
            ['iucn', 'Ohrožení', v => IUCN[v] || v],
            ['mass', 'Hmotnost', upTo(formatMass)],
            ['len', 'Délka', upTo(formatLength)],
            ['hgt', 'Výška', upTo(formatLength)],
            ['life', 'Dožívá se', v => `až ${formatNumber(v)} let`],
            ['edib', 'Jedlost', v => v]
        ]);
        // Vědecký název až po odpovědi (u mnoha druhů by ji prozradil)
        if (mode === 'result' || mode === 'card') facts.push(...formatFacts(item, [['lat', 'Vědecký název', v => v]]));
        return facts;
    };

    // Psaná odpověď: i vědecký název a samotné první slovo, pokud ho nemá žádný jiný druh („lev“, ale ne „sýkora“)
    const firstWords = new WeakMap();
    const firstWordCounts = (items) => {
        if (!firstWords.has(items)) {
            const counts = new Map();
            for (const other of items) {
                const word = normalizeAnswer(other.n.split(' ')[0]);
                counts.set(word, (counts.get(word) || 0) + 1);
            }
            firstWords.set(items, counts);
        }
        return firstWords.get(items);
    };
    const nameAliases = (item, ctx) => {
        const aliases = [];
        if (item.f && item.f.lat) aliases.push(item.f.lat);
        const words = item.n.split(' ');
        if (words.length > 1 && ctx && ctx.items && firstWordCounts(ctx.items).get(normalizeAnswer(words[0])) === 1) aliases.push(words[0]);
        return aliases;
    };

    return {
        id: 'biologie',
        title: 'Biologie',
        icon: 'leaf',
        emoji: '🌿',
        color: 'lime',
        dataFile: 'data/biologie.json',
        subtitleIcon: 'microscope',
        words: {
            question: 'Co je to?',
            one: 'organismus',
            next: 'Další otázka',
            atlas: 'Atlas přírody',
            placeholder: 'Napiš název…',
            tierKnown: 'Známá zvířata, rostliny a houby',
            czechBadge: 'Žije v Česku'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti přednostně ze stejného řádu (šelma k šelmám)
        groupOf: (item) => (item.f && (item.f.ord || item.f.cls)) || '',
        nameAliases,

        // Občas „Do kterého řádu patří?“ – název je vidět, možnosti jsou jiné řády stejné třídy (u rostlin čeledi stejného řádu či třídy)
        specialQuestion: (item, ctx, rng) => {
            if (!(rng() < TAXON_QUIZ_SHARE)) return null;
            const level = taxonLevel(item);
            const f = item.f || {};
            const answer = f[level.key];
            // Jen české názvy skupin (malým písmenem); vědecké (Pangalliformes) by byly jen hádání
            const isCzechName = (label) => Boolean(label) && /^\p{Ll}/u.test(label);
            if (!isCzechName(answer)) return null;
            const siblings = (parentKey) => [...new Set(ctx.items
                .filter(other => other.f && other.f[parentKey] && other.f[parentKey] === f[parentKey] && isCzechName(other.f[level.key]) && other.f[level.key] !== answer)
                .map(other => other.f[level.key]))].sort();
            let others = siblings(level.parent);
            if (others.length < 3 && level.parent !== 'cls') others = siblings('cls');
            if (others.length < 3) return null;
            const wrong = shuffle(others, rng).slice(0, 3);
            return {
                type: 'taxon',
                title: level.title,
                showName: true,
                choices: shuffle([answer, ...wrong], rng).map(label => ({ id: `taxon-${label}`, label, correct: label === answer })),
                accepted: [answer],
                placeholder: `Napiš ${level.key === 'ord' ? 'řád' : 'čeleď'}, třeba ${level.key === 'ord' ? 'šelmy' : 'růžovité'}`,
                answerLabel: answer
            };
        },
        // U otázky „Kam patří?“ zmizí z popisu hledaná skupina (i ta pod ní); název druhu zůstane vidět
        censor: (type, text, item) => {
            if (type !== 'taxon') return null;
            const f = item.f || {};
            const hide = (isPlantLike(item) ? [f.fam] : [f.ord, f.fam]).filter(Boolean);
            return hide.length ? censorName(text, hide.join(', ')) : text;
        },

        // Mapa rozšíření z Wikimedia Commons
        visual: (item) => item.rm && item.rh ? { type: 'image', file: item.rm, hash: item.rh, name: 'mapa rozšíření', icon: 'map' } : null,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            return [f.lat, f.cls].filter(Boolean).join(' · ') || (CATEGORIES.find(category => category.key === item.c) || {}).one || '';
        },
        isCzech: (item) => item.cz === 1
    };
});
