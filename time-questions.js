// Časové souvislosti: otázky na vztahy v čase napříč tématy – Co bylo dřív, Mohli se potkat, Za života, Ve stejném století,
// Kdo se narodil nejdřív, Kdo žil nejdéle, Kolik let bylo autorovi a Kdo žil v době… Čistá logika bez DOM (výběr, kontrola, vysvětlení,
// rozvržení osy) a HTML panelu otázky a vysvětlení; aplikace (app.js) zavolá plan → buildRound a otázku ukáže jako obyčejnou otázku
// se čtyřmi možnostmi (vždy výběr, i ve variantě psaní), nápovědami (osa s osobností či věcí, roky jedné nesprávné možnosti)
// a vysvětlením s osou všech možností (visuals.js, typ chronology).
// Data: položky tématu, které se právě hraje (všechny úrovně podle nastavení), a z ostatních témat jen známé (data/souvislosti.json,
// scripts/build-souvislosti.mjs; tam i slavné objevy a vynálezy z data/vynalezy.json). Roky jen spolehlivé (timeFacts).
// Testy: tests/time-questions.test.js, ukázky a kontrola na skutečných datech: npm run audit:souvislosti.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore, root);
    if (isNode) module.exports = api;
    else root.MudrlantTime = api;
})(typeof self !== 'undefined' ? self : this, (core, root) => {
    'use strict';

    const { escapeHtml, shuffle, pickRandom, plural, normalizeAnswer, formatYear, centuryOf, centuryLabel, commonsPhotoUrl, isRealPhoto, createSeededRandom, timelineKnown } = core;

    // Asi každá desátá otázka hry tématu a mixu (po číselných otázkách, jen kde téma má data). Testy: api.rate a api.force,
    // window.MUDRLANT_TIME_RATE; MUDRLANT_NUMERIC_RATE = 0 (testy jen s obyčejnými otázkami) vypne i Časové souvislosti
    const RATE = 0.1;
    const START_RATE = root && typeof root.MUDRLANT_TIME_RATE === 'number' ? root.MUDRLANT_TIME_RATE
        : root && root.MUDRLANT_NUMERIC_RATE === 0 ? 0 : RATE;
    // Kvíz dne má Časové souvislosti od tohoto dne (dřívější dny zůstanou, jak je hráči hráli)
    const QUIZ_FROM = '2026-11-14';
    const DATA_FILE = 'data/souvislosti.json';
    const THIS_YEAR = new Date().getFullYear();
    const LABEL = 'Časové souvislosti';
    const ICON = 'hourglass';

    // --- Spolehlivé roky z dat témat ---

    const PERSON_CATEGORIES = {
        historie: ['panovnik', 'statnik', 'osobnost'], fyzika: ['fyzici', 'astronomove'], chemie: ['chemici'], umeni: ['umelci', 'fotografove', 'ilustratori'],
        literatura: ['spisovatele'], hudba: ['skladatele', 'hudebnici'], film: ['herci', 'reziseri'], architektura: ['architekti'], sport: ['sportovci']
    };
    // Přístroje z kategorie Mise a přístroje, u kterých rok z Wikidat odpovídá vynálezu (u cívky, diody či generátoru ne)
    const INSTRUMENTS = new Set(['Barometr', 'Elektromotor', 'Elektronový mikroskop', 'Voltův sloup', 'Leydenská láhev', 'Foucaultovo kyvadlo', 'Transformátor',
        'Geigerův-Müllerův počítač', 'Wilsonova mlžná komora', 'Teslův transformátor', 'Van de Graaffův generátor']);
    const SPACE = ['kosmická sonda', 'dalekohled', 'pilotovaný let', 'kosmická stanice', 'družice'];
    // Objevená tělesa: planety, měsíce a hvězdy (rok objevu mlhovin, hvězdokup a komet s katalogovými jmény zná málokdo)
    const BODIES = ['planeta', 'trpasličí planeta', 'měsíc', 'hvězda'];
    // Prvky známé od starověku, u kterých Wikidata uvádějí jen rok uznání za prvek (uhlík 1789, síra 1777), a bor (objeven 1808, ne 1892)
    const ELEMENT_SKIP = new Set(['Uhlík', 'Síra', 'Bor']);
    // Stavby: rok vzniku je u starších staveb často začátek stavby, přestavba nebo jen odhad; muzeum má rok založení sbírky, ne stavby
    const BUILDING_FROM = 1850;
    const BUILDING_SKIP = /muzeum|hřbitov|galerie/u;
    // Roky před rokem 1500 dělitelné padesáti bývají jen odhad (−3000, 500), rok 0 a 1 zástupný údaj („1. století“)
    const isEstimate = (year) => (year < 1500 && year % 50 === 0) || year === 1 || year === 0;
    // Starověk a raný středověk: kulatý rok narození či úmrtí je odhad (papež Linus 10–79, Plútarchos 40–120, Hugo Kapet 940)
    const isRoundEarly = (year) => Number.isInteger(year) && year < 1000 && year % 10 === 0;
    // Popis s „asi 27–66“, „cca 380“ nebo otazníkem u roku: data jsou nejistá
    const UNCERTAIN = /(?:^|[\s(])(?:asi|cca|kolem|okolo|c\.)\s*\d|\d\s*\?/u;
    // Díla a vynálezy do roku 1700 s kulatým rokem (1600, 1320, „klavír 1700“) mívají rok jen přibližný
    const ROUND_KINDS = new Set(['literarni', 'skladba', 'opera', 'obraz', 'socha', 'vynalez']);
    // Vynálezy se sporným rokem (parní stroj: Newcomen 1712, nebo Watt 1769; papír znala Čína před Cchaj Lunem)
    const INVENTION_SKIP = new Set(['Parní stroj', 'Papír']);
    const hasYearInName = (name) => /\d{3,4}/.test(name || '');
    const firstOf = (value) => (Array.isArray(value) ? value[0] : value) || '';
    // Obor osobnosti v Historii: Wikidata tu často uvádějí nepřesné povolání (Dostojevskij „politik“, Mourinho „diplomat“), popis z Wikipedie
    // je přesnější („portugalský fotbalový trenér“ → trenér); bere se první podstatné jméno popisu bez roků (jinak povolání z Wikidat)
    const ADJECTIVE_END = /(ský|cký|ská|cká|ské|cké|ní|ný|ná|né|ový|ová|ové|ý|á|í)$/u;
    const kindFromDescription = (text) => {
        const plain = String(text || '').replace(/\([^)]*\)/g, ' ').trim();
        if (!plain || /\d/.test(plain)) return '';
        const words = plain.split(/[\s,;:]+/u).map(word => word.replace(/[^\p{L}-]/gu, '')).filter(Boolean);
        return words.find(word => word.length > 2 && word === word.toLowerCase() && !ADJECTIVE_END.test(word)) || '';
    };
    const personKind = (item, topicId) => (topicId === 'historie' && item.c === 'osobnost' && kindFromDescription(item.d)) || item.ty || '';

    // Domovská kategorie objevů a vynálezů z data/vynalezy.json v tématu (výběr kategorií hráče)
    const EXTRA_CATEGORY = { fyzika: { vynalez: 'vynalezy', objev: 'pojmy' }, chemie: { vynalez: 'latky', objev: 'pojmy' }, historie: { vynalez: 'udalosti', objev: 'udalosti' } };

    // Položka tématu → osoba { b, d } nebo datovaná věc { y, kd }, jinak null. Stejná funkce sestaví data/souvislosti.json.
    // kd (druh): vynalez, objev, teleso, prvek, udalost, literarni, skladba, opera, obraz, socha, film, serial, stavba, mise
    const timeFacts = (item, topicId) => {
        if (!item || item.nq || !item.f || !item.n || hasYearInName(item.n)) return null;
        const f = item.f;
        const base = { q: item.q, tp: topicId, c: item.c, n: item.n, ...(item.t && item.t !== item.n ? { t: item.t } : {}), lvl: core.levelOf(item) };
        if ((PERSON_CATEGORIES[topicId] || []).includes(item.c)) {
            const b = f.born;
            if (!Number.isInteger(b) || isEstimate(b) || b > THIS_YEAR - 18 || /\d/.test(item.n)) return null;
            const alive = f.died === undefined;
            if (alive && b < THIS_YEAR - 100) return null;
            if (!alive && (!Number.isInteger(f.died) || isEstimate(f.died) || f.died - b < 15 || f.died - b > 110 || f.died > THIS_YEAR)) return null;
            if (isRoundEarly(b) || isRoundEarly(f.died) || UNCERTAIN.test(item.d || '')) return null;
            return { ...base, b, d: alive ? null : f.died, ...(item.sx === 'f' ? { sx: 'f' } : {}), ty: personKind(item, topicId), l: firstOf(f.land) };
        }
        let kd = null;
        let y = f.year;
        let by = f.by || '';
        let byq = f.byq || f.bq || '';
        if (topicId === 'fyzika' && item.c === 'vynalezy') kd = 'vynalez';
        if (topicId === 'fyzika' && item.c === 'mise') kd = item.ty === 'přístroj' ? (INSTRUMENTS.has(item.n) ? 'vynalez' : null) : SPACE.includes(item.ty) ? 'mise' : null;
        if (topicId === 'fyzika' && item.c === 'vesmir' && f.disc && y >= 1600 && BODIES.includes(item.ty)) { kd = 'teleso'; by = f.disc; }
        if (topicId === 'chemie' && item.c === 'prvky' && y >= 1650 && !ELEMENT_SKIP.has(item.n)) { kd = 'prvek'; by = f.disc || ''; }
        if (topicId === 'historie' && (item.c === 'bitva' || item.c === 'udalosti') && y !== undefined && !(f.end !== undefined && f.end - y > 5)) kd = 'udalost';
        if (topicId === 'literatura' && item.c === 'dila') kd = 'literarni';
        if (topicId === 'hudba' && item.c === 'dila') kd = 'skladba';
        // Muzikály, operety a balety z kategorie opery jsou „dílo“ (Kočky nejsou opera)
        if (topicId === 'hudba' && item.c === 'opery') kd = /opera/u.test(item.ty || '') ? 'opera' : 'skladba';
        if (topicId === 'umeni' && (item.c === 'obrazy' || item.c === 'sochy') && !f.ya && !f.yc) kd = item.c === 'obrazy' ? 'obraz' : 'socha';
        if (topicId === 'film' && (item.c === 'filmy' || item.c === 'animovane')) { kd = 'film'; by = firstOf(f.dir); byq = f.dirq || ''; }
        if (topicId === 'film' && item.c === 'serialy') { kd = 'serial'; by = ''; byq = ''; }
        if (topicId === 'architektura' && item.c === 'stavby') {
            y = f.y;
            kd = y >= BUILDING_FROM && y % 100 !== 0 && !BUILDING_SKIP.test(item.ty || 'undefined') && item.ty ? 'stavba' : null;
            by = f.arch || '';
            byq = f.aq || '';
        }
        if (!kd || !Number.isInteger(y) || y > THIS_YEAR || isEstimate(y) || hasYearInName(item.n)) return null;
        if ((ROUND_KINDS.has(kd) && y <= 1700 && y % 10 === 0) || (kd === 'vynalez' && INVENTION_SKIP.has(item.n))) return null;
        return { ...base, y, ...(Number.isInteger(f.end) && f.end > y ? { e: f.end } : {}), kd, ty: item.ty || '', ...(by ? { by } : {}), ...(byq ? { byq } : {}) };
    };
    // Dílo vydané či uvedené až po smrti autora (Proces 1925, Macbeth 1623 = první souborné vydání, Turandot) nebo dřív, než autor
    // mohl tvořit (Satirikon „1“): rok nepopisuje vznik díla, otázka „vzniklo“ by nebyla férová. authors = Map q → { b, d } z dat témat
    const WORK_KINDS = new Set(['literarni', 'skladba', 'opera', 'obraz', 'socha', 'film']);
    const authorFits = (thing, author) => {
        if (!thing || !WORK_KINDS.has(thing.kd) || !author || !Number.isInteger(author.b)) return true;
        return thing.y >= author.b + 12 && (!Number.isInteger(author.d) || thing.y <= author.d);
    };
    const authorsOf = (items, topicId, into = new Map()) => {
        for (const item of items || []) {
            if (item && item.f && (PERSON_CATEGORIES[topicId] || []).includes(item.c) && Number.isInteger(item.f.born)) into.set(item.q, { b: item.f.born, d: item.f.died });
        }
        return into;
    };
    // Objev či vynález z data/vynalezy.json jako datovaná věc (x = doplněk, známý)
    const extraFacts = (entry) => ({
        q: entry.q, tp: entry.tp, c: (EXTRA_CATEGORY[entry.tp] || {})[entry.kind] || null, n: entry.n, ...(entry.t && entry.t !== entry.n ? { t: entry.t } : {}),
        lvl: 1, x: 1, y: entry.year, kd: entry.kind, ty: entry.kind === 'objev' ? 'objev' : 'vynález', ...(entry.by ? { by: entry.by } : {}),
        ...(entry.im ? { im: entry.im, ih: entry.ih } : {})
    });

    // --- Doby a vztahy (roky v astronomickém číslování jako v datech: −355 = 356 př. n. l., rozdíly let tak sedí i přes začátek letopočtu) ---

    const isPerson = (entry) => Boolean(entry) && Number.isInteger(entry.b);
    const endOf = (person) => (person.d === null || person.d === undefined ? THIS_YEAR : person.d);
    const ADULT = 18;
    // Kolik let spolu žili jako dospělí (oba od 18 let); záporné = mezera mezi životy
    const adultOverlap = (a, b) => Math.min(endOf(a), endOf(b)) - Math.max(a.b + ADULT, b.b + ADULT);
    // Společná léta celých životů (ve vysvětlení), mezera mezi životy (0 = překrývají se)
    const lifeOverlap = (a, b) => Math.max(0, Math.min(endOf(a), endOf(b)) - Math.max(a.b, b.b));
    const lifeGap = (a, b) => Math.max(0, Math.max(a.b, b.b) - Math.min(endOf(a), endOf(b)));
    // Odstup od narození či úmrtí, aby otázka nebyla chyták (u starších dob jsou data nejistá, odstup větší)
    const marginAt = (year) => (year >= 1500 ? 10 : year >= 1000 ? 25 : year >= 0 ? 40 : 60);
    // Jak daleko od osobnosti hledat nesprávné možnosti (dál by byly zjevně mimo)
    const horizonAt = (year) => (year >= 1800 ? 150 : year >= 1500 ? 200 : year >= 1000 ? 300 : 600);
    // Mezera mezi sousedními roky u „Co bylo dřív“ a „Kdo se narodil nejdřív“
    const FAST_KINDS = new Set(['film', 'serial', 'mise', 'vynalez', 'objev', 'udalost']);
    const orderGap = (year, kind) => {
        const gap = year >= 1900 ? (FAST_KINDS.has(kind) || kind === 'born' ? 5 : 10) : year >= 1500 ? 10 : year >= 1000 ? 50 : 100;
        return kind === 'stavba' ? Math.max(gap, 25) : gap;
    };
    const MEET_YEARS = 10;
    const AGE_STEP = 5;
    // Rok blízko přelomu století je pro otázku na století chyták (1300 patří do 13. století, 1301 do 14.)
    const CENTURY_CORE = 8;
    const centuryCore = (year) => {
        const inCentury = ((year % 100) + 100) % 100;
        return inCentury >= CENTURY_CORE && inCentury <= 100 - CENTURY_CORE;
    };
    const centuryOfEntry = (entry) => centuryOf(entry.y);
    const yearsText = (entry) => (isPerson(entry)
        ? (entry.d === null || entry.d === undefined ? `nar. ${formatYear(entry.b)}` : entry.b < 0 && entry.d < 0 ? `${-entry.b}–${-entry.d} př. n. l.` : entry.b < 0 ? `${formatYear(entry.b)} – ${formatYear(entry.d)}` : `${entry.b}–${formatYear(entry.d)}`)
        : formatYear(entry.y));
    const ageOf = (person) => endOf(person) - person.b;
    const displayName = (entry) => {
        if (!isPerson(entry) || !entry.t) return entry.n;
        const short = entry.t.replace(/\s*\([^)]*\)$/u, '');
        return short.length < entry.n.length && short.includes(' ') ? short : entry.n;
    };
    const yearsWord = (count) => plural(count, 'rok', 'roky', 'let');

    // Druhy věcí ve skupinách otázek „Za života“ a „Ve stejném století“
    const GROUPS = {
        vynalez: ['vynalez'],
        objev: ['objev', 'teleso', 'prvek'],
        vznik: ['literarni', 'skladba', 'opera', 'obraz', 'socha', 'film', 'stavba'],
        udalost: ['udalost']
    };
    const groupOf = (kind) => Object.keys(GROUPS).find(group => GROUPS[group].includes(kind)) || null;
    const KIND_ONE = {
        vynalez: 'vynález', objev: 'objev', teleso: 'objev', prvek: 'objev', udalost: 'událost', literarni: 'dílo', skladba: 'dílo', opera: 'opera', obraz: 'obraz',
        socha: 'socha', film: 'film', serial: 'seriál', stavba: 'stavba', mise: 'mise'
    };

    // --- Zadání (bez sloves ve shodě s pohlavím hráče; osobnost v kartě, ne v pádě v zadání) ---

    const ORDER_TITLES = {
        vynalez: 'Co bylo vynalezeno', objev: 'Co bylo objeveno', teleso: 'Které těleso bylo objeveno', prvek: 'Který prvek byl objeven', udalost: 'Co se stalo',
        literarni: 'Které dílo vzniklo', skladba: 'Které dílo vzniklo', opera: 'Která opera měla premiéru', obraz: 'Který obraz vznikl', socha: 'Která socha vznikla',
        film: 'Který film měl premiéru', serial: 'Který seriál se začal vysílat', stavba: 'Která stavba vznikla', mise: 'Která mise odstartovala'
    };
    const LIFE_TITLES = {
        vynalez: ['Co bylo vynalezeno až po smrti této osobnosti?', 'Co už bylo vynalezeno za života této osobnosti?'],
        objev: ['Co bylo objeveno až po smrti této osobnosti?', 'Co už bylo objeveno za života této osobnosti?'],
        vznik: ['Co vzniklo až po smrti této osobnosti?', 'Co už existovalo za života této osobnosti?'],
        udalost: ['Co se stalo až po smrti této osobnosti?', 'Co se stalo ještě za života této osobnosti?']
    };
    const CENTURY_TITLES = {
        vynalez: 'Co bylo vynalezeno ve stejném století jako tento vynález?', objev: 'Co bylo objeveno ve stejném století jako tento objev?',
        vznik: 'Co vzniklo ve stejném století jako toto dílo?', udalost: 'Co se stalo ve stejném století jako tato událost?'
    };
    const CENTURY_THIS = { stavba: 'tato stavba', obraz: 'tento obraz', socha: 'tato socha', film: 'tento film' };
    const ALIVE_TITLES = {
        vynalez: 'Kdo z nich žil v době, kdy vznikl tento vynález?', objev: 'Kdo z nich žil v době tohoto objevu?', teleso: 'Kdo z nich žil v době tohoto objevu?',
        prvek: 'Kdo z nich žil v době objevu tohoto prvku?', udalost: 'Kdo z nich žil v době této události?', film: 'Kdo z nich žil v době premiéry tohoto filmu?',
        stavba: 'Kdo z nich žil v době, kdy vznikla tato stavba?', mise: 'Kdo z nich žil v době této mise?',
        literarni: 'Kdo z nich žil v době, kdy vzniklo toto dílo?', skladba: 'Kdo z nich žil v době, kdy vzniklo toto dílo?', opera: 'Kdo z nich žil v době, kdy vzniklo toto dílo?',
        obraz: 'Kdo z nich žil v době, kdy vznikl tento obraz?', socha: 'Kdo z nich žil v době, kdy vznikla tato socha?'
    };
    const ageTitle = (work, author) => (work.kd === 'film'
        ? `Kolik let bylo ${author.sx === 'f' ? 'režisérce' : 'režisérovi'}, když měl tento film premiéru?`
        : `Kolik let bylo ${author.sx === 'f' ? 'autorce' : 'autorovi'}, když ${work.kd === 'obraz' ? 'tento obraz vznikl' : work.kd === 'socha' ? 'tato socha vznikla' : 'toto dílo vzniklo'}?`);
    const titleOf = (plan, subject, author) => {
        switch (plan.type) {
            case 'meet': return 'Kdo z nich mohl potkat tuto osobnost?';
            case 'nomeet': return 'Kdo z nich se s touto osobností potkat nemohl?';
            case 'after': return LIFE_TITLES[plan.group][0];
            case 'during': return LIFE_TITLES[plan.group][1];
            case 'century': return plan.group === 'vznik' ? `Co vzniklo ve stejném století jako ${CENTURY_THIS[subject.kd] || 'toto dílo'}?` : CENTURY_TITLES[plan.group];
            case 'alive': return ALIVE_TITLES[subject.kd];
            case 'order': return `${ORDER_TITLES[plan.kind]} ${plan.dir === 'last' ? 'nejpozději' : 'nejdřív'}?`;
            case 'born': return `Kdo z nich se narodil ${plan.dir === 'last' ? 'nejpozději' : 'nejdřív'}?`;
            case 'oldest': return 'Kdo z nich žil nejdéle?';
            case 'age': return ageTitle(subject, author);
            default: return '';
        }
    };
    const TYPE_LABELS = {
        meet: 'Mohli se potkat', nomeet: 'Mohli se potkat', after: 'Za života', during: 'Za života', century: 'Ve stejném století', alive: 'Kdo žil v té době',
        order: 'Co bylo dřív', born: 'Kdo se narodil dřív', oldest: 'Kdo žil nejdéle', age: 'Kolik let bylo'
    };

    // --- Data otázek: položky hraného tématu + známé z ostatních (data/souvislosti.json) ---

    let index = null;
    const setIndex = (data) => {
        // Soubor má jen známé položky (úroveň Základní); žijící osoby bez roku úmrtí
        const known = (list) => list.filter(entry => entry && typeof entry.q === 'string' && typeof entry.n === 'string').map(entry => ({ ...entry, lvl: 1, ...(Number.isInteger(entry.b) && entry.d === undefined ? { d: null } : {}) }));
        index = data && Array.isArray(data.people) && Array.isArray(data.dated) ? {
            people: known(data.people).filter(isPerson), dated: known(data.dated).filter(entry => Number.isInteger(entry.y) && entry.kd),
            extras: new Set(data.dated.filter(entry => entry && entry.x).map(entry => entry.q))
        } : null;
        entryCache = new WeakMap();
        return index;
    };
    let loading = null;
    // fetchJson aplikace (s mezipamětí service workeru); bez dat se Časové souvislosti prostě neptají
    const load = (fetchJson) => {
        if (index) return Promise.resolve(index);
        if (!loading) loading = Promise.resolve().then(() => fetchJson(DATA_FILE)).then(setIndex).catch(() => { loading = null; return null; });
        return loading;
    };
    let entryCache = new WeakMap();
    // own = položky hraného tématu (otázka, nesprávné možnosti podle nastavení), foreign = známé z ostatních témat
    const entriesFor = (ctx) => {
        if (!index || !ctx || !ctx.items) return null;
        if (entryCache.has(ctx.items)) return entryCache.get(ctx.items);
        const topicId = ctx.topic.id;
        const own = [];
        // Autoři děl hraného tématu (všechny úrovně) a známé osoby ostatních témat: dílo po smrti autora se neptá
        const authors = authorsOf(ctx.items, topicId, new Map(index.people.map(entry => [entry.q, { b: entry.b, d: entry.d === null ? undefined : entry.d }])));
        for (const item of ctx.items) {
            if (index.extras.has(item.q)) continue;
            const entry = timeFacts(item, topicId);
            if (entry && (isPerson(entry) || authorFits(entry, authors.get(entry.byq)))) own.push(entry);
        }
        const ownIds = new Set(own.map(entry => entry.q));
        for (const entry of index.dated) if (entry.x && entry.tp === topicId && !ownIds.has(entry.q)) { own.push(entry); ownIds.add(entry.q); }
        const foreign = [...index.people, ...index.dated].filter(entry => entry.tp !== topicId && !ownIds.has(entry.q) && entry.lvl === 1);
        const byId = new Map([...foreign, ...own].map(entry => [entry.q, entry]));
        const result = { own, foreign, byId, people: [...own, ...foreign].filter(isPerson), dated: [...own, ...foreign].filter(entry => !isPerson(entry)) };
        entryCache.set(ctx.items, result);
        return result;
    };

    // --- Výběr otázky ---

    const TYPES = ['meet', 'nomeet', 'after', 'during', 'alive', 'century', 'order', 'born', 'oldest', 'age'];
    const WEIGHTS = { meet: 3, nomeet: 1, after: 2, during: 2, alive: 2, century: 2, order: 3, born: 2, oldest: 1, age: 2 };
    const SUBJECT_TYPES = new Set(['meet', 'nomeet', 'after', 'during', 'alive', 'century', 'age']);
    // Slova jména (bez krátkých a obecných): příjmení osobnosti v názvu věci (Newtonův zákon) nebo u jiné osoby (dva Straussové)
    const STOP = new Set(['von', 'van', 'der', 'den', 'del', 'della', 'and', 'the', 'starší', 'mladší', 'veliký', 'velký', 'svatý', 'svatá', 'bratři', 'sestry'].map(normalizeAnswer));
    // Bez křestního jména (dva Johannové nebo Karlové spolu nesouvisí), u jednoslovných jmen (Colette, Alexandr Veliký) celé jméno
    const nameWords = (name) => {
        const words = normalizeAnswer(name).split(' ').filter(word => word.length >= 4 && !STOP.has(word) && !/^[ivxlcdm]+$/.test(word));
        return words.length > 1 ? words.slice(1) : words;
    };
    const mentions = (text, words) => {
        const hay = ` ${normalizeAnswer(text)} `;
        return words.some(word => hay.includes(` ${word}`) || hay.includes(word.slice(0, Math.max(4, word.length - 1))));
    };
    const sharesName = (a, b) => {
        const words = nameWords(a.n);
        return words.length > 0 && nameWords(b.n).some(word => words.includes(word));
    };
    // Věc, kterou vytvořila sama osobnost, nebo věc s jejím jménem (Kouzelná flétna u Mozarta, Newtonův zákon u Newtona) by byla zjevná
    const relatedTo = (thing, person) => Boolean(thing.byq && thing.byq === person.q) || (thing.by && normalizeAnswer(thing.by).includes(normalizeAnswer(person.n)))
        || mentions(thing.n, nameWords(person.n)) || (thing.by && nameWords(person.n).length > 0 && mentions(thing.by, nameWords(person.n).slice(-1)));
    const distinctNames = (list) => new Set(list.map(entry => normalizeAnswer(entry.n))).size === list.length;

    // Výběr nesprávných možností: nejdřív blízké v čase, s trochou náhody (score menší = lepší), různé názvy a bez stejného příjmení
    const pickDistinct = (candidates, count, taken, rng, score = () => 0) => {
        const chosen = [];
        const scored = shuffle(candidates, rng).map(entry => ({ entry, score: score(entry) + rng() * 0.6 })).sort((a, b) => a.score - b.score);
        for (const { entry } of scored) {
            if (chosen.length >= count) break;
            const all = [...taken, ...chosen];
            if (all.some(other => other.q === entry.q || normalizeAnswer(other.n) === normalizeAnswer(entry.n) || (isPerson(entry) && isPerson(other) && sharesName(other, entry)))) continue;
            // Možnosti s (skoro) stejným rokem by vypadaly jako jedna skupina (tři díla z roku 1782)
            if (all.some(other => isPerson(other) === isPerson(entry) && Math.abs((isPerson(other) ? other.b : other.y) - (isPerson(entry) ? entry.b : entry.y)) < 3)) continue;
            chosen.push(entry);
        }
        return chosen.length === count ? chosen : null;
    };
    // Rozložení správné odpovědi mezi možnosti (shown = pořadí, ve kterém se ukážou)
    const finish = (type, extra, subject, correct, wrong, rng) => {
        const shown = shuffle([correct, ...wrong], rng);
        return { type, ...extra, subject: subject ? subject.q : null, ids: shown.map(entry => entry.q), correct: shown.indexOf(correct) };
    };

    // Mohli se potkat: právě jedna osoba žila současně (jako dospělí aspoň MEET_YEARS let), ostatní vůbec ne (s odstupem)
    const canMeet = (a, b) => adultOverlap(a, b) >= MEET_YEARS;
    const cannotMeet = (a, b) => lifeGap(a, b) >= marginAt(Math.max(a.b, b.b));
    const nearInTime = (subject, other) => lifeGap(subject, other) <= horizonAt(subject.b);
    const buildMeet = (type, subject, data, ok, rng) => {
        if (!isPerson(subject)) return null;
        const others = data.people.filter(other => other.q !== subject.q && ok(other) && !sharesName(subject, other));
        const meet = others.filter(other => canMeet(subject, other));
        const apart = others.filter(other => cannotMeet(subject, other) && nearInTime(subject, other));
        // Jiný obor je zajímavější (Newton a Bach), blízká doba těžší
        const crossField = (other) => (other.tp === subject.tp ? 0.5 : 0);
        // Nesprávné jasně mimo, ale ne zjevně: mezera kolem 15–60 let
        const gapScore = (other) => Math.abs(lifeGap(subject, other) - 35) / 40;
        if (type === 'meet') {
            const correct = pickDistinct(meet, 1, [subject], rng, crossField);
            if (!correct) return null;
            // Aspoň jedna nesprávná možnost před osobností a jedna po ní, když to jde
            const before = apart.filter(other => endOf(other) <= subject.b);
            const after = apart.filter(other => other.b >= endOf(subject));
            const first = [pickDistinct(before, 1, [subject, ...correct], rng, gapScore), pickDistinct(after, 1, [subject, ...correct], rng, gapScore)].filter(Boolean).map(list => list[0]);
            const wrong = pickDistinct(apart, 3 - first.length, [subject, ...correct, ...first], rng, gapScore);
            return wrong ? finish(type, {}, subject, correct[0], [...first, ...wrong], rng) : null;
        }
        const correct = pickDistinct(apart, 1, [subject], rng, gapScore);
        const wrong = correct && pickDistinct(meet, 3, [subject, ...correct], rng, crossField);
        return wrong ? finish(type, {}, subject, correct[0], wrong, rng) : null;
    };

    // Za života: věc po smrti (after) / věc, která už za života existovala (during); odstup od narození i úmrtí aspoň marginAt
    const buildLife = (type, subject, data, ok, rng) => {
        if (!isPerson(subject) || subject.d === null || subject.d === undefined) return null;
        const margin = marginAt(subject.d);
        const horizon = horizonAt(subject.b);
        const groups = shuffle(Object.keys(GROUPS), rng);
        for (const group of groups) {
            const things = data.dated.filter(thing => GROUPS[group].includes(thing.kd) && ok(thing) && !relatedTo(thing, subject));
            const afterDeath = things.filter(thing => thing.y >= subject.d + margin && thing.y <= subject.d + horizon);
            const inLife = things.filter(thing => thing.y >= subject.b + margin && thing.y <= subject.d - margin);
            const beforeBirth = things.filter(thing => thing.y <= subject.b - margin && thing.y >= subject.b - horizon);
            const near = (thing) => Math.abs(Math.min(Math.abs(thing.y - subject.b), Math.abs(thing.y - subject.d)) - 25) / 40;
            if (type === 'after') {
                const correct = pickDistinct(afterDeath, 1, [], rng, near);
                // Nesprávné hlavně za života (aspoň jedna), zbytek před narozením
                const life = correct && inLife.length ? pickDistinct(inLife, Math.min(3, inLife.length), correct, rng, near) || pickDistinct(inLife, 1, correct, rng, near) : null;
                if (!life) continue;
                const rest = life.length === 3 ? [] : pickDistinct(beforeBirth, 3 - life.length, [...correct, ...life], rng, near);
                if (!rest) continue;
                return finish(type, { group }, subject, correct[0], [...life, ...rest], rng);
            }
            // Událost „za života“ musí být opravdu za života; věc mohla vzniknout i před narozením (existovala)
            const correct = pickDistinct(inLife.length || group === 'udalost' ? inLife : beforeBirth, 1, [], rng, near);
            const wrong = correct && pickDistinct(afterDeath, 3, correct, rng, near);
            if (wrong) return finish(type, { group }, subject, correct[0], wrong, rng);
        }
        return null;
    };

    // Kdo žil v době vzniku věci: osoba naživu s odstupem od narození i úmrtí, ostatní zemřeli dřív nebo se narodili později
    const aliveAt = (person, year) => person.b + marginAt(year) <= year && year <= endOf(person) - (person.d === null || person.d === undefined ? 0 : marginAt(year));
    const missedBy = (person, year) => endOf(person) <= year - marginAt(year) || person.b >= year + marginAt(year);
    const buildAlive = (subject, data, ok, rng) => {
        if (isPerson(subject) || !ALIVE_TITLES[subject.kd]) return null;
        const year = subject.y;
        const horizon = horizonAt(year);
        const people = data.people.filter(person => ok(person) && !relatedTo(subject, person) && !(subject.by && mentions(subject.by, nameWords(person.n))));
        const alive = people.filter(person => aliveAt(person, year));
        const missed = people.filter(person => missedBy(person, year) && Math.min(Math.abs(endOf(person) - year), Math.abs(person.b - year)) <= horizon);
        const gap = (person) => Math.abs(Math.min(Math.abs(endOf(person) - year), Math.abs(person.b - year)) - 30) / 50;
        const correct = pickDistinct(alive, 1, [], rng);
        const wrong = correct && pickDistinct(missed, 3, correct, rng, gap);
        return wrong ? finish('alive', {}, subject, correct[0], wrong, rng) : null;
    };

    // Ve stejném století: věc i možnosti daleko od přelomu století; nesprávné z jiného století a aspoň 40 let od věci
    const CENTURY_DISTANCE = 40;
    const inOneCentury = (thing) => centuryCore(thing.y) && (thing.e === undefined || (centuryOf(thing.e) === centuryOf(thing.y) && centuryCore(thing.e)));
    const buildCentury = (subject, data, ok, rng) => {
        if (isPerson(subject) || !groupOf(subject.kd) || !inOneCentury(subject)) return null;
        const group = groupOf(subject.kd);
        const century = centuryOfEntry(subject);
        const things = data.dated.filter(thing => thing.q !== subject.q && GROUPS[group].includes(thing.kd) && ok(thing) && inOneCentury(thing));
        const same = things.filter(thing => centuryOfEntry(thing) === century && Math.abs(thing.y - subject.y) >= 5);
        const other = things.filter(thing => centuryOfEntry(thing) !== century && Math.abs(thing.y - subject.y) >= CENTURY_DISTANCE && Math.abs(thing.y - subject.y) <= 450);
        const correct = pickDistinct(same, 1, [subject], rng);
        // Nesprávné hlavně ze sousedních století
        const wrong = correct && pickDistinct(other, 3, [subject, ...correct], rng, thing => Math.abs(thing.y - subject.y) / 100);
        return wrong ? finish('century', { group }, subject, correct[0], wrong, rng) : null;
    };

    // Co bylo dřív / Kdo se narodil nejdřív / Kdo žil nejdéle: čtyři položky stejného druhu, hodnoty dost daleko od sebe
    const spreadOk = (values, gapAt) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted.every((value, i) => i === 0 || value - sorted[i - 1] >= gapAt(sorted[i - 1]));
    };
    const pickSpread = (anchor, candidates, valueOf, gapAt, rng) => {
        const chosen = [anchor];
        for (const candidate of shuffle(candidates, rng)) {
            if (chosen.length === 4) break;
            if (chosen.some(other => other.q === candidate.q || normalizeAnswer(other.n) === normalizeAnswer(candidate.n) || (isPerson(other) && sharesName(other, candidate)))) continue;
            if (!spreadOk([...chosen, candidate].map(valueOf), gapAt)) continue;
            chosen.push(candidate);
        }
        return chosen.length === 4 ? chosen : null;
    };
    const buildOrder = (type, anchor, data, okOwn, rng) => {
        const dir = type === 'oldest' ? 'max' : rng() < 0.5 ? 'first' : 'last';
        let candidates;
        let valueOf;
        let gapAt;
        let extra;
        if (type === 'order') {
            if (isPerson(anchor) || !ORDER_TITLES[anchor.kd]) return null;
            candidates = data.own.filter(other => !isPerson(other) && other.kd === anchor.kd && okOwn(other) && other.lvl === 1 && other.q !== anchor.q);
            valueOf = (entry) => entry.y;
            gapAt = (year) => orderGap(year, anchor.kd);
            extra = { kind: anchor.kd, dir };
        } else if (type === 'born') {
            if (!isPerson(anchor)) return null;
            candidates = data.own.filter(other => isPerson(other) && other.c === anchor.c && okOwn(other) && other.lvl === 1 && other.q !== anchor.q);
            valueOf = (entry) => entry.b;
            gapAt = (year) => orderGap(year, 'born');
            extra = { dir };
        } else {
            if (!isPerson(anchor) || anchor.d === null || anchor.d === undefined || anchor.b < 1000) return null;
            candidates = data.own.filter(other => isPerson(other) && other.c === anchor.c && other.d !== null && other.d !== undefined && other.b >= 1000 && okOwn(other) && other.lvl === 1 && other.q !== anchor.q);
            valueOf = ageOf;
            gapAt = () => 4;
            extra = {};
        }
        const chosen = pickSpread(anchor, candidates, valueOf, gapAt, rng);
        if (!chosen) return null;
        const values = chosen.map(valueOf);
        const target = type === 'order' || type === 'born' ? (dir === 'last' ? Math.max(...values) : Math.min(...values)) : Math.max(...values);
        // Nejstarší osoba je jasně nejstarší (aspoň o 5 let)
        if (type === 'oldest') {
            const sorted = [...values].sort((a, b) => b - a);
            if (sorted[0] - sorted[1] < 5) return null;
        }
        const correct = chosen[values.indexOf(target)];
        return finish(type, extra, null, correct, chosen.filter(entry => entry !== correct), rng);
    };

    // Kolik let bylo autorovi: rok díla minus rok narození (může být o rok méně, možnosti jsou proto po AGE_STEP letech)
    const AGE_PATTERNS = [[-15, -10, -5, 0], [-10, -5, 0, 5], [-5, 0, 5, 10], [0, 5, 10, 15]];
    const AGE_KINDS = new Set(['literarni', 'skladba', 'opera', 'obraz', 'socha', 'film']);
    const authorOf = (work, data) => {
        const author = work.byq ? data.byId.get(work.byq) : null;
        return isPerson(author) ? author : null;
    };
    const buildAge = (subject, data, rng) => {
        if (isPerson(subject) || !AGE_KINDS.has(subject.kd)) return null;
        const author = authorOf(subject, data);
        if (!author || author.b < 1000 || subject.y > endOf(author)) return null;
        const age = subject.y - author.b;
        if (age < 14 || age > 95) return null;
        // Nesprávné věky v mezích života (u žijících nejvýš o 15 let víc)
        const ceiling = author.d === null || author.d === undefined ? age + 15 : ageOf(author);
        const patterns = shuffle(AGE_PATTERNS, rng).filter(pattern => pattern.every(offset => age + offset >= 10 && age + offset <= Math.max(ceiling, age)));
        if (!patterns.length) return null;
        // Číselné možnosti vzestupně, jako na stupnici
        const values = patterns[0].map(offset => age + offset);
        return { type: 'age', subject: subject.q, author: author.q, ids: [], ages: values, correct: values.indexOf(age) };
    };

    // Druhy otázky, kterými se dá zeptat na položku (subjekt, nebo jedna ze čtyř u „Co bylo dřív“)
    const typesFor = (entry) => (isPerson(entry)
        ? ['meet', 'nomeet', 'born', ...(entry.d !== null && entry.d !== undefined ? ['after', 'during', 'oldest'] : [])]
        : ['alive', 'century', 'order', ...(AGE_KINDS.has(entry.kd) && entry.byq ? ['age'] : [])]);
    const buildFor = (type, anchor, data, okOwn, okAny, rng) => {
        if (type === 'meet' || type === 'nomeet') return buildMeet(type, anchor, data, okAny, rng);
        if (type === 'after' || type === 'during') return buildLife(type, anchor, data, okAny, rng);
        if (type === 'alive') return buildAlive(anchor, data, okAny, rng);
        if (type === 'century') return buildCentury(anchor, data, okAny, rng);
        if (type === 'age') return buildAge(anchor, data, rng);
        return buildOrder(type, anchor, data, okOwn, rng);
    };

    // Plán otázky: druh, osobnost či věc, možnosti v pořadí a správná. null = obyčejná otázka. Volání rng v pevném pořadí (Kvíz dne:
    // stejné semínko = stejná otázka). pool = položky, ze kterých hra právě vybírá (kategorie a známost), item = vylosovaná položka;
    // položky hraného tématu jen z pool, z ostatních témat jen známé
    const plan = ({ ctx, item, pool, rng, rate = api.rate, force = api.force }) => {
        const topic = ctx && ctx.topic;
        if (!index || !topic || !Array.isArray(pool) || !pool.length || typeof rng !== 'function') return null;
        if (!(rng() < (force ? 1 : rate))) return null;
        const data = entriesFor(ctx);
        if (!data || !data.own.length) return null;
        const poolIds = new Set(pool.map(entry => entry.q));
        const poolCategories = new Set(pool.map(entry => entry.c));
        const okOwn = (entry) => entry.tp === topic.id && (entry.x ? !entry.c || poolCategories.has(entry.c) : poolIds.has(entry.q));
        const okAny = (entry) => okOwn(entry) || (entry.tp !== topic.id && entry.lvl === 1);
        const anchor = item ? data.byId.get(item.q) : null;
        const kinds = force && typeof force === 'string' && TYPES.includes(force) ? [force] : TYPES;
        // Přednost má vylosovaná položka (Mozart → Za života), jinak pár dalších z pool
        const anchors = [anchor && okOwn(anchor) ? anchor : null, ...shuffle(data.own.filter(okOwn), rng).slice(0, 8)].filter(Boolean);
        for (const candidate of anchors) {
            const options = typesFor(candidate).filter(type => kinds.includes(type));
            let left = options;
            while (left.length) {
                const type = core.pickWeighted(left, option => WEIGHTS[option], rng);
                left = left.filter(option => option !== type);
                const planned = buildFor(type, candidate, data, okOwn, okAny, rng);
                if (planned) return { ...planned, topic: topic.id, anchor: item && item.q ? item.q : candidate.q };
            }
        }
        return null;
    };

    // --- Kontrola (stejná pro hru, testy i audit): právě jedna správná možnost, odstupy, různé názvy ---

    const check = (planned, data) => {
        const problems = [];
        const subject = planned.subject ? data.byId.get(planned.subject) : null;
        if (planned.type === 'age') {
            const author = data.byId.get(planned.author);
            if (!subject || !author) return ['chybí dílo nebo autor'];
            const age = subject.y - author.b;
            if (planned.ages[planned.correct] !== age) problems.push('správný věk nesedí');
            const sorted = [...planned.ages].sort((a, b) => a - b);
            if (sorted.some((value, i) => i > 0 && value - sorted[i - 1] < AGE_STEP)) problems.push('věky blízko sebe');
            if (new Set(planned.ages).size !== 4) problems.push('stejné věky');
            return problems;
        }
        const choices = planned.ids.map(id => data.byId.get(id));
        if (choices.length !== 4 || choices.some(entry => !entry)) return ['chybí možnosti'];
        if (!distinctNames(choices) || (subject && choices.some(entry => normalizeAnswer(entry.n) === normalizeAnswer(subject.n)))) problems.push('stejné názvy');
        const good = (fn) => choices.map((entry, index) => fn(entry, index));
        const exactlyCorrect = (flags) => { if (flags.filter(Boolean).length !== 1 || !flags[planned.correct]) problems.push('správná není právě jedna'); };
        const type = planned.type;
        if (type === 'meet' || type === 'nomeet') {
            if (!isPerson(subject) || choices.some(entry => !isPerson(entry))) return ['nejsou osoby'];
            const meets = good(entry => canMeet(subject, entry));
            const apart = good(entry => cannotMeet(subject, entry));
            if (choices.some((entry, i) => !meets[i] && !apart[i])) problems.push('nejasný vztah (překryv kratší než 10 let)');
            exactlyCorrect(type === 'meet' ? meets : apart);
        } else if (type === 'after' || type === 'during') {
            const margin = marginAt(subject.d);
            const after = good(entry => entry.y >= subject.d + margin);
            const before = good(entry => entry.y <= subject.d - margin);
            if (choices.some((entry, i) => !after[i] && !before[i])) problems.push('věc blízko úmrtí');
            if (planned.group === 'udalost' && type === 'during' && choices[planned.correct].y < subject.b + margin) problems.push('událost před narozením');
            exactlyCorrect(type === 'after' ? after : before);
        } else if (type === 'alive') {
            const alive = good(entry => aliveAt(entry, subject.y));
            const missed = good(entry => missedBy(entry, subject.y));
            if (choices.some((entry, i) => !alive[i] && !missed[i])) problems.push('osoba blízko roku');
            exactlyCorrect(alive);
        } else if (type === 'century') {
            if (choices.some(entry => !inOneCentury(entry)) || !inOneCentury(subject)) problems.push('blízko přelomu století');
            const same = good(entry => centuryOfEntry(entry) === centuryOfEntry(subject));
            if (choices.some((entry, i) => !same[i] && Math.abs(entry.y - subject.y) < CENTURY_DISTANCE)) problems.push('nesprávná blízko');
            exactlyCorrect(same);
        } else {
            const valueOf = type === 'order' ? (entry => entry.y) : type === 'born' ? (entry => entry.b) : ageOf;
            const values = choices.map(valueOf);
            const gapAt = type === 'order' ? (year => orderGap(year, planned.kind)) : type === 'born' ? (year => orderGap(year, 'born')) : () => 4;
            if (!spreadOk(values, gapAt)) problems.push('hodnoty blízko sebe');
            const target = type === 'oldest' || planned.dir === 'last' ? Math.max(...values) : Math.min(...values);
            exactlyCorrect(values.map(value => value === target));
        }
        return problems;
    };

    // --- Vysvětlení: řádky (název, roky, vztah) a osa pro výsledek ---

    const relationOf = (planned, subject, entry) => {
        const type = planned.type;
        if (type === 'meet' || type === 'nomeet') {
            const together = lifeOverlap(subject, entry);
            return together > 0 ? `současně ${yearsWord(together)}` : `mezera ${yearsWord(lifeGap(subject, entry))}`;
        }
        if (type === 'after' || type === 'during') {
            if (entry.y > subject.d) return `${yearsWord(entry.y - subject.d)} po smrti`;
            if (entry.y < subject.b) return `${yearsWord(subject.b - entry.y)} před narozením`;
            return `ve věku ${yearsWord(entry.y - subject.b)}`;
        }
        if (type === 'alive') return entry.b <= subject.y && subject.y <= endOf(entry)
            ? `v té době ${yearsWord(subject.y - entry.b)}` : `mezera ${yearsWord(Math.max(entry.b - subject.y, subject.y - endOf(entry)))}`;
        if (type === 'century') return centuryLabel(centuryOfEntry(entry));
        if (type === 'oldest') return `${yearsWord(ageOf(entry))}`;
        return '';
    };
    // Krátký popis do tlačítka možnosti (jen u otázek s osobností či věcí; vejde se na jeden řádek i na úzkém telefonu, nic se neuřízne):
    // u osoby obor bez přívlastků („premiér Spojeného království“ → „premiér“, „francouzský a navarrský král“ → „král“), u věci druh
    // (film, román, bitva). U otázek bez osobnosti jsou popisy (i autor) v panelu nad možnostmi (leadHtml)
    const SHORT = 18;
    const ADJECTIVE = /(ský|cký|ská|cká|ské|cké|ní|ný|ná|né|ový|ová|ové|ý|á)$/u;
    const shortKind = (text) => {
        if (!text || text.length <= SHORT) return text || '';
        const words = text.split(/\s+/);
        const noun = words.find(word => word.length > 2 && !ADJECTIVE.test(word));
        return noun && noun.length <= SHORT ? noun : '';
    };
    const choiceDetail = (entry, label) => {
        const detail = isPerson(entry) ? shortKind(entry.ty) : entry.ty && entry.ty.length <= SHORT ? entry.ty : KIND_ONE[entry.kd] || '';
        // Druh, který je už v názvu (Šestidenní válka · válka), se neopakuje
        return detail && !normalizeAnswer(label).includes(normalizeAnswer(detail)) ? detail : '';
    };
    // Popis pod názvem (panel, vysvětlení): obor a země osoby, druh a autor věci (film · Andy Muschietti, ne holé „To“)
    const detailOf = (entry) => (isPerson(entry) ? [entry.ty, entry.l].filter(Boolean).join(' · ')
        : [entry.ty && entry.ty !== 'událost' ? entry.ty : KIND_ONE[entry.kd], entry.by].filter(Boolean).join(' · '));
    const summaryOf = (subjectRow, rows) => {
        const correct = rows.find(row => row.correct);
        const first = subjectRow ? `${subjectRow.name} ${subjectRow.years}` : '';
        const answer = correct ? `${correct.name} ${correct.years}${correct.relation ? ` → ${correct.relation}` : ''}` : '';
        const others = rows.filter(row => !row.correct).map(row => `${row.name} ${row.years}${row.relation ? ` (${row.relation})` : ''}`).join(' · ');
        // Věty bez zdvojené tečky po „př. n. l.“
        return `${[[first, answer].filter(Boolean).join(' · '), others].filter(Boolean).map(part => part.replace(/\.$/, '')).join('. ')}.`;
    };

    // Osa výsledku: osobnost či věc nahoře, pod ní možnosti v časovém pořadí; band = doba, ke které se možnosti vztahují
    const chronologyOf = (planned, subjectRow, rows) => {
        const asRow = (row, role) => ({ label: row.name, sub: row.years, from: row.from, to: row.to, point: row.point, role });
        const ordered = [...rows].sort((a, b) => a.from - b.from);
        const list = [...(subjectRow ? [asRow(subjectRow, 'subject')] : []), ...ordered.map(row => asRow(row, row.correct ? 'correct' : 'wrong'))];
        let band = null;
        if (subjectRow && (planned.type === 'meet' || planned.type === 'nomeet' || planned.type === 'after' || planned.type === 'during')) band = { from: subjectRow.from, to: subjectRow.to, label: 'život' };
        if (subjectRow && planned.type === 'alive') band = { from: subjectRow.from, to: subjectRow.from, label: String(subjectRow.years) };
        if (subjectRow && planned.type === 'century') {
            const century = centuryOf(subjectRow.from);
            const from = century > 0 ? (century - 1) * 100 + 1 : century * 100 + 1;
            band = { from, to: from + 99, label: centuryLabel(century) };
        }
        const describe = `Časová osa: ${list.map(row => `${row.label} ${row.sub}`).join(', ')}.`;
        return { type: 'chronology', name: 'časová osa', icon: 'calendar-range', rows: list, band, describe };
    };

    // Nápověda: osa s osobností (věcí) a pár známými událostmi, které nic neprozradí (žádná nemá rok blízko roku možnosti ani její jméno)
    const WORLD_EVENTS = [
        [-776, 'první olympijské hry'], [-753, 'založení Říma'], [-490, 'bitva u Marathónu'], [-447, 'stavba Parthenónu'], [-221, 'sjednocení Číny'],
        [-27, 'vznik římského císařství'], [79, 'výbuch Vesuvu'], [313, 'Milánský edikt'], [476, 'pád Západořímské říše'], [622, 'počátek islámu'],
        [800, 'korunovace Karla Velikého'], [962, 'vznik Svaté říše římské'], [1066, 'bitva u Hastingsu'], [1096, 'první křížová výprava'], [1215, 'Magna charta'],
        [1348, 'založení Karlovy univerzity'], [1415, 'upálení Jana Husa'], [1453, 'pád Konstantinopole'], [1492, 'objevení Ameriky'], [1517, 'počátek reformace'],
        [1620, 'bitva na Bílé hoře'], [1648, 'konec třicetileté války'], [1776, 'nezávislost USA'], [1789, 'Velká francouzská revoluce'], [1815, 'bitva u Waterloo'],
        [1848, 'revoluce v Evropě'], [1914, 'začátek 1. světové války'], [1918, 'vznik Československa'], [1939, 'začátek 2. světové války'], [1945, 'konec 2. světové války'],
        [1969, 'přistání na Měsíci'], [1989, 'sametová revoluce'], [2001, 'útoky 11. září']
    ];
    const yearsOfEntry = (entry) => (isPerson(entry) ? [entry.b, endOf(entry)] : [entry.y, ...(entry.e ? [entry.e] : [])]);
    const hintTimeline = (subject, choices, shown = []) => {
        const spans = isPerson(subject) ? [{ kind: 'life', from: subject.b, to: endOf(subject) }] : subject.e ? [{ kind: 'reign', from: subject.y, to: subject.e }] : [];
        const points = isPerson(subject) || subject.e ? [] : [subject.y];
        const near = choices.flatMap(yearsOfEntry);
        const words = choices.flatMap(entry => nameWords(entry.n));
        const anchors = WORLD_EVENTS.filter(([year, text]) => near.every(other => Math.abs(other - year) > 3) && !mentions(text, words)).map(([year, text]) => [year, text, 0]);
        return { type: 'timeline', spans, points, hide: [...new Set([subject.n, ...choices.map(entry => entry.n), ...shown])].join(', '), spanLabel: 'doba', anchors };
    };

    const photoOf = (entry, ctx) => {
        const item = entry && ctx && ctx.byId ? ctx.byId.get(entry.q) : null;
        const file = (item && item.im) || entry.im;
        const hash = (item && item.ih) || entry.ih;
        if (!file || !hash || (ctx && ctx.textPhotos && ctx.textPhotos.has(file))) return null;
        return commonsPhotoUrl(file, hash, isRealPhoto(file) ? 480 : 320);
    };

    // Data otázky (uloží se celá s relací, výsledek je vykreslí bez dat tématu). Vrací null, když plán neprojde kontrolou
    const buildRound = (planned, ctx) => {
        const data = planned && entriesFor(ctx);
        if (!data) return null;
        if (check(planned, data).length) return null;
        const subject = planned.subject ? data.byId.get(planned.subject) : null;
        const topic = ctx.topic;
        if (planned.type === 'age') return buildAgeRound(planned, ctx, data, subject);
        const choices = planned.ids.map(id => data.byId.get(id));
        // Jméno osoby jako článek Wikipedie, když je kratší (Vladimir Putin, ne Vladimir Vladimirovič Putin): vejde se do tlačítka
        const names = new Map([subject, ...choices].filter(Boolean).map(entry => [entry.q, displayName(entry)]));
        if (new Set([...names.values()].map(normalizeAnswer)).size < names.size) for (const entry of [subject, ...choices].filter(Boolean)) names.set(entry.q, entry.n);
        const row = (entry, correct) => ({
            id: entry.q, topic: entry.tp, name: names.get(entry.q), title: entry.t || entry.n, years: yearsText(entry), detail: detailOf(entry), correct, kd: isPerson(entry) ? 'osoba' : entry.kd,
            from: isPerson(entry) ? entry.b : entry.y, to: isPerson(entry) ? endOf(entry) : (entry.e || entry.y), point: !isPerson(entry) && !entry.e, alive: isPerson(entry) && (entry.d === null || entry.d === undefined),
            relation: subject ? relationOf(planned, subject, entry) : planned.type === 'oldest' ? relationOf(planned, null, entry) : '', photo: photoOf(entry, ctx)
        });
        const rows = choices.map((entry, index) => row(entry, index === planned.correct));
        const subjectRow = subject ? { ...row(subject, false), relation: '' } : null;
        const title = titleOf(planned, subject);
        const correct = rows[planned.correct];
        // Možnosti: název bez roků, u otázek s osobností či věcí i krátký popis (bez ní jsou popisy v panelu nad možnostmi)
        const choiceOf = (entry, index) => {
            const detail = subject ? choiceDetail(choices[index], entry.name) : '';
            return { id: entry.id, topic: entry.topic, label: entry.name, ...(detail ? { detail } : {}), correct: entry.correct };
        };
        const question = {
            type: 'time', title, showName: false, choicesOnly: true, placeholder: '',
            choices: rows.map(choiceOf),
            accepted: [correct.name], answerLabel: correct.name
        };
        const known = [title, subject ? `${subject.n} ${detailOf(subject)}` : ''].join(' · ');
        const hints = hintsFor(planned, subject, choices, known, entry => names.get(entry.q) || entry.n);
        const anchorItem = ctx.byId ? ctx.byId.get(planned.anchor) : null;
        const lead = subject ? subjectRow : null;
        return {
            topic: topic.id, id: planned.anchor || (subject || correct).q, title: (subject || correct).t || (subject || correct).n || correct.title, name: subject ? subject.n : correct.name,
            category: (anchorItem || subject || choices[0]).c || '', known: [subject, ...choices].filter(Boolean).every(entry => entry.lvl === 1),
            typeLabel: LABEL, question, questionText: '', textOrigin: 'time', photoUrl: lead && lead.photo ? lead.photo.replace(/\/\d+px-/, '/960px-') : null,
            questionImage: null, photoMasks: null, visual: null,
            resultVisual: chronologyOf(planned, subjectRow, rows), resultFacts: [], hints, leadFacts: [],
            subtitle: subject ? [yearsText(subject), detailOf(subject)].filter(Boolean).join(' · ') : TYPE_LABELS[planned.type],
            coords: null, isCzech: false, description: summaryOf(subjectRow, rows), thin: false, funFacts: [],
            time: { type: planned.type, label: TYPE_LABELS[planned.type], subject: subjectRow, rows, ...(planned.kind ? { kind: planned.kind } : {}), ...(planned.dir ? { dir: planned.dir } : {}) }
        };
    };
    const buildAgeRound = (planned, ctx, data, work) => {
        const author = data.byId.get(planned.author);
        const age = work.y - author.b;
        const label = (value) => yearsWord(value);
        const question = {
            type: 'time', title: titleOf(planned, work, author), showName: false, choicesOnly: true, placeholder: '',
            choices: planned.ages.map((value, index) => ({ id: `vek-${value}`, label: label(value), correct: index === planned.correct })),
            accepted: [label(age)], answerLabel: label(age)
        };
        const workRow = { id: work.q, topic: work.tp, name: work.n, title: work.t || work.n, years: formatYear(work.y), detail: [KIND_ONE[work.kd], author.n].join(' · '), correct: true, kd: work.kd,
            from: work.y, to: work.y, point: true, relation: `${work.y} − ${author.b} = ${age}`, photo: photoOf(work, ctx) };
        const authorRow = { id: author.q, topic: author.tp, name: author.n, title: author.t || author.n, years: yearsText(author), detail: detailOf(author), correct: false, kd: 'osoba',
            from: author.b, to: endOf(author), point: false, alive: author.d === null || author.d === undefined, relation: `v roce ${work.y}: ${label(age)}`, photo: photoOf(author, ctx) };
        const known = [question.title, work.n, workRow.detail].join(' · ');
        const hints = [{ key: 'facts', kind: 'facts', label: 'rok vzniku', icon: 'calendar', extra: true, facts: [{ label: work.n, value: formatYear(work.y) }] }]
            .filter(hint => !hint.facts.every(fact => known.includes(fact.value)));
        const chronology = { type: 'chronology', name: 'časová osa', icon: 'calendar-range', band: { from: author.b, to: endOf(author), label: 'život' },
            rows: [{ label: author.n, sub: authorRow.years, from: authorRow.from, to: authorRow.to, point: false, role: 'subject' }, { label: work.n, sub: `${work.y} · ${label(age)}`, from: work.y, to: work.y, point: true, role: 'correct' }],
            describe: `Časová osa: ${author.n} ${authorRow.years}, ${work.n} ${work.y}.` };
        return {
            topic: ctx.topic.id, id: planned.anchor || work.q, title: work.t || work.n, name: work.n, category: work.c || '', known: work.lvl === 1 && author.lvl === 1,
            typeLabel: LABEL, question, questionText: '', textOrigin: 'time', photoUrl: workRow.photo ? workRow.photo.replace(/\/\d+px-/, '/960px-') : null,
            questionImage: null, photoMasks: null, visual: null, resultVisual: chronology, resultFacts: [], hints, leadFacts: [],
            subtitle: `${formatYear(work.y)} · ${workRow.detail}`, coords: null, isCzech: false, thin: false, funFacts: [],
            description: `${author.n} ${authorRow.years} · ${work.n} ${work.y} → ${work.y} − ${author.b} = ${label(age)}.`,
            time: { type: 'age', label: TYPE_LABELS.age, subject: workRow, rows: [authorRow, { ...workRow, correct: true }], age }
        };
    };
    // Nápovědy: 1. osa s osobností či věcí (bez možností), 2. roky jedné nesprávné možnosti; u otázek bez osobnosti roky dvou nesprávných.
    // Osa, jejíž roky hráč už vidí, se vynechá (timelineKnown), jako u ostatních otázek
    const hintsFor = (planned, subject, choices, known, nameOf = entry => entry.n) => {
        const hints = [];
        if (subject) {
            const spec = hintTimeline(subject, choices, choices.map(nameOf));
            if (!timelineKnown(spec, known)) hints.push({ key: 'visual', kind: 'visual', spec, label: 'časová osa', icon: 'calendar-range' });
        }
        const wrong = choices.filter((entry, index) => index !== planned.correct);
        // Nejdřív ta nesprávná, která je správné nejblíž (nejvíc láká), ať nápověda opravdu pomůže
        const closeness = (entry) => {
            const target = choices[planned.correct];
            return Math.abs((isPerson(entry) ? entry.b : entry.y) - (isPerson(target) ? target.b : target.y));
        };
        const sorted = [...wrong].sort((a, b) => closeness(a) - closeness(b));
        const fact = (entry) => ({ label: nameOf(entry), value: isPerson(entry) ? yearsText(entry) : formatYear(entry.y) });
        hints.push({ key: 'facts', kind: 'facts', label: 'jedna možnost', icon: 'info', extra: true, facts: [fact(sorted[0])] });
        if (!subject) hints.push({ key: 'facts-2', kind: 'facts', label: 'další možnost', icon: 'info', extra: true, facts: [fact(sorted[1])] });
        return hints;
    };
    const isKind = (data) => Boolean(data && data.question && data.question.type === 'time' && data.time && Array.isArray(data.time.rows));

    // --- Kvíz dne: jedna až dvě otázky denně, na pozicích s tématem, které Časové souvislosti umí ---

    const QUIZ_TOPICS = new Set(['historie', 'fyzika', 'chemie', 'umeni', 'literatura', 'hudba', 'film', 'architektura', 'sport', 'biologie']);
    const SECOND_SHARE = 0.35;
    // slots = témata otázek dne podle pořadí; vrátí pozice s Časovými souvislostmi (nikdy první dvě, ty jsou nejsnazší)
    const quizSlots = (day, topics) => {
        if (typeof day !== 'string' || day < QUIZ_FROM || !Array.isArray(topics)) return [];
        const rng = createSeededRandom(`mudrlant-kviz-dne-${day}:souvislosti`);
        const order = shuffle(topics.map((topic, index) => index).filter(index => index >= 2), rng).filter(index => QUIZ_TOPICS.has(topics[index]));
        const second = rng() < SECOND_SHARE;
        return order.slice(0, second ? 2 : 1).sort((a, b) => a - b);
    };
    // Plán otázky Kvízu dne: jen známé položky, vlastní řada čísel ze semínka otázky
    const quizPlan = (seed, ctx, item) => plan({ ctx, item, pool: ctx.items.filter(entry => entry.k === 1 && !entry.nq), rng: createSeededRandom(`${seed}:cas`), force: true });

    // --- Rozvržení osy výsledku (visuals.js typ chronology kreslí SVG) ---

    const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const CHAR = 6.1;
    const chronologyLayout = (spec, width, height) => {
        const rows = (spec && spec.rows) || [];
        const years = [...rows.flatMap(row => [row.from, row.to]), ...(spec.band ? [spec.band.from, spec.band.to] : [])].filter(Number.isFinite);
        if (!rows.length || !years.length) return null;
        const min = Math.min(...years);
        const max = Math.max(...years);
        const pad = Math.max(4, (max - min) * 0.06);
        const start = min - pad;
        const end = max + pad;
        const left = 10;
        const right = width - 10;
        const x = (year) => Math.round(left + (year - start) / (end - start) * (right - left));
        const tickCount = (step) => Math.floor(end / step) - Math.ceil(start / step) + 1;
        const step = NICE_STEPS.find(candidate => tickCount(candidate) <= 5) || 2000;
        const axis = 26;
        const rowHeight = Math.max(26, Math.min(40, Math.floor((height - axis - 4) / rows.length)));
        const top = 4;
        const placed = rows.map((row, i) => {
            const x1 = x(row.from);
            const x2 = row.point ? x1 : Math.max(x(row.to), x1 + 6);
            // Dlouhý název se zkrátí (roky zůstanou celé)
            const room = Math.floor((right - left) / CHAR);
            const name = row.label.length + row.sub.length + 1 > room ? `${row.label.slice(0, Math.max(6, room - row.sub.length - 2)).trimEnd()}…` : row.label;
            const text = `${name} ${row.sub}`;
            const textWidth = text.length * CHAR;
            // Popisek nad pruhem: od začátku pruhu, a když by vyčníval, zarovnaný ke konci (nikdy mimo osu)
            let anchor = 'start';
            let tx = x1;
            if (tx + textWidth > right) { anchor = 'end'; tx = Math.max(x2, left + textWidth); }
            if (anchor === 'end' && tx > right) tx = right;
            const y = top + i * rowHeight;
            return { ...row, text, x1, x2, y, barY: y + rowHeight - 12, textY: y + rowHeight - 16, tx, anchor };
        });
        const axisY = top + rows.length * rowHeight + 4;
        const ticks = [];
        for (let year = Math.ceil(start / step) * step; year <= end; year += step) ticks.push({ x: x(year), year, label: year < 0 ? `${-year} př. n. l.` : String(year) });
        const band = spec.band ? { x1: x(spec.band.from), x2: Math.max(x(spec.band.to), x(spec.band.from) + 2), label: spec.band.label } : null;
        return { rows: placed, ticks, axisY, band, height: axisY + axis, start, end };
    };

    // --- Vzhled (HTML; app.js vloží do panelu otázky a výsledku) ---

    const thumb = (photo, size) => (photo
        ? `<span data-time-photo="${escapeHtml(photo)}" class="${size} shrink-0 rounded-xl bg-slate-200 bg-contain bg-center bg-no-repeat dark:bg-slate-600" aria-hidden="true"></span>`
        : `<span class="${size} flex shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-slate-700 dark:text-amber-300" aria-hidden="true"><i data-lucide="${ICON}" class="h-5 w-5"></i></span>`);
    // Panel otázky: osobnost či věc (bez roků, ty jsou nápovědou), u otázek bez ní čtyři položky s obrázky a autorem
    const leadHtml = (data) => {
        const time = data.time;
        if (time.subject) {
            const subject = time.subject;
            return `
            <div class="absolute inset-0 flex overflow-y-auto overscroll-contain px-3 py-2 short:py-1.5" data-time-lead="subject">
                <div class="m-auto flex w-full flex-col gap-2">
                    <div class="flex items-center gap-3">
                        ${thumb(subject.photo, 'h-20 w-20 short:h-12 short:w-12')}
                        <div class="min-w-0">
                            <p data-time-subject class="text-xl font-black leading-tight text-slate-800 short:text-lg dark:text-slate-50">${escapeHtml(subject.name)}</p>
                            ${subject.detail ? `<p class="text-sm font-semibold leading-snug text-slate-500 short:text-xs dark:text-slate-400">${escapeHtml(subject.detail)}</p>` : ''}
                        </div>
                    </div>
                    <p class="text-xs font-semibold leading-snug text-slate-500 short:hidden dark:text-slate-400">${escapeHtml(leadNote(time))}</p>
                </div>
            </div>`;
        }
        return `
            <div class="absolute inset-0 overflow-y-auto overscroll-contain p-2.5" data-time-lead="items">
                <ul class="grid grid-cols-2 gap-2">
                    ${time.rows.map(row => `
                        <li class="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-1.5 dark:bg-slate-900/50">
                            ${thumb(row.photo, 'h-11 w-11')}
                            <span class="min-w-0">
                                <span class="block text-[13px] font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(row.name)}</span>
                                ${row.detail ? `<span class="block text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(row.detail)}</span>` : ''}
                            </span>
                        </li>`).join('')}
                </ul>
            </div>`;
    };
    const LEAD_NOTES = {
        meet: 'Stačí, aby žili ve stejné době. Kdy osobnost žila, ukáže nápověda.',
        nomeet: 'Tři z nich žili ve stejné době jako tato osobnost, jeden ne. Kdy osobnost žila, ukáže nápověda.',
        after: 'Rok úmrtí ukáže nápověda.', during: 'Roky života ukáže nápověda.', alive: 'Rok ukáže nápověda.', century: 'Rok ukáže nápověda.', age: 'Rok vzniku ukáže nápověda.'
    };
    const leadNote = (time) => LEAD_NOTES[time.type] || '';
    // Vysvětlení ve výsledku: osobnost či věc a možnosti s roky a vztahem (správná zeleně)
    const explainHtml = (data) => {
        const time = data.time;
        const rows = time.type === 'age' ? time.rows : [...time.rows].sort((a, b) => (time.type === 'oldest' ? (b.to - b.from) - (a.to - a.from) : a.from - b.from));
        const ROLE_ICONS = { correct: 'circle-check', subject: ICON, wrong: 'circle-x' };
        const line = (row, role) => `
            <li class="flex items-start gap-1.5 rounded-xl px-2 py-1 ${role === 'correct' ? 'bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700' : role === 'subject' ? 'bg-amber-50 dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/60'}">
                <i data-lucide="${ROLE_ICONS[role]}" class="mt-px h-4 w-4 shrink-0 ${role === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : role === 'subject' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}"></i>
                <span class="min-w-0 flex-1 text-[13px] leading-tight">
                    <b class="font-black text-slate-800 dark:text-slate-100">${escapeHtml(row.name)}</b>
                    <span class="font-bold tabular-nums text-slate-700 dark:text-slate-200">${escapeHtml(row.years)}</span>
                    ${row.relation ? `<span class="font-semibold text-slate-500 dark:text-slate-400">· ${escapeHtml(row.relation)}</span>` : ''}
                </span>
            </li>`;
        const subject = time.type === 'age' ? null : time.subject;
        return `
            <section data-time-explain aria-label="Vysvětlení">
                <ul class="flex flex-col gap-0.5">
                    ${subject ? line(subject, 'subject') : ''}
                    ${rows.map(row => line(row, time.type === 'age' ? (row.correct ? 'correct' : 'subject') : row.correct ? 'correct' : 'wrong')).join('')}
                </ul>
            </section>`;
    };
    // Fotky jako pozadí (adresu souboru nejde podržením vyčíst; CSP nedovolí vložený styl, nastaví se přes CSSOM)
    const mount = (rootElement) => {
        if (!rootElement) return;
        rootElement.querySelectorAll('[data-time-photo]').forEach(element => {
            const url = element.dataset.timePhoto;
            if (url) element.style.backgroundImage = `url("${url.replace(/["\\]/g, '\\$&')}")`;
        });
    };
    // Záložka panelu: druh osobnosti či věci (Osobnost, Vynález, Událost, Film…), u otázek bez ní Možnosti
    const leadLabel = (data) => {
        const subject = data.time && data.time.subject;
        if (!subject) return 'Možnosti';
        const kind = subject.kd === 'osoba' ? 'osobnost' : KIND_ONE[subject.kd] || 'dílo';
        return kind.charAt(0).toUpperCase() + kind.slice(1);
    };
    // Položky, na které se otázka ptá (ve výzvě a Kvízu dne se dál neopakují)
    const idsOf = (data) => (isKind(data) ? [data.time.subject && data.time.subject.id, ...data.time.rows.map(row => row.id)].filter(id => typeof id === 'string' && !id.startsWith('vek-')) : []);

    const api = {
        RATE, rate: START_RATE, force: null, QUIZ_FROM, DATA_FILE, LABEL, ICON, TYPES, WEIGHTS, GROUPS, KIND_ONE, TYPE_LABELS, SUBJECT_TYPES,
        timeFacts, extraFacts, authorFits, authorsOf, setIndex, load, entriesFor, plan, buildRound, check, isKind, idsOf,
        adultOverlap, lifeOverlap, lifeGap, canMeet, cannotMeet, marginAt, orderGap, centuryCore, inOneCentury, aliveAt, missedBy, yearsText, titleOf, relatedTo,
        quizSlots, quizPlan, chronologyLayout, leadHtml, leadLabel, explainHtml, mount, hintTimeline,
        get index() { return index; }
    };
    return api;
});
