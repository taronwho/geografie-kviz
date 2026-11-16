#!/usr/bin/env node
// Měření načítání denních módů: node scripts/measure-denni.mjs [--net=normal,3g] [--modes=quiz,daily,chain,boss,mystery] [--runs=2] [--signed]
// Skutečná aplikace a data z disku přes místní HTTP server (gzip, ETag/304 jako GitHub Pages) s omezením sítě na serveru
// (Fast 3G podle DevTools: 562 ms odezva, 1,44 Mbit/s dolů pro všechny požadavky dohromady), takže se omezí i service worker.
// Wikipedie, Commons a Supabase jsou falešné se zpožděním podle sítě. Měří se „klepnutí → otázka vidět“ (tlačítka možností na obrazovce)
// pro každý mód: studený start (prázdná mezipaměť, první spuštění) a teplý (service worker nainstalovaný, mezipaměť plná, nové načtení stránky).
// U každého měření vypíše i největší položky Resource Timing (co se stahovalo) a značky performance.mark aplikace (mudrlant:*).
// Výstup: tabulka v Markdownu na stdout a JSON do --out=soubor (nepovinné).
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = process.env.MEASURE_ROOT ? path.resolve(process.env.MEASURE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const NETS = (args.net || 'normal,3g').split(',');
const MODES = (args.modes || 'quiz,daily,chain,boss,mystery').split(',');
const RUNS = Number(args.runs || 1);
const SIGNED = args.signed === 'true';
const STARTS = (args.starts || 'cold,warm').split(',');
const PROFILES = {
    normal: { rtt: 40, bytesPerSecond: 0, extRtt: 120 },
    '3g': { rtt: 562, bytesPerSecond: 1.44e6 / 8, extRtt: 700 }
};
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const CSP = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1].replace("connect-src 'self'", "connect-src 'self' https://proj.supabase.co");
const CONFIG = 'window.MUDRLANT_CONFIG = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key" };';
const PHOTO = fs.readFileSync(path.join(ROOT, 'icons', 'topics', 'sova-vitej.webp'));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Server s omezením sítě (jedna společná linka: požadavky se dělí o šířku pásma) ---
const gzCache = new Map();
const fileBody = (file) => {
    const stat = fs.statSync(file);
    const key = `${file}|${stat.mtimeMs}`;
    if (!gzCache.has(key)) {
        const raw = fs.readFileSync(file);
        const gz = /\.(js|json|css|html|svg|webmanifest)$/.test(file) ? zlib.gzipSync(raw, { level: 6 }) : null;
        gzCache.set(key, { raw, gz, etag: `"${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}"` });
    }
    return gzCache.get(key);
};
const startServer = (profile) => {
    let lineFree = 0; // čas, kdy je linka volná (sdílená šířka pásma)
    const send = async (res, status, headers, body) => {
        await sleep(profile.rtt);
        res.writeHead(status, headers);
        if (!body || !body.length || !profile.bytesPerSecond) { res.end(body); return; }
        // Pakety po 16 kB: každý počká, až bude linka volná (sdílená mezi souběžnými odpověďmi)
        for (let offset = 0; offset < body.length; offset += 16384) {
            const chunk = body.subarray(offset, offset + 16384);
            const now = Date.now();
            const start = Math.max(now, lineFree);
            lineFree = start + chunk.length / profile.bytesPerSecond * 1000;
            await sleep(lineFree - now);
            if (!res.write(chunk)) await new Promise(resolve => res.once('drain', resolve));
        }
        res.end();
    };
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/config.js') return send(res, 200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }, Buffer.from(CONFIG));
        if (pathname === '/') pathname = '/index.html';
        const file = path.join(ROOT, pathname);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, {}, Buffer.from(''));
        const { raw, gz, etag } = fileBody(file);
        const headers = { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream', etag, 'cache-control': 'max-age=600' };
        if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
        if (req.headers['if-none-match'] === etag) return send(res, 304, headers, null);
        const zipped = gz && /gzip/.test(req.headers['accept-encoding'] || '');
        if (zipped) headers['content-encoding'] = 'gzip';
        return send(res, 200, headers, zipped ? gz : raw);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
};

// --- Falešné služby ---
const wikiReply = (url) => {
    const title = new URL(url).searchParams.get('titles') || 'Článek';
    const extract = `${title} je známý pojem, o kterém se často píše v knihách i v novinách a ve školních učebnicích. Patří k tomu nejzajímavějšímu ve svém oboru a lidé o něm rádi vyprávějí svým přátelům i dětem. Další věta úvodu přidává podrobnosti o historii, významu a souvislostech s ostatními věcmi téhož druhu.`;
    return { query: { pages: { 1: { title, extract } } } };
};
const snapshots = new Map();
const REQUIRED_SCHEMA = Number(/const REQUIRED_SCHEMA = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'))[1]);
const SNAPSHOT_RPC = /^\/rest\/v1\/rpc\/(question_snapshot_claim|question_snapshots_get|daily_snapshots_get)$/;
const routeExternal = async (context, profile, log) => {
    await context.route(/^https:\/\/(cs\.wikipedia\.org|commons\.wikimedia\.org|upload\.wikimedia\.org|proj\.supabase\.co)\//, async route => {
        const url = new URL(route.request().url());
        const started = Date.now();
        await sleep(profile.extRtt);
        if (url.hostname === 'cs.wikipedia.org') { log.push({ kind: 'wiki', ms: Date.now() - started }); return route.fulfill({ json: wikiReply(url.href) }); }
        if (url.hostname !== 'proj.supabase.co') return route.fulfill({ contentType: 'image/webp', body: PHOTO });
        if (url.pathname.startsWith('/auth/')) return route.fulfill({ json: {} });
        const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname);
        const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
        if (rpc) log.push({ kind: `rpc:${rpc[1]}`, ms: Date.now() - started });
        if (rpc && rpc[1] === 'schema_version') return route.fulfill({ json: REQUIRED_SCHEMA });
        if (rpc && SNAPSHOT_RPC.test(url.pathname)) {
            if (rpc[1] === 'question_snapshot_claim') { if (!snapshots.has(body.seed)) snapshots.set(body.seed, body.data); return route.fulfill({ json: snapshots.get(body.seed) }); }
            return route.fulfill({ json: (body.seeds || []).filter(seed => snapshots.has(seed)).map(seed => ({ seed, data: snapshots.get(seed) })) });
        }
        if (rpc) return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } });
        return route.fulfill({ json: [] });
    });
};

// --- Módy: jak otevřít a co znamená „otázka vidět“ ---
const MODE_STEPS = {
    quiz: { label: 'Kvíz dne', tap: '[data-action="quiz-open"]', next: '[data-action="quiz-start"]', ready: '[data-action="choice"], [data-action="time-choice"]' },
    daily: { label: 'Dnešní otázky', tap: '[data-action="play-daily"]', ready: '[data-action="choice"]' },
    chain: { label: 'Řetězovka', tap: '[data-action="chain-open"]', next: '[data-action="chain-start"]', ready: '[data-action="chain-choice"]' },
    boss: { label: 'Boss týdne', tap: '[data-action="boss-open"]', next: '[data-action="boss-start"]', ready: '[data-boss-answers] button, [data-boss-answers] input' },
    mystery: { label: 'Tajemná otázka', tap: '[data-action="mystery-open"]', ready: '[data-mystery-clue]' }
};
const BASE_STORAGE = { 'mudrlant.tutorial': JSON.stringify({ how: 'done' }), 'mudrlant.tips': JSON.stringify({ off: true }), 'mudrlant.variant': 'choices', 'mudrlant.account': JSON.stringify('host') };
const SIGNED_STORAGE = { 'mudrlant.auth': JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: 4102444800, user: { id: 'u-1', email: 'x@example.com', name: 'Hráč' } }) };

const measure = async (browser, origin, profile, modeId, start) => {
    const steps = MODE_STEPS[modeId];
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce', serviceWorkers: 'allow' });
    const log = [];
    await routeExternal(context, profile, log);
    const storage = { ...BASE_STORAGE, ...(SIGNED ? SIGNED_STORAGE : {}), 'mudrlant.quizSkipIntro': '1', 'mudrlant.chain': JSON.stringify({ intro: true }) };
    await context.addInitScript(() => { try { performance.setResourceTimingBufferSize(10000); } catch (e) {} });
    await context.addInitScript(entries => {
        if (localStorage.getItem('measure-set')) return;
        localStorage.setItem('measure-set', '1');
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
    }, storage);
    const page = await context.newPage();
    // Pevný den (--day=RRRR-MM-DD, poledne v Praze), ať se dá porovnat před a po změně se stejnými otázkami
    if (args.day) await page.clock.setFixedTime(new Date(`${args.day}T12:00:00+01:00`));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (start === 'warm') {
        // První návštěva: service worker se nainstaluje a stáhne celou aplikaci; pak se stránka načte znovu (jako další spuštění)
        await page.goto(`${origin}/`);
        await page.waitForSelector(steps.tap, { timeout: 180000 });
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => new Promise(resolve => {
            const check = () => (navigator.serviceWorker.controller ? resolve() : setTimeout(check, 200));
            check();
        })));
        await page.evaluate(async () => { for (;;) { const keys = await caches.keys(); if (keys.length) { const cache = await caches.open(keys[0]); const n = (await cache.keys()).length; if (n > 200) return; } await new Promise(r => setTimeout(r, 500)); } });
        // Jen data aplikace se smažou (dnešní otázky, Kvíz dne, řetěz…), mezipaměť service workeru zůstane
        await page.evaluate((entries) => { localStorage.clear(); Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v)); localStorage.setItem('measure-set', '1'); }, storage);
        await sleep(500);
    }
    // Pomalejší procesor (telefon): --cpu=4 zpomalí stránku čtyřikrát (Emulation.setCPUThrottlingRate)
    if (Number(args.cpu) > 1) { const session = await context.newCDPSession(page); await session.send('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu) }); }
    const loadStarted = Date.now();
    await page.goto(`${origin}/`);
    await page.waitForSelector(steps.tap, { timeout: 180000 });
    const homeMs = Date.now() - loadStarted;
    // Domovská obrazovka je vidět: chvíli se nechá aplikaci dodělat úvodní věci (jako hráč, který se rozhlíží), pak klepnutí
    await sleep(Number(args.idle || 1500));
    await page.evaluate(() => performance.clearResourceTimings && performance.clearResourceTimings());
    log.length = 0;
    let cdp = null;
    if (args.profile) { cdp = await context.newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    const tapAt = Date.now();
    await page.click(steps.tap);
    if (steps.next) {
        const which = await Promise.race([page.waitForSelector(steps.next, { timeout: 180000 }).then(() => 'next'), page.waitForSelector(steps.ready, { timeout: 180000 }).then(() => 'ready')]);
        if (which === 'next') await page.click(steps.next);
    }
    await page.waitForSelector(steps.ready, { timeout: 180000, state: 'visible' });
    const ms = Date.now() - tapAt;
    if (cdp) {
        // Nejdražší funkce (vlastní čas) v profilu procesoru od klepnutí po otázku
        const { profile } = await cdp.send('Profiler.stop');
        const self = new Map();
        const byId = new Map(profile.nodes.map(node => [node.id, node]));
        const dt = profile.timeDeltas || [];
        (profile.samples || []).forEach((id, i) => { const node = byId.get(id); const f = node.callFrame; const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000); });
        console.error([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `  ${v.toFixed(0)} ms ${k}`).join('\n'));
    }
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name.replace(location.origin, ''), ms: Math.round(entry.duration), start: Math.round(entry.startTime), size: entry.transferSize })));
    const marks = await page.evaluate(() => performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('mudrlant:')).map(entry => ({ name: entry.name, ms: Math.round(entry.duration) })));
    await context.close();
    return { mode: modeId, start, ms, homeMs, resources, marks, external: [...log], errors };
};

const { server, origin } = { server: null, origin: null };
const results = [];
const browser = await chromium.launch();
for (const net of NETS) {
    const profile = PROFILES[net];
    const { server: srv, origin: base } = await startServer(profile);
    for (const start of STARTS) {
        for (const modeId of MODES) {
            for (let run = 0; run < RUNS; run++) {
                snapshots.clear();
                const result = await measure(browser, base, profile, modeId, start).catch(error => ({ mode: modeId, start, ms: null, error: error.message }));
                result.net = net;
                results.push(result);
                const slow = (result.resources || []).filter(entry => entry.ms > Number(args.minres || 150)).sort((a, b) => b.ms - a.ms).slice(0, 6).map(entry => `${entry.name.split('?')[0].slice(0, 60)} ${entry.ms} ms`);
                console.error(`${net} ${start} ${modeId}: ${result.ms} ms${result.error ? ` (${result.error})` : ''} | ${slow.join(', ')} | ${(result.marks || []).map(m => `${m.name}=${m.ms}`).join(' ')} | ext ${(result.external || []).map(e => e.kind).join(',')}${result.errors && result.errors.length ? ` | chyby: ${result.errors.join('; ')}` : ''}`);
            }
        }
    }
    srv.close();
}
await browser.close();
const median = (list) => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
console.log(`| Mód | ${NETS.flatMap(net => STARTS.map(start => `${net} ${start}`)).join(' | ')} |`);
console.log(`|---|${NETS.flatMap(() => STARTS.map(() => '---:')).join('|')}|`);
for (const modeId of MODES) {
    const cells = NETS.flatMap(net => STARTS.map(start => {
        const values = results.filter(r => r.mode === modeId && r.net === net && r.start === start && Number.isFinite(r.ms)).map(r => r.ms);
        const value = median(values);
        return value === null ? '–' : `${(value / 1000).toFixed(1)} s`;
    }));
    console.log(`| ${MODE_STEPS[modeId].label} | ${cells.join(' | ')} |`);
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(results, null, 1));
