// Časové souvislosti v prohlížeči (time-questions.js): otázka se ukáže jako obyčejná otázka se čtyřmi možnostmi (i ve variantě psaní),
// v panelu osobnost či čtyři položky, nápověda s osou nic neprozradí, po odpovědi vysvětlení s roky a osa všech možností (visuals.js chronology).
// Bez posouvání na 360×640 a 390×780 ve světlém i tmavém režimu, bez chyb CSP; do chyb ani opakování otázka nejde. SCREENSHOT_DIR=složka uloží snímky.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SCREENSHOT_DIR || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons/topics/historie.webp'));

// Stejné kontroly rozhraní jako tests/e2e-ui-audit.test.js (vodorovný posun, zakrytí, malé dotykové plochy, kontrast, uříznutý text)
const INSPECT = (() => {
    const source = fs.readFileSync(path.join(__dirname, 'e2e-ui-audit.test.js'), 'utf8');
    const start = source.indexOf('const inspect = () => {');
    const end = source.indexOf('\ntest(', start);
    return start >= 0 && end > start ? source.slice(start + 'const inspect = '.length, end).trim().replace(/;$/, '') : null;
})();
const audit = async (tab, scene) => {
    if (!INSPECT) return;
    await tab.evaluate(() => { const card = document.getElementById('celebration'); if (card) card.remove(); });
    await tab.waitForTimeout(150);
    const found = await tab.evaluate(`(${INSPECT})()`);
    // Štítek tématu a kategorie v hlavičce aplikace („Chemie · Chemické prvky“) se zkracuje záměrně, s otázkou nesouvisí
    found.clipped = found.clipped.filter(text => !/^„(Fyzika|Chemie|Hudba|Film|Historie) · /.test(text));
    for (const kind of Object.keys(found)) assert.deepEqual(found[kind], [], `${scene}: ${kind}`);
};

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

test('Časové souvislosti v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // force = druh otázky (meet, order…), categories = kategorie tématu (výběr položky)
    const open = async ({ width = 360, height = 640, colorScheme = 'light', variant = 'choices', topic = 'fyzika', categories = ['fyzici'], force = 'meet' } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
        const seed = {
            'mudrlant.account': 'host', 'mudrlant.variant': variant, 'mudrlant.tutorial': { how: 'done' }, 'mudrlant.tips': { off: true },
            'mudrlant.settings': { tier: 'known', categories: { [topic]: categories }, seen: [topic] }
        };
        await context.addInitScript((values) => {
            // Jen Časové souvislosti (číselné otázky vypnuté, druh otázky vynucený níž)
            window.MUDRLANT_NUMERIC_RATE = 0;
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, key === 'mudrlant.variant' ? value : JSON.stringify(value));
        }, seed);
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy|Uncaught/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForFunction(() => Boolean(window.MudrlantTime));
        await tab.evaluate((kind) => { window.MudrlantTime.force = kind; }, force);
        await tab.click(`[data-action="play-topic"][data-topic="${topic}"]`);
        await tab.waitForSelector('[data-time-lead]', { timeout: 30000 });
        return { context, tab, problems };
    };
    const read = (tab, key) => tab.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    const overflow = async (tab) => { await tab.waitForTimeout(700); return tab.evaluate(() => { const content = document.getElementById('app-content'); return content.scrollHeight - content.clientHeight; }); };
    const inView = (tab, selector) => tab.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (!element) return false;
        const box = element.getBoundingClientRect();
        const bar = document.querySelector('[data-action="next"]');
        const bottom = bar ? bar.getBoundingClientRect().top : window.innerHeight;
        return box.top >= 0 && box.bottom <= bottom + 1 && box.height > 0;
    }, selector);
    const shot = async (tab, name) => {
        if (!SHOTS) return;
        await tab.waitForTimeout(600);
        await tab.evaluate(() => { const celebration = document.getElementById('celebration'); if (celebration) celebration.remove(); });
        await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    };
    const session = (tab) => read(tab, 'mudrlant.session');

    await t.test('Mohli se potkat na 360×640: osobnost v panelu, nápověda s osou, vysvětlení a osa po odpovědi', async () => {
        const { context, tab, problems } = await open();
        const { data } = await session(tab);
        assert.equal(data.question.type, 'time');
        assert.equal(data.time.type, 'meet');
        assert.equal(data.question.title, 'Kdo z nich mohl potkat tuto osobnost?');
        assert.equal(await tab.textContent('[data-header-label]').then(text => text.trim()), 'Časové souvislosti');
        assert.equal((await tab.textContent('[data-time-subject]')).trim(), data.time.subject.name);
        // Roky osobnosti před nápovědou vidět nejsou (ty jsou nápovědou)
        assert.ok(!(await tab.textContent('[data-time-lead]')).includes(String(data.time.subject.from)));
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.ok(await overflow(tab) <= 1, 'otázka bez posouvání na 360×640');
        await shot(tab, 'cas-otazka-360');
        await audit(tab, 'otázka Mohli se potkat (360×640)');
        // Nápověda 1: osa jen s osobností (žádný rok možnosti), nápověda 2: roky jedné nesprávné možnosti
        await tab.click('[data-action="hint"]');
        await tab.waitForSelector('#hint-visual svg');
        const hint = (await session(tab)).data.hints[0];
        assert.equal(hint.kind, 'visual');
        assert.deepEqual(hint.spec.spans.map(span => [span.from, span.to]), [[data.time.subject.from, data.time.subject.to]]);
        assert.ok(await overflow(tab) <= 1, 'ani s osou se nic neposune');
        await shot(tab, 'cas-napoveda-osa-360');
        await tab.click('[data-action="hint"]');
        const facts = await tab.textContent('#hint-tab-panel');
        const correct = data.question.choices.find(choice => choice.correct);
        assert.ok(!facts.includes(correct.label), 'nápověda neprozradí správnou možnost');
        // Špatná odpověď: vysvětlení s pěti řádky (osobnost + 4 možnosti) a osa jako první záložka výsledku
        const wrongIndex = data.question.choices.findIndex(choice => !choice.correct);
        await tab.click(`[data-action="choice"][data-index="${wrongIndex}"]`);
        await tab.waitForSelector('[data-time-explain]');
        assert.equal(await tab.locator('[data-time-explain] li').count(), 5);
        const explain = await tab.textContent('[data-time-explain]');
        for (const row of data.time.rows) assert.ok(explain.includes(row.years), `roky ${row.name}`);
        assert.match(explain, /současně \d+ (let|roky|rok)/);
        await tab.waitForSelector('#result-visual svg');
        assert.equal(await tab.getAttribute('[data-action="result-tab"][aria-selected="true"]', 'data-step') ?? 'visual', 'visual');
        assert.equal(await tab.locator('#result-visual svg text').count() >= 5, true, 'popisky všech řádků na ose');
        await shot(tab, 'cas-vysledek-360');
        assert.ok(await inView(tab, '[data-time-explain]'), 'vysvětlení je vidět bez posouvání');
        await audit(tab, 'výsledek Mohli se potkat (360×640)');
        assert.ok(await inView(tab, '[data-verdict]'));
        // Do chyb ani opakování se otázka nepočítá, body nula, XP za pokus
        const mistakes = (await read(tab, 'mudrlant.mistakes')) || [];
        assert.ok(!mistakes.some(key => key.endsWith(`:${data.id}`)), 'není v chybách');
        const round = (await session(tab)).round;
        assert.equal(round.correct, false);
        assert.equal(round.points, 0);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Co bylo dřív na 390×780 v tmavém režimu: čtyři položky v panelu, správná odpověď za plné body', async () => {
        const { context, tab, problems } = await open({ width: 390, height: 780, colorScheme: 'dark', topic: 'chemie', categories: ['prvky'], force: 'order' });
        const { data } = await session(tab);
        assert.equal(data.time.type, 'order');
        assert.match(data.question.title, /^Který prvek byl objeven (nejdřív|nejpozději)\?$/);
        assert.equal(await tab.locator('[data-time-lead="items"] li').count(), 4);
        assert.ok(await overflow(tab) <= 1, 'otázka bez posouvání na 390×780');
        await shot(tab, 'cas-poradi-390-tmavy');
        await audit(tab, 'otázka Co bylo dřív (390×780, tmavý)');
        const correctIndex = data.question.choices.findIndex(choice => choice.correct);
        await tab.click(`[data-action="choice"][data-index="${correctIndex}"]`);
        await tab.waitForSelector('[data-time-explain]');
        const round = (await session(tab)).round;
        assert.equal(round.correct, true);
        assert.equal(round.points, 4);
        assert.equal(await tab.locator('[data-time-explain] li').count(), 4, 'u otázky bez osobnosti jen čtyři možnosti');
        await tab.waitForSelector('#result-visual svg');
        assert.ok(await inView(tab, '[data-time-explain]'));
        await shot(tab, 'cas-poradi-vysledek-390-tmavy');
        await audit(tab, 'výsledek Co bylo dřív (390×780, tmavý)');
        const progress = await read(tab, 'mudrlant.progress');
        assert.equal(progress.counters.timeAnswered, 1, 'počítadlo pro tip Mudrlanta');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('ve variantě psaní jsou u Časových souvislostí možnosti (body jako u psaní, jako u číselných otázek)', async () => {
        const { context, tab, problems } = await open({ variant: 'typed', topic: 'hudba', categories: ['skladatele'], force: 'after' });
        const { data } = await session(tab);
        assert.equal(data.time.type, 'after');
        assert.match(data.question.title, /až po smrti této osobnosti\?$/);
        assert.equal(await tab.locator('#answer-input').count(), 0, 'bez pole pro psaní');
        assert.equal(await tab.locator('[data-action="choice"]').count(), 4);
        assert.match(await tab.textContent('#app-content'), /Za 8 bodů/);
        // Panel s osobností nahoře, možnosti pod ním (pole pro psaní nahoru kvůli klávesnici tu není)
        const lead = await tab.locator('[data-time-lead]').boundingBox();
        const choice = await tab.locator('[data-action="choice"]').first().boundingBox();
        assert.ok(lead.y < choice.y);
        assert.ok(await overflow(tab) <= 1);
        await shot(tab, 'cas-za-zivota-psani-360');
        await tab.click(`[data-action="choice"][data-index="${data.question.choices.findIndex(choice => choice.correct)}"]`);
        await tab.waitForSelector('[data-time-explain]');
        const round = (await session(tab)).round;
        assert.equal(round.correct, true);
        assert.equal(round.points, 8);
        assert.equal(round.typed, false, 'odpověď z možností (odznak za psaní se nepočítá)');
        assert.match(await tab.textContent('[data-time-explain]'), /po smrti/);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Kolik let bylo: čísla jako možnosti, vysvětlení s výpočtem', async () => {
        const { context, tab, problems } = await open({ topic: 'film', categories: ['filmy'], force: 'age' });
        const { data } = await session(tab);
        assert.equal(data.time.type, 'age');
        assert.match(data.question.title, /^Kolik let bylo (režisérovi|režisérce), když měl tento film premiéru\?$/);
        const labels = data.question.choices.map(choice => Number.parseInt(choice.label, 10));
        assert.deepEqual([...labels].sort((a, b) => a - b), labels, 'věky vzestupně');
        assert.ok(labels.every((value, i) => i === 0 || value - labels[i - 1] >= 5));
        assert.ok(await overflow(tab) <= 1);
        await tab.click('[data-action="give-up"]');
        await tab.waitForSelector('[data-time-explain]');
        assert.match(await tab.textContent('[data-time-explain]'), /\d{4} − \d{4} = \d+/);
        await shot(tab, 'cas-vek-vysledek-360');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Kvíz dne (od 14. 11. 2026): Časová souvislost na pozici ze semínka dne, jen s výběrem, s vysvětlením', async () => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 360, height: 640 } });
        await context.addInitScript((values) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, key === 'mudrlant.variant' ? value : JSON.stringify(value));
        }, { 'mudrlant.account': 'host', 'mudrlant.variant': 'typed', 'mudrlant.tutorial': { how: 'done' }, 'mudrlant.tips': { off: true } });
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy|Uncaught/i.test(message.text())) problems.push(message.text()); });
        await tab.clock.setFixedTime(new Date('2026-11-20T10:00:00Z'));
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#quiz-card', { timeout: 30000 });
        await tab.click('#quiz-card');
        await tab.waitForSelector('#quiz-intro');
        await tab.click('[data-action="quiz-start"]');
        let found = null;
        for (let index = 0; index < 10 && !found; index++) {
            await tab.waitForSelector('[data-action="choice"]', { timeout: 60000 });
            const { data } = await session(tab);
            if (data.question.type === 'time') { found = { index, data }; break; }
            await tab.click('[data-action="choice"][data-index="0"]');
            await tab.waitForSelector('[data-action="next"]');
            await tab.click('[data-action="next"]');
        }
        assert.ok(found, 'v Kvízu dne je Časová souvislost');
        assert.ok(found.index >= 2, 'ne mezi prvními dvěma (nejsnazšími) otázkami');
        assert.equal(await tab.locator('#answer-input').count(), 0, 'jen výběr z možností');
        assert.ok(await overflow(tab) <= 1, 'otázka Kvízu dne bez posouvání');
        await shot(tab, 'cas-kviz-dne-360');
        await tab.click(`[data-action="choice"][data-index="${found.data.question.choices.findIndex(choice => choice.correct)}"]`);
        await tab.waitForSelector('[data-time-explain]');
        const quiz = await read(tab, 'mudrlant.dailyQuiz');
        const attempt = quiz.attempt || quiz;
        const result = (attempt.results || [])[found.index];
        assert.ok(result && result.correct && result.points === 4, 'v Kvízu dne nejvýš 4 body');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
