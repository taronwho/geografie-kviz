// Zdroj obrázku: malé „i“ u každého obrázku z Wikimedia Commons otevře okno s autorem, licencí a odkazem na soubor.
// Čistá logika bez DOMu (okno a tlačítko jsou v app.js): název souboru z adresy obrázku, dotaz na metadata Commons,
// očištění jejich HTML na prostý text a obsah okna. Před odpovědí okno neukáže nic, co by mohlo prozradit odpověď:
// název souboru, popis, název díla, autora (u obrazu je autor odpověď) ani odkaz na soubor – jen licenci a „Wikimedia Commons“.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantPhotoSource = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const API = 'https://commons.wikimedia.org/w/api.php';
    const TITLE = 'Zdroj obrázku';
    const LIMITS = { artist: 120, credit: 120, date: 60, description: 200, license: 60 };
    const TIMEOUT = 8000;

    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    // Název souboru z adresy náhledu (…/commons/thumb/a/ab/Soubor.jpg/500px-Soubor.jpg) nebo původního souboru (…/commons/a/ab/Soubor.jpg)
    const fileFromUrl = (url) => {
        const match = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(String(url || ''));
        if (!match) return null;
        try { return decodeURIComponent(match[1]).replace(/_/g, ' '); } catch (e) { return null; }
    };
    const pageUrl = (fileName) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(fileName).replace(/ /g, '_'))}`;
    const metadataUrl = (fileName) => `${API}?${new URLSearchParams({ action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: `File:${fileName}`, format: 'json', origin: '*' })}`;

    const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', middot: '·', deg: '°', times: '×', shy: '' };
    const fromCode = (code) => (Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) ? String.fromCodePoint(code) : '';
    const decodeEntities = (text) => String(text).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body) => {
        if (body[0] === '#') return fromCode(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10));
        const named = NAMED[body.toLowerCase()];
        return named === undefined ? whole : named;
    });
    const clip = (text, max) => text.length <= max ? text : `${text.slice(0, max - 1).replace(/[\s,;:.–-]+\S*$/, '').trimEnd() || text.slice(0, max - 1)}…`;
    // HTML z metadat Commons na prostý text: bez skrytých značek (date QS:…), skriptů a stylů, bez značek, s dekódovanými entitami
    // a jednou mezerou místo bílých znaků; nejvýš max znaků
    const cleanText = (html, max = 200) => {
        if (html === null || html === undefined) return '';
        let text = String(html)
            .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
            .replace(/<(span|div)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
            .replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, ' ')
            .replace(/<[^>]*>/g, '');
        // Dekódování až po odstranění značek: &lt;b&gt; zůstane textem, ne značkou
        text = decodeEntities(text).replace(/\s+/g, ' ').trim();
        return clip(text, max);
    };
    const safeUrl = (url) => {
        const value = String(url || '').trim().replace(/^\/\//, 'https://');
        return /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value.replace(/^http:/i, 'https:') : '';
    };

    // Odpověď API → { artist, credit, date, description, license, licenseUrl }; null, když soubor nemá metadata
    const parseMetadata = (json) => {
        const pages = json && json.query && json.query.pages;
        const page = pages && Object.values(pages)[0];
        const info = page && Array.isArray(page.imageinfo) && page.imageinfo[0];
        const meta = info && info.extmetadata;
        if (!meta) return null;
        const value = (key) => meta[key] && meta[key].value;
        return {
            artist: cleanText(value('Artist'), LIMITS.artist),
            credit: cleanText(value('Credit'), LIMITS.credit),
            date: cleanText(value('DateTimeOriginal'), LIMITS.date),
            description: cleanText(value('ImageDescription'), LIMITS.description) || cleanText(value('ObjectName'), LIMITS.description),
            license: cleanText(value('LicenseShortName'), LIMITS.license),
            licenseUrl: safeUrl(cleanText(value('LicenseUrl'), 300))
        };
    };

    // Metadata souboru (jednou za běh aplikace; nepovedený dotaz se příště zkusí znovu). Vrátí null bez sítě i při chybě.
    const createLoader = (fetchImpl, { timeout = TIMEOUT } = {}) => {
        const cache = new Map();
        return (fileName) => {
            if (!fileName) return Promise.resolve(null);
            if (cache.has(fileName)) return cache.get(fileName);
            let timer = null;
            const request = Promise.race([
                Promise.resolve().then(() => fetchImpl(metadataUrl(fileName))).then(response => {
                    if (!response || !response.ok) throw new Error(`Commons ${response ? response.status : '?'}`);
                    return response.json();
                }).then(parseMetadata),
                new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Commons neodpověděly')), timeout); })
            ]).catch(() => { cache.delete(fileName); return null; }).finally(() => clearTimeout(timer));
            cache.set(fileName, request);
            return request;
        };
    };

    // Obsah okna. status: 'loading' | 'ready' | 'failed'; answered = otázka je zodpovězená (výsledek, okno s popisem, atlas)
    const buildView = ({ fileName, meta = null, answered = false, status = 'ready' }) => {
        const rows = [];
        const known = status === 'ready' && meta ? meta : null;
        if (answered && known) {
            if (known.artist) rows.push({ key: 'artist', label: 'Autor', value: known.artist });
            if (known.date) rows.push({ key: 'date', label: 'Datum', value: known.date });
            if (known.description) rows.push({ key: 'description', label: 'Popis', value: known.description });
            if (known.credit && known.credit !== known.artist) rows.push({ key: 'credit', label: 'Původ', value: known.credit });
        }
        if (known && known.license) rows.push({ key: 'license', label: 'Licence', value: known.license, href: known.licenseUrl || '' });
        rows.push({ key: 'source', label: 'Zdroj', value: 'Wikimedia Commons' });
        if (answered && fileName) rows.push({ key: 'file', label: 'Soubor', value: fileName });
        return {
            title: TITLE,
            answered: Boolean(answered),
            rows,
            commonsUrl: answered && fileName ? pageUrl(fileName) : '',
            loading: status === 'loading',
            note: answered ? '' : 'Autora, název souboru a odkaz uvidíš po odpovědi.',
            error: status === 'failed' || (status === 'ready' && !meta) ? 'Podrobnosti se teď nepodařilo načíst.' : ''
        };
    };

    const LINK = 'font-bold text-brand-700 underline underline-offset-2 dark:text-brand-300';
    // HTML těla okna; vše z metadat se escapuje (žádné HTML z Commons se nevkládá)
    const viewHtml = (view) => {
        const rows = view.rows.map(row => {
            const value = row.href
                ? `<a href="${escapeHtml(row.href)}" target="_blank" rel="noopener noreferrer" class="${LINK}">${escapeHtml(row.value)}</a>`
                : escapeHtml(row.value);
            const clamp = row.key === 'description' ? 'line-clamp-3' : 'line-clamp-2';
            return `<div data-source-row="${escapeHtml(row.key)}" class="flex gap-2"><dt class="w-16 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(row.label)}</dt><dd class="${clamp} min-w-0 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">${value}</dd></div>`;
        }).join('');
        const status = view.loading ? '<p data-source-status class="text-xs font-semibold text-slate-500 dark:text-slate-400" role="status">Načítám podrobnosti…</p>'
            : view.error ? `<p data-source-status class="text-xs font-semibold text-slate-500 dark:text-slate-400" role="status">${escapeHtml(view.error)}</p>` : '';
        const note = view.note ? `<p data-source-note class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">${escapeHtml(view.note)}</p>` : '';
        const commons = view.commonsUrl
            ? `<a data-source-commons href="${escapeHtml(view.commonsUrl)}" target="_blank" rel="noopener noreferrer" class="flex min-h-[2.75rem] items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"><i data-lucide="external-link" class="h-4 w-4"></i> Otevřít na Wikimedia Commons</a>` : '';
        return `<dl class="flex flex-col gap-2">${rows}</dl>${status}${note}${commons}<p class="text-center text-xs text-slate-500 dark:text-slate-400"><a href="licence.html" class="inline-flex min-h-[2.5rem] items-center px-2 font-bold underline underline-offset-2">Zdroje a licence</a></p>`;
    };

    // Tlačítko „i“ v levém dolním rohu obrázku: na pohled malé kolečko, na dotyk 44 px (p-2.5 kolem 24 px). Skryté, dokud se obrázek
    // nenačte; adresu obrázku (data-url) doplní app.js nebo visuals.js
    const buttonHtml = ({ url = '', hidden = true } = {}) => `<button type="button" data-photo-info${url ? ` data-url="${escapeHtml(url)}"` : ''} aria-label="${TITLE}" aria-haspopup="dialog" class="${hidden ? 'hidden ' : ''}absolute bottom-0 left-0 z-10 p-2.5"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 font-serif text-sm font-bold italic leading-none text-white shadow backdrop-blur-sm" aria-hidden="true">i</span></button>`;

    return { API, TITLE, buttonHtml, fileFromUrl, pageUrl, metadataUrl, decodeEntities, cleanText, parseMetadata, createLoader, buildView, viewHtml, escapeHtml };
});
