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

    // Katalog: level = od jaké úrovně je odměna k dispozici, badge = po kterém odznaku (id z quiz-core). Každá položka má id a title.
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
        { id: 'myval', title: 'Mýval knihovník', badge: 'serad-25', was: '🧩', parts: ['Knihy'], colors: [ALL] }
    ];
    // Barvy částí postaviček (číslo = číslice v uloženém obrázku, 0 = původní barva; pořadí = PALETTE ve scripts/avatar-icons.py).
    // Všechny jsou k dispozici, jakmile je postavička odemčená. Třída dot je vzorek barvy (vypsaná celá, ať ji Tailwind najde).
    const AVATAR_COLORS = [
        { id: 1, title: 'Červená', hex: '#db2c3a', dot: 'bg-[#db2c3a]' }, { id: 2, title: 'Oranžová', hex: '#f57e22', dot: 'bg-[#f57e22]' },
        { id: 3, title: 'Žlutá', hex: '#fad325', dot: 'bg-[#fad325]' }, { id: 4, title: 'Zelená', hex: '#3cbd4d', dot: 'bg-[#3cbd4d]' },
        { id: 5, title: 'Tyrkysová', hex: '#31ccc7', dot: 'bg-[#31ccc7]' }, { id: 6, title: 'Modrá', hex: '#3a77e0', dot: 'bg-[#3a77e0]' },
        { id: 7, title: 'Fialová', hex: '#9556cc', dot: 'bg-[#9556cc]' }, { id: 8, title: 'Růžová', hex: '#f576b9', dot: 'bg-[#f576b9]' },
        { id: 9, title: 'Černá', hex: '#3f424c', dot: 'bg-[#3f424c] dark:ring-1 dark:ring-white/40' }
    ];
    // Doplňky sovy: každý patří do jednoho místa (slot), v každém místě je nejvýš jeden; ke každému hráč zvolí barvu
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
        { id: 'knir', title: 'Einsteinův knír', slot: 'face', hue: 0, badge: 'zbehly-fyzika' },
        { id: 'baret', hidesHat: true, title: 'Malířský baret', slot: 'head', hue: 225, badge: 'zbehly-umeni' },
        { id: 'metr', title: 'Svinovací metr', slot: 'neck', hue: 50, badge: 'zbehly-architektura' },
        { id: 'mikrofon', title: 'Mikrofon', slot: 'hand', hue: 0, badge: 'zbehly-hudba' },
        { id: 'brk', title: 'Brk a kalamář', slot: 'hand', hue: 40, badge: 'zbehly-literatura' },
        { id: '3d-bryle', title: '3D brýle', slot: 'face', hue: 0, badge: 'zbehly-film' },
        { id: 'celenka', title: 'Sportovní čelenka', slot: 'head', hue: 215, badge: 'zbehly-sport' }
    ];
    // Barvy doplňků (původní je barva z obrázku); každá se odemyká úrovní. „Vlastní barva“ je paleta: hráč si zvolí libovolný odstín
    // (uloží se jako h<stupně>, např. h210), doplněk se přebarví z původního obrázku otočením odstínu.
    const ACC_COLORS = [
        { id: 'original', title: 'Původní', level: 1 }, { id: 'cervena', title: 'Červená', level: 1 }, { id: 'modra', title: 'Modrá', level: 1 },
        { id: 'zelena', title: 'Zelená', level: 8 }, { id: 'oranzova', title: 'Oranžová', level: 16 }, { id: 'zluta', title: 'Žlutá', level: 26 },
        { id: 'ruzova', title: 'Růžová', level: 38 }, { id: 'fialova', title: 'Fialová', level: 52 }, { id: 'cerna', title: 'Černá', level: 60 }, { id: 'vlastni', title: 'Vlastní barva (paleta)', level: 80 }
    ];
    const CUSTOM_HUE = /^h(\d{1,3})$/;
    // Odstín vlastní barvy (násobek 5, 0–355) nebo null
    const customHue = (color) => { const match = CUSTOM_HUE.exec(String(color)); const hue = match ? Number(match[1]) : NaN; return hue >= 0 && hue <= 355 && hue % 5 === 0 ? hue : null; };
    // Vlajka státu na vlaječce: id z look-flags.js (malé q Wikidat, např. q101472); cokoli jiného se zahodí
    const flagOk = (flag) => typeof flag === 'string' && /^q\d{1,9}$/.test(flag) && Boolean(Flags) && Flags.has(flag);
    // --- Album sbírky (album.js): rámeček Sběratelský za celé album (odznak Legenda sbírky, 100 %). album: true = odměna za album samo,
    // do počtu sbírky se nepočítá (jinak by 100 % nešlo získat). Animovaný rámeček je .frame-sberatel v src/input.css.
    FRAMES.push({ id: 'sberatel', title: 'Sběratelský', badge: 'sberatel-100', album: true });
    // Sova titulu jako obrázek profilu (póza): 'titul-1' … 'titul-11' podle stupňů Core.TITLE_OWL_FROM (level = od jaké úrovně), null = sova
    // s doplňky. Volba se ukládá, jak ji hráč zvolil; na dosaženou úroveň se omezí až při vykreslení (MudrlantOwl.allowedPose), takže
    // po ztrátě úrovně (vývojářský reset) se ukáže nejvyšší dosažená sova a po návratu úrovně zase ta zvolená. Není v CATALOG:
    // nejde o samostatnou odměnu (oslavu má nový titul).
    const POSES = (Core && Core.TITLE_OWL_FROM ? Core.TITLE_OWL_FROM : []).map((from, index) => ({ id: `titul-${index + 1}`, tier: index + 1, level: from }));
    const findPose = (id) => POSES.find(pose => pose.id === id) || null;
    const CATALOG = { themes: THEMES, robes: ROBES, frames: FRAMES, avatars: AVATARS, accessories: ACCESSORIES, colors: ACC_COLORS.filter(color => color.level > 1) };
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
    // ctx = { level, badges, gifts? } (badges: objekt id → datum nebo true; gifts: věci z truhly, výchozí ze setGifts, null = bez nich)
    const isUnlocked = (item, ctx) => {
        if (!item) return false;
        if (ctx && isGift(item, ctx.gifts !== undefined ? ctx.gifts : giftState)) return true;
        if (item.badge) return Boolean(ctx && ctx.badges && ctx.badges[item.badge]);
        return Boolean(ctx) && ctx.level >= (item.level || 1);
    };
    const unlockText = (item, badgeTitle = null) => item.badge ? `Odznak: ${badgeTitle || item.badge}` : `Úroveň ${item.level}`;
    const categoryOf = (item) => CATEGORY_OF.get(item) || null;
    const find = (category, id) => (CATALOG[category] || []).find(item => item.id === id) || null;

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
            const item = entry && typeof entry === 'object' ? find('accessories', entry.id) : null;
            if (item && item.slot === slot.id && (!ctx || isUnlocked(item, ctx))) {
                value.acc[slot.id] = { id: item.id, color: colorOk(entry.color, ctx) ? entry.color : 'original' };
                if (item.flags && flagOk(entry.flag)) value.acc[slot.id].flag = entry.flag;
            }
        }
        value.pose = findPose(source.pose) ? source.pose : null;
        if (source.title === 'none' || source.title === 'level') value.title = source.title;
        else if (typeof source.title === 'string' && (!ctx || (ctx.badges && ctx.badges[source.title]))) value.title = source.title;
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
    const REWARD_KINDS = { themes: 'barevné téma', robes: 'talár Mudrlanta', frames: 'rámeček', avatars: 'profilový obrázek', accessories: 'doplněk Mudrlanta', colors: 'barva doplňků' };
    // Kde v Nastavení se odměna vybírá (záložka): téma ve Hře, rámeček a obrázek v Profilu, oblek, doplňky a jejich barvy u Mudrlanta
    const SETTINGS_TAB = { themes: 'game', frames: 'profile', avatars: 'profile', robes: 'owl', accessories: 'owl', colors: 'owl' };
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
    // Odměny odemknuté na dané úrovni (pro přehled úrovní)
    const rewardsAtLevel = (level) => Object.entries(CATALOG).flatMap(([category, items]) => items.filter(item => !item.badge && item.level === level).map(item => ({ category, item })));

    return { setGifts, isGift: (item) => isGift(item, giftState), categoryOf, CATALOG, THEMES, ROBES, FRAMES, AVATARS, AVATAR_COLORS, ACCESSORIES, SLOTS, ACC_COLORS, POSES, findPose, customHue, colorOk, flagOk, DEFAULTS, isUnlocked, unlockText, find, normalize, prefs, setPref, onChange, register, getSections, apply, newRewards, rewardsAtLevel, REWARD_KINDS, settingsTab, settingsPlace, rewardsForBadge, badgeRewardText,
        migrateAvatar, parseAvatar, formatAvatar, avatarCode, avatarPicture, avatarItem, partColors };
});
