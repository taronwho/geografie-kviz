// Jak odpověděli ostatní: souhrnné statistiky odpovědí (kolik hráčů otázku uhodlo), fronta odpovědí k odeslání po dohrané hře
// a mírná kalibrace obtížnosti při losování tréninku. Čistá logika bez DOMu: řádek pod verdiktem a okno pro správce jsou v app.js,
// volání databáze v social.js, tabulky a funkce v supabase/schema.sql (blok „Jak odpověděli ostatní“). Fronta i stažené souhrny
// témat leží v localStorage; bez úložiště, sítě nebo účtu se nic neposílá ani neukazuje.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantAnswerStats = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const QUEUE_KEY = 'mudrlant.answerStats.queue';
    const CACHE_PREFIX = 'mudrlant.answerStats.topic.';
    // Od kolika odpovědí ostatních se po odpovědi ukáže „Správně odpovědělo 23 % hráčů“ (server posílá jen takové otázky)
    const MIN_SAMPLE = 20;
    // Odpovědí v jedné dávce (server jich přijme nejvýš 30) a nejvýš čekajících v zařízení (nejstarší se zahodí)
    const BATCH_MAX = 20;
    const QUEUE_MAX = 60;
    // Stažený souhrn tématu platí den; po chybě (bez sítě) se o něj aplikace znovu pokusí nejdřív za čtvrt hodiny
    const CACHE_MS = 24 * 60 * 60 * 1000;
    const RETRY_MS = 15 * 60 * 1000;

    // Tvary jako v supabase/schema.sql (answer_stats_values)
    const TOPIC = /^[a-z0-9-]{1,24}$/;
    const ITEM = /^Q[1-9][0-9]{0,11}$/;
    const KIND = /^[a-z0-9-]{1,24}$/;
    const cleanVariant = (value) => (value === 'typed' ? 'typed' : 'choices');
    const cleanWrong = (value) => (typeof value === 'string' && value.length >= 1 && value.length <= 60 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null);
    const whole = (value) => { const number = Math.floor(Number(value)); return Number.isFinite(number) && number >= 0 ? Math.min(number, 1e12) : 0; };

    // Odpověď pro databázi: { t: téma, q: položka, k: druh otázky, v: 'choices' | 'typed', c: správně, w?: id zvolené nesprávné možnosti };
    // null, když neodpovídá tvarům ze schema.sql (taková se nikam neposílá)
    const cleanAnswer = ({ topic, itemId, kind, variant, correct, wrongId } = {}) => {
        const answer = { t: String(topic || ''), q: String(itemId || ''), k: String(kind || ''), v: cleanVariant(variant), c: correct === true };
        if (!TOPIC.test(answer.t) || !ITEM.test(answer.q) || !KIND.test(answer.k)) return null;
        const wrong = answer.c ? null : cleanWrong(wrongId);
        if (wrong && wrong !== answer.q) answer.w = wrong;
        return answer;
    };
    const keyOf = (answer) => `${answer.t}/${answer.q}/${answer.k}/${answer.v}`;

    // ===== Fronta odpovědí: { user, list } – patří jednomu účtu a pošle se jen pod ním =====
    const readQueue = (storage) => {
        try {
            const saved = JSON.parse(storage.getItem(QUEUE_KEY) || 'null');
            if (!saved || typeof saved.user !== 'string' || !Array.isArray(saved.list)) return { user: null, list: [] };
            const list = saved.list.map(entry => entry && cleanAnswer({ topic: entry.t, itemId: entry.q, kind: entry.k, variant: entry.v, correct: entry.c, wrongId: entry.w })).filter(Boolean);
            return { user: saved.user, list: list.slice(-QUEUE_MAX) };
        } catch (e) { return { user: null, list: [] }; }
    };
    const writeQueue = (storage, { user, list }) => {
        try {
            if (list.length) storage.setItem(QUEUE_KEY, JSON.stringify({ user, list: list.slice(-QUEUE_MAX) }));
            else storage.removeItem(QUEUE_KEY);
        } catch (e) { /* bez úložiště se nic nefrontuje */ }
    };
    // Zapíše odpověď přihlášeného hráče do fronty. Po přihlášení jiného účtu se fronta předchozího zahodí (cizí odpovědi se pod nový účet neposílají).
    // Stejná otázka (téma, položka, druh, způsob) je ve frontě nejvýš jednou; server ji od hráče stejně započte jednou za hodinu.
    // Vrací počet čekajících odpovědí (0 = nic se nezapsalo).
    const record = (storage, user, input) => {
        const answer = cleanAnswer(input);
        if (!storage || typeof user !== 'string' || !user || !answer) return 0;
        const queue = readQueue(storage);
        const list = queue.user === user ? queue.list : [];
        if (!list.some(entry => keyOf(entry) === keyOf(answer))) list.push(answer);
        writeQueue(storage, { user, list });
        return Math.min(list.length, QUEUE_MAX);
    };
    const pending = (storage, user) => { const queue = storage ? readQueue(storage) : { user: null, list: [] }; return queue.user === user ? queue.list.length : 0; };
    // Síťová chyba, přetížení nebo výpadek serveru: dávka počká. Odmítnutí (4xx) se nezkouší znovu.
    const isRetryable = (error) => !error || error.status === undefined || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;

    // Odešle čekající odpovědi po dávkách (nejvýš maxBatches dávek po BATCH_MAX); jedna dávka = jedno volání databáze.
    // send(list) vrací počet započtených odpovědí, nebo null, když databáze statistiky ještě neumí (fronta pak počká na aktualizaci schématu).
    // Souběžná volání sdílí jedno odesílání, ať se dávka nepošle dvakrát. Vrací počet odeslaných odpovědí.
    let flushing = null;
    const flushQueue = async ({ user, send, storage, maxBatches = 3 }) => {
        if (!user || !send || !storage) return 0;
        let sent = 0;
        for (let batch = 0; batch < maxBatches; batch++) {
            const queue = readQueue(storage);
            if (queue.user !== user || !queue.list.length) break;
            const part = queue.list.slice(0, BATCH_MAX);
            let delivered = true;
            try {
                if ((await send(part)) === null) break;
            } catch (error) {
                if (isRetryable(error)) break;
                // odmítnutá dávka (chybný tvar) se zahodí, ať fronta neleží věčně
                delivered = false;
            }
            // Mezitím mohly přibýt další odpovědi: z fronty zmizí jen odeslaná část
            const done = new Set(part.map(keyOf));
            const now = readQueue(storage);
            writeQueue(storage, { user, list: now.user === user ? now.list.filter(entry => !done.has(keyOf(entry))) : [] });
            if (delivered) sent += part.length;
        }
        return sent;
    };
    const flush = (options) => {
        if (!flushing) flushing = flushQueue(options || {}).finally(() => { flushing = null; });
        return flushing;
    };

    // ===== Stažené souhrny témat: { at, rows: [[položka, druh, 'c' | 't', zobrazeno, správně], …] } =====
    const cleanRows = (rows) => (Array.isArray(rows) ? rows : [])
        .filter(row => Array.isArray(row) && ITEM.test(String(row[0])) && KIND.test(String(row[1])) && (row[2] === 'c' || row[2] === 't'))
        .map(row => [String(row[0]), String(row[1]), row[2], whole(row[3]), whole(row[4])])
        .filter(row => row[3] >= 1 && row[4] <= row[3]);
    const saveTopic = (storage, topic, rows, now = Date.now()) => {
        if (!storage || !TOPIC.test(String(topic || ''))) return false;
        try { storage.setItem(CACHE_PREFIX + topic, JSON.stringify({ at: now, rows: cleanRows(rows) })); return true; } catch (e) { return false; }
    };
    // Index souhrnu tématu (položka → [{ kind, variant, shown, correct }]); null, když v zařízení chybí nebo je starší než den.
    // Rozbalený index se drží v paměti, dokud se uložený text nezmění.
    const indexes = new Map();
    const topicIndex = (storage, topic, now = Date.now()) => {
        let raw = null;
        try { raw = storage && TOPIC.test(String(topic || '')) ? storage.getItem(CACHE_PREFIX + topic) : null; } catch (e) { return null; }
        if (!raw) return null;
        let memo = indexes.get(topic);
        if (!memo || memo.raw !== raw) {
            let saved = null;
            try { saved = JSON.parse(raw); } catch (e) { /* poškozený záznam = jako by nebyl */ }
            const index = new Map();
            for (const [item, kind, variant, shown, correct] of cleanRows(saved && saved.rows)) {
                if (!index.has(item)) index.set(item, []);
                index.get(item).push({ kind, variant: variant === 't' ? 'typed' : 'choices', shown, correct });
            }
            memo = { raw, at: Number(saved && saved.at) || 0, index };
            indexes.set(topic, memo);
        }
        // Záznam z budoucnosti (posunuté hodiny) neplatí, jinak by nikdy nezestárl
        return now - memo.at < CACHE_MS && memo.at <= now + 60 * 1000 ? memo.index : null;
    };

    // Stáhne souhrn tématu, když v zařízení chybí nebo je starší než den. fetchRows(topic) vrací řádky, nebo null (databáze statistiky neumí).
    // Jedno stažení tématu naráz; po chybě další pokus nejdřív za RETRY_MS. Na výsledek nic nečeká: hra jede dál bez statistik.
    // Vrací true, když se souhrn uložil.
    const inFlight = new Map();
    const failedAt = new Map();
    const refresh = (topic, { storage, fetchRows, now = Date.now() } = {}) => {
        if (!storage || !fetchRows || !TOPIC.test(String(topic || ''))) return Promise.resolve(false);
        if (topicIndex(storage, topic, now)) return Promise.resolve(false);
        if (inFlight.has(topic)) return inFlight.get(topic);
        if (failedAt.has(topic) && now - failedAt.get(topic) < RETRY_MS) return Promise.resolve(false);
        const run = Promise.resolve()
            .then(() => fetchRows(topic))
            .then(rows => {
                if (rows === null || rows === undefined) { failedAt.set(topic, now); return false; }
                failedAt.delete(topic);
                return saveTopic(storage, topic, rows, now);
            }, () => { failedAt.set(topic, now); return false; })
            .finally(() => inFlight.delete(topic));
        inFlight.set(topic, run);
        return run;
    };

    // ===== Řádek po odpovědi =====
    // Statistika jedné otázky (stejný druh otázky i způsob odpovídání jako u hráče); null pod MIN_SAMPLE odpovědí
    const statFor = (index, itemId, kind, variant) => {
        const rows = index && index.get(String(itemId || ''));
        const row = rows && rows.find(entry => entry.kind === kind && entry.variant === cleanVariant(variant));
        return row && row.shown >= MIN_SAMPLE ? { shown: row.shown, correct: row.correct } : null;
    };
    // „Správně odpovědělo 23 % hráčů“ (u psané odpovědi „napsalo“); '' = málo odpovědí nebo nic staženo
    const NBSP = ' ';
    const lineFor = (stat, variant = 'choices') => {
        if (!stat || !(stat.shown >= MIN_SAMPLE)) return '';
        const typed = cleanVariant(variant) === 'typed';
        if (stat.correct <= 0) return typed ? 'Správnou odpověď zatím nenapsal nikdo z hráčů' : 'Správně zatím neodpověděl nikdo z hráčů';
        if (stat.correct >= stat.shown) return typed ? 'Správnou odpověď napsali všichni hráči' : 'Správně odpověděli všichni hráči';
        const percent = Math.round(stat.correct * 100 / stat.shown);
        const share = percent < 1 ? `méně než 1${NBSP}%` : percent > 99 ? `víc než 99${NBSP}%` : `${percent}${NBSP}%`;
        return `Správně ${typed ? 'napsalo' : 'odpovědělo'} ${share} hráčů`;
    };
    // Bublina s velikostí vzorku (vždy aspoň 20, tedy „odpovědí“)
    const sampleText = (stat) => (stat ? `Podle ${stat.shown.toLocaleString('cs-CZ')} odpovědí hráčů s účtem` : '');

    // ===== Kalibrace obtížnosti při losování (jen trénink tématu a Mixu, kde se losuje bez semínka) =====
    // Pravidlo je záměrně opatrné, položka nikdy nevypadne úplně, jen přijde na řadu méně často:
    //  - úspěšnost položky = správně / zobrazeno ze všech odpovědí výběrem ze 4 možností (součet přes všechny druhy otázek k položce),
    //    bere se jen při aspoň 50 odpovědích (minSample);
    //  - položka ze známější sady (k = 1, výchozí „známější“) s úspěšností pod 15 % (hůř než tipování, nejspíš matoucí možnosti nebo
    //    chyba v datech, kterou správce uvidí v Podezřelých otázkách) se losuje s váhou 0,35;
    //  - hráči od úrovně 20 se položky, které zná přes 95 % hráčů, losují s váhou 0,6;
    //  - jinak váha 1. Váha platí jen uvnitř kategorie (kategorie se dál losuje rovnoměrně, pickItem v quiz-core.js).
    // Dnešní otázky, výzvy a turnaje se losují ze semínka a statistiky nepoužívají vůbec, ať mají všichni hráči stejné otázky.
    const CALIBRATION = Object.freeze({ minSample: 50, hardRate: 0.15, hardWeight: 0.35, easyRate: 0.95, easyWeight: 0.6, expertLevel: 20 });
    // Úspěšnost položky z výběru z možností (0–1); null bez dost odpovědí
    const itemRate = (index, itemId) => {
        const rows = (index && index.get(String(itemId || ''))) || [];
        let shown = 0;
        let correct = 0;
        for (const row of rows) if (row.variant === 'choices') { shown += row.shown; correct += row.correct; }
        return shown >= CALIBRATION.minSample ? correct / shown : null;
    };
    const weightFor = (item, index, { level = 1 } = {}) => {
        const rate = item ? itemRate(index, item.q) : null;
        if (rate === null) return 1;
        if (item.k === 1 && rate < CALIBRATION.hardRate) return CALIBRATION.hardWeight;
        if (level >= CALIBRATION.expertLevel && rate > CALIBRATION.easyRate) return CALIBRATION.easyWeight;
        return 1;
    };
    // Funkce váhy pro pickItem; null bez staženého souhrnu (losuje se rovnoměrně jako dřív)
    const weigher = (index, options = {}) => (index && index.size ? (item) => weightFor(item, index, options) : null);

    // ===== Podezřelé otázky (okno pro správce) =====
    // Popisek možnosti: položka tématu nebo stát (lookup), jinak id bez předpony (znacka-Na → Na, stoleti-19 → 19. století)
    const optionLabel = (id, lookup = () => null) => {
        const text = String(id || '');
        const known = text ? lookup(text) : null;
        if (known) return String(known);
        const century = /^stoleti-(-?\d{1,2})$/.exec(text);
        if (century) { const number = Number(century[1]); return number < 0 ? `${-number}. století př. n. l.` : `${number}. století`; }
        const decade = /^desetileti-(\d{3,4})$/.exec(text);
        if (decade) return `${decade[1]}. léta`;
        return text.replace(/^[a-z]+-(?=.)/, '');
    };
    const REASONS = { mate: 'Nesprávná možnost vede', nizka: 'Nízká úspěšnost' };
    // Druh otázky česky (question.type z témat); neznámý druh se ukáže tak, jak je
    const KIND_LABELS = {
        name: 'název', location: 'stát', century: 'století', taxon: 'řád či čeleď', symbol: 'značka', formula: 'vzorec', unit: 'jednotka',
        usymbol: 'značka jednotky', measures: 'veličina', hardness: 'tvrdost', group: 'skupina hornin', style: 'sloh či směr', architect: 'architekt',
        author: 'autor', period: 'období', director: 'režisér', decade: 'desetiletí', counterpart: 'protějšek', myth: 'mytologie', sport: 'sport', host: 'pořadatel'
    };
    const kindLabel = (kind) => (Object.prototype.hasOwnProperty.call(KIND_LABELS, kind) ? KIND_LABELS[kind] : String(kind || ''));
    const cleanSuspicious = (rows) => (Array.isArray(rows) ? rows : [])
        .filter(row => row && TOPIC.test(String(row.topic)) && ITEM.test(String(row.item_id)) && KIND.test(String(row.kind)))
        .map(row => ({
            topic: String(row.topic), itemId: String(row.item_id), kind: String(row.kind), variant: cleanVariant(row.variant),
            shown: whole(row.shown), correct: whole(row.correct), topWrong: cleanWrong(row.top_wrong), topWrongCount: whole(row.top_wrong_count),
            reason: row.reason === 'mate' ? 'mate' : 'nizka'
        }))
        .filter(row => row.shown > 0);
    const percentOf = (part, total) => (total > 0 ? Math.round(part * 100 / total) : 0);

    // Jen pro testy: zapomene indexy a stav stahování v paměti
    const reset = () => { indexes.clear(); inFlight.clear(); failedAt.clear(); flushing = null; };

    return {
        QUEUE_KEY, CACHE_PREFIX, MIN_SAMPLE, BATCH_MAX, QUEUE_MAX, CACHE_MS, RETRY_MS, CALIBRATION, REASONS,
        cleanAnswer, readQueue, record, pending, isRetryable, flush,
        cleanRows, saveTopic, topicIndex, refresh,
        statFor, lineFor, sampleText, itemRate, weightFor, weigher,
        optionLabel, kindLabel, cleanSuspicious, percentOf, reset
    };
});
