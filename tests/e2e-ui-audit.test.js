// Kontrola rozhraní na úzkém telefonu (360×640, světlý i tmavý režim): bez vodorovného posunu, hlavní tlačítka celá na očích a nezakrytá,
// dotykové plochy hlavních akcí aspoň 44 px, ikonová tlačítka s názvem, čitelný text (WCAG AA) a žádné chyby Content-Security-Policy.
// Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const VIEWPORT = { width: 360, height: 640 };

const startServer = () => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (fixtures.files[pathname]) { response.writeHead(200, { 'content-type': 'application/json' }); return response.end(JSON.stringify(fixtures.files[pathname])); }
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end(); }
        const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        response.writeHead(200, headers);
        response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

// Kontroly v prohlížeči: vodorovný posun, prvky mimo okno nebo zakryté, malé dotykové plochy, bez názvu, kontrast textu
const inspect = () => {
    const out = { hscroll: [], unreachable: [], covered: [], small: [], unnamed: [], contrast: [] };
    const vw = window.innerWidth, vh = window.innerHeight;
    const visible = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const overlay = document.getElementById('settings-overlay') || document.getElementById('dialog-overlay') || document.getElementById('play-chooser') || document.getElementById('place-info');
    const scope = overlay || document.body;
    const name = (el) => (el.getAttribute('aria-label') || el.title || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (document.documentElement.scrollWidth > vw + 1) out.hscroll.push(`stránka ${document.documentElement.scrollWidth} > ${vw}`);
    const main = document.getElementById('app-content');
    for (const box of [main, overlay && overlay.firstElementChild].filter(Boolean)) if (box.scrollWidth > box.clientWidth + 1) out.hscroll.push(`${box.id || box.className.slice(0, 30)} ${box.scrollWidth} > ${box.clientWidth}`);
    const saved = main.scrollTop;
    for (const el of scope.querySelectorAll('button, a[href], [role="tab"], input:not([type="hidden"]), select, textarea')) {
        if (!visible(el)) continue;
        const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title || (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent.trim() || [...el.querySelectorAll('img[alt]')].map(i => i.alt).join('').trim() || el.getAttribute('placeholder');
        if (!label) out.unnamed.push(el.outerHTML.slice(0, 80));
        const box = el.getBoundingClientRect();
        // Hlavní akce a hlavička: aspoň 44 px (ostatní drobná tlačítka se nehlídají)
        if (el.matches('#app-header button, [data-action="next"], [data-action="choice"], [data-action="hint"], [data-chooser-play], #answer-form button')
            && Math.min(box.width, box.height) < 43.5) out.small.push(`${name(el)} ${Math.round(box.width)}×${Math.round(box.height)}`);
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const at = el.getBoundingClientRect();
        if (at.bottom > vh + 0.5 || at.top < -0.5 || at.right > vw + 0.5 || at.left < -0.5) { out.unreachable.push(`${name(el)} top ${Math.round(at.top)} bottom ${Math.round(at.bottom)}`); continue; }
        const hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
        if (hit && !(el.contains(hit) || hit.contains(el))) out.covered.push(`${name(el)} překrývá ${hit.tagName.toLowerCase()}`);
    }
    main.scrollTop = saved;
    // Kontrast textu (bez přechodů na pozadí a bez emoji)
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (fg, bg) => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
    const background = (el) => {
        const dark = matchMedia('(prefers-color-scheme: dark)').matches;
        let bg = dark ? [22, 23, 25, 1] : [238, 236, 232, 1];
        const chain = []; for (let p = el; p; p = p.parentElement) chain.push(p);
        for (const p of chain.reverse()) {
            const s = getComputedStyle(p);
            if (/gradient\(/.test(s.backgroundImage) && p !== document.body) return null;
            const c = parse(s.backgroundColor); if (c && c[3] > 0) bg = over(c, bg);
        }
        return bg;
    };
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim(); const el = node.parentElement;
        if (!text || !el || seen.has(el) || !visible(el) || /^[\p{Extended_Pictographic}\s️]+$/u.test(text)) continue;
        seen.add(el);
        if (el.closest('svg, [aria-hidden="true"], [disabled], [aria-disabled="true"], #toast, #celebration, #tutorial')) continue;
        let opacity = 1; for (let p = el; p && p !== document.body; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
        if (opacity < 0.99) continue;
        const bg = background(el); if (!bg) continue;
        const style = getComputedStyle(el); const fg = parse(style.color); if (!fg) continue;
        const color = over(fg, bg);
        const ratio = (Math.max(lum(color), lum(bg)) + 0.05) / (Math.min(lum(color), lum(bg)) + 0.05);
        const size = parseFloat(style.fontSize); const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${ratio.toFixed(2)} „${text.slice(0, 30)}“ ${style.color}`);
    }
    return out;
};

test('rozhraní na úzkém telefonu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const open = async (scheme) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: VIEWPORT, colorScheme: scheme, reducedMotion: 'reduce', hasTouch: true });
        await context.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.fallback();
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title: 'Zkouška', extract: fixtures.extractFor(url.searchParams.get('titles')) } } } } });
            if (/\.(png|jpe?g|webp)$/.test(url.pathname) || url.hostname === 'upload.wikimedia.org' || url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        await tab.clock.setFixedTime(new Date('2026-10-16T10:00:00'));
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('[data-action="daily"][data-topic="zemepis"]', { timeout: 30000 });
        return { context, tab, problems };
    };
    const check = async (tab, scene, scheme) => {
        await tab.waitForTimeout(200);
        const found = await tab.evaluate(inspect);
        for (const kind of ['hscroll', 'unreachable', 'covered', 'small', 'unnamed', 'contrast']) assert.deepEqual(found[kind], [], `${scheme} / ${scene}: ${kind}`);
    };

    for (const scheme of ['light', 'dark']) {
        await t.test(`úvod, otázka, nápovědy, výsledek, nastavení a učení (${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme);
            await check(tab, 'úvod', scheme);

            await tab.click('[data-action="daily"][data-topic="zemepis"]');
            await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
            await check(tab, 'otázka', scheme);
            const hint = await tab.$('[data-action="hint"]');
            if (hint) { await hint.click(); await check(tab, 'otázka s nápovědou', scheme); }
            await (await tab.$$('[data-action="choice"]'))[0].click();
            await tab.waitForSelector('[data-verdict]');
            await check(tab, 'výsledek', scheme);
            // Tlačítko Další je při otevření výsledku vidět bez posouvání
            const next = await tab.evaluate(() => { const b = document.querySelector('[data-action="next"]').getBoundingClientRect(); return { bottom: b.bottom, height: innerHeight }; });
            assert.ok(next.bottom <= next.height + 0.5, `${scheme}: Další je pod okrajem (${next.bottom} > ${next.height})`);

            await tab.click('#btn-settings');
            await tab.waitForSelector('#settings-overlay');
            await check(tab, 'nastavení – hra', scheme);
            await tab.click('[data-me-tab="look"]');
            await check(tab, 'nastavení – vzhled', scheme);
            await tab.keyboard.press('Escape');

            await tab.click('#btn-learn');
            await tab.waitForSelector('[data-action="learn-topic"]');
            await check(tab, 'učení', scheme);

            await tab.click('#btn-home');
            await tab.waitForSelector('[data-action="play-topic"][data-topic="zemepis"]');

            // Můj postup: úroveň, nejbližší odznaky s odměnou, mistrovství témat (vysvětlení se vejde bez posouvání), úrovně a všechny odznaky
            await tab.click('#status-badge');
            await tab.waitForSelector('[data-open-levels]');
            await check(tab, 'můj postup', scheme);
            await tab.click('[data-mastery="zemepis"]');
            await tab.waitForSelector('[data-mastery-info]');
            await check(tab, 'mistrovství tématu', scheme);
            const fits = await tab.evaluate(() => { const box = document.getElementById('dialog-overlay').firstElementChild; return { scroll: box.scrollHeight, client: box.clientHeight }; });
            assert.ok(fits.scroll <= fits.client + 1, `${scheme}: vysvětlení mistrovství se vejde bez posouvání (${fits.scroll} > ${fits.client})`);
            await tab.click('[data-back-progress]');
            await tab.click('[data-open-levels]');
            await tab.waitForSelector('[data-title-row]');
            await check(tab, 'úrovně a tituly', scheme);
            await tab.keyboard.press('Escape');
            await tab.click('#status-badge');
            await tab.click('[data-open-badges]');
            await tab.click('[data-badge="zbehly-zemepis"]');
            await check(tab, 'všechny odznaky', scheme);
            await tab.keyboard.press('Escape');

            await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
            await tab.waitForSelector('#play-chooser [data-chooser-play]');
            await check(tab, 'výběr tématu', scheme);

            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }
});
