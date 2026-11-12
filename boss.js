// Boss týdne (Výzva od Mudrlanta, docs/NOVE-MODY.md č. 10): každý ISO týden (pražský čas) jiný boss – Mudrlant v převleku s vlastní povahou.
// Souboj: 10 těžkých otázek z tématu bosse (stejných pro všechny: semínko = týden a číslo pokusu), boss má 700 životů, správná odpověď
// mu ubere 50 + bonus za rychlost (až 30: plný do 6 s, do 20 s klesá k nule), hráč má 3 srdce (chyba i vypršený čas ubere jedno).
// Schválnosti: u 4. a 8. otázky boss schová možnosti (odpověď se píše), poslední 3 otázky mají poloviční čas. 3 pokusy za týden,
// počítá se nejlepší. Boss se během souboje mění: Plná síla (100–67 % životů), Zraněný (66–34 %), V koncích (33–1 %), Poražený (0).
// Výhra: emblém bosse (odznak boss-<id> v quiz-core.js: Album, Vitrína, titul „Přemožitel …“) a 150 XP za první výhru v týdnu.
// Společná lišta: kolik procent hráčů, kteří to zkusili, bosse porazilo; při aspoň polovině dostane každý z nich příští týden 50 XP.
// Čistá logika bez DOMu a sítě (týdny, rotace, plán otázek, poškození, stav v zařízení, dlaždice) a vykreslení obrazovek jako HTML;
// app.js napojí otázky (createRoundData), server (social.js, schéma 21: boss_results) a klepnutí. Testy: tests/boss.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantBoss = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';

    // --- Obrázky (icons/topics/<název>.webp) na jednom místě: po dodání ilustrací (docs/NOVE-MODY.md) stačí vyměnit názvy tady ---
    // Pořadí stupňů: [1 Plná síla, 2 Zraněný, 3 V koncích, 4 Poražený]. Do dodání stojí za bosse sova v barvě jeho obleku; stupně 2 a 3
    // mají stejný zástupný obrázek jako stupeň 1 a změnu ukáží efekty a filtr (třídy boss-standin-* v src/input.css).
    const ART = {
        // č. 215 boss-kapitan, 244 boss-kapitan-zraneny, 252 boss-kapitan-vkoncich, 223 boss-kapitan-porazeny
        kapitan: ['sova-dalekohled-modra', 'sova-dalekohled-modra', 'sova-dalekohled-modra', 'sova-prohra-modra'],
        // č. 216 boss-rytir, 245 boss-rytir-zraneny, 253 boss-rytir-vkoncich, 224 boss-rytir-porazeny
        rytir: ['sova-titul-10-bila', 'sova-titul-10-bila', 'sova-titul-10-bila', 'sova-prohra-bila'],
        // č. 217 boss-alchymista, 246 boss-alchymista-zraneny, 254 boss-alchymista-vkoncich, 225 boss-alchymista-porazeny
        alchymista: ['sova-titul-6-fialova', 'sova-titul-6-fialova', 'sova-titul-6-fialova', 'sova-prohra-fialova'],
        // č. 218 boss-amper, 247 boss-amper-zraneny, 255 boss-amper-vkoncich, 226 boss-amper-porazeny
        amper: ['sova-vyzva-zlata', 'sova-vyzva-zlata', 'sova-vyzva-zlata', 'sova-prohra-zlata'],
        // č. 219 boss-maestro, 248 boss-maestro-zraneny, 256 boss-maestro-vkoncich, 227 boss-maestro-porazeny
        maestro: ['sova-titul-8-cerna', 'sova-titul-8-cerna', 'sova-titul-8-cerna', 'sova-prohra-cerna'],
        // č. 220 boss-druid, 249 boss-druid-zraneny, 257 boss-druid-vkoncich, 228 boss-druid-porazeny
        druid: ['sova-titul-9-zelena', 'sova-titul-9-zelena', 'sova-titul-9-zelena', 'sova-prohra-zelena'],
        // č. 221 boss-olympan, 250 boss-olympan-zraneny, 258 boss-olympan-vkoncich, 229 boss-olympan-porazeny
        olympan: ['sova-titul-11', 'sova-titul-11', 'sova-titul-11', 'sova-prohra'],
        // č. 222 boss-reziser, 251 boss-reziser-zraneny, 259 boss-reziser-vkoncich, 230 boss-reziser-porazeny
        reziser: ['sova-oslava-ruzova', 'sova-oslava-ruzova', 'sova-oslava-ruzova', 'sova-prohra-ruzova'],
        // č. 231 textura-arena: pozadí arény (na výšku); do dodání prázdné a arénu kreslí CSS přechod .boss-arena
        arena: ''
    };

    // --- Pravidla ---
    const HP = 700;
    const BASE_DAMAGE = 50;
    const SPEED_BONUS = 30;
    const FULL_BONUS_MS = 6000;
    const ZERO_BONUS_MS = 20000;
    const HEARTS = 3;
    const QUESTIONS = 10;
    const ATTEMPTS = 3;
    // Schválnosti: psaná odpověď (index otázky od 0) a poloviční čas od této otázky do konce
    const TYPED_SLOTS = [3, 7];
    const HALF_TIME_FROM = 7;
    // Čas na otázku: výběr z možností 30 s, psaní 40 s; poslední tři otázky polovina
    const TIME_MS = 30000;
    const TYPED_TIME_MS = 40000;
    // Těžké otázky: známé položky tématu po třetinách podle známosti (data jsou v kategorii seřazená od nejznámějších);
    // první tři otázky ze střední třetiny, zbytek z nejméně známé třetiny
    const TIERS = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2];
    const WIN_XP = 150;
    const COMMUNITY_XP = 50;
    const COMMUNITY_SHARE = 0.5;
    const KEY = 'mudrlant.boss';
    const HISTORY_WEEKS = 16;
    // Týden, kdy začal Kapitán (první v rotaci); rotace jde dál po týdnech v pořadí BOSSES
    const ROTATION_START = '2026-11-09';

    // --- Bossové: id, jméno (1. a 4. pád), krátký 2. pád do titulu, téma, povaha a hlášky ---
    // intro = úvodní řeč (3 varianty), hit = zásah, taunt = posměšek po chybě hráče podle stupně (1 nafoukaný, 2 nervózní, 3 zoufalý),
    // stage = hláška při přechodu do stupně 2 a 3, defeat = porážka bosse, win = boss vyhrál. Texty neoslovují hráče v minulém čase (rod).
    const BOSSES = [
        {
            id: 'kapitan', name: 'Kapitán Mudrlant', whom: 'Kapitána Mudrlanta', title: 'Přemožitel Kapitána', topic: 'zemepis', epithet: 'Mořský vlk',
            intro: [
                'Ahoj, posádko! Obeplul jsem svět sedmkrát, z toho dvakrát pozpátku. Myslíš, že mě porazíš v zeměpisu? To spíš na Sahaře zaprší kakao!',
                'Vítej na palubě! Byl jsem na všech sedmi kontinentech a na osmém taky, jen ho ještě nikdo nenakreslil. Teď tvoje znalosti prověří pořádná bouře!',
                'Kotvy dolů! Znám každý ostrov, každou řeku i každou louži v přístavu. Deset otázek a uvidíme, kdo tu kormidluje a kdo jen čvachtá!'
            ],
            hit: ['Au! To byla vlna jako hrom!', 'Hrom a blesky, přímý zásah!', 'Kormidlo mi ujelo!'],
            taunt: {
                1: ['Ha! To by věděl i můj papoušek!', 'Vedle jak ta jedle! Tam jsem byl už stokrát.', 'Špatný kurz, posádko! Takhle doplujeme leda do vany.'],
                2: ['Uf… dobře, že tahle vlna šla vedle. Už jsem začínal nabírat vodu.', 'Ha, chyba! Jen si na chvilku sednu, nějak se to tu houpe.'],
                3: ['Konečně chyba! Rychle, záchranný kruh! Ještě se udržím nad vodou!', 'Ještě nejsem na dně! Kapitán opouští loď poslední!']
            },
            stage: {
                2: ['Hrom do toho! Moje loď nabírá vodu!', 'Au, au! Takovou bouři jsem nezažil ani u mysu Horn!'],
                3: ['Plachty jsou na cáry… ale ještě pluju!', 'Mayday, mayday! Potápím se, ale vlajku nestáhnu!']
            },
            defeat: ['Vzdávám se! Tvůj zeměpis je ostřejší než útesy u Gibraltaru.', 'Ztroskotal jsem… Gratuluju, tahle mapa teď patří tobě!'],
            win: ['Ha! Kapitánem zůstávám já. Přijď zase, posádko!', 'Moře je dnes moje! Příště si vezmi lepší kompas.']
        },
        {
            id: 'rytir', name: 'Rytíř Mudrlant', whom: 'Rytíře Mudrlanta', title: 'Přemožitel Rytíře', topic: 'historie', epithet: 'Vznešený rytíř',
            intro: [
                'Buď pozdravena, statečná duše! Já, Rytíř Mudrlant, pamatuji bitvu u Kresčaku i první knedlík. V dějinách mne nepřemůže nikdo!',
                'Slyšte, slyšte! Přede mnou stojí vyzyvatel… či snad vyzyvatelka? Nuže, mé brnění je z čistého vědění a můj meč z letopočtů!',
                'Vstupuješ na mé kolbiště? Pročež tedy! Tvé vědění o dávných věcech podrobím zkoušce hodné krále.'
            ],
            hit: ['Ouha! Má zbroj řinčí!', 'Při všech svatých, zásah!', 'Vskutku pádná rána!'],
            taunt: {
                1: ['Cha! Tvá znalost dějin pokulhává jako kůň bez podkovy.', 'Omyl! I panoš by to věděl, a ten umí jen leštit boty.', 'Nikoli, nikoli! Takto se dějiny nepsaly.'],
                2: ['Hm, omyl… ehm, s tím jsem vskutku počítal. Zajisté.', 'Ještěže tak. Mé brnění už začalo podezřele skřípat.'],
                3: ['Omyl! Ó nebesa, děkuji vám! Ještě nepadám!', 'Ha! Ještě se držím v sedle… sotva, ale držím!']
            },
            stage: {
                2: ['Ouha! Má přilba je promáčklá jako hrnec!', 'Toť nevídané! Kdo mi pocuchal chochol?!'],
                3: ['Mé brnění padá na kusy… však čest mi zůstává!', 'Kůň utekl, meč je tupý… ale vzdát se? Nikdy! Snad.']
            },
            defeat: ['Pokořen! Skládám meč k tvým nohám. Dějiny si tě zapamatují!', 'Vzdávám se, urozená bytosti! Tvé vědění je ostřejší než mé kopí.'],
            win: ['Vítězství je mé, jak velí kronika! Vrať se, až dočteš dějepis.', 'Kolbiště zůstává mé. Však statečnost ti upřít nelze!']
        },
        {
            id: 'alchymista', name: 'Alchymista', whom: 'Alchymistu', title: 'Přemožitel Alchymisty', topic: 'chemie', epithet: 'Šílený vědec',
            intro: [
                'Muhaha! Vítej v mé laboratoři! Tady všechno bublá, syčí a občas… BUM! Tvůj mozek bude můj další pokus!',
                'Pozor, nešlápni do toho zeleného slizu! Uvařil jsem lektvar z deseti otázek. Kdo nezná odpověď, ten zezelená!',
                'Bublá to, bublá! Promíchám protony, neutrony a trochu tvého sebevědomí. Uvidíme, co z toho vybouchne!'
            ],
            hit: ['BUM! Tohle jsem nenamíchal!', 'Au! Vyteklo mi to na plášť!', 'Pšššš! Moje baňka!'],
            taunt: {
                1: ['Muhaha! Chyba! Ještě kapka a vybuchneš ty!', 'Špatně! Tohle bych nedal ani do zkumavky.', 'Bubli bubli! Tahle odpověď se právě rozpustila.'],
                2: ['Uf… chyba… Výborně, aspoň zalepím tu prasklou baňku.', 'Ha… ha… Proč se mi třesou zkumavky?'],
                3: ['Chyba! Konečně! Rychle, lektvar uzdravení… kam jsem ho dal?!', 'Muha… ha… Ještě mi zbyla jedna nevybuchlá baňka!']
            },
            stage: {
                2: ['Ajaj! Brýle se mi zamlžily a vousy zezelenaly!', 'Tohle bouchlo víc, než jsem čekal! Kde mám obočí?'],
                3: ['Laboratoř hoří… teda jen trochu kouří… teda hodně kouří!', 'Lektvar došel a plášť je samá díra! Ale vzorec ještě mám!']
            },
            defeat: ['Pšššš… Vyprchal jsem jako starý lektvar. Gratuluju, tvoje chemie funguje!', 'BUM a konec! Tuhle reakci jsem nečekal. Klobouk dolů!'],
            win: ['Muhaha! Pokus se vydařil, vítězí věda! Přijď zas, mám nový lektvar.', 'Experiment ukončen! Výsledek: Alchymista jedna, ty nula. Zkus to znovu!']
        },
        {
            id: 'amper', name: 'Profesor Ampér', whom: 'Profesora Ampéra', title: 'Přemožitel Profesora Ampéra', topic: 'fyzika', epithet: 'Nabitý energií',
            intro: [
                'Bzzzt! Jsem nabitý až po konečky brk! Odpor je marný, ale klidně to zkus. Ohmův zákon tě nešetří!',
                'Vítej v mé elektrárně! Mám napětí jako tisíc baterek a otázky rychlé jako blesk. Kdo neví, toho to kopne!',
                'Proud myšlenek zapnut! Moje otázky jsou rychlejší než světlo… no dobře, skoro. Jdeme na to!'
            ],
            hit: ['Bzzt! Zkrat!', 'Au, to mě koplo!', 'Vyhořela mi pojistka!'],
            taunt: {
                1: ['Ha! Zkrat v hlavě? To se stává i lepším obvodům!', 'Bzzz! Tohle byl pořádný odpor!', 'Vedle! Tvoje odpověď nevede proud.'],
                2: ['Uf, chyba… Aspoň si dobiju baterky.', 'Ha! Ale… proč mi tak jiskří brka?'],
                3: ['Chyba! Rychle nabíječku! Ještě svítím!', 'Baterie na tři procenta… ale pořád blikám!']
            },
            stage: {
                2: ['Au! Spálila se mi pojistka a brka mi stojí do všech stran!', 'Tohle zabzučelo! Mám zkrat v kravatě!'],
                3: ['Bliká mi kontrolka… dochází mi šťáva!', 'Napětí padá… ale vypnout se nenechám!']
            },
            defeat: ['Vybitý do posledního elektronu… Gratuluju, máš víc energie než já!', 'Bzz… pfff… Tvoje znalosti mě úplně uzemnily!'],
            win: ['Bzzzt! Dnes je proud na mé straně. Dobij se a přijď znovu!', 'Odpor byl marný! Ale příště to může zajiskřit jinak.']
        },
        {
            id: 'maestro', name: 'Maestro', whom: 'Maestra', title: 'Přemožitel Maestra', topic: 'hudba', epithet: 'Umělec s noblesou',
            intro: [
                'Ticho v sále! Maestro přichází. Dnes diriguji deset otázek a ty hraješ první housle. Pozor na falešné tóny!',
                'Ach, publikum! Připravil jsem symfonii o deseti větách. Fortissimo otázky, pianissimo odpovědi… nebo snad naopak?',
                'Raz, dva, tři… hudba začíná! Kdo nedrží takt, u toho nezahraju ani na triangl.'
            ],
            hit: ['Ó! Falešný tón… u mě!', 'Au! Praskla mi struna!', 'Taktovka mi vyletěla z ruky!'],
            taunt: {
                1: ['Falešný tón! Až mi zabrněla taktovka.', 'Ne, ne, ne! Tohle neznělo ani jako kočičí koncert.', 'Chyba! Tak se nehraje ani na hřebenu.'],
                2: ['Hm… ještě že ta chyba zazněla potichu…', 'Takt drží, takt drží… snad.'],
                3: ['Chyba! Konečně trochu harmonie pro starého maestra!', 'Hrajte dál, hrajte! Finále ještě nezaznělo!']
            },
            stage: {
                2: ['Ouvej! Praskla mi struna i motýlek!', 'Moje taktovka se ohnula! To není podle not!'],
                3: ['Že by tohle byla moje labutí píseň?', 'Kde je moje partitura?! Hraju naslepo!']
            },
            defeat: ['Bravo, bravissimo! Skláním se. Tohle bylo mistrovské dílo!', 'Opona padá… a potlesk patří tobě!'],
            win: ['Konec skladby a vítězí maestro! Přijď zas, procvič si stupnice.', 'Da capo! Zahraj to ode začátku, a tentokrát čistě.']
        },
        {
            id: 'druid', name: 'Druid', whom: 'Druida', title: 'Přemožitel Druida', topic: 'biologie', epithet: 'Mudrc lesa',
            intro: [
                'Vítej v mém lese. Je tu klid, ptáci zpívají a já kladu otázky. Neboj, nekoušu. Moje otázky trochu ano.',
                'Klid… dýchej… cítíš ten mech? Znám každý strom, každého brouka a každou houbu. Hlavně houby. Houby mám rád.',
                'Šššš, les poslouchá. Deset otázek o životě a přírodě. A když nebudeš vědět, aspoň se zasměje stará muchomůrka.'
            ],
            hit: ['Au! Spadla mi šiška na hlavu!', 'Ouvej, moje kořínky!', 'Tohle mi pocuchalo lístky!'],
            taunt: {
                1: ['Houby s octem! Tohle ví i malý hříbek.', 'Vedle. Zasaď si to do paměti a nech to vyrůst.', 'Hm, chyba. I žížala by tu správnou odpověď vyhrabala.'],
                2: ['Klid, druide, klid… dýchej… Ta chyba mi dala chvilku oddechu.', 'Ještěže tak. Už jsem začínal vadnout.'],
                3: ['Chyba! Ještě mám kořeny pevně v zemi!', 'Les mi pomáhá! Ještě nepadnu… asi.']
            },
            stage: {
                2: ['Au! Na hlavu mi přistálo hnízdo i s kosem!', 'Ztrácím listí… a to ještě není podzim!'],
                3: ['Vadnu… potřebuju trochu deště…', 'Tohle je podzim mého bossování…']
            },
            defeat: ['Padám jako starý dub… Tvoje znalost přírody je obdivuhodná.', 'Dobrá, dobrá. Les se ti klaní. A houby taky.'],
            win: ['Les zůstává můj. Přijď znovu, až vyrosteš jako houba po dešti!', 'Klid a mír. Tentokrát vítězí druid a jeho houby.']
        },
        {
            id: 'olympan', name: 'Olympan', whom: 'Olympana', title: 'Přemožitel Olympana', topic: 'mytologie', epithet: 'Hromovládce',
            intro: [
                'HROM A BLESK! Kdo se opovažuje vstoupit na Olymp? Já jsem Olympan a moje otázky padají z nebe jako blesky!',
                'Pokloň se, smrtelníku… ehm, smrtelná bytosti! Bohové se nudí a ty jsi dnešní zábava!',
                'Nebe potemnělo, mraky se valí… To jsem já! Odpovídej rychle, než ti blesk připálí odpověď!'
            ],
            hit: ['Au! Blesk do vlastní brady!', 'Při Diových fousech, zásah!', 'Hrom do mě udeřil!'],
            taunt: {
                1: ['Cha! Tohle ví na Olympu každá nymfa!', 'Bum! Blesk do špatné odpovědi!', 'Ha! I Pegas by to věděl, a ten myslí kopyty.'],
                2: ['Hm… hrom… to byl jen takový malý hromeček…', 'Uf, ještě že se nebe na chvilku vyjasnilo.'],
                3: ['Chyba! Ó Die, děkuji ti! Ještě mám jeden blesk v rukávu!', 'Ha! Olymp se ještě nezřítil!']
            },
            stage: {
                2: ['Au! Upustil jsem blesk na palec u nohy!', 'Mraky se trhají! Tohle se na Olympu nedělá!'],
                3: ['Můj trůn se kymácí! Zavolejte posla bohů, ať přinese obvaz!', 'Tohle je soumrak bohů? Teda… soumrak jednoho boha?']
            },
            defeat: ['Padám z Olympu! Tvé vědění je silnější než všichni bohové dohromady.', 'Uznávám porážku. Od dneška o tobě budou zpívat báje!'],
            win: ['Olymp stojí pevně! Vrať se, až budeš moudřejší než Athéna.', 'Hrom zahřměl naposledy! Pro dnešek.']
        },
        {
            id: 'reziser', name: 'Režisér', whom: 'Režiséra', title: 'Přemožitel Režiséra', topic: 'film', epithet: 'Dramatik',
            intro: [
                'Klapka, scéna jedna, záběr jedna… AKCE! Já jsem Režisér a dnes točíme velké drama. Hlavní roli hraješ ty!',
                'Světla! Kamera! Otázky! Tohle bude trhák. Jen doufám, že nebudeš potřebovat dvojníka.',
                'Stop, stop, stop! Ještě jednou a s větším citem… Tak. Vítej na place, dnes se točí souboj století!'
            ],
            hit: ['Střih! To bolelo!', 'Au! Kamera mi spadla na nohu!', 'To nebylo ve scénáři!'],
            taunt: {
                1: ['Stop! Špatně! Ještě jednou a tentokrát s talentem!', 'Střih! Tohle ve filmu nenecháme.', 'Ha! Tahle odpověď skončí mezi vystřiženými scénami.'],
                2: ['Hm… dobře, tahle scéna se povedla… mně.', 'Klid, klid, režisér má všechno pod kontrolou… snad.'],
                3: ['Chyba! Skvělé, točíme dál! Ještě můžu získat Oscara!', 'Ha! Zvrat v ději! Ještě nekončíme!']
            },
            stage: {
                2: ['Au! Kdo přepsal scénář?! Tohle tam nebylo!', 'Můj baret je zmačkaný! Tohle je skandál!'],
                3: ['Dochází nám film… a mně dech…', 'Tohle má být finále? Ne! Chci jiný konec!']
            },
            defeat: ['Střih! Konec! Tohle drama vyhrála hlavní hvězda. Oscar je tvůj!', 'Padá opona… Bravo! Takový konec bych nenatočil ani já.'],
            win: ['Střih! Šťastný konec pro režiséra. Zkus to znovu, natočíme pokračování!', 'A je to v plechovce! Dnes vítězí režie.']
        }
    ];
    const BY_ID = Object.fromEntries(BOSSES.map(boss => [boss.id, boss]));
    // Stupně bosse podle zbývajících životů
    const STAGES = [
        { stage: 1, name: 'Plná síla' },
        { stage: 2, name: 'Zraněný' },
        { stage: 3, name: 'V koncích' },
        { stage: 4, name: 'Poražený' }
    ];
    // Schválnosti v řeči bosse (stejné pro všechny)
    const TRICK_LINES = {
        typed: 'Schválnost! Možnosti jsem schoval. Odpověď napiš!',
        half: 'Schválnost! Teď máš jen poloviční čas!',
        both: 'Dvojitá schválnost! Bez možností a za poloviční čas!'
    };

    // --- Dny a týdny (Praha) ---
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDay = (day) => DAY_PATTERN.test(String(day || '')) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
    const dayOf = (time) => new Date(time).toISOString().slice(0, 10);
    const addDays = (day, count) => dayOf(Date.parse(`${day}T00:00:00Z`) + count * 86400000);
    const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
    let pragueFormat = null;
    try { pragueFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (error) { /* bez Intl UTC */ }
    const pragueDay = (now = Date.now()) => {
        const time = now instanceof Date ? now.getTime() : Number(now);
        if (pragueFormat) {
            const parts = {};
            pragueFormat.formatToParts(new Date(time)).forEach(part => { parts[part.type] = part.value; });
            const text = `${parts.year}-${parts.month}-${parts.day}`;
            if (isDay(text)) return text;
        }
        return dayOf(time);
    };
    // Týden = pondělí ISO týdne (RRRR-MM-DD) v pražském čase; stejné počítá server (boss_week v supabase/schema.sql)
    const mondayOf = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    const isWeek = (week) => isDay(week) && mondayOf(week) === week;
    const weekOf = (now = Date.now()) => mondayOf(pragueDay(now));
    const addWeeks = (week, count) => addDays(week, 7 * count);
    // Pořadové číslo týdne a boss týdne (rotace po týdnech od ROTATION_START)
    const weekSerial = (week) => Math.round((dayNumber(week) - dayNumber(ROTATION_START)) / 7);
    const bossForWeek = (week) => BOSSES[((weekSerial(week) % BOSSES.length) + BOSSES.length) % BOSSES.length];
    // „9.–15. 11.“ nebo „30. 11. – 6. 12.“
    const weekLabel = (week) => {
        if (!isWeek(week)) return '';
        const end = addDays(week, 6);
        const [, , m1, d1] = DAY_PATTERN.exec(week);
        const [, , m2, d2] = DAY_PATTERN.exec(end);
        return m1 === m2 ? `${Number(d1)}.–${Number(d2)}. ${Number(m2)}.` : `${Number(d1)}. ${Number(m1)}. – ${Number(d2)}. ${Number(m2)}.`;
    };
    const formatDay = (day) => { const match = DAY_PATTERN.exec(String(day || '')); return match ? `${Number(match[3])}. ${Number(match[2])}.` : ''; };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const attemptsWord = (count) => plural(count, 'pokus', 'pokusy', 'pokusů');
    // „zbývá 1 pokus“, „zbývají 2 pokusy“, „zbývá 0 pokusů“
    const attemptsLeftText = (count) => `${count >= 2 && count <= 4 ? 'zbývají' : 'zbývá'} ${attemptsWord(count)}`;

    // --- Náhoda ze semínka (stejná pro všechny hráče, jako v daily-quiz.js) ---
    const hash32 = (text) => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
        return hash >>> 0;
    };
    const seededRandom = (seedText) => {
        let state = hash32(seedText);
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    // Semínko souboje (týden a číslo pokusu 1–3) a otázky v něm (výběr možností a druh otázky)
    const seedFor = (week, attempt) => `mudrlant-boss-${week}-${attempt}`;
    const questionSeed = (week, attempt, slot, tries = 0) => `${seedFor(week, attempt)}:otazka:${slot}${tries ? `:r${tries}` : ''}`;

    // --- Plán otázek ---
    // Třetiny známosti známých položek v každé kategorii (0 nejznámější, 2 nejméně známé), jako v daily-quiz.js
    const tierCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    const tiersOf = (items) => {
        if (tierCache && tierCache.has(items)) return tierCache.get(items);
        const byCategory = new Map();
        (items || []).forEach(item => {
            if (!item || item.k !== 1 || item.nq) return;
            if (!byCategory.has(item.c)) byCategory.set(item.c, []);
            byCategory.get(item.c).push(item);
        });
        const tiers = new Map();
        byCategory.forEach(list => list.forEach((item, index) => tiers.set(item.q, Math.min(2, Math.floor(3 * index / list.length)))));
        if (tierCache) tierCache.set(items, tiers);
        return tiers;
    };
    // Kandidáti na otázku slot (od 0) v pořadí, v jakém se zkoušejí (stejné pro všechny): kategorie losem ze semínka (každá stejně často),
    // v ní položky obtížnosti TIERS[slot] seřazené podle otisku; pak zbytek obtížnosti, pak ostatní známé položky. Bez položek used.
    const candidatesFor = (week, attempt, slot, items, categoryOrder = [], used = []) => {
        const list = (items || []).filter(item => item && item.q && item.n);
        const tiers = tiersOf(items);
        const known = list.filter(item => tiers.has(item.q));
        const askable = list.filter(item => !item.nq);
        const base = known.length ? known : askable.length ? askable : list;
        const tier = TIERS[Math.max(0, Math.min(QUESTIONS - 1, slot))];
        const inTier = base.filter(item => tiers.get(item.q) === tier);
        const pool = inTier.length ? inTier : base;
        const present = new Set(pool.map(item => item.c));
        const categories = [...(categoryOrder || []).filter(key => present.has(key)), ...[...present].filter(key => !(categoryOrder || []).includes(key)).sort()];
        const rng = seededRandom(`${seedFor(week, attempt)}:${slot}:kategorie`);
        const category = categories.length ? categories[Math.floor(rng() * categories.length)] : null;
        const skip = new Set(used || []);
        const ordered = (group) => group.filter(item => !skip.has(item.q))
            .map(item => ({ item, key: hash32(`${seedFor(week, attempt)}|${slot}|${item.q}`) }))
            .sort((a, b) => a.key - b.key || String(a.item.q).localeCompare(String(b.item.q))).map(entry => entry.item);
        const seen = new Set();
        return [pool.filter(item => item.c === category), pool, base].flatMap(ordered).filter(item => (seen.has(item.q) ? false : seen.add(item.q)));
    };

    // --- Souboj ---
    const isTyped = (slot) => TYPED_SLOTS.includes(slot);
    const isHalfTime = (slot) => slot >= HALF_TIME_FROM;
    const timeLimit = (slot) => (isTyped(slot) ? TYPED_TIME_MS : TIME_MS) / (isHalfTime(slot) ? 2 : 1);
    const trickOf = (slot) => (isTyped(slot) && isHalfTime(slot) ? 'both' : isTyped(slot) ? 'typed' : isHalfTime(slot) ? 'half' : null);
    // Bonus za rychlost: plný do 6 s, pak lineárně k nule ve 20 s
    const speedBonus = (ms) => {
        const time = Math.max(0, Number(ms) || 0);
        if (time <= FULL_BONUS_MS) return SPEED_BONUS;
        if (time >= ZERO_BONUS_MS) return 0;
        return Math.round(SPEED_BONUS * (ZERO_BONUS_MS - time) / (ZERO_BONUS_MS - FULL_BONUS_MS));
    };
    const damageFor = (correct, ms) => (correct ? BASE_DAMAGE + speedBonus(ms) : 0);
    // Životy v procentech (zaokrouhleno nahoru: dokud boss žije, ukáže aspoň 1 %)
    const hpPercent = (hp) => Math.max(0, Math.min(100, Math.ceil(Math.max(0, hp) * 100 / HP)));
    const stageOf = (hp) => {
        const percent = hpPercent(hp);
        return percent <= 0 ? 4 : percent <= 33 ? 3 : percent <= 66 ? 2 : 1;
    };
    const stageName = (stage) => (STAGES[Math.max(1, Math.min(4, stage)) - 1] || STAGES[0]).name;
    // Průběh souboje z odpovědí [{ correct, ms }]: životy bosse, srdce, uštědřené poškození, konec a výhra
    const fightStatus = (results = []) => {
        let hp = HP;
        let hearts = HEARTS;
        let correct = 0;
        let answered = 0;
        for (const row of results || []) {
            if (hp <= 0 || hearts <= 0 || answered >= QUESTIONS) break;
            answered += 1;
            if (row && row.correct) { correct += 1; hp = Math.max(0, hp - damageFor(true, row.ms)); } else hearts -= 1;
        }
        const won = hp <= 0;
        return { hp, hearts, correct, answered, damage: HP - hp, won, over: won || hearts <= 0 || answered >= QUESTIONS, stage: stageOf(hp), percent: hpPercent(hp) };
    };
    // Obrázek bosse pro stupeň a jestli jde o zástupný obrázek (stejný jako ve stupni 1: změnu ukáže jen filtr a efekty)
    const artFor = (id, stage = 1) => {
        const list = ART[id] || ART.kapitan;
        return list[Math.max(1, Math.min(4, stage)) - 1] || list[0];
    };
    const isStandIn = (id, stage) => stage > 1 && stage < 4 && artFor(id, stage) === artFor(id, 1);
    // Hláška: náhodná z dané skupiny (rng = Math.random v aplikaci, v testech semínko); avoid = nechce se zopakovat poslední
    const pickLine = (list, rng = Math.random, avoid = '') => {
        const options = (list || []).filter(Boolean);
        if (!options.length) return '';
        const fresh = options.length > 1 ? options.filter(line => line !== avoid) : options;
        return fresh[Math.floor(rng() * fresh.length) % fresh.length];
    };
    const lineFor = (boss, kind, stage = 1, rng = Math.random, avoid = '') => {
        const b = typeof boss === 'string' ? BY_ID[boss] : boss;
        if (!b) return '';
        if (kind === 'taunt') return pickLine(b.taunt[Math.max(1, Math.min(3, stage))], rng, avoid);
        if (kind === 'stage') return pickLine(b.stage[stage] || [], rng, avoid);
        return pickLine(b[kind], rng, avoid);
    };

    // --- XP ---
    const winXp = () => ({ total: WIN_XP, parts: [{ label: 'za první výhru nad bossem týdne', xp: WIN_XP }] });
    const communityXp = () => ({ total: COMMUNITY_XP, parts: [{ label: 'za společnou výhru nad bossem', xp: COMMUNITY_XP }] });
    // Společná lišta: podíl hráčů, kteří bosse porazili, z těch, kteří to zkusili; cíl = aspoň polovina
    const communityReached = (stats) => Boolean(stats && stats.players > 0 && stats.defeated >= stats.players * COMMUNITY_SHARE);

    // --- Uložený stav v zařízení (mudrlant.boss) ---
    // weeks: { týden: { boss, attempts: [{ n, damage, correct, hearts, defeated, at, owner, synced, idx }], xp (výhra zaplacena), bonus } }
    // open: rozehraný souboj { week, boss, n, owner, at, results: [{ correct, ms, typed, timeout, answer }], plan: [{ topic, q }],
    //       shown: { slot, at, data } (otázka na obrazovce: po zavření aplikace se pokračuje stejnou otázkou, čas běží dál) } nebo null
    // emblems: { boss: týden první výhry } – navždy (odznaky boss-<id>); claims: { hráč: poslední týden, za který se zkoušel vyzvednout bonus }
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const cleanText = (value, max = 80) => (typeof value === 'string' ? value.slice(0, max) : '');
    const cleanResult = (row) => (row && typeof row === 'object' ? {
        correct: Boolean(row.correct), ms: whole(row.ms, 3600000),
        ...(row.typed ? { typed: true } : {}), ...(row.timeout ? { timeout: true } : {}), ...(typeof row.answer === 'string' && row.answer ? { answer: row.answer.slice(0, 120) } : {})
    } : null);
    const cleanAttempt = (row) => {
        if (!row || typeof row !== 'object') return null;
        const damage = whole(row.damage, HP);
        return {
            n: Math.max(1, whole(row.n, ATTEMPTS)) || 1, damage, correct: whole(row.correct, QUESTIONS), hearts: whole(row.hearts, HEARTS), defeated: damage >= HP,
            at: Number.isFinite(row.at) ? row.at : 0, owner: cleanText(row.owner, 64) || 'host', synced: Boolean(row.synced),
            ...(Number.isInteger(row.idx) && row.idx >= 0 && row.idx < ATTEMPTS ? { idx: row.idx } : {})
        };
    };
    const cleanOpen = (raw) => {
        if (!raw || typeof raw !== 'object' || !isWeek(raw.week) || !BY_ID[raw.boss]) return null;
        const results = [];
        for (const row of (Array.isArray(raw.results) ? raw.results : []).slice(0, QUESTIONS)) { const clean = cleanResult(row); if (!clean) break; results.push(clean); }
        const plan = (Array.isArray(raw.plan) ? raw.plan : []).slice(0, QUESTIONS).map(entry => (entry && typeof entry.topic === 'string' && typeof entry.q === 'string' ? { topic: entry.topic, q: entry.q } : null));
        const shown = raw.shown && typeof raw.shown === 'object' && Number.isInteger(raw.shown.slot) && raw.shown.slot === results.length && Number.isFinite(raw.shown.at)
            && raw.shown.data && typeof raw.shown.data === 'object' && raw.shown.data.question ? { slot: raw.shown.slot, at: raw.shown.at, data: raw.shown.data } : null;
        return { week: raw.week, boss: raw.boss, n: Math.max(1, whole(raw.n, ATTEMPTS)) || 1, owner: cleanText(raw.owner, 64) || 'host', at: Number.isFinite(raw.at) ? raw.at : 0, results, plan, shown };
    };
    const emptyState = () => ({ v: 1, weeks: {}, open: null, emblems: {}, claims: {} });
    const parseState = (raw) => {
        const state = emptyState();
        if (!raw || typeof raw !== 'object') return state;
        if (raw.weeks && typeof raw.weeks === 'object' && !Array.isArray(raw.weeks)) {
            Object.keys(raw.weeks).filter(isWeek).sort().slice(-HISTORY_WEEKS).forEach(week => {
                const row = raw.weeks[week];
                if (!row || typeof row !== 'object') return;
                const boss = BY_ID[row.boss] ? row.boss : bossForWeek(week).id;
                const attempts = (Array.isArray(row.attempts) ? row.attempts : []).map(cleanAttempt).filter(Boolean).slice(0, 12);
                state.weeks[week] = { boss, attempts, xp: Boolean(row.xp), bonus: row.bonus === 'claimed' || row.bonus === 'none' ? row.bonus : null };
            });
        }
        if (raw.emblems && typeof raw.emblems === 'object') Object.keys(raw.emblems).filter(id => BY_ID[id] && isWeek(raw.emblems[id])).forEach(id => { state.emblems[id] = raw.emblems[id]; });
        if (raw.claims && typeof raw.claims === 'object') Object.keys(raw.claims).slice(0, 20).filter(id => isWeek(raw.claims[id])).forEach(id => { state.claims[cleanText(id, 64)] = raw.claims[id]; });
        state.open = cleanOpen(raw.open);
        return state;
    };
    const weekEntry = (state, week) => state.weeks[week] || { boss: bossForWeek(week).id, attempts: [], xp: false, bonus: null };
    // Server (přihlášený hráč): { attempts, best_damage, defeated } nebo null; zařízení počítá i rozehraný souboj
    const attemptsUsed = (state, week, server = null) => {
        const local = weekEntry(state, week).attempts.length + (state.open && state.open.week === week ? 1 : 0);
        return Math.min(ATTEMPTS, Math.max(local, server ? whole(server.attempts, ATTEMPTS) : 0));
    };
    const bestDamage = (state, week, server = null) => Math.max(0, ...weekEntry(state, week).attempts.map(row => row.damage), server ? whole(server.best_damage, HP) : 0);
    const isDefeated = (state, week, server = null) => bestDamage(state, week, server) >= HP || Boolean(server && server.defeated);
    // Nový souboj (číslo pokusu = použité pokusy + 1); null, když pokusy došly, boss je poražený nebo souboj už běží
    const startAttempt = (state, week, { now = Date.now(), owner = 'host', server = null } = {}) => {
        if (state.open || isDefeated(state, week, server)) return null;
        const used = attemptsUsed(state, week, server);
        if (used >= ATTEMPTS) return null;
        const boss = bossForWeek(week).id;
        const next = { ...state, weeks: { ...state.weeks, [week]: weekEntry(state, week) } };
        next.open = { week, boss, n: used + 1, owner, at: now, results: [], plan: [], shown: null };
        return next;
    };
    // Odpověď na otázku na obrazovce (slot = results.length)
    const addResult = (open, row) => {
        if (!open || fightStatus(open.results).over) return open;
        return { ...open, results: [...open.results, cleanResult(row)], shown: null };
    };
    // Konec souboje (i nedohraného: počítá se, jak stál): pokus do týdne, emblém při první výhře. Vrátí { state, attempt, firstWin }
    const finishAttempt = (state, now = Date.now()) => {
        const open = state.open;
        if (!open) return { state, attempt: null, firstWin: false };
        const status = fightStatus(open.results);
        const entry = weekEntry(state, open.week);
        const firstWin = status.won && !entry.attempts.some(row => row.defeated);
        const attempt = cleanAttempt({ n: open.n, damage: status.damage, correct: status.correct, hearts: status.hearts, at: now, owner: open.owner, synced: false });
        const weeks = { ...state.weeks, [open.week]: { ...entry, boss: open.boss, attempts: [...entry.attempts, attempt] } };
        const emblems = status.won && !state.emblems[open.boss] ? { ...state.emblems, [open.boss]: open.week } : state.emblems;
        return { state: { ...state, weeks, emblems, open: null }, attempt, firstWin, status };
    };
    // Souboj z minulého týdne se uzavře, jak stál (pokus se počítá); staré týdny se zapomenou
    const rollover = (state, week) => {
        if (state.open && state.open.week !== week) return finishAttempt(state).state;
        return state;
    };
    // Emblémy (poražení bossové): ze zařízení a z odznaků účtu (výhra na jiném zařízení)
    const emblemsOf = (state, badges = {}) => {
        const out = { ...((state && state.emblems) || {}) };
        BOSSES.forEach(boss => { if (!out[boss.id] && badges && badges[`boss-${boss.id}`]) out[boss.id] = true; });
        return out;
    };
    const badgeId = (bossId) => `boss-${bossId}`;
    const isBossBadge = (id) => /^boss-[a-z]+$/.test(String(id || '')) && Boolean(BY_ID[String(id).slice(5)]);
    const bossOfBadge = (id) => (isBossBadge(id) ? BY_ID[String(id).slice(5)] : null);

    // --- Dlaždice na úvodu (app.js specialTile): obrázek podle stupně nejlepšího pokusu, krátký stav, celý stav pro čtečku ---
    // view = { week, used, best, defeated, open }
    const homeTile = ({ week, used = 0, best = 0, defeated = false, open = false }) => {
        const boss = bossForWeek(week);
        const hp = defeated ? 0 : HP - Math.min(HP, best);
        const stage = stageOf(hp);
        const percent = hpPercent(hp);
        const left = Math.max(0, ATTEMPTS - used);
        const text = defeated ? 'Poraženo!' : open ? 'Souboj běží' : used ? `❤ ${percent} %` : attemptsWord(ATTEMPTS);
        const label = `Boss týdne: ${boss.name} (${boss.epithet}). ${defeated ? 'Poraženo, emblém je tvůj.'
            : open ? 'Souboj běží, klepnutím pokračuješ.'
                : used ? `Zbývá mu ${percent} % životů, ${left ? attemptsLeftText(left) : 'pokusy na tento týden došly'}.` : `Výzva na tento týden, ${attemptsWord(ATTEMPTS)}.`}`;
        return { boss, art: artFor(boss.id, stage), stage, percent, text, label, fresh: !used && !open && !defeated, standIn: isStandIn(boss.id, stage), left };
    };

    // --- Vykreslení (HTML; h = pomocné funkce z app.js: topicIcon, xpLine, medal) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    // data-keep: obrázek bosse se nepřebarví podle obleku Mudrlanta (look-robes.js přebarvuje obrázky sova-*)
    const img = (name, cls, attrs = '') => (name ? `<img src="icons/topics/${esc(name)}.webp" alt="" data-keep ${attrs} class="${cls}">` : '');
    const PRIMARY = 'boss-cta flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gradient-to-b from-rose-500 to-rose-700 px-4 py-3 text-lg font-black text-white';
    const GHOST = 'flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold text-white/85 hover:text-white';
    // Praskliny přes portrét (stupeň 2 jedna, stupeň 3 obě)
    const CRACKS = '<svg class="boss-crack" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path class="boss-crack-1" d="M64 6 L58 22 L67 30 L55 44 L62 52" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path class="boss-crack-2" d="M22 58 L33 63 L28 74 L40 80 L35 92" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    // Portrét bosse se vrstvami efektů: záře, stín na zemi, tělo (obrázek stupně), praskliny, pot, kouř, hvězdičky po porážce a vrstva
    // pro létající čísla poškození. size = třídy velikosti; enter = nástup v úvodu; idle = dýchání (v souboji)
    const portraitHtml = (boss, stage = 1, { size = 'h-24 w-24', id = '', enter = false, idle = true } = {}) => `
        <div ${id ? `id="${esc(id)}"` : ''} data-boss-portrait data-stage="${stage}" class="boss-portrait boss-stage-${stage}${isStandIn(boss.id, stage) ? ` boss-standin-${stage}` : ''} relative shrink-0 ${size}">
            <span class="boss-floor" aria-hidden="true"></span>
            <span class="boss-halo" aria-hidden="true"></span>
            <div class="boss-body${enter ? ' boss-enter' : ''}${idle ? ' boss-idle' : ''}">
                ${img(artFor(boss.id, stage), 'boss-face', `data-boss-face="${stage}"`)}
            </div>
            ${CRACKS}
            <span class="boss-sweat" aria-hidden="true"><i></i><i></i></span>
            <span class="boss-smoke" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="boss-stars" aria-hidden="true"><i>✦</i><i>✦</i><i>✦</i></span>
            <span data-boss-fx class="pointer-events-none absolute inset-0 z-20" aria-hidden="true"></span>
        </div>`;
    // Srdce hráče: plné, prázdné (obrys); lost = index srdce, které právě prasklo (dvě poloviny odpadnou)
    const HEART_PATH = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z';
    const heartHtml = (alive, breaking = false) => `<span class="boss-heart relative inline-flex h-6 w-6${breaking ? ' boss-heart-break' : ''}" data-alive="${alive}">
            <svg viewBox="0 0 24 24" class="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false"><path d="${HEART_PATH}" class="boss-heart-empty" fill="none" stroke-width="1.8"/></svg>
            ${alive || breaking ? `<svg viewBox="0 0 24 24" class="boss-heart-l absolute inset-0 h-full w-full" aria-hidden="true" focusable="false"><path d="${HEART_PATH}" class="boss-heart-fill"/></svg>
            <svg viewBox="0 0 24 24" class="boss-heart-r absolute inset-0 h-full w-full" aria-hidden="true" focusable="false"><path d="${HEART_PATH}" class="boss-heart-fill"/></svg>` : ''}
        </span>`;
    const heartsHtml = (hearts, breaking = -1) => `<span data-boss-hearts="${hearts}" role="img" aria-label="Tvoje srdce: ${hearts} ze ${HEARTS}" class="flex items-center gap-0.5">${Array.from({ length: HEARTS }, (_, index) => heartHtml(index < hearts, index === breaking)).join('')}</span>`;
    // Lišta životů: skutečná (plynule ubývá) a „duch“ za ní (dobíhá se zpožděním); šířky nastaví app.js (data-progress / style.width)
    const hpBarHtml = (hp, { big = false } = {}) => `
        <div data-boss-hp="${hp}" role="meter" aria-label="Životy bosse" aria-valuemin="0" aria-valuemax="${HP}" aria-valuenow="${hp}" aria-valuetext="${hp} z ${HP} životů" class="boss-hp relative ${big ? 'h-5' : 'h-4'} overflow-hidden rounded-full">
            <span data-boss-hp-ghost data-progress="${hpPercent(hp)}" class="boss-hp-ghost absolute inset-y-0 left-0 w-full"></span>
            <span data-boss-hp-fill data-progress="${hpPercent(hp)}" class="boss-hp-fill absolute inset-y-0 left-0 w-full"></span>
            <span class="boss-hp-text absolute inset-0 flex items-center justify-center gap-1 ${big ? 'text-[12px]' : 'text-[10.5px]'} font-black tabular-nums"><span aria-hidden="true">❤</span><span data-boss-hp-text>${hp} / ${HP}</span></span>
        </div>`;
    const attemptsDots = (used) => `<span class="flex items-center gap-1" role="img" aria-label="Pokusy: ${used} z ${ATTEMPTS} použité">${Array.from({ length: ATTEMPTS }, (_, index) => `<span class="h-2.5 w-2.5 rounded-full ${index < used ? 'bg-white/30' : 'bg-gold-300 shadow-[0_0_6px_rgba(239,197,92,0.9)]'}"></span>`).join('')}</span>`;
    // Společná lišta (přihlášený): kolik procent hráčů bosse porazilo a cíl polovina; host jen pozvánka
    const communityHtml = ({ stats = null, signedIn = false, canLogin = false, loading = false, over = false }) => {
        if (!signedIn) {
            return `<div data-boss-community="guest" class="flex items-center gap-2 rounded-2xl bg-black/30 px-3 py-2 ring-1 ring-white/15">
                <i data-lucide="users" class="h-5 w-5 shrink-0 text-gold-300"></i>
                <p class="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-white/90">${canLogin ? 'Po přihlášení uvidíš, kolik hráčů bosse porazilo, a můžeš získat společný bonus 50 XP.' : 'Hraješ v zařízení, bez společné lišty hráčů.'}</p>
                ${canLogin ? '<button type="button" data-action="boss-login" class="flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-[13px] font-black text-slate-900"><i data-lucide="log-in" class="h-4 w-4"></i>Přihlásit</button>' : ''}
            </div>`;
        }
        if (!stats) {
            return `<div data-boss-community="${loading ? 'loading' : 'off'}" class="rounded-2xl bg-black/30 px-3 py-2 text-[12px] font-semibold text-white/85 ring-1 ring-white/15">${loading ? 'Načítám, jak si vedou ostatní…' : 'Společná lišta hráčů teď není k dispozici.'}</div>`;
        }
        const percent = stats.players ? Math.round(100 * stats.defeated / stats.players) : 0;
        const reached = communityReached(stats);
        const goal = Math.round(COMMUNITY_SHARE * 100);
        const headline = stats.players ? `Bosse tento týden porazilo ${percent} % hráčů` : 'Zatím to nikdo nezkusil. Buď první!';
        const note = reached
            ? (over ? `Cíl splněn! Každý, kdo to zkusil, dostane ${COMMUNITY_XP} XP navíc.` : `Cíl splněn! Kdo to zkusí, dostane příští týden ${COMMUNITY_XP} XP navíc.`)
            : `Když ho do neděle porazí aspoň polovina hráčů, kteří to zkusili, dostane každý z nich ${COMMUNITY_XP} XP navíc.`;
        return `<div data-boss-community="${reached ? 'reached' : 'open'}" class="rounded-2xl bg-black/30 px-3 py-2 ring-1 ${reached ? 'ring-gold-300/70' : 'ring-white/15'}">
            <p class="flex items-baseline justify-between gap-2 text-[12px] font-black leading-tight"><span data-boss-community-text class="min-w-0">${esc(headline)}</span>${stats.players ? `<span class="shrink-0 text-[11px] font-bold text-white/75">${stats.defeated} z ${stats.players}</span>` : ''}</p>
            <div class="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                <span class="boss-community-fill absolute inset-y-0 left-0 w-0 rounded-full" data-progress="${percent}"></span>
                <span class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-gold-200/90"></span>
            </div>
            <p class="mt-1 text-[11px] font-semibold leading-snug ${reached ? 'text-gold-200' : 'text-white/80'}">${esc(note)}<span class="sr-only"> Cíl je ${goal} %.</span></p>
        </div>`;
    };
    // Pravidla (okno Pravidla souboje)
    const rulesHtml = (boss, topicTitle = '') => {
        const rule = (icon, text) => `<li class="flex items-start gap-2.5 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70"><i data-lucide="${icon}" class="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300"></i><span class="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">${text}</span></li>`;
        return `<ul data-boss-rules class="flex flex-col gap-1.5">
            ${rule('swords', `${esc(boss.name)} má ${HP} životů. Čeká tě ${QUESTIONS} těžkých otázek${topicTitle ? ` z tématu ${esc(topicTitle)}` : ''}, stejných pro všechny hráče.`)}
            ${rule('zap', `Správná odpověď ubere bossovi ${BASE_DAMAGE} životů a za rychlost až ${SPEED_BONUS} navíc: plný bonus do ${FULL_BONUS_MS / 1000} s, do ${ZERO_BONUS_MS / 1000} s klesá k nule.`)}
            ${rule('heart', `Máš ${HEARTS} srdce. Každá chyba i vypršený čas jedno ubere. Bez srdcí souboj končí.`)}
            ${rule('timer', `Na odpověď máš ${TIME_MS / 1000} s, na psanou ${TYPED_TIME_MS / 1000} s.`)}
            ${rule('eye-off', 'Bossovy schválnosti: u 4. a 8. otázky schová možnosti a odpověď se píše. Poslední 3 otázky mají poloviční čas.')}
            ${rule('repeat', `Na boss týdne máš ${ATTEMPTS} pokusy, počítá se nejlepší. Rozehraný souboj dohraješ později, čas ale běží dál.`)}
            ${rule('trophy', `Za výhru: emblém bosse do Alba a Vitríny, titul „${esc(boss.title)}“ a ${WIN_XP} XP za první výhru v týdnu.`)}
        </ul>`;
    };
    // Úvod souboje: aréna, nástup bosse, řeč, stav pokusů, společná lišta a tlačítko Do souboje
    // view = { boss, week, used, best, defeated, open, speech, community (communityHtml), next (boss příštího týdne), topicTitle, enter }
    const introHtml = (view, h = {}) => {
        const { boss, week, used = 0, best = 0, defeated = false, open = false, speech = '', next = null, topicTitle = '', enter = true } = view;
        const hp = defeated ? 0 : HP - Math.min(HP, best);
        const stage = stageOf(hp);
        const left = Math.max(0, ATTEMPTS - used);
        const canFight = open || (!defeated && left > 0);
        const status = defeated ? `Poraženo! Emblém a titul „${boss.title}“ jsou tvoje.`
            : open ? 'Souboj běží. Čas u otázky na obrazovce běží dál.'
                : !left ? `Pokusy na tento týden došly. Nejlepší pokus: ${best} poškození.`
                    : used ? `Nejlepší pokus: ${best} poškození · ${attemptsLeftText(left)}` : `${attemptsWord(ATTEMPTS)} na tento týden, počítá se nejlepší`;
        const button = open ? `Pokračovat v souboji · otázka ${Math.min(QUESTIONS, view.answered + 1 || 1)}/${QUESTIONS}` : used ? `Do souboje · ${used + 1}. pokus` : 'Do souboje';
        return `
            <div id="boss-intro" data-boss="${esc(boss.id)}" class="boss-arena boss-theme-${esc(boss.id)} relative flex min-h-full w-full flex-col overflow-hidden px-4 pb-4 pt-2.5 text-white short:px-3 short:pb-3 short:pt-2">
                ${ART.arena ? img(ART.arena, 'pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70', 'aria-hidden="true"') : ''}
                <span class="boss-beams" aria-hidden="true"></span>
                <div class="relative z-10 flex items-center justify-between gap-2">
                    <p class="flex min-w-0 items-center gap-1.5 rounded-full bg-black/35 py-1 pl-1 pr-2.5 text-[11px] font-black uppercase tracking-widest text-gold-200 ring-1 ring-white/15">${h.topicIcon ? h.topicIcon(boss.topic) : ''}<span class="truncate">Boss týdne · ${esc(weekLabel(week))}</span></p>
                    <span class="flex shrink-0 items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-black text-white/90 ring-1 ring-white/15">Pokusy ${attemptsDots(used)}</span>
                </div>
                <div class="relative z-10 mt-1 flex flex-col items-center">
                    ${portraitHtml(boss, defeated ? 4 : stage, { size: 'h-48 w-48 short:h-28 short:w-28', id: 'boss-stage', enter, idle: !defeated })}
                    <h1 class="boss-name -mt-1 text-center text-[26px] font-black leading-none tracking-tight short:text-[22px]">${esc(boss.name)}</h1>
                    <p class="mt-1 text-[12px] font-bold uppercase tracking-widest text-white/80">${esc(boss.epithet)}${topicTitle ? ` · ${esc(topicTitle)}` : ''}</p>
                </div>
                <div id="boss-speech" class="boss-speech relative z-10 mt-2.5 rounded-2xl bg-white px-3.5 py-2.5 text-slate-900 shadow-lg short:mt-2 short:py-2" role="status">
                    <span class="boss-speech-tail" aria-hidden="true"></span>
                    <p class="min-h-[2.6rem] text-[14px] font-bold leading-snug short:min-h-0 short:text-[13px]"><span class="sr-only">${esc(boss.name)}: ${esc(speech)}</span><span data-boss-speech-text aria-hidden="true">${esc(speech)}</span></p>
                </div>
                <div class="relative z-10 mt-2.5 flex flex-col gap-2 short:mt-2 short:gap-1.5">
                    <div class="flex items-center gap-2">
                        <span class="min-w-0 flex-1">${hpBarHtml(hp)}</span>
                        <button type="button" data-action="boss-rules" class="flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-xl bg-white/15 px-2.5 text-[12px] font-black text-white ring-1 ring-white/20"><i data-lucide="scroll-text" class="h-4 w-4"></i>Pravidla</button>
                    </div>
                    <p data-boss-status class="text-center text-[12.5px] font-bold leading-snug text-white/90">${esc(status)}</p>
                    ${view.community || ''}
                </div>
                <div class="relative z-10 mt-auto flex flex-col gap-1 pt-3 short:pt-2">
                    ${canFight ? `<button type="button" data-action="boss-start" class="${PRIMARY}"><i data-lucide="swords" class="h-5 w-5"></i> ${esc(button)}</button>`
                        : `<p data-boss-next class="rounded-2xl bg-black/35 px-3 py-2.5 text-center text-[13px] font-bold leading-snug text-white ring-1 ring-white/15">${next ? `V pondělí přijde ${esc(next.name)} (${esc(next.epithet.toLocaleLowerCase('cs'))}).` : 'V pondělí přijde nový boss.'}</p>`}
                    <div class="flex items-center justify-between gap-2">
                        <button type="button" data-action="boss-home" class="${GHOST}"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět</button>
                        <button type="button" data-action="boss-hall" class="${GHOST}"><i data-lucide="shield" class="h-4 w-4"></i> Síň bossů</button>
                    </div>
                </div>
            </div>`;
    };
    // Horní pruh souboje: portrét se stupněm, jméno, stupeň, lišta životů, srdce, číslo otázky a čas
    // view = { boss, status (fightStatus), slot, limit (ms) }
    const stripHtml = ({ boss, status, slot = 0, limit = TIME_MS }) => `
        <section id="boss-strip" data-boss="${esc(boss.id)}" data-stage="${status.stage}" class="boss-arena boss-theme-${esc(boss.id)} boss-strip-stage-${status.stage} relative shrink-0 overflow-hidden text-white">
            <span class="boss-vignette" aria-hidden="true"></span>
            <div class="relative z-10 flex items-center gap-3 px-3 pb-2 pt-2 short:gap-2.5 short:pt-1.5">
                ${portraitHtml(boss, status.stage, { size: 'h-28 w-28 short:h-[4.5rem] short:w-[4.5rem]', id: 'boss-portrait' })}
                <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                        <p class="truncate text-[15px] font-black leading-tight">${esc(boss.name)}</p>
                        <span data-boss-stage-label class="boss-stage-chip shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">${esc(stageName(status.stage))}</span>
                    </div>
                    <div class="mt-1.5">${hpBarHtml(status.hp)}</div>
                    <div class="mt-1.5 flex items-center justify-between gap-2">
                        ${heartsHtml(status.hearts)}
                        <span data-boss-count class="text-[11px] font-black tabular-nums text-white/85">Otázka ${Math.min(QUESTIONS, slot + 1)}/${QUESTIONS}</span>
                        <span data-boss-clock-chip role="timer" aria-label="Zbývající čas v sekundách" class="flex min-w-[3.25rem] items-center justify-end gap-1 text-[15px] font-black tabular-nums"><i data-lucide="timer" class="h-4 w-4 text-gold-300"></i><span data-boss-clock>${Math.ceil(limit / 1000)}</span></span>
                    </div>
                </div>
            </div>
            <div class="relative z-10 h-1.5 bg-black/45" aria-hidden="true"><span data-boss-timer class="boss-timer-fill block h-full w-full"></span></div>
            <span data-boss-flash class="boss-flash" aria-hidden="true"></span>
        </section>`;
    // Schválnost nad otázkou (štítek)
    const trickHtml = (slot) => {
        const trick = trickOf(slot);
        if (!trick) return '';
        const text = trick === 'both' ? 'Schválnost: piš odpověď a máš poloviční čas' : trick === 'typed' ? 'Schválnost: možnosti jsou schované, odpověď napiš' : 'Schválnost: poloviční čas';
        const icon = trick === 'half' ? 'hourglass' : 'eye-off';
        return `<p data-boss-trick="${trick}" class="boss-trick flex items-center gap-1.5 self-center rounded-full px-3 py-1 text-[11.5px] font-black text-white shadow-sm"><i data-lucide="${icon}" class="h-3.5 w-3.5 shrink-0"></i>${esc(text)}</p>`;
    };
    // Bublina s hláškou bosse po odpovědi (přes popis otázky; ocásek míří k portrétu)
    const bubbleHtml = (boss, text, kind = 'taunt') => `<div data-boss-bubble="${esc(kind)}" class="boss-bubble boss-bubble-${esc(kind)} pointer-events-none absolute inset-x-3 top-1 z-30 rounded-2xl px-3.5 py-2.5 shadow-xl" role="status">
            <span class="boss-bubble-tail" aria-hidden="true"></span>
            <p class="text-[10.5px] font-black uppercase tracking-widest opacity-80">${esc(boss.name)}</p>
            <p class="text-[15px] font-black leading-snug">${esc(text)}</p>
        </div>`;
    // Výsledek souboje: výhra (poražený boss, emblém, titul, XP, ohňostroj) nebo prohra (boss se směje, poškození, další pokus)
    // view = { boss, status, n, used, best, firstWin, xp, line, community, next, emblemHtml, showcase (HTML přepínače Vitríny) }
    const resultHtml = (view, h = {}) => {
        const { boss, status, used = 0, best = 0, firstWin = false, line = '', next = null } = view;
        const won = status.won;
        const left = Math.max(0, ATTEMPTS - used);
        const stage = won ? 4 : status.stage;
        const statsRow = `<div class="grid grid-cols-3 gap-1.5 text-center">
            <div class="rounded-xl bg-black/30 px-1 py-1.5 ring-1 ring-white/10"><p class="text-[10px] font-black uppercase tracking-wider text-white/75">Poškození</p><p data-boss-damage class="text-lg font-black tabular-nums leading-tight">${status.damage}</p></div>
            <div class="rounded-xl bg-black/30 px-1 py-1.5 ring-1 ring-white/10"><p class="text-[10px] font-black uppercase tracking-wider text-white/75">Správně</p><p class="text-lg font-black tabular-nums leading-tight">${status.correct}/${status.answered}</p></div>
            <div class="rounded-xl bg-black/30 px-1 py-1.5 ring-1 ring-white/10"><p class="text-[10px] font-black uppercase tracking-wider text-white/75">Srdce</p><p class="flex justify-center pt-0.5">${heartsHtml(status.hearts)}</p></div>
        </div>`;
        const reward = won ? (firstWin ? `
            <div data-boss-reward class="boss-reward relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-gold-300 to-gold-500 p-2.5 text-brand-950 shadow-lg ring-2 ring-gold-200">
                <span class="boss-emblem-in shrink-0">${view.emblemHtml || ''}</span>
                <span class="min-w-0 flex-1">
                    <span class="block text-[10.5px] font-black uppercase tracking-widest opacity-80">Emblém do Alba a Vitríny</span>
                    <span class="block text-[15px] font-black leading-tight">Titul „${esc(boss.title)}“</span>
                    <span class="mt-0.5 block text-[11px] font-bold leading-snug opacity-90">U jména ho nastavíš v Nastavení → Profil.</span>
                </span>
            </div>` : `<p class="rounded-2xl bg-black/30 px-3 py-2 text-center text-[12.5px] font-bold text-white/90 ring-1 ring-white/15">Emblém a titul už máš. Výhra se počítá!</p>`) : '';
        const again = !won && left > 0;
        return `
            <div id="boss-result" data-boss="${esc(boss.id)}" data-boss-outcome="${won ? 'won' : 'lost'}" class="boss-arena boss-theme-${esc(boss.id)} relative flex min-h-full w-full flex-col gap-2.5 overflow-hidden px-4 pb-4 pt-3 text-white short:gap-2 short:px-3 short:pb-3 short:pt-2">
                ${ART.arena ? img(ART.arena, 'pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70', 'aria-hidden="true"') : ''}
                <span class="boss-beams" aria-hidden="true"></span>
                ${won ? `<span class="boss-confetti" aria-hidden="true">${'<i></i>'.repeat(14)}</span>` : ''}
                <div class="relative z-10 flex items-center gap-3">
                    ${portraitHtml(boss, stage, { size: 'h-28 w-28 short:h-24 short:w-24', id: 'boss-result-portrait', idle: !won })}
                    <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-black uppercase tracking-widest text-gold-200">${won ? 'Boss poražen' : `${view.n}. pokus · Boss týdne`}</p>
                        <h1 data-boss-verdict tabindex="-1" class="${won ? 'boss-victory-text' : ''} text-[30px] font-black leading-none tracking-tight outline-none short:text-[26px]">${won ? 'Vítězství!' : 'Boss odolal'}</h1>
                        <p class="mt-1 text-[12.5px] font-bold leading-snug text-white/90">${won ? esc(`${boss.name} padl!`) : esc(`${boss.name} vydržel s ${status.percent} % životů.`)}</p>
                    </div>
                </div>
                <div class="boss-speech relative z-10 rounded-2xl bg-white px-3.5 py-2 text-slate-900 shadow-lg"><span class="boss-speech-tail" aria-hidden="true"></span><p class="text-[13.5px] font-bold leading-snug">${esc(line)}</p></div>
                <div class="relative z-10 flex flex-col gap-2 short:gap-1.5">
                    ${hpBarHtml(won ? 0 : status.hp)}
                    ${statsRow}
                    ${reward}
                    ${view.xp && h.xpLine ? `<div data-boss-xp class="rounded-2xl bg-black/30 px-3 py-1.5 ring-1 ring-white/15">${h.xpLine(view.xp)}</div>` : ''}
                    ${view.showcase || ''}
                    ${!won ? `<p data-boss-attempts class="text-center text-[12.5px] font-bold text-white/90">${left ? `Nejlepší pokus: ${best} poškození · ${attemptsLeftText(left)}` : `Pokusy na tento týden došly. Nejlepší pokus: ${best} poškození.${next ? ` V pondělí přijde ${next.name}.` : ''}`}</p>` : ''}
                    ${view.community || ''}
                </div>
                <div class="relative z-10 mt-auto flex gap-2 pt-1">
                    <button type="button" data-action="boss-home" class="flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-white/15 px-4 py-3 text-base font-bold text-white ring-1 ring-white/20"><i data-lucide="house" class="h-5 w-5"></i> Domů</button>
                    ${again ? `<button type="button" data-action="boss-again" class="${PRIMARY.replace('w-full', 'min-w-0 flex-1')}"><i data-lucide="swords" class="h-5 w-5 shrink-0"></i> Zkusit znovu</button>`
                        : `<button type="button" data-action="boss-hall" class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl btn-3d bg-gold-500 px-3 py-3 text-base font-black text-brand-950"><i data-lucide="shield" class="h-5 w-5 shrink-0"></i> Síň bossů</button>`}
                </div>
            </div>`;
    };
    // Síň bossů: všichni bossové s emblémy (poražení barevně), boss týdne zvýrazněný. h.medal(id, earned, cls) = emblém z app.js
    const hallHtml = ({ week, emblems = {} }, h = {}) => {
        const current = bossForWeek(week).id;
        const count = BOSSES.filter(boss => emblems[boss.id]).length;
        const row = (boss) => {
            const have = Boolean(emblems[boss.id]);
            const when = typeof emblems[boss.id] === 'string' ? emblems[boss.id] : '';
            const state = have ? (when ? `Poražen ${formatDay(when)}` : 'Poražen') : boss.id === current ? 'Boss tohoto týdne' : 'Zatím neporažen';
            return `<li data-boss-hall="${esc(boss.id)}" data-have="${have}" class="flex min-w-0 items-center gap-2.5 rounded-2xl bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800 ${boss.id === current ? 'ring-2 ring-rose-500' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}">
                ${h.medal ? h.medal(badgeId(boss.id), have, 'h-10 w-10') : ''}
                <span class="min-w-0 flex-1">
                    <span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(boss.name)} <span class="font-bold text-slate-500 dark:text-slate-400">· ${esc(h.topicTitle ? h.topicTitle(boss.topic) : boss.topic)}</span></span>
                    <span class="block text-[11.5px] font-bold leading-tight ${have ? 'text-emerald-700 dark:text-emerald-400' : boss.id === current ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}">${esc(state)}${have ? ` · titul „${esc(boss.title)}“` : ''}</span>
                </span>
            </li>`;
        };
        return `<div data-boss-hall-list class="flex flex-col gap-2">
            <p class="text-[13px] leading-snug text-slate-600 dark:text-slate-300">Každý týden přijde jiný boss. Za výhru získáš jeho emblém do Alba a Vitríny a titul u jména. <b class="text-slate-800 dark:text-slate-100">${count} z ${BOSSES.length}</b> emblémů máš.</p>
            <ul class="flex flex-col gap-1">${BOSSES.map(row).join('')}</ul>
        </div>`;
    };

    return {
        ART, HP, BASE_DAMAGE, SPEED_BONUS, FULL_BONUS_MS, ZERO_BONUS_MS, HEARTS, QUESTIONS, ATTEMPTS, TYPED_SLOTS, HALF_TIME_FROM, TIME_MS, TYPED_TIME_MS, TIERS,
        WIN_XP, COMMUNITY_XP, COMMUNITY_SHARE, KEY, ROTATION_START, BOSSES, BY_ID, STAGES, TRICK_LINES,
        pragueDay, mondayOf, isWeek, weekOf, addWeeks, weekSerial, bossForWeek, weekLabel, formatDay, attemptsWord, attemptsLeftText,
        hash32, seededRandom, seedFor, questionSeed, tiersOf, candidatesFor,
        isTyped, isHalfTime, timeLimit, trickOf, speedBonus, damageFor, hpPercent, stageOf, stageName, fightStatus, artFor, isStandIn, pickLine, lineFor,
        winXp, communityXp, communityReached,
        parseState, emptyState, weekEntry, attemptsUsed, bestDamage, isDefeated, startAttempt, addResult, finishAttempt, rollover, emblemsOf, badgeId, isBossBadge, bossOfBadge,
        homeTile, portraitHtml, heartsHtml, hpBarHtml, communityHtml, rulesHtml, introHtml, stripHtml, trickHtml, bubbleHtml, resultHtml, hallHtml
    };
});
