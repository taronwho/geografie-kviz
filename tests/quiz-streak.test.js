// Přehled série Kvízu dne (quiz-streak.js) a reprodukce cest, kterými mohla série Kvízu dne spadnout, i když hráč „včera večer hrál“
// (hlášení 26. 11. 2026: série 1 den, nejlepší 6, ochrana 0 z 2): hra po půlnoci patří k dalšímu dni, Začít klepnuté po půlnoci na úvodu
// otevřeném před ní, automatická ochrana a série jen ze dnů tohoto zařízení (hráč na dvou zařízeních), rozehraný vs. dohraný den,
// zachráněné dny, dny bez záznamu, čas dohrání a HTML okna. Zapojení do stránky (index.html, service worker, Tailwind, app.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const QS = require('../quiz-streak.js');
const DQ = require('../daily-quiz.js');
const Rewards = require('../rewards.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const TODAY = '2026-11-26';
// Řádek daily_quiz_results, dohraný v daný pražský čas (listopad = UTC+1)
const row = (day, time = '20:30', extra = {}) => {
    const [h, m] = time.split(':').map(Number);
    const at = new Date(Date.parse(`${day}T00:00:00Z`) + ((h - 1) * 60 + m) * 60000).toISOString();
    return { day, answered: 10, correct: 7, score: 24, time_ms: 90000, started_at: at, last_at: at, finished_at: at, ...extra };
};
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = QS.addDays(d, 1)) out.push(d); return out; };

test('pražský čas: den a hodina dohrání (i po půlnoci a přes letní čas)', () => {
    assert.deepEqual(QS.pragueClock('2026-11-25T23:14:00Z'), { day: '2026-11-26', time: '0:14' });
    assert.deepEqual(QS.pragueClock('2026-11-25T22:59:00Z'), { day: '2026-11-25', time: '23:59' });
    assert.deepEqual(QS.pragueClock('2026-07-01T21:30:00Z'), { day: '2026-07-01', time: '23:30' });
    assert.equal(QS.pragueClock(null), null);
    assert.equal(QS.whenText('2026-11-26', '2026-11-26T07:02:00Z'), 'v 8:02');
    assert.equal(QS.whenText('2026-11-25', '2026-11-26T07:02:00Z'), '26. 11. v 8:02');
});

test('reprodukce hlášení: hra krátce po půlnoci se počítá k novému dni, předchozí den chybí a série spadne na 1 (bez ochrany)', () => {
    // 19.–24. 11. odehráno, „včera večer“ = 26. 11. v 0:14 pražského času (server i zařízení berou pražský den)
    const server = [...range('2026-11-19', '2026-11-24').map(day => row(day)), row(TODAY, '0:14')];
    assert.equal(DQ.pragueDay(new Date('2026-11-25T23:14:00Z')), TODAY, 'den kvízu v 0:14 je už 26. 11.');
    const view = QS.build({ today: TODAY, local: {}, server, account: 'ok', frozen: [] });
    assert.equal(view.current, 1);
    assert.equal(view.best, 6);
    assert.equal(view.statusOf('2026-11-25'), 'missed');
    assert.deepEqual(view.runs.map(run => [run.from, run.to, run.length]), [[TODAY, TODAY, 1], ['2026-11-19', '2026-11-24', 6]]);
    const missed = QS.dayDetail(view, '2026-11-25');
    assert.match(missed.text, /nebyl odehraný, tady skončila série 6 dní \(19\. 11\. – 24\. 11\.\)/);
    const today = QS.dayDetail(view, TODAY);
    assert.match(today.text, /^Dohráno v 0:14 \(po půlnoci, patří k tomuto dni, ne k předchozímu večeru\) · 7\/10 správně, 24 bodů · v účtu/);
    // Stejně jako série serveru (daily_quiz_streaks) a DailyQuiz.streakOf
    assert.equal(DQ.streakOf(QS.serverPlayed(server, TODAY), TODAY), 1);
    // S ochranou (0 z 2 na snímku = žádná nebyla) by 25. 11. zabrala sama a série pokračovala
    const before = { ...Rewards.empty(), freezes: 1 };
    const played = new Set(QS.serverPlayed(server.filter(r => r.day !== TODAY), '2026-11-25'));
    const used = Rewards.checkFreeze(before, TODAY, [{ id: 'kviz-dne', ok: (day) => played.has(day) }]);
    assert.equal(used.used, true);
    assert.deepEqual(used.state.frozenQuiz, ['2026-11-25']);
    const saved = QS.build({ today: TODAY, local: {}, server, account: 'ok', frozen: Rewards.frozenForQuiz(used.state) });
    assert.equal(saved.current, 7, '6 dní + dnešek, zachráněný den se nepočítá');
    assert.equal(saved.statusOf('2026-11-25'), 'saved');
    // Bez ochrany (0) se nic nespotřebuje a den zůstane vynechaný
    assert.equal(Rewards.checkFreeze(Rewards.empty(), TODAY, [{ id: 'kviz-dne', ok: (day) => played.has(day) }]).used, false);
});

test('reprodukce: úvod otevřený před půlnocí a Začít po ní by rozehrál včerejší kvíz, který server nepřijme (oprava: DailyQuiz.startDay)', () => {
    // Stav ze serveru načtený 25. 11. ve 23:58, Začít v 0:01 dne 26. 11.
    assert.equal(DQ.startDay({ serverDay: '2026-11-25', fetchedOn: '2026-11-25', today: TODAY }), null, 'stav serveru je včerejší → načíst znovu');
    assert.equal(DQ.startDay({ serverDay: '2026-11-25', fetchedOn: '2026-11-25', today: '2026-11-25' }), '2026-11-25');
    // Telefon s jiným časem: den ze serveru platí, když se načetl dnes (podle zařízení)
    assert.equal(DQ.startDay({ serverDay: '2026-11-26', fetchedOn: '2026-11-25', today: '2026-11-25' }), '2026-11-26');
    assert.equal(DQ.startDay({ serverDay: '2026-11-27', fetchedOn: TODAY, today: TODAY }), '2026-11-27');
    assert.equal(DQ.startDay({ serverDay: null, fetchedOn: null, today: TODAY }), TODAY, 'host a bez spojení: den zařízení');
    // app.js ho používá ve startQuiz (a při chybě spojení zahodí včerejší stav serveru v openQuiz)
    const app = read('app.js');
    assert.match(app, /DailyQuiz\.startDay\(\{ serverDay: server && server\.day, fetchedOn: quizServerAt \? DailyQuiz\.pragueDay\(new Date\(quizServerAt\)\) : null, today: DailyQuiz\.pragueDay\(\) \}\)/);
    assert.match(app, /if \(today === null\) \{ quizServer = null; quiz = null; showToast\('Začal nový den, načítám dnešní Kvíz dne\.'\); openQuiz\(\); return; \}/);
});

test('reprodukce: dvě zařízení – série a automatická ochrana jen ze dnů tohoto zařízení (oprava: sjednocení se dny z účtu)', () => {
    // Telefon hrál 20.–23. a 25. 11., tablet 24. 11. (v účtu jsou všechny); ochrana 1
    const account = range('2026-11-20', '2026-11-25').map(day => row(day));
    const phone = Object.fromEntries(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map(day => [day, { answered: 10, correct: 5, score: 15, done: true }]));
    const localOnly = new Set(DQ.playedDays({ days: phone }, '2026-11-25'));
    // Dřív: 25. 11. ráno telefon nevěděl o 24. 11. → ochrana zabrala zbytečně (a pak chyběla, když den opravdu vynechal)
    const wasted = Rewards.checkFreeze({ ...Rewards.empty(), freezes: 1 }, '2026-11-25', [{ id: 'kviz-dne', ok: (day) => localOnly.has(day) }]);
    assert.equal(wasted.used, true, 'chyba: ochrana za den odehraný na jiném zařízení');
    const union = new Set([...localOnly, ...QS.serverPlayed(account, '2026-11-25')]);
    const fixed = Rewards.checkFreeze({ ...Rewards.empty(), freezes: 1 }, '2026-11-25', [{ id: 'kviz-dne', ok: (day) => union.has(day) }]);
    assert.equal(fixed.used, false, 'se dny z účtu se ochrana nespotřebuje');
    // Série po použité ochraně: server ji nezná (daily_quiz_streaks zachráněné dny nepočítá), zařízení nemá všechny dny → dřív kratší série
    const frozen = ['2026-11-26'];
    const later = [...account, row('2026-11-27'), row('2026-11-28')];
    assert.equal(DQ.streakOf(QS.serverPlayed(later, '2026-11-28'), '2026-11-28'), 2, 'server: jen od zachráněného dne');
    assert.equal(DQ.streakOf(['2026-11-27', '2026-11-28'], '2026-11-28', frozen), 2, 'zařízení: jen svoje dny');
    assert.equal(DQ.streakOf([...QS.serverPlayed(later, '2026-11-28'), '2026-11-28'], '2026-11-28', frozen), 8, 'sjednocení přes zachráněný den');
    // app.js: série i ochrana berou dny z účtu, ochrana se u přihlášeného hráče posoudí až po jejich načtení
    const app = read('app.js');
    assert.match(app, /const quizStreakOf = \(played, today\) => \(DailyQuiz \? DailyQuiz\.streakOf\(\[\.\.\.played, \.\.\.quizAccountDays\(today\)\], today, frozenQuizDays\(\)\) : 0\);/);
    assert.match(app, /if \(!quizAccountReady\(\)\) \{ loadQuizAccount\(\)\.then\(ok => \{ if \(ok && quizAccountReady\(\)\) checkStreakFreeze\(\); \}\); return; \}/);
    assert.match(app, /const quizDays = new Set\(\[\.\.\.DailyQuiz\.playedDays\(quizState\(\), today\), \.\.\.quizAccountDays\(today\)\]\);/);
});

test('rozehraný a dohraný den: minulý den stačí rozehrát, dnešek se počítá až dohraný (zařízení i účet stejně)', () => {
    const server = [row('2026-11-24'), { ...row('2026-11-25', '23:58'), answered: 3, correct: 2, score: 7, finished_at: null }, { ...row(TODAY, '9:00'), answered: 4, finished_at: null }];
    assert.deepEqual(QS.serverPlayed(server, TODAY), ['2026-11-24', '2026-11-25']);
    const view = QS.build({ today: TODAY, local: {}, server, account: 'ok' });
    assert.equal(view.statusOf('2026-11-25'), 'partial');
    assert.equal(view.statusOf(TODAY), 'progress');
    assert.equal(view.current, 2);
    assert.match(QS.dayDetail(view, '2026-11-25').text, /^Rozehráno \(3 z 10 otázek\), do série se počítá · poslední odpověď v 23:58 · v účtu$/);
    assert.match(QS.dayDetail(view, TODAY).text, /dohraj ho do půlnoci/);
    // Rozehraný den v zařízení (po půlnoci uzavřený rollover) i bez účtu
    const local = DQ.rollover({ days: {}, attempt: { ...DQ.newAttempt('2026-11-25', 'host'), results: [{ correct: true, points: 4, ms: 3000 }] } }, TODAY);
    assert.deepEqual(DQ.playedDays(local, TODAY), ['2026-11-25']);
    // Řádek účtu bez odpovědi (start bez odpovědi) se nepočítá
    assert.deepEqual(QS.serverPlayed([{ ...row('2026-11-25'), answered: 0, correct: 0, score: 0, finished_at: null }], TODAY), []);
});

test('sloučení zařízení a účtu: víc odpovědí vyhrává, čas ze serveru, zdroj dne', () => {
    const merged = QS.merge({ '2026-11-24': { answered: 10, correct: 9, score: 33, done: true, at: Date.parse('2026-11-24T19:00:00Z') }, '2026-11-23': { answered: 10, correct: 8, score: 30, done: true } },
        [row('2026-11-24', '20:05'), { ...row('2026-11-22'), answered: 5, finished_at: null }]);
    assert.equal(merged['2026-11-24'].account && merged['2026-11-24'].device, true);
    assert.equal(QS.pragueClock(merged['2026-11-24'].at).time, '20:05', 'čas měří server');
    assert.equal(merged['2026-11-23'].device && !merged['2026-11-23'].account, true);
    assert.equal(merged['2026-11-23'].at, null, 'starší záznam zařízení čas nemá');
    assert.equal(merged['2026-11-22'].done, false);
    const view = QS.build({ today: TODAY, local: { '2026-11-23': { answered: 10, correct: 8, score: 30, done: true } }, server: [row('2026-11-24')], account: 'ok' });
    assert.match(QS.dayDetail(view, '2026-11-23').text, /^Dohráno · 8\/10 správně, 30 bodů · jen v tomto zařízení$/);
    // Zařízení ukládá čas dohrání (od 27. 11. 2026), parseState ho drží
    const state = DQ.parseState({ days: { '2026-11-24': { answered: 10, correct: 9, score: 33, done: true, xp: true, at: 1790000000000 }, '2026-11-23': { answered: 10, done: true, at: 'x' } } });
    assert.equal(state.days['2026-11-24'].at, 1790000000000);
    assert.equal('at' in state.days['2026-11-23'], false);
});

test('zachráněné dny, čas použití ochrany a úseky série přes ně; dva vynechané dny v řadě úsek přeruší', () => {
    const server = [...range('2026-11-10', '2026-11-14').map(day => row(day)), ...range('2026-11-16', '2026-11-20').map(day => row(day)), ...range('2026-11-23', '2026-11-25').map(day => row(day))];
    const view = QS.build({ today: TODAY, local: {}, server, account: 'ok', frozen: ['2026-11-15', '2026-11-21', '2026-11-12'], log: [{ day: '2026-11-15', reasons: ['x'], at: Date.parse('2026-11-16T06:05:00Z') }] });
    assert.equal(view.statusOf('2026-11-15'), 'saved');
    assert.equal(view.statusOf('2026-11-12'), 'done', 'odehraný den zůstane odehraný, i když je v seznamu zachráněných');
    assert.equal(view.statusOf('2026-11-22'), 'missed');
    assert.deepEqual(view.runs.map(run => [run.from, run.to, run.length, run.saved]), [['2026-11-23', '2026-11-25', 3, []], ['2026-11-10', '2026-11-20', 10, ['2026-11-15']]]);
    assert.equal(view.best, 10);
    assert.equal(view.current, 3, 'dnešek ještě nehraný: série ze včerejška');
    assert.equal(view.statusOf(TODAY), 'today');
    assert.equal(QS.dayDetail(view, '2026-11-15').text, 'Nehráno, sérii zachránila ochrana série (použita 16. 11. v 7:05)');
    assert.equal(QS.dayDetail(view, '2026-11-21').text.startsWith('Nehráno, sérii zachránila'), true);
    // Úsek přes zachráněný den 21. 11. končí 20. 11. a 22. 11. je vynechaný: série skončila
    assert.match(QS.dayDetail(view, '2026-11-22').text, /Kvíz dne nebyl odehraný$/);
    // Stejné číslo jako DailyQuiz.streakOf
    assert.equal(view.current, DQ.streakOf(view.played, TODAY, view.saved));
});

test('bez záznamu: dny před prvním známým kvízem, a když se účet přihlášeného hráče nenačetl (ne vynechané)', () => {
    const local = { '2026-11-20': { answered: 10, correct: 5, score: 12, done: true } };
    const guest = QS.build({ today: TODAY, local, account: 'none' });
    assert.equal(guest.statusOf('2026-11-19'), 'unknown');
    assert.equal(guest.statusOf('2026-11-21'), 'missed');
    assert.match(QS.dayDetail(guest, '2026-11-19').text, /dřív než první uložený Kvíz dne/);
    const failed = QS.build({ today: TODAY, local, server: [row('2026-11-21')], account: 'failed' });
    assert.equal(failed.statusOf('2026-11-21'), 'unknown', 'řádky účtu se při chybě nepoužijí a den se neoznačí jako vynechaný');
    assert.match(QS.dayDetail(failed, '2026-11-21').text, /nenačetly/);
    const loading = QS.build({ today: TODAY, local, account: 'loading' });
    assert.match(QS.dayDetail(loading, '2026-11-22').text, /načítám záznamy z účtu/);
    const empty = QS.build({ today: TODAY, account: 'ok', server: [] });
    assert.equal(empty.current, 0);
    assert.equal(empty.statusOf('2026-11-25'), 'unknown');
    assert.deepEqual(empty.runs, []);
});

test('kalendář: 10 týdnů po Po–Ne do dneška, budoucí dny prázdné; HTML okna s výběrem dne, legendou, úseky a poznámkou o půlnoci', () => {
    const server = [...range('2026-11-19', '2026-11-24').map(day => row(day)), row(TODAY, '0:14')];
    const view = QS.build({ today: TODAY, local: {}, server, account: 'ok', serverBest: 4 });
    assert.equal(view.columns.length, QS.WEEKS);
    assert.equal(view.start, '2026-09-21');
    assert.equal(QS.weekOf(view.start), view.start);
    assert.equal(view.columns[9][3].day, TODAY, 'čtvrtek v posledním sloupci');
    assert.deepEqual(view.columns[9].slice(4), [null, null, null]);
    assert.equal(view.counts.done, 7);
    assert.equal(view.counts.missed, 1);
    const html = QS.dialogHtml(view, { selected: '2026-11-25', freezes: 0, max: 2, topicStreak: 4 });
    assert.equal((html.match(/data-qs-day="/g) || []).length, 67);
    assert.match(html, /data-qs-day="2026-11-25" data-qs-status="missed" aria-pressed="true" aria-label="st 25\. 11\.: Vynecháno"/);
    assert.match(html, /data-qs-detail-day="2026-11-25"[^>]*><b>St 25\. 11\.:<\/b> Kvíz dne nebyl odehraný, tady skončila série 6 dní/);
    assert.match(html, /data-qs-current>1 den</);
    assert.match(html, /data-qs-best>6 dní</);
    assert.match(html, /data-qs-freezes>0 z 2</);
    // Současná série (26. 11.) zlatě, starší série vínově, legenda jen to podstatné
    assert.match(html, /data-qs-day="2026-11-26" data-qs-status="done" aria-pressed="false" aria-label="čt 26\. 11\.: Dohráno, současná série" class="[^"]*bg-amber-400/);
    assert.match(html, /data-qs-day="2026-11-24" data-qs-status="done" aria-pressed="false" aria-label="út 24\. 11\.: Dohráno" class="[^"]*bg-brand-600/);
    assert.match(html, /Současná série<\/span>.*Odehráno<\/span>.*Zachráněno ochranou<\/span>.*Vynecháno<\/span>/s);
    assert.doesNotMatch(html, /data-qs-runs/);
    assert.match(html, /Den končí o půlnoci \(čas v Česku\), kvíz dohraný po ní patří k dalšímu dni/);
    assert.match(html, /Dnešní otázky mají vlastní série po tématech\./);
    assert.deepEqual([...view.currentDays], [TODAY]);
    assert.match(html, /grid-cols-\[1\.1rem_repeat\(10,minmax\(0,1fr\)\)\]/);
    assert.doesNotMatch(html, /style=/, 'CSP: bez inline stylů');
    // Neplatný vybraný den → dnešek
    assert.match(QS.dialogHtml(view, { selected: '2030-01-01' }), /data-qs-detail-day="2026-11-26"/);
});

test('zapojení: index.html, service worker, Tailwind, Social.dailyQuizHistory, okno a vstupní místa v app.js', () => {
    assert.match(read('index.html'), /<script src="quiz-streak\.js" defer><\/script>/);
    assert.match(read('sw.js'), /'quiz-streak\.js'/);
    assert.match(read('tailwind.config.js'), /'\.\/quiz-streak\.js'/);
    const social = read('social.js');
    assert.match(social, /daily_quiz_results\?user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
    assert.match(social, /dailyQuizFriends, dailyQuizHistory,/);
    const app = read('app.js');
    assert.match(app, /'quiz-streak-history': \(\) => openQuizStreak\(\),/);
    assert.match(app, /data-quiz-streak-open/);
    assert.match(app, /const logFreeze = \(day, reasons\) => writeJson\(FREEZE_LOG_KEY, \[\{ day, reasons, at: Date\.now\(\) \}/);
    assert.match(read('daily-quiz.js'), /data-quiz-streak data-action="quiz-streak-history"/);
    assert.match(read('tips.js'), /Přehled dnů Kvízu dne/);
    assert.match(read('README.md'), /Přehled série Kvízu dne/);
});
