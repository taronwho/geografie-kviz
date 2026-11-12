// Ligové sezóny a vitrína (league-seasons.js, showcase.js, rámečky v look.js, schéma 18): pražské měsíce a dny do konce sezóny,
// čištění odpovědi serveru, uložený stav (nejlepší liga jen roste, oslava jednou, na novém zařízení jen čerstvý úspěch), další odměna,
// rámečky sezón v katalogu (odemčení, truhla je nedává), vitrína (tvar shodný s databází, nejvýš 3, přepínání) a napojení souborů.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Seasons = require('../league-seasons.js');
const Showcase = require('../showcase.js');
const Look = require('../look.js');
const Frames = require('../look-frames.js');
const Rewards = require('../rewards.js');
const Social = require('../social.js');

const ROOT = path.join(__dirname, '..');
const DATA = {
    month: '2026-11',
    seasons: [
        { month: '2026-11', league: 'zlato', peak: 1380, games: 7, finished: false },
        { month: '2026-10', league: 'diamant', peak: 1580, games: 23, finished: true },
        { month: '2026-09', league: 'zlato', peak: 1300, games: 9, finished: true },
        { month: '2026-07', league: 'platina', peak: 1450, games: 12, finished: true }
    ],
    best: { month: '2026-10', league: 'diamant', peak: 1580 }
};
const h = { esc: (text) => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`), emblem: (league, cls) => `<img data-emblem="${league}" class="${cls}">`, frameAvatar: (frame, cls) => `<span data-frame-preview="${frame}" class="${cls}"></span>` };

test('sezóna = měsíc podle pražského času (hranice v zimním i letním čase), dny do konce sezóny', () => {
    assert.equal(Seasons.monthOf(new Date('2026-10-31T22:30:00Z')), '2026-10', '23:30 v Praze (zimní čas) je ještě říjen');
    assert.equal(Seasons.monthOf(new Date('2026-10-31T23:30:00Z')), '2026-11', '0:30 v Praze už je listopad, i když v UTC je říjen');
    assert.equal(Seasons.monthOf(new Date('2026-06-30T21:30:00Z')), '2026-06');
    assert.equal(Seasons.monthOf(new Date('2026-06-30T22:30:00Z')), '2026-07', 'letní čas: půlnoc v Praze je 22:00 UTC');
    assert.equal(Seasons.daysLeft(new Date('2026-11-11T10:00:00Z')), 20);
    assert.equal(Seasons.daysLeft(new Date('2026-11-30T20:00:00Z')), 1, 'poslední den');
    assert.equal(Seasons.daysLeft(new Date('2026-11-30T23:30:00Z')), 31, 'v Praze už je 1. prosince');
    assert.equal(Seasons.daysLeft(new Date('2028-02-01T10:00:00Z')), 29, 'přestupný únor');
    assert.equal(Seasons.leftText(1), 'poslední den');
    assert.equal(Seasons.leftText(3), 'ještě 3 dny');
    assert.equal(Seasons.leftText(20), 'ještě 20 dní');
    assert.equal(Seasons.addMonths('2026-01', -1), '2025-12');
    assert.equal(Seasons.addMonths('2026-12', 1), '2027-01');
    assert.equal(Seasons.addMonths('2026-11', -12), '2025-11');
    assert.equal(Seasons.addMonths('x', 1), '');
    assert.equal(Seasons.monthLabel('2026-10'), 'říjen 2026');
    assert.equal(Seasons.monthOfName('2026-11'), 'listopadu');
    assert.equal(Seasons.monthShort('2026-07'), 'čvc');
});

test('odpověď serveru se vyčistí: tvar, rozsah 12 měsíců, skončená jen před běžícím měsícem', () => {
    for (const bad of [null, [], 'x', {}, { month: '2026-13' }, { month: 202611 }]) assert.equal(Seasons.clean(bad), null, JSON.stringify(bad));
    const data = Seasons.clean({
        month: '2026-11',
        seasons: [
            { month: '2026-11', league: 'zlato', peak: 1380, games: 7, finished: true },
            { month: '2026-12', league: 'mistr', peak: 1800, games: 1 },
            { month: '2025-10', league: 'mistr', peak: 1800, games: 1 },
            { month: '2026-10', league: '<b>', peak: 1, games: 1 },
            { month: '2026-09', league: 'zlato', peak: '1300', games: -5 },
            { month: '2026-09', league: 'mistr', peak: 1900, games: 1 },
            null
        ],
        best: { month: '2026-11', league: 'zlato', peak: 1380 }
    });
    assert.deepEqual(data.seasons, [
        { month: '2026-11', league: 'zlato', peak: 1380, games: 7, finished: false },
        { month: '2026-09', league: 'zlato', peak: 1300, games: 0, finished: true }
    ]);
    assert.equal(data.best, null, 'běžící měsíc nemůže být nejlepší skončenou sezónou');
    const clean = Seasons.clean(DATA);
    assert.equal(Seasons.currentSeason(clean).league, 'zlato');
    const past = Seasons.history(clean);
    assert.equal(past.length, 12);
    assert.deepEqual(past.slice(0, 4).map(item => [item.month, item.season && item.season.league]), [['2026-10', 'diamant'], ['2026-09', 'zlato'], ['2026-08', null], ['2026-07', 'platina']]);
    assert.equal(past[11].month, '2025-11');
});

test('uložený stav: nejlepší liga jen roste, nový rámeček se oslaví jednou, na novém zařízení jen čerstvá sezóna', () => {
    // Nové zařízení, nejlepší sezóna je ta právě skončená: oslava (nejvyšší první)
    let step = Seasons.adopt(null, DATA, 'u-1');
    assert.deepEqual(step.fresh.map(reward => reward.league), ['diamant', 'platina', 'zlato', 'stribro']);
    assert.equal(step.cache.best, 'diamant');
    assert.equal(step.cache.bestMonth, '2026-10');
    assert.equal(Seasons.cachedBest(step.cache), 'diamant');
    assert.deepEqual(Seasons.cachedData(step.cache, 'u-1').seasons.length, 4);
    assert.equal(Seasons.cachedData(step.cache, 'u-2'), null, 'cizí účet uložené sezóny nedostane');
    // Další načtení: nic nového
    step = Seasons.adopt(JSON.parse(JSON.stringify(step.cache)), DATA, 'u-1');
    assert.deepEqual(step.fresh, []);
    // Server vrátí nižší nejlepší ligu (třeba jiný účet): rámečky v zařízení zůstanou
    step = Seasons.adopt(step.cache, { ...DATA, best: { month: '2026-09', league: 'zlato', peak: 1300 } }, 'u-1');
    assert.equal(step.cache.best, 'diamant');
    assert.deepEqual(step.fresh, []);
    // V prosinci: listopad skončil s Mistrem → jen Mistr je nový
    step = Seasons.adopt(step.cache, { month: '2026-12', seasons: [{ month: '2026-11', league: 'mistr', peak: 1710, games: 30 }], best: { month: '2026-11', league: 'mistr', peak: 1710 } }, 'u-1');
    assert.deepEqual(step.fresh.map(reward => reward.frame), ['liga-mistr']);
    // Nové zařízení se starým úspěchem: rámečky se odemknou potichu
    step = Seasons.adopt(null, { ...DATA, best: { month: '2026-07', league: 'platina', peak: 1450 } }, 'u-1');
    assert.deepEqual(step.fresh, []);
    assert.equal(step.cache.best, 'platina');
    // Bez odpovědi serveru se nic nemění
    assert.deepEqual(Seasons.adopt({ best: 'zlato' }, null, 'u-1'), { cache: Seasons.parseCache({ best: 'zlato' }), fresh: [] });
    assert.deepEqual(Seasons.unlockedFrames('platina'), ['liga-stribro', 'liga-zlato', 'liga-platina']);
    assert.deepEqual(Seasons.unlockedFrames('stribro'), ['liga-stribro']);
    assert.deepEqual(Seasons.unlockedFrames('bronz'), []);
    assert.deepEqual(Seasons.unlockedFrames(null), []);
});

test('další odměna: jistý rámeček po konci sezóny, nejbližší vyšší liga a kolik bodů chybí', () => {
    const data = Seasons.clean(DATA);
    let g = Seasons.goal(data, 'diamant', 1380);
    assert.deepEqual(g.secured, []);
    assert.equal(g.next.league, 'mistr');
    assert.equal(g.need, 320);
    assert.equal(Seasons.nextText(g, data.month), 'Dosáhni Mistra do konce listopadu a získáš rámeček Mistrovská sezóna.');
    // Bez rámečků: Zlato v běžícím měsíci už je jisté, další je Platina
    g = Seasons.goal(data, null, 1380);
    assert.deepEqual(g.secured.map(reward => reward.league), ['stribro', 'zlato']);
    assert.equal(g.next.league, 'platina');
    assert.equal(g.need, 20);
    assert.equal(Seasons.securedText(g, data.month), 'Rámeček Zlatá sezóna máš jistý, dostaneš ho 1. prosince.');
    assert.equal(Seasons.nextText(g, data.month), 'Dosáhni Platiny do konce listopadu a získáš rámeček Platinová sezóna.');
    // Všechno získané
    g = Seasons.goal(data, 'mistr', 1720);
    assert.equal(g.next, null);
    assert.match(Seasons.nextText(g, data.month), /Máš všechny rámečky ligových sezón/);
    // Bez ratingu se nepočítá, kolik chybí; bez sezóny v měsíci nic jistého
    g = Seasons.goal({ month: '2026-11', seasons: [], best: null }, null, null);
    assert.equal(g.need, null);
    assert.deepEqual(g.secured, []);
    assert.equal(g.next.league, 'stribro');
});

test('HTML pruhu a okna: bez inline stylů (CSP), escapované texty, vystavení jen se zapnutou vitrínou', () => {
    const data = Seasons.clean(DATA);
    const strip = Seasons.stripHtml({ data, best: 'diamant', rating: 1380, now: new Date('2026-11-11T10:00:00Z') }, h);
    assert.match(strip, /data-action="league-seasons"/);
    assert.match(strip, /Ligová sezóna listopad · ještě 20 dní/);
    assert.match(strip, /data-frame-preview="liga-mistr"/);
    const dialog = Seasons.dialogHtml({ data, best: 'diamant', rating: 1380, now: new Date('2026-11-11T10:00:00Z'), selected: '2026-10', showcase: { on: (entry) => entry === 'l:2026-10:diamant', toggle: (entry) => `<button data-showcase-toggle="${entry}"></button>` } }, h);
    assert.match(dialog, /Nejvýš zatím: Zlato/);
    assert.match(dialog, /data-season-detail="2026-10"[\s\S]*data-showcase-toggle="l:2026-10:diamant"/);
    assert.match(dialog, /data-season-shown/);
    assert.equal((dialog.match(/data-season-month=/g) || []).length, 12);
    assert.equal((dialog.match(/data-earned/g) || []).length, 4);
    const plain = Seasons.dialogHtml({ data, best: null, rating: null, now: new Date('2026-11-11T10:00:00Z') }, h);
    assert.doesNotMatch(plain, /data-showcase-toggle/);
    assert.match(plain, /uvidíš její výsledek/);
    assert.doesNotMatch(strip + dialog + plain, /style=/);
});

test('rámečky ligových sezón v katalogu: odemyká je nejlepší liga sezóny, ne úroveň; truhla ani úrovně je nedávají', () => {
    const ids = Look.LEAGUE_FRAMES.map(item => item.id);
    assert.deepEqual(ids, Seasons.REWARDS.map(reward => reward.frame), 'katalog a odměny sezón se shodují');
    for (const id of ids) {
        assert.ok(Look.find('frames', id));
        assert.match(id, /^[a-z0-9-]{1,24}$/, 'projde kontrolou profiles_frame_format');
        assert.equal(Social.cleanFrame(id), id);
        assert.match(Frames.frameClass(id), new RegExp(`frame-${id}$`));
    }
    const ctx = (leagueBest) => ({ level: 100, badges: { vitez: '1' }, leagueBest });
    assert.equal(Look.isUnlocked(Look.find('frames', 'liga-zlato'), ctx(null)), false, 'ani úroveň 100 rámeček sezóny neodemkne');
    assert.equal(Look.isUnlocked(Look.find('frames', 'liga-platina'), ctx('diamant')), true, 'vyšší liga odemkne i nižší rámečky');
    assert.equal(Look.isUnlocked(Look.find('frames', 'liga-mistr'), ctx('diamant')), false);
    assert.equal(Look.unlockText(Look.find('frames', 'liga-diamant')), 'Ligová sezóna: vrchol Diamant');
    assert.deepEqual(Look.newRewards(1, 100, []).filter(entry => ids.includes(entry.item.id)), [], 'úrovně je neslaví');
    assert.deepEqual(Rewards.candidates(Rewards.parse(null), { level: 1, badges: {} }).filter(entry => ids.includes(entry.item.id)), [], 'truhla je nedává');
    // Uložená volba: rámeček sezóny zůstane jen odemčený (setLeagueBest z uloženého stavu v zařízení)
    Look.setLeagueBest('platina');
    try {
        assert.equal(Look.normalize({ frame: 'liga-platina' }, { level: 1, badges: {} }).frame, 'liga-platina');
        assert.equal(Look.normalize({ frame: 'liga-diamant' }, { level: 1, badges: {} }).frame, 'zadny');
        Look.setLeagueBest('<x>');
        assert.equal(Look.leagueBest(), null);
    } finally { Look.setLeagueBest(null); }
});

test('vitrína: tvar shodný s databází a social.js, nejvýš 3, přepínání, popis a HTML bez inline stylů', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    const sqlPattern = /x ~ '(\^\(b:[^']+)'/.exec(sql)[1];
    const sqlRegex = new RegExp(sqlPattern.replace(/\(b:/, '(?:b:').replace(/\((0\[1-9\])/, '(?:$1').replace(/:\(bronz/, ':(?:bronz'));
    const samples = ['b:vitez', 'b:tema-zemepis-600', 'd:zemepis', 'l:2026-10:diamant', 'l:2026-13:zlato', 'l:2026-1:zlato', 'b:Vitez', 'x:a', 'd:', 'l:2026-10:zelezo', 'b:' + 'a'.repeat(41), 'd:' + 'a'.repeat(25), 'b:a b', 'b:vitez,d:zemepis'];
    for (const sample of samples) {
        assert.equal(Showcase.isEntry(sample), sqlRegex.test(sample), `showcase.js vs SQL: ${sample}`);
        assert.equal(Social.SHOWCASE_ENTRY.test(sample), Showcase.isEntry(sample), `social.js vs showcase.js: ${sample}`);
    }
    assert.deepEqual(Showcase.clean(['b:vitez', 'b:vitez', '<x>', 'd:zemepis', 'l:2026-10:zlato', 'd:vlajky']), ['b:vitez', 'd:zemepis', 'l:2026-10:zlato']);
    assert.deepEqual(Social.cleanShowcase(['b:vitez', null, 'b:vitez', 'd:zemepis']), ['b:vitez', 'd:zemepis']);
    assert.deepEqual(Showcase.parse('l:2026-10:diamant'), { kind: 'season', month: '2026-10', league: 'diamant' });
    assert.equal(Showcase.parse('nic'), null);
    let step = Showcase.toggle([], Showcase.badge('vitez'));
    assert.deepEqual(step, { list: ['b:vitez'], changed: true, added: true, full: false });
    step = Showcase.toggle(['b:vitez', 'd:zemepis', 'l:2026-10:zlato'], Showcase.diploma('vlajky'));
    assert.equal(step.full, true);
    assert.deepEqual(step.list, ['b:vitez', 'd:zemepis', 'l:2026-10:zlato']);
    step = Showcase.toggle(step.list, 'd:zemepis');
    assert.deepEqual(step, { list: ['b:vitez', 'l:2026-10:zlato'], changed: true, added: false, full: false });
    assert.equal(Showcase.toggle(['b:vitez'], '<x>').changed, false);
    const helpers = {
        badge: (id) => (id === 'vitez' ? { title: 'Vítěz <3' } : null), medal: (badge, cls) => `<i class="${cls}"></i>`, topic: (id) => (id === 'zemepis' ? { id, title: 'Zeměpis' } : null),
        diplomaTitle: () => 'Mistr zeměpisu', diplomaArt: (topic, cls) => `<i class="${cls}"></i>`, leagueName: Seasons.leagueName, emblem: (league, cls) => `<img class="${cls}">`, monthLabel: Seasons.monthLabel
    };
    assert.equal(Showcase.describe('b:neznamy', helpers), null, 'neznámý odznak (novější aplikace) se přeskočí');
    assert.deepEqual(Object.values(Showcase.describe('l:2026-10:diamant', helpers)).slice(0, 4), ['season', 'Diamant', 'říjen 2026', 'Ligová sezóna říjen 2026: Diamant']);
    // Nejvýš 3 položky (čtvrtá se ignoruje), neznámý odznak se přeskočí
    assert.equal((Showcase.tilesHtml(['b:vitez', 'b:neznamy', 'd:zemepis', 'l:2026-10:diamant'], helpers).match(/data-showcase-item=/g) || []).length, 2);
    const tiles = Showcase.tilesHtml(['b:vitez', 'd:zemepis', 'l:2026-10:diamant'], helpers);
    assert.equal((tiles.match(/data-showcase-item=/g) || []).length, 3);
    assert.match(tiles, /Diamant<\/span>\s*<span[^>]*>říjen 2026/);
    assert.match(tiles, /Vítěz &lt;3/);
    assert.doesNotMatch(tiles, /data-showcase-remove/);
    assert.equal(Showcase.tilesHtml([], helpers), '', 'prázdná vitrína v profilu nic neukáže');
    const own = Showcase.tilesHtml(['d:zemepis'], helpers, { remove: true, slots: true });
    assert.equal((own.match(/data-showcase-empty/g) || []).length, 2);
    assert.match(own, /data-showcase-remove="d:zemepis"/);
    const toggle = Showcase.toggleHtml({ entry: 'b:vitez', on: false, count: 2 });
    assert.match(toggle, /aria-pressed="false"[\s\S]*Vystavit[\s\S]*2\/3/);
    assert.match(Showcase.toggleHtml({ entry: 'b:vitez', on: true, count: 2 }), /Vystaveno/);
    assert.doesNotMatch(tiles + own + toggle + Showcase.miniHtml(['b:vitez'], helpers), /style=/);
});

test('napojení: moduly v index.html (po rating.js a look.js, před app.js), service workeru, nasazení a Tailwindu; schéma 18', () => {
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const file of ['league-seasons.js', 'showcase.js']) {
        assert.match(index, new RegExp(`<script src="${file.replace('.', '\\.')}" defer></script>`));
        assert.ok(index.indexOf('look.js') < index.indexOf(file) && index.indexOf('rating.js') < index.indexOf(file) && index.indexOf(file) < index.indexOf('app.js'), file);
        assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), new RegExp(`'${file.replace('.', '\\.')}'`));
        assert.match(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8'), new RegExp(`\\b${file.replace('.', '\\.')}\\b`));
        assert.match(fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8'), new RegExp(`'\\./${file.replace('.', '\\.')}'`));
    }
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    assert.match(sql, /add column if not exists showcase text\[\] not null default '\{\}'/);
    assert.match(sql, /grant update \(showcase\) on public\.profiles to authenticated/);
    assert.match(sql, /create or replace function public\.league_seasons\(player uuid default null\) returns jsonb\s+language plpgsql stable security definer/);
    assert.match(sql, /grant execute on function public\.league_seasons\(uuid\) to authenticated/);
    assert.ok(Number(/language sql immutable as \$\$ select (\d+) \$\$/.exec(sql)[1]) >= 18, 'schéma 18 nebo novější');
    assert.match(fs.readFileSync(path.join(ROOT, 'docs', 'SUPABASE.md'), 'utf8'), /## Ligové sezóny a vitrína v profilu \(schéma 18\)/);
    // Rámečky sezón mají styly (erb ligy přes obrázek z vlastního webu, CSP img-src 'self')
    const css = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
    for (const id of Look.LEAGUE_FRAMES.map(item => item.id)) {
        assert.match(css, new RegExp(`\\.frame-${id} \\{`));
        assert.match(css, new RegExp(`\\.frame-${id}::after \\{ background-image: url\\(icons/topics/${id}\\.webp\\)`));
        assert.ok(fs.existsSync(path.join(ROOT, 'icons', 'topics', `${id}.webp`)));
    }
});
