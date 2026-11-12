// Zlatá otázka (docs/NOVE-MODY.md, část 12): zhruba jednou za 50 otázek běžné hry padne zlatá otázka. Karta otázky má zlatý rámeček
// s jemnou texturou zlaté fólie a třpytem, nad ní štítek „Zlatá otázka · 3× XP“. Zlatá otázka dává trojnásobek XP za odpověď
// a za správnou odpověď bez nápovědy zlatý střípek; pět střípků otevře Zlatou truhlu se vzácnou věcí, kterou hráč ještě nemá
// (doplněk jen z truhly, look.js chest, nebo vzácný obrázkový rámeček, rare), a když už má všechno, dá XP navíc.
// - Kde padá: dnešní otázky, trénink (témata, Mix, okruhy, chyby, procvičování, mapa), Bleskovka a Přežití. Rozhoduje místní počítadlo
//   (mudrlant.gold): 1/50 na otázku, prvních GRACE otázek po zlaté (i úplně na začátku hraní) zlatá není a nejpozději PITY. otázka
//   od poslední zlaté je zlatá. Kvíz dne, Tajemná otázka a další módy s pevnými otázkami zlatou nemají (ne v seznamu LOCAL_MODES).
// - Výzvy a zápasy turnaje: zlatou otázku určí semínko výzvy, takže ji oba hráči mají na stejném místě (asi každá 5. výzva má jednu).
//   Body výzvy se nemění (férovost), zlatá dává jen XP a střípek.
// - Odznaky Zlatokop I–III (quiz-core.js, počítadlo goldCorrect) za 10, 50 a 100 správně zodpovězených zlatých otázek.
// Čistá logika a HTML bez DOMu (testy: tests/gold.test.js); vykreslení, animace a napojení na hru dělá app.js (oddíl „Zlatá otázka“).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantRewards || (isNode ? require('./rewards.js') : null), root.MudrlantLook || (isNode ? require('./look.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantGold = api;
})(typeof self !== 'undefined' ? self : this, (Rewards, Look) => {
    'use strict';
    // Obrázky (icons/topics/<název>.webp). Nové obrázky č. 206–211 (docs/NOVE-MODY.md) se po dodání vymění tady, každý jedním řádkem.
    const ART = {
        owl: 'sova-dalekohled', // č. 206 zlata-otazka (sova s lupou nad zlatým otazníkem): vysvětlení první zlaté otázky, okno Zlatá otázka, tip
        shard: null, // č. 207 zlaty-stripek; do dodání se střípek kreslí z CSS (.gold-shard v src/input.css)
        chest: 'truhla', // č. 208 zlata-truhla; do dodání Truhla Mudrlanta pozlacená filtrem (.gold-tint, viz chestLook)
        chestOpen: 'truhla-otevrena', // č. 209 zlata-truhla-otevrena
        texture: null, // č. 210 textura-zlato; do dodání zlatá fólie z CSS přechodů (.gold-card)
        badge: 'liga-zlato' // č. 211 zlatokop (symbol odznaků Zlatokop)
    };
    const KEY = 'mudrlant.gold';
    const CHANCE = 1 / 50;
    const GRACE = 10;
    const PITY = 80;
    const SHARDS = 5;
    const MULTIPLIER = 3;
    const CHEST_XP = 300;
    // Podíl výzev (a zápasů turnaje) se zlatou otázkou
    const CHALLENGE_SHARE = 0.2;
    // Kde padá zlatá otázka z místního počítadla (app.js mode); výzva ('challenge') má zlatou ze semínka
    const LOCAL_MODES = ['daily', 'practice', 'blitz', 'survival'];
    const BADGE_GROUP = 'zlatokop';
    const BADGE_GOALS = [10, 50, 100];
    const LABEL = 'Zlatá otázka · 3× XP';

    // --- Stav v zařízení: since = otázky od poslední zlaté, total = zodpovězené zlaté, correct = z nich správně, found = získané střípky
    // celkem, shards = střípky do další truhly (0–4), ready = Zlaté truhly, které čekají, chests = otevřené, intro = vysvětlení už bylo,
    // last = co dala poslední Zlatá truhla ('kategorie:id' nebo 'xp') ---
    const whole = (value, max = 1e7) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const LAST = /^(?:xp|(?:accessories|frames):[a-z0-9-]{1,30})$/;
    const empty = () => ({ v: 1, since: 0, total: 0, correct: 0, found: 0, shards: 0, ready: 0, chests: 0, intro: false, last: '' });
    const parse = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const state = empty();
        state.since = whole(data.since, PITY);
        state.total = whole(data.total);
        state.correct = Math.min(state.total, whole(data.correct));
        state.found = Math.min(state.correct, whole(data.found));
        state.shards = whole(data.shards, SHARDS - 1);
        state.ready = whole(data.ready, 100);
        state.chests = whole(data.chests, 100000);
        state.intro = data.intro === true;
        state.last = typeof data.last === 'string' && LAST.test(data.last) ? data.last : '';
        return state;
    };

    // --- Kdy je otázka zlatá ---
    // Běžná hra: další otázka (n. od poslední zlaté) je zlatá s pravděpodobností CHANCE, prvních GRACE ne, PITY. vždy. Vrátí { state, gold }
    const roll = (input, rng = Math.random) => {
        const state = parse(input);
        const n = state.since + 1;
        const gold = n >= PITY || (n > GRACE && rng() < CHANCE);
        return { state: { ...state, since: gold ? 0 : n }, gold };
    };
    // Náhoda ze semínka (stejná pro všechny hráče, jako v daily-quiz.js a mystery.js)
    const hash32 = (text) => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
        return hash >>> 0;
    };
    const seededRandom = (seedText) => {
        let state = hash32(seedText);
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    // Výzva a zápas turnaje: pořadí zlaté otázky (0 … count − 1) ze semínka výzvy, nebo −1 (výzva bez zlaté)
    const challengeIndex = (seed, count) => {
        const n = Math.floor(Number(count));
        if (!seed || !(n > 0)) return -1;
        const rng = seededRandom(`mudrlant-zlata:${seed}`);
        return rng() < CHALLENGE_SHARE ? Math.min(n - 1, Math.floor(rng() * n)) : -1;
    };
    const isChallengeGold = (seed, count, index) => Number.isInteger(index) && index >= 0 && challengeIndex(seed, count) === index;

    // --- Odpověď na zlatou otázku: { state, shard: dostal střípek, chest: právě se naplnila Zlatá truhla, filled: plné sloty (0–5) } ---
    const answer = (input, { correct = false, hints = 0 } = {}) => {
        const state = parse(input);
        const shard = Boolean(correct) && !(hints > 0);
        let shards = state.shards + (shard ? 1 : 0);
        let ready = state.ready;
        const chest = shards >= SHARDS;
        if (chest) { shards -= SHARDS; ready += 1; }
        return {
            state: { ...state, total: state.total + 1, correct: state.correct + (correct ? 1 : 0), found: state.found + (shard ? 1 : 0), shards, ready },
            shard, chest, filled: chest ? SHARDS : shards
        };
    };
    // XP navíc za zlatou otázku: dvojnásobek základu, s ním dohromady trojnásobek
    const xpBonus = (base) => Math.max(0, Math.round(Number(base) || 0)) * (MULTIPLIER - 1);
    const markIntro = (input) => ({ ...parse(input), intro: true });

    // --- Zlatá truhla: vzácné věci, které hráč ještě nemá (doplňky jen z truhly a vzácné obrázkové rámečky) ---
    const giftsOf = (rewards) => (Rewards ? Rewards.parse(rewards).gifts : {});
    const chestCandidates = (rewards) => {
        if (!Look) return [];
        const owned = giftsOf(rewards);
        const has = (category, id) => Array.isArray(owned[category]) && owned[category].includes(id);
        return [['accessories', (item) => Boolean(item.chest)], ['frames', (item) => Boolean(item.rare)]]
            .flatMap(([category, test]) => (Look.CATALOG[category] || []).filter(item => test(item) && !has(category, item.id)).map(item => ({ category, item })));
    };
    // Otevření jedné čekající Zlaté truhly: { opened, gold, rewards, gift: { category, item } | null, xp }. Věc se připíše k věcem z truhel
    // (rewards.js gifts), takže ji look.js odemkne a po přihlášení se uloží do účtu jako ostatní dárky.
    const openChest = (goldInput, rewardsInput, rng = Math.random) => {
        const gold = parse(goldInput);
        const rewards = Rewards ? Rewards.parse(rewardsInput) : rewardsInput;
        if (gold.ready < 1) return { opened: false, gold, rewards, gift: null, xp: 0 };
        const list = chestCandidates(rewards);
        const gift = list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : null;
        const nextRewards = gift ? { ...rewards, gifts: { ...rewards.gifts, [gift.category]: [...(rewards.gifts[gift.category] || []), gift.item.id] } } : rewards;
        return {
            opened: true, gift, xp: gift ? 0 : CHEST_XP, rewards: nextRewards,
            gold: { ...gold, ready: gold.ready - 1, chests: gold.chests + 1, last: gift ? `${gift.category}:${gift.item.id}` : 'xp' }
        };
    };
    // Co dala poslední Zlatá truhla (text do okna): název věci, „+300 XP“, nebo ''
    const lastReward = (input) => {
        const { last } = parse(input);
        if (!last) return '';
        if (last === 'xp') return `+${CHEST_XP} XP`;
        const [category, id] = last.split(':');
        const item = Look ? Look.find(category, id) : null;
        return item ? item.title : '';
    };

    // --- Třpyt po správné odpovědi: jiskřičky z místa odpovědi (posun x, y v px, velikost, otočení, zpoždění a délka v ms) ---
    const burst = (count = 18, rng = Math.random) => Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => {
        const angle = (index / Math.max(1, count)) * Math.PI * 2 + (rng() - 0.5) * 0.6;
        const distance = 46 + rng() * 74;
        return {
            x: Math.round(Math.cos(angle) * distance), y: Math.round(Math.sin(angle) * distance * 0.8 - 18),
            fall: Math.round(26 + rng() * 40), size: Math.round(7 + rng() * 9), rotate: Math.round((rng() - 0.5) * 360),
            delay: Math.round(rng() * 120), duration: Math.round(780 + rng() * 420), kind: index % 3 === 0 ? 'dot' : 'star'
        };
    });

    // Let střípku do počítadla: snímky pro element.animate (posun levého horního rohu, měřítko, otočení). Střípek vyskočí z místa odpovědi,
    // pak letí po oblouku (kvadratická Bézierova křivka s vrcholem nad oběma body) a dosedne zmenšený na velikost okénka.
    // from, to = středy v px; size = velikost letícího střípku, endSize = velikost okénka
    const flightPath = (from, to, { size = 30, endSize = 20, steps = 12, lift = 80, hop = 22 } = {}) => {
        const round1 = (value) => Math.round(value * 10) / 10;
        const frame = (offset, x, y, scale, rotate, opacity = 1) => ({ offset: round1(offset * 1000) / 1000, opacity,
            transform: `translate(${round1(x - size / 2)}px, ${round1(y - size / 2)}px) scale(${round1(scale * 100) / 100}) rotate(${Math.round(rotate)}deg)` });
        const start = { x: from.x, y: from.y - hop };
        const control = { x: (start.x + to.x) / 2, y: Math.min(start.y, to.y) - lift };
        const end = Math.max(0.2, endSize / size);
        const frames = [frame(0, from.x, from.y, 0.2, -40, 0), frame(0.18, start.x, start.y, 1.45, 0)];
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * to.x;
            const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * to.y;
            frames.push(frame(0.18 + 0.82 * t, x, y, 1.45 + (end - 1.45) * t, 360 * t));
        }
        return frames;
    };

    // --- Texty ---
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const shardsWord = (count) => plural(count, 'střípek', 'střípky', 'střípků');
    // „Ještě 2 střípky a otevřeš Zlatou truhlu.“; plných pět = truhla
    const leftText = (filled) => {
        const left = Math.max(0, SHARDS - filled);
        return left === 0 ? 'Máš všech pět. Zlatá truhla je tvoje!' : `Ještě ${shardsWord(left)} a otevřeš Zlatou truhlu.`;
    };
    // „Truhla čeká na otevření“, „Čekají 2 truhly“, „Čeká 5 truhel“
    const readyText = (ready) => (ready === 1 ? 'Truhla čeká na otevření' : ready <= 4 ? `Čekají ${ready} truhly` : `Čeká ${ready} truhel`);
    // Okno, tip a vysvětlení: kratší a delší věta o pravidlech
    const RULES = [
        { icon: 'sparkles', text: 'Za odpověď dostaneš trojnásobek XP.' },
        { icon: 'shard', text: 'Za správnou odpověď bez nápovědy získáš zlatý střípek.' },
        { icon: 'chest', text: `${SHARDS} střípků otevře Zlatou truhlu se vzácnou věcí, kterou ještě nemáš.` }
    ];
    const INTRO_TEXT = 'Za odpověď dostaneš trojnásobek XP, a když nepoužiješ nápovědu, i zlatý střípek. Pět střípků otevře Zlatou truhlu.';

    // --- HTML (bez inline stylů; animace jsou třídy v src/input.css) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    // Střípek: obrázek č. 207, do jeho dodání broušený zlatý střípek z CSS
    const shardHtml = (cls = 'h-6 w-6', attrs = '') => (ART.shard
        ? `<img src="icons/topics/${ART.shard}.webp" alt="" ${attrs} class="${cls} shrink-0 object-contain drop-shadow-sm">`
        : `<span ${attrs} class="gold-shard ${cls} shrink-0" aria-hidden="true"></span>`);
    const owlHtml = (cls) => `<img src="icons/topics/${ART.owl}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    const chestLook = () => ({ closed: ART.chest, open: ART.chestOpen, tint: ART.chest === 'truhla' });
    const chestArt = (cls = 'h-7 w-7', open = false) => `<img src="icons/topics/${open ? ART.chestOpen : ART.chest}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm${chestLook().tint ? ' gold-tint' : ''}">`;
    const textureUrl = () => (ART.texture ? `icons/topics/${ART.texture}.webp` : null);
    // Pět okének na střípky: plná zlatá, prázdná s obrysem; fresh = index střípku, který právě přiletí (zatím prázdný, app.js ho naplní)
    const slotsHtml = (filled, { fresh = -1, size = 'h-5 w-5', cls = '' } = {}) => `
        <span data-gold-slots="${filled}" class="flex shrink-0 items-center gap-1 ${cls}" role="img" aria-label="Zlaté střípky: ${Math.min(SHARDS, filled)} z ${SHARDS}">${Array.from({ length: SHARDS }, (_, index) => {
            const full = index < filled && index !== fresh;
            return `<span data-gold-slot="${index}"${index === fresh ? ' data-gold-fresh' : ''} class="gold-slot ${size}${full ? ' gold-slot-full' : ''}" aria-hidden="true">${shardHtml('gold-slot-shard h-full w-full')}</span>`;
        }).join('')}</span>`;
    // Štítek na horním okraji zlaté karty (řádek s nulovou výškou, app.js ho vloží před kartu a vyrovná mezeru sloupce)
    const ribbonHtml = () => `
        <div data-gold-ribbon class="gold-ribbon-row relative z-20 h-0 w-full">
            <span class="gold-ribbon absolute left-1/2 top-0 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-[10.5px] font-black uppercase leading-4 tracking-widest">
                ${shardHtml('h-3.5 w-3.5')}<span>${esc(LABEL)}</span>
            </span>
        </div>`;
    // Vysvětlení první zlaté otázky v životě: bublina pod štítkem (přes horní část karty, možnosti odpovědí nezakryje)
    const bubbleHtml = () => `
        <div id="gold-bubble" role="note" aria-labelledby="gold-bubble-title" class="gold-bubble absolute inset-x-0 top-4 z-30 mx-auto flex max-w-sm flex-col gap-1.5 rounded-2xl bg-white p-2.5 shadow-xl ring-2 ring-gold-400 dark:bg-slate-800 dark:ring-gold-500">
            <span class="gold-bubble-tip" aria-hidden="true"></span>
            <div class="flex items-start gap-2.5 text-left">
                ${owlHtml('-my-1 h-14 w-14')}
                <div class="min-w-0 flex-1">
                    <p id="gold-bubble-title" class="text-sm font-black leading-tight text-gold-800 dark:text-gold-300">Tohle je Zlatá otázka!</p>
                    <p class="mt-0.5 text-[12.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200">${esc(INTRO_TEXT)}</p>
                </div>
            </div>
            <button type="button" data-gold-bubble-close class="ml-auto inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl bg-gold-100 px-3.5 text-[13px] font-black text-gold-900 ring-1 ring-gold-300 active:scale-95 dark:bg-gold-900/50 dark:text-gold-100 dark:ring-gold-700"><i data-lucide="check" class="h-4 w-4"></i> Rozumím</button>
        </div>`;
    // Řádek pod verdiktem výsledku zlaté otázky: co hráč dostal a střípky do truhly; fresh = střípek, který právě přiletí; ready = čekající truhly
    // (title a text jdou přepsat: výsledek Bleskovky a Přežití shrne střípky celé hry)
    const resultHtml = ({ correct = false, shard = false, filled = 0, ready = 0, fresh = -1, xp = 0, title: titleIn = '', text: textIn = '' } = {}) => {
        const title = titleIn || (shard ? 'Zlatý střípek je tvůj!' : correct ? 'Trojnásobek XP je tvůj' : 'Tentokrát bez střípku');
        const text = textIn || (shard ? leftText(filled) : correct ? 'Střípek je jen za správnou odpověď bez nápovědy.' : 'Zlatá otázka zase přijde, jen nikdo neví kdy.');
        return `
        <div data-gold-result="${shard ? 'shard' : correct ? 'xp' : 'miss'}" class="gold-foil relative flex flex-col gap-2 overflow-hidden rounded-2xl px-3 py-2.5 ring-2 ring-gold-400 dark:ring-gold-600">
            <div class="flex items-center gap-2.5">
                ${shard ? shardHtml('h-9 w-9', 'data-gold-shard-icon') : correct ? '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500 text-brand-950 shadow-sm"><i data-lucide="sparkles" class="h-5 w-5"></i></span>' : shardHtml('h-9 w-9 opacity-40 grayscale')}
                <div class="min-w-0 flex-1">
                    <p class="text-[10.5px] font-black uppercase leading-tight tracking-widest text-gold-800 dark:text-gold-300">${esc(LABEL)}${xp ? ` · +${xp} XP` : ''}</p>
                    <p data-gold-title class="text-[15px] font-black leading-tight text-gold-950 dark:text-gold-50">${esc(title)}</p>
                    <p data-gold-text class="text-xs font-semibold leading-snug text-gold-900 dark:text-gold-100">${esc(text)}</p>
                </div>
            </div>
            <div class="flex items-center justify-between gap-2">
                ${slotsHtml(filled, { fresh, size: 'h-6 w-6' })}
                ${ready > 0 ? `<button type="button" data-action="gold-chest" class="btn-3d gold-cta inline-flex min-h-[2.5rem] min-w-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-black">${chestArt('h-6 w-6 -my-1')}<span class="truncate">Otevřít truhlu</span></button>`
                    : `<span class="text-[11px] font-bold tabular-nums text-gold-900 dark:text-gold-100">${Math.min(filled, SHARDS)} z ${SHARDS}</span>`}
            </div>
        </div>`;
    };
    // Malé okénko se střípky nad hrou (Bleskovka a Přežití nemají výsledek otázky): do něj přiletí střípek
    // (svisle ho app.js posadí na řádek s časem či životy, mezi ně a počet správných)
    const hudHtml = (filled, fresh = -1) => `
        <div id="gold-hud" role="status" aria-label="Zlatý střípek: ${Math.min(SHARDS, filled)} z ${SHARDS}" class="gold-hud gold-foil pointer-events-none fixed left-1/2 top-[5.5rem] z-[65] flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 shadow-lg ring-2 ring-gold-400 dark:ring-gold-600">
            ${slotsHtml(filled, { fresh, size: 'h-5 w-5' })}<span class="text-xs font-black tabular-nums text-gold-950 dark:text-gold-50">${Math.min(SHARDS, filled)}/${SHARDS}</span>
        </div>`;
    // Dlaždice do řádku Odměny v Mém postupu (rewards.js progressHtml, extra)
    const progressTile = (input) => {
        const state = parse(input);
        return {
            kind: 'gold', icon: state.ready ? chestArt('h-7 w-7', false) : shardHtml('h-7 w-7'),
            title: state.ready ? 'Zlatá truhla' : 'Zlaté střípky', short: state.ready ? 'Zlatá' : 'Střípky',
            value: state.ready ? 'Čeká!' : `${state.shards} z ${SHARDS}`, ready: state.ready > 0
        };
    };
    // Okno Zlatá otázka (z Mého postupu, z tipu a z výsledku): pravidla, střípky do truhly, statistiky a čekající truhla
    const infoHtml = (input) => {
        const state = parse(input);
        const last = lastReward(state);
        const icon = (rule) => rule.icon === 'shard' ? shardHtml('h-5 w-5') : rule.icon === 'chest' ? chestArt('h-6 w-6 -mx-0.5') : '<i data-lucide="sparkles" class="h-5 w-5 shrink-0 text-gold-600 dark:text-gold-400"></i>';
        const stat = (label, value, attrs = '') => `<div ${attrs} class="flex flex-col items-center justify-center rounded-xl bg-white px-1 py-1.5 text-center shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70"><span class="text-xl font-black tabular-nums leading-none text-slate-800 dark:text-slate-100">${value}</span><span class="mt-0.5 text-[10px] font-black uppercase leading-tight tracking-wider text-slate-500 dark:text-slate-400">${esc(label)}</span></div>`;
        return `
        <div data-gold-info class="flex flex-col gap-2.5 short:gap-2">
            <div class="flex items-center gap-3">
                ${owlHtml('-my-1 h-16 w-16 short:h-14 short:w-14')}
                <p class="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200">Zhruba jednou za 50 otázek přijde <b class="text-gold-800 dark:text-gold-300">Zlatá otázka</b>. Poznáš ji podle zlatého rámečku. Může přijít v běžné hře, v Bleskovce, v Přežití i ve výzvách.</p>
            </div>
            <ul class="flex flex-col gap-1.5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
                ${RULES.map(rule => `<li class="flex items-center gap-2.5 text-[12.5px] font-semibold leading-snug text-slate-700 dark:text-slate-200"><span class="flex w-6 shrink-0 justify-center">${icon(rule)}</span><span>${esc(rule.text)}</span></li>`).join('')}
            </ul>
            <div data-gold-progress class="gold-foil flex items-center justify-between gap-2 rounded-2xl px-3 py-2 ring-2 ring-gold-400 dark:ring-gold-600">
                <div class="min-w-0">
                    <p class="text-[10.5px] font-black uppercase leading-tight tracking-widest text-gold-800 dark:text-gold-300">Do Zlaté truhly</p>
                    <p class="text-sm font-black leading-tight text-gold-950 dark:text-gold-50">${state.ready ? readyText(state.ready) : `${state.shards} z ${SHARDS} střípků`}</p>
                </div>
                ${slotsHtml(state.ready ? SHARDS : state.shards, { size: 'h-6 w-6' })}
            </div>
            ${state.ready ? `<button type="button" data-gold-open class="btn-3d gold-cta flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-black">${chestArt('h-8 w-8 -my-2')} Otevřít Zlatou truhlu</button>` : ''}
            <div class="grid grid-cols-3 gap-1.5" data-gold-stats>
                ${stat('Zlaté otázky', state.total, 'data-gold-total')}
                ${stat('Správné odpovědi', state.correct, 'data-gold-correct')}
                ${stat('Otevřené truhly', state.chests, 'data-gold-chests')}
            </div>
            ${last ? `<p class="text-center text-xs font-bold text-slate-500 dark:text-slate-400">Minule ve Zlaté truhle: ${esc(last)}</p>` : ''}
        </div>`;
    };
    // Vzhled Zlaté truhly v okně truhly (rewards.js chestHtml, look)
    const chestOptions = () => {
        const art = chestLook();
        return {
            kicker: `${SHARDS} zlatých střípků`, title: 'Zlatá truhla', closed: art.closed, open: art.open, tint: art.tint, card: 'gold-chest',
            note: (opened) => (!opened.gift ? 'Všechny vzácné věci už máš, tak aspoň body zkušeností navíc.'
                : opened.gift.category === 'frames' ? 'Vzácný rámeček, který jinak najdeš jen v truhlách. Teď je tvůj.' : 'Vzácná věc, která je jinak jen v truhlách. Teď je tvoje.')
        };
    };

    return {
        ART, KEY, CHANCE, GRACE, PITY, SHARDS, MULTIPLIER, CHEST_XP, CHALLENGE_SHARE, LOCAL_MODES, BADGE_GROUP, BADGE_GOALS, LABEL, RULES, INTRO_TEXT,
        empty, parse, roll, seededRandom, challengeIndex, isChallengeGold, answer, xpBonus, markIntro, chestCandidates, openChest, lastReward, burst, flightPath,
        shardsWord, leftText, readyText, shardHtml, owlHtml, chestArt, chestLook, textureUrl, slotsHtml, ribbonHtml, bubbleHtml, resultHtml, hudHtml, progressTile, infoHtml, chestOptions
    };
});
