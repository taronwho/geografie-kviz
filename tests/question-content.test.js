// Obsah otázek tak, jak je uvidí hráč: systémové chyby nalezené při kontrole otázek všech témat (skutečná data, sestavení
// otázky jako v aplikaci – tests/pipeline.js) a jejich opravy
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../quiz-core.js');
const P = require('./pipeline.js');

const find = (ctx, name) => ctx.items.find(item => item.n === name);
// Generátor, který napoprvé vrátí zadané číslo (volba druhu otázky) a dál náhodná čísla se semínkem
const rngStartingWith = (first, seed = 'obsah') => {
    const seeded = core.createSeededRandom(seed);
    let used = false;
    return () => { if (used) return seeded(); used = true; return first; };
};
const nameChoices = (ctx, item, seed) => core.buildItemChoices(item, ctx.items, core.createSeededRandom(seed),
    other => ctx.topic.similarity ? ctx.topic.similarity(item, other, ctx) : 0, core.cultureLandsFor(ctx.topic, ctx));

test('možnosti: nesprávná možnost není přijímanou odpovědí správné (Katedrála Notre-Dame u katedrály v Rouenu)', () => {
    const ctx = P.loadContext('zemepis');
    for (const name of ['Katedrála Nanebevzetí Panny Marie v Rouenu', 'Katedrála Panny Marie ve Štrasburku']) {
        const item = find(ctx, name);
        const accepted = core.nameAnswers(item).map(core.normalizeAnswer);
        for (let seed = 0; seed < 12; seed++) {
            const wrong = nameChoices(ctx, item, `notre${seed}`).filter(choice => !choice.correct);
            assert.ok(!wrong.some(choice => accepted.includes(core.normalizeAnswer(choice.label))), `${name}: ${wrong.map(choice => choice.label).join(' | ')}`);
        }
    }
});

test('možnosti: nadřazený pojem z popisu není nesprávnou možností (Mastná kyselina – Organická kyselina)', () => {
    const chemie = P.loadContext('chemie');
    const fatty = find(chemie, 'Mastná kyselina');
    for (let seed = 0; seed < 12; seed++) {
        const labels = nameChoices(chemie, fatty, `mastna${seed}`).map(choice => choice.label);
        assert.ok(!labels.includes('Organická kyselina') && !labels.includes('Karboxylová kyselina'), labels.join(' | '));
    }
});

test('fyzika: třída, do které částice patří, není nesprávnou možností (Elektron – Lepton, Neutron – Baryon)', () => {
    const ctx = P.loadContext('fyzika');
    const cases = { Elektron: ['Lepton', 'Fermion', 'Elementární částice'], Neutron: ['Nukleon', 'Baryon', 'Hadron', 'Fermion'], Foton: ['Boson'], Lepton: ['Fermion'], Mion: ['Lepton'] };
    for (const [name, classes] of Object.entries(cases)) {
        const item = find(ctx, name);
        for (let seed = 0; seed < 10; seed++) {
            const labels = nameChoices(ctx, item, `castice${seed}`).map(choice => choice.label);
            assert.deepEqual(labels.filter(label => classes.includes(label)), [], `${name}: ${labels.join(' | ')}`);
        }
    }
    // Třída nemá jako fakt nesmyslnou skupinu (Fermion – „lepton“)
    assert.deepEqual(ctx.topic.facts(find(ctx, 'Fermion'), ctx, 'name'), []);
});

test('popis: slova jiných možností se zakryjí, jen když možnost odliší (ne „sonda“, „cyklistiky“, „fotbalová“)', () => {
    const ctx = P.loadContext('sport');
    const item = find(ctx, 'Cyklokros');
    const question = { type: 'name', title: 'Co je to za sport?', choices: ['Cyklokros', 'Dráhová cyklistika', 'Silniční cyklistika', 'BMX'].map((label, i) => ({ id: `c${i}`, label, correct: i === 0 })) };
    assert.equal(core.hideAnswer('Disciplína sportovní cyklistiky.', question, item, ctx), 'Disciplína sportovní cyklistiky.');
    const league = find(ctx, 'Primera División');
    const leagueQuestion = { type: 'name', title: 'Která soutěž to je?', choices: ['Primera División', '1. česká fotbalová liga', 'Eredivisie', 'Primeira Liga'].map((label, i) => ({ id: `l${i}`, label, correct: i === 0 })) };
    assert.equal(core.hideAnswer('Nejvyšší španělská fotbalová soutěž.', leagueQuestion, league, ctx), 'Nejvyšší španělská fotbalová soutěž.');
    // Jméno jiné možnosti se zakryje dál (popis by ji vyřadil)
    assert.match(core.hideAnswer('Liga podobná Eredivisie.', leagueQuestion, league, ctx), /\[\*\*\*\]/);
    const fyzika = P.loadContext('fyzika');
    const voyager = find(fyzika, 'Voyager 1');
    const probe = { type: 'name', title: 'Co je to za sondu nebo přístroj?', choices: ['Voyager 1', 'Sonda Cassini', 'Luna 2', 'Pioneer 11'].map((label, i) => ({ id: `v${i}`, label, correct: i === 0 })) };
    assert.equal(core.hideAnswer('Vesmírná sonda NASA.', probe, voyager, fyzika), 'Vesmírná sonda NASA.');
    assert.match(core.hideAnswer('Letěla kolem Cassini.', probe, voyager, fyzika), /\[\*\*\*\]/);
});

test('nápovědy: zkratka z odpovědi rozepsaná ve faktu odpověď prozradí (ZTF – Zwicky Transient Facility)', () => {
    assert.ok(core.factRevealsAnswer({ label: 'Objevitel', value: 'Zwicky Transient Facility' }, ['C/2022 E3 (ZTF)']));
    assert.ok(core.factRevealsAnswer({ label: 'Objevitel', value: 'Asteroid Terrestrial-impact Last Alert System' }, ['C/2023 A3 (Tsuchinshan-ATLAS)']));
    assert.ok(!core.factRevealsAnswer({ label: 'Objevitel', value: 'Michael E. Brown' }, ['C/2022 E3 (ZTF)']));
    // Římská číslice není zkratka
    assert.ok(!core.factRevealsAnswer({ label: 'Předchůdce', value: 'Xaver Ignác Valois' }, ['Ludvík XIV.']));
});

test('biologie: otázka na řád – příbuzní ani čeleď nenesou jméno řádu (Jeseter malý, jeseterovití u jeseterů)', () => {
    const ctx = P.loadContext('biologie');
    for (const name of ['Veslonos americký', 'Veslonos čínský', 'Vyza velká', 'Vyza malá']) {
        const item = find(ctx, name);
        const question = ctx.topic.specialQuestion(item, ctx, rngStartingWith(0.1));
        assert.equal(question.type, 'taxon', name);
        const texts = ctx.topic.hints(item, ctx, 'taxon').flatMap(step => (step.facts || []).map(fact => fact.value)).join(' · ');
        assert.doesNotMatch(texts, /jeset/i, `${name}: ${texts}`);
    }
    // Jednotné číslo řádu jako psaná odpověď, bez pahýlů („hlodavk“)
    const degu = ctx.topic.specialQuestion(find(ctx, 'Osmák degu'), ctx, rngStartingWith(0.1));
    assert.deepEqual(degu.accepted, ['hlodavci', 'hlodavec']);
});

test('biologie: vědecký název jako nápověda nezopakuje české jméno (Pinus sibirica, Octodon degus, Salvia rosmarinus)', () => {
    const ctx = P.loadContext('biologie');
    const latHint = (name) => {
        const step = ctx.topic.hints(find(ctx, name), ctx, 'name').find(entry => entry.label === 'vědecký název');
        return step.facts.length ? step.facts[0].value : null;
    };
    assert.equal(latHint('Borovice sibiřská'), 'Pinus …');
    assert.equal(latHint('Osmák degu'), 'Octodon …');
    assert.equal(latHint('Šalvěj rozmarýna'), null);
    assert.equal(latHint('Irbis'), 'Panthera uncia');
    // Psaná odpověď vědeckým názvem platí dál
    assert.ok(core.nameAnswers(find(ctx, 'Borovice sibiřská'), ctx.topic.nameAliases(find(ctx, 'Borovice sibiřská'), ctx)).includes('Pinus sibirica'));
});

test('architektura: sloh architekta jen z jeho doby (Carlo Fontana není románský architekt)', () => {
    const ctx = P.loadContext('architektura');
    const romanesque = find(ctx, 'Románský sloh');
    const architects = ctx.topic.hints(romanesque, ctx, 'name').flatMap(step => (step.facts || [])).filter(fact => fact.label === 'Architekti').map(fact => fact.value).join(', ');
    assert.doesNotMatch(architects, /Carlo Fontana/);
    assert.ok(!ctx.topic.facts(find(ctx, 'Carlo Fontana'), ctx, 'name').some(fact => fact.label === 'Sloh' && /Románský/.test(fact.value)));
    // Architekt své doby sloh má dál
    assert.ok(ctx.topic.facts(find(ctx, 'Petr Parléř'), ctx, 'name').some(fact => fact.label === 'Sloh' && fact.value === 'Gotika'));
});

test('chemie: vzorce v obvyklém zápisu, ne Hillově s kyslíkem napřed (PbSO₄, ne O₄PbS)', () => {
    const ctx = P.loadContext('chemie');
    const formulas = ctx.items.filter(item => item.f && item.f.formula && !/C(?![a-z])/.test(item.f.formula)).map(item => item.f.formula);
    assert.deepEqual(formulas.filter(formula => /^(?:H[₀-₉]*)?O[₀-₉]*(?!F)[A-Z]/.test(formula)), []);
    assert.equal(find(ctx, 'Kyselina thiosírová').f.formula, 'H₂S₂O₃');
});

test('data: krátký popis nekončí tečkou (hra ji přidá sama – „Americký herec..“)', () => {
    for (const id of P.TOPIC_IDS) {
        const { items } = P.loadContext(id);
        assert.deepEqual(items.filter(item => /\.$/.test(item.d || '')).map(item => item.d).slice(0, 5), [], id);
    }
});

test('doba: tisíc let vzdálená osoba stejného druhu není nesprávnou možností (Spartakus – Ajman az-Zaváhirí)', () => {
    const ctx = P.loadContext('historie');
    const spartacus = find(ctx, 'Spartakus');
    for (let seed = 0; seed < 10; seed++) {
        const labels = nameChoices(ctx, spartacus, `spartakus${seed}`).map(choice => choice.label);
        const years = labels.map(label => (find(ctx, label).f || {}).y).filter(year => year !== undefined);
        assert.ok(years.every(year => year < 1000), labels.join(' | '));
    }
});

test('audit: upřesnění v závorce ani pevný popisek mapy nejsou prozrazení', async () => {
    const audit = await import('../scripts/lib/audit.mjs');
    const words = audit.distinguishingWords(['Panenská věž (Turecko)'], []);
    assert.equal(audit.findLeak('Stát: Turecko', words), null);
    assert.ok(audit.findLeak('Panenská věž stojí v Istanbulu', words));
    // Bez upřesnění by nezbylo nic: kometa C/2020 F3 (NEOWISE)
    assert.ok(audit.findLeak('Kometa NEOWISE', audit.distinguishingWords(['C/2020 F3 (NEOWISE)'], [])));
});

test('mytologie: otázka „Ze které mytologie je?“ se neptá tam, kde mytologii určí kategorie', () => {
    const ctx = P.loadContext('mytologie');
    for (const item of ctx.items) {
        const question = ctx.topic.specialQuestion(item, ctx, rngStartingWith(0.95, item.q));
        if (!question || question.type !== 'myth') continue;
        assert.ok(['bytosti', 'predmety', 'recka'].includes(item.c), `${item.n} (${item.c})`);
        if (item.c === 'recka') assert.ok(question.choices.some(choice => ['řecká', 'římská'].includes(choice.label) && !choice.correct), item.n);
    }
});

test('audit worker přijme i úvody ve tvaru testovací fixture (tests/wiki-intros.json)', () => {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, 'wiki-intros.json'), 'utf8'));
    assert.ok(json.items && Object.values(json.items).every(entry => entry.t && typeof entry.extract === 'string'));
});

test('štítek stavby neodporuje názvu (Zámek Kroměříž není „hrad“, Kostel sv. Mikuláše není „katedrála“)', async () => {
    const { buildingTypeFromName } = await import('../scripts/lib/wikidata.mjs');
    assert.equal(buildingTypeFromName('Zámek Kroměříž', 'hrad'), 'zámek');
    assert.equal(buildingTypeFromName('Kostel svatého Mikuláše v Praze-Starém Městě', 'katedrála'), 'kostel');
    // Slučitelné druhy a název, který druh štítku obsahuje, zůstanou
    assert.equal(buildingTypeFromName('Bazilika svatého Víta', 'katedrála'), 'katedrála');
    assert.equal(buildingTypeFromName('Chrám svatého Víta', 'katedrála'), 'katedrála');
    assert.equal(buildingTypeFromName('Mešita-katedrála v Córdobě', 'katedrála'), 'katedrála');
    assert.equal(buildingTypeFromName('Karlův most', 'most'), 'most');
    for (const [id, category] of [['architektura', 'stavby'], ['zemepis', 'stavba']]) {
        const wrong = P.loadContext(id).items.filter(item => item.c === category && item.ty && buildingTypeFromName(item.n, item.ty) !== item.ty);
        assert.deepEqual(wrong.map(item => `${item.n}: ${item.ty}`), [], id);
    }
});

test('popis: víceslovný region za „ve státě“ se zakryje celý (ne „[***] York“)', () => {
    assert.equal(core.censorCountry('v Lake Placid ve státě New York v USA.', 'Spojené státy americké', []), 'v Lake Placid [***] v USA.');
});
