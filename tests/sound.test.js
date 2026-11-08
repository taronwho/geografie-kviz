// Zvuky a vibrace (sound.js): výchozí zapnuto, AudioContext až po gestu, krátké tichounké tóny, fronta bez překrývání,
// vibrace jen kde jsou, vypnutí se pamatuje; app.js přehrává jen zvuky, které existují
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sound = require('../sound.js');

const ROOT = path.join(__dirname, '..');

// Falešné Web Audio: zapisuje oscilátory (frekvence, začátek, konec) a stav kontextu
class FakeParam {
    constructor(log) { this.log = log; this.value = 0; }
    setValueAtTime(value, time) { this.log.push(['set', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.log.push(['ramp', value, time]); }
}
const fakeAudio = ({ state = 'suspended' } = {}) => {
    const created = [];
    class FakeContext {
        constructor() { this.state = state; this.currentTime = 10; this.destination = {}; this.resumed = 0; created.push(this); this.oscillators = []; }
        resume() { this.resumed += 1; this.state = 'running'; return Promise.resolve(); }
        suspend() { this.state = 'suspended'; return Promise.resolve(); }
        createGain() { const log = []; return { gain: new FakeParam(log), log, connect() {} }; }
        createOscillator() {
            const log = [];
            const osc = { type: '', frequency: new FakeParam(log), log, connect() {}, start: (t) => { osc.from = t; }, stop: (t) => { osc.to = t; } };
            this.oscillators.push(osc);
            return osc;
        }
        createBuffer() { return {}; }
        createBufferSource() { return { connect() {}, start() {} }; }
    }
    return { FakeContext, created };
};
const fakeStorage = (initial = {}) => {
    const data = { ...initial };
    return { data, getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
};
const fakeDocument = () => {
    const listeners = {};
    return { listeners, hidden: false, addEventListener: (type, fn) => { listeners[type] = fn; } };
};

test('výchozí stav: zvuky i vibrace zapnuté; uložené vypnutí platí, poškozená data = výchozí', () => {
    assert.deepEqual(Sound.DEFAULTS, { sound: true, vibration: true });
    assert.deepEqual(Sound.readPrefs(fakeStorage()), { sound: true, vibration: true });
    assert.deepEqual(Sound.readPrefs(fakeStorage({ [Sound.KEY]: '{"sound":false}' })), { sound: false, vibration: true });
    assert.deepEqual(Sound.readPrefs(fakeStorage({ [Sound.KEY]: '{"vibration":false}' })), { sound: true, vibration: false });
    assert.deepEqual(Sound.readPrefs(fakeStorage({ [Sound.KEY]: 'nesmysl{' })), { sound: true, vibration: true });
    assert.deepEqual(Sound.readPrefs({ getItem: () => { throw new Error('zakázané úložiště'); } }), { sound: true, vibration: true });
});

test('zvuky jsou krátké, tiché a v příjemném rozsahu', () => {
    for (const [name, notes] of Object.entries(Sound.SOUNDS)) {
        assert.ok(notes.length >= 1, name);
        assert.ok(Sound.lengthOf(name) <= 1.2, `${name}: ${Sound.lengthOf(name)} s`);
        for (const note of notes) {
            assert.ok(note.f >= 80 && note.f <= 2000 && (!note.to || (note.to >= 80 && note.to <= 2000)), `${name}: ${note.f} Hz`);
            assert.ok(note.gain > 0 && note.gain * Sound.MASTER <= 0.2, `${name}: hlasitost ${note.gain}`);
            assert.ok(['sine', 'triangle'].includes(note.type), `${name}: měkký tvar vlny`);
        }
    }
    assert.ok(Sound.lengthOf('tick') <= 0.1, 'tik je jen cvaknutí');
    assert.equal(Sound.VIBRATIONS.wrong, 40, 'chyba = krátké cvrnknutí');
    assert.ok(Sound.VIBRATIONS.record.reduce((sum, ms) => sum + ms, 0) <= 500, 'rekord = krátký rytmus');
});

test('AudioContext vznikne až při gestu hráče; před ním je ticho', () => {
    const { FakeContext, created } = fakeAudio();
    const doc = fakeDocument();
    const sound = Sound.create({ storage: fakeStorage(), AudioContext: FakeContext, navigator: {}, document: doc });
    assert.equal(created.length, 0, 'bez gesta žádný kontext');
    assert.equal(sound.play('correct'), false);
    for (const type of ['pointerdown', 'keydown', 'touchend', 'click']) assert.equal(typeof doc.listeners[type], 'function', type);
    doc.listeners.pointerdown();
    assert.equal(created.length, 1);
    assert.equal(created[0].resumed, 1, 'kontext se v gestu probudí');
    doc.listeners.click();
    assert.equal(created.length, 1, 'jen jeden kontext');
    assert.equal(sound.play('correct'), true);
    // iOS 17+: zvuky se mísí s hudbou hráče a respektují tichý režim
    const nav = { audioSession: { type: 'auto' } };
    Sound.create({ storage: fakeStorage(), AudioContext: FakeContext, navigator: nav, document: fakeDocument() }).unlock();
    assert.equal(nav.audioSession.type, 'ambient');
    const oscillators = created[0].oscillators;
    assert.deepEqual(oscillators.map(osc => osc.log[0][1]), [659.25, 880], 'E5 → A5');
    assert.ok(oscillators.every(osc => osc.to > osc.from), 'tóny se zastaví');
});

test('zvuky jdou po sobě (odpověď, pak oslava), dlouhá fronta se zahodí; skrytá stránka mlčí', () => {
    const { FakeContext, created } = fakeAudio({ state: 'running' });
    const doc = fakeDocument();
    const sound = Sound.create({ storage: fakeStorage(), AudioContext: FakeContext, navigator: {}, document: doc });
    sound.unlock();
    const ctx = created[0];
    assert.equal(sound.play('correct'), true);
    const correctStart = ctx.oscillators[0].from;
    assert.equal(sound.play('level'), true);
    const levelStart = ctx.oscillators[2].from;
    assert.ok(levelStart > correctStart + 0.1, 'oslava až po zvuku odpovědi');
    // Další a další oslavy: co by začalo víc než 1,5 s pozdě, se nepřehraje
    let played = 0;
    for (let i = 0; i < 10; i++) if (sound.play('record')) played += 1;
    assert.ok(played >= 1 && played < 10, `zahraje jen pár (${played})`);
    assert.equal(sound.play('nesmysl'), false);
    doc.hidden = true;
    ctx.currentTime = 100;
    assert.equal(sound.play('tick'), false, 'skrytá aplikace');
});

test('vypnuté zvuky mlčí a kontext se uspí; zapnutí ho probudí; volba se uloží', () => {
    const { FakeContext, created } = fakeAudio({ state: 'running' });
    const storage = fakeStorage();
    const sound = Sound.create({ storage, AudioContext: FakeContext, navigator: {}, document: fakeDocument() });
    sound.unlock();
    sound.set({ sound: false });
    assert.equal(JSON.parse(storage.data[Sound.KEY]).sound, false);
    assert.equal(created[0].state, 'suspended');
    assert.equal(sound.play('correct'), false);
    assert.deepEqual(sound.prefs(), { sound: false, vibration: true });
    sound.set({ sound: true, nesmysl: 1, vibration: 'ano' });
    assert.deepEqual(sound.prefs(), { sound: true, vibration: true }, 'neznámé klíče a ne-boolean hodnoty se ignorují');
    assert.equal(created[0].state, 'running');
    assert.equal(sound.play('correct'), true);
    // Vypnuté zvuky od startu: kontext se nevytvoří ani při gestu
    const quiet = fakeAudio();
    const doc = fakeDocument();
    Sound.create({ storage: fakeStorage({ [Sound.KEY]: '{"sound":false}' }), AudioContext: quiet.FakeContext, navigator: {}, document: doc });
    doc.listeners.pointerdown();
    assert.equal(quiet.created.length, 0);
});

test('vibrace: při chybě krátce, jen když je zařízení umí a jsou zapnuté', () => {
    const calls = [];
    const navigator = { vibrate: (pattern) => { calls.push(pattern); return true; } };
    const storage = fakeStorage();
    const sound = Sound.create({ storage, AudioContext: null, navigator, document: fakeDocument() });
    assert.equal(sound.canVibrate(), true);
    sound.answer(true);
    assert.deepEqual(calls, [], 'správná odpověď nevibruje');
    sound.answer(false);
    assert.deepEqual(calls, [40]);
    assert.equal(sound.vibrate('record'), true);
    assert.deepEqual(calls[1], Sound.VIBRATIONS.record);
    sound.set({ vibration: false });
    assert.equal(sound.vibrate('wrong'), false);
    assert.equal(calls.length, 2);
    const noVibration = Sound.create({ storage: fakeStorage(), AudioContext: null, navigator: {}, document: fakeDocument() });
    assert.equal(noVibration.canVibrate(), false, 'iPhone: bez navigator.vibrate');
    assert.equal(noVibration.vibrate('wrong'), false);
    // Bez Web Audio nic nespadne
    noVibration.unlock();
    assert.equal(noVibration.play('correct'), false);
    assert.equal(noVibration.hasAudio(), false);
});

test('app.js přehrává jen existující zvuky a vibrace', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const played = [...app.matchAll(/Sound\.play\('([a-zA-Z]+)'\)/g)].map(match => match[1])
        .concat([...app.matchAll(/Sound\.play\([^()']*\? '([a-zA-Z]+)' : '([a-zA-Z]+)'\)/g)].flatMap(match => [match[1], match[2]]));
    const vibrated = [...app.matchAll(/Sound\.vibrate\('([a-zA-Z]+)'\)/g)].map(match => match[1]);
    // Zvuky oslav: poslední argument showCelebration (nová úroveň, titul, odznak)
    const celebrations = [...app.matchAll(/newTitle \? '([a-z]+)' : '([a-z]+)'\)/g)].flatMap(match => [match[1], match[2]]);
    const badges = [...app.matchAll(/'Nový odznak', title, '([a-z]+)'\)/g)].map(match => match[1]);
    for (const name of [...played, ...celebrations, ...badges]) assert.ok(Sound.SOUNDS[name], `zvuk ${name}`);
    for (const name of vibrated) assert.ok(name in Sound.VIBRATIONS, `vibrace ${name}`);
    assert.deepEqual([...new Set(celebrations)].sort(), ['level', 'title']);
    assert.deepEqual(badges, ['badge']);
    assert.ok(played.includes('record') && played.includes('tick') && played.includes('tickLast'));
    assert.match(app, /Sound\.answer\(/, 'zvuk odpovědi v běžné hře');
});
