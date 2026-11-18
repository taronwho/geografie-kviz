// Motivace (blok 32): tematické víkendy (weekend.js), prestiž (prestige.js), Pozvi kamarády (referral.js), reakce a vítězné efekty
// (friends.js), vitrína se Sezónou (showcase.js), rámečky za pozvánky a prestiž (look.js, album.js), vlastní barva obleku (robe-color.js,
// look.js, look-owl.js) a shoda katalogu odemčení v supabase/schema.sql s aplikací. Spuštění: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Weekend = require('../weekend.js');
const Prestige = require('../prestige.js');
const Referral = require('../referral.js');
const Friends = require('../friends.js');
const Showcase = require('../showcase.js');
const Social = require('../social.js');
const Look = require('../look.js');
const Owl = require('../look-owl.js');
const Core = require('../quiz-core.js');
const Album = require('../album.js');
const Rewards = require('../rewards.js');
const RobeColor = require('../robe-color.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SQL = read('supabase/schema.sql');
const block = SQL.slice(SQL.indexOf('-- ===== 32: Motivace'), SQL.indexOf('-- ===== 32: Motivace — KONEC BLOKU'));
const noInlineStyle = (html, label) => assert.doesNotMatch(html, /\sstyle=/, `${label}: bez vložených stylů (CSP)`);

test('tematický víkend: pevný rozpis každý druhý víkend, pátek 18:00 až neděle 24:00 v Praze, 2× XP jen za téma víkendu', () => {
    assert.equal(Weekend.ROTATION.length, 14);
    assert.equal(new Set(Weekend.ROTATION).size, 14);
    for (const topic of Weekend.ROTATION) assert.ok(Weekend.GENITIVE[topic], topic);
    assert.equal(Weekend.topicOf(Weekend.EPOCH), Weekend.ROTATION[0]);
    assert.equal(Weekend.topicOf('2026-01-09'), null, 'lichý víkend bez tématu');
    assert.equal(Weekend.topicOf('2026-01-16'), Weekend.ROTATION[1]);
    // Zima (UTC+1): pátek 17:59 UTC = 18:59 v Praze
    assert.equal(Weekend.at(new Date('2026-11-20T16:59:00Z')).state, 'soon');
    const friday = Weekend.at(new Date('2026-11-20T17:00:00Z'));
    assert.deepEqual(friday, { friday: '2026-11-20', topic: 'film', title: 'Víkend filmu', state: 'active', endsDay: '2026-11-22' });
    assert.equal(Weekend.active(new Date('2026-11-22T22:59:00Z')).topic, 'film', 'neděle 23:59 v Praze ještě běží');
    assert.equal(Weekend.at(new Date('2026-11-22T23:00:00Z')), null, 'pondělí 0:00 v Praze konec');
    assert.equal(Weekend.at(new Date('2026-11-14T12:00:00Z')), null, 'víkend bez tématu');
    assert.equal(Weekend.at(new Date('2026-11-18T12:00:00Z')), null, 'všední den');
    // Léto (UTC+2): pátek 16:00 UTC = 18:00 v Praze
    assert.equal(Weekend.active(new Date('2026-06-05T15:59:00Z')), null);
    assert.equal(Weekend.active(new Date('2026-06-05T16:00:00Z')).title, 'Víkend architektury');
    assert.equal(Weekend.multiplier('film', new Date('2026-11-21T12:00:00Z')), 2);
    assert.equal(Weekend.multiplier('historie', new Date('2026-11-21T12:00:00Z')), 1);
    assert.equal(Weekend.multiplier('film', new Date('2026-11-20T10:00:00Z')), 1, 'v pátek dopoledne ještě ne');
    assert.deepEqual(Weekend.upcoming(new Date('2026-11-14T12:00:00Z'), 2).map(item => item.topic), ['film', 'mytologie']);
    // Všechny víkendy roku: téma má každý druhý a pořadí se opakuje po 14 tématech
    const year = [];
    for (let day = Date.UTC(2026, 0, 2); day < Date.UTC(2027, 0, 1); day += 7 * 86400000) year.push(Weekend.topicOf(new Date(day).toISOString().slice(0, 10)));
    assert.equal(year.filter(Boolean).length, Math.ceil(year.length / 2));
    // Řádek na záložce Dnes kreslí app.js; modul dává název, podtitulek a popisek pro čtečku
    assert.equal(friday.title, 'Víkend filmu');
    assert.equal(Weekend.rowText({ ...friday, state: 'active' }), '2× XP · do neděle');
    assert.equal(Weekend.rowText({ ...friday, state: 'soon' }), '2× XP · dnes od 18:00');
    assert.match(Weekend.bannerLabel({ ...friday, state: 'active' }, { topicTitle: () => 'Film' }), /^Víkend filmu: do neděle 24:00 dvojnásobek XP za otázky z tématu Film/);
});

test('prestiž: jen vrstva zobrazení nad XP, stejné hranice jako server', () => {
    assert.equal(Prestige.START_XP, Core.xpForLevel(100));
    assert.equal(Prestige.CYCLE_XP, 49500);
    assert.match(block, /else row_now\.prestige_xp \+ 49500 end/, 'prestige_up počítá stejně');
    const before = Prestige.view(329999, null);
    assert.deepEqual([before.prestige, before.level, before.canPrestige], [0, 99, false]);
    const top = Prestige.view(330000, null);
    assert.deepEqual([top.level, top.canPrestige, top.needed], [100, true, 0]);
    const state = Prestige.advance(null, 340000);
    assert.deepEqual(state, { n: 1, at: 340000 });
    assert.equal(Prestige.advance(null, 1000), null, 'pod úrovní 100 nejde');
    const fresh = Prestige.view(340000, state);
    assert.deepEqual([fresh.prestige, fresh.level, fresh.into, fresh.needed, fresh.realLevel, fresh.canPrestige], [1, 1, 0, 500, 100, false]);
    assert.equal(Prestige.view(340000 + 3 * 500 + 120, state).level, 4);
    assert.equal(Prestige.view(340000 + 49499, state).level, 99);
    const again = Prestige.view(340000 + 49500, state);
    assert.deepEqual([again.level, again.canPrestige], [100, true]);
    assert.equal(Prestige.levelText(fresh), '★1 · úr. 1');
    assert.equal(Prestige.levelText(before), 'Úr. 99');
    assert.deepEqual(Prestige.fromServer({ prestige: 2, prestige_xp: 400000 }), { n: 2, at: 400000 });
    assert.equal(Prestige.fromServer(null), null);
    assert.deepEqual(Prestige.newer({ n: 1, at: 5 }, { n: 2, at: 1 }), { n: 2, at: 1 });
    assert.deepEqual(Prestige.clean({ n: -3, at: 'x' }), { n: 0, at: 0 });
    // Strop XP v databázi pojme čtyři prestiže hned po sobě
    assert.ok(Prestige.START_XP + 3 * Prestige.CYCLE_XP <= 500000);
    const panel = Prestige.panelHtml(top, { signedIn: false });
    assert.match(panel, /Nic neztratíš: XP, odznaky, odměny, žebříčky i všechno odemčené ti zůstane/);
    assert.match(panel, /rámeček Prestižní/);
    assert.match(panel, /data-prestige-go/);
    assert.match(Prestige.confirmHtml({ ...top, realXp: 330000 }), /Opravdu přejít do prestiže 1\?/);
    assert.equal(Prestige.panelHtml(before), '', 'pod úrovní 100 nic');
    noInlineStyle(panel + Prestige.markHtml(3), 'prestiž');
    // Rámeček Prestižní jen s prestiží, ne úrovní ani dárkem z truhly
    const frame = Look.find('frames', 'prestiz');
    assert.equal(Look.isUnlocked(frame, { level: 100, badges: {}, prestige: 0, gifts: null }), false);
    assert.equal(Look.isUnlocked(frame, { level: 100, badges: {}, prestige: 1, gifts: null }), true);
});

test('pozvi kamarády: kód, odkaz, stav ze serveru, odměny a další stupeň', () => {
    assert.equal(Referral.parseCode('https://x.cz/?pritel=abcd-2345'), 'ABCD2345');
    assert.equal(Referral.parseCode('abcd 2345'), 'ABCD2345');
    assert.equal(Referral.parseCode('ABCD0345'), '', '0 v abecedě není');
    assert.equal(Referral.parseCode('ABC'), '');
    assert.equal(Referral.formatCode('ABCD2345'), 'ABCD-2345');
    assert.equal(Referral.link('https://mudrlant.cz/?tab=multi#x', 'ABCD2345'), 'https://mudrlant.cz/?pritel=ABCD2345');
    assert.match(Referral.shareText('ABCD2345', 'https://m.cz/'), /oba dostaneme rámeček Přátelský/);
    assert.match(block, /'\^\[ABCDEFGHJKMNPQRSTUVWXYZ2-9\]\{8\}\$'/, 'tvar kódu v databázi');
    assert.match(block, /'ABCDEFGHJKMNPQRSTUVWXYZ23456789'/, 'abeceda kódu v databázi');
    assert.equal(Referral.CODE_ALPHABET, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    assert.match(block, /check \(reward in \('novacek', 'pritel-1', 'pritel-3', 'pritel-10'\)\)/);
    assert.deepEqual(Referral.REWARD_KEYS, ['novacek', 'pritel-1', 'pritel-3', 'pritel-10']);
    assert.match(block, /unnest\(array\[1, 3, 10\]\)/);
    assert.deepEqual(Referral.TIERS, [1, 3, 10]);
    assert.match(block, />= 3;\n/, 'kamarád se počítá po 3 hrách');
    const status = Referral.parseStatus({ code: 'ABCD2345', inviter: null, games: 2, join_until: '2099-01-01T00:00:00Z', qualified: 1, claimed: ['pritel-1', 'x'], ready: ['pritel-3'],
        invited: [{ id: '11111111-1111-1111-1111-111111111111', display_name: 'Ája', games: 4, qualified: true }, { id: 'zlé', display_name: 'X' }] });
    assert.equal(status.invited.length, 1);
    assert.deepEqual(status.claimed, ['pritel-1']);
    assert.equal(Referral.canJoin(status, Date.parse('2026-11-14')), true);
    assert.equal(Referral.canJoin({ ...status, joinUntil: null }), false);
    assert.equal(Referral.nextTier(status).need, 3);
    assert.deepEqual(Referral.prizeOf(['novacek', 'pritel-3']), { xp: 700, frames: ['pratelsky'], reactions: ['🤗'], effects: ['srdicka'] });
    const html = Referral.dialogHtml(status, { h: { avatarHtml: () => '<i></i>', frameClass: () => ' frame frame-pratelsky' } });
    assert.match(html, /ABCD-2345/);
    assert.match(html, /aspoň 3 hry: Kvíz dne, výzvu, Řetězovku, Tajemnou otázku nebo souboj s bossem/);
    assert.match(html, /data-referral-join/);
    assert.match(html, /Vyzvednout 1 odměnu/);
    noInlineStyle(html + Referral.cardHtml(status) + Referral.welcomeHtml(), 'pozvánky');
    // Rámečky za pozvání jen podle klíčů odměn ze serveru
    const friendly = Look.find('frames', 'pratelsky');
    assert.equal(Look.isUnlocked(friendly, { level: 100, badges: {}, referral: [] }), false);
    assert.equal(Look.isUnlocked(friendly, { level: 1, badges: {}, referral: ['novacek'] }), true);
    assert.equal(Look.isUnlocked(Look.find('frames', 'parta'), { level: 1, badges: {}, referral: ['pritel-1', 'pritel-3'] }), false);
});

test('reakce a vítězné efekty: odemykání, stejný seznam v social.js a v databázi, HTML bez vložených stylů', () => {
    assert.deepEqual(Social.REACTIONS, Friends.ALL_REACTIONS, 'social.js pošle všechny reakce');
    const list = /match_reactions_emoji_list check \(emoji in \(([^)]+)\)\)/g;
    let found = null;
    for (const m of SQL.matchAll(list)) found = m[1];
    assert.deepEqual(found.split(',').map(item => item.trim().replace(/'/g, '')), Friends.ALL_REACTIONS, 'poslední kontrola v schema.sql');
    assert.deepEqual(Friends.unlockedReactions({ level: 1 }), Friends.REACTIONS);
    const rich = { level: 50, badges: { strelec: '2026-01-01' }, gifts: { frames: ['sezona-11-b'], titles: ['sampion-sezony'] }, referral: ['pritel-3'] };
    assert.deepEqual(Friends.unlockedReactions(rich), Friends.ALL_REACTIONS.filter(emoji => emoji !== '💪'));
    assert.deepEqual(Friends.unlockedEffects({ level: 20 }), ['konfety', 'hvezdy']);
    assert.ok(Friends.unlockedEffects(rich).includes('srdicka') && Friends.unlockedEffects(rich).includes('sezona'));
    const bar = Friends.reactionBar('u2', null, { unlocked: Friends.unlockedReactions({ level: 15 }), more: true, name: 'Ája' });
    assert.equal((bar.match(/data-action="react"/g) || []).length, 6);
    assert.match(bar, /data-action="reactions-info"/);
    assert.doesNotMatch(Friends.reactionBar('u2', '👍'), /Poslal jsi/, 'rodově neutrální text');
    assert.match(Friends.reactionBar('u2', '👍'), /Reakce odeslána: dobrá hra/);
    const perks = Friends.perksHtml({ level: 20 }, { chosen: 'hvezdy' });
    assert.match(perks, /data-fx-pick="hvezdy"[^>]*aria-checked="true"/);
    assert.match(perks, /data-fx-locked="koruna"/);
    const styles = read('styles.css');
    for (const item of Friends.VICTORY_EFFECTS) {
        const html = Friends.effectHtml(item.id, { caption: 'Slavíš vítězství!' });
        assert.match(html, new RegExp(`vfx-${item.id}`));
        assert.ok(styles.includes(`.vfx-${item.id}`), `CSS efektu ${item.id}`);
        assert.ok(styles.includes(`.vfx-swatch-${item.id}`), `vzorek efektu ${item.id}`);
        noInlineStyle(html, item.id);
    }
    noInlineStyle(perks + bar, 'výběr reakcí');
    for (const id of ['pratelsky', 'parta', 'prestiz']) assert.ok(styles.includes(`.frame-${id}`), `CSS rámečku ${id}`);
});

test('vitrína: titul a věci ze Sezóny (tvar shodný s databází a social.js, popis)', () => {
    let sqlPattern = null;
    for (const m of SQL.matchAll(/x ~ '(\^\(b:[^']+)'/g)) sqlPattern = m[1];
    const sqlRegex = new RegExp(sqlPattern);
    const samples = ['t:sampion-sezony', 's:frames:sezona-11', 's:avatars:caj', 's:accessories:lampion', 's:robes:zelena', 't:', 't:Sampion', 's:frames:', 'b:vitez', 'l:2026-10:zlato'];
    for (const sample of samples) {
        assert.equal(Showcase.isEntry(sample), sqlRegex.test(sample), `showcase.js vs SQL: ${sample}`);
        assert.equal(Social.SHOWCASE_ENTRY.test(sample), Showcase.isEntry(sample), `social.js vs showcase.js: ${sample}`);
    }
    assert.deepEqual(Showcase.parse('s:avatars:caj'), { kind: 'seasonItem', category: 'avatars', id: 'caj' });
    const h = { titleItem: (id) => Look.titleItem(id), titleArt: (cls) => `<i class="${cls}"></i>`, seasonItem: (category, id) => Look.find(category, id), seasonArt: (c, item, cls) => `<i class="${cls}"></i>`, monthName: (m) => Look.SEASON_MONTHS[m - 1] };
    assert.deepEqual(Showcase.describe('t:sampion-sezony', h, 'x'), { kind: 'title', title: 'Šampion sezóny', caption: 'Titul sezóny', label: 'Titul Šampion sezóny', art: '<i class="x"></i>' });
    const frame = Showcase.describe('s:frames:sezona-11', h, 'x');
    assert.deepEqual([frame.title, frame.caption], ['Listopadový', 'Listopad']);
    assert.equal(Showcase.describe('t:sampion-sezony', {}, 'x'), null, 'bez pomocníků se přeskočí');
    const tiles = Showcase.tilesHtml(['t:sampion-sezony', 's:avatars:caj'], h, { remove: true });
    assert.equal((tiles.match(/data-showcase-item/g) || []).length, 2);
    noInlineStyle(tiles, 'vitrína');
});

test('katalog odemčení v databázi odpovídá look.js a friends.js; úrovně a skupiny odznaků jako quiz-core.js', () => {
    // Řádky bloku 32 a za nimi řádky pozdějších bloků (blok 35: další postavičky v unlock_catalog_more)
    const block35 = SQL.slice(SQL.indexOf('-- ===== 35: Další postavičky'), SQL.indexOf('-- ===== 35: Další postavičky (č. 317–408) — KONEC BLOKU'));
    const rowsOf = (text, fn) => [...text.slice(text.indexOf(`function public.${fn}()`), text.indexOf('as t (cat, item, rule)', text.indexOf(`function public.${fn}()`))).matchAll(/\('([a-z]+)', '([^']+)', '([^']+)'\)/g)].map(m => `${m[1]}|${m[2]}|${m[3]}`);
    assert.match(block, /as t \(cat, item, rule\)\n    union all select \* from public\.unlock_catalog_more\(\);/, 'unlock_catalog() přidá řádky pozdějších bloků');
    assert.ok(block35.length > 0 && SQL.indexOf('-- ===== 35: Další postavičky') > SQL.indexOf('-- ===== 32: Motivace — KONEC BLOKU'), 'blok 35 je za blokem 32');
    const rows = [...rowsOf(block, 'unlock_catalog'), ...rowsOf(block35, 'unlock_catalog_more')];
    const ruleOf = (item) => item.referral ? `referral:${[].concat(item.referral).join(',')}` : item.prestige ? `prestige:${item.prestige}` : item.source === 'season' ? 'season-gift'
        : item.exclusive || item.chest || item.rare ? 'gift' : item.diploma ? `diploma:${item.diploma}` : item.league ? `league:${item.league}` : item.badge ? `badge:${item.badge}`
            : item.season ? `season:${item.season}` : (item.level || 1) <= 1 ? 'free' : `level:${item.level}`;
    const expected = [];
    for (const [cat, items] of [['frames', Look.FRAMES], ['titles', Look.TITLES], ['robes', Look.ROBES], ['accessories', Look.ACCESSORIES], ['colors', Look.ACC_COLORS], ['poses', Look.POSES]]) for (const item of items) expected.push(`${cat}|${item.id}|${ruleOf(item)}`);
    for (const item of Look.AVATARS.filter(entry => !Look.NEW_AVATARS.includes(entry))) {
        expected.push(`avatars|${item.id}|${ruleOf(item)}`);
        if (item.was) { expected.push(`avatars|${item.was}|${ruleOf(item)}`); if (item.was.replace(/️/g, '') !== item.was) expected.push(`avatars|${item.was.replace(/️/g, '')}|${ruleOf(item)}`); }
    }
    for (const emoji of Friends.REACTIONS) expected.push(`reactions|${emoji}|free`);
    for (const item of Friends.EXTRA_REACTIONS) expected.push(`reactions|${item.emoji}|${ruleOf(item)}`);
    for (const item of Friends.VICTORY_EFFECTS) expected.push(`fx|${item.id}|${ruleOf(item)}`);
    for (const item of Look.NEW_AVATARS) expected.push(`avatars|${item.id}|${ruleOf(item)}`);
    assert.deepEqual(rows, expected, 'unlock_catalog() = katalog aplikace (přegenerovat podle look.js a friends.js)');
    const levels = /unnest\(array\[([0-9, ]+)\]\) t where coalesce\(xp, 0\) >= t/.exec(block)[1].split(',').map(Number);
    assert.deepEqual(levels, Core.LEVEL_XP);
    const tiers = [...block.slice(block.indexOf('function public.badge_tiers()'), block.indexOf('as t (grp, tiers)')).matchAll(/\('([a-z0-9-]+)', array\[([^\]]+)\]\)/g)]
        .map(m => [m[1], m[2].split(',').map(id => id.trim().replace(/'/g, ''))]);
    assert.deepEqual(tiers, Core.BADGE_GROUPS.map(group => [group.id, group.badges.map(badge => badge.id)]));
});

test('album: rámečky za pozvánky a prestiž jen když je hráč má, do procent se nepočítají', () => {
    const input = { level: 30, badges: {}, gifts: {}, diplomas: {}, today: '2026-11-14', topics: [{ id: 'zemepis', title: 'Zeměpis' }] };
    Look.setPerks({ referral: [], prestige: 0 });
    const without = Album.build(input);
    const frames = without.sections.find(section => section.id === 'frames');
    assert.ok(!frames.entries.some(entry => ['pratelsky', 'parta', 'prestiz'].includes(entry.id)));
    Look.setPerks({ referral: ['novacek'], prestige: 1 });
    try {
        const withPerks = Album.build({ ...input, today: '2026-11-15' });
        const after = withPerks.sections.find(section => section.id === 'frames');
        assert.ok(after.entries.some(entry => entry.id === 'pratelsky' && entry.owned && !entry.counted));
        assert.ok(after.entries.some(entry => entry.id === 'prestiz' && entry.owned));
        assert.equal(after.total, frames.total, 'celkový počet stejný');
    } finally { Look.setPerks(null); }
    // Truhla ani Sezóna je nedají
    assert.ok(!Rewards.candidates({}, { level: 1, badges: {} }).some(entry => ['frames', 'robes'].includes(entry.category) && ['pratelsky', 'parta', 'prestiz', 'vlastni'].includes(entry.item.id)));
});

test('vlastní barva obleku: od úrovně 20, barva v nastavení i v textu sovy, přebarvení zachová stínování', () => {
    const robe = Look.find('robes', 'vlastni');
    assert.equal(robe.level, 20);
    assert.equal(Look.isUnlocked(robe, { level: 19, badges: {} }), false);
    assert.equal(Look.isUnlocked(robe, { level: 20, badges: {} }), true);
    assert.equal(Look.normalize({ robe: 'vlastni', robeColor: '210.-20' }, { level: 19, badges: {} }).robe, 'vinova', 'zamčená se nepřijme');
    const prefs = Look.normalize({ robe: 'vlastni', robeColor: '210.-20' }, { level: 25, badges: {} });
    assert.deepEqual([prefs.robe, prefs.robeColor], ['vlastni', '210.-20']);
    assert.equal(Look.normalize({ robeColor: '213.0' }, null).robeColor, Look.ROBE_COLOR_DEFAULT, 'odstín jen po 5°');
    assert.equal(Look.cleanRobeColor('360.0'), null);
    assert.equal(Look.cleanRobeColor('35.45'), null);
    assert.equal(RobeColor.clean('35.-40'), '35.-40');
    // Text sovy pro profil (ostatní hráči): robe=vlastni;robec=…
    const text = Owl.encodeOwl({ robe: 'vlastni', robeColor: '210.-20', acc: {}, pose: 'titul-3' });
    assert.equal(text, 'robe=vlastni;robec=210.-20;pose=titul-3');
    assert.deepEqual(Owl.parseOwl(text), { robe: 'vlastni', acc: {}, pose: 'titul-3', robeColor: '210.-20' });
    assert.match(Owl.owlAvatarHtml('robe=vlastni;robec=95.10'), /data-robe-color="95\.10" src="icons\/logo\.webp"/);
    assert.match(Owl.poseHtml('titul-3', 'vlastni', '30.0'), /data-robe-color="30\.0" src="icons\/topics\/sova-titul-3\.webp"/);
    assert.equal(Social.cleanOwl(text), text, 'tvar projde i do databáze');
    // Pixely: vínový talár (tři tóny), zlatá, bílá, světle růžový jazyk, průhledný
    const px = [[135, 35, 63, 255], [92, 26, 47, 255], [185, 71, 108, 255], [250, 204, 21, 255], [255, 255, 255, 255], [250, 170, 170, 255], [135, 35, 63, 0]];
    const data = new Uint8ClampedArray(px.flat());
    const changed = RobeColor.recolorPixels(data, px.length, 1, '210.0');
    const out = Array.from({ length: px.length }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 4)));
    assert.equal(changed, 3, 'jen tři tóny taláru');
    for (const i of [0, 1, 2]) assert.ok(out[i][2] > out[i][0], `tón ${i} je modrý: ${out[i]}`);
    const lum = (rgb) => 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
    assert.ok(lum(out[1]) < lum(out[0]) && lum(out[0]) < lum(out[2]), 'stín, plocha a světlo zůstanou v pořadí (stínování i obrys)');
    assert.deepEqual(out.slice(3), px.slice(3), 'zlatá, bílá, jazyk a průhledné beze změny');
    const light = new Uint8ClampedArray([135, 35, 63, 255]);
    const dark = new Uint8ClampedArray([135, 35, 63, 255]);
    RobeColor.recolorPixels(light, 1, 1, '210.40');
    RobeColor.recolorPixels(dark, 1, 1, '210.-40');
    assert.ok(lum(light) > lum(dark), 'světlost posune jas');
    assert.ok(RobeColor.areaFor('icons/topics/sova-titul-11.webp') && !RobeColor.areaFor('icons/logo.webp'));
    assert.match(RobeColor.swatch('120.0'), /^#[0-9a-f]{6}$/);
    // Výběr v Nastavení: zamčený řádek „Od 20. úrovně“, posuvníky jen odemčené (look-robes.js je jen pro prohlížeč)
    const robesJs = read('look-robes.js');
    assert.match(robesJs, /Od 20\. úrovně/);
    assert.match(robesJs, /data-robe-hue/);
    assert.match(robesJs, /data-robe-light/);
    const styles = read('styles.css');
    for (const cls of ['robe-rainbow', 'robe-range-hue', 'robe-range-light']) assert.ok(styles.includes(`.${cls}`), cls);
});

test('napojení: skripty v index.html, CSP s blob: pro přebarvenou sovu, service worker a verze schématu', () => {
    const index = read('index.html');
    for (const file of ['weekend.js', 'prestige.js', 'referral.js', 'robe-color.js']) {
        assert.match(index, new RegExp(`<script src="${file.replace('.', '\\.')}" defer></script>`));
        assert.ok(read('sw.js').includes(`'${file}'`), `sw.js: ${file}`);
    }
    assert.ok(index.indexOf('robe-color.js') < index.indexOf('look-robes.js'), 'robe-color.js před look-robes.js');
    const cspIndex = /Content-Security-Policy" content="([^"]+)"/.exec(index)[1];
    const cspHeaders = /Content-Security-Policy: (.+)/.exec(read('_headers'))[1];
    assert.ok(cspHeaders.startsWith(cspIndex), 'index.html a _headers stejné');
    assert.match(cspIndex, /img-src 'self' blob: https:/);
    assert.doesNotMatch(cspIndex, /unsafe-inline|data:/);
    // (verze schématu je aspoň 32: blok 33 přidal zamrzlé denní módy)
    assert.ok(Number(/language sql immutable as \$\$ select (\d+) \$\$/.exec(SQL)[1]) >= 32);
    assert.ok(Number(/const REQUIRED_SCHEMA = (\d+);/.exec(read('app.js'))[1]) >= 32);
});
