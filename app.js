// Mudrlant – rozhraní kvízu: dnešní otázky témat, trénink, učení, okno s popisem, nastavení a ukládání stavu.
// Téma (topics/*.js) dodá kategorie, znění otázek, obrazovou nápovědu a fakta; všechno ostatní je společné.
(() => {
    'use strict';

    const {
        SATELLITE_TILES, OSM_TILES,
        escapeHtml, plural, isRealPhoto, commonsPhotoUrl, commonsFileUrl, displayName, formatPoints, getDayKey, formatDayKey, createSeededRandom, pickRandom,
        censorName, hideAnswer, buildQuestionTexts, factRevealsAnswer, answerNamesFor, genericWordsOf, specificWords, isGenericWord, OUT_OF_CONTEXT,
        processWikiText, takeLeadFacts, checkAnswer, normalizeAnswer, filterItems, pickItem, sortItems,
        buildItemChoices, cultureLandsFor, findAnswerItem, setCountries, updateMistakes, nameAnswers, pointsFor, dropKnownFacts, scaleKnown, dropChoiceNames,
        computeStreak, buildShareText, getTileLayout, shuffle,
        LEVEL_XP, xpForLevel, MAX_LEVEL, LEVEL_TITLES,
        BADGES, BADGE_GROUPS, BADGE_BY_ID, earnedBadgeIds, compactBadges, expandBadges, normalizeCounters,
        levelProgress, titleForLevel, nextTitle, answerXp, DAILY_XP, DAILY_ALL_XP, streakXp, MASTERY_STEPS, masteryStars, nextMastery
    } = window.MudrlantCore;
    const Visuals = window.MudrlantVisuals;
    // Opakování karet (review.js) a týdenní cíle (goals.js); bez skriptu se jen nezobrazí
    const Review = window.MudrlantReview || null;
    const Goals = window.MudrlantGoals || null;
    const TOPICS = window.MudrlantTopics || [];
    const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(topic => [topic.id, topic]));
    const APP_NAME = 'Mudrlant';

    const KEYS = {
        variant: 'mudrlant.variant',
        settings: 'mudrlant.settings',
        stats: 'mudrlant.stats',
        daily: 'mudrlant.daily',
        session: 'mudrlant.session',
        history: 'mudrlant.history',
        mistakes: 'mudrlant.mistakes',
        learned: 'mudrlant.learned',
        pendingChallenge: 'mudrlant.pendingChallenge',
        homeTab: 'mudrlant.homeTab',
        progress: 'mudrlant.progress',
        // Karty opakování s rozestupy a stav týdenních cílů – jen v zařízení, do účtu se nesynchronizují
        review: 'mudrlant.review',
        reviewOn: 'mudrlant.reviewOn',
        goals: 'mudrlant.goals',
        // 'host' = hráč na úvodu zvolil hraní bez přihlášení, úvod s přihlášením se už neukáže
        account: 'mudrlant.account'
    };
    const STATE_VERSION = 8;
    const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
    // Verze databázového schématu, kterou aplikace potřebuje: zvyšuje se spolu s schema_version() na konci supabase/schema.sql
    // (tests/sql-security.test.js hlídá shodu). Správce (dev_admins nebo vývojářský režim) uvidí v Nastavení, že má schéma spustit znovu.
    const REQUIRED_SCHEMA = 1;
    const HISTORY_SIZE = 200;
    const REQUEST_TIMEOUT = 12000;
    const WIKI_TIMEOUT = 6000;
    const PHOTO_TIMEOUT = 8000;
    const PHOTO_WAIT = 1500;
    const DEFAULT_MAP_ZOOM = 5;
    const RESULT_SATELLITE_ZOOM = 5;
    const MIN_MAP_ZOOM = 2;
    const MAX_MAP_ZOOM = 12;
    const WIKI_API = 'https://cs.wikipedia.org/w/api.php?format=json&origin=*';

    const appContent = document.getElementById('app-content');

    // Obrazovka: 'home' (dnešní otázky), 'round' (otázka nebo výsledek), 'learn' (učení), 'welcome' (první spuštění)
    let screen = 'home';
    let isLoading = false;
    // Rozehraná otázka: data (current) a průběh (round); mode = 'daily' nebo 'practice'
    let current = null;
    let round = null;
    let mode = 'daily';
    // Rozehraná výzva (hra více hráčů): { code, topic, seed, count, index, results, creator, done }
    let challenge = null;
    // Odkud hra bere otázky: { kind: 'topic', topic } (vybrané kategorie tématu), { kind: 'mix' } (vybraná témata),
    // { kind: 'collection', topic, collection } (okruh z učení), { kind: 'mistakes' }
    let pool = { kind: 'mix' };
    let mapZoom = DEFAULT_MAP_ZOOM;
    // Varianta hry: 'choices' (výběr ze 4 možností) nebo 'typed' (psaní odpovědi za dvojnásobek bodů)
    let gameVariant = null;
    let settings = null;
    // Téma poslední otevřené dnešní otázky (pro „Zkusit znovu“ po chybě spojení)
    let lastDailyTopic = null;
    // Učení: view = 'home' | 'topic' | 'collection' | 'atlas' | 'mistakes'; order = ID položek v pořadí procházení
    const learn = { view: 'home', topic: null, collection: null, order: [], index: 0 };

    class NetworkError extends Error {}

    // --- Uložená data (localStorage může být zakázaný, proto vše přes try/catch) ---

    const readJson = (key) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            return null;
        }
    };
    const writeJson = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    };

    // Převzetí uložených dat z dřívějšího Geo Kvízu (jednou): varianta, výsledky zeměpisu, chyby a nastavení
    const migrateFromGeoQuiz = () => {
        try {
            const oldKeys = Object.keys(localStorage).filter(key => key.startsWith('geoQuiz') || key === 'geoSessionState');
            if (!oldKeys.length) return;
            const variant = localStorage.getItem('geoQuizVariant');
            if (variant && !localStorage.getItem(KEYS.variant)) localStorage.setItem(KEYS.variant, variant);
            const stats = readJson('geoQuizStats');
            if (stats && !readJson(KEYS.stats)) writeJson(KEYS.stats, { daily: { zemepis: stats.daily || {} }, practice: stats.practice || {} });
            const filters = readJson('geoQuizFilters');
            if (filters && !readJson(KEYS.settings)) writeJson(KEYS.settings, { tier: filters.tier === 'all' ? 'all' : 'known' });
            const mistakes = readJson('geoQuizMistakes');
            if (Array.isArray(mistakes) && !readJson(KEYS.mistakes)) writeJson(KEYS.mistakes, mistakes.map(id => `zemepis:${id}`));
            const history = readJson('geoQuizHistory');
            if (Array.isArray(history) && !readJson(KEYS.history)) writeJson(KEYS.history, history);
            oldKeys.forEach(key => localStorage.removeItem(key));
        } catch (e) {}
    };

    // tier = známost, topics = témata v mixu, categories = vybrané kategorie každého tématu (chybí = všechny),
    // seen = témata (a mix), u kterých už hráč viděl okno s výběrem
    // Témata, která existovala, než si nastavení pamatovalo seznam známých témat (known)
    const ORIGINAL_TOPICS = ['zemepis', 'historie', 'biologie', 'chemie', 'fyzika'];
    const loadSettings = () => {
        const saved = readJson(KEYS.settings) || {};
        // Nové téma, které hráč ještě neznal, přibude do mixu samo (odebrané téma zůstane odebrané)
        const known = Array.isArray(saved.known) ? saved.known : ORIGINAL_TOPICS;
        const added = TOPICS.map(topic => topic.id).filter(id => !known.includes(id));
        const topics = Array.isArray(saved.topics) && saved.topics.length
            ? [...saved.topics.filter(id => TOPIC_BY_ID[id]), ...added.filter(id => !saved.topics.includes(id))] : [];
        const categories = {};
        for (const topic of TOPICS) {
            const keys = topic.categories.map(category => category.key);
            const chosen = ((saved.categories || {})[topic.id] || []).filter(key => keys.includes(key));
            if (chosen.length && chosen.length < keys.length) categories[topic.id] = chosen;
        }
        return {
            tier: saved.tier === 'all' ? 'all' : 'known',
            topics: topics.length ? topics : TOPICS.map(topic => topic.id),
            categories,
            seen: Array.isArray(saved.seen) ? saved.seen : []
        };
    };
    // Vybrané kategorie tématu (výchozí všechny)
    const selectedCategories = (topic) => settings.categories[topic.id] || topic.categories.map(category => category.key);

    const loadStats = () => {
        const saved = readJson(KEYS.stats) || {};
        return { daily: saved.daily || {}, practice: { played: 0, correct: 0, points: 0, ...(saved.practice || {}) } };
    };

    // Položky k zopakování jako klíče „téma:ID“, nejnovější chyba první
    const loadMistakes = () => {
        const saved = readJson(KEYS.mistakes);
        return Array.isArray(saved) ? saved.filter(key => typeof key === 'string' && TOPIC_BY_ID[key.split(':')[0]]) : [];
    };
    // Co hráč aspoň jednou uhodl – ukazuje se jako postup v okruzích
    // Poznané položky; vymyšlené položky vývojářského režimu (dev0, dev1…) se mimo něj nepočítají
    const loadLearned = () => {
        const learned = readJson(KEYS.learned) || {};
        let dev = false;
        try { dev = localStorage.getItem('mudrlant.dev.backup') !== null; } catch (e) { /* bez úložiště */ }
        return dev ? learned : Object.fromEntries(Object.entries(learned).map(([topic, ids]) => [topic, (Array.isArray(ids) ? ids : []).filter(id => !/^dev\d+$/.test(id))]));
    };

    // Karty opakování (review.js): dřívější chyby ze seznamu „Moje chyby“ se přidají jako karty na dnes
    const loadReview = () => Review ? Review.importMistakes(Review.parse(readJson(KEYS.review)), loadMistakes(), getDayKey()) : [];
    const saveReview = (cards) => writeJson(KEYS.review, cards);
    // Opakování s rozestupy jde vypnout v Nastavení (ve výchozím stavu zapnuté); vypnuté nezakládá karty, neukazuje čip ani dlaždici a nedává týdenní cíl na opakování
    const reviewEnabled = () => Boolean(Review) && readJson(KEYS.reviewOn) !== false;
    const reviewDueCount = () => reviewEnabled() ? Review.dueCount(loadReview(), getDayKey()) : 0;
    // Souhrn posledního dokončeného opakování (ukáže se v učení), null = žádný
    let reviewSummary = null;

    // review = otázka z opakování karet (poloviční XP)
    const createRound = () => ({ hintLevel: 1, variant: gameVariant || 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false, review: mode === 'practice' && pool.kind === 'review' });
    const getLevelCount = (data) => 1 + data.hints.length;

    const VARIANTS = {
        choices: { icon: 'layout-grid', title: 'Výběr ze 4 možností', text: 'Klasický kvíz. Bez nápovědy až 4 body, každá nápověda bod ubere.' },
        typed: { icon: 'keyboard', title: 'Psaní odpovědi', text: 'Těžší varianta za dvojnásobek bodů. Na diakritice, velkých písmenech ani drobném překlepu nezáleží.' }
    };
    const TIERS = {
        known: { title: 'Jen známé', text: 'Hlavní města, slavné osobnosti, běžná zvířata…' },
        all: { title: 'I méně známé', text: 'Těžší – celá sada' }
    };

    // Barvy témat (celé názvy tříd kvůli Tailwindu): soft = štítek, solid = plný štítek, button = hlavní tlačítko,
    // tile = dlaždice na domovské obrazovce, text = ikony, accent = okraj hlavičky, on = vybraná volba, tab = vybraná záložka
    const TOPIC_STYLES = {
        emerald: {
            soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300', solid: 'border-emerald-500 bg-emerald-700',
            button: 'bg-emerald-700 hover:bg-emerald-800 shadow-emerald-700/25', tile: 'from-emerald-700 to-emerald-800', text: 'text-emerald-700 dark:text-emerald-400',
            accent: 'border-emerald-500', on: 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200', tab: 'bg-emerald-700 text-white'
        },
        amber: {
            soft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', solid: 'border-amber-500 bg-amber-700',
            button: 'bg-amber-700 hover:bg-amber-800 shadow-amber-700/25', tile: 'from-amber-700 to-orange-800', text: 'text-amber-700 dark:text-amber-400',
            accent: 'border-amber-500', on: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200', tab: 'bg-amber-700 text-white'
        },
        lime: {
            soft: 'bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300', solid: 'border-lime-500 bg-lime-700',
            button: 'bg-lime-700 hover:bg-lime-800 shadow-lime-700/25', tile: 'from-lime-700 to-green-800', text: 'text-lime-700 dark:text-lime-400',
            accent: 'border-lime-500', on: 'border-lime-500 bg-lime-50 text-lime-800 dark:bg-lime-900/30 dark:text-lime-200', tab: 'bg-lime-700 text-white'
        },
        sky: {
            soft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300', solid: 'border-sky-500 bg-sky-700',
            button: 'bg-sky-700 hover:bg-sky-800 shadow-sky-700/25', tile: 'from-sky-700 to-blue-800', text: 'text-sky-700 dark:text-sky-400',
            accent: 'border-sky-500', on: 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200', tab: 'bg-sky-700 text-white'
        },
        violet: {
            soft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', solid: 'border-violet-500 bg-violet-700',
            button: 'bg-violet-700 hover:bg-violet-800 shadow-violet-700/25', tile: 'from-violet-700 to-purple-800', text: 'text-violet-700 dark:text-violet-400',
            accent: 'border-violet-500', on: 'border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200', tab: 'bg-violet-700 text-white'
        },
        rose: {
            soft: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', solid: 'border-rose-500 bg-rose-700',
            button: 'bg-rose-700 hover:bg-rose-800 shadow-rose-700/25', tile: 'from-rose-700 to-rose-800', text: 'text-rose-700 dark:text-rose-400',
            accent: 'border-rose-500', on: 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200', tab: 'bg-rose-700 text-white'
        },
        pink: {
            soft: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300', solid: 'border-pink-500 bg-pink-700',
            button: 'bg-pink-700 hover:bg-pink-800 shadow-pink-700/25', tile: 'from-pink-700 to-rose-800', text: 'text-pink-700 dark:text-pink-400',
            accent: 'border-pink-500', on: 'border-pink-500 bg-pink-50 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200', tab: 'bg-pink-700 text-white'
        },
        teal: {
            soft: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300', solid: 'border-teal-500 bg-teal-700',
            button: 'bg-teal-700 hover:bg-teal-800 shadow-teal-700/25', tile: 'from-teal-700 to-cyan-800', text: 'text-teal-700 dark:text-teal-400',
            accent: 'border-teal-500', on: 'border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200', tab: 'bg-teal-700 text-white'
        },
        orange: {
            soft: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300', solid: 'border-orange-500 bg-orange-700',
            button: 'bg-orange-700 hover:bg-orange-800 shadow-orange-700/25', tile: 'from-orange-700 to-red-800', text: 'text-orange-700 dark:text-orange-400',
            accent: 'border-orange-500', on: 'border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200', tab: 'bg-orange-700 text-white'
        },
        blue: {
            soft: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', solid: 'border-blue-500 bg-blue-700',
            button: 'bg-blue-700 hover:bg-blue-800 shadow-blue-700/25', tile: 'from-blue-700 to-indigo-800', text: 'text-blue-700 dark:text-blue-400',
            accent: 'border-blue-500', on: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200', tab: 'bg-blue-700 text-white'
        },
        indigo: {
            soft: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300', solid: 'border-indigo-500 bg-indigo-700',
            button: 'bg-indigo-700 hover:bg-indigo-800 shadow-indigo-700/25', tile: 'from-indigo-700 to-violet-900', text: 'text-indigo-700 dark:text-indigo-400',
            accent: 'border-indigo-500', on: 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200', tab: 'bg-indigo-700 text-white'
        },
        red: {
            soft: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300', solid: 'border-red-500 bg-red-700',
            button: 'bg-red-700 hover:bg-red-800 shadow-red-700/25', tile: 'from-red-700 to-red-900', text: 'text-red-700 dark:text-red-400',
            accent: 'border-red-500', on: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200', tab: 'bg-red-700 text-white'
        },
        stone: {
            soft: 'bg-stone-100 text-stone-700 dark:bg-stone-900/50 dark:text-stone-300', solid: 'border-stone-500 bg-stone-700',
            button: 'bg-stone-700 hover:bg-stone-800 shadow-stone-700/25', tile: 'from-stone-700 to-stone-800', text: 'text-stone-700 dark:text-stone-300',
            accent: 'border-stone-500', on: 'border-stone-500 bg-stone-50 text-stone-800 dark:bg-stone-900/30 dark:text-stone-200', tab: 'bg-stone-700 text-white'
        },
        yellow: {
            soft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', solid: 'border-yellow-500 bg-yellow-700',
            button: 'bg-yellow-700 hover:bg-yellow-800 shadow-yellow-700/25', tile: 'from-yellow-700 to-amber-900', text: 'text-yellow-700 dark:text-yellow-400',
            accent: 'border-yellow-500', on: 'border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200', tab: 'bg-yellow-700 text-white'
        },
        // Mix ze všech témat: vínová barva loga
        brand: {
            soft: 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200', solid: 'border-brand-500 bg-brand-700',
            button: 'bg-brand-700 hover:bg-brand-800 shadow-brand-700/25', tile: 'from-brand-700 to-brand-900', text: 'text-brand-700 dark:text-brand-300',
            accent: 'border-brand-600', on: 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100', tab: 'bg-brand-700 text-white'
        }
    };
    // Vlastní ilustrované ikony témat (icons/topics/<téma>.webp); téma bez ní má čárovou ikonu
    const TOPIC_ART = new Set(['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport', 'mix']);
    const topicArt = (topic) => topic && TOPIC_ART.has(topic.id);
    // Ikona tématu: ilustrace (cls = velikost, např. h-8 w-8) nebo čárová ikona; wrap = obal čárové ikony (barevný čtverec)
    const topicIcon = (topic, cls, wrap = '', iconCls = cls) => topicArt(topic)
        ? `<img src="icons/topics/${topic.id}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-md">`
        : `${wrap ? `<span class="${wrap}">` : ''}<i data-lucide="${topic.icon}" class="${iconCls}"></i>${wrap ? '</span>' : ''}`;
    // Ilustrace ovládacích prvků (icons/topics/<název>.webp): chyby, dnes, vyzva, napoveda, stopky
    const uiArt = (name, cls) => `<img src="icons/topics/${name}.webp" alt="" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    const styleOf = (topic) => TOPIC_STYLES[topic && topic.color] || TOPIC_STYLES.emerald;
    const MIX = { id: 'mix', title: 'Mix', icon: 'shuffle', color: 'brand' };
    const TAB_OFF = 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700';

    // Ikony: zástupné <i data-lucide="…"> nahradíme SVG z icons.js (podmnožina Lucide)
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SVG_ATTRIBUTES = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    const renderIcons = (root = document) => {
        root.querySelectorAll('i[data-lucide]').forEach(placeholder => {
            const iconNode = (window.MUDRLANT_ICONS || {})[placeholder.dataset.lucide];
            if (!iconNode) return;
            const svg = document.createElementNS(SVG_NS, 'svg');
            Object.entries(SVG_ATTRIBUTES).forEach(([name, value]) => svg.setAttribute(name, value));
            svg.setAttribute('class', `lucide lucide-${placeholder.dataset.lucide} ${placeholder.getAttribute('class') || ''}`.trim());
            if (placeholder.id) svg.id = placeholder.id;
            for (const [tag, attributes] of iconNode) {
                const child = document.createElementNS(SVG_NS, tag);
                Object.entries(attributes).forEach(([name, value]) => child.setAttribute(name, value));
                svg.appendChild(child);
            }
            placeholder.replaceWith(svg);
        });
    };

    // Tab v otevřeném okně zůstane uvnitř (ovládání klávesnicí a čtečkou obrazovky)
    const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trapFocus = (overlay) => overlay.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const focusable = [...overlay.querySelectorAll(FOCUSABLE)];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    });

    const showToast = (message) => {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.setAttribute('role', 'status');
            // Nad přilepeným tlačítkem Další a bez zachytávání klepnutí, ať ho nezakryje
            toast.className = 'pointer-events-none fixed bottom-24 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white opacity-0 shadow-lg transition-opacity duration-300 dark:bg-white dark:text-slate-900';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.remove('opacity-0');
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => toast.classList.add('opacity-0'), 2500);
    };

    // --- Data: témata, tabulka států a obrysy států (vlastní soubory, service worker je drží i bez internetu) ---

    // Při výpadku, omezení (429) nebo zaseknutém spojení zkusí dotaz znovu, pak to vzdá jako chybu spojení
    const fetchJson = async (url, attempts = 3, timeout = REQUEST_TIMEOUT) => {
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 800 * attempt));
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { signal: controller.signal });
                if (response.ok) return await response.json();
                lastError = new Error(`HTTP ${response.status}`);
            } catch (e) {
                lastError = e;
            } finally {
                clearTimeout(timer);
            }
        }
        throw new NetworkError(lastError ? lastError.message : 'Síťová chyba');
    };

    // Při chybě se příslib zahodí, aby další pokus soubor stáhl znovu
    const memoizeBy = (load) => {
        const cache = new Map();
        return (key = '') => {
            if (!cache.has(key)) cache.set(key, load(key).catch(error => { cache.delete(key); throw error; }));
            return cache.get(key);
        };
    };
    const loadCountries = memoizeBy(() => fetchJson('data/countries.json').then(data => data.countries));
    const loadWorld = memoizeBy(() => fetchJson('data/world.json'));
    // Fotky, na kterých je napsaná odpověď (jméno na dresu, název na plakátu) – najde je OCR při sestavení dat
    // (npm run audit:photo-text); bez souboru se hraje dál se všemi fotkami
    const loadPhotoText = memoizeBy(() => fetchJson('data/photo-text.json').catch(() => ({})));
    // Kde přesně je odpověď napsaná (npm run audit:photo-masks): taková fotka se ukáže s rozmazaným nápisem
    let photoMasks = {};
    const loadPhotoMasks = memoizeBy(() => fetchJson('data/photo-masks.json').catch(() => ({})).then(data => { photoMasks = data || {}; return photoMasks; }));
    // Kontext tématu: definice, položky, okruhy a tabulka států; po načtení dostupný i synchronně
    const loadedTopics = new Map();
    const loadTopic = memoizeBy(async (topicId) => {
        const topic = TOPIC_BY_ID[topicId];
        if (!topic) throw new Error(`Neznámé téma ${topicId}`);
        const [data, countries, photoText] = await Promise.all([fetchJson(topic.dataFile), loadCountries(), loadPhotoText(), loadPhotoMasks()]);
        // Kontinenty států pro výběr nesprávných možností ze stejné kultury
        setCountries(countries);
        const ctx = { topic, items: data.items, collections: data.collections || [], countries, byId: new Map(data.items.map(item => [item.q, item])) };
        // Fotka s napsanou odpovědí, kterou neumíme zakrýt (OCR nápis našlo, ale ne jeho polohu), se jako nápověda nenabídne
        ctx.textPhotos = new Set((photoText[topicId] || []).map(id => (ctx.byId.get(id) || {}).im).filter(file => file && !photoMasks[file]));
        loadedTopics.set(topicId, ctx);
        return ctx;
    });
    const visualDeps = { loadWorld: () => loadWorld() };

    // Úvod článku z české Wikipedie; bez spojení aspoň krátký popis z Wikidat, ať jde hrát dál.
    // Úspěšně stažené úvody si pamatujeme, ať se atlas a okno s popisem neptají Wikipedie znovu.
    const itemTexts = new Map();
    const fetchItemText = async (item) => {
        if (itemTexts.has(item.t)) return itemTexts.get(item.t);
        try {
            // Zaseknutá Wikipedie nesmí zdržet otázku dlouho: dva pokusy po 6 s, pak krátký popis z Wikidat
            const data = await fetchJson(`${WIKI_API}&action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&redirects=1&titles=${encodeURIComponent(item.t)}`, 2, WIKI_TIMEOUT);
            const page = Object.values((data.query && data.query.pages) || {})[0];
            if (page && page.extract && page.extract.length > 40) {
                const text = processWikiText(page.extract);
                itemTexts.set(item.t, text);
                return text;
            }
        } catch (e) {
            console.error(e);
        }
        const shortDescription = item.d ? `${item.d.charAt(0).toUpperCase()}${item.d.slice(1)}.` : '';
        return { description: shortDescription, funFacts: [], more: '', fallback: true };
    };

    const loadImage = (url) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(url);
        image.onerror = reject;
        image.src = url;
    });

    // Fotku ověříme předem – nápověda, která se nenačte, by jen sebrala bod
    const probePhoto = (url) => !url ? Promise.resolve(null) : Promise.race([
        loadImage(url).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), PHOTO_TIMEOUT))
    ]);
    const photoOf = (item, width) => isRealPhoto(item.im) && item.ih ? commonsPhotoUrl(item.im, item.ih, width) : null;

    const categoryOf = (topic, key) => topic.categories.find(category => category.key === key) || { key, label: key, one: topic.words.one, icon: topic.icon };

    // Zajímavost z dalších vět článku jen tehdy, když mluví o hádané položce – věta vytržená z kontextu
    // („Doprovázejí boha Rea…“, „Část odborníků se k tomuto výkladu kloní…“) by nedávala smysl
    const relevantFacts = (facts, item) => (facts || []).filter(fact => !OUT_OF_CONTEXT.test(fact)
        && censorName(fact, [item.n, displayName(item.t)].join(', ')).includes('[***]'));

    // Nápovědy otázky: téma je pro svůj druh otázky může určit samo (u století současníci a osa bez letopočtů,
    // u vzorce složení), jinak fotka → obrazová nápověda → čísla a fakta. Nápověda, která nic nepřidá, se vynechá:
    // fotka, která se nenačte, prázdná fakta i fakta, která hráč už vidí v zadání nebo v popisu.
    // shared = fakta, která mají stejná všechny nabízené nesprávné možnosti (třída savci u čtyř savců) – mezi nimi nerozhodnou
    // answers = odpovědi, které nápověda nesmí prozradit (u otázky na název jméno položky, u řádu řád…)
    // Časová osa, jejíž roky už jsou v popisu („v roce 1960“), nic nepřidá
    const timelineVisible = (spec, text) => {
        if (spec.type !== 'timeline' || spec.blind) return false;
        const years = [...(spec.points || []), ...(spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100);
        return years.length > 0 && years.every(year => new RegExp(`(?<!\\d)${year}(?!\\d)`).test(text));
    };
    const buildHints = (plan, { photoUrl, visibleText, shared = new Set(), answers = [], textPhotos = new Set(), omit = [], rootCheck = false, extraGeneric = null }) => {
        // Fakt prozradí odpověď i tehdy, když obsahuje kterýkoli její tvar nebo začíná stejným kořenem jako jméno
        // (Těží se z něj: antimon u Antimonitu); společná kontrola s popisem (factRevealsAnswer)
        const rootNames = rootCheck && answers.length ? specificWords(answers, extraGeneric) : '';
        const revealsAnswer = (fact) => factRevealsAnswer(fact, answers, { isGeneric: (word) => isGenericWord(word, extraGeneric), rootNames });
        const hints = [];
        // Co už dřívější nápovědy řekly (roky na časové ose, hodnoty faktů): další krok to nesmí opakovat
        let shownBefore = '';
        for (const step of plan) {
            let hint = null;
            if (step.kind === 'photo' && photoUrl) hint = { kind: 'photo', label: 'fotka', icon: 'image' };
            // Další věty z úvodu článku (bez jména), když je popis zkrácený a text má pokračování
            if (step.kind === 'excerpt' && step.text) hint = { kind: 'excerpt', text: step.text, label: 'další věty', icon: 'book-open' };
            // Obrázek s napsanou odpovědí (portrét autora se jménem) nápovědou není
            const textImage = step.spec && step.spec.type === 'image' && textPhotos.has(step.spec.file);
            if (step.kind === 'visual' && step.spec && Visuals.info(step.spec) && !timelineVisible(step.spec, visibleText) && !scaleKnown(step.spec, visibleText) && !textImage) {
                const masks = step.spec.type === 'image' && photoMasks[step.spec.file];
                // Událost na časové ose se jménem odpovědi (autor, režisér) by ji prozradila: vynechá se jako události s hádanou položkou
                const spec = step.spec.type === 'timeline' && answers.length ? { ...step.spec, hide: [step.spec.hide, ...answers].filter(Boolean).join(', ') } : step.spec;
                hint = { kind: 'visual', spec: masks ? { ...spec, masks } : spec, label: Visuals.info(step.spec).name, icon: Visuals.info(step.spec).icon };
            }
            if (step.kind === 'facts') {
                // omit = jména nesprávných možností (Sourozenci: Chiméra, Hydra u Kerberose by je vyřadili)
                const facts = dropChoiceNames(dropKnownFacts(step.facts || [], step.label ? visibleText : `${visibleText} · ${shownBefore}`), omit)
                    .filter(fact => (step.label || !shared.has(`${fact.label}\u0000${fact.value}`)) && !revealsAnswer(fact));
                // extra = vlastní nápověda tématu; po odpovědi se ukáže i mezi fakty
                if (facts.length) hint = { kind: 'facts', facts, label: step.label || 'čísla a fakta', icon: step.icon || 'info', extra: Boolean(step.label) };
            }
            if (!hint) continue;
            if (hint.kind === 'facts') shownBefore += ` · ${hint.facts.map(fact => fact.value).join(' · ')}`;
            if (hint.kind === 'visual' && hint.spec.type === 'timeline' && !hint.spec.blind) {
                shownBefore += ` · ${[...(hint.spec.points || []), ...(hint.spec.spans || []).flatMap(span => [span.from, span.to])].filter(year => Number.isFinite(year) && year >= 100).join(' · ')}`;
            }
            let key = hint.kind;
            for (let n = 2; hints.some(other => other.key === key); n++) key = `${hint.kind}-${n}`;
            hints.push({ key, ...hint });
        }
        return hints;
    };
    // Otázka uložená starší verzí má nápovědy jen jako názvy kroků ('photo', 'visual', 'facts')
    const upgradeRoundData = (data) => {
        if (data && Array.isArray(data.hints) && data.hints.some(step => typeof step === 'string')) {
            data.hints = buildHints(data.hints.map(step => step === 'visual' ? { kind: 'visual', spec: data.visual } : step === 'facts' ? { kind: 'facts', facts: data.facts } : { kind: step }),
                { photoUrl: data.photoUrl, visibleText: '' });
        }
        return data;
    };

    // Data jedné otázky – vše, co se uloží a po obnovení stránky zobrazí znovu
    // Kolik slov skutečného textu (bez zakrytých míst) má popis mít, aby z něj šla odpověď poznat nebo aspoň odhadnout
    const MIN_DESCRIPTION_WORDS = 14;
    const realWords = (text) => String(text || '').replace(/\[\*\*\*\]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word)).length;
    const MAX_THIN_RETRIES = 3;
    const MIN_EXCERPT_WORDS = 8;
        const createRoundData = async (item, ctx, rng) => {
        const { topic, items } = ctx;
        // Pořadí volání rng je stálé, aby dnešní otázka vyšla všem stejně
        const special = topic.specialQuestion ? topic.specialQuestion(item, ctx, rng) : null;
        const category = categoryOf(topic, item.c);
        const question = special || {
            type: 'name',
            title: category.question || topic.words.question,
            showName: false,
            // Nesprávné možnosti co nejpodobnější (podle tématu), aby správná nebyla poznat na první pohled
            choices: buildItemChoices(item, items, rng, other => topic.similarity ? topic.similarity(item, other, ctx) : 0, cultureLandsFor(topic, ctx)),
            accepted: nameAnswers(item, topic.nameAliases ? topic.nameAliases(item, ctx) : []),
            placeholder: category.placeholder || topic.words.placeholder,
            answerLabel: item.n
        };
        // Fotka je až nápověda: otázka na ni nečeká déle než PHOTO_WAIT; když se do té doby nenačte, počítá se s ní
        // a načítá se dál (jen fotka, která se prokazatelně nenačetla, z nápověd vypadne)
        const photoProbe = probePhoto(photoOf(item, 960));
        // Obrázek, na který se otázka ptá (obraz, vlajka, nerost), je vidět hned – bez něj otázka nedává smysl, proto
        // se na něj počká; když Commons náhled nevrátí (malý původní soubor), použije se původní soubor
        const shown = topic.questionImage ? topic.questionImage(item, ctx, question.type) : null;
        const shownUrl = shown ? (await probePhoto(commonsPhotoUrl(shown.file, shown.hash, 960)) || await probePhoto(commonsFileUrl(shown.file, shown.hash))) : null;
        const fetchedText = await fetchItemText(item);
        // Popis i další věty úvodu bez odpovědi (společné zakrytí všech tvarů jména); popis, který je po zakrytí skoro samá mezera
        // („[***] práci konanou [***] silou“), nahradí další věty úvodu, a když nic nezbude, vypadne
        const { text, questionText, moreText } = buildQuestionTexts(item, ctx, question, fetchedText, { special: Boolean(special) });
        const settled = await Promise.race([photoProbe.then(result => ({ result })), new Promise(resolve => setTimeout(() => resolve(null), PHOTO_WAIT))]);
        const photoUrl = settled ? settled.result : photoOf(item, 960);
        const visual = topic.visual ? topic.visual(item, ctx, question.type) : null;
        // Typ položky („obec ve Španělsku“, „král“) nesmí prozradit odpověď
        const typeLabel = item.ty && !hideAnswer(item.ty, question, { ...item, ty: '' }, ctx).includes('[***]') ? item.ty : category.one;
        // Příliš chudý popis („Zimbabwský politik.“) nestačí k odpovědi: když je popis jediná opora otázky, je „thin“
        const thin = !shown && !special && (text.fallback || realWords(questionText) < MIN_DESCRIPTION_WORDS);
        const basePlan = (topic.hints && topic.hints(item, ctx, question.type))
            || [{ kind: 'photo' }, { kind: 'visual', spec: visual }, { kind: 'facts', facts: topic.facts(item, ctx, question.type) }];
        // Pokračování úvodu článku (zakryté stejně jako popis) je první, nejlevnější nápověda; bez dost skutečných slov se vynechá
        const plan = realWords(moreText) >= MIN_EXCERPT_WORDS ? [{ kind: 'excerpt', text: moreText }, ...basePlan] : basePlan;
        const visibleText = [question.title, question.showName ? item.n : '', typeLabel, questionText, realWords(moreText) >= MIN_EXCERPT_WORDS ? moreText : ''].join(' · ');
        // Fakt, který mají všechny nesprávné možnosti stejný jako správná, mezi nimi nepomůže vybrat
        const wrongItems = question.type === 'name' ? question.choices.filter(choice => !choice.correct).map(choice => ctx.byId.get(choice.id)).filter(Boolean) : [];
        const factKeys = (other) => new Set(topic.facts(other, ctx, question.type).map(fact => `${fact.label}\u0000${fact.value}`));
        const wrongFacts = wrongItems.map(factKeys);
        const shared = new Set(wrongFacts.length ? [...factKeys(item)].filter(key => wrongFacts.every(keys => keys.has(key))) : []);
        let hints = buildHints(plan, { photoUrl: (shown && shown.file === item.im) || (ctx.textPhotos && ctx.textPhotos.has(item.im)) ? null : photoUrl,
            visibleText, shared, answers: answerNamesFor(question, item, ctx), textPhotos: ctx.textPhotos || new Set(),
            rootCheck: question.type === 'name', extraGeneric: genericWordsOf(ctx),
            omit: question.match ? [] : (question.choices || []).filter(choice => !choice.correct).map(choice => choice.label) });
        let leadFacts = [];
        if (thin) ({ hints, leadFacts } = takeLeadFacts(hints));
        return {
            topic: topic.id,
            id: item.q,
            title: item.t,
            name: item.n,
            category: item.c,
            known: item.k === 1,
            typeLabel,
            question,
            questionText,
            photoUrl,
            // label a icon = záložka obrázku (Obraz, Vlajka…); url null = obrázek se nenačetl
            questionImage: shown ? { url: shownUrl, label: shown.label || 'Obrázek', icon: shown.icon || 'image', same: shown.file === item.im, masks: photoMasks[shown.file] || null } : null,
            // Rozmazané nápisy s odpovědí na fotce nápovědy (jen před odpovědí)
            photoMasks: photoMasks[item.im] || null,
            visual,
            // Ve výsledku už odpověď známe, takže nápověda může ukázat vše (u otázky na století časovou osu)
            resultVisual: topic.visual ? topic.visual(item, ctx, 'result') : null,
            resultFacts: topic.facts(item, ctx, 'result'),
            // Fotka, kterou otázka ukazuje hned, už nápovědou není; fotka s napsanou odpovědí také ne
            hints,
            leadFacts,
            subtitle: topic.subtitle(item, ctx),
            coords: topic.coords ? topic.coords(item, ctx) : null,
            isCzech: Boolean(topic.isCzech && topic.isCzech(item, ctx)),
            description: text.description,
            thin,
            funFacts: relevantFacts(text.funFacts, item)
        };
    };

    // --- Varianta hry a nastavení ---

    const readVariant = () => {
        try {
            const variant = localStorage.getItem(KEYS.variant);
            return VARIANTS[variant] ? variant : null;
        } catch (e) {
            return null;
        }
    };
    const saveVariant = (variant) => {
        try { localStorage.setItem(KEYS.variant, variant); } catch (e) {}
    };

    const renderVariantCards = (selected) => Object.entries(VARIANTS).map(([key, variant]) => `
        <button type="button" data-variant="${key}" aria-pressed="${selected === key}" class="btn-3d-light flex w-full items-start gap-4 rounded-2xl p-4 text-left ${selected === key ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : 'bg-white dark:bg-slate-800'}">
            <span class="shrink-0 rounded-xl bg-brand-100 p-2.5 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"><i data-lucide="${variant.icon}" class="h-6 w-6"></i></span>
            <span>
                <span class="block font-black text-slate-800 dark:text-slate-100">${variant.title}</span>
                <span class="mt-1 block text-sm leading-snug text-slate-500 dark:text-slate-400">${variant.text}</span>
            </span>
        </button>`).join('');

    // Při prvním spuštění si hráč vybere variantu hry, než uvidí první otázku
    const renderVariantWelcome = () => {
        screen = 'welcome';
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full flex-col justify-center gap-4 p-6">
                <div class="mb-2 text-center">
                    <img src="icons/topics/sova-premysleni.webp" alt="" class="mx-auto mb-3 h-36 w-36 object-contain drop-shadow-lg">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-slate-50">Vítej v Mudrlantovi</h2>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Kvíz ze zeměpisu a dalších oborů. Jak chceš odpovídat? Změníš to kdykoli v nastavení vpravo nahoře.</p>
                </div>
                <div id="variant-welcome" class="flex flex-col gap-3">${renderVariantCards(null)}</div>
                <p class="mt-2 text-center text-xs text-slate-500 dark:text-slate-400"><a href="soukromi.html" class="rounded-lg px-1.5 py-2 font-bold underline underline-offset-2">Ochrana osobních údajů</a> · <a href="licence.html" class="rounded-lg px-1.5 py-2 font-bold underline underline-offset-2">Zdroje a licence</a></p>
            </div>`;
        renderIcons(appContent);
        updateControlsUI();
    };

    const SETTINGS_HEADING = 'text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const TOGGLE_ON = 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100';
    const TOGGLE_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-600';

    const renderTierButtons = (on = TOGGLE_ON, topic = null) => Object.entries(TIERS).map(([key, tier]) => `
        <button type="button" data-tier="${key}" aria-pressed="${settings.tier === key}" class="rounded-2xl border-2 p-3 text-left transition-colors active:scale-[0.98] ${settings.tier === key ? on : TOGGLE_OFF}">
            <span class="block text-sm font-black">${tier.title}</span>
            <span class="mt-0.5 block text-xs leading-snug opacity-90">${key === 'known' && topic && topic.words && topic.words.tierKnown ? escapeHtml(topic.words.tierKnown) : tier.text}</span>
        </button>`).join('');

    const closeSettings = () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.remove();
        meDraft = null;
        meDirty = false;
        meNote = '';
    };

    // Účet (Supabase, přihlášení Google): bez nastavené config.js se přihlášení vůbec nenabízí a hraje se jako host
    const Auth = window.MudrlantAuth;

    // Verze: version.json zapíše nasazení (čas posledního commitu a jeho zkratka), ať je v Nastavení vidět, jestli už běží
    // nejnovější verze; načítá se vždy ze sítě, bez internetu ta uložená
    let appVersion = null;
    const versionLabel = () => {
        if (!appVersion) return 'Verze: načítá se…';
        if (!appVersion.built) return 'Verze: vývojová';
        const built = new Date(appVersion.built);
        const date = built.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
        const time = built.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
        return `Verze z ${date} ${time}${appVersion.commit ? ` · ${appVersion.commit}` : ''}`;
    };
    const loadVersion = () => fetch('version.json', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : {})
        .catch(() => ({}))
        .then(data => {
            appVersion = data && typeof data === 'object' ? data : {};
            // Hlášení chyb z provozu nese verzi aplikace (zkratku commitu)
            if (window.MudrlantMonitor) window.MudrlantMonitor.setVersion(appVersion.commit || (appVersion.built ? 'bez-commitu' : 'vyvojova'));
            const element = document.getElementById('app-version');
            if (element) element.textContent = versionLabel();
        });

    let swReloading = false;
    const checkForUpdate = () => ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration
        ? navigator.serviceWorker.getRegistration().then(registration => registration && registration.update()).catch(() => {})
        : Promise.resolve());
    // Tlačítko v Nastavení: zeptá se na novou verzi a stránku obnoví (s novým service workerem se obnoví sama)
    const updateApp = async () => {
        const button = document.querySelector('[data-update-app]');
        if (button) {
            button.disabled = true;
            button.textContent = 'Aktualizuji…';
        }
        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
        if (registration) {
            await Promise.race([registration.update().catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))]);
            // Nová verze se instaluje: stránku obnoví převzetí novým service workerem (jen jednou), jinak obnovit hned
            if (registration.installing || registration.waiting) {
                await new Promise(resolve => {
                    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                    setTimeout(resolve, 8000);
                });
            }
        }
        if (!swReloading) {
            swReloading = true;
            window.location.reload();
        }
    };

    // Už otevřené okno se jen překreslí na místě: bez úvodní animace a na stejném místě posunutí
    // Jedno okno „Já“: nahoře hráč (obrázek, přezdívka, úroveň), pod tím záložky Hra (varianta, známost) a Profil (přezdívka,
    // obrázek, barva, odhlášení); bez přihlášení jen Hra a nabídka přihlášení. Vše se vejde bez posouvání.
    let meTab = 'game';
    // Upozornění (push.js): stav tohoto zařízení a volby, co posílat; zjišťují se při otevření Nastavení
    const Push = window.MudrlantPush;
    let pushState = null;
    let pushPrefs = null;
    let pushBusy = false;
    let meDraft = null;
    let meDirty = false;
    let meNote = '';
    // Okno Moje data a soukromí: '' (nabídka), 'confirm' (čeká na potvrzení smazání), 'busy' (probíhá)
    let privacyState = '';
    // Vývojářský režim: ?vyvojar v adrese ho zapne (a uloží); v Nastavení pak jdou nastavit úroveň a odznaky, ať je vidět, jak vypadá
    // hra s nimi. Původní postup se zazálohuje, vrací se tlačítkem a při vývojářském postupu se nic neukládá do účtu.
    const DEV_KEY = 'mudrlant.dev';
    const DEV_BACKUP = 'mudrlant.dev.backup';
    const DEV_LEARNED_BACKUP = 'mudrlant.dev.backup.learned';
    const devOn = () => { try { return localStorage.getItem(DEV_KEY) === '1'; } catch (e) { return false; } };
    const devActive = () => { try { return localStorage.getItem(DEV_BACKUP) !== null; } catch (e) { return false; } };
    const devApply = (kind) => {
        try {
            if (kind === 'restore') {
                const backup = localStorage.getItem(DEV_BACKUP);
                if (backup !== null) { if (backup === 'null') localStorage.removeItem(KEYS.progress); else localStorage.setItem(KEYS.progress, backup); localStorage.removeItem(DEV_BACKUP); }
                // Poznané položky se vrátí také (vývojářské „Vše“ je přepisuje); bez zálohy se vymyšlené jen odstraní
                const learnedBackup = localStorage.getItem(DEV_LEARNED_BACKUP);
                if (learnedBackup !== null) { if (learnedBackup === 'null') localStorage.removeItem(KEYS.learned); else localStorage.setItem(KEYS.learned, learnedBackup); localStorage.removeItem(DEV_LEARNED_BACKUP); }
                else writeJson(KEYS.learned, loadLearned());
                return;
            }
            if (localStorage.getItem(DEV_BACKUP) === null) { localStorage.setItem(DEV_BACKUP, localStorage.getItem(KEYS.progress) ?? 'null'); localStorage.setItem(DEV_LEARNED_BACKUP, localStorage.getItem(KEYS.learned) ?? 'null'); }
            const progress = loadProgress();
            const today = getDayKey();
            const allBadges = () => Object.fromEntries(BADGES.map(badge => [badge.id, today]));
            const topics = Object.fromEntries(TOPICS.map(topic => [topic.id, 400]));
            if (kind === 'max') {
                Object.assign(progress, { xp: xpForLevel(MAX_LEVEL), badges: allBadges() });
                progress.counters = normalizeCounters({ answered: 15000, correct: 12000, typedCorrect: 800, noHint: 1000, hardCorrect: 300, bestRun: 120, bestStreak: 400, perfectDays: 40, dailyCorrect: 400, fixed: 300,
                    challenges: 150, wins: 120, bestWinRun: 12, created: 60, perfectChallenges: 30, days: 400, lastDay: today, topics });
                const learned = {};
                TOPICS.forEach(topic => { learned[topic.id] = Array.from({ length: 320 }, (_, i) => `dev${i}`); });
                writeJson(KEYS.learned, learned);
            } else if (kind === 'badges') progress.badges = allBadges();
            else if (kind === 'nobadges') progress.badges = {};
            else if (kind === 'nostars') { writeJson(KEYS.learned, {}); localStorage.setItem(DEV_LEARNED_BACKUP, '{}'); }
            else if (kind.startsWith('level:')) progress.xp = xpForLevel(Number(kind.slice(6)));
            saveProgress(progress);
        } catch (e) { console.error(e); }
    };
    // Vývojářské nástroje turnajů: boti, okamžitý start, skok o kolo, mazání botů (databáze je pustí jen účtu v dev_admins)
    const devTournamentAction = async (kind) => {
        if (!Social || !signedUser()) { showToast('Nejdřív se přihlas.'); return; }
        try {
            await Social.tournamentTick();
            const list = (await Social.getTournaments()) || [];
            const open = list.find(item => item.status === 'open');
            const running = list.find(item => item.status === 'running');
            let message = '';
            if (kind === 'tour-bots') {
                if (!open) throw new Error('Žádný turnaj s otevřenými přihláškami není.');
                const made = await Social.devTournament('dev_tournament_add_bots', { tid: open.id, how_many: 31 });
                message = `Přidáno botů: ${Number(made) || 0}`;
            } else if (kind === 'tour-start') {
                if (!open) throw new Error('Žádný turnaj s otevřenými přihláškami není.');
                await Social.devTournament('dev_tournament_start_now', { tid: open.id });
                message = 'Turnaj běží, boti odehráli 1. kolo';
            } else if (kind === 'tour-next') {
                if (!running) throw new Error('Žádný turnaj neběží.');
                await Social.devTournament('dev_tournament_next_round', { tid: running.id });
                message = 'Posun o kolo, boti odehráli';
            } else if (kind === 'tour-reset') {
                const removed = await Social.devTournament('dev_tournament_reset', {});
                resetTournaments();
                message = `Smazáno turnajů: ${Number(removed) || 0}, přihlášky jsou znovu otevřené`;
            } else if (kind === 'tour-clear') {
                const removed = await Social.devTournament('dev_tournament_clear_bots', {});
                resetTournaments();
                message = `Smazáno botů: ${Number(removed) || 0}`;
            }
            showToast(message);
        } catch (error) {
            showToast(error && error.message ? error.message : 'Nástroj turnajů selhal.');
        }
        refreshTournaments({ force: true });
    };
    // Chyby z provozu (monitor.js → client_errors): posledních 50 seskupených podle otisku, jen pro účet v dev_admins
    const openClientErrors = async () => {
        if (!Social || !signedUser()) { showToast('Nejdřív se přihlas.'); return; }
        showDialog('Chyby z provozu', '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>');
        let rows = [];
        try { rows = await Social.devClientErrors(); } catch (error) {
            if (document.getElementById('dialog-overlay')) showDialog('Chyby z provozu', `<p class="text-sm font-semibold text-rose-700 dark:text-rose-400" role="alert">${escapeHtml(error && error.message ? error.message : 'Načtení se nepodařilo.')}</p>`);
            return;
        }
        if (!document.getElementById('dialog-overlay')) return;
        const when = (text) => { const date = new Date(text); return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleDateString('cs-CZ')} ${date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`; };
        const list = rows.length ? `<ul id="client-errors" class="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto">${rows.map(row => `
            <li data-error-hash="${escapeHtml(row.hash)}" class="rounded-xl bg-white p-2.5 text-[12px] shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
                <p class="flex items-center justify-between gap-2"><span class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">${Number(row.count) || 1}×</span><span class="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(when(row.last_at))}${row.app_version ? ` · ${escapeHtml(row.app_version)}` : ''}${row.kind === 'rejection' ? ' · promise' : ''}</span></p>
                <p class="mt-1 break-words font-bold text-slate-800 dark:text-slate-100">${escapeHtml(row.message || '')}</p>
                ${row.stack ? `<pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(row.stack)}</pre>` : ''}
                <p class="mt-1 break-all text-[10px] text-slate-500 dark:text-slate-400">${escapeHtml(row.url || '')}${row.user_agent ? `<br>${escapeHtml(row.user_agent)}` : ''}</p>
            </li>`).join('')}</ul>` : '<p id="client-errors" class="text-sm text-slate-500 dark:text-slate-400">Žádné hlášené chyby.</p>';
        showDialog('Chyby z provozu', `<div class="flex flex-col gap-2"><p class="text-xs text-slate-500 dark:text-slate-400">Posledních 50 chyb z aplikací hráčů, seskupených podle stejné zprávy a zásobníku. Bez osobních údajů.</p>${list}</div>`);
    };
    // Verze schématu: aplikace starší než databáze („Aktualizuj stránku“, hlásí se každému) a databáze starší než aplikace („Databáze není aktuální“:
    // upozornění dostane každý jednou denně, správce (dev_admins nebo vývojářský režim) navíc v Nastavení návod, co spustit)
    const SCHEMA_SEEN_KEY = 'mudrlant.schemaSeen';
    let schemaOutdated = null; // { have, need } nebo null
    let schemaNoticeClosed = false;
    const SCHEMA_NOTICE = {
        client: { text: 'Aplikace je starší než databáze. Aktualizuj stránku, ať všechno funguje.', action: 'schema-update', label: 'Aktualizovat' },
        database: { text: 'Databáze není aktuální, některé funkce teď nemusí fungovat. Správce ji brzy aktualizuje.', action: 'schema-close', label: 'Rozumím' }
    };
    const showSchemaNotice = (kind) => {
        const notice = SCHEMA_NOTICE[kind];
        if (!notice || schemaNoticeClosed || document.getElementById('schema-notice')) return;
        const element = document.createElement('div');
        element.id = 'schema-notice';
        element.dataset.kind = kind;
        element.setAttribute('role', 'alert');
        element.className = 'fixed inset-x-3 top-[max(0.5rem,env(safe-area-inset-top))] z-[60] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[12px] font-semibold leading-snug text-amber-900 shadow-lg ring-1 ring-amber-300/80 dark:bg-amber-900 dark:text-amber-50 dark:ring-amber-600/70';
        element.innerHTML = `<p class="min-w-0 flex-1">${escapeHtml(notice.text)}</p><button type="button" data-action="${notice.action}" class="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-[12px] font-black text-white active:scale-95">${escapeHtml(notice.label)}</button>${notice.action === 'schema-close' ? '' : '<button type="button" data-action="schema-close" class="shrink-0 rounded-xl px-2 py-1.5 text-[12px] font-bold underline underline-offset-2">Později</button>'}`;
        element.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            closeSchemaNotice();
            if (button.dataset.action === 'schema-update') updateApp();
        });
        document.body.appendChild(element);
    };
    const closeSchemaNotice = () => { schemaNoticeClosed = true; const element = document.getElementById('schema-notice'); if (element) element.remove(); };
    const checkSchemaVersion = async (user) => {
        if (!Social || !user) return;
        try {
            const have = await Social.schemaVersion();
            if (have === undefined || !signedUser() || signedUser().id !== user.id) return;
            if (have !== null && have > REQUIRED_SCHEMA) { schemaOutdated = null; showSchemaNotice('client'); return; }
            if (have === REQUIRED_SCHEMA) { schemaOutdated = null; return; }
            // Zastaralou databázi umí opravit jen správce, proto se hlásí jen jemu (běžný hráč s tím nic nenadělá)
            const admin = devOn() || await Social.isDevAdmin();
            if (!admin || !signedUser() || signedUser().id !== user.id) return;
            // Ve vývojářském režimu stačí návod v Nastavení, plovoucí hláška by zakrývala tlačítka v hlavičce
            if (!devOn() && readJson(SCHEMA_SEEN_KEY) !== getDayKey()) { writeJson(SCHEMA_SEEN_KEY, getDayKey()); showSchemaNotice('database'); }
            schemaOutdated = { have, need: REQUIRED_SCHEMA };
            if (document.getElementById('settings-overlay') && !document.getElementById('schema-banner')) openSettings(meNote);
        } catch (error) { /* bez spojení se nic neukazuje */ }
    };
    const renderSchemaBanner = () => {
        if (!schemaOutdated) return '';
        return `<p id="schema-banner" class="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-900 ring-1 ring-amber-300/70 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-700/60" role="status">Databáze není aktuální: spusť znovu supabase/schema.sql (verze ${schemaOutdated.have === null ? 'bez čísla' : schemaOutdated.have}, aplikace potřebuje ${schemaOutdated.need}).</p>`;
    };
    const renderDevPanel = () => !devOn() ? '' : `
        <div class="mt-3 rounded-2xl border-2 border-dashed border-amber-400/70 p-2.5">
            <p class="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400"><span>Vývojářský režim</span><span class="font-bold normal-case tracking-normal">${devActive() ? 'zkušební postup' : 'tvůj postup'}</span></p>
            <div class="flex flex-wrap gap-1">${[['max', 'Vše (úr. 100)'], ['level:10', 'Úr. 10'], ['level:25', 'Úr. 25'], ['level:50', 'Úr. 50'], ['level:75', 'Úr. 75'], ['badges', 'Všechny odznaky'], ['nobadges', 'Žádné odznaky'], ['nostars', 'Vymazat hvězdičky'], ['bulb', 'Vrátit žárovku']].map(([kind, label]) => `<button type="button" data-dev="${kind}" class="rounded-lg bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 active:scale-95 dark:bg-slate-700 dark:text-slate-200">${label}</button>`).join('')}${devActive() ? '<button type="button" data-dev="restore" class="rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-black text-white active:scale-95">Vrátit můj postup</button>' : ''}</div>
            ${Social ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Turnaj (boti)</p>
            <div class="flex flex-wrap gap-1">${[['tour-bots', '+31 botů'], ['tour-start', 'Spustit hned'], ['tour-next', 'Další kolo'], ['tour-reset', 'Smazat odehraný turnaj'], ['tour-clear', 'Smazat boty']].map(([kind, label]) => `<button type="button" data-dev="${kind}" class="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-900 active:scale-95 dark:bg-emerald-900/50 dark:text-emerald-100">${label}</button>`).join('')}</div>
            <p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Provoz</p>
            <div class="flex flex-wrap gap-1"><button type="button" data-dev="errors" class="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-900 active:scale-95 dark:bg-rose-900/50 dark:text-rose-100">Chyby z provozu</button></div>` : ''}
            ${Social ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Hlášení otázek</p>
            <div class="flex flex-wrap gap-1"><button type="button" data-dev="reports" class="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-900 active:scale-95 dark:bg-emerald-900/50 dark:text-emerald-100">Seznam hlášení</button></div>` : ''}
            ${Social ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Moderace</p>
            <div class="flex flex-wrap gap-1"><button type="button" data-dev="player-reports" class="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-900 active:scale-95 dark:bg-rose-900/50 dark:text-rose-100">Nahlášení hráči</button></div>` : ''}
        </div>`;
    const ME_HEADING = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const VARIANT_BRIEF = { choices: { short: 'Možnosti', text: '4 možnosti, až 4 body' }, typed: { short: 'Psaní', text: 'Těžší, dvojnásobek bodů' } };
    const renderVariantCompact = (selected) => Object.entries(VARIANTS).map(([key, variant]) => `
        <button type="button" data-variant="${key}" aria-pressed="${selected === key}" title="${escapeHtml(variant.text)}" class="btn-3d-light flex min-w-0 flex-col items-start gap-1 rounded-2xl p-3 text-left ${selected === key ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : 'bg-white dark:bg-slate-800'}">
            <span class="flex items-center gap-2"><span class="rounded-lg bg-brand-100 p-1.5 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"><i data-lucide="${variant.icon}" class="h-4 w-4"></i></span><span class="text-sm font-black text-slate-800 dark:text-slate-100">${VARIANT_BRIEF[key].short}</span></span>
            <span class="text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${VARIANT_BRIEF[key].text}</span>
        </button>`).join('');
    // --- Vzhled: odměny (barevná témata, barva obleku sovy, rámečky, obrázky, titul) – části dodávají look-*.js přes MudrlantLook ---
    const Look = window.MudrlantLook;
    const Tutorial = window.MudrlantTutorial;
    const Owl = window.MudrlantOwl;
    // Logo sovy s vybranými doplňky (bez modulu jen obrázek)
    const owlLogo = (wrapClass, imgClass) => Owl ? Owl.logoHtml(wrapClass, imgClass) : `<img src="icons/logo.webp" alt="" class="${wrapClass} ${imgClass}">`;
    const lookContext = () => {
        const progress = loadProgress();
        const user = Auth && Auth.isConfigured() && Social ? signedUser() : null;
        return { level: levelProgress(progress.xp).level, badges: progress.badges, user, profile: user ? myProfile : null, avatarHtml, prefs: Look ? Look.prefs({ level: levelProgress(progress.xp).level, badges: progress.badges }) : {} };
    };
    // Titul u mého jména podle volby ve Vzhledu: úroveň a její titul (výchozí), nic, nebo název získaného odznaku
    const ownTitleText = (level) => {
        const pick = Look ? Look.prefs(lookContext()).title : 'level';
        if (pick === 'none') return 'Můj postup';
        if (pick && pick !== 'level' && BADGE_BY_ID[pick]) return BADGE_BY_ID[pick].title;
        return `Úr. ${level} · ${titleForLevel(level)}`;
    };
    const applyLook = () => { if (Look) Look.apply(lookContext()); };
    const lookBody = (tab = 'look') => {
        if (!Look) return '';
        const ctx = lookContext();
        return `<div class="flex flex-col gap-2">${Look.getSections().filter(section => (section.tab || 'look') === tab).map(section => `
            <section data-look="${section.id}" class="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800">
                ${section.noTitle ? '' : `<h3 class="${ME_HEADING} mb-1.5">${escapeHtml(section.title)}</h3>`}
                ${section.render(ctx)}
            </section>`).join('')}</div>`;
    };
    // Zamčený obrázek hráče (odemyká se úrovní): položka katalogu, nebo null, když je k dispozici (základní, odemčený nebo už uložený v profilu)
    const avatarUnlockText = (item) => item.badge ? `Odznak: ${(BADGE_BY_ID[item.badge] || {}).title || item.badge}` : `Úroveň ${item.level}`;
    const avatarLock = (emoji) => {
        const item = Look ? Look.find('avatars', emoji) : null;
        if (!item || Social.AVATARS.includes(emoji) || (myProfile && myProfile.avatar === emoji) || Look.isUnlocked(item, lookContext())) return null;
        return item;
    };
    const refreshPush = async () => {
        const user = signedUser();
        if (!Push || !user) { pushState = null; pushPrefs = null; return; }
        const before = JSON.stringify([pushState, pushPrefs]);
        try {
            pushState = await Push.state();
            pushPrefs = pushState.kind === 'on' ? await Push.getPrefs(user.id) : null;
        } catch (error) { pushState = null; pushPrefs = null; }
        if (before !== JSON.stringify([pushState, pushPrefs]) && document.getElementById('settings-overlay') && !pushBusy) openSettings(meNote);
    };
    const PUSH_TEXTS = {
        off: 'Dostaneš upozornění, když začne tvůj turnajový zápas nebo ti někdo pošle výzvu. Vypnout je můžeš kdykoli.',
        on: 'Upozornění jsou zapnutá na tomhle zařízení. Přijde jen to, co si níže necháš zapnuté.',
        denied: 'Upozornění jsou v prohlížeči zakázaná. Povol je v nastavení webu (ikona u adresy) a zkus to znovu.',
        unsupported: 'Tenhle prohlížeč upozornění neumí.',
        iphone: 'Na iPhonu nejdřív přidej aplikaci na plochu (Sdílet, Přidat na plochu) a otevři ji odtamtud.'
    };
    const pushPanel = () => {
        if (!Push || !signedUser() || !pushState || pushState.kind === 'hidden') return '';
        const { kind } = pushState;
        const text = kind === 'unsupported' && pushState.ios ? PUSH_TEXTS.iphone : PUSH_TEXTS[kind];
        const pref = (key, label) => `<button type="button" data-push-pref="${key}" aria-pressed="${Boolean(pushPrefs[key])}" class="rounded-2xl border-2 px-3 py-2 text-left text-xs font-black transition-colors active:scale-[0.98] ${pushPrefs[key] ? TOGGLE_ON : TOGGLE_OFF}">${label}</button>`;
        return `
            <div class="mt-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
                <h3 class="${ME_HEADING} mb-1">Upozornění</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">${text}</p>
                ${kind === 'off' || kind === 'denied' ? `<button type="button" data-push-toggle="on" ${pushBusy ? 'disabled' : ''} class="${PRIMARY_BUTTON} mt-2"><i data-lucide="bell" class="h-5 w-5"></i> Zapnout upozornění</button>` : ''}
                ${kind === 'on' ? `
                    ${pushPrefs ? `<div class="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Co posílat">${pref('tournament', 'Turnaje: kola a zprávy')}${pref('challenge', 'Výzvy od hráčů')}</div>` : ''}
                    <button type="button" data-push-toggle="off" ${pushBusy ? 'disabled' : ''} class="${SECONDARY_BUTTON} mt-2"><i data-lucide="bell-off" class="h-5 w-5"></i> Vypnout upozornění</button>` : ''}
            </div>`;
    };
    const togglePush = async (turnOn) => {
        if (!Push || pushBusy) return;
        pushBusy = true;
        meNote = '';
        // Povolení se žádá hned v klepnutí (jinak ho Safari odmítne), překreslení až po odpovědi
        const work = turnOn ? Push.enable() : Push.disable();
        try {
            const result = await work;
            if (turnOn) meNote = result.ok ? 'Uloženo: upozornění jsou zapnutá.' : result.reason === 'denied' ? 'Upozornění jsou v prohlížeči zakázaná.' : 'Upozornění zůstala vypnutá.';
            else meNote = result.ok ? 'Uloženo: upozornění jsou vypnutá.' : 'Upozornění jsou na tomhle zařízení vypnutá, na serveru se ale odběr nepodařilo smazat.';
        } catch (error) {
            meNote = 'Upozornění se nepodařilo zapnout, zkus to znovu.';
        }
        pushBusy = false;
        pushState = null;
        pushPrefs = null;
        await refreshPush();
        if (document.getElementById('settings-overlay')) openSettings(meNote, '[data-push-toggle]');
    };
    const changePushPref = async (key) => {
        const user = signedUser();
        if (!Push || !user || !pushPrefs) return;
        const next = { ...pushPrefs, [key]: !pushPrefs[key] };
        try { pushPrefs = await Push.savePrefs(user.id, next); meNote = 'Uloženo.'; } catch (error) { meNote = 'Uložení se nepodařilo, zkus to znovu.'; }
        openSettings(meNote, `[data-push-pref="${key}"]`);
    };
    const openSettings = (note = '', focusSelector = null, tab = null) => {
        closeChooser();
        const user = signedUser();
        if (tab) meTab = tab;
        if ((!user || !Social) && meTab === 'profile') meTab = 'game';
        if (user && Social && !meDraft) {
            const base = myProfile || { display_name: user.name, avatar: '🦊', color: 'emerald' };
            meDraft = { name: base.display_name, avatar: base.avatar, color: base.color, owl: Boolean(base.owl && Owl) };
            if (!myProfile) loadMyProfile().then(() => { if (!meDirty && document.getElementById('settings-overlay')) { meDraft = null; openSettings(meNote); } });
        }
        let overlay = document.getElementById('settings-overlay');
        const reopened = Boolean(overlay);
        if (!reopened) refreshPush();
        const scroll = reopened && overlay.firstElementChild ? overlay.firstElementChild.scrollTop : 0;
        if (!overlay) overlay = createSettingsOverlay();
        const state = Auth ? Auth.getState() : { configured: false };
        const profile = user ? (myProfile || { display_name: user.name, avatar: '🦊', color: 'emerald' }) : null;
        const shown = profile && meTab === 'profile' && meDraft ? { ...profile, ...{ avatar: meDraft.avatar, color: meDraft.color, owl: meDraft.owl ? myOwlText() : null, draft: true } } : profile;
        const level = levelProgress(loadProgress().xp);
        const noteText = note || meNote;
        const tabs = `
            <div role="tablist" class="mt-3 flex gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">
                ${[['game', 'gamepad-2', 'Hra'], ...(user && Social ? [['profile', 'user-round', 'Profil']] : []), ['look', 'palette', 'Vzhled'], ...(Owl ? [['owl', 'sparkles', 'Mudrlant']] : [])].map(([id, icon, label]) => `
                    <button type="button" role="tab" data-me-tab="${id}" aria-selected="${meTab === id}" class="flex flex-1 items-center justify-center gap-1.5 rounded-xl min-h-[2.75rem] px-2 text-[13px] font-black ${meTab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-400'}"><i data-lucide="${icon}" class="h-4 w-4"></i> ${label}</button>`).join('')}
            </div>`;
        const gameBody = `
            <h3 class="${ME_HEADING} mb-2">Varianta hry</h3>
            <div class="grid grid-cols-2 gap-2">${renderVariantCompact(gameVariant)}</div>
            <h3 class="${ME_HEADING} mb-2 mt-4">Známost otázek</h3>
            <div class="grid grid-cols-2 gap-2" role="group" aria-label="Známost">${renderTierButtons()}</div>
            <p class="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Pro hraní témat, mix i prohlížení. Dnešní otázky jsou ze známých, jen tu a tam (asi desetina) z těžších. Co z tématu hrát, vybereš na jeho dlaždici.</p>
            ${state.configured && !user ? `
                <div class="mt-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
                    <p class="text-xs text-slate-500 dark:text-slate-400">S účtem se ukládá postup, získáš profil a půjde hrát výzvy s ostatními. Bez něj hraješ jako host.</p>
                    <button type="button" data-auth-login class="${PRIMARY_BUTTON} mt-2"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>
                    ${state.error ? `<p class="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-400" role="alert">${escapeHtml(state.error)}</p>` : ''}
                </div>` : ''}
            ${Review ? `<button type="button" data-review-toggle role="switch" aria-checked="${reviewEnabled()}" class="mt-3 flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left transition-colors active:scale-[0.99] ${reviewEnabled() ? TOGGLE_ON : TOGGLE_OFF}"><i data-lucide="repeat" class="h-5 w-5 shrink-0"></i><span class="min-w-0 flex-1"><span class="block text-sm font-black">Opakování chyb</span><span class="block text-[11px] font-semibold leading-snug opacity-80">${reviewEnabled() ? 'Zapnuto: chyby se ti vrací po 1, 3, 7, 14 a 30 dnech' : 'Vypnuto: nic se nevrací a nic nečeká'}</span></span><span class="shrink-0 text-xs font-black">${reviewEnabled() ? 'Zapnuto' : 'Vypnuto'}</span></button>` : ''}
            ${pushPanel()}
            <button type="button" data-tutorial-restart class="btn-3d-light mt-3 flex w-full items-center gap-2 rounded-2xl bg-white px-3 py-2 text-left dark:bg-slate-800"><i data-lucide="info" class="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="min-w-0 flex-1 truncate text-[13px] font-black text-slate-800 dark:text-slate-100">Projít znovu tutoriál</span><i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"></i></button>
            ${renderDevPanel()}`;
        const profileBody = user && Social && meDraft ? `
            <form id="profile-form" class="flex flex-col gap-3" autocomplete="off">
                <label class="${ME_HEADING}">Přezdívka <span class="font-semibold normal-case tracking-normal">(podle ní tě ostatní najdou, musí být jedinečná)</span>
                    <input id="profile-name" type="text" maxlength="${Social.NAME_MAX}" value="${escapeHtml(meDraft.name)}" class="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base font-bold normal-case tracking-normal text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                </label>
                <div>
                    <p class="${ME_HEADING} mb-1.5">Obrázek</p>
                    <div class="grid grid-cols-12 gap-1">${Owl && Owl.owlAvatarHtml ? `<button type="button" data-pick-owl aria-label="Sova Mudrlant" title="Sova Mudrlant" aria-pressed="${meDraft.owl}" class="flex aspect-square items-center justify-center rounded-lg border-2 active:scale-95 ${meDraft.owl ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-transparent bg-white dark:bg-slate-800'}">${Owl.owlAvatarHtml(myOwlText(), 'h-full w-auto', 'h-[88%]')}</button>` : ''}${Social.allAvatars().map(emoji => {
                        const lock = avatarLock(emoji);
                        if (lock) return `<button type="button" data-locked-avatar="${emoji}" aria-disabled="true" aria-label="Obrázek ${emoji} je zamčený: ${avatarUnlockText(lock)}" title="${avatarUnlockText(lock)}" class="flex aspect-square items-center justify-center rounded-lg border-2 border-transparent bg-white text-base opacity-40 grayscale dark:bg-slate-800">${emoji}</button>`;
                        return `<button type="button" data-pick-avatar="${emoji}" aria-label="Obrázek ${emoji}" aria-pressed="${emoji === meDraft.avatar && !meDraft.owl}" class="flex aspect-square items-center justify-center rounded-lg border-2 text-base active:scale-95 ${emoji === meDraft.avatar && !meDraft.owl ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-transparent bg-white dark:bg-slate-800'}">${emoji}</button>`;
                    }).join('')}</div>
                </div>
                <div>
                    <p class="${ME_HEADING} mb-1.5">Barva pozadí</p>
                    <div class="flex justify-between px-1">${Social.COLORS.map(color => `<button type="button" data-pick-color="${color}" aria-label="Barva ${color}" aria-pressed="${color === meDraft.color}" class="h-7 w-7 rounded-full ${avatarBg(color)} ${color === meDraft.color ? 'ring-2 ring-slate-800/70 ring-offset-2 dark:ring-white/80 dark:ring-offset-slate-900' : ''} active:scale-95"></button>`).join('')}</div>
                    <input type="range" min="0" max="355" step="5" value="${Social.customHue(meDraft.color) ?? Social.customHue('h' + ({ emerald: 160, sky: 200, violet: 260, rose: 350, amber: 40, teal: 175, orange: 25, indigo: 240 }[meDraft.color] || 160))}" data-pick-hue aria-label="Všechny barvy: odstín pozadí profilovky" class="mt-2 h-6 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]">
                </div>
                <div class="flex gap-2">
                    <button type="button" data-open-accept class="btn-3d-light flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white px-3 py-2 text-left dark:bg-slate-800"><i data-lucide="shield-check" class="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="min-w-0 flex-1 truncate text-[13px] font-black text-slate-800 dark:text-slate-100">Přijímané výzvy <span class="font-semibold text-slate-500 dark:text-slate-400">· ${escapeHtml(acceptSummary())}</span></span><i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"></i></button>
                    ${Friends ? `<button type="button" data-open-blocked aria-label="Zablokovaní hráči: ${myBlocks ? myBlocks.length : 'načítám'}" title="Zablokovaní hráči" class="btn-3d-light relative flex h-auto w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700 dark:bg-slate-800 dark:text-brand-300"><i data-lucide="ban" class="h-5 w-5"></i>${myBlocks && myBlocks.length ? `<span class="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">${myBlocks.length}</span>` : ''}</button>` : ''}
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button type="submit" data-save-profile class="${PRIMARY_BUTTON}"><i data-lucide="check" class="h-5 w-5"></i> Uložit</button>
                    <button type="button" data-auth-logout class="${SECONDARY_BUTTON}"><i data-lucide="log-out" class="h-5 w-5"></i> Odhlásit</button>
                </div>
            </form>` : '';
        overlay.innerHTML = `
            <div class="${reopened ? '' : 'fade-in '}max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-slate-50 p-4 shadow-2xl dark:bg-slate-900">
                <div class="flex items-center gap-3">
                    ${shown ? avatarHtml(shown, 'h-14 w-14 text-3xl') : owlLogo('shrink-0 mt-1', 'h-14 w-auto drop-shadow-md')}
                    <div class="min-w-0 flex-1">
                        <h2 id="settings-title" class="truncate text-lg font-black leading-tight text-slate-800 dark:text-slate-100">${user ? escapeHtml(playerName(profile)) : 'Nastavení'}</h2>
                        <p class="truncate text-xs text-slate-500 dark:text-slate-400">${user ? escapeHtml(user.email || user.name) : 'Hraješ bez účtu'}</p>
                        <button type="button" data-open-progress class="mt-0.5 flex items-center gap-1 text-[11px] font-black text-brand-700 dark:text-cream">${escapeHtml(ownTitleText(level.level))} <i data-lucide="chevron-right" class="h-3 w-3"></i></button>
                    </div>
                    <button type="button" data-close aria-label="Zavřít" class="self-start rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                ${tabs}
                <div class="mt-3">${meTab === 'profile' && profileBody ? profileBody : meTab === 'look' ? lookBody('look') : meTab === 'owl' ? lookBody('owl') : gameBody}</div>
                <p id="settings-note" class="mt-2 min-h-[1.1rem] text-xs font-semibold ${noteText.startsWith('Uloženo') || !meNote ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-400'}" role="status">${escapeHtml(noteText)}</p>
                ${renderSchemaBanner()}
                <div class="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span id="app-version">${escapeHtml(versionLabel())}</span>
                    <button type="button" data-update-app class="rounded-lg px-2 py-1 font-bold text-slate-600 underline underline-offset-2 hover:bg-slate-200 disabled:no-underline dark:text-slate-300 dark:hover:bg-slate-800">Aktualizovat</button>
                </div>
                ${meTab === 'game' ? `<div class="mt-1 flex flex-wrap items-center justify-center gap-x-1 text-xs text-slate-500 dark:text-slate-400">
                    <a href="soukromi.html" class="rounded-lg px-2 py-1 font-bold underline underline-offset-2">Ochrana osobních údajů</a>
                    <a href="licence.html" class="rounded-lg px-2 py-1 font-bold underline underline-offset-2">Zdroje a licence</a>
                    ${user && Social ? '<button type="button" data-open-privacy class="rounded-lg px-2 py-1 font-bold underline underline-offset-2">Moje data</button>' : ''}
                </div>` : ''}
            </div>`;
        overlay.firstElementChild.scrollTop = scroll;
        renderIcons(overlay);
        const target = focusSelector ? overlay.querySelector(focusSelector) : (meTab === 'profile' ? null : overlay.querySelector('[data-variant][aria-pressed="true"]'));
        (target || overlay.querySelector('[data-close]')).focus({ preventScroll: true });
    };
    const OWL_AVATAR_KEY = 'mudrlant.owlAvatar';
    const saveMeProfile = async () => {
        const user = signedUser();
        if (!user || !Social || !meDraft) return;
        const input = document.getElementById('profile-name');
        if (input) meDraft.name = input.value;
        try {
            myProfile = await Social.saveProfile(user.id, { ...meDraft, owl: meDraft.owl ? myOwlText() : null });
            // Volba sovy se pamatuje i v zařízení: v databázi bez sloupce owl (schema.sql ještě nebylo znovu spuštěno) by se jinak ztratila
            // a profilovka by zůstala emoji. Ostatní hráči ji uvidí až po spuštění schematu.
            writeJson(OWL_AVATAR_KEY, Boolean(meDraft.owl));
            // Vlastní odstín se pamatuje i v zařízení (starší schéma ho do databáze neuloží, tam jde nejbližší pojmenovaná barva)
            writeJson(AVATAR_COLOR_KEY, Social.customHue(meDraft.color) !== null ? meDraft.color : null);
            if (Social.customHue(meDraft.color) !== null && myProfile.color !== meDraft.color) myProfile = { ...myProfile, color: meDraft.color };
            if (meDraft.owl && !myProfile.owl) myProfile = { ...myProfile, owl: myOwlText() };
            meNote = 'Uloženo.';
            meDirty = false;
            updateProfileButton();
            paintChallenges();
        } catch (error) {
            meNote = error.status === 400 || error.status === 409 ? error.message : 'Uložení se nepodařilo, zkus to znovu.';
        }
        if (document.getElementById('settings-overlay')) openSettings(meNote, '[data-save-profile]');
    };
    // --- Moje data: export a smazání účtu (Nastavení → Profil) ---
    const DELETED_FLAG = 'mudrlant.accountDeleted';
    // Data uložená v zařízení (bez přihlašovacích tokenů) pro export
    const localDataSnapshot = () => {
        const out = {};
        try {
            Object.keys(localStorage).filter(key => key.startsWith('mudrlant.') && key !== 'mudrlant.auth' && !key.startsWith('mudrlant.dev')).sort().forEach(key => {
                const raw = localStorage.getItem(key);
                try { out[key] = JSON.parse(raw); } catch (e) { out[key] = raw; }
            });
        } catch (e) { /* bez úložiště nic není */ }
        return out;
    };
    const downloadJson = (name, data) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const DANGER_BUTTON = 'flex w-full items-center justify-center gap-2 rounded-2xl btn-3d-light bg-white px-4 py-3 text-base font-bold text-rose-700 dark:bg-slate-800 dark:text-rose-400';
    // Okno Moje data a soukromí (Nastavení → Moje data): odkazy, export a smazání účtu s potvrzením
    const openPrivacy = (note = '', focusSelector = null) => {
        if (!Social || !signedUser()) return;
        const busy = privacyState === 'busy';
        const body = `
            <p class="text-sm text-slate-600 dark:text-slate-300">Co o tobě aplikace ukládá, najdeš v <a href="soukromi.html" class="font-bold underline">Zásadách ochrany osobních údajů</a>.</p>
            ${privacyState ? `
            <div class="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/40" role="alertdialog" aria-labelledby="del-title" aria-describedby="del-text">
                <p id="del-title" class="text-sm font-black text-rose-800 dark:text-rose-200">Opravdu smazat účet?</p>
                <p id="del-text" class="mt-1 text-xs leading-snug text-rose-900 dark:text-rose-100">Smaže se profil, úroveň, odznaky, rating, výzvy, výsledky a účast v turnajích. Zmizí i postup uložený v tomto zařízení a skončíš odhlášený. Nejde to vrátit. Chceš si předtím data stáhnout, použij „Stáhnout moje data“.</p>
                <div class="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" data-delete-cancel ${busy ? 'disabled' : ''} class="${SECONDARY_BUTTON} !py-2 text-sm">Zrušit</button>
                    <button type="button" data-delete-confirm ${busy ? 'disabled' : ''} class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-rose-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50">${busy ? 'Mažu…' : 'Ano, smazat navždy'}</button>
                </div>
            </div>` : `
            <div class="mt-3 grid gap-2">
                <button type="button" data-export-data class="${SECONDARY_BUTTON}"><i data-lucide="download" class="h-5 w-5"></i> Stáhnout moje data (JSON)</button>
                <button type="button" data-delete-account class="${DANGER_BUTTON}"><i data-lucide="trash-2" class="h-5 w-5"></i> Smazat účet a data</button>
            </div>`}
            <p id="privacy-note" class="mt-2 min-h-[1.1rem] text-xs font-semibold text-slate-600 dark:text-slate-300" role="status">${escapeHtml(note)}</p>`;
        showDialog('Moje data a soukromí', body, { onClick: (event) => {
            if (event.target.closest('[data-export-data]')) { exportMyData(); return; }
            if (event.target.closest('[data-delete-account]')) { privacyState = 'confirm'; openPrivacy('', '[data-delete-cancel]'); return; }
            if (event.target.closest('[data-delete-cancel]')) { if (privacyState !== 'busy') { privacyState = ''; openPrivacy('', '[data-delete-account]'); } return; }
            if (event.target.closest('[data-delete-confirm]')) deleteMyAccount();
        } });
        if (focusSelector) { const target = document.querySelector(`#dialog-overlay ${focusSelector}`); if (target) target.focus({ preventScroll: true }); }
    };
    const exportMyData = async () => {
        if (!Social || !signedUser()) return;
        let server = null;
        let note = 'Data jsou stažena do souboru.';
        try { server = await Social.exportMyData(); } catch (error) { note = `Stáhla se jen data z tohoto zařízení: ${error.message}`; }
        downloadJson(`mudrlant-moje-data-${getDayKey()}.json`, { aplikace: 'Mudrlant', stazeno: new Date().toISOString(), server, zarizeni: localDataSnapshot() });
        if (document.getElementById('dialog-overlay') && document.getElementById('privacy-note')) openPrivacy(note, '[data-export-data]');
    };
    const wipeLocalData = () => {
        try { Object.keys(localStorage).filter(key => key.startsWith('mudrlant.') || key.startsWith('geoQuiz') || key === 'geoSessionState').forEach(key => localStorage.removeItem(key)); } catch (e) { /* bez úložiště není co mazat */ }
    };
    const deleteMyAccount = async () => {
        if (!Social || !signedUser() || privacyState === 'busy') return;
        privacyState = 'busy';
        openPrivacy();
        let complete;
        try {
            complete = await Social.deleteMyAccount();
        } catch (error) {
            privacyState = '';
            if (document.getElementById('privacy-note')) openPrivacy(error.message || 'Účet se nepodařilo smazat, zkus to znovu.', '[data-delete-account]');
            return;
        }
        // Server je smazaný: odhlásit, vymazat data zařízení a načíst aplikaci znovu (čistý start); o výsledku řekne okno po načtení
        try { await Auth.logout(); } catch (e) { /* odhlášení v zařízení se vymaže stejně */ }
        wipeLocalData();
        try { sessionStorage.setItem(DELETED_FLAG, complete ? 'full' : 'partial'); } catch (e) { /* bez úložiště se okno neukáže */ }
        window.location.reload();
    };
    // Po smazání účtu: jednorázové okno s potvrzením
    const announceDeletion = () => {
        let flag = null;
        try { flag = sessionStorage.getItem(DELETED_FLAG); sessionStorage.removeItem(DELETED_FLAG); } catch (e) { return; }
        if (!flag) return;
        showDialog('Účet je smazaný', `
            <p class="text-sm text-slate-600 dark:text-slate-300">${flag === 'full' ? 'Tvůj účet a všechna data k němu jsou smazaná a data v tomto zařízení vymazaná.' : 'Data tvého účtu jsou smazaná a data v tomto zařízení vymazaná. Přihlašovací záznam u poskytovatele přihlášení je potřeba smazat ručně: napiš na kontakt v Zásadách ochrany osobních údajů.'}</p>
            <button type="button" data-close class="${PRIMARY_BUTTON} mt-4">Rozumím</button>`, { onClick: (event) => { if (event.target.closest('[data-close]')) closeDialog(); } });
    };
    const createSettingsOverlay = () => {
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'settings-title');
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:items-center';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) {
                closeSettings();
                return;
            }
            const lookEl = event.target.closest('[data-look]');
            if (lookEl && Look) {
                const section = Look.getSections().find(entry => entry.id === lookEl.dataset.look);
                if (section && section.click && section.click(event, lookContext())) { updateControlsUI(); openSettings('', null, meTab); }
                return;
            }
            const tabButton = event.target.closest('[data-me-tab]');
            if (tabButton) {
                const input = document.getElementById('profile-name');
                if (input && meDraft) meDraft.name = input.value;
                meNote = '';
                openSettings('', null, tabButton.dataset.meTab);
                return;
            }
            if (event.target.closest('[data-auth-login]')) { Auth.login(); return; }
            if (event.target.closest('[data-auth-logout]')) {
                // Odhlášený hráč nesmí na tomhle zařízení dál dostávat upozornění: odběr se smaže ještě za přihlášení
                closeSettings();
                (Push ? Push.disable().catch(() => {}) : Promise.resolve()).then(() => Auth.logout());
                return;
            }
            if (event.target.closest('[data-review-toggle]')) {
                writeJson(KEYS.reviewOn, !reviewEnabled());
                updateControlsUI();
                openSettings(reviewEnabled() ? 'Opakování chyb je zapnuté.' : 'Opakování chyb je vypnuté.', '[data-review-toggle]');
                return;
            }
            const pushToggle = event.target.closest('[data-push-toggle]');
            if (pushToggle) { togglePush(pushToggle.dataset.pushToggle === 'on'); return; }
            const pushPref = event.target.closest('[data-push-pref]');
            if (pushPref) { changePushPref(pushPref.dataset.pushPref); return; }
            if (event.target.closest('[data-update-app]')) { updateApp(); return; }
            if (event.target.closest('[data-open-privacy]')) { if (privacyState !== 'busy') privacyState = ''; openPrivacy(); return; }
            if (event.target.closest('[data-tutorial-restart]')) {
                // Tutoriál začíná na záložce Jeden hráč (dnešní otázky a dlaždice témat); jinak by se ukázal jen poslední krok
                writeJson(KEYS.homeTab, 'single');
                closeSettings();
                renderHome();
                if (Tutorial) Tutorial.restart();
                return;
            }
            if (event.target.closest('[data-open-progress]')) { closeSettings(); openProgress(); return; }
            if (event.target.closest('[data-open-accept]')) { closeSettings(); openAccepted(); return; }
            if (event.target.closest('[data-open-blocked]')) { closeSettings(); openBlockedList(); return; }
            const devButton = event.target.closest('[data-dev]');
            if (devButton && devButton.dataset.dev.startsWith('tour-')) { devTournamentAction(devButton.dataset.dev); return; }
            if (devButton && devButton.dataset.dev === 'errors') { closeSettings(); openClientErrors(); return; }
            if (devButton && devButton.dataset.dev === 'reports') { openQuestionReports(); return; }
            if (devButton && devButton.dataset.dev === 'player-reports') { closeSettings(); openDevReports(); return; }
            if (devButton && devButton.dataset.dev === 'bulb') {
                // Vrátí žárovku u sovy: zapomene, že dnešní událost už hráč přečetl
                try { localStorage.removeItem(FACT_KEY); } catch (e) { /* bez úložiště se nic nevrací */ }
                updateControlsUI();
                openSettings(dailyFact ? 'Hotovo: žárovka je zpátky' : 'Dnes žádná událost není (žárovka se neukáže)', '[data-dev="bulb"]');
                return;
            }
            if (devButton) { devApply(devButton.dataset.dev); updateControlsUI(); openSettings(`Hotovo: ${devButton.textContent.trim()}`, `[data-dev="${devButton.dataset.dev}"]`); return; }
            const locked = event.target.closest('[data-locked-avatar]');
            if (locked) {
                const input = document.getElementById('profile-name');
                if (input && meDraft) meDraft.name = input.value;
                const item = Look.find('avatars', locked.dataset.lockedAvatar);
                openSettings(item.badge ? `${item.title} se odemkne odznakem „${(BADGE_BY_ID[item.badge] || {}).title || item.badge}“.` : `${item.title} se odemkne na úrovni ${item.level}.`);
                return;
            }
            const avatar = event.target.closest('[data-pick-avatar]');
            const color = event.target.closest('[data-pick-color]');
            const pickOwl = event.target.closest('[data-pick-owl]');
            if (avatar || color || pickOwl) {
                const input = document.getElementById('profile-name');
                if (input && meDraft) meDraft.name = input.value;
                if (pickOwl) { meDraft.owl = true; meDraft.avatar = '🦉'; }
                if (avatar) { meDraft.avatar = avatar.dataset.pickAvatar; meDraft.owl = false; }
                if (color) meDraft.color = color.dataset.pickColor;
                meDirty = true;
                meNote = '';
                openSettings('', pickOwl ? '[data-pick-owl]' : avatar ? `[data-pick-avatar="${meDraft.avatar}"]` : `[data-pick-color="${meDraft.color}"]`);
                return;
            }
            const variantButton = event.target.closest('[data-variant]');
            if (variantButton) changeVariant(variantButton.dataset.variant);
            const tierButton = event.target.closest('[data-tier]');
            if (tierButton) changeSettings({ tier: tierButton.dataset.tier }, `[data-tier="${tierButton.dataset.tier}"]`);
        });
        // Výběry ve Vzhledu (např. titul u jména)
        overlay.addEventListener('change', (event) => {
            const hueRange = event.target.closest('[data-pick-hue]');
            if (hueRange && meDraft) {
                const input = document.getElementById('profile-name');
                if (input) meDraft.name = input.value;
                meDraft.color = `h${Math.round(Number(hueRange.value) / 5) * 5 % 360}`;
                meDirty = true;
                meNote = '';
                openSettings('', '[data-pick-hue]');
                return;
            }
            const lookEl = event.target.closest('[data-look]');
            const section = lookEl && Look ? Look.getSections().find(entry => entry.id === lookEl.dataset.look) : null;
            if (section && section.change && section.change(event, lookContext())) { updateControlsUI(); openSettings('', null, meTab); }
        });
        overlay.addEventListener('submit', (event) => {
            if (event.target.id !== 'profile-form') return;
            event.preventDefault();
            saveMeProfile();
        });
        overlay.addEventListener('input', (event) => { if (event.target.id === 'profile-name') meDirty = true; });
        document.body.appendChild(overlay);
        trapFocus(overlay);
        return overlay;
    };

    const changeVariant = (variant) => {
        if (!VARIANTS[variant]) return;
        gameVariant = variant;
        saveVariant(variant);
        if (screen === 'welcome') {
            closeSettings();
            showStart();
            return;
        }
        let note = 'Uloženo, platí od další otázky.';
        if (round && !round.answered && round.variant !== variant && !(mode === 'challenge' && challenge && challenge.variant)) {
            if (variant === 'choices') {
                // Na možnosti jde přepnout hned – je to snazší varianta
                round.variant = 'choices';
                if (screen === 'round') renderRound({ keepScroll: true });
                else persistState();
                note = 'Uloženo, platí hned pro tuto otázku.';
            } else {
                // Na psaní (dvojnásobek bodů) až od další otázky – možnosti už tady byly vidět
                note = 'Uloženo. Psaní platí od další otázky, tady už byly možnosti vidět.';
            }
        }
        openSettings(note, `[data-variant="${variant}"]`);
    };

    const changeSettings = (change, focusSelector, note = 'Uloženo, platí od další otázky.') => {
        saveSettings(change);
        openSettings(note, focusSelector);
        if (screen === 'learn') renderLearn();
    };

    // --- Co hrát: okno s výběrem kategorií tématu, nebo témat do mixu ---

    // target = { kind: 'topic', topic } | { kind: 'mix' }
    let chooser = null;

    const closeChooser = () => {
        const overlay = document.getElementById('play-chooser');
        if (!overlay) return;
        overlay.remove();
        chooser = null;
        // Dlaždice ukazují, co je vybrané
        if (screen === 'home') renderHome();
    };

    const chooserToggle = (attribute, value, isOn, icon, label, on) => `
        <button type="button" ${attribute}="${escapeHtml(value)}" aria-pressed="${isOn}" class="flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-sm font-bold leading-tight transition-colors active:scale-[0.98] ${isOn ? on : TOGGLE_OFF}">
            <i data-lucide="${isOn ? 'square-check-big' : 'square'}" class="h-4 w-4 shrink-0"></i>
            <i data-lucide="${icon}" class="h-4 w-4 shrink-0 opacity-70"></i>
            <span class="min-w-0">${escapeHtml(label)}</span>
        </button>`;

    const renderChooser = (note = '', focusSelector = null) => {
        const overlay = document.getElementById('play-chooser');
        if (!overlay || !chooser) return;
        const isMix = chooser.kind === 'mix';
        const topic = isMix ? MIX : TOPIC_BY_ID[chooser.topic];
        const style = styleOf(topic);
        const options = isMix
            ? TOPICS.map(other => chooserToggle('data-chooser-topic', other.id, settings.topics.includes(other.id), other.icon, other.title, styleOf(other).on)).join('')
            : topic.categories.map(category => chooserToggle('data-chooser-category', category.key, selectedCategories(topic).includes(category.key), category.icon, category.label, style.on)).join('');
        const switches = [...TOPICS, MIX].filter(other => other.id !== topic.id).map(other => `
            <button type="button" data-chooser-switch="${other.id}" class="flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold ${styleOf(other).soft}">
                <i data-lucide="${other.icon}" class="h-3.5 w-3.5"></i> ${escapeHtml(other.title)}
            </button>`).join('');
        // Překreslení po klepnutí bez úvodní animace a se stejným posunutím
        const previous = overlay.firstElementChild;
        const scroll = previous ? previous.scrollTop : 0;
        overlay.innerHTML = `
            <div class="${previous ? '' : 'fade-in '}max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-slate-50 p-5 shadow-2xl dark:bg-slate-900">
                <div class="mb-4 flex items-center gap-3">
                    ${topicIcon(topic, 'h-12 w-12', `shrink-0 rounded-2xl bg-gradient-to-br p-2.5 text-white ${style.tile}`, 'h-6 w-6')}
                    <div class="min-w-0 flex-1">
                        <h2 id="chooser-title" class="text-lg font-black text-slate-800 dark:text-slate-100">${escapeHtml(topic.title)}</h2>
                        <p class="text-sm text-slate-500 dark:text-slate-400">${isMix ? 'Z jakých témat chceš otázky?' : 'Co chceš hrát?'}</p>
                    </div>
                    <button type="button" data-close aria-label="Zavřít" class="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                <div class="mb-2 flex items-center justify-between">
                    <h3 class="${SETTINGS_HEADING}">${isMix ? 'Témata' : 'Kategorie'}</h3>
                    <button type="button" data-chooser-all class="-my-2 rounded-lg px-2 py-2 text-xs font-bold ${style.text} underline-offset-2 hover:underline">Vybrat vše</button>
                </div>
                <div class="grid grid-cols-2 gap-2" role="group" aria-label="${isMix ? 'Témata' : 'Kategorie'}">${options}</div>
                <h3 class="${SETTINGS_HEADING} mb-2 mt-5">Známost</h3>
                <div class="grid grid-cols-2 gap-2" role="group" aria-label="Známost">${renderTierButtons(style.on, isMix ? null : topic)}</div>
                <p id="chooser-note" class="mt-3 min-h-[1.25rem] text-sm font-semibold text-rose-700 dark:text-rose-400" role="status">${escapeHtml(note)}</p>
                <button type="button" data-chooser-play class="mt-1 flex w-full items-center justify-center gap-2 rounded-[1.2rem] py-4 text-lg font-black text-white shadow-lg transition-all active:scale-95 ${style.button} btn-3d">
                    <i data-lucide="play" class="h-5 w-5"></i> Hrát
                </button>
                <h3 class="${SETTINGS_HEADING} mb-2 mt-5">Jiné téma</h3>
                <div class="flex flex-wrap gap-2">${switches}</div>
            </div>`;
        overlay.firstElementChild.scrollTop = scroll;
        renderIcons(overlay);
        const focusTarget = focusSelector && overlay.querySelector(focusSelector);
        if (focusTarget) focusTarget.focus({ preventScroll: true });
    };

    const openChooser = (target) => {
        closeChooser();
        closeSettings();
        chooser = target;
        const overlay = document.createElement('div');
        overlay.id = 'play-chooser';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'chooser-title');
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) return closeChooser();
            // Po překreslení okna zůstane fokus na stejném tlačítku
            const clicked = event.target.closest('button');
            const attribute = clicked && [...clicked.attributes].find(attr => attr.name.startsWith('data-chooser') || attr.name === 'data-tier');
            const refocus = attribute ? `[${attribute.name}${attribute.value ? `="${CSS.escape(attribute.value)}"` : ''}]` : null;
            const topic = chooser && chooser.kind === 'topic' ? TOPIC_BY_ID[chooser.topic] : null;
            const category = event.target.closest('[data-chooser-category]');
            const topicToggle = event.target.closest('[data-chooser-topic]');
            const tier = event.target.closest('[data-tier]');
            const switchTo = event.target.closest('[data-chooser-switch]');
            if (category && topic) toggleChoice('category', category.dataset.chooserCategory, topic, refocus);
            else if (topicToggle) toggleChoice('topic', topicToggle.dataset.chooserTopic, null, refocus);
            else if (tier) { saveSettings({ tier: tier.dataset.tier }); renderChooser('', refocus); }
            else if (event.target.closest('[data-chooser-all]')) {
                if (topic) saveSettings({ categories: { ...settings.categories, [topic.id]: undefined } });
                else saveSettings({ topics: TOPICS.map(other => other.id) });
                renderChooser('', refocus);
            } else if (switchTo) {
                chooser = switchTo.dataset.chooserSwitch === 'mix' ? { kind: 'mix' } : { kind: 'topic', topic: switchTo.dataset.chooserSwitch };
                renderChooser('', '[data-chooser-play]');
            } else if (event.target.closest('[data-chooser-play]')) {
                const pick = chooser;
                closeChooser();
                markSeen(pick.kind === 'mix' ? 'mix' : pick.topic);
                startPractice(pick.kind === 'mix' ? { kind: 'mix' } : { kind: 'topic', topic: pick.topic });
            }
        });
        document.body.appendChild(overlay);
        trapFocus(overlay);
        renderChooser();
        overlay.querySelector('[data-chooser-play]').focus();
    };

    const saveSettings = (change) => {
        settings = { ...settings, ...change };
        // Vybrané všechny kategorie = bez omezení
        settings.categories = Object.fromEntries(Object.entries(settings.categories).filter(([, keys]) => Array.isArray(keys)));
        writeJson(KEYS.settings, { ...settings, known: TOPICS.map(topic => topic.id) });
    };
    const markSeen = (id) => {
        if (!settings.seen.includes(id)) saveSettings({ seen: [...settings.seen, id] });
    };

    // Zapnout či vypnout kategorii tématu nebo téma v mixu; aspoň jedno musí zůstat
    const toggleChoice = (kind, value, topic, refocus = null) => {
        if (kind === 'category') {
            const all = topic.categories.map(category => category.key);
            const chosen = selectedCategories(topic);
            const next = chosen.includes(value) ? chosen.filter(key => key !== value) : [...chosen, value];
            if (!next.length) return renderChooser('Aspoň jedna kategorie musí zůstat vybraná.', refocus);
            saveSettings({ categories: { ...settings.categories, [topic.id]: next.length === all.length ? undefined : all.filter(key => next.includes(key)) } });
        } else {
            const next = settings.topics.includes(value) ? settings.topics.filter(id => id !== value) : [...settings.topics, value];
            if (!next.length) return renderChooser('Aspoň jedno téma musí zůstat vybrané.', refocus);
            saveSettings({ topics: TOPICS.map(other => other.id).filter(id => next.includes(id)) });
        }
        renderChooser('', refocus);
    };

    // Dlaždice tématu: poprvé okno s výběrem, pak rovnou hra s uloženým výběrem; mix vždy s výběrem témat
    const playTopic = (topicId) => {
        if (!settings.seen.includes(topicId)) openChooser({ kind: 'topic', topic: topicId });
        else startPractice({ kind: 'topic', topic: topicId });
    };

    // --- Hlavička ---

    const BUTTON_BASE = 'flex h-11 w-11 items-center justify-center rounded-2xl';
    // Vybrané tlačítko navigace ve vínové barvě loga
    const BUTTON_SELECTED = `${BUTTON_BASE} btn-3d bg-brand-700 text-white`;
    const BUTTON_ACTIVE = { home: BUTTON_SELECTED, practice: BUTTON_SELECTED, learn: BUTTON_SELECTED };
    const BUTTON_INACTIVE = `${BUTTON_BASE} btn-3d-light bg-white text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white`;

    const shortDay = (dayKey) => formatDayKey(dayKey).replace(/ \d{4}$/, '');

    // Kde hráč je: štítek vlevo nahoře (ikona, text, téma kvůli barvě; switch = klepnutím jde změnit téma)
    const describePlace = () => {
        if (isLoading) return { icon: 'hourglass', text: 'Načítám…', topic: mode === 'practice' && pool.kind === 'topic' ? TOPIC_BY_ID[pool.topic] || null : null };
        if (screen === 'learn') {
            const topic = learn.topic && learn.view !== 'home' && learn.view !== 'mistakes' ? TOPIC_BY_ID[learn.topic] : null;
            return { icon: 'graduation-cap', text: topic ? `Učení · ${topic.title}` : 'Učení', topic };
        }
        if (screen === 'challenge-done') return { icon: 'trophy', text: challenge && challenge.tournament ? 'Zápas hotový' : 'Výzva hotová', topic: null };
        // Úvod: sova z loga, název a dnešní datum
        if (screen !== 'round' || !current) return { logo: true, text: `${APP_NAME} · ${shortDay(getDayKey())}`, date: shortDay(getDayKey()), topic: null };
        const topic = TOPIC_BY_ID[current.topic];
        if (mode === 'daily') return { icon: topic.icon, text: `${topic.title} · ${shortDay(current.dailyDate || getDayKey())}`, topic };
        if (mode === 'challenge' && challenge) return { icon: challenge.tournament ? 'trophy' : 'swords', text: `${challenge.tournament ? 'Turnaj' : 'Výzva'} · ${challenge.index + 1}/${challenge.count}`, topic };
        if (pool.kind === 'mistakes') return { icon: 'repeat', text: `Opakování chyb · ${loadMistakes().length}`, topic };
        if (pool.kind === 'review') return { icon: 'repeat', text: `Opakování · ${Math.min(pool.done + 1, pool.total)}/${pool.total}`, topic };
        if (pool.kind === 'collection') {
            const ctx = loadedTopics.get(pool.topic);
            return { icon: 'layers', text: ctx ? `${ctx.topic.title} · ${collectionLabel(ctx, pool.collection)}` : 'Procvičování', topic };
        }
        if (pool.kind === 'mix') return { icon: 'shuffle', text: `Mix · ${topic.title}`, topic, switch: true };
        const chosen = selectedCategories(topic);
        const scope = chosen.length === topic.categories.length ? '' : chosen.length === 1
            ? ` · ${categoryOf(topic, chosen[0]).label}` : ` · ${chosen.length} z ${topic.categories.length}`;
        return { icon: topic.icon, text: `${topic.title}${scope}`, topic, switch: true };
    };

    const HEADER_BASE = 'relative shrink-0 w-full px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex justify-between items-center gap-2 z-30 bg-slate-50 dark:bg-slate-900 border-b-4';
    const BADGE_BASE = 'min-h-[2.75rem] min-w-0 px-2.5 py-2 rounded-2xl shadow-sm text-sm font-bold flex items-center gap-2 transition-colors border';
    const BADGE_LOGO = 'min-h-[2.75rem] min-w-[2.75rem] flex items-center gap-2 rounded-2xl py-0.5 pr-1 text-left';

    const updateControlsUI = () => {
        // Procvičování okruhu nebo chyb patří k učení
        const fromLearn = mode === 'practice' && (pool.kind === 'collection' || pool.kind === 'mistakes' || pool.kind === 'review');
        const section = screen === 'learn' ? 'learn' : screen === 'round' ? (mode === 'daily' || mode === 'challenge' ? 'home' : fromLearn ? 'learn' : 'practice') : 'home';
        updateProfileButton();
        const settingsButton = document.getElementById('btn-settings');
        settingsButton.disabled = isLoading;
        settingsButton.classList.toggle('opacity-50', isLoading);
        const buttons = { home: document.getElementById('btn-home'), practice: document.getElementById('btn-practice'), learn: document.getElementById('btn-learn') };
        Object.entries(buttons).forEach(([key, button]) => {
            button.className = section === key ? BUTTON_ACTIVE[key] : BUTTON_INACTIVE;
            button.setAttribute('aria-pressed', String(section === key));
            button.disabled = isLoading;
            button.classList.toggle('opacity-50', isLoading);
        });
        const practiceIcon = document.getElementById('practice-icon');
        if (practiceIcon) practiceIcon.classList.toggle('spin', isLoading && mode === 'practice');
        // Čip u Učení: kolik karet opakování je dnes na řadě (jen když nějaká je)
        const due = reviewDueCount();
        let chip = buttons.learn.querySelector('[data-review-due]');
        if (due) {
            if (!chip) {
                chip = document.createElement('span');
                chip.dataset.reviewDue = '';
                chip.className = 'absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-black leading-none text-brand-950 ring-2 ring-slate-50 dark:ring-slate-900';
                buttons.learn.appendChild(chip);
            }
            chip.innerHTML = `<span class="sr-only">K opakování: </span>${due}`;
            chip.title = `K opakování: ${due}`;
        } else if (chip) chip.remove();
        buttons.learn.classList.add('relative');
        buttons.learn.setAttribute('aria-label', due ? `Učení – k opakování: ${due}` : 'Učení');

        // Při hraní je téma poznat na první pohled: barevný štítek a barevný spodní okraj hlavičky
        const place = describePlace();
        const style = place.topic ? styleOf(place.topic) : null;
        updateFactHint();
        document.getElementById('app-header').className = `${HEADER_BASE} ${style && screen === 'round' ? style.accent : 'border-slate-200/70 dark:border-slate-800'}`;
        const badge = document.getElementById('status-badge');
        badge.className = place.logo ? BADGE_LOGO
            : `${BADGE_BASE} ${style ? `${style.soft} border-transparent` : 'bg-white text-slate-700 border-slate-200/60 dark:bg-slate-800 dark:border-slate-700'}`;
        badge.disabled = !place.switch && !place.logo;
        badge.title = place.switch ? 'Změnit téma nebo co hrát' : place.logo ? (dailyFact ? 'Mudrlant: tento den v dějinách · text: můj postup' : 'Můj postup: úroveň a mistrovství témat') : '';
        badge.setAttribute('aria-label', place.switch ? `${place.text} – změnit téma` : place.logo ? `${place.text} – můj postup` : place.text);
        document.getElementById('status-switch').classList.toggle('hidden', !place.switch);
        const iconSlot = document.getElementById('status-icon-slot');
        // Ikona na úzkém displeji ustoupí delšímu názvu tématu; sova na úvodu zůstává
        iconSlot.className = `flex shrink-0 ${place.logo ? '' : 'max-[430px]:hidden'}`;
        iconSlot.innerHTML = place.logo
            ? owlLogo('-my-1', 'h-11 w-auto drop-shadow-md')
            : place.topic && topicArt(place.topic) && place.icon === place.topic.icon ? topicIcon(place.topic, 'h-7 w-7 -my-1')
            : `<i data-lucide="${place.icon}" class="w-5 h-5 ${style ? '' : 'text-slate-600 dark:text-slate-300'}"></i>`;
        renderIcons(iconSlot);
        const text = document.getElementById('status-text');
        if (place.logo) {
            const level = levelProgress(loadProgress().xp);
            text.innerHTML = `<span class="block text-lg font-black normal-case leading-none tracking-tight text-brand-700 dark:text-cream">${escapeHtml(APP_NAME)}</span>`
                + `<span class="mt-1 block text-[10px] font-bold normal-case tracking-wide text-slate-500 dark:text-slate-400">Úr. ${level.level} · ${escapeHtml(titleForLevel(level.level))}</span>`
                + `<span class="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full bg-gold-500" data-progress="${Math.round(level.ratio * 100)}"></span></span>`;
            applyProgress(text);
            // Na úzkém displeji (360 px) se vedle pěti tlačítek vejde jen sova
            text.className = 'text-left max-[370px]:hidden';
        } else {
            text.textContent = place.text;
            text.className = `line-clamp-2 break-words text-left uppercase leading-tight text-[11px] ${style ? '' : 'text-slate-700 dark:text-slate-200'}`;
        }
    };

    // Štítek nahoře: při hraní tématu okno s výběrem kategorií, v mixu výběr témat
    const switchFromBadge = (event) => {
        const place = describePlace();
        // Klepnutí na sovu otevře dnešní zajímavost (před přečtením i po něm), klepnutí na text vedle ní můj postup
        if (place.logo && dailyFact && event && event.target.closest('#status-icon-slot')) { openFact(); return; }
        if (place.logo) { openProgress(); return; }
        if (!place.switch) return;
        openChooser(pool.kind === 'mix' ? { kind: 'mix' } : { kind: 'topic', topic: pool.topic });
    };

    // Načítání v barvě a s ikonou tématu, které se načítá (jinak pohupující se sova z loga)
    const LOADING_OWL = '<img src="icons/topics/sova-premysleni.webp" alt="" class="bob mb-3 h-32 w-32 object-contain drop-shadow-lg">';
    const renderLoading = (text = 'Vybírám otázku…', topic = null) => {
        appContent.innerHTML = `
            <div class="absolute inset-0 z-10 flex flex-col items-center justify-center fade-in bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                ${topic ? (topicArt(topic) ? topicIcon(topic, 'bob mb-5 h-20 w-20') : `<i data-lucide="${topic.icon}" class="w-14 h-14 ${styleOf(topic).text} spin mb-5 drop-shadow-md"></i>`) : LOADING_OWL}
                <p class="text-slate-600 dark:text-slate-300 font-bold tracking-wider text-sm uppercase">${escapeHtml(text)}</p>
            </div>
        `;
        renderIcons(appContent);
    };

    const CARD = 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-sm';
    const CARD_TITLE = 'text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2';
    const HINT_CHIP = 'mb-4 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 inline-flex items-center gap-2';
    const BACK_LINK = 'flex min-h-[2.75rem] w-fit items-center gap-1 rounded-lg pr-3 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white';

    // --- Domů: dnešní otázky (malá tlačítka), dlaždice témat a mixu, učení ---

    const dailyStatus = (topicId, stats) => {
        const result = (stats.daily[topicId] || {})[getDayKey()];
        if (!result) return { text: 'čeká', tone: 'text-slate-500 dark:text-slate-400', icon: '' };
        return result.correct
            ? { text: formatPoints(result.points), tone: 'text-emerald-700 dark:text-emerald-400', icon: '' }
            : { text: 'nevyšlo', tone: 'text-rose-700 dark:text-rose-400', icon: '' };
    };

    // Další neodehraná dnešní otázka: po tématu `afterTopic` v pořadí témat dokola (bez něj od začátku)
    // Další dnešní otázka: náhodné téma z těch, na které se dnes ještě neodpovídalo (ne vždy to stejné pořadí).
    // Volba se drží, dokud se stav dne nezmění, ať tlačítko a následné spuštění nabídnou totéž téma.
    let dailyPick = null;
    const nextDailyTopic = (afterTopic = null) => {
        const stats = loadStats();
        const today = getDayKey();
        const open = TOPICS.filter(topic => topic.id !== afterTopic && !(stats.daily[topic.id] || {})[today]);
        if (!open.length) return null;
        const key = `${today}|${afterTopic}|${open.map(topic => topic.id).join(',')}`;
        if (!dailyPick || dailyPick.key !== key) dailyPick = { key, id: open[Math.floor(Math.random() * open.length)].id };
        return TOPIC_BY_ID[dailyPick.id];
    };

    const SECTION_HEADING = 'text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';

    // Témata na domovské obrazovce a v učení ve skupinách (téma, které v žádné není, přibude do poslední)
    const TOPIC_GROUPS = [
        { label: 'Svět a dějiny', ids: ['zemepis', 'vlajky', 'historie', 'mytologie'] },
        { label: 'Příroda a věda', ids: ['biologie', 'geologie', 'chemie', 'fyzika'] },
        { label: 'Kultura a sport', ids: ['umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport'] }
    ];
    const groupedTopics = () => {
        const groups = TOPIC_GROUPS.map(group => ({ label: group.label, topics: TOPICS.filter(topic => group.ids.includes(topic.id)) }));
        const rest = TOPICS.filter(topic => !TOPIC_GROUPS.some(group => group.ids.includes(topic.id)));
        if (rest.length) groups[groups.length - 1].topics.push(...rest);
        return groups.filter(group => group.topics.length);
    };

    // --- Denní zajímavost: text a odkaz vzniká denně mimo aplikaci (data/fakt.json), pro všechny hráče stejný ---
    const FACT_KEY = 'mudrlant.fakt';
    let dailyFact = null;
    const factRead = () => readJson(FACT_KEY) === getDayKey();
    const validFact = (fact) => Boolean(fact) && fact.date === getDayKey() && typeof fact.title === 'string' && fact.title.length <= 200 && typeof fact.text === 'string' && fact.text.length <= 2000
        && typeof fact.url === 'string' && fact.url.length <= 300 && /^https:\/\/[a-z]+\.wikipedia\.org\/[^\s"'<>]*$/.test(fact.url);
    let factLoading = null;
    const loadDailyFact = async () => {
        try {
            const response = await fetch('data/fakt.json', { cache: 'no-cache' });
            if (!response.ok) return;
            const fact = await response.json();
            if (!validFact(fact)) return;
            dailyFact = fact;
            if (screen === 'home') renderHome();
        } catch (error) { /* bez zajímavosti se úvod prostě ukáže bez bubliny */ }
    };
    // Bublinka u sovy v hlavičce: ukáže se na úvodu, dokud je co říct; tečka zmizí po přečtení
    const updateFactHint = () => {
        const hint = document.getElementById('fact-hint');
        if (!hint) return;
        const factDue = Boolean(dailyFact) && !factRead();
        const offerDue = tournamentBulbDue();
        const show = screen === 'home' && (factDue || offerDue);
        // Bez nové zajímavosti žárovka zve do turnaje (jinak se tlačítko jmenuje podle zajímavosti)
        const title = factDue || !offerDue ? 'Mudrlant ti chce říct, co se stalo tento den' : 'Mudrlant tě zve do týdenního turnaje';
        hint.title = title;
        hint.setAttribute('aria-label', factDue || !offerDue ? 'Tento den v dějinách' : 'Týdenní turnaj: přihlášky jsou otevřené');
        hint.classList.toggle('hidden', !show);
        hint.classList.toggle('flex', show);
        if (show) renderIcons(hint);
    };
    // Zajímavost „vyskočí“ ze sovy v hlavičce: karta s ocáskem k sově, rozevře se z jejího rohu
    const closeFact = () => { const overlay = document.getElementById('fact-overlay'); if (overlay) overlay.remove(); };
    const openFact = () => {
        if (!dailyFact) return;
        closeFact();
        writeJson(FACT_KEY, getDayKey());
        const overlay = document.createElement('div');
        overlay.id = 'fact-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'fact-title');
        overlay.className = 'fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px]';
        overlay.innerHTML = `
            <div class="fact-pop absolute inset-x-3 top-[4.6rem] mx-auto max-w-md">
                <span aria-hidden="true" class="absolute -top-2 left-9 h-4 w-4 rotate-45 rounded-sm bg-white dark:bg-slate-800"></span>
                <div class="relative max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl ring-2 ring-gold-400 dark:bg-slate-800">
                    <button type="button" data-fact-close aria-label="Zavřít" class="absolute right-2 top-2 rounded-full p-1.5 text-slate-500 dark:text-slate-400 active:scale-95"><i data-lucide="x" class="h-5 w-5"></i></button>
                    <p class="flex items-center gap-1.5 whitespace-nowrap pr-8 text-[10px] font-black uppercase tracking-wide text-gold-700 min-[400px]:text-[11px] dark:text-gold-400"><img src="icons/topics/napoveda.webp" alt="" class="-my-1 h-7 w-7 shrink-0 -rotate-12 object-contain drop-shadow-[0_0_4px_rgba(239,197,92,0.8)]"><span class="min-w-0 truncate">Tento den v dějinách · ${escapeHtml(shortDay(getDayKey()))}${Number.isInteger(dailyFact.year) ? ` ${dailyFact.year}` : ''}</span></p>
                    <h2 id="fact-title" class="mt-1.5 text-xl font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(dailyFact.title)}</h2>
                    <p class="mt-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">${escapeHtml(dailyFact.text)}</p>
                    <a data-fact-link href="${escapeHtml(dailyFact.url)}" target="_blank" rel="noopener noreferrer" class="mt-3 flex items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-[15px] font-black text-white"><i data-lucide="external-link" class="h-5 w-5"></i> Číst víc na Wikipedii</a>
                    <p class="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">Zdroj: ${escapeHtml(dailyFact.source || 'Wikipedie')}${dailyFact.page ? ` – ${escapeHtml(dailyFact.page)}` : ''}. Text shrnula umělá inteligence.${dailyFact.category ? ` Dnešní téma: ${escapeHtml(dailyFact.category)}.` : ''}</p>
                </div>
            </div>`;
        overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-fact-close]') || event.target.closest('.fact-pop') === null) closeFact(); });
        document.body.appendChild(overlay);
        renderIcons(overlay);
        overlay.querySelector('[data-fact-close]').focus({ preventScroll: true });
        if (screen === 'home') renderHome();
    };

    const renderHome = () => {
        screen = 'home';
        closePlaceInfo();
        settleGoals();
        const stats = loadStats();
        const today = getDayKey();
        // Dnešní otázky: ikona tématu a stav, název v popisku (14 témat se vejde do dvou řádků)
        const dailyButtons = TOPICS.map(topic => {
            const status = dailyStatus(topic.id, stats);
            const streak = computeStreak(stats.daily[topic.id] || {}, today);
            return `
                <button type="button" data-action="daily" data-topic="${topic.id}" title="Dnešní otázka – ${escapeHtml(topic.title)}" aria-label="Dnešní otázka – ${escapeHtml(topic.title)}: ${escapeHtml(status.text)}" class="relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-slate-50 px-0.5 pb-1 pt-1 ring-1 ring-slate-200/70 transition-all active:scale-95 dark:bg-slate-900/60 dark:ring-slate-700/70">
                    ${topicIcon(topic, 'h-7 w-7', `rounded-lg p-1 ${styleOf(topic).soft}`, 'h-[1.125rem] w-[1.125rem]')}
                    <span class="flex max-w-full items-center gap-0.5 truncate text-[10px] font-bold ${status.tone}">${status.icon ? `<i data-lucide="${status.icon}" class="h-3 w-3 shrink-0"></i>` : ''}${status.text}</span>
                    ${streak ? `<span class="absolute -right-1.5 -top-2 flex items-center rounded-lg bg-slate-900/85 py-px pl-0 pr-1.5 text-[10px] font-black text-white shadow ring-1 ring-white/20" title="Série dní">${uiArt('serie', 'h-4 w-4')}${streak}</span>` : ''}
                </button>`;
        }).join('');
        const answered = TOPICS.filter(topic => (stats.daily[topic.id] || {})[today]).length;
        const scopeOf = (topic) => {
            const chosen = selectedCategories(topic);
            return chosen.length === topic.categories.length ? '' : chosen.length === 1 ? categoryOf(topic, chosen[0]).label : `${chosen.length} z ${topic.categories.length}`;
        };
        // Dlaždice tématu: ikona a název, omezený výběr kategorií jako malý štítek
        const tile = (topic) => {
            const scope = scopeOf(topic);
            return `
                <button type="button" data-action="play-topic" data-topic="${topic.id}"${scope ? ` title="${escapeHtml(`${topic.title} · ${scope}`)}"` : ''} class="relative flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-gradient-to-br p-1.5 text-center text-white shadow-md ring-1 ring-black/5 transition-all active:scale-[0.97] ${styleOf(topic).tile}">
                    ${topicArt(topic) ? topicIcon(topic, 'h-11 w-11') : `<i data-lucide="${topic.icon}" class="h-[1.625rem] w-[1.625rem]"></i>`}
                    <span class="block ${topic.title.length > 10 ? 'text-[10px]' : 'text-[11.5px]'} font-black leading-tight tracking-tight">${escapeHtml(topic.title)}</span>
                </button>`;
        };
        const mixScope = settings.topics.length === TOPICS.length ? 'Otázky ze všech témat' : `${settings.topics.length} z ${TOPICS.length} témat`;
        const mixTile = `
            <button type="button" data-action="play-mix" title="${escapeHtml(`Mix · ${mixScope}`)}" class="relative col-span-2 flex min-h-[4rem] min-w-0 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-br p-2.5 text-left text-white shadow-md ring-1 ring-black/5 transition-all active:scale-[0.97] ${styleOf(MIX).tile}">
                                ${topicIcon(MIX, 'h-12 w-12')}
                <span class="min-w-0 text-base font-black leading-tight">${escapeHtml(MIX.title)}</span>
            </button>`;
        const ordered = groupedTopics().flatMap(group => group.topics);
        const left = TOPICS.length - answered;
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 pb-4 dark:bg-slate-900">
                ${renderHomeTabs()}
                ${homeTab() === 'multi' ? renderChallengesSection() : `<section class="rounded-[1.4rem] bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
                    <div class="mb-2 flex items-center justify-between gap-2">
                        <h2 class="flex min-w-0 items-center gap-2 whitespace-nowrap text-slate-800 dark:text-slate-100">${uiArt('dnes', 'h-8 w-8')}<span class="min-w-0"><span class="block text-[13px] font-black leading-tight">Dnešní otázky</span><span class="block text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400">${answered}/${TOPICS.length} splněno</span></span></h2>
                        ${left ? `
                            <button type="button" data-action="play-daily" class="flex shrink-0 items-center gap-1.5 rounded-xl btn-3d bg-brand-700 px-3 py-2 text-[13px] font-black text-white">
                                <i data-lucide="play" class="h-4 w-4"></i> ${answered ? 'Pokračovat' : 'Hrát vše'} <span class="font-bold opacity-90">· zbývá ${left}</span>
                            </button>` : `
                            <span class="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><i data-lucide="circle-check" class="h-4 w-4"></i> Vše hotové</span>`}
                    </div>
                    <div class="grid grid-cols-7 gap-1">${dailyButtons}</div>
                </section>
                ${renderGoalsCard()}
                <section class="grid max-h-[26rem] flex-1 grid-cols-4 auto-rows-fr gap-2">${mixTile}${ordered.map(tile).join('')}</section>`}
            </div>`;
        applyProgress(appContent);
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
        refreshChallenges();
        if (Tutorial) Tutorial.maybeStart({ ready: factLoading });
    };

    // --- Otázka: popis hned, pak nápovědy fotka → obrazová nápověda tématu → fakta ---

    const cssUrl = (url) => `url("${url.replace(/["\\]/g, '\\$&')}")`;

    // Fotka je pozadí prvku, ne <img> – podržením nejde otevřít a z adresy souboru vyčíst název.
    // Ukáže se celá (nic se neořízne) na rozmazaném pozadí ze sebe sama; když je na ploše moc malá
    // (vysoký portrét v široké ploše), objeví se tlačítko na zvětšení přes celou obrazovku.
    const loadImageSize = (url) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = url;
    });
    // alwaysZoom = zvětšení i u fotky, která se vejde (obraz nebo nerost, na který se otázka ptá)
    const showPhoto = async (element, url, onFail, alwaysZoom = false, masks = null) => {
        try {
            if (!url) throw new Error('Fotka chybí');
            const size = await loadImageSize(url);
            if (!element.isConnected) return;
            element.style.backgroundImage = cssUrl(url);
            Visuals.maskOverlay(element, size.width, size.height, masks);
            const frame = element.parentElement;
            const backdrop = frame.querySelector('[data-photo-backdrop]');
            if (backdrop) backdrop.style.backgroundImage = cssUrl(url);
            const box = element.getBoundingClientRect();
            const ratio = size.width / size.height;
            const boxRatio = box.width / box.height;
            const zoom = frame.querySelector('[data-photo-zoom]');
            if (zoom && (alwaysZoom || Math.min(ratio / boxRatio, boxRatio / ratio) < 0.6)) {
                zoom.dataset.url = url;
                if (masks && masks.length) zoom.dataset.masks = JSON.stringify(masks);
                else delete zoom.dataset.masks;
                zoom.classList.remove('hidden');
            }
        } catch (e) {
            if (onFail) onFail();
            const failure = element.parentElement && element.parentElement.querySelector('[data-photo-failed]');
            if (failure) failure.classList.remove('hidden');
        }
    };
    // Zvětšená fotka přes celou obrazovku; zavře se klepnutím kamkoli nebo Escape
    const closePhotoZoom = () => {
        const overlay = document.getElementById('photo-zoom');
        if (overlay) overlay.remove();
    };
    const openPhotoZoom = (url, masks = null) => {
        closePhotoZoom();
        const overlay = document.createElement('div');
        overlay.id = 'photo-zoom';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Zvětšená fotka');
        overlay.className = 'fade-in fixed inset-0 z-[60] bg-black/90 p-3';
        overlay.innerHTML = `
            <div data-zoom-image class="h-full w-full bg-contain bg-center bg-no-repeat" aria-hidden="true"></div>
            <button type="button" data-close aria-label="Zavřít" class="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white backdrop-blur-sm"><i data-lucide="x" class="h-6 w-6"></i></button>`;
        const zoomImage = overlay.querySelector('[data-zoom-image]');
        zoomImage.style.backgroundImage = cssUrl(url);
        if (masks) loadImageSize(url).then(size => Visuals.maskOverlay(zoomImage, size.width, size.height, masks)).catch(() => {});
        overlay.addEventListener('click', closePhotoZoom);
        trapFocus(overlay);
        document.body.appendChild(overlay);
        renderIcons(overlay);
        overlay.querySelector('[data-close]').focus();
    };
    // Rámeček fotky: zástupná ikona, rozmazané pozadí, celá fotka a skryté tlačítko na zvětšení
    const photoFrame = (attributes) => `
        <div class="absolute inset-0 flex items-center justify-center bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-600"><i data-lucide="image" class="h-10 w-10"></i></div>
        <p data-photo-failed class="hidden absolute inset-x-0 top-1/2 mt-8 text-center text-sm text-slate-500 dark:text-slate-400">Fotku se nepodařilo načíst</p>
        <div data-photo-backdrop class="absolute inset-0 scale-110 bg-cover bg-center opacity-50 blur-xl" aria-hidden="true"></div>
        <div ${attributes} class="absolute inset-0 bg-contain bg-center bg-no-repeat" aria-hidden="true"></div>
        <button type="button" data-photo-zoom aria-label="Zvětšit fotku" class="hidden absolute bottom-2 right-2 rounded-xl bg-black/65 p-3 text-white shadow backdrop-blur-sm"><i data-lucide="expand" class="h-4 w-4"></i></button>`;

    const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    // Záložka nápovědy: „Fakta“ místo dlouhého „Čísla a fakta“, jinak název nápovědy
    const tabLabel = (hint) => hint.kind === 'facts' && !hint.extra ? 'Fakta' : capitalize(hint.label);

    const renderFactsList = (facts) => `
        <dl class="grid grid-cols-2 gap-2">
            ${facts.map(fact => `
                <div class="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/60">
                    <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(fact.label)}</dt>
                    <dd class="mt-0.5 text-[15px] font-bold leading-snug text-slate-800 dark:text-slate-100">${escapeHtml(fact.value)}</dd>
                </div>`).join('')}
        </dl>`;

    // Rámeček obrazové nápovědy (mapa, časová osa…) – obsah dokreslí visuals.js; caption = nadpis nad rámečkem
    const renderVisualFrame = (spec, { id, height = 'h-52', rounded = 'rounded-2xl', caption = false }) => {
        const visual = Visuals.info(spec);
        if (!visual) return '';
        const corner = visual.corner ? visual.corner(spec) : '';
        return `
            ${caption ? `<h3 class="${CARD_TITLE} -mb-2"><i data-lucide="${visual.icon}" class="h-4 w-4"></i> ${escapeHtml(capitalize(visual.name))}</h3>` : ''}
            <section class="relative ${height} shrink-0 overflow-hidden border ${rounded} ${visual.frame}">
                <div ${id ? `id="${id}"` : 'data-visual'} class="absolute inset-0" role="img" aria-label="${escapeHtml(visual.describe(spec))}"></div>
                ${corner ? `<span class="absolute bottom-2 right-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(corner)}</span>` : ''}
            </section>`;
    };

    // Plochy panelu: popis, fotka, obrazová nápověda (výsledek přidá mapu a snímek z družice)
    const photoPane = (id) => `<div class="absolute inset-0 overflow-hidden">${photoFrame(`id="${id}"`)}</div>`;
    const visualPane = (id, spec) => {
        const visual = Visuals.info(spec);
        const corner = visual.corner ? visual.corner(spec) : '';
        return `
            <div class="absolute inset-0 ${visual.frame}">
                <div id="${id}" class="absolute inset-0" role="img" aria-label="${escapeHtml(visual.describe(spec))}"></div>
                ${corner ? `<span class="absolute bottom-2 right-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(corner)}</span>` : ''}
            </div>`;
    };
    const factsPane = (facts) => `<div class="absolute inset-0 overflow-y-auto p-2.5"><h3 class="sr-only">Čísla a fakta</h3>${renderFactsList(facts)}</div>`;
    const textPane = (data, style) => `
        <div class="absolute inset-0 overflow-y-auto overscroll-contain p-3.5">
            ${data.question.showName ? `
                <div class="${HINT_CHIP}">
                    <i data-lucide="tag" class="w-4 h-4 ${style.text}"></i>
                    <span class="font-medium">Název:</span> <b class="text-slate-800 dark:text-slate-100">${escapeHtml(data.name)}</b>
                </div>` : ''}
            ${data.questionText
                ? `<p class="text-[15px] font-medium italic leading-snug text-slate-700 dark:text-slate-200">„${escapeHtml(data.questionText)}“</p>`
                : '<p class="text-sm text-slate-500 dark:text-slate-400">Popis se teď nepodařilo načíst z Wikipedie – pomůžou nápovědy.</p>'}
            ${(data.leadFacts || []).length ? `
                <dl class="mt-2.5 flex flex-wrap gap-1.5" aria-label="Co o tom víme">
                    ${data.leadFacts.map(fact => `<div class="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-900/60"><dt class="inline font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(fact.label)}:</dt> <dd class="inline font-bold text-slate-800 dark:text-slate-100">${escapeHtml(fact.value)}</dd></div>`).join('')}
                </dl>` : ''}
        </div>`;
    const excerptPane = (hint) => `
        <div class="absolute inset-0 overflow-y-auto overscroll-contain p-3.5">
            <p class="text-[15px] font-medium italic leading-snug text-slate-700 dark:text-slate-200">„${escapeHtml(hint.text)}“</p>
        </div>`;

    // Panel se záložkami a jednou plochou pevné výšky – nápovědy se nepřidávají pod sebe, takže se nic neposouvá
    // panes = [{ key, label, icon, html }], action = akce záložky, extra = tlačítko za záložkami
    // Výška panelu: na vysokém telefonu víc místa pro fotku a mapu, na malém aspoň 11 rem (bez posouvání)
    const QUESTION_PANEL_HEIGHT = 'h-[clamp(8.5rem,calc(100dvh_-_35rem),18rem)]';
    const RESULT_PANEL_HEIGHT = 'h-[clamp(13rem,42dvh,24rem)]';
    // Vybraná záložka s názvem, ostatní jen ikonou (s popiskem pro čtečku) – vejdou se i na úzký displej;
    // jediná plocha záložky nepotřebuje, jen nadpis
    const renderTabbedPanel = (panes, active, action, height) => {
        const style = styleOf(TOPIC_BY_ID[current.topic]);
        const pane = panes.find(candidate => candidate.key === active) || panes[0];
        const tabs = panes.length > 1 ? `
            <div class="flex items-center gap-1 overflow-x-auto border-b border-slate-100 p-1.5 dark:border-slate-700" role="tablist">
                ${panes.map(candidate => {
                    const selected = candidate.key === pane.key;
                    return `
                        <button type="button" role="tab" aria-selected="${selected}" aria-label="${escapeHtml(candidate.label)}" title="${escapeHtml(candidate.label)}" data-action="${action}" data-step="${candidate.key}" class="flex min-h-[2.25rem] shrink-0 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${selected ? `px-3 ${style.tab}` : `min-w-[2.75rem] px-2.5 ${TAB_OFF}`}">
                            <i data-lucide="${candidate.icon}" class="h-4 w-4"></i>${selected ? escapeHtml(candidate.label) : ''}
                        </button>`;
                }).join('')}
            </div>` : `
            <h3 class="${CARD_TITLE} min-h-[2.75rem] border-b border-slate-100 px-4 dark:border-slate-700"><i data-lucide="${pane.icon}" class="h-4 w-4 ${style.text}"></i> ${escapeHtml(pane.label)}</h3>`;
        return `
            <section id="${action}-panel" class="${CARD} shrink-0 overflow-hidden">
                ${tabs}
                <div class="relative ${height} overflow-hidden" role="tabpanel">${pane.html}</div>
            </section>`;
    };

    // První obrazová nápověda má id hint-visual, další (mapa i vlajka u státního znaku) hint-visual-2…: každá karta vlastní prvek
    const visualHintId = (hint) => hint.key === 'visual' ? 'hint-visual' : `hint-${hint.key}`;
    const hintPanes = (hints) => {
        return hints.map(hint => {
            const html = hint.kind === 'visual' ? visualPane(visualHintId(hint), hint.spec)
                : hint.kind === 'photo' ? photoPane('hint-photo') : hint.kind === 'excerpt' ? excerptPane(hint) : factsPane(hint.facts);
            return { key: hint.key, label: tabLabel(hint), icon: hint.icon, html };
        });
    };

    // Panel otázky: popis a odemčené nápovědy, za záložkami tlačítko na další nápovědu
    const questionPanel = (data) => {
        const style = styleOf(TOPIC_BY_ID[data.topic]);
        const unlocked = data.hints.slice(0, round.hintLevel - 1);
        const image = data.questionImage ? [{ key: 'image', label: data.questionImage.label, icon: data.questionImage.icon, html: photoPane('question-image') }] : [];
        const panes = [...image, { key: 'text', label: 'Popis', icon: 'quote', html: textPane(data, style) }, ...hintPanes(unlocked)];
        return renderTabbedPanel(panes, round.tab || panes[0].key, 'hint-tab', QUESTION_PANEL_HEIGHT);
    };
    // Tlačítko další nápovědy přes celou šířku pod popisem: co odemkne a za kolik pak bude odpověď
    const nextHintButton = (data) => {
        const next = data.hints[round.hintLevel - 1];
        if (!data.hints.length) return '';
        // Všechny nápovědy odemčené: stejně vysoký klidný pruh, ať se odpovědi nic neposune
        if (!next) return `<div class="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-xs font-bold text-slate-500 dark:border-slate-600 dark:text-slate-400"><i data-lucide="lightbulb" class="h-4 w-4"></i> Všechny nápovědy jsou odemčené</div>`;
        const nextCost = formatPoints(pointsFor(round.hintLevel + 1, round.variant === 'typed'));
        return `
            <button type="button" data-action="hint" title="Nápověda: ${escapeHtml(next.label)} – odpověď pak za ${nextCost}" class="btn-3d flex h-12 w-full shrink-0 items-center gap-3 rounded-2xl bg-gradient-to-b from-gold-400 to-gold-600 px-3 text-left text-brand-950">
                ${uiArt('napoveda', 'h-9 w-9 -my-1')}
                <span class="min-w-0 flex-1">
                    <span class="block text-[11px] font-black uppercase tracking-wider opacity-90">Nápověda ${round.hintLevel}/${data.hints.length + 1}</span>
                    <span class="flex items-baseline gap-1.5 text-sm font-black leading-tight"><span class="truncate">${escapeHtml(capitalize(next.label))}</span><span class="shrink-0 text-xs font-bold opacity-90">· pak ${nextCost}</span></span>
                </span>
                <i data-lucide="${next.icon}" class="h-5 w-5 shrink-0 opacity-70"></i>
            </button>`;
    };

    const renderAnswerInput = (data) => {
        const style = styleOf(TOPIC_BY_ID[data.topic]);
        if (round.variant === 'typed') {
            return `
                <form id="answer-form" class="flex gap-2" autocomplete="off">
                    <label for="answer-input" class="sr-only">Odpověď</label>
                    <input id="answer-input" name="answer" type="text" enterkeyhint="send" placeholder="${escapeHtml(data.question.placeholder)}" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-800 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    <button type="submit" aria-label="Odeslat odpověď" class="flex items-center justify-center rounded-xl px-4 text-white shadow-md transition-all active:scale-95 ${style.button} btn-3d">
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>
                </form>`;
        }
        const choicesHtml = data.question.choices.map((choice, index) => `
            <button type="button" data-action="choice" data-index="${index}" class="btn-3d-light min-h-[3rem] rounded-xl bg-white px-3 py-1.5 text-sm font-bold leading-tight text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                ${escapeHtml(choice.label)}
            </button>
        `).join('');
        return `<div class="grid grid-cols-2 gap-2">${choicesHtml}</div>`;
    };

    // Obsah panelů dokreslíme až v DOM (fotka se načítá, mapa a nápovědy potřebují rozměry)
    const mountPanels = () => {
        if (!current) return;
        // Vybraná záložka musí být vidět, i když se řádek záložek na úzký displej nevejde
        appContent.querySelectorAll('[role="tablist"]').forEach(list => {
            const active = list.querySelector('[aria-selected="true"]');
            const overflow = active ? active.getBoundingClientRect().right - list.getBoundingClientRect().right : 0;
            if (overflow > 0) list.scrollLeft += overflow + 8;
        });
        const hintPhoto = document.getElementById('hint-photo');
        if (hintPhoto) showPhoto(hintPhoto, current.photoUrl, null, false, current.photoMasks);
        const questionImage = document.getElementById('question-image');
        if (questionImage) showPhoto(questionImage, current.questionImage.url, null, true, current.questionImage.masks);
        const resultImage = document.getElementById('result-image');
        if (resultImage) showPhoto(resultImage, current.questionImage.url);
        current.hints.filter(hint => hint.kind === 'visual').forEach(hint => {
            const element = document.getElementById(visualHintId(hint));
            if (element) Visuals.render(element, hint.spec, visualDeps);
        });
        const resultPhoto = document.getElementById('result-photo');
        if (resultPhoto) showPhoto(resultPhoto, current.photoUrl);
        const satellite = document.getElementById('result-satellite');
        if (satellite && current.coords) renderTiles(satellite, current.coords.lat, current.coords.lon, RESULT_SATELLITE_ZOOM, SATELLITE_TILES);
        renderMap();
        const resultVisual = document.getElementById('result-visual');
        // Rozehraná otázka uložená starší verzí výsledkovou nápovědu nemá
        if (resultVisual) Visuals.render(resultVisual, current.resultVisual || current.visual, visualDeps);
    };

    // Přepnutí záložky překreslí jen panel – zbytek stránky ani posunutí se nehne
    const switchTab = (action, step) => {
        if (!round || !current) return;
        if (action === 'hint-tab') round.tab = step;
        else round.resultTab = step;
        persistState();
        const panel = document.getElementById(`${action}-panel`);
        if (!panel) return;
        panel.insertAdjacentHTML('afterend', action === 'hint-tab' ? questionPanel(current) : resultPanel(current));
        panel.remove();
        renderIcons(appContent);
        mountPanels();
    };

    // Turnaj: živý čas u každé otázky (rozhoduje při shodě správných odpovědí i bodů), přestane se počítat po odpovědi
    let tourTimer = null;
    const formatQuestionTime = (ms) => { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
    const startTourTimer = (startedAt) => {
        clearInterval(tourTimer);
        const tick = () => {
            const el = document.querySelector('[data-tour-timer]');
            if (!el) { clearInterval(tourTimer); return; }
            el.textContent = formatQuestionTime(Date.now() - startedAt);
        };
        tick();
        tourTimer = setInterval(tick, 500);
    };
    // Tlačítko „Nahlásit chybu v otázce“ (okno otázky: jen ikona vedle „Nevím“, výsledek: s textem vedle Wikipedie); okno je openReportDialog
    const REPORT_ICON_BUTTON = '<button type="button" data-action="report-question" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800" title="Nahlásit chybu v otázce" aria-label="Nahlásit chybu v otázce"><i data-lucide="flag" class="h-4 w-4"></i></button>';
    const REPORT_TEXT_BUTTON = '<button type="button" data-action="report-question" class="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" aria-label="Nahlásit chybu v otázce"><i data-lucide="flag" class="h-4 w-4"></i> Nahlásit chybu</button>';
    const renderQuestion = (keepScroll) => {
        const data = current;
        const topic = TOPIC_BY_ID[data.topic];
        const style = styleOf(topic);
        const level = round.hintLevel;
        const typed = round.variant === 'typed';
        const category = categoryOf(topic, data.category);
        const answerCard = `
            <section class="${CARD} p-3">
                <div class="mb-2 flex items-center justify-between gap-2">
                    <h3 class="${CARD_TITLE} shrink-0"><i data-lucide="target" class="w-4 h-4 ${style.text}"></i> Za ${formatPoints(pointsFor(level, typed))}</h3>
                    ${data.hints.length ? `<span class="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400" title="Použité nápovědy">Nápovědy ${level - 1}/${data.hints.length}<span class="flex gap-1" aria-hidden="true">${data.hints.map((_, index) => `<span class="h-2 w-2 rounded-full ${index < level - 1 ? 'bg-gold-500' : 'bg-slate-300 dark:bg-slate-600'}"></span>`).join('')}</span></span>` : ''}
                </div>
                ${renderAnswerInput(data)}
            </section>`;

        // Při psaní je pole nahoře: otevřená klávesnice by ho jinak zakryla
        appContent.innerHTML = `
            <div class="${keepScroll ? '' : 'fade-in '}flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 pb-3 dark:bg-slate-900">
                <div class="relative flex flex-col items-center gap-1 text-center">
                    ${mode === 'challenge' && challenge && challenge.tournament ? `<span class="absolute right-0 top-0 inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-black tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-100" title="Čas na tuto otázku: při shodě rozhoduje rychlejší hráč"><i data-lucide="timer" class="h-3.5 w-3.5"></i><span data-tour-timer>0:00</span></span>` : ''}
                    <span class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${style.solid}">
                        <i data-lucide="${category.icon}" class="h-3 w-3"></i> ${escapeHtml(data.typeLabel)}
                    </span>
                    <h2 class="text-[22px] font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(data.question.title)}</h2>
                </div>
                ${typed ? `${answerCard}${questionPanel(data)}${nextHintButton(data)}` : `${questionPanel(data)}${nextHintButton(data)}${answerCard}`}
                <div class="flex items-center justify-center gap-1">
                    <button type="button" data-action="give-up" class="flex min-h-[2.75rem] items-center gap-2 px-3 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                        <i data-lucide="eye" class="w-4 h-4"></i> Nevím, ukázat odpověď
                    </button>
                    ${canReport() && mode !== 'challenge' ? REPORT_ICON_BUTTON : ''}
                </div>
            </div>
        `;

        renderIcons(appContent);
        mountPanels();
        if (appContent.querySelector('[data-tour-timer]')) {
            if (!round.timerStart) round.timerStart = Date.now();
            startTourTimer(round.timerStart);
        } else clearInterval(tourTimer);
        if (!keepScroll) appContent.scrollTo(0, 0);
        // Po nápovědě fokus na její záložku (klávesnice by jinak skončila na začátku stránky)
        else if (document.activeElement === document.body) {
            const tab = appContent.querySelector('[data-action="hint-tab"][aria-selected="true"]');
            if (tab) tab.focus({ preventScroll: true });
        }
    };

    // --- Karta položky: okno s popisem (po odpovědi) a atlas v učení ---

    const wikipediaUrl = (title) => `https://cs.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

    const renderItemCard = (item, ctx, { titleId, compact }) => {
        const { topic } = ctx;
        const category = categoryOf(topic, item.c);
        const hasPhoto = Boolean(photoOf(item, 500));
        const facts = topic.facts(item, ctx, 'card');
        const visual = topic.visual ? topic.visual(item, ctx, 'card') : null;
        return `
            ${hasPhoto ? `
                <div data-card-photo class="relative ${compact ? 'h-52' : 'h-64'} shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
                    ${photoFrame('data-photo')}
                </div>
            ` : ''}
            <div class="flex flex-col gap-4 p-5">
                <div class="${compact ? 'pr-10' : ''}">
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white ${styleOf(topic).solid}">
                            <i data-lucide="${category.icon}" class="h-3.5 w-3.5"></i> ${escapeHtml(item.ty || category.one)}
                        </span>
                        <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-300">${item.k ? 'Známé' : 'Méně známé'}</span>
                    </div>
                    <h2 id="${titleId}" class="text-2xl font-black leading-tight text-slate-800 dark:text-slate-50">${escapeHtml(item.n)}</h2>
                    <p class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <i data-lucide="${topic.subtitleIcon || 'navigation'}" class="h-4 w-4 shrink-0 ${styleOf(topic).text}"></i> ${escapeHtml(topic.subtitle(item, ctx))}
                    </p>
                </div>
                <p data-card-text class="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">Načítám popis…</p>
                ${visual && Visuals.info(visual) ? renderVisualFrame(visual, { height: compact ? 'h-40' : 'h-52', caption: true }) : ''}
                ${facts.length ? renderFactsList(facts) : ''}
                <a href="${wikipediaUrl(item.t)}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
                    <i data-lucide="book-open" class="h-4 w-4"></i> Více na Wikipedii
                </a>
            </div>`;
    };

    // Fotka, obrazová nápověda a popis se do karty doplní, až se načtou; fotka, která se nenačte, z karty zmizí
    const hydrateItemCard = async (root, item, ctx, photoWidth) => {
        const photo = root.querySelector('[data-photo]');
        if (photo) {
            showPhoto(photo, photoOf(item, photoWidth), () => { const box = root.querySelector('[data-card-photo]'); if (box) box.remove(); });
        }
        const visualBox = root.querySelector('[data-visual]');
        if (visualBox) Visuals.render(visualBox, ctx.topic.visual(item, ctx, 'card'), visualDeps);
        const text = await fetchItemText(item);
        const target = root.querySelector('[data-card-text]');
        if (!target || !target.isConnected) return;
        target.textContent = text.description || 'Popis se teď nepodařilo načíst – víc najdeš na Wikipedii.';
        target.classList.remove('text-slate-500', 'dark:text-slate-400');
        target.classList.add('text-slate-700');
        target.classList.add('dark:text-slate-200');
    };

    const closePlaceInfo = () => {
        const overlay = document.getElementById('place-info');
        if (overlay) overlay.remove();
    };

    // Malé okno s popisem položky – po odpovědi se tak hráč dozví, co bylo ve špatné odpovědi
    const openItemInfo = async (topicId, id) => {
        const ctx = await loadTopic(topicId).catch(() => null);
        const item = ctx && ctx.byId.get(id);
        if (!item) {
            showToast('O tomhle teď nic nevím');
            return;
        }
        closePlaceInfo();
        const overlay = document.createElement('div');
        overlay.id = 'place-info';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'place-info-title');
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
        overlay.innerHTML = `
            <div class="fade-in relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white shadow-2xl dark:bg-slate-900">
                <!-- Zavírací tlačítko zůstane vidět i po posunutí dolů -->
                <div class="pointer-events-none sticky top-0 z-10 -mb-14 flex justify-end p-3">
                    <button type="button" data-close aria-label="Zavřít" class="pointer-events-auto rounded-full bg-slate-900/60 p-2.5 text-white backdrop-blur-sm hover:bg-slate-900/80">
                        <i data-lucide="x" class="h-5 w-5"></i>
                    </button>
                </div>
                ${renderItemCard(item, ctx, { titleId: 'place-info-title', compact: true })}
            </div>`;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) closePlaceInfo();
        });
        document.body.appendChild(overlay);
        trapFocus(overlay);
        renderIcons(overlay);
        overlay.querySelector('[data-close]').focus();
        hydrateItemCard(overlay, item, ctx, 500);
    };

    // --- Výsledek ---

    const renderTiles = (container, lat, lon, zoom, template) => {
        if (!container) return;
        container.textContent = '';
        for (const tile of getTileLayout(lat, lon, zoom, container.clientWidth, container.clientHeight, template)) {
            const image = document.createElement('img');
            image.src = tile.url;
            image.alt = '';
            image.draggable = false;
            image.className = 'absolute h-64 w-64 max-w-none select-none';
            image.style.left = `${tile.left}px`;
            image.style.top = `${tile.top}px`;
            container.appendChild(image);
        }
    };

    // Položka, o které jde ukázat okno s popisem (jen pokud ji načtená data znají)
    const isKnownRef = (ref) => {
        if (!ref || !ref.id) return false;
        const ctx = loadedTopics.get(ref.topic);
        return Boolean(ctx && ctx.byId.has(ref.id));
    };
    // Otázka obnovená z uložení se vykreslí hned; po načtení tématu se výsledek překreslí,
    // ať se objeví okna s popisem nabízených možností
    const refreshWhenTopicLoads = (data) => {
        loadTopic(data.topic).then(() => {
            if (screen === 'round' && current === data && round && round.answered) renderRound({ keepScroll: true });
        }).catch(() => {});
    };
    // Řádek „+30 XP“ s rozpisem (odpověď, dnešní otázka, série…) pod výsledkem
    const xpLine = (xp, tone) => xp && (xp.total || (xp.badges && xp.badges.length))
        ? `<div class="mt-0.5 text-xs font-bold ${tone}">${xp.total ? `<span class="inline-block rounded-md bg-gold-500 px-1.5 py-0.5 font-black text-brand-950">+${xp.total} XP</span>` : ''}${(xp.badges || []).map(title => `<span class="ml-1 inline-flex items-center gap-1 rounded-md bg-brand-700 px-1.5 py-0.5 font-black text-white"><i data-lucide="award" class="h-3 w-3"></i>${escapeHtml(title)}</span>`).join('')}${xp.parts.length ? `<ul class="mt-1 space-y-0.5 font-semibold opacity-90">${xp.parts.map(part => `<li>+${part.xp} XP ${escapeHtml(part.label)}</li>`).join('')}</ul>` : ''}</div>` : '';

    const renderResultBanner = (data) => {
        // Kolik nápověd hráč použil z kolika, které otázka měla
        const levels = `${round.hintLevel - 1}/${data.hints.length}`;
        if (round.correct) {
            return `
                <div data-verdict tabindex="-1" class="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 outline-none dark:border-emerald-800 dark:bg-emerald-900/30">
                    ${uiArt('sova-radost', 'h-[4.5rem] w-[4.5rem] -my-3')}
                    <div>
                        <p class="font-black text-emerald-800 dark:text-emerald-200">Správně! +${formatPoints(round.points)}</p>
                        <p class="text-sm text-emerald-800 dark:text-emerald-300">${round.typed ? 'Napsaná odpověď' : 'Výběr z možností'}${data.hints.length ? ` · nápovědy ${levels}` : ''}</p>
                        ${xpLine(round.xp, 'text-emerald-800 dark:text-emerald-300')}
                    </div>
                </div>`;
        }
        return `
            <div data-verdict tabindex="-1" class="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 outline-none dark:border-rose-800 dark:bg-rose-900/30">
                ${uiArt('sova-smutek', 'h-[4.5rem] w-[4.5rem] -my-3')}
                <div>
                    <p class="font-black text-rose-800 dark:text-rose-200">${round.gaveUp ? 'Tentokrát bez odpovědi' : 'Bohužel, to není ono'}</p>
                    <p class="text-sm text-rose-800 dark:text-rose-300">${round.answer ? `Tvoje odpověď: ${escapeHtml(round.answer)} · ` : ''}Správně: ${escapeHtml(data.question.answerLabel)}</p>
                    ${xpLine(round.xp, 'text-rose-800 dark:text-rose-300')}
                    ${round.answerRef ? `
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(round.answerRef.topic)}" data-id="${escapeHtml(round.answerRef.id)}" class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900">
                            <i data-lucide="info" class="h-3.5 w-3.5"></i> Ukaž ${escapeHtml(round.answer)}
                        </button>
                    ` : ''}
                </div>
            </div>`;
    };

    // Nabízené možnosti z otázky: co jsou zač, ať se hráč učí i z těch, které nezvolil
    const renderOtherChoices = (data) => {
        if (round.variant !== 'choices') return '';
        const answered = round.answerRef && round.answerRef.id;
        const others = data.question.choices
            .map(choice => ({ ...choice, topic: choice.topic || data.topic }))
            .filter(choice => !choice.correct && choice.id !== answered && isKnownRef(choice));
        if (!others.length) return '';
        return `
            <section class="${CARD} p-4">
                <h3 class="${CARD_TITLE} mb-3"><i data-lucide="graduation-cap" class="w-4 h-4 ${styleOf(TOPIC_BY_ID[data.topic]).text}"></i> ${answered ? 'A ostatní možnosti?' : 'Co byly ostatní možnosti?'}</h3>
                <div class="flex flex-wrap gap-2">
                    ${others.map(choice => `
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(choice.topic)}" data-id="${escapeHtml(choice.id)}" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-white dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700">
                            <i data-lucide="info" class="h-4 w-4 ${styleOf(TOPIC_BY_ID[data.topic]).text}"></i> ${escapeHtml(choice.label)}
                        </button>`).join('')}
                </div>
            </section>`;
    };

    const renderStatsCard = (data) => {
        const stats = loadStats();
        if (mode === 'daily' && data.dailyDate) {
            const results = Object.values(stats.daily[data.topic] || {});
            const wins = results.filter(result => result.correct).length;
            const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
            return `
                <section class="${CARD} flex items-center gap-2 p-3">
                    <div class="grid flex-1 grid-cols-3 gap-1 text-center">
                        <div><p class="text-xl font-black text-slate-800 dark:text-slate-100">${computeStreak(stats.daily[data.topic] || {}, getDayKey())}</p><p class="flex items-center justify-center gap-1 ${label}">${uiArt('serie', 'h-5 w-5')}Série</p></div>
                        <div><p class="text-xl font-black text-slate-800 dark:text-slate-100">${results.length}</p><p class="${label}">Hráno</p></div>
                        <div><p class="text-xl font-black text-slate-800 dark:text-slate-100">${wins}</p><p class="${label}">Uhodnuto</p></div>
                    </div>
                    <button type="button" data-action="share" aria-label="Sdílet výsledek" class="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-md transition-all active:scale-95 ${styleOf(TOPIC_BY_ID[data.topic]).button}">
                        <i data-lucide="share-2" class="h-4 w-4"></i> Sdílet
                    </button>
                </section>`;
        }
        return `
            <section class="${CARD} flex items-center gap-3 p-4">
                <i data-lucide="trophy" class="h-8 w-8 shrink-0 text-gold-500"></i>
                <p class="text-sm text-slate-600 dark:text-slate-300">Trénink: <b class="text-slate-800 dark:text-slate-100">${formatPoints(stats.practice.points)}</b> · správně ${stats.practice.correct} z ${stats.practice.played}</p>
            </section>`;
    };

    const satellitePane = () => `
        <div class="absolute inset-0 bg-slate-800">
            <div id="result-satellite" class="absolute inset-0 overflow-hidden" role="img" aria-label="Snímek okolí z družice"></div>
            <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md">
                <i data-lucide="map-pin" class="h-10 w-10 fill-rose-500 stroke-white"></i>
            </div>
            <p class="absolute inset-x-0 bottom-0 bg-black/65 px-2.5 py-1 text-[10px] text-white/90">Snímek: NASA Worldview (GIBS)</p>
        </div>`;
    const mapPane = () => `
        <div class="absolute inset-0 bg-slate-200 dark:bg-slate-700">
            <div id="map-tiles" class="absolute inset-0 overflow-hidden" aria-label="Mapa s polohou" role="img"></div>
            <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md">
                <i data-lucide="map-pin" class="h-10 w-10 fill-rose-500 stroke-white"></i>
            </div>
            <div class="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md dark:border-slate-600 dark:bg-slate-800/95">
                <button type="button" data-action="zoom-in" aria-label="Přiblížit mapu" class="p-2.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="plus" class="h-4 w-4"></i></button>
                <button type="button" data-action="zoom-out" aria-label="Oddálit mapu" class="border-t border-slate-200 p-2.5 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="minus" class="h-4 w-4"></i></button>
            </div>
            <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-white/85 px-2.5 py-1 text-[10px] text-slate-600 backdrop-blur-sm dark:bg-slate-900/80 dark:text-slate-300">
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" class="hover:underline">© přispěvatelé OpenStreetMap</a>
                <a id="map-open-link" href="#" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 font-bold text-brand-700 hover:underline dark:text-brand-300">Otevřít mapu <i data-lucide="external-link" class="h-3 w-3"></i></a>
            </div>
        </div>`;

    const renderMap = () => {
        const container = document.getElementById('map-tiles');
        if (!container || !current || !current.coords) return;
        const { lat, lon } = current.coords;
        renderTiles(container, lat, lon, mapZoom, OSM_TILES);
        document.getElementById('map-open-link').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${Math.min(mapZoom + 4, 18)}/${lat}/${lon}`;
    };

    // Záložky výsledku: fotka, mapa s polohou, bez fotky snímek z družice, obrazová nápověda (časová osa, tabulka…)
    const resultPanes = (data) => {
        const panes = [];
        // Obrázek z otázky (vlajka, obraz), když to není zároveň fotka položky
        if (data.questionImage && data.questionImage.url && !(data.questionImage.same && data.photoUrl)) {
            panes.push({ key: 'image', label: data.questionImage.label, icon: data.questionImage.icon, html: photoPane('result-image') });
        }
        if (data.photoUrl) panes.push({ key: 'photo', label: 'Fotka', icon: 'image', html: photoPane('result-photo') });
        if (data.coords) {
            panes.push({ key: 'map', label: 'Mapa', icon: 'map-pin', html: mapPane() });
            if (!data.photoUrl) panes.push({ key: 'satellite', label: 'Z družice', icon: 'satellite', html: satellitePane() });
        }
        const spec = data.resultVisual || data.visual;
        const visual = Visuals.info(spec);
        // Slepou mapu nahradí skutečná mapa s polohou
        if (visual && !(spec.type === 'map' && data.coords)) panes.push({ key: 'visual', label: capitalize(visual.name), icon: visual.icon, html: visualPane('result-visual', spec) });
        return panes;
    };
    const resultPanel = (data) => {
        const panes = resultPanes(data);
        return panes.length ? renderTabbedPanel(panes, round.resultTab, 'result-tab', RESULT_PANEL_HEIGHT) : '';
    };

    const collectionLabel = (ctx, collectionId) => {
        if (!collectionId) return `Celé téma`;
        if (collectionId.startsWith('c:')) return categoryOf(ctx.topic, collectionId.slice(2)).label;
        const collection = ctx.collections.find(c => c.id === collectionId);
        return collection ? collection.label : collectionId;
    };

    // Text hlavního tlačítka pod výsledkem
    const getNextLabel = () => {
        if (mode === 'challenge' && challenge) return challenge.index + 1 < challenge.count ? `Další otázka (${challenge.index + 2}/${challenge.count})` : (challenge.tournament ? 'Dokončit zápas' : 'Dokončit výzvu');
        if (mode === 'daily') {
            const next = nextDailyTopic(current && current.topic);
            return next ? `Další dnešní: ${next.title}` : 'Hotovo – zpět do menu';
        }
        if (pool.kind === 'mistakes') {
            const remaining = loadMistakes().length;
            return remaining ? `Další chyba (zbývá ${remaining})` : 'Hotovo – zpět do učení';
        }
        if (pool.kind === 'review') return pool.keys.length ? `Další karta (zbývá ${pool.keys.length})` : 'Hotovo – souhrn opakování';
        return pool.kind === 'collection' ? 'Další z okruhu' : 'Další otázka';
    };

    // Výsledek: verdikt, název, záložky s fotkou, mapou a nápovědami, pak popis a fakta; tlačítko Další je přilepené dole
    const renderResult = (keepScroll) => {
        const data = current;
        const topic = TOPIC_BY_ID[data.topic];
        const style = styleOf(topic);
        const category = categoryOf(topic, data.category);
        // K faktům i vlastní nápovědy tématu (současníci, složení látky), ať je hráč vidí, i když je neotevřel
        const extraFacts = data.hints.filter(hint => hint.kind === 'facts' && hint.extra).flatMap(hint => hint.facts);
        const resultFacts = [...data.resultFacts, ...extraFacts.filter(fact => !data.resultFacts.some(other => other.label === fact.label))];

        const funFactsHtml = data.funFacts.map((fact, i) => `
            <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm font-black ${style.soft}">${i + 1}</div>
                <p class="pt-0.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">${escapeHtml(fact)}</p>
            </div>
        `).join('');

        const originBadge = data.isCzech
            ? `<span class="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"><i data-lucide="map-pin" class="h-3 w-3"></i>${escapeHtml(topic.words.czechBadge || 'Česká stopa')}</span>`
            : `<span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-300"><i data-lucide="${data.known ? 'star' : 'compass'}" class="h-3 w-3"></i>${data.known ? 'Známé' : 'Méně známé'}</span>`;

        appContent.innerHTML = `
            <div class="${keepScroll ? '' : 'fade-in '}flex min-h-full w-full flex-col bg-slate-50 dark:bg-slate-900">
                <div class="flex flex-grow flex-col gap-4 p-4">
                    ${renderResultBanner(data)}
                    ${mode === 'daily' && data.dailyDate ? renderStatsCard(data) : ''}

                    <div>
                        <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <span class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white ${style.solid}">
                                <i data-lucide="${category.icon}" class="h-3.5 w-3.5"></i> ${escapeHtml(data.typeLabel)}
                            </span>
                            ${originBadge}
                        </div>
                        <h1 class="text-3xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(data.name)}</h1>
                        <p class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                            <i data-lucide="${topic.subtitleIcon || 'navigation'}" class="h-4 w-4 shrink-0 ${style.text}"></i> ${escapeHtml(data.subtitle)}
                        </p>
                    </div>

                    ${resultPanel(data)}
                    ${renderOtherChoices(data)}

                    ${data.description ? `<p class="text-[15px] font-medium leading-relaxed text-slate-700 dark:text-slate-200">${escapeHtml(data.description)}</p>` : ''}

                    ${resultFacts.length ? `
                        <section class="${CARD} p-4">
                            <h3 class="${CARD_TITLE} mb-3"><i data-lucide="info" class="w-4 h-4 ${style.text}"></i> Čísla a fakta</h3>
                            ${renderFactsList(resultFacts)}
                        </section>
                    ` : ''}

                    ${data.funFacts.length ? `
                        <section class="${CARD} p-4">
                            <h3 class="${CARD_TITLE} mb-4"><i data-lucide="compass" class="w-4 h-4 ${style.text}"></i> Zajímavosti</h3>
                            <div class="space-y-4">${funFactsHtml}</div>
                        </section>
                    ` : ''}

                    ${(mode === 'daily' && data.dailyDate) || mode === 'challenge' ? '' : renderStatsCard(data)}

                    <div class="flex gap-2">
                        <a href="${wikipediaUrl(data.title)}" target="_blank" rel="noopener noreferrer" class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
                        <i data-lucide="book-open" class="h-4 w-4"></i> Číst na Wikipedii
                    </a>
                        ${canReport() ? REPORT_TEXT_BUTTON : ''}
                    </div>
                </div>

                <!-- Tlačítko Další je vždy na očích, bez posouvání dolů -->
                <!-- U dnešní otázky vedle další dnešní otázky (jiné téma) i návrat do menu -->
                <div class="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200/70 bg-slate-50/95 px-4 pb-4 pt-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
                    ${mode === 'daily' && nextDailyTopic(data.topic) ? `
                        <button type="button" data-action="daily-home" class="flex shrink-0 items-center justify-center gap-1.5 rounded-[1.2rem] bg-slate-200 px-4 py-3.5 text-base font-bold text-slate-700 transition-all active:scale-95 dark:bg-slate-800 dark:text-slate-200">
                            <i data-lucide="house" class="h-5 w-5"></i> <span class="max-[389px]:sr-only">Menu</span>
                        </button>` : ''}
                    <button type="button" data-action="next" class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[1.2rem] py-3.5 text-lg max-[389px]:text-base font-bold text-white shadow-lg transition-all active:scale-95 ${style.button} btn-3d">
                        <span class="truncate">${escapeHtml(getNextLabel())}</span> <i data-lucide="arrow-right" class="h-5 w-5 shrink-0"></i>
                    </button>
                </div>
            </div>
        `;

        renderIcons(appContent);
        mountPanels();
        if (!keepScroll) {
            appContent.scrollTo(0, 0);
            // Čtečka obrazovky hned přečte verdikt
            const verdict = appContent.querySelector('[data-verdict]');
            if (verdict) verdict.focus({ preventScroll: true });
        }
    };

    // --- Průběh hry ---

    const renderRound = ({ keepScroll = false } = {}) => {
        if (!current || !round) return;
        screen = 'round';
        closePlaceInfo();
        persistState();
        if (round.answered) renderResult(keepScroll);
        else renderQuestion(keepScroll);
        updateControlsUI();
    };

    const persistState = () => {
        if (!current) return;
        // Rozehraný zápas turnaje se ukládá také: po návratu v den kola nabídne karta turnaje Pokračovat (od další otázky)
        writeJson(KEYS.session, { version: STATE_VERSION, data: current, round, mode, pool, challenge: mode === 'challenge' ? challenge : null, timestamp: Date.now() });
        if (mode === 'daily' && current.dailyDate) {
            const daily = readJson(KEYS.daily) || {};
            daily[current.topic] = { date: current.dailyDate, data: current, round };
            writeJson(KEYS.daily, daily);
        }
    };

    // --- Postup: zkušenosti (XP) a úrovně se ukládají na zařízení (po přihlášení se přenesou do účtu) ---
    const loadProgress = () => {
        const saved = readJson(KEYS.progress) || {};
        return {
            xp: Number.isFinite(saved.xp) && saved.xp > 0 ? Math.floor(saved.xp) : 0,
            counters: normalizeCounters(saved.counters),
            badges: saved.badges && typeof saved.badges === 'object' && !Array.isArray(saved.badges) ? saved.badges : {}
        };
    };
    const saveProgress = (progress) => writeJson(KEYS.progress, progress);
    // Souvislosti pro odznaky: úroveň, kolik položek hráč poznal a hvězdy mistrovství v tématech
    const badgeContext = (progress) => {
        const learnedMap = loadLearned();
        return {
            level: levelProgress(progress.xp).level,
            learned: TOPICS.reduce((sum, topic) => sum + (learnedMap[topic.id] || []).length, 0),
            topicStars: Object.fromEntries(TOPICS.map(topic => [topic.id, masteryStars((learnedMap[topic.id] || []).length)])),
            topicCount: TOPICS.length
        };
    };
    // Získané odznaky podle počítadel; vrátí názvy nově získaných (a uloží je s dnešním dnem)
    let freshBadgeIds = [];
    const grantBadges = (progress) => {
        const fresh = earnedBadgeIds(progress.counters, badgeContext(progress)).filter(id => !progress.badges[id]);
        fresh.forEach(id => { progress.badges[id] = getDayKey(); });
        freshBadgeIds = fresh;
        return fresh.map(id => BADGE_BY_ID[id].title);
    };
    // Oslava (nová úroveň, titul, odznak, série): karta se sovou nad tlačítkem Další; víc oslav jde po sobě, klepnutím se zavře
    const celebrationQueue = [];
    let celebrating = false;
    const nextCelebration = () => {
        const item = celebrationQueue.shift();
        if (!item) { celebrating = false; return; }
        celebrating = true;
        const old = document.getElementById('celebration');
        if (old) old.remove();
        const card = document.createElement('div');
        card.id = 'celebration';
        card.setAttribute('role', 'status');
        card.className = 'fade-in fixed inset-x-3 bottom-24 z-[60] mx-auto flex max-w-sm cursor-pointer items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-800 to-brand-950 p-3 pr-4 text-white shadow-2xl ring-2 ring-gold-400';
        card.innerHTML = `${uiArt(`sova-${item.owl}`, 'h-20 w-20 -my-4 drop-shadow-lg')}<div class="min-w-0 flex-1"><p class="text-[11px] font-black uppercase tracking-widest text-gold-300">${escapeHtml(item.title)}</p><p class="text-base font-black leading-tight">${escapeHtml(item.text)}</p></div>`;
        document.body.appendChild(card);
        const done = () => { if (!card.isConnected) return; card.remove(); setTimeout(nextCelebration, 250); };
        card.addEventListener('click', done);
        setTimeout(done, 4500);
    };
    const showCelebration = (owl, title, text) => {
        celebrationQueue.push({ owl, title, text });
        if (!celebrating) nextCelebration();
    };
    const announce = (levelBefore, levelNow, badgeTitles) => {
        if (levelNow > levelBefore) {
            const newTitle = titleForLevel(levelNow) !== titleForLevel(levelBefore);
            showCelebration(newTitle ? 'vitez' : 'oslava', newTitle ? 'Nový titul' : `Úroveň ${levelNow}`, newTitle ? `${titleForLevel(levelNow)} (úroveň ${levelNow})` : titleForLevel(levelNow));
        }
        badgeTitles.slice(0, 3).forEach(title => showCelebration('oslava', 'Nový odznak', title));
        if (badgeTitles.length > 3) showCelebration('oslava', 'Další odznaky', `a ještě ${badgeTitles.length - 3}`);
        const kinds = Look.REWARD_KINDS;
        Look.newRewards(levelBefore, levelNow, freshBadgeIds).forEach(({ category, item }) => showCelebration('vitez', 'Nová odměna', `${item.title} (${kinds[category]}) – vyber si ji v Nastavení → Vzhled`));
        freshBadgeIds = [];
    };
    // Po delší pauze sova uvítá hráče zpátky (jednou za spuštění)
    const welcomeBack = () => {
        const last = loadProgress().counters.lastDay;
        if (!last) return;
        const gap = Math.round((Date.parse(`${getDayKey()}T12:00:00`) - Date.parse(`${last}T12:00:00`)) / 86400000);
        if (gap >= 3) showCelebration('spi', 'Mudrlant na tebe čekal', `Naposledy jsi hrál před ${gap} dny. Zahraj si dnešní otázky!`);
    };
    // Úroveň a odznaky se po přihlášení ukládají i do účtu (viditelné ostatním, platí na všech zařízeních); chyba spojení nevadí
    let syncingProgress = false;
    const syncProgress = async () => {
        const user = signedUser();
        if (!user || !Social || syncingProgress || devActive()) return;
        syncingProgress = true;
        try {
            const local = loadProgress();
            let remote = null;
            try { remote = await Social.getProgress(user.id); } catch (error) { return; }
            if (!remote) return;
            // Větší XP a sjednocení odznaků: na novém zařízení se postup načte z účtu, na starém se do účtu nahraje
            // (do účtu jde jen nejvyšší stupeň každé skupiny, nižší se dopočítají)
            const merged = { ...local, xp: Math.max(local.xp, remote.xp || 0), badges: { ...local.badges } };
            const remoteIds = expandBadges((remote.badges || []).filter(id => BADGE_BY_ID[id]));
            remoteIds.forEach(id => { if (!merged.badges[id]) merged.badges[id] = getDayKey(); });
            const changedLocal = merged.xp !== local.xp || Object.keys(merged.badges).length !== Object.keys(local.badges).length;
            if (changedLocal) { saveProgress(merged); updateControlsUI(); }
            const compact = compactBadges(Object.keys(merged.badges));
            const sameRemote = (remote.xp || 0) === merged.xp && [...compact].sort().join() === [...(remote.badges || [])].filter(id => BADGE_BY_ID[id]).sort().join();
            if (!sameRemote) await Social.saveProgress(user.id, { xp: merged.xp, badges: compact });
        } catch (error) { /* bez účtu nebo bez nových sloupců se postup jen drží v zařízení */ } finally { syncingProgress = false; }
    };
    // --- Týdenní cíle (goals.js): tři cíle na týden, postup z počítadel rozdílem od snímku na začátku týdne ---
    const goalMetrics = (progress) => {
        const learnedMap = loadLearned();
        return { ...normalizeCounters(progress.counters), learned: TOPICS.reduce((sum, topic) => sum + (learnedMap[topic.id] || []).length, 0) };
    };
    const currentGoals = (week) => Goals.weeklyGoals(week, { topics: TOPICS.map(topic => ({ id: topic.id, title: topic.title })), multiplayer: Boolean(Auth && Auth.isConfigured() && Social), skip: reviewEnabled() ? [] : ['opakovani'] });
    // Stav týdne; nový týden začne novým snímkem (uloží se hned, ať se postup počítá od teď)
    const loadGoalsState = (progress = loadProgress()) => {
        const week = Goals.weekKey();
        const saved = readJson(KEYS.goals);
        const state = Goals.ensureState(saved, week, goalMetrics(progress));
        if (!saved || saved.week !== week) writeJson(KEYS.goals, state);
        return state;
    };
    // Splněné cíle: XP a oslava jen jednou; za všechny tři bonus a odznak (počítadlo weeksDone)
    const settleGoals = () => {
        if (!Goals || devActive()) return;
        try {
            const progress = loadProgress();
            const state = loadGoalsState(progress);
            const result = Goals.settle(state, currentGoals(state.week), goalMetrics(progress));
            if (!result.awards.length && !result.bonus) return;
            const levelBefore = levelProgress(progress.xp).level;
            progress.xp += result.xp;
            if (result.bonus) progress.counters.weeksDone = (progress.counters.weeksDone || 0) + 1;
            const titles = grantBadges(progress);
            saveProgress(progress);
            writeJson(KEYS.goals, result.state);
            result.awards.forEach(award => showCelebration('oslava', 'Cíl týdne splněn', `${award.title} · +${award.xp} XP`));
            if (result.bonus) showCelebration('vitez', 'Všechny cíle týdne', `Bonus +${result.bonus} XP`);
            announce(levelBefore, levelProgress(progress.xp).level, titles);
            applyLook();
            updateControlsUI();
            syncProgress();
        } catch (error) { console.error(error); }
    };
    // Cíle týdne na úvodu: jeden úzký pruh (ikona cíle, počet splněných a tři malé ukazatele), podrobnosti v okně po klepnutí
    const goalRows = () => {
        const progress = loadProgress();
        const state = loadGoalsState(progress);
        return { state, rows: Goals.progress(currentGoals(state.week), state, goalMetrics(progress)) };
    };
    const goalsLeftText = () => {
        const left = Goals.daysLeft();
        return left === 1 ? 'poslední den' : left <= 4 ? `zbývají ${left} dny` : `zbývá ${left} dní`;
    };
    const renderGoalsCard = () => {
        if (!Goals) return '';
        const { state, rows } = goalRows();
        const done = rows.filter(row => row.done).length;
        const chip = ({ goal, value, done }) => `
            <span data-goal="${escapeHtml(goal.id)}" class="relative flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-lg px-1 py-1 text-[10.5px] font-black tabular-nums ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-200'}">
                <i data-lucide="${done ? 'circle-check' : goal.icon}" class="h-3 w-3 shrink-0"></i>
                <span class="truncate">${done ? 'Hotovo' : `${value}/${goal.target}`}</span>
                ${done ? '' : `<span class="absolute inset-x-0 bottom-0 h-[3px] bg-slate-200 dark:bg-slate-600" aria-hidden="true"><span class="block h-full w-0 bg-gold-500" data-progress="${Math.round(value / goal.target * 100)}"></span></span>`}
            </span>`;
        const label = `Cíle týdne: splněno ${done} ze ${rows.length}, ${goalsLeftText()}. Zobrazit podrobnosti`;
        return `
            <button type="button" id="weekly-goals" data-action="goals-open" aria-label="${escapeHtml(label)}" title="${escapeHtml(rows.map(row => row.goal.title).join('\n'))}" class="flex w-full items-center gap-1.5 rounded-2xl bg-white px-2.5 py-1.5 text-left shadow-sm ring-1 ring-slate-200/70 transition-all active:scale-[0.98] dark:bg-slate-800/70 dark:ring-slate-700/70">
                <i data-lucide="goal" class="h-4 w-4 shrink-0 text-brand-700 dark:text-cream"></i>
                <span class="shrink-0 whitespace-nowrap text-[11px] font-black text-slate-800 dark:text-slate-100">Cíle týdne <span class="${state.bonus ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}">${done}/${rows.length}</span></span>
                <span class="flex min-w-0 flex-1 gap-1">${rows.map(chip).join('')}</span>
                <i data-lucide="chevron-right" class="h-3.5 w-3.5 shrink-0 text-slate-400"></i>
            </button>`;
    };
    // Okno s cíli týdne: celé zadání, ukazatel a odměna u každého, bonus za všechny tři
    const openGoals = () => {
        if (!Goals) return;
        const { state, rows } = goalRows();
        const row = ({ goal, value, done }) => `
            <li data-goal-row="${escapeHtml(goal.id)}" class="rounded-2xl bg-white p-3 shadow-sm ring-1 ${done ? 'ring-emerald-300 dark:ring-emerald-700' : 'ring-slate-200/70 dark:ring-slate-700/70'} dark:bg-slate-800">
                <div class="flex items-start gap-2.5">
                    <span class="mt-0.5 shrink-0 rounded-xl p-1.5 ${done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}"><i data-lucide="${done ? 'circle-check' : goal.icon}" class="h-4 w-4"></i></span>
                    <span class="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-800 dark:text-slate-100">${escapeHtml(goal.title)}</span>
                    <span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200'}">+${goal.xp} XP</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                    <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full ${done ? 'bg-emerald-500' : 'bg-gold-500'}" data-progress="${Math.round(value / goal.target * 100)}"></span></span>
                    <span class="text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">${done ? 'Splněno' : `${value} / ${goal.target}`}</span>
                </div>
            </li>`;
        showDialog('Cíle týdne', `
            <p class="-mt-2 mb-3 text-xs text-slate-500 dark:text-slate-400">${escapeHtml(Goals.weekLabel(state.week))} · ${goalsLeftText()}</p>
            <ul class="flex flex-col gap-2">${rows.map(row).join('')}</ul>
            <p class="mt-3 flex items-center gap-2 rounded-2xl ${state.bonus ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200'} px-3 py-2 text-xs font-bold"><i data-lucide="trophy" class="h-4 w-4 shrink-0"></i>${state.bonus ? `Všechny cíle splněny: bonus +${Goals.BONUS_XP} XP získán` : `Za všechny tři cíle bonus +${Goals.BONUS_XP} XP a odznak Týdenní cíle`}</p>`);
        applyProgress(document.getElementById('dialog-overlay'));
    };

    // Za odpověď: základ podle bodů, u dnešní otázky bonus a za sérii dní, za všech 14 dnešních bonus navíc.
    // Vrátí rozpis do výsledku (round.xp) a při nové úrovni ukáže hlášku.
    const awardXp = (stats) => {
        const before = loadProgress();
        const counters = before.counters;
        counters.answered += 1;
        if (round.review) counters.reviewed += 1;
        if (counters.lastDay !== getDayKey()) { counters.days += 1; counters.lastDay = getDayKey(); }
        if (round.correct) {
            counters.correct += 1;
            counters.run += 1;
            counters.bestRun = Math.max(counters.bestRun, counters.run);
            if (round.typed) counters.typedCorrect += 1;
            if (round.hintLevel === 1) counters.noHint += 1;
            if (current.known === false) counters.hardCorrect += 1;
            if (round.wasMistake) counters.fixed += 1;
            if (mode === 'daily' && current.dailyDate && round.dailyFirst !== false) counters.dailyCorrect += 1;
            counters.topics[current.topic] = (counters.topics[current.topic] || 0) + 1;
            counters.topicRun[current.topic] = (counters.topicRun[current.topic] || 0) + 1;
            counters.topicBest[current.topic] = Math.max(counters.topicBest[current.topic] || 0, counters.topicRun[current.topic]);
        } else { counters.run = 0; counters.topicRun[current.topic] = 0; }
        const parts = [{ label: round.correct ? 'za správnou odpověď' : 'za pokus o odpověď', xp: answerXp(round) }];
        if (mode === 'daily' && current.dailyDate && round.dailyFirst !== false) {
            parts.push({ label: 'za dnešní otázku tématu', xp: DAILY_XP });
            if (round.correct) {
                const streak = computeStreak(stats.daily[current.topic] || {}, getDayKey());
                if (streak > 1) parts.push({ label: `za sérii ${streak} dní v řadě`, xp: streakXp(streak) });
            }
            const dayStreak = computeStreak(stats.daily[current.topic] || {}, getDayKey());
            counters.bestStreak = Math.max(counters.bestStreak, dayStreak);
            if (round.correct && [3, 7, 14, 30, 60, 100, 200, 365].includes(dayStreak)) showCelebration('serie', `Série ${dayStreak} dní`, 'Dnešní otázky ti jdou! Jen tak dál.');
            const done = TOPICS.filter(topic => (stats.daily[topic.id] || {})[current.dailyDate]).length;
            if (done === TOPICS.length) { parts.push({ label: 'za dnešní otázky ze všech témat', xp: DAILY_ALL_XP }); counters.perfectDays += 1; }
        }
        const gained = parts.reduce((sum, part) => sum + part.xp, 0);
        const progress = { ...before, xp: before.xp + gained };
        const badgeTitles = grantBadges(progress);
        round.xp = { total: gained, parts: parts.filter(part => part.xp > 0), badges: badgeTitles };
        saveProgress(progress);
        announce(levelProgress(before.xp).level, levelProgress(progress.xp).level, badgeTitles);
        settleGoals();
        applyLook();
        syncProgress();
    };

    const recordResult = () => {
        const stats = loadStats();
        if (mode === 'daily' && current.dailyDate) {
            const topicDaily = stats.daily[current.topic] || {};
            round.dailyFirst = !topicDaily[current.dailyDate];
            if (!topicDaily[current.dailyDate]) {
                topicDaily[current.dailyDate] = {
                    correct: round.correct, points: round.points, hintLevel: round.hintLevel, levelCount: getLevelCount(current),
                    typed: round.typed, category: current.category
                };
            }
            stats.daily[current.topic] = topicDaily;
        } else if (mode === 'challenge' && challenge) {
            // Výzva se do běžných statistik nepočítá, jen do svého výsledku
            challenge.results[challenge.index] = { correct: round.correct, points: round.points };
        } else {
            stats.practice.played += 1;
            stats.practice.correct += round.correct ? 1 : 0;
            stats.practice.points += round.points;
        }
        writeJson(KEYS.stats, stats);
        // Neuhodnutá položka jde do seznamu chyb v učení, správně uhodnutá z něj zmizí a počítá se do postupu v okruzích
        round.wasMistake = loadMistakes().includes(`${current.topic}:${current.id}`);
        writeJson(KEYS.mistakes, updateMistakes(loadMistakes(), `${current.topic}:${current.id}`, round.correct));
        // Karta opakování: špatná odpověď kartu založí nebo vrátí na začátek, správná ji posune (v opakování vždy, jinak jen když je na řadě)
        if (reviewEnabled()) saveReview(Review.onAnswer(loadReview(), `${current.topic}:${current.id}`, round.correct, getDayKey(), { force: Boolean(round.review) }));
        if (round.review && pool.kind === 'review') {
            pool.keys = pool.keys.filter(key => key !== `${current.topic}:${current.id}`);
            pool.done += 1;
            if (round.correct) pool.mastered += 1;
        }
        if (round.correct) {
            const learned = loadLearned();
            const ids = new Set(learned[current.topic] || []);
            ids.add(current.id);
            learned[current.topic] = [...ids];
            writeJson(KEYS.learned, learned);
        }
        awardXp(stats);
    };

    // answerRef: položka (nebo stát) ze špatné odpovědi – výsledek k ní nabídne okno s popisem
    const submitAnswer = ({ correct, typed, answer, answerRef = null, gaveUp = false }) => {
        if (!round || round.answered) return;
        const points = correct ? pointsFor(round.hintLevel, typed) : 0;
        const ref = !correct && isKnownRef(answerRef) ? answerRef : null;
        Object.assign(round, { answered: true, correct, typed, answer, answerRef: ref, gaveUp, points });
        mapZoom = DEFAULT_MAP_ZOOM;
        recordResult();
        renderRound();
    };

    const showNextHint = () => {
        if (!round || round.answered || round.hintLevel >= getLevelCount(current)) return;
        round.hintLevel += 1;
        // Nově odemčená nápověda se hned ukáže ve své záložce
        round.tab = current.hints[round.hintLevel - 2].key;
        renderRound({ keepScroll: true });
    };

    const shareResult = async () => {
        const stats = loadStats();
        const dayKey = current && current.dailyDate;
        const results = dayKey && stats.daily[current.topic];
        const result = results && results[dayKey];
        if (!result) return;
        const topic = TOPIC_BY_ID[current.topic];
        const text = buildShareText({
            appName: APP_NAME,
            topic,
            dayKey,
            result,
            streak: computeStreak(results, getDayKey()),
            url: `${window.location.origin}${window.location.pathname}`
        });
        try {
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
            await navigator.clipboard.writeText(text);
            showToast('Výsledek je zkopírovaný ve schránce');
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            showToast('Sdílení se nepodařilo');
        }
    };

    // Obnovení rozehrané otázky z uložené relace. Aplikace ho při běžném startu nepoužívá (vždy začíná úvodní stránkou);
    // zapíná ho jen adresa s #obnovit (ladění a testy).
    const resumeSession = () => {
        const session = readJson(KEYS.session);
        if (!session || session.version !== STATE_VERSION || !session.data || !session.round || !TOPIC_BY_ID[session.data.topic]) return false;
        const isFresh = Date.now() - session.timestamp < SESSION_MAX_AGE;
        // Zodpovězená otázka se po obnovení stránky (třeba po aktualizaci aplikace) neukazuje znovu: hráč začne na úvodní stránce
        // (u dnešní otázky je její výsledek dál po ruce přes ikonu tématu, u výzvy se pokračuje tlačítkem na úvodní stránce)
        if (session.round.answered) {
            if (session.mode === 'challenge' && session.challenge && !session.challenge.done && !session.challenge.tournament && !finishedChallenges().includes(session.challenge.code)) challenge = session.challenge;
            return false;
        }
        // Dnešní otázka z uložené relace platí jen do půlnoci
        const isCurrent = session.mode !== 'daily' || session.data.dailyDate === getDayKey();
        if (!isFresh || !isCurrent || (session.mode === 'challenge' && !session.challenge)) return false;
        try {
            current = upgradeRoundData(session.data);
            round = session.round;
            mode = session.mode;
            challenge = session.mode === 'challenge' ? session.challenge : challenge;
            pool = session.pool && (session.pool.kind !== 'topic' || TOPIC_BY_ID[session.pool.topic]) ? session.pool : { kind: 'mix' };
            renderRound();
        } catch (error) {
            // Poškozená uložená otázka nesmí zablokovat spuštění
            console.error(error);
            try { localStorage.removeItem(KEYS.session); } catch (e) {}
            current = null;
            round = null;
            return false;
        }
        refreshWhenTopicLoads(current);
        return true;
    };

    // Po spuštění i po aktualizaci aplikace se vždy začíná na úvodní stránce, rozehraná otázka se neobnovuje.
    // Rozehraná výzva se jen zapamatuje a pokračuje se v ní tlačítkem na úvodní stránce (otázka se pak vybere znovu ze stejných).
    // Rozehraný zápas turnaje nabízí k pokračování karta turnaje (jen v den kola), sem se nebere.
    const restoreSession = () => {
        const session = readJson(KEYS.session);
        if (session && session.version === STATE_VERSION && session.mode === 'challenge' && session.challenge && !session.challenge.done && !session.challenge.tournament
            && !finishedChallenges().includes(session.challenge.code) && Date.now() - session.timestamp < SESSION_MAX_AGE) challenge = session.challenge;
        return false;
    };
    // Rozehraný zápas turnaje: z paměti (právě hraný), jinak z uložené relace; { mid, challenge } nebo null
    const savedTournamentChallenge = () => {
        if (challenge && challenge.tournament && !challenge.done) return { mid: challenge.tournament.mid, challenge };
        const session = readJson(KEYS.session);
        const saved = session && session.version === STATE_VERSION && session.mode === 'challenge' ? session.challenge : null;
        if (!saved || saved.done || !saved.tournament || !saved.tournament.mid || !Array.isArray(saved.results)) return null;
        return { mid: saved.tournament.mid, challenge: saved };
    };
    const savedTournamentMatch = () => { const saved = savedTournamentChallenge(); return saved ? saved.mid : null; };

    // Průběh načtení otázky: vybrat položku, dotáhnout popis a fotku, zobrazit
    const runRound = async (pick, loadingTopic = null) => {
        if (isLoading) return;
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        isLoading = true;
        screen = 'round';
        // Předchozí otázka během načítání nesmí jít ovládat (nastavení by ji jinak vykreslilo přes načítání)
        current = null;
        round = null;
        closePlaceInfo();
        closeChooser();
        closeSettings();
        updateControlsUI();
        renderLoading('Vybírám otázku…', loadingTopic);
        try {
            let picked = await pick(0);
            if (picked.abort) { isLoading = false; picked.abort(); return; }
            if (!picked.item) throw new Error('Není z čeho vybírat');
            let data = await createRoundData(picked.item, picked.ctx, picked.rng);
            // Chudý popis: vybere se jiná otázka (u dnešní otázky další určená položka), nejvýš třikrát; pak se vezme, co je
            // (výzva ne: všichni hráči musí dostat stejné otázky, i když se někomu Wikipedie nenačte)
            for (let attempt = 1; data.thin && mode !== 'challenge' && attempt <= MAX_THIN_RETRIES; attempt++) {
                const next = await pick(attempt);
                if (!next.item) break;
                const candidate = await createRoundData(next.item, next.ctx, next.rng);
                picked = next;
                data = candidate;
            }
            const { dailyDate } = picked;
            current = dailyDate ? { ...data, dailyDate } : data;
            round = createRound();
            // Výzva má pevný způsob odpovídání pro všechny hráče
            if (mode === 'challenge' && challenge && challenge.variant) round.variant = challenge.variant;
            isLoading = false;
            renderRound();
            // Obrysy států pro slepou mapu stáhneme dopředu, ať je nápověda hned po ruce
            if (data.visual && data.visual.type === 'map') loadWorld().catch(() => {});
        } catch (error) {
            isLoading = false;
            renderError(error);
        }
    };

    // Podíl dnešních otázek, které jsou z těžších (méně známých) položek
    const DAILY_HARD_SHARE = 0.1;
    const dailySeed = (topic, dayKey) => `${topic.dailySeed || `mudrlant-${topic.id}-`}${dayKey}`;

    // Dnešní otázka tématu: pro všechny stejná, ze známých položek (asi desetina z těžších); odehraná zůstane uložená
    const startDaily = (topicId) => {
        if (isLoading) return;
        const today = getDayKey();
        const saved = (readJson(KEYS.daily) || {})[topicId];
        if (saved && saved.date === today && saved.data) {
            try {
                mode = 'daily';
                current = upgradeRoundData(saved.data);
                round = saved.round || createRound();
                renderRound();
                refreshWhenTopicLoads(current);
                return;
            } catch (error) {
                // Poškozená uložená dnešní otázka: připraví se znovu (výsledek dne už zapsaný zůstane)
                console.error(error);
            }
        }
        mode = 'daily';
        runRound(async (attempt = 0) => {
            const ctx = await loadTopic(topicId);
            const rng = createSeededRandom(attempt ? `${dailySeed(ctx.topic, today)}:r${attempt}` : dailySeed(ctx.topic, today));
            // Tu a tam (DAILY_HARD_SHARE) je dnešní otázka z těžších, méně známých; los má vlastní semínko, takže ostatních 90 %
            // dnešních otázek zůstává stejných a pro všechny hráče platí stejně
            const hard = createSeededRandom(`${dailySeed(ctx.topic, today)}:tezka`)() < DAILY_HARD_SHARE;
            const harder = hard ? ctx.items.filter(candidate => candidate.k !== 1) : [];
            const item = pickItem(harder.length ? harder : ctx.items.filter(candidate => candidate.k === 1), rng, [], ctx.topic.categories.map(c => c.key));
            return { item, ctx, rng, dailyDate: today };
        }, TOPIC_BY_ID[topicId]);
    };

    const startNextDaily = (topicId) => {
        lastDailyTopic = topicId;
        startDaily(topicId);
    };

    // Položky okruhu: celé téma a kategorie podle nastavené známosti, zvláštní okruhy celé
    const collectionItems = (ctx, collectionId) => {
        const special = collectionId && !collectionId.startsWith('c:');
        const items = filterItems(ctx.items, { tier: special ? 'all' : settings.tier, collection: collectionId });
        return items.length ? items : filterItems(ctx.items, { collection: collectionId });
    };

    const rememberPlayed = (item) => {
        const history = readJson(KEYS.history) || [];
        writeJson(KEYS.history, [item.q, ...history.filter(id => id !== item.q)].slice(0, HISTORY_SIZE));
    };

    // Položky tématu ke hraní: vybrané kategorie a známost; když nic nezbude, polevíme
    const playableItems = (ctx) => {
        const categories = selectedCategories(ctx.topic);
        const chosen = ctx.items.filter(item => categories.includes(item.c));
        const base = chosen.length ? chosen : ctx.items;
        const known = filterItems(base, { tier: settings.tier });
        return known.length ? known : base;
    };

    // Hra: jedno téma (vybrané kategorie), mix vybraných témat, okruh z učení, nebo chyby
    const startPractice = (nextPool = pool) => {
        if (isLoading) return;
        pool = nextPool;
        mode = 'practice';
        closeChooser();
        runRound(async () => {
            const history = readJson(KEYS.history) || [];
            let ctx;
            let item;
            if (pool.kind === 'mistakes') {
                // Chyba, jejíž položka v nových datech už není, se ze seznamu vyřadí a zkusí se jiná
                let keys = loadMistakes();
                while (keys.length && !item) {
                    const fresh = keys.filter(key => !history.includes(key.split(':')[1]));
                    const key = pickRandom(fresh.length ? fresh : keys, Math.random);
                    const [topicId, id] = key.split(':');
                    ctx = await loadTopic(topicId);
                    item = ctx.byId.get(id);
                    if (!item) {
                        keys = keys.filter(other => other !== key);
                        writeJson(KEYS.mistakes, keys);
                    }
                }
                if (!item) {
                    showToast('Všechny chyby máš zopakované');
                    pool = { kind: 'mix' };
                }
            }
            if (pool.kind === 'review') {
                // Karty popořadě; karta, jejíž položka v nových datech už není, se vyřadí a vezme se další
                let cards = loadReview();
                while (pool.keys.length && !item) {
                    const key = pool.keys[0];
                    const [topicId, id] = key.split(':');
                    if (TOPIC_BY_ID[topicId]) {
                        ctx = await loadTopic(topicId);
                        item = ctx.byId.get(id);
                    }
                    if (!item) {
                        pool.keys = pool.keys.slice(1);
                        pool.total = Math.max(pool.done, pool.total - 1);
                        cards = Review.removeCard(cards, key);
                        saveReview(cards);
                    }
                }
                if (!item) return { abort: finishReview };
            }
            if (pool.kind === 'collection') {
                ctx = await loadTopic(pool.topic);
                item = pickItem(collectionItems(ctx, pool.collection), Math.random, history, ctx.topic.categories.map(c => c.key));
                // Okruh, který v nových datech už není (nebo je prázdný): celé téma
                if (!item) {
                    showToast('Tenhle okruh teď nic neobsahuje, hraju celé téma');
                    pool = { kind: 'topic', topic: pool.topic };
                }
            }
            if (pool.kind === 'topic' || pool.kind === 'mix') {
                ctx = await loadTopic(pool.kind === 'topic' ? pool.topic : pickRandom(settings.topics, Math.random));
                item = pickItem(playableItems(ctx), Math.random, history, ctx.topic.categories.map(c => c.key));
            }
            if (item) rememberPlayed(item);
            return { item, ctx, rng: Math.random };
        }, pool.kind === 'topic' || pool.kind === 'collection' ? TOPIC_BY_ID[pool.topic] : pool.kind === 'mix' ? MIX : null);
    };

    // Opakování karet, které jsou dnes na řadě (review.js): hra s pevným seznamem položek, po dohrání souhrn v učení
    const startReview = () => {
        if (!Review || isLoading) return;
        const keys = Review.dueCards(loadReview(), getDayKey()).map(Review.keyOf);
        if (!keys.length) { showToast('Dnes není co opakovat'); return; }
        reviewSummary = null;
        startPractice({ kind: 'review', keys, total: keys.length, done: 0, mastered: 0 });
    };
    const finishReview = () => {
        const mastered = pool.mastered || 0;
        const total = pool.total || 0;
        reviewSummary = total && Review ? { mastered, total, text: Review.summaryText({ mastered, total }, loadReview(), getDayKey()) } : null;
        pool = { kind: 'mix' };
        openLearn('home');
    };

    // Tlačítko „Hrát dál“: rozehraná otázka, jinak další otázka z naposledy hraného tématu či mixu
    const showPractice = () => {
        if (current && mode === 'practice' && round && !round.answered && screen !== 'round') {
            renderRound();
            return;
        }
        startPractice(pool.kind === 'topic' && TOPIC_BY_ID[pool.topic] ? pool : { kind: 'mix' });
    };

    const continueAfterResult = () => {
        if (mode === 'challenge' && challenge) {
            if (challenge.index + 1 < challenge.count) startChallenge(challenge, challenge.index + 1, challenge.results);
            else finishChallenge();
            return;
        }
        if (mode === 'daily') {
            const next = nextDailyTopic(current && current.topic);
            if (next) startNextDaily(next.id);
            else renderHome();
            return;
        }
        if (pool.kind === 'review' && !pool.keys.length) {
            finishReview();
            return;
        }
        if (pool.kind === 'mistakes' && !loadMistakes().length) {
            openLearn('mistakes');
            return;
        }
        startPractice();
    };

    const renderError = (error) => {
        console.error(error);
        const isNetworkError = error instanceof NetworkError || !navigator.onLine;
        const title = isNetworkError ? 'Chyba spojení' : 'Něco se pokazilo';
        const message = isNetworkError
            ? 'Nepodařilo se načíst data. Zkontroluj připojení k internetu a zkus to znovu.'
            : 'Otázku se nepodařilo připravit. Zkus to prosím znovu.';

        appContent.innerHTML = `
            <div class="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center fade-in bg-slate-50 dark:bg-slate-900">
                <i data-lucide="${isNetworkError ? 'wifi-off' : 'search-x'}" class="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4"></i>
                <h2 class="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">${title}</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-6">${message}</p>
                <button type="button" data-action="retry" class="rounded-2xl bg-brand-700 px-6 py-3 font-bold text-white shadow-lg active:scale-95">Zkusit znovu</button>
            </div>`;
        renderIcons(appContent);
        updateControlsUI();
    };

    const retry = () => {
        if (screen === 'learn') renderLearn();
        else if (mode === 'daily') startDaily(lastDailyTopic || TOPICS[0].id);
        else startPractice();
    };

    // --- Učení: témata → okruhy → prohlížení a procvičování; chyby napříč tématy ---

    const LEARN_ROW = 'flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-600';

    const progressBar = (done, total) => `
        <span class="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
            <span class="block h-full w-0 rounded-full bg-gold-500" data-progress="${total ? Math.round(done / total * 100) : 0}"></span>
        </span>`;
    // Šířku pruhů nastavíme přes CSSOM (inline styly zakazuje CSP)
    const applyProgress = (root) => root.querySelectorAll('[data-progress]').forEach(bar => { bar.style.width = `${bar.dataset.progress}%`; });

    const learnedCount = (topicId, items) => {
        const learned = new Set(loadLearned()[topicId] || []);
        return items.filter(item => learned.has(item.q)).length;
    };

    const renderLearnHome = () => {
        const mistakes = loadMistakes();
        const card = (topic) => `
            <button type="button" data-action="learn-topic" data-topic="${topic.id}" class="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white p-2 text-center shadow-sm transition-all hover:border-brand-300 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-600">
                ${topicIcon(topic, 'h-10 w-10', `rounded-xl p-2 ${styleOf(topic).soft}`, 'h-[1.375rem] w-[1.375rem]')}
                <span class="${topic.title.length > 10 ? 'text-[10px]' : 'text-[11.5px]'} font-black leading-tight text-slate-800 [overflow-wrap:anywhere] dark:text-slate-100">${escapeHtml(topic.title)}</span>
            </button>`;
        // Stejná mřížka jako na úvodu: témata a „Moje chyby“ v posledních dvou políčkách vyplní celou výšku
        const tiles = groupedTopics().flatMap(group => group.topics).map(card).join('');
        // Opakování s rozestupy: kolik karet je dnes na řadě; po dohrání souhrn, bez karet kdy přijde další
        const cards = loadReview();
        const today = getDayKey();
        const due = Review ? Review.dueCount(cards, today) : 0;
        const next = Review ? Review.nextDueText(cards, today) : '';
        const reviewText = reviewSummary ? reviewSummary.text : due ? 'Chyby se vrací po 1, 3, 7, 14 a 30 dnech' : next ? `Nic na řadě, ${next}` : 'Co v kvízu spleteš, sem přijde k opakování';
        const reviewSection = reviewEnabled() ? `
            <section data-review-section class="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <span class="shrink-0 rounded-xl bg-gold-100 p-2 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300"><i data-lucide="repeat" class="h-5 w-5"></i></span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-black leading-tight text-slate-800 dark:text-slate-100">K opakování dnes (${due})</span>
                    <span class="block text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(reviewText)}</span>
                </span>
                ${due ? `<button type="button" data-action="review-start" class="flex shrink-0 items-center gap-1.5 rounded-xl btn-3d bg-brand-700 px-3 py-2.5 text-[13px] font-black text-white"><i data-lucide="play" class="h-4 w-4"></i> Opakovat</button>` : ''}
            </section>` : '';
        return `
            <div class="text-center">
                <h2 class="text-xl font-black tracking-tight text-slate-800 dark:text-slate-50">Učení</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Vyber téma, projdi si ho a nech se vyzkoušet. Bez bodů a spěchu.</p>
            </div>
            ${reviewSection}
            <div class="grid max-h-[22rem] flex-1 grid-cols-4 auto-rows-fr gap-2">
                ${tiles}
                <button type="button" data-action="learn-mistakes" class="col-span-2 flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-rose-200 bg-rose-50 p-2 text-center shadow-sm transition-all active:scale-[0.98] dark:border-rose-900/60 dark:bg-rose-900/20">
                    ${uiArt('chyby', 'h-11 w-11')}
                    <span class="text-[11.5px] font-black leading-tight text-slate-800 dark:text-slate-100">Moje chyby${mistakes.length ? ` (${mistakes.length})` : ''}<span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">Co ti nevyšlo, ze všech témat</span></span>
                </button>
            </div>`;
    };

    const collectionRow = (ctx, collectionId, label, text, icon) => {
        const items = collectionItems(ctx, collectionId);
        const done = learnedCount(ctx.topic.id, items);
        return `
            <button type="button" data-action="learn-collection" data-collection="${escapeHtml(collectionId || '')}" class="${LEARN_ROW}">
                <span class="shrink-0 rounded-xl p-2 ${styleOf(ctx.topic).soft}"><i data-lucide="${icon}" class="h-5 w-5"></i></span>
                <span class="min-w-0 flex-1">
                    <span class="flex items-baseline justify-between gap-2">
                        <span class="truncate font-bold text-slate-800 dark:text-slate-100">${escapeHtml(label)}</span>
                        <span class="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">${done ? `${done} / ` : ''}${items.length}</span>
                    </span>
                    ${text ? `<span class="block truncate text-xs text-slate-500 dark:text-slate-400">${escapeHtml(text)}</span>` : ''}
                    ${progressBar(done, items.length)}
                </span>
            </button>`;
    };

    const renderLearnTopic = (ctx) => {
        const { topic } = ctx;
        return `
            <button type="button" data-action="learn-back" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> Učení</button>
            <div class="flex items-center gap-3">
                ${topicIcon(topic, 'h-14 w-14', `rounded-2xl p-3 ${styleOf(topic).soft}`, 'h-7 w-7')}
                <div>
                    <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(topic.title)}</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${settings.tier === 'all' ? 'Celé téma i se méně známými' : 'Celé téma a kategorie jen se známými'} · <button type="button" data-action="settings" class="-my-2 px-1 py-2 font-bold text-slate-700 underline underline-offset-2 dark:text-slate-200">změnit</button></p>
                </div>
            </div>
            <h3 class="${CARD_TITLE} mt-1">Kategorie</h3>
            <div class="flex flex-col gap-2">
                ${collectionRow(ctx, null, 'Celé téma', '', topic.icon)}
                ${topic.categories.map(category => collectionRow(ctx, `c:${category.key}`, category.label, '', category.icon)).join('')}
            </div>
            ${ctx.collections.length ? `
                <h3 class="${CARD_TITLE} mt-1">Okruhy</h3>
                <div class="flex flex-col gap-2">${ctx.collections.map(collection => collectionRow(ctx, collection.id, collection.label, collection.text, 'layers')).join('')}</div>
            ` : ''}`;
    };

    const renderLearnCollection = (ctx) => {
        const items = collectionItems(ctx, learn.collection);
        const done = learnedCount(ctx.topic.id, items);
        const collection = ctx.collections.find(c => c.id === learn.collection);
        if (!items.length) {
            return `
                <button type="button" data-action="learn-topic" data-topic="${ctx.topic.id}" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(ctx.topic.title)}</button>
                <section class="${CARD} p-6 text-center text-sm text-slate-500 dark:text-slate-400">Tenhle okruh teď nic neobsahuje.</section>`;
        }
        return `
            <button type="button" data-action="learn-topic" data-topic="${ctx.topic.id}" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(ctx.topic.title)}</button>
            <section class="${CARD} p-5">
                <h2 class="text-2xl font-black leading-tight text-slate-800 dark:text-slate-50">${escapeHtml(collectionLabel(ctx, learn.collection))}</h2>
                ${collection && collection.text ? `<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${escapeHtml(collection.text)}</p>` : ''}
                <p class="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">${items.length} položek · uhodnuto ${done}</p>
                ${progressBar(done, items.length)}
            </section>
            <button type="button" data-action="learn-browse" class="flex w-full items-center gap-3 rounded-[1.5rem] border-2 bg-white p-4 text-left shadow-sm transition-all active:scale-[0.98] dark:bg-slate-800 ${styleOf(ctx.topic).on}">
                <i data-lucide="book-open" class="h-7 w-7 shrink-0"></i>
                <span><span class="block text-lg font-black">Prohlížet</span><span class="block text-sm opacity-80">${learn.collection ? 'Popořadě, s fotkou, mapou a fakty' : 'Náhodně, s fotkou, mapou a fakty'}</span></span>
            </button>
            <button type="button" data-action="learn-practice" class="flex w-full items-center gap-3 rounded-[1.5rem] p-4 text-left text-white shadow-lg transition-all active:scale-[0.98] ${styleOf(ctx.topic).button} btn-3d">
                <i data-lucide="target" class="h-7 w-7 shrink-0"></i>
                <span><span class="block text-lg font-black">Procvičit</span><span class="block text-sm text-white/90">Otázky jen z tohoto okruhu</span></span>
            </button>`;
    };

    const renderLearnAtlas = (ctx) => {
        const item = ctx.byId.get(learn.order[learn.index]);
        if (!item) return renderLearnCollection(ctx);
        return `
            <div class="flex items-center justify-between gap-2">
                <button type="button" data-action="learn-collection" data-collection="${escapeHtml(learn.collection || '')}" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(collectionLabel(ctx, learn.collection))}</button>
                <span class="text-sm font-bold text-slate-500 dark:text-slate-400">${learn.index + 1} / ${learn.order.length}</span>
            </div>
            <article id="learn-card" class="${CARD} shrink-0 overflow-hidden">
                ${renderItemCard(item, ctx, { titleId: 'learn-title', compact: false })}
            </article>
            <!-- Listování je vždy na očích, bez posouvání pod dlouhou kartu -->
            <div class="sticky bottom-0 z-20 -mx-5 grid grid-cols-2 gap-3 border-t border-slate-200/70 bg-slate-50/95 px-5 pb-4 pt-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
                <button type="button" data-action="learn-prev" ${learn.index <= 0 ? 'disabled' : ''} class="flex items-center justify-center gap-1.5 rounded-[1.2rem] border border-slate-200 bg-white py-3.5 font-bold text-slate-700 shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <i data-lucide="chevron-left" class="h-5 w-5"></i> Předchozí
                </button>
                <button type="button" data-action="learn-next" ${learn.index >= learn.order.length - 1 ? 'disabled' : ''} class="flex items-center justify-center gap-1.5 rounded-[1.2rem] py-3.5 font-bold text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${styleOf(ctx.topic).button} btn-3d">
                    Další <i data-lucide="chevron-right" class="h-5 w-5"></i>
                </button>
            </div>`;
    };

    const renderLearnMistakes = (contexts) => {
        const keys = loadMistakes();
        const valid = keys.filter(key => {
            const [topicId, id] = key.split(':');
            return contexts.has(topicId) && contexts.get(topicId).byId.has(id);
        });
        // Položky, které v nových datech už nejsou, ze seznamu zmizí (jinak by „Moje chyby (N)“ nesedělo)
        if (valid.length !== keys.length) writeJson(KEYS.mistakes, valid);
        const mistakes = valid.map(key => {
            const [topicId, id] = key.split(':');
            const ctx = contexts.get(topicId);
            return { ctx, item: ctx.byId.get(id) };
        });
        const back = `<button type="button" data-action="learn-back" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> Učení</button>`;
        if (!mistakes.length) {
            return `${back}
                <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">Moje chyby</h2>
                <section class="${CARD} flex flex-col items-center gap-2 p-8 text-center">
                    <i data-lucide="circle-check" class="h-12 w-12 text-emerald-500"></i>
                    <h3 class="text-lg font-black text-slate-800 dark:text-slate-100">Zatím tu nic není</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Co v kvízu neuhodneš, se sem uloží. Tady si to pak můžeš prohlédnout a procvičit.</p>
                    <button type="button" data-action="play-mix" class="mt-3 flex items-center gap-2 rounded-[1.2rem] px-5 py-3 font-bold text-white shadow-lg transition-all active:scale-95 ${styleOf(MIX).button} btn-3d">
                        <i data-lucide="play" class="h-5 w-5"></i> Hrát mix
                    </button>
                </section>`;
        }
        const rows = mistakes.map(({ ctx, item }) => `
            <li>
                <button type="button" data-action="item-info" data-topic="${ctx.topic.id}" data-id="${escapeHtml(item.q)}" class="${LEARN_ROW}">
                    <span class="shrink-0 rounded-xl p-2 ${styleOf(ctx.topic).soft}"><i data-lucide="${categoryOf(ctx.topic, item.c).icon}" class="h-5 w-5"></i></span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate font-bold text-slate-800 dark:text-slate-100">${escapeHtml(item.n)}</span>
                        <span class="block truncate text-xs text-slate-500 dark:text-slate-400">${escapeHtml(ctx.topic.title)} · ${escapeHtml(ctx.topic.subtitle(item, ctx))}</span>
                    </span>
                    <i data-lucide="info" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i>
                </button>
            </li>`).join('');
        return `${back}
            <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">Moje chyby</h2>
            <button type="button" data-action="practice-mistakes" class="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-brand-700 py-4 text-lg font-bold text-white shadow-xl shadow-brand-700/20 transition-all hover:bg-brand-800 active:scale-95">
                ${uiArt('chyby', 'h-6 w-6')} Procvičit chyby (${mistakes.length})
            </button>
            <p class="-mt-2 text-center text-xs text-slate-500 dark:text-slate-400">Co pak uhodneš, ze seznamu zmizí. Klepnutím si to prohlédneš.</p>
            <ul class="flex flex-col gap-2">${rows}</ul>
            <button type="button" data-action="clear-mistakes" class="mx-auto flex min-h-[2.75rem] items-center gap-1.5 py-2 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                <i data-lucide="trash-2" class="h-4 w-4"></i> Vymazat seznam
            </button>`;
    };

    // Pomalejší načtení starší obrazovky učení nesmí přepsat novější (klepnutí na Zeměpis a hned na Historii)
    let learnRenderId = 0;
    const renderLearn = async () => {
        screen = 'learn';
        closePlaceInfo();
        updateControlsUI();
        const renderId = ++learnRenderId;
        const needsTopic = learn.view !== 'home' && learn.view !== 'mistakes' && learn.topic;
        if ((needsTopic && !loadedTopics.has(learn.topic)) || learn.view === 'mistakes') renderLoading('Načítám…');
        let body;
        let ctx = null;
        try {
            if (learn.view === 'mistakes') {
                const topicIds = [...new Set(loadMistakes().map(key => key.split(':')[0]))];
                const contexts = new Map(await Promise.all(topicIds.map(async id => [id, await loadTopic(id)])));
                body = renderLearnMistakes(contexts);
            } else if (learn.view === 'home' || !learn.topic) {
                body = renderLearnHome();
            } else {
                ctx = await loadTopic(learn.topic);
                body = learn.view === 'atlas' ? renderLearnAtlas(ctx) : learn.view === 'collection' ? renderLearnCollection(ctx) : renderLearnTopic(ctx);
            }
        } catch (error) {
            if (renderId === learnRenderId && screen === 'learn') renderError(error);
            return;
        }
        if (screen !== 'learn' || renderId !== learnRenderId) return;
        // V atlasu je dole přilepená lišta s listováním, mezera pod obsahem by pod ní jen překážela
        const atlas = learn.view === 'atlas';
        const learnHome = learn.view === 'home' || (!learn.topic && learn.view !== 'mistakes');
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col ${learnHome ? 'gap-2.5 p-3' : `gap-4 p-5 ${atlas ? 'pb-0' : 'pb-6'}`} bg-slate-50 dark:bg-slate-900">
                ${body}
                ${atlas || learnHome ? '' : '<!-- Bezpečnostní mezera pro spodní okraj displeje --><div class="h-12 w-full shrink-0"></div>'}
            </div>`;
        renderIcons(appContent);
        applyProgress(appContent);
        if (learn.view === 'atlas' && ctx) {
            const item = ctx.byId.get(learn.order[learn.index]);
            if (item) hydrateItemCard(document.getElementById('learn-card'), item, ctx, 960);
        }
        updateControlsUI();
    };

    const openLearn = (view = learn.view, topicId = learn.topic) => {
        if (isLoading) return;
        closeChooser();
        learn.view = view;
        learn.topic = topicId;
        renderLearn().then(() => appContent.scrollTo(0, 0));
    };

    // Prohlížení okruhu: zvláštní okruhy a kategorie popořadě (podle výšky, roku, abecedy…), celé téma náhodně
    const browseCollection = async () => {
        const ctx = await loadTopic(learn.topic);
        const items = collectionItems(ctx, learn.collection);
        let ordered;
        if (!learn.collection) ordered = shuffle(items, Math.random);
        else if (learn.collection.startsWith('c:')) ordered = sortItems(items, categoryOf(ctx.topic, learn.collection.slice(2)).sort);
        else ordered = sortItems(items, (ctx.collections.find(c => c.id === learn.collection) || {}).sort);
        learn.order = ordered.map(item => item.q);
        learn.index = 0;
        openLearn('atlas');
    };

    const moveAtlas = (direction) => {
        learn.index = Math.min(Math.max(learn.index + direction, 0), learn.order.length - 1);
        openLearn('atlas');
    };

    const clearMistakes = () => {
        if (!window.confirm('Opravdu vymazat seznam chyb?')) return;
        writeJson(KEYS.mistakes, []);
        openLearn('mistakes');
    };

    const changeMapZoom = (delta) => {
        mapZoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, mapZoom + delta));
        renderMap();
    };

    // --- Profil a výzvy (hra více hráčů) ---
    // Výzva = téma (nebo mix), semínko a počet otázek. Otázky se z něj losují stejně všem hráčům, takže stačí sdílet kód;
    // výsledky ukládá Supabase (social.js) a hráči se porovnají v žebříčku výzvy.

    const Social = window.MudrlantSocial;
    const AVATAR_BG = { __proto__: null, emerald: 'bg-emerald-500', sky: 'bg-sky-500', violet: 'bg-violet-500', rose: 'bg-rose-500', amber: 'bg-amber-500', teal: 'bg-teal-500', orange: 'bg-orange-500', indigo: 'bg-indigo-500', cerna: 'bg-neutral-900 ring-1 ring-white/30' };
    // Vlastní odstín pozadí profilovky (h<stupně>): třídy po 5°, ať stačí pevný CSS (CSP nepustí styl v atributu)
    const HUE_BG = { 0: 'bg-[hsl(0deg_75%_50%)]', 5: 'bg-[hsl(5deg_75%_50%)]', 10: 'bg-[hsl(10deg_75%_50%)]', 15: 'bg-[hsl(15deg_75%_50%)]', 20: 'bg-[hsl(20deg_75%_50%)]', 25: 'bg-[hsl(25deg_75%_50%)]', 30: 'bg-[hsl(30deg_75%_50%)]', 35: 'bg-[hsl(35deg_75%_50%)]', 40: 'bg-[hsl(40deg_75%_50%)]', 45: 'bg-[hsl(45deg_75%_50%)]', 50: 'bg-[hsl(50deg_75%_50%)]', 55: 'bg-[hsl(55deg_75%_50%)]', 60: 'bg-[hsl(60deg_75%_50%)]', 65: 'bg-[hsl(65deg_75%_50%)]', 70: 'bg-[hsl(70deg_75%_50%)]', 75: 'bg-[hsl(75deg_75%_50%)]', 80: 'bg-[hsl(80deg_75%_50%)]', 85: 'bg-[hsl(85deg_75%_50%)]', 90: 'bg-[hsl(90deg_75%_50%)]', 95: 'bg-[hsl(95deg_75%_50%)]', 100: 'bg-[hsl(100deg_75%_50%)]', 105: 'bg-[hsl(105deg_75%_50%)]', 110: 'bg-[hsl(110deg_75%_50%)]', 115: 'bg-[hsl(115deg_75%_50%)]', 120: 'bg-[hsl(120deg_75%_50%)]', 125: 'bg-[hsl(125deg_75%_50%)]', 130: 'bg-[hsl(130deg_75%_50%)]', 135: 'bg-[hsl(135deg_75%_50%)]', 140: 'bg-[hsl(140deg_75%_50%)]', 145: 'bg-[hsl(145deg_75%_50%)]', 150: 'bg-[hsl(150deg_75%_50%)]', 155: 'bg-[hsl(155deg_75%_50%)]', 160: 'bg-[hsl(160deg_75%_50%)]', 165: 'bg-[hsl(165deg_75%_50%)]', 170: 'bg-[hsl(170deg_75%_50%)]', 175: 'bg-[hsl(175deg_75%_50%)]', 180: 'bg-[hsl(180deg_75%_50%)]', 185: 'bg-[hsl(185deg_75%_50%)]', 190: 'bg-[hsl(190deg_75%_50%)]', 195: 'bg-[hsl(195deg_75%_50%)]', 200: 'bg-[hsl(200deg_75%_50%)]', 205: 'bg-[hsl(205deg_75%_50%)]', 210: 'bg-[hsl(210deg_75%_50%)]', 215: 'bg-[hsl(215deg_75%_50%)]', 220: 'bg-[hsl(220deg_75%_50%)]', 225: 'bg-[hsl(225deg_75%_50%)]', 230: 'bg-[hsl(230deg_75%_50%)]', 235: 'bg-[hsl(235deg_75%_50%)]', 240: 'bg-[hsl(240deg_75%_50%)]', 245: 'bg-[hsl(245deg_75%_50%)]', 250: 'bg-[hsl(250deg_75%_50%)]', 255: 'bg-[hsl(255deg_75%_50%)]', 260: 'bg-[hsl(260deg_75%_50%)]', 265: 'bg-[hsl(265deg_75%_50%)]', 270: 'bg-[hsl(270deg_75%_50%)]', 275: 'bg-[hsl(275deg_75%_50%)]', 280: 'bg-[hsl(280deg_75%_50%)]', 285: 'bg-[hsl(285deg_75%_50%)]', 290: 'bg-[hsl(290deg_75%_50%)]', 295: 'bg-[hsl(295deg_75%_50%)]', 300: 'bg-[hsl(300deg_75%_50%)]', 305: 'bg-[hsl(305deg_75%_50%)]', 310: 'bg-[hsl(310deg_75%_50%)]', 315: 'bg-[hsl(315deg_75%_50%)]', 320: 'bg-[hsl(320deg_75%_50%)]', 325: 'bg-[hsl(325deg_75%_50%)]', 330: 'bg-[hsl(330deg_75%_50%)]', 335: 'bg-[hsl(335deg_75%_50%)]', 340: 'bg-[hsl(340deg_75%_50%)]', 345: 'bg-[hsl(345deg_75%_50%)]', 350: 'bg-[hsl(350deg_75%_50%)]', 355: 'bg-[hsl(355deg_75%_50%)]' };
    const avatarBg = (color) => AVATAR_BG[color] || (Social && Social.customHue(color) !== null ? HUE_BG[Social.customHue(color)] : AVATAR_BG.emerald);
    const AVATAR_COLOR_KEY = 'mudrlant.avatarColor';
    let myProfile = null;
    let myChallenges = null;
    let myRating = null;
    let incomingList = null;
    // Přátelé (friends.js): řádky z friends_list (null = nenačtené nebo databáze přátele nemá), reakce k posledním výzvám, moji zablokovaní (null = nenačtení)
    const Friends = window.MudrlantFriends;
    let friendRows = null;
    let recentReactions = [];
    let myBlocks = null;
    let recentExpanded = false; // Poslední výzvy: rozbalené všechny (jinak jen tři nejnovější)
    let challengesLoading = false;
    const signedUser = () => (Auth && Auth.getState().user) || null;
    const playerName = (player) => (player && player.display_name) || 'Hráč';
    // Hráči, jejichž obrázek jde klepnout (klepnutí otevře profil); id → údaje o hráči
    const knownPlayers = new Map();
    // Moje sova (barva obleku + doplňky z lokální volby) jako text pro profil
    const myOwlText = () => Owl && Owl.encodeOwl && Look ? Owl.encodeOwl(Look.prefs(lookContext())) : '';
    // link = klepnutím na obrázek se otevře profil hráče (klepnutí zachytí společný posluchač dole)
    const avatarHtml = (player, size = 'h-10 w-10 text-xl', link = false) => {
        const linked = link && player && player.id;
        if (linked) knownPlayers.set(player.id, player);
        // Vlastní rámeček se bere z lokální volby (platí hned i ve vývojářské verzi, kde se do účtu neukládá)
        const me = signedUser();
        const ownFrame = Look && me && player && player.id === me.id ? Look.prefs(lookContext()).frame : null;
        const frame = window.MudrlantLookFrames ? window.MudrlantLookFrames.frameClass(ownFrame ? (ownFrame === 'zadny' ? null : ownFrame) : (player && player.frame)) : '';
        // Sova jako obrázek profilu: vlastní se bere z lokální volby (doplňky a barva obleku platí hned), cizí z profilu hráče
        const isMe = Boolean(me && player && player.id === me.id);
        // Můj vlastní řádek (žebříček, výzvy) nemusí mít sovu z databáze (starší schéma): bere se z mého profilu / zařízení
        const showsOwl = Boolean(player && (player.owl || (isMe && !player.draft && myProfile && myProfile.owl)));
        const owlHtml = showsOwl && Owl && Owl.owlAvatarHtml ? Owl.owlAvatarHtml(isMe && Look ? myOwlText() : player.owl) : '';
        return `<span ${linked ? `data-player-id="${escapeHtml(player.id)}" role="button" tabindex="0" aria-label="Profil hráče ${escapeHtml(playerName(player))}"` : 'aria-hidden="true"'} class="flex shrink-0 items-center justify-center rounded-full ${size} ${avatarBg(isMe && !player.draft && myProfile && myProfile.color ? myProfile.color : player && player.color)}${frame}${linked ? ' cursor-pointer' : ''}">${owlHtml || escapeHtml((player && player.avatar) || '🦊')}</span>`;
    };
    // Téma výzvy: „mix“ (všechna), jedno téma, nebo víc témat oddělených čárkou
    const challengeTopicIds = (topic) => topic === 'mix' ? TOPICS.map(item => item.id) : String(topic).split(',').filter(id => TOPIC_BY_ID[id]);
    const challengeTopicTitle = (topic) => {
        const ids = challengeTopicIds(topic);
        if (topic === 'mix' || ids.length === TOPICS.length) return 'Mix všech témat';
        if (ids.length <= 2) return ids.map(id => TOPIC_BY_ID[id].title).join(' + ');
        return `${ids.length} témat`;
    };
    const challengeTopicIcon = (topic) => { const ids = challengeTopicIds(topic); return ids.length === 1 ? TOPIC_BY_ID[ids[0]].icon : MIX.icon; };

    // Témata, ze kterých hráč nepřijímá výzvy (null = ještě se nenačetla)
    let myBlocked = null;
    let myAcceptsMix = true;
    const acceptSummary = () => !myBlocked ? 'nastavit' : `${myBlocked.length ? `${TOPICS.length - myBlocked.length} z ${TOPICS.length} témat` : 'všechna témata'}${myAcceptsMix ? '' : ', bez Mixu'}`;
    // Okno „Přijímané výzvy“: každé téma jde vypnout; ukládá se hned po klepnutí
    const openAccepted = async () => {
        const user = signedUser();
        if (!user || !Social) { openLoginDialog(); return; }
        let note = '';
        const render = () => {
            const blocked = myBlocked || [];
            showDialog('Přijímané výzvy', `
                <div class="flex flex-col gap-3">
                    <p class="text-xs leading-snug text-slate-500 dark:text-slate-400">Vyber, z jakých témat tě ostatní můžou vyzývat. U <b class="text-slate-700 dark:text-slate-200">vypnutých</b> témat ti výzvu nezadají a náhodný soupeř tě v nich nedostane. Třeba když historii vůbec neznáš.</p>
                    <button type="button" data-accept-mix role="switch" aria-checked="${myAcceptsMix}" class="btn-3d-light flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left ${myAcceptsMix ? 'bg-white dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-800/60'}">
                        ${uiArt('mix', 'h-9 w-9')}
                        <span class="min-w-0 flex-1"><span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">Mix všech témat</span><span class="block text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${myAcceptsMix ? (TOPICS.length - blocked.length > 0 ? `Dostaneš ho jen z tvých ${TOPICS.length - blocked.length} zapnutých témat.` : 'Nemáš zapnuté žádné téma.') : 'Vypnuto: přijímáš jen výzvy z konkrétních témat.'}</span></span>
                        <span class="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 ${myAcceptsMix ? 'justify-end bg-emerald-500' : 'justify-start bg-slate-300 dark:bg-slate-600'}"><span class="h-5 w-5 rounded-full bg-white shadow"></span></span>
                    </button>
                    <ul class="grid grid-cols-2 gap-1.5">${TOPICS.map(topic => {
                        const off = blocked.includes(topic.id);
                        return `<li><button type="button" data-accept-topic="${topic.id}" role="switch" aria-checked="${!off}" class="btn-3d-light flex w-full items-center gap-2 rounded-xl p-2 text-left ${off ? 'bg-slate-100 opacity-70 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-800'}">
                            ${topicIcon(topic, 'h-8 w-8', `rounded-lg p-1.5 ${styleOf(topic).soft}`, 'h-5 w-5')}
                            <span class="min-w-0 flex-1 text-[11.5px] font-black leading-tight ${off ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}">${escapeHtml(topic.title)}</span>
                            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${off ? 'bg-slate-300 text-white dark:bg-slate-600' : 'bg-emerald-500 text-white'}"><i data-lucide="${off ? 'ban' : 'check'}" class="h-3 w-3"></i></span>
                        </button></li>`;
                    }).join('')}</ul>
                    <div class="flex items-center justify-between gap-2">
                        <p class="text-xs font-bold text-slate-600 dark:text-slate-300">Přijímáš: ${escapeHtml(acceptSummary())}</p>
                        ${blocked.length ? '<button type="button" data-accept-all class="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200">Zapnout vše</button>' : ''}
                    </div>
                    <p class="min-h-[1rem] text-xs font-semibold ${note.startsWith('Uloženo') ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-400'}" role="status">${escapeHtml(note)}</p>
                </div>`, {
                onClick: async (event) => {
                    const toggle = event.target.closest('[data-accept-topic]');
                    const all = event.target.closest('[data-accept-all]');
                    const mixSwitch = event.target.closest('[data-accept-mix]');
                    if (!toggle && !all && !mixSwitch) return;
                    const before = myBlocked || [];
                    const beforeMix = myAcceptsMix;
                    if (mixSwitch) myAcceptsMix = !myAcceptsMix;
                    else myBlocked = all ? [] : before.includes(toggle.dataset.acceptTopic) ? before.filter(id => id !== toggle.dataset.acceptTopic) : [...before, toggle.dataset.acceptTopic];
                    note = '';
                    render();
                    try {
                        await Social.saveAccepts(user.id, { blocked: myBlocked, mix: myAcceptsMix });
                        note = 'Uloženo.';
                        paintChallenges();
                    } catch (error) {
                        myBlocked = before;
                        myAcceptsMix = beforeMix;
                        note = 'Uložení se nepodařilo. Zkontroluj připojení a že je v databázi nejnovější SQL.';
                    }
                    render();
                }
            });
        };
        render();
        if (myBlocked === null) { const accepts = await Social.getAccepts(user.id); myBlocked = accepts.blocked; myAcceptsMix = accepts.mix; if (document.getElementById('dialog-overlay')) render(); }
    };
    // Rámeček a titul u jména se ukládají do účtu, ať je vidí ostatní. Po změně ve Vzhledu se pošlou; po načtení profilu se na novém zařízení
    // (kde je volba výchozí) převezme volba z účtu a jinou zvolenou volbu zařízení se do účtu nahraje.
    let adoptingLook = false;
    const accountLook = (prefs) => ({ frame: prefs.frame === 'zadny' ? null : prefs.frame, title_pref: prefs.title === 'level' ? null : prefs.title });
    const saveLookToAccount = (prefs) => {
        const user = signedUser();
        if (!user || !Social || !myProfile || myProfile.id !== user.id) return; // i ve vývojářském režimu: rámeček a titul jsou jen vzhled, ať jdou vyzkoušet s druhým hráčem
        const next = accountLook(prefs);
        myProfile = { ...myProfile, ...next };
        updateProfileButton();
        paintChallenges();
        Social.saveLook(user.id, { frame: next.frame, title: next.title_pref }).catch(() => {});
    };
    const syncLookWithAccount = () => {
        if (!Look || !myProfile || devActive()) return;
        const ctx = lookContext();
        adoptingLook = true;
        try {
            if (ctx.prefs.frame === 'zadny' && myProfile.frame) Look.setPref('frame', myProfile.frame, ctx);
            if (ctx.prefs.title === 'level' && myProfile.title_pref) Look.setPref('title', myProfile.title_pref, ctx);
        } finally { adoptingLook = false; }
        const now = Look.prefs(ctx);
        const pushFrame = now.frame !== 'zadny' && now.frame !== (myProfile.frame || 'zadny');
        const pushTitle = now.title !== 'level' && now.title !== (myProfile.title_pref || 'level');
        if (pushFrame || pushTitle) saveLookToAccount({ frame: pushFrame ? now.frame : (myProfile.frame || 'zadny'), title: pushTitle ? now.title : (myProfile.title_pref || 'level') });
        updateControlsUI();
    };
    // Sova jako obrázek profilu: po změně doplňků nebo barvy obleku se profil sám přeuloží (se zpožděním, ať se nepošle každé klepnutí)
    let owlSaveTimer = null;
    const saveOwlToAccount = () => {
        const user = signedUser();
        if (!user || !Social || !myProfile || myProfile.id !== user.id || !myProfile.owl || devActive()) return;
        const owl = myOwlText();
        if (!owl || owl === myProfile.owl) return;
        myProfile = { ...myProfile, owl };
        Social.saveOwl(user.id, owl).catch(() => {});
    };
    if (Look) Look.onChange((prefs, key) => {
        if ((key === 'acc' || key === 'robe') && myProfile && myProfile.owl) {
            updateProfileButton();
            paintChallenges();
            clearTimeout(owlSaveTimer);
            owlSaveTimer = setTimeout(saveOwlToAccount, 800);
        }
        if (key === 'frame' && myProfile) { updateProfileButton(); paintChallenges(); }
        if (!adoptingLook && (key === 'frame' || key === 'title')) saveLookToAccount(prefs);
    });
    const loadMyProfile = async () => {
        const user = signedUser();
        if (!user) { myProfile = null; return null; }
        if (myProfile && myProfile.id === user.id) return myProfile;
        let loaded = null;
        try { loaded = await Social.getProfile(user.id); } catch (error) { loaded = null; }
        // Mezitím se hráč odhlásil nebo přihlásil jiný účet: pozdní odpověď cizího profilu se zahodí
        if (!signedUser() || signedUser().id !== user.id) return null;
        myProfile = loaded;
        if (!myProfile) myProfile = { id: user.id, display_name: user.name, avatar: '🦊', color: 'emerald' };
        const savedColor = readJson(AVATAR_COLOR_KEY);
        if (Social.customHue(savedColor) !== null && Social.nearestColor(savedColor) === myProfile.color) myProfile = { ...myProfile, color: savedColor };
        if (readJson(OWL_AVATAR_KEY) === true && !myProfile.owl && Owl) myProfile = { ...myProfile, owl: myOwlText() };
        syncLookWithAccount();
        updateProfileButton();
        syncProgress();
        checkSchemaVersion(user);
        if (myBlocked === null) Social.getAccepts(user.id).then(accepts => { if (!signedUser() || signedUser().id !== user.id) return; myBlocked = accepts.blocked; myAcceptsMix = accepts.mix; paintChallenges(); });
        return myProfile;
    };

    // Část Výzvy na úvodní stránce: bez nastaveného Supabase se neukáže, bez přihlášení láká k přihlášení
    const challengeRow = (row) => {
        const count = row.challenge ? row.challenge.count : 0;
        const best = row.others.length ? Math.max(...row.others.map(other => other.correct)) : -1;
        const outcome = !row.others.length ? 'čeká' : row.correct > best ? 'vyhráno' : row.correct === best ? 'remíza' : 'prohráno';
        // Barevný proužek vlevo a štítek: vyhráno zelená, prohráno červená, remíza zlatá, čeká šedá
        const look = outcome === 'vyhráno' ? ['bg-emerald-500', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300']
            : outcome === 'prohráno' ? ['bg-rose-500', 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300']
            : outcome === 'remíza' ? ['bg-gold-500', 'bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200']
            : ['bg-slate-300 dark:bg-slate-600', 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'];
        const rivals = row.others.slice(0, 2).map(other => avatarHtml(other.player, 'h-7 w-7 text-sm ring-2 ring-white dark:ring-slate-800', true)).join('');
        return `
            <button type="button" data-action="challenge-open" data-code="${escapeHtml(row.challenge_id)}" class="relative flex min-h-[2.75rem] w-full items-center gap-2 overflow-hidden rounded-xl bg-white py-1.5 pl-3.5 pr-2.5 text-left shadow-sm ring-1 ring-slate-200/70 active:scale-[0.98] dark:bg-slate-800/70 dark:ring-slate-700/70">
                <span aria-hidden="true" class="absolute inset-y-0 left-0 w-1.5 ${look[0]}"></span>
                <span class="flex shrink-0 -space-x-2">${rivals || `<span class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-slate-700"><i data-lucide="users" class="h-4 w-4"></i></span>`}</span>
                <span class="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">${escapeHtml(row.challenge ? challengeTopicTitle(row.challenge.topic) : '')}</span>
                ${Friends && signedUser() ? Friends.reactionBadge(Friends.reactionFor(recentReactions, row.challenge_id, signedUser().id), row.others[0] ? playerName(row.others[0].player) : '') : ''}
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${look[1]}">${outcome}</span>
                <span class="w-11 shrink-0 text-right text-[15px] font-black tabular-nums text-slate-800 dark:text-slate-100">${row.correct}/${count}</span>
            </button>`;
    };
    const incomingRow = (invite) => `
        <button type="button" data-action="challenge-open" data-code="${escapeHtml(invite.id)}" class="flex w-full items-center gap-2.5 rounded-2xl bg-gold-50 p-2 text-left shadow-sm ring-1 ring-gold-300/70 active:scale-[0.98] dark:bg-gold-900/20 dark:ring-gold-700/60">
            ${avatarHtml(invite.creator, 'h-10 w-10 text-xl', true)}
            <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(playerName(invite.creator))} tě vyzývá</span>
                <span class="block truncate text-[11px] font-semibold text-slate-600 dark:text-slate-400">${escapeHtml(challengeTopicTitle(invite.topic))} · ${invite.count} otázek</span>
            </span>
            <span class="flex shrink-0 items-center gap-1 rounded-xl bg-gold-500 px-3.5 py-2 text-[13px] font-black text-brand-950 shadow-sm"><i data-lucide="play" class="h-3.5 w-3.5"></i>Hrát</span>
        </button>`;
    // Rating a ligy (rating.js; počítá je databáze po dohrání výzvy proti jinému hráči). Barvy lig jsou třídy .league-* v src/input.css.
    const Rating = window.MudrlantRating;
    const BAR_WIDTHS = ['w-0', 'w-[10%]', 'w-[20%]', 'w-[30%]', 'w-[40%]', 'w-[50%]', 'w-[60%]', 'w-[70%]', 'w-[80%]', 'w-[90%]', 'w-full'];
    const leagueBubble = (league, size = 'h-11 w-11', iconSize = 'h-5 w-5') => `<span class="league-${league.id} flex ${size} shrink-0 items-center justify-center rounded-full shadow-sm ring-2 ring-white/70 dark:ring-slate-700" title="Liga ${escapeHtml(league.name)}"><i data-lucide="${league.icon}" class="${iconSize}"></i></span>`;
    // Malý popisek „ikona Liga · rating“ pro profil soupeře a žebříček
    const leagueChip = (rating) => {
        if (!Rating || rating === null || rating === undefined) return '';
        const league = Rating.leagueFor(rating);
        return `<span class="league-fg-${league.id} inline-flex items-center gap-1 text-xs font-black"><i data-lucide="${league.icon}" class="h-3.5 w-3.5"></i>${escapeHtml(league.name)} · ${Rating.cleanRating(rating)}</span>`;
    };
    // Karta „Moje liga“ na záložce Více hráčů: ikona ligy, rating, ukazatel do další ligy a tlačítko týdenního žebříčku
    const leagueCard = () => {
        if (!Rating || !myRating) return '';
        const progress = Rating.leagueProgress(myRating.rating);
        const hint = progress.next ? `Do ligy ${progress.next.name} ještě ${progress.toNext}` : 'Nejvyšší liga';
        return `
            <div id="league-card" class="flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
                ${leagueBubble(progress.league, 'h-10 w-10')}
                <div class="min-w-0 flex-1">
                    <p class="truncate text-[15px] font-black leading-tight text-slate-800 dark:text-slate-100"><span class="sr-only">Moje liga </span>${escapeHtml(progress.league.name)} · ${myRating.rating}</p>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}" aria-label="Postup do další ligy"><div class="league-${progress.league.id} h-full rounded-full ${BAR_WIDTHS[Math.round(progress.percent / 10)]}"></div></div>
                    <p class="mt-0.5 truncate text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">${myRating.games ? hint : 'Rating se mění výzvami'}</p>
                </div>
                <button type="button" data-action="weekly-board" class="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gold-50 px-3 text-[12px] font-black text-brand-950 ring-1 ring-gold-300/70 active:scale-95 dark:bg-gold-900/20 dark:text-gold-200 dark:ring-gold-700/60"><i data-lucide="trophy" class="h-4 w-4"></i> Týden</button>
                <button type="button" data-action="league-help" aria-label="Jak fungují ligy" title="Jak to funguje?" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-black text-brand-700 active:scale-95 dark:bg-slate-700 dark:text-cream">?</button>
            </div>`;
    };
    // Vysvětlení ratingu a lig (z karty ligy i z týdenního žebříčku). Hranice a vzhled lig se čtou z rating.js. fromBoard = tlačítko Zpět na žebříček.
    const openLeagueHelp = (fromBoard = false) => {
        if (!Rating) return;
        const mine = myRating ? Rating.leagueFor(myRating.rating) : null;
        const range = (league, index) => {
            const next = Rating.LEAGUES[index + 1];
            if (!next) return `od ${league.from}`;
            return index === 0 ? `do ${next.from - 1}` : `${league.from}–${next.from - 1}`;
        };
        const leagues = Rating.LEAGUES.map((league, index) => `
            <li data-league="${league.id}" class="flex items-center gap-2 rounded-xl bg-white p-1.5 shadow-sm dark:bg-slate-800 ${mine && mine.id === league.id ? 'ring-2 ring-brand-600' : ''}">
                ${leagueBubble(league, 'h-8 w-8', 'h-4 w-4')}
                <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(league.name)}${mine && mine.id === league.id ? ' (ty)' : ''}</span><span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${range(league, index)}</span></span>
            </li>`).join('');
        const POINT = 'flex gap-2 text-[13px] leading-snug text-slate-600 dark:text-slate-300';
        const DOT = '<span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500"></span>';
        showDialog('Jak fungují ligy', `
            <div id="league-help" class="flex flex-col gap-3">
                <ul class="flex flex-col gap-1.5">
                    <li class="${POINT}">${DOT}<span><b class="text-slate-800 dark:text-slate-100">Rating</b> začíná na ${Rating.START} a mění se jen ve výzvách proti jiným hráčům.</span></li>
                    <li class="${POINT}">${DOT}<span>Výhra rating zvedá, prohra snižuje. Silnější soupeř znamená víc bodů.</span></li>
                    <li class="${POINT}">${DOT}<span>Remíza rating skoro nemění.</span></li>
                </ul>
                <div>
                    <p class="mb-1 px-0.5 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Ligy podle ratingu</p>
                    <ol class="grid grid-cols-2 gap-1.5">${leagues}</ol>
                </div>
                <p class="${POINT}">${DOT}<span><b class="text-slate-800 dark:text-slate-100">Týdenní žebříček</b> řadí hráče podle změny ratingu za týden. V pondělí se počítá znovu od nuly.</span></p>
                ${fromBoard ? '<button type="button" data-help-back class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-2.5 text-sm font-black text-white"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět na žebříček</button>' : ''}
            </div>`, { onClick: (event) => { if (event.target.closest('[data-help-back]')) openWeeklyBoard(); } });
        renderIcons(document.getElementById('dialog-overlay'));
    };
    // Okno Týdenní žebříček: top hráči týdne podle součtu změn ratingu (server vrací jen veřejné údaje)
    const openWeeklyBoard = async () => {
        const user = signedUser();
        if (!user || !Social || !Rating) { openLoginDialog(); return; }
        const head = `<div class="flex items-start gap-2"><p class="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Týden ${escapeHtml(Rating.weekLabel())} · řazeno podle změny ratingu ve výzvách proti jiným hráčům. V pondělí se počítá znovu.</p><button type="button" data-league-help aria-label="Jak fungují ligy" title="Jak to funguje?" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-50 text-base font-black text-brand-950 ring-1 ring-gold-300/70 active:scale-95 dark:bg-gold-900/20 dark:text-gold-200 dark:ring-gold-700/60">?</button></div>`;
        const onClick = (event) => { if (event.target.closest('[data-league-help]')) openLeagueHelp(true); };
        showDialog('Týdenní žebříček', `<div class="flex flex-col gap-3">${head}<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p></div>`, { onClick });
        let rows;
        try { rows = await Social.weeklyLeaderboard(); } catch (error) { rows = undefined; }
        const open = document.getElementById('dialog-overlay');
        if (!open || open.dataset.title !== 'Týdenní žebříček') return;
        let body;
        if (rows === undefined) body = '<p class="text-sm font-semibold text-rose-700 dark:text-rose-400">Žebříček se nepodařilo načíst. Zkontroluj připojení.</p>';
        else if (rows === null) body = '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Žebříček zatím není k dispozici.</p>';
        else if (!rows.length) body = '<p class="text-sm text-slate-500 dark:text-slate-400">Tenhle týden zatím nikdo nedohrál výzvu proti jinému hráči. Buď první!</p>';
        else {
            const mineIn = rows.some(row => row.id === user.id);
            body = `<ol id="weekly-list" class="flex flex-col gap-1.5">${rows.map((row, index) => `
                <li ${row.id === user.id ? 'data-me' : ''} class="flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800 ${row.id === user.id ? 'ring-2 ring-brand-600' : ''}">
                    <span class="w-5 shrink-0 text-center text-sm font-black text-slate-500 dark:text-slate-400">${index === 0 ? '🏆' : index + 1}</span>
                    ${avatarHtml(row, 'h-9 w-9 text-lg', true)}
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(playerName(row))}${row.id === user.id ? ' (ty)' : ''}</span>
                        <span class="flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">Úr. ${levelProgress(row.xp || 0).level} · ${leagueChip(row.rating)}</span>
                    </span>
                    <span class="shrink-0 text-right"><span class="block text-base font-black ${row.week_delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}">${Rating.formatDelta(row.week_delta)}</span><span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">${row.week_wins}/${row.week_games} výher</span></span>
                </li>`).join('')}</ol>
                ${mineIn ? '' : '<p class="text-xs text-slate-500 dark:text-slate-400">Ty tu zatím nejsi: zahraj tenhle týden výzvu proti jinému hráči.</p>'}`;
        }
        showDialog('Týdenní žebříček', `<div class="flex flex-col gap-3">${head}${body}</div>`, { onClick });
        renderIcons(document.getElementById('dialog-overlay'));
    };
    // Přepínač nahoře na úvodní stránce: Jeden hráč (dnešní otázky a témata) / Více hráčů (výzvy); bez Supabase se nezobrazuje
    const homeTab = () => {
        if (!(Auth && Auth.isConfigured() && Social)) return 'single';
        const saved = readJson(KEYS.homeTab);
        return saved === 'multi' ? 'multi' : 'single';
    };
    const renderHomeTabs = () => {
        if (!(Auth && Auth.isConfigured() && Social)) return '';
        const tab = homeTab();
        const waiting = (incomingList || []).length;
        const option = (id, icon, label, badge = 0) => `
            <button type="button" role="tab" data-action="home-tab" data-tab="${id}" aria-selected="${tab === id}" class="relative flex flex-1 items-center justify-center gap-2 rounded-xl min-h-[2.75rem] px-3 text-[13px] font-black transition-colors ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-400'}">
                <i data-lucide="${icon}" class="h-4 w-4"></i> ${label}${badge ? `<span class="rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-brand-950">${badge}</span>` : ''}
            </button>`;
        return `<div id="home-tabs" role="tablist" class="flex shrink-0 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${option('single', 'user-round', 'Jeden hráč')}${option('multi', 'users', 'Více hráčů', waiting)}</div>`;
    };
    // Rychlé akce: tři dlaždice (Vyzvat, Náhodný soupeř, Zadat kód) a pod nimi drobný čip s nastavením přijímaných výzev
    const QUICK_TILE = 'flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-[12px] font-black leading-tight';
    const QUICK_LIGHT = 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/70 active:scale-95 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/70';
    const quickActions = () => `
        <div class="flex flex-col gap-1.5">
            <div class="grid grid-cols-3 gap-2">
                <button type="button" data-action="new-challenge" class="${QUICK_TILE} btn-3d bg-brand-700 text-white">${uiArt('vyzva', 'h-9 w-9')}Vyzvat</button>
                <button type="button" data-action="random-challenge" class="${QUICK_TILE} ${QUICK_LIGHT}"><span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200"><i data-lucide="shuffle" class="h-5 w-5"></i></span>Náhodný soupeř</button>
                <button type="button" data-action="join-challenge" class="${QUICK_TILE} ${QUICK_LIGHT}"><span class="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><i data-lucide="hash" class="h-5 w-5"></i></span>Zadat kód</button>
            </div>
            <button type="button" data-action="open-accept" title="Změnit, z jakých témat přijímám výzvy" class="flex min-h-[2rem] max-w-full items-center gap-1.5 self-center rounded-full bg-slate-200/60 px-3 py-1 text-[11.5px] font-bold text-slate-600 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300"><i data-lucide="shield-check" class="h-3.5 w-3.5 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="min-w-0 truncate">Přijímám výzvy z: <b class="text-slate-800 dark:text-slate-100">${escapeHtml(acceptSummary())}</b></span><i data-lucide="pencil" class="h-3 w-3 shrink-0 text-brand-700 dark:text-cream"></i></button>
        </div>`;
    // Poslední výzvy: jen tři nejnovější, Zobrazit vše rozbalí zbytek
    const recentSection = (incoming) => {
        const LABEL = 'px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
        const rows = myChallenges === null ? [] : myChallenges.filter(row => !incoming.some(invite => invite.id === row.challenge_id)).slice(0, 6);
        const more = rows.length > 3;
        const toggle = more ? `<button type="button" data-action="recent-more" aria-expanded="${recentExpanded}" class="flex min-h-[2rem] items-center gap-1 rounded-lg px-1.5 text-[11px] font-black text-brand-700 active:scale-95 dark:text-cream">${recentExpanded ? 'Méně' : `Zobrazit vše (${rows.length})`}<i data-lucide="chevron-down" class="h-3.5 w-3.5 ${recentExpanded ? 'rotate-180' : ''}"></i></button>` : '';
        const body = myChallenges === null
            ? '<p class="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Načítám výzvy…</p>'
            : rows.length ? `<div class="flex flex-col gap-1.5">${(recentExpanded ? rows : rows.slice(0, 3)).map(challengeRow).join('')}</div>`
                : `<div class="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">${uiArt('sova-vyzva', 'h-10 w-10')}<p class="text-sm text-slate-600 dark:text-slate-300">Zatím žádné výzvy. Založ první tlačítkem Vyzvat.</p></div>`;
        return `<div class="flex flex-col gap-1"><div class="flex min-h-[2rem] items-center justify-between gap-2"><p class="${LABEL}">Poslední výzvy</p>${toggle}</div>${body}</div>`;
    };
    // Pořadí podle důležitosti: co čeká na hráče (rozehraná výzva, zápas turnaje dnes, pozvánky), turnaj, rychlé akce, liga, poslední výzvy
    const challengesInner = () => {
        const user = signedUser();
        const LABEL = 'px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
        if (!user) {
            return `
                <div class="flex flex-col items-center gap-3 rounded-[1.4rem] bg-white p-5 text-center shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
                    ${uiArt('sova-vyzva', 'h-24 w-24')}
                    <div><p class="text-base font-black text-slate-800 dark:text-slate-100">Hraj s kamarády</p><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Přihlas se, vyber si přezdívku a obrázek a vyzvi kamaráda nebo náhodného hráče. Dostanete stejné otázky a porovnáte, kdo je lepší.</p></div>
                    <button type="button" data-action="auth-login" class="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 py-3 text-base font-black text-white shadow-md active:scale-[0.98]"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>
                </div>`;
        }
        const incoming = incomingList || [];
        const resume = challenge && !challenge.done && !challenge.tournament
            ? `<button type="button" data-action="challenge-resume" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gradient-to-b from-gold-400 to-gold-600 px-4 py-2.5 text-[15px] font-black text-brand-950"><i data-lucide="play" class="h-5 w-5"></i> Pokračovat ve výzvě (${challenge.index + 1}/${challenge.count})</button>` : '';
        // Přátelé (friends.js): žádosti o přátelství mezi tím, co čeká; pás přátel pod rychlými akcemi (jen když nějací jsou)
        const social = Friends ? Friends.split(friendRows) : { friends: [], incoming: [] };
        const requests = Friends ? Friends.requestRows(social.incoming, friendsHelpers()) : '';
        const waiting = incoming.length || requests ? `<div class="flex flex-col gap-1.5"><p class="flex items-center gap-1.5 ${LABEL}"><span class="h-2 w-2 rounded-full bg-gold-500"></span>Čekají na tebe</p>${incoming.slice(0, 5).map(incomingRow).join('')}${requests}</div>` : '';
        const friendsStrip = Friends ? Friends.friendsStrip(social.friends, friendsHelpers()) : '';
        // Zápas turnaje, který se hraje dnes, je mezi tím, co čeká: karta turnaje se zlatým Hrát jde nahoru
        const tournamentFirst = tournamentWaits();
        return `
            <div class="flex flex-col gap-2.5">
                ${resume}
                ${tournamentFirst ? tournamentCard() : ''}
                ${waiting}
                ${tournamentFirst ? '' : tournamentCard()}
                ${quickActions()}
                ${friendsStrip}
                ${leagueCard()}
                ${recentSection(incoming)}
            </div>`;
    };
    // Pomocné funkce pro friends.js: obrázek hráče a zápis hráče mezi známé (klepnutí na něj otevře profil)
    const friendsHelpers = () => ({ avatarHtml, escapeHtml, register: (player) => { if (player && player.id) knownPlayers.set(player.id, player); } });
    const friendById = (id) => (friendRows || []).find(row => row.id === id) || null;
    // Načte přátele a reakce k posledním výzvám (databáze bez nich vrátí null / prázdno; sekce se pak neukážou)
    const loadFriends = async (user) => {
        if (!Friends) return;
        const [rows, reactions, blocks] = await Promise.all([
            Social.friendsList().catch(() => null),
            Social.reactionsFor({ challengeIds: (myChallenges || []).map(row => row.challenge_id) }).catch(() => []),
            myBlocks === null ? Social.blockedPlayers(user.id).catch(() => null) : Promise.resolve(myBlocks)
        ]);
        if (!signedUser() || signedUser().id !== user.id) return;
        friendRows = rows;
        recentReactions = reactions;
        myBlocks = blocks;
    };
    // Žádost o přátelství z řádku „Čekají na tebe“: přijmout / odmítnout (odmítnutí žádost smaže)
    const answerFriendRequest = async (otherId, accept) => {
        const user = signedUser();
        if (!user || !Friends) return;
        const row = document.querySelector(`[data-friend-request="${otherId}"]`);
        if (row) row.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
            if (accept) await Social.acceptFriend(user.id, otherId); else await Social.removeFriend(user.id, otherId);
            friendRows = (friendRows || []).map(item => item.id === otherId ? (accept ? { ...item, status: 'accepted' } : null) : item).filter(Boolean);
            showToast(accept ? `${playerName(friendById(otherId) || knownPlayers.get(otherId))} je teď tvůj přítel.` : 'Žádost odmítnuta.');
        } catch (error) {
            showToast(error && error.message ? error.message : 'Nepodařilo se. Zkus to znovu.');
        }
        paintChallenges();
    };
    const renderChallengesSection = () => Auth && Auth.isConfigured() && Social ? `<section id="challenges-section">${challengesInner()}</section>` : '';
    const paintChallenges = () => {
        if (screen !== 'home') return;
        const tabs = document.getElementById('home-tabs');
        if (tabs) { tabs.outerHTML = renderHomeTabs(); renderIcons(document.getElementById('home-tabs')); }
        const element = document.getElementById('challenges-section');
        if (!element) return;
        element.innerHTML = challengesInner();
        renderIcons(element);
    };
    const refreshChallenges = async () => {
        const user = signedUser();
        if (!user || !Social || challengesLoading) return;
        challengesLoading = true;
        try {
            await loadMyProfile();
            updateProfileButton();
            paintChallenges();
            refreshTournaments();
            const [mine, incoming, rating] = await Promise.all([
                Social.myChallenges(user.id).catch(() => []),
                Social.incomingChallenges(user.id).catch(() => []),
                Social.getRating(user.id).catch(() => null)
            ]);
            if (!signedUser() || signedUser().id !== user.id) return;
            myChallenges = mine;
            myRating = rating;
            incomingList = incoming;
            paintChallenges();
            // Přátelé a reakce až po hlavním obsahu (záložka se vykreslí dřív); poslední aktivita se zapíše nejvýš jednou za 5 minut
            if (Friends) Social.touchSeen().catch(() => {});
            await loadFriends(user);
            paintChallenges();
        } finally {
            challengesLoading = false;
        }
    };

    // Profil v záhlaví: obrázek hráče, bez přihlášení tlačítko k přihlášení; bez nastaveného Supabase se neukáže
    // Jediné tlačítko vpravo nahoře: po přihlášení obrázek hráče, jinak ozubené kolečko; otevře okno Nastavení s profilem
    const updateProfileButton = () => {
        const button = document.getElementById('btn-settings');
        if (!button) return;
        const user = Auth && Auth.isConfigured() && Social ? signedUser() : null;
        if (user) {
            const profile = myProfile || { display_name: user.name, avatar: '🦊', color: 'emerald' };
            button.className = 'shrink-0 rounded-full shadow-md ring-2 ring-white transition-all active:scale-95 dark:ring-slate-700';
            button.innerHTML = avatarHtml(profile, 'h-11 w-11 text-2xl');
            button.setAttribute('aria-label', `Nastavení a profil: ${playerName(profile)}`);
            button.title = `Nastavení a profil: ${playerName(profile)}`;
        } else {
            button.className = BUTTON_INACTIVE;
            button.innerHTML = '<i data-lucide="settings-2" class="h-5 w-5"></i>';
            button.setAttribute('aria-label', 'Nastavení');
            button.title = 'Nastavení';
            renderIcons(button);
        }
    };
    const openLoginDialog = () => showDialog('Účet', `
        <div class="flex flex-col gap-4">
            ${owlLogo('mx-auto flex', 'h-24 w-auto drop-shadow-lg')}
            <p class="text-sm text-slate-600 dark:text-slate-300">S účtem Google si vybereš přezdívku a obrázek, můžeš vyzývat kamarády nebo náhodné hráče a porovnat s nimi výsledky. Hra dál funguje i bez přihlášení.</p>
            <button type="button" data-auth-login-dialog class="${PRIMARY_BUTTON}"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>
        </div>`, { onClick: (event) => { if (event.target.closest('[data-auth-login-dialog]')) Auth.login(); } });

    // Úvod (jednou, dokud hráč nezvolí): přihlášení přes Google jako hlavní volba, méně výrazně hraní bez účtu
    const wantsAccountWelcome = () => Boolean(Auth && Auth.isConfigured() && Social) && !Auth.hasSession() && readJson(KEYS.account) !== 'host';
    const renderAccountWelcome = () => {
        screen = 'welcome';
        const error = Auth.getState().error;
        appContent.innerHTML = `
            <div id="account-welcome" class="fade-in flex min-h-full flex-col justify-center gap-6 p-6">
                <div class="text-center">
                    <img src="icons/topics/sova-vitej.webp" alt="" class="mx-auto mb-3 h-44 w-44 object-contain drop-shadow-lg">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-slate-50">Vítej v Mudrlantovi</h2>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Vědomostní kvíz ze zeměpisu, historie, přírody, kultury a sportu. S účtem si vybereš přezdívku a obrázek, můžeš vyzývat kamarády a porovnávat výsledky.</p>
                </div>
                ${error ? `<p class="text-center text-sm font-semibold text-rose-700 dark:text-rose-400" role="alert">${escapeHtml(error)}</p>` : ''}
                <div class="flex flex-col items-center gap-2">
                    <button type="button" data-action="auth-login" class="${PRIMARY_BUTTON}"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>
                    <button type="button" data-action="play-as-host" class="mt-1 rounded-xl px-4 py-2 text-sm font-bold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-800 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-100">Pokračovat bez přihlášení</button>
                    <p class="text-center text-xs text-slate-500 dark:text-slate-400">Hra funguje i bez účtu, jen bez profilu a výzev. Přihlásit se můžeš kdykoli později.</p>
                </div>
                <p class="mt-2 text-center text-xs text-slate-500 dark:text-slate-400"><a href="soukromi.html" class="rounded-lg px-1.5 py-2 font-bold underline underline-offset-2">Ochrana osobních údajů</a> · <a href="licence.html" class="rounded-lg px-1.5 py-2 font-bold underline underline-offset-2">Zdroje a licence</a></p>
            </div>`;
        renderIcons(appContent);
        updateControlsUI();
    };

    // Okna (profil, nová výzva, kód, detail výzvy): jedno společné
    let dialogHandler = null;
    let dialogSubmit = null;
    let dialogInput = null;
    const closeDialog = () => {
        const overlay = document.getElementById('dialog-overlay');
        if (overlay) overlay.remove();
        dialogHandler = null;
        dialogSubmit = null;
        dialogInput = null;
    };
    const showDialog = (title, body, { onClick = null, onSubmit = null, onInput = null } = {}) => {
        closeChooser();
        closeSettings();
        let overlay = document.getElementById('dialog-overlay');
        const created = !overlay;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dialog-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'dialog-title');
            overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay || event.target.closest('[data-close]')) { closeDialog(); return; }
                if (dialogHandler) dialogHandler(event);
            });
            overlay.addEventListener('submit', (event) => { event.preventDefault(); if (dialogSubmit) dialogSubmit(event); });
            overlay.addEventListener('input', (event) => { if (dialogInput) dialogInput(event); });
            document.body.appendChild(overlay);
            trapFocus(overlay);
        }
        dialogHandler = onClick;
        dialogSubmit = onSubmit;
        dialogInput = onInput;
        const scroll = overlay.firstElementChild ? overlay.firstElementChild.scrollTop : 0;
        // Překreslení po klepnutí nesmí hodit okno nahoru: zachová se posun i zaměřené pole
        const activeId = !created && overlay.contains(document.activeElement) ? document.activeElement.id : '';
        const retitled = overlay.dataset.title !== title;
        overlay.dataset.title = title;
        overlay.innerHTML = `
            <div class="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-slate-50 p-5 shadow-2xl dark:bg-slate-900">
                <div class="mb-4 flex items-center justify-between">
                    <h2 id="dialog-title" class="text-lg font-black text-slate-800 dark:text-slate-100">${escapeHtml(title)}</h2>
                    <button type="button" data-close aria-label="Zavřít" class="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                ${body}
            </div>`;
        overlay.firstElementChild.scrollTop = scroll;
        renderIcons(overlay);
        if (created || retitled) {
            const focus = overlay.querySelector('[data-autofocus]') || overlay.querySelector('[data-close]');
            if (focus) focus.focus({ preventScroll: true });
        } else if (activeId) {
            const again = overlay.querySelector(`#${activeId}`);
            if (again) { again.focus({ preventScroll: true }); if (again.setSelectionRange && again.value) again.setSelectionRange(again.value.length, again.value.length); }
        }
        return overlay;
    };
    const DIALOG_NOTE = (text, tone = 'text-rose-700 dark:text-rose-400') => `<p class="mt-3 min-h-[1.25rem] text-sm font-semibold ${tone}" role="status">${escapeHtml(text)}</p>`;
    const PRIMARY_BUTTON = 'flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-3 text-base font-black text-white disabled:opacity-50';
    const SECONDARY_BUTTON = 'flex w-full items-center justify-center gap-2 rounded-2xl btn-3d-light bg-white px-4 py-3 text-base font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100';

    // --- Nahlásit chybu v otázce ---
    // Důvod (4 tlačítka) + volitelný text; bez účtu se hlášení přátelsky odmítne, bez sítě se uloží do fronty a odešle později (question-report.js)
    const Report = window.MudrlantReport;
    const canReport = () => Boolean(Report && current);
    const reportStorage = () => { try { return window.localStorage; } catch (e) { return null; } };
    const reportSender = () => {
        const user = Auth && Auth.isConfigured() && Social ? signedUser() : null;
        return { user: user ? user.id : null, send: user ? (report) => Social.reportQuestion(user.id, report) : null, storage: reportStorage() || { getItem: () => null, setItem: () => {} } };
    };
    const flushReports = () => { if (Report && navigator.onLine !== false) Report.flush(reportSender()).catch(() => {}); };
    const openReportDialog = () => {
        if (!canReport()) return;
        const context = { topic: current.topic, itemId: current.id, questionType: current.question.type, title: current.question.title, answer: current.question.answerLabel };
        const draft = { reason: '', note: '', busy: false, message: '', done: false };
        const render = () => {
            if (draft.done) {
                showDialog('Nahlásit chybu v otázce', `
                    <div class="flex flex-col items-center gap-3 py-2 text-center">
                        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><i data-lucide="check" class="h-6 w-6"></i></span>
                        <p class="text-[15px] font-semibold text-slate-700 dark:text-slate-200" role="status">${escapeHtml(draft.message)}</p>
                        <button type="button" data-close data-autofocus class="${PRIMARY_BUTTON}">Zavřít</button>
                    </div>`);
                return;
            }
            showDialog('Nahlásit chybu v otázce', `
                <form id="report-form" autocomplete="off">
                    <p class="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Co je na otázce špatně?</p>
                    <div class="grid grid-cols-2 gap-2" role="group" aria-label="Důvod hlášení">${Report.REASONS.map(reason => `
                        <button type="button" id="report-reason-${reason.id}" data-reason="${reason.id}" aria-pressed="${draft.reason === reason.id}" class="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2 text-sm font-bold transition-colors ${draft.reason === reason.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}">
                            <i data-lucide="${reason.icon}" class="h-4 w-4 shrink-0"></i> ${reason.label}
                        </button>`).join('')}
                    </div>
                    <label for="report-note" class="mb-1 mt-3 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Poznámka (nepovinná)</label>
                    <textarea id="report-note" rows="3" maxlength="${Report.NOTE_MAX}" placeholder="Co je správně, nebo co ti vadí" class="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-800 outline-none focus:border-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">${escapeHtml(draft.note)}</textarea>
                    ${DIALOG_NOTE(draft.message)}
                    <button type="submit" class="${PRIMARY_BUTTON}"${draft.reason && !draft.busy ? '' : ' disabled'}><i data-lucide="send" class="h-5 w-5"></i> ${draft.busy ? 'Odesílám…' : 'Odeslat hlášení'}</button>
                </form>`, {
                onClick: (event) => {
                    const button = event.target.closest('[data-reason]');
                    if (!button || draft.busy) return;
                    draft.reason = button.dataset.reason;
                    draft.message = '';
                    render();
                },
                onInput: (event) => { if (event.target.id === 'report-note') draft.note = event.target.value; },
                onSubmit: async () => {
                    if (draft.busy) return;
                    const report = Report.buildReport(context, draft.reason, draft.note);
                    if (!report) { draft.message = 'Vyber, co je špatně.'; render(); return; }
                    draft.busy = true;
                    render();
                    const sender = reportSender();
                    const result = await Report.submit(report, { ...sender, online: navigator.onLine !== false });
                    draft.busy = false;
                    draft.message = result.message;
                    draft.done = result.state !== 'refused';
                    if (document.getElementById('dialog-overlay')) render();
                }
            });
        };
        render();
    };
    // Dev panel: seznam hlášení (databáze ho pustí jen účtu v dev_admins)
    const openQuestionReports = async () => {
        const user = Auth && Auth.isConfigured() && Social ? signedUser() : null;
        if (!user) { showToast('Hlášení vidí přihlášený účet z dev_admins.'); return; }
        const draw = (body) => showDialog('Hlášení otázek', body, {
            onClick: async (event) => {
                const button = event.target.closest('[data-report-done]');
                if (!button) return;
                button.disabled = true;
                try { await Social.deleteQuestionReport(button.dataset.reportDone); } catch (error) { showToast('Hlášení se nepodařilo vyřídit.'); }
                openQuestionReports();
            }
        });
        draw('<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">Načítám hlášení…</p>');
        let rows;
        try { rows = await Social.getQuestionReports(100); } catch (error) {
            draw(DIALOG_NOTE(error.status === 401 || error.status === 403 ? 'Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).' : (error.message || 'Hlášení se nepodařilo načíst.')));
            return;
        }
        draw(rows.length ? `<ul class="flex flex-col gap-2">${rows.map(row => `
            <li class="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                <p class="flex flex-wrap items-center gap-x-2 text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300"><span>${escapeHtml(Report.reasonLabel(row.reason))}</span><span class="font-bold normal-case tracking-normal text-slate-500 dark:text-slate-400">${escapeHtml(row.topic)} · ${escapeHtml(row.item_id)}${row.question_type ? ` · ${escapeHtml(row.question_type)}` : ''}</span></p>
                ${row.title ? `<p class="mt-1 font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(row.title)}${row.answer ? ` → ${escapeHtml(row.answer)}` : ''}</p>` : ''}
                ${row.note ? `<p class="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-200">${escapeHtml(row.note)}</p>` : ''}
                <div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>${escapeHtml((row.author && row.author.display_name) || 'Hráč')} · ${escapeHtml(String(row.created_at || '').slice(0, 10))}</span>
                    <button type="button" data-report-done="${Number(row.id)}" class="flex min-h-[2.25rem] items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 disabled:opacity-50 dark:bg-emerald-900/50 dark:text-emerald-100"><i data-lucide="check" class="h-3.5 w-3.5"></i> Vyřízeno</button>
                </div>
            </li>`).join('')}</ul>` : '<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">Zatím žádná hlášení.</p>');
    };

    // Profil: jméno, emoji a barva obrázku
    // Vlastní profil se upravuje v okně Nastavení (záložka Profil)
    const openProfile = () => openSettings('', null, 'profile');

    // Nová výzva: komu (konkrétní hráč / náhodný / odkaz), téma (i víc témat), počet otázek a nastavení. Téma a nastavení jsou
    // souhrnné řádky, které se rozbalí klepnutím; tlačítko Vytvořit a hrát je stále dole na očích.
    // preset = { opponent, last }: výzva se předvyplní nastavením z poslední hry s tímto hráčem (úprava před odvetou); { who: 'random' }: rovnou náhodný soupeř
    const openNewChallenge = (preset = null) => {
        if (!signedUser()) return;
        const draft = { topics: [], count: 10, who: 'player', opponent: null, blocked: null, mixOk: true, query: '', found: null, hard: false, variant: 'choices', cats: null, open: null };
        let busy = false;
        let note = '';
        let searchToken = 0;
        let searchTimer = null;
        const ALL = TOPICS.map(topic => topic.id);
        const chosenTopics = () => draft.topics.length ? draft.topics : ALL;
        // Hodnota tématu pro databázi: mix (všechna), nebo vybraná témata v pořadí aplikace
        const topicValue = () => (draft.topics.length === 0 || draft.topics.length >= ALL.length) ? 'mix' : ALL.filter(id => draft.topics.includes(id)).join(',');
        const topicSummary = () => draft.topics.length === 0 || draft.topics.length >= ALL.length ? 'Všechna témata' : draft.topics.length <= 2 ? ALL.filter(id => draft.topics.includes(id)).map(id => TOPIC_BY_ID[id].title).join(' + ') : `${draft.topics.length} témat`;
        // Okruhy jen u jednoho vybraného tématu (třeba jen vlajky států)
        const topicCategories = () => draft.topics.length === 1 ? TOPIC_BY_ID[draft.topics[0]].categories : [];
        const selectedCats = () => draft.cats || topicCategories().map(category => category.key);
        const settingsSummary = () => [draft.hard ? 'I těžší' : 'Známé', draft.variant === 'typed' ? 'Psaní' : 'Možnosti'].join(' · ');
        const chip = (attr, value, active, content) => `<button type="button" ${attr}="${escapeHtml(String(value))}" aria-pressed="${active}" class="min-w-0 rounded-xl border-2 px-2 py-1.5 text-[13px] font-bold leading-tight active:scale-[0.98] ${active ? 'border-brand-600 bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100' : 'border-transparent bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">${content}</button>`;
        const LABEL = 'text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
        const foundRows = () => {
            if (draft.found === null) return draft.query.trim().length >= 2 ? '<p class="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Hledám…</p>' : '<p class="px-1 text-xs text-slate-500 dark:text-slate-400">Napiš aspoň 2 znaky přezdívky.</p>';
            if (!draft.found.length) return '<p class="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Žádný takový hráč. Zkus jinou přezdívku.</p>';
            return draft.found.map(player => `
                <button type="button" data-pick-opp="${escapeHtml(player.id)}" class="flex w-full items-center gap-3 rounded-xl bg-white p-2 text-left shadow-sm active:scale-[0.99] dark:bg-slate-800">
                    ${avatarHtml(player, 'h-8 w-8 text-base')}<span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${escapeHtml(playerName(player))}</span>
                </button>`).join('');
        };
        // Výzva podle témat, která soupeř nepřijímá (blocked): Mix se zúží o jeho zakázaná témata, výslovně vybrané téma zakázané nejde
        const resolveTopics = (blocked, mixOk = true) => {
            const list = blocked || [];
            const isMix = draft.topics.length === 0 || draft.topics.length >= ALL.length;
            if (isMix && !mixOk) return { value: '', hit: [], removed: [], error: true, mixOff: true };
            const hit = chosenTopics().filter(id => list.includes(id));
            if (!hit.length) return { value: topicValue(), hit: [], removed: [], error: false };
            if (isMix) {
                const rest = ALL.filter(id => !list.includes(id));
                return rest.length ? { value: rest.join(','), hit: [], removed: hit, error: false } : { value: '', hit, removed: [], error: true };
            }
            return { value: '', hit, removed: [], error: true };
        };
        const titles = (ids) => ids.map(id => TOPIC_BY_ID[id].title).join(', ');
        const blockNote = () => {
            if (!draft.opponent || !draft.blocked || (!draft.blocked.length && draft.mixOk)) return '';
            const result = resolveTopics(draft.blocked, draft.mixOk);
            const name = escapeHtml(playerName(draft.opponent));
            if (result.mixOff) return `<p class="mt-1.5 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold leading-snug text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"><i data-lucide="ban" class="mt-px h-3.5 w-3.5 shrink-0"></i><span>${name} nepřijímá Mix. Vyber konkrétní téma.</span></p>`;
            if (result.error) return `<p class="mt-1.5 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold leading-snug text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"><i data-lucide="ban" class="mt-px h-3.5 w-3.5 shrink-0"></i><span>${name} nechce hrát: ${escapeHtml(titles(result.hit))}. Vyber jiné téma.</span></p>`;
            if (result.removed.length) return `<p class="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-bold leading-snug text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"><i data-lucide="info" class="mt-px h-3.5 w-3.5 shrink-0"></i><span>Mix bez: ${escapeHtml(titles(result.removed))} (${name} je nepřijímá).</span></p>`;
            return '';
        };
        const opponentSearch = () => {
            if (draft.opponent) {
                return `<div class="mt-2"><div class="flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm ring-2 ring-brand-600 dark:bg-slate-800">${avatarHtml(draft.opponent, 'h-8 w-8 text-base')}<span class="min-w-0 flex-1 truncate text-sm font-black text-slate-800 dark:text-slate-100">${escapeHtml(playerName(draft.opponent))}</span><button type="button" data-clear-opp class="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 underline dark:text-slate-400">Změnit</button></div>${blockNote()}</div>`;
            }
            // Přátelé k rychlému výběru (friends.js) nad hledáním podle přezdívky
            const quick = Friends ? Friends.quickFriends(Friends.split(friendRows).friends, friendsHelpers()) : '';
            return `${quick}<input id="opp-search" type="text" maxlength="24" autocomplete="off" placeholder="${quick ? 'Nebo začni psát přezdívku hráče' : 'Začni psát přezdívku hráče'}" value="${escapeHtml(draft.query)}" class="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"><div id="opp-results" class="mt-2 flex flex-col gap-1.5">${foundRows()}</div>`;
        };
        // Tři jasně odlišené možnosti: konkrétní hráč (výchozí), náhodný hráč, odkaz pro kohokoli
        const whoCard = (id, icon, title, text) => {
            const active = draft.who === id;
            return `
                <div>
                    <button type="button" data-ch-who="${id}" role="radio" aria-checked="${active}" class="flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left active:scale-[0.99] ${active ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-transparent bg-white dark:bg-slate-800'}">
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}"><i data-lucide="${icon}" class="h-[1.125rem] w-[1.125rem]"></i></span>
                        <span class="min-w-0 flex-1"><span class="block text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">${title}</span><span class="block truncate text-[11px] text-slate-500 dark:text-slate-400">${text}</span></span>
                        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'}">${active ? '<i data-lucide="check" class="h-3 w-3"></i>' : ''}</span>
                    </button>
                    ${active && id === 'player' ? opponentSearch() : ''}
                </div>`;
        };
        // Souhrnný řádek, který se klepnutím rozbalí
        const accordion = (id, icon, label, summary, body) => {
            const open = draft.open === id;
            return `
                <div class="rounded-2xl bg-white shadow-sm dark:bg-slate-800/70">
                    <button type="button" data-ch-open="${id}" aria-expanded="${open}" class="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                        <i data-lucide="${icon}" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i>
                        <span class="min-w-0 flex-1"><span class="block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${label}</span><span class="block truncate text-[14px] font-bold text-slate-800 dark:text-slate-100">${escapeHtml(summary)}</span></span>
                        <i data-lucide="${open ? 'chevron-down' : 'chevron-right'}" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i>
                    </button>
                    ${open ? `<div class="border-t border-slate-100 px-3 pb-3 pt-3 dark:border-slate-700">${body}</div>` : ''}
                </div>`;
        };
        const topicBody = () => {
            const cats = topicCategories();
            const chosen = selectedCats();
            const all = draft.topics.length === 0 || draft.topics.length >= ALL.length;
            return `
                <div class="grid grid-cols-3 gap-1.5">
                    <span class="col-span-3">${chip('data-ch-topic', 'all', all, '<span class="flex items-center justify-center gap-1.5"><i data-lucide="shuffle" class="h-3.5 w-3.5"></i> Všechna témata</span>')}</span>
                    ${TOPICS.map(topic => chip('data-ch-topic', topic.id, !all && draft.topics.includes(topic.id), `<span class="flex flex-col items-center gap-0.5"><i data-lucide="${topic.icon}" class="h-4 w-4"></i><span class="block text-[11px]">${escapeHtml(topic.title)}</span></span>`)).join('')}
                </div>
                <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Klepnutím vybereš víc témat najednou.</p>
                ${cats.length > 1 ? `<p class="${LABEL} mb-1.5 mt-3">Okruh</p><div class="flex flex-wrap gap-1.5">${cats.map(category => chip('data-ch-cat', category.key, chosen.includes(category.key), `<span class="flex items-center gap-1.5"><i data-lucide="${chosen.includes(category.key) ? 'check' : 'plus'}" class="h-3.5 w-3.5"></i>${escapeHtml(category.label)}</span>`)).join('')}</div>` : ''}`;
        };
        const settingsBody = () => `
            <p class="${LABEL} mb-1.5">Obtížnost</p>
            <div class="mb-3 grid grid-cols-2 gap-1.5">${chip('data-ch-hard', 'no', !draft.hard, 'Známé<span class="block text-[11px] font-semibold opacity-70">slavné a běžné věci</span>')}${chip('data-ch-hard', 'yes', draft.hard, 'I těžší<span class="block text-[11px] font-semibold opacity-70">i méně známé věci</span>')}</div>
            <p class="${LABEL} mb-1.5">Odpovídání (pro všechny stejně)</p>
            <div class="grid grid-cols-2 gap-1.5">${chip('data-ch-variant', 'choices', draft.variant === 'choices', 'Možnosti<span class="block text-[11px] font-semibold opacity-70">vybíráš ze 4</span>')}${chip('data-ch-variant', 'typed', draft.variant === 'typed', 'Psaní<span class="block text-[11px] font-semibold opacity-70">dvojnásobek bodů</span>')}</div>`;
        const render = () => showDialog('Nová výzva', `
            <div class="flex flex-col gap-2.5">
                <div role="radiogroup" aria-label="Koho vyzvat" class="flex flex-col gap-1.5">
                    <p class="${LABEL}">Koho vyzvat</p>
                    ${whoCard('player', 'user-round', 'Konkrétního hráče', 'Najdeš ho podle přezdívky')}
                    ${whoCard('random', 'shuffle', 'Náhodného hráče', 'Soupeře vybereme za tebe')}
                    ${whoCard('anyone', 'share-2', 'Kamaráda přes odkaz', 'Pošleš odkaz nebo kód komukoli')}
                </div>
                ${accordion('topics', challengeTopicIcon(topicValue()), 'Téma', topicSummary(), topicBody())}
                <div class="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm dark:bg-slate-800/70">
                    <i data-lucide="hash" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i>
                    <span class="min-w-0 flex-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Počet otázek</span>
                    <div class="grid grid-cols-3 gap-1">${Social.COUNTS.map(count => chip('data-ch-count', count, draft.count === count, `<span class="px-1.5 font-black">${count}</span>`)).join('')}</div>
                </div>
                ${accordion('settings', 'pencil', 'Nastavení', settingsSummary(), settingsBody())}
                <div class="sticky -bottom-5 -mx-5 mt-1 bg-slate-50/95 px-5 pb-5 pt-3 backdrop-blur dark:bg-slate-900/95">
                    <button type="button" data-ch-create ${busy ? 'disabled' : ''} class="${PRIMARY_BUTTON}">${uiArt('vyzva', 'h-7 w-7')} ${busy ? 'Zakládám…' : 'Vytvořit a hrát'}</button>
                    ${note ? DIALOG_NOTE(note) : ''}
                </div>
            </div>`, {
            onClick: async (event) => {
                const open = event.target.closest('[data-ch-open]');
                const topic = event.target.closest('[data-ch-topic]');
                const count = event.target.closest('[data-ch-count]');
                const who = event.target.closest('[data-ch-who]');
                const pick = event.target.closest('[data-pick-opp]');
                const category = event.target.closest('[data-ch-cat]');
                const hard = event.target.closest('[data-ch-hard]');
                const variant = event.target.closest('[data-ch-variant]');
                if (open) { draft.open = draft.open === open.dataset.chOpen ? null : open.dataset.chOpen; render(); }
                if (topic) {
                    const id = topic.dataset.chTopic;
                    if (id === 'all') draft.topics = [];
                    else if (draft.topics.length === 0 || draft.topics.length >= ALL.length) draft.topics = [id];
                    else draft.topics = draft.topics.includes(id) ? draft.topics.filter(other => other !== id) : [...draft.topics, id];
                    draft.cats = null;
                    render();
                }
                if (category) {
                    const chosen = selectedCats();
                    const key = category.dataset.chCat;
                    // Aspoň jeden okruh musí zůstat
                    draft.cats = chosen.includes(key) ? (chosen.length > 1 ? chosen.filter(other => other !== key) : chosen) : [...chosen, key];
                    render();
                }
                if (hard) { draft.hard = hard.dataset.chHard === 'yes'; render(); }
                if (variant) { draft.variant = variant.dataset.chVariant; render(); }
                if (count) { draft.count = Number(count.dataset.chCount); render(); }
                if (who) { draft.who = who.dataset.chWho; note = ''; render(); }
                if (pick) {
                    // Z výsledků hledání, nebo z rychlého výběru přátel
                    draft.opponent = (draft.found || []).find(player => player.id === pick.dataset.pickOpp) || friendById(pick.dataset.pickOpp) || null;
                    draft.blocked = null;
                    draft.mixOk = true;
                    note = '';
                    render();
                    // Zakázaná témata a Mix vybraného hráče se dotáhnou hned, ať se upozornění ukáže před založením výzvy
                    if (draft.opponent) { const id = draft.opponent.id; Social.getAccepts(id).then(accepts => { if (draft.opponent && draft.opponent.id === id) { draft.blocked = accepts.blocked; draft.mixOk = accepts.mix; render(); } }); }
                }
                if (event.target.closest('[data-clear-opp]')) { draft.opponent = null; draft.blocked = null; draft.mixOk = true; render(); }
                if (event.target.closest('[data-ch-create]') && !busy) {
                    if (draft.who === 'player' && !draft.opponent) { note = 'Vyber hráče, kterého chceš vyzvat.'; render(); return; }
                    busy = true;
                    note = '';
                    render();
                    try {
                        let opponent = draft.who === 'player' ? draft.opponent : null;
                        let blocked = draft.blocked;
                        let mixOk = draft.mixOk;
                        if (opponent && !blocked) { const accepts = await Social.getAccepts(opponent.id); blocked = accepts.blocked; mixOk = accepts.mix; }
                        if (draft.who === 'random') {
                            // Náhodný soupeř přeskočí hráče, kteří nepřijímají vybraná témata (u Mixu se zúží výzva)
                            const explicit = draft.topics.length && draft.topics.length < ALL.length ? draft.topics : [];
                            opponent = await Social.randomOpponent(explicit, !explicit.length);
                            if (!opponent) { busy = false; note = explicit.length ? 'Nikdo, kdo přijímá tato témata, teď není k dispozici. Zkus jiné téma nebo „Kamaráda přes odkaz“.' : 'Zatím tu nejsou žádní jiní hráči. Zkus „Kamaráda přes odkaz“.'; render(); return; }
                            blocked = Array.isArray(opponent.blocked_topics) ? opponent.blocked_topics : [];
                            mixOk = opponent.accepts_mix !== false;
                        }
                        const resolved = resolveTopics(blocked, mixOk);
                        if (resolved.error) {
                            busy = false;
                            draft.blocked = blocked;
                            draft.mixOk = mixOk;
                            note = resolved.mixOff ? `${playerName(opponent)} nepřijímá Mix. Vyber konkrétní téma.` : `${playerName(opponent)} nechce hrát: ${titles(resolved.hit)}. Vyber jiné téma.`;
                            render();
                            return;
                        }
                        const all = topicCategories().length;
                        const cats = draft.topics.length !== 1 || !draft.cats || draft.cats.length >= all ? [] : draft.cats;
                        const created = await Social.createChallenge(signedUser().id, { topic: resolved.value, count: draft.count, invitedId: opponent ? opponent.id : null, includeHard: draft.hard, categories: cats, variant: draft.variant });
                        closeDialog();
                        await loadMyProfile();
                        startChallenge({ ...created, creator: myProfile, invited: opponent, fresh: true }, 0, []);
                    } catch (error) {
                        busy = false;
                        note = error && error.status === 400 && /nepřijímá/.test(String(error.message || '')) ? 'Tenhle hráč mezitím vypnul některé z vybraných témat. Zkus jiné.' : 'Výzvu se nepodařilo založit. Zkontroluj připojení a zkus to znovu.';
                        render();
                    }
                }
            },
            // Hledání hráčů při psaní: jen seznam výsledků se překreslí (pole zůstane, ať se nepřeruší psaní)
            onInput: (event) => {
                if (event.target.id !== 'opp-search') return;
                draft.query = event.target.value;
                draft.found = null;
                const results = document.getElementById('opp-results');
                if (results) results.innerHTML = foundRows();
                clearTimeout(searchTimer);
                if (draft.query.trim().length < 2) return;
                const token = ++searchToken;
                searchTimer = setTimeout(async () => {
                    try {
                        const found = await Social.searchPlayers(signedUser().id, draft.query);
                        if (token !== searchToken) return;
                        draft.found = found;
                    } catch (error) {
                        if (token !== searchToken) return;
                        draft.found = [];
                    }
                    const list = document.getElementById('opp-results');
                    if (list) list.innerHTML = foundRows();
                }, 280);
            }
        });
        if (preset && preset.who === 'random') draft.who = 'random';
        if (preset && preset.opponent) {
            const last = preset.last;
            if (last) {
                draft.topics = last.topic === 'mix' ? [] : challengeTopicIds(last.topic);
                draft.count = [5, 10, 15, 20].includes(last.count) ? last.count : draft.count;
                draft.hard = Boolean(last.include_hard);
                draft.variant = last.variant === 'typed' ? 'typed' : 'choices';
                draft.cats = Array.isArray(last.categories) && last.categories.length ? last.categories : null;
            }
            draft.who = 'player';
            draft.opponent = preset.opponent;
            const id = preset.opponent.id;
            Social.getAccepts(id).then(accepts => { if (draft.opponent && draft.opponent.id === id) { draft.blocked = accepts.blocked; draft.mixOk = accepts.mix; render(); } }).catch(() => {});
        }
        render();
    };

    // Zadání kódu výzvy od kamaráda (nebo celého odkazu)
    const openJoinChallenge = () => {
        if (!signedUser()) return;
        let note = '';
        const render = (value = '') => showDialog('Zadat kód výzvy', `
            <form class="flex flex-col gap-3" autocomplete="off">
                <input id="challenge-code" data-autofocus type="text" inputmode="text" autocapitalize="characters" maxlength="200" placeholder="Např. K7M2QX" value="${escapeHtml(value)}" class="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl font-black uppercase tracking-widest text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <button type="submit" class="${PRIMARY_BUTTON}">Otevřít výzvu</button>
                ${note ? DIALOG_NOTE(note) : ''}
            </form>`, {
            onSubmit: () => {
                const input = document.getElementById('challenge-code');
                const code = Social.parseCode(input ? input.value : '');
                if (!code) { note = 'Kód má 6 znaků, třeba K7M2QX. Můžeš vložit i celý odkaz.'; render(input ? input.value : ''); return; }
                openChallenge(code);
            }
        });
        render();
    };

    const rankingRows = (rows, count, meId) => rows.map((row, index) => `
        <li class="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800 ${row.user_id === meId ? 'ring-2 ring-brand-600' : ''}">
            <span class="w-5 text-center text-sm font-black text-slate-500 dark:text-slate-400">${index === 0 ? '🏆' : index + 1}</span>
            ${avatarHtml(row.player, 'h-9 w-9 text-lg', true)}
            <span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${escapeHtml(playerName(row.player))}${row.user_id === meId ? ' (ty)' : ''}</span>
            <span class="text-right"><span class="block text-base font-black text-slate-800 dark:text-slate-100">${row.correct}/${count}</span><span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(formatPoints(row.points))}</span></span>
        </li>`).join('');

    // Odznak jako medaile ve stylu hry: získaný zlatý nebo vínový se ikonou, nezískaný šedý
    const MEDAL_TONES = {
        bronze: 'bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 ring-amber-300',
        silver: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 ring-white',
        gold: 'bg-gradient-to-br from-gold-300 to-gold-600 text-brand-950 ring-cream',
        brand: 'bg-gradient-to-br from-brand-500 to-brand-800 text-gold-200 ring-gold-400',
        diamond: 'bg-gradient-to-br from-sky-300 to-indigo-500 text-white ring-cyan-100'
    };
    // Nezískaný odznak ukazuje svou ikonu zašedlou a ztlumenou, přes ni malý zámek v rohu
    const medalHtml = (badge, earned, size = 'h-11 w-11', iconSize = 'h-5 w-5') => {
        const dim = earned ? '' : ' opacity-50 grayscale';
        const art = badge.topic && topicArt({ id: badge.topic })
            ? `<img src="icons/topics/${badge.topic}.webp" alt="" class="h-[72%] w-[72%] object-contain${dim}">`
            : `<i data-lucide="${badge.icon}" class="${iconSize}${dim}"></i>`;
        const lock = earned ? '' : '<span class="absolute -bottom-0.5 -right-0.5 flex h-[46%] w-[46%] items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" data-medal-lock><i data-lucide="lock" class="h-[62%] w-[62%]"></i></span>';
        return `<span class="relative flex ${size} shrink-0 items-center justify-center rounded-full ring-2 ${earned
            ? (MEDAL_TONES[badge.tone] || MEDAL_TONES.gold)
            : 'bg-slate-200 text-slate-500 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-600'} shadow-sm">${art}${lock}</span>`;
    };
    // Co hráč za odznak dostane: „Odměna: Kompas (doplněk Mudrlanta)“, bez odměny „Odměna: sláva“
    const badgeReward = (badge) => Look ? Look.badgeRewardText(badge.id) : 'Odměna: sláva';
    // Další (nejbližší nezískaný) stupeň každé skupiny s postupem; nejbližší cíle nahoře
    const badgeGoals = (progress) => {
        const c = normalizeCounters(progress.counters);
        const x = badgeContext(progress);
        return BADGE_GROUPS.flatMap(group => {
            const next = group.badges.find(badge => !progress.badges[badge.id]);
            if (!next) return [];
            const value = Math.min(next.value(c, x), next.goal);
            return [{ badge: next, value, ratio: value / next.goal }];
        }).sort((a, b) => b.ratio - a.ratio);
    };
    const goalBar = (ratio) => `<span class="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full bg-gold-500" data-progress="${Math.round(ratio * 100)}"></span></span>`;
    // Všechny odznaky po skupinách: řada medailí (získané barevné, další šedé), klepnutím na medaili podrobnosti
    const openBadges = () => {
        let selected = null;
        const render = () => {
            const progress = loadProgress();
            const c = normalizeCounters(progress.counters);
            const x = badgeContext(progress);
            const total = BADGES.length;
            const have = BADGES.filter(badge => progress.badges[badge.id]).length;
            const detail = selected ? BADGE_BY_ID[selected] : null;
            const detailHtml = detail ? (() => {
                const earned = progress.badges[detail.id];
                const value = Math.min(detail.value(c, x), detail.goal);
                return `<div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-2 ring-brand-600 dark:bg-slate-800">${medalHtml(detail, Boolean(earned), 'h-14 w-14', 'h-6 w-6')}
                    <div class="min-w-0 flex-1"><p class="text-sm font-black text-slate-800 dark:text-slate-100">${escapeHtml(detail.title)}</p><p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(detail.text)}</p>
                    <p class="mt-0.5 text-[11px] font-bold leading-snug text-gold-800 dark:text-gold-300" data-badge-reward>${escapeHtml(badgeReward(detail))}</p>${earned && compactBadges(BADGES.filter(badge => progress.badges[badge.id]).map(badge => badge.id)).includes(detail.id) ? '<p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">Můžeš ho mít jako titul u svého jména (Nastavení → Vzhled).</p>' : ''}
                    <p class="mt-0.5 text-[11px] font-bold ${earned ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}">${earned ? 'Získáno' : `${value} / ${detail.goal}`}</p>${earned ? '' : goalBar(value / detail.goal)}</div></div>`;
            })() : '<p class="text-center text-xs text-slate-500 dark:text-slate-400">Klepni na medaili a uvidíš, jak ji získat.</p>';
            const sections = BADGE_GROUPS.map(group => {
                const earned = group.badges.filter(badge => progress.badges[badge.id]).length;
                return `<section class="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800">
                    <div class="mb-1.5 flex items-center justify-between gap-2"><h4 class="truncate text-[12px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(group.title)}</h4><span class="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">${earned}/${group.badges.length}</span></div>
                    <div class="flex flex-wrap gap-1.5">${group.badges.map(badge => `<button type="button" data-badge="${badge.id}" aria-label="${escapeHtml(badge.title)}" title="${escapeHtml(`${badge.title}: ${badge.text} ${badgeReward(badge)}`)}" class="rounded-full ${selected === badge.id ? 'ring-2 ring-brand-600 ring-offset-2 dark:ring-offset-slate-800' : ''}">${medalHtml(badge, Boolean(progress.badges[badge.id]), 'h-9 w-9', 'h-4 w-4')}</button>`).join('')}</div>
                </section>`;
            }).join('');
            showDialog('Odznaky', `
                <div class="flex flex-col gap-3">
                    <p class="text-sm font-black text-slate-800 dark:text-slate-100">${have} / ${total} <span class="font-semibold text-slate-500 dark:text-slate-400">získaných odznaků</span></p>
                    <div class="sticky top-0 z-10 -mx-1 bg-slate-50 px-1 pb-2 dark:bg-slate-900">${detailHtml}</div>
                    <div class="grid grid-cols-2 gap-1.5">${sections}</div>
                </div>`, {
                onClick: (event) => {
                    const medal = event.target.closest('[data-badge]');
                    if (medal) { selected = medal.dataset.badge; render(); }
                }
            });
            applyProgress(document.getElementById('dialog-overlay'));
        };
        render();
    };

    // XP s mezerou po tisících („12 500“); nedělitelná mezera, ať se číslo nezalomí
    const formatXp = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    // Obrázek titulu: zatím sova v pózách od spící (první tituly) po vítěze (poslední); dosažené barevně, ostatní zešedlé
    const TITLE_OWLS = ['spi', 'smutek', 'premysleni', 'vitej', 'vyzva', 'radost', 'serie', 'prohra', 'oslava', 'vitez'];
    const titleOwl = (index) => TITLE_OWLS[Math.min(TITLE_OWLS.length - 1, Math.floor(index * TITLE_OWLS.length / LEVEL_TITLES.length))];
    // Přehled úrovní: posouvací seznam titulů; u každého obrázek (nedosažené zešedlé), název, rozsah úrovní a XP potřebné na jednotlivé úrovně
    // Odměny odemykané v rozsahu úrovní řádku (drobné štítky)
    const rewardChips = (from, last, here) => {
        const items = [];
        for (let level = from; level <= last; level++) Look.rewardsAtLevel(level).forEach(({ item }) => items.push(item.title));
        return items.length ? `<p class="mt-0.5 flex flex-wrap gap-1">${items.map(title => `<span class="rounded-full px-1.5 text-[10px] font-bold ${here ? 'bg-white/20 text-white' : 'bg-gold-100 text-gold-800 dark:bg-slate-700 dark:text-gold-300'}">🎁 ${escapeHtml(title)}</span>`).join('')}</p>` : '';
    };
    const openLevels = () => {
        const xp = loadProgress().xp;
        const current = levelProgress(xp).level;
        const rows = LEVEL_TITLES.map((entry, index) => {
            const last = index + 1 < LEVEL_TITLES.length ? LEVEL_TITLES[index + 1].from - 1 : MAX_LEVEL;
            const reached = current >= entry.from;
            const here = current >= entry.from && current <= last;
            const levels = Array.from({ length: last - entry.from + 1 }, (_, i) => entry.from + i);
            return `
                <li data-title-row="${entry.from}"${here ? ' data-here' : ''} class="flex items-center gap-3 rounded-2xl p-2 shadow-sm ${here ? 'bg-brand-700 text-white ring-2 ring-gold-400' : reached ? 'bg-white dark:bg-slate-800' : 'bg-white/60 dark:bg-slate-800/50'}">
                    ${uiArt(`sova-${titleOwl(index)}`, `h-14 w-14 ${reached ? '' : 'opacity-40 grayscale'}`)}
                    <div class="min-w-0 flex-1">
                        <p class="flex items-baseline justify-between gap-2"><span class="truncate text-[15px] font-black leading-tight ${here ? '' : reached ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}">${escapeHtml(entry.title)}</span><span class="shrink-0 text-[11px] font-bold ${here ? 'text-gold-300' : 'text-slate-500 dark:text-slate-400'}">úr. ${entry.from === last ? entry.from : `${entry.from}–${last}`}</span></p>
                        <p class="mt-0.5 text-[11px] font-semibold leading-snug ${here ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}">od ${formatXp(xpForLevel(entry.from))} XP</p>
                        ${rewardChips(entry.from, last, here)}
                        ${levels.length > 1 ? `<p class="mt-0.5 text-[10px] leading-snug ${here ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}">${levels.map(level => `<span class="${level === current ? 'font-black underline' : ''}">${level}: ${formatXp(xpForLevel(level))}</span>`).join(' · ')}</p>` : ''}
                    </div>
                </li>`;
        }).join('');
        showDialog('Úrovně a tituly', `
            <div class="flex flex-col gap-2">
                <p class="text-xs leading-snug text-slate-600 dark:text-slate-300">Za správné odpovědi sbíráš body zkušeností (XP) a stoupáš o úrovně. Každých pár úrovní dostaneš nový titul a odměny: doplňky, rámečky nebo barvy.</p>
                <p class="text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400" data-my-xp>Tvoje XP: <b class="text-slate-700 dark:text-slate-200">${formatXp(xp)} XP</b> · úroveň ${current} · ${escapeHtml(titleForLevel(current))}</p>
                <ul class="flex flex-col gap-1.5">${rows}</ul>
            </div>`);
        const here = document.querySelector('#dialog-overlay [data-here]');
        if (here) here.scrollIntoView({ block: 'center' });
    };

    // Můj postup: úroveň, titul, XP do další úrovně a mistrovství jednotlivých témat (hvězdičky podle poznaných položek)
    const openProgress = () => {
        const progress = loadProgress();
        const xp = progress.xp;
        const earnedCount = BADGES.filter(badge => progress.badges[badge.id]).length;
        const goals = badgeGoals(progress).slice(0, 2);
        const level = levelProgress(xp);
        const next = nextTitle(level.level);
        const learned = loadLearned();
        const rows = TOPICS.map(topic => {
            const known = (learned[topic.id] || []).length;
            const stars = masteryStars(known);
            const goal = nextMastery(known);
            return `
                <li class="rounded-xl bg-white shadow-sm dark:bg-slate-800">
                    <button type="button" data-mastery="${topic.id}" class="flex w-full items-center gap-2 rounded-xl p-1 text-left" title="${known} poznaných${goal ? ` · další hvězda za ${goal}` : ' · plné mistrovství'}" aria-label="${escapeHtml(topic.title)}: ${stars} z ${MASTERY_STEPS.length} hvězd, klepnutím se dozvíš víc">
                        ${topicIcon(topic, 'h-8 w-8', `rounded-lg p-1.5 ${styleOf(topic).soft}`, 'h-5 w-5')}
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(topic.title)}</span>
                            <span class="flex gap-0.5" aria-hidden="true">${MASTERY_STEPS.map((_, index) => `<i data-lucide="star" class="h-3 w-3 ${index < stars ? 'fill-gold-500 text-gold-500' : 'text-slate-300 dark:text-slate-600'}"></i>`).join('')}</span>
                        </span>
                    </button>
                </li>`;
        }).join('');
        showDialog('Můj postup', `
            <div class="flex flex-col gap-3">
                <button type="button" data-open-levels class="btn-3d flex w-full items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-3 text-left text-white" aria-label="Tabulka úrovní">
                    <span class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-gold-500 text-brand-950 shadow-inner"><span class="text-[9px] font-black uppercase leading-none">úr.</span><span class="text-2xl font-black leading-none">${level.level}</span></span>
                    <span class="min-w-0 flex-1">
                        <span class="block text-xl font-black leading-tight">${escapeHtml(titleForLevel(level.level))}</span>
                        <span class="mt-1.5 block h-2 overflow-hidden rounded-full bg-white/25" aria-hidden="true"><span class="block h-full w-0 rounded-full bg-gold-400" data-progress="${Math.round(level.ratio * 100)}"></span></span>
                        <span class="mt-1 flex items-center justify-between gap-2 text-xs font-bold text-white/85"><span>${level.needed ? `${formatXp(level.into)} / ${formatXp(level.needed)} XP` : 'Nejvyšší úroveň'}</span>${level.needed ? `<span>do úr. ${level.level + 1}</span>` : ''}</span>
                        ${next ? `<span class="mt-0.5 block text-[11px] font-semibold text-gold-300">Další titul: ${escapeHtml(next.title)} (úr. ${next.from})</span>` : ''}
                    </span>
                    <i data-lucide="chevron-right" class="h-5 w-5 shrink-0 text-white/60"></i>
                </button>
                <div>
                    <h3 class="${CARD_TITLE} mb-2">Nejbližší odznaky</h3>
                    <ul class="flex flex-col gap-1.5">${goals.map(goal => `<li class="flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800">${medalHtml(goal.badge, false, 'h-10 w-10', 'h-[1.125rem] w-[1.125rem]')}<span class="min-w-0 flex-1"><span class="flex items-baseline justify-between gap-2"><span class="truncate text-[12px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(goal.badge.title)}</span><span class="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">${goal.value} / ${goal.badge.goal}</span></span><span class="block truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(goal.badge.text)}</span><span class="block text-[10px] font-bold leading-snug text-gold-800 dark:text-gold-300" data-badge-reward>${escapeHtml(badgeReward(goal.badge))}</span>${goalBar(goal.ratio)}</span></li>`).join('')}</ul>
                    <button type="button" data-open-badges class="${SECONDARY_BUTTON} mt-2 !py-2.5 text-sm"><i data-lucide="medal" class="h-4 w-4"></i> Všechny odznaky ${earnedCount} / ${BADGES.length}</button>
                </div>
                <div>
                    <h3 class="${CARD_TITLE} mb-1">Mistrovství témat</h3>
                    <p class="mb-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Klepni na téma a uvidíš, jak hvězdičky získat.</p>
                    <ul class="grid grid-cols-2 gap-1">${rows}</ul>
                </div>
            </div>`, { onClick: (event) => {
            if (event.target.closest('[data-open-badges]')) openBadges();
            if (event.target.closest('[data-open-levels]')) openLevels();
            const mastery = event.target.closest('[data-mastery]');
            if (mastery) openMastery(mastery.dataset.mastery);
        } });
        applyProgress(document.getElementById('dialog-overlay'));
    };

    // Mistrovství jednoho tématu: co to je, kolik už hráč poznal, kolik chybí do další hvězdičky a co hvězdičky přinášejí (jen to, co hra opravdu dává)
    const openMastery = (topicId) => {
        const topic = TOPIC_BY_ID[topicId];
        if (!topic) return;
        const known = (loadLearned()[topic.id] || []).length;
        const stars = masteryStars(known);
        const goal = nextMastery(known);
        const before = MASTERY_STEPS[stars - 1] || 0;
        const skill = BADGE_BY_ID[`zbehly-${topic.id}`];
        const accessory = Look ? Look.ACCESSORIES.find(item => item.badge === `zbehly-${topic.id}`) : null;
        const master = BADGE_BY_ID['mistr-oboru'];
        const star = (filled) => `<i data-lucide="star" class="h-4 w-4 ${filled ? 'fill-gold-500 text-gold-500' : 'text-slate-300 dark:text-slate-600'}"></i>`;
        const reward = (needed, html) => `<li class="flex items-start gap-2 text-[12px] leading-snug text-slate-700 dark:text-slate-200"><i data-lucide="${stars >= needed ? 'circle-check' : 'star'}" class="mt-0.5 h-4 w-4 shrink-0 ${stars >= needed ? 'text-emerald-600 dark:text-emerald-400' : 'text-gold-600 dark:text-gold-400'}"></i><span><b>${needed} ${needed < 5 ? 'hvězdičky' : 'hvězdiček'}:</b> ${html}</span></li>`;
        showDialog(`Mistrovství: ${topic.title}`, `
            <div class="flex flex-col gap-3" data-mastery-info>
                <div class="flex items-center gap-3">
                    ${topicIcon(topic, 'h-12 w-12', `rounded-xl p-2 ${styleOf(topic).soft}`, 'h-8 w-8')}
                    <div class="min-w-0 flex-1">
                        <span class="flex gap-0.5" role="img" aria-label="${stars} z ${MASTERY_STEPS.length} hvězdiček">${MASTERY_STEPS.map((_, index) => star(index < stars)).join('')}</span>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-100">Poznáno ${plural(known, 'položka', 'položky', 'položek')}</p>
                        <p class="text-[12px] font-semibold text-slate-600 dark:text-slate-300">${goal ? `Do další hvězdičky chybí ${plural(goal - known, 'položka', 'položky', 'položek')}.` : 'Máš plné mistrovství, všech 5 hvězdiček!'}</p>
                    </div>
                </div>
                ${goal ? goalBar((known - before) / (goal - before)) : ''}
                <p class="text-[12px] leading-snug text-slate-600 dark:text-slate-300">Mistrovství ukazuje, kolik různých položek tématu jsi už aspoň jednou správně poznal (každá se počítá jen jednou). Hvězdičky přibývají za ${MASTERY_STEPS.join(', ')} poznaných položek.</p>
                <ul class="flex flex-col gap-1.5" aria-label="Co hvězdičky přinášejí">
                    ${reward(3, `odznak ${skill ? `„${escapeHtml(skill.title)}“` : 'Zběhlost'}${accessory ? ` a doplněk pro Mudrlanta: ${escapeHtml(accessory.title)}` : ''}. Doplněk získáš i tak, že v tématu 12× správně odpovíš za sebou.`)}
                    ${reward(5, `odznak${master ? ` „${escapeHtml(master.title)}“` : ''}, nejvyšší mistrovství v oboru.`)}
                </ul>
                <button type="button" data-back-progress class="${SECONDARY_BUTTON} !py-2.5 text-sm"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět na Můj postup</button>
            </div>`, { onClick: (event) => { if (event.target.closest('[data-back-progress]')) openProgress(); } });
        applyProgress(document.getElementById('dialog-overlay'));
    };

    // Profil cizího hráče (klepnutí na jeho obrázek): statistiky z výzev, vzájemná bilance a odveta se stejným nastavením
    const openPlayerProfile = async (playerId) => {
        const user = signedUser();
        if (!user || !Social) { openLoginDialog(); return; }
        if (playerId === user.id) { openProfile(); return; }
        const player = knownPlayers.get(playerId);
        if (!player) return;
        let stats = null;
        let theirProgress = null;
        let theirRating = null;
        let failed = false;
        let busy = false;
        let note = '';
        // Přátelé a moderace (friends.js): tlačítko přátelství, menu ⋯ (Nahlásit, Zablokovat), poslední reakce od hráče
        let friendBusy = false;
        let menuOpen = false;
        let view = 'profile'; // 'profile' | 'block' (potvrzení) | 'report' (formulář)
        let reportReason = null;
        let reportNote = '';
        let reportBusy = false;
        let lastReaction = null;
        const isBlocked = () => Boolean(myBlocks && myBlocks.some(row => row.id === playerId));
        const socialRow = () => {
            if (!Friends || !signedUser()) return '';
            if (view === 'block') return Friends.blockConfirm(playerName(player), friendBusy);
            const relation = Friends.relation(friendRows, playerId);
            // Bez tabulky přátel v databázi (friendRows === null) se tlačítko neukáže; menu ⋯ zůstává
            const button = friendRows === null ? '' : Friends.friendButton(relation, { busy: friendBusy, blocked: isBlocked() });
            const friend = friendById(playerId);
            const balance = friend && friend.status === 'accepted' ? Friends.balanceText(friend) : '';
            const act = friend ? Friends.activity(friend.last_seen) : { text: '' };
            return `<div class="flex items-center gap-2">${isBlocked() ? `<div class="min-w-0 flex-1">${Friends.blockedNote(playerName(player))}</div>` : button}${Friends.moreButton(menuOpen)}</div>
                ${menuOpen ? Friends.moreMenu(isBlocked()) : ''}
                ${friend && friend.status === 'accepted' && (act.text || balance) ? `<p class="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">${[act.text ? `Přítel · ${escapeHtml(act.text)}` : 'Přítel', balance ? `bilance ${escapeHtml(balance)}` : ''].filter(Boolean).join(' · ')}</p>` : ''}
                ${lastReaction && lastReaction.emoji ? `<p class="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">Poslední reakce od ${escapeHtml(playerName(player))}: ${Friends.reactionBadge(lastReaction.emoji, playerName(player))} ${escapeHtml(Friends.REACTION_LABELS[lastReaction.emoji] || '')}</p>` : ''}`;
        };
        const friendAction = async (action) => {
            if (friendBusy || !Friends) return;
            friendBusy = true;
            note = '';
            render();
            try {
                if (action === 'add') await Social.addFriend(user.id, playerId);
                else if (action === 'accept') await Social.acceptFriend(user.id, playerId);
                else await Social.removeFriend(user.id, playerId);
                friendRows = (await Social.friendsList().catch(() => friendRows)) || friendRows;
                const now = Friends.relation(friendRows, playerId);
                if (action === 'add' || action === 'accept') note = now === 'friend' ? `${playerName(player)} je teď tvůj přítel.` : 'Žádost odeslána.';
                paintChallenges();
            } catch (error) {
                note = error && error.message ? error.message : 'Nepodařilo se. Zkus to znovu.';
            }
            friendBusy = false;
            render();
        };
        const toggleBlock = async () => {
            if (friendBusy) return;
            friendBusy = true;
            note = '';
            render();
            try {
                if (isBlocked()) {
                    await Social.unblockPlayer(user.id, playerId);
                    myBlocks = (myBlocks || []).filter(row => row.id !== playerId);
                    note = `${playerName(player)} je odblokovaný.`;
                } else {
                    await Social.blockPlayer(user.id, playerId);
                    myBlocks = [...(myBlocks || []), { id: playerId, created_at: new Date().toISOString(), player }];
                    friendRows = (friendRows || []).filter(row => row.id !== playerId);
                    note = `${playerName(player)} je zablokovaný.`;
                    paintChallenges();
                }
            } catch (error) {
                note = error && error.message ? error.message : 'Nepodařilo se. Zkus to znovu.';
            }
            friendBusy = false;
            menuOpen = false;
            view = 'profile';
            render();
        };
        const sendReport = async () => {
            if (reportBusy || !reportReason) return;
            const field = document.getElementById('report-note');
            if (field) reportNote = field.value;
            reportBusy = true;
            render();
            try {
                await Social.reportPlayer(user.id, playerId, reportReason, reportNote);
                view = 'profile';
                note = 'Díky, nahlášení jsme přijali. Správce se na to podívá.';
            } catch (error) {
                note = error && error.message ? error.message : 'Nahlášení se nepodařilo odeslat. Zkus to znovu.';
            }
            reportBusy = false;
            render();
        };
        const levelAndBadges = (value) => {
            const level = levelProgress(value.xp || 0).level;
            const owned = expandBadges((value.badges || []).filter(id => BADGE_BY_ID[id]));
            const earned = compactBadges(owned).map(id => BADGE_BY_ID[id]).slice(0, 14);
            // Titul u jména podle volby hráče: úroveň (výchozí), nic, nebo jeden ze získaných odznaků
            const pref = Social.cleanTitlePref(value.title_pref) || 'level';
            if (pref === 'none') return '';
            if (pref !== 'level' && BADGE_BY_ID[pref]) return `<p class="flex items-center justify-center gap-1.5 text-sm font-bold text-brand-700 dark:text-cream">${medalHtml(BADGE_BY_ID[pref], true, 'h-7 w-7', 'h-3.5 w-3.5')} ${escapeHtml(BADGE_BY_ID[pref].title)}</p>`;
            return `<p class="text-sm font-bold text-brand-700 dark:text-cream">Úr. ${level} · ${escapeHtml(titleForLevel(level))}</p>`
                + (earned.length ? `<div class="mt-1 flex flex-wrap justify-center gap-1.5" aria-label="Odznaky">${earned.map(badge => `<span title="${escapeHtml(`${badge.title}: ${badge.text}`)}">${medalHtml(badge, true, 'h-8 w-8', 'h-4 w-4')}</span>`).join('')}</div>` : '');
        };
        const tile = (label, value) => `<div class="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-slate-800"><p class="text-xl font-black text-slate-800 dark:text-slate-100">${value}</p><p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${label}</p></div>`;
        const chip = (value, label, tone) => `<span class="rounded-xl px-2.5 py-1.5 text-[13px] font-black ${tone}">${value} ${label}</span>`;
        const render = () => {
            let body;
            if (failed) body = '<p class="text-sm font-semibold text-rose-700 dark:text-rose-400">Profil se nepodařilo načíst. Zkontroluj připojení.</p>';
            else if (!stats) body = '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>';
            else {
                const percent = stats.answered ? `${Math.round(stats.correct / stats.answered * 100)} %` : '–';
                const versus = stats.versus && (stats.versus.wins + stats.versus.draws + stats.versus.losses)
                    ? `<div class="flex flex-col items-center gap-2"><p class="${CARD_TITLE}">Vaše bilance</p><div class="flex flex-wrap justify-center gap-1.5">${chip(stats.versus.wins, 'výher', 'bg-emerald-600 text-white')}${chip(stats.versus.draws, 'remíz', 'bg-slate-500 text-white')}${chip(stats.versus.losses, 'proher', 'bg-rose-600 text-white')}</div></div>`
                    : '<p class="text-center text-sm text-slate-500 dark:text-slate-400">Ještě jste spolu nehráli.</p>';
                const same = stats.last ? `${challengeTopicTitle(stats.last.topic)} · ${stats.last.count} otázek` : 'Mix · 10 otázek';
                body = `
                    <div class="grid grid-cols-3 gap-2">${tile('Výzvy', stats.games)}${tile('Úspěšnost', percent)}${tile('Nejlepší', stats.best ? `${stats.best.correct}/${stats.best.count}` : '–')}</div>
                    ${versus}
                    <div>
                        <button type="button" data-rematch ${busy ? 'disabled' : ''} class="${PRIMARY_BUTTON}">${uiArt('vyzva', 'h-7 w-7')} ${busy ? 'Zakládám…' : stats.last ? 'Vyzvat k odvetě' : 'Vyzvat'}</button>
                        <p class="mt-1.5 text-center text-xs text-slate-500 dark:text-slate-400">${stats.last ? 'Stejné nastavení jako naposledy' : 'První výzva'}: ${escapeHtml(same)}</p>
                        <button type="button" data-edit-challenge ${busy ? 'disabled' : ''} class="btn-3d-light mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"><i data-lucide="settings-2" class="h-4 w-4"></i> Upravit nastavení výzvy</button>
                    </div>`;
            }
            if (view === 'report' && Friends) {
                body = Friends.reportBody(Social.REPORT_REASONS, reportReason, reportNote, { busy: reportBusy }) + `<button type="button" data-report-back class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-black text-slate-600 dark:text-slate-300"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět na profil</button>`;
            }
            showDialog(view === 'report' ? 'Nahlásit hráče' : 'Profil hráče', `
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col items-center gap-2 text-center">${avatarHtml(player, 'h-20 w-20 text-5xl')}<p class="text-xl font-black text-slate-800 dark:text-slate-100">${escapeHtml(playerName(player))}</p>${theirProgress ? levelAndBadges(theirProgress) : ''}${theirRating ? `<p id="player-league">${leagueChip(theirRating.rating)}</p>` : ''}</div>
                    ${view === 'report' ? '' : socialRow()}
                    ${isBlocked() && view !== 'report' ? '' : body}
                    ${note ? DIALOG_NOTE(note, /přijali|přítel|odeslána|odblokovaný|zablokovaný/.test(note) ? 'text-emerald-700 dark:text-emerald-300' : undefined) : ''}
                </div>`, {
                onSubmit: (event) => { if (event.target.id === 'report-form') sendReport(); },
                onInput: (event) => { if (event.target.id === 'report-note') reportNote = event.target.value; },
                onClick: async (event) => {
                    const friendButton = event.target.closest('[data-friend]');
                    if (friendButton) { friendAction(friendButton.dataset.friend); return; }
                    if (event.target.closest('[data-more]')) { menuOpen = !menuOpen; render(); return; }
                    if (event.target.closest('[data-report]')) { view = 'report'; menuOpen = false; note = ''; render(); return; }
                    if (event.target.closest('[data-report-back]')) { view = 'profile'; render(); return; }
                    const reason = event.target.closest('[data-reason]');
                    if (reason) { reportReason = reason.dataset.reason; const field = document.getElementById('report-note'); if (field) reportNote = field.value; render(); return; }
                    const block = event.target.closest('[data-block]');
                    if (block) { if (block.dataset.block === 'off') toggleBlock(); else { view = 'block'; menuOpen = false; render(); } return; }
                    if (event.target.closest('[data-block-cancel]')) { view = 'profile'; render(); return; }
                    if (event.target.closest('[data-block-go]')) { toggleBlock(); return; }
                    if (event.target.closest('[data-edit-challenge]') && !busy && stats) {
                        closeDialog();
                        openNewChallenge({ opponent: player, last: stats.last });
                        return;
                    }
                    if (!event.target.closest('[data-rematch]') || busy || !stats) return;
                    busy = true;
                    note = '';
                    render();
                    try {
                        const last = stats.last;
                        const created = await Social.createChallenge(user.id, {
                            topic: last ? last.topic : 'mix', count: last ? last.count : 10, invitedId: player.id,
                            includeHard: Boolean(last && last.include_hard), categories: (last && last.categories) || [], variant: (last && last.variant) || 'choices'
                        });
                        closeDialog();
                        await loadMyProfile();
                        startChallenge({ ...created, creator: myProfile, invited: player, fresh: true }, 0, []);
                    } catch (error) {
                        busy = false;
                        note = error && error.status === 400 && /nepřijímá/.test(String(error.message || '')) ? 'Tenhle hráč mezitím vypnul některé z vybraných témat. Zkus jiné.' : 'Výzvu se nepodařilo založit. Zkontroluj připojení a zkus to znovu.';
                        render();
                    }
                }
            });
        };
        render();
        // Přátelé, moji zablokovaní a poslední reakce od hráče (databáze bez nich vrátí null, nic se neukáže)
        if (Friends) {
            const open = () => { const overlay = document.getElementById('dialog-overlay'); return Boolean(overlay && /^(Profil hráče|Nahlásit hráče)$/.test(overlay.dataset.title)); };
            if (friendRows === null) Social.friendsList().then(rows => { if (rows) { friendRows = rows; if (open()) render(); } }).catch(() => {});
            if (myBlocks === null) Social.blockedPlayers(user.id).then(rows => { if (rows) { myBlocks = rows; if (open()) render(); } }).catch(() => {});
            Social.lastReactionFrom(user.id, playerId).then(row => { if (row) { lastReaction = row; if (open()) render(); } }).catch(() => {});
        }
        // Úroveň a odznaky hráče (bez nových sloupců v databázi se prostě nezobrazí)
        if (Rating) Social.getRating(playerId).then(value => { theirRating = value; if (document.getElementById('dialog-overlay')) render(); }).catch(() => {});
        Social.getProgress(playerId).then(value => { theirProgress = value; if (stats && document.getElementById('dialog-overlay')) render(); }).catch(() => {});
        try {
            stats = await Social.playerStats(user.id, playerId);
        } catch (error) {
            failed = true;
        }
        if (document.getElementById('dialog-overlay')) render();
    };
    // Nastavení → Profil: seznam zablokovaných hráčů s odblokováním (friends.js)
    const openBlockedList = async () => {
        const user = signedUser();
        if (!user || !Social || !Friends) return;
        let busyId = null;
        let note = '';
        const render = () => showDialog('Zablokovaní hráči', `
            <div class="flex flex-col gap-3">
                <p class="text-xs leading-snug text-slate-500 dark:text-slate-400">Zablokovaný hráč tě nenajde v hledání, nevyzve tě a nevybere se ti jako náhodný soupeř. V žebříčku zůstává.</p>
                ${myBlocks === undefined ? '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>' : Friends.blockedList(myBlocks, friendsHelpers())}
                ${note ? DIALOG_NOTE(note) : ''}
            </div>`, {
            onClick: async (event) => {
                const button = event.target.closest('[data-unblock]');
                if (!button || busyId) return;
                busyId = button.dataset.unblock;
                button.disabled = true;
                try {
                    await Social.unblockPlayer(user.id, busyId);
                    myBlocks = (myBlocks || []).filter(row => row.id !== busyId);
                    note = '';
                } catch (error) {
                    note = error && error.message ? error.message : 'Odblokování se nepodařilo. Zkus to znovu.';
                }
                busyId = null;
                render();
            }
        });
        // Seznam ještě nebyl načtený: okno se ukáže hned (Načítám…) a po načtení se překreslí; jinak rovnou
        const needsLoad = myBlocks === null;
        if (needsLoad) myBlocks = undefined;
        render();
        if (needsLoad) {
            try { myBlocks = await Social.blockedPlayers(user.id); } catch (error) { myBlocks = null; note = 'Seznam se nepodařilo načíst. Zkontroluj připojení.'; }
            if (document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === 'Zablokovaní hráči') render();
        }
    };
    // Dev panel: nahlášení hráči (jen účet v dev_admins), tlačítko Vyřešeno
    const openDevReports = async () => {
        if (!signedUser() || !Social || !Friends) { showToast('Nejdřív se přihlas.'); return; }
        let rows = null;
        let note = '';
        const render = () => showDialog('Nahlášení hráči', `
            <div class="flex flex-col gap-3">
                ${rows === null ? '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>' : Friends.devReports(rows, Social.REPORT_REASONS, friendsHelpers())}
                ${note ? DIALOG_NOTE(note) : ''}
            </div>`, {
            onClick: async (event) => {
                const button = event.target.closest('[data-resolve]');
                if (!button) return;
                button.disabled = true;
                try {
                    await Social.devResolveReport(button.dataset.resolve);
                    rows = (rows || []).map(row => String(row.id) === button.dataset.resolve ? { ...row, resolved_at: new Date().toISOString() } : row);
                } catch (error) {
                    note = error && error.message ? error.message : 'Nepodařilo se. Zkus to znovu.';
                }
                render();
            }
        });
        render();
        try { rows = await Social.devReports(); } catch (error) { rows = []; note = error && error.message ? error.message : 'Nahlášení se nepodařilo načíst.'; }
        if (document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === 'Nahlášení hráči') render();
    };
    // Klepnutí na obrázek hráče kdekoli (žebříček, výzvy) otevře jeho profil; zachytí se dřív než klepnutí na řádek kolem něj
    document.addEventListener('click', (event) => {
        const target = event.target.closest && event.target.closest('[data-player-id]');
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        openPlayerProfile(target.dataset.playerId);
    }, true);
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target.closest && event.target.closest('[data-player-id]');
        if (!target) return;
        event.preventDefault();
        openPlayerProfile(target.dataset.playerId);
    });

    const challengeLink = (code) => `${window.location.origin}${window.location.pathname}?vyzva=${code}`;
    const shareChallenge = async (code, text = '') => {
        const message = `${text || 'Vyzývám tě v Mudrlantu!'}\nKód výzvy: ${code}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Výzva v Mudrlantu', text: message, url: challengeLink(code) });
                return;
            }
        } catch (error) {
            if (error && error.name === 'AbortError') return;
        }
        try {
            await navigator.clipboard.writeText(`${message}\n${challengeLink(code)}`);
            showToast('Odkaz na výzvu zkopírován');
        } catch (error) {
            showToast('Kopírování se nepodařilo');
        }
    };

    // Detail výzvy podle kódu: kdo vyzývá, o co jde, žebříček; hrát jde, dokud hráč nemá výsledek
    const openChallenge = async (rawCode) => {
        const code = Social ? Social.parseCode(rawCode) : '';
        if (!code) { showDialog('Výzva', DIALOG_NOTE('Tenhle kód výzvy není platný.')); return; }
        const user = signedUser();
        if (!user) {
            writeJson(KEYS.pendingChallenge, code);
            showDialog('Výzva', `
                <p class="mb-4 text-sm text-slate-600 dark:text-slate-300">Někdo tě vyzval. Pro hru výzvy se nejdřív přihlas, hned potom se výzva otevře.</p>
                <button type="button" data-auth-login-dialog class="${PRIMARY_BUTTON}"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>`,
            { onClick: (event) => { if (event.target.closest('[data-auth-login-dialog]')) Auth.login(); } });
            return;
        }
        showDialog('Výzva', '<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám výzvu…</p>');
        let def;
        let results;
        try {
            [def, results] = await Promise.all([Social.getChallenge(code), Social.getResults(code)]);
        } catch (error) {
            showDialog('Výzva', DIALOG_NOTE('Výzvu se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'));
            return;
        }
        if (!def) { showDialog('Výzva', DIALOG_NOTE('Výzva s tímhle kódem neexistuje.')); return; }
        const mine = results.find(row => row.user_id === user.id);
        const myChange = mine && Rating && results.length > 1 ? await Social.getRatingChange(user.id, code).catch(() => null) : null;
        const own = def.creator && def.creator.id === user.id;
        const text = `${own ? 'Vyzývám tě' : 'Hraju'} v Mudrlantu: ${challengeTopicTitle(def.topic)}, ${def.count} otázek.`;
        showDialog(own ? 'Tvoje výzva' : 'Výzva', `
            <div class="flex flex-col gap-4">
                <div class="flex items-center gap-3">
                    ${avatarHtml(def.creator, 'h-12 w-12 text-2xl', true)}
                    <div class="min-w-0"><p class="truncate text-base font-black text-slate-800 dark:text-slate-100">${escapeHtml(own ? 'Ty' : playerName(def.creator))}${own ? '' : ' tě vyzývá'}</p>
                    <p class="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><i data-lucide="${challengeTopicIcon(def.topic)}" class="h-4 w-4"></i> ${escapeHtml(challengeTopicTitle(def.topic))} · ${def.count} otázek</p></div>
                </div>
                ${(() => {
                    const ids = challengeTopicIds(def.topic);
                    const topicDef = ids.length === 1 ? TOPIC_BY_ID[ids[0]] : null;
                    const tags = [def.include_hard ? 'I těžší otázky' : 'Známé otázky', def.variant === 'typed' ? 'Psaní odpovědí' : def.variant === 'choices' ? 'Výběr z možností' : null,
                        ...(def.categories || []).length && topicDef ? [`Okruh: ${def.categories.map(key => categoryOf(topicDef, key).label).join(', ')}`] : []].filter(Boolean);
                    return `<div class="flex flex-wrap gap-1.5">${tags.map(tag => `<span class="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">${escapeHtml(tag)}</span>`).join('')}</div>`;
                })()}
                ${def.invited ? `<p class="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Vyzvaný hráč: ${avatarHtml(def.invited, 'h-6 w-6 text-sm')} <b>${escapeHtml(def.invited.id === user.id ? 'ty' : playerName(def.invited))}</b></p>` : ''}
                ${results.length ? `<ol class="flex flex-col gap-1.5">${rankingRows(results, def.count, user.id)}</ol>` : '<p class="text-sm text-slate-500 dark:text-slate-400">Zatím nikdo nehrál.</p>'}
                ${myChange ? `<p class="text-sm font-bold text-slate-600 dark:text-slate-300">Tvůj rating: <b class="${myChange.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : myChange.delta < 0 ? 'text-rose-700 dark:text-rose-400' : ''}">${Rating.formatDelta(myChange.delta)}</b> (${myChange.after})</p>` : ''}
                ${mine ? '' : `<button type="button" data-ch-play class="${PRIMARY_BUTTON}"><i data-lucide="play" class="h-5 w-5"></i> Hrát výzvu</button>`}
                <button type="button" data-ch-share class="${SECONDARY_BUTTON}"><i data-lucide="share-2" class="h-5 w-5"></i> Sdílet výzvu · ${code}</button>
            </div>`, {
            onClick: (event) => {
                if (event.target.closest('[data-ch-share]')) shareChallenge(code, text);
                if (event.target.closest('[data-ch-play]')) { closeDialog(); startChallenge(def, 0, []); }
            }
        });
    };

    // Průběh výzvy: otázky z pevného semínka, stejné pro všechny; bez běžných statistik a řad
    const startChallenge = (def, index = 0, results = []) => {
        if (isLoading) return;
        // Právě založená výzva se počítá do odznaků za založené výzvy
        if (def.fresh) {
            const progress = loadProgress();
            progress.counters.created += 1;
            const titles = grantBadges(progress);
            saveProgress(progress);
            announce(1, 1, titles);
        }
        challenge = {
            code: def.code || def.id, topic: def.topic, seed: def.seed, count: def.count, index, results, creator: def.creator || null, invited: def.invited || null, done: false,
            hard: Boolean(def.hard ?? def.include_hard), categories: def.categories || [], variant: def.variant || null, tournament: def.tournament || null
        };
        mode = 'challenge';
        closeDialog();
        runRound(async () => {
            // Stejná otázka pro všechny: položku určuje semínko výzvy a pořadí; u jednoho tématu se dřívější otázky nezopakují
            const pickFor = (ctx, rng, history) => {
                const pool = ctx.items.filter(candidate => (challenge.hard || candidate.k === 1) && (!challenge.categories.length || challenge.categories.includes(candidate.c)));
                const keys = ctx.topic.categories.map(c => c.key).filter(key => !challenge.categories.length || challenge.categories.includes(key));
                return pickItem(pool.length ? pool : ctx.items.filter(candidate => candidate.k === 1), rng, history, keys);
            };
            const ids = challengeTopicIds(challenge.topic);
            // Dřívější otázky se přehrají se stejným semínkem (i u Mixu a turnaje, kde se téma losuje), takže se žádná položka v rámci výzvy nezopakuje
            const histories = new Map();
            const historyOf = (topicId) => { if (!histories.has(topicId)) histories.set(topicId, []); return histories.get(topicId); };
            // Turnaj: otázky se nesmí zopakovat ani v dřívějších kolech (každé kolo má semínko `<turnaj>-r<kolo>`)
            const earlierSeeds = [];
            const tour = challenge.tournament;
            if (tour && tour.seedBase && tour.round > 1) {
                for (let round = 1; round < tour.round; round++) for (let before = 0; before < challenge.count; before++) earlierSeeds.push(`${tour.seedBase}-r${round}:${before}`);
            }
            for (let before = 0; before < index; before++) earlierSeeds.push(`${challenge.seed}:${before}`);
            for (const earlierSeed of earlierSeeds) {
                const earlierRng = createSeededRandom(earlierSeed);
                const earlierTopic = ids.length > 1 ? pickRandom(ids, earlierRng) : ids[0];
                const earlierCtx = await loadTopic(earlierTopic);
                const earlier = pickFor(earlierCtx, earlierRng, historyOf(earlierTopic));
                if (earlier) historyOf(earlierTopic).push(earlier.q);
            }
            const rng = createSeededRandom(`${challenge.seed}:${index}`);
            const topicId = ids.length > 1 ? pickRandom(ids, rng) : ids[0];
            const ctx = await loadTopic(topicId);
            const item = pickFor(ctx, rng, historyOf(topicId));
            return { item, ctx, rng };
        }, challengeTopicIds(challenge.topic).length === 1 ? TOPIC_BY_ID[challengeTopicIds(challenge.topic)[0]] : MIX);
    };

    const challengeHome = () => {
        challenge = null;
        mode = 'daily';
        myChallenges = null;
        renderHome();
    };

    // Změna ratingu po výzvě pod výsledkem (+12 · Stříbro 1012); první hráč se dozví, že se rating spočítá po soupeři
    const ratingNote = (c, results) => {
        if (!Rating || !myRating || !results) return '';
        const change = c.ratingChange;
        if (!change) return results.length > 1 ? '' : '<p class="mt-2 text-xs font-semibold text-white/80">Rating se spočítá, až výzvu dohraje soupeř.</p>';
        const league = Rating.leagueFor(change.after || myRating.rating);
        return `<p id="rating-change" class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-sm font-black text-white"><span class="${change.delta > 0 ? 'text-emerald-300' : change.delta < 0 ? 'text-rose-300' : 'text-white/80'}">${Rating.formatDelta(change.delta)}</span> rating <i data-lucide="${league.icon}" class="h-4 w-4"></i> ${escapeHtml(league.name)} ${change.after || myRating.rating}</p>${change.capped ? '<p class="mt-1 text-[11px] font-semibold text-white/70">S tímhle hráčem už tento týden rating nestoupá (max. 3 výzvy).</p>' : ''}`;
    };
    const renderChallengeDone = (results = null, state = 'ok') => {
        const c = challenge;
        if (!c) return;
        screen = 'challenge-done';
        closePlaceInfo();
        const user = signedUser();
        const correct = c.results.filter(row => row && row.correct).length;
        const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
        // Sova podle výsledku: vítěz s pohárem, poražený s „dobrá hra“, remíza s radostí, sám s oslavou
        const rivals = user && results ? results.filter(row => row.user_id !== user.id) : [];
        const bestRival = rivals.reduce((top, row) => !top || row.correct > top.correct || (row.correct === top.correct && row.points > top.points) ? row : top, null);
        // Výsledek slovy a hláška (stejná pro tutéž výzvu); bez soupeře se čeká, až dohraje
        const outcome = Rating && state === 'ok' ? Rating.outcomeOf({ correct, points }, bestRival) : null;
        const outcomeOwl = !outcome || outcome === 'cekani' ? 'oslava' : outcome === 'vyhra' ? 'vitez' : outcome === 'remiza' ? 'radost' : 'prohra';
        const verdictTone = { vyhra: 'text-gold-300', prohra: 'text-white', remiza: 'text-white', cekani: 'text-white' };
        const verdictHtml = outcome ? `
                    <p data-challenge-outcome="${outcome}" class="mt-1 text-xl font-black leading-tight ${verdictTone[outcome]}">${escapeHtml(Rating.HEADLINES[outcome])}</p>
                    <p data-challenge-quip class="mx-auto mt-0.5 max-w-[17rem] text-[13px] font-semibold italic leading-snug text-white/85">${escapeHtml(Rating.quipFor(outcome, c.code))}</p>` : '';
        const body = state === 'sending'
            ? '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Ukládám výsledek…</p>'
            : state === 'error'
                ? `<div class="flex flex-col gap-2"><p class="text-sm font-semibold text-rose-700 dark:text-rose-400">Výsledek se nepodařilo uložit. Zkontroluj připojení.</p><button type="button" data-action="challenge-retry" class="${PRIMARY_BUTTON}">Zkusit znovu</button></div>`
                : `<ol class="flex flex-col gap-1.5">${results && results.length ? rankingRows(results, c.count, user && user.id) : ''}</ol>
                    ${Friends && bestRival && bestRival.user_id ? Friends.reactionBar(bestRival.user_id, c.reaction || null, { busy: Boolean(c.reacting), name: playerName(bestRival.player) }) : ''}
                    <p class="text-sm text-slate-500 dark:text-slate-400">${results && results.length > 1 ? 'Porovnání s ostatními hráči.' : 'Pošli kód kamarádům, ať ti to oplatí.'}</p>`;
        if (state === 'ok') c.lastResults = results;
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-4 pb-6 dark:bg-slate-900">
                <div class="rounded-[1.5rem] bg-gradient-to-br from-brand-600 to-brand-900 p-5 text-center text-white shadow-lg">
                    ${uiArt(`sova-${outcomeOwl}`, 'mx-auto -mt-1 mb-1 h-24 w-24')}${verdictHtml}
                    <p class="mt-2 text-xs font-black uppercase tracking-widest text-white/80">${escapeHtml(challengeTopicTitle(c.topic))}</p>
                    <p class="mt-0.5 text-4xl font-black">${correct}/${c.count}</p>
                    <p class="mt-1 text-sm font-bold text-white/90">${escapeHtml(formatPoints(points))}</p>
                    ${ratingNote(c, results)}
                </div>
                ${body}
                ${c.invited ? `<p class="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Vyzvaný hráč: ${avatarHtml(c.invited, 'h-6 w-6 text-sm')} <b>${escapeHtml(playerName(c.invited))}</b> uvidí výzvu na úvodní stránce</p>` : ''}
                <button type="button" data-action="challenge-share" data-code="${escapeHtml(c.code)}" data-text="Zahrál jsem výzvu v Mudrlantu: ${correct}/${c.count}. Zvládneš to líp?" class="${SECONDARY_BUTTON}"><i data-lucide="share-2" class="h-5 w-5"></i> Sdílet výzvu · ${escapeHtml(c.code)}</button>
                <button type="button" data-action="challenge-home" class="${PRIMARY_BUTTON}">Zpět domů</button>
            </div>`;
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
    };

    // Po poslední otázce: zapíše výsledek (první platí) a ukáže žebříček výzvy
    // Dohraná výzva se zapamatuje (kód) a uložená relace se označí jako hotová, ať ji úvod po dalším spuštění nenabízí k pokračování
    const FINISHED_KEY = 'mudrlant.finishedChallenges';
    const finishedChallenges = () => { const list = readJson(FINISHED_KEY); return Array.isArray(list) ? list.filter(code => typeof code === 'string') : []; };
    const markChallengeFinished = (code) => {
        if (!code) return;
        writeJson(FINISHED_KEY, [...new Set([...finishedChallenges(), code])].slice(-60));
        const session = readJson(KEYS.session);
        if (session && session.challenge && session.challenge.code === code) { session.challenge.done = true; writeJson(KEYS.session, session); }
    };
    const finishChallenge = async (retry = false) => {
        if (challenge && challenge.tournament) return finishTournamentMatch();
        const c = challenge;
        const user = signedUser();
        // Dvojité klepnutí nebo rychlé „Zkusit znovu“: odeslání už běží, druhé se nespouští
        if (!c || !user || c.sending) return;
        c.sending = true;
        c.done = true;
        markChallengeFinished(c.code);
        renderChallengeDone(null, 'sending');
        const correct = c.results.filter(row => row && row.correct).length;
        const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
        try {
            await Social.submitResult(user.id, c.code, { correct, points });
            const results = await Social.getResults(c.code);
            // Rating po výzvě počítá databáze; změnu (a nový rating do karty ligy) načteme, ať ji hráč vidí hned
            if (Rating && results.length > 1 && !c.ratingChange) {
                c.ratingChange = await Social.getRatingChange(user.id, c.code).catch(() => null);
                if (c.ratingChange) myRating = await Social.getRating(user.id).catch(() => myRating);
            }
            if (!c.counted) {
                c.counted = true;
                const rivals = results.filter(row => row.user_id !== user.id);
                const won = rivals.length > 0 && rivals.every(row => correct > row.correct || (correct === row.correct && points > row.points));
                const progress = loadProgress();
                const counters = progress.counters;
                counters.challenges += 1;
                if (won) { counters.wins += 1; counters.winRun += 1; counters.bestWinRun = Math.max(counters.bestWinRun, counters.winRun); }
                else if (rivals.length) counters.winRun = 0;
                if (correct === c.count) counters.perfectChallenges += 1;
                const titles = grantBadges(progress);
                saveProgress(progress);
                announce(1, 1, titles);
                settleGoals();
                syncProgress();
            }
            if (challenge === c) renderChallengeDone(results);
        } catch (error) {
            if (challenge === c) renderChallengeDone(null, 'error');
        } finally {
            c.sending = false;
        }
    };

    // --- Týdenní turnaje ---
    // Pravidla a posun kol dělá databáze (supabase/schema.sql) a čistá logika je v tournament.js; tady se zobrazí karta na záložce Více hráčů,
    // okno s koly a zápasy a hra zápasu (otázky z pevného semínka stejně jako ve výzvě, ale bez zápisu do tabulky výzev).
    const Tournament = window.MudrlantTournament;
    const TOUR_XP_KEY = 'mudrlant.tourXp';
    const TOUR_DIALOG = 'Týdenní turnaj';
    let tournamentView = null; // null = turnaje nejsou (databáze je nemá nebo se ještě nenačetly); jinak [{ tournament, entries, matches, state }]
    let tournamentRefreshing = false;
    let tournamentAgain = null;
    let tournamentTickAt = 0;
    let tournamentStatsAt = 0;
    let tournamentBusy = '';
    let tournamentStarting = false;
    let tournamentDialogId = '';
    let tournamentQuery = '';
    let tournamentMode = 'bracket'; // pohled v okně turnaje: 'bracket' (pavouk) nebo 'rounds' (seznam kol)
    let bracketFull = null; // null = podle toho, kde jsem (vypadl jsem před osmifinále → celý pavouk); jinak volba hráče
    let bracketFocus = ''; // hráč, jehož cesta pavoukem je zvýrazněná (klepnutí na hráče)
    let bracketReset = true; // po otevření a změně pohledu se pavouk posune na moje kolo, při dalším překreslení zůstane, kde je
    const resetTournaments = () => { tournamentOffer = null; tournamentView = null; tournamentTickAt = 0; tournamentStatsAt = 0; tournamentBusy = ''; tournamentAgain = null; };
    const plainText = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // Za vyhraný zápas XP; vyplacené zápasy se pamatují v zařízení (jednou za zápas) a počítadla pro odznaky se doplní z účtu (maximum s lokální hodnotou)
    const applyTournamentProgress = async ({ wonIds = [], wonRounds = {}, stats = false } = {}) => {
        const claimed = readJson(TOUR_XP_KEY);
        const known = Array.isArray(claimed) ? claimed.filter(id => typeof id === 'string') : [];
        const fresh = [...new Set(wonIds)].filter(id => !known.includes(id));
        if (fresh.length) writeJson(TOUR_XP_KEY, [...known, ...fresh].slice(-300));
        let remote = null;
        if (stats || fresh.length) {
            tournamentStatsAt = Date.now();
            try { remote = await Social.myTournamentStats(); } catch (error) { remote = null; }
        }
        if (!fresh.length && !remote) return;
        const progress = loadProgress();
        const levelBefore = levelProgress(progress.xp).level;
        progress.xp += fresh.reduce((sum, id) => sum + Tournament.winXp(wonRounds[id]), 0);
        if (remote) {
            progress.counters.tourBest = Math.max(progress.counters.tourBest || 0, remote.best);
            progress.counters.tourWins = Math.max(progress.counters.tourWins || 0, remote.wins);
        }
        const titles = grantBadges(progress);
        saveProgress(progress);
        announce(levelBefore, levelProgress(progress.xp).level, titles);
        applyLook();
        updateControlsUI();
        syncProgress();
    };

    // Oslavy a odznaky z turnajů počkají, až se zavře okno se zprávami (jinak by zakryly jeho spodek)
    const afterNotices = (run, waited = 0) => {
        if (document.getElementById('tournament-notices') && waited < 60000) { setTimeout(() => afterNotices(run, waited + 500), 500); return; }
        run();
    };
    // Zprávy o turnajích (nepřečtené): jedno okno, hned se označí jako přečtené; za 1.–3. místo oslava
    const showTournamentNotices = async (user) => {
        const notices = await Social.tournamentNotices(user.id);
        if (!notices || !notices.length || document.getElementById('dialog-overlay') || screen !== 'home') return;
        const items = notices.map(notice => ({ notice, info: Tournament.noticeText(notice) })).filter(item => item.info);
        Social.tournamentNoticesSeen(notices.map(notice => notice.id)).catch(() => {});
        if (!items.length) return;
        showDialog('Turnaj', `
            <div id="tournament-notices" class="flex flex-col gap-3">
                ${items.map(({ info }) => `<div data-notice class="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70"><p class="flex items-center gap-2 text-[15px] font-black text-slate-800 dark:text-slate-100"><i data-lucide="trophy" class="h-4 w-4 text-gold-600 dark:text-gold-300"></i>${escapeHtml(info.title)}</p><p class="mt-1 text-sm leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(info.text)}</p></div>`).join('')}
                <button type="button" data-close class="${PRIMARY_BUTTON}">Rozumím</button>
            </div>`);
        const medals = items.filter(({ notice, info }) => notice.kind === 'result' && info.place >= 1 && info.place <= 3).map(({ info }) => info.place);
        if (items.some(({ notice }) => notice.kind === 'result')) afterNotices(() => {
            medals.forEach(place => showCelebration(place === 1 ? 'vitez' : 'oslava', place === 1 ? 'Vítěz turnaje' : `${place}. místo v turnaji`, 'Gratulujeme!'));
            applyTournamentProgress({ stats: true });
        });
    };

    // --- Pozvánka do turnaje: malé okno při přepnutí na Více hráčů při každém druhém spuštění aplikace; žárovka u sovy i v singlu nejvýš 2× denně ---
    const PROMO_KEY = 'mudrlant.tourPromo';
    const readPromo = () => {
        const saved = readJson(PROMO_KEY);
        const value = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        const today = getDayKey();
        return { launches: Number.isFinite(value.launches) ? Math.max(0, Math.floor(value.launches)) : 0, day: today, bulbs: value.day === today && Number.isFinite(value.bulbs) ? Math.max(0, Math.floor(value.bulbs)) : 0 };
    };
    const promoLaunches = (() => { const promo = readPromo(); promo.launches += 1; writeJson(PROMO_KEY, promo); return promo.launches; })();
    let tournamentOffer = null; // otevřený turnaj, do kterého ještě nejsem přihlášený ({ tournament })
    let tournamentOfferAt = 0;
    let promoPopupShown = false;
    let promoBulbSession = false;
    let promoBulbDone = false;
    // Žárovka s pozvánkou: nejvýš ve dvou spuštěních za den (počítá se při prvním ukázání v dané relaci), po klepnutí zmizí
    const tournamentBulbDue = () => {
        if (!tournamentOffer || promoBulbDone) return false;
        if (promoBulbSession) return true;
        const promo = readPromo();
        if (promo.bulbs >= 2) return false;
        promoBulbSession = true;
        writeJson(PROMO_KEY, { ...promo, bulbs: promo.bulbs + 1 });
        return true;
    };
    const closeTournamentOffer = () => { if (document.getElementById('tournament-offer')) closeDialog(); };
    const openTournamentOffer = (source) => {
        if (!tournamentOffer || document.getElementById('dialog-overlay')) return;
        const { tournament } = tournamentOffer;
        if (source === 'bulb') { promoBulbDone = true; updateFactHint(); }
        const when = `${Tournament.weekdayName(tournament.week_start)} ${Tournament.formatDay(tournament.week_start)}`;
        showDialog(TOUR_DIALOG, `
            <div id="tournament-offer" class="flex flex-col gap-3">
                <div class="flex items-center gap-3"><span class="${TOUR_BUBBLE}"><i data-lucide="trophy" class="h-5 w-5"></i></span>
                    <p class="text-sm font-semibold leading-snug text-slate-700 dark:text-slate-200">Přihlášky do týdenního turnaje jsou otevřené. Začíná <b>${escapeHtml(when)}</b>, každý den jedno kolo (10 otázek), vítěz postupuje dál až do finále.</p></div>
                <button type="button" data-offer-join="${escapeHtml(tournament.id)}" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-emerald-600 px-4 py-3 text-base font-black text-white active:scale-[0.98]"><i data-lucide="trophy" class="h-5 w-5"></i> Přihlásit se</button>
                <div class="flex items-center justify-between gap-2"><button type="button" data-offer-rules class="${TOUR_LINK}">Jak turnaje fungují</button><button type="button" data-close class="rounded-xl px-3 py-2 text-[13px] font-bold text-slate-500 underline underline-offset-2 dark:text-slate-400">Teď ne</button></div>
            </div>`, {
            onClick: (event) => {
                const join = event.target.closest('[data-offer-join]');
                if (join) { closeDialog(); changeTournamentEntry(join.dataset.offerJoin, true); return; }
                if (event.target.closest('[data-offer-rules]')) { closeDialog(); openTournamentHelp(); }
            }
        });
        // Zeleně svítící a pulzující okno, ať si pozvánky hned všimnou všichni (src/input.css .offer-panel)
        const panel = document.querySelector('#dialog-overlay > div');
        if (panel) panel.classList.add('offer-panel');
        if (screen === 'home') renderIcons(document.getElementById('dialog-overlay'));
    };
    // Zjistí, jestli je otevřený turnaj, do kterého nejsem přihlášený; z toho žárovka a pozvánka
    const updateTournamentOffer = async (user, list) => {
        const today = Tournament.pragueToday();
        const open = (list || []).find(item => item.status === 'open' && Tournament.diffDays(item.week_start, today) > 0);
        if (!open) { tournamentOffer = null; updateFactHint(); return; }
        if (!tournamentOffer || tournamentOffer.tournament.id !== open.id || Date.now() - tournamentOfferAt > 60000) {
            let joined = null;
            try { joined = await Social.inTournament(open.id, user.id); } catch (error) { joined = null; }
            if (!signedUser() || signedUser().id !== user.id) return;
            tournamentOfferAt = Date.now();
            tournamentOffer = joined === false ? { tournament: open } : null;
        }
        updateFactHint();
        // Při každém druhém spuštění vyskočí malé okno, jakmile hráč přepne na Více hráčů (jednou za spuštění)
        if (tournamentOffer && homeTab() === 'multi' && screen === 'home' && !promoPopupShown && promoLaunches % 2 === 0 && !document.getElementById('dialog-overlay')) {
            promoPopupShown = true;
            openTournamentOffer('popup');
        }
    };

    // Načte turnaje: nejdřív je posune (tick), pak seznam, zprávy a (na záložce Více hráčů nebo s force) přihlášky a zápasy. Chyba spojení nic nepřepíše.
    const refreshTournaments = async ({ force = false } = {}) => {
        const user = signedUser();
        if (!user || !Social || !Tournament) return;
        if (tournamentRefreshing) { tournamentAgain = { force: force || Boolean(tournamentAgain && tournamentAgain.force) }; return; }
        tournamentRefreshing = true;
        try {
            if (force || Date.now() - tournamentTickAt > 30000) {
                const ticked = await Social.tournamentTick();
                tournamentTickAt = Date.now();
                if (ticked === null) { tournamentView = null; paintChallenges(); return; }
            }
            const list = await Social.getTournaments();
            if (!signedUser() || signedUser().id !== user.id) return;
            if (list === null) { tournamentView = null; paintChallenges(); return; }
            await showTournamentNotices(user).catch(() => {});
            await updateTournamentOffer(user, list).catch(() => {});
            if (!force && homeTab() !== 'multi') return;
            const today = Tournament.pragueToday();
            const running = list.filter(item => item.status === 'running');
            const shown = [...running, ...list.filter(item => item.status === 'open'), ...(running.length ? [] : list.filter(item => item.status === 'finished' && Tournament.diffDays(today, item.week_start) <= 13).slice(0, 1))];
            const views = await Promise.all(shown.map(async (tournament) => {
                const [entries, matches] = await Promise.all([Social.getTournamentEntries(tournament.id), tournament.status === 'open' ? [] : Social.getTournamentMatches(tournament.id)]);
                return { tournament, entries, matches, state: tournamentStateOf({ tournament, entries, matches }, user.id, today) };
            }));
            if (!signedUser() || signedUser().id !== user.id) return;
            tournamentView = views.filter(view => view.tournament.status !== 'finished' || view.state.playing);
            const wonRounds = Object.assign({}, ...views.map(view => Tournament.xpRounds(view.matches, user.id)));
            const wonIds = Object.keys(wonRounds);
            afterNotices(() => applyTournamentProgress({ wonIds, wonRounds, stats: force || Date.now() - tournamentStatsAt > 600000 }));
            paintChallenges();
            if (tournamentDialogId && document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === TOUR_DIALOG) renderTournamentDialog();
        } catch (error) {
            /* bez spojení zůstane, co už se ukázalo */
        } finally {
            tournamentRefreshing = false;
            const again = tournamentAgain;
            tournamentAgain = null;
            if (again) refreshTournaments(again);
        }
    };
    const findTournament = (tid) => (tournamentView || []).find(view => view.tournament.id === tid) || null;
    // Stav karty z toho, co spočítal server, plus rozehraný zápas tohoto zařízení (uložená relace → krok 'resume')
    const tournamentStateOf = (view, meId, today = Tournament.pragueToday()) => Tournament.cardState({ tournament: view.tournament, entries: view.entries, matches: view.matches, me: meId, today, savedMatch: savedTournamentMatch() });
    // Před vykreslením se stavy přepočítají: uložená relace se mezitím mohla změnit (zápas začal, dohrál se), server ne
    const syncTournamentStates = () => {
        const user = signedUser();
        if (!user || !Tournament || !tournamentView) return;
        const today = Tournament.pragueToday();
        tournamentView.forEach(view => { view.state = tournamentStateOf(view, user.id, today); });
    };

    // --- Karta na záložce Více hráčů ---
    const TOUR_BUBBLE = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-brand-950 shadow-sm ring-2 ring-white/70 dark:ring-slate-700';
    const TOUR_ICON = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-brand-950 shadow-sm ring-2 ring-white/80 dark:ring-slate-700';
    const TOUR_LINK = 'rounded px-1 py-0.5 text-[11px] font-black text-brand-700 underline decoration-brand-700/40 underline-offset-2 dark:text-cream dark:decoration-cream/40';
    const TOUR_SMALL = 'flex shrink-0 items-center justify-center gap-1 rounded-xl bg-white/70 text-[11px] font-black text-slate-700 ring-1 ring-slate-300/70 active:scale-95 disabled:opacity-50 dark:bg-slate-900/40 dark:text-slate-200 dark:ring-slate-600';
    const fillBar = (percent, count) => `<span class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/80 dark:bg-slate-700" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Naplnění turnaje"><span class="block h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 ${BAR_WIDTHS[count ? Math.max(1, Math.round(percent / 10)) : 0]}"></span></span>`;
    const entryButton = (state, id) => {
        const busy = tournamentBusy === id;
        if (state.joined) return state.canLeave ? `<button type="button" data-action="tournament-leave" data-tid="${escapeHtml(id)}" ${busy ? 'disabled' : ''} class="${TOUR_SMALL} px-2.5 py-2">Odhlásit se</button>` : '';
        if (state.canJoin) return `<button type="button" data-action="tournament-join" data-tid="${escapeHtml(id)}" ${busy ? 'disabled' : ''} class="flex shrink-0 items-center gap-1.5 rounded-2xl btn-3d bg-emerald-600 px-3.5 py-2.5 text-[14px] font-black text-white disabled:opacity-50"><span class="hidden min-[380px]:flex"><i data-lucide="trophy" class="h-4 w-4"></i></span>Přihlásit se</button>`;
        return state.full && !state.closed ? '<span class="shrink-0 rounded-xl bg-white/70 px-3 py-2 text-[12px] font-black text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">Plno</span>' : '';
    };
    const tournamentRow = (view) => {
        const { tournament, state, entries } = view;
        const today = Tournament.pragueToday();
        const id = escapeHtml(tournament.id);
        if (state.phase === 'open') {
            return `
                <div data-tournament-row="open" class="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                    <span class="${TOUR_ICON}"><i data-lucide="users" class="h-5 w-5"></i></span>
                    <button type="button" data-action="tournament-open" data-tid="${id}" class="min-w-0 flex-1 text-left" aria-label="Přihlášení hráči">
                        <span class="block truncate text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">Přihlášky otevřené</span>
                        <span class="flex items-center gap-1 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">${state.joined ? '<i data-lucide="circle-check" class="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"></i>' : ''}<span class="truncate">${state.closed ? 'Přihlášky jsou zavřené' : state.joined ? `Jsi přihlášen · ${escapeHtml(Tournament.formatDay(state.start))}` : `Začíná ${escapeHtml(Tournament.weekdayName(state.start))} ${escapeHtml(Tournament.formatDay(state.start))}`}</span></span>
                        <span class="mt-1 flex items-center gap-2">${fillBar(state.percent, state.count)}<span data-tournament-count class="text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200">${state.count}/${state.capacity}</span></span>
                    </button>
                    ${entryButton(state, tournament.id)}
                </div>`;
        }
        const names = Tournament.nameMap(entries);
        const text = Tournament.statusText(state, names, today);
        const title = state.phase === 'running' ? `Běží${state.roundName ? ` · ${state.roundName}` : ''}` : state.phase === 'finished' ? 'Poslední turnaj' : 'Turnaj';
        const playing = state.step === 'play' || state.step === 'resume';
        const play = playing ? `<button type="button" data-action="${state.step === 'resume' ? 'tournament-resume' : 'tournament-play'}" data-tid="${id}" class="flex shrink-0 items-center gap-1.5 rounded-2xl btn-3d bg-gradient-to-b from-gold-400 to-gold-600 px-4 py-2.5 text-[14px] font-black text-brand-950"><i data-lucide="play" class="h-4 w-4"></i>${state.step === 'resume' ? 'Pokračovat' : 'Hrát'}</button>` : '';
        const bracket = state.phase === 'finished' ? ['award', 'Výsledky'] : ['git-branch', 'Pavouk'];
        // S velkým tlačítkem Hrát je pavouk jen malá ikona, jinak ikona s popiskem
        const open = `<button type="button" data-action="tournament-open" data-tid="${id}" ${playing ? `aria-label="${bracket[1]}" title="${bracket[1]}"` : ''} class="${TOUR_SMALL} ${playing ? 'h-10 w-10' : 'px-2.5 py-2'}"><i data-lucide="${bracket[0]}" class="h-4 w-4"></i>${playing ? '' : bracket[1]}</button>`;
        const opponent = state.opponent && view.entries.find(entry => entry.user_id === state.opponent);
        return `
            <div data-tournament-row="${state.phase}" ${state.step ? `data-step="${state.step}"` : ''} class="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                <span class="${TOUR_ICON}"><i data-lucide="trophy" class="h-5 w-5"></i></span>
                <div class="min-w-0 flex-1">
                    <p class="truncate text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(title)}</p>
                    <p data-tournament-text class="flex flex-wrap items-center gap-x-1 text-[11px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${state.step === 'play' && opponent ? `<span>Dnes hraješ proti</span> <span class="inline-flex items-center gap-1">${avatarHtml(opponent.player, 'h-4 w-4 text-[10px]')}<b class="text-slate-800 dark:text-slate-100">${escapeHtml(playerName(opponent.player))}</b></span>` : escapeHtml(text)}</p>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">${playing ? open + play : open}</div>
            </div>`;
    };
    // Hráč má dnes odehrát zápas turnaje (karta jde v záložce nahoru) / turnaj je otevřený a hráč se ještě nepřihlásil (karta jemně zeleně svítí)
    const tournamentWaits = () => { syncTournamentStates(); return Boolean(Tournament && tournamentView && tournamentView.some(view => view.state.step === 'play' || view.state.step === 'resume')); };
    const tournamentCard = () => {
        if (!Tournament || !tournamentView || !tournamentView.length) return '';
        syncTournamentStates();
        const invite = tournamentView.some(view => view.state.phase === 'open' && view.state.canJoin);
        return `
            <div id="tournament-card" class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gold-100 via-gold-50 to-emerald-100 p-2.5 shadow-md ring-1 ring-gold-300/80 dark:from-gold-900/50 dark:via-slate-800 dark:to-emerald-900/40 dark:ring-gold-700/60 ${invite ? 'tour-glow' : ''}">
                <div class="relative mb-1.5 flex items-center justify-between gap-2">
                    <p class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-gold-800 dark:text-gold-200"><i data-lucide="trophy" class="h-3.5 w-3.5"></i>Týdenní turnaj</p>
                    <button type="button" data-action="tournament-help" aria-label="Jak to funguje" title="Jak to funguje" class="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[13px] font-black text-brand-700 ring-1 ring-gold-300/70 active:scale-95 dark:bg-slate-900/40 dark:text-gold-200 dark:ring-gold-700/60">?</button>
                </div>
                <div class="relative flex flex-col divide-y divide-gold-300/50 dark:divide-slate-700">${tournamentView.map(tournamentRow).join('')}</div>
            </div>`;
    };

    // --- Okno turnaje: stav, konečné pořadí, kola se zápasy (aktuální rozbalené) ---
    // Jeden zápas: dva hráči pod sebou, výsledek (až když ho server ukáže), vítěz; můj zápas je zvýrazněný
    const tournamentMatchHtml = (match, players, meId) => {
        const mine = Tournament.involves(match, meId);
        const how = match.decided_by === 'walkover' ? 'Kontumačně: soupeř kolo neodehrál.' : match.decided_by === 'earlier' ? 'Nikdo neodehrál, postupuje dřívější přihlášený.' : '';
        const row = (id) => {
            const entry = players.get(id);
            const result = match.results.find(item => item.user_id === id);
            const done = result && result.finished_at;
            const won = match.winner === id;
            const score = done ? `${result.correct}/${Tournament.QUESTIONS} · ${result.points} b` : match.winner ? 'neodehráno' : '';
            return `<div class="flex items-center gap-2 ${match.winner && !won ? 'opacity-60' : ''}">
                ${avatarHtml(entry ? entry.player : null, 'h-7 w-7 text-sm')}
                <span class="min-w-0 flex-1 truncate text-[12.5px] ${won ? 'font-black' : 'font-bold'} text-slate-800 dark:text-slate-100">${escapeHtml(playerName(entry ? entry.player : null))}${id === meId ? ' (ty)' : ''}</span>
                <span class="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">${escapeHtml(score)}</span>
                <span class="flex h-4 w-4 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">${won ? '<i data-lucide="check" class="h-4 w-4"></i>' : ''}</span>
            </div>`;
        };
        const names = plainText(`${playerName((players.get(match.p1) || {}).player)} ${playerName((players.get(match.p2) || {}).player)}`);
        return `<li data-match="${escapeHtml(match.id)}" ${mine ? 'data-mine' : ''} data-names="${escapeHtml(names)}" class="flex flex-col gap-1 rounded-xl bg-white px-2.5 py-1.5 shadow-sm dark:bg-slate-800 ${mine ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}">${row(match.p1)}${row(match.p2)}${how ? `<p class="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(how)}</p>` : ''}</li>`;
    };
    const tournamentRoundsHtml = (view, meId, today) => {
        const { tournament, entries, matches } = view;
        const players = new Map(entries.map(entry => [entry.user_id, entry]));
        const latest = Tournament.currentRound(matches);
        const lastDecided = Tournament.lastDecidedRound(matches);
        const groups = Tournament.groupRounds(tournament, matches).reverse();
        return groups.map(group => {
            const open = group.round === latest || (group.round === lastDecided && !group.third);
            const decidedCount = group.matches.filter(Tournament.decided).length;
            return `<details data-round="${group.key}" data-keep="${group.key}" data-open="${open ? 1 : 0}" ${open ? 'open' : ''} class="group rounded-2xl bg-slate-100/70 p-1.5 dark:bg-slate-800/50">
                <summary class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 [&::-webkit-details-marker]:hidden">
                    <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(group.name)}</span><span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(Tournament.dayWord(group.day, today))} · ${decidedCount}/${group.matches.length} rozhodnuto</span></span>
                    <i data-lucide="chevron-down" class="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"></i>
                </summary>
                <ul class="mt-1.5 flex flex-col gap-1.5">${group.matches.map(match => tournamentMatchHtml(match, players, meId)).join('')}</ul>
            </details>`;
        }).join('');
    };
    // --- Celé pořadí: místa 1.–4., pak skupiny podle kola vyřazení (za běhu nahoře ti, kdo ještě hrají) ---
    const rankingHtml = (view, meId) => {
        const { tournament, entries, matches } = view;
        const result = Tournament.standings(entries, tournament, matches);
        if (!result.total) return '';
        const row = ({ entry, place, label, points, timeMs }, individual) => {
            const mine = entry.user_id === meId;
            const name = plainText(playerName(entry.player));
            return `<li data-rank data-names="${escapeHtml(name)}" ${mine ? 'data-me' : ''} class="flex items-center gap-2 rounded-xl px-2 py-1 ${mine ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : 'bg-white dark:bg-slate-800'}">
                ${individual && place ? `<span class="w-6 shrink-0 text-center text-[12px] font-black ${place === 1 ? 'text-gold-600 dark:text-gold-300' : 'text-slate-500 dark:text-slate-400'}">${place}.</span>` : ''}
                ${avatarHtml(entry.player, 'h-7 w-7 text-sm')}
                <span class="min-w-0 flex-1 truncate text-[12.5px] ${mine ? 'font-black' : 'font-bold'} text-slate-800 dark:text-slate-100">${escapeHtml(playerName(entry.player))}${mine ? ' (ty)' : ''}</span>
                ${individual && label ? `<span class="shrink-0 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(label)}</span>` : ''}
                ${individual && points != null ? `<span data-rank-total class="shrink-0 text-right text-[10.5px] font-black tabular-nums text-slate-700 dark:text-slate-200" title="Body celkem · celkový čas">${points} b · ${Tournament.formatDuration(timeMs)}</span>` : ''}
            </li>`;
        };
        const section = (key, title, note, rows, showLabel) => `<section data-rgroup="${key}" class="flex flex-col gap-1">
            <h3 class="sticky top-0 z-[1] flex items-baseline justify-between gap-2 rounded-lg bg-slate-200 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-200"><span>${escapeHtml(title)}</span><span class="text-[10.5px] font-bold normal-case tracking-normal text-slate-500 dark:text-slate-300">${escapeHtml(note)}</span></h3>
            <ol class="flex flex-col gap-1">${rows.map(item => row(item, showLabel)).join('')}</ol>
        </section>`;
        const parts = [];
        if (result.playing.length) parts.push(section('playing', 'Ještě hrají', String(result.playing.length), result.playing, true));
        result.groups.forEach(group => parts.push(section(group.key, group.label, group.key === 'top' ? '' : `${group.roundName ? `${group.roundName} · ` : ''}${group.rows.length}`, group.rows.map(item => group.key === 'top' || group.key === 'none' ? item : { ...item, label: '' }), group.individual)));
        return `
            <details data-keep="ranking" class="group rounded-2xl bg-slate-100/70 p-1.5 dark:bg-slate-800/50">
                <summary data-ranking class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 text-[13px] font-black text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden"><i data-lucide="medal" class="h-4 w-4 shrink-0 text-gold-600 dark:text-gold-300"></i><span class="flex-1">Celé pořadí (${escapeHtml(Tournament.playersWord(result.total))})</span><i data-lucide="chevron-down" class="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"></i></summary>
                <div id="tournament-ranking" class="mt-1.5 flex flex-col gap-2">${parts.join('')}</div>
            </details>`;
    };

    // --- Pavouk jako v NHL playoff: sloupce kol zleva doprava, kompaktní karty se dvěma řádky, spojnice, vítěz vpravo ---
    const BRACKET_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"><path d="M5 13l4 4L19 7"/></svg>';
    const bracketRowHtml = (card, index, ctx) => {
        const side = card.sides[index];
        if (!side.id) return '<div class="flex h-5 items-center gap-1 px-1.5"><span class="h-4 w-4 shrink-0 rounded-full border border-dashed border-slate-300 dark:border-slate-600"></span><span class="text-[11px] font-semibold text-slate-400 dark:text-slate-500">—</span></div>';
        const entry = ctx.players.get(side.id);
        const name = playerName(entry ? entry.player : null);
        const mine = side.id === ctx.me;
        const tone = side.won ? 'font-black text-slate-900 dark:text-white' : side.lost ? 'font-semibold text-slate-400 dark:text-slate-500' : mine ? 'font-black text-brand-700 dark:text-brand-200' : 'font-bold text-slate-700 dark:text-slate-200';
        const score = side.correct != null ? `${side.correct}/${Tournament.QUESTIONS}` : '—';
        return `<button type="button" data-bp="${escapeHtml(side.id)}" data-bk="${card.key}" aria-pressed="${ctx.focus === side.id}" aria-label="${escapeHtml(`${name}${mine ? ' (ty)' : ''}: ${side.won ? 'vítěz, ' : ''}zvýraznit cestu pavoukem`)}" class="flex h-5 w-full items-center gap-1 px-1.5 text-left ${ctx.focus === side.id ? 'bg-gold-100 dark:bg-gold-900/40' : ''}">
            ${avatarHtml(entry ? entry.player : null, 'h-4 w-4 text-[10px]')}
            <span class="min-w-0 flex-1 truncate text-[11px] leading-none ${tone}">${escapeHtml(name)}</span>
            <span class="shrink-0 text-[10px] leading-none tabular-nums ${side.won ? 'font-black text-slate-700 dark:text-slate-200' : 'font-semibold text-slate-400 dark:text-slate-500'}">${score}</span>
            <span class="flex h-3 w-3 shrink-0 items-center justify-center">${side.won ? BRACKET_CHECK : ''}</span>
        </button>`;
    };
    const bracketCardHtml = (card, ctx) => {
        const onPath = ctx.path.keys.has(card.key);
        const ring = onPath ? (ctx.focus ? 'ring-2 ring-gold-500' : 'ring-2 ring-brand-600 dark:ring-brand-400') : card.waits && !ctx.focus ? 'ring-2 ring-brand-400/70 dark:ring-brand-500/70' : 'ring-1 ring-slate-200 dark:ring-slate-700';
        const names = plainText([card.p1, card.p2].map(id => playerName((ctx.players.get(id) || {}).player)).join(' '));
        return `<div data-bcard ${onPath ? 'data-onpath' : ''} data-names="${escapeHtml(names)}" ${card.id ? `data-match="${escapeHtml(card.id)}"` : ''} class="overflow-hidden rounded-lg shadow-sm ${card.exists ? 'bg-white dark:bg-slate-800' : 'bg-slate-100/80 dark:bg-slate-800/50'} ${ring}">${bracketRowHtml(card, 0, ctx)}<div class="h-px bg-slate-200 dark:bg-slate-700"></div>${bracketRowHtml(card, 1, ctx)}</div>`;
    };
    const bracketHtml = (view, meId, today) => {
        const { tournament, entries, matches } = view;
        const bracket = Tournament.bracketColumns(matches, tournament, meId);
        if (!bracket.columns.length) return '';
        const players = new Map(entries.map(entry => [entry.user_id, entry]));
        const playing = entries.some(entry => entry.user_id === meId && ['playing', 'out', 'finished'].includes(entry.status));
        const start = Tournament.bracketStartRound(tournament);
        // Poslední dohrané kolo je vždy vidět (jinak by po odehrání kola nebylo kde najít výsledky), i když je před výchozím osmifinále
        const lastDone = Tournament.lastDecidedRound(matches);
        const full = bracketFull === null ? Boolean(playing && bracket.focusRound < start) : bracketFull;
        const from = full ? 1 : Math.max(1, Math.min(start, lastDone || start));
        const path = Tournament.playerPath(bracket, bracketFocus || meId);
        const ctx = { players, me: meId, focus: bracketFocus, path };
        const lit = ctx.focus ? 'border-gold-500' : 'border-brand-600 dark:border-brand-400';
        const line = (on) => on ? lit : 'border-slate-300 dark:border-slate-600';
        const last = bracket.columns.length;
        const focusRound = Math.max(from, bracket.focusRound);
        const cell = (card, pair) => {
            const odd = card.slot % 2 === 1;
            const dim = ctx.focus && !path.keys.has(card.key) ? 'opacity-40' : '';
            const hook = pair ? `<span class="pointer-events-none absolute -right-2 w-2 border-r-2 ${odd ? 'top-1/2 bottom-0 rounded-tr border-t-2' : 'top-0 bottom-1/2 rounded-br border-b-2'} ${line(path.won.has(card.key))}"></span>` : `<span class="pointer-events-none absolute -right-4 top-1/2 w-4 border-t-2 ${line(path.won.has(card.key))}"></span>`;
            const third = !pair && bracket.third ? `<div class="absolute inset-x-0 top-full mt-3 ${ctx.focus && !path.keys.has('third') ? 'opacity-40' : ''}"><p class="mb-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">O 3. místo · ${escapeHtml(Tournament.dayShort(Tournament.roundDay(tournament, last), today))}</p>${bracketCardHtml(bracket.third, ctx)}</div>` : '';
            const focusHere = card.round === bracket.focusRound && card.mine;
            return `<div data-bcell="${card.key}" ${focusHere ? 'data-bfocus' : ''} class="relative flex flex-1 items-center py-[3px]"><div class="relative w-full ${dim} motion-safe:transition-opacity">${bracketCardHtml(card, ctx)}${third}</div>${hook}</div>`;
        };
        const columns = bracket.columns.filter(column => column.round >= from).map(column => {
            const body = column.round === last
                ? column.cards.map(card => cell(card, false)).join('')
                : column.cards.reduce((pairs, card, index) => { if (index % 2 === 0) pairs.push([card]); else pairs[pairs.length - 1].push(card); return pairs; }, [])
                    .map(pair => `<div class="relative flex flex-1 flex-col">${pair.map(card => cell(card, true)).join('')}<span class="pointer-events-none absolute -right-4 top-1/2 w-2 border-t-2 ${line(pair.some(card => path.won.has(card.key)))}"></span></div>`).join('');
            const sub = column.current ? 'běží' : Tournament.dayShort(column.day, today);
            return `<div data-bcol="${column.round}" class="flex w-[176px] shrink-0 snap-start flex-col pr-4">
                <div class="sticky top-0 z-10 bg-slate-50 pb-1 dark:bg-slate-900"><p class="truncate text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(column.name)}</p><p class="truncate text-[10px] font-bold leading-tight ${column.current ? 'text-gold-700 dark:text-gold-300' : 'text-slate-500 dark:text-slate-400'}">${escapeHtml(sub)}${column.cards.length > 1 ? ` · ${column.cards.length} zápasů` : ''}</p></div>
                <div class="flex flex-1 flex-col">${body}</div>
            </div>`;
        }).join('');
        const champion = bracket.champion ? players.get(bracket.champion) : null;
        const cup = `<div data-bcol="cup" class="flex w-[84px] shrink-0 snap-start flex-col">
            <div class="sticky top-0 z-10 bg-slate-50 pb-1 dark:bg-slate-900"><p class="truncate text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">Vítěz</p><p class="truncate text-[10px] font-bold leading-tight text-slate-500 dark:text-slate-400">turnaje</p></div>
            <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                <span class="flex h-11 w-11 items-center justify-center rounded-full ${champion ? 'bg-gradient-to-br from-gold-300 to-gold-600 text-brand-950 shadow-md ring-2 ring-white/70 dark:ring-slate-700' : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600'}"><i data-lucide="trophy" class="h-6 w-6"></i></span>
                ${champion ? `<button type="button" data-bp="${escapeHtml(bracket.champion)}" data-bk="cup" aria-pressed="${ctx.focus === bracket.champion}" aria-label="${escapeHtml(`${playerName(champion.player)}: vítěz turnaje, zvýraznit cestu pavoukem`)}" class="flex w-full flex-col items-center gap-0.5 rounded-lg px-0.5 py-0.5 ${ctx.focus === bracket.champion ? 'bg-gold-100 dark:bg-gold-900/40' : ''}">${avatarHtml(champion.player, 'h-7 w-7 text-sm')}<span class="line-clamp-2 break-words text-[11px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(playerName(champion.player))}</span></button>` : '<span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">zatím nikdo</span>'}
            </div>
        </div>`;
        const chip = 'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 active:scale-95';
        const off = 'bg-white text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600';
        const on = 'bg-brand-700 text-white ring-brand-700 dark:bg-brand-600 dark:ring-brand-500';
        const controls = `<div class="flex flex-wrap items-center gap-1.5">
            ${start > 1 ? `<button type="button" data-b-full aria-pressed="${full}" class="${chip} ${full ? on : off}"><i data-lucide="network" class="h-3.5 w-3.5"></i>Celý pavouk</button>` : ''}
            ${playing ? `<button type="button" data-b-me class="${chip} ${off}"><i data-lucide="crosshair" class="h-3.5 w-3.5"></i>Moje místo</button>` : ''}
            ${bracketFocus ? `<button type="button" data-b-clear class="${chip} bg-gold-100 text-gold-900 ring-gold-400 dark:bg-gold-900/40 dark:text-gold-100 dark:ring-gold-600"><i data-lucide="x" class="h-3.5 w-3.5"></i><span class="max-w-[9rem] truncate">${escapeHtml(playerName((players.get(bracketFocus) || {}).player))}</span></button>` : ''}
        </div>`;
        return `${controls}
            <div id="bracket-scroll" tabindex="0" role="region" aria-label="Pavouk turnaje, posouvej do stran" data-from="${from}" data-focus-round="${focusRound}" class="-mx-5 max-h-[60dvh] snap-x snap-mandatory scroll-pl-5 overflow-auto overscroll-x-contain">
                <div class="flex w-max items-stretch px-5 pb-1">${columns}${cup}</div>
            </div>
            <p class="text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">Klepni na hráče a ukáže se jeho cesta pavoukem, znovu a zruší se.</p>`;
    };
    // Posun pavouku: sloupec s kartou doleva, karta svisle doprostřed (jen v kontejneru, ne celá stránka)
    const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const scrollBracketTo = (target, behavior = 'auto') => {
        const box = document.getElementById('bracket-scroll');
        if (!box || !target) return;
        const column = target.closest('[data-bcol]') || target;
        const boxRect = box.getBoundingClientRect();
        const left = box.scrollLeft + column.getBoundingClientRect().left - boxRect.left - 20;
        const rect = target.getBoundingClientRect();
        const top = box.scrollTop + rect.top - boxRect.top - (box.clientHeight - rect.height) / 2;
        box.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: behavior === 'smooth' && reducedMotion() ? 'auto' : behavior });
    };
    const positionBracket = (overlay) => {
        const box = overlay.querySelector('#bracket-scroll');
        if (!box) return false;
        scrollBracketTo(box.querySelector('[data-bfocus]') || box.querySelector(`[data-bcol="${box.dataset.focusRound}"] [data-bcell]`) || box.querySelector('[data-bcol]'));
        return true;
    };
    const renderTournamentDialog = () => {
        const user = signedUser();
        const view = findTournament(tournamentDialogId);
        if (!user || !view) { showDialog(TOUR_DIALOG, '<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám turnaj…</p>'); return; }
        const { tournament, entries, matches, state } = view;
        const today = Tournament.pragueToday();
        const names = Tournament.nameMap(entries);
        const rules = `<button type="button" data-t-help class="${TOUR_LINK} self-start">Jak turnaje fungují</button>`;
        let body;
        if (state.phase === 'open') {
            body = `
                <p class="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">Začíná ${escapeHtml(Tournament.weekdayName(state.start))} ${escapeHtml(Tournament.formatDay(state.start))}. Hraje nejvyšší mocnina dvou nejdřív přihlášených (nejméně ${Tournament.MIN_PLAYERS}, nejvýš ${state.capacity}).</p>
                <div class="flex items-center gap-2">${fillBar(state.percent, state.count)}<span class="text-sm font-black tabular-nums text-slate-700 dark:text-slate-200">${state.count}/${state.capacity}</span></div>
                ${state.joined ? '<p class="text-sm font-black text-emerald-700 dark:text-emerald-400">Jsi přihlášen.</p>' : ''}
                ${state.canJoin ? `<button type="button" data-t-join class="${PRIMARY_BUTTON}" ${tournamentBusy ? 'disabled' : ''}>Přihlásit se</button>` : ''}
                ${state.canLeave ? `<button type="button" data-t-leave class="${SECONDARY_BUTTON}" ${tournamentBusy ? 'disabled' : ''}>Odhlásit se</button>` : ''}
                <details data-keep="entries" class="group rounded-2xl bg-slate-100/70 p-1.5 dark:bg-slate-800/50">
                    <summary class="flex cursor-pointer list-none items-center gap-2 px-1.5 py-1 text-[13px] font-black text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden"><span class="flex-1">Přihlášení hráči (${entries.length})</span><i data-lucide="chevron-down" class="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"></i></summary>
                    <ol id="tournament-entries" class="mt-1.5 flex flex-col gap-1">${entries.map((entry, index) => `<li class="flex items-center gap-2 rounded-xl bg-white px-2 py-1 dark:bg-slate-800"><span class="w-6 text-center text-[11px] font-black text-slate-500 dark:text-slate-400">${index + 1}</span>${avatarHtml(entry.player, 'h-7 w-7 text-sm')}<span class="min-w-0 flex-1 truncate text-[12.5px] font-bold text-slate-800 dark:text-slate-100">${escapeHtml(playerName(entry.player))}${entry.user_id === user.id ? ' (ty)' : ''}</span></li>`).join('')}</ol>
                </details>
                ${rules}`;
        } else {
            const status = Tournament.statusText(state, names, today);
            const podium = state.phase === 'finished' ? Tournament.podium(entries) : [];
            const hasBracket = Boolean(matches.length && tournament.size >= 2);
            const bracketOn = hasBracket && tournamentMode === 'bracket';
            const medals = ['text-gold-600 dark:text-gold-300', 'text-slate-500 dark:text-slate-300', 'text-amber-700 dark:text-amber-500', 'text-slate-500 dark:text-slate-400'];
            body = `
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Týden ${escapeHtml(Tournament.weekLabel(tournament.week_start))} · ${tournament.size ? `${Tournament.playersWord(tournament.size)}` : ''} · Mix všech témat, ${Tournament.QUESTIONS} otázek v kole</p>
                ${state.role === 'player' || (state.phase === 'finished' && state.playing) ? `<div id="tournament-status" class="flex items-center gap-2.5 rounded-2xl bg-gold-50 p-2.5 ring-1 ring-gold-300/70 dark:bg-gold-900/20 dark:ring-gold-700/60"><p class="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-800 dark:text-slate-100">${state.roundName ? `<span class="font-black">${escapeHtml(state.roundName)}:</span> ` : ''}${escapeHtml(status)}</p>${state.step === 'play' || state.step === 'resume' ? `<button type="button" data-t-play class="shrink-0 rounded-xl bg-gold-500 px-3.5 py-2 text-[13px] font-black text-brand-950 shadow-sm active:scale-[0.97]">${state.step === 'resume' ? 'Pokračovat' : 'Hrát'}</button>` : ''}</div>` : `<p id="tournament-status" class="text-sm font-semibold text-slate-600 dark:text-slate-300">${escapeHtml(status)}</p>`}
                ${podium.length ? `<ol id="tournament-podium" class="flex flex-col gap-1">${podium.map(entry => `<li class="flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 shadow-sm dark:bg-slate-800 ${entry.user_id === user.id ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}"><span class="flex w-8 shrink-0 items-center justify-center gap-0.5 text-sm font-black ${medals[entry.place - 1]}">${entry.place}.${entry.place === 1 ? '<i data-lucide="trophy" class="h-3.5 w-3.5"></i>' : ''}</span>${avatarHtml(entry.player, 'h-8 w-8 text-base')}<span class="min-w-0 flex-1 truncate text-[13px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(playerName(entry.player))}${entry.user_id === user.id ? ' (ty)' : ''}</span></li>`).join('')}</ol>` : ''}
                ${rankingHtml(view, user.id)}
                ${hasBracket ? `<div role="group" aria-label="Pohled na turnaj" class="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">${[['rounds', 'Seznam kol'], ['bracket', 'Pavouk']].map(([mode, title]) => `<button type="button" data-t-mode="${mode}" aria-pressed="${(mode === 'bracket') === bracketOn}" class="rounded-lg px-2 py-1.5 text-[13px] font-black ${(mode === 'bracket') === bracketOn ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'}">${title}</button>`).join('')}</div>` : ''}
                ${tournament.size >= 16 ? `<input id="tournament-search" type="search" value="${escapeHtml(tournamentQuery)}" placeholder="Najít hráče…" autocomplete="off" maxlength="24" aria-label="Najít hráče v pavouku" class="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600">` : ''}
                ${bracketOn ? `<div id="tournament-bracket" class="flex flex-col gap-2">${bracketHtml(view, user.id, today)}</div>` : `<div id="tournament-rounds" class="flex flex-col gap-1.5">${matches.length ? tournamentRoundsHtml(view, user.id, today) : '<p class="text-sm text-slate-500 dark:text-slate-400">Zápasy zatím nejsou.</p>'}</div>`}
                <p id="tournament-empty" class="hidden text-sm text-slate-500 dark:text-slate-400">Takový hráč tu není.</p>
                ${rules}`;
        }
        // Překreslení po načtení nových dat nesmí sbalit kola, která hráč rozbalil ani posunout pavouk
        const before = document.getElementById('dialog-overlay');
        const sameDialog = Boolean(before && before.dataset.title === TOUR_DIALOG);
        const opened = sameDialog ? Object.fromEntries([...before.querySelectorAll('details[data-keep]')].map(item => [item.dataset.keep, item.open])) : {};
        const oldBox = sameDialog ? before.querySelector('#bracket-scroll') : null;
        const oldScroll = oldBox ? { left: oldBox.scrollLeft, top: oldBox.scrollTop } : null;
        const oldFocus = sameDialog && before.contains(document.activeElement) && document.activeElement.dataset.bp ? { bp: document.activeElement.dataset.bp, bk: document.activeElement.dataset.bk } : null;
        const rerender = () => renderTournamentDialog();
        const overlay = showDialog(TOUR_DIALOG, `<div class="flex flex-col gap-3">${body}</div>`, {
            onClick: (event) => {
                const target = event.target;
                if (target.closest('[data-t-join]')) changeTournamentEntry(tournamentDialogId, true);
                else if (target.closest('[data-t-leave]')) changeTournamentEntry(tournamentDialogId, false);
                else if (target.closest('[data-t-play]')) { const view = findTournament(tournamentDialogId); if (view && view.state.step === 'resume') resumeTournament(tournamentDialogId); else playTournament(tournamentDialogId); }
                else if (target.closest('[data-t-help]')) openTournamentHelp(true);
                else if (target.closest('[data-t-mode]')) { tournamentMode = target.closest('[data-t-mode]').dataset.tMode === 'rounds' ? 'rounds' : 'bracket'; bracketReset = true; rerender(); }
                else if (target.closest('[data-b-full]')) { bracketFull = target.closest('[data-b-full]').getAttribute('aria-pressed') !== 'true'; bracketReset = true; rerender(); }
                else if (target.closest('[data-b-me]')) { const box = document.getElementById('bracket-scroll'); scrollBracketTo(box && box.querySelector('[data-bfocus]'), 'smooth'); }
                else if (target.closest('[data-b-clear]')) { bracketFocus = ''; rerender(); }
                else if (target.closest('[data-bp]')) {
                    const row = target.closest('[data-bp]');
                    bracketFocus = bracketFocus === row.dataset.bp ? '' : row.dataset.bp;
                    rerender();
                    const again = [...document.querySelectorAll('#bracket-scroll [data-bp]')].find(item => item.dataset.bp === row.dataset.bp && item.dataset.bk === row.dataset.bk);
                    if (again) again.focus({ preventScroll: true });
                } else if (target.closest('summary[data-ranking]')) {
                    // Po rozbalení pořadí skoč na můj řádek
                    const details = target.closest('details');
                    if (details && !details.open) requestAnimationFrame(() => { const mine = document.querySelector('#tournament-ranking [data-me]'); if (mine) mine.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); });
                }
            },
            onInput: (event) => { if (event.target.id === 'tournament-search') filterTournament(event.target.value); }
        });
        overlay.querySelectorAll('details[data-keep]').forEach(item => { if (item.dataset.keep in opened) item.open = opened[item.dataset.keep]; });
        const box = overlay.querySelector('#bracket-scroll');
        if (box) {
            if (bracketReset || !oldScroll) { positionBracket(overlay); bracketReset = false; } else box.scrollTo({ left: oldScroll.left, top: oldScroll.top, behavior: 'auto' });
            if (oldFocus) { const again = [...box.querySelectorAll('[data-bp]')].find(item => item.dataset.bp === oldFocus.bp && item.dataset.bk === oldFocus.bk); if (again) again.focus({ preventScroll: true }); }
        }
        if (tournamentQuery) filterTournament(tournamentQuery);
        return overlay;
    };
    // Hledání hráče bez překreslení (zachová se zaměřené pole): v seznamu kol schová nevyhovující zápasy a rozbalí kola s nálezem,
    // v pavouku ztlumí ostatní karty, v celém pořadí schová ostatní řádky (a pořadí na chvíli rozbalí)
    const filterTournament = (query) => {
        tournamentQuery = String(query || '').slice(0, 24);
        const needle = plainText(tournamentQuery).trim();
        const overlay = document.getElementById('dialog-overlay');
        if (!overlay) return;
        let total = 0;
        overlay.querySelectorAll('details[data-round]').forEach(details => {
            let shown = 0;
            details.querySelectorAll('li[data-names]').forEach(item => {
                const hit = !needle || item.dataset.names.includes(needle);
                item.classList.toggle('hidden', !hit);
                if (hit) shown++;
            });
            total += shown;
            details.classList.toggle('hidden', Boolean(needle) && !shown);
            details.open = needle ? shown > 0 : details.dataset.open === '1';
        });
        let firstCard = null;
        overlay.querySelectorAll('#bracket-scroll [data-bcard]').forEach(card => {
            const hit = !needle || card.dataset.names.includes(needle);
            card.classList.toggle('opacity-25', !hit);
            if (hit && needle) { total++; if (!firstCard) firstCard = card; }
        });
        if (firstCard) scrollBracketTo(firstCard);
        const ranking = overlay.querySelector('details[data-keep="ranking"]');
        if (ranking) {
            let rows = 0;
            ranking.querySelectorAll('section[data-rgroup]').forEach(group => {
                let shown = 0;
                group.querySelectorAll('li[data-rank]').forEach(item => {
                    const hit = !needle || item.dataset.names.includes(needle);
                    item.classList.toggle('hidden', !hit);
                    if (hit) shown++;
                });
                group.classList.toggle('hidden', !shown);
                rows += shown;
            });
            total += needle ? rows : 0;
            if (needle && rows && !ranking.open) { ranking.open = true; ranking.dataset.auto = '1'; }
            else if ((!needle || !rows) && ranking.dataset.auto) { ranking.open = false; delete ranking.dataset.auto; }
        }
        const empty = overlay.querySelector('#tournament-empty');
        if (empty) empty.classList.toggle('hidden', !needle || total > 0);
    };
    const openTournament = (tid) => {
        if (!signedUser() || !Tournament) return;
        tournamentDialogId = tid;
        tournamentQuery = '';
        tournamentMode = 'bracket';
        bracketFull = null;
        bracketFocus = '';
        bracketReset = true;
        renderTournamentDialog();
        refreshTournaments({ force: true });
    };
    const openTournamentHelp = (back = false) => {
        showDialog('Jak turnaje fungují', `
            <div class="flex flex-col gap-3">
                <ul id="tournament-rules" class="flex flex-col gap-2">${Tournament.RULES.map(rule => `<li class="flex gap-2 text-sm leading-snug text-slate-700 dark:text-slate-200"><i data-lucide="check" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"></i><span>${escapeHtml(rule)}</span></li>`).join('')}</ul>
                <p class="text-xs leading-snug text-slate-500 dark:text-slate-400">Názvy kol podle počtu hráčů v kole: 128 hráčů 1. kolo, 64 2. kolo, 32 šestnáctifinále, 16 osmifinále, 8 čtvrtfinále, 4 semifinále, 2 finále a zápas o 3. místo.</p>
                ${back && findTournament(tournamentDialogId) ? `<button type="button" data-t-back class="${SECONDARY_BUTTON}">Zpět na turnaj</button>` : ''}
            </div>`, { onClick: (event) => { if (event.target.closest('[data-t-back]')) { bracketReset = true; renderTournamentDialog(); } } });
    };

    // Přihlášení a odhlášení: hlášku (i chybu) ukáže toast, pak se turnaje načtou znovu
    const changeTournamentEntry = async (tid, join) => {
        if (!tid || tournamentBusy || !Social) return;
        tournamentBusy = tid;
        paintChallenges();
        if (document.getElementById('tournament-status') || document.getElementById('tournament-entries')) renderTournamentDialog();
        try {
            await (join ? Social.joinTournament(tid) : Social.leaveTournament(tid));
            showToast(join ? 'Jsi přihlášen do turnaje' : 'Odhlášen z turnaje');
        } catch (error) {
            showToast(error.message);
        }
        tournamentBusy = '';
        await refreshTournaments({ force: true });
        paintChallenges();
        if (document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === TOUR_DIALOG) renderTournamentDialog();
    };

    // Hra zápasu: nejdřív server zapíše začátek (a od teď měří čas), až potom se spustí otázky
    const playTournament = async (tid) => {
        const view = findTournament(tid);
        if (!view || !Social || tournamentStarting || isLoading) return;
        const { tournament, state } = view;
        if (state.step !== 'play') return;
        tournamentStarting = true;
        try {
            await Social.startTournamentMatch(state.matchId);
        } catch (error) {
            tournamentStarting = false;
            showToast(error.message);
            refreshTournaments({ force: true });
            return;
        }
        tournamentStarting = false;
        tournamentTickAt = 0;
        // Karta ví o začátku hned (bez čekání na server): z „Hrát“ je „Pokračovat“, dokud se zápas nedohraje
        const user = signedUser();
        if (user && view.matches) {
            const match = view.matches.find(item => item.id === state.matchId);
            if (match && !Tournament.resultOf(match, user.id)) match.results = [...(match.results || []), { user_id: user.id, started_at: new Date().toISOString(), finished_at: null, correct: null, points: null, time_ms: null }];
        }
        startChallenge({
            code: 'turnaj', topic: tournament.topic, seed: `${tournament.seed}-r${state.round}`, count: Tournament.QUESTIONS, variant: 'choices', include_hard: false,
            tournament: { tid: tournament.id, mid: state.matchId, round: state.round, name: state.roundName, seedBase: tournament.seed }
        }, 0, []);
    };
    // Pokračování rozehraného zápasu (uložená relace tohoto zařízení) od první nezodpovězené otázky; server měří čas od začátku zápasu.
    // Když jsou všechny otázky zodpovězené (aplikace se zavřela před odesláním), výsledek se rovnou odešle.
    const resumeTournament = async (tid) => {
        if (!findTournament(tid) || !Social || tournamentStarting || isLoading) return;
        tournamentStarting = true;
        // Server rozhoduje: před pokračováním se stav zápasu načte znovu (mezitím mohl skončit den kola nebo se zápas rozhodl)
        try { await refreshTournaments({ force: true }); } catch (error) { /* bez spojení se pokračuje podle posledního známého stavu */ }
        tournamentStarting = false;
        const view = findTournament(tid);
        if (!view) return;
        syncTournamentStates();
        const saved = savedTournamentChallenge();
        if (view.state.step !== 'resume' || !saved || saved.mid !== view.state.matchId) {
            if (saved && view.state.matchId === saved.mid) markTournamentFinished(saved.mid);
            const expired = view.state.step === 'counting' || view.state.step === 'lost' || view.state.step === 'won';
            if (document.getElementById('dialog-overlay')) closeDialog();
            showToast(expired ? 'Tenhle zápas už vypršel, kolo skončilo.' : 'Tenhle zápas už nejde dohrát.');
            paintChallenges();
            return;
        }
        const def = saved.challenge;
        const results = Array.from({ length: def.count }, (_, index) => def.results[index] || null);
        const next = results.findIndex(row => !row);
        showToast('Čas běží od začátku zápasu');
        if (next < 0) {
            challenge = { ...def, results, index: def.count - 1, done: false };
            mode = 'challenge';
            closeDialog();
            finishTournamentMatch();
            return;
        }
        startChallenge(def, next, results);
    };
    // Dohraný zápas se v uložené relaci označí jako hotový, ať ho karta po dalším spuštění nenabízí k pokračování
    const markTournamentFinished = (mid) => {
        const session = readJson(KEYS.session);
        if (session && session.challenge && session.challenge.tournament && session.challenge.tournament.mid === mid && !session.challenge.done) { session.challenge.done = true; writeJson(KEYS.session, session); }
    };

    // Po poslední otázce: výsledek jde na server, potom se ukáže, jak zápas dopadl (soupeřův výsledek ukáže server až po rozhodnutí)
    const finishTournamentMatch = async () => {
        const c = challenge;
        if (!c || !c.tournament || !signedUser() || c.sending) return;
        c.sending = true;
        c.done = true;
        renderTournamentDone('sending');
        const correct = c.results.filter(row => row && row.correct).length;
        const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
        try {
            try {
                await Social.finishTournamentMatch(c.tournament.mid, correct, points);
            } catch (error) {
                // Odpověď se ztratila a výsledek už na serveru je: pokračuje se k výsledku zápasu
                if (!/jen jednou/.test(error.message)) throw error;
            }
            // Odehraný zápas turnaje do počítadel (týdenní cíl); umístění a odznaky doplní refreshTournaments
            if (!c.counted) { c.counted = true; const progress = loadProgress(); progress.counters.tourPlayed += 1; saveProgress(progress); settleGoals(); }
            // Výsledek je na serveru: uložená relace se označí jako hotová, ať karta zápas po dalším spuštění nenabízí k pokračování
            markTournamentFinished(c.tournament.mid);
            await refreshTournaments({ force: true });
            if (challenge === c) renderTournamentDone('ok');
        } catch (error) {
            if (challenge === c) renderTournamentDone('error', error.message);
        } finally {
            c.sending = false;
        }
    };
    const renderTournamentDone = (state = 'ok', message = '') => {
        const c = challenge;
        if (!c || !c.tournament) return;
        screen = 'challenge-done';
        closePlaceInfo();
        const user = signedUser();
        const tour = c.tournament;
        const correct = c.results.filter(row => row && row.correct).length;
        const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
        const view = findTournament(tour.tid);
        const info = view ? view.state : null;
        const today = Tournament.pragueToday();
        const match = view ? view.matches.find(item => item.id === tour.mid) : null;
        let owl = 'oslava';
        let headline = 'Odehráno!';
        let text = 'Čekáš na soupeře. Výsledek se dozvíš, jakmile soupeř zápas odehraje; kdo kolo neodehraje do půlnoci, prohrává.';
        if (info && info.matchId === tour.mid && info.step === 'won') {
            owl = 'vitez';
            headline = 'Vyhráváš!';
            text = info.final ? (info.third ? 'Vyhrál jsi zápas o 3. místo.' : 'Vyhrál jsi finále, jsi vítěz turnaje!') : `Postupuješ dál, další kolo hraješ ${Tournament.dayWord(info.nextDay, today)}.`;
        } else if (info && info.matchId === tour.mid && info.step === 'lost') {
            owl = 'prohra';
            headline = 'Tentokrát to nevyšlo';
            text = `Soupeř byl lepší.${info.label ? ` Končíš na ${info.label}.` : ''}`;
        }
        const body = state === 'sending'
            ? '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Ukládám výsledek…</p>'
            : state === 'error'
                ? `<div class="flex flex-col gap-2"><p class="text-sm font-semibold text-rose-700 dark:text-rose-400" role="alert">${escapeHtml(message || 'Výsledek se nepodařilo uložit. Zkontroluj připojení.')}</p><button type="button" data-action="challenge-retry" class="${PRIMARY_BUTTON}">Zkusit znovu</button></div>`
                : `<p data-tournament-outcome class="text-center text-sm font-semibold leading-snug text-slate-700 dark:text-slate-200">${escapeHtml(text)}</p>
                    ${match && view ? `<ul class="flex flex-col gap-1.5">${tournamentMatchHtml(match, new Map(view.entries.map(entry => [entry.user_id, entry])), user && user.id)}</ul>` : ''}
                    ${Friends && match && user ? Friends.reactionBar(match.p1 === user.id ? match.p2 : match.p1, c.reaction || null, { busy: Boolean(c.reacting) }) : ''}
                    ${info && info.step === 'won' && match && match.decided_by !== 'earlier' ? `<p class="text-center text-sm font-black text-emerald-700 dark:text-emerald-400">+${Tournament.winXp(match.round)} XP za vyhraný zápas</p>` : ''}`;
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-4 pb-6 dark:bg-slate-900">
                <div class="rounded-[1.5rem] bg-gradient-to-br from-brand-600 to-brand-900 p-5 text-center text-white shadow-lg">
                    ${uiArt(`sova-${state === 'ok' ? owl : 'oslava'}`, 'mx-auto -mt-1 mb-1 h-24 w-24')}
                    ${state === 'ok' ? `<p class="mt-1 text-xl font-black leading-tight ${owl === 'vitez' ? 'text-gold-300' : ''}">${escapeHtml(headline)}</p>` : ''}
                    <p class="mt-2 text-xs font-black uppercase tracking-widest text-white/80">Turnaj · ${escapeHtml(tour.name || '')}</p>
                    <p class="mt-0.5 text-4xl font-black">${correct}/${c.count}</p>
                    <p class="mt-1 text-sm font-bold text-white/90">${escapeHtml(formatPoints(points))}</p>
                </div>
                ${body}
                <button type="button" data-action="tournament-back" class="${PRIMARY_BUTTON}"><i data-lucide="trophy" class="h-5 w-5"></i> Zpět na turnaj</button>
                <button type="button" data-action="challenge-home" class="${SECONDARY_BUTTON}">Zpět domů</button>
            </div>`;
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
    };
    // Reakce po zápase (👍 🔥 😅 🤝) na obrazovce výsledku výzvy nebo zápasu turnaje; opakovaná reakce tu první přepíše
    const sendReaction = async (emoji, toId) => {
        const c = challenge;
        const user = signedUser();
        if (!c || !user || !Friends || c.reacting || !toId) return;
        const repaint = () => { if (challenge !== c) return; if (c.tournament) renderTournamentDone('ok'); else renderChallengeDone(c.lastResults || null); };
        c.reacting = true;
        repaint();
        try {
            await Social.react(user.id, c.tournament ? { matchId: c.tournament.mid } : { challengeId: c.code }, toId, emoji);
            c.reaction = emoji;
        } catch (error) {
            showToast(error && error.message ? error.message : 'Reakci se nepodařilo poslat.');
        }
        c.reacting = false;
        repaint();
    };
    const tournamentActions = {
        'tournament-open': (button) => openTournament(button.dataset.tid),
        'tournament-help': () => openTournamentHelp(),
        'tournament-join': (button) => changeTournamentEntry(button.dataset.tid, true),
        'tournament-leave': (button) => changeTournamentEntry(button.dataset.tid, false),
        'tournament-play': (button) => playTournament(button.dataset.tid),
        'tournament-resume': (button) => resumeTournament(button.dataset.tid),
        'tournament-back': () => { const tid = challenge && challenge.tournament ? challenge.tournament.tid : ''; challengeHome(); if (tid) openTournament(tid); }
    };

    // Klepnutí na upozornění: ?tab=multi v adrese (aplikace byla zavřená) nebo zpráva od service workeru (běžela) otevře záložku Více hráčů
    const openHomeTabFromPush = (tab) => {
        if (tab !== 'multi' && tab !== 'single') return;
        writeJson(KEYS.homeTab, tab);
        if (screen === 'home') { renderHome(); refreshTournaments(); }
    };
    function takeTabParam() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('tab')) return '';
        const tab = params.get('tab');
        params.delete('tab');
        const query = params.toString();
        try { window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash); } catch (error) { /* adresa zůstane */ }
        return tab;
    }

    // Odkaz s ?vyzva=KÓD: kód se z adresy hned odstraní
    function takeInviteCode() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('vyzva')) return '';
        const code = Social ? Social.parseCode(params.get('vyzva')) : '';
        params.delete('vyzva');
        const query = params.toString();
        try { window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash); } catch (error) { /* adresa zůstane */ }
        return code;
    }

    // Všechny akce přes delegaci událostí – stránka nepotřebuje inline JavaScript (kvůli CSP)
    const ACTIONS = {
        daily: (button) => { lastDailyTopic = button.dataset.topic; startDaily(button.dataset.topic); },
        'auth-login': () => Auth && Auth.login(),
        'play-as-host': () => {
            writeJson(KEYS.account, 'host');
            showStart();
        },
        'open-profile': () => openProfile(),
        'open-accept': () => openAccepted(),
        // Přátelé a reakce (friends.js)
        'friend-accept': (button) => answerFriendRequest(button.dataset.id, true),
        'friend-decline': (button) => answerFriendRequest(button.dataset.id, false),
        react: (button) => sendReaction(button.dataset.emoji, button.dataset.to),
        'weekly-board': () => openWeeklyBoard(),
        'league-help': () => openLeagueHelp(),
        'home-tab': (button) => { writeJson(KEYS.homeTab, button.dataset.tab === 'multi' ? 'multi' : 'single'); renderHome(); refreshTournaments(); },
        ...tournamentActions,
        'new-challenge': () => openNewChallenge(),
        'random-challenge': () => openNewChallenge({ who: 'random' }),
        'recent-more': () => { recentExpanded = !recentExpanded; paintChallenges(); },
        'join-challenge': () => openJoinChallenge(),
        'challenge-open': (button) => openChallenge(button.dataset.code),
        'challenge-resume': () => {
            if (!challenge || challenge.done) return;
            // Všechny otázky už jsou zodpovězené (aplikace se zavřela před odesláním): nic se nehraje znovu, výzva se rovnou odešle
            if (challenge.results.filter(Boolean).length >= challenge.count) { finishChallenge(); return; }
            startChallenge(challenge, challenge.index, challenge.results);
        },
        'challenge-share': (button) => shareChallenge(button.dataset.code, button.dataset.text || ''),
        'challenge-retry': () => finishChallenge(true),
        'challenge-home': () => challengeHome(),
        'play-daily': () => { const next = nextDailyTopic(); if (next) startNextDaily(next.id); },
        'daily-home': () => renderHome(),
        'play-topic': (button) => playTopic(button.dataset.topic),
        'play-mix': () => openChooser({ kind: 'mix' }),
        'open-fact': () => openFact(),
        'open-learn': () => openLearn('home'),
        hint: () => showNextHint(),
        'hint-tab': (button) => switchTab('hint-tab', button.dataset.step),
        'result-tab': (button) => switchTab('result-tab', button.dataset.step),
        'give-up': () => submitAnswer({ correct: false, typed: false, answer: null, gaveUp: true }),
        'report-question': () => openReportDialog(),
        'item-info': (button) => openItemInfo(button.dataset.topic, button.dataset.id),
        next: () => continueAfterResult(),
        retry: () => retry(),
        share: () => shareResult(),
        'zoom-in': () => changeMapZoom(1),
        'zoom-out': () => changeMapZoom(-1),
        settings: () => openSettings(),
        'learn-back': () => openLearn('home'),
        'learn-topic': (button) => openLearn('topic', button.dataset.topic),
        'learn-collection': (button) => { learn.collection = button.dataset.collection || null; openLearn('collection'); },
        'learn-browse': () => browseCollection(),
        'learn-practice': () => startPractice({ kind: 'collection', topic: learn.topic, collection: learn.collection }),
        'learn-mistakes': () => openLearn('mistakes'),
        'learn-next': () => moveAtlas(1),
        'learn-prev': () => moveAtlas(-1),
        'practice-mistakes': () => startPractice({ kind: 'mistakes' }),
        'review-start': () => startReview(),
        'goals-open': () => openGoals(),
        'clear-mistakes': () => clearMistakes(),
        choice: (button) => {
            if (!round || round.variant === 'typed') return;
            const choice = current && current.question.choices[Number(button.dataset.index)];
            if (!choice) return;
            submitAnswer({ correct: choice.correct, typed: false, answer: choice.label, answerRef: choice.id ? { topic: choice.topic || current.topic, id: choice.id } : null });
        }
    };

    appContent.addEventListener('click', (event) => {
        const variantButton = event.target.closest('#variant-welcome [data-variant]');
        if (variantButton) {
            changeVariant(variantButton.dataset.variant);
            return;
        }
        const button = event.target.closest('[data-action]');
        if (button && ACTIONS[button.dataset.action]) ACTIONS[button.dataset.action](button);
    });

    appContent.addEventListener('submit', (event) => {
        if (event.target.id !== 'answer-form') return;
        event.preventDefault();
        if (!round || round.variant !== 'typed') return;
        const answer = event.target.elements.answer.value.trim();
        if (!answer || !current) return;
        let correct = checkAnswer(answer, current.question);
        // Napsal hráč jinou položku ze sady (nebo jiný stát)? Pak k ní výsledek nabídne popis
        let answerRef = null;
        const ctx = loadedTopics.get(current.topic);
        const item = ctx && ctx.byId.get(current.id);
        if (item) {
            answerRef = ctx.topic.findAnswer ? ctx.topic.findAnswer(current.question.type, answer, item, ctx) : null;
            if (!answerRef && current.question.type === 'name') {
                const id = findAnswerItem(answer, item, ctx.items);
                answerRef = id ? { topic: current.topic, id } : null;
            }
        }
        // Přesně název jiné položky (Slovinsko u Slovenska, Vodík u Sodíku) není překlep, ale jiná odpověď
        // (jen když to není přesně jedna z vlastních odpovědí – Moskva je město i řeka, Irsko stát i ostrov)
        const other = answerRef && loadedTopics.get(answerRef.topic) && loadedTopics.get(answerRef.topic).byId.get(answerRef.id);
        const exactlyOwn = current.question.accepted.some(accepted => normalizeAnswer(accepted) === normalizeAnswer(answer));
        if (correct && other && !exactlyOwn && normalizeAnswer(other.n) === normalizeAnswer(answer)) correct = false;
        submitAnswer({ correct, typed: true, answer, answerRef: correct ? null : answerRef });
    });

    // Chyba načtení obrázku (dlaždice mapy) nebublá, zachytíme ji ve fázi capture a obrázek skryjeme
    appContent.addEventListener('error', (event) => {
        if (event.target instanceof HTMLImageElement) event.target.classList.add('invisible');
    }, true);

    // Úvod s přihlášením, bez varianty uvítání, jinak rozehraná otázka, jinak domovská obrazovka s dnešními otázkami
    const showStart = () => {
        if (wantsAccountWelcome()) {
            renderAccountWelcome();
            return;
        }
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        if (location.hash === '#obnovit' && resumeSession()) return;
        restoreSession();
        renderHome();
    };

    document.getElementById('btn-home').addEventListener('click', () => renderHome());
    document.getElementById('btn-practice').addEventListener('click', () => showPractice());
    // Učení: z procvičování okruhu nebo chyb zpět k nim, jinak na začátek učení
    document.getElementById('btn-learn').addEventListener('click', () => {
        if (screen === 'round' && mode === 'practice' && pool.kind === 'collection' && TOPIC_BY_ID[pool.topic]) {
            learn.collection = pool.collection || null;
            openLearn('collection', pool.topic);
        } else if (screen === 'round' && mode === 'practice' && pool.kind === 'mistakes') openLearn('mistakes');
        else openLearn('home');
    });
    document.getElementById('btn-settings').addEventListener('click', () => openSettings());
    document.getElementById('status-badge').addEventListener('click', (event) => switchFromBadge(event));
    // Žárovka: nejdřív zajímavost dne (když je nepřečtená), jinak pozvánka do turnaje
    document.getElementById('fact-hint').addEventListener('click', () => {
        if (dailyFact && !factRead()) openFact();
        else if (tournamentBulbDue()) openTournamentOffer('bulb');
        else openFact();
    });
    // Zvětšení fotky funguje všude: v nápovědě, ve výsledku, v okně s popisem i v atlasu
    document.addEventListener('click', (event) => {
        const zoom = event.target.closest('[data-photo-zoom]');
        if (zoom && zoom.dataset.url) openPhotoZoom(zoom.dataset.url, zoom.dataset.masks ? JSON.parse(zoom.dataset.masks) : null);
    });
    // Escape zavře nejdřív okno s popisem, pak výběr co hrát, pak nastavení
    // Tlačítko Zpět na mobilu jako zpět v aplikaci: mimo čistou úvodní obrazovku drží aplikace v historii prohlížeče jeden
    // krok navíc. Zpět ho spotřebuje a aplikace udělá svůj krok zpět (zavře okno, z otázky domů, v učení o úroveň výš);
    // teprve na úvodní obrazovce Zpět aplikaci opustí. Krok se doplní či odebere po každé změně obrazovky nebo okna.
    const OVERLAY_IDS = ['photo-zoom', 'place-info', 'play-chooser', 'settings-overlay', 'dialog-overlay'];
    const atRoot = () => (screen === 'home' || screen === 'welcome') && !OVERLAY_IDS.some(id => document.getElementById(id));
    let skipNextPop = false;
    const syncHistory = () => {
        const guarded = Boolean(history.state && history.state.mudrlantBack);
        if (!atRoot() && !guarded) history.pushState({ mudrlantBack: true }, '');
        else if (atRoot() && guarded && !skipNextPop) {
            skipNextPop = true;
            history.back();
        }
    };
    const goBack = () => {
        if (document.getElementById('fact-overlay')) closeFact();
        else if (document.getElementById('dialog-overlay')) closeDialog();
        else if (document.getElementById('photo-zoom')) closePhotoZoom();
        else if (document.getElementById('place-info')) closePlaceInfo();
        else if (document.getElementById('play-chooser')) closeChooser();
        else if (document.getElementById('settings-overlay')) closeSettings();
        else if (isLoading) return;
        else if (screen === 'round') {
            const fromLearn = mode === 'practice' && (pool.kind === 'collection' || pool.kind === 'mistakes' || pool.kind === 'review');
            if (fromLearn) openLearn(pool.kind === 'mistakes' ? 'mistakes' : pool.kind === 'review' ? 'home' : learn.view);
            else renderHome();
        } else if (screen === 'challenge-done') {
            challengeHome();
        } else if (screen === 'learn') {
            const up = { atlas: 'collection', collection: 'topic', topic: 'home', mistakes: 'home' }[learn.view];
            if (up) openLearn(up);
            else renderHome();
        }
    };
    window.addEventListener('popstate', () => {
        if (skipNextPop) {
            skipNextPop = false;
            syncHistory();
            return;
        }
        goBack();
        syncHistory();
    });
    const historyObserver = new MutationObserver(() => syncHistory());
    historyObserver.observe(appContent, { childList: true });
    historyObserver.observe(document.body, { childList: true });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (document.getElementById('fact-overlay')) closeFact();
        else if (document.getElementById('dialog-overlay')) closeDialog();
        else if (document.getElementById('photo-zoom')) closePhotoZoom();
        else if (document.getElementById('place-info')) closePlaceInfo();
        else if (document.getElementById('play-chooser')) closeChooser();
        else closeSettings();
    });

    // Service worker dřív než první obrazovka – i kdyby spuštění selhalo, aplikace se příště otevře z mezipaměti
    // Nová verze: každé nasazení přinese nový service worker. Když převezme stránku, která už nějaký měla, stránka se jednou
    // obnoví (rozehraná otázka se obnoví z uloženého stavu). Na novou verzi se aplikace ptá i při každém návratu do ní –
    // nainstalovaná aplikace na mobilu nemá tlačítko pro obnovení a z pozadí se jen probudí
    if ('serviceWorker' in navigator && window.isSecureContext) {
        const hadController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || swReloading) return;
            swReloading = true;
            window.location.reload();
        });
        navigator.serviceWorker.register('sw.js').catch(error => console.error(error));
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'push-open') openHomeTabFromPush(String(event.data.tab || ''));
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            checkForUpdate();
            loadVersion();
        });
    }

    // Aplikace nechaná otevřená přes půlnoc (nebo probuzená z pozadí v nový den): nový den = nové dnešní otázky, série a zajímavost
    let shownDay = getDayKey();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || getDayKey() === shownDay) return;
        shownDay = getDayKey();
        dailyFact = null;
        factLoading = loadDailyFact();
        if (screen === 'home') renderHome();
    });

    // ?vyvojar zapne vývojářský režim (zkušební úroveň a odznaky v Nastavení), ?vyvojar=0 ho vypne
    try {
        const devParam = new URLSearchParams(window.location.search).get('vyvojar');
        if (devParam !== null) {
            if (devParam === '0') { devApply('restore'); localStorage.removeItem(DEV_KEY); } else localStorage.setItem(DEV_KEY, '1');
            const params = new URLSearchParams(window.location.search);
            params.delete('vyvojar');
            const query = params.toString();
            window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
        }
    } catch (e) { /* bez úložiště se vývojářský režim nezapne */ }
    migrateFromGeoQuiz();
    loadVersion();
    const pushTab = takeTabParam();
    if (pushTab === 'multi' || pushTab === 'single') writeJson(KEYS.homeTab, pushTab);
    // Po přihlášení nebo odhlášení se otevřené Nastavení překreslí
    if (Auth) {
        const invite = takeInviteCode();
        if (invite) writeJson(KEYS.pendingChallenge, invite);
        Auth.onChange((state) => {
            if (document.getElementById('settings-overlay')) openSettings();
            // Úvod s přihlášením: po přihlášení dál (k variantě nebo domů), po neúspěchu znovu s chybou
            if (document.getElementById('account-welcome') && (Auth.hasSession() || state.error)) showStart();
            if (!state.user) { myProfile = null; myBlocked = null; myAcceptsMix = true; myChallenges = null; myRating = null; incomingList = null; friendRows = null; recentReactions = []; myBlocks = null; resetTournaments(); updateProfileButton(); paintChallenges(); return; }
            // Po přihlášení (i návratu z Googlu) se otevře výzva, na kterou hráč klepl v odkazu
            const pending = readJson(KEYS.pendingChallenge);
            if (pending) {
                try { localStorage.removeItem(KEYS.pendingChallenge); } catch (e) { /* bez úložiště se kód nepamatuje */ }
                openChallenge(pending);
            }
            refreshChallenges();
            if (state.user) flushReports();
        });
        window.addEventListener('online', flushReports);
        Auth.init().then(state => { if (!state.user && invite) openChallenge(invite); });
    }
    gameVariant = readVariant();
    settings = loadSettings();
    applyLook();
    renderIcons(document);
    factLoading = loadDailyFact();
    try {
        showStart();
        welcomeBack();
        announceDeletion();
    } catch (error) {
        console.error(error);
        renderHome();
    }
    // Rozběhnutý tutoriál pokračuje od uloženého kroku, i když se aplikace otevřela rovnou do rozehrané otázky
    if (Tutorial) Tutorial.maybeStart({ ready: factLoading });
})();
