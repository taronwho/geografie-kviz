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

test('psaná odpověď: přízvisko není příjmení („mladší“ neplatí za Agrippinu mladší, „Česká“ za Anežku Českou)', () => {
    const historie = P.loadContext('historie');
    for (const [name, epithet] of [['Agrippina mladší', 'mladší'], ['Albert Veliký', 'Veliký'], ['Anežka Česká', 'Česká']]) {
        const item = find(historie, name);
        const accepted = core.nameAnswers(item, historie.topic.nameAliases ? historie.topic.nameAliases(item, historie) : []);
        assert.ok(!core.isAnswerMatch(epithet, accepted), `${name}: ${accepted.join(' / ')}`);
        assert.ok(core.isAnswerMatch(name, accepted));
    }
    // Skutečné příjmení platí dál
    assert.ok(core.isAnswerMatch('Jackson', core.nameAnswers(find(historie, 'Andrew Jackson'))));
    // Čínské a korejské jméno: příjmení je napřed (Mao), rodné jméno (Ce-tung) samo neplatí
    const mao = core.nameAnswers(find(historie, 'Mao Ce-tung'));
    assert.ok(core.isAnswerMatch('Mao', mao) && !core.isAnswerMatch('Ce-tung', mao), mao.join(' / '));
    assert.ok(!core.isAnswerMatch('Čong-un', core.nameAnswers(find(historie, 'Kim Čong-un'))));
});

test('vlajky: nápis s odpovědí na vlajce či znaku (CALIFORNIA REPUBLIC, FIFA) se na obrázku otázky rozmaže', async () => {
    const photoText = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'data', 'photo-text.json'), 'utf8'));
    const photoMasks = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'data', 'photo-masks.json'), 'utf8'));
    const ctx = P.loadContext('vlajky');
    const flagged = (photoText.vlajky || []).map(id => ctx.byId.get(id)).filter(Boolean);
    for (const name of ['Kalifornie', 'Kansas', 'FIFA', 'Oregon', 'Wisconsin', 'Arkansas', 'Iowa']) assert.ok(flagged.some(item => item.n === name), name);
    // Obrázek otázky je u vlajek celý vidět hned: každý označený musí mít známou polohu nápisu
    assert.deepEqual(flagged.filter(item => !photoMasks[item.im]).map(item => item.n), []);
    // Nápisy, které OCR nepřečte (drobné písmo v pečeti, do oblouku), mají ruční zakrytí (scripts/photo-masks-manual.json)
    const manual = JSON.parse(fs.readFileSync(path.join(P.ROOT, 'scripts', 'photo-masks-manual.json'), 'utf8'));
    for (const [name, category] of [['Nevada', 'regiony'], ['Idaho', 'regiony'], ['Kentucky', 'regiony'], ['Jižní Dakota', 'regiony'], ['Wyoming', 'regiony'],
        ['Kostarika', 'znak'], ['Vietnam', 'znak'], ['Tchaj-pej', 'mesta'], ['UNESCO', 'uzemi']]) {
        const item = ctx.items.find(other => other.n === name && other.c === category);
        assert.ok(item && manual[item.im] && photoMasks[item.im], `${name}: ruční zakrytí`);
        assert.deepEqual(photoMasks[item.im], manual[item.im], `${name}: ruční zakrytí má přednost před nalezeným`);
    }
    for (const masks of Object.values(manual)) {
        for (const box of masks) assert.ok(box.length === 4 && box.every(v => v >= 0 && v <= 1) && box[0] + box[2] <= 1.0001 && box[1] + box[3] <= 1.0001, JSON.stringify(box));
    }
    // Vlajka, která je celá nápisem (OSCE, РСФСР, FIFA), je jen k učení: otázkou se nestane
    const learnOnly = ctx.items.filter(item => item.nq).map(item => item.n).sort((a, b) => a.localeCompare(b, 'cs'));
    assert.deepEqual(learnOnly, ['FIFA', 'Île-de-France', 'Jihoafrické rozvojové společenství', 'Organizace pro bezpečnost a spolupráci v Evropě',
        'Ruská sovětská federativní socialistická republika', 'Ukrajinská sovětská socialistická republika']);
    const rng = core.createSeededRandom('nq');
    const pool = ctx.items.filter(item => item.c === 'uzemi' || item.c === 'historie');
    for (let i = 0; i < 300; i++) assert.ok(!core.pickItem(pool, rng).nq);
    const { fileNameWords } = await import('../scripts/lib/photo-words.mjs');
    const plain = (text) => core.normalizeAnswer(text).replace(/[^a-z0-9]+/g, ' ').trim();
    assert.deepEqual(fileNameWords('Flag of California.svg', plain), ['california']);
    assert.deepEqual(fileNameWords('Emblem of Astana (latin).svg', plain), ['astana']);
});

test('popis: přídavné jméno s c → č prozradí název (cykloadice – cykloadiční), Hradec – Hradčany ne', () => {
    assert.equal(core.censorName('1,3-dipolární cykloadiční reakce.', 'Azido-alkynová Huisgenova cykloadice'), '1,3-dipolární [***] reakce.');
    assert.equal(core.censorName('Hradčany a Hradec.', 'Hradec Králové'), 'Hradčany a [***].');
});

test('popis: víceslovný region za „ve státě“ se zakryje celý (ne „[***] York“)', () => {
    assert.equal(core.censorCountry('v Lake Placid ve státě New York v USA.', 'Spojené státy americké', []), 'v Lake Placid [***] v USA.');
});
