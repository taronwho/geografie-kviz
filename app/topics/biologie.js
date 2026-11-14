// Téma Biologie: savci, ptáci, plazi a obojživelníci, ryby, hmyz, další bezobratlí, rostliny, houby, pravěcí tvorové, plemena psů a koček
// a lidské tělo (data/biologie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatFacts, formatNumber, censorName, shuffle, normalizeAnswer, buildCountryChoices, countryAnswers, censorCountry, getCountryAliases, findAnswerCountry } = core;

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
        { key: 'pravek', label: 'Pravěcí tvorové', one: 'pravěký tvor', icon: 'hourglass', question: 'Co je to za pravěkého tvora?', placeholder: 'Napiš název…' },
        { key: 'plemena', label: 'Plemena psů a koček', one: 'plemeno', icon: 'cat', question: 'Co je to za plemeno?', placeholder: 'Napiš název plemene…' },
        { key: 'telo', label: 'Lidské tělo', one: 'část těla', icon: 'person-standing', question: 'Která část těla to je?', placeholder: 'Napiš název…' }
    ].map(category => ({ sort: { by: 'name' }, ...category }));
    const isPlantLike = (item) => item.c === 'rostliny' || item.c === 'houby';
    // Plemena a lidské tělo nejsou druhy ve stromu taxonů: nemají řád ani čeleď, mají vlastní fakta a nápovědy
    const isBreed = (item) => item.c === 'plemena';
    const isBody = (item) => item.c === 'telo';

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

    // Plemeno: odkud pochází, skupina FCI a velikost; část těla: soustava a kde v těle je (latinský název je poslední nápovědou)
    const breedFacts = (item, mode) => formatFacts(item, [
        ...(mode === 'location' ? [] : [['land', 'Země původu', v => v]]),
        ['fci', 'Skupina FCI', v => v],
        ['hgt', 'Výška', upTo(formatLength)],
        ['mass', 'Hmotnost', upTo(formatMass)],
        ['life', 'Dožívá se', v => `až ${formatNumber(v)} let`]
    ]);
    const bodyFacts = (item, mode) => [
        ...formatFacts(item, [['sys', 'Soustava', v => v], ['part', 'Část těla', v => v]]),
        ...(mode === 'result' || mode === 'card' ? formatFacts(item, [['lat', 'Latinsky', v => v]]) : [])
    ];
    const factsOf = (item, mode) => {
        const f = item.f || {};
        if (isBreed(item)) return breedFacts(item, mode);
        if (isBody(item)) return bodyFacts(item, mode);
        // U otázky „Kam patří?“ zařazení od hledané úrovně níž chybí
        const hidden = mode === 'taxon' ? (isPlantLike(item) ? ['fam'] : ['ord', 'fam']) : [];
        // Jen české názvy skupin (vědecké jako Pangalliformes nic neřeknou) a čeleď, jen když se jmenuje jinak než řád (sokoli)
        const isCzechGroup = (key) => /^\p{Ll}/u.test(f[key] || '') && !(key === 'fam' && f.fam === f.ord);
        const levels = [['cls', 'Třída'], ['ord', 'Řád'], ['fam', 'Čeleď']].filter(([key]) => !hidden.includes(key) && isCzechGroup(key));
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

    // Slova se stejným kořenem (jeseteři – Jeseter malý – jeseterovití, růžovité – Růže, degus – degu, sibirica – sibiřská)
    // Latinský a český zápis se liší v pár hláskách (rosmarinus – rozmarýna, Phoenix – fénix, Cygnus – cygnus)
    const fold = (word) => normalizeAnswer(word).replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'k').replace(/[yj]/g, 'i')
        .replace(/c(?=[aou])|q/g, 'k').replace(/z/g, 's').replace(/w/g, 'v').replace(/x/g, 'ks');
    const sameRoot = (a, b) => {
        const x = fold(a);
        const y = fold(b);
        const shorter = Math.min(x.length, y.length);
        if (shorter < 3) return false;
        let common = 0;
        while (common < shorter && x[common] === y[common]) common++;
        return common >= 4 ? common >= shorter * 0.6 : common >= 3 && common >= shorter - 1;
    };
    const wordsOf = (text) => String(text || '').split(/[^\p{L}]+/u).filter(word => word.length >= 3);
    const sharesRoot = (text, other) => wordsOf(text).some(word => wordsOf(other).some(otherWord => sameRoot(word, otherWord)));
    // Vědecký název jako nápověda: slovo skoro stejné jako slovo českého jména (Pinus sibirica u borovice sibiřské,
    // Octodon degus u osmáka degu) by jméno prozradilo – nahradí se třemi tečkami (fakt se značkou [***] by se vyřadil celý); zbyde-li jen to, nápověda odpadne
    const latHintOf = (item) => {
        const lat = (item.f || {}).lat;
        if (!lat) return null;
        const masked = lat.split(' ').map(word => wordsOf(item.n).some(nameWord => sameRoot(word, nameWord)) ? '…' : word);
        return masked.some(word => /\p{L}{3,}/u.test(word)) ? masked.join(' ') : null;
    };

    // Nápovědy k otázce „Kam patří?“: fotka (podle vzhledu se pozná), u živočichů čeleď a nakonec známí příbuzní
    // z hledané skupiny (k šelmám vlk a kočka); mapa rozšíření ani hmotnost řád neprozradí
    const fameIndex = new WeakMap();
    const fameOf = (other, ctx) => {
        if (!fameIndex.has(ctx.items)) fameIndex.set(ctx.items, new Map(ctx.items.map((candidate, index) => [candidate.q, index])));
        return fameIndex.get(ctx.items).get(other.q) ?? Infinity;
    };
    const relativesOf = (item, ctx, levelKey, allowed = () => true) => {
        const group = (item.f || {})[levelKey];
        return ctx.items
            .filter(other => other.q !== item.q && other.c === item.c && other.f && other.f[levelKey] === group && allowed(other.n))
            .sort((a, b) => (b.k || 0) - (a.k || 0) || fameOf(a, ctx) - fameOf(b, ctx))
            .slice(0, 4).map(other => other.n);
    };
    const taxonHints = (item, ctx) => {
        const level = taxonLevel(item);
        const f = item.f || {};
        const answer = f[level.key];
        // Příbuzný nebo čeleď se jménem hledané skupiny (Jeseter malý, jeseterovití u jeseterů) by odpověď prozradili
        const relatives = relativesOf(item, ctx, level.key, (name) => !sharesRoot(name, answer));
        const family = level.key === 'ord' && /^\p{Ll}/u.test(f.fam || '') && !sharesRoot(f.fam, answer) ? f.fam : null;
        return [
            { kind: 'photo' },
            ...(family ? [{ kind: 'facts', label: 'čeleď', icon: 'git-branch', facts: [{ label: 'Čeleď', value: family }] }] : []),
            { kind: 'facts', label: 'příbuzní', icon: 'network', facts: relatives.length ? [{ label: level.key === 'ord' ? 'Ze stejného řádu' : 'Ze stejné čeledi', value: relatives.join(', ') }] : [] }
        ];
    };

    // Psaná odpověď na řád či čeleď i v jednotném čísle: hlodavci → hlodavec, ptáci → pták, psovití → psovitý,
    // růžovité → růžovitá, šelmy → šelma, letouni → letoun (u víceslovných názvů každé slovo)
    const SINGULAR_ENDINGS = [[/([^aeiouyáéíóúůý])ci$/u, '$1ec'], [/áci$/u, 'ák'], [/íci$/u, 'ík'], [/ouci$/u, 'ouk'], [/ití$/u, 'itý'], [/ité$/u, 'itá'], [/([^aeiouyáéíóúůý])y$/u, '$1a'], [/([^aeiouyáéíóúůýc])i$/u, '$1']];
    const singularsOf = (name) => {
        const forms = new Set();
        for (const [pattern, replacement] of SINGULAR_ENDINGS) {
            const words = name.split(' ').map(word => word.replace(pattern, replacement));
            const form = words.join(' ');
            if (form !== name) forms.add(form);
        }
        return [...forms];
    };

    const rangeMapOf = (item) => item.rm && item.rh ? { type: 'image', file: item.rm, hash: item.rh, name: 'mapa rozšíření', icon: 'map' } : null;

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
        // Samotné první slovo u plemene (Německý) ani části těla (Stehenní) nic neznamená
        const words = item.n.split(' ');
        if (!isBreed(item) && !isBody(item) && words.length > 1 && ctx && ctx.items && firstWordCounts(ctx.items).get(normalizeAnswer(words[0])) === 1) aliases.push(words[0]);
        return aliases;
    };

    // Odkud plemeno pochází: jen když je země v tabulce států a název ji neprozradí (Německý ovčák)
    const BREED_COUNTRY_SHARE = 0.3;
    const breedCountry = (item, countries) => {
        const land = (item.f || {}).land;
        const id = land && countries ? Object.keys(countries).find(qid => countries[qid].name === land) : null;
        if (!id) return null;
        return [land, ...getCountryAliases([id])].some(word => core.isFactVisible(word, item.n)) ? null : id;
    };
    // Nesprávné možnosti: země, odkud pocházejí jiná plemena (Německo, Francie, Japonsko…), nejdřív ze stejného kontinentu;
    // když jich je málo, doplní je sousední státy
    const breedCountryChoices = (id, ctx, rng) => {
        const countries = ctx.countries;
        const origins = new Set(ctx.items.filter(other => isBreed(other)).map(other => breedCountry(other, countries) || Object.keys(countries)
            .find(qid => countries[qid].name === (other.f || {}).land)).filter(qid => qid && qid !== id));
        const ranked = shuffle([...origins], rng).sort((a, b) => (countries[b].continent === countries[id].continent) - (countries[a].continent === countries[id].continent));
        const wrong = ranked.slice(0, 3);
        const fallback = buildCountryChoices(id, countries, rng).filter(choice => !choice.correct && !wrong.includes(choice.id)).map(choice => choice.id);
        const picked = [...wrong, ...fallback].slice(0, 3);
        return shuffle([id, ...picked], rng).map(qid => ({ id: qid, label: countries[qid].name, correct: qid === id, topic: 'zemepis' }));
    };
    const breedCountryQuestion = (item, ctx, rng) => {
        const id = breedCountry(item, ctx.countries);
        if (!id) return null;
        const name = ctx.countries[id].name;
        return {
            type: 'location',
            title: 'Ze které země plemeno pochází?',
            showName: true,
            choices: breedCountryChoices(id, ctx, rng),
            accepted: countryAnswers([id], [name]),
            placeholder: 'Napiš stát…',
            answerLabel: name
        };
    };
    // Nápovědy: plemeno se pozná podle fotky, pak velikost a skupina, nakonec země původu; část těla podle kresby, soustavy
    // a místa v těle, nakonec latinský název (slova podobná českému názvu se zakryjí)
    const breedHints = (item, type) => {
        const facts = breedFacts(item, type);
        const land = facts.filter(fact => fact.label === 'Země původu');
        return [{ kind: 'photo' }, { kind: 'facts', facts: facts.filter(fact => fact.label !== 'Země původu') },
            { kind: 'facts', label: 'země původu', icon: 'map-pin', facts: land }];
    };
    const bodyHints = (item, type) => {
        const lat = latHintOf(item);
        return [{ kind: 'photo' }, { kind: 'facts', facts: bodyFacts(item, type) },
            { kind: 'facts', label: 'latinsky', icon: 'book-open', facts: lat ? [{ label: 'Latinsky', value: lat }] : [] }];
    };
    // Nesprávné možnosti plemene: stejný druh (k psovi psi), skupina FCI, země a velikost; části těla: stejná soustava a místo v těle
    const breedSimilarity = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        const sameSize = f.mass && g.mass && Math.max(f.mass, g.mass) / Math.min(f.mass, g.mass) < 1.6;
        return (f.kind === g.kind ? 0 : -50) + (f.fci && f.fci === g.fci ? 3 : 0) + (f.land && f.land === g.land ? 2 : 0) + (sameSize ? 1 : 0);
    };
    const bodySimilarity = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        return (f.sys && f.sys === g.sys ? 3 : 0) + (f.part && f.part === g.part ? 3 : 0);
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
            tierKnown: 'Známá zvířata, rostliny, houby, plemena a části těla',
            czechBadge: 'Žije v Česku'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: nejbližší příbuzní (stejná čeleď, pak řád), podobné jméno (sýkora k sýkorám)
        // a stejný původ (k naší přírodě naše druhy, k exotickým exotické)
        similarity: (item, other) => {
            if (isBreed(item)) return breedSimilarity(item, other);
            if (isBody(item)) return bodySimilarity(item, other);
            const f = item.f || {};
            const g = other.f || {};
            let score = f.fam && f.fam === g.fam ? 4 : f.ord && f.ord === g.ord ? 2 : f.cls && f.cls === g.cls ? 1 : 0;
            if (normalizeAnswer(item.n.split(' ')[0]) === normalizeAnswer(other.n.split(' ')[0])) score += 2;
            if ((item.cz === 1) === (other.cz === 1)) score += 1;
            return score;
        },
        nameAliases,

        // Občas „Do kterého řádu patří?“ – název je vidět, možnosti jsou jiné řády stejné třídy (u rostlin čeledi stejného řádu či třídy)
        specialQuestion: (item, ctx, rng) => {
            if (isBreed(item)) return rng() < BREED_COUNTRY_SHARE ? breedCountryQuestion(item, ctx, rng) : null;
            if (isBody(item)) return null;
            if (!(rng() < TAXON_QUIZ_SHARE)) return null;
            const level = taxonLevel(item);
            const f = item.f || {};
            const answer = f[level.key];
            // Jen české názvy skupin (malým písmenem); vědecké (Pangalliformes) by byly jen hádání
            const isCzechName = (label) => Boolean(label) && /^\p{Ll}/u.test(label);
            if (!isCzechName(answer)) return null;
            // Skupina, kterou prozradí už název (krokodýl nilský → krokodýli, hřib → hřibovité), by nebyla otázka
            if (answer.split(' ').some(word => core.isFactVisible(word, item.n))) return null;
            // Sesterské skupiny seřazené podle toho, kolik druhů v nich máme – běžné řády (hlodavci, kytovci), ne vzácné (luskouni)
            const siblings = (parentKey) => {
                const counts = new Map();
                for (const other of ctx.items) {
                    const label = other.f && other.f[level.key];
                    const sameParent = !parentKey || (other.f[parentKey] && other.f[parentKey] === f[parentKey]);
                    if (other.c === item.c && other.f && sameParent && isCzechName(label) && label !== answer) {
                        counts.set(label, (counts.get(label) || 0) + 1);
                    }
                }
                return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs')).map(([label]) => label).slice(0, 6);
            };
            let others = siblings(level.parent);
            if (others.length < 3 && level.parent !== 'cls') others = siblings('cls');
            if (others.length < 3) others = siblings(null);
            if (others.length < 3) return null;
            const wrong = shuffle(others, rng).slice(0, 3);
            return {
                type: 'taxon',
                title: level.title,
                showName: true,
                choices: shuffle([answer, ...wrong], rng).map(label => ({ id: `taxon-${label}`, label, correct: label === answer })),
                accepted: [answer, ...singularsOf(answer)],
                placeholder: `Napiš ${level.key === 'ord' ? 'řád' : 'čeleď'}, třeba ${level.key === 'ord' ? 'šelmy' : 'růžovité'}`,
                answerLabel: answer
            };
        },
        // U otázky „Kam patří?“ zmizí z popisu hledaná skupina (i ta pod ní); název druhu zůstane vidět
        censor: (type, text, item, ctx) => {
            if (type === 'location' && isBreed(item)) {
                const id = breedCountry(item, ctx.countries);
                return id ? censorCountry(text, ctx.countries[id].name, getCountryAliases([id])) : null;
            }
            if (type !== 'taxon') return null;
            const f = item.f || {};
            const hide = (isPlantLike(item) ? [f.fam] : [f.ord, f.fam]).filter(Boolean);
            return hide.length ? censorName(text, [...hide, ...hide.flatMap(singularsOf)].join(', ')) : text;
        },

        // U „Co je to za zvíře?“ navíc jako poslední nápověda vědecký název (v popisu je zakrytý)
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'location') return null;
            const id = findAnswerCountry(answer, [breedCountry(item, ctx.countries)].filter(Boolean), ctx.countries || {});
            return id ? { topic: 'zemepis', id } : null;
        },
        hints: (item, ctx, type) => {
            if (isBreed(item)) return breedHints(item, type);
            if (isBody(item)) return bodyHints(item, type);
            if (type === 'taxon') return taxonHints(item, ctx);
            const lat = latHintOf(item);
            return [{ kind: 'photo' }, { kind: 'visual', spec: rangeMapOf(item) }, { kind: 'facts', facts: factsOf(item, type) },
                { kind: 'facts', label: 'vědecký název', icon: 'microscope', facts: lat ? [{ label: 'Vědecký název', value: lat }] : [] }];
        },
        // Mapa rozšíření z Wikimedia Commons
        visual: (item) => rangeMapOf(item),
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            if (isBreed(item)) return [item.ty, f.land].filter(Boolean).join(' · ');
            if (isBody(item)) return [item.ty, f.sys].filter(Boolean).join(' · ');
            return [f.lat, f.cls].filter(Boolean).join(' · ') || (CATEGORIES.find(category => category.key === item.c) || {}).one || '';
        },
        isCzech: (item) => item.cz === 1
    };
});
