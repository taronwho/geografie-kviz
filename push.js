// Web push v prohlížeči: oprávnění, předplatné (PushManager.subscribe s veřejným VAPID klíčem z config.js), uložení do databáze a odhlášení.
// Nic se nezapne samo: předplatné vzniká až po klepnutí na „Zapnout upozornění“ a po souhlasu v prohlížeči; vypnutí a odhlášení z účtu ho smaže
// z prohlížeče i z databáze (tabulka push_subscriptions, RLS: hráč vidí a maže jen svá). Odesílání dělá GitHub Actions (scripts/send-push.mjs).
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantPush = api;
})(typeof self !== 'undefined' ? self : this, (globalRoot) => {
    'use strict';
    // Veřejný klíč VAPID: 65 bajtů (nekomprimovaný bod P-256) v base64url = 87 znaků
    const VAPID_PATTERN = /^[A-Za-z0-9_-]{87}$/;
    const READY_WAIT_MS = 8000;

    class PushError extends Error {
        constructor(message, status) { super(message); this.status = status; }
    }

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
            if (!token) throw new PushError('Nejsi přihlášený.', 401);
            const response = await root.fetch(`${baseUrl()}/rest/v1/${path}`, {
                method,
                headers: { apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            if (response.status === 401 && !retried) return rest(method, path, body, true);
            if (!response.ok) throw new PushError(`Server odpověděl ${response.status}`, response.status);
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        };

        const registration = () => Promise.race([
            nav().serviceWorker.ready,
            new Promise((resolve, reject) => setTimeout(() => reject(new PushError('Service worker se nespustil.', 0)), READY_WAIT_MS))
        ]);
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
            if (!configured() || !supported()) throw new PushError('Upozornění tento prohlížeč neumí.', 0);
            const permission = await root.Notification.requestPermission();
            if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
            const worker = await registration();
            let subscription = await worker.pushManager.getSubscription();
            // Předplatné s jiným klíčem serveru (po výměně VAPID klíčů) by nešlo použít
            const wanted = urlBase64ToBytes(vapidKey());
            const existing = subscription && subscription.options && subscription.options.applicationServerKey;
            if (subscription && existing && sameBytes(new Uint8Array(existing), wanted) === false) { await subscription.unsubscribe(); subscription = null; }
            if (!subscription) subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
            const row = rowFromSubscription(subscription);
            if (!row) { await subscription.unsubscribe().catch(() => {}); throw new PushError('Prohlížeč vrátil neúplné předplatné.', 0); }
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

        return { state, enable, disable, getPrefs, savePrefs, configured, supported, vapidKey };
    };

    const sameBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

    return { ...make(globalRoot), make, urlBase64ToBytes, rowFromSubscription, PushError, VAPID_PATTERN };
});
