// Odesílání upozornění (spouští GitHub Actions podle .github/workflows/push.yml): zavolá RPC push_due (kdo má co dostat), pošle web push
// přes knihovnu web-push a výsledek zapíše RPC push_mark. Používá jen veřejný klíč z config.js (role anon) a vlastní tajemství PUSH_CRON_SECRET;
// klíč service_role se nepoužívá a nikde není potřeba. Soukromý klíč VAPID_PRIVATE_KEY je jen v GitHub secrets.
// Proměnné prostředí: VAPID_PRIVATE_KEY, PUSH_CRON_SECRET (povinné), VAPID_SUBJECT (volitelné, výchozí adresa aplikace), FORCE=true (i v noci), DRY_RUN=true (nic nepošle).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const QUIET_FROM = 7;   // pražská hodina, od které se smí posílat
const QUIET_TO = 21;    // a do které (21:00 už ne)
const DEFAULT_SUBJECT = 'https://taronwho.github.io/geografie-kviz/app/';

// Veřejné hodnoty z config.js (supabaseUrl, supabaseAnonKey, vapidPublicKey)
export const readConfig = (text) => {
    const pick = (name) => (new RegExp(`${name}\\s*:\\s*'([^']*)'`).exec(text) || [])[1] || '';
    return { url: pick('supabaseUrl').replace(/\/+$/, ''), anonKey: pick('supabaseAnonKey'), vapidPublic: pick('vapidPublicKey') };
};

export const pragueHour = (now = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hourCycle: 'h23' }).format(now));
export const isQuietHour = (now = new Date()) => { const hour = pragueHour(now); return hour < QUIET_FROM || hour >= QUIET_TO; };

// Obsah upozornění; sw.js bere title, body, url a kind (tag)
export const payloadFor = (row) => JSON.stringify({ title: String(row.title || '').slice(0, 80), body: String(row.body || '').slice(0, 200), url: String(row.url || './'), kind: String(row.kind || '') });

// 404 a 410 = odběr už neexistuje (hráč ho v prohlížeči zrušil), ostatní chyby se jen počítají
export const classifyError = (error) => (error && (error.statusCode === 404 || error.statusCode === 410) ? 'gone' : 'failed');

// Jeden běh: rpc(name, body) volá databázi, send(row, payload) posílá jedno upozornění (a při chybě vyhodí výjimku se statusCode)
export const runOnce = async ({ rpc, send, secret, dryRun = false, log = console.log }) => {
    const rows = await rpc('push_due', { secret });
    if (!Array.isArray(rows) || !rows.length) { log('Nic k odeslání.'); return { sent: 0, failed: 0, gone: 0, keys: 0 }; }
    if (dryRun) { rows.forEach(row => log(`[dry-run] ${row.kind}: ${row.title}`)); return { sent: 0, failed: 0, gone: 0, keys: 0, dryRun: true }; }
    const okEndpoints = new Set();
    const failed = new Set();
    const gone = new Set();
    const keys = new Set();
    for (const row of rows) {
        try {
            await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payloadFor(row));
            okEndpoints.add(row.endpoint);
            keys.add(row.dedupe_key);
        } catch (error) {
            (classifyError(error) === 'gone' ? gone : failed).add(row.endpoint);
            log(`Odeslání selhalo (${error && error.statusCode ? error.statusCode : 'bez odpovědi'}).`);
        }
    }
    // Klíč se zapíše, jen když dorazilo aspoň na jedno zařízení; jinak se příští hodinu zkusí znovu (odběr s třemi chybami server smaže)
    await rpc('push_mark', { secret, keys: [...keys], ok_endpoints: [...okEndpoints], failed_endpoints: [...failed], gone_endpoints: [...gone] });
    log(`Odesláno ${okEndpoints.size} zařízením, chyb ${failed.size}, zrušených odběrů ${gone.size}.`);
    return { sent: okEndpoints.size, failed: failed.size, gone: gone.size, keys: keys.size };
};

const main = async () => {
    const config = readConfig(readFileSync(new URL('../config.js', import.meta.url), 'utf8'));
    const privateKey = process.env.VAPID_PRIVATE_KEY || '';
    const secret = process.env.PUSH_CRON_SECRET || '';
    if (!config.url || !config.anonKey || !config.vapidPublic) { console.log('config.js nemá supabaseUrl, supabaseAnonKey a vapidPublicKey, upozornění nejsou nastavená.'); return; }
    if (!privateKey || !secret) { console.log('Chybí secrets VAPID_PRIVATE_KEY nebo PUSH_CRON_SECRET (docs/SUPABASE.md), upozornění nejsou nastavená.'); return; }
    if (isQuietHour() && process.env.FORCE !== 'true') { console.log('Mimo 7:00 až 21:00 (Praha) se neposílá.'); return; }
    const { default: webpush } = await import('web-push');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || DEFAULT_SUBJECT, config.vapidPublic, privateKey);
    const rpc = async (name, body) => {
        const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
            method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`${name}: server odpověděl ${response.status}`);
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    };
    await runOnce({ rpc, send: (subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 6 * 3600, urgency: 'normal' }), secret, dryRun: process.env.DRY_RUN === 'true' });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => { console.error(error.message); process.exit(1); });
}
