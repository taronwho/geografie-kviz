// Řetězovka: odpověď na jednu otázku je začátkem další („Které z těchto děl namaloval Jacques-Louis David?“ → Smrt Sokratova → „Ve kterém
// muzeu nebo galerii je obraz Smrt Sokratova?“ → Metropolitní muzeum umění → …). Z dat 14 témat (státy, města, stavby a slohy, hory a řeky, osobnosti všech oborů, díla a autoři,
// herci, kluby a stadiony, olympiády, panovníci a říše, prvky a tělesa a jejich objevitelé, postavy mytologie, drahokamy, plemena) a z vazeb
// z Wikidat (data/retezovka.json: rodiště, manželé, rodiče, učitelé, nástupci, pohoří, endemity, koho dílo zobrazuje) se postaví graf a z něj
// článek po článku řetěz. Každý článek je otázka se čtyřmi možnostmi (2–4 znění na vazbu): nesprávné možnosti jsou stejného druhu, vazbu
// nesplňují a nejsou si podobné jménem. Řetěz nesmí dát odpověď zadarmo (co plyne z dřívějších článků – stavba v Londýně a pak „ve kterém
// státě“ –, co bylo mezi možnostmi nebo v textu dřívější otázky, návrat k uzlu), má nejvýš dva zeměpisné skoky (odpověď stát, město, region)
// a nikdy dva po sobě, střídá obory a rozcestníky (Francie, Londýn, Louvre) se v řetězu dne do týdne neopakují.
// Řetězovka dne: 7 článků stejných pro všechny (semínko = pražský den), článek k dává k bodů (celý řetěz 28), špatná odpověď řetěz
// přetrhne, jednou za hru Záchrana (jiná otázka na stejný článek, za 0 bodů). Cvičná řetězovka: náhodný řetěz bez bodů a statistik.
// Dny před NEW_FROM staví původní generátor (chain-legacy.js), ať se řetěz dne, který už někdo hrál, nezmění.
// U otázky je fotka a krátký zakrytý úvod z Wikipedie o předchozí odpovědi (app.js chainSubject, bez sítě se hraje bez nich), po odpovědi
// jednovětné vysvětlení vazby. Čistá logika bez DOMu a sítě (graf, řetěz, body, uložený stav, sdílení) a vykreslení obrazovek jako HTML;
// app.js napojí data témat (loadTopic), server (social.js, blok „21: Řetězovka“ v supabase/schema.sql) a klepnutí.
// Testy: tests/chain.test.js, tests/e2e-chain.test.js; audit: scripts/audit-retezovka.mjs (reports/retezovka-audit.md).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = api;
    else root.MudrlantChain = api;
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';
    // Obrázky (icons/topics/<název>.webp): do dodání vlastních (docs/NOVE-MODY.md č. 212–214) stávající; vyměnit stačí tady
    const ART = {
        tile: 'retezovka', // č. 212 sova se zlatým řetězem (dlaždice na úvodu, úvod Řetězovky, tip)
        intro: 'retezovka', // č. 212
        full: 'sova-vitez', // celý řetěz
        broken: 'sova-smutek' // přetržený řetěz (články řetězu č. 213 a 214 kreslí linkSvg z icons/retez)
    };
    const LINKS = 7;
    const MAX_SCORE = LINKS * (LINKS + 1) / 2;
    const KEY = 'mudrlant.chain';
    const HISTORY_DAYS = 60;
    // Témata, ze kterých se graf staví (všechna se musí načíst, jinak by řetěz dne vyšel jinak než ostatním) a vazby z Wikidat
    // (scripts/build-retezovka.mjs), které data témat nemají (rodiště, manželé, rodiče, učitelé, nástupci, pohoří, endemity)
    const SOURCES = ['zemepis', 'architektura', 'hudba', 'literatura', 'umeni', 'film', 'sport', 'historie', 'fyzika', 'chemie', 'biologie', 'mytologie', 'geologie', 'vlajky'];
    const EXTRA_FILE = 'data/retezovka.json';
    // Od tohoto dne (pražský čas) staví řetěz dne nový generátor; dřívější dny původní (chain-legacy.js), ať řetěz dne, který už někdo hrál,
    // vyjde všem stejně i po nasazení
    const NEW_FROM = '2026-11-15';
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
        { topic: 'film', c: 'herci', kind: 'actor', many: 'herců a hereček' },
        { topic: 'sport', c: 'sportovci', kind: 'athlete', many: 'sportovců' },
        { topic: 'historie', c: 'panovnik', kind: 'ruler', many: 'panovníků' },
        { topic: 'historie', c: 'statnik', kind: 'statesman', many: 'státníků' },
        { topic: 'historie', c: 'osobnost', kind: 'figure', many: 'historických osobností' },
        { topic: 'fyzika', c: 'fyzici', kind: 'physicist', many: 'fyziků' },
        { topic: 'fyzika', c: 'astronomove', kind: 'astronomer', many: 'astronomů a kosmonautů' },
        { topic: 'chemie', c: 'chemici', kind: 'chemist', many: 'chemiků' }
    ];
    const PERSON_KINDS = new Set(PEOPLE.map(entry => entry.kind));
    const MANY = Object.fromEntries(PEOPLE.map(entry => [entry.kind, entry.many]));
    // Druh uzlu → krátký popisek
    const KIND_LABEL = {
        country: 'stát', city: 'město', region: 'region', landmark: 'stavba', peak: 'hora', range: 'pohoří', river: 'řeka', lake: 'jezero', island: 'ostrov',
        composer: 'skladatel', musician: 'hudebník', writer: 'spisovatel', artist: 'výtvarník', architect: 'architekt', director: 'režisér', actor: 'herec', athlete: 'sportovec',
        ruler: 'panovník', statesman: 'státník', figure: 'osobnost', physicist: 'fyzik', astronomer: 'astronom', chemist: 'chemik',
        band: 'kapela', music: 'hudební dílo', book: 'literární dílo', artwork: 'výtvarné dílo', film: 'film', club: 'klub', games: 'olympiáda', character: 'literární postava',
        stadium: 'stadion', realm: 'historický stát', element: 'chemický prvek', planet: 'planeta', moon: 'měsíc', body: 'vesmírné těleso', invention: 'vynález',
        myth: 'postava mytologie', gem: 'drahokam', mineral: 'nerost', period: 'geologické období', breed: 'plemeno', species: 'živočich či rostlina', style: 'architektonický sloh',
        movement: 'umělecký směr'
    };
    // Obor uzlu (řetěz má obory střídat); otázka patří k oboru odpovědi, u odpovědi stát, město nebo region k oboru otázky
    const KIND_DOMAIN = {
        landmark: 'architektura', style: 'architektura', architect: 'architektura',
        composer: 'hudba', musician: 'hudba', band: 'hudba', music: 'hudba',
        writer: 'literatura', book: 'literatura', character: 'literatura',
        artist: 'umeni', artwork: 'umeni', movement: 'umeni',
        director: 'film', actor: 'film', film: 'film',
        athlete: 'sport', club: 'sport', games: 'sport', stadium: 'sport',
        ruler: 'historie', statesman: 'historie', figure: 'historie', realm: 'historie',
        physicist: 'veda', astronomer: 'veda', chemist: 'veda', element: 'veda', planet: 'veda', moon: 'veda', body: 'veda', invention: 'veda', gem: 'veda', mineral: 'veda', period: 'veda',
        peak: 'priroda', range: 'priroda', river: 'priroda', lake: 'priroda', island: 'priroda', breed: 'priroda', species: 'priroda',
        myth: 'mytologie',
        country: 'zemepis', city: 'zemepis', region: 'zemepis'
    };
    const DOMAINS = ['architektura', 'hudba', 'literatura', 'umeni', 'film', 'sport', 'historie', 'veda', 'priroda', 'mytologie', 'zemepis'];
    // Zeměpisné uzly (rozcestníky): odpověď stát, město nebo region je „zeměpisný skok“ – nejvýš dva v řetězu a nikdy dva po sobě
    const GEO_KINDS = new Set(['country', 'city', 'region']);
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
    // Architektonické slohy (architektura slohy, klíč f.key): „postavená v gotickém slohu“
    const STYLE_IN = {
        recko: 've slohu řecké antiky', rim: 've slohu římské antiky', byzantsky: 'v byzantském slohu', islamska: 've slohu islámské architektury', romansky: 'v románském slohu',
        gotika: 'v gotickém slohu', renesance: 'v renesančním slohu', baroko: 'v barokním slohu', rokoko: 'v rokokovém slohu', klasicismus: 'v klasicistním slohu', empir: 'v empírovém slohu',
        historismus: 've slohu historismu', novogotika: 'v novogotickém slohu', novoromansky: 'v novorománském slohu', novorenesance: 'v novorenesančním slohu', novobaroko: 'v novobarokním slohu',
        novobyzantsky: 'v novobyzantském slohu', secese: 'v secesním slohu', kubismus: 'v kubistickém slohu', artdeco: 've stylu art deco', funkcionalismus: 've funkcionalistickém slohu',
        socrealismus: 've slohu socialistického realismu', brutalismus: 'v brutalistním slohu', postmodernismus: 'v postmoderním slohu', hightech: 've stylu high-tech', dekonstruktivismus: 'v dekonstruktivistickém slohu'
    };
    // Vesmírná tělesa: druh (fyzika vesmir f.kind) → druh uzlu a 4. pád („Kdo objevil planetku …?“)
    const BODY_TYPES = { planeta: ['planet', 'planetu'], 'trpasličí planeta': ['planet', 'trpasličí planetu'], 'měsíc': ['moon', 'měsíc'], planetka: ['body', 'planetku'], kometa: ['body', 'kometu'] };
    // Biologické kategorie s druhy (endemity z Wikidat)
    const SPECIES_CATEGORIES = new Set(['savci', 'ptaci', 'ryby', 'plazi', 'hmyz', 'bezobratli', 'rostliny', 'houby']);

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
    // Dvě jména se navzájem prozradí (Thorium – Thór, Polonium – Polsko): společný začátek aspoň 4 písmen
    const samePrefix = (a, b) => { const x = norm(a); const y = norm(b); return x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4); };
    const surname = (name) => String(name || '').split(/\s+/).filter(word => /^\p{Lu}/u.test(word)).pop() || '';
    const cap = (text) => (text ? text.charAt(0).toLocaleUpperCase('cs') + text.slice(1) : '');
    const low = (text) => (text && !/^\p{Lu}{2}/u.test(text) ? text.charAt(0).toLocaleLowerCase('cs') + text.slice(1) : text || '');
    const she = (node) => (node && node.sex === 'f' ? 'a' : '');

    // --- Graf ---
    // sources = { zemepis: items, architektura: items, … } (data/<téma>.json), countries = data/countries.json .countries,
    // extra = data/retezovka.json (vazby z Wikidat mezi známými položkami: rodiště, manželé, rodiče, učitelé, nástupci, pohoří, endemity)
    // Uzel: { id, kind, name, topic, q, fame (0 = nejznámější v kategorii, 1 = nejméně), sex ('f'), role, desc, continent, country, city
    // (kde uzel je: město stavby, klubu, kapely, rodiště osobnosti), … }; hrany: rel → Map(od → [k]); příchozí: k → [{ rel, from }]
    const buildGraph = (sources, countries = {}, extra = null) => {
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
                fameOf.set(`${topic}:${item.c}:${item.q}`, index / Math.max(1, counts.get(item.c)));
            });
        }
        const fame = (topic, item) => (fameOf.has(`${topic}:${item.c}:${item.q}`) ? fameOf.get(`${topic}:${item.c}:${item.q}`) : 1);
        const known = (topic, c) => itemsOf(topic).filter(item => item && item.k === 1 && item.c === c && item.n && !item.nq);
        const continentOf = (countryQ) => (countries[countryQ] && countries[countryQ].continent) || '';
        // Uzel podle jména (jen jednoznačné jméno v rámci skupiny druhů)
        const nameIndex = (kinds) => {
            const index = new Map();
            for (const kind of kinds) for (const entry of byKind.get(kind) || []) {
                const key = norm(entry.name);
                index.set(key, index.has(key) && index.get(key) !== entry ? null : entry);
            }
            return (name) => (name ? index.get(norm(name)) || null : null);
        };

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
        // Město jen podle jména (hlavní město historického státu): jednoznačné jméno
        const cityNamed = (name) => (name && cityNames.get(norm(name)) === 1 ? (byKind.get('city') || []).find(entry => norm(entry.name) === norm(name)) || null : null);
        // Slohy (architektura slohy)
        const styleByKey = new Map();
        for (const item of itemsOf('architektura').filter(entry => entry && entry.c === 'slohy' && entry.n && entry.f && STYLE_IN[entry.f.key])) {
            const node = add({ id: `style:${item.q}`, kind: 'style', name: item.n, topic: 'architektura', q: item.q, fame: item.k === 1 ? fame('architektura', item) : 0.9, key: item.f.key, year: item.f.from || 0 });
            if (node) styleByKey.set(item.f.key, node);
        }
        // Stavby (Zeměpis a Architektura; Architektura zná město, architekta a sloh)
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
            const style = a && a.f && styleByKey.get(a.f.st);
            const node = add({ id: `landmark:${q}`, kind: 'landmark', name, topic: a ? 'architektura' : 'zemepis', q, fame: fameValue, country: country.id, continent: country.continent,
                city: city ? city.id : null, cityName: a && a.f ? a.f.city || '' : '', typeWord: type, architect: a && a.f ? a.f.aq || null : null, archText: a && a.f ? a.f.arch || '' : '',
                style: style ? style.key : '', year: (a && a.f && a.f.y) || 0 });
            if (node) landmarkByName.set(norm(name), [...(landmarkByName.get(norm(name)) || []), node]);
        }
        // Hory, řeky, jezera a ostrovy v jednom státě (pohoří a řeky i ve víc státech: vazba na pohoří a soutok státy nepotřebuje)
        for (const item of ['hora', 'reka', 'jezero', 'ostrov'].flatMap(c => known('zemepis', c))) {
            if (hasBrackets(item.n) || SEA_TYPES.has(item.ty) || SKIP_PLACES.has(item.n)) continue;
            let kind = null;
            if (item.c === 'hora') kind = PEAK_TYPES[item.ty] ? 'peak' : item.ty === 'pohoří' ? 'range' : null;
            else if (item.c === 'reka' && item.ty === 'řeka') kind = 'river';
            else if (item.c === 'jezero' && item.ty === 'jezero') kind = 'lake';
            else if (item.c === 'ostrov' && item.ty === 'ostrov') kind = 'island';
            if (!kind) continue;
            const country = (item.co || []).length === 1 ? countryByQ.get(item.co[0]) : null;
            // Ostrov, který je celým státem (Island, Malta) nebo ho prozradí název, nemá smysl; řeka a pohoří bez jednoho státu jen bez vazby na stát
            if (!country && (kind === 'lake' || kind === 'island')) continue;
            const clear = country && !reveals(item.n, country.name) && !reveals(country.name, item.n);
            if (country && !clear && kind === 'island') continue;
            add({ id: `${kind}:${item.q}`, kind, name: item.n, topic: 'zemepis', q: item.q, fame: fame('zemepis', item), country: clear ? country.id : null, continent: country ? country.continent : '',
                typeWord: kind === 'peak' ? PEAK_TYPES[item.ty] : kind === 'range' ? 'pohoří' : kind === 'river' ? 'řeka' : kind === 'lake' ? 'jezero' : 'ostrov', mouthName: (item.f || {}).mouth || '',
                elev: (item.f || {}).elev || 0 });
        }
        // Regiony (Vlajky: kraje, spolkové země, státy USA) s hlavním městem ve stejném státě
        for (const item of known('vlajky', 'regiony')) {
            const country = (item.co || []).length === 1 ? countryByQ.get(item.co[0]) : null;
            const capital = country ? cityIn((item.f || {}).cap, item.co[0]) : null;
            if (!capital || hasBrackets(item.n) || reveals(item.n, capital.name) || reveals(capital.name, item.n) || norm(item.n) === norm(capital.name)) continue;
            add({ id: `region:${item.q}`, kind: 'region', name: item.n, topic: 'vlajky', q: item.q, fame: fame('vlajky', item), country: country.id, continent: country.continent, capitalCity: capital.id });
        }
        // Osobnosti (země původu podle dat; popis nesmí zmiňovat jinou národnost)
        const personByQ = new Map();
        const personByQid = new Map();
        for (const { topic, c, kind } of PEOPLE) {
            for (const item of known(topic, c)) {
                const f = item.f || {};
                const country = countryOfName(f.land);
                const mentioned = nationalitiesIn(`${item.d || ''} ${item.ty || ''}`);
                // Popis s jinou národností, než má země původu, je sporný („rakouský skladatel“ se zemí Česko): bez země
                const clear = country && (mentioned.length === 0 || mentioned.includes(country.name));
                const ownRole = /^[\p{Ll} ]+$/u.test(item.ty || '') && !nationalitiesIn(item.ty).length ? item.ty : KIND_LABEL[kind];
                const node = add({ id: `${kind}:${item.q}`, kind, name: item.n, topic, q: item.q, fame: fame(topic, item), sex: item.sx === 'f' ? 'f' : '',
                    role: ownRole, desc: item.d || '', country: clear ? country.id : null, continent: clear ? country.continent : '', nations: mentioned, born: f.born || 0, died: f.died || 0,
                    year: f.y || f.born || 0, bands: kind === 'musician' && f.band ? String(f.band).split(/,\s*/).filter(Boolean) : [], landName: f.land || '',
                    clubs: Array.isArray(f.clubs) ? f.clubs : [], sport: f.sport || '', og: Array.isArray(f.og) ? f.og : [], goldAt: Array.isArray(f.goldAt) ? f.goldAt : [],
                    films: Array.isArray(f.films) ? f.films : [], movements: (Array.isArray(f.mk) ? f.mk : []).map(norm), link: {} });
                if (!node) continue;
                personByQ.set(`${topic}:${item.q}`, node);
                if (!personByQid.has(item.q)) personByQid.set(item.q, node);
            }
        }
        // Stejná osobnost ve dvou tématech (Michelangelo: výtvarník i architekt) je v řetězu jen jednou (hlídá search podle q)
        const personNamed = nameIndex([...PERSON_KINDS]);
        // Kapely: země a město vzniku
        for (const item of known('hudba', 'kapely')) {
            const f = item.f || {};
            const country = countryOfName(f.land);
            const mentioned = nationalitiesIn(item.d);
            const clear = country && (mentioned.length === 0 || mentioned.includes(country.name));
            const city = clear ? cityIn(f.city, country.q) : null;
            const node = add({ id: `band:${item.q}`, kind: 'band', name: item.n, topic: 'hudba', q: item.q, fame: fame('hudba', item), country: clear ? country.id : null,
                continent: clear ? country.continent : '', nations: mentioned, city: city && !revealsCity(item.n, city.name) ? city.id : null, year: f.from || f.y || 0, role: 'kapela', sex: 'f',
                members: String(f.members || '').split(/,\s*/).filter(Boolean), link: {} });
            if (node) personByQ.set(`hudba:${item.q}`, node);
        }
        // Díla s autorem (autor musí být uzel; název díla nesmí autora prozradit)
        const authorNode = (topic, q) => (q ? personByQ.get(`${topic}:${q}`) || null : null);
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
            if (hasBrackets(item.n)) continue;
            const directorOk = authorFine(item.n, director) && !(Array.isArray(f.dir) && f.dir.length !== 1);
            const cast = Array.isArray(f.cast) ? f.cast : [];
            if (!directorOk && !cast.length) continue;
            add({ id: `film:${item.q}`, kind: 'film', name: item.n, topic: 'film', q: item.q, fame: fame('film', item), author: directorOk ? director.id : null, animated: item.c === 'animovane',
                cast, year: f.year || f.y || 0 });
        }
        // Umělecké směry (Umění: směry) a příslušnost výtvarníků k nim (f.mk)
        for (const item of known('umeni', 'smery')) add({ id: `movement:${item.q}`, kind: 'movement', name: item.n, topic: 'umeni', q: item.q, fame: fame('umeni', item), year: (item.f || {}).from || 0 });
        const movementNamed = nameIndex(['movement']);
        // Kluby (město sídla; název nesmí město prozradit), stadiony a olympijské hry (pořadatelské město)
        for (const item of known('sport', 'kluby')) {
            const f = item.f || {};
            const country = countryOfName(f.land);
            const city = country ? cityIn(f.city, country.q) : null;
            if (!city || revealsCity(item.n, city.name) || hasBrackets(item.n)) continue;
            if (revealsCountry(item.n, country.name)) continue;
            add({ id: `club:${item.q}`, kind: 'club', name: item.n, topic: 'sport', q: item.q, fame: fame('sport', item), city: city.id, country: country.id, continent: country.continent,
                typeWord: item.ty || '', sport: f.sport || '', arena: f.arena || '', year: f.from || 0 });
        }
        for (const item of known('sport', 'sportoviste')) {
            const f = item.f || {};
            const country = countryOfName(f.land);
            if (hasBrackets(item.n) || !Array.isArray(f.tenants) || !f.tenants.length) continue;
            add({ id: `stadium:${item.q}`, kind: 'stadium', name: item.n, topic: 'sport', q: item.q, fame: fame('sport', item), country: country ? country.id : null,
                continent: country ? country.continent : '', tenants: f.tenants, year: f.opened || f.y || 0, typeWord: item.ty || '' });
        }
        for (const item of itemsOf('sport').filter(entry => entry && entry.c === 'olympiady' && entry.n)) {
            const f = item.f || {};
            const hosts = (f.hosts || []).map(q => nodes.get(`city:${q}`)).filter(Boolean);
            if (hosts.length !== 1 || (f.hosts || []).length !== 1) continue;
            const host = hosts[0];
            add({ id: `games:${item.q}`, kind: 'games', name: item.n, topic: 'sport', q: item.q, fame: item.k === 1 ? fame('sport', item) : 0.9, city: host.id, country: host.country,
                continent: host.continent, year: f.year || 0, winter: f.type === 'Z' });
        }
        // Historické státy (Historie: říše) s hlavním městem
        const realmByName = new Map();
        for (const item of known('historie', 'rise')) {
            const f = item.f || {};
            const capital = cityNamed(f.cap);
            const node = add({ id: `realm:${item.q}`, kind: 'realm', name: item.n, topic: 'historie', q: item.q, fame: fame('historie', item), from: f.from || 0, to: f.to || 0, year: f.from || 0,
                capitalCity: capital && !reveals(item.n, capital.name) && !revealsCity(item.n, capital.name) ? capital.id : null });
            if (node) realmByName.set(norm(item.n), node);
        }
        for (const ruler of byKind.get('ruler') || []) {
            const realm = realmByName.get(norm(ruler.landName));
            if (realm && !reveals(ruler.name, realm.name)) ruler.realm = realm.id;
        }
        // Věda: prvky (objevitel), vesmírná tělesa (mateřské těleso, objevitel), vynálezy (vynálezce)
        for (const item of known('chemie', 'prvky')) {
            const f = item.f || {};
            add({ id: `element:${item.q}`, kind: 'element', name: item.n, topic: 'chemie', q: item.q, fame: fame('chemie', item), z: f.z || 0, year: f.year || 0,
                discName: f.disc && !String(f.disc).includes(',') ? f.disc : '', namedName: f.named || '' });
        }
        for (const item of known('fyzika', 'vesmir')) {
            const f = item.f || {};
            const type = BODY_TYPES[f.kind];
            if (!type || hasBrackets(item.n)) continue;
            add({ id: `${type[0]}:${item.q}`, kind: type[0], name: item.n, topic: 'fyzika', q: item.q, fame: fame('fyzika', item), typeWord: f.kind, acc: type[1], parentName: f.parent || '',
                discName: f.disc && !String(f.disc).includes(',') ? f.disc : '', year: f.year || 0 });
        }
        for (const item of known('fyzika', 'vynalezy')) {
            const f = item.f || {};
            add({ id: `invention:${item.q}`, kind: 'invention', name: item.n, topic: 'fyzika', q: item.q, fame: fame('fyzika', item), byName: f.by || '', year: f.year || 0 });
        }
        // Mytologie: postavy s rodiči a manželi (jména v datech)
        for (const c of ['recka', 'severska', 'egyptska', 'indicka', 'keltska', 'slovanska', 'orient', 'vychod', 'amerika', 'bytosti']) {
            for (const item of known('mytologie', c)) {
                const f = item.f || {};
                add({ id: `myth:${item.q}`, kind: 'myth', name: item.n, topic: 'mytologie', q: item.q, fame: fame('mytologie', item), sex: item.sx === 'f' ? 'f' : '', role: item.ty || 'postava',
                    myth: f.myk || '', father: f.fa || '', mother: f.mo || '', spouses: Array.isArray(f.sp) ? f.sp : [] });
            }
        }
        // Geologie: drahokamy (odrůda nerostu), nerosty, geologická období (nadřazené období)
        for (const item of known('geologie', 'kameny')) add({ id: `gem:${item.q}`, kind: 'gem', name: item.n, topic: 'geologie', q: item.q, fame: fame('geologie', item), parentName: (item.f || {}).par || '' });
        for (const item of known('geologie', 'nerosty')) add({ id: `mineral:${item.q}`, kind: 'mineral', name: item.n, topic: 'geologie', q: item.q, fame: fame('geologie', item) });
        for (const item of known('geologie', 'obdobi')) add({ id: `period:${item.q}`, kind: 'period', name: item.n, topic: 'geologie', q: item.q, fame: fame('geologie', item), parentName: (item.f || {}).par || '', year: -((item.f || {}).from || 0) });
        // Biologie: plemena (země původu) a druhy, které jsou endemity jednoho státu (Wikidata)
        for (const item of known('biologie', 'plemena')) {
            const f = item.f || {};
            const country = countryOfName(f.land);
            if (!country || revealsCountry(item.n, country.name) || hasBrackets(item.n)) continue;
            add({ id: `breed:${item.q}`, kind: 'breed', name: item.n, topic: 'biologie', q: item.q, fame: fame('biologie', item), country: country.id, continent: country.continent, typeWord: item.ty || 'plemeno', group: f.kind || '' });
        }
        const extraEdges = (extra && extra.edges) || {};
        const endemicOf = new Map((extraEdges.endemic || []).map(([s, c]) => [s, c]));
        for (const item of itemsOf('biologie').filter(entry => entry && entry.k === 1 && SPECIES_CATEGORIES.has(entry.c) && endemicOf.has(entry.q))) {
            const country = countryByQ.get(endemicOf.get(item.q));
            if (!country || revealsCountry(item.n, country.name) || hasBrackets(item.n)) continue;
            add({ id: `species:${item.q}`, kind: 'species', name: item.n, topic: 'biologie', q: item.q, fame: fame('biologie', item), endemic: country.id, continent: country.continent, group: item.c });
        }

        // --- Hrany ---
        const edges = new Map(RELATIONS.map(rel => [rel.id, new Map()]));
        const incoming = new Map();
        const link = (rel, from, to) => {
            if (!from || !to || from.id === to.id || from.shared || to.shared || (from.q && from.q === to.q)) return;
            const map = edges.get(rel);
            if (!map) throw new Error(`Neznámá vazba ${rel}`);
            const def = RELATION_BY_ID.get(rel);
            if (!def.from.includes(from.kind) || !def.to.includes(to.kind)) return;
            if (!map.has(from.id)) map.set(from.id, []);
            if (map.get(from.id).includes(to.id)) return;
            map.get(from.id).push(to.id);
            if (!incoming.has(to.id)) incoming.set(to.id, []);
            incoming.get(to.id).push({ rel, from: from.id });
        };
        const pair = (forward, back, a, b) => { link(forward, a, b); link(back, b, a); };
        const node = (id) => (id ? nodes.get(id) || null : null);
        // Stejně pojmenované uzly téhož druhu (Birmingham v Anglii i v USA, Pantheon v Římě i v Paříži): otázka by nebyla jednoznačná,
        // takže nejsou v řetězu ani mezi možnostmi
        const sameName = new Map();
        for (const entry of nodes.values()) { const key = `${entry.kind}|${norm(entry.name)}`; sameName.set(key, (sameName.get(key) || 0) + 1); }
        for (const entry of nodes.values()) if (sameName.get(`${entry.kind}|${norm(entry.name)}`) > 1) entry.shared = true;
        // Rodiště a místa úmrtí z Wikidat: rodiště je i „kde osobnost je“ (city) – kdo se narodil v Praze, je skoro jistě z Česka
        const personOf = (q) => personByQid.get(q) || null;
        const linkSet = (person, key, value) => { if (!person.link[key]) person.link[key] = new Set(); person.link[key].add(value); };
        for (const [p, c] of extraEdges.born || []) {
            const person = personOf(p);
            const city = nodes.get(`city:${c}`);
            if (!person || !city) continue;
            linkSet(person, 'born', city.id);
            if (!person.city) person.city = city.id;
        }
        for (const [p, c] of extraEdges.died || []) {
            const person = personOf(p);
            const city = nodes.get(`city:${c}`);
            if (person && city) linkSet(person, 'died', city.id);
        }
        for (const [a, b] of extraEdges.spouse || []) { const x = personOf(a); const y = personOf(b); if (x && y) { linkSet(x, 'spouse', y.id); linkSet(y, 'spouse', x.id); } }
        for (const [a, b] of extraEdges.parent || []) { const x = personOf(a); const y = personOf(b); if (x && y && (!x.born || !y.born || y.born > x.born + 12)) { linkSet(x, 'child', y.id); linkSet(y, 'parent', x.id); } }
        for (const [a, b] of extraEdges.teacher || []) { const x = personOf(a); const y = personOf(b); if (x && y) { linkSet(x, 'student', y.id); linkSet(y, 'teacher', x.id); } }
        for (const [a, b] of extraEdges.successor || []) { const x = personOf(a); const y = personOf(b); if (x && y) { linkSet(x, 'successor', y.id); linkSet(y, 'predecessor', x.id); } }
        // Koho zobrazuje obraz či socha (postava mytologie nebo osobnost; název díla ji nesmí prozradit: Zrození Venuše)
        for (const [a, d] of extraEdges.depicts || []) {
            const artwork = nodes.get(`artwork:${a}`);
            const target = nodes.get(`myth:${d}`) || personOf(d);
            if (!artwork || !target || reveals(artwork.name, target.name) || reveals(artwork.name, surname(target.name)) || samePrefix(artwork.name, target.name)) continue;
            artwork.depicts = [...(artwork.depicts || []), target.id];
            pair('artDepicts', 'depictedIn', artwork, target);
        }
        const rangeOf = new Map((extraEdges.range || []).map(([peak, range]) => [peak, range]));
        for (const peak of byKind.get('peak') || []) {
            const range = nodes.get(`range:${rangeOf.get(peak.q)}`);
            if (range && !reveals(peak.name, range.name) && !reveals(range.name, peak.name)) { peak.range = range.id; pair('peakRange', 'rangePeak', peak, range); }
        }

        for (const city of byKind.get('city') || []) if (city.shared) city.noLinks = true;
        for (const landmark of byKind.get('landmark') || []) {
            if (landmark.shared) continue;
            const country = node(landmark.country);
            const city = node(landmark.city);
            if (country && !revealsCountry(landmark.name, country.name) && !(city && revealsCity(landmark.name, city.name))) pair('landmarkCountry', 'countryLandmark', landmark, country);
            if (city && !revealsCity(landmark.name, city.name) && !reveals(landmark.name, landmark.cityName)) pair('landmarkCity', 'cityLandmark', landmark, city);
            const architect = landmark.architect ? personByQ.get(`architektura:${landmark.architect}`) : null;
            if (architect && architect.kind === 'architect' && !String(landmark.archText).includes(',') && !reveals(landmark.name, surname(architect.name))) pair('landmarkArchitect', 'architectLandmark', landmark, architect);
            const style = landmark.style ? styleByKey.get(landmark.style) : null;
            if (style && !reveals(landmark.name, style.name)) pair('landmarkStyle', 'styleLandmark', landmark, style);
        }
        for (const kind of ['peak', 'range', 'river', 'lake', 'island']) {
            for (const place of byKind.get(kind) || []) { const country = node(place.country); if (country) pair('natureCountry', 'countryNature', place, country); }
        }
        // Řeka, která se vlévá do jiné řeky z dat (Vltava → Labe)
        const riverNamed = nameIndex(['river']);
        for (const river of byKind.get('river') || []) {
            const into = riverNamed(river.mouthName);
            if (into && into !== river && !reveals(river.name, into.name) && !reveals(into.name, river.name)) { river.mouth = into.id; pair('riverInto', 'riverTributary', river, into); }
        }
        for (const region of byKind.get('region') || []) pair('regionCapital', 'capitalRegion', region, node(region.capitalCity));
        for (const kind of [...PERSON_KINDS, 'band']) {
            for (const person of byKind.get(kind) || []) {
                const country = node(person.country);
                if (!country || reveals(person.name, country.name)) continue;
                link('personCountry', person, country);
                if (fromCountry(country.name)) link('countryPerson', country, person);
            }
        }
        for (const person of [...PERSON_KINDS].flatMap(kind => byKind.get(kind) || [])) {
            const links = person.link || {};
            for (const id of links.born || []) if (!revealsCity(person.name, node(id).name)) pair('personBorn', 'cityBorn', person, node(id));
            for (const id of links.died || []) if (!revealsCity(person.name, node(id).name) && !(links.born || new Set()).has(id)) pair('personDied', 'cityDied', person, node(id));
            for (const id of links.spouse || []) if (!reveals(person.name, surname(node(id).name)) || person.kind === 'ruler') link('spouse', person, node(id));
            for (const id of links.child || []) link('parentOf', person, node(id));
            for (const id of links.parent || []) link('childOf', person, node(id));
            for (const id of links.student || []) link('teacherOf', person, node(id));
            for (const id of links.teacher || []) link('studentOf', person, node(id));
            for (const id of links.successor || []) link('successor', person, node(id));
            for (const id of links.predecessor || []) link('predecessor', person, node(id));
        }
        for (const band of byKind.get('band') || []) if (band.city) pair('bandCity', 'cityBand', band, node(band.city));
        for (const kind of ['music', 'book', 'artwork', 'film', 'character']) {
            for (const work of byKind.get(kind) || []) {
                const author = node(work.author);
                if (author) pair('workAuthor', 'authorWork', work, author);
                if (work.museum) pair('artMuseum', 'museumArt', work, node(work.museum));
            }
        }
        // Herci: hlavní role filmu (první tři z obsazení) a filmy u herce
        const actorNamed = nameIndex(['actor']);
        const filmNamed = nameIndex(['film']);
        for (const film of byKind.get('film') || []) {
            if (film.animated) continue;
            for (const name of film.cast.slice(0, 3)) {
                const actor = actorNamed(name);
                if (actor && !reveals(film.name, actor.name) && !reveals(film.name, surname(actor.name))) pair('filmActor', 'actorFilm', film, actor);
            }
        }
        for (const actor of byKind.get('actor') || []) {
            for (const title of actor.films) {
                const film = filmNamed(title);
                if (film && !film.animated && !reveals(film.name, surname(actor.name))) pair('filmActor', 'actorFilm', film, actor);
            }
        }
        for (const artist of byKind.get('artist') || []) {
            artist.movementIds = artist.movements.map(name => movementNamed(name)).filter(Boolean).map(entry => entry.id);
            for (const id of artist.movementIds) pair('artistMovement', 'movementArtist', artist, node(id));
        }
        for (const club of byKind.get('club') || []) {
            pair('clubCity', 'cityClub', club, node(club.city));
            pair('clubCountry', 'countryClub', club, node(club.country));
        }
        // Domácí stadion klubu (stadion v datech zná své kluby, klub svůj stadion) a hráči klubů
        const clubNamed = nameIndex(['club']);
        const stadiumNamed = nameIndex(['stadium']);
        for (const stadium of byKind.get('stadium') || []) {
            stadium.tenantIds = stadium.tenants.map(name => clubNamed(name)).filter(Boolean).map(entry => entry.id);
            for (const id of stadium.tenantIds) if (!reveals(stadium.name, node(id).name) && !reveals(node(id).name, stadium.name)) pair('clubStadium', 'stadiumClub', node(id), stadium);
        }
        for (const club of byKind.get('club') || []) {
            const stadium = stadiumNamed(club.arena);
            if (stadium && !reveals(stadium.name, club.name) && !reveals(club.name, stadium.name)) pair('clubStadium', 'stadiumClub', club, stadium);
        }
        const gamesByQ = new Map((byKind.get('games') || []).map(entry => [entry.q, entry]));
        for (const athlete of byKind.get('athlete') || []) {
            for (const name of athlete.clubs) {
                const club = clubNamed(name);
                if (club && !reveals(athlete.name, club.name)) pair('athleteClub', 'clubAthlete', athlete, club);
            }
            for (const q of athlete.goldAt) { const games = gamesByQ.get(q); if (games) pair('athleteGold', 'goldAthlete', athlete, games); }
        }
        for (const games of byKind.get('games') || []) {
            pair('gamesCity', 'cityGames', games, node(games.city));
            if (!revealsCountry(games.name, (node(games.country) || {}).name)) pair('gamesCountry', 'countryGames', games, node(games.country));
        }
        // Členové kapel (hudebník u kapely v datech nebo kapela u hudebníka)
        for (const band of byKind.get('band') || []) {
            for (const musician of byKind.get('musician') || []) {
                if (!band.members.includes(musician.name) && !musician.bands.includes(band.name)) continue;
                if (reveals(band.name, musician.name) || reveals(musician.name, band.name)) continue;
                pair('memberBand', 'bandMember', musician, band);
            }
        }
        for (const character of byKind.get('character') || []) if (character.book) pair('characterBook', 'bookCharacter', character, node(character.book));
        // Panovníci a jejich státy, hlavní města historických států
        for (const ruler of byKind.get('ruler') || []) if (ruler.realm) pair('rulerRealm', 'realmRuler', ruler, node(ruler.realm));
        for (const realm of byKind.get('realm') || []) if (realm.capitalCity) pair('realmCapital', 'capitalRealm', realm, node(realm.capitalCity));
        // Objevitelé prvků a těles, vynálezci (jméno v datech je uzel osobnosti), prvky pojmenované po bozích, tělesech a osobnostech
        const bodyNamed = nameIndex(['planet', 'moon', 'body']);
        const mythNamed = nameIndex(['myth']);
        for (const element of byKind.get('element') || []) {
            const discoverer = personNamed(element.discName);
            if (discoverer && !samePrefix(element.name, surname(discoverer.name))) { element.discoverer = discoverer.id; pair('elementDiscoverer', 'discovererElement', element, discoverer); }
            const namesake = mythNamed(element.namedName) || bodyNamed(element.namedName) || personNamed(element.namedName);
            if (namesake && !samePrefix(element.name, namesake.name) && !samePrefix(element.name, surname(namesake.name))) { element.namesake = namesake.id; pair('elementNamesake', 'namesakeElement', element, namesake); }
        }
        for (const kind of ['planet', 'moon', 'body']) {
            for (const body of byKind.get(kind) || []) {
                const parent = bodyNamed(body.parentName);
                if (parent && kind === 'moon' && parent.kind === 'planet') { body.parent = parent.id; pair('moonPlanet', 'planetMoon', body, parent); }
                const discoverer = personNamed(body.discName);
                if (discoverer && !samePrefix(body.name, surname(discoverer.name))) { body.discoverer = discoverer.id; pair('bodyDiscoverer', 'discovererBody', body, discoverer); }
            }
        }
        for (const invention of byKind.get('invention') || []) {
            const inventor = personNamed(invention.byName);
            if (inventor && !reveals(invention.name, surname(inventor.name))) { invention.inventor = inventor.id; pair('inventionInventor', 'inventorInvention', invention, inventor); }
        }
        // Mytologie: otec, matka, manželé (jen jednoznačná jména postav v datech)
        for (const figure of byKind.get('myth') || []) {
            const father = mythNamed(figure.father);
            const mother = mythNamed(figure.mother);
            if (father && father.sex !== 'f') { figure.fatherId = father.id; link('mythFather', figure, father); link('mythParentOf', father, figure); }
            if (mother && mother.sex === 'f') { figure.motherId = mother.id; link('mythMother', figure, mother); link('mythParentOf', mother, figure); }
            figure.spouseIds = figure.spouses.map(name => mythNamed(name)).filter(Boolean).map(entry => entry.id);
        }
        for (const figure of byKind.get('myth') || []) {
            for (const id of figure.spouseIds) {
                const other = node(id);
                if (other && (other.sex === 'f') !== (figure.sex === 'f')) { link('mythSpouse', figure, other); link('mythSpouse', other, figure); }
            }
        }
        // Geologie: drahokam → nerost, období → nadřazené období
        const mineralNamed = nameIndex(['mineral']);
        for (const gem of byKind.get('gem') || []) { const mineral = mineralNamed(gem.parentName); if (mineral && !reveals(gem.name, mineral.name)) { gem.mineral = mineral.id; pair('gemMineral', 'mineralGem', gem, mineral); } }
        const periodNamed = nameIndex(['period']);
        for (const period of byKind.get('period') || []) { const parent = periodNamed(period.parentName); if (parent && parent !== period) { period.parent = parent.id; pair('periodEra', 'eraPeriod', period, parent); } }
        for (const breed of byKind.get('breed') || []) { const country = node(breed.country); if (country && fromCountry(country.name)) pair('breedCountry', 'countryBreed', breed, country); }
        for (const species of byKind.get('species') || []) pair('speciesEndemic', 'endemicSpecies', species, node(species.endemic));
        // Kdo má dílo se stejným názvem (Requiem, Carmen): u otázky na autora ho nejde nabídnout jako nesprávnou možnost
        const titlesBy = new Map();
        for (const kind of ['music', 'book', 'artwork', 'film', 'character']) {
            for (const work of byKind.get(kind) || []) {
                const key = norm(work.name);
                if (!titlesBy.has(key)) titlesBy.set(key, new Set());
                if (work.author) titlesBy.get(key).add(work.author);
            }
        }
        // Stupeň uzlu (kolik vazeb k němu vede): uzly s mnoha vazbami jsou rozcestníky (Louvre, The Beatles) a v řetězu dne se střídají
        for (const [id, list] of incoming) { const entry = nodes.get(id); if (entry) entry.degree = new Set(list.map(row => row.from)).size; }
        const edgeSets = new Map([...edges].map(([rel, map]) => [rel, new Map([...map].map(([from, list]) => [from, new Set(list)]))]));
        return { nodes, byKind, edges, edgeSets, incoming, titlesBy, landmarkByName, cityNames, pools: new Map() };
    };

    // --- Vazby: otázky (2–4 znění), vysvětlení po odpovědi, kdo smí být nesprávnou možností ---
    // Stavba jako podmět otázky: „zámek Neuschwanstein“, „Eiffelova věž“
    // Slova, která už sama říkají, o jakou stavbu jde („Buckinghamský palác“ není „zámek Buckinghamský palác“)
    const BUILDING_WORDS = /(?:^| )(?:estadi|pala[cz]|palais|palazzo|palace|pal[aá]c|hrad|z[aá]m[e]?k|schloss|castle|ch[aâ]teau|castel|katedr|kostel|chr[aá]m|bazilik|me[sš]it|klášter|kl[aá][sš]ter|synagog|v[eě][zž]|tower|most|bridge|muze|museum|galeri|gallery|divadl|opera|theat|stadi|arena|aren|budov|building|d[uů]m|house|hall|vila|villa|kaple|brana|gate|centr|center|centre|tor|pevnost|fort|citadel|kreml|akropol|chateau|alc[aá]zar)/;
    const landmarkSubject = (node) => {
        const type = node.typeWord || '';
        return LANDMARK_PREFIX.has(type) && !BUILDING_WORDS.test(norm(node.name)) ? `${type} ${node.name}` : node.name;
    };
    const artNominative = (node) => (ART_TYPES[node.typeWord] ? ART_TYPES[node.typeWord][0] : 'dílo');
    const yearNote = (year) => (Number.isInteger(year) && year > 0 && year < 2100 ? ` (${year})` : '');
    const kindOf = (graph, kind) => graph.byKind.get(kind) || [];
    const has = (list, value) => Array.isArray(list) ? list.includes(value) : Boolean(list && list.has && list.has(value));
    const linkOf = (node, key) => (node && node.link && node.link[key]) || new Set();
    // Nesprávná možnost u vazby, kterou data nemusí znát celou (manželé, rodiče, učitelé, nástupci): bezpečná je jen osobnost z jiné doby
    // nebo s jinými známými údaji téže vazby
    const otherEra = (a, x, years) => Boolean(a.born && x.born) && Math.abs(a.born - x.born) > years;
    const whoSubject = (node) => (node.kind === 'band' ? `kapela ${node.name}` : node.name);
    // Hudební a literární díla: „Kdo složil operu …?“, „Kdo napsal román …?“
    const workAsk = (work) => {
        const n = work.name;
        if (work.kind === 'music') {
            if (work.group === 'song') return [`Kdo nahrál píseň ${n}?`, `Od koho je píseň ${n}?`];
            if (work.group === 'album') return [`Kdo vydal album ${n}?`, `Čí je album ${n}?`];
            return [`Kdo složil ${work.acc} ${n}?`, `Od koho je ${work.typeWord} ${n}?`];
        }
        if (work.kind === 'book') return [`Kdo napsal ${work.acc} ${n}?`, `Kdo je autorem díla ${n}?`, `Z čího pera pochází ${work.typeWord} ${n}?`];
        if (work.kind === 'artwork') return work.group === 'sculpt' ? [`Kdo vytvořil ${work.acc} ${n}?`, `Kdo je autorem díla ${n}?`] : [`Kdo namaloval ${work.acc} ${n}?`, `Kdo je autorem obrazu ${n}?`];
        if (work.kind === 'film') return [`Kdo režíroval ${work.animated ? 'animovaný film' : 'film'} ${n}?`, `Kdo je režisérem filmu ${n}?`];
        if (work.kind === 'character') return [`Kdo vymyslel postavu ${n}?`, `Z čí tvorby pochází postava ${n}?`];
        return [];
    };
    const workExplain = (work, author) => {
        const who = whoSubject(author);
        const a = she(author);
        const n = work.name;
        if (work.kind === 'music') {
            if (work.group === 'song') return `Píseň ${n} nahrál${a} ${who}${yearNote(work.year)}.`;
            if (work.group === 'album') return `Album ${n} vydal${a} ${who}${yearNote(work.year)}.`;
            return `${cap(work.acc)} ${n} složil${a} ${who}${yearNote(work.year)}.`;
        }
        if (work.kind === 'book') return `${cap(work.acc)} ${n} napsal${a} ${who}${yearNote(work.year)}.`;
        if (work.kind === 'artwork') return `${cap(work.acc)} ${n} ${work.group === 'sculpt' ? 'vytvořil' : 'namaloval'}${a} ${who}${yearNote(work.year)}.`;
        if (work.kind === 'film') return `${work.animated ? 'Animovaný film' : 'Film'} ${n} režíroval${a} ${who}${yearNote(work.year)}.`;
        if (work.kind === 'character') return `Postavu ${n} vymyslel${a} ${who}.`;
        return '';
    };
    const authorAsk = (author, work) => {
        const a = she(author);
        const n = author.name;
        if (work.kind === 'music') {
            if (author.kind === 'band') return work.group === 'song' ? [`Kterou z těchto písní nahrála kapela ${n}?`] : work.group === 'album' ? [`Které z těchto alb vydala kapela ${n}?`] : [`Které z těchto děl nahrála kapela ${n}?`];
            if (work.group === 'song') return [`Kterou z těchto písní nahrál${a} ${n}?`];
            if (work.group === 'album') return [`Které z těchto alb vydal${a} ${n}?`];
            return [`Které z těchto děl složil${a} ${n}?`, `Které z těchto děl je od skladatele ${n}?`.replace('skladatele', author.sex === 'f' ? 'skladatelky' : 'skladatele')];
        }
        if (work.kind === 'book') return [`Které z těchto děl napsal${a} ${n}?`, `Které z těchto děl pochází z pera ${author.sex === 'f' ? 'autorky' : 'autora'} ${n}?`];
        if (work.kind === 'artwork') return work.group === 'sculpt' ? [`Které z těchto děl vytvořil${a} ${n}?`] : [`Které z těchto děl namaloval${a} ${n}?`, `Který z těchto obrazů je od ${author.sex === 'f' ? 'malířky' : 'malíře'} ${n}?`];
        if (work.kind === 'film') return [`Který z těchto filmů režíroval${a} ${n}?`, `Který z těchto filmů natočil${a} ${n}?`];
        if (work.kind === 'character') return [`Kterou z těchto postav vymyslel${a} ${n}?`];
        return [];
    };
    const NATURE_FORWARD = { peak: (n) => [`Ve kterém státě leží ${n.typeWord} ${n.name}?`, `Ve které zemi se tyčí ${n.typeWord} ${n.name}?`], range: (n) => [`Ve kterém státě leží pohoří ${n.name}?`],
        river: (n) => [`Ve kterém státě teče řeka ${n.name}?`, `Kterou zemí protéká řeka ${n.name}?`], lake: (n) => [`Ve kterém státě leží jezero ${n.name}?`], island: (n) => [`Ve kterém státě leží ostrov ${n.name}?`, `Ke kterému státu patří ostrov ${n.name}?`] };
    const NATURE_BACK = { peak: (c) => `Která z těchto hor leží ${inCountry(c.name)}?`, range: (c) => `Které z těchto pohoří leží ${inCountry(c.name)}?`, river: (c) => `Která z těchto řek teče ${inCountry(c.name)}?`,
        lake: (c) => `Které z těchto jezer leží ${inCountry(c.name)}?`, island: (c) => `Který z těchto ostrovů je součástí ${ofCountry(c.name)}?` };
    const NATURE_WORD = { peak: (n) => cap(n.typeWord), range: () => 'Pohoří', river: () => 'Řeka', lake: () => 'Jezero', island: () => 'Ostrov' };
    const sameGroup = (b, x) => (b.kind === 'artwork' || b.kind === 'music' ? b.group === x.group : true);
    const fromWord = (country) => fromCountry(country.name) || `ze státu ${country.name}`;
    const gamesLocative = (name) => (/^Letní olympijské hry \d{4}$/.test(name) ? name.replace(/^Letní olympijské hry/, 'na Letních olympijských hrách')
        : /^Zimní olympijské hry \d{4}$/.test(name) ? name.replace(/^Zimní olympijské hry/, 'na Zimních olympijských hrách') : '');
    const FEMALE_LABEL = { composer: 'skladatelka', musician: 'hudebnice', writer: 'spisovatelka', artist: 'výtvarnice', architect: 'architektka', director: 'režisérka', actor: 'herečka',
        athlete: 'sportovkyně', ruler: 'panovnice', statesman: 'státnice', figure: 'osobnost', physicist: 'fyzička', astronomer: 'astronomka', chemist: 'chemička' };
    const personRole = (node) => (node.role && node.role !== KIND_LABEL[node.kind] ? node.role : node.sex === 'f' ? FEMALE_LABEL[node.kind] || 'osobnost' : KIND_LABEL[node.kind] || 'osobnost');
    // Stavba v otázce: „stavba Allianz Arena“, ale jen „Katedrála svatého Izáka“ (název už říká, co je zač)
    const buildingName = (node) => (BUILDING_WORDS.test(norm(node.name)) ? node.name : `stavba ${node.name}`);
    const politics = (node) => node.kind === 'ruler' || node.kind === 'statesman';
    // rel = { id, from: druhy, to: druhy, ask(a, b, graph): [znění otázky], explain(a, b, graph): věta po odpovědi, pool(b, graph): kandidáti na nesprávné
    // možnosti, fits(a, x, graph): x vazbu splňuje (nebo by mohl) – nesmí být nesprávnou možností, photo: false = fotka předchozí odpovědi by
    // mohla odpověď ukázat (fotka města se stavbou, obal alba se jménem kapely, hráč v dresu klubu), key(b, a): podskupina kandidátů }
    const linked = (graph, rel, a, x) => { const set = graph.edgeSets.get(rel).get(a.id); return Boolean(set && set.has(x.id)); };
    const PEOPLE_AND_BANDS = [...PERSON_KINDS, 'band'];
    const RELATIONS = [
        // Stavby
        { id: 'landmarkCity', from: ['landmark'], to: ['city'], ask: (a) => [`Ve kterém městě stojí ${landmarkSubject(a)}?`, `Ve kterém městě najdeš stavbu ${a.name}?`],
            explain: (a, b) => `${cap(landmarkSubject(a))} stojí ve městě ${b.name}.`, pool: (b, graph) => kindOf(graph, 'city'),
            fits: (a, x, graph) => x.id === a.city || norm(x.name) === norm(a.cityName) || (graph.landmarkByName.get(norm(a.name)) || []).some(other => other.city === x.id) },
        { id: 'cityLandmark', from: ['city'], to: ['landmark'], photo: false, ask: (a) => [`Která z těchto staveb stojí ve městě ${a.name}?`, `Kterou z těchto staveb najdeš ve městě ${a.name}?`],
            explain: (a, b) => `${cap(landmarkSubject(b))} stojí ve městě ${a.name}.`, pool: (b, graph) => kindOf(graph, 'landmark'),
            // Stavba bez známého města smí být nesprávnou možností jen z jiného státu
            fits: (a, x) => x.city === a.id || (!x.city && x.country === a.country) || norm(x.cityName) === norm(a.name) || revealsCity(x.name, a.name) },
        { id: 'landmarkCountry', from: ['landmark'], to: ['country'], ask: (a) => [`Ve kterém státě stojí ${landmarkSubject(a)}?`, `Ve které zemi najdeš stavbu ${a.name}?`],
            explain: (a, b) => `${cap(landmarkSubject(a))} stojí ${inCountry(b.name)}.`, pool: (b, graph) => kindOf(graph, 'country'),
            fits: (a, x, graph) => x.id === a.country || (graph.landmarkByName.get(norm(a.name)) || []).some(other => other.country === x.id) },
        { id: 'countryLandmark', from: ['country'], to: ['landmark'], photo: false, ask: (a) => [`Která z těchto staveb stojí ${inCountry(a.name)}?`, `Kterou z těchto staveb najdeš ${inCountry(a.name)}?`],
            explain: (a, b) => `${cap(landmarkSubject(b))} stojí ${inCountry(a.name)}.`, pool: (b, graph) => kindOf(graph, 'landmark'), fits: (a, x) => x.country === a.id || revealsCountry(x.name, a.name) },
        { id: 'landmarkArchitect', from: ['landmark'], to: ['architect'], ask: (a) => [`Kdo navrhl stavbu ${a.name}?`, `Který architekt navrhl ${landmarkSubject(a)}?`, `Kdo je autorem návrhu stavby ${a.name}?`],
            explain: (a, b) => `Stavbu ${a.name} navrhl${she(b)} ${b.name}.`, pool: (b, graph) => kindOf(graph, 'architect'), fits: (a, x) => x.q === a.architect || reveals(a.archText, x.name) },
        { id: 'architectLandmark', from: ['architect'], to: ['landmark'], ask: (a) => [`Kterou z těchto staveb navrhl${she(a)} ${a.name}?`, `Která z těchto staveb je dílem ${a.sex === 'f' ? 'architektky' : 'architekta'} ${a.name}?`],
            explain: (a, b) => `Stavbu ${b.name} navrhl${she(a)} ${a.name}.`,
            // Nesprávná možnost musí mít známého (jiného) architekta: stavba bez údaje může být klidně jeho
            // (a z jiného státu: na velkých stavbách se často podílelo víc architektů, data znají jen hlavního)
            pool: (b, graph) => kindOf(graph, 'landmark').filter(x => (x.architect || x.archText) && x.country !== b.country), key: (b) => b.country,
            fits: (a, x) => x.architect === a.q || reveals(x.archText, a.name) || reveals(x.archText, a.name.split(' ').pop()) },
        { id: 'landmarkStyle', from: ['landmark'], to: ['style'], ask: (a) => [`V jakém slohu postavili stavbu ${a.name}?`, `Ke kterému architektonickému slohu patří ${buildingName(a)}?`],
            explain: (a, b) => `Sloh stavby ${a.name}: ${low(b.name)}.`, pool: (b, graph) => kindOf(graph, 'style'), fits: (a, x) => x.key === a.style },
        { id: 'styleLandmark', from: ['style'], to: ['landmark'], photo: false, ask: (a) => [`Která z těchto staveb je postavena ${STYLE_IN[a.key]}?`, `Kterou z těchto staveb postavili ${STYLE_IN[a.key]}?`],
            explain: (a, b) => `Sloh stavby ${b.name}: ${low(a.name)}.`, pool: (b, graph) => kindOf(graph, 'landmark').filter(x => x.style), fits: (a, x) => x.style === a.key },
        { id: 'artMuseum', from: ['artwork'], to: ['landmark'], ask: (a) => [`Kde je k vidění ${artNominative(a)} ${a.name}?`, `Ve kterém muzeu nebo galerii je ${artNominative(a)} ${a.name}?`],
            explain: (a, b) => `${cap(artNominative(a))} ${a.name} je k vidění ${MUSEUMS[b.name] || `v muzeu ${b.name}`}.`,
            pool: (b, graph) => kindOf(graph, 'landmark').filter(x => x.museum), fits: (a, x) => x.id === a.museum },
        { id: 'museumArt', from: ['landmark'], to: ['artwork'], photo: false, ask: (a) => [`Které z těchto děl je k vidění ${MUSEUMS[a.name] || `v muzeu ${a.name}`}?`],
            explain: (a, b) => `${cap(artNominative(b))} ${b.name} je k vidění ${MUSEUMS[a.name] || `v muzeu ${a.name}`}.`,
            pool: (b, graph) => kindOf(graph, 'artwork').filter(x => x.museum), fits: (a, x) => x.museum === a.id },
        // Příroda
        { id: 'natureCountry', from: ['peak', 'range', 'river', 'lake', 'island'], to: ['country'], ask: (a) => NATURE_FORWARD[a.kind](a),
            explain: (a, b) => `${NATURE_WORD[a.kind](a)} ${a.name} ${a.kind === 'river' ? 'teče' : 'leží'} ${inCountry(b.name)}.`, pool: (b, graph) => kindOf(graph, 'country'), fits: (a, x) => x.id === a.country },
        { id: 'countryNature', from: ['country'], to: ['peak', 'range', 'river', 'lake', 'island'], ask: (a, b) => [NATURE_BACK[b.kind](a)],
            explain: (a, b) => `${NATURE_WORD[b.kind](b)} ${b.name} ${b.kind === 'river' ? 'teče' : 'leží'} ${inCountry(a.name)}.`, pool: (b, graph) => kindOf(graph, b.kind).filter(x => x.country), fits: (a, x) => x.country === a.id },
        { id: 'peakRange', from: ['peak'], to: ['range'], ask: (a) => [`Ve kterém pohoří leží ${a.typeWord} ${a.name}?`, `Do kterého pohoří patří ${a.typeWord} ${a.name}?`],
            explain: (a, b) => `${cap(a.typeWord)} ${a.name} leží v pohoří ${b.name}${a.elev ? ` a měří ${a.elev} m` : ''}.`, pool: (b, graph) => kindOf(graph, 'range'), fits: (a, x) => x.id === a.range },
        { id: 'rangePeak', from: ['range'], to: ['peak'], photo: false, ask: (a) => [`Která z těchto hor leží v pohoří ${a.name}?`, `Kterou z těchto hor najdeš v pohoří ${a.name}?`],
            explain: (a, b) => `${cap(b.typeWord)} ${b.name} leží v pohoří ${a.name}.`, pool: (b, graph) => kindOf(graph, 'peak').filter(x => x.range), fits: (a, x) => x.range === a.id },
        { id: 'riverInto', from: ['river'], to: ['river'], ask: (a) => [`Do které řeky se vlévá řeka ${a.name}?`, `Přítokem které řeky je ${a.name}?`],
            explain: (a, b) => `Řeka ${a.name} se vlévá do řeky ${b.name}.`, pool: (b, graph) => kindOf(graph, 'river'), fits: (a, x) => x.id === a.mouth || x.mouth === a.id },
        { id: 'riverTributary', from: ['river'], to: ['river'], ask: (a) => [`Která z těchto řek se vlévá do řeky ${a.name}?`, `Která z těchto řek je přítokem řeky ${a.name}?`],
            explain: (a, b) => `Řeka ${b.name} se vlévá do řeky ${a.name}.`, pool: (b, graph) => kindOf(graph, 'river').filter(x => x.mouth), fits: (a, x) => x.mouth === a.id || a.mouth === x.id },
        { id: 'regionCapital', from: ['region'], to: ['city'], ask: (a) => [`Které město je správním centrem regionu ${a.name}?`, `Kde sídlí správa regionu ${a.name}?`],
            explain: (a, b) => `Správním centrem regionu ${a.name} je město ${b.name}.`, pool: (b, graph) => kindOf(graph, 'city'), fits: (a, x) => x.id === a.capitalCity },
        { id: 'capitalRegion', from: ['city'], to: ['region'], ask: (a) => [`Kterého regionu je město ${a.name} správním centrem?`, `Ve kterém z těchto regionů sídlí správa ve městě ${a.name}?`],
            explain: (a, b) => `Město ${a.name} je správním centrem regionu ${b.name}.`, pool: (b, graph) => kindOf(graph, 'region'), fits: (a, x) => x.capitalCity === a.id },
        // Osobnosti a místa
        { id: 'personCountry', from: PEOPLE_AND_BANDS, to: ['country'],
            ask: (a) => (a.kind === 'band' ? [`Ze které země pochází kapela ${a.name}?`, `Odkud pochází kapela ${a.name}?`]
                : politics(a) ? [`Ve které zemi působil${she(a)} ${a.name}?`, `Ze které země pochází ${personRole(a)} ${a.name}?`] : [`Ze které země pochází ${personRole(a)} ${a.name}?`, `Odkud pochází ${personRole(a)} ${a.name}?`]),
            explain: (a, b) => `${a.kind === 'band' ? 'Kapela ' : ''}${a.name} pochází ${fromWord(b)}.`, pool: (b, graph) => kindOf(graph, 'country'), fits: (a, x) => x.id === a.country || (a.nations || []).includes(x.name) },
        { id: 'countryPerson', from: ['country'], to: PEOPLE_AND_BANDS, ask: (a, b) => [b.kind === 'band' ? `Která z těchto kapel pochází ${fromCountry(a.name)}?` : `Kdo z těchto ${MANY[b.kind]} pochází ${fromCountry(a.name)}?`],
            explain: (a, b) => `${b.kind === 'band' ? 'Kapela ' : ''}${b.name} pochází ${fromWord(a)}.`,
            // Nesprávná možnost musí mít známou jinou zemi a popis nesmí zmiňovat tuhle
            pool: (b, graph) => kindOf(graph, b.kind).filter(x => x.country), fits: (a, x) => x.country === a.id || (x.nations || []).includes(a.name) },
        { id: 'personBorn', from: [...PERSON_KINDS], to: ['city'], ask: (a) => [`Ve kterém městě se narodil${she(a)} ${a.name}?`, `Kde se narodil${she(a)} ${personRole(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} se narodil${she(a)} ve městě ${b.name}${yearNote(a.born)}.`, pool: (b, graph) => kindOf(graph, 'city'), fits: (a, x) => linkOf(a, 'born').has(x.id) || linkOf(a, 'died').has(x.id) },
        { id: 'cityBorn', from: ['city'], to: [...PERSON_KINDS], ask: (a, b) => [`Kdo z těchto ${MANY[b.kind]} se narodil ve městě ${a.name}?`, `Které z těchto osobností je město ${a.name} rodištěm?`],
            explain: (a, b) => `${b.name} se narodil${she(b)} ve městě ${a.name}${yearNote(b.born)}.`, pool: (b, graph) => kindOf(graph, b.kind).filter(x => x.link && x.link.born),
            fits: (a, x) => linkOf(x, 'born').has(a.id) || linkOf(x, 'died').has(a.id) },
        { id: 'personDied', from: [...PERSON_KINDS], to: ['city'], ask: (a) => [`Ve kterém městě zemřel${she(a)} ${a.name}?`, `Kde zemřel${she(a)} ${personRole(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} zemřel${she(a)} ve městě ${b.name}${yearNote(a.died)}.`, pool: (b, graph) => kindOf(graph, 'city'), fits: (a, x) => linkOf(a, 'died').has(x.id) || linkOf(a, 'born').has(x.id) },
        { id: 'cityDied', from: ['city'], to: [...PERSON_KINDS], ask: (a, b) => [`Kdo z těchto ${MANY[b.kind]} zemřel ve městě ${a.name}?`],
            explain: (a, b) => `${b.name} zemřel${she(b)} ve městě ${a.name}${yearNote(b.died)}.`, pool: (b, graph) => kindOf(graph, b.kind).filter(x => x.link && x.link.died),
            fits: (a, x) => linkOf(x, 'died').has(a.id) || linkOf(x, 'born').has(a.id) },
        { id: 'bandCity', from: ['band'], to: ['city'], ask: (a) => [`Ve kterém městě vznikla kapela ${a.name}?`, `Odkud pochází kapela ${a.name}?`],
            explain: (a, b) => `Kapela ${a.name} vznikla ve městě ${b.name}${yearNote(a.year)}.`, pool: (b, graph) => kindOf(graph, 'city'), fits: (a, x) => x.id === a.city },
        { id: 'cityBand', from: ['city'], to: ['band'], ask: (a) => [`Která z těchto kapel vznikla ve městě ${a.name}?`], explain: (a, b) => `Kapela ${b.name} vznikla ve městě ${a.name}${yearNote(b.year)}.`,
            pool: (b, graph) => kindOf(graph, 'band').filter(x => x.city), fits: (a, x) => x.city === a.id },
        // Vztahy mezi osobnostmi (Wikidata)
        { id: 'spouse', from: [...PERSON_KINDS], to: [...PERSON_KINDS], ask: (a, b) => [`Koho měl${she(a)} ${a.name} za ${b.sex === 'f' ? 'manželku' : 'manžela'}?`, `S kým byl${she(a)} ${a.name} ${a.sex === 'f' ? 'vdaná' : 'ženatý'}?`],
            explain: (a, b) => `${a.name} a ${b.name} byli manželé.`, pool: (b, graph) => kindOf(graph, b.kind).filter(x => (x.sex === 'f') === (b.sex === 'f')), key: (b) => b.sex,
            fits: (a, x) => linkOf(a, 'spouse').has(x.id) || (!linkOf(x, 'spouse').size && !otherEra(a, x, 50)) },
        { id: 'parentOf', from: [...PERSON_KINDS], to: [...PERSON_KINDS], ask: (a) => [`${a.name} byl${she(a)} ${a.sex === 'f' ? 'matkou' : 'otcem'} které z těchto osobností?`],
            explain: (a, b) => `${a.name} → ${b.name}: ${a.sex === 'f' ? 'matka' : 'otec'} a ${b.sex === 'f' ? 'dcera' : 'syn'}.`, pool: (b, graph) => kindOf(graph, b.kind),
            fits: (a, x) => linkOf(a, 'child').has(x.id) || (!linkOf(x, 'parent').size && !otherEra(a, x, 90) && !(a.born && x.born && x.born <= a.born + 12)) },
        { id: 'childOf', from: [...PERSON_KINDS], to: [...PERSON_KINDS], ask: (a, b) => [`Koho měl${she(a)} ${a.name} za ${b.sex === 'f' ? 'matku' : 'otce'}?`, `Kdo byl rodičem osobnosti ${a.name}?`],
            explain: (a, b) => `${b.name} → ${a.name}: ${b.sex === 'f' ? 'matka' : 'otec'} a ${a.sex === 'f' ? 'dcera' : 'syn'}.`, pool: (b, graph) => kindOf(graph, b.kind).filter(x => (x.sex === 'f') === (b.sex === 'f')), key: (b) => b.sex,
            fits: (a, x) => linkOf(a, 'parent').has(x.id) || (!linkOf(x, 'child').size && !otherEra(a, x, 90) && !(a.born && x.born && a.born <= x.born + 12)) },
        { id: 'teacherOf', from: [...PERSON_KINDS], to: [...PERSON_KINDS], ask: (a) => [`Koho z těchto osobností učil${she(a)} ${a.name}?`, `Kdo z těchto osobností byl žákem osobnosti ${a.name}?`],
            explain: (a, b) => `${b.name} byl${she(b)} ${b.sex === 'f' ? 'žačkou' : 'žákem'} osobnosti ${a.name}.`, pool: (b, graph) => kindOf(graph, b.kind),
            fits: (a, x) => linkOf(a, 'student').has(x.id) || !otherEra(a, x, 70) || (a.born && x.born && x.born < a.born) },
        { id: 'studentOf', from: [...PERSON_KINDS], to: [...PERSON_KINDS], ask: (a, b) => [`U koho studoval${she(a)} ${a.name}?`, `Kdo byl ${b.sex === 'f' ? 'učitelkou' : 'učitelem'} osobnosti ${a.name}?`],
            explain: (a, b) => `${b.name} byl${she(b)} ${b.sex === 'f' ? 'učitelkou' : 'učitelem'} osobnosti ${a.name}.`, pool: (b, graph) => kindOf(graph, b.kind).filter(x => (x.sex === 'f') === (b.sex === 'f')), key: (b) => b.sex,
            fits: (a, x) => linkOf(a, 'teacher').has(x.id) || !otherEra(a, x, 70) || (a.born && x.born && x.born > a.born) },
        { id: 'successor', from: ['ruler', 'statesman'], to: ['ruler', 'statesman'], ask: (a) => [`Komu předal${she(a)} ${a.name} ${a.kind === 'ruler' ? 'vládu' : 'úřad'}?`, `Kdo převzal ${a.kind === 'ruler' ? 'vládu' : 'úřad'} po osobnosti ${a.name}?`],
            explain: (a, b) => `Po osobnosti ${a.name} převzal${she(b)} ${a.kind === 'ruler' ? 'vládu' : 'úřad'} ${b.name}${yearNote(b.year)}.`, pool: (b, graph) => kindOf(graph, b.kind),
            fits: (a, x) => linkOf(a, 'successor').has(x.id) || linkOf(a, 'predecessor').has(x.id) || (!linkOf(x, 'predecessor').size && !otherEra(a, x, 60)) },
        { id: 'predecessor', from: ['ruler', 'statesman'], to: ['ruler', 'statesman'], ask: (a) => [`Po kom převzal${she(a)} ${a.name} ${a.kind === 'ruler' ? 'vládu' : 'úřad'}?`, `Kdo byl předchůdcem osobnosti ${a.name}?`],
            explain: (a, b) => `${a.name} převzal${she(a)} ${a.kind === 'ruler' ? 'vládu' : 'úřad'} po osobnosti ${b.name}.`, pool: (b, graph) => kindOf(graph, b.kind),
            fits: (a, x) => linkOf(a, 'predecessor').has(x.id) || linkOf(a, 'successor').has(x.id) || (!linkOf(x, 'successor').size && !otherEra(a, x, 60)) },
        // Díla a autoři
        { id: 'workAuthor', from: ['music', 'book', 'artwork', 'film', 'character'], to: PEOPLE_AND_BANDS, photo: (a) => a.kind === 'artwork', ask: (a) => workAsk(a),
            explain: (a, b) => workExplain(a, b), pool: (b, graph) => kindOf(graph, b.kind), fits: (a, x, graph) => x.id === a.author || (graph.titlesBy.get(norm(a.name)) || new Set()).has(x.id) },
        { id: 'authorWork', from: PEOPLE_AND_BANDS, to: ['music', 'book', 'artwork', 'film', 'character'], ask: (a, b) => authorAsk(a, b), explain: (a, b) => workExplain(b, a),
            pool: (b, graph) => kindOf(graph, b.kind).filter(x => x.author && sameGroup(b, x)), key: (b) => b.group || '',
            fits: (a, x, graph) => x.author === a.id || [...(graph.titlesBy.get(norm(x.name)) || [])].includes(a.id) },
        { id: 'filmActor', from: ['film'], to: ['actor'], photo: false, ask: (a, b) => [b.sex === 'f' ? `Která z těchto hereček hrála ve filmu ${a.name}?` : `Kdo z těchto herců hrál ve filmu ${a.name}?`],
            explain: (a, b) => `Ve filmu ${a.name}${yearNote(a.year)} hrál${she(b)} ${b.name}.`, pool: (b, graph) => kindOf(graph, 'actor').filter(x => (x.sex === 'f') === (b.sex === 'f')), key: (b) => b.sex,
            fits: (a, x) => has(a.cast, x.name) || has(x.films, a.name) },
        { id: 'actorFilm', from: ['actor'], to: ['film'], ask: (a) => [`Ve kterém z těchto filmů hrál${she(a)} ${a.name}?`, `Ve kterém z těchto filmů se objevil${she(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} hrál${she(a)} ve filmu ${b.name}${yearNote(b.year)}.`, pool: (b, graph) => kindOf(graph, 'film').filter(x => !x.animated && x.cast.length),
            fits: (a, x) => has(x.cast, a.name) || has(a.films, x.name) },
        { id: 'characterBook', from: ['character'], to: ['book'], photo: false, ask: (a) => [`Ve kterém díle vystupuje postava ${a.name}?`, `Ve kterém díle se objevuje postava ${a.name}?`],
            explain: (a, b) => `Postava ${a.name} vystupuje v díle ${b.name}.`, pool: (b, graph) => kindOf(graph, 'book'), fits: (a, x) => x.author === a.author || reveals(x.name, a.name) },
        { id: 'bookCharacter', from: ['book'], to: ['character'], photo: false, ask: (a) => [`Která z těchto postav vystupuje v díle ${a.name}?`],
            explain: (a, b) => `Postava ${b.name} vystupuje v díle ${a.name}.`, pool: (b, graph) => kindOf(graph, 'character'), fits: (a, x) => x.book === a.id || x.author === a.author },
        { id: 'memberBand', from: ['musician'], to: ['band'], ask: (a) => [`Ve které kapele působil${she(a)} ${a.name}?`, `Ve které kapele hrál${she(a)} nebo zpíval${she(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} působil${she(a)} v kapele ${b.name}.`, pool: (b, graph) => kindOf(graph, 'band'),
            fits: (a, x) => x.members.includes(a.name) || a.bands.includes(x.name) || reveals(x.name, a.name) },
        { id: 'bandMember', from: ['band'], to: ['musician'], photo: false, ask: (a) => [`Kdo z těchto hudebníků působil v kapele ${a.name}?`],
            explain: (a, b) => `${b.name} působil${she(b)} v kapele ${a.name}.`, pool: (b, graph) => kindOf(graph, 'musician').filter(x => x.bands.length), fits: (a, x) => a.members.includes(x.name) || x.bands.includes(a.name) },
        { id: 'artistMovement', from: ['artist'], to: ['movement'], ask: (a) => [`Ke kterému uměleckému směru patřil${she(a)} ${a.name}?`, `Ke kterému směru se řadí ${personRole(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} patřil${she(a)} ke směru ${low(b.name)}.`, pool: (b, graph) => kindOf(graph, 'movement'), fits: (a, x) => (a.movementIds || []).includes(x.id) },
        { id: 'movementArtist', from: ['movement'], to: ['artist'], ask: (a) => [`Kdo z těchto výtvarníků patřil ke směru ${low(a.name)}?`, `Kdo z těchto umělců je představitelem směru ${low(a.name)}?`],
            explain: (a, b) => `${b.name} patřil${she(b)} ke směru ${low(a.name)}.`, pool: (b, graph) => kindOf(graph, 'artist').filter(x => (x.movementIds || []).length), fits: (a, x) => (x.movementIds || []).includes(a.id) },
        // Sport
        { id: 'clubCity', from: ['club'], to: ['city'], photo: false, ask: (a) => [`Ve kterém městě sídlí klub ${a.name}?`, `Odkud je klub ${a.name}?`],
            explain: (a, b) => `Klub ${a.name} sídlí ve městě ${b.name}${yearNote(a.year)}.`, pool: (b, graph) => kindOf(graph, 'city'), fits: (a, x) => x.id === a.city },
        { id: 'cityClub', from: ['city'], to: ['club'], ask: (a) => [`Který z těchto klubů sídlí ve městě ${a.name}?`, `Který z těchto klubů je doma ve městě ${a.name}?`],
            explain: (a, b) => `Klub ${b.name} sídlí ve městě ${a.name}.`, pool: (b, graph) => kindOf(graph, 'club'), fits: (a, x) => x.city === a.id || revealsCity(x.name, a.name) },
        { id: 'clubCountry', from: ['club'], to: ['country'], photo: false, ask: (a) => [`Ve kterém státě sídlí klub ${a.name}?`],
            explain: (a, b) => `Klub ${a.name} sídlí ${inCountry(b.name)}.`, pool: (b, graph) => kindOf(graph, 'country'), fits: (a, x) => x.id === a.country },
        { id: 'countryClub', from: ['country'], to: ['club'], ask: (a) => [`Který z těchto klubů sídlí ${inCountry(a.name)}?`],
            explain: (a, b) => `Klub ${b.name} sídlí ${inCountry(a.name)}.`, pool: (b, graph) => kindOf(graph, 'club'), fits: (a, x) => x.country === a.id || revealsCountry(x.name, a.name) },
        { id: 'clubStadium', from: ['club'], to: ['stadium'], ask: (a) => [`Na kterém stadionu hraje domácí zápasy klub ${a.name}?`, `Který stadion je domovem klubu ${a.name}?`],
            explain: (a, b) => `Klub ${a.name} hraje doma na stadionu ${b.name}${yearNote(b.year)}.`, pool: (b, graph) => kindOf(graph, 'stadium'),
            fits: (a, x) => (x.tenantIds || []).includes(a.id) || norm(a.arena) === norm(x.name) },
        { id: 'stadiumClub', from: ['stadium'], to: ['club'], photo: false, ask: (a) => [`Který z těchto klubů hraje doma na stadionu ${a.name}?`, `Pro který z těchto klubů je stadion ${a.name} domácím hřištěm?`],
            explain: (a, b) => `Klub ${b.name} hraje doma na stadionu ${a.name}.`, pool: (b, graph) => kindOf(graph, 'club'), key: (b) => b.sport,
            fits: (a, x) => (a.tenantIds || []).includes(x.id) || norm(x.arena) === norm(a.name) },
        { id: 'athleteClub', from: ['athlete'], to: ['club'], photo: false, ask: (a) => [`Za který z těchto klubů hrál${she(a)} ${a.name}?`, `V dresu kterého klubu hrál${she(a)} ${personRole(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} hrál${she(a)} za klub ${b.name}.`, pool: (b, graph) => kindOf(graph, 'club'), key: (b) => b.sport, fits: (a, x) => a.clubs.includes(x.name) },
        { id: 'clubAthlete', from: ['club'], to: ['athlete'], ask: (a) => [`Kdo z těchto sportovců hrál za klub ${a.name}?`, `Kdo z těchto hráčů oblékal dres klubu ${a.name}?`],
            explain: (a, b) => `${b.name} hrál${she(b)} za klub ${a.name}.`, pool: (b, graph) => kindOf(graph, 'athlete').filter(x => x.clubs.length && x.sport === b.sport), key: (b) => b.sport,
            fits: (a, x) => x.clubs.includes(a.name) },
        { id: 'athleteGold', from: ['athlete'], to: ['games'], photo: false, ask: (a) => [`Na kterých olympijských hrách získal${she(a)} ${a.name} zlatou medaili?`, `Kde vybojoval${she(a)} ${a.name} olympijské zlato?`],
            explain: (a, b) => `${a.name} vybojoval${she(a)} olympijské zlato ${gamesLocative(b.name) || `na hrách ${b.name}`}.`, pool: (b, graph) => kindOf(graph, 'games'),
            fits: (a, x) => a.og.includes(x.q) || a.goldAt.includes(x.q) },
        { id: 'goldAthlete', from: ['games'], to: ['athlete'], photo: false, ask: (a) => (gamesLocative(a.name) ? [`Kdo z těchto sportovců získal zlatou medaili ${gamesLocative(a.name)}?`] : []),
            explain: (a, b) => `${b.name} vybojoval${she(b)} zlato ${gamesLocative(a.name)}.`, pool: (b, graph) => kindOf(graph, 'athlete').filter(x => x.goldAt.length), fits: (a, x) => x.og.includes(a.q) || x.goldAt.includes(a.q) },
        { id: 'gamesCity', from: ['games'], to: ['city'], photo: false, ask: (a) => [`Které město hostilo ${a.name}?`, `Ve kterém městě se konaly ${a.name}?`],
            explain: (a, b) => `${a.name} hostilo město ${b.name}.`, pool: (b, graph) => kindOf(graph, 'city').filter(x => x.pop >= 300000), fits: (a, x) => x.id === a.city },
        { id: 'cityGames', from: ['city'], to: ['games'], photo: false, ask: (a) => [`Které z těchto olympijských her se konaly ve městě ${a.name}?`],
            explain: (a, b) => `${b.name} se konaly ve městě ${a.name}.`, pool: (b, graph) => kindOf(graph, 'games'), fits: (a, x) => x.city === a.id },
        { id: 'gamesCountry', from: ['games'], to: ['country'], photo: false, ask: (a) => [`Ve kterém státě se konaly ${a.name}?`],
            explain: (a, b) => `${a.name} se konaly ${inCountry(b.name)}.`, pool: (b, graph) => kindOf(graph, 'country'), fits: (a, x) => x.id === a.country },
        { id: 'countryGames', from: ['country'], to: ['games'], ask: (a) => [`Které z těchto olympijských her se konaly ${inCountry(a.name)}?`],
            explain: (a, b) => `${b.name} se konaly ${inCountry(a.name)}.`, pool: (b, graph) => kindOf(graph, 'games'), fits: (a, x) => x.country === a.id },
        // Historie
        { id: 'rulerRealm', from: ['ruler'], to: ['realm'], ask: (a) => [`V čele kterého státu stál${she(a)} ${a.name}?`, `Kterému státu vládl${she(a)} ${personRole(a)} ${a.name}?`],
            explain: (a, b) => `${a.name} stál${she(a)} v čele státu ${b.name}.`, pool: (b, graph) => kindOf(graph, 'realm'), fits: (a, x) => x.id === a.realm },
        { id: 'realmRuler', from: ['realm'], to: ['ruler'], ask: (a) => [`Kdo z těchto panovníků stál v čele státu ${a.name}?`, `Kdo z těchto panovníků vládl ve státě ${a.name}?`],
            explain: (a, b) => `${b.name} stál${she(b)} v čele státu ${a.name}.`, pool: (b, graph) => kindOf(graph, 'ruler').filter(x => x.realm), fits: (a, x) => x.realm === a.id },
        { id: 'realmCapital', from: ['realm'], to: ['city'], ask: (a) => [`Které město bylo hlavním městem státu ${a.name}?`, `Kde měl stát ${a.name} hlavní město?`],
            explain: (a, b) => `Hlavním městem státu ${a.name} bylo město ${b.name}.`, pool: (b, graph) => kindOf(graph, 'city'), fits: (a, x) => x.id === a.capitalCity },
        { id: 'capitalRealm', from: ['city'], to: ['realm'], ask: (a) => [`Který z těchto historických států měl hlavní město ${a.name}?`],
            explain: (a, b) => `Hlavním městem státu ${b.name} bylo město ${a.name}.`, pool: (b, graph) => kindOf(graph, 'realm').filter(x => x.capitalCity), fits: (a, x) => x.capitalCity === a.id },
        // Věda
        { id: 'elementDiscoverer', from: ['element'], to: [...PERSON_KINDS], ask: (a) => [`Kdo objevil prvek ${low(a.name)}?`, `Komu se připisuje objev prvku ${low(a.name)}?`],
            explain: (a, b) => `Prvek ${low(a.name)} objevil${she(b)} ${b.name}${yearNote(a.year)}.`, pool: (b, graph) => kindOf(graph, b.kind), fits: (a, x) => norm(x.name) === norm(a.discName) },
        { id: 'discovererElement', from: [...PERSON_KINDS], to: ['element'], ask: (a) => [`Který z těchto prvků objevil${she(a)} ${a.name}?`, `Objev kterého z těchto prvků se připisuje osobnosti ${a.name}?`],
            explain: (a, b) => `Prvek ${low(b.name)} objevil${she(a)} ${a.name}${yearNote(b.year)}.`, pool: (b, graph) => kindOf(graph, 'element').filter(x => x.discoverer), fits: (a, x) => x.discoverer === a.id || norm(x.discName) === norm(a.name) },
        { id: 'elementNamesake', from: ['element'], to: ['myth', 'planet', 'moon', 'body', ...PERSON_KINDS],
            ask: (a, b) => [b.kind === 'myth' ? `Po které postavě z mytologie je pojmenovaný prvek ${low(a.name)}?` : PERSON_KINDS.has(b.kind) ? `Po kom je pojmenovaný prvek ${low(a.name)}?` : `Po kterém vesmírném tělese je pojmenovaný prvek ${low(a.name)}?`],
            explain: (a, b) => `Prvek ${low(a.name)} nese jméno ${b.kind === 'myth' ? 'postavy' : PERSON_KINDS.has(b.kind) ? 'osobnosti' : 'tělesa'} ${b.name}.`, pool: (b, graph) => kindOf(graph, b.kind), fits: (a, x) => x.id === a.namesake },
        { id: 'namesakeElement', from: ['myth', 'planet', 'moon', 'body', ...PERSON_KINDS], to: ['element'],
            ask: (a) => [`Který z těchto prvků nese jméno ${a.kind === 'myth' ? 'postavy' : PERSON_KINDS.has(a.kind) ? 'osobnosti' : 'tělesa'} ${a.name}?`],
            explain: (a, b) => `Prvek ${low(b.name)} nese jméno ${a.kind === 'myth' ? 'postavy' : PERSON_KINDS.has(a.kind) ? 'osobnosti' : 'tělesa'} ${a.name}.`, pool: (b, graph) => kindOf(graph, 'element').filter(x => x.namesake), fits: (a, x) => x.namesake === a.id },
        { id: 'moonPlanet', from: ['moon'], to: ['planet'], ask: (a) => [`Kolem kterého tělesa obíhá měsíc ${a.name}?`, `Kterou planetu obíhá měsíc ${a.name}?`],
            explain: (a, b) => `Měsíc ${a.name} obíhá kolem tělesa ${b.name}.`, pool: (b, graph) => kindOf(graph, 'planet'), fits: (a, x) => x.id === a.parent },
        { id: 'planetMoon', from: ['planet'], to: ['moon'], ask: (a) => [`Který z těchto měsíců obíhá kolem tělesa ${a.name}?`, `Který z těchto měsíců patří k planetě ${a.name}?`],
            explain: (a, b) => `Měsíc ${b.name} obíhá kolem tělesa ${a.name}.`, pool: (b, graph) => kindOf(graph, 'moon').filter(x => x.parent), fits: (a, x) => x.parent === a.id },
        { id: 'bodyDiscoverer', from: ['planet', 'moon', 'body'], to: [...PERSON_KINDS], ask: (a) => [`Kdo objevil ${a.acc} ${a.name}?`, `Komu se připisuje objev tělesa ${a.name}?`],
            explain: (a, b) => `${cap(a.acc)} ${a.name} objevil${she(b)} ${b.name}${yearNote(a.year)}.`, pool: (b, graph) => kindOf(graph, b.kind), fits: (a, x) => norm(x.name) === norm(a.discName) },
        { id: 'discovererBody', from: [...PERSON_KINDS], to: ['planet', 'moon', 'body'], ask: (a) => [`Které z těchto vesmírných těles objevil${she(a)} ${a.name}?`],
            explain: (a, b) => `${cap(b.acc)} ${b.name} objevil${she(a)} ${a.name}${yearNote(b.year)}.`, pool: (b, graph) => ['planet', 'moon', 'body'].flatMap(kind => kindOf(graph, kind)).filter(x => x.discoverer),
            fits: (a, x) => x.discoverer === a.id || norm(x.discName) === norm(a.name) },
        { id: 'inventionInventor', from: ['invention'], to: [...PERSON_KINDS], ask: (a) => [`Kdo vynalezl ${low(a.name)}?`, `Komu se připisuje vynález: ${low(a.name)}?`],
            explain: (a, b) => `${cap(low(a.name))} vynalezl${she(b)} ${b.name}${yearNote(a.year)}.`, pool: (b, graph) => kindOf(graph, b.kind), fits: (a, x) => norm(x.name) === norm(a.byName) },
        { id: 'inventorInvention', from: [...PERSON_KINDS], to: ['invention'], ask: (a) => [`Co z tohoto vynalezl${she(a)} ${a.name}?`, `Který z těchto vynálezů je dílem osobnosti ${a.name}?`],
            explain: (a, b) => `${cap(low(b.name))} vynalezl${she(a)} ${a.name}${yearNote(b.year)}.`, pool: (b, graph) => kindOf(graph, 'invention').filter(x => x.inventor), fits: (a, x) => x.inventor === a.id },
        { id: 'artDepicts', from: ['artwork'], to: ['myth', ...PERSON_KINDS], photo: false,
            ask: (a, b) => [b.kind === 'myth' ? `Kterou postavu z mytologie zobrazuje ${artNominative(a)} ${a.name}?` : `Koho zobrazuje ${artNominative(a)} ${a.name}?`, `Kdo je hlavní postavou díla ${a.name}?`],
            explain: (a, b) => `${cap(artNominative(a))} ${a.name} zobrazuje ${b.kind === 'myth' ? 'postavu' : 'osobnost'} ${b.name}.`, pool: (b, graph) => kindOf(graph, b.kind),
            fits: (a, x) => (a.depicts || []).includes(x.id) },
        { id: 'depictedIn', from: ['myth', ...PERSON_KINDS], to: ['artwork'], photo: false,
            ask: (a) => [`Které z těchto děl zobrazuje ${a.kind === 'myth' ? 'postavu' : 'osobnost'} ${a.name}?`, `Na kterém z těchto děl je zobrazen${she(a)} ${a.name}?`],
            explain: (a, b) => `${cap(artNominative(b))} ${b.name} zobrazuje ${a.kind === 'myth' ? 'postavu' : 'osobnost'} ${a.name}.`, pool: (b, graph) => kindOf(graph, 'artwork').filter(x => (x.depicts || []).length),
            fits: (a, x) => (x.depicts || []).includes(a.id) },
        // Mytologie
        { id: 'mythFather', from: ['myth'], to: ['myth'], ask: (a) => [`Koho má ${a.name} za otce?`, `Kdo je otcem postavy ${a.name}?`],
            explain: (a, b) => `${a.name}: otcem je ${b.name}.`, pool: (b, graph) => kindOf(graph, 'myth').filter(x => x.sex !== 'f'), key: (b) => b.myth, fits: (a, x) => x.id === a.fatherId || norm(x.name) === norm(a.father) },
        { id: 'mythMother', from: ['myth'], to: ['myth'], ask: (a) => [`Koho má ${a.name} za matku?`, `Kdo je matkou postavy ${a.name}?`],
            explain: (a, b) => `${a.name}: matkou je ${b.name}.`, pool: (b, graph) => kindOf(graph, 'myth').filter(x => x.sex === 'f'), key: (b) => b.myth, fits: (a, x) => x.id === a.motherId || norm(x.name) === norm(a.mother) },
        { id: 'mythParentOf', from: ['myth'], to: ['myth'], ask: (a) => [`${a.name} je ${a.sex === 'f' ? 'matkou' : 'otcem'} které z těchto postav?`, `Které z těchto postav je ${a.name} ${a.sex === 'f' ? 'matkou' : 'otcem'}?`],
            explain: (a, b) => `${b.name}: ${a.sex === 'f' ? 'matkou' : 'otcem'} je ${a.name}.`, pool: (b, graph) => kindOf(graph, 'myth').filter(x => x.fatherId || x.motherId), key: (b) => b.myth,
            fits: (a, x) => x.fatherId === a.id || x.motherId === a.id || norm(x.father) === norm(a.name) || norm(x.mother) === norm(a.name) },
        { id: 'mythSpouse', from: ['myth'], to: ['myth'], ask: (a, b) => [`Koho má ${a.name} za ${b.sex === 'f' ? 'manželku' : 'manžela'}?`, `Kdo je ${b.sex === 'f' ? 'manželkou' : 'manželem'} postavy ${a.name}?`],
            explain: (a, b) => `${a.name} a ${b.name} jsou manželé.`, pool: (b, graph) => kindOf(graph, 'myth').filter(x => (x.sex === 'f') === (b.sex === 'f') && x.spouseIds.length), key: (b) => `${b.myth}|${b.sex}`,
            fits: (a, x) => a.spouseIds.includes(x.id) || x.spouseIds.includes(a.id) || a.spouses.includes(x.name) },
        // Geologie, plemena, endemity
        { id: 'gemMineral', from: ['gem'], to: ['mineral'], ask: (a) => [`Odrůdou kterého nerostu je ${low(a.name)}?`, `Ke kterému nerostu patří drahokam ${low(a.name)}?`],
            explain: (a, b) => `${cap(low(a.name))} je odrůdou nerostu ${low(b.name)}.`, pool: (b, graph) => kindOf(graph, 'mineral'), fits: (a, x) => x.id === a.mineral || norm(x.name) === norm(a.parentName) },
        { id: 'mineralGem', from: ['mineral'], to: ['gem'], ask: (a) => [`Který z těchto drahokamů je odrůdou nerostu ${low(a.name)}?`],
            explain: (a, b) => `${cap(low(b.name))} je odrůdou nerostu ${low(a.name)}.`, pool: (b, graph) => kindOf(graph, 'gem').filter(x => x.mineral), fits: (a, x) => x.mineral === a.id },
        { id: 'periodEra', from: ['period'], to: ['period'], ask: (a) => [`Do kterého geologického období patří ${low(a.name)}?`],
            explain: (a, b) => `${cap(low(a.name))} je součástí období ${low(b.name)}.`, pool: (b, graph) => kindOf(graph, 'period').filter(x => !x.parent || x.parent !== b.id), fits: (a, x) => x.id === a.parent || x.parent === a.id },
        { id: 'eraPeriod', from: ['period'], to: ['period'], ask: (a) => [`Které z těchto období je součástí období ${low(a.name)}?`],
            explain: (a, b) => `${cap(low(b.name))} je součástí období ${low(a.name)}.`, pool: (b, graph) => kindOf(graph, 'period').filter(x => x.parent), fits: (a, x) => x.parent === a.id || a.parent === x.id },
        { id: 'breedCountry', from: ['breed'], to: ['country'], ask: (a) => [`Ze které země pochází plemeno ${a.name}?`, `Odkud pochází ${a.typeWord} ${a.name}?`],
            explain: (a, b) => `${cap(a.typeWord)} ${a.name} pochází ${fromWord(b)}.`, pool: (b, graph) => kindOf(graph, 'country'), fits: (a, x) => x.id === a.country },
        { id: 'countryBreed', from: ['country'], to: ['breed'], ask: (a) => [`Které z těchto plemen pochází ${fromCountry(a.name)}?`],
            explain: (a, b) => `${cap(b.typeWord)} ${b.name} pochází ${fromWord(a)}.`, pool: (b, graph) => kindOf(graph, 'breed'), key: (b) => b.group, fits: (a, x) => x.country === a.id || revealsCountry(x.name, a.name) },
        { id: 'speciesEndemic', from: ['species'], to: ['country'], ask: (a) => [`Ve kterém státě žije ${low(a.name)} ve volné přírodě a nikde jinde?`],
            explain: (a, b) => `${a.name} žije ve volné přírodě jen ${inCountry(b.name)}.`, pool: (b, graph) => kindOf(graph, 'country'), fits: (a, x) => x.id === a.endemic },
        { id: 'endemicSpecies', from: ['country'], to: ['species'], ask: (a) => [`Který z těchto druhů žije ve volné přírodě jen ${inCountry(a.name)}?`],
            explain: (a, b) => `${b.name} žije ve volné přírodě jen ${inCountry(a.name)}.`, pool: (b, graph) => kindOf(graph, 'species'), fits: (a, x) => x.endemic === a.id }
    ];
    const RELATION_BY_ID = new Map(RELATIONS.map(rel => [rel.id, rel]));
    const RELATIONS_FROM = new Map();
    for (const rel of RELATIONS) for (const kind of rel.from) { if (!RELATIONS_FROM.has(kind)) RELATIONS_FROM.set(kind, []); RELATIONS_FROM.get(kind).push(rel); }
    // Obor otázky: obor odpovědi, u zeměpisné odpovědi (stát, město, region) obor toho, na co se ptá
    const domainOf = (a, b) => (GEO_KINDS.has(b.kind) ? KIND_DOMAIN[a.kind] : KIND_DOMAIN[b.kind]) || 'zemepis';
    const FAMILY = Object.fromEntries(RELATIONS.map(rel => [rel.id, KIND_DOMAIN[rel.to.find(kind => !GEO_KINDS.has(kind))] || KIND_DOMAIN[rel.from[0]] || 'zemepis']));

    // --- Možnosti ---
    // Podobnost nesprávné možnosti správné odpovědi (stejný kontinent a stát, podobná známost, období, skupina, mytologie, sport)
    const similarity = (b, x) => {
        let score = 0;
        if (b.continent && x.continent) score += b.continent === x.continent ? 2 : -1;
        if (b.country && x.country === b.country) score += 2;
        if (b.kind === 'city' && b.capital === x.capital) score += 1;
        if (b.group && b.group === x.group) score += 2;
        if (b.typeWord && b.typeWord === x.typeWord) score += b.kind === 'landmark' ? 2.5 : 1;
        if (b.year && x.year) score += Math.abs(b.year - x.year) < 40 ? 1.5 : Math.abs(b.year - x.year) < 120 ? 0.5 : -0.5;
        if (b.kind === 'games') score += b.winter === x.winter ? 3 : -3;
        if (b.myth) score += b.myth === x.myth ? 3 : -2;
        if (b.sport) score += b.sport === x.sport ? 3 : -3;
        if (PERSON_KINDS.has(b.kind)) score += b.sex === x.sex ? 1 : -1;
        score -= Math.abs((b.fame || 0) - (x.fame || 0)) * 3;
        return score;
    };
    // Kandidáti na nesprávné možnosti (stejný druh, ne málo známé, ne stejně pojmenované); seznam se pro vazbu a druh pamatuje
    const poolOf = (graph, rel, b) => {
        const key = `${rel.id}|${b.kind}|${b.group || ''}|${rel.key ? rel.key(b) : ''}`;
        if (!graph.pools.has(key)) graph.pools.set(key, rel.pool(b, graph).filter(x => x.kind === b.kind && x.fame <= 0.85 && !x.shared));
        return graph.pools.get(key);
    };
    // Dvě jména téže věci nebo jedno součástí druhého (Louvre – Palais du Louvre, Puskás Aréna – Stadion Ference Puskáse): taková možnost
    // by byla sporná nebo by se dala poznat podle podoby
    const nearDuplicate = (x, y, person) => norm(x.name) === norm(y.name) || core.isNamePart(x.name, y.name) || core.sameNameStem(x.name, y.name, { person });
    // Tři nesprávné možnosti: stejný druh, vazbu nesplňují, různá a nepodobná jména (i od uzlů řetězu); z nejpodobnějších náhodně.
    // Vazba (pomalejší kontrola) se ověřuje až u kandidátů v pořadí podobnosti, dokud nejsou tři.
    // Nejdřív se projde jen 16 nejpodobnějších (bez řazení celého seznamu), celý seznam se seřadí, jen když mezi nimi nejsou tři vhodné.
    const TOP = 16;
    const pickDistractors = (graph, rel, a, b, rng, avoid = new Set(), count = 3) => {
        const avoided = [...avoid].map(id => graph.nodes.get(id)).filter(Boolean);
        const names = new Set([norm(b.name), ...avoided.map(node => norm(node.name))]);
        const avoidQ = new Set(avoided.map(node => node.q).filter(Boolean));
        const person = PERSON_KINDS.has(b.kind);
        const pool = poolOf(graph, rel, b);
        const scores = new Float64Array(pool.length);
        const top = [];
        for (let i = 0; i < pool.length; i++) {
            const x = pool[i];
            if (x === b || x === a || avoid.has(x.id) || (x.q && (x.q === b.q || x.q === a.q || avoidQ.has(x.q)))) { scores[i] = -Infinity; continue; }
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
            if ([b, ...chosen].some(other => nearDuplicate(x, other, person))) return;
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
    const brief = (node) => ({ id: node.id, name: node.name, kind: node.kind, topic: node.topic, ...(node.q ? { q: node.q } : {}) });
    // Text otázky a vysvětlení: bez dvojité tečky za zkratkou („po osobnosti Mikuláš I.“) a dvojitých mezer
    const tidy = (text) => String(text || '').replace(/\.\.$/, '.').replace(/\s{2,}/g, ' ').trim();
    const photoAllowed = (rel, a, b) => (typeof rel.photo === 'function' ? Boolean(rel.photo(a, b)) : rel.photo !== false);
    // Otázka článku: { rel, tpl (znění), domain, from, to, text, options: [{ id, name }], answer (index správné), explain, photo (false = bez fotky předchozí odpovědi) }
    const buildQuestion = (graph, relId, a, b, rng, avoid) => {
        const rel = RELATION_BY_ID.get(relId);
        const texts = (rel.ask(a, b, graph) || []).filter(Boolean);
        if (!texts.length) return null;
        const tpl = Math.floor(rng() * texts.length);
        const wrong = pickDistractors(graph, rel, a, b, rng, avoid);
        if (!wrong) return null;
        const options = shuffle([b, ...wrong], rng);
        const question = { rel: relId, tpl, domain: domainOf(a, b), from: brief(a), to: brief(b), text: tidy(texts[tpl]), options: options.map(option => ({ id: option.id, name: option.name })), answer: options.indexOf(b),
            explain: rel.explain ? tidy(rel.explain(a, b, graph)) : '' };
        if (!photoAllowed(rel, a, b)) question.photo = false;
        // Otázka na místo, kde předchozí odpověď je: úvod článku o ní (a fotka popisku) prozradí i její další obaly („mrakodrap v Londýně“
        // u otázky na stát) – jejich jména se v úvodu zakryjí také
        const where = containersOf(graph, a);
        if (where.includes(b.id)) question.mask = where.map(id => graph.nodes.get(id)).filter(Boolean).map(node => node.name);
        return question;
    };
    // Záchrana: jiná otázka na stejný článek. Když to jde, se stejnou odpovědí z jiného uzlu mimo řetěz (same: true); nesprávné možnosti
    // původní otázky v ní zůstanou, kde to jde (ať se odpověď nedá poznat podle toho, že je jako jediná v obou otázkách), a k nim tři
    // náhradní. Jinak otázka na předchozí uzel jinou vazbou (same: false, pevné možnosti): po správné odpovědi se ukáže, kam článek vedl.
    const buildRescue = (graph, question, chainIds, rng) => {
        const b = graph.nodes.get(question.to.id);
        const chainQ = new Set([...chainIds].map(id => (graph.nodes.get(id) || {}).q).filter(Boolean));
        const sources = shuffle((graph.incoming.get(b.id) || []).filter(entry => !chainIds.has(entry.from) && !(entry.rel === question.rel && entry.from === question.from.id)), rng)
            .map(entry => ({ ...entry, node: graph.nodes.get(entry.from) }))
            .filter(entry => entry.node && entry.node.fame <= 0.45 && !chainQ.has(entry.node.q));
        for (const { rel: relId, node: a } of sources.slice(0, 6)) {
            const rel = RELATION_BY_ID.get(relId);
            // Odpověď musí být jediná (u „Která z těchto staveb stojí ve městě …?“ je správná každá stavba města – ostatní pak nesmí být mezi možnostmi)
            const texts = (rel.ask(a, b, graph) || []).filter(Boolean);
            if (!texts.length) continue;
            const text = tidy(texts[Math.floor(rng() * texts.length)]);
            if (text === question.text) continue;
            const keep = question.options.filter(option => option.id !== b.id).map(option => graph.nodes.get(option.id))
                .filter(x => x && !linked(graph, relId, a, x) && !rel.fits(a, x, graph)).map(x => x.id);
            // Aspoň dvě původní nesprávné možnosti musí zůstat (i po vyřazení té zvolené jedna), jinak by odpověď prozradila shoda
            if (keep.length < 2) continue;
            const extra = pickDistractors(graph, rel, a, b, rng, new Set([...chainIds, ...question.options.map(option => option.id)]), 3);
            if (!extra) continue;
            return { same: true, rel: relId, from: brief(a), text, keep, extra: extra.map(x => ({ id: x.id, name: x.name })), explain: rel.explain ? tidy(rel.explain(a, b, graph)) : '' };
        }
        // Otázka na předchozí uzel jinou vazbou (jiný text), odpověď mimo řetěz
        const a = graph.nodes.get(question.from.id);
        const alternatives = shuffle(edgesFrom(graph, a).filter(({ rel, to }) => to && rel !== question.rel && to.id !== b.id && !chainIds.has(to.id) && !chainQ.has(to.q) && to.fame <= 0.6), rng)
            .sort((p, q) => p.to.fame - q.to.fame);
        for (const { rel: relId, to } of alternatives.slice(0, 6)) {
            const alt = buildQuestion(graph, relId, a, to, rng, new Set([...chainIds, b.id, ...question.options.map(option => option.id)]));
            if (alt && alt.text !== question.text) return { same: false, rel: relId, from: alt.from, to: alt.to, text: alt.text, options: alt.options, answer: alt.answer, explain: alt.explain };
        }
        return null;
    };
    // Otázka záchrany po špatné odpovědi chosen (id). Se stejnou odpovědí: správná, nesprávné původní kromě zvolené, doplněné náhradními,
    // pořadí ze semínka; jinak pevná otázka. { text, from, options, answer, same, explain }
    const rescueOptions = (question, chosen, seedText = 'zachrana') => {
        const rescue = question.rescue;
        if (!rescue) return null;
        if (!rescue.same) return { text: rescue.text, from: rescue.from, options: rescue.options, answer: rescue.answer, same: false, explain: rescue.explain || '' };
        const answer = question.options[question.answer];
        const kept = rescue.keep.filter(id => id !== chosen).map(id => question.options.find(option => option.id === id)).filter(Boolean);
        const options = [answer, ...kept, ...rescue.extra].slice(0, 4);
        const ordered = shuffle(options, seededRandom(`${seedText}:${question.k}:${chosen || ''}`));
        return { text: rescue.text, from: rescue.from, options: ordered, answer: ordered.indexOf(answer), same: true, explain: rescue.explain || '' };
    };

    // --- Úvod o předchozí odpovědi (podmět otázky) ---
    // Krátký úvod článku z Wikipedie (nebo popis z dat) o uzlu, na který se otázka ptá, zakrytý tak, aby nikdy neobsahoval odpověď: jména
    // všech čtyř možností (i skloněná a původní názvy měst), národnost státu v odpovědi, obaly uzlu u otázky na místo (question.mask:
    // „mrakodrap v Londýně“ u otázky na stát) a odpovědi pozdějších článků (later), ať úvod neprozradí nic dopředu. Nakonec nezávislá
    // kontrola jako v ostatních módech (core.sealAnswerWords a core.answerWordsLeft); úvod, který pak prozrazuje nebo je skoro celý
    // zakrytý, se nepoužije (prázdný řetězec). source = otázka nebo záchrana { text, from, options, answer, mask }.
    const SUBJECT_MAX_MASK = 0.34;
    const maskShare = (text) => {
        const marks = (String(text || '').match(/\[\*\*\*\]/g) || []).length;
        const words = String(text || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}{2,}/u.test(word)).length;
        return marks + words ? marks / (marks + words) : 1;
    };
    // Úvod nejvýš na dvě věty a ~260 znaků
    const shortIntro = (text) => {
        const sentences = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?=\s|$)/g) || [String(text || '').trim()];
        let out = '';
        for (const sentence of sentences.slice(0, 2)) { if (out && (out + sentence).length > 260) break; out = `${out} ${sentence.trim()}`.trim(); }
        return out.length > 300 ? `${out.slice(0, 297).replace(/\s+\S*$/, '')}…` : out;
    };
    const subjectText = (raw, source, later = []) => {
        let text = shortIntro(raw);
        if (!text || !source || !Array.isArray(source.options) || !source.options[source.answer]) return '';
        const answer = source.options[source.answer];
        const names = new Set();
        const note = (name) => { if (typeof name === 'string' && name.trim().length >= 2) names.add(name.trim()); };
        for (const option of source.options) cityForms(option.name).forEach(note);
        (source.mask || []).forEach(name => cityForms(name).forEach(note));
        later.forEach(note);
        const subject = source.from ? source.from.name : '';
        for (const name of [...names].sort((x, y) => y.length - x.length)) {
            if (subject && norm(name) === norm(subject)) continue;
            if (mightReveal(text, name)) text = core.censorName(text, name);
            const last = surname(name);
            if (last && last !== name && last.length >= 4 && !/\.$/.test(last) && mightReveal(text, last)) text = core.censorName(text, last);
        }
        // Národnost státu v odpovědi a v zakrytých obalech („britský mrakodrap“)
        for (const country of [answer.name, ...(source.mask || [])].filter(name => COUNTRY_WORDS[name])) {
            for (const stem of COUNTRY_WORDS[country].slice(2)) text = text.replace(new RegExp(`(^|[^\\p{L}])${stem}\\p{L}*`, 'giu'), '$1[***]');
        }
        text = core.mergeCensored(text);
        const choices = source.options.map((option, index) => ({ label: option.name, correct: index === source.answer }));
        const isGeneric = (word) => Boolean(core.isGenericWord && core.isGenericWord(word));
        const keep = [source.text || '', subject];
        if (core.sealAnswerWords) text = core.sealAnswerWords(text, choices, { isGeneric, keep });
        if (core.answerWordsLeft && core.answerWordsLeft(text, choices, { isGeneric, keep }).length) return '';
        if (maskShare(text) > SUBJECT_MAX_MASK) return '';
        return text;
    };

    // --- Řetěz ---
    // Jak známé smí být uzly řetězu (podíl kategorie od nejznámějších): první články snazší, pak volněji
    const FAME_LIMIT = { country: 0.75, city: 0.32, region: 0.2, landmark: 0.3, peak: 0.3, range: 0.3, river: 0.3, lake: 0.35, island: 0.3, composer: 0.5, musician: 0.3, writer: 0.3, artist: 0.35,
        architect: 0.35, director: 0.45, actor: 0.35, athlete: 0.25, band: 0.35, music: 0.4, book: 0.35, artwork: 0.45, film: 0.25, club: 0.4, games: 0.6, character: 0.6, stadium: 0.35,
        ruler: 0.3, statesman: 0.3, figure: 0.25, realm: 0.45, physicist: 0.35, astronomer: 0.35, chemist: 0.35, element: 0.6, planet: 1, moon: 0.8, body: 0.6, invention: 0.7, myth: 0.35,
        gem: 0.7, mineral: 0.5, period: 0.8, breed: 0.45, species: 0.5, style: 0.9, movement: 0.7 };
    const famousEnough = (node, step, scale) => node.fame <= Math.min(0.95, (FAME_LIMIT[node.kind] || 0.3) * scale * (step <= 2 ? 0.8 : 1));
    // Kolikrát smí být druh uzlu v řetězu: stát nejvýš jednou, město dvakrát (zeměpisné skoky jsou nejvýš dva), skupinové uzly (sloh, směr,
    // olympiáda, historický stát, stadion) jednou
    const KIND_MAX = { country: 1, city: 2, region: 1, landmark: 2, artwork: 1, style: 1, movement: 1, games: 1, realm: 1, stadium: 1, period: 2 };
    const MAX_GEO = 2;
    // Obory, kterých je v grafu málo vazeb (mytologie, příroda, literatura, věda), dostanou při výběru přednost, stavby a slohy (vazeb nejvíc) méně
    const DOMAIN_BOOST = { architektura: -0.9, zemepis: 0, hudba: 0.3, literatura: 0.6, umeni: 0, film: 0.3, sport: 0, historie: 0.3, veda: 0.5, priroda: 0.6, mytologie: 0.8 };
    // Vazby ze stejné skupiny jen jednou v řetězu (obraz → muzeum → město zapadá do sebe nejsnáz; země původu u osobností a plemen)
    const REL_GROUP = { artMuseum: 'museum', museumArt: 'museum', personCountry: 'origin', countryPerson: 'origin', breedCountry: 'origin', countryBreed: 'origin',
        landmarkCountry: 'where', countryLandmark: 'where', clubCountry: 'where', countryClub: 'where', gamesCountry: 'where', countryGames: 'where', natureCountry: 'where', countryNature: 'where',
        personBorn: 'born', cityBorn: 'born', personDied: 'died', cityDied: 'died', teacherOf: 'teacher', studentOf: 'teacher', successor: 'succession', predecessor: 'succession',
        spouse: 'family', parentOf: 'family', childOf: 'family', artDepicts: 'depicts', depictedIn: 'depicts', athleteClub: 'team', clubAthlete: 'team' };
    // Začátek řetězu: slavná stavba, dílo, osobnost, těleso… (začátek se jen ukáže, otázka na něj není); začátky se po dnech střídají po oborech
    const START_GROUPS = [['landmark'], ['music', 'band', 'composer', 'musician'], ['book', 'writer', 'character'], ['artwork', 'artist'], ['film', 'director', 'actor'],
        ['club', 'athlete', 'games', 'stadium'], ['ruler', 'statesman', 'realm', 'figure'], ['element', 'chemist', 'physicist', 'astronomer', 'planet', 'moon', 'invention'],
        ['myth'], ['peak', 'river', 'range', 'island', 'lake', 'breed', 'gem', 'species']];
    const START_KINDS = START_GROUPS.flat();
    const edgesFrom = (graph, node) => (RELATIONS_FROM.get(node.kind) || [])
        .flatMap(rel => (graph.edges.get(rel.id).get(node.id) || []).map(to => ({ rel: rel.id, to: graph.nodes.get(to) })));
    // Kde uzel je (město, stát, muzeum, pohoří, rodiště, endemit) i s obaly (město → stát): co hráč ví, když zná uzel a jeho polohu
    const containersOf = (graph, node, depth = 0) => {
        if (!node || depth > 4) return [];
        const direct = [node.city, node.country, node.museum, node.range, node.endemic].filter(id => typeof id === 'string' && id && id !== node.id);
        return [...new Set([...direct, ...direct.flatMap(id => containersOf(graph, graph.nodes.get(id), depth + 1))])];
    };
    // Rozcestníky: zeměpisné uzly a uzly s mnoha vazbami (Louvre, The Beatles): v řetězu dne se střídají po dnech
    // Velké rozcestníky (aspoň 20 vazeb: Francie, Spojené království, Londýn, Paříž, Starověký Řím, Zeus) jsou k dispozici jeden den z osmi
    // (týž se tak do 8 dní neopakuje), menší (aspoň 10 vazeb, zeměpisné aspoň 6) jeden den ze čtyř
    const hubPeriod = (node) => { const degree = node.degree || 0; return GEO_KINDS.has(node.kind) || degree >= 20 ? 8 : degree >= 10 || node.museum === true || node.kind === 'games' ? 4 : 0; };
    const isHub = (node) => hubPeriod(node) > 0;
    const dayIndex = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);
    // Úrovně hledání (přísná → nouzová, všechny deterministické): breadth = kolik vazeb z uzlu se zkusí, domainMax = otázek z jednoho oboru
    // (tři znamenají aspoň tři obory v řetězu), hubs = rozcestník je v řetězu dne k dispozici jen ve svém dni (strict: velký jeden den z osmi,
    // menší ze čtyř, takže se do týdne neopakuje; loose: jen rozcestníky s aspoň 12 vazbami, any: nic), start = začátek jen jeden den z tolika (stejný
    // začátek se do té doby neopakuje), rest = ostatní uzly s aspoň dvěma vazbami mají každý třetí den volno (oblíbené mosty se tak
    // neopakují den co den), fame = volnější známost, starts = kolik začátků se zkusí, budget = násobek rozpočtu kroků.
    // Pravidla odpovědí zadarmo, zeměpisných skoků a opakování uzlů platí na všech úrovních.
    const LEVELS = [
        { breadth: 8, domainMax: 3, hubs: 'strict', start: 30, fame: 1.2, rest: true },
        { breadth: 12, domainMax: 3, hubs: 'strict', start: 14, fame: 1.6, starts: 120, rest: true },
        { breadth: 16, domainMax: 3, hubs: 'strict', start: 14, fame: 2.2, starts: 300, budget: 4 },
        { breadth: 14, domainMax: 3, hubs: 'loose', start: 14, fame: 1.8, starts: 200, budget: 2, rest: true },
        { breadth: 14, domainMax: 3, hubs: 'loose', start: 14, fame: 1.8, starts: 200, budget: 2 },
        { breadth: 14, domainMax: 4, hubs: 'strict', start: 14, fame: 2.2, starts: 300, budget: 3 },
        { breadth: 14, domainMax: 5, hubs: 'loose', start: 14, fame: 2.2, starts: 300, budget: 3 },
        { breadth: 14, domainMax: 5, hubs: 'any', start: 1, fame: 1.8, free: true }
    ];
    const EMPTY = new Set();
    const search = (graph, { seed, links, practice, budget, level, day }) => {
        const rules = LEVELS[level];
        const scale = rules.fame * (practice ? 1.3 : 1);
        const rng = seededRandom(level ? `${seed}:${level}` : seed);
        const dn = practice || !day ? null : dayIndex(day);
        const slot = (node, period, salt) => ((dn + hash32(`${salt}|${node.id}`)) % period + period) % period;
        const available = (node) => {
            if (dn === null) return true;
            const period = hubPeriod(node);
            if (period) return rules.hubs === 'strict' || (rules.hubs === 'loose' && (node.degree || 0) >= 12) ? slot(node, period, 'hub') === 0 : true;
            return !rules.rest || (node.degree || 0) < 2 || slot(node, 3, 'rest') !== 0;
        };
        const startOk = (node) => dn === null || rules.start <= 1 || slot(node, rules.start, 'start') === 0;
        // Chuť řetězu: každý řetěz má jiné oblíbené vazby (jeden den víc staveb, jiný víc hudby), ať se dny neopakují
        const taste = new Map(RELATIONS.map(rel => [rel.id, rng()]));
        const groupIndex = dn === null ? hash32(`${seed}|skupina`) % START_GROUPS.length : ((dn % START_GROUPS.length) + START_GROUPS.length) % START_GROUPS.length;
        const group = START_GROUPS[groupIndex];
        const startable = (kind) => kindOf(graph, kind).filter(node => !node.shared && available(node) && startOk(node) && node.fame <= (FAME_LIMIT[node.kind] || 0.3) * (practice ? 1 : 0.9) * rules.fame
            && edgesFrom(graph, node).length >= 2);
        const starts = [...shuffle(group.flatMap(startable), rng).slice(0, 30), ...shuffle(START_KINDS.filter(kind => !group.includes(kind)).flatMap(startable), rng)];
        let left = budget;
        const questions = [];
        const used = new Set();
        const usedQ = new Set();
        const kinds = new Map();
        const rels = new Map();
        const groups = new Map();
        const domains = new Map();
        const known = new Map(); // uzel → místa, kde podle dřívějších článků je (i s obaly)
        const shown = new Map(); // možnosti dřívějších otázek (počet)
        const texts = []; // texty a vysvětlení dřívějších otázek (bez diakritiky)
        let geo = 0;
        const bump = (map, key, by) => map.set(key, (map.get(key) || 0) + by);
        const learn = (thing, place) => {
            const added = [];
            if (!known.has(thing)) known.set(thing, new Set());
            for (const id of [place, ...containersOf(graph, graph.nodes.get(place))]) if (!known.get(thing).has(id)) { known.get(thing).add(id); added.push([thing, id]); }
            return added;
        };
        const named = (node) => { const key = ` ${norm(node.name)} `; return key.length > 5 && texts.some(text => text.includes(key)); };
        // Záchrana se nemá ptát na pozdější článek řetězu ani na něj vést – prozradila by ho („Kdo navrhl stavbu Most Mehmeda Sokoloviće?“
        // jako záchrana, když je most odpovědí dalšího článku). Záchrana článku se proto sestaví, až je známý další článek (ten se jí vyhne),
        // a hotový řetěz se zkontroluje celý.
        const revealsLater = (question, ids) => (ids.has(question.rescue.from.id) && question.rescue.from.id !== question.from.id)
            || (!question.rescue.same && ids.has(question.rescue.to.id));
        const finish = () => {
            const ids = new Set(used);
            const lastQuestion = questions[questions.length - 1];
            const lastRescue = buildRescue(graph, lastQuestion, ids, rng);
            if (!lastRescue) return false;
            lastQuestion.rescue = lastRescue;
            for (const question of questions) {
                if (!revealsLater(question, ids)) continue;
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
            const lastGeo = previous ? GEO_KINDS.has(previous.to.kind) : false;
            const knownHere = known.get(node.id) || EMPTY;
            const candidates = [];
            for (const rel of RELATIONS_FROM.get(node.kind) || []) {
                const list = graph.edges.get(rel.id).get(node.id);
                if (!list || (rels.get(rel.id) || 0) >= (rules.free ? 2 : 1) || (REL_GROUP[rel.id] && (groups.get(REL_GROUP[rel.id]) || 0) >= 1)) continue;
                for (const id of list) {
                    const to = graph.nodes.get(id);
                    if (!to || used.has(to.id) || (to.q && usedQ.has(to.q)) || to.noLinks) continue;
                    const isGeo = GEO_KINDS.has(to.kind);
                    // Nejvýš dva zeměpisné skoky a nikdy dva po sobě (stavba → Londýn → stát by byl zadarmo)
                    if (isGeo && (lastGeo || geo >= MAX_GEO)) continue;
                    if ((kinds.get(to.kind) || 0) >= (KIND_MAX[to.kind] || 2)) continue;
                    const domain = domainOf(node, to);
                    if ((domains.get(domain) || 0) >= rules.domainMax - (domain === 'architektura' && !rules.free ? 1 : 0)) continue;
                    if (!famousEnough(to, step, scale) || !available(to)) continue;
                    // Odpověď zadarmo: plyne z toho, co dřívější články o uzlu prozradily (stavba v Londýně → ve Spojeném království),
                    // byla mezi možnostmi dřívější otázky nebo stojí v jejím textu či vysvětlení
                    if (knownHere.has(to.id) || shown.has(to.id) || named(to)) continue;
                    const weight = rng() + 1.2 * taste.get(rel.id) + 1.4 * hash32(`${seed}|${to.id}`) / 4294967296 + (DOMAIN_BOOST[domain] || 0)
                        + ((domains.get(domain) || 0) ? -1.5 * (domains.get(domain) || 0) : 1.4) + ((kinds.get(to.kind) || 0) ? -0.3 : 0.3) - 0.6 * to.fame - (isGeo ? 0.9 : 0) - (!isGeo && isHub(to) ? 0.4 : 0)
                        // Řetěz dne: každý uzel má „svůj“ den ze tří, jinak ustoupí (ať se oblíbené mosty jako Stará národní galerie neopakují)
                        - (dn !== null && slot(to, 3, 'fresh') !== 0 ? 1.2 : 0);
                    candidates.push({ rel: rel.id, to, domain, isGeo, weight });
                }
            }
            candidates.sort((p, q) => q.weight - p.weight);
            for (const { rel, to, domain, isGeo } of candidates.slice(0, rules.breadth)) {
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
                // Co článek prozradil: odpověď leží v uzlu, nebo uzel v odpovědi
                const learned = [];
                if (containersOf(graph, node).includes(to.id)) learned.push(...learn(node.id, to.id));
                if (containersOf(graph, to).includes(node.id)) learned.push(...learn(to.id, node.id));
                used.add(to.id); if (to.q) usedQ.add(to.q); questions.push(question);
                bump(kinds, to.kind, 1); bump(rels, rel, 1); bump(domains, domain, 1); if (REL_GROUP[rel]) bump(groups, REL_GROUP[rel], 1); if (isGeo) geo += 1;
                question.options.forEach(option => bump(shown, option.id, 1));
                texts.push(` ${norm(question.text)} `, ` ${norm(question.explain)} `);
                if (walk(to)) return true;
                used.delete(to.id); if (to.q) usedQ.delete(to.q); questions.pop();
                bump(kinds, to.kind, -1); bump(rels, rel, -1); bump(domains, domain, -1); if (REL_GROUP[rel]) bump(groups, REL_GROUP[rel], -1); if (isGeo) geo -= 1;
                question.options.forEach(option => { bump(shown, option.id, -1); if (!shown.get(option.id)) shown.delete(option.id); });
                texts.length -= 2;
                for (const [thing, id] of learned) known.get(thing).delete(id);
                if (left <= 0) return false;
            }
            return false;
        };
        // Rozpočet kroků: na jeden začátek nejvýš budget, na celou úroveň dvacetinásobek (začátek, ze kterého řetěz nevede, se rychle vzdá)
        let total = budget * 20 * (rules.budget || 1);
        for (const start of starts.slice(0, rules.starts || 60)) {
            if (total <= 0) break;
            used.clear(); usedQ.clear(); kinds.clear(); rels.clear(); groups.clear(); domains.clear(); known.clear(); shown.clear(); questions.length = 0; texts.length = 0; geo = 0;
            used.add(start.id);
            if (start.q) usedQ.add(start.q);
            kinds.set(start.kind, 1);
            texts.push(` ${norm(start.name)} `);
            left = budget;
            const found = walk(start);
            total -= budget - Math.max(0, left);
            if (found) return { seed: String(seed), level, v: 2, start: brief(start), questions: questions.map(question => ({ ...question })) };
        }
        return null;
    };
    const generate = (graph, { seed, links = LINKS, practice = false, budget = 400, day = '' } = {}) => {
        for (let level = 0; level < LEVELS.length; level++) {
            const chain = search(graph, { seed, links, practice, budget, level, day });
            if (chain) return chain;
        }
        return null;
    };
    const chainIds = (chain) => (chain ? [chain.start.id, ...chain.questions.map(question => question.to.id)] : []);
    // Řetěz dne: jen ze semínka dne a dat (bez ohledu na předchozí dny, ať vyjde všem stejně a nezávisí na tom, kdy kdo hrál); rozcestníky se po
    // dnech střídají (search: hubs). Dny před NEW_FROM staví původní generátor (chain-legacy.js), viz legacyDailyChain a ovladač.
    const isLegacyDay = (day) => isDay(day) && day < NEW_FROM;
    const dailyChain = (graph, day) => generate(graph, { seed: seedFor(day), day });
    const practiceChain = (graph, seed) => generate(graph, { seed: `mudrlant-retezovka-cvicna-${seed}`, practice: true });
    // Původní generátor (zmrazená kopie v chain-legacy.js) pro dny před NEW_FROM; v prohlížeči ho načte ovladač, v Node require
    let legacyModule = null;
    const legacy = () => {
        if (legacyModule) return legacyModule;
        if (typeof module === 'object' && module.exports && typeof require === 'function') legacyModule = require('./chain-legacy.js');
        else if (typeof self !== 'undefined' && self.MudrlantChainLegacy) legacyModule = self.MudrlantChainLegacy;
        return legacyModule;
    };
    const legacyGraphs = new WeakMap();
    // Řetěz dne starého dne z dat témat (sources = { téma: položky } jako u buildGraph, stačí témata legacy().SOURCES)
    const legacyDailyChain = (sources, countries, day) => {
        const old = legacy();
        if (!old) return null;
        if (!legacyGraphs.has(sources)) legacyGraphs.set(sources, old.buildGraph(sources, countries));
        return old.dailyChain(legacyGraphs.get(sources), day);
    };

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
        ? { id: node.id.slice(0, 80), name: node.name.slice(0, 160), kind: String(node.kind || '').slice(0, 20), topic: String(node.topic || '').slice(0, 20), ...(/^Q\d{1,12}$/.test(node.q || '') ? { q: node.q } : {}) } : null);
    // Doplňky otázky nového generátoru (znění, obor, vysvětlení, bez fotky, jména k zakrytí); starší uložené řetězy je nemají
    const cleanExtras = (source) => {
        const extras = {};
        if (Number.isInteger(source.tpl) && source.tpl >= 0 && source.tpl < 10) extras.tpl = source.tpl;
        if (typeof source.domain === 'string' && source.domain) extras.domain = source.domain.slice(0, 20);
        if (typeof source.explain === 'string' && source.explain) extras.explain = source.explain.slice(0, 300);
        if (source.photo === false) extras.photo = false;
        if (Array.isArray(source.mask)) extras.mask = source.mask.filter(name => typeof name === 'string' && name).slice(0, 6).map(name => name.slice(0, 160));
        return extras;
    };
    const cleanQuestion = (question, index) => {
        if (!question || typeof question.text !== 'string' || !Array.isArray(question.options)) return null;
        const options = question.options.map(cleanOption);
        const from = cleanBrief(question.from);
        const to = cleanBrief(question.to);
        if (options.length !== 4 || options.some(option => !option) || !from || !to || !Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) return null;
        const r = question.rescue;
        let rescue = null;
        if (r && typeof r.text === 'string' && cleanBrief(r.from)) {
            if (r.same && Array.isArray(r.keep) && Array.isArray(r.extra)) rescue = { same: true, rel: String(r.rel || ''), from: cleanBrief(r.from), text: r.text.slice(0, 300), keep: r.keep.filter(id => typeof id === 'string').slice(0, 3), extra: r.extra.map(cleanOption).filter(Boolean).slice(0, 3), ...cleanExtras(r) };
            else if (!r.same && Array.isArray(r.options) && r.options.length === 4 && Number.isInteger(r.answer)) rescue = { same: false, rel: String(r.rel || ''), from: cleanBrief(r.from), to: cleanBrief(r.to), text: r.text.slice(0, 300), options: r.options.map(cleanOption).filter(Boolean), answer: whole(r.answer, 3), ...cleanExtras(r) };
            if (rescue && !rescue.same && rescue.options.length !== 4) rescue = null;
        }
        return { k: index + 1, rel: String(question.rel || ''), from, to, text: question.text.slice(0, 300), options, answer: question.answer, rescue, ...cleanExtras(question) };
    };
    const cleanChain = (chain) => {
        if (!chain || !Array.isArray(chain.questions) || chain.questions.length !== LINKS || !cleanBrief(chain.start)) return null;
        const questions = chain.questions.map(cleanQuestion);
        return questions.every(Boolean) ? { seed: String(chain.seed || '').slice(0, 80), ...(chain.v === 2 ? { v: 2 } : {}), start: cleanBrief(chain.start), questions } : null;
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
        music: 'music-2', book: 'book-open', artwork: 'frame', film: 'film', club: 'shield', games: 'trophy', character: 'user-round',
        region: 'map', actor: 'drama', ruler: 'crown', statesman: 'landmark', figure: 'scroll', physicist: 'atom', astronomer: 'telescope', chemist: 'flask-conical',
        stadium: 'trophy', realm: 'castle', element: 'flask-conical', planet: 'orbit', moon: 'moon', body: 'star', invention: 'lightbulb', myth: 'sparkles', gem: 'gem',
        mineral: 'pickaxe', period: 'hourglass', breed: 'paw-print', species: 'leaf', style: 'building', movement: 'palette'
    };
    const iconFor = (kind) => KIND_ICON[kind] || 'sparkles';

    // Řetěz z obrázků článků (č. 213 a 214), opravdu provlečený: liché články mají velký otvor (icons/retez/celem), sudé jsou tenké
    // tyčky z boku (bokem), které otvory sousedů procházejí. Kreslí se tyčky, přes ně velké články a nakonec ještě jednou bližší
    // (spodní) polovina každé tyčky, takže horní hrana tyčky vede za obručí a spodní před ní. Prasklý článek je icons/retez/prasknuty,
    // zachráněný CSS přebarví do tyrkysové, příští a budoucí jsou jen světlé obrysy (vybělený a ztlumený obrázek).
    // states: 'done' | 'rescued' | 'broken' | 'current' | 'todo' po článcích; fresh = index článku, který právě zacvakl.
    // Obrázky vyrábí scripts/chain-links.py z branding/ikony/clanek*.png.
    const LINK_PITCH = 25; // vzdálenost středů sousedních článků (velký článek – tyčka)
    const LINK_ART = {
        ring: { href: 'icons/retez/celem.webp', w: 40, h: 40 * 102 / 160 },
        bar: { href: 'icons/retez/bokem.webp', w: 44, h: 44 / 5 },
        broken: { href: 'icons/retez/prasknuty.webp', w: 38, h: 38 * 84 / 160 },
        brokenBar: { href: 'icons/retez/prasknuty.webp', w: 30, h: 30 * 84 / 160 }
    };
    const linkSvg = (states, { fresh = -1, label = '', className = 'h-auto w-full' } = {}) => {
        const uid = `cg${Math.abs(hash32(`${states.join('')}|${fresh}|${label}`)) % 100000}`;
        const width = 12 + (states.length - 1) * LINK_PITCH + LINK_ART.ring.w;
        const cy = 16;
        const image = (art, cx, extra = '') => `<image href="${art.href}" x="${(cx - art.w / 2).toFixed(2)}" y="${(cy - art.h / 2).toFixed(2)}" width="${art.w}" height="${art.h.toFixed(2)}" preserveAspectRatio="none"${extra}/>`;
        const bars = [], rings = [], fronts = [];
        states.forEach((state, i) => {
            const cx = 6 + LINK_ART.ring.w / 2 + i * LINK_PITCH;
            const bar = i % 2 === 1;
            const click = i === fresh ? ' chain-click' : '';
            if (state === 'broken') {
                rings.push(`<g class="chain-link chain-link-broken${click}" data-link="${i + 1}">${image(bar ? LINK_ART.brokenBar : LINK_ART.broken, cx)}</g>`);
                return;
            }
            if (!bar) { rings.push(`<g class="chain-link chain-link-${state} chain-link-ring${click}" data-link="${i + 1}">${image(LINK_ART.ring, cx)}</g>`); return; }
            bars.push(`<g class="chain-link chain-link-${state} chain-link-bar${click}" data-link="${i + 1}">${image(LINK_ART.bar, cx)}</g>`);
            fronts.push(`<g class="chain-front chain-front-${state}${click}" data-front="${i + 1}">${image(LINK_ART.bar, cx, ` clip-path="url(#${uid}-near)"`)}</g>`);
        });
        return `<svg viewBox="0 0 ${width} 32" class="${className}" role="img" aria-label="${esc(label)}"><defs><clipPath id="${uid}-near"><rect x="0" y="${cy}" width="${width}" height="${32 - cy}"/></clipPath></defs>${bars.join('')}${rings.join('')}${fronts.join('')}</svg>`;
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
                    ${rule('image', 'U otázky uvidíš fotku a pár vět o předchozí odpovědi, po odpovědi krátké vysvětlení.')}
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
    // Předchozí odpověď (podmět otázky) na kartě: fotka z Commons, krátký zakrytý úvod z Wikipedie a po odpovědi vysvětlení vazby.
    // subject = { image, text } z app.js (chainSubject; bez sítě nic nebo jen popis z dat), explain = věta po odpovědi
    const subjectHtml = (from, subject, explain) => {
        const image = subject && subject.image ? subject.image : '';
        const text = subject && subject.text ? subject.text : '';
        if (!from || (!image && !text && !explain)) return '';
        const photo = image ? `<div class="chain-photo relative min-h-[3.5rem] w-[40%] max-w-[10rem] shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/70 dark:bg-slate-700 dark:ring-slate-600"><img data-chain-photo src="${esc(image)}" alt="${esc(from.name)}" class="absolute inset-0 h-full w-full object-cover" decoding="async"></div>` : '';
        const body = explain
            ? `<p data-chain-explain class="chain-explain rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[13px] font-bold leading-snug text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800">${esc(explain)}</p>`
            : `<p data-chain-intro class="chain-intro text-[12.5px] font-semibold leading-snug text-slate-600 short:text-[12px] dark:text-slate-300">${esc(text)}</p>`;
        return `<div data-chain-subject class="flex min-h-0 flex-1 gap-2.5">${photo}<div data-chain-column class="flex min-w-0 flex-1 flex-col justify-center gap-1 overflow-hidden">
            <p data-chain-label class="flex min-w-0 items-start gap-1 text-[10.5px] font-black uppercase leading-tight tracking-widest text-slate-500 dark:text-slate-400"><i data-lucide="${iconFor(from.kind)}" class="mt-px h-3 w-3 shrink-0"></i><span class="min-w-0">${esc(from.name)}</span></p>
            ${body}</div></div>`;
    };
    // Karta otázky (vykreslí se i znovu sama, když dorazí fotka a úvod)
    const cardHtml = (view) => {
        const { attempt, ask } = view;
        const summary = summaryOf(attempt);
        const k = ask ? ask.k : Math.min(LINKS, summary.links + 1);
        const rescue = ask && ask.rescue;
        const source = rescue || (ask ? ask.question : null);
        const subject = source ? subjectHtml(source.from, view.subject, view.explain && source.explain ? source.explain : '') : '';
        return `
                <section id="chain-question" class="chain-card relative flex min-h-[6rem] flex-1 flex-col gap-1.5 overflow-hidden rounded-[1.4rem] bg-white p-3 shadow-sm ring-1 ${rescue ? 'ring-2 ring-gold-500 dark:ring-gold-400' : 'ring-slate-200/70 dark:ring-slate-700/70'} dark:bg-slate-800/70">
                    <div class="flex items-center justify-between gap-2">
                        <p class="flex min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-widest ${rescue ? 'text-gold-800 dark:text-gold-300' : 'text-slate-500 dark:text-slate-400'}">
                            <i data-lucide="${rescue ? 'shield-check' : iconFor(source ? source.from.kind : '')}" class="h-3.5 w-3.5 shrink-0"></i>
                            <span>${rescue ? 'Záchrana · za 0 bodů' : view.practice ? `Článek ${k}` : `Článek ${k} · za ${pointsWord(k)}`}</span>
                        </p>
                        ${rescue ? '' : rescueChip(attempt)}
                    </div>
                    ${subject}
                    <div class="relative flex ${subject ? 'shrink-0' : 'flex-1'} items-center"><h2 data-chain-text class="${subject ? 'text-[17px] short:text-[15.5px]' : 'text-[18px] short:text-[16.5px]'} font-black leading-snug text-slate-900 dark:text-white">${esc(source ? source.text : '')}</h2></div>
                    ${WATERMARK}
                </section>`;
    };
    // Obrazovka hry: view = { practice, attempt, ask (otázka na obrazovce), phase ('ask' | 'right' | 'wrong' | 'decide' | 'broken'), fresh (článek, který zacvakl),
    // subject (fotka a úvod předchozí odpovědi), explain (po správné odpovědi vysvětlení vazby) }
    const playHtml = (view) => {
        const { attempt, ask } = view;
        const summary = summaryOf(attempt);
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
                ${cardHtml(view)}
                <div id="chain-options" class="flex shrink-0 flex-col gap-2 short:gap-1.5">${options}</div>
                <div id="chain-panel" class="hidden shrink-0"></div>
            </div>`;
    };
    // Panel po špatné odpovědi: rozhodnutí o Záchraně, nebo přetržený řetěz se správnou odpovědí
    // Správná odpověď článku, kterou jde ukázat hned po chybě: jen když se Záchrana ptá na jinou odpověď (bez Záchrany ji ukáže brokenHtml)
    const revealableAnswer = (question) => (question && question.rescue && !question.rescue.same ? question.options[question.answer].name : '');
    // correctName = správná odpověď, když ji jde ukázat hned (Záchrana se ptá jinak); u Záchrany se stejnou odpovědí (rescue.same)
    // by ji prozradila, ukáže se až po Záchraně (v cestě řetězu) nebo po ukončení
    const decideHtml = ({ chosenName, practice, correctName = '' }) => `
        <div data-chain-decide role="alert" class="chain-panel-in flex flex-col gap-2 rounded-[1.4rem] bg-white p-3 shadow-sm ring-2 ring-rose-300 dark:bg-slate-800 dark:ring-rose-700">
            <p class="flex items-center gap-2 text-base font-black text-rose-700 dark:text-rose-300"><i data-lucide="zap" class="h-5 w-5"></i> Řetěz praská!</p>
            <p class="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">„${esc(chosenName)}“ to není.${correctName ? ` Správně bylo: <b data-chain-correct class="text-slate-900 dark:text-white">${esc(correctName)}</b>.` : ' Správnou odpověď uvidíš po Záchraně, nebo když řetěz ukončíš.'} Máš ale jednu Záchranu: dostaneš jinou otázku na stejný článek. Když ji zodpovíš, řetěz drží dál${practice ? '' : ', článek je ale za 0 bodů'}.</p>
            <button type="button" data-action="chain-rescue" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gold-700 px-4 py-3 text-base font-black text-white"><i data-lucide="shield-check" class="h-5 w-5"></i> Použít Záchranu</button>
            <button type="button" data-action="chain-giveup" class="${SECONDARY} w-full"><i data-lucide="x" class="h-4 w-4 shrink-0"></i> Ukončit řetěz</button>
        </div>`;
    // firstName = správná odpověď původní otázky, když Záchrana měla jinou (jinak ji ukazuje correctName)
    const brokenHtml = ({ correctName, k, practice, explain = '', firstName = '' }) => `
        <div data-chain-broken role="alert" class="chain-panel-in flex flex-col gap-2 rounded-[1.4rem] bg-white p-3 shadow-sm ring-2 ring-rose-300 dark:bg-slate-800 dark:ring-rose-700">
            <p class="flex items-center gap-2 text-base font-black text-rose-700 dark:text-rose-300"><i data-lucide="zap" class="h-5 w-5"></i> Řetěz se přetrhl na ${k}. článku</p>
            <p class="text-[13.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200">Správně bylo: <b class="text-slate-900 dark:text-white">${esc(correctName)}</b></p>
            ${firstName && firstName !== correctName ? `<p data-chain-first class="text-[12.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">U původní otázky: <b class="text-slate-900 dark:text-white">${esc(firstName)}</b></p>` : ''}
            ${explain ? `<p data-chain-explain class="text-[12.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(explain)}</p>` : ''}
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
                <span aria-hidden="true" class="shrink-0 text-[12px] font-black ${state === 'rescued' ? 'text-gold-800 dark:text-gold-300' : state === 'done' ? 'text-emerald-700 dark:text-emerald-300' : tone}">${state === 'broken' ? '<img src="icons/topics/clanek-prasknuty.webp" alt="" class="h-6 w-6 object-contain">' : esc(points)}</span>
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
                ${question.explain && row ? `<p data-chain-explain class="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[13px] font-bold leading-snug text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800">${esc(question.explain)}</p>` : ''}
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
    // shareCard, shareImageCounted, robeNow, appUrl, appName, awardXp, sound, isLoading, loadExtra (data/retezovka.json), loadScript (chain-legacy.js
    // pro dny před NEW_FROM), chainSubject ({ source, later, photo } → { image, text }: fotka a zakrytý úvod předchozí odpovědi) }
    // Měření (scripts/measure-denni.mjs): úsek jako performance.measure „mudrlant:<název>“
    const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const perfSpan = (name, start) => { try { performance.measure(`mudrlant:${name}`, { start, end: perfNow() }); } catch (e) { /* bez Performance API */ } };
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

        // Graf ze všech témat řetězu a vazeb z Wikidat (data/retezovka.json); načte se jednou za spuštění aplikace. Všechno musí být k dispozici,
        // jinak by řetěz dne vyšel jinak než ostatním (bez dat se Řetězovka nenačte, jako když chybí téma). Položky se berou tak, jak byly
        // ve hraný den (core.itemsAsOf: změna úrovní známosti platí od svého dne), takže graf je jeden na každou takovou verzi dat.
        let sourcesPromise = null;
        const graphs = new Map();
        const listIds = typeof WeakMap === 'function' ? new WeakMap() : null;
        let nextListId = 0;
        const listId = (list) => { if (!listIds) return 0; if (!listIds.has(list)) listIds.set(list, ++nextListId); return listIds.get(list); };
        const graph = (day = today()) => {
            if (!sourcesPromise) {
                sourcesPromise = Promise.all([Promise.all(SOURCES.map(id => deps.loadTopic(id))), deps.loadCountries(), deps.loadExtra ? deps.loadExtra() : null])
                    .catch(error => { sourcesPromise = null; throw error; });
            }
            return sourcesPromise.then(([contexts, countries, extra]) => {
                const lists = contexts.map(ctx => (core.itemsAsOf ? core.itemsAsOf(ctx.items, day) : ctx.items));
                const key = lists.map(listId).join(',');
                if (!graphs.has(key)) {
                    const started = perfNow();
                    graphs.set(key, buildGraph(Object.fromEntries(lists.map((items, i) => [SOURCES[i], items])), countries, extra));
                    perfSpan('graf', started);
                }
                return graphs.get(key);
            });
        };
        // Den před NEW_FROM (řetěz dne, který už někdo hrál původním generátorem): chain-legacy.js se načte až teď a graf z jeho témat
        const legacyChain = async (day) => {
            if (!legacy() && deps.loadScript) await deps.loadScript('chain-legacy.js');
            const old = legacy();
            if (!old) throw new Error('Původní generátor Řetězovky se nepodařilo načíst');
            const [contexts, countries] = await Promise.all([Promise.all(old.SOURCES.map(id => deps.loadTopic(id))), deps.loadCountries()]);
            await new Promise(resolve => setTimeout(resolve, 30));
            return legacyDailyChain(Object.fromEntries(contexts.map((ctx, i) => [old.SOURCES[i], ctx.items])), countries, day);
        };
        // Řetěz dne: jednou spočítaný se pamatuje (cache), ať se při každém otevření nepočítá znovu. Řetěz uložený na serveru (zamrzlé denní
        // módy, schéma 33: deps.frozenChain) má přednost – je to přesně ten, který hrál první hráč dne, i když má toto zařízení jiná data
        // (nová verze aplikace během dne); jinak se postaví ze dat a uloží (deps.claimChain vrátí platný, první uložený)
        const dayChain = async (day) => {
            const state = load();
            if (state.cache && state.cache.day === day) { const cached = cleanChain(state.cache.chain); if (cached) return cached; }
            let chain = null;
            if (!isLegacyDay(day) && deps.frozenChain) chain = cleanChain(await deps.frozenChain(day).catch(() => null));
            if (!chain && isLegacyDay(day)) chain = await legacyChain(day);
            else if (!chain) {
                const built = await graph(day);
                // Výpočet chvíli trvá: nejdřív se nechá vykreslit načítání
                await new Promise(resolve => setTimeout(resolve, 30));
                const started = perfNow();
                chain = dailyChain(built, day);
                perfSpan('retez-dne', started);
                if (chain && deps.claimChain) chain = cleanChain(await deps.claimChain(day, chain).catch(() => null)) || chain;
            }
            if (!chain) throw new Error('Řetěz dne se nepodařilo sestavit');
            const fresh = load();
            fresh.cache = { day, chain };
            save(fresh);
            return chain;
        };
        // Fotka a úvod předchozí odpovědi (app.js chainSubject: Wikipedie a Commons s časovým limitem, bez sítě popis z dat nebo nic).
        // Pamatuje se po otázce; otázka se ukáže hned a obsah se do karty doplní, až dorazí (hra na něj nikdy nečeká)
        const SUBJECT_TIMEOUT = 4500;
        const subjects = new Map();
        const subjectKey = (ask) => (ask ? `${attempt ? attempt.chain.seed : ''}|${ask.k}|${ask.rescue ? `r:${ask.rescue.from.id}` : ask.question.from.id}` : '');
        const subjectSource = (ask) => {
            if (!ask) return null;
            if (ask.rescue) return { ...ask.rescue, mask: [] };
            return ask.question;
        };
        const requestSubject = (ask) => {
            const key = subjectKey(ask);
            if (!key || subjects.has(key) || !deps.chainSubject) return;
            subjects.set(key, null);
            const source = subjectSource(ask);
            // Odpovědi pozdějších článků (úvod je nesmí prozradit dopředu); začátek a dřívější odpovědi jsou na obrazovce
            const later = attempt.chain.questions.slice(ask.k).map(question => question.to.name);
            let timer = null;
            Promise.race([Promise.resolve().then(() => deps.chainSubject({ source, later, photo: source.photo !== false })), new Promise(resolve => { timer = setTimeout(() => resolve(null), SUBJECT_TIMEOUT); })])
                .catch(() => null)
                .then(info => {
                    clearTimeout(timer);
                    const value = info && (info.image || info.text) ? { image: info.image || '', text: info.text || '' } : null;
                    subjects.set(key, value);
                    if (!value || deps.getScreen() !== 'chain' || !current || subjectKey(current.ask) !== key) return;
                    paintCard();
                });
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
                dot: tile.fresh ? 'data-chain-new' : '', attrs: `data-chain-status="${view.status}"`, done: view.status === 'done', cta: view.status === 'progress' ? 'Hrát dál' : 'Hrát' });
        };
        // Řádky dnešních výzev překresluje app.js společně (zvýrazněný řádek a počet hotových závisí na všech)
        const paintTile = () => { if (deps.getScreen() === 'home' && deps.paintHome) deps.paintHome(); };
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
                // Celý řetěz: pomůcka Půl na půl do Dobývání (blok 30, nejvýš jednou za týden; oslavu udělá app.js)
                if (saved && saved.item && deps.itemGranted) deps.itemGranted(saved.item);
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
                renderPlay({ phase: 'decide', ask, marks: { chosen: attempt.pending.chosen, right: false }, panel: decideHtml({ chosenName: chosen ? chosen.name : '', practice: attempt.practice, correctName: revealableAnswer(ask.question) }) });
                return;
            }
            renderPlay({ phase: 'ask' });
        };
        const startPractice = async () => {
            if (opening || busy) return;
            stopTimers();
            show(loadingHtml(helpers(), 'Skládám cvičný řetěz…'));
            let built;
            try { built = await graph(today()); } catch (error) { deps.showToast('Cvičnou řetězovku se teď nepodařilo načíst.'); deps.renderHome(); return; }
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
        // Úvod předchozí odpovědi se vejde do karty bez posouvání a bez uříznutého textu: celé věty (dvě, jinak jedna), jinak jen fotka;
        // vysvětlení po odpovědi zůstane vždy (uvolní se mu místo bez fotky, menším písmem a bez štítku)
        const fitSubject = () => {
            const block = deps.appContent.querySelector('[data-chain-subject]');
            if (!block) return;
            const column = block.querySelector('[data-chain-column]');
            const overflows = () => Boolean(column) && column.scrollHeight > column.clientHeight + 1;
            const intro = block.querySelector('[data-chain-intro]');
            if (intro && overflows()) {
                const sentences = intro.textContent.match(/[^.!?…]+[.!?…]+/g) || [];
                if (sentences.length > 1) intro.textContent = sentences[0].trim();
                if (overflows()) intro.remove();
            }
            const explain = block.querySelector('[data-chain-explain]');
            const photo = block.querySelector('.chain-photo');
            if (photo && (block.clientHeight < 52 || (explain && overflows()))) photo.remove();
            if (explain && overflows()) explain.classList.replace('text-[13px]', 'text-[12px]');
            const label = block.querySelector('[data-chain-label]');
            if (label && overflows()) label.remove();
            if (!block.querySelector('.chain-photo, [data-chain-intro], [data-chain-explain]')) block.remove();
        };
        let current = null; // { ask, full }: otázka na obrazovce (pro doplnění fotky a úvodu)
        const paintCard = () => {
            const card = deps.appContent.querySelector('#chain-question');
            if (!card || !current) return;
            const shake = card.classList.contains('chain-shake');
            card.outerHTML = cardHtml({ ...current.full, subject: subjects.get(subjectKey(current.ask)) || null });
            const fresh = deps.appContent.querySelector('#chain-question');
            if (fresh && shake) fresh.classList.add('chain-shake');
            deps.renderIcons(fresh || deps.appContent);
            fitSubject();
        };
        const renderPlay = (view) => {
            if (!attempt) return;
            // Otázka na obrazovce: po odpovědi ta zodpovězená (view.ask), jinak další v řadě
            const ask = view.ask || (attempt.done ? null : currentAsk(attempt));
            const full = { practice: Boolean(attempt.practice), attempt, fresh: -1, ...view, ask };
            current = { ask, full };
            full.subject = ask ? subjects.get(subjectKey(ask)) || null : null;
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
            fitSubject();
            deps.appContent.scrollTo(0, 0);
            deps.updateControlsUI();
            if (ask && view.phase === 'ask') requestSubject(ask);
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
                // Po odpovědi vysvětlení vazby na kartě („30 St Mary Axe stojí ve městě Londýn.“); s ním chvíli déle, ať se dá přečíst
                const source = ask.rescue || ask.question;
                renderPlay({ phase: 'right', ask, marks: { chosen: id, right: true }, fresh: ask.k - 1, gain: outcome === 'right' && !attempt.practice ? ask.k : 0, explain: Boolean(source.explain) });
                later(here(() => { if (attempt.done) finish(); else renderPlay({ phase: 'ask', focus: true }); }), pause(source.explain ? 2300 : 1150));
                return;
            }
            if (deps.sound) { deps.sound.play('wrong'); deps.sound.vibrate('wrong'); }
            if (outcome === 'decide') {
                renderPlay({ phase: 'wrong', ask, marks: { chosen: id, right: false }, shake: true });
                later(here(() => renderPlay({ phase: 'decide', ask, panel: decideHtml({ chosenName: optionName(ask, id), practice: attempt.practice, correctName: revealableAnswer(ask.question) }) })), pause(900));
                return;
            }
            // Přetržený řetěz: správná odpověď (u záchrany ta záchranné otázky a u jiné záchranné otázky i ta původní) se ukáže
            renderPlay({ phase: 'broken', ask, marks: { chosen: id, right: false, reveal: correctId }, shake: true });
            const firstName = ask.rescue ? ask.question.options[ask.question.answer].name : '';
            later(here(() => renderPlay({ phase: 'broken', ask, panel: brokenHtml({ correctName: optionName(ask, correctId), k: ask.k, practice: attempt.practice, explain: (ask.rescue || ask.question).explain || '', firstName }) })), pause(1400));
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
            renderPlay({ phase: 'broken', ask, panel: brokenHtml({ correctName: question.options[question.answer].name, k: ask.k, practice: attempt.practice, explain: question.explain || '' }) });
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
        const place = () => ({ icon: 'trophy', art: 'retezovka', text: attempt && attempt.practice ? 'Cvičná řetězovka' : 'Řetězovka' }); // datum ukazuje pruh řetězu pod hlavičkou

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
        ART, LINKS, MAX_SCORE, KEY, SOURCES, EXTRA_FILE, NEW_FROM, XP_PER_POINT, FULL_XP, COUNTRY_WORDS, MUSEUMS, RELATIONS, RELATION_BY_ID, FAMILY, KIND_LABEL, KIND_DOMAIN, DOMAINS, GEO_KINDS,
        MAX_GEO, KIND_MAX, LEVELS, isHub, hubPeriod, containersOf, domainOf,
        isDay, addDays, pragueDay, formatDay, pointsWord, linksWord, playersWord, hash32, seededRandom, shuffle, seedFor,
        fromCountry, inCountry, ofCountry, nationalitiesIn, buildGraph, buildQuestion, buildRescue, rescueOptions, pickDistractors, generate, dailyChain, practiceChain, edgesFrom, chainIds,
        isLegacyDay, legacy, legacyDailyChain, subjectText, maskShare,
        newAttempt, nextLink, summaryOf, validSummary, currentAsk, answer, useRescue, giveUp, xpFor, shareGrid, shareText, poseFor, cardInput, parseState, cleanAttempt, cleanChain,
        iconFor, linkSvg, stripStates, homeTile, introHtml, loadingHtml, pathHtml, playHtml, cardHtml, subjectHtml, decideHtml, brokenHtml, resultHtml, statsHtml, stepHtml, rankingHtml,
        createController
    };
});
