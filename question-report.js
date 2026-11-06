// Nahlášení chyby v otázce: důvody, očištění hlášení, offline fronta a odeslání s přátelskou hláškou.
// Čistá logika bez DOMu (okno je v app.js, odeslání do databáze v social.js); fronta je v localStorage (hlášení se pošle, až bude síť).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantReport = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    const REASONS = [
        { id: 'spatna-odpoved', label: 'Špatná odpověď', icon: 'circle-x' },
        { id: 'nejasne-zadani', label: 'Nejasné zadání', icon: 'search-x' },
        { id: 'spatny-obrazek', label: 'Špatný obrázek', icon: 'image' },
        { id: 'jine', label: 'Jiné', icon: 'pencil' }
    ];
    const NOTE_MAX = 500;
    const QUEUE_KEY = 'mudrlant.reports';
    const QUEUE_MAX = 20;
    const reasonLabel = (id) => (REASONS.find(reason => reason.id === id) || { label: 'Jiné' }).label;
    const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    // Hlášení pro databázi (délky odpovídají kontrolám v supabase/schema.sql); null, když chybí otázka nebo důvod
    const buildReport = ({ topic, itemId, questionType, title, answer }, reason, note) => {
        const clean = {
            topic: String(topic || ''), item_id: String(itemId || ''), question_type: clip(questionType, 24), reason: REASONS.some(item => item.id === reason) ? reason : '',
            note: String(note ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, NOTE_MAX), title: clip(title, 200), answer: clip(answer, 200)
        };
        return /^[a-z0-9-]{1,24}$/.test(clean.topic) && /^[A-Za-z0-9_.:-]{1,40}$/.test(clean.item_id) && clean.reason ? clean : null;
    };

    // Fronta čekajících hlášení: { user, report } – pošle se jen pod tím účtem, který ji napsal
    const readQueue = (storage) => {
        try {
            const list = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
            return Array.isArray(list) ? list.filter(entry => entry && typeof entry.user === 'string' && entry.report && buildReport({ topic: entry.report.topic, itemId: entry.report.item_id }, entry.report.reason, '')) : [];
        } catch (e) { return []; }
    };
    const writeQueue = (storage, list) => { try { storage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX))); } catch (e) { /* bez úložiště se nic nefrontuje */ } };
    const enqueue = (storage, user, report) => {
        const list = readQueue(storage);
        list.push({ user, report });
        writeQueue(storage, list);
        return Math.min(list.length, QUEUE_MAX);
    };
    // Síťová chyba nebo výpadek serveru: hlášení má smysl zkusit později. Chyba 4xx (odmítnuto, chybí tabulka) se nefrontuje.
    const isRetryable = (error) => !error || error.status === undefined || error.status === 0 || error.status === 408 || error.status >= 500;

    // send(report) pošle hlášení do databáze (hází SocialError se status). Výsledek: { state: 'sent' | 'queued' | 'refused', message }
    const submit = async (report, { user, send, storage, online = true }) => {
        if (!report) return { state: 'refused', message: 'Hlášení nejde odeslat, zkus otázku otevřít znovu.' };
        if (!user || !send) return { state: 'refused', message: 'Hlášení se posílá z účtu. Přihlas se v Nastavení a zkus to znovu, děkujeme za snahu.' };
        const later = () => ({ state: 'queued', message: 'Jsi offline, hlášení si pamatuju a odešlu ho, jakmile bude připojení. Díky!' });
        if (!online) { enqueue(storage, user, report); return later(); }
        try {
            await send(report);
            return { state: 'sent', message: 'Díky, hlášení je odeslané.' };
        } catch (error) {
            if (isRetryable(error)) { enqueue(storage, user, report); return later(); }
            if (error.status === 404) return { state: 'refused', message: 'Hlášení zatím nejde přijmout, databáze je ještě neumí. Zkus to později.' };
            if (error.status === 401 || error.status === 403) return { state: 'refused', message: 'Hlášení se nepodařilo odeslat, přihlas se prosím znovu.' };
            if (/hlášení|zítra/.test(String(error.message))) return { state: 'refused', message: String(error.message) };
            return { state: 'refused', message: 'Hlášení se nepodařilo odeslat. Zkontroluj text a zkus to znovu.' };
        }
    };
    // Odešle frontu hlášení přihlášeného účtu; zastaví se na první síťové chybě. Vrací počet odeslaných.
    let flushing = null;
    const flush = (options) => {
        // Souběžná volání (obnovení připojení + přihlášení) sdílí jedno odesílání, ať se hlášení nepošle dvakrát
        if (!flushing) flushing = flushQueue(options).finally(() => { flushing = null; });
        return flushing;
    };
    const flushQueue = async ({ user, send, storage }) => {
        if (!user || !send) return 0;
        const list = readQueue(storage);
        let sent = 0;
        const rest = [];
        for (let index = 0; index < list.length; index++) {
            const entry = list[index];
            if (entry.user !== user) { rest.push(entry); continue; }
            try { await send(entry.report); sent++; } catch (error) {
                if (isRetryable(error)) { rest.push(...list.slice(index)); break; }
                // odmítnuté hlášení (limit, chybná data) se zahodí, ať fronta neleží věčně
            }
        }
        writeQueue(storage, rest);
        return sent;
    };

    return { REASONS, NOTE_MAX, reasonLabel, buildReport, readQueue, enqueue, isRetryable, submit, flush };
});
