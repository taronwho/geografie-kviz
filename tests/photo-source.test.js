// Zdroj obrázku (photo-source.js): název souboru z adresy, očištění HTML metadat Commons, obsah okna před odpovědí a po ní
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Source = require('../photo-source.js');
const Core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const FILE = 'Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg';
const API_REPLY = {
    query: { pages: { '-1': { title: `File:${FILE}`, imageinfo: [{ extmetadata: {
        Artist: { value: '<bdi><a href="https://www.wikidata.org/wiki/Q762" class="extiw">Leonardo da Vinci</a>\n</bdi>&nbsp;(1452&ndash;1519)' },
        LicenseShortName: { value: 'Public domain' },
        LicenseUrl: { value: '//creativecommons.org/publicdomain/mark/1.0/' },
        Credit: { value: '<a href="//commons.wikimedia.org/wiki/C2RMF">C2RMF</a>: Galerie de tableaux en très haute définition' },
        DateTimeOriginal: { value: 'between 1503 and 1519<div style="display: none;">date QS:P571,+1503-00-00T00:00:00Z/9</div>' },
        ImageDescription: { value: '<p><i>Mona Lisa</i> &ndash; portrait of Lisa Gherardini, <b>wife</b> of Francesco del Giocondo.<script>alert(1)</script></p>' },
        ObjectName: { value: 'Mona Lisa' }
    } }] } } }
};
const META = Source.parseMetadata(API_REPLY);

test('photo-source: název souboru z adresy náhledu i původního souboru, jiné adresy ne', () => {
    const name = 'Karlův most v noci.jpg';
    assert.equal(Source.fileFromUrl(Core.commonsPhotoUrl(name, 'ab', 500)), name);
    assert.equal(Source.fileFromUrl(Core.commonsFileUrl(name, 'ab')), name);
    assert.equal(Source.fileFromUrl(Core.commonsPhotoUrl('Lion range.svg', '67', 500)), 'Lion range.svg');
    for (const bad of ['', null, 'https://example.com/a/ab/X.jpg', 'https://gibs.earthdata.nasa.gov/x.jpg', 'icons/logo.webp', 'https://upload.wikimedia.org/wikipedia/en/a/ab/X.jpg']) {
        assert.equal(Source.fileFromUrl(bad), null, String(bad));
    }
    assert.equal(Source.pageUrl(name), 'https://commons.wikimedia.org/wiki/File:Karl%C5%AFv_most_v_noci.jpg');
    const api = new URL(Source.metadataUrl(name));
    assert.equal(api.origin, 'https://commons.wikimedia.org');
    assert.equal(api.searchParams.get('titles'), `File:${name}`);
    assert.equal(api.searchParams.get('iiprop'), 'extmetadata');
    assert.equal(api.searchParams.get('origin'), '*');
});

test('photo-source: HTML na prostý text – bez značek, skrytých dat a skriptů, entity dekódované, mezery sloučené, délka omezená', () => {
    assert.equal(Source.cleanText('<a href="//x">Jan&nbsp;Novák</a>\n\n  <b>ml.</b>'), 'Jan Novák ml.');
    assert.equal(Source.cleanText('1889<span style="display:none">date QS:P571,+1889-00-00T00:00:00Z/9</span>'), '1889');
    assert.equal(Source.cleanText('a<script>alert(1)</script>b<style>p{}</style>c'), 'a b c');
    assert.equal(Source.cleanText('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;x&quot; &#39;y&#39; &#x10D;&#269; &ndash; &bogus;'), '<img src=x onerror=alert(1)> & "x" \'y\' čč – &bogus;');
    assert.equal(Source.cleanText('&amp;lt;b&amp;gt;'), '&lt;b&gt;', 'dekóduje se jen jednou');
    assert.equal(Source.cleanText(null), '');
    const long = Source.cleanText('slovo '.repeat(80), 50);
    assert.ok(long.length <= 50 && long.endsWith('…'), long);
    assert.ok(!/\bslov…$/.test(long), 'krátí se na celé slovo');
});

test('photo-source: metadata z odpovědi API', () => {
    assert.deepEqual(META, {
        artist: 'Leonardo da Vinci (1452–1519)',
        credit: 'C2RMF: Galerie de tableaux en très haute définition',
        date: 'between 1503 and 1519',
        description: 'Mona Lisa – portrait of Lisa Gherardini, wife of Francesco del Giocondo.',
        license: 'Public domain',
        licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/'
    });
    assert.equal(Source.parseMetadata({ query: { pages: { '-1': { missing: '' } } } }), null);
    assert.equal(Source.parseMetadata(null), null);
    const bad = Source.parseMetadata({ query: { pages: { 1: { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'X' }, LicenseUrl: { value: 'javascript:alert(1)' } } }] } } } });
    assert.equal(bad.licenseUrl, '', 'jen odkaz http(s)');
    const objectOnly = Source.parseMetadata({ query: { pages: { 1: { imageinfo: [{ extmetadata: { ObjectName: { value: 'Mona Lisa' } } }] } } } });
    assert.equal(objectOnly.description, 'Mona Lisa', 'bez popisu poslouží název díla');
});

test('photo-source: před odpovědí jen licence a Wikimedia Commons – žádný soubor, autor, popis ani odkaz na soubor', () => {
    for (const status of ['ready', 'loading', 'failed']) {
        const view = Source.buildView({ fileName: FILE, meta: status === 'ready' ? META : null, answered: false, status });
        const html = Source.viewHtml(view);
        assert.equal(view.commonsUrl, '');
        assert.ok(!view.rows.some(row => ['artist', 'description', 'credit', 'date', 'file'].includes(row.key)), status);
        for (const secret of ['Mona', 'Leonardo', 'Vinci', 'Gherardini', 'C2RMF', '1503', 'commons.wikimedia.org/wiki', 'File:']) {
            assert.ok(!html.includes(secret), `${status}: ${secret} je vidět před odpovědí`);
        }
        assert.match(html, /Zdroj<\/dt>.*Wikimedia Commons/);
        assert.match(html, /Autora, název souboru a odkaz uvidíš po odpovědi\./);
        assert.match(html, /href="licence\.html"/);
    }
    const ready = Source.viewHtml(Source.buildView({ fileName: FILE, meta: META, answered: false }));
    assert.match(ready, /Licence<\/dt>.*href="https:\/\/creativecommons\.org\/publicdomain\/mark\/1\.0\/" target="_blank" rel="noopener noreferrer"[^>]*>Public domain/);
    assert.match(Source.viewHtml(Source.buildView({ fileName: FILE, answered: false, status: 'failed' })), /Podrobnosti se teď nepodařilo načíst\./);
});

test('photo-source: po odpovědi autor, datum, popis, licence, soubor a odkaz na Commons', () => {
    const view = Source.buildView({ fileName: FILE, meta: META, answered: true });
    assert.deepEqual(view.rows.map(row => row.key), ['artist', 'date', 'description', 'credit', 'license', 'source', 'file']);
    assert.equal(view.note, '');
    assert.equal(view.error, '');
    const html = Source.viewHtml(view);
    assert.match(html, /Autor<\/dt>.*Leonardo da Vinci \(1452–1519\)/);
    assert.match(html, /Datum<\/dt>.*between 1503 and 1519/);
    assert.match(html, /Popis<\/dt>.*Mona Lisa – portrait/);
    assert.match(html, /Soubor<\/dt>.*Mona Lisa, by Leonardo da Vinci, from C2RMF retouched\.jpg/);
    assert.match(html, /<a data-source-commons href="https:\/\/commons\.wikimedia\.org\/wiki\/File:Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched\.jpg" target="_blank" rel="noopener noreferrer"[^>]*>.*Otevřít na Wikimedia Commons<\/a>/);
    assert.ok(!html.includes('<script'), 'skript z popisu se nevloží');
    assert.ok(!html.includes('uvidíš po odpovědi'));
    // Bez sítě: soubor a odkaz na Commons (nepotřebují síť) a hláška
    const offline = Source.viewHtml(Source.buildView({ fileName: FILE, answered: true, status: 'failed' }));
    assert.match(offline, /Podrobnosti se teď nepodařilo načíst\./);
    assert.match(offline, /Soubor<\/dt>.*Mona Lisa/);
    assert.match(offline, /data-source-commons/);
    assert.ok(!offline.includes('Autor</dt>'));
});

test('photo-source: všechno z metadat se escapuje', () => {
    const evil = { artist: '<img src=x onerror=alert(1)>', credit: '', date: '"><b>', description: '</dd><script>x</script>', license: 'CC "BY"', licenseUrl: 'https://e.example/"onmouseover="x' };
    const html = Source.viewHtml(Source.buildView({ fileName: 'a"<b>.jpg', meta: evil, answered: true }));
    assert.ok(!/<img|<script|<b>|"onmouseover/.test(html), html);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    const parsed = Source.parseMetadata({ query: { pages: { 1: { imageinfo: [{ extmetadata: { LicenseUrl: { value: 'https://e.example/"x' } } }] } } } });
    assert.equal(parsed.licenseUrl, '', 'odkaz s uvozovkou se zahodí');
});

test('photo-source: metadata se načtou jednou, chyba a výpadek sítě vrátí null a příště se zkusí znovu', async () => {
    const calls = [];
    let fail = true;
    const load = Source.createLoader(async (url) => {
        calls.push(url);
        if (fail) throw new Error('offline');
        return { ok: true, json: async () => API_REPLY };
    });
    assert.equal(await load(FILE), null);
    fail = false;
    assert.deepEqual(await load(FILE), META);
    assert.deepEqual(await load(FILE), META);
    assert.equal(calls.length, 2, 'úspěšný výsledek je v paměti');
    assert.equal(await load(''), null);
    const bad = Source.createLoader(async () => ({ ok: false, status: 500 }));
    assert.equal(await bad(FILE), null);
    const slow = Source.createLoader(() => new Promise(() => {}), { timeout: 20 });
    assert.equal(await slow(FILE), null, 'neodpovídající server neblokuje okno');
});

test('photo-source: tlačítko „i“ je malé na pohled a aspoň 44 px na dotyk, skript je v aplikaci, CSP povoluje Commons API', () => {
    const button = Source.buttonHtml();
    assert.match(button, /data-photo-info/);
    assert.match(button, /aria-label="Zdroj obrázku"/);
    assert.match(button, /class="hidden absolute bottom-0 left-0 [^"]*p-2\.5"/);
    assert.match(button, /h-6 w-6[^"]*rounded-full bg-black\/55/);
    assert.match(Source.buttonHtml({ url: 'https://upload.wikimedia.org/a"b', hidden: false }), /data-url="https:\/\/upload\.wikimedia\.org\/a&quot;b" aria-label/);
    const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(read('index.html'), /<script src="photo-source\.js" defer><\/script>/);
    assert.ok(read('index.html').indexOf('photo-source.js') < read('index.html').indexOf('visuals.js'), 'před visuals.js a app.js');
    for (const file of ['index.html', '_headers', 'licence.html', 'soukromi.html']) {
        assert.match(read(file), /connect-src 'self' https:\/\/cs\.wikipedia\.org https:\/\/commons\.wikimedia\.org /, file);
    }
    assert.match(read('tailwind.config.js'), /'\.\/photo-source\.js'/);
});
