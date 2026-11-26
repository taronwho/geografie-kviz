// Cestovní pas (passport.js): které položky dávají razítko, zápis s dnem, zpětné doplnění z poznaných položek, velké razítko kontinentu,
// nová razítka a stránky knihy (pevná mřížka, nejvýš 18 států na stránku, všechny státy z data/countries.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const Passport = require('../passport.js');
const COUNTRIES = require('../data/countries.json').countries;
const zemepis = require('../data/zemepis.json').items;
const vlajky = require('../data/vlajky.json').items;

const DAY = '2026-11-20';
const byId = (items) => new Map(items.map(item => [item.q, item]));
const ZEM = byId(zemepis);
const VLA = byId(vlajky);

test('razítko dává stát, hlavní město, vlajka a státní znak, nic jiného', () => {
    assert.equal(Passport.stampOf('zemepis', ZEM.get('Q142'), COUNTRIES), 'Q142');
    assert.equal(Passport.stampOf('zemepis', ZEM.get('Q90'), COUNTRIES), 'Q142', 'Paříž = Francie');
    assert.equal(Passport.stampOf('vlajky', VLA.get('Q101472'), COUNTRIES), 'Q252', 'indonéská vlajka');
    assert.equal(Passport.stampOf('vlajky', VLA.get('Q142845'), COUNTRIES), 'Q252', 'státní znak Indonésie');
    const mountain = zemepis.find(item => item.c === 'hora');
    assert.equal(Passport.stampOf('zemepis', mountain, COUNTRIES), null);
    const town = zemepis.find(item => item.c === 'mesto' && item.ty !== 'hlavní město');
    assert.equal(Passport.stampOf('zemepis', town, COUNTRIES), null);
    const region = vlajky.find(item => item.c === 'regiony');
    assert.equal(Passport.stampOf('vlajky', region, COUNTRIES), null);
    assert.equal(Passport.stampOf('historie', ZEM.get('Q142'), COUNTRIES), null, 'jiné téma razítko nedává');
    // Každý stát jde získat ze Zeměpisu (kategorie Státy má všech 197)
    const fromStates = new Set(zemepis.map(item => Passport.stampOf('zemepis', item, COUNTRIES)).filter(Boolean));
    assert.equal(fromStates.size, Object.keys(COUNTRIES).length);
});

test('zápis razítka: jen poprvé, s dnem; kompletní kontinent dostane velké razítko', () => {
    let { state, stamp } = Passport.record(Passport.EMPTY, 'zemepis', ZEM.get('Q142'), COUNTRIES, DAY);
    assert.equal(stamp, 'Q142');
    assert.equal(state.stamps.Q142, DAY);
    const again = Passport.record(state, 'vlajky', vlajky.find(item => item.c === 'vlajka' && item.co[0] === 'Q142'), COUNTRIES, '2026-11-21');
    assert.equal(again.stamp, null, 'druhé razítko za stejný stát není');
    assert.equal(again.state.stamps.Q142, DAY, 'den prvního získání zůstane');
    assert.deepEqual(Passport.freshStamps(state), ['Q142']);
    state = Passport.markSeen(state, ['Q142']);
    assert.deepEqual(Passport.freshStamps(state), []);
    // Jižní Amerika: poslední stát kontinentu dá velké razítko
    const south = Passport.countriesOf(COUNTRIES, 'SA');
    assert.equal(south.length, 12);
    let last = null;
    for (const country of south) last = Passport.record(state, 'zemepis', ZEM.get(country.id), COUNTRIES, DAY), state = last.state;
    assert.equal(last.continent, 'SA');
    assert.equal(state.done.SA, DAY);
    assert.deepEqual(Passport.freshDone(state), ['SA']);
    assert.deepEqual(Passport.freshDone(Passport.markSeen(state, [], ['SA'])), []);
});

test('zpětné doplnění z poznaných položek: bez data, rovnou viděné, jen jednou za téma', () => {
    const learned = ['Q142', 'Q90', 'Q213', 'Q1', 'Q83392'];
    const { state, added } = Passport.backfill(Passport.EMPTY, 'zemepis', learned, ZEM, COUNTRIES);
    assert.equal(added, 2, 'Francie (stát i Paříž jednou) a Česko');
    assert.equal(state.stamps.Q142, '');
    assert.equal(state.stamps.Q213, '');
    assert.equal(state.filled.zemepis, true);
    assert.deepEqual(Passport.freshStamps(state), []);
    assert.equal(Passport.backfill(state, 'zemepis', ['Q30'], ZEM, COUNTRIES).added, 0, 'podruhé se nedoplňuje');
    // Vlajky zvlášť: alžírská vlajka
    const flags = Passport.backfill(state, 'vlajky', ['Q83392'], VLA, COUNTRIES);
    assert.equal(flags.added, 1);
    assert.equal(flags.state.stamps.Q262, '');
    // Kontinent kompletní už z dřívějška: velké razítko „dřív“ a bez bouchnutí
    const all = Passport.backfill(Passport.EMPTY, 'zemepis', Passport.countriesOf(COUNTRIES, 'OC').map(country => country.id), ZEM, COUNTRIES).state;
    assert.equal(all.done.OC, '');
    assert.deepEqual(Passport.freshDone(all), []);
    assert.equal(Passport.dayLabel(''), 'dřív');
    assert.equal(Passport.dayLabel(DAY), '20. 11. 2026');
});

test('parse odmítne nesmysly', () => {
    const state = Passport.parse({ stamps: { Q142: DAY, Q1: 'včera', x: DAY, Q213: '' }, done: { EU: DAY, XX: DAY }, filled: { zemepis: true, historie: true }, seen: ['Q142', 'Q999'], doneSeen: ['EU', 'AS'] });
    assert.deepEqual(state.stamps, { Q142: DAY, Q213: '' });
    assert.deepEqual(state.done, { EU: DAY });
    assert.deepEqual(state.filled, { zemepis: true });
    assert.deepEqual(state.seen, ['Q142']);
    assert.deepEqual(state.doneSeen, ['EU']);
    assert.deepEqual(Passport.parse(null), Passport.EMPTY);
    assert.deepEqual(Passport.parse('x'), Passport.EMPTY);
});

test('kniha: obálka, stránky kontinentů po nejvýš 18 státech, všechny státy právě jednou, vlajky', () => {
    let state = Passport.record(Passport.EMPTY, 'zemepis', ZEM.get('Q213'), COUNTRIES, DAY).state;
    const pass = Passport.book(state, COUNTRIES);
    assert.equal(pass.total, Object.keys(COUNTRIES).length);
    assert.equal(Passport.TOTAL, pass.total, 'TOTAL odpovídá data/countries.json');
    assert.equal(pass.have, 1);
    assert.equal(pass.fresh, 1);
    assert.equal(pass.pages[0].kind, 'cover');
    const cells = pass.pages.filter(page => page.kind === 'continent').flatMap(page => page.cells);
    assert.equal(cells.length, pass.total);
    assert.equal(new Set(cells.map(cell => cell.id)).size, pass.total);
    for (const page of pass.pages.slice(1)) assert.ok(page.cells.length <= Passport.PAGE_MAX && page.cells.length > 0);
    assert.deepEqual(pass.continents.map(continent => continent.id), ['EU', 'AS', 'AF', 'NA', 'SA', 'OC']);
    assert.deepEqual(pass.continents.map(continent => continent.total), [47, 47, 54, 23, 12, 14]);
    // Stránky kontinentu jsou stejně velké (Evropa 16 + 16 + 15)
    assert.deepEqual(pass.pages.filter(page => page.kind === 'continent' && page.continent.id === 'EU').map(page => page.cells.length), [16, 16, 15]);
    const czech = cells.find(cell => cell.id === 'Q213');
    assert.equal(czech.have, true);
    assert.equal(czech.fresh, true);
    assert.ok(czech.flag && czech.flag.file, 'vlajka Česka z look-flags.js');
    // Všech 197 států má vlajku (i Švýcarsko, které ve Vlajkách dřív chybělo)
    assert.deepEqual(cells.filter(cell => !cell.flag).map(cell => cell.name), []);
    assert.equal(cells.length, 197);
    assert.equal(pass.pages[Passport.firstFreshPage(pass)].continent.id, 'EU');
    state = Passport.markSeen(state, ['Q213']);
    assert.equal(Passport.firstFreshPage(Passport.book(state, COUNTRIES)), 0);
});

test('HTML pasu: obálka s kontinenty, stránka s razítky a prázdnými místy, bez inline stylů', () => {
    const state = Passport.record(Passport.EMPTY, 'zemepis', ZEM.get('Q213'), COUNTRIES, DAY).state;
    const pass = Passport.book(state, COUNTRIES);
    const cover = Passport.passHtml(pass, 0, { canShare: true });
    assert.match(cover, /data-pas-go="1"/);
    assert.match(cover, /data-pas-share/);
    assert.match(cover, /1 \/ 197/);
    assert.doesNotMatch(cover, /style=/);
    const page = Passport.passHtml(pass, Passport.firstFreshPage(pass), {});
    assert.match(page, /data-pas-cell="Q213" data-pas-have data-pas-fresh/);
    assert.match(page, /pas-thud/);
    assert.match(page, /20\. 11\. 2026/);
    assert.match(page, /zatím bez razítka/);
    assert.doesNotMatch(page, /style=/);
    // Omezit pohyb: bez animace, štítek Nové zůstane
    const still = Passport.passHtml(pass, Passport.firstFreshPage(pass), { reduced: true });
    assert.doesNotMatch(still, /pas-thud/);
    assert.match(still, /Nové/);
    assert.match(Passport.shareText(pass), /1 \/ 197 států/);
    assert.ok(Passport.RULES.length < 260);
});

test('dlaždice v Mém postupu a souhrn Bleskovky a Přežití', () => {
    const empty = Passport.tile(Passport.EMPTY);
    assert.equal(empty.value, '0 / 197');
    assert.equal(empty.ready, false);
    const state = Passport.record(Passport.record(Passport.EMPTY, 'zemepis', ZEM.get('Q213'), COUNTRIES, DAY).state, 'zemepis', ZEM.get('Q142'), COUNTRIES, DAY).state;
    const fresh = Passport.tile(state);
    assert.match(fresh.value, /^\+2\s+nová$/u);
    assert.match(fresh.label, /2 z 197 států, 2\s+nová razítka/u);
    assert.equal(fresh.ready, true);
    assert.equal(Passport.tile(Passport.markSeen(state, ['Q213', 'Q142'])).value, '2 / 197');
    assert.equal(Passport.modeResultHtml([]), '');
    const html = Passport.modeResultHtml(['Česko', 'Francie'], { card: 'karta', cardTitle: 'nadpis' });
    assert.match(html, /Nová razítka do pasu: 2/);
    assert.match(html, /data-action="open-passport"/);
    assert.match(html, /pas-thud pas-d1/);
    assert.doesNotMatch(Passport.modeResultHtml(['Česko'], { reduced: true }), /pas-thud/);
});

test('Mudrlantův tip na pas: krátký, zmizí po otevření pasu', () => {
    const Tips = require('../tips.js');
    const tip = Tips.BY_ID.get('pas');
    assert.ok(tip && tip.text.length < 260);
    assert.equal(tip.used({ visited: {} }), false);
    assert.equal(tip.used({ visited: Tips.touch(Tips.EMPTY, 'passport').visited }), true);
});
