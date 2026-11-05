// Sova jako obrázek profilu: zápis a čtení voleb (look-owl.js) a čištění v social.js. Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Look = require('../look.js');
const Owl = require('../look-owl.js');
const Social = require('../social.js');

test('sova jako obrázek profilu: encodeOwl / parseOwl se vrátí na stejnou konfiguraci', () => {
    const prefs = { robe: 'zelena', acc: { head: { id: 'koruna', color: 'modra' }, face: { id: 'bryle', color: 'original' }, neck: { id: 'sala', color: 'ruzova' }, hand: { id: 'lupa', color: 'zelena' } } };
    const text = Owl.encodeOwl(prefs);
    assert.equal(text, 'robe=zelena;neck=sala.ruzova;face=bryle.original;head=koruna.modra;hand=lupa.zelena');
    assert.match(text, /^[a-z0-9=.;-]{1,200}$/);
    assert.deepEqual(Owl.parseOwl(text), prefs);
    assert.equal(Owl.encodeOwl(Owl.parseOwl(text)), text);
    // Bez doplňků a s výchozím oblekem je text pořád neprázdný (jinak by sova nešla odlišit od emoji)
    assert.equal(Owl.encodeOwl({ robe: 'vinova', acc: {} }), 'robe=vinova');
    assert.equal(Owl.encodeOwl(Look.prefs()).startsWith('robe='), true);
    // Libovolný vstup dá platný text
    for (const bad of [null, undefined, 5, 'x', {}, { robe: 'neexistuje', acc: 7 }]) assert.equal(Owl.encodeOwl(bad), 'robe=vinova', String(bad));
});

test('sova jako obrázek profilu: parseOwl zahodí neznámé a špatně umístěné části a nic nespadne', () => {
    assert.deepEqual(Owl.parseOwl('robe=zelena'), { robe: 'zelena', acc: {} });
    assert.deepEqual(Owl.parseOwl('head=koruna'), { robe: 'vinova', acc: { head: { id: 'koruna', color: 'original' } } }, 'barva se doplní');
    assert.deepEqual(Owl.parseOwl('robe=neexistuje;head=koruna.fialova'), { robe: 'vinova', acc: { head: { id: 'koruna', color: 'fialova' } } });
    assert.deepEqual(Owl.parseOwl('face=koruna.modra;neck=sala.neexistuje;hand=;=x;;robe'), { robe: 'vinova', acc: { neck: { id: 'sala', color: 'original' } } }, 'koruna nepatří do obličeje');
    assert.deepEqual(Owl.parseOwl('head=koruna.modra;head=vavrin.zluta'), { robe: 'vinova', acc: { head: { id: 'koruna', color: 'modra' } } }, 'v jednom místě nejvýš jeden');
    for (const bad of ['', 'nesmysl', 'foo=bar', 'robe=<script>', null, undefined, 42, 'x'.repeat(300)]) assert.equal(Owl.parseOwl(bad), null, String(bad));
});

test('sova jako obrázek profilu: owlAvatarHtml kreslí zadanou sovu s data-keep a jen platné vrstvy', () => {
    const html = Owl.owlAvatarHtml('robe=zelena;head=koruna.modra;face=bryle.original;hand=neznamy.cervena');
    assert.match(html, /^<span class="relative inline-flex shrink-0 h-\[88%\]"><img data-keep src="icons\/logo-zelena\.webp" alt="" class="h-full w-auto">/);
    assert.ok(html.includes('src="icons/doplnky/bryle.webp"') && html.includes('src="icons/doplnky/koruna-modra.webp"'));
    assert.ok(!html.includes('neznamy'));
    const layers = html.match(/<img [^>]+>/g).slice(1);
    assert.equal(layers.length, 2);
    assert.ok(layers.every(tag => tag.includes('data-keep') && !tag.includes('data-owl-layer')), 'vrstvy cizí sovy pozorovatel nepřebarví ani nepřepíše');
    assert.match(Owl.owlAvatarHtml('robe=vinova'), /src="icons\/logo\.webp"/);
    assert.match(Owl.owlAvatarHtml(Owl.parseOwl('robe=cerna'), 'h-8'), /icons\/logo-cerna\.webp" alt="" class="h-8"/);
    assert.equal(Owl.owlAvatarHtml('nesmysl'), '');
    assert.equal(Owl.owlAvatarHtml(null), '');
});

test('sova jako obrázek profilu: social.js přijme jen tvarově platný text', () => {
    assert.equal(Social.cleanOwl('robe=zelena;head=koruna.modra'), 'robe=zelena;head=koruna.modra');
    for (const bad of [null, undefined, '', 5, 'Robe=zelena', '<script>', 'a b', 'x'.repeat(201)]) assert.equal(Social.cleanOwl(bad), null, String(bad));
});

test('sova jako obrázek profilu: uložení profilu pošle owl, při 400 (sloupec chybí) zopakuje bez něj', async () => {
    const calls = [];
    const fakeFetch = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        if ('owl' in body) return { ok: false, status: 400, json: async () => ({ message: 'column owl does not exist' }), text: async () => '' };
        return { ok: true, status: 200, json: async () => ({}), text: async () => JSON.stringify([{ id: 'u', ...body }]) };
    };
    // social.js čte prostředí z kořene (self); v testu je to falešné okno s přihlášením a falešným fetch
    const sandbox = { self: { MUDRLANT_CONFIG: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' }, MudrlantAuth: { accessToken: async () => 'tok' } }, fetch: fakeFetch, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'social.js'), 'utf8'), sandbox);
    const Fresh = sandbox.self.MudrlantSocial;
    const row = await Fresh.saveProfile('u', { name: 'Jana', avatar: '🐼', color: 'sky', owl: 'robe=zelena;head=koruna.modra' });
    assert.deepEqual(calls.map(call => 'owl' in call), [true, false], 'po 400 se zkusí bez sloupce owl');
    assert.equal(calls[0].avatar, '🦉', 'avatar zůstane jako záloha');
    assert.equal(calls[0].owl, 'robe=zelena;head=koruna.modra');
    assert.equal(row.owl, undefined);
    // Příště se o sloupec už nežádá
    await Fresh.saveProfile('u', { name: 'Jana', avatar: '🐼', color: 'sky', owl: 'robe=zelena' });
    assert.equal('owl' in calls[2], false);
    assert.equal(await Fresh.saveOwl('u', 'robe=zelena'), false);
});
