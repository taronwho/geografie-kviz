// Dobývání (conquest.js): barvy a znaky shodné se serverem, mapy (data/dobyvani-*.json: tvary, body popisků, souvislý graf sousedů,
// regiony, ozdoby), pravidla v pohledu (cíle útoku, opevnění, zdroje útoku, pořadí se shodou), otázky o území na všech mapách
// a úrovních (4 možnosti, jedna správná, stejné semínko = stejná otázka), kronika tažení s rodem názvů, přehrání, odměny, časy
// a vykreslení bez inline stylů (CSP).
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
const schema = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const sqlList = (name) => [...new RegExp(`function public\\.${name}\\(\\) returns text\\[\\]\\s+language sql immutable as \\$\\$ select array\\[([^\\]]+)\\]`).exec(schema)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);

test('barvy a znaky: 24 a 24, shodné se serverem, platné kresby a barvy', () => {
    assert.equal(C.COLORS.length, 24);
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
    assert.equal(C.emblemInk('namornicka'), '#ffffff');
    for (const emblem of C.EMBLEMS) {
        const markup = emblem.draw('#fff');
        assert.ok(markup.length > 40 && !/NaN|undefined/.test(markup), emblem.id);
        assert.doesNotMatch(markup, /style=/);
    }
    assert.equal(new Set(C.COLORS.map(c => c.name)).size, 24);
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
    const seat = [0, 1, 2, 3, 4, 5, 6, 7].map(n => C.buildQuestion({ data: maps.cesko, territory: 'Q192697', level: 0, topics: t, seed: `s${n}` })).find(q => q.kind === 'capital');
    assert.ok(seat, 'otázka na krajské město');
    assert.equal(seat.prompt, 'Které město je krajským městem Jihomoravského kraje?');
    assert.equal(seat.choices.find(choice => choice.correct).label, 'Brno');
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
