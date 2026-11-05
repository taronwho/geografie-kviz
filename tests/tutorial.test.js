// Testy tutoriálu při prvním spuštění: kroky, výběr dalšího kroku, uložený stav (tutorial.js). Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Tutorial = require('../tutorial.js');

const memory = (initial = {}) => {
    const data = { ...initial };
    return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, removeItem: (key) => { delete data[key]; }, data };
};
const ids = Tutorial.STEPS.map(step => step.id);
const presentIds = (...list) => (step) => list.includes(step.id);

test('kroky: pořadí, jedinečná id, texty česky a zvýraznění přesně jednoho prvku', () => {
    assert.deepEqual(ids, ['fact', 'daily', 'hint', 'choice', 'result', 'menu', 'home', 'multi', 'settings']);
    assert.equal(new Set(ids).size, ids.length);
    for (const step of Tutorial.STEPS) {
        assert.ok(step.target && step.title && step.text, step.id);
        assert.match(step.owl, /^sova-[a-z]+$/, step.id);
        assert.ok(['tap', 'info'].includes(step.mode), step.id);
        assert.doesNotMatch(step.target + step.text, /<|style=/, step.id);
    }
    assert.equal(Tutorial.STEPS.find(step => step.id === 'fact').target, '#fact-hint:not(.hidden)');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'settings').target, '#btn-settings');
    assert.match(Tutorial.STEPS.find(step => step.id === 'daily').target, /data-action="daily"/);
    assert.match(Tutorial.STEPS.find(step => step.id === 'hint').target, /data-action="hint"/);
    assert.match(Tutorial.STEPS.find(step => step.id === 'choice').target, /data-action="choice"/);
    // Krok o multiplayeru: jen informační, zvýrazní záložku Více hráčů, zmiňuje výzvy, odvetu, rating, ligy, týdenní žebříček a přihlášení
    const multi = Tutorial.STEPS.find(step => step.id === 'multi');
    assert.equal(multi.mode, 'info');
    assert.equal(multi.target, '[data-action="home-tab"][data-tab="multi"]');
    assert.ok(!multi.area && !multi.soft, 'nic se neklepe');
    for (const word of [/kód/, /přezdívk/, /odvet/, /rating/, /lig/, /týdenní žebříček/, /přihlášení/, /Google/]) assert.match(multi.text, word);
    assert.ok(ids.indexOf('multi') > ids.indexOf('home') && ids.indexOf('multi') < ids.indexOf('settings'), 'po tématech, před nastavením');
});

test('další krok: přeskočí kroky bez prvku, po klepnutí čeká na přesně následující', () => {
    const steps = Tutorial.STEPS;
    assert.deepEqual(Tutorial.plan(steps, 0, presentIds('daily', 'home', 'settings'), false), { state: 'show', index: 1 }, 'bez žárovky se začne dnešními otázkami');
    assert.deepEqual(Tutorial.plan(steps, 0, presentIds('fact', 'daily'), false), { state: 'show', index: 0 });
    assert.deepEqual(Tutorial.plan(steps, 2, presentIds('home', 'settings'), true), { state: 'wait', index: 2 }, 'otázka se ještě načítá');
    assert.deepEqual(Tutorial.plan(steps, 2, presentIds('hint'), true), { state: 'show', index: 2 });
    assert.deepEqual(Tutorial.plan(steps, 2, presentIds('home', 'settings'), false), { state: 'show', index: 6 }, 'po čekání se přeskočí');
    assert.deepEqual(Tutorial.plan(steps, 7, presentIds('settings'), false), { state: 'show', index: 8 }, 'bez záložky Více hráčů (bez přihlašování) se krok přeskočí');
    assert.deepEqual(Tutorial.plan(steps, 7, presentIds('multi', 'settings'), true), { state: 'show', index: 7 });
    assert.deepEqual(Tutorial.plan(steps, 3, presentIds('hint'), false), { state: 'wait', index: 3 }, 'dál není žádný prvek: čeká se, nekončí');
    assert.deepEqual(Tutorial.plan(steps, steps.length, () => true, false), { state: 'finished', index: steps.length });
    assert.equal(Tutorial.plan(steps, steps.length - 1, presentIds(), false).state, 'wait');
});

test('stav: spouští se jednou, hotový nebo přeskočený se nevrací, hráč s postupem ho nedostane', () => {
    const fresh = memory();
    assert.equal(Tutorial.shouldStart(fresh), true);
    Tutorial.markDone(fresh, 'skipped');
    assert.deepEqual(JSON.parse(fresh.data['mudrlant.tutorial']), { how: 'skipped' });
    assert.equal(Tutorial.isDone(fresh), true);
    assert.equal(Tutorial.shouldStart(fresh), false);
    Tutorial.reset(fresh);
    assert.equal(Tutorial.shouldStart(fresh), true, 'Projít znovu smaže stav');
    const done = memory();
    Tutorial.markDone(done, 'cokoli');
    assert.deepEqual(JSON.parse(done.data['mudrlant.tutorial']), { how: 'done' });
    for (const key of ['mudrlant.stats', 'mudrlant.progress', 'mudrlant.history']) assert.equal(Tutorial.shouldStart(memory({ [key]: '{}' })), false, key);
});

test('úložiště, které chybí nebo vyhazuje výjimky, tutoriál nerozbije', () => {
    const broken = { getItem() { throw new Error('zakázáno'); }, setItem() { throw new Error('zakázáno'); }, removeItem() { throw new Error('zakázáno'); } };
    assert.doesNotThrow(() => { Tutorial.markDone(broken, 'done'); Tutorial.reset(broken); });
    assert.equal(Tutorial.isDone(broken), false);
    assert.equal(Tutorial.shouldStart(broken), true);
    assert.equal(Tutorial.shouldStart(null), true);
});

test('první ukázaný krok se představí sovou; bez žárovky nese uvítání krok s otázkami', () => {
    const daily = Tutorial.STEPS.find(step => step.id === 'daily');
    const hint = Tutorial.STEPS.find(step => step.id === 'hint');
    assert.match(Tutorial.textFor(daily, true), /Ahoj, jsem Sova/);
    assert.equal(Tutorial.textFor(daily, false), daily.text);
    assert.equal(Tutorial.owlFor(daily, true), 'sova-vitej');
    assert.equal(Tutorial.owlFor(hint, false), 'sova-premysleni');
    assert.equal(Tutorial.textFor(hint, true), hint.text);
});

test('tutorial.js je zapojený: index.html, service worker, nasazení a Tailwind', () => {
    const root = path.join(__dirname, '..');
    const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(read('index.html'), /<script src="tutorial\.js" defer><\/script>/);
    assert.match(read('sw.js'), /'tutorial\.js'/);
    assert.match(read('.github/workflows/pages.yml'), /\btutorial\.js\b/);
    assert.match(read('tailwind.config.js'), /\.\/tutorial\.js/);
    assert.doesNotMatch(read('tutorial.js'), /setAttribute\(\s*['"]style|<script|style="/, 'bez inline stylů a skriptů (CSP)');
});
