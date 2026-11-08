// Sdílení (share-card.js): jedno sdílení textu pro celou aplikaci (systémové sdílení, jinak schránka s hláškou), rozložení obrázku
// (sova v barvě obleku, mřížka, adresa), názvy souborů a sdílení obrázku jako souboru nebo stažení. Kreslení plátna hlídá tests/e2e-daily-quiz.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Modul čte navigator až při volání: pro každý test vlastní falešné prostředí
const load = (env) => {
    const saved = {};
    for (const key of Object.keys(env)) { saved[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value: env[key], configurable: true, writable: true }); }
    delete require.cache[require.resolve('../share-card.js')];
    const api = require('../share-card.js');
    return { api, restore: () => { for (const key of Object.keys(env)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]; } } };
};

test('text: systémové sdílení, zavření bez chyby, jinak schránka s hláškou', async () => {
    const calls = [];
    const toasts = [];
    const nav = { share: async (data) => { calls.push(data); }, clipboard: { writeText: async (text) => { calls.push({ copied: text }); } } };
    let { api, restore } = load({ navigator: nav });
    assert.equal(await api.shareText({ title: 'Výzva', text: 'Ahoj', url: 'https://x.test/' }, { toast: t => toasts.push(t) }), 'shared');
    assert.deepEqual(calls.pop(), { title: 'Výzva', text: 'Ahoj', url: 'https://x.test/' });
    nav.share = async () => { const error = new Error('zrušeno'); error.name = 'AbortError'; throw error; };
    assert.equal(await api.shareText({ text: 'Ahoj' }, { toast: t => toasts.push(t) }), 'aborted');
    assert.deepEqual(toasts, [], 'zavřené sdílení nic nehlásí');
    // Sdílení odmítnuté jinak: schránka (text + adresa na dalším řádku)
    nav.share = async () => { throw new Error('NotAllowedError'); };
    assert.equal(await api.shareText({ text: 'Ahoj', url: 'https://x.test/' }, { toast: t => toasts.push(t), copied: 'Zkopírováno' }), 'copied');
    assert.deepEqual(calls.pop(), { copied: 'Ahoj\nhttps://x.test/' });
    assert.deepEqual(toasts, ['Zkopírováno']);
    restore();
    // Bez navigator.share rovnou schránka; bez schránky hláška o chybě
    ({ api, restore } = load({ navigator: { clipboard: { writeText: async () => { throw new Error('ne'); } } } }));
    assert.equal(await api.shareText({ text: 'Ahoj' }, { toast: t => toasts.push(t), failed: 'Nešlo to' }), 'failed');
    assert.equal(toasts.pop(), 'Nešlo to');
    restore();
});

test('obrázek: sova a logo v barvě obleku (vlastní původ), mřížka, datum, adresa a název souboru', () => {
    const { api, restore } = load({});
    assert.equal(api.owlSrc('oslava', 'zelena'), 'icons/topics/sova-oslava-zelena.webp');
    assert.equal(api.owlSrc('vitez', 'vinova'), 'icons/topics/sova-vitez.webp', 'vínový talár je základní obrázek');
    assert.equal(api.owlSrc('neznama', 'cosi'), 'icons/topics/sova-radost.webp');
    assert.equal(api.logoSrc('zlata'), 'icons/logo-zlata.webp');
    assert.equal(api.logoSrc(undefined), 'icons/logo.webp');
    for (const robe of api.ROBES) for (const pose of api.POSES) assert.ok(fs.existsSync(path.join(__dirname, '..', api.owlSrc(pose, robe))), `${pose} ${robe} existuje`);
    for (const robe of api.ROBES) assert.ok(fs.existsSync(path.join(__dirname, '..', api.logoSrc(robe))));
    assert.equal(api.shortUrl('https://taronwho.github.io/geografie-kviz/app/'), 'taronwho.github.io/geografie-kviz/app');
    assert.equal(api.shortUrl('https://x.test/index.html?vyzva=ABC#a'), 'x.test');
    const model = api.cardModel({ kicker: 'Kvíz dne', headline: '8/10', detail: '26 bodů', grid: [true, false, null], day: '2026-11-08', robe: 'modra', pose: 'radost', url: 'https://x.test/app/' });
    assert.equal(model.kicker, 'KVÍZ DNE');
    assert.equal(model.date, '8. 11. 2026');
    assert.deepEqual(model.grid, ['right', 'wrong', 'empty']);
    assert.equal(model.owl, 'icons/topics/sova-radost-modra.webp');
    assert.equal(model.footer, 'Zahraj si taky: x.test/app');
    // Mřížka se vejde do šířky: 10 v řadě, 15 (výzva) ve dvou řadách
    assert.deepEqual([api.gridLayout(10).rows, api.gridLayout(10).width <= 936], [1, true]);
    assert.deepEqual([api.gridLayout(15).rows, api.gridLayout(15).perRow, api.gridLayout(15).width <= 936], [2, 8, true]);
    assert.equal(api.gridLayout(0), null);
    assert.equal(api.cardModel({ headline: 'Správně!' }).grid, null);
    assert.equal(api.fileName('kviz-dne', '2026-11-08'), 'mudrlant-kviz-dne-2026-11-08.png');
    assert.equal(api.fileName('../zlé jméno', ''), 'mudrlant-zljmno.png');
    restore();
});

test('obrázek: soubor přes systémové sdílení, když ho prohlížeč umí; jinak stažení s hláškou', async () => {
    const shared = [];
    const clicks = [];
    const toasts = [];
    // Falešné plátno a DOM: render vrátí plátno, toBlob dá PNG
    const canvas = { width: 0, height: 0, dataset: {}, getContext: () => new Proxy({}, { get: (target, key) => (key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true }), toBlob: (done) => done({ size: 1234, type: 'image/png' }) };
    class FakeImage { set src(value) { this.width = 100; this.height = 100; setTimeout(() => this.onload(), 0); } }
    class FakeFile { constructor(parts, name, options) { this.name = name; this.type = options.type; this.size = parts[0].size; } }
    const env = {
        Image: FakeImage, File: FakeFile,
        document: { createElement: (tag) => (tag === 'canvas' ? canvas : { click() { clicks.push(this.download); }, remove() {} }), body: { appendChild() {} }, documentElement: {} },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
        navigator: { canShare: (data) => Boolean(data.files), share: async (data) => { shared.push(data); } }
    };
    const { api, restore } = load(env);
    const input = { kicker: 'Kvíz dne', headline: '8/10', grid: [true], day: '2026-11-08', robe: 'zelena', pose: 'oslava', url: 'https://x.test/' };
    assert.equal(await api.shareImage(input, { name: 'a.png', text: 'Text', toast: t => toasts.push(t) }), 'shared');
    assert.equal(shared[0].files[0].name, 'a.png');
    assert.equal(shared[0].files[0].type, 'image/png');
    assert.equal(shared[0].text, 'Text');
    // Připravený obrázek se sdílí bez nového kreslení (klepnutí hned po zobrazení výsledku)
    const entry = api.prepare(input, 'a.png');
    assert.ok(entry.file, 'obrázek je připravený');
    // Prohlížeč soubory sdílet neumí: stažení
    env.navigator.canShare = () => false;
    assert.equal(await api.shareImage(input, { name: 'b.png', toast: t => toasts.push(t) }), 'downloaded');
    assert.deepEqual(clicks, ['b.png']);
    assert.deepEqual(toasts, ['Obrázek je uložený ve stažených souborech']);
    // Hráč sdílení zavřel: nic se nestahuje
    env.navigator.canShare = () => true;
    env.navigator.share = async () => { const error = new Error('x'); error.name = 'AbortError'; throw error; };
    assert.equal(await api.shareImage(input, { name: 'c.png' }), 'aborted');
    assert.deepEqual(clicks, ['b.png']);
    restore();
});

test('diplom: model listu (název, jméno, barvy a ikona tématu, sova v barvě obleku, datum) a název souboru', () => {
    const { api: ShareCard, restore } = load({});
    restore();
    const model = ShareCard.diplomaModel({ kind: 'diploma', topic: { id: 'zemepis', title: 'Zeměpis', color: 'emerald' }, title: 'Mistr zeměpisu', name: '  Jana  ', day: '2026-11-08', known: 312, robe: 'modra', url: 'https://example.org/app/', appName: 'Mudrlant' });
    assert.equal(model.title, 'Mistr zeměpisu');
    assert.equal(model.name, 'Jana');
    assert.equal(model.date, '8. 11. 2026');
    assert.deepEqual([model.main, model.dark], ShareCard.TOPIC_COLORS.emerald);
    assert.equal(model.icon, 'icons/topics/zemepis.webp');
    assert.equal(model.owl, 'icons/topics/sova-vitez-modra.webp');
    assert.match(model.detail, /312 poznaných položek/);
    assert.equal(model.footer, 'example.org/app');
    assert.equal(ShareCard.diplomaModel({ topic: { id: '../x', color: 'neznama' } }).icon, null, 'cizí id tématu se nenačte');
    assert.equal(ShareCard.diplomaModel({ topic: {} }).name, 'Hráč Mudrlanta');
    assert.equal(ShareCard.fileName('diplom-zemepis', '2026-11-08'), 'mudrlant-diplom-zemepis-2026-11-08.png');
    assert.deepEqual([ShareCard.DIPLOMA.width, ShareCard.DIPLOMA.height], [1080, 1350]);
    // Barvy pro všechna témata
    for (const file of fs.readdirSync(path.join(__dirname, '..', 'topics')).filter(name => name.endsWith('.js'))) {
        const topic = require(path.join(__dirname, '..', 'topics', file));
        assert.ok(ShareCard.TOPIC_COLORS[topic.color], `${topic.id}: barva ${topic.color}`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'topics', `${topic.id}.webp`)), `${topic.id}: ikona`);
    }
});
