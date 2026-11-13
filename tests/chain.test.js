// Řetězovka (chain.js): graf vazeb ze skutečných dat témat, řetězy na 60 dní po sobě (stejné pro všechny, správné vazby, nesprávné
// možnosti stejného druhu, které vazbu nesplňují, záchrana na každý článek, dny po sobě se neopakují), hra (body, Záchrana, přetržení),
// uložený stav, sdílení, dlaždice a vykreslení bez inline stylů. Česká slova států (z Francie, ve Francii) a soubory aplikace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Chain = require('../chain.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sources = Object.fromEntries(Chain.SOURCES.map(topic => [topic, JSON.parse(read(`data/${topic}.json`)).items]));
const countries = JSON.parse(read('data/countries.json')).countries;
const started = Date.now();
const graph = Chain.buildGraph(sources, countries);
const graphMs = Date.now() - started;
const DAYS = Array.from({ length: 60 }, (_, i) => Chain.addDays('2026-11-12', i));
const chains = new Map();
const chainFor = (day) => {
    if (!chains.has(day)) chains.set(day, Chain.dailyChain(graph, day));
    return chains.get(day);
};
const node = (id) => graph.nodes.get(id);
const linked = (rel, a, x) => (graph.edges.get(rel).get(a) || []).includes(x);
const fits = (relId, a, x) => Chain.RELATION_BY_ID.get(relId).fits(node(a), node(x), graph);
const nodesOf = (chain) => [chain.start.id, ...chain.questions.map(question => question.to.id)];

test('graf: všechny druhy uzlů a vazeb ze skutečných dat, rychle', () => {
    assert.ok(graphMs < 8000, `graf za ${graphMs} ms`);
    for (const kind of ['country', 'city', 'landmark', 'peak', 'river', 'composer', 'writer', 'artist', 'architect', 'band', 'music', 'book', 'artwork', 'film', 'club', 'games']) {
        assert.ok((graph.byKind.get(kind) || []).length > 10, `druh ${kind}`);
    }
    for (const rel of Chain.RELATIONS) assert.ok(graph.edges.get(rel.id).size > 0, `vazba ${rel.id}`);
    // Ukázky správných vazeb
    const byName = (kind, name) => graph.byKind.get(kind).find(entry => entry.name === name);
    assert.ok(linked('capital', byName('country', 'Francie').id, byName('city', 'Paříž').id));
    assert.ok(linked('capitalOf', byName('city', 'Praha').id, byName('country', 'Česko').id));
    assert.ok(linked('landmarkCity', byName('landmark', 'Sagrada Família').id, byName('city', 'Barcelona').id));
    assert.ok(linked('workAuthor', byName('music', 'Prodaná nevěsta').id, byName('composer', 'Bedřich Smetana').id));
    assert.ok(linked('personCountry', byName('composer', 'Bedřich Smetana').id, byName('country', 'Česko').id));
    assert.ok(linked('artMuseum', byName('artwork', 'Mona Lisa').id, byName('landmark', 'Louvre').id));
    // Název, který odpověď prozradí, vazbu nemá: Šikmá věž v Pise → Pisa, Pražský hrad → Praha, FC Bayern München → Mnichov
    const pisa = graph.byKind.get('landmark').find(entry => /Pise/.test(entry.name));
    if (pisa) assert.equal((graph.edges.get('landmarkCity').get(pisa.id) || []).length, 0);
    assert.ok(!graph.byKind.get('club').some(entry => /München|Paris|Warszawa|Zagreb|Petěrburg/.test(entry.name)), 'klub s městem v názvu');
    // Stejně pojmenovaná místa (Birmingham, Pantheon) nejsou v řetězu ani mezi možnostmi
    for (const entry of graph.nodes.values()) if (entry.shared) assert.equal((graph.edges.get('cityCountry').get(entry.id) || []).length + (graph.edges.get('landmarkCity').get(entry.id) || []).length, 0);
});

test('řetěz dne na 60 dní: stejný pro všechny, správné vazby, nesprávné možnosti vazbu nesplňují, záchrana na každý článek', () => {
    for (const day of DAYS) {
        const started = Date.now();
        const chain = chainFor(day);
        assert.ok(Date.now() - started < 20000, `${day}: výpočet ${Date.now() - started} ms`);
        assert.ok(chain, `${day}: řetěz existuje`);
        assert.equal(chain.questions.length, Chain.LINKS, day);
        const ids = nodesOf(chain);
        assert.equal(new Set(ids).size, ids.length, `${day}: uzly se neopakují`);
        let from = chain.start.id;
        for (const question of chain.questions) {
            const where = `${day} článek ${question.k} (${question.text})`;
            assert.equal(question.from.id, from, `${where}: navazuje na předchozí odpověď`);
            assert.ok(linked(question.rel, question.from.id, question.to.id), `${where}: vazba platí`);
            assert.equal(question.options.length, 4, where);
            assert.equal(question.options[question.answer].id, question.to.id, `${where}: správná odpověď`);
            assert.equal(new Set(question.options.map(option => option.name)).size, 4, `${where}: různé názvy`);
            assert.match(question.text, /^[\p{Lu}0-9„].*\?$/u, `${where}: věta s otazníkem`);
            assert.doesNotMatch(question.text, /undefined|null|\s\s|ve státě (?:Francie|Česko|Itálie)\b/, `${where}: text`);
            for (const option of question.options) {
                assert.equal(node(option.id).kind, question.to.kind === 'landmark' ? 'landmark' : node(question.to.id).kind, `${where}: stejný druh (${option.name})`);
                if (option.id === question.to.id) continue;
                assert.ok(!linked(question.rel, question.from.id, option.id) && !fits(question.rel, question.from.id, option.id), `${where}: ${option.name} vazbu nesplňuje`);
                assert.ok(!ids.includes(option.id), `${where}: ${option.name} není článek řetězu`);
            }
            // Záchrana: jiná otázka na stejný článek
            const rescue = question.rescue;
            assert.ok(rescue && rescue.text && rescue.text !== question.text, `${where}: záchrana`);
            assert.ok(!ids.includes(rescue.from.id) || (!rescue.same && rescue.from.id === question.from.id), `${where}: záchrana není z řetězu`);
            if (rescue.same) {
                assert.ok(linked(rescue.rel, rescue.from.id, question.to.id), `${where}: záchrana vede na stejnou odpověď`);
                assert.ok(rescue.keep.length >= 2, `${where}: záchrana si nechá aspoň dvě původní nesprávné možnosti`);
                for (const wrong of [...rescue.keep, ...rescue.extra.map(option => option.id)]) {
                    assert.ok(!linked(rescue.rel, rescue.from.id, wrong) && !fits(rescue.rel, rescue.from.id, wrong), `${where}: záchrana ${node(wrong).name}`);
                    assert.ok(!ids.includes(wrong), `${where}: záchrana neprozradí článek`);
                }
                // Po kterékoli špatné odpovědi má záchrana 4 různé možnosti se správnou
                for (const option of question.options.filter(entry => entry.id !== question.to.id)) {
                    const shown = Chain.rescueOptions(question, option.id, 'test');
                    assert.equal(shown.options.length, 4);
                    assert.equal(shown.options[shown.answer].id, question.to.id);
                    assert.ok(!shown.options.some(entry => entry.id === option.id), `${where}: zvolená špatná odpověď v záchraně není`);
                }
            } else {
                assert.equal(rescue.from.id, question.from.id);
                assert.ok(linked(rescue.rel, rescue.from.id, rescue.to.id) && rescue.options[rescue.answer].id === rescue.to.id, `${where}: jiná záchrana platí`);
                assert.ok(![...rescue.options.map(option => option.id)].some(option => ids.includes(option)), `${where}: záchrana neprozradí článek`);
            }
            from = question.to.id;
        }
    }
    // Stejně pro všechny: výpočet znovu (nový graf) dá stejný řetěz
    const again = Chain.buildGraph(sources, countries);
    assert.deepEqual(Chain.dailyChain(again, DAYS[0]), chainFor(DAYS[0]));
});

test('řetěz dne: dny po sobě se neopakují a za dva měsíce se vystřídá dost míst, osobností a vazeb', () => {
    const uses = new Map();
    const rels = new Set();
    let overlap = 0;
    for (let i = 0; i < DAYS.length; i++) {
        const ids = nodesOf(chainFor(DAYS[i]));
        ids.forEach(id => uses.set(id, (uses.get(id) || 0) + 1));
        chainFor(DAYS[i]).questions.forEach(question => rels.add(question.rel));
        if (i) {
            const shared = ids.filter(id => nodesOf(chainFor(DAYS[i - 1])).includes(id)).length;
            assert.ok(shared <= 3, `${DAYS[i]}: se včerejškem sdílí ${shared} uzlů`);
            overlap += shared;
            assert.notEqual(chainFor(DAYS[i]).start.id, chainFor(DAYS[i - 1]).start.id, `${DAYS[i]}: jiný začátek`);
        }
    }
    assert.ok(overlap / (DAYS.length - 1) < 1, `průměrně sdílí ${overlap / (DAYS.length - 1)}`);
    assert.ok(uses.size > 200, `různých uzlů ${uses.size}`);
    assert.ok(rels.size >= 20, `různých vazeb ${rels.size}`);
});

test('cvičná řetězovka: náhodný řetěz se 7 články, pokaždé jiný', () => {
    const one = Chain.practiceChain(graph, 'a');
    const two = Chain.practiceChain(graph, 'b');
    assert.equal(one.questions.length, 7);
    assert.notDeepEqual(nodesOf(one), nodesOf(two));
    assert.deepEqual(Chain.practiceChain(graph, 'a'), one);
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
    assert.deepEqual(Chain.summaryOf(attempt), { links: 7, score: 28, rescued: false, full: true, done: true });
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
    assert.deepEqual(Chain.summaryOf(attempt), { links: 3, score: 3, rescued: true, full: false, done: false });
    // Druhá chyba: Záchrana už není, řetěz se přetrhne
    step = Chain.answer(attempt, 'x3b');
    assert.equal(step.outcome, 'broken');
    assert.deepEqual(Chain.summaryOf(step.attempt), { links: 3, score: 3, rescued: true, full: false, done: true });
    assert.ok(Chain.validSummary(Chain.summaryOf(step.attempt)));
    assert.equal(Chain.shareGrid(step.attempt.results), '🔗🔗🛟💥');

    // Ukončit řetěz místo Záchrany; Záchrana, která nevyšla
    let stopped = Chain.answer(Chain.newAttempt('2026-11-12', 'host', tiny()), 'x0c').attempt;
    stopped = Chain.giveUp(stopped);
    assert.deepEqual(Chain.summaryOf(stopped), { links: 0, score: 0, rescued: false, full: false, done: true });
    let lost = Chain.useRescue(Chain.answer(Chain.newAttempt('2026-11-12', 'host', tiny()), 'x0c').attempt);
    const wrongRescue = Chain.currentAsk(lost).rescue.options.find(option => option.id !== right(lost)).id;
    const outcome = Chain.answer(lost, wrongRescue);
    assert.equal(outcome.outcome, 'lost');
    assert.deepEqual(Chain.summaryOf(outcome.attempt), { links: 0, score: 0, rescued: true, full: false, done: true });
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
    let attempt = Chain.newAttempt('2026-11-12', 'host', chainFor(DAYS[0]));
    const play = Chain.playHtml({ attempt, ask: Chain.currentAsk(attempt), phase: 'ask' }, h);
    attempt = Chain.answer(attempt, right(attempt)).attempt;
    attempt = Chain.giveUp(Chain.answer(attempt, Chain.currentAsk(attempt).question.options.find(option => option.id !== right(attempt)).id).attempt);
    const pages = [play, Chain.introHtml({ day: '2026-11-12' }, h), Chain.loadingHtml(h), Chain.resultHtml({ attempt, xp: { total: 2, parts: [] }, guest: true, canLogin: true }, h),
        Chain.resultHtml({ attempt, stats: { players: 3, full_pct: 33, best: 28, me: { rank: 2 } } }, h), Chain.stepHtml(attempt, 2), Chain.decideHtml({ chosenName: 'X' }), Chain.brokenHtml({ correctName: 'Y', k: 2 }),
        Chain.rankingHtml({ players: 2, full_pct: 50, best: 28, top: [{ rank: 1, id: 'a', display_name: 'Ana', score: 28, links: 7 }], me: null }, h)];
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
    assert.match(svg, /chain-half-l/);
});

test('soubory aplikace: index.html, service worker, nasazení, Tailwind a app.js', () => {
    const index = read('index.html');
    assert.match(index, /<script src="chain\.js" defer><\/script>/);
    assert.ok(index.indexOf('quiz-core.js') < index.indexOf('chain.js') && index.indexOf('chain.js') < index.indexOf('app.js'));
    assert.match(read('sw.js'), /'chain\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\bchain\.js\b/);
    assert.match(read('tailwind.config.js'), /'\.\/chain\.js'/);
    const app = read('app.js');
    assert.match(app, /const chainHomeTile = \(\) => \(chainCtl \? chainCtl\.homeTile\(\) : ''\);/);
    assert.match(app, /\.\.\.\(chainCtl \? chainCtl\.actions : \{\}\)/);
    const styles = read('styles.css');
    for (const cls of ['chain-click', 'chain-shake', 'chain-link-broken', 'chain-dot-done', 'chain-right']) assert.ok(styles.includes(cls), `styles.css: ${cls}`);
    const schema = read('supabase/schema.sql');
    assert.ok(schema.indexOf('-- 21: Řetězovka') > schema.indexOf('create or replace function public.schema_version()'), 'blok 21 na konci schématu');
});
