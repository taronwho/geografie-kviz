// Odměny a vzhled: katalog odměn (barevná témata, barva obleku sovy, rámečky profilu, postavičky jako obrázek hráče, titul u jména),
// jejich odemykání podle úrovně nebo odznaku a uložené volby hráče. Samotné části (výběry a jejich vykreslení) se do záložek
// Nastavení (Hra, Profil, Mudrlant; vlastnost tab) přidávají z vlastních souborů přes Look.register(...): look-themes.js,
// look-robes.js, look-frames.js, look-owl.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    // Vlajky států pro vlaječku (look-flags.js) a stupně sov titulů (quiz-core.js); v prohlížeči se oba načítají před tímto souborem
    const api = factory(root, root.MudrlantFlags || (isNode ? require('./look-flags.js') : null), root.MudrlantCore || (isNode ? require('./quiz-core.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantLook = api;
})(typeof self !== 'undefined' ? self : this, (root, Flags, Core) => {
    'use strict';
    const KEY = 'mudrlant.look';

    // Katalog: level = od jaké úrovně je odměna k dispozici, badge = po kterém odznaku (id z quiz-core), chest = jen vzácný dárek z Truhly
    // Mudrlanta (rewards.js). Každá položka má id a title.
    // Barevná témata v pořadí úrovní (v tomto pořadí je ukazuje výběr v Nastavení → Hra, dvě řady po osmi)
    const THEMES = [
        { id: 'vinova', title: 'Vínová', level: 1 },
        { id: 'les', title: 'Hluboký les', level: 8 },
        { id: 'matova', title: 'Mátová', level: 11 },
        { id: 'ocean', title: 'Oceán', level: 16 },
        { id: 'limetka', title: 'Limetková', level: 22 },
        { id: 'zapad', title: 'Západ slunce', level: 26 },
        { id: 'levandule', title: 'Levandulová', level: 33 },
        { id: 'fialova', title: 'Fialová noc', level: 38 },
        { id: 'poust', title: 'Pouštní', level: 47 },
        { id: 'zlata', title: 'Zlatá', level: 52 },
        { id: 'sakura', title: 'Sakura', level: 62 },
        { id: 'diamant', title: 'Diamant', level: 70 },
        { id: 'pulnoc', title: 'Půlnoční', level: 75 },
        { id: 'lava', title: 'Lávová', level: 85 },
        { id: 'legenda', title: 'Legenda', level: 90 },
        { id: 'zare', title: 'Polární záře', level: 95 }
    ];
    const ROBES = [
        { id: 'vinova', title: 'Vínový talár', level: 1 },
        { id: 'zelena', title: 'Zelený talár', level: 6 },
        { id: 'modra', title: 'Modrý talár', level: 12 },
        { id: 'ruzova', title: 'Růžový talár', level: 20 },
        { id: 'fialova', title: 'Fialový talár', level: 30 },
        { id: 'cerna', title: 'Černý talár', level: 45 },
        { id: 'zlata', title: 'Zlatý talár', level: 65 },
        { id: 'bila', title: 'Bílý talár', level: 100, noGift: true }
    ];
    const FRAMES = [
        { id: 'zadny', title: 'Bez rámečku', level: 1 },
        { id: 'bronz', title: 'Bronzový', level: 5 },
        { id: 'stribro', title: 'Stříbrný', level: 15 },
        { id: 'zlato', title: 'Zlatý', level: 25 },
        { id: 'vavrin', title: 'Vavřínový', badge: 'vitez' },
        { id: 'plamen', title: 'Plamenný', badge: 'mesic' },
        { id: 'diamant', title: 'Diamantový', level: 60 },
        { id: 'medailista', title: 'Medailista turnaje', badge: 'turnaj-bronz' },
        { id: 'mistr-turnaje', title: 'Mistr turnaje', badge: 'turnaj-zlato' }
    ];
    // Rámečky ligových sezón (league-seasons.js, schéma 18): za ligu Zlato, Platina, Diamant nebo Mistr jako vrchol skončené ligové sezóny
    // (kalendářního měsíce); vyšší liga odemkne i rámečky nižších a rámeček zůstane navždy. Odemyká je setLeagueBest (nejlepší liga skončené
    // sezóny, kterou app.js pamatuje v zařízení), ne úroveň ani odznak, takže je truhla nedává. leagueName = název ligy v textech.
    const LEAGUE_FRAMES = [
        { id: 'liga-stribro', title: 'Stříbrná sezóna', league: 'stribro', leagueName: 'Stříbro' },
        { id: 'liga-zlato', title: 'Zlatá sezóna', league: 'zlato', leagueName: 'Zlato' },
        { id: 'liga-platina', title: 'Platinová sezóna', league: 'platina', leagueName: 'Platina' },
        { id: 'liga-diamant', title: 'Diamantová sezóna', league: 'diamant', leagueName: 'Diamant' },
        { id: 'liga-mistr', title: 'Mistrovská sezóna', league: 'mistr', leagueName: 'Mistr' }
    ];
    FRAMES.push(...LEAGUE_FRAMES);
    const LEAGUE_ORDER = ['bronz', 'stribro', 'zlato', 'platina', 'diamant', 'mistr'];
    let leagueBest = null;
    const setLeagueBest = (league) => { leagueBest = LEAGUE_ORDER.includes(league) ? league : null; };
    // ctx.leagueBest (testy) má přednost před uloženou hodnotou
    const leagueUnlocked = (item, ctx) => {
        const best = ctx && ctx.leagueBest !== undefined ? ctx.leagueBest : leagueBest;
        return LEAGUE_ORDER.includes(best) && LEAGUE_ORDER.indexOf(best) >= LEAGUE_ORDER.indexOf(item.league);
    };
    // Postavičky: obrázky hráče za odměny (k základním emoji ze social.js AVATARS, ta jsou zdarma). Obrázek icons/avatars/<id>.webp
    // a přes něj vrstvy přebarvených částí icons/avatars/<id>-<část><barva>.webp (scripts/avatar-icons.py; části v pořadí parts = čísla 1, 2,
    // barvy = AVATAR_COLORS). Každá se odemyká stejně jako emoji, které nahradila (was): uložené staré emoji se ukáže jako postavička
    // a při uložení profilu se zapíše její id. Položka bez parts by byla emoji bez obrázku (žádná taková teď není).
    // Postavička je id z malých písmen (nejvýš 6 znaků, databáze pustí 1–8 znaků celkem).
    // colors = čísla barev (AVATAR_COLORS), které výběr u každé části nabídne (barvy moc blízko původní jsou vynechané); uložená
    // jiná barva 1–9 se přesto vykreslí (vrstva existuje pro všechny).
    const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const AVATARS = [
        { id: 'cervik', title: 'Knihomol', level: 3, was: '🦅', parts: ['Kniha', 'Červík'], colors: [[2, 3, 4, 5, 6, 7, 9], [1, 2, 4, 5, 6, 7, 8, 9]] },
        { id: 'axolot', title: 'Axolotl kosmonaut', level: 8, was: '🐺', parts: ['Axolotl', 'Skafandr'], colors: [[2, 3, 4, 5, 6, 7, 9], [1, 2, 3, 4, 6, 7, 8, 9]] },
        { id: 'kaktus', title: 'Kaktus detektiv', level: 13, was: '🦈', parts: ['Klobouk', 'Květináč'], colors: [[3, 4, 5, 6, 7, 8, 9], [3, 4, 5, 6, 7, 8, 9]] },
        { id: 'drak', title: 'Drak čajník', level: 20, was: '🐉', parts: ['Dráček', 'Krunýř'], colors: [[1, 2, 3, 4, 5, 6, 8, 9], [3, 4, 5, 6, 7, 8, 9]] },
        { id: 'mamut', title: 'Mamut DJ', level: 28, was: '🦖', parts: ['Sluchátka', 'Srst'], colors: [[1, 2, 3, 4, 6, 7, 8, 9], [4, 5, 6, 7, 8, 9]] },
        { id: 'meduza', title: 'Disko medúza', level: 36, was: '🦚', parts: ['Koule'], colors: [ALL] },
        { id: 'lenoch', title: 'Lenochod kouzelník', level: 44, was: '🦩', parts: ['Klobouk', 'Měsíc'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'tukan', title: 'Robotukan', level: 55, was: '🐅', parts: ['Zobák', 'Kytička'], colors: [[1, 4, 5, 6, 7, 8, 9], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'lev', title: 'Galaktický lev', level: 65, was: '🦁', parts: ['Hříva'], colors: [ALL] },
        { id: 'fenix', title: 'Fénix učenec', level: 80, was: '👑', parts: ['Peří'], colors: [[3, 4, 5, 6, 7, 8, 9]] },
        { id: 'krecek', title: 'Křeček boxer', badge: 'turnaj-ucast', was: '🏅', parts: ['Rukavice', 'Čelenka'], colors: [[3, 4, 5, 6, 7, 8, 9], ALL] },
        { id: 'rytir', title: 'Pásovec rytíř', badge: 'turnaj-bronz', was: '🥉', parts: ['Chochol', 'Brnění'], colors: [[1, 2, 3, 4, 6, 7, 8, 9], [3, 4, 5, 6, 7, 8, 9]] },
        { id: 'narval', title: 'Narval šermíř', badge: 'turnaj-stribro', was: '🥈', parts: ['Narval', 'Dres'], colors: [[1, 2, 3, 4, 7, 8, 9], ALL] },
        { id: 'zelva', title: 'Želva šampion', badge: 'turnaj-zlato', was: '🏆', parts: ['Plášť', 'Pohár'], colors: [[1, 2, 3, 4, 5, 6, 8, 9], [1, 4, 5, 6, 7, 8, 9]] },
        // Odznaky Kvízu dne, Bleskovky, Přežití a otázek Ukaž na mapě, Odhadni a Seřaď
        { id: 'hodiny', title: 'Utíkající přesýpačky', badge: 'kviz-tyden', was: '⏱️', parts: ['Tenisky', 'Písek'], colors: [[2, 3, 4, 5, 6, 7, 9], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'chamel', title: 'Chameleon jednička', badge: 'kviz-perfekt', was: '💯', parts: ['Kůže', 'Bříško'], colors: [[1, 2, 3, 5, 6, 7, 8, 9], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'gepard', title: 'Bleskový gepard', badge: 'bleskovka-16', was: '⚡', parts: ['Gepard', 'Čelenka a tenisky'], colors: [[1, 2, 3, 4, 7, 8, 9], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'zelvus', title: 'Želvušek v brnění', badge: 'preziti-20', was: '🐻', parts: ['Tělo', 'Srdíčka'], colors: [[3, 4, 5, 6, 7, 8, 9], [2, 3, 4, 5, 6, 7, 9]] },
        { id: 'tucnak', title: 'Tučňák badatel', badge: 'mapa-25', was: '🗺️', parts: ['Helma'], colors: [[1, 4, 5, 6, 7, 8, 9]] },
        { id: 'zabak', title: 'Žabí lučištník', badge: 'odhad-25', was: '🎯', parts: ['Žabák', 'Terč'], colors: [[1, 2, 3, 5, 6, 7, 8, 9], [3, 4, 5, 6, 7, 8, 9]] },
        { id: 'myval', title: 'Mýval knihovník', badge: 'serad-25', was: '🧩', parts: ['Knihy'], colors: [ALL] },
        // Legendární postavičky (docs/OBRAZKY.md č. 119–132): jedna za diplom každého tématu (plné mistrovství, rewards.js noteDiplomas).
        // diploma = id tématu; odemyká je ctx.diplomas (téma → den zisku), úrovní, odznakem, truhlou ani Sezónou se nezískají.
        { id: 'albatr', title: 'Albatros mořeplavec', diploma: 'zemepis', parts: ['Uniforma', 'Moře a nebe'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 7, 8, 9]] },
        { id: 'gryf', title: 'Gryf praporečník', diploma: 'vlajky', parts: ['Kabátec', 'Záře a prapory'], colors: [[2, 3, 4, 5, 6, 7, 8, 9], [2, 3, 4, 5, 6, 7, 9]] },
        { id: 'slon', title: 'Slon kronikář', diploma: 'historie', parts: ['Slon', 'Záře'], colors: [ALL, [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'sfinga', title: 'Sfinga strážkyně', diploma: 'mytologie', parts: ['Sfinga', 'Záře'], colors: [ALL, [1, 2, 3, 4, 6, 7, 8, 9]] },
        { id: 'jelen', title: 'Jelen pán lesa', diploma: 'biologie', parts: ['Plášť', 'Les'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 5, 6, 7, 8, 9]] },
        { id: 'golem', title: 'Krystalový golem', diploma: 'geologie', parts: ['Krystaly', 'Záře'], colors: [[1, 2, 3, 4, 5, 6, 8, 9], [1, 2, 3, 4, 5, 6, 8, 9]] },
        { id: 'liska', title: 'Liška alchymistka', diploma: 'chemie', parts: ['Kabát', 'Brýle'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'chobot', title: 'Chobotnice fyzička', diploma: 'fyzika', parts: ['Chobotnice', 'Záře'], colors: [ALL, [1, 2, 3, 4, 6, 7, 8, 9]] },
        { id: 'pav', title: 'Páv malíř', diploma: 'umeni', parts: ['Baret a peří', 'Kabátek'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]] },
        { id: 'bobr', title: 'Bobr stavitel', diploma: 'architektura', parts: ['Přilba', 'Plány a nebe'], colors: [[1, 4, 5, 6, 7, 8, 9], ALL] },
        { id: 'vlk', title: 'Vlk dirigent', diploma: 'hudba', parts: ['Frak', 'Nebe'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]] },
        { id: 'kndrak', title: 'Knižní drak', diploma: 'literatura', parts: ['Dráček', 'Záře'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'panda', title: 'Panda režisér', diploma: 'film', parts: ['Šála', 'Záře'], colors: [[3, 4, 5, 6, 7, 8, 9], [3, 4, 5, 6, 7, 8, 9]] },
        { id: 'klokan', title: 'Klokan šampion', diploma: 'sport', parts: ['Dres a čelenka', 'Záře'], colors: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 4, 5, 6, 7, 8, 9]] }
    ];
    // Témata diplomů legendárních postaviček (název pro „Diplom: Zeměpis“; app.js a rewards.js mají vlastní seznam témat)
    const DIPLOMA_TOPICS = {
        zemepis: 'Zeměpis', vlajky: 'Vlajky a znaky', historie: 'Historie', mytologie: 'Mytologie', biologie: 'Biologie', geologie: 'Geologie', chemie: 'Chemie',
        fyzika: 'Fyzika', umeni: 'Výtvarné umění', architektura: 'Architektura', hudba: 'Hudba', literatura: 'Literatura', film: 'Film', sport: 'Sport'
    };
    const isLegendary = (item) => Boolean(item && item.diploma);
    // Barvy částí postaviček (číslo = číslice v uloženém obrázku, 0 = původní barva; pořadí = PALETTE ve scripts/avatar-icons.py).
    // Všechny jsou k dispozici, jakmile je postavička odemčená. Třída dot je vzorek barvy (vypsaná celá, ať ji Tailwind najde).
    const AVATAR_COLORS = [
        { id: 1, title: 'Červená', hex: '#db2c3a', dot: 'bg-[#db2c3a]' }, { id: 2, title: 'Oranžová', hex: '#f57e22', dot: 'bg-[#f57e22]' },
        { id: 3, title: 'Žlutá', hex: '#fad325', dot: 'bg-[#fad325]' }, { id: 4, title: 'Zelená', hex: '#3cbd4d', dot: 'bg-[#3cbd4d]' },
        { id: 5, title: 'Tyrkysová', hex: '#31ccc7', dot: 'bg-[#31ccc7]' }, { id: 6, title: 'Modrá', hex: '#3a77e0', dot: 'bg-[#3a77e0]' },
        { id: 7, title: 'Fialová', hex: '#9556cc', dot: 'bg-[#9556cc]' }, { id: 8, title: 'Růžová', hex: '#f576b9', dot: 'bg-[#f576b9]' },
        { id: 9, title: 'Černá', hex: '#3f424c', dot: 'bg-[#3f424c] dark:ring-1 dark:ring-white/40' }
    ];
    // Doplňky sovy: každý patří do jednoho místa (slot), v každém místě je nejvýš jeden; ke každému hráč zvolí barvu.
    // hidesHat = doplněk nahrazuje výchozí čepici (look-owl.js ji z loga skryje maskou), hidesHand = doplněk v ruce kreslí ruku jinak
    // (výchozí zvednutá ruka se skryje), keepsMonocle = doplněk v obličeji nezakrývá oči, takže sova k němu nosí monokl (viz monocleShown).
    // noColors = doplněk má pevné barvy (několik barev je jeho podstata): nemá barevné varianty, výběr barvy se skryje a uloží se 'original'.
    // chest = věc jen z Truhly Mudrlanta (rewards.js) a stupňů Sezóny Mudrlanta (season.js), úrovní ani odznakem se neodemkne; číslo je
    // úroveň, podle které se v truhle řadí mezi věci odemykané úrovní (truhla losuje z nejbližších nad úrovní hráče).
    // league = jako rámečky ligových sezón (LEAGUE_FRAMES): vrchol skončené ligové sezóny aspoň v této lize.
    const SLOTS = [
        { id: 'head', title: 'Hlava' },
        { id: 'face', title: 'Obličej' },
        { id: 'neck', title: 'Krk' },
        { id: 'hand', title: 'Ruka' }
    ];
    const ACCESSORIES = [
        { id: 'bryle', title: 'Kulaté brýle', slot: 'face', hue: 225, level: 4 },
        { id: 'motylek', title: 'Motýlek', slot: 'neck', hue: 220, level: 9 },
        { id: 'sala', title: 'Šála', slot: 'neck', hue: 105, level: 14 },
        { id: 'slunecni-bryle', title: 'Sluneční brýle', slot: 'face', hue: 355, level: 18 },
        { id: 'lupa', title: 'Lupa', slot: 'hand', hue: 22, level: 24 },
        { id: 'kvetina', title: 'Květina', slot: 'head', hue: 345, level: 32 },
        { id: 'koruna', title: 'Koruna', slot: 'head', hue: 40, level: 42 },
        { id: 'sluchatka', title: 'Sluchátka', slot: 'head', hue: 358, level: 50 },
        { id: 'medaile', title: 'Medaile', slot: 'neck', hue: 40, level: 58 },
        { id: 'vavrin', title: 'Vavřínový věnec', slot: 'head', hue: 95, badge: 'vitez' },
        { id: 'kompas', title: 'Kompas', slot: 'neck', hue: 30, badge: 'zbehly-zemepis' },
        { id: 'vlajka', fixed: true, flags: true, title: 'Vlaječka', slot: 'hand', hue: 215, badge: 'zbehly-vlajky' },
        { id: 'svitek', title: 'Svitek s pečetí', slot: 'hand', hue: 40, badge: 'zbehly-historie' },
        { id: 'helma', hidesHat: true, title: 'Okřídlená helma', slot: 'head', hue: 30, badge: 'zbehly-mytologie' },
        { id: 'sitka', title: 'Síťka na motýly', slot: 'hand', hue: 35, badge: 'zbehly-biologie' },
        { id: 'prilba', hidesHat: true, title: 'Horolezecká přilba', slot: 'head', hue: 50, badge: 'zbehly-geologie' },
        { id: 'lab-bryle', title: 'Laboratorní brýle', slot: 'face', hue: 120, badge: 'zbehly-chemie' },
        { id: 'knir', keepsMonocle: true, title: 'Einsteinův knír', slot: 'face', hue: 0, badge: 'zbehly-fyzika' },
        { id: 'baret', hidesHat: true, title: 'Malířský baret', slot: 'head', hue: 225, badge: 'zbehly-umeni' },
        { id: 'metr', title: 'Svinovací metr', slot: 'neck', hue: 50, badge: 'zbehly-architektura' },
        { id: 'mikrofon', title: 'Mikrofon', slot: 'hand', hue: 0, badge: 'zbehly-hudba' },
        { id: 'brk', title: 'Brk a kalamář', slot: 'hand', hue: 40, badge: 'zbehly-literatura' },
        { id: '3d-bryle', title: '3D brýle', slot: 'face', hue: 0, badge: 'zbehly-film' },
        { id: 'celenka', title: 'Sportovní čelenka', slot: 'head', hue: 215, badge: 'zbehly-sport' },
        // Doplňky z obrázků č. 92–108 (docs/OBRAZKY.md): úrovně, odznaky výzev, turnajů a série dní, ligová sezóna a Truhla Mudrlanta
        { id: 'cylindr', hidesHat: true, title: 'Cylindr', slot: 'head', hue: 45, level: 62 },
        { id: 'letecke-bryle', title: 'Letecké brýle', slot: 'face', hue: 30, level: 68 },
        { id: 'stetoskop', title: 'Stetoskop', slot: 'neck', hue: 175, level: 72 },
        { id: 'kouzelnicky-klobouk', hidesHat: true, title: 'Kouzelnický klobouk', slot: 'head', hue: 225, level: 76 },
        { id: 'zlaty-retez', title: 'Zlatý řetěz', slot: 'neck', hue: 45, level: 84 },
        { id: 'hulka', hidesHand: true, title: 'Kouzelná hůlka', slot: 'hand', hue: 45, level: 88 },
        { id: 'svatozar', title: 'Svatozář', slot: 'head', hue: 45, level: 99 },
        { id: 'piratsky-klobouk', hidesHat: true, title: 'Pirátský klobouk', slot: 'head', hue: 40, badge: 'vyhry-25' },
        { id: 'maska', title: 'Maska hrdiny', slot: 'face', hue: 215, badge: 'turnaj-zlato' },
        { id: 'mec', hidesHand: true, title: 'Rytířský meč', slot: 'hand', hue: 45, badge: 'turnaj-postupy-15' },
        { id: 'plast', title: 'Hrdinský plášť', slot: 'neck', hue: 225, badge: 'serie-100' },
        { id: 'pochoden', hidesHand: true, title: 'Pochodeň vítěze', slot: 'hand', hue: 30, league: 'diamant', leagueName: 'Diamant' },
        { id: 'vrtulka', hidesHat: true, title: 'Čepice s vrtulkou', slot: 'head', hue: 50, chest: 10 },
        { id: 'srdickove-bryle', title: 'Srdíčkové brýle', slot: 'face', hue: 330, chest: 20 },
        { id: 'vencek', title: 'Květinový věnec', slot: 'neck', hue: 35, chest: 30 },
        { id: 'paska', keepsMonocle: true, title: 'Pirátská páska', slot: 'face', hue: 0, chest: 40 },
        { id: 'hrnek', hidesHand: true, title: 'Hrnek kakaa', slot: 'hand', hue: 180, chest: 50 },
        // Sady doplňků k tématům (docs/OBRAZKY.md č. 177–204, docs/DOPLNKY-TEMAT.md): ke kusu za zběhlost (výše) dva další kusy na jiných místech,
        // první za odznak tématu 3. stupně (300 správných odpovědí v tématu), druhý za 5. stupeň (1000). Pořadí v tématu = pořadí v sadě (topicSet).
        // fixed = nová ruka a nepřebarvitelné části jsou i ve vrstvě <id>-zaklad.webp (scripts/owl-accessories.py FIXED_SPLIT)
        { id: 'cestovatelsky-klobouk', hidesHat: true, title: 'Cestovatelský klobouk', slot: 'head', hue: 35, badge: 'tema-zemepis-300' },
        { id: 'globus', hidesHand: true, fixed: true, title: 'Globus', slot: 'hand', hue: 205, badge: 'tema-zemepis-1000' },
        { id: 'namornicka-cepice', hidesHat: true, title: 'Námořnická čepice', slot: 'head', hue: 220, badge: 'tema-vlajky-300' },
        { id: 'praporky', title: 'Signální praporky', slot: 'neck', hue: 0, badge: 'tema-vlajky-1000' },
        { id: 'krejzlik', title: 'Krejzlík', slot: 'neck', hue: 0, badge: 'tema-historie-1000' },
        { id: 'blesk', hidesHand: true, fixed: true, title: 'Blesk vládce hromu', slot: 'hand', hue: 45, badge: 'tema-mytologie-300' },
        { id: 'zlate-rouno', title: 'Zlaté rouno', slot: 'neck', hue: 40, badge: 'tema-mytologie-1000' },
        { id: 'hnizdo', hidesHat: true, title: 'Ptačí hnízdo', slot: 'head', hue: 30, badge: 'tema-biologie-300' },
        { id: 'dalekohled', title: 'Dalekohled', slot: 'neck', hue: 35, badge: 'tema-biologie-1000' },
        { id: 'kladivko', fixed: true, title: 'Geologické kladívko', slot: 'hand', hue: 30, badge: 'tema-geologie-300' },
        { id: 'krystal', title: 'Krystal na šňůrce', slot: 'neck', hue: 275, badge: 'tema-geologie-1000' },
        { id: 'banka', hidesHand: true, fixed: true, title: 'Baňka s lektvarem', slot: 'hand', hue: 185, badge: 'tema-chemie-300' },
        { id: 'vybuch', title: 'Po výbuchu', slot: 'head', hue: 0, badge: 'tema-chemie-1000' },
        { id: 'magnet', hidesHand: true, fixed: true, title: 'Magnet', slot: 'hand', hue: 0, badge: 'tema-fyzika-300' },
        { id: 'jablko', title: 'Newtonovo jablko', slot: 'head', hue: 50, badge: 'tema-fyzika-1000' },
        { id: 'paleta', hidesHand: true, fixed: true, title: 'Malířská paleta', slot: 'hand', hue: 30, badge: 'tema-umeni-300' },
        { id: 'dali-knir', keepsMonocle: true, title: 'Kroucený knír', slot: 'face', hue: 0, badge: 'tema-umeni-1000' },
        { id: 'plany', hidesHand: true, fixed: true, title: 'Stavební plány', slot: 'hand', hue: 215, badge: 'tema-architektura-300' },
        { id: 'tesarska-tuzka', title: 'Tesařská tužka', slot: 'head', hue: 15, badge: 'tema-architektura-1000' },
        { id: 'hvezdne-bryle', title: 'Hvězdné brýle', slot: 'face', hue: 0, badge: 'tema-hudba-300' },
        { id: 'kytara', title: 'Elektrická kytara', slot: 'neck', hue: 45, badge: 'tema-hudba-1000' },
        { id: 'knihy', hidesHat: true, title: 'Komínek knih', slot: 'head', hue: 30, badge: 'tema-literatura-300' },
        { id: 'pulmesicove-bryle', title: 'Půlměsícové brýle', slot: 'face', hue: 45, badge: 'tema-literatura-1000' },
        { id: 'popcorn', hidesHand: true, fixed: true, title: 'Kornout popcornu', slot: 'hand', hue: 215, badge: 'tema-film-300' },
        { id: 'filmovy-pas', title: 'Filmový pás', slot: 'neck', hue: 0, badge: 'tema-film-1000' },
        { id: 'pistalka', title: 'Píšťalka', slot: 'neck', hue: 215, badge: 'tema-sport-300' },
        { id: 'pohar', hidesHand: true, fixed: true, title: 'Vítězný pohár', slot: 'hand', hue: 45, badge: 'tema-sport-1000' }
    ];
    // Měsíční doplňky Sezóny Mudrlanta (docs/OBRAZKY.md č. 134–145): jen ze Sezónní truhly svého měsíce (SEASON_BUNDLES níže),
    // úrovní, odznakem ani Truhlou Mudrlanta ne (exclusive, month a source jako rámečky sezóny SEASON_FRAMES). Ve výběru doplňků
    // v Nastavení jsou, jen když je hráč má (look-owl.js). Vrstvy z průhledných PNG dělá scripts/owl-accessories.py (SEASON).
    // Pevné barvy (noColors): jarní věneček (bílé a žluté kvítky v zelených lístcích), konvalinky a dýně se zelenou stopkou.
    const SEASON_ACCESSORIES = [
        { id: 'cepice-zimni', hidesHat: true, title: 'Zimní čepice', slot: 'head', hue: 205 },
        { id: 'karneval', title: 'Karnevalová maska', slot: 'face', hue: 280 },
        { id: 'jarni-venecek', noColors: true, title: 'Jarní věneček', slot: 'head', hue: 50 },
        { id: 'destnik', hidesHand: true, title: 'Deštník', slot: 'hand', hue: 48 },
        { id: 'konvalinky', noColors: true, hidesHand: true, title: 'Konvalinky', slot: 'hand', hue: 110 },
        { id: 'slamak', hidesHat: true, title: 'Slaměný klobouk', slot: 'head', hue: 205 },
        { id: 'snorchl', title: 'Šnorchl', slot: 'face', hue: 180 },
        { id: 'zmrzlina', hidesHand: true, title: 'Zmrzlina', slot: 'hand', hue: 345 },
        { id: 'tuzka', hidesHand: true, title: 'Školní tužka', slot: 'hand', hue: 48 },
        { id: 'dyne', noColors: true, title: 'Dýně', slot: 'head', hue: 28 },
        { id: 'lampion', hidesHand: true, title: 'Lampion', slot: 'hand', hue: 28 },
        { id: 'sala-zimni', title: 'Zimní šála', slot: 'neck', hue: 140 }
    ].map((item, index) => ({ ...item, month: index + 1, exclusive: true, source: 'season' }));
    ACCESSORIES.push(...SEASON_ACCESSORIES);
    // Sada doplňků tématu: kus za zběhlost (zbehly-<téma>), za 300 a za 1000 správných odpovědí v tématu (tema-<téma>-300, -1000);
    // [{ item, badge, step }] jen s kusy, které v katalogu jsou (dvourohý klobouk Historie zatím chybí). step: 'skill' | 300 | 1000
    const TOPIC_SET_STEPS = [['skill', (topic) => `zbehly-${topic}`], [300, (topic) => `tema-${topic}-300`], [1000, (topic) => `tema-${topic}-1000`]];
    const topicSet = (topic) => TOPIC_SET_STEPS.flatMap(([step, badgeOf]) => ACCESSORIES.filter(item => item.badge === badgeOf(topic)).map(item => ({ item, badge: item.badge, step })));
    // Monokl: výchozí sova ho nosí (icons/logo.webp). V místě obličeje si hráč místo něj může vybrat „Bez monoklu“ (uloží se jako
    // { id: NO_MONOCLE }, logo icons/logo-bez-monoklu.webp) nebo doplněk, který monokl nahradí (brýle a maska; knír a páska ho nechají).
    // Uložené volby bez doplňku v obličeji dál znamenají monokl.
    const NO_MONOCLE = 'bez-monoklu';
    // Barvy doplňků (původní je barva z obrázku); každá se odemyká úrovní. „Vlastní barva“ je paleta: hráč si zvolí libovolný odstín
    // (uloží se jako h<stupně>, např. h210), doplněk se přebarví z původního obrázku otočením odstínu.
    const ACC_COLORS = [
        { id: 'original', title: 'Původní', level: 1 }, { id: 'cervena', title: 'Červená', level: 1 }, { id: 'modra', title: 'Modrá', level: 1 },
        { id: 'zelena', title: 'Zelená', level: 8 }, { id: 'oranzova', title: 'Oranžová', level: 16 }, { id: 'zluta', title: 'Žlutá', level: 26 },
        { id: 'ruzova', title: 'Růžová', level: 38 }, { id: 'fialova', title: 'Fialová', level: 52 }, { id: 'cerna', title: 'Černá', level: 60 }, { id: 'vlastni', title: 'Vlastní barva (paleta)', level: 80 }
    ];
    // --- Sezóna Mudrlanta (season.js) a odměny za sérii dní: exkluzivní věci ---
    // exclusive = jen jako dárek (Look.setGifts z rewards.js), úrovní se neodemkne; month = měsíc sezóny (1–12), ve které se dá získat
    // (každý rok znovu, kdo ji má, nechá si ji navždy). Album a přehledy podle toho poznají sezónní věci.
    const SEASON_MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
    const SEASON_ADJECTIVES = ['Lednový', 'Únorový', 'Březnový', 'Dubnový', 'Květnový', 'Červnový', 'Červencový', 'Srpnový', 'Zářijový', 'Říjnový', 'Listopadový', 'Prosincový'];
    const pad2 = (month) => String(month).padStart(2, '0');
    // Rámečky sezóny: dva obrázkové prsteny na měsíc (art: true, icons/frames/<id>.webp ze scripts/frame-images.py, docs/OBRAZKY.md
    // č. 163–174), oba jen ze Sezóny svého měsíce. Zdobnější sezona-MM (jméno = přídavné jméno měsíce) je v Sezónní truhle na 20. stupni
    // (SEASON_BUNDLES); dřív to byl kroužek z CSS stejného id, kdo ho má, má teď obrázek. Jednodušší sezona-MM-b (vlastní jméno) dává
    // Truhla v půli sezóny na 10. stupni (season.js, seasonMidFrame). seasonTier = stupeň, na kterém rámeček čeká (text, jak ho získat).
    const SEASON_FRAMES = SEASON_ADJECTIVES.map((title, index) => ({ id: `sezona-${pad2(index + 1)}`, title, month: index + 1, exclusive: true, source: 'season', art: true, seasonTier: 20 }));
    const SEASON_MID_TITLES = ['Lednové rampouchy', 'Únorové masky', 'Březnové sněženky', 'Dubnové kapky', 'Májové květy', 'Červnové slunečnice',
        'Červencová pláž', 'Srpnová noc', 'Zářijové pastelky', 'Říjnoví draci', 'Listopadové lampiony', 'Prosincové perníčky'];
    const SEASON_MID_FRAMES = SEASON_MID_TITLES.map((title, index) => ({ id: `sezona-${pad2(index + 1)}-b`, title, month: index + 1, exclusive: true, source: 'season', art: true, seasonTier: 10 }));
    // Rámečky za sérii dní dnešních otázek (odznaky skupiny 'serie' v quiz-core): 7 dní Jiskra, 30 dní Plamenný (výš ve FRAMES),
    // 100 dní Stovka, 365 dní Věčný oheň. Animace v src/input.css (.frame-jiskra, .frame-stovka); Věčný oheň je obrázkový prsten
    // (art: true, icons/frames/vecny-ohen.webp ze scripts/frame-images.py, docs/OBRAZKY.md č. 146), který v CSS plápolá (.frame-vecny-ohen).
    // Za 100 dní je i doplněk Hrdinský plášť (ACCESSORIES, badge serie-100).
    const STREAK_FRAMES = [
        { id: 'jiskra', title: 'Jiskra', badge: 'tyden' },
        { id: 'stovka', title: 'Stovka', badge: 'serie-100' },
        { id: 'vecny-ohen', title: 'Věčný oheň', badge: 'serie-365', art: true }
    ];
    // Rámečky sezóny po měsících: Lednový, Lednové rampouchy, Únorový, …
    FRAMES.push(...STREAK_FRAMES, ...SEASON_FRAMES.flatMap((item, index) => [item, SEASON_MID_FRAMES[index]]));
    // Titul u jména za celou sezónu (Sezónní truhla na 20. stupni); ukládá se jako title_pref stejně jako odznak
    const TITLES = [{ id: 'sampion-sezony', title: 'Šampion sezóny', exclusive: true, source: 'season' }];
    // Sezónní truhla (20. stupeň sezóny): pro každý měsíc doplněk, rámeček a postavička. Do truhly jde jen to, co už v katalogu je
    // (doplněk v ACCESSORIES s obrázky v icons/doplnky, postavička v AVATARS s obrázky v icons/avatars, rámeček ve FRAMES), takže přidat
    // novou věc = jen přidat její položku s exclusive: true a month (a obrázky). Doplňky (SEASON_ACCESSORIES), rámečky a postavičky
    // (SEASON_AVATARS) už v katalogu jsou. Druhý rámeček měsíce (sezona-MM-b) do Sezónní truhly nepatří: dává ho Truhla v půli sezóny (seasonMidFrame).
    const SEASON_BUNDLES = {
        '01': { accessory: 'cepice-zimni', frame: 'sezona-01', character: 'ramp' },
        '02': { accessory: 'karneval', frame: 'sezona-02', character: 'kobliz' },
        '03': { accessory: 'jarni-venecek', frame: 'sezona-03', character: 'snezen' },
        '04': { accessory: 'destnik', frame: 'sezona-04', character: 'kapka' },
        '05': { accessory: 'konvalinky', frame: 'sezona-05', character: 'pampel' },
        '06': { accessory: 'slamak', frame: 'sezona-06', character: 'vysved' },
        '07': { accessory: 'snorchl', frame: 'sezona-07', character: 'meloun' },
        '08': { accessory: 'zmrzlina', frame: 'sezona-08', character: 'hvezda' },
        '09': { accessory: 'tuzka', frame: 'sezona-09', character: 'aktovk' },
        '10': { accessory: 'dyne', frame: 'sezona-10', character: 'drakpa' },
        '11': { accessory: 'lampion', frame: 'sezona-11', character: 'caj' },
        '12': { accessory: 'sala-zimni', frame: 'sezona-12', character: 'pernik' }
    };
    // Sezónní postavičky (docs/OBRAZKY.md č. 151–162): oživlé věci a jídlo, každá jen ze Sezónní truhly svého měsíce (exclusive a month
    // jako rámečky sezóny, source 'season' pro Album sbírky). Obrázky a vrstvy částí jako u ostatních postaviček (scripts/avatar-icons.py,
    // colors podle --colors). Ve výběru obrázku v Nastavení jsou jen ty, které hráč má; cizí profil je ukáže vždy.
    const SEASON_AVATARS = [
        { id: 'ramp', title: 'Rampouch', month: 1, parts: ['Šála', 'Led'], colors: [[2, 3, 4, 5, 6, 7, 8, 9], ALL] },
        { id: 'kobliz', title: 'Masopustní koblížek', month: 2, parts: ['Maska', 'Serpentina'], colors: [[1, 2, 3, 4, 5, 6, 8, 9], [2, 3, 4, 5, 6, 7, 9]] },
        { id: 'snezen', title: 'Sněženka', month: 3, parts: ['Květ', 'Listy'], colors: [ALL, ALL] },
        { id: 'kapka', title: 'Aprílová kapka', month: 4, parts: ['Kapka', 'Deštník'], colors: [[1, 2, 3, 4, 7, 8, 9], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'pampel', title: 'Pampeliška', month: 5, parts: ['Chmýří', 'Listy'], colors: [ALL, ALL] },
        { id: 'vysved', title: 'Vysvědčení', month: 6, parts: ['Mašle', 'Brýle'], colors: [[3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8]] },
        { id: 'meloun', title: 'Meloun', month: 7, parts: ['Dužina', 'Brýle'], colors: [[3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8]] },
        { id: 'hvezda', title: 'Padající hvězda', month: 8, parts: ['Hvězda', 'Ohon'], colors: [[1, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8]] },
        { id: 'aktovk', title: 'Školní aktovka', month: 9, parts: ['Aktovka', 'Kapsa'], colors: [[3, 4, 5, 6, 7, 8, 9], [4, 5, 6, 7, 8, 9]] },
        { id: 'drakpa', title: 'Papírový drak', month: 10, parts: ['Drak', 'Mašličky'], colors: [[4, 5, 6, 7, 8, 9], [3, 4, 5, 6, 7, 8, 9]] },
        { id: 'caj', title: 'Hrnek čaje', month: 11, parts: ['Hrnek', 'Citron'], colors: [[1, 2, 3, 4, 6, 7, 8, 9], [1, 4, 5, 6, 7, 8, 9]] },
        { id: 'pernik', title: 'Perníček', month: 12, parts: ['Poleva', 'Knoflíky'], colors: [ALL, ALL] }
    ].map(item => ({ ...item, exclusive: true, source: 'season' }));
    AVATARS.push(...SEASON_AVATARS);
    const CUSTOM_HUE = /^h(\d{1,3})$/;
    // Odstín vlastní barvy (násobek 5, 0–355) nebo null
    const customHue = (color) => { const match = CUSTOM_HUE.exec(String(color)); const hue = match ? Number(match[1]) : NaN; return hue >= 0 && hue <= 355 && hue % 5 === 0 ? hue : null; };
    // Vlajka státu na vlaječce: id z look-flags.js (malé q Wikidat, např. q101472); cokoli jiného se zahodí
    const flagOk = (flag) => typeof flag === 'string' && /^q\d{1,9}$/.test(flag) && Boolean(Flags) && Flags.has(flag);
    // --- Album sbírky (album.js): rámeček Sběratelský za celé album (odznak Legenda sbírky, 100 %). album: true = odměna za album samo,
    // do počtu sbírky se nepočítá (jinak by 100 % nešlo získat). Animovaný rámeček je .frame-sberatel v src/input.css.
    FRAMES.push({ id: 'sberatel', title: 'Sběratelský', badge: 'sberatel-100', album: true });
    // --- Obrázkové rámečky (docs/OBRAZKY.md č. 109–118): prsten z obrázku icons/frames/<id>.webp kolem obrázku hráče (art: true; CSS
    // .frame-art a .frame-<id> v src/input.css, obrázky z branding/ramecky/<id>.jpg vyrábí scripts/frame-images.py, stejný seznam má sw.js
    // FRAME_ART). Nejvzácnější rámečky: pět za vysoké úrovně, tři za těžké odznaky a dva jen jako vzácný dárek z Truhly Mudrlanta
    // (rare: true): úrovní ani odznakem se neodemknou, truhla je dá jen občas (rewards.js RARE_CHANCE) a Sezóna je nedá vůbec.
    // (Jiné než chest: N u doplňků – ty jsou běžným dárkem truhly a Sezóny, jen se neodemykají úrovní.)
    const ART_FRAMES = [
        { id: 'ohen', title: 'Ohnivý prstenec', level: 37 },
        { id: 'more', title: 'Mořská vlna', level: 49 },
        { id: 'soukoli', title: 'Steampunk soukolí', level: 63 },
        { id: 'galaxie', title: 'Galaxie', level: 77 },
        { id: 'kralovsky-vavrin', title: 'Královský vavřín', level: 94 },
        { id: 'blesk', title: 'Bleskový prstenec', badge: 'bleskovka-20' },
        { id: 'led', title: 'Ledová koruna', badge: 'preziti-50' },
        { id: 'drak', title: 'Strážný drak', badge: 'vsechna-temata-3' },
        { id: 'duha-mracky', title: 'Duha s mráčky', rare: true },
        { id: 'ruze', title: 'Růže a trny', rare: true }
    ].map(item => ({ ...item, art: true }));
    FRAMES.push(...ART_FRAMES);
    // Sova titulu jako obrázek profilu (póza): 'titul-1' … 'titul-11' podle stupňů Core.TITLE_OWL_FROM (level = od jaké úrovně), null = sova
    // s doplňky. Volba se ukládá, jak ji hráč zvolil; na dosaženou úroveň se omezí až při vykreslení (MudrlantOwl.allowedPose), takže
    // po ztrátě úrovně (vývojářský reset) se ukáže nejvyšší dosažená sova a po návratu úrovně zase ta zvolená. Není v CATALOG:
    // nejde o samostatnou odměnu (oslavu má nový titul).
    const POSES = (Core && Core.TITLE_OWL_FROM ? Core.TITLE_OWL_FROM : []).map((from, index) => ({ id: `titul-${index + 1}`, tier: index + 1, level: from }));
    const findPose = (id) => POSES.find(pose => pose.id === id) || null;
    const CATALOG = { themes: THEMES, robes: ROBES, frames: FRAMES, avatars: AVATARS, accessories: ACCESSORIES, colors: ACC_COLORS.filter(color => color.level > 1) };
    CATALOG.titles = TITLES;
    const DEFAULTS = { theme: 'vinova', robe: 'vinova', frame: 'zadny', title: 'level', acc: {}, pose: null };

    // Barva doplňku: z katalogu (odemčená) nebo vlastní odstín z palety (když je paleta odemčená)
    const colorOk = (color, ctx) => {
        const item = ACC_COLORS.find(entry => entry.id === color && entry.id !== 'vlastni');
        if (item) return !ctx || isUnlocked(item, ctx);
        return customHue(color) !== null && (!ctx || isUnlocked(ACC_COLORS.find(entry => entry.id === 'vlastni'), ctx));
    };
    // Věci z Truhly Mudrlanta (rewards.js): { kategorie: [id] }; app.js je nastaví při startu a po otevření truhly (setGifts).
    // Položky katalogu se v různých kategoriích jmenují stejně (vinova, zlata), proto se kategorie hledá podle samotné položky.
    let giftState = {};
    const CATEGORY_OF = new Map();
    Object.entries(CATALOG).forEach(([category, items]) => items.forEach(item => CATEGORY_OF.set(item, category)));
    const setGifts = (value) => { giftState = value && typeof value === 'object' ? value : {}; };
    const isGift = (item, gifts) => {
        const category = CATEGORY_OF.get(item);
        return Boolean(category && gifts && Array.isArray(gifts[category]) && gifts[category].includes(item.id));
    };
    // ctx = { level, badges, gifts?, diplomas? } (badges: objekt id → datum nebo true; gifts: věci z truhly, výchozí ze setGifts, null = bez nich;
    // diplomas: téma → den zisku diplomu, odemyká legendární postavičky)
    const isUnlocked = (item, ctx) => {
        if (!item) return false;
        if (ctx && isGift(item, ctx.gifts !== undefined ? ctx.gifts : giftState)) return true;
        if (item.exclusive || item.chest || item.rare) return false;
        if (item.league) return leagueUnlocked(item, ctx);
        if (item.diploma) return Boolean(ctx && ctx.diplomas && ctx.diplomas[item.diploma]);
        if (item.badge) return Boolean(ctx && ctx.badges && ctx.badges[item.badge]);
        return Boolean(ctx) && ctx.level >= (item.level || 1);
    };
    const unlockText = (item, badgeTitle = null) => item.exclusive ? (item.month ? `Sezóna Mudrlanta (${SEASON_MONTHS[item.month - 1].toLocaleLowerCase('cs')}, ${item.seasonTier === 10 ? 'Truhla v půli sezóny na 10. stupni' : 'Sezónní truhla na 20. stupni'})` : 'Sezóna Mudrlanta (celá cesta sezóny)')
        : item.rare ? 'Vzácný dárek z Truhly Mudrlanta' : item.chest ? 'Z Truhly Mudrlanta' : item.diploma ? `Diplom: ${DIPLOMA_TOPICS[item.diploma] || item.diploma}`
            : item.league ? `Ligová sezóna: vrchol ${item.leagueName}` : item.badge ? `Odznak: ${badgeTitle || item.badge}` : `Úroveň ${item.level}`;
    const categoryOf = (item) => CATEGORY_OF.get(item) || null;
    const find = (category, id) => (CATALOG[category] || []).find(item => item.id === id) || null;
    // Nosí sova k doplňkům { místo: { id, … } } monokl? Ano bez doplňku v obličeji (i s neznámým id) a s doplňkem keepsMonocle;
    // ne s volbou „Bez monoklu“ a s doplňkem, který monokl nahradí
    const monocleShown = (acc) => {
        const face = acc && typeof acc === 'object' ? acc.face : null;
        if (!face || typeof face !== 'object') return true;
        if (face.id === NO_MONOCLE) return false;
        const item = find('accessories', face.id);
        return !item || item.slot !== 'face' || Boolean(item.keepsMonocle);
    };

    // --- Postavičky: uložený obrázek '<id><barva části 1><barva části 2>' (číslice 0–9, 0 = původní, koncové nuly se nepíšou):
    // 'krecek' (původní), 'krecek3' (žluté rukavice), 'krecek05' (tyrkysová čelenka). Kontroluje se přísně: známé id, nejvýš tolik číslic,
    // kolik má postavička částí. Cokoli jiného není postavička (aplikace to ukáže jako text, stejně jako emoji).
    const CHARACTER_CODE = /^([a-z]{1,6})([0-9]{0,2})$/;
    const characterItem = (id) => { const item = find('avatars', id); return item && item.parts ? item : null; };
    // Staré emoji odměny → id postavičky, která ho nahradila (i bez neviditelného výběru varianty U+FE0F, např. '⏱' i '⏱️')
    const LEGACY_AVATARS = new Map(AVATARS.filter(item => item.was).flatMap(item => [[item.was, item.id], [item.was.replace(/️/g, ''), item.id]]));
    const migrateAvatar = (value) => (typeof value === 'string' && LEGACY_AVATARS.has(value) ? LEGACY_AVATARS.get(value) : value);
    // { item, colors: [barva každé části] } nebo null; staré emoji odměny se tu nepřevádí (to dělá avatarPicture / avatarCode)
    const parseAvatar = (value) => {
        const match = typeof value === 'string' ? CHARACTER_CODE.exec(value) : null;
        const item = match ? characterItem(match[1]) : null;
        if (!item || match[2].length > item.parts.length) return null;
        return { item, colors: item.parts.map((part, index) => Number(match[2][index] || 0)) };
    };
    // Zápis postavičky s barvami částí (neznámá barva = původní); neznámé id = null
    const formatAvatar = (id, colors = []) => {
        const item = characterItem(id);
        if (!item) return null;
        const digits = item.parts.map((part, index) => { const color = Number(colors[index]); return Number.isInteger(color) && color >= 0 && color <= 9 ? color : 0; }).join('');
        return `${item.id}${digits.replace(/0+$/, '')}`;
    };
    // Uložitelný zápis postavičky (i ze starého emoji odměny), jinak null
    const avatarCode = (value) => { const parsed = parseAvatar(migrateAvatar(value)); return parsed ? formatAvatar(parsed.item.id, parsed.colors) : null; };
    // Obrázky k vykreslení: { item, colors, base, layers: [adresy vrstev přebarvených částí] } nebo null (není postavička)
    const avatarPicture = (value) => {
        const parsed = parseAvatar(migrateAvatar(value));
        if (!parsed) return null;
        const { item, colors } = parsed;
        return { item, colors, base: `icons/avatars/${item.id}.webp`, layers: colors.map((color, index) => (color ? `icons/avatars/${item.id}-${index + 1}${color}.webp` : null)).filter(Boolean) };
    };
    // Barvy, které výběr u části nabídne (čísla AVATAR_COLORS); bez seznamu všechny
    const partColors = (item, part) => AVATAR_COLORS.filter(color => !item || !item.colors || !item.colors[part - 1] || item.colors[part - 1].includes(color.id));
    // Položka katalogu odměn k uloženému obrázku (postavička s libovolnými barvami, staré emoji, emoji bez obrázku), jinak null
    const avatarItem = (value) => { const parsed = parseAvatar(migrateAvatar(value)); return parsed ? parsed.item : find('avatars', value); };

    // --- Uložené volby ---
    const readRaw = () => { try { return JSON.parse(root.localStorage.getItem(KEY)); } catch (e) { return null; } };
    // Neplatná nebo nedostupná volba se nahradí výchozí; titul 'level' (podle úrovně), 'none' nebo id odznaku
    const normalize = (raw, ctx) => {
        const value = { ...DEFAULTS };
        const source = raw && typeof raw === 'object' ? raw : {};
        for (const [key, category] of [['theme', 'themes'], ['robe', 'robes'], ['frame', 'frames']]) {
            const item = find(category, source[key]);
            if (item && (!ctx || isUnlocked(item, ctx))) value[key] = item.id;
        }
        // Doplňky: { místo: { id, color } }, jen odemčené a ve svém místě
        value.acc = {};
        const accSource = source.acc && typeof source.acc === 'object' ? source.acc : {};
        for (const slot of SLOTS) {
            const entry = accSource[slot.id];
            if (slot.id === 'face' && entry && typeof entry === 'object' && entry.id === NO_MONOCLE) { value.acc.face = { id: NO_MONOCLE }; continue; }
            const item = entry && typeof entry === 'object' ? find('accessories', entry.id) : null;
            if (item && item.slot === slot.id && (!ctx || isUnlocked(item, ctx))) {
                value.acc[slot.id] = { id: item.id, color: !item.noColors && colorOk(entry.color, ctx) ? entry.color : 'original' };
                if (item.flags && flagOk(entry.flag)) value.acc[slot.id].flag = entry.flag;
            }
        }
        value.pose = findPose(source.pose) ? source.pose : null;
        if (source.title === 'none' || source.title === 'level') value.title = source.title;
        else if (typeof source.title === 'string' && (!ctx || (ctx.badges && ctx.badges[source.title]) || isUnlocked(find('titles', source.title), ctx))) value.title = source.title;
        return value;
    };
    let current = null;
    const listeners = new Set();
    const sections = [];
    const prefs = (ctx) => { current = normalize(current || readRaw(), ctx); return { ...current }; };
    // Porovnání hodnot bez ohledu na pořadí klíčů (doplňky se po úpravě řadí podle míst, ne podle toho, co hráč vybral dřív)
    const stable = (value) => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    // Nastaví volbu (jen odemčenou), uloží ji a oznámí změnu
    const setPref = (key, value, ctx) => {
        const next = normalize({ ...prefs(ctx), [key]: value }, ctx);
        if (stable(next[key]) !== stable(value)) return false;
        current = next;
        try { root.localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* bez úložiště se volba jen nepamatuje */ }
        listeners.forEach(listener => { try { listener(prefs(ctx), key); } catch (e) { console.error(e); } });
        return true;
    };
    const onChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

    // --- Části záložek Nastavení: register({ id, tab: 'game' | 'profile' | 'owl', title, order, render(ctx) → html, click(event, ctx) → true když klepnutí zpracovala,
    // change(event, ctx), apply(prefs); vzhled: noTitle (nadpis si kreslí sama), card: false (bez bílé karty), bleed, tight }) ---
    const register = (section) => { sections.push(section); sections.sort((a, b) => (a.order || 0) - (b.order || 0)); };
    const getSections = () => sections.slice();
    // Při startu a po každé změně dostane každá část volby (aplikuje třeba barvy)
    const apply = (ctx) => {
        const value = prefs(ctx);
        sections.forEach(section => { try { if (section.apply) section.apply(value); } catch (e) { console.error(e); } });
    };
    onChange((value) => sections.forEach(section => { try { if (section.apply) section.apply(value); } catch (e) { console.error(e); } }));

    // Nové odměny po změně úrovně nebo získaných odznacích: [{ category, item }] pro oslavu „Nová odměna“
    // (věc, kterou hráč už má z truhly, se znovu neslaví)
    const newRewards = (levelBefore, levelAfter, newBadgeIds = []) => {
        const result = [];
        for (const [category, items] of Object.entries(CATALOG)) {
            for (const item of items) {
                if (isGift(item, giftState)) continue;
                if (item.badge ? newBadgeIds.includes(item.badge) : (item.level > levelBefore && item.level <= levelAfter)) result.push({ category, item });
            }
        }
        return result;
    };
    // Jak se druh odměny jmenuje v textech pro hráče
    const REWARD_KINDS = { themes: 'barevné téma', robes: 'talár Mudrlanta', frames: 'rámeček', avatars: 'profilový obrázek', accessories: 'doplněk Mudrlanta', colors: 'barva doplňků', titles: 'titul u jména' };
    // Kde v Nastavení se odměna vybírá (záložka): téma ve Hře, rámeček a obrázek v Profilu, oblek, doplňky a jejich barvy u Mudrlanta
    const SETTINGS_TAB = { themes: 'game', frames: 'profile', avatars: 'profile', robes: 'owl', accessories: 'owl', colors: 'owl', titles: 'profile' };
    const TAB_TITLES = { game: 'Hra', profile: 'Profil', owl: 'Mudrlant' };
    const settingsTab = (category) => SETTINGS_TAB[category] || 'owl';
    const settingsPlace = (category) => `Nastavení → ${TAB_TITLES[settingsTab(category)]}`;
    // Odměny, které odemkne konkrétní odznak: [{ category, item }] (prázdné, když odznak dává jen slávu)
    const rewardsForBadge = (badgeId) => Object.entries(CATALOG).flatMap(([category, items]) => items.filter(item => item.badge === badgeId).map(item => ({ category, item })));
    // Věta o odměně za odznak: „Odměna: Kompas (doplněk Mudrlanta)“; odznak bez věci (jen pro slávu) dá prázdný text a řádek se vynechá
    const badgeRewardText = (badgeId) => {
        const rewards = rewardsForBadge(badgeId);
        return rewards.length ? `Odměna: ${rewards.map(({ category, item }) => `${item.title} (${REWARD_KINDS[category]})`).join(', ')}` : '';
    };
    // Odměny za diplom tématu (legendární postavička): [{ category, item }]
    const rewardsForDiploma = (topicId) => Object.entries(CATALOG).flatMap(([category, items]) => items.filter(item => item.diploma === topicId).map(item => ({ category, item })));
    // Odměny odemknuté na dané úrovni (pro přehled úrovní)
    const rewardsAtLevel = (level) => Object.entries(CATALOG).flatMap(([category, items]) => items.filter(item => !item.badge && item.level === level).map(item => ({ category, item })));
    // Sezónní truhla měsíce (1–12): [{ category, item }] jen z toho, co v katalogu opravdu je (doplněk, rámeček, postavička), a titul
    const seasonBundle = (month) => {
        const plan = SEASON_BUNDLES[pad2(month)] || {};
        return [['accessories', plan.accessory], ['frames', plan.frame], ['avatars', plan.character], ['titles', TITLES[0].id]]
            .map(([category, id]) => ({ category, item: id ? find(category, id) : null }))
            .filter(({ item }) => item && (item.exclusive || item.id === TITLES[0].id));
    };
    // Druhý rámeček měsíce (1–12) pro Truhlu v půli sezóny (season.js, 10. stupeň), nebo null
    const seasonMidFrame = (month) => find('frames', `sezona-${pad2(month)}-b`);
    // Vlastní titul (ne odznak) podle id, nebo null
    const titleItem = (id) => find('titles', id);

    return { setGifts, isGift: (item) => isGift(item, giftState), categoryOf, CATALOG, THEMES, ROBES, FRAMES, AVATARS, AVATAR_COLORS, ACCESSORIES, SLOTS, ACC_COLORS, NO_MONOCLE, monocleShown, POSES, findPose, customHue, colorOk, flagOk, DEFAULTS, isUnlocked, unlockText, find, normalize, prefs, setPref, onChange, register, getSections, apply, newRewards, rewardsAtLevel, REWARD_KINDS, settingsTab, settingsPlace, rewardsForBadge, badgeRewardText,
        migrateAvatar, parseAvatar, formatAvatar, avatarCode, avatarPicture, avatarItem, partColors,
        // Legendární postavičky za diplom tématu
        DIPLOMA_TOPICS, isLegendary, rewardsForDiploma,
        // Sezóna a série dní
        SEASON_MONTHS, SEASON_ADJECTIVES, SEASON_FRAMES, SEASON_MID_FRAMES, SEASON_AVATARS, STREAK_FRAMES, TITLES, SEASON_BUNDLES, seasonBundle, seasonMidFrame, titleItem,
        // Rámečky ligových sezón (schéma 18)
        LEAGUE_FRAMES, setLeagueBest, leagueBest: () => leagueBest,
        // Obrázkové rámečky
        ART_FRAMES,
        // Sady doplňků k tématům
        topicSet };
});
