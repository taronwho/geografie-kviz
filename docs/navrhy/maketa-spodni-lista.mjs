// Maketa schváleného návrhu 1 „Spodní lišta s pěti záložkami“ (jen obrázek jako předloha, ne kód aplikace)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = '/home/user/geografie-kviz';
const OUT = path.dirname(new URL(import.meta.url).pathname);
globalThis.window = {};
require(`${ROOT}/icons.js`);
const ICONS = globalThis.window.MUDRLANT_ICONS;
const ic = (name, size = 20, style = '') => {
    const parts = ICONS[name];
    if (!parts) throw new Error(`ikona ${name}`);
    const inner = parts.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;${style}">${inner}</svg>`;
};
const art = (name, size = 40, style = '') => `<img src="file://${ROOT}/icons/topics/${name}.webp" width="${size}" height="${size}" style="flex:none;object-fit:contain;${style}">`;
const pic = (file, size = 40, style = '') => `<img src="file://${ROOT}/icons/${file}" width="${size}" height="${size}" style="flex:none;object-fit:contain;${style}">`;
const ava = (name, size = 40, ring = '#8b5cf6') => `<span style="flex:none;width:${size}px;height:${size}px;border-radius:50%;background:${ring};display:inline-flex;align-items:center;justify-content:center;overflow:hidden"><img src="file://${ROOT}/icons/avatars/${name}.webp" width="${size}" height="${size}" style="object-fit:cover"></span>`;
const TOPICS = [
    ['zemepis', 'Zeměpis', '#0f6b4f'], ['vlajky', 'Vlajky', '#2a48c9'], ['historie', 'Historie', '#a9480e'], ['mytologie', 'Mytologie', '#4c2aa8'],
    ['biologie', 'Biologie', '#3f7a1c'], ['geologie', 'Geologie', '#8a4b0c'], ['chemie', 'Chemie', '#1766b5'], ['fyzika', 'Fyzika', '#6d28c9'],
    ['umeni', 'Umění', '#b53317'], ['architektura', 'Architektura', '#3f3d3a'], ['hudba', 'Hudba', '#b5154f'], ['literatura', 'Literatura', '#17717a'],
    ['film', 'Film', '#ad123a'], ['sport', 'Sport', '#9c1c1c']
];
const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0e0f10;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f7f6f3;-webkit-font-smoothing:antialiased}
.sheet{padding:28px 28px 30px;width:1236px}
.head{display:flex;align-items:center;gap:16px;margin-bottom:6px}
.num{width:54px;height:54px;border-radius:16px;background:linear-gradient(180deg,#a3304f,#7a1f3a);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900}
.head h1{font-size:34px;font-weight:900;letter-spacing:-.01em}
.lead{font-size:19px;color:#c9c6c0;margin:4px 0 20px;line-height:1.4;max-width:1150px}
.phones{display:flex;gap:30px}
.col{width:372px}
.cap{font-size:17px;font-weight:800;color:#efc55c;margin-bottom:10px;display:flex;gap:8px;align-items:center}
.cap small{font-weight:600;color:#9d9a95;font-size:14px}
.phone{width:372px;height:780px;border-radius:38px;border:6px solid #000;background:#1c1e20;overflow:hidden;display:flex;flex-direction:column;position:relative}
.pad{padding:14px 14px 0;flex:1;display:flex;flex-direction:column;gap:10px;min-height:0}
.hdr{display:flex;align-items:center;gap:10px;padding:14px 14px 10px;border-bottom:1px solid #2d3034}
.hdr .t{font-weight:900;font-size:17px;color:#fee2b0;line-height:1.1}
.hdr .s{font-size:12px;color:#9d9a95;font-weight:700}
.bar{height:5px;border-radius:3px;background:#41454a;overflow:hidden;margin-top:4px;width:120px}
.bar i{display:block;height:100%;background:#e8ae38;border-radius:3px}
.chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#2d3034;border:1px solid #41454a;padding:5px 10px;font-size:12.5px;font-weight:800;color:#e1dfda}
.chip.gold{background:#3b2a12;border-color:#94571a;color:#f5dc93}
.card{background:#2a2d31;border:1px solid #3a3e43;border-radius:20px;padding:12px}
.row{display:flex;align-items:center;gap:12px;background:#2a2d31;border:1px solid #3a3e43;border-radius:18px;padding:11px 12px;min-height:62px}
.row .tt{font-weight:800;font-size:15.5px;line-height:1.15}
.row .ss{font-size:12.5px;color:#9d9a95;font-weight:600;margin-top:2px;line-height:1.2}
.row .grow{flex:1;min-width:0}
.row.hot{border-color:#b9771b;background:linear-gradient(90deg,#33270f,#2a2d31 70%)}
.row.done{opacity:.62}
.chev{color:#686a6e}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:14px;font-weight:900;font-size:14.5px;padding:10px 14px;white-space:nowrap}
.btn.pri{background:linear-gradient(180deg,#a3304f,#7a1f3a);color:#fff;box-shadow:0 3px 0 #561328}
.btn.gold{background:linear-gradient(180deg,#efc55c,#d69725);color:#3b1e0a;box-shadow:0 3px 0 #94571a}
.btn.ghost{background:#33373c;color:#e1dfda;border:1px solid #4a4e54}
.sec{font-size:11.5px;font-weight:900;letter-spacing:.12em;color:#9d9a95;text-transform:uppercase;margin:4px 2px -2px;display:flex;align-items:center;gap:7px}
.dot{width:8px;height:8px;border-radius:50%;background:#e8ae38;display:inline-block}
.bdg{min-width:19px;height:19px;border-radius:999px;background:#e8ae38;color:#3b1e0a;font-size:11.5px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}
.ok{color:#34d399}
.nav{display:flex;border-top:1px solid #2d3034;background:#17181a;padding:8px 6px 14px;margin-top:auto}
.nav div{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-weight:800;color:#8a8782;position:relative}
.nav div.on{color:#fff}
.nav div.on .pill{background:linear-gradient(180deg,#a3304f,#7a1f3a);color:#fff}
.nav .pill{width:52px;height:32px;border-radius:14px;display:flex;align-items:center;justify-content:center}
.nav .bdg{position:absolute;top:-3px;left:calc(50% + 12px)}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.tile{border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900;font-size:12px;color:#fff;padding:8px 4px;text-align:center;line-height:1.1}
.big{border-radius:22px;background:#2a2d31;border:1px solid #3a3e43;padding:14px 12px;display:flex;flex-direction:column;gap:6px;position:relative;min-height:124px}
.big .tt{font-weight:900;font-size:17px}
.big .ss{font-size:12.5px;color:#9d9a95;font-weight:700;line-height:1.25}
.big .bdg{position:absolute;top:10px;right:10px}
`;
const hdr = ({ extra = '' } = {}) => `<div class="hdr">${pic('logo.webp', 44)}<div style="flex:1"><div class="t">Mudrlant</div><div class="s">Úr. 15 · Zasvěcenec</div><div class="bar"><i style="width:82%"></i></div></div>${extra}${ava('krecek', 42, '#d946ef')}</div>`;
const nav = (items, on) => `<div class="nav">${items.map(([icon, label, badge], i) => `<div class="${i === on ? 'on' : ''}"><span class="pill">${ic(icon, 21)}</span>${label}${badge ? `<span class="bdg">${badge}</span>` : ''}</div>`).join('')}</div>`;
const row = ({ img, title, sub, right = `<span class="chev">${ic('chevron-right', 20)}</span>`, cls = '' }) => `<div class="row ${cls}">${img}<div class="grow"><div class="tt">${title}</div>${sub ? `<div class="ss">${sub}</div>` : ''}</div>${right}</div>`;
const play = (text = 'Hrát', kind = 'gold') => `<span class="btn ${kind}">${ic('play', 15)}${text}</span>`;
const check = `<span class="ok">${ic('circle-check', 24)}</span>`;
const topicGrid = (size = 34, h = 74, font = 11.5) => `<div class="grid4">${TOPICS.map(([id, name, color]) => `<div class="tile" style="background:${color};height:${h}px;font-size:${font}px">${art(id, size)}${name}</div>`).join('')}</div>`;
const friends = `<div style="display:flex;gap:10px;align-items:center">${ava('liska', 44, '#f59e0b')}${ava('axolot', 44, '#8b5cf6')}${ava('panda', 44, '#10b981')}<span style="width:44px;height:44px;border-radius:50%;border:2px dashed #585b60;display:flex;align-items:center;justify-content:center;color:#9d9a95">${ic('user-plus', 20)}</span><span style="margin-left:auto" class="chip"><span class="dot" style="background:#34d399"></span>2 online</span></div>`;
const phone = (caption, small, body) => `<div class="col"><div class="cap">${caption}<small>${small || ''}</small></div><div class="phone">${body}</div></div>`;

// ---------- 1. Spodní lišta ----------
const NAV1 = [['calendar-check', 'Dnes'], ['gamepad-2', 'Hrát'], ['swords', 'Soupeři', 2], ['trophy', 'Postup'], ['user-round', 'Já']];
const phones = [
    phone('Dnes', '· to, co se dá dnes splnit', `${hdr({ extra: `<span class="chip gold">${ic('flame', 14)}12 dní</span>` })}<div class="pad">
        <div class="sec">Dnešní výzvy · 1/4 hotovo</div>
        ${row({ img: art('stopky', 40), title: 'Kvíz dne', sub: '8/10 · 30 bodů', right: check, cls: 'done' })}
        ${row({ img: art('retezovka', 40), title: 'Řetězovka', sub: '7 článků, každý navazuje', right: play(), cls: 'hot' })}
        ${row({ img: art('sova-dalekohled', 40), title: 'Tajemná otázka', sub: 'Nápověda 4/8 · další ve 13:00', right: play('Hádat', 'ghost') })}
        ${row({ img: art('boss-kapitan', 40), title: 'Boss týdne', sub: 'Zbývají 3 pokusy', right: play('Souboj', 'ghost') })}
        <div class="sec">Dnešní otázky</div>
        <div class="card" style="display:flex;align-items:center;gap:12px">${art('dnes', 42)}<div style="flex:1"><div style="font-weight:800;font-size:15.5px">0/14 témat</div><div class="bar" style="width:100%"><i style="width:4%"></i></div></div>${play('Hrát vše', 'pri')}</div>
        ${row({ img: art('truhla', 38), title: 'Truhla Mudrlanta čeká', right: `<span class="btn gold">Otevřít</span>`, cls: 'hot' })}
    </div>${nav(NAV1, 0)}`),
    phone('Hrát', '· volná hra podle chuti', `${hdr()}<div class="pad">
        <div class="tile" style="background:linear-gradient(135deg,#8a2742,#5a1a2e);height:66px;flex-direction:row;gap:12px;font-size:20px">${art('mix', 44)}Mix všech témat</div>
        ${topicGrid(32, 70, 11)}
        <div class="sec">Režimy</div>
        <div class="grid4">${[['rezim-bleskovka', 'Bleskovka'], ['rezim-preziti', 'Přežití'], ['rezim-mapa', 'Na mapě'], ['ucit-procvicit', 'Učení']].map(([a, l]) => `<div class="tile" style="background:#2a2d31;border:1px solid #3a3e43;height:74px">${art(a, 36)}${l}</div>`).join('')}</div>
    </div>${nav(NAV1, 1)}`),
    phone('Soupeři', '· čtyři dveře místo jedné dlouhé stránky', `${hdr()}<div class="pad">
        <div class="sec"><span class="dot"></span>Čeká na tebe</div>
        ${row({ img: ava('liska', 40, '#f59e0b'), title: 'Marušík tě vyzývá', sub: 'Historie · 10 otázek', right: play(), cls: 'hot' })}
        <div class="grid2" style="margin-top:2px">
            <div class="big">${art('vyzva', 46)}<div class="tt">Výzvy</div><div class="ss">Vyzvat přítele, náhodný soupeř, kód</div><span class="bdg">1</span></div>
            <div class="big">${art('dobyvani', 46)}<div class="tt">Dobývání</div><div class="ss">Evropa · jsi na tahu</div><span class="bdg">1</span></div>
            <div class="big">${art('turnaj', 46)}<div class="tt">Turnaje</div><div class="ss">Přihlášen na 16. 11. · hlasování o tématu</div></div>
            <div class="big">${art('skupiny', 46)}<div class="tt">Skupiny</div><div class="ss">3 skupiny · žebříčky</div></div>
        </div>
        <div class="sec">Přátelé · 3</div>${friends}
    </div>${nav(NAV1, 2)}`)
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet">
<div class="head"><div class="num">1</div><h1>Spodní lišta s pěti záložkami</h1></div><p class="lead">Dole je pořád vidět pět míst a každé má jednu jasnou náplň. Na žádné obrazovce není víc než pár bloků, podrobnosti se otevírají až po klepnutí.</p>
<div class="phones">${phones.join('')}</div></div></body></html>`;
fs.writeFileSync(path.join(OUT, 'navrh-1-spodni-lista.html'), html);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1236, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(`file://${path.join(OUT, 'navrh-1-spodni-lista.html')}`);
await page.waitForLoadState('networkidle');
await page.locator('.sheet').screenshot({ path: path.join(OUT, 'navrh-1-spodni-lista.png') });
await browser.close();
