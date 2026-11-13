// Řetězovka: odpověď na jednu otázku je začátkem další („Ve kterém městě stojí Eiffelova věž?“ → Paříž → „Paříž je hlavním městem
// kterého státu?“ → Francie → …). Z dat témat (státy, hlavní města, města, stavby, hory a řeky, osobnosti podle země, díla a jejich
// autoři, muzea, kluby, olympiády) se postaví graf vazeb a z něj článek po článku řetěz. Každý článek je otázka se čtyřmi možnostmi:
// nesprávné možnosti jsou stejného druhu (jiné státy, jiní skladatelé) a vazbu nesplňují (žádný druhý francouzský skladatel).
// Řetězovka dne: 7 článků stejných pro všechny (semínko = pražský den), článek k dává k bodů (celý řetěz 28), špatná odpověď řetěz
// přetrhne, jednou za hru Záchrana (jiná otázka na stejný článek, za 0 bodů). Cvičná řetězovka: náhodný řetěz bez bodů a statistik.
// Čistá logika bez DOMu a sítě (graf, řetěz, body, uložený stav, sdílení) a vykreslení obrazovek jako HTML; app.js napojí data témat
// (loadTopic), server (social.js, blok „21: Řetězovka“ v supabase/schema.sql) a klepnutí. Testy: tests/chain.test.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = api;
    else root.MudrlantChain = api;
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';
    // Obrázky (icons/topics/<název>.webp): do dodání vlastních (docs/NOVE-MODY.md č. 212–214) stávající; vyměnit stačí tady
    const ART = {
        tile: 'sova-vyzva', // č. 212 retezovka – sova se zlatým řetězem (dlaždice na úvodu, úvod Řetězovky, tip)
        intro: 'sova-vyzva', // č. 212 retezovka
        full: 'sova-vitez', // celý řetěz
        broken: 'sova-smutek' // přetržený řetěz (č. 213 clanek a č. 214 clanek-prasknuty kreslí zatím SVG v linkSvg)
    };
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
        const itemsOf = (topic) => (sources && Array.isArray(sources[topic]) ? sources[topic] : []);
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
    const KIND_MAX = { country: 2, city: 2, landmark: 2 };
    // Vazby, které smí být v řetězu dvakrát (spojují témata: autor díla, země osobnosti, hlavní město)
    const REPEATABLE = new Set(['capital', 'capitalOf', 'cityCountry', 'countryCity', 'workAuthor', 'personCountry']);
    // Začátek řetězu: slavná stavba, dílo nebo osobnost (začátek se jen ukáže, otázka na něj není)
    const START_KINDS = ['landmark', 'music', 'book', 'artwork', 'film', 'composer', 'writer', 'artist', 'band', 'club', 'peak', 'range', 'river', 'lake', 'island', 'character', 'games'];
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
        { breadth: 8, repeat: () => 2, families: 4, practice: true, share: 1, avoid: 'none' }
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
        const starts = shuffle(START_KINDS.flatMap(kind => (graph.byKind.get(kind) || []).filter(node => available(node) && node.fame <= (FAME_LIMIT[node.kind] || 0.3) * (loose ? 1 : 0.6))), rng);
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
                && (kinds.get(to.kind) || 0) < (KIND_MAX[to.kind] || 2) && famousEnough(to, step, loose) && (families.get(FAMILY[rel]) || 0) < rules.families && available(to))
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

    // --- Hra: pokus a body ---
    // Pokus: { day, owner, practice, chain, results: [{ k, correct, rescued, points, chosen }], pending: null | { k, chosen, phase: 'decide' | 'rescue' },
    // rescueUsed, done, synced, xp, rank }. Článek k (1–7) dává k bodů, článek zachráněný Záchranou 0.
    const newAttempt = (day, owner, chain, practice = false) => ({ day, owner: owner || 'host', practice: Boolean(practice), chain, results: [], pending: null, rescueUsed: false, done: false, synced: false, xp: null, rank: null });
    const nextLink = (attempt) => (attempt.done ? -1 : attempt.results.filter(row => row.correct).length + 1);
    const summaryOf = (attempt) => {
        const results = (attempt && attempt.results) || [];
        const links = results.filter(row => row.correct).length;
        return { links, score: results.reduce((sum, row) => sum + (row.correct ? row.points : 0), 0), rescued: Boolean(attempt && attempt.rescueUsed), full: links >= LINKS, done: Boolean(attempt && attempt.done) };
    };
    const triangle = (n) => n * (n + 1) / 2;
    // Rozsahy jako na serveru (chain_submit): bez záchrany přesně 1 + 2 + … + články, se záchranou nejvýš o jeden článek méně
    const validSummary = ({ links, score, rescued }) => Number.isInteger(links) && links >= 0 && links <= LINKS && Number.isInteger(score)
        && (rescued ? score >= triangle(links) - links && score <= triangle(links) : score === triangle(links));
    // Otázka, na kterou se teď odpovídá: { question (článek), rescue (otázka záchrany nebo null), k }
    const currentAsk = (attempt) => {
        const k = nextLink(attempt);
        if (k < 1) return null;
        const question = attempt.chain.questions[k - 1];
        if (!question) return null;
        const rescue = attempt.pending && attempt.pending.phase === 'rescue' ? rescueOptions(question, attempt.pending.chosen, `${attempt.chain.seed}:zachrana`) : null;
        return { k, question, rescue };
    };
    // Odpověď (id zvolené možnosti): vrátí { attempt, outcome: 'right' | 'decide' | 'broken' | 'saved' | 'lost' }
    const answer = (attempt, chosenId) => {
        const ask = currentAsk(attempt);
        if (!ask || (attempt.pending && attempt.pending.phase === 'decide')) return { attempt, outcome: null };
        const next = { ...attempt, results: [...attempt.results] };
        if (ask.rescue) {
            const right = ask.rescue.options[ask.rescue.answer].id === chosenId;
            next.results.push({ k: ask.k, correct: right, rescued: true, points: 0, chosen: chosenId });
            next.pending = null;
            if (!right || ask.k >= LINKS) next.done = true;
            return { attempt: next, outcome: right ? 'saved' : 'lost' };
        }
        const right = ask.question.options[ask.question.answer].id === chosenId;
        if (right) {
            next.results.push({ k: ask.k, correct: true, rescued: false, points: ask.k, chosen: chosenId });
            if (ask.k >= LINKS) next.done = true;
            return { attempt: next, outcome: 'right' };
        }
        if (!attempt.rescueUsed && ask.question.rescue) {
            next.pending = { k: ask.k, chosen: chosenId, phase: 'decide' };
            return { attempt: next, outcome: 'decide' };
        }
        next.results.push({ k: ask.k, correct: false, rescued: false, points: 0, chosen: chosenId });
        next.done = true;
        return { attempt: next, outcome: 'broken' };
    };
    // Záchrana po špatné odpovědi: jiná otázka na stejný článek (za 0 bodů); Ukončit = řetěz se přetrhne
    const useRescue = (attempt) => (attempt.pending && attempt.pending.phase === 'decide' && !attempt.rescueUsed
        ? { ...attempt, rescueUsed: true, pending: { ...attempt.pending, phase: 'rescue' } } : attempt);
    const giveUp = (attempt) => {
        if (!attempt.pending || attempt.pending.phase !== 'decide') return attempt;
        return { ...attempt, pending: null, done: true, results: [...attempt.results, { k: attempt.pending.k, correct: false, rescued: false, points: 0, chosen: attempt.pending.chosen }] };
    };
    const xpFor = (summary) => {
        const parts = [];
        if (summary.score > 0) parts.push({ label: 'za body v Řetězovce dne', xp: XP_PER_POINT * summary.score });
        if (summary.full) parts.push({ label: 'za celý řetěz', xp: FULL_XP });
        return { total: parts.reduce((sum, part) => sum + part.xp, 0), parts };
    };

    // --- Sdílení ---
    // 🔗 za každý článek, 🛟 za článek zachráněný Záchranou, 💥 za přetržený článek (zbytek se nevypisuje)
    const shareGrid = (results) => (results || []).map(row => (row.correct ? (row.rescued ? '🛟' : '🔗') : '💥')).join('');
    const shareText = ({ appName = 'Mudrlant', day, attempt, url = '' }) => {
        const summary = summaryOf(attempt);
        return [`${appName} · Řetězovka ${formatDay(day)} ${shareGrid(attempt.results)}`.trim(), pointsWord(summary.score), url].filter(Boolean).join(' · ');
    };
    const poseFor = (summary) => (summary.full ? 'vitez' : summary.links >= 5 ? 'oslava' : summary.links >= 3 ? 'radost' : 'premysleni');
    // Karta obrázku (share-card.js): mřížka = články (správně, přetržený, nedohraný)
    const cardInput = ({ day, attempt, rank = null, robe, url, appName }) => {
        const summary = summaryOf(attempt);
        const grid = Array.from({ length: LINKS }, (_, i) => { const row = attempt.results.find(entry => entry.k === i + 1); return row ? row.correct : null; });
        return {
            kicker: 'Řetězovka dne', headline: pointsWord(summary.score), detail: `${summary.links}/${LINKS} článků${summary.rescued ? ' · se Záchranou' : ''}`,
            grid, note: rank && rank.rank ? `${rank.rank}. místo z ${rank.players}` : summary.full ? 'Celý řetěz!' : 'Dáš celý řetěz?',
            day, robe, pose: poseFor(summary), url, appName
        };
    };

    // --- Uložený stav (mudrlant.chain) ---
    // { v, intro (úvod už viděl), days: { den: { links, score, rescued, xp } }, attempt }
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const cleanOption = (option) => (option && typeof option.id === 'string' && typeof option.name === 'string' ? { id: option.id.slice(0, 80), name: option.name.slice(0, 160) } : null);
    const cleanBrief = (node) => (node && typeof node.id === 'string' && typeof node.name === 'string'
        ? { id: node.id.slice(0, 80), name: node.name.slice(0, 160), kind: String(node.kind || '').slice(0, 20), topic: String(node.topic || '').slice(0, 20) } : null);
    const cleanQuestion = (question, index) => {
        if (!question || typeof question.text !== 'string' || !Array.isArray(question.options)) return null;
        const options = question.options.map(cleanOption);
        const from = cleanBrief(question.from);
        const to = cleanBrief(question.to);
        if (options.length !== 4 || options.some(option => !option) || !from || !to || !Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) return null;
        const r = question.rescue;
        let rescue = null;
        if (r && typeof r.text === 'string' && cleanBrief(r.from)) {
            if (r.same && Array.isArray(r.keep) && Array.isArray(r.extra)) rescue = { same: true, rel: String(r.rel || ''), from: cleanBrief(r.from), text: r.text.slice(0, 300), keep: r.keep.filter(id => typeof id === 'string').slice(0, 3), extra: r.extra.map(cleanOption).filter(Boolean).slice(0, 3) };
            else if (!r.same && Array.isArray(r.options) && r.options.length === 4 && Number.isInteger(r.answer)) rescue = { same: false, rel: String(r.rel || ''), from: cleanBrief(r.from), to: cleanBrief(r.to), text: r.text.slice(0, 300), options: r.options.map(cleanOption).filter(Boolean), answer: whole(r.answer, 3) };
            if (rescue && !rescue.same && rescue.options.length !== 4) rescue = null;
        }
        return { k: index + 1, rel: String(question.rel || ''), from, to, text: question.text.slice(0, 300), options, answer: question.answer, rescue };
    };
    const cleanChain = (chain) => {
        if (!chain || !Array.isArray(chain.questions) || chain.questions.length !== LINKS || !cleanBrief(chain.start)) return null;
        const questions = chain.questions.map(cleanQuestion);
        return questions.every(Boolean) ? { seed: String(chain.seed || '').slice(0, 80), start: cleanBrief(chain.start), questions } : null;
    };
    const cleanAttempt = (raw) => {
        if (!raw || typeof raw !== 'object' || !isDay(raw.day)) return null;
        const chain = cleanChain(raw.chain);
        if (!chain) return null;
        const results = [];
        for (const row of (Array.isArray(raw.results) ? raw.results : []).slice(0, LINKS + 1)) {
            if (!row || typeof row !== 'object') break;
            const k = whole(row.k, LINKS);
            if (k !== results.filter(entry => entry.correct).length + 1) break;
            const correct = Boolean(row.correct);
            results.push({ k, correct, rescued: Boolean(row.rescued), points: correct && !row.rescued ? k : 0, chosen: typeof row.chosen === 'string' ? row.chosen.slice(0, 80) : '' });
            if (!correct) break;
        }
        const broken = results.some(row => !row.correct);
        const rescueUsed = Boolean(raw.rescueUsed) || results.some(row => row.rescued);
        const pending = !broken && raw.pending && typeof raw.pending === 'object' && whole(raw.pending.k, LINKS) === results.filter(row => row.correct).length + 1
            && (raw.pending.phase === 'decide' || raw.pending.phase === 'rescue') ? { k: whole(raw.pending.k, LINKS), chosen: String(raw.pending.chosen || '').slice(0, 80), phase: raw.pending.phase } : null;
        const xp = raw.xp && Number.isFinite(raw.xp.total) && Array.isArray(raw.xp.parts)
            ? { total: whole(raw.xp.total, 1000), parts: raw.xp.parts.filter(part => part && typeof part.label === 'string' && Number.isFinite(part.xp)).map(part => ({ label: part.label.slice(0, 80), xp: whole(part.xp, 1000) })) } : null;
        return {
            day: raw.day, owner: typeof raw.owner === 'string' && raw.owner ? raw.owner.slice(0, 64) : 'host', practice: false, chain, results,
            pending: pending && !(pending.phase === 'decide' && rescueUsed) ? pending : null, rescueUsed,
            done: broken || results.filter(row => row.correct).length >= LINKS, synced: Boolean(raw.synced), xp,
            rank: raw.rank && Number.isInteger(raw.rank.rank) && raw.rank.rank > 0 ? { rank: raw.rank.rank, players: whole(raw.rank.players, 1e7) } : null
        };
    };
    const parseState = (raw) => {
        const state = { v: 1, intro: false, days: {}, attempt: null, cache: null };
        if (!raw || typeof raw !== 'object') return state;
        state.intro = raw.intro === true;
        if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
            Object.keys(raw.days).filter(isDay).sort().slice(-HISTORY_DAYS).forEach(day => {
                const row = raw.days[day];
                if (row && typeof row === 'object') state.days[day] = { links: whole(row.links, LINKS), score: whole(row.score, MAX_SCORE), rescued: Boolean(row.rescued), xp: Boolean(row.xp) };
            });
        }
        state.attempt = cleanAttempt(raw.attempt);
        // Spočítaný řetěz dne (ať se při každém otevření nepočítá znovu); ověří se až při použití
        state.cache = raw.cache && typeof raw.cache === 'object' && isDay(raw.cache.day) && raw.cache.chain ? { day: raw.cache.day, chain: raw.cache.chain } : null;
        return state;
    };

    // --- Vykreslení (HTML; h = pomocné funkce z app.js: uiArt, avatarHtml, xpLine) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const PRIMARY = 'flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white disabled:opacity-50';
    const SECONDARY = 'flex min-w-0 items-center justify-center gap-1.5 rounded-2xl btn-3d-light bg-white px-2 py-2.5 text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100';
    const LABEL = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const HERO = 'chain-hero relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-gold-800 via-gold-900 to-gold-950 text-white shadow-lg ring-1 ring-gold-500/40';
    const KIND_ICON = {
        country: 'flag', city: 'building-2', landmark: 'landmark', peak: 'mountain', range: 'mountain-snow', river: 'waves', lake: 'droplets', island: 'palmtree',
        composer: 'piano', musician: 'mic-vocal', writer: 'feather', artist: 'palette', architect: 'ruler', director: 'clapperboard', athlete: 'medal', band: 'guitar',
        music: 'music-2', book: 'book-open', artwork: 'frame', film: 'film', club: 'shield', games: 'trophy', character: 'user-round'
    };
    const iconFor = (kind) => KIND_ICON[kind] || 'sparkles';

    // Řetěz jako SVG: články vedle sebe, střídavě zepředu (ovál) a z boku (úzká příčka), takže do sebe zapadají.
    // states: 'done' | 'rescued' | 'broken' | 'current' | 'todo' po článcích; fresh = index článku, který právě zacvakl.
    const LINK_STEP = 31;
    const linkSvg = (states, { fresh = -1, label = '', className = 'h-auto w-full' } = {}) => {
        const uid = `cg${Math.abs(hash32(`${states.join('')}|${fresh}|${label}`)) % 100000}`;
        const width = 12 + (states.length - 1) * LINK_STEP + 42;
        const parts = states.map((state, i) => {
            const x = 6 + i * LINK_STEP;
            const face = i % 2 === 0;
            const y = face ? 5 : 13;
            const h = face ? 22 : 6;
            const r = h / 2;
            const cls = `chain-link chain-link-${state}${i === fresh ? ' chain-click' : ''}`;
            if (state === 'broken') {
                // Prasklý článek: dvě poloviny, které se od sebe odklopí
                const mid = x + 21;
                const left = `M${mid - 4} ${y}H${x + r}A${r} ${r} 0 0 0 ${x + r} ${y + h}H${mid - 2}`;
                const right = `M${mid + 2} ${y}H${x + 42 - r}A${r} ${r} 0 0 1 ${x + 42 - r} ${y + h}H${mid + 4}`;
                return `<g class="${cls}" data-link="${i + 1}"><path class="chain-half chain-half-l" d="${left}"/><path class="chain-half chain-half-r" d="${right}"/><path class="chain-spark" d="M${mid - 3} ${y - 3}l2 4M${mid + 3} ${y + h + 3}l-2 -4M${mid} ${y - 4}v3"/></g>`;
            }
            const gold = state === 'done' || state === 'rescued';
            return `<g class="${cls}" data-link="${i + 1}">${gold ? `<rect class="chain-edge" x="${x}" y="${y}" width="42" height="${h}" rx="${r}"/>` : ''}<rect class="chain-face" x="${x}" y="${y}" width="42" height="${h}" rx="${r}"${gold ? ` stroke="url(#${uid})"` : ''}/>${gold && face ? `<path class="chain-shine" d="M${x + r} ${y + 3}H${x + 30}"/>` : ''}</g>`;
        });
        // Boční příčky se kreslí až po oválech, ať přes ně vedou (řetěz do sebe zapadá)
        const order = [...parts.keys()].sort((a, b) => (a % 2) - (b % 2) || a - b);
        return `<svg viewBox="0 0 ${width} 32" class="${className}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.45" stop-color="#efc55c"/><stop offset="1" stop-color="#b9771b"/></linearGradient></defs>${order.map(i => parts[i]).join('')}</svg>`;
    };
    const stripStates = (attempt, { phase = 'ask' } = {}) => Array.from({ length: LINKS }, (_, i) => {
        const row = attempt.results.find(entry => entry.k === i + 1);
        if (row) return row.correct ? (row.rescued ? 'rescued' : 'done') : 'broken';
        if (attempt.pending && attempt.pending.k === i + 1 && phase !== 'ask' && phase !== 'right') return 'broken';
        return !attempt.done && nextLink(attempt) === i + 1 ? 'current' : 'todo';
    });
    const stripLabel = (attempt) => {
        const summary = summaryOf(attempt);
        return `Řetěz: ${summary.links} z ${LINKS} článků${attempt.results.some(row => !row.correct) ? ', přetržený' : ''}`;
    };

    // Dlaždice na úvodu (vykreslí app.js specialTile): krátký stav, celý v popisku pro čtečku
    const homeTile = ({ status = 'new', step = 1, summary = null, rank = null }) => {
        if (status === 'done' && summary) {
            return { text: rank ? `${pointsWord(summary.score)} · ${rank}.` : `${pointsWord(summary.score)} · ${summary.links}/${LINKS}`, fresh: false,
                label: `Řetězovka dne: ${pointsWord(summary.score)}, ${summary.links} z ${LINKS} článků${rank ? `, ${rank}. místo` : ''}` };
        }
        if (status === 'progress') return { text: `Článek ${step}/${LINKS}`, fresh: false, label: `Řetězovka dne: rozehráno, článek ${step} z ${LINKS}` };
        return { text: `${LINKS} článků`, fresh: true, label: `Řetězovka dne: ${LINKS} článků, odpověď je začátkem další otázky` };
    };

    // Úvod (poprvé): co Řetězovka je a pravidla
    const introHtml = ({ day }, h) => {
        const rule = (icon, text) => `<li class="flex items-start gap-2.5 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70 short:py-1.5 dark:bg-slate-800/70 dark:ring-slate-700/70"><i data-lucide="${icon}" class="mt-0.5 h-4 w-4 shrink-0 text-gold-700 dark:text-gold-300"></i><span class="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">${text}</span></li>`;
        const demo = ['done', 'done', 'done', 'current', 'todo', 'todo', 'todo'];
        return `
            <div id="chain-intro" class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-4 short:gap-2 short:p-3 dark:bg-slate-900">
                <div class="${HERO} px-4 pb-3 pt-3 text-center short:pt-2">
                    ${h.uiArt(ART.intro, 'mx-auto h-16 w-16 short:h-12 short:w-12')}
                    <p class="mt-1 text-[11px] font-black uppercase tracking-widest text-gold-200">Řetězovka dne · ${esc(formatDay(day, true))}</p>
                    <h1 class="mt-0.5 text-xl font-black leading-tight max-[389px]:text-[17px]">Odpověď je začátkem další otázky</h1>
                    <div class="mx-auto mt-2 max-w-[16rem]" aria-hidden="true">${linkSvg(demo, { label: '' })}</div>
                </div>
                <ul class="flex flex-col gap-1.5">
                    ${rule('flag', `Řetěz má ${LINKS} článků a je dnes pro všechny stejný. Na každý článek odpovídáš výběrem ze čtyř možností, čas se nepočítá.`)}
                    ${rule('trophy', `Článek 1 dává 1 bod, článek 2 dva body, … článek ${LINKS} sedm bodů. Celý řetěz má ${MAX_SCORE} bodů.`)}
                    ${rule('zap', 'Špatná odpověď řetěz přetrhne a hra končí. Hraje se jen jednou za den.')}
                    ${rule('shield-check', 'Jednou za hru můžeš použít Záchranu: místo špatné odpovědi dostaneš jinou otázku na stejný článek, ale za 0 bodů.')}
                </ul>
                <div class="mt-auto flex flex-col gap-1.5 pt-1">
                    <button type="button" data-action="chain-start" class="${PRIMARY}"><i data-lucide="play" class="h-5 w-5"></i> Začít řetěz</button>
                </div>
            </div>`;
    };
    // Načítání: řetěz se skládá (data témat a výpočet řetězu)
    const loadingHtml = (h, text = 'Skládám dnešní řetěz…') => `
        <div id="chain-loading" class="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center dark:bg-slate-900">
            ${h.uiArt(ART.intro, 'h-20 w-20')}
            <div class="chain-loading w-48" aria-hidden="true">${linkSvg(['done', 'done', 'done', 'done', 'done', 'done', 'done'])}</div>
            <p role="status" class="text-sm font-bold text-slate-600 dark:text-slate-300">${esc(text)}</p>
        </div>`;

    // Cesta nad otázkou: „Eiffelova věž → Paříž → Francie“; poslední uzel je začátek otázky
    const pathHtml = (names, { fresh = false } = {}) => `
        <ol data-chain-path aria-label="Cesta řetězu" class="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-[12px] font-bold leading-tight">
            ${names.map((name, i) => {
        const last = i === names.length - 1;
        return `${i ? '<li aria-hidden="true" class="text-gold-300/80">→</li>' : ''}<li data-chain-node="${i}" class="${last ? `rounded-lg bg-gold-300 px-1.5 py-0.5 font-black text-gold-950 shadow-sm${fresh ? ' chain-node-in' : ''}` : 'rounded-lg bg-white/10 px-1.5 py-0.5 text-gold-100'}">${esc(name)}</li>`;
    }).join('')}
        </ol>`;
    // Vodoznak v kartě otázky: dva velké zlaté články v rohu (jen ozdoba)
    const WATERMARK = '<svg aria-hidden="true" viewBox="0 0 120 70" class="chain-watermark pointer-events-none absolute -bottom-3 -right-4 h-24 w-40"><rect x="6" y="14" width="70" height="40" rx="20"/><rect x="48" y="27" width="66" height="14" rx="7"/></svg>';
    const rescueChip = (attempt) => (attempt.rescueUsed
        ? '<span data-chain-rescue="used" class="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 dark:text-slate-400 dark:ring-slate-700"><i data-lucide="shield-check" class="h-3.5 w-3.5"></i> Záchrana použita</span>'
        : '<span data-chain-rescue="ready" class="flex shrink-0 items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-black text-gold-900 ring-1 ring-gold-300 dark:bg-gold-900/60 dark:text-gold-100 dark:ring-gold-700"><i data-lucide="shield-check" class="h-3.5 w-3.5"></i> Záchrana</span>');
    // Obrazovka hry: view = { practice, attempt, ask (otázka na obrazovce), phase ('ask' | 'right' | 'wrong' | 'decide' | 'broken'), fresh (článek, který zacvakl) }
    const playHtml = (view) => {
        const { attempt, ask } = view;
        const summary = summaryOf(attempt);
        const k = ask ? ask.k : Math.min(LINKS, summary.links + 1);
        const rescue = ask && ask.rescue;
        const source = rescue || (ask ? ask.question : null);
        const names = [attempt.chain.start.name, ...attempt.results.filter(row => row.correct).map(row => attempt.chain.questions[row.k - 1].to.name)];
        const header = view.practice ? 'Cvičná řetězovka' : `Řetězovka dne · ${formatDay(attempt.day)}`;
        const status = view.practice ? `${summary.links}/${LINKS} článků` : `${summary.links}/${LINKS} · ${pointsWord(summary.score)}`;
        const options = source ? source.options.map((option, index) => `
            <button type="button" data-action="chain-choice" data-id="${esc(option.id)}" data-index="${index}" class="chain-option btn-3d-light flex min-h-[3.25rem] w-full shrink-0 items-center justify-center rounded-2xl bg-white px-3 py-2 text-center text-[16px] font-bold leading-tight text-slate-800 short:min-h-[2.75rem] short:py-1.5 short:text-[15px] dark:bg-slate-800 dark:text-slate-100">${esc(option.name)}</button>`).join('') : '';
        return `
            <div id="chain-screen" data-chain-phase="${esc(view.phase)}" class="flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 pb-4 short:gap-2 dark:bg-slate-900">
                <div class="${HERO} shrink-0 px-3 pb-2.5 pt-2">
                    <div class="flex items-center justify-between gap-2">
                        <p class="min-w-0 text-[11px] font-black uppercase tracking-widest text-gold-200">${esc(header)}</p>
                        <p data-chain-status class="shrink-0 text-right text-[12px] font-black leading-tight text-white">${esc(status)}</p>
                    </div>
                    <div data-chain-strip class="mt-1${view.panel ? ' chain-still' : ''}">${linkSvg(stripStates(attempt, view), { fresh: view.fresh ?? -1, label: stripLabel(attempt) })}</div>
                    ${pathHtml(names, { fresh: view.fresh >= 0 })}
                </div>
                <section id="chain-question" class="chain-card relative flex min-h-[6rem] flex-1 flex-col gap-1.5 overflow-hidden rounded-[1.4rem] bg-white p-3 shadow-sm ring-1 ${rescue ? 'ring-2 ring-gold-500 dark:ring-gold-400' : 'ring-slate-200/70 dark:ring-slate-700/70'} dark:bg-slate-800/70">
                    <div class="flex items-center justify-between gap-2">
                        <p class="flex min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-widest ${rescue ? 'text-gold-800 dark:text-gold-300' : 'text-slate-500 dark:text-slate-400'}">
                            <i data-lucide="${rescue ? 'shield-check' : iconFor(source ? source.from.kind : '')}" class="h-3.5 w-3.5 shrink-0"></i>
                            <span>${rescue ? 'Záchrana · za 0 bodů' : view.practice ? `Článek ${k}` : `Článek ${k} · za ${pointsWord(k)}`}</span>
                        </p>
                        ${rescue ? '' : rescueChip(attempt)}
                    </div>
                    <div class="relative flex flex-1 items-center"><h2 data-chain-text class="text-[18px] font-black leading-snug text-slate-900 short:text-[16.5px] dark:text-white">${esc(source ? source.text : '')}</h2></div>
                    ${WATERMARK}
                </section>
                <div id="chain-options" class="flex shrink-0 flex-col gap-2 short:gap-1.5">${options}</div>
                <div id="chain-panel" class="hidden shrink-0"></div>
            </div>`;
    };
    // Panel po špatné odpovědi: rozhodnutí o Záchraně, nebo přetržený řetěz se správnou odpovědí
    const decideHtml = ({ chosenName, practice }) => `
        <div data-chain-decide role="alert" class="chain-panel-in flex flex-col gap-2 rounded-[1.4rem] bg-white p-3 shadow-sm ring-2 ring-rose-300 dark:bg-slate-800 dark:ring-rose-700">
            <p class="flex items-center gap-2 text-base font-black text-rose-700 dark:text-rose-300"><i data-lucide="zap" class="h-5 w-5"></i> Řetěz praská!</p>
            <p class="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">„${esc(chosenName)}“ to není. Máš ale jednu Záchranu: dostaneš jinou otázku na stejný článek. Když ji zodpovíš, řetěz drží dál${practice ? '' : ', článek je ale za 0 bodů'}.</p>
            <button type="button" data-action="chain-rescue" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gold-700 px-4 py-3 text-base font-black text-white"><i data-lucide="shield-check" class="h-5 w-5"></i> Použít Záchranu</button>
            <button type="button" data-action="chain-giveup" class="${SECONDARY} w-full"><i data-lucide="x" class="h-4 w-4 shrink-0"></i> Ukončit řetěz</button>
        </div>`;
    const brokenHtml = ({ correctName, k, practice }) => `
        <div data-chain-broken role="alert" class="chain-panel-in flex flex-col gap-2 rounded-[1.4rem] bg-white p-3 shadow-sm ring-2 ring-rose-300 dark:bg-slate-800 dark:ring-rose-700">
            <p class="flex items-center gap-2 text-base font-black text-rose-700 dark:text-rose-300"><i data-lucide="zap" class="h-5 w-5"></i> Řetěz se přetrhl na ${k}. článku</p>
            <p class="text-[13.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200">Správně bylo: <b class="text-slate-900 dark:text-white">${esc(correctName)}</b></p>
            <button type="button" data-action="chain-result" class="${PRIMARY}"><i data-lucide="list-ordered" class="h-5 w-5"></i> ${practice ? 'Celý řetěz' : 'Výsledek'}</button>
        </div>`;

    // Výsledek: řetěz, body, sdílení, pořadí dne (přihlášený) a cvičná řetězovka
    const resultRows = (attempt) => {
        const rows = attempt.chain.questions.map((question, i) => {
            const row = attempt.results.find(entry => entry.k === i + 1);
            const state = row ? (row.correct ? (row.rescued ? 'rescued' : 'done') : 'broken') : 'todo';
            const points = !row ? '' : row.correct ? (row.rescued ? 'Záchrana' : `+${row.points}`) : '💥';
            const tone = state === 'broken' ? 'text-rose-700 dark:text-rose-300' : state === 'todo' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100';
            const label = `${i + 1}. článek: ${question.to.name}${state === 'broken' ? ', tady se řetěz přetrhl' : state === 'todo' ? ', nedohráno' : state === 'rescued' ? ', Záchrana' : `, ${pointsWord(row.points)}`}`;
            return `<li><button type="button" data-action="chain-step" data-k="${i + 1}" aria-label="${esc(label)}" class="flex min-h-[1.9rem] w-full items-center gap-2 rounded-xl px-1.5 text-left short:min-h-[1.75rem]">
                <span aria-hidden="true" class="chain-dot chain-dot-${state} flex h-[1.4rem] w-[1.4rem] shrink-0 items-center justify-center rounded-full text-[11px] font-black">${i + 1}</span>
                <span class="min-w-0 flex-1 text-[13.5px] font-bold leading-tight ${tone}">${esc(question.to.name)}</span>
                <span aria-hidden="true" class="shrink-0 text-[12px] font-black ${state === 'rescued' ? 'text-gold-800 dark:text-gold-300' : state === 'done' ? 'text-emerald-700 dark:text-emerald-300' : tone}">${esc(points)}</span>
            </button></li>`;
        });
        return `<ol data-chain-rows class="flex flex-col">
            <li class="flex min-h-[1.75rem] items-center gap-2 px-1.5"><span aria-hidden="true" class="flex h-[1.4rem] w-[1.4rem] shrink-0 items-center justify-center rounded-full bg-gold-200 text-gold-900 dark:bg-gold-800 dark:text-gold-100"><i data-lucide="flag" class="h-3 w-3"></i></span><span class="min-w-0 flex-1 text-[13.5px] font-bold leading-tight text-slate-600 dark:text-slate-300">${esc(attempt.chain.start.name)}</span><span class="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">začátek</span></li>
            ${rows.join('')}
        </ol>`;
    };
    // Pořadí dne: stats = null (načítá se), false (nedostupné), { players, full_pct, best, me } – podrobné pořadí v okně (chain-ranking)
    const statsHtml = ({ stats, guest, canLogin }) => {
        let body;
        if (guest) {
            body = `<p class="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${canLogin ? 'Po přihlášení uvidíš své pořadí dne a kolik hráčů dalo celý řetěz.' : 'Pořadí dne je jen pro přihlášené hráče.'}</p>${canLogin ? `<button type="button" data-action="chain-login" class="${SECONDARY} shrink-0"><i data-lucide="log-in" class="h-4 w-4"></i> Přihlásit se</button>` : ''}`;
        } else if (stats === null || stats === undefined) body = '<p class="min-w-0 flex-1 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Načítám pořadí dne…</p>';
        else if (stats === false) body = '<p class="min-w-0 flex-1 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Pořadí dne teď není k dispozici.</p>';
        else {
            const me = stats.me && stats.me.rank ? `<b class="text-slate-900 dark:text-white">${stats.me.rank}. místo</b> z ${stats.players}` : esc(playersWord(stats.players));
            body = `<p data-chain-community class="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200">${me} · celý řetěz dalo ${stats.full_pct} % · nejlepší ${esc(pointsWord(stats.best))}</p>
                <button type="button" data-action="chain-ranking" class="${SECONDARY} shrink-0"><i data-lucide="list-ordered" class="h-4 w-4"></i> Pořadí</button>`;
        }
        return `<section id="chain-stats" class="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">${body}</section>`;
    };
    // view = { attempt, practice, xp, stats, guest, canLogin, pending (výsledek čeká na odeslání) }
    const resultHtml = (view, h) => {
        const { attempt } = view;
        const summary = summaryOf(attempt);
        const kicker = view.practice ? 'Cvičná řetězovka' : `Řetězovka dne · ${formatDay(attempt.day)}`;
        const headline = view.practice ? `${summary.links}/${LINKS} článků` : pointsWord(summary.score);
        const detail = view.practice ? (summary.full ? 'Celý řetěz!' : 'Řetěz se přetrhl') : `${summary.links}/${LINKS} článků${summary.rescued ? ' · se Záchranou' : ''}`;
        const round = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 transition-transform active:scale-95';
        return `
            <div id="chain-result" data-chain-full="${summary.full}" class="fade-in flex min-h-full w-full flex-col gap-2 bg-slate-50 p-3 pb-4 dark:bg-slate-900">
                <div class="${HERO} shrink-0 px-3 pb-2 pt-2">
                    <div class="flex items-center gap-2.5">
                        ${h.uiArt(summary.full ? ART.full : summary.links >= 3 ? `sova-${poseFor(summary)}` : ART.broken, 'h-14 w-14 -my-1 short:h-12 short:w-12')}
                        <div class="min-w-0 flex-1">
                            <p class="text-[11px] font-black uppercase tracking-widest text-gold-200">${esc(kicker)}</p>
                            <p data-chain-score class="text-[26px] font-black leading-tight short:text-[23px]">${esc(headline)}</p>
                            <p class="text-[12.5px] font-bold leading-tight text-gold-100">${esc(detail)}</p>
                        </div>
                        ${view.practice ? '' : `<div class="flex shrink-0 flex-col gap-1.5">
                            <button type="button" data-action="chain-share" aria-label="Sdílet výsledek" title="Sdílet výsledek" class="${round}"><i data-lucide="share-2" class="h-4 w-4"></i></button>
                            <button type="button" data-action="chain-share-image" aria-label="Sdílet obrázek" title="Sdílet obrázek" class="${round}"><i data-lucide="image" class="h-4 w-4"></i></button>
                        </div>`}
                    </div>
                    <div class="mt-1.5">${linkSvg(stripStates(attempt, { phase: 'result' }), { label: stripLabel(attempt) })}</div>
                    ${view.xp ? h.xpLine(view.xp) : ''}
                    ${view.pending ? '<p class="mt-1 text-[12px] font-semibold text-gold-100">Výsledek čeká na odeslání, zkusím to znovu.</p>' : ''}
                </div>
                <section class="shrink-0 rounded-[1.4rem] bg-white p-1 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70" aria-label="Celý řetěz">${resultRows(attempt)}</section>
                ${view.practice ? '' : statsHtml(view)}
                <div class="mt-auto grid shrink-0 grid-cols-2 gap-2">
                    <button type="button" data-action="chain-practice" class="${SECONDARY} py-3"><i data-lucide="repeat" class="h-4 w-4 shrink-0"></i> ${view.practice ? 'Další cvičná' : 'Cvičná řetězovka'}</button>
                    <button type="button" data-action="chain-home" class="flex min-w-0 items-center justify-center gap-1.5 rounded-2xl btn-3d bg-brand-700 px-2 py-3 text-sm font-black text-white"><i data-lucide="house" class="h-4 w-4 shrink-0"></i> Zpět domů</button>
                </div>
            </div>`;
    };
    // Okno s článkem (klepnutí na řádek výsledku): otázka, možnosti, správná odpověď a co hráč zvolil
    const stepHtml = (attempt, k) => {
        const question = attempt.chain.questions[k - 1];
        const row = attempt.results.find(entry => entry.k === k);
        if (!question) return '';
        const correct = question.options[question.answer];
        const chosen = row && !row.rescued && row.chosen ? row.chosen : attempt.pending && attempt.pending.k === k ? attempt.pending.chosen : '';
        const wrongPick = row && !row.correct && !row.rescued ? row.chosen : '';
        const option = (item) => {
            const right = item.id === correct.id;
            const wrong = item.id === (wrongPick || (row && row.rescued ? '' : chosen && chosen !== correct.id ? chosen : ''));
            return `<li class="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[14px] font-bold ${right ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-700' : wrong ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-700' : 'text-slate-700 dark:text-slate-200'}"><i data-lucide="${right ? 'check' : wrong ? 'x' : 'minus'}" class="h-4 w-4 shrink-0"></i>${esc(item.name)}</li>`;
        };
        const verdict = !row ? 'Na tenhle článek už nedošlo.' : row.rescued ? (row.correct ? 'Zachráněno Záchranou, za 0 bodů.' : 'Záchrana nevyšla, tady se řetěz přetrhl.') : row.correct ? `Správně, ${pointsWord(row.points)}.` : 'Tady se řetěz přetrhl.';
        return `
            <div data-chain-step="${k}" class="flex flex-col gap-2.5">
                <p class="${LABEL}">${esc(question.from.name)} → ${esc(question.to.name)}</p>
                <p class="text-[16px] font-black leading-snug text-slate-900 dark:text-white">${esc(question.text)}</p>
                <ul class="flex flex-col gap-1">${question.options.map(option).join('')}</ul>
                <p class="text-[13px] font-semibold text-slate-600 dark:text-slate-300">${esc(verdict)}</p>
                <button type="button" data-close class="${PRIMARY}">Zavřít</button>
            </div>`;
    };
    // Okno s pořadím dne (nejlepší hráči a moje místo)
    const rankingHtml = (stats, h) => {
        if (!stats || !Array.isArray(stats.top)) return '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Pořadí se nepodařilo načíst.</p>';
        const row = (entry) => `<li data-chain-row="${esc(entry.id)}" class="flex items-center gap-2 rounded-xl px-1.5 py-1 ${entry.me ? 'bg-gold-50 ring-1 ring-gold-300 dark:bg-gold-950/50 dark:ring-gold-700' : ''}"><span class="w-6 shrink-0 text-center text-[12px] font-black text-slate-500 dark:text-slate-400">${entry.rank === 1 ? '🏆' : `${entry.rank}.`}</span>${h.avatarHtml ? h.avatarHtml(entry, 'h-7 w-7 text-sm', !entry.me) : ''}<span data-player-name class="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">${esc(entry.display_name || 'Hráč')}${entry.me ? ' (ty)' : ''}</span><span class="shrink-0 text-right text-[12px] font-black text-slate-700 dark:text-slate-200">${esc(pointsWord(entry.score))} <span class="font-bold text-slate-500 dark:text-slate-400">· ${entry.links}/${LINKS}</span></span></li>`;
        const mine = stats.me && stats.me.rank && !stats.top.some(entry => entry.me) ? `<li aria-hidden="true" class="text-center text-sm font-black leading-none text-slate-400">⋯</li>${row({ ...stats.me, ...(h.meRow || {}), me: true })}` : '';
        return `
            <div data-chain-ranking class="flex flex-col gap-2">
                <p class="text-[13px] font-semibold text-slate-600 dark:text-slate-300">${esc(playersWord(stats.players))} · celý řetěz ${stats.full_pct} % · nejlepší ${esc(pointsWord(stats.best))}</p>
                ${stats.top.length ? `<ol class="flex flex-col gap-1">${stats.top.map(row).join('')}${mine}</ol>` : '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Zatím nikdo nedohrál.</p>'}
                <button type="button" data-close class="${PRIMARY}">Zavřít</button>
            </div>`;
    };

    // --- Ovladač obrazovek (jen v prohlížeči): app.js předá pomocné funkce a napojí akce data-action="chain-…" ---
    // deps = { appContent, setScreen, getScreen, renderHome, renderIcons, updateControlsUI, closePlaceInfo, showToast, showDialog, closeDialog,
    // uiArt, specialTile, avatarHtml, xpLine, meRow, loadTopic, loadCountries, readJson, writeJson, signedUser, social, auth, startLogin,
    // shareCard, shareImageCounted, robeNow, appUrl, appName, awardXp, sound, isLoading }
    const createController = (deps) => {
        let graphPromise = null;
        let attempt = null; // hraný pokus (dnešní nebo cvičný)
        let practice = null; // cvičný pokus (jen v paměti, bez bodů a statistik)
        let busy = false;
        let opening = false;
        let stats = null; // { day, value } – pořadí dne ze serveru (null = načítá se, false = nedostupné)
        let checked = ''; // den, kdy se na úvodu ověřilo, jestli přihlášený hráč nedohrál jinde
        const timers = new Set();
        const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
        const stopTimers = () => { timers.forEach(id => clearTimeout(id)); timers.clear(); };
        const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const today = () => pragueDay();
        const user = () => deps.signedUser();
        const ranked = () => Boolean(deps.social && deps.social.chainSubmit && deps.auth && deps.auth.isConfigured() && user());
        const load = () => parseState(deps.readJson(KEY));
        const save = (state) => deps.writeJson(KEY, state);
        const ownerOk = (entry) => entry && (entry.owner === 'host' || (user() && entry.owner === user().id));
        // Dnešní pokus tohoto hráče (host = pokus zařízení; přihlášený si hostovský převezme)
        const todayAttempt = (state = load()) => (state.attempt && state.attempt.day === today() && ownerOk(state.attempt) ? state.attempt : null);
        const store = (entry) => {
            if (!entry || entry.practice) return;
            const state = load();
            state.attempt = entry;
            save(state);
        };
        const helpers = () => ({ uiArt: deps.uiArt, avatarHtml: deps.avatarHtml, xpLine: (xp) => deps.xpLine(xp, 'text-gold-100'), meRow: deps.meRow ? deps.meRow() : {} });
        const show = (html) => {
            deps.setScreen('chain');
            deps.closePlaceInfo();
            deps.appContent.innerHTML = html;
            deps.renderIcons(deps.appContent);
            deps.appContent.scrollTo(0, 0);
            deps.updateControlsUI();
        };

        // Graf ze všech témat řetězu (načte se jednou za spuštění aplikace)
        const graph = () => {
            if (!graphPromise) {
                graphPromise = Promise.all([Promise.all(SOURCES.map(id => deps.loadTopic(id))), deps.loadCountries()])
                    .then(([contexts, countries]) => buildGraph(Object.fromEntries(contexts.map((ctx, i) => [SOURCES[i], ctx.items])), countries))
                    .catch(error => { graphPromise = null; throw error; });
            }
            return graphPromise;
        };
        // Řetěz dne: jednou spočítaný se pamatuje (cache), ať se při každém otevření nepočítá znovu
        const dayChain = async (day) => {
            const state = load();
            if (state.cache && state.cache.day === day) { const cached = cleanChain(state.cache.chain); if (cached) return cached; }
            const built = await graph();
            // Výpočet chvíli trvá: nejdřív se nechá vykreslit načítání
            await new Promise(resolve => setTimeout(resolve, 30));
            const chain = dailyChain(built, day);
            if (!chain) throw new Error('Řetěz dne se nepodařilo sestavit');
            const fresh = load();
            fresh.cache = { day, chain };
            save(fresh);
            return chain;
        };

        // --- Úvod ---
        const homeView = () => {
            const entry = todayAttempt();
            if (!entry) {
                const server = stats && stats.day === today() && stats.value && stats.value.me;
                if (server) return { status: 'done', summary: { links: server.links, score: server.score }, rank: server.rank || null };
                return { status: 'new' };
            }
            const summary = summaryOf(entry);
            if (entry.done) return { status: 'done', summary, rank: entry.rank ? entry.rank.rank : null };
            return { status: entry.results.length || entry.pending ? 'progress' : 'new', step: nextLink(entry) };
        };
        const homeTileHtml = () => {
            const view = homeView();
            const tile = homeTile(view);
            return deps.specialTile({ id: 'chain-card', action: 'chain-open', art: ART.tile, title: 'Řetězovka', text: tile.text, label: tile.label,
                ring: 'ring-brand-300/70 dark:ring-brand-500/50', dot: tile.fresh ? 'data-chain-new' : '', attrs: `data-chain-status="${view.status}"` });
        };
        const paintTile = () => {
            const tile = document.getElementById('chain-card');
            if (!tile || deps.getScreen() !== 'home') return;
            tile.outerHTML = homeTileHtml();
            deps.renderIcons(deps.appContent);
        };
        // Přihlášený hráč bez dnešního pokusu v zařízení: nedohrál Řetězovku jinde? (jednou za den a spuštění)
        const refresh = async () => {
            if (!ranked() || todayAttempt() || checked === today()) return;
            checked = today();
            await loadStats(today());
            paintTile();
        };

        // --- Statistiky dne ---
        const loadStats = async (day) => {
            if (!ranked() || !deps.social.chainDayStats) return null;
            stats = { day, value: null };
            const value = await deps.social.chainDayStats(day).catch(() => false);
            stats = { day, value: value || false };
            return stats.value;
        };
        // Odeslání výsledku (jednou; server přijme jen první výsledek dne)
        const submit = async (entry) => {
            if (!entry || entry.practice || entry.synced || !ranked() || entry.owner !== user().id) return;
            const summary = summaryOf(entry);
            try {
                const saved = await deps.social.chainSubmit(entry.day, summary.links, summary.score, summary.rescued);
                if (saved === null) return; // databáze Řetězovku nezná
                entry.synced = true;
                store(entry);
            } catch (error) { /* bez spojení: zkusí se při dalším otevření */ }
        };

        // --- Otevření ---
        const open = async () => {
            if (opening || deps.isLoading()) return;
            opening = true;
            stopTimers();
            try {
                practice = null;
                const day = today();
                let entry = todayAttempt();
                if (entry && user() && entry.owner === 'host') { entry.owner = user().id; entry.synced = false; store(entry); }
                if (entry && entry.done) { attempt = entry; finish(); return; }
                show(loadingHtml(helpers()));
                // Přihlášený: dohrál Řetězovku dnes jinde? Pak se ukáže jen výsledek ze serveru
                if (!entry && ranked()) {
                    const value = await Promise.race([loadStats(day), new Promise(resolve => setTimeout(() => resolve(undefined), 6000))]);
                    if (value && value.me) {
                        const chain = await dayChain(day);
                        attempt = fromServer(day, chain, value.me);
                        store(attempt);
                        if (deps.getScreen() === 'chain') renderResult();
                        return;
                    }
                }
                let chain;
                try { chain = entry ? entry.chain : await dayChain(day); } catch (error) {
                    console.error(error);
                    if (deps.getScreen() === 'chain') { deps.showToast('Řetězovku se teď nepodařilo načíst. Zkus to za chvíli.'); deps.renderHome(); }
                    return;
                }
                if (deps.getScreen() !== 'chain') return;
                attempt = entry || newAttempt(day, user() ? user().id : 'host', chain);
                if (!entry && !load().intro) { show(introHtml({ day }, helpers())); return; }
                start();
            } finally {
                opening = false;
            }
        };
        // Výsledek dohraný na jiném zařízení: známe jen počet článků, body a Záchranu – články se doplní podle nich
        const fromServer = (day, chain, me) => {
            const entry = newAttempt(day, user().id, chain);
            const links = Math.max(0, Math.min(LINKS, me.links || 0));
            const rescuedAt = me.rescued ? triangle(links) - (me.score || 0) : 0;
            for (let k = 1; k <= links; k++) entry.results.push({ k, correct: true, rescued: k === rescuedAt, points: k === rescuedAt ? 0 : k, chosen: '' });
            if (links < LINKS) entry.results.push({ k: links + 1, correct: false, rescued: Boolean(me.rescued) && !rescuedAt, points: 0, chosen: '' });
            entry.rescueUsed = Boolean(me.rescued);
            entry.done = true;
            entry.synced = true;
            entry.xp = null;
            entry.rank = me.rank ? { rank: me.rank, players: stats && stats.value ? stats.value.players : 0 } : null;
            return entry;
        };
        // Začátek dnešní hry: pokus se uloží hned (jeden pokus za den)
        const start = () => {
            if (!attempt) return;
            const state = load();
            if (!state.intro) { state.intro = true; save(state); }
            store(attempt);
            // Rozehraná hra s nerozhodnutou Záchranou (aplikace se zavřela po špatné odpovědi): rozhodnutí čeká dál
            if (attempt.pending && attempt.pending.phase === 'decide') {
                const ask = currentAsk(attempt);
                const chosen = ask.question.options.find(option => option.id === attempt.pending.chosen);
                renderPlay({ phase: 'decide', ask, marks: { chosen: attempt.pending.chosen, right: false }, panel: decideHtml({ chosenName: chosen ? chosen.name : '', practice: attempt.practice }) });
                return;
            }
            renderPlay({ phase: 'ask' });
        };
        const startPractice = async () => {
            if (opening || busy) return;
            stopTimers();
            show(loadingHtml(helpers(), 'Skládám cvičný řetěz…'));
            let built;
            try { built = await graph(); } catch (error) { deps.showToast('Cvičnou řetězovku se teď nepodařilo načíst.'); deps.renderHome(); return; }
            await new Promise(resolve => setTimeout(resolve, 30));
            const chain = practiceChain(built, `${Date.now()}-${Math.random()}`);
            if (deps.getScreen() !== 'chain') return;
            if (!chain) { deps.showToast('Cvičný řetěz se nepodařilo sestavit.'); deps.renderHome(); return; }
            practice = newAttempt(today(), 'host', chain, true);
            attempt = practice;
            renderPlay({ phase: 'ask' });
        };

        // --- Hra ---
        // Cesta nad otázkou smí mít nejvýš dva řádky: starší uzly se schovají za „…“
        const fitPath = () => {
            const path = deps.appContent.querySelector('[data-chain-path]');
            if (!path) return;
            const chips = [...path.querySelectorAll('[data-chain-node]')];
            // Výška řádku podle prvního uzlu (poslední může právě naskakovat ve zmenšené animaci)
            const lineHeight = chips.length ? chips[0].offsetHeight : 0;
            if (!lineHeight) return;
            const limit = lineHeight * 2 + 6;
            let hidden = 0;
            while (path.getBoundingClientRect().height > limit && hidden < chips.length - 1) {
                chips[hidden].classList.add('hidden');
                const arrow = chips[hidden].nextElementSibling;
                if (arrow && arrow.getAttribute('aria-hidden') === 'true') arrow.classList.add('hidden');
                hidden += 1;
                if (hidden === 1) path.insertAdjacentHTML('afterbegin', '<li data-chain-more class="text-gold-200">…<span class="sr-only"> starší články</span></li><li aria-hidden="true" class="text-gold-300/80">→</li>');
            }
        };
        const renderPlay = (view) => {
            if (!attempt) return;
            // Otázka na obrazovce: po odpovědi ta zodpovězená (view.ask), jinak další v řadě
            const ask = view.ask || (attempt.done ? null : currentAsk(attempt));
            const full = { practice: Boolean(attempt.practice), attempt, fresh: -1, ...view, ask };
            deps.setScreen('chain');
            deps.closePlaceInfo();
            deps.appContent.innerHTML = playHtml(full, helpers());
            const panel = deps.appContent.querySelector('#chain-panel');
            const options = deps.appContent.querySelector('#chain-options');
            const marks = view.marks;
            if (marks) {
                options.querySelectorAll('[data-action="chain-choice"]').forEach(button => {
                    button.disabled = true;
                    const id = button.dataset.id;
                    if (id === marks.chosen) button.classList.add(marks.right ? 'chain-right' : 'chain-wrong');
                    else if (marks.reveal && id === marks.reveal) button.classList.add('chain-reveal');
                    else button.classList.add('chain-dim');
                });
            }
            if (view.panel) {
                options.classList.add('hidden');
                panel.classList.remove('hidden');
                panel.innerHTML = view.panel;
            }
            if (view.shake) {
                const card = deps.appContent.querySelector('#chain-question');
                if (card) card.classList.add('chain-shake');
            }
            if (view.gain) {
                const status = deps.appContent.querySelector('[data-chain-status]');
                if (status) status.insertAdjacentHTML('beforeend', `<span aria-hidden="true" class="chain-plus">+${view.gain}</span>`);
            }
            deps.renderIcons(deps.appContent);
            fitPath();
            deps.appContent.scrollTo(0, 0);
            deps.updateControlsUI();
            if (!marks && !view.panel) {
                const first = deps.appContent.querySelector('[data-action="chain-choice"]');
                if (first && view.focus) first.focus({ preventScroll: true });
            }
        };
        const optionName = (ask, id) => {
            const list = ask.rescue ? ask.rescue.options : ask.question.options;
            const option = list.find(entry => entry.id === id);
            return option ? option.name : '';
        };
        const choose = (id) => {
            if (busy || !attempt || attempt.done || deps.getScreen() !== 'chain') return;
            const ask = currentAsk(attempt);
            if (!ask || (attempt.pending && attempt.pending.phase === 'decide')) return;
            const { attempt: next, outcome } = answer(attempt, id);
            if (!outcome) return;
            attempt = next;
            store(attempt);
            busy = true;
            const pause = (ms) => (calm() ? Math.min(ms, 350) : ms);
            const correctId = ask.rescue ? ask.rescue.options[ask.rescue.answer].id : ask.question.options[ask.question.answer].id;
            // Hráč mezitím odešel (Domů): obrazovka se už nepřekreslí, pokus je uložený a pokračuje se při dalším otevření
            const here = (fn) => () => { busy = false; if (deps.getScreen() === 'chain') fn(); };
            if (outcome === 'right' || outcome === 'saved') {
                if (deps.sound) deps.sound.play('correct');
                // Zachráněný článek: řetěz pokračuje ze správné odpovědi původní otázky (objeví se v cestě)
                renderPlay({ phase: 'right', ask, marks: { chosen: id, right: true }, fresh: ask.k - 1, gain: outcome === 'right' && !attempt.practice ? ask.k : 0 });
                later(here(() => { if (attempt.done) finish(); else renderPlay({ phase: 'ask', focus: true }); }), pause(1150));
                return;
            }
            if (deps.sound) { deps.sound.play('wrong'); deps.sound.vibrate('wrong'); }
            if (outcome === 'decide') {
                renderPlay({ phase: 'wrong', ask, marks: { chosen: id, right: false }, shake: true });
                later(here(() => renderPlay({ phase: 'decide', ask, panel: decideHtml({ chosenName: optionName(ask, id), practice: attempt.practice }) })), pause(900));
                return;
            }
            // Přetržený řetěz: správná odpověď (u záchrany ta záchranné otázky) se ukáže
            renderPlay({ phase: 'broken', ask, marks: { chosen: id, right: false, reveal: correctId }, shake: true });
            later(here(() => renderPlay({ phase: 'broken', ask, panel: brokenHtml({ correctName: optionName(ask, correctId), k: ask.k, practice: attempt.practice }) })), pause(1400));
        };
        const rescue = () => {
            if (busy || !attempt || !attempt.pending || attempt.pending.phase !== 'decide') return;
            attempt = useRescue(attempt);
            store(attempt);
            renderPlay({ phase: 'ask', focus: true });
        };
        const stop = () => {
            if (busy || !attempt || !attempt.pending || attempt.pending.phase !== 'decide') return;
            const ask = currentAsk(attempt);
            const question = ask.question;
            attempt = giveUp(attempt);
            store(attempt);
            renderPlay({ phase: 'broken', ask, panel: brokenHtml({ correctName: question.options[question.answer].name, k: ask.k, practice: attempt.practice }) });
        };

        // --- Konec a výsledek ---
        const awardOnce = (entry) => {
            if (entry.practice || entry.xp) return;
            const state = load();
            const summary = summaryOf(entry);
            const record = state.days[entry.day];
            if (record && record.xp) return;
            entry.xp = xpFor(summary);
            state.days[entry.day] = { links: summary.links, score: summary.score, rescued: summary.rescued, xp: true };
            state.attempt = entry;
            save(state);
            if (deps.awardXp) deps.awardXp(entry.xp, summary);
        };
        const finish = () => {
            if (!attempt) return;
            if (!attempt.practice) {
                const state = load();
                const summary = summaryOf(attempt);
                if (!state.days[attempt.day]) { state.days[attempt.day] = { links: summary.links, score: summary.score, rescued: summary.rescued, xp: Boolean(attempt.xp) }; save(state); }
                awardOnce(attempt);
            }
            renderResult();
            if (!attempt.practice) settle(attempt);
        };
        const settle = async (entry) => {
            if (!ranked() || entry.owner !== user().id) return;
            await submit(entry);
            const value = await loadStats(entry.day);
            if (value && value.me && value.me.rank) { entry.rank = { rank: value.me.rank, players: value.players }; store(entry); }
            if (attempt === entry && deps.getScreen() === 'chain' && deps.appContent.querySelector('#chain-result')) renderResult();
        };
        const resultView = () => {
            const entry = attempt;
            const guest = !ranked();
            const value = stats && stats.day === entry.day ? stats.value : null;
            return { attempt: entry, practice: Boolean(entry.practice), xp: entry.xp, stats: value, guest, canLogin: Boolean(deps.auth && deps.auth.isConfigured() && deps.social) && !user(),
                pending: !entry.practice && ranked() && entry.owner === user().id && !entry.synced && value !== null };
        };
        const renderResult = () => {
            if (!attempt) return;
            stopTimers();
            busy = false;
            const keep = deps.getScreen() === 'chain' && deps.appContent.querySelector('#chain-result') ? deps.appContent.scrollTop : 0;
            show(resultHtml(resultView(), helpers()));
            deps.appContent.scrollTo(0, keep);
            if (!attempt.practice && deps.shareCard) deps.shareCard.prepare(cardFor(attempt), deps.shareCard.fileName('retezovka', attempt.day));
        };
        const cardFor = (entry) => cardInput({ day: entry.day, attempt: entry, rank: entry.rank, robe: deps.robeNow(), url: deps.appUrl(), appName: deps.appName });
        const share = () => {
            if (!attempt || attempt.practice || !deps.shareCard) return;
            deps.shareCard.shareText({ text: shareText({ appName: deps.appName, day: attempt.day, attempt, url: deps.appUrl() }) }, { toast: deps.showToast, copied: 'Výsledek je zkopírovaný ve schránce' });
        };
        const shareImage = () => {
            if (!attempt || attempt.practice || !deps.shareCard) return;
            deps.shareImageCounted(cardFor(attempt), { name: deps.shareCard.fileName('retezovka', attempt.day), text: shareText({ appName: deps.appName, day: attempt.day, attempt, url: deps.appUrl() }), toast: deps.showToast });
        };
        const openStep = (k) => {
            if (!attempt) return;
            const html = stepHtml(attempt, k);
            if (!html) return;
            deps.showDialog(`${k}. článek`, html);
            deps.renderIcons(document.getElementById('dialog-overlay'));
        };
        const openRanking = async () => {
            if (!attempt || attempt.practice) return;
            const day = attempt.day;
            const value = stats && stats.day === day && stats.value ? stats.value : await loadStats(day);
            deps.showDialog('Pořadí dne', rankingHtml(value || null, helpers()));
            deps.renderIcons(document.getElementById('dialog-overlay'));
        };
        const leave = () => { stopTimers(); busy = false; deps.renderHome(); };
        // Popis místa v hlavičce aplikace
        const place = () => ({ icon: 'trophy', text: attempt && attempt.practice ? 'Cvičná řetězovka' : `Řetězovka · ${formatDay(attempt ? attempt.day : today())}` });

        const actions = {
            'chain-open': () => open(),
            'chain-start': () => start(),
            'chain-choice': (button) => choose(button.dataset.id),
            'chain-rescue': () => rescue(),
            'chain-giveup': () => stop(),
            'chain-result': () => finish(),
            'chain-home': () => leave(),
            'chain-share': () => share(),
            'chain-share-image': () => shareImage(),
            'chain-practice': () => startPractice(),
            'chain-step': (button) => openStep(Number(button.dataset.k)),
            'chain-ranking': () => openRanking(),
            'chain-login': () => { if (deps.startLogin) deps.startLogin(); }
        };
        return { actions, homeTile: homeTileHtml, paintTile, refresh, open, place, leave, isPlaying: () => Boolean(attempt && !attempt.done && deps.getScreen() === 'chain') };
    };

    return {
        ART, LINKS, MAX_SCORE, KEY, SOURCES, XP_PER_POINT, FULL_XP, COUNTRY_WORDS, MUSEUMS, RELATIONS, RELATION_BY_ID, FAMILY, KIND_LABEL,
        isDay, addDays, pragueDay, formatDay, pointsWord, linksWord, playersWord, hash32, seededRandom, shuffle, seedFor,
        fromCountry, inCountry, ofCountry, nationalitiesIn, buildGraph, buildQuestion, buildRescue, rescueOptions, pickDistractors, generate, dailyChain, practiceChain, edgesFrom, chainIds,
        newAttempt, nextLink, summaryOf, validSummary, currentAsk, answer, useRescue, giveUp, xpFor, shareGrid, shareText, poseFor, cardInput, parseState, cleanAttempt, cleanChain,
        iconFor, linkSvg, stripStates, homeTile, introHtml, loadingHtml, pathHtml, playHtml, decideHtml, brokenHtml, resultHtml, statsHtml, stepHtml, rankingHtml,
        createController
    };
});
