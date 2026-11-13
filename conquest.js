// Dobývání: hry o mapu pro 2–8 hráčů (lobby, Rychlá hra, vlastní hry s nastavením). Čistá logika bez DOMu a sítě: pravidla (zrcadlo
// serveru, supabase/schema.sql blok „21: Dobývání“), barvy a znaky hráčů, mapa (sousedé, regiony, zobrazení bodů), otázky o území
// z dat témat (přes 40 rodin v šesti oborech: zeměpis, historie, kultura, věda, sport, příroda a mytologie; hlavní město, vlajka,
// soused, najdi na mapě, místa, osobnosti podle oboru, díla, události, vynálezy, plemena psů, mytologie, kluby, olympiády, bitvy,
// čísla…), kronika tažení, přehrání a odměny.
// Vykreslení jako HTML a SVG (mapa na pergamenu, šrafy hráčů, vlaječky se znaky, opevnění, poklady, ozdoby). Ovládání v prohlížeči
// (přiblížení, animace, okna) je v conquest-ui.js. Mapy: data/dobyvani-<mapa>.json (scripts/build-dobyvani.js). Testy: tests/conquest.test.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    // Tvary názvů států („ve Francii“, „z Francie“) a národnosti v popisech má chain.js; v prohlížeči se načítá až za tímto
    // skriptem, proto se vezme až při první otázce (bez něj otázky o osobnostech a dílech nejsou a státy mají „ve státě X“)
    const chain = () => (isNode ? require('./chain.js') : root.MudrlantChain || null);
    const api = factory(isNode ? require('./quiz-core.js') : root.MudrlantCore, chain);
    if (isNode) module.exports = api;
    else root.MudrlantConquest = api;
})(typeof self !== 'undefined' ? self : this, (core, chainModule) => {
    'use strict';

    // --- Obrázky (docs/OBRAZKY.md): do dodání existující obrázky nebo kresby SVG; po dodání stačí doplnit název souboru ---
    const ART = {
        card: 'dobyvani',         // č. 234 sova dobyvatel s helmou a mapou (karta, tip)
        // Stavby na mapě: icons/stavby/<název>.webp + <název>-barva.webp (střechy a vlaječky v barvě hráče, scripts/building-art.py)
        palisade: 'palisada',     // č. 260 opevnění 1 (null = kresba SVG, ICON_SHAPES)
        wall: 'hradba',           // č. 239 opevnění 2
        fortress: 'pevnost',      // č. 261 opevnění 3 (jen domovské území)
        castle: 'hrad-domov',     // č. 262 domovské území (karta tipu bere icons/topics/hrad-domov.webp)
        castle1: 'hrad-domov-1',  // č. 275 domovský hrad s palisádou
        castle2: 'hrad-domov-2',  // č. 276 domovský hrad s hradbami
        castle3: 'hrad-domov-3',  // č. 277 domovský hrad jako pevnost (citadela s korunou)
        treasure: 'poklad',       // č. 263 truhla s pokladem
        compass: 'vetrna-ruzice', // č. 235
        ship: 'plachetnice',      // č. 238
        monster: 'morska-prisera', // č. 237
        cartouche: 'kartuse',     // č. 236 kartuše s názvem mapy v liště hry (větší náhled icons/topics/kartuse-sirka.webp, .cq-cartouche-art)
        // Textury (icons/textury/<název>.webp): pergamen je background-image ve třídě .cq-paper (src/input.css), moře vzor v SVG
        paper: 'textura-pergamen', // č. 232
        sea: 'textura-more',      // č. 233
        watercolor: 'textura-akvarel', // č. 264 šedá akvarelová lazura násobená přes barvu obsazených území
        seal: 'pecet',            // č. 265 prázdná šedá pečeť, sealSvg ji přebarví (scripts/conquest-art.py)
        laurel: 'vavrin',         // č. 266 vavřínový věnec vítěze (stupně vítězů, kartuše konce tažení)
        victory: 'sova-dobyvatel', // č. 267 sova s vlajkou na hradbě (vítězství)
        frame: 'dobyvatel'        // č. 240 rámeček Dobyvatel (icons/frames, look.js ART_FRAMES s badge: 'dobyvatel')
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
    // Jen devět co nejodlišnějších barev (hráčů je nejvýš osm), aby se na mapě nepletly; speciální vzory můžou přibýt jako odměny
    const COLORS = [
        ['cervena', 'Červená', '#d7263d'], ['oranzova', 'Oranžová', '#ec7012'], ['zluta', 'Žlutá', '#f5cc12'], ['zelena', 'Zelená', '#2c9a3c'],
        ['tyrkysova', 'Tyrkysová', '#0fa8b0'], ['modra', 'Modrá', '#2152d0'], ['fialova', 'Fialová', '#8530c4'], ['ruzova', 'Růžová', '#ec4fa3'],
        ['cerna', 'Černá', '#262422']
    ].map(([id, name, hex]) => ({ id, name, hex }));
    // Barvy z dřívější nabídky: vybrat už nejdou, rozehrané hry je ale dál vykreslí
    const LEGACY_COLORS = [
        ['karminova', 'Karmínová', '#9e1b2c'], ['malinova', 'Malinová', '#b0207e'], ['cihlova', 'Cihlová', '#b8512e'], ['jantarova', 'Jantarová', '#d99a0b'],
        ['olivova', 'Olivová', '#7d8a22'], ['limetkova', 'Limetková', '#7cbf2a'], ['lesni', 'Lesní', '#1d6331'], ['smaragdova', 'Smaragdová', '#0aa37a'],
        ['petrolejova', 'Petrolejová', '#0d7280'], ['azurova', 'Azurová', '#2d97e6'], ['namornicka', 'Námořnická', '#1c2a6b'], ['indigova', 'Indigová', '#4b39b8'],
        ['levandulova', 'Levandulová', '#9f84e6'], ['hneda', 'Hnědá', '#7b4f2b'], ['bridlicova', 'Břidlicová', '#4f5a68']
    ].map(([id, name, hex]) => ({ id, name, hex }));
    const COLOR_BY_ID = Object.fromEntries([...COLORS, ...LEGACY_COLORS].map(color => [color.id, color]));
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
    const regionsWord = (count) => plural(count, 'region', 'regiony', 'regionů');
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
    // Území, ve kterém leží bod mapy (x, y), nebo null
    const territoryAtPoint = (data, x, y) => {
        const index = indexMap(data);
        for (const item of data.t) {
            const [x0, y0, x1, y1] = item.b;
            if (x < x0 || x > x1 || y < y0 || y > y1) continue;
            if (pointInRings(x, y, ringsOf(index, item.id))) return item.id;
        }
        return null;
    };
    // Území, ve kterém leží bod (šířka, délka), nebo null
    const territoryAt = (data, lat, lon) => { const [x, y] = project(data, lat, lon); return territoryAtPoint(data, x, y); };
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
        // Otevřené bitvy o území (blok 25; conquest_state a conquest_pulse: sieges). battles = databáze bitvy umí (jinak útok postaru).
        const sieges = new Map((Array.isArray(state.sieges) ? state.sieges : []).filter(siege => siege && siege.status !== 'resolved' && index.byId.has(siege.territory)).map(siege => [siege.territory, siege]));
        return { state, data, index, players, bySeat, byId, me, owners, ownerOf, regionsOf, territoriesOf, scoreOf, mine, targets, ranking, sieges, battles: Array.isArray(state.sieges),
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
        // Obléhané území: majitel ho neopevní, ostatní se jen přidají do bitvy (okno bitvy v sheetHtml)
        if (view.sieges && view.sieges.has(id)) return { attack: false, fortify: false, siege: true, reason: info.owner === view.me.id ? 'Obléhané území teď nejde opevnit.' : '' };
        if (info.owner === view.me.id) {
            const max = maxLevel(info.home);
            if (info.level >= max) return { attack: false, fortify: false, reason: info.home ? 'Domovské území je opevněné naplno (Pevnost).' : 'Území je opevněné naplno (Hradba). Pevnost jde postavit jen na domovském území.' };
            return { attack: false, fortify: left > 0, reason: left > 0 ? '' : 'Tahy na tohle období už nemáš.' };
        }
        if (!view.targets.has(id)) return { attack: false, fortify: false, reason: view.mine.size ? 'Útočit jde jen na území, které sousedí s tvým.' : 'Nemáš žádné území. V dalším období dostaneš nové.' };
        return { attack: left > 0, fortify: false, reason: left > 0 ? '' : 'Tahy na tohle období už nemáš.' };
    };

    // --- Otázky o území (4 možnosti, jedna správná) ---
    // topics = { zemepis, vlajky, architektura, historie, literatura, hudba, umeni, film, sport, fyzika, chemie, biologie, mytologie }
    // (pole položek z data/<téma>.json; chybějící téma znamená jen méně druhů otázek). Každá otázka patří do rodiny (FAMILIES níž)
    // a rodina do oboru (DOMAINS): zeměpis (hlavní město, vlajka nebo znak, soused, mapa, místa podle druhu, řeky, regiony, čísla),
    // historie (panovníci, osobnosti politiky, historické osobnosti, bitvy, události), kultura (literatura, hudba, opery, výtvarné
    // umění, sochy, architekti, film, herectví), věda (fyzika, astronomie, chemie, vynálezy), sport (sportovci, kluby, sportoviště,
    // olympiády) a příroda s mytologií (plemena psů podle původu, postavy mytologií, které k území jednoznačně patří).
    // Pro tah jako by se losoval napřed obor (podle podílu v DOMAINS) a pak rodina v něm (podle vah): obor, který pro území nejde,
    // svůj podíl předá ostatním a žádná rodina nedostane víc než FAMILY_CAP otázek území (zbytek připadne ostatním).
    // Obtížnost roste s úrovní opevnění cíle (0–3): nízko známější položky a nesprávné možnosti z dálky, výš méně známé a z okolí.
    // Známost: na úrovni 0–1 jsou odpověď i nesprávné možnosti známé (k = 1), výš i méně známé, ale nikdy pro znalce (x = 1);
    // rodina mimo zeměpis, která pro území nemá dost známých odpovědí (minKnown), se pro ně neptá vůbec (ani výš). Místa jsou
    // mírnější (lenient u factReady): území bez známé řeky nebo hory dostane nejznámější ze svých.
    // Jednoznačnost: nesprávná možnost vazbu nesplňuje (ani dvojí národností, řekou přes víc států, popisem, který cíl zmiňuje),
    // stejně pojmenované položky se vyřadí a odpověď neprozradí název území, jeho hlavní ani krajské město.
    // Náhled z Commons ve standardní šířce (jinou šířku Wikimedia odmítne); fallback = původní soubor, když náhled nejde
    const THUMB = 250;
    const flagUrl = (fl, width = THUMB) => (fl && core && core.commonsPhotoUrl ? core.commonsPhotoUrl(fl[0], fl[1], width) : '');
    const flagFallback = (fl) => (fl && core && core.commonsFileUrl ? core.commonsFileUrl(fl[0], fl[1]) : '');
    const isKraje = (data) => Boolean(MAP_BY_ID[data.id] && MAP_BY_ID[data.id].kraje);
    const chainApi = () => { try { return (chainModule && chainModule()) || null; } catch (error) { return null; } };
    const countryWords = (name) => { const api = chainApi(); return (api && api.COUNTRY_WORDS && api.COUNTRY_WORDS[name]) || null; };
    const nationalitiesIn = (text) => { const api = chainApi(); return api && api.nationalitiesIn ? api.nationalitiesIn(text) : []; };
    // Tvary názvu území v otázce: in „ve Francii“ / „v Jihočeském kraji“, from „z Francie“, of 2. pád „Francie“, adj kmen přídavného
    // jména „francouzsk“ (jen státy z tabulky chain.js), with 7. pád se „s“ („se Středočeským krajem“, „se státem Mali“)
    const ZE = /^[sSzZšŠžŽ][^aáeéěiíoóuúůyý]/;
    const withPhrase = (item) => {
        if (!item.loc) return `se státem ${item.n}`;
        if (item.n === 'Praha') return 's Prahou';
        if (/^Kraj /.test(item.n)) return `s Krajem ${item.n.slice(5)}`;
        const adjective = item.n.split(' ')[0].replace(/ý$/, 'ým');
        return `${ZE.test(adjective) ? 'se' : 's'} ${adjective} krajem`;
    };
    const formsOf = (item) => {
        if (item.loc) { const of = item.gen || item.n; return { in: item.loc, of, from: `${ZE.test(of) ? 'ze' : 'z'} ${of}`, adj: '', with: withPhrase(item) }; }
        const words = countryWords(item.n);
        if (words) return { in: words[1], from: words[0], of: words[0].replace(/^ze? /, ''), adj: words[2] || '', with: withPhrase(item) };
        return { in: `ve státě ${item.n}`, from: `ze státu ${item.n}`, of: `státu ${item.n}`, adj: '', with: withPhrase(item) };
    };
    const inPhrase = (item) => formsOf(item).in;
    const verbHas = (item) => (item.g === 'p' ? 'mají' : 'má');

    // --- Prozrazení odpovědi a zmínky v popisu ---
    const namePlain = (text) => (core && core.normalizeAnswer ? core.normalizeAnswer(text) : String(text).toLowerCase());
    const distinctLabels = (choices) => new Set(choices.map(choice => namePlain(choice.label))).size === choices.length;
    const revealCache = new Map();
    const memo = (key, compute) => { if (!revealCache.has(key)) revealCache.set(key, compute()); return revealCache.get(key); };
    // Jméno v textu i skloněné nebo jako přídavné jméno (core.censorName); rychlé síto: text obsahuje začátek některého slova jména
    const revealsName = (text, name) => Boolean(text && name) && memo(`n\u0001${text}\u0001${name}`, () => {
        const folded = namePlain(text);
        if (!namePlain(name).split(' ').filter(word => word.length >= 3).some(word => folded.includes(word.slice(0, 3)))) return false;
        return Boolean(core && core.censorName) && core.censorName(String(text), String(name)).includes('[***]');
    });
    // Stejný začátek slova (Lucemburk – Lucembursko, Plzeň – Plzeňský kraj): aspoň 5 písmen, kratší slovo celé; nebo slovo
    // názvu uvnitř jiného slova (Antilibanon – Libanon); obecná slova ne
    const GENERIC_WORDS = new Set(['kraj', 'kraje', 'republika', 'demokraticka', 'spojene', 'staty', 'americke', 'kralovstvi', 'severni', 'jizni', 'vychodni', 'zapadni',
        'stredni', 'nova', 'novy', 'nove', 'velka', 'velky', 'rovnikova', 'arabske', 'emiraty', 'ostrovy', 'svaty', 'svata', 'ceske', 'cesky', 'ceska', 'horni', 'dolni',
        'mala', 'maly', 'male', 'stara', 'stary', 'stare']);
    const wordsOf = (text) => namePlain(text).split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !GENERIC_WORDS.has(word));
    const prefixLength = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
    const stemHit = (text, name) => {
        const names = wordsOf(name);
        return names.length > 0 && wordsOf(text).some(a => names.some(b => prefixLength(a, b) >= Math.min(5, a.length, b.length) || (b.length >= 5 && a.includes(b))));
    };
    // Další názvy států v názvech míst, klubů a osobností (původní jazyk, části státu)
    const TERRITORY_ALIASES = {
        Q974: ['Kongo'], Q971: ['Kongo'], Q96: ['México', 'Mexico'], Q30: ['USA', 'Amerika', 'America', 'American'], Q145: ['Británie', 'Britain', 'British', 'Anglie', 'England', 'English', 'Skotsko', 'Scotland', 'Wales', 'Severní Irsko', 'UK'],
        Q183: ['Deutschland', 'Deutsch', 'German', 'Germany'], Q142: ['France', 'French'], Q38: ['Italia', 'Italy', 'Italian'], Q29: ['España', 'Spain', 'Spanish'], Q55: ['Holandsko', 'Holland', 'Netherlands', 'Nederland', 'Dutch'],
        Q36: ['Polska', 'Poland', 'Polish'], Q213: ['Čechy', 'Morava', 'Czech', 'Bohemia', 'Československo'], Q214: ['Slovakia', 'Slovak', 'Československo'], Q40: ['Österreich', 'Austria'], Q28: ['Magyar', 'Hungary', 'Uhry'],
        Q159: ['Russia', 'Rossija'], Q212: ['Ukraine'], Q41: ['Hellas', 'Greece', 'Hellenic'], Q43: ['Türkiye', 'Turkey'], Q17: ['Japan', 'Nippon'], Q148: ['China'], Q668: ['India', 'Bhárat'], Q16: ['Canada'], Q155: ['Brasil', 'Brazil'],
        Q39: ['Swiss', 'Suisse', 'Schweiz', 'Helvetia'], Q31: ['Belgique', 'België'], Q20: ['Norge', 'Norway'], Q34: ['Sverige', 'Sweden', 'Swedish'], Q35: ['Danmark', 'Denmark', 'Danish'], Q33: ['Suomi', 'Finland'],
        Q189: ['Iceland'], Q27: ['Ireland', 'Éire', 'Irish'], Q884: ['Korea'], Q423: ['Korea'], Q865: ['Taiwan'], Q1246: ['Kosova'], Q225: ['Bosna', 'Hercegovina'], Q236: ['Montenegro'], Q221: ['Makedonie', 'Macedonia']
    };
    // Původní názvy hlavních měst (Paris Saint-Germain, Wiener Staatsoper)
    const CAPITAL_FORMS = { 'Paříž': ['Paris'], 'Řím': ['Roma', 'Rome'], 'Vídeň': ['Wien', 'Vienna', 'Wiener'], 'Londýn': ['London'], 'Lisabon': ['Lisboa', 'Lisbon'], 'Kodaň': ['København', 'Copenhagen'],
        'Moskva': ['Moscow'], 'Varšava': ['Warszawa', 'Warsaw'], 'Bělehrad': ['Beograd', 'Belgrade'], 'Záhřeb': ['Zagreb'], 'Athény': ['Athens', 'Athína'], 'Kyjev': ['Kyiv', 'Kiev'],
        'Bukurešť': ['București', 'Bucharest'], 'Budapešť': ['Budapest'], 'Praha': ['Prague', 'Prag'], 'Brusel': ['Bruxelles', 'Brussel', 'Brussels'], 'Peking': ['Beijing'], 'Soul': ['Seoul'],
        'Tokio': ['Tokyo'], 'Ciudad de México': ['Mexico City'], 'Washington, D.C.': ['Washington'], 'Káhira': ['Cairo'], 'Havana': ['La Habana'], 'Bogotá': ['Bogota'] };
    // Názvy, které odpověď prozradí: název území (i jinak), hlavní nebo krajské město, národnost
    const territoryNames = (item) => [item.n, ...(TERRITORY_ALIASES[item.id] || [])];
    const capitalNames = (item, pools) => { const capital = item.loc ? item.seat : pools.capitals.get(item.id); return capital ? [capital, ...(CAPITAL_FORMS[capital] || [])] : []; };
    const hitsAny = (label, names) => names.some(name => revealsName(label, name) || stemHit(label, name));
    const revealsTerritory = (label, item, pools) => memo(`t\u0001${label}\u0001${item.id}`, () =>
        hitsAny(label, territoryNames(item)) || hitsAny(label, capitalNames(item, pools)) || nationalitiesIn(label).includes(item.n));
    // Popis položky zmiňuje území („řeka v Indii a Bangladéši“)
    const mentions = (text, item) => Boolean(text) && memo(`m\u0001${text}\u0001${item.id}`, () =>
        territoryNames(item).some(name => revealsName(text, name)) || nationalitiesIn(text).includes(item.n));
    // Název připomíná jiné území mapy („Britská Kolumbie“, „Makedonie“): u regionů a ostrovů by mátl
    const revealsOther = (label, home, data, pools) => data.t.some(other => !home.includes(other.id) && revealsTerritory(label, other, pools));

    // --- Státy z dat témat: země osobností a děl (f.land), historické státy pro vyloučení z nesprávných možností ---
    const SOVIET = ['Q159', 'Q212', 'Q184', 'Q217', 'Q211', 'Q37', 'Q191', 'Q230', 'Q399', 'Q227', 'Q232', 'Q265', 'Q874', 'Q863', 'Q813'];
    const YUGOSLAV = ['Q403', 'Q224', 'Q215', 'Q225', 'Q236', 'Q221', 'Q1246'];
    const HABSBURG = ['Q40', 'Q28', 'Q213', 'Q214', 'Q215', 'Q224', 'Q225', 'Q36', 'Q212', 'Q218', 'Q38', 'Q403'];
    // Země, která je dnešním státem (část státu, starší název téhož státu)
    // (německé země a italské státy celé uvnitř dnešního Německa a Itálie: Württembersko, Bavorsko, Toskánsko, Florencie…)
    const CLEAN_LANDS = { USA: 'Q30', Anglie: 'Q145', Skotsko: 'Q145', Wales: 'Q145', 'Severní Irsko': 'Q145', 'Království Velké Británie': 'Q145', 'Západní Německo': 'Q183',
        'Německá demokratická republika': 'Q183', 'Italské království': 'Q38', 'Nizozemské království': 'Q55', 'Rumunské království': 'Q218', 'Protektorát Čechy a Morava': 'Q213',
        'Württemberské království': 'Q183', 'Bavorské království': 'Q183', 'Saské království': 'Q183', 'Hesenské velkovévodství': 'Q183', 'Hesensko-Kasselsko': 'Q183', Hamburk: 'Q183',
        'Sasko-výmarsko-eisenašské vévodství': 'Q183', 'Toskánské velkovévodství': 'Q38', 'Florentská republika': 'Q38', Florencie: 'Q38', 'Neapolské království': 'Q38', 'Sicilské království': 'Q38',
        'Spojené provincie nizozemské': 'Q55', 'Gdaňsk': 'Q36', 'starověký Egypt': 'Q79', 'Ptolemaiovský Egypt': 'Q79' };
    // Historický stát → dnešní státy na jeho území (osobnost, dílo nebo olympiáda s ním nesmí být nesprávnou možností žádného z nich);
    // osobnost z historického státu pochází z dnešního státu, jen když ho potvrdí jediná národnost v popisu (Bismarck: Pruské
    // království a „německý politik“ = z Německa), jinak správnou odpovědí není
    const HRE = ['Q183', 'Q40', 'Q213', 'Q39', 'Q31', 'Q55', 'Q32', 'Q38', 'Q142', 'Q36', 'Q215', 'Q224'];
    const HISTORIC_LANDS = {
        'Československo': ['Q213', 'Q214'], 'Sovětský svaz': SOVIET, 'Ruské impérium': [...SOVIET, 'Q33', 'Q36'], 'Ruské carství': SOVIET, 'Ruská sovětská federativní socialistická republika': ['Q159'],
        'Jugoslávie': YUGOSLAV, 'Socialistická federativní republika Jugoslávie': YUGOSLAV, 'Srbsko a Černá Hora': ['Q403', 'Q236', 'Q1246'], 'Rakousko-Uhersko': HABSBURG, 'Rakouské císařství': HABSBURG,
        'Habsburská monarchie': [...HABSBURG, 'Q29', 'Q31', 'Q55'], 'Předlitavsko': ['Q40', 'Q213', 'Q215', 'Q36', 'Q212', 'Q38'], 'Pruské království': ['Q183', 'Q36', 'Q159', 'Q37'],
        'Německé císařství': ['Q183', 'Q36', 'Q142', 'Q35', 'Q159'], 'nacistické Německo': ['Q183', 'Q40', 'Q36', 'Q213'], 'Spojené království Velké Británie a Irska': ['Q145', 'Q27'],
        'Britské impérium': ['Q145'], 'Anglické království': ['Q145'], 'Skotské království': ['Q145'], 'Flandry': ['Q31', 'Q55', 'Q142'], 'Vlámsko': ['Q31'], 'Starověké Řecko': ['Q41'],
        'Starověký Řím': ['Q38'], 'starověký Řím': ['Q38'], 'České království': ['Q213'], 'Francouzské království': ['Q142'], 'Portugalské království': ['Q45'],
        // Dánsko-norské království, Skåne a Island patřily k Dánsku
        'Dánské království': ['Q35', 'Q20', 'Q34', 'Q189'], 'Výmarská republika': ['Q183', 'Q36', 'Q159', 'Q37'], 'Německá říše': ['Q183', 'Q36', 'Q142', 'Q35', 'Q159', 'Q37', 'Q40', 'Q213'],
        'Svatá říše římská': HRE, 'Rýnský spolek': ['Q183', 'Q36'], 'Saské kurfiřtství': ['Q183', 'Q36'], 'Papežský stát': ['Q38', 'Q142'], 'Milánské vévodství': ['Q38', 'Q39'],
        'Benátská republika': ['Q38', 'Q224', 'Q215', 'Q236', 'Q41', 'Q229'], 'Janovská republika': ['Q38', 'Q142'], 'Habsburské Nizozemí': ['Q31', 'Q32', 'Q55', 'Q142'],
        'Polské království': ['Q36', 'Q37', 'Q184', 'Q212'], 'Polsko-litevská unie': ['Q36', 'Q37', 'Q184', 'Q212', 'Q211', 'Q159'], 'Syrakusy': ['Q38', 'Q41'], 'Athény': ['Q41'],
        'Britská Indie': ['Q668', 'Q843', 'Q902', 'Q836'], 'Čínská republika': ['Q148', 'Q865', 'Q711'], Persie: ['Q794', 'Q889', 'Q863', 'Q265', 'Q874'],
        // Čínské dynastie (čínský císař z dynastie Čching = v čele Číny; mongolský chán dynastie Jüan ne)
        'Čching': ['Q148', 'Q711', 'Q865'], 'Jüan': ['Q148', 'Q711'], 'Čchin': ['Q148'], 'Ming': ['Q148'], 'Chan': ['Q148'], 'Tchang': ['Q148'], 'Sung': ['Q148']
    };
    // Města, u kterých „ve státě“ není samozřejmé (zámořská území, zvláštní správní oblasti; jako chain.js)
    const SKIP_CITIES = new Set(['Gibraltar', 'Hongkong', 'Macao', 'Nuuk']);
    // Sporná území (komu patří, záleží na tom, koho se ptáte): ani správnou, ani nesprávnou možností
    const DISPUTED = /Krym|Kuril|Golan|Kašmír|Senkak|Spratl|Paracel|Falkland|Malvín|Abcház|Osetie|Karabach|Podněstř|Západní Sahar|Essequib|Esequib|Aksai|Arunáčal|Gibraltar|Tchaj-wan|Ajún|Dachla|Smara|Sevastopol|Simferopol|Jalta|Kerč/i;
    // Státy, kde „hlavní město“ není jednoznačné (víc hlavních měst, sídlo vlády jinde, sporné; jako chain.js)
    const UNCLEAR_CAPITAL = new Set(['Jihoafrická republika', 'Bolívie', 'Izrael', 'Srí Lanka', 'Pobřeží slonoviny', 'Benin', 'Tanzanie', 'Burundi', 'Malajsie', 'Nizozemsko', 'Svazijsko', 'Rovníková Guinea']);
    // Obecné názvy staveb, které stojí v mnoha městech (Národní divadlo, Stará radnice, Olympijský stadion) a zasvěcení bez místa
    // (Kostel svatého Jakuba, Notre-Dame): nejde poznat, který je myšlen
    const GENERIC_LABEL = /^(?:Národní|Olympijsk\p{L}*|Městsk\p{L}*|Centrální|Hlavní|Královsk\p{L}*|Státní|Velk\p{L}*|Nov\p{L}*|Star\p{L}*|Zimní|Letní|Sportovní|Fotbalov\p{L}*|Biskupsk\p{L}*|Arcibiskupsk\p{L}*|Prezidentsk\p{L}*)(?:\s+[\p{Ll}\d][\p{L}\d-]*)+$/u;
    const DEDICATION = /(?:^|\s)(?:svat\p{L}*|sv\.|Panny Marie|Nejsvětější\p{L}*|Notre[- ]Dame|Santa|San|Saint|Sainte|St\.|Nanebevzetí|Narození|Božího|Matky Boží)(?:\s|$)/u;
    const PLACE_IN_NAME = /\s(?:v|ve|na|u|nad|pod|při)\s/;
    const genericBuilding = (label) => GENERIC_LABEL.test(label) || (DEDICATION.test(label) && !PLACE_IN_NAME.test(label));
    // Dvojí národnost v popisu („kanadsko-srílanský prozaik“, „polsko-česká zpěvačka“): tabulka kmenů ji nemusí poznat celou
    const COMPOUND_NATION = /\p{L}{3,}(?:sko|cko|ko)-\p{L}{3,}/u;
    // Regiony se španělským členem nebo světcem (La Libertad, San Martín, Santa Cruz) mívají jmenovce v sousedních státech
    const COMMON_REGION_NAME = /^(?:San|Santa|Santo|São|La|El|Los|Las)\s/;
    // Olympiády, které se konaly i jinde, než říkají data (jezdecké soutěže LOH 1956 ve Stockholmu)
    const GAMES_ALSO = { 'Letní olympijské hry 1956': ['Q34'] };
    // Druhy z dat témat pro rodiny míst
    const SKIP_BUILDING_TYPES = new Set(['archeologická lokalita', 'starověké město', 'náměstí', 'posvátné místo', 'průplav', 'ulice', 'park', 'zahrada', 'kromlech']);
    const CASTLE_TYPES = /^(?:hrad|zámek|zřícenina hradu|skalní hrad|tvrz|hrádek|zámeček|lovecký zámek|vodní hrad|vodní tvrz)$/;
    const LAKE_TYPES = new Set(['jezero', 'přehradní nádrž', 'rybník']);
    const ISLAND_TYPES = new Set(['ostrov', 'souostroví']);
    const PAINT_TYPES = new Set(['obraz', 'freska', 'triptych', 'oltářní obraz', 'nástěnná malba']);
    const OPERA_TYPES = new Set(['opera', 'opereta']);
    // Vynálezy, které patří i k jinému státu, než mají v datech (Fermiho reaktor: Ital v Chicagu): správnou odpovědí nejsou
    // a nesprávnou ani pro ten stát
    const INVENTION_ALSO = { 'Jaderný reaktor': ['Q30'] };
    // Druhy panovníků, které stát potvrdí samy (faraon = v čele Egypta; perští králové s druhem faraon mají v datech Persii)
    const RULER_TITLES = { faraon: 'Q79', faraonka: 'Q79' };
    const EMPEROR = /(?:^|[^\p{L}])(?:císař\p{L}*|imperátor\p{L}*|car|carevna)(?:[^\p{L}]|$)/iu;
    const TOPIC_IDS = ['zemepis', 'vlajky', 'architektura', 'historie', 'literatura', 'hudba', 'umeni', 'film', 'sport', 'fyzika', 'chemie', 'biologie', 'mytologie'];
    // Osobnost politiky z Historie: státník, nebo osobnost s druhem politik či revolucionář a politikou v popisu (Dante je
    // v datech „politik“, ale popis říká „italský básník“: zůstane mezi historickými osobnostmi)
    const POLITICS = /politi|státní|diplomat|revolucion|prezident|premiér|kancléř|ministr|diktátor/i;
    // Manželky a manželé panovníků („francouzská císařovna“ Marie Luisa z Vídně, „norská královna“ Maud z Londýna): titul není
    // původ (historické osobnosti a politika) ani vláda (u panovníků jen výslovná manželka nebo choť)
    const CONSORT = /manžel|choť|chotí|provdan|vévodkyn|princezn|kněžn|arcivévodkyn|hraběnk|císařovn|carevn|královn/i;
    const SPOUSE = /manžel|choť|chotí/i;
    const isPolitician = (item) => item.c === 'statnik' || (item.c === 'osobnost' && /^(?:politik|revolucionář|diplomat)$/.test(item.ty || '') && POLITICS.test(item.d || ''));
    // Známé osobnosti narozené jinde, než říká jejich národnost v datech (Rilke a Stifter z Čech, Tesla z dnešního Chorvatska,
    // Lagrange z Turína): patří ke dvěma zemím, takže nejsou správnou odpovědí ani nesprávnou možností pro žádnou z nich
    const PERSON_ALSO = { 'Rainer Maria Rilke': ['Q213'], 'Adalbert Stifter': ['Q213'], 'Nikola Tesla': ['Q224'], 'Joseph-Louis Lagrange': ['Q38'] };
    // Osobnosti podle oboru: rodina, téma, kategorie, výběr; confirm = správnou ani nesprávnou možností jen s národností v popisu
    // (u historických osobností bývá v datech země úmrtí nebo exilu: Trockij „z Mexika“)
    const PEOPLE = [
        ['writer', 'literatura', ['spisovatele']], ['musician', 'hudba', ['skladatele', 'hudebnici']], ['band', 'hudba', ['kapely']],
        ['artist', 'umeni', ['umelci', 'fotografove', 'ilustratori']], ['architect', 'architektura', ['architekti']], ['filmmaker', 'film', ['reziseri']], ['actor', 'film', ['herci']],
        ['athlete', 'sport', ['sportovci']], ['ruler', 'historie', ['statnik', 'panovnik']], ['politician', 'historie', ['statnik', 'osobnost'], isPolitician, true],
        ['historic', 'historie', ['osobnost'], (item) => !isPolitician(item), true], ['physicist', 'fyzika', ['fyzici']], ['astronomer', 'fyzika', ['astronomove']], ['chemist', 'chemie', ['chemici']]
    ];
    // Události z Historie: kategorie události a z válek jen to, co se odehrálo na jednom místě (revoluce, povstání, obléhání…)
    const EVENT_WAR_TYPES = new Set(['revoluce', 'povstání', 'obléhání', 'útok', 'letecké bombardování města', 'občanská válka']);
    // Názvy událostí, které nesou i jiné známé události (Krvavá neděle v Petrohradu 1905 i v Derry 1972)
    const EVENT_AMBIGUOUS = new Set(['Krvavá neděle']);
    // Mytologie (Mytologie: f.myk, české pověsti, artušovské legendy) → území, kam jednoznačně patří, a příbuzné kultury
    // (jejich postavy nejsou nesprávnou možností: Jupiter je řeckému Diovi protějškem, artušovské legendy vycházejí z keltských);
    // slovanská, mayská, kanaánská a biblická mytologie k jednomu území nepatří: jen nesprávné možnosti jinde
    const MYTHS = {
        recka: { lands: ['Q41'], name: 'do řecké mytologie', near: ['rimska'] }, rimska: { lands: ['Q38'], name: 'do římské mytologie', near: ['recka'] },
        egyptska: { lands: ['Q79'], name: 'do egyptské mytologie' }, severska: { lands: ['Q20', 'Q34', 'Q35', 'Q189'], name: 'do severské mytologie' },
        keltska: { lands: ['Q27'], name: 'do keltské mytologie', near: ['artus'] }, artus: { lands: ['Q145'], name: 'do artušovských legend', near: ['keltska'] },
        ceske: { lands: ['Q213'], name: 'do českých pověstí', near: ['slovanska'] }, slovanska: { lands: [], near: ['ceske'] },
        indicka: { lands: ['Q668'], name: 'do indické mytologie', near: ['perska'] }, perska: { lands: ['Q794'], name: 'do perské mytologie', near: ['indicka', 'mezopotamska'] },
        cinska: { lands: ['Q148'], name: 'do čínské mytologie', near: ['japonska'] }, japonska: { lands: ['Q17'], name: 'do japonské mytologie', near: ['cinska'] },
        aztecka: { lands: ['Q96'], name: 'do aztécké mytologie', near: ['mayska'] }, mayska: { lands: [], near: ['aztecka'] }, incka: { lands: ['Q419'], name: 'do incké mytologie' },
        mezopotamska: { lands: ['Q796'], name: 'do mezopotámské mytologie', near: ['kanaanska', 'biblicka', 'perska'] },
        kanaanska: { lands: [], near: ['mezopotamska', 'biblicka'] }, biblicka: { lands: [], near: ['mezopotamska', 'kanaanska'] }
    };
    const MYTH_CATEGORIES = new Set(['recka', 'egyptska', 'severska', 'keltska', 'slovanska', 'indicka', 'orient', 'vychod', 'amerika', 'bytosti']);
    const mythCulture = (item) => {
        const f = item.f || {};
        if (f.myk) return MYTHS[f.myk] ? f.myk : null;
        return f.my === 'české pověsti' ? 'ceske' : f.my === 'artušovské legendy' ? 'artus' : null;
    };

    // --- Zásoby otázek pro mapu (z dat témat; pamatují se pro dvojici témata + mapa) ---
    const questionPools = new WeakMap();
    // Města pro „Najdi na mapě“ a hlavní města (u států podle státu položky, u krajů podle polohy)
    const PLACE_CATEGORIES = new Set(['mesto', 'hora', 'jezero', 'ostrov', 'priroda', 'stavba', 'stavby']);
    const placesOf = (data, topics) => poolsOf(data, topics).places;
    const poolsOf = (data, topics) => {
        if (!questionPools.has(topics)) questionPools.set(topics, new WeakMap());
        const cache = questionPools.get(topics);
        if (!cache.has(data)) cache.set(data, buildPools(data, topics));
        return cache.get(data);
    };
    const buildPools = (data, topics) => {
        const kraje = isKraje(data);
        const ids = new Set(data.t.map(item => item.id));
        const list = (topic) => (topics && Array.isArray(topics[topic]) ? topics[topic] : []);
        // Poloha → území; u krajů se bod blíž než asi 2,5 km k hranici jiného kraje nebere (Černošice těsně u Prahy)
        const located = (item) => {
            if (!Number.isFinite(item.la) || !Number.isFinite(item.lo)) return null;
            const [x, y] = project(data, item.la, item.lo);
            const at = territoryAtPoint(data, x, y);
            if (!at || !kraje) return at;
            const r = Math.max(data.w, data.h) * 0.005;
            for (let i = 0; i < 8; i++) {
                const other = territoryAtPoint(data, x + r * Math.cos(i * Math.PI / 4), y + r * Math.sin(i * Math.PI / 4));
                if (other && other !== at) return null;
            }
            return at;
        };
        // Kraj obce podle Vlajek a znaků (f.kraj), stejně pojmenované obce ve dvou krajích = null; jinak podle polohy
        const krajByName = new Map();
        if (kraje) {
            const byName = new Map(data.t.map(item => [item.n, item.id]));
            for (const item of list('vlajky')) {
                const kraj = item.c === 'cesko' && item.n ? byName.get((item.f || {}).kraj) : null;
                if (!kraj) continue;
                const key = namePlain(item.n);
                krajByName.set(key, krajByName.has(key) && krajByName.get(key) !== kraj ? null : kraj);
            }
        }
        const krajOf = (item) => {
            if (!(item.co || []).includes('Q213')) return null;
            const key = namePlain(item.n);
            return item.c === 'mesto' && krajByName.has(key) ? krajByName.get(key) : located(item);
        };
        // Známost: pořadí v kategorii (data jsou seřazená podle známosti), známé (k = 1) před ostatními; 0 = nejznámější, < 1 známé
        const fame = new Map();
        for (const topic of TOPIC_IDS) {
            const counts = new Map();
            const seen = new Map();
            const group = (item) => `${item.c}|${item.k === 1 ? 1 : 0}`;
            list(topic).forEach(item => counts.set(group(item), (counts.get(group(item)) || 0) + 1));
            list(topic).forEach(item => { const i = seen.get(group(item)) || 0; seen.set(group(item), i + 1); fame.set(item, (item.k === 1 ? 0 : 1) + i / counts.get(group(item))); });
        }
        const fameOf = (item) => (fame.has(item) ? fame.get(item) : 1.5);
        // Společná pole položky rodiny: název, známost (fame k řazení, known = k 1, expert = x 1) a téma
        const about = (item, topic) => ({ label: item.n, q: item.q, fame: fameOf(item), known: item.k === 1 && item.x !== 1, expert: item.x === 1, topic });
        // Státy podle názvu (osobnosti a díla mají zemi názvem)
        const stateByName = new Map(Object.entries(CLEAN_LANDS));
        const capitals = new Map();
        const stats = new Map();
        for (const item of list('zemepis')) {
            if (item.c !== 'stat' || !item.q) continue;
            stateByName.set(item.n, item.q);
            const f = item.f || {};
            if (f.cap) capitals.set(item.q, f.cap);
            if (f.pop > 0 && f.area > 0) stats.set(item.q, { pop: f.pop, area: f.area });
        }
        if (kraje) capitals.clear();
        // Dnešní státy (Q z Zeměpisu): ostatní státy v datech míst a událostí jsou historické (Sovětský svaz, Anglické království)
        const modernStates = new Set(list('zemepis').filter(item => item.c === 'stat' && item.q).map(item => item.q));
        const nationQ = (text) => nationalitiesIn(text).map(name => stateByName.get(name)).filter(Boolean);
        const landsOf = (raw) => {
            const names = (Array.isArray(raw) ? raw : String(raw || '').split(/,\s*/)).map(name => String(name).trim()).filter(Boolean);
            const clean = new Set();
            const rel = new Set();
            let bad = !names.length;
            for (const name of names) {
                const q = stateByName.get(name);
                if (q) { clean.add(q); rel.add(q); } else if (HISTORIC_LANDS[name]) HISTORIC_LANDS[name].forEach(other => rel.add(other));
                else bad = true;
            }
            return { clean, rel, bad };
        };
        // Názvy míst a jejich území (stejně pojmenované místo v cíli nesmí být nesprávnou možností: Córdoba ve Španělsku i v Argentině)
        const placeNames = new Map();
        const nameAt = (name, territory) => { const key = namePlain(name); if (!key || !territory) return; if (!placeNames.has(key)) placeNames.set(key, new Set()); placeNames.get(key).add(territory); };
        for (const topic of ['zemepis', 'architektura', 'vlajky']) {
            for (const item of list(topic)) {
                if (!item.n || item.c === 'stat' || item.c === 'vlajka' || item.c === 'znak' || item.c === 'uzemi' || item.c === 'historie' || item.c === 'slohy' || item.c === 'prvky' || item.c === 'architekti') continue;
                if (kraje) nameAt(item.n, item.c === 'cesko' ? krajByName.get(namePlain(item.n)) || located({ ...item, co: ['Q213'] }) : krajOf(item));
                else (item.co || []).forEach(q => nameAt(item.n, q));
            }
        }
        // Obce se stejným názvem ve dvou krajích (Hranice na Moravě a u Aše)
        if (kraje) for (const [key, kraj] of krajByName) if (kraj === null) { if (!placeNames.has(key)) placeNames.set(key, new Set()); placeNames.get(key).add('?'); }
        // Rodiny: položky { label, key, q, fame, home (území mapy, kam patří), ok (pro která je správnou odpovědí), rel (státy nebo kraje,
        // pro které nesmí být nesprávnou možností), text (popis), multi (víc států), clean (název nesmí připomínat jiné území) }
        const families = new Map();
        const add = (id, entry) => {
            if (!entry.label || /[()]/.test(entry.label) || !entry.home.length) return;
            entry.key = namePlain(entry.label);
            if (!entry.key) return;
            if (!families.has(id)) families.set(id, { entries: [], byQ: new Map() });
            const family = families.get(id);
            // Stejná položka z druhého tématu (stavba v Zeměpisu i v Architektuře): jen doplní státy
            if (entry.q && family.byQ.has(entry.q)) { entry.rel.forEach(at => family.byQ.get(entry.q).rel.add(at)); return; }
            if (entry.q) family.byQ.set(entry.q, entry);
            family.entries.push(entry);
        };
        // Místa (Zeměpis a Architektura)
        const geoFamily = (item) => {
            const ty = item.ty || '';
            if (item.c === 'mesto') return 'city';
            if (item.c === 'stavba' || item.c === 'stavby') return SKIP_BUILDING_TYPES.has(ty) ? null : kraje && CASTLE_TYPES.test(ty) ? 'castle' : 'building';
            if (item.c === 'hora') return /ostrov/i.test(item.n) ? null : 'mountain';
            if (item.c === 'jezero') return LAKE_TYPES.has(ty) ? 'lake' : null;
            if (item.c === 'ostrov') return ISLAND_TYPES.has(ty) ? 'island' : null;
            if (item.c === 'priroda') return 'nature';
            if (item.c === 'reka') return !kraje && ty === 'řeka' ? 'river' : null;
            return null;
        };
        const places = { byTerritory: new Map(data.t.map(item => [item.id, []])), capitals };
        for (const topic of ['zemepis', 'architektura']) {
            for (const item of list(topic)) {
                const id = geoFamily(item);
                if (!id || !item.n || DISPUTED.test(item.n) || (id === 'city' && SKIP_CITIES.has(item.n)) || ((id === 'building' || id === 'castle') && genericBuilding(item.n))) continue;
                const co = (item.co || []).filter(Boolean);
                let home;
                if (kraje) { const at = krajOf(item); home = at ? [at] : []; } else home = (id === 'city' || id === 'building') && co.length !== 1 ? [] : co.filter(q => ids.has(q));
                if (!home.length) continue;
                const multi = !kraje && co.length > 1;
                add(id, { ...about(item, topic), home, ok: home, rel: new Set(kraje ? home : [...co, ...nationQ(item.d)]), text: kraje ? '' : item.d || '', multi, sub: item.ty || '', place: true });
                // Najdi na mapě: město v území (u států jen v jednom státě)
                if (PLACE_CATEGORIES.has(item.c) && !multi && !(item.ty && /moře|oceán|záliv|zátoka|průliv/.test(item.ty))) places.byTerritory.get(home[0]).push({ item, topic });
            }
        }
        // Velká města pro „Které z těchto měst má nejvíc obyvatel?“
        const cities = new Map();
        for (const item of list('zemepis')) {
            if (item.c !== 'mesto' || !item.n || !((item.f || {}).pop > 0) || DISPUTED.test(item.n)) continue;
            const co = item.co || [];
            const at = kraje ? krajOf(item) : co.length === 1 && ids.has(co[0]) && !SKIP_CITIES.has(item.n) ? co[0] : null;
            if (!at) continue;
            if (!cities.has(at)) cities.set(at, []);
            cities.get(at).push({ label: item.n, key: namePlain(item.n), pop: item.f.pop, k: item.k });
        }
        for (const [at, found] of cities) {
            const counts = new Map();
            found.forEach(city => counts.set(city.key, (counts.get(city.key) || 0) + 1));
            cities.set(at, found.filter(city => counts.get(city.key) === 1 && !/[()]/.test(city.label)).sort((a, b) => b.pop - a.pop));
        }
        if (!kraje) {
            // Regiony států (Vlajky a znaky: kraje, spolkové země, provincie)
            for (const item of list('vlajky')) {
                if (item.c !== 'regiony' || (item.co || []).length !== 1 || !ids.has(item.co[0]) || !item.n || DISPUTED.test(item.n) || COMMON_REGION_NAME.test(item.n)) continue;
                add('region', { ...about(item, 'vlajky'), home: [item.co[0]], ok: [item.co[0]], rel: new Set(item.co), text: item.d || '', clean: true, place: true });
            }
            // Osobnosti: země původu z dat; popis s jinou národností nebo dvě země = správnou odpovědí není, nesprávnou ani pro jednu z nich
            const people = new Map();
            // Osobnosti podle jména (vynálezce, autor sochy): jméno → Q všech osobností toho jména, Q → přijatá osobnost
            const nameQs = new Map();
            const personByQ = new Map();
            const nameOfQ = new Map([...stateByName].filter(([name]) => !CLEAN_LANDS[name]).map(([name, q]) => [q, name]));
            for (const [id, topic, categories, pickOf, confirm] of PEOPLE) {
                for (const item of list(topic)) {
                    if (!categories.includes(item.c) || !item.n) continue;
                    const nameKey = namePlain(item.n);
                    if (!nameQs.has(nameKey)) nameQs.set(nameKey, new Set());
                    nameQs.get(nameKey).add(item.q);
                    if (pickOf && !pickOf(item)) continue;
                    const f = item.f || {};
                    const text = `${item.ty || ''} ${item.d || ''}`;
                    const land = landsOf(f.land);
                    if (land.bad || COMPOUND_NATION.test(text)) continue;
                    const nations = nationQ(text);
                    // „Československý“ není „český“ (Husák, Dubček): o původu rozhoduje národnost bez něj, nesprávnou možností
                    // osobnost nebude pro žádný ze dvou států
                    const own = nationQ(text.replace(/československ\p{L}*/giu, ''));
                    // Historický stát (Pruské království, Sovětský svaz): dnešní stát podle jediné národnosti v popisu, leží-li na jeho území
                    if (!land.clean.size && own.length === 1 && land.rel.has(own[0])) land.clean.add(own[0]);
                    if (!land.clean.size || (confirm && (!nations.length || CONSORT.test(text))) || (id === 'ruler' && SPOUSE.test(text))) continue;
                    // Kapela vzniklá jinde, než je její země (Kinto Sol: mexická skupina z Wisconsinu)
                    const cityLands = f.city ? [...(placeNames.get(namePlain(f.city)) || [])] : [];
                    const person = { clean: land.clean, rel: new Set([...land.rel, ...nations, ...cityLands, ...(PERSON_ALSO[item.n] || [])]),
                        pure: land.clean.size === 1 && own.every(q => land.clean.has(q)) && (!cityLands.length || cityLands.some(q => land.clean.has(q))) && !PERSON_ALSO[item.n] };
                    people.set(`${topic}:${item.q}`, person);
                    if (!personByQ.has(item.q)) personByQ.set(item.q, person);
                    if (nationalitiesIn(item.n).length) continue;
                    let ok = person.pure;
                    let noWrong = false;
                    if (id === 'ruler') {
                        // V čele státu: druh („britská královna“, „prezident Turecka“) musí stát potvrdit; císaři vládli víc zemím
                        const landName = nameOfQ.get([...land.clean][0]) || '';
                        const words = countryWords(landName);
                        const type = String(item.ty || '').toLocaleLowerCase('cs');
                        if (!((words && type.startsWith(words[2])) || revealsName(item.ty, landName) || RULER_TITLES[type] === [...land.clean][0])) continue;
                        noWrong = EMPEROR.test(`${item.ty || ''} ${item.d || ''}`);
                    }
                    const home = [...land.clean].filter(q => ids.has(q));
                    add(id, { ...about(item, topic), home, ok: ok ? home : [], rel: person.rel, text: item.d || '', noWrong, sub: item.ty || '' });
                }
            }
            // Díla: země autora (dílo jiné země než autor, nebo s popisem jiné národnosti, správnou odpovědí není)
            const work = (id, item, topic, author, raw) => {
                if (!author || !item.n || nationalitiesIn(item.n).length || COMPOUND_NATION.test(item.d || '')) return;
                const land = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length) ? null : landsOf(raw);
                if (land && land.bad) return;
                // Země díla patří i k autorovi (Kafkova Proměna je v datech z Rakouska: Kafka pak není nesprávnou možností pro Rakousko)
                if (land) land.rel.forEach(q => author.rel.add(q));
                const nations = nationQ(item.d || '');
                const own = [...author.clean][0];
                // Země díla souhlasí s autorem: tentýž dnešní stát, nebo historický stát, na jehož území autorův stát leží
                const sameLand = !land || (land.rel.size === 1 && land.clean.has(own)) || (!land.clean.size && land.rel.has(own));
                const pure = author.pure && sameLand && nations.every(q => q === own);
                const home = [...author.clean].filter(q => ids.has(q));
                add(id, { ...about(item, topic), home, ok: pure ? home : [], rel: new Set([...author.rel, ...(land ? land.rel : []), ...nations]), text: item.d || '', sub: item.ty || '' });
            };
            // Osobnost podle jména (undefined = v datech není, null = nejasná: víc osobností toho jména, nebo bez jasné země)
            const personNamed = (name) => { const qs = nameQs.get(namePlain(name || '')); return !qs ? undefined : qs.size === 1 ? personByQ.get([...qs][0]) || null : null; };
            for (const item of list('literatura')) if (item.c === 'dila') work('book', item, 'literatura', people.get(`literatura:${(item.f || {}).byq}`), (item.f || {}).land);
            // Hudební díla (alba, písně, muzikály) a zvlášť opery s operetami (podle skladatele)
            for (const item of list('hudba')) {
                if (item.c !== 'dila' && item.c !== 'opery') continue;
                const id = item.c === 'opery' && OPERA_TYPES.has(item.ty) ? 'opera' : 'music-work';
                work(id, item, 'hudba', people.get(`hudba:${(item.f || {}).byq}`), (item.f || {}).land);
            }
            // Malíř a sochař podle Q z Umění, jinak z jiného tématu (Michelangelo má zemi jen mezi architekty)
            const artistOf = (q) => people.get(`umeni:${q}`) || personByQ.get(q);
            for (const item of list('umeni')) if (item.c === 'obrazy' && PAINT_TYPES.has(item.ty)) work('painting', item, 'umeni', artistOf((item.f || {}).bq), (item.f || {}).land);
            // Sochy podle sochaře (jediný autor: Q, jinak jméno); pravěké sošky bez autora ne („vytvořil sochař z …“)
            for (const item of list('umeni')) {
                const f = item.f || {};
                if (item.c !== 'sochy' || !f.by || /\sa\s|,/.test(f.by)) continue;
                const author = (f.bq ? artistOf(f.bq) : personNamed(f.by)) || null;
                work('sculpture', item, 'umeni', author, f.land);
            }
            for (const item of list('film')) if (item.c === 'filmy' || item.c === 'animovane') work('film', item, 'film', people.get(`film:${(item.f || {}).dirq}`), (item.f || {}).land || []);
            // Vynálezy (Fyzika): země vynálezu; sporné prvenství (f.xn: vynalezli i jiní) ani dva vynálezci ne; vynálezce mezi
            // osobnostmi musí pocházet z téže země (jinak vynález správnou odpovědí není a nesprávnou ani pro jeho zemi)
            for (const item of list('fyzika')) {
                const f = item.f || {};
                if (item.c !== 'vynalezy' || !item.n || (f.xn || []).length || nationalitiesIn(item.n).length || COMPOUND_NATION.test(item.d || '')) continue;
                const land = landsOf(f.land);
                if (land.bad || land.clean.size !== 1) continue;
                const q = [...land.clean][0];
                const inventor = f.by && !/\sa\s|,/.test(f.by) ? personNamed(f.by) : undefined;
                const nations = nationQ(item.d || '');
                const pure = inventor !== null && (!inventor || (inventor.pure && inventor.clean.has(q))) && nations.every(other => other === q) && !INVENTION_ALSO[item.n];
                add('invention', { ...about(item, 'fyzika'), home: [q].filter(at => ids.has(at)), ok: pure ? [q] : [],
                    rel: new Set([...land.rel, ...nations, ...(inventor ? inventor.rel : []), ...(INVENTION_ALSO[item.n] || [])]), text: item.d || '' });
            }
            // Plemena psů (Biologie) podle země původu; název s národností („Německý ovčák“) odpověď prozradí. Kočky ne: známá
            // plemena mají zemi v názvu (perská, britská, ruská, norská…) a ostatních je na otázku málo
            for (const item of list('biologie')) {
                const f = item.f || {};
                if (item.c !== 'plemena' || f.kind !== 'pes' || !item.n || nationalitiesIn(item.n).length || COMPOUND_NATION.test(item.d || '')) continue;
                const land = landsOf(f.land);
                if (land.bad || land.clean.size !== 1) continue;
                const q = [...land.clean][0];
                const nations = nationQ(item.d || '');
                add('dog', { ...about(item, 'biologie'), home: [q].filter(at => ids.has(at)), ok: nations.every(other => other === q) ? [q] : [], rel: new Set([...land.rel, ...nations]), text: item.d || '' });
            }
            // Olympijské hry (pořadatelský stát; historický stát v datech vyloučí i dnešní státy na jeho území)
            for (const item of list('sport')) {
                if (item.c !== 'olympiady' || (item.co || []).length !== 1 || !ids.has(item.co[0])) continue;
                const f = item.f || {};
                const rel = new Set([...item.co, ...(HISTORIC_LANDS[f.land] || []), ...(GAMES_ALSO[item.n] || [])]);
                add('olympics', { ...about(item, 'sport'), home: [item.co[0]], ok: [item.co[0]], rel, text: '' });
            }
        }
        // Sportovní kluby a sportoviště (země z dat, poloha musí ležet v ní), bitvy (stát a poloha souhlasí)
        for (const item of list('sport')) {
            if ((item.c !== 'kluby' && item.c !== 'sportoviste') || !item.n || genericBuilding(item.n)) continue;
            const land = landsOf((item.f || {}).land);
            if (land.bad || land.clean.size !== 1) continue;
            const q = [...land.clean][0];
            const id = item.c === 'kluby' ? 'club' : 'venue';
            if (kraje) {
                const at = q === 'Q213' ? located(item) : null;
                if (at) add(id, { ...about(item, 'sport'), home: [at], ok: [at], rel: new Set([at]), text: '' });
                continue;
            }
            if (!ids.has(q) || (Number.isFinite(item.la) && located(item) !== q)) continue;
            const nations = nationQ(item.d || '');
            const cityLands = (item.f || {}).city ? [...(placeNames.get(namePlain(item.f.city)) || [])] : [];
            add(id, { ...about(item, 'sport'), home: [q], ok: nations.every(other => other === q) ? [q] : [], rel: new Set([...land.rel, ...nations, ...cityLands]), text: item.d || '' });
        }
        for (const item of list('historie')) {
            if (item.c !== 'bitva' || item.ty !== 'bitva' || (item.co || []).length !== 1 || !item.n) continue;
            const at = located(item);
            if (!at || (kraje ? item.co[0] !== 'Q213' : item.co[0] !== at)) continue;
            add('battle', { ...about(item, 'historie'), home: [at], ok: [at], rel: new Set(kraje ? [at] : [...item.co, ...nationQ(item.d || '')]), text: kraje ? '' : item.d || '' });
        }
        // Události (smlouvy, konference, katastrofy, revoluce…): mezi státy v datech jediný dnešní a poloha leží v něm (historické
        // státy jako Sovětský svaz u Černobylu nevadí); celostátní nebo vícestátní události (Pražské jaro, Holokaust) ne
        for (const item of list('historie')) {
            const event = item.c === 'udalosti' || (item.c === 'bitva' && EVENT_WAR_TYPES.has(item.ty || ''));
            if (!event || !item.n || DISPUTED.test(item.n) || EVENT_AMBIGUOUS.has(item.n)) continue;
            const modern = (item.co || []).filter(q => modernStates.has(q));
            if (modern.length !== 1) continue;
            const at = located(item);
            if (!at || (kraje ? modern[0] !== 'Q213' : modern[0] !== at)) continue;
            add('event', { ...about(item, 'historie'), home: [at], ok: [at], rel: new Set(kraje ? [at] : [...modern, ...nationQ(item.d || '')]), text: kraje ? '' : item.d || '' });
        }
        if (kraje) {
            // Kapely podle města vzniku (město v Česku podle Zeměpisu)
            const czechCities = new Map();
            for (const item of list('zemepis')) if (item.c === 'mesto' && (item.co || []).includes('Q213')) czechCities.set(item.n, czechCities.has(item.n) ? null : item);
            for (const item of list('hudba')) {
                const f = item.f || {};
                if (item.c !== 'kapely' || !/^(?:Česko|Československo)$/.test(f.land || '') || !czechCities.get(f.city)) continue;
                const at = krajOf(czechCities.get(f.city));
                if (at) add('band', { ...about(item, 'hudba'), home: [at], ok: [at], rel: new Set([at]), text: '' });
            }
        }
        // Stejně pojmenované položky v rodině (Birmingham v Anglii i v USA) nejsou ani správnou, ani nesprávnou možností;
        // místo, jehož jméno nese i místo v jiném státě nebo kraji (Córdoba, Victoria, Hranice), také ne
        for (const family of families.values()) {
            const counts = new Map();
            family.entries.forEach(entry => counts.set(entry.key, (counts.get(entry.key) || 0) + 1));
            family.byTerritory = new Map();
            for (const entry of family.entries) {
                if (counts.get(entry.key) > 1) continue;
                if (entry.place && [...(placeNames.get(entry.key) || [])].some(at => !entry.rel.has(at))) continue;
                for (const at of entry.home) { if (!family.byTerritory.has(at)) family.byTerritory.set(at, []); family.byTerritory.get(at).push(entry); }
            }
            // Kolik má území správných odpovědí známých (k = 1) a použitelných (ne pro znalce): rozhoduje, jestli rodina pro území jde
            family.ready = new Map();
            for (const [at, found] of family.byTerritory) {
                found.sort((a, b) => a.fame - b.fame);
                const own = found.filter(entry => entry.ok.includes(at));
                family.ready.set(at, { known: own.filter(entry => entry.known).length, usable: own.filter(entry => !entry.expert).length });
            }
        }
        return { families, places, capitals, cities, stats, placeNames, myths: mythPools(list('mytologie'), fameOf) };
    };
    // Postavy mytologií podle kultury (nezávisle na mapě), od nejznámější; stejně pojmenované postavy dvou kultur ne
    const mythPools = (list, fameOf) => {
        const counts = new Map();
        list.forEach(item => { if (item.n) counts.set(namePlain(item.n), (counts.get(namePlain(item.n)) || 0) + 1); });
        const byCulture = new Map();
        for (const item of list) {
            const culture = MYTH_CATEGORIES.has(item.c) ? mythCulture(item) : null;
            if (!culture || !item.n || /[()]/.test(item.n) || counts.get(namePlain(item.n)) > 1 || nationalitiesIn(item.n).length) continue;
            if (!byCulture.has(culture)) byCulture.set(culture, []);
            byCulture.get(culture).push({ label: item.n, key: namePlain(item.n), culture, fame: fameOf(item), known: item.k === 1 && item.x !== 1, expert: item.x === 1 });
        }
        for (const found of byCulture.values()) found.sort((a, b) => a.fame - b.fame);
        return byCulture;
    };

    // --- Výběr podle úrovně ---
    // Území podle vzdálenosti od cíle (sousedé napřed), bez cíle
    const nearbyTerritories = (data, id) => {
        const index = indexMap(data);
        const from = index.byId.get(id);
        return data.t.filter(item => item.id !== id)
            .map(item => ({ item, d: Math.hypot(item.a[0] - from.a[0], item.a[1] - from.a[1]) * (index.neighbours.get(id).has(item.id) ? 0.5 : 1) }))
            .sort((a, b) => a.d - b.d).map(entry => entry.item);
    };
    // Odkud brát nesprávné možnosti: na nízké úrovni z dálky (snazší), na vyšší z okolí; near = false: ne od sousedů (hory, řeky
    // a přírodní místa u hranice by mohly ležet i v cíli)
    const wrongTerritories = (data, item, level, rng, near = true) => {
        const neighbours = indexMap(data).neighbours.get(item.id);
        const all = nearbyTerritories(data, item.id).filter(other => near || !neighbours.has(other.id));
        if (level <= 0) return [...shuffle(all.slice(3, 18), rng), ...all.slice(0, 3), ...all.slice(18)];
        if (level === 1) return [...shuffle(all.slice(0, 12), rng), ...all.slice(12)];
        return [...shuffle(all.slice(0, 5), rng), ...all.slice(5)];
    };
    // Správná odpověď podle úrovně ze seznamu seřazeného od nejznámější
    const levelWindow = (found, level) => {
        const n = found.length;
        if (level <= 0) { const known = found.filter(entry => entry.fame < 1); const base = known.length ? known : found; return base.slice(0, Math.max(1, Math.min(12, Math.ceil(base.length * 0.4)))); }
        if (level === 1) return found.slice(0, Math.max(1, Math.min(30, Math.ceil(n * 0.65))));
        return found.slice(Math.min(n - 1, Math.floor(n * (level === 2 ? 0.2 : 0.45))));
    };
    // Pořadí nesprávných možností v území: nízko nejznámější, výš podobně známé jako odpověď
    const wrongScore = (entry, pick, level, rng) => (level <= 0 ? entry.fame + rng() * 0.6 : level === 1 ? entry.fame * 0.5 + rng() : Math.abs(entry.fame - pick.fame) + rng() * (level === 2 ? 0.8 : 0.4));
    const options = (correct, wrong, rng) => {
        if (wrong.length < 3) return null;
        const choices = shuffle([{ ...correct, correct: true }, ...wrong.slice(0, 3).map(choice => ({ ...choice, correct: false }))], rng);
        return distinctLabels(choices) ? choices : null;
    };
    // Známost podle úrovně: na 0–1 jen známé položky (odpověď i nesprávné možnosti), výš i méně známé, nikdy pro znalce
    const usable = (entry, level) => (level <= 1 ? entry.known : !entry.expert);
    // Rodina jde pro území, když má dost známých správných odpovědí (minKnown) a na této úrovni aspoň jednu použitelnou.
    // Místa (lenient: řeky, hory, města…) jdou i bez známé odpovědi: území bez známé řeky dostane nejznámější ze svých
    // (ne pro znalce) a nesprávné možnosti zůstanou na úrovni 0–1 známé, takže jde odpovědět i vyloučením
    const factReady = (ctx, spec) => {
        const family = ctx.pools.families.get(spec.pool || spec.id);
        const count = family && family.ready.get(ctx.item.id);
        if (!count) return false;
        if (spec.lenient) return count.usable > 0;
        return count.known >= (spec.minKnown || 1) && (ctx.level <= 1 ? count.known : count.usable) > 0;
    };
    // Otázka „Která z těchto … (vazba na území)?“ z rodiny položek
    const factQuestion = (spec, ctx) => {
        const { data, item, level, rng, pools } = ctx;
        const family = pools.families.get(spec.pool || spec.id);
        if (!family) return null;
        const neighbours = indexMap(data).neighbours.get(item.id);
        // Název nesmí prozradit cíl (ani připomínat jiné území mapy, u regionů)
        const fine = (entry) => !revealsTerritory(entry.label, item, pools) && !(entry.clean && revealsOther(entry.label, entry.home, data, pools));
        const mine = (family.byTerritory.get(item.id) || []).filter(entry => entry.ok.includes(item.id));
        let own = mine.filter(entry => usable(entry, level));
        if (!own.length && spec.lenient) own = mine.filter(entry => !entry.expert);
        if (!own.length) return null;
        const names = pools.placeNames;
        // Nesprávná možnost: vazbu nesplňuje ani podle popisu, stejně pojmenované místo v cíli není, u přírody ne od sousedů
        const wrongOk = (entry) => usable(entry, level) && !entry.noWrong && !entry.home.includes(item.id) && !entry.rel.has(item.id)
            && (spec.near !== false || (!entry.home.some(at => neighbours.has(at)) && ![...entry.rel].some(at => neighbours.has(at))))
            && !(spec.places && names.has(entry.key) && names.get(entry.key).has(item.id)) && !mentions(entry.text, item) && fine(entry);
        const order = wrongTerritories(data, item, level, rng, spec.near !== false);
        // Odpověď podle úrovně (když okno nevyjde, kterákoli jiná), nejvýš čtyři pokusy
        const picks = [...new Set([...shuffle(levelWindow(own, level), rng), ...shuffle(own, rng)])];
        let tries = 0;
        for (const pick of picks.slice(0, 16)) {
            if (tries >= 4) break;
            if (!fine(pick)) continue;
            tries += 1;
            const used = new Set([pick.key]);
            const wrong = [];
            // Z každého území jedna nesprávná možnost; když území s položkami rodiny nestačí (herci jen z USA, Kanady
            // a Mexika), ve druhém kole i další ze stejných území
            for (let round = 0; round < 3 && wrong.length < 3; round++) {
                for (const other of order) {
                    const found = family.byTerritory.get(other.id);
                    if (!found) continue;
                    const ranked = found.map(entry => ({ entry, score: wrongScore(entry, pick, level, rng) })).sort((a, b) => a.score - b.score);
                    const hit = ranked.find(({ entry }) => !used.has(entry.key) && wrongOk(entry));
                    if (!hit) continue;
                    used.add(hit.entry.key);
                    wrong.push(hit.entry);
                    if (wrong.length >= 3) break;
                }
            }
            const choices = options({ label: pick.label }, wrong.map(entry => ({ label: entry.label })), rng);
            if (!choices) continue;
            const prompt = spec.prompt(ctx.forms, item, [pick, ...wrong]);
            if (!prompt) return null;
            return { kind: spec.kind, prompt, choices, topic: pick.topic };
        }
        return null;
    };

    // --- Čísla: obyvatelé a rozloha státu, velikost měst ---
    // Zaokrouhlení na 2 platné číslice a čeština: „68 milionů“, „4,4 milionu“, „2 miliony“, „620 tisíc“, „9 300“
    const twoDigits = (value) => { if (!(value > 0)) return 0; const step = 10 ** (Math.floor(Math.log10(value)) - 1); return Math.round(value / step) * step; };
    const decimalText = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace('.', ','));
    const unitWord = (value, [one, few, many, part]) => `${decimalText(value)} ${!Number.isInteger(value) ? part : value === 1 ? one : value >= 2 && value <= 4 ? few : many}`;
    const numberText = (raw) => {
        const value = twoDigits(raw);
        if (value >= 1e9) return unitWord(Math.round(value / 1e8) / 10, ['miliarda', 'miliardy', 'miliard', 'miliardy']);
        if (value >= 1e6) return unitWord(Math.round(value / 1e5) / 10, ['milion', 'miliony', 'milionů', 'milionu']);
        if (value >= 1e4) return unitWord(Math.round(value / 1e2) / 10, ['tisíc', 'tisíce', 'tisíc', 'tisíce']);
        return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    };
    const NUMBER_SPECS = {
        population: { field: 'pop', format: numberText, ask: (item) => `Kolik obyvatel ${verbHas(item)} přibližně ${item.n}?`,
            compare: (item, more) => `Který z těchto států má ${more ? 'víc' : 'méně'} obyvatel než ${item.n}?` },
        area: { field: 'area', format: (value) => `${numberText(value)} km²`, ask: (item) => `Jakou rozlohu ${verbHas(item)} přibližně ${item.n}?`,
            compare: (item, more) => `Který z těchto států má ${more ? 'větší' : 'menší'} rozlohu než ${item.n}?` }
    };
    const numberQuestion = (field, ctx) => {
        const { data, item, level, rng, pools } = ctx;
        const spec = NUMBER_SPECS[field];
        const own = pools.stats.get(item.id);
        if (!own) return null;
        const value = own[spec.field];
        const ladder = () => {
            // Čtyři hodnoty po násobcích (nízko 3×, výš 2×), správná na náhodném místě
            const ratio = [3, 2.5, 2, 2][level];
            const at = Math.floor(rng() * 4);
            const choices = [0, 1, 2, 3].map(i => ({ label: spec.format(value * ratio ** (i - at)), correct: i === at }));
            return distinctLabels(choices) ? { kind: 'number', prompt: spec.ask(item), choices } : null;
        };
        const compare = (more) => {
            // Jeden stát jasně nad cílem, tři jasně pod ním (nebo naopak); nízko velký rozdíl
            const gap = [2, 1.6, 1.35, 1.25][level];
            const order = wrongTerritories(data, item, level, rng, true).filter(other => pools.stats.has(other.id) && !sameNamed(other, item));
            const valueOf = (other) => pools.stats.get(other.id)[spec.field];
            const right = order.find(other => (more ? valueOf(other) >= value * gap : valueOf(other) <= value / gap));
            const wrong = order.filter(other => (more ? valueOf(other) <= value / gap : valueOf(other) >= value * gap)).slice(0, 3);
            if (!right) return null;
            const choices = options({ label: right.n }, wrong.map(other => ({ label: other.n })), rng);
            return choices && { kind: 'number', prompt: spec.compare(item, more), choices };
        };
        const more = rng() < 0.5;
        const variants = rng() < 0.5 ? [ladder, () => compare(more), () => compare(!more)] : [() => compare(more), () => compare(!more), ladder];
        for (const variant of variants) { const question = variant(); if (question) return question; }
        return null;
    };
    const cityQuestion = (ctx) => {
        const { item, level, rng, pools, forms } = ctx;
        const capital = item.loc ? item.seat : pools.capitals.get(item.id);
        const all = (pools.cities.get(item.id) || []).filter(city => (!capital || namePlain(city.label) !== namePlain(capital)) && !revealsTerritory(city.label, item, pools));
        const top = all.slice(0, [8, 12, 18, 30][level]);
        if (top.length < 4) return null;
        // Mezi státy velký rozdíl (počet obyvatel města bez předměstí a s nimi se liší: Marseille – Lyon), u českých obcí menší
        const gap = item.loc ? [1.6, 1.45, 1.3, 1.25][level] : 2;
        const most = rng() < 0.6;
        for (let attempt = 0; attempt < 10; attempt++) {
            const picked = shuffle(top, rng).slice(0, 4).sort((a, b) => b.pop - a.pop);
            if (most ? picked[0].pop < picked[1].pop * gap : picked[2].pop < picked[3].pop * gap) continue;
            const answer = most ? picked[0] : picked[3];
            const choices = options({ label: answer.label }, picked.filter(city => city !== answer).map(city => ({ label: city.label })), rng);
            if (choices) return { kind: 'number', prompt: `Které z těchto měst ${forms.in} má ${most ? 'nejvíc' : 'nejméně'} obyvatel?`, choices };
        }
        return null;
    };

    // --- Hlavní město, vlajka, soused, mapa ---
    const capitalQuestion = ({ data, item, level, rng, pools, forms }) => {
        const capitalOf = (other) => (other.loc ? other.seat : pools.capitals.get(other.id));
        const own = capitalOf(item);
        if (!own || UNCLEAR_CAPITAL.has(item.n)) return null;
        // Hlavní město, které název území prozradí (Lucemburk, Tunis, Plzeň, Ústí nad Labem), nemá smysl
        const first = (text) => namePlain(text).split(' ').find(word => word.length >= 3 && !GENERIC_WORDS.has(word)) || '';
        if (hitsAny(own, territoryNames(item)) || nationalitiesIn(own).includes(item.n) || (item.loc && first(own).slice(0, 3) === first(item.n).slice(0, 3))) return null;
        const wrong = [];
        const seen = new Set([namePlain(own)]);
        for (const other of wrongTerritories(data, item, level, rng)) {
            const name = capitalOf(other);
            if (!name || seen.has(namePlain(name))) continue;
            seen.add(namePlain(name));
            wrong.push({ label: name });
            if (wrong.length >= 3) break;
        }
        const choices = options({ label: own }, wrong, rng);
        return choices && { kind: 'capital', prompt: item.loc ? `Které město je krajským městem ${item.gen}?` : `Které město je hlavním městem ${forms.of}?`, choices };
    };
    const flagQuestion = ({ data, item, level, rng, kraje }) => {
        if (!item.fl) return null;
        const wrong = wrongTerritories(data, item, level, rng).filter(other => other.fl).slice(0, 3);
        const choice = (other) => ({ label: other.n, image: flagUrl(other.fl), fallback: flagFallback(other.fl) });
        const choices = options(choice(item), wrong.map(choice), rng);
        return choices && { kind: 'flag', prompt: kraje ? `Který znak má ${item.n}?` : `Kterou vlajku má ${item.n}?`, choices, images: true };
    };
    // Stát se jménem cíle (Guinea – Guinea-Bissau, Súdán – Jižní Súdán, Niger – Nigérie) by odpověď napověděl
    // (kraje se jménem nepřekrývají, jen slovem „kraj“, které by censorName vzal za shodu)
    const sameNamed = (other, item) => !item.loc && (hitsAny(other.n, territoryNames(item)) || hitsAny(item.n, territoryNames(other)));
    const neighbourQuestion = ({ data, item, level, rng, kraje, forms }) => {
        const index = indexMap(data);
        const near = index.neighbours.get(item.id);
        // Správně soused po souši; námořní spojení mapy (Saúdská Arábie – Írán) jen u ostrovů bez sousedů po souši
        const named = [...near].filter(other => !sameNamed(index.byId.get(other), item));
        const land = named.filter(other => !index.sea.has(item.id < other ? `${item.id}|${other}` : `${other}|${item.id}`));
        const correct = shuffle(land.length ? land : named, rng)[0];
        if (!correct) return null;
        const far = nearbyTerritories(data, item.id).filter(other => !near.has(other.id) && !sameNamed(other, item));
        // Nízko státy z dálky, výš nejbližší (nesousedí, ale leží hned vedle)
        const pool = level <= 0 && far.length >= 7 ? far.slice(4, 14) : far.slice(0, level <= 1 ? 9 : 5);
        const choices = options({ label: index.byId.get(correct).n }, shuffle(pool, rng).map(other => ({ label: other.n })), rng);
        return choices && { kind: 'neighbour', prompt: kraje ? `Který z těchto krajů sousedí ${forms.with}?` : `Který z těchto států sousedí se státem ${item.n} (na této mapě)?`, choices };
    };
    // Najdi na mapě: obrys území a čtyři body (A–D); správný je skutečná poloha města, ostatní jiná místa v území
    const mapQuestion = ({ data, item, level, rng, pools, forms }) => {
        const index = indexMap(data);
        const rings = ringsOf(index, item.id);
        const [x0, y0, x1, y1] = item.b;
        const span = Math.hypot(x1 - x0, y1 - y0);
        const all = (pools.places.byTerritory.get(item.id) || []).filter(entry => Number.isFinite(entry.item.la))
            .map(entry => ({ ...entry, xy: project(data, entry.item.la, entry.item.lo) })).filter(entry => pointInRings(entry.xy[0], entry.xy[1], rings));
        const targets = shuffle(all.filter(entry => entry.item.c === 'mesto' && (level <= 1 ? entry.item.k === 1 : true)), rng);
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
            return { kind: 'map', prompt: `Kde ${forms.in} leží ${pick.item.n}?`, choices, territory: item.id, answerLabel: pick.item.n };
        }
        return null;
    };

    // --- Mytologie: „Která z těchto postav patří do řecké mytologie?“ (nesprávné možnosti z nepříbuzných kultur) ---
    // Kultura jde pro území, má-li aspoň MYTH_MIN_KNOWN známých postav
    const MYTH_MIN_KNOWN = 3;
    const mythCulturesFor = ({ item, pools, level }) => Object.keys(MYTHS).filter(culture => {
        const found = pools.myths.get(culture) || [];
        return MYTHS[culture].name && MYTHS[culture].lands.includes(item.id) && found.filter(entry => entry.known).length >= MYTH_MIN_KNOWN && found.some(entry => usable(entry, level));
    });
    const mythQuestion = (ctx) => {
        const { item, level, rng, pools } = ctx;
        for (const culture of shuffle(mythCulturesFor(ctx), rng)) {
            const related = new Set([culture, ...(MYTHS[culture].near || [])]);
            const own = pools.myths.get(culture).filter(entry => usable(entry, level) && !revealsTerritory(entry.label, item, pools));
            const others = [...pools.myths.keys()].filter(other => !related.has(other));
            for (const pick of shuffle(levelWindow(own, level), rng).slice(0, 4)) {
                // Nesprávné možnosti ze tří různých nepříbuzných kultur (Zeus, Thór, Anubis, Šiva)
                const used = new Set([pick.key]);
                const wrong = [];
                for (const other of shuffle(others, rng)) {
                    const found = pools.myths.get(other).filter(entry => usable(entry, level) && !used.has(entry.key));
                    if (!found.length) continue;
                    const hit = found[Math.floor(rng() * found.length)];
                    used.add(hit.key);
                    wrong.push(hit);
                    if (wrong.length >= 3) break;
                }
                const choices = options({ label: pick.label }, wrong.map(entry => ({ label: entry.label })), rng);
                if (choices) return { kind: 'myth', prompt: `Která z těchto postav patří ${MYTHS[culture].name}?`, choices, topic: 'mytologie' };
            }
        }
        return null;
    };

    // --- Rodiny otázek ---
    // Obory a jejich podíl na otázkách (obor, který pro území nejde, svůj podíl rozdělí mezi ostatní); rodina nejvýš FAMILY_CAP
    const DOMAINS = { geo: 0.3, history: 0.2, culture: 0.25, science: 0.1, sport: 0.1, nature: 0.05 };
    const FAMILY_CAP = 0.12;
    // w = váhy rodiny v oboru podle úrovně 0–3 (snadné rodiny nízko víc, mapa a čísla výš víc); states / kraje = na které mapě
    // rodina je; ready(ctx, spec) = jde pro území (bez ready vždy, jen může otázku nesložit). Fakta: prompt(forms, item, choices),
    // near = false: nesprávné možnosti ne od sousedů, places: hlídat stejný název místa v cíli, minKnown: kolik známých odpovědí
    // území potřebuje, lenient: místa (zeměpis) jdou i bez známé odpovědi (factReady)
    const fact = (id, domain, kind, prompt, extra = {}) => ({ id, domain, kind, w: [1, 1, 1, 1], states: true, kraje: false, minKnown: 1, lenient: domain === 'geo',
        ready: factReady, build: (ctx, spec) => factQuestion(spec, ctx), prompt, ...extra });
    // „Která z těchto osobností astronomie (a kosmonautiky) …“ podle toho, kdo mezi možnostmi je
    const astronomyWord = (found) => {
        const kinds = new Set(found.map(entry => (/^kosmonaut/.test(entry.sub) ? 'kosmonautiky' : 'astronomie')));
        return kinds.size > 1 ? 'astronomie a kosmonautiky' : [...kinds][0];
    };
    const FAMILIES = [
        // Zeměpis
        { id: 'capital', domain: 'geo', w: [1.15, 1, 0.8, 0.5], states: true, kraje: true, build: capitalQuestion },
        { id: 'flag', domain: 'geo', w: [1.15, 1, 0.8, 0.5], states: true, kraje: true, build: flagQuestion },
        { id: 'neighbour', domain: 'geo', w: [1.1, 1, 0.8, 0.6], states: true, kraje: true, build: neighbourQuestion },
        { id: 'map', domain: 'geo', w: [0.7, 1, 1.2, 1.3], states: true, kraje: true, build: mapQuestion },
        fact('city', 'geo', 'place', (f) => `Které z těchto měst leží ${f.in}?`, { kraje: true, places: true }),
        fact('building', 'geo', 'place', (f) => `Která z těchto staveb stojí ${f.in}?`, { kraje: true, places: true }),
        fact('castle', 'geo', 'place', (f) => `Který z těchto hradů a zámků stojí ${f.in}?`, { states: false, kraje: true, places: true }),
        fact('mountain', 'geo', 'place', (f) => `Která z těchto hor leží ${f.in}?`, { kraje: true, near: false, places: true }),
        fact('lake', 'geo', 'place', (f, item, found) => (found.every(entry => entry.sub === 'jezero') ? `Které z těchto jezer leží ${f.in}?` : `Která z těchto vodních ploch leží ${f.in}?`), { kraje: true, near: false, places: true }),
        fact('island', 'geo', 'place', (f) => `Který z těchto ostrovů leží ${f.in}?`, { near: false, places: true, w: [0.8, 1, 1, 1] }),
        fact('nature', 'geo', 'place', (f) => `Které z těchto přírodních míst leží ${f.in}?`, { kraje: true, near: false, places: true }),
        fact('river', 'geo', 'place', (f) => `Která z těchto řek teče ${f.in}?`, { near: false, places: true }),
        fact('region', 'geo', 'place', (f) => `Který z těchto regionů leží ${f.in}?`, { near: false, places: true, w: [0.8, 1, 1.1, 1.1] }),
        { id: 'population', domain: 'geo', w: [0.8, 1, 1.1, 1.1], states: true, kraje: false, build: (ctx) => numberQuestion('population', ctx) },
        { id: 'area', domain: 'geo', w: [0.8, 1, 1.1, 1.1], states: true, kraje: false, build: (ctx) => numberQuestion('area', ctx) },
        { id: 'bigcity', domain: 'geo', w: [0.8, 1, 1.1, 1.1], states: true, kraje: true, build: cityQuestion },
        // Historie
        fact('ruler', 'history', 'person', (f) => `Která z těchto osobností stála v čele ${f.of}?`),
        fact('politician', 'history', 'person', (f) => `Která z těchto osobností politiky pochází ${f.from}?`),
        fact('historic', 'history', 'person', (f) => `Která z těchto osobností pochází ${f.from}?`, { w: [0.7, 0.8, 0.8, 0.8] }),
        fact('battle', 'history', 'history', (f) => `Která z těchto bitev se odehrála ${f.in}?`, { kraje: true, w: [0.8, 1, 1, 1] }),
        // Události v krajích ne: v datech jsou jen čtyři (tři v Praze s Prahou v názvu), na čtyři možnosti nestačí
        fact('event', 'history', 'history', (f) => `Která z těchto událostí se odehrála ${f.in}?`),
        // Kultura
        fact('writer', 'culture', 'person', (f) => `Která z těchto literárních osobností pochází ${f.from}?`),
        fact('book', 'culture', 'work', (f) => `Které z těchto literárních děl pochází ${f.from}?`),
        fact('musician', 'culture', 'person', (f) => `Která z těchto hudebních osobností pochází ${f.from}?`),
        fact('band', 'culture', 'person', (f, item) => (item.loc ? `Která z těchto kapel vznikla ${f.in}?` : `Která z těchto kapel pochází ${f.from}?`), { kraje: true, w: [0.8, 0.8, 0.8, 0.8] }),
        fact('music-work', 'culture', 'work', (f) => `Které z těchto hudebních děl pochází ${f.from}?`, { w: [0.8, 0.8, 0.8, 0.8] }),
        // Opera „z Itálie“ by mohla znamenat i operu, která se v Itálii odehrává (Carmen ve Španělsku): proto podle skladatele
        fact('opera', 'culture', 'work', (f, item, found) => `Kterou z těchto ${found.every(entry => entry.sub === 'opera') ? 'oper' : 'oper a operet'} složil skladatel nebo skladatelka ${f.from}?`, { w: [0.8, 0.8, 0.8, 0.8] }),
        fact('artist', 'culture', 'person', (f) => `Která z těchto osobností výtvarného umění pochází ${f.from}?`),
        // Obraz „z Francie“ by mohl znamenat i obraz v Louvru nebo namalovaný v Paříži cizincem: proto podle malíře (a socha podle sochaře)
        fact('painting', 'culture', 'work', (f) => `Který z těchto obrazů namaloval malíř nebo malířka ${f.from}?`, { w: [0.8, 0.8, 0.8, 0.8] }),
        fact('sculpture', 'culture', 'work', (f) => `Kterou z těchto soch vytvořil sochař nebo sochařka ${f.from}?`, { w: [0.7, 0.7, 0.7, 0.7] }),
        fact('architect', 'culture', 'person', (f) => `Která z těchto osobností architektury pochází ${f.from}?`, { w: [0.6, 0.7, 0.8, 0.8] }),
        fact('filmmaker', 'culture', 'person', (f) => `Která z těchto osobností filmové režie pochází ${f.from}?`, { w: [0.8, 0.8, 0.8, 0.8] }),
        fact('actor', 'culture', 'person', (f) => `Která z těchto hereckých osobností pochází ${f.from}?`),
        fact('film', 'culture', 'work', (f) => `Který z těchto filmů pochází ${f.from}?`),
        // Věda
        fact('physicist', 'science', 'person', (f) => `Která z těchto osobností fyziky pochází ${f.from}?`),
        fact('astronomer', 'science', 'person', (f, item, found) => `Která z těchto osobností ${astronomyWord(found)} pochází ${f.from}?`),
        fact('chemist', 'science', 'person', (f) => `Která z těchto osobností chemie pochází ${f.from}?`),
        fact('invention', 'science', 'work', (f) => `Který z těchto vynálezů pochází ${f.from}?`),
        // Sport
        fact('athlete', 'sport', 'person', (f) => `Která z těchto sportovních osobností pochází ${f.from}?`),
        fact('club', 'sport', 'sport', (f) => `Který z těchto sportovních klubů sídlí ${f.in}?`, { kraje: true }),
        fact('venue', 'sport', 'sport', (f) => `Které z těchto sportovišť se nachází ${f.in}?`, { kraje: true, w: [0.8, 0.9, 1, 1] }),
        fact('olympics', 'sport', 'sport', (f) => `Které z těchto olympijských her se konaly ${f.in}?`),
        // Příroda a mytologie
        fact('dog', 'nature', 'nature', (f) => `Které z těchto plemen psů pochází ${f.from}?`),
        { id: 'myth', domain: 'nature', kind: 'myth', w: [1, 1, 1, 1], states: true, kraje: false, ready: (ctx) => mythCulturesFor(ctx).length > 0, build: mythQuestion }
    ];
    const FAMILY_IDS = FAMILIES.map(family => family.id);
    const FAMILY_DOMAIN = Object.fromEntries(FAMILIES.map(family => [family.id, family.domain]));
    // Rodiny dostupné na mapě (states / kraje) seřazené podle váhy pro úroveň
    const kindsFor = (level, kraje = false) => {
        const lv = Math.max(0, Math.min(3, Math.round(Number(level) || 0)));
        return FAMILIES.filter(family => (kraje ? family.kraje : family.states)).sort((a, b) => b.w[lv] - a.w[lv]).map(family => family.id);
    };
    // Podíly rodin pro území: obor podle DOMAINS (podíly chybějících oborů se rozdělí mezi přítomné), v oboru podle vah úrovně;
    // rodina nad FAMILY_CAP dostane FAMILY_CAP a přebytek se rozdělí mezi ostatní (u území s málo rodinami jen tolik, kolik jde)
    const familyShares = (families, level) => {
        const inDomain = {};
        families.forEach(family => { inDomain[family.domain] = (inDomain[family.domain] || 0) + family.w[level]; });
        const total = Object.keys(inDomain).reduce((sum, domain) => sum + DOMAINS[domain], 0);
        const shares = families.map(family => (DOMAINS[family.domain] / total) * (family.w[level] / inDomain[family.domain]));
        const capped = new Set();
        for (let round = 0; round < families.length; round++) {
            const over = shares.map((share, i) => (!capped.has(i) && share > FAMILY_CAP ? i : -1)).filter(i => i >= 0);
            if (!over.length) break;
            let excess = 0;
            over.forEach(i => { excess += shares[i] - FAMILY_CAP; shares[i] = FAMILY_CAP; capped.add(i); });
            const free = shares.reduce((sum, share, i) => sum + (capped.has(i) ? 0 : share), 0);
            if (!(free > 0)) break;
            shares.forEach((share, i) => { if (!capped.has(i)) shares[i] = share * (free + excess) / free; });
        }
        return shares;
    };
    // Pořadí rodin pro tah: náhodně podle podílů (Efraimidis–Spirakis); rodina, která otázku nesloží, předá tah další v pořadí
    const weightedOrder = (families, shares, rng) => families.map((family, i) => ({ family, key: rng() ** (1 / Math.max(1e-6, shares[i])) })).sort((a, b) => b.key - a.key).map(entry => entry.family);
    const contextOf = (data, item, level, topics, rng) => ({ data, item, level, rng, kraje: isKraje(data), topics, pools: poolsOf(data, topics || {}), forms: formsOf(item) });
    const readyFamilies = (ctx) => FAMILIES.filter(entry => (ctx.kraje ? entry.kraje : entry.states) && (!entry.ready || entry.ready(ctx, entry)));
    // Plán otázek území na úrovni: rodiny, které jdou, a jejich podíly (pro testy a ladění)
    const familyPlan = ({ data, territory, level = 0, topics = {} }) => {
        const item = indexMap(data).byId.get(territory);
        if (!item) return [];
        const ctx = contextOf(data, item, Math.max(0, Math.min(3, Math.round(Number(level) || 0))), topics, () => 0.5);
        const families = readyFamilies(ctx);
        const shares = familyShares(families, ctx.level);
        return families.map((family, i) => ({ id: family.id, domain: family.domain, share: shares[i] }));
    };
    // Otázka pro tah: semínko = hra, území, druh tahu a pořadí tahu (stejná otázka i po zavření aplikace); only = jen tato rodina
    // (testy a ladění)
    // Správná odpověď otázky (pro hlídání opakování): u mapy název místa, jinak popisek správné možnosti
    const answerKey = (question) => namePlain(question.kind === 'map' ? question.answerLabel : ((question.choices || []).find(choice => choice.correct) || {}).label || '');
    // avoid = { answers: [klíče odpovědí, které hráč v této hře už dostal], families: [rodiny posledních otázek, nejnovější na konci] }:
    // stejná odpověď se ve hře nezopakuje a stejná rodina nejde dvakrát po sobě; když jinak otázka nejde, pravidla se postupně uvolní
    const buildQuestion = ({ data, territory, level = 0, topics = {}, seed = '', only = null, avoid = null }) => {
        const item = indexMap(data).byId.get(territory);
        if (!item) return null;
        const lv = Math.max(0, Math.min(3, Math.round(Number(level) || 0)));
        const rng = seededRandom(`dobyvani|${seed}|${territory}|${level}`);
        const ctx = contextOf(data, item, lv, topics, rng);
        const families = readyFamilies(ctx).filter(family => !only || family.id === only);
        const order = weightedOrder(families, familyShares(families, lv), rng);
        const used = new Set(((avoid && avoid.answers) || []).map(namePlain));
        const recent = new Set(((avoid && avoid.families) || []).slice(-2));
        const finish = (question, family) => ({ ...question, family: family.id, domain: family.domain, level, difficulty: Math.min(3, Math.max(1, level + 1)) });
        const passes = avoid ? [{ fresh: true, varied: true }, { fresh: true, varied: false }, { fresh: false, varied: false }] : [{ fresh: false, varied: false }];
        for (const pass of passes) {
            for (const family of order) {
                if (pass.varied && recent.has(family.id) && order.length > recent.size) continue;
                // Rodina staví z náhodného výběru: na novou odpověď má až tři pokusy
                for (let attempt = 0; attempt < (pass.fresh ? 3 : 1); attempt++) {
                    const question = family.build(ctx, family);
                    if (!question) break;
                    if (pass.fresh && used.has(answerKey(question))) continue;
                    return finish(question, family);
                }
            }
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
            // Bitva o území (blok 25): správně, ale pomaleji než vítěz
            else if (move.r === 'outrun') items.push({ icon: 'swords', tone: 'neutral', title: name(t), text: 'Prohraná bitva', actor, victim });
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
    // Stavby: základ a nad ním vrstva střech a vlaječek, kterou filtr cqb-<barva> (buildingTint v defs mapy) vynásobí barvou majitele
    const BUILDINGS = ['palisade', 'wall', 'fortress', 'castle', 'castle1', 'castle2', 'castle3'];
    const buildingUrl = (name, layer = '') => `icons/stavby/${name}${layer}.webp`;
    const iconMarkup = (kind, colorId = null) => {
        if (BUILDINGS.includes(kind) && ART[kind]) {
            const tint = colorId ? `<image class="cq-tint" href="${buildingUrl(ART[kind], '-barva')}" x="0" y="0" width="24" height="24" filter="url(#cqb-${colorOf(colorId).id})"/>` : '';
            return `<image href="${buildingUrl(ART[kind])}" x="0" y="0" width="24" height="24"/>${tint}`;
        }
        if (kind === 'treasure' && ART.treasure) return `<image href="${artUrl(ART.treasure)}" x="0" y="0" width="24" height="24"/>`;
        return ICON_SHAPES[kind] || ICON_SHAPES[kind.replace(/\d$/, '')];
    };
    // Domovský hrad roste s opevněním (palisáda, hradby, pevnost); bez obrázku úrovně zůstane základní hrad s kamínky úrovně
    const levelIcon = (level, home) => {
        if (home) return level && ART[`castle${level}`] ? `castle${level}` : 'castle';
        return ['', 'palisade', 'wall', 'fortress'][level] || '';
    };
    // Filtr barvy majitele pro střechy a vlaječky: šedá vrstva (prostřední jas 0,78) × barva × 1,28 = plná barva, světlá strana
    // střechy světlejší, stinná tmavší. Tmavé barvy (černá) se zesvětlí, jinak by střecha splynula s obrysem.
    const buildingTint = (colorId) => {
        const color = colorOf(colorId);
        let rgb = hexRgb(color.hex).map(value => value / 255);
        if (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 0.2) rgb = rgb.map(value => value + (1 - value) * 0.32);
        const [r, g, b] = rgb.map(value => (value * 1.28).toFixed(3));
        return `<filter id="cqb-${color.id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0"/></filter>`;
    };

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
        // Dlaždice textury ~ třetina šířky mapy (vlnky zůstanou čitelné i bez přiblížení); průsvitná, ať moře prosvítá pergamenem
        const tile = Math.round(Math.max(w, h) / 3);
        if (ART.sea) defs.push(`<pattern id="${prefix}-seatex" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse"><image href="icons/textury/${ART.sea}.webp" width="${tile}" height="${tile}" class="cq-seatex"/></pattern>`);
        players.forEach(player => defs.push(hatchPattern(player.seat, player.flag_color, prefix)));
        [...new Set(players.map(player => colorOf(player.flag_color).id))].forEach(colorId => defs.push(buildingTint(colorId)));
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
        // Území: neutrální jen pergamen; obsazené jako ručně kolorovaná stará mapa: světlá lazura barvou hráče, sytý pruh barvy podél
        // hranice uvnitř území (ořezaný obrysem území), šrafa a inkoustová linka (vše násobením, pergamen prosvítá)
        const washes = [], hatches = [], inks = [];
        for (const item of data.t) {
            const info = view ? view.owners.get(item.id) : null;
            const owner = info && info.owner ? view.byId.get(info.owner) : null;
            if (owner) {
                defs.push(`<clipPath id="${prefix}-in-${item.id}"><path d="${item.d}"/></clipPath>`);
                washes.push(`<path class="cq-wash" data-wash="${item.id}" d="${item.d}" fill="${owner.color.hex}"/><path class="cq-band" data-band="${item.id}" d="${item.d}" stroke="${owner.color.hex}" clip-path="url(#${prefix}-in-${item.id})"/>`);
                hatches.push(`<path data-hatch="${item.id}" d="${item.d}" fill="url(#${prefix}-hatch-${owner.seat})"/>`);
                inks.push(`<path class="cq-ink${owner.me ? ' cq-ink-me' : ''}" data-ink="${item.id}" d="${item.d}" stroke="${inkOf(owner.flag_color)}"/>`);
            }
        }
        // Akvarelová lazura (č. 264): šedá textura řídí, jak silně barva hráče na území drží (maska) – kde se v textuře barva slila
        // (tmavší skvrny), je lazura plná, jinde o čtvrtinu slabší; barva tak zůstane čistá a jen nerovnoměrná jako skutečný akvarel
        let aqua = '';
        if (ART.watercolor && washes.length) {
            const tile = Math.round(Math.max(w, h) / 2.4);
            defs.push(`<pattern id="${prefix}-aqua" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse"><image href="icons/textury/${ART.watercolor}.webp" width="${tile}" height="${tile}"/></pattern>`
                + `<filter id="${prefix}-aqua-f" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-1 0 0 0 1.75 -1 0 0 0 1.75 -1 0 0 0 1.75 0 0 0 1 0"/></filter>`
                + `<mask id="${prefix}-aqua-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#${prefix}-aqua)" filter="url(#${prefix}-aqua-f)"/></mask>`);
            aqua = ` mask="url(#${prefix}-aqua-m)"`;
        }
        parts.push(`<g class="cq-washes" pointer-events="none"${aqua}>${washes.join('')}</g><g pointer-events="none">${hatches.join('')}</g>`);
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
            // Popisky: na mapě nejsou (názvy států by napovídaly), ukáže se jen název území, na které hráč klepne (conquest-ui.js updateDetail)
            const labels = data.t.map(item => {
                const size = Math.max(7, Math.min(30, item.r * 0.5));
                return `<text class="cq-label cq-hide" data-label="${item.id}" data-size="${size.toFixed(1)}" x="${item.a[0]}" y="${(item.a[1] + size * 1.25).toFixed(1)}" font-size="${size.toFixed(1)}">${esc(item.n)}</text>`;
            });
            parts.push(`<g class="cq-labels" pointer-events="none">${labels.join('')}</g>`);
            // Obléhaná území: rudý přerušovaný lem, který obíhá kolem hranice (značka se zkříženými meči je u značek území)
            if (view && view.sieges.size) parts.push(`<g class="cq-sieges" pointer-events="none">${[...view.sieges.keys()].map(id => `<path class="cq-siege-zone" data-siege-zone="${id}" d="${index.byId.get(id).d}"/>`).join('')}</g>`);
            parts.push(`<g class="cq-marks" pointer-events="none">${view ? data.t.map(item => marksFor(item, view)).join('') : ''}</g>`);
            parts.push('<g class="cq-fx" pointer-events="none"></g>');
        }
        const cls = `cq-svg${opts.thumb ? ' cq-thumb-svg' : ''}`;
        return `<svg viewBox="0 0 ${w} ${h}" class="${cls}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.label || `Mapa ${data.title}`)}"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
    };
    // Značky na území: opevnění nebo domovský hrad, poklad, vlaječka majitele (velikost 24 jednotek mapy; aplikace je při přiblížení zmenšuje)
    const MARK = 22;
    const ICON_SCALE = { castle: 1.3, castle1: 1.34, castle2: 1.38, castle3: 1.44, fortress: 1.25, wall: 1.18, palisade: 1.16, treasure: 0.7 };
    const marksFor = (item, view) => {
        const info = view.owners.get(item.id);
        if (!info) return '';
        const owner = info.owner ? view.byId.get(info.owner) : null;
        const [x, y] = item.a;
        let inner = '';
        const icon = levelIcon(info.level, info.home);
        // Hrad a opevnění větší, poklad menší (je to jen bonus, ne stavba); spodní okraj ikon zůstává na stejné čáře
        const iconAt = (k, left) => `translate(${(left * k * MARK).toFixed(2)} ${(-(k - 0.05) * MARK).toFixed(2)}) scale(${(k * MARK / 24).toFixed(3)})`;
        if (icon) inner += `<g class="cq-icon" data-icon="${icon}" transform="${iconAt(ICON_SCALE[icon] || 1, -0.05)}">${iconMarkup(icon, owner ? owner.flag_color : null)}${icon === 'castle' && info.level ? levelPips(info.level) : ''}</g>`;
        if (info.treasure && !owner) inner += `<g class="cq-icon cq-treasure" data-icon="treasure" transform="${iconAt(ICON_SCALE.treasure, -0.5)}">${iconMarkup('treasure')}</g>`;
        if (view.sieges && view.sieges.has(item.id)) inner += siegeBadge(view.sieges.get(item.id), view, icon);
        if (owner) inner += `<g class="cq-pin" data-pin="${item.id}" transform="translate(${icon ? -MARK * 0.55 : -MARK * 0.1} 0)"><path d="M0 2V${-MARK * 1.25}" stroke="#3b2a1a" stroke-width="1.6" stroke-linecap="round"/><circle cx="0" cy="${-MARK * 1.25}" r="1.6" fill="#c9a227"/>`
            + `<g transform="translate(0.8 ${-MARK * 1.22}) scale(${(MARK * 0.75 / 30).toFixed(3)})">${pennantGroup(owner.flag_color, owner.emblem)}</g></g>`;
        return `<g class="cq-mark" data-mark="${item.id}" transform="translate(${x} ${y})"><g class="cq-mark-scale">${inner}</g></g>`;
    };
    // Bitva na území: pečeť se zkříženými meči nad značkou (pulzující kruh) a pod ní praporky účastníků (nejvýš 4)
    const SWORDS = '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5L18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>';
    const siegeBadge = (siege, view, icon) => {
        const flags = siege.participants.slice(0, 4).map((player, i) => {
            const known = view.byId.get(player.id) || player;
            return `<g transform="translate(${(i * 7 - (Math.min(siege.participants.length, 4) - 1) * 3.5 - 4).toFixed(1)} 6.5) scale(0.27)">${pennantGroup(known.flag_color, known.emblem)}</g>`;
        }).join('');
        return `<g class="cq-siege-badge" data-siege="${siege.territory}" transform="translate(${icon ? (MARK * 0.62).toFixed(1) : (MARK * 0.3).toFixed(1)} ${(-MARK * 1.55).toFixed(1)})">`
            + `<circle class="cq-siege-pulse" r="9.5"/><circle class="cq-siege-seal" r="8.5"/>`
            + `<g class="cq-siege-swords" transform="translate(-6.6 -6.6) scale(0.55)">${SWORDS}</g>${flags}</g>`;
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

    // --- Pozvánky přátel (blok 24 ve schema.sql) ---
    // Obrázek hráče: app.js předá avatarHtml (postavička, sova, rámeček, barva); bez něj (testy) emoji v kolečku
    const avatarFn = (avatar) => (typeof avatar === 'function' ? avatar
        : (player, cls) => `<span aria-hidden="true" class="flex shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-slate-700 ${cls}">${esc((player && player.avatar) || '🦊')}</span>`);
    // Několik obrázků přes sebe (vybraní přátelé ve formuláři Založit hru)
    const avatarStack = (players, avatar, cls = 'h-7 w-7 text-sm', max = 2) => `<span class="flex shrink-0 -space-x-2.5">${players.slice(0, max)
        .map(player => `<span class="rounded-full ring-2 ring-white dark:ring-slate-800">${avatarFn(avatar)(player, cls)}</span>`).join('')}</span>`;
    const shortName = (name, max = 12) => { const text = String(name || 'Hráč').trim(); return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`; };
    const inviterName = (invite) => (invite && invite.invited_by && invite.invited_by.display_name) || 'Kamarád';
    const inviteFacts = (invite) => `${mapTitle(invite.map)} · ${durationLabel(invite.hours)} · ${(invite.players || []).length}/${invite.max_players}`;
    // „Petr Svoboda tě zve do hry“, „Pozvánka od Petr Svoboda“: dlouhé jméno se zkrátí, zbytek věty zůstane vidět
    const nameLine = (invite, { before = '', after = '', cls = '' } = {}) => `<span class="flex min-w-0 ${cls}">${before ? `<span class="shrink-0 whitespace-pre">${esc(before)}</span>` : ''}<span class="truncate">${esc(inviterName(invite))}</span>${after ? `<span class="shrink-0 whitespace-pre">${esc(after)}</span>` : ''}</span>`;
    // „Pozvánka od Petr Svoboda“; bez toho, kdo zve (smazaný účet), jen „Pozvánka do hry“ (ne „od Kamarád“)
    const fromLine = (invite, cls) => (invite && invite.invited_by && invite.invited_by.display_name ? nameLine(invite, { before: 'Pozvánka od ', cls })
        : `<span class="truncate ${cls}">Pozvánka do hry</span>`);

    // Karta na záložce Více hráčů: moje rozehraná hra (náhled, zbývá, tahy) nebo pozvánka do lobby; pozvánka od přítele (invites) jako
    // hlavní obsah karty, nebo s rozehranou hrou jako proužek pod ní, vždy s tlačítkem Přidat se (barva a znak, pak do hry)
    const homeCardHtml = ({ games = null, invites = [], maps = {}, now = Date.now(), loading = false, avatar = null }) => {
        const running = (games || []).filter(game => game.status === 'running');
        const waiting = (games || []).filter(game => game.status === 'lobby');
        const first = running[0];
        const invite = (invites || [])[0] || null;
        const moreInvites = (invites || []).length > 1 ? ` · +${invites.length - 1}` : '';
        const draw = avatarFn(avatar);
        const head = `<span class="flex min-w-0 flex-1 flex-col"><span class="text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">Dobývání</span>`;
        if (first) {
            const data = maps[first.map];
            const meSeat = (first.players.find(player => player.me) || {}).seat;
            const seatColors = Object.fromEntries(first.players.map(player => [player.seat, player.flag_color]));
            const budget = first.budget || { left: 0, total: first.actions };
            const more = running.length > 1 ? ` · +${running.length - 1}` : '';
            const row = `<button type="button" data-action="conquest-open" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label="Otevřít Dobývání">
                    <span class="cq-thumb-frame flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, first.owners || {}, seatColors) : art(ART.card, 'h-10 w-10')}</span>
                    ${head}<span class="truncate text-[11.5px] font-bold text-slate-600 dark:text-slate-300">${esc(mapTitle(first.map))} · zbývá ${esc(timeLeft((parseTime(first.ends_at) || now) - now))}${esc(more)}</span>
                    <span class="flex items-center gap-1 text-[11.5px] font-black text-brand-800 dark:text-gold-200" data-conquest-moves>${meSeat !== undefined ? pennantSvg(first.players.find(p => p.me).flag_color, first.players.find(p => p.me).emblem, 'h-3.5 w-4') : ''}Tahy ${budget.left}/${budget.total}</span></span>
                </button>
                <button type="button" data-action="conquest-play" data-game="${esc(first.id)}" class="${GOLD_BUTTON} shrink-0 px-3.5"><i data-lucide="play" class="h-4 w-4"></i> Hrát</button>`;
            if (!invite) return `<div id="conquest-card" class="flex items-center gap-2.5 ${CARD} cq-card-paper p-1.5 pr-2">${row}</div>`;
            return `<div id="conquest-card" class="flex flex-col gap-1.5 ${CARD} cq-card-paper p-1.5 pr-2">
                <div class="flex items-center gap-2.5">${row}</div>
                <div data-cq-card-invite="${esc(invite.id)}" class="flex items-center gap-2 border-t border-amber-900/15 pt-1.5 dark:border-gold-200/15">
                    ${draw(invite.invited_by || {}, 'h-8 w-8 text-base')}
                    <span class="flex min-w-0 flex-1 flex-col leading-tight">${fromLine(invite, 'text-[12px] font-bold text-slate-700 dark:text-slate-200')}<span class="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${esc(mapTitle(invite.map))} · ${esc(durationLabel(invite.hours))}${esc(moreInvites)}</span></span>
                    <button type="button" data-action="conquest-invite" data-game="${esc(invite.id)}" class="${BRAND_BUTTON} min-h-[2.25rem] shrink-0"><i data-lucide="user-plus" class="h-4 w-4"></i> Přidat se</button>
                </div>
            </div>`;
        }
        if (invite) {
            return `<div id="conquest-card" class="flex items-center gap-2.5 ${CARD} cq-card-paper p-1.5 pr-2">
                <button type="button" data-action="conquest-open" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label="Otevřít Dobývání">
                    <span class="relative shrink-0">${art(ART.card, 'h-11 w-11 -my-1')}<span class="absolute -bottom-1.5 -right-1.5 rounded-full ring-2 ring-white dark:ring-slate-800">${draw(invite.invited_by || {}, 'h-6 w-6 text-xs')}</span></span>
                    ${head}${fromLine(invite, 'text-[12px] font-bold text-slate-600 dark:text-slate-300')}
                    <span class="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${esc(mapTitle(invite.map))} · ${esc(durationLabel(invite.hours))}${esc(moreInvites)}</span></span>
                </button>
                <button type="button" data-action="conquest-invite" data-game="${esc(invite.id)}" class="${GOLD_BUTTON} shrink-0"><i data-lucide="user-plus" class="h-4 w-4"></i> Přidat se</button>
            </div>`;
        }
        const text = loading && !games ? 'Načítám hry…' : waiting.length ? (waiting.length === 1 ? 'Tvoje hra čeká na další hráče' : `Tvoje hry čekají na další hráče (${waiting.length})`) : 'Najdi hru nebo založ vlastní';
        return `<div id="conquest-card" class="flex items-center gap-2.5 ${CARD} cq-card-paper p-1.5 pr-2">
            <button type="button" data-action="conquest-open" class="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                ${art(ART.card, 'h-11 w-11 -my-1')}${head}<span class="truncate text-[12px] font-bold text-slate-600 dark:text-slate-300">${esc(text)}</span></span>
            </button>
            <button type="button" data-action="conquest-open" class="${BRAND_BUTTON} shrink-0"><i data-lucide="swords" class="h-4 w-4"></i> Otevřít</button>
        </div>`;
    };

    // Rozcestník Dobývání: záložky Moje hry / Lobby / Založit hru
    const HUB_TABS = [['mine', 'Moje hry', 'flag'], ['lobby', 'Lobby', 'users'], ['create', 'Založit hru', 'plus']];
    // invites = počet čekajících pozvánek (zlatý odznak na záložce Moje hry, kde pozvánky jsou)
    const hubHtml = ({ tab = 'mine', body = '', invites = 0 }) => `
        <div id="conquest-hub" class="flex min-h-full flex-col gap-2.5 p-3 short:gap-2 short:p-2">
            <div class="flex items-center gap-2.5">
                ${art(ART.card, 'h-12 w-12 -my-1 short:h-10 short:w-10')}
                <div class="min-w-0 flex-1"><h1 class="text-[18px] font-black leading-tight text-slate-800 dark:text-slate-100">Dobývání</h1>
                <p class="text-[12px] font-semibold leading-snug text-slate-500 short:hidden dark:text-slate-400">Dobývej území otázkami a opevňuj je. Kdo má na konci nejvíc bodů, vyhrává.</p></div>
                <button type="button" data-cq="help" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Jak se Dobývání hraje"><i data-lucide="info" class="h-5 w-5"></i></button>
            </div>
            <div role="tablist" class="flex shrink-0 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${HUB_TABS.map(([id, label, icon]) => `
                <button type="button" role="tab" data-cq-tab="${id}" aria-selected="${tab === id}" class="flex min-h-[2.5rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-1 text-[12.5px] font-black ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}"><i data-lucide="${icon}" class="h-4 w-4 shrink-0"></i>${label}${id === 'mine' && invites > 0 ? `<span data-cq-invite-count class="-ml-0.5 flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-gold-400 px-1 text-[10.5px] font-black leading-none text-brand-950"><span class="sr-only">Pozvánky: </span>${invites}</span>` : ''}</button>`).join('')}
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
    // Pozvánka od přítele (Moje hry, nahoře): kdo zve, mapa, délka a obsazenost, náhled mapy; Přidat se (barva a znak, pak do hry) a Odmítnout
    const inviteCardHtml = (invite, { maps = {}, avatar = null } = {}) => {
        const data = maps[invite.map];
        const seatColors = Object.fromEntries((invite.players || []).map(player => [player.seat, player.flag_color]));
        return `<li data-cq-invite="${esc(invite.id)}" class="flex flex-col gap-1.5 ${CARD} cq-card-paper p-1.5 ring-2 ring-gold-400/70 dark:ring-gold-500/50">
            <div class="flex items-center gap-2">
                ${avatarFn(avatar)(invite.invited_by || {}, 'h-10 w-10 text-xl')}
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">${nameLine(invite, { after: ' tě zve do hry', cls: 'text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100' })}
                    <span class="flex min-w-0 items-center gap-1 text-[12px] font-bold text-slate-600 dark:text-slate-300"><span class="truncate">${esc(inviteFacts(invite))}</span>${invite.visibility === 'private' ? '<i data-lucide="lock" class="h-3.5 w-3.5 shrink-0 text-slate-400"></i>' : ''}</span></span>
                <span class="cq-thumb-frame flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, {}, seatColors, 'h-10 w-12') : ''}</span>
            </div>
            <div class="grid grid-cols-[1fr_auto] gap-1.5">
                <button type="button" data-cq-accept="${esc(invite.id)}" class="${GOLD_BUTTON}"><i data-lucide="user-plus" class="h-4 w-4"></i> Přidat se</button>
                <button type="button" data-cq-decline="${esc(invite.id)}" class="${LIGHT_BUTTON}"><i data-lucide="x" class="h-4 w-4"></i> Odmítnout</button>
            </div>
        </li>`;
    };
    const invitesHtml = (invites, opts) => (invites && invites.length ? `<section aria-label="Pozvánky" class="flex flex-col gap-1.5">
        <p class="flex items-center gap-1.5 px-1 ${LABEL}"><span class="h-2 w-2 rounded-full bg-gold-500"></span>Pozvánky od přátel</p>
        <ul class="flex flex-col gap-1.5">${invites.map(invite => inviteCardHtml(invite, opts)).join('')}</ul></section>` : '');
    // Moje hry: nahoře pozvánky od přátel, pod nimi moje hry (bez her a bez pozvánek rada, kde hru najít)
    const mineHtml = ({ games, invites = [], maps = {}, now = Date.now(), error = '', avatar = null }) => {
        const top = invitesHtml(invites, { maps, avatar });
        if (games === null) return `${top}${note(error || 'Načítám tvoje hry…', 'sova-ceka')}`;
        if (!games.length) return `${top}${top ? '' : note('Zatím nehraješ žádnou hru. Přidej se k Rychlé hře v Lobby, nebo založ vlastní.', 'sova-dalekohled')}
            <div class="grid grid-cols-2 gap-2"><button type="button" data-cq-tab="lobby" class="${BRAND_BUTTON}"><i data-lucide="users" class="h-4 w-4"></i> Lobby</button><button type="button" data-cq-tab="create" class="${LIGHT_BUTTON}"><i data-lucide="plus" class="h-4 w-4"></i> Založit hru</button></div>${codeRow()}`;
        return `${top}<ul class="flex flex-col gap-1.5">${games.map(game => gameRowHtml(game, { maps, now, mine: true })).join('')}</ul>${codeRow()}`;
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
    // Řádek-tlačítko formuláře (popisek a hodnota); half = polovina šířky vedle Pozvat přátele (bez tužky, popisek se zkrátí)
    const pickRow = (action, icon, label, value, half) => `<button type="button" data-cq="${action}" class="flex min-h-[2.75rem] min-w-0 items-center gap-2 ${CARD} ${half ? 'px-2' : 'px-2.5'} text-left">${icon}<span class="min-w-0 flex-1"><span class="block truncate text-[10px] font-black uppercase leading-3 ${half ? 'tracking-wider' : 'tracking-widest'} text-slate-500 dark:text-slate-400">${esc(label)}</span><span class="block truncate text-[13px] font-bold text-slate-700 dark:text-slate-200">${esc(value)}</span></span>${half ? '' : '<i data-lucide="pencil" class="h-4 w-4 text-brand-700 dark:text-cream"></i>'}</button>`;
    const lookRow = (draft, half) => pickRow('look', pennantSvg(draft.color, draft.emblem, 'h-7 w-9'), 'Barva a znak', `${colorOf(draft.color).name} · ${emblemOf(draft.emblem).name}`, half);
    const inviteRow = (invites, avatar) => pickRow('invite-pick', invites.length ? avatarStack(invites, avatar)
        : '<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200"><i data-lucide="user-plus" class="h-4 w-4"></i></span>',
        invites.length ? `Pozvánky (${invites.length})` : 'Pozvat přátele', invites.length ? invites.map(friend => shortName(friend.display_name)).join(', ') : 'Zatím nikoho', true);
    // invites = vybraní přátelé (pozvou se hned po založení), invitable = databáze pozvánky zná (blok 24); avatar = obrázek hráče z app.js
    const createHtml = ({ draft, maps = {}, busy = false, error = '', invites = [], invitable = false, avatar = null }) => {
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
            ${invitable ? `<div class="grid grid-cols-2 gap-2">${lookRow(draft, true)}${inviteRow(invites, avatar)}</div>` : lookRow(draft, false)}
            <button type="submit" ${busy ? 'disabled' : ''} class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="flag" class="h-5 w-5"></i> ${busy ? 'Zakládám…' : 'Založit hru'}</button>
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </form>`;
    };

    // Vosková pečeť v barvě hráče s vytlačeným znakem (výběr barvy v okně Barva a znak): nepravidelný okraj s kapkami vosku, stín,
    // vtlačený kruh a znak tmavší barvou s jemným světlým okrajem (vypadá vytlačeně). Do dodání obrázku pečeti (č. 265) jen SVG.
    const SEAL_EDGE = (() => {
        const points = [];
        for (let i = 0; i < 48; i++) {
            const angle = i / 48 * Math.PI * 2;
            const r = 20 + 1.3 * Math.sin(angle * 9) + 0.7 * Math.sin(angle * 5 + 1.3) + (i % 11 === 3 ? 1.6 : 0);
            points.push(`${(24 + r * Math.cos(angle)).toFixed(2)} ${(24 + r * Math.sin(angle)).toFixed(2)}`);
        }
        return `M${points.join('L')}Z`;
    })();
    const sealDrawn = (colorId, emblemId, cls = 'h-14 w-14') => {
        const hex = colorOf(colorId).hex;
        const dark = mix(hex, '#000000', 0.38), deep = mix(hex, '#000000', 0.55), light = mix(hex, '#ffffff', 0.38);
        const emblem = emblemOf(emblemId);
        return `<svg viewBox="0 0 48 50" class="${cls}" aria-hidden="true" focusable="false">`
            + `<path d="${SEAL_EDGE}" fill="${deep}" transform="translate(0 2)" opacity="0.55"/>`
            + `<path d="${SEAL_EDGE}" fill="${hex}" stroke="${dark}" stroke-width="1.2" stroke-linejoin="round"/>`
            + `<circle cx="24" cy="24" r="14.2" fill="${mix(hex, '#000000', 0.12)}" stroke="${dark}" stroke-width="1.4"/>`
            + `<circle cx="24" cy="24" r="12.4" fill="none" stroke="${light}" stroke-width="0.7" stroke-opacity="0.55"/>`
            + `<path d="M10.5 17.5A15.5 15.5 0 0 1 20 9.2" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>`
            + `<g transform="translate(14.6 15.2) scale(0.78)">${emblem.draw(light)}</g><g transform="translate(14.6 14.6) scale(0.78)">${emblem.draw(deep)}</g></svg>`;
    };
    // Pečeť z obrázku (č. 265): šedý vosk se přebarví násobením barvou hráče (feColorMatrix, světlejší o pětinu, aby šedý vosk nebyl
    // tmavší než barva) a do vtlačeného kruhu (poloměr asi 0,23 strany) se vytiskne znak. Bez obrázku SVG kresba výš.
    const sealSvg = (colorId, emblemId, cls = 'h-14 w-14') => {
        if (!ART.seal) return sealDrawn(colorId, emblemId, cls);
        const color = colorOf(colorId);
        const hex = color.hex;
        const [r, g, b] = hexRgb(hex).map(value => Math.min(1.4, value / 255 * 1.22).toFixed(3));
        const emblem = emblemOf(emblemId);
        const deep = mix(hex, '#000000', 0.55), light = mix(hex, '#ffffff', 0.45);
        return `<svg viewBox="0 0 48 48" class="${cls}" aria-hidden="true" focusable="false"><defs><filter id="cqt-${color.id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0"/></filter></defs>`
            + `<image href="${artUrl(ART.seal)}" x="0" y="0" width="48" height="48" filter="url(#cqt-${color.id})"/>`
            + `<g transform="translate(15.6 16.2) scale(0.7)">${emblem.draw(light)}</g><g transform="translate(15.6 15.6) scale(0.7)">${emblem.draw(deep)}</g></svg>`;
    };
    // Okno Barva a znak ve stylu map Dobývání: pergamen, náhled praporce s pečetí, přepínač Barva / Znak jako kožené záložky.
    // Barvy jako voskové pečeti 3 × 3 (obsazené jiným hráčem zašedlé a nejdou), znaky jako razítka na pergamenu 6 × 4
    const lookHtml = ({ color, emblem, taken = [], tab = 'color', error = '' }) => `
        <div class="cq-look cq-card-paper flex flex-col gap-2 rounded-2xl p-2.5" data-cq-look>
            <div class="flex items-center justify-center gap-3">${pennantSvg(color, emblem, 'h-12 w-16')}<span class="flex flex-col"><span class="cq-ledger-title text-[16px]">${esc(colorOf(color).name)} · ${esc(emblemOf(emblem).name)}</span><span class="text-[11.5px] font-semibold text-amber-900/75 dark:text-gold-200/80">Takhle tě uvidí ostatní na mapě</span></span></div>
            <div role="tablist" class="cq-look-tabs flex gap-1 rounded-xl p-1">${[['color', 'Barva', 'palette'], ['emblem', 'Znak', 'shield']].map(([id, label, icon]) => `<button type="button" role="tab" aria-selected="${tab === id}" data-cq-look-tab="${id}" class="cq-look-tab flex min-h-[2.5rem] flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-black"><i data-lucide="${icon}" class="h-4 w-4"></i>${label}</button>`).join('')}</div>
            ${tab === 'color' ? `<div role="radiogroup" aria-label="Barva" class="grid grid-cols-3 gap-1">${COLORS.map(item => {
                const off = taken.includes(item.id) && item.id !== color;
                return `<button type="button" role="radio" aria-checked="${item.id === color}" aria-label="${esc(item.name)}${off ? ' (má jiný hráč)' : ''}" data-cq-color="${item.id}" ${off ? 'disabled' : ''} class="cq-seal-pick relative flex h-[4.25rem] items-center justify-center rounded-xl">${sealSvg(item.id, emblem, 'h-14 w-14')}${off ? '<i data-lucide="lock" class="cq-seal-lock absolute bottom-1 right-2 h-4 w-4"></i>' : ''}</button>`;
            }).join('')}</div>`
            : `<div role="radiogroup" aria-label="Znak" class="grid grid-cols-6 gap-1">${EMBLEMS.map(item => `<button type="button" role="radio" aria-checked="${item.id === emblem}" aria-label="${esc(item.name)}" title="${esc(item.name)}" data-cq-emblem="${item.id}" class="cq-stamp flex h-11 items-center justify-center rounded-lg">${item.id === emblem ? sealSvg(color, item.id, 'h-10 w-10') : emblemSvg(item.id, 'currentColor', 'h-6 w-6 text-[#5a3416] dark:text-[#e2cfa4]')}</button>`).join('')}</div>`}
            <button type="button" data-cq="look-done" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="check" class="h-5 w-5"></i> Hotovo</button>
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </div>`;

    // Okno Pozvat přátele ve stylu map Dobývání (pergamen jako okno Barva a znak): seznam přátel s obrázkem a jménem, víc jich jde vybrat
    // (seznam se posouvá uvnitř okna), kdo už hraje nebo pozvánku má, je zašedlý; dole Pozvat (N). friends = přijatí přátelé
    // (null = nenačetli se), loading = načítají se; limit = kolik jich ještě jde pozvat (volná místa bez čekajících pozvánek);
    // create = výběr do formuláře Založit hru (pozvánky odejdou po založení, tlačítko jde i bez výběru: Hotovo)
    const friendsPickerHtml = ({ friends = null, loading = false, selected = [], joined = [], invited = [], limit = 0, avatar = null, busy = false, error = '', create = false }) => {
        const draw = avatarFn(avatar);
        const chosen = new Set(selected);
        const count = chosen.size;
        const any = Boolean(friends && friends.length);
        let list;
        if (loading) list = '<p class="px-1 py-5 text-center text-[13px] font-semibold text-amber-900/75 dark:text-gold-200/80">Načítám přátele…</p>';
        else if (!friends) list = `<div class="flex items-center gap-3 px-1">${art('sova-ceka', 'h-12 w-12')}<p class="min-w-0 text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">Přátele se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.</p></div>`;
        else if (!any) list = `<div data-cq-no-friends class="flex items-center gap-3 px-1">${art('sova-dalekohled', 'h-12 w-12')}<p class="min-w-0 text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">Zatím nemáš přátele. Přidáš je v profilu hráče na záložce Více hráčů.</p></div>`;
        else list = `<ul data-cq-friend-list role="group" aria-label="Přátelé" class="-mx-1 flex max-h-[min(19rem,46dvh)] flex-col gap-1 overflow-y-auto px-1 py-0.5">${friends.map(friend => {
            const status = joined.includes(friend.id) ? 'Už hraje' : invited.includes(friend.id) ? 'Pozváno' : '';
            const on = chosen.has(friend.id) && !status;
            const off = Boolean(status) || (!on && count >= limit);
            return `<li><button type="button" role="checkbox" aria-checked="${on}" data-cq-friend="${esc(friend.id)}" ${off ? 'disabled' : ''} class="cq-friend flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left disabled:opacity-50">
                ${draw(friend, 'h-9 w-9 text-lg')}<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">${esc(friend.display_name || 'Hráč')}</span>
                ${status ? `<span class="shrink-0 text-[11.5px] font-black text-amber-900/75 dark:text-gold-200/75">${status}</span>` : `<span class="cq-check flex h-6 w-6 shrink-0 items-center justify-center rounded-md">${on ? '<i data-lucide="check" class="h-4 w-4"></i>' : ''}</span>`}</button></li>`;
        }).join('')}</ul>`;
        const hint = !any || loading ? '' : limit <= 0 ? 'Volná místa ve hře už čekají na pozvané přátele.'
            : `Volná místa: ${limit}. ${count ? `Vybráno: ${count}.` : create ? 'Pozvánky odejdou, hned jak hru založíš.' : 'Vyber, koho pozveš.'}`;
        const label = count ? `Pozvat (${count})` : create ? 'Hotovo' : 'Pozvat';
        return `<div class="cq-look cq-card-paper flex flex-col gap-2 rounded-2xl p-2.5" data-cq-invite-picker>
            ${hint ? `<p data-cq-invite-hint class="px-1 text-[12px] font-bold leading-snug text-amber-900/85 dark:text-gold-200/85">${esc(hint)}</p>` : ''}
            ${list}
            ${any && !loading ? `<button type="button" data-cq="invite-done" ${busy || (!create && !count) ? 'disabled' : ''} class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="${count ? 'send' : 'check'}" class="h-5 w-5"></i> ${busy ? 'Posílám pozvánky…' : label}</button>` : ''}
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </div>`;
    };

    // Detail otevřené hry (lobby): hráči, Chci hrát, Odejít, kód a pozvánka
    // Lišta vývojáře (vývojářský režim, účet v dev_admins; blok 22 ve schema.sql): v lobby boti do hry, ve hře jejich tahy hned a další období
    const DEV_CHIP = 'rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900 active:scale-95 disabled:opacity-50 dark:bg-amber-900/50 dark:text-amber-100';
    const devBarHtml = ({ kind, free = 0 }) => {
        const buttons = kind === 'lobby'
            ? [['dev-bot', '+1 bot', free >= 1], ['dev-bots-full', `Doplnit boty (${free})`, free >= 2]]
            : [['dev-play', 'Boti odehrají tahy', true], ['dev-period', 'Další období', true]];
        const shown = buttons.filter(([, , show]) => show);
        if (!shown.length) return '';
        return `<div data-cq-dev class="flex shrink-0 flex-wrap items-center gap-1 rounded-xl border-2 border-dashed border-amber-400/70 px-2 py-1">
            <span class="mr-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Vývojář</span>
            ${shown.map(([action, label]) => `<button type="button" data-cq="${action}" class="${DEV_CHIP}">${esc(label)}</button>`).join('')}
        </div>`;
    };
    // Pozvaní přátelé, kteří se ještě nepřidali (game.invited, jen hráčům hry): zašedlé řádky s čárkovaným okrajem „Pozváno“.
    // invitable = databáze pozvánky zná (blok 24): hráč má Pozvat přátele (jen když jsou volná místa), sdílení odkazu je vedle něj.
    const lobbyDetailHtml = ({ game, maps = {}, busy = false, error = '', dev = false, invitable = false, avatar = null }) => {
        const data = maps[game.map];
        const me = (game.players || []).find(player => player.me);
        const draw = avatarFn(avatar);
        const rows = (game.players || []).map(player => `<li class="flex items-center gap-2 rounded-2xl bg-white p-1.5 pr-2.5 shadow-sm dark:bg-slate-800 ${player.me ? 'ring-2 ring-brand-600 dark:ring-brand-400' : ''}">
                ${pennantSvg(player.flag_color, player.emblem, 'h-7 w-9')}<span class="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-800 dark:text-slate-100">${esc(player.display_name || 'Hráč')}${player.me ? ' (ty)' : ''}</span>
                <span class="flex shrink-0 items-center gap-1 text-[11.5px] font-black ${player.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}"><i data-lucide="${player.ready ? 'circle-check' : 'clock'}" class="h-4 w-4"></i>${player.ready ? 'Chce hrát' : 'Čeká'}</span></li>`).join('');
        const invitedRows = (me ? game.invited || [] : []).map(friend => `<li data-cq-invited="${esc(friend.id)}" class="flex items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-0.5 pl-1.5 pr-2 dark:border-slate-600">
                <span class="flex w-9 shrink-0 justify-center opacity-60 grayscale">${draw(friend, 'h-6 w-6 text-xs')}</span><span class="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-500 dark:text-slate-400">${esc(friend.display_name || 'Hráč')}</span>
                <span class="flex shrink-0 items-center gap-1 text-[11.5px] font-black text-slate-500 dark:text-slate-400"><i data-lucide="send" class="h-4 w-4"></i>Pozváno</span></li>`).join('');
        const empty = Math.max(0, game.max_players - (game.players || []).length);
        const canInvite = Boolean(me && invitable && empty > 0);
        // Tlačítka po dvou v řadě (liché poslední přes celou šířku): Pozvat přátele, sdílení odkazu, Barva a znak, Odejít
        const buttons = [
            canInvite ? `<button type="button" data-cq="invite-pick" class="${LIGHT_BUTTON}"><i data-lucide="user-plus" class="h-4 w-4"></i> Pozvat přátele</button>` : '',
            `<button type="button" data-cq="share" class="${LIGHT_BUTTON}"><i data-lucide="share-2" class="h-4 w-4"></i> ${canInvite ? 'Sdílet odkaz' : 'Pozvat'}</button>`,
            me ? `<button type="button" data-cq="look" class="${LIGHT_BUTTON}"><i data-lucide="palette" class="h-4 w-4"></i> Barva a znak</button>` : '',
            me ? `<button type="button" data-cq="leave" class="${DANGER_BUTTON}"><i data-lucide="log-out" class="h-4 w-4"></i> ${busy === 'leave' ? 'Opravdu odejít?' : 'Odejít'}</button>` : ''
        ].filter(Boolean).map((html, i, all) => (all.length % 2 && i === all.length - 1 ? html.replace('class="', 'class="col-span-2 ') : html));
        // Na nízkém displeji (short:) menší mezery a bez odkazu Moje hry (stejná záložka je hned nahoře), ať se vejdou i pozvaní
        return `<div data-cq-lobby-detail="${esc(game.id)}" class="flex flex-col gap-2 short:gap-1.5">
            <div class="flex items-center gap-2 ${CARD} cq-card-paper p-1.5">
                <span class="cq-thumb-frame flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl">${data ? thumbSvg(data, {}, {}, 'h-14 w-16') : ''}</span>
                <span class="flex min-w-0 flex-1 flex-wrap gap-1">${paramChips(game)}</span>
            </div>
            <ul class="flex flex-col gap-1.5">${rows}${invitedRows}${empty ? `<li class="px-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">Volná místa: ${empty}. Hra začne, až bude plná, nebo až budou chtít hrát všichni (aspoň dva).</li>` : ''}</ul>
            ${dev && me ? devBarHtml({ kind: 'lobby', free: empty }) : ''}
            ${me ? `<button type="button" role="switch" aria-checked="${Boolean(me.ready)}" data-cq="ready" ${busy ? 'disabled' : ''} class="${me.ready ? BRAND_BUTTON : GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="${me.ready ? 'square-check-big' : 'square'}" class="h-5 w-5"></i> Chci hrát${me.ready ? ': ano' : ''}</button>` : ''}
            <div class="grid grid-cols-2 gap-2">${buttons.join('')}</div>
            ${game.code ? `<p class="px-1 text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">Kód hry <b class="font-mono text-[14px] tracking-[0.2em] text-slate-800 dark:text-slate-100">${esc(game.code)}</b></p>` : ''}
            <button type="button" data-cq-tab="mine" class="flex min-h-[2.5rem] items-center justify-center gap-1 rounded-xl text-[13px] font-bold text-slate-500 short:hidden dark:text-slate-400"><i data-lucide="chevron-left" class="h-4 w-4"></i> Moje hry</button>
            ${error ? `<p class="text-[13px] font-semibold text-rose-700 dark:text-rose-400" role="status">${esc(error)}</p>` : ''}
        </div>`;
    };

    // Obrazovka hry: lišta (zpět, kartuše s mapou a časem, tahy, kronika), mapa (výška podle tvaru mapy, nastaví conquest-ui.js), pod ní
    // hráči a poslední události; spodní list (území, otázka, výsledek) přes spodek obrazovky
    const gameScreenHtml = (view, { now = Date.now(), dev = false } = {}) => {
        const game = view.state;
        const budget = view.budget;
        const end = parseTime(game.ends_at);
        const status = view.finished ? 'Hra skončila' : end ? `zbývá ${timeLeft(end - now)}` : '';
        return `<div id="conquest-game" data-game="${esc(game.id)}" class="cq-screen relative flex h-full min-h-0 flex-col gap-1.5 overflow-hidden p-2 short:gap-1 short:p-1.5">
            <div class="flex shrink-0 items-center gap-1.5">
                <button type="button" data-cq="hub" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl btn-3d-light bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200" aria-label="Moje hry"><i data-lucide="chevron-left" class="h-5 w-5"></i></button>
                <div class="flex min-w-0 flex-1 justify-center">
                    <div class="${ART.cartouche ? 'cq-cartouche-art aspect-[29/10] h-[3.75rem] max-w-full px-[15%] pt-[3px]' : 'cq-cartouche h-10 w-full rounded-xl px-2'} flex min-w-0 flex-col items-center justify-center text-center">
                        <span class="cq-cartouche-title max-w-full truncate">${esc(mapTitle(game.map))}</span>
                        <span class="max-w-full truncate text-[10.5px] font-bold leading-3 text-amber-900/80" data-cq-clock>${esc(status)}</span>
                    </div>
                </div>
                ${budget ? `<span data-cq-budget class="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white px-2 text-[13px] font-black text-slate-800 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700" title="${esc(budgetTitle(budget))}">${budgetInnerHtml(budget)}</span>` : ''}
                <button type="button" data-cq="feed" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl btn-3d-light bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200" aria-label="Kronika tažení"><i data-lucide="scroll-text" class="h-5 w-5"></i></button>
            </div>
            <div data-cq-wrap class="cq-map-wrap relative min-h-0 w-full shrink overflow-hidden rounded-2xl">
                <div data-cq-map class="cq-paper cq-map absolute inset-0 touch-none select-none">${mapSvg(view.data, view)}</div>
                <div class="cq-vignette pointer-events-none absolute inset-0 rounded-2xl"></div>
                <button type="button" data-cq="zoom-reset" class="absolute right-1.5 top-1.5 hidden h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-slate-700 shadow ring-1 ring-black/10 dark:bg-slate-800/90 dark:text-slate-200" aria-label="Celá mapa"><i data-lucide="expand" class="h-4 w-4"></i></button>
                <div data-cq-banner class="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2"></div>
                <div data-cq-chips class="pointer-events-none absolute bottom-1.5 left-1.5 right-1.5 flex flex-col items-start gap-1">${view.sieges.size ? siegeChipsHtml(view, { now }) : ''}</div>
            </div>
            <div data-cq-panel class="flex min-h-[2.25rem] flex-1 flex-col gap-1.5 overflow-hidden short:gap-1">
                <section data-cq-players class="cq-ledger shrink-0 rounded-2xl px-2 pb-1.5 pt-1 short:pb-1" aria-label="Pořadí">${playersStripHtml(view, { now })}</section>
                <button type="button" data-cq="feed" data-cq-recent class="cq-ledger flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl px-2 pb-1 pt-1 text-left">${recentHtml(view, { now })}</button>
                ${dev && !view.finished ? devBarHtml({ kind: 'game' }) : ''}
            </div>
            <div data-cq-sheet class="absolute inset-x-0 bottom-0 z-20"></div>
        </div>`;
    };
    // Počítadlo tahů v liště hry (3/5); po ztrátě domovského hradu (server: budget.penalty) navíc červené „−1“ s hradem
    const budgetTitle = (budget) => (budget && budget.penalty ? 'Tahy v tomto období (o 1 méně kvůli ztracenému hradu)' : 'Tahy v tomto období');
    const budgetInnerHtml = (budget) => `<i data-lucide="swords" class="h-4 w-4 text-brand-700 dark:text-gold-300"></i><span class="sr-only">Tahy </span>${budget.left}/${budget.total}${budget.penalty
        ? '<span data-cq-penalty class="flex items-center text-[11px] font-black text-rose-700 dark:text-rose-300"><i data-lucide="castle" class="h-3.5 w-3.5"></i><span aria-hidden="true">−1</span><span class="sr-only">, o 1 méně kvůli ztracenému hradu</span></span>' : ''}`;
    // Toast na začátku období (Začal 3. den hry.) a po otevření hry v období, kdy hráč kvůli ztracenému hradu má o tah méně
    const PENALTY_TEXT = 'Kvůli ztracenému hradu máš v tomto období o tah méně.';
    const periodStartText = (state) => {
        const budget = state && state.budget;
        if (!budget) return 'Začalo další období.';
        const number = budget.period + 1;
        const start = state.period === 'hour' ? `Začala ${number}. hodina hry.` : `Začal ${number}. den hry.`;
        return budget.penalty ? `${start} Kvůli ztracenému hradu máš o tah méně.` : start;
    };
    // Začátek dalšího období (nové tahy), pokud ještě do konce hry nějaké přijde
    const nextPeriodAt = (state) => {
        const start = parseTime(state.started_at), end = parseTime(state.ends_at);
        if (start === null || !state.budget) return null;
        const at = start + (state.budget.period + 1) * (state.period === 'hour' ? 3600e3 : 86400e3);
        return end !== null && at >= end ? null : at;
    };
    // Jak dávno se událost stala (kronika)
    const agoLabel = (at, now) => {
        const time = parseTime(at);
        if (time === null) return '';
        const minutes = Math.max(0, Math.floor((now - time) / 60000));
        if (minutes < 1) return 'teď';
        if (minutes < 60) return `před ${minutes} min`;
        if (minutes < 1440) return `před ${Math.floor(minutes / 60)} h`;
        return `před ${Math.floor(minutes / 1440)} d`;
    };
    const periodLine = (view, now) => {
        if (view.finished) return 'Konečné pořadí';
        const next = view.running ? nextPeriodAt(view.state) : null;
        return next ? `Nové tahy za ${timeLeft(next - now)}` : view.running ? 'Poslední období hry' : '';
    };
    // Pořadí pod mapou: místo (medaile pro první tři), praporec, jméno, kolik území a regionů drží, podíl na mapě v barvě hráče a body.
    // Do tří hráčů po řádcích, víc hráčů ve dvou sloupcích (vejde se i osm na nejmenší displej)
    const playersStripHtml = (view, { now = Date.now() } = {}) => {
        const total = view.data.t.length || 1;
        const compact = view.ranking.length > 3;
        const rows = view.ranking.map(player => {
            const count = view.territoriesOf(player.id).length;
            const regions = view.regionsOf(player.id).length;
            const share = Math.round(count / total * 1000) / 10;
            const name = player.me ? 'Ty' : player.display_name || 'Hráč';
            const medal = `<span class="cq-medal cq-medal-${player.place <= 3 ? player.place : 'x'} flex ${compact ? 'h-5 w-5 text-[10.5px]' : 'h-6 w-6 text-[12px]'} shrink-0 items-center justify-center rounded-full font-black" aria-hidden="true">${player.place}</span>`;
            const bar = `<span class="cq-bar mt-0.5 block h-1 overflow-hidden rounded-full" aria-hidden="true"><svg viewBox="0 0 100 1" preserveAspectRatio="none" class="block h-full w-full"><rect width="${count ? Math.max(2, share) : 0}" height="1" fill="${player.color.hex}"/></svg></span>`;
            const label = `${player.place}. ${name}: ${pointsWord(player.score)}, ${territoriesWord(count)}${regions ? `, ${regionsWord(regions)}` : ''}`;
            if (compact) {
                return `<li class="cq-rank-row${player.me ? ' cq-rank-me' : ''} flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5" aria-label="${esc(label)}">${medal}${pennantSvg(player.flag_color, player.emblem, 'h-4 w-5 shrink-0')}
                    <span class="min-w-0 flex-1"><span class="flex items-baseline gap-1"><span class="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800 dark:text-slate-100">${esc(name)}</span><b class="shrink-0 text-[13px] font-black text-slate-900 dark:text-white">${player.score}</b></span>${bar}</span></li>`;
            }
            const detail = `${territoriesWord(count)}${regions ? ` · ${regionsWord(regions)}` : ''}`;
            return `<li class="cq-rank-row${player.me ? ' cq-rank-me' : ''} flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 short:py-0.5" aria-label="${esc(label)}">${medal}${pennantSvg(player.flag_color, player.emblem, 'h-5 w-[1.6rem] shrink-0')}
                <span class="min-w-0 flex-1"><span class="flex items-baseline gap-1.5"><span class="min-w-0 truncate text-[13.5px] font-black text-slate-800 dark:text-slate-100">${esc(name)}</span><span class="shrink-0 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${esc(detail)}</span></span>${bar}</span>
                <span class="flex w-9 shrink-0 flex-col items-end leading-none"><b class="text-[17px] font-black text-slate-900 dark:text-white">${player.score}</b><span class="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">${esc(pointsWord(player.score).replace(/^\d+ /, ''))}</span></span></li>`;
        }).join('');
        return `<div class="flex items-baseline justify-between gap-2"><h2 class="cq-ledger-title">Pořadí</h2><span data-cq-next class="truncate text-[11px] font-bold text-amber-900/75 dark:text-gold-200/80">${esc(periodLine(view, now))}</span></div>
            <ol class="mt-0.5 ${compact ? 'grid grid-cols-2 gap-x-1.5 gap-y-0.5' : 'flex flex-col gap-0.5'}">${rows}</ol>`;
    };
    // Poslední události pod mapou (klepnutí otevře celou kroniku); karta vyplní zbytek obrazovky, kolik se vejde, tolik je vidět
    const recentHtml = (view, { now = Date.now() } = {}) => {
        const items = feedItems(view.state.moves || [], view).slice(0, 8);
        const head = `<span class="flex w-full shrink-0 items-baseline justify-between gap-2"><span class="cq-ledger-title">Kronika tažení</span>${items.length ? '<span class="flex items-center gap-0.5 text-[11px] font-bold text-amber-900/75 dark:text-gold-200/80">Celá kronika<i data-lucide="chevron-right" class="h-3.5 w-3.5"></i></span>' : ''}</span>`;
        if (!items.length) return `${head}<span class="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">Zatím je klid. Každé dobytí, opevnění i odražený útok se zapíše sem.</span>`;
        const rows = items.map(item => `<span class="cq-feed-row flex min-w-0 shrink-0 items-center gap-1.5 py-[3px]">
                <span class="cq-tone cq-tone-${item.tone} flex h-5 w-5 shrink-0 items-center justify-center rounded-full"><i data-lucide="${item.icon}" class="h-3 w-3"></i></span>
                <span class="min-w-0 flex-1 truncate text-[12px] leading-tight text-slate-700 dark:text-slate-200"><b class="font-black text-slate-900 dark:text-white">${esc(item.title)}</b> · ${esc(item.text)}</span>
                ${item.actor ? `<span class="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">${pennantSvg(item.actor.flag_color, item.actor.emblem, 'h-3 w-4')}<span class="max-w-[4.5rem] truncate">${esc(item.actor.me ? 'ty' : item.actor.display_name)}</span></span>` : ''}
                <span class="w-12 shrink-0 text-right text-[10.5px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">${esc(agoLabel(item.at, now))}</span></span>`).join('');
        return `${head}<span class="cq-feed-list flex min-h-0 w-full flex-1 flex-col overflow-hidden">${rows}</span>`;
    };

    // Spodní list území: majitel, opevnění, region, poklad; Zaútočit (s výběrem, odkud) / Opevnit
    // Region území v listu: název a kdo ho drží celý, jinak kolik jeho území je moje (celý region = +1 tah za období a body navíc)
    const regionLine = (view, region, regionOwner) => {
        const me = (view.state.players || []).find(player => player.me);
        const mine = me ? region.t.filter(t => view.ownerOf(t) === me.id).length : 0;
        const status = regionOwner ? (regionOwner.me ? 'celý je tvůj' : `celý drží ${regionOwner.display_name || 'soupeř'}`)
            : mine ? `tvoje ${mine} z ${region.t.length} území` : `${territoriesWord(region.t.length)}`;
        return `Region ${region.n} · ${status}`;
    };
    // --- Bitvy o území (blok 25) ---
    // Odpočet m:ss (zbývající milisekundy); conquest-ui.js ho každou sekundu přepíše u prvků s data-cq-until (místní čas konce v ms)
    const clockText = (ms) => { const total = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
    // Místní čas (ms) ze serverového času: offset = čas serveru − čas zařízení
    const localTime = (value, offset = 0) => { const time = parseTime(value); return time === null ? null : time - offset; };
    const fighterName = (view, player) => { const known = view.byId.get(player.id) || player; return known.me || player.me ? 'ty' : known.display_name || 'Hráč'; };
    const fighterFlag = (view, player, cls = 'h-3.5 w-[1.15rem]') => { const known = view.byId.get(player.id) || player; return pennantSvg(known.flag_color, known.emblem, cls); };
    const seconds = (ms) => `${(Math.max(0, ms) / 1000).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
    const RISK_TEXT = 'Riskantní: všichni dostanou stejnou otázku a 60 s. Území získá nejrychlejší správná odpověď. Kdo odpoví správně, ale pomaleji, nezíská nic a tah ztratí.';
    // Okno bitvy v listu území: kdo bojuje, kolik zbývá na přidání, Přidat se do bitvy (s varováním), nebo proč to nejde
    const siegeBoxHtml = (view, id, siege, { offset = 0, now = Date.now() } = {}) => {
        const info = view.owners.get(id) || {};
        const joinUntil = localTime(siege.join_until, offset);
        const open = joinUntil !== null && joinUntil > now;
        const mineOwner = view.me && info.owner === view.me.id;
        const fighters = siege.participants.map(player => `<span class="flex items-center gap-1">${fighterFlag(view, player)}${esc(fighterName(view, player))}</span>`).join('');
        let action = '';
        if (siege.mine && !siege.answered) action = `<button type="button" data-cq="siege-resume" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="swords" class="h-5 w-5"></i> Vrátit se do bitvy</button>`;
        else if (siege.mine) action = '<p class="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">Odpověď máš odeslanou. Výsledek přijde, až odpoví ostatní.</p>';
        else if (mineOwner) action = '<p class="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">Tvoje území je obléhané. Opevnit ho teď nejde, výsledek uvidíš na mapě.</p>';
        else if (siege.can_join && open) action = `<p class="cq-risk flex gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold leading-snug"><i data-lucide="triangle-alert" class="mt-px h-3.5 w-3.5 shrink-0"></i><span>${esc(RISK_TEXT)}</span></p>`
            + `<button type="button" data-cq="siege-join" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="swords" class="h-5 w-5"></i> Přidat se do bitvy</button>`;
        else {
            const left = view.budget ? view.budget.left : 0;
            const why = !open ? 'Přidat se do bitvy už nejde.' : !view.targets.has(id) ? 'Přidat se může jen ten, komu území sousedí s jeho vlastním.' : left <= 0 ? 'Tahy na tohle období už nemáš.' : 'Přidat se teď nejde.';
            action = `<p class="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">${esc(why)}</p>`;
        }
        return `<div class="cq-siege-box rounded-xl px-2.5 py-2" data-cq-siege-box="${esc(siege.id)}">
            <div class="flex items-center gap-1.5"><i data-lucide="swords" class="h-4 w-4 shrink-0"></i><span class="min-w-0 flex-1 truncate text-[13px] font-black">Probíhá bitva</span>
                ${open && !siege.mine && !mineOwner ? `<span class="shrink-0 text-[12px] font-black tabular-nums">přidat se: <span data-cq-until="${joinUntil}">${clockText(joinUntil - now)}</span></span>` : ''}</div>
            <div class="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px] font-bold">${fighters}</div>
        </div>${action}`;
    };
    const sheetHtml = (view, id, { source = null, offset = 0, now = Date.now() } = {}) => {
        const item = view.index.byId.get(id);
        const info = view.owners.get(id) || { owner: null, level: 0, home: false, treasure: false };
        const owner = info.owner ? view.byId.get(info.owner) : null;
        const region = view.index.regionById.get(item.reg);
        const regionOwner = region && region.t.every(t => view.ownerOf(t) && view.ownerOf(t) === view.ownerOf(region.t[0])) ? view.byId.get(view.ownerOf(region.t[0])) : null;
        const actions = actionsFor(view, id);
        const sources = actions.attack || view.targets.has(id) ? sourcesFor(view, id) : [];
        // Odkud útok vede, na výsledek ani otázku vliv nemá (jen kudy vede šipka na mapě): z nejbližšího vlastního území, bez volby
        const from = source && sources.includes(source) ? source : sources[0];
        const levelName = info.level ? LEVELS[info.level].name : 'Bez opevnění';
        const facts = [
            `<span class="flex items-center gap-1">${owner ? pennantSvg(owner.flag_color, owner.emblem, 'h-4 w-5') : '<i data-lucide="map-pin" class="h-4 w-4"></i>'}${esc(owner ? (owner.me ? 'Tvoje území' : owner.display_name) : 'Neutrální území')}</span>`,
            `<span class="flex items-center gap-1"><i data-lucide="${info.home ? 'castle' : 'shield'}" class="h-4 w-4"></i>${esc(info.home ? `Domov · ${levelName}` : levelName)}</span>`,
            region ? `<span class="flex items-center gap-1" data-cq-region><i data-lucide="map" class="h-4 w-4"></i>${esc(regionLine(view, region, regionOwner))}</span>` : '',
            info.treasure && !owner ? '<span class="flex items-center gap-1 text-amber-700 dark:text-amber-300"><i data-lucide="gem" class="h-4 w-4"></i>Poklad: +1 tah</span>' : ''
        ].filter(Boolean).join('');
        const buttons = actions.fortify
            ? `<button type="button" data-cq="fortify" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="castle" class="h-5 w-5"></i> Opevnit na ${esc(LEVELS[info.level + 1].acc)}</button>`
            : actions.attack ? `<button type="button" data-cq="attack" data-source="${esc(from || '')}" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="swords" class="h-5 w-5"></i> Zaútočit</button>` : '';
        const hint = !buttons && actions.reason ? `<p class="text-[12.5px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${esc(actions.reason)}</p>` : '';
        const harder = actions.attack && info.level ? `<p class="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">Opevněné území: správná odpověď opevnění jen pobourá o jednu úroveň, otázka je těžší.</p>` : '';
        const siege = view.sieges && view.sieges.get(id);
        const battle = siege ? siegeBoxHtml(view, id, siege, { offset, now }) : '';
        // Útok s bitvami: ostatní se můžou přidat, vyhraje nejrychlejší správná odpověď
        const race = actions.attack && view.battles ? '<p class="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">Na odpověď máš 60 s. Kdo s územím sousedí, může se k bitvě přidat; vyhraje nejrychlejší správná odpověď.</p>' : '';
        return `<div class="cq-sheet cq-sheet-in rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="${esc(item.n)}">
            <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><h2 class="truncate text-[17px] font-black leading-tight text-slate-900 dark:text-white">${esc(item.n)}</h2>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-slate-600 dark:text-slate-300">${facts}</div></div>
                <button type="button" data-cq="sheet-close" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Zavřít"><i data-lucide="x" class="h-5 w-5"></i></button></div>
            <div class="mt-2 flex flex-col gap-1.5">${battle}${harder}${race}${buttons}${hint}</div>
        </div>`;
    };

    // Otázka tahu ve spodním listu
    // battle = { deadline (místní ms), now, fighters: [hráč] } ukáže odpočet 60 s a účastníky bitvy; correctIndex = správná možnost od serveru
    // (kdo se do bitvy přidal, ji v otázce nemá); answered = -1: čas vypršel; footer = čekání na ostatní pod otázkou
    // compact = čekání v bitvě: místo možností jen moje odpověď (a správná), aby se pod otázku vešlo, kdo ještě odpovídá
    const questionHtml = (question, { title, item, data, answered = null, correctIndex = null, battle = null, view = null, footer = '', compact = false }) => {
        const flagged = question.choices.findIndex(choice => choice && choice.correct === true);
        const right = correctIndex !== null && correctIndex !== undefined ? correctIndex : flagged >= 0 ? flagged : null;
        const stars = '<span class="flex gap-0.5" aria-label="Obtížnost">' + [1, 2, 3].map(n => `<i data-lucide="star" class="h-3.5 w-3.5 ${n <= question.difficulty ? 'fill-gold-400 text-gold-500' : 'text-slate-300 dark:text-slate-600'}"></i>`).join('') + '</span>';
        let visual = '';
        if (question.kind === 'map') {
            const [x0, y0, x1, y1] = item.b;
            const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
            const r = Math.max(x1 - x0, y1 - y0) * 0.035;
            const dots = question.choices.map((choice, i) => {
                const state = answered === null ? '' : right === null ? (answered === i ? ' cq-dot-picked' : '') : right === i ? ' cq-dot-ok' : answered === i ? ' cq-dot-bad' : '';
                return `<g class="cq-dot${state}"><circle cx="${choice.point[0].toFixed(1)}" cy="${choice.point[1].toFixed(1)}" r="${r.toFixed(1)}"/><text x="${choice.point[0].toFixed(1)}" y="${(choice.point[1] + r * 0.42).toFixed(1)}" font-size="${(r * 1.25).toFixed(1)}" text-anchor="middle">${choice.label}</text></g>`;
            }).join('');
            visual = `<svg viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + pad * 2).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}" class="cq-qmap cq-paper mx-auto h-32 w-full rounded-xl short:h-24" aria-hidden="true"><path d="${item.d}" class="cq-qmap-land"/>${dots}</svg>`;
        }
        const grid = question.images ? 'grid grid-cols-2 gap-1.5' : question.kind === 'map' ? 'grid grid-cols-4 gap-1.5' : 'grid grid-cols-1 gap-1.5';
        const options = question.choices.map((choice, i) => {
            const state = answered === null ? '' : right === null ? (answered === i ? ' cq-choice-picked' : ' opacity-60') : right === i ? ' cq-choice-ok' : answered === i ? ' cq-choice-bad' : ' opacity-60';
            // Náhled z Commons; když nejde, conquest-ui.js podle data-fallback načte původní soubor
            const inner = question.images ? `<img src="${esc(choice.image)}"${choice.fallback ? ` data-fallback="${esc(choice.fallback)}"` : ''} alt="" class="h-12 w-full object-contain short:h-10" referrerpolicy="no-referrer"><span class="sr-only">Možnost ${i + 1}</span>` : esc(choice.label);
            return `<button type="button" data-cq-answer="${i}" ${answered !== null ? 'disabled' : ''} class="cq-choice${state} flex min-h-[2.75rem] items-center justify-center rounded-xl px-2 py-1 text-center text-[14px] font-bold leading-tight text-slate-800 dark:text-slate-100">${inner}</button>`;
        }).join('');
        const solved = right !== null ? question.choices[right] : null;
        if (compact) {
            const label = (choice) => esc(choice && (choice.label || choice.answerLabel) || '');
            const mine = answered !== null && answered >= 0 ? question.choices[answered] : null;
            const ok = mine && right === answered;
            const lines = [
                mine ? `<span class="flex items-center gap-1 ${right === null ? '' : ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}"><i data-lucide="${right === null ? 'circle-dot' : ok ? 'circle-check' : 'circle-x'}" class="h-4 w-4 shrink-0"></i>Tvoje odpověď: ${label(mine)}</span>` : '<span class="text-rose-700 dark:text-rose-300">Bez odpovědi: čas vypršel.</span>',
                solved && !ok ? `<span class="flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><i data-lucide="circle-check" class="h-4 w-4 shrink-0"></i>Správně: ${label(solved)}</span>` : ''
            ].join('');
            return `<div class="cq-sheet relative rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="Otázka">
                <div data-cq-joined class="pointer-events-none absolute inset-x-2 -top-11 flex justify-center" aria-live="polite"></div>
                <div class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate text-[11.5px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">${esc(title)}</span>${stars}</div>
                <p class="mt-1 line-clamp-2 text-[13.5px] font-bold leading-snug text-slate-700 dark:text-slate-200">${esc(question.prompt)}</p>
                <div class="mt-1 flex flex-col gap-0.5 text-[13px] font-black">${lines}</div>
                ${footer}
            </div>`;
        }
        const after = [
            answered === -1 ? '<p class="text-center text-[12.5px] font-black text-rose-700 dark:text-rose-300">Čas vypršel.</p>' : '',
            answered === null || !solved ? '' : question.kind === 'map' ? `<p class="text-center text-[12.5px] font-bold text-slate-600 dark:text-slate-300">${esc(question.answerLabel)} je bod ${esc(solved.label)}.</p>`
                : question.images ? `<p class="text-center text-[12.5px] font-bold text-slate-600 dark:text-slate-300">Správně: ${esc(solved.label)}</p>` : ''
        ].join('');
        // Bitva: odpočet (pruh se zkracuje, conquest-ui.js ho posouvá) a praporky účastníků; nad listem vyskočí, kdo se právě přidal
        const timer = battle ? `<div class="mt-1 flex items-center gap-2"><div class="cq-timer relative h-2 min-w-0 flex-1 overflow-hidden rounded-full"><div class="cq-timer-fill absolute inset-0" data-cq-timer></div></div>
                <span class="w-9 shrink-0 text-right text-[12.5px] font-black tabular-nums text-slate-800 dark:text-slate-100" data-cq-timer-text>${clockText(battle.deadline - battle.now)}</span></div>
            <div class="mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] font-bold text-slate-600 dark:text-slate-300" data-cq-fighters>${fightersHtml(view, battle.fighters)}</div>` : '';
        return `<div class="cq-sheet cq-sheet-in relative rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="Otázka">
            ${battle ? '<div data-cq-joined class="pointer-events-none absolute inset-x-2 -top-11 flex justify-center" aria-live="polite"></div>' : ''}
            <div class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate text-[11.5px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">${esc(title)}</span>${stars}</div>
            ${timer}
            <p class="mt-1 text-[15px] font-black leading-snug text-slate-900 dark:text-white">${esc(question.prompt)}</p>
            ${visual ? `<div class="mt-1.5">${visual}</div>` : ''}
            <div class="mt-2 ${grid}">${options}</div>
            ${after ? `<div class="mt-1.5">${after}</div>` : ''}
            ${footer}
        </div>`;
    };
    // Účastníci bitvy v otázce: praporky a jména (já = „ty“)
    const fightersHtml = (view, fighters = []) => `<i data-lucide="swords" class="h-3.5 w-3.5 shrink-0 text-rose-700 dark:text-rose-300"></i><span class="sr-only">V bitvě: </span>`
        + fighters.map(player => `<span class="flex min-w-0 items-center gap-1">${view ? fighterFlag(view, player, 'h-3 w-4') : ''}<span class="truncate">${esc(view ? fighterName(view, player) : player.display_name || 'Hráč')}</span></span>`).join('<span aria-hidden="true">·</span>');
    // Vyskakovací zpráva během otázky: kdo se k bitvě právě přidal
    const joinedHtml = (view, player) => `<div class="cq-joined cq-joined-in flex max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13.5px]" role="status"><i data-lucide="swords" class="h-4 w-4 shrink-0"></i>${fighterFlag(view, player, 'h-4 w-5')}<span class="min-w-0 truncate">Do bitvy vstupuje ${esc(fighterName(view, player))}!</span></div>`;
    // Čekání po odpovědi: moje odpověď (správně a čas, nebo špatně), ostatní (odpovězeno, nebo kolik jim zbývá) a co teď rozhodne
    const battleWaitHtml = (view, siege, { correct = false, answerMs = null, late = false, offset = 0, now = Date.now() } = {}) => {
        const rows = siege.participants.map(player => {
            const mine = player.me || (view.me && player.id === view.me.id);
            const deadline = localTime(player.deadline, offset);
            const status = mine ? (correct ? `<span class="text-emerald-700 dark:text-emerald-300">správně${answerMs !== null ? ` · ${seconds(answerMs)}` : ''}</span>` : `<span class="text-rose-700 dark:text-rose-300">${late ? 'pozdě' : 'špatně'}</span>`)
                : player.answered ? '<span class="flex items-center gap-0.5"><i data-lucide="check" class="h-3.5 w-3.5"></i>odpovězeno</span>'
                    : `<span class="flex items-center gap-0.5"><i data-lucide="hourglass" class="h-3.5 w-3.5"></i>přemýšlí${deadline !== null ? ` · <span class="tabular-nums" data-cq-until="${deadline}">${clockText(deadline - now)}</span>` : ''}</span>`;
            return `<li class="flex items-center gap-1.5">${fighterFlag(view, player)}<span class="min-w-0 flex-1 truncate">${esc(fighterName(view, player))}</span><span class="shrink-0">${status}</span></li>`;
        }).join('');
        const text = correct ? 'Teď rozhoduje čas: území získá nejrychlejší správná odpověď.' : 'Tuhle bitvu už nevyhraješ. Výsledek uvidíš, jakmile skončí.';
        return `<div class="cq-wait mt-2 rounded-xl px-2.5 py-2" data-cq-wait>
            <div class="flex items-center gap-1.5 text-[12.5px] font-black"><i data-lucide="hourglass" class="h-4 w-4 shrink-0"></i><span class="min-w-0 flex-1">Čeká se na ostatní</span>
                <button type="button" data-cq="battle-hide" class="-my-1 flex h-8 shrink-0 items-center rounded-lg px-2 text-[11.5px] font-black underline">Zavřít</button></div>
            <ul class="mt-1 flex flex-col gap-0.5 text-[12px] font-bold">${rows}</ul>
            <p class="mt-1 text-[11.5px] font-semibold leading-snug opacity-80">${esc(text)}</p></div>`;
    };
    // Výsledek bitvy s více účastníky: kdo vyhrál (a s jakým časem), kdo byl pomalejší, kdo odpověděl špatně
    const battleResultHtml = (view, siege) => {
        const item = view.index.byId.get(siege.territory);
        const order = (player) => (player.winner ? 0 : player.result === 'outrun' ? 1 : player.answered ? 2 : 3);
        const fighters = [...siege.participants].sort((a, b) => order(a) - order(b) || (a.answer_ms ?? Infinity) - (b.answer_ms ?? Infinity));
        const winner = fighters.find(player => player.winner) || null;
        const meWon = winner && fighterName(view, winner) === 'ty';
        const outcome = !winner ? 'Nikdo neodpověděl správně, útok je odražen.'
            : siege.outcome === 'breach' ? (meWon ? 'Vyhráváš: opevnění je pobořené.' : `Vyhrává ${fighterName(view, winner)}: opevnění je pobořené.`)
                : meWon ? 'Vyhráváš a území je tvoje.' : `Vyhrává ${fighterName(view, winner)} a získává území.`;
        const label = (player) => (player.winner ? `<span class="flex items-center gap-0.5 text-amber-700 dark:text-gold-300"><i data-lucide="crown" class="h-3.5 w-3.5"></i>vítězství${player.answer_ms !== null && player.answer_ms !== undefined ? ` · ${seconds(player.answer_ms)}` : ''}</span>`
            : player.result === 'outrun' ? `<span class="text-slate-600 dark:text-slate-300">správně, pomaleji${player.answer_ms !== null && player.answer_ms !== undefined ? ` · ${seconds(player.answer_ms)}` : ''}</span>`
                : `<span class="text-rose-700 dark:text-rose-300">${player.answered ? 'špatně' : 'bez odpovědi'}</span>`);
        return `<div class="cq-sheet cq-sheet-in rounded-t-2xl p-2.5 pb-3" role="dialog" aria-label="Výsledek bitvy">
            <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><span class="block text-[11.5px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">Výsledek bitvy</span>
                <h2 class="truncate text-[17px] font-black leading-tight text-slate-900 dark:text-white">${esc(item ? item.n : '')}</h2></div>
                <button type="button" data-cq="sheet-close" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400" aria-label="Zavřít"><i data-lucide="x" class="h-5 w-5"></i></button></div>
            <p class="mt-1 text-[13px] font-bold leading-snug text-slate-700 dark:text-slate-200">${esc(outcome)}</p>
            <ol class="cq-ledger mt-1.5 flex flex-col gap-0.5 rounded-xl px-2 py-1.5 text-[12.5px] font-bold">${fighters.map(player => `<li class="flex items-center gap-1.5">${fighterFlag(view, player, 'h-4 w-5')}<span class="min-w-0 flex-1 truncate">${esc(fighterName(view, player))}</span><span class="shrink-0">${label(player)}</span></li>`).join('')}</ol>
        </div>`;
    };
    // Bitvy, do kterých se můžu přidat (nebo se do své vrátit), jako štítky dole na mapě; klepnutí otevře list území s oknem bitvy
    const siegeChipsHtml = (view, { offset = 0, now = Date.now() } = {}) => [...view.sieges.values()]
        .filter(siege => (siege.mine && !siege.answered) || (siege.can_join && !siege.mine && (localTime(siege.join_until, offset) || 0) > now))
        .slice(0, 2).map(siege => {
            const item = view.index.byId.get(siege.territory);
            const until = siege.mine ? localTime(siege.deadline, offset) : localTime(siege.join_until, offset);
            return `<button type="button" data-cq-siege-open="${esc(siege.territory)}" class="cq-siege-chip pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[12.5px] font-black">
                <i data-lucide="swords" class="h-4 w-4 shrink-0"></i><span class="min-w-0 truncate">${esc(siege.mine ? 'Vrátit se do bitvy' : `Bitva: ${item ? item.n : ''}`)}</span>
                ${until !== null ? `<span class="shrink-0 tabular-nums opacity-80" data-cq-until="${until}">${clockText(until - now)}</span>` : ''}</button>`;
        }).join('');

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
    // Výsledek ve stylu map: stupně vítězů jako kamenné podstavce s praporci na žerdích (vítěz s vavřínovým věncem), odměna jako zlatá
    // pečeť, celé pořadí v kartě jako ve hře (medaile, území, regiony, podíl na mapě, body) a pravidla bodování
    const ROMAN = ['I', 'II', 'III'];
    const LAUREL = (() => {
        const leaves = [];
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 7; i++) {
                const angle = (200 - i * 22) * Math.PI / 180;
                const x = 30 + side * 24 * Math.cos(angle), y = 30 + 24 * Math.sin(angle) * -1;
                const rotate = side * (i * 22 - 70);
                leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5.2" ry="2.4" transform="rotate(${rotate.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
            }
        }
        return `<svg viewBox="0 0 60 60" class="cq-laurel" aria-hidden="true" focusable="false"><path d="M12 46Q30 58 48 46" fill="none" stroke-width="2"/><g>${leaves.join('')}</g></svg>`;
    })();
    const resultHtml = (view, { reward = null } = {}) => {
        const podium = [1, 0, 2].map(i => view.ranking[i]).map((player, slot) => {
            if (!player) return '<span class="flex-1"></span>';
            const height = ['h-14', 'h-[4.75rem]', 'h-10'][slot];
            const first = player.place === 1;
            const flag = `<span class="relative flex h-16 w-16 items-end justify-center">${first ? (ART.laurel ? `<img src="${artUrl(ART.laurel)}" alt="" class="cq-laurel-art">` : LAUREL) : ''}<svg viewBox="0 0 40 52" class="relative h-14 w-11" aria-hidden="true" focusable="false"><path d="M4 2V50" stroke="#4a2f16" stroke-width="2.4" stroke-linecap="round"/><circle cx="4" cy="2.5" r="2.4" fill="#d69725" stroke="#7a461b" stroke-width="0.8"/><g class="cq-wave" transform="translate(5 4) scale(1.05)">${pennantGroup(player.flag_color, player.emblem)}</g></svg></span>`;
            return `<div class="cq-podium-step flex min-w-0 flex-1 flex-col items-center" data-place="${player.place}">${flag}
                <span class="cq-ledger-title max-w-full truncate text-[13px]">${esc(player.me ? 'Ty' : player.display_name || 'Hráč')}</span>
                <span class="text-[11px] font-black text-amber-900/80 dark:text-gold-200/80">${esc(pointsWord(player.score))}</span>
                <span class="cq-pedestal cq-pedestal-${player.place <= 3 ? player.place : 'x'} mt-0.5 flex w-full ${height} items-start justify-center rounded-t-lg pt-1">${player.place <= 3 ? ROMAN[player.place - 1] : player.place}</span></div>`;
        }).join('');
        const prize = reward && (reward.badge || reward.xp) ? `<div class="cq-reward flex items-center gap-2.5 rounded-2xl px-2.5 py-1.5">${sealSvg('zluta', 'koruna', 'h-11 w-11 shrink-0')}<span class="min-w-0 flex-1"><span class="block text-[11px] font-black uppercase tracking-wider text-amber-900/75 dark:text-gold-200/80">Odměna za tažení</span><span class="block text-[14.5px] font-black text-slate-900 dark:text-white">${reward.badge ? 'Odznak Dobyvatel' : ''}${reward.badge && reward.xp ? ' · ' : ''}${reward.xp ? `+${reward.xp} XP` : ''}</span></span></div>` : '';
        return `<div class="flex flex-col gap-2" data-cq-result>
            <div class="cq-podium flex items-end gap-1.5 px-1 pt-1">${podium}</div>
            ${prize}
            <section class="cq-ledger rounded-2xl px-2 pb-1.5 pt-1" aria-label="Konečné pořadí">${playersStripHtml(view)}</section>
            <p class="px-1 text-[11.5px] font-semibold leading-snug text-slate-500 dark:text-slate-400">Body: 1 za každé území a ${REGION_POINTS} za celý region. Při shodě vyhrává, kdo svého počtu bodů dosáhl dřív.</p>
            <button type="button" data-cq="replay" class="${GOLD_BUTTON} w-full py-2.5 text-[15px]"><i data-lucide="repeat" class="h-5 w-5"></i> Přehrát celé tažení</button></div>`;
    };

    // Jak se hraje (okno)
    // Jak se hraje: čtyři záložky (každá se vejde na 360×640 bez posouvání), dole tlačítko na další záložku
    const HELP_TABS = [['zaklady', 'Základy'], ['utok', 'Útok'], ['regiony', 'Regiony'], ['konec', 'Konec']];
    const HELP_PAGES = {
        zaklady: [
            ['Cíl', 'Mít na konci hry co nejvíc bodů. Body jsou za území, která na konci držíš (víc v záložce Konec).'],
            ['Začátek', 'Hra začne, až je plná, nebo až jsou v ní aspoň 2 hráči a všichni klepli na „Chci hrát“. Každý dostane jedno domovské území s hradem, ostatní území jsou volná.'],
            ['Období', 'Hra je rozdělená na období. Podle nastavení je období den (24 hodin), nebo hodina. První začíná startem hry, každé další o den (nebo hodinu) později.'],
            ['Tahy', 'V každém období máš několik tahů. Kolik ti jich zbývá, ukazuje počítadlo s meči vpravo nahoře (3/5 = zbývají 3 z 5). Jeden tah je jedna otázka: útok, nebo opevnění. Nevyužité tahy na konci období propadnou.']
        ],
        utok: [
            ['Útok', 'Klepni na volné nebo cizí území, které sousedí s tvým (i přes tečkovanou námořní cestu), a pak na „Zaútočit“.'],
            ['Bitva', 'Kdo zaútočí, začne území obléhat. Ostatní to hned vidí na mapě a mohou se k bitvě přidat, když s územím sousedí. Všichni dostanou stejnou otázku a každý má 60 s.'],
            ['Správně', 'Území získá, kdo odpoví správně nejrychleji. Počítá se čas od zobrazení otázky. U opevněného území vítěz ubere jednu úroveň opevnění.'],
            ['Pozor', 'Kdo odpoví správně, ale pomaleji, nezíská nic a tah ztratí. Tah ztratí i ten, kdo odpoví špatně nebo nestihne čas.'],
            ['Opevnění', 'Klepni na své území a pak na „Opevnit“. Správná odpověď přidá jednu úroveň: Palisáda, Hradba, Pevnost (jen na domovském území). Obléhané území nejde opevnit.']
        ],
        regiony: [
            ['Region', 'Skupina sousedních území. Například na mapě Evropy Britské ostrovy (Spojené království a Irsko) nebo Pobaltí (Estonsko, Lotyšsko, Litva), na mapě Česka Střední Čechy (Praha a Středočeský kraj).'],
            ['Kde ho uvidíš', 'Klepni na území: pod názvem je jeho region a jestli ho někdo drží celý.'],
            ['Celý region', 'Držíš všechna jeho území. Region se pak na mapě zlatě obtáhne a dokud ho držíš, máš v každém období +1 tah a na konci hry 2 body navíc.'],
            ['Další tahy navíc', '+1 tah hned, když dobudeš území s pokladem (truhla na mapě, platí jen v tom období). +1 tah v příštím období, když dobudeš domovské území soupeře. Pevnost na domovském hradu: +1 tah za období.'],
            ['Ztráta hradu', 'Kdo přijde o domovský hrad, má v dalším období o 1 tah méně. Hrad se proto vyplatí opevnit.']
        ],
        konec: [
            ['Konec', 'Hra skončí po čase nastaveném při založení. Kolik zbývá, ukazuje nápis pod názvem mapy.'],
            ['Body', `1 bod za každé území, které na konci držíš, a ${REGION_POINTS} body navíc za každý celý region. Vyhrává, kdo má nejvíc bodů. Při shodě rozhoduje, kdo svého počtu bodů dosáhl dřív.`],
            ['Návrat do hry', 'Když přijdeš o všechna území, dostaneš na začátku dalšího období nové domovské území a hraješ dál.'],
            ['Odměny', `1. místo: odznak Dobyvatel a ${REWARD_XP[0]} XP, 2. místo: ${REWARD_XP[1]} XP, 3. místo: ${REWARD_XP[2]} XP. Poslední místo nedostane nic, ve hře dvou hráčů tedy dostane odměnu jen 1. místo. Odměny jsou jen ve hře aspoň 3 hráčů nebo ve hře, která trvá aspoň den, a jen když máš aspoň 3 vlastní tahy a aspoň 1 bod.`]
        ]
    };
    const helpHtml = (tab = 'zaklady') => {
        const current = HELP_PAGES[tab] ? tab : 'zaklady';
        const index = HELP_TABS.findIndex(([id]) => id === current);
        const next = HELP_TABS[index + 1];
        return `<div data-cq-help="${current}" class="flex flex-col gap-2.5">
            <div role="tablist" class="grid grid-cols-4 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${HELP_TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === current}" data-cq-help-tab="${id}" class="flex min-h-[2.5rem] items-center justify-center rounded-xl px-1 text-[12.5px] font-black ${id === current ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`).join('')}</div>
            <div class="flex flex-col gap-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200">${HELP_PAGES[current].map(([title, text]) => `<p><b class="text-slate-900 dark:text-white">${title}:</b> ${text}</p>`).join('')}</div>
            ${next ? `<button type="button" data-cq-help-tab="${next[0]}" class="${LIGHT_BUTTON} w-full">Dál: ${next[1]} <i data-lucide="chevron-right" class="h-4 w-4"></i></button>` : ''}
        </div>`;
    };

    return {
        ART, MAPS, MAP_BY_ID, DURATIONS, PERIODS, MIN_PLAYERS, MAX_PLAYERS, MAX_ACTIONS, MAX_GAMES, MAX_OWN_LOBBIES, REGION_POINTS, LEVELS, REWARD_XP,
        COLORS, COLOR_BY_ID, EMBLEMS, EMBLEM_BY_ID, colorOf, emblemOf, inkOf, emblemInk, luminance, maxLevel, rewardFor,
        durationLabel, periodLabel, actionsLabel, timeLeft, movesWord, pointsWord, playersWord, territoriesWord, regionsWord, nextPeriodAt, agoLabel, periodLine,
        budgetTitle, budgetInnerHtml, periodStartText, PENALTY_TEXT,
        indexMap, parseRings, pointInRings, project, territoryAt, isAdjacent, viewOf, rank, sourcesFor, actionsFor,
        buildQuestion, answerKey, familyPlan, kindsFor, placesOf, poolsOf, formsOf, FAMILY_IDS, FAMILY_DOMAIN, DOMAINS, FAMILY_CAP, flagUrl, flagFallback, THUMB, feedItems, replaySteps, capturedWord, hatchPattern, levelIcon, iconMarkup,
        pennantSvg, pennantGroup, emblemSvg, sealSvg, mapSvg, thumbSvg, marksFor, clockText, localTime, battleWaitHtml, battleResultHtml, joinedHtml, fightersHtml, siegeChipsHtml, RISK_TEXT, homeCardHtml, hubHtml, mineHtml, lobbyHtml, createHtml, lookHtml, lobbyDetailHtml,
        gameScreenHtml, playersStripHtml, recentHtml, sheetHtml, devBarHtml, questionHtml, feedHtml, resultHtml, helpHtml, HELP_TABS, mapTitle, paramChips,
        // Pozvánky přátel (blok 24)
        friendsPickerHtml, inviteCardHtml
    };
});
