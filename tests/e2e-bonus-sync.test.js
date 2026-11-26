// Postup bonusových funkcí v účtu v prohlížeči (bonus-sync.js, app.js syncBonus, social.js, schéma 52): telefon s pasem, poznanými položkami,
// Jednohubkou, Řazením dne a Statistikami ho po přihlášení nahraje do účtu; nový telefon ho z účtu dostane (dlaždice Pas, záložka Postup se
// vejde na 360×640 ve světlém i tmavém režimu); souběžný zápis jiného zařízení (odmítnutý podle verze) se sloučí znovu a nic se neztratí;
// se starou databází (schéma 51, bez tabulky) aplikace funguje dál, nic nezapisuje a dál se na tabulku neptá. MUDRLANT_SHOTS=… uloží snímky.
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

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date());

test('postup bonusových funkcí v účtu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // Účet na „serveru“: řádek bonus_progress a bonus_progress_save se stejnou podmínkou verze jako v supabase/schema.sql.
    // old = databáze ve schématu 51 (tabulka ani funkce nejsou: 404); beforeSave = jiné zařízení zapíše těsně před zápisem tohoto
    const account = { row: null, old: false, gets: 0, saves: 0, beforeSave: null };
    const backend = async (context) => {
        await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.hostname !== 'proj.supabase.co') return route.abort();
            const json = (body, status = 200) => route.fulfill({ status, json: body });
            if (url.pathname.startsWith('/auth/')) return json({});
            if (url.pathname === '/rest/v1/bonus_progress') {
                account.gets += 1;
                if (account.old) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
                return json(account.row ? [{ data: account.row.data, rev: account.row.rev }] : []);
            }
            if (url.pathname === '/rest/v1/rpc/bonus_progress_save') {
                account.saves += 1;
                if (account.old) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
                if (account.beforeSave) { const run = account.beforeSave; account.beforeSave = null; run(); }
                const { p_data: data, p_rev: rev } = request.postDataJSON();
                const have = account.row ? account.row.rev : 0;
                if (rev !== have) return json(null);
                account.row = { data, rev: have + 1 };
                return json(account.row.rev);
            }
            if (url.pathname === '/rest/v1/profiles') {
                if (request.method() === 'PATCH') return json([{ id: 'u-1', display_name: 'Jana', avatar: '🦊', color: 'emerald', ...request.postDataJSON() }]);
                return json([{ id: 'u-1', display_name: 'Jana', avatar: '🦊', color: 'emerald', xp: 500, badges: [] }]);
            }
            if (url.pathname === '/rest/v1/rpc/schema_version') return json(account.old ? 51 : 52);
            return json([]);
        });
    };
    const login = { 'mudrlant.auth': { access_token: 'tok', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'jana@example.com', name: 'Jana' } } };
    const open = async ({ seed = {}, viewport = { width: 390, height: 780 }, colorScheme = 'light' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme, reducedMotion: 'reduce', deviceScaleFactor: SHOTS ? 2 : 1 });
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; });
        await context.addInitScript((data) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.variant', 'choices');
            for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
        }, { 'mudrlant.account': 'host', 'mudrlant.tutorial': { how: 'done' }, 'mudrlant.tips': { off: true },
            'mudrlant.progress': { xp: 500, counters: {}, badges: {} }, 'mudrlant.nickDone': true, ...login, ...seed });
        await backend(context);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await nav.waitForHome(tab);
        return { context, tab, problems };
    };
    const storage = (tab, key) => tab.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    const until = async (check, message, timeout = 20000) => {
        const end = Date.now() + timeout;
        while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 200)); }
        assert.fail(message);
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

    // Starý telefon: razítka (Česko z dneška, Francie z dřívějška), poznané položky, Jednohubka, Řazení dne a souhrn Statistik
    const oldPhone = {
        'mudrlant.learned': { zemepis: ['Q213', 'Q142'], biologie: ['Q144'] },
        'mudrlant.passport': { v: 1, stamps: { Q213: DAY, Q142: '' }, done: {}, filled: { zemepis: true, vlajky: true }, seen: ['Q213', 'Q142'], doneSeen: [] },
        'mudrlant.snack': { v: 1, day: DAY, xp: 12, played: 9, correct: 7, streak: 2, best: 5, past: 5 },
        'mudrlant.sorting': { v: 1, day: DAY, xp: 0, games: 3, perfect: 1, cards: 18, daily: { [DAY]: { attempts: 1, spec: '' } } },
        'mudrlant.statistiky': { v: 1, since: DAY, days: { [DAY]: [6, 4] }, t: { zemepis: { stat: [6, 4] } }, m: { practice: [6, 4] } }
    };

    await t.test('starý telefon nahraje postup do účtu', async () => {
        const { context, tab, problems } = await open({ seed: oldPhone });
        await until(() => account.row !== null, 'postup se do účtu nezapsal');
        const data = account.row.data;
        assert.deepEqual(data.passport.stamps, { Q213: DAY, Q142: '' });
        assert.deepEqual(data.learned.zemepis.slice().sort(), ['Q142', 'Q213']);
        assert.equal(data.snack.best, 5);
        assert.ok(data.sorting.daily[DAY]);
        const own = Object.values(data.dev)[0].c;
        assert.deepEqual(own.stats.days[DAY], [6, 4], 'Statistiky jako agregát po dnech');
        assert.deepEqual([own.snack.played, own.sorting.games], [9, 3]);
        const meta = await storage(tab, 'mudrlant.bonussync');
        assert.ok(meta.device && meta.user === 'u-1');
        assert.deepEqual(problems, []);
        await context.close();
    });

    for (const [viewport, colorScheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light']]) {
        const tag = `${viewport.width}-${colorScheme}`;
        await t.test(`nový telefon dostane postup z účtu (${tag})`, async () => {
            const { context, tab, problems } = await open({ viewport, colorScheme });
            await until(async () => ((await storage(tab, 'mudrlant.passport')) || { stamps: {} }).stamps.Q213 === DAY, 'razítka z účtu nedorazila');
            assert.deepEqual((await storage(tab, 'mudrlant.learned')).zemepis.sort(), ['Q142', 'Q213']);
            const snack = await storage(tab, 'mudrlant.snack');
            assert.deepEqual([snack.played, snack.correct, snack.best, snack.streak], [9, 7, 5, 0]);
            const sorting = await storage(tab, 'mudrlant.sorting');
            assert.ok(sorting.daily[DAY], 'dnešní Řazení dne je dohrané (XP se nevyplatí podruhé)');
            assert.deepEqual((await storage(tab, 'mudrlant.statistiky')).days[DAY], [6, 4]);
            const passport = await storage(tab, 'mudrlant.passport');
            assert.deepEqual(passport.seen.sort(), ['Q142', 'Q213'], 'razítka z účtu se nebouchají jako nová');
            await nav.go(tab, 'postup');
            await tab.waitForFunction(() => /2 \/ 197/.test((document.querySelector('[data-open-passport]') || {}).textContent || ''), null, { timeout: 20000 });
            await tab.waitForTimeout(1500);
            const scroll = await tab.evaluate(() => { const content = document.getElementById('app-content'); return { y: content.firstElementChild.scrollHeight - content.clientHeight, x: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
            await shot(tab, `postup-z-uctu-${tag}`);
            // Svisle se Postup přihlášeného hráče se Sezónou na 360×640 nevejde už bez synchronizace (10. dlaždice); tady jen bez vodorovného posouvání
            assert.equal(scroll.x, 0, 'záložka Postup bez vodorovného posouvání');
            await tab.click('[data-open-passport]');
            try { await tab.waitForSelector('[data-pas]', { timeout: 10000 }); } catch (e) { await shot(tab, `pas-chyba-${tag}`); throw e; }
            assert.match((await tab.textContent('[data-pas-total]')).trim(), /^2 \/ \d+$/, 'testovací data mají jen pár států');
            await shot(tab, `pas-z-uctu-${tag}`);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('souběžný zápis jiného zařízení: odmítnutý zápis se sloučí znovu a nic se neztratí', async () => {
        const before = account.row.rev;
        // Jiné zařízení těsně před naším zápisem přidá razítko Německa a vlastní odehrané jednohubky
        account.beforeSave = () => {
            const data = JSON.parse(JSON.stringify(account.row.data));
            data.passport.stamps.Q183 = DAY;
            data.learned.zemepis = [...data.learned.zemepis, 'Q183'];
            data.dev.devjinezarizeni = { at: Date.now(), c: { snack: { played: 4, correct: 4 } } };
            account.row = { data, rev: account.row.rev + 1 };
        };
        const { context, tab, problems } = await open({ seed: { ...oldPhone, 'mudrlant.learned': { zemepis: ['Q213', 'Q142', 'Q30'], biologie: ['Q144'] },
            'mudrlant.passport': { ...oldPhone['mudrlant.passport'], stamps: { Q213: DAY, Q142: '', Q30: DAY }, seen: ['Q213', 'Q142', 'Q30'] } } });
        await until(() => account.row.rev >= before + 2 && account.row.data.passport.stamps.Q30 === DAY, 'druhý pokus o zápis neproběhl');
        const data = account.row.data;
        assert.deepEqual(Object.keys(data.passport.stamps).sort(), ['Q142', 'Q183', 'Q213', 'Q30']);
        assert.deepEqual(data.learned.zemepis.slice().sort(), ['Q142', 'Q183', 'Q213', 'Q30']);
        assert.ok(data.dev.devjinezarizeni, 'díl jiného zařízení zůstal');
        await until(async () => ((await storage(tab, 'mudrlant.passport')) || { stamps: {} }).stamps.Q183 === DAY, 'razítko jiného zařízení nedorazilo');
        // Jednohubky: vlastní díl tohoto zařízení + díl starého telefonu + 4 z jiného zařízení (každý díl jednou)
        const snack = await storage(tab, 'mudrlant.snack');
        assert.equal(snack.played, 9 + 9 + 4, 'jednohubky ze všech zařízení, každé jednou');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('stará databáze (schéma 51): bez chyb, bez zápisu a po prvním 404 se na tabulku dál neptá', async () => {
        account.old = true;
        account.gets = 0;
        account.saves = 0;
        const { context, tab, problems } = await open({ seed: oldPhone });
        await until(() => account.gets > 0, 'aplikace se na tabulku nezeptala');
        // Další hraní a sloučení postupu (syncProgress) už požadavek na tabulku neopakuje
        await nav.go(tab, 'postup');
        await nav.go(tab, 'hrat');
        await tab.evaluate(() => window.dispatchEvent(new Event('online')));
        await tab.waitForTimeout(2500);
        assert.equal(account.gets, 1);
        assert.equal(account.saves, 0);
        assert.deepEqual((await storage(tab, 'mudrlant.passport')).stamps, oldPhone['mudrlant.passport'].stamps, 'postup v zařízení beze změny');
        assert.equal(await tab.evaluate(() => localStorage.getItem('mudrlant.bonussync')), null, 'bez tabulky se nic nesloučilo');
        await nav.go(tab, 'postup');
        await tab.waitForSelector('[data-open-passport]');
        assert.deepEqual(problems, []);
        await context.close();
        account.old = false;
    });
});
