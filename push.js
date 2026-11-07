// Web push v prohlížeči: oprávnění, předplatné (PushManager.subscribe s veřejným VAPID klíčem z config.js), uložení do databáze a odhlášení.
// Nic se nezapne samo: předplatné vzniká až po klepnutí na „Zapnout upozornění“ a po souhlasu v prohlížeči; vypnutí a odhlášení z účtu ho smaže
// z prohlížeče i z databáze (tabulka push_subscriptions, RLS: hráč vidí a maže jen svá). Odesílání dělá GitHub Actions (scripts/send-push.mjs),
// které hned spouští databáze (push_kick) a záložně hodinový plán.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantPush = api;
})(typeof self !== 'undefined' ? self : this, (globalRoot) => {
    'use strict';
    // Veřejný klíč VAPID: 65 bajtů (nekomprimovaný bod P-256) v base64url = 87 znaků
    const VAPID_PATTERN = /^[A-Za-z0-9_-]{87}$/;
    const READY_WAIT_MS = 8000;

    // kind říká, co selhalo (app.js podle něj ukáže českou radu): unsupported, auth (bez přihlášení), network (bez spojení), server (chyba
    // databáze, status = kód odpovědi), worker (service worker se nespustil), subscribe (push služba prohlížeče odmítla odběr, detail = název
    // a zpráva chyby), incomplete (neúplné předplatné), forbidden (vývojářská funkce pro účet mimo dev_admins)
    class PushError extends Error {
        constructor(message, status = 0, kind = 'unknown', detail = '') { super(message); this.status = status; this.kind = kind; this.detail = detail; }
    }
    const errorText = (error) => (error ? `${error.name || 'Error'}: ${error.message || ''}`.slice(0, 200) : '');

    const urlBase64ToBytes = (text) => {
        const padded = String(text).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(text).length % 4)) % 4);
        const binary = (globalRoot.atob || ((value) => Buffer.from(value, 'base64').toString('binary')))(padded);
        return Uint8Array.from(binary, char => char.charCodeAt(0));
    };

    // Řádek pro databázi z předplatného prohlížeče; neúplné nebo cizí předplatné (ne https, bez klíčů) vrátí null
    const rowFromSubscription = (subscription) => {
        const json = subscription && typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
        if (!json || typeof json.endpoint !== 'string' || !/^https:\/\/[^\s"'<>\\]+$/.test(json.endpoint) || json.endpoint.length > 1500) return null;
        const keys = json.keys || {};
        if (!/^[A-Za-z0-9_=-]{60,200}$/.test(keys.p256dh || '') || !/^[A-Za-z0-9_=-]{16,64}$/.test(keys.auth || '')) return null;
        return { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth };
    };

    const make = (root) => {
        const config = () => root.MUDRLANT_CONFIG || {};
        const baseUrl = () => String(config().supabaseUrl || '').replace(/\/+$/, '');
        const auth = () => root.MudrlantAuth;
        const vapidKey = () => { const key = String(config().vapidPublicKey || '').trim(); return VAPID_PATTERN.test(key) ? key : ''; };
        const nav = () => root.navigator || {};
        const supported = () => Boolean(nav().serviceWorker) && 'PushManager' in root && 'Notification' in root && root.isSecureContext !== false;
        // Funkce je v aplikaci vidět jen s nastaveným klíčem (docs/SUPABASE.md); bez něj se nabídka vůbec neukáže
        const configured = () => Boolean(vapidKey()) && Boolean(auth()) && auth().isConfigured();
        const isIos = () => /iPad|iPhone|iPod/.test(String(nav().userAgent || '')) || (nav().platform === 'MacIntel' && Number(nav().maxTouchPoints) > 1);

        const rest = async (method, path, body, retried = false) => {
            const token = await auth().accessToken(retried);
            if (!token) throw new PushError('Nejsi přihlášený.', 401, 'auth');
            let response;
            try {
                response = await root.fetch(`${baseUrl()}/rest/v1/${path}`, {
                    method,
                    headers: { apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
            } catch (error) { throw new PushError('Bez spojení se serverem.', 0, 'network', errorText(error)); }
            if (response.status === 401 && !retried) return rest(method, path, body, true);
            if (!response.ok) throw new PushError(`Server odpověděl ${response.status}`, response.status, response.status === 401 ? 'auth' : 'server');
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        };

        const registration = (wait = READY_WAIT_MS) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new PushError('Service worker se nespustil.', 0, 'worker')), wait);
            Promise.resolve(nav().serviceWorker.ready).then(
                (value) => { clearTimeout(timer); resolve(value); },
                (error) => { clearTimeout(timer); reject(new PushError('Service worker se nespustil.', 0, 'worker', errorText(error))); });
        });
        const currentSubscription = async () => {
            if (!supported()) return null;
            try { return await (await registration()).pushManager.getSubscription(); } catch (error) { return null; }
        };

        // Stav pro Nastavení: hidden (funkce není nastavená), unsupported (prohlížeč push neumí), denied (zakázáno v prohlížeči), on, off
        const state = async () => {
            if (!configured()) return { kind: 'hidden', ios: false };
            if (!supported()) return { kind: 'unsupported', ios: isIos() };
            if (root.Notification.permission === 'denied') return { kind: 'denied', ios: false };
            const subscription = await currentSubscription();
            return { kind: subscription && root.Notification.permission === 'granted' ? 'on' : 'off', ios: false };
        };

        // Volat přímo z klepnutí: requestPermission musí být první await, jinak ho prohlížeč (Safari) odmítne
        const enable = async () => {
            if (!configured() || !supported()) throw new PushError('Upozornění tento prohlížeč neumí.', 0, 'unsupported');
            const permission = await root.Notification.requestPermission();
            if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
            const worker = await registration();
            let subscription;
            try {
                subscription = await worker.pushManager.getSubscription();
                // Předplatné s jiným klíčem serveru (po výměně VAPID klíčů) by nešlo použít
                const wanted = urlBase64ToBytes(vapidKey());
                const existing = subscription && subscription.options && subscription.options.applicationServerKey;
                if (subscription && existing && sameBytes(new Uint8Array(existing), wanted) === false) { await subscription.unsubscribe(); subscription = null; }
                if (!subscription) subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
            } catch (error) {
                // Push služba prohlížeče (FCM, Mozilla, Apple) odběr odmítla, typicky AbortError „push service error“
                throw new PushError('Push služba prohlížeče odběr odmítla.', 0, 'subscribe', errorText(error));
            }
            const row = rowFromSubscription(subscription);
            if (!row) { await subscription.unsubscribe().catch(() => {}); throw new PushError('Prohlížeč vrátil neúplné předplatné.', 0, 'incomplete'); }
            try {
                await rest('POST', 'rpc/push_subscribe', { endpoint_url: row.endpoint, key_p256dh: row.p256dh, key_auth: row.auth });
            } catch (error) {
                await subscription.unsubscribe().catch(() => {});
                throw error;
            }
            return { ok: true };
        };

        // Vypnutí a odhlášení: nejdřív řádek v databázi (potřebuje přihlášení), pak předplatné v prohlížeči – to se smaže vždy, i když server neodpoví
        // (zbylý řádek pak server při příštím odeslání smaže sám, protože adresa už neplatí)
        const disable = async () => {
            const subscription = await currentSubscription();
            if (!subscription) return { ok: true };
            let removed = true;
            try {
                if (auth() && auth().hasSession()) await rest('DELETE', `push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`);
            } catch (error) { removed = false; }
            try { await subscription.unsubscribe(); } catch (error) { removed = false; }
            return { ok: removed };
        };

        // Co hráč chce dostávat; starší databáze bez sloupců vrátí null (volby se pak neukážou)
        const getPrefs = async (userId) => {
            try {
                const rows = await rest('GET', `profiles?id=eq.${encodeURIComponent(userId)}&select=push_tournament,push_challenge`);
                const row = Array.isArray(rows) ? rows[0] : null;
                return row ? { tournament: row.push_tournament !== false, challenge: row.push_challenge !== false } : null;
            } catch (error) { return null; }
        };
        const savePrefs = async (userId, prefs) => {
            await rest('PATCH', `profiles?id=eq.${encodeURIComponent(userId)}`, { push_tournament: Boolean(prefs.tournament), push_challenge: Boolean(prefs.challenge) });
            return { tournament: Boolean(prefs.tournament), challenge: Boolean(prefs.challenge) };
        };

        // Diagnostika pro vývojářský režim: co prohlížeč a server o upozorněních vědí (bez klíčů předplatného; endpoint jen zkráceně)
        const shortEndpoint = (endpoint) => { try { const url = new URL(endpoint); return `${url.host}/…${String(endpoint).slice(-8)}`; } catch (error) { return '?'; } };
        const diagnose = async () => {
            const sw = nav().serviceWorker;
            const rawKey = String(config().vapidPublicKey || '').trim();
            const out = {
                permission: 'Notification' in root ? String(root.Notification.permission) : 'none',
                pushManager: 'PushManager' in root, serviceWorker: Boolean(sw), secure: root.isSecureContext !== false, ios: isIos(),
                standalone: Boolean((typeof root.matchMedia === 'function' && root.matchMedia('(display-mode: standalone)').matches) || nav().standalone === true),
                vapid: rawKey.slice(0, 8), vapidValid: Boolean(vapidKey()), signedIn: Boolean(auth() && auth().hasSession && auth().hasSession()),
                registration: null, controlled: Boolean(sw && sw.controller), ready: false, subscription: null, server: null
            };
            let ready = null;
            let endpoint = '';
            if (sw) {
                try {
                    const found = await sw.getRegistration();
                    out.registration = found ? { scope: String(found.scope || ''), active: found.active ? String(found.active.state || 'activated') : '', waiting: Boolean(found.waiting), installing: Boolean(found.installing) } : null;
                } catch (error) { out.registration = { error: errorText(error) }; }
                try { ready = await registration(3000); out.ready = true; } catch (error) { out.ready = false; }
            }
            if (ready && ready.pushManager) {
                try {
                    const subscription = await ready.pushManager.getSubscription();
                    const existing = subscription && subscription.options && subscription.options.applicationServerKey;
                    endpoint = subscription ? String(subscription.endpoint || '') : '';
                    out.subscription = subscription ? {
                        endpoint: shortEndpoint(endpoint),
                        keyMatches: existing && vapidKey() ? sameBytes(new Uint8Array(existing), urlBase64ToBytes(vapidKey())) : null
                    } : { none: true };
                } catch (error) { out.subscription = { error: errorText(error) }; }
            }
            // Server: tabulka push_subscriptions (RLS: jen vlastní odběry) – existuje, odpovídá a zná tohle zařízení?
            if (out.signedIn && baseUrl()) {
                try {
                    const rows = await rest('GET', 'push_subscriptions?select=endpoint');
                    const list = Array.isArray(rows) ? rows : [];
                    out.server = { status: 200, count: list.length, thisDevice: Boolean(endpoint) && list.some(row => row && row.endpoint === endpoint) };
                } catch (error) { out.server = { status: error.status || 0, kind: error.kind || 'unknown' }; }
            }
            return out;
        };

        // Zkouška bez serveru: stránka pošle service workeru zprávu a ten ukáže upozornění stejnou funkcí jako při skutečném push (showPush v sw.js).
        // Výsledek: { ok } nebo { ok: false, reason: 'unsupported' | 'permission' (+ permission = stav) | 'worker' | 'failed' (+ detail) }
        const testLocal = async () => {
            if (!supported()) return { ok: false, reason: 'unsupported' };
            if (root.Notification.permission !== 'granted') return { ok: false, reason: 'permission', permission: String(root.Notification.permission) };
            let worker;
            try { worker = await registration(); } catch (error) { return { ok: false, reason: 'worker' }; }
            const target = worker.active || nav().serviceWorker.controller;
            if (!target || typeof target.postMessage !== 'function' || typeof root.MessageChannel !== 'function') return { ok: false, reason: 'worker' };
            return new Promise((resolve) => {
                const channel = new root.MessageChannel();
                const done = (answer) => { clearTimeout(timer); channel.port1.close(); resolve(answer); };
                const timer = setTimeout(() => done({ ok: false, reason: 'worker' }), 5000);
                channel.port1.onmessage = (event) => {
                    const data = event.data || {};
                    done(data.ok ? { ok: true } : { ok: false, reason: 'failed', detail: String(data.error || '').slice(0, 200) });
                };
                try { target.postMessage({ type: 'push-test', payload: TEST_PAYLOAD }, [channel.port2]); } catch (error) { done({ ok: false, reason: 'worker' }); }
            });
        };

        // Zkouška přes server (jen účet v dev_admins): zařadí zkušební zprávu, kterou při dalším běhu pošle odesílač (push_due → web push → push_mark).
        // Vrací počet zařízení účtu, kam půjde (0 = účet nemá zapnutá upozornění nikde, nic se nezařadilo)
        const requestServerTest = async () => {
            try {
                const devices = Math.floor(Number(await rest('POST', 'rpc/dev_push_test', {})));
                return Number.isFinite(devices) ? Math.max(0, devices) : 0;
            } catch (error) {
                if (error.status === 403) throw new PushError('Tenhle účet není v dev_admins.', 403, 'forbidden');
                throw error;
            }
        };
        // Je na serveru nastavené okamžité odesílání (dev_push_status, schéma 5, jen dev_admins)? { instant, token, pgNet, cron, github } nebo null,
        // když se to nedá zjistit (starší databáze bez funkce, chyba spojení) – aplikace pak ukáže obecný text
        const serverPushStatus = async () => {
            try {
                const status = await rest('POST', 'rpc/dev_push_status', {});
                if (!status || typeof status !== 'object' || Array.isArray(status)) return null;
                const code = Number(status.github);
                return { instant: status.instant === true, token: status.token === true, pgNet: status.pg_net === true, cron: status.cron === true,
                    github: Number.isInteger(code) && code > 0 ? code : null };
            } catch (error) { return null; }
        };

        return { state, enable, disable, getPrefs, savePrefs, configured, supported, vapidKey, diagnose, testLocal, requestServerTest, serverPushStatus };
    };
    // Obsah zkušebního upozornění (stejný tvar jako od odesílače: title, body, url, kind); text na serveru je v push_due
    const TEST_PAYLOAD = { title: 'Zkušební upozornění Mudrlanta', body: 'Funguje to! Klepni sem a otevře se záložka Více hráčů.', url: './?tab=multi', kind: 'test' };

    const sameBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

    return { ...make(globalRoot), make, urlBase64ToBytes, rowFromSubscription, PushError, VAPID_PATTERN, TEST_PAYLOAD };
});
