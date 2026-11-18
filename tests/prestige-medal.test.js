// Medailon prestiže (prestige.js): deset stupňů vzhledu (★1 bronz … ★10 a výš legendární s číslem), kresba v SVG bez stylů (CSP),
// obrázky z ART jen existující, medailon v rohu obrázku hráče (badgeHtml), čištění stupně ze serveru (social.js cleanPrestigeLevel)
// a seznamy hráčů ve schema.sql, které stupeň posílají.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../prestige.js');

const ROOT = path.join(__dirname, '..');

test('stupně medailonu: ★1–★10 vlastní vzhled a název, od ★10 stejný (legendární), bez prestiže nic', () => {
    assert.equal(P.TOP_TIER, 10);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 99, 150, -3, 'x'].map(P.tierOf), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 10, 0, 0]);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(P.tierName),
        ['Bronz', 'Stříbro', 'Zlato', 'Smaragd', 'Ametyst', 'Rubín', 'Safír', 'Obsidián', 'Hvězdná noc', 'Legendární', 'Legendární']);
    assert.equal(P.tierName(0), '');
    assert.deepEqual([1, 2, 5, 10, 11, 12, 99].map(P.newLook), [true, true, true, true, false, false, false]);
    assert.match(P.medalNews(6), /medailon prestiže \(Rubín\)/);
    assert.match(P.medalNews(11), /bude číslo 11/);
});

test('medailon: role img s popiskem, číslo jen od ★10, SVG bez stylů a bez id, každý stupeň jinak', () => {
    assert.equal(P.medalHtml(0), '');
    assert.equal(P.medalHtml(null), '');
    const shapes = new Set();
    for (let n = 1; n <= 12; n++) {
        const html = P.medalHtml(n, 'h-5 w-5');
        assert.match(html, new RegExp(`role="img" aria-label="Prestiž ${n}" title="Prestiž ${n}"`));
        assert.match(html, new RegExp(`data-prestige-tier="${Math.min(n, 10)}"`));
        assert.doesNotMatch(html, /\sstyle=|\sid=|<script|\son[a-z]+=/i, `★${n}: CSP`);
        assert.doesNotMatch(html, /NaN|undefined/);
        assert.equal(/data-prestige-number/.test(html), n >= 10, `★${n}: štítek s číslem`);
        if (n >= 10) assert.match(html, new RegExp(`>${n}</text>`));
        if (n <= 10) shapes.add(html.replace(/data-prestige-[a-z]+="\d+"|Prestiž \d+|>\d+<\/text>/g, ''));
    }
    assert.equal(shapes.size, 10, 'deset různých kreseb');
    assert.match(P.medalHtml(150), /aria-label="Prestiž 99"/, 'nejvýš 99');
});

test('obrázky medailonů: zapojený název v ART má soubor icons/topics/<název>.webp', () => {
    assert.deepEqual(Object.keys(P.ART).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const [tier, name] of Object.entries(P.ART)) {
        if (!name) continue;
        assert.match(name, /^prestiz-\d+$/);
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), `medailon ★${tier}: ${name}.webp`);
        assert.match(P.medalHtml(Number(tier)), new RegExp(`<img src="icons/topics/${name}\\.webp"`));
    }
    // Sova prestiže (č. 373) je připravená v app.js, zapne se názvem obrázku
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const owl = /const PRESTIGE_OWL_ART = (null|'([a-z0-9-]+)');/.exec(app);
    assert.ok(owl, 'konstanta PRESTIGE_OWL_ART');
    if (owl[2]) assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${owl[2]}.webp`)));
});

test('rozsvěcování od ★11 do ★99: oblasti obrázku ★10 v pořadí, 4 stupně síly, na ★99 vše a třpyt; kresba v SVG jen záře', () => {
    assert.deepEqual(P.LIT_REGIONS, ['rays', 'wing-left', 'wing-right', 'rim', 'crown', 'gem']);
    assert.deepEqual([1, 10, 11, 12, 30, 54, 75, 98, 99].map(P.litSteps), [0, 0, 1, 1, 6, 12, 18, 24, 24]);
    assert.deepEqual(P.litLevels(30), [['rays', 4], ['wing-left', 2], ['wing-right', 0], ['rim', 0], ['crown', 0], ['gem', 0]]);
    assert.deepEqual([10, 11, 40, 98, 99].map(P.auraOf), [0, 1, 2, 4, 'max']);
    // Bez obrázku (kresba v SVG, záložní): jen záře celého medailonu
    const art = { ...P.ART };
    try {
        for (const key of Object.keys(P.ART)) P.ART[key] = null;
        assert.match(P.medalHtml(40), /data-prestige-aura="2"[^>]*class="prestige-medal prestige-aura prestige-aura-2 /);
        assert.doesNotMatch(P.medalHtml(40), /prestige-lit/);
        assert.doesNotMatch(P.medalHtml(10), /prestige-aura/);
    } finally { Object.assign(P.ART, art); }
    // S obrázkem ★10: nad ním kopie oříznuté na oblasti (třídy z src/input.css), malý odznáček jen se září
    const saved = P.ART[10];
    P.ART[10] = 'prestiz-10';
    try {
        const big = P.medalHtml(40, 'h-16 w-16');
        assert.equal((big.match(/<img src="icons\/topics\/prestiz-10\.webp"/g) || []).length, 1 + 2, '★40: paprsky a levé křídlo');
        assert.match(big, /prestige-lit prestige-lit-rays prestige-lit-l4"[\s\S]*prestige-lit-wing-left prestige-lit-l4"/);
        assert.match(P.medalHtml(30, 'h-9'), /prestige-aura-1/);
        assert.match(P.medalHtml(30, 'h-9'), /prestige-lit-wing-left prestige-lit-l2"/);
        assert.match(big, /class="prestige-medal prestige-art prestige-aura prestige-aura-2 /);
        assert.equal((P.medalHtml(99).match(/prestige-lit-l4/g) || []).length, 6);
        assert.match(P.medalHtml(99), /prestige-aura-max/);
        assert.doesNotMatch(P.badgeHtml(99, 'h-9 w-9'), /prestige-lit/, 'odznáček u obrázku: jen záře');
        assert.match(P.badgeHtml(99, 'h-9 w-9'), /prestige-aura-max/);
    } finally { P.ART[10] = saved; }
    const css = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
    for (const region of P.LIT_REGIONS) assert.match(css, new RegExp(`\\.prestige-lit-${region} \\{ clip-path: polygon\\(`), region);
    for (let level = 1; level <= 4; level++) assert.match(css, new RegExp(`\\.prestige-lit-l${level} \\{`));
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\n {4}\.prestige-aura-max \{ animation:/);
});

test('medailon v rohu obrázku hráče: jen s prestiží a u obrázků od 20 px', () => {
    assert.equal(P.badgeHtml(0, 'h-9 w-9'), '');
    assert.equal(P.badgeHtml(undefined, 'h-9 w-9'), '', 'starší databáze prestiž nepošle');
    assert.equal(P.badgeHtml(3, 'h-4 w-4 text-[10px]'), '', 'v řádku textu ne');
    assert.equal(P.badgeHtml(3, 'h-[18px] w-[18px]'), '');
    const html = P.badgeHtml(3, 'h-9 w-9 text-lg');
    assert.match(html, /^<span class="prestige-badge" data-prestige-badge="3"><span data-prestige-medal="3"[^>]*class="prestige-medal (?:prestige-art )?relative inline-flex shrink-0 h-full w-full"/);
    assert.notEqual(P.badgeHtml(3, 'h-16 w-16 short:h-14'), '');
    assert.notEqual(P.badgeHtml(3, ''), '', 'neznámá velikost: medailon ano');
    assert.deepEqual(['h-9 w-9', 'h-[18px]', 'h-2.5', 'short:h-7 h-10', 'w-9'].map(P.avatarPx), [36, 18, 10, 40, null]);
    // app.js: avatarHtml dává medailon všem obrázkům hráčů (můj stupeň ze zařízení, cizí ze serveru) a popisek „Prestiž N“
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const avatar = app.slice(app.indexOf('const avatarHtml = '), app.indexOf('// Téma výzvy: „mix“'));
    assert.match(avatar, /const prestige = playerPrestige\(player, isMe\);/);
    assert.match(avatar, /aria-label="Prestiž \$\{prestige\}"/);
    assert.match(avatar, /\$\{badge\}<\/span>`;/);
    assert.match(app, /if \(isMe\) return Prestige\.clean\(readJson\(Prestige\.KEY\)\)\.n;/, 'vlastní prestiž ze zařízení (i na zkoušku)');
});

test('social.js: stupeň prestiže ze serveru na celé číslo 0–99, ve všech řádcích hráčů a v dotazech na profily', () => {
    globalThis.self = globalThis;
    const Social = require('../social.js');
    assert.deepEqual([3, '7', 2.7, -1, 150, null, undefined, '', 'x', {}, NaN].map(Social.cleanPrestigeLevel), [3, 7, 2, 0, 99, 0, 0, 0, 0, 0, 0]);
    const source = fs.readFileSync(path.join(ROOT, 'social.js'), 'utf8');
    const owls = source.match(/owl: cleanOwl\(row\.owl\)[^\n]*/g);
    assert.ok(owls.length >= 8);
    for (const line of owls) assert.match(line, /prestige: cleanPrestigeLevel\(row\.prestige\)/, line);
    assert.match(source, /owl\$\{extras === 2 \? ',prestige' : ''\}/);
    assert.match(fs.readFileSync(path.join(ROOT, 'referral.js'), 'utf8'), /prestige: whole\(row\.prestige, 99\)/);
});

test('schema.sql: každý seznam hráčů s rámečkem a sovou posílá i prestiž; sloupec vzniká před funkcemi', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    const owls = schema.match(/'owl', p\.owl[^)\n]*/g);
    assert.ok(owls.length >= 10);
    for (const part of owls) assert.match(part, /^'owl', p\.owl, 'prestige', p\.prestige/);
    assert.match(schema, /week_games integer, owl text, prestige integer/);
    assert.match(schema, /draws integer, prestige integer/);
    assert.ok(schema.indexOf('add column if not exists prestige smallint') < schema.indexOf('create or replace function public.weekly_leaderboard()'));
});
