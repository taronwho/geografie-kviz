// Dobývání (conquest.js): barvy a znaky shodné se serverem, mapy (data/dobyvani-*.json: tvary, body popisků, souvislý graf sousedů,
// regiony, ozdoby), pravidla v pohledu (cíle útoku, opevnění, zdroje útoku, pořadí se shodou), otázky o území na všech mapách
// a úrovních (4 možnosti, jedna správná, stejné semínko = stejná otázka; podíly oborů a rodin, nezávislé ověření vazby a známosti
// u všech rodin včetně mytologie), kronika tažení s rodem názvů, přehrání, odměny, časy a vykreslení bez inline stylů (CSP).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const C = require('../conquest.js');

const ROOT = path.join(__dirname, '..');
const MAP_IDS = ['evropa', 'afrika', 'asie', 'amerika', 'cesko'];
const load = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `dobyvani-${id}.json`), 'utf8'));
const maps = Object.fromEntries(MAP_IDS.map(id => [id, load(id)]));
const items = (topic) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${topic}.json`), 'utf8')).items;
let topics = null;
const loadTopics = () => (topics = topics || { zemepis: items('zemepis'), vlajky: items('vlajky'), architektura: items('architektura') });
// Všechna témata, ze kterých Dobývání skládá otázky (app.js loadTopics)
const ALL_TOPICS = ['zemepis', 'vlajky', 'architektura', 'historie', 'literatura', 'hudba', 'umeni', 'film', 'sport', 'fyzika', 'chemie', 'biologie', 'mytologie'];
let allTopics = null;
const loadAllTopics = () => (allTopics = allTopics || Object.fromEntries(ALL_TOPICS.map(id => [id, items(id)])));
const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const sqlList = (name) => [...new RegExp(`function public\\.${name}\\(\\) returns text\\[\\]\\s+language sql immutable as \\$\\$ select array\\[([^\\]]+)\\]`).exec(schema)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);

test('barvy a znaky: 9 co nejodlišnějších barev a 24 znaků, shodné se serverem, platné kresby a barvy', () => {
    assert.equal(C.COLORS.length, 9);
    assert.equal(C.EMBLEMS.length, 24);
    assert.deepEqual(C.COLORS.map(c => c.id), sqlList('conquest_colors'));
    assert.deepEqual(C.EMBLEMS.map(e => e.id), sqlList('conquest_emblems'));
    for (const color of C.COLORS) {
        assert.match(color.hex, /^#[0-9a-f]{6}$/);
        assert.match(C.inkOf(color.id), /^#[0-9a-f]{6}$/);
        assert.ok(['#ffffff', '#2a1d10'].includes(C.emblemInk(color.id)));
    }
    // Znak na vlaječce má proti barvě kontrast (světlé barvy tmavý znak)
    assert.equal(C.emblemInk('zluta'), '#2a1d10');
    assert.equal(C.emblemInk('modra'), '#ffffff');
    // Dřívější barvy (rozehrané hry) se dál vykreslí
    assert.equal(C.colorOf('namornicka').hex, '#1c2a6b');
    // Každé dvě barvy z nabídky jsou od sebe daleko (aby se hráči na mapě nepletli)
    const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    for (const a of C.COLORS) for (const b of C.COLORS) if (a.id < b.id) {
        const [x, y] = [rgb(a.hex), rgb(b.hex)];
        const mean = (x[0] + y[0]) / 2;
        const dist = Math.sqrt((2 + mean / 256) * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 + (2 + (255 - mean) / 256) * (x[2] - y[2]) ** 2);
        assert.ok(dist > 150, `${a.id} a ${b.id} jsou si moc podobné (${Math.round(dist)})`);
    }
    for (const emblem of C.EMBLEMS) {
        const markup = emblem.draw('#fff');
        assert.ok(markup.length > 40 && !/NaN|undefined/.test(markup), emblem.id);
        assert.doesNotMatch(markup, /style=/);
    }
    assert.equal(new Set(C.COLORS.map(c => c.name)).size, 9);
    assert.equal(new Set(C.EMBLEMS.map(e => e.name)).size, 24);
});

test('mapy: data jsou aktuální (scripts/build-dobyvani.js --check), včetně sousedství a regionů v schema.sql', () => {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dobyvani.js'), '--check'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
});

for (const id of MAP_IDS) {
    test(`mapa ${id}: území s cestou, bodem uvnitř, sousedy oboustranně, souvislý graf, regiony, ozdoby`, () => {
        const data = maps[id];
        const index = C.indexMap(data);
        assert.equal(data.id, id);
        assert.ok(data.w > 400 && data.h > 400 && Math.max(data.w, data.h) === 1000);
        assert.ok(data.t.length >= 14 && data.t.length <= 60, `${data.t.length} území`);
        assert.ok(fs.statSync(path.join(ROOT, 'data', `dobyvani-${id}.json`)).size < 60000, 'malý soubor');
        assert.ok(data.maxPlayers >= 2 && data.maxPlayers <= 8);
        assert.ok(data.treasures >= 1 && data.treasures <= 5);
        const ids = new Set(data.t.map(t => t.id));
        assert.equal(ids.size, data.t.length);
        for (const item of data.t) {
            assert.ok(item.n && /\p{Lu}/u.test(item.n[0]), item.id);
            assert.ok(['n', 'f', 'm', 'p'].includes(item.g), item.n);
            assert.match(item.d, /^M[-\d. ]+l/);
            const rings = C.parseRings(item.d);
            assert.ok(rings.length >= 1);
            assert.ok(C.pointInRings(item.a[0], item.a[1], rings), `bod popisku ${item.n} leží v území`);
            const [x0, y0, x1, y1] = item.b;
            assert.ok(item.a[0] >= x0 && item.a[0] <= x1 && item.a[1] >= y0 && item.a[1] <= y1);
            assert.ok(item.r > 0);
            assert.ok(item.nb.length >= 1, `${item.n} má souseda`);
            for (const other of item.nb) {
                assert.ok(ids.has(other), `${item.n} → ${other}`);
                assert.ok(index.neighbours.get(other).has(item.id), `sousedství ${item.n} – ${other} oboustranně`);
            }
            assert.ok(index.regionById.has(item.reg), `${item.n} je v regionu`);
        }
        // Souvislý graf: z prvního území se dá dojít všude
        const seen = new Set([data.t[0].id]);
        const queue = [data.t[0].id];
        while (queue.length) for (const next of index.neighbours.get(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
        assert.equal(seen.size, data.t.length, 'souvislý graf');
        // Regiony: každé území právě v jednom, aspoň dvě území, obrys pro zlatou záři
        const inRegions = data.regions.flatMap(region => region.t);
        assert.equal(inRegions.length, data.t.length);
        assert.equal(new Set(inRegions).size, data.t.length);
        for (const region of data.regions) {
            assert.ok(region.t.length >= 2, region.n);
            assert.match(region.d, /^M/);
            region.t.forEach(t => assert.equal(index.byId.get(t).reg, region.id));
        }
        assert.ok(data.regions.length >= 6 && data.regions.length <= 9);
        for (const [a, b] of data.sea) assert.ok(index.neighbours.get(a).has(b), 'námořní spoj je sousedství');
        for (const [x, y] of data.deco) assert.ok(x > 0 && y > 0 && x < data.w && y < data.h);
    });
}

test('Evropa: zadané území a námořní spoje, bez trpasličích států; Rusko evropské, Turecko celé', () => {
    const data = maps.evropa;
    const index = C.indexMap(data);
    const byName = Object.fromEntries(data.t.map(t => [t.n, t.id]));
    for (const name of ['Česko', 'Německo', 'Rusko', 'Turecko', 'Island', 'Kypr', 'Kosovo', 'Lucembursko', 'Severní Makedonie']) assert.ok(byName[name], name);
    for (const name of ['Vatikán', 'San Marino', 'Monako', 'Lichtenštejnsko', 'Andorra', 'Malta']) assert.ok(!byName[name], name);
    const link = (a, b) => index.neighbours.get(byName[a]).has(byName[b]);
    for (const [a, b] of [['Spojené království', 'Francie'], ['Irsko', 'Spojené království'], ['Island', 'Norsko'], ['Island', 'Spojené království'], ['Dánsko', 'Švédsko'],
        ['Dánsko', 'Norsko'], ['Kypr', 'Řecko'], ['Kypr', 'Turecko'], ['Estonsko', 'Finsko'], ['Itálie', 'Albánie'], ['Česko', 'Německo'], ['Polsko', 'Rusko']]) assert.ok(link(a, b), `${a} – ${b}`);
    assert.ok(!link('Česko', 'Francie'));
    // Rusko je jen evropská část: bod popisku západně od Uralu
    const russia = index.byId.get(byName.Rusko);
    assert.ok(russia.a[0] < data.w && russia.b[2] <= data.w + 30);
    assert.equal(data.t.length, 41);
});

test('Česko: 14 krajů s krajskými městy a tvary, sousedství podle skutečných hranic', () => {
    const data = maps.cesko;
    const index = C.indexMap(data);
    assert.equal(data.t.length, 14);
    const byName = Object.fromEntries(data.t.map(t => [t.n, t]));
    assert.deepEqual(byName.Praha.nb, [byName['Středočeský kraj'].id]);
    assert.equal(byName['Jihomoravský kraj'].seat, 'Brno');
    assert.equal(byName['Kraj Vysočina'].loc, 'v Kraji Vysočina');
    for (const item of data.t) if (item.n !== 'Praha' && item.n !== 'Středočeský kraj') assert.ok(item.seat && item.gen && item.loc, item.n);
    assert.ok(index.neighbours.get(byName['Jihočeský kraj'].id).has(byName['Jihomoravský kraj'].id));
    assert.ok(!index.neighbours.get(byName['Karlovarský kraj'].id).has(byName['Středočeský kraj'].id));
    // Místo v Česku se najde ve správném kraji
    assert.equal(C.territoryAt(data, 49.195, 16.608), byName['Jihomoravský kraj'].id);
    assert.equal(C.territoryAt(data, 50.087, 14.421), byName.Praha.id);
    assert.equal(C.territoryAt(data, 49.738, 13.373), byName['Plzeňský kraj'].id);
});

// Ukázkový stav hry: A (já) Česko a Slovensko, B Německo s hradbou a domovem v Polsku
const sampleState = () => ({
    id: 'g1', map: 'evropa', status: 'running', period: 'day', actions: 5, ends_at: '2026-11-15T10:00:00Z',
    players: [
        { id: 'A', display_name: 'Jana', seat: 0, flag_color: 'cervena', emblem: 'lev', me: true, score: 2, score_at: '2026-11-12T10:00:00Z' },
        { id: 'B', display_name: 'Petr', seat: 1, flag_color: 'modra', emblem: 'orel', score: 2, score_at: '2026-11-12T09:00:00Z' }
    ],
    territories: maps.evropa.t.map(t => ({ t: t.id, o: { Q213: 'A', Q214: 'A', Q183: 'B', Q36: 'B' }[t.id] || null, l: t.id === 'Q183' ? 2 : 0, h: t.id === 'Q213' || t.id === 'Q36', p: t.id === 'Q40' })),
    budget: { period: 0, base: 5, regions: 0, treasures: 0, loot: 0, used: 1, total: 5, left: 4 },
    moves: [
        { id: 1, u: 'A', k: 'home', t: 'Q213', r: 'home', n: 0, at: '2026-11-12T10:00:00Z' },
        { id: 2, u: 'A', k: 'attack', t: 'Q214', s: 'Q213', r: 'capture', n: 0, at: '2026-11-12T10:05:00Z' },
        { id: 3, u: 'B', k: 'fortify', t: 'Q183', r: 'fortify', l: 2, n: 0, at: '2026-11-12T10:06:00Z' },
        { id: 4, u: 'A', k: 'attack', t: 'Q183', s: 'Q213', r: 'breach', v: 'B', l: 1, n: 0, at: '2026-11-12T10:07:00Z' },
        { id: 5, u: 'B', k: 'attack', t: 'Q214', r: 'fail', v: 'A', n: 0, at: '2026-11-12T10:08:00Z' },
        { id: 6, u: 'A', k: 'attack', t: 'Q41', r: 'capture', p: true, n: 0, at: '2026-11-12T10:09:00Z' },
        { id: 7, u: 'B', k: 'attack', t: 'Q213', r: 'capture', h: true, v: 'A', n: 0, at: '2026-11-12T10:10:00Z' },
        { id: 8, u: 'A', k: 'fortify', t: 'Q214', r: 'fortify', l: 1, n: 0, at: '2026-11-12T10:11:00Z' }
    ]
});

test('pohled hry: cíle útoku jen sousedé, opevnění do 2 (domov 3), zdroje útoku od nejbližšího, pořadí se shodou', () => {
    const view = C.viewOf(sampleState(), maps.evropa, 'A');
    assert.equal(view.me.id, 'A');
    assert.ok(view.targets.has('Q183') && view.targets.has('Q40') && view.targets.has('Q36'));
    assert.ok(!view.targets.has('Q142'), 'Francie nesousedí');
    assert.ok(!view.targets.has('Q213'), 'vlastní není cíl');
    assert.deepEqual(C.actionsFor(view, 'Q183'), { attack: true, fortify: false, reason: '' });
    assert.equal(C.actionsFor(view, 'Q142').attack, false);
    assert.match(C.actionsFor(view, 'Q142').reason, /sousedí s tvým/);
    assert.deepEqual(C.actionsFor(view, 'Q213'), { attack: false, fortify: true, reason: '' });
    // Polsko (sousedí s Českem i Slovenskem): zdroje oba, bližší první
    assert.deepEqual(C.sourcesFor(view, 'Q36').sort(), ['Q213', 'Q214']);
    // Hradba na běžném území je maximum
    const walled = C.viewOf({ ...sampleState(), territories: sampleState().territories.map(row => (row.t === 'Q214' ? { ...row, l: 2 } : row)) }, maps.evropa, 'A');
    assert.match(C.actionsFor(walled, 'Q214').reason, /naplno/);
    // Bez tahů nic
    const tired = C.viewOf({ ...sampleState(), budget: { ...sampleState().budget, left: 0 } }, maps.evropa, 'A');
    assert.equal(C.actionsFor(tired, 'Q183').attack, false);
    assert.match(C.actionsFor(tired, 'Q183').reason, /Tahy na tohle období/);
    // Pořadí: shoda bodů → kdo dosáhl dřív (B)
    assert.deepEqual(view.ranking.map(p => [p.id, p.place]), [['B', 1], ['A', 2]]);
    assert.equal(C.maxLevel(true), 3);
    assert.equal(C.maxLevel(false), 2);
    // Celý region: Britské ostrovy (2 území) hráče A
    const region = C.viewOf({ ...sampleState(), territories: sampleState().territories.map(row => (['Q145', 'Q27'].includes(row.t) ? { ...row, o: 'A' } : row)) }, maps.evropa, 'A');
    assert.deepEqual(region.regionsOf('A'), ['britske-ostrovy']);
    assert.equal(region.scoreOf('A'), 4 + 2);
});

test('otázky: na každé mapě pro každé území a úroveň 4 možnosti, jedna správná, různé názvy; stejné semínko = stejná otázka', () => {
    const t = loadTopics();
    const kinds = new Map();
    for (const id of MAP_IDS) {
        const data = maps[id];
        for (const item of data.t) {
            for (const level of [0, 1, 2, 3]) {
                const question = C.buildQuestion({ data, territory: item.id, level, topics: t, seed: `test|${level}` });
                assert.ok(question, `${id} ${item.n} úroveň ${level}`);
                assert.equal(question.choices.length, 4);
                assert.equal(question.choices.filter(choice => choice.correct).length, 1, `${item.n}: jedna správná`);
                assert.equal(new Set(question.choices.map(choice => choice.label)).size, 4);
                assert.ok(question.prompt.endsWith('?'), question.prompt);
                assert.ok(question.difficulty >= 1 && question.difficulty <= 3);
                kinds.set(question.kind, (kinds.get(question.kind) || 0) + 1);
                if (question.kind === 'map') {
                    const rings = C.parseRings(item.d);
                    question.choices.forEach(choice => assert.ok(C.pointInRings(choice.point[0], choice.point[1], rings), `${item.n}: bod na mapě v území`));
                }
                if (question.images) question.choices.forEach(choice => assert.match(choice.image, /^https:\/\/upload\.wikimedia\.org\//));
            }
        }
    }
    for (const kind of ['capital', 'flag', 'place', 'map', 'neighbour']) assert.ok(kinds.get(kind) > 10, `druh ${kind}: ${kinds.get(kind)}`);
    const one = C.buildQuestion({ data: maps.evropa, territory: 'Q142', level: 2, topics: t, seed: 'g|attack|1|3' });
    const two = C.buildQuestion({ data: maps.evropa, territory: 'Q142', level: 2, topics: t, seed: 'g|attack|1|3' });
    assert.deepEqual(one, two);
    // Kraj: krajské město, místo v kraji
    const brno = C.buildQuestion({ data: maps.cesko, territory: 'Q192697', level: 0, topics: t, seed: 'kraj' });
    assert.ok(brno);
    const seat = Array.from({ length: 80 }, (_, n) => C.buildQuestion({ data: maps.cesko, territory: 'Q192697', level: 0, topics: t, seed: `s${n}` })).find(q => q.kind === 'capital');
    assert.ok(seat, 'otázka na krajské město');
    assert.equal(seat.prompt, 'Které město je krajským městem Jihomoravského kraje?');
    assert.equal(seat.choices.find(choice => choice.correct).label, 'Brno');
});

// --- Rodiny otázek ze všech témat: rozložení, jednoznačnost, obtížnost, čeština ---
const Chain = require('../chain.js');
const core = require('../quiz-core.js');
const plain = (text) => core.normalizeAnswer(text);
// Otázky jako při měření: každé území každé mapy × úroveň 0–2 × 6 semínek
let built = null;
const allQuestions = () => {
    if (built) return built;
    const t = loadAllTopics();
    built = [];
    for (const id of MAP_IDS) for (const item of maps[id].t) for (const level of [0, 1, 2]) for (let s = 0; s < 6; s++) {
        built.push({ map: id, item, level, question: C.buildQuestion({ data: maps[id], territory: item.id, level, topics: t, seed: `rozlozeni|${s}` }) });
    }
    return built;
};
// Otázky každé rodiny zvlášť (i vzácné rodiny jako sochy nebo opery): každé území, úroveň 0 a 2
let byFamily = null;
const familyQuestions = () => {
    if (byFamily) return byFamily;
    const t = loadAllTopics();
    byFamily = [];
    for (const id of MAP_IDS) for (const family of C.FAMILY_IDS) for (const item of maps[id].t) for (const level of [0, 2]) {
        const question = C.buildQuestion({ data: maps[id], territory: item.id, level, topics: t, seed: `rodina|${level}`, only: family });
        if (question) byFamily.push({ map: id, item, level, question });
    }
    return byFamily;
};

test('otázky: napřed obor, pak rodina (Evropa: všech 6 oborů, zeměpis nejvýš 60 %, u území s daty ve víc oborech nejvýš 40 %), rodina nejvýš 13 % (Afrika 18 %)', () => {
    const counts = {};
    const domains = {};
    for (const { map, item, level, question } of allQuestions()) {
        assert.ok(question, `${map} ${item.n} úroveň ${level}`);
        assert.equal(question.domain, C.FAMILY_DOMAIN[question.family], question.family);
        counts[map] = counts[map] || {};
        counts[map][question.family] = (counts[map][question.family] || 0) + 1;
        domains[map] = domains[map] || {};
        domains[map][question.domain] = (domains[map][question.domain] || 0) + 1;
    }
    const percent = (value) => `${(value * 100).toFixed(1)} %`;
    for (const id of MAP_IDS) {
        const total = Object.values(counts[id]).reduce((a, b) => a + b, 0);
        const share = (family) => (counts[id][family] || 0) / total;
        const families = Object.keys(counts[id]);
        assert.ok(families.length >= ({ evropa: 35, cesko: 12 }[id] || 20), `${id}: ${families.length} rodin`);
        // Afrika: malé státy mají známé položky jen v zeměpisu (pár rodin na území), proto víc
        for (const family of families) assert.ok(share(family) <= (id === 'afrika' ? 0.18 : 0.13), `${id}: ${family} ${percent(share(family))}`);
        assert.ok(share('flag') + share('capital') <= 0.25, `${id}: vlajka a hlavní město ${percent(share('flag') + share('capital'))}`);
        families.forEach(family => assert.ok(C.FAMILY_IDS.includes(family), family));
    }
    // Evropa: všechny obory, zeměpis nanejvýš 60 % (dřív kolem 65 %; malé státy mají známé jen zeměpisné položky)
    const europe = domains.evropa;
    const europeTotal = Object.values(europe).reduce((a, b) => a + b, 0);
    for (const domain of Object.keys(C.DOMAINS)) assert.ok(europe[domain] > 0, `Evropa: obor ${domain}`);
    assert.ok(europe.geo / europeTotal <= 0.6, `Evropa: zeměpis ${percent(europe.geo / europeTotal)}`);
    // Území, kde data stačí (v plánu úrovně 0 aspoň 5 oborů): zeměpis nanejvýš 40 % a aspoň 4 obory mezi jejich otázkami
    const t = loadAllTopics();
    const rich = new Set(maps.evropa.t.filter(item => new Set(C.familyPlan({ data: maps.evropa, territory: item.id, level: 0, topics: t }).map(entry => entry.domain)).size >= 5).map(item => item.id));
    assert.ok(rich.size >= 10, `Evropa: území s daty ve víc oborech ${rich.size}`);
    const richDomains = {};
    for (const { map, item, question } of allQuestions()) if (map === 'evropa' && rich.has(item.id)) richDomains[question.domain] = (richDomains[question.domain] || 0) + 1;
    const richTotal = Object.values(richDomains).reduce((a, b) => a + b, 0);
    assert.ok(richDomains.geo / richTotal <= 0.4, `Evropa (území s daty): zeměpis ${percent(richDomains.geo / richTotal)}`);
    assert.ok(Object.keys(richDomains).length >= 4, Object.keys(richDomains).join(', '));
    // Plán Francie: obory podle DOMAINS, žádná rodina nad FAMILY_CAP, podíly dávají 1
    const plan = C.familyPlan({ data: maps.evropa, territory: 'Q142', level: 0, topics: t });
    const planDomains = {};
    plan.forEach(entry => { planDomains[entry.domain] = (planDomains[entry.domain] || 0) + entry.share; });
    assert.ok(Math.abs(plan.reduce((sum, entry) => sum + entry.share, 0) - 1) < 1e-9);
    const present = Object.keys(planDomains).reduce((sum, domain) => sum + C.DOMAINS[domain], 0);
    for (const [domain, value] of Object.entries(planDomains)) assert.ok(Math.abs(value - C.DOMAINS[domain] / present) < 0.03, `Francie: ${domain} ${percent(value)}`);
    plan.forEach(entry => assert.ok(entry.share <= C.FAMILY_CAP + 1e-9, `${entry.id} ${percent(entry.share)}`));
    // Malý stát bez známých osobností: jen zeměpis, a i tak žádná rodina nad FAMILY_CAP podílu (zbytek rovnoměrně)
    const small = C.familyPlan({ data: maps.evropa, territory: 'Q37', level: 0, topics: t });
    assert.ok(small.every(entry => entry.domain === 'geo'), small.map(entry => entry.id).join(', '));
    // Rodiny se na Evropě opravdu objevují (i nové: osobnosti politiky, události, věda, herectví, opery, plemena, mytologie)
    for (const family of ['river', 'region', 'writer', 'musician', 'artist', 'filmmaker', 'actor', 'athlete', 'ruler', 'politician', 'historic', 'event', 'book', 'club', 'venue',
        'olympics', 'battle', 'physicist', 'astronomer', 'chemist', 'invention', 'dog', 'myth', 'population', 'area', 'bigcity']) {
        assert.ok(counts.evropa[family] > 0, `Evropa: rodina ${family}`);
    }
    for (const family of ['castle', 'club', 'venue', 'battle', 'band', 'bigcity', 'neighbour']) assert.ok(counts.cesko[family] > 0, `Česko: rodina ${family}`);
    // Každá rodina jde aspoň na jedné mapě sestavit (i vzácné: sochy, obrazy, filmy, hudební díla, opery)
    const any = new Set(familyQuestions().map(entry => entry.question.family));
    for (const family of C.FAMILY_IDS) assert.ok(any.has(family), `rodina ${family}`);
});

test('otázky ze všech témat: 4 různé možnosti, jedna správná, odpověď nezazní v otázce a neprozradí území ani jeho (krajské) hlavní město', () => {
    const capitals = new Map(loadAllTopics().zemepis.filter(it => it.c === 'stat').map(it => [it.q, (it.f || {}).cap]));
    const GENERIC = new Set(['kraj', 'republika', 'demokraticka', 'spojene', 'staty', 'americke', 'kralovstvi', 'severni', 'jizni', 'vychodni', 'zapadni', 'rovnikova', 'arabske', 'emiraty']);
    const stems = (name) => plain(name).split(' ').filter(word => word.length >= 4 && !GENERIC.has(word)).map(word => word.slice(0, 5));
    for (const { map, item, question } of [...allQuestions(), ...familyQuestions()]) {
        const where = `${map} ${item.n}: ${question.prompt}`;
        assert.equal(question.choices.length, 4, where);
        assert.equal(question.choices.filter(choice => choice.correct).length, 1, where);
        assert.equal(new Set(question.choices.map(choice => plain(choice.label))).size, 4, where);
        assert.ok(question.prompt.endsWith('?'), where);
        assert.ok(question.difficulty >= 1 && question.difficulty <= 3);
        if (question.kind === 'map' || question.images) continue;
        const answer = question.choices.find(choice => choice.correct).label;
        assert.ok(!` ${plain(question.prompt)} `.includes(` ${plain(answer)} `), `${where} → ${answer}`);
        const words = plain(answer).split(' ');
        const giveaways = [item.n, ...(question.family === 'capital' ? [] : [item.loc ? item.seat : capitals.get(item.id)])].filter(Boolean);
        for (const stem of giveaways.flatMap(stems)) assert.ok(!words.some(word => word.startsWith(stem)), `${where} → ${answer} (${stem})`);
    }
});

test('otázky ze všech témat: správná možnost vazbu splňuje, nesprávné ne (ani jmenovec v datech, dvojí národnost, popis), známost podle úrovně', () => {
    const t = loadAllTopics();
    const UK = 'Spojené království';
    const SOVIET = ['Rusko', 'Ukrajina', 'Bělorusko', 'Moldavsko', 'Lotyšsko', 'Litva', 'Estonsko', 'Gruzie', 'Arménie', 'Ázerbájdžán', 'Kazachstán', 'Uzbekistán', 'Turkmenistán', 'Tádžikistán', 'Kyrgyzstán'];
    const YUGO = ['Srbsko', 'Chorvatsko', 'Slovinsko', 'Bosna a Hercegovina', 'Černá Hora', 'Severní Makedonie', 'Kosovo'];
    // Země v datech, které jsou celé dnešním státem (části států, starší názvy, německé a italské země, starověký Egypt)
    const LAND = { USA: ['Spojené státy americké'], Anglie: [UK], Skotsko: [UK], Wales: [UK], 'Severní Irsko': [UK], 'Království Velké Británie': [UK], 'Spojené království Velké Británie a Irska': [UK, 'Irsko'],
        'Západní Německo': ['Německo'], 'Německá demokratická republika': ['Německo'], 'Italské království': ['Itálie'], 'Nizozemské království': ['Nizozemsko'], 'Rumunské království': ['Rumunsko'],
        'Protektorát Čechy a Morava': ['Česko'], 'Československo': ['Česko', 'Slovensko'], 'Sovětský svaz': SOVIET, 'Jugoslávie': YUGO, 'Socialistická federativní republika Jugoslávie': YUGO,
        'Srbsko a Černá Hora': ['Srbsko', 'Černá Hora', 'Kosovo'], Flandry: ['Belgie', 'Nizozemsko', 'Francie'], 'Württemberské království': ['Německo'], 'Bavorské království': ['Německo'],
        'Saské království': ['Německo'], 'Hesenské velkovévodství': ['Německo'], 'Hesensko-Kasselsko': ['Německo'], Hamburk: ['Německo'], 'Sasko-výmarsko-eisenašské vévodství': ['Německo'],
        'Toskánské velkovévodství': ['Itálie'], 'Florentská republika': ['Itálie'], Florencie: ['Itálie'], 'Neapolské království': ['Itálie'], 'Sicilské království': ['Itálie'],
        'Spojené provincie nizozemské': ['Nizozemsko'], 'Gdaňsk': ['Polsko'], 'starověký Egypt': ['Egypt'], 'Ptolemaiovský Egypt': ['Egypt'] };
    const landNames = (land) => (Array.isArray(land) ? land : String(land || '').split(/,\s*/)).filter(Boolean).flatMap(name => LAND[name] || [name]);
    const SOURCES = { city: ['zemepis:mesto'], building: ['zemepis:stavba', 'architektura:stavby'], castle: ['zemepis:stavba', 'architektura:stavby'], mountain: ['zemepis:hora'], lake: ['zemepis:jezero'],
        island: ['zemepis:ostrov'], nature: ['zemepis:priroda'], river: ['zemepis:reka'], region: ['vlajky:regiony'], writer: ['literatura:spisovatele'], musician: ['hudba:skladatele', 'hudba:hudebnici'],
        band: ['hudba:kapely'], artist: ['umeni:umelci', 'umeni:fotografove', 'umeni:ilustratori'], architect: ['architektura:architekti'], filmmaker: ['film:reziseri'], actor: ['film:herci'],
        athlete: ['sport:sportovci'], ruler: ['historie:statnik', 'historie:panovnik'], politician: ['historie:statnik', 'historie:osobnost'], historic: ['historie:osobnost'],
        event: ['historie:udalosti', 'historie:bitva'], physicist: ['fyzika:fyzici'], astronomer: ['fyzika:astronomove'], chemist: ['chemie:chemici'], invention: ['fyzika:vynalezy'],
        book: ['literatura:dila'], 'music-work': ['hudba:dila', 'hudba:opery'], opera: ['hudba:opery'], painting: ['umeni:obrazy'], sculpture: ['umeni:sochy'],
        film: ['film:filmy', 'film:animovane'], club: ['sport:kluby'], venue: ['sport:sportoviste'], olympics: ['sport:olympiady'], battle: ['historie:bitva'], dog: ['biologie:plemena'] };
    // Místa: odpověď smí být i méně známá (území bez známé řeky), nesprávné možnosti nízko známé
    const PLACES = new Set(['city', 'building', 'castle', 'mountain', 'lake', 'island', 'nature', 'river', 'region']);
    const PERSON_TOPICS = ['literatura', 'hudba', 'umeni', 'architektura', 'film', 'sport', 'historie', 'fyzika', 'chemie'];
    const byName = new Map();
    const byQ = new Map();
    const personNamed = new Map();
    for (const topic of ALL_TOPICS) for (const it of t[topic]) {
        const key = `${topic}:${it.c}|${plain(it.n)}`;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(it);
        byQ.set(`${topic}:${it.q}`, it);
        if (PERSON_TOPICS.includes(topic) && it.f && it.f.born !== undefined) { if (!personNamed.has(plain(it.n))) personNamed.set(plain(it.n), []); personNamed.get(plain(it.n)).push(it); }
    }
    const named = (family, label) => SOURCES[family].flatMap(source => byName.get(`${source}|${plain(label)}`) || []);
    // Kraj: obec podle Vlajek a znaků (f.kraj), jinak podle polohy
    const krajIds = new Map(maps.cesko.t.map(item => [item.n, item.id]));
    const krajOfTown = new Map();
    for (const it of t.vlajky) if (it.c === 'cesko' && (it.f || {}).kraj) { const key = plain(it.n); krajOfTown.set(key, krajOfTown.has(key) ? null : krajIds.get(it.f.kraj)); }
    const krajOf = (it) => (it.c === 'mesto' && krajOfTown.get(plain(it.n)) !== undefined ? krajOfTown.get(plain(it.n)) : Number.isFinite(it.la) ? C.territoryAt(maps.cesko, it.la, it.lo) : null);
    const czechTown = new Map(t.zemepis.filter(it => it.c === 'mesto' && (it.co || []).includes('Q213')).map(it => [it.n, it]));
    const nations = (text) => Chain.nationalitiesIn(text || '');
    const personFits = (it, item) => Boolean(it) && [...landNames((it.f || {}).land), ...nations(`${it.ty || ''} ${it.d || ''}`)].includes(item.n);
    // Autor díla: Q z dat (malíř a sochař i z jiného tématu, Michelangelo je se zemí jen mezi architekty), u soch i jméno;
    // vynálezce podle jména (všechny osobnosti toho jména)
    const authorsOf = (family, it) => {
        const f = it.f || {};
        if (family === 'painting' || family === 'sculpture') {
            const found = f.bq ? PERSON_TOPICS.map(topic => byQ.get(`${topic}:${f.bq}`)).filter(Boolean) : [];
            return found.length ? found : family === 'sculpture' && f.by ? personNamed.get(plain(f.by)) || [] : [];
        }
        const own = byQ.get({ book: `literatura:${f.byq}`, 'music-work': `hudba:${f.byq}`, opera: `hudba:${f.byq}`, film: `film:${f.dirq}` }[family]);
        if (own) return [own];
        return family === 'invention' && f.by ? personNamed.get(plain(f.by)) || [] : [];
    };
    // Splňuje položka vazbu na území (u nesprávných možností i podle popisu)?
    const fits = (family, it, item, map) => {
        const f = it.f || {};
        if (map === 'cesko') {
            if (family === 'band') return krajOf(czechTown.get(f.city) || {}) === item.id;
            return krajOf(it) === item.id;
        }
        const own = landNames(f.land).includes(item.n) || nations(it.d).includes(item.n);
        if (['book', 'music-work', 'opera', 'painting', 'sculpture', 'film', 'invention'].includes(family)) return own || authorsOf(family, it).some(author => personFits(author, item));
        if (family === 'dog') return own || nations(it.n).includes(item.n);
        if (SOURCES[family][0].startsWith('zemepis') || ['region', 'olympics', 'battle', 'event', 'building', 'castle'].includes(family)) return (it.co || []).includes(item.id) || own;
        if (family === 'club' || family === 'venue') return own;
        return personFits(it, item);
    };
    // Rodina mimo zeměpis jde pro území, jen když má mezi daty aspoň jednu známou správnou odpověď (k = 1, ne pro znalce)
    const knownFor = new Map();
    const hasKnown = (family, item, map) => {
        const key = `${family}|${map}|${item.id}`;
        if (!knownFor.has(key)) knownFor.set(key, SOURCES[family].some(source => { const [topic, c] = source.split(':'); return t[topic].some(it => it.c === c && it.k === 1 && it.x !== 1 && fits(family, it, item, map)); }));
        return knownFor.get(key);
    };
    // Mytologie: území → mytologie (f.my), příbuzné mytologie (jejich postavy nesmí být nesprávnou možností) a slova v otázce
    const MYTH_OF = { Řecko: 'řecká', Itálie: 'římská', Egypt: 'egyptská', Norsko: 'severská', Švédsko: 'severská', Dánsko: 'severská', Island: 'severská', Irsko: 'keltská',
        'Spojené království': 'artušovské legendy', Česko: 'české pověsti', Indie: 'indická', Čína: 'čínská', Japonsko: 'japonská', Mexiko: 'aztécká', Peru: 'incká', Irák: 'mezopotámská', Írán: 'perská' };
    const MYTH_RELATED = { řecká: ['římská'], římská: ['řecká'], keltská: ['artušovské legendy'], 'artušovské legendy': ['keltská'], 'české pověsti': ['slovanská'], indická: ['perská'],
        perská: ['indická', 'mezopotámská'], čínská: ['japonská'], japonská: ['čínská'], aztécká: ['mayská'], mezopotámská: ['kanaánská', 'židovsko-křesťanská', 'perská'] };
    const MYTH_WORDS = { 'artušovské legendy': 'artušovských legend', 'české pověsti': 'českých pověstí' };
    const mythWords = (my) => MYTH_WORDS[my] || `${my.replace(/á$/, 'é')} mytologie`;
    const myths = new Map();
    for (const it of t.mytologie) { if (!myths.has(plain(it.n))) myths.set(plain(it.n), []); myths.get(plain(it.n)).push(it); }
    const stat = new Map(t.zemepis.filter(it => it.c === 'stat').map(it => [it.q, it.f]));
    const statByName = new Map(t.zemepis.filter(it => it.c === 'stat').map(it => [it.n, it.f]));
    // „68 milionů“, „4,4 milionu“, „620 tisíc“, „9 300 km²“ → číslo
    const parseNumber = (label) => {
        const value = Number(label.replace(/km²/, '').replace(/[^\d,]/g, '').replace(',', '.'));
        return value * (/miliard/.test(label) ? 1e9 : /milion/.test(label) ? 1e6 : /tisíc/.test(label) ? 1e3 : 1);
    };
    const checked = {};
    for (const { map, item, level, question } of [...allQuestions(), ...familyQuestions()]) {
        const family = question.family;
        const where = `${map} ${item.n} L${level}: ${question.prompt} [${question.choices.map(choice => `${choice.correct ? '*' : ''}${choice.label}`).join(' | ')}]`;
        const right = question.choices.find(choice => choice.correct);
        const wrong = question.choices.filter(choice => !choice.correct);
        if (SOURCES[family]) {
            assert.ok(named(family, right.label).some(it => fits(family, it, item, map)), `správně: ${where}`);
            for (const choice of wrong) {
                const found = named(family, choice.label);
                assert.ok(found.length > 0, `v datech: ${choice.label} (${where})`);
                assert.ok(!found.some(it => fits(family, it, item, map)), `nesprávně ${choice.label}: ${where}`);
            }
            // Známost: nikdy jen pro znalce; na úrovni 0–1 známé (místa: odpověď smí být méně známá); mimo zeměpis jen území se známou odpovědí
            for (const choice of question.choices) {
                const found = named(family, choice.label);
                assert.ok(found.some(it => it.x !== 1), `pro znalce ${choice.label}: ${where}`);
                if (level <= 1 && !(choice.correct && PLACES.has(family))) assert.ok(found.some(it => it.k === 1 && it.x !== 1), `neznámé ${choice.label}: ${where}`);
                if (family === 'invention') assert.ok(found.every(it => !((it.f || {}).xn || []).length), `sporný vynálezce ${choice.label}: ${where}`);
                if (family === 'dog') assert.ok(found.every(it => (it.f || {}).kind === 'pes'), `plemeno psa ${choice.label}: ${where}`);
            }
            if (!PLACES.has(family) && question.domain !== 'geo') assert.ok(hasKnown(family, item, map), `bez známé odpovědi: ${where}`);
        } else if (family === 'myth') {
            const my = MYTH_OF[item.n];
            assert.ok(my, `mytologie území: ${where}`);
            assert.ok(question.prompt.includes(` do ${mythWords(my)}?`), where);
            const mythsOf = (label) => (myths.get(plain(label)) || []).map(it => (it.f || {}).my || '');
            assert.deepEqual(mythsOf(right.label), [my], `správně: ${where}`);
            for (const choice of wrong) {
                const found = mythsOf(choice.label);
                assert.equal(found.length, 1, `jednoznačně: ${choice.label} (${where})`);
                assert.ok(found[0] && found[0] !== my && !(MYTH_RELATED[my] || []).includes(found[0]) && !/ a /.test(found[0]), `nesprávně ${choice.label} (${found[0]}): ${where}`);
            }
            for (const choice of question.choices) {
                const it = myths.get(plain(choice.label))[0];
                assert.ok(it.x !== 1 && (level > 1 || it.k === 1), `známost ${choice.label}: ${where}`);
            }
        } else if (family === 'capital') {
            const own = item.loc ? item.seat : stat.get(item.id).cap;
            assert.equal(right.label, own, where);
        } else if (family === 'neighbour') {
            assert.ok(item.nb.includes(maps[map].t.find(other => other.n === right.label).id), where);
            for (const choice of wrong) assert.ok(!item.nb.includes(maps[map].t.find(other => other.n === choice.label).id), where);
        } else if (family === 'population' || family === 'area') {
            const field = family === 'population' ? 'pop' : 'area';
            const value = stat.get(item.id)[field];
            if (/než/.test(question.prompt)) {
                const more = /víc|větší/.test(question.prompt);
                const side = (choice) => (statByName.get(choice.label)[field] > value) === more;
                assert.ok(side(right), where);
                wrong.forEach(choice => assert.ok(!side(choice), where));
            } else {
                // Správná hodnota je ze čtyř nejblíž skutečné (aspoň dvojnásobek od ostatních)
                const distance = (choice) => Math.abs(Math.log(parseNumber(choice.label) / value));
                wrong.forEach(choice => assert.ok(distance(right) < Math.log(1.5) && distance(choice) > Math.log(1.5), where));
            }
        } else if (family === 'bigcity') {
            const popOf = (label) => (t.zemepis.find(it => it.c === 'mesto' && it.n === label && (map === 'cesko' ? (it.co || []).includes('Q213') : (it.co || [])[0] === item.id)) || {}).f.pop;
            const pops = question.choices.map(choice => popOf(choice.label));
            const most = /nejvíc/.test(question.prompt);
            assert.equal(popOf(right.label), most ? Math.max(...pops) : Math.min(...pops), where);
        }
        checked[family] = (checked[family] || 0) + 1;
    }
    for (const family of [...Object.keys(SOURCES), 'myth', 'capital', 'neighbour', 'population', 'area', 'bigcity']) assert.ok(checked[family] > 0, `ověřeno: ${family}`);
});

test('otázky: sporné a matoucí případy (dvojí národnost, řeka po hranici, krajské město v názvu kraje, sporné hlavní město, obec u hranice kraje)', () => {
    const t = loadAllTopics();
    const many = (mapId, territory, levels = [0, 1, 2, 3], count = 60) => {
        const out = [];
        for (const level of levels) for (let s = 0; s < count; s++) out.push(C.buildQuestion({ data: maps[mapId], territory, level, topics: t, seed: `spor|${s}` }));
        return out;
    };
    // Krajské město, které prozradí název kraje (Plzeň, Ústí nad Labem, Hradec Králové, Karlovy Vary), se neptá
    for (const kraj of ['Q46070', 'Q192702', 'Q193295', 'Q191091']) assert.ok(!many('cesko', kraj, [0, 1]).some(q => q.family === 'capital'), kraj);
    // Izrael a Jihoafrická republika: hlavní město není jednoznačné
    assert.ok(!many('asie', 'Q801', [0, 1]).some(q => q.family === 'capital'));
    assert.ok(!many('afrika', 'Q258', [0, 1]).some(q => q.family === 'capital'));
    // Černošice leží ve Středočeském kraji těsně u Prahy: nikdy odpovědí pro Prahu
    for (const q of many('cesko', 'Q1085')) assert.ok(!q.choices.some(c => c.correct && c.label === 'Černošice'));
    // Dunaj teče i po hranici Ukrajiny (data ji u něj nemají): pro Ukrajinu nesprávnou možností není
    const ukraine = many('evropa', 'Q212');
    assert.ok(ukraine.some(q => q.family === 'river'));
    for (const q of ukraine) assert.ok(!q.choices.some(c => !c.correct && c.label === 'Dunaj'));
    // Dvojí národnost (polsko-česká zpěvačka, český a rakouský skladatel, český německy píšící spisovatel): ani u jedné ze zemí
    const DUAL = { Q36: ['Ewa Farna'], Q213: ['Ewa Farna', 'Gustav Mahler', 'Franz Kafka'], Q40: ['Gustav Mahler', 'Franz Kafka'], Q183: ['Franz Kafka'] };
    for (const [territory, names] of Object.entries(DUAL)) {
        for (const q of many('evropa', territory)) assert.ok(!q.choices.some(c => !c.correct && names.includes(c.label)), `${territory}: ${q.prompt}`);
    }
    // Manželky panovníků podle titulu (Marie Luisa z Vídně „francouzská císařovna“, Maud z Londýna „norská královna“) odpovědí nejsou
    for (const [territory, name] of [['Q142', 'Marie Luisa Habsbursko-Lotrinská'], ['Q20', 'Maud z Walesu'], ['Q34', 'Luisa Ulrika Pruská']]) {
        for (const q of many('evropa', territory, [2, 3])) assert.ok(!q.choices.some(c => c.correct && c.label === name), `${territory}: ${q.prompt}`);
    }
    // Země úmrtí v datech (Trockij „z Mexika“): osobnost politiky bez národnosti v popisu se neptá vůbec
    for (const q of many('amerika', 'Q96', [0, 1, 2, 3], 30)) assert.ok(!q.choices.some(c => /Trockij/.test(c.label)), q.prompt);
    // „Československý politik“ Husák (ze Slovenska) není odpovědí pro Česko; Rilke z Prahy („rakouský básník“) není pro Česko nesprávnou možností
    for (const q of many('evropa', 'Q213')) {
        assert.ok(!q.choices.some(c => c.correct && c.label === 'Gustáv Husák'), q.prompt);
        assert.ok(!q.choices.some(c => !c.correct && c.label === 'Rainer Maria Rilke'), q.prompt);
    }
    // Fermiho reaktor (Ital v Chicagu) není odpovědí pro Itálii ani nesprávnou možností pro USA; Krvavá neděle (Petrohrad i Derry) vůbec
    for (const q of many('evropa', 'Q38')) assert.ok(!q.choices.some(c => c.correct && c.label === 'Jaderný reaktor'), q.prompt);
    for (const q of many('amerika', 'Q30')) assert.ok(!q.choices.some(c => c.label === 'Jaderný reaktor'), q.prompt);
    for (const q of many('evropa', 'Q145')) assert.ok(!q.choices.some(c => c.label === 'Krvavá neděle'), q.prompt);
    // Mytologie: příbuzné postavy nejsou nesprávnou možností (Jupiter u řecké, Merlin u keltské, Perun u českých pověstí)
    const ROMAN = new Set(t.mytologie.filter(it => (it.f || {}).myk === 'rimska').map(it => it.n));
    const ARTHUR = new Set(t.mytologie.filter(it => (it.f || {}).my === 'artušovské legendy').map(it => it.n));
    const SLAVIC = new Set(t.mytologie.filter(it => (it.f || {}).myk === 'slovanska').map(it => it.n));
    for (const [territory, related] of [['Q41', ROMAN], ['Q27', ARTHUR], ['Q213', SLAVIC]]) {
        const asked = many('evropa', territory).filter(q => q.family === 'myth');
        assert.ok(asked.length > 0, `${territory}: mytologie`);
        for (const q of asked) assert.ok(!q.choices.some(c => !c.correct && related.has(c.label)), `${territory}: ${q.prompt}`);
    }
    // Sporná území (Krym, Západní Sahara) nejsou ani odpovědí, ani nesprávnou možností
    for (const [mapId, territory] of [['evropa', 'Q212'], ['evropa', 'Q159'], ['afrika', 'Q1028']]) {
        for (const q of many(mapId, territory)) assert.ok(!q.choices.some(c => /Krym|Sevastopol|Ajún|Dachla/.test(c.label)), q.prompt);
    }
    // Soused po souši má přednost před námořním spojením mapy
    for (const q of many('asie', 'Q851', [0, 1, 2]).filter(q => q.family === 'neighbour')) assert.notEqual(q.choices.find(c => c.correct).label, 'Írán');
});

test('otázky: obtížnost roste s úrovní (nízko známější odpovědi a vzdálenější nesprávné možnosti)', () => {
    const t = loadAllTopics();
    const known = new Set();
    for (const topic of ALL_TOPICS) for (const it of t[topic]) if (it.k === 1) known.add(plain(it.n));
    const data = maps.evropa;
    const byName = new Map(data.t.map(item => [item.n, item]));
    const stats = [0, 3].map(level => {
        let facts = 0, famous = 0, far = 0, flags = 0;
        for (const item of data.t) for (let s = 0; s < 8; s++) {
            const q = C.buildQuestion({ data, territory: item.id, level, topics: t, seed: `obtiznost|${s}` });
            if (['place', 'person', 'work', 'sport', 'history'].includes(q.kind)) { facts += 1; if (known.has(plain(q.choices.find(c => c.correct).label))) famous += 1; }
            if (q.family === 'flag' || q.family === 'neighbour') {
                for (const choice of q.choices.filter(c => !c.correct)) { const other = byName.get(choice.label); far += Math.hypot(other.a[0] - item.a[0], other.a[1] - item.a[1]); flags += 1; }
            }
        }
        return { famous: famous / facts, far: far / flags };
    });
    assert.ok(stats[0].famous > stats[1].famous + 0.15, `známé odpovědi: úroveň 0 ${stats[0].famous.toFixed(2)}, úroveň 3 ${stats[1].famous.toFixed(2)}`);
    assert.ok(stats[0].far > stats[1].far * 1.2, `vzdálenost nesprávných: úroveň 0 ${stats[0].far.toFixed(0)}, úroveň 3 ${stats[1].far.toFixed(0)}`);
});

test('otázky: čeština (tvary názvů států a krajů, otázky na osobnosti bez rodu, obrazy podle malíře, opery podle skladatele, mytologie)', () => {
    const forms = (mapId, name) => { const f = C.formsOf(maps[mapId].t.find(item => item.n === name)); return [f.in, f.from, f.of, f.with]; };
    assert.deepEqual(forms('evropa', 'Francie'), ['ve Francii', 'z Francie', 'Francie', 'se státem Francie']);
    assert.deepEqual(forms('evropa', 'Slovensko'), ['na Slovensku', 'ze Slovenska', 'Slovenska', 'se státem Slovensko']);
    assert.deepEqual(forms('amerika', 'Spojené státy americké').slice(0, 3), ['ve Spojených státech amerických', 'ze Spojených států amerických', 'Spojených států amerických']);
    assert.deepEqual(forms('afrika', 'Mali').slice(0, 3), ['ve státě Mali', 'ze státu Mali', 'státu Mali']);
    assert.deepEqual(forms('cesko', 'Jihočeský kraj'), ['v Jihočeském kraji', 'z Jihočeského kraje', 'Jihočeského kraje', 's Jihočeským krajem']);
    assert.deepEqual(forms('cesko', 'Středočeský kraj'), ['ve Středočeském kraji', 'ze Středočeského kraje', 'Středočeského kraje', 'se Středočeským krajem']);
    assert.deepEqual(forms('cesko', 'Zlínský kraj').slice(1), ['ze Zlínského kraje', 'Zlínského kraje', 'se Zlínským krajem']);
    assert.deepEqual(forms('cesko', 'Praha'), ['v Praze', 'z Prahy', 'Prahy', 's Prahou']);
    assert.deepEqual(forms('cesko', 'Kraj Vysočina'), ['v Kraji Vysočina', 'z Kraje Vysočina', 'Kraje Vysočina', 's Krajem Vysočina']);
    const prompts = new Set([...allQuestions(), ...familyQuestions()].map(entry => entry.question.prompt));
    for (const prompt of prompts) {
        // Bez rodu u lidí („Kdo z těchto spisovatelů“ by vyloučil spisovatelky), bez zdvojených mezer a neznámých tvarů
        assert.doesNotMatch(prompt, /spisovatelů|skladatelů|hudebníků|sportovců|malířů|herců|režisérů|architektů|státníků|politiků|fyziků|chemiků|astronomů|kosmonautů|vynálezců|sochařů|panovníků/, prompt);
        assert.doesNotMatch(prompt, /^Kdo /, prompt);
        assert.doesNotMatch(prompt, /\s{2}|undefined|null/, prompt);
        assert.doesNotMatch(prompt, /ve státě (?:Francie|Německo|Česko|Polsko|Rakousko|Itálie|Španělsko|Japonsko|Čína|Indie|Brazílie|Kanada)\b/, prompt);
    }
    assert.ok([...prompts].some(prompt => /^Která z těchto literárních osobností pochází z /.test(prompt)));
    assert.ok([...prompts].some(prompt => /^Která z těchto řek teče ve Francii\?$/.test(prompt) || /^Která z těchto řek teče v /.test(prompt)));
    assert.ok([...prompts].some(prompt => /^Který z těchto obrazů namaloval malíř nebo malířka z /.test(prompt)));
    assert.ok([...prompts].some(prompt => /^Která z těchto osobností stála v čele /.test(prompt)));
    assert.ok([...prompts].some(prompt => /^Který z těchto krajů sousedí s/.test(prompt)));
    // Nové rodiny: osobnosti oboru (bez rodu), díla podle autora, události, plemena a mytologie
    for (const pattern of [/^Která z těchto osobností politiky pochází z Francie\?$/, /^Která z těchto událostí se odehrála v Německu\?$/, /^Která z těchto osobností fyziky pochází z /,
        /^Která z těchto osobností (?:astronomie|kosmonautiky|astronomie a kosmonautiky) pochází z /, /^Která z těchto osobností chemie pochází z /, /^Který z těchto vynálezů pochází z /,
        /^Kterou z těchto oper(?: a operet)? složil skladatel nebo skladatelka z /, /^Kterou z těchto soch vytvořil sochař nebo sochařka z /, /^Která z těchto hereckých osobností pochází z /,
        /^Která z těchto osobností filmové režie pochází z /, /^Které z těchto plemen psů pochází z Německa\?$/, /^Která z těchto postav patří do řecké mytologie\?$/,
        /^Která z těchto postav patří do severské mytologie\?$/, /^Která z těchto postav patří do českých pověstí\?$/, /^Která z těchto postav patří do egyptské mytologie\?$/]) {
        assert.ok([...prompts].some(prompt => pattern.test(prompt)), String(pattern));
    }
});

test('otázky: vlajky a znaky ve standardní šířce náhledu s původním souborem jako zálohou', () => {
    const flag = allQuestions().find(entry => entry.question.family === 'flag');
    assert.ok(flag);
    for (const choice of flag.question.choices) {
        assert.match(choice.image, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/250px-/);
        assert.match(choice.fallback, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+$/);
    }
    const html = C.questionHtml(flag.question, { title: 'Útok', item: flag.item, data: maps[flag.map] });
    assert.match(html, /data-fallback="https:\/\/upload\.wikimedia\.org\//);
    assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=/i);
});

test('kronika tažení: rod názvu, opevnění, pobourání, odražený útok, poklad, domov, návrat do hry', () => {
    const view = C.viewOf(sampleState(), maps.evropa, 'A');
    const items = C.feedItems(sampleState().moves, view);
    const texts = items.map(item => `${item.title}: ${item.text}`);
    assert.deepEqual(texts, [
        'Slovensko: Opevněno na Palisádu',
        'Česko: Domovský hrad dobyt',
        'Řecko: Poklad nalezen',
        'Řecko: Dobyto',
        'Slovensko: Útok odražen',
        'Německo: Hradba pobořena',
        'Německo: Opevněno na Hradbu',
        'Slovensko: Dobyto',
        'Česko: Výprava začíná'
    ]);
    assert.equal(items[1].actor.id, 'B');
    assert.equal(items[1].victim.id, 'A');
    // Rod: Francie dobyta, Kypr dobyt, Filipíny dobyty
    const feed = (map, t) => C.feedItems([{ id: 1, u: 'A', r: 'capture', t }], C.viewOf({ ...sampleState(), map }, maps[map], 'A'))[0].text;
    assert.equal(feed('evropa', 'Q142'), 'Dobyta');
    assert.equal(feed('evropa', 'Q229'), 'Dobyt');
    assert.equal(feed('asie', 'Q928'), 'Dobyty');
    assert.equal(feed('cesko', 'Q190930'), 'Dobyt');
    assert.equal(C.capturedWord({ g: 'f' }), 'dobyta');
    const respawn = C.feedItems([{ id: 9, u: 'B', r: 'respawn', t: 'Q20' }], view)[0];
    assert.equal(respawn.text, 'Návrat do hry');
});

test('přehrání podle období a odměny (jen poctivá hra, poslední místo bez XP)', () => {
    const steps = C.replaySteps([
        { r: 'home', t: 'Q213', u: 'A', n: 0 }, { r: 'home', t: 'Q36', u: 'B', n: 0 }, { r: 'capture', t: 'Q214', u: 'A', n: 0 },
        { r: 'fail', t: 'Q183', u: 'A', n: 1 }, { r: 'capture', t: 'Q183', u: 'B', n: 2 }, { r: 'respawn', t: 'Q20', u: 'A', n: 3 }
    ]);
    assert.deepEqual(steps.map(step => [step.period, step.changes.length]), [[0, 3], [2, 1], [3, 1]]);
    assert.deepEqual(C.rewardFor({ place: 1, players: 4, eligible: true }), { badge: true, xp: 150 });
    assert.deepEqual(C.rewardFor({ place: 2, players: 4, eligible: true }), { badge: false, xp: 100 });
    assert.deepEqual(C.rewardFor({ place: 3, players: 4, eligible: true }), { badge: false, xp: 50 });
    assert.deepEqual(C.rewardFor({ place: 3, players: 3, eligible: true }), { badge: false, xp: 0 });
    assert.deepEqual(C.rewardFor({ place: 2, players: 2, eligible: true }), { badge: false, xp: 0 });
    assert.deepEqual(C.rewardFor({ place: 1, players: 2, eligible: false }), { badge: false, xp: 0 });
});

test('texty času a nastavení', () => {
    assert.equal(C.timeLeft(2 * 86400000 + 5 * 3600000 + 1000), '2 d 5 h');
    assert.equal(C.timeLeft(3 * 3600000 + 20 * 60000), '3 h 20 min');
    assert.equal(C.timeLeft(12 * 60000), '12 min');
    assert.equal(C.timeLeft(10000), 'méně než minuta');
    assert.deepEqual(C.DURATIONS.map(C.durationLabel), ['6 h', '12 h', '1 den', '2 dny', '3 dny', '5 dní', '7 dní']);
    assert.equal(C.actionsLabel(3, 'hour'), '3 tahy za hodinu');
    assert.equal(C.actionsLabel(5, 'day'), '5 tahů za den');
    assert.equal(C.actionsLabel(1, 'day'), '1 tah za den');
});

test('ztracený hrad: nápověda (záložka Regiony) říká, že kdo přijde o domovský hrad, má v dalším období o 1 tah méně; počítadlo tahů a toast', () => {
    const regiony = C.helpHtml('regiony');
    assert.match(regiony, /<b[^>]*>Ztráta hradu:<\/b> Kdo přijde o domovský hrad, má v dalším období o 1 tah méně\./);
    // Tahy navíc zůstaly (poklad, kořist) a žádná záložka nemluví o rodu hráče
    assert.match(regiony, /\+1 tah v příštím období, když dobudeš domovské území soupeře/);
    const all = C.HELP_TABS.map(([id]) => C.helpHtml(id)).join('');
    assert.doesNotMatch(all, /\b(přišel jsi|přišla jsi|ztratil jsi|ztratila jsi|dobyl jsi|dobyla jsi)\b/);
    // Počítadlo v liště: bez postihu jen 4/5, s postihem 3/4 a červené −1 s hradem (i pro čtečku a v nápovědě po najetí)
    const state = sampleState();
    const plain = C.gameScreenHtml(C.viewOf(state, maps.evropa, 'A'));
    assert.match(plain, /data-cq-budget[^>]*title="Tahy v tomto období">/);
    assert.doesNotMatch(plain, /data-cq-penalty/);
    const lost = { ...state, budget: { ...state.budget, penalty: 1, total: 4, left: 3 } };
    const html = C.gameScreenHtml(C.viewOf(lost, maps.evropa, 'A'));
    assert.match(html, /title="Tahy v tomto období \(o 1 méně kvůli ztracenému hradu\)"/);
    assert.match(html, /3\/4<span data-cq-penalty[^>]*><i data-lucide="castle"[^>]*><\/i><span aria-hidden="true">−1<\/span><span class="sr-only">, o 1 méně kvůli ztracenému hradu<\/span>/);
    assert.doesNotMatch(html, /\sstyle=/);
    // Toast na začátku období: den i hodina, po ztrátě hradu s větou o tahu méně
    assert.equal(C.periodStartText({ ...state, budget: { ...state.budget, period: 2 } }), 'Začal 3. den hry.');
    assert.equal(C.periodStartText({ ...state, period: 'hour', budget: { ...state.budget, period: 0 } }), 'Začala 1. hodina hry.');
    assert.equal(C.periodStartText({ ...lost, budget: { ...lost.budget, period: 2 } }), 'Začal 3. den hry. Kvůli ztracenému hradu máš o tah méně.');
    assert.equal(C.periodStartText({ ...state, budget: null }), 'Začalo další období.');
    assert.equal(C.PENALTY_TEXT, 'Kvůli ztracenému hradu máš v tomto období o tah méně.');
});

test('vykreslení: mapa, náhled, obrazovky a okna bez inline stylů (CSP), klepací plocha pro každé území', () => {
    const state = sampleState();
    const view = C.viewOf(state, maps.evropa, 'A');
    const svg = C.mapSvg(maps.evropa, view);
    assert.equal((svg.match(/class="cq-hit" data-t=/g) || []).length, 41);
    assert.ok(svg.includes('cq-hatch-0') && svg.includes('cq-hatch-1'), 'šrafy hráčů');
    assert.ok(svg.includes('data-pin="Q183"') && svg.includes('data-icon="wall"') && svg.includes('data-icon="castle"') && svg.includes('data-icon="treasure"'));
    const html = [
        svg, C.mapSvg(maps.cesko, null), C.thumbSvg(maps.afrika, { Q258: 0 }, { 0: 'modra' }),
        C.gameScreenHtml(view), C.sheetHtml(view, 'Q183'), C.sheetHtml(view, 'Q213'), C.sheetHtml(view, 'Q142'),
        C.questionHtml(C.buildQuestion({ data: maps.evropa, territory: 'Q183', level: 1, topics: loadTopics(), seed: 'x' }), { title: 'Útok', item: C.indexMap(maps.evropa).byId.get('Q183'), data: maps.evropa }),
        C.feedHtml(C.feedItems(state.moves, view)), C.resultHtml(C.viewOf({ ...state, status: 'finished' }, maps.evropa, 'A'), { reward: { badge: true, xp: 150 } }),
        C.homeCardHtml({ games: [], maps }), C.homeCardHtml({ games: [{ ...state, budget: state.budget, owners: { Q213: 0 } }], maps }),
        C.hubHtml({ tab: 'create', body: C.createHtml({ draft: { map: 'cesko', hours: 12, players: 9, actions: 3, period: 'hour', visibility: 'private', color: 'modra', emblem: 'vlk' }, maps }) }),
        C.lookHtml({ color: 'modra', emblem: 'vlk', taken: ['cervena'] }), C.lookHtml({ color: 'modra', emblem: 'vlk', tab: 'emblem' }),
        C.lobbyDetailHtml({ game: { ...state, status: 'lobby', max_players: 4, hours: 72, code: 'K7M2QX', visibility: 'private' }, maps }),
        C.lobbyHtml({ games: [{ ...state, status: 'lobby', max_players: 4, hours: 72, preset: 'evropa-3d', mine: false }], maps }), C.mineHtml({ games: [], maps }), C.helpHtml()
    ].join('');
    assert.doesNotMatch(html, /\sstyle=/);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /NaN|undefined/);
    // Česko: nejvýš 6 hráčů (tlačítko víc je vypnuté), kraje mají cizinu místo moře
    assert.match(C.createHtml({ draft: { map: 'cesko', hours: 12, players: 9, actions: 3, period: 'hour', visibility: 'public', color: 'modra', emblem: 'vlk' }, maps }), /data-cq-value="players">6</);
    assert.match(C.mapSvg(maps.cesko, null), /cq-abroad/);
    // Karta bez her zve do lobby, s rozehranou hrou ukazuje tahy
    assert.match(C.homeCardHtml({ games: [], maps }), /Najdi hru nebo založ vlastní/);
    assert.match(C.homeCardHtml({ games: [{ ...state, budget: state.budget }], maps }), /Tahy 4\/5/);
});

test('vlajky a znaky v otázkách: náhled ve standardní šířce Commons (160 px Wikimedia odmítá), záloha na původní soubor', () => {
    const fl = ['Flag of Serbia.svg', 'ff'];
    assert.equal(C.THUMB, 250);
    assert.equal(C.flagUrl(fl), 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Flag_of_Serbia.svg/250px-Flag_of_Serbia.svg.png');
    assert.equal(C.flagFallback(fl), 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Flag_of_Serbia.svg');
    // Otázka na vlajku má u každé možnosti obrázek i zálohu a HTML zálohu nese (conquest-ui.js ji použije, když se náhled nenačte)
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dobyvani-evropa.json'), 'utf8'));
    const serbia = data.t.find(item => item.n === 'Srbsko');
    let question = null;
    for (let seed = 0; seed < 80 && !(question && question.kind === 'flag'); seed++) question = C.buildQuestion({ data, territory: serbia.id, level: 1, topics: {}, seed: `v${seed}` });
    assert.equal(question && question.kind, 'flag', 'některé semínko dá otázku na vlajku');
    {
        assert.ok(question.choices.every(choice => /\/250px-/.test(choice.image) && /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\//.test(choice.fallback)));
        assert.match(C.questionHtml(question, { title: 'Útok', item: serbia, data, answered: null }), /data-fallback="https:\/\/upload\.wikimedia\.org/);
    }
});

test('otázky se ve hře neopakují: stejná odpověď znovu nepřijde a stejný druh otázky nejde dvakrát po sobě', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dobyvani-evropa.json'), 'utf8'));
    const topics = loadAllTopics();
    const asked = { answers: [], families: [] };
    for (let i = 0; i < 30; i++) {
        const question = C.buildQuestion({ data, territory: 'Q142', level: i % 3, topics, seed: `hra|${i}`, avoid: asked });
        assert.ok(question, `otázka ${i + 1}`);
        const key = C.answerKey(question);
        assert.ok(!asked.answers.includes(key), `odpověď ${key} se zopakovala (${i + 1}. otázka)`);
        if (asked.families.length) assert.notEqual(question.family, asked.families[asked.families.length - 1], `druh ${question.family} dvakrát po sobě`);
        asked.answers.push(key);
        asked.families.push(question.family);
    }
});
