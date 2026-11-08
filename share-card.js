// Sdílení výsledků: text (navigator.share, jinak schránka) a obrázek PNG nakreslený na plátno (sova v barvě obleku hráče, skóre, mřížka
// otázek, datum a adresa hry). Obrázek se sdílí jako soubor přes navigator.share({ files }), kde to prohlížeč umí, jinak se stáhne.
// Plátno kreslí jen obrázky z vlastního původu (icons/…), takže není „zašpiněné“ a jde z něj vyrobit PNG. Používá ho Kvíz dne,
// výsledek dnešní otázky, vyhraná výzva, Bleskovka a Přežití a diplom za mistrovství tématu (app.js). Čistá část (rozložení karty, názvy obrázků, text) se testuje v tests/share-card.test.js.
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
    // --- Diplom za mistrovství tématu (kind: 'diploma'): krémový list 1080 × 1350 (4 : 5) s rámem v barvě tématu, ikona tématu,
    // „Mistr zeměpisu“, jméno hráče, sova v barvě obleku, pečeť a datum ---
    const DIPLOMA = { width: 1080, height: 1350 };
    // Barvy témat (Tailwind 700 a 900 podle topic.color)
    const TOPIC_COLORS = {
        emerald: ['#047857', '#064e3b'], blue: ['#1d4ed8', '#1e3a8a'], amber: ['#b45309', '#78350f'], indigo: ['#4338ca', '#312e81'], lime: ['#4d7c0f', '#365314'],
        yellow: ['#a16207', '#713f12'], sky: ['#0369a1', '#0c4a6e'], violet: ['#6d28d9', '#4c1d95'], orange: ['#c2410c', '#7c2d12'], stone: ['#57534e', '#292524'],
        pink: ['#be185d', '#831843'], teal: ['#0f766e', '#134e4a'], rose: ['#be123c', '#881337'], red: ['#b91c1c', '#7f1d1d']
    };
    const TOPIC_ID = /^[a-z0-9-]{1,30}$/;
    // input = { kind: 'diploma', topic: { id, title, color }, title ('Mistr zeměpisu'), name, day, known (počet položek), robe, url, appName }
    const diplomaModel = (input) => {
        const topic = input.topic || {};
        const [main, dark] = TOPIC_COLORS[topic.color] || TOPIC_COLORS.emerald;
        return {
            kind: 'diploma', appName: String(input.appName || 'Mudrlant'), title: String(input.title || 'Mistr oboru'),
            name: String(input.name || '').trim().slice(0, 30) || 'Hráč Mudrlanta', topicTitle: String(topic.title || ''),
            detail: input.known ? `${Number(input.known).toLocaleString('cs-CZ')} poznaných položek` : 'Plné mistrovství tématu',
            date: formatDay(input.day), main, dark,
            icon: TOPIC_ID.test(String(topic.id || '')) ? `icons/topics/${topic.id}.webp` : null,
            owl: owlSrc('vitez', input.robe), logo: logoSrc(input.robe),
            footer: input.url ? shortUrl(input.url) : ''
        };
    };
    const star = (ctx, x, y, r) => {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = -Math.PI / 2 + i * Math.PI / 5;
            const radius = i % 2 ? r * 0.45 : r;
            ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
        }
        ctx.closePath();
        ctx.fill();
    };
    const drawDiploma = (canvas, model, images) => {
        const { width: W, height: H } = DIPLOMA;
        const ctx = canvas.getContext('2d');
        // List: krémový papír s jemným přechodem
        const paper = ctx.createLinearGradient(0, 0, 0, H);
        paper.addColorStop(0, '#fffaf0');
        paper.addColorStop(1, '#fbecc8');
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, W, H);
        // Rám: silný v barvě tématu, uvnitř tenký zlatý, v rozích zlaté kosočtverce
        ctx.lineJoin = 'round';
        ctx.strokeStyle = model.main;
        ctx.lineWidth = 26;
        roundRect(ctx, 34, 34, W - 68, H - 68, 36);
        ctx.stroke();
        ctx.strokeStyle = '#d69725';
        ctx.lineWidth = 6;
        roundRect(ctx, 66, 66, W - 132, H - 132, 24);
        ctx.stroke();
        ctx.fillStyle = '#d69725';
        for (const [x, y] of [[66, 66], [W - 66, 66], [66, H - 66], [W - 66, H - 66]]) {
            ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 22); ctx.lineTo(x - 22, y); ctx.closePath(); ctx.fill();
        }
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'center';
        // Hlavička: logo a název hry, nápis DIPLOM
        if (images.logo) ctx.drawImage(images.logo, W / 2 - 46, 104, 92, 92 * (images.logo.height / images.logo.width || 1));
        ctx.fillStyle = model.dark;
        ctx.font = `800 34px ${FONT}`;
        ctx.fillText(model.appName.toUpperCase().split('').join(' '), W / 2, 238);
        ctx.fillStyle = '#94571a';
        ctx.font = `900 110px Georgia, "Times New Roman", serif`;
        ctx.fillText('DIPLOM', W / 2, 360);
        ctx.fillStyle = '#5c4a32';
        ctx.font = `600 36px ${FONT}`;
        ctx.fillText(`za mistrovství tématu ${model.topicTitle}`.trim(), W / 2, 418);
        // Ikona tématu v kruhu barvy tématu
        const cy = 560;
        ctx.fillStyle = model.main;
        ctx.beginPath(); ctx.arc(W / 2, cy, 104, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#efc55c';
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(W / 2, cy, 104, 0, Math.PI * 2); ctx.stroke();
        if (images.icon) {
            const ratio = images.icon.width / images.icon.height || 1;
            const box = 150;
            const w = ratio >= 1 ? box : box * ratio;
            const h = ratio >= 1 ? box / ratio : box;
            ctx.drawImage(images.icon, W / 2 - w / 2, cy - h / 2, w, h);
        }
        // Hvězdičky mistrovství
        ctx.fillStyle = '#d69725';
        for (let i = 0; i < 5; i++) star(ctx, W / 2 + (i - 2) * 64, 718, 24);
        // Titul a jméno
        ctx.fillStyle = model.main;
        fitFont(ctx, model.title, 900, 96, W - 220, 48);
        ctx.fillText(model.title, W / 2, 850);
        ctx.fillStyle = '#5c4a32';
        ctx.font = `600 34px ${FONT}`;
        ctx.fillText('Tento diplom získává', W / 2, 920);
        ctx.fillStyle = '#2d3034';
        fitFont(ctx, model.name, 800, 76, W - 240, 36);
        ctx.fillText(model.name, W / 2, 1006);
        ctx.strokeStyle = 'rgba(148, 87, 26, 0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(250, 1032); ctx.lineTo(W - 250, 1032); ctx.stroke();
        ctx.fillStyle = '#5c4a32';
        // Detail jen ve středním sloupci, ať se nepotká se sovou vlevo a pečetí vpravo
        fitFont(ctx, model.detail, 600, 28, 470, 18);
        ctx.fillText(model.detail, W / 2, 1080);
        // Sova vlevo dole, pečeť vpravo dole, datum a adresa uprostřed
        if (images.owl) {
            const ratio = images.owl.width / images.owl.height || 1;
            const box = 200;
            const w = ratio >= 1 ? box : box * ratio;
            const h = ratio >= 1 ? box / ratio : box;
            ctx.drawImage(images.owl, 92 + (box - w) / 2, H - 92 - h, w, h);
        }
        const sx = W - 186;
        const sy = H - 196;
        ctx.fillStyle = '#d69725';
        for (let i = 0; i < 24; i++) {
            const angle = i * Math.PI / 12;
            ctx.beginPath();
            ctx.arc(sx + Math.cos(angle) * 70, sy + Math.sin(angle) * 70, 12, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath(); ctx.arc(sx, sy, 72, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#efc55c';
        ctx.beginPath(); ctx.arc(sx, sy, 55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#94571a';
        star(ctx, sx, sy - 3, 34);
        ctx.fillStyle = '#5c4a32';
        ctx.font = `700 34px ${FONT}`;
        if (model.date) ctx.fillText(model.date, W / 2, H - 170);
        if (model.footer) {
            ctx.fillStyle = 'rgba(92, 74, 50, 0.75)';
            ctx.font = `600 28px ${FONT}`;
            ctx.fillText(model.footer, W / 2, H - 124);
        }
    };
    // Nakreslí kartu a vrátí plátno (1080 × 1080; diplom 1080 × 1350)
    const render = async (input) => {
        if (input && input.kind === 'diploma') {
            const model = diplomaModel(input);
            const [owl, logo, icon] = await Promise.all([loadImage(model.owl), loadImage(model.logo), model.icon ? loadImage(model.icon) : Promise.resolve(null)]);
            const canvas = root.document.createElement('canvas');
            canvas.width = DIPLOMA.width;
            canvas.height = DIPLOMA.height;
            drawDiploma(canvas, model, { owl, logo, icon });
            canvas.dataset.owl = owl ? model.owl : '';
            canvas.dataset.icon = icon ? model.icon : '';
            return canvas;
        }
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

    // Jen stažení obrázku (tlačítko Stáhnout u diplomu): 'downloaded' nebo 'failed'
    const saveImage = async (input, { name = fileName('vysledek', input.day), toast = () => {} } = {}) => {
        try {
            const entry = prepare(input, name);
            if (!entry.blob) await entry.promise;
            download(entry.blob, name);
            toast('Obrázek je uložený ve stažených souborech');
            return 'downloaded';
        } catch (error) {
            toast('Obrázek se nepodařilo uložit');
            return 'failed';
        }
    };

    return { SIZE, DIPLOMA, TOPIC_COLORS, diplomaModel, saveImage, ROBES, POSES, COLORS, shareText, robeOf, owlSrc, logoSrc, formatDay, shortUrl, gridLayout, cardModel, fileName, render, prepare, shareImage };
});
