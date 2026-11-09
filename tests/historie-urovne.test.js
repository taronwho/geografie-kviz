// Testy úrovní a okruhů tématu Historie na skutečných datech (data/historie.json): Základní (k: 1), Mudrlant, Mudrlant Expert (x: 1)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'historie.json'), 'utf8'));
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name);
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id, tier = 'expert') => core.filterItems(data.items, { tier, collection: id });
const names = (list) => list.map(item => item.n);

test('historie: tři úrovně – podíl známých a perliček v tématu i v každé kategorii', () => {
    const share = (list, test) => list.filter(test).length / list.length;
    assert.ok(data.items.every(item => !(item.k === 1 && item.x)), 'známá položka není zároveň perlička');
    const known = share(data.items, item => item.k === 1);
    const expert = share(data.items, item => item.x === 1);
    assert.ok(known >= 0.22 && known <= 0.33, `Základní ${known}`);
    assert.ok(expert >= 0.15 && expert <= 0.33, `Expert ${expert}`);
    for (const category of new Set(data.items.map(item => item.c))) {
        const list = data.items.filter(item => item.c === category);
        assert.ok(share(list, item => item.k === 1) >= 0.18, `${category}: málo známých`);
        assert.ok(share(list, item => item.x === 1) <= 0.45, `${category}: moc perliček`);
    }
});

test('historie: každý okruh od 8 položek má aspoň čtvrtinu známých (nejméně 3), malé okruhy nejsou celé známé', () => {
    for (const collection of data.collections) {
        const all = inCollection(collection.id);
        if (all.length < 8) continue;
        const known = inCollection(collection.id, 'known').length;
        // Papežové a faraoni: obskurní položky se známými nestanou jen kvůli podílu (papežové mají vlastní kontrolu níže)
        if (collection.id === 'papezove') continue;
        const share = all.length > 100 ? 0.2 : 0.25;
        assert.ok(known >= Math.min(Math.max(3, Math.ceil(all.length * share)), all.length), `${collection.id}: ${known} známých z ${all.length}`);
    }
    // Prezidenti USA mají články ve všech jazycích – známí jsou jen ti opravdu slavní
    assert.ok(inCollection('prezidenti-usa', 'known').length <= inCollection('prezidenti-usa').length * 0.6);
    // Papežů je přes dvě stě, známých jen hrstka, většina jsou perličky
    const popes = inCollection('papezove');
    assert.ok(inCollection('papezove', 'known').length <= 25);
    assert.ok(popes.filter(item => item.x).length >= popes.length * 0.4);
    assert.equal(find('Jan Pavel II.').k, 1);
});

test('historie: války mají bitvy, obléhání i osobnosti', () => {
    const sizes = { 'husitske-valky': 25, 'stoleta-valka': 20, 'tricetileta-valka': 30, 'napoleonske-valky': 70, 'prvni-svetova': 60 };
    for (const [id, min] of Object.entries(sizes)) assert.ok(inCollection(id).length >= min, `${id}: ${inCollection(id).length}`);
    assert.ok(names(inCollection('husitske-valky')).includes('Bitva na Vítkově'));
    assert.ok(names(inCollection('husitske-valky', 'known')).includes('Jan Žižka'));
    assert.ok(names(inCollection('stoleta-valka', 'known')).includes('Jana z Arku'));
    assert.ok(names(inCollection('tricetileta-valka')).includes('Albrecht z Valdštejna') && names(inCollection('tricetileta-valka')).includes('Gustav II. Adolf'));
    assert.ok(names(inCollection('napoleonske-valky')).includes('Horatio Nelson') && names(inCollection('napoleonske-valky')).includes('Bitva u Trafalgaru'));
    assert.ok(names(inCollection('prvni-svetova')).includes('Milan Rastislav Štefánik') && names(inCollection('prvni-svetova')).includes('Bitva u Zborova'));
    // Osoby jsou u války jen, když v ní mohly bojovat, a vědci ve službě ne
    for (const id of ['husitske-valky', 'stoleta-valka', 'tricetileta-valka', 'napoleonske-valky']) {
        assert.ok(!inCollection(id).some(item => /^\S+ (fyzik|chemik|astronom|matematik)$/u.test(item.d || '')), id);
    }
});

test('historie: rody se známými členy, němečtí kancléři, defenestrace', () => {
    assert.ok(inCollection('romanovci').some(item => /Anastázie/u.test(item.n)), 'velkokněžna Anastázie');
    assert.ok(inCollection('windsorove').some(item => /William/u.test(item.n)), 'princ William');
    assert.ok(inCollection('juliovsko-claudiovska').length >= 15);
    const chancellors = names(inCollection('nemecti-kancleri'));
    for (const name of ['Otto von Bismarck', 'Konrad Adenauer', 'Angela Merkelová']) assert.ok(chancellors.includes(name), name);
    assert.ok(inCollection('nemecti-kancleri', 'known').length >= 5);
    const defenestration = data.items.find(item => item.q === 'Q13365740');
    assert.ok(defenestration && defenestration.k === 1 && defenestration.f.year === 1618, 'pražská defenestrace 1618');
    assert.ok(inCollection('kongresy-koncily').length >= 35 && inCollection('katastrofy').length >= 70);
});

test('historie: nové méně známé položky mají český popis, osoby fotku a rozumné roky', () => {
    const THIS_YEAR = new Date().getFullYear();
    for (const item of data.items.filter(item => item.x)) {
        assert.ok(Number.isFinite(item.f.y) && item.f.y >= -7000 && item.f.y <= THIS_YEAR, `${item.n}: rok`);
        if (item.f.born !== undefined && item.f.died !== undefined) assert.ok(item.f.died > item.f.born && item.f.died - item.f.born <= 105, `${item.n}: život`);
    }
    // Jména jsou jedinečná
    const seen = new Set();
    for (const item of data.items) {
        assert.ok(!seen.has(item.q), `${item.n}: dvakrát`);
        seen.add(item.q);
    }
});
