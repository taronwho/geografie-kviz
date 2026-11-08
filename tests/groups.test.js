// Skupiny (groups.js): název, kód a odkaz, pořadí Dnes / Týden (Kvíz dne, XP), texty, escapování cizích údajů a shoda ikon se serverem
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Groups = require('../groups.js');

const row = (id, extra = {}) => ({ id, display_name: `Hráč ${id}`, today: null, week_score: 0, week_days: 0, week_correct: 0, week_time_ms: 0, week_xp: 0, ...extra });
const h = { avatarHtml: (player) => `<span data-avatar="${player.id}"></span>`, topicTitle: () => 'Zeměpis', topicIcon: () => 'globe' };

test('název: 2–40 znaků, mezery se očistí, jen povolené znaky', () => {
    assert.equal(Groups.cleanName('  5.B   Základka '), '5.B Základka');
    assert.equal(Groups.nameError('5.B Základka'), '');
    assert.equal(Groups.nameError('Rodina Novákových (Kladno)'), '');
    assert.match(Groups.nameError('X'), /2 až 40/);
    assert.match(Groups.nameError('x'.repeat(41)), /2 až 40/);
    assert.match(Groups.nameError('<b>Třída</b>'), /V názvu/);
    assert.match(Groups.nameError('Tom & Jerry'), /V názvu/);
    assert.match(Groups.nameError('"Třída"'), /V názvu/);
    assert.equal(Groups.cleanIcon('💩'), Groups.ICONS[0]);
    assert.equal(Groups.cleanIcon('⚽'), '⚽');
});

test('kód: z textu i odkazu, malá písmena a mezery, zaměnitelné znaky ne', () => {
    assert.equal(Groups.parseCode('k7m2qx'), 'K7M2QX');
    assert.equal(Groups.parseCode('K7M 2QX'), 'K7M2QX');
    assert.equal(Groups.parseCode('K7M-2QX'), 'K7M2QX');
    assert.equal(Groups.parseCode('https://mudrlant.cz/app/?skupina=k7m2qx'), 'K7M2QX');
    assert.equal(Groups.parseCode('https://mudrlant.cz/app/?tab=multi&skupina=K7M2QX#x'), 'K7M2QX');
    assert.equal(Groups.parseCode('K0M2QX'), '', '0 v kódu není');
    assert.equal(Groups.parseCode('K1M2QX'), '', '1 v kódu není');
    assert.equal(Groups.parseCode('K7M2Q'), '');
    assert.equal(Groups.parseCode(''), '');
    assert.equal(Groups.linkFor('K7M2QX', { origin: 'https://mudrlant.cz', pathname: '/app/' }), 'https://mudrlant.cz/app/?skupina=K7M2QX');
});

test('pořadí Dnes: jen dohraný Kvíz dne, víc bodů, při shodě kratší čas, shodné místo se sdílí', () => {
    const rows = [
        row('a', { today: { score: 30, correct: 8, time_ms: 90000 } }),
        row('b', { today: { score: 34, correct: 9, time_ms: 120000 } }),
        row('c'),
        row('d', { today: { score: 30, correct: 8, time_ms: 80000 } }),
        row('e', { today: { score: 30, correct: 8, time_ms: 80000 } })
    ];
    const { ranked, waiting } = Groups.rankToday(rows);
    assert.deepEqual(ranked.map(item => [item.id, item.place]), [['b', 1], ['d', 2], ['e', 2], ['a', 4]]);
    assert.deepEqual(waiting.map(item => item.id), ['c']);
    assert.deepEqual(Groups.rankToday([]), { ranked: [], waiting: [] });
});

test('pořadí Týden: součet bodů Kvízu dne (kdo nehrál, zvlášť), nebo XP za týden', () => {
    const rows = [
        row('a', { week_score: 62, week_days: 2, week_time_ms: 200000, week_xp: 540 }),
        row('b', { week_score: 34, week_days: 1, week_time_ms: 120000, week_xp: 1260 }),
        row('c', { week_score: 70, week_days: 3, week_time_ms: 300000 }),
        row('d', { week_xp: 80 }),
        row('e', { week_score: 62, week_days: 3, week_time_ms: 100000 })
    ];
    const quiz = Groups.rankWeek(rows, 'quiz');
    assert.deepEqual(quiz.ranked.map(item => [item.id, item.place]), [['c', 1], ['e', 2], ['a', 3], ['b', 4]]);
    assert.deepEqual(quiz.waiting.map(item => item.id), ['d']);
    const xp = Groups.rankWeek(rows, 'xp');
    assert.deepEqual(xp.ranked.map(item => [item.id, item.place]), [['b', 1], ['a', 2], ['d', 3]]);
    assert.deepEqual(xp.waiting.map(item => item.id).sort(), ['c', 'e']);
});

test('texty: počet členů, dnešní vedoucí, čas', () => {
    assert.equal(Groups.membersWord(1), '1 člen');
    assert.equal(Groups.membersWord(3), '3 členové');
    assert.equal(Groups.membersWord(12), '12 členů');
    assert.equal(Groups.leaderText({ leader: null }), 'Kvíz dne dnes ještě nikdo nedohrál');
    assert.equal(Groups.leaderText({ leader: { display_name: 'Petr Svoboda', score: 34, me: false } }), 'Dnes vede Petr Svoboda · 34 bodů');
    assert.equal(Groups.leaderText({ leader: { display_name: 'Jana', score: 1, me: true } }), 'Dnes vede ty · 1 bod');
    assert.equal(Groups.formatTime(95000), '1:35');
});

test('vykreslení escapuje název skupiny a jména hráčů', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const list = Groups.listHtml([{ id: 'g1', name: evil, icon: '🏫', code: 'K7M2QX', members: 2, played_today: true, leader: { display_name: evil, score: 3, me: false } }]);
    assert.ok(!list.includes('<img'), 'seznam');
    const detail = {
        id: 'g1', name: evil, icon: '🏫', code: 'K7M2QX', members: 2, is_owner: true, challenge: null,
        rows: [row('u1', { display_name: evil, me: true, today: { score: 3, correct: 1, time_ms: 1000 } }), row('u2', { display_name: evil })]
    };
    for (const html of [Groups.detailHtml(detail, { tab: 'day', by: 'quiz' }, h), Groups.detailHtml(detail, { tab: 'week', by: 'xp' }, h), Groups.manageHtml(detail, { name: evil, icon: '🏫' }, h)]) {
        assert.ok(!html.includes('<img'), 'detail a správa');
    }
    assert.ok(!Groups.joinHtml({ code: evil, preview: { id: 'g', name: evil, icon: '🏫', members: 1, owner: { display_name: evil }, member: false } }).includes('<img'));
    // Zakladatel vidí Spravovat, člen Opustit
    assert.match(Groups.detailHtml(detail, { tab: 'day', by: 'quiz' }, h), /data-group-manage/);
    assert.match(Groups.detailHtml({ ...detail, is_owner: false }, { tab: 'day', by: 'quiz' }, h), /data-group-leave/);
});

test('ikony skupin jsou stejné jako na serveru (group_icons v schema.sql)', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    const match = /function public\.group_icons\(\)[\s\S]*?array\[([^\]]+)\]/.exec(sql);
    assert.ok(match, 'group_icons v schema.sql');
    const server = [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
    assert.deepEqual(server, Groups.ICONS);
    assert.equal(Groups.MAX_GROUPS, 10);
    assert.equal(Groups.MAX_MEMBERS, 50);
    assert.match(sql, />= 10 then\s+raise exception 'Můžeš být nejvýš v 10 skupinách/);
    assert.match(sql, />= 50 then\s+raise exception 'Skupina je plná/);
});

test('soubor je v index.html, service workeru, nasazení a Tailwindu', () => {
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(read('index.html'), /<script src="groups\.js" defer><\/script>/);
    assert.match(read('sw.js'), /'groups\.js'/);
    assert.match(read('.github/workflows/pages.yml'), / groups\.js /);
    assert.match(read('tailwind.config.js'), /'\.\/groups\.js'/);
});
