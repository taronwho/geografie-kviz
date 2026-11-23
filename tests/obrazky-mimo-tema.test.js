// Obrázek, který neukazuje to, na co se otázka ptá (topic.offSubjectPhoto z quiz-core.js offSubjectRule): sad s poníkem místo
// stavby, mapa místo jezera, slon místo národního parku, výhled z vrcholu místo hory, hrob nebo pamětní deska místo osobnosti,
// logo místo alba. app.js loadTopic takový obrázek vynechá všude (otázka, nápověda, atlas, Dobývání), položka zůstane.
// Pravidla témat jsou ověřená na všech názvech souborů (npm run audit:obrazky); test hlídá pravidlo, známé případy a že pravidlo
// nevyřadí moc (portréty osobností, obrazy, běžné fotky měst a hor zůstanou).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const TOPICS = ['zemepis', 'architektura', 'historie', 'biologie', 'chemie', 'fyzika', 'geologie', 'hudba', 'literatura', 'sport', 'umeni', 'film'];
const load = (id) => ({ topic: require(`../topics/${id}.js`), items: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8')).items });
const loaded = Object.fromEntries(TOPICS.map(id => [id, load(id)]));
const find = (id, name, category) => loaded[id].items.find(item => item.n === name && (!category || item.c === category));
const flagged = (id, name, category) => {
    const item = find(id, name, category);
    assert.ok(item && item.im, `${id}: ${name} je v datech s obrázkem`);
    return loaded[id].topic.offSubjectPhoto(item);
};

test('pravidlo: slova názvu souboru bez diakritiky, víceslovná, ne slova z vlastního názvu, ručně ověřené položky a výjimky', () => {
    assert.deepEqual(core.photoWords('Tula YasnayaPolyana asv2019-09 img04 orchard.jpg'), ['tula', 'yasnaya', 'polyana', 'asv', 'img', 'orchard']);
    assert.deepEqual(core.photoWords('Brno-Obilní-trh4-pamětní-deska.jpg'), ['brno', 'obilni', 'trh', 'pametni', 'deska']);
    const rule = core.offSubjectRule({ words: { stavby: ['model', 'coat of arms'], osoby: ['pametni deska'] }, ids: ['Q9'], keep: ['Q8'], views: ['stavby'] });
    const item = (n, im, c = 'stavby', q = 'Q1') => ({ q, n, t: n, c, im });
    assert.ok(rule(item('Chrám', 'Temple model - 2013.jpg')));
    assert.ok(rule(item('Hrad', 'Coat of Arms Vladislaus II.jpg')));
    assert.ok(!rule(item('Hrad', 'Arms and armour hall.jpg')), 'jen celá fráze');
    assert.ok(!rule(item('Model Farm', 'Model Farm 2010.jpg')), 'slovo z vlastního názvu obrázek nevyřadí');
    assert.ok(!rule(item('Chrám', 'Temple model.jpg', 'obrazy')), 'jen kategorie s pravidlem');
    assert.ok(rule(item('Ivan', 'Ivan Blatný pamětní deska.jpg', 'osoby')));
    assert.ok(rule(item('Cokoli', 'Pěkná fotka.jpg', 'obrazy', 'Q9')), 'ručně ověřená položka');
    assert.ok(!rule(item('Chrám', 'Temple model.jpg', 'stavby', 'Q8')), 'výjimka');
    assert.ok(!rule({ q: 'Q1', n: 'Bez obrázku', c: 'stavby' }));
    // Výhled z položky (z rozhledny, z hradu), ne na ni
    assert.ok(rule(item('Petřín', 'Praha z Petřína.jpg')));
    assert.ok(rule(item('Eiffelova věž', 'Paris from the Eiffel tower.jpg')));
    assert.ok(!rule(item('Lincolnská katedrála', 'Lincoln Cathedral viewed from Lincoln Castle.jpg')), 'položka i před „from“: ukazuje ji');
    assert.ok(!rule(item('Kostel svatého Vavřince na Petříně', 'View from Petrinska Tower img7.jpg')), 'slovo upřesnění místa se nepočítá');
    assert.ok(!rule(item('Palác Granovských z Granova', 'Palác Granovských z Granova 01.JPG')));
    assert.ok(!rule(item('Petřín', 'Praha z Petřína.jpg', 'obrazy')), 'výhled jen v kategoriích views');
});

test('všechna témata s fotkami mají pravidlo; app.js obrázek vyřazené položky vynechá všude', () => {
    for (const id of TOPICS) assert.equal(typeof loaded[id].topic.offSubjectPhoto, 'function', id);
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /if \(topic\.offSubjectPhoto\) data\.items\.forEach\(item => \{ if \(topic\.offSubjectPhoto\(item\)\) \{ delete item\.im; delete item\.ih; \} \}\);/);
});

test('známé případy: stavby, místa a příroda ukazují místo, osobnosti sebe, díla dílo', () => {
    const off = [
        ['architektura', 'Jasná Poljana', 'stavby'], ['architektura', 'Kutub Minar', 'stavby'], ['architektura', 'Karlův most', 'mosty'], ['architektura', 'Dubai Mall', 'stavby'],
        ['architektura', 'Salt Lake Temple', 'stavby'], ['architektura', 'Ernst Wiesner', 'architekti'],
        ['zemepis', 'Jasná Poljana', 'stavba'], ['zemepis', 'Karlův most', 'stavba'], ['zemepis', 'Hypogeum Ħal Saflieni', 'stavba'],
        ['zemepis', 'Garamba', 'priroda'], ['zemepis', 'Národní park Etosha', 'priroda'], ['zemepis', 'Národní park Nairobi', 'priroda'], ['zemepis', 'Národní park Hwange', 'priroda'],
        ['zemepis', 'Klokaní ostrov', 'ostrov'], ['zemepis', 'Vánoční ostrov', 'ostrov'], ['zemepis', 'Viðoy', 'ostrov'], ['zemepis', 'Mackenzie', 'reka'], ['zemepis', 'Müritz', 'jezero'],
        ['zemepis', 'Santa María', 'hora'], ['zemepis', 'Radhošť', 'hora'], ['zemepis', 'Šumava', 'hora'],
        ['historie', 'Harald Modrozub'], ['historie', 'Bitva u Nekmíře'], ['biologie', 'Kudu velký'], ['biologie', 'Výreček siauský'],
        ['chemie', 'Ernst Otto Fischer'], ['fyzika', 'Ernst Ruska'], ['hudba', 'Harlej'], ['hudba', 'The Fame Monster'], ['hudba', 'Viola'], ['hudba', 'Mary Poppins'],
        ['literatura', 'Ivan Blatný'], ['literatura', 'Lev, čarodějnice a skříň'], ['sport', 'Josef Vašíček'], ['umeni', 'Zdeněk Burian'], ['umeni', 'Helmut Newton'],
        ['film', 'Radoslav Brzobohatý'], ['film', 'František Vláčil']
    ];
    for (const [id, name, category] of off) assert.ok(flagged(id, name, category), `${id}: ${name} má obrázek mimo téma`);
    const kept = [
        ['architektura', 'Katedrála svatého Víta v Praze', 'stavby'], ['architektura', 'Sixtinská kaple', 'stavby'], ['architektura', 'Lincolnská katedrála', 'stavby'],
        ['architektura', 'Ponte Vecchio', 'mosty'], ['architektura', 'Petr Parléř', 'architekti'], ['zemepis', 'Praha', 'mesto'], ['zemepis', 'Nápis Hollywood', 'stavba'],
        ['zemepis', 'Socha Svobody', 'stavba'], ['zemepis', 'Victoria Peak', 'hora'], ['zemepis', 'Garonna', 'reka'], ['zemepis', 'Velké Medvědí jezero', 'jezero'],
        ['zemepis', 'Guam', 'ostrov'], ['zemepis', 'Yellowstonský národní park', 'priroda'], ['zemepis', 'Údolí Timna', 'priroda'],
        ['historie', 'Marcus Tullius Cicero'], ['historie', 'Ramesse II.'], ['historie', 'Nefertari'], ['historie', 'Lžidimitrij I.'], ['biologie', 'Velociraptor'],
        ['hudba', 'Rusalka'], ['literatura', 'Homér'], ['umeni', 'Socha Svobody'], ['umeni', 'Výkřik'], ['film', 'Petr Jákl']
    ];
    for (const [id, name, category] of kept) assert.ok(!flagged(id, name, category), `${id}: ${name} si obrázek nechá`);
});

test('pravidla nevyřadí moc: v každém tématu nejvýš 3 % obrázků, u osobností nejvýš 1 %, známé položky skoro všechny s obrázkem', () => {
    const PEOPLE = new Set(['architekti', 'statnik', 'osobnost', 'panovnik', 'chemici', 'fyzici', 'astronomove', 'skladatele', 'hudebnici', 'spisovatele', 'sportovci', 'umelci', 'fotografove', 'ilustratori', 'herci', 'reziseri']);
    let total = 0;
    for (const id of TOPICS) {
        const { topic, items } = loaded[id];
        const withImage = items.filter(item => item.im);
        const off = withImage.filter(item => topic.offSubjectPhoto(item));
        total += off.length;
        assert.ok(off.length <= withImage.length * 0.03, `${id}: ${off.length} z ${withImage.length}`);
        const people = withImage.filter(item => PEOPLE.has(item.c));
        assert.ok(people.filter(item => topic.offSubjectPhoto(item)).length <= Math.max(2, people.length * 0.01), `${id}: osobnosti`);
        const known = withImage.filter(item => item.k === 1);
        assert.ok(known.filter(item => topic.offSubjectPhoto(item)).length <= known.length * 0.03, `${id}: známé položky`);
    }
    assert.ok(total >= 150 && total <= 400, `celkem ${total} obrázků mimo téma`);
});

test('audit npm run audit:obrazky: počty po tématech a kategoriích, vyřazené a podezřelé soubory', () => {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'audit-obrazky.mjs'), '--topic=architektura,zemepis', '--flagged'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /=== architektura: vyřazeno \d+ z \d+ obrázků/);
    assert.match(run.stdout, /--- zemepis\/priroda: vyřazeno \d+ z \d+, podezřelých \d+/);
    assert.match(run.stdout, /- Q749556\t·?k?1?\S*\tJasná Poljana\tTula YasnayaPolyana/);
    assert.match(run.stdout, /Celkem vyřazeno \d+ z \d+ obrázků/);
});
