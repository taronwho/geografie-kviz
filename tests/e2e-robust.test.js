// Odolnost aplikace: poškozená data v localStorage, zakázané úložiště, nepřátelský text v denní zajímavosti,
// hlavičky/CSP a service worker (soubory z index.html musí být v mezipaměti i v nasazení).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const CSP = read('_headers').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('nasazení: skripty z index.html jsou v service workeru i v kopírování na GitHub Pages', () => {
    const html = read('index.html');
    const sw = read('sw.js');
    const pages = read('.github/workflows/pages.yml');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    assert.ok(scripts.length > 20);
    const shell = sw.slice(sw.indexOf('APP_SHELL'), sw.indexOf('self.addEventListener'));
    const copied = pages.match(/cp -r (.*) _site\/app\//)[1].split(/\s+/);
    for (const script of scripts) {
        assert.ok(shell.includes(`'${script}'`), `${script} chybí v APP_SHELL (sw.js)`);
        assert.ok(copied.includes(script) || copied.includes(script.split('/')[0]), `${script} se v pages.yml nekopíruje do nasazení`);
        assert.ok(fs.existsSync(path.join(ROOT, script)), `${script} neexistuje`);
    }
    // každý soubor z APP_SHELL existuje a (kromě ikon vlevo) se kopíruje
    const listed = [...shell.matchAll(/'([^']+\.(?:js|json|css|html|webmanifest|webp|png))'/g)].map(match => match[1]);
    for (const file of listed) {
        if (file.includes('${')) continue;
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} z APP_SHELL neexistuje`);
        assert.ok(copied.includes(file) || copied.includes(file.split('/')[0]), `${file} z APP_SHELL se v pages.yml nekopíruje`);
    }
    for (const id of ['zemepis', 'mix', 'sova-spi', 'turnaj', 'nahodny', 'kod', 'cile', 'procvicovani', 'sova-tip']) assert.ok(fs.existsSync(path.join(ROOT, `icons/topics/${id}.webp`)));
    // sed v nasazení hledá přesně tento řádek (jinak by se mezipaměť nikdy nezměnila)
    assert.match(sw, /const CACHE_NAME = 'mudrlant-v3';/);
    assert.ok(pages.includes("const CACHE_NAME = 'mudrlant-v3';"));
});

test('CSP: meta v index.html a _headers se shodují (kromě frame-ancestors), bez unsafe-inline a bez cizích skriptů', () => {
    const meta = read('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    const clean = (policy) => policy.split(';').map(part => part.trim()).filter(part => part && !part.startsWith('frame-ancestors')).sort();
    assert.deepEqual(clean(meta), clean(CSP));
    assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|\*(?!\.supabase)/);
    assert.match(CSP, /script-src 'self'(;|$)/);
    assert.match(CSP, /object-src 'none'/);
    assert.match(CSP, /base-uri 'self'/);
});

const startServer = (getFact) => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/data/fakt.json') {
            const fact = getFact();
            if (!fact) { response.writeHead(404); return response.end(); }
            response.writeHead(200, { 'content-type': 'application/json' });
            return response.end(JSON.stringify(fact));
        }
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

test('robustnost v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    let fact = null;
    const server = await startServer(() => fact);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    const open = async (seed, ready = '[data-action="play-topic"]') => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 780 } });
        await context.addInitScript(seed);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector(ready);
        return { context, tab, problems };
    };
    const KEYS = ['variant', 'settings', 'stats', 'daily', 'session', 'history', 'mistakes', 'learned', 'pendingChallenge', 'homeTab', 'progress', 'account', 'look', 'tutorial', 'fakt', 'auth', 'dev', 'dev.backup'];

    for (const [label, garbage] of [['řetězec', '"abc"'], ['číslo', '12345'], ['pole', '[1,2,3]'], ['null', 'null'], ['rozbitý JSON', '{"a":'], ['obrovská čísla', '{"xp":1e999,"counters":{"answered":-5,"run":"x"},"badges":{"__proto__":1,"nenalezeno":"2020-01-01"},"daily":{"zemepis":5},"practice":"x","topics":"mix","categories":7,"known":1}']]) {
        await t.test(`poškozená data v localStorage (${label}) aplikaci nerozbijí`, async () => {
            const { context, tab, problems } = await open(`(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
                for (const key of ${JSON.stringify(KEYS)}) localStorage.setItem('mudrlant.' + key, ${JSON.stringify(garbage)});
                localStorage.setItem('mudrlant.account', '"host"'); localStorage.setItem('mudrlant.tutorial', '{"how":"done"}'); localStorage.setItem('mudrlant.tips', '{"off":true}'); localStorage.setItem('mudrlant.variant', 'choices'); localStorage.removeItem('mudrlant.dev'); localStorage.removeItem('mudrlant.dev.backup'); })()`);
            await tab.waitForTimeout(400);
            assert.ok(await tab.isVisible('[data-action="play-topic"]'));
            // hra jde spustit a odpovědět
            await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
            await tab.waitForTimeout(300);
            const start = await tab.$('[data-start-game], [data-action="start-game"], [data-chooser-start]');
            if (start) await start.click();
            await tab.waitForTimeout(800);
            assert.deepEqual(problems, []);
            await context.close();
        });
    }

    await t.test('vymyšlené poznané položky vývojářského režimu se mimo něj nepočítají (hvězdy mistrovství)', async () => {
        const { context, tab, problems } = await open(`(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('mudrlant.account', '"host"'); localStorage.setItem('mudrlant.tutorial', '{"how":"done"}'); localStorage.setItem('mudrlant.tips', '{"off":true}'); localStorage.setItem('mudrlant.variant', 'choices');
            localStorage.removeItem('mudrlant.dev'); localStorage.removeItem('mudrlant.dev.backup');
            localStorage.setItem('mudrlant.learned', JSON.stringify({ zemepis: Array.from({ length: 320 }, (_, i) => 'dev' + i) })); })()`);
        await tab.waitForTimeout(400);
        await tab.click('#status-badge');
        await tab.waitForSelector('text=Mistrovství témat');
        assert.equal(await tab.locator('[aria-label$="z 5 hvězd"]').evaluateAll(list => list.filter(el => !/^0 z/.test(el.getAttribute('aria-label'))).length), 0, 'žádné téma nemá hvězdy');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('vývojářský režim: „Vše“ dá hvězdy, „Vymazat hvězdičky“ je smaže a „Vrátit“ je nevrátí', async () => {
        const { context, tab, problems } = await open(`(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('mudrlant.account', '"host"'); localStorage.setItem('mudrlant.tutorial', '{"how":"done"}'); localStorage.setItem('mudrlant.tips', '{"off":true}'); localStorage.setItem('mudrlant.variant', 'choices'); localStorage.setItem('mudrlant.dev', '1'); localStorage.removeItem('mudrlant.dev.backup'); })()`);
        await tab.click('#btn-settings');
        await tab.click('[data-dev="max"]');
        const count = () => tab.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mudrlant.learned') || '{}')).reduce((sum, ids) => sum + ids.length, 0));
        assert.ok(await count() > 0, 'po „Vše“ jsou poznané položky');
        await tab.click('[data-dev="nostars"]');
        assert.equal(await count(), 0);
        await tab.click('[data-dev="restore"]');
        assert.equal(await count(), 0, 'po vrácení postupu se hvězdy nevrátí');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('localStorage vyhazuje chyby (zakázaný, plný): aplikace se načte a jde hrát', async () => {
        const { context, tab, problems } = await open(`(() => { const fail = () => { throw new DOMException('plno', 'QuotaExceededError'); };
            Storage.prototype.setItem = fail; Storage.prototype.getItem = fail; Storage.prototype.removeItem = fail; })()`, '#app-content *');
        await tab.waitForTimeout(800);
        assert.ok((await tab.textContent('#app-content')).trim().length > 20, 'aplikace něco ukáže');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('denní zajímavost s nepřátelským textem se nikdy nevykoná', async () => {
        fact = { date: dayKey(), year: 1922, title: '<img src=x onerror="window.__xss=1">Titulek', text: '<script>window.__xss=2</script>"><svg onload=window.__xss=3>', url: 'https://cs.wikipedia.org/wiki/X?a=1&b=<2>'.replace(/[<>]/g, ''), page: '<b>p</b>', source: '<i>s</i>', category: '<u>c</u>' };
        const { context, tab, problems } = await open(`(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('mudrlant.account', '"host"'); localStorage.setItem('mudrlant.tutorial', '{"how":"done"}'); localStorage.setItem('mudrlant.tips', '{"off":true}'); localStorage.setItem('mudrlant.variant', 'choices'); })()`);
        await tab.waitForSelector('#fact-hint:not(.hidden)');
        await tab.click('#fact-hint');
        await tab.waitForSelector('#fact-overlay');
        assert.equal(await tab.evaluate(() => window.__xss), undefined);
        assert.equal(await tab.evaluate(() => document.querySelectorAll('#fact-overlay img[onerror], #fact-overlay script, #fact-overlay svg[onload], #fact-overlay [onclick]').length), 0);
        assert.match(await tab.textContent('#fact-overlay'), /<img src=x/, 'text se ukáže jako text');
        const href = await tab.getAttribute('[data-fact-link]', 'href');
        assert.match(href, /^https:\/\/cs\.wikipedia\.org\//);
        assert.equal(await tab.getAttribute('[data-fact-link]', 'onclick'), null);
        assert.deepEqual(problems, []);
        await context.close();
        for (const url of ['javascript:alert(1)', 'http://cs.wikipedia.org/wiki/X', 'https://cs.wikipedia.org.evil.example/wiki/X', 'https://evil.example/cs.wikipedia.org/', 'https://cs.wikipedia.org/wiki/X" onclick="window.__xss=4']) {
            fact = { ...fact, title: 'T', text: 't', url };
            const page = await open(`(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('mudrlant.account', '"host"'); localStorage.setItem('mudrlant.tutorial', '{"how":"done"}'); localStorage.setItem('mudrlant.tips', '{"off":true}'); localStorage.setItem('mudrlant.variant', 'choices'); })()`);
            await page.tab.waitForTimeout(400);
            assert.equal(await page.tab.isVisible('#fact-hint'), false, `odkaz ${url} se nesmí přijmout`);
            await page.context.close();
        }
    });
});
