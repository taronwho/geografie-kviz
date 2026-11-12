// Mudrlantova kronika (chronicle.js): týden podle Prahy, denní záznamy, souhrn týdne (i prázdný a z dat před kronikou), srovnání s minulým
// týdnem, pravidla titulu týdne a cíle na příští týden, pruh na úvodu (neděle od 18:00 a pondělí, jednou za týden), karta do sdílení a HTML okna
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../chronicle.js');

const ROOT = path.join(__dirname, '..');
// Středa 11. 11. 2026 v poledne (Praha = UTC+1)
const at = (iso) => new Date(iso);
const TITLES = { zemepis: 'Zeměpis', historie: 'Historie', hudba: 'Hudba', vlajky: 'Vlajky', biologie: 'Biologie', chemie: 'Chemie', fyzika: 'Fyzika' };
const TOPICS = Object.entries(TITLES).map(([id, title]) => ({ id, title }));
// Odehraje n odpovědí v daný čas (správně podle vzoru)
const play = (state, iso, n, { topic = 'zemepis', correct = () => true, points = 3, xp = 10 } = {}) => {
    let s = state;
    let run = 0;
    for (let i = 0; i < n; i++) {
        const ok = correct(i);
        run = ok ? run + 1 : 0;
        s = K.record(s, { answered: true, correct: ok, points: ok ? points : 0, xp, topic, run }, at(iso));
    }
    return s;
};

test('týden začíná pondělím podle Prahy, popisek a dny týdne', () => {
    assert.equal(K.weekOf('2026-11-11'), '2026-11-09');
    assert.equal(K.weekOf('2026-11-09'), '2026-11-09');
    assert.equal(K.weekOf('2026-11-15'), '2026-11-09', 'neděle patří do týdne od pondělí');
    assert.equal(K.thisWeek(at('2026-11-15T22:59:00Z')), '2026-11-09', 'neděle 23:59 v Praze');
    assert.equal(K.thisWeek(at('2026-11-15T23:00:00Z')), '2026-11-16', 'půlnoc v Praze = nový týden, i když v UTC je ještě neděle');
    assert.equal(K.lastWeek(at('2026-11-16T08:00:00Z')), '2026-11-09');
    assert.deepEqual(K.pragueNow(at('2026-07-15T22:30:00Z')), { day: '2026-07-16', hour: 0, weekday: 3 }, 'letní čas (UTC+2)');
    assert.equal(K.weekLabel('2026-11-09'), '9. – 15. 11.');
    assert.equal(K.weekLabel('2026-10-26'), '26. 10. – 1. 11.', 'přes konec měsíce');
    assert.equal(K.weekDays('2026-12-28')[6], '2027-01-03', 'přes konec roku');
});

test('pruh na úvodu: od neděle 18:00 za končící týden, v pondělí za minulý, jinak ne', () => {
    assert.equal(K.stripWeek(at('2026-11-15T16:59:00Z')), null, 'neděle 17:59 v Praze');
    assert.equal(K.stripWeek(at('2026-11-15T17:00:00Z')), '2026-11-09', 'neděle 18:00 v Praze');
    assert.equal(K.stripWeek(at('2026-11-15T22:59:00Z')), '2026-11-09');
    assert.equal(K.stripWeek(at('2026-11-15T23:00:00Z')), '2026-11-09', 'pondělí 0:00 v Praze: minulý týden');
    assert.equal(K.stripWeek(at('2026-11-16T22:59:00Z')), '2026-11-09', 'pondělí 23:59');
    assert.equal(K.stripWeek(at('2026-11-16T23:00:00Z')), null, 'úterý už ne');
    assert.equal(K.stripWeek(at('2026-11-12T19:00:00Z')), null, 'čtvrtek večer ne');
    // Letní čas: neděle 18:00 v Praze = 16:00 UTC
    assert.equal(K.stripWeek(at('2026-07-19T15:59:00Z')), null);
    assert.equal(K.stripWeek(at('2026-07-19T16:00:00Z')), '2026-07-13');
});

test('denní záznam: odpovědi, správné, body, XP, téma, série, denní doba, objevy, výzvy a turnaj', () => {
    let s = K.parse(null);
    s = K.record(s, { answered: true, correct: true, points: 4, xp: 12, topic: 'zemepis', run: 1, learned: { name: 'Lichtenštejnsko', topic: 'zemepis' } }, at('2026-11-11T06:30:00Z')); // 7:30 ráno
    s = K.record(s, { answered: true, correct: false, points: 0, xp: 2, topic: 'historie', run: 0, map: true }, at('2026-11-11T22:30:00Z')); // 23:30 noc, ale ještě středa
    s = K.record(s, { challenge: 'win' }, at('2026-11-11T12:00:00Z'));
    s = K.record(s, { challenge: 'loss' }, at('2026-11-11T12:00:00Z'));
    s = K.record(s, { xp: 150, tourWins: 1 }, at('2026-11-11T12:00:00Z'));
    s = K.record(s, { answered: true, correct: true, points: 3, xp: 5, topic: 'zemepis', quiz: true, run: 1 }, at('2026-11-11T23:30:00Z')); // čtvrtek 0:30
    assert.deepEqual(s.days['2026-11-11'], { a: 2, c: 1, p: 4, xp: 164, n: 1, run: 1, cw: 1, cl: 1, cp: 2, tw: 1, m: 1, h: [1, 0, 0, 1], t: { zemepis: [1, 1], historie: [1, 0] }, ex: ['Lichtenštejnsko', 'zemepis'] });
    assert.deepEqual(s.days['2026-11-12'], { a: 1, c: 1, p: 3, xp: 5, run: 1, q: 1, h: [0, 0, 0, 1], t: { zemepis: [1, 1] } });
    // Staré dny se zahodí, poškozená data se pročistí
    const old = K.record({ days: { '2026-08-01': { a: 3 }, '2026-11-01': { a: 2, t: { 'X Y': [1, 1] }, h: 'x', ex: [5] }, nesmysl: { a: 1 } }, seen: 'včera' }, { xp: 1 }, at('2026-11-11T12:00:00Z'));
    assert.deepEqual(Object.keys(old.days).sort(), ['2026-11-01', '2026-11-11']);
    assert.deepEqual(old.days['2026-11-01'], { a: 2 });
    assert.equal(old.seen, '');
    assert.equal(K.markSeen(old, '2026-11-09').seen, '2026-11-09');
});

test('prázdný týden: nuly, bez titulu za téma, cíl začít a pruh se neukáže', () => {
    const s = K.summarize(null, '2026-11-09');
    assert.equal(s.answered, 0);
    assert.equal(s.accuracy, null);
    assert.equal(s.activeDays, 0);
    assert.deepEqual(s.played, [false, false, false, false, false, false, false]);
    assert.equal(s.top, null);
    assert.equal(K.verdict(s).id, 'klid');
    assert.equal(K.nextGoal(s, TOPICS).id, 'zacni');
    assert.deepEqual(K.compare(s, K.summarize(null, '2026-11-02')), { kind: 'none', pct: 0, text: '' });
    assert.deepEqual(K.pagesFor(s), ['titul', 'cisla', 'tema', 'zaver']);
    assert.equal(K.stripSummary(null, null, at('2026-11-15T18:00:00Z')), null);
});

test('souhrn týdne z denních záznamů: dny Po–Ne, přesnost, téma týdne, objev, série a výzvy; jiný týden se nepočítá', () => {
    let s = null;
    s = play(s, '2026-11-08T10:00:00Z', 9); // neděle minulého týdne
    s = play(s, '2026-11-09T10:00:00Z', 10, { correct: i => i !== 3 }); // pondělí
    s = play(s, '2026-11-11T10:00:00Z', 6, { topic: 'historie' }); // středa
    s = K.record(s, { answered: true, correct: true, points: 4, xp: 20, topic: 'zemepis', run: 7, learned: { name: 'Bhútán', topic: 'zemepis' } }, at('2026-11-15T19:00:00Z'));
    s = K.record(s, { challenge: 'win' }, at('2026-11-15T19:10:00Z'));
    const sum = K.summarize(s, '2026-11-09');
    assert.equal(sum.answered, 17);
    assert.equal(sum.correct, 16);
    assert.equal(sum.accuracy, 94);
    assert.equal(sum.xp, 180);
    assert.equal(sum.activeDays, 3);
    assert.deepEqual(sum.played, [true, false, true, false, false, false, true]);
    assert.deepEqual(sum.top, { id: 'zemepis', answered: 11, correct: 10 });
    assert.equal(sum.topics.length, 2);
    assert.equal(sum.bestRun, 7);
    assert.equal(sum.learned, 1);
    assert.deepEqual(sum.example, { name: 'Bhútán', topic: 'zemepis' });
    assert.deepEqual(sum.challenges, { played: 1, won: 1, lost: 0 });
    assert.equal(sum.label, '9. – 15. 11.');
    assert.equal(sum.end, '2026-11-15');
    assert.deepEqual(K.pagesFor(sum), ['titul', 'cisla', 'tema', 'souboje', 'zaver']);
    const before = K.summarize(s, '2026-11-02');
    assert.equal(before.answered, 9);
    assert.deepEqual(K.compare(sum, before), { kind: 'more', pct: 89, text: 'o 89 % víc než minulý týden' });
});

test('dny před kronikou se doplní z dnešních otázek a Kvízu dne (bez XP a objevů)', () => {
    const legacy = {
        daily: { zemepis: { '2026-11-09': { correct: true, points: 4 }, '2026-11-10': { correct: false, points: 0 }, '2026-11-02': { correct: true, points: 4 } }, historie: { '2026-11-09': { correct: true, points: 2 } }, 'špatně!': { '2026-11-09': { correct: true } } },
        quiz: { '2026-11-10': { answered: 10, correct: 7, score: 25 }, '2026-11-12': { answered: 10, correct: 9 } }
    };
    // Ve čtvrtek už kronika zapisuje: den se záznamem má přednost (dnešní otázky v něm už jsou)
    const state = play(null, '2026-11-12T10:00:00Z', 12, { topic: 'hudba', xp: 5 });
    const sum = K.summarize(state, '2026-11-09', legacy);
    assert.deepEqual(sum.played, [true, true, false, true, false, false, false]);
    assert.equal(sum.answered, 2 + 11 + 12);
    assert.equal(sum.correct, 2 + 7 + 12);
    assert.equal(sum.xp, 60, 'XP jen ze záznamů');
    assert.equal(sum.quizDays, 2, 'Kvíz dne v úterý (bez záznamu) i ve čtvrtek (podle historie Kvízu dne)');
    assert.deepEqual(sum.topics.map(t => t.id), ['hudba', 'zemepis', 'historie']);
    assert.equal(sum.recorded, 1);
    // Úplně bez záznamů: jen z dnešních otázek
    const only = K.summarize(null, '2026-11-02', legacy);
    assert.equal(only.answered, 1);
    assert.equal(only.accuracy, 100);
});

test('srovnání s minulým týdnem', () => {
    assert.deepEqual(K.compare({ answered: 123 }, { answered: 100 }), { kind: 'more', pct: 23, text: 'o 23 % víc než minulý týden' });
    assert.deepEqual(K.compare({ answered: 80 }, { answered: 100 }), { kind: 'less', pct: 20, text: 'o 20 % méně než minulý týden' });
    assert.deepEqual(K.compare({ answered: 50 }, { answered: 50 }), { kind: 'same', pct: 0, text: 'stejně jako minulý týden' });
    assert.equal(K.compare({ answered: 5 }, { answered: 0 }).kind, 'new');
    assert.equal(K.compare({ answered: 0 }, { answered: 40 }).kind, 'less');
    assert.equal(K.compare({ answered: 0 }, { answered: 40 }).pct, 100);
});

test('titul týdne podle pravidel: noc, ráno, výhry, sedm dní, přesnost, téma, všestrannost, výchozí', () => {
    const base = (over = {}) => ({ answered: 40, correct: 30, accuracy: 75, activeDays: 3, hours: [0, 40, 0, 0], challenges: { played: 0, won: 0, lost: 0 }, topics: [{ id: 'historie', answered: 15, correct: 10 }, { id: 'zemepis', answered: 14, correct: 10 }, { id: 'hudba', answered: 11, correct: 10 }], top: { id: 'historie', answered: 15, correct: 10 }, ...over });
    assert.equal(K.verdict(base({ hours: [0, 10, 10, 20] })).id, 'nocni');
    assert.equal(K.verdict(base({ hours: [0, 10, 10, 20] })).title, 'Noční sova týdne');
    assert.equal(K.verdict(base({ hours: [20, 10, 10, 0] })).title, 'Ranní ptáče týdne');
    assert.equal(K.verdict(base({ answered: 8, hours: [0, 0, 0, 8], top: null, topics: [] })).id, 'zvedavy', 'denní doba až od 10 odpovědí');
    assert.equal(K.verdict(base({ challenges: { played: 4, won: 3, lost: 1 } })).id, 'postrach');
    assert.match(K.verdict(base({ challenges: { played: 4, won: 3, lost: 1 } })).text, /^3 vyhrané výzvy/);
    assert.equal(K.verdict(base({ activeDays: 7 })).id, 'neunavny');
    assert.equal(K.verdict(base({ accuracy: 92 })).id, 'ostrostrelec');
    assert.equal(K.verdict(base({ accuracy: 92, answered: 20, hours: [0, 20, 0, 0], top: null, topics: [] })).id, 'zvedavy', 'přesnost až od 30 odpovědí');
    const geo = K.verdict(base({ top: { id: 'zemepis', answered: 25, correct: 20 } }), TITLES);
    assert.deepEqual([geo.id, geo.title, geo.topic, geo.owl], ['tema-zemepis', 'Zeměpisný cestovatel týdne', 'zemepis', 'dalekohled']);
    assert.equal(geo.text, 'Téma Zeměpis vedlo s 25 otázkami.');
    assert.equal(K.verdict(base({ top: { id: 'novetema', answered: 25, correct: 20 } }), { novetema: 'Nové' }).title, 'Nové: hvězda týdne');
    const many = base({ topics: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, answered: 6, correct: 4 })), top: { id: 't0', answered: 6, correct: 4 } });
    assert.equal(K.verdict(many).id, 'vsestranny');
    assert.equal(K.verdict(base()).id, 'zvedavy');
    // Každé téma aplikace má svůj titul
    const ids = fs.readdirSync(path.join(ROOT, 'topics')).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
    for (const id of ids) assert.ok(K.TOPIC_TITLES[id], `titul pro téma ${id}`);
    // Každá póza sovy v titulu existuje jako obrázek
    for (const v of [K.verdict({ answered: 0 }), K.verdict(base({ hours: [0, 10, 10, 20] })), K.verdict(base({ hours: [20, 10, 10, 0] })), K.verdict(base({ challenges: { played: 3, won: 3, lost: 0 } })), K.verdict(base({ activeDays: 7 })), K.verdict(base({ accuracy: 95 })), geo, K.verdict(base()), K.verdict(many)]) {
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `sova-${v.owl}.webp`)), `sova-${v.owl}`);
    }
});

test('cíl na příští týden', () => {
    const s = (over = {}) => ({ answered: 40, accuracy: 80, activeDays: 5, topics: TOPICS.map(t => ({ id: t.id, answered: 5, correct: 4 })), ...over });
    assert.equal(K.nextGoal(s({ activeDays: 2 })).id, 'dny');
    assert.match(K.nextGoal(s({ activeDays: 2 })).text, /aspoň 4 dny/);
    assert.match(K.nextGoal(s({ activeDays: 1 })).text, /aspoň 3 dny/);
    assert.equal(K.nextGoal(s({ accuracy: 50 })).id, 'presnost');
    const fresh = K.nextGoal(s({ topics: [{ id: 'zemepis', answered: 40, correct: 30 }] }), TOPICS);
    assert.deepEqual([fresh.id, fresh.topic], ['tema', 'historie']);
    assert.match(fresh.text, /Historie/);
    const more = K.nextGoal(s(), TOPICS);
    assert.equal(more.id, 'vic');
    assert.match(more.text, /Překonej 45 odpovědí/);
});

test('pruh: jen v okně pruhu, jen týden s aspoň dvěma dny hraní, po zhlédnutí nebo skrytí už ne', () => {
    let s = play(null, '2026-11-10T10:00:00Z', 5);
    const sunday = at('2026-11-15T18:30:00Z');
    assert.equal(K.stripSummary(s, null, sunday), null, 'jeden den nestačí');
    s = play(s, '2026-11-12T10:00:00Z', 5);
    assert.equal(K.stripSummary(s, null, sunday).week, '2026-11-09');
    assert.equal(K.stripSummary(s, null, at('2026-11-16T09:00:00Z')).week, '2026-11-09', 'pondělí');
    assert.equal(K.stripSummary(s, null, at('2026-11-13T19:00:00Z')), null, 'pátek ne');
    const seen = K.markSeen(s, '2026-11-09');
    assert.equal(K.stripSummary(seen, null, sunday), null);
    // Příští týden se ukáže znovu (seen platí jen pro svůj týden)
    let next = play(seen, '2026-11-17T10:00:00Z', 3);
    next = play(next, '2026-11-18T10:00:00Z', 3);
    assert.equal(K.stripSummary(next, null, at('2026-11-22T19:00:00Z')).week, '2026-11-16');
});

test('karta do sdílení a text', () => {
    const s = K.summarize(play(play(null, '2026-11-09T10:00:00Z', 1200, { correct: i => i % 5 !== 0, xp: 1 }), '2026-11-11T10:00:00Z', 3), '2026-11-09');
    const v = K.verdict(s, TITLES);
    const card = K.cardInput(s, v, { robe: 'zelena', url: 'https://x.test/app/', appName: 'Mudrlant' });
    assert.equal(card.kicker, 'Můj týden v Mudrlantovi');
    assert.equal(card.headline, `${s.accuracy} %`);
    assert.equal(card.detail, '1\u00a0203 odpovědí · +1\u00a0230 XP');
    assert.deepEqual(card.grid, [true, null, true, null, null, null, null]);
    assert.equal(card.day, '2026-11-15');
    assert.equal(card.robe, 'zelena');
    assert.ok(['radost', 'premysleni', 'vitez', 'serie', 'oslava'].includes(card.pose));
    assert.match(card.note, /2 z 7 dní/);
    const text = K.shareText(s, v, 'https://x.test/app/');
    assert.match(text, /^Můj týden v Mudrlantovi \(9\. – 15\. 11\.\): 1\u00a0203 odpovědí, 80 % správně, \+1\u00a0230 XP, 2 dny ze 7\. Titul: /);
    assert.match(text, /\nhttps:\/\/x\.test\/app\/$/);
    // Model karty v share-card.js (stejné rozložení jako Kvíz dne): mřížka sedmi dnů
    const Share = require('../share-card.js');
    const model = Share.cardModel(card);
    assert.deepEqual(model.grid, ['right', 'empty', 'right', 'empty', 'empty', 'empty', 'empty']);
    assert.equal(model.kicker, 'MŮJ TÝDEN V MUDRLANTOVI');
});

test('HTML okna a pruhu: všechny stránky, bez inline stylů a skriptů, data escapovaná', () => {
    let s = play(null, '2026-11-09T10:00:00Z', 12);
    s = K.record(s, { answered: true, correct: true, xp: 1, topic: 'zemepis', learned: { name: '<b>Zlá</b> "věc"', topic: 'zemepis' } }, at('2026-11-10T10:00:00Z'));
    s = K.record(s, { challenge: 'loss' }, at('2026-11-10T10:00:00Z'));
    const sum = K.summarize(s, '2026-11-09');
    const view = { verdict: K.verdict(sum, TITLES), pages: K.pagesFor(sum), comparison: K.compare(sum, K.summarize(s, '2026-11-02')), goal: K.nextGoal(sum, TOPICS) };
    const h = { topicIcon: (topic, cls) => `<img src="icons/topics/${topic.id}.webp" class="${cls}">`, uiArt: (name, cls) => `<img src="icons/topics/${name}.webp" class="${cls}">`, topicById: Object.fromEntries(TOPICS.map(t => [t.id, t])) };
    assert.deepEqual(view.pages, ['titul', 'cisla', 'tema', 'souboje', 'zaver']);
    view.pages.forEach((page, i) => {
        const html = K.pageHtml(sum, { ...view, page: i, toggle: i ? null : 'last' }, h);
        assert.match(html, new RegExp(`data-kr-page="${page}"`));
        assert.doesNotMatch(html, /style=|<script|on[a-z]+=/i);
        assert.equal(/data-kr-share/.test(html), page === 'zaver');
        assert.equal(/data-kr-week="this"/.test(html), i === 0);
        for (const [, name] of html.matchAll(/icons\/topics\/([a-z0-9-]+)\.webp/g)) assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${name}.webp`)), name);
    });
    const topic = K.pageHtml(sum, { ...view, page: 2 }, h);
    assert.match(topic, /&lt;b&gt;Zlá&lt;\/b&gt; &quot;věc&quot;/);
    assert.doesNotMatch(topic, /<b>Zlá/);
    const strip = K.stripHtml(sum, view.verdict, h);
    assert.match(strip, /id="weekly-goals"/);
    assert.match(strip, /data-action="chronicle-open"/);
    assert.match(strip, /data-action="chronicle-dismiss"/);
    assert.match(strip, /Tvůj týden v kostce je hotový/);
});

test('napojení: chronicle.js v index.html před app.js, v service workeru, nasazení a Tailwindu; tip a Můj postup', () => {
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(index, /<script src="chronicle\.js" defer><\/script>/);
    assert.ok(index.indexOf('chronicle.js') < index.indexOf('app.js'));
    assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'chronicle\.js'/);
    assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8'), /\bchronicle\.js\b/);
    assert.match(fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8'), /'\.\/chronicle\.js'/);
    const Tips = require('../tips.js');
    const tip = Tips.BY_ID.get('kronika');
    assert.equal(tip.action.kind, 'chronicle');
    assert.equal(Tips.touch(Tips.EMPTY, 'chronicle').visited.chronicle, true);
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /touchTip\('chronicle'\)/);
    assert.match(app, /data-open-chronicle/);
});
