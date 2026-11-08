// Sdílení výsledků: text (navigator.share, jinak schránka) a obrázek PNG nakreslený na plátno (sova v barvě obleku hráče, skóre, mřížka
// otázek, datum a adresa hry). Obrázek se sdílí jako soubor přes navigator.share({ files }), kde to prohlížeč umí, jinak se stáhne.
// Plátno kreslí jen obrázky z vlastního původu (icons/…), takže není „zašpiněné“ a jde z něj vyrobit PNG. Používá ho Kvíz dne,
// výsledek dnešní otázky a vyhraná výzva (app.js). Čistá část (rozložení karty, názvy obrázků, text) se testuje v tests/share-card.test.js.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantShareCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const SIZE = 1080;
    const PAD = 72;
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const ROBES = ['vinova', 'zelena', 'modra', 'ruzova', 'fialova', 'cerna', 'zlata'];
    const POSES = ['vitez', 'oslava', 'radost', 'premysleni', 'smutek', 'prohra', 'serie', 'vitej', 'vyzva'];
    // Barvy aplikace: zlatá (gold-300), krémová (cream), správně / špatně (emerald-400, rose-400)
    const COLORS = { gold: '#efc55c', cream: '#fee2b0', right: '#34d399', wrong: '#fb7185', empty: 'rgba(255,255,255,0.22)' };
    // Výchozí vínové téma (brand-600 a brand-900 v src/input.css), když se barvy tématu nedají přečíst
    const BRAND = { top: 'rgb(159, 50, 86)', bottom: 'rgb(92, 26, 47)' };

    // --- Text ---
    // Jedno sdílení textu pro celou aplikaci: systémové sdílení, při jeho nedostupnosti (nebo chybě) zkopírování do schránky s hláškou.
    // Vrací 'shared', 'aborted' (hráč sdílení zavřel), 'copied' nebo 'failed'.
    const shareText = async ({ title = '', text = '', url = '' }, { toast = () => {}, copied = 'Zkopírováno do schránky', failed = 'Sdílení se nepodařilo', clipboardText = '' } = {}) => {
        const nav = root.navigator;
        if (nav && typeof nav.share === 'function') {
            try {
                await nav.share({ ...(title ? { title } : {}), text, ...(url ? { url } : {}) });
                return 'shared';
            } catch (error) {
                if (error && error.name === 'AbortError') return 'aborted';
                // jiná chyba (prohlížeč sdílení odmítl): zkusí se schránka
            }
        }
        try {
            await nav.clipboard.writeText(clipboardText || [text, url].filter(Boolean).join('\n'));
            toast(copied);
            return 'copied';
        } catch (error) {
            toast(failed);
            return 'failed';
        }
    };

    // --- Obrázek: čistá část ---
    const robeOf = (robe) => (ROBES.includes(robe) ? robe : 'vinova');
    const suffix = (robe) => (robeOf(robe) === 'vinova' ? '' : `-${robeOf(robe)}`);
    // Sova v barvě obleku (předpřipravené varianty, scripts/owl-robes.py) a logo
    const owlSrc = (pose, robe) => `icons/topics/sova-${POSES.includes(pose) ? pose : 'radost'}${suffix(robe)}.webp`;
    const logoSrc = (robe) => `icons/logo${suffix(robe)}.webp`;
    // „8. 11. 2026“
    const formatDay = (day) => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}` : ''; };
    // Adresa bez https:// a koncového lomítka (na obrázku se nedá klepnout, má se dát přečíst)
    const shortUrl = (url) => String(url || '').replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/(index\.html)?$/, '');
    // Mřížka otázek: čtverce v jedné řadě (do 10), jinak ve dvou; velikost tak, aby se vešly do šířky karty
    const gridLayout = (count, width = SIZE - 2 * PAD) => {
        if (!count) return null;
        const rows = count > 10 ? 2 : 1;
        const perRow = Math.ceil(count / rows);
        const gap = 14;
        const size = Math.min(80, Math.floor((width - gap * (perRow - 1)) / perRow));
        return { rows, perRow, gap, size, width: perRow * size + (perRow - 1) * gap, height: rows * size + (rows - 1) * gap };
    };
    // Co se na kartu nakreslí: input = { kicker, headline, detail, note, grid (true/false/null po otázkách nebo null), day, robe, pose, url, appName }
    const cardModel = (input) => ({
        appName: String(input.appName || 'Mudrlant'),
        kicker: String(input.kicker || '').toUpperCase(),
        headline: String(input.headline || ''),
        detail: String(input.detail || ''),
        note: String(input.note || ''),
        date: formatDay(input.day),
        grid: Array.isArray(input.grid) && input.grid.length ? input.grid.map(bit => (bit === true ? 'right' : bit === false ? 'wrong' : 'empty')) : null,
        layout: gridLayout(Array.isArray(input.grid) ? input.grid.length : 0),
        owl: owlSrc(input.pose, input.robe),
        logo: logoSrc(input.robe),
        url: shortUrl(input.url),
        footer: input.url ? `Zahraj si taky: ${shortUrl(input.url)}` : ''
    });
    const fileName = (kind, day) => `mudrlant-${String(kind || 'vysledek').replace(/[^a-z0-9-]/g, '')}${day ? `-${day}` : ''}.png`;

    // --- Obrázek: kreslení (jen v prohlížeči) ---
    const loadImage = (src) => new Promise(resolve => {
        const image = new root.Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
    // Barvy tématu hráče (data-theme na <html>, proměnné --brand-600 a --brand-900)
    const brandColors = () => {
        try {
            const style = root.getComputedStyle(root.document.documentElement);
            const read = (name) => { const value = style.getPropertyValue(name).trim(); return /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(value) ? `rgb(${value.split(/\s+/).join(', ')})` : null; };
            return { top: read('--brand-600') || BRAND.top, bottom: read('--brand-900') || BRAND.bottom };
        } catch (error) { return BRAND; }
    };
    const roundRect = (ctx, x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };
    // Písmo se zmenší, dokud se text nevejde do šířky
    const fitFont = (ctx, text, weight, size, maxWidth, min = 24) => {
        let current = size;
        ctx.font = `${weight} ${current}px ${FONT}`;
        while (current > min && ctx.measureText(text).width > maxWidth) {
            current -= 4;
            ctx.font = `${weight} ${current}px ${FONT}`;
        }
        return current;
    };
    const draw = (canvas, model, images, colors) => {
        const ctx = canvas.getContext('2d');
        // Pozadí: přechod barvy tématu (jako karta výsledku v aplikaci) a jemné tečky jako pozadí aplikace
        const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE);
        gradient.addColorStop(0, colors.top);
        gradient.addColorStop(1, colors.bottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let y = 18; y < SIZE; y += 36) for (let x = 18; x < SIZE; x += 36) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
        // Záře za sovou
        const glow = ctx.createRadialGradient(290, 470, 40, 290, 470, 330);
        glow.addColorStop(0, 'rgba(239, 197, 92, 0.35)');
        glow.addColorStop(1, 'rgba(239, 197, 92, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 140, 640, 660);

        ctx.textBaseline = 'alphabetic';
        // Hlavička: logo, název hry, datum
        if (images.logo) ctx.drawImage(images.logo, PAD - 6, PAD - 14, 84, 84 * (images.logo.height / images.logo.width || 1));
        ctx.fillStyle = COLORS.cream;
        ctx.textAlign = 'left';
        ctx.font = `900 60px ${FONT}`;
        ctx.fillText(model.appName, PAD + 92, PAD + 52);
        if (model.date) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.textAlign = 'right';
            ctx.font = `700 40px ${FONT}`;
            ctx.fillText(model.date, SIZE - PAD, PAD + 48);
        }

        // Sova vlevo, skóre vpravo
        const owlBox = 440;
        if (images.owl) {
            const ratio = images.owl.width / images.owl.height || 1;
            const w = ratio >= 1 ? owlBox : owlBox * ratio;
            const h = ratio >= 1 ? owlBox / ratio : owlBox;
            ctx.drawImage(images.owl, PAD - 10 + (owlBox - w) / 2, 210 + (owlBox - h) / 2, w, h);
        }
        const textX = PAD + owlBox + 24;
        const textWidth = SIZE - PAD - textX;
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.gold;
        fitFont(ctx, model.kicker, 900, 46, textWidth);
        ctx.fillText(model.kicker, textX, 330);
        ctx.fillStyle = '#ffffff';
        const headlineSize = fitFont(ctx, model.headline, 900, 200, textWidth, 60);
        ctx.fillText(model.headline, textX, 330 + 30 + headlineSize * 0.8);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        fitFont(ctx, model.detail, 700, 46, textWidth);
        ctx.fillText(model.detail, textX, 330 + 30 + headlineSize * 0.8 + 76);

        // Mřížka otázek pod tím, uprostřed
        let y = 700;
        if (model.grid && model.layout) {
            const { perRow, gap, size, width } = model.layout;
            const left = (SIZE - width) / 2;
            model.grid.forEach((tone, index) => {
                const row = Math.floor(index / perRow);
                const col = index % perRow;
                ctx.fillStyle = COLORS[tone];
                roundRect(ctx, left + col * (size + gap), y + row * (size + gap), size, size, Math.round(size / 5));
                ctx.fill();
            });
            y += model.layout.height + 64;
        } else y += 40;
        if (model.note) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            fitFont(ctx, model.note, 700, 42, SIZE - 2 * PAD);
            ctx.fillText(model.note, SIZE / 2, y);
        }

        // Pata: kde se dá hrát
        if (model.footer) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            roundRect(ctx, PAD - 16, SIZE - PAD - 76, SIZE - 2 * PAD + 32, 92, 30);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = COLORS.cream;
            fitFont(ctx, model.footer, 700, 36, SIZE - 2 * PAD - 20);
            ctx.fillText(model.footer, SIZE / 2, SIZE - PAD - 18);
        }
    };
    // Nakreslí kartu a vrátí plátno (1080 × 1080)
    const render = async (input) => {
        const model = cardModel(input);
        const [owl, logo] = await Promise.all([loadImage(model.owl), loadImage(model.logo)]);
        const canvas = root.document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        draw(canvas, model, { owl, logo }, brandColors());
        // Které obrázky se opravdu nakreslily (kontrola v testech; obrázek, který se nenačetl, na kartě prostě chybí)
        canvas.dataset.owl = owl ? model.owl : '';
        canvas.dataset.logo = logo ? model.logo : '';
        return canvas;
    };
    const toBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG se nepodařilo vytvořit'))), 'image/png'));
    const download = (blob, name) => {
        const url = root.URL.createObjectURL(blob);
        const link = root.document.createElement('a');
        link.href = url;
        link.download = name;
        root.document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => root.URL.revokeObjectURL(url), 4000);
    };
    // Obrázek se připraví dopředu (při zobrazení výsledku), aby klepnutí na „Sdílet obrázek“ mohlo sdílet hned:
    // některé prohlížeče (Safari) sdílení povolí jen bezprostředně po klepnutí
    const prepared = new Map();
    const prepare = (input, name) => {
        const key = `${name}\u0000${JSON.stringify(input)}`;
        if (!prepared.has(key)) {
            const entry = { blob: null, file: null, promise: null };
            entry.promise = render(input).then(toBlob).then(blob => {
                entry.blob = blob;
                try { entry.file = new root.File([blob], name, { type: 'image/png' }); } catch (error) { entry.file = null; }
                return entry;
            });
            entry.promise.catch(() => prepared.delete(key));
            prepared.set(key, entry);
            if (prepared.size > 6) prepared.delete(prepared.keys().next().value);
        }
        return prepared.get(key);
    };
    // Sdílení obrázku: soubor přes systémové sdílení (canShare), jinak stažení; vrací 'shared', 'aborted', 'downloaded' nebo 'failed'
    const shareImage = async (input, { name = fileName('vysledek', input.day), title = '', text = '', toast = () => {} } = {}) => {
        const entry = prepare(input, name);
        try {
            if (!entry.blob) await entry.promise;
        } catch (error) {
            toast('Obrázek se nepodařilo vytvořit');
            return 'failed';
        }
        const nav = root.navigator;
        const files = entry.file ? [entry.file] : null;
        if (files && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files })) {
            try {
                await nav.share({ files, ...(title ? { title } : {}), ...(text ? { text } : {}) });
                return 'shared';
            } catch (error) {
                if (error && error.name === 'AbortError') return 'aborted';
                // sdílení souboru odmítnuto (třeba po vypršení klepnutí): obrázek se stáhne
            }
        }
        try {
            download(entry.blob, name);
            toast('Obrázek je uložený ve stažených souborech');
            return 'downloaded';
        } catch (error) {
            toast('Obrázek se nepodařilo uložit');
            return 'failed';
        }
    };

    return { SIZE, ROBES, POSES, COLORS, shareText, robeOf, owlSrc, logoSrc, formatDay, shortUrl, gridLayout, cardModel, fileName, render, prepare, shareImage };
});
