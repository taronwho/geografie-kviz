// Literatura – rozšíření (scripts/lib/literatura-rozsireni.mjs): divadelní hry, pohádky a dětská literatura, jazyky a písma, filozofové
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const literatura = require('../topics/literatura.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'literatura.json'), 'utf8'));
const ctx = { topic: literatura, items: data.items, collections: data.collections, byId: new Map(data.items.map(item => [item.q, item])) };
const find = (name, category) => data.items.find(item => item.n === name && (!category || item.c === category));
const rngStartingWith = (first, seed = 'rozsireni') => {
    const rng = core.createSeededRandom(seed);
    let used = false;
    return () => used ? rng() : (used = true, first);
};
const NEW = ['hry', 'pohadky', 'jazyky', 'filozofove'];

test('rozšíření: nové kategorie na konci, dost položek a známých, bez položek jiných témat', () => {
    assert.deepEqual(literatura.categories.map(category => category.key), ['spisovatele', 'dila', 'postavy', ...NEW]);
    for (const category of NEW) {
        const list = data.items.filter(item => item.c === category);
        const known = list.filter(item => item.k === 1).length;
        assert.ok(list.length >= 60, `${category}: ${list.length}`);
        assert.ok(known >= Math.ceil(list.length * 0.2) && known >= 20, `${category}: známých ${known}`);
        assert.ok(list.filter(item => item.x).length <= Math.ceil(list.length * 0.4), `${category}: expertních`);
    }
    // Stejná položka není ve dvou tématech
    const others = new Set();
    for (const file of fs.readdirSync(path.join(ROOT, 'data'))) {
        if (!file.endsWith('.json') || file === 'literatura.json' || /^(souvislosti|retezovka|licenses|photo|mapa-opravy)/.test(file)) continue;
        const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
        for (const item of json.items || []) others.add(item.q);
    }
    const shared = data.items.filter(item => NEW.includes(item.c) && others.has(item.q)).map(item => item.n);
    assert.deepEqual(shared, []);
    // Známé položky
    for (const [name, category] of [['Naši furianti', 'hry'], ['Záskok', 'hry'], ['Maryša', 'hry'], ['Popelka', 'pohadky'], ['Otesánek', 'pohadky'],
        ['Čeština', 'jazyky'], ['Latina', 'jazyky'], ['Cyrilice', 'jazyky'], ['Sókratés', 'filozofove'], ['Immanuel Kant', 'filozofove'], ['Jan Patočka', 'filozofove']]) {
        assert.equal(find(name, category)?.k, 1, name);
    }
    // Descartes je ve Fyzice, Marx v Historii, Hamlet a Nietzsche zůstávají ve svých kategoriích
    for (const name of ['René Descartes', 'Karl Marx']) assert.ok(!find(name), name);
    assert.equal(find('Hamlet').c, 'dila');
    assert.equal(find('Friedrich Nietzsche').c, 'spisovatele');
});

test('rozšíření: divadelní hry – autor, století, nápovědy', () => {
    const play = find('Naši furianti', 'hry');
    assert.equal(play.cz, 1);
    assert.ok(play.g.includes('ceske-divadlo') && play.g.includes('drama'));
    const author = literatura.specialQuestion(play, ctx, rngStartingWith(0.05));
    assert.equal(author.type, 'creator');
    assert.equal(author.title, 'Kdo hru napsal?');
    assert.equal(author.answerLabel, 'Ladislav Stroupežnický');
    assert.equal(author.choices.filter(choice => choice.correct).length, 1);
    assert.ok(core.checkAnswer('Stroupežnický', author));
    assert.doesNotMatch(literatura.censor('creator', 'Hra Ladislava Stroupežnického.', play, ctx), /Stroupežnick/);
    const century = literatura.specialQuestion(play, ctx, rngStartingWith(0.9));
    assert.equal(century.title, 'Ve kterém století hra vznikla?');
    assert.equal(century.answerLabel, '19. století');
    // Hra autora z tématu: otázka „Kdo to napsal?“ s možnostmi ze spisovatelů
    const tempest = literatura.specialQuestion(find('Bouře', 'hry'), ctx, rngStartingWith(0.05));
    assert.equal(tempest.answerLabel, 'William Shakespeare');
    assert.ok(tempest.choices.every(choice => ctx.byId.get(choice.id).c === 'spisovatele'));
    // Cimrmanovské hry mají autory Smoljaka a Svěráka a divadlo
    const zaskok = find('Záskok', 'hry');
    assert.equal(zaskok.f.by, 'Ladislav Smoljak a Zdeněk Svěrák');
    assert.equal(zaskok.f.th, 'Divadlo Járy Cimrmana');
    assert.ok(core.checkAnswer('Smoljak a Svěrák', literatura.specialQuestion(zaskok, ctx, rngStartingWith(0.05))));
    // Nápovědy u názvu: vznik a původ, autor, fotka
    assert.deepEqual(literatura.hints(play, ctx, 'name').map(step => step.label || step.kind), ['vznik a původ', 'autor', 'photo']);
});

test('rozšíření: pohádky – autor nebo sběratel, země, druh otázky', () => {
    const popelka = find('Popelka', 'pohadky');
    const author = literatura.specialQuestion(popelka, ctx, rngStartingWith(0.05));
    assert.equal(author.title, 'Kdo pohádku napsal?');
    assert.equal(author.answerLabel, 'Charles Perrault');
    const origin = literatura.specialQuestion(popelka, ctx, rngStartingWith(0.9));
    assert.equal(origin.type, 'origin');
    assert.equal(origin.answerLabel, 'Francie');
    assert.equal(new Set(origin.choices.map(choice => choice.label)).size, 4);
    assert.doesNotMatch(literatura.censor('origin', 'Francouzská pohádka, kterou zapsal Charles Perrault ve Francii.', popelka, ctx), /Francouz|Perrault|Franci/);
    // Grimmové pohádky zapsali; u české pohádky se na zemi neptáme
    const grimm = data.items.find(item => item.c === 'pohadky' && item.f.by === 'bratři Grimmové' && item.ty === 'pohádka');
    assert.equal(literatura.specialQuestion(grimm, ctx, rngStartingWith(0.05)).title, 'Kdo pohádku zapsal?');
    assert.equal(literatura.specialQuestion(find('Otesánek', 'pohadky'), ctx, rngStartingWith(0.9)), null);
    // Kniha pro děti: otázka na knihu
    assert.equal(literatura.questionTitle(find('Děti z Bullerbynu', 'pohadky')), 'Která kniha to je?');
});

test('rozšíření: jazyky a písma – skupina, písmo, státy; písmo jen k písmu', () => {
    const czech = find('Čeština', 'jazyky');
    assert.equal(czech.f.br, 'slovanské jazyky');
    assert.deepEqual(czech.f.scr, ['latinka']);
    const branch = literatura.specialQuestion(czech, ctx, rngStartingWith(0.05));
    assert.equal(branch.title, 'Do které jazykové skupiny patří?');
    assert.equal(branch.answerLabel, 'slovanská');
    assert.ok(core.checkAnswer('slovanské', branch));
    assert.equal(new Set(branch.choices.map(choice => choice.label)).size, 4);
    assert.doesNotMatch(literatura.censor('branch', 'Čeština je západoslovanský jazyk ze skupiny slovanských jazyků.', czech, ctx), /slovan/i);
    const script = literatura.specialQuestion(find('Ruština', 'jazyky'), ctx, rngStartingWith(0.9));
    assert.equal(script.title, 'Jakým písmem se píše?');
    assert.equal(script.answerLabel, 'cyrilice');
    assert.ok(!script.choices.some(choice => !choice.correct && /cyrilice/.test(choice.label)));
    // Písmo: vlastní otázka a možnosti jen z písem
    const cyrillic = find('Cyrilice', 'jazyky');
    assert.equal(literatura.questionTitle(cyrillic), 'Které písmo to je?');
    const choices = core.buildItemChoices(cyrillic, data.items, core.createSeededRandom('pismo'), other => literatura.similarity(cyrillic, other, ctx));
    assert.ok(choices.every(choice => ctx.byId.get(choice.id).f.script === 1), choices.map(choice => choice.label).join(', '));
    // Nápovědy jazyka: rodina a mluvčí, písmo, státy (skupina až po odpovědi)
    assert.deepEqual(literatura.hints(czech, ctx, 'name').map(step => step.label), ['rodina a mluvčí', 'písmo', 'státy']);
    assert.ok(!literatura.facts(czech, ctx, 'name').some(fact => fact.label === 'Jazyková skupina'));
    assert.ok(literatura.facts(czech, ctx, 'card').some(fact => fact.label === 'Jazyková skupina'));
});

test('rozšíření: filozofové – století, směr, jméno v popisu zakryté', () => {
    const kant = find('Immanuel Kant', 'filozofove');
    assert.equal(kant.f.land, 'Německo');
    const century = literatura.specialQuestion(kant, ctx, rngStartingWith(0.9));
    assert.equal(century.type, 'century');
    assert.equal(century.answerLabel, '18. století');
    assert.doesNotMatch(literatura.censor('name', 'Immanuel Kant byl německý filozof; Kant napsal…', kant, ctx), /Kant/);
    assert.ok(literatura.nameAliases(kant, ctx).includes('Kant'));
    const choices = core.buildItemChoices(kant, data.items, core.createSeededRandom('kant'), other => literatura.similarity(kant, other, ctx));
    assert.ok(choices.every(choice => ctx.byId.get(choice.id).c === 'filozofove'));
    assert.deepEqual(literatura.hints(kant, ctx, 'name').map(step => step.label || step.kind), ['facts', 'visual', 'photo', 'slavné dílo']);
    // Antika a východ v okruzích
    assert.ok(find('Sókratés', 'filozofove').g.includes('anticka-filozofie'));
    assert.ok(find('Konfucius', 'filozofove').g.includes('vychodni-filozofie'));
});
