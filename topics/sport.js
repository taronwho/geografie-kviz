// Téma Sport: sportovci, olympijské hry, sporty a disciplíny (data/sport.json)
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const topic = factory(isNode ? require('../quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = topic;
    else (root.MudrlantTopics = root.MudrlantTopics || []).push(topic);
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    const {
        formatNumber, formatYear, censorName, censorCountry, mergeCensored, stripBrackets, shuffle, normalizeAnswer, isAnswerMatch,
        personSimilarity, rankBySimilarity, takeDistinct, buildItemChoices, nameAnswers, getContinent, CONTINENT_NAMES
    } = core;

    const CATEGORIES = [
        { key: 'sportovci', label: 'Sportovci', one: 'sportovec', icon: 'medal', question: 'Kdo to je?', placeholder: 'Napiš jméno…', ask: 'Kdo je', sort: { by: 'born' } },
        { key: 'olympiady', label: 'Olympijské hry', one: 'olympiáda', icon: 'award', question: 'Které olympijské hry to jsou?', placeholder: 'Napiš hry, třeba LOH 1952…', sort: { by: 'year' } },
        { key: 'sporty', label: 'Sporty a disciplíny', one: 'sport', icon: 'volleyball', question: 'Co je to za sport?', placeholder: 'Napiš sport…', sort: { by: 'name' } }
    ];
    const categoryOf = (item) => CATEGORIES.find(category => category.key === item.c) || CATEGORIES[0];

    // Jak často se u sportovce ptáme na sport a u olympiády na pořadatelské město
    const SPORT_QUIZ_SHARE = 0.35;
    const HOST_QUIZ_SHARE = 0.5;
    const THIS_YEAR = new Date().getFullYear();

    // Sporty sportovců: podobné sporty jsou dobré nesprávné možnosti (k biatlonu běh na lyžích, k tenisu badminton)
    const SPORT_GROUPS = {
        'fotbal': 'mic tym leto', 'lední hokej': 'zima led tym', 'tenis': 'raketa mic leto', 'atletika': 'leto beh vytrvalost', 'basketbal': 'mic tym leto',
        'cyklistika': 'leto kolo vytrvalost', 'automobilové závody': 'motor', 'motocyklové závody': 'motor', 'plavání': 'voda leto',
        'box': 'boj', 'alpské lyžování': 'zima snih lyze', 'běh na lyžích': 'zima snih lyze vytrvalost', 'skoky na lyžích': 'zima snih lyze',
        'biatlon': 'zima snih lyze', 'rychlobruslení': 'zima led brusle', 'krasobruslení': 'zima led brusle', 'snowboarding': 'zima snih',
        'akrobatické lyžování': 'zima snih lyze', 'gymnastika': 'leto gym', 'golf': 'presnost', 'baseball': 'mic tym', 'americký fotbal': 'mic tym',
        'šerm': 'boj leto', 'judo': 'boj leto', 'smíšená bojová umění': 'boj', 'zápas': 'boj leto', 'házená': 'mic tym leto', 'volejbal': 'mic tym leto',
        'veslování': 'voda leto lod', 'kanoistika': 'voda leto lod', 'sportovní střelba': 'presnost leto', 'stolní tenis': 'raketa mic',
        'badminton': 'raketa', 'snooker': 'presnost', 'kriket': 'mic tym', 'ragby': 'mic tym', 'sportovní lezení': 'leto', 'jezdectví': 'leto',
        'triatlon': 'vytrvalost voda leto beh kolo', 'vzpírání': 'sila leto', 'skoky do vody': 'voda leto', 'jachting': 'voda leto lod', 'florbal': 'tym'
    };
    const groupsOf = (sport) => (SPORT_GROUPS[sport] || '').split(' ').filter(Boolean);
    // Další přijímané psané odpovědi na sport
    const SPORT_ALIASES = {
        'lední hokej': ['hokej'], 'automobilové závody': ['formule 1', 'F1', 'motorsport', 'automobilový sport'], 'alpské lyžování': ['lyžování', 'sjezdové lyžování'],
        'běh na lyžích': ['běžecké lyžování', 'běžky'], 'skoky na lyžích': ['skoky'], 'snowboarding': ['snowboard'], 'smíšená bojová umění': ['MMA'],
        'motocyklové závody': ['motocyklový sport', 'motorky'], 'sportovní střelba': ['střelba'], 'sportovní lezení': ['lezení', 'horolezectví'],
        'kanoistika': ['vodní slalom', 'kanoe', 'kajak'], 'gymnastika': ['sportovní gymnastika'], 'šerm': ['sportovní šerm'], 'jezdectví': ['jezdecký sport'],
        'snooker': ['kulečník'], 'ragby': ['rugby']
    };
    // Slova, která v popisu prozradí sport (u otázky „Ve kterém sportu se proslavil?“); za kmenem může být koncovka
    const SPORT_TERMS = {
        'fotbal': ['fotbal', 'kopan', 'FIFA', 'UEFA', 'Lig\\p{L}* mistrů', 'Zlat\\p{L}* míč', 'gól', 'brank'],
        'lední hokej': ['hokej', 'NHL', 'KHL', 'Stanley', 'puk', 'gól', 'brank'],
        'tenis': ['tenis', 'Wimbledon', 'grandslam', 'Grand Slam', 'ATP', 'WTA', 'dvouhr', 'čtyřhr', 'Davis', 'Fed Cup', 'Roland', 'US Open', 'Australian Open', 'raket'],
        'atletika': ['atlet', 'běž', 'běh', 'sprint', 'oštěp', 'disk', 'koul', 'kladiv', 'skok', 'skáč', 'maraton', 'desetiboj', 'sedmiboj', 'víceboj',
            'tyč', 'překáž', 'chůz', 'chod', 'trojskok', 'výšk', 'dálk', 'IAAF', 'World Athletics'],
        'basketbal': ['basketbal', 'NBA', 'koš', 'pivot', 'rozehráv'],
        'cyklistika': ['cykl', 'Tour de France', 'Giro', 'Vuelta', 'peloton', 'etap', 'bicykl', 'horsk\\p{L}* kol', 'silničn'],
        'automobilové závody': ['automobil', 'formul', 'F1', 'Grand Prix', 'Velk\\p{L}* cen', 'rallye', 'Le Mans', 'závodní jezd', 'pilot', 'stáj', 'NASCAR', 'IndyCar', 'Dakar', 'okruh'],
        'motocyklové závody': ['motocykl', 'MotoGP', 'motokros', 'ploch\\p{L}* dráh', 'plochodrážn', 'Grand Prix', 'Velk\\p{L}* cen'],
        'plavání': ['plav', 'bazén', 'kraul', 'motýl', 'polohov'],
        'box': ['box', 'ring', 'knockout', 'WBC', 'WBA', 'IBF', 'WBO', 'těžk\\p{L}* váh'],
        'alpské lyžování': ['lyž', 'sjezd', 'slalom', 'super-G', 'superobří', 'superkombinac'],
        'běh na lyžích': ['lyž', 'běž', 'běh', 'skiatlon', 'klasick\\p{L}* techni', 'voln\\p{L}* techni'],
        'skoky na lyžích': ['lyž', 'skok', 'skáč', 'můst', 'Turné'],
        'biatlon': ['biatlon', 'lyž', 'střel', 'stíhací'],
        'rychlobruslení': ['brusl', 'short track', 'dlouh\\p{L}* dráz'],
        'krasobruslení': ['brusl', 'piruet', 'tanc\\p{L}* na led'],
        'snowboarding': ['snowboard', 'U-ramp', 'slopestyle', 'slalom', 'lyž', 'big air'],
        'akrobatické lyžování': ['lyž', 'akrobati', 'boul', 'skikros', 'U-ramp'],
        'gymnastika': ['gymnast', 'prostn', 'kladin', 'bradl', 'hrazd', 'přeskok', 'kruh', 'víceboj'],
        'golf': ['golf', 'jamk', 'PGA', 'Masters', 'Ryder'],
        'baseball': ['baseball', 'MLB', 'pálk', 'nadhaz', 'home run'],
        'americký fotbal': ['fotbal', 'NFL', 'Super Bowl', 'quarterback', 'touchdown'],
        'šerm': ['šerm', 'kord', 'fleret', 'šavl'],
        'judo': ['judo', 'judist', 'džudo'],
        'smíšená bojová umění': ['MMA', 'UFC', 'smíšen', 'bojov', 'oktagon'],
        'zápas': ['zápas', 'řecko-římsk', 'voln\\p{L}* styl'],
        'házená': ['házen'],
        'volejbal': ['volejbal'],
        'veslování': ['vesl', 'skif', 'osmiv'],
        'kanoistika': ['kano', 'kajak', 'deblkan', 'singlkan', 'slalom', 'kanoe'],
        'sportovní střelba': ['střel', 'puš', 'pistol', 'brok', 'trap', 'skeet'],
        'stolní tenis': ['tenis', 'stoln', 'pingpong'],
        'badminton': ['badminton', 'košíč'],
        'snooker': ['snooker', 'kulečník', 'tág'],
        'kriket': ['kriket', 'wicket', 'pálk'],
        'ragby': ['ragby', 'rugby'],
        'sportovní lezení': ['lez', 'lézt', 'boulder', 'horolez', 'skal'],
        'jezdectví': ['jezd', 'kůň', 'koň', 'parkur', 'drezur', 'dostih', 'žokej'],
        'triatlon': ['triatlon', 'Ironman'],
        'vzpírání': ['vzpěr', 'vzpír', 'činka', 'nadhoz'],
        'skoky do vody': ['skok', 'můst', 'věž'],
        'jachting': ['jacht', 'plachet'],
        'florbal': ['florbal']
    };
    const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';

    // Indexy nad položkami tématu (po načtení dat se nemění)
    const indexes = new WeakMap();
    const indexOf = (ctx) => {
        const items = (ctx && ctx.items) || [];
        if (!indexes.has(items)) {
            const byId = new Map(items.map((item, rank) => [item.q, { item, rank }]));
            const athletes = items.filter(item => item.c === 'sportovci');
            const games = items.filter(item => item.c === 'olympiady').sort((a, b) => a.f.year - b.f.year);
            const sportCounts = new Map();
            for (const athlete of athletes) sportCounts.set(athlete.f.sport, (sportCounts.get(athlete.f.sport) || 0) + 1);
            const sportItems = new Map(items.filter(item => item.c === 'sporty').map(item => [normalizeAnswer(item.n), item]));
            // Vítězové her: kdo z dat na hrách vyhrál zlato (nejznámější první)
            const champions = new Map();
            for (const athlete of athletes) {
                for (const game of athlete.f.goldAt || []) champions.set(game, [...(champions.get(game) || []), athlete]);
            }
            // Příjmení, která má v datech jen jeden sportovec (Jágr, Federer) – psaná odpověď je přijme
            const words = new Map();
            for (const athlete of athletes) {
                for (const word of new Set(athlete.n.split(/\s+/).slice(1))) words.set(normalizeAnswer(word), (words.get(normalizeAnswer(word)) || 0) + 1);
            }
            const fullNames = new Set(items.map(item => normalizeAnswer(item.n)));
            indexes.set(items, { byId, athletes, games, sportCounts, sportItems, champions, words, fullNames });
        }
        return indexes.get(items);
    };
    const gameLabel = (game) => `${game.f.type === 'L' ? 'LOH' : 'ZOH'} ${game.f.year}`;
    const gamesOf = (item, ctx, key) => (item.f[key] || []).map(id => (indexOf(ctx).byId.get(id) || {}).item).filter(Boolean).sort((a, b) => a.f.year - b.f.year);

    // --- Sportovci ---

    const lifeRange = (f) => f.died !== undefined ? `${f.born}–${f.died}` : `* ${f.born}`;
    // Kariéra: známý konec, jinak u mladších sportovců (asi pořád aktivní) do dneška
    const careerOf = (f) => {
        if (f.from === undefined) return null;
        if (f.to !== undefined) return { from: f.from, to: f.to };
        return f.died === undefined && f.born >= THIS_YEAR - 45 ? { from: f.from, to: THIS_YEAR } : null;
    };
    const athleteFacts = (item, ctx, mode) => {
        const f = item.f;
        const facts = [];
        const full = mode === 'result' || mode === 'card';
        if (full) {
            facts.push({ label: 'Život', value: lifeRange(f) });
            const career = careerOf(f);
            if (career) facts.push({ label: 'Kariéra', value: f.to !== undefined ? `${career.from}–${career.to}` : `od ${career.from}` });
            facts.push({ label: 'Sport', value: f.sport });
        }
        if (f.land) facts.push({ label: 'Země', value: f.land });
        if (f.pos) facts.push({ label: 'Post', value: f.pos });
        if (f.disc) facts.push({ label: 'Disciplína', value: f.disc });
        if (f.clubs) facts.push({ label: f.clubs.length > 1 ? 'Kluby' : 'Klub', value: f.clubs.join(', ') });
        const golds = gamesOf(item, ctx, 'goldAt');
        if (golds.length) facts.push({ label: 'Olympijské zlato', value: golds.map(gameLabel).join(', ') });
        else if ((f.og || []).length) facts.push({ label: 'Olympijské hry', value: gamesOf(item, ctx, 'og').slice(0, 4).map(gameLabel).join(', ') });
        return facts;
    };

    // Orientační události na časové ose: ze sportu sportovce, české (u českých sportovců) a světové
    const WORLD_EVENTS = [
        [1896, 'první novodobá olympiáda'], [1914, 'začátek 1. světové války'], [1924, 'první zimní olympiáda'], [1936, 'olympiáda v Berlíně'],
        [1939, 'začátek 2. světové války'], [1945, 'konec 2. světové války'], [1969, 'přistání na Měsíci'], [1972, 'útok na olympiádě v Mnichově'],
        [1980, 'bojkot olympiády v Moskvě'], [1989, 'pád Berlínské zdi'], [2001, 'útoky 11. září'], [2020, 'pandemie covidu']
    ];
    const CZECH_EVENTS = [
        [1918, 'vznik Československa'], [1948, 'komunistický převrat'], [1952, 'Zátopek – tři zlata v Helsinkách'], [1968, 'Čáslavská – čtyři zlata v Mexiku'],
        [1976, 'Panenkova penalta, titul mistrů Evropy'], [1985, 'hokejisté mistry světa v Praze'], [1989, 'sametová revoluce'], [1993, 'vznik České republiky'],
        [1998, 'Nagano – zlato hokejistů'], [2010, 'Sáblíková – dvě zlata ve Vancouveru'], [2018, 'Ledecká – zlato na lyžích i snowboardu']
    ];
    const SPORT_EVENTS = {
        'fotbal': [[1863, 'první pravidla fotbalu'], [1930, 'první mistrovství světa'], [1934, 'Československo ve finále MS'], [1955, 'první Pohár mistrů'],
            [1962, 'Československo ve finále MS'], [1966, 'Anglie mistrem světa'], [1986, 'Maradonova „Boží ruka“'], [1992, 'vznik Ligy mistrů'],
            [1996, 'Češi ve finále mistrovství Evropy'], [2014, 'Německo porazilo Brazílii 7:1']],
        'lední hokej': [[1917, 'vznik NHL'], [1920, 'hokej poprvé na olympiádě'], [1947, 'Československo poprvé mistrem světa'], [1972, 'série Kanada–SSSR'],
            [1980, '„zázrak na ledě“ v Lake Placid'], [1998, 'hráči NHL poprvé na olympiádě'], [2005, 'výluka v NHL']],
        'tenis': [[1877, 'první Wimbledon'], [1968, 'začátek otevřené éry'], [1980, 'Československo vyhrálo Davisův pohár'], [1988, 'tenis zpět na olympiádě'],
            [2012, 'Češky vyhrály Fed Cup']],
        'atletika': [[1912, 'založení IAAF'], [1954, 'první míle pod 4 minuty'], [1968, 'Beamonův skok v Mexiku'], [1983, 'první MS v atletice'],
            [2009, 'Boltův rekord 9,58 s']],
        'basketbal': [[1891, 'vznik basketbalu'], [1946, 'vznik NBA'], [1992, 'Dream Team v Barceloně']],
        'cyklistika': [[1903, 'první Tour de France'], [2012, 'Armstrong přišel o tituly z Tour']],
        'automobilové závody': [[1906, 'první Grand Prix'], [1950, 'první mistrovství světa F1'], [1994, 'smrt Ayrtona Senny']],
        'plavání': [[1972, 'Spitz – 7 zlatých v Mnichově'], [2008, 'Phelps – 8 zlatých v Pekingu']],
        'box': [[1971, 'zápas století Ali–Frazier'], [1974, 'Ali–Foreman v Kinshase']],
        'golf': [[1860, 'první The Open'], [1997, 'Woods poprvé vyhrál Masters']],
        'gymnastika': [[1976, 'první desítka v gymnastice']]
    };
    const WINTER_SPORTS = new Set(Object.keys(SPORT_GROUPS).filter(sport => groupsOf(sport).includes('zima')));
    const WINTER_EVENTS = [[1924, 'první zimní olympiáda'], [1956, 'první přenos zimních her v televizi'], [1998, 'olympiáda v Naganu']];
    const eventsFor = (item) => {
        const sport = item.f.sport;
        const own = [...(SPORT_EVENTS[sport] || []), ...(WINTER_SPORTS.has(sport) ? WINTER_EVENTS : [])].map(([year, text]) => [year, text, 2]);
        const czech = item.cz === 1 ? CZECH_EVENTS.map(([year, text]) => [year, text, 1]) : [];
        const taken = new Set([...own, ...czech].map(([year]) => year));
        return [...own, ...czech.filter(([year]) => !own.some(([other]) => other === year)),
            ...WORLD_EVENTS.filter(([year]) => !taken.has(year)).map(([year, text]) => [year, text, 0])];
    };
    const athleteTimeline = (item) => {
        const f = item.f;
        const spans = [{ kind: 'life', from: f.born, to: f.died ?? THIS_YEAR }];
        const career = careerOf(f);
        if (career) spans.push({ kind: 'reign', from: career.from, to: career.to });
        return { type: 'timeline', spans, points: [], hide: item.n, spanLabel: 'kariéra', anchors: eventsFor(item) };
    };

    // Otázka „Ve kterém sportu se proslavil?“: jen u sportovců s jediným sportem
    const sportChoices = (item, ctx, rng) => {
        const { sportCounts, sportItems } = indexOf(ctx);
        const own = item.f.sport;
        const groups = groupsOf(own);
        // Podobné sporty (stejné skupiny), u remízy ty, které mají v datech víc sportovců (známější)
        const score = ([sport, count]) => 3 * groupsOf(sport).filter(group => groups.includes(group)).length + 0.5 * Math.log10(count + 1);
        const ranked = rankBySimilarity([...sportCounts.entries()].filter(([sport]) => sport !== own), score, rng);
        const wrong = takeDistinct(ranked, 3, new Set([normalizeAnswer(own)]), ([sport]) => sport).map(([sport]) => sport);
        if (wrong.length < 3) return null;
        // Sport, který je i položkou tématu, jde po odpovědi otevřít
        const idOf = (sport) => (sportItems.get(normalizeAnswer(sport)) || {}).q || `sport-${normalizeAnswer(sport).replace(/ /g, '-')}`;
        return shuffle([own, ...wrong], rng).map(sport => ({ id: idOf(sport), label: sport, correct: sport === own }));
    };
    const sportPattern = (sport) => new RegExp(`${NOT_LETTER_BEFORE}(?:${(SPORT_TERMS[sport] || []).join('|')})\\p{L}*`, 'giu');
    // Popis bez sportu: slova sportu, druh sportovce (hokejista), kluby a disciplíny
    const censorSport = (text, item) => {
        const f = item.f;
        // Nejdřív názvy (censorName odstraní závorky, tedy i hotové [***]), potom slova sportu
        const names = [f.sport, item.ty, ...(SPORT_ALIASES[f.sport] || []), ...(f.clubs || []), ...(f.disc ? f.disc.split(', ') : [])].filter(Boolean).join(', ');
        const named = censorName(text, names);
        return mergeCensored(SPORT_TERMS[f.sport] ? named.replace(sportPattern(f.sport), '[***]') : named);
    };
    const sportHints = (item, ctx) => {
        const f = item.f;
        return [
            { kind: 'facts', label: 'o sportovci', icon: 'user', facts: [
                f.land ? { label: 'Země', value: f.land } : null,
                { label: 'Narození', value: String(f.born) },
                (f.og || []).length ? { label: 'Olympijské hry', value: gamesOf(item, ctx, 'og').slice(0, 4).map(gameLabel).join(', ') } : null
            ].filter(Boolean) },
            { kind: 'facts', label: 'kluby a disciplíny', icon: 'users', facts: [
                f.pos ? { label: 'Post', value: f.pos } : null,
                f.clubs ? { label: f.clubs.length > 1 ? 'Kluby' : 'Klub', value: f.clubs.join(', ') } : null,
                f.disc ? { label: 'Disciplína', value: f.disc } : null
            ].filter(Boolean) },
            { kind: 'photo' }
        ];
    };

    // --- Olympijské hry ---

    const hostAnswers = (game) => [...new Set([game.f.host, ...game.f.names])];
    // Možnost je hlavní pořadatelské město (u Milána a Cortiny jen Milán – dvojice měst by mezi ostatními byla nápadná)
    const hostLabel = (game) => game.f.names[0];
    // Pořadatelská města jiných her stejného druhu z podobné doby; ne ta, kde se konala i hádaná hra (Cortina 1956 × 2026)
    const hostChoices = (item, ctx, rng) => {
        const own = new Set([...item.f.hosts, ...(item.f.also || [])]);
        const continent = getContinent(item, ctx.countries || {});
        const others = indexOf(ctx).games.filter(game => game.f.type === item.f.type && game.q !== item.q && !game.f.hosts.some(host => own.has(host)));
        const score = (game) => -Math.abs(game.f.year - item.f.year) / 12 + (continent && getContinent(game, ctx.countries || {}) === continent ? 1 : 0);
        const wrong = takeDistinct(rankBySimilarity(others, score, rng), 3, new Set([normalizeAnswer(hostLabel(item))]), game => hostLabel(game));
        if (wrong.length < 3) return null;
        // Možnost odkazuje na město v zeměpisu (když je tam), ať se o něm dá dočíst
        return shuffle([item, ...wrong], rng).map(game => ({ id: game.f.hosts[0], topic: 'zemepis', label: hostLabel(game), correct: game === item }));
    };
    const neighbours = (item, ctx) => {
        const list = indexOf(ctx).games.filter(game => game.f.type === item.f.type);
        const index = list.findIndex(game => game.q === item.q);
        return { previous: list[index - 1], next: list[index + 1] };
    };
    const championsOf = (item, ctx) => {
        const { champions, byId } = indexOf(ctx);
        return (champions.get(item.q) || []).slice()
            .sort((a, b) => (b.k || 0) - (a.k || 0) || (b.cz || 0) - (a.cz || 0) || byId.get(a.q).rank - byId.get(b.q).rank)
            .slice(0, 3).map(athlete => athlete.n);
    };
    const formatDate = (iso) => {
        const [year, month, day] = iso.split('-').map(Number);
        return `${day}. ${month}. ${year}`;
    };
    const gamesFacts = (item, ctx, mode) => {
        const f = item.f;
        const facts = [];
        const full = mode === 'result' || mode === 'card';
        if (full) {
            facts.push({ label: f.hosts.length > 1 ? 'Pořadatelé' : 'Pořadatel', value: f.host }, { label: 'Stát', value: f.land });
            if (f.start && f.end) facts.push({ label: 'Termín', value: `${formatDate(f.start)} – ${formatDate(f.end)}` });
            else if (f.held) facts.push({ label: 'Konaly se', value: String(f.held) });
        }
        if (f.athletes) facts.push({ label: 'Sportovců', value: formatNumber(f.athletes) });
        if (f.nations) facts.push({ label: 'Zemí', value: formatNumber(f.nations) });
        if (f.opened) facts.push({ label: 'Zahájil', value: f.opened });
        if (f.flame) facts.push({ label: 'Oheň zapálil', value: f.flame });
        if (full) {
            const champions = championsOf(item, ctx);
            if (champions.length) facts.push({ label: 'Olympijští vítězové', value: champions.join(', ') });
        }
        return facts;
    };
    const gamesNameHints = (item, ctx) => {
        const { previous, next } = neighbours(item, ctx);
        const champions = championsOf(item, ctx);
        return [
            { kind: 'photo' },
            { kind: 'facts', facts: gamesFacts(item, ctx, 'name') },
            { kind: 'facts', label: 'olympijští vítězové', icon: 'medal', facts: champions.length ? [{ label: 'Olympijští vítězové', value: champions.join(', ') }] : [] },
            { kind: 'facts', label: 'sousední hry', icon: 'calendar-range', facts: [
                previous ? { label: 'Předchozí hry', value: previous.f.host } : null,
                next ? { label: 'Další hry', value: next.f.host } : null
            ].filter(Boolean) }
        ];
    };
    const gamesMap = (item, span) => item.la === undefined ? null
        : { type: 'map', lat: item.la, lon: item.lo, span, highlightIso: '', label: 'Pořadatelské město je uprostřed' };
    const hostHints = (item, ctx) => {
        const continent = getContinent(item, ctx.countries || {});
        return [
            { kind: 'facts', label: 'kontinent', icon: 'globe', facts: continent ? [{ label: 'Kontinent', value: CONTINENT_NAMES[continent] }] : [] },
            { kind: 'visual', spec: gamesMap(item, 36) },
            { kind: 'facts', label: 'stát', icon: 'flag', facts: [{ label: 'Stát', value: item.f.land }] }
        ];
    };
    // Popis her bez roku a pořadového čísla („XV. letní olympijské hry“, „Hry XV. olympiády“) – město zůstane
    const censorGamesYear = (text, item) => {
        const years = [item.f.year, item.f.held].filter(Boolean);
        let result = stripBrackets(text).replace(/\s{2,}/g, ' ');
        for (const year of years) result = result.replace(new RegExp(`(?<!\\d)${year}(?!\\d)`, 'g'), '[***]');
        result = result.replace(/(?<![\p{L}])[IVXLC]+\.(?=\s*(?:letní|zimní|olympi|Olympi|Letní|Zimní))/gu, '[***]');
        return mergeCensored(result);
    };
    const censorHost = (text, item, ctx) => {
        const country = ((ctx.countries || {})[(item.co || [])[0]] || {}).name;
        return censorCountry(text, item.f.land, [...hostAnswers(item), country].filter(Boolean));
    };

    // --- Sporty a disciplíny ---

    const tagsOf = (item) => item.tg || [];
    const isCrossTag = (tag) => tag.startsWith('x');
    const SPORT_TITLES = [['styl', 'Který plavecký způsob to je?', 'Napiš plavecký způsob…'], ['atletika', 'Která atletická disciplína to je?', 'Napiš disciplínu…']];
    const SPORT_NAME_ALIASES = {
        'Lední hokej': ['hokej'], 'Formule 1': ['F1'], 'Skok daleký': ['skok do dálky'], 'Sportovní střelba': ['střelba'], 'Sportovní šerm': ['šerm'],
        'Smíšená bojová umění': ['MMA'], 'Maratonský běh': ['maraton'], 'Synchronizované plavání': ['umělecké plavání'], 'Kulečník': ['biliár'],
        'Plážový volejbal': ['beachvolejbal', 'beach volejbal'], 'Snowboarding': ['snowboard'], 'Skateboarding': ['skateboard'], 'Bobování': ['boby', 'bob'],
        'Saně': ['sáňkování'], 'Parkurové skákání': ['parkur', 'skoky na koni'], 'Dostihový sport': ['dostihy'], 'Běh na 100 m': ['sprint', 'stovka'],
        'Sportovní lezení': ['lezení'], 'Kraul': ['volný způsob'], 'Bandy': ['bandy hokej'], 'Sportovní gymnastika': ['sportovní gymnastika']
    };
    const sportFacts = (item) => {
        const f = item.f;
        return [
            f.players ? { label: 'Hráčů na hřišti', value: `${f.players} za tým` } : null,
            f.oh ? { label: 'Na olympiádě od', value: String(f.oh) } : null,
            f.from ? { label: 'Vznik', value: String(f.from) } : null,
            f.origin ? { label: 'Země původu', value: f.origin } : null
        ].filter(Boolean);
    };
    // Vybavení bez názvu sportu (tenisová raketa by prozradila tenis)
    const equipmentOf = (item) => (item.f.uses || []).filter(use => !censorName(use, [item.n, ...(SPORT_NAME_ALIASES[item.n] || [])].join(', ')).includes('[***]'));

    // --- Společné ---

    // Nesprávné možnosti: sportovci stejného pohlaví, doby a sportu (k Čechovi Češi); hry stejného druhu a podobné doby;
    // sporty ze stejné skupiny (míčové, zimní, bojové) – ale ne ty, které jdou na fotce splést (plavání × kraul)
    const similarity = (item, other) => {
        const f = item.f || {};
        const g = other.f || {};
        if (item.c === 'sportovci') {
            return personSimilarity(item, other) + (f.sport === g.sport ? 3 : 0) + (f.land && f.land === g.land ? 2 : 0) + (item.cz && other.cz ? 2 : 0);
        }
        if (item.c === 'olympiady') return (f.type === g.type ? 6 : 0) - Math.abs(f.year - g.year) / 8;
        const tags = tagsOf(item);
        const otherTags = tagsOf(other);
        if (tags.some(tag => isCrossTag(tag) && otherTags.includes(tag))) return -Infinity;
        // Plavecké způsoby jen mezi sebou, atletické disciplíny taky
        for (const tag of ['styl', 'atletika']) if (tags.includes(tag) !== otherTags.includes(tag)) return -10;
        return 2 * tags.filter(tag => !isCrossTag(tag) && otherTags.includes(tag)).length;
    };

    const factsOf = (item, ctx, mode) => {
        if (item.c === 'sportovci') return athleteFacts(item, ctx, mode);
        if (item.c === 'olympiady') return gamesFacts(item, ctx, mode);
        const facts = sportFacts(item);
        const equipment = equipmentOf(item);
        if ((mode === 'result' || mode === 'card') && equipment.length) facts.push({ label: 'Vybavení', value: equipment.join(', ') });
        return facts;
    };

    return {
        id: 'sport',
        title: 'Sport',
        icon: 'trophy',
        emoji: '🏆',
        color: 'red',
        dataFile: 'data/sport.json',
        subtitleIcon: 'medal',
        words: {
            question: 'Kdo nebo co to je?',
            one: 'pojem',
            next: 'Další otázka',
            atlas: 'Atlas sportu',
            placeholder: 'Napiš odpověď…',
            tierKnown: 'Slavní sportovci, známé sporty a poválečné olympiády',
            czechBadge: 'Česká stopa'
        },
        categories: CATEGORIES,

        similarity,

        // Psané odpovědi: příjmení sportovce (jen jednoznačné), u her „LOH 1952“ i „Helsinky 1952“, u sportů běžné názvy
        nameAliases: (item, ctx) => {
            if (item.c === 'sportovci') {
                const { words, fullNames } = indexOf(ctx);
                return [...new Set(item.n.split(/\s+/).slice(1))].filter(word => word.length >= 4 && !word.includes('.')
                    && words.get(normalizeAnswer(word)) === 1 && !fullNames.has(normalizeAnswer(word)));
            }
            if (item.c === 'olympiady') {
                const year = item.f.year;
                return [gameLabel(item), ...hostAnswers(item).map(city => `${city} ${year}`)];
            }
            return SPORT_NAME_ALIASES[item.n] || [];
        },

        // Sportovec: občas „Ve kterém sportu se proslavil?“; olympiáda: občas „Kde se konaly?“;
        // atletické disciplíny a plavecké způsoby se ptají vlastní otázkou
        specialQuestion: (item, ctx, rng) => {
            if (item.c === 'sportovci') {
                if (!(rng() < SPORT_QUIZ_SHARE) || !item.f.one || !SPORT_GROUPS[item.f.sport]) return null;
                const choices = sportChoices(item, ctx, rng);
                if (!choices) return null;
                return {
                    type: 'sport',
                    title: `Ve kterém sportu se proslavil${item.sx === 'f' ? 'a' : ''}?`,
                    showName: true,
                    choices,
                    accepted: [item.f.sport, ...(SPORT_ALIASES[item.f.sport] || [])],
                    placeholder: 'Napiš sport, třeba tenis',
                    answerLabel: item.f.sport
                };
            }
            if (item.c === 'olympiady') {
                if (!(rng() < HOST_QUIZ_SHARE)) return null;
                const choices = hostChoices(item, ctx, rng);
                if (!choices) return null;
                return {
                    type: 'host',
                    title: `Kde se konaly ${item.f.type === 'L' ? 'letní' : 'zimní'} olympijské hry ${item.f.year}?`,
                    showName: true,
                    choices,
                    accepted: hostAnswers(item),
                    placeholder: 'Napiš město…',
                    answerLabel: item.f.host
                };
            }
            const title = SPORT_TITLES.find(([tag]) => tagsOf(item).includes(tag));
            if (!title) return null;
            return {
                type: 'name',
                title: title[1],
                showName: false,
                choices: buildItemChoices(item, ctx.items, rng, other => similarity(item, other)),
                accepted: nameAnswers(item, SPORT_NAME_ALIASES[item.n] || []),
                placeholder: title[2],
                answerLabel: item.n
            };
        },
        censor: (type, text, item, ctx) => {
            if (type === 'sport') return censorSport(text, item);
            if (type === 'host') return censorHost(text, item, ctx);
            // U her se v popisu skryje jen rok, pořadatelské město je vodítko
            if (type === 'name' && item.c === 'olympiady') return censorGamesYear(text, item);
            return null;
        },
        findAnswer: (type, answer, item, ctx) => {
            if (type === 'sport') {
                const sport = [...indexOf(ctx).sportItems.values()].find(other => isAnswerMatch(answer, [other.n]));
                return sport ? { topic: 'sport', id: sport.q } : null;
            }
            if (type === 'host') {
                const game = indexOf(ctx).games.find(other => other.q !== item.q && isAnswerMatch(answer, hostAnswers(other)));
                return game ? { topic: 'zemepis', id: game.f.hosts[0] } : null;
            }
            return null;
        },
        // Obrázek sportu je otázka sama – je vidět hned, fotka už pak nápovědou není
        questionImage: (item, ctx, type) => item.c === 'sporty' && type === 'name' && item.im ? { file: item.im, hash: item.ih, label: 'Sport', icon: 'image' } : null,

        hints: (item, ctx, type) => {
            if (item.c === 'sportovci') {
                if (type === 'sport') return sportHints(item, ctx);
                // Nejdřív osa (doba), pak fakta (země, klub, medaile), nakonec fotka – podle ní slavné sportovce pozná každý
                return [{ kind: 'visual', spec: athleteTimeline(item) }, { kind: 'facts', facts: athleteFacts(item, ctx, type) }, { kind: 'photo' }];
            }
            if (item.c === 'olympiady') return type === 'host' ? hostHints(item, ctx) : gamesNameHints(item, ctx);
            const equipment = equipmentOf(item);
            return [
                { kind: 'facts', facts: sportFacts(item) },
                { kind: 'facts', label: 'vybavení', icon: 'dumbbell', facts: equipment.length ? [{ label: 'Vybavení', value: equipment.join(', ') }] : [] }
            ];
        },
        visual: (item, ctx, mode) => {
            if (item.c === 'sportovci') return mode === 'sport' ? null : athleteTimeline(item);
            if (item.c === 'olympiady') return mode === 'name' ? null : gamesMap(item, mode === 'host' ? 36 : 24);
            return null;
        },
        facts: factsOf,
        subtitle: (item) => {
            const f = item.f || {};
            if (item.c === 'sportovci') return [lifeRange(f), f.sport, f.land].filter(Boolean).join(' · ');
            if (item.c === 'olympiady') return [f.host, f.land].filter(Boolean).join(' · ');
            return [item.ty, f.oh ? `na olympiádě od ${formatYear(f.oh)}` : ''].filter(Boolean).join(' · ');
        },
        coords: (item) => item.c === 'olympiady' && item.la !== undefined ? { lat: item.la, lon: item.lo } : null,
        isCzech: (item) => item.cz === 1
    };
});
