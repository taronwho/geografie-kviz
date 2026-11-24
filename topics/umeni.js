// Téma Výtvarné umění: obrazy, sochy, malíři a sochaři, směry, fotografové, ilustrátoři; užité umění – móda, design, šperky a písma (data/umeni.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { formatYear, formatFacts, censorName, shuffle, normalizeAnswer, eraNearness, rankBySimilarity, takeDistinct, centuryLabel } = core;

    const CATEGORIES = [
        { key: 'obrazy', label: 'Obrazy', one: 'obraz', icon: 'frame', question: 'Co je to za obraz?', placeholder: 'Napiš název obrazu…', sort: { by: 'y' } },
        { key: 'sochy', label: 'Sochy', one: 'socha', icon: 'person-standing', question: 'Co je to za sochu?', placeholder: 'Napiš název sochy…', sort: { by: 'y' } },
        { key: 'umelci', label: 'Malíři a sochaři', one: 'umělec', icon: 'brush', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } },
        { key: 'smery', label: 'Umělecké směry', one: 'směr', icon: 'layers', question: 'Jaký je to umělecký směr?', placeholder: 'Napiš název směru…', sort: { by: 'y' } },
        { key: 'fotografove', label: 'Fotografové', one: 'fotograf', icon: 'image', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } },
        { key: 'ilustratori', label: 'Ilustrátoři a karikaturisté', one: 'ilustrátor', icon: 'pencil', question: 'Kdo to je?', placeholder: 'Napiš jméno…', sort: { by: 'y' } },
        // Rozšíření o užité umění (scripts/lib/umeni-rozsireni.mjs); otázku podle druhu dává questionTitle
        { key: 'moda', label: 'Móda a návrháři', one: 'módní návrhář či značka', icon: 'shirt', question: 'Kdo nebo co to je?', placeholder: 'Napiš jméno nebo název…', sort: { by: 'name' } },
        { key: 'design', label: 'Design a nábytek', one: 'designér či dílo designu', icon: 'armchair', question: 'Kdo nebo co to je?', placeholder: 'Napiš jméno nebo název…', sort: { by: 'name' } },
        { key: 'sperky', label: 'Šperky a klenoty', one: 'šperk či klenot', icon: 'gem', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'pisma', label: 'Písma a typografie', one: 'písmo či typografický pojem', icon: 'type', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } }
    ];
    const isWork = (item) => item.c === 'obrazy' || item.c === 'sochy';
    // Lidé: malíři a sochaři, fotografové, ilustrátoři a karikaturisté
    const isPerson = (item) => item.c === 'umelci' || item.c === 'fotografove' || item.c === 'ilustratori';
    // Užité umění: lidé (módní návrháři, designéři, klenotníci, typografové) a věci; druh (ty) určí otázku, skupinu nesprávných
    // možností a nápovědy
    const APPLIED = new Set(['moda', 'design', 'sperky', 'pisma']);
    const isApplied = (item) => APPLIED.has(item.c);
    const APPLIED_PEOPLE = new Set(['módní návrhář', 'módní návrhářka', 'návrhář obuvi', 'návrhářka obuvi', 'kostýmní návrhář', 'kostýmní návrhářka',
        'designér', 'designérka', 'sklářský výtvarník', 'sklářská výtvarnice', 'výrobce nábytku', 'výrobkyně nábytku', 'keramik', 'keramička',
        'klenotník', 'klenotnice', 'zlatník', 'zlatnice', 'šperkař', 'šperkařka', 'typograf', 'typografka', 'tiskař', 'tiskařka', 'grafický designér', 'grafická designérka']);
    const isAppliedPerson = (item) => isApplied(item) && APPLIED_PEOPLE.has(item.ty);
    // Kdo je člověk: všichni lidé tématu (příjmení jako odpověď, podobnost, fakta o životě)
    const isHuman = (item) => isPerson(item) || isAppliedPerson(item);
    // Skupina věcí užitého umění: nesprávné možnosti jen ze stejné skupiny (k módnímu domu módní domy a značky, k písmu písma)
    const APPLIED_GROUPS = {
        firma: ['módní dům', 'oděvní značka', 'značka designu', 'klenotnická firma'],
        hnuti: ['designové hnutí či sdružení'],
        pojem: ['druh šperku', 'klenotnický pojem', 'druh písma', 'typografický pojem', 'typografický znak']
    };
    const appliedGroup = (item) => isAppliedPerson(item) ? 'osoba' : Object.keys(APPLIED_GROUPS).find(group => APPLIED_GROUPS[group].includes(item.ty)) || 'vec';
    // Otázka podle druhu (štítek nad otázkou ukazuje druh, otázka mu musí odpovídat)
    const APPLIED_QUESTIONS = {
        'módní dům': 'Který módní dům to je?', 'oděvní značka': 'Která oděvní značka to je?', 'nábytek': 'Co je to za kus nábytku?',
        'designový předmět': 'Co je to za designový předmět?', 'značka designu': 'Která značka to je?',
        'designové hnutí či sdružení': 'Které hnutí či sdružení designu to je?',
        'koruna': 'Která koruna to je?', 'korunovační klenoty': 'Které korunovační klenoty to jsou?', 'klenot': 'Který klenot to je?',
        'poklad': 'Který poklad to je?', 'diamant': 'Který diamant to je?', 'druh šperku': 'Jaký druh šperku to je?',
        'klenotnická firma': 'Která klenotnická firma to je?', 'klenotnický pojem': 'Jaký pojem to je?',
        'písmo': 'Jaké je to písmo?', 'druh písma': 'Jaký druh písma to je?', 'typografický pojem': 'Jaký typografický pojem to je?',
        'typografický znak': 'Jaký typografický znak to je?'
    };
    // Obrázek, na který se ptáme hned (jako u obrazu): kus nábytku, předmět, šperk, koruna, vzorník písma; lidé a firmy ne
    const SHOWN_KINDS = new Set(['nábytek', 'designový předmět', 'koruna', 'korunovační klenoty', 'klenot', 'poklad', 'diamant', 'druh šperku', 'písmo', 'druh písma']);
    // Druhy, z nichž jeden je zároveň druhým (tiára je diadém, fraktura je gotické písmo, grotesk je bezpatkové písmo): jeden druhému
    // nesprávnou možností nebude, na fotce ani v popisu by nešly rozlišit
    const OVERLAPS = [['Diadém', 'Tiára'], ['Snubní prsten', 'Zásnubní prsten'], ['Prsten', 'Snubní prsten'], ['Prsten', 'Zásnubní prsten'],
        ['Přívěsek', 'Medailon'], ['Kamej', 'Medailon'], ['Kamej', 'Brož'], ['Kamej', 'Přívěsek'], ['Brož', 'Spona'], ['Náhrdelník', 'Torques'], ['Náušnice', 'Piercingové šperky'], ['Prsten', 'Kamej'],
        ['Gotické písmo', 'Fraktura'], ['Gotické písmo', 'Švabach'], ['Gotické písmo', 'Textura'], ['Gotické písmo', 'Rotunda'], ['Fraktura', 'Švabach'],
        ['Bezpatkové písmo', 'Grotesk'], ['Antikva', 'Humanistické písmo'], ['Font', 'Rodina písma'], ['Sazba', 'Fotosazba'], ['Sazba', 'Knihtisk'],
        ['Sazba', 'Desktop publishing'], ['Fotosazba', 'Desktop publishing'], ['Minuskule', 'Karolina'], ['Minuskule', 'Humanistické písmo'],
        ['Kaligrafie', 'Unciála'], ['Typografie', 'Sazba'], ['Koruna svatého Eduarda', 'Britské korunovační klenoty'], ['Britská imperiální koruna', 'Britské korunovační klenoty'],
        ['Svatováclavská koruna', 'České korunovační klenoty'], ['Svatovítský poklad', 'České korunovační klenoty'], ['Svatovítský poklad', 'Svatováclavská koruna'],
        ['Pražské slunce', 'Loretánský poklad']];
    const overlapping = (a, b) => OVERLAPS.some(([x, y]) => (a.n === x && b.n === y) || (a.n === y && b.n === x));
    // Poslední nápověda u věci užitého umění: počet slov a první písmeno názvu
    const nameShapeHint = (item) => {
        const words = core.stripBrackets(item.n).trim().split(/\s+/).length;
        return { kind: 'facts', label: 'tvar názvu', icon: 'type', facts: [{ label: 'Název', value: `${words} ${words === 1 ? 'slovo' : words < 5 ? 'slova' : 'slov'}, začíná na ${item.n.charAt(0).toUpperCase()}` }] };
    };
    // Popisek faktu s díly osoby podle oboru
    const WORKS_LABEL = { moda: 'Módní domy', design: 'Díla', sperky: 'Díla', pisma: 'Písma a díla' };

    // Jak často se u díla ptáme na autora a na umělecký směr (jinak na název)
    const AUTHOR_QUIZ_SHARE = 0.3;
    const STYLE_QUIZ_SHARE = 0.2;

    // Umělecké směry v časovém pořadí: na ty s accepted se dá ptát (od sousedních se jasně liší), ostatní jen pojmenujeme.
    // Psaná odpověď se u směru porovnává přesně (bez překlepů) – impresionismus a expresionismus se liší jen o dvě písmena.
    const STYLES = [
        { key: 'gotika', label: 'gotika', accepted: ['gotika', 'gotický', 'gotické', 'gotická'] },
        { key: 'renesance', label: 'renesance', accepted: ['renesance', 'renesanční'] },
        { key: 'baroko', label: 'baroko', accepted: ['baroko', 'barokní'] },
        { key: 'klasicismus', label: 'klasicismus', accepted: ['klasicismus', 'klasicistní', 'neoklasicismus'] },
        { key: 'romantismus', label: 'romantismus', accepted: ['romantismus', 'romantický', 'romantické'] },
        { key: 'realismus', label: 'realismus', accepted: ['realismus', 'realistický', 'realistické'] },
        { key: 'impresionismus', label: 'impresionismus', accepted: ['impresionismus', 'impresionistický', 'impresionistické'] },
        { key: 'secese', label: 'secese', accepted: ['secese', 'secesní', 'art nouveau'] },
        { key: 'expresionismus', label: 'expresionismus', accepted: ['expresionismus', 'expresionistický', 'expresionistické'] },
        { key: 'kubismus', label: 'kubismus', accepted: ['kubismus', 'kubistický', 'kubistické'] },
        { key: 'surrealismus', label: 'surrealismus', accepted: ['surrealismus', 'surrealistický', 'surrealistické'] },
        { key: 'popart', label: 'pop-art', accepted: ['pop-art', 'pop art', 'popart'] }
    ];
    const OTHER_STYLE_LABELS = {
        manyrismus: 'manýrismus', rokoko: 'rokoko', akademismus: 'akademismus', postimpresionismus: 'postimpresionismus', symbolismus: 'symbolismus',
        avantgarda: 'avantgarda', abstrakce: 'abstraktní umění'
    };
    const styleLabel = (key) => (STYLES.find(style => style.key === key) || {}).label || OTHER_STYLE_LABELS[key];
    // Slova všech směrů (i v jiném tvaru) – z popisu u otázky na směr zmizí, ať se nedá vybírat vylučováním
    const STYLE_WORDS = /(?<![\p{L}])(?:goti[kc]|renesan|barok|neoklasici|klasici|romanti|realis|surrealis|postimpresion|impresion|neoimpresion|seces|art nouveau|expresion|kubis|pop[- ]?art|manýris|rokok|symbolis|fauvis|futuris|dadais|abstrakt)\p{L}*/giu;

    const THIS_YEAR = new Date().getFullYear();
    // Renesanční mistři známí křestním jménem
    const FIRST_NAME_KNOWN = /^(Leonardo|Michelangelo|Rafael)\b/;
    const withoutDiacritics = (text) => text.normalize('NFD').replace(/\p{M}/gu, '');
    // Vznik díla: „kolem 1503“, „2. století př. n. l.“, u pravěku „kolem 29 000 př. n. l.“
    const yearText = (f) => {
        if (f.year !== undefined) return `${f.ya ? 'kolem ' : ''}${formatYear(f.year)}`;
        if (f.yc === undefined) return undefined;
        return f.yc <= -30 ? `kolem ${core.formatNumber(-f.yc * 100)} př. n. l.` : centuryLabel(f.yc);
    };
    // Evropský umělec k evropským – k Davidovi se nehodí Hokusai
    const EUROPE = new Set(['Česko', 'Slovensko', 'Československo', 'Itálie', 'Francie', 'Španělsko', 'Nizozemsko', 'Flandry', 'Belgie', 'Německo',
        'Rakousko', 'Švýcarsko', 'Spojené království', 'Anglie', 'Skotsko', 'Irsko', 'Rusko', 'Sovětský svaz', 'Ukrajina', 'Bělorusko', 'Polsko',
        'Maďarsko', 'Rumunsko', 'Bulharsko', 'Srbsko', 'Chorvatsko', 'Slovinsko', 'Řecko', 'Portugalsko', 'Norsko', 'Švédsko', 'Dánsko', 'Finsko',
        'Island', 'Litva', 'Lotyšsko', 'Estonsko']);
    const sameWorld = (a, b) => Boolean(a && b) && EUROPE.has(a) === EUROPE.has(b);
    // Rok vzniku díla pro výběr možností: přesný rok, jinak střed století, u pravěkého díla bez data podle směru (paleolit, neolit)
    const PREHISTORY = -3000;
    const workYear = (f) => (f.y !== undefined ? f.y : f.yc !== undefined ? f.yc * 100 - 50
        : /paleolit/iu.test(f.mov || '') ? -25000 : /neolit|mezolit/iu.test(f.mov || '') ? -5000 : undefined);
    // Blízkost dob u pravěku podle poměru stáří (30 000 a 35 000 let je blízko, 30 000 let a 80 let ne): od +6 po −20;
    // dílo bez známé doby k pravěkému −8 (bez data jsou skoro jen novější díla)
    const deepTime = (a, b) => {
        if (a === undefined || b === undefined) return -8;
        const ratio = Math.abs(Math.log((THIS_YEAR - a) / Math.max(1, THIS_YEAR - b)));
        return Math.max(-20, 6 - 10 * ratio);
    };
    // Umělci stejného pohlaví a co nejbližšího roku narození (k Davidu Černému současníci, ne Štursa)
    const artistSimilarity = (a, b) => {
        const distance = Math.abs(((a.f || {}).born ?? Infinity) - ((b.f || {}).born ?? -Infinity));
        return ((a.sx === 'f') !== (b.sx === 'f') ? -20 : 0) + Math.max(0, 6 - distance / 20);
    };
    const life = (f) => f.born === undefined ? undefined : f.died === undefined ? `nar. ${formatYear(f.born)}` : `${formatYear(f.born)}–${formatYear(f.died)}`;
    const movementsOf = (f) => (f.mov && f.mov.length ? [].concat(f.mov) : (f.mk || []).map(styleLabel).filter(Boolean)).slice(0, 2).join(', ');

    // --- Autor díla a jména umělců ---
    const authorOf = (item, ctx) => {
        const qid = item.f && item.f.bq;
        if (!qid || !ctx) return null;
        return (ctx.byId ? ctx.byId.get(qid) : (ctx.items || []).find(other => other.q === qid)) || null;
    };
    // Příjmení pro psanou odpověď (Picasso, van Gogh, da Vinci; Leonardo, Michelangelo, Rafael i křestním jménem),
    // jen když se s překlepem nedá splést s příjmením jiného umělce (Manet – Monet)
    const PARTICLES = new Set(['da', 'de', 'di', 'del', 'della', 'van', 'von', 'der', 'den', 'le', 'la', 'z', 'ze']);
    const surnameOf = (name) => {
        const words = name.replace(/\s+(mladší|starší)$/u, '').split(' ');
        if (words.length < 2) return null;
        const last = words[words.length - 1];
        const particle = words[words.length - 2];
        return PARTICLES.has(particle) && words.length >= 3 ? `${particle} ${last}` : last;
    };
    const aliasCache = new WeakMap();
    const safeSurnames = (items) => {
        if (!aliasCache.has(items)) {
            const surnames = items.filter(isHuman).map(other => [other.q, surnameOf(other.n)]).filter(([, surname]) => surname);
            // Příjmení, které je i názvem módního domu či firmy (Miuccia Prada – Prada, Moser), samo neplatí
            const things = items.filter(other => isApplied(other) && !isAppliedPerson(other)).map(other => [`vec:${other.q}`, other.n]);
            // (core.fuzzyTwins = porovnání každého s každým přes isAnswerMatch, jen bez dvojic, které se splést nemohou)
            const twins = core.fuzzyTwins([...surnames, ...things]);
            aliasCache.set(items, new Set(surnames.filter(([qid, surname]) => surname.length >= 3 && !twins.has(qid)).map(([qid]) => qid)));
        }
        return aliasCache.get(items);
    };
    const artistAliases = (item, ctx) => {
        const aliases = [];
        const surname = surnameOf(item.n);
        if (surname && safeSurnames((ctx && ctx.items) || [item]).has(item.q)) aliases.push(surname);
        const first = FIRST_NAME_KNOWN.exec(item.n);
        if (first && first[1] !== item.n) aliases.push(first[1]);
        return aliases;
    };

    // --- Fakta ---
    const factsOf = (item, mode) => {
        const f = item.f || {};
        const answered = mode === 'result' || mode === 'card';
        if (isWork(item)) {
            const facts = [];
            if (mode !== 'author' && f.by) facts.push({ label: 'Autor', value: f.by });
            if (mode !== 'author' && f.land) facts.push({ label: 'Země', value: f.land });
            if (mode !== 'style' && f.mov) facts.push({ label: 'Směr', value: f.mov });
            // Rok ukazuje časová osa; mezi fakty jen po odpovědi a tam, kde osa není (známe jen století)
            if (answered || f.year === undefined) {
                const when = yearText(f);
                if (when) facts.push({ label: 'Vznik', value: when });
            }
            return [...facts, ...formatFacts(item, [['tech', item.c === 'sochy' ? 'Materiál' : 'Technika', v => v], ['coll', 'Sbírka', v => v]])];
        }
        if (item.c === 'smery') {
            const facts = [];
            if (f.land) facts.push({ label: 'Země', value: f.land });
            if (answered && f.from !== undefined) facts.push({ label: 'Vznik', value: f.to !== undefined ? `${formatYear(f.from)}–${formatYear(f.to)}` : `od ${formatYear(f.from)}` });
            if (f.reps && f.reps.length) facts.push({ label: 'Představitelé', value: f.reps.join(', ') });
            return facts;
        }
        if (isApplied(item) && !isAppliedPerson(item)) {
            // Věc užitého umění: autor, zakladatel, země, sídlo a kde je uložena; rok vzniku ukazuje osa a podtitul (mezi fakty by ho
            // rozlišující údaj ukázal hned a osa by pak nic nepřidala)
            return formatFacts(item, [
                ['by', item.c === 'pisma' || item.c === 'design' ? 'Navrhl' : 'Autor', v => v], ['fo', 'Zakladatel', v => v], ['land', 'Země', v => v],
                ['seat', 'Sídlo', v => v], ['loc', 'Uloženo', v => v]]);
        }
        const facts = answered ? formatFacts(item, [['born', 'Narození', formatYear], ['died', 'Úmrtí', formatYear]], ['born', 'died']) : [];
        if (f.land) facts.push({ label: 'Země', value: f.land });
        if (isAppliedPerson(item)) {
            if (f.works && f.works.length) facts.push({ label: WORKS_LABEL[item.c], value: f.works.join(', ') });
            return facts;
        }
        const movements = movementsOf(f);
        if (movements) facts.push({ label: 'Směr', value: movements });
        if (f.works && f.works.length) facts.push({ label: f.works.length > 1 ? 'Slavná díla' : 'Slavné dílo', value: f.works.join(', ') });
        return facts;
    };

    // --- Časová osa s milníky dějin umění ---
    // [rok, událost, blízkost (umělecké 1, světové 0), směr, který událost prozradí]
    const ART_EVENTS = [
        [-447, 'stavba Parthenónu', 1], [476, 'pád Západořímské říše', 0], [800, 'korunovace Karla Velikého', 0],
        [1163, 'začátek stavby Notre-Dame', 1], [1347, 'morová epidemie v Evropě', 0], [1450, 'Gutenbergův knihtisk', 0],
        [1453, 'pád Konstantinopole', 0], [1492, 'objevení Ameriky', 0], [1506, 'začátek stavby chrámu sv. Petra', 1],
        [1517, 'počátek reformace', 0], [1618, 'začátek třicetileté války', 0], [1648, 'konec třicetileté války', 0],
        [1682, 'Versailles sídlem krále', 1], [1776, 'nezávislost USA', 0], [1789, 'Velká francouzská revoluce', 0],
        [1815, 'bitva u Waterloo', 0], [1839, 'vynález fotografie', 1], [1848, 'revoluce v Evropě', 0],
        [1863, 'Salon odmítnutých v Paříži', 1], [1874, 'první výstava impresionistů', 1, 'impresionismus'], [1889, 'stavba Eiffelovy věže', 1],
        [1895, 'první filmové promítání', 1], [1907, 'počátky kubismu', 1, 'kubismus'], [1914, 'začátek 1. světové války', 0],
        [1919, 'založení Bauhausu', 1], [1924, 'manifest surrealismu', 1, 'surrealismus'], [1939, 'začátek 2. světové války', 0],
        [1945, 'konec 2. světové války', 0], [1969, 'přistání na Měsíci', 0], [1989, 'pád Berlínské zdi', 0], [2001, 'útoky 11. září', 0]
    ];
    const CZECH_EVENTS = [
        [1348, 'založení Karlovy univerzity'], [1357, 'začátek stavby Karlova mostu'], [1415, 'upálení Jana Husa'], [1583, 'Rudolf II. přesídlil dvůr z Vídně'],
        [1620, 'bitva na Bílé hoře'], [1781, 'zrušení nevolnictví'], [1796, 'založení obrazárny Společnosti vlasteneckých přátel umění'], [1881, 'otevření Národního divadla'],
        [1887, 'založení Spolku Mánes'], [1907, 'první výstava Osmy'], [1918, 'vznik Československa'], [1938, 'Mnichovská dohoda'],
        [1948, 'komunistický převrat'], [1968, 'invaze vojsk Varšavské smlouvy'], [1989, 'sametová revoluce']
    ];
    // U českých položek mají přednost české události; u otázky na směr jen události, které směr nejmenují
    const anchorsFor = (item, withStyles = true) => {
        const own = item.cz === 1 ? CZECH_EVENTS.map(([year, text]) => [year, text, 2]) : [];
        const years = new Set(own.map(([year]) => year));
        return [...own, ...ART_EVENTS.filter(([year, , , style]) => !years.has(year) && (withStyles || !style))];
    };
    const timelineOf = (item, mode) => {
        const f = item.f || {};
        if (isWork(item)) {
            if (f.year === undefined || f.year < -3000) return null;
            return { type: 'timeline', spans: [], points: [f.year], hide: item.n, anchors: anchorsFor(item, mode !== 'style') };
        }
        if (item.c === 'smery') {
            if (f.y === undefined) return null;
            return f.from !== undefined && f.to !== undefined
                ? { type: 'timeline', spans: [{ kind: 'period', from: f.from, to: f.to }], points: [], spanLabel: 'období', hide: item.n, anchors: anchorsFor(item, false) }
                : { type: 'timeline', spans: [], points: [f.y], hide: item.n, anchors: anchorsFor(item, false) };
        }
        if (isApplied(item) && !isAppliedPerson(item)) {
            return f.year === undefined || f.year < -3000 ? null : { type: 'timeline', spans: [], points: [f.year], hide: item.n, anchors: anchorsFor(item) };
        }
        if (f.born === undefined) return null;
        const to = f.died ?? Math.min(THIS_YEAR, f.born + 100);
        return { type: 'timeline', spans: [{ kind: 'life', from: f.born, to }], points: [], hide: item.n, anchors: anchorsFor(item) };
    };

    // --- Zvláštní otázky ---
    const authorQuestion = (item, ctx, rng) => {
        const author = authorOf(item, ctx);
        if (!author || !ctx.items) return null;
        const a = author.f || {};
        // Nesprávní autoři: stejný obor (k obrazu malíři, k soše sochaři), pohlaví a doba, podobný směr a známost
        const sculptor = (other) => /sochař/u.test(other.ty || '');
        const wantSculptor = item.c === 'sochy';
        const shares = (other) => (a.mk || []).some(key => ((other.f || {}).mk || []).includes(key));
        const score = (other) => artistSimilarity(author, other) + (sculptor(other) === wantSculptor ? 3 : -2) + (shares(other) ? 2 : 0)
            + (sameWorld(a.land, (other.f || {}).land) ? 2 : 0) + (other.k === author.k ? 1 : 0) + ((other.cz === 1) === (author.cz === 1) ? 1 : 0);
        const candidates = ctx.items.filter(other => other.c === 'umelci' && other.q !== author.q);
        const wrong = takeDistinct(rankBySimilarity(candidates, other => score(other) + core.cultureScore(author, other), rng), 3, new Set([normalizeAnswer(author.n)]), other => other.n);
        if (wrong.length < 3) return null;
        const verb = item.c === 'sochy' ? 'Kdo vytvořil tuto sochu?' : item.ty === 'kresba' ? 'Kdo to nakreslil?' : 'Kdo to namaloval?';
        return {
            type: 'author',
            title: verb,
            showName: true,
            choices: shuffle([author, ...wrong], rng).map(other => ({ id: other.q, label: other.n, correct: other.q === author.q })),
            accepted: [...new Set([author.n, author.t, ...artistAliases(author, ctx)].filter(Boolean))],
            placeholder: 'Napiš jméno autora…',
            answerLabel: author.n
        };
    };
    const styleQuestion = (item, ctx, rng) => {
        const index = STYLES.findIndex(style => style.key === (item.f || {}).st);
        if (index < 0) return null;
        // Autor, kterého řadí i k jinému směru z otázky (Manet k realismu i impresionismu), by dal dvě obhajitelné odpovědi
        const author = authorOf(item, ctx);
        if (author && ((author.f || {}).mk || []).some(key => key !== item.f.st && STYLES.some(style => style.key === key))) return null;
        // Nesprávné směry co nejblíž v čase: sousední, pak o dva a o tři dál
        const wrong = [...shuffle([-1, 1], rng), ...shuffle([-2, 2], rng), ...shuffle([-3, 3], rng)]
            .map(offset => STYLES[index + offset]).filter(Boolean).slice(0, 3);
        const style = STYLES[index];
        return {
            type: 'style',
            title: 'Ke kterému uměleckému směru patří?',
            showName: true,
            choices: shuffle([style, ...wrong], rng).map(other => ({ id: `smer-${other.key}`, label: other.label, correct: other.key === style.key })),
            // Přesně, ale i bez háčků a čárek
            accepted: [...new Set(style.accepted.flatMap(word => [word, withoutDiacritics(word)]))],
            match: 'symbol',
            placeholder: 'Napiš směr, třeba baroko',
            answerLabel: style.label
        };
    };

    // Hlavní obrázek osobnosti, který ji neukazuje (quiz-core.js offSubjectRule, npm run audit:obrazky): hrob, pamětní deska, známka,
    // výstava jejích fotografií, obal desky s desítkami tváří; obrazy a sochy se ukazují samy
    const offSubjectPhoto = core.offSubjectRule({
        words: { umelci: core.OFF_SUBJECT.memorial, fotografove: core.OFF_SUBJECT.memorial, ilustratori: core.OFF_SUBJECT.memorial },
        ids: ['Q121903', 'Q469449', 'Q204218']
    });

    return {
        id: 'umeni',
        title: 'Výtvarné umění',
        // Krátký název na dlaždici úvodu na nízkém či úzkém displeji (app.js tileTitle)
        shortTitle: 'Umění',
        icon: 'palette',
        emoji: '🎨',
        color: 'orange',
        dataFile: 'data/umeni.json',
        subtitleIcon: 'palette',
        words: {
            question: 'Co je to?',
            one: 'dílo',
            next: 'Další otázka',
            atlas: 'Galerie umění',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavné obrazy, sochy a umělci'
        },
        categories: CATEGORIES,
        offSubjectPhoto,

        // Nesprávné možnosti: díla stejného autora a směru či doby, umělci stejného pohlaví, doby a směru; české k českým
        similarity: (item, other) => {
            const f = item.f || {};
            const g = other.f || {};
            const sameMovement = (f.mk || []).some(key => (g.mk || []).includes(key));
            const sameCzech = (item.cz === 1) === (other.cz === 1) ? 1 : -3;
            const land = (f.land && f.land === g.land ? 3 : 0) + (sameWorld(f.land, g.land) ? 1 : 0);
            if (item.c === 'smery') return eraNearness(f.y, g.y) + (f.land && f.land === g.land ? 2 : 0);
            // Užité umění: jen ze stejné skupiny (k osobě osoby, k písmu písma, k firmě firmy), u lidí pohlaví, doba a země, u věcí doba a země
            if (isApplied(item)) {
                if (appliedGroup(item) !== appliedGroup(other) || overlapping(item, other)) return -Infinity;
                // (doba váží dvojnásob: ke Garamondovi tiskaři 15. a 16. století, ne typograf 20. století jen proto, že je také Francouz)
                if (isAppliedPerson(item)) return 2 * artistSimilarity(item, other) + land + sameCzech;
                // Stejný druh má přednost (ke koruně koruny, ke kusu nábytku nábytek), i před českou stopou
                return (item.ty === other.ty ? 6 : 0) + (f.y !== undefined && g.y !== undefined ? eraNearness(f.y, g.y) : 0) + land + sameCzech;
            }
            if (isPerson(item)) return artistSimilarity(item, other) + (sameMovement ? 2 : 0) + land + sameCzech;
            // Pravěk: stáří se porovná poměrem (k Věstonické venuši sošky staré 20–40 tisíc let, ne pomník z 20. století, jen proto,
            // že je také z Česka) a stejný směr (paleolitické umění) váží
            const [ageA, ageB] = [workYear(f), workYear(g)];
            if (Math.min(ageA ?? Infinity, ageB ?? Infinity) < PREHISTORY) {
                return (sameMovement || (f.mov && f.mov === g.mov) ? 3 : 0) + deepTime(ageA, ageB) + land + sameCzech;
            }
            // Doba i přes přelom letopočtu (k Apollónovi Belvederskému antické sochy, ne Socha Svobody)
            const years = f.y !== undefined && g.y !== undefined ? Math.max(0, 4 - Math.abs(f.y - g.y) / 100) : 0;
            return (f.by && f.by === g.by ? 4 : 0) + (sameMovement ? 3 : 0) + eraNearness(f.y, g.y) + years + land + sameCzech;
        },
        // U díla s cizím štítkem Wikidat (Portinari Altarpiece → Portinarův triptych) platí i cizí název (al)
        nameAliases: (item, ctx) => isHuman(item) ? artistAliases(item, ctx) : [...(item.al || [])],
        // Věci užitého umění bez kulturní oblasti: ke Svatováclavské koruně jiné koruny, ne české klenoty jiného druhu
        culture: (item) => isApplied(item) && !isAppliedPerson(item) ? [] : undefined,
        questionTitle: (item) => (isApplied(item) && (isAppliedPerson(item) ? 'Kdo to je?' : APPLIED_QUESTIONS[item.ty])) || null,

        // U díla občas „Kdo to namaloval?“ (jen u jistého autora z dat) nebo „Ke kterému směru patří?“ (jen u jasného směru)
        specialQuestion: (item, ctx, rng) => {
            if (!isWork(item)) return null;
            const roll = rng();
            if (roll < AUTHOR_QUIZ_SHARE) return authorQuestion(item, ctx, rng);
            if (roll < AUTHOR_QUIZ_SHARE + STYLE_QUIZ_SHARE) return styleQuestion(item, ctx, rng);
            return null;
        },
        // Obraz či socha je vidět hned v otázce – bez něj by otázka nedávala smysl
        // U užitého umění kus nábytku, šperk, koruna či vzorník písma (bez obrázku s napsanou odpovědí, data/photo-text.json)
        questionImage: (item, ctx) => {
            if (isWork(item) && item.im && item.ih) return { file: item.im, hash: item.ih, label: item.c === 'sochy' ? 'Socha' : 'Obraz', icon: item.c === 'sochy' ? 'person-standing' : 'frame' };
            if (!isApplied(item) || !SHOWN_KINDS.has(item.ty) || !item.im || !item.ih || (ctx && ctx.textPhotos && ctx.textPhotos.has(item.im))) return null;
            const category = CATEGORIES.find(entry => entry.key === item.c);
            return { file: item.im, hash: item.ih, label: item.c === 'pisma' ? 'Ukázka písma' : item.ty.charAt(0).toUpperCase() + item.ty.slice(1), icon: category.icon };
        },
        // Nápovědy u autora: kdy a kde dílo vzniklo → odkud autor byl a kdy žil → jeho další díla;
        // u směru: technika a sbírka → časová osa bez událostí, které by směr pojmenovaly → autor
        hints: (item, ctx, type) => {
            const f = item.f || {};
            // Věc užitého umění: fotka, osa, fakta a nakonec tvar názvu (pojem či druh písma bez fotky a údajů tak bez nápovědy nezůstane)
            if (type === 'name' && isApplied(item) && !isAppliedPerson(item)) {
                return [{ kind: 'photo' }, { kind: 'visual', spec: timelineOf(item, 'name') }, { kind: 'facts', facts: factsOf(item, 'name') }, nameShapeHint(item)];
            }
            if (type === 'author') {
                const author = authorOf(item, ctx) || { f: {} };
                const a = author.f || {};
                const others = (a.works || []).filter(name => normalizeAnswer(name) !== normalizeAnswer(item.n)).slice(0, 3);
                return [
                    { kind: 'facts', label: 'o díle', icon: item.c === 'sochy' ? 'person-standing' : 'frame', facts: [
                        yearText(f) ? { label: 'Vznik', value: yearText(f) } : null, f.mov ? { label: 'Směr', value: f.mov } : null,
                        f.coll ? { label: 'Sbírka', value: f.coll } : null].filter(Boolean) },
                    { kind: 'facts', label: 'o autorovi', icon: 'user', facts: [
                        a.land ? { label: 'Země', value: a.land } : null, life(a) ? { label: 'Život', value: life(a) } : null].filter(Boolean) },
                    { kind: 'facts', label: 'další díla', icon: 'brush', facts: others.length ? [{ label: 'Další díla', value: others.join(', ') }] : [] }
                ];
            }
            if (type === 'style') {
                return [
                    { kind: 'facts', label: 'technika a sbírka', icon: 'frame', facts: formatFacts(item, [['tech', item.c === 'sochy' ? 'Materiál' : 'Technika', v => v],
                        ['coll', 'Sbírka', v => v], ['land', 'Země', v => v]]) },
                    { kind: 'visual', spec: timelineOf(item, 'style') },
                    { kind: 'facts', label: 'autor', icon: 'user', facts: f.by ? [{ label: 'Autor', value: f.by }] : [] }
                ];
            }
            return null;
        },
        // Popis: u autora zmizí jméno autora, u směru všechny směry (i letopočty století nechá – nejsou odpovědí)
        censor: (type, text, item, ctx) => {
            if (type === 'author') {
                const author = authorOf(item, ctx);
                return author ? censorName(text, [author.n, author.t, ...artistAliases(author, ctx)].join(', ')) : null;
            }
            if (type === 'style') return core.stripBrackets(text).replace(/\s{2,}/g, ' ').replace(STYLE_WORDS, '[***]');
            return null;
        },
        // Napsaný jiný umělec u otázky na autora
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'author') return null;
            const other = ctx.items.find(candidate => candidate.c === 'umelci' && candidate.q !== (item.f || {}).bq
                && core.isAnswerMatch(answer, [candidate.n, ...artistAliases(candidate, ctx)]));
            return other ? { topic: 'umeni', id: other.q } : null;
        },

        visual: (item, ctx, mode) => mode === 'author' ? null : timelineOf(item, mode),
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle: (item) => {
            const f = item.f || {};
            if (isWork(item)) return [f.by, yearText(f)].filter(Boolean).join(' · ') || (CATEGORIES.find(c => c.key === item.c) || {}).one;
            if (item.c === 'smery') return [f.land, f.from !== undefined ? (f.to !== undefined ? `${formatYear(f.from)}–${formatYear(f.to)}` : `od ${formatYear(f.from)}`) : null].filter(Boolean).join(' · ') || item.ty;
            if (isApplied(item) && !isAppliedPerson(item)) return [item.ty, f.year !== undefined ? formatYear(f.year) : null, f.land].filter(Boolean).join(' · ');
            return [life(f), f.land].filter(Boolean).join(' · ') || item.ty || 'umělec';
        },
        isCzech: (item) => item.cz === 1
    };
});
