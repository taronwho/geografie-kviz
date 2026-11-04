// Odměny a vzhled: katalog odměn (barevná témata, barva obleku sovy, rámečky profilu, obrázky hráče, titul u jména),
// jejich odemykání podle úrovně nebo odznaku a uložené volby hráče. Samotné části (výběry a jejich vykreslení) se do okna
// Nastavení → Vzhled přidávají z vlastních souborů přes Look.register(...): look-themes.js, look-robes.js, look-frames.js.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantLook = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
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
        { id: 'diamant', title: 'Diamantový', level: 60 }
    ];
    // Další obrázky hráče (k emoji ze social.js AVATARS), odemykané úrovní
    const AVATARS = [
        { id: '🦅', title: 'Orel', level: 3 }, { id: '🐺', title: 'Vlk', level: 8 }, { id: '🦈', title: 'Žralok', level: 13 },
        { id: '🐉', title: 'Drak', level: 20 }, { id: '🦖', title: 'T-Rex', level: 28 }, { id: '🦚', title: 'Páv', level: 36 },
        { id: '🦩', title: 'Plameňák', level: 44 }, { id: '🐅', title: 'Tygr', level: 55 }, { id: '🦁', title: 'Lev', level: 65 },
        { id: '👑', title: 'Koruna', level: 80 }
    ];
    const CATALOG = { themes: THEMES, robes: ROBES, frames: FRAMES, avatars: AVATARS };
    const DEFAULTS = { theme: 'vinova', robe: 'vinova', frame: 'zadny', title: 'level' };

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
        if (source.title === 'none' || source.title === 'level') value.title = source.title;
        else if (typeof source.title === 'string' && (!ctx || (ctx.badges && ctx.badges[source.title]))) value.title = source.title;
        return value;
    };
    let current = null;
    const listeners = new Set();
    const sections = [];
    const prefs = (ctx) => { current = normalize(current || readRaw(), ctx); return { ...current }; };
    // Nastaví volbu (jen odemčenou), uloží ji a oznámí změnu
    const setPref = (key, value, ctx) => {
        const next = normalize({ ...prefs(ctx), [key]: value }, ctx);
        if (next[key] !== value) return false;
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

    return { CATALOG, THEMES, ROBES, FRAMES, AVATARS, DEFAULTS, isUnlocked, unlockText, find, normalize, prefs, setPref, onChange, register, getSections, apply, newRewards, rewardsAtLevel };
});
