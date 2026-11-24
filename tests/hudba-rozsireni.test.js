// Testy rozšíření tématu Hudba (scripts/lib/hudba-rozsireni.mjs) na skutečných datech: kategorie Balet a tance a další muzikály
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const hudba = require('../topics/hudba.js');

const ROOT = path.join(__dirname, '..');
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hudba.json'), 'utf8'));
const ctx = { topic: hudba, items: data.items, collections: data.collections, countries, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name) => data.items.find(item => item.n === name);
const dances = data.items.filter(item => item.c === 'tance');
const rngStartingWith = (first, seed = 'tance') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};

test('hudba – tance: nová kategorie na konci seznamu, název tématu beze změny', () => {
    assert.deepEqual(hudba.categories.map(category => category.key), ['skladatele', 'hudebnici', 'kapely', 'dila', 'opery', 'tance']);
    assert.equal(hudba.title, 'Hudba');
    const category = hudba.categories.find(entry => entry.key === 'tance');
    assert.equal(category.label, 'Balet a tance');
    assert.equal(category.icon, 'footprints');
});

test('hudba – tance: dost položek, známých i expertních; balety s autorem hudby a rokem premiéry', () => {
    assert.ok(dances.length >= 60, `${dances.length} položek`);
    const known = dances.filter(item => item.k === 1).length / dances.length;
    const expert = dances.filter(item => item.x).length / dances.length;
    assert.ok(known >= 0.25 && known <= 0.45, `známých ${known}`);
    assert.ok(expert >= 0.15 && expert <= 0.35, `expertních ${expert}`);
    assert.ok(dances.every(item => !(item.k === 1 && item.x)));
    for (const name of ['Polka', 'Valčík', 'Tango', 'Flamenco', 'Čardáš', 'Salsa', 'Samba', 'Cha-cha', 'Mazurka', 'Kankán']) assert.equal(find(name)?.k, 1, name);
    const ballets = dances.filter(item => item.ty === 'balet');
    assert.ok(ballets.length >= 8);
    for (const ballet of ballets) assert.ok(ballet.f.by && ballet.f.year && ballet.d, `${ballet.n}: autor, rok a popis`);
    assert.equal(find('Špalíček').f.by, 'Bohuslav Martinů');
    assert.equal(find('Špalíček').cz, 1);
    // Tanec: druh, u většiny země původu; Polka je česká
    for (const dance of dances.filter(item => item.ty !== 'balet')) assert.ok(dance.ty && dance.d, dance.n);
    assert.equal(find('Polka').f.land, 'Česko');
    assert.equal(find('Polka').cz, 1);
    assert.equal(find('Tango').f.land, 'Argentina');
    assert.equal(find('Valčík').f.takt, '3/4');
});

test('hudba – tance: žádná položka není v jiném tématu a jméno je v tématu jen jednou', () => {
    const other = new Map();
    for (const file of fs.readdirSync(path.join(ROOT, 'data')).filter(name => name.endsWith('.json') && name !== 'hudba.json')) {
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8')); } catch { continue; }
        for (const item of Array.isArray(parsed.items) ? parsed.items : []) if (item && item.q) other.set(item.q, file);
    }
    for (const item of [...dances, ...data.items.filter(item => item.c === 'opery')]) assert.ok(!other.has(item.q), `${item.n} je i v ${other.get(item.q)}`);
    // Breakdance (Sport) a Pták Ohnivák (Mytologie) v Hudbě nejsou
    assert.ok(!find('Breakdance') && !find('Pták Ohnivák'));
});

test('hudba – tance: otázka podle druhu, Ze které země tanec pochází?, Kdo složil hudbu?', () => {
    assert.equal(hudba.questionTitle(find('Polka')), 'Který tanec to je?');
    assert.equal(hudba.questionTitle(find('Špalíček')), 'Který balet to je?');
    assert.equal(hudba.questionTitle(find('Má vlast')), null);
    const csardas = find('Čardáš');
    const origin = hudba.specialQuestion(csardas, ctx, rngStartingWith(0.1));
    assert.equal(origin.type, 'location');
    assert.equal(origin.title, 'Ze které země tanec pochází?');
    assert.equal(origin.answerLabel, 'Maďarsko');
    assert.equal(origin.choices.length, 4);
    assert.equal(origin.choices.filter(choice => choice.correct).length, 1);
    assert.ok(core.checkAnswer('Maďarsko', origin) && !core.checkAnswer('Polsko', origin));
    // Popis bez země i přídavného jména
    assert.doesNotMatch(hudba.censor('location', 'Čardáš je maďarský národní tanec z Maďarska.', csardas, ctx), /maďar/iu);
    // Nápovědy: kontinent, takt a vznik, fotka
    assert.deepEqual(hudba.hints(csardas, ctx, 'location').map(step => step.label || step.kind), ['kontinent', 'takt a vznik', 'photo']);
    // Na český tanec se na zemi neptá
    assert.equal(hudba.specialQuestion(find('Polka'), ctx, rngStartingWith(0.1)), null);
    // U otázky na název se země původu ukáže až v nápovědě (ne ve faktech otázky na zemi)
    assert.ok(!hudba.facts(csardas, ctx, 'location').some(fact => fact.label === 'Země původu'));
    assert.deepEqual(hudba.hints(csardas, ctx, 'name').map(step => step.label || step.kind), ['takt a vznik', 'země původu', 'photo']);
    // Balet: Kdo složil hudbu? (možnosti jsou skladatelé jevištních děl)
    const ballet = hudba.specialQuestion(find('Kamenný kvítek'), ctx, rngStartingWith(0.1));
    assert.equal(ballet.type, 'author');
    assert.equal(ballet.title, 'Kdo složil hudbu?');
    assert.equal(ballet.answerLabel, 'Sergej Prokofjev');
    assert.ok(ballet.choices.every(choice => ctx.byId.get(choice.id).c === 'skladatele'));
});

test('hudba – tance: nesprávné možnosti stejného druhu (balet k baletům, tanec k tancům)', () => {
    const pool = dances;
    for (const seed of ['a', 'b', 'c']) {
        const ballet = find('Oněgin');
        const balletChoices = core.buildItemChoices(ballet, pool, core.createSeededRandom(seed), other => hudba.similarity(ballet, other, ctx));
        assert.ok(balletChoices.every(choice => ctx.byId.get(choice.id).ty === 'balet'), 'k baletu balety');
        const tango = find('Tango');
        const danceChoices = core.buildItemChoices(tango, pool, core.createSeededRandom(seed), other => hudba.similarity(tango, other, ctx));
        assert.ok(danceChoices.every(choice => ctx.byId.get(choice.id).ty === 'standardní tanec'), 'k standardnímu tanci standardní');
    }
});

test('hudba – muzikály: další muzikály v kategorii Opery a muzikály s autorem a rokem, bez jmen filmů', () => {
    const musicals = data.items.filter(item => item.c === 'opery' && item.ty === 'muzikál');
    assert.ok(musicals.length >= 65);
    for (const name of ['Kleopatra', 'Divotvorný hrnec', 'Jekyll & Hyde']) {
        const item = find(name);
        assert.equal(item?.c, 'opery', name);
        assert.ok(item.f.by && item.f.year, name);
        assert.ok((item.g || []).includes('muzikaly'), name);
    }
    assert.equal(find('Kleopatra').f.by, 'Michal David');
    assert.ok((find('Kleopatra').g || []).includes('ceske-opery'));
});

test('hudba – okruhy rozšíření: Balety (i stávající balety), společenské, lidové a historické tance', () => {
    const inCollection = (id) => core.filterItems(data.items, { collection: id }).map(item => item.n);
    for (const name of ['Labutí jezero', 'Louskáček', 'Špalíček', 'Kamenný kvítek']) assert.ok(inCollection('balety').includes(name), name);
    assert.equal(find('Labutí jezero').c, 'dila', 'stávající balet zůstává ve své kategorii');
    assert.ok(inCollection('spolecenske-tance').includes('Cha-cha') && inCollection('lidove-tance').includes('Polka') && inCollection('historicke-tance').includes('Menuet'));
    assert.ok(inCollection('historicke-tance').includes('Polonéza') && inCollection('lidove-tance').includes('Polonéza'));
});
