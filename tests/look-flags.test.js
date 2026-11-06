// Vlajka státu na vlaječce sovy: seznam států (look-flags.js), uložená volba (look.js), zápis pro profil a vykreslení (look-owl.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Flags = require('../look-flags.js');
const Look = require('../look.js');
const Owl = require('../look-owl.js');
const Core = require('../quiz-core.js');
const Social = require('../social.js');

const tagsOf = (html) => html.match(/<(?:img|span)[^>]*>/g) || [];

test('vlajky států: look-flags.js odpovídá data/vlajky.json (jen vlajky států, česky podle abecedy) a hodnoty jsou tvarově platné', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vlajky.json'), 'utf8'));
    const states = data.items.filter(item => item.c === 'vlajka' && item.n && item.im && item.ih);
    const list = Flags.list();
    assert.equal(list.length, states.length);
    assert.ok(list.length >= 190, 'státy světa');
    for (const flag of list) {
        assert.match(flag.id, /^q\d{1,9}$/);
        const source = states.find(item => item.q.toLowerCase() === flag.id);
        assert.ok(source, flag.id);
        assert.deepEqual([flag.name, flag.file, flag.hash], [source.n, source.im, source.ih]);
    }
    const names = list.map(flag => flag.name);
    assert.deepEqual(names, [...names].sort(new Intl.Collator('cs').compare), 'abecedně česky');
    assert.equal(Flags.find('q127155').name, 'Česko');
    assert.equal(Flags.find('q43175').name, 'Japonsko');
    assert.equal(Flags.find('q82194').name, 'Brazílie');
    for (const bad of ['Q127155', 'q0', 'q', '', null, undefined, 5, 'q1234567890', '__proto__', 'constructor', 'q127155 ']) assert.equal(Flags.has(bad), false, String(bad));
});

test('vlajka státu: v uložené volbě zůstane jen platná (q + číslice, existující stát) a jen u vlaječky', () => {
    const ctx = { level: 100, badges: { 'zbehly-vlajky': '2026-11-05' } };
    const norm = (entry) => Look.normalize({ acc: { hand: entry } }, ctx).acc.hand;
    assert.deepEqual(norm({ id: 'vlajka', color: 'zelena', flag: 'q127155' }), { id: 'vlajka', color: 'zelena', flag: 'q127155' });
    assert.deepEqual(norm({ id: 'vlajka', flag: 'q127155' }), { id: 'vlajka', color: 'original', flag: 'q127155' });
    for (const bad of ['Q127155', 'q1', 'q99999999', 'q1234567890', '127155', 'q127155;head=koruna', '', null, 5, {}, '__proto__']) {
        assert.deepEqual(norm({ id: 'vlajka', color: 'original', flag: bad }), { id: 'vlajka', color: 'original' }, `neplatná vlajka ${JSON.stringify(bad)}`);
    }
    assert.deepEqual(norm({ id: 'lupa', color: 'original', flag: 'q127155' }), { id: 'lupa', color: 'original' }, 'vlajku má jen vlaječka');
    assert.equal(Look.flagOk('q127155'), true);
    assert.equal(Look.flagOk('q1'), false);
    // Bez odznaku vlaječka není odemčená, takže se nenasadí ani s vlajkou
    assert.deepEqual(Look.normalize({ acc: { hand: { id: 'vlajka', flag: 'q127155' } } }, { level: 100, badges: {} }).acc, {});
});

test('vlajka státu: volba se uloží a přečte přes setPref, neplatná se nepřijme', () => {
    const store = {};
    global.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } };
    const ctx = { level: 100, badges: { 'zbehly-vlajky': '2026-11-05' } };
    try {
        assert.equal(Look.setPref('acc', { hand: { id: 'vlajka', color: 'original', flag: 'q43175' } }, ctx), true);
        assert.deepEqual(Look.prefs(ctx).acc.hand, { id: 'vlajka', color: 'original', flag: 'q43175' });
        assert.equal(Look.setPref('acc', { hand: { id: 'vlajka', color: 'original', flag: 'q1' } }, ctx), false, 'neplatná vlajka se neuloží');
        assert.equal(Look.setPref('acc', {}, ctx), true);
    } finally { delete global.localStorage; }
});

test('vlajka státu: vykreslení – plátno, vlajka oříznutá maskou, stínování a tyčka; bez vlajky nebo s neplatnou jen modré plátno', () => {
    const tags = tagsOf(Owl.layersHtml({ hand: { id: 'vlajka', color: 'zelena', flag: 'q127155' } }));
    assert.equal(tags.length, 5, 'plátno, kontejner s maskou, vlajka, stínování, tyčka');
    assert.match(tags[0], /src="icons\/doplnky\/vlajka\.webp"/, 's vlajkou je plátno vždy původní (barva se neuplatní)');
    assert.doesNotMatch(tags[0], /hue-rotate/);
    assert.match(tags[1], /^<span data-owl-layer class="[^"]*\bowl-flag\b/);
    assert.doesNotMatch(Owl.layersHtml({ hand: { id: 'vlajka', color: 'zelena', flag: 'q127155' } }), /<div/, 'žádný <div>: sova bývá v odstavci a div by ho rozbil');
    assert.ok(tags[1].includes('aspect-[402/443]') && tags[1].includes('opacity-0'), 'poměr stran rámu, skrytá do načtení vlajky');
    assert.ok(tags[1].includes('left-[-34%]') && tags[1].includes('top-[-26%]') && tags[1].includes('w-[156%]'), 'stejná poloha a šířka jako vrstva');
    assert.match(tags[2], /data-owl-flag-img src="https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/c\/cb\/Flag_of_the_Czech_Republic\.svg\/120px-Flag_of_the_Czech_Republic\.svg\.png"/);
    assert.match(tags[2], /object-cover/);
    assert.match(tags[2], /left-\[[\d.]+%\] top-\[[\d.]+%\] w-\[[\d.]+%\] h-\[[\d.]+%\]/);
    assert.match(tags[3], /src="icons\/doplnky\/vlajka-stin\.webp"[^>]*mix-blend-multiply/);
    assert.match(tags[4], /src="icons\/doplnky\/vlajka-zaklad\.webp"/);
    assert.ok(tags.every(tag => tag.includes('data-owl-layer')), 'každý prvek patří živé sově (refresh() ho přepíše)');
    // Cizí sova: data-keep místo data-owl-layer
    const foreign = tagsOf(Owl.layersHtml({ hand: { id: 'vlajka', color: 'original', flag: 'q127155' } }, 'data-keep'));
    assert.equal(foreign.length, 5);
    assert.ok(foreign.every(tag => tag.includes('data-keep') && !tag.includes('data-owl-layer')));
    // Bez vlajky a s neplatnou vlajkou beze změny
    for (const flag of [undefined, 'q1', 'Q127155', '"><script>']) {
        const plain = Owl.layersHtml({ hand: { id: 'vlajka', color: 'zelena', flag } });
        assert.equal(tagsOf(plain).length, 2, String(flag));
        assert.match(plain, /vlajka-zelena\.webp.*vlajka-zaklad\.webp/);
        assert.doesNotMatch(plain, /owl-flag|wikimedia/);
    }
    // Vlajku má jen vlaječka
    assert.doesNotMatch(Owl.layersHtml({ hand: { id: 'lupa', color: 'original', flag: 'q127155' } }), /wikimedia|owl-flag/);
    // Adresa miniatury se skládá stejnou funkcí jako fotky v kvízu
    assert.equal(Owl.flagSrc('q43175'), Core.commonsPhotoUrl('Flag of Japan.svg', '9e', 120));
    assert.equal(Owl.flagSrc('q1'), null);
});

test('vlajka státu: rám ve třídách odpovídá obrázkům vlajka-maska.webp a vlajka-stin.webp a třídy ohraničení jsou v Tailwindu', () => {
    const dir = path.join(__dirname, '..', 'icons', 'doplnky');
    // Bezeztrátový WebP (VP8L): za podpisem 0x2f je 14 bitů šířka-1 a 14 bitů výška-1
    const size = (name) => {
        const buffer = fs.readFileSync(path.join(dir, name));
        const at = buffer.indexOf('VP8L');
        assert.ok(at > 0, `${name}: bezeztrátový WebP`);
        const bits = buffer.readUInt32LE(at + 9);
        return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    };
    const [w, h] = size('vlajka-maska.webp');
    assert.deepEqual(size('vlajka-stin.webp'), [w, h], 'maska a stínování mají stejný rám');
    assert.ok(fs.readFileSync(path.join(__dirname, '..', 'look-owl.js'), 'utf8').includes(`aspect-[${w}/${h}]`), `poměr stran rámu ${w}/${h}`);
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    for (const cls of ['owl-flag', 'mix-blend-multiply', 'object-cover', 'owl-flag-img', 'aspect-\\[402\\/443\\]', 'left-\\[10\\.7\\%\\]', 'h-\\[19\\.64\\%\\]']) assert.ok(css.includes(cls), `styles.css: ${cls}`);
    assert.match(css, /\.owl-flag\{[^}]*mask-image:url\(icons\/doplnky\/vlajka-maska\.webp\)/);
    assert.match(css, /\.owl-flag-img\{[^}]*filter:url\(#owl-flag-wave\)/);
    // Filtr vlnění je inline v index.html (CSP style-src 'self' inline <svg> neomezuje) a čte mapu posunutí ze stejného původu
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /<filter id="owl-flag-wave"[^>]*color-interpolation-filters="sRGB"/);
    assert.match(html, /<feImage href="icons\/doplnky\/vlajka-vlna\.webp"/);
    assert.ok(fs.existsSync(path.join(dir, 'vlajka-vlna.webp')));
    assert.doesNotMatch(html, /<[a-z]+[^>]*\sstyle=/i, 'žádné inline styly');
});

test('sova jako profilovka: vlajka státu na vlaječce se zapíše (hand=vlajka.original.q101472), přečte a vykreslí cizí sově', () => {
    const prefs = { robe: 'vinova', acc: { hand: { id: 'vlajka', color: 'original', flag: 'q101472' } } };
    const text = Owl.encodeOwl(prefs);
    assert.equal(text, 'robe=vinova;hand=vlajka.original.q101472');
    assert.match(text, /^[a-z0-9=.;-]{1,200}$/, 'projde omezením sloupce profiles.owl');
    assert.deepEqual(Owl.parseOwl(text), prefs);
    assert.equal(Owl.encodeOwl(Owl.parseOwl(text)), text);
    assert.equal(Social.cleanOwl(text), text);
    // Nejdelší možný zápis (všechna místa, vlastní odstíny) se vejde do 200 znaků
    const full = Owl.encodeOwl({ robe: 'zelena', acc: { head: { id: 'sluchatka', color: 'h355' }, face: { id: 'slunecni-bryle', color: 'h355' }, neck: { id: 'medaile', color: 'h355' }, hand: { id: 'vlajka', color: 'h355', flag: 'q168711' } } });
    assert.ok(full.length < 200 && /hand=vlajka\.h355\.q168711$/.test(full), full);
    assert.deepEqual(Owl.parseOwl(full).acc.hand, { id: 'vlajka', color: 'h355', flag: 'q168711' });
    // Cizí hráč s vlajkou ji uvidí (data-keep, žádné data-owl-layer)
    const html = Owl.owlAvatarHtml(text);
    assert.ok(html.includes('upload.wikimedia.org') && html.includes('Flag_of_Indonesia.svg'));
    const tags = tagsOf(html).slice(1);
    assert.equal(tags.length, 6);
    assert.ok(tags.every(tag => tag.includes('data-keep') && !tag.includes('data-owl-layer')));
    // Starší texty bez vlajky fungují dál
    assert.deepEqual(Owl.parseOwl('robe=zelena;hand=vlajka.original'), { robe: 'zelena', acc: { hand: { id: 'vlajka', color: 'original' } } });
    assert.deepEqual(Owl.parseOwl('hand=vlajka'), { robe: 'vinova', acc: { hand: { id: 'vlajka', color: 'original' } } });
    assert.doesNotMatch(Owl.owlAvatarHtml('hand=vlajka.zelena'), /wikimedia/);
    assert.equal(Owl.encodeOwl({ robe: 'vinova', acc: { hand: { id: 'vlajka', color: 'zelena' } } }), 'robe=vinova;hand=vlajka.zelena');
    // Neplatná vlajka se zahodí a barva zůstane; vlajka u jiného doplňku se zahodí také
    for (const bad of ['q1', 'Q101472', 'q99999999999', 'qabc', '', 'x', '__proto__']) {
        assert.deepEqual(Owl.parseOwl(`hand=vlajka.zelena.${bad}`).acc.hand, { id: 'vlajka', color: 'zelena' }, bad);
    }
    assert.deepEqual(Owl.parseOwl('hand=lupa.zelena.q101472').acc.hand, { id: 'lupa', color: 'zelena' });
    assert.deepEqual(Owl.parseOwl('hand=vlajka.neplatna.q101472').acc.hand, { id: 'vlajka', color: 'original', flag: 'q101472' }, 'neplatná barva neodstraní vlajku');
    assert.deepEqual(Owl.parseOwl({ robe: 'vinova', acc: { hand: { id: 'vlajka', color: 'original', flag: 'q1' } } }).acc.hand, { id: 'vlajka', color: 'original' });
});
