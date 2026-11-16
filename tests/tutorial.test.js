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
    assert.deepEqual(ids, ['fact', 'badge', 'quiz', 'daily', 'play', 'multi', 'progress', 'settings', 'try', 'hint', 'choice', 'result', 'menu']);
    assert.equal(new Set(ids).size, ids.length);
    for (const step of Tutorial.STEPS) {
        assert.ok(step.target && step.title && step.text && step.wait, step.id);
        assert.match(step.owl, /^sova-[a-z]+$/, step.id);
        assert.ok(['tap', 'info'].includes(step.mode), step.id);
        assert.ok(['tour', 'try'].includes(step.phase), step.id);
        assert.doesNotMatch(step.target + step.text, /<|style=/, step.id);
    }
    const phases = Tutorial.STEPS.map(step => step.phase);
    assert.deepEqual(phases, ['tour', 'tour', 'tour', 'tour', 'tour', 'tour', 'tour', 'tour', 'try', 'try', 'try', 'try', 'try']);
    for (const step of Tutorial.STEPS.filter(step => step.phase === 'tour' && step.id !== 'fact')) assert.equal(step.mode, 'info', `prohlídka jen vysvětluje: ${step.id}`);
    assert.equal(Tutorial.STEPS[Tutorial.TRY_INDEX].id, 'try');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'fact').target, '#fact-hint:not(.hidden)');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'fact').soft, true);
    assert.equal(Tutorial.STEPS.find(step => step.id === 'badge').target, '#status-badge');
    // Prohlídka na záložce Dnes: hlavička, dnešní výzvy a otázky, pak čtyři další záložky spodní lišty (jen se vysvětlí, nepřepíná se)
    assert.equal(Tutorial.STEPS.find(step => step.id === 'quiz').target, '#home-specials');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'daily').target, '#daily-card');
    for (const [id, tab, title] of [['play', 'hrat', 'Hrát'], ['multi', 'souperi', 'Soupeři'], ['progress', 'postup', 'Postup'], ['settings', 'ja', 'Já']]) {
        const step = Tutorial.STEPS.find(item => item.id === id);
        assert.equal(step.target, `[data-nav="${tab}"]`, id);
        assert.equal(step.title, title, id);
        assert.equal(step.mode, 'info', `záložka se jen vysvětlí, neotvírá: ${id}`);
        assert.ok(step.text.split(/[.!?](\s|$)/).filter(part => part && part.trim()).length <= 2, `jedna až dvě věty: ${id}`);
    }
    // Soupeři: bez hry více hráčů (bez Supabase) se krok vynechá; krátce, co tam je, a že to chce přihlášení
    const multi = Tutorial.STEPS.find(step => step.id === 'multi');
    assert.equal(multi.skippable, true, 'bez hry více hráčů se vynechá');
    assert.match(multi.text, /Výzvy/);
    assert.match(multi.text, /turnaje/);
    assert.match(multi.text, /Dobývání/);
    assert.match(multi.text, /přihlášení/);
    for (const step of Tutorial.STEPS.filter(item => item.phase === 'tour' && item.id !== 'fact')) assert.ok(step.text.length <= 130, `krátký text prohlídky: ${step.id}`);
    for (const step of Tutorial.STEPS) assert.ok(step.text.length <= 230, `krátký text: ${step.id}`);
    for (const step of Tutorial.STEPS) assert.doesNotMatch(`${step.text} ${step.intro || ''} ${step.wait} ${step.waitLong || ''}`, /Více hráčů|Jeden hráč|úvodní obrazovk/, `texty podle spodní lišty: ${step.id}`);
    // Zkoušení: klepnutí na kartu Dnešní otázky (Hrát vše, nebo výběr tématu)
    assert.equal(Tutorial.STEPS.find(step => step.id === 'try').target, '#daily-card');
    assert.equal(Tutorial.STEPS.find(step => step.id === 'try').hit, '#daily-card button');
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
    assert.deepEqual(Tutorial.plan(steps, at('badge'), presentIds('daily', 'play', 'settings')), { state: 'wait', index: at('badge') }, 'prohlídka nic nepřeskakuje');
    assert.deepEqual(Tutorial.plan(steps, at('daily'), presentIds('settings', 'play')), { state: 'wait', index: at('daily') }, 'dnešní otázky se načítají: čeká se');
    assert.deepEqual(Tutorial.plan(steps, at('try'), presentIds('settings', 'menu')), { state: 'wait', index: at('try') });
    assert.deepEqual(Tutorial.plan(steps, at('multi'), presentIds('progress', 'settings')), { state: 'show', index: at('progress') }, 'bez záložky Soupeři se jde na Postup');
    assert.deepEqual(Tutorial.plan(steps, at('multi'), presentIds('multi', 'progress')), { state: 'show', index: at('multi') });
    assert.deepEqual(Tutorial.plan(steps, at('quiz'), presentIds('daily', 'play')), { state: 'show', index: at('daily') }, 'bez dnešních výzev rovnou Dnešní otázky');
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('settings', 'play')), { state: 'wait', index: at('hint') }, 'otázka se ještě načítá');
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('hint')), { state: 'show', index: at('hint') });
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('choice')), { state: 'show', index: at('choice') }, 'bez nápovědy se jde na odpověď');
    assert.deepEqual(Tutorial.plan(steps, at('hint'), presentIds('result')), { state: 'show', index: at('result') }, 'už zodpovězená otázka: rovnou výsledek');
    assert.deepEqual(Tutorial.plan(steps, at('choice'), presentIds('result')), { state: 'show', index: at('result') }, 'odpověď Enterem nebo mimo bublinu');
    assert.deepEqual(Tutorial.plan(steps, at('choice'), presentIds('settings', 'play', 'menu')), { state: 'wait', index: at('choice') }, 'nepovinný krok nepřeskočí přes povinný výsledek');
    assert.deepEqual(Tutorial.plan(steps, at('result'), presentIds('menu')), { state: 'wait', index: at('result') });
    assert.deepEqual(Tutorial.plan(steps, at('menu'), presentIds()), { state: 'wait', index: at('menu') });
    assert.deepEqual(Tutorial.plan(steps, steps.length, () => true), { state: 'finished', index: steps.length });
});

test('počítadlo kroků podle skutečného počtu', () => {
    const steps = Tutorial.STEPS;
    assert.deepEqual(Tutorial.position(steps, 0), { n: 1, total: 13 });
    assert.deepEqual(Tutorial.position(steps, ids.indexOf('badge'), ['fact']), { n: 1, total: 12 }, 'bez žárovky o krok méně');
    assert.deepEqual(Tutorial.position(steps, ids.indexOf('badge'), ['fact', 'multi']), { n: 1, total: 11 }, 'bez záložky Soupeři (hra bez Supabase)');
    assert.deepEqual(Tutorial.position(steps, ids.indexOf('multi')), { n: 6, total: 13 });
    assert.deepEqual(Tutorial.position(steps, ids.indexOf('menu')), { n: 13, total: 13 });
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
    assert.match(Tutorial.textFor(badge, true), /Ahoj, jsem Mudrlant/);
    assert.equal(Tutorial.textFor(badge, false), badge.text);
    assert.equal(Tutorial.owlFor(badge, true), 'sova-vitej');
    assert.equal(Tutorial.owlFor(hint, false), 'sova-premysleni');
    assert.equal(Tutorial.textFor(hint, true), hint.text);
    // Hlavička hlavních obrazovek: krok radí klepnout na sovu (událost dne); postup má vlastní záložku a krok
    assert.match(Tutorial.textFor(badge, false), /Klepnutí na sovu otevře událost dne/);
    assert.equal(badge.narrowText, undefined);
    assert.match(Tutorial.STEPS[0].title, /Ahoj, jsem Mudrlant/);
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
