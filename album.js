// Album sbírky: všechno, co jde v Mudrlantovi sbírat, na jednom místě – co hráč má a co mu chybí. Sekce: postavičky, doplňky Mudrlanta,
// rámečky, barevná témata, taláry a barvy doplňků (katalog look.js), odznaky (quiz-core.js) a diplomy (rewards.js). Věci se berou přímo
// z katalogů, takže nové (i sezónní a ligové) se v albu objeví samy; druh katalogu bez vlastní sekce dostane obecnou sekci před odznaky.
//
// Jak se počítá:
// - Do sbírky patří jen to, co se dá získat: věci, které má každý od začátku (vínové téma a talár, Bez rámečku), se nepočítají ani neukazují.
// - Odměny za album samo (položka s album: true – rámeček Sběratelský; odznaky alba z quiz-core isAlbumBadge) se ukazují, ale nepočítají,
//   jinak by 100 % nešlo nikdy získat.
// - Časově omezené věci (položka s exclusive, season nebo league): dokud jdou získat, počítají se (chybí-li, jsou v albu šedé jako ostatní,
//   ať je hráč stihne). Po skončení se počítají, jen když je hráč má; jinak zůstanou šedé s „Sezónní – už nejde získat“ a procenta nesnižují.
//   Ještě nezačaté jsou skryté, dokud je hráč nemá (nekazí procenta ani nic neprozrazují). Kdy jdou získat, říká availability(): pole
//   from/until (RRRR-MM-DD) na položce nebo v item.season ({ from, until }), available: false, jinak „pořád“; modul sezóny může dát vlastní
//   pravidlo přes setAvailability((item, category, today) => 'active' | 'ended' | 'upcoming').
// - Odznaky se počítají po jednom (každý stupeň), v albu jsou ale po skupinách (59 dlaždic místo 300 medailí).
// - Celková procenta = průměr procent sekcí: každá sekce má stejnou váhu (odznaků je přes 300, jinak by album bylo jen počítadlo odznaků).
//   Zaokrouhluje se dolů, takže 100 % je opravdu všechno.
// - Milníky 25, 50, 75 a 100 % a celé sekce dávají odznaky Album sbírky (quiz-core.js: tituly Sběratel … Legenda sbírky, Celý zvěřinec …);
//   hodnotu jim dává badgeContext() přes x.album. Za 100 % je i rámeček Sběratelský (look.js).
// Výpočet je levný (pár set položek bez DOMu) a poslední výsledek se pro stejný vstup pamatuje, takže překreslení okna nic nepočítá znovu.
// HTML okna (album, sekce, podrobnosti věci) je tu, napojení na hru (otevření z Mého postupu, Nasadit, oslavy milníků) dělá app.js.
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantLook || (isNode ? require('./look.js') : null), root.MudrlantCore || (isNode ? require('./quiz-core.js') : null),
        root.MudrlantRewards || (isNode ? require('./rewards.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantAlbum = api;
})(typeof self !== 'undefined' ? self : this, (Look, Core, Rewards) => {
    'use strict';
    // Obrázek alba (dlaždice v Mém postupu, hlavička alba) a zatím i symbol odznaků alba: otevřená kniha s hvězdami.
    // TODO(obrázek): icons/topics/odznak-sberatel.webp dodá vedoucí – pak ALBUM_ART = 'odznak-sberatel', v app.js a sw.js přidat 'sberatel'
    // do BADGE_ART a odebrat zástupce v badgeArtOf (app.js) a v tests/badge-art.test.js.
    const ALBUM_ART = 'odznak-poznane';

    // Sekce alba v pořadí záložek (catalog = druh v Look.CATALOG); kind = jak se věc jmenuje v podrobnostech
    const SECTIONS = [
        { id: 'avatars', catalog: 'avatars', title: 'Postavičky', short: 'Postavičky', kind: 'Postavička' },
        { id: 'accessories', catalog: 'accessories', title: 'Doplňky Mudrlanta', short: 'Doplňky', kind: 'Doplněk Mudrlanta' },
        { id: 'frames', catalog: 'frames', title: 'Rámečky', short: 'Rámečky', kind: 'Rámeček profilu' },
        { id: 'themes', catalog: 'themes', title: 'Barevná témata', short: 'Témata', kind: 'Barevné téma' },
        { id: 'robes', catalog: 'robes', title: 'Taláry', short: 'Taláry', kind: 'Talár Mudrlanta' },
        { id: 'colors', catalog: 'colors', title: 'Barvy doplňků', short: 'Barvy', kind: 'Barva doplňků' },
        { id: 'badges', title: 'Odznaky', short: 'Odznaky', kind: 'Odznaky' },
        { id: 'diplomas', title: 'Diplomy', short: 'Diplomy', kind: 'Diplom' }
    ];
    const capital = (text) => String(text || '').charAt(0).toLocaleUpperCase('cs') + String(text || '').slice(1);
    // Sekce včetně druhů katalogu, které album zatím nezná (obecná sekce s názvem podle Look.REWARD_KINDS), vložené před odznaky
    const sections = () => {
        const known = new Set(SECTIONS.map(section => section.catalog).filter(Boolean));
        const extra = Look ? Object.keys(Look.CATALOG).filter(category => !known.has(category)).map(category => {
            const name = capital((Look.REWARD_KINDS && Look.REWARD_KINDS[category]) || category);
            return { id: category, catalog: category, title: name, short: name, kind: name };
        }) : [];
        const at = SECTIONS.findIndex(section => section.id === 'badges');
        return [...SECTIONS.slice(0, at), ...extra, ...SECTIONS.slice(at)];
    };

    // --- Odznaky alba (quiz-core.js) ---
    const isAlbumBadge = (id) => Boolean(Core && Core.isAlbumBadge && Core.isAlbumBadge(id));
    const isAlbumGroup = (group) => Boolean(group && group.badges.length && group.badges.every(badge => isAlbumBadge(badge.id)));
    const MILESTONES = (Core && Core.ALBUM_MILESTONES ? Core.ALBUM_MILESTONES : []).map(([goal, title]) => ({ goal, title, id: `sberatel-${goal}` }));
    // Titul za celou sekci (jen u sekcí, které ho mají), jinak null
    const sectionTitle = (sectionId) => {
        const found = (Core && Core.ALBUM_SECTION_TITLES ? Core.ALBUM_SECTION_TITLES : []).find(([section]) => section === sectionId);
        return found ? { id: `album-${found[0]}`, title: found[2] } : null;
    };
    // Další milník nad procenty (null po 100 %)
    const nextMilestone = (percent) => MILESTONES.find(milestone => milestone.goal > percent) || null;

    // --- Časově omezené věci ---
    const LIMITED_KEYS = ['exclusive', 'season', 'league'];
    const STATES = ['active', 'ended', 'upcoming'];
    const isLimited = (item) => Boolean(item && LIMITED_KEYS.some(key => item[key]));
    const DAY = /^\d{4}-\d{2}-\d{2}/;
    const dayOf = (value) => (typeof value === 'string' && DAY.test(value) ? value.slice(0, 10) : '');
    const windowOf = (item) => {
        const season = item.season && typeof item.season === 'object' ? item.season : {};
        return { from: dayOf(item.from || season.from || season.start), until: dayOf(item.until || season.until || season.end || season.to) };
    };
    let resolver = null;
    let resolverVersion = 0;
    const setAvailability = (fn) => { resolver = typeof fn === 'function' ? fn : null; resolverVersion += 1; };
    // 'always' (běžná věc), 'active' (omezená, teď jde získat), 'ended' (už nejde), 'upcoming' (ještě nezačala)
    const availability = (item, category, today) => {
        if (!isLimited(item)) return 'always';
        if (resolver) {
            try { const state = resolver(item, category, today); if (STATES.includes(state)) return state; } catch (e) { /* vlastní pravidlo selhalo: podle dat */ }
        }
        if (item.available === false) return 'ended';
        const { from, until } = windowOf(item);
        if (until && today && today > until) return 'ended';
        if (from && today && today < from) return 'upcoming';
        return 'active';
    };
    const formatDay = (day) => (Rewards && Rewards.formatDay ? Rewards.formatDay(day) : day);

    // --- Sbírka ---
    // Věc, kterou má každý od začátku (odemčená na úrovni 1 bez odznaků a truhly), do sbírky nepatří
    const isStarter = (item) => Boolean(Look) && !isLimited(item) && !item.album && Look.isUnlocked(item, { level: 1, badges: {}, gifts: null });
    // Položky sekce z katalogu: { key, category, id, item, title, owned, state: 'owned' | 'missing' | 'ended' | 'reward', counted, limited, until }
    const catalogEntries = (category, input) => {
        if (!Look) return [];
        const ctx = { level: input.level, badges: input.badges, gifts: input.gifts };
        const entries = [];
        for (const item of Look.CATALOG[category] || []) {
            if (isStarter(item)) continue;
            const owned = Look.isUnlocked(item, ctx);
            const limited = isLimited(item);
            const when = owned ? null : availability(item, category, input.today);
            if (when === 'upcoming') continue;
            const state = owned ? 'owned' : item.album ? 'reward' : when === 'ended' ? 'ended' : 'missing';
            entries.push({ key: `${category}:${item.id}`, category, id: item.id, item, title: item.title, owned, state, counted: !item.album && state !== 'ended', limited, until: limited ? windowOf(item).until : '' });
        }
        return entries;
    };
    // Odznaky po skupinách (bez odznaků alba): owned/total = počet stupňů
    const badgeEntries = (input) => (Core ? Core.BADGE_GROUPS : []).filter(group => !isAlbumGroup(group)).map(group => {
        const have = group.badges.filter(badge => input.badges[badge.id]);
        return { key: `badges:${group.id}`, category: 'badges', id: group.id, group, title: group.title, owned: have.length > 0, have: have.length, haveIds: have.map(badge => badge.id), size: group.badges.length,
            complete: have.length === group.badges.length, top: have[have.length - 1] || null, state: have.length ? 'owned' : 'missing', counted: true };
    });
    const diplomaEntries = (input) => input.topics.map(topic => ({
        key: `diplomas:${topic.id}`, category: 'diplomas', id: topic.id, topic, title: Rewards ? Rewards.diplomaTitle(topic) : topic.title,
        owned: Boolean(input.diplomas[topic.id]), day: input.diplomas[topic.id] || '', state: input.diplomas[topic.id] ? 'owned' : 'missing', counted: true
    }));
    const percentOf = (ratio) => Math.floor(ratio * 100 + 1e-9);
    // Vstup: { level, badges: { id: den }, gifts: { druh: [id] }, diplomas: { téma: den }, topics: [{ id, title }], today: 'RRRR-MM-DD' }
    const clean = (input = {}) => ({
        level: Number.isFinite(input.level) ? input.level : 1,
        badges: input.badges && typeof input.badges === 'object' ? input.badges : {},
        gifts: input.gifts && typeof input.gifts === 'object' ? input.gifts : {},
        diplomas: input.diplomas && typeof input.diplomas === 'object' ? input.diplomas : {},
        topics: Array.isArray(input.topics) ? input.topics : Object.keys((Rewards && Rewards.DIPLOMA_NAMES) || {}).map(id => ({ id, title: id })),
        today: dayOf(input.today) || new Date().toISOString().slice(0, 10)
    });
    const catalogSize = () => (Look ? Object.values(Look.CATALOG).reduce((sum, items) => sum + items.length, 0) : 0) + (Core ? Core.BADGES.length : 0);
    const signature = (input) => [input.level, input.today, Object.keys(input.badges).join(','), JSON.stringify(input.gifts), Object.keys(input.diplomas).join(','),
        input.topics.map(topic => topic.id).join(','), catalogSize(), resolverVersion].join('|');
    let memo = { key: null, value: null };
    // Celé album: { sections: [{ ...sekce, entries, owned, total, percent, complete, ended, reward }], percent, complete: [id sekcí] }.
    // Výsledek je sdílený (pamatuje se), nic v něm neměň.
    const build = (rawInput) => {
        const input = clean(rawInput);
        const key = signature(input);
        if (memo.key === key) return memo.value;
        const list = sections().map(section => {
            const entries = section.id === 'badges' ? badgeEntries(input) : section.id === 'diplomas' ? diplomaEntries(input) : catalogEntries(section.catalog, input);
            const counted = entries.filter(entry => entry.counted);
            const owned = section.id === 'badges' ? counted.reduce((sum, entry) => sum + entry.have, 0) : counted.filter(entry => entry.owned).length;
            const total = section.id === 'badges' ? counted.reduce((sum, entry) => sum + entry.size, 0) : counted.length;
            return { ...section, entries, owned, total, ratio: total ? owned / total : null, percent: total ? percentOf(owned / total) : 100, complete: total > 0 && owned === total,
                ended: entries.filter(entry => entry.state === 'ended').length, reward: sectionTitle(section.id) };
        });
        const scored = list.filter(section => section.total > 0);
        const ratio = scored.length ? scored.reduce((sum, section) => sum + section.ratio, 0) / scored.length : 0;
        const value = { sections: list, ratio, percent: percentOf(ratio), complete: list.filter(section => section.complete).map(section => section.id),
            owned: scored.reduce((sum, section) => sum + section.owned, 0), total: scored.reduce((sum, section) => sum + section.total, 0) };
        memo = { key, value };
        return value;
    };
    // Hodnota pro odznaky alba v quiz-core (x.album): { percent, sections: { sekce: procenta } }
    const badgeContext = (input) => {
        const album = build(input);
        return { percent: album.percent, sections: Object.fromEntries(album.sections.map(section => [section.id, section.total ? section.percent : 0])) };
    };
    // Odznaky alba, na které hráč dosáhl, ale ještě je nemá (pro rychlou kontrolu na úvodu, bez přepočtu ostatních odznaků)
    const dueBadges = (input) => {
        const x = { album: badgeContext(input) };
        const badges = clean(input).badges;
        return (Core ? Core.BADGES : []).filter(badge => isAlbumBadge(badge.id) && !badges[badge.id] && badge.test({}, x)).map(badge => badge.id);
    };
    const section = (album, id) => album.sections.find(entry => entry.id === id) || album.sections[0];
    const findEntry = (album, key) => {
        for (const entry of album.sections) {
            const found = entry.entries.find(item => item.key === key);
            if (found) return { section: entry, entry: found };
        }
        return null;
    };

    // --- Texty ---
    const badgeTitle = (id) => (Core && Core.BADGE_BY_ID && Core.BADGE_BY_ID[id] ? Core.BADGE_BY_ID[id].title : id);
    const NB = '\u00a0';
    const MASTERY = Core && Core.MASTERY_STEPS ? Core.MASTERY_STEPS : [5, 20, 60, 150, 300];
    const CHEST_KINDS = Rewards && Rewards.GIFT_CATEGORIES ? Rewards.GIFT_CATEGORIES : [];
    // Jak věc získat (podrobnosti): odznak s popisem, úroveň (a truhla), sezónní okno, odměna za album
    const howText = (entry) => {
        if (entry.category === 'diplomas') return `Za plné mistrovství tématu (${MASTERY.length} hvězdiček): aspoň jednou správně poznej ${MASTERY[MASTERY.length - 1]} různých položek tématu ${entry.topic.title}.`;
        if (entry.category === 'badges') {
            const next = entry.group.badges.find(badge => !entry.haveIds.includes(badge.id));
            return !next ? 'Máš všechny stupně této skupiny.' : `${entry.size > 1 ? 'Další stupeň' : 'Odznak'} „${next.title}“: ${next.text}`;
        }
        const item = entry.item;
        if (entry.state === 'ended') return 'Sezónní – už nejde získat. Do sbírky se nepočítá.';
        const badge = item.badge && Core && Core.BADGE_BY_ID ? Core.BADGE_BY_ID[item.badge] : null;
        let text = item.album ? `Odměna za celé album sbírky (100${NB}%) spolu s titulem „${badgeTitle(item.badge)}“.`
            : badge ? `Za odznak „${badge.title}“: ${badge.text}`
                : item.badge || !Number.isFinite(item.level) ? `${Look ? Look.unlockText(item, item.badge ? badgeTitle(item.badge) : null) : ''}.`
                    : `Od úrovně ${item.level}.${!entry.owned && CHEST_KINDS.includes(entry.category) && !entry.limited && !item.noGift ? ' Nebo dřív z Truhly Mudrlanta za splněné cíle týdne.' : ''}`;
        if (entry.limited) text += ` Sezónní věc${entry.until ? `, jde získat do ${formatDay(entry.until)}` : ''}.`;
        return text.replace(/\.\.$/, '.');
    };
    const STATUS = {
        owned: { text: 'Ve sbírce', icon: 'check', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
        missing: { text: 'Chybí', icon: 'lock', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
        ended: { text: 'Sezónní – už nejde získat', icon: 'hourglass', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
        reward: { text: 'Odměna za celé album', icon: 'sparkles', tone: 'bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200' }
    };

    // --- HTML (h = pomocné funkce z app.js: esc, medal(badge, earned, size, iconSize), avatar(id, cls), topicIcon, styleOf, frameClass) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const BAR = (percent, tone = 'bg-gold-500', track = 'bg-slate-200 dark:bg-slate-700', height = 'h-1.5') => `<span class="block ${height} overflow-hidden rounded-full ${track}" aria-hidden="true"><span class="block h-full w-0 rounded-full ${tone}" data-progress="${Math.max(0, Math.min(100, percent))}"></span></span>`;
    const COLOR_DOT = {
        cervena: 'bg-red-600', oranzova: 'bg-orange-500', zluta: 'bg-yellow-400', zelena: 'bg-green-600', modra: 'bg-blue-600', fialova: 'bg-purple-600',
        ruzova: 'bg-pink-400', cerna: 'bg-neutral-900 dark:ring-1 dark:ring-white/40', vlastni: 'bg-[conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]'
    };
    // Obrázek věci: malý v dlaždici, velký v podrobnostech. Rámeček je skutečná třída rámečku kolem malé sovy (v mé barvě obleku).
    const artHtml = (entry, h, big = false) => {
        const size = big ? 'h-16 w-16' : 'h-8 w-8';
        const id = esc(entry.id);
        switch (entry.category) {
            case 'avatars': return h.avatar ? h.avatar(entry.id, size) : '';
            case 'accessories': return `<img src="icons/doplnky/${id}-ikona.webp" alt="" class="${size} object-contain drop-shadow-sm">`;
            case 'robes': return `<img src="icons/topics/sova-vitej${entry.id === 'vinova' ? '' : `-${id}`}.webp" alt="" data-keep class="${size} object-contain drop-shadow-sm">`;
            case 'themes': return `<span data-theme="${id}" class="block ${big ? 'h-14 w-14' : 'h-7 w-7'} rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-800 shadow-inner ring-2 ring-white/80 dark:ring-white/30"></span>`;
            case 'colors': return `<span class="block ${big ? 'h-14 w-14' : 'h-7 w-7'} rounded-full ${COLOR_DOT[entry.id] || 'bg-slate-400'} shadow-inner ring-2 ring-white/80 dark:ring-white/30"></span>`;
            case 'frames': return `<span class="relative flex ${big ? 'h-14 w-14 text-[2rem]' : 'h-7 w-7 text-[1.15rem]'} items-center justify-center rounded-full bg-white dark:bg-slate-200${h.frameClass ? h.frameClass(entry.id) : ''}"><img src="icons/logo.webp" alt="" class="h-[80%] w-[80%] object-contain"></span>`;
            case 'badges': return h.medal ? h.medal(entry.top || entry.group.badges[0], entry.owned, big ? 'h-16 w-16' : 'h-9 w-9', big ? 'h-7 w-7' : 'h-4 w-4') : '';
            case 'diplomas': return h.topicIcon ? h.topicIcon(entry.topic, big ? 'h-14 w-14' : 'h-7 w-7', '', big ? 'h-9 w-9' : 'h-5 w-5') : '';
            default: return `<i data-lucide="sparkles" class="${big ? 'h-10 w-10' : 'h-6 w-6'} text-gold-600 dark:text-gold-300"></i>`;
        }
    };
    const CORNER = 'pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-800';
    // Dlaždice věci: v albu barevná, chybějící šedá se zámkem, sezónní po konci s přesýpacími hodinami, nasazená orámovaná s fajfkou
    const tileHtml = (entry, h, worn) => {
        const on = worn && worn.has(entry.key);
        const dim = !entry.owned && entry.state !== 'reward';
        const tone = on ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40'
            : entry.state === 'reward' ? 'bg-gold-50 ring-1 ring-gold-300 dark:bg-gold-900/20 dark:ring-gold-700'
                : entry.owned ? (entry.category === 'diplomas' ? `${h.styleOf ? h.styleOf(entry.topic).soft : 'bg-white'} ring-2 ring-gold-400` : 'bg-white ring-1 ring-slate-200 dark:bg-slate-700/70 dark:ring-slate-600')
                    : entry.state === 'ended' ? 'border border-dashed border-slate-300 bg-slate-100/70 dark:border-slate-600 dark:bg-slate-900/40' : 'bg-slate-100 dark:bg-slate-900/50';
        const corner = on ? `<span class="${CORNER} bg-brand-600 text-white"><i data-lucide="check" class="h-2.5 w-2.5"></i></span>`
            : entry.state === 'ended' ? `<span class="${CORNER} bg-slate-500 text-white dark:bg-slate-400 dark:text-slate-900"><i data-lucide="hourglass" class="h-2.5 w-2.5"></i></span>`
                : entry.state === 'reward' ? `<span class="${CORNER} bg-gold-500 text-brand-950"><i data-lucide="sparkles" class="h-2.5 w-2.5"></i></span>`
                    : entry.limited && !entry.owned ? `<span class="${CORNER} bg-amber-500 text-white"><i data-lucide="hourglass" class="h-2.5 w-2.5"></i></span>`
                        : dim && entry.category !== 'badges' ? `<span class="${CORNER} bg-slate-500 text-white dark:bg-slate-400 dark:text-slate-900"><i data-lucide="lock" class="h-2.5 w-2.5"></i></span>` : '';
        const count = entry.category === 'badges' && entry.size > 1 ? `<span class="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1 text-[9px] font-black leading-[0.8rem] tabular-nums ${entry.complete ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-600'}">${entry.have}/${entry.size}</span>` : '';
        const status = entry.category === 'badges' ? `${entry.have} z ${entry.size}` : STATUS[entry.state].text;
        return `<li class="min-w-0"><button type="button" data-album-item="${esc(entry.key)}" data-state="${entry.state}" aria-label="${esc(`${entry.title}: ${status}`)}" title="${esc(entry.title)}" class="relative flex aspect-square w-full items-center justify-center rounded-xl active:scale-95 ${tone}">
            <span class="flex items-center justify-center ${dim && entry.category !== 'badges' ? 'opacity-40 grayscale' : ''}">${artHtml(entry, h)}</span>${corner}${count}</button></li>`;
    };
    // Hlavička alba: celkem procent se čtyřmi milníky v řadě, ukazatel a další titul (klepnutím odměny alba)
    const headHtml = (album, badges, h) => {
        const next = nextMilestone(album.percent);
        const medals = MILESTONES.map(milestone => {
            const badge = Core && Core.BADGE_BY_ID ? Core.BADGE_BY_ID[milestone.id] : null;
            return badge && h.medal ? `<span title="${esc(`${milestone.title}: ${milestone.goal}${NB}%`)}">${h.medal(badge, Boolean(badges[milestone.id]), 'h-6 w-6', 'h-3 w-3')}</span>` : '';
        }).join('');
        return `<button type="button" data-album-rewards aria-label="${esc(`Album sbírky: ${album.percent}${NB}%. Odměny za sbírku`)}" class="btn-3d flex w-full items-center gap-2.5 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-2.5 text-left text-white short:py-2">
            <img src="icons/topics/${ALBUM_ART}.webp" alt="" class="h-12 w-12 shrink-0 object-contain drop-shadow-md short:h-10 short:w-10">
            <span class="min-w-0 flex-1">
                <span class="flex items-center justify-between gap-2"><span class="flex items-baseline gap-1.5"><span data-album-percent class="text-2xl font-black leading-none tabular-nums">${album.percent}&nbsp;%</span><span class="text-[12px] font-bold text-white/85">sbírky</span></span><span class="flex shrink-0 gap-0.5" aria-hidden="true">${medals}</span></span>
                <span class="mt-1 block">${BAR(album.percent, 'bg-gold-400', 'bg-white/25', 'h-2')}</span>
                <span class="mt-0.5 flex items-center gap-1 text-[11px] font-semibold leading-tight text-gold-300"><span class="min-w-0 truncate">${next ? `Další titul: ${esc(next.title)} (${next.goal}${NB}%)` : 'Celé album! Legenda sbírky'}</span><i data-lucide="chevron-right" class="h-3.5 w-3.5 shrink-0 text-white/60"></i></span>
            </span>
        </button>`;
    };
    // Záložky sekcí (4 × 2): krátký název, kolik mám z kolika a ukazatel
    const tabsHtml = (album, current) => `<div role="tablist" aria-label="Sekce alba" class="grid grid-cols-4 gap-1">${album.sections.map(entry => {
        const on = entry.id === current;
        return `<button type="button" role="tab" data-album-tab="${esc(entry.id)}" aria-selected="${on}" aria-label="${esc(`${entry.title}: ${entry.owned} z ${entry.total}`)}" class="flex min-h-[2.75rem] min-w-0 flex-col justify-center gap-0.5 rounded-xl px-1 py-1 text-left short:min-h-[2.5rem] ${on ? 'btn-3d bg-brand-700 text-white' : 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'}">
            <span class="block truncate text-[11px] font-black leading-tight max-[380px]:text-[10px] max-[380px]:tracking-tight">${esc(entry.short)}</span>
            <span class="flex items-center gap-1"><span class="shrink-0 text-[10px] font-bold leading-none tabular-nums ${on ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}">${entry.owned}/${entry.total}</span><span class="min-w-0 flex-1">${BAR(entry.percent, entry.complete ? 'bg-emerald-500' : on ? 'bg-gold-400' : 'bg-gold-500', on ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700', 'h-1')}</span></span>
        </button>`;
    }).join('')}</div>`;
    // Sekce: název, počet, ukazatel, titul za celou sekci a mřížka věcí
    const sectionHtml = (entry, badges, h, worn) => {
        const reward = entry.reward;
        const earned = reward && badges[reward.id];
        const note = entry.ended ? `<p class="text-[10.5px] font-semibold leading-snug text-slate-500 dark:text-slate-400">Sezónní věci, které už nejde získat, se do procent nepočítají.</p>` : '';
        return `<section data-album-section="${esc(entry.id)}" class="flex flex-col gap-1.5 rounded-2xl bg-white/60 p-2 ring-1 ring-slate-200/70 dark:bg-slate-800/50 dark:ring-slate-700/70" role="tabpanel" aria-label="${esc(entry.title)}">
            <div class="flex items-baseline justify-between gap-2 px-0.5"><h3 class="min-w-0 truncate text-sm font-black text-slate-800 dark:text-slate-100">${esc(entry.title)}</h3><span data-album-count class="shrink-0 text-[12px] font-black tabular-nums ${entry.complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}">${entry.owned} / ${entry.total}</span></div>
            <span class="px-0.5">${BAR(entry.percent, entry.complete ? 'bg-emerald-500' : 'bg-gold-500')}</span>
            ${reward ? `<p data-album-section-title class="flex items-center gap-1 px-0.5 text-[11px] font-bold leading-snug ${earned ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}"><i data-lucide="${earned ? 'circle-check' : 'award'}" class="h-3.5 w-3.5 shrink-0"></i><span class="min-w-0 truncate">${earned ? `Celá sekce: titul „${esc(reward.title)}“ je tvůj` : `Za celou sekci titul „${esc(reward.title)}“`}</span></p>` : ''}
            <ul class="grid grid-cols-6 gap-1 pt-0.5" aria-label="${esc(entry.title)}">${entry.entries.map(item => tileHtml(item, h, worn)).join('')}</ul>
            ${note}
        </section>`;
    };
    // Celé okno alba (bez tlačítka zpět, to přidá app.js)
    const albumHtml = (album, { section: current = 'avatars', badges = {}, worn = new Set() } = {}, h = {}) => {
        const shown = section(album, current);
        return `<div data-album data-album-current="${esc(shown.id)}" class="flex flex-col gap-2">
            ${headHtml(album, badges, h)}
            ${tabsHtml(album, shown.id)}
            ${sectionHtml(shown, badges, h, worn)}
            <p class="text-center text-[10.5px] font-semibold text-slate-500 short:hidden dark:text-slate-400">Klepni na věc a uvidíš, jak ji získat.</p>
        </div>`;
    };
    // Stupně skupiny odznaků v podrobnostech: ve dvou sloupcích medaile a název (získané barevně), i deset stupňů se vejde bez posouvání
    const tiersHtml = (entry, badges, h) => `<ul class="grid grid-cols-2 gap-1" data-album-tiers aria-label="Stupně">${entry.group.badges.map(badge => `
        <li class="flex min-w-0 items-center gap-1.5 rounded-xl bg-white px-1.5 py-1 shadow-sm dark:bg-slate-800" title="${esc(`${badge.title}: ${badge.text}`)}">${h.medal ? h.medal(badge, Boolean(badges[badge.id]), 'h-7 w-7', 'h-3.5 w-3.5') : ''}
            <span class="line-clamp-2 min-w-0 flex-1 text-[11px] font-bold leading-tight ${badges[badge.id] ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}">${esc(badge.title)}</span></li>`).join('')}</ul>`;
    // Podrobnosti věci: obrázek, druh, název, stav, jak ji získat a akce (wear = { label, on } nebo null; note = věta pod akcí)
    const detailHtml = (found, { badges = {}, wear = null, note = '' } = {}, h = {}) => {
        const { section: owner, entry } = found;
        const status = entry.category === 'badges' ? { text: `${entry.have} z ${entry.size} ve sbírce`, icon: entry.complete ? 'check' : entry.owned ? 'medal' : 'lock', tone: entry.complete ? STATUS.owned.tone : entry.owned ? STATUS.reward.tone : STATUS.missing.tone } : STATUS[entry.state];
        const action = wear ? (wear.on
            ? `<p data-album-worn class="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2.5 text-[14px] font-black text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"><i data-lucide="check" class="h-4 w-4"></i>${esc(wear.onLabel || 'Nasazeno')}</p>`
            : `<button type="button" data-album-wear class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white"><i data-lucide="sparkles" class="h-5 w-5"></i>${esc(wear.label)}</button>`) : '';
        return `<div data-album-detail="${esc(entry.key)}" class="flex flex-col gap-2.5">
            <div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
                <span class="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ${entry.owned ? 'bg-slate-50 dark:bg-slate-700/60' : entry.state === 'reward' ? 'bg-gold-50 ring-1 ring-gold-300 dark:bg-gold-900/20 dark:ring-gold-700' : 'bg-slate-100 dark:bg-slate-900/50'}"><span class="flex items-center justify-center ${entry.owned || entry.state === 'reward' || entry.category === 'badges' ? '' : 'opacity-40 grayscale'}">${artHtml(entry, h, true)}</span></span>
                <div class="min-w-0 flex-1">
                    <p class="text-[10.5px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${esc(owner.kind)}</p>
                    <p data-album-detail-title class="text-lg font-black leading-tight text-slate-800 dark:text-slate-100">${esc(entry.title)}</p>
                    <p data-album-status="${entry.state}" class="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${status.tone}"><i data-lucide="${status.icon}" class="h-3 w-3"></i>${esc(status.text)}</p>
                </div>
            </div>
            <p data-album-how class="rounded-2xl bg-white px-3 py-2 text-[13px] leading-snug text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"><b>Jak získat:</b> ${esc(howText(entry))}</p>
            ${entry.category === 'badges' ? tiersHtml(entry, badges, h) : ''}
            ${action}
            ${note ? `<p data-album-note class="text-center text-[12px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${esc(note)}</p>` : ''}
        </div>`;
    };
    // Odměny za sbírku (klepnutí na hlavičku): čtyři milníky celého alba v řadě, rámeček za 100 % a tituly za celé sekce
    const rewardsHtml = (album, badges = {}, h = {}) => {
        const byId = (id) => (Core && Core.BADGE_BY_ID ? Core.BADGE_BY_ID[id] : null);
        const frame = Look ? Look.FRAMES.find(item => item.album) : null;
        const milestones = MILESTONES.map(milestone => {
            const badge = byId(milestone.id);
            if (!badge) return '';
            const have = Boolean(badges[badge.id]);
            return `<li data-album-milestone="${milestone.goal}" class="flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-white px-0.5 py-1.5 text-center shadow-sm dark:bg-slate-800 ${have ? 'ring-2 ring-gold-400' : ''}">
                ${h.medal ? h.medal(badge, have, 'h-9 w-9', 'h-4 w-4') : ''}
                <span class="text-[13px] font-black leading-none tabular-nums text-slate-800 dark:text-slate-100">${milestone.goal}${NB}%</span>
                <span class="line-clamp-2 w-full text-[10px] font-bold leading-tight text-slate-600 dark:text-slate-300">${esc(badge.title)}</span>
            </li>`;
        }).join('');
        const titles = album.sections.filter(entry => entry.reward).map(entry => {
            const badge = byId(entry.reward.id);
            if (!badge) return '';
            const have = Boolean(badges[badge.id]);
            return `<li class="flex items-center gap-2 rounded-xl bg-white px-2 py-1 shadow-sm dark:bg-slate-800">${h.medal ? h.medal(badge, have, 'h-7 w-7', 'h-3.5 w-3.5') : ''}
                <span class="min-w-0 flex-1"><span class="block truncate text-[12.5px] font-black leading-tight text-slate-800 dark:text-slate-100">${esc(badge.title)}</span><span class="block truncate text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">Celá sekce ${esc(entry.title)}</span></span>
                <span class="shrink-0 text-[11px] font-black tabular-nums ${have ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}">${have ? '<i data-lucide="circle-check" class="h-4 w-4"></i>' : `${entry.owned}/${entry.total}`}</span></li>`;
        }).join('');
        return `<div data-album-rewards-list class="flex flex-col gap-2">
            <p class="text-[12px] leading-snug text-slate-600 dark:text-slate-300">Sbírka je na <b>${album.percent}${NB}%</b>, každá sekce alba má stejnou váhu. Za milníky a celé sekce dostaneš tituly, které můžeš mít u jména.</p>
            <ul class="grid grid-cols-4 gap-1" aria-label="Milníky sbírky">${milestones}</ul>
            ${frame ? `<p class="flex items-center gap-2 rounded-xl bg-gold-50 px-2 py-1.5 text-[11.5px] font-bold leading-snug text-gold-900 ring-1 ring-gold-200 dark:bg-gold-900/20 dark:text-gold-100 dark:ring-gold-800"><span class="flex h-8 w-8 shrink-0 items-center justify-center">${artHtml({ category: 'frames', id: frame.id }, h)}</span><span class="min-w-0">Za 100${NB}% navíc rámeček ${esc(frame.title)}: animovaný, jen pro celé album.</span></p>` : ''}
            <h3 class="mt-0.5 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Tituly za celou sekci</h3>
            <ul class="flex flex-col gap-1">${titles}</ul>
        </div>`;
    };
    // Dlaždice v Mém postupu (řádek Odměny): procenta alba
    const tileValue = (album) => `${album.percent} %`;

    return {
        ALBUM_ART, SECTIONS, MILESTONES, sections, sectionTitle, nextMilestone, isAlbumBadge, isAlbumGroup, isLimited, availability, setAvailability, isStarter,
        build, badgeContext, dueBadges, section, findEntry, howText, artHtml, tileHtml, albumHtml, detailHtml, rewardsHtml, tileValue
    };
});
