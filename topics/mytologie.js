// Téma Mytologie: bohové a hrdinové řecké a římské, egyptské, severské a slovanské mytologie, Staré pověsti české
// a bájné bytosti, náboženství, světci a světice, záhady a legendy (data/mytologie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { censorName, displayName, normalizeAnswer, shuffle, isRealPhoto, isAnswerMatch, nameAnswers, mergeCensored } = core;

    const PERSON = { question: 'Kdo je to?', placeholder: 'Napiš jméno…', sort: { by: 'name' } };
    const CATEGORIES = [
        { key: 'recka', label: 'Řecká a římská mytologie', one: 'postava', icon: 'zap', ...PERSON },
        { key: 'egyptska', label: 'Egyptská mytologie', one: 'postava', icon: 'pyramid', ...PERSON },
        { key: 'severska', label: 'Severská mytologie', one: 'postava', icon: 'sword', ...PERSON },
        { key: 'slovanska', label: 'Slované a české pověsti', one: 'postava', icon: 'castle', ...PERSON },
        { key: 'indicka', label: 'Indická mytologie', one: 'postava', icon: 'flame', ...PERSON },
        { key: 'keltska', label: 'Keltská mytologie a král Artuš', one: 'postava', icon: 'trees', ...PERSON },
        { key: 'vychod', label: 'Japonská a čínská mytologie', one: 'postava', icon: 'sun', ...PERSON },
        { key: 'orient', label: 'Mezopotámie a starověký Orient', one: 'postava', icon: 'landmark', ...PERSON },
        { key: 'amerika', label: 'Aztékové, Mayové a Inkové', one: 'postava', icon: 'triangle', ...PERSON },
        { key: 'bytosti', label: 'Bájné bytosti', one: 'bytost', icon: 'ghost', question: 'Co je to za bytost?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'predmety', label: 'Bájná místa a předměty', one: 'místo či předmět', icon: 'compass', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        // Rozšíření (scripts/lib/mytologie-rozsireni.mjs): náboženství, světci a záhady
        { key: 'nabozenstvi', label: 'Náboženství', one: 'náboženský pojem', icon: 'sun-moon', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } },
        { key: 'svetci', label: 'Světci a světice', one: 'světec', icon: 'cross', question: 'Kdo je to?', placeholder: 'Napiš jméno…', sort: { by: 'name' } },
        { key: 'zahady', label: 'Záhady a legendy', one: 'záhada', icon: 'search', question: 'Co je to?', placeholder: 'Napiš název…', sort: { by: 'name' } }
    ];
    const EXTRA = new Set(['nabozenstvi', 'svetci', 'zahady']);

    // Mytologie pro otázku „Ze které mytologie je?“: popisek a přijímané psané odpovědi
    const MYTHS = {
        recka: { label: 'řecká', accepted: ['řecká', 'řecká mytologie', 'Řecko', 'řecké', 'starořecká', 'antická'] },
        rimska: { label: 'římská', accepted: ['římská', 'římská mytologie', 'Řím', 'římské', 'starořímská'] },
        egyptska: { label: 'egyptská', accepted: ['egyptská', 'egyptská mytologie', 'Egypt', 'egyptské', 'staroegyptská'] },
        severska: { label: 'severská', accepted: ['severská', 'severská mytologie', 'nordická', 'germánská', 'skandinávská', 'vikingská'] },
        slovanska: { label: 'slovanská', accepted: ['slovanská', 'slovanská mytologie', 'Slované', 'slovanské', 'praslovanská'] },
        indicka: { label: 'indická', accepted: ['indická', 'indická mytologie', 'hinduistická', 'hinduistická mytologie', 'hinduismus', 'Indie', 'indické', 'védská'] },
        keltska: { label: 'keltská', accepted: ['keltská', 'keltská mytologie', 'Keltové', 'keltské', 'irská', 'irská mytologie', 'velšská', 'galská'] },
        japonska: { label: 'japonská', accepted: ['japonská', 'japonská mytologie', 'Japonsko', 'japonské', 'šintoistická', 'šintoismus'] },
        cinska: { label: 'čínská', accepted: ['čínská', 'čínská mytologie', 'Čína', 'čínské', 'taoistická'] },
        mezopotamska: { label: 'mezopotámská', accepted: ['mezopotámská', 'mezopotámská mytologie', 'Mezopotámie', 'sumerská', 'sumerská mytologie', 'babylonská', 'babylónská', 'akkadská', 'asyrská'] },
        kanaanska: { label: 'kanaánská', accepted: ['kanaánská', 'kanaánská mytologie', 'Kanaán', 'fénická', 'ugaritská'] },
        perska: { label: 'perská', accepted: ['perská', 'perská mytologie', 'Persie', 'perské', 'íránská', 'zoroastrijská'] },
        aztecka: { label: 'aztécká', accepted: ['aztécká', 'aztécká mytologie', 'Aztékové', 'aztécké', 'aztec'] },
        mayska: { label: 'mayská', accepted: ['mayská', 'mayská mytologie', 'Mayové', 'mayské', 'májská'] },
        incka: { label: 'incká', accepted: ['incká', 'incká mytologie', 'Inkové', 'incké', 'andská'] },
        biblicka: { label: 'židovsko-křesťanská', accepted: ['židovsko-křesťanská', 'biblická', 'křesťanská', 'židovská', 'abrahámovská', 'Bible', 'biblické', 'křesťanství', 'judaismus'] }
    };
    // Blízké mytologie, které se u otázky „Ze které mytologie je?“ nesejdou (Quetzalcoatl je aztécký i mayský Kukulkán)
    const CLOSE = {
        aztecka: ['mayska', 'incka'], mayska: ['aztecka', 'incka'], incka: ['aztecka', 'mayska'], kanaanska: ['mezopotamska', 'biblicka'],
        mezopotamska: ['kanaanska', 'perska', 'biblicka'], perska: ['mezopotamska', 'biblicka'], cinska: ['japonska'], japonska: ['cinska'],
        keltska: ['severska'], severska: ['keltska'], biblicka: ['kanaanska', 'mezopotamska', 'perska']
    };
    // Slova, která v popisu prozradí mytologii (řecký, Olymp, faraon, Edda, Slované…), i jména národů (Babyloňané, Egypťané, Číňané)
    const MYTH_WORDS = /(?<![\p{L}\d])(?:staro|pra)?(?:řeck|římsk|helén|antick|egyp[tť]|babyl|japon|Čí[nň]|Ind(?:ové|ů|ům)|hindu|asy[rř]|May(?:ové|ů|ům)|féni|akka[dď]|severs|germán|skandináv|nordick|norsk|islandsk|vikin|slovan|olymp|Řím|Řek(?:ové|ů|ům)|Egypt|Edd|Ásgard|Ás[ouy]|Vanov|faraon|Slovan|Nil|Thé[bv]|Memfi|Heliopol|Valhal|Walhal|Ragnar|Ygg|Midgard|Atén|Athén|Trój|Homér|Hésiod|Ovid|Vergil|indick|Indi[eiíe]|hinduis|védsk|keltsk|Kelt|irsk|Irsk|velšsk|artuš|Artuš|Camelot|japonsk|Japonsk|šintoi|čínsk|Čín|taoi|mezopotám|sumer|akkad|babylon|babylón|asyrsk|aztéc|Azték|Aztéc|mayš|maysk|májsk|Maj(?:ové|ů)|inck|Ink(?:ové|ů|a|y|ou)|persk|perš|Persi|zoroastr|kanaán|Kanaán|fénick|biblick|Bibl|křesťan|židovsk|abrahám|islám|Jeruzalém|Eden|judais|kabal|džinis|buddh|muslim|konfuci|galsk|Gal(?:ové|ů)|Galie|íránsk|Írán|ugarit|hebrej|Izrael|izraelsk|sumersk|Babylón|Asýri|Ninive|Uruk|Ur\b|Andy|andsk|Peru|Mexik|Tenochtitl|Yucatán|Tibet|tibetsk|Nepál|Srí|Kambodž|Angkor)\p{L}*/giu;

    // Jak často se místo „Kdo je to?“ ptáme na protějšek (u klasických dvojic) nebo na mytologii
    const COUNTERPART_QUIZ_SHARE = 0.35;
    const MYTH_QUIZ_SHARE = 0.2;

    // Bytosti a bohové, kteří splývají (Medúsa je jedna z gorgon, ježibaba je Baba Jaga, satyr je řecký faun) –
    // spolu mezi možnostmi nebudou, odpověď by byla sporná
    const CONFUSABLE = [
        ['Medúsa', 'Gorgony'], ['Satyr', 'Faun'], ['Siréna', 'Mořská panna', 'Rusalka'], ['Rusalka', 'Víla'], ['Ježibaba', 'Baba Jaga'],
        ['Drak', 'Zmej'], ['Lešij', 'Hejkal'], ['Domovoj', 'Skřítek', 'Plivník'], ['Trpaslík', 'Permoník'], ['Obr', 'Troll', 'Kyklop'],
        ['Upír', 'Lamia', 'Empúsa'], ['Fénix', 'Pták Ohnivák'], ['Ra', 'Aton', 'Atum', 'Cheprer'], ['Svarožic', 'Dažbog', 'Radegast', 'Svarog'],
        ['Chors', 'Dažbog'], ['Freya', 'Frigg'], ['Pluto', 'Plútos'], ['Kybelé', 'Rheia'], ['Hélios', 'Apollón'], ['Seléné', 'Artemis'], ['Diana', 'Luna'],
        // Ďábel islámu a Bible, drobní skřítci a šotci, okřídlení draci a hadí kohouti, ptáci s ženskou hlavou, nebeské nymfy a hadi Indie
        ['Satan', 'Iblís', 'Šajtán', 'Belzebub'], ['Gnóm', 'Trpaslík', 'Kobold', 'Skřítek', 'Tomte', 'Permoník'], ['Goblin', 'Skřet', 'Imp', 'Troll'],
        ['Wyverna', 'Drak', 'Zmej'], ['Kokatrice', 'Bazilišek'], ['Hipogryf', 'Gryf', 'Pegas'], ['Mantikora', 'Sfinx', 'Chiméra'], ['Alkonost', 'Sirin', 'Gamajun', 'Siréna', 'Harpyje'],
        ['Apsaras', 'Urvaší'], ['Nága', 'Ananta', 'Vrtra'], ['Krampus', 'Čert'], ['Merrow', 'Mořská panna', 'Siréna', 'Selkie'], ['Leviatan', 'Kraken', 'Jörmungandr'],
        ['Smrtka', 'Azrael', 'Samael', 'Šinigami'], ['Sudička', 'Norny'], ['Alléktó', 'Megaira'], ['Džin', 'Ghúl'], ['Abaddón', 'Azazel', 'Samael'],
        ['Hapi', 'Apis'], ['Mjölnir', 'Gungnir'], ['Ásgard', 'Valhalla'], ['Helheim', 'Hel', 'Niflheim'], ['Élysion', 'Ostrovy požehnaných'],
        ['Avalon', 'Tir na nOg'], ['Mictlan', 'Xibalbá'], ['Chaos', 'Erebos'], ['Chronos', 'Kronos', 'Aión'], ['Magni', 'Mani'], ['Diti', 'Aditi']
    ];
    const confusableWith = new Map();
    for (const group of CONFUSABLE) for (const name of group) confusableWith.set(name, [...(confusableWith.get(name) || []), ...group.filter(other => other !== name)]);
    const confusable = (item, other) => (confusableWith.get(item.n) || []).includes(other.n);

    // Skloňované tvary řeckých jmen, které z prvního pádu neodvodí ani jádro (Zeus – Dia, Arés – Area, Odysseus – Odyssea)
    const IRREGULAR = { Zeus: ['Dia', 'Diovi', 'Diem', 'Die'], 'Arés': ['Area', 'Areovi', 'Areem'], 'Erós': ['Eróta', 'Erótovi', 'Erótem'], Pan: ['Pana', 'Panovi', 'Panem'] };
    const inflections = (name) => {
        if (IRREGULAR[name]) return IRREGULAR[name];
        const word = name.split(' ').pop();
        if (/eus$/u.test(word)) return [`${word.slice(0, -2)}a`, `${word.slice(0, -2)}ovi`];
        if (/is$/u.test(word) && word.length >= 5) return [`${word.slice(0, -1)}dy`, `${word.slice(0, -1)}dě`];
        if (/[aeiouyáéíóúý]s$/u.test(word) && word.length >= 5) return [`${word.slice(0, -2)}a`, `${word.slice(0, -2)}ovi`];
        return [];
    };
    // Krátká jména (Ra, Hor, Pan) jádro nezakryje bez rizika – tady jen celé slovo s běžnou koncovkou
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const censorShort = (text, names) => {
        const short = names.filter(name => name.length <= 3 && /^\p{Lu}/u.test(name));
        if (!short.length) return text;
        const pattern = new RegExp(`(?<![\\p{L}\\d])(?:${short.map(escapeRegExp).join('|')})(?:a|ovi|em|u|e|ou)?(?![\\p{L}\\d])`, 'gu');
        return mergeCensored(text.replace(pattern, '[***]'));
    };
    const hide = (text, names) => censorShort(censorName(text, names.join(', ')), names);
    // Jména dalších postav téže mytologie (u Baldra Ódin, Frigg a Thór) – prozradila by, ze které mytologie je.
    // Krátká jména (Syn, Hel, Vé) ne, zakryla by běžná slova; i bez diakritiky (Odin = Ódin)
    const kinIndex = new WeakMap();
    const kinNames = (item, ctx) => {
        const side = (item.f || {}).myk;
        if (!side || !ctx || !ctx.items) return [];
        if (!kinIndex.has(ctx.items)) kinIndex.set(ctx.items, new Map());
        const cache = kinIndex.get(ctx.items);
        if (!cache.has(side)) {
            const names = ctx.items.filter(other => (other.f || {}).myk === side).map(other => other.n).filter(name => name.length >= 4);
            cache.set(side, [...new Set([...names, ...names.map(name => name.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC'))])]);
        }
        return cache.get(side).filter(name => name !== item.n);
    };

    // --- Pomocníci nad daty ---
    const indexes = new WeakMap();
    const byName = (ctx) => {
        if (!indexes.has(ctx.items)) indexes.set(ctx.items, new Map(ctx.items.map(item => [item.n, item])));
        return indexes.get(ctx.items);
    };
    const f = (item) => item.f || {};
    const isPerson = (item) => item.c !== 'bytosti';
    const sideLabel = (key) => key === 'rimska' ? 'římské' : 'řecké';
    const list = (values) => (values || []).join(', ');

    // --- Fakta ---
    // Wikidata u bohů uvádějí manžele i milence (Poseidón a Tyró) – proto „partner“
    const partnerLabel = (item, count) => item.sx === 'f' ? (count > 1 ? 'Partneři' : 'Partner') : (count > 1 ? 'Partnerky' : 'Partnerka');
    const parentFacts = (family) => family.fa && family.mo ? [{ label: 'Rodiče', value: `${family.fa} a ${family.mo}` }]
        : family.fa ? [{ label: 'Otec', value: family.fa }] : family.mo ? [{ label: 'Matka', value: family.mo }] : [];
    const familyFacts = (item, family = f(item)) => [
        ...parentFacts(family),
        family.sib && family.sib.length ? { label: family.sib.length > 1 ? 'Sourozenci' : 'Sourozenec', value: list(family.sib) } : null,
        family.sp && family.sp.length ? { label: partnerLabel(item, family.sp.length), value: list(family.sp) } : null
    ].filter(Boolean);
    const attributeFacts = (item) => [
        f(item).dom && f(item).dom.length ? { label: 'Oblast', value: list(f(item).dom) } : null,
        f(item).sym && f(item).sym.length ? { label: 'Symboly', value: list(f(item).sym) } : null
    ].filter(Boolean);
    const mythologyFacts = (item) => f(item).my ? [{ label: 'Mytologie', value: f(item).my }] : [];
    const counterpartFacts = (item) => f(item).cp ? [{ label: `Protějšek v ${f(item).cpk === 'rimska' ? 'římské' : 'řecké'} mytologii`, value: f(item).cp }] : [];

    // mode: druh otázky ('name', 'counterpart', 'myth'), 'result' nebo 'card' (v atlasu je mytologie v podtitulku)
    const factsOf = (item, mode) => [
        ...(mode === 'myth' || mode === 'card' ? [] : mythologyFacts(item)),
        ...attributeFacts(item),
        ...familyFacts(item),
        ...(mode === 'counterpart' || mode === 'myth' ? [] : counterpartFacts(item))
    ];

    // Rodina „na druhé straně“: u Dia rodiče Saturn a Ops, u Marta Zeus a Héra – pomůže u otázky na protějšek
    const translatedFamily = (item, ctx) => {
        const names = byName(ctx);
        const side = f(item).cpk;
        const translate = (values) => (values || []).map(name => names.get(name)).filter(other => other && f(other).cpk === side && f(other).cp).map(other => f(other).cp);
        return { fa: translate([f(item).fa])[0], mo: translate([f(item).mo])[0], sib: translate(f(item).sib), sp: translate(f(item).sp) };
    };

    // --- Zvláštní otázky ---
    // Ostatní postavy stejné strany a pohlaví s klasickým protějškem – nesprávné možnosti u otázky na protějšek
    const counterpartChoices = (item, items, rng) => {
        const own = normalizeAnswer(f(item).cp);
        const others = shuffle(items.filter(other => other.q !== item.q && f(other).cpk === f(item).cpk && f(other).cpm
            && normalizeAnswer(f(other).cp) !== own && (other.sx === 'f') === (item.sx === 'f')), rng);
        const labels = [...new Set(others.map(other => f(other).cp))].slice(0, 3);
        if (labels.length < 3) return null;
        return shuffle([f(item).cp, ...labels], rng).map(label => ({ id: `protejsek-${normalizeAnswer(label)}`, label, correct: label === f(item).cp }));
    };
    const counterpartQuestion = (item, ctx, rng) => {
        const choices = counterpartChoices(item, ctx.items || [], rng);
        if (!choices) return null;
        return {
            type: 'counterpart',
            title: `Jak se jmenuje v ${sideLabel(f(item).cpk)} mytologii?`,
            showName: true,
            choices,
            accepted: [f(item).cp, ...(f(item).cpa || [])],
            placeholder: 'Napiš jméno…',
            answerLabel: f(item).cp
        };
    };
    // Nesprávné mytologie: u řecké a římské postavy s protějškem ta druhá (to je ta záludná); u řecké postavy bez
    // protějšku římská ne – Římané řecké báje převzali, Héraklés či Orfeus by tak mohli patřit k oběma
    const mythChoices = (item, rng) => {
        const key = f(item).myk;
        const twin = key === 'recka' ? 'rimska' : key === 'rimska' ? 'recka' : null;
        const others = Object.keys(MYTHS).filter(other => other !== key && other !== twin && !(CLOSE[key] || []).includes(other));
        const wrong = twin && (f(item).cp || key === 'rimska') ? [twin, ...shuffle(others, rng).slice(0, 2)] : shuffle(others, rng).slice(0, 3);
        return shuffle([key, ...wrong], rng).map(other => ({ id: `mytologie-${other}`, label: MYTHS[other].label, correct: other === key }));
    };
    // Otázka na mytologii jen tam, kde ji neprozradí kategorie: štítek otázky má ikonu kategorie (pyramida u egyptské, meč
    // u severské) a hráč, který si vybral jen Egyptskou mytologii, by odpověď znal předem. Bájné bytosti a předměty jsou ze
    // všech mytologií; u řecké a římské kategorie jen tehdy, když je mezi možnostmi i ta druhá (řecká × římská)
    const mythIsOpen = (item) => item.c === 'bytosti' || item.c === 'predmety'
        || (item.c === 'recka' && (f(item).myk === 'rimska' || (f(item).myk === 'recka' && Boolean(f(item).cp))));
    const mythQuestion = (item, rng) => {
        const myth = MYTHS[f(item).myk];
        if (!myth) return null;
        return {
            type: 'myth',
            title: item.c === 'bytosti' ? 'Ze které mytologie tato bytost pochází?' : 'Ze které mytologie je?',
            showName: true,
            choices: mythChoices(item, rng),
            accepted: myth.accepted,
            placeholder: 'Napiš mytologii…',
            answerLabel: myth.label
        };
    };

    // --- Nápovědy ---
    // Obrázek postavy: skutečná fotka (socha, obraz) jako fotka, kresba či PNG jako obrazová nápověda
    const pictureHint = (item) => {
        if (!item.im || isRealPhoto(item.im)) return { kind: 'photo' };
        return { kind: 'visual', spec: item.ih ? { type: 'image', file: item.im, hash: item.ih, name: 'vyobrazení', icon: 'image' } : null };
    };
    const step = (facts, label, icon) => ({ kind: 'facts', label, icon, facts });
    const hintsOf = (item, ctx, type) => {
        if (type === 'counterpart') {
            const family = translatedFamily(item, ctx);
            const answer = f(item).cp;
            return [
                step(attributeFacts(item), 'oblast a symboly', 'sparkles'),
                step(familyFacts(item, family), `rodina v ${sideLabel(f(item).cpk)} mytologii`, 'users'),
                step([{ label: 'Začíná na', value: `${answer.charAt(0)}…` }, { label: 'Počet písmen', value: String(answer.replace(/\s/g, '').length) }], 'první písmeno', 'type')
            ];
        }
        if (type === 'myth') {
            return [
                step(attributeFacts(item), 'oblast a symboly', 'sparkles'),
                step(familyFacts(item), 'rodina', 'users'),
                pictureHint(item)
            ];
        }
        // Otázka na jméno: od obecného (mytologie) přes obraz a oblast po rodinu a protějšek
        return [
            { kind: 'facts', facts: mythologyFacts(item) },
            pictureHint(item),
            step(attributeFacts(item), 'oblast a symboly', 'sparkles'),
            step(familyFacts(item), 'rodina', 'users'),
            step(counterpartFacts(item), 'protějšek', 'repeat')
        ];
    };

    // --- Rozšíření: Náboženství, Světci a světice, Záhady a legendy ---
    // Otázka podle druhu (štítek nad otázkou ukazuje druh, otázka mu musí odpovídat)
    const KIND_QUESTIONS = {
        nabozenstvi: {
            'náboženství': 'Které náboženství to je?', 'směr': 'Který náboženský směr nebo církev to je?', 'řád': 'Který řád to je?',
            'svátek': 'Který svátek to je?', 'období': 'Které období náboženského roku to je?', 'posvátný text': 'Která posvátná kniha to je?',
            'symbol': 'Který náboženský symbol to je?', 'pojem': 'Který náboženský pojem to je?', 'duchovní': 'Který duchovní úřad či titul to je?'
        },
        svetci: {
            'světec': 'Který světec je to?', 'světice': 'Která světice je to?', 'apoštol': 'Který apoštol je to?', 'evangelista': 'Který evangelista je to?',
            'světci': 'Kteří světci to jsou?', 'blahoslavený': 'Kdo je to?'
        },
        zahady: {
            'kryptid': 'Který tajemný tvor to je?', 'ztracená země': 'Která bájná země to je?', 'záhadné místo': 'Které záhadné místo to je?',
            'záhadný jev': 'Který záhadný jev to je?', 'teorie': 'O jakou teorii jde?', 'záhadná událost': 'Která záhadná událost to je?',
            'loď duchů': 'Která loď duchů to je?', 'záhadný předmět': 'Který záhadný předmět to je?', 'nerozluštěné písmo': 'Které nerozluštěné písmo to je?',
            'legendární postava': 'Kdo je to?', 'záhadná osobnost': 'Kdo je to?', 'legendární bytost': 'Co je to za bytost?', 'tajná společnost': 'Která tajná společnost to je?'
        }
    };
    // Fakt, který odpověď prozradí: slovo (aspoň čtyři písmena), které začíná stejně jako slovo jména (Luteránství – Martin Luther,
    // Krysař z Hamelnu – Hameln, Kniha Mormonova – mormonismus)
    const stem = (word) => normalizeAnswer(word).replace(/th/g, 't').slice(0, 4);
    const wordsOf = (text) => normalizeAnswer(text).split(/[^\p{L}\d]+/u).filter(word => word.length >= 4);
    const leaks = (item, value) => {
        const own = new Set([item.n, ...(item.al || [])].flatMap(wordsOf).map(stem));
        return wordsOf(String(value || '')).some(word => own.has(stem(word)));
    };
    const RELIGION_KEYS = ['krestanstvi', 'islam', 'judaismus', 'hinduismus', 'buddhismus', 'sikhismus', 'dzinismus', 'taoismus', 'zoroastrismus', 'sintoismus'];
    const RELIGION_LABELS = { krestanstvi: 'křesťanství', islam: 'islám', judaismus: 'judaismus', hinduismus: 'hinduismus', buddhismus: 'buddhismus', sikhismus: 'sikhismus',
        dzinismus: 'džinismus', taoismus: 'taoismus', zoroastrismus: 'zoroastrismus', sintoismus: 'šintoismus', mormonismus: 'mormonismus' };
    const RELIGION_ACCEPTED = { krestanstvi: ['křesťanství', 'křesťané', 'křesťanské'], islam: ['islám', 'muslimové', 'islámské', 'muslimské'], judaismus: ['judaismus', 'židé', 'židovství', 'židovské'],
        hinduismus: ['hinduismus', 'hinduisté', 'hinduistické'], buddhismus: ['buddhismus', 'buddhisté', 'buddhistické'], sikhismus: ['sikhismus', 'sikhové'], dzinismus: ['džinismus', 'džinisté'],
        taoismus: ['taoismus', 'taoisté'], zoroastrismus: ['zoroastrismus', 'zarathuštrismus'], sintoismus: ['šintoismus', 'šintó'], mormonismus: ['mormonismus', 'mormoni'] };
    // Hlavní náboženství jsou jako nesprávné možnosti častější
    const MAIN_RELIGIONS = ['krestanstvi', 'islam', 'judaismus', 'hinduismus', 'buddhismus'];
    // Slova, která v popisu prozradí náboženství (křesťanský svátek, muslimský, Ježíš, Korán, Buddha…)
    const RELIGION_WORDS = /(?<![\p{L}\d])(?:křesťan|krist|ježíš|kristov|katol|protestant|evangel|pravoslav|ortodox|církev|církv|biblick|bibl|apoštol|papež|islám|muslim|mohamed|korán|mekk|arab|judais|žid|hebrej|izrael|tór|rabín|hindu|indick|indi[eií]|buddh|budd|sikh|džin|tao|zoroastr|zarathušt|šinto|japon|persk|čín)\p{L}*/giu;
    const REGION_LABELS = { evropa: 'Evropa', asie: 'Asie', samerika: 'Severní Amerika', lamerika: 'Latinská Amerika', afrika: 'Afrika', australie: 'Austrálie', more: 'moře a oceány' };
    const RELIGION_QUIZ_SHARE = 0.3;
    const FOUNDER_QUIZ_SHARE = 0.2;
    const FEAST_QUIZ_SHARE = 0.2;
    const REGION_QUIZ_SHARE = 0.3;

    // Zakladatel jako otázka jen u skutečných zakladatelů (ne „ústřední postava“, „vychází z učení“, „nemá jednoho zakladatele“)
    const realFounder = (item) => f(item).by && !f(item).byl && !/^nemá/u.test(f(item).by);
    const founderNames = (by) => [by, ...((/\(([^)]+)\)/u.exec(by) || [])[1] ? [/\(([^)]+)\)/u.exec(by)[1], by.replace(/\s*\(.*\)$/u, '')] : [])];
    const lifeLabel = (item) => item.ty === 'světci' ? 'Žili' : item.sx === 'f' ? 'Žila' : 'Žil';
    // Rok u záhad: kdy byl předmět nalezen, společnost založena, jinak kdy se záhada stala
    const yearLabel = (item) => ['záhadný předmět', 'nerozluštěné písmo'].includes(item.ty) ? 'Nalezen' : item.ty === 'tajná společnost' ? 'Založena' : 'Kdy';
    const extraFacts = (item, mode) => {
        const a = f(item);
        if (item.c === 'nabozenstvi') {
            const label = a.byl || 'Zakladatel';
            return [
                a.rel && mode !== 'religion' && (mode !== 'name' || !leaks(item, a.rel)) ? { label: 'Náboženství', value: a.rel } : null,
                a.by && mode !== 'founder' && (['result', 'card'].includes(mode) || !leaks(item, a.by)) ? { label, value: a.by } : null,
                a.from ? { label: 'Vznik', value: a.from } : null,
                a.land && (['result', 'card'].includes(mode) || !leaks(item, a.land)) ? { label: 'Kde vzniklo', value: a.land } : null,
                a.when ? { label: item.ty === 'období' ? 'Kdy' : 'Kdy se slaví', value: a.when } : null
            ].filter(Boolean);
        }
        if (item.c === 'svetci') {
            return [
                a.lived ? { label: lifeLabel(item), value: a.lived } : null,
                a.fd && mode !== 'feast' ? { label: 'Svátek', value: a.fd } : null,
                a.pat && a.pat.length && (['result', 'card'].includes(mode) || !leaks(item, a.pat.join(' '))) ? { label: 'Patron', value: list(a.pat) } : null,
                a.sym && a.sym.length && (['result', 'card'].includes(mode) || !leaks(item, a.sym.join(' '))) ? { label: 'Atributy', value: list(a.sym) } : null
            ].filter(Boolean);
        }
        return [
            a.where && mode !== 'region' && (['result', 'card'].includes(mode) || !leaks(item, a.where)) ? { label: 'Kde', value: a.where } : null,
            a.year !== undefined ? { label: yearLabel(item), value: String(a.year) } : null
        ].filter(Boolean);
    };
    // Poslední nápověda u otázky na název: počet slov a první písmeno (pojem bez fotky a faktů tak bez nápovědy nezůstane)
    // U světců první písmeno jména za „Svatý“ (všechny možnosti začínají stejně)
    const nameShapeHint = (item) => {
        const saint = /^(Svat[ýáí]) (\p{L})/u.exec(item.n);
        if (saint) return step([{ label: 'Jméno', value: `${saint[1]} ${saint[2].toUpperCase()}…` }], 'první písmeno', 'type');
        const words = item.n.trim().split(/\s+/).length;
        return step([{ label: 'Název', value: `${words} ${words === 1 ? 'slovo' : words < 5 ? 'slova' : 'slov'}, začíná na ${item.n.charAt(0).toUpperCase()}` }], 'tvar názvu', 'type');
    };
    // Nápovědy: od obecného (náboženství, doba) po obrázek a zakladatele; u otázky na název nakonec tvar názvu
    const extraHints = (item, ctx, type) => {
        const plan = extraHintPlan(item, ctx, type);
        return type === 'name' ? [...plan, nameShapeHint(item)] : plan;
    };
    const extraHintPlan = (item, ctx, type) => {
        const facts = extraFacts(item, type);
        const take = (...labels) => facts.filter(fact => labels.includes(fact.label));
        if (item.c === 'nabozenstvi') {
            const founder = facts.filter(fact => !['Náboženství', 'Vznik', 'Kde vzniklo', 'Kdy', 'Kdy se slaví'].includes(fact.label));
            return [step(take('Náboženství', 'Kdy se slaví', 'Kdy'), 'náboženství', 'book-open'), step(take('Vznik', 'Kde vzniklo'), 'vznik', 'calendar'), pictureHint(item), step(founder, 'zakladatel', 'user')];
        }
        if (item.c === 'svetci') {
            if (type === 'feast') return [step(take('Patron', 'Atributy'), 'patron a atributy', 'sparkles'), step(take(lifeLabel(item)), 'doba', 'calendar'), pictureHint(item)];
            return [step(take(lifeLabel(item)), 'doba', 'calendar'), pictureHint(item), step(take('Patron', 'Atributy'), 'patron a atributy', 'sparkles'), step(take('Svátek'), 'svátek', 'calendar-days')];
        }
        if (type === 'region') return [pictureHint(item)];
        return [step(take('Kde', yearLabel(item)), 'kde a kdy', 'map-pin'), pictureHint(item)];
    };
    // Ke kterému náboženství patří? (směry, řády, svátky, knihy, symboly a pojmy; ne když náboženství prozradí jméno: Sunnitský islám)
    const religionQuestion = (item, rng) => {
        const a = f(item);
        if (!a.relk || !a.rel || leaks(item, a.rel)) return null;
        const excluded = new Set([a.relk, ...(a.relx || [])]);
        const main = shuffle(MAIN_RELIGIONS.filter(key => !excluded.has(key)), rng);
        const rest = shuffle(RELIGION_KEYS.filter(key => !excluded.has(key) && !MAIN_RELIGIONS.includes(key)), rng);
        const wrong = [...main.slice(0, 2), ...shuffle([...main.slice(2), ...rest], rng)].slice(0, 3);
        if (wrong.length < 3) return null;
        return {
            type: 'religion',
            title: 'Ke kterému náboženství patří?',
            showName: true,
            choices: shuffle([a.relk, ...wrong], rng).map(key => ({ id: `nabozenstvi-${key}`, label: RELIGION_LABELS[key], correct: key === a.relk })),
            accepted: RELIGION_ACCEPTED[a.relk] || [a.rel],
            placeholder: 'Napiš náboženství…',
            answerLabel: a.rel
        };
    };
    // Kdo založil? (nesprávné možnosti: zakladatelé jiných položek, u řádu zakladatelé řádů)
    const founderQuestion = (item, ctx, rng) => {
        const a = f(item);
        if (!realFounder(item) || leaks(item, a.by)) return null;
        const others = (ctx.items || []).filter(other => other.c === 'nabozenstvi' && other.q !== item.q && realFounder(other) && f(other).by !== a.by);
        const same = shuffle(others.filter(other => (other.ty === 'řád') === (item.ty === 'řád')), rng);
        const labels = [...new Set([...same, ...shuffle(others, rng)].map(other => f(other).by))].slice(0, 3);
        if (labels.length < 3) return null;
        return {
            type: 'founder',
            title: item.ty === 'řád' ? 'Kdo tento řád založil?' : item.ty === 'náboženství' ? 'Kdo je zakladatelem tohoto náboženství?' : 'Kdo tento směr založil?',
            showName: true,
            choices: shuffle([a.by, ...labels], rng).map(label => ({ id: `zakladatel-${normalizeAnswer(label)}`, label, correct: label === a.by })),
            accepted: founderNames(a.by),
            placeholder: 'Napiš jméno…',
            answerLabel: a.by
        };
    };
    // Kdy má svátek? (nesprávné možnosti: svátky jiných světců, aspoň týden od správného)
    const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
    const dayOfYear = (fd) => {
        const match = /^(\d{1,2})\. (\p{L}+)$/u.exec(fd || '');
        return match && MONTHS.includes(match[2]) ? MONTHS.indexOf(match[2]) * 31 + Number(match[1]) : null;
    };
    const feastQuestion = (item, ctx, rng) => {
        const fd = f(item).fd;
        const day = dayOfYear(fd);
        if (day === null) return null;
        const others = shuffle([...new Set((ctx.items || []).filter(other => other.c === 'svetci' && dayOfYear(f(other).fd) !== null).map(other => f(other).fd))]
            .filter(other => Math.abs(dayOfYear(other) - day) >= 7 && core.levenshtein(other, fd) > 1), rng).slice(0, 3);
        if (others.length < 3) return null;
        const [d, month] = fd.split(' ');
        const numeric = `${d} ${MONTHS.indexOf(month) + 1}.`;
        return {
            type: 'feast',
            title: item.ty === 'světci' ? 'Kdy mají svátek?' : 'Kdy má svátek?',
            showName: true,
            choices: shuffle([fd, ...others], rng).map(label => ({ id: `svatek-${normalizeAnswer(label)}`, label, correct: label === fd })),
            accepted: [fd, numeric, numeric.replace(' ', '')],
            placeholder: 'Napiš datum, třeba 6. prosince',
            answerLabel: fd
        };
    };
    // Kde prý žije? (kryptidi; nesprávné možnosti z jiných oblastí světa)
    const regionQuestion = (item, ctx, rng) => {
        const a = f(item);
        if (!a.reg || leaks(item, a.where)) return null;
        const pool = new Map();
        for (const other of ctx.items || []) if (other.c === 'zahady' && f(other).reg && f(other).reg !== a.reg && !pool.has(f(other).reg)) pool.set(f(other).reg, f(other).where);
        const wrong = shuffle([...pool.values()], rng).slice(0, 3);
        if (wrong.length < 3) return null;
        return {
            type: 'region',
            title: 'Kde prý tento tvor žije?',
            showName: true,
            choices: shuffle([a.where, ...wrong], rng).map(label => ({ id: `kde-${normalizeAnswer(label)}`, label, correct: label === a.where })),
            accepted: [a.where, a.where.replace(/\s*\(.*\)$/u, ''), REGION_LABELS[a.reg]].filter(Boolean),
            placeholder: 'Napiš, kde…',
            answerLabel: a.where
        };
    };
    const extraSpecial = (item, ctx, rng) => {
        const roll = rng();
        if (item.c === 'nabozenstvi') {
            if (roll < RELIGION_QUIZ_SHARE) return religionQuestion(item, rng);
            if (roll < RELIGION_QUIZ_SHARE + FOUNDER_QUIZ_SHARE) return founderQuestion(item, ctx, rng);
            return null;
        }
        if (item.c === 'svetci') return roll < FEAST_QUIZ_SHARE ? feastQuestion(item, ctx, rng) : null;
        return roll < REGION_QUIZ_SHARE && item.ty === 'kryptid' ? regionQuestion(item, ctx, rng) : null;
    };
    // Nesprávné možnosti: stejný druh, u směrů stejné náboženství, u světců stejné pohlaví a doba, Češi k Čechům, apoštolové k apoštolům
    const centuryNumber = (lived) => { const m = /^(\d+)\./u.exec(lived || ''); return m ? (/př/u.test(lived) ? -Number(m[1]) : Number(m[1])) : null; };
    const extraSimilarity = (item, other) => {
        const a = f(item);
        const b = f(other);
        // Skoro stejné názvy (Šivaismus – Šaktismus) mezi možnostmi ne
        if (item.n.length >= 6 && other.n.length >= 6 && core.levenshtein(normalizeAnswer(item.n), normalizeAnswer(other.n)) <= 2) return -100;
        let score = item.ty === other.ty ? 3 : -3;
        if (item.c === 'nabozenstvi') return score + (a.relk && a.relk === b.relk ? 2 : 0);
        if (item.c === 'svetci') {
            if ((item.sx === 'f') !== (other.sx === 'f') || (item.ty === 'světci') !== (other.ty === 'světci')) return -20;
            const ca = centuryNumber(a.lived);
            const cb = centuryNumber(b.lived);
            return score + (a.czs && b.czs ? 3 : 0) + (a.nz && b.nz ? 2 : 0) + (ca !== null && cb !== null ? Math.max(0, 2 - Math.abs(ca - cb) / 3) : 0);
        }
        if (['legendární postava', 'záhadná osobnost'].includes(item.ty) && (item.sx === 'f') !== (other.sx === 'f')) return -20;
        return score;
    };
    const extraSubtitle = (item) => {
        const a = f(item);
        if (item.c === 'nabozenstvi') return [item.ty, a.rel].filter(Boolean).join(' · ');
        if (item.c === 'svetci') return [item.ty, a.fd ? `svátek ${a.fd}` : ''].filter(Boolean).join(' · ');
        return [item.ty, a.where].filter(Boolean).join(' · ');
    };

    const nameList = (item) => [item.n, displayName(item.t || ''), ...(item.al || [])].filter(Boolean);
    const counterpartNames = (item) => f(item).cp ? [f(item).cp, ...(f(item).cpa || []), ...inflections(f(item).cp)] : [];

    const subtitle = (item) => {
        const my = f(item).my;
        if (!my) return item.ty || 'bájná bytost';
        if (my === 'české pověsti') return 'České pověsti';
        if (/legendy$/u.test(my)) return `${my.charAt(0).toUpperCase()}${my.slice(1)}`;
        return `${my.charAt(0).toUpperCase()}${my.slice(1)} mytologie`;
    };

    return {
        id: 'mytologie',
        title: 'Mytologie',
        icon: 'sparkles',
        emoji: '⚡',
        color: 'indigo',
        dataFile: 'data/mytologie.json',
        subtitleIcon: 'book-open',
        words: {
            question: 'Kdo je to?',
            one: 'postava',
            next: 'Další postava',
            atlas: 'Atlas mýtů a pověstí',
            placeholder: 'Napiš jméno…',
            tierKnown: 'Olympští bohové, slavní hrdinové, české pověsti, světová náboženství, známí světci a záhady',
            czechBadge: 'České pověsti'
        },
        categories: CATEGORIES,
        // Otázka podle druhu jen v kategoriích rozšíření (ostatní mají otázku kategorie)
        questionTitle: (item) => (KIND_QUESTIONS[item.c] && KIND_QUESTIONS[item.c][item.ty]) || null,

        // Nesprávné možnosti: stejná mytologie a pohlaví, české pověsti k českým, příbuzní a stejná oblast;
        // protějšek (Venuše k Afrodíté) nikdy – byl by sporný
        similarity: (item, other) => {
            if (EXTRA.has(item.c)) return extraSimilarity(item, other);
            const a = f(item);
            const b = f(other);
            if ((a.cp && normalizeAnswer(a.cp) === normalizeAnswer(other.n)) || confusable(item, other)) return -100;
            let score = isPerson(item) && (item.sx === 'f') !== (other.sx === 'f') ? -20 : 0;
            if (a.my && a.my === b.my) score += 3;
            if (item.cz && other.cz) score += 2;
            if ((a.dom || []).some(domain => (b.dom || []).includes(domain))) score += 1;
            if ([a.fa, a.mo, ...(a.sib || []), ...(a.sp || [])].includes(other.n)) score += 1;
            return score;
        },
        nameAliases: (item) => item.al || [],

        // Občas „Jak se jmenuje v římské mytologii?“ (u klasických řecko-římských dvojic) nebo „Ze které mytologie je?“
        // (jen u postav a bytostí jediné mytologie); jméno je pak vidět
        specialQuestion: (item, ctx, rng) => {
            if (EXTRA.has(item.c)) return extraSpecial(item, ctx, rng);
            const roll = rng();
            const a = f(item);
            if (a.cpm && a.cpk && roll < COUNTERPART_QUIZ_SHARE) {
                const question = counterpartQuestion(item, ctx, rng);
                if (question) return question;
            }
            return a.myk && roll >= 1 - MYTH_QUIZ_SHARE && mythIsOpen(item) ? mythQuestion(item, rng) : null;
        },
        // U protějšku zmizí protějšek, u mytologie i slova, která ji prozradí; u jména jméno, další tvary a protějšek
        censor: (type, text, item, ctx) => {
            if (type === 'religion') return mergeCensored(hide(text, nameList(item)).replace(RELIGION_WORDS, '[***]'));
            if (type === 'founder') return hide(text, founderNames(f(item).by).flatMap(name => [name, name.split(' ').pop()]).filter(name => name.length >= 4));
            if (type === 'feast') return mergeCensored(text.replace(/(?<![\p{L}\d])\d{1,2}\.\s*(?:\d{1,2}\.|\p{L}+)/gu, '[***]'));
            if (type === 'region') return hide(text, [f(item).where, ...String(f(item).where).split(/[\s(),]+/u).filter(word => word.length >= 4), REGION_LABELS[f(item).reg]].filter(Boolean));
            if (type === 'counterpart') return hide(text, counterpartNames(item));
            if (type === 'myth') return mergeCensored(hide(text, [...counterpartNames(item), ...kinNames(item, ctx)]).replace(MYTH_WORDS, '[***]'));
            const names = nameList(item);
            return hide(text, [...names, ...names.flatMap(inflections), ...counterpartNames(item)]);
        },
        // Které jiné postavy jméno hráč napsal u otázky na protějšek (Héra místo Juno)
        findAnswer: (type, answer, item, ctx) => {
            if (type !== 'counterpart') return null;
            const side = f(item).cpk;
            const match = (ctx.items || []).find(other => other.q !== item.q && f(other).myk === side && isAnswerMatch(answer, nameAnswers(other, other.al || [])));
            return match ? { topic: 'mytologie', id: match.q } : null;
        },
        hints: (item, ctx, type) => EXTRA.has(item.c) ? extraHints(item, ctx, type) : hintsOf(item, ctx, type),
        facts: (item, ctx, mode) => EXTRA.has(item.c) ? extraFacts(item, mode) : factsOf(item, mode),
        subtitle: (item) => EXTRA.has(item.c) ? extraSubtitle(item) : subtitle(item),
        isCzech: (item) => item.cz === 1,
        inflections
    };
});
