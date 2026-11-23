// Testy kategorií Hrady a zámky, Mosty a tunely a Mrakodrapy a rekordní stavby tématu Architektura na skutečných datech
// (data/architektura.json, scripts/lib/architektura-kategorie.mjs): přesun ze staveb, nové položky, otázky, možnosti, rozměry, čísla
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/architektura.js');
const Numeric = require('../numeric-questions.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'architektura.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const ctx = { topic, items: data.items, collections: data.collections, countries, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => data.items.find(item => item.n === name);
const NEW = ['hrady', 'mosty', 'mrakodrapy'];
const TYPES = { hrady: ['hrad', 'zámek', 'pevnost', 'palác'], mosty: ['most', 'tunel'], mrakodrapy: ['mrakodrap', 'věž', 'přehrada'] };
const ICONS = fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8');

test('kategorie: tři nové na konci seznamu, s ikonou v icons.js, dost položek i známých', () => {
    assert.deepEqual(topic.categories.map(category => category.key), ['stavby', 'prvky', 'slohy', 'architekti', ...NEW]);
    assert.deepEqual(topic.categories.slice(-3).map(category => category.label), ['Hrady a zámky', 'Mosty a tunely', 'Mrakodrapy a rekordní stavby']);
    for (const category of topic.categories.slice(-3)) assert.ok(ICONS.includes(`"${category.icon}":`), `ikona ${category.icon}`);
    for (const key of NEW) {
        const list = data.items.filter(item => item.c === key);
        assert.ok(list.length >= 150, `${key}: ${list.length} položek`);
        assert.ok(list.filter(item => item.k === 1).length >= 40, `${key}: známých ${list.filter(item => item.k === 1).length}`);
        // Jen druhy staveb, které do kategorie patří; fotka, poloha a článek u každé
        for (const item of list) {
            assert.ok(TYPES[key].includes(item.ty), `${item.n}: druh ${item.ty}`);
            assert.ok(item.im && item.ih && item.t && item.la !== undefined, `${item.n}: fotka, článek a poloha`);
        }
    }
});

test('štítek druhu neodporuje názvu ani v nových kategoriích (Zámek … není „hrad“)', async () => {
    const { buildingTypeFromName } = await import('../scripts/lib/wikidata.mjs');
    const wrong = data.items.filter(item => NEW.includes(item.c) && buildingTypeFromName(item.n, item.ty) !== item.ty);
    assert.deepEqual(wrong.map(item => `${item.n}: ${item.ty}`), []);
});

test('přesun ze staveb: id a úroveň zůstávají, c0 pamatuje původní kategorii, ve stavbách zůstaly městské paláce a brány', () => {
    for (const [name, category] of [['Karlštejn', 'hrady'], ['Karlův most', 'mosty'], ['Golden Gate Bridge', 'mosty'], ['Eiffelova věž', 'mrakodrapy'],
        ['Burdž Chalífa', 'mrakodrapy'], ['Zimní palác', 'hrady'], ['Neuschwanstein', 'hrady'], ['Hooverova přehrada', 'mrakodrapy']]) {
        const item = find(name);
        assert.ok(item && item.c === category && item.c0 === 'stavby' && item.k === 1, `${name}: ${item && item.c}`);
    }
    // Klíč c0 hned za c (pořadí klíčů jako u ostatních položek) a jen u nových kategorií
    for (const item of data.items.filter(other => other.c0)) {
        assert.equal(item.c0, 'stavby');
        assert.ok(NEW.includes(item.c), item.n);
        const keys = Object.keys(item);
        assert.equal(keys[keys.indexOf('c') + 1], 'c0', item.n);
    }
    assert.ok(data.items.filter(item => item.c0).length >= 600);
    for (const name of ['Palác Kinských', 'Prašná brána', 'Staroměstská mostecká věž', 'Fatehpur Síkrí', 'Katedrála svatého Víta v Praze']) assert.equal(find(name).c, 'stavby', name);
    // Mezi stavbami nezůstaly zámky, mosty ani mrakodrapy – jen salety Lednicko-valtického areálu a vinařství, které Wikidata vedou jako zámek
    assert.deepEqual(data.items.filter(item => item.c === 'stavby' && ['zámek', 'most', 'mrakodrap', 'přehrada', 'tunel'].includes(item.ty)).map(item => item.n).sort(),
        ['Apollónův chrám', 'Château Margaux', 'Tři Grácie']);
});

test('nové položky: Pražský hrad, české hrady, tunely, rekordní mrakodrapy a přehrady s rozměry', () => {
    for (const [name, category, ty] of [['Pražský hrad', 'hrady', 'hrad'], ['Zámek Konopiště', 'hrady', 'zámek'], ['Trosky', 'hrady', 'hrad'],
        ['Eurotunel', 'mosty', 'tunel'], ['Gotthardský úpatní tunel', 'mosty', 'tunel'], ['Tunelový komplex Blanka', 'mosty', 'tunel'],
        ['One World Trade Center', 'mrakodrapy', 'mrakodrap'], ['Shanghai Tower', 'mrakodrapy', 'mrakodrap'], ['Tři soutěsky', 'mrakodrapy', 'přehrada']]) {
        const item = find(name);
        assert.ok(item && item.c === category && item.ty === ty && !item.c0, `${name}: ${item && `${item.c}/${item.ty}`}`);
        assert.ok(core.isRealPhoto(item.im), `${name}: fotka ${item.im}`);
    }
    for (const name of ['Pražský hrad', 'Zámek Konopiště', 'Trosky', 'Eurotunel', 'One World Trade Center', 'Tři soutěsky']) assert.equal(find(name).k, 1, `${name} je známé`);
    assert.equal(find('Pražský hrad').cz, 1);
    assert.ok(find('Eurotunel').f.len > 50000 && find('Golden Gate Bridge').f.len === 2737);
    assert.equal(find('Burdž Chalífa').f.h, 828);
    // Výška hráze, ne údaj o části díla (Hooverova přehrada 221 m)
    assert.equal(find('Hooverova přehrada').f.h, 221);
    // Rozměry jen tam, kde dávají smysl, a v rozumných mezích
    for (const item of data.items) {
        const f = item.f || {};
        if (f.h !== undefined) assert.ok(item.c === 'mrakodrapy' && f.h > 0 && f.h <= 1000, `${item.n}: výška ${f.h}`);
        if (f.len !== undefined) assert.ok(item.c === 'mosty' && f.len > 0, `${item.n}: délka ${f.len}`);
    }
    // Hrady a zámky v Česku mají vlastní okruh
    const czech = core.filterItems(data.items, { collection: 'ceske-hrady' }).map(item => item.n);
    assert.ok(czech.includes('Pražský hrad') && czech.includes('Karlštejn') && !czech.includes('Neuschwanstein'));
    assert.ok(core.filterItems(data.items, { collection: 'mosty' }).some(item => item.n === 'Golden Gate Bridge'), 'okruh Mosty a přehrady zůstal');
    assert.ok(core.filterItems(data.items, { collection: 'praha' }).some(item => item.n === 'Karlův most'), 'okruh Praha zůstal');
});

test('otázky: název podle druhu stavby, fakta s rozměrem, sloh i u přesunutého hradu, obrázek stavby s ikonou kategorie', () => {
    assert.equal(topic.questionTitle(find('Eurotunel')), 'Který tunel to je?');
    assert.equal(topic.questionTitle(find('Zimní palác')), 'Který palác to je?');
    assert.equal(topic.questionTitle(find('Tři soutěsky')), 'Která přehrada to je?');
    assert.equal(topic.questionTitle(find('Pražský hrad')), null, 'otázka kategorie: Který hrad nebo zámek to je?');
    assert.equal(topic.categories.find(category => category.key === 'hrady').question, 'Který hrad nebo zámek to je?');
    const fact = (name, label) => (topic.facts(find(name), ctx, 'result').find(entry => entry.label === label) || {}).value;
    assert.equal(fact('Burdž Chalífa', 'Výška'), '828 m');
    assert.equal(fact('Golden Gate Bridge', 'Délka'), '2,7 km');
    assert.equal(fact('Eurotunel', 'Délka'), '50 km');
    assert.equal(fact('Karlštejn', 'Výška'), undefined);
    // Nápověda k otázce na název: rozměr mezi prvními fakty
    assert.ok(topic.hints(find('Burdž Chalífa'), ctx, 'name')[0].facts.some(entry => entry.label === 'Výška'));
    const rng = (first, seed) => { const random = core.createSeededRandom(seed); let used = false; return () => used ? random() : (used = true, first); };
    assert.equal(topic.specialQuestion(find('Karlštejn'), ctx, rng(0.5, 'k')).type, 'style');
    assert.equal(topic.specialQuestion(find('Karlův most'), ctx, rng(0.1, 'k')).type, 'architect');
    assert.deepEqual(topic.questionImage(find('Eurotunel'), ctx, 'name'), { file: find('Eurotunel').im, hash: find('Eurotunel').ih, label: 'Stavba', icon: 'bridge' });
    assert.equal(topic.questionImage(find('Pražský hrad'), ctx, 'name').icon, 'castle');
    assert.equal(topic.visual(find('Pražský hrad'), ctx, 'name').type, 'map');
});

test('nesprávné možnosti: ze stejné kategorie a stejného druhu (k tunelu tunely, k přehradě přehrady, k hradu hrady a zámky)', () => {
    for (const [name, allowed] of [['Eurotunel', ['tunel']], ['Golden Gate Bridge', ['most']], ['Tři soutěsky', ['přehrada']], ['Karlštejn', ['hrad', 'zámek', 'pevnost']],
        ['One World Trade Center', ['mrakodrap']], ['Zimní palác', ['palác', 'zámek']], ['Pražský hrad', ['hrad', 'zámek', 'pevnost']]]) {
        const item = find(name);
        for (const tier of ['known', 'expert']) {
            const pool = core.filterItems(data.items, { tier });
            for (const seed of ['a', 'b', 'c', 'd', 'e']) {
                const choices = core.buildItemChoices(item, pool, core.createSeededRandom(`${name}|${tier}|${seed}`), other => topic.similarity(item, other, ctx));
                assert.equal(choices.length, 4, name);
                const wrong = choices.filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));
                assert.ok(wrong.every(other => other.c === item.c && allowed.includes(other.ty)), `${name} (${tier}): ${wrong.map(other => `${other.n} [${other.ty}]`).join(', ')}`);
            }
        }
    }
});

test('čísla: Seřaď a Odhadni u výšky mrakodrapů a věží, délky mostů a tunelů a roku vzniku v nových kategoriích', () => {
    for (const id of ['architektura-hrady-y', 'architektura-mosty-y', 'architektura-mrakodrapy-y', 'architektura-mrakodrapy-vyska', 'architektura-mosty-delka']) {
        const spec = Numeric.SPECS.find(other => other.id === id);
        assert.ok(spec, id);
        const eligible = data.items.filter(item => Numeric.isEligible(spec, item));
        assert.ok(eligible.length >= 40, `${id}: ${eligible.length}`);
        assert.ok(eligible.every(item => item.c === spec.category));
    }
    const tower = Numeric.buildRound({ kind: 'estimate', spec: 'architektura-mrakodrapy-vyska', ids: [find('Burdž Chalífa').q] }, ctx);
    assert.ok(tower && tower.question.title === 'Kolik metrů měří tato stavba?', JSON.stringify(tower && tower.question.title));
    const vyska = Numeric.SPECS.find(other => other.id === 'architektura-mrakodrapy-vyska');
    assert.ok(!Numeric.isEligible(vyska, find('Tři soutěsky')), 'přehrada se k výšce věží neřadí');
});
