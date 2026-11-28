// Řetězovka – původní generátor řetězu (do 14. 11. 2026). Řetězy dnů před chain.js NEW_FROM se staví touto zmrazenou kopií, ať
// řetěz dne, který už někdo hrál, vyjde všem stejně i po nasazení nového generátoru (tests/chain.test.js porovnává výstup se snímkem
// tests/chain-legacy-snapshot.json). Kód se NEMĚNÍ; nový generátor, hra a obrazovky jsou v chain.js. V prohlížeči se načte, jen když je
// potřeba (chain.js legacy), v Node přes require.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = api;
    else root.MudrlantChainLegacy = api;
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';
    const LINKS = 7;
    const MAX_SCORE = LINKS * (LINKS + 1) / 2;
    const KEY = 'mudrlant.chain';
    const HISTORY_DAYS = 60;
    // Témata, ze kterých se graf staví (všechna se musí načíst, jinak by řetěz dne vyšel jinak než ostatním)
    const SOURCES = ['zemepis', 'architektura', 'hudba', 'literatura', 'umeni', 'film', 'sport'];
    // XP za Řetězovku dne: 2 XP za bod a 10 XP navíc za celý řetěz (28 bodů = 66 XP)
    const XP_PER_POINT = 2;
    const FULL_XP = 10;

    // --- Dny (Praha) ---
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => DAY_PATTERN.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(Date.parse(`${day}T00:00:00Z`) + count * 86400000);
    const pragueDay = (now = new Date()) => {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now instanceof Date ? now : new Date(now));
            const get = (type) => (parts.find(part => part.type === type) || {}).value;
            const text = `${get('year')}-${get('month')}-${get('day')}`;
            if (isDay(text)) return text;
        } catch (error) { /* bez Intl se vezme UTC */ }
        return dayOf(now instanceof Date ? now.getTime() : Number(now));
    };
    // „12. 11.“ a „12. 11. 2026“
    const formatDay = (day, withYear = false) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? `${Number(match[3])}. ${Number(match[2])}.${withYear ? ` ${match[1]}` : ''}` : '';
    };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const pointsWord = (count) => plural(count, 'bod', 'body', 'bodů');
    const linksWord = (count) => plural(count, 'článek', 'články', 'článků');
    const playersWord = (count) => plural(count, 'hráč', 'hráči', 'hráčů');

    // --- Náhoda ze semínka (stejná pro všechny hráče, jako v daily-quiz.js) ---
    const hash32 = (text) => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
        return hash >>> 0;
    };
    const seededRandom = (seedText) => {
        let state = hash32(String(seedText));
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const shuffle = (list, rng) => {
        const result = [...list];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    };
    const seedFor = (day) => `mudrlant-retezovka-${day}`;

    // --- Státy: odkud kdo pochází („z Francie“) a přídavná jména národností (kmeny pro kontrolu popisu osobnosti) ---
    // Otázka „Kdo z těchto skladatelů pochází z Francie?“ jde jen u států z tabulky (tvar 2. pádu je ručně zkontrolovaný);
    // u ostatních se ptá jen opačně („Ze které země pochází …?“, odpověď v 1. pádu)
    const COUNTRY_WORDS = {
        'Spojené státy americké': ['ze Spojených států amerických', 've Spojených státech amerických', 'americk'],
        'Česko': ['z Česka', 'v Česku', 'česk', 'moravsk'],
        'Spojené království': ['ze Spojeného království', 've Spojeném království', 'britsk', 'anglick', 'skotsk', 'velšsk', 'severoirsk'],
        'Francie': ['z Francie', 've Francii', 'francouzsk'],
        'Itálie': ['z Itálie', 'v Itálii', 'italsk'],
        'Německo': ['z Německa', 'v Německu', 'německ'],
        'Rusko': ['z Ruska', 'v Rusku', 'rusk'],
        'Španělsko': ['ze Španělska', 've Španělsku', 'španělsk'],
        'Rakousko': ['z Rakouska', 'v Rakousku', 'rakousk'],
        'Nizozemsko': ['z Nizozemska', 'v Nizozemsku', 'nizozemsk', 'holandsk'],
        'Kanada': ['z Kanady', 'v Kanadě', 'kanadsk'],
        'Slovensko': ['ze Slovenska', 'na Slovensku', 'slovensk'],
        'Norsko': ['z Norska', 'v Norsku', 'norsk'],
        'Švédsko': ['ze Švédska', 've Švédsku', 'švédsk'],
        'Japonsko': ['z Japonska', 'v Japonsku', 'japonsk'],
        'Irsko': ['z Irska', 'v Irsku', 'irsk'],
        'Švýcarsko': ['ze Švýcarska', 've Švýcarsku', 'švýcarsk'],
        'Belgie': ['z Belgie', 'v Belgii', 'belgick', 'vlámsk', 'valonsk'],
        'Brazílie': ['z Brazílie', 'v Brazílii', 'brazilsk'],
        'Polsko': ['z Polska', 'v Polsku', 'polsk'],
        'Dánsko': ['z Dánska', 'v Dánsku', 'dánsk'],
        'Finsko': ['z Finska', 've Finsku', 'finsk'],
        'Maďarsko': ['z Maďarska', 'v Maďarsku', 'maďarsk', 'uhersk'],
        'Jamajka': ['z Jamajky', 'na Jamajce', 'jamajsk'],
        'Argentina': ['z Argentiny', 'v Argentině', 'argentinsk'],
        'Slovinsko': ['ze Slovinska', 've Slovinsku', 'slovinsk'],
        'Austrálie': ['z Austrálie', 'v Austrálii', 'australsk'],
        'Mexiko': ['z Mexika', 'v Mexiku', 'mexick'],
        'Indie': ['z Indie', 'v Indii', 'indick'],
        'Portugalsko': ['z Portugalska', 'v Portugalsku', 'portugalsk'],
        'Ukrajina': ['z Ukrajiny', 'na Ukrajině', 'ukrajinsk'],
        'Kolumbie': ['z Kolumbie', 'v Kolumbii', 'kolumbijsk'],
        'Řecko': ['z Řecka', 'v Řecku', 'řeck'],
        'Senegal': ['ze Senegalu', 'v Senegalu', 'senegalsk'],
        'Bělorusko': ['z Běloruska', 'v Bělorusku', 'bělorusk'],
        'Kuba': ['z Kuby', 'na Kubě', 'kubánsk'],
        'Chile': ['z Chile', 'v Chile', 'chilsk'],
        'Jihoafrická republika': ['z Jihoafrické republiky', 'v Jihoafrické republice', 'jihoafrick'],
        'Nigérie': ['z Nigérie', 'v Nigérii', 'nigerijsk'],
        'Keňa': ['z Keni', 'v Keni', 'keňsk'],
        'Rumunsko': ['z Rumunska', 'v Rumunsku', 'rumunsk'],
        'Nový Zéland': ['z Nového Zélandu', 'na Novém Zélandu', 'novozélandsk'],
        'Srbsko': ['ze Srbska', 'v Srbsku', 'srbsk'],
        'Chorvatsko': ['z Chorvatska', 'v Chorvatsku', 'chorvatsk'],
        'Etiopie': ['z Etiopie', 'v Etiopii', 'etiopsk'],
        'Arménie': ['z Arménie', 'v Arménii', 'arménsk'],
        'Estonsko': ['z Estonska', 'v Estonsku', 'estonsk'],
        'Island': ['z Islandu', 'na Islandu', 'islandsk'],
        'Jižní Korea': ['z Jižní Koreje', 'v Jižní Koreji', 'jihokorejsk', 'korejsk'],
        'Peru': ['z Peru', 'v Peru', 'peruánsk'],
        'Čína': ['z Číny', 'v Číně', 'čínsk'],
        'Gruzie': ['z Gruzie', 'v Gruzii', 'gruzínsk'],
        'Albánie': ['z Albánie', 'v Albánii', 'albánsk'],
        'Turecko': ['z Turecka', 'v Turecku', 'tureck'],
        'Uruguay': ['z Uruguaye', 'v Uruguayi', 'uruguaysk'],
        'Egypt': ['z Egypta', 'v Egyptě', 'egyptsk'],
        'Kamerun': ['z Kamerunu', 'v Kamerunu', 'kamerunsk'],
        'Filipíny': ['z Filipín', 'na Filipínách', 'filipínsk'],
        'Kazachstán': ['z Kazachstánu', 'v Kazachstánu', 'kazašsk', 'kazachstánsk'],
        'Sýrie': ['ze Sýrie', 'v Sýrii', 'syrsk'],
        'Litva': ['z Litvy', 'v Litvě', 'litevsk'],
        'Lotyšsko': ['z Lotyšska', 'v Lotyšsku', 'lotyšsk'],
        'Bulharsko': ['z Bulharska', 'v Bulharsku', 'bulharsk'],
        'Izrael': ['z Izraele', 'v Izraeli', 'izraelsk'],
        'Írán': ['z Íránu', 'v Íránu', 'íránsk', 'persk'],
        'Lucembursko': ['z Lucemburska', 'v Lucembursku', 'lucembursk'],
        'Venezuela': ['z Venezuely', 've Venezuele', 'venezuelsk'],
        'Bosna a Hercegovina': ['z Bosny a Hercegoviny', 'v Bosně a Hercegovině', 'bosensk'],
        'Černá Hora': ['z Černé Hory', 'v Černé Hoře', 'černohorsk'],
        'Severní Makedonie': ['ze Severní Makedonie', 'v Severní Makedonii', 'makedonsk', 'severomakedonsk'],
        'Thajsko': ['z Thajska', 'v Thajsku', 'thajsk'],
        'Vietnam': ['z Vietnamu', 've Vietnamu', 'vietnamsk'],
        'Indonésie': ['z Indonésie', 'v Indonésii', 'indonésk'],
        'Pákistán': ['z Pákistánu', 'v Pákistánu', 'pákistánsk'],
        'Maroko': ['z Maroka', 'v Maroku', 'marock'],
        'Alžírsko': ['z Alžírska', 'v Alžírsku', 'alžírsk'],
        'Tunisko': ['z Tuniska', 'v Tunisku', 'tunisk'],
        'Ghana': ['z Ghany', 'v Ghaně', 'ghansk'],
        'Kypr': ['z Kypru', 'na Kypru', 'kypersk'],
        'Libanon': ['z Libanonu', 'v Libanonu', 'libanonsk'],
        'Irák': ['z Iráku', 'v Iráku', 'iráck'],
        'Kostarika': ['z Kostariky', 'v Kostarice', 'kostarick'],
        'Ekvádor': ['z Ekvádoru', 'v Ekvádoru', 'ekvádorsk'],
        'Bolívie': ['z Bolívie', 'v Bolívii', 'bolivijsk'],
        'Paraguay': ['z Paraguaye', 'v Paraguayi', 'paraguaysk'],
        'Mongolsko': ['z Mongolska', 'v Mongolsku', 'mongolsk'],
        'Malajsie': ['z Malajsie', 'v Malajsii', 'malajsijsk'],
        'Moldavsko': ['z Moldavska', 'v Moldavsku', 'moldavsk'],
        'Ázerbájdžán': ['z Ázerbájdžánu', 'v Ázerbájdžánu', 'ázerbájdžánsk'],
        'Uzbekistán': ['z Uzbekistánu', 'v Uzbekistánu', 'uzbeck'],
        'Saúdská Arábie': ['ze Saúdské Arábie', 'v Saúdské Arábii', 'saúdskoarabsk'],
        'Malta': ['z Malty', 'na Maltě', 'maltsk'],
        'Dominikánská republika': ['z Dominikánské republiky', 'v Dominikánské republice', 'dominikánsk'],
        'Nikaragua': ['z Nikaraguy', 'v Nikaragui', 'nikaragujsk'],
        'Zimbabwe': ['ze Zimbabwe', 'v Zimbabwe', 'zimbabwsk'],
        'Nepál': ['z Nepálu', 'v Nepálu', 'nepálsk'],
        'Kambodža': ['z Kambodže', 'v Kambodži', 'kambodžsk'],
        'Jordánsko': ['z Jordánska', 'v Jordánsku', 'jordánsk'],
        'Spojené arabské emiráty': ['ze Spojených arabských emirátů', 've Spojených arabských emirátech', 'emirátsk'],
        'Katar': ['z Kataru', 'v Kataru', 'katarsk'],
        'Tanzanie': ['z Tanzanie', 'v Tanzanii', 'tanzansk'],
        'Madagaskar': ['z Madagaskaru', 'na Madagaskaru', 'madagaskarsk'],
        'Myanmar': ['z Myanmaru', 'v Myanmaru', 'myanmarsk'],
        'Afghánistán': ['z Afghánistánu', 'v Afghánistánu', 'afghánsk'],
        'Severní Korea': ['ze Severní Koreje', 'v Severní Koreji', 'severokorejsk'],
        'Libye': ['z Libye', 'v Libyi', 'libyjsk'],
        'Súdán': ['ze Súdánu', 'v Súdánu', 'súdánsk'],
        'Bangladéš': ['z Bangladéše', 'v Bangladéši', 'bangladéšsk'],
        'Srí Lanka': ['ze Srí Lanky', 'na Srí Lance', 'srílanck'],
        'Guatemala': ['z Guatemaly', 'v Guatemale', 'guatemalsk'],
        'Panama': ['z Panamy', 'v Panamě', 'panamsk'],
        'Tádžikistán': ['z Tádžikistánu', 'v Tádžikistánu', 'tádžick'],
        'Kyrgyzstán': ['z Kyrgyzstánu', 'v Kyrgyzstánu', 'kyrgyzsk'],
        'Turkmenistán': ['z Turkmenistánu', 'v Turkmenistánu', 'turkmensk'],
        'Mosambik': ['z Mosambiku', 'v Mosambiku', 'mosambick'],
        'Angola': ['z Angoly', 'v Angole', 'angolsk'],
        'Namibie': ['z Namibie', 'v Namibii', 'namibijsk'],
        'Uganda': ['z Ugandy', 'v Ugandě', 'ugandsk'],
        'Zambie': ['ze Zambie', 'v Zambii', 'zambijsk'],
        'Botswana': ['z Botswany', 'v Botswaně', 'botswansk'],
        'Jemen': ['z Jemenu', 'v Jemenu', 'jemensk'],
        'Omán': ['z Ománu', 'v Ománu', 'ománsk']
    };
    // „z Francie“ (odkud kdo pochází), „ve Francii“ (kde co leží) a „Francie“ v 2. pádě („hlavním městem Francie“); prázdné = tvar neznáme
    const fromCountry = (name) => (COUNTRY_WORDS[name] ? COUNTRY_WORDS[name][0] : '');
    const inCountry = (name) => (COUNTRY_WORDS[name] ? COUNTRY_WORDS[name][1] : `ve státě ${name}`);
    const ofCountry = (name) => (COUNTRY_WORDS[name] ? COUNTRY_WORDS[name][0].replace(/^ze? /, '') : `státu ${name}`);
    // Kmeny přídavných jmen národností, které text zmiňuje (jen na začátku slova: „běloruský“ není „ruský“); jeden výraz pro všechny
    const STEM_COUNTRY = new Map(Object.entries(COUNTRY_WORDS).flatMap(([country, words]) => words.slice(2).map(stem => [stem, country])));
    const NATIONALITY = new RegExp(`(?:^|[^\\p{L}])(${[...STEM_COUNTRY.keys()].sort((a, b) => b.length - a.length).join('|')})\\p{L}`, 'gu');
    const nationalityCache = new Map();
    const nationalitiesIn = (text) => {
        const key = String(text || '');
        if (nationalityCache.has(key)) return nationalityCache.get(key);
        const found = [...new Set([...key.toLocaleLowerCase('cs').matchAll(NATIONALITY)].map(match => STEM_COUNTRY.get(match[1])))];
        nationalityCache.set(key, found);
        return found;
    };

    // Státy, na které se v řetězu neptáme: sporné a trpasličí (Vatikán = město = stát)
    const SKIP_COUNTRIES = new Set(['Vatikán', 'Monako', 'San Marino', 'Lichtenštejnsko', 'Andorra', 'Stát Palestina', 'Kosovo', 'Tchaj-wan', 'Singapur']);
    // Státy, kde „hlavní město“ není jednoznačné (víc hlavních měst, sídlo vlády jinde, nedávné přesunutí)
    const UNCLEAR_CAPITAL = new Set(['Jihoafrická republika', 'Bolívie', 'Izrael', 'Srí Lanka', 'Pobřeží slonoviny', 'Benin', 'Tanzanie', 'Burundi', 'Malajsie', 'Nizozemsko', 'Svazijsko', 'Rovníková Guinea']);

    // --- Druhy uzlů a slova k nim ---
    // Osobnosti podle kategorie: druh uzlu, 2. pád množného čísla pro „Kdo z těchto … pochází z …?“
    const PEOPLE = [
        { topic: 'hudba', c: 'skladatele', kind: 'composer', many: 'skladatelů' },
        { topic: 'hudba', c: 'hudebnici', kind: 'musician', many: 'hudebníků' },
        { topic: 'literatura', c: 'spisovatele', kind: 'writer', many: 'spisovatelů' },
        { topic: 'umeni', c: 'umelci', kind: 'artist', many: 'výtvarných umělců' },
        { topic: 'architektura', c: 'architekti', kind: 'architect', many: 'architektů' },
        { topic: 'film', c: 'reziseri', kind: 'director', many: 'režisérů' },
        { topic: 'sport', c: 'sportovci', kind: 'athlete', many: 'sportovců' }
    ];
    const PERSON_KINDS = new Set([...PEOPLE.map(entry => entry.kind)]);
    const MANY = Object.fromEntries(PEOPLE.map(entry => [entry.kind, entry.many]));
    // Druh uzlu → téma (ikona na kartě) a krátký popisek
    const KIND_LABEL = {
        country: 'stát', city: 'město', landmark: 'stavba', peak: 'hora', range: 'pohoří', river: 'řeka', lake: 'jezero', island: 'ostrov',
        composer: 'skladatel', musician: 'hudebník', writer: 'spisovatel', artist: 'výtvarník', architect: 'architekt', director: 'režisér', athlete: 'sportovec',
        band: 'kapela', music: 'hudební dílo', book: 'literární dílo', artwork: 'výtvarné dílo', film: 'film', club: 'klub', games: 'olympiáda', character: 'literární postava'
    };
    // Hudební díla: 4. pád druhu („Kdo složil operu …?“) a skupina (vážná hudba / píseň / album)
    const MUSIC_TYPES = {
        opera: ['operu', 'classic'], 'muzikál': ['muzikál', 'classic'], opereta: ['operetu', 'classic'], balet: ['balet', 'classic'], skladba: ['skladbu', 'classic'],
        symfonie: ['symfonii', 'classic'], koncert: ['koncert', 'classic'], oratorium: ['oratorium', 'classic'], 'píseň': ['píseň', 'song'], album: ['album', 'album']
    };
    // Literární díla: 4. pád druhu („Kdo napsal román …?“)
    const BOOK_TYPES = {
        'román': 'román', 'divadelní hra': 'divadelní hru', novela: 'novelu', 'báseň': 'báseň', 'tragédie': 'tragédii', 'povídka': 'povídku', 'pohádka': 'pohádku',
        'básnická sbírka': 'básnickou sbírku', epos: 'epos', 'sbírka povídek': 'sbírku povídek', 'kniha pro děti': 'knihu pro děti', komedie: 'komedii'
    };
    // Výtvarná díla: 1. a 4. pád druhu, sloveso autora a skupina (malba / socha)
    const ART_TYPES = {
        obraz: ['obraz', 'obraz', 'paint'], freska: ['freska', 'fresku', 'paint'], 'oltářní obraz': ['oltářní obraz', 'oltářní obraz', 'paint'], triptych: ['triptych', 'triptych', 'paint'],
        'nástěnná malba': ['nástěnná malba', 'nástěnnou malbu', 'paint'], socha: ['socha', 'sochu', 'sculpt'], plastika: ['plastika', 'plastiku', 'sculpt'], 'sousoší': ['sousoší', 'sousoší', 'sculpt'],
        'jezdecká socha': ['jezdecká socha', 'jezdeckou sochu', 'sculpt'], 'soška': ['soška', 'sošku', 'sculpt'], busta: ['busta', 'bustu', 'sculpt']
    };
    // Muzea a galerie se sbírkou slavných děl: název v datech → „v …“ (6. pád, ručně)
    const MUSEUMS = {
        'Louvre': 'v Louvru', 'Muzeum Orsay': 'v Muzeu Orsay', 'Museo del Prado': 'v muzeu Prado', 'Galleria degli Uffizi': 'v galerii Uffizi',
        'Vatikánská muzea': 've Vatikánských muzeích', 'Ermitáž': 'v Ermitáži', 'Treťjakovská galerie': 'v Treťjakovské galerii', 'Van Goghovo muzeum': 've Van Goghově muzeu',
        'Metropolitní muzeum umění': 'v Metropolitním muzeu umění', 'Muzeum moderního umění': 'v Muzeu moderního umění', 'Muzeum královny Sofie': 'v Muzeu královny Sofie',
        'Uměleckohistorické muzeum': 'v Uměleckohistorickém muzeu', 'Státní ruské muzeum': 've Státním ruském muzeu', 'Galerie Borghese': 'v Galerii Borghese',
        'Kapitolská muzea': 'v Kapitolských muzeích', 'Stará národní galerie': 've Staré národní galerii', 'Bodeho muzeum': 'v Bodeho muzeu', 'Britské muzeum': 'v Britském muzeu',
        "Gallerie dell'Accademia": "v Gallerii dell'Accademia", 'Albertina': 'v Albertině', 'Puškinovo muzeum': 'v Puškinově muzeu', 'Rijksmuseum': 'v Rijksmuseu',
        'Národní galerie': 'v Národní galerii', 'Mauritshuis': 'v Mauritshuisu', 'Belvedere': 'v Belvederu'
    };
    // Sbírka díla v datech (umeni f.coll) → název muzea mezi stavbami
    const COLLECTION_ALIASES = { 'Prado': 'Museo del Prado', 'Galerie Uffizi': 'Galleria degli Uffizi', 'Musée d’Orsay': 'Muzeum Orsay', 'Ruské muzeum v Petrohradu': 'Státní ruské muzeum',
        'Metropolitní muzeum v New Yorku': 'Metropolitní muzeum umění', 'MoMA v New Yorku': 'Muzeum moderního umění', 'Uměleckohistorické muzeum ve Vídni': 'Uměleckohistorické muzeum', 'Belvedere ve Vídni': 'Belvedere' };
    // Druhy staveb: co se dá postavit („stojí“), ne archeologická naleziště, náměstí, průplavy a posvátná místa
    const SKIP_LANDMARK_TYPES = new Set(['starověké město', 'archeologická lokalita', 'náměstí', 'posvátné místo', 'průplav', 'kromlech', 'ulice', 'park', 'zahrada', 'přírodní památka']);
    // Místa, která do hry o stavbách nepatří (koncentrační tábory, věznice) a stavby, které už nestojí (Bastila, divy světa)
    const SKIP_LANDMARK_NAMES = /tábor|věznic|ghett|obětem|obětí|^(?:Bastila|Herculaneum|Kolos rhodský|Maják na Faru|Alexandrijský maják|Visuté zahrady Semiramidiny|Mauzoleum v Halikarnassu|Artemidin chrám v Efesu|Diova socha v Olympii|Světové obchodní centrum)$/i;
    // Města, u kterých „ve státě“ není samozřejmé (zámořská území, zvláštní správní oblasti)
    const SKIP_CITIES = new Set(['Gibraltar', 'Hongkong', 'Macao', 'Nuuk']);
    // Ostrovy, které nejsou jednoznačně „ve státě“ (nezačleněná území) nebo ho prozradí
    const SKIP_PLACES = new Set(['Guam', 'Portoriko', 'Velká Británie', 'Americká Samoa', 'Severní Mariany']);
    // Původní názvy měst v názvech klubů a staveb (FC Bayern München, Paris Saint-Germain): prozradí město stejně jako český název
    const EXONYMS = {
        'Paříž': ['Paris'], 'Mnichov': ['München', 'Munich'], 'Řím': ['Roma', 'Rome'], 'Milán': ['Milano', 'Milan'], 'Vídeň': ['Wien', 'Vienna'], 'Neapol': ['Napoli', 'Naples'],
        'Turín': ['Torino', 'Turin'], 'Benátky': ['Venezia', 'Venice'], 'Florencie': ['Firenze', 'Florence'], 'Janov': ['Genova', 'Genoa'], 'Lisabon': ['Lisboa', 'Lisbon'],
        'Kodaň': ['København', 'Copenhagen'], 'Moskva': ['Moscow', 'Moskau'], 'Petrohrad': ['Petěrburg', 'Petersburg', 'Peterburg'], 'Kolín nad Rýnem': ['Köln', 'Cologne'],
        'Drážďany': ['Dresden'], 'Lipsko': ['Leipzig'], 'Hamburk': ['Hamburg'], 'Brusel': ['Bruxelles', 'Brussel', 'Brussels'], 'Londýn': ['London'], 'Varšava': ['Warszawa', 'Warsaw'],
        'Krakov': ['Kraków', 'Krakow'], 'Bělehrad': ['Beograd', 'Belgrade'], 'Záhřeb': ['Zagreb'], 'Athény': ['Athens', 'Athína'], 'Soluň': ['Thessaloniki'], 'Norimberk': ['Nürnberg'],
        'Štrasburk': ['Strasbourg'], 'Ženeva': ['Genève', 'Geneva'], 'Curych': ['Zürich', 'Zurich'], 'Basilej': ['Basel'], 'Kyjev': ['Kyiv', 'Kiev'], 'Bukurešť': ['București', 'Bucharest'],
        'Budapešť': ['Budapest'], 'Praha': ['Prague', 'Prag'], 'Brno': ['Brünn'], 'Sevilla': ['Seville'], 'Benátky nad Jizerou': [], 'Antverpy': ['Antwerpen', 'Antwerp'],
        'Haag': ["Den Haag", 'Hague'], 'Mohuč': ['Mainz'], 'Cáchy': ['Aachen'], 'Řezno': ['Regensburg'], 'Istanbul': ['İstanbul', 'Constantinople'], 'Peking': ['Beijing'],
        'Soul': ['Seoul'], 'Tokio': ['Tokyo'], 'Ciudad de México': ['Mexico City'], 'Washington, D.C.': ['Washington']
    };
    const cityForms = (name) => [name, ...(EXONYMS[name] || [])];
    // Druh stavby jako slovo před názvem, když ho název nemá („zámek Neuschwanstein“, ne „rozhledna Eiffelova věž“)
    const LANDMARK_PREFIX = new Set(['hrad', 'zámek', 'palác', 'muzeum', 'mrakodrap', 'stadion', 'klášter', 'mešita', 'synagoga', 'vila']);
    // Hory: vrchol nebo pohoří
    const PEAK_TYPES = { hora: 'hora', kopec: 'hora', sopka: 'sopka', 'stratovulkán': 'sopka' };
    // Moře, zálivy a průlivy omývají víc států
    const SEA_TYPES = new Set(['oceán', 'moře', 'průliv', 'zátoka', 'záliv', 'laguna']);

    const normCache = new Map();
    const norm = (text) => {
        const key = String(text ?? '');
        if (!normCache.has(key)) normCache.set(key, core.normalizeAnswer(key));
        return normCache.get(key);
    };
    const hasBrackets = (text) => /[()]/.test(String(text || ''));
    // Název prozradí jiné jméno (Šikmá věž v Pise → Pisa, Pražský hrad → Praha, FC Barcelona → Barcelona)
    // (výsledky se pamatují: graf se staví z tisíců položek a zakrývání jmen je pomalé)
    const revealCache = new Map();
    const cached = (key, compute) => {
        if (!revealCache.has(key)) revealCache.set(key, compute());
        return revealCache.get(key);
    };
    // Rychlé předběžné síto: jméno se v textu může skrývat, jen když text obsahuje začátek některého jeho slova (bez diakritiky, i uvnitř
    // složeného slova); jinak se pomalé zakrývání vůbec nevolá
    const UMLAUT_FORMS = { 'ö': 'oe', 'ü': 'ue', 'ä': 'ae' };
    const mightReveal = (text, name) => {
        const folded = norm(text);
        return norm(name).split(' ').concat(String(name).toLowerCase().replace(/[öüä]/g, ch => UMLAUT_FORMS[ch]).split(/\s+/).map(norm))
            .filter(word => word.length >= 3).some(word => folded.includes(word.slice(0, 3)));
    };
    const reveals = (text, name) => Boolean(text && name) && cached(`n\u0001${text}\u0001${name}`, () => mightReveal(text, name) && core.censorName(String(text), String(name)).includes('[***]'));
    // Název prozradí město, i původním názvem (FC Bayern München → Mnichov)
    const revealsCity = (text, city) => cityForms(city).some(form => reveals(text, form));
    // Název prozradí stát: jméno státu nebo národnost („Velká čínská zeď“)
    const revealsCountry = (text, country) => Boolean(text && country) && (reveals(text, country) || nationalitiesIn(text).includes(country));

    // --- Graf ---
    // sources = { zemepis: items, architektura: items, … } (data/<téma>.json), countries = data/countries.json .countries
    // Uzel: { id, kind, name, topic, q, fame (0 = nejznámější v kategorii, 1 = nejméně), sex ('f'), role, desc, continent, country, countries,
    // city, author, museum, hosts, group (druh díla), typeWord … }; hrany: rel → Map(od → [k]); příchozí: k → [{ rel, from }]
    const buildGraph = (sources, countries = {}) => {
        const nodes = new Map();
        const byKind = new Map();
        const add = (node) => {
            if (!node || !node.name || nodes.has(node.id)) return null;
            nodes.set(node.id, node);
            if (!byKind.has(node.kind)) byKind.set(node.kind, []);
            byKind.get(node.kind).push(node);
            return node;
        };
        // Položka přesunutá později do jiné kategorie se počítá v původní (c0: stavby Architektury, od 22. 11. 2026 v kategoriích
        // hrady, mosty a mrakodrapy) – řetěz starého dne tak vyjde stejně jako dřív
        const original = (item) => (item && item.c0 ? { ...item, c: item.c0 } : item);
        const itemsOf = (topic) => (sources && Array.isArray(sources[topic]) ? sources[topic].map(original) : []);
        // Známost: pořadí mezi známými položkami kategorie (data jsou v kategorii seřazená podle známosti)
        const fameOf = new Map();
        for (const topic of SOURCES) {
            const counts = new Map();
            const known = itemsOf(topic).filter(item => item && item.k === 1);
            known.forEach(item => counts.set(item.c, (counts.get(item.c) || 0) + 1));
            const seen = new Map();
            known.forEach(item => {
                const index = seen.get(item.c) || 0;
                seen.set(item.c, index + 1);
                fameOf.set(`${topic}:${item.q}`, index / Math.max(1, counts.get(item.c)));
            });
        }
        const fame = (topic, item) => (fameOf.has(`${topic}:${item.q}`) ? fameOf.get(`${topic}:${item.q}`) : 1);
        const known = (topic, c) => itemsOf(topic).filter(item => item && item.k === 1 && item.c === c && item.n && !item.nq);
        const continentOf = (countryQ) => (countries[countryQ] && countries[countryQ].continent) || '';

        // Státy
        const countryByQ = new Map();
        const countryByName = new Map();
        for (const item of known('zemepis', 'stat')) {
            if (SKIP_COUNTRIES.has(item.n)) continue;
            const node = add({ id: `country:${item.q}`, kind: 'country', name: item.n, topic: 'zemepis', q: item.q, fame: fame('zemepis', item), continent: continentOf(item.q), capital: (item.f || {}).cap || '' });
            if (node) { countryByQ.set(item.q, node); countryByName.set(item.n, node); }
        }
        countryByName.set('USA', countryByName.get('Spojené státy americké'));
        const countryOfName = (name) => (typeof name === 'string' ? countryByName.get(name.trim()) || null : null);
        // Města (jen v jednom státě)
        const cityByKey = new Map();
        const cityNames = new Map();
        for (const item of known('zemepis', 'mesto')) {
            const country = (item.co || []).length === 1 ? countryByQ.get(item.co[0]) : null;
            if (!country || hasBrackets(item.n) || SKIP_CITIES.has(item.n)) continue;
            const node = add({ id: `city:${item.q}`, kind: 'city', name: item.n, topic: 'zemepis', q: item.q, fame: fame('zemepis', item), country: country.id, continent: country.continent,
                pop: (item.f || {}).pop || 0, capital: country.capital === item.n && !UNCLEAR_CAPITAL.has(country.name) });
            if (node) { cityByKey.set(`${item.n}|${item.co[0]}`, node); cityNames.set(norm(item.n), (cityNames.get(norm(item.n)) || 0) + 1); }
        }
        const cityIn = (name, countryQ) => (name && countryQ ? cityByKey.get(`${name}|${countryQ}`) || null : null);
        // Stavby (Zeměpis a Architektura; Architektura zná město a architekta)
        const landmarkItems = new Map();
        for (const item of known('zemepis', 'stavba')) landmarkItems.set(item.q, { z: item });
        for (const item of known('architektura', 'stavby')) landmarkItems.set(item.q, { ...(landmarkItems.get(item.q) || {}), a: item });
        const landmarkByName = new Map();
        for (const [q, { z, a }] of landmarkItems) {
            const item = a || z;
            const type = (a && a.ty) || (z && z.ty) || '';
            // Bez upřesnění v závorce („Pantheon (Paříž)“ → Pantheon); stejně pojmenované stavby se pak níž vyřadí úplně
            const name = String(item.n).replace(/\s*\([^)]*\)/g, '').trim();
            if (SKIP_LANDMARK_TYPES.has(type) || SKIP_LANDMARK_NAMES.test(name) || hasBrackets(name) || (!a && !type)) continue;
            const co = [...new Set([...((a && a.co) || []), ...((z && z.co) || [])])];
            const country = co.length === 1 ? countryByQ.get(co[0]) : null;
            if (!country) continue;
            const city = a && a.f ? cityIn(a.f.city, co[0]) : null;
            const fameValue = Math.min(a ? fame('architektura', a) : 1, z ? fame('zemepis', z) : 1);
            const node = add({ id: `landmark:${q}`, kind: 'landmark', name, topic: a ? 'architektura' : 'zemepis', q, fame: fameValue, country: country.id, continent: country.continent,
                city: city ? city.id : null, cityName: a && a.f ? a.f.city || '' : '', typeWord: type, architect: a && a.f ? a.f.aq || null : null, archText: a && a.f ? a.f.arch || '' : '',
                year: (a && a.f && a.f.y) || 0 });
            if (node) landmarkByName.set(norm(name), [...(landmarkByName.get(norm(name)) || []), node]);
        }
        // Hory, řeky, jezera a ostrovy v jednom státě
        for (const item of ['hora', 'reka', 'jezero', 'ostrov'].flatMap(c => known('zemepis', c))) {
            const country = (item.co || []).length === 1 ? countryByQ.get(item.co[0]) : null;
            if (!country || hasBrackets(item.n) || SEA_TYPES.has(item.ty)) continue;
            let kind = null;
            if (item.c === 'hora') kind = PEAK_TYPES[item.ty] ? 'peak' : item.ty === 'pohoří' ? 'range' : null;
            else if (item.c === 'reka' && item.ty === 'řeka') kind = 'river';
            else if (item.c === 'jezero' && item.ty === 'jezero') kind = 'lake';
            else if (item.c === 'ostrov' && item.ty === 'ostrov') kind = 'island';
            if (!kind) continue;
            // Ostrov, který je celým státem (Island, Malta) nebo ho prozradí název, nemá smysl
            if (SKIP_PLACES.has(item.n) || reveals(item.n, country.name) || reveals(country.name, item.n)) continue;
            add({ id: `${kind}:${item.q}`, kind, name: item.n, topic: 'zemepis', q: item.q, fame: fame('zemepis', item), country: country.id, continent: country.continent,
                typeWord: kind === 'peak' ? PEAK_TYPES[item.ty] : kind === 'range' ? 'pohoří' : kind === 'river' ? 'řeka' : kind === 'lake' ? 'jezero' : 'ostrov' });
        }
        // Osobnosti (země původu podle dat; popis nesmí zmiňovat jinou národnost)
        const personByQ = new Map();
        for (const { topic, c, kind } of PEOPLE) {
            for (const item of known(topic, c)) {
                const f = item.f || {};
                const country = countryOfName(f.land);
                const mentioned = nationalitiesIn(item.d);
                // Popis s jinou národností, než má země původu, je sporný („rakouský skladatel“ se zemí Česko): bez země
                const clear = country && (mentioned.length === 0 || mentioned.includes(country.name));
                const node = add({ id: `${kind}:${item.q}`, kind, name: item.n, topic, q: item.q, fame: fame(topic, item), sex: item.sx === 'f' ? 'f' : '',
                    role: /^[\p{Ll} ]+$/u.test(item.ty || '') ? item.ty : KIND_LABEL[kind], desc: item.d || '', country: clear ? country.id : null,
                    continent: clear ? country.continent : '', nations: mentioned, born: f.born || 0, year: f.y || f.born || 0,
                    bands: kind === 'musician' && f.band ? String(f.band).split(/,\s*/).filter(Boolean) : [] });
                if (node) personByQ.set(`${topic}:${item.q}`, node);
            }
        }
        // Kapely: země a město vzniku
        for (const item of known('hudba', 'kapely')) {
            const f = item.f || {};
            const country = countryOfName(f.land);
            const mentioned = nationalitiesIn(item.d);
            const clear = country && (mentioned.length === 0 || mentioned.includes(country.name));
            const city = clear ? cityIn(f.city, country.q) : null;
            const node = add({ id: `band:${item.q}`, kind: 'band', name: item.n, topic: 'hudba', q: item.q, fame: fame('hudba', item), country: clear ? country.id : null,
                continent: clear ? country.continent : '', nations: mentioned, city: city && !revealsCity(item.n, city.name) ? city.id : null, year: f.from || f.y || 0, role: 'kapela', sex: 'f',
                members: String(f.members || '').split(/,\s*/).filter(Boolean) });
            if (node) personByQ.set(`hudba:${item.q}`, node);
        }
        // Díla s autorem (autor musí být uzel; název díla nesmí autora prozradit)
        const authorNode = (topic, q) => (q ? personByQ.get(`${topic}:${q}`) || null : null);
        const surname = (name) => String(name || '').split(/\s+/).filter(word => /^\p{Lu}/u.test(word)).pop() || '';
        const authorFine = (title, author) => author && !reveals(title, author.name) && !reveals(title, surname(author.name));
        for (const item of [...known('hudba', 'dila'), ...known('hudba', 'opery')]) {
            const f = item.f || {};
            const type = MUSIC_TYPES[item.ty];
            const author = authorNode('hudba', f.byq);
            if (!type || !authorFine(item.n, author) || hasBrackets(item.n)) continue;
            add({ id: `music:${item.q}`, kind: 'music', name: item.n, topic: 'hudba', q: item.q, fame: fame('hudba', item), author: author.id, typeWord: item.ty, acc: type[0], group: type[1], year: f.year || f.y || 0 });
        }
        for (const item of known('literatura', 'dila')) {
            const f = item.f || {};
            const author = authorNode('literatura', f.byq);
            if (!BOOK_TYPES[item.ty] || !authorFine(item.n, author) || hasBrackets(item.n)) continue;
            add({ id: `book:${item.q}`, kind: 'book', name: item.n, topic: 'literatura', q: item.q, fame: fame('literatura', item), author: author.id, typeWord: item.ty, acc: BOOK_TYPES[item.ty], year: f.year || f.y || 0 });
        }
        for (const item of known('literatura', 'postavy')) {
            const f = item.f || {};
            const author = authorNode('literatura', f.byq);
            if (!authorFine(item.n, author) || hasBrackets(item.n)) continue;
            // Dílo, ve kterém postava vystupuje (stejný autor; dílo se jménem postavy by odpověď prozradilo)
            const book = (byKind.get('book') || []).find(entry => entry.author === author.id && entry.name === f.work && !reveals(entry.name, item.n) && !reveals(item.n, entry.name));
            add({ id: `character:${item.q}`, kind: 'character', name: item.n, topic: 'literatura', q: item.q, fame: fame('literatura', item), author: author.id, book: book ? book.id : null, year: f.y || 0 });
        }
        // Muzea: stavby, jejichž název je v tabulce MUSEUMS
        const museumByName = new Map();
        for (const name of Object.keys(MUSEUMS)) {
            const found = (landmarkByName.get(norm(name)) || []);
            if (found.length === 1) { found[0].museum = true; museumByName.set(name, found[0]); }
        }
        for (const item of [...known('umeni', 'obrazy'), ...known('umeni', 'sochy')]) {
            const f = item.f || {};
            const type = ART_TYPES[item.ty];
            const author = authorNode('umeni', f.bq);
            if (!type || hasBrackets(item.n)) continue;
            const museum = museumByName.get(COLLECTION_ALIASES[f.coll] || f.coll) || null;
            const authorOk = authorFine(item.n, author);
            if (!authorOk && !museum) continue;
            add({ id: `artwork:${item.q}`, kind: 'artwork', name: item.n, topic: 'umeni', q: item.q, fame: fame('umeni', item), author: authorOk ? author.id : null,
                museum: museum ? museum.id : null, typeWord: type[0], acc: type[1], group: type[2], year: f.year || f.y || 0 });
        }
        for (const item of [...known('film', 'filmy'), ...known('film', 'animovane')]) {
            const f = item.f || {};
            const director = authorNode('film', typeof f.dirq === 'string' ? f.dirq : null);
            if (!authorFine(item.n, director) || hasBrackets(item.n) || (Array.isArray(f.dir) && f.dir.length !== 1)) continue;
            add({ id: `film:${item.q}`, kind: 'film', name: item.n, topic: 'film', q: item.q, fame: fame('film', item), author: director.id, animated: item.c === 'animovane', year: f.year || f.y || 0 });
        }
        // Kluby (město sídla; název nesmí město prozradit) a olympijské hry (pořadatelské město)
        for (const item of known('sport', 'kluby')) {
            const f = item.f || {};
            const country = countryOfName(f.land);
            const city = country ? cityIn(f.city, country.q) : null;
            if (!city || revealsCity(item.n, city.name) || hasBrackets(item.n)) continue;
            if (revealsCountry(item.n, country.name)) continue;
            add({ id: `club:${item.q}`, kind: 'club', name: item.n, topic: 'sport', q: item.q, fame: fame('sport', item), city: city.id, country: country.id, continent: country.continent, typeWord: item.ty || '' });
        }
        for (const item of itemsOf('sport').filter(item => item && item.c === 'olympiady' && item.n)) {
            const f = item.f || {};
            const hosts = (f.hosts || []).map(q => nodes.get(`city:${q}`)).filter(Boolean);
            if (hosts.length !== 1 || (f.hosts || []).length !== 1) continue;
            const host = hosts[0];
            add({ id: `games:${item.q}`, kind: 'games', name: item.n, topic: 'sport', q: item.q, fame: item.k === 1 ? fame('sport', item) : 0.9, city: host.id, country: host.country,
                continent: host.continent, year: f.year || 0, winter: f.type === 'Z' });
        }

        // --- Hrany ---
        const edges = new Map(RELATIONS.map(rel => [rel.id, new Map()]));
        const incoming = new Map();
        const link = (rel, from, to) => {
            if (!from || !to || from.id === to.id || from.shared || to.shared) return;
            const map = edges.get(rel);
            if (!map.has(from.id)) map.set(from.id, []);
            if (!map.get(from.id).includes(to.id)) map.get(from.id).push(to.id);
            if (!incoming.has(to.id)) incoming.set(to.id, []);
            incoming.get(to.id).push({ rel, from: from.id });
        };
        const node = (id) => (id ? nodes.get(id) || null : null);
        // Stejně pojmenované uzly téhož druhu (Birmingham v Anglii i v USA, Pantheon v Římě i v Paříži): otázka by nebyla jednoznačná,
        // takže nejsou v řetězu ani mezi možnostmi
        const sameName = new Map();
        for (const entry of nodes.values()) { const key = `${entry.kind}|${norm(entry.name)}`; sameName.set(key, (sameName.get(key) || 0) + 1); }
        for (const entry of nodes.values()) if (sameName.get(`${entry.kind}|${norm(entry.name)}`) > 1) entry.shared = true;
        for (const city of byKind.get('city') || []) {
            const country = node(city.country);
            if (!country || city.shared || reveals(city.name, country.name) || reveals(country.name, city.name)) continue;
            if (city.capital) { link('capital', country, city); link('capitalOf', city, country); }
            else { link('cityCountry', city, country); link('countryCity', country, city); }
        }
        for (const landmark of byKind.get('landmark') || []) {
            if (landmark.shared) continue;
            const country = node(landmark.country);
            const city = node(landmark.city);
            if (country && !revealsCountry(landmark.name, country.name) && !(city && revealsCity(landmark.name, city.name))) { link('landmarkCountry', landmark, country); link('countryLandmark', country, landmark); }
            if (city && !revealsCity(landmark.name, city.name) && !reveals(landmark.name, landmark.cityName)) { link('landmarkCity', landmark, city); link('cityLandmark', city, landmark); }
            const architect = landmark.architect ? personByQ.get(`architektura:${landmark.architect}`) : null;
            if (architect && architect.kind === 'architect' && !String(landmark.archText).includes(',') && !reveals(landmark.name, surname(architect.name))) {
                link('landmarkArchitect', landmark, architect); link('architectLandmark', architect, landmark);
            }
        }
        for (const kind of ['peak', 'range', 'river', 'lake', 'island']) {
            for (const place of byKind.get(kind) || []) { const country = node(place.country); link('natureCountry', place, country); link('countryNature', country, place); }
        }
        for (const kind of [...PERSON_KINDS, 'band']) {
            for (const person of byKind.get(kind) || []) {
                const country = node(person.country);
                if (!country || reveals(person.name, country.name)) continue;
                link('personCountry', person, country);
                if (fromCountry(country.name)) link('countryPerson', country, person);
            }
        }
        for (const band of byKind.get('band') || []) if (band.city) { link('bandCity', band, node(band.city)); link('cityBand', node(band.city), band); }
        for (const kind of ['music', 'book', 'artwork', 'film', 'character']) {
            for (const work of byKind.get(kind) || []) {
                const author = node(work.author);
                if (author) { link('workAuthor', work, author); link('authorWork', author, work); }
                if (work.museum) { link('artMuseum', work, node(work.museum)); link('museumArt', node(work.museum), work); }
            }
        }
        for (const club of byKind.get('club') || []) {
            link('clubCity', club, node(club.city)); link('cityClub', node(club.city), club);
            link('clubCountry', club, node(club.country)); link('countryClub', node(club.country), club);
        }
        for (const games of byKind.get('games') || []) {
            link('gamesCity', games, node(games.city)); link('cityGames', node(games.city), games);
            if (!revealsCountry(games.name, (node(games.country) || {}).name)) { link('gamesCountry', games, node(games.country)); link('countryGames', node(games.country), games); }
        }
        // Členové kapel (hudebník u kapely v datech nebo kapela u hudebníka)
        for (const band of byKind.get('band') || []) {
            for (const musician of byKind.get('musician') || []) {
                if (!band.members.includes(musician.name) && !musician.bands.includes(band.name)) continue;
                if (reveals(band.name, musician.name) || reveals(musician.name, band.name)) continue;
                link('memberBand', musician, band); link('bandMember', band, musician);
            }
        }
        for (const character of byKind.get('character') || []) if (character.book) { link('characterBook', character, node(character.book)); link('bookCharacter', node(character.book), character); }
        // Kdo má dílo se stejným názvem (Requiem, Carmen): u otázky na autora ho nejde nabídnout jako nesprávnou možnost
        const titlesBy = new Map();
        for (const kind of ['music', 'book', 'artwork', 'film', 'character']) {
            for (const work of byKind.get(kind) || []) {
                const key = norm(work.name);
                if (!titlesBy.has(key)) titlesBy.set(key, new Set());
                if (work.author) titlesBy.get(key).add(work.author);
            }
        }
        const edgeSets = new Map([...edges].map(([rel, map]) => [rel, new Map([...map].map(([from, list]) => [from, new Set(list)]))]));
        return { nodes, byKind, edges, edgeSets, incoming, titlesBy, landmarkByName, cityNames, pools: new Map() };
    };

    // --- Vazby: otázka, kdo smí být nesprávnou možností a které možnosti jsou si podobné ---
    const she = (node) => (node && node.sex === 'f' ? 'a' : '');
    // Stavba jako podmět otázky: „zámek Neuschwanstein“, „Eiffelova věž“
    // Slova, která už sama říkají, o jakou stavbu jde („Buckinghamský palác“ není „zámek Buckinghamský palác“)
    const BUILDING_WORDS = /(?:^| )(?:estadi|pala[cz]|palais|palazzo|palace|pal[aá]c|hrad|z[aá]m[e]?k|schloss|castle|ch[aâ]teau|castel|katedr|kostel|chr[aá]m|bazilik|me[sš]it|klášter|kl[aá][sš]ter|synagog|v[eě][zž]|tower|most|bridge|muze|museum|galeri|gallery|divadl|opera|theat|stadi|arena|aren|budov|building|d[uů]m|house|hall|vila|villa|kaple|brana|gate|centr|center|centre|tor|pevnost|fort|citadel|kreml|akropol|chateau|alc[aá]zar)/;
    const landmarkSubject = (node) => {
        const type = node.typeWord || '';
        return LANDMARK_PREFIX.has(type) && !BUILDING_WORDS.test(norm(node.name)) ? `${type} ${node.name}` : node.name;
    };
    const artNominative = (node) => (ART_TYPES[node.typeWord] ? ART_TYPES[node.typeWord][0] : 'dílo');
    const workQuestion = (work, graph) => {
        const author = graph.nodes.get(work.author);
        if (work.kind === 'music') {
            if (work.group === 'song') return `Kdo nahrál píseň ${work.name}?`;
            if (work.group === 'album') return `Kdo vydal album ${work.name}?`;
            return `Kdo složil ${work.acc} ${work.name}?`;
        }
        if (work.kind === 'book') return `Kdo napsal ${work.acc} ${work.name}?`;
        if (work.kind === 'artwork') return work.group === 'sculpt' ? `Kdo vytvořil ${work.acc} ${work.name}?` : `Kdo namaloval ${work.acc} ${work.name}?`;
        if (work.kind === 'film') return `Kdo režíroval ${work.animated ? 'animovaný film' : 'film'} ${work.name}?`;
        if (work.kind === 'character') return `Kdo vymyslel postavu ${work.name}?`;
        return author ? `Kdo je autorem díla ${work.name}?` : '';
    };
    // Otázka „autor → dílo“ podle druhu odpovědi (druh nesprávných možností je stejný)
    const authorQuestion = (author, work) => {
        const a = she(author);
        if (work.kind === 'music') {
            if (author.kind === 'band') return work.group === 'song' ? `Kterou z těchto písní nahrála kapela ${author.name}?` : work.group === 'album' ? `Které z těchto alb vydala kapela ${author.name}?` : `Které z těchto děl nahrála kapela ${author.name}?`;
            if (work.group === 'song') return `Kterou z těchto písní nahrál${a} ${author.name}?`;
            if (work.group === 'album') return `Které z těchto alb vydal${a} ${author.name}?`;
            return `Které z těchto děl složil${a} ${author.name}?`;
        }
        if (work.kind === 'book') return `Které z těchto děl napsal${a} ${author.name}?`;
        if (work.kind === 'artwork') return work.group === 'sculpt' ? `Které z těchto děl vytvořil${a} ${author.name}?` : `Které z těchto děl namaloval${a} ${author.name}?`;
        if (work.kind === 'film') return `Který z těchto filmů režíroval${a} ${author.name}?`;
        if (work.kind === 'character') return `Kterou z těchto postav vymyslel${a} ${author.name}?`;
        return '';
    };
    const NATURE_FORWARD = { peak: (n) => `Ve kterém státě leží ${n.typeWord} ${n.name}?`, range: (n) => `Ve kterém státě leží pohoří ${n.name}?`, river: (n) => `Ve kterém státě teče řeka ${n.name}?`,
        lake: (n) => `Ve kterém státě leží jezero ${n.name}?`, island: (n) => `Ve kterém státě leží ostrov ${n.name}?` };
    const NATURE_BACK = { peak: (c) => `Která z těchto hor leží ${inCountry(c.name)}?`, range: (c) => `Které z těchto pohoří leží ${inCountry(c.name)}?`, river: (c) => `Která z těchto řek teče ${inCountry(c.name)}?`,
        lake: (c) => `Které z těchto jezer leží ${inCountry(c.name)}?`, island: (c) => `Který z těchto ostrovů je součástí ${ofCountry(c.name)}?` };
    const sameGroup = (b, x) => (b.kind === 'artwork' || b.kind === 'music' ? b.group === x.group : true);
    // rel = { id, from: druhy, to: druhy, ask(a, b, graph): text otázky, pool(b, graph): kandidáti na nesprávné možnosti,
    // fits(a, x, graph): x vazbu splňuje (nebo by mohl) – nesmí být nesprávnou možností }
    const linked = (graph, rel, a, x) => { const set = graph.edgeSets.get(rel).get(a.id); return Boolean(set && set.has(x.id)); };
    const RELATIONS = [
        { id: 'capital', from: ['country'], to: ['city'], ask: (a) => `Které město je hlavním městem ${ofCountry(a.name)}?`,
            pool: (b, graph) => (graph.byKind.get('city') || []).filter(x => x.capital), fits: (a, x) => x.country === a.id },
        { id: 'capitalOf', from: ['city'], to: ['country'], ask: (a) => `${a.name} je hlavním městem kterého státu?`, pool: (b, graph) => graph.byKind.get('country') || [],
            fits: (a, x) => x.id === a.country || norm(x.capital) === norm(a.name) },
        { id: 'cityCountry', from: ['city'], to: ['country'], ask: (a) => `Ve kterém státě leží město ${a.name}?`, pool: (b, graph) => graph.byKind.get('country') || [],
            fits: (a, x) => x.id === a.country },
        { id: 'countryCity', from: ['country'], to: ['city'], ask: (a) => `Které z těchto měst leží ${inCountry(a.name)}?`,
            pool: (b, graph) => (graph.byKind.get('city') || []).filter(x => !x.capital), fits: (a, x, graph) => x.country === a.id || Boolean(x.shared) },
        { id: 'landmarkCity', from: ['landmark'], to: ['city'], ask: (a) => `Ve kterém městě stojí ${landmarkSubject(a)}?`, pool: (b, graph) => graph.byKind.get('city') || [],
            fits: (a, x, graph) => x.id === a.city || norm(x.name) === norm(a.cityName) || (graph.landmarkByName.get(norm(a.name)) || []).some(other => other.city === x.id) },
        { id: 'cityLandmark', from: ['city'], to: ['landmark'], ask: (a) => `Která z těchto staveb stojí ve městě ${a.name}?`, pool: (b, graph) => graph.byKind.get('landmark') || [],
            // Stavba bez známého města smí být nesprávnou možností jen z jiného státu
            fits: (a, x) => x.city === a.id || (!x.city && x.country === a.country) || norm(x.cityName) === norm(a.name) || revealsCity(x.name, a.name) },
        { id: 'landmarkCountry', from: ['landmark'], to: ['country'], ask: (a) => `Ve kterém státě stojí ${landmarkSubject(a)}?`, pool: (b, graph) => graph.byKind.get('country') || [],
            fits: (a, x, graph) => x.id === a.country || (graph.landmarkByName.get(norm(a.name)) || []).some(other => other.country === x.id) },
        { id: 'countryLandmark', from: ['country'], to: ['landmark'], ask: (a) => `Která z těchto staveb stojí ${inCountry(a.name)}?`, pool: (b, graph) => graph.byKind.get('landmark') || [],
            fits: (a, x) => x.country === a.id || revealsCountry(x.name, a.name) },
        { id: 'landmarkArchitect', from: ['landmark'], to: ['architect'], ask: (a) => `Kdo navrhl stavbu ${a.name}?`, pool: (b, graph) => graph.byKind.get('architect') || [],
            fits: (a, x) => x.q === a.architect || reveals(a.archText, x.name) },
        { id: 'architectLandmark', from: ['architect'], to: ['landmark'], ask: (a) => `Kterou z těchto staveb navrhl${she(a)} ${a.name}?`,
            // Nesprávná možnost musí mít známého (jiného) architekta: stavba bez údaje může být klidně jeho
            // (a z jiného státu: na velkých stavbách se často podílelo víc architektů, data znají jen hlavního)
            pool: (b, graph) => (graph.byKind.get('landmark') || []).filter(x => (x.architect || x.archText) && x.country !== b.country),
            fits: (a, x) => x.architect === a.q || reveals(x.archText, a.name) || reveals(x.archText, a.name.split(' ').pop()) },
        { id: 'natureCountry', from: ['peak', 'range', 'river', 'lake', 'island'], to: ['country'], ask: (a) => NATURE_FORWARD[a.kind](a), pool: (b, graph) => graph.byKind.get('country') || [],
            fits: (a, x) => x.id === a.country },
        { id: 'countryNature', from: ['country'], to: ['peak', 'range', 'river', 'lake', 'island'], ask: (a, b) => NATURE_BACK[b.kind](a), pool: (b, graph) => graph.byKind.get(b.kind) || [],
            fits: (a, x) => x.country === a.id },
        { id: 'personCountry', from: [...PERSON_KINDS, 'band'], to: ['country'], ask: (a) => `Ze které země pochází ${a.kind === 'band' ? 'kapela' : a.role} ${a.name}?`,
            pool: (b, graph) => graph.byKind.get('country') || [], fits: (a, x) => x.id === a.country || (a.nations || []).includes(x.name) },
        { id: 'countryPerson', from: ['country'], to: [...PERSON_KINDS, 'band'], ask: (a, b) => (b.kind === 'band' ? `Která z těchto kapel pochází ${fromCountry(a.name)}?` : `Kdo z těchto ${MANY[b.kind]} pochází ${fromCountry(a.name)}?`),
            // Nesprávná možnost musí mít známou jinou zemi a popis nesmí zmiňovat tuhle
            pool: (b, graph) => (graph.byKind.get(b.kind) || []).filter(x => x.country), fits: (a, x) => x.country === a.id || (x.nations || []).includes(a.name) },
        { id: 'bandCity', from: ['band'], to: ['city'], ask: (a) => `Ve kterém městě vznikla kapela ${a.name}?`, pool: (b, graph) => graph.byKind.get('city') || [], fits: (a, x) => x.id === a.city },
        { id: 'cityBand', from: ['city'], to: ['band'], ask: (a) => `Která z těchto kapel vznikla ve městě ${a.name}?`, pool: (b, graph) => (graph.byKind.get('band') || []).filter(x => x.city),
            fits: (a, x) => x.city === a.id },
        { id: 'workAuthor', from: ['music', 'book', 'artwork', 'film', 'character'], to: [...PERSON_KINDS, 'band'], ask: (a, b, graph) => workQuestion(a, graph),
            pool: (b, graph) => graph.byKind.get(b.kind) || [], fits: (a, x, graph) => x.id === a.author || (graph.titlesBy.get(norm(a.name)) || new Set()).has(x.id) },
        { id: 'authorWork', from: [...PERSON_KINDS, 'band'], to: ['music', 'book', 'artwork', 'film', 'character'], ask: (a, b) => authorQuestion(a, b),
            pool: (b, graph) => (graph.byKind.get(b.kind) || []).filter(x => x.author && sameGroup(b, x)),
            fits: (a, x, graph) => x.author === a.id || [...(graph.titlesBy.get(norm(x.name)) || [])].includes(a.id) },
        { id: 'artMuseum', from: ['artwork'], to: ['landmark'], ask: (a) => `Kde je k vidění ${artNominative(a)} ${a.name}?`, pool: (b, graph) => (graph.byKind.get('landmark') || []).filter(x => x.museum),
            fits: (a, x) => x.id === a.museum },
        { id: 'museumArt', from: ['landmark'], to: ['artwork'], ask: (a) => `Které z těchto děl je k vidění ${MUSEUMS[a.name] || `v muzeu ${a.name}`}?`,
            pool: (b, graph) => (graph.byKind.get('artwork') || []).filter(x => x.museum), fits: (a, x) => x.museum === a.id },
        { id: 'clubCity', from: ['club'], to: ['city'], ask: (a) => `Ve kterém městě sídlí klub ${a.name}?`, pool: (b, graph) => graph.byKind.get('city') || [], fits: (a, x) => x.id === a.city },
        { id: 'cityClub', from: ['city'], to: ['club'], ask: (a) => `Který z těchto klubů sídlí ve městě ${a.name}?`, pool: (b, graph) => graph.byKind.get('club') || [],
            fits: (a, x) => x.city === a.id || revealsCity(x.name, a.name) },
        { id: 'gamesCity', from: ['games'], to: ['city'], ask: (a) => `Které město hostilo ${a.name}?`, pool: (b, graph) => (graph.byKind.get('city') || []).filter(x => x.pop >= 300000),
            fits: (a, x) => x.id === a.city },
        { id: 'cityGames', from: ['city'], to: ['games'], ask: (a) => `Které z těchto olympijských her se konaly ve městě ${a.name}?`, pool: (b, graph) => graph.byKind.get('games') || [],
            fits: (a, x) => x.city === a.id },
        { id: 'gamesCountry', from: ['games'], to: ['country'], ask: (a) => `Ve kterém státě se konaly ${a.name}?`, pool: (b, graph) => graph.byKind.get('country') || [],
            fits: (a, x) => x.id === a.country },
        { id: 'countryGames', from: ['country'], to: ['games'], ask: (a) => `Které z těchto olympijských her se konaly ${inCountry(a.name)}?`, pool: (b, graph) => graph.byKind.get('games') || [],
            fits: (a, x) => x.country === a.id },
        { id: 'clubCountry', from: ['club'], to: ['country'], ask: (a) => `Ve kterém státě sídlí klub ${a.name}?`, pool: (b, graph) => graph.byKind.get('country') || [],
            fits: (a, x) => x.id === a.country },
        { id: 'countryClub', from: ['country'], to: ['club'], ask: (a) => `Který z těchto klubů sídlí ${inCountry(a.name)}?`, pool: (b, graph) => graph.byKind.get('club') || [],
            fits: (a, x) => x.country === a.id || revealsCountry(x.name, a.name) },
        // Člen kapely: nesprávnou možností je jen hudebník se známou jinou kapelou (u sólových zpěváků data nemusí znát všechno)
        { id: 'memberBand', from: ['musician'], to: ['band'], ask: (a) => `Ve které kapele působil${she(a)} ${a.name}?`, pool: (b, graph) => graph.byKind.get('band') || [],
            fits: (a, x) => x.members.includes(a.name) || a.bands.includes(x.name) || reveals(x.name, a.name) },
        { id: 'bandMember', from: ['band'], to: ['musician'], ask: (a) => `Kdo z těchto hudebníků působil v kapele ${a.name}?`,
            pool: (b, graph) => (graph.byKind.get('musician') || []).filter(x => x.bands.length), fits: (a, x) => a.members.includes(x.name) || x.bands.includes(a.name) },
        { id: 'characterBook', from: ['character'], to: ['book'], ask: (a) => `Ve kterém díle vystupuje postava ${a.name}?`, pool: (b, graph) => graph.byKind.get('book') || [],
            fits: (a, x) => x.author === a.author || reveals(x.name, a.name) },
        { id: 'bookCharacter', from: ['book'], to: ['character'], ask: (a) => `Která z těchto postav vystupuje v díle ${a.name}?`, pool: (b, graph) => graph.byKind.get('character') || [],
            fits: (a, x) => x.book === a.id || x.author === a.author }
    ];
    const RELATION_BY_ID = new Map(RELATIONS.map(rel => [rel.id, rel]));
    // Skupiny vazeb (v řetězu se střídají, ať není sedmkrát zeměpis)
    const FAMILY = { capital: 'geo', capitalOf: 'geo', cityCountry: 'geo', countryCity: 'geo', landmarkCity: 'stavby', cityLandmark: 'stavby', landmarkCountry: 'stavby', countryLandmark: 'stavby',
        landmarkArchitect: 'autor', architectLandmark: 'autor', natureCountry: 'priroda', countryNature: 'priroda', personCountry: 'osobnost', countryPerson: 'osobnost',
        bandCity: 'osobnost', cityBand: 'osobnost', workAuthor: 'autor', authorWork: 'autor', artMuseum: 'muzeum', museumArt: 'muzeum', clubCity: 'sport', cityClub: 'sport',
        gamesCity: 'sport', cityGames: 'sport', gamesCountry: 'sport', countryGames: 'sport', clubCountry: 'sport', countryClub: 'sport',
        memberBand: 'kapela', bandMember: 'kapela', characterBook: 'postava', bookCharacter: 'postava' };

    // --- Možnosti ---
    // Podobnost nesprávné možnosti správné odpovědi (stejný kontinent a stát, podobná známost, období a skupina)
    const similarity = (b, x) => {
        let score = 0;
        if (b.continent && x.continent) score += b.continent === x.continent ? 2 : -1;
        if (b.country && x.country === b.country) score += 2;
        if (b.kind === 'city' && b.capital === x.capital) score += 1;
        if (b.group && b.group === x.group) score += 2;
        if (b.typeWord && b.typeWord === x.typeWord) score += b.kind === 'landmark' ? 2.5 : 1;
        if (b.year && x.year) score += Math.abs(b.year - x.year) < 40 ? 1.5 : Math.abs(b.year - x.year) < 120 ? 0.5 : -0.5;
        if (b.kind === 'games') score += b.winter === x.winter ? 3 : -3;
        score -= Math.abs((b.fame || 0) - (x.fame || 0)) * 3;
        return score;
    };
    // Kandidáti na nesprávné možnosti (stejný druh, ne málo známé, ne stejně pojmenované); seznam se pro vazbu a druh pamatuje
    const poolOf = (graph, rel, b) => {
        const key = `${rel.id}|${b.kind}|${b.group || ''}|${rel.id === 'architectLandmark' ? b.country : ''}`;
        if (!graph.pools.has(key)) graph.pools.set(key, rel.pool(b, graph).filter(x => x.kind === b.kind && x.fame <= 0.85 && !x.shared));
        return graph.pools.get(key);
    };
    // Tři nesprávné možnosti: stejný druh, vazbu nesplňují, různá jména (i od uzlů řetězu); z nejpodobnějších náhodně.
    // Vazba (pomalejší kontrola) se ověřuje až u kandidátů v pořadí podobnosti, dokud nejsou tři.
    // Nejdřív se projde jen 16 nejpodobnějších (bez řazení celého seznamu), celý seznam se seřadí, jen když mezi nimi nejsou tři vhodné.
    const TOP = 16;
    const pickDistractors = (graph, rel, a, b, rng, avoid = new Set(), count = 3) => {
        const names = new Set([norm(b.name), ...[...avoid].map(id => graph.nodes.get(id)).filter(Boolean).map(node => norm(node.name))]);
        const pool = poolOf(graph, rel, b);
        const scores = new Float64Array(pool.length);
        const top = [];
        for (let i = 0; i < pool.length; i++) {
            const x = pool[i];
            if (x === b || x === a || avoid.has(x.id)) { scores[i] = -Infinity; continue; }
            const score = similarity(b, x) + rng() * 1.5;
            scores[i] = score;
            if (top.length < TOP || score > scores[top[top.length - 1]]) {
                let at = top.length < TOP ? top.length : TOP - 1;
                while (at > 0 && scores[top[at - 1]] < score) { if (at < TOP) top[at] = top[at - 1]; at -= 1; }
                top[at] = i;
                if (top.length > TOP) top.length = TOP;
            }
        }
        const chosen = [];
        const tried = new Set();
        const consider = (i) => {
            const x = pool[i];
            tried.add(i);
            const key = norm(x.name);
            if (names.has(key) || linked(graph, rel.id, a, x) || rel.fits(a, x, graph)) return;
            names.add(key);
            chosen.push(x);
        };
        for (const i of top) { consider(i); if (chosen.length >= count) return chosen; }
        const rest = [];
        for (let i = 0; i < pool.length; i++) if (!tried.has(i) && scores[i] > -Infinity) rest.push(i);
        rest.sort((p, q) => scores[q] - scores[p]);
        for (const i of rest) { consider(i); if (chosen.length >= count) return chosen; }
        return null;
    };
    const brief = (node) => ({ id: node.id, name: node.name, kind: node.kind, topic: node.topic });
    // Otázka článku: { rel, from, to, text, options: [{ id, name }], answer (index správné) }
    const buildQuestion = (graph, relId, a, b, rng, avoid) => {
        const rel = RELATION_BY_ID.get(relId);
        const text = rel.ask(a, b, graph);
        if (!text) return null;
        const wrong = pickDistractors(graph, rel, a, b, rng, avoid);
        if (!wrong) return null;
        const options = shuffle([b, ...wrong], rng);
        return { rel: relId, from: brief(a), to: brief(b), text, options: options.map(option => ({ id: option.id, name: option.name })), answer: options.indexOf(b) };
    };
    // Záchrana: jiná otázka na stejný článek. Když to jde, se stejnou odpovědí z jiného uzlu mimo řetěz (same: true); nesprávné možnosti
    // původní otázky v ní zůstanou, kde to jde (ať se odpověď nedá poznat podle toho, že je jako jediná v obou otázkách), a k nim tři
    // náhradní. Jinak otázka na předchozí uzel jinou vazbou (same: false, pevné možnosti): po správné odpovědi se ukáže, kam článek vedl.
    const buildRescue = (graph, question, chainIds, rng) => {
        const b = graph.nodes.get(question.to.id);
        const sources = shuffle((graph.incoming.get(b.id) || []).filter(entry => !chainIds.has(entry.from) && !(entry.rel === question.rel && entry.from === question.from.id)), rng)
            .map(entry => ({ ...entry, node: graph.nodes.get(entry.from) }))
            .filter(entry => entry.node && entry.node.fame <= 0.45);
        for (const { rel: relId, node: a } of sources.slice(0, 6)) {
            const rel = RELATION_BY_ID.get(relId);
            // Odpověď musí být jediná (u „Která z těchto staveb stojí ve městě …?“ je správná každá stavba města – ostatní pak nesmí být mezi možnostmi)
            const text = rel.ask(a, b, graph);
            if (!text) continue;
            const keep = question.options.filter(option => option.id !== b.id).map(option => graph.nodes.get(option.id))
                .filter(x => x && !linked(graph, relId, a, x) && !rel.fits(a, x, graph)).map(x => x.id);
            // Aspoň dvě původní nesprávné možnosti musí zůstat (i po vyřazení té zvolené jedna), jinak by odpověď prozradila shoda
            if (keep.length < 2) continue;
            const extra = pickDistractors(graph, rel, a, b, rng, new Set([...chainIds, ...question.options.map(option => option.id)]), 3);
            if (!extra) continue;
            return { same: true, rel: relId, from: brief(a), text, keep, extra: extra.map(x => ({ id: x.id, name: x.name })) };
        }
        // Otázka na předchozí uzel jinou vazbou (jiný text), odpověď mimo řetěz
        const a = graph.nodes.get(question.from.id);
        const alternatives = shuffle(edgesFrom(graph, a).filter(({ rel, to }) => to && rel !== question.rel && to.id !== b.id && !chainIds.has(to.id) && to.fame <= 0.6), rng)
            .sort((p, q) => p.to.fame - q.to.fame);
        for (const { rel: relId, to } of alternatives.slice(0, 6)) {
            const alt = buildQuestion(graph, relId, a, to, rng, new Set([...chainIds, b.id, ...question.options.map(option => option.id)]));
            if (alt && alt.text !== question.text) return { same: false, rel: relId, from: alt.from, to: alt.to, text: alt.text, options: alt.options, answer: alt.answer };
        }
        return null;
    };
    // Otázka záchrany po špatné odpovědi chosen (id). Se stejnou odpovědí: správná, nesprávné původní kromě zvolené, doplněné náhradními,
    // pořadí ze semínka; jinak pevná otázka. { text, from, options, answer, same }
    const rescueOptions = (question, chosen, seedText = 'zachrana') => {
        const rescue = question.rescue;
        if (!rescue) return null;
        if (!rescue.same) return { text: rescue.text, from: rescue.from, options: rescue.options, answer: rescue.answer, same: false };
        const answer = question.options[question.answer];
        const kept = rescue.keep.filter(id => id !== chosen).map(id => question.options.find(option => option.id === id)).filter(Boolean);
        const options = [answer, ...kept, ...rescue.extra].slice(0, 4);
        const ordered = shuffle(options, seededRandom(`${seedText}:${question.k}:${chosen || ''}`));
        return { text: rescue.text, from: rescue.from, options: ordered, answer: ordered.indexOf(answer), same: true };
    };

    // --- Řetěz ---
    // Jak známé smí být uzly řetězu (podíl kategorie od nejznámějších): první články snazší, pak volněji
    const FAME_LIMIT = { country: 0.75, city: 0.32, landmark: 0.3, peak: 0.3, range: 0.3, river: 0.3, lake: 0.35, island: 0.3, composer: 0.5, musician: 0.3, writer: 0.3, artist: 0.35,
        architect: 0.35, director: 0.45, athlete: 0.25, band: 0.35, music: 0.4, book: 0.35, artwork: 0.45, film: 0.25, club: 0.4, games: 0.6, character: 0.6 };
    const famousEnough = (node, step, practice) => node.fame <= Math.min(0.95, (FAME_LIMIT[node.kind] || 0.3) * (practice ? 1.4 : 1) * (step <= 2 ? 0.8 : 1));
    // Kolikrát smí být druh uzlu v řetězu (státy a města jsou uzly, přes které vede skoro všechno)
    // Obrazy a muzea do sebe zapadají nejsnáz (obraz → muzeum → město), proto nejvýš jeden obraz a jedna vazba muzea v řetězu
    const KIND_MAX = { country: 2, city: 2, landmark: 2, artwork: 1 };
    const FAMILY_MAX = { muzeum: 1 };
    // Vazby, které smí být v řetězu dvakrát (spojují témata: autor díla, země osobnosti, hlavní město)
    const REPEATABLE = new Set(['capital', 'capitalOf', 'cityCountry', 'countryCity', 'workAuthor', 'personCountry']);
    // Začátek řetězu: slavná stavba, dílo nebo osobnost (začátek se jen ukáže, otázka na něj není)
    const START_KINDS = ['landmark', 'music', 'book', 'artwork', 'film', 'composer', 'writer', 'artist', 'band', 'club', 'peak', 'range', 'river', 'lake', 'island', 'character', 'games'];
    // Začátek se střídá po skupinách (každý řetěz má svou skupinu na prvním místě): stavby, hudba, knihy, výtvarné umění, film a sport, příroda
    const START_GROUPS = [['landmark'], ['music', 'band', 'composer'], ['book', 'writer', 'character'], ['artwork', 'artist'], ['film', 'club', 'games'], ['peak', 'range', 'river', 'lake', 'island']];
    const edgesFrom = (graph, node) => RELATIONS.filter(rel => rel.from.includes(node.kind))
        .flatMap(rel => (graph.edges.get(rel.id).get(node.id) || []).map(to => ({ rel: rel.id, to: graph.nodes.get(to) })));
    // Řetěz dne (semínko dne) nebo cvičný (náhodné semínko): { seed, start, questions: [{ k, rel, from, to, text, options, answer, rescue }] }
    // Hledání do hloubky s návratem: z uzlu se zkusí nejvýš pět (při volnějším hledání osm) nejlepších vazeb; každý článek musí mít
    // otázku se třemi nesprávnými možnostmi i záchranu. Když přísné hledání řetěz nenajde, zkusí se volnější (stále stejně pro všechny).
    // share = podíl uzlů, které jsou v daném řetězu k dispozici (každý den jiné): slavné státy a města tak nejsou v každém řetězu;
    // avoid = uzly, které v řetězu být nesmí (předchozí den); poslední úroveň je jen nouzová a nevyhýbá se ničemu
    // avoid: 'all' = žádný uzel ze včerejška, 'people' = státy a města se opakovat smí (osobnosti, díla a stavby ne), 'none' = nouzově nic
    const LEVELS = [
        { breadth: 6, repeat: (rel) => (REPEATABLE.has(rel) ? 2 : 1), families: 3, practice: false, share: 0.75, avoid: 'all' },
        { breadth: 8, repeat: () => 2, families: 4, practice: true, share: 1, avoid: 'all' },
        { breadth: 8, repeat: () => 2, families: 4, practice: true, share: 1, avoid: 'people' },
        { breadth: 8, repeat: () => 2, families: 4, practice: true, share: 1, avoid: 'none' },
        // Úplně nouzově i bez omezení obrazů a muzeí (řetěz dne musí vyjít vždy)
        { breadth: 10, repeat: () => 2, families: 5, practice: true, share: 1, avoid: 'none', free: true }
    ];
    const PLACES = new Set(['country', 'city']);
    const search = (graph, { seed, links, practice, budget, level, avoid }) => {
        const rules = LEVELS[level];
        const loose = practice || rules.practice;
        const rng = seededRandom(level ? `${seed}:${level}` : seed);
        const blocked = (node) => avoid.has(node.id) && (rules.avoid === 'all' || (rules.avoid === 'people' && !PLACES.has(node.kind)));
        const available = (node) => !blocked(node) && (rules.share >= 1 || hash32(`${seed}|k|${node.id}`) / 4294967296 < rules.share);
        // Chuť řetězu: každý řetěz má jiné oblíbené vazby (jeden den víc staveb, jiný víc hudby), ať se dny neopakují
        const taste = new Map(RELATIONS.map(rel => [rel.id, rng()]));
        const group = START_GROUPS[hash32(`${seed}|skupina`) % START_GROUPS.length];
        const startable = (kind) => (graph.byKind.get(kind) || []).filter(node => available(node) && node.fame <= (FAME_LIMIT[node.kind] || 0.3) * (loose ? 1 : 0.6));
        const starts = [...shuffle(group.flatMap(startable), rng).slice(0, 30), ...shuffle(START_KINDS.filter(kind => !group.includes(kind)).flatMap(startable), rng)];
        let left = budget;
        const questions = [];
        const used = new Set();
        const kinds = new Map();
        const rels = new Map();
        const families = new Map();
        const bump = (map, key, by) => map.set(key, (map.get(key) || 0) + by);
        // Záchrana se nemá ptát na pozdější článek řetězu ani na něj vést – prozradila by ho („Kdo navrhl stavbu Most Mehmeda Sokoloviće?“
        // jako záchrana, když je most odpovědí dalšího článku). Záchrana článku se proto sestaví, až je známý další článek (ten se jí vyhne),
        // a hotový řetěz se zkontroluje celý. (Pozdější článek jako nesprávná možnost dřívější otázky nevadí: u jiné otázky nic neprozradí.)
        const reveals = (question, ids) => (ids.has(question.rescue.from.id) && question.rescue.from.id !== question.from.id)
            || (!question.rescue.same && ids.has(question.rescue.to.id));
        const finish = () => {
            const ids = new Set(used);
            const lastQuestion = questions[questions.length - 1];
            const lastRescue = buildRescue(graph, lastQuestion, ids, rng);
            if (!lastRescue) return false;
            lastQuestion.rescue = lastRescue;
            // Záchrana, která se ptá na pozdější článek, se sestaví znovu bez něj; když to nejde, zůstane (bezprostředně další článek
            // to nikdy není, ten se vyloučil už při sestavení)
            for (const question of questions) {
                if (!reveals(question, ids)) continue;
                const rescue = buildRescue(graph, question, ids, rng);
                if (rescue) question.rescue = rescue;
            }
            return true;
        };
        const walk = (node) => {
            if (questions.length >= links) { left -= 3; return finish(); }
            if (--left <= 0) return false;
            const step = questions.length + 1;
            const previous = questions.length ? questions[questions.length - 1] : null;
            const last = previous ? previous.rel : '';
            // Vazba nejvýš jednou (spojovací dvakrát), ne dvakrát za sebou a skupina vazeb nejvýš třikrát v řetězu
            const options = edgesFrom(graph, node).filter(({ rel, to }) => to && !used.has(to.id) && rel !== last && (rels.get(rel) || 0) < rules.repeat(rel)
                && (kinds.get(to.kind) || 0) < ((rules.free ? 2 : KIND_MAX[to.kind]) || 2) && famousEnough(to, step, loose) && (families.get(FAMILY[rel]) || 0) < Math.min(rules.families, (!rules.free && FAMILY_MAX[FAMILY[rel]]) || 9) && available(to))
                // Váha: náhoda, chuť řetězu, oblíbenost uzlu v tomto řetězu (jiný den jiné uzly, i když jsou slavné), nový druh a skupina
                .map(entry => ({ ...entry, weight: rng() + 1.5 * taste.get(entry.rel) + 2 * hash32(`${seed}|${entry.to.id}`) / 4294967296
                    + ((kinds.get(entry.to.kind) || 0) ? 0 : 0.5) + ((families.get(FAMILY[entry.rel]) || 0) ? 0 : 0.4) - 0.5 * entry.to.fame }))
                .sort((p, q) => q.weight - p.weight)
                .slice(0, rules.breadth);
            for (const { rel, to } of options) {
                // Otázka se třemi nesprávnými možnostmi (žádná není uzel řetězu); záchrana předchozího článku se vyhne i tomuto
                const ids = new Set([...used, to.id]);
                const question = buildQuestion(graph, rel, node, to, rng, ids);
                if (!question) continue;
                question.k = step;
                question.rescue = null;
                if (previous) {
                    previous.rescue = buildRescue(graph, previous, ids, rng);
                    if (!previous.rescue) continue;
                }
                used.add(to.id); questions.push(question);
                bump(kinds, to.kind, 1); bump(rels, rel, 1); bump(families, FAMILY[rel], 1);
                if (walk(to)) return true;
                used.delete(to.id); questions.pop();
                bump(kinds, to.kind, -1); bump(rels, rel, -1); bump(families, FAMILY[rel], -1);
                if (left <= 0) return false;
            }
            return false;
        };
        // Rozpočet kroků: na jeden začátek nejvýš budget, na celou úroveň dvacetinásobek (začátek, ze kterého řetěz nevede, se rychle vzdá)
        let total = budget * 20;
        for (const start of starts.slice(0, 60)) {
            if (total <= 0) break;
            used.clear(); kinds.clear(); rels.clear(); families.clear(); questions.length = 0;
            used.add(start.id);
            kinds.set(start.kind, 1);
            left = budget;
            const found = walk(start);
            total -= budget - Math.max(0, left);
            if (found) return { seed: String(seed), level, start: brief(start), questions: questions.map(question => ({ ...question })) };
        }
        return null;
    };
    const generate = (graph, { seed, links = LINKS, practice = false, budget = 400, avoid = new Set() } = {}) => {
        for (let level = 0; level < LEVELS.length; level++) {
            const chain = search(graph, { seed, links, practice, budget, level, avoid });
            if (chain) return chain;
        }
        return null;
    };
    const chainIds = (chain) => (chain ? [chain.start.id, ...chain.questions.map(question => question.to.id)] : []);
    // Řetěz dne se vyhne uzlům včerejšího řetězu. Včerejší řetěz se dopočítá jen do hloubky dvou dnů (jako řetěz „žádná položka
    // ze včerejška“ v daily-quiz.js): vyhne se uzlům řetězu, který by vyšel bez ohledu na předvčerejšek, i řetězu, který by vyšel
    // s ohledem na něj – skutečný včerejšek je skoro vždy jeden z nich. Výsledek je stejný pro všechny a nezávisí na tom, kdy kdo hrál.
    const plainDaily = (graph, day, avoid) => generate(graph, { seed: seedFor(day), avoid });
    const dailyChain = (graph, day) => {
        const yesterday = addDays(day, -1);
        const before = plainDaily(graph, addDays(day, -2), new Set());
        const plain = plainDaily(graph, yesterday, new Set());
        const likely = plainDaily(graph, yesterday, new Set(chainIds(before)));
        return plainDaily(graph, day, new Set([...chainIds(plain), ...chainIds(likely)]));
    };
    const practiceChain = (graph, seed) => generate(graph, { seed: `mudrlant-retezovka-cvicna-${seed}`, practice: true });

    return { SOURCES, RELATIONS, RELATION_BY_ID, buildGraph, buildQuestion, buildRescue, generate, dailyChain, practiceChain, chainIds, seedFor };
});
