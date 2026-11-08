// Vlajka státu na vlaječce sovy: výběr státu v Nastavení → Sova, vlajka na logu v hlavičce (obrázek z Wikimedie oříznutý maskou plátna),
// pamatování po načtení, bez vlajky (offline) zůstane modré plátno, cizí sova s vlajkou u druhého hráče, okno bez posouvání a CSP.
// Obrázky z Wikimedie se zachytávají (page.route) a vrací se malé PNG; snímky: SHOTS_DIR=složka.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const fixtures = require('./fixtures.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
// Vlaječka se odemyká odznakem Zběhlý ve vlajkách; 11 000 xp = úroveň 18 (brýle, motýlek, šála, sluneční brýle)
const PROGRESS = JSON.stringify({ xp: 11000, counters: {}, badges: { 'zbehly-vlajky': '2026-11-05' } });
const WIKIMEDIA = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/120px-.+\.png$/;

// Malé PNG: tři vodorovné pruhy (jako vlajka), aby bylo vidět, že je obrázek roztažený a oříznutý
const png = (() => {
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii'); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0); return Buffer.concat([head, data, tail]); };
    const w = 30, h = 20, rows = [];
    for (let y = 0; y < h; y++) {
        const color = y < 7 ? [255, 255, 255] : y < 14 ? [215, 20, 26] : [17, 69, 126];
        rows.push(Buffer.from([0, ...Array.from({ length: w }, () => color).flat()]));
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
})();

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

test('vlajka státu na vlaječce sovy', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });

    const wikimedia = [];
    const open = async ({ viewport = { width: 390, height: 780 }, scheme = 'light', extra = {}, offline = false, backend = null } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport, colorScheme: scheme, deviceScaleFactor: 2 });
        await context.addInitScript(entries => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', 'mudrlant.progress': PROGRESS, 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), ...extra });
        await context.route('https://upload.wikimedia.org/**', route => {
            wikimedia.push(route.request().url());
            return offline ? route.abort('internetdisconnected') : route.fulfill({ contentType: 'image/png', body: png });
        });
        if (backend) await backend(context);
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/`);
        await tab.waitForSelector('#btn-settings');
        return { context, tab, problems };
    };
    const shot = async (tab, name) => { if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, name) }); };
    const fits = (tab) => tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight <= box.clientHeight; });
    const openOwlTab = async (tab) => { await tab.click('#btn-settings'); await tab.click('[data-me-tab="owl"]'); await tab.waitForSelector('[data-owl-pick]'); };
    // Obrázek vlajky v daném místě + jestli je vidět (kontejner s maskou se odkryje až po načtení)
    const flagState = (tab, scope) => tab.evaluate((selector) => {
        const image = document.querySelector(`${selector} [data-owl-flag-img]`);
        if (!image) return null;
        const box = image.parentElement;
        return { src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0, opacity: getComputedStyle(box).opacity, mask: getComputedStyle(box).maskImage || getComputedStyle(box).webkitMaskImage, blend: getComputedStyle(box.lastElementChild).mixBlendMode, size: [Math.round(box.getBoundingClientRect().width), Math.round(box.getBoundingClientRect().height)] };
    }, scope);

    await t.test('výběr státu: vlajka na logu v hlavičce i v náhledu, zůstane po načtení a jde vrátit na modré plátno', async () => {
        const { context, tab, problems } = await open();
        await openOwlTab(tab);
        assert.equal(await tab.locator('[data-owl-flag]').count(), 0, 'výběr vlajky se ukáže až s vlaječkou');
        await tab.click('[data-owl-pick="hand:vlajka"]');
        await tab.waitForSelector('[data-owl-flag]');
        assert.equal(await tab.inputValue('[data-owl-flag]'), '', 'výchozí je modré plátno');
        assert.equal(await tab.locator('[data-owl-flag] option').first().textContent(), 'Modré plátno (výchozí)');
        const options = await tab.$$eval('[data-owl-flag] option', nodes => nodes.map(node => node.textContent));
        assert.ok(options.length > 190, 'státy světa');
        assert.deepEqual(options.slice(1), [...options.slice(1)].sort(new Intl.Collator('cs').compare), 'abecedně');
        assert.ok(options.includes('Česko') && options.includes('Japonsko') && options.includes('Brazílie'));
        assert.equal(await tab.locator('#status-icon-slot [data-owl-flag-img]').count(), 0, 'bez vlajky jen modré plátno');
        assert.equal(await tab.locator('[data-owl-color]').count(), 10, 'bez vlajky jsou barvy plátna');
        assert.equal(await fits(tab), true, 'okno se vejde bez posouvání (vlaječka bez vlajky)');

        await tab.selectOption('[data-owl-flag]', 'q127155');
        await tab.waitForSelector('[data-owl-flag] option[selected]:not([value=""])', { state: 'attached' });
        await tab.waitForFunction(() => { const image = document.querySelector('#status-icon-slot [data-owl-flag-img]'); return image && image.complete && image.naturalWidth > 0; });
        assert.equal(await tab.inputValue('[data-owl-flag]'), 'q127155');
        const header = await flagState(tab, '#status-icon-slot');
        assert.match(header.src, WIKIMEDIA);
        assert.ok(header.src.includes('Flag_of_the_Czech_Republic.svg/120px-Flag_of_the_Czech_Republic.svg.png'));
        assert.ok(header.loaded);
        assert.equal(header.opacity, '1', 'po načtení se vlajka ukáže');
        assert.match(header.mask, /vlajka-maska\.webp/, 'ořez maskou tvaru plátna');
        assert.equal(header.blend, 'multiply', 'stínování látky');
        assert.ok(Math.abs(header.size[0] / header.size[1] - 402 / 443) < 0.02, `kontejner má poměr stran vrstvy ${header.size}`);
        assert.ok((await flagState(tab, '#settings-overlay')).loaded, 'náhled v okně ukazuje vlajku taky');
        // Barva plátna s vlajkou nemá vliv, paleta se skryje; okno se pořád vejde
        assert.equal(await tab.locator('[data-owl-color]').count(), 0);
        assert.equal(await fits(tab), true, 'okno se vejde bez posouvání (vlaječka s vlajkou)');
        await shot(tab, 'flag-okno-ceska.png');
        await tab.click('[data-close]');
        await tab.waitForSelector('#settings-overlay', { state: 'detached' });
        assert.deepEqual(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look'))).acc.hand, { id: 'vlajka', color: 'original', flag: 'q127155' });
        await tab.reload();
        await tab.waitForFunction(() => { const image = document.querySelector('#status-icon-slot [data-owl-flag-img]'); return image && image.complete && image.naturalWidth > 0; });
        assert.match((await flagState(tab, '#status-icon-slot')).src, /Flag_of_the_Czech_Republic/, 'volba přežije načtení');
        assert.equal((await flagState(tab, '#status-icon-slot')).opacity, '1');

        // Jiný stát; zpět na modré plátno: vlajka zmizí a vrátí se paleta barev
        await openOwlTab(tab);
        await tab.selectOption('[data-owl-flag]', 'q43175');
        await tab.waitForFunction(() => document.querySelector('#status-icon-slot [data-owl-flag-img]')?.getAttribute('src').includes('Flag_of_Japan'));
        await tab.selectOption('[data-owl-flag]', '');
        await tab.waitForFunction(() => !document.querySelector('#status-icon-slot [data-owl-flag-img]'));
        assert.equal(await tab.locator('[data-owl-color]').count(), 10);
        assert.equal(await tab.locator('#status-icon-slot [data-owl-layer][src="icons/doplnky/vlajka.webp"]').count(), 1);
        assert.deepEqual(JSON.parse(await tab.evaluate(() => localStorage.getItem('mudrlant.look'))).acc.hand, { id: 'vlajka', color: 'original' });
        assert.ok(wikimedia.length > 0 && wikimedia.every(url => WIKIMEDIA.test(url)), 'jen miniatury z upload.wikimedia.org');
        assert.deepEqual(problems, [], 'bez chyb CSP a skriptů');
        await context.close();
    });

    await t.test('barva plátna se při výběru vlajky zachová a po návratu na modré plátno platí znovu', async () => {
        const { context, tab, problems } = await open();
        await openOwlTab(tab);
        await tab.click('[data-owl-pick="hand:vlajka"]');
        await tab.click('[data-owl-color="hand:cervena"]');
        await tab.waitForSelector('[data-owl-color="hand:cervena"][aria-pressed="true"]');
        assert.equal(await tab.locator('#status-icon-slot [data-owl-layer][src="icons/doplnky/vlajka-cervena.webp"]').count(), 1);
        await tab.selectOption('[data-owl-flag]', 'q82194');
        await tab.waitForFunction(() => document.querySelector('#status-icon-slot [data-owl-flag-img]'));
        assert.equal(await tab.locator('#status-icon-slot [data-owl-layer][src="icons/doplnky/vlajka.webp"]').count(), 1, 's vlajkou je plátno původní');
        await tab.selectOption('[data-owl-flag]', '');
        await tab.waitForSelector('[data-owl-color="hand:cervena"][aria-pressed="true"]');
        assert.equal(await tab.locator('#status-icon-slot [data-owl-layer][src="icons/doplnky/vlajka-cervena.webp"]').count(), 1, 'červené plátno je zpět');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('bez sítě se vlajka nenačte a zůstane modré plátno (kontejner s maskou zůstane průhledný)', async () => {
        const { context, tab, problems } = await open({ offline: true, extra: { 'mudrlant.look': JSON.stringify({ acc: { hand: { id: 'vlajka', color: 'original', flag: 'q127155' } } }) } });
        await tab.waitForSelector('#status-icon-slot [data-owl-flag-img]');
        await tab.waitForTimeout(400);
        const state = await flagState(tab, '#status-icon-slot');
        assert.equal(state.loaded, false);
        assert.equal(state.opacity, '0', 'stínování ani maska se bez vlajky nekreslí');
        assert.equal(await tab.locator('#status-icon-slot img[src="icons/doplnky/vlajka.webp"]').count(), 1, 'modré plátno je dole');
        assert.equal(await tab.locator('#status-icon-slot img[src="icons/doplnky/vlajka-zaklad.webp"]').count(), 1, 'tyčka také');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('vlajka v uložené volbě, kterou doplněk nezná (neplatné q, cizí doplněk), se zahodí', async () => {
        const { context, tab, problems } = await open({ extra: { 'mudrlant.look': JSON.stringify({ acc: { hand: { id: 'vlajka', color: 'original', flag: 'q1' }, neck: { id: 'sala', color: 'original', flag: 'q127155' } } }) } });
        await tab.waitForSelector('#status-icon-slot [data-owl-layer]');
        assert.equal(await tab.locator('#status-icon-slot [data-owl-flag-img]').count(), 0);
        assert.equal(await tab.locator('#status-icon-slot [data-owl-layer][src="icons/doplnky/vlajka.webp"]').count(), 1);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('okno se s vlajkou vejde i na malém telefonu 360×640 a v tmavém režimu (jako bez ní)', async () => {
        for (const [viewport, scheme] of [[{ width: 390, height: 780 }, 'dark'], [{ width: 360, height: 640 }, 'light']]) {
            const look = { acc: { hand: { id: 'vlajka', color: 'original', flag: 'q127155' }, face: { id: 'bryle', color: 'original' }, neck: { id: 'sala', color: 'original' } } };
            const { context, tab, problems } = await open({ viewport, scheme, extra: { 'mudrlant.look': JSON.stringify(look) } });
            await openOwlTab(tab);
            await tab.waitForSelector('[data-owl-flag]');
            const overflow = () => tab.evaluate(() => { const box = document.querySelector('#settings-overlay > div'); return box.scrollHeight - box.clientHeight; });
            const withFlag = await overflow();
            await tab.selectOption('[data-owl-flag]', '');
            await tab.waitForSelector('[data-owl-color]');
            const without = await overflow();
            assert.ok(withFlag <= without, `vlajka okno nezvětší oproti paletě (${withFlag} × ${without})`);
            if (viewport.height >= 780) assert.ok(without <= 0, 'bez posouvání i s paletou a výběrem vlajky');
            await shot(tab, `flag-okno-${viewport.width}-${scheme}.png`);
            assert.deepEqual(problems, []);
            await context.close();
        }
    });

    await t.test('cizí hráč s vlajkou v profilu: druhý hráč ji vidí u jeho sovy (data-keep), vlajku ostatních doplňků a obleku nepřebarví', async () => {
        const db = { profiles: {
            'u-1': { id: 'u-1', display_name: 'Jana', avatar: '🦊', color: 'emerald', owl: 'robe=zelena;face=bryle.original;hand=vlajka.original.q101472' },
            'u-2': { id: 'u-2', display_name: 'Petr', avatar: '🐸', color: 'sky', owl: 'robe=modra;hand=vlajka.original.q101472' }
        }, challenges: { ABC234: { id: 'ABC234', topic: 'zemepis', seed: 's', count: 5, creator_id: 'u-1', invited_id: 'u-2', created_at: '2026-11-03T10:00:00Z' } } };
        const backend = async (context) => {
            await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };' }));
            await context.route('https://proj.supabase.co/**', route => {
                const request = route.request();
                const url = new URL(request.url());
                const json = (body, status = 200) => route.fulfill({ status, json: body });
                if (url.pathname.startsWith('/auth/')) return json({});
                if (request.headers().authorization !== 'Bearer tok-u2') return json({ message: 'no token' }, 401);
                const eq = (key) => (url.searchParams.get(key) || '').replace(/^eq\./, '');
                if (url.pathname === '/rest/v1/profiles') return json([db.profiles[eq('id')]].filter(Boolean));
                if (url.pathname === '/rest/v1/challenges' && url.searchParams.has('id')) {
                    return json(Object.values(db.challenges).filter(c => c.id === eq('id')).map(c => ({ ...c, creator: db.profiles[c.creator_id], invited: db.profiles[c.invited_id] })));
                }
                if (url.pathname === '/rest/v1/challenges' && url.searchParams.has('invited_id')) {
                    return json(Object.values(db.challenges).filter(c => c.invited_id === eq('invited_id')).map(c => ({ ...c, creator: db.profiles[c.creator_id], invited: db.profiles[c.invited_id] })));
                }
                return json([]);
            });
        };
        const login = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok-u2', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-2', email: 'x@example.com', name: 'Petr' } }) };
        const { context, tab, problems } = await open({ backend, extra: { ...login, 'mudrlant.look': JSON.stringify({ robe: 'modra', acc: { hand: { id: 'vlajka', color: 'original', flag: 'q101472' } } }), 'mudrlant.progress': JSON.stringify({ xp: 5000, counters: {}, badges: { 'zbehly-vlajky': '2026-11-01' } }) } });
        await tab.click('[data-action="home-tab"][data-tab="multi"]');
        await tab.waitForSelector('#challenges-section [data-player-id="u-1"] [data-owl-flag-img]');
        await tab.waitForFunction(() => { const image = document.querySelector('#challenges-section [data-player-id="u-1"] [data-owl-flag-img]'); return image && image.complete && image.naturalWidth > 0; });
        await tab.waitForFunction(() => { const box = document.querySelector('#challenges-section [data-player-id="u-1"] .owl-flag'); return box && getComputedStyle(box).opacity === '1'; });
        // Seznam výzev se po načtení profilů ještě překreslí a nová vlaječka se ukáže až po načtení obrázku: čte se ustálený stav
        let seen = null;
        for (let attempt = 0; attempt < 30 && !(seen && seen.opacity === '1'); attempt++) {
            if (attempt) await tab.waitForTimeout(100);
            seen = await flagState(tab, '#challenges-section [data-player-id="u-1"]');
        }
        assert.ok(seen.src.includes('Flag_of_Indonesia.svg/120px-Flag_of_Indonesia.svg.png'));
        assert.equal(seen.opacity, '1');
        assert.equal(await tab.locator('#challenges-section [data-player-id="u-1"] [data-owl-layer]').count(), 0, 'cizí sova nemá vrstvy živé sovy');
        assert.equal(await tab.locator('#challenges-section [data-player-id="u-1"] [data-owl-flag-img][data-keep]').count(), 1);
        await tab.waitForTimeout(300);
        assert.equal(await tab.locator('#challenges-section [data-player-id="u-1"] img[data-keep]').first().getAttribute('src'), 'icons/logo-zelena.webp', 'oblek cizí sovy se nepřebarvil');
        // Hlavička se po načtení profilu ještě jednou překreslí: počká se na ustálený stav místo okamžitého počítání
        await tab.waitForFunction(() => document.querySelectorAll('#status-icon-slot [data-owl-flag-img]').length === 1);
        assert.equal(await tab.locator('#status-icon-slot [data-owl-flag-img]').count(), 1, 'můj Mudrlant má vlajku z lokální volby');
        await shot(tab, 'flag-cizi-hrac.png');
        // Okno výzvy: sova s vlajkou zůstane v kolečku avataru (vrstvy nejsou větší než pár násobků avataru)
        await tab.click('#challenges-section [data-action="challenge-open"][data-code="ABC234"]');
        await tab.waitForTimeout(800);
        await tab.waitForSelector('#dialog-overlay [data-owl-flag-img]');
        const sizes = await tab.evaluate(() => [...document.querySelectorAll('#dialog-overlay span.rounded-full')].filter(el => el.querySelector('[data-owl-flag-img]')).map(el => {
            const avatar = el.getBoundingClientRect();
            const layers = [...el.querySelectorAll('img[data-keep]')].map(img => { const r = img.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
            return { avatar: [Math.round(avatar.width), Math.round(avatar.height)], layers };
        }));
        assert.ok(sizes.length > 0, 'v okně výzvy je avatar s vlajkou');
        sizes.forEach(item => item.layers.forEach(([w, h]) => assert.ok(w <= item.avatar[0] * 3 && h <= item.avatar[1] * 3, `vrstva ${w}×${h} je mnohem větší než avatar ${item.avatar}`)));
        // Všechny vrstvy sovy s vlajkou jsou uvnitř jejího obalu (kontejner vlajky nesmí rozbít HTML odstavce: dřív se vrstvy rozpadly a vlajka byla přes celé okno)
        const stray = await tab.evaluate(() => [...document.querySelectorAll('#dialog-overlay img[src*="vlajka"], #dialog-overlay .owl-flag')].filter(node => !node.closest('span.relative.inline-flex')).length);
        assert.equal(stray, 0, 'vrstvy vlajky mimo obal sovy');
        const big = await tab.evaluate(() => [...document.querySelectorAll('#dialog-overlay .owl-flag, #dialog-overlay img[src*="vlajka"]')].filter(node => node.getBoundingClientRect().width > 150).length);
        assert.equal(big, 0, 'žádná vrstva vlajky není obří');
        assert.deepEqual(problems, []);
        await context.close();
    });
});
