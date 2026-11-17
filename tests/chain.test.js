// Řetězovka (chain.js): graf vazeb ze skutečných dat 14 témat a vazeb z Wikidat, řetězy dne na 60 dní (stejné pro všechny, správné vazby,
// nesprávné možnosti stejného druhu, které vazbu nesplňují a nejsou si podobné jménem, záchrana na každý článek), žádné odpovědi zadarmo
// (co plyne z dřívějších článků, návrat k uzlu, odpověď mezi možnostmi nebo v textu dřívější otázky), nejvýš dva zeměpisné skoky a nikdy
// dva po sobě, střídání oborů, rozcestníky se do týdne neopakují, původní generátor pro dny před NEW_FROM beze změny (snímek
// tests/chain-legacy-snapshot.json), zakrytí úvodu z Wikipedie, hra (body, Záchrana, přetržení), uložený stav, sdílení, dlaždice
// a vykreslení bez inline stylů. Česká slova států (z Francie, ve Francii) a soubory aplikace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Chain = require('../chain.js');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sources = Object.fromEntries(Chain.SOURCES.map(topic => [topic, JSON.parse(read(`data/${topic}.json`)).items]));
const countries = JSON.parse(read('data/countries.json')).countries;
const extra = JSON.parse(read(Chain.EXTRA_FILE));
const started = Date.now();
const graph = Chain.buildGraph(sources, countries, extra);
const graphMs = Date.now() - started;
const DAYS = Array.from({ length: 60 }, (_, i) => Chain.addDays(Chain.NEW_FROM, i));
const chains = new Map();
const chainFor = (day) => {
    if (!chains.has(day)) chains.set(day, Chain.dailyChain(graph, day));
    return chains.get(day);
};
const PRACTICE = Array.from({ length: 40 }, (_, i) => Chain.practiceChain(graph, `test-${i}`));
const node = (id) => graph.nodes.get(id);
const linked = (rel, a, x) => (graph.edges.get(rel).get(a) || []).includes(x);
const fits = (relId, a, x) => Chain.RELATION_BY_ID.get(relId).fits(node(a), node(x), graph);
const nodesOf = (chain) => [chain.start.id, ...chain.questions.map(question => question.to.id)];
const plain = (text) => ` ${core.normalizeAnswer(text)} `;
const PERSON_KINDS = new Set(['composer', 'musician', 'writer', 'artist', 'architect', 'director', 'actor', 'athlete', 'ruler', 'statesman', 'figure', 'physicist', 'astronomer', 'chemist']);

test('graf: všechny druhy uzlů a vazeb ze skutečných dat i z Wikidat, rychle', () => {
    assert.ok(graphMs < 12000, `graf za ${graphMs} ms`);
    for (const kind of ['country', 'city', 'landmark', 'peak', 'river', 'composer', 'writer', 'artist', 'architect', 'band', 'music', 'book', 'artwork', 'film', 'club', 'games',
        'actor', 'ruler', 'statesman', 'physicist', 'chemist', 'realm', 'element', 'moon', 'myth', 'gem', 'breed', 'style', 'movement', 'stadium', 'region']) {
        assert.ok((graph.byKind.get(kind) || []).length >= 10, `druh ${kind}`);
    }
    for (const rel of Chain.RELATIONS) assert.ok(graph.edges.get(rel.id).size > 0, `vazba ${rel.id}`);
    assert.ok(Chain.RELATIONS.length >= 80, `${Chain.RELATIONS.length} vazeb`);
    // Každá vazba má 1–4 znění otázky a vysvětlení, druhy uzlů hran sedí s definicí vazby
    for (const rel of Chain.RELATIONS) {
        const [from, list] = [...graph.edges.get(rel.id)][0];
        const a = node(from);
        const b = node(list[0]);
        assert.ok(rel.from.includes(a.kind) && rel.to.includes(b.kind), rel.id);
        const texts = rel.ask(a, b, graph);
        assert.ok(texts.length >= 1 && texts.length <= 4, `${rel.id}: ${texts.length} znění`);
        assert.match(rel.explain(a, b, graph), /\.$/, `${rel.id}: vysvětlení`);
    }
    // Ukázky správných vazeb
    const byName = (kind, name) => graph.byKind.get(kind).find(entry => entry.name === name);
    assert.ok(linked('landmarkCity', byName('landmark', 'Sagrada Família').id, byName('city', 'Barcelona').id));
    assert.ok(linked('workAuthor', byName('music', 'Prodaná nevěsta').id, byName('composer', 'Bedřich Smetana').id));
    assert.ok(linked('personCountry', byName('composer', 'Bedřich Smetana').id, byName('country', 'Česko').id));
    assert.ok(linked('artMuseum', byName('artwork', 'Mona Lisa').id, byName('landmark', 'Louvre').id));
    assert.ok(linked('moonPlanet', byName('moon', 'Io').id, byName('planet', 'Jupiter').id));
    assert.ok(linked('gemMineral', byName('gem', 'Rubín').id, byName('mineral', 'Korund').id));
    assert.ok(linked('mythFather', byName('myth', 'Athéna').id, byName('myth', 'Zeus').id));
    assert.ok(linked('personBorn', byName('composer', 'Bedřich Smetana').id, byName('city', 'Litomyšl').id), 'rodiště z Wikidat');
    // Název, který odpověď prozradí, vazbu nemá: Šikmá věž v Pise → Pisa, FC Bayern München → Mnichov, Německý ovčák → Německo
    const pisa = graph.byKind.get('landmark').find(entry => /Pise/.test(entry.name));
    if (pisa) assert.equal((graph.edges.get('landmarkCity').get(pisa.id) || []).length, 0);
    assert.ok(!graph.byKind.get('club').some(entry => /München|Paris|Warszawa|Zagreb|Petěrburg/.test(entry.name)), 'klub s městem v názvu');
    assert.ok(!(graph.byKind.get('breed') || []).some(entry => entry.name === 'Německý ovčák'), 'plemeno s národností v názvu');
    // Stejně pojmenovaná místa (Birmingham, Pantheon) nejsou v řetězu ani mezi možnostmi
    for (const entry of graph.nodes.values()) if (entry.shared) assert.equal((graph.incoming.get(entry.id) || []).length, 0, entry.name);
});

// Ověření jednoho řetězu: správné vazby, možnosti, záchrana, odpovědi zadarmo, zeměpisné skoky a opakování
const checkChain = (chain, where0) => {
    assert.ok(chain, `${where0}: řetěz existuje`);
    assert.equal(chain.questions.length, Chain.LINKS, where0);
    const ids = nodesOf(chain);
    assert.equal(new Set(ids).size, ids.length, `${where0}: uzly se neopakují`);
    const qids = ids.map(id => node(id).q).filter(Boolean);
    assert.equal(new Set(qids).size, qids.length, `${where0}: stejná osobnost dvakrát (jiný druh uzlu)`);
    let from = chain.start.id;
    const known = new Map();
    const learn = (thing, place) => { if (!known.has(thing)) known.set(thing, new Set()); [place, ...Chain.containersOf(graph, node(place))].forEach(id => known.get(thing).add(id)); };
    const shown = new Set();
    const texts = [plain(chain.start.name)];
    let geo = 0;
    let lastGeo = false;
    const domains = new Map();
    for (const question of chain.questions) {
        const where = `${where0} článek ${question.k} (${question.text})`;
        const a = node(question.from.id);
        const b = node(question.to.id);
        assert.equal(question.from.id, from, `${where}: navazuje na předchozí odpověď`);
        assert.ok(linked(question.rel, question.from.id, question.to.id), `${where}: vazba platí`);
        assert.equal(question.options.length, 4, where);
        assert.equal(question.options[question.answer].id, question.to.id, `${where}: správná odpověď`);
        assert.equal(new Set(question.options.map(option => core.normalizeAnswer(option.name))).size, 4, `${where}: různé názvy`);
        assert.match(question.text, /^[\p{Lu}0-9„].*\?$/u, `${where}: věta s otazníkem`);
        assert.doesNotMatch(question.text, /undefined|null|\s\s|\.\.|ve státě (?:Francie|Česko|Itálie)\b/, `${where}: text`);
        assert.ok(question.explain && /\.$/.test(question.explain) && !/undefined|null|\.\.|\s\s/.test(question.explain), `${where}: vysvětlení ${question.explain}`);
        // Bez sloves ve shodě s rodem hráče
        assert.doesNotMatch(question.text, /\b(jsi|jste|uhodl|věděl|znal)\b/iu, `${where}: rod hráče`);
        const person = PERSON_KINDS.has(b.kind);
        for (const option of question.options) {
            assert.equal(node(option.id).kind, b.kind, `${where}: stejný druh (${option.name})`);
            if (option.id === question.to.id) continue;
            assert.ok(!linked(question.rel, question.from.id, option.id) && !fits(question.rel, question.from.id, option.id), `${where}: ${option.name} vazbu nesplňuje`);
            assert.ok(!ids.slice(0, question.k + 1).includes(option.id), `${where}: ${option.name} není dřívější článek řetězu`);
        }
        // Nesprávné možnosti nejsou jen jiným jménem téže věci (stejný výrazný kmen, jedno jméno součástí druhého)
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
            const [x, y] = [question.options[i].name, question.options[j].name];
            assert.ok(!core.isNamePart(x, y) && !core.sameNameStem(x, y, { person }), `${where}: podobná jména ${x} – ${y}`);
        }
        // Odpověď zadarmo: plyne z dřívějších článků, byla mezi možnostmi nebo v textu dřívější otázky
        assert.ok(!(known.get(a.id) || new Set()).has(b.id), `${where}: ${b.name} plyne z dřívějších článků`);
        assert.ok(!shown.has(b.id), `${where}: ${b.name} byla mezi možnostmi dřívější otázky`);
        assert.ok(plain(b.name).length < 6 || !texts.some(text => text.includes(plain(b.name))), `${where}: ${b.name} stojí v textu dřívější otázky`);
        // Zeměpisné skoky: nejvýš dva, nikdy dva po sobě
        const isGeo = Chain.GEO_KINDS.has(b.kind);
        assert.ok(!(isGeo && lastGeo), `${where}: dva zeměpisné skoky po sobě`);
        if (isGeo) geo += 1;
        lastGeo = isGeo;
        domains.set(question.domain, (domains.get(question.domain) || 0) + 1);
        if (Chain.containersOf(graph, a).includes(b.id)) learn(a.id, b.id);
        if (Chain.containersOf(graph, b).includes(a.id)) learn(b.id, a.id);
        question.options.forEach(option => shown.add(option.id));
        texts.push(plain(question.text), plain(question.explain));
        // Záchrana: jiná otázka na stejný článek
        const rescue = question.rescue;
        assert.ok(rescue && rescue.text && rescue.text !== question.text, `${where}: záchrana`);
        assert.ok(!ids.slice(0, question.k + 1).includes(rescue.from.id) || (!rescue.same && rescue.from.id === question.from.id), `${where}: záchrana není z řetězu`);
        assert.notEqual(rescue.from.id, ids[question.k + 1], `${where}: záchrana neprozradí další článek`);
        if (rescue.same) {
            assert.ok(linked(rescue.rel, rescue.from.id, question.to.id), `${where}: záchrana vede na stejnou odpověď`);
            assert.ok(rescue.keep.length >= 2, `${where}: záchrana si nechá aspoň dvě původní nesprávné možnosti`);
            for (const wrong of [...rescue.keep, ...rescue.extra.map(option => option.id)]) {
                assert.ok(!linked(rescue.rel, rescue.from.id, wrong) && !fits(rescue.rel, rescue.from.id, wrong), `${where}: záchrana ${node(wrong).name}`);
                assert.ok(!ids.slice(0, question.k + 2).includes(wrong), `${where}: záchrana neprozradí článek`);
            }
            for (const option of question.options.filter(entry => entry.id !== question.to.id)) {
                const shownRescue = Chain.rescueOptions(question, option.id, 'test');
                assert.equal(shownRescue.options.length, 4);
                assert.equal(shownRescue.options[shownRescue.answer].id, question.to.id);
                assert.ok(!shownRescue.options.some(entry => entry.id === option.id), `${where}: zvolená špatná odpověď v záchraně není`);
            }
        } else {
            assert.equal(rescue.from.id, question.from.id);
            assert.ok(linked(rescue.rel, rescue.from.id, rescue.to.id) && rescue.options[rescue.answer].id === rescue.to.id, `${where}: jiná záchrana platí`);
            assert.ok(!ids.slice(0, question.k + 2).includes(rescue.to.id), `${where}: záchrana nevede na článek řetězu`);
        }
        from = question.to.id;
    }
    assert.ok(geo <= Chain.MAX_GEO, `${where0}: ${geo} zeměpisných skoků`);
    const kinds = new Map();
    ids.forEach(id => kinds.set(node(id).kind, (kinds.get(node(id).kind) || 0) + 1));
    for (const [kind, count] of kinds) assert.ok(count <= (Chain.KIND_MAX[kind] || 2) + (kind === node(chain.start.id).kind ? 1 : 0), `${where0}: ${count}× ${kind}`);
    assert.ok(domains.size >= 2, `${where0}: obory ${[...domains.keys()].join(', ')}`);
    return { domains: domains.size };
};

test('řetěz dne na 60 dní od NEW_FROM: stejný pro všechny, správné vazby, možnosti, záchrana, bez odpovědí zadarmo a s nejvýš dvěma zeměpisnými skoky', () => {
    let domainSum = 0;
    for (const day of DAYS) {
        const begun = Date.now();
        const chain = chainFor(day);
        assert.ok(Date.now() - begun < 20000, `${day}: výpočet ${Date.now() - begun} ms`);
        assert.equal(chain.v, 2, `${day}: nový generátor`);
        domainSum += checkChain(chain, day).domains;
    }
    // (od 17. 11. 2026 nejsou geologické věky mezi známými uzly a jeden den z 60 má jen dva obory: průměr 2,98)
    assert.ok(domainSum / DAYS.length >= 2.95, `průměrně ${domainSum / DAYS.length} oborů v řetězu`);
    // Stejně pro všechny: výpočet znovu (nový graf) dá stejný řetěz
    const again = Chain.buildGraph(sources, countries, extra);
    assert.deepEqual(Chain.dailyChain(again, DAYS[0]), chainFor(DAYS[0]));
    assert.deepEqual(Chain.dailyChain(again, DAYS[17]), chainFor(DAYS[17]));
});

test('cvičná řetězovka: 40 náhodných řetězů se 7 články bez odpovědí zadarmo, pokaždé jiný, ze stejného semínka stejný', () => {
    PRACTICE.forEach((chain, i) => checkChain(chain, `cvičná ${i}`));
    assert.notDeepEqual(nodesOf(PRACTICE[0]), nodesOf(PRACTICE[1]));
    assert.deepEqual(Chain.practiceChain(graph, 'test-0'), PRACTICE[0]);
});

test('odpověď zadarmo ze screenshotu (stavba v Londýně → ve kterém státě) ani návrat k uzlu se nesestaví', () => {
    // Po zeměpisné odpovědi nikdy další zeměpisná (Londýn → Spojené království) a nikdy zpět na předchozí uzel
    for (const chain of [...DAYS.map(chainFor), ...PRACTICE]) {
        chain.questions.forEach((question, i) => {
            const next = chain.questions[i + 1];
            if (!next) return;
            assert.ok(!(Chain.GEO_KINDS.has(question.to.kind) && Chain.GEO_KINDS.has(next.to.kind)), `${chain.seed}: ${question.text} → ${next.text}`);
            assert.notEqual(next.to.id, question.from.id, `${chain.seed}: zpět na ${question.from.name}`);
        });
    }
});

test('řetěz dne: rozcestníky (Francie, Londýn, Louvre) se do týdne neopakují, dny po sobě se liší, obory a vazby se střídají', () => {
    const uses = new Map();
    const rels = new Set();
    const domains = new Set();
    let overlap = 0;
    // Velké rozcestníky (aspoň 20 vazeb) hlídají i volnější úrovně hledání (loose), jen nouzová ne
    const strict = (entry) => Chain.LEVELS[entry.level].hubs !== 'any';
    DAYS.forEach((day, i) => {
        const chain = chainFor(day);
        const ids = nodesOf(chain);
        ids.forEach(id => uses.set(id, (uses.get(id) || 0) + 1));
        chain.questions.forEach(question => { rels.add(question.rel); domains.add(question.domain); });
        if (i) {
            const shared = ids.filter(id => nodesOf(chainFor(DAYS[i - 1])).includes(id)).length;
            assert.ok(shared <= 3, `${day}: se včerejškem sdílí ${shared} uzlů`);
            overlap += shared;
            assert.notEqual(chain.start.id, chainFor(DAYS[i - 1]).start.id, `${day}: jiný začátek`);
        }
        // Velký rozcestník je v řetězu dne jen ve svůj den (jeden z osmi): do 7 dní se neopakuje
        if (!strict(chain)) return;
        for (const id of ids.filter(entry => Chain.hubPeriod(node(entry)) === 8 && (node(entry).degree || 0) >= 20)) {
            for (const before of DAYS.slice(Math.max(0, i - 7), i).map(chainFor).filter(strict)) assert.ok(!nodesOf(before).includes(id), `${day}: rozcestník ${node(id).name} i ${before.seed}`);
        }
    });
    assert.ok(overlap / (DAYS.length - 1) < 0.3, `průměrně sdílí ${overlap / (DAYS.length - 1)}`);
    assert.ok(DAYS.filter(day => strict(chainFor(day))).length >= DAYS.length * 0.95, 'nouzová úroveň nejvýš ve 5 % dní');
    assert.ok(DAYS.filter(day => Chain.LEVELS[chainFor(day).level].hubs === 'strict').length >= DAYS.length * 0.4, 'aspoň 40 % dní s přísným střídáním všech rozcestníků');
    assert.ok(uses.size > 200, `různých uzlů ${uses.size}`);
    assert.ok(rels.size >= 40, `různých vazeb ${rels.size}`);
    assert.ok(domains.size >= 9, `oborů ${[...domains].join(', ')}`);
    // Žádný uzel (ani Londýn či Francie) není ve víc než pětině řetězů (velký rozcestník má svůj den jednou za osm dní; původní generátor
    // měl Spojené království ve 42 % a Londýn ve 35 % řetězů)
    for (const [id, count] of uses) assert.ok(count <= DAYS.length / 5, `${node(id).name} v ${count} řetězech`);
});

test('dny před NEW_FROM: původní generátor beze změny (snímek), nový od NEW_FROM', () => {
    const snapshot = JSON.parse(read('tests/chain-legacy-snapshot.json'));
    const old = Chain.legacy();
    const oldSources = Object.fromEntries(old.SOURCES.map(topic => [topic, sources[topic]]));
    assert.equal(Chain.NEW_FROM, '2026-11-15');
    assert.ok(Chain.isLegacyDay('2026-11-14') && !Chain.isLegacyDay('2026-11-15') && !Chain.isLegacyDay('2027-01-01'));
    for (const [day, chain] of Object.entries(snapshot.full)) assert.deepEqual(JSON.parse(JSON.stringify(Chain.legacyDailyChain(oldSources, countries, day))), chain, day);
    for (const [day, hash] of Object.entries(snapshot.hashes)) assert.equal(crypto.createHash('sha256').update(JSON.stringify(Chain.legacyDailyChain(oldSources, countries, day))).digest('hex'), hash, day);
    // Uložený pokus starého dne (bez nových údajů) se načte a vykreslí
    const attempt = Chain.newAttempt('2026-11-14', 'host', snapshot.full['2026-11-14']);
    const state = Chain.parseState(JSON.parse(JSON.stringify({ attempt })));
    assert.deepEqual(state.attempt.chain.questions.map(question => question.to.id), snapshot.full['2026-11-14'].questions.map(question => question.to.id));
    assert.match(Chain.playHtml({ attempt: state.attempt, ask: Chain.currentAsk(state.attempt), phase: 'ask' }), /data-chain-text/);
    assert.ok(!state.attempt.chain.questions[0].explain, 'starý řetěz bez vysvětlení');
    // Nový řetěz se uloží i s vysvětlením, zněním a QID podmětu
    const fresh = Chain.parseState(JSON.parse(JSON.stringify({ attempt: Chain.newAttempt(DAYS[0], 'host', chainFor(DAYS[0])) })));
    assert.equal(fresh.attempt.chain.questions[0].explain, chainFor(DAYS[0]).questions[0].explain);
    assert.equal(fresh.attempt.chain.questions[0].from.q, chainFor(DAYS[0]).questions[0].from.q);
    assert.equal(fresh.attempt.chain.v, 2);
});

test('úvod o předchozí odpovědi: odpověď, její tvary, národnost, obaly místa a pozdější články se zakryjí; jinak se úvod nepoužije', () => {
    const tower = { text: 'Ve kterém státě stojí mrakodrap 30 St Mary Axe?', from: { name: '30 St Mary Axe' }, answer: 0, mask: ['Londýn', 'Spojené království'],
        options: [{ name: 'Spojené království' }, { name: 'Belgie' }, { name: 'Dánsko' }, { name: 'Portugalsko' }] };
    const towerText = Chain.subjectText('30 St Mary Axe je britský mrakodrap v Londýně ve Spojeném království. Byl dokončen v roce 2003 podle návrhu Normana Fostera.', tower, ['Norman Foster']);
    assert.ok(towerText.startsWith('30 St Mary Axe je'), towerText);
    assert.doesNotMatch(towerText, /Londýn|Spojen|britsk|Foster|Belgi|Dánsk/i, towerText);
    assert.match(towerText, /\[\*\*\*\]/);
    const mozart = { text: 'Ve kterém městě se narodil Wolfgang Amadeus Mozart?', from: { name: 'Wolfgang Amadeus Mozart' }, answer: 1, mask: ['Salcburk', 'Rakousko'],
        options: [{ name: 'Vídeň' }, { name: 'Salcburk' }, { name: 'Linec' }, { name: 'Mnichov' }] };
    const mozartText = Chain.subjectText('Wolfgang Amadeus Mozart byl rakouský hudební skladatel a klavírní virtuos. Narodil se v Salcburku, zemřel ve Vídni.', mozart);
    assert.doesNotMatch(mozartText, /Salcbur|Vídn|rakousk/i, mozartText);
    assert.deepEqual(core.answerWordsLeft(mozartText, mozart.options.map((option, i) => ({ label: option.name, correct: i === mozart.answer }))), []);
    // Úvod, který je po zakrytí skoro celý zakrytý, se nepoužije
    assert.equal(Chain.subjectText('Salcburk, Vídeň, Linec.', mozart), '');
    assert.equal(Chain.subjectText('', mozart), '');
    // Úvod nejvýš dvě věty
    assert.equal(Chain.subjectText('První věta o něčem. Druhá věta o něčem. Třetí věta.', { ...mozart, mask: [] }), 'První věta o něčem. Druhá věta o něčem.');
    // Skutečné otázky řetězů: popis z dat (náhrada za Wikipedii) nikdy neprozradí odpověď ani pozdější články
    const item = (brief) => (sources[brief.topic] || []).find(entry => entry.q === brief.q);
    let used = 0;
    for (const chain of DAYS.slice(0, 30).map(chainFor)) {
        chain.questions.forEach((question, i) => {
            const source = item(question.from);
            if (!source || !source.d) return;
            const later = chain.questions.slice(i + 1).map(entry => entry.to.name);
            const text = Chain.subjectText(`${source.n} je ${source.d}.`, question, later);
            if (!text) return;
            used += 1;
            const choices = question.options.map((option, index) => ({ label: option.name, correct: index === question.answer }));
            assert.deepEqual(core.answerWordsLeft(text, choices), [], `${question.text}: ${text}`);
            assert.ok(!text.includes(question.to.name), `${question.text}: ${text}`);
            for (const name of later) if (name.length >= 5) assert.ok(!text.includes(name), `${question.text}: ${text} (pozdější ${name})`);
        });
    }
    assert.ok(used >= 50, `použitých popisů ${used}`);
});

test('české tvary států: z/ze, v/ve/na a 2. pád; národnosti v popisu', () => {
    const names = new Set(sources.zemepis.filter(item => item.c === 'stat').map(item => item.n));
    for (const [name, [from, inside]] of Object.entries(Chain.COUNTRY_WORDS)) {
        assert.ok(names.has(name), `${name} je stát v datech`);
        assert.match(from, /^(z|ze) \p{Lu}/u, name);
        assert.match(inside, /^(v|ve|na) \p{Lu}/u, name);
        // „ze“ před s, z, š, ž (ze Švédska, ze Srbska), jinak „z“
        assert.equal(from.startsWith('ze '), /^[SZŠŽ]/u.test(from.slice(from.indexOf(' ') + 1)), `${name}: ${from}`);
    }
    assert.equal(Chain.fromCountry('Francie'), 'z Francie');
    assert.equal(Chain.inCountry('Slovensko'), 'na Slovensku');
    assert.equal(Chain.ofCountry('Spojené království'), 'Spojeného království');
    assert.equal(Chain.ofCountry('Tuvalu'), 'státu Tuvalu');
    assert.equal(Chain.inCountry('Tuvalu'), 've státě Tuvalu');
    assert.deepEqual(Chain.nationalitiesIn('český a rakouský dirigent a hudební skladatel').sort(), ['Rakousko', 'Česko'].sort());
    assert.deepEqual(Chain.nationalitiesIn('běloruský malíř'), ['Bělorusko'], 'běloruský není ruský');
});

// Malý řetěz do testů hry: A → N1 → … → N7, správná odpověď vždy první
const tiny = () => ({
    seed: 'test', start: { id: 'n0', name: 'Start', kind: 'city', topic: 'zemepis' },
    questions: Array.from({ length: 7 }, (_, i) => ({
        k: i + 1, rel: 'capital', from: { id: `n${i}`, name: `Uzel ${i}`, kind: 'city', topic: 'zemepis' }, to: { id: `n${i + 1}`, name: `Uzel ${i + 1}`, kind: 'city', topic: 'zemepis' },
        text: `Otázka ${i + 1}?`, options: [{ id: `n${i + 1}`, name: `Uzel ${i + 1}` }, { id: `x${i}a`, name: 'A' }, { id: `x${i}b`, name: 'B' }, { id: `x${i}c`, name: 'C' }], answer: 0,
        rescue: { same: true, rel: 'capital', from: { id: `r${i}`, name: `Záchrana ${i}`, kind: 'city', topic: 'zemepis' }, text: `Záchrana ${i + 1}?`, keep: [`x${i}a`, `x${i}b`, `x${i}c`], extra: [{ id: `y${i}a`, name: 'D' }, { id: `y${i}b`, name: 'E' }, { id: `y${i}c`, name: 'F' }] }
    }))
});
const right = (attempt) => { const ask = Chain.currentAsk(attempt); return (ask.rescue || ask.question).options[(ask.rescue || ask.question).answer].id; };

test('hra: článek k dává k bodů, celý řetěz 28; Záchrana jednou (0 bodů), druhá chyba přetrhne', () => {
    let attempt = Chain.newAttempt('2026-11-12', 'host', tiny());
    for (let k = 1; k <= 7; k++) {
        assert.equal(Chain.nextLink(attempt), k);
        const result = Chain.answer(attempt, right(attempt));
        assert.equal(result.outcome, 'right');
        attempt = result.attempt;
    }
    assert.deepEqual(Chain.summaryOf(attempt), { links: 7, score: 28, rescued: false, extra: false, full: true, done: true });
    assert.equal(Chain.nextLink(attempt), -1);
    assert.deepEqual(Chain.xpFor(Chain.summaryOf(attempt)), { total: 66, parts: [{ label: 'za body v Řetězovce dne', xp: 56 }, { label: 'za celý řetěz', xp: 10 }] });
    assert.ok(Chain.validSummary(Chain.summaryOf(attempt)));

    // Chyba na 3. článku → rozhodnutí; Záchrana → jiná otázka (bez zvolené špatné odpovědi), správně → článek za 0 bodů
    attempt = Chain.newAttempt('2026-11-12', 'host', tiny());
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    let step = Chain.answer(attempt, 'x2a');
    assert.equal(step.outcome, 'decide');
    attempt = step.attempt;
    assert.equal(Chain.answer(attempt, right(attempt)).outcome, null, 'bez rozhodnutí se neodpovídá');
    attempt = Chain.useRescue(attempt);
    const ask = Chain.currentAsk(attempt);
    assert.equal(ask.rescue.text, 'Záchrana 3?');
    assert.ok(!ask.rescue.options.some(option => option.id === 'x2a'));
    step = Chain.answer(attempt, right(attempt));
    assert.equal(step.outcome, 'saved');
    attempt = step.attempt;
    assert.deepEqual(Chain.summaryOf(attempt), { links: 3, score: 3, rescued: true, extra: false, full: false, done: false });
    // Druhá chyba: Záchrana už není, řetěz se přetrhne
    step = Chain.answer(attempt, 'x3b');
    assert.equal(step.outcome, 'broken');
    assert.deepEqual(Chain.summaryOf(step.attempt), { links: 3, score: 3, rescued: true, extra: false, full: false, done: true });
    assert.ok(Chain.validSummary(Chain.summaryOf(step.attempt)));
    assert.equal(Chain.shareGrid(step.attempt.results), '🔗🔗🛟💥');

    // Ukončit řetěz místo Záchrany; Záchrana, která nevyšla
    let stopped = Chain.answer(Chain.newAttempt('2026-11-12', 'host', tiny()), 'x0c').attempt;
    stopped = Chain.giveUp(stopped);
    assert.deepEqual(Chain.summaryOf(stopped), { links: 0, score: 0, rescued: false, extra: false, full: false, done: true });
    let lost = Chain.useRescue(Chain.answer(Chain.newAttempt('2026-11-12', 'host', tiny()), 'x0c').attempt);
    const wrongRescue = Chain.currentAsk(lost).rescue.options.find(option => option.id !== right(lost)).id;
    const outcome = Chain.answer(lost, wrongRescue);
    assert.equal(outcome.outcome, 'lost');
    assert.deepEqual(Chain.summaryOf(outcome.attempt), { links: 0, score: 0, rescued: true, extra: false, full: false, done: true });
});

test('Záchrana navíc (pomůcka, blok 37): až po použité Záchraně, jednou za hru, ne v cvičné; zachráněný článek za 0 bodů', () => {
    const wrong = (attempt) => { const ask = Chain.currentAsk(attempt); return (ask.rescue || ask.question).options.find(option => option.id !== right(attempt)).id; };
    // Bez Záchrany navíc druhá chyba přetrhne (i s pomůckou, dokud je Záchrana nepoužitá, nabídne se nejdřív ona)
    let attempt = Chain.newAttempt('2026-11-12', 'u-1', tiny());
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    let step = Chain.answer(attempt, wrong(attempt), { extra: true });
    assert.deepEqual([step.outcome, step.attempt.pending.extra], ['decide', undefined], 'nejdřív běžná Záchrana');
    attempt = Chain.useRescue(step.attempt);
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    assert.equal(Chain.answer(attempt, wrong(attempt)).outcome, 'broken', 'bez pomůcky se přetrhne');
    // S pomůckou: nabídka Záchrany navíc, záchranná otázka 4. článku a článek za 0 bodů
    step = Chain.answer(attempt, wrong(attempt), { extra: true });
    assert.equal(step.outcome, 'decide');
    assert.deepEqual(step.attempt.pending, { k: 4, chosen: step.attempt.pending.chosen, phase: 'decide', extra: true });
    assert.equal(Chain.giveUp(step.attempt).done, true, 'Ukončit jde i tady');
    attempt = Chain.useRescue(step.attempt);
    assert.deepEqual([attempt.extraUsed, attempt.pending.phase, Chain.currentAsk(attempt).rescue.text], [true, 'rescue', 'Záchrana 4?']);
    step = Chain.answer(attempt, right(attempt));
    assert.equal(step.outcome, 'saved');
    attempt = step.attempt;
    assert.deepEqual(attempt.results.map(row => [row.k, row.rescued, Boolean(row.extra), row.points]), [[1, false, false, 1], [2, true, false, 0], [3, false, false, 3], [4, true, true, 0]]);
    const summary = Chain.summaryOf(attempt);
    assert.deepEqual(summary, { links: 4, score: 4, rescued: true, extra: true, full: false, done: false });
    assert.ok(Chain.validSummary(summary));
    assert.equal(Chain.validSummary({ ...summary, extra: false }), false, 'bez Záchrany navíc by server body nepřijal');
    // Třetí chyba: už nic, ani s pomůckou
    step = Chain.answer(attempt, wrong(attempt), { extra: true });
    assert.equal(step.outcome, 'broken');
    assert.equal(Chain.shareGrid(step.attempt.results), '🔗🛟🔗🛟💥');
    assert.equal(Chain.cardInput({ day: '2026-11-12', attempt: step.attempt, robe: 'zelena', url: 'u', appName: 'M' }).detail, '4/7 článků · se dvěma Záchranami');
    // Záchrana navíc, která nevyšla
    let first = Chain.useRescue(Chain.answer(Chain.newAttempt('2026-11-12', 'u-1', tiny()), 'x0a').attempt);
    first = Chain.answer(first, right(first)).attempt;
    const lost = Chain.answer(Chain.useRescue(Chain.answer(first, 'x1a', { extra: true }).attempt), 'y1a');
    assert.equal(lost.outcome, 'lost');
    assert.deepEqual(lost.attempt.results.map(row => [row.k, row.correct, row.rescued, Boolean(row.extra)]), [[1, true, true, false], [2, false, true, true]]);
    assert.ok(Chain.validSummary(Chain.summaryOf(lost.attempt)));
    // Cvičná řetězovka pomůcku nepoužívá
    let practice = Chain.useRescue(Chain.answer(Chain.newAttempt('2026-11-12', 'host', tiny(), true), 'x0a').attempt);
    practice = Chain.answer(practice, right(practice)).attempt;
    assert.equal(Chain.answer(practice, 'x1a', { extra: true }).outcome, 'broken');

    // Uložený stav: nabídka i rozehraná otázka Záchrany navíc přežijí, podvržený třetí zachráněný článek ne
    const offered = Chain.parseState(JSON.parse(JSON.stringify({ attempt: Chain.answer(attempt, wrong(attempt), { extra: false }).attempt }))).attempt;
    assert.equal(offered.done, true);
    const before = Chain.answer(Chain.useRescue(Chain.answer(Chain.newAttempt('2026-11-12', 'u-1', tiny()), 'x0a').attempt), 'n1').attempt;
    const pendingExtra = Chain.answer(before, 'x1a', { extra: true }).attempt;
    assert.deepEqual(Chain.parseState(JSON.parse(JSON.stringify({ attempt: pendingExtra }))).attempt.pending, { k: 2, chosen: 'x1a', phase: 'decide', extra: true });
    const inRescue = Chain.parseState(JSON.parse(JSON.stringify({ attempt: Chain.useRescue(pendingExtra) }))).attempt;
    assert.deepEqual([inRescue.extraUsed, inRescue.pending.phase, inRescue.pending.extra], [true, 'rescue', true]);
    assert.equal(Chain.parseState({ attempt: { ...pendingExtra, extraUsed: true } }).attempt.pending, null, 'použitá pomůcka se nenabídne znovu');
    assert.equal(Chain.parseState({ attempt: { ...pendingExtra, rescueUsed: false, results: [{ k: 1, correct: true, rescued: false }] } }).attempt.pending, null, 'Záchrana navíc ne před Záchranou');
    const saved = Chain.parseState(JSON.parse(JSON.stringify({ attempt }))).attempt;
    assert.deepEqual([saved.rescueUsed, saved.extraUsed, saved.results[3].extra, Chain.summaryOf(saved).score], [true, true, true, 4]);
    const forged = Chain.parseState({ attempt: { ...attempt, results: [...attempt.results, { k: 5, correct: true, rescued: true }] } }).attempt;
    assert.equal(forged.results.length, 4, 'třetí zachráněný článek ne');

    // Vykreslení: štítek Záchrany (+1, po použité Záchraně Záchrana navíc), panel s nabídkou, výsledek a okno článku
    const fresh = Chain.newAttempt('2026-11-12', 'u-1', tiny());
    assert.match(Chain.playHtml({ attempt: fresh, ask: Chain.currentAsk(fresh), phase: 'ask', extraReady: true }), /data-chain-rescue="ready" data-chain-extra="ready"[\s\S]*?\+1<\/span><span class="sr-only"> a Záchrana navíc/);
    assert.doesNotMatch(Chain.playHtml({ attempt: fresh, ask: Chain.currentAsk(fresh), phase: 'ask' }), /data-chain-extra/);
    assert.match(Chain.playHtml({ attempt: before, ask: Chain.currentAsk(before), phase: 'ask', extraReady: true }), /data-chain-rescue="extra"[^>]*><i data-lucide="shield-plus"[^>]*><\/i> Záchrana navíc/);
    assert.match(Chain.playHtml({ attempt: before, ask: Chain.currentAsk(before), phase: 'ask' }), /data-chain-rescue="used"/);
    const extraAsk = Chain.useRescue(pendingExtra);
    assert.match(Chain.playHtml({ attempt: extraAsk, ask: Chain.currentAsk(extraAsk), phase: 'ask' }), /Záchrana navíc · za 0 bodů/);
    const panel = Chain.decideHtml({ chosenName: 'A', extra: true, seal: '<span class="cq-item-seal"></span>' });
    assert.match(panel, /data-chain-decide data-chain-decide-extra[\s\S]*Záchrana už je použitá, máš ale pomůcku Záchrana navíc[\s\S]*data-chain-extra-use[^>]*><span class="cq-item-seal"><\/span> Použít Záchranu navíc[\s\S]*Ukončit řetěz/);
    assert.match(Chain.decideHtml({ chosenName: 'A', extra: true }), /Správnou odpověď uvidíš po Záchraně navíc, nebo když řetěz ukončíš\./);
    assert.match(Chain.decideHtml({ chosenName: 'A', extra: true, correctName: 'B' }), /Správně bylo: <b data-chain-correct[^>]*>B<\/b>\./);
    assert.match(Chain.resultHtml({ attempt: step.attempt, guest: true }, { uiArt: () => '', xpLine: () => '' }), /4\/7 článků · se dvěma Záchranami[\s\S]*4\. článek: Uzel 4, Záchrana navíc/);
    assert.match(Chain.stepHtml(step.attempt, 4), /Zachráněno Záchranou navíc, za 0 bodů\./);
    assert.match(Chain.stepHtml(step.attempt, 2), /Zachráněno Záchranou, za 0 bodů\./);
    assert.match(Chain.stepHtml(lost.attempt, 2), /Záchrana navíc nevyšla, tady se řetěz přetrhl\./);
    // Dlaždice: má-li hráč pomůcku, u nedohrané hry „Záchrana navíc ✓“
    assert.equal(Chain.homeTile({ status: 'new', extra: true }).text, '7 článků · Záchrana navíc ✓');
    assert.match(Chain.homeTile({ status: 'progress', step: 3, extra: true }).label, /, máš Záchranu navíc$/);
    assert.equal(Chain.homeTile({ status: 'done', summary: { links: 5, score: 15 }, extra: true }).text, '15 bodů · 5/7');
    // Zprávy o zisku (conquest.js ITEMS, grantNews): nová pomůcka i s milníkem, plná zásoba propadne
    const C = require('../conquest.js');
    assert.deepEqual([C.ITEMS.chain_rescue.name, C.ITEMS.chain_rescue.max, C.ITEMS.chain_rescue.icon], ['Záchrana navíc', 1, 'shield-plus']);
    assert.ok(!C.ITEM_IDS.includes('chain_rescue'), 'pruh Pomůcky v Dobývání ji nemá');
    assert.deepEqual(C.grantNews({ kind: 'chain_rescue', granted: true, count: 1 }), { kind: 'new', title: 'Nová pomůcka: Záchrana navíc', text: 'V Řetězovce dne zachrání řetěz ještě jednou, když už je Záchrana použitá.' });
    assert.match(C.grantNews({ kind: 'chain_rescue', granted: true, count: 1, source: 'chain-days', at: 10 }).text, /^Za 10 dohraných Řetězovek dne\. /);
    assert.match(C.grantNews({ kind: 'chain_rescue', granted: true, count: 1, source: 'chain-clean', at: 5 }).text, /^Za 5 celých řetězů bez Záchrany\. /);
    assert.deepEqual(C.grantNews({ kind: 'chain_rescue', granted: false, full: true, count: 1 }), { kind: 'full', text: 'Záchranu navíc už máš. Víc než jednu mít nejde, tahle propadla.' });
    assert.deepEqual(C.grantNews({ kind: 'chain_rescue', granted: true, already: true }), { kind: null });
    // Okno Pomůcky v rozcestníku: Záchrana navíc krátkým řádkem, jen když ji databáze zná; ve hře ne
    assert.match(C.itemsDialogHtml({ extra_move: 0, fifty: 1, chain_rescue: 1 }), /data-cq-item-card="chain_rescue"[\s\S]*Záchrana navíc[\s\S]*Do Řetězovky dne[\s\S]*1\/1/);
    assert.doesNotMatch(C.itemsDialogHtml({ extra_move: 0, fifty: 1 }), /chain_rescue/);
    assert.doesNotMatch(C.itemsDialogHtml({ extra_move: 0, fifty: 1, chain_rescue: 1 }, { game: true }), /chain_rescue/);
    assert.match(C.itemSealHtml('chain_rescue', 'h-8 w-8'), /cq-item-seal cq-item-chain_rescue[\s\S]*data-lucide="shield-plus"[\s\S]*\+1/);
});

test('uložený stav: pokus se vyčistí (nesmysly pryč, body se přepočítají), cache řetězu dne a historie', () => {
    let attempt = Chain.newAttempt('2026-11-12', 'u-1', tiny());
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    attempt = Chain.answer(attempt, 'x1b').attempt;
    const state = Chain.parseState(JSON.parse(JSON.stringify({ intro: true, attempt, days: { '2026-11-11': { links: 9, score: 99, xp: true }, bad: {} }, cache: { day: '2026-11-12', chain: tiny() } })));
    assert.equal(state.intro, true);
    assert.deepEqual(state.days, { '2026-11-11': { links: 7, score: 28, rescued: false, xp: true } });
    assert.deepEqual(state.attempt.pending, { k: 2, chosen: 'x1b', phase: 'decide' });
    assert.equal(state.attempt.owner, 'u-1');
    assert.equal(state.cache.day, '2026-11-12');
    // Podvržené body se nepřevezmou, výsledek po přetržení se dál neprodlužuje
    const forged = Chain.parseState({ attempt: { ...attempt, pending: null, results: [{ k: 1, correct: true, points: 50 }, { k: 2, correct: false }, { k: 3, correct: true }] } });
    assert.deepEqual(forged.attempt.results.map(row => [row.k, row.correct, row.points]), [[1, true, 1], [2, false, 0]]);
    assert.equal(forged.attempt.done, true);
    assert.equal(Chain.parseState({ attempt: { day: '2026-11-12', chain: { questions: [] } } }).attempt, null);
    assert.equal(Chain.parseState(null).attempt, null);
});

test('sdílení textem a obrázkem, dlaždice na úvodu', () => {
    let attempt = Chain.newAttempt('2026-11-12', 'host', tiny());
    for (let k = 1; k <= 4; k++) attempt = Chain.answer(attempt, right(attempt)).attempt;
    attempt = Chain.giveUp(Chain.answer(attempt, 'x4a').attempt);
    assert.equal(Chain.shareText({ appName: 'Mudrlant', day: '2026-11-12', attempt, url: 'https://x.test/' }), 'Mudrlant · Řetězovka 12. 11. 🔗🔗🔗🔗💥 · 10 bodů · https://x.test/');
    const card = Chain.cardInput({ day: '2026-11-12', attempt, rank: { rank: 3, players: 41 }, robe: 'zelena', url: 'u', appName: 'Mudrlant' });
    assert.deepEqual([card.kicker, card.headline, card.detail, card.note, card.pose], ['Řetězovka dne', '10 bodů', '4/7 článků', '3. místo z 41', 'radost']);
    assert.deepEqual(card.grid, [true, true, true, true, false, null, null]);
    assert.deepEqual(Chain.homeTile({ status: 'new' }), { text: '7 článků', fresh: true, label: 'Řetězovka dne: 7 článků, odpověď je začátkem další otázky' });
    assert.equal(Chain.homeTile({ status: 'progress', step: 4 }).text, 'Článek 4/7');
    assert.equal(Chain.homeTile({ status: 'done', summary: { links: 5, score: 18 }, rank: 3 }).text, '18 bodů · 3.');
    assert.equal(Chain.homeTile({ status: 'done', summary: { links: 5, score: 15 } }).text, '15 bodů · 5/7');
    for (const tile of [Chain.homeTile({ status: 'new' }), Chain.homeTile({ status: 'done', summary: { links: 7, score: 28 }, rank: 12 })]) assert.ok(tile.text.length <= 14, tile.text);
});

test('vykreslení: bez inline stylů a skriptů, ikony z icons.js, obrázky existují, texty bez rodu hráče', () => {
    const h = { uiArt: (name, cls) => `<img src="icons/topics/${name}.webp" alt="" class="${cls}">`, xpLine: () => '<div>XP</div>', avatarHtml: () => '<span>🦊</span>' };
    let attempt = Chain.newAttempt(DAYS[0], 'host', chainFor(DAYS[0]));
    const play = Chain.playHtml({ attempt, ask: Chain.currentAsk(attempt), phase: 'ask' }, h);
    const pages = [];
    // Karta s fotkou a úvodem předchozí odpovědi a po odpovědi s vysvětlením vazby (místo úvodu)
    const ask = Chain.currentAsk(attempt);
    const withSubject = Chain.playHtml({ attempt, ask, phase: 'ask', subject: { image: 'https://upload.wikimedia.org/x.jpg', text: 'Úvod o [***] stavbě.' } }, h);
    assert.match(withSubject, /data-chain-subject[\s\S]*<img data-chain-photo src="https:\/\/upload\.wikimedia\.org\/x\.jpg" alt="[^"]+"[\s\S]*data-chain-intro[^>]*>Úvod o \[\*\*\*\] stavbě\./);
    const explained = Chain.playHtml({ attempt, ask, phase: 'right', explain: true, subject: { image: '', text: 'Úvod.' } }, h);
    const escaped = ask.question.explain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    assert.ok(explained.includes(escaped) && /data-chain-explain/.test(explained) && !/data-chain-intro/.test(explained));
    assert.doesNotMatch(Chain.playHtml({ attempt, ask, phase: 'ask' }, h), /data-chain-subject/, 'bez sítě bez prázdného rámečku');
    assert.match(Chain.brokenHtml({ correctName: 'Y', k: 2, explain: 'Vysvětlení.' }), /data-chain-explain[^>]*>Vysvětlení\./);
    pages.push(withSubject, explained);
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    attempt = Chain.giveUp(Chain.answer(attempt, Chain.currentAsk(attempt).question.options.find(option => option.id !== right(attempt)).id).attempt);
    pages.push(play, Chain.introHtml({ day: '2026-11-12' }, h), Chain.loadingHtml(h), Chain.resultHtml({ attempt, xp: { total: 2, parts: [] }, guest: true, canLogin: true }, h),
        Chain.resultHtml({ attempt, stats: { players: 3, full_pct: 33, best: 28, me: { rank: 2 } } }, h), Chain.stepHtml(attempt, 2), Chain.decideHtml({ chosenName: 'X' }), Chain.brokenHtml({ correctName: 'Y', k: 2 }),
        Chain.rankingHtml({ players: 2, full_pct: 50, best: 28, top: [{ rank: 1, id: 'a', display_name: 'Ana', score: 28, links: 7 }], me: null }, h));
    // Ikony všech druhů uzlů jsou v icons.js
    for (const kind of Object.keys(Chain.KIND_LABEL)) pages.push(`<i data-lucide="${Chain.iconFor(kind)}"></i>`);
    const icons = read('icons.js');
    for (const html of pages) {
        assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=|<script/i);
        for (const match of html.matchAll(/data-lucide="([a-z0-9-]+)"/g)) assert.ok(icons.includes(`"${match[1]}":`), `ikona ${match[1]}`);
        for (const match of html.matchAll(/icons\/topics\/([a-z0-9-]+)\.webp/g)) assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${match[1]}.webp`)), match[1]);
        assert.doesNotMatch(html, /\b(získal jsi|zkusil jsi|hrál jsi|odpověděl jsi|dohrál jsi)\b/i);
    }
    for (const art of Object.values(Chain.ART)) assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${art}.webp`)), art);
    // Řetěz v SVG: sedm článků, zacvaknutí a prasklý článek
    const svg = Chain.linkSvg(['done', 'rescued', 'broken', 'current', 'todo', 'todo', 'todo'], { fresh: 1, label: 'Řetěz' });
    assert.equal((svg.match(/data-link="/g) || []).length, 7);
    assert.match(svg, /chain-click/);
    assert.match(svg, /chain-link-broken"[^>]*><image href="icons\/retez\/prasknuty\.webp"/);
    // Články jsou obrázky: střídavě zepředu a z boku, všechny soubory existují
    for (const match of svg.matchAll(/href="(icons\/retez\/[a-z]+\.webp)"/g)) assert.ok(fs.existsSync(path.join(ROOT, match[1])), match[1]);
    // Provlečení: tyčky (sudé články) pod velkými články a jejich bližší polovina ještě jednou navrch
    assert.match(svg, /data-link="2"[\s\S]*data-link="1"[\s\S]*data-front="2"/);
    assert.match(svg, /data-front="2"><image href="icons\/retez\/bokem\.webp"[^>]*clip-path="url\(#cg\d+-near\)"/);
});

test('soubory aplikace: index.html, service worker, nasazení, Tailwind a app.js', () => {
    const index = read('index.html');
    const app = read('app.js');
    assert.match(index, /<script src="chain\.js" defer><\/script>/);
    assert.ok(index.indexOf('quiz-core.js') < index.indexOf('chain.js') && index.indexOf('chain.js') < index.indexOf('app.js'));
    assert.match(read('sw.js'), /'chain\.js', 'chain-legacy\.js', 'data\/retezovka\.json'/);
    assert.match(read('.github/workflows/pages.yml'), /\bchain\.js chain-legacy\.js\b/);
    // Původní generátor se v prohlížeči načte jen podle potřeby (dny před NEW_FROM), vazby z Wikidat s grafem
    assert.doesNotMatch(index, /chain-legacy\.js/);
    assert.match(app, /loadExtra: \(\) => loadChainExtra\(\), loadScript: \(src\) => loadScript\(src\), chainSubject,/);
    assert.match(app, /Chain\.subjectText\(raw, source, later\)/);
    const extraData = JSON.parse(read(Chain.EXTRA_FILE));
    for (const rel of ['born', 'died', 'spouse', 'parent', 'teacher', 'successor', 'range', 'endemic', 'depicts']) assert.ok(extraData.edges[rel].length > 0, `data/retezovka.json: ${rel}`);
    assert.match(read('tailwind.config.js'), /'\.\/chain\.js'/);
    assert.match(app, /const chainHomeTile = \(\) => \(chainCtl \? chainCtl\.homeTile\(\) : ''\);/);
    assert.match(app, /\.\.\.\(chainCtl \? chainCtl\.actions : \{\}\)/);
    const styles = read('styles.css');
    for (const cls of ['chain-click', 'chain-shake', 'chain-link-broken', 'chain-dot-done', 'chain-right']) assert.ok(styles.includes(cls), `styles.css: ${cls}`);
    const schema = read('supabase/schema.sql');
    assert.ok(schema.indexOf('-- ===== Řetězovka dne (blok 21) — ZAČÁTEK BLOKU =====') > 0 && schema.indexOf('-- ===== Řetězovka dne (blok 21) — ZAČÁTEK BLOKU =====') < schema.indexOf('create or replace function public.schema_version()'), 'blok 21 před verzí schématu');
});

// Odznaky Řetězovky (quiz-core.js, blok 36 ve schema.sql): dohrané dny a celé řetězy bez Záchrany, z počítadel i z historie v zařízení
// (dny před odznaky), postavička Pavouk pletař za Kovář řetězů, dorovnání podle serveru v app.js a social.js
test('odznaky Řetězovky: stupně, texty, počítání z počítadel i historie, Pavouk pletař a dorovnání podle serveru', () => {
    const Look = require('../look.js');
    const groups = Chain.BADGE_GROUPS.map(id => core.BADGE_GROUPS.find(group => group.id === id));
    assert.deepEqual(groups.map(group => group.badges.map(badge => [badge.id, badge.goal])), [
        [['retezovka', 3], ['retezovka-10', 10], ['retezovka-30', 30], ['retezovka-100', 100], ['retezovka-365', 365]],
        [['retezovka-cela', 1], ['retezovka-cela-5', 5], ['retezovka-cela-15', 15], ['retezovka-cela-30', 30], ['retezovka-cela-60', 60]]
    ]);
    assert.deepEqual(groups[0].badges.map(badge => badge.text), ['Dohraj 3 Řetězovky dne.', 'Dohraj 10 Řetězovek dne.', 'Dohraj 30 Řetězovek dne.', 'Dohraj 100 Řetězovek dne.', 'Dohraj 365 Řetězovek dne.']);
    assert.equal(core.BADGE_BY_ID['retezovka-cela'].text, 'Celá Řetězovka dne (všech 7 článků) bez Záchrany.');
    assert.equal(core.BADGE_BY_ID['retezovka-cela-5'].text, '5× celá Řetězovka dne (všech 7 článků) bez Záchrany.');
    assert.deepEqual(groups.map(group => group.title), ['Řetězovka dne', 'Celý řetěz bez Záchrany']);
    for (const key of ['chainDone', 'chainFull', 'chainClean']) assert.equal(core.EMPTY_COUNTERS[key], 0, key);
    // Historie v zařízení: každý den jednou; celý řetěz bez Záchrany jen se 7 články a bez Záchrany
    const state = Chain.parseState({ days: { '2026-11-10': { links: 7, score: 28 }, '2026-11-11': { links: 7, score: 25, rescued: true }, '2026-11-12': { links: 3, score: 6 }, '2026-11-13': { links: 7, score: 28, rescued: false } } });
    assert.deepEqual(Chain.badgeCounts(state), { days: 4, clean: 2 });
    assert.deepEqual(Chain.badgeCounts(Chain.parseState(null)), { days: 0, clean: 0 });
    const x = (chain) => ({ level: 1, learned: 0, topicStars: {}, topicCount: 14, chain });
    const earned = (counters, chain) => core.earnedBadgeIds(counters, x(chain)).filter(id => id.startsWith('retezovka'));
    assert.deepEqual(earned({ chainDone: 2 }, null), []);
    assert.deepEqual(earned({ chainDone: 2 }, { days: 3, clean: 0 }), ['retezovka'], 'historie dní před odznaky stačí');
    assert.deepEqual(earned({ chainDone: 10, chainClean: 1 }, { days: 4, clean: 0 }), ['retezovka', 'retezovka-10', 'retezovka-cela'], 'větší z počítadla a historie');
    assert.deepEqual(earned({}, { days: 0, clean: 5 }), ['retezovka-cela', 'retezovka-cela-5']);
    assert.deepEqual(core.compactBadges(earned({ chainDone: 30, chainClean: 15 }, null)), ['retezovka-30', 'retezovka-cela-15']);
    // Pavouk pletař: za Kovář řetězů (retezovka-10), turnaje ho už nedávají
    const pavouk = Look.find('avatars', 'pavouk');
    assert.equal(pavouk.badge, 'retezovka-10');
    assert.equal(Look.isUnlocked(pavouk, { level: 1, badges: { 'retezovka-10': '2026-11-17' } }), true);
    assert.equal(Look.isUnlocked(pavouk, { level: 1, badges: { 'turnaj-postupy-5': '2026-11-17' } }), false);
    assert.match(Look.badgeRewardText('retezovka-10'), /Pavouk pletař \(profilový obrázek\)/);
    assert.equal(Look.badgeRewardText('turnaj-postupy-5'), '');
    // app.js: počítadla po dohrání dne, historie v souvislostech odznaků, dorovnání podle serveru; social.js: funkce bloku 36
    const app = read('app.js');
    assert.match(app, /if \(summary\.full && !summary\.rescued\) progress\.counters\.chainClean = /);
    assert.match(app, /chain: Chain \? Chain\.badgeCounts\(Chain\.parseState\(readJson\(Chain\.KEY\)\)\) : null/);
    assert.match(app, /progress\.counters\.chainDone = Math\.max\(progress\.counters\.chainDone, remote\.days\);/);
    assert.ok(app.indexOf('const Chain = window.MudrlantChain') < app.indexOf('const badgeContext = '), 'Chain je známý dřív, než ho odznaky potřebují');
    assert.match(read('social.js'), /request\('POST', 'rpc\/chain_badge_counts', \{ body: \{\} \}\)/);
});
