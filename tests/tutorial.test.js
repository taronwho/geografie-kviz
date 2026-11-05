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

test('kroky: prohlídka a pak zkoušení, jedinečná id, texty česky a zvýraznění přesně jednoho prvku', () => {
    assert.deepEqual(ids, ['fact', 'badge', 'daily', 'topics', 'settings', 'try', 'hint', 'choice', 'result', 'menu']);
    assert.equal(new Set(ids).size, ids.length);
    for (const step of Tutorial.STEPS) {
        assert.ok(step.target && step.title && step.text && step.wait, step.id);
        assert.match(step.owl, /^sova-[a-z]+$/, step.id);
        assert.ok(['tap', 'info'].includes(step.mode), step.id);
        assert.ok(['tour', 'try'].includes(step.phase), step.id);
        assert.doesNotMatch(step.target + step.text, /<|style=/, step.id);
    }
    const phases = Tutorial.STEPS.map(step => step.phase);
    assert.deepEqual(phases, ['tour', 'tour', 'tour', 'tour', 'tour', 'try', 'try', 'try', 'try', 'try']);
    for (const step of Tutorial.STEPS.filter(step => step.phase === 'tour' && step.id !== 'fact')) assert.equal(step.mode, 'info', `prohlídka jen vysvětluje: ${step.id}`);
    assert.equal(Tutorial.STEPS[Tutorial.TRY_INDEX].id, 'try');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'fact').target, '#fact-hint:not(.hidden)');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'fact').soft, true);
    assert.equal(Tutorial.STEPS.find(step => step.id === 'badge').target, '#status-badge');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'settings').target, '#btn-settings');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'settings').mode, 'info', 'Nastavení se jen vysvětlí, neotvírá');
    assert.match(Tutorial.STEPS.find(step => step.id === 'daily').target, /data-action="daily"/);
    assert.match(Tutorial.STEPS.find(step => step.id === 'topics').target, /play-topic/);
    assert.match(Tutorial.STEPS.find(step => step.id === 'try').title, /Teď si to zkusíme doopravdy/);
    assert.match(Tutorial.STEPS.find(step => step.id === 'hint').target, /data-action="hint"/);
    assert.equal(Tutorial.STEPS.find(step => step.id === 'hint').soft, true);
    assert.match(Tutorial.STEPS.find(step => step.id === 'choice').target, /data-action="choice"/);
    assert.match(Tutorial.STEPS.find(step => step.id === 'choice').target, /answer-form/, 'i psaná odpověď');
});

test('další krok: na chybějící prvek se čeká, přeskakují se jen nepovinné kroky', () => {
    const steps = Tutorial.STEPS;
    const at = (id) => ids.indexOf(id);
    assert.deepEqual(Tutorial.plan(steps, 0, presentIds('badge', 'daily'), false), { state: 'show', index: at('badge') }, 'bez žárovky se začne hlavičkou');
    assert.deepEqual(Tutorial.plan(steps, 0, presentIds('fact', 'badge'), false), { state: 'show', index: 0 });
    assert.deepEqual(Tutorial.plan(steps, at('badge'), presentIds('daily', 'topics', 'settings')), { state: 'wait', index: at('badge') }, 'prohlídka nic nepřeskakuje');
    assert.deepEqual(Tutorial.plan(steps, at('daily'), presentIds('settings', 'topics')), { state: 'wait', index: at('daily') }, 'dnešní otázky se načítají: čeká se');
    assert.deepEqual(Tutorial.plan(steps, at('try'), presentIds('settings', 'menu')), { state: 'wait', index: at('try') });
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('settings', 'topics')), { state: 'wait', index: at('hint') }, 'otázka se ještě načítá');
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('hint')), { state: 'show', index: at('hint') });
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('choice')), { state: 'show', index: at('choice') }, 'bez nápovědy se jde na odpověď');
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('result')), { state: 'show', index: at('result') }, 'už zodpovězená otázka: rovnou výsledek');
    assert.deepEqual(Tutorial.plan(steps, at('choice'), presentIds('result')), { state: 'show', index: at('result') }, 'odpověď Enterem nebo mimo bublinu');
    assert.deepEqual(Tutorial.plan(steps, at('choice'), presentIds('settings', 'topics', 'menu')), { state: 'wait', index: at('choice') }, 'nepovinný krok nepřeskočí přes povinný výsledek');
    assert.deepEqual(Tutorial.plan(steps, at('result'), presentIds('menu')), { state: 'wait', index: at('result') });
    assert.deepEqual(Tutorial.plan(steps, at('menu'), presentIds()), { state: 'wait', index: at('menu') });
    assert.deepEqual(Tutorial.plan(steps, steps.length, () => true), { state: 'finished', index: steps.length });
});

test('počítadlo kroků podle skutečného počtu', () => {
    const steps = Tutorial.STEPS;
    assert.deepEqual(Tutorial.position(steps, 0), { n: 1, total: 10 });
    assert.deepEqual(Tutorial.position(steps, ids.indexOf('badge'), ['fact']), { n: 1, total: 9 }, 'bez žárovky o krok méně');
    assert.deepEqual(Tutorial.position(steps, ids.indexOf('menu')), { n: 10, total: 10 });
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
    assert.equal(Tutorial.shouldStart(memory({ 'mudrlant.tutorial': 'true' })), false, 'starý zápis = hotovo');
});

test('stav: běžící tutoriál se ukládá a pokračuje i po hraní; hotovo jen po dokončení či přeskočení', () => {
    const store = memory();
    Tutorial.markRunning(store, 6);
    assert.deepEqual(JSON.parse(store.data['mudrlant.tutorial']), { how: 'running', step: 6 });
    assert.equal(Tutorial.isRunning(store), true);
    assert.equal(Tutorial.isDone(store), false);
    assert.equal(Tutorial.resumeStep(store), 6);
    assert.equal(Tutorial.shouldStart(store), true);
    // Hráč mezitím hrál (má statistiky a postup): tutoriál přesto pokračuje
    const played = memory({ 'mudrlant.tutorial': JSON.stringify({ how: 'running', step: 7 }), 'mudrlant.stats': '{}', 'mudrlant.progress': '{"xp":12}', 'mudrlant.history': '[]' });
    assert.equal(Tutorial.shouldStart(played), true);
    assert.equal(Tutorial.resumeStep(played), 7);
    Tutorial.markRunning(played, 8);
    assert.equal(Tutorial.resumeStep(played), 8);
    Tutorial.markDone(played, 'done');
    assert.equal(Tutorial.shouldStart(played), false);
    assert.equal(Tutorial.resumeStep(played), 0);
    Tutorial.markRunning(store, 2, true);
    assert.deepEqual(JSON.parse(store.data['mudrlant.tutorial']), { how: 'running', step: 2, noFact: true });
    assert.equal(Tutorial.resumeNoFact(store), true);
    assert.equal(Tutorial.resumeNoFact(memory()), false);
    // Poškozený krok se opraví do mezí
    assert.equal(Tutorial.resumeStep(memory({ 'mudrlant.tutorial': JSON.stringify({ how: 'running', step: 99 }) })), Tutorial.STEPS.length - 1);
    assert.equal(Tutorial.resumeStep(memory({ 'mudrlant.tutorial': JSON.stringify({ how: 'running', step: 'x' }) })), 0);
    assert.equal(Tutorial.shouldStart(memory({ 'mudrlant.tutorial': JSON.stringify({ how: 'skipped' }), 'mudrlant.stats': '{}' })), false);
});

test('úložiště, které chybí nebo vyhazuje výjimky, tutoriál nerozbije', () => {
    const broken = { getItem() { throw new Error('zakázáno'); }, setItem() { throw new Error('zakázáno'); }, removeItem() { throw new Error('zakázáno'); } };
    assert.doesNotThrow(() => { Tutorial.markDone(broken, 'done'); Tutorial.markRunning(broken, 2); Tutorial.reset(broken); });
    assert.equal(Tutorial.isDone(broken), false);
    assert.equal(Tutorial.isRunning(broken), false);
    assert.equal(Tutorial.shouldStart(broken), true);
    assert.equal(Tutorial.shouldStart(null), true);
});

test('první ukázaný krok se představí sovou; bez žárovky nese uvítání hlavička', () => {
    const badge = Tutorial.STEPS.find(step => step.id === 'badge');
    const hint = Tutorial.STEPS.find(step => step.id === 'hint');
    assert.match(Tutorial.textFor(badge, true), /Ahoj, jsem Sova/);
    assert.equal(Tutorial.textFor(badge, false), badge.text);
    assert.equal(Tutorial.owlFor(badge, true), 'sova-vitej');
    assert.equal(Tutorial.owlFor(hint, false), 'sova-premysleni');
    assert.equal(Tutorial.textFor(hint, true), hint.text);
    assert.match(Tutorial.STEPS[0].title, /Ahoj, jsem Sova/);
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
