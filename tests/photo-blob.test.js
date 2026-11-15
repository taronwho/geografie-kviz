// Fotky bez prozrazení odpovědi (photo-blob.js): stažení přes fetch a adresa blob:, záložní obyčejné načtení, uvolnění blobů,
// zapojení do stránky (skript, service worker, nasazení, CSP) a HTML otázky Dobývání bez adresy z Commons. Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PhotoBlob = require('../photo-blob.js');
const Source = require('../photo-source.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const THUMB = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/960px-Tour_Eiffel_Wikimedia_Commons.jpg';
const OTHER = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Flag_of_France.svg/500px-Flag_of_France.svg.png';

// Podvržený prohlížeč: fetch podle adresy (funkce vrací odpověď nebo vyhodí), bloby jako blob:N, decode podle tabulky
const fakeBrowser = ({ respond = () => ({ ok: true }), decodeFails = new Set(), sizes = { width: 640, height: 480 } } = {}) => {
    const calls = { fetch: [], decode: [], created: [], revoked: [] };
    let next = 0;
    const loader = PhotoBlob.createLoader({
        fetchImpl: async (url, init) => {
            calls.fetch.push({ url, init });
            const answer = await respond(url);
            return { ok: answer.ok !== false, status: answer.status || 200, blob: async () => ({ from: url }) };
        },
        createUrl: (blob) => { const src = `blob:https://geo.test/${++next}`; calls.created.push({ src, from: blob.from }); return src; },
        revokeUrl: (src) => calls.revoked.push(src),
        decode: async (src) => {
            calls.decode.push(src);
            if (decodeFails.has(src) || [...decodeFails].some(pattern => pattern instanceof RegExp && pattern.test(src))) throw new Error('nenačteno');
            return sizes;
        }
    });
    return { loader, calls };
};
const element = (connected = true) => ({ isConnected: connected });

test('photo-blob: fotka se stáhne přes fetch (CORS, bez cookies) a ukáže jako blob: bez názvu souboru', async () => {
    const { loader, calls } = fakeBrowser();
    const shown = await loader.load(THUMB);
    assert.equal(shown.hidden, true);
    assert.match(shown.src, /^blob:/);
    assert.doesNotMatch(shown.src, /Eiffel|wikimedia/i, 'adresa blobu neprozradí název souboru');
    assert.equal(shown.url, THUMB, 'původní adresa zůstane pro zdroj obrázku a ukládání otázky');
    assert.deepEqual([shown.width, shown.height], [640, 480]);
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.fetch[0].init.mode, 'cors');
    assert.equal(calls.fetch[0].init.credentials, 'omit');
    assert.deepEqual(calls.decode, [shown.src], 'ověří se načtením blobu, ne původní adresy');
    // Stejná adresa podruhé (otevřená nápověda po ověření, výsledek): žádné další stažení, stejný blob
    const again = await loader.attach(THUMB, element());
    assert.equal(again.src, shown.src);
    assert.equal(calls.fetch.length, 1);
    assert.equal(loader.resultFor(THUMB).src, shown.src);
    assert.equal(loader.resultFor(OTHER), null);
    assert.equal(PhotoBlob.isBlob(shown.src), true);
    assert.equal(PhotoBlob.isBlob(THUMB), false);
    assert.equal(await loader.load(''), null);
    assert.equal(await loader.attach(null, element()), null);
});

test('photo-blob: když fetch nejde (CORS, stará CSP, síť), fotka se načte obyčejně – raději fotka než nic', async () => {
    const { loader, calls } = fakeBrowser({ respond: () => { throw new TypeError('Failed to fetch'); } });
    const shown = await loader.load(THUMB);
    assert.deepEqual(shown, { src: THUMB, url: THUMB, width: 640, height: 480, hidden: false });
    assert.deepEqual(calls.decode, [THUMB]);
    assert.deepEqual(calls.created, []);
    // Prohlížeč bez fetch nebo URL.createObjectURL: rovnou obyčejně
    const decoded = [];
    const old = PhotoBlob.createLoader({ decode: async (src) => { decoded.push(src); return { width: 1, height: 2 }; } });
    assert.deepEqual(await old.load(THUMB), { src: THUMB, url: THUMB, width: 1, height: 2, hidden: false });
    assert.deepEqual(decoded, [THUMB]);
    // Obyčejné načtení také selže: null
    const offline = fakeBrowser({ respond: () => { throw new TypeError('offline'); }, decodeFails: new Set([THUMB]) });
    assert.equal(await offline.loader.load(THUMB), null);
});

test('photo-blob: chyba serveru (404, 429) obyčejné načtení nezkouší; nepovedené načtení se příště zkusí znovu', async () => {
    let status = 404;
    const { loader, calls } = fakeBrowser({ respond: () => (status === 200 ? { ok: true } : { ok: false, status }) });
    assert.equal(await loader.load(THUMB), null);
    assert.deepEqual(calls.decode, [], 'obrázek, který server nemá, se znovu nestahuje');
    status = 200;
    const shown = await loader.load(THUMB);
    assert.equal(shown.hidden, true);
    assert.equal(calls.fetch.length, 2);
});

test('photo-blob: blob, který se nedá načíst jako obrázek, se uvolní a zkusí se obyčejné načtení', async () => {
    const { loader, calls } = fakeBrowser({ decodeFails: new Set([/^blob:/]) });
    const shown = await loader.load(THUMB);
    assert.equal(shown.hidden, false);
    assert.equal(shown.src, THUMB);
    assert.deepEqual(calls.revoked, [calls.created[0].src]);
});

test('photo-blob: dlouhé stažení skončí po timeoutu (fotka se bere jako nenačtená) a fetch se přeruší', async () => {
    const timers = [];
    let signal = null;
    const loader = PhotoBlob.createLoader({
        fetchImpl: (url, init) => { signal = init.signal; return new Promise(() => {}); },
        createUrl: () => 'blob:x', revokeUrl: () => {}, decode: async () => ({ width: 1, height: 1 }),
        timeout: 1000, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}
    });
    const pending = loader.load(THUMB);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 1000);
    timers[0].fn();
    assert.equal(await pending, null);
    if (signal) assert.equal(signal.aborted, true);
});

test('photo-blob: blob se uvolní, když ho už nic na stránce neukazuje; ukázaný a podržený zůstane', async () => {
    const { loader, calls } = fakeBrowser();
    const first = element();
    const shown = await loader.attach(THUMB, first);
    // Další otázka: první prvek zmizel, ukazuje se jiná fotka → první blob se uvolní
    first.isConnected = false;
    await loader.attach(OTHER, element());
    assert.deepEqual(calls.revoked, [shown.src]);
    assert.equal(loader.resultFor(THUMB), null, 'uvolněný blob se znovu nepoužije');
    // Fotka, kterou ukazuje prvek na stránce (a zvětšení přes hold), zůstane
    const { loader: second, calls: secondCalls } = fakeBrowser();
    const kept = element();
    const keptShown = await second.attach(THUMB, kept);
    const zoom = element();
    assert.equal(second.hold(keptShown.src, zoom), true);
    assert.equal(second.hold('blob:neznamy', element()), false);
    kept.isConnected = false;
    await second.attach(OTHER, element());
    assert.deepEqual(secondCalls.revoked, [], 'zvětšená fotka je pořád vidět');
    zoom.isConnected = false;
    second.sweep();
    assert.deepEqual(secondCalls.revoked, [keptShown.src]);
    // Překreslení stejné otázky: nový prvek se stejnou adresou dostane stejný blob (starý prvek už není na stránce)
    const { loader: third, calls: thirdCalls } = fakeBrowser();
    const before = element();
    const one = await third.attach(THUMB, before);
    before.isConnected = false;
    const two = await third.attach(THUMB, element());
    assert.equal(two.src, one.src);
    assert.deepEqual(thirdCalls.revoked, []);
    assert.equal(thirdCalls.fetch.length, 1);
});

test('photo-blob: nepoužité bloby (ověřené fotky neotevřených nápověd) zůstávají nejvýš KEEP, starší se uvolní', async () => {
    const { loader, calls } = fakeBrowser();
    const urls = Array.from({ length: PhotoBlob.KEEP + 3 }, (_, i) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foto_${i}.jpg/960px-Foto_${i}.jpg`);
    const results = [];
    for (const url of urls) results.push(await loader.load(url));
    loader.sweep();
    assert.equal(loader.size(), PhotoBlob.KEEP);
    assert.deepEqual(calls.revoked, results.slice(0, 3).map(result => result.src), 'uvolní se nejstarší');
    // Rozpracované stažení se při úklidu neruší
    let release;
    const slow = PhotoBlob.createLoader({ fetchImpl: () => new Promise(resolve => { release = resolve; }), createUrl: () => 'blob:slow', revokeUrl: () => { throw new Error('nesmí'); },
        decode: async () => ({ width: 1, height: 1 }), keep: 0 });
    const waiting = slow.load(THUMB);
    slow.sweep();
    await new Promise(resolve => setImmediate(resolve));
    release({ ok: true, blob: async () => ({}) });
    assert.equal((await waiting).src, 'blob:slow');
});

test('photo-source: adresa u tlačítka „i“ je jen v paměti, ne v atributu', () => {
    const attributes = { 'data-url': THUMB };
    const button = { dataset: { url: THUMB }, removeAttribute: (name) => { delete attributes[name]; } };
    assert.equal(Source.urlOf(button), THUMB, 'starší zápis v atributu se ještě přečte');
    Source.setUrl(button, OTHER);
    assert.equal(Source.urlOf({ dataset: {} }), '');
    assert.deepEqual(attributes, {}, 'atribut data-url zmizí');
    button.dataset = {};
    assert.equal(Source.urlOf(button), OTHER);
    assert.equal(Source.urlOf(null), '');
    assert.doesNotMatch(Source.buttonHtml({ hidden: false }), /data-url/);
});

test('photo-blob: skript je v aplikaci (před visuals.js, app.js a conquest-ui.js), v mezipaměti a v nasazení; CSP povoluje blob: a stažení z Commons', () => {
    const index = read('index.html');
    assert.match(index, /<script src="photo-blob\.js" defer><\/script>/);
    for (const later of ['visuals.js', 'conquest-ui.js', 'app.js']) assert.ok(index.indexOf('photo-blob.js') < index.indexOf(`<script src="${later}"`), later);
    assert.match(read('sw.js'), /'photo-blob\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\sphoto-blob\.js\s/);
    for (const file of ['index.html', '_headers', 'licence.html', 'soukromi.html']) {
        const csp = read(file).match(/Content-Security-Policy"? ?(?:content="|: )([^"\n]+)/)[1];
        assert.match(csp, /img-src 'self' blob: https:\/\/upload\.wikimedia\.org /, file);
        assert.match(csp, /connect-src [^;]*https:\/\/upload\.wikimedia\.org/, file);
        assert.doesNotMatch(csp, /'unsafe-inline'|script-src[^;]*blob:/, `${file}: skripty z blob: ani inline ne`);
    }
    assert.doesNotMatch(read('photo-blob.js'), /innerHTML|style="|<script/, 'bez vkládání HTML a inline stylů');
});

test('Dobývání: HTML otázky s vlajkami a obrázkem nenese adresu z Commons (název souboru = odpověď), jen hotový blob', () => {
    const C = require('../conquest.js');
    const question = {
        kind: 'flag', prompt: 'Kterou vlajku má Srbsko?', images: true, difficulty: 1,
        choices: ['Serbia', 'Croatia', 'Slovakia', 'Slovenia'].map((name, i) => ({ label: name, correct: i === 0, image: `https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Flag_of_${name}.svg/250px-Flag_of_${name}.svg.png`, fallback: `https://upload.wikimedia.org/wikipedia/commons/f/ff/Flag_of_${name}.svg` }))
    };
    const html = C.questionHtml(question, { title: 'Útok', item: { n: 'Srbsko' }, data: {} });
    assert.doesNotMatch(html, /wikimedia|Flag_of|data-fallback/, 'ani náhled, ani záloha');
    assert.equal((html.match(/<img data-cq-img="[0-3]" alt="" class="[^"]* invisible"/g) || []).length, 4, 'obrázky čekají na blob neviditelné');
    const ready = C.questionHtml(question, { title: 'Útok', item: { n: 'Srbsko' }, data: {}, photos: { 0: 'blob:https://geo.test/1', 1: THUMB } });
    assert.match(ready, /<img data-cq-img="0" src="blob:https:\/\/geo\.test\/1"/);
    assert.doesNotMatch(ready, /wikimedia/, 'jiná adresa než blob se do HTML nedostane');
    const photo = { kind: 'item', form: 'photo', prompt: 'Co je na obrázku?', difficulty: 2, content: { image: THUMB }, choices: ['A', 'B', 'C', 'D'].map((label, i) => ({ label, correct: i === 0 })) };
    assert.equal(C.isFullQuestion(photo), true);
    const full = C.questionHtml(photo, { title: 'Útok', item: { n: 'Francie' }, data: {} });
    assert.doesNotMatch(full, /wikimedia|Eiffel/);
    assert.match(full, /<img data-cq-img="content" alt="Obrázek k otázce"/);
    assert.doesNotMatch(html + full, /\sstyle=|\son[a-z]+=/i);
});
