// Odškrtávací seznam okruhu a Můj obor (obor.js): stav okruhu, řádky a filtr, pořadí otázek oboru, kurzor, rozpracované obory a pečeť
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Obor = require('../obor.js');

const items = ['A', 'B', 'C', 'D', 'E'].map((q, i) => ({ q, n: `Položka ${q}`, i }));
const ids = items.map(item => item.q);

test('stav okruhu: X / Y, procenta dolů a hotovo jen při všem', () => {
    assert.deepEqual(Obor.summarize(items, new Set()), { total: 5, done: 0, missing: 5, percent: 0, complete: false });
    assert.deepEqual(Obor.summarize(items, new Set(['A', 'C', 'X'])), { total: 5, done: 2, missing: 3, percent: 40, complete: false });
    const almost = Array.from({ length: 200 }, (_, i) => ({ q: `Q${i}`, n: `${i}` }));
    assert.equal(Obor.summarize(almost, new Set(almost.slice(1).map(item => item.q))).percent, 99, '199 z 200 není 100 %');
    assert.equal(Obor.summarize(items, new Set(ids)).complete, true);
    assert.equal(Obor.summarize([], new Set()).complete, false, 'prázdný okruh není hotový');
});

test('řádky seznamu v pořadí okruhu, s číslem z celého okruhu, a filtr Vše / Chybí / Hotovo', () => {
    const known = new Set(['B', 'D']);
    assert.deepEqual(Obor.rows(items, known).map(row => [row.n, row.id, row.known]), [[1, 'A', false], [2, 'B', true], [3, 'C', false], [4, 'D', true], [5, 'E', false]]);
    assert.deepEqual(Obor.rows(items, known, 'missing').map(row => `${row.n}${row.id}`), ['1A', '3C', '5E']);
    assert.deepEqual(Obor.rows(items, known, 'done').map(row => `${row.n}${row.id}`), ['2B', '4D']);
    assert.equal(Obor.rows(items, known)[1].name, 'Položka B', 'poznaná položka má jméno');
    assert.equal(Obor.rows(items, known)[0].name, null, 'nepoznaná jméno neprozradí (seznam není tahák)');
});

test('obor: nejdřív neznámé položky popořadě od kurzoru, na konci znovu od začátku, bez náhody', () => {
    const known = new Set(['A', 'C']);
    assert.deepEqual(Obor.next(ids, known, null), { id: 'B', index: 1, phase: 'learn' }, 'nový obor začíná první neznámou');
    assert.deepEqual(Obor.next(ids, known, 'B'), { id: 'D', index: 3, phase: 'learn' }, 'po B (i špatně zodpovězené) přijde D, ne B znovu');
    assert.deepEqual(Obor.next(ids, known, 'E'), { id: 'B', index: 1, phase: 'learn' }, 'za koncem seznamu se pokračuje od začátku');
    assert.deepEqual(Obor.next(ids, new Set(['A', 'B', 'C', 'E']), 'B'), { id: 'D', index: 3, phase: 'learn' });
    assert.deepEqual(Obor.next(ids, known, 'zmizela'), { id: 'B', index: 1, phase: 'learn' }, 'kurzor na položce, která už v datech není: od začátku');
    // Všechno umí: opakování popořadě za kurzorem
    assert.deepEqual(Obor.next(ids, new Set(ids), 'C'), { id: 'D', index: 3, phase: 'review' });
    assert.deepEqual(Obor.next(ids, new Set(ids), 'E'), { id: 'A', index: 0, phase: 'review' });
    assert.equal(Obor.next([], new Set(), null), null);
    // Stejný vstup = stejný výsledek (žádné losování)
    for (let i = 0; i < 5; i++) assert.equal(Obor.next(ids, known, 'B').id, 'D');
});

test('obor projde celý okruh: každá položka přijde, než se nějaká zopakuje', () => {
    const known = new Set();
    let cursor = null;
    const asked = [];
    for (let i = 0; i < ids.length; i++) {
        const step = Obor.next(ids, known, cursor);
        asked.push(step.id);
        cursor = step.id;
        if (step.id !== 'C') known.add(step.id); // C hráč splete
    }
    assert.deepEqual(asked, ids);
    assert.equal(Obor.next(ids, known, cursor).id, 'C', 'spletená položka přijde v dalším kole');
});

test('volba oboru, kurzor, více rozpracovaných oborů a odebrání', () => {
    let state = Obor.parse(null);
    assert.deepEqual(state, { current: null, fields: {}, seals: {} });
    state = Obor.choose(state, 'historie|premyslovci', 100, 'Přemyslovci');
    assert.equal(state.current, 'historie|premyslovci');
    assert.deepEqual(state.fields['historie|premyslovci'], { cursor: null, at: 100, label: 'Přemyslovci' });
    state = Obor.noteAnswer(state, 'historie|premyslovci', 'Q42', 200);
    assert.equal(state.fields['historie|premyslovci'].cursor, 'Q42');
    assert.equal(state.fields['historie|premyslovci'].label, 'Přemyslovci', 'název zůstane');
    // Druhý obor: první zůstane rozpracovaný se svým kurzorem
    state = Obor.choose(state, 'zemepis|c:hora', 300, 'Hory');
    assert.equal(state.current, 'zemepis|c:hora');
    assert.deepEqual(Obor.fieldList(state).map(field => [field.key, field.topic, field.collection, field.cursor]),
        [['zemepis|c:hora', 'zemepis', 'c:hora', null], ['historie|premyslovci', 'historie', 'premyslovci', 'Q42']]);
    // Návrat k prvnímu: naváže se kurzorem
    state = Obor.choose(state, 'historie|premyslovci', 400);
    assert.equal(state.fields['historie|premyslovci'].cursor, 'Q42');
    assert.equal(state.fields['historie|premyslovci'].label, 'Přemyslovci');
    // Odpověď mimo zvolený obor (neznámý klíč) nic nezmění
    assert.deepEqual(Obor.noteAnswer(state, 'nikde|nic', 'Q1', 500).fields, state.fields);
    state = Obor.remove(state, 'historie|premyslovci');
    assert.equal(state.current, null, 'odebraný aktuální obor už není aktuální');
    assert.deepEqual(Object.keys(state.fields), ['zemepis|c:hora']);
    assert.equal(Obor.leave(Obor.choose(state, 'zemepis|c:hora', 1)).current, null);
    // Neplatný klíč se nezvolí
    assert.equal(Obor.choose(Obor.parse(null), 'bez-oddelovace').current, null);
});

test('rozpracovaných oborů je nejvýš MAX_FIELDS, odpadnou nejdéle nehrané', () => {
    let state = Obor.parse(null);
    for (let i = 0; i < Obor.MAX_FIELDS + 5; i++) state = Obor.choose(state, `t|c${i}`, i);
    assert.equal(Object.keys(state.fields).length, Obor.MAX_FIELDS);
    assert.ok(!state.fields['t|c0'] && state.fields[`t|c${Obor.MAX_FIELDS + 4}`]);
});

test('pečeť: jen za hotový okruh, jednou, a zůstane i po přibytí položek', () => {
    const key = 'historie|premyslovci';
    let state = Obor.parse(null);
    const half = Obor.summarize(items, new Set(['A']));
    const full = Obor.summarize(items, new Set(ids));
    assert.equal(Obor.needsSeal(state, key, half), false);
    assert.equal(Obor.needsSeal(state, key, full), true);
    state = Obor.seal(state, key, '2026-11-26');
    assert.equal(Obor.isSealed(state, key), true);
    assert.equal(Obor.needsSeal(state, key, full), false, 'podruhé se neuděluje (animace jen jednou)');
    assert.equal(Obor.seal(state, key, '2026-12-01').seals[key], '2026-11-26', 'datum první pečeti zůstává');
    // Do okruhu přibyla položka: pečeť zůstává, ukazatel ukáže nové X / Y
    const grown = Obor.summarize([...items, { q: 'F', n: 'Nová' }], new Set(ids));
    assert.equal(grown.complete, false);
    assert.equal(Obor.isSealed(state, key), true);
    assert.equal(Obor.seal(Obor.parse(null), key, 'neplatné').seals[key], undefined);
});

test('poškozené úložiště se přečte jako prázdné; load a save přes úložiště', () => {
    assert.deepEqual(Obor.parse({ current: 'x|y', fields: { 'x|y': 'ne', 'bez': {}, 'a|b': { cursor: 5, at: 'x' } }, seals: { 'a|b': 'včera', 'c|d': '2026-11-26' } }),
        { current: null, fields: { 'a|b': { cursor: null, at: 0, label: '' } }, seals: { 'c|d': '2026-11-26' } });
    const store = new Map();
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
    assert.deepEqual(Obor.load(storage), Obor.parse(null));
    Obor.save(storage, Obor.choose(Obor.parse(null), 'a|b', 7, 'Bé'));
    assert.equal(Obor.load(storage).current, 'a|b');
    store.set(Obor.STORAGE_KEY, '{nečitelné');
    assert.deepEqual(Obor.load(storage), Obor.parse(null));
    assert.doesNotThrow(() => Obor.save({ setItem: () => { throw new Error('plno'); } }, Obor.parse(null)));
});

test('HTML: ukazatel s X / Y, filtr s počty, seznam bez prozrazení dalšího a s ošetřenými jmény', () => {
    const summary = Obor.summarize(items, new Set(['A', 'B']));
    const meter = Obor.meterHtml(summary);
    assert.match(meter, /2<span[^>]*>&nbsp;\/&nbsp;5<\/span>/);
    assert.match(meter, /40 %/);
    assert.match(meter, /Chybí 3 položky/);
    assert.doesNotMatch(meter, /data-seal/, 'bez 100 % jen prázdné místo pro pečeť');
    const sealed = Obor.meterHtml(Obor.summarize(items, new Set(ids)), { sealed: true, animate: true });
    assert.match(sealed, /data-seal class="seal-stamp /);
    assert.match(Obor.meterHtml(Obor.summarize(items, new Set(ids)), { sealed: true }), /data-seal class="relative/, 'bez animace podruhé');
    const filter = Obor.filterHtml(summary, 'missing');
    assert.match(filter, /data-filter="missing" aria-pressed="true"/);
    assert.match(filter, /Chybí <span[^>]*>3<\/span>/);
    const list = Obor.listHtml(Obor.rows([...items, { q: 'X', n: '<b>Zlé</b>' }], new Set(['A', 'X'])), { topic: 'historie' });
    assert.equal((list.match(/data-checklist-row/g) || []).length, 6, 'v seznamu jsou všechny položky');
    assert.equal((list.match(/data-action="item-info"/g) || []).length, 2, 'otevřít jdou jen poznané');
    assert.match(list, /&lt;b&gt;Zlé&lt;\/b&gt;/);
    assert.equal((list.match(/data-known="1"/g) || []).length, 2);
    assert.equal((list.match(/data-known="0"/g) || []).length, 4);
    assert.match(list, /Položka A/);
    for (const hidden of ['Položka B', 'Položka C', 'Položka D', 'Položka E']) assert.doesNotMatch(list, new RegExp(hidden), `${hidden}: jméno nepoznané položky se neukáže`);
    assert.equal((list.match(/>\?\?\?</g) || []).length, 4, 'místo jména ???');
    assert.doesNotMatch(list, /style=/, 'CSP: žádné inline styly');
    assert.match(Obor.listHtml([], { filter: 'missing' }), /Nic nechybí/);
    assert.equal(Obor.items(1), '1 položka');
    assert.equal(Obor.items(4), '4 položky');
    assert.equal(Obor.items(1420), '1 420 položek');
});

test('napojení: skript v index.html před app.js, v mezipaměti sw.js a v Tailwindu; tip v tips.js', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src="obor.js"') > 0 && html.indexOf('src="obor.js"') < html.indexOf('src="app.js"'));
    assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /'obor\.js'/);
    assert.match(fs.readFileSync(path.join(root, 'tailwind.config.js'), 'utf8'), /'\.\/obor\.js'/);
    const tip = require('../tips.js').BY_ID.get('obor');
    assert.ok(tip && tip.text.length < 260);
});
