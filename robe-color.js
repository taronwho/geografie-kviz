// Vlastní barva obleku Mudrlanta (odměna za úroveň 20, look.js robe 'vlastni'): hráč zvolí odstín a světlost a sova se přebarví přímo
// v prohlížeči. Stejný postup jako scripts/owl-robes.py, který vyrábí předpřipravené taláry: z vínového obrázku (icons/logo.webp,
// icons/topics/sova-*.webp) se vybere vínová/červená oblast (talár, čepice, tmavě vínové čáry) s měkkým přechodem na okrajích, světlý
// růžový jazyk zůstane, a vybrané pixely dostanou nový odstín se stejnou sytostí a jasem (× světlost). Stínování a obrys tak zůstanou.
// Barva je text 'odstín.světlost' (odstín 0–355 po 5°, světlost −40 … +40 % po 5), look.js cleanRobeColor.
// recolorPixels je čistá funkce (testy v Node); tint() v prohlížeči přebarví obrázek na plátně a vrátí adresu blob: (CSP img-src blob:),
// výsledky se pamatují. Napojení: look-robes.js (obrázky sovy na stránce), look-owl.js (cizí sova: data-robe-color), share-card.js.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantRobeColor = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const COLOR = /^(\d{1,3})\.(-?\d{1,2})$/;
    const DEFAULT = '185.0';
    // 'odstín.světlost' → { hue, light } nebo null
    const parse = (text) => {
        const m = COLOR.exec(String(text || ''));
        if (!m) return null;
        const hue = Number(m[1]);
        const light = Number(m[2]);
        return hue <= 355 && hue % 5 === 0 && light >= -40 && light <= 40 && light % 5 === 0 ? { hue, light } : null;
    };
    const format = ({ hue, light }) => {
        const h = ((Math.round(Number(hue) / 5) * 5) % 360 + 360) % 360;
        const l = Math.max(-40, Math.min(40, Math.round(Number(light) / 5) * 5)) || 0;
        return `${h}.${l}`;
    };
    const clean = (text) => (parse(text) ? format(parse(text)) : null);
    // Barva → nastavení přebarvení: cílový odstín, násobek sytosti (u krajní světlosti trochu méně, ať tmavá není špinavá a světlá křiklavá)
    // a násobek jasu
    const specOf = (text) => {
        const c = parse(text) || parse(DEFAULT);
        return { hue: c.hue, sat: 1 - Math.abs(c.light) / 200, val: 1 + c.light / 100 };
    };
    // Náhled barvy (puntík u posuvníku): RGB taláru ve střední ploše (jas 0,52 a sytost 0,7 jako vínový talár)
    const clip = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const hsvToRgb = (h, s, v) => {
        const hh = (((h % 360) + 360) % 360) / 60;
        const c = v * s;
        const x = c * (1 - Math.abs((hh % 2) - 1));
        const m = v - c;
        const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
        return [r + m, g + m, b + m];
    };
    const swatch = (text) => {
        const spec = specOf(text);
        const rgb = hsvToRgb(spec.hue, clip(0.7 * spec.sat), clip(0.52 * spec.val)).map(value => Math.round(value * 255));
        return `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;
    };
    // Sova titulu Mudrlant (sova-titul-11) sedí v odznaku s purpurovou mlhovinou a červenými drahokamy: přebarví se jen uvnitř obdélníků
    // s čepicí a talárem, drahokamy v nich zůstanou (stejné jako AREAS ve scripts/owl-robes.py, souřadnice obrázku 320 × 320)
    const AREAS = {
        'sova-titul-11': {
            in: [[116, 34, 207, 84], [97, 76, 229, 130], [74, 200, 100, 246], [98, 180, 128, 256], [108, 195, 214, 280], [190, 186, 254, 262]],
            out: [[137, 54, 150, 72], [174, 54, 188, 72], [156, 248, 169, 272]]
        }
    };
    const areaFor = (src) => { const m = /sova-(titul-\d+)\.webp$/.exec(String(src || '')); return m && AREAS[`sova-${m[1]}`] ? AREAS[`sova-${m[1]}`] : null; };
    const insideArea = (area, x, y, width, height) => {
        const sx = x * 320 / width;
        const sy = y * 320 / height;
        const hit = (rects) => rects.some(([x0, y0, x1, y1]) => sx >= x0 && sx < x1 && sy >= y0 && sy < y1);
        return hit(area.in) && !hit(area.out);
    };
    // Přebarvení pixelů RGBA (Uint8ClampedArray, na místě). Vrací počet změněných pixelů.
    const recolorPixels = (data, width, height, colorText, area = null) => {
        const spec = specOf(colorText);
        let changed = 0;
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            if (!data[i + 3]) continue;
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const mx = Math.max(r, g, b);
            const d = mx - Math.min(r, g, b);
            if (d < 1e-6) continue;
            let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
            const s = mx > 0 ? d / mx : 0;
            const v = mx;
            const hd = h > 180 ? h - 360 : h;
            // vínová/červená/purpurová: odstín −60 … 18°, dost sytá; měkký přechod na okrajích rozsahu
            let w = clip((hd + 60) / 15) * clip((18 - hd) / 8) * clip((s - 0.18) / 0.15);
            if (!w) continue;
            // světle červený až růžový jazyk a zobáček zůstanou
            w *= 1 - clip((v - 0.62) / 0.1) * clip((hd + 8) / 6);
            if (area && !insideArea(area, p % width, Math.floor(p / width), width, height)) w = 0;
            if (w <= 0) continue;
            const [nr, ng, nb] = hsvToRgb(spec.hue, clip(s * spec.sat), clip(v * spec.val));
            data[i] = Math.round((r * (1 - w) + nr * w) * 255);
            data[i + 1] = Math.round((g * (1 - w) + ng * w) * 255);
            data[i + 2] = Math.round((b * (1 - w) + nb * w) * 255);
            changed++;
        }
        return changed;
    };

    // --- Prohlížeč ---
    const cache = new Map();
    const loadImage = (src) => new Promise((resolve, reject) => {
        const image = new root.Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`obrázek ${src}`));
        image.src = src;
    });
    // Přebarvený obrázek (adresa blob:); bez plátna nebo při chybě původní adresa
    const tint = (src, colorText) => {
        const color = clean(colorText) || DEFAULT;
        const key = `${src}|${color}`;
        if (cache.has(key)) return cache.get(key);
        const work = (async () => {
            try {
                if (!root.document || !root.URL || !root.URL.createObjectURL) return src;
                const image = await loadImage(src);
                const canvas = root.document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) return src;
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                recolorPixels(pixels.data, canvas.width, canvas.height, color, areaFor(src));
                context.putImageData(pixels, 0, 0);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                return blob ? root.URL.createObjectURL(blob) : src;
            } catch (error) { return src; }
        })();
        cache.set(key, work);
        return work;
    };
    // Sdílecí obrázek (share-card.js): sova ve vínové barvě se přebarví, když hráč nosí vlastní barvu (current = barva, nebo null)
    let current = null;
    const setCurrent = (colorText) => { current = clean(colorText); };
    const OWL_FILE = /^icons\/(?:logo(?:-bez-monoklu)?|topics\/sova-[a-z0-9-]+?)\.webp$/;
    const forShare = (src) => (current && OWL_FILE.test(String(src || '')) ? tint(src, current) : Promise.resolve(src));

    return { DEFAULT, parse, format, clean, specOf, swatch, AREAS, areaFor, recolorPixels, tint, setCurrent, current: () => current, forShare };
});
