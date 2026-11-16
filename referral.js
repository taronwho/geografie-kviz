// Pozvi kamarády: každý přihlášený hráč má kód přítele (8 znaků) a odkaz …?pritel=KÓD. Kdo se přes něj přihlásí jako nový hráč
// (účet nejvýš JOIN_DAYS dní starý), stane se jeho přítelem a po první hře oba dostanou odměnu: nový hráč rámeček Přátelský a XP,
// zvoucí hráč odměny za 1, 3 a 10 pozvaných kamarádů (TIERS). Kamarád se počítá, až odehraje aspoň QUALIFY_GAMES her, které zná server
// (Kvíz dne, výzva, Řetězovka, Tajemná otázka, souboj s bossem), takže falešné účty bez hraní nic nedají. Vše hlídá a jednou vydá server
// (blok 32 ve schema.sql: referral_codes, referrals, referral_rewards; referral_join, referral_status, referral_claim); XP připíše
// aplikace a odměny-věci odemyká Look.setPerks (rámečky Přátelský a Parta, reakce a vítězný efekt v friends.js) podle klíčů odměn ze serveru.
// Čistá logika a HTML bez DOMu; okno, odkaz a vyzvednutí napojuje app.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantReferral = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const KEY = 'mudrlant.referral';
    const LINK_PARAM = 'pritel';
    // Stejná abeceda jako kódy výzev a skupin (bez zaměnitelných 0/O, 1/I/L)
    const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const CODE_LENGTH = 8;
    const QUALIFY_GAMES = 3;
    const JOIN_DAYS = 14;
    const TIERS = [1, 3, 10];
    // Odměny podle klíče (stejné klíče má referral_rewards ve schema.sql): XP a věci; perks = co odemyká v look.js a friends.js
    const REWARDS = {
        novacek: { xp: 200, frame: 'pratelsky', title: 'Odměna za první hru', text: 'rámeček Přátelský a 200 XP' },
        'pritel-1': { xp: 300, frame: 'pratelsky', need: 1, title: 'První pozvaný kamarád', text: 'rámeček Přátelský a 300 XP' },
        // avatar = postavička, kterou odměna odemkne (look.js: položka s referral, tady jen pro text a obrázek)
        'pritel-3': { xp: 500, reaction: '🤗', effect: 'srdicka', avatar: 'kosatk', need: 3, title: 'Tři pozvaní kamarádi', text: 'postavička Kosatka komorník, reakce 🤗 Vítej mezi námi, vítězný efekt Srdíčka přátel a 500 XP' },
        'pritel-10': { xp: 1000, frame: 'parta', need: 10, title: 'Deset pozvaných kamarádů', text: 'rámeček Parta a 1 000 XP' }
    };
    const REWARD_KEYS = Object.keys(REWARDS);
    const tierKey = (need) => `pritel-${need}`;

    // --- Kód a odkaz ---
    const cleanCode = (text) => {
        const code = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return code.length === CODE_LENGTH && [...code].every(char => CODE_ALPHABET.includes(char)) ? code : '';
    };
    // Kód z textu nebo z odkazu (…?pritel=ABCD2345); mezery, pomlčky a malá písmena nevadí
    const parseCode = (text) => {
        const raw = String(text || '');
        const fromLink = raw.match(new RegExp(`[?&#]${LINK_PARAM}=([A-Za-z0-9-]+)`));
        return cleanCode(fromLink ? fromLink[1] : raw);
    };
    // „ABCD-2345“ pro čtení a opisování
    const formatCode = (code) => (cleanCode(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : '');
    const link = (base, code) => `${String(base || '').split(/[?#]/)[0]}?${LINK_PARAM}=${encodeURIComponent(cleanCode(code))}`;
    const shareText = (code, base) => `Pojď se mnou hrát Mudrlanta! Přes můj odkaz oba dostaneme rámeček Přátelský a XP navíc. Kód přítele: ${formatCode(code)} ${link(base, code)}`;

    // --- Stav ze serveru (referral_status) ---
    const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const cleanPlayer = (row) => (row && typeof row === 'object' && isUuid(row.id) ? {
        id: row.id, display_name: String(row.display_name || 'Hráč').slice(0, 24), avatar: typeof row.avatar === 'string' ? row.avatar.slice(0, 8) : '🦊',
        color: typeof row.color === 'string' ? row.color.slice(0, 12) : 'emerald', frame: typeof row.frame === 'string' ? row.frame.slice(0, 24) : null,
        owl: typeof row.owl === 'string' ? row.owl.slice(0, 200) : null, games: whole(row.games, 1e6), qualified: Boolean(row.qualified)
    } : null);
    const keys = (list) => [...new Set((Array.isArray(list) ? list : []).filter(key => REWARD_KEYS.includes(key)))];
    // { code, inviter, games, joinUntil, invited: [hráč s games a qualified], qualified, claimed: [klíče], ready: [klíče] } nebo null
    const parseStatus = (raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const invited = (Array.isArray(raw.invited) ? raw.invited : []).map(cleanPlayer).filter(Boolean).slice(0, 200);
        return {
            code: cleanCode(raw.code), inviter: cleanPlayer(raw.inviter), games: whole(raw.games, 1e6),
            joinUntil: typeof raw.join_until === 'string' && Number.isFinite(Date.parse(raw.join_until)) ? raw.join_until : null,
            invited, qualified: whole(raw.qualified, 1e6), claimed: keys(raw.claimed), ready: keys(raw.ready)
        };
    };
    // Klíče odměn, které hráč má (vyzvednuté), pro Look.setPerks a reakce
    const claimedKeys = (status) => (status ? status.claimed : []);
    // XP a věci z vyzvednutých klíčů: { xp, frames: [], reactions: [], effects: [] }
    const prizeOf = (list) => keys(list).reduce((sum, key) => {
        const reward = REWARDS[key];
        return {
            xp: sum.xp + reward.xp,
            frames: reward.frame && !sum.frames.includes(reward.frame) ? [...sum.frames, reward.frame] : sum.frames,
            reactions: reward.reaction ? [...sum.reactions, reward.reaction] : sum.reactions,
            effects: reward.effect ? [...sum.effects, reward.effect] : sum.effects
        };
    }, { xp: 0, frames: [], reactions: [], effects: [] });
    // Další odměna zvoucího hráče: { need, key, reward, left } nebo null (má všechny)
    const nextTier = (status) => {
        const have = status ? status.qualified : 0;
        const claimed = status ? status.claimed : [];
        const need = TIERS.find(tier => have < tier && !claimed.includes(tierKey(tier)));
        return need ? { need, key: tierKey(need), reward: REWARDS[tierKey(need)], left: need - have } : null;
    };
    const canJoin = (status, now = Date.now()) => Boolean(status && !status.inviter && status.joinUntil && Date.parse(status.joinUntil) > now);
    // Čekající odkaz z adresy (uložený v zařízení, dokud se hráč nepřihlásí): { code, at }
    const cleanPending = (raw) => (raw && typeof raw === 'object' && cleanCode(raw.code) ? { code: cleanCode(raw.code), at: whole(raw.at, 1e13) } : null);

    // --- HTML (h = pomocné funkce z app.js: avatarHtml(player, cls), uiArt(id, cls), frameClass(id)) ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    const friendsWord = (count) => plural(count, 'kamarád', 'kamarádi', 'kamarádů');
    const gamesText = (games) => plural(games, 'hra', 'hry', 'her');
    // Karta dole v okně Přátelé (záložka Soupeři): pozvi kamarády, kolik se jich počítá, odměna, která čeká
    const cardHtml = (status, h = {}) => {
        const ready = status ? status.ready.length : 0;
        const next = nextTier(status);
        const sub = ready ? `Čeká ${plural(ready, 'odměna', 'odměny', 'odměn')} za pozvání` : next ? `Oba dostanete odměnu · ${status ? status.qualified : 0}/${next.need}` : 'Všechny odměny za pozvání máš';
        return `
            <button type="button" id="referral-card" data-action="referral-open" class="flex min-h-[3rem] w-full items-center gap-2.5 rounded-2xl bg-white px-2.5 py-1.5 text-left shadow-sm ring-1 ${ready ? 'ring-2 ring-gold-400' : 'ring-slate-200/70 dark:ring-slate-700/70'} active:scale-[0.98] dark:bg-slate-800/70">
                <span class="referral-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"><i data-lucide="user-plus" class="h-5 w-5"></i></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">Pozvi kamarády</span><span class="block truncate text-[11px] font-semibold leading-tight ${ready ? 'text-gold-800 dark:text-gold-300' : 'text-slate-500 dark:text-slate-400'}">${esc(sub)}</span></span>
                ${ready ? `<span class="shrink-0 rounded-lg bg-gold-500 px-2 py-1 text-[11px] font-black text-brand-950">Vyzvednout</span>` : '<i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-400"></i>'}
            </button>`;
    };
    // Okno Pozvi kamarády: můj kód a odkaz, odměny za 1/3/10 kamarádů, pozvaní s počtem her, pozvánka, přes kterou hraju, a pole na kód
    const dialogHtml = (status, { busy = false, note = '', input = '', h = {}, now = Date.now() } = {}) => {
        if (!status) return '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>';
        const claimed = status.claimed;
        const tierRow = (need) => {
            const key = tierKey(need);
            const reward = REWARDS[key];
            const done = claimed.includes(key);
            const ready = status.ready.includes(key);
            const reached = status.qualified >= need;
            return `<li data-referral-tier="${need}" class="flex items-center gap-2 rounded-xl px-2 py-1.5 ${done ? 'bg-emerald-50 dark:bg-emerald-900/30' : ready ? 'bg-gold-100 ring-2 ring-gold-400 dark:bg-gold-900/40' : 'bg-white shadow-sm dark:bg-slate-800'}">
                <span class="flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-full px-1 text-[13px] font-black ${done ? 'bg-emerald-600 text-white' : reached ? 'bg-gold-500 text-brand-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}">${done ? '<i data-lucide="check" class="h-4 w-4"></i>' : need}</span>
                <span class="min-w-0 flex-1 text-[12px] font-bold leading-snug text-slate-700 dark:text-slate-200"><b class="text-slate-800 dark:text-slate-100">${esc(friendsWord(need))}:</b> ${esc(reward.text)}</span>
                ${h.frameClass && reward.frame ? `<span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[1.1rem]${h.frameClass(reward.frame)}"><img src="icons/logo.webp" alt="" class="h-[78%] w-[78%] object-contain"></span>` : reward.avatar ? `<img src="icons/avatars/${esc(reward.avatar)}.webp" alt="" class="h-8 w-8 shrink-0 object-contain">` : reward.reaction ? `<span class="shrink-0 text-xl leading-none" aria-hidden="true">${reward.reaction}</span>` : ''}
            </li>`;
        };
        const invitedRow = (row) => `<li class="flex items-center gap-2 rounded-xl bg-white px-2 py-1 shadow-sm dark:bg-slate-800">${h.avatarHtml ? h.avatarHtml(row, 'h-7 w-7 text-sm') : ''}<span class="min-w-0 flex-1 truncate text-[12px] font-black text-slate-800 dark:text-slate-100">${esc(row.display_name)}</span><span class="shrink-0 text-[11px] font-bold ${row.qualified ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}">${row.qualified ? 'počítá se' : `${Math.min(row.games, QUALIFY_GAMES)}/${QUALIFY_GAMES} ${QUALIFY_GAMES === 3 ? 'hry' : 'her'}`}</span></li>`;
        const newcomer = status.inviter ? (() => {
            const done = claimed.includes('novacek');
            const ready = status.ready.includes('novacek');
            return `<div data-referral-inviter class="flex items-center gap-2 rounded-2xl bg-sky-50 px-2.5 py-2 dark:bg-sky-900/30">${h.avatarHtml ? h.avatarHtml(status.inviter, 'h-8 w-8 text-base') : ''}<p class="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-sky-900 dark:text-sky-100">Pozvánka od: <b>${esc(status.inviter.display_name)}</b>. ${done ? 'Odměnu za první hru už máš.' : ready ? 'Odměna za první hru čeká!' : 'Zahraj si první hru a oba dostanete odměnu.'}</p></div>`;
        })() : '';
        const join = canJoin(status, now) ? `
            <form data-referral-join class="flex items-center gap-1.5" autocomplete="off">
                <input data-referral-input value="${esc(input)}" maxlength="12" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="Kód od kamaráda" aria-label="Kód přítele od kamaráda" class="min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-[14px] font-bold uppercase tracking-wider text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <button type="submit" ${busy ? 'disabled' : ''} class="shrink-0 rounded-xl bg-brand-700 px-3 py-2.5 text-[13px] font-black text-white disabled:opacity-60">Použít</button>
            </form>` : '';
        const ready = status.ready.length;
        return `
            <div class="flex flex-col gap-2.5" data-referral-dialog>
                <p class="text-[13px] leading-snug text-slate-600 dark:text-slate-300">Pošli kamarádovi odkaz nebo kód přítele. Až se přihlásí a zahraje si, budete přátelé a oba dostanete rámeček Přátelský a XP navíc.</p>
                <div class="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800">
                    <span class="min-w-0 flex-1"><span class="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Tvůj kód přítele</span><span data-referral-code class="block select-all text-xl font-black tracking-wider text-brand-800 dark:text-cream">${esc(formatCode(status.code) || '…')}</span></span>
                    <button type="button" data-referral-share ${status.code ? '' : 'disabled'} class="flex min-h-[2.5rem] shrink-0 items-center gap-1.5 rounded-xl btn-3d bg-brand-700 px-3 text-[13px] font-black text-white disabled:opacity-60"><i data-lucide="share-2" class="h-4 w-4"></i>Sdílet odkaz</button>
                </div>
                ${ready ? `<button type="button" data-referral-claim ${busy ? 'disabled' : ''} class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gold-500 px-4 py-2.5 text-[15px] font-black text-brand-950 disabled:opacity-60"><i data-lucide="sparkles" class="h-5 w-5"></i>${busy ? 'Chvilku…' : `Vyzvednout ${plural(ready, 'odměnu', 'odměny', 'odměn')}`}</button>` : ''}
                ${note ? `<p data-referral-note role="status" class="rounded-xl bg-slate-100 px-2.5 py-1.5 text-[12px] font-bold leading-snug text-slate-700 dark:bg-slate-700 dark:text-slate-200">${esc(note)}</p>` : ''}
                ${newcomer}
                <section>
                    <h3 class="mb-1 px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Odměny za pozvání</h3>
                    <ul class="flex flex-col gap-1">${TIERS.map(tierRow).join('')}</ul>
                    <p class="mt-1 px-1 text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">Kamarád se počítá, až odehraje aspoň ${gamesText(QUALIFY_GAMES)}: Kvíz dne, výzvu, Řetězovku, Tajemnou otázku nebo souboj s bossem.</p>
                </section>
                ${status.invited.length ? `<section><h3 class="mb-1 px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Pozvaní · ${status.qualified} se počítá</h3><ul class="flex flex-col gap-1">${status.invited.slice(0, 12).map(invitedRow).join('')}</ul></section>` : ''}
                ${join}
            </div>`;
    };
    // Okno po otevření odkazu bez přihlášení
    const welcomeHtml = () => `
        <div class="flex flex-col items-center gap-2.5 text-center" data-referral-welcome>
            <span class="referral-orb flex h-16 w-16 items-center justify-center rounded-full text-white"><i data-lucide="user-plus" class="h-8 w-8"></i></span>
            <p class="text-[14px] font-semibold leading-snug text-slate-700 dark:text-slate-200">Kamarád tě zve do Mudrlanta. Přihlas se a po první hře oba dostanete rámeček Přátelský a XP navíc. Budete taky přátelé ve hře.</p>
            <button type="button" data-referral-login class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white"><i data-lucide="log-in" class="h-5 w-5"></i>Přihlásit se</button>
            <button type="button" data-referral-later class="min-h-[2.5rem] px-4 text-[13px] font-bold text-slate-500 underline underline-offset-2 dark:text-slate-400">Později</button>
        </div>`;
    // Text oslavy po vyzvednutí odměn
    const celebrationText = (list) => keys(list).map(key => REWARDS[key].text).join(' · ');

    return { KEY, LINK_PARAM, CODE_ALPHABET, CODE_LENGTH, QUALIFY_GAMES, JOIN_DAYS, TIERS, REWARDS, REWARD_KEYS, tierKey, cleanCode, parseCode, formatCode, link, shareText,
        parseStatus, claimedKeys, prizeOf, nextTier, canJoin, cleanPending, cardHtml, dialogHtml, welcomeHtml, celebrationText };
});
