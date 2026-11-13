// Odesílání upozornění (běží v GitHub Actions podle .github/workflows/push.yml: hned, když ho přes workflow_dispatch spustí databáze – push_kick
// v supabase/schema.sql, záložně podle hodinového plánu a ručně přes Run workflow): zavolá RPC push_due (kdo má co dostat), pošle web push
// přes knihovnu web-push a výsledek zapíše RPC push_mark. Používá jen veřejný klíč z config.js (role anon) a vlastní tajemství PUSH_CRON_SECRET;
// klíč service_role se nepoužívá a nikde není potřeba. Soukromý klíč VAPID_PRIVATE_KEY je jen v GitHub secrets.
// Proměnné prostředí: VAPID_PRIVATE_KEY, PUSH_CRON_SECRET (povinné), VAPID_SUBJECT (volitelné, výchozí adresa aplikace), DRY_RUN=true (nic nepošle),
// MANUAL=true (běh typu workflow_dispatch, tedy ruční nebo spuštěný databází: v nočním klidu pošle aspoň zkušební upozornění z vývojářského režimu),
// FORCE=true (v noci pošle všechno). Noční klid 21:00–7:00 (Praha): plánovaný běh nepošle nic; ruční běh jen zprávy druhu 'test' (ostatní počkají
// na ráno – nezapíšou se jako odeslané). Stejné pravidlo pro noc má push_kick v databázi, aby workflow v noci nespouštěl zbytečně.
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

// Jak dlouho push služba upozornění drží, když zařízení není dostupné (s): upozornění ke kolu v Dobývání (druhy 'conquest_round' a
// 'conquest_ending', blok 29 v supabase/schema.sql) jen 10 minut – pozdě doručené by mluvilo o kole, které už skončilo; ostatní 6 hodin
const SHORT_LIVED = new Set(['conquest_round', 'conquest_ending']);
export const ttlFor = (row) => (row && SHORT_LIVED.has(row.kind) ? 10 * 60 : 6 * 3600);

// 404 a 410 = odběr už neexistuje (hráč ho v prohlížeči zrušil), ostatní chyby se jen počítají
export const classifyError = (error) => (error && (error.statusCode === 404 || error.statusCode === 410) ? 'gone' : 'failed');

// Co se v tomto běhu smí poslat: { send: false } = nic (noční klid, plánovaný běh), kinds = jen tyto druhy (null = všechny)
export const planRun = ({ now = new Date(), manual = false, force = false } = {}) => {
    if (!isQuietHour(now) || force) return { send: true, kinds: null };
    return manual ? { send: true, kinds: ['test'] } : { send: false, kinds: null };
};

// Jeden běh: rpc(name, body) volá databázi, send(subscription, payload, row) posílá jedno upozornění (a při chybě vyhodí výjimku se statusCode);
// kinds = pošlou se jen tyto druhy, ostatní zůstanou v databázi neoznačené a přijdou při dalším běhu
export const runOnce = async ({ rpc, send, secret, dryRun = false, kinds = null, log = console.log }) => {
    const all = await rpc('push_due', { secret });
    const rows = Array.isArray(all) && kinds ? all.filter(row => kinds.includes(row.kind)) : all;
    if (Array.isArray(all) && kinds && all.length > rows.length) log(`Noční klid: ${all.length - rows.length} upozornění počká na ráno, posílá se jen ${kinds.join(', ')}.`);
    if (!Array.isArray(rows) || !rows.length) { log('Nic k odeslání.'); return { sent: 0, failed: 0, gone: 0, keys: 0 }; }
    if (dryRun) { rows.forEach(row => log(`[dry-run] ${row.kind}: ${row.title}`)); return { sent: 0, failed: 0, gone: 0, keys: 0, dryRun: true }; }
    const okEndpoints = new Set();
    const failed = new Set();
    const gone = new Set();
    const keys = new Set();
    for (const row of rows) {
        try {
            await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payloadFor(row), row);
            okEndpoints.add(row.endpoint);
            keys.add(row.dedupe_key);
        } catch (error) {
            (classifyError(error) === 'gone' ? gone : failed).add(row.endpoint);
            log(`Odeslání selhalo (${error && error.statusCode ? error.statusCode : 'bez odpovědi'}).`);
        }
    }
    // Klíč se zapíše, jen když dorazilo aspoň na jedno zařízení; jinak se zkusí znovu při dalším běhu (odběr s třemi chybami server smaže)
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
    const plan = planRun({ manual: process.env.MANUAL === 'true', force: process.env.FORCE === 'true' });
    if (!plan.send) { console.log('Mimo 7:00 až 21:00 (Praha) se neposílá. (Ručně spuštěný běh pošle v noci aspoň zkušební upozornění.)'); return; }
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
    await runOnce({ rpc, send: (subscription, payload, row) => webpush.sendNotification(subscription, payload, { TTL: ttlFor(row), urgency: 'normal' }), secret, dryRun: process.env.DRY_RUN === 'true', kinds: plan.kinds });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => { console.error(error.message); process.exit(1); });
}
