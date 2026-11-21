// Prestiž po úrovni 100: úroveň se počítá z celkových XP (quiz-core.js levelFromXp) a končí na 100. Kdo ji má, může (po vysvětlení
// a potvrzení) přejít do prestiže: úroveň se mu začne ukazovat znovu od 1 s hvězdou prestiže (★1 · úr. 7), u jména a v profilu.
// Je to jen vrstva zobrazení nad XP: XP, odznaky, žebříčky, ligy ani nic odemčeného se nemění, odemykání dál počítá skutečnou
// úroveň (100). Úrovně v prestiži jsou rovnoměrné: každá za LEVEL_XP XP (100 úrovní = 49 500 XP), na úrovni 100 jde do další prestiže.
// Stav = { n: počet prestiží, at: XP v okamžiku poslední prestiže }; přihlášenému ho drží server (profiles.prestige a prestige_xp,
// prestige_up() v bloku 32 ve schema.sql ověří XP z účtu), hostovi zařízení (mudrlant.prestige). Za první prestiž rámeček Prestižní a postavička Avokádo jogín, za druhou Smrtka na dovolené (look.js).
// Strop XP v databázi (500 000) stačí na 4 prestiže hned po sobě (330 000, 379 500, 429 000, 478 500 XP).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantCore || (isNode ? require('./quiz-core.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantPrestige = api;
})(typeof self !== 'undefined' ? self : this, (Core) => {
    'use strict';
    const KEY = 'mudrlant.prestige';
    const MAX_LEVEL = Core ? Core.MAX_LEVEL : 100;
    // XP na úroveň 100 (první prestiž) a XP na jednu úroveň v prestiži
    const START_XP = Core ? Core.xpForLevel(MAX_LEVEL) : 330000;
    const LEVEL_XP = 500;
    const CYCLE_XP = (MAX_LEVEL - 1) * LEVEL_XP;
    const MAX_PRESTIGE = 99;
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const clean = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const n = whole(data.n, MAX_PRESTIGE);
        return { n, at: n ? whole(data.at, 1e9) : 0 };
    };
    // Kolik XP je potřeba na další prestiž (ze stavu)
    const nextAt = (state) => { const s = clean(state); return s.n ? s.at + CYCLE_XP : START_XP; };
    // Přehled pro zobrazení: { prestige, level (ukázaná úroveň), into, needed (XP v úrovni, 0 na úrovni 100), ratio, realLevel, canPrestige, nextAt }
    const view = (xp, state) => {
        const s = clean(state);
        const total = whole(xp, 1e9);
        const real = Core ? Core.levelProgress(total) : { level: 1, into: 0, needed: 0, ratio: 0 };
        const canPrestige = s.n < MAX_PRESTIGE && total >= nextAt(s);
        if (!s.n) return { prestige: 0, level: real.level, into: real.into, needed: real.needed, ratio: real.ratio, realLevel: real.level, canPrestige, nextAt: nextAt(s) };
        const gained = Math.max(0, total - s.at);
        const level = Math.min(MAX_LEVEL, 1 + Math.floor(gained / LEVEL_XP));
        const top = level >= MAX_LEVEL;
        const into = top ? gained - CYCLE_XP : gained % LEVEL_XP;
        return { prestige: s.n, level, into, needed: top ? 0 : LEVEL_XP, ratio: top ? 1 : into / LEVEL_XP, realLevel: real.level, canPrestige, nextAt: nextAt(s) };
    };
    // Přechod do další prestiže v zařízení (host; přihlášenému ho dá server): nový stav, nebo null, když to ještě nejde
    const advance = (state, xp) => {
        const s = clean(state);
        if (s.n >= MAX_PRESTIGE || whole(xp, 1e9) < nextAt(s)) return null;
        return { n: s.n + 1, at: whole(xp, 1e9) };
    };
    // Stav ze serveru (prestige, prestige_xp) nebo null
    const fromServer = (row) => (row && Number.isFinite(Number(row.prestige)) ? clean({ n: row.prestige, at: row.prestige_xp }) : null);
    // Novější ze dvou stavů (víc prestiží; při shodě pozdější začátek)
    const newer = (a, b) => { const x = clean(a); const y = clean(b); return y.n > x.n || (y.n === x.n && y.at > x.at) ? y : x; };

    // --- Texty a HTML ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const mark = (n) => (n > 0 ? `★${n}` : '');
    // „★1 · úr. 7“ nebo „Úr. 7“ (bez prestiže); short = jen značka a číslo do těsného místa
    const levelText = (v, { short = false } = {}) => (v.prestige ? (short ? `★${v.prestige} · ${v.level}` : `★${v.prestige} · úr. ${v.level}`) : `Úr. ${v.level}`);
    // Zlatý štítek prestiže (u úrovně, v profilu)
    const markHtml = (n, cls = 'text-[10px]') => (n > 0 ? `<span data-prestige-mark="${n}" class="prestige-mark inline-flex shrink-0 items-center rounded-full px-1 font-black leading-tight ${cls}" title="Prestiž ${n}">★${n}</span>` : '');
    const formatXp = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // --- Medailon prestiže (docs/OBRAZKY.md §31): deset stupňů od bronzu (★1) po legendární (★10 a výš) ---
    // Ukáže se v rohu obrázku hráče všude, kde jsou hráči vidět (app.js avatarHtml), v hlavičce u úrovně, velký v Úrovních a titulech
    // a při oslavě prestiže. Od ★10 vypadá medailon stejně, číslo prestiže dopíše aplikace do štítku dole.
    const TIERS = [null,
        { id: 'bronz', name: 'Bronz', rim: '#b4652c', light: '#eeb077', face: '#d0843f', shade: '#a75a20', star: '#ffdcb0' },
        { id: 'stribro', name: 'Stříbro', rim: '#8794a8', light: '#f5f8fc', face: '#cdd6e2', shade: '#a3afbf', star: '#ffffff' },
        { id: 'zlato', name: 'Zlato', rim: '#d39410', light: '#ffe68c', face: '#f6bd22', shade: '#cc8d0b', star: '#fff7c8', leaf: '#5f9e3a' },
        { id: 'smaragd', name: 'Smaragd', rim: '#d39410', light: '#ffe68c', face: '#0e7a57', shade: '#0a5e43', star: '#fff2a8', gem: '#2fd08e', gemLight: '#b6f7d8', wing: '#fbf9f1', wingShade: '#d9d2bf' },
        { id: 'ametyst', name: 'Ametyst', rim: '#d39410', light: '#ffe68c', face: '#4c1d95', shade: '#38106f', star: '#fff2a8', gem: '#c27cff', gemLight: '#f6d4ff', wing: '#e4d8fd', wingShade: '#a78bfa' },
        { id: 'rubin', name: 'Rubín', rim: '#e0a815', light: '#fff1a6', face: '#7f1d1d', shade: '#5f1414', star: '#ffe27a', gem: '#f43f5e', gemLight: '#fecdd3', wing: '#f6c445', wingShade: '#c98a14', wingSize: 1.18, crown: 'small' },
        { id: 'safir', name: 'Safír', rim: '#c9d6e6', light: '#ffffff', face: '#1e3a8a', shade: '#172c6b', star: '#e0f2fe', gem: '#60a5fa', gemLight: '#dbeafe', wing: '#f1f5f9', wingShade: '#94a3b8', wingSize: 1.18, crown: 'normal' },
        { id: 'obsidian', name: 'Obsidián', rim: '#d39410', light: '#ffe68c', face: '#1c1917', shade: '#0c0a09', star: '#fde68a', gem: '#f97316', gemLight: '#fde047', wing: '#3a3330', wingShade: '#d39410', wingSize: 1.18, crown: 'normal', flames: true },
        { id: 'hvezdna-noc', name: 'Hvězdná noc', rim: '#8fa8d8', light: '#e6edff', face: '#1e1b4b', shade: '#14123a', star: '#fef3c7', planet: '#fbbf24', ring: '#fde68a', wing: '#d6e4f7', wingShade: '#7f9cc8', wingSize: 1.18, crown: 'normal', crownColor: '#e0a815' },
        { id: 'legendarni', name: 'Legendární', rim: '#f8e7a6', light: '#ffffff', face: '#fffbeb', shade: '#f3dc9a', star: '#f6c445', gem: '#ffffff', gemLight: '#ffffff', rainbow: true, wing: '#fffdf5', wingShade: '#e8c76a', wingSize: 1.3, crown: 'tall', crownColor: '#f6c445', rays: '#fcd34d' }
    ];
    const TOP_TIER = TIERS.length - 1;
    // Obrázky medailonů (icons/topics/<název>.webp) po dodání: zatím null, kreslí se SVG. Zapojení = doplnit název (např. 3: 'prestiz-3');
    // že soubor existuje, hlídá tests/prestige-medal.test.js.
    const ART = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, `prestiz-${i + 1}`]));
    // Stupeň vzhledu medailonu (0 = bez prestiže, 10 = legendární pro ★10 a výš) a jeho název
    const tierOf = (n) => { const value = whole(n, MAX_PRESTIGE); return value ? Math.min(TOP_TIER, value) : 0; };
    const tierName = (n) => (tierOf(n) ? TIERS[tierOf(n)].name : '');
    // Dostane hráč přechodem do prestiže n medailon jiného vzhledu (★1 až ★10)?
    const newLook = (n) => tierOf(n) > 0 && tierOf(n) !== tierOf(n - 1);
    const OUTLINE = '#3d1b1f';
    const f1 = (value) => Math.round(value * 100) / 100;
    const onCircle = (cx, cy, r, deg) => [f1(cx + Math.cos(deg * Math.PI / 180) * r), f1(cy + Math.sin(deg * Math.PI / 180) * r)];
    // Pěticípá hvězda se středem cx, cy a poloměrem r (vnitřní poloměr 0,47 r)
    const starPath = (cx, cy, r) => `M${Array.from({ length: 10 }, (_, i) => onCircle(cx, cy, i % 2 ? r * 0.47 : r, -90 + i * 36).join(' ')).join('L')}Z`;
    const star = (cx, cy, r, fill, width = 1.3) => `<path d="${starPath(cx, cy, r)}" fill="${fill}" stroke="${OUTLINE}" stroke-width="${width}" stroke-linejoin="round"/>`;
    // Kulatá medaile: obrys, okraj s leskem vlevo nahoře, vnitřní obrys a plocha se stínem vpravo dole
    const disc = (t, cx, cy, R) => {
        const rim = R * 0.89; const inner = R * 0.665; const face = R * 0.6; const mid = (rim + inner) / 2;
        const [hx1, hy1] = onCircle(cx, cy, mid, 192); const [hx2, hy2] = onCircle(cx, cy, mid, 258);
        const [sx1, sy1] = onCircle(cx, cy, face, -45); const [sx2, sy2] = onCircle(cx, cy, face, 135);
        return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${OUTLINE}"/><circle cx="${cx}" cy="${cy}" r="${f1(rim)}" fill="${t.rim}"/>`
            + `<path d="M${hx1} ${hy1}A${f1(mid)} ${f1(mid)} 0 0 1 ${hx2} ${hy2}" fill="none" stroke="${t.light}" stroke-width="${f1(R * 0.11)}" stroke-linecap="round"/>`
            + `<circle cx="${cx}" cy="${cy}" r="${f1(inner)}" fill="${OUTLINE}"/><circle cx="${cx}" cy="${cy}" r="${f1(face)}" fill="${t.face}"/>`
            + `<path d="M${sx1} ${sy1}A${f1(face)} ${f1(face)} 0 0 1 ${sx2} ${sy2}A${f1(face * 1.25)} ${f1(face * 1.25)} 0 0 0 ${sx1} ${sy1}Z" fill="${t.shade}"/>`;
    };
    // Cvočky po obvodu okraje
    const studs = (t, cx, cy, r, count, size) => Array.from({ length: count }, (_, i) => {
        const [x, y] = onCircle(cx, cy, r, i * 360 / count + 22.5);
        return `<circle cx="${x}" cy="${y}" r="${size}" fill="${t.light}" stroke="${OUTLINE}" stroke-width="0.5"/>`;
    }).join('');
    // Broušený drahokam: pětiúhelník se světlou ploškou a bílou jiskrou; rainbow = plošky v barvách duhy (legendární diamant)
    const RAINBOW = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc'];
    const gem = (t, cx, cy, s) => {
        const pt = (x, y) => `${f1(cx + x * s)} ${f1(cy + y * s)}`;
        const corners = [[0, -1], [0.95, -0.3], [0.6, 0.85], [-0.6, 0.85], [-0.95, -0.3]];
        const facets = t.rainbow ? corners.map((c, i) => { const d = corners[(i + 1) % 5]; return `<path d="M${pt(0, 0.1)}L${pt(c[0], c[1])}L${pt(d[0], d[1])}Z" fill="${RAINBOW[i]}"/>`; }).join('') : '';
        return `<path d="M${corners.map(([x, y]) => pt(x, y)).join('L')}Z" fill="${t.gem}"/>${facets}`
            + `<path d="M${corners.map(([x, y]) => pt(x, y)).join('L')}Z" fill="none" stroke="${OUTLINE}" stroke-width="1.2" stroke-linejoin="round"/>`
            + `<path d="M${pt(-0.48, -0.3)}L${pt(0.48, -0.3)}L${pt(0.27, 0.42)}L${pt(-0.27, 0.42)}Z" fill="${t.gemLight}"${t.rainbow ? ' fill-opacity="0.75"' : ''}/>`
            + `<circle cx="${f1(cx - 0.42 * s)}" cy="${f1(cy - 0.5 * s)}" r="${f1(s * 0.14)}" fill="#ffffff"/>`;
    };
    // Planeta s prstencem a hvězdičky na noční obloze (Hvězdná noc)
    const planet = (t, cx, cy) => [[-5.2, -3.6], [4.8, -4.4], [-3.6, 4.6], [5.4, 3.2], [0.6, -6.4]].map(([x, y]) => `<circle cx="${f1(cx + x)}" cy="${f1(cy + y)}" r="0.65" fill="#ffffff"/>`).join('')
        + `<circle cx="${cx}" cy="${cy}" r="3.9" fill="${t.planet}" stroke="${OUTLINE}" stroke-width="1"/>`
        + `<ellipse cx="${cx}" cy="${cy}" rx="6.6" ry="1.9" transform="rotate(-18 ${cx} ${cy})" fill="none" stroke="${t.ring}" stroke-width="1.2"/>`;
    // Křídlo vlevo (vpravo zrcadlově) za medailí: tři stupně peří; size zvětší křídla od místa, kde se dotýkají medaile
    const WING = 'M10.5 16.5C7 14.6 3.8 12.3 1.2 8.6C0.7 12.4 1.3 15.3 2.9 17.4C1.6 18.3 1.1 19.9 1.6 21.2C2.9 22.1 4.6 22.5 6.1 22.3C5.6 23.8 6.2 25.4 7.5 26.3L10.5 25Z';
    const wings = (t, dy = 0) => {
        const size = t.wingSize || 1;
        const grow = size === 1 ? '' : ` transform="translate(10.5 18) scale(${size}) translate(-10.5 -18)"`;
        const one = `<g${grow}><path d="${WING}" fill="${t.wing}" stroke="${OUTLINE}" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.2 17.6L8.4 18.9M3.3 21.4L8.4 21.6" fill="none" stroke="${t.wingShade}" stroke-width="1" stroke-linecap="round"/></g>`;
        return `<g transform="translate(0 ${dy})">${one}</g><g transform="matrix(-1 0 0 1 40 ${dy})">${one}</g>`;
    };
    // Vavřínové lístky na spodní části okraje (zlato)
    const leaves = (t, cx, cy, r) => [118, 136, 154, 62, 44, 26].map(deg => {
        const [x, y] = onCircle(cx, cy, r, deg);
        return `<ellipse cx="${x}" cy="${y}" rx="2.3" ry="1.1" transform="rotate(${deg + 90} ${x} ${y})" fill="${t.leaf}" stroke="${OUTLINE}" stroke-width="0.55"/>`;
    }).join('');
    // Koruna na horním okraji: malá (Rubín), běžná, nebo vysoká s pěti hroty (Legendární)
    const crown = (t) => {
        const color = t.crownColor || t.rim;
        const shape = t.crown === 'small' ? 'M14.2 12.2L13.5 7.2L17 9.6L20 5.4L23 9.6L26.5 7.2L25.8 12.2Z'
            : t.crown === 'tall' ? 'M11.6 12.4L10 2.6L14.6 7.4L17 1.4L20 6L23 1.4L25.4 7.4L30 2.6L28.4 12.4Z'
                : 'M12.3 12L11.3 4.6L16 8.2L20 2.2L24 8.2L28.7 4.6L27.7 12Z';
        const tips = t.crown === 'small' ? [[13.5, 7.2], [20, 5.4], [26.5, 7.2]] : t.crown === 'tall' ? [[10, 2.6], [17, 1.4], [23, 1.4], [30, 2.6]] : [[11.3, 4.6], [20, 2.2], [28.7, 4.6]];
        return `<path d="${shape}" fill="${color}" stroke="${OUTLINE}" stroke-width="1.2" stroke-linejoin="round"/>`
            + tips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${t.crown === 'small' ? 1.1 : 1.35}" fill="${t.gem || t.planet}" stroke="${OUTLINE}" stroke-width="0.55"/>`).join('');
    };
    // Plameny za medailí (Obsidián)
    const flames = () => [[-1, 1], [1, 1]].map(([side]) => {
        const x = (v) => f1(20 + side * v);
        return `<path d="M${x(9)} 30C${x(15)} 29 ${x(19.5)} 24 ${x(18)} 15C${x(16.5)} 18 ${x(15)} 19 ${x(13.5)} 18.5C${x(15)} 15 ${x(14)} 11 ${x(10.5)} 8.5C${x(10.5)} 13 ${x(8)} 15 ${x(7)} 17Z" fill="#f97316" stroke="${OUTLINE}" stroke-width="1" stroke-linejoin="round"/>`
            + `<path d="M${x(11)} 27C${x(15)} 26 ${x(17)} 22 ${x(16)} 18.5C${x(14.5)} 21 ${x(13)} 21 ${x(12)} 20Z" fill="#fde047"/>`;
    }).join('');
    // Sluneční paprsky za medailí (Legendární)
    const rays = (t, cx, cy) => Array.from({ length: 12 }, (_, i) => {
        const deg = i * 30 + 15;
        const [ax, ay] = onCircle(cx, cy, 19.5, deg); const [bx, by] = onCircle(cx, cy, 11, deg - 9); const [dx, dy] = onCircle(cx, cy, 11, deg + 9);
        return `<path d="M${bx} ${by}L${ax} ${ay}L${dx} ${dy}Z" fill="${t.rays}" stroke="${OUTLINE}" stroke-width="0.7" stroke-linejoin="round"/>`;
    }).join('');
    // Kresba medailonu stupně 1–10 (viewBox 0 0 40 40, jen atributy SVG bez stylů: projde přísným CSP)
    const medalSvg = (tier) => {
        const t = TIERS[tier];
        let body;
        if (tier === 1) body = disc(t, 20, 20, 19) + studs(t, 20, 20, 14.75, 8, 1) + star(20, 20.6, 8.4, t.star);
        else if (tier === 2) {
            body = disc(t, 20, 20, 19) + studs(t, 20, 20, 14.75, 8, 1) + `<circle cx="20" cy="20" r="9.9" fill="none" stroke="${t.shade}" stroke-width="0.9"/>`
                + star(15.1, 20.6, 5.6, t.star, 1.15) + star(24.9, 20.6, 5.6, t.star, 1.15);
        } else if (tier === 3) body = disc(t, 20, 20, 19) + leaves(t, 20, 20, 14.75) + star(12.9, 22, 4.2, t.star, 1.05) + star(27.1, 22, 4.2, t.star, 1.05) + star(20, 17.4, 5.2, t.star, 1.1);
        else if (!t.crown) {
            // Smaragd a Ametyst: křídla, drahokam a tři hvězdičky nahoře na okraji
            body = wings(t) + disc(t, 20, 21.5, 15.5) + [-128, -90, -52].map(deg => { const [x, y] = onCircle(20, 21.5, 11.98, deg); return star(x, y, 2.3, t.star, 0.7); }).join('')
                + gem(t, 20, 21.9, 6.1);
        } else {
            // Od Rubínu koruna nad medailí, pět hvězdiček dole na okraji; Obsidián s plameny, Legendární se slunečními paprsky
            body = (t.rays ? rays(t, 20, 24) : '') + (t.flames ? flames() : '') + wings(t, 3) + disc(t, 20, 24, 14.6) + crown(t)
                + [20, 55, 90, 125, 160].map(deg => { const [x, y] = onCircle(20, 24, 11.27, deg); return star(x, y, 1.8, t.star, 0.6); }).join('')
                + (t.planet ? planet(t, 20, 23.6) : gem(t, 20, 23.6, 5.4));
        }
        return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" class="block h-full w-full">${body}</svg>`;
    };
    // Štítek s číslem prestiže (od ★10) přes spodní okraj medailonu; je nad kresbou i nad obrázkem z ART
    const numberSvg = (n) => {
        const text = String(n);
        const width = text.length > 1 ? 14 : 10;
        return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" data-prestige-number class="pointer-events-none absolute inset-0 h-full w-full">`
            + `<rect x="${f1(39 - width)}" y="30.4" width="${width}" height="9" rx="4.5" fill="#fde047" stroke="${OUTLINE}" stroke-width="1.2"/>`
            + `<text x="${f1(39 - width / 2)}" y="37.6" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="7.8" font-weight="900" fill="${OUTLINE}">${text}</text></svg>`;
    };
    // Medailon prestiže n (bez prestiže prázdný text); cls = velikost (h-5 w-5 …) a umístění. role="img" s popiskem „Prestiž 2“.
    // Rozsvěcování legendárního medailonu od ★11 do ★99: oblasti obrázku ★10 v tomto pořadí (třídy prestige-lit-<oblast> v src/input.css
    // ořízne clip-path), každá ve 4 stupních síly; prahy rovnoměrně mezi ★11 a ★98, na ★99 svítí celý a jemně se třpytí
    // Krystal se rozsvěcuje barva po barvě (gem-<barva>): vlastní vrstvy icons/topics/prestiz-10-gem-<barva>.webp (scripts/prestige-gem.py)
    const GEM_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet'];
    const LIT_REGIONS = ['rays', 'wing-left', 'wing-right', 'rim', 'crown', ...GEM_COLORS.map(color => `gem-${color}`)];
    const LIT_STEPS = 4;
    // Kolik kroků rozsvícení má prestiž n (0 do ★10, 1 na ★11 … všech 24 na ★98 a ★99) a síla jednotlivých oblastí
    const litSteps = (n) => {
        const value = whole(n, MAX_PRESTIGE);
        if (value <= TOP_TIER) return 0;
        const total = LIT_REGIONS.length * LIT_STEPS;
        return Math.min(total, 1 + Math.floor((value - TOP_TIER - 1) * total / (MAX_PRESTIGE - TOP_TIER - 1)));
    };
    const litLevels = (n) => { const steps = litSteps(n); return LIT_REGIONS.map((region, i) => [region, Math.max(0, Math.min(LIT_STEPS, steps - i * LIT_STEPS))]); };
    // Záře celého medailonu (drop-shadow, i u kresby v SVG a u malého odznáčku u obrázku): 0–4 podle rozsvícení, 'max' na ★99
    const auraOf = (n) => (whole(n, MAX_PRESTIGE) >= MAX_PRESTIGE ? 'max' : Math.ceil(litSteps(n) / LIT_REGIONS.length));
    // Medailon prestiže n (bez prestiže prázdný text); cls = velikost (h-5 w-5 …) a umístění. role="img" s popiskem „Prestiž 2“.
    // Obrázek z ART je ve čtvercovém rámu (object-contain; křídla dělají medailon širší než vyšší); od ★11 nad ním kopie obrázku
    // rozsvícené po oblastech (lit = false: jen záře, pro malý odznáček u obrázku hráče)
    const medalHtml = (n, cls = 'h-5 w-5', { lit = true } = {}) => {
        const value = whole(n, MAX_PRESTIGE);
        if (!value) return '';
        const tier = tierOf(value);
        const src = ART[tier] ? `icons/topics/${ART[tier]}.webp` : '';
        const img = (extra) => `<img src="${src}" alt="" draggable="false" class="block h-full w-full select-none object-contain${extra}">`;
        const layer = (region, level) => (region.startsWith('gem-')
            ? `<img src="icons/topics/${ART[tier]}-${region}.webp" alt="" draggable="false" class="block h-full w-full select-none object-contain prestige-lit prestige-lit-gem prestige-lit-l${level}">`
            : img(` prestige-lit prestige-lit-${region} prestige-lit-l${level}`));
        const layers = src && lit ? litLevels(value).filter(([, level]) => level > 0).map(([region, level]) => layer(region, level)).join('') : '';
        const aura = auraOf(value);
        const glow = aura ? ` prestige-aura prestige-aura-${aura}` : '';
        return `<span data-prestige-medal="${value}" data-prestige-tier="${tier}"${aura ? ` data-prestige-aura="${aura}"` : ''} role="img" aria-label="Prestiž ${value}" title="Prestiž ${value}" class="prestige-medal${src ? ' prestige-art' : ''}${glow} relative inline-flex shrink-0 ${cls}">${src ? img('') : medalSvg(tier)}${layers}${value >= TOP_TIER ? numberSvg(value) : ''}</span>`;
    };
    // Velikost obrázku hráče v px z třídy výšky (h-9, h-[18px]); null = nejde poznat
    const avatarPx = (size) => {
        const match = /(?:^|\s)h-(?:(\d+(?:\.5)?)|\[(\d+)px\])(?=\s|$)/.exec(size || '');
        return !match ? null : match[1] ? Number(match[1]) * 4 : Number(match[2]);
    };
    // Medailon v rohu obrázku hráče (app.js avatarHtml; třída prestige-badge v src/input.css: asi 40 % obrázku vpravo dole s obrysem
    // v barvě podkladu). U drobných obrázků (pod 20 px, třeba v řádku textu) by byl nečitelný, tam se nekreslí.
    const badgeHtml = (n, size = '') => {
        const value = whole(n, MAX_PRESTIGE);
        const px = avatarPx(size);
        return value && (px === null || px >= 20) ? `<span class="prestige-badge" data-prestige-badge="${value}">${medalHtml(value, 'h-full w-full', { lit: false })}</span>` : '';
    };
    // Co prestiž n udělá s medailonem u obrázku (★1–★10 nový vzhled, od ★11 jen jiné číslo)
    const medalNews = (n) => (newLook(n) ? `u obrázku dostaneš medailon prestiže (${tierName(n)}), který uvidí i ostatní hráči`
        : `na medailonu prestiže u tvého obrázku bude číslo ${n}, uvidí ho i ostatní hráči`);
    // Vysvětlení a potvrzení (okno Úrovně a tituly): co se stane a co zůstane; bez tlačítka, když prestiž ještě nejde (jen výhled)
    const panelHtml = (v, { busy = false, signedIn = false } = {}) => {
        const next = v.prestige + 1;
        if (!v.canPrestige) {
            if (!v.prestige) return '';
            return `<div data-prestige-panel class="prestige-card flex items-center gap-2.5 rounded-2xl p-2.5 text-white shadow-sm">
                ${medalHtml(v.prestige, 'h-14 w-14 drop-shadow-md')}
                <p class="min-w-0 flex-1 text-[12px] font-semibold leading-snug">Prestiž ${v.prestige}: úroveň ${v.level} ze ${MAX_LEVEL}. Každá úroveň za ${formatXp(LEVEL_XP)} XP, na úrovni ${MAX_LEVEL} můžeš do prestiže ${next}. Tvůj medailon prestiže (${tierName(v.prestige)}) vidí ostatní u tvého obrázku.</p>
            </div>`;
        }
        return `<div data-prestige-panel class="prestige-card flex flex-col gap-2 rounded-2xl p-3 text-white shadow-md">
            <div class="flex items-center gap-2.5">
                ${medalHtml(next, 'h-14 w-14 drop-shadow-md')}
                <p class="min-w-0 flex-1 text-[15px] font-black leading-tight">${v.prestige ? `Můžeš do prestiže ${next}` : 'Máš úroveň 100. Můžeš do prestiže!'}</p>
            </div>
            <ul class="flex flex-col gap-1 text-[12px] font-semibold leading-snug text-white/90">
                <li class="flex gap-1.5">${medalHtml(next, 'h-4 w-4')}<span>Úroveň se ti začne ukazovat znovu od 1 s hvězdou ★${next} a ${medalNews(next)}.</span></li>
                <li class="flex gap-1.5"><i data-lucide="shield-check" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300"></i><span>Nic neztratíš: XP, odznaky, odměny, žebříčky i všechno odemčené ti zůstane.</span></li>
                <li class="flex gap-1.5"><i data-lucide="sparkles" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300"></i><span>${v.prestige === 1 ? `Za druhou prestiž postavička Smrtka na dovolené. Každá úroveň za ${formatXp(LEVEL_XP)} XP.` : v.prestige ? `Každá úroveň za ${formatXp(LEVEL_XP)} XP.` : `Získáš rámeček Prestižní a postavičku Avokádo jogín. Každá další úroveň za ${formatXp(LEVEL_XP)} XP.`}</span></li>
            </ul>
            <button type="button" data-prestige-go ${busy ? 'disabled' : ''} class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gold-500 px-4 py-2.5 text-[15px] font-black text-brand-950 disabled:opacity-60"><i data-lucide="star" class="h-5 w-5"></i>${busy ? 'Chvilku…' : `Přejít do prestiže ${next}`}</button>
            ${signedIn ? '' : '<p class="text-center text-[11px] font-semibold text-white/75">Bez přihlášení se prestiž pamatuje jen v tomhle zařízení.</p>'}
        </div>`;
    };
    // Potvrzovací otázka (druhý krok)
    const confirmHtml = (v, { busy = false } = {}) => `
        <div data-prestige-confirm class="flex flex-col gap-3">
            <div class="flex items-center gap-2.5">
                ${medalHtml(v.prestige + 1, 'h-12 w-12 drop-shadow-md')}
                <p class="min-w-0 flex-1 text-[14px] font-bold leading-snug text-slate-800 dark:text-slate-100">Opravdu přejít do prestiže ${v.prestige + 1}?</p>
            </div>
            <p class="text-[13px] leading-snug text-slate-600 dark:text-slate-300">Úroveň se ti ukáže znovu od 1 se značkou ★${v.prestige + 1} a ${medalNews(v.prestige + 1)}. Celkové XP (${formatXp(v.realXp || 0)} XP), odznaky, odměny i postavení v žebříčcích zůstanou. Vrátit to nejde, ale nic tím neztratíš.</p>
            <div class="grid grid-cols-2 gap-2">
                <button type="button" data-prestige-cancel class="min-h-[2.75rem] rounded-2xl bg-slate-100 text-[14px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200">Zpět</button>
                <button type="button" data-prestige-confirm-go ${busy ? 'disabled' : ''} class="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-2xl btn-3d bg-gold-500 text-[14px] font-black text-brand-950 disabled:opacity-60"><i data-lucide="star" class="h-4 w-4"></i>${busy ? 'Chvilku…' : 'Ano, do prestiže'}</button>
            </div>
        </div>`;

    return { KEY, MAX_LEVEL, START_XP, LEVEL_XP, CYCLE_XP, MAX_PRESTIGE, TIERS, TOP_TIER, ART, clean, nextAt, view, advance, fromServer, newer, mark, levelText, markHtml, tierOf, tierName, newLook, medalNews, LIT_REGIONS, litSteps, litLevels, auraOf, medalHtml, avatarPx, badgeHtml, panelHtml, confirmHtml };
});
