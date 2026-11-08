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
    const overlay = document.getElementById('settings-overlay') || document.getElementById('dialog-overlay') || document.getElementById('play-chooser') || document.getElementById('place-info') || document.getElementById('fact-overlay');
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
        if (el.matches('#app-header button, [data-action="next"], [data-action="choice"], [data-action="hint"], [data-chooser-play], #answer-form button, [data-chooser-mode], [data-action="mode-choice"], [data-action="mode-start"], [data-action="mode-again"]')
            && Math.min(box.width, box.height) < 43.5) out.small.push(`${name(el)} ${Math.round(box.width)}×${Math.round(box.height)}`);
        // Zavírání oken, medaile, výběr vzhledu, doplňky sovy, obrázky v Profilu, přepínače, cíle týdne a odkazy pod okny: aspoň 40 px
        if (el.matches('[data-close][aria-label], [data-fact-close], [data-badge], #weekly-goals, [data-tip-off], [data-update-app], [data-theme-pick], [data-frame], #settings-overlay a[href], [data-owl-pick], [data-pick-avatar], [data-pick-owl], [data-locked-avatar], [data-locked-owl], [role="switch"], [data-tutorial-restart], [data-chooser-category], [data-chooser-topic]')
            && Math.min(box.width, box.height) < 39.5) out.small.push(`${name(el)} ${Math.round(box.width)}×${Math.round(box.height)}`);
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const at = el.getBoundingClientRect();
        if (at.bottom > vh + 0.5 || at.top < -0.5 || at.right > vw + 0.5 || at.left < -0.5) { out.unreachable.push(`${name(el)} top ${Math.round(at.top)} bottom ${Math.round(at.bottom)}`); continue; }
        const hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
        // Žárovka zajímavosti sedí přes sovu ve štítku záměrně (obě otevřou zajímavost); úroveň vedle hlídá test hlavičky
        if (hit && !(el.contains(hit) || hit.contains(el)) && !(el.id === 'status-badge' && hit.closest('#fact-hint'))) out.covered.push(`${name(el)} překrývá ${hit.tagName.toLowerCase()}`);
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
    // Uříznutý text („Správné odp…“, „Hluboký …“) a slovo zlomené uprostřed („ARCHITEKTU / RA“); jména hráčů se smí zkrátit
    out.clipped = [];
    out.split = [];
    const texts = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        const el = node.parentElement;
        if (!el || !node.textContent.trim() || !visible(el) || el.closest('svg, [aria-hidden="true"], #toast, #celebration, #tutorial, [data-player-name]')) continue;
        const style = getComputedStyle(el);
        const clamp = style.webkitLineClamp && style.webkitLineClamp !== 'none';
        if ((style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (clamp && el.scrollHeight > el.clientHeight + 2)) out.clipped.push(`„${el.textContent.trim().slice(0, 30)}“`);
        const range = document.createRange();
        for (const match of node.textContent.matchAll(/[^\s\-–·/]{4,}/gu)) {
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const lines = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
            if (lines.size > 1) out.split.push(`„${match[0]}“`);
        }
    }
    return out;
};

test('rozhraní na úzkém telefonu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    // fact = zajímavost dne (data/fakt.json), jinak ji server nemá
    // signedIn = přihlášený hráč (falešné Supabase: jeho profil, jinak prázdné odpovědi) – v Nastavení má čtyři záložky
    const open = async (scheme, { viewport = VIEWPORT, fact = null, signedIn = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: scheme, reducedMotion: 'reduce', hasTouch: true });
        if (fact) await context.route('**/data/fakt.json', route => route.fulfill({ json: fact }));
        const auth = signedIn ? JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'jana@example.com', name: 'Jana Nováková' } }) : null;
        await context.addInitScript(() => { window.MUDRLANT_NUMERIC_RATE = 0; }); // jen obyčejné otázky (Seřaď a Odhadni číslo: e2e-numeric)
        await context.addInitScript((auth) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem('mudrlant.account', JSON.stringify('host'));
            localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.setItem('mudrlant.tutorial', JSON.stringify({ how: 'done' }));
            localStorage.setItem('mudrlant.tips', JSON.stringify({ off: true }));
            if (auth) localStorage.setItem('mudrlant.auth', auth);
        }, auth);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.fallback();
            if (signedIn && url.hostname.endsWith('.supabase.co')) {
                if (url.pathname === '/rest/v1/profiles') return route.fulfill({ json: [{ id: 'u-1', display_name: 'Jana Nováková', avatar: '🦊', color: 'emerald', owl: null, xp: 0, badges: [] }] });
                return route.fulfill({ json: url.pathname.startsWith('/auth/') ? {} : [] });
            }
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
        for (const kind of ['hscroll', 'unreachable', 'covered', 'small', 'unnamed', 'contrast', 'clipped', 'split']) assert.deepEqual(found[kind], [], `${scheme} / ${scene}: ${kind}`);
    };
    // Otázka se vejde na obrazovku bez posouvání (panel nápověd vyplní, co zbude)
    const fitsScreen = async (tab, scene, scheme) => {
        const size = await tab.evaluate(() => { const main = document.getElementById('app-content'); return { scroll: main.scrollHeight, client: main.clientHeight }; });
        assert.ok(size.scroll <= size.client + 1, `${scheme} / ${scene}: posouvá se (${size.scroll} > ${size.client})`);
    };

    for (const scheme of ['light', 'dark']) {
        await t.test(`úvod, otázka, nápovědy, výsledek, nastavení a učení (${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme);
            await check(tab, 'úvod', scheme);

            await tab.click('[data-action="daily"][data-topic="zemepis"]');
            await tab.waitForSelector('[data-action="give-up"]', { timeout: 30000 });
            await check(tab, 'otázka', scheme);
            await fitsScreen(tab, 'otázka', scheme);
            // Všechny nápovědy postupně: žádná nesmí stránku natáhnout
            for (let step = 1; await tab.$('[data-action="hint"]'); step++) {
                await tab.click('[data-action="hint"]');
                await check(tab, `otázka s nápovědou ${step}`, scheme);
                await fitsScreen(tab, `otázka s nápovědou ${step}`, scheme);
            }
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
            await tab.click('[data-me-tab="owl"]');
            await check(tab, 'nastavení – Mudrlant', scheme);
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

    // Hlavička se zajímavostí dne: sova (s žárovkou) otevře zajímavost, úroveň vedle ní Můj postup – i na 360 px,
    // kde se název Mudrlant nevejde (vidět je jen „Úr. 1“ s pruhem); plocha úrovně aspoň 40 px
    for (const [viewport, scheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light'], [{ width: 390, height: 780 }, 'dark']]) {
        await t.test(`hlavička: zajímavost i můj postup (${viewport.width}×${viewport.height}, ${scheme})`, async () => {
            const fact = { date: '2026-10-16', year: 1922, title: 'Objev hrobky Tutanchamona', text: 'V roce 1922 objevil Howard Carter vchod do hrobky faraona Tutanchamona.', url: 'https://cs.wikipedia.org/wiki/Tutanchamon', page: 'Tutanchamon', source: 'Wikipedie' };
            const { context, tab, problems } = await open(scheme, { viewport, fact });
            await tab.waitForSelector('#fact-hint:not(.hidden)');
            const scene = `hlavička ${viewport.width} ${scheme}`;
            assert.equal(await tab.isVisible('#status-text'), true, `${scene}: úroveň vedle sovy je vidět`);
            assert.match(await tab.textContent('#status-text'), /Úr\. 1/);
            if (viewport.width <= 370) assert.equal(await tab.isVisible('#status-text > span:first-child'), false, `${scene}: název se na úzký displej nevejde`);
            // Plocha, která vede do Mého postupu (tlačítko bez sovy), je aspoň 40 × 40 px a nic ji nepřekrývá
            const area = await tab.evaluate(() => {
                const badge = document.getElementById('status-badge').getBoundingClientRect();
                const owl = document.getElementById('status-icon-slot').getBoundingClientRect();
                const text = document.getElementById('status-text').getBoundingClientRect();
                const hit = document.elementFromPoint(text.left + text.width / 2, text.top + text.height / 2);
                return { width: badge.right - owl.right, height: badge.height, free: Boolean(hit && hit.closest('#status-text')) };
            });
            assert.ok(area.width >= 40 && area.height >= 40, `${scene}: plocha úrovně ${area.width}×${area.height}`);
            assert.equal(area.free, true, `${scene}: úroveň ničím nepřekrytá`);
            await check(tab, `${scene}: úvod se zajímavostí`, scheme);
            // Klepnutí na sovu (přes ni je žárovka) → zajímavost, zavřít; úroveň → Můj postup
            await tab.click('#status-icon-slot', { force: true });
            await tab.waitForSelector('#fact-overlay');
            await check(tab, `${scene}: zajímavost`, scheme);
            await tab.keyboard.press('Escape');
            await tab.waitForSelector('#fact-overlay', { state: 'detached' });
            await tab.click('#status-text');
            await tab.waitForSelector('[data-open-levels]');
            await check(tab, `${scene}: můj postup`, scheme);
            // Karta s úrovní a titulem má sovu titulu (místo kolečka úrovně, úroveň je štítek na sově) a nenaroste: okno se kvůli ní
            // nenaroste (nejvýš 106 px; Můj postup je kompaktní a vejde se bez posouvání, viz tests/e2e-rewards.test.js)
            const card = await tab.evaluate(() => {
                const box = document.querySelector('[data-open-levels]').getBoundingClientRect();
                const owl = document.querySelector('[data-open-levels] [data-title-owl] img');
                const title = document.querySelector('[data-open-levels] .text-lg');
                return { height: box.height, owl: owl && owl.getAttribute('src'), owlHeight: owl && owl.getBoundingClientRect().height, titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)) };
            });
            assert.ok(card.height <= 106.5, `${scene}: karta úrovně ${card.height} px`);
            assert.equal(card.owl, 'icons/topics/sova-titul-1.webp');
            assert.ok(card.owlHeight >= 52, `${scene}: sova titulu ${card.owlHeight} px`);
            assert.equal(card.titleLines, 1, `${scene}: titul na jeden řádek`);
            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }

    // Úvod (záložka Jeden hráč) se vejde bez posouvání i na nízkém telefonu 360×640: tam je rozvržení kompaktní (varianta short:
    // v tailwind.config.js) – dnešní otázky jen jako ikony se stavem v odznaku, menší dlaždice témat; na vyšších displejích zůstává
    // popisek stavu („čeká“) a velké ikony. Dlaždice mají aspoň 40 px, ikony témat aspoň 32 px a popisky aspoň 10 px.
    for (const [viewport, scheme] of [[{ width: 360, height: 640 }, 'light'], [{ width: 360, height: 640 }, 'dark'], [{ width: 390, height: 780 }, 'light'], [{ width: 412, height: 915 }, 'dark']]) {
        await t.test(`úvod bez posouvání (${viewport.width}×${viewport.height}, ${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme, { viewport });
            const scene = `úvod ${viewport.width}×${viewport.height}`;
            await check(tab, scene, scheme);
            await fitsScreen(tab, scene, scheme);
            const sizes = await tab.evaluate(() => {
                const side = (el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); };
                const min = (selector, measure) => Math.min(...[...document.querySelectorAll(selector)].map(measure));
                return {
                    daily: min('[data-action="daily"]', side),
                    tiles: min('[data-action="play-topic"], [data-action="play-mix"]', side),
                    icons: min('[data-action="play-topic"] img', el => el.getBoundingClientRect().height),
                    labels: min('[data-action="play-topic"] > span', el => parseFloat(getComputedStyle(el).fontSize)),
                    status: [...document.querySelectorAll('[data-action="daily"] > span.truncate')].filter(el => el.getBoundingClientRect().height > 0).length,
                    count: document.querySelectorAll('[data-action="daily"]').length
                };
            });
            assert.ok(sizes.daily >= 39.5, `${scheme} / ${scene}: dnešní otázka ${sizes.daily} px`);
            assert.ok(sizes.tiles >= 48, `${scheme} / ${scene}: dlaždice tématu ${sizes.tiles} px`);
            assert.ok(sizes.icons >= 32, `${scheme} / ${scene}: ikona tématu ${sizes.icons} px`);
            assert.ok(sizes.labels >= 10, `${scheme} / ${scene}: popisek tématu ${sizes.labels} px`);
            assert.equal(sizes.status, viewport.height > 770 ? sizes.count : 0, `${scheme} / ${scene}: popisek stavu dnešní otázky jen na vyšším displeji`);
            // Záložka Více hráčů (host: nabídka přihlášení) projde stejnými kontrolami
            await tab.click('[data-action="home-tab"][data-tab="multi"]');
            await tab.waitForSelector('[data-action="auth-login"]');
            await check(tab, `${scene}: více hráčů`, scheme);
            await fitsScreen(tab, `${scene}: více hráčů`, scheme);
            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }

    // Karta Hra v Nastavení: na 390×780 se vejde bez posouvání (host s nabídkou přihlášení i přihlášený hráč), na 360×640 přihlášený
    // také a host jen s malým posunem; přepínače jsou řádky se spínačem (role switch) a dotykovou plochou aspoň 40 px
    for (const [viewport, signedIn, scheme, limit] of [[{ width: 390, height: 780 }, false, 'light', 0], [{ width: 390, height: 780 }, true, 'dark', 0], [{ width: 360, height: 640 }, true, 'light', 0], [{ width: 360, height: 640 }, false, 'dark', 80]]) {
        await t.test(`karta Hra v Nastavení (${viewport.width}×${viewport.height}, ${signedIn ? 'přihlášený' : 'host'}, ${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme, { viewport, signedIn });
            await tab.click('#btn-settings');
            await tab.waitForSelector(signedIn ? '[data-me-tab="profile"]' : '[data-auth-login]');
            const scene = `karta Hra ${viewport.width}×${viewport.height}`;
            await check(tab, scene, scheme);
            const size = await tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return { over: box.scrollHeight - box.clientHeight, switches: [...box.querySelectorAll('[role="switch"]')].map(el => el.getAttribute('aria-checked')) }; });
            assert.ok(size.over <= limit, `${scheme} / ${scene}: posun ${size.over} px (nejvýš ${limit})`);
            assert.deepEqual(size.switches, ['true', 'false', 'true', 'true'], 'procvičování (zapnuté), tipy (v testu vypnuté), zvuky a vibrace (zapnuté) jako přepínače');
            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }

    // Výběr kategorií (Zeměpis) a témat (Mix) na 360×640: tlačítko Hrát je v lepkavé patičce, vidět a nezakryté nahoře i uprostřed posunu
    for (const [action, scheme] of [['[data-action="play-topic"][data-topic="zemepis"]', 'light'], ['[data-action="play-mix"]', 'dark']]) {
        await t.test(`výběr ${action.includes('mix') ? 'Mix' : 'Zeměpis'}: Hrát vždy vidět (${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme);
            await tab.click(action);
            await tab.waitForSelector('#play-chooser [data-chooser-play]');
            await check(tab, 'výběr kategorií', scheme);
            for (const at of [0, 0.5, 1]) {
                const state = await tab.evaluate((at) => {
                    const box = document.querySelector('#play-chooser > div');
                    box.scrollTop = (box.scrollHeight - box.clientHeight) * at;
                    const play = document.querySelector('[data-chooser-play]').getBoundingClientRect();
                    const hit = document.elementFromPoint(play.left + play.width / 2, play.top + play.height / 2);
                    return { top: play.top, bottom: play.bottom, height: innerHeight, free: Boolean(hit && hit.closest('[data-chooser-play]')), scrolls: box.scrollHeight > box.clientHeight };
                }, at);
                assert.ok(state.top >= 0 && state.bottom <= state.height + 0.5, `${scheme}: Hrát mimo obrazovku při posunu ${at} (${state.top}–${state.bottom})`);
                assert.equal(state.free, true, `${scheme}: Hrát je zakryté při posunu ${at}`);
            }
            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }

    // Bleskovka a Přežití (okno Co hrát → úvod → otázka → po odpovědi → výsledek): stejné kontroly a bez posouvání na 360×640
    for (const scheme of ['light', 'dark']) {
        await t.test(`Bleskovka a Přežití (360×640, ${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme);
            for (const kind of ['blitz', 'survival']) {
                await tab.click('[data-action="play-mix"]');
                await tab.waitForSelector('#play-chooser [data-chooser-mode]');
                await tab.click(`[data-chooser-mode="${kind}"]`);
                await tab.waitForSelector(`[data-mode-intro="${kind}"]`);
                await check(tab, `${kind}: úvod`, scheme);
                await fitsScreen(tab, `${kind}: úvod`, scheme);
                await tab.click('[data-action="mode-start"]');
                await tab.waitForSelector('[data-mode-question][data-phase="question"]', { timeout: 30000 });
                await check(tab, `${kind}: otázka`, scheme);
                await fitsScreen(tab, `${kind}: otázka`, scheme);
                await tab.click('[data-action="mode-choice"][data-index="0"]');
                await tab.waitForSelector('[data-mode-question][data-phase="feedback"]');
                await check(tab, `${kind}: po odpovědi`, scheme);
                await fitsScreen(tab, `${kind}: po odpovědi`, scheme);
                await tab.click('[data-action="mode-quit"]');
                await tab.waitForSelector(`[data-mode-result="${kind}"]`);
                await check(tab, `${kind}: výsledek`, scheme);
                await fitsScreen(tab, `${kind}: výsledek`, scheme);
                await tab.click('[data-action="mode-home"]');
                await tab.waitForSelector('[data-action="play-topic"]');
            }
            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }

    // Nastavení přihlášeného hráče: čtyři záložky (Hra, Profil, Vzhled, Mudrlant) se na 360 px vejdou celé, bez „Mudrlan“
    for (const scheme of ['light', 'dark']) {
        await t.test(`nastavení přihlášeného hráče: čtyři záložky (${scheme})`, async () => {
            const { context, tab, problems } = await open(scheme, { signedIn: true });
            await tab.click('#btn-settings');
            await tab.waitForSelector('[data-me-tab="profile"]');
            const tabs = await tab.evaluate(() => {
                const list = document.querySelector('#settings-overlay [role="tablist"]');
                return { list: [list.scrollWidth, list.clientWidth], tabs: [...list.querySelectorAll('[data-me-tab]')].map(el => ({ text: el.textContent.trim(), scroll: el.scrollWidth, client: el.clientWidth, width: el.getBoundingClientRect().width })) };
            });
            assert.deepEqual(tabs.tabs.map(item => item.text), ['Hra', 'Profil', 'Vzhled', 'Mudrlant']);
            assert.ok(tabs.list[0] <= tabs.list[1] + 1, `${scheme}: pás záložek přetéká (${tabs.list[0]} > ${tabs.list[1]})`);
            for (const item of tabs.tabs) assert.ok(item.scroll <= item.client + 1 && item.width >= 44, `${scheme}: záložka ${item.text} uříznutá nebo malá (${item.scroll} > ${item.client}, šířka ${item.width})`);
            for (const id of ['game', 'profile', 'look', 'owl']) {
                await tab.click(`[data-me-tab="${id}"]`);
                await check(tab, `nastavení přihlášeného – ${id}`, scheme);
            }
            assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
            await context.close();
        });
    }

    // Obrazové nápovědy v nejmenším panelu otázky (7 rem na 360×640) i ve větším: popisky uvnitř plochy, popisky stupnice
    // se nepřekrývají a čárky je nepřeškrtnou, periodická tabulka plochu využije
    await t.test('časová osa, stupnice a periodická tabulka v malém panelu', async () => {
        const { context, tab, problems } = await open('light');
        const specs = {
            timeline: { type: 'timeline', spans: [{ kind: 'life', from: 356, to: 323 }, { kind: 'reign', from: 336, to: 323 }].map(span => ({ ...span, from: -span.from, to: -span.to })),
                anchors: [[-399, 'smrt Sókrata', 1], [-490, 'bitva u Marathónu', 1], [-221, 'sjednocení Číny', 1]] },
            scale: { type: 'scale', min: 1, max: 10, value: 2.25, valueLabel: 'tvrdost 2–2,5', minLabel: 'měkký', maxLabel: 'tvrdý',
                ticks: ['mastek', 'sádrovec', 'kalcit', 'fluorit', 'apatit', 'živec', 'křemen', 'topaz', 'korund', 'diamant'].map((label, i) => ({ value: i + 1, label })) },
            periodic: { type: 'periodic', z: 10 }
        };
        for (const [width, height] of [[330, 112], [330, 136], [366, 288]]) {
            const found = await tab.evaluate(async ({ specs, width, height }) => {
                const out = [];
                for (const [kind, spec] of Object.entries(specs)) {
                    const box = document.createElement('div');
                    Object.assign(box.style, { position: 'fixed', left: '0', top: '0', zIndex: '99' });
                    document.body.appendChild(box);
                    box.style.width = `${width}px`;
                    box.style.height = `${height}px`;
                    await window.MudrlantVisuals.render(box, spec, {});
                    const svg = box.querySelector('svg');
                    const shapes = [...svg.querySelectorAll('text, rect, circle')].map(el => ({ el, b: el.getBBox() }));
                    for (const { el, b } of shapes) if (b.x < -1 || b.y < -1 || b.x + b.width > width + 1 || b.y + b.height > height + 1) out.push(`${kind} ${width}×${height}: ${el.tagName} „${el.textContent}“ mimo plochu`);
                    const labels = shapes.filter(({ el }) => el.tagName === 'text');
                    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
                        const [a, b] = [labels[i].b, labels[j].b];
                        if (a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1) out.push(`${kind} ${width}×${height}: „${labels[i].el.textContent}“ překrývá „${labels[j].el.textContent}“`);
                    }
                    // Popisky stupnice mají obrys v barvě pozadí, takže čárky pod nimi nejsou vidět
                    if (kind === 'scale') labels.filter(({ el }) => el.getAttribute('font-weight') === '600').forEach(({ el }) => { if (el.getAttribute('paint-order') !== 'stroke') out.push(`stupnice: „${el.textContent}“ bez obrysu`); });
                    if (kind === 'periodic') {
                        const used = [...svg.querySelectorAll('rect')].map(rect => rect.getBBox());
                        const tableHeight = Math.max(...used.map(b => b.y + b.height)) - Math.min(...used.map(b => b.y));
                        if (tableHeight < height * 0.75 && width / 18 * 9.5 > height * 0.75) out.push(`periodická tabulka ${width}×${height}: využije jen ${Math.round(tableHeight)} px výšky`);
                    }
                    box.remove();
                }
                return out;
            }, { specs, width, height });
            assert.deepEqual(found, [], `${width}×${height}`);
        }
        assert.deepEqual(problems, [], 'bez chyb v konzoli a bez porušení CSP');
        await context.close();
    });
});
