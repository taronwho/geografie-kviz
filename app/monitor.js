// Sběr chyb z provozu: neodchycené chyby (window error, unhandledrejection) jdou po dávkách do tabulky client_errors v Supabase
// (REST insert s veřejným klíčem; pravidla řádků pustí jen zápis, čte je správce v Nastavení přes dev_client_errors()).
// Bez osobních údajů: jen zpráva, zkrácený zásobník volání (adresy bez parametrů), adresa stránky bez parametrů, prohlížeč, verze aplikace a čas.
// Nejvýš 5 chyb za relaci a 20 za den a zařízení, stejná chyba (zpráva + zásobník) jen jednou. Bez nastaveného Supabase (config.js) nic nedělá.
// Načítá se hned po config.js, ať chytí i chyby při startu ostatních skriptů.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantMonitor = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const MAX_PER_SESSION = 5;
    const MAX_PER_DAY = 20;
    const DAY_KEY = 'mudrlant.errors';
    const MAX_MESSAGE = 500;
    const MAX_STACK = 1000;
    const MAX_URL = 300;
    const MAX_AGENT = 300;
    const MAX_VERSION = 40;
    const FLUSH_DELAY = 1500;

    // Krátký otisk textu (FNV-1a, 32 bitů) pro seskupení stejných chyb
    const hashOf = (text) => {
        let hash = 0x811c9dc5;
        const input = String(text || '');
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    };
    // Adresa bez parametrů a kotvy (po přihlášení jsou v adrese tokeny, v odkazu kód výzvy)
    const cleanUrl = (url) => String(url || '').split(/[?#]/)[0].slice(0, MAX_URL);
    // Zásobník volání: adresy bez parametrů, bez prázdných řádků, nejvýš MAX_STACK znaků
    const cleanStack = (stack) => String(stack || '').replace(/\r/g, '').split('\n').map(line => line.replace(/(https?:\/\/[^\s)?#]+)[?#][^\s)]*/g, '$1').trimEnd()).filter(Boolean).join('\n').slice(0, MAX_STACK);
    const cut = (text, max) => String(text || '').slice(0, max);
    // Z chyby (Error, text, cokoli) zpráva a zásobník
    const describe = (error, fallback = '') => {
        if (error && typeof error === 'object') {
            const message = typeof error.message === 'string' && error.message ? error.message : fallback || (() => { try { return JSON.stringify(error); } catch (e) { return String(error); } })();
            const name = typeof error.name === 'string' && error.name && error.name !== 'Error' && !message.startsWith(error.name) ? `${error.name}: ` : '';
            return { message: cut(`${name}${message}`, MAX_MESSAGE) || 'Neznámá chyba', stack: cleanStack(error.stack) };
        }
        if (error === undefined || error === null || error === '') return { message: cut(fallback, MAX_MESSAGE) || 'Neznámá chyba', stack: '' };
        return { message: cut(typeof error === 'string' ? error : (() => { try { return JSON.stringify(error); } catch (e) { return String(error); } })(), MAX_MESSAGE), stack: '' };
    };

    // Sběrač: report() zařadí chybu, flush() odešle dávku. Závislosti jdou podstrčit (testy).
    const createMonitor = ({ config = {}, fetch = null, agent = '', href = '', now = () => new Date(), schedule = null, cancel = null, storage = null } = {}) => {
        const url = String(config.supabaseUrl || '').replace(/\/+$/, '');
        const key = String(config.supabaseAnonKey || '');
        const enabled = Boolean(url && key && typeof fetch === 'function');
        const seen = new Set();
        const queue = [];
        let sent = 0;
        let version = '';
        let timer = null;
        // Denní limit na zařízení (localStorage může chybět nebo selhat: pak platí jen limit relace)
        const dayOf = () => now().toISOString().slice(0, 10);
        const dayCount = () => {
            try {
                const saved = JSON.parse(storage.getItem(DAY_KEY) || 'null');
                return saved && saved.day === dayOf() ? Math.max(0, Number(saved.count) || 0) : 0;
            } catch (error) { return 0; }
        };
        const addDay = () => { try { storage.setItem(DAY_KEY, JSON.stringify({ day: dayOf(), count: dayCount() + 1 })); } catch (error) { /* bez úložiště */ } };
        const flush = () => {
            if (timer !== null && cancel) cancel(timer);
            timer = null;
            if (!enabled || !queue.length) return Promise.resolve(false);
            const rows = queue.splice(0, queue.length).map(row => ({ ...row, app_version: cut(version, MAX_VERSION) || null }));
            try {
                return Promise.resolve(fetch(`${url}/rest/v1/client_errors`, {
                    method: 'POST',
                    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                    body: JSON.stringify(rows),
                    keepalive: true
                })).then(() => true, () => false);
            } catch (error) { return Promise.resolve(false); }
        };
        // Vrací true, když se chyba zařadila k odeslání (nová a limit relace nevyčerpaný)
        const report = (kind, error, fallback = '') => {
            if (!enabled || sent >= MAX_PER_SESSION || (storage && dayCount() >= MAX_PER_DAY)) return false;
            const { message, stack } = describe(error, fallback);
            const hash = hashOf(`${message}\n${stack}`);
            if (seen.has(hash)) return false;
            seen.add(hash);
            sent += 1;
            if (storage) addDay();
            queue.push({ kind: cut(kind, 20) || 'error', message, stack: stack || null, url: cleanUrl(href) || null, user_agent: cut(agent, MAX_AGENT) || null, hash, happened_at: now().toISOString() });
            if (schedule && timer === null) timer = schedule(flush, FLUSH_DELAY);
            else if (!schedule) flush();
            return true;
        };
        return { enabled, report, flush, setVersion: (text) => { version = String(text || ''); }, pending: () => queue.length, count: () => sent };
    };

    // Zapojení do stránky: window error a unhandledrejection, odeslání před skrytím stránky
    const install = (win) => {
        if (!win || typeof win.addEventListener !== 'function') return null;
        const config = win.MUDRLANT_CONFIG || {};
        const monitor = createMonitor({
            config,
            fetch: typeof win.fetch === 'function' ? win.fetch.bind(win) : null,
            agent: win.navigator ? win.navigator.userAgent : '',
            href: win.location ? win.location.href : '',
            storage: (() => { try { return win.localStorage; } catch (error) { return null; } })(),
            schedule: (run, delay) => win.setTimeout(run, delay),
            cancel: (id) => win.clearTimeout(id)
        });
        if (!monitor.enabled) return monitor;
        win.addEventListener('error', (event) => {
            try {
                // Chyby načítání obrázků a skriptů (bez zprávy) sem nepatří
                if (!event || (!event.error && !event.message)) return;
                monitor.report('error', event.error, event.message || '');
            } catch (e) { /* sběr chyb nesmí sám chybovat */ }
        });
        win.addEventListener('unhandledrejection', (event) => {
            try { monitor.report('rejection', event && event.reason, 'Neošetřené odmítnutí'); } catch (e) { /* viz výše */ }
        });
        win.addEventListener('pagehide', () => { try { monitor.flush(); } catch (e) { /* viz výše */ } });
        return monitor;
    };

    const api = { MAX_PER_SESSION, MAX_PER_DAY, MAX_STACK, hashOf, cleanUrl, cleanStack, describe, createMonitor, install, instance: null, setVersion: (text) => { if (api.instance) api.instance.setVersion(text); } };
    // V prohlížeči se zapojí hned (modul v Node jen vrací funkce)
    if (root && typeof root.document !== 'undefined' && !(typeof module === 'object' && module.exports)) api.instance = install(root);
    return api;
});
