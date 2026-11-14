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
    // Každé odhlášení/přihlášení zvýší číslo; odpověď na obnovu, která dorazí po odhlášení, se zahodí (jinak by odhlášení „ožilo“)
    let generation = 0;
    let refreshing = null;
    const listeners = new Set();
    const emit = () => listeners.forEach(listener => { try { listener(getState()); } catch (e) { console.error(e); } });

    // Uložené přihlášení musí mít tvar relace; poškozená nebo cizí data (číslo, pole, chybějící token) se zahodí
    const validSession = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        && typeof value.access_token === 'string' && value.access_token.length > 0
        && typeof value.refresh_token === 'string' && Number.isFinite(value.expires_at)
        && (value.user === null || value.user === undefined || (typeof value.user === 'object' && typeof value.user.id === 'string'));
    const read = () => { try { const value = JSON.parse(root.localStorage.getItem(STORAGE_KEY)); return validSession(value) ? value : null; } catch (e) { return null; } };
    const write = (value) => {
        try {
            if (value) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
            else root.localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* bez úložiště se jen nepamatuje přihlášení */ }
    };
    const now = () => Math.floor(Date.now() / 1000);
    // Platnost tokenu v sekundách; chybná nebo nesmyslná hodnota = hodina
    const expiresIn = (value) => { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 7 * 86400) : 3600; };

    // Klíč (nový sb_publishable_… i starý anon) jde jen v hlavičce apikey; Authorization je až přihlášeného uživatele
    // (nový klíč není JWT, takže jako Bearer token by ho Supabase odmítlo)
    const headers = (token) => ({ apikey: anonKey(), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' });

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
        return { access_token: data.access_token, refresh_token: data.refresh_token || refreshToken, expires_at: now() + expiresIn(data.expires_in), user: toUser(data.user) || (session && session.user) || null };
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
                session = { access_token: token, refresh_token: params.get('refresh_token') || '', expires_at: now() + expiresIn(params.get('expires_in')), user: null };
                session.user = await fetchUser(token);
                write(session);
            } else if (params) {
                error = String(params.get('error_description') || params.get('error') || 'Přihlášení se nepodařilo.').slice(0, 200);
            } else {
                session = read();
                if (session && session.expires_at - now() < REFRESH_MARGIN_S) session = await refresh(session.refresh_token);
                if (session) { session.user = session.user || await fetchUser(session.access_token); write(session); }
            }
        } catch (e) {
            // Neplatný nebo zrušený účet: raději odhlásit, než hrát s rozbitým tokenem
            // (jen odmítnutí tokenem 400/401/403/404; síť, přetížený server 5xx a limit 429 přihlášení nesmí zrušit)
            if (e && /^(user|refresh) (400|401|403|404)$/.test(e.message)) { session = null; generation++; write(null); error = 'Přihlášení vypršelo, přihlas se znovu.'; }
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
        generation++;
        error = '';
        write(null);
        emit();
        if (token && isConfigured()) fetch(`${baseUrl()}/auth/v1/logout`, { method: 'POST', headers: headers(token) }).catch(() => {});
    };

    // Platný přístupový token pro volání API (multiplayer); sám se obnoví, když brzy vyprší
    // Souběžné požadavky sdílí jedinou obnovu (refresh token se po použití mění, druhá obnova by ho zneplatnila a odhlásila hráče)
    const renew = () => {
        if (!refreshing) {
            const started = generation;
            refreshing = refresh(session.refresh_token).then(next => {
                if (started !== generation || !session) throw new Error('logged out');
                session = next;
                write(session);
                return session;
            }).finally(() => { refreshing = null; });
        }
        return refreshing;
    };
    // force = server token odmítl (401), obnovit hned, i když podle času ještě platí
    const accessToken = async (force = false) => {
        if (!session) return null;
        if (force || session.expires_at - now() < REFRESH_MARGIN_S) {
            try { await renew(); } catch (e) {
                // Odmítnutý refresh token (400/401) = přihlášení skončilo; výpadek sítě přihlášení neruší
                if (e && /^refresh 40[013]$/.test(e.message) && session) { session = null; generation++; write(null); error = 'Přihlášení vypršelo, přihlas se znovu.'; emit(); }
                return null;
            }
        }
        return session ? session.access_token : null;
    };

    // Odhlášení nebo přihlášení v jiné kartě se promítne i sem (jinak by tato karta dál používala zneplatněný token)
    if (root.addEventListener) {
        root.addEventListener('storage', (event) => {
            if (event.key !== STORAGE_KEY || !isConfigured()) return;
            const next = read();
            if (!next && session) { session = null; generation++; emit(); }
            else if (next && (!session || next.access_token !== session.access_token)) { session = next; generation++; emit(); }
        });
    }
    const getState = () => ({ configured: isConfigured(), user: session && session.user ? session.user : null, error });
    // Přihlášení uložené nebo právě dokončené (údaje o hráči se ještě můžou načítat) – úvod pak nenabízí přihlášení
    const hasSession = () => Boolean(session);
    const onChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
    return { init, login, logout, accessToken, getState, hasSession, onChange, isConfigured };
});
