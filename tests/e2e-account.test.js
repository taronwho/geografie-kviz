// Moje data a právní stránky v prohlížeči: odkazy v Nastavení a v uvítání, export dat (JSON), smazání účtu s potvrzením
// (volá rpc/delete_my_account, odhlásí a vymaže data zařízení), chyba při smazání, stránky Soukromí a Licence (CSP, tmavý režim, telefon).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';
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

test('Moje data, smazání účtu a právní stránky', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const state = { calls: [], deleteReply: { status: 200, body: true }, exportReply: { status: 200, body: { ucet: { id: 'u-1', email: 'jana@example.com' }, profil: { display_name: 'Jana' }, vyzvy_prubeh: [], turnaje_odpovedi: [], turnaje_xp: [] } } };
    const backend = async (context) => {
        await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
        await context.route('https://proj.supabase.co/**', route => {
            const request = route.request();
            const url = new URL(request.url());
            const json = (body, status = 200) => route.fulfill({ status, json: body });
            if (url.pathname.startsWith('/auth/')) return json({});
            if (url.pathname === '/rest/v1/rpc/export_my_data') { state.calls.push('export'); return json(state.exportReply.body, state.exportReply.status); }
            if (url.pathname === '/rest/v1/rpc/delete_my_account') { state.calls.push('delete'); return json(state.deleteReply.body, state.deleteReply.status); }
            if (url.pathname === '/rest/v1/profiles') return json([{ id: 'u-1', display_name: 'Jana', avatar: '🦊', color: 'emerald', owl: null }]);
            // Schéma 3: XP za výhry v turnaji (nic nevyplaceného) a průběh výzev
            if (url.pathname === '/rest/v1/rpc/claim_tournament_xp') return json([]);
            if (url.pathname === '/rest/v1/rpc/challenge_progress_save') return json(1);
            return json([]);
        });
    };
    const login = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'jana@example.com', name: 'Jana' } }) };
    const open = async ({ signedIn = true, entries = {}, viewport = { width: 390, height: 780 }, scheme = 'light' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: scheme, acceptDownloads: true });
        await context.addInitScript(seed => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), ...(signedIn ? { ...login, 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', 'mudrlant.progress': JSON.stringify({ xp: 500, counters: {}, badges: {} }) } : {}), ...entries });
        await backend(context);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        return { context, tab, problems, goto: async (url = '/') => tab.goto(`${origin}${url}`) };
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, name), fullPage: true }); };

    await t.test('uvítání s přihlášením má v patičce odkazy na zásady a licence', async () => {
        const page = await open({ signedIn: false });
        await page.goto();
        await page.tab.waitForSelector('#account-welcome');
        assert.equal(await page.tab.getAttribute('#account-welcome a[href="soukromi.html"]', 'href'), 'soukromi.html');
        assert.equal(await page.tab.getAttribute('#account-welcome a[href="licence.html"]', 'href'), 'licence.html');
        await shot(page.tab, 'uvitani.png');
        await page.context.close();
        assert.deepEqual(page.problems, []);
    });

    await t.test('uvítání s výběrem varianty má odkazy (host bez varianty)', async () => {
        const page = await open({ signedIn: false, entries: { 'mudrlant.account': JSON.stringify('host') } });
        await page.goto();
        await page.tab.waitForSelector('#variant-welcome');
        assert.ok(await page.tab.locator('a[href="soukromi.html"]').count());
        assert.ok(await page.tab.locator('a[href="licence.html"]').count());
        await page.context.close();
    });

    await t.test('Nastavení: odkazy v patičce a okno Moje data', async () => {
        const page = await open();
        await page.goto();
        await page.tab.waitForSelector('#btn-settings span');
        await page.tab.click('#btn-settings');
        assert.ok(await page.tab.locator('#settings-overlay a[href="soukromi.html"]').count());
        assert.ok(await page.tab.locator('#settings-overlay a[href="licence.html"]').count());
        assert.equal(await page.tab.locator('[data-delete-account]').count(), 0, 'mazání není přímo v Nastavení');
        await shot(page.tab, 'nastaveni-hra.png');
        await page.tab.click('[data-open-privacy]');
        await page.tab.waitForSelector('#dialog-overlay [data-delete-account]');
        assert.ok(await page.tab.locator('#dialog-overlay [data-export-data]').count());
        assert.ok(await page.tab.locator('#dialog-overlay a[href="soukromi.html"]').count());
        await shot(page.tab, 'moje-data.png');
        await page.context.close();
        assert.deepEqual(page.problems, []);
    });

    await t.test('export: stáhne se JSON s daty ze serveru a ze zařízení, bez přihlašovacího tokenu', async () => {
        state.calls.length = 0;
        const page = await open();
        await page.goto();
        await page.tab.waitForSelector('#btn-settings span');
        await page.tab.click('#btn-settings');
        await page.tab.click('[data-open-privacy]');
        const [download] = await Promise.all([page.tab.waitForEvent('download'), page.tab.click('[data-export-data]')]);
        assert.match(download.suggestedFilename(), /^mudrlant-moje-data-.*\.json$/);
        const text = fs.readFileSync(await download.path(), 'utf8');
        const data = JSON.parse(text);
        assert.equal(data.server.ucet.email, 'jana@example.com');
        assert.equal(data.zarizeni['mudrlant.progress'].xp, 500);
        assert.ok(!('mudrlant.auth' in data.zarizeni), 'token v exportu není');
        assert.ok(!text.includes('"tok"') && !text.includes('refresh_token'));
        await page.context.close();
        assert.deepEqual(page.problems, []);
    });

    await t.test('smazání účtu: tlačítko jen žádá o potvrzení, Zrušit nic nesmaže', async () => {
        state.calls.length = 0;
        const page = await open();
        await page.goto();
        await page.tab.waitForSelector('#btn-settings span');
        await page.tab.click('#btn-settings');
        await page.tab.click('[data-open-privacy]');
        await page.tab.click('[data-delete-account]');
        await page.tab.waitForSelector('[data-delete-confirm]');
        assert.ok(await page.tab.locator('[role="alertdialog"]').innerText().then(text => /Opravdu smazat účet\?/.test(text) && /Nejde to vrátit/.test(text)));
        assert.deepEqual(state.calls, []);
        await shot(page.tab, 'smazat-potvrzeni.png');
        await page.tab.click('[data-delete-cancel]');
        await page.tab.waitForSelector('[data-delete-account]');
        assert.equal(await page.tab.locator('[data-delete-confirm]').count(), 0);
        assert.deepEqual(state.calls, []);
        assert.ok(await page.tab.evaluate(() => Boolean(localStorage.getItem('mudrlant.auth'))));
        await page.context.close();
    });

    await t.test('smazání účtu: chyba serveru (běžící turnaj) nic nevymaže a ukáže hlášku', async () => {
        state.calls.length = 0;
        state.deleteReply = { status: 400, body: { message: 'Právě hraješ turnaj. Účet půjde smazat, až z turnaje vypadneš nebo skončí.' } };
        const page = await open();
        await page.goto();
        await page.tab.waitForSelector('#btn-settings span');
        await page.tab.click('#btn-settings');
        await page.tab.click('[data-open-privacy]');
        await page.tab.click('[data-delete-account]');
        await page.tab.click('[data-delete-confirm]');
        await page.tab.waitForFunction(() => /hraješ turnaj/.test(document.getElementById('privacy-note').textContent));
        assert.deepEqual(state.calls, ['delete']);
        assert.ok(await page.tab.evaluate(() => Boolean(localStorage.getItem('mudrlant.auth')) && Boolean(localStorage.getItem('mudrlant.progress'))), 'data zůstala');
        await page.context.close();
    });

    await t.test('smazání účtu: potvrzení smaže na serveru, odhlásí, vymaže zařízení a ukáže potvrzení', async () => {
        state.calls.length = 0;
        state.deleteReply = { status: 200, body: true };
        const page = await open();
        await page.goto();
        await page.tab.waitForSelector('#btn-settings span');
        await page.tab.click('#btn-settings');
        await page.tab.click('[data-open-privacy]');
        await page.tab.click('[data-delete-account]');
        await Promise.all([page.tab.waitForNavigation(), page.tab.click('[data-delete-confirm]')]);
        await page.tab.waitForSelector('#dialog-overlay');
        assert.match(await page.tab.locator('#dialog-overlay').innerText(), /Účet je smazaný/);
        assert.deepEqual(state.calls, ['delete']);
        const left = await page.tab.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('mudrlant.') && key !== 'mudrlant.tutorial'));
        assert.ok(!left.includes('mudrlant.auth') && !left.includes('mudrlant.progress'), left.join(','));
        await shot(page.tab, 'smazano.png');
        await page.tab.click('#dialog-overlay [data-close]');
        await page.tab.waitForSelector('#account-welcome');
        await page.context.close();
        assert.deepEqual(page.problems, []);
    });

    await t.test('smazání účtu: server smazal data, ale ne přihlašovací záznam (false) – říká se to', async () => {
        state.deleteReply = { status: 200, body: false };
        const page = await open();
        await page.goto();
        await page.tab.waitForSelector('#btn-settings span');
        await page.tab.click('#btn-settings');
        await page.tab.click('[data-open-privacy]');
        await page.tab.click('[data-delete-account]');
        await Promise.all([page.tab.waitForNavigation(), page.tab.click('[data-delete-confirm]')]);
        await page.tab.waitForSelector('#dialog-overlay');
        assert.match(await page.tab.locator('#dialog-overlay').innerText(), /Přihlašovací záznam/);
        await page.context.close();
    });

    for (const scheme of ['light', 'dark']) {
        await t.test(`soukromi.html a licence.html (${scheme}): bez CSP chyb, bez vodorovného posunu na telefonu, seznam obrázků jde rozbalit a hledat`, async () => {
            const page = await open({ signedIn: false, viewport: { width: 360, height: 740 }, scheme });
            await page.goto('/soukromi.html');
            await page.tab.waitForSelector('#smazani');
            assert.ok(await page.tab.locator('.doplnit').count() > 3, 'chybějící údaje jsou zvýrazněné');
            assert.equal(await page.tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'soukromi.html: vodorovný posun');
            const bg = await page.tab.evaluate(() => getComputedStyle(document.querySelector('.legal-page > div')).backgroundColor);
            assert.equal(bg, scheme === 'dark' ? 'rgb(33, 35, 38)' : 'rgb(247, 246, 243)');
            await shot(page.tab, `soukromi-${scheme}.png`);
            await page.goto('/licence.html');
            await page.tab.waitForSelector('.licence-topic');
            assert.match(await page.tab.locator('#licence-summary').innerText(), /Obrázků celkem \d+/);
            await page.tab.click('.licence-topic[data-topic="vlajky"] > summary');
            await page.tab.waitForSelector('.licence-topic[data-topic="vlajky"] table tbody tr');
            assert.ok(await page.tab.locator('.licence-topic[data-topic="vlajky"] table tbody tr').count() > 5);
            await page.tab.fill('#licence-search', 'flag of');
            await page.tab.waitForFunction(() => /Nalezeno \d+ souborů/.test(document.getElementById('licence-summary').textContent));
            assert.equal(await page.tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'licence.html: vodorovný posun');
            await shot(page.tab, `licence-${scheme}.png`);
            await page.context.close();
            assert.deepEqual(page.problems, []);
        });
    }
});
