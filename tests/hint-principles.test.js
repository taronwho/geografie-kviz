// Zásady nápověd a zakrývání, vynucené v jádru (quiz-core.js) a hlídané auditem (scripts/lib/audit.mjs):
// (1) zakrytí neprozradí tvar odpovědi, (2) náhradní a obecný text nápovědou není, (3) každá nápověda přidá něco nového,
// (4) slepá mapa je v měřítku, které rozliší možnosti. Na skutečných datech témat a na vymyšlených příkladech.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const core = require('../quiz-core.js');

const ROOT = path.join(__dirname, '..');
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'countries.json'), 'utf8')).countries;
core.setCountries(countries);
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regiony.json'), 'utf8'));
const contexts = new Map();
const contextOf = (id) => {
    if (!contexts.has(id)) {
        const topic = require(path.join(ROOT, 'topics', `${id}.js`));
        const data = JSON.parse(fs.readFileSync(path.join(ROOT, topic.dataFile), 'utf8'));
        contexts.set(id, { topic, items: data.items, collections: data.collections, countries, byId: new Map(data.items.map(item => [item.q, item])), textPhotos: new Set(), photoMasks: {} });
    }
    return contexts.get(id);
};
const find = (ctx, name, category = null) => {
    const item = ctx.items.find(candidate => candidate.n === name && (!category || candidate.c === category));
    assert.ok(item, `chybí ${name}`);
    return item;
};
// Otázka na název s danými nesprávnými možnostmi (podle názvů položek)
const nameQuestion = (ctx, item, wrongNames, category = null) => ({
    type: 'name', title: (ctx.topic.categories.find(entry => entry.key === item.c) || {}).question || ctx.topic.words.question, showName: false,
    choices: [{ id: item.q, label: item.n, correct: true }, ...wrongNames.map(name => { const other = find(ctx, name, category); return { id: other.q, label: other.n, correct: false }; })],
    accepted: core.nameAnswers(item, ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : []), answerLabel: item.n
});
const typeLabelOf = (item, ctx, question) => {
    const category = ctx.topic.categories.find(entry => entry.key === item.c) || { one: ctx.topic.words.one };
    return item.ty && !core.hideAnswer(item.ty, question, { ...item, ty: '' }, ctx).includes('[***]') ? item.ty : category.one;
};
const VISUALS = { map: 'slepá mapa', timeline: 'časová osa', image: 'obrázek', scale: 'stupnice', periodic: 'periodická tabulka' };
const describeVisual = (spec) => VISUALS[spec && spec.type] ? { name: spec.name || VISUALS[spec.type], icon: 'x' } : null;
const roundOf = (ctx, item, question, fetched) => {
    const texts = core.buildQuestionTexts(item, ctx, question, fetched);
    const shown = ctx.topic.questionImage ? ctx.topic.questionImage(item, ctx, question.type) : null;
    return { texts, shown, ...core.planRound({ item, ctx, question, texts, typeLabel: typeLabelOf(item, ctx, question), shown, describeVisual }) };
};
const audit = () => import(path.join(ROOT, 'scripts', 'lib', 'audit.mjs'));

// --- (1) Tvar odpovědi ---

test('zakrytí: části jména oddělené spojkou, předložkou či interpunkcí jsou jeden blok', () => {
    assert.equal(core.mergeCensored('[***] a [***] je americký film.'), '[***] je americký film.');
    assert.equal(core.mergeCensored('[***] na [***] patří mezi geoglyfy.'), '[***] patří mezi geoglyfy.');
    assert.equal(core.mergeCensored('[***]: [***] (2003), [***] of the [***]'), '[***] (2003), [***]');
    assert.equal(core.mergeCensored('[***] - [***] und [***]'), '[***]');
    // Jiná slova a konec věty bloky nespojí
    assert.equal(core.mergeCensored('[***] je [***].'), '[***] je [***].');
    assert.equal(core.mergeCensored('Zde [***]. [***] byl'), 'Zde [***]. [***] byl');
    assert.equal(core.censorName('Obrazce na planině Nazca patří mezi geoglyfy. Je tu více než 300 obrazců.', 'Obrazce na planině Nazca'),
        '[***] patří mezi geoglyfy. Je tu více než 300 [***].');
});

test('zakrytí: slovo u zakrytého místa, které z možností vybírá, zakrytí pohltí', () => {
    const question = { choices: [{ label: 'Liška a pes', correct: true }, { label: 'Zootropolis: Město zvířat' }, { label: 'Zachránci' }, { label: 'Malá mořská víla' }] };
    assert.deepEqual(core.structureLeaks('Příběh červené [***] a Coppera.', question).map(leak => leak.word), ['a']);
    assert.equal(core.sealStructure('Příběh červené [***] a Coppera.', question), 'Příběh červené [***] Coppera.');
    // Obvod: číslo u zakrytého místa ano, Praha (mají ji všechny možnosti) ne
    const districts = { choices: [{ label: 'Praha 5', correct: true }, { label: 'Praha 4' }, { label: 'Praha 11' }, { label: 'Praha-Velká Chuchle' }] };
    assert.deepEqual(core.structureLeaks('Městská část [***] 5 leží', districts).map(leak => leak.word), ['5']);
    assert.equal(core.sealStructure('Městská část [***] 5 leží', districts), 'Městská část [***] leží');
    assert.deepEqual(core.structureLeaks('Část [***] leží v Praze', districts), [], 'Praha je ve všech možnostech');
    // Zúžení: „[***] horniny“ vyřadí obě vyvřeliny (hornina je jen ve dvou možnostech), i jako jiný tvar slova
    const rocks = { choices: [{ label: 'Usazená hornina', correct: true }, { label: 'Přeměněná hornina' }, { label: 'Hlubinná vyvřelina' }, { label: 'Výlevná vyvřelina' }] };
    assert.equal(core.sealStructure('Je to hrubozrnná [***] horniny z úlomků.', rocks), 'Je to hrubozrnná [***] z úlomků.');
    assert.deepEqual(core.distinctiveTokens({ choices: [{ label: 'A', correct: true }] }), new Set(), 'bez nesprávných možností nic');
});

test('zakrytí: Liška a pes a Obrazce na planině Nazca na skutečných datech', () => {
    const film = contextOf('film');
    const fox = find(film, 'Liška a pes');
    const question = nameQuestion(film, fox, ['Zootropolis: Město zvířat', 'Zachránci', 'Malá mořská víla']);
    const fetched = core.processWikiText('Liška a pes (v anglickém originále The Fox and the Hound) je americký animovaný film z roku 1981 z dílny Walta Disneye. Film režírovali Ted Berman a Richard Rich. Námět pochází z novely spisovatele Daniela P. Mannixe. Vypráví příběh Toda – červené lišky a Coppera – loveckého psa, kteří byli nejlepšími přáteli až do doby, kdy objevili, že je mají lovit.');
    const { questionText, moreText } = core.buildQuestionTexts(fox, film, question, fetched);
    assert.match(questionText, /^\[\*\*\*\] je americký animovaný film/);
    for (const text of [questionText, moreText]) {
        assert.deepEqual(core.structureLeaks(text, question), [], text);
        assert.doesNotMatch(text, /\[\*\*\*\]\s+a\s+\[\*\*\*\]/);
    }
    const zemepis = contextOf('zemepis');
    const nazca = find(zemepis, 'Obrazce na planině Nazca');
    const nazcaQuestion = nameQuestion(zemepis, nazca, ['Machu Picchu', 'Caral', 'Chan Chan']);
    const nazcaText = core.buildQuestionTexts(nazca, zemepis, nazcaQuestion, core.processWikiText('Obrazce na planině Nazca patří mezi tzv. geoglyfy. Na náhorní plošině jihoamerického Peru se nachází více než 300 obrazců, tvořených světlými liniemi, vzniklými odstraněním tmavšího vulkanického povrchu.')).questionText;
    assert.match(nazcaText, /^\[\*\*\*\] patří mezi/);
    assert.doesNotMatch(nazcaText, /\bna \[\*\*\*\]/);
});

// --- (2) Náhradní a obecný text nápovědou není ---

test('popis: zadržený text (vlajky regionů, měst a českých znaků) ani náhradní popis nápovědou nejsou', () => {
    const vlajky = contextOf('vlajky');
    const article = core.processWikiText('Jižní Karolína je stát na jihovýchodě Spojených států amerických. Hlavním městem je Columbia, největším městem Charleston. Stát leží při pobřeží Atlantského oceánu a sousedí se Severní Karolínou a Georgií.');
    const cases = [
        [find(vlajky, 'Jižní Karolína', 'regiony'), ['Arkansas', 'Mississippi', 'Missouri'], 'regiony'],
        [find(vlajky, 'Praha 4', 'cesko'), ['Praha 11', 'Praha 21', 'Praha 5'], 'cesko'],
        [vlajky.items.find(item => item.c === 'mesta' && item.n === 'Chicago') || vlajky.items.find(item => item.c === 'mesta'), [], 'mesta']
    ];
    for (const [item, wrong, category] of cases) {
        const others = wrong.length ? wrong : vlajky.items.filter(other => other.c === category && other.q !== item.q).slice(0, 3).map(other => other.n);
        const question = nameQuestion(vlajky, item, others, category);
        const round = roundOf(vlajky, item, question, article);
        assert.equal(round.texts.origin, 'withheld', item.n);
        assert.deepEqual([round.texts.questionText, round.texts.moreText], ['', ''], item.n);
        assert.ok(!round.hints.some(hint => hint.kind === 'text' || hint.kind === 'excerpt'), `${item.n}: žádný popis ani další věty`);
        assert.ok(round.hints.length > 0, `${item.n}: nápovědy zůstanou (fakta, mapa)`);
        // Fakt, který mají všechny možnosti (Stát: USA u čtyř amerických států, Kraj: Praha u obvodů), nápovědou není
        const values = round.hints.filter(hint => hint.kind === 'facts').flatMap(hint => hint.facts.map(fact => fact.value));
        assert.ok(!values.includes('Spojené státy americké') && !values.includes('Praha'), `${item.n}: ${values.join(', ')}`);
    }
    // Vlajka státu má popis z článku (prvá nápověda)
    const chad = find(vlajky, 'Čad', 'vlajka');
    const chadRound = roundOf(vlajky, chad, nameQuestion(vlajky, chad, ['Rumunsko', 'Andorra', 'Moldavsko'], 'vlajka'),
        core.processWikiText('Vlajka Čadu je tvořena třemi svislými pruhy: modrým, žlutým a červeným. Byla přijata v roce 1959 a skoro se shoduje s vlajkou Rumunska, od které se liší jen odstínem modré.'));
    assert.equal(chadRound.hints[0].kind, 'text');
    // Náhradní popis z Wikidat (Wikipedie neodpověděla) u otázky s obrázkem nápovědou není
    const fallback = roundOf(vlajky, chad, nameQuestion(vlajky, chad, ['Rumunsko', 'Andorra', 'Moldavsko'], 'vlajka'), { description: 'Národní vlajka Čadu s modrým, žlutým a červeným pruhem.', more: '', funFacts: [], fallback: true });
    assert.equal(fallback.texts.origin, 'fallback');
    assert.ok(!fallback.hints.some(hint => hint.kind === 'text'));
});

test('popis: u otázky s obrázkem a názvem díla zůstane název, i když popis chybí', () => {
    const hints = core.buildHints([{ kind: 'text', text: 'Obraz z roku 1503.', origin: 'fallback', name: 'Mona Lisa' }], { describeVisual });
    assert.deepEqual(hints.map(hint => [hint.kind, hint.label, hint.text, hint.name]), [['text', 'název', '', 'Mona Lisa']]);
    const article = core.buildHints([{ kind: 'text', text: 'Portrét ženy s tajemným úsměvem, malovaný olejem na topolové desce.', origin: 'article', name: 'Mona Lisa' }], { describeVisual });
    assert.equal(article[0].label, 'název a popis');
    assert.deepEqual(core.buildHints([{ kind: 'text', text: 'Portrét ženy s tajemným úsměvem.', origin: 'withheld', name: '' }], { describeVisual }), []);
});

// --- (3) Každá nápověda přidá něco nového ---

test('nápovědy: další věty stejné jako popis, fakta z dřívějšího textu a text z dřívějších faktů vypadnou', () => {
    const description = 'Vlajka s modrým, žlutým a červeným svislým pruhem, přijatá roku 1959 po vyhlášení samostatnosti.';
    const duplicate = core.buildHints([{ kind: 'text', text: description, origin: 'article' }, { kind: 'excerpt', text: description }], { describeVisual });
    assert.deepEqual(duplicate.map(hint => hint.kind), ['text'], 'další věty = popis');
    const near = core.buildHints([{ kind: 'text', text: description, origin: 'article' }, { kind: 'excerpt', text: `${description} Vlaje.` }], { describeVisual });
    assert.deepEqual(near.map(hint => hint.kind), ['text'], 'skoro stejný text');
    const fresh = core.buildHints([{ kind: 'text', text: description, origin: 'article' }, { kind: 'excerpt', text: 'Barvy pocházejí z francouzské trikolóry a panafrických barev, modrá znamená nebe a naději.' }], { describeVisual });
    assert.deepEqual(fresh.map(hint => hint.kind), ['text', 'excerpt']);
    // Fakt, který řekly další věty, se neopakuje; další věty, které řekla fakta, také ne
    const factsAfter = core.buildHints([{ kind: 'excerpt', text: 'Hlavním městem je N’Djamena, ležící na soutoku řek Šari a Logone.' }, { kind: 'facts', facts: [{ label: 'Hlavní město', value: 'N’Djamena' }, { label: 'Rozloha', value: '1 284 000 km²' }] }], { describeVisual });
    assert.deepEqual(factsAfter[1].facts.map(fact => fact.label), ['Rozloha']);
    const textAfter = core.buildHints([{ kind: 'facts', facts: [{ label: 'Hlavní město', value: 'Ndžamena' }, { label: 'Kontinent', value: 'Afrika' }] }, { kind: 'excerpt', text: 'Ndžamena, Afrika.' }], { describeVisual });
    assert.deepEqual(textAfter.map(hint => hint.kind), ['facts']);
    // Známé věci (společná část možností, štítek) nejsou nápovědou
    assert.deepEqual(core.buildHints([{ kind: 'excerpt', text: 'Praha, městská část Praha, Praha.' }], { known: 'městská část · Praha', describeVisual }), []);
    assert.equal(core.commonChoiceText({ choices: [{ label: 'Praha 4' }, { label: 'Praha 11' }, { label: 'Praha-Kunratice' }] }), 'praha');
});

test('nápovědy: osa s roky z faktů ukázaných hned v okně a známá složení vypadnou', () => {
    assert.equal(core.isFactVisible('měď, chlor', 'Chlorid měďnatý'), true, 'měďnatý = měď');
    assert.equal(core.isFactVisible('měď', 'Medvěd hnědý'), false);
    assert.equal(core.isFactVisible('18 za tým', 'hraná 18 hráči s oválným míčem', 'Hráčů na hřišti'), true);
    assert.equal(core.isFactVisible('18 za tým', 'v 18. století', 'Hráčů na hřišti'), false);
    assert.equal(core.timelineKnown({ type: 'timeline', points: [1996] }, 'skupina založená v roce 1996, původem z Kalifornie'), true, 'rok před čárkou');
    assert.equal(core.isFactVisible('680 n. l.', 'Bitva se odehrála dne 10. října 680 poblíž města'), true, 'rok s letopočtem');
    assert.equal(core.isFactVisible('199 př. n. l.', 'vznikly asi roku 199 před naším letopočtem, tedy 199 př. n. l.'), true);
    assert.equal(core.isFactVisible('680 n. l.', 'roku 680 př. n. l.'), false);
    assert.equal(core.isFactVisible('882–1240', 'Stát existoval v letech 882 až 1240.'), true, 'období');
    assert.equal(core.isFactVisible('379–395 n. l.', 'vládl 379–395'), true);
    assert.equal(core.isFactVisible("4'33\"", 'nejznámější skladbou je 4’33”, třívětá kompozice'), true, 'hodnota beze slov');
    assert.equal(core.isFactVisible('sci-fi, thriller', 'Americký sci-fi/thriller film'), true);
    assert.equal(core.isFactVisible('síra, fluor', 'Fluorid sírový'), true, 'síra → sírový, fluor → fluorid');
    assert.equal(core.isFactVisible('stříbro, jod', 'Jodid stříbrný'), true);
    assert.equal(core.isFactVisible('Duna', 'Duncan Idaho'), false);
    assert.equal(core.isFactVisible('Panthera leo', 'čeleď rodu Panthera'), false, 'vědecký název přidá „leo“');
    assert.equal(core.isFactVisible('Jan Svěrák', 'Film natočený Janem Svěrákem'), true, 'krátké jméno ve skloněném tvaru');
    assert.equal(core.isFactVisible('Jan Svěrák', 'Film natočený Svěrákem podle Janáčka'), false);
    assert.equal(core.timelineKnown({ type: 'timeline', spans: [{ from: 1842, to: 1910 }] }, 'Narozen 15.10.1842 v Bratislavě, zemřel 16.6.1910'), true, 'roky v datech');
    // Jednopísmenná značka hned za názvem na začátku úvodu („Watt, W je…“) se u otázky na značku zakryje
    const fyzika = contextOf('fyzika');
    assert.equal(fyzika.topic.censor('usymbol', 'Watt, W je hlavní jednotka výkonu.', find(fyzika, 'Watt'), fyzika), 'Watt, [***] je hlavní jednotka výkonu.');
});

test('nápovědy: Vlajky – město, region a pražský obvod bez prázdné a opakované nápovědy', async () => {
    const { auditRound } = await audit();
    const vlajky = contextOf('vlajky');
    const article = core.processWikiText('Praha 4 je městská část na jihu Prahy. Leží na pravém břehu Vltavy a patří k nejlidnatějším částem města. Patří k ní Nusle, Michle, Podolí a Braník.');
    for (const [name, category] of [['Praha 4', 'cesko'], ['Jižní Karolína', 'regiony']]) {
        const item = find(vlajky, name, category);
        const question = nameQuestion(vlajky, item, vlajky.items.filter(other => other.c === category && other.ty === item.ty && other.q !== item.q).slice(0, 3).map(other => other.n), category);
        const round = roundOf(vlajky, item, question, article);
        const findings = auditRound(item, vlajky, { question, questionText: round.texts.questionText, moreText: round.texts.moreText, origin: round.texts.origin, typeLabel: typeLabelOf(item, vlajky, question), questionImage: round.shown, hints: round.hints, leadFacts: round.leadFacts, visibleText: round.visibleText, known: round.known });
        assert.deepEqual(findings.filter(finding => ['tvar', 'sablona', 'prazdna-napoveda', 'mapa-meritko', 'prozrazeno'].includes(finding.kind)), [], name);
    }
});

// --- (4) Slepá mapa v měřítku možností ---

test('slepá mapa: pražský obvod na mapě Prahy s hranicemi částí, ne na celém Česku', () => {
    const vlajky = contextOf('vlajky');
    const item = find(vlajky, 'Praha 4', 'cesko');
    const question = nameQuestion(vlajky, item, ['Praha 2', 'Praha 1', 'Praha 3'], 'cesko');
    const round = roundOf(vlajky, item, question, { description: '', more: '', funFacts: [], fallback: true });
    const map = round.hints.find(hint => hint.kind === 'visual' && hint.spec.type === 'map');
    assert.ok(map, 'slepá mapa mezi nápovědami');
    assert.equal(map.spec.regional.city, 'Q1085');
    assert.equal(map.spec.others.length, 3, 'ostatní možnosti jako šedé tečky');
    const extent = core.mapExtent(map.spec, { regions, width: 360, height: 224 });
    assert.equal(extent.source, 'city');
    assert.equal(extent.fitted, true, 'Praha 1–4 leží blízko sebe: mapa se přiblíží na ně');
    const km = extent.span * 111.32 * Math.cos(extent.lat * Math.PI / 180);
    assert.ok(km < 20, `výřez ${Math.round(km)} km`);
    const drawn = core.buildRegionalMap(extent.entry, { item: item.q, lat: item.la, lon: item.lo, width: 360, height: 224, view: extent, others: map.spec.others });
    assert.ok(drawn.layers.region.length > 50, 'obrys hledané části');
    assert.ok(drawn.layers.lines.length > 200, 'hranice ostatních částí');
    for (const point of [drawn.dot, ...drawn.others]) assert.ok(point.x > 0 && point.x < 360 && point.y > 0 && point.y < 224, 'tečky ve výřezu');
    // Každá pražská část má v datech obrys
    for (const part of vlajky.items.filter(other => other.ty === 'městská část')) assert.ok(regions.cities.Q1085.i[part.q], `obrys ${part.n}`);
    // Bez dat města aspoň přiblížená mapa krajů Česka
    const countryOnly = core.mapExtent(map.spec, { regions: { countries: regions.countries } });
    assert.equal(countryOnly.source, 'country');
    assert.ok(countryOnly.span < 1);
});

test('slepá mapa: tlačítka +/− oddálí z částí města na stát a na svět', () => {
    const vlajky = contextOf('vlajky');
    const item = find(vlajky, 'Praha-Suchdol', 'cesko');
    const spec = vlajky.topic.visual(item, vlajky, 'name');
    const sources = [1, 4, 16, 64, 256].map(zoom => core.mapExtent(spec, { regions, zoom }).source);
    assert.deepEqual([...new Set(sources)], ['city', 'country', 'world']);
    assert.ok(core.mapExtent(spec, { regions, zoom: 0.25 }).span < core.mapExtent(spec, { regions }).span);
});

test('slepá mapa: výřez podle rozptylu možností jen tam, kde jsou možnosti blízko', () => {
    const zemepis = contextOf('zemepis');
    const nazca = find(zemepis, 'Obrazce na planině Nazca');
    const spread = core.fitMapToChoices({ type: 'map', lat: nazca.la, lon: nazca.lo, span: 24, label: 'Místo je uprostřed' }, nameQuestion(zemepis, nazca, ['Machu Picchu', 'Caral', 'Chan Chan']), zemepis);
    assert.equal(core.mapExtent(spread, {}).fitted, false, 'místa po celém Peru: výřez tématu');
    const near = { ...spread, fit: { lat: -14.7, lon: -75.1, span: 2 }, others: [{ lat: -14.6, lon: -75.3 }] };
    assert.equal(core.mapExtent(near, {}).fitted, true);
    assert.equal(core.mapExtent(near, {}).span, 2);
    assert.deepEqual(core.choicePoints({ type: 'century', match: 'century', choices: [] }, zemepis), [], 'jen otázka na název s položkami');
    // Mrakodrapy jednoho města: obrysy států je nerozliší a New York mají všechny – slepá mapa ani „Město: New York“ nápovědou nejsou
    const architektura = contextOf('architektura');
    const empire = find(architektura, 'Empire State Building');
    const round = roundOf(architektura, empire, nameQuestion(architektura, empire, ['GE Building', '40 Wall Street', 'Chrysler Building']), { description: 'Mrakodrap v NYC.', more: '', funFacts: [], fallback: true });
    assert.ok(!round.hints.some(hint => hint.kind === 'visual' && hint.spec.type === 'map'), 'žádná slepá mapa');
    assert.ok(!round.hints.some(hint => (hint.facts || []).some(fact => fact.value === 'New York')), 'žádné Město: New York');
    assert.ok(!round.leadFacts.some(fact => fact.value === 'New York'));
});

// --- Audit: nové kontroly najdou staré chyby ---

test('audit: tvar odpovědi, šablona, prázdná nápověda a mapa v měřítku celého státu', async () => {
    const { auditRound, auditTemplates, isCritical } = await audit();
    const vlajky = contextOf('vlajky');
    const item = find(vlajky, 'Praha 4', 'cesko');
    const question = nameQuestion(vlajky, item, ['Praha 2', 'Praha 1', 'Praha 3'], 'cesko');
    const base = { question, questionText: '', moreText: '', origin: 'article', typeLabel: 'městská část', questionImage: { file: item.im, label: 'Znak' }, hints: [], leadFacts: [], visibleText: question.title, known: 'znak · praha' };
    const kinds = (round) => auditRound(item, vlajky, { ...base, ...round }).filter(isCritical).map(finding => finding.kind);
    assert.deepEqual(kinds({}), []);
    assert.ok(kinds({ hints: [{ kind: 'text', label: 'popis', text: '[***] a [***] je městská část na jihu.', name: '' }] }).includes('tvar'));
    assert.ok(kinds({ hints: [{ kind: 'text', label: 'popis', text: 'Část [***] 4 leží na jihu města u řeky.', name: '' }] }).includes('tvar'));
    assert.ok(kinds({ origin: 'withheld', hints: [{ kind: 'text', label: 'popis', text: 'Znak jedné z pražských městských částí. Které patří?', name: '' }] }).includes('sablona'));
    const text = 'Leží na pravém břehu řeky, patří k nejlidnatějším částem města.';
    assert.ok(kinds({ hints: [{ kind: 'text', label: 'popis', text, name: '' }, { kind: 'excerpt', label: 'další věty', text }] }).includes('prazdna-napoveda'));
    // Stará slepá mapa: celé Česko s tečkou v Praze
    const country = { type: 'map', lat: item.la, lon: item.lo, span: 6, label: 'Místo je vyznačené tečkou', regional: { country: 'Q213', item: item.q } };
    assert.ok(kinds({ hints: [{ kind: 'visual', label: 'slepá mapa', spec: country }] }).includes('mapa-meritko'));
    assert.deepEqual(kinds({ hints: [{ kind: 'visual', label: 'slepá mapa', spec: core.fitMapToChoices({ ...country, regional: { ...country.regional, city: 'Q1085' } }, question, vlajky) }] }), []);
    // Šablona podle výsledku: stejný text nápovědy u tří položek
    const ctx = { topic: { id: 'vlajky' }, hintTexts: new Map([['x', { text: 'Vlajka jednoho z velkých měst světa. Kterému patří?', label: 'popis', type: 'name', items: new Map([['Q1', 'A'], ['Q2', 'B'], ['Q3', 'C']]) }]]) };
    assert.deepEqual(auditTemplates(ctx).map(finding => [finding.kind, isCritical(finding)]), [['sablona', true]]);
});

test('zakrytí: název, který hráč vidí v zadání, se v popisu nezakrývá (24 hodin u otázky na desetiletí)', () => {
    const p = require('./pipeline.js');
    const film = p.loadContext('film');
    const item = film.items.find(entry => entry.n === '24 hodin');
    const [name, decade] = ['name', 'decade'].map(type => p.questionsFor(film, item).find(question => question.type === type));
    const extract = '24 hodin je akční televizní seriál americké televize Fox. Hlavní roli agenta Jacka Bauera ztvárnil herec Kiefer Sutherland.';
    assert.equal(decade.showName, true);
    assert.match(p.textsFor(film, item, decade, extract).questionText, /^24 hodin je akční/, 'u desetiletí název zůstane');
    assert.match(p.textsFor(film, item, name, extract).questionText, /^\[\*\*\*\] je akční/, 'u otázky na název se zakryje');
    // Rok v textu se u desetiletí dál zakrývá, název ne
    assert.equal(core.hideAnswer('24 hodin běžel od roku 2001.', decade, item, film), '24 hodin běžel od roku [***].');
});

test('audit: u všech otázek se zobrazeným názvem zůstane název v popisu vidět (vzorek úvodů všech témat)', () => {
    const p = require('./pipeline.js');
    const problems = [];
    for (const [key, intro] of Object.entries(p.loadIntros())) {
        const [topicId, qid] = key.split(':');
        if (!p.TOPIC_IDS.includes(topicId)) continue;
        const ctx = p.loadContext(topicId);
        const item = ctx.byId.get(qid);
        if (!item || !intro.extract) continue;
        const description = core.processWikiText(intro.extract).description || '';
        const shown = new RegExp(`(?<![\\p{L}\\p{N}])${item.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
        if (!shown.test(description)) continue;
        for (const question of p.questionsFor(ctx, item).filter(entry => entry.showName)) {
            const text = core.hideAnswer(description, question, item, ctx);
            if (!shown.test(text)) problems.push(`${key} ${question.type}: ${text.slice(0, 90)}`);
        }
    }
    assert.deepEqual(problems, []);
});
