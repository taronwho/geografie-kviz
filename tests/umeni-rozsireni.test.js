// Výtvarné umění, rozšíření o užité umění (scripts/lib/umeni-rozsireni.mjs): kategorie Móda a návrháři, Design a nábytek, Šperky
// a klenoty, Písma a typografie – data, otázky podle druhu, obrázek otázky, nesprávné možnosti stejné skupiny, fakta a nápovědy
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const topic = require('../topics/umeni.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'umeni.json'), 'utf8'));
const ctx = { topic, items: data.items, collections: data.collections, countries: {}, byId: new Map(data.items.map(item => [item.q, item])) };
const NEW = ['moda', 'design', 'sperky', 'pisma'];
const find = (name) => {
    const item = data.items.find(candidate => candidate.n === name && NEW.includes(candidate.c));
    assert.ok(item, `chybí ${name}`);
    return item;
};
const inCollection = (id) => data.items.filter(item => (item.g || []).includes(id));
const wrongChoices = (item, seed) => core.buildItemChoices(item, data.items, core.createSeededRandom(seed), other => topic.similarity(item, other, ctx), core.cultureLandsFor(topic, ctx))
    .filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id));

test('umění – užité umění: nové kategorie na konci, dost položek, známých i expertních', () => {
    assert.deepEqual(topic.categories.map(category => category.key).slice(-4), NEW);
    assert.deepEqual(topic.categories.map(category => category.key).slice(0, 6), ['obrazy', 'sochy', 'umelci', 'smery', 'fotografove', 'ilustratori']);
    for (const [key, min, minKnown] of [['moda', 80, 20], ['design', 45, 12], ['sperky', 40, 12], ['pisma', 80, 20]]) {
        const list = data.items.filter(item => item.c === key);
        assert.ok(list.length >= min, `${key}: ${list.length}`);
        assert.ok(list.filter(item => item.k === 1).length >= minKnown, `${key}: známých`);
        assert.ok(list.some(item => item.x) && list.every(item => !(item.k === 1 && item.x)), `${key}: experti`);
        assert.ok(list.every(item => item.t && item.n && item.ty && item.q), key);
    }
    for (const name of ['Coco Chanel', 'Karl Lagerfeld', 'Gucci', 'H&M', 'IKEA', 'Moka', 'Svatováclavská koruna', 'České korunovační klenoty', 'Fabergého vejce',
        'Tiára', 'Times New Roman', 'Arial', 'Fraktura', 'Zavináč']) {
        assert.equal(find(name).k, 1, `${name} má být známé`);
    }
    for (const id of ['modni-navrhari', 'modni-domy', 'designeri', 'ikony-designu', 'cesky-design', 'korunovacni-klenoty', 'druhy-sperku', 'klenotnici',
        'slavna-pisma', 'druhy-pisma', 'typograficke-pojmy', 'typografove']) {
        assert.ok(data.collections.some(collection => collection.id === id), id);
        const members = inCollection(id);
        assert.ok(members.length >= 8, id);
        assert.ok(members.filter(item => item.k === 1).length >= Math.max(3, Math.ceil(members.length * 0.25)), `${id}: známých`);
    }
    // Česká stopa i v okruhu České umění
    for (const name of ['Blanka Matragi', 'Bořek Šípek', 'Svatováclavská koruna', 'Oldřich Menhart', 'Moser']) {
        assert.ok(find(name).cz === 1 && find(name).g.includes('ceske-umeni'), name);
    }
});

test('umění – užité umění: žádná položka z jiného tématu ani dvakrát; diamanty má Geologie', () => {
    const own = new Map(data.items.filter(item => NEW.includes(item.c)).map(item => [item.q, item]));
    for (const file of fs.readdirSync(path.join(ROOT, 'topics'))) {
        const id = file.replace(/\.js$/, '');
        if (id === 'umeni' || !fs.existsSync(path.join(ROOT, 'data', `${id}.json`))) continue;
        const other = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8'));
        assert.deepEqual((other.items || []).filter(item => own.has(item.q)).map(item => item.n), [], id);
    }
    const ids = data.items.map(item => item.q);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!data.items.some(item => ['Koh-i-Noor', 'Cullinan', 'Hope (diamant)', 'Džíny', 'Bikiny', 'Marcel Breuer'].includes(item.n) && NEW.includes(item.c)));
});

test('umění – užité umění: otázka podle druhu a obrázek otázky', () => {
    assert.equal(topic.questionTitle(find('Gucci')), 'Který módní dům to je?');
    assert.equal(topic.questionTitle(find('Coco Chanel')), 'Kdo to je?');
    assert.equal(topic.questionTitle(find('Křeslo Barcelona')), 'Co je to za kus nábytku?');
    assert.equal(topic.questionTitle(find('Svatováclavská koruna')), 'Která koruna to je?');
    assert.equal(topic.questionTitle(find('Prsten')), 'Jaký druh šperku to je?');
    assert.equal(topic.questionTitle(find('Times New Roman')), 'Jaké je to písmo?');
    assert.equal(topic.questionTitle(find('Kerning')), 'Jaký typografický pojem to je?');
    // Dosavadní kategorie se ptají jako dřív
    assert.equal(topic.questionTitle(data.items.find(item => item.n === 'Mona Lisa')), null);
    // Kus nábytku, šperk či vzorník písma jsou vidět hned; lidé a firmy ne (firmy obrázek nemají – vývěsní štít s názvem)
    const shown = topic.questionImage(find('Times New Roman'), ctx);
    assert.ok(shown && shown.file === find('Times New Roman').im && shown.label === 'Ukázka písma');
    assert.ok(topic.questionImage(find('Křeslo Barcelona'), ctx));
    assert.equal(topic.questionImage(find('Coco Chanel'), ctx), null);
    assert.ok(data.items.filter(item => ['módní dům', 'oděvní značka', 'značka designu', 'klenotnická firma'].includes(item.ty)).every(item => !item.im));
    // Vzorník s velkým názvem písma (Fraktur, Antiqua, Rodina písma Helvetica) se nepoužije, názvy v záhlaví zakrývá ruční maska
    for (const name of ['Fraktura', 'Antikva', 'Helvetica', 'Unciála']) assert.ok(!find(name).im, name);
    const masks = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'photo-masks-manual.json'), 'utf8'));
    for (const name of ['Times New Roman', 'Arial', 'Comic Sans', 'Palatino']) assert.ok(masks[find(name).im], name);
    // Obrázek s napsanou odpovědí (data/photo-text.json) se neukáže ani u otázky
    const item = find('Křeslo Barcelona');
    assert.equal(topic.questionImage(item, { ...ctx, textPhotos: new Set([item.im]) }), null);
});

test('umění – užité umění: nesprávné možnosti ze stejné skupiny a bez překryvu druhů', () => {
    const PEOPLE = /návrhář|designér|výtvarn|výrobce nábytku|keramik|klenotník|zlatník|šperkař|typograf|tiskař|grafick/u;
    for (const [name, check] of [
        ['Coco Chanel', other => PEOPLE.test(other.ty)],
        ['Gucci', other => ['módní dům', 'oděvní značka'].includes(other.ty)],
        ['Svatováclavská koruna', other => other.ty === 'koruna'],
        ['Křeslo Barcelona', other => other.ty === 'nábytek'],
        ['Times New Roman', other => other.ty === 'písmo'],
        ['Claude Garamond', other => PEOPLE.test(other.ty) && other.f.born < 1800]
    ]) {
        for (const seed of ['a', 'b', 'c']) {
            const options = wrongChoices(find(name), `${name}${seed}`);
            assert.equal(options.length, 3, name);
            assert.ok(options.every(check), `${name}: ${options.map(other => `${other.n} (${other.ty})`).join(', ')}`);
        }
    }
    // Tiára je diadém, fraktura je gotické písmo: jedno druhému nesprávnou možností nebude
    assert.equal(topic.similarity(find('Diadém'), find('Tiára'), ctx), -Infinity);
    assert.equal(topic.similarity(find('Gotické písmo'), find('Fraktura'), ctx), -Infinity);
    assert.equal(topic.similarity(find('Gucci'), find('Guccio Gucci'), ctx), -Infinity);
});

test('umění – užité umění: fakta, osa a nápovědy', () => {
    const facts = (name, mode = 'name') => topic.facts(find(name), ctx, mode).map(fact => `${fact.label}: ${fact.value}`);
    assert.ok(facts('Gucci').includes('Zakladatel: Guccio Gucci') && facts('Gucci').includes('Země: Itálie'));
    // Rok vzniku ukazuje osa a podtitul, mezi fakty není (rozlišující údaj by ho ukázal hned a osa by nic nepřidala)
    assert.ok(!facts('Křeslo Barcelona', 'result').some(line => line.startsWith('Vznik')) && topic.subtitle(find('Křeslo Barcelona'), ctx).includes('1929'));
    assert.deepEqual(topic.visual(find('Křeslo Barcelona'), ctx, 'name').points, [1929]);
    assert.ok(facts('Svatováclavská koruna').some(line => line.startsWith('Země: Česko')));
    // Lidé: země a díla (módní domy, kde pracovali; navržená písma), život až po odpovědi
    assert.ok(facts('Karl Lagerfeld').some(line => /^Módní domy: .*Chanel/u.test(line)), facts('Karl Lagerfeld').join('; '));
    assert.ok(facts('Max Miedinger').includes('Písma a díla: Helvetica'));
    assert.ok(!facts('Coco Chanel').some(line => line.startsWith('Narození')) && facts('Coco Chanel', 'result').includes('Narození: 1883'));
    assert.equal(topic.visual(find('Coco Chanel'), ctx, 'name').spans[0].from, 1883);
    // Příjmení jako psaná odpověď u návrhářů (bez dvojic, které se dají splést)
    assert.ok(topic.nameAliases(find('Coco Chanel'), ctx).includes('Chanel'));
    // Příjmení, které je i názvem módního domu (Miuccia Prada – Prada), samo neplatí
    assert.deepEqual(topic.nameAliases(find('Miuccia Prada'), ctx), []);
    assert.ok(topic.subtitle(find('Gucci'), ctx).startsWith('módní dům · 1921'));
    // Pojmy bez údajů mají aspoň popis; nikde fakt, který by prozradil odpověď (zakladatel stejného jména se vyřadí v nápovědě)
    for (const item of data.items.filter(other => NEW.includes(other.c))) {
        assert.ok(item.d, `${item.n}: bez popisu`);
        for (const fact of topic.facts(item, ctx, 'name')) assert.ok(String(fact.value).length && fact.value !== item.n, `${item.n}: ${fact.label}`);
    }
});
