// Nahlásit chybu v otázce: tlačítko v okně otázky i po odpovědi, výběr důvodu, odeslání do databáze, odmítnutí bez účtu,
// offline fronta a seznam hlášení ve vývojářském panelu; na telefonech 390×780 a 360×640 ve světlém i tmavém režimu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const LOGIN = JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Jana Nováková' } });
const PROFILE = { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [] };

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/config.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); return response.end(CONFIG); }
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

test('Nahlásit chybu v otázce', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // signedIn = přihlášený účet s falešnou databází; backend.posts = přijatá hlášení, backend.rows = hlášení, která vidí dev_admins
    const open = async ({ signedIn = false, dev = false, width = 390, height = 780, colorScheme = 'light', reportStatus = 201 } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript(({ login, dev: devOn }) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            if (login) localStorage.setItem('mudrlant.auth', login);
            if (devOn) localStorage.setItem('mudrlant.dev', '1');
        }, { login: signedIn ? LOGIN : null, dev });
        const backend = { posts: [], deletes: [], rows: [], reportStatus };
        await context.route(/^https:\/\//, route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            if (url.hostname !== 'proj.supabase.co') return route.abort();
            const json = (body, status = 200) => route.fulfill({ status, json: body });
            if (url.pathname.startsWith('/auth/')) return json({});
            if (url.pathname === '/rest/v1/question_reports') {
                if (request.method() === 'POST') {
                    if (backend.reportStatus >= 400) return json({ message: backend.reportStatus === 400 ? 'Dnes už jsi poslal hodně hlášení, zkus to zítra.' : 'chyba' }, backend.reportStatus);
                    backend.posts.push(JSON.parse(request.postData()));
                    return route.fulfill({ status: 201, body: '' });
                }
                if (request.method() === 'DELETE') { backend.deletes.push(url.searchParams.get('id')); backend.rows = []; return route.fulfill({ status: 204, body: '' }); }
                return json(backend.rows);
            }
            if (url.pathname === '/rest/v1/profiles') return json([PROFILE]);
            return json([]);
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="daily"][data-topic="historie"]');
        await tab.click('[data-action="daily"][data-topic="historie"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        await tab.waitForTimeout(600);
        return { context, tab, problems, backend };
    };
    const overflow = (tab, selector = '#app-content') => tab.evaluate((sel) => { const el = document.querySelector(sel); return el.scrollHeight - el.clientHeight; }, selector);
    const dialogFits = (tab) => tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { scroll: box.scrollHeight - box.clientHeight, bottom: rect.bottom <= window.innerHeight + 1, right: rect.right <= window.innerWidth + 1 }; });
    const hasInlineStyle = (tab) => tab.evaluate(() => document.querySelectorAll('#dialog-overlay [style], #app-content [style]').length);

    await t.test('tlačítko je v okně otázky, nic nepřetéká a okno se vejde na malé telefony ve světlém i tmavém režimu', async () => {
        for (const [width, height] of [[390, 780], [360, 640]]) {
            for (const colorScheme of ['light', 'dark']) {
                const { context, tab, problems } = await open({ signedIn: true, width, height, colorScheme });
                const before = await overflow(tab);
                await tab.waitForSelector('[data-action="report-question"]');
                const box = await tab.locator('[data-action="report-question"]').boundingBox();
                assert.ok(box.width >= 40 && box.height >= 40, 'tlačítko jde trefit prstem');
                assert.ok(box.x + box.width <= width, `tlačítko je na obrazovce (${width}×${height})`);
                await tab.click('[data-action="report-question"]');
                await tab.waitForSelector('#report-form');
                const fit = await dialogFits(tab);
                assert.equal(fit.scroll, 0, `okno hlášení se vejde bez posouvání (${width}×${height} ${colorScheme})`);
                assert.ok(fit.bottom && fit.right);
                assert.equal(await tab.locator('#report-form button[type="submit"]').isDisabled(), true, 'bez důvodu se neodešle');
                assert.equal(await hasInlineStyle(tab), 0, 'žádné inline styly');
                await tab.click('[data-close]');
                assert.equal(await overflow(tab), before, 'zavřené okno nic nezměnilo');
                assert.deepEqual(problems, []);
                await context.close();
            }
        }
    });

    await t.test('přihlášený hráč: důvod + text se uloží do question_reports a okno poděkuje', async () => {
        const { context, tab, backend, problems } = await open({ signedIn: true });
        const round = await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
        await tab.click('[data-action="report-question"]');
        await tab.click('[data-reason="nejasne-zadani"]');
        assert.equal(await tab.getAttribute('[data-reason="nejasne-zadani"]', 'aria-pressed'), 'true');
        await tab.fill('#report-note', 'Zadání se hodí k jiné osobě.');
        await tab.click('#report-form button[type="submit"]');
        await tab.waitForSelector('#dialog-overlay [role="status"]:has-text("Díky")');
        assert.equal(backend.posts.length, 1);
        const post = backend.posts[0];
        assert.equal(post.user_id, 'u-1');
        assert.equal(post.topic, 'historie');
        assert.equal(post.item_id, round.id);
        assert.equal(post.reason, 'nejasne-zadani');
        assert.equal(post.note, 'Zadání se hodí k jiné osobě.');
        assert.ok(post.title.length > 0 && post.title.length <= 200);
        await tab.click('#dialog-overlay [data-close]');
        // otázka zůstala rozehraná a jde dál odpovídat
        await tab.click('[data-action="choice"]');
        await tab.waitForSelector('[data-action="next"]');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('po odpovědi je tlačítko vedle Wikipedie a vejde se na 360×640', async () => {
        const { context, tab, backend } = await open({ signedIn: true, width: 360, height: 640, colorScheme: 'dark' });
        await tab.click('[data-action="choice"]');
        await tab.waitForSelector('[data-action="next"]');
        const report = await tab.locator('[data-action="report-question"]').boundingBox();
        const wiki = await tab.locator('a[href*="wikipedia.org/wiki"]').boundingBox();
        assert.ok(report.x + report.width <= 360 && wiki.x + wiki.width <= 360 + 1, 'obě tlačítka jsou v řádku na obrazovce');
        assert.ok(Math.abs(report.y - wiki.y) < 8, 'jsou vedle sebe');
        assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'bez vodorovného posouvání');
        await tab.click('[data-action="report-question"]');
        await tab.click('[data-reason="spatna-odpoved"]');
        await tab.click('#report-form button[type="submit"]');
        await tab.waitForSelector('#dialog-overlay [role="status"]:has-text("Díky")');
        assert.equal(backend.posts[0].reason, 'spatna-odpoved');
        assert.equal(backend.posts[0].note, '');
        await context.close();
    });

    await t.test('bez účtu se hlášení přátelsky odmítne a nic se neodešle', async () => {
        const { context, tab, backend } = await open({ signedIn: false });
        await tab.click('[data-action="report-question"]');
        await tab.click('[data-reason="jine"]');
        await tab.click('#report-form button[type="submit"]');
        await tab.waitForSelector('#dialog-overlay [role="status"]:has-text("Přihlas se")');
        assert.equal(backend.posts.length, 0);
        assert.equal(await tab.locator('#report-form').count(), 1, 'formulář zůstal, text se neztratil');
        await context.close();
    });

    await t.test('databáze hlášení odmítla (denní limit): ukáže se její zpráva', async () => {
        const { context, tab } = await open({ signedIn: true, reportStatus: 400 });
        await tab.click('[data-action="report-question"]');
        await tab.click('[data-reason="jine"]');
        await tab.click('#report-form button[type="submit"]');
        await tab.waitForSelector('#dialog-overlay [role="status"]:has-text("hodně hlášení")');
        await context.close();
    });

    await t.test('bez sítě se hlášení uloží do fronty a odešle po obnovení připojení', async () => {
        const { context, tab, backend } = await open({ signedIn: true });
        await context.setOffline(true);
        await tab.click('[data-action="report-question"]');
        await tab.click('[data-reason="spatny-obrazek"]');
        await tab.click('#report-form button[type="submit"]');
        await tab.waitForSelector('#dialog-overlay [role="status"]:has-text("offline")');
        assert.equal(backend.posts.length, 0);
        assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.reports')).length), 1);
        await context.setOffline(false);
        await tab.evaluate(() => window.dispatchEvent(new Event('online')));
        await tab.waitForFunction(() => localStorage.getItem('mudrlant.reports') === '[]');
        assert.equal(backend.posts.length, 1);
        assert.equal(backend.posts[0].reason, 'spatny-obrazek');
        await context.close();
    });

    await t.test('vývojářský panel: seznam hlášení a Vyřízeno', async () => {
        const { context, tab, backend, problems } = await open({ signedIn: true, dev: true });
        backend.rows = [{ id: 7, user_id: 'u-2', topic: 'historie', item_id: 'Q1', question_type: 'name', reason: 'spatna-odpoved', note: 'Správně je <b>jiný</b> panovník', title: 'Který panovník to byl?', answer: 'Karel IV.', created_at: '2026-11-04T10:00:00Z', author: { display_name: 'Petr' } }];
        await tab.click('#btn-settings');
        await tab.click('[data-dev="reports"]');
        await tab.waitForSelector('[data-report-done="7"]');
        const text = await tab.locator('#dialog-overlay').innerText();
        assert.match(text, /špatná odpověď/i);
        assert.match(text, /<b>jiný<\/b>/, 'text hlášení je vložen jako text, ne jako HTML');
        assert.equal(await tab.locator('#dialog-overlay b').count(), 0);
        assert.equal(await dialogFits(tab).then(fit => fit.right), true);
        await tab.click('[data-report-done="7"]');
        await tab.waitForSelector('#dialog-overlay:has-text("Zatím žádná hlášení")');
        assert.deepEqual(backend.deletes, ['eq.7']);
        assert.deepEqual(problems, []);
        await context.close();
    });
});
