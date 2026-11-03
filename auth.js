// Přihlášení účtem Google přes Supabase Auth (GoTrue REST, bez knihovny a bez sestavování).
// Tok: klepnutí na Přihlásit → přesměrování na Supabase → Google → návrat na stránku s tokeny v #hash → uloží se a hash zmizí.
// Přístupový token (accessToken) později použije multiplayer. Bez nastavené config.js je vše vypnuté a hra běží jako host.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantAuth = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const STORAGE_KEY = 'mudrlant.auth';
    // Token se obnoví s předstihem, ať nevyprší uprostřed hry
    const REFRESH_MARGIN_S = 90;
    const config = () => root.MUDRLANT_CONFIG || {};
    const baseUrl = () => String(config().supabaseUrl || '').replace(/\/+$/, '');
    const anonKey = () => config().supabaseAnonKey || '';
    const isConfigured = () => /^https:\/\/[^/]+$/.test(baseUrl()) && Boolean(anonKey());

    let session = null;
    let error = '';
    const listeners = new Set();
    const emit = () => listeners.forEach(listener => { try { listener(getState()); } catch (e) { console.error(e); } });

    const read = () => { try { return JSON.parse(root.localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; } };
    const write = (value) => {
        try {
            if (value) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
            else root.localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* bez úložiště se jen nepamatuje přihlášení */ }
    };
    const now = () => Math.floor(Date.now() / 1000);

    const headers = (token) => ({ apikey: anonKey(), Authorization: `Bearer ${token || anonKey()}`, 'Content-Type': 'application/json' });

    // Údaje o uživateli z Googlu: jméno, e-mail; id je stálé a patří k němu všechna budoucí data
    const toUser = (raw) => {
        const meta = (raw && raw.user_metadata) || {};
        return raw && raw.id ? { id: raw.id, email: raw.email || '', name: meta.full_name || meta.name || (raw.email || '').split('@')[0] || 'Hráč' } : null;
    };
    const fetchUser = async (token) => {
        const response = await fetch(`${baseUrl()}/auth/v1/user`, { headers: headers(token) });
        if (!response.ok) throw new Error(`user ${response.status}`);
        return toUser(await response.json());
    };
    const refresh = async (refreshToken) => {
        const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!response.ok) throw new Error(`refresh ${response.status}`);
        const data = await response.json();
        return { access_token: data.access_token, refresh_token: data.refresh_token || refreshToken, expires_at: now() + Number(data.expires_in || 3600), user: toUser(data.user) || (session && session.user) || null };
    };

    // Po návratu z přihlášení jsou tokeny v #hash (access_token, refresh_token, expires_in) nebo chyba (error_description)
    const takeHash = () => {
        const hash = root.location && root.location.hash ? root.location.hash.slice(1) : '';
        if (!/(?:^|&)(?:access_token|error)=/.test(hash)) return null;
        const params = new URLSearchParams(hash);
        // Hash s tokeny z adresy hned pryč (historie, sdílení odkazu)
        if (root.history && root.history.replaceState) root.history.replaceState(root.history.state, '', root.location.pathname + root.location.search);
        return params;
    };

    const init = async () => {
        if (!isConfigured()) return getState();
        const params = takeHash();
        try {
            if (params && params.get('access_token')) {
                const token = params.get('access_token');
                session = { access_token: token, refresh_token: params.get('refresh_token') || '', expires_at: now() + Number(params.get('expires_in') || 3600), user: null };
                session.user = await fetchUser(token);
                write(session);
            } else if (params) {
                error = params.get('error_description') || params.get('error') || 'Přihlášení se nepodařilo.';
            } else {
                session = read();
                if (session && session.expires_at - now() < REFRESH_MARGIN_S) session = await refresh(session.refresh_token);
                if (session) { session.user = session.user || await fetchUser(session.access_token); write(session); }
            }
        } catch (e) {
            // Neplatný nebo zrušený účet: raději odhlásit, než hrát s rozbitým tokenem; síťová chyba přihlášení neruší
            if (!(e instanceof TypeError)) { session = null; write(null); error = 'Přihlášení vypršelo, přihlas se znovu.'; }
        }
        emit();
        return getState();
    };

    const login = () => {
        if (!isConfigured()) return;
        const back = root.location.origin + root.location.pathname;
        root.location.assign(`${baseUrl()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`);
    };
    const logout = async () => {
        const token = session && session.access_token;
        session = null;
        error = '';
        write(null);
        emit();
        if (token && isConfigured()) fetch(`${baseUrl()}/auth/v1/logout`, { method: 'POST', headers: headers(token) }).catch(() => {});
    };

    // Platný přístupový token pro volání API (multiplayer); sám se obnoví, když brzy vyprší
    const accessToken = async () => {
        if (!session) return null;
        if (session.expires_at - now() < REFRESH_MARGIN_S) {
            try { session = await refresh(session.refresh_token); write(session); } catch (e) { return null; }
        }
        return session.access_token;
    };

    const getState = () => ({ configured: isConfigured(), user: session && session.user ? session.user : null, error });
    const onChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
    return { init, login, logout, accessToken, getState, onChange, isConfigured };
});
