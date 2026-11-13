// Zvuky a vibrace: krátké tóny syntetizované přes Web Audio (žádné zvukové soubory) a navigator.vibrate.
// AudioContext vzniká a probouzí se až při gestu hráče (klepnutí, klávesa) – pravidlo prohlížečů pro automatické přehrávání.
// Oboje jde vypnout v Nastavení → Hra (mudrlant.sound); ve výchozím stavu je zapnuté.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantSound = api.create({ window: root });
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const KEY = 'mudrlant.sound';
    const DEFAULTS = { sound: true, vibration: true };

    // Tóny: f = frekvence (Hz), to = konečná frekvence (klouzání), at = začátek od spuštění zvuku (s), dur = délka (s),
    // type = tvar vlny, gain = hlasitost (před společnou hlasitostí MASTER). Tóny jsou krátké a měkké (trojúhelník a sinus, rychlý náběh, doznění).
    const MASTER = 0.6;
    const n = (f, at, dur, extra = {}) => ({ f, at, dur, type: 'triangle', gain: 0.22, ...extra });
    const SOUNDS = {
        // Správně: dva stoupající tóny (E5 → A5)
        correct: [n(659.25, 0, 0.09), n(880, 0.07, 0.16)],
        // Špatně: tlumený klesající tón, ne bzučák
        wrong: [n(311.13, 0, 0.24, { to: 207.65, gain: 0.2 }), n(155.56, 0, 0.24, { to: 103.83, type: 'sine', gain: 0.14 })],
        // Tikání posledních sekund Bleskovky; poslední sekunda o tón výš
        tick: [n(1046.5, 0, 0.045, { type: 'sine', gain: 0.12 })],
        tickLast: [n(1318.51, 0, 0.07, { type: 'sine', gain: 0.14 })],
        // Nová úroveň: rozložený akord C dur nahoru
        level: [n(523.25, 0, 0.12), n(659.25, 0.09, 0.12), n(783.99, 0.18, 0.12), n(1046.5, 0.27, 0.3)],
        // Nový titul: totéž o kus delší, s oktávou navrch
        title: [n(523.25, 0, 0.12), n(659.25, 0.09, 0.12), n(783.99, 0.18, 0.12), n(1046.5, 0.27, 0.14), n(1318.51, 0.36, 0.4), n(659.25, 0.36, 0.4, { type: 'sine', gain: 0.1 })],
        // Odznak: třpytivé dva tóny a třetí výš
        badge: [n(783.99, 0, 0.1, { type: 'sine' }), n(987.77, 0.08, 0.1, { type: 'sine' }), n(1567.98, 0.16, 0.28, { type: 'sine', gain: 0.16 })],
        // Nový rekord: krátká fanfára
        record: [n(392, 0, 0.1), n(523.25, 0.1, 0.1), n(659.25, 0.2, 0.1), n(783.99, 0.3, 0.16), n(659.25, 0.46, 0.08), n(1046.5, 0.54, 0.45), n(523.25, 0.54, 0.45, { type: 'sine', gain: 0.12 })],
        // Zlatá otázka (gold.js): třpytivé stoupání nad tichým tónem, když se objeví
        gold: [n(1046.5, 0, 0.07, { type: 'sine', gain: 0.11 }), n(1318.51, 0.06, 0.07, { type: 'sine', gain: 0.12 }), n(1567.98, 0.12, 0.07, { type: 'sine', gain: 0.13 }),
            n(1975.53, 0.18, 0.32, { type: 'sine', gain: 0.13 }), n(783.99, 0, 0.5, { gain: 0.07 })],
        // Zlatý střípek: dvojí jasné cinknutí, když střípek doletí do počítadla
        shard: [n(1318.51, 0, 0.06, { type: 'sine', gain: 0.13 }), n(1975.53, 0.07, 0.26, { type: 'sine', gain: 0.14 }), n(987.77, 0.07, 0.26, { gain: 0.06 })],
        // Boss týdne (boss.js): zavrčení při nástupu, úder do bosse, zlom stupně (dramatický pád tónu), posměšný smích a pád bosse
        bossRoar: [n(196, 0, 0.32, { to: 130.81, gain: 0.12 }), n(130.81, 0, 0.6, { to: 87.31, gain: 0.2 }), n(98, 0.03, 0.6, { to: 82.41, type: 'sine', gain: 0.22 })],
        bossHit: [n(185, 0, 0.13, { to: 87.31, gain: 0.24 }), n(1567.98, 0.02, 0.08, { type: 'sine', gain: 0.12 }), n(1975.53, 0.06, 0.07, { type: 'sine', gain: 0.08 })],
        bossStage: [n(440, 0, 0.4, { to: 110, gain: 0.18 }), n(220, 0.05, 0.45, { gain: 0.16 }), n(164.81, 0.05, 0.5, { type: 'sine', gain: 0.16 })],
        bossLaugh: [n(392, 0, 0.09, { to: 349.23 }), n(392, 0.13, 0.09, { to: 349.23 }), n(466.16, 0.26, 0.16, { to: 311.13 })],
        bossDown: [n(392, 0, 0.24, { to: 370, gain: 0.16 }), n(349.23, 0.26, 0.24, { to: 329.63, gain: 0.16 }), n(293.66, 0.52, 0.5, { to: 196, gain: 0.16 }), n(98, 0.52, 0.5, { type: 'sine', gain: 0.2 })],
        // Kamarádské sázky (bets.js): mince se sypou k vítězi a cinkají (krátké vysoké tóny s tichým podtónem, nepravidelně po sobě)
        coins: [n(1975.53, 0, 0.06, { type: 'sine', gain: 0.16 }), n(1318.51, 0, 0.05, { type: 'sine', gain: 0.06 }), n(1760, 0.1, 0.06, { type: 'sine', gain: 0.15 }),
            n(1174.66, 0.1, 0.05, { type: 'sine', gain: 0.05 }), n(1864.66, 0.19, 0.05, { type: 'sine', gain: 0.14 }), n(1567.98, 0.27, 0.07, { type: 'sine', gain: 0.15 }),
            n(1046.5, 0.27, 0.05, { type: 'sine', gain: 0.05 }), n(1975.53, 0.36, 0.05, { type: 'sine', gain: 0.13 }), n(1760, 0.45, 0.12, { type: 'sine', gain: 0.16 }),
            n(1318.51, 0.45, 0.12, { type: 'sine', gain: 0.07 })]
    };
    // Vibrace: krátké cvrnknutí při chybě, rytmus při novém rekordu
    const VIBRATIONS = { wrong: 40, record: [70, 50, 70, 50, 160], bossHit: 25, bossStage: [60, 40, 110] };
    const lengthOf = (name) => Math.max(...SOUNDS[name].map(note => note.at + note.dur));

    const readPrefs = (storage) => {
        try {
            const saved = JSON.parse(storage.getItem(KEY) || 'null');
            return { sound: !(saved && saved.sound === false), vibration: !(saved && saved.vibration === false) };
        } catch (error) {
            return { ...DEFAULTS };
        }
    };

    // env: { window } v prohlížeči; testy podstrčí { storage, AudioContext, navigator, document }
    const create = (env = {}) => {
        const win = env.window || {};
        const storage = env.storage || (() => { try { return win.localStorage; } catch (error) { return null; } })() || { getItem: () => null, setItem: () => {} };
        const AudioContextClass = env.AudioContext || win.AudioContext || win.webkitAudioContext || null;
        const nav = env.navigator || win.navigator || {};
        const doc = env.document || win.document || null;
        let prefs = readPrefs(storage);
        let ctx = null;
        let master = null;
        // Kdy dozní poslední spuštěný zvuk: další začne až po něm (odpověď a hned oslava nové úrovně se nepřekryjí)
        let busyUntil = 0;
        const MAX_DELAY = 1.5;

        const canVibrate = () => typeof nav.vibrate === 'function';
        const hidden = () => Boolean(doc && doc.hidden);
        // Na gesto hráče: vytvořit nebo probudit AudioContext (bez zapnutých zvuků se nevytváří vůbec)
        const unlock = () => {
            if (!prefs.sound || !AudioContextClass) return;
            try {
                // Zvuky hry jen „do pozadí“: nepřeruší hudbu, kterou hráč poslouchá, a na iPhonu ztichnou s tichým režimem
                if (nav.audioSession && nav.audioSession.type !== 'ambient') nav.audioSession.type = 'ambient';
            } catch (error) { /* starší prohlížeč */ }
            try {
                if (!ctx) {
                    ctx = new AudioContextClass();
                    master = ctx.createGain();
                    master.gain.value = MASTER;
                    master.connect(ctx.destination);
                    // Starší iOS Safari se odemkne až přehráním (tichého) zvuku v gestu
                    const buffer = ctx.createBuffer(1, 1, 22050);
                    const silent = ctx.createBufferSource();
                    silent.buffer = buffer;
                    silent.connect(ctx.destination);
                    silent.start(0);
                }
                if (ctx.state !== 'running' && ctx.resume) ctx.resume().catch(() => {});
            } catch (error) { ctx = null; master = null; }
        };
        const tone = (start, note) => {
            const end = start + note.dur;
            const osc = ctx.createOscillator();
            osc.type = note.type;
            osc.frequency.setValueAtTime(note.f, start);
            if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(note.gain, start + Math.min(0.015, note.dur / 3));
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
            osc.connect(gain);
            gain.connect(master);
            osc.start(start);
            osc.stop(end + 0.02);
        };
        // Přehraje zvuk podle jména; vrátí true, když opravdu zazní (vypnuté zvuky, skrytá stránka nebo neodemčený kontext = ticho)
        const play = (name) => {
            if (!prefs.sound || !SOUNDS[name] || !ctx || !master || ctx.state !== 'running' || hidden()) return false;
            try {
                const now = ctx.currentTime;
                const start = Math.max(now + 0.01, busyUntil);
                // Fronta je moc dlouhá (víc oslav naráz): zvuk se vynechá, ať nehraje pozdě a mimo dění
                if (start - now > MAX_DELAY) return false;
                SOUNDS[name].forEach(note => tone(start + note.at, note));
                busyUntil = start + lengthOf(name) * 0.85;
                return true;
            } catch (error) { return false; }
        };
        const vibrate = (name) => {
            if (!prefs.vibration || !canVibrate() || hidden() || !(name in VIBRATIONS)) return false;
            try { return nav.vibrate(VIBRATIONS[name]) !== false; } catch (error) { return false; }
        };
        // Po odpovědi: správně / špatně (při chybě i krátká vibrace)
        const answer = (correct) => {
            play(correct ? 'correct' : 'wrong');
            if (!correct) vibrate('wrong');
        };
        const set = (change) => {
            prefs = { ...prefs, ...Object.fromEntries(Object.entries(change || {}).filter(([key, value]) => key in DEFAULTS && typeof value === 'boolean')) };
            try { storage.setItem(KEY, JSON.stringify(prefs)); } catch (error) { /* bez úložiště platí jen do zavření */ }
            if (!prefs.sound && ctx && ctx.suspend) ctx.suspend().catch(() => {});
            if (prefs.sound) unlock();
        };
        const getPrefs = () => ({ ...prefs });

        if (doc && doc.addEventListener) {
            for (const type of ['pointerdown', 'touchend', 'keydown', 'click']) doc.addEventListener(type, unlock, { capture: true, passive: true });
        }
        return { prefs: getPrefs, set, unlock, play, vibrate, answer, canVibrate, hasAudio: () => Boolean(AudioContextClass) };
    };

    return { KEY, DEFAULTS, SOUNDS, VIBRATIONS, MASTER, lengthOf, readPrefs, create };
});
