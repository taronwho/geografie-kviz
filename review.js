// Opakování s rozestupy (Leitnerovy krabičky): čistá logika bez DOMu. Karta vznikne z každé položky, kterou hráč splete
// (i z dřívějšího seznamu „Moje chyby“), a vrací se k opakování po 1, 3, 7, 14 a 30 dnech. Správná odpověď kartu posune
// do další krabičky, špatná ji vrátí na začátek. Karty se drží jen v zařízení (mudrlant.review), do účtu se nesynchronizují.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantReview = api;
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';
    // Za kolik dní se karta z krabičky 0–4 vrátí; správná odpověď z poslední krabičky kartu odstraní (zvládnuto)
    const INTERVALS = [1, 3, 7, 14, 30];
    const MAX_BOX = INTERVALS.length - 1;
    const LIMIT = 500;
    const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

    // Dny jako text RRRR-MM-DD; posun se počítá v UTC, ať letní čas nic neposouvá
    const parseDay = (day) => {
        const match = DAY_PATTERN.exec(String(day || ''));
        return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
    };
    const isDay = (day) => Number.isFinite(parseDay(day));
    const shiftDay = (day, days) => new Date(parseDay(day) + days * 86400000).toISOString().slice(0, 10);
    const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 86400000);

    const keyOf = (card) => `${card.topic}:${card.q}`;
    const splitKey = (key) => { const index = String(key).indexOf(':'); return index > 0 ? { topic: key.slice(0, index), q: key.slice(index + 1) } : null; };

    // Uložená data mohou být poškozená nebo z jiné verze: vezme se jen to, co dává smysl, bez duplicit, nejvýš LIMIT karet
    const parse = (raw) => {
        if (!Array.isArray(raw)) return [];
        const seen = new Set();
        const cards = [];
        for (const item of raw) {
            if (!item || typeof item !== 'object' || typeof item.topic !== 'string' || !item.topic || item.q === undefined || item.q === null || !isDay(item.due)) continue;
            const q = String(item.q);
            const key = `${item.topic}:${q}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const box = Math.floor(Number(item.box));
            cards.push({ topic: item.topic, q, box: Number.isFinite(box) ? Math.max(0, Math.min(MAX_BOX, box)) : 0, due: item.due });
        }
        return trim(cards);
    };
    const serialize = (cards) => JSON.stringify(cards.map(card => ({ topic: card.topic, q: card.q, box: card.box, due: card.due })));
    // Pořadí v seznamu = pořadí vzniku; přes limit se zahodí nejstarší (ze začátku)
    const trim = (cards) => cards.length > LIMIT ? cards.slice(cards.length - LIMIT) : cards;

    const findCard = (cards, key) => cards.find(card => keyOf(card) === key) || null;
    const dueCards = (cards, today) => cards.filter(card => diffDays(card.due, today) <= 0);
    const dueCount = (cards, today) => dueCards(cards, today).length;

    // Odpověď na položku: špatná = karta do krabičky 0 s opakováním zítra (nová karta vznikne), správná = o krabičku dál,
    // z poslední krabičky karta zmizí. Správná odpověď na kartu, která ještě není na řadě, kartu nemění (force = v opakování vždy posune).
    const onAnswer = (cards, key, correct, today, { force = false } = {}) => {
        const parts = splitKey(key);
        if (!parts || !isDay(today)) return cards;
        const existing = findCard(cards, key);
        if (!correct) {
            const reset = { topic: parts.topic, q: parts.q, box: 0, due: shiftDay(today, INTERVALS[0]) };
            return trim(existing ? cards.map(card => (card === existing ? reset : card)) : [...cards, reset]);
        }
        if (!existing) return cards;
        if (!force && diffDays(existing.due, today) > 0) return cards;
        if (existing.box >= MAX_BOX) return cards.filter(card => card !== existing);
        const box = existing.box + 1;
        return cards.map(card => (card === existing ? { ...card, box, due: shiftDay(today, INTERVALS[box]) } : card));
    };

    // Dřívější chyby („téma:ID“) jako karty v krabičce 0 na dnes; co už kartu má, zůstává
    const importMistakes = (cards, keys, today) => {
        if (!Array.isArray(keys) || !isDay(today)) return cards;
        const have = new Set(cards.map(keyOf));
        const added = [];
        for (const key of keys) {
            const parts = splitKey(key);
            if (!parts || have.has(key)) continue;
            have.add(key);
            added.push({ topic: parts.topic, q: parts.q, box: 0, due: today });
        }
        return added.length ? trim([...cards, ...added]) : cards;
    };
    const removeCard = (cards, key) => cards.filter(card => keyOf(card) !== key);

    // Nejbližší den dalšího opakování (po dnešku): null, když žádná karta nečeká
    const nextDue = (cards, today) => {
        const future = cards.map(card => card.due).filter(due => diffDays(due, today) > 0).sort();
        return future.length ? future[0] : null;
    };
    const inDays = (days) => days <= 0 ? 'dnes' : days === 1 ? 'zítra' : days < 5 ? `za ${days} dny` : `za ${days} dní`;
    // „další procvičení zítra“ / „za 3 dny“ / „“ (nic nečeká)
    const nextDueText = (cards, today) => {
        if (dueCount(cards, today)) return 'další procvičení dnes';
        const due = nextDue(cards, today);
        return due ? `další procvičení ${inDays(diffDays(due, today))}` : '';
    };
    const plural = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
    // Souhrn po dohrání: „Zvládnuto 3 z 5, další opakování zítra“
    const summaryText = ({ mastered, total }, cards, today) => {
        const next = nextDueText(cards, today);
        return `Zvládnuto ${mastered} z ${total}${next ? `, ${next}` : ''}`;
    };
    const cardsWord = (count) => plural(count, 'karta', 'karty', 'karet');

    return { INTERVALS, MAX_BOX, LIMIT, parse, serialize, keyOf, splitKey, shiftDay, diffDays, findCard, dueCards, dueCount, onAnswer, importMistakes, removeCard, nextDue, nextDueText, inDays, summaryText, cardsWord };
});
