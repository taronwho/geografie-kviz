// Slepá mapa regionu v prohlížeči (Vlajky a znaky): u státu USA, spolkové země, českého kraje… celý stát s hranicemi regionů,
// hledaný region zvýrazněný a tečka na něm, měřítko podle skutečného výřezu; bez dat regionů obrysy států s tečkou uprostřed;
// u bodu uprostřed velkého státu (zeměpis) se mapa oddálí. Na 390×780 a 360×640 ve světlém i tmavém režimu.
// Skutečná data (data/vlajky.json, data/regiony.json, data/world.json); otázka se obnoví z uložené relace (#obnovit).
// S proměnnou SCREENSHOT_DIR=složka uloží snímky nápovědy (pro kontrolu vzhledu).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://geo.test';
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const SCREENSHOTS = process.env.SCREENSHOT_DIR;

const core = require('../quiz-core.js');
const vlajky = require('../topics/vlajky.js');
const data = require('../data/vlajky.json');
const countries = require('../data/countries.json').countries;
const ctx = { countries, items: data.items };
const find = (name) => data.items.find(item => item.n === name);

// Uložená rozehraná otázka „Který region to je?“ s odemčenou slepou mapou (nápovědy z modulu tématu)
const sessionFor = (item, others) => {
    const hints = vlajky.hints(item, ctx, 'name').map((hint, index) => ({
        ...hint, key: hint.kind === 'visual' ? 'visual' : `facts-${index}`, label: hint.kind === 'visual' ? 'slepá mapa' : 'čísla a fakta', icon: hint.kind === 'visual' ? 'map' : 'list'
    }));
    const choices = [item, ...others].map((choice, index) => ({ id: choice.q, label: choice.n, ...(index === 0 ? { correct: true } : {}) }));
    const round = {
        topic: 'vlajky', id: item.q, title: item.n, name: item.n, category: item.c, known: true, typeLabel: 'region',
        question: { type: 'name', title: 'Který region to je?', showName: false, choices, accepted: [item.n], placeholder: '', answerLabel: item.n },
        questionText: 'Vlajka jednoho z regionů světa. Kterému patří?', photoUrl: null, questionImage: null, visual: hints[1].spec, resultVisual: null, resultFacts: [],
        hints, subtitle: '', coords: null, isCzech: false, description: '', funFacts: []
    };
    return { version: 8, data: round, round: { hintLevel: hints.length + 1, variant: 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false, tab: 'visual' }, mode: 'practice', pool: { kind: 'topic', topic: 'vlajky' }, challenge: null, timestamp: Date.now() };
};

test('slepá mapa regionu', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(() => browser.close());

    const open = async (session, { width = 390, height = 780, colorScheme = 'light', regionsDown = false } = {}) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.addInitScript((entries) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
        }, { 'mudrlant.account': JSON.stringify('host'), 'mudrlant.variant': 'choices', 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.session': JSON.stringify(session) });
        const requests = [];
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === ORIGIN) {
                requests.push(url.pathname);
                if (url.pathname === '/data/regiony.json' && regionsDown) return route.fulfill({ status: 503, body: '' });
                const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
                if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
                const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
                if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
                return route.fulfill({ status: 200, headers, body: fs.readFileSync(file) });
            }
            if (url.hostname === 'cs.wikipedia.org') return route.fulfill({ json: { query: { pages: {} } } });
            if (['upload.wikimedia.org', 'tile.openstreetmap.org', 'gibs.earthdata.nasa.gov'].includes(url.hostname)) return route.fulfill({ contentType: 'image/png', body: PNG });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${ORIGIN}/#obnovit`);
        await tab.waitForSelector('#hint-visual svg path', { timeout: 30000 });
        return { context, tab, problems, requests };
    };
    // Vrstvy mapy podle tříd: výplň regionu, hranice regionů, obrys státu, tečka; měřítko a popis pro čtečku
    const inspect = (tab) => tab.evaluate(() => {
        const box = document.getElementById('hint-visual');
        const svg = box.querySelector('svg');
        const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
        const paths = [...svg.querySelectorAll('path')];
        const length = (path) => path ? path.getTotalLength() : 0;
        const dot = svg.querySelector('circle.fill-rose-500');
        return {
            width, height,
            region: paths.filter(path => path.classList.contains('fill-emerald-400')).length,
            lines: length(paths.find(path => path.classList.contains('stroke-slate-400') && path.getAttribute('fill') === 'none')),
            outline: length(paths.find(path => path.classList.contains('stroke-slate-500') && path.getAttribute('fill') === 'none')),
            dot: dot ? [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))] : null,
            corner: box.parentElement.querySelector('[data-visual-corner]').textContent,
            label: box.getAttribute('aria-label'),
            text: svg.querySelectorAll('text').length
        };
    });
    const shoot = async (tab, name) => {
        if (!SCREENSHOTS) return;
        fs.mkdirSync(SCREENSHOTS, { recursive: true });
        // Po doběhnutí animace vstupu
        await tab.waitForTimeout(600);
        await tab.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`) });
    };

    await t.test('stát USA: celé USA s hranicemi států, Kansas zvýrazněný s tečkou, měřítko celé mapy', async () => {
        const kansas = find('Kansas');
        for (const colorScheme of ['light', 'dark']) {
            const { context, tab, problems, requests } = await open(sessionFor(kansas, ['Indiana', 'Wisconsin', 'Michigan'].map(find)), { colorScheme });
            const map = await inspect(tab);
            assert.equal(map.region, 1, 'Kansas je zvýrazněný');
            assert.ok(map.lines > 2000, `hranice států jsou vidět (${Math.round(map.lines)} px)`);
            assert.ok(map.outline > 1000, `obrys USA je vidět (${Math.round(map.outline)} px)`);
            assert.ok(map.dot[0] > 0 && map.dot[0] < map.width && map.dot[1] > 0 && map.dot[1] < map.height, 'tečka je ve výřezu');
            // Tečka v Kansasu: uprostřed USA, ne uprostřed mapy přesně (výřez je na celý stát)
            assert.ok(Math.abs(map.dot[0] - map.width / 2) < map.width * 0.15, 'Kansas je zhruba uprostřed USA');
            // Měřítko celého USA (přes 4 000 km), ne původních 1 200 km kolem bodu
            const km = Number(map.corner.replace(/[^\d]/g, ''));
            assert.ok(km > 4000 && km < 8000, map.corner);
            assert.match(map.label, /Region je vyznačený tečkou, výřez je široký asi [\d\s ]+ km/);
            assert.equal(map.text, 0, 'na mapě není žádný popisek');
            assert.ok(requests.includes('/data/regiony.json'));
            assert.ok(!requests.includes('/data/world.json'), 'obrysy světa nejsou potřeba');
            assert.deepEqual(problems, []);
            await shoot(tab, `kansas-390-${colorScheme}`);
            await context.close();
        }
    });

    await t.test('regiony dalších států a český kraj ve světlém i tmavém režimu', async () => {
        const cases = [['Sasko', 'sasko'], ['Jihomoravský kraj', 'jihomoravsky-kraj'], ['Manitoba', 'manitoba'], ['Queensland', 'queensland'], ['Uri', 'uri'], ['Tatarstán', 'tatarstan'], ['Bío-Bío', 'bio-bio'], ['Rhode Island', 'rhode-island']];
        for (const [name, file] of cases) {
            const item = find(name);
            const others = data.items.filter(other => other.c === item.c && other.co[0] === item.co[0] && other !== item).slice(0, 3);
            for (const colorScheme of ['light', 'dark']) {
                if (!SCREENSHOTS && colorScheme === 'dark' && file !== 'sasko') continue;
                const { context, tab, problems } = await open(sessionFor(item, others), { colorScheme });
                const map = await inspect(tab);
                assert.equal(map.region, 1, `${name}: region zvýrazněný`);
                assert.ok(map.lines + map.outline > map.width + map.height, `${name}: dost hranic (${Math.round(map.lines)} + ${Math.round(map.outline)} px)`);
                assert.ok(map.dot[0] > 0 && map.dot[0] < map.width && map.dot[1] > 0 && map.dot[1] < map.height, `${name}: tečka ve výřezu`);
                assert.deepEqual(problems, []);
                await shoot(tab, `${file}-390-${colorScheme}`);
                await context.close();
            }
        }
    });

    await t.test('malý telefon 360×640: mapa vyplní nízký panel a pořád ukáže hranice', async () => {
        const item = find('Kansas');
        for (const colorScheme of ['light', 'dark']) {
            const { context, tab, problems } = await open(sessionFor(item, ['Indiana', 'Wisconsin', 'Michigan'].map(find)), { width: 360, height: 640, colorScheme });
            const map = await inspect(tab);
            assert.ok(map.height >= 100, `panel mapy je vidět (${map.height} px)`);
            assert.ok(map.lines > 1000, `hranice států (${Math.round(map.lines)} px)`);
            assert.ok(map.dot[1] > 0 && map.dot[1] < map.height);
            // Po doběhnutí animace vstupu se stránka neposouvá
            await tab.waitForTimeout(600);
            const overflow = await tab.evaluate(() => { const content = document.getElementById('app-content'); return content.scrollHeight - content.clientHeight; });
            assert.ok(overflow <= 1, `stránka se neposouvá (${overflow} px)`);
            assert.deepEqual(problems, []);
            await shoot(tab, `kansas-360-${colorScheme}`);
            await context.close();
        }
    });

    await t.test('bez dat regionů: obrysy států a tečka uprostřed', async () => {
        const { context, tab, problems, requests } = await open(sessionFor(find('Kansas'), ['Indiana', 'Wisconsin', 'Michigan'].map(find)), { regionsDown: true });
        const map = await inspect(tab);
        assert.ok(requests.includes('/data/world.json'));
        assert.deepEqual(map.dot.map(Math.round), [Math.round(map.width / 2), Math.round(map.height / 2)]);
        assert.equal(map.region, 0);
        assert.match(map.corner, /↔ [\d\s ]+ km/, 'měřítko i bez dat regionů');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('zeměpis: bod uprostřed velkého státu – mapa se oddálí, až jsou vidět hranice, měřítko odpovídá', async () => {
        const spec = { type: 'map', lat: 39.74, lon: -104.99, span: 24, highlightIso: '', label: 'Místo je uprostřed' };
        const session = sessionFor(find('Kansas'), ['Indiana', 'Wisconsin', 'Michigan'].map(find));
        session.data.hints[1] = { ...session.data.hints[1], spec };
        session.data.visual = spec;
        const { context, tab, problems } = await open(session);
        const map = await inspect(tab);
        const width = (await tab.evaluate(() => document.getElementById('hint-visual').clientWidth));
        const height = (await tab.evaluate(() => document.getElementById('hint-visual').clientHeight));
        const world = require('../data/world.json');
        const span = core.blindMapSpan(world, { lat: spec.lat, lon: spec.lon, spanLon: 24, width, height });
        assert.ok(span > 24, `oddáleno na ${span}°`);
        const km = Number(map.corner.replace(/[^\d]/g, ''));
        const expected = span * 111.32 * Math.cos(spec.lat * Math.PI / 180);
        assert.ok(Math.abs(km - expected) <= 100, `${map.corner} ≈ ${Math.round(expected)} km`);
        assert.deepEqual(problems, []);
        await shoot(tab, 'denver-zemepis-390-light');
        await context.close();
    });
});
