// Přátelé, reakce po zápase a moderace (nahlášení, blokování): čistá logika a vykreslení částí bez stavu aplikace. Data drží databáze
// (supabase/schema.sql, sekce „Sociální vrstva“) přes social.js; app.js sem jen posílá řádky a pomocné funkce (avatarHtml, escapeHtml) a napojuje klepnutí.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantFriends = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const REACTIONS = ['👍', '🔥', '😅', '🤝'];
    const REACTION_LABELS = { '👍': 'Dobrá hra', '🔥': 'Paráda', '😅': 'Těsně', '🤝': 'Odveta?' };
    const FRIEND_LIMIT = 200;
    const DAY = 86400000;
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const LABEL = 'px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';

    // --- Aktivita ---
    // Podle poslední návštěvy (profiles.last_seen): today (do 24 h), recent (do týdne), away (déle), unknown (nikdy / starší databáze)
    const activity = (lastSeen, now = Date.now()) => {
        const time = lastSeen ? new Date(lastSeen).getTime() : NaN;
        if (!Number.isFinite(time)) return { level: 'unknown', text: '' };
        const days = Math.max(0, Math.floor((now - time) / DAY));
        if (days === 0) return { level: 'today', text: 'aktivní dnes' };
        if (days === 1) return { level: 'recent', text: 'aktivní včera' };
        if (days < 7) return { level: 'recent', text: `před ${days} dny` };
        if (days < 30) return { level: 'away', text: `před ${Math.floor(days / 7)} ${Math.floor(days / 7) === 1 ? 'týdnem' : 'týdny'}` };
        return { level: 'away', text: 'dlouho nehrál' };
    };
    const DOT = { today: 'bg-emerald-500', recent: 'bg-amber-400', away: 'bg-slate-300 dark:bg-slate-600', unknown: '' };
    const activityDot = (level, extra = '') => DOT[level] ? `<span aria-hidden="true" class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${DOT[level]} ${extra}"></span>` : '';

    // --- Jména a bilance ---
    // Dlouhé jméno zkrátit (ať se pás nerozjede): „Lenka Dvořáková“ → „Lenka Dv…“
    const shortName = (name, max = 9) => {
        const text = String(name || 'Hráč').trim();
        return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
    };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    // Vzájemná bilance: „3 : 1“ (výhry : prohry) a pod ní slovy
    const balanceText = (row) => {
        const played = (row.wins || 0) + (row.losses || 0) + (row.draws || 0);
        if (!played) return '';
        return `${row.wins}:${row.losses}${row.draws ? ` (${plural(row.draws, 'remíza', 'remízy', 'remíz')})` : ''}`;
    };

    // --- Rozdělení řádků z friends_list ---
    // friends = přijatá přátelství (nejdřív aktivní), incoming = žádosti pro mě, outgoing = moje odeslané
    const split = (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return {
            friends: list.filter(row => row.status === 'accepted'),
            incoming: list.filter(row => row.status === 'pending' && row.direction === 'in'),
            outgoing: list.filter(row => row.status === 'pending' && row.direction === 'out')
        };
    };
    // Vztah k hráči: none (nic), friend, out (moje žádost čeká), in (jeho žádost čeká na mě); null řádky (starší databáze) = none
    const relation = (rows, otherId) => {
        const row = (Array.isArray(rows) ? rows : []).find(item => item.id === otherId);
        if (!row) return 'none';
        if (row.status === 'accepted') return 'friend';
        return row.direction === 'in' ? 'in' : 'out';
    };
    const atLimit = (rows) => (Array.isArray(rows) ? rows : []).length >= FRIEND_LIMIT;

    // --- Vykreslení ---
    // Tlačítko v profilu hráče: Přidat do přátel / Žádost odeslána / Přijmout žádost / Odebrat z přátel
    const FRIEND_BUTTON = {
        none: { action: 'add', icon: 'user-plus', label: 'Přidat do přátel', tone: 'btn-3d-light bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100' },
        out: { action: 'cancel', icon: 'clock', label: 'Žádost odeslána', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400' },
        in: { action: 'accept', icon: 'user-check', label: 'Přijmout žádost', tone: 'btn-3d bg-emerald-600 text-white' },
        friend: { action: 'remove', icon: 'user-minus', label: 'Odebrat z přátel', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300' }
    };
    const friendButton = (state, { busy = false, blocked = false } = {}) => {
        if (blocked) return '';
        const item = FRIEND_BUTTON[state] || FRIEND_BUTTON.none;
        return `<button type="button" data-friend="${item.action}" ${busy ? 'disabled' : ''} class="flex min-h-[2.5rem] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 text-[13px] font-black disabled:opacity-50 ${item.tone}"><i data-lucide="${item.icon}" class="h-4 w-4 shrink-0"></i><span class="truncate">${busy ? 'Chvilku…' : item.label}</span></button>`;
    };
    // Menu „⋯“ v profilu: Nahlásit, Zablokovat / Odblokovat
    const moreButton = (open) => `<button type="button" data-more aria-label="Další možnosti" aria-expanded="${open}" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm active:scale-95 dark:bg-slate-800 dark:text-slate-300"><i data-lucide="ellipsis" class="h-5 w-5"></i></button>`;
    const moreMenu = (blocked) => `
        <div data-more-menu role="menu" class="grid grid-cols-2 gap-1.5">
            <button type="button" role="menuitem" data-report class="flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl bg-white px-2 text-[12px] font-black text-slate-700 shadow-sm active:scale-[0.98] dark:bg-slate-800 dark:text-slate-200"><i data-lucide="flag" class="h-4 w-4"></i> Nahlásit</button>
            <button type="button" role="menuitem" data-block="${blocked ? 'off' : 'on'}" class="flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-black shadow-sm active:scale-[0.98] ${blocked ? 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'}"><i data-lucide="${blocked ? 'circle-check' : 'ban'}" class="h-4 w-4"></i> ${blocked ? 'Odblokovat' : 'Zablokovat'}</button>
        </div>`;
    // Potvrzení bloku
    const blockConfirm = (name, busy = false) => `
        <div data-block-confirm class="rounded-2xl bg-rose-50 p-3 dark:bg-rose-900/30">
            <p class="text-[13px] font-bold leading-snug text-rose-800 dark:text-rose-100">Zablokovat hráče ${esc(name)}? Nenajde tě v hledání, nevyzve tě a nevybere se ti jako náhodný soupeř. Přátelství skončí.</p>
            <div class="mt-2 grid grid-cols-2 gap-1.5">
                <button type="button" data-block-cancel class="min-h-[2.5rem] rounded-xl bg-white text-[13px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">Zpět</button>
                <button type="button" data-block-go ${busy ? 'disabled' : ''} class="min-h-[2.5rem] rounded-xl bg-rose-600 text-[13px] font-black text-white disabled:opacity-50">${busy ? 'Blokuju…' : 'Zablokovat'}</button>
            </div>
        </div>`;
    const blockedNote = (name) => `<p class="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-100 px-3 py-2 text-[12px] font-bold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"><i data-lucide="ban" class="h-4 w-4"></i> Hráče ${esc(name)} máš zablokovaného.</p>`;
    // Formulář nahlášení: důvody jako čipy, poznámka do 300 znaků
    const reportBody = (reasons, chosen, note = '', { busy = false } = {}) => `
        <form id="report-form" class="flex flex-col gap-3" autocomplete="off">
            <p class="text-xs leading-snug text-slate-500 dark:text-slate-400">Nahlášení vidí jen správce hry. Vyber důvod, případně připiš, co se stalo.</p>
            <div role="radiogroup" aria-label="Důvod" class="flex flex-wrap gap-1.5">${reasons.map(item => `<button type="button" role="radio" aria-checked="${chosen === item.id}" data-reason="${esc(item.id)}" class="min-h-[2.5rem] rounded-xl border-2 px-2.5 text-[13px] font-bold ${chosen === item.id ? 'border-brand-600 bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100' : 'border-transparent bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">${esc(item.label)}</button>`).join('')}</div>
            <textarea id="report-note" maxlength="300" rows="3" placeholder="Poznámka (nepovinná)" class="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">${esc(note)}</textarea>
            <button type="submit" data-report-send ${busy || !chosen ? 'disabled' : ''} class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white disabled:opacity-50"><i data-lucide="flag" class="h-5 w-5"></i> ${busy ? 'Odesílám…' : 'Odeslat nahlášení'}</button>
        </form>`;
    const reasonLabel = (reasons, id) => ((reasons || []).find(item => item.id === id) || {}).label || id;

    // Pás přátel na záložce Více hráčů: avatar s tečkou aktivity a zkrácené jméno; klepnutí otevře profil (h.register uloží hráče pro profil)
    const friendsStrip = (friends, h, now = Date.now()) => {
        if (!friends || !friends.length) return '';
        const items = friends.map(row => {
            if (h.register) h.register(row);
            const act = activity(row.last_seen, now);
            return `<button type="button" data-player-id="${esc(row.id)}" title="${esc(row.display_name)}${act.text ? ` · ${act.text}` : ''}" class="flex w-[3.4rem] shrink-0 flex-col items-center gap-1 rounded-xl py-1 active:scale-95"><span class="relative">${h.avatarHtml(row, 'h-10 w-10 text-xl')}${activityDot(act.level)}</span><span class="max-w-full truncate text-[10.5px] font-bold leading-tight text-slate-700 dark:text-slate-200">${esc(shortName(row.display_name))}</span></button>`;
        }).join('');
        return `
            <div id="friends-section" class="flex flex-col gap-0.5">
                <div class="flex min-h-[2rem] items-center justify-between gap-2"><p class="${LABEL}">Přátelé <span class="font-bold normal-case tracking-normal">· ${friends.length}</span></p><p class="flex items-center gap-1 px-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>aktivní dnes</p></div>
                <div id="friends-strip" class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" aria-label="Přátelé">${items}</div>
            </div>`;
    };
    // Žádosti o přátelství do sekce „Čekají na tebe“: „X tě chce mít v přátelích · Přijmout / Odmítnout“
    const requestRows = (incoming, h) => (incoming || []).slice(0, 5).map(row => {
        if (h.register) h.register(row);
        return `
        <div data-friend-request="${esc(row.id)}" class="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
            ${h.avatarHtml(row, 'h-9 w-9 text-lg', true)}
            <span class="min-w-0 flex-1 text-[12.5px] font-bold leading-tight text-slate-800 dark:text-slate-100"><span class="block truncate">${esc(row.display_name)}</span><span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">tě chce mít v přátelích</span></span>
            <button type="button" data-action="friend-accept" data-id="${esc(row.id)}" aria-label="Přijmout žádost od ${esc(row.display_name)}" class="flex h-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-2.5 text-[12px] font-black text-white active:scale-95">Přijmout</button>
            <button type="button" data-action="friend-decline" data-id="${esc(row.id)}" aria-label="Odmítnout žádost od ${esc(row.display_name)}" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 active:scale-95 dark:bg-slate-700 dark:text-slate-300"><i data-lucide="x" class="h-4 w-4"></i></button>
        </div>`;
    }).join('');
    // Rychlý výběr přátel ve formuláři nové výzvy (nad hledáním): popisek a vedle něj řada čipů s avatarem a jménem, data-pick-opp jako výsledky hledání
    const quickFriends = (friends, h) => {
        if (!friends || !friends.length) return '';
        return `
            <div id="quick-friends" class="mt-2 flex items-center gap-2">
                <p class="shrink-0 pl-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Přátelé</p>
                <div class="-my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-1">${friends.slice(0, 20).map(row => `<button type="button" data-pick-opp="${esc(row.id)}" class="flex max-w-[9rem] shrink-0 items-center gap-1.5 rounded-xl bg-white py-1 pl-1 pr-2.5 text-left shadow-sm active:scale-[0.98] dark:bg-slate-800">${h.avatarHtml(row, 'h-7 w-7 text-sm')}<span class="truncate text-[12px] font-bold text-slate-800 dark:text-slate-100">${esc(shortName(row.display_name, 12))}</span></button>`).join('')}</div>
            </div>`;
    };
    // Řada reakcí po zápase; chosen = moje už poslaná reakce
    const reactionBar = (toId, chosen = null, { busy = false, name = '' } = {}) => `
        <div data-reactions class="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800">
            <p class="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${chosen ? `Poslal jsi ${REACTION_LABELS[chosen] ? REACTION_LABELS[chosen].toLowerCase() : chosen}` : `Pošli reakci${name ? ` hráči ${esc(shortName(name, 14))}` : ''}`}</p>
            <div class="flex gap-2">${REACTIONS.map(emoji => `<button type="button" data-action="react" data-emoji="${emoji}" data-to="${esc(toId)}" aria-label="${esc(REACTION_LABELS[emoji])}" aria-pressed="${chosen === emoji}" title="${esc(REACTION_LABELS[emoji])}" ${busy ? 'disabled' : ''} class="flex h-11 w-11 items-center justify-center rounded-full text-2xl active:scale-90 disabled:opacity-50 ${chosen === emoji ? 'bg-brand-100 ring-2 ring-brand-600 dark:bg-brand-900/50' : chosen ? 'bg-slate-50 opacity-50 dark:bg-slate-700/60' : 'bg-slate-100 dark:bg-slate-700'}">${emoji}</button>`).join('')}</div>
        </div>`;
    // Malý emoji soupeřovy reakce (řádek poslední výzvy, profil)
    const reactionBadge = (emoji, name = '') => emoji && REACTIONS.includes(emoji) ? `<span data-reaction-badge="${emoji}" title="${esc(name ? `${name}: ${REACTION_LABELS[emoji]}` : REACTION_LABELS[emoji])}" aria-label="Reakce ${esc(REACTION_LABELS[emoji])}" class="shrink-0 text-sm leading-none">${emoji}</span>` : '';
    // Reakce k výzvě od soupeře (to = já): emoji nebo null
    const reactionFor = (reactions, challengeId, meId) => {
        const row = (reactions || []).find(item => item.challenge_id === challengeId && item.to_id === meId && item.emoji);
        return row ? row.emoji : null;
    };
    const myReactionFor = (reactions, target, meId) => {
        const row = (reactions || []).find(item => item.from_id === meId && item.emoji && (target.challengeId ? item.challenge_id === target.challengeId : item.match_id === target.matchId));
        return row ? row.emoji : null;
    };
    // Seznam zablokovaných (Nastavení → Profil)
    const blockedList = (list, h) => {
        if (list === null) return '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Blokování zatím není k dispozici.</p>';
        if (!list.length) return '<p class="text-sm text-slate-500 dark:text-slate-400">Nikoho zablokovaného nemáš. Zablokovat hráče jde v jeho profilu přes menu ⋯.</p>';
        return `<ul id="blocked-list" class="flex flex-col gap-1.5">${list.map(row => `
            <li class="flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800">
                ${h.avatarHtml(row.player, 'h-9 w-9 text-lg')}
                <span class="min-w-0 flex-1 truncate text-[13px] font-black text-slate-800 dark:text-slate-100">${esc(row.player.display_name || 'Hráč')}</span>
                <button type="button" data-unblock="${esc(row.id)}" class="flex h-9 shrink-0 items-center rounded-xl bg-slate-100 px-3 text-[12px] font-black text-slate-700 active:scale-95 dark:bg-slate-700 dark:text-slate-200">Odblokovat</button>
            </li>`).join('')}</ul>`;
    };
    // Dev panel: nahlášení hráči (reporter, reported, důvod, čas) s tlačítkem Vyřešeno
    const when = (iso) => { const date = new Date(iso); return Number.isFinite(date.getTime()) ? `${date.getDate()}. ${date.getMonth() + 1}. ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : ''; };
    const devReports = (rows, reasons, h) => {
        if (!rows.length) return '<p class="text-sm text-slate-500 dark:text-slate-400">Žádná nahlášení.</p>';
        return `<ul id="dev-reports" class="flex flex-col gap-1.5">${rows.map(row => {
            const reported = { id: row.reported_id, display_name: row.reported_name, avatar: row.reported_avatar, color: row.reported_color };
            if (h.register) h.register(reported);
            const done = Boolean(row.resolved_at);
            return `
            <li data-report-id="${esc(row.id)}" class="flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800 ${done ? 'opacity-60' : ''}">
                ${h.avatarHtml(reported, 'h-9 w-9 text-lg', true)}
                <span class="min-w-0 flex-1 text-[12px] leading-tight"><span class="block truncate font-black text-slate-800 dark:text-slate-100">${esc(row.reported_name)} <span class="font-bold text-rose-700 dark:text-rose-300">· ${esc(reasonLabel(reasons, row.reason))}</span></span><span class="block truncate font-semibold text-slate-500 dark:text-slate-400">od ${esc(row.reporter_name)} · ${esc(when(row.created_at))}${row.note ? ` · ${esc(row.note)}` : ''}</span></span>
                ${done ? '<span class="shrink-0 text-[11px] font-black text-emerald-700 dark:text-emerald-400">vyřešeno</span>' : `<button type="button" data-resolve="${esc(row.id)}" class="flex h-9 shrink-0 items-center rounded-xl bg-emerald-600 px-2.5 text-[12px] font-black text-white active:scale-95">Vyřešeno</button>`}
            </li>`;
        }).join('')}</ul>`;
    };

    return { REACTIONS, REACTION_LABELS, FRIEND_LIMIT, activity, shortName, balanceText, split, relation, atLimit, friendButton, moreButton, moreMenu, blockConfirm, blockedNote, reportBody, reasonLabel,
        friendsStrip, requestRows, quickFriends, reactionBar, reactionBadge, reactionFor, myReactionFor, blockedList, devReports };
});
