// XP sezóny nesmí stát, když hráč hraje (hlášení „XP v sezóně stojí na stejné hodnotě“, sezóna Listopad 2026, stupeň 14, 8 934 XP):
// - souběh se synchronizací postupu (app.js syncProgress): XP získané během čekání na odpověď účtu se nepřepíše starším stavem zařízení
//   a nepovažuje se za „XP z jiného zařízení“ (season.js shift by jinak posunul začátek sezóny a XP sezóny by se ztratilo);
// - vývojářský zkušební režim (mudrlant.dev.backup): okno sezóny ukáže, že XP sezóny se nepočítá; Ukončit zkoušku, XP nechat vrátí odměny,
//   ale XP z doby zkoušky nechá (sezóna se dorovná); zkouška jen odměn (Truhla Mudrlanta) XP sezóny nezastaví a Vrátit můj postup XP nechá.
// Telefon 360×640 (světlý i tmavý), okno sezóny bez posouvání a bez chyb CSP. MUDRLANT_SHOTS=adresář uloží snímky.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');
const nav = require('./nav.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.MUDRLANT_SHOTS || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const NOW = '2026-11-27T18:31:00Z';
const NOV = '2026-11';
// Odznaky, které hráč s 10 000 XP dávno má (ať se v testu neslaví nové)
const BADGES = { tyden: '2026-10-01', 'serie-3': '2026-10-01', 'uroven-5': '2026-10-01', 'uroven-10': '2026-10-01', 'uroven-20': '2026-10-01' };
// Sezóna jako na snímku od hráče: začátek při 1 066 XP, stupně 1–14 vyzvednuté → při 10 000 XP 8 934 XP sezóny
const START = 1066;
const CLAIMED = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, 'xp:150']));
const REWARDS = { season: { id: NOV, startXp: START, claimed: CLAIMED } };

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (fixtures.files[pathname]) { response.writeHead(200, { 'content-type': 'application/json' }); return response.end(JSON.stringify(fixtures.files[pathname])); }
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

test('XP sezóny: souběh se synchronizací a zkušební režim vývojáře', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // Účet na „serveru“: profil s XP a odměnami; onProgress = co se stane během čekání na odpověď (souběžná hra v zařízení)
    const backend = async (context, account) => {
        await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.hostname !== 'proj.supabase.co') return route.abort();
            const json = (body, status = 200) => route.fulfill({ status, json: body });
            if (url.pathname.startsWith('/auth/')) return json({});
            if (url.pathname === '/rest/v1/profiles') {
                const select = url.searchParams.get('select') || '';
                if (request.method() === 'PATCH') {
                    const body = request.postDataJSON();
                    if (body.xp !== undefined) { account.xp = Math.max(account.xp, body.xp); account.pushes.push(body.xp); }
                    if (body.rewards !== undefined) account.rewards = body.rewards;
                    return json([]);
                }
                if (/^xp,badges/.test(select)) {
                    account.reads += 1;
                    const xp = account.xp;
                    if (account.onProgress) { const run = account.onProgress; account.onProgress = null; await run(); }
                    return json([{ xp, badges: [] }]);
                }
                if (select === 'rewards') return json([{ rewards: account.rewards }]);
                return json([{ id: 'u-1', display_name: 'Jana', avatar: '🦊', color: 'emerald', xp: account.xp, badges: [] }]);
            }
            if (url.pathname === '/rest/v1/rpc/schema_version') return json(53);
            return json([]);
        });
    };
    const login = { 'mudrlant.auth': { access_token: 'tok', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'jana@example.com', name: 'Jana' } } };
    // seed = JSON hodnoty, raw = textové hodnoty (příznaky vývojářského režimu)
    const open = async ({ seed = {}, raw = {}, account = null, viewport = { width: 360, height: 640 }, colorScheme = 'light' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion: 'reduce' });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript(([data, text]) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.variant', 'choices');
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
            for (const [key, value] of Object.entries(text)) localStorage.setItem(key, value);
        }, [{ 'mudrlant.account': 'host', 'mudrlant.tutorial': { how: 'done' }, 'mudrlant.tips': { off: true }, 'mudrlant.nickDone': true, ...seed }, raw]);
        if (account) await backend(context, account);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.clock.setFixedTime(new Date(NOW));
        await tab.goto(`${origin}/`);
        await nav.waitForHome(tab);
        return { context, tab, problems };
    };
    const storage = (tab, key) => tab.evaluate((name) => JSON.parse(localStorage.getItem(name)), key);
    const until = async (check, message, timeout = 20000) => {
        const end = Date.now() + timeout;
        while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 150)); }
        assert.fail(message);
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const clearCelebrations = async (tab) => { for (let i = 0; i < 8 && await tab.locator('#celebration').count(); i++) { await tab.locator('#celebration').click({ timeout: 1500 }).catch(() => {}); await tab.waitForTimeout(250); } };
    const seasonCard = async (tab) => {
        await clearCelebrations(tab);
        await nav.action(tab, 'season-open');
        await tab.waitForSelector('#dialog-overlay [data-season-path]');
        return (await tab.textContent('#dialog-overlay [data-season-path]')).replace(/\s+/g, ' ');
    };
    const dialogOverflow = (tab) => tab.evaluate(() => { const box = document.getElementById('dialog-overlay').firstElementChild; return box.scrollHeight - box.clientHeight; });
    const progress = (xp) => ({ xp, counters: { bestStreak: 5 }, badges: BADGES });

    await t.test('XP získané během synchronizace se nepřepíše a sezóna se neposune', async () => {
        // Účet má o 50 XP víc než zařízení při startu synchronizace (zapsalo je jiné zařízení); během čekání na odpověď hráč v tomto
        // zařízení získá 100 XP (odpověď v minihře). Dřív: zařízení skončilo na 10 050 XP (100 XP pryč) a začátek sezóny se posunul o 50
        // → XP sezóny 8 934 stálo. Teď: 10 100 XP, sezóna 9 034 XP.
        const account = { xp: 10050, rewards: null, reads: 0, pushes: [], onProgress: null };
        let tabRef = null;
        account.onProgress = async () => {
            await tabRef.evaluate(() => {
                const saved = JSON.parse(localStorage.getItem('mudrlant.progress'));
                localStorage.setItem('mudrlant.progress', JSON.stringify({ ...saved, xp: saved.xp + 100 }));
            });
        };
        // Odpověď účtu se pozdrží, než se stránka stihne načíst a předat referenci na kartu
        const gate = new Promise(resolve => { account.release = resolve; });
        const run = account.onProgress;
        account.onProgress = async () => { await gate; await run(); };
        const { context, tab, problems } = await open({ seed: { ...login, 'mudrlant.progress': progress(10000), 'mudrlant.rewards': REWARDS }, account });
        tabRef = tab;
        await until(() => account.reads > 0, 'aplikace se na postup v účtu nezeptala');
        account.release();
        await until(() => account.pushes.length > 0, 'postup se do účtu nezapsal');
        await until(async () => (await storage(tab, 'mudrlant.progress')).xp === 10100, 'XP získané během synchronizace se ztratilo');
        assert.deepEqual(account.pushes, [10100], 'do účtu jde XP i s tím, co přibylo během čekání');
        const rewards = await storage(tab, 'mudrlant.rewards');
        assert.equal(rewards.season.startXp, START, 'začátek sezóny se neposunul (XP z tohoto zařízení není z jiného zařízení)');
        assert.match(await seasonCard(tab), /Stupeň 14 z 20\s*9\s034 XP/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('XP opravdu z jiného zařízení se do sezóny tady nepočítá dvakrát (posun začátku zůstává)', async () => {
        const account = { xp: 10500, rewards: null, reads: 0, pushes: [], onProgress: null };
        const { context, tab, problems } = await open({ seed: { ...login, 'mudrlant.progress': progress(10000), 'mudrlant.rewards': REWARDS }, account });
        await until(async () => (await storage(tab, 'mudrlant.progress')).xp === 10500, 'XP z účtu nedorazilo');
        await until(async () => (await storage(tab, 'mudrlant.rewards')).season.startXp === START + 500, 'začátek sezóny se neposunul');
        assert.match(await seasonCard(tab), /Stupeň 14 z 20\s*8\s934 XP/, '500 XP z jiného zařízení se do sezóny tady nezapočítalo');
        assert.ok(account.pushes.every(xp => xp === 10500), 'do účtu nejde méně XP');
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark']]) {
        const tag = `${viewport.width}-${colorScheme}`;
        await t.test(`zkušební režim vývojáře je v okně sezóny vidět a XP z doby zkoušky jde nechat (${tag})`, async () => {
            // Zkouška založená starší verzí (bez příznaku zkoušky jen odměn): záloha při 10 000 XP, od té doby hráč získal 500 XP
            const { context, tab, problems } = await open({ viewport, colorScheme,
                seed: { 'mudrlant.progress': progress(10500), 'mudrlant.rewards': REWARDS, 'mudrlant.dev.backup': progress(10000), 'mudrlant.dev.rewardsBackup': REWARDS },
                raw: { 'mudrlant.dev': '1' } });
            const text = await seasonCard(tab);
            assert.match(text, /Stupeň 14 z 20\s*8\s934 XP/, 'XP sezóny stojí na záloze');
            assert.match(text, /184 \/ 1\s300 XP do stupně 15/);
            assert.match(await tab.textContent('[data-season-notice]'), /Zkušební režim: XP sezóny se nepočítá\. Ukončíš ho v Nastavení\./);
            assert.equal(await dialogOverflow(tab), 0, 'okno sezóny s poznámkou bez posouvání');
            await shot(tab, `sezona-zkusebni-rezim-${tag}`);
            await tab.keyboard.press('Escape');
            // Nastavení: vedle Vrátit můj postup i Ukončit zkoušku, XP nechat
            await nav.settings(tab, 'game');
            await tab.waitForSelector('[data-dev="keep"]');
            await shot(tab, `nastaveni-zkouska-${tag}`);
            await tab.click('[data-dev="keep"]');
            await until(async () => (await tab.evaluate(() => localStorage.getItem('mudrlant.dev.backup'))) === null, 'zkouška neskončila');
            assert.equal((await storage(tab, 'mudrlant.progress')).xp, 10500, 'XP z doby zkoušky zůstalo');
            assert.equal(await tab.locator('[data-dev="keep"]').count(), 0);
            await tab.keyboard.press('Escape');
            const after = await seasonCard(tab);
            assert.match(after, /Stupeň 14 z 20\s*9\s434 XP/, 'XP sezóny se dorovnalo');
            assert.equal(await tab.locator('[data-season-notice]').count(), 0, 'bez zkoušky bez poznámky');
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('zkouška jen odměn (Truhla Mudrlanta) XP sezóny nezastaví a Vrátit můj postup XP nechá', async () => {
        const { context, tab, problems } = await open({ seed: { 'mudrlant.progress': progress(10000), 'mudrlant.rewards': REWARDS }, raw: { 'mudrlant.dev': '1' } });
        await nav.settings(tab, 'game');
        await tab.click('[data-dev="chest"]');
        await tab.waitForSelector('#chest-overlay');
        await tab.evaluate(() => document.getElementById('chest-overlay').remove());
        assert.notEqual(await tab.evaluate(() => localStorage.getItem('mudrlant.dev.backup')), null, 'zkouška běží');
        // Hráč dál hraje (+300 XP)
        await tab.evaluate(() => { const saved = JSON.parse(localStorage.getItem('mudrlant.progress')); localStorage.setItem('mudrlant.progress', JSON.stringify({ ...saved, xp: saved.xp + 300 })); });
        const text = await seasonCard(tab);
        assert.match(text, /9\s234 XP/, 'XP sezóny přibývá i při zkoušce odměn');
        assert.match(await tab.textContent('[data-season-notice]'), /odměny teď vyzvednuté se po Vrátit můj postup vrátí/);
        await tab.keyboard.press('Escape');
        await nav.settings(tab, 'game');
        assert.equal(await tab.locator('[data-dev="keep"]').count(), 0, 'u zkoušky odměn stačí Vrátit můj postup');
        await tab.click('[data-dev="restore"]');
        await until(async () => (await tab.evaluate(() => localStorage.getItem('mudrlant.dev.backup'))) === null, 'zkouška neskončila');
        assert.equal((await storage(tab, 'mudrlant.progress')).xp, 10300, 'XP z doby zkoušky odměn zůstalo');
        assert.deepEqual((await storage(tab, 'mudrlant.rewards')).season, REWARDS.season, 'zkušební odměny pryč');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('zkouška postupu (úroveň 100): Vrátit můj postup vrátí zálohu, Ukončit zkoušku zkušební úroveň nepřevezme', async () => {
        const { context, tab, problems } = await open({ seed: { 'mudrlant.progress': progress(10000), 'mudrlant.rewards': REWARDS }, raw: { 'mudrlant.dev': '1' } });
        await nav.settings(tab, 'game');
        await tab.click('[data-dev="max"]');
        await until(async () => (await storage(tab, 'mudrlant.progress')).xp > 100000, 'zkušební úroveň se nenastavila');
        await clearCelebrations(tab);
        await tab.keyboard.press('Escape');
        assert.match(await seasonCard(tab), /8\s934 XP/, 'zkušební úroveň se do sezóny nepočítá');
        assert.match(await tab.textContent('[data-season-notice]'), /XP sezóny se nepočítá/);
        await tab.keyboard.press('Escape');
        await nav.settings(tab, 'game');
        await tab.click('[data-dev="keep"]');
        await until(async () => (await tab.evaluate(() => localStorage.getItem('mudrlant.dev.backup'))) === null, 'zkouška neskončila');
        assert.equal((await storage(tab, 'mudrlant.progress')).xp, 10000, 'úroveň 100 na zkoušku se nepřevzala');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
