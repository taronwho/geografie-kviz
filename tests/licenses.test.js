// Licence obrázků: parsování odpovědí Wikimedia Commons (scripts/build-licenses.mjs), vykreslení seznamu (licence.js)
// a kontrola, že právní stránky nemají inline skripty ani styly (CSP) a odkazují na sebe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const lib = () => import('../scripts/build-licenses.mjs');
const licence = require('../licence.js');

test('licence: normalizeName a stránka souboru', async () => {
    const { normalizeName, toTitle, filePageUrl } = await lib();
    assert.equal(normalizeName('File:flag_of_Cyprus.svg'), 'Flag of Cyprus.svg');
    assert.equal(normalizeName('  Soubor:a__b.jpg '), 'A b.jpg');
    assert.equal(toTitle('x_y.png'), 'File:X y.png');
    assert.equal(filePageUrl('Flag of Cyprus.svg'), 'https://commons.wikimedia.org/wiki/File:Flag_of_Cyprus.svg');
});

test('licence: stripHtml zbaví značek a zkrátí', async () => {
    const { stripHtml } = await lib();
    assert.equal(stripHtml('<a href="x">Jan &amp; Eva</a><br>Novák'), 'Jan & Eva, Novák');
    assert.equal(stripHtml('<script>alert(1)</script>ahoj'), 'alert(1)ahoj');
    assert.ok(stripHtml('x'.repeat(500)).length <= 120);
});

const meta = (fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value }]));
test('licence: flagFor rozpozná nekomerční, bez odvozenin, fair use a chybějící licenci', async () => {
    const { flagFor } = await lib();
    assert.equal(flagFor(meta({ LicenseShortName: 'CC BY-SA 4.0' })), '');
    assert.equal(flagFor(meta({ LicenseShortName: 'CC0' })), '');
    assert.equal(flagFor(meta({ LicenseShortName: 'Public domain', Copyrighted: 'False' })), '');
    assert.equal(flagFor(meta({ Copyrighted: 'False' })), '');
    assert.equal(flagFor(meta({ LicenseShortName: 'CC BY-NC 4.0' })), 'nc');
    assert.equal(flagFor(meta({ LicenseShortName: 'CC BY-ND 2.0' })), 'nd');
    assert.equal(flagFor(meta({ LicenseShortName: 'CC BY-NC-ND 3.0' })), 'nc-nd');
    assert.equal(flagFor(meta({ LicenseShortName: 'Fair use' })), 'fair');
    assert.equal(flagFor(meta({ Copyrighted: 'True' })), 'none');
    assert.equal(flagFor(null), 'none');
});

test('licence: parsePage vezme autora, licenci a odkaz; chybějící soubor je označen', async () => {
    const { parsePage, parseResponse } = await lib();
    const page = {
        title: 'File:Flag of Cyprus.svg',
        imageinfo: [{ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Flag_of_Cyprus.svg', extmetadata: meta({ Artist: '<a href="//x">Autor Test</a>', LicenseShortName: 'CC BY-SA 4.0', LicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0' }) }]
    };
    assert.deepEqual(parsePage(page), { a: 'Autor Test', l: 'CC BY-SA 4.0', u: 'https://creativecommons.org/licenses/by-sa/4.0' });
    assert.deepEqual(parsePage({ title: 'File:Nic.jpg', missing: true }), { flag: 'missing' });
    const parsed = parseResponse({ query: { pages: [page] } }, ['Flag of Cyprus.svg']);
    assert.equal(parsed.get('Flag of Cyprus.svg').l, 'CC BY-SA 4.0');
    // javascript: odkaz na licenci se do dat nedostane
    const evil = parsePage({ title: 'File:E.jpg', imageinfo: [{ extmetadata: meta({ LicenseShortName: 'X', LicenseUrl: 'javascript:alert(1)' }) }] });
    assert.equal(evil.u, undefined);
});

test('licence: data/licenses.json má všechny obrázky z dat a platný tvar', async () => {
    const { collectFiles } = await lib();
    const data = JSON.parse(read('data/licenses.json'));
    const collected = collectFiles();
    assert.deepEqual(data.topics, collected.topics);
    assert.equal(Object.keys(data.files).length, collected.files.size, 'seznam souborů odpovídá datům (spusť node scripts/build-licenses.mjs --offline)');
    for (const [name, entry] of Object.entries(data.files)) {
        assert.ok(Array.isArray(entry.t) && entry.t.length, `${name}: téma`);
        if (entry.u) assert.match(entry.u, /^https?:\/\//, name);
    }
});

test('licence: stránka escapuje názvy a autory a neodkazuje na nebezpečné adresy', () => {
    const html = licence.rowHtml('<img src=x onerror=alert(1)>.jpg', { a: '"><script>x</script>', l: 'CC BY 4.0', u: 'javascript:alert(1)' });
    assert.ok(!/<img|<script/.test(html), html);
    assert.ok(!/href="javascript/.test(html), html);
    const good = licence.rowHtml('A.jpg', { a: 'Jan', l: 'CC BY 4.0', u: 'https://creativecommons.org/licenses/by/4.0', flag: 'nc' });
    assert.match(good, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0"/);
    assert.match(good, /rel="noopener noreferrer"/);
    assert.match(good, /NC|nekomerční/);
    assert.match(good, /commons\.wikimedia\.org\/wiki\/File:A\.jpg/);
});

test('licence: groupByTopic a hledání', () => {
    const data = { topics: ['zemepis', 'vlajky'], files: { 'B.jpg': { a: 'Eva', l: 'CC0', t: [0, 1] }, 'A.jpg': { a: 'Jan', l: 'CC BY 4.0', t: [0] } } };
    const groups = licence.groupByTopic(data);
    assert.deepEqual(groups[0].map(([name]) => name), ['A.jpg', 'B.jpg']);
    assert.deepEqual(groups[1].map(([name]) => name), ['B.jpg']);
    assert.ok(licence.matches('A.jpg', data.files['A.jpg'], 'jan'));
    assert.ok(!licence.matches('A.jpg', data.files['A.jpg'], 'eva'));
    const html = licence.tableHtml(groups[0], 'cc0');
    assert.match(html, /B\.jpg/);
    assert.ok(!/A\.jpg/.test(html));
});

for (const file of ['licence.html', 'soukromi.html']) {
    test(`${file}: bez inline skriptů a stylů (CSP), s CSP a odkazy na sousední stránku`, () => {
        const html = read(file);
        assert.ok(!/\sstyle\s*=/.test(html), 'inline atribut style');
        assert.ok(!/<style[\s>]/.test(html), 'blok style');
        assert.ok(!/\son[a-z]+\s*=/i.test(html), 'inline obsluha události');
        assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), 'inline skript');
        assert.match(html, /Content-Security-Policy/);
        assert.match(html, /style-src 'self'/);
        assert.match(html, /<meta name="viewport"/);
        assert.match(html, file === 'licence.html' ? /href="soukromi\.html/ : /href="licence\.html"/);
    });
}

test('soukromi.html: obsahuje označené údaje k doplnění, popis mazání účtu a co se ukládá', () => {
    const html = read('soukromi.html');
    assert.match(html, /class="doplnit">\[DOPLNIT/);
    assert.match(html, /Smazat účet a data/);
    assert.match(html, /Stáhnout moje data/);
    assert.match(html, /Google/);
    assert.match(html, /Supabase/);
    assert.match(html, /přezdívk/i);
});

test('licence.html: atribuce Wikipedie, Wikidat a Wikimedia Commons s licencemi', () => {
    const html = read('licence.html');
    assert.match(html, /CC BY-SA 4\.0/);
    assert.match(html, /Wikidat/);
    assert.match(html, /Wikimedia Commons/);
    assert.match(html, /cs\.wikipedia\.org/);
});

test('sw.js a nasazení: právní stránky jsou v mezipaměti aplikace i v pages.yml', () => {
    const sw = read('sw.js');
    const pages = read('.github/workflows/pages.yml');
    for (const file of ['soukromi.html', 'licence.html', 'licence.js']) {
        assert.ok(sw.includes(`'${file}'`), `${file} v sw.js`);
        assert.ok(pages.includes(file), `${file} v pages.yml`);
    }
});

test('app: odkazy na zásady a licence v Nastavení i v uvítání, tlačítka Moje data', () => {
    const app = read('app.js');
    assert.ok((app.match(/href="soukromi\.html"/g) || []).length >= 3);
    assert.ok((app.match(/href="licence\.html"/g) || []).length >= 3);
    for (const hook of ['data-export-data', 'data-delete-account', 'data-delete-confirm', 'data-delete-cancel']) assert.ok(app.includes(hook), hook);
    assert.ok(!/sb_secret_|service_role/.test(app + read('social.js') + read('config.js')));
});

test('licence: dávka se posílá metodou POST (dlouhé názvy by v adrese překročily limit) a 4xx odmítnutí se nezkouší dokola', async () => {
    const { fetchBatch } = await lib();
    const seen = [];
    const ok = async (url, options) => { seen.push({ url, method: options.method, body: options.body }); return { ok: true, json: async () => ({ query: { pages: [{ title: 'File:A.jpg', imageinfo: [{ extmetadata: meta({ LicenseShortName: 'CC0' }) }] }] } }) }; };
    const result = await fetchBatch(['A.jpg'], { fetchImpl: ok, log: { warn() {} } });
    assert.equal(seen[0].method, 'POST');
    assert.ok(!seen[0].url.includes('titles='), 'názvy nejsou v adrese');
    assert.match(seen[0].body, /titles=File%3AA\.jpg/);
    assert.equal(result.get('A.jpg').l, 'CC0');
    let calls = 0;
    const bad = async () => { calls++; return { ok: false, status: 414, headers: { get: () => null } }; };
    await assert.rejects(fetchBatch(['A.jpg'], { fetchImpl: bad, log: { warn() {} } }), /414/);
    assert.equal(calls, 1);
});
