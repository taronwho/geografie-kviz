// Prestiž po úrovni 100: úroveň se počítá z celkových XP (quiz-core.js levelFromXp) a končí na 100. Kdo ji má, může (po vysvětlení
// a potvrzení) přejít do prestiže: úroveň se mu začne ukazovat znovu od 1 s hvězdou prestiže (★1 · úr. 7), u jména a v profilu.
// Je to jen vrstva zobrazení nad XP: XP, odznaky, žebříčky, ligy ani nic odemčeného se nemění, odemykání dál počítá skutečnou
// úroveň (100). Úrovně v prestiži jsou rovnoměrné: každá za LEVEL_XP XP (100 úrovní = 49 500 XP), na úrovni 100 jde do další prestiže.
// Stav = { n: počet prestiží, at: XP v okamžiku poslední prestiže }; přihlášenému ho drží server (profiles.prestige a prestige_xp,
// prestige_up() v bloku 32 ve schema.sql ověří XP z účtu), hostovi zařízení (mudrlant.prestige). Za první prestiž rámeček Prestižní (look.js).
// Strop XP v databázi (500 000) stačí na 4 prestiže hned po sobě (330 000, 379 500, 429 000, 478 500 XP).
(function (root, factory) {
    const isNode = typeof module === 'object' && module.exports;
    const api = factory(root.MudrlantCore || (isNode ? require('./quiz-core.js') : null));
    if (isNode) module.exports = api;
    else root.MudrlantPrestige = api;
})(typeof self !== 'undefined' ? self : this, (Core) => {
    'use strict';
    const KEY = 'mudrlant.prestige';
    const MAX_LEVEL = Core ? Core.MAX_LEVEL : 100;
    // XP na úroveň 100 (první prestiž) a XP na jednu úroveň v prestiži
    const START_XP = Core ? Core.xpForLevel(MAX_LEVEL) : 330000;
    const LEVEL_XP = 500;
    const CYCLE_XP = (MAX_LEVEL - 1) * LEVEL_XP;
    const MAX_PRESTIGE = 99;
    const whole = (value, max) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0);
    const clean = (raw) => {
        const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const n = whole(data.n, MAX_PRESTIGE);
        return { n, at: n ? whole(data.at, 1e9) : 0 };
    };
    // Kolik XP je potřeba na další prestiž (ze stavu)
    const nextAt = (state) => { const s = clean(state); return s.n ? s.at + CYCLE_XP : START_XP; };
    // Přehled pro zobrazení: { prestige, level (ukázaná úroveň), into, needed (XP v úrovni, 0 na úrovni 100), ratio, realLevel, canPrestige, nextAt }
    const view = (xp, state) => {
        const s = clean(state);
        const total = whole(xp, 1e9);
        const real = Core ? Core.levelProgress(total) : { level: 1, into: 0, needed: 0, ratio: 0 };
        const canPrestige = s.n < MAX_PRESTIGE && total >= nextAt(s);
        if (!s.n) return { prestige: 0, level: real.level, into: real.into, needed: real.needed, ratio: real.ratio, realLevel: real.level, canPrestige, nextAt: nextAt(s) };
        const gained = Math.max(0, total - s.at);
        const level = Math.min(MAX_LEVEL, 1 + Math.floor(gained / LEVEL_XP));
        const top = level >= MAX_LEVEL;
        const into = top ? gained - CYCLE_XP : gained % LEVEL_XP;
        return { prestige: s.n, level, into, needed: top ? 0 : LEVEL_XP, ratio: top ? 1 : into / LEVEL_XP, realLevel: real.level, canPrestige, nextAt: nextAt(s) };
    };
    // Přechod do další prestiže v zařízení (host; přihlášenému ho dá server): nový stav, nebo null, když to ještě nejde
    const advance = (state, xp) => {
        const s = clean(state);
        if (s.n >= MAX_PRESTIGE || whole(xp, 1e9) < nextAt(s)) return null;
        return { n: s.n + 1, at: whole(xp, 1e9) };
    };
    // Stav ze serveru (prestige, prestige_xp) nebo null
    const fromServer = (row) => (row && Number.isFinite(Number(row.prestige)) ? clean({ n: row.prestige, at: row.prestige_xp }) : null);
    // Novější ze dvou stavů (víc prestiží; při shodě pozdější začátek)
    const newer = (a, b) => { const x = clean(a); const y = clean(b); return y.n > x.n || (y.n === x.n && y.at > x.at) ? y : x; };

    // --- Texty a HTML ---
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const mark = (n) => (n > 0 ? `★${n}` : '');
    // „★1 · úr. 7“ nebo „Úr. 7“ (bez prestiže); short = jen značka a číslo do těsného místa
    const levelText = (v, { short = false } = {}) => (v.prestige ? (short ? `★${v.prestige} · ${v.level}` : `★${v.prestige} · úr. ${v.level}`) : `Úr. ${v.level}`);
    // Zlatý štítek prestiže (u úrovně, v profilu)
    const markHtml = (n, cls = 'text-[10px]') => (n > 0 ? `<span data-prestige-mark="${n}" class="prestige-mark inline-flex shrink-0 items-center rounded-full px-1 font-black leading-tight ${cls}" title="Prestiž ${n}">★${n}</span>` : '');
    const formatXp = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    // Vysvětlení a potvrzení (okno Úrovně a tituly): co se stane a co zůstane; bez tlačítka, když prestiž ještě nejde (jen výhled)
    const panelHtml = (v, { busy = false, signedIn = false } = {}) => {
        const next = v.prestige + 1;
        if (!v.canPrestige) {
            if (!v.prestige) return '';
            return `<div data-prestige-panel class="prestige-card flex items-center gap-2.5 rounded-2xl p-2.5 text-white shadow-sm">
                <span class="prestige-orb flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black">★${v.prestige}</span>
                <p class="min-w-0 flex-1 text-[12px] font-semibold leading-snug">Prestiž ${v.prestige}: úroveň ${v.level} ze ${MAX_LEVEL}. Každá úroveň za ${formatXp(LEVEL_XP)} XP, na úrovni ${MAX_LEVEL} můžeš do prestiže ${next}.</p>
            </div>`;
        }
        return `<div data-prestige-panel class="prestige-card flex flex-col gap-2 rounded-2xl p-3 text-white shadow-md">
            <div class="flex items-center gap-2.5">
                <span class="prestige-orb flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-black">★${next}</span>
                <p class="min-w-0 flex-1 text-[15px] font-black leading-tight">${v.prestige ? `Můžeš do prestiže ${next}` : 'Máš úroveň 100. Můžeš do prestiže!'}</p>
            </div>
            <ul class="flex flex-col gap-1 text-[12px] font-semibold leading-snug text-white/90">
                <li class="flex gap-1.5"><i data-lucide="star" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300"></i><span>Úroveň se ti začne ukazovat znovu od 1, s hvězdou prestiže ★${next} u jména.</span></li>
                <li class="flex gap-1.5"><i data-lucide="shield-check" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300"></i><span>Nic neztratíš: XP, odznaky, odměny, žebříčky i všechno odemčené ti zůstane.</span></li>
                <li class="flex gap-1.5"><i data-lucide="sparkles" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300"></i><span>${v.prestige ? `Každá úroveň za ${formatXp(LEVEL_XP)} XP.` : `Získáš rámeček Prestižní. Každá další úroveň za ${formatXp(LEVEL_XP)} XP.`}</span></li>
            </ul>
            <button type="button" data-prestige-go ${busy ? 'disabled' : ''} class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gold-500 px-4 py-2.5 text-[15px] font-black text-brand-950 disabled:opacity-60"><i data-lucide="star" class="h-5 w-5"></i>${busy ? 'Chvilku…' : `Přejít do prestiže ${next}`}</button>
            ${signedIn ? '' : '<p class="text-center text-[11px] font-semibold text-white/75">Bez přihlášení se prestiž pamatuje jen v tomhle zařízení.</p>'}
        </div>`;
    };
    // Potvrzovací otázka (druhý krok)
    const confirmHtml = (v, { busy = false } = {}) => `
        <div data-prestige-confirm class="flex flex-col gap-3">
            <p class="text-[14px] font-bold leading-snug text-slate-800 dark:text-slate-100">Opravdu přejít do prestiže ${v.prestige + 1}?</p>
            <p class="text-[13px] leading-snug text-slate-600 dark:text-slate-300">Úroveň se ti ukáže znovu od 1 se značkou ★${v.prestige + 1}. Celkové XP (${formatXp(v.realXp || 0)} XP), odznaky, odměny i postavení v žebříčcích zůstanou. Vrátit to nejde, ale nic tím neztratíš.</p>
            <div class="grid grid-cols-2 gap-2">
                <button type="button" data-prestige-cancel class="min-h-[2.75rem] rounded-2xl bg-slate-100 text-[14px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200">Zpět</button>
                <button type="button" data-prestige-confirm-go ${busy ? 'disabled' : ''} class="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-2xl btn-3d bg-gold-500 text-[14px] font-black text-brand-950 disabled:opacity-60"><i data-lucide="star" class="h-4 w-4"></i>${busy ? 'Chvilku…' : 'Ano, do prestiže'}</button>
            </div>
        </div>`;

    return { KEY, MAX_LEVEL, START_XP, LEVEL_XP, CYCLE_XP, MAX_PRESTIGE, clean, nextAt, view, advance, fromServer, newer, mark, levelText, markHtml, panelHtml, confirmHtml };
});
