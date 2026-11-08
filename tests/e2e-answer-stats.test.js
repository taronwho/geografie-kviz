// Jak odpověděli ostatní: řádek „Správně odpovědělo … % hráčů“ po odpovědi (jen z aspoň 20 odpovědí, jen se sítí a souhrnem),
// souhrn tématu se stáhne jednou za den, odpovědi se pošlou jednou dávkou po hře (bez sítě počkají), host nic neposílá,
// a Podezřelé otázky ve vývojářském panelu. Na telefonech 360×640 a 390×780 ve světlém i tmavém režimu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SCREENSHOT_DIR || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const LOGIN = JSON.stringify({ access_token: 'tok-u1', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Jana Nováková' } });
const PROFILE = { id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', xp: 0, badges: [] };
const HISTORIE = fixtures.files['/data/historie.json'].items;
// Souhrn tématu ze serveru: u každé položky název 23/54 (43 %), století 10/40 (25 %), psaní 3/30 a 25/25; jedna položka jen s 19 odpověďmi
const TOPIC_ROWS = HISTORIE.flatMap(item => [[item.q, 'name', 'c', 54, 23], [item.q, 'century', 'c', 40, 10], [item.q, 'name', 't', 30, 3], [item.q, 'century', 't', 25, 25]]);
const expectedLine = (kind) => (kind === 'century' ? 'Správně odpovědělo 25 % hráčů' : 'Správně odpovědělo 43 % hráčů');

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

test('Jak odpověděli ostatní', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // backend.topicCalls = stažené souhrny, backend.submits = přijaté dávky; topicStatus/submitStatus = odpověď serveru
    const open = async ({ signedIn = true, dev = false, width = 390, height = 780, colorScheme = 'light', topicStatus = 200, rows = TOPIC_ROWS, suspicious = [], topic = 'historie', seed = null } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript(({ login, dev: devOn, seed: extra }) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            if (login) localStorage.setItem('mudrlant.auth', login);
            if (devOn) localStorage.setItem('mudrlant.dev', '1');
            for (const [key, value] of Object.entries(extra || {})) localStorage.setItem(key, value);
        }, { login: signedIn ? LOGIN : null, dev, seed });
        const backend = { topicCalls: [], submits: [], topicStatus, submitStatus: 200, rows, suspicious, other: [] };
        await context.route(/^https:\/\//, route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            if (url.hostname !== 'proj.supabase.co') return route.abort();
            const json = (body, status = 200) => route.fulfill({ status, json: body });
            if (url.pathname.startsWith('/auth/')) return json({});
            if (url.pathname === '/rest/v1/rpc/answer_stats_topic') {
                backend.topicCalls.push(JSON.parse(request.postData()).topic_id);
                return backend.topicStatus === 200 ? json(backend.rows) : json({ message: 'chyba' }, backend.topicStatus);
            }
            if (url.pathname === '/rest/v1/rpc/answer_stats_submit') {
                if (backend.submitStatus !== 200) return json({ message: 'chyba' }, backend.submitStatus);
                const body = JSON.parse(request.postData());
                backend.submits.push(body.answers);
                return json(body.answers.length);
            }
            if (url.pathname === '/rest/v1/rpc/dev_suspicious_questions') return json(backend.suspicious);
            if (url.pathname === '/rest/v1/rpc/schema_version') return json(REQUIRED_SCHEMA);
            if (url.pathname === '/rest/v1/rpc/dev_is_admin') return json(dev);
            if (url.pathname === '/rest/v1/profiles') return json([PROFILE]);
            if (url.pathname.includes('answer_stats')) backend.other.push(url.pathname);
            return json([]);
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        if (topic) {
            await tab.waitForSelector(`[data-action="daily"][data-topic="${topic}"]`);
            await tab.click(`[data-action="daily"][data-topic="${topic}"]`);
            await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        }
        return { context, tab, problems, backend };
    };
    const round = (tab) => tab.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session')).data);
    const cached = (tab, topic = 'historie') => tab.waitForFunction((id) => Boolean(localStorage.getItem(`mudrlant.answerStats.topic.${id}`)), topic);
    // Klepne na nesprávnou možnost (vrací její id) nebo na správnou
    const answer = async (tab, correct = false) => {
        const data = await round(tab);
        const index = data.question.choices.findIndex(choice => choice.correct === correct);
        await tab.click(`[data-action="choice"][data-index="${index}"]`);
        await tab.waitForSelector('[data-action="next"]');
        return { data, choice: data.question.choices[index] };
    };
    // Výsledek najíždí animací (fade-in: posun o 10 px, 0,5 s) – měří se až po ní, jinak by poloha závisela na tom, kdy přesně
    // měření v průběhu animace přišlo (u hosta a přihlášeného hráče pokaždé jindy)
    const layout = (tab) => tab.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => animation.effect && animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => null)));
        const rect = (selector) => { const el = document.querySelector(selector); if (!el) return null; const box = el.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height }; };
        return { line: rect('[data-answer-stats]'), verdict: rect('[data-verdict]'), next: rect('[data-action="next"]'), innerHeight, innerWidth, scrollWidth: document.documentElement.scrollWidth,
            inline: document.querySelectorAll('#app-content [style]:not(#map-tiles img):not([data-progress])').length };
    });

    await t.test('po odpovědi řádek se statistikou ostatních: jeden řádek ve verdiktu, Další zůstává na očích (360×640 a 390×780, světlý i tmavý)', async () => {
        for (const [width, height] of [[360, 640], [390, 780]]) {
            for (const colorScheme of ['light', 'dark']) {
                const { context, tab, problems, backend } = await open({ width, height, colorScheme });
                await cached(tab);
                const { data } = await answer(tab, colorScheme === 'dark');
                const text = await tab.locator('[data-answer-stats]').innerText();
                assert.equal(text.trim(), expectedLine(data.question.type));
                assert.match(await tab.getAttribute('[data-answer-stats]', 'title'), /^Podle \d+ odpovědí hráčů s účtem$/);
                const box = await layout(tab);
                assert.ok(box.line.height <= 18, `jeden řádek (${box.line.height}px, ${width}×${height})`);
                assert.ok(box.line.top >= box.verdict.top && box.line.bottom <= box.verdict.bottom, 'řádek je uvnitř verdiktu');
                assert.ok(box.line.right <= box.verdict.right && box.line.bottom <= height, 'řádek je celý vidět bez posouvání');
                assert.ok(box.next.bottom <= box.innerHeight + 0.5, `Další je vidět bez posouvání (${box.next.bottom} > ${box.innerHeight})`);
                assert.ok(box.scrollWidth <= box.innerWidth, 'bez vodorovného posouvání');
                assert.equal(await tab.locator('#app-content [data-answer-stats] [style]').count(), 0, 'žádné inline styly');
                assert.deepEqual(backend.topicCalls, ['historie'], 'souhrn tématu jen jednou');
                if (SHOTS) { await tab.waitForTimeout(900); await tab.screenshot({ path: path.join(SHOTS, `statistika-odpovedi-${width}-${colorScheme}.png`) }); }
                assert.deepEqual(problems, []);
                await context.close();
            }
        }
    });

    await t.test('Další je na stejném místě jako bez statistiky (host nic nestahuje ani neposílá)', async () => {
        const guest = await open({ signedIn: false, width: 360, height: 640 });
        await answer(guest.tab);
        assert.equal(await guest.tab.locator('[data-answer-stats]').count(), 0, 'host statistiku nevidí (souhrn se stahuje jen s účtem)');
        const without = await layout(guest.tab);
        await guest.tab.click('#btn-home');
        await guest.tab.waitForSelector('[data-action="daily"][data-topic="historie"]');
        assert.deepEqual(guest.backend.topicCalls, []);
        assert.deepEqual(guest.backend.submits, [], 'host odpovědi neposílá');
        assert.equal(await guest.tab.evaluate(() => localStorage.getItem('mudrlant.answerStats.queue')), null);
        await guest.context.close();
        const signed = await open({ width: 360, height: 640 });
        await cached(signed.tab);
        await answer(signed.tab);
        const withLine = await layout(signed.tab);
        assert.ok(withLine.line, 'přihlášený statistiku vidí');
        assert.ok(Math.abs(withLine.next.bottom - without.next.bottom) < 1, `tlačítko Další se neposunulo (${withLine.next.bottom} vs ${without.next.bottom})`);
        await signed.context.close();
    });

    await t.test('souhrn tématu platí den: po novém načtení se nestahuje znovu, po dni ano', async () => {
        const { context, tab, backend } = await open({ topic: null });
        await tab.click('[data-action="daily"][data-topic="historie"]');
        await cached(tab);
        assert.deepEqual(backend.topicCalls, ['historie']);
        const saved = JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.answerStats.topic.historie')));
        assert.equal(saved.rows.length, TOPIC_ROWS.length);
        await tab.reload();
        await tab.waitForSelector('[data-action="daily"][data-topic="historie"]');
        await tab.click('[data-action="daily"][data-topic="historie"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        await tab.waitForTimeout(400);
        assert.deepEqual(backend.topicCalls, ['historie'], 'v den stažení se neptá znovu');
        await context.clock.setFixedTime(new Date('2026-11-05T13:00:00'));
        await tab.reload();
        await tab.waitForSelector('[data-action="daily"][data-topic="historie"]');
        await tab.click('[data-action="daily"][data-topic="historie"]');
        await tab.waitForFunction(() => document.querySelector('[data-action="choice"]') || document.querySelector('[data-action="next"]'), null, { timeout: 30000 });
        await tab.waitForFunction(() => JSON.parse(localStorage.getItem('mudrlant.answerStats.topic.historie')).at > Date.parse('2026-11-05T00:00:00'));
        assert.deepEqual(backend.topicCalls, ['historie', 'historie'], 'po dni znovu');
        await context.close();
    });

    await t.test('odpovědi se pošlou jednou dávkou po hře, ne po každé odpovědi', async () => {
        const { context, tab, backend } = await open();
        await cached(tab);
        const { data, choice } = await answer(tab, false);
        await tab.waitForTimeout(300);
        assert.deepEqual(backend.submits, [], 'po odpovědi se nic neposílá');
        const queue = JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.answerStats.queue')));
        assert.equal(queue.user, 'u-1');
        assert.deepEqual(queue.list, [{ t: 'historie', q: data.id, k: data.question.type, v: 'choices', c: false, w: choice.id }]);
        // Další dnešní otázka (jiné téma), pak domů = konec hry
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        const second = await answer(tab, true);
        assert.deepEqual(backend.submits, []);
        await tab.click('#btn-home');
        await tab.waitForFunction(() => localStorage.getItem('mudrlant.answerStats.queue') === null);
        assert.equal(backend.submits.length, 1, 'jedna dávka');
        assert.deepEqual(backend.submits[0].map(entry => `${entry.t}:${entry.q}:${entry.c}`), [`historie:${data.id}:false`, `${second.data.topic}:${second.data.id}:true`]);
        await context.close();
    });

    await t.test('bez sítě se řádek neukáže a odpovědi počkají; po připojení odejdou', async () => {
        const { context, tab, backend } = await open();
        await cached(tab);
        await context.setOffline(true);
        await tab.evaluate(() => window.dispatchEvent(new Event('offline')));
        await answer(tab);
        assert.equal(await tab.locator('[data-answer-stats]').count(), 0, 'offline nic');
        await tab.click('#btn-home');
        await tab.waitForSelector('[data-action="daily"][data-topic="historie"]');
        assert.equal(backend.submits.length, 0);
        assert.equal(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.answerStats.queue'))).list.length, 1);
        await context.setOffline(false);
        await tab.evaluate(() => window.dispatchEvent(new Event('online')));
        await tab.waitForFunction(() => localStorage.getItem('mudrlant.answerStats.queue') === null);
        assert.equal(backend.submits.length, 1);
        await context.close();
    });

    await t.test('chyba serveru nebo málo odpovědí: nic se neukáže a hra jede dál', async () => {
        const broken = await open({ topicStatus: 500 });
        await broken.tab.waitForTimeout(500);
        await answer(broken.tab);
        assert.equal(await broken.tab.locator('[data-answer-stats]').count(), 0);
        assert.deepEqual(broken.problems, []);
        await broken.context.close();
        const few = await open({ rows: HISTORIE.map(item => [item.q, 'name', 'c', 19, 5]).concat(HISTORIE.map(item => [item.q, 'century', 'c', 19, 5])) });
        await cached(few.tab);
        await answer(few.tab);
        assert.equal(await few.tab.locator('[data-answer-stats]').count(), 0, 'pod 20 odpovědí nic');
        await few.context.close();
        // starší databáze bez funkce (404): bez řádku, bez chyby
        const old = await open({ topicStatus: 404 });
        await old.tab.waitForTimeout(500);
        await answer(old.tab);
        assert.equal(await old.tab.locator('[data-answer-stats]').count(), 0);
        assert.deepEqual(old.problems, []);
        await old.context.close();
    });

    await t.test('vývojářský panel: Podezřelé otázky s názvem, druhem, %, n, nejčastější chybou a detailem položky', async () => {
        const suspicious = [
            { topic: 'historie', item_id: 'Q42', kind: 'name', variant: 'choices', shown: 120, correct: 30, top_wrong: 'Q130005', top_wrong_count: 70, reason: 'mate' },
            { topic: 'historie', item_id: 'Q15', kind: 'century', variant: 'choices', shown: 80, correct: 12, top_wrong: 'stoleti-19', top_wrong_count: 30, reason: 'nizka' },
            { topic: 'zemepis', item_id: 'Q213', kind: 'location', variant: 'choices', shown: 64, correct: 9, top_wrong: 'Q39', top_wrong_count: 20, reason: 'nizka' },
            { topic: 'historie', item_id: 'Q99999', kind: 'name', variant: 'typed', shown: 50, correct: 1, top_wrong: '<img src=x onerror=__xss=1>', top_wrong_count: 2, reason: 'mate' }
        ];
        for (const [width, height, colorScheme] of [[360, 640, 'dark'], [390, 780, 'light']]) {
            const { context, tab, problems } = await open({ dev: true, topic: null, width, height, colorScheme, suspicious });
            await tab.click('#btn-settings');
            await tab.click('[data-dev="suspicious"]');
            await tab.waitForSelector('#suspicious-list li');
            const text = await tab.locator('#dialog-overlay').innerText();
            assert.match(text, /Podezřelé otázky/);
            assert.match(text, /Nesprávná možnost vede/i);
            assert.match(text, /Karel IV\./, 'název položky z dat tématu');
            assert.match(text, /25\s%\ssprávně z\s120/);
            assert.match(text, /Nejčastější chyba: Přemysl Otakar II\. \(58\s%\)/);
            assert.match(text, /19\. století/);
            assert.match(text, /Nejčastější chyba: Švýcarsko/, 'stát podle tabulky států');
            assert.match(text, /Historie · název · možnosti/);
            assert.match(text, /Historie · století · možnosti/);
            assert.match(text, /Zeměpis · stát · možnosti/);
            assert.match(text, /<img src=x onerror=__xss=1>/, 'text ze serveru je vložen jako text');
            assert.equal(await tab.evaluate(() => window.__xss), undefined);
            const fit = await tab.evaluate(() => { const box = document.querySelector('#dialog-overlay > div'); const rect = box.getBoundingClientRect(); return { right: rect.right <= innerWidth + 1, bottom: rect.bottom <= innerHeight + 1, wide: document.documentElement.scrollWidth <= innerWidth }; });
            assert.deepEqual(fit, { right: true, bottom: true, wide: true });
            if (SHOTS) { await tab.waitForTimeout(600); await tab.screenshot({ path: path.join(SHOTS, `podezrele-otazky-${width}-${colorScheme}.png`) }); }
            // detail položky (okno s popisem jako po odpovědi)
            await tab.click('[data-suspicious-item][data-id="Q42"]');
            await tab.waitForSelector('#place-info #place-info-title');
            assert.match(await tab.locator('#place-info-title').innerText(), /Karel IV\./);
            if (SHOTS) { await tab.waitForTimeout(600); await tab.screenshot({ path: path.join(SHOTS, `podezrele-otazky-detail-${width}-${colorScheme}.png`) }); }
            await tab.click('#place-info [data-close]');
            assert.equal(await tab.locator('#suspicious-list').count(), 1, 'seznam zůstal otevřený');
            assert.equal(await tab.locator('[data-suspicious-item][data-id="Q99999"]').count(), 0, 'neznámá položka bez detailu');
            assert.deepEqual(problems, []);
            await context.close();
        }
    });

    await t.test('Podezřelé otázky: účet mimo dev_admins dostane srozumitelnou hlášku', async () => {
        const { context, tab } = await open({ dev: true, topic: null });
        await context.route('https://proj.supabase.co/rest/v1/rpc/dev_suspicious_questions', route => route.fulfill({ status: 400, json: { message: 'Vývojářské nástroje turnajů nejsou pro tento účet zapnuté (viz docs/SUPABASE.md, dev_admins).' } }));
        await tab.click('#btn-settings');
        await tab.click('[data-dev="suspicious"]');
        await tab.waitForSelector('#dialog-overlay [role="status"]:has-text("dev_admins")');
        await context.close();
    });
});
