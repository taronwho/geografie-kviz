// Odměny a vzhled: katalog odměn (barevná témata, barva obleku sovy, rámečky profilu, obrázky hráče, titul u jména),
// jejich odemykání podle úrovně nebo odznaku a uložené volby hráče. Samotné části (výběry a jejich vykreslení) se do okna
// Nastavení → Vzhled přidávají z vlastních souborů přes Look.register(...): look-themes.js, look-robes.js, look-frames.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    // Vlajky států pro vlaječku (look-flags.js, v prohlížeči se načítá před tímto souborem)
    const api = factory(root, root.MudrlantFlags || (isNode ? require('./look-flags.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantLook = api;
})(typeof self !== 'undefined' ? self : this, (root, Flags) => {
    'use strict';
    const KEY = 'mudrlant.look';

    // Katalog: level = od jaké úrovně je odměna k dispozici, badge = po kterém odznaku (id z quiz-core). Každá položka má id a title.
    const THEMES = [
        { id: 'vinova', title: 'Vínová', level: 1 },
        { id: 'les', title: 'Hluboký les', level: 8 },
        { id: 'ocean', title: 'Oceán', level: 16 },
        { id: 'zapad', title: 'Západ slunce', level: 26 },
        { id: 'fialova', title: 'Fialová noc', level: 38 },
        { id: 'zlata', title: 'Zlatá', level: 52 },
        { id: 'diamant', title: 'Diamant', level: 70 },
        { id: 'legenda', title: 'Legenda', level: 90 }
    ];
    const ROBES = [
        { id: 'vinova', title: 'Vínový talár', level: 1 },
        { id: 'zelena', title: 'Zelený talár', level: 6 },
        { id: 'modra', title: 'Modrý talár', level: 12 },
        { id: 'ruzova', title: 'Růžový talár', level: 20 },
        { id: 'fialova', title: 'Fialový talár', level: 30 },
        { id: 'cerna', title: 'Černý talár', level: 45 },
        { id: 'zlata', title: 'Zlatý talár', level: 65 }
    ];
    const FRAMES = [
        { id: 'zadny', title: 'Bez rámečku', level: 1 },
        { id: 'bronz', title: 'Bronzový', level: 5 },
        { id: 'stribro', title: 'Stříbrný', level: 15 },
        { id: 'zlato', title: 'Zlatý', level: 25 },
        { id: 'vavrin', title: 'Vavřínový', badge: 'vitez' },
        { id: 'plamen', title: 'Plamenný', badge: 'serie-30' },
        { id: 'diamant', title: 'Diamantový', level: 60 },
        { id: 'medailista', title: 'Medailista turnaje', badge: 'turnaj-bronz' },
        { id: 'mistr-turnaje', title: 'Mistr turnaje', badge: 'turnaj-zlato' }
    ];
    // Další obrázky hráče (k emoji ze social.js AVATARS), odemykané úrovní
    const AVATARS = [
        { id: '🦅', title: 'Orel', level: 3 }, { id: '🐺', title: 'Vlk', level: 8 }, { id: '🦈', title: 'Žralok', level: 13 },
        { id: '🐉', title: 'Drak', level: 20 }, { id: '🦖', title: 'T-Rex', level: 28 }, { id: '🦚', title: 'Páv', level: 36 },
        { id: '🦩', title: 'Plameňák', level: 44 }, { id: '🐅', title: 'Tygr', level: 55 }, { id: '🦁', title: 'Lev', level: 65 },
        { id: '👑', title: 'Koruna', level: 80 },
        { id: '🏅', title: 'Turnajový hráč', badge: 'turnaj-ucast' }, { id: '🥉', title: 'Bronz z turnaje', badge: 'turnaj-bronz' },
        { id: '🥈', title: 'Stříbro z turnaje', badge: 'turnaj-stribro' }, { id: '🏆', title: 'Mistr turnaje', badge: 'turnaj-zlato' }
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
        { id: 'ruzova', title: 'Růžová', level: 38 }, { id: 'fialova', title: 'Fialová', level: 52 }, { id: 'vlastni', title: 'Vlastní barva (paleta)', level: 80 }
    ];
    const CUSTOM_HUE = /^h(\d{1,3})$/;
    // Odstín vlastní barvy (násobek 5, 0–355) nebo null
    const customHue = (color) => { const match = CUSTOM_HUE.exec(String(color)); const hue = match ? Number(match[1]) : NaN; return hue >= 0 && hue <= 355 && hue % 5 === 0 ? hue : null; };
    // Vlajka státu na vlaječce: id z look-flags.js (malé q Wikidat, např. q101472); cokoli jiného se zahodí
    const flagOk = (flag) => typeof flag === 'string' && /^q\d{1,9}$/.test(flag) && Boolean(Flags) && Flags.has(flag);
    const CATALOG = { themes: THEMES, robes: ROBES, frames: FRAMES, avatars: AVATARS, accessories: ACCESSORIES, colors: ACC_COLORS.filter(color => color.level > 1) };
    const DEFAULTS = { theme: 'vinova', robe: 'vinova', frame: 'zadny', title: 'level', acc: {} };

    // Barva doplňku: z katalogu (odemčená) nebo vlastní odstín z palety (když je paleta odemčená)
    const colorOk = (color, ctx) => {
        const item = ACC_COLORS.find(entry => entry.id === color && entry.id !== 'vlastni');
        if (item) return !ctx || isUnlocked(item, ctx);
        return customHue(color) !== null && (!ctx || isUnlocked(ACC_COLORS.find(entry => entry.id === 'vlastni'), ctx));
    };
    // ctx = { level, badges } (badges: objekt id → datum nebo true)
    const isUnlocked = (item, ctx) => {
        if (!item) return false;
        if (item.badge) return Boolean(ctx && ctx.badges && ctx.badges[item.badge]);
        return Boolean(ctx) && ctx.level >= (item.level || 1);
    };
    const unlockText = (item, badgeTitle = null) => item.badge ? `Odznak: ${badgeTitle || item.badge}` : `Úroveň ${item.level}`;
    const find = (category, id) => (CATALOG[category] || []).find(item => item.id === id) || null;

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

    // --- Části okna Vzhled: register({ id, title, order, render(ctx) → html, click(event, ctx) → true když klepnutí zpracovala, apply(prefs) }) ---
    const register = (section) => { sections.push(section); sections.sort((a, b) => (a.order || 0) - (b.order || 0)); };
    const getSections = () => sections.slice();
    // Při startu a po každé změně dostane každá část volby (aplikuje třeba barvy)
    const apply = (ctx) => {
        const value = prefs(ctx);
        sections.forEach(section => { try { if (section.apply) section.apply(value); } catch (e) { console.error(e); } });
    };
    onChange((value) => sections.forEach(section => { try { if (section.apply) section.apply(value); } catch (e) { console.error(e); } }));

    // Nové odměny po změně úrovně nebo získaných odznacích: [{ category, item }] pro oslavu „Nová odměna“
    const newRewards = (levelBefore, levelAfter, newBadgeIds = []) => {
        const result = [];
        for (const [category, items] of Object.entries(CATALOG)) {
            for (const item of items) {
                if (item.badge ? newBadgeIds.includes(item.badge) : (item.level > levelBefore && item.level <= levelAfter)) result.push({ category, item });
            }
        }
        return result;
    };
    // Odměny odemknuté na dané úrovni (pro přehled úrovní)
    const rewardsAtLevel = (level) => Object.entries(CATALOG).flatMap(([category, items]) => items.filter(item => !item.badge && item.level === level).map(item => ({ category, item })));

    return { CATALOG, THEMES, ROBES, FRAMES, AVATARS, ACCESSORIES, SLOTS, ACC_COLORS, customHue, colorOk, flagOk, DEFAULTS, isUnlocked, unlockText, find, normalize, prefs, setPref, onChange, register, getSections, apply, newRewards, rewardsAtLevel };
});
