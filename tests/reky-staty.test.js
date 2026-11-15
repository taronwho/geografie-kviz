// Řeky a státy: pole ca v data/zemepis.json (státy, kterými řeka také teče, kde pramení nebo má povodí, ale Wikidata je nemají
// v P17 – scripts/lib/zemepis-reky.mjs, npm run build:reky) a jeho použití: „Která z těchto řek teče ve Španělsku?“ v Dobývání
// (conquest.js) nesmí mít mezi nesprávnými možnostmi řeku, která tím státem teče (Garonna pramení ve Španělsku, Spréva krátce
// teče Českem), a hlavní hra se na takovou řeku neptá „Ve kterém státě to je?“ (topics/zemepis.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../conquest.js');
const zemepis = require('../topics/zemepis.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const data = read('data/zemepis.json');
const COUNTRIES = read('data/countries.json').countries;
const river = (name) => data.items.find(item => item.c === 'reka' && item.n === name);
const MAPS = ['evropa', 'afrika', 'asie', 'amerika'];

test('data: ca jen u řek, jen dnešní státy z tabulky, bez států z co; známé případy', () => {
    const withAlso = data.items.filter(item => item.ca);
    assert.ok(withAlso.length >= 40 && withAlso.length <= 200, `${withAlso.length} řek s dalšími státy`);
    for (const item of withAlso) {
        assert.equal(item.c, 'reka', item.n);
        assert.ok(Array.isArray(item.ca) && item.ca.length > 0, item.n);
        for (const q of item.ca) {
            assert.ok(COUNTRIES[q], `${item.n}: ${q} je stát z tabulky`);
            assert.ok(!(item.co || []).includes(q), `${item.n}: ${q} není zároveň v co`);
        }
        assert.deepEqual(item.ca, [...item.ca].sort(), `${item.n}: seřazené`);
        // Pole hned za co (čitelnost dat)
        const keys = Object.keys(item);
        assert.equal(keys[keys.indexOf('co') + 1], 'ca', item.n);
    }
    // Garonna pramení ve Španělsku (Wikidata ji mají v obou státech), Spréva krátce teče Českem, Siret pramení na Ukrajině,
    // Dunaj tvoří hranici s Ukrajinou, Purus pramení v Peru, Ganga teče do Bangladéše
    assert.ok(river('Garonna').co.includes('Q29') && river('Garonna').co.includes('Q142'));
    assert.ok(river('Spréva').ca.includes('Q213'));
    assert.ok(river('Siret').ca.includes('Q212'));
    assert.ok(river('Dunaj').ca.includes('Q212'));
    assert.ok(river('Purus').ca.includes('Q419'));
    assert.ok(river('Ganga').ca.includes('Q902'));
    // Řeka jen v jednom státě nic navíc nemá
    for (const name of ['Vltava', 'Temže', 'Seina', 'Loira', 'Ebro']) assert.equal(river(name).ca, undefined, name);
});

test('výpočet: státy podle průběhu řeky (lineCountries) – úsek v jednom státě, podél hranice obě strany, pramen za hranicí', async () => {
    const { borderIndex, lineCountries } = await import('../scripts/lib/zemepis-reky.mjs');
    // Dva čtverce vedle sebe (A vlevo, B vpravo) se společnou hranicí na délce 10°
    const square = (q, x0, x1) => ({ properties: { WIKIDATAID: q }, geometry: { type: 'Polygon', coordinates: [[[x0, 40], [x1, 40], [x1, 41], [x0, 41], [x0, 40]]] } });
    const index = borderIndex([square('QA', 9, 10), square('QB', 10, 11)]);
    // Čára zapsaná jako v data/mapa-tvary.json: „~“ a body v tisícinách stupně (šířka, délka), další body jako rozdíly
    const encode = (points) => `~${points.map(([lat, lon], i) => (i ? [lat - points[i - 1][0], lon - points[i - 1][1]] : [lat, lon]).join(',')).join(',')}`;
    const inside = lineCountries(encode([[40200, 9200], [40800, 9400]]), index);
    assert.deepEqual([...inside.keys()], ['QA']);
    assert.ok(inside.get('QA') > 60 && inside.get('QA') < 80, `${inside.get('QA')} km`);
    // Podél hranice (500 m od ní): obě strany
    const along = lineCountries(encode([[40200, 9994], [40800, 9994]]), index);
    assert.ok(along.get('QA') > 60 && along.get('QB') > 60, JSON.stringify([...along]));
    // Pramen 30 km za hranicí: i druhý stát
    const source = lineCountries(encode([[40500, 10300], [40500, 9500]]), index);
    assert.ok(source.get('QB') > 20 && source.get('QA') > 40, JSON.stringify([...source]));
});

const allTopics = () => Object.fromEntries(['zemepis', 'vlajky', 'architektura', 'historie', 'literatura', 'hudba', 'umeni', 'film', 'sport', 'fyzika', 'chemie', 'biologie', 'mytologie']
    .map(id => [id, read(`data/${id}.json`).items]));

test('Dobývání: „Která z těchto řek teče …?“ nemá mezi nesprávnými řeku, která státem teče (co ani ca)', () => {
    const topics = allTopics();
    const byName = new Map(data.items.filter(item => item.c === 'reka').map(item => [item.n, item]));
    let asked = 0;
    const seen = new Map();
    for (const id of MAPS) {
        const map = read(`data/dobyvani-${id}.json`);
        for (const territory of map.t) for (const level of [0, 2, 3]) for (let s = 0; s < 6; s++) {
            const question = C.buildQuestion({ data: map, territory: territory.id, level, topics, seed: `reky|${s}`, only: 'river' });
            if (!question || question.family !== 'river') continue;
            asked++;
            for (const choice of question.choices) {
                const item = byName.get(choice.label);
                assert.ok(item, choice.label);
                const states = [...(item.co || []), ...(item.ca || [])];
                if (choice.correct) assert.ok((item.co || []).includes(territory.id), `${territory.n}: ${choice.label} je správně`);
                else assert.ok(!states.includes(territory.id), `${territory.n}: nesprávná možnost ${choice.label} tím státem teče (${states.join(', ')})`);
                seen.set(`${territory.id}${choice.correct ? '+' : '-'}${choice.label}`, true);
            }
        }
    }
    assert.ok(asked > 150, `${asked} otázek na řeky`);
    // Garonna je ve Španělsku správnou odpovědí, nikdy nesprávnou; Spréva není nesprávnou možností pro Česko
    assert.ok(!seen.has('Q29-Garonna') && !seen.has('Q213-Spréva') && !seen.has('Q212-Dunaj'));
});

test('Dobývání: řeka s dalšími státy je „víc států“ a v těch státech není správnou odpovědí', () => {
    const topics = allTopics();
    const europe = read('data/dobyvani-evropa.json');
    for (let s = 0; s < 40; s++) {
        const question = C.buildQuestion({ data: europe, territory: 'Q213', level: 3, topics, seed: `spreva|${s}`, only: 'river' });
        if (!question) continue;
        const correct = question.choices.find(choice => choice.correct);
        assert.notEqual(correct.label, 'Spréva', 'Spréva není v Česku jedinou odpovědí (Wikidata ji mají jen v Německu)');
        assert.notEqual(correct.label, 'Dunaj');
    }
});

test('hlavní hra: „Ve kterém státě to je?“ se neptá na řeku, která teče i jiným státem (ca)', () => {
    const countries = COUNTRIES;
    const ctx = { countries, items: data.items };
    const always = () => 0;
    for (const name of ['Spréva', 'Siret', 'Ganga', 'Adiže', 'Jizera']) {
        assert.equal(zemepis.specialQuestion(river(name), ctx, always), null, name);
    }
    // Řeka jen v jednom státě otázku dostane a nesprávné možnosti jsou jiné státy
    const vltava = zemepis.specialQuestion(river('Vltava'), ctx, always);
    assert.equal(vltava, null, 'místa v Česku název prozradí');
    const thames = zemepis.specialQuestion(river('Temže'), ctx, always);
    assert.ok(thames && thames.type === 'location');
    assert.deepEqual(thames.choices.filter(choice => choice.correct).map(choice => choice.label), ['Spojené království']);
    // Žádná položka s otázkou na stát nemá další státy
    const asked = data.items.filter(item => item.c === 'reka' && zemepis.specialQuestion(item, ctx, always));
    assert.ok(asked.length > 100, `${asked.length} řek s otázkou na stát`);
    assert.ok(asked.every(item => !item.ca));
});
