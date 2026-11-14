// Fotky bez prozrazení odpovědi: adresa obrázku z Wikimedia Commons obsahuje název souboru
// (…/Eiffel_Tower_from_Champ_de_Mars.jpg) a ten bývá odpovědí. Podržením fotky („Otevřít obrázek“, „Kopírovat adresu“),
// v atributech prvku ani v jeho stylu ho hráč vidět nesmí. Obrázek se proto stáhne přes fetch() (Commons posílá
// Access-Control-Allow-Origin: *) a ukáže se jako adresa blob: bez názvu. Když fetch nejde (prohlížeč bez něj, starší CSP
// z mezipaměti, server bez CORS), načte se obrázek obyčejně: fotka má přednost před utajením. Odpověď serveru s chybou
// (404, 429) se obyčejně nezkouší, obrázek by se nenačetl ani tak.
// Blob se uvolní (URL.revokeObjectURL), když už ho na stránce nic neukazuje (prvky, které ho ukazovaly, zmizely: další otázka),
// a nepoužité (ověřená fotka nápovědy, kterou hráč neotevřel) nejpozději, když jich je v paměti víc než KEEP.
// Čistá logika (createLoader) se testuje v Node (tests/photo-blob.test.js); v prohlížeči je jeden společný nakladač pro app.js,
// visuals.js a conquest-ui.js.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantPhotoBlob = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    // Nejdéle se čeká na stažení (pak se fotka bere jako nenačtená); kolik nepoužitých blobů zůstane v paměti
    const TIMEOUT = 30000;
    const KEEP = 12;

    const isBlob = (src) => /^blob:/i.test(String(src || ''));
    const connected = (element) => Boolean(element && element.isConnected);

    // fetchImpl(url, init) → Response; createUrl(blob) / revokeUrl(src) = URL.createObjectURL / revokeObjectURL;
    // decode(src) → Promise<{ width, height }> (načtení obrázku, odmítne, když se nenačte)
    const createLoader = ({ fetchImpl = null, createUrl = null, revokeUrl = null, decode, timeout = TIMEOUT, keep = KEEP, setTimer = setTimeout, clearTimer = clearTimeout } = {}) => {
        const canFetch = typeof fetchImpl === 'function' && typeof createUrl === 'function';
        // url → { promise, done, result: { src, url, width, height, hidden } | null, users: Set<prvek>, shown }
        const entries = new Map();
        const release = (url, entry) => {
            entries.delete(url);
            if (entry.result && entry.result.hidden && revokeUrl) { try { revokeUrl(entry.result.src); } catch (error) { /* už uvolněný */ } }
        };
        // Úklid před každým dalším načtením: blob, jehož prvky už na stránce nejsou, se uvolní; z nepoužitých (nikde neukázaných)
        // zůstane nejvýš keep, starší se uvolní. Rozpracované načtení ani adresa, která se právě chce (except), se neruší.
        const sweep = (except) => {
            for (const [url, entry] of [...entries]) {
                if (url === except || !entry.done) continue;
                entry.users.forEach(element => { if (!connected(element)) entry.users.delete(element); });
                if (entry.shown && !entry.users.size) release(url, entry);
            }
            for (const [url, entry] of [...entries]) {
                if (entries.size <= keep) break;
                if (url !== except && entry.done && !entry.users.size) release(url, entry);
            }
        };
        // Stažení přes fetch: { blob } | { status } (server odpověděl chybou) | 'timeout'; výjimka = fetch nejde (síť, CORS, CSP)
        const download = (url) => {
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            let timer = null;
            const work = Promise.resolve()
                .then(() => fetchImpl(url, { mode: 'cors', credentials: 'omit', ...(controller ? { signal: controller.signal } : {}) }))
                .then(response => (response && response.ok ? response.blob().then(blob => ({ blob })) : { status: response ? response.status : 0 }));
            const late = new Promise(resolve => { timer = setTimer(() => { if (controller) controller.abort(); resolve('timeout'); }, timeout); });
            return Promise.race([work, late]).finally(() => clearTimer(timer));
        };
        const plain = (url) => Promise.resolve().then(() => decode(url)).then(size => ({ src: url, url, width: size.width, height: size.height, hidden: false }), () => null);
        const fetchHidden = async (url) => {
            if (!canFetch) return plain(url);
            let got;
            try { got = await download(url); } catch (error) { return plain(url); }
            if (got === 'timeout' || !got || !got.blob) return null;
            let src = null;
            try {
                src = createUrl(got.blob);
                const size = await decode(src);
                return { src, url, width: size.width, height: size.height, hidden: true };
            } catch (error) {
                if (src && revokeUrl) { try { revokeUrl(src); } catch (e) { /* nic */ } }
                return plain(url);
            }
        };
        const ensure = (url) => {
            let entry = entries.get(url);
            if (entry) {
                // Naposledy použité na konec (úklid nepoužitých bere od nejstarších)
                entries.delete(url);
                entries.set(url, entry);
                return entry;
            }
            entry = { done: false, result: null, users: new Set(), shown: false };
            entry.promise = fetchHidden(url).then(result => {
                entry.done = true;
                entry.result = result;
                // Nepovedené načtení se nepamatuje: příště se zkusí znovu
                if (!result && entries.get(url) === entry) entries.delete(url);
                return result;
            });
            entries.set(url, entry);
            return entry;
        };

        // Načte obrázek (jednou na adresu, další volání dostanou stejný výsledek): { src (blob: nebo původní adresa), url, width, height,
        // hidden (true = blob) } nebo null, když se nenačte
        const load = (url) => {
            if (!url) return Promise.resolve(null);
            sweep(url);
            return ensure(url).promise;
        };
        // Načte obrázek pro prvek, který ho bude ukazovat: blob zůstane platný, dokud je prvek (nebo jiný, který ho ukazuje) na stránce
        const attach = (url, element) => {
            if (!url) return Promise.resolve(null);
            sweep(url);
            const entry = ensure(url);
            if (element) entry.users.add(element);
            entry.shown = true;
            return entry.promise;
        };
        // Další prvek ukazuje už načtený obrázek (zvětšená fotka, překreslený list otázky)
        const hold = (src, element) => {
            for (const entry of entries.values()) {
                if (entry.result && entry.result.src === src) {
                    if (element) entry.users.add(element);
                    entry.shown = true;
                    return true;
                }
            }
            return false;
        };
        // Hotový obrázek bez čekání (null, dokud se nenačetl)
        const resultFor = (url) => {
            const entry = url ? entries.get(url) : null;
            return entry && entry.done ? entry.result : null;
        };
        return { load, attach, hold, resultFor, sweep: () => sweep(null), size: () => entries.size };
    };

    // Společný nakladač v prohlížeči (app.js, visuals.js a conquest-ui.js sdílejí bloby i úklid)
    const decodeImage = (src) => new Promise((resolve, reject) => {
        const image = new root.Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('Obrázek se nenačetl'));
        image.src = src;
    });
    let shared = null;
    const loader = () => {
        if (!shared) {
            const urls = root.URL && typeof root.URL.createObjectURL === 'function' ? root.URL : null;
            shared = createLoader({
                fetchImpl: typeof root.fetch === 'function' ? (url, init) => root.fetch(url, init) : null,
                createUrl: urls ? (blob) => urls.createObjectURL(blob) : null,
                revokeUrl: urls ? (src) => urls.revokeObjectURL(src) : null,
                decode: decodeImage
            });
        }
        return shared;
    };

    return {
        TIMEOUT, KEEP, isBlob, createLoader,
        load: (url) => loader().load(url),
        attach: (url, element) => loader().attach(url, element),
        hold: (src, element) => loader().hold(src, element),
        resultFor: (url) => loader().resultFor(url)
    };
});
