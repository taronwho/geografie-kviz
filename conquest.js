// Dobývání: hry o mapu pro 2–8 hráčů (lobby, Rychlá hra, vlastní hry s nastavením). Čistá logika bez DOMu a sítě: pravidla (zrcadlo
// serveru, supabase/schema.sql blok „21: Dobývání“), barvy a znaky hráčů, mapa (sousedé, regiony, zobrazení bodů), otázky o území
// z dat témat (hlavní město, vlajka nebo znak, místo ve státě či kraji, najdi na mapě, soused), kronika tažení, přehrání a odměny.
// Vykreslení jako HTML a SVG (mapa na pergamenu, šrafy hráčů, vlaječky se znaky, opevnění, poklady, ozdoby). Ovládání v prohlížeči
// (přiblížení, animace, okna) je v conquest-ui.js. Mapy: data/dobyvani-<mapa>.json (scripts/build-dobyvani.js). Testy: tests/conquest.test.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore);
    if (isNode) module.exports = api;
    else root.MudrlantConquest = api;
})(typeof self !== 'undefined' ? self : this, (core) => {
    'use strict';

    // --- Obrázky (docs/OBRAZKY.md): do dodání existující obrázky nebo kresby SVG; po dodání stačí doplnit název souboru ---
    const ART = {
        card: 'sova-dalekohled',  // č. 234 'dobyvani' – sova dobyvatel s helmou a mapou (karta, tip, odznak)
        palisade: null,           // č. 260 'palisada' – opevnění 1 (do dodání kresba SVG)
        wall: null,               // č. 239 'hradba' – opevnění 2
        fortress: null,           // č. 261 'pevnost' – opevnění 3 (jen domovské území)
        castle: null,             // č. 262 'hrad-domov' – domovské území
        treasure: null,           // č. 263 'poklad' – truhla s pokladem
        compass: null,            // č. 235 'vetrna-ruzice'
        ship: null,               // č. 238 'plachetnice'
        monster: null,            // č. 237 'morska-prisera'
        cartouche: null,          // č. 236 'kartuse' – kartuše s názvem mapy (do dodání CSS .cq-cartouche)
        // Textury (icons/textury/<název>.webp): pergamen doplní background-image ve třídě .cq-paper (src/input.css), moře vzor v SVG
        paper: null,              // č. 232 'textura-pergamen'
        sea: null,                // č. 233 'textura-more'
        frame: null               // č. 240 'ramecek-dobyvatel' – rámeček vítěze (look.js ART_FRAMES s badge: 'dobyvatel', až bude obrázek)
    };
    const artUrl = (name) => `icons/topics/${name}.webp`;

    // --- Pravidla (stejná jako na serveru) ---
    const MAPS = [
        { id: 'evropa', title: 'Evropa', icon: 'castle' },
        { id: 'afrika', title: 'Afrika', icon: 'sun' },
        { id: 'asie', title: 'Asie', icon: 'mountain' },
        { id: 'amerika', title: 'Amerika', icon: 'compass' },
        { id: 'cesko', title: 'Česko', icon: 'house', kraje: true }
    ];
    const MAP_BY_ID = Object.fromEntries(MAPS.map(map => [map.id, map]));
    const DURATIONS = [6, 12, 24, 48, 72, 120, 168];
    const PERIODS = ['day', 'hour'];
    const MIN_PLAYERS = 2;
    const MAX_PLAYERS = 8;
    const MAX_ACTIONS = 10;
    const MAX_GAMES = 6;
    const MAX_OWN_LOBBIES = 2;
    const REGION_POINTS = 2;
    const LEVELS = [
        { level: 0, name: 'Bez opevnění', short: '' },
        { level: 1, name: 'Palisáda', acc: 'Palisádu' },
        { level: 2, name: 'Hradba', acc: 'Hradbu' },
        { level: 3, name: 'Pevnost', acc: 'Pevnost' }
    ];
    const maxLevel = (home) => (home ? 3 : 2);
    // Odměny po konci hry (server potvrdí místo, eligible a claimed_now): 1. místo odznak Dobyvatel; XP za 1.–3. místo, ne za poslední
    const REWARD_XP = [150, 100, 50];
    const rewardFor = ({ place, players, eligible }) => {
        if (!eligible || !place) return { badge: false, xp: 0 };
        // Poslední místo XP nedostane (ve hře dvou hráčů tedy jen vítěz)
        return { badge: place === 1, xp: place <= 3 && (place === 1 || place < players) ? REWARD_XP[place - 1] : 0 };
    };
    const PRESET_NAMES = { 'evropa-3d': 'Rychlá hra', 'cesko-12h': 'Rychlá hra', 'afrika-7d': 'Rychlá hra' };

    // --- Barvy hráčů (stejný seznam má server: conquest_colors) ---
    const COLORS = [
        ['cervena', 'Červená', '#d62839'], ['karminova', 'Karmínová', '#9e1b2c'], ['ruzova', 'Růžová', '#e0609c'], ['malinova', 'Malinová', '#b0207e'],
        ['oranzova', 'Oranžová', '#ee7b16'], ['cihlova', 'Cihlová', '#b8512e'], ['jantarova', 'Jantarová', '#d99a0b'], ['zluta', 'Žlutá', '#e8c51e'],
        ['olivova', 'Olivová', '#7d8a22'], ['limetkova', 'Limetková', '#7cbf2a'], ['zelena', 'Zelená', '#2f9a4a'], ['lesni', 'Lesní', '#1d6331'],
        ['smaragdova', 'Smaragdová', '#0aa37a'], ['tyrkysova', 'Tyrkysová', '#19b2b0'], ['petrolejova', 'Petrolejová', '#0d7280'], ['azurova', 'Azurová', '#2d97e6'],
        ['modra', 'Modrá', '#2453c9'], ['namornicka', 'Námořnická', '#1c2a6b'], ['indigova', 'Indigová', '#4b39b8'], ['fialova', 'Fialová', '#7c34c1'],
        ['levandulova', 'Levandulová', '#9f84e6'], ['hneda', 'Hnědá', '#7b4f2b'], ['bridlicova', 'Břidlicová', '#4f5a68'], ['cerna', 'Černá', '#22201e']
    ].map(([id, name, hex]) => ({ id, name, hex }));
    const COLOR_BY_ID = Object.fromEntries(COLORS.map(color => [color.id, color]));
    const hexRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const rgbHex = (rgb) => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
    const mix = (hex, other, amount) => { const a = hexRgb(hex), b = hexRgb(other); return rgbHex(a.map((v, i) => v + (b[i] - v) * amount)); };
    const luminance = (hex) => { const [r, g, b] = hexRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    // Inkoust (okraj vlastních území, vlaječka) a barva znaku na vlaječce (bílá, na světlé barvě tmavá)
    const colorOf = (id) => COLOR_BY_ID[id] || COLORS[0];
    const inkOf = (id) => mix(colorOf(id).hex, '#1a1008', 0.38);
    const emblemInk = (id) => (luminance(colorOf(id).hex) > 0.42 ? '#2a1d10' : '#ffffff');

    // --- Znaky (stejný seznam má server: conquest_emblems). Kresby 24 × 24 jednou barvou (c), čitelné i na malé vlaječce ---
    const P = (d, c, extra = '') => `<path d="${d}" fill="${c}"${extra}/>`;
    const S = (d, c, width, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
    const O = (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`;
    const EVEN = ' fill-rule="evenodd"';
    // Cesta zrcadlená podle svislé osy x = 12 (jen absolutní příkazy M, L, H, V, C, Q, A, Z)
    const mirror = (d) => {
        const flip = (x) => String(Number((24 - Number(x)).toFixed(2)));
        return d.replace(/([MLHVCQAZ])([^MLHVCQAZ]*)/gi, (m, cmd, args) => {
            const n = (args.match(/-?\d*\.?\d+/g) || []);
            if (cmd === 'H') return `H${n.map(flip).join(' ')}`;
            if (cmd === 'A') return `A${n.map((v, i) => (i % 7 === 5 ? flip(v) : i % 7 === 4 ? String(1 - Number(v)) : v)).join(' ')}`;
            if (cmd === 'V' || cmd === 'Z') return `${cmd}${n.join(' ')}`;
            return `${cmd}${n.map((v, i) => (i % 2 === 0 ? flip(v) : v)).join(' ')}`;
        });
    };
    const starPath = (cx, cy, outer, inner, points, turn = -90) => {
        let d = '';
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 ? inner : outer;
            const a = (turn + i * 180 / points) * Math.PI / 180;
            d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
        }
        return `${d}Z`;
    };
    const circlePath = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    // Kruh opačným směrem: v jedné cestě s pravidlem nonzero vyřízne díru
    const circlePathReverse = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`;
    const ellipsePath = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    const EAGLE_WING = 'M13.4 9.2L20.6 2.6L20.4 6.1L22.6 6.2L21 9L23 9.8L20.4 12.3L21.6 13.6L17 15.2L13.6 13.6Z';
    const LILY_SIDE = 'M12.9 14.2C15.6 14.4 19.6 13.2 20.4 10C21 7.6 19.6 5.9 17.8 6.4C19.2 7.3 19 9.6 17.3 10.6C15.8 11.6 14 11.8 12.9 12.4Z';
    const ANTLER = 'M13.8 9.6C15 7 16.6 4.9 18.4 2.4M16.1 6.1L19.6 5.4M17.2 4.4L16.4 1.8M14.9 7.8L17.7 8.4';
    const EMBLEMS = [
        // Hříva z kulatých kadeří kolem hlavy (ne paprsky jako slunce) s mezerou kolem tváře, uši, oči, nos a tlama
        ['lev', 'Lev', (c) => P([circlePath(12, 12.4, 8.4), ...Array.from({ length: 11 }, (_, i) => { const a = (i * 360 / 11 - 90) * Math.PI / 180; return circlePath(Number((12 + Math.cos(a) * 9.3).toFixed(2)), Number((12.4 + Math.sin(a) * 9.3).toFixed(2)), 2.3); }),
            circlePathReverse(12, 12.4, 6.8)].join(''), c)
            + P([circlePath(7.7, 8.1, 1.8), circlePath(16.3, 8.1, 1.8)].join(''), c)
            + P([circlePath(12, 12.9, 5.8), ellipsePath(9.7, 11.7, 1.05, 0.8), ellipsePath(14.3, 11.7, 1.05, 0.8), 'M10.3 13.9H13.7L12 16Z', 'M9.8 17Q12 18.7 14.2 17L14 18Q12 19.5 10 18Z'].join(''), c, EVEN)],
        ['orel', 'Orel', (c) => P([EAGLE_WING, mirror(EAGLE_WING), ellipsePath(12, 12.6, 2.7, 5.6), 'M12 16.5L15.6 22H8.4Z', circlePath(12, 6.3, 2.3), 'M13.8 5.6L16.4 6.8L13.9 7.6Z'].join(''), c)],
        ['sova', 'Sova', (c) => P(['M12 22C7 22 4.6 18 4.6 13.6V3.6L8.3 7.4C9.4 6.9 10.6 6.7 12 6.7C13.4 6.7 14.6 6.9 15.7 7.4L19.4 3.6V13.6C19.4 18 17 22 12 22Z',
            circlePath(9.1, 11.6, 2.5), circlePath(14.9, 11.6, 2.5), 'M11 14.6H13L12 16.4Z', 'M9.4 18.4L10.6 19.6L11.8 18.4M12.2 18.4L13.4 19.6L14.6 18.4'].join(''), c, EVEN)
            + O(9.1, 11.6, 1.1, c) + O(14.9, 11.6, 1.1, c)],
        ['drak', 'Drak', (c) => S('M7.2 6.6C10.2 5.6 11.6 8.6 10.6 11.4C9.4 14.8 12.4 17.4 16.2 15.8C18.6 14.8 20.2 16.2 21 18.8', c, 2.9)
            + P(['M2.2 6.4L6.8 3.6L8.6 6.6L6.4 8.6L3.6 8.2Z', 'M6.8 3.6L6.2 0.9L8.6 3Z', 'M10.6 9.4L13.6 2.8L14.8 5.9L17.6 4.2L17.3 7.8L20.2 8L12.2 12.2Z', 'M21 18.8L23.4 21.8L19.6 21.6Z'].join(''), c)],
        ['koruna', 'Koruna', (c) => P(['M3 18L4.4 7.6L8.9 11.8L12 5.6L15.1 11.8L19.6 7.6L21 18Z', 'M3 19.6H21V22.2H3Z'].join(''), c) + O(4.4, 6.6, 1.5, c) + O(12, 4.4, 1.6, c) + O(19.6, 6.6, 1.5, c)],
        ['mec', 'Meč', (c) => P(['M12 1.2L13.5 3.8V15H10.5V3.8Z', 'M6 15H18V17.2H6Z', 'M10.9 17.2H13.1V21H10.9Z'].join(''), c) + O(12, 22, 1.6, c)],
        ['kotva', 'Kotva', (c) => `<circle cx="12" cy="4.4" r="2" fill="none" stroke="${c}" stroke-width="1.9"/>` + S('M12 6.6V20.6M7.6 9.6H16.4M4.4 13.8C5.4 18.4 8.4 20.6 12 20.6S18.6 18.4 19.6 13.8', c, 2.3)
            + P('M2.4 15.2L4.4 11.4L7.2 14.6ZM21.6 15.2L19.6 11.4L16.8 14.6Z', c)],
        ['strom', 'Strom', (c) => O(12, 7.6, 5.6, c) + O(7.4, 11.4, 4.4, c) + O(16.6, 11.4, 4.4, c) + O(12, 12.6, 4.6, c) + P('M10.6 14H13.4L14 22H10Z', c)],
        ['hvezda', 'Hvězda', (c) => P(starPath(12, 12.8, 10.6, 4.4, 5), c)],
        ['slunce', 'Slunce', (c) => O(12, 12, 4.8, c) + P(starPath(12, 12, 11.4, 6.4, 12, -90), c) + `<circle cx="12" cy="12" r="5.8" fill="none" stroke="${c}" stroke-width="1"/>`],
        ['mesic', 'Měsíc', (c) => P('M15.2 2.4A9.8 9.8 0 1 0 21.6 17.2A8 8 0 1 1 15.2 2.4Z', c) + P(starPath(18.2, 8.2, 2.6, 1.1, 4, -90), c)],
        ['blesk', 'Blesk', (c) => P('M14.6 1.6L4.6 13.4H11L8.8 22.4L19.4 9.8H13Z', c)],
        ['vez', 'Věž', (c) => P(['M5.6 22.4V9.4H4.4V3.4H7.6V5.8H10.2V3.4H13.8V5.8H16.4V3.4H19.6V9.4H18.4V22.4Z', 'M9.8 22.4V17.4A2.2 2.2 0 0 1 14.2 17.4V22.4Z', 'M11.2 10.6H12.8V14H11.2Z'].join(''), c, EVEN)],
        ['klic', 'Klíč', (c) => `<circle cx="7.2" cy="7.2" r="4.4" fill="none" stroke="${c}" stroke-width="2.6"/>` + S('M10.4 10.4L21 21M15.6 15.6L18.2 13M18.6 18.6L21 16.2', c, 2.5)],
        ['kladivo', 'Kladivo', (c) => P(['M3.6 3.2H20.4V9.6H3.6Z', 'M10.6 9.6H13.4V20.4H10.6Z'].join(''), c) + O(12, 21.2, 1.8, c)],
        ['lod', 'Loď', (c) => P(['M2.6 15.4H21.4L18 20.8H6Z', 'M11.3 2.4H12.7V15.4H11.3Z', 'M12.7 3.6L19.4 13.6H12.7Z', 'M11.3 6L5.4 13.6H11.3Z', 'M12.7 2.4L16 3.4L12.7 4.4Z'].join(''), c)],
        ['jelen', 'Jelen', (c) => P(['M9.8 9.4H14.2L15.2 14L13.2 21H10.8L8.8 14Z', 'M9.4 10.2L5.2 8.6L8.8 12.4Z', mirror('M9.4 10.2L5.2 8.6L8.8 12.4Z'), ellipsePath(10.7, 13.2, 0.55, 0.8), ellipsePath(13.3, 13.2, 0.55, 0.8)].join(''), c, EVEN)
            + S(`${ANTLER}${mirror(ANTLER)}`, c, 1.5)],
        ['medved', 'Medvěd', (c) => P([circlePath(6, 6.6, 3.2), circlePath(6, 6.6, 1.3)].join(''), c, EVEN) + P([circlePath(18, 6.6, 3.2), circlePath(18, 6.6, 1.3)].join(''), c, EVEN)
            + P([circlePath(12, 13.4, 8), ellipsePath(12, 16.6, 3.6, 2.8), circlePath(8.9, 11.8, 1.05), circlePath(15.1, 11.8, 1.05)].join(''), c, EVEN) + P(ellipsePath(12, 15.7, 1.5, 1), c)],
        ['vlk', 'Vlk', (c) => P(['M12 22L8.2 17.4L5.2 12.2L4.2 2.8L9 7.8H15L19.8 2.8L18.8 12.2L15.8 17.4Z', 'M8.2 11L10.8 12L8.6 12.8Z', mirror('M8.2 11L10.8 12L8.6 12.8Z'),
            'M10.6 17.8H13.4L12 19.6Z', 'M5.8 5.6L8 8.6L6.4 9.8Z', mirror('M5.8 5.6L8 8.6L6.4 9.8Z')].join(''), c, EVEN)],
        ['lilie', 'Lilie', (c) => P(['M12 1.6C14.4 4.4 15.2 7.6 13.2 11.6L12 14.2L10.8 11.6C8.8 7.6 9.6 4.4 12 1.6Z', LILY_SIDE, mirror(LILY_SIDE), 'M6.8 13.8H17.2V16.2H6.8Z',
            'M12 16.2L13.4 19C14 20.6 15.8 21.4 17 20.4C15.4 20.2 14.6 19.2 14.4 17.8V16.2Z', mirror('M12 16.2L13.4 19C14 20.6 15.8 21.4 17 20.4C15.4 20.2 14.6 19.2 14.4 17.8V16.2Z'), 'M11 16.2H13L12 22Z'].join(''), c)],
        ['stit', 'Štít', (c) => P(['M12 1.8L20.8 5V11.2C20.8 16.8 17 20.6 12 22.4C7 20.6 3.2 16.8 3.2 11.2V5Z', 'M3.2 9.6H20.8V12.4H3.2Z'].join(''), c, EVEN)],
        ['srdce', 'Srdce', (c) => P('M12 21.4C5 15.8 2 12.2 2 8.2C2 5.2 4.4 3 7.2 3C9.2 3 11 4.2 12 6C13 4.2 14.8 3 16.8 3C19.6 3 22 5.2 22 8.2C22 12.2 19 15.8 12 21.4Z', c)],
        ['plamen', 'Plamen', (c) => P(['M12 1.6C13 5.8 18.4 8.4 18.4 14.2C18.4 18.6 15.4 22.4 12 22.4C8.6 22.4 5.6 18.6 5.6 14.6C5.6 11.6 7.4 9.6 8.8 8.4C8.8 11 9.8 12.6 11.2 13.2C10.4 9.2 10.8 5 12 1.6Z',
            'M12 21C13.8 21 15 19.4 15 17.4C15 15.2 13.2 14 12.4 12C11.6 14.2 9 15 9 17.6C9 19.6 10.2 21 12 21Z'].join(''), c, EVEN)],
        ['kosatka', 'Kosatka', (c) => P(['M1.6 13.4C3.4 9.6 8.6 8.2 13.4 9L15.4 2.8L17.6 9.6C19.4 10.4 20.8 11.6 21.6 13L23.4 10.6V16.6L21.6 14.6C18.8 17.8 12 18.8 6.4 16.8C3.8 15.9 2.2 15 1.6 13.4Z',
            ellipsePath(6, 11.6, 1.7, 0.85), 'M4.2 15.2C7.4 16.6 11.6 16.8 14.6 15.6C11.6 15.2 7.6 15 4.2 15.2Z'].join(''), c, EVEN) + P('M9.6 16.6L8.2 20.2L11.6 17.2Z', c)]
    ].map(([id, name, draw]) => ({ id, name, draw }));
    const EMBLEM_BY_ID = Object.fromEntries(EMBLEMS.map(emblem => [emblem.id, emblem]));
    const emblemOf = (id) => EMBLEM_BY_ID[id] || EMBLEMS[0];

    // --- Pomocné ---
    const esc = core && core.escapeHtml ? core.escapeHtml : (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const movesWord = (count) => plural(count, 'tah', 'tahy', 'tahů');
    const playersWord = (count) => plural(count, 'hráč', 'hráči', 'hráčů');
    const pointsWord = (count) => plural(count, 'bod', 'body', 'bodů');
    const territoriesWord = (count) => plural(count, 'území', 'území', 'území');
    const hash32 = (text) => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13;
        return hash >>> 0;
    };
    const seededRandom = (seed) => (core && core.createSeededRandom ? core.createSeededRandom(seed) : (() => { let s = hash32(seed); return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })());
    const shuffle = (list, rng) => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };

    // „6 h“, „3 dny“, „7 dní“
    const durationLabel = (hours) => (hours < 24 ? `${hours} h` : plural(hours / 24, 'den', 'dny', 'dní'));
    const periodLabel = (period) => (period === 'hour' ? 'za hodinu' : 'za den');
    const actionsLabel = (actions, period) => `${movesWord(actions)} ${periodLabel(period)}`;
    // Zbývající čas: „2 d 5 h“, „3 h 20 min“, „12 min“, „méně než minuta“
    const timeLeft = (ms) => {
        const minutes = Math.max(0, Math.floor(ms / 60000));
        if (minutes < 1) return 'méně než minuta';
        const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
        if (days) return `${days} d${hours ? ` ${hours} h` : ''}`;
        if (hours) return `${hours} h${mins ? ` ${mins} min` : ''}`;
        return `${mins} min`;
    };
    const parseTime = (value) => { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : null; };

    // --- Mapa: rejstřík, sousedé, regiony, zobrazení bodů z dat témat ---
    const indexes = new WeakMap();
    const indexMap = (data) => {
        if (!data) return null;
        if (indexes.has(data)) return indexes.get(data);
        const byId = new Map(data.t.map(item => [item.id, item]));
        const neighbours = new Map(data.t.map(item => [item.id, new Set(item.nb)]));
        const regionOf = new Map(data.t.map(item => [item.id, item.reg]));
        const regionById = new Map(data.regions.map(region => [region.id, region]));
        const sea = new Set(data.sea.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
        const index = { data, byId, neighbours, regionOf, regionById, sea, rings: new Map() };
        indexes.set(data, index);
        return index;
    };
    // Prstence území z cesty SVG (M x y l dx dy … z), pro „bod v území“ a hledání na mapě
    const parseRings = (d) => {
        const rings = [];
        for (const part of String(d || '').split(/z/i)) {
            const match = /^\s*M\s*(-?[\d.]+)[ ,]?(-?[\d.]+)\s*l?([\s\S]*)$/i.exec(part);
            if (!match) continue;
            let x = Number(match[1]), y = Number(match[2]);
            const ring = [[x, y]];
            const numbers = (match[3].match(/-?\d*\.?\d+/g) || []).map(Number);
            for (let i = 0; i + 1 < numbers.length; i += 2) { x += numbers[i]; y += numbers[i + 1]; ring.push([x, y]); }
            if (ring.length >= 3) rings.push(ring);
        }
        return rings;
    };
    const ringsOf = (index, id) => {
        if (!index.rings.has(id)) index.rings.set(id, parseRings((index.byId.get(id) || {}).d));
        return index.rings.get(id);
    };
    const pointInRings = (x, y, rings) => {
        let inside = false;
        for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };
    // Zobrazení mapy (Lambertovo azimutální stejnoploché, jako scripts/build-dobyvani.js): [šířka, délka] → [x, y] v jednotkách mapy
    const project = (data, lat, lon) => {
        const RAD = Math.PI / 180;
        const [lat0, lon0] = data.proj.c;
        const sin0 = Math.sin(lat0 * RAD), cos0 = Math.cos(lat0 * RAD);
        const phi = lat * RAD, dl = (((lon - lon0 + 540) % 360) - 180) * RAD;
        const k = Math.sqrt(2 / Math.max(1e-12, 1 + sin0 * Math.sin(phi) + cos0 * Math.cos(phi) * Math.cos(dl)));
        const x = k * Math.cos(phi) * Math.sin(dl), y = k * (cos0 * Math.sin(phi) - sin0 * Math.cos(phi) * Math.cos(dl));
        return [(x - data.proj.x0) * data.proj.k, (data.proj.y1 - y) * data.proj.k];
    };
    // Území, ve kterém leží bod (šířka, délka), nebo null
    const territoryAt = (data, lat, lon) => {
        const index = indexMap(data);
        const [x, y] = project(data, lat, lon);
        for (const item of data.t) {
            const [x0, y0, x1, y1] = item.b;
            if (x < x0 || x > x1 || y < y0 || y > y1) continue;
            if (pointInRings(x, y, ringsOf(index, item.id))) return item.id;
        }
        return null;
    };
    const isAdjacent = (data, a, b) => { const index = indexMap(data); return Boolean(index && index.neighbours.get(a) && index.neighbours.get(a).has(b)); };

    // --- Stav hry (ze serveru) jako pohled: hráči s barvami, území, sousedé, regiony, body, pořadí ---
    // state = conquest_state; data = mapa; meId = přihlášený hráč
    const viewOf = (state, data, meId) => {
        const index = indexMap(data);
        const players = (state.players || []).map(player => ({ ...player, color: colorOf(player.flag_color), emblemId: emblemOf(player.emblem).id }));
        const bySeat = new Map(players.map(player => [player.seat, player]));
        const byId = new Map(players.map(player => [player.id, player]));
        const me = players.find(player => player.me || player.id === meId) || null;
        const owners = new Map();
        for (const row of state.territories || []) owners.set(row.t, { owner: row.o || null, level: row.l || 0, home: Boolean(row.h), treasure: Boolean(row.p) });
        const ownerOf = (id) => (owners.get(id) || {}).owner || null;
        // Celé regiony podle hráčů
        const regionsOf = (playerId) => data.regions.filter(region => region.t.every(id => ownerOf(id) === playerId)).map(region => region.id);
        const territoriesOf = (playerId) => data.t.filter(item => ownerOf(item.id) === playerId).map(item => item.id);
        const scoreOf = (playerId) => territoriesOf(playerId).length + REGION_POINTS * regionsOf(playerId).length;
        const mine = me ? new Set(territoriesOf(me.id)) : new Set();
        const targets = new Set();
        for (const id of mine) for (const next of index.neighbours.get(id) || []) if (!mine.has(next)) targets.add(next);
        const ranking = rank(players.map(player => ({ ...player, score: Number.isFinite(player.score) ? player.score : scoreOf(player.id) })));
        return { state, data, index, players, bySeat, byId, me, owners, ownerOf, regionsOf, territoriesOf, scoreOf, mine, targets, ranking,
            running: state.status === 'running', finished: state.status === 'finished', budget: state.budget || null };
    };
    // Pořadí: body, při shodě dřív dosažené (score_at), místa se sdílí při úplné shodě
    const rank = (players) => {
        const at = (player) => parseTime(player.score_at) ?? Infinity;
        const sorted = [...players].sort((a, b) => b.score - a.score || at(a) - at(b) || a.seat - b.seat);
        return sorted.map(player => ({ ...player, place: player.place || 1 + sorted.filter(other => other.score > player.score || (other.score === player.score && at(other) < at(player))).length }));
    };
    // Zdroje útoku: moje území sousedící s cílem, nejbližší (podle bodu popisku) první
    const sourcesFor = (view, target) => {
        const item = view.index.byId.get(target);
        if (!item) return [];
        return [...view.mine].filter(id => view.index.neighbours.get(id).has(target))
            .map(id => ({ id, d: Math.hypot(view.index.byId.get(id).a[0] - item.a[0], view.index.byId.get(id).a[1] - item.a[1]) }))
            .sort((a, b) => a.d - b.d).map(entry => entry.id);
    };
    // Co jde s územím udělat: { attack, fortify, reason }
    const actionsFor = (view, id) => {
        const info = view.owners.get(id) || { owner: null, level: 0, home: false };
        const left = view.budget ? view.budget.left : 0;
        if (!view.running || !view.me) return { attack: false, fortify: false, reason: view.finished ? 'Hra skončila.' : '' };
        if (info.owner === view.me.id) {
            const max = maxLevel(info.home);
            if (info.level >= max) return { attack: false, fortify: false, reason: info.home ? 'Domovské území je opevněné naplno (Pevnost).' : 'Území je opevněné naplno (Hradba). Pevnost jde postavit jen na domovském území.' };
            return { attack: false, fortify: left > 0, reason: left > 0 ? '' : 'Tahy na tohle období už nemáš.' };
        }
        if (!view.targets.has(id)) return { attack: false, fortify: false, reason: view.mine.size ? 'Útočit jde jen na území, které sousedí s tvým.' : 'Nemáš žádné území. V dalším období dostaneš nové.' };
        return { attack: left > 0, fortify: false, reason: left > 0 ? '' : 'Tahy na tohle období už nemáš.' };
    };

    // --- Otázky o území (4 možnosti). Obtížnost roste s úrovní opevnění cíle ---
    // topics = { zemepis, vlajky, architektura } (pole položek z data/<téma>.json, chybějící se vynechá)
    const flagUrl = (fl, width = 160) => (fl && core && core.commonsPhotoUrl ? core.commonsPhotoUrl(fl[0], fl[1], width) : '');
    const PLACE_KINDS = {
        mesto: ['Které z těchto měst leží', 'Které z těchto měst leží'],
        hora: ['Která z těchto hor je', 'Která z těchto hor je'],
        jezero: ['Které z těchto jezer je', 'Které z těchto jezer je'],
        ostrov: ['Který z těchto ostrovů patří k území', 'Který z těchto ostrovů leží'],
        priroda: ['Které z těchto míst leží', 'Které z těchto míst leží'],
        stavba: ['Která z těchto staveb stojí', 'Která z těchto staveb stojí'],
        stavby: ['Která z těchto staveb stojí', 'Která z těchto staveb stojí']
    };
    // „ve státě Francie“, u krajů „v Jihočeském kraji“
    const inPhrase = (item) => item.loc || `ve státě ${item.n}`;
    const questionPools = new WeakMap();
    // Místa z dat témat podle území mapy (u států podle státu položky, u krajů podle polohy)
    const placesOf = (data, topics) => {
        const key = topics;
        if (!questionPools.has(key)) questionPools.set(key, new WeakMap());
        const cache = questionPools.get(key);
        if (cache.has(data)) return cache.get(data);
        const kraje = MAP_BY_ID[data.id] && MAP_BY_ID[data.id].kraje;
        const ids = new Set(data.t.map(item => item.id));
        const byTerritory = new Map(data.t.map(item => [item.id, []]));
        const add = (item, topic) => {
            if (!item.n || !PLACE_KINDS[item.c]) return;
            if (item.ty && /moře|oceán|záliv|zátoka|průliv/.test(item.ty)) return;
            let territory = null;
            if (kraje) {
                if (!(item.co || []).includes('Q213') || !Number.isFinite(item.la)) return;
                territory = territoryAt(data, item.la, item.lo);
            } else if ((item.co || []).length === 1 && ids.has(item.co[0])) territory = item.co[0];
            if (territory) byTerritory.get(territory).push({ item, topic });
        };
        (topics.zemepis || []).forEach(item => add(item, 'zemepis'));
        (topics.architektura || []).forEach(item => add(item, 'architektura'));
        const capitals = new Map();
        if (!kraje) (topics.zemepis || []).forEach(item => { if (item.c === 'stat' && ids.has(item.q) && item.f && item.f.cap) capitals.set(item.q, item.f.cap); });
        const result = { byTerritory, capitals };
        cache.set(data, result);
        return result;
    };
    // Názvy, které by odpověď prozradily (místo s názvem státu) nebo se pletou (stejný název ve dvou územích)
    const namePlain = (text) => (core && core.normalizeAnswer ? core.normalizeAnswer(text) : String(text).toLowerCase());
    const distinctLabels = (choices) => new Set(choices.map(choice => namePlain(choice.label))).size === choices.length;
    // Území podle vzdálenosti od cíle (sousedé napřed), bez cíle
    const nearbyTerritories = (data, id) => {
        const index = indexMap(data);
        const from = index.byId.get(id);
        return data.t.filter(item => item.id !== id)
            .map(item => ({ item, d: Math.hypot(item.a[0] - from.a[0], item.a[1] - from.a[1]) * (index.neighbours.get(id).has(item.id) ? 0.5 : 1) }))
            .sort((a, b) => a.d - b.d).map(entry => entry.item);
    };
    const kindsFor = (level) => (level <= 0 ? ['capital', 'flag', 'place-known', 'neighbour'] : level === 1 ? ['flag', 'place-known', 'map-known', 'capital'] : level === 2 ? ['place', 'map', 'flag', 'neighbour'] : ['place-hard', 'map', 'place']);
    const tryQuestion = (kind, { data, item, topics, rng }) => {
        const index = indexMap(data);
        const kraje = MAP_BY_ID[data.id] && MAP_BY_ID[data.id].kraje;
        const nearby = nearbyTerritories(data, item.id);
        const options = (correct, wrong) => {
            if (wrong.length < 3) return null;
            const choices = shuffle([{ ...correct, correct: true }, ...wrong.slice(0, 3).map(choice => ({ ...choice, correct: false }))], rng);
            return distinctLabels(choices) ? choices : null;
        };
        if (kind === 'capital') {
            if (kraje) {
                if (!item.seat) return null;
                const wrong = nearby.filter(other => other.seat && other.seat !== item.seat).map(other => ({ label: other.seat }));
                const choices = options({ label: item.seat }, wrong);
                return choices && { kind, prompt: `Které město je krajským městem ${item.gen}?`, choices };
            }
            const { capitals } = placesOf(data, topics);
            const own = capitals.get(item.id);
            if (!own) return null;
            const wrong = nearby.map(other => capitals.get(other.id)).filter(name => name && namePlain(name) !== namePlain(own)).map(label => ({ label }));
            const choices = options({ label: own }, wrong);
            return choices && { kind, prompt: `Které město je hlavním městem státu ${item.n}?`, choices };
        }
        if (kind === 'flag') {
            if (!item.fl) return null;
            const wrong = nearby.filter(other => other.fl).slice(0, 6);
            const picked = shuffle(wrong.slice(0, 5), rng).slice(0, 3);
            const choices = options({ label: item.n, image: flagUrl(item.fl) }, picked.map(other => ({ label: other.n, image: flagUrl(other.fl) })));
            return choices && { kind, prompt: kraje ? `Který znak má ${item.n}?` : `Kterou vlajku má ${item.n}?`, choices, images: true };
        }
        if (kind === 'neighbour') {
            if (kraje) return null;
            const near = index.neighbours.get(item.id);
            const correct = shuffle([...near], rng)[0];
            if (!correct) return null;
            const wrong = nearby.filter(other => !near.has(other.id)).slice(0, 6);
            const choices = options({ label: index.byId.get(correct).n }, shuffle(wrong, rng).map(other => ({ label: other.n })));
            return choices && { kind, prompt: `Který z těchto států sousedí se státem ${item.n} (na této mapě)?`, choices };
        }
        if (kind.startsWith('place')) {
            const { byTerritory } = placesOf(data, topics);
            const level = kind === 'place-known' ? 'known' : kind === 'place-hard' ? 'hard' : 'any';
            const fits = (entry) => (level === 'known' ? entry.item.k === 1 : level === 'hard' ? entry.item.k !== 1 : true);
            const own = shuffle((byTerritory.get(item.id) || []).filter(fits), rng).filter(entry => !namePlain(entry.item.n).includes(namePlain(item.n.split(' ')[0])));
            for (const pick of own.slice(0, 4)) {
                const category = pick.item.c;
                const wrong = [];
                const seen = new Set([namePlain(pick.item.n)]);
                for (const other of nearby) {
                    const pool = shuffle((byTerritory.get(other.id) || []).filter(entry => entry.item.c === category && (level === 'hard' || entry.item.k === pick.item.k || entry.item.k === 1)), rng);
                    const candidate = pool.find(entry => !seen.has(namePlain(entry.item.n)) && !(entry.item.co || []).includes(item.id));
                    if (candidate) { seen.add(namePlain(candidate.item.n)); wrong.push({ label: candidate.item.n }); }
                    if (wrong.length >= 3) break;
                }
                const choices = options({ label: pick.item.n }, wrong);
                if (choices) return { kind: 'place', prompt: `${PLACE_KINDS[category][kraje ? 1 : 0]} ${inPhrase(item)}?`, choices, topic: pick.topic };
            }
            return null;
        }
        if (kind.startsWith('map')) {
            // Najdi na mapě: obrys území a čtyři body (A–D); správný je skutečná poloha města, ostatní jiná místa v území
            const { byTerritory } = placesOf(data, topics);
            const rings = ringsOf(index, item.id);
            const [x0, y0, x1, y1] = item.b;
            const span = Math.hypot(x1 - x0, y1 - y0);
            const all = (byTerritory.get(item.id) || []).filter(entry => Number.isFinite(entry.item.la))
                .map(entry => ({ ...entry, xy: project(data, entry.item.la, entry.item.lo) })).filter(entry => pointInRings(entry.xy[0], entry.xy[1], rings));
            const targets = shuffle(all.filter(entry => entry.item.c === 'mesto' && (kind === 'map-known' ? entry.item.k === 1 : true)), rng);
            for (const pick of targets.slice(0, 3)) {
                const points = [pick.xy];
                for (const other of shuffle(all, rng)) {
                    if (points.length >= 4) break;
                    if (points.every(point => Math.hypot(point[0] - other.xy[0], point[1] - other.xy[1]) > span * 0.16)) points.push(other.xy);
                }
                if (points.length < 4) continue;
                const letters = ['A', 'B', 'C', 'D'];
                const order = shuffle([0, 1, 2, 3], rng);
                const choices = order.map((source, slot) => ({ label: letters[slot], correct: source === 0, point: points[source] }));
                return { kind: 'map', prompt: `Kde ${inPhrase(item)} leží ${pick.item.n}?`, choices, territory: item.id, answerLabel: pick.item.n };
            }
            return null;
        }
        return null;
    };
    // Otázka pro tah: semínko = hra, území, druh tahu a pořadí tahu (stejná otázka i po zavření aplikace)
    const buildQuestion = ({ data, territory, level = 0, topics = {}, seed = '' }) => {
        const item = indexMap(data).byId.get(territory);
        if (!item) return null;
        const rng = seededRandom(`dobyvani|${seed}|${territory}|${level}`);
        const kinds = [...shuffle(kindsFor(level), rng), 'capital', 'flag', 'neighbour', 'place', 'map'];
        for (const kind of kinds) {
            const question = tryQuestion(kind, { data, item, topics, rng });
            if (question) return { ...question, level, difficulty: Math.min(3, Math.max(1, level + 1)) };
        }
        return null;
    };

    // --- Kronika tažení a přehrání ---
    const PARTICIPLE = { n: ['dobyto', 'opevněno'], f: ['dobyta', 'opevněna'], m: ['dobyt', 'opevněn'], p: ['dobyty', 'opevněny'] };
    // „dobyto“, „dobyta“, „dobyt“, „dobyty“ podle rodu názvu území
    const capturedWord = (item) => (PARTICIPLE[(item && item.g) || 'n'] || PARTICIPLE.n)[0];
    // Záznamy kroniky od nejnovějšího: { id, icon, tone, title, text, actor, victim, at }
    const feedItems = (moves, view) => {
        const index = view.index;
        const name = (id) => (index.byId.get(id) || { n: id }).n;
        const genderOf = (id) => (index.byId.get(id) || {}).g || 'n';
        const player = (id) => view.byId.get(id) || null;
        const items = [];
        for (const move of moves || []) {
            const actor = player(move.u);
            const victim = move.v ? player(move.v) : null;
            const t = move.t;
            const first = items.length;
            if (move.r === 'home') items.push({ icon: 'flag', tone: 'neutral', title: name(t), text: 'Výprava začíná', actor });
            else if (move.r === 'respawn') items.push({ icon: 'repeat', tone: 'neutral', title: name(t), text: 'Návrat do hry', actor });
            else if (move.r === 'capture') {
                const word = PARTICIPLE[genderOf(t)][0];
                items.push({ icon: move.h ? 'castle' : 'flag', tone: 'capture', title: name(t), text: move.h ? 'Domovský hrad dobyt' : `${word.charAt(0).toUpperCase()}${word.slice(1)}`, actor, victim });
                if (move.p) items.push({ icon: 'gem', tone: 'gold', title: name(t), text: 'Poklad nalezen', actor });
            } else if (move.r === 'breach') items.push({ icon: 'hammer', tone: 'breach', title: name(t), text: `${LEVELS[move.l + 1] ? LEVELS[move.l + 1].name : 'Opevnění'} pobořena`, actor, victim });
            else if (move.r === 'fortify') items.push({ icon: 'shield', tone: 'fortify', title: name(t), text: `${PARTICIPLE[genderOf(t)][1].charAt(0).toUpperCase()}${PARTICIPLE[genderOf(t)][1].slice(1)} na ${LEVELS[move.l].acc}`, actor });
            else if (move.r === 'fail' && move.k === 'attack' && move.v) items.push({ icon: 'shield-check', tone: 'defend', title: name(t), text: 'Útok odražen', actor, victim });
            else continue;
            items.slice(first).forEach((entry, i) => { entry.id = `${move.id}${i ? `-${i}` : ''}`; entry.at = move.at; });
        }
        return items.reverse();
    };
    // Přehrání: kroky podle období (domovy, dobytí, návraty), každý krok = seznam změn { t, owner }
    const replaySteps = (history) => {
        const steps = [];
        let current = null;
        for (const move of history || []) {
            if (!['home', 'respawn', 'capture'].includes(move.r)) continue;
            if (!current || current.period !== move.n) { current = { period: move.n, changes: [] }; steps.push(current); }
            current.changes.push({ t: move.t, owner: move.u });
        }
        return steps;
    };

    // --- Kresby ikon na mapě (do dodání obrázků č. 239, 260–263): jednotky = výška ikony 24 ---
    const ICON_SHAPES = {
        palisade: '<path d="M3 22V9l2-3 2 3v13zM8.5 22V7l2-3 2 3v15zM14 22V8l2-3 2 3v14zM19 22V10l2-3 2 3v12z" fill="#8a5a2b" stroke="#4a2c12" stroke-width="1"/><path d="M2 14h21M2 18h21" stroke="#4a2c12" stroke-width="1.2"/>',
        wall: '<path d="M2 22V10h3V7h3v3h3V7h3v3h3V7h3v3h3v12z" fill="#b9ad97" stroke="#4d4233" stroke-width="1.1" stroke-linejoin="round"/><path d="M2 14h20M2 18h20M7 10v4M12 14v4M17 10v4M7 18v4M17 18v4" stroke="#4d4233" stroke-width="0.9"/>',
        fortress: '<path d="M7 22V6H5V2h2.5v1.6h2V2h2v1.6h2V2H16v4h-2v16z" fill="#a89c86" stroke="#3d3428" stroke-width="1"/><path d="M1.5 22v-9h2.4v-2h2.2v2H7v9zM16 22v-9h1.2v-2h2.2v2h2.4v9z" fill="#b9ad97" stroke="#3d3428" stroke-width="1"/><path d="M10 22v-4a1.6 1.6 0 0 1 3.2 0v4z" fill="#3d3428"/><path d="M10.6 8.4h1.8v3h-1.8z" fill="#3d3428"/>',
        castle: '<path d="M11.4 1v4.2" stroke="#3d3428" stroke-width="0.9"/><path d="M11.4 1l4 1.3-4 1.3z" fill="#c8102e"/><path d="M4 22V11H2.4V7.6h2v1.6h1.6V7.6h2V11H7.4v3h9.2v-3h-.6V7.6h2v1.6h1.6V7.6h2V11H20v11z" fill="#d8c9a8" stroke="#3d3428" stroke-width="1"/><path d="M8.6 14V6.4H7.6V4.2h1.6v1.2h1.4V4.2h1.6v1.2h1.4V4.2h1.6v2.2h-1v7.6z" fill="#e6d8b8" stroke="#3d3428" stroke-width="1"/><path d="M10 22v-4.4a2 2 0 0 1 4 0V22z" fill="#3d3428"/>',
        treasure: '<path d="M3 11h18v10H3z" fill="#9a5b22" stroke="#3a210b" stroke-width="1.1"/><path d="M3 11c0-4 3.6-6.4 9-6.4S21 7 21 11z" fill="#b8722e" stroke="#3a210b" stroke-width="1.1"/><path d="M3 13.6h18M7 4.9V21M17 4.9V21" stroke="#e8b923" stroke-width="1.6"/><rect x="10.2" y="12" width="3.6" height="4.2" rx="0.8" fill="#f2cf4d" stroke="#3a210b" stroke-width="0.8"/>',
        chestLid: '<path d="M3 11c0-4 3.6-6.4 9-6.4S21 7 21 11z" fill="#b8722e" stroke="#3a210b" stroke-width="1.1"/><path d="M7 4.9V11M17 4.9V11" stroke="#e8b923" stroke-width="1.6"/>'
    };
    const ICON_ART = { palisade: 'palisade', wall: 'wall', fortress: 'fortress', castle: 'castle', treasure: 'treasure' };
    const iconMarkup = (kind) => (ART[ICON_ART[kind]] ? `<image href="${artUrl(ART[ICON_ART[kind]])}" x="0" y="0" width="24" height="24"/>` : ICON_SHAPES[kind]);
    const levelIcon = (level, home) => (home ? 'castle' : ['', 'palisade', 'wall', 'fortress'][level] || '');

    // --- Vlaječka hráče se znakem (SVG): na mapě i v HTML ---
    // Praporec 0–30 × 0–22 (cíp vpravo), znak uprostřed
    const PENNANT = 'M0 0H30L24 11L30 22H0Z';
    const pennantGroup = (colorId, emblemId, { ink = true } = {}) => {
        const color = colorOf(colorId);
        return `<path d="${PENNANT}" fill="${color.hex}"${ink ? ` stroke="${inkOf(colorId)}" stroke-width="1.6" stroke-linejoin="round"` : ''}/>`
            + `<g transform="translate(3.6 1.6) scale(0.78)">${emblemOf(emblemId).draw(emblemInk(colorId))}</g>`;
    };
    // Vlaječka jako samostatný obrázek v HTML (seznamy hráčů, lobby, výběr)
    const pennantSvg = (colorId, emblemId, cls = 'h-6 w-8') => `<svg viewBox="-1 -1 32 24" class="${cls} shrink-0" aria-hidden="true" focusable="false">${pennantGroup(colorId, emblemId)}</svg>`;
    // Znak samotný (výběr znaku)
    const emblemSvg = (emblemId, color = 'currentColor', cls = 'h-6 w-6') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true" focusable="false">${emblemOf(emblemId).draw(color)}</svg>`;

    // --- Šrafy hráčů (podle pořadí ve hře): barva není jediné rozlišení ---
    const HATCH = 12;
    const hatchPattern = (seat, colorId, prefix = 'cq') => {
        const ink = inkOf(colorId);
        const line = (d, w = 1.8) => `<path d="${d}" stroke="${ink}" stroke-width="${w}" stroke-opacity="0.5" fill="none"/>`;
        const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink}" fill-opacity="0.5"/>`;
        const shapes = [
            line(`M0 ${HATCH}L${HATCH} 0M-3 3L3 -3M${HATCH - 3} ${HATCH + 3}L${HATCH + 3} ${HATCH - 3}`),
            line(`M0 0L${HATCH} ${HATCH}M-3 ${HATCH - 3}L3 ${HATCH + 3}M${HATCH - 3} -3L${HATCH + 3} 3`),
            line(`M0 ${HATCH / 2}H${HATCH}`),
            line(`M${HATCH / 2} 0V${HATCH}`),
            line(`M0 ${HATCH}L${HATCH} 0M0 0L${HATCH} ${HATCH}`, 1.2),
            dot(HATCH / 2, HATCH / 2, 1.8),
            `<circle cx="${HATCH / 2}" cy="${HATCH / 2}" r="3" fill="none" stroke="${ink}" stroke-width="1.2" stroke-opacity="0.5"/>`,
            line(`M0 ${HATCH * 0.7}L${HATCH / 4} ${HATCH * 0.3}L${HATCH / 2} ${HATCH * 0.7}L${HATCH * 0.75} ${HATCH * 0.3}L${HATCH} ${HATCH * 0.7}`, 1.4)
        ];
        return `<pattern id="${prefix}-hatch-${seat}" width="${HATCH}" height="${HATCH}" patternUnits="userSpaceOnUse">${shapes[seat % shapes.length]}</pattern>`;
    };

    // --- Ozdoby mapy (do dodání obrázků č. 235, 237, 238): kresby sépiovým inkoustem ---
    const compassRose = (x, y, r) => {
        const big = (angle) => { const a = angle * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
        const small = (angle, k) => { const a = angle * Math.PI / 180; return [Math.cos(a) * r * k, Math.sin(a) * r * k]; };
        let points = '';
        for (let i = 0; i < 4; i++) {
            const angle = -90 + i * 90;
            const [tx, ty] = big(angle), [lx, ly] = small(angle - 45, 0.22), [rx, ry] = small(angle + 45, 0.22);
            points += `<path d="M0 0L${tx.toFixed(1)} ${ty.toFixed(1)}L${lx.toFixed(1)} ${ly.toFixed(1)}Z" fill="#5b3a1e"/><path d="M0 0L${tx.toFixed(1)} ${ty.toFixed(1)}L${rx.toFixed(1)} ${ry.toFixed(1)}Z" fill="#e9d9b4" stroke="#5b3a1e" stroke-width="0.6"/>`;
            const [dx, dy] = small(angle + 45, 0.62), [ax, ay] = small(angle + 45 - 45, 0.16), [bx, by] = small(angle + 45 + 45, 0.16);
            points += `<path d="M0 0L${dx.toFixed(1)} ${dy.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}Z" fill="#8b6b45"/><path d="M0 0L${dx.toFixed(1)} ${dy.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}Z" fill="#f1e5c6" stroke="#5b3a1e" stroke-width="0.5"/>`;
        }
        return `<g class="cq-deco" transform="translate(${x} ${y})"><circle r="${(r * 0.78).toFixed(1)}" fill="none" stroke="#6b4a2a" stroke-width="0.8" stroke-dasharray="2 2.4"/>`
            + `<circle r="${(r * 0.7).toFixed(1)}" fill="none" stroke="#6b4a2a" stroke-width="0.5"/>${points}<circle r="${(r * 0.07).toFixed(1)}" fill="#e9d9b4" stroke="#5b3a1e" stroke-width="0.6"/>`
            + `<text y="${(-r * 1.08).toFixed(1)}" text-anchor="middle" class="cq-deco-letter" font-size="${(r * 0.3).toFixed(1)}">S</text></g>`;
    };
    const SHIP = '<path d="M-20 4H20L14 13H-14Z" fill="#7a5233" stroke="#3b2412" stroke-width="1.2"/><path d="M-1 4V-26M-12 4V-16M10 4V-18" stroke="#3b2412" stroke-width="1.4"/>'
        + '<path d="M-1 -24C7 -19 7 -9 -1 -4ZM-12 -15C-5 -11 -5 -5 -12 -2ZM10 -17C16 -13 16 -6 10 -3Z" fill="#f4ead2" stroke="#3b2412" stroke-width="1"/><path d="M-1 -26L7 -24L-1 -22Z" fill="#a23b2a"/>'
        + '<path d="M-26 15Q-21 12 -16 15T-6 15T4 15T14 15T24 15" fill="none" stroke="#45677a" stroke-width="1.2" stroke-linecap="round"/>';
    const MONSTER = '<path d="M-30 8C-26 -6 -18 -6 -14 8M-6 8C-2 -10 8 -10 12 8" fill="none" stroke="#2f5d57" stroke-width="5" stroke-linecap="round"/>'
        + '<path d="M18 8C20 -6 26 -12 32 -10C37 -8 36 -2 31 -2C27 -2 27 -6 24 -4" fill="none" stroke="#2f5d57" stroke-width="5" stroke-linecap="round"/>'
        + '<circle cx="31.5" cy="-7" r="1.4" fill="#f4ead2"/><path d="M-21 -2L-19 -7L-16 -2ZM1 -5L3 -10L6 -5Z" fill="#3e7a6f"/>'
        + '<path d="M-36 11Q-31 7 -26 11T-16 11T-6 11T4 11T14 11T24 11T34 11" fill="none" stroke="#45677a" stroke-width="1.2" stroke-linecap="round"/>';
    const decoMarkup = (kind, [x, y, r]) => {
        const size = Math.min(r * 0.75, 70);
        if (kind === 'compass') return ART.compass ? `<image class="cq-deco" href="${artUrl(ART.compass)}" x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}"/>` : compassRose(x, y, size);
        const scale = size / 34;
        const art = ART[kind];
        if (art) return `<image class="cq-deco" href="${artUrl(art)}" x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}"/>`;
        // Kresba je široká asi 74 jednotek (× měřítko): celá zůstane uvnitř rámu mapy
        const cx = Math.max(x, 37 * scale + 12);
        return `<g transform="translate(${cx.toFixed(1)} ${y}) scale(${scale.toFixed(2)})"><g class="cq-deco cq-bob">${kind === 'ship' ? SHIP : MONSTER}</g></g>`;
    };

    // --- Mapa SVG ---
    // view = viewOf(...) nebo null (náhled bez hry); opts.idPrefix odliší víc map na stránce
    const mapSvg = (data, view, opts = {}) => {
        const prefix = opts.idPrefix || 'cq';
        const { w, h } = data;
        const index = indexMap(data);
        const players = view ? view.players : [];
        const defs = [];
        // Moře: vlnky starých map; po dodání textury obrázek (č. 233)
        defs.push(`<pattern id="${prefix}-waves" width="40" height="22" patternUnits="userSpaceOnUse"><path d="M2 8q4.5-4 9 0t9 0M22 19q4.5-4 9 0t9 0" fill="none" stroke="#3f6a7d" stroke-width="1" stroke-opacity="0.3" stroke-linecap="round"/></pattern>`);
        if (ART.sea) defs.push(`<pattern id="${prefix}-seatex" width="256" height="256" patternUnits="userSpaceOnUse"><image href="icons/textury/${ART.sea}.webp" width="256" height="256"/></pattern>`);
        players.forEach(player => defs.push(hatchPattern(player.seat, player.flag_color, prefix)));
        const kraje = MAP_BY_ID[data.id] && MAP_BY_ID[data.id].kraje;
        // U krajů je „mořem“ cizina kolem Česka (pozadí dat je celý výřez)
        const allLand = kraje ? data.t.map(item => item.d).join('') : `${data.land}${data.t.map(item => item.d).join('')}`;
        const seaPath = `M-50 -50H${w + 50}V${h + 50}H-50Z${allLand}`;
        if (seaPath) defs.push(`<clipPath id="${prefix}-sea-clip"><path d="${seaPath}" clip-rule="evenodd"/></clipPath>`);
        const parts = [];
        if (kraje) {
            defs.push(`<pattern id="${prefix}-abroad" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 5H10" stroke="#7a5a32" stroke-width="1" stroke-opacity="0.25"/></pattern>`);
            parts.push(`<path class="cq-abroad" d="${seaPath}" fill-rule="evenodd"/><path d="${seaPath}" fill="url(#${prefix}-abroad)" fill-rule="evenodd" pointer-events="none"/>`);
            parts.push(`<g clip-path="url(#${prefix}-sea-clip)" pointer-events="none"><path class="cq-coast cq-frontier-2" d="${allLand}"/><path class="cq-coast cq-frontier-1" d="${allLand}"/></g>`);
        } else {
            parts.push(`<path class="cq-sea" d="${seaPath}" fill-rule="evenodd"/>`);
            parts.push(`<path d="${seaPath}" fill="url(#${prefix}-${ART.sea ? 'seatex' : 'waves'})" fill-rule="evenodd" pointer-events="none"/>`);
            // Pobřežní linky starých map: obrysy pevniny tahem do moře
            parts.push(`<g clip-path="url(#${prefix}-sea-clip)" pointer-events="none"><path class="cq-coast cq-coast-3" d="${allLand}"/><path class="cq-coast cq-coast-2" d="${allLand}"/><path class="cq-coast cq-coast-1" d="${allLand}"/></g>`);
            if (data.land) parts.push(`<path class="cq-bgland" d="${data.land}" pointer-events="none"/>`);
        }
        // Ozdoby na moři
        if (!opts.thumb && data.deco) ['compass', 'ship', 'monster'].forEach((kind, i) => { if (data.deco[i]) parts.push(decoMarkup(kind, data.deco[i])); });
        // Území: neutrální jen pergamen; obsazené barvou hráče (násobení) a šrafou
        const washes = [], hatches = [], inks = [];
        for (const item of data.t) {
            const info = view ? view.owners.get(item.id) : null;
            const owner = info && info.owner ? view.byId.get(info.owner) : null;
            if (owner) {
                washes.push(`<path class="cq-wash" data-wash="${item.id}" d="${item.d}" fill="${owner.color.hex}"/>`);
                hatches.push(`<path data-hatch="${item.id}" d="${item.d}" fill="url(#${prefix}-hatch-${owner.seat})"/>`);
                inks.push(`<path class="cq-ink${owner.me ? ' cq-ink-me' : ''}" data-ink="${item.id}" d="${item.d}" stroke="${inkOf(owner.flag_color)}"/>`);
            }
        }
        parts.push(`<g class="cq-washes" pointer-events="none">${washes.join('')}</g><g pointer-events="none">${hatches.join('')}</g>`);
        // Celé regiony: zlatá záře obrysu (pod hranicemi)
        if (view) for (const region of data.regions) {
            const owner = view.ownerOf(region.t[0]);
            if (owner && region.t.every(id => view.ownerOf(id) === owner)) parts.push(`<path class="cq-region-glow" data-region="${region.id}" d="${region.d}"/>`);
        }
        parts.push(`<g class="cq-borders" pointer-events="none">${data.t.map(item => `<path d="${item.d}"/>`).join('')}</g>`);
        // Rám mapy (dvojitá linka jako u tištěných map)
        if (!opts.thumb) parts.push(`<rect class="cq-neat" x="0" y="0" width="${w}" height="${h}" pointer-events="none"/><rect class="cq-neat-inner" x="6" y="6" width="${w - 12}" height="${h - 12}" pointer-events="none"/>`);
        parts.push(`<g class="cq-inks" pointer-events="none">${inks.join('')}</g>`);
        // Námořní spoje: tečkovaný oblouk mezi body popisků
        if (!opts.thumb) {
            const routes = data.sea.map(([a, b]) => {
                const pa = index.byId.get(a).a, pb = index.byId.get(b).a;
                const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dy = pb[1] - pa[1];
                const bend = 0.18;
                return `<path d="M${pa[0]} ${pa[1]}Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${pb[0]} ${pb[1]}"/>`;
            });
            parts.push(`<g class="cq-routes" pointer-events="none">${routes.join('')}</g>`);
        }
        // Klepací plochy území (nahoře, průhledné), zvýraznění vybraného
        parts.push(`<g class="cq-hits">${data.t.map(item => `<path class="cq-hit" data-t="${item.id}" d="${item.d}"/>`).join('')}</g>`);
        if (!opts.thumb) {
            parts.push('<g class="cq-select" pointer-events="none"></g>');
            // Popisky (velikost podle místa v území; malé se schovají, dokud se mapa nepřiblíží)
            const labels = data.t.map(item => {
                const size = Math.max(7, Math.min(30, item.r * 0.5));
                return `<text class="cq-label" data-label="${item.id}" data-size="${size.toFixed(1)}" x="${item.a[0]}" y="${(item.a[1] + size * 1.25).toFixed(1)}" font-size="${size.toFixed(1)}">${esc(item.n)}</text>`;
            });
            parts.push(`<g class="cq-labels" pointer-events="none">${labels.join('')}</g>`);
            parts.push(`<g class="cq-marks" pointer-events="none">${view ? data.t.map(item => marksFor(item, view)).join('') : ''}</g>`);
            parts.push('<g class="cq-fx" pointer-events="none"></g>');
        }
        const cls = `cq-svg${opts.thumb ? ' cq-thumb-svg' : ''}`;
        return `<svg viewBox="0 0 ${w} ${h}" class="${cls}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.label || `Mapa ${data.title}`)}"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
    };
    // Značky na území: opevnění nebo domovský hrad, poklad, vlaječka majitele (velikost 24 jednotek mapy; aplikace je při přiblížení zmenšuje)
    const MARK = 22;
    const marksFor = (item, view) => {
        const info = view.owners.get(item.id);
        if (!info) return '';
        const owner = info.owner ? view.byId.get(info.owner) : null;
        const [x, y] = item.a;
        let inner = '';
        const icon = levelIcon(info.level, info.home);
        if (icon) inner += `<g class="cq-icon" data-icon="${icon}" transform="translate(${-MARK * 0.05} ${-MARK * 0.95}) scale(${(MARK / 24).toFixed(3)})">${iconMarkup(icon)}${info.home && info.level ? levelPips(info.level) : ''}</g>`;
        if (info.treasure && !owner) inner += `<g class="cq-icon cq-treasure" data-icon="treasure" transform="translate(${-MARK * 0.5} ${-MARK * 0.95}) scale(${(MARK / 24).toFixed(3)})">${iconMarkup('treasure')}</g>`;
        if (owner) inner += `<g class="cq-pin" data-pin="${item.id}" transform="translate(${icon ? -MARK * 0.55 : -MARK * 0.1} 0)"><path d="M0 2V${-MARK * 1.25}" stroke="#3b2a1a" stroke-width="1.6" stroke-linecap="round"/><circle cx="0" cy="${-MARK * 1.25}" r="1.6" fill="#c9a227"/>`
            + `<g transform="translate(0.8 ${-MARK * 1.22}) scale(${(MARK * 0.75 / 30).toFixed(3)})">${pennantGroup(owner.flag_color, owner.emblem)}</g></g>`;
        return `<g class="cq-mark" data-mark="${item.id}" transform="translate(${x} ${y})"><g class="cq-mark-scale">${inner}</g></g>`;
    };
    // Úroveň opevnění domovského hradu: kamínky pod hradem
    const levelPips = (level) => Array.from({ length: level }, (_, i) => `<rect x="${7 + i * 3.6}" y="23" width="2.8" height="2.8" rx="0.6" fill="#c9a227" stroke="#3d3428" stroke-width="0.6"/>`).join('');
    // Malá mapa (náhled hry): území podle majitelů (owners = { území: místo hráče }); highlightSeat = moje barva výrazně
    const thumbSvg = (data, owners = {}, seatColors = {}, cls = 'h-12 w-14') => {
        const parts = data.t.map(item => {
            const seat = owners[item.id];
            const color = seat !== undefined && seatColors[seat] ? colorOf(seatColors[seat]).hex : null;
            return `<path d="${item.d}" class="${color ? 'cq-thumb-owned' : 'cq-thumb-land'}"${color ? ` fill="${color}"` : ''}/>`;
        });
        return `<svg viewBox="0 0 ${data.w} ${data.h}" class="${cls} cq-thumb" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path class="cq-thumb-bg" d="${data.land}"/>${parts.join('')}</svg>`;
    };

    // --- HTML ---
    const LABEL = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const CARD = 'rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70';
    const BUTTON = 'flex min-h-[2.5rem] min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-black active:scale-95 disabled:opacity-50';
    const BRAND_BUTTON = `${BUTTON} btn-3d bg-brand-700 text-white`;
    const GOLD_BUTTON = `${BUTTON} btn-3d bg-gradient-to-b from-gold-400 to-gold-600 text-brand-950`;
    const LIGHT_BUTTON = `${BUTTON} btn-3d-light bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100`;
    const DANGER_BUTTON = `${BUTTON} bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900`;
    const art = (name, cls) => `<img src="${artUrl(name)}" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    const chip = (text, icon = '') => `<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-700/60">${icon ? `<i data-lucide="${icon}" class="h-3 w-3"></i>` : ''}${esc(text)}</span>`;
    const mapTitle = (id) => (MAP_BY_ID[id] ? MAP_BY_ID[id].title : id);
    const paramChips = (game) => [chip(mapTitle(game.map), 'map'), chip(durationLabel(game.hours), 'hourglass'), chip(`${(game.players || []).length}/${game.max_players}`, 'users'),
        chip(actionsLabel(game.actions, game.period), 'swords'), ...(game.visibility === 'private' ? [chip('Soukromá', 'lock')] : [])].join('');
    const playerDots = (game) => `<span class="flex -space-x-1">${(game.players || []).map(player => `<span title="${esc(player.display_name)}" class="flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">${pennantSvg(player.flag_color, player.emblem, 'h-4 w-5')}</span>`).join('')}</span>`;

    // Karta na záložce Více hráčů: moje rozehraná hra (náhled, zbývá, tahy) nebo pozvánka do lobby
    const homeCardHtml = ({ games = null, maps = {}, now = Date.now(), loading = false }) => {
        const running = (games || []).filter(game => game.status === 'running');
        const waiting = (games || []).filter(game => game.status === 'lobby');
        const first = running[0];
        const head = `<span class="flex min-w-0 flex-1 flex-col"><span class="text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">Dobývání</span>`;
        if (first) {
            const data = maps[first.map];
            const meSeat = (first.players.find(player => player.me) || {}).seat;
            const seatColors = Object.fromEntries(first.players.map(player => [player.seat, player.flag_color]));
            const budget = first.budget || { left: 0, total: first.actions };
            const more = running.length > 1 ? ` · +${running.length - 1}` : '';
            return `<div id="conquest-card" class="flex items-center gap-2.5 ${CARD} cq-card-paper p-1.5 pr-2">
                <button type="button" data-action="conquest-open" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label="Otevřít Dobývání">
                    <span class="cq-thumb-frame flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, first.owners || {}, seatColors) : art(ART.card, 'h-10 w-10')}</span>
                    ${head}<span class="truncate text-[11.5px] font-bold text-slate-600 dark:text-slate-300">${esc(mapTitle(first.map))} · zbývá ${esc(timeLeft((parseTime(first.ends_at) || now) - now))}${esc(more)}</span>
                    <span class="flex items-center gap-1 text-[11.5px] font-black text-brand-800 dark:text-gold-200" data-conquest-moves>${meSeat !== undefined ? pennantSvg(first.players.find(p => p.me).flag_color, first.players.find(p => p.me).emblem, 'h-3.5 w-4') : ''}Tahy ${budget.left}/${budget.total}</span></span>
                </button>
                <button type="button" data-action="conquest-play" data-game="${esc(first.id)}" class="${GOLD_BUTTON} shrink-0 px-3.5"><i data-lucide="play" class="h-4 w-4"></i> Hrát</button>
            </div>`;
        }
        const text = loading && !games ? 'Načítám hry…' : waiting.length ? `Čekáš na hráče: ${plural(waiting.length, 'hra', 'hry', 'her')}` : 'Najdi hru nebo založ vlastní';
        return `<div id="conquest-card" class="flex items-center gap-2.5 ${CARD} cq-card-paper p-1.5 pr-2">
            <button type="button" data-action="conquest-open" class="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                ${art(ART.card, 'h-11 w-11 -my-1')}${head}<span class="truncate text-[12px] font-bold text-slate-600 dark:text-slate-300">${esc(text)}</span></span>
            </button>
            <button type="button" data-action="conquest-open" class="${BRAND_BUTTON} shrink-0"><i data-lucide="swords" class="h-4 w-4"></i> Otevřít</button>
        </div>`;
    };

    // Rozcestník Dobývání: záložky Moje hry / Lobby / Založit hru
    const HUB_TABS = [['mine', 'Moje hry', 'flag'], ['lobby', 'Lobby', 'users'], ['create', 'Založit hru', 'plus']];
    const hubHtml = ({ tab = 'mine', body = '' }) => `
        <div id="conquest-hub" class="flex min-h-full flex-col gap-2.5 p-3 short:gap-2 short:p-2">
            <div class="flex items-center gap-2.5">
                ${art(ART.card, 'h-12 w-12 -my-1 short:h-10 short:w-10')}
                <div class="min-w-0 flex-1"><h1 class="text-[18px] font-black leading-tight text-slate-800 dark:text-slate-100">Dobývání</h1>
                <p class="text-[12px] font-semibold leading-snug text-slate-500 short:hidden dark:text-slate-400">Dobývej území otázkami a opevňuj je. Kdo má na konci nejvíc bodů, vyhrává.</p></div>
                <button type="button" data-cq="help" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Jak se Dobývání hraje"><i data-lucide="info" class="h-5 w-5"></i></button>
            </div>
            <div role="tablist" class="flex shrink-0 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${HUB_TABS.map(([id, label, icon]) => `
                <button type="button" role="tab" data-cq-tab="${id}" aria-selected="${tab === id}" class="flex min-h-[2.5rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-1 text-[12.5px] font-black ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}"><i data-lucide="${icon}" class="h-4 w-4 shrink-0"></i>${label}</button>`).join('')}
            </div>
            <div data-cq-body class="flex flex-col gap-2">${body}</div>
        </div>`;
    const note = (text, owl = '') => `<div class="flex items-center gap-3 ${CARD} p-2.5">${owl ? art(owl, 'h-12 w-12') : ''}<p class="min-w-0 text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(text)}</p></div>`;
    // Řádek hry v seznamu (Moje hry, Lobby)
    const gameRowHtml = (game, { maps = {}, now = Date.now(), mine = false } = {}) => {
        const data = maps[game.map];
        const seatColors = Object.fromEntries((game.players || []).map(player => [player.seat, player.flag_color]));
        const me = (game.players || []).find(player => player.me);
        let status = '';
        let button = '';
        if (game.status === 'running') {
            const budget = game.budget || { left: 0, total: game.actions };
            status = `Zbývá ${timeLeft((parseTime(game.ends_at) || now) - now)} · Tahy ${budget.left}/${budget.total}`;
            button = `<button type="button" data-cq-play="${esc(game.id)}" class="${budget.left ? GOLD_BUTTON : LIGHT_BUTTON} shrink-0"><i data-lucide="${budget.left ? 'play' : 'map'}" class="h-4 w-4"></i>${budget.left ? 'Hrát' : 'Mapa'}</button>`;
        } else if (game.status === 'lobby') {
            const ready = (game.players || []).filter(player => player.ready).length;
            status = mine ? `Čeká na hráče · připraveno ${ready}/${(game.players || []).length}` : `${playersWord((game.players || []).length)} z ${game.max_players}`;
            button = mine ? `<button type="button" data-cq-lobby="${esc(game.id)}" class="${LIGHT_BUTTON} shrink-0"><i data-lucide="users" class="h-4 w-4"></i>Otevřít</button>`
                : `<button type="button" data-cq-join="${esc(game.id)}" class="${BRAND_BUTTON} shrink-0"><i data-lucide="user-plus" class="h-4 w-4"></i>Přidat se</button>`;
        } else {
            status = me && me.place ? `Konec · ${me.place}. místo · ${pointsWord(me.score)}` : 'Konec hry';
            button = `<button type="button" data-cq-play="${esc(game.id)}" class="${LIGHT_BUTTON} shrink-0"><i data-lucide="trophy" class="h-4 w-4"></i>Výsledky</button>`;
        }
        return `<li data-cq-game="${esc(game.id)}" class="flex items-center gap-2 ${CARD} p-1.5">
            <span class="cq-thumb-frame flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, game.owners || {}, seatColors) : ''}</span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="flex min-w-0 items-center gap-1.5"><span class="truncate text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(mapTitle(game.map))}</span>${game.preset ? chip(PRESET_NAMES[game.preset] || 'Rychlá hra', 'zap') : ''}${game.visibility === 'private' ? '<i data-lucide="lock" class="h-3.5 w-3.5 shrink-0 text-slate-400"></i>' : ''}</span>
                <span class="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${esc(game.status === 'lobby' ? `${durationLabel(game.hours)} · ${actionsLabel(game.actions, game.period)}` : status)}</span>
                <span class="flex min-w-0 items-center gap-1.5">${playerDots(game)}${game.status === 'lobby' ? `<span class="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">${esc(status)}</span>` : ''}</span>
            </span>
            ${button}
        </li>`;
    };
    const codeRow = () => `<button type="button" data-cq="code" class="flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl text-[13px] font-black text-brand-700 dark:text-cream"><i data-lucide="hash" class="h-4 w-4"></i> Mám kód hry</button>`;
    const mineHtml = ({ games, maps, now, error = '' }) => {
        if (games === null) return note(error || 'Načítám tvoje hry…', 'sova-ceka');
        if (!games.length) return `${note('Zatím nehraješ žádnou hru. Přidej se k Rychlé hře v Lobby, nebo založ vlastní.', 'sova-dalekohled')}
            <div class="grid grid-cols-2 gap-2"><button type="button" data-cq-tab="lobby" class="${BRAND_BUTTON}"><i data-lucide="users" class="h-4 w-4"></i> Lobby</button><button type="button" data-cq-tab="create" class="${LIGHT_BUTTON}"><i data-lucide="plus" class="h-4 w-4"></i> Založit hru</button></div>${codeRow()}`;
        return `<ul class="flex flex-col gap-1.5">${games.map(game => gameRowHtml(game, { maps, now, mine: true })).join('')}</ul>${codeRow()}`;
    };
    const lobbyHtml = ({ games, maps, now, error = '' }) => {
        if (games === null) return note(error || 'Načítám lobby…', 'sova-ceka');
        const open = games.filter(game => !game.mine);
        return `${open.length ? `<ul class="flex flex-col gap-1.5">${open.map(game => gameRowHtml(game, { maps, now })).join('')}</ul>` : note('Teď tu žádná otevřená hra není. Založ vlastní a počkej na ostatní.', 'sova-ceka')}${codeRow()}`;
    };

    // Formulář Založit hru: mapa, délka, hráči a tahy (krokování), období a kdo se může přidat, barva a znak; nahoře živý náhled
    const segment = (name, value, options, current, extra = '') => `<div role="radiogroup" aria-label="${esc(name)}" class="flex gap-1 ${extra}">${options.map(([id, label, disabled]) => `
        <button type="button" role="radio" aria-checked="${String(id) === String(current)}" data-cq-set="${value}" data-value="${esc(id)}" ${disabled ? 'disabled' : ''} class="min-h-[2.5rem] min-w-0 flex-1 rounded-xl px-1 text-[12.5px] font-black leading-tight disabled:opacity-35 ${String(id) === String(current) ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'}">${esc(label)}</button>`).join('')}</div>`;
    const stepper = (name, key, value, min, max) => `<div class="flex items-center justify-between gap-1 rounded-xl bg-white p-0.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" role="group" aria-label="${esc(name)}">
        <button type="button" data-cq-step="${key}" data-delta="-1" ${value <= min ? 'disabled' : ''} class="flex h-9 w-10 items-center justify-center rounded-lg text-slate-700 active:scale-95 disabled:opacity-30 dark:text-slate-200" aria-label="${esc(name)}: méně"><i data-lucide="minus" class="h-4 w-4"></i></button>
        <output class="min-w-[1.75rem] text-center text-[16px] font-black text-slate-800 dark:text-slate-100" data-cq-value="${key}">${value}</output>
        <button type="button" data-cq-step="${key}" data-delta="1" ${value >= max ? 'disabled' : ''} class="flex h-9 w-10 items-center justify-center rounded-lg text-slate-700 active:scale-95 disabled:opacity-30 dark:text-slate-200" aria-label="${esc(name)}: víc"><i data-lucide="plus" class="h-4 w-4"></i></button></div>`;
    const field = (label, inner, extra = '') => `<div class="flex min-w-0 flex-col gap-0.5 ${extra}"><span class="px-1 text-[10px] font-black uppercase leading-3 tracking-widest text-slate-500 dark:text-slate-400">${esc(label)}</span>${inner}</div>`;
    const createHtml = ({ draft, maps = {}, busy = false, error = '' }) => {
        const map = MAP_BY_ID[draft.map] || MAPS[0];
        const data = maps[map.id];
        const maxPlayers = data ? data.maxPlayers : MAX_PLAYERS;
        const players = Math.min(draft.players, maxPlayers);
        const preview = { map: map.id, hours: draft.hours, max_players: players, actions: draft.actions, period: draft.period, visibility: draft.visibility, players: [{ flag_color: draft.color, emblem: draft.emblem }] };
        const shortDuration = (hours) => (hours < 24 ? `${hours} h` : `${hours / 24} d`);
        return `<form data-cq-form class="flex flex-col gap-1.5" autocomplete="off">
            <div class="flex items-center gap-2 ${CARD} cq-card-paper p-1.5">
                <span class="cq-thumb-frame flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, {}, {}, 'h-14 w-16') : ''}</span>
                <span class="flex min-w-0 flex-1 flex-wrap gap-1" data-cq-preview>${paramChips(preview)}</span>
            </div>
            ${field('Mapa', segment('Mapa', 'map', MAPS.map(item => [item.id, item.title]), map.id))}
            ${field('Délka hry', segment('Délka hry', 'hours', DURATIONS.map(hours => [hours, shortDuration(hours)]), draft.hours))}
            <div class="grid grid-cols-2 gap-2">${field('Nejvýš hráčů', stepper('Nejvýš hráčů', 'players', players, MIN_PLAYERS, maxPlayers))}${field('Tahů za období', stepper('Tahů za období', 'actions', draft.actions, 1, MAX_ACTIONS))}</div>
            <div class="grid grid-cols-2 gap-2">${field('Období', segment('Období', 'period', [['day', 'Den'], ['hour', 'Hodina']], draft.period))}${field('Kdo se přidá', segment('Kdo se přidá', 'visibility', [['public', 'Kdokoli'], ['private', 'S kódem']], draft.visibility))}</div>
            <button type="button" data-cq="look" class="flex min-h-[2.75rem] items-center gap-2 ${CARD} px-2.5 text-left">${pennantSvg(draft.color, draft.emblem, 'h-7 w-9')}<span class="min-w-0 flex-1"><span class="block text-[10px] font-black uppercase leading-3 tracking-widest text-slate-500 dark:text-slate-400">Barva a znak</span><span class="block truncate text-[13px] font-bold text-slate-700 dark:text-slate-200">${esc(colorOf(draft.color).name)} · ${esc(emblemOf(draft.emblem).name)}</span></span><i data-lucide="pencil" class="h-4 w-4 text-brand-700 dark:text-cream"></i></button>
            <button type="submit" ${busy ? 'disabled' : ''} class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="flag" class="h-5 w-5"></i> ${busy ? 'Zakládám…' : 'Založit hru'}</button>
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </form>`;
    };

    // Okno Barva a znak: přepínač Barva / Znak (6 × 4 velkých políček), obsazené barvy ve hře nejdou; náhled vlaječky
    const lookHtml = ({ color, emblem, taken = [], tab = 'color', error = '' }) => `
        <div class="flex flex-col gap-2" data-cq-look>
            <div class="flex items-center justify-center gap-3">${pennantSvg(color, emblem, 'h-12 w-16')}<span class="text-[14px] font-black text-slate-800 dark:text-slate-100">${esc(colorOf(color).name)} · ${esc(emblemOf(emblem).name)}</span></div>
            <div role="tablist" class="flex gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${[['color', 'Barva'], ['emblem', 'Znak']].map(([id, label]) => `<button type="button" role="tab" aria-selected="${tab === id}" data-cq-look-tab="${id}" class="flex min-h-[2.5rem] flex-1 items-center justify-center rounded-xl text-[13px] font-black ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`).join('')}</div>
            ${tab === 'color' ? `<div role="radiogroup" aria-label="Barva" class="grid grid-cols-6 gap-1.5">${COLORS.map(item => {
                const off = taken.includes(item.id) && item.id !== color;
                return `<button type="button" role="radio" aria-checked="${item.id === color}" aria-label="${esc(item.name)}${off ? ' (má jiný hráč)' : ''}" data-cq-color="${item.id}" ${off ? 'disabled' : ''} class="relative h-11 rounded-xl disabled:opacity-25 ${item.id === color ? 'ring-[3px] ring-brand-700 ring-offset-2 dark:ring-gold-300 dark:ring-offset-slate-900' : 'ring-1 ring-black/15'}"><svg viewBox="0 0 10 10" preserveAspectRatio="none" class="h-full w-full rounded-xl" aria-hidden="true"><rect width="10" height="10" fill="${item.hex}"/></svg>${off ? '<i data-lucide="x" class="absolute inset-0 m-auto h-5 w-5 text-white"></i>' : ''}</button>`;
            }).join('')}</div>`
            : `<div role="radiogroup" aria-label="Znak" class="grid grid-cols-6 gap-1.5">${EMBLEMS.map(item => `<button type="button" role="radio" aria-checked="${item.id === emblem}" aria-label="${esc(item.name)}" title="${esc(item.name)}" data-cq-emblem="${item.id}" class="flex h-11 items-center justify-center rounded-xl ${item.id === emblem ? 'ring-[3px] ring-brand-700 ring-offset-2 dark:ring-gold-300 dark:ring-offset-slate-900' : 'ring-1 ring-black/15'}"><svg viewBox="0 0 24 24" class="h-11 w-full rounded-xl" aria-hidden="true"><rect width="24" height="24" fill="${colorOf(color).hex}"/><g transform="translate(3 3) scale(0.75)">${item.draw(emblemInk(color))}</g></svg></button>`).join('')}</div>`}
            <button type="button" data-cq="look-done" class="${BRAND_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="check" class="h-5 w-5"></i> Hotovo</button>
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </div>`;

    // Detail otevřené hry (lobby): hráči, Chci hrát, Odejít, kód a pozvánka
    const lobbyDetailHtml = ({ game, maps = {}, busy = false, error = '' }) => {
        const data = maps[game.map];
        const me = (game.players || []).find(player => player.me);
        const rows = (game.players || []).map(player => `<li class="flex items-center gap-2 rounded-2xl bg-white p-1.5 pr-2.5 shadow-sm dark:bg-slate-800 ${player.me ? 'ring-2 ring-brand-600 dark:ring-brand-400' : ''}">
                ${pennantSvg(player.flag_color, player.emblem, 'h-7 w-9')}<span class="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-800 dark:text-slate-100">${esc(player.display_name || 'Hráč')}${player.me ? ' (ty)' : ''}</span>
                <span class="flex shrink-0 items-center gap-1 text-[11.5px] font-black ${player.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}"><i data-lucide="${player.ready ? 'circle-check' : 'clock'}" class="h-4 w-4"></i>${player.ready ? 'Chce hrát' : 'Čeká'}</span></li>`).join('');
        const empty = Math.max(0, game.max_players - (game.players || []).length);
        return `<div data-cq-lobby-detail="${esc(game.id)}" class="flex flex-col gap-2">
            <div class="flex items-center gap-2 ${CARD} cq-card-paper p-1.5">
                <span class="cq-thumb-frame flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, {}, {}, 'h-14 w-16') : ''}</span>
                <span class="flex min-w-0 flex-1 flex-wrap gap-1">${paramChips(game)}</span>
            </div>
            <ul class="flex flex-col gap-1.5">${rows}${empty ? `<li class="px-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">Volná místa: ${empty}. Hra začne, až bude plná, nebo až budou chtít hrát všichni (aspoň dva).</li>` : ''}</ul>
            ${me ? `<button type="button" role="switch" aria-checked="${Boolean(me.ready)}" data-cq="ready" ${busy ? 'disabled' : ''} class="${me.ready ? BRAND_BUTTON : GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="${me.ready ? 'square-check-big' : 'square'}" class="h-5 w-5"></i> Chci hrát${me.ready ? ': ano' : ''}</button>` : ''}
            <div class="grid grid-cols-2 gap-2">
                <button type="button" data-cq="share" class="${LIGHT_BUTTON}"><i data-lucide="share-2" class="h-4 w-4"></i> Pozvat</button>
                ${me ? `<button type="button" data-cq="look" class="${LIGHT_BUTTON}"><i data-lucide="palette" class="h-4 w-4"></i> Barva a znak</button>` : ''}
            </div>
            ${game.code ? `<p class="px-1 text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">Kód hry <b class="font-mono text-[14px] tracking-[0.2em] text-slate-800 dark:text-slate-100">${esc(game.code)}</b></p>` : ''}
            ${me ? `<button type="button" data-cq="leave" class="${DANGER_BUTTON} w-full"><i data-lucide="log-out" class="h-4 w-4"></i> ${busy === 'leave' ? 'Opravdu odejít?' : 'Odejít'}</button>` : ''}
            <button type="button" data-cq-tab="mine" class="flex min-h-[2.5rem] items-center justify-center gap-1 rounded-xl text-[13px] font-bold text-slate-500 dark:text-slate-400"><i data-lucide="chevron-left" class="h-4 w-4"></i> Moje hry</button>
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </div>`;
    };

    // Obrazovka hry: lišta (zpět, kartuše s mapou a časem, tahy, kronika), mapa (výška podle tvaru mapy, nastaví conquest-ui.js), pod ní
    // hráči a poslední události; spodní list (území, otázka, výsledek) přes spodek obrazovky
    const gameScreenHtml = (view, { now = Date.now() } = {}) => {
        const game = view.state;
        const budget = view.budget;
        const end = parseTime(game.ends_at);
        const status = view.finished ? 'Hra skončila' : end ? `zbývá ${timeLeft(end - now)}` : '';
        return `<div id="conquest-game" data-game="${esc(game.id)}" class="cq-screen relative flex h-full min-h-0 flex-col gap-1.5 overflow-hidden p-2 short:gap-1 short:p-1.5">
            <div class="flex shrink-0 items-center gap-1.5">
                <button type="button" data-cq="hub" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl btn-3d-light bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200" aria-label="Moje hry"><i data-lucide="chevron-left" class="h-5 w-5"></i></button>
                <div class="cq-cartouche flex h-10 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-2 text-center">
                    <span class="cq-cartouche-title max-w-full truncate">${esc(mapTitle(game.map))}</span>
                    <span class="max-w-full truncate text-[10.5px] font-bold leading-3 text-amber-900/80" data-cq-clock>${esc(status)}</span>
                </div>
                ${budget ? `<span data-cq-budget class="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white px-2 text-[13px] font-black text-slate-800 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700" title="Tahy v tomto období">
                    <i data-lucide="swords" class="h-4 w-4 text-brand-700 dark:text-gold-300"></i><span class="sr-only">Tahy </span>${budget.left}/${budget.total}</span>` : ''}
                <button type="button" data-cq="feed" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl btn-3d-light bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200" aria-label="Kronika tažení"><i data-lucide="scroll-text" class="h-5 w-5"></i></button>
            </div>
            <div data-cq-wrap class="cq-map-wrap relative min-h-0 w-full shrink overflow-hidden rounded-2xl">
                <div data-cq-map class="cq-paper cq-map absolute inset-0 touch-none select-none">${mapSvg(view.data, view)}</div>
                <div class="cq-vignette pointer-events-none absolute inset-0 rounded-2xl"></div>
                <button type="button" data-cq="zoom-reset" class="absolute right-1.5 top-1.5 hidden h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-slate-700 shadow ring-1 ring-black/10 dark:bg-slate-800/90 dark:text-slate-200" aria-label="Celá mapa"><i data-lucide="expand" class="h-4 w-4"></i></button>
                <div data-cq-banner class="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2"></div>
            </div>
            <div data-cq-panel class="flex min-h-[2.25rem] flex-1 flex-col gap-1 overflow-hidden">
                <ul data-cq-players class="flex shrink-0 gap-1 overflow-x-auto pb-0.5">${playersStripHtml(view)}</ul>
                <button type="button" data-cq="feed" data-cq-recent class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden rounded-xl text-left">${recentHtml(view)}</button>
            </div>
            <div data-cq-sheet class="absolute inset-x-0 bottom-0 z-20"></div>
        </div>`;
    };
    const playersStripHtml = (view) => view.ranking.map(player => `<li class="flex min-w-0 shrink-0 items-center gap-1 rounded-xl bg-white px-1.5 py-1 shadow-sm dark:bg-slate-800 ${player.me ? 'ring-2 ring-brand-600 dark:ring-gold-300' : 'ring-1 ring-slate-200/70 dark:ring-slate-700'}" title="${esc(player.display_name)}">
            ${pennantSvg(player.flag_color, player.emblem, 'h-5 w-[1.6rem]')}<span class="max-w-[4.5rem] truncate text-[11.5px] font-bold text-slate-700 dark:text-slate-200">${esc(player.me ? 'Ty' : player.display_name)}</span><span class="text-[12px] font-black text-slate-900 dark:text-white">${player.score}</span></li>`).join('');
    // Poslední události pod mapou (klepnutí otevře celou kroniku)
    const recentHtml = (view) => {
        const items = feedItems(view.state.moves || [], view).slice(0, 4);
        if (!items.length) return '';
        return `<span class="px-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Kronika tažení</span>${items.map(item => `<span class="flex min-w-0 items-center gap-1.5 px-1 text-[12px] leading-tight text-slate-700 dark:text-slate-200">${item.actor ? pennantSvg(item.actor.flag_color, item.actor.emblem, 'h-3.5 w-[1.15rem]') : ''}<span class="min-w-0 truncate"><b>${esc(item.title)}:</b> ${esc(item.text)}${item.actor ? ` · ${esc(item.actor.me ? 'ty' : item.actor.display_name)}` : ''}</span></span>`).join('')}`;
    };

    // Spodní list území: majitel, opevnění, region, poklad; Zaútočit (s výběrem, odkud) / Opevnit
    const sheetHtml = (view, id, { source = null } = {}) => {
        const item = view.index.byId.get(id);
        const info = view.owners.get(id) || { owner: null, level: 0, home: false, treasure: false };
        const owner = info.owner ? view.byId.get(info.owner) : null;
        const region = view.index.regionById.get(item.reg);
        const regionOwner = region && region.t.every(t => view.ownerOf(t) && view.ownerOf(t) === view.ownerOf(region.t[0])) ? view.byId.get(view.ownerOf(region.t[0])) : null;
        const actions = actionsFor(view, id);
        const sources = actions.attack || view.targets.has(id) ? sourcesFor(view, id) : [];
        const from = source && sources.includes(source) ? source : sources[0];
        const levelName = info.level ? LEVELS[info.level].name : 'Bez opevnění';
        const facts = [
            `<span class="flex items-center gap-1">${owner ? pennantSvg(owner.flag_color, owner.emblem, 'h-4 w-5') : '<i data-lucide="map-pin" class="h-4 w-4"></i>'}${esc(owner ? (owner.me ? 'Tvoje území' : owner.display_name) : 'Neutrální území')}</span>`,
            `<span class="flex items-center gap-1"><i data-lucide="${info.home ? 'castle' : 'shield'}" class="h-4 w-4"></i>${esc(info.home ? `Domov · ${levelName}` : levelName)}</span>`,
            region ? `<span class="flex items-center gap-1"><i data-lucide="map" class="h-4 w-4"></i>${esc(region.n)}${regionOwner ? ` · celý: ${esc(regionOwner.me ? 'tvůj' : regionOwner.display_name)}` : ''}</span>` : '',
            info.treasure && !owner ? '<span class="flex items-center gap-1 text-amber-700 dark:text-amber-300"><i data-lucide="gem" class="h-4 w-4"></i>Poklad: +1 tah</span>' : ''
        ].filter(Boolean).join('');
        const pick = sources.length > 1 ? `<div class="flex items-center gap-1.5 overflow-x-auto"><span class="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">Odkud:</span>${sources.map(sid => `<button type="button" data-cq-source="${esc(sid)}" aria-pressed="${sid === from}" class="min-h-[2.25rem] shrink-0 rounded-full px-2.5 text-[12px] font-black ${sid === from ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}">${esc(view.index.byId.get(sid).n)}</button>`).join('')}</div>` : '';
        const buttons = actions.fortify
            ? `<button type="button" data-cq="fortify" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="castle" class="h-5 w-5"></i> Opevnit na ${esc(LEVELS[info.level + 1].acc)}</button>`
            : actions.attack ? `<button type="button" data-cq="attack" data-source="${esc(from || '')}" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="swords" class="h-5 w-5"></i> Zaútočit</button>` : '';
        const hint = !buttons && actions.reason ? `<p class="text-[12.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(actions.reason)}</p>` : '';
        const harder = actions.attack && info.level ? `<p class="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">Opevněné území: správná odpověď opevnění jen pobourá o jednu úroveň, otázka je těžší.</p>` : '';
        return `<div class="cq-sheet cq-sheet-in rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="${esc(item.n)}">
            <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><h2 class="truncate text-[17px] font-black leading-tight text-slate-900 dark:text-white">${esc(item.n)}</h2>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-slate-600 dark:text-slate-300">${facts}</div></div>
                <button type="button" data-cq="sheet-close" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Zavřít"><i data-lucide="x" class="h-5 w-5"></i></button></div>
            <div class="mt-2 flex flex-col gap-1.5">${pick}${harder}${buttons}${hint}</div>
        </div>`;
    };

    // Otázka tahu ve spodním listu
    const questionHtml = (question, { title, item, data, answered = null }) => {
        const stars = '<span class="flex gap-0.5" aria-label="Obtížnost">' + [1, 2, 3].map(n => `<i data-lucide="star" class="h-3.5 w-3.5 ${n <= question.difficulty ? 'fill-gold-400 text-gold-500' : 'text-slate-300 dark:text-slate-600'}"></i>`).join('') + '</span>';
        let visual = '';
        if (question.kind === 'map') {
            const [x0, y0, x1, y1] = item.b;
            const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
            const r = Math.max(x1 - x0, y1 - y0) * 0.035;
            const dots = question.choices.map((choice, i) => {
                const state = answered === null ? '' : choice.correct ? ' cq-dot-ok' : answered === i ? ' cq-dot-bad' : '';
                return `<g class="cq-dot${state}"><circle cx="${choice.point[0].toFixed(1)}" cy="${choice.point[1].toFixed(1)}" r="${r.toFixed(1)}"/><text x="${choice.point[0].toFixed(1)}" y="${(choice.point[1] + r * 0.42).toFixed(1)}" font-size="${(r * 1.25).toFixed(1)}" text-anchor="middle">${choice.label}</text></g>`;
            }).join('');
            visual = `<svg viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + pad * 2).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}" class="cq-qmap cq-paper mx-auto h-32 w-full rounded-xl short:h-24" aria-hidden="true"><path d="${item.d}" class="cq-qmap-land"/>${dots}</svg>`;
        }
        const grid = question.images ? 'grid grid-cols-2 gap-1.5' : question.kind === 'map' ? 'grid grid-cols-4 gap-1.5' : 'grid grid-cols-1 gap-1.5';
        const options = question.choices.map((choice, i) => {
            const state = answered === null ? '' : choice.correct ? ' cq-choice-ok' : answered === i ? ' cq-choice-bad' : ' opacity-60';
            const inner = question.images ? `<img src="${esc(choice.image)}" alt="" class="h-12 w-full object-contain short:h-10" referrerpolicy="no-referrer"><span class="sr-only">Možnost ${i + 1}</span>` : esc(choice.label);
            return `<button type="button" data-cq-answer="${i}" ${answered !== null ? 'disabled' : ''} class="cq-choice${state} flex min-h-[2.75rem] items-center justify-center rounded-xl px-2 py-1 text-center text-[14px] font-bold leading-tight text-slate-800 dark:text-slate-100">${inner}</button>`;
        }).join('');
        const after = answered === null ? '' : question.kind === 'map' ? `<p class="text-center text-[12.5px] font-bold text-slate-600 dark:text-slate-300">${esc(question.answerLabel)} je bod ${esc(question.choices.find(c => c.correct).label)}.</p>`
            : question.images ? `<p class="text-center text-[12.5px] font-bold text-slate-600 dark:text-slate-300">Správně: ${esc(question.choices.find(c => c.correct).label)}</p>` : '';
        return `<div class="cq-sheet cq-sheet-in rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="Otázka">
            <div class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate text-[11.5px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">${esc(title)}</span>${stars}</div>
            <p class="mt-1 text-[15px] font-black leading-snug text-slate-900 dark:text-white">${esc(question.prompt)}</p>
            ${visual ? `<div class="mt-1.5">${visual}</div>` : ''}
            <div class="mt-2 ${grid}">${options}</div>
            ${after ? `<div class="mt-1.5">${after}</div>` : ''}
        </div>`;
    };

    // Kronika tažení (okno)
    const feedHtml = (items, { avatarHtml = null } = {}) => {
        if (!items.length) return '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Zatím se nic nestalo.</p>';
        const TONES = { capture: 'text-rose-700 dark:text-rose-300', breach: 'text-orange-700 dark:text-orange-300', fortify: 'text-emerald-700 dark:text-emerald-300', defend: 'text-sky-700 dark:text-sky-300', gold: 'text-amber-700 dark:text-amber-300', neutral: 'text-slate-600 dark:text-slate-300' };
        return `<ol class="flex flex-col gap-1">${items.map(item => `<li class="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800">
            <i data-lucide="${item.icon}" class="h-4 w-4 shrink-0 ${TONES[item.tone] || ''}"></i>
            <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(item.title)}: ${esc(item.text)}</span>
            <span class="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">${item.actor ? `${pennantSvg(item.actor.flag_color, item.actor.emblem, 'h-3 w-4')}${esc(item.actor.me ? 'ty' : item.actor.display_name)}` : ''}${item.victim && item.victim !== item.actor ? ` · dosud ${esc(item.victim.me ? 'ty' : item.victim.display_name)}` : ''}${item.at ? ` · ${esc(clock(item.at))}` : ''}</span></span></li>`).join('')}</ol>`;
    };
    const clock = (at) => {
        const time = parseTime(at);
        if (time === null) return '';
        try { return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(time)); } catch (e) { return new Date(time).toISOString().slice(5, 16).replace('T', ' '); }
    };

    // Výsledek: stupně vítězů a celé pořadí
    const resultHtml = (view, { reward = null } = {}) => {
        const podium = [1, 0, 2].map(i => view.ranking[i]).map((player, slot) => {
            if (!player) return '<span class="flex-1"></span>';
            const height = ['h-14', 'h-20', 'h-10'][slot];
            return `<div class="flex min-w-0 flex-1 flex-col items-center gap-1 cq-podium-step" data-place="${player.place}">${pennantSvg(player.flag_color, player.emblem, 'h-8 w-11')}<span class="max-w-full truncate text-[12px] font-black text-slate-800 dark:text-slate-100">${esc(player.me ? 'Ty' : player.display_name)}</span>
                <span class="flex w-full ${height} items-start justify-center rounded-t-xl pt-1 text-[18px] font-black cq-podium-${player.place <= 3 ? player.place : 'x'}">${player.place}.</span></div>`;
        }).join('');
        const rows = view.ranking.map(player => `<li class="flex items-center gap-2 rounded-xl bg-white px-2 py-1 shadow-sm dark:bg-slate-800 ${player.me ? 'ring-2 ring-brand-600' : ''}"><span class="w-6 text-center text-[13px] font-black text-slate-500">${player.place}.</span>${pennantSvg(player.flag_color, player.emblem, 'h-4 w-5')}<span class="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">${esc(player.display_name)}${player.me ? ' (ty)' : ''}</span><span class="text-[12.5px] font-black text-slate-800 dark:text-slate-100">${esc(pointsWord(player.score))}</span></li>`).join('');
        const prize = reward && (reward.badge || reward.xp) ? `<p class="rounded-xl bg-gold-50 px-2 py-1.5 text-center text-[13px] font-black text-brand-950 ring-1 ring-gold-300 dark:bg-gold-900/30 dark:text-gold-100 dark:ring-gold-700">${reward.badge ? 'Odznak Dobyvatel' : ''}${reward.badge && reward.xp ? ' a ' : ''}${reward.xp ? `+${reward.xp} XP` : ''}</p>` : '';
        return `<div class="flex flex-col gap-2" data-cq-result><div class="flex items-end gap-1.5 px-2">${podium}</div>${prize}<ol class="flex flex-col gap-1">${rows}</ol>
            <p class="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">Body: 1 za každé území a ${REGION_POINTS} za celý region. Při shodě vyhrává, kdo svého počtu bodů dosáhl dřív.</p>
            <button type="button" data-cq="replay" class="${LIGHT_BUTTON} w-full"><i data-lucide="repeat" class="h-4 w-4"></i> Přehrát celou hru</button></div>`;
    };

    // Jak se hraje (okno)
    const helpHtml = () => `<div class="flex flex-col gap-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200">
        <p><b>Hra:</b> 2 až 8 hráčů dobývá jednu mapu. Každý začíná na svém domovském území s hradem. Hra trvá podle nastavení (6 hodin až 7 dní).</p>
        <p><b>Tahy:</b> za den nebo za hodinu (podle hry) máš několik tahů. Tah je jedna otázka o území. Nevyužité tahy se nepřevádějí.</p>
        <p><b>Zaútočit</b> jde na území, které sousedí s tvým. Správná odpověď neopevněné území dobude. Opevněné jen pobourá o jednu úroveň a otázka je těžší.</p>
        <p><b>Opevnit</b> jde vlastní území: Palisáda, Hradba a na domovském území i Pevnost.</p>
        <p><b>Navíc:</b> +1 tah za každý celý region, +1 tah hned za poklad a +1 tah v dalším období za dobytý domov soupeře. Kdo přijde o všechna území, dostane v dalším období nové.</p>
        <p><b>Konec:</b> 1 bod za území a ${REGION_POINTS} za celý region. Při shodě vyhrává, kdo svých bodů dosáhl dřív. Vítěz dostane odznak Dobyvatel, 2. a 3. místo XP (ve hře aspoň 3 hráčů, nebo ve hře na den a déle).</p>
    </div>`;

    return {
        ART, MAPS, MAP_BY_ID, DURATIONS, PERIODS, MIN_PLAYERS, MAX_PLAYERS, MAX_ACTIONS, MAX_GAMES, MAX_OWN_LOBBIES, REGION_POINTS, LEVELS, REWARD_XP,
        COLORS, COLOR_BY_ID, EMBLEMS, EMBLEM_BY_ID, colorOf, emblemOf, inkOf, emblemInk, luminance, maxLevel, rewardFor,
        durationLabel, periodLabel, actionsLabel, timeLeft, movesWord, pointsWord, playersWord, territoriesWord,
        indexMap, parseRings, pointInRings, project, territoryAt, isAdjacent, viewOf, rank, sourcesFor, actionsFor,
        buildQuestion, kindsFor, placesOf, feedItems, replaySteps, capturedWord, hatchPattern, levelIcon, iconMarkup,
        pennantSvg, pennantGroup, emblemSvg, mapSvg, thumbSvg, marksFor, homeCardHtml, hubHtml, mineHtml, lobbyHtml, createHtml, lookHtml, lobbyDetailHtml,
        gameScreenHtml, playersStripHtml, recentHtml, sheetHtml, questionHtml, feedHtml, resultHtml, helpHtml, mapTitle, paramChips
    };
});
