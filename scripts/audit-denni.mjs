#!/usr/bin/env node
// Audit stejnosti denních módů: node scripts/audit-denni.mjs [--day=2026-11-17] [--modes=quiz,daily,chain,boss,mystery] [--out=soubor.json] [--quick]
// Skutečná aplikace a data v prohlížeči (Playwright) a několik hráčů téhož dne, kteří se liší vším, co se lišit smí: nastavení (známost,
// témata, kategorie, varianta psaní), úroveň a XP, historie otázek a chyb, časové pásmo telefonu (Praha, UTC půl hodiny po pražské
// půlnoci, New York), dostupnost Wikipedie, přihlášení a verze dat (nasazení během dne: jiné položky a fotky). Pro každý mód se zapíše,
// co hráč dostal (položky a možnosti otázek, řetěz, tajemná položka, otázky bosse), a porovná se s prvním hráčem.
// Server (Supabase) je falešný v paměti a umí zamrzlé otázky jako schéma 33 (question_snapshot_claim, question_snapshots_get,
// daily_snapshots_get i pro hosta); hráč se „starou“ databází (server: 'old') je nemá.
// Očekávání: všichni hráči se schématem 33 mají všechno stejné (i po nasazení s jinými daty a bez Wikipedie); hráč bez serveru se stejnými
// daty také; jen hráč bez serveru s jinou verzí dat se smí lišit (bez zamrzlých otázek to jinak nejde) – audit to vypíše jako očekávané.
// Návratový kód 1 = rozdíl tam, kde být nemá.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const DAY = args.day || '2026-11-17';
const MODES = (args.modes || 'quiz,daily,chain,boss,mystery').split(',');
const QUICK = args.quick === 'true';
const DAILY_TOPICS = QUICK ? ['zemepis', 'historie', 'geologie', 'vlajky'] : null;
const QUIZ_COUNT = QUICK ? 3 : 10;
const BOSS_COUNT = QUICK ? 2 : 4;
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1].replace("connect-src 'self'", "connect-src 'self' https://proj.supabase.co");
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons', 'topics', 'sova-vitej.webp'));
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);

// --- Verze dat: v2 = nasazení během dne (u každého tématu chybí položky, které první hráč dostal, a třetina fotek; jiné pořadí) ---
const askedIds = new Set();
const dataVersion = (pathname, version) => {
    const file = path.join(ROOT, pathname);
    const raw = fs.readFileSync(file);
    if (version !== 'v2' || !/^\/data\/(zemepis|historie|biologie|chemie|fyzika|vlajky|mytologie|geologie|umeni|architektura|hudba|literatura|film|sport)\.json$/.test(pathname)) return raw;
    const data = JSON.parse(raw);
    data.items = data.items.filter(item => !askedIds.has(item.q)).map((item, i) => {
        if (i % 3 === 0 && item.im) { const copy = { ...item }; delete copy.im; delete copy.ih; return copy; }
        return item;
    });
    // Nová položka na začátku každé kategorie (v nových datech přibyla)
    const categories = [...new Set(data.items.map(item => item.c))];
    data.items = [...categories.map((c, i) => ({ ...data.items.find(item => item.c === c), q: `Qnova${i}`, n: `Nová položka ${i}`, t: `Nová položka ${i}`, k: 1 })), ...data.items];
    return Buffer.from(JSON.stringify(data));
};
const startServer = () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        let pathname = decodeURIComponent(url.pathname);
        const version = url.searchParams.get('v') || (req.headers.cookie || '').match(/datav=(v\d)/)?.[1] || 'v1';
        if (pathname === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(CONFIG); return; }
        if (pathname === '/') pathname = '/index.html';
        const file = path.join(ROOT, pathname);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        res.writeHead(200, headers);
        res.end(dataVersion(pathname, version));
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
};

// --- Falešný server: zamrzlé otázky (schéma 33) sdílené všemi hráči ---
const snapshots = new Map();
const USERS = { 'tok-a': 'u-a', 'tok-c': 'u-c' };
const wikiReply = (url) => {
    const title = new URL(url).searchParams.get('titles') || 'Článek';
    const extract = `${title} je známý pojem, o kterém se často píše v knihách i v novinách a ve školních učebnicích. Patří k tomu nejzajímavějšímu ve svém oboru a lidé o něm rádi vyprávějí svým přátelům i dětem. Další věta úvodu přidává podrobnosti o historii, významu a souvislostech.`;
    return { query: { pages: { 1: { title, extract } } } };
};
const routeExternal = async (context, player) => {
    await context.route(/^https:\/\/(cs\.wikipedia\.org|commons\.wikimedia\.org|upload\.wikimedia\.org|proj\.supabase\.co)\//, async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === 'cs.wikipedia.org') return player.wiki ? route.fulfill({ json: wikiReply(url.href) }) : route.abort();
        if (url.hostname !== 'proj.supabase.co') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
        if (url.pathname.startsWith('/auth/')) return route.fulfill({ json: {} });
        if (url.pathname === '/rest/v1/client_errors') return route.fulfill({ status: 201, body: '' });
        const uid = USERS[(request.headers().authorization || '').replace('Bearer ', '')] || null;
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const body = request.postData() ? JSON.parse(request.postData()) : {};
        const missing = () => route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } });
        if (!rpc) return uid ? route.fulfill({ json: [] }) : route.fulfill({ status: 401, json: { message: 'no token' } });
        const name = rpc[1];
        const old = player.server === 'old';
        if (name === 'daily_snapshots_get') {
            if (old) return missing();
            return route.fulfill({ json: (body.seeds || []).filter(seed => snapshots.has(seed)).map(seed => ({ seed, data: snapshots.get(seed) })) });
        }
        if (!uid) return route.fulfill({ status: 401, json: { message: 'no token' } });
        if (name === 'schema_version') return route.fulfill({ json: old ? 32 : REQUIRED_SCHEMA });
        if (name === 'question_snapshots_get') return route.fulfill({ json: (body.seeds || []).filter(seed => snapshots.has(seed)).map(seed => ({ seed, data: snapshots.get(seed) })) });
        if (name === 'question_snapshot_claim') {
            const daily = /^mudrlant-(dnes|retezovka|tajemna|boss)-/.test(body.seed);
            if (old && daily) return route.fulfill({ status: 403, json: { code: '42501', message: 'Tuhle otázku uložit nejde.' } });
            if (!snapshots.has(body.seed)) snapshots.set(body.seed, body.data);
            return route.fulfill({ json: snapshots.get(body.seed) });
        }
        if (name === 'touch_seen') return route.fulfill({ status: 204, body: '' });
        return missing();
    });
};

// --- Hráči (liší se vším, co se lišit smí) ---
const noon = (tzOffsetHours = 1, hour = 12) => new Date(`${DAY}T${String(hour).padStart(2, '0')}:00:00+0${tzOffsetHours}:00`);
const halfPastMidnightUtc = () => new Date(Date.parse(`${DAY}T00:30:00+01:00`)); // 23:30 UTC předchozího dne
const login = (token, id) => ({ 'mudrlant.auth': JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: 4102444800, user: { id, email: `${id}@example.com`, name: id } }) });
const settings = (tier, topics, extra = {}) => ({ 'mudrlant.settings': JSON.stringify({ tier, topics, ...extra }) });
const PLAYERS = [
    { id: 'A', label: 'přihlášený, Praha, poledne, Základní, Wikipedie ano, data v1 (hraje první)', tz: 'Europe/Prague', now: noon(), wiki: true, data: 'v1', server: 'new',
        storage: { ...login('tok-a', 'u-a'), ...settings('known', ['zemepis', 'historie']), 'mudrlant.variant': 'choices' } },
    { id: 'B', label: 'host, UTC 23:30 (Praha 0:30), Expert, psaní, vysoká úroveň, historie, bez Wikipedie, data v1', tz: 'UTC', now: halfPastMidnightUtc(), wiki: false, data: 'v1', server: 'new',
        storage: { ...settings('expert', ['biologie', 'film', 'sport']), 'mudrlant.variant': 'typed', 'mudrlant.progress': JSON.stringify({ xp: 250000, badges: {}, counters: {} }),
            'mudrlant.history': JSON.stringify(Array.from({ length: 200 }, (_, i) => `Q${i + 1}`)), 'mudrlant.mistakes': JSON.stringify(['zemepis:Q213', 'historie:Q42']) } },
    { id: 'C', label: 'přihlášený, New York, večer, data v2 (nasazení během dne), Wikipedie ano', tz: 'America/New_York', now: noon(1, 18), wiki: true, data: 'v2', server: 'new',
        storage: { ...login('tok-c', 'u-c'), ...settings('all', ['chemie']), 'mudrlant.variant': 'choices' } },
    { id: 'D', label: 'host, Praha, stará databáze (bez zamrzlých otázek), data v1, bez Wikipedie, Mudrlant', tz: 'Europe/Prague', now: noon(1, 9), wiki: false, data: 'v1', server: 'old',
        storage: { ...settings('all', ['vlajky', 'geologie']), 'mudrlant.variant': 'typed' } },
    { id: 'E', label: 'host, Praha, stará databáze, data v2 (nasazení během dne)', tz: 'Europe/Prague', now: noon(1, 20), wiki: true, data: 'v2', server: 'old', mayDiffer: true,
        storage: { ...settings('known', ['zemepis']), 'mudrlant.variant': 'choices' } }
];

const BASE = { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.account': JSON.stringify('host'), 'mudrlant.quizSkipIntro': '1', 'mudrlant.chain': JSON.stringify({ intro: true }) };
const describe = (data) => (data ? { topic: data.topic, id: data.id, title: data.question && data.question.title, choices: ((data.question && data.question.choices) || []).map(choice => choice.label || choice.id) } : null);

const playAs = async (browser, origin, player) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: player.tz });
    await context.addCookies([{ name: 'datav', value: player.data, url: origin }]);
    await routeExternal(context, player);
    await context.addInitScript(entries => {
        if (localStorage.getItem('audit-set')) return;
        localStorage.setItem('audit-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, { ...BASE, ...player.storage });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: player.now });
    await page.clock.resume();
    await page.goto(`${origin}/`);
    await page.waitForSelector('[data-action="quiz-open"]', { timeout: 60000 });
    await page.waitForTimeout(2500); // předem stažené zamrzlé otázky
    const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.session') || 'null'));
    const tap = (action, extra = '') => page.evaluate(([a, x]) => {
        const button = document.createElement('button');
        button.dataset.action = a;
        if (x) button.dataset.topic = x;
        button.className = 'hidden';
        document.body.appendChild(button);
        button.click();
        button.remove();
    }, [action, extra]);
    const home = async () => {
        await page.keyboard.press('Escape').catch(() => {});
        if (await page.isVisible('#btn-home')) await page.click('#btn-home'); else await tap('quiz-home');
        await page.waitForSelector('[data-action="quiz-open"]', { timeout: 30000 }).catch(async (error) => {
            await page.screenshot({ path: `${process.env.AUDIT_SHOTS || '/tmp'}/audit-${player.id}.png` }).catch(() => {});
            throw error;
        });
    };
    const out = { day: await page.evaluate(() => window.MudrlantCore ? window.MudrlantCore.getDayKey() : null), modes: {} };
    if (MODES.includes('quiz')) {
        const questions = [];
        await page.click('[data-action="quiz-open"]');
        for (let i = 0; i < QUIZ_COUNT; i++) {
            await page.waitForSelector('[data-action="choice"]', { timeout: 60000 });
            const data = (await session()).data;
            questions.push(describe(data));
            if (data) askedIds.add(data.id);
            await page.click('[data-action="choice"]');
            if (i < QUIZ_COUNT - 1) { await page.waitForSelector('[data-action="next"]', { timeout: 30000 }); await page.click('[data-action="next"]'); }
        }
        out.modes.quiz = questions;
        await home();
    }
    if (MODES.includes('daily')) {
        const topics = DAILY_TOPICS || await page.evaluate(() => [...document.querySelectorAll('script[src^="topics/"]')].map(s => s.getAttribute('src').replace(/^topics\/|\.js$/g, '')));
        const asked = {};
        for (const topic of topics) {
            // Okno Dnešní otázky na úvodu a v něm téma (jako hráč)
            await home();
            await page.click('[data-action="daily-sheet"]');
            await page.click(`#daily-sheet [data-action="daily"][data-topic="${topic}"]`);
            await page.waitForFunction((t) => { const s = JSON.parse(localStorage.getItem('mudrlant.session') || 'null'); return s && s.mode === 'daily' && s.data && s.data.topic === t && document.querySelector('[data-action="choice"], input'); }, topic, { timeout: 60000 });
            const data = (await session()).data;
            asked[topic] = describe(data);
            if (data) askedIds.add(data.id);
        }
        out.modes.daily = asked;
        await home();
    }
    if (MODES.includes('chain')) {
        await page.evaluate(() => { const b = document.querySelector('[data-action="chain-open"]'); if (b) b.click(); });
        await page.waitForSelector('[data-action="chain-choice"]', { timeout: 120000 });
        const chain = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mudrlant.chain') || 'null'); return s && s.cache ? s.cache.chain : null; });
        out.modes.chain = chain ? { start: chain.start.name, links: chain.questions.map(q => ({ to: q.to.name, text: q.text, options: q.options.map(o => o.name) })) } : null;
        await home();
    }
    if (MODES.includes('mystery')) {
        await page.evaluate(() => { const b = document.querySelector('[data-action="mystery-open"]'); if (b) b.click(); });
        await page.waitForSelector('[data-mystery-clue]', { timeout: 60000 });
        const round = await page.evaluate((day) => { const s = JSON.parse(localStorage.getItem('mudrlant.mystery') || 'null'); return s && s.rounds ? s.rounds[Object.keys(s.rounds).find(d => d === day) || Object.keys(s.rounds).pop()] : null; }, out.day);
        out.modes.mystery = round ? { ...describe(round), riddle: round.riddle ? JSON.stringify(round.riddle).length : 0 } : null;
        await home();
    }
    if (MODES.includes('boss')) {
        await page.evaluate(() => { const b = document.querySelector('[data-action="boss-open"]'); if (b) b.click(); });
        await page.waitForSelector('[data-action="boss-start"]', { timeout: 60000 });
        await page.click('[data-action="boss-start"]');
        const asked = [];
        for (let slot = 0; slot < BOSS_COUNT; slot++) {
            await page.waitForFunction((n) => { const s = JSON.parse(localStorage.getItem('mudrlant.boss') || 'null'); return s && s.open && s.open.shown && s.open.shown.slot === n; }, slot, { timeout: 60000 })
                .catch(async (error) => { await page.screenshot({ path: `${process.env.AUDIT_SHOTS || '/tmp'}/audit-boss-${player.id}.png` }).catch(() => {}); throw error; });
            const shown = await page.evaluate(() => JSON.parse(localStorage.getItem('mudrlant.boss')).open.shown.data);
            asked.push(describe(shown));
            // Správná odpověď (ať souboj pokračuje); u psané otázky se napíše
            const correct = shown.question.choices.findIndex(choice => choice.correct);
            const typed = await page.$('[data-boss-answers] input');
            if (typed) { await typed.fill(shown.question.answerLabel); await page.keyboard.press('Enter'); } else await page.click(`[data-action="boss-choice"][data-index="${correct}"]`);
            // Další otázka jde až 0,4 s po odpovědi (podle hodin stránky): klepe se, dokud se neukáže
            if (slot < BOSS_COUNT - 1) {
                await page.waitForSelector('[data-action="boss-next"]', { timeout: 30000 });
                for (let i = 0; i < 40 && await page.isVisible('[data-action="boss-next"]'); i++) {
                    await page.waitForTimeout(500);
                    await page.click('[data-action="boss-next"]', { timeout: 2000 }).catch(() => {});
                }
            }
        }
        out.modes.boss = asked;
    }
    out.errors = errors;
    await context.close();
    return out;
};

const { server, origin } = await startServer();
const browser = await chromium.launch();
const results = {};
for (const player of PLAYERS) {
    const started = Date.now();
    results[player.id] = await playAs(browser, origin, player).catch(error => ({ error: error.message }));
    console.error(`${player.id} (${player.label}): ${((Date.now() - started) / 1000).toFixed(0)} s${results[player.id].error ? ` CHYBA ${results[player.id].error}` : ''}`);
}
await browser.close();
server.close();

// --- Porovnání s hráčem A ---
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const rows = [];
for (const mode of MODES) {
    for (const player of PLAYERS.slice(1)) {
        const mine = results[player.id].modes ? results[player.id].modes[mode] : undefined;
        const ref = results.A.modes ? results.A.modes[mode] : undefined;
        const equal = same(mine, ref) && mine !== undefined;
        // Boss týdne před 23. 11. 2026 ještě měnil možnosti podle Wikipedie (týden už se hrál): hráč bez serveru a bez Wikipedie se smí lišit
        const legacyBoss = mode === 'boss' && DAY < '2026-11-23' && player.server === 'old' && !player.wiki;
        const mayDiffer = player.mayDiffer || legacyBoss;
        if (!equal && !mayDiffer) bad += 1;
        rows.push(`| ${mode} | ${player.id} | ${equal ? 'stejné' : player.mayDiffer ? 'liší se (očekávané: stará databáze + nová data)' : legacyBoss ? 'liší se (očekávané: týden před 23. 11., stará databáze a bez Wikipedie)' : '**LIŠÍ SE**'} |`);
        if (!equal && !mayDiffer) console.error(`${mode} ${player.id}:\n  A: ${String(JSON.stringify(ref)).slice(0, 600)}\n  ${player.id}: ${String(JSON.stringify(mine)).slice(0, 600)}`);
    }
}
console.log(`Den ${DAY}; den v aplikaci podle hráčů: ${PLAYERS.map(p => `${p.id} ${results[p.id].day}`).join(', ')}`);
console.log(PLAYERS.map(p => `- ${p.id}: ${p.label}`).join('\n'));
console.log('\n| Mód | Hráč | Proti A |\n|---|---|---|');
console.log(rows.join('\n'));
const errors = PLAYERS.flatMap(p => (results[p.id].errors || []).map(e => `${p.id}: ${e}`));
if (errors.length) console.log(`\nChyby stránky:\n${errors.join('\n')}`);
if (args.out) fs.writeFileSync(args.out, JSON.stringify(results, null, 1));
process.exitCode = bad ? 1 : 0;
