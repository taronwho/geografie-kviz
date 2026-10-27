// Téma Mytologie: bohové a hrdinové řecké a římské, egyptské, severské a slovanské mytologie, Staré pověsti české
// a bájné bytosti (data/mytologie.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const { censorName, displayName, normalizeAnswer, shuffle, isRealPhoto, isAnswerMatch, nameAnswers, mergeCensored } = core;

    const PERSON = { question: 'Kdo je to?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'name' } };
    const CATEGORIES = [
        { key: 'recka', label: 'Řecká a římská mytologie', one: 'postava', icon: 'zap', ...PERSON },
        { key: 'egyptska', label: 'Egyptská mytologie', one: 'postava', icon: 'pyramid', ...PERSON },
        { key: 'severska', label: 'Severská mytologie', one: 'postava', icon: 'sword', ...PERSON },
        { key: 'slovanska', label: 'Slované a české pověsti', one: 'postava', icon: 'castle', ...PERSON },
        { key: 'bytosti', label: 'Bájné bytosti', one: 'bytost', icon: 'ghost', question: 'Co je to za bytost?', placeholder: 'Napiš název…', ask: 'Co je', sort: { by: 'name' } }
    ];

    // Mytologie pro otázku „Ze které mytologie je?“: popisek a přijímané psané odpovědi
    const MYTHS = {
        recka: { label: 'řecká', accepted: ['řecká', 'řecká mytologie', 'Řecko', 'řecké', 'starořecká', 'antická'] },
        rimska: { label: 'římská', accepted: ['římská', 'římská mytologie', 'Řím', 'římské', 'starořímská'] },
        egyptska: { label: 'egyptská', accepted: ['egyptská', 'egyptská mytologie', 'Egypt', 'egyptské', 'staroegyptská'] },
        severska: { label: 'severská', accepted: ['severská', 'severská mytologie', 'nordická', 'germánská', 'skandinávská', 'vikingská'] },
        slovanska: { label: 'slovanská', accepted: ['slovanská', 'slovanská mytologie', 'Slované', 'slovanské', 'praslovanská'] }
    };
    // Slova, která v popisu prozradí mytologii (řecký, Olymp, faraon, Edda, Slované…)
    const MYTH_WORDS = /(?<![\p{L}\d])(?:staro|pra)?(?:řeck|římsk|helén|antick|egypt|severs|germán|skandináv|nordick|norsk|islandsk|vikin|slovan|olymp|Řím|Řek(?:ové|ů|ům)|Egypt|Edd|Ásgard|Ás[ouy]|Vanov|faraon|Slovan|Nil|Thé[bv]|Memfi|Heliopol|Valhal|Walhal|Ragnar|Ygg|Midgard|Atén|Athén|Trój|Homér|Hésiod|Ovid|Vergil)\p{L}*/giu;

    // Jak často se místo „Kdo je to?“ ptáme na protějšek (u klasických dvojic) nebo na mytologii
    const COUNTERPART_QUIZ_SHARE = 0.35;
    const MYTH_QUIZ_SHARE = 0.2;

    // Bytosti a bohové, kteří splývají (Medúsa je jedna z gorgon, ježibaba je Baba Jaga, satyr je řecký faun) –
    // spolu mezi možnostmi nebudou, odpověď by byla sporná
    const CONFUSABLE = [
        ['Medúsa', 'Gorgony'], ['Satyr', 'Faun'], ['Siréna', 'Mořská panna', 'Rusalka'], ['Rusalka', 'Víla'], ['Ježibaba', 'Baba Jaga'],
        ['Drak', 'Zmej'], ['Lešij', 'Hejkal'], ['Domovoj', 'Skřítek', 'Plivník'], ['Trpaslík', 'Permoník'], ['Obr', 'Troll', 'Kyklop'],
        ['Upír', 'Lamia', 'Empúsa'], ['Fénix', 'Pták Ohnivák'], ['Ra', 'Aton', 'Atum', 'Cheprer'], ['Svarožic', 'Dažbog', 'Radegast', 'Svarog'],
        ['Chors', 'Dažbog'], ['Freya', 'Frigg'], ['Pluto', 'Plútos'], ['Kybelé', 'Rheia'], ['Hélios', 'Apollón'], ['Seléné', 'Artemis'], ['Diana', 'Luna']
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
        const others = Object.keys(MYTHS).filter(other => other !== key && other !== twin);
        const wrong = twin && (f(item).cp || key === 'rimska') ? [twin, ...shuffle(others, rng).slice(0, 2)] : shuffle(others, rng).slice(0, 3);
        return shuffle([key, ...wrong], rng).map(other => ({ id: `mytologie-${other}`, label: MYTHS[other].label, correct: other === key }));
    };
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

    const nameList = (item) => [item.n, displayName(item.t || ''), ...(item.al || [])].filter(Boolean);
    const counterpartNames = (item) => f(item).cp ? [f(item).cp, ...(f(item).cpa || []), ...inflections(f(item).cp)] : [];

    const subtitle = (item) => {
        const my = f(item).my;
        if (!my) return item.ty || 'bájná bytost';
        if (my === 'české pověsti') return 'České pověsti';
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
            tierKnown: 'Olympští bohové, slavní hrdinové, české pověsti',
            czechBadge: 'České pověsti'
        },
        categories: CATEGORIES,

        // Nesprávné možnosti: stejná mytologie a pohlaví, české pověsti k českým, příbuzní a stejná oblast;
        // protějšek (Venuše k Afrodíté) nikdy – byl by sporný
        similarity: (item, other) => {
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
            const roll = rng();
            const a = f(item);
            if (a.cpm && a.cpk && roll < COUNTERPART_QUIZ_SHARE) {
                const question = counterpartQuestion(item, ctx, rng);
                if (question) return question;
            }
            return a.myk && roll >= 1 - MYTH_QUIZ_SHARE ? mythQuestion(item, rng) : null;
        },
        // U protějšku zmizí protějšek, u mytologie i slova, která ji prozradí; u jména jméno, další tvary a protějšek
        censor: (type, text, item) => {
            if (type === 'counterpart') return hide(text, counterpartNames(item));
            if (type === 'myth') return mergeCensored(hide(text, counterpartNames(item)).replace(MYTH_WORDS, '[***]'));
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
        hints: hintsOf,
        facts: (item, ctx, mode) => factsOf(item, mode),
        subtitle,
        isCzech: (item) => item.cz === 1,
        inflections
    };
});
