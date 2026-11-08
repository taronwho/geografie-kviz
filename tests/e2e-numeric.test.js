// Číselné otázky v prohlížeči (numeric-questions.js): Seřaď (klepání 1–4, zrušení a přečíslování, potvrzení, správné pořadí
// s hodnotami ve výsledku) a Odhadni číslo (číselné pole, mezery a čárky, chybné zadání, stupnice s odhadem ve výsledku).
// Body a XP podle přesnosti, dvojnásobek ve variantě psaní, vzdání bez bodů, nic v chybách ani v opakování, dnešní otázky bez nich.
// Vzhled bez posouvání na 360×640 a 390×780 ve světlém i tmavém režimu, bez chyb CSP. SCREENSHOT_DIR=složka uloží snímky.
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
// Místo fotek z Commons obrázek z aplikace (ať jsou na snímcích vidět náhledy)
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons/topics/zemepis.webp'));
const STATE_VERSION = Number(/const STATE_VERSION = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);

const core = require('../quiz-core.js');
const Numeric = require('../numeric-questions.js');
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/countries.json'), 'utf8')).countries;
const contextOf = (topicId) => {
    const topic = require(`../topics/${topicId}.js`);
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
    return { topic, items: data.items, countries, byId: new Map(data.items.map(item => [item.q, item])), textPhotos: new Set() };
};
const idOf = (ctx, name, category) => ctx.items.find(item => item.n === name && (!category || item.c === category)).q;

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

test('číselné otázky Seřaď a Odhadni číslo v prohlížeči', { skip: !chromium && 'Playwright není nainstalovaný' }, async (t) => {
    const server = await startServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    t.after(async () => { await browser.close(); server.close(); });
    core.setCountries(countries);
    const zemepis = contextOf('zemepis');

    // storage = počáteční obsah localStorage; session = rozehraná otázka (otevře se přes #obnovit)
    const open = async ({ width = 390, height = 780, colorScheme = 'light', variant = 'choices', storage = {}, session = null, force = null }) => {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme });
        await context.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
        const seed = {
            'mudrlant.account': 'host', 'mudrlant.variant': variant, 'mudrlant.tutorial': { how: 'done' }, 'mudrlant.tips': { off: true },
            'mudrlant.settings': { tier: 'known', categories: { zemepis: ['hora'] }, seen: ['zemepis'] },
            ...(session ? { 'mudrlant.session': { version: STATE_VERSION, timestamp: Date.now(), mode: 'practice', pool: { kind: 'topic', topic: session.data.topic }, challenge: null, ...session } } : {}),
            ...storage
        };
        await context.addInitScript((values) => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            // Varianta hry se ukládá jako prostý text, ostatní jako JSON
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, key === 'mudrlant.variant' ? value : JSON.stringify(value));
        }, seed);
        await context.route(/^https:\/\//, route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cs.wikipedia.org') {
                const title = url.searchParams.get('titles');
                return route.fulfill({ json: { query: { pages: { 7: { pageid: 7, title, extract: `${title} je místo, o kterém se v testu mluví dlouze a podrobně, aby popis stačil k otázce bez dalších nápověd a vět navíc.` } } } } });
            }
            if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
            return route.abort();
        });
        const tab = await context.newPage();
        const problems = [];
        tab.on('pageerror', error => problems.push(error.message));
        tab.on('console', message => { if (/Content Security Policy|Uncaught/i.test(message.text())) problems.push(message.text()); });
        await tab.goto(`${origin}/${session ? '#obnovit' : ''}`);
        await tab.waitForFunction(() => Boolean(window.MudrlantNumeric));
        if (force) await tab.evaluate((kind) => { window.MudrlantNumeric.force = kind; }, force);
        return { context, tab, problems };
    };
    const read = (tab, key) => tab.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    // Po doběhnutí animace příchodu (fade-in posouvá obsah), jinak by se počítalo i odsazení animace
    const overflow = async (tab) => { await tab.waitForTimeout(700); return tab.evaluate(() => { const content = document.getElementById('app-content'); return content.scrollHeight - content.clientHeight; }); };
    // Oslava nového odznaku (první správná odpověď) by na snímku zakryla výsledek
    const shot = async (tab, name) => {
        if (!SHOTS) return;
        await tab.waitForTimeout(600);
        await tab.evaluate(() => { const celebration = document.getElementById('celebration'); if (celebration) celebration.remove(); });
        await tab.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    };
    const round = (variant = 'choices') => ({ hintLevel: 1, variant, answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false, review: false });
    const badges = (tab) => tab.$$eval('[data-action="order-pick"] [data-order-badge]', items => items.map(item => item.textContent.trim()));
    const pickInOrder = async (tab, indices) => { for (const index of indices) await tab.click(`[data-action="order-pick"][data-index="${index}"]`); };

    await t.test('Seřaď: klepání čísluje, druhé klepnutí číslo zruší, potvrzení dá body, XP a správné pořadí', async () => {
        const { context, tab, problems } = await open({ force: 'order' });
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-numeric-question="order"]');
        const data = (await read(tab, 'mudrlant.session')).data;
        assert.equal(data.numeric.kind, 'order');
        assert.equal(data.numeric.spec, 'zemepis-hora-vyska', 'jen hory: vlastnost vylosované hory');
        assert.equal(data.numeric.items.length, 4);
        assert.match(await tab.textContent('h2'), /^Seřaď od nej(vyšší|nižší)$/);
        assert.equal(await tab.locator('[data-action="hint"]').count(), 0, 'bez nápověd');
        assert.ok(await tab.isDisabled('[data-action="order-confirm"]'), 'potvrdit jde až se všemi čtyřmi');
        // Klepnutí dává další číslo; klepnutí na očíslovanou položku číslo zruší a ostatní se přečíslují
        await pickInOrder(tab, [0, 1, 2]);
        assert.deepEqual(await badges(tab), ['1', '2', '3', '']);
        await tab.click('[data-action="order-pick"][data-index="0"]');
        assert.deepEqual(await badges(tab), ['', '1', '2', '']);
        assert.equal(await tab.getAttribute('[data-action="order-pick"][data-index="1"]', 'aria-pressed'), 'true');
        assert.equal(await tab.getAttribute('[data-action="order-pick"][data-index="0"]', 'aria-pressed'), 'false');
        assert.match(await tab.textContent('[data-order-status]'), /Vybráno 2 ze 4/);
        assert.deepEqual((await read(tab, 'mudrlant.session')).round.pick, [1, 2], 'rozklikané pořadí se ukládá');
        // Teď správně: zrušit a naklepat podle správného pořadí
        await pickInOrder(tab, [1, 2]);
        assert.deepEqual(await badges(tab), ['', '', '', '']);
        await pickInOrder(tab, data.numeric.order);
        assert.ok(!(await tab.isDisabled('[data-action="order-confirm"]')));
        await tab.click('[data-action="order-confirm"]');
        await tab.waitForSelector('[data-numeric-result="order"]');
        const verdict = await tab.textContent('[data-verdict]');
        assert.match(verdict, /Správně! \+4 body/);
        assert.match(verdict, /\+30 XP/, '10 XP a 5 za každý bod');
        const rows = await tab.$$eval('[data-numeric-result] ol button', items => items.map(item => item.textContent.replace(/\s+/g, ' ').trim()));
        assert.equal(rows.length, 4);
        data.numeric.order.forEach((index, position) => {
            assert.ok(rows[position].includes(data.numeric.items[index].name), 'správné pořadí');
            assert.ok(rows[position].replace(/\s/g, '').includes(data.numeric.items[index].label.replace(/\s/g, '')), 's hodnotou a jednotkou');
            assert.match(rows[position], /sedí/);
        });
        const stats = await read(tab, 'mudrlant.stats');
        assert.equal(stats.practice.points, 4);
        assert.equal(stats.practice.correct, 1);
        assert.deepEqual(await read(tab, 'mudrlant.mistakes') || [], [], 'do chyb nic');
        assert.equal((await read(tab, 'mudrlant.progress')).xp, 30);
        // Položka ze správného pořadí jde rozkliknout (okno s popisem)
        await tab.click('[data-numeric-result] ol li:first-child button');
        await tab.waitForSelector('#place-info');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Seřaď: jedna prohozená sousední dvojice dá 2 body, jinak nic a jde to do statistik jako chyba bez karty opakování', async () => {
        const { context, tab, problems } = await open({ force: 'order' });
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-numeric-question="order"]');
        const data = (await read(tab, 'mudrlant.session')).data;
        const [a, b, c, d] = data.numeric.order;
        await pickInOrder(tab, [a, b, d, c]);
        await tab.click('[data-action="order-confirm"]');
        await tab.waitForSelector('[data-numeric-result="order"]');
        assert.match(await tab.textContent('[data-verdict]'), /Skoro! \+2 body/);
        assert.match(await tab.textContent('[data-verdict]'), /sousední/);
        const marks = await tab.$$eval('[data-numeric-result] ol button', items => items.map(item => /sedí/.test(item.textContent)));
        assert.deepEqual(marks, [true, true, false, false], 'která místa sedí');
        assert.match(await tab.textContent('[data-numeric-result] ol li:nth-child(3)'), /tvoje 4\./);
        assert.equal((await read(tab, 'mudrlant.stats')).practice.points, 2);
        // Další otázka (dál vynucená číselná): úplně obrácené pořadí je bez bodů
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('[data-numeric-question="order"]');
        const next = (await read(tab, 'mudrlant.session')).data;
        await pickInOrder(tab, [...next.numeric.order].reverse());
        await tab.click('[data-action="order-confirm"]');
        await tab.waitForSelector('[data-numeric-result="order"]');
        assert.match(await tab.textContent('[data-verdict]'), /Pořadí nesedí/);
        const stats = await read(tab, 'mudrlant.stats');
        assert.deepEqual([stats.practice.played, stats.practice.correct, stats.practice.points], [2, 1, 2]);
        assert.deepEqual(await read(tab, 'mudrlant.mistakes') || [], [], 'špatné pořadí se do chyb nepočítá');
        assert.deepEqual(await read(tab, 'mudrlant.review') || [], [], 'ani do opakování');
        assert.equal((await read(tab, 'mudrlant.progress')).xp, 20 + 2, '2 body = 20 XP, špatná odpověď 2 XP');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('Odhadni číslo: číselné pole s jednotkou, nesmysl neodešle, mezery a tečky nevadí, body podle přesnosti a stupnice', async () => {
        const { context, tab, problems } = await open({ force: 'estimate' });
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-numeric-question="estimate"]');
        const data = (await read(tab, 'mudrlant.session')).data;
        assert.equal(data.numeric.kind, 'estimate');
        assert.equal(await tab.textContent('h2'), 'Kolik metrů měří tato hora?');
        assert.equal(await tab.getAttribute('#estimate-input', 'inputmode'), 'numeric');
        assert.match(await tab.textContent('#estimate-form'), /\bm\b/, 'jednotka u pole');
        await tab.fill('#estimate-input', 'hodně');
        await tab.click('#estimate-form button[type="submit"]');
        assert.match(await tab.textContent('#estimate-note'), /Napiš číslo/);
        assert.equal(await tab.getAttribute('#estimate-input', 'aria-invalid'), 'true');
        assert.equal(await tab.locator('[data-numeric-question="estimate"]').count(), 1, 'nesmysl se neodešle');
        // Odhad o 8 % vyšší, s tečkou jako oddělovačem tisíců: 3 body
        const guess = Math.round(data.numeric.value * 1.08);
        const typed = guess >= 1000 ? `${String(guess).slice(0, -3)}.${String(guess).slice(-3)}` : String(guess);
        await tab.fill('#estimate-input', typed);
        assert.match(await tab.textContent('#estimate-note'), new RegExp(`Tvůj odhad: ${core.formatNumber(guess).replace(/\s/g, '\\s')} m`));
        await tab.press('#estimate-input', 'Enter');
        await tab.waitForSelector('[data-numeric-result="estimate"]');
        const verdict = await tab.textContent('[data-verdict]');
        assert.match(verdict, /Skvělý odhad! \+3 body/);
        assert.match(verdict, /o 8 % víc/);
        assert.equal((await tab.textContent('[data-estimate-truth]')).replace(/\s/g, ''), data.numeric.label.replace(/\s/g, ''));
        // Stupnice: správná hodnota a odhad jako dva kroužky
        await tab.waitForFunction(() => document.querySelectorAll('#numeric-scale svg circle').length === 2);
        assert.match(await tab.getAttribute('#numeric-scale', 'aria-label'), /tvůj odhad/);
        assert.match(await tab.textContent('[data-numeric-result]'), /Body: 4 body do 5 %, 3 do 10 %, 2 do 25 %, 1 do 50 %/);
        assert.equal((await read(tab, 'mudrlant.stats')).practice.points, 3);
        assert.equal((await read(tab, 'mudrlant.progress')).xp, 25);
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('psaní odpovědí: číselné otázky za dvojnásobek; vzdání bez bodů; dnešní otázka nikdy číselná', async () => {
        const { context, tab, problems } = await open({ variant: 'typed', force: 'estimate' });
        await tab.click('[data-action="play-topic"][data-topic="zemepis"]');
        await tab.waitForSelector('[data-numeric-question="estimate"]');
        assert.match(await tab.textContent('[data-numeric-question]'), /Až 8 bodů podle přesnosti/);
        const data = (await read(tab, 'mudrlant.session')).data;
        await tab.fill('#estimate-input', core.formatNumber(data.numeric.value));
        await tab.click('#estimate-form button[type="submit"]');
        await tab.waitForSelector('[data-numeric-result="estimate"]');
        assert.match(await tab.textContent('[data-verdict]'), /Výborně! \+8 bodů/);
        assert.match(await tab.textContent('[data-verdict]'), /přesně/);
        assert.equal((await read(tab, 'mudrlant.progress')).counters.typedCorrect, 0, 'číslo není psaná odpověď na název');
        await tab.click('[data-action="next"]');
        await tab.waitForSelector('[data-numeric-question="estimate"]');
        await tab.click('[data-action="give-up"]');
        await tab.waitForSelector('[data-numeric-result="estimate"]');
        assert.match(await tab.textContent('[data-verdict]'), /Tentokrát bez odpovědi/);
        assert.doesNotMatch(await tab.textContent('[data-verdict]'), /XP/);
        await tab.waitForFunction(() => document.querySelectorAll('#numeric-scale svg circle').length === 1, null, { timeout: 5000 });
        // Dnešní otázka: i s vynucenou číselnou otázkou obyčejná otázka
        await tab.click('#btn-home');
        await tab.waitForSelector('[data-action="daily"][data-topic="zemepis"]');
        await tab.click('[data-action="daily"][data-topic="zemepis"]');
        await tab.waitForSelector('#answer-form', { timeout: 30000 });
        assert.equal(await tab.locator('[data-numeric-question]').count(), 0);
        assert.ok(!(await read(tab, 'mudrlant.session')).data.numeric);
        assert.deepEqual(problems, []);
        await context.close();
    });

    // Pevné otázky na snímky a na kontrolu vzhledu (Sněžka, slavné hory, bitvy, státy v milionech)
    const historie = contextOf('historie');
    const sessions = {
        'seradit-hory': Numeric.buildRound({ kind: 'order', spec: 'zemepis-hora-vyska', dir: 'desc', ids: ['Sněžka', 'Mount Everest', 'Mont Blanc', 'Fudži'].map(name => idOf(zemepis, name, 'hora')) }, zemepis),
        'seradit-bitvy': Numeric.buildRound({ kind: 'order', spec: 'historie-bitva-rok', dir: 'asc', ids: ['Bitva u Slavkova', 'Bitva na Bílé hoře', 'Bitva u Lipan', 'Bitva u Stalingradu'].map(name => idOf(historie, name, 'bitva')) }, historie),
        'odhad-snezka': Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-hora-vyska', ids: [idOf(zemepis, 'Sněžka', 'hora')] }, zemepis),
        'odhad-obyvatele': Numeric.buildRound({ kind: 'estimate', spec: 'zemepis-stat-obyvatele', ids: [idOf(zemepis, 'Česko', 'stat')] }, zemepis)
    };
    for (const [name, data] of Object.entries(sessions)) assert.ok(data, `${name} jde sestavit`);

    await t.test('vzhled: otázka bez posouvání, výsledek s verdiktem a pořadím na očích (360×640, 390×780, světlý i tmavý)', async () => {
        for (const [width, height] of [[390, 780], [360, 640]]) {
            for (const colorScheme of ['light', 'dark']) {
                const size = `${width}-${colorScheme === 'dark' ? 'tmavy' : 'svetly'}`;
                for (const name of ['seradit-hory', 'seradit-bitvy']) {
                    const { context, tab, problems } = await open({ width, height, colorScheme, session: { data: sessions[name], round: round() } });
                    await tab.waitForSelector('[data-numeric-question="order"]');
                    assert.ok(await overflow(tab) <= 1, `${name} se vejde bez posouvání ${size}`);
                    // Každá položka je dost velká na prst
                    const boxes = await tab.$$eval('[data-action="order-pick"]', items => items.map(item => item.getBoundingClientRect().height));
                    assert.ok(boxes.every(h => h >= 40), `položky aspoň 40 px (${boxes.join(', ')})`);
                    await pickInOrder(tab, [1, 2]);
                    await shot(tab, `${name}-otazka-${size}`);
                    const data = sessions[name];
                    await tab.click('[data-action="order-pick"][data-index="1"]');
                    await tab.click('[data-action="order-pick"][data-index="2"]');
                    const [a, b, c, d] = data.numeric.order;
                    await pickInOrder(tab, [a, c, b, d]);
                    await tab.click('[data-action="order-confirm"]');
                    await tab.waitForSelector('[data-numeric-result="order"]');
                    // Verdikt i celé správné pořadí jsou vidět bez posouvání, tlačítko Další je přilepené dole
                    const visible = await tab.evaluate(() => {
                        const view = document.getElementById('app-content').getBoundingClientRect();
                        const last = document.querySelector('[data-numeric-result] ol li:last-child').getBoundingClientRect();
                        const next = document.querySelector('[data-action="next"]').getBoundingClientRect();
                        return { list: last.bottom <= next.top + 1, next: next.bottom <= view.bottom + 1 };
                    });
                    assert.deepEqual(visible, { list: true, next: true }, `${name}: pořadí nad tlačítkem Další ${size}`);
                    await shot(tab, `${name}-vysledek-${size}`);
                    assert.deepEqual(problems, []);
                    await context.close();
                }
                for (const name of ['odhad-snezka', 'odhad-obyvatele']) {
                    const { context, tab, problems } = await open({ width, height, colorScheme, session: { data: sessions[name], round: round() } });
                    await tab.waitForSelector('[data-numeric-question="estimate"]');
                    assert.ok(await overflow(tab) <= 1, `${name} se vejde bez posouvání ${size}`);
                    const submit = await tab.$eval('#estimate-form button[type="submit"]', item => item.getBoundingClientRect());
                    assert.ok(submit.height >= 40 && submit.width >= 40, 'tlačítko odeslání dost velké');
                    await tab.fill('#estimate-input', name === 'odhad-snezka' ? '1 500' : '10,5');
                    await shot(tab, `${name}-otazka-${size}`);
                    await tab.press('#estimate-input', 'Enter');
                    await tab.waitForSelector('[data-numeric-result="estimate"]');
                    await tab.waitForFunction(() => document.querySelectorAll('#numeric-scale svg circle').length === 2);
                    const visible = await tab.evaluate(() => {
                        const scale = document.getElementById('numeric-scale').getBoundingClientRect();
                        const next = document.querySelector('[data-action="next"]').getBoundingClientRect();
                        return scale.bottom <= next.top + 1;
                    });
                    assert.ok(visible, `${name}: stupnice nad tlačítkem Další ${size}`);
                    await shot(tab, `${name}-vysledek-${size}`);
                    assert.deepEqual(problems, []);
                    await context.close();
                }
            }
        }
    });

    await t.test('Odhadni číslo: počet obyvatel státu v milionech (10,5 = 10,5 mil.), celé číslo platí také', async () => {
        const data = sessions['odhad-obyvatele'];
        const { context, tab, problems } = await open({ session: { data, round: round() } });
        await tab.waitForSelector('[data-numeric-question="estimate"]');
        assert.equal(await tab.getAttribute('#estimate-input', 'inputmode'), 'decimal');
        await tab.fill('#estimate-input', '10 900 000');
        assert.match(await tab.textContent('#estimate-note'), /10,9 mil\. obyvatel/);
        await tab.fill('#estimate-input', '10,5');
        assert.match(await tab.textContent('#estimate-note'), /10,5 mil\. obyvatel/);
        await tab.press('#estimate-input', 'Enter');
        await tab.waitForSelector('[data-numeric-result="estimate"]');
        assert.match(await tab.textContent('[data-verdict]'), /\+4 body/, '10,5 mil. proti 10,9 mil. je do 5 %');
        assert.deepEqual(problems, []);
        await context.close();
    });

    await t.test('učení: procvičení okruhu zůstává bez číselných otázek; rozehrané pořadí se po obnovení stránky ukáže znovu', async () => {
        const { context, tab, problems } = await open({ force: 'order' });
        await tab.click('#btn-learn');
        await tab.click('[data-action="learn-topic"][data-topic="zemepis"]');
        await tab.click('[data-action="learn-collection"] >> nth=0');
        await tab.click('[data-action="learn-practice"]');
        await tab.waitForSelector('[data-action="choice"]', { timeout: 30000 });
        assert.equal(await tab.locator('[data-numeric-question]').count(), 0);
        await context.close();
        // Obnovení rozehrané otázky (#obnovit): vybraná čísla zůstanou
        const again = await open({ session: { data: sessions['seradit-hory'], round: { ...round(), pick: [2, 0] } } });
        await again.tab.waitForSelector('[data-numeric-question="order"]');
        assert.deepEqual(await badges(again.tab), ['2', '', '1', '']);
        assert.deepEqual([...problems, ...again.problems], []);
        await again.context.close();
    });
});
