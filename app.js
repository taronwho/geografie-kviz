// Mudrlant – rozhraní kvízu: dnešní otázky témat, trénink, učení, okno s popisem, nastavení a ukládání stavu.
// Téma (topics/*.js) dodá kategorie, znění otázek, obrazovou nápovědu a fakta; všechno ostatní je společné.
(() => {
    'use strict';

    const {
        SATELLITE_TILES, OSM_TILES,
        escapeHtml, plural, isRealPhoto, commonsPhotoUrl, commonsFileUrl, displayName, formatPoints, getDayKey, formatDayKey, createSeededRandom, pickRandom,
        censorName, hideAnswer, buildQuestionTexts, OUT_OF_CONTEXT,
        processWikiText, checkAnswer, normalizeAnswer, filterItems, levelOf, pickItem, sortItems,
        buildItemChoices, cultureLandsFor, findAnswerItem, setCountries, updateMistakes, nameAnswers, pointsFor,
        computeStreak, buildShareText, getTileLayout, shuffle,
        LEVEL_XP, xpForLevel, MAX_LEVEL, LEVEL_TITLES, titleOwlTier,
        BADGES, BADGE_GROUPS, BADGE_BY_ID, earnedBadgeIds, compactBadges, expandBadges, normalizeCounters,
        levelProgress, titleForLevel, nextTitle, answerXp, DAILY_XP, DAILY_ALL_XP, streakXp, MASTERY_STEPS, masteryStars, nextMastery,
        buildHints: CoreBuildHints, planRound
    } = window.MudrlantCore;
    const Visuals = window.MudrlantVisuals;
    // Opakování karet (review.js) a týdenní cíle (goals.js); bez skriptu se jen nezobrazí
    const Review = window.MudrlantReview || null;
    // Tipy od Mudrlanta (tips.js): žárovka u sovy, když má hráč na co upozornit; bez skriptu se jen nezobrazí
    const Tips = window.MudrlantTips || null;
    const Goals = window.MudrlantGoals || null;
    // Mudrlantova kronika (chronicle.js): týden v kostce z denních záznamů v zařízení; bez skriptu se jen nenabídne
    const Chronicle = window.MudrlantChronicle || null;
    // Režimy Bleskovka a Přežití (modes.js) a zvuky s vibracemi (sound.js); bez skriptu se jen nenabídnou, hra zůstane potichu
    const Modes = window.MudrlantModes || null;
    const Sound = window.MudrlantSound || null;
    // Otázka „Ukaž na mapě“ (question-map.js); bez skriptu se hraje bez ní
    const MapQuestion = window.MudrlantMapQuestion || null;
    // Číselné otázky Seřaď a Odhadni číslo (numeric-questions.js); bez skriptu jen nejsou
    const Numeric = window.MudrlantNumeric || null;
    // Zdroj obrázku z Wikimedia Commons (photo-source.js): tlačítko „i“ u obrázků; bez skriptu se jen neukáže
    const PhotoSource = window.MudrlantPhotoSource || null;
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
        tips: 'mudrlant.tips',
        goals: 'mudrlant.goals',
        // 'host' = hráč na úvodu zvolil hraní bez přihlášení, úvod s přihlášením se už neukáže
        account: 'mudrlant.account'
    };
    const STATE_VERSION = 8;
    const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
    // Verze databázového schématu, kterou aplikace potřebuje: zvyšuje se spolu s schema_version() na konci supabase/schema.sql
    // (tests/sql-monitor.test.js hlídá shodu). Správce (dev_admins nebo vývojářský režim) uvidí v Nastavení, že má schéma spustit znovu.
    // 3 = průběh výzev a zápasů turnaje na serveru a XP za výhry v turnaji jednou za účet; 4 = zkušební upozornění přes server (dev_push_test);
    // 5 = okamžité odesílání upozornění (push_kick, dev_push_status; aplikace funguje i se 4, jen ve zkoušce upozornění ukáže obecný text);
    // 6 = Jak odpověděli ostatní (answer_stats_submit, answer_stats_topic, dev_suspicious_questions; se starší databází se statistiky jen neukazují);
    // 7 = Kvíz dne (daily_quiz_*; se starší databází se Kvíz dne hraje jen v zařízení, bez pořadí);
    // 8 = Skupiny (group_*, my_groups, týdenní XP; se starší databází se Skupiny jen nenabídnou);
    // 9 = odměny v účtu (profiles.rewards: Truhla Mudrlanta, ochrana série, diplomy) a nové odznaky (se starší databází zůstanou jen v zařízení);
    // 10 = Rozpis otázek (podrobnosti odpovědí výzvy a zápasu turnaje, challenge_details a tournament_details; se starší databází jen vlastní odpovědi ze zařízení);
    // 17 = zamrzlé otázky (question_snapshot_claim, question_snapshots_get: výzva, turnaj a Kvíz dne mají pro všechny stejné otázky i po změně dat;
    // se starší databází se otázky skládají jen v zařízení jako dřív).
    // 18 = ligové sezóny (league_seasons) a vitrína v profilu (profiles.showcase), odznaky Album sbírky v katalogu odznaků (se starší databází
    // se sezóny a vitrína jen nenabídnou, odznaky alba zůstanou v zařízení a album je spočítá znovu).
    // 19 = Tajemná otázka dne (mystery_*), odznaky Detektiv; 20 = nápovědy Tajemné otázky přes celý den (poslední ve 20:00).
    const REQUIRED_SCHEMA = 20;
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
            tier: TIERS[saved.tier] ? saved.tier : 'known',
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
    // Úrovně obtížnosti se sčítají: Mudrlant obsahuje i základní otázky, Expert všechny (quiz-core filterItems)
    const TIERS = {
        known: { title: 'Základní', short: 'Základní', text: 'Hlavní města, slavné osobnosti, běžná zvířata…' },
        all: { title: 'Mudrlant', short: 'Mudrlant', text: 'I méně známé věci – pro zvídavé' },
        expert: { title: 'Mudrlant Expert', short: 'Expert', text: 'Všechno včetně perliček pro fajnšmekry' }
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

    // Po zavření okna se fokus vrátí na prvek, který ho otevřel (Ukaž …, Sdílet, dlaždice); jinak by klávesnice i čtečka
    // obrazovky skončily na začátku stránky. Když zavření samo něco zaměří nebo otvírač zmizel, nechá se to být.
    let focusBeforeOverlay = null;
    document.addEventListener('focusin', (event) => {
        if (!(event.target.closest && event.target.closest('[aria-modal="true"]'))) focusBeforeOverlay = event.target;
    });
    new MutationObserver((records) => {
        const closed = records.some(record => [...record.removedNodes].some(node => node.nodeType === 1 && node.getAttribute('aria-modal') === 'true'));
        if (!closed || document.querySelector('body > [aria-modal="true"]')) return;
        if (document.activeElement && document.activeElement !== document.body) return;
        if (focusBeforeOverlay && focusBeforeOverlay.isConnected) focusBeforeOverlay.focus({ preventScroll: true });
    }).observe(document.body, { childList: true });

    const showToast = (message) => {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.setAttribute('role', 'status');
            // Nad přilepeným tlačítkem Další a bez zachytávání klepnutí, ať ho nezakryje; nad okny (Nastavení), ať je hláška vidět i v nich
            toast.className = 'pointer-events-none fixed bottom-24 left-1/2 z-[70] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white opacity-0 shadow-lg transition-opacity duration-300 dark:bg-white dark:text-slate-900';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        // V otevřeném okně (Nastavení, dialog) nahoře, ať nezakryje řádek, u kterého se výsledek právě ukázal
        const inWindow = Boolean(document.getElementById('settings-overlay') || document.getElementById('dialog-overlay'));
        toast.classList.toggle('bottom-24', !inWindow);
        toast.classList.toggle('top-4', inWindow);
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
    // Slepé mapy otázky „Ukaž na mapě“ (data/mapa.json), načtou se s první takovou otázkou
    // s obrysy plošných míst (data/mapa-tvary.json); bez nich se plochy počítají jako bod s poloměrem
    // a opravy z kontroly mapy (data/mapa-opravy.json: místa, která se na mapě neptají, a opravené polohy)
    const loadMapData = memoizeBy(() => Promise.all([fetchJson('data/mapa.json'), fetchJson('data/mapa-tvary.json').catch(() => ({ shapes: {} })), fetchJson('data/mapa-opravy.json').catch(() => ({}))])
        .then(([map, shapes, fixes]) => ({ ...map, shapes: shapes.shapes || {}, skip: fixes.skip || {}, points: fixes.points || {} })));
    // Slepé mapy regionů (kraje, spolkové země, státy USA… – data/regiony.json), načtou se s první mapou regionu nebo města
    const loadRegions = memoizeBy(() => fetchJson('data/regiony.json'));
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
        refreshAnswerStats(topicId);
        return ctx;
    });
    const visualDeps = { loadWorld: () => loadWorld(), loadRegions: () => loadRegions() };

    // Úvod článku z české Wikipedie; bez spojení aspoň krátký popis z Wikidat, ať jde hrát dál.
    // Úspěšně stažené úvody si pamatujeme, ať se atlas a okno s popisem neptají Wikipedie znovu.
    const itemTexts = new Map();
    // Když Wikipedie neodpověděla (bez internetu, zaseknutá), chvíli se na ni neptáme: další otázka (i náhradní za chudý popis)
    // by jinak na každý popis čekala dva pokusy po 6 s a jedna otázka by se načítala skoro minutu
    const WIKI_PAUSE = 60000;
    let wikiFailedAt = 0;
    const wikiPaused = () => Date.now() - wikiFailedAt < WIKI_PAUSE;
    const fetchItemText = async (item) => {
        if (itemTexts.has(item.t)) return itemTexts.get(item.t);
        if (!wikiPaused()) try {
            // Zaseknutá Wikipedie nesmí zdržet otázku dlouho: dva pokusy po 6 s, pak krátký popis z Wikidat
            const data = await fetchJson(`${WIKI_API}&action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&redirects=1&titles=${encodeURIComponent(item.t)}`, 2, WIKI_TIMEOUT);
            const page = Object.values((data.query && data.query.pages) || {})[0];
            if (page && page.extract && page.extract.length > 40) {
                const text = processWikiText(page.extract);
                itemTexts.set(item.t, text);
                return text;
            }
        } catch (e) {
            if (e instanceof NetworkError) wikiFailedAt = Date.now();
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

    // Nápovědy otázky sestaví jádro (quiz-core.js: planRound a buildHints) stejně pro hru i audit: nápověda, která nic
    // nepřidá (k otázce, štítku, možnostem a dřívějším nápovědám), se vynechá. Tady se jen doplní, které obrazové nápovědy
    // umí aplikace vykreslit (Visuals.info).
    const describeVisual = (spec) => Visuals.info(spec);
    const buildHints = (plan, options) => CoreBuildHints(plan, { photoMasks, describeVisual, ...options });
    // Otázka uložená starší verzí má nápovědy jen jako názvy kroků ('photo', 'visual', 'facts')
    const upgradeRoundData = (data) => {
        if (data && Array.isArray(data.hints) && data.hints.some(step => typeof step === 'string')) {
            data.hints = buildHints(data.hints.map(step => step === 'visual' ? { kind: 'visual', spec: data.visual } : step === 'facts' ? { kind: 'facts', facts: data.facts } : { kind: step }),
                { photoUrl: data.photoUrl, visibleText: '' });
        }
        return data;
    };

    // Data jedné otázky – vše, co se uloží a po obnovení stránky zobrazí znovu
    const MAX_THIN_RETRIES = 3;
    // Otázka „Ukaž na mapě“ (question-map.js): v tréninku asi každá osmá vhodná otázka (počítadlo v zařízení), ve výzvě a zápasu turnaje
    // asi desetina vhodných otázek podle semínka otázky (výběr výzvy: challengePicker, options.map), a jen ve hrách, které to nesou
    // (MapQuestion.seedAllowsMaps, tournamentAllowsMaps). Dnešní otázky a Kvíz dne ji nemají, chyby a opakování také ne. Los nebere z rng otázky.
    // Témata s otázkami na mapě (question-map.js KINDS); režim Ukaž na mapě dává jen je a otázku na mapě pokaždé
    const MAP_TOPICS = MapQuestion ? MapQuestion.MAP_TOPICS : [];
    const mapQuestionFor = (item, ctx, options = {}) => !MapQuestion ? null
        : mode === 'challenge' ? (options.map ? loadMapData().then(map => MapQuestion.multiplayerQuestion(item, ctx, map)).catch(() => null) : null)
        : mode === 'practice' && pool.kind === 'map' ? loadMapData().then(map => MapQuestion.buildQuestion(item, ctx, map)).catch(() => null)
        : mode !== 'practice' || pool.kind === 'mistakes' || pool.kind === 'review' ? null
        : MapQuestion.nextQuestion(item, ctx, { storage: { read: () => readJson(MapQuestion.GAP_KEY), write: (value) => writeJson(MapQuestion.GAP_KEY, value) }, loadMap: loadMapData });
    // options.map = výzva (zápas turnaje) určila podle semínka, že otázka má být na mapě (když na ni položka jde)
    const createRoundData = async (item, ctx, rng, options = {}) => {
        const { topic, items } = ctx;
        // Pořadí volání rng je stálé, aby dnešní otázka vyšla všem stejně
        // options.plain = vždy základní otázka „Co je to?“ bez mapy a zvláštních druhů (Tajemná otázka dne, mystery.js)
        const special = options.plain ? null : (await mapQuestionFor(item, ctx, options)) || (topic.specialQuestion ? topic.specialQuestion(item, ctx, rng) : null);
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
        const { text, questionText, moreText, origin } = buildQuestionTexts(item, ctx, question, fetchedText, { special: Boolean(special) });
        const settled = await Promise.race([photoProbe.then(result => ({ result })), new Promise(resolve => setTimeout(() => resolve(null), PHOTO_WAIT))]);
        const photoUrl = settled ? settled.result : photoOf(item, 960);
        // Typ položky („obec ve Španělsku“, „král“) nesmí prozradit odpověď
        const typeLabel = item.ty && !hideAnswer(item.ty, question, { ...item, ty: '' }, ctx).includes('[***]') ? item.ty : category.one;
        // Nápovědy, fakta ukázaná hned u chudého popisu a „thin“ (popis nestačí k odpovědi) – společně s auditem
        const { hints, leadFacts, thin, visual } = planRound({ item, ctx, question, texts: { questionText, moreText, origin }, typeLabel, shown, special: Boolean(special),
            photoUrl, describeVisual, photoMasks, textPhotos: ctx.textPhotos || new Set() });
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
                    <img src="icons/topics/sova-premysleni.webp" alt="" class="mx-auto mb-3 h-36 w-36 object-contain drop-shadow-lg [@media(max-height:700px)]:h-28 [@media(max-height:700px)]:w-28">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-slate-50">Vítej v Mudrlantovi</h2>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Kvíz ze zeměpisu a dalších oborů. Jak chceš odpovídat? Změníš to kdykoli v nastavení vpravo nahoře.</p>
                </div>
                <div id="variant-welcome" class="flex flex-col gap-3">${renderVariantCards(null)}</div>
                <p class="mt-2 text-center text-xs text-slate-500 dark:text-slate-400"><a href="soukromi.html" class="inline-block rounded-lg px-1.5 py-3 font-bold underline underline-offset-2">Ochrana osobních údajů</a> · <a href="licence.html" class="inline-block rounded-lg px-1.5 py-3 font-bold underline underline-offset-2">Zdroje a licence</a></p>
            </div>`;
        renderIcons(appContent);
        updateControlsUI();
    };

    const SETTINGS_HEADING = 'text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const TOGGLE_ON = 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100';
    const TOGGLE_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-600';

    // Známost otázek (Nastavení i výběr tématu); brief = krátký popis na jeden řádek (Nastavení), jinak příklady z tématu
    const TIER_BRIEF = { known: 'Zná většina lidí', all: 'I méně známé', expert: 'I perličky' };
    // Obtížnost výzvy (1–3) a její úroveň; starší výzvy mají jen include_hard / hard (I těžší = Mudrlant)
    const LEVEL_TIERS = { 1: { key: 'known', ...TIERS.known }, 2: { key: 'all', ...TIERS.all }, 3: { key: 'expert', ...TIERS.expert } };
    const challengeLevel = (def) => {
        const level = Number(def && def.level);
        if ([1, 2, 3].includes(level)) return level;
        return def && (def.hard === true || def.include_hard === true) ? 2 : 1;
    };
    // tight = na nízkém displeji (short:) jen krátký název, popis zůstane v title a na vyšším displeji
    // narrow = na telefonu (do 400 px šířky) krátký název („Expert“ místo „Mudrlant Expert“ na dva řádky; celý je v popisku)
    // U brief je v title celý popis (u tématu jeho příklady), takže se neztratí ani v kompaktním okně Co hrát
    const renderTierButtons = (on = TOGGLE_ON, topic = null, brief = false, tight = false, narrow = false) => Object.entries(TIERS).map(([key, tier]) => {
        const raw = key === 'known' && topic && topic.words && topic.words.tierKnown ? topic.words.tierKnown : tier.text;
        const text = escapeHtml(raw);
        // Celý název schovaný tam, kde se ukáže krátký (třídy vypsané celé kvůli Tailwindu)
        const hideFull = tight && narrow ? 'short:hidden max-[400px]:hidden' : tight ? 'short:hidden' : 'max-[400px]:hidden';
        const showShort = tight && narrow ? 'short:inline max-[400px]:inline' : tight ? 'short:inline' : 'max-[400px]:inline';
        const name = (tight || narrow) && tier.short !== tier.title ? `<span class="${hideFull}">${tier.title}</span><span class="hidden ${showShort}" aria-label="${tier.title}">${tier.short}</span>` : tier.title;
        return `
        <button type="button" data-tier="${key}" aria-pressed="${settings.tier === key}"${brief ? ` title="${escapeHtml(`${tier.title}: ${raw}`)}"` : tight ? ` title="${text}"` : ''} class="rounded-2xl border-2 px-2.5 py-2 text-left transition-colors active:scale-[0.98] ${tight ? 'short:min-h-[2.75rem] short:py-1.5 ' : narrow ? 'short:min-h-[2.5rem] short:py-1 ' : ''}${settings.tier === key ? on : TOGGLE_OFF}">
            <span class="block text-sm font-black leading-tight">${name}</span>
            <span class="mt-0.5 block text-[11px] font-semibold leading-snug opacity-90${brief || tight ? ' short:hidden' : ''}">${brief ? TIER_BRIEF[key] : text}</span>
        </button>`;
    }).join('');

    const closeSettings = () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.remove();
        meDraft = null;
        meDirty = false;
        meNote = '';
        pushNote = null;
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
    // „Odemknout úplně vše“: příznak v zařízení; platí jen se zkušebním postupem (záloha DEV_BACKUP), zruší ho Vrátit můj postup
    const DEV_ALL = 'mudrlant.dev.all';
    // Zkušební odměny (truhly, sezóna) se zálohují jako postup a XP sezóny se ve zkušebním postupu dá přidat (DEV_SEASON_XP)
    const DEV_REWARDS_BACKUP = 'mudrlant.dev.rewardsBackup';
    const DEV_SEASON_XP = 'mudrlant.dev.seasonXp';
    const DEV_LEARNED_BACKUP = 'mudrlant.dev.backup.learned';
    const devOn = () => { try { return localStorage.getItem(DEV_KEY) === '1'; } catch (e) { return false; } };
    const devActive = () => { try { return localStorage.getItem(DEV_BACKUP) !== null; } catch (e) { return false; } };
    const devApply = (kind) => {
        try {
            if (kind === 'restore') {
                localStorage.removeItem(DEV_ALL);
                localStorage.removeItem(DEV_SEASON_XP);
                // Odměny jako před zkušebním postupem (truhly a stupně sezóny otevřené na zkoušku zmizí)
                const rewardsBackup = localStorage.getItem(DEV_REWARDS_BACKUP);
                if (rewardsBackup !== null && Rewards) {
                    if (rewardsBackup === 'null') localStorage.removeItem(Rewards.KEY); else localStorage.setItem(Rewards.KEY, rewardsBackup);
                    localStorage.removeItem(DEV_REWARDS_BACKUP);
                    if (Look) Look.setGifts(Rewards.gifts(loadRewards()));
                    applyLook();
                }
                if (Look && Look.setDevUnlockAll) Look.setDevUnlockAll(false);
                const backup = localStorage.getItem(DEV_BACKUP);
                if (backup !== null) { if (backup === 'null') localStorage.removeItem(KEYS.progress); else localStorage.setItem(KEYS.progress, backup); localStorage.removeItem(DEV_BACKUP); }
                // Poznané položky se vrátí také (vývojářské „Vše“ je přepisuje); bez zálohy se vymyšlené jen odstraní
                const learnedBackup = localStorage.getItem(DEV_LEARNED_BACKUP);
                if (learnedBackup !== null) { if (learnedBackup === 'null') localStorage.removeItem(KEYS.learned); else localStorage.setItem(KEYS.learned, learnedBackup); localStorage.removeItem(DEV_LEARNED_BACKUP); }
                else writeJson(KEYS.learned, loadLearned());
                return;
            }
            if (localStorage.getItem(DEV_BACKUP) === null) { localStorage.setItem(DEV_BACKUP, localStorage.getItem(KEYS.progress) ?? 'null'); localStorage.setItem(DEV_LEARNED_BACKUP, localStorage.getItem(KEYS.learned) ?? 'null'); }
            if (Rewards && localStorage.getItem(DEV_REWARDS_BACKUP) === null) localStorage.setItem(DEV_REWARDS_BACKUP, localStorage.getItem(Rewards.KEY) ?? 'null');
            // Truhla Mudrlanta na zkoušku: připravená truhla v den, který ještě žádnou nemá (otevře ji app.js hned po tlačítku)
            if (kind === 'chest' && Rewards) {
                let state = loadRewards();
                const day = new Date(`${getDayKey()}T12:00:00Z`);
                for (let i = 0; i < 4000; i++) {
                    const key = day.toISOString().slice(0, 10);
                    if (!state.chests[key] && !state.ready.includes(key)) { state = Rewards.addChest(state, key); break; }
                    day.setUTCDate(day.getUTCDate() + 1);
                }
                saveRewards(state);
                return;
            }
            // Sezóna na zkoušku: XP sezóny navíc, aby byly dosažené všechny stupně (vyzvednou se v okně sezóny)
            if (kind === 'season') {
                localStorage.setItem(DEV_SEASON_XP, String(Season ? Season.THRESHOLDS[Season.THRESHOLDS.length - 1] : 0));
                return;
            }
            const progress = loadProgress();
            const today = getDayKey();
            const allBadges = () => Object.fromEntries(BADGES.map(badge => [badge.id, today]));
            const topics = Object.fromEntries(TOPICS.map(topic => [topic.id, 400]));
            if (kind === 'all') {
                // Úroveň 100, všechny odznaky a hvězdičky jako „Vše“ a k tomu odemčené i věci za diplomy, sezóny, ligy a z truhel
                // (jen v tomto zařízení; účet se se zkušebním postupem nesynchronizuje)
                localStorage.setItem(DEV_ALL, '1');
                if (Look && Look.setDevUnlockAll) Look.setDevUnlockAll(true);
            }
            if (kind === 'max' || kind === 'all') {
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
            } else if (kind === 'tour-play') {
                if (!running) throw new Error('Žádný turnaj neběží.');
                const played = await Social.devTournament('dev_tournament_bots_play', { tid: running.id });
                resetTournaments();
                message = Number(played) ? `Boti odehráli zápasů: ${Number(played)}` : 'Boti už mají kolo odehrané';
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
    // Verze schématu v databázi z poslední kontroly (pro vývojářský panel): undefined = zatím nezjištěno, null = databáze funkci nemá
    let schemaHave;
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
            schemaHave = have;
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
            ${Social ? `<p data-dev-schema class="mb-1.5 text-[11px] font-semibold leading-snug ${schemaHave === REQUIRED_SCHEMA ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}">Databáze: ${schemaHave === undefined ? 'verze schématu zatím nezjištěna' : schemaHave === null ? 'schéma bez verze (starší než 1)' : `schéma ${schemaHave}`} · aplikace potřebuje ${REQUIRED_SCHEMA}${schemaHave === REQUIRED_SCHEMA ? ' ✓' : schemaHave === undefined ? '' : schemaHave > REQUIRED_SCHEMA ? ' – aplikace je starší, obnov ji' : ' – spusť supabase/schema.sql'}</p>` : ''}
            <div class="flex flex-wrap gap-1">${[['all', 'Odemknout úplně vše'], ['chest', 'Otevřít Truhlu Mudrlanta'], ['season', 'Sezóna: všech 20 stupňů'], ['max', 'Vše (úr. 100)'], ['level:10', 'Úr. 10'], ['level:25', 'Úr. 25'], ['level:50', 'Úr. 50'], ['level:75', 'Úr. 75'], ['badges', 'Všechny odznaky'], ['nobadges', 'Žádné odznaky'], ['nostars', 'Vymazat hvězdičky'], ['bulb', 'Vrátit žárovku'], ['tips', 'Obnovit tipy']].map(([kind, label]) => `<button type="button" data-dev="${kind}" class="rounded-lg bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 active:scale-95 dark:bg-slate-700 dark:text-slate-200">${label}</button>`).join('')}${devActive() ? '<button type="button" data-dev="restore" class="rounded-lg bg-amber-700 px-2 py-1 text-[11px] font-black text-white active:scale-95">Vrátit můj postup</button>' : ''}</div>
            ${Social ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Turnaj (boti)</p>
            <div class="flex flex-wrap gap-1">${[['tour-bots', '+31 botů'], ['tour-start', 'Spustit hned'], ['tour-play', 'Boti odehrají kolo'], ['tour-next', 'Další kolo'], ['tour-reset', 'Smazat odehraný turnaj'], ['tour-clear', 'Smazat boty']].map(([kind, label]) => `<button type="button" data-dev="${kind}" class="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-900 active:scale-95 dark:bg-emerald-900/50 dark:text-emerald-100">${label}</button>`).join('')}</div>
            <p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Provoz</p>
            <div class="flex flex-wrap gap-1"><button type="button" data-dev="errors" class="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-900 active:scale-95 dark:bg-rose-900/50 dark:text-rose-100">Chyby z provozu</button></div>` : ''}
            ${Push ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Upozornění</p>
            <div class="flex flex-wrap gap-1">${[['push-diag', 'Diagnostika upozornění'], ['push-local', 'Zkusit upozornění v tomto zařízení'], ...(Social ? [['push-server', 'Poslat zkušební upozornění přes server']] : [])].map(([kind, label]) => `<button type="button" data-dev="${kind}" class="rounded-lg bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-900 active:scale-95 dark:bg-sky-900/50 dark:text-sky-100">${label}</button>`).join('')}</div>` : ''}
            ${Social ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Hlášení otázek</p>
            <div class="flex flex-wrap gap-1"><button type="button" data-dev="reports" class="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-900 active:scale-95 dark:bg-emerald-900/50 dark:text-emerald-100">Seznam hlášení</button><button type="button" data-dev="suspicious" class="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900 active:scale-95 dark:bg-amber-900/50 dark:text-amber-100">Podezřelé otázky</button></div>` : ''}
            ${Social ? `<p class="mb-1 mt-2 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Moderace</p>
            <div class="flex flex-wrap gap-1"><button type="button" data-dev="player-reports" class="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-900 active:scale-95 dark:bg-rose-900/50 dark:text-rose-100">Nahlášení hráči</button></div>` : ''}
        </div>`;
    const ME_HEADING = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
    const VARIANT_BRIEF = { choices: { short: 'Možnosti', text: '4 možnosti, až 4 body' }, typed: { short: 'Psaní', text: 'Těžší, 2× víc bodů' } };
    const renderVariantCompact = (selected) => Object.entries(VARIANTS).map(([key, variant]) => `
        <button type="button" data-variant="${key}" aria-pressed="${selected === key}" title="${escapeHtml(variant.text)}" class="btn-3d-light flex min-w-0 flex-col items-start gap-0.5 rounded-2xl px-2.5 py-2 text-left short:py-1.5 ${selected === key ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-900/40' : 'bg-white dark:bg-slate-800'}">
            <span class="flex items-center gap-1.5"><span class="rounded-md bg-brand-100 p-1 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"><i data-lucide="${variant.icon}" class="h-4 w-4"></i></span><span class="text-sm font-black leading-tight text-slate-800 dark:text-slate-100">${VARIANT_BRIEF[key].short}</span></span>
            <span class="text-[11px] font-semibold leading-snug text-slate-500 short:hidden dark:text-slate-400">${VARIANT_BRIEF[key].text}</span>
        </button>`).join('');
    // Řádek nastavení v kartě Hra: ikona, název, krátké vysvětlení a vpravo přepínač (on = true/false) nebo šipka (on = null).
    // Na nízkém displeji (360×640) je řádek 40 px a vysvětlení se schová (stav ukazuje přepínač), ať se karta vejde bez posouvání.
    const SETTING_ROW = 'flex min-h-[2.75rem] w-full items-center gap-3 px-3 py-1.5 text-left transition-colors active:bg-slate-50 disabled:opacity-60 short:min-h-[2.5rem] short:py-1 dark:active:bg-slate-700/40';
    // Poloviční buňka (dva přepínače v řádku: Zvuky a Vibrace, Turnaje a Výzvy): menší mezery, ať se název vejde i na 360 px
    const SETTING_HALF = SETTING_ROW.replace('gap-3 px-3', 'gap-2 px-2.5');
    const switchMark = (on) => `<span aria-hidden="true" class="flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 ${on ? 'justify-end bg-brand-600' : 'justify-start bg-slate-300 dark:bg-slate-600'}"><span class="h-5 w-5 rounded-full bg-white shadow-sm"></span></span>`;
    const settingRow = ({ attrs, icon, title, text = '', on = null }) => `
        <button type="button" ${attrs}${on === null ? '' : ` role="switch" aria-checked="${on}"`} class="${SETTING_ROW}">
            <i data-lucide="${icon}" class="h-5 w-5 shrink-0 ${on === false ? 'text-slate-500 dark:text-slate-400' : 'text-brand-700 dark:text-brand-300'}"></i>
            <span class="min-w-0 flex-1"><span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${title}</span>${text ? `<span class="mt-0.5 block text-[11px] font-semibold leading-snug text-slate-500 short:hidden dark:text-slate-400">${text}</span>` : ''}</span>
            ${on === null ? '<i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"></i>' : switchMark(on)}
        </button>`;
    // Zvuky a vibrace (sound.js): dva přepínače vedle sebe v jednom řádku karty Hra, ať se karta vejde bez posouvání;
    // Vibrace jen tam, kde je prohlížeč umí (iPhone ne)
    const soundRows = () => {
        if (!Sound) return '';
        const prefs = Sound.prefs();
        const vibration = Sound.canVibrate();
        const cell = (attrs, icon, title, on) => `
            <button type="button" ${attrs} role="switch" aria-checked="${on}" class="${SETTING_HALF}">
                <i data-lucide="${icon}" class="h-5 w-5 shrink-0 ${on ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}"></i>
                <span class="min-w-0 flex-1 text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${title}</span>
                ${switchMark(on)}
            </button>`;
        return `<div data-sound-row class="grid ${vibration ? 'grid-cols-2 divide-x divide-slate-100 dark:divide-slate-700/70' : ''}">${cell('data-sound-toggle', prefs.sound ? 'volume-2' : 'volume-x', 'Zvuky', prefs.sound)}${vibration ? cell('data-vibration-toggle', 'vibrate', 'Vibrace', prefs.vibration) : ''}</div>`;
    };
    // --- Vzhled: odměny (barevná témata, barva obleku sovy, rámečky, obrázky, titul) – části dodávají look-*.js přes MudrlantLook ---
    const Look = window.MudrlantLook;
    // Odemčení všeho platí po novém spuštění dál, dokud hráč nevrátí svůj postup (bez zkušebního postupu se nezapne)
    try { if (Look && Look.setDevUnlockAll && devOn() && devActive() && localStorage.getItem(DEV_ALL) === '1') Look.setDevUnlockAll(true); } catch (e) { /* bez úložiště nic */ }
    const Tutorial = window.MudrlantTutorial;
    const Owl = window.MudrlantOwl;
    // Logo sovy s vybranými doplňky (bez modulu jen obrázek)
    const owlLogo = (wrapClass, imgClass) => Owl ? Owl.logoHtml(wrapClass, imgClass) : `<img src="icons/logo.webp" alt="" class="${wrapClass} ${imgClass}">`;
    const lookContext = () => {
        // Věci z truhly a diplomy témat (odemykají legendární postavičky) ze stavu odměn v zařízení
        const rewards = window.MudrlantRewards ? window.MudrlantRewards.parse(readJson(window.MudrlantRewards.KEY)) : null;
        if (Look && rewards) Look.setGifts(rewards.gifts);
        // Rámečky ligových sezón: nejlepší liga skončené sezóny zapamatovaná v zařízení (league-seasons.js, platí i bez připojení)
        if (Look && Look.setLeagueBest && window.MudrlantLeagueSeasons) Look.setLeagueBest(window.MudrlantLeagueSeasons.cachedBest(readJson(window.MudrlantLeagueSeasons.KEY)));
        const progress = loadProgress();
        const user = Auth && Auth.isConfigured() && Social ? signedUser() : null;
        const level = levelProgress(progress.xp).level;
        const diplomas = rewards ? rewards.diplomas : {};
        return { level, badges: progress.badges, diplomas, user, profile: user ? myProfile : null, avatarHtml, prefs: Look ? Look.prefs({ level, badges: progress.badges, diplomas }) : {} };
    };
    // Titul u mého jména podle volby ve Vzhledu: úroveň a její titul (výchozí), nic, nebo název získaného odznaku
    const ownTitleText = (level) => {
        const pick = Look ? Look.prefs(lookContext()).title : 'level';
        if (pick === 'none') return 'Můj postup';
        if (pick && pick !== 'level' && BADGE_BY_ID[pick]) return BADGE_BY_ID[pick].title;
        if (pick && Look && Look.titleItem && Look.titleItem(pick)) return Look.titleItem(pick).title;
        return `Úr. ${level} · ${titleForLevel(level)}`;
    };
    const applyLook = () => { if (Look) Look.apply(lookContext()); };
    // Kde v Nastavení se odměna vybírá (oslava nové odměny, truhla): „Nastavení → Mudrlant“; Profil mají jen přihlášení
    const rewardPlace = (category) => !Look ? 'Nastavení' : `${Look.settingsPlace(category)}${Look.settingsTab(category) === 'profile' && !signedUser() ? ' (po přihlášení)' : ''}`;
    // Části vzhledu jedné záložky Nastavení (look-*.js, vlastnost tab): ve Hře barevné téma, v Profilu rámeček a titul u jména,
    // u Mudrlanta doplňky a barva obleku. card: false = bez bílé karty (řádek mezi ostatními volbami), bleed = o 4 px širší
    // (osm kuliček barevných témat v řadě se tak i na 360 px vejde po 40 px). Nadpis si část kreslí sama (noTitle), nebo ho dostane tady.
    const lookSections = (tab, ctx = lookContext()) => !Look ? '' : Look.getSections().filter(section => (section.tab || 'owl') === tab).map(section => `
            <section data-look="${section.id}" class="min-w-0 ${section.bleed ? '-mx-1 ' : ''}${section.card === false ? '' : `rounded-2xl bg-white ${section.tight ? 'px-1.5 py-2' : 'px-2.5 py-2'} shadow-sm dark:bg-slate-800`}">
                ${section.noTitle ? '' : `<h3 class="${ME_HEADING} mb-1${section.tight ? ' px-1' : ''}">${escapeHtml(section.title)}</h3>`}
                ${section.render(ctx)}
            </section>`).join('');
    // Záložka Mudrlant: moje sova s doplňky jako profilový obrázek jedním klepnutím (jinak v Profilu → Mudrlant);
    // když už jí je, řekne to – další změny doplňků a barvy se do profilu uloží samy
    let owlAvatarBusy = false;
    const owlAvatarRow = (user) => {
        if (!user || !Social || !Owl || !meDraft) return '';
        if (myProfile && myProfile.owl && !myPose()) {
            return `<p data-owl-avatar-on class="mt-2 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-[13px] font-bold leading-snug text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"><i data-lucide="check" class="h-4 w-4 shrink-0"></i>Tvůj Mudrlant je profilový obrázek. Změny se v profilu ukážou samy.</p>`;
        }
        return `<button type="button" data-owl-as-avatar ${owlAvatarBusy ? 'disabled' : ''} class="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-4 py-2.5 text-[15px] font-black text-white disabled:opacity-60 short:py-2"><i data-lucide="user-round" class="h-5 w-5"></i>${owlAvatarBusy ? 'Ukládám…' : 'Použít jako profilový obrázek'}</button>`;
    };
    const useOwlAsAvatar = async () => {
        if (!meDraft || owlAvatarBusy) return;
        meDraft.owl = true;
        meDraft.avatar = '🦉';
        meDraft.pose = null;
        meDirty = true;
        owlAvatarBusy = true;
        openSettings('', '[data-owl-as-avatar]');
        try { await saveMeProfile(); } finally { owlAvatarBusy = false; }
        if (document.getElementById('settings-overlay')) openSettings(meNote, '[data-owl-avatar-on], [data-owl-as-avatar]');
    };
    // Zamčený obrázek hráče (postavička nebo emoji za odměnu): položka katalogu, nebo null, když je k dispozici (základní, odemčený,
    // nebo už uložený v profilu – i jako staré emoji, které postavička nahradila)
    const avatarUnlockText = (item) => (item.exclusive || item.diploma) && Look ? Look.unlockText(item) : item.badge ? `Odznak: ${(BADGE_BY_ID[item.badge] || {}).title || item.badge}` : `Úroveň ${item.level}`;
    const avatarLock = (value) => {
        const item = Look && Look.avatarItem ? Look.avatarItem(value) : null;
        if (!item || Social.AVATARS.includes(value) || (myProfile && Look.avatarItem(myProfile.avatar) === item) || Look.isUnlocked(item, lookContext())) return null;
        return item;
    };
    // Sovy titulů (icons/topics/sova-titul-<n>.webp): ilustrace stupně titulu podle úrovně; barvu obleku jí dá look-robes.js
    const titleOwlPose = (level) => `titul-${titleOwlTier(level)}`;
    const titleOwlArt = (level) => `sova-${titleOwlPose(level)}`;
    // Tituly jednoho stupně sovy (např. Učeň, Žák)
    const tierTitles = (tier) => LEVEL_TITLES.filter(entry => titleOwlTier(entry.from) === tier).map(entry => entry.title);
    // Moje zvolená sova titulu omezená na dosaženou úroveň (null = sova s doplňky)
    const myPose = () => { const ctx = lookContext(); return Owl && Look ? Owl.allowedPose(ctx.prefs.pose, ctx.level) : null; };
    // Štítek na zamčené dlaždici obrázku: od které úrovně, nebo medaile (odemyká se odznakem; který, řekne popisek a klepnutí),
    // u legendární postavičky čepice absolventa (odemyká ji diplom tématu)
    const LOCK_PILL = 'absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center whitespace-nowrap rounded-full bg-white px-1 text-[9px] font-black leading-[0.75rem] text-slate-700 dark:bg-slate-900 dark:text-slate-200';
    const lockPill = (item) => `<span class="${LOCK_PILL}">${item.diploma ? '<i data-lucide="graduation-cap" class="my-px h-2.5 w-2.5"></i>' : item.badge ? '<i data-lucide="medal" class="my-px h-2.5 w-2.5"></i>' : `úr.&nbsp;${item.level}`}</span>`;
    // Dlaždice sov titulů v Profilu → Mudrlant (hned za „Moje sova“): sova v mé barvě obleku, oříznutá do kolečka jako v profilovce;
    // dosažené jdou vybrat, vyšší jsou zašedlé s úrovní, od které se odemknou, a klepnutí jen řekne, kdy to bude
    const poseTiles = () => {
        if (!Owl || !Owl.poseHtml || !Look || !meDraft) return '';
        const ctx = lookContext();
        return Look.POSES.map(pose => {
            const titles = tierTitles(pose.tier);
            const label = `Sova titulu ${titles[0]}${titles.length > 1 ? ` (${titles.join(', ')})` : ''}`;
            const art = Owl.poseHtml(pose.id, ctx.prefs.robe);
            if (ctx.level < pose.level) {
                return `<button type="button" data-locked-owl="${pose.id}" aria-disabled="true" aria-label="${escapeHtml(`${label} je zamčená: od úrovně ${pose.level}`)}" title="${escapeHtml(`${label}: od úrovně ${pose.level}`)}" class="${AVATAR_TILE} ${AVATAR_OFF} relative">`
                    + `<span class="block h-full w-full opacity-40 grayscale">${art}</span>${lockPill(pose)}</button>`;
            }
            const on = Boolean(meDraft.owl && meDraft.pose === pose.id);
            return `<button type="button" data-pick-owl="${pose.id}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${on}" class="${AVATAR_TILE} ${on ? AVATAR_ON : AVATAR_OFF}">${art}</button>`;
        }).join('');
    };
    // --- Profil → profilový obrázek: čtyři skupiny (Mudrlant = moje sova a sovy titulů, Postavičky = odměny, Legendy = legendární postavičky
    // za diplomy témat, Zvířátka = základní emoji zdarma) a pod nimi jedna řada barev: pozadí, nebo vybraná část postavičky (čipy nad řadou
    // říkají, co se přebarvuje). Legendy mají vlastní skupinu: 14 dlaždic jsou dvě řady, Postavičky tak zůstanou na třech řadách ---
    const PICTURE_GROUPS = [['mudrlant', 'Mudrlant'], ['postavicky', 'Postavičky'], ['legendy', 'Legendy'], ['zviratka', 'Zvířátka']];
    let pictureGroup = null; // otevřená skupina; null = ta, ve které je vybraný obrázek
    let colorTarget = 'bg'; // co řada barev přebarvuje: 'bg' (pozadí) nebo číslo části postavičky (1, 2)
    let hueOpen = false; // místo barev pozadí je vidět posuvník všech odstínů
    const pictureGroups = () => PICTURE_GROUPS.filter(([id]) => id !== 'mudrlant' || Boolean(Owl && Owl.owlAvatarHtml));
    const pictureGroupOf = (draft) => {
        if (draft.owl && Owl && Owl.owlAvatarHtml) return 'mudrlant';
        const item = !Social.AVATARS.includes(draft.avatar) && Look && Look.avatarItem ? Look.avatarItem(draft.avatar) : null;
        return !item ? 'zviratka' : item.diploma ? 'legendy' : 'postavicky';
    };
    // Dlaždice postavičky (vybraná v barvách z rozpracované volby) nebo odměny, která zatím obrázek nemá (emoji).
    // Odemčená legendární postavička má zlatý lem (LEGEND_OFF), zamčená je šedá jako ostatní
    const characterTile = (item) => {
        const chosen = !meDraft.owl && Look.avatarItem(meDraft.avatar) === item;
        const art = item.parts ? avatarArt(chosen ? meDraft.avatar : item.id, 'h-[92%] w-[92%]') : escapeHtml(item.id);
        const lock = avatarLock(item.id);
        const label = item.diploma ? `${item.title} (legendární)` : item.title;
        if (lock) {
            return `<button type="button" data-locked-avatar="${escapeHtml(item.id)}" aria-disabled="true" aria-label="${escapeHtml(`${label} (zamčeno): ${avatarUnlockText(lock)}`)}" title="${escapeHtml(`${item.title}: ${avatarUnlockText(lock)}`)}" class="${AVATAR_TILE} ${AVATAR_OFF} relative">`
                + `<span class="flex h-full w-full items-center justify-center opacity-40 grayscale dark:opacity-60">${art}</span>${lockPill(lock)}</button>`;
        }
        return `<button type="button" data-pick-avatar="${escapeHtml(item.id)}"${item.diploma ? ' data-legendary' : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${chosen}" class="${AVATAR_TILE} ${chosen ? AVATAR_ON : item.diploma ? LEGEND_OFF : AVATAR_OFF}">${art}</button>`;
    };
    // Skupina Legendy: 14 postaviček za diplomy (dvě řady) a pod nimi věta, jak se získají (vejde se do výšky tří řad jako ostatní skupiny)
    const legendTiles = () => {
        const items = Look.AVATARS.filter(item => item.diploma);
        return items.map(characterTile).join('')
            + `<p data-legend-note class="col-span-full flex items-center gap-1 self-center justify-self-stretch px-1 text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400"><i data-lucide="graduation-cap" class="h-3.5 w-3.5 shrink-0 text-gold-600 dark:text-gold-300"></i><span>Legendární postavička za diplom tématu (plné mistrovství, 5 hvězdiček).</span></p>`;
    };
    const pictureTiles = (group) => {
        if (group === 'mudrlant') {
            const on = Boolean(meDraft.owl && !meDraft.pose);
            return `<button type="button" data-pick-owl aria-label="Sova Mudrlant" title="Sova Mudrlant" aria-pressed="${on}" class="${AVATAR_TILE} ${on ? AVATAR_ON : AVATAR_OFF}">${Owl.owlAvatarHtml(ownOwlText(null), 'h-full w-auto', 'h-[88%]')}</button>${poseTiles()}`;
        }
        // Sezónní postavičky (exclusive) jen ty, které hráč má (ze Sezónní truhly) nebo už má v profilu, jinak by tu visely zamčené bez cesty k nim;
        // legendární (diploma) mají vlastní skupinu
        if (group === 'postavicky') return Look ? Look.AVATARS.filter(item => !item.diploma && (!item.exclusive || Look.isUnlocked(item, lookContext()) || (myProfile && Look.avatarItem(myProfile.avatar) === item))).map(characterTile).join('') : '';
        if (group === 'legendy') return Look ? legendTiles() : '';
        return Social.AVATARS.map(emoji => {
            const on = !meDraft.owl && emoji === meDraft.avatar;
            return `<button type="button" data-pick-avatar="${emoji}" aria-label="Obrázek ${emoji}" aria-pressed="${on}" class="${AVATAR_TILE} ${on ? AVATAR_ON : AVATAR_OFF}">${emoji}</button>`;
        }).join('');
    };
    // Barvy pozadí profilovky (pojmenované) a jejich odstín pro posuvník všech barev
    const BG_TITLES = { emerald: 'Smaragdová', sky: 'Nebeská', violet: 'Fialová', rose: 'Růžová', amber: 'Jantarová', teal: 'Mořská', orange: 'Oranžová', indigo: 'Indigová', cerna: 'Černá' };
    const BG_HUES = { emerald: 160, sky: 200, violet: 260, rose: 350, amber: 40, teal: 175, orange: 25, indigo: 240, cerna: 225 };
    const SWATCH = 'flex h-9 min-w-0 flex-1 items-center justify-center active:scale-95';
    const SWATCH_ON = 'ring-2 ring-slate-800/70 ring-offset-2 ring-offset-white dark:ring-white/80 dark:ring-offset-slate-800';
    const RAINBOW_DOT = 'bg-[conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]';
    const pictureColors = () => {
        const pic = !meDraft.owl && Look && Look.avatarPicture ? Look.avatarPicture(meDraft.avatar) : null;
        const parts = pic ? pic.item.parts : [];
        const target = colorTarget !== 'bg' && Number(colorTarget) >= 1 && Number(colorTarget) <= parts.length ? Number(colorTarget) : 'bg';
        const chip = (id, label) => {
            const on = String(target) === String(id);
            return `<button type="button" data-color-target="${id}" aria-pressed="${on}" class="min-h-[2rem] shrink-0 rounded-full px-3 text-[12px] font-black leading-tight active:scale-95 short:min-h-[1.75rem] ${on ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}">${escapeHtml(label)}</button>`;
        };
        let row;
        if (target === 'bg' && hueOpen) {
            const hue = Social.customHue(meDraft.color) ?? BG_HUES[meDraft.color] ?? 160;
            row = `<button type="button" data-hue-close aria-label="Zpět na barvy pozadí" title="Zpět na barvy" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:scale-95 dark:bg-slate-700 dark:text-slate-200"><i data-lucide="layout-grid" class="h-4 w-4"></i></button>`
                + `<input type="range" min="0" max="355" step="5" value="${hue}" data-pick-hue aria-label="Všechny barvy: odstín pozadí profilovky" class="mx-1 h-6 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]">`;
        } else if (target === 'bg') {
            const custom = Social.customHue(meDraft.color) !== null;
            row = Social.COLORS.map(color => `<button type="button" data-pick-color="${color}" aria-label="Pozadí: ${BG_TITLES[color] || color}" title="${BG_TITLES[color] || color}" aria-pressed="${color === meDraft.color}" class="${SWATCH}"><span class="h-7 w-7 rounded-full ${avatarBg(color)} ${color === meDraft.color ? SWATCH_ON : ''}"></span></button>`).join('')
                + `<button type="button" data-pick-hue-open aria-label="Pozadí: všechny barvy (vlastní odstín)" title="Všechny barvy" aria-pressed="${custom}" class="${SWATCH}"><span class="h-7 w-7 rounded-full ${RAINBOW_DOT} ${custom ? SWATCH_ON : ''}"></span></button>`;
        } else {
            const part = parts[target - 1];
            const current = pic.colors[target - 1];
            const swatch = (color, title, dot, inner = '') => `<button type="button" data-pick-part="${target}:${color}" aria-label="${escapeHtml(`${part}: ${title}`)}" title="${escapeHtml(title)}" aria-pressed="${current === color}" class="${SWATCH}"><span class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ${dot} ${current === color ? SWATCH_ON : ''}">${inner}</span></button>`;
            // Nabízí se jen barvy, které se od původní dost liší (look.js colors); uložená jiná zůstane vidět vybraná
            const offered = Look.AVATAR_COLORS.filter(color => color.id === current || Look.partColors(pic.item, target).includes(color));
            row = swatch(0, 'Původní', 'bg-white ring-1 ring-slate-300 dark:bg-slate-600 dark:ring-slate-500', `<img src="${pic.base}" alt="" class="h-[90%] w-[90%] object-contain">`)
                + offered.map(color => swatch(color.id, color.title, color.dot)).join('');
        }
        return `<div class="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Co přebarvit">${chip('bg', 'Pozadí')}${parts.map((part, index) => chip(index + 1, part)).join('')}</div>
            <div data-color-row class="-mx-0.5 flex items-center" role="group" aria-label="${escapeHtml(target === 'bg' ? 'Barva pozadí' : `Barva: ${parts[target - 1]}`)}">${row}</div>`;
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
        off: 'Zápas v turnaji a nové výzvy',
        on: 'Zapnutá na tomhle zařízení',
        denied: 'V prohlížeči zakázaná – klepni pro návod',
        unsupported: 'Tenhle prohlížeč upozornění neumí',
        iphone: 'Na iPhonu nejdřív Sdílet → Přidat na plochu a otevři odtamtud'
    };
    // Výsledek zapnutí a vypnutí s konkrétní příčinou a radou: krátce v podtitulku řádku Upozornění, rada hned pod ním, krátký text i v toastu
    // { ok, tone: 'ok' | 'error', short, advice }
    let pushNote = null;
    // Hráč chtěl zapnout, ale prohlížeč upozornění blokuje (otevřel návod): po povolení v nastavení prohlížeče se zapnutí při návratu dokončí samo
    let pushIntent = false;
    const PUSH_NOTES = {
        on: { ok: true, tone: 'ok', short: 'Hotovo: upozornění jsou zapnutá', advice: '' },
        off: { ok: true, tone: 'ok', short: 'Hotovo: upozornění jsou vypnutá', advice: '' },
        offLocal: { ok: false, tone: 'error', short: 'Vypnuto jen na tomhle zařízení', advice: 'Odběr na serveru se nepodařilo smazat, server ho smaže sám při dalším odesílání.' },
        offFailed: { ok: false, tone: 'error', short: 'Upozornění se nepodařilo vypnout', advice: 'Zkus to znovu.' },
        denied: { ok: false, tone: 'error', short: 'Prohlížeč upozornění zablokoval', advice: 'Klepni na řádek Upozornění, ukážu ti krok za krokem, jak je povolit.' },
        dismissed: { ok: false, tone: 'error', short: 'Dotaz prohlížeče se zavřel bez volby', advice: 'Klepni na přepínač znovu a zvol Povolit. Když se dotaz vůbec neukáže, Chrome ho ztlumil: klepni na ikonu zvonku v adresním řádku a zvol Povolit.' },
        worker: { ok: false, tone: 'error', short: 'Nespustila se část aplikace pro upozornění (service worker)', advice: 'Obnov stránku (aplikaci na ploše zavři a znovu otevři) a zkus to znovu.' },
        network: { ok: false, tone: 'error', short: 'Bez spojení se serverem', advice: 'Zkontroluj internet a zkus to znovu. Odběr v prohlížeči se zrušil, nic nezůstalo napůl.' },
        auth: { ok: false, tone: 'error', short: 'Přihlášení vypršelo', advice: 'Odhlas se a znovu se přihlas, pak upozornění zapni.' },
        missing: { ok: false, tone: 'error', short: 'Databáze nemá funkce upozornění', advice: 'Správce musí v Supabase znovu spustit supabase/schema.sql. Odběr v prohlížeči se zrušil.' },
        incomplete: { ok: false, tone: 'error', short: 'Prohlížeč vrátil neúplné předplatné', advice: 'Zkus to znovu, případně v jiném prohlížeči (Chrome, Firefox, Edge).' },
        unsupported: { ok: false, tone: 'error', short: 'Tenhle prohlížeč upozornění neumí', advice: '' }
    };
    const pushErrorNote = (error) => {
        const kind = error && error.kind;
        if (kind === 'server' && error.status === 404) return PUSH_NOTES.missing;
        if (kind === 'server') return { ok: false, tone: 'error', short: `Server odpověděl chybou ${Number(error.status) || '?'}`, advice: 'Zkus to za chvíli znovu. Když to nepomůže, pošli správci snímek obrazovky.' };
        if (kind === 'subscribe') return { ok: false, tone: 'error', short: 'Push služba prohlížeče odběr odmítla', advice: `${error.detail || 'Neznámá chyba'}. Zkus to za chvíli znovu. V prohlížeči Brave zapni Nastavení → Soukromí → „Používat služby Google pro zasílání zpráv“.` };
        if (PUSH_NOTES[kind]) return PUSH_NOTES[kind];
        return { ok: false, tone: 'error', short: 'Upozornění se nepodařilo zapnout', advice: error && error.message ? `Chyba: ${error.message}` : 'Zkus to znovu.' };
    };
    // Jediné místo, které zapíná upozornění (Push.enable), vždy jen na přání hráče: z klepnutí (volání musí začít hned, bez await před ním:
    // requestPermission je jeho první krok a Safari ho mimo klepnutí odmítne), nebo po návratu z nastavení prohlížeče s už uděleným povolením. Vrací PUSH_NOTES.
    const enablePushNow = async () => {
        const work = Push.enable();
        try {
            const result = await work;
            return result.ok ? PUSH_NOTES.on : result.reason === 'denied' ? PUSH_NOTES.denied : PUSH_NOTES.dismissed;
        } catch (error) { return pushErrorNote(error); }
    };
    const disablePushNow = async () => {
        try { return (await Push.disable()).ok ? PUSH_NOTES.off : PUSH_NOTES.offLocal; } catch (error) { return PUSH_NOTES.offFailed; }
    };
    const PUSH_TONE = { ok: 'text-emerald-700 dark:text-emerald-300', error: 'text-rose-700 dark:text-rose-400' };
    // Upozornění jako řádek s přepínačem v kartě Hra (zapnutá: pod ním volby, co posílat); během zapínání „Zapínám…“ a spínač nejde stisknout
    const pushPanel = () => {
        if (!Push || !signedUser() || !pushState || pushState.kind === 'hidden') return '';
        const { kind } = pushState;
        const text = kind === 'unsupported' && pushState.ios ? PUSH_TEXTS.iphone : PUSH_TEXTS[kind];
        if (kind === 'unsupported') return `<div class="flex min-h-[3rem] items-center gap-3 px-3 py-2"><i data-lucide="bell-off" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i><span class="min-w-0 flex-1"><span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">Upozornění</span><span class="mt-0.5 block text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${text}</span></span></div>`;
        const on = kind === 'on';
        // Co posílat: dvě malé přepínací dlaždice (ikona a popisek) vedle spínače upozornění, ne další řádek – karta Hra se šestnácti
        // barevnými tématy se tak i se zapnutými upozorněními vejde bez posouvání (390×780 i 360×640)
        const pref = (key, icon, label, title) => { const yes = Boolean(pushPrefs[key]); return `<button type="button" data-push-pref="${key}" role="switch" aria-checked="${yes}" title="${title}" aria-label="${title}" class="flex h-11 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors active:scale-95 ${yes ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400'}"><i data-lucide="${icon}" class="h-4 w-4"></i><span class="text-[9.5px] font-black leading-none ${yes ? '' : 'line-through decoration-2'}">${label}</span></button>`; };
        const busyText = pushBusy === 'on' ? 'Zapínám… (potvrď dotaz prohlížeče)' : pushBusy === 'off' ? 'Vypínám…' : '';
        const note = !busyText && pushNote ? pushNote : null;
        return `
            <div data-push-panel>
                <div class="flex items-center${on && pushPrefs ? ' gap-1 pr-2' : ''}">
                <button type="button" data-push-toggle="${on ? 'off' : 'on'}" role="switch" aria-checked="${on}"${pushBusy ? ' disabled aria-busy="true"' : ''} class="${SETTING_ROW} min-w-0 flex-1">
                    <i data-lucide="${busyText ? 'hourglass' : on ? 'bell' : 'bell-off'}" class="h-5 w-5 shrink-0 ${busyText ? 'animate-pulse text-brand-700 dark:text-brand-300' : on ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}"></i>
                    <span class="min-w-0 flex-1"><span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">Upozornění</span><span data-push-status class="mt-0.5 block text-[11px] font-semibold leading-snug ${busyText || (note && note.tone === 'error') ? 'short:truncate' : 'short:hidden'} ${note ? PUSH_TONE[note.tone] : 'text-slate-500 dark:text-slate-400'}">${escapeHtml(busyText || (note ? note.short : text))}</span></span>
                    ${switchMark(on)}
                </button>
                ${on && pushPrefs ? `<div class="flex shrink-0 gap-1" role="group" aria-label="Co posílat">${pref('tournament', 'trophy', 'Turnaje', 'Upozornění: kola a zprávy turnaje')}${pref('challenge', 'swords', 'Výzvy', 'Upozornění: výzvy od hráčů')}</div>` : ''}
                </div>
                ${note && note.advice ? `<p data-push-advice role="${note.tone === 'error' ? 'alert' : 'status'}" class="mx-3 mb-2.5 rounded-xl bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800/60">${escapeHtml(note.advice)}</p>` : ''}
            </div>`;
    };
    const togglePush = async (turnOn) => {
        if (!Push || pushBusy) return;
        // Zablokovaná upozornění: requestPermission by hned vrátil 'denied' a nic by se nestalo, proto návod, jak je povolit
        if (turnOn && pushState && pushState.kind === 'denied') { openPushHelp(); return; }
        pushBusy = turnOn ? 'on' : 'off';
        pushNote = null;
        meNote = '';
        // Povolení se žádá hned v klepnutí (jinak ho Safari odmítne), teprve potom se řádek překreslí na „Zapínám…“
        const work = turnOn ? enablePushNow() : disablePushNow();
        if (document.getElementById('settings-overlay')) openSettings('', '[data-push-toggle]');
        const note = await work;
        pushBusy = false;
        pushNote = note;
        showToast(note.short);
        pushState = null;
        pushPrefs = null;
        await refreshPush();
        if (document.getElementById('settings-overlay')) openSettings('', '[data-push-toggle]');
    };
    // --- Návod, jak povolit zablokovaná upozornění (podle zařízení: Android, aplikace na ploše, iPhone, počítač) ---
    const pushEnvironment = () => {
        const agent = String(navigator.userAgent || '');
        const standalone = Boolean((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
        if (/iPad|iPhone|iPod/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
        if (standalone) return 'app';
        return /Android/i.test(agent) ? 'android' : 'desktop';
    };
    const PUSH_HELP = {
        android: { title: 'Chrome na Androidu', steps: ['Klepni na ikonu vlevo od adresy stránky (zámek nebo posuvníky).', 'Zvol Oprávnění (nebo Nastavení webu) → Oznámení → Povolit.', 'Když tam Oznámení nevidíš, zvol Resetovat oprávnění.', 'Obnov stránku a vrať se sem.'] },
        app: { title: 'Aplikace na ploše', steps: ['Podrž prst na ikoně Mudrlanta na ploše.', 'Zvol Informace o aplikaci (ikona i).', 'Otevři Oznámení a zapni je.', 'Vrať se do Mudrlanta.'] },
        ios: { title: 'iPhone a iPad', steps: ['Otevři Nastavení iPhonu → Oznámení.', 'Najdi Mudrlanta a zapni Povolit oznámení.', 'Funguje jen v aplikaci přidané na plochu (Sdílet → Přidat na plochu).'] },
        desktop: { title: 'Počítač', steps: ['Klikni na zámek (nebo ikonu nastavení) vlevo od adresy.', 'U položky Oznámení zvol Povolit (v Chromu přes Nastavení webu).', 'Obnov stránku.'] }
    };
    const pushHelp = { note: '', busy: false };
    const PUSH_HELP_TITLE = 'Jak povolit upozornění';
    const pushHelpOpen = () => { const overlay = document.getElementById('dialog-overlay'); return Boolean(overlay && overlay.dataset.title === PUSH_HELP_TITLE); };
    const helpSection = (id) => {
        const help = PUSH_HELP[id];
        return `<section data-push-help="${id}" class="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
            <h3 class="text-sm font-black text-slate-800 dark:text-slate-100">${escapeHtml(help.title)}</h3>
            <ol class="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${help.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        </section>`;
    };
    const renderPushHelp = () => {
        const env = pushEnvironment();
        const others = Object.keys(PUSH_HELP).filter(id => id !== env);
        showDialog(PUSH_HELP_TITLE, `
            <div id="push-help" data-env="${env}" class="flex flex-col gap-3">
                <p class="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">Prohlížeč má upozornění pro Mudrlanta zablokovaná, proto se přepínač nezapne. Povolíš je v nastavení prohlížeče:</p>
                ${helpSection(env)}
                <details class="rounded-2xl bg-slate-100 px-3 py-2 dark:bg-slate-800/60">
                    <summary class="min-h-[2rem] cursor-pointer text-[13px] font-black text-slate-700 dark:text-slate-200">Jiné zařízení</summary>
                    <div class="mt-2 flex flex-col gap-2">${others.map(id => helpSection(id)).join('')}</div>
                </details>
                ${pushHelp.note ? `<p data-push-help-note role="alert" class="rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold leading-snug text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800/60">${escapeHtml(pushHelp.note)}</p>` : ''}
                <button type="button" data-push-help-check class="${PRIMARY_BUTTON}"${pushHelp.busy ? ' disabled' : ''}><i data-lucide="${pushHelp.busy ? 'hourglass' : 'repeat'}" class="h-5 w-5${pushHelp.busy ? ' animate-pulse' : ''}"></i> ${pushHelp.busy ? 'Zapínám…' : 'Už jsem povolil – zkontrolovat'}</button>
                <button type="button" data-close class="mx-auto rounded-xl px-3 py-2 text-[13px] font-bold text-slate-600 underline underline-offset-2 dark:text-slate-300">Zavřít</button>
            </div>`, {
            onClick: (event) => {
                if (!event.target.closest('[data-push-help-check]') || pushHelp.busy) return;
                const permission = window.Notification ? String(window.Notification.permission) : 'denied';
                if (permission === 'denied') { pushHelp.note = 'Prohlížeč upozornění pořád blokuje. Projdi kroky výše (případně obnov stránku) a zkus to znovu.'; renderPushHelp(); return; }
                finishPushHelp();
            }
        });
    };
    const openPushHelp = () => { pushIntent = true; pushHelp.note = ''; pushHelp.busy = false; renderPushHelp(); };
    // Povolení je zpátky (granted, nebo po resetu 'default' – pak se prohlížeč zeptá znovu): dokončí zapnutí (předplatné a uložení)
    const finishPushHelp = async () => {
        if (!Push || pushBusy || pushHelp.busy) return;
        pushIntent = false;
        const work = enablePushNow();
        pushHelp.busy = true;
        pushBusy = 'on';
        if (pushHelpOpen()) renderPushHelp();
        else if (document.getElementById('settings-overlay')) openSettings('', '[data-push-toggle]');
        const note = await work;
        pushHelp.busy = false;
        pushBusy = false;
        pushState = null;
        pushPrefs = null;
        if (!note.ok && pushHelpOpen()) { pushHelp.note = `${note.short}. ${note.advice}`.trim(); renderPushHelp(); return; }
        pushNote = note;
        showToast(note.short);
        if (pushHelpOpen()) closeDialog();
        await refreshPush();
        openSettings('', '[data-push-toggle]', 'game');
    };
    // Návrat do aplikace (třeba z nastavení prohlížeče): stav upozornění se přečte znovu a řádek se přepne sám; chtěl-li hráč zapnout, dokončí se to
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !Push || !signedUser()) return;
        const permission = window.Notification ? String(window.Notification.permission) : '';
        if (pushIntent && permission === 'granted') { finishPushHelp(); return; }
        if (pushHelpOpen() && permission !== 'denied' && pushHelp.note) { pushHelp.note = ''; renderPushHelp(); }
        if (document.getElementById('settings-overlay')) refreshPush();
    });

    // --- Vývojářský režim: diagnostika a zkouška upozornění ---
    // Diagnostika: co o upozorněních ví prohlížeč a server (snímek obrazovky z telefonu stačí k poznání příčiny)
    const PUSH_DIAG_TITLE = 'Diagnostika upozornění';
    const openPushDiagnostics = async () => {
        if (!Push) return;
        showDialog(PUSH_DIAG_TITLE, '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Zjišťuji…</p>');
        let d = null;
        try { d = await Push.diagnose(); } catch (error) { d = null; }
        const overlay = document.getElementById('dialog-overlay');
        if (!overlay || overlay.dataset.title !== PUSH_DIAG_TITLE) return;
        if (!d) { showDialog(PUSH_DIAG_TITLE, '<p class="text-sm font-semibold text-rose-700 dark:text-rose-400" role="alert">Diagnostika selhala.</p>'); return; }
        const yes = (value) => (value ? 'ano' : 'ne');
        const reg = d.registration;
        const sub = d.subscription;
        const server = d.server;
        const rows = [
            ['permission', 'Povolení (Notification.permission)', d.permission, d.permission === 'granted' ? 'ok' : d.permission === 'denied' ? 'bad' : 'warn'],
            ['api', 'Push API v prohlížeči', yes(d.pushManager && d.serviceWorker), d.pushManager && d.serviceWorker ? 'ok' : 'bad'],
            ['https', 'Zabezpečená stránka (https)', yes(d.secure), d.secure ? 'ok' : 'bad'],
            ['standalone', 'Spuštěno z plochy', yes(d.standalone), 'info'],
            ['sw', 'Service worker zaregistrovaný', reg ? (reg.error ? `chyba: ${reg.error}` : `ano (${reg.active || 'neaktivní'}${reg.waiting ? ', čeká nová verze' : ''})`) : 'ne', reg && !reg.error && reg.active ? 'ok' : 'bad'],
            ['control', 'Service worker ovládá stránku', yes(d.controlled), d.controlled ? 'ok' : 'warn'],
            ['ready', 'Service worker připravený (3 s)', yes(d.ready), d.ready ? 'ok' : 'bad'],
            ['subscription', 'Předplatné v prohlížeči', !sub ? 'nezjištěno' : sub.error ? `chyba: ${sub.error}` : sub.none ? 'žádné' : sub.endpoint, sub && sub.endpoint ? 'ok' : 'warn'],
            ['key', 'Předplatné má klíč aplikace', !sub || !sub.endpoint || sub.keyMatches === null || sub.keyMatches === undefined ? 'nezjištěno' : yes(sub.keyMatches), sub && sub.keyMatches === false ? 'bad' : 'info'],
            ['vapid', 'Klíč VAPID (prvních 8 znaků)', d.vapid ? `${d.vapid}…${d.vapidValid ? '' : ' (neplatný tvar)'}` : 'chybí', d.vapidValid ? 'ok' : 'bad'],
            ['signed', 'Přihlášený účet', yes(d.signedIn), d.signedIn ? 'ok' : 'warn'],
            ['server', 'Server (push_subscriptions)', !server ? 'nezkoušeno' : server.status === 200 ? `odpovídá, odběrů účtu ${server.count}, toto zařízení ${yes(server.thisDevice)}` : `chyba ${server.status || server.kind}${server.status === 404 ? ' – tabulka chybí, spusť schema.sql' : ''}`, server && server.status === 200 ? (server.thisDevice || !sub || !sub.endpoint ? 'ok' : 'warn') : server ? 'bad' : 'info'],
            ['agent', 'Prohlížeč', String(navigator.userAgent || '').slice(0, 140), 'info'],
            ['version', 'Verze aplikace', versionLabel(), 'info']
        ];
        const tone = { ok: 'text-emerald-700 dark:text-emerald-300', bad: 'text-rose-700 dark:text-rose-400', warn: 'text-amber-700 dark:text-amber-300', info: 'text-slate-700 dark:text-slate-200' };
        showDialog(PUSH_DIAG_TITLE, `
            <div id="push-diagnostics" class="flex flex-col gap-2">
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Pošli snímek obrazovky vývojáři, podle něj pozná, kde upozornění váznou. Klíče předplatného se nezobrazují.</p>
                <dl class="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-700/70 dark:bg-slate-800 dark:ring-slate-700/70">${rows.map(([key, label, value, kind]) => `
                    <div data-diag="${key}" class="flex items-start justify-between gap-3 px-3 py-1.5"><dt class="shrink-0 text-[11px] font-bold leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(label)}</dt><dd class="min-w-0 break-words text-right text-[11px] font-black leading-snug ${tone[kind]}">${escapeHtml(value)}</dd></div>`).join('')}</dl>
                <button type="button" data-diag-refresh class="${SECONDARY_BUTTON}"><i data-lucide="repeat" class="h-5 w-5"></i> Zjistit znovu</button>
            </div>`, { onClick: (event) => { if (event.target.closest('[data-diag-refresh]')) openPushDiagnostics(); } });
    };

    // Zkouška v tomto zařízení (bez serveru) a přes server; výsledek a co dál v jednom okně
    const PUSH_TEST_TITLE = 'Zkouška upozornění';
    const pushTestOpen = () => { const overlay = document.getElementById('dialog-overlay'); return Boolean(overlay && overlay.dataset.title === PUSH_TEST_TITLE); };
    const TEST_TEXT = 'text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300';
    const TEST_ICON = { ok: 'circle-check', error: 'circle-x' };
    const testBox = (tone, text) => `<p data-push-test-result="${tone}" role="${tone === 'ok' ? 'status' : 'alert'}" class="flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[15px] font-black leading-snug ${tone === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800/60' : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800/60'}"><i data-lucide="${TEST_ICON[tone]}" class="mt-0.5 h-5 w-5 shrink-0"></i><span>${escapeHtml(text)}</span></p>`;
    const showPushTest = (html, onClick = null) => showDialog(PUSH_TEST_TITLE, `<div id="push-test" class="flex flex-col gap-3">${html}</div>`, { onClick });
    const CLOSE_TEST = () => `<button type="button" data-close class="${PRIMARY_BUTTON}">Rozumím</button>`;
    const ENABLE_TEST = (label) => `<button type="button" data-push-test-enable class="${PRIMARY_BUTTON}"><i data-lucide="bell" class="h-5 w-5"></i> ${escapeHtml(label)}</button><button type="button" data-close class="mx-auto rounded-xl px-3 py-2 text-[13px] font-bold text-slate-600 underline underline-offset-2 dark:text-slate-300">Teď ne</button>`;
    // „Zkusit upozornění v tomto zařízení“: stránka pošle zprávu service workeru, ten ukáže upozornění stejnou funkcí jako skutečný push
    // a klepnutí na něj otevře záložku Více hráčů (stejně jako u upozornění ze serveru)
    const devPushLocal = () => {
        if (!Push) return;
        if (!Push.supported()) { showPushTest(`${testBox('error', 'Tenhle prohlížeč upozornění neumí')}<p class="${TEST_TEXT}">${escapeHtml(pushEnvironment() === 'ios' ? PUSH_TEXTS.iphone : 'Zkus Chrome, Firefox nebo Edge.')}</p>${CLOSE_TEST()}`); return; }
        const permission = String(window.Notification.permission);
        if (permission === 'denied') { openPushHelp(); return; }
        if (permission !== 'granted') {
            showPushTest(`${testBox('error', 'Upozornění nejsou povolená')}<p class="${TEST_TEXT}">Zkouška potřebuje souhlas prohlížeče. Klepni na Povolit upozornění a v dotazu prohlížeče zvol Povolit.</p>${ENABLE_TEST('Povolit upozornění')}`,
                (event) => { if (event.target.closest('[data-push-test-enable]')) devPushEnable(runLocalTest); });
            return;
        }
        runLocalTest();
    };
    // Povolení ze zkušebního okna: zapne upozornění stejně jako přepínač v Nastavení (souhlas, předplatné, uložení) a pak pokračuje zkouškou
    const devPushEnable = async (next) => {
        const work = enablePushNow();
        showPushTest(`<p class="${TEST_TEXT}" role="status">Zapínám… potvrď dotaz prohlížeče.</p>`);
        const note = await work;
        if (note.ok || (window.Notification && window.Notification.permission === 'granted' && next === runLocalTest)) { if (!note.ok) showToast(note.short); next(); return; }
        if (note === PUSH_NOTES.denied) { openPushHelp(); return; }
        showPushTest(`${testBox('error', note.short)}${note.advice ? `<p class="${TEST_TEXT}">${escapeHtml(note.advice)}</p>` : ''}${CLOSE_TEST()}`);
    };
    const runLocalTest = async () => {
        showPushTest(`<p class="${TEST_TEXT}" role="status">Posílám zkušební upozornění…</p>`);
        const result = await Push.testLocal();
        if (!pushTestOpen()) { showToast(result.ok ? 'Zkušební upozornění odesláno' : 'Zkušební upozornění se nezobrazilo'); return; }
        if (result.ok) {
            showPushTest(`${testBox('ok', 'Upozornění se zobrazilo')}
                <p class="${TEST_TEXT}">Najdeš ho v liště oznámení (na počítači v rohu obrazovky). <b>Klepni na něj</b>: aplikace se otevře na záložce Více hráčů a napíše, že klepnutí funguje.</p>
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Ukázal ho service worker stejnou funkcí jako skutečné upozornění ze serveru. Když nic nevidíš, zkontroluj režim Nerušit a oznámení prohlížeče v nastavení telefonu.</p>${CLOSE_TEST()}`);
            return;
        }
        const text = result.reason === 'worker' ? ['Service worker neběží', 'Obnov stránku (aplikaci na ploše zavři a znovu otevři) a zkus to znovu.']
            : result.reason === 'failed' ? ['Prohlížeč upozornění nezobrazil', result.detail || 'Neznámá chyba.']
                : result.reason === 'permission' ? ['Upozornění nejsou povolená', 'Povol je a zkus to znovu.'] : ['Tenhle prohlížeč upozornění neumí', ''];
        showPushTest(`${testBox('error', text[0])}${text[1] ? `<p class="${TEST_TEXT}">${escapeHtml(text[1])}</p>` : ''}${CLOSE_TEST()}`);
    };
    // „Poslat zkušební upozornění přes server“: databáze (dev_push_test, jen dev_admins) zařadí zprávu, odesílač na GitHubu ji pošle při dalším běhu.
    // Co napsat, záleží na tom, jestli je na serveru zapnuté okamžité odesílání (dev_push_status, schéma 5): pak přijde do 1–2 minut a není co dělat;
    // jinak (i se starší databází) jednoduché vysvětlení, odkaz na návod a jako vedlejší rada ruční spuštění na GitHubu.
    const PUSH_INSTANT_DOCS = 'https://github.com/taronwho/geografie-kviz/blob/main/docs/SUPABASE.md#okamžité-odesílání-upozornění';
    const PUSH_TEST_HINT = 'text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400';
    const PUSH_TEST_NEXT = 'rounded-2xl bg-white p-3 text-sm font-bold leading-snug text-slate-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700/70';
    const pushDocsLink = (text) => `<a href="${PUSH_INSTANT_DOCS}" target="_blank" rel="noopener noreferrer" data-push-test-docs class="font-black text-brand-700 underline underline-offset-2 dark:text-brand-300">${escapeHtml(text)}</a>`;
    const pushServerQueued = (devices, status) => {
        const runHint = `<p data-push-test-hint class="${PUSH_TEST_HINT}">Hned ho pošleš na GitHubu: Actions → Upozornění → Run workflow.</p>`;
        if (status && status.instant && !(status.github >= 300)) {
            return `${testBox('ok', `Zkušební upozornění je na cestě (zařízení: ${devices})`)}
                <p data-push-test-next class="${PUSH_TEST_NEXT}">Upozornění přijde do 1–2 minut.</p>
                <p class="${PUSH_TEST_HINT}">Nic dalšího dělat nemusíš. Klepnutí na upozornění otevře záložku Více hráčů.</p>${CLOSE_TEST()}`;
        }
        const queued = testBox('ok', `Zkušební upozornění čeká na odeslání (zařízení: ${devices})`);
        if (status && status.instant) {
            return `${queued}
                <p class="${TEST_TEXT}">Okamžité odesílání je zapnuté, ale GitHub ho naposledy odmítl (chyba ${escapeHtml(status.github)}). Token nejspíš vypršel.</p>
                <p data-push-test-next class="${PUSH_TEST_NEXT}">Vytvoř nový token a spusť znovu stejné SQL podle návodu ${pushDocsLink('Okamžité odesílání upozornění')}.</p>${runHint}${CLOSE_TEST()}`;
        }
        // Rozpracované nastavení (něco už je, něco chybí): krátce co zbývá
        const parts = status ? [['token GitHubu', status.token], ['pg_net', status.pgNet], ['úloha pg_cron', status.cron]] : [];
        const missing = parts.filter(([, done]) => !done).map(([label]) => label);
        const setup = missing.length && missing.length < parts.length ? `<p data-push-test-setup class="${PUSH_TEST_HINT}">Okamžité odesílání je nastavené jen zčásti, chybí: ${escapeHtml(missing.join(', '))}.</p>` : '';
        return `${queued}
            <p class="${TEST_TEXT}">Server upozornění posílá, jen když ho spustí GitHub. Má to být každou hodinu, ale GitHub to často udělá až mnohem později.</p>
            <p data-push-test-next class="${PUSH_TEST_NEXT}">Aby upozornění přicházela do 1–2 minut, zapni okamžité odesílání podle návodu ${pushDocsLink('Okamžité odesílání upozornění')}.</p>${runHint}${setup}${CLOSE_TEST()}`;
    };
    const devPushServer = async () => {
        if (!Push || !signedUser()) { showToast('Nejdřív se přihlas.'); return; }
        showPushTest(`<p class="${TEST_TEXT}" role="status">Zařazuji zkušební upozornění…</p>`);
        let devices = 0;
        // Stav serveru se zjišťuje souběžně; když nejde zjistit (starší databáze), je null a okno ukáže obecný text
        const statusWork = Push.serverPushStatus ? Push.serverPushStatus().catch(() => null) : Promise.resolve(null);
        try { devices = await Push.requestServerTest(); } catch (error) {
            const text = error.kind === 'forbidden' ? 'Tenhle účet není v dev_admins (návod v docs/SUPABASE.md, část Upozornění).'
                : error.kind === 'server' && error.status === 404 ? `V databázi chybí funkce dev_push_test: spusť znovu supabase/schema.sql (verze ${REQUIRED_SCHEMA}).` : `${pushErrorNote(error).short}.`;
            if (pushTestOpen()) showPushTest(`${testBox('error', 'Zkušební upozornění se nezařadilo')}<p class="${TEST_TEXT}">${escapeHtml(text)}</p>${CLOSE_TEST()}`);
            return;
        }
        if (!pushTestOpen()) return;
        if (!devices) {
            showPushTest(`${testBox('error', 'Účet nemá zapnutá upozornění na žádném zařízení')}<p class="${TEST_TEXT}">Zkušební zpráva by nepřišla. Zapni upozornění tady a zkus to znovu.</p>${Push.supported() ? ENABLE_TEST('Zapnout upozornění tady') : CLOSE_TEST()}`,
                (event) => { if (event.target.closest('[data-push-test-enable]')) devPushEnable(devPushServer); });
            return;
        }
        const status = await statusWork;
        if (!pushTestOpen()) return;
        showPushTest(pushServerQueued(devices, status));
    };

    // --- Nabídka upozornění: hra se sama zeptá, jestli upozornění zapnout, a vysvětlí proč ---
    // Jen když to dává smysl: přihlášený hráč, prohlížeč push umí, je klíč VAPID, prohlížeč se ještě neptal (permission 'default') a upozornění nejsou zapnutá.
    // Kdy: hned po přihlášení do turnaje, po dohrání výzvy, na jejíhož soupeře se čeká (i po založení výzvy – založení ji rovnou spustí),
    // jinak nejdřív při 3. otevření záložky Více hráčů. „Teď ne“ (i zavření okna) = znovu nejdřív za 7 dní, celkem nejvýš 3×; po zapnutí nebo zamítnutí
    // v prohlížeči už nikdy. Ne během tutoriálu, uprostřed otázky nebo zápasu, ani přes jiné otevřené okno (počká, až se zavře).
    // Na iPhonu bez přidání na plochu (push tam nejde) místo nabídky jednou krátká rada. Stav je v localStorage zvlášť pro každý účet (mudrlant.pushOffer).
    const PUSH_OFFER_KEY = 'mudrlant.pushOffer';
    const PUSH_OFFER_GAP = 7 * 86400000;
    const PUSH_OFFER_MAX = 3;
    const PUSH_OFFER_MULTI = 3;
    // Chvíli po události (hráč nejdřív uvidí výsledek a hlášku dole, ta zmizí po 2,5 s), ať okno nezakryje
    const PUSH_OFFER_DELAY = 3000;
    const PUSH_OFFER_TITLE = 'Upozornění';
    const pushOfferAll = () => { const saved = readJson(PUSH_OFFER_KEY); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; };
    const pushOfferOf = (userId) => {
        const row = pushOfferAll()[userId];
        const count = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
        return { shown: count(row && row.shown), last: count(row && row.last), opens: count(row && row.opens), done: Boolean(row && row.done) };
    };
    const savePushOffer = (userId, patch) => {
        const all = pushOfferAll();
        const next = { ...pushOfferOf(userId), ...patch };
        delete all[userId];
        writeJson(PUSH_OFFER_KEY, Object.fromEntries([...Object.entries(all).slice(-4), [userId, next]]));
    };
    const pushOfferAllowed = (record, now = Date.now()) => !record.done && record.shown < PUSH_OFFER_MAX && (!record.last || now - record.last >= PUSH_OFFER_GAP);
    // Něco jiného má přednost: tutoriál, otázka, načítání, jiné okno nebo oslava
    const PUSH_OFFER_BLOCKERS = ['dialog-overlay', 'settings-overlay', 'play-chooser', 'photo-zoom', 'photo-source', 'place-info', 'fact-overlay', 'celebration', 'tutorial', 'account-welcome'];
    const pushOfferBlocked = () => {
        if (isLoading || (screen !== 'home' && screen !== 'challenge-done')) return true;
        if (Tutorial) {
            if (Tutorial.isActive()) return true;
            try { if (Tutorial.isRunning(window.localStorage)) return true; } catch (error) { /* bez úložiště tutoriál neběží */ }
        }
        return PUSH_OFFER_BLOCKERS.some(id => document.getElementById(id)) || Boolean(document.querySelector('body > [aria-modal="true"]'));
    };
    const pushOfferFits = (context) => (context === 'multi' ? screen === 'home' && homeTab() === 'multi' : true);
    let pushOfferPending = null; // { context, userId, until }
    let pushOfferTimer = 0;
    // Naplánuje nabídku; z turnaje a výzvy počká na zavření jiného okna až 3 minuty, ze záložky Více hráčů jen chvíli (jinak příště)
    const schedulePushOffer = (context) => {
        const user = signedUser();
        if (!Push || !user || !Push.configured() || (!Push.supported() && pushEnvironment() !== 'ios') || !pushOfferAllowed(pushOfferOf(user.id))) return;
        pushOfferPending = { context, userId: user.id, until: Date.now() + PUSH_OFFER_DELAY + (context === 'multi' ? 3000 : 180000) };
        clearTimeout(pushOfferTimer);
        pushOfferTimer = setTimeout(tryPushOffer, PUSH_OFFER_DELAY);
    };
    const tryPushOffer = async () => {
        const pending = pushOfferPending;
        const user = signedUser();
        if (!pending) return;
        if (!user || user.id !== pending.userId || Date.now() > pending.until) { pushOfferPending = null; return; }
        const retry = () => { clearTimeout(pushOfferTimer); pushOfferTimer = setTimeout(tryPushOffer, 1000); };
        if (pushOfferBlocked() || !pushOfferFits(pending.context)) { retry(); return; }
        let state = null;
        try { state = await Push.state(); } catch (error) { state = null; }
        if (pushOfferPending !== pending) return;
        const record = pushOfferOf(user.id);
        const permission = window.Notification ? String(window.Notification.permission) : '';
        const iphone = state && state.kind === 'unsupported' && state.ios && !(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) && navigator.standalone !== true;
        // Zapnuto, zablokováno nebo už jednou povoleno: nabídka nemá smysl a už se neukáže
        if (state && (state.kind === 'on' || state.kind === 'denied' || (state.kind === 'off' && permission !== 'default'))) { savePushOffer(user.id, { done: true }); pushOfferPending = null; return; }
        if (!state || !pushOfferAllowed(record) || (state.kind !== 'off' && !iphone)) { pushOfferPending = null; return; }
        if (pushOfferBlocked() || !pushOfferFits(pending.context)) { retry(); return; }
        pushOfferPending = null;
        // Ukázání se počítá hned („Teď ne“ i zavření okna znamená počkat 7 dní); rada pro iPhone jen jednou
        savePushOffer(user.id, { shown: record.shown + 1, last: Date.now(), ...(iphone ? { done: true } : {}) });
        if (iphone) showPushIphoneHint(); else showPushOffer(pending.context);
    };
    const PUSH_OFFER_LEAD = {
        tournament: 'Jsi v turnaji! Ať ti žádné kolo neuteče.',
        challenge: 'Až soupeř výzvu dohraje, můžeš se to dozvědět hned.',
        multi: 'Dám ti vědět, i když máš aplikaci zavřenou.'
    };
    const PUSH_OFFER_ITEMS = [
        ['trophy', 'Začíná tvůj zápas turnaje – kdo kolo neodehraje, vypadává.'],
        ['swords', 'Někdo tě vyzval.'],
        ['flag', 'Soupeř dohrál tvoji výzvu.']
    ];
    const pushOffer = { context: 'multi', busy: false, note: null, done: false };
    const pushOfferOpen = () => Boolean(document.getElementById('push-offer'));
    const renderPushOffer = () => {
        if (pushOffer.done) {
            showDialog(PUSH_OFFER_TITLE, `
                <div id="push-offer" data-done class="flex flex-col items-center gap-3 text-center">
                    ${uiArt('sova-radost', 'h-24 w-24')}
                    <p class="text-lg font-black text-slate-800 dark:text-slate-100" role="status">Upozornění jsou zapnutá</p>
                    <p class="text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">Dám ti vědět, až začne tvůj zápas nebo tě někdo vyzve. Vypnout je můžeš kdykoli v Nastavení → Hra.</p>
                    <button type="button" data-close data-autofocus class="${PRIMARY_BUTTON}">Super</button>
                </div>`);
            return;
        }
        const note = pushOffer.note;
        showDialog(PUSH_OFFER_TITLE, `
            <div id="push-offer" data-context="${escapeHtml(pushOffer.context)}" class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                    ${uiArt('sova-zvonek', 'h-20 w-20 -my-1')}
                    <div class="min-w-0"><p class="text-lg font-black leading-tight text-slate-800 dark:text-slate-100">Mám ti dát vědět?</p>
                        <p class="mt-1 text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(PUSH_OFFER_LEAD[pushOffer.context] || PUSH_OFFER_LEAD.multi)} Pošlu ti krátké upozornění, když:</p></div>
                </div>
                <ul class="flex flex-col gap-1.5 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">${PUSH_OFFER_ITEMS.map(([icon, text]) => `
                    <li class="flex items-center gap-2.5 text-[13px] font-bold leading-snug text-slate-700 dark:text-slate-200"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"><i data-lucide="${icon}" class="h-4 w-4"></i></span>${escapeHtml(text)}</li>`).join('')}</ul>
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">V noci (21–7 h) nic neposílám. Vypnout jde kdykoli v Nastavení → Hra.</p>
                ${note ? `<p data-push-offer-note role="alert" class="rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold leading-snug text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800/60"><b>${escapeHtml(note.short)}.</b> ${escapeHtml(note === PUSH_NOTES.denied ? 'Povolit je jde v nastavení prohlížeče.' : note.advice)}</p>` : ''}
                ${note === PUSH_NOTES.denied
                    ? `<button type="button" data-push-offer-help class="${PRIMARY_BUTTON}"><i data-lucide="info" class="h-5 w-5"></i> Jak je povolit</button>`
                    : `<button type="button" data-push-offer-on class="${PRIMARY_BUTTON}"${pushOffer.busy ? ' disabled aria-busy="true"' : ''}><i data-lucide="${pushOffer.busy ? 'hourglass' : 'bell'}" class="h-5 w-5"></i> ${pushOffer.busy ? 'Zapínám… potvrď dotaz prohlížeče' : note ? 'Zkusit znovu' : 'Zapnout upozornění'}</button>`}
                <button type="button" data-close class="mx-auto rounded-xl px-4 py-2.5 text-[13px] font-bold text-slate-600 underline underline-offset-2 dark:text-slate-300">Teď ne</button>
            </div>`, {
            onClick: (event) => {
                if (event.target.closest('[data-push-offer-help]')) { openPushHelp(); return; }
                if (event.target.closest('[data-push-offer-on]') && !pushOffer.busy) acceptPushOffer();
            }
        });
    };
    const showPushOffer = (context) => {
        Object.assign(pushOffer, { context, busy: false, note: null, done: false });
        renderPushOffer();
    };
    // „Zapnout upozornění“: stejné zapnutí jako přepínač v Nastavení (souhlas prohlížeče hned v klepnutí, předplatné, uložení)
    const acceptPushOffer = async () => {
        const user = signedUser();
        const work = enablePushNow();
        pushOffer.busy = true;
        pushOffer.note = null;
        renderPushOffer();
        const note = await work;
        pushOffer.busy = false;
        if (user && (note.ok || note === PUSH_NOTES.denied)) savePushOffer(user.id, { done: true });
        pushState = null;
        pushPrefs = null;
        if (!pushOfferOpen()) { showToast(note.short); return; }
        if (note.ok) pushOffer.done = true; else pushOffer.note = note;
        renderPushOffer();
    };
    const showPushIphoneHint = () => showDialog(PUSH_OFFER_TITLE, `
        <div id="push-offer-ios" class="flex flex-col gap-3">
            <div class="flex items-center gap-3">${uiArt('sova-zvonek', 'h-20 w-20 -my-1')}
                <p class="min-w-0 text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">Umím ti dát vědět, když začíná tvůj zápas v turnaji nebo tě někdo vyzve. Na iPhonu to jde jen v aplikaci na ploše.</p></div>
            <p class="flex items-center gap-2 rounded-2xl bg-white p-3 text-sm font-black leading-snug text-slate-700 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700/70"><i data-lucide="info" class="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300"></i>${escapeHtml(PUSH_TEXTS.iphone)}.</p>
            <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Pak zapni upozornění v Nastavení → Hra.</p>
            <button type="button" data-close data-autofocus class="${PRIMARY_BUTTON}">Rozumím</button>
        </div>`);
    // Otevření záložky Více hráčů (přepnutí nebo spuštění aplikace rovnou na ní): počítá se pro účet; od 3. otevření nabídka (podle pravidel výše)
    let pushHomeTabSeen = '';
    const notePushHomeTab = () => {
        const tab = homeTab();
        const entered = tab === 'multi' && pushHomeTabSeen !== 'multi';
        pushHomeTabSeen = tab;
        const user = signedUser();
        if (!entered || !user || !Push || !Push.configured()) return;
        const record = pushOfferOf(user.id);
        if (record.done) return;
        const opens = Math.min(record.opens + 1, 99);
        savePushOffer(user.id, { opens });
        if (opens >= PUSH_OFFER_MULTI) schedulePushOffer('multi');
    };
    const changePushPref = async (key) => {
        const user = signedUser();
        // Dvojí klepnutí během ukládání by poslalo stejnou změnu dvakrát (z původního stavu): další volba až po odpovědi
        if (!Push || !user || !pushPrefs || pushBusy) return;
        pushBusy = true;
        const next = { ...pushPrefs, [key]: !pushPrefs[key] };
        try { pushPrefs = await Push.savePrefs(user.id, next); meNote = 'Uloženo.'; } catch (error) { meNote = 'Uložení se nepodařilo, zkus to znovu.'; }
        pushBusy = false;
        // Zavřené Nastavení se po uložení znovu neotevře
        if (document.getElementById('settings-overlay')) openSettings(meNote, `[data-push-pref="${key}"]`);
    };
    // Záložky Nastavení: Hra (hra a aplikace, jen pro mě), Profil (jak mě vidí ostatní; jen přihlášený) a Mudrlant (sova). Dřívější
    // záložka Vzhled ('look', starší odkazy) se otevře jako Mudrlant: oblek a doplňky jsou tam, téma ve Hře, rámeček a titul v Profilu.
    const SETTINGS_TABS = [['game', 'gamepad-2', 'Hra'], ['profile', 'user-round', 'Profil'], ['owl', 'sparkles', 'Mudrlant']];
    // Po překreslení okna se fokus vrátí na ovládací prvek, na který hráč klepl (podle jeho prvního data-* atributu)
    const focusSelectorOf = (element) => {
        const control = element && element.closest ? element.closest('button, select, input') : null;
        const attr = control ? [...control.attributes].find(entry => entry.name.startsWith('data-')) : null;
        return attr ? `[${attr.name}="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(attr.value) : attr.value}"]` : null;
    };
    const openSettings = (note = '', focusSelector = null, tab = null) => {
        closeChooser();
        const user = signedUser();
        if (tab) meTab = tab === 'look' ? 'owl' : tab;
        if (meTab === 'owl' && !Owl) meTab = 'game';
        if (meTab === 'owl' || meTab === 'profile') touchTip('look');
        if ((!user || !Social) && meTab === 'profile') meTab = 'game';
        if (user && Social && !meDraft) {
            const base = myProfile || { display_name: user.name, avatar: '🦊', color: 'emerald' };
            // Staré emoji odměny se v rozpracovaném profilu rovnou ukáže jako postavička, která ho nahradila (a tak se i uloží)
            const avatar = Look && Look.avatarCode && Look.avatarCode(base.avatar) ? Look.avatarCode(base.avatar) : base.avatar;
            meDraft = { name: base.display_name, avatar, color: base.color, owl: Boolean(base.owl && Owl), pose: base.owl && Owl && Look ? myPose() : null };
            pictureGroup = null;
            colorTarget = 'bg';
            hueOpen = false;
            if (!myProfile) loadMyProfile().then(() => { if (!meDirty && document.getElementById('settings-overlay')) { meDraft = null; openSettings(meNote); } });
        }
        let overlay = document.getElementById('settings-overlay');
        const reopened = Boolean(overlay);
        if (!reopened) refreshPush();
        const scroll = reopened && overlay.firstElementChild ? overlay.firstElementChild.scrollTop : 0;
        // Vodorovné řady (rámečky, doplňky, barvy…) si po překreslení nechají posun, ať klepnutí na zamčenou věc neskočí na začátek řady
        const stripScroll = reopened && overlay.dataset.stripTab === meTab ? [...overlay.querySelectorAll('.overflow-x-auto')].map(el => el.scrollLeft) : null;
        // Mřížka obrázků (víc než tři řádky se posouvají uvnitř): posun zůstane, dokud je otevřená stejná skupina
        const oldStrip = reopened ? overlay.querySelector('[data-avatar-strip]') : null;
        const pictureScroll = oldStrip && overlay.dataset.stripTab === meTab ? { group: oldStrip.dataset.group, top: oldStrip.scrollTop } : null;
        if (!overlay) overlay = createSettingsOverlay();
        const state = Auth ? Auth.getState() : { configured: false };
        const profile = user ? (myProfile || { display_name: user.name, avatar: '🦊', color: 'emerald' }) : null;
        const shown = profile && meTab === 'profile' && meDraft ? { ...profile, ...{ avatar: meDraft.avatar, color: meDraft.color, owl: meDraft.owl ? ownOwlText(meDraft.pose) : null, draft: true } } : profile;
        const level = levelProgress(loadProgress().xp);
        const noteText = note || meNote;
        const tabList = SETTINGS_TABS.filter(([id]) => (id !== 'profile' || (user && Social)) && (id !== 'owl' || Owl));
        const tabs = `
            <div role="tablist" class="mt-3 flex gap-1 rounded-2xl bg-slate-200/70 p-1 short:mt-1.5 dark:bg-slate-800">
                ${tabList.map(([id, icon, label]) => `
                    <button type="button" role="tab" data-me-tab="${id}" aria-selected="${meTab === id}" class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl min-h-[2.75rem] short:min-h-[2.5rem] px-2 text-[13px] font-black ${meTab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-400'}"><i data-lucide="${icon}" class="h-4 w-4 shrink-0"></i> ${label}</button>`).join('')}
            </div>`;
        // Karta Hra: varianta a obtížnost jako kompaktní karty, barevná témata aplikace ve dvou řadách, přepínače (procvičování, tipy, zvuky,
        // upozornění) jako řádky jednoho seznamu a pod ním účet (přijímané výzvy, zablokovaní, odhlášení) – vejde se bez posouvání
        // Účet jako poslední řádek seznamu se třemi buňkami (ikona nad názvem): přijímané výzvy, zablokovaní hráči (počet na ikoně), odhlášení
        const ACCOUNT_CELL = 'flex min-h-[2.75rem] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center transition-colors active:bg-slate-50 dark:active:bg-slate-700/40';
        const ACCOUNT_LABEL = 'block max-w-full truncate text-[11px] font-black leading-tight text-slate-700 dark:text-slate-200';
        const accountRow = user && Social ? `
            <div data-account-row class="grid ${Friends ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-slate-100 dark:divide-slate-700/70">
                <button type="button" data-open-accept title="${escapeHtml(`Přijímané výzvy: ${acceptSummary()}`)}" aria-label="${escapeHtml(`Přijímané výzvy: ${acceptSummary()}`)}" class="${ACCOUNT_CELL}"><i data-lucide="shield-check" class="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="${ACCOUNT_LABEL}">Přijímané výzvy</span></button>
                ${Friends ? `<button type="button" data-open-blocked aria-label="Zablokovaní hráči: ${myBlocks ? myBlocks.length : 'načítám'}" title="Zablokovaní hráči" class="${ACCOUNT_CELL}"><span class="relative"><i data-lucide="ban" class="h-4 w-4 text-brand-700 dark:text-brand-300"></i>${myBlocks && myBlocks.length ? `<span class="absolute -right-3 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">${myBlocks.length}</span>` : ''}</span><span class="${ACCOUNT_LABEL}">Zablokovaní</span></button>` : ''}
                <button type="button" data-auth-logout class="${ACCOUNT_CELL}"><i data-lucide="log-out" class="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="${ACCOUNT_LABEL}">Odhlásit</span></button>
            </div>` : '';
        const gameBody = `
            <h3 class="${ME_HEADING} mb-1 short:mb-0.5">Varianta hry</h3>
            <div class="grid grid-cols-2 gap-2">${renderVariantCompact(gameVariant)}</div>
            <h3 class="${ME_HEADING} mb-1 mt-2 short:mb-0.5 short:mt-1.5">Obtížnost otázek<span class="font-bold normal-case tracking-normal"> · pro témata a mix</span></h3>
            <div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Obtížnost">${renderTierButtons(TOGGLE_ON, null, true, false, true)}</div>
            ${state.configured && !user ? `
                <button type="button" data-auth-login class="mt-2 short:mt-1.5 flex w-full items-center gap-3 rounded-2xl btn-3d bg-brand-700 px-4 py-2 text-left text-white">
                    <i data-lucide="log-in" class="h-5 w-5 shrink-0"></i>
                    <span class="min-w-0 flex-1"><span class="block text-[15px] font-black leading-tight">Přihlásit se přes Google</span><span class="block text-[11px] font-semibold leading-snug text-white/90">Uloží se postup a půjde hrát s ostatními</span></span>
                    <i data-lucide="chevron-right" class="h-4 w-4 shrink-0"></i>
                </button>
                ${state.error ? `<p class="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-400" role="alert">${escapeHtml(state.error)}</p>` : ''}` : ''}
            ${Look ? `<div class="mt-2 short:mt-1.5">${lookSections('game')}</div>` : ''}
            <div class="mt-2 short:mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-700/70 dark:bg-slate-800 dark:ring-slate-700/70">
                ${Review ? settingRow({ attrs: 'data-review-toggle', icon: 'repeat', title: 'Procvičování chyb', text: reviewEnabled() ? 'Vrací se po 1, 3, 7, 14 a 30 dnech' : 'Chyby se nevrací, nic nečeká', on: reviewEnabled() }) : ''}
                ${Tips ? settingRow({ attrs: 'data-tips-toggle', icon: 'lightbulb', title: 'Tipy od Mudrlanta', text: tipsOn() ? 'Žárovka občas ukáže funkci hry' : 'Žárovka ukáže jen zajímavost dne', on: tipsOn() }) : ''}
                ${soundRows()}
                ${DailyQuiz && quizSkipIntro() ? settingRow({ attrs: 'data-quiz-intro-toggle', icon: 'timer', title: 'Úvod Kvízu dne', text: 'Vypnutý, kvíz začne rovnou', on: false }) : ''}
                ${pushPanel()}
                ${accountRow}
            </div>
            ${renderDevPanel()}`;
        // Karta Profil (jak mě vidí ostatní): přezdívka, profilový obrázek ve třech skupinách s řadou barev, rámeček, titul u jména, Uložit.
        // Přezdívka, obrázek a barvy se uloží tlačítkem, rámeček a titul hned po výběru (jako dřív ve Vzhledu).
        const profileBody = user && Social && meDraft ? (() => {
            const group = pictureGroups().some(([id]) => id === pictureGroup) ? pictureGroup : pictureGroupOf(meDraft);
            return `
            <form id="profile-form" class="flex flex-col gap-2 short:gap-1.5" autocomplete="off">
                <section data-picture aria-label="Profilový obrázek" class="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm dark:bg-slate-800">
                    <div role="tablist" aria-label="Profilový obrázek" class="grid ${pictureGroups().length > 3 ? 'grid-cols-4' : 'grid-cols-3'} gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-slate-900/60">${pictureGroups().map(([id, label]) => `<button type="button" role="tab" data-pic-group="${id}" aria-selected="${group === id}" class="min-h-[2.25rem] min-w-0 truncate rounded-[0.6rem] px-1 text-[12px] font-black max-[380px]:px-0.5 max-[380px]:text-[11.5px] ${group === id ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600' : 'text-slate-600 dark:text-slate-300'}">${label}</button>`).join('')}</div>
                    <div data-avatar-strip data-group="${group}" class="grid max-h-[9.125rem] min-h-[7.75rem] grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] content-start justify-items-center gap-0.5 overflow-y-auto overscroll-contain">${pictureTiles(group)}</div>
                    ${pictureColors()}
                </section>
                ${lookSections('profile', { ...lookContext(), profile: shown })}
                <button type="submit" data-save-profile class="${PRIMARY_BUTTON} short:py-2.5"><i data-lucide="check" class="h-5 w-5"></i> Uložit</button>
            </form>`;
        })() : '';
        const owlBody = `<div class="flex flex-col gap-2 short:gap-1.5">${lookSections('owl')}${owlAvatarRow(user)}</div>`;
        // V Profilu je přezdívka pole přímo v hlavičce vedle náhledu obrázku (patří k formuláři přes form="profile-form")
        const nameField = meTab === 'profile' && profileBody ? `<label class="block"><span class="sr-only">Přezdívka (jedinečná, podle ní tě ostatní najdou)</span>
                            <span class="relative block"><input id="profile-name" form="profile-form" type="text" maxlength="${Social.NAME_MAX}" value="${escapeHtml(meDraft.name)}" title="Přezdívka: jedinečná, podle ní tě ostatní najdou" class="h-9 w-full rounded-xl border-2 border-slate-200 bg-white py-0 pl-2.5 pr-8 text-base font-black text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"><i data-lucide="pencil" class="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500"></i></span></label>` : '';
        overlay.innerHTML = `
            <div class="${reopened ? '' : 'fade-in '}max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-slate-50 p-4 short:max-h-[calc(100dvh-0.75rem)] short:py-2.5 max-[380px]:px-3 dark:bg-slate-900">
                <div class="flex items-center gap-3">
                    ${shown ? avatarHtml(shown, 'h-14 w-14 text-3xl short:h-12 short:w-12') : owlLogo('shrink-0 mt-1', 'h-14 w-auto drop-shadow-md short:h-12')}
                    <div class="min-w-0 flex-1">
                        <h2 id="settings-title" class="${nameField ? 'sr-only' : 'truncate text-lg font-black leading-tight text-slate-800 dark:text-slate-100'}">${user ? escapeHtml(playerName(profile)) : 'Nastavení'}</h2>
                        ${nameField || `<p class="truncate text-xs text-slate-500 short:hidden dark:text-slate-400">${user ? escapeHtml(user.email || user.name) : 'Hraješ bez účtu'}</p>`}
                        ${meTab === 'profile' && profileBody && showcaseMiniButton() ? `<div class="mt-1.5 flex items-center justify-between gap-2"><button type="button" data-open-progress class="flex min-w-0 items-center gap-1 text-left text-[11px] font-black text-brand-700 dark:text-cream">${escapeHtml(ownTitleText(level.level))} <i data-lucide="chevron-right" class="h-3 w-3 shrink-0"></i></button>${showcaseMiniButton()}</div>`
                            : `<button type="button" data-open-progress class="mt-0.5 flex items-center gap-1 text-[11px] font-black text-brand-700 dark:text-cream">${escapeHtml(ownTitleText(level.level))} <i data-lucide="chevron-right" class="h-3 w-3"></i></button>`}
                    </div>
                    <button type="button" data-close aria-label="Zavřít" class="-m-0.5 self-start rounded-xl p-2.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                ${tabs}
                <div class="mt-3 short:mt-1.5">${meTab === 'profile' && profileBody ? profileBody : meTab === 'owl' ? owlBody : gameBody}</div>
                <p id="settings-note" class="${noteText ? 'mt-2 ' : ''}text-xs font-semibold ${noteText.startsWith('Uloženo') || !meNote ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-400'}" role="status">${escapeHtml(noteText)}</p>
                ${renderSchemaBanner()}
                ${meTab === 'game' ? `
                <div class="mt-1 flex flex-wrap items-center justify-center gap-x-0.5 text-xs text-slate-500 short:mt-0.5 dark:text-slate-400">
                    <span id="app-version" class="px-1">${escapeHtml(versionLabel())}</span>
                    <button type="button" data-update-app class="-my-2 inline-flex min-h-[2.5rem] items-center rounded-lg px-1.5 font-bold text-slate-600 underline underline-offset-2 hover:bg-slate-200 disabled:no-underline dark:text-slate-300 dark:hover:bg-slate-800">Aktualizovat</button>
                    <button type="button" data-tutorial-restart class="-my-2 inline-flex min-h-[2.5rem] items-center rounded-lg px-1.5 font-bold underline underline-offset-2 hover:bg-slate-200 dark:hover:bg-slate-800">Tutoriál</button>
                    <a href="soukromi.html" class="-my-2 inline-flex min-h-[2.5rem] items-center rounded-lg px-1.5 font-bold underline underline-offset-2">Osobní údaje</a>
                    <a href="licence.html" class="-my-2 inline-flex min-h-[2.5rem] items-center rounded-lg px-1.5 font-bold underline underline-offset-2">Zdroje a licence</a>
                    ${user && Social ? '<button type="button" data-open-privacy class="-my-2 inline-flex min-h-[2.5rem] items-center rounded-lg px-1.5 font-bold underline underline-offset-2">Moje data</button>' : ''}
                </div>` : ''}
            </div>`;
        overlay.firstElementChild.scrollTop = scroll;
        if (stripScroll) overlay.querySelectorAll('.overflow-x-auto').forEach((el, index) => { if (stripScroll[index]) el.scrollLeft = stripScroll[index]; });
        const strip = overlay.querySelector('[data-avatar-strip]');
        if (strip && pictureScroll && pictureScroll.group === strip.dataset.group) strip.scrollTop = pictureScroll.top;
        else if (strip) {
            // Nově otevřená skupina: vybraný obrázek, který je až pod viditelnými řádky, se posune do mřížky
            const on = strip.querySelector('[aria-pressed="true"]');
            const below = on ? on.getBoundingClientRect().bottom - strip.getBoundingClientRect().bottom : 0;
            if (below > 0) strip.scrollTop += below + 2;
        }
        overlay.dataset.stripTab = meTab;
        renderIcons(overlay);
        const target = focusSelector ? overlay.querySelector(focusSelector) : (meTab === 'game' ? overlay.querySelector('[data-variant][aria-pressed="true"]') : null);
        (target || overlay.querySelector('[data-close]')).focus({ preventScroll: true });
    };
    // Dlaždice obrázku v Profilu: 40 × 40 px v mřížce (21 obrázků = tři řádky po sedmi i na 360 px). Víc obrázků (vlastněné sezónní
    // postavičky) se posouvá uvnitř mřížky: vidět je půl čtvrtého řádku, ať je jasné, že jich je víc, a okno Nastavení se neposouvá
    const AVATAR_TILE = 'flex h-10 w-10 items-center justify-center rounded-xl border-2 text-xl active:scale-95';
    const AVATAR_ON = 'border-brand-600 bg-brand-50 dark:bg-brand-900/40';
    const AVATAR_OFF = 'border-transparent bg-slate-50 dark:bg-slate-700/50';
    const LEGEND_OFF = 'border-gold-300 bg-gold-50 dark:border-gold-600/70 dark:bg-gold-900/20';
    const OWL_AVATAR_KEY = 'mudrlant.owlAvatar';
    const saveMeProfile = async () => {
        const user = signedUser();
        if (!user || !Social || !meDraft) return;
        const input = document.getElementById('profile-name');
        if (input) meDraft.name = input.value;
        // Zamčený obrázek se neuloží (výběr ho nepustí; tohle hlídá i rozpracovaný profil z jiné cesty)
        const locked = !meDraft.owl ? avatarLock(meDraft.avatar) : null;
        if (locked) {
            meNote = `${locked.title} se odemkne: ${avatarUnlockText(locked)}.`;
            if (document.getElementById('settings-overlay')) openSettings(meNote, '[data-save-profile]');
            return;
        }
        try {
            const owlText = meDraft.owl ? ownOwlText(meDraft.pose) : null;
            myProfile = await Social.saveProfile(user.id, { ...meDraft, owl: owlText });
            // Zvolená sova titulu (nebo sova s doplňky) se pamatuje ve Vzhledu: platí pro mou profilovku i pro pozdější přeuložení sovy
            if (meDraft.owl && Look) Look.setPref('pose', meDraft.pose || null);
            // Volba sovy se pamatuje i v zařízení: v databázi bez sloupce owl (schema.sql ještě nebylo znovu spuštěno) by se jinak ztratila
            // a profilovka by zůstala emoji. Ostatní hráči ji uvidí až po spuštění schematu.
            writeJson(OWL_AVATAR_KEY, Boolean(meDraft.owl));
            // Vlastní odstín se pamatuje i v zařízení (starší schéma ho do databáze neuloží, tam jde nejbližší pojmenovaná barva)
            writeJson(AVATAR_COLOR_KEY, Social.customHue(meDraft.color) !== null ? meDraft.color : null);
            if (Social.customHue(meDraft.color) !== null && myProfile.color !== meDraft.color) myProfile = { ...myProfile, color: meDraft.color };
            if (meDraft.owl && !myProfile.owl) myProfile = { ...myProfile, owl: owlText };
            meNote = 'Uloženo.';
            meDirty = false;
            updateProfileButton();
            paintChallenges();
        } catch (error) {
            meNote = error.status === 400 || error.status === 409 ? error.message : 'Uložení se nepodařilo, zkus to znovu.';
        }
        if (document.getElementById('settings-overlay')) openSettings(meNote, '[data-save-profile]');
    };
    // --- Moje data: export a smazání účtu (Nastavení → Hra, odkaz pod oknem) ---
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
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 backdrop-blur-sm short:p-1.5 sm:items-center';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) {
                closeSettings();
                return;
            }
            // Rozepsaná přezdívka přežije každé překreslení (výběr rámečku, skupiny obrázků, barvy…)
            const input = document.getElementById('profile-name');
            if (input && meDraft) meDraft.name = input.value;
            const lookEl = event.target.closest('[data-look]');
            if (lookEl && Look) {
                const section = Look.getSections().find(entry => entry.id === lookEl.dataset.look);
                if (section && section.click && section.click(event, lookContext())) { updateControlsUI(); openSettings('', focusSelectorOf(event.target), meTab); }
                return;
            }
            const tabButton = event.target.closest('[data-me-tab]');
            if (tabButton) {
                meNote = '';
                openSettings('', `[data-me-tab="${tabButton.dataset.meTab}"]`, tabButton.dataset.meTab);
                return;
            }
            // Profil → obrázek: skupina (Mudrlant, Postavičky, Zvířátka), co přebarvit (pozadí nebo část postavičky), barva části, všechny barvy pozadí
            const groupButton = event.target.closest('[data-pic-group]');
            if (groupButton && meDraft) {
                pictureGroup = groupButton.dataset.picGroup;
                if (pictureGroup === 'legendy') touchTip('legends');
                openSettings(meNote, `[data-pic-group="${pictureGroup}"]`);
                return;
            }
            const targetChip = event.target.closest('[data-color-target]');
            if (targetChip && meDraft) {
                colorTarget = targetChip.dataset.colorTarget;
                openSettings(meNote, `[data-color-target="${colorTarget}"]`);
                return;
            }
            const partButton = event.target.closest('[data-pick-part]');
            if (partButton && meDraft && Look) {
                const [part, color] = partButton.dataset.pickPart.split(':').map(Number);
                const pic = Look.avatarPicture(meDraft.avatar);
                if (!pic || meDraft.owl || !(part >= 1 && part <= pic.item.parts.length)) return;
                const colors = [...pic.colors];
                colors[part - 1] = color;
                meDraft.avatar = Look.formatAvatar(pic.item.id, colors);
                rememberPartColors(meDraft.avatar);
                meDirty = true;
                meNote = '';
                openSettings('', `[data-pick-part="${part}:${color}"]`);
                return;
            }
            if (event.target.closest('[data-pick-hue-open]') && meDraft) {
                hueOpen = true;
                // Posuvník začne u odstínu dosavadní barvy pozadí, náhled ho hned ukáže
                if (Social.customHue(meDraft.color) === null) { meDraft.color = `h${BG_HUES[meDraft.color] ?? 160}`; meDirty = true; }
                meNote = '';
                openSettings('', '[data-pick-hue]');
                return;
            }
            if (event.target.closest('[data-hue-close]') && meDraft) {
                hueOpen = false;
                openSettings(meNote, '[data-pick-hue-open]');
                return;
            }
            if (event.target.closest('[data-auth-login]')) { startLogin(); return; }
            if (event.target.closest('[data-auth-logout]')) {
                // Odhlášený hráč nesmí na tomhle zařízení dál dostávat upozornění: odběr se smaže ještě za přihlášení
                closeSettings();
                (Push ? Push.disable().catch(() => {}) : Promise.resolve()).then(() => Auth.logout());
                return;
            }
            if (event.target.closest('[data-quiz-intro-toggle]')) {
                setQuizSkipIntro(false);
                openSettings('Úvod Kvízu dne se zase ukáže.');
                return;
            }
            if (event.target.closest('[data-tips-toggle]')) {
                writeTipsState(Tips.setOff(readTipsState(), tipsOn()));
                updateFactHint();
                openSettings(tipsOn() ? 'Tipy od Mudrlanta jsou zapnuté.' : 'Tipy od Mudrlanta jsou vypnuté.', '[data-tips-toggle]');
                return;
            }
            // Zvuky a vibrace: zapnutí hned předvede, jak znějí (klepnutí je gesto, AudioContext se smí probudit)
            if (event.target.closest('[data-sound-toggle]') && Sound) {
                const on = !Sound.prefs().sound;
                Sound.set({ sound: on });
                if (on) Sound.play('correct');
                openSettings(on ? 'Zvuky jsou zapnuté.' : 'Zvuky jsou vypnuté.', '[data-sound-toggle]');
                return;
            }
            if (event.target.closest('[data-vibration-toggle]') && Sound) {
                const on = !Sound.prefs().vibration;
                Sound.set({ vibration: on });
                if (on) Sound.vibrate('wrong');
                openSettings(on ? 'Vibrace jsou zapnuté.' : 'Vibrace jsou vypnuté.', '[data-vibration-toggle]');
                return;
            }
            if (event.target.closest('[data-review-toggle]')) {
                writeJson(KEYS.reviewOn, !reviewEnabled());
                updateControlsUI();
                openSettings(reviewEnabled() ? 'Procvičování chyb je zapnuté.' : 'Procvičování chyb je vypnuté.', '[data-review-toggle]');
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
            // Okna z Nastavení se křížkem i tlačítkem zpět vrací do Nastavení (na stejnou záložku)
            const fromSettings = (open) => { closeSettings(); openChild('Zpět do Nastavení', () => { closeDialog(); openSettings(); }, open); };
            if (event.target.closest('[data-open-progress]')) { fromSettings(openProgress); return; }
            if (event.target.closest('[data-open-showcase]')) { fromSettings(openShowcase); return; }
            if (event.target.closest('[data-open-accept]')) { fromSettings(openAccepted); return; }
            if (event.target.closest('[data-open-blocked]')) { fromSettings(openBlockedList); return; }
            const devButton = event.target.closest('[data-dev]');
            if (devButton && devButton.dataset.dev.startsWith('tour-')) { devTournamentAction(devButton.dataset.dev); return; }
            if (devButton && devButton.dataset.dev === 'errors') { closeSettings(); openClientErrors(); return; }
            if (devButton && devButton.dataset.dev === 'push-diag') { openPushDiagnostics(); return; }
            if (devButton && devButton.dataset.dev === 'push-local') { devPushLocal(); return; }
            if (devButton && devButton.dataset.dev === 'push-server') { devPushServer(); return; }
            if (devButton && devButton.dataset.dev === 'reports') { openQuestionReports(); return; }
            if (devButton && devButton.dataset.dev === 'suspicious') { openSuspiciousQuestions(); return; }
            if (devButton && devButton.dataset.dev === 'player-reports') { closeSettings(); openDevReports(); return; }
            if (devButton && devButton.dataset.dev === 'tips') {
                if (Tips) writeTipsState(Tips.reset(readTipsState()));
                updateFactHint();
                openSettings('Hotovo: tipy se ukážou znovu (od prvního)', '[data-dev="tips"]');
                return;
            }
            if (devButton && devButton.dataset.dev === 'bulb') {
                // Vrátí žárovku u sovy: zapomene, že dnešní událost už hráč přečetl
                try { localStorage.removeItem(FACT_KEY); } catch (e) { /* bez úložiště se nic nevrací */ }
                updateControlsUI();
                openSettings(dailyFact ? 'Hotovo: žárovka je zpátky' : 'Dnes žádná událost není (žárovka se neukáže)', '[data-dev="bulb"]');
                return;
            }
            if (devButton && devButton.dataset.dev === 'chest') { devApply('chest'); closeSettings(); updateControlsUI(); openChestOverlay(); return; }
            if (devButton && devButton.dataset.dev === 'season') { devApply('season'); closeSettings(); updateControlsUI(); openSeason(); return; }
            if (devButton) { devApply(devButton.dataset.dev); updateControlsUI(); openSettings(`Hotovo: ${devButton.textContent.trim()}`, `[data-dev="${devButton.dataset.dev}"]`); return; }
            const lockedOwl = event.target.closest('[data-locked-owl]');
            if (lockedOwl && Look) {
                const pose = Look.findPose(lockedOwl.dataset.lockedOwl);
                if (pose) openSettings(`Sova titulu ${tierTitles(pose.tier)[0]} se odemkne od úrovně ${pose.level}.`, `[data-locked-owl="${pose.id}"]`);
                return;
            }
            const locked = event.target.closest('[data-locked-avatar]');
            if (locked && Look) {
                const item = Look.avatarItem(locked.dataset.lockedAvatar);
                const topic = item && item.diploma ? TOPIC_BY_ID[item.diploma] : null;
                if (item) openSettings(item.diploma ? (topic && Rewards ? `${item.title} se odemkne diplomem „${Rewards.diplomaTitle(topic)}“ (plné mistrovství tématu ${topic.title}).` : `${item.title}: ${Look.unlockText(item)}.`)
                    : item.badge ?`${item.title} se odemkne odznakem „${(BADGE_BY_ID[item.badge] || {}).title || item.badge}“.` : `${item.title} se odemkne na úrovni ${item.level}.`, `[data-locked-avatar="${locked.dataset.lockedAvatar}"]`);
                return;
            }
            if (event.target.closest('[data-owl-as-avatar]')) { useOwlAsAvatar(); return; }
            const avatar = event.target.closest('[data-pick-avatar]');
            const color = event.target.closest('[data-pick-color]');
            const pickOwl = event.target.closest('[data-pick-owl]');
            if ((avatar || color || pickOwl) && meDraft) {
                if (pickOwl) {
                    // Prázdná hodnota = sova s doplňky, jinak sova titulu (jen dosaženého)
                    const pose = Look && pickOwl.dataset.pickOwl ? Look.findPose(pickOwl.dataset.pickOwl) : null;
                    if (pose && levelProgress(loadProgress().xp).level < pose.level) return;
                    meDraft.owl = true;
                    meDraft.avatar = '🦉';
                    meDraft.pose = pose ? pose.id : null;
                }
                if (avatar) {
                    const value = avatar.dataset.pickAvatar;
                    if (avatarLock(value)) return;
                    // Znovu vybraná postavička si nechá barvy částí, jiná dostane barvy, které jí hráč nastavil naposledy (jinak původní)
                    const same = !meDraft.owl && Look && Look.avatarPicture && Look.avatarPicture(meDraft.avatar) && Look.avatarPicture(meDraft.avatar).item.id === value;
                    if (!same) { rememberPartColors(meDraft.avatar); meDraft.avatar = rememberedPartColors(value); }
                    meDraft.owl = false;
                }
                if (color) { meDraft.color = color.dataset.pickColor; hueOpen = false; }
                meDirty = true;
                meNote = '';
                openSettings('', pickOwl ? `[data-pick-owl="${meDraft.pose || ''}"]` : avatar ? `[data-pick-avatar="${avatar.dataset.pickAvatar}"]` : `[data-pick-color="${meDraft.color}"]`);
                return;
            }
            const variantButton = event.target.closest('[data-variant]');
            if (variantButton) changeVariant(variantButton.dataset.variant);
            const tierButton = event.target.closest('[data-tier]');
            if (tierButton) changeSettings({ tier: tierButton.dataset.tier }, `[data-tier="${tierButton.dataset.tier}"]`);
        });
        // Posuvníky a výběry (odstín pozadí, titul u jména, odstín doplňku, vlajka)
        overlay.addEventListener('change', (event) => {
            const input = document.getElementById('profile-name');
            if (input && meDraft) meDraft.name = input.value;
            const hueRange = event.target.closest('[data-pick-hue]');
            if (hueRange && meDraft) {
                meDraft.color = `h${Math.round(Number(hueRange.value) / 5) * 5 % 360}`;
                meDirty = true;
                meNote = '';
                openSettings('', '[data-pick-hue]');
                return;
            }
            const lookEl = event.target.closest('[data-look]');
            const section = lookEl && Look ? Look.getSections().find(entry => entry.id === lookEl.dataset.look) : null;
            if (section && section.change && section.change(event, lookContext())) { updateControlsUI(); openSettings('', focusSelectorOf(event.target), meTab); }
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
        if (screen === 'mode') note = 'Uloženo. Bleskovka a Přežití se hrají vždy s výběrem z možností.';
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

    // Na nízkém displeji (short:) nižší přepínače bez ozdobné ikony tématu: výběr se vejde bez posouvání
    const chooserToggle = (attribute, value, isOn, icon, label, on) => `
        <button type="button" ${attribute}="${escapeHtml(value)}" aria-pressed="${isOn}" class="flex min-h-[2.75rem] items-center gap-1.5 rounded-xl border-2 px-2 py-1 text-left text-[13px] font-bold leading-tight transition-colors active:scale-[0.98] short:min-h-[2.5rem] short:py-0.5 ${isOn ? on : TOGGLE_OFF}">
            <i data-lucide="${isOn ? 'square-check-big' : 'square'}" class="h-4 w-4 shrink-0"></i>
            <i data-lucide="${icon}" class="h-4 w-4 shrink-0 opacity-70 short:hidden"></i>
            <span class="min-w-0">${escapeHtml(label)}</span>
        </button>`;

    const renderChooser = (note = '', focusSelector = null) => {
        const overlay = document.getElementById('play-chooser');
        if (!overlay || !chooser) return;
        const isMix = chooser.kind === 'mix';
        const topic = isMix ? MIX : TOPIC_BY_ID[chooser.topic];
        const style = styleOf(topic);
        // Po „Zrušit vše“ (chooser.empty) není vybrané nic; první klepnutí vybere jen to jedno
        const options = isMix
            ? TOPICS.map(other => chooserToggle('data-chooser-topic', other.id, !chooser.empty && settings.topics.includes(other.id), other.icon, other.title, styleOf(other).on)).join('')
            : topic.categories.map(category => chooserToggle('data-chooser-category', category.key, !chooser.empty && selectedCategories(topic).includes(category.key), category.icon, category.label, style.on)).join('');
        // Překreslení po klepnutí bez úvodní animace a se stejným posunutím
        const previous = overlay.firstElementChild;
        const scroll = previous ? previous.scrollTop : 0;
        // Upozornění („Vyber aspoň jedno téma.“) místo podnadpisu, ať okno nenaroste a nezačne se posouvat; v posunutém okně
        // (nízký displej na šířku) zůstane v lepkavé části u Hrát, kde je vidět
        const noteInHead = Boolean(note) && scroll === 0;
        // Nahoře velká tlačítka Hrát, pod ním v jednom řádku Bleskovka, Přežití a Ukaž na mapě (lepkavě: při posouvání dlouhého výběru
        // zůstanou vidět), pod nimi výběr témat či kategorií a obtížnost. Okno jako Nastavení: skoro přes celou výšku, ať se vejde bez posouvání.
        overlay.innerHTML = `
            <div class="${previous ? '' : 'fade-in '}max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-slate-50 px-4 pb-4 pt-4 shadow-2xl short:max-h-[calc(100dvh-0.75rem)] short:pb-3 short:pt-3 dark:bg-slate-900">
                <div class="mb-2 flex items-center gap-3 short:mb-1.5">
                    ${topicIcon(topic, 'h-12 w-12 short:h-10 short:w-10', `shrink-0 rounded-2xl bg-gradient-to-br p-2.5 short:p-2 text-white ${style.tile}`, 'h-6 w-6')}
                    <div class="min-w-0 flex-1">
                        <h2 id="chooser-title" class="text-lg font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(topic.title)}</h2>
                        ${noteInHead
                            ? `<p id="chooser-note" class="text-sm font-semibold leading-snug text-rose-700 short:text-xs dark:text-rose-400" role="status">${escapeHtml(note)}</p>`
                            : `<p class="text-sm leading-snug text-slate-500 short:text-xs dark:text-slate-400">${isMix ? 'Z jakých témat chceš otázky?' : 'Co chceš hrát?'}</p>`}
                    </div>
                    <button type="button" data-close aria-label="Zavřít" class="-m-0.5 rounded-xl p-2.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                <div data-chooser-actions class="sticky -top-4 z-10 -mx-4 bg-slate-50 px-4 pb-2 pt-1 short:-top-3 dark:bg-slate-900">
                ${noteInHead ? '' : `<p id="chooser-note" class="${note ? 'mb-1.5 ' : ''}text-sm font-semibold text-rose-700 dark:text-rose-400" role="status">${escapeHtml(note)}</p>`}
                <button type="button" data-chooser-play class="flex w-full items-center justify-center gap-2 rounded-[1.2rem] py-3.5 text-xl font-black text-white shadow-lg transition-all active:scale-95 short:py-2 ${style.button} btn-3d">
                    <i data-lucide="play" class="h-6 w-6"></i> Hrát
                </button>
                ${modeChooserButtons(Boolean(MapQuestion && (isMix || MAP_TOPICS.includes(chooser.topic))))}
                </div>
                <div class="mb-1.5 mt-2 flex items-center justify-between short:mb-1 short:mt-1">
                    <h3 class="${SETTINGS_HEADING}">${isMix ? 'Témata' : 'Kategorie'}</h3>
                    <span class="-my-3 flex"><button type="button" data-chooser-all class="rounded-lg px-2 py-3 text-xs font-bold ${style.text} underline-offset-2 hover:underline">Vybrat vše</button><button type="button" data-chooser-none class="rounded-lg px-2 py-3 text-xs font-bold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400">Zrušit vše</button></span>
                </div>
                <div class="grid grid-cols-2 gap-1.5 short:gap-1" role="group" aria-label="${isMix ? 'Témata' : 'Kategorie'}">${options}</div>
                <h3 class="${SETTINGS_HEADING} mb-1.5 mt-3 short:mb-1 short:mt-1.5">Obtížnost</h3>
                <div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Obtížnost">${renderTierButtons(style.on, isMix ? null : topic, true, true, true)}</div>
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
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-3 backdrop-blur-sm short:p-1.5 sm:items-center';
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
            const nothing = Boolean(chooser && chooser.empty);
            if (nothing && (category || topicToggle)) {
                chooser.empty = false;
                if (category && topic) saveSettings({ categories: { ...settings.categories, [topic.id]: [category.dataset.chooserCategory] } });
                else if (topicToggle) saveSettings({ topics: [topicToggle.dataset.chooserTopic] });
                renderChooser('', refocus);
            } else if (nothing && (event.target.closest('[data-chooser-play]') || event.target.closest('[data-chooser-mode]'))) {
                renderChooser(topic ? 'Vyber aspoň jeden okruh.' : 'Vyber aspoň jedno téma.', refocus);
            } else if (event.target.closest('[data-chooser-none]')) { chooser.empty = true; renderChooser('', refocus); }
            else if (category && topic) toggleChoice('category', category.dataset.chooserCategory, topic, refocus);
            else if (topicToggle) toggleChoice('topic', topicToggle.dataset.chooserTopic, null, refocus);
            else if (tier) { saveSettings({ tier: tier.dataset.tier }); renderChooser('', refocus); }
            else if (event.target.closest('[data-chooser-all]')) {
                chooser.empty = false;
                if (topic) saveSettings({ categories: { ...settings.categories, [topic.id]: undefined } });
                else saveSettings({ topics: TOPICS.map(other => other.id) });
                renderChooser('', refocus);
            } else if (event.target.closest('[data-chooser-play]')) {
                const pick = chooser;
                closeChooser();
                markSeen(pick.kind === 'mix' ? 'mix' : pick.topic);
                startPractice(pick.kind === 'mix' ? { kind: 'mix' } : { kind: 'topic', topic: pick.topic });
            } else if (event.target.closest('[data-chooser-map]')) {
                // Ukaž na mapě: jen otázky na mapě z místa (Zeměpis, Sport) nebo z obou v Mixu
                const pick = chooser;
                closeChooser();
                startPractice({ kind: 'map', topic: pick.kind === 'topic' && MAP_TOPICS.includes(pick.topic) ? pick.topic : null });
            } else if (event.target.closest('[data-chooser-mode]')) {
                // Bleskovka a Přežití s vybraným tématem (kategoriemi) nebo mixem: úvod s pravidly a rekordy
                const pick = chooser;
                closeChooser();
                markSeen(pick.kind === 'mix' ? 'mix' : pick.topic);
                openModeIntro(event.target.closest('[data-chooser-mode]').dataset.chooserMode, pick.kind === 'mix' ? { kind: 'mix' } : { kind: 'topic', topic: pick.topic });
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
        if (screen === 'quiz' || screen === 'quiz-done') return { icon: 'timer', text: `Kvíz dne · ${shortDay(quiz ? quiz.day : getDayKey())}`, topic: null };
        if (screen === 'mode' && modeGame) return modePlace(modeGame);
        if (screen === 'mystery') return { icon: 'telescope', text: 'Tajemná otázka', topic: null };
        // Úvod: sova z loga, název a dnešní datum
        if (screen !== 'round' || !current) return { logo: true, text: `${APP_NAME} · ${shortDay(getDayKey())}`, date: shortDay(getDayKey()), topic: null };
        const topic = TOPIC_BY_ID[current.topic];
        if (mode === 'daily') return { icon: topic.icon, text: `${topic.title} · ${shortDay(current.dailyDate || getDayKey())}`, topic };
        if (mode === 'challenge' && challenge) return { icon: challenge.tournament ? 'trophy' : 'swords', text: `${challenge.tournament ? 'Turnaj' : 'Výzva'} · ${challenge.index + 1}/${challenge.count}`, topic };
        if (mode === 'quiz') return { icon: topic.icon, text: `Kvíz dne · ${quizIndex + 1}/${DailyQuiz.QUESTIONS}`, topic };
        if (pool.kind === 'mistakes') return { icon: 'repeat', text: `Procvičování chyb · ${loadMistakes().length}`, topic };
        if (pool.kind === 'map') return { icon: 'crosshair', art: 'rezim-mapa', text: `Ukaž na mapě · ${pool.topic ? topic.title : 'Mix'}`, topic };
        if (pool.kind === 'review') return { icon: 'repeat', text: `Procvičování · ${Math.min(pool.done + 1, pool.total)}/${pool.total}`, topic };
        if (pool.kind === 'collection') {
            const ctx = loadedTopics.get(pool.topic);
            return { icon: 'layers', text: ctx ? `${ctx.topic.title} · ${collectionLabel(ctx, pool.collection)}` : 'Procvičování', topic };
        }
        // Mix: symbol tématu právě hrané otázky (bez obrázku tématu šipky Mixu)
        if (pool.kind === 'mix') return { icon: 'shuffle', topicArt: true, text: `Mix · ${topic.title}`, topic, switch: true };
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
        const section = screen === 'learn' ? 'learn' : screen === 'mode' ? 'practice' : screen === 'round' ? (mode === 'daily' || mode === 'challenge' || mode === 'quiz' ? 'home' : fromLearn ? 'learn' : 'practice') : 'home';
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
            chip.innerHTML = `<span class="sr-only">K procvičení: </span>${due}`;
            chip.title = `K procvičení: ${due}`;
        } else if (chip) chip.remove();
        buttons.learn.classList.add('relative');
        buttons.learn.setAttribute('aria-label', due ? `Učení – k procvičení: ${due}` : 'Učení');

        // Při hraní je téma poznat na první pohled: barevný štítek a barevný spodní okraj hlavičky
        const place = describePlace();
        const style = place.topic ? styleOf(place.topic) : null;
        updateFactHint();
        document.getElementById('app-header').className = `${HEADER_BASE} ${style && (screen === 'round' || screen === 'mode') ? style.accent : 'border-slate-200/70 dark:border-slate-800'}`;
        const badge = document.getElementById('status-badge');
        badge.className = place.logo ? BADGE_LOGO
            : `${BADGE_BASE} ${style ? `${style.soft} border-transparent` : 'bg-white text-slate-700 border-slate-200/60 dark:bg-slate-800 dark:border-slate-700'}`;
        badge.disabled = !place.switch && !place.logo;
        badge.title = place.switch ? 'Změnit téma nebo co hrát' : place.logo ? (dailyFact ? 'Mudrlant: tento den v dějinách · text: můj postup' : 'Můj postup: úroveň a mistrovství témat') : '';
        badge.setAttribute('aria-label', place.switch ? `${place.text} – změnit téma` : place.logo ? `${place.text} – můj postup` : place.text);
        document.getElementById('status-switch').classList.toggle('hidden', !place.switch);
        const iconSlot = document.getElementById('status-icon-slot');
        // Symbol tématu (okruhu) je vidět i na úzkém displeji, jen menší; sova na úvodu zůstává
        iconSlot.className = 'flex shrink-0';
        // Režim (Bleskovka, Přežití, Ukaž na mapě) má vlastní ilustraci, téma svou ilustraci, jinak čárová ikona
        iconSlot.innerHTML = place.logo
            ? owlLogo('-my-1', 'h-11 w-auto drop-shadow-md')
            : place.art ? uiArt(place.art, 'h-7 w-7 -my-1 max-[430px]:h-6 max-[430px]:w-6')
            : place.topic && topicArt(place.topic) && (place.icon === place.topic.icon || place.topicArt) ? topicIcon(place.topic, 'h-7 w-7 -my-1 max-[430px]:h-6 max-[430px]:w-6')
            : `<i data-lucide="${place.icon}" class="w-5 h-5 ${style ? '' : 'text-slate-600 dark:text-slate-300'}"></i>`;
        renderIcons(iconSlot);
        const text = document.getElementById('status-text');
        if (place.logo) {
            const level = levelProgress(loadProgress().xp);
            text.innerHTML = `<span class="block text-lg font-black normal-case leading-none tracking-tight text-brand-700 dark:text-cream max-[370px]:hidden">${escapeHtml(APP_NAME)}</span>`
                + `<span class="mt-1 block whitespace-nowrap text-[10px] font-bold normal-case tracking-wide text-slate-500 dark:text-slate-400 max-[370px]:mt-0 max-[370px]:text-[11px]">Úr. ${level.level}<span class="max-[370px]:hidden"> · ${escapeHtml(titleForLevel(level.level))}</span></span>`
                + `<span class="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full bg-gold-500" data-progress="${Math.round(level.ratio * 100)}"></span></span>`;
            applyProgress(text);
            // Na úzkém displeji (360 px) se vedle čtyř tlačítek vejde sova a jen úroveň s pruhem (text vede do Mého postupu i tam, sova otevírá zajímavost)
            text.className = 'min-w-[2.25rem] text-left';
        } else {
            text.textContent = place.text;
            // Dlouhé slovo (ARCHITEKTURA) se nesmí zlomit uprostřed: menší písmo, zlom až jako poslední možnost
            const longest = Math.max(0, ...String(place.text).split(/\s+/).map(word => word.length));
            text.className = `line-clamp-2 break-words text-left uppercase leading-tight ${longest > 10 ? 'text-[10px] tracking-tight' : 'text-[11px]'} ${style ? '' : 'text-slate-700 dark:text-slate-200'}`;
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
        const tipDue = !factDue && !offerDue && Boolean(nextTip());
        const show = screen === 'home' && (factDue || offerDue || tipDue);
        // Bez nové zajímavosti žárovka zve do turnaje (jinak se tlačítko jmenuje podle zajímavosti)
        const title = tipDue ? 'Mudrlant má pro tebe tip' : factDue || !offerDue ? 'Mudrlant ti chce říct, co se stalo tento den' : 'Mudrlant tě zve do týdenního turnaje';
        hint.title = title;
        hint.setAttribute('aria-label', tipDue ? 'Tip od Mudrlanta' : factDue || !offerDue ? 'Tento den v dějinách' : 'Týdenní turnaj: přihlášky jsou otevřené');
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
                    <button type="button" data-fact-close aria-label="Zavřít" class="absolute right-1 top-1 rounded-full p-2.5 text-slate-500 dark:text-slate-400 active:scale-95"><i data-lucide="x" class="h-5 w-5"></i></button>
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
        flushAnswerStats();
        notePushHomeTab();
        checkStreakFreeze();
        noteDiplomas(topicStarsNow());
        noteAlbum();
        settleGoals();
        // Sezóna: založí se (nebo přejde do nového měsíce) a zapamatuje se stupeň, ať se nový stupeň během hry oslaví
        noteSeasonTier();
        const stats = loadStats();
        const today = getDayKey();
        // Dnešní otázky: ikona tématu a stav, název v popisku (14 témat se vejde do dvou řádků). Na nízkém displeji (short:)
        // jen ikona se stavem jako odznakem v rohu (hotovo ✓, nevyšlo ×, čeká •), dlaždice 40 px vysoká; celý stav je v popisku tlačítka
        const dailyBadge = (result) => {
            const badge = 'pointer-events-none absolute -bottom-1 -right-1 hidden items-center justify-center rounded-full ring-2 ring-white short:flex dark:ring-slate-800';
            if (!result) return '<span aria-hidden="true" class="pointer-events-none absolute bottom-1 right-1 hidden h-1.5 w-1.5 rounded-full bg-gold-500 short:block"></span>';
            return result.correct
                ? `<span aria-hidden="true" class="${badge} h-4 w-4 bg-emerald-600 text-white"><i data-lucide="check" class="h-3 w-3 stroke-[3]"></i></span>`
                : `<span aria-hidden="true" class="${badge} h-4 w-4 bg-rose-600 text-white"><i data-lucide="x" class="h-3 w-3 stroke-[3]"></i></span>`;
        };
        const homeBadges = loadProgress().badges;
        const dailyButtons = TOPICS.map(topic => {
            const status = dailyStatus(topic.id, stats);
            const streak = topicStreak(stats.daily[topic.id], today);
            return `
                <button type="button" data-action="daily" data-topic="${topic.id}" title="Dnešní otázka – ${escapeHtml(topic.title)}" aria-label="Dnešní otázka – ${escapeHtml(topic.title)}: ${escapeHtml(status.text)}" class="relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-slate-50 px-0.5 pb-1 pt-1 ring-1 ring-slate-200/70 transition-all active:scale-95 short:min-h-[2.5rem] short:justify-center dark:bg-slate-900/60 dark:ring-slate-700/70">
                    ${topicIcon(topic, 'h-7 w-7', `rounded-lg p-1 ${styleOf(topic).soft}`, 'h-[1.125rem] w-[1.125rem]')}
                    <span class="flex max-w-full items-center gap-0.5 truncate text-[10px] font-bold short:hidden ${status.tone}">${status.icon ? `<i data-lucide="${status.icon}" class="h-3 w-3 shrink-0"></i>` : ''}${status.text}</span>
                    ${dailyBadge((stats.daily[topic.id] || {})[today])}
                    ${streak ? `<span class="absolute -right-1.5 -top-2 flex items-center rounded-lg bg-slate-900/85 py-px pl-0 pr-1.5 text-[10px] font-black text-white shadow ring-1 ring-white/20" title="${escapeHtml(streakRewardTitle(streak, homeBadges))}">${uiArt('serie', 'h-4 w-4')}${streak}</span>` : ''}
                </button>`;
        }).join('');
        const answered = TOPICS.filter(topic => (stats.daily[topic.id] || {})[today]).length;
        const scopeOf = (topic) => {
            const chosen = selectedCategories(topic);
            return chosen.length === topic.categories.length ? '' : chosen.length === 1 ? categoryOf(topic, chosen[0]).label : `${chosen.length} z ${topic.categories.length}`;
        };
        // Na nízkém nebo úzkém displeji se název vejde na jeden řádek (dlaždice pak stačí 48 px a úvod se vejde bez posouvání):
        // dlouhý název („Výtvarné umění“) tam ukáže krátký název tématu (shortTitle), celý zůstane v popisku pro čtečku
        const tileTitle = (topic) => (topic.shortTitle
            ? `<span class="short:hidden max-[400px]:hidden">${escapeHtml(topic.title)}</span><span class="hidden short:inline max-[400px]:inline" aria-label="${escapeHtml(topic.title)}">${escapeHtml(topic.shortTitle)}</span>`
            : escapeHtml(topic.title));
        // Dlaždice tématu: ikona a název, omezený výběr kategorií jako malý štítek
        const tile = (topic) => {
            const scope = scopeOf(topic);
            return `
                <button type="button" data-action="play-topic" data-topic="${topic.id}"${scope ? ` title="${escapeHtml(`${topic.title} · ${scope}`)}"` : ''} class="relative flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-gradient-to-br p-1 text-center text-white shadow-md ring-1 ring-black/5 transition-all active:scale-[0.97] short:min-h-[3rem] short:gap-0.5 short:p-0.5 ${styleOf(topic).tile}">
                    ${topicArt(topic) ? topicIcon(topic, 'h-10 w-10 short:h-8 short:w-8') : `<i data-lucide="${topic.icon}" class="h-[1.625rem] w-[1.625rem]"></i>`}
                    <span class="block ${topic.title.length > 10 ? 'text-[10px]' : 'text-[11.5px]'} font-black leading-tight tracking-tight short:leading-none">${tileTitle(topic)}</span>
                </button>`;
        };
        const mixScope = settings.topics.length === TOPICS.length ? 'Otázky ze všech témat' : `${settings.topics.length} z ${TOPICS.length} témat`;
        const mixTile = `
            <button type="button" data-action="play-mix" title="${escapeHtml(`Mix · ${mixScope}`)}" class="relative col-span-2 flex min-h-[4rem] min-w-0 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-br p-2.5 text-left text-white shadow-md ring-1 ring-black/5 transition-all active:scale-[0.97] short:min-h-[3rem] short:p-1.5 ${styleOf(MIX).tile}">
                ${topicIcon(MIX, 'h-12 w-12 short:h-9 short:w-9')}
                <span class="min-w-0 text-base font-black leading-tight">${escapeHtml(MIX.title)}</span>
            </button>`;
        const ordered = groupedTopics().flatMap(group => group.topics);
        const left = TOPICS.length - answered;
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-2 bg-slate-50 p-3 pb-4 short:gap-1.5 short:pb-3 dark:bg-slate-900">
                ${renderHomeTabs()}
                ${homeTab() === 'multi' ? renderChallengesSection() : `${quizHomeCard()}${mysteryHomeCard()}<section class="rounded-[1.4rem] bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70 short:p-1.5 dark:bg-slate-800/70 dark:ring-slate-700/70">
                    <div class="mb-2 flex items-center justify-between gap-2 short:mb-1.5">
                        <h2 class="flex min-w-0 items-center gap-2 whitespace-nowrap text-slate-800 dark:text-slate-100">${uiArt('dnes', 'h-8 w-8 short:h-7 short:w-7')}<span class="min-w-0"><span class="block text-[13px] font-black leading-tight">Dnešní otázky</span><span class="flex items-center gap-1 text-[11px] font-bold leading-tight text-slate-500 dark:text-slate-400">${answered}/${TOPICS.length} splněno${Rewards && loadRewards().freezes ? `<button type="button" data-action="freeze-info" class="ml-0.5 rounded-md">${Rewards.freezeChip(loadRewards().freezes)}</button>` : ''}</span></span></h2>
                        ${left ? `
                            <button type="button" data-action="play-daily" class="flex shrink-0 items-center gap-1.5 rounded-xl btn-3d bg-brand-700 px-3 py-2 text-[13px] font-black text-white short:py-1.5">
                                <i data-lucide="play" class="h-4 w-4"></i> ${answered ? 'Pokračovat' : 'Hrát vše'} <span class="font-bold opacity-90">· zbývá ${left}</span>
                            </button>` : `
                            <span class="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700 short:py-1.5 dark:bg-emerald-900/30 dark:text-emerald-300"><i data-lucide="circle-check" class="h-4 w-4"></i> Vše hotové</span>`}
                    </div>
                    <div class="grid grid-cols-7 gap-1">${dailyButtons}</div>
                </section>
                ${renderGoalsCard()}
                <section class="grid max-h-[26rem] flex-1 grid-cols-4 auto-rows-fr gap-2 short:gap-1">${mixTile}${ordered.map(tile).join('')}</section>`}
            </div>`;
        applyProgress(appContent);
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
        refreshChallenges();
        if (DailyQuiz) refreshQuizServer();
        if (Mystery) refreshMysteryReveal();
        // Tutoriál až po výběru varianty: úvod jde otevřít i z uvítání (Domů), otázka by se ale nespustila a bublina by čekala
        if (Tutorial && gameVariant) Tutorial.maybeStart({ ready: factLoading });
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
            const source = frame.querySelector('[data-photo-info]');
            if (source && PhotoSource && PhotoSource.fileFromUrl(url)) {
                source.dataset.url = url;
                source.classList.remove('hidden');
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
        <button type="button" data-photo-zoom aria-label="Zvětšit fotku" class="hidden absolute bottom-2 right-2 rounded-xl bg-black/65 p-3 text-white shadow backdrop-blur-sm"><i data-lucide="expand" class="h-4 w-4"></i></button>
        ${PhotoSource ? PhotoSource.buttonHtml() : ''}`;

    // Okno „Zdroj obrázku“ (tlačítko „i“ u obrázku): licence hned, autor, popis a odkaz na Commons až po odpovědi – u obrazu je
    // autor odpovědí a název souboru bývá název místa. Vlastní malé okno nad vším (i nad oknem s popisem a dialogem, které nezavře).
    const loadPhotoSource = PhotoSource ? PhotoSource.createLoader((url) => fetch(url, { credentials: 'omit' })) : null;
    let photoSourceOpener = null;
    const closePhotoSource = () => {
        const overlay = document.getElementById('photo-source');
        if (!overlay) return;
        overlay.remove();
        if (photoSourceOpener && photoSourceOpener.isConnected) photoSourceOpener.focus({ preventScroll: true });
        photoSourceOpener = null;
    };
    // Před odpovědí = obrázek je v otázce, na kterou hráč ještě neodpověděl (ne v okně s popisem ani v atlasu učení)
    const photoBeforeAnswer = (button) => appContent.contains(button) && screen !== 'learn' && (screen === 'mystery' ? mysteryHidden() : Boolean(round) && !round.answered);
    const openPhotoSource = (button) => {
        const fileName = PhotoSource && PhotoSource.fileFromUrl(button.dataset.url);
        if (!fileName) return;
        closePhotoSource();
        const answered = !photoBeforeAnswer(button);
        photoSourceOpener = button;
        const overlay = document.createElement('div');
        overlay.id = 'photo-source';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'photo-source-title');
        overlay.className = 'fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
        overlay.innerHTML = `
            <div class="fade-in flex max-h-[92dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-[1.75rem] bg-slate-50 p-5 shadow-2xl dark:bg-slate-900">
                <div class="-mt-1 flex items-center justify-between">
                    <h2 id="photo-source-title" class="flex items-center gap-2 text-lg font-black text-slate-800 dark:text-slate-100"><i data-lucide="image" class="h-5 w-5"></i> ${escapeHtml(PhotoSource.TITLE)}</h2>
                    <button type="button" data-close aria-label="Zavřít" class="-m-1 rounded-xl p-2.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                <div data-source-body class="flex flex-col gap-3"></div>
            </div>`;
        const body = overlay.querySelector('[data-source-body]');
        const draw = (status, meta = null) => {
            body.innerHTML = PhotoSource.viewHtml(PhotoSource.buildView({ fileName, meta, answered, status }));
            renderIcons(body);
        };
        draw('loading');
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) closePhotoSource();
        });
        trapFocus(overlay);
        document.body.appendChild(overlay);
        renderIcons(overlay);
        overlay.querySelector('[data-close]').focus();
        loadPhotoSource(fileName).then(meta => { if (overlay.isConnected) draw(meta ? 'ready' : 'failed', meta); });
    };

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
                ${corner ? `<span data-visual-corner class="absolute bottom-2 right-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(corner)}</span>` : ''}
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
                ${corner ? `<span data-visual-corner class="absolute bottom-2 right-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(corner)}</span>` : ''}
            </div>`;
    };
    const factsPane = (facts) => `<div class="absolute inset-0 overflow-y-auto p-2.5"><h3 class="sr-only">Čísla a fakta</h3>${renderFactsList(facts)}</div>`;
    // Popis: volná záložka u otázky bez obrázku (data), nebo nápověda u otázky s obrázkem (hint: název díla a popis z článku)
    const textPane = (data, style, hint = null) => {
        const name = hint ? hint.name : data.question.showName ? data.name : '';
        const text = hint ? hint.text : data.questionText;
        return `
        <div class="absolute inset-0 overflow-y-auto overscroll-contain p-3.5">
            ${name ? `
                <div class="${HINT_CHIP}">
                    <i data-lucide="tag" class="w-4 h-4 ${style.text}"></i>
                    <span class="font-medium">Název:</span> <b class="text-slate-800 dark:text-slate-100">${escapeHtml(name)}</b>
                </div>` : ''}
            ${text
                ? `<p class="text-[15px] font-medium italic leading-snug text-slate-700 dark:text-slate-200">„${escapeHtml(text)}“</p>`
                : hint ? '' : '<p class="text-sm text-slate-500 dark:text-slate-400">Popis se teď nepodařilo načíst z Wikipedie – pomůžou nápovědy.</p>'}
            ${!hint && (data.leadFacts || []).length ? `
                <dl class="mt-2.5 flex flex-wrap gap-1.5" aria-label="Co o tom víme">
                    ${data.leadFacts.map(fact => `<div class="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-900/60"><dt class="inline font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(fact.label)}:</dt> <dd class="inline font-bold text-slate-800 dark:text-slate-100">${escapeHtml(fact.value)}</dd></div>`).join('')}
                </dl>` : ''}
        </div>`;
    };
    const excerptPane = (hint) => `
        <div class="absolute inset-0 overflow-y-auto overscroll-contain p-3.5">
            <p class="text-[15px] font-medium italic leading-snug text-slate-700 dark:text-slate-200">„${escapeHtml(hint.text)}“</p>
        </div>`;

    // Panel se záložkami a jednou plochou pevné výšky – nápovědy se nepřidávají pod sebe, takže se nic neposouvá
    // panes = [{ key, label, icon, html }], action = akce záložky, extra = tlačítko za záložkami
    // Výška panelu otázky: vyplní místo, které na obrazovce zbude (dvouřádková otázka nebo delší možnosti ho zmenší, ať se nic
    // neposouvá), nejvýš asi 18 rem plochy, na malém telefonu aspoň 7 rem. Výsledek má pevnou výšku podle obrazovky.
    const QUESTION_PANEL_HEIGHT = 'fill';
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
                        <button type="button" role="tab" aria-selected="${selected}" aria-label="${escapeHtml(candidate.label)}" title="${escapeHtml(candidate.label)}" data-action="${action}" data-step="${candidate.key}" class="flex min-h-[2.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${selected ? `px-3 ${style.tab}` : `min-w-[2.75rem] px-2.5 ${TAB_OFF}`}">
                            <i data-lucide="${candidate.icon}" class="h-4 w-4"></i>${selected ? escapeHtml(candidate.label) : ''}
                        </button>`;
                }).join('')}
            </div>` : `
            <h3 class="${CARD_TITLE} min-h-[2.75rem] border-b border-slate-100 px-4 dark:border-slate-700"><i data-lucide="${pane.icon}" class="h-4 w-4 ${style.text}"></i> ${escapeHtml(pane.label)}</h3>`;
        return `
            <section id="${action}-panel" class="${CARD} ${height === 'fill' ? 'flex max-h-[21rem] flex-1 flex-col' : 'shrink-0'} overflow-hidden">
                ${tabs}
                <div class="relative ${height === 'fill' ? 'min-h-[7rem] flex-1' : height} overflow-hidden" role="tabpanel">${pane.html}</div>
            </section>`;
    };

    // První obrazová nápověda má id hint-visual, další (mapa i vlajka u státního znaku) hint-visual-2…: každá karta vlastní prvek
    const visualHintId = (hint) => hint.key === 'visual' ? 'hint-visual' : `hint-${hint.key}`;
    const hintPanes = (hints, data, style) => {
        return hints.map(hint => {
            const html = hint.kind === 'visual' ? visualPane(visualHintId(hint), hint.spec)
                : hint.kind === 'photo' ? photoPane('hint-photo') : hint.kind === 'excerpt' ? excerptPane(hint)
                    // Nápověda uložená starší verzí nemá vlastní text – vezme se popis otázky
                    : hint.kind === 'text' ? textPane(data, style, hint.text === undefined ? null : hint) : factsPane(hint.facts);
            return { key: hint.key, label: tabLabel(hint), icon: hint.icon, html };
        });
    };

    // Panel otázky: popis a odemčené nápovědy, za záložkami tlačítko na další nápovědu
    // U otázky s obrázkem je popis (i s názvem díla) nápovědou (krok 'text'): vidět je jen obrázek
    const questionPanel = (data) => {
        const style = styleOf(TOPIC_BY_ID[data.topic]);
        const unlocked = data.hints.slice(0, round.hintLevel - 1);
        const image = data.questionImage ? [{ key: 'image', label: data.questionImage.label, icon: data.questionImage.icon, html: photoPane('question-image') }] : [];
        // Volný popis jen u otázky bez obrázku; u otázky s obrázkem je popis nápovědou, a když žádný skutečný popis není
        // (náhradní nebo zadržený text), záložka Popis vůbec není
        const textAsHint = data.hints.some(hint => hint.kind === 'text');
        const free = !textAsHint && !data.questionImage ? [{ key: 'text', label: 'Popis', icon: 'quote', html: textPane(data, style) }] : [];
        const panes = [...image, ...free, ...hintPanes(unlocked, data, style)];
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
                    <span class="block text-[11px] font-black uppercase tracking-wider opacity-90">Nápověda ${round.hintLevel}/${data.hints.length}</span>
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
        const guessMap = document.getElementById('map-guess');
        if (guessMap && MapQuestion) MapQuestion.mountResult(guessMap, current, round && round.map, { loadMap: loadMapData });
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

    // Turnaj: živý čas u každé otázky (rozhoduje při shodě bodů i správných odpovědí), přestane se počítat po odpovědi
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
    // Otázka „Ukaž na mapě“: vlastní obrazovka z question-map.js (mapa místo popisu, nápověd a možností), tip se ukládá do kola
    const renderMapQuestion = (keepScroll) => {
        const data = current;
        const topic = TOPIC_BY_ID[data.topic];
        // Zápas turnaje: čas běží i u otázky na mapě (jako u ostatních otázek zápasu)
        const header = questionHeaderTop({ timed: Boolean(mode === 'challenge' && challenge && challenge.tournament) });
        appContent.innerHTML = MapQuestion.questionScreen(data, { style: styleOf(topic), categoryIcon: categoryOf(topic, data.category).icon, typed: round.variant === 'typed',
            extraTop: header.top, labelClass: header.label,
            guess: round.mapGuess, fresh: !keepScroll, report: canReport() && mode !== 'challenge' ? REPORT_ICON_BUTTON : '' });
        renderIcons(appContent);
        if (appContent.querySelector('[data-tour-timer]')) {
            if (!round.timerStart) round.timerStart = Date.now();
            startTourTimer(round.timerStart);
        } else clearInterval(tourTimer);
        if (!keepScroll) appContent.scrollTo(0, 0);
        MapQuestion.mountQuestion(appContent, data, { guess: round.mapGuess || null, loadMap: loadMapData, onConfirm: () => ACTIONS['map-confirm'](),
            onPlace: (guess) => { if (current === data && round && !round.answered) { round.mapGuess = guess; persistState(); } } });
    };
    // --- Body ve hře: čip v záhlaví otázky (výzva, zápas turnaje, Kvíz dne a trénink) a součet ve výsledku otázky ---
    // Výzva a turnaj sčítají uložené odpovědi, Kvíz dne svůj pokus, trénink body od chvíle, kdy hráč začal hrát tohle téma (mix, okruh, chyby).
    let practiceRun = { key: '', points: 0 };
    const practiceKey = () => `${pool.kind}:${pool.topic || ''}:${pool.collection || ''}`;
    const runningScore = () => {
        if (mode === 'challenge' && challenge) return (challenge.results || []).reduce((sum, row) => sum + (row && row.points > 0 ? row.points : 0), 0);
        if (mode === 'quiz' && quiz && DailyQuiz) return Math.max(DailyQuiz.summarize(quiz.results).score, quiz.server ? quiz.server.score || 0 : 0);
        if (mode === 'practice') return practiceRun.key === practiceKey() ? practiceRun.points : 0;
        return null;
    };
    const recordPracticeRun = () => {
        const key = practiceKey();
        if (practiceRun.key !== key) practiceRun = { key, points: 0 };
        practiceRun.points += round.points;
    };
    // Čip vlevo nahoře (vpravo bývá čas Kvízu dne); štítek druhu otázky mezi nimi se zúží a v případě potřeby zalomí na dva řádky
    const SCORE_CHIP_BASE = 'inline-flex shrink-0 items-center gap-1 rounded-lg bg-gold-100 px-2 py-0.5 text-xs font-black tabular-nums text-gold-800 dark:bg-gold-900/50 dark:text-gold-200';
    const SCORE_CHIP = `absolute left-0 top-0 ${SCORE_CHIP_BASE}`;
    const HEADER_LABEL_ROOM = 'max-w-[calc(100%-8.5rem)]';
    // inline = v řádku se soupeřem (hra proti hráči), jinak volně vlevo nahoře
    const scoreChip = (inline = false) => {
        const total = runningScore();
        if (total === null) return '';
        return `<span data-score-chip class="${inline ? SCORE_CHIP_BASE : SCORE_CHIP}" title="Body v této hře" aria-label="Body v této hře: ${total}"><i data-lucide="star" class="h-3.5 w-3.5"></i>${total} b</span>`;
    };
    // Čas na otázku (zápas turnaje a Kvíz dne): běží v [data-tour-timer]
    const TIMER_CHIP_BASE = 'inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-black tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-100';
    const timerChip = (inline = false) => `<span class="${inline ? TIMER_CHIP_BASE : `absolute right-0 top-0 ${TIMER_CHIP_BASE}`}" title="Čas na tuto otázku: při shodě rozhoduje rychlejší hráč"><i data-lucide="timer" class="h-3.5 w-3.5"></i><span data-tour-timer>0:00</span></span>`;

    // --- Soupeř v záhlaví otázky: ve hře proti hráči (výzva, odveta, zápas turnaje) je vpravo nahoře malý obrázek a přezdívka soupeře ---
    // Soupeř z mého pohledu: zakladatel výzvy → vyzvaný hráč, vyzvaný (nebo kdo přišel přes odkaz) → zakladatel, turnaj → druhý hráč mého zápasu.
    // Výzva skupině: skupina (hraje proti všem členům, kteří ji dohrají); moje výzva přes odkaz, kterou ještě nikdo nepřijal: „Otevřená výzva“.
    // Kvíz dne a trénink soupeře nemají (null).
    const challengeOpponent = () => {
        if (mode !== 'challenge' || !challenge) return null;
        const user = signedUser();
        const meId = (user && user.id) || challenge.owner || null;
        const tour = challenge.tournament;
        if (tour) {
            const view = Tournament && tour.tid ? findTournament(tour.tid) : null;
            const match = view ? (view.state && view.state.matchId === tour.mid && view.state.match) || (view.matches || []).find(item => item.id === tour.mid) : null;
            const otherId = match && meId ? Tournament.opponentOf(match, meId) : null;
            const entry = otherId ? (view.entries || []).find(item => item.user_id === otherId) : null;
            const player = (entry && entry.player) || tour.opponent || null;
            return player ? { player } : null;
        }
        if (challenge.group && challenge.group.name) return { group: challenge.group };
        const creator = challenge.creator;
        if (creator && creator.id && creator.id !== meId) return { player: creator };
        if (challenge.invited && challenge.invited.id !== meId) return { player: challenge.invited };
        return creator ? { open: true } : null;
    };
    const OPPONENT_CHIP = 'inline-flex min-w-0 max-w-[65%] items-center gap-1 rounded-full bg-white py-px pl-px pr-2 text-[11px] font-bold leading-4 text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700';
    const OPPONENT_BUBBLE = 'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300';
    const opponentChip = (opponent) => {
        if (opponent.player) {
            const name = playerName(opponent.player);
            return `<span data-opponent-chip="player" class="${OPPONENT_CHIP}" title="Hraješ proti: ${escapeHtml(name)}">${avatarHtml(opponent.player, 'h-[18px] w-[18px] text-[11px]')}<span class="shrink-0 font-semibold text-slate-500 dark:text-slate-400">proti</span><span data-opponent-name class="truncate">${escapeHtml(name)}</span></span>`;
        }
        if (opponent.group) {
            const icon = String(opponent.group.icon || '').trim();
            return `<span data-opponent-chip="group" class="${OPPONENT_CHIP}" title="Výzva skupiny ${escapeHtml(opponent.group.name)}"><span aria-hidden="true" class="${OPPONENT_BUBBLE}">${icon ? escapeHtml(icon) : '<i data-lucide="users" class="h-3 w-3"></i>'}</span><span class="shrink-0 font-semibold text-slate-500 dark:text-slate-400">skupina</span><span data-opponent-name class="truncate">${escapeHtml(opponent.group.name)}</span></span>`;
        }
        return `<span data-opponent-chip="open" class="${OPPONENT_CHIP}" title="Výzvu zatím nikdo nepřijal: hraje ji, kdo dostane odkaz"><span aria-hidden="true" class="${OPPONENT_BUBBLE}"><i data-lucide="share-2" class="h-3 w-3"></i></span><span data-opponent-name class="truncate">Otevřená výzva</span></span>`;
    };
    // Záhlaví otázky: ve hře proti hráči řádek „body (a čas) vlevo – soupeř vpravo“ nad štítkem druhu otázky, který pak má celou šířku
    // (vedle čipů by na telefonu zbylo na štítek jen pár písmen); jinak body vlevo a čas vpravo vedle štítku jako dřív.
    // Vrací { top: HTML nad štítkem, label: třída šířky štítku }
    const questionHeaderTop = ({ timed = false, score = true } = {}) => {
        const opponent = challengeOpponent();
        if (opponent) {
            const left = `${score ? scoreChip(true) : ''}${timed ? timerChip(true) : ''}`;
            return { top: `<div data-match-bar class="flex w-full items-center justify-between gap-2"><span class="flex shrink-0 items-center gap-1">${left}</span>${opponentChip(opponent)}</div>`, label: 'max-w-full' };
        }
        const chip = score ? scoreChip() : '';
        return { top: `${chip}${timed ? timerChip() : ''}`, label: chip || timed ? HEADER_LABEL_ROOM : 'max-w-full' };
    };
    // Řádek „Celkem: 16 bodů“ do výsledku otázky (jen tam, kde je čip)
    const scoreTotalLine = (tone) => {
        const total = runningScore();
        // Malý štítek v pravém horním rohu rámečku výsledku („26 b.“), roste s každou otázkou; rámeček má relative a nadpis místo vpravo
        return total === null ? '' : `<span data-score-total title="Body v této hře" aria-label="Body v této hře: ${total}" class="absolute right-2 top-2 rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] font-black leading-none tabular-nums dark:bg-black/25 ${tone}">${total} b.</span>`;
    };
    const renderQuestion = (keepScroll) => {
        if (isNumeric(current)) return renderNumeric(keepScroll);
        const data = current;
        if (data.question.type === 'map' && MapQuestion) return renderMapQuestion(keepScroll);
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

        const timed = Boolean((mode === 'challenge' && challenge && challenge.tournament) || mode === 'quiz');
        const header = questionHeaderTop({ timed });
        // Při psaní je pole nahoře: otevřená klávesnice by ho jinak zakryla
        appContent.innerHTML = `
            <div class="${keepScroll ? '' : 'fade-in '}flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 pb-3 dark:bg-slate-900">
                <div class="relative flex flex-col items-center gap-1 text-center">
                    ${header.top}
                    <span data-header-label class="inline-flex ${header.label} items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${style.solid}">
                        <i data-lucide="${category.icon}" class="h-3 w-3 shrink-0"></i> <span class="min-w-0 break-words leading-snug">${escapeHtml(data.typeLabel)}</span>
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
                    <button type="button" data-close aria-label="Zavřít" class="pointer-events-auto rounded-full bg-slate-900/60 p-2.5 text-white shadow backdrop-blur-sm hover:bg-slate-900/80 dark:bg-slate-600/90 dark:hover:bg-slate-500">
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
        ? `<div class="mt-0.5 text-xs font-bold ${tone}">${xp.total ? `<span class="inline-block rounded-md bg-gold-500 px-1.5 py-0.5 font-black text-brand-950">+${xp.total} XP</span>` : ''}${(xp.badges || []).map(title => `<span class="ml-1 inline-flex items-center gap-1 rounded-md bg-brand-700 px-1.5 py-0.5 font-black text-white"><i data-lucide="award" class="h-3 w-3"></i>${escapeHtml(title)}</span>`).join('')}${xp.parts.length === 1 && !(xp.badges || []).length && xp.parts[0].xp === xp.total ? ` <span class="ml-0.5 font-semibold opacity-90">${escapeHtml(xp.parts[0].label)}</span>` : xp.parts.length ? `<ul class="mt-1 space-y-0.5 font-semibold opacity-90">${xp.parts.map(part => `<li>+${part.xp} XP ${escapeHtml(part.label)}</li>`).join('')}</ul>` : ''}</div>` : '';

    const renderResultBanner = (data) => {
        if (data.question.type === 'map' && MapQuestion) return MapQuestion.resultBanner(data, round, { uiArt, xpLine, totalLine: scoreTotalLine });
        // Kolik nápověd hráč použil z kolika, které otázka měla
        const levels = `${round.hintLevel - 1}/${data.hints.length}`;
        if (round.correct) {
            return `
                <div data-verdict tabindex="-1" class="relative flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 outline-none dark:border-emerald-800 dark:bg-emerald-900/30">
                    ${uiArt('sova-radost', 'h-[4.5rem] w-[4.5rem] -my-3')}
                    <div>
                        <p class="pr-10 font-black text-emerald-800 dark:text-emerald-200">Správně! +${formatPoints(round.points)}</p>
                        <p class="text-sm text-emerald-800 dark:text-emerald-300">${round.typed ? 'Napsaná odpověď' : 'Výběr z možností'}${data.hints.length ? ` · nápovědy ${levels}` : ''}</p>
                        ${scoreTotalLine('text-emerald-800 dark:text-emerald-300')}
                        ${answerStatsLine(data, 'text-emerald-800 dark:text-emerald-300')}
                        ${xpLine(round.xp, 'text-emerald-800 dark:text-emerald-300')}
                    </div>
                </div>`;
        }
        // Správná odpověď jako první a nejvýraznější (zelený rámeček), hráčova odpověď pod ní přeškrtnutá
        const correctChoice = (data.question.choices || []).find(choice => choice.correct);
        const correctRef = correctChoice && correctChoice.id ? { topic: correctChoice.topic || data.topic, id: correctChoice.id } : null;
        const correctInfo = isKnownRef(correctRef);
        const correctBody = `
            <span class="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300"><i data-lucide="circle-check" class="h-3.5 w-3.5"></i>Správná odpověď</span>
            <span class="flex items-center gap-1.5 text-base font-black leading-snug text-emerald-900 dark:text-emerald-50">${escapeHtml(data.question.answerLabel)}${correctInfo ? '<i data-lucide="info" class="h-4 w-4 shrink-0 opacity-70"></i>' : ''}</span>`;
        const correctBox = correctInfo
            ? `<button type="button" data-correct-answer data-action="item-info" data-topic="${escapeHtml(correctRef.topic)}" data-id="${escapeHtml(correctRef.id)}" aria-label="Správná odpověď: ${escapeHtml(data.question.answerLabel)} – ukázat popis" class="mt-1.5 flex w-full flex-col items-start rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-1.5 text-left transition-colors hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-900/50 dark:hover:bg-emerald-900">${correctBody}</button>`
            : `<div data-correct-answer class="mt-1.5 flex flex-col items-start rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-1.5 dark:border-emerald-500 dark:bg-emerald-900/50">${correctBody}</div>`;
        return `
            <div data-verdict tabindex="-1" class="relative flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 outline-none dark:border-rose-800 dark:bg-rose-900/30">
                ${uiArt('sova-smutek', 'h-14 w-14 shrink-0')}
                <div class="min-w-0 flex-1">
                    <p class="pr-10 font-black text-rose-800 dark:text-rose-200">${round.gaveUp ? 'Tentokrát bez odpovědi' : 'Bohužel, to není ono'}</p>
                    ${correctBox}
                    ${round.answer ? `
                        <p data-wrong-answer class="mt-1.5 flex items-start gap-1 text-sm text-rose-800 dark:text-rose-300"><i data-lucide="circle-x" class="mt-0.5 h-4 w-4 shrink-0"></i><span>Tvoje odpověď: <s class="font-semibold decoration-2">${escapeHtml(round.answer)}</s></span></p>` : ''}
                    ${scoreTotalLine('text-rose-800 dark:text-rose-300')}
                    ${answerStatsLine(data, 'text-rose-800 dark:text-rose-300')}
                    ${xpLine(round.xp, 'text-rose-800 dark:text-rose-300')}
                    ${round.answerRef ? `
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(round.answerRef.topic)}" data-id="${escapeHtml(round.answerRef.id)}" class="mt-1.5 inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900">
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
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(choice.topic)}" data-id="${escapeHtml(choice.id)}" class="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-white dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700">
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
            // Obrázek ke sdílení (share-card.js) se kreslí až při stisku tlačítka „Sdílet obrázek“ (pointerdown, viz níž): kreslení hned
            // při zobrazení výsledku by zdrželo jeho vykreslení (a tutoriál, který výsledek právě ukazuje); vstup karty se počítá až tam
            const card = Boolean(ShareCard);
            return `
                <section class="${CARD} flex flex-col gap-2 p-3">
                    <div class="grid grid-cols-3 gap-1 text-center">
                        <div><p class="text-xl font-black text-slate-800 dark:text-slate-100">${topicStreak(stats.daily[data.topic])}</p><p class="flex items-center justify-center gap-1 ${label}">${uiArt('serie', 'h-5 w-5')}Série</p></div>
                        <div><p class="text-xl font-black text-slate-800 dark:text-slate-100">${results.length}</p><p class="${label}">Hráno</p></div>
                        <div><p class="text-xl font-black text-slate-800 dark:text-slate-100">${wins}</p><p class="${label}">Uhodnuto</p></div>
                    </div>
                    ${streakRewardLine(topicStreak(stats.daily[data.topic]), 'justify-center')}
                    <div class="grid grid-cols-2 gap-2">
                        <button type="button" data-action="share" aria-label="Sdílet výsledek" class="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-md transition-all active:scale-95 ${styleOf(TOPIC_BY_ID[data.topic]).button}">
                            <i data-lucide="share-2" class="h-4 w-4 shrink-0"></i> Sdílet
                        </button>
                        ${card ? `<button type="button" data-action="share-image" class="flex min-w-0 items-center justify-center gap-1.5 rounded-xl btn-3d-light bg-white px-3 py-2.5 text-sm font-bold text-slate-800 transition-all active:scale-95 dark:bg-slate-700 dark:text-slate-100"><i data-lucide="image" class="h-4 w-4 shrink-0"></i> Sdílet obrázek</button>` : ''}
                    </div>
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
                <button type="button" data-action="zoom-in" aria-label="Přiblížit mapu" class="p-3 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="plus" class="h-4 w-4"></i></button>
                <button type="button" data-action="zoom-out" aria-label="Oddálit mapu" class="border-t border-slate-200 p-3 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="minus" class="h-4 w-4"></i></button>
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
        // Otázka na mapě: první záložka ukáže tip, správné místo a vzdálenost
        if (data.question.type === 'map' && MapQuestion) panes.push({ key: 'guess', label: 'Na mapě', icon: 'crosshair', html: MapQuestion.resultPane(data, round.map) });
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
        if (mode === 'quiz') return quizNextLabel();
        if (mode === 'daily') {
            const next = nextDailyTopic(current && current.topic);
            return next ? `Další dnešní: ${next.title}` : 'Hotovo – zpět do menu';
        }
        if (pool.kind === 'mistakes') {
            const remaining = loadMistakes().length;
            return remaining ? `Další chyba (zbývá ${remaining})` : 'Hotovo – zpět do učení';
        }
        if (pool.kind === 'review') return pool.keys.length ? `Další karta (zbývá ${pool.keys.length})` : 'Hotovo – souhrn procvičování';
        return pool.kind === 'collection' ? 'Další z okruhu' : pool.kind === 'map' ? 'Další na mapě' : 'Další otázka';
    };

    // Výsledek: verdikt, název, záložky s fotkou, mapou a nápovědami, pak popis a fakta; tlačítko Další je přilepené dole
    const renderResult = (keepScroll) => {
        if (isNumeric(current)) return renderNumeric(keepScroll);
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
                        ${data.question && data.question.title ? `<p data-result-question class="mb-2 rounded-xl bg-slate-100 px-3 py-1.5 text-[13px] font-semibold leading-snug text-slate-600 dark:bg-slate-800 dark:text-slate-300"><span class="font-black text-slate-500 dark:text-slate-400">Otázka:</span> ${escapeHtml(data.question.title)}</p>` : ''}
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

                    ${(mode === 'daily' && data.dailyDate) || mode === 'challenge' || mode === 'quiz' ? '' : renderStatsCard(data)}

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

    // --- Číselné otázky Seřaď a Odhadni číslo (numeric-questions.js): vlastní obrazovka otázky i výsledku, body podle přesnosti ---
    // Bez nápověd; do chyb, opakování ani poznaných položek se nepočítají (ptají se na čísla, ne na položku). Plán otázky dělá výběr
    // otázky (numericPlan): hra tématu a mixu a výzvy a turnaje (se semínkem výzvy, takže všichni dostanou stejnou), ne dnešní otázky a učení.
    const isNumeric = (data) => Boolean(Numeric && Numeric.isKind(data));
    const numericPlan = (ctx, item, pool, rng) => (Numeric && ctx && item ? Numeric.plan({ topic: ctx.topic, item, pool, rng }) : null);
    const numericUi = (data) => ({
        style: styleOf(TOPIC_BY_ID[data.topic]), card: CARD, cardTitle: CARD_TITLE, art: uiArt, xpLine, variant: round.variant, wikiUrl: wikipediaUrl,
        statsCard: mode === 'challenge' ? '' : renderStatsCard(data), reportIcon: canReport() && mode !== 'challenge' ? REPORT_ICON_BUTTON : '',
        reportText: canReport() ? REPORT_TEXT_BUTTON : '', nextLabel: round.answered ? getNextLabel() : '',
        // Záhlaví otázky: body ve hře, čas zápasu turnaje a soupeř (ve výsledku číselné otázky nic z toho, pořadí musí zůstat na očích)
        ...(() => {
            if (round.answered) return { headerTop: '', labelRoom: 'max-w-full' };
            const header = questionHeaderTop({ timed: Boolean(mode === 'challenge' && challenge && challenge.tournament) });
            return { headerTop: header.top, labelRoom: header.label };
        })()
    });
    const renderNumeric = (keepScroll) => {
        const data = current;
        appContent.innerHTML = (round.answered ? Numeric.resultHtml : Numeric.questionHtml)(data, round, numericUi(data));
        if (keepScroll && appContent.firstElementChild) appContent.firstElementChild.classList.remove('fade-in');
        renderIcons(appContent);
        Numeric.mount(appContent, data, round, { Visuals, deps: visualDeps });
        if (appContent.querySelector('[data-tour-timer]')) {
            if (!round.timerStart) round.timerStart = Date.now();
            startTourTimer(round.timerStart);
        } else clearInterval(tourTimer);
        if (keepScroll) return;
        appContent.scrollTo(0, 0);
        const verdict = appContent.querySelector('[data-verdict]');
        if (verdict) verdict.focus({ preventScroll: true });
    };
    const numericPick = (index) => {
        if (!round || round.answered || !isNumeric(current) || current.numeric.kind !== 'order' || !current.numeric.items[index]) return;
        Numeric.togglePick(round, index);
        Numeric.paintOrder(appContent, current, round, { style: styleOf(TOPIC_BY_ID[current.topic]) });
        persistState();
    };
    const numericConfirm = () => {
        if (!round || round.answered || !isNumeric(current) || current.numeric.kind !== 'order' || (round.pick || []).length !== 4) return;
        round.score = Numeric.scoreOrder(current, round.pick);
        const points = Numeric.pointsFor(round.score.base, round.variant);
        submitAnswer({ correct: points > 0, typed: false, answer: round.pick.map(index => current.numeric.items[index].name).join(', '), points });
    };
    const numericEstimate = (form) => {
        if (!round || round.answered || !isNumeric(current) || current.numeric.kind !== 'estimate') return;
        const input = form.elements.guess;
        const guess = Numeric.readGuess(current, input.value);
        if (!Number.isFinite(guess)) {
            Numeric.notePreview(document.getElementById('estimate-note'), current, input.value, true);
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        round.guess = guess;
        round.score = Numeric.scoreEstimate(current, guess);
        const points = Numeric.pointsFor(round.score.base, round.variant);
        submitAnswer({ correct: points > 0, typed: false, answer: Numeric.formatGuess(current, guess), points });
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

    // Rozehrané výzvy a zápasy turnaje (nejvýš 6) zvlášť od relace: když hráč mezi tím začne jinou výzvu nebo zápas, ta dřívější se neztratí
    // (výzva by jinak šla hrát znovu od začátku a zápas turnaje by už nešel dohrát). Dohrané se mažou (markChallengeFinished, markTournamentFinished).
    const OPEN_CHALLENGES_KEY = 'mudrlant.openChallenges';
    const openChallengeKey = (c) => (c.tournament && c.tournament.mid ? `t:${c.tournament.mid}` : `c:${c.code}`);
    const savedOpenChallenges = () => {
        const list = readJson(OPEN_CHALLENGES_KEY);
        return Array.isArray(list) ? list.filter(c => c && typeof c === 'object' && typeof c.code === 'string' && Array.isArray(c.results) && Number.isFinite(c.count) && !c.done) : [];
    };
    const rememberOpenChallenge = (c) => {
        if (!c || c.done || !c.code) return;
        const key = openChallengeKey(c);
        writeJson(OPEN_CHALLENGES_KEY, [...savedOpenChallenges().filter(other => openChallengeKey(other) !== key), { ...c, sending: false, reacting: false, lastResults: null }].slice(-6));
    };
    // Poslední rozehraná (nedohraná a neodeslaná) výzva přihlášeného hráče ze seznamu; null = žádná
    const latestOpenChallenge = () => {
        const user = signedUser();
        return savedOpenChallenges().filter(saved => !saved.tournament && !finishedChallenges().includes(saved.code) && (!saved.owner || !user || saved.owner === user.id)).pop() || null;
    };
    const forgetOpenChallenge = (key) => {
        const list = savedOpenChallenges();
        if (list.some(other => openChallengeKey(other) === key)) writeJson(OPEN_CHALLENGES_KEY, list.filter(other => openChallengeKey(other) !== key));
    };

    // --- Průběh na serveru (schéma 3): každá odpověď výzvy i zápasu turnaje se hned uloží na server, v pořadí a jen jednou ---
    // Po smazání dat, na jiném zařízení nebo v jiné kartě se pak pokračuje podle serveru (první nezodpovězenou otázkou), takže rozehranou výzvu
    // nejde hrát znovu od začátku; konečný výsledek server sečte z uložených odpovědí. Bez spojení zůstanou odpovědi v zařízení (výzva v relaci
    // a v mudrlant.openChallenges) a dopošlou se s další odpovědí nebo před odesláním výsledku. c.synced = kolik odpovědí server potvrdil
    // (-1 = neví se, nejdřív se průběh načte). Starší databáze bez průběhu (404): nic se neposílá a výzva se chová jako dřív.
    const answerQueues = new Map();
    const answersApi = (c) => {
        const user = signedUser();
        if (!Social || !user || !c || (c.owner && c.owner !== user.id)) return null;
        if (c.tournament && c.tournament.mid) return { load: () => Social.tournamentAnswers(user.id, c.tournament.mid), save: (index, row) => Social.saveTournamentAnswer(c.tournament.mid, index, row) };
        return c.code ? { load: () => Social.challengeProgress(user.id, c.code, c.count), save: (index, row) => Social.saveChallengeProgress(c.code, index, row) } : null;
    };
    // Rozehraná výzva se s každou otázkou vytvoří znovu (startChallenge): stav ze serveru patří do té, která se právě hraje
    const liveChallenge = (c) => (challenge && openChallengeKey(challenge) === openChallengeKey(c) ? challenge : c);
    // Odpovědi ze serveru platí: přepíšou místní na stejných místech, místní za nimi zůstanou (dopošlou se)
    const mergeAnswers = (c, rows) => {
        if (!Array.isArray(c.results)) c.results = [];
        // Podrobnosti (Rozpis otázek) ze serveru, a když je server nemá (starší databáze), ze zařízení
        rows.forEach((row, index) => {
            // místní podrobnosti jen ke stejné odpovědi (na jiném zařízení mohla být na tuhle otázku jiná)
            const before = c.results[index];
            const local = before && before.correct === row.correct && before.points === row.points ? before : {};
            const pick = (key) => (row[key] !== undefined && row[key] !== null ? row[key] : local[key] !== undefined ? local[key] : null);
            c.results[index] = { correct: row.correct, points: row.points, answer: pick('answer'), hints: pick('hints'), ms: pick('ms') };
        });
        c.synced = rows.length;
        return c;
    };
    const keepChallenge = (c) => {
        if (!c || c.done) return;
        if (c === challenge && current && mode === 'challenge') persistState();
        else rememberOpenChallenge(c);
    };
    const knownSynced = (c) => (Number.isInteger(c.synced) && c.synced >= 0 ? c.synced : -1);
    // true = server má všechny zodpovězené otázky, false = nepodařilo se (bez spojení), null = databáze průběh neeviduje
    const pushAnswers = async (c) => {
        const api = answersApi(c);
        if (!api) return false;
        let retried = false;
        for (;;) {
            let target = liveChallenge(c);
            if (knownSynced(target) < 0) {
                const rows = await api.load();
                if (rows === null) return null;
                target = mergeAnswers(liveChallenge(c), rows);
                keepChallenge(target);
            }
            try {
                while (target.synced < target.count && (target.results || [])[target.synced]) {
                    const index = target.synced;
                    if ((await api.save(index, target.results[index])) === null) return null;
                    target = liveChallenge(c);
                    target.synced = Math.max(knownSynced(target), index + 1);
                    keepChallenge(target);
                }
                return true;
            } catch (error) {
                // Server odpověď odmítl (na tu otázku má jinou, nebo mu chybí předchozí): platí, co má server; načte se znovu a zbytek se dopošle
                if (!retried && error && error.status >= 400 && error.status < 500 && error.status !== 401) { retried = true; liveChallenge(c).synced = -1; continue; }
                return false;
            }
        }
    };
    // Odesílání jedné výzvy jde po sobě (pořadí otázek); vrací výsledek pushAnswers
    const syncAnswers = (c) => {
        if (!c) return Promise.resolve(false);
        const key = openChallengeKey(c);
        // Nepotvrzené otázky (bez spojení při sestavení) se uloží dřív než odpovědi na ně
        const run = (answerQueues.get(key) || Promise.resolve()).then(() => flushPendingSnapshots()).then(() => pushAnswers(c)).catch(() => false);
        answerQueues.set(key, run);
        return run;
    };
    // Před pokračováním: průběh ze serveru (mohl přibýt na jiném zařízení); bez spojení do pár sekund se pokračuje podle zařízení
    const refreshAnswers = async (c) => {
        const api = answersApi(c);
        if (!api) return;
        let timer = null;
        try {
            const rows = await Promise.race([api.load(), new Promise(resolve => { timer = setTimeout(() => resolve(undefined), 4000); })]);
            if (Array.isArray(rows)) { mergeAnswers(c, rows); keepChallenge(c); }
        } catch (error) { /* bez spojení se pokračuje podle zařízení */ } finally { clearTimeout(timer); }
    };
    const persistState = () => {
        if (!current) return;
        if (mode === 'challenge' && challenge && !challenge.done) rememberOpenChallenge(challenge);
        if (mode === 'quiz') quizKeepOpen();
        // Rozehraný zápas turnaje se ukládá také: po návratu v den kola nabídne karta turnaje Pokračovat (od další otázky)
        // Rozehraná výzva (i zápas turnaje) se ukládá i během jiné hry (Hrát dál, dnešní otázky): po zavření aplikace by se jinak ztratila
        // a výzva by šla hrát znovu od začátku, zápas turnaje by už nešel dohrát
        const keptChallenge = mode === 'challenge' ? challenge : (challenge && !challenge.done ? challenge : null);
        writeJson(KEYS.session, { version: STATE_VERSION, data: current, round, mode, pool, challenge: keptChallenge, timestamp: Date.now() });
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
            topicCount: TOPICS.length,
            // Album sbírky: procenta celé sbírky a sekcí pro odznaky Sběratel (album.js)
            album: albumBadgeContext(progress)
        };
    };
    // Získané odznaky podle počítadel; vrátí názvy nově získaných (a uloží je s dnešním dnem)
    let freshBadgeIds = [];
    const grantBadges = (progress) => {
        const context = badgeContext(progress);
        const fresh = earnedBadgeIds(progress.counters, context).filter(id => !progress.badges[id]);
        fresh.forEach(id => { progress.badges[id] = getDayKey(); });
        noteDiplomas(context.topicStars);
        // Album sbírky: nové odznaky a diplomy sbírku zvednou – milník nebo celá sekce se připíše hned, ne až po další odpovědi
        albumDueBadges(progress).forEach(id => { progress.badges[id] = getDayKey(); fresh.push(id); });
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
        card.innerHTML = `${item.art || uiArt(`sova-${item.owl}`, 'h-20 w-20 -my-4 drop-shadow-lg')}<div class="min-w-0 flex-1"><p class="text-[11px] font-black uppercase tracking-widest text-gold-300">${escapeHtml(item.title)}</p><p class="text-base font-black leading-tight">${escapeHtml(item.text)}</p></div>`;
        document.body.appendChild(card);
        // Zvuk oslavy (nová úroveň, titul, odznak) zazní, až se karta ukáže
        if (item.sound && Sound) Sound.play(item.sound);
        const done = () => { if (!card.isConnected) return; card.remove(); setTimeout(nextCelebration, 250); };
        card.addEventListener('click', done);
        setTimeout(done, 4500);
    };
    // Během hry (otázka na obrazovce, výzva, zápas turnaje, Kvíz dne, Bleskovka a Přežití) by karta zakryla možnosti:
    // místo ní se ukáže jen malé okénko nahoře a celé oslavy přijdou až na klidné obrazovce (výsledek otázky v tréninku,
    // konec výzvy či Kvízu dne, výsledek režimu, úvod). Kontroluje se každou sekundu.
    const celebrationCalm = () => {
        // Otevřené okno (třeba rozpis otázek po výzvě, nebo Nastavení, kde hráč obléká Mudrlanta) má přednost: oslavy počkají, až se zavře
        if (document.getElementById('dialog-overlay') || document.getElementById('settings-overlay')) return false;
        if (mode === 'blitz' || mode === 'survival') return !modeGame || modeGame.phase === 'result' || screen !== 'mode';
        if (screen === 'home' || screen === 'learn' || screen === 'challenge-done' || screen === 'quiz-done' || screen === 'welcome' || screen === 'mystery') return true;
        if (mode === 'challenge' || mode === 'quiz') return false;
        return Boolean(round && round.answered);
    };
    const MINI_CELEBRATION = 'pointer-events-none fixed right-3 top-[4.5rem] z-[60] flex max-w-[70vw] items-center gap-1.5 rounded-2xl bg-brand-900/90 px-3 py-1.5 text-xs font-black leading-tight text-gold-200 shadow-lg ring-1 ring-gold-400/60';
    const miniCelebration = (item) => {
        const old = document.getElementById('celebration-mini');
        if (old) old.remove();
        const chip = document.createElement('div');
        chip.id = 'celebration-mini';
        chip.setAttribute('role', 'status');
        chip.className = `fade-in ${MINI_CELEBRATION}`;
        // Krátký štítek během hry: text se zalomí nejvýš do dvou řádků (celá karta se ukáže, až bude klid)
        chip.innerHTML = `<i data-lucide="sparkles" class="h-3.5 w-3.5 shrink-0"></i><span class="line-clamp-2">${escapeHtml(item.title)}: ${escapeHtml(item.text)}</span>`;
        document.body.appendChild(chip);
        renderIcons(chip);
        setTimeout(() => chip.remove(), 2500);
    };
    const deferredCelebrations = [];
    // art = vlastní obrázek místo sovy (HTML, např. nová postavička)
    const showCelebration = (owl, title, text, sound = null, art = '') => {
        const item = { owl, title, text, sound, art };
        if (!celebrationCalm()) { deferredCelebrations.push(item); miniCelebration(item); return; }
        celebrationQueue.push(item);
        if (!celebrating) nextCelebration();
    };
    setInterval(() => {
        // Karta, která zůstala viset do další otázky, zmizí; odložené oslavy se ukážou, jakmile je klid
        const card = document.getElementById('celebration');
        if (card && !celebrationCalm()) { card.remove(); celebrating = false; celebrationQueue.length = 0; }
        if (deferredCelebrations.length && celebrationCalm()) {
            celebrationQueue.push(...deferredCelebrations.splice(0));
            if (!celebrating) setTimeout(nextCelebration, 400);
        }
    }, 1000);
    const announce = (levelBefore, levelNow, badgeTitles) => {
        // Album sbírky: milník sbírky a celá sekce mají vlastní oslavu (po ostatních odznacích) místo obecného „Nový odznak“
        const albumFresh = freshBadgeIds.filter(id => Album && Album.isAlbumBadge(id) && BADGE_BY_ID[id]);
        if (albumFresh.length) badgeTitles = badgeTitles.filter(title => !albumFresh.some(id => BADGE_BY_ID[id].title === title));
        if (levelNow > levelBefore) {
            const newTitle = titleForLevel(levelNow) !== titleForLevel(levelBefore);
            // Nový titul slaví sova jeho stupně (sova titulu v barvě mého obleku)
            showCelebration(newTitle ? titleOwlPose(levelNow) : 'oslava', newTitle ? 'Nový titul' : `Úroveň ${levelNow}`, newTitle ? `${titleForLevel(levelNow)} (úroveň ${levelNow})` : titleForLevel(levelNow), newTitle ? 'title' : 'level');
        }
        badgeTitles.slice(0, 3).forEach(title => showCelebration('oslava', 'Nový odznak', title, 'badge'));
        if (badgeTitles.length > 3) showCelebration('oslava', 'Další odznaky', `a ještě ${badgeTitles.length - 3}`);
        albumFresh.forEach(celebrateAlbum);
        const kinds = Look.REWARD_KINDS;
        // Postavička se v oslavě ukáže místo sovy; text řekne, na které záložce Nastavení se odměna vybírá
        Look.newRewards(levelBefore, levelNow, freshBadgeIds).forEach(({ category, item }) => showCelebration('vitez', 'Nová odměna', `${item.title} (${kinds[category]}) – vyber si ji v ${rewardPlace(category)}`, null,
            category === 'avatars' && item.parts ? avatarArt(item.id, 'h-20 w-20 -my-4 drop-shadow-lg') : ''));
        freshBadgeIds = [];
        noteSeasonTier();
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
    // Účet, jehož postup se v tomto spuštění už sloučil se zařízením: odměny (se sezónou) se slučují až po něm, ať začátek sezóny
    // počítaný z XP zařízení před načtením XP z účtu nevyhraje jako „menší“
    let progressSyncedFor = null;
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
            // XP z účtu (získané na jiném zařízení) se do sezóny tady nepočítá: začátek sezóny se posune o totéž (season.js shift);
            // sloučení odměn s účtem pak vezme menší začátek, takže XP sezóny z jiného zařízení se vrátí přes jeho zápis v účtu
            if (Season && Rewards && merged.xp > local.xp) saveRewards(Season.shift(loadRewards(), merged.xp - local.xp));
            if (changedLocal) { saveProgress(merged); updateControlsUI(); }
            progressSyncedFor = user.id;
            const compact = compactBadges(Object.keys(merged.badges));
            const sameRemote = (remote.xp || 0) === merged.xp && [...compact].sort().join() === [...(remote.badges || [])].filter(id => BADGE_BY_ID[id]).sort().join();
            if (!sameRemote) await Social.saveProgress(user.id, { xp: merged.xp, badges: compact });
        } catch (error) { /* bez účtu nebo bez nových sloupců se postup jen drží v zařízení */ } finally { syncingProgress = false; }
        syncRewards();
    };
    // --- Týdenní cíle (goals.js): tři cíle na týden, postup z počítadel rozdílem od snímku na začátku týdne ---
    const goalMetrics = (progress) => {
        const learnedMap = loadLearned();
        return { ...normalizeCounters(progress.counters), learned: TOPICS.reduce((sum, topic) => sum + (learnedMap[topic.id] || []).length, 0) };
    };
    // Nabídka cílů: hra více hráčů jen s účtem, Kvíz dne, Bleskovka a Přežití, Seřaď jen když je aplikace má; cíle na víc dní jen, když
    // na ně týden má dost dní (stav týdne vzniklý v neděli nedostane „Zahraj Kvíz dne 3×“)
    const goalOptions = () => ({ topics: TOPICS.map(topic => ({ id: topic.id, title: topic.title })), multiplayer: Boolean(Auth && Auth.isConfigured() && Social), skip: reviewEnabled() ? [] : ['opakovani'],
        quiz: Boolean(DailyQuiz), modes: Boolean(Modes), numeric: Boolean(Numeric), daysLeft: Goals.daysLeft() });
    const currentGoals = (state) => Goals.goalsFor(state, goalOptions());
    // Stav týdne; nový týden začne novým snímkem (uloží se hned, ať se postup počítá od teď) a vylosované cíle se uloží s ním,
    // takže se během týdne nezmění (ani po přihlášení nebo vypnutí opakování, pokud cíl zůstane dostupný)
    const loadGoalsState = (progress = loadProgress()) => {
        const week = Goals.weekKey();
        const saved = readJson(KEYS.goals);
        const state = Goals.ensureState(saved, week, goalMetrics(progress));
        const ids = currentGoals(state).map(goal => goal.id);
        if (!saved || saved.week !== week || !Array.isArray(state.goals) || state.goals.join() !== ids.join()) {
            state.goals = ids;
            writeJson(KEYS.goals, state);
        }
        return state;
    };
    // Splněné cíle: XP a oslava jen jednou; za všechny tři bonus a odznak (počítadlo weeksDone)
    const settleGoals = () => {
        if (!Goals || devActive()) return;
        try {
            const progress = loadProgress();
            const state = loadGoalsState(progress);
            const result = Goals.settle(state, currentGoals(state), goalMetrics(progress));
            if (!result.awards.length && !result.bonus) return;
            const levelBefore = levelProgress(progress.xp).level;
            progress.xp += result.xp;
            chronicleLog({ xp: result.xp });
            if (result.bonus) progress.counters.weeksDone = (progress.counters.weeksDone || 0) + 1;
            const titles = grantBadges(progress);
            saveProgress(progress);
            writeJson(KEYS.goals, result.state);
            result.awards.forEach(award => showCelebration('oslava', 'Cíl týdne splněn', `${award.title} · +${award.xp} XP`));
            if (result.bonus) showCelebration('vitez', 'Všechny cíle týdne', `Bonus +${result.bonus} XP`);
            // Truhla Mudrlanta: otevře se na úvodu (pruh Cíle týdne), uprostřed hry by rušila
            if (result.bonus && Rewards) {
                saveRewards(Rewards.addChest(loadRewards(), state.week));
                showCelebration('vitez', 'Truhla Mudrlanta', 'Je tvoje! Otevřeš ji na úvodu v pruhu Cíle týdne.', 'badge');
                syncRewards();
            }
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
        return { state, rows: Goals.progress(currentGoals(state), state, goalMetrics(progress)) };
    };
    const goalsLeftText = () => {
        const left = Goals.daysLeft();
        return left === 1 ? 'poslední den' : left <= 4 ? `zbývají ${left} dny` : `zbývá ${left} dní`;
    };
    // Obrázek cíle týdne: symbol odznaku, ke kterému cíl patří; cíl v tématu ikona tématu (bez obrázku čárová ikona)
    const GOAL_ART = { spravne: 'odznak-odpovedi', dnesni: 'odznak-dnes', 'bez-napovedy': 'odznak-bez-napovedy', dny: 'odznak-dny', poznane: 'odznak-poznane',
        opakovani: 'procvicovani', chyby: 'odznak-chyby', vyzvy: 'odznak-vyzvy', vyhry: 'odznak-vyhry', turnaj: 'turnaj', kviz: 'odznak-kviz-dne',
        bleskovka: 'odznak-bleskovka', preziti: 'odznak-preziti', serad: 'odznak-serad' };
    const goalArt = (goal, cls) => {
        const topic = goal.kind === 'tema' ? TOPIC_BY_ID[goal.id.slice('tema-'.length)] : null;
        if (topic && topicArt(topic)) return uiArt(topic.id, cls);
        return GOAL_ART[goal.kind] ? uiArt(GOAL_ART[goal.kind], cls) : `<i data-lucide="${goal.icon}" class="${cls}"></i>`;
    };
    const renderGoalsCard = () => {
        if (!Goals) return '';
        // Čekající truhla má přednost: místo pruhu cílů zlaté tlačítko Otevřít (cíle jsou dál v okně po otevření truhly)
        if (Rewards && Rewards.pendingChest(loadRewards())) return Rewards.chestStripHtml();
        // Čekající odměna Sezóny Mudrlanta: stejný pruh (vyzvedne se jedním klepnutím, pak jsou tu zase cíle)
        const seasonStrip = seasonStripHtml();
        if (seasonStrip) return seasonStrip;
        // Od neděle 18:00 do konce pondělí: pruh Mudrlantovy kroniky (týden v kostce), jednou za týden
        const chronicleStrip = chronicleStripHtml();
        if (chronicleStrip) return chronicleStrip;
        const { state, rows } = goalRows();
        const done = rows.filter(row => row.done).length;
        const chip = ({ goal, value, done }) => `
            <span data-goal="${escapeHtml(goal.id)}" class="relative flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden rounded-lg px-1 py-1 text-[10.5px] font-black tabular-nums ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-200'}">
                ${done ? '<i data-lucide="circle-check" class="h-3 w-3 shrink-0"></i>' : goalArt(goal, 'h-4 w-4 -my-1')}
                <span class="truncate">${done ? 'Hotovo' : `${value}/${goal.target}`}</span>
                ${done ? '' : `<span class="absolute inset-x-0 bottom-0 h-[3px] bg-slate-200 dark:bg-slate-600" aria-hidden="true"><span class="block h-full w-0 bg-gold-500" data-progress="${Math.round(value / goal.target * 100)}"></span></span>`}
            </span>`;
        const label = `Cíle týdne: splněno ${done} ze ${rows.length}, ${goalsLeftText()}. Zobrazit podrobnosti`;
        return `
            <button type="button" id="weekly-goals" data-action="goals-open" aria-label="${escapeHtml(label)}" title="${escapeHtml(rows.map(row => row.goal.title).join('\n'))}" class="flex min-h-[2.5rem] w-full items-center gap-1.5 rounded-2xl bg-white px-2.5 py-1.5 text-left shadow-sm ring-1 ring-slate-200/70 transition-all active:scale-[0.98] dark:bg-slate-800/70 dark:ring-slate-700/70">
                ${uiArt('cile', 'h-7 w-7 -my-1 -ml-1')}
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
            <li data-goal-row="${escapeHtml(goal.id)}"><button type="button" data-goal-detail="${escapeHtml(goal.id)}" aria-label="${escapeHtml(`${goal.title}: podrobnosti a hrát`)}" class="block w-full rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition-transform active:scale-[0.99] ${done ? 'ring-emerald-300 dark:ring-emerald-700' : 'ring-slate-200/70 dark:ring-slate-700/70'} dark:bg-slate-800">
                <div class="flex items-start gap-2.5">
                    <span data-goal-art class="relative -my-1 shrink-0">${goalArt(goal, 'h-9 w-9')}${done ? '<span class="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-slate-800"><i data-lucide="check" class="h-3 w-3"></i></span>' : ''}</span>
                    <span class="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-800 dark:text-slate-100">${escapeHtml(goal.title)}</span>
                    <span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200'}">+${goal.xp} XP</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                    <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full ${done ? 'bg-emerald-500' : 'bg-gold-500'}" data-progress="${Math.round(value / goal.target * 100)}"></span></span>
                    <span class="text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">${done ? 'Splněno' : `${value} / ${goal.target}`}</span>
                    <i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-400"></i>
                </div>
            </button></li>`;
        showDialog('Cíle týdne', `
            <div class="mb-2 flex items-center gap-2">${uiArt('cile', 'h-10 w-10')}<p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(Goals.weekLabel(state.week))} · ${goalsLeftText()}</p></div>
            <ul class="flex flex-col gap-2">${rows.map(row).join('')}</ul>
            <p class="mt-3 flex items-center gap-2 rounded-2xl ${state.bonus ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gold-100 text-gold-800 dark:bg-gold-900/40 dark:text-gold-200'} px-3 py-2 text-xs font-bold"><i data-lucide="trophy" class="h-4 w-4 shrink-0"></i>${state.bonus ? `Všechny cíle splněny: bonus +${Goals.BONUS_XP} XP získán` : `Za všechny tři cíle bonus +${Goals.BONUS_XP} XP, odznak Týdenní cíle a Truhla Mudrlanta`}</p>
            ${Rewards && Rewards.pendingChest(loadRewards()) ? `<button type="button" data-chest-open class="${PRIMARY_BUTTON} mt-2 !bg-gold-500 !text-brand-950"><i data-lucide="sparkles" class="h-5 w-5"></i> Otevřít Truhlu Mudrlanta</button>` : ''}`, {
            onClick: (event) => {
                if (event.target.closest('[data-chest-open]')) { closeDialog(); openChestOverlay(); return; }
                const detail = event.target.closest('[data-goal-detail]');
                if (detail) openChild('Zpět na cíle týdne', openGoals, () => openGoalDetail(detail.dataset.goalDetail));
            }
        });
        applyProgress(document.getElementById('dialog-overlay'));
    };
    // Podrobnosti cíle týdne: co se počítá, jak daleko jsem a tlačítko rovnou do hry, kde se cíl plní
    const goalPlan = (goal) => {
        const topic = goal.kind === 'tema' ? TOPIC_BY_ID[goal.id.slice('tema-'.length)] : null;
        const mix = { label: 'Hrát Mix', run: () => startPractice({ kind: 'mix' }) };
        const daily = nextDailyTopic();
        const multi = (run) => () => { writeJson(KEYS.homeTab, 'multi'); run(); };
        const plans = {
            spravne: { text: 'Počítá se každá správná odpověď v jakékoli hře: procvičování, dnešní otázky, výzvy, turnaj i Kvíz dne.', ...mix },
            tema: topic ? { text: `Počítají se správné odpovědi v tématu ${topic.title}, ať hraješ procvičování, dnešní otázku nebo Mix.`, label: `Hrát ${topic.title}`, run: () => playTopic(topic.id) } : mix,
            dnesni: daily ? { text: 'Dnešní otázky: každý den jedna nová otázka z každého tématu. Počítá se každá správná.', label: `Dnešní otázka: ${daily.title}`, run: () => startNextDaily(daily.id) }
                : { text: 'Dnešní otázky: každý den jedna nová otázka z každého tématu. Na dnešek máš všechny zodpovězené, další přibudou zítra.', label: '', run: null },
            'bez-napovedy': { text: 'Odpověz správně dřív, než otevřeš první nápovědu (otázka za plné 4 body). Počítá se v každé hře.', ...mix },
            dny: { text: 'Stačí každý den odpovědět aspoň na jednu otázku. Každý den, kdy hraješ, se počítá jednou.', ...mix },
            poznane: { text: 'Nová položka se počítá, když na ni poprvé odpovíš správně (v atlasu dostane hvězdičku).', ...mix },
            opakovani: { text: 'Procvičování chyb vrací špatné odpovědi po 1, 3, 7, 14 a 30 dnech. Počítá se každá zopakovaná otázka.', label: 'Procvičovat chyby', run: () => (Review ? startReview() : startPractice({ kind: 'mistakes' })) },
            chyby: { text: 'Odpověz správně na otázku, kterou jsi dřív pokazil. Nejrychleji v procvičování svých chyb.', label: 'Procvičovat chyby', run: () => startPractice({ kind: 'mistakes' }) },
            vyzvy: { text: 'Dohraj výzvu proti kamarádovi nebo náhodnému soupeři. Počítá se každá dohraná výzva.', label: 'Nová výzva', run: multi(() => openNewChallenge()) },
            vyhry: { text: 'Vyhraj výzvu: rozhodují body, při shodě počet správných odpovědí.', label: 'Nová výzva', run: multi(() => openNewChallenge()) },
            turnaj: { text: 'Odehraj zápas týdenního turnaje. Kolo se hraje jeden den.', label: 'Otevřít turnaj', run: multi(() => { renderHome(); refreshTournaments(); }) },
            kviz: { text: 'Kvíz dne: 10 stejných otázek pro všechny, jeden pokus za den. Počítá se každý dohraný den.', label: 'Hrát Kvíz dne', run: () => openQuiz() },
            bleskovka: { text: 'Bleskovka: 60 sekund, co nejvíc správných odpovědí. Cíl splníš hrou s aspoň 10 správnými.', label: 'Hrát Bleskovku', run: () => openModeIntro('blitz', { kind: 'mix' }) },
            preziti: { text: 'Přežití: tři životy, otázky postupně těžší. Cíl splníš, když v jedné hře přežiješ 15 otázek.', label: 'Hrát Přežití', run: () => openModeIntro('survival', { kind: 'mix' }) },
            serad: { text: 'Otázky Seřaď (seřadit čtyři věci podle velikosti nebo doby) se objevují v procvičování. Počítá se každá seřazená bez chyby.', ...mix }
        };
        return plans[goal.kind] || mix;
    };
    const openGoalDetail = (goalId) => {
        const { rows } = goalRows();
        const row = rows.find(entry => entry.goal.id === goalId);
        if (!row) return;
        const { goal, value, done } = row;
        const plan = goalPlan(goal);
        showDialog('Cíl týdne', `
            <div data-goal-info="${escapeHtml(goal.id)}" class="flex flex-col gap-3">
                <div class="flex items-center gap-3">${goalArt(goal, 'h-16 w-16')}<div class="min-w-0"><p class="text-[15px] font-black leading-snug text-slate-800 dark:text-slate-100">${escapeHtml(goal.title)}</p><p class="mt-1 inline-block rounded-md bg-gold-100 px-1.5 py-0.5 text-[11px] font-black text-gold-800 dark:bg-gold-900/40 dark:text-gold-200">+${goal.xp} XP</p></div></div>
                <div class="flex items-center gap-2">
                    <span class="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span class="block h-full w-0 rounded-full ${done ? 'bg-emerald-500' : 'bg-gold-500'}" data-progress="${Math.round(value / goal.target * 100)}"></span></span>
                    <span class="text-[12px] font-black tabular-nums text-slate-600 dark:text-slate-300">${done ? 'Splněno' : `${value} / ${goal.target}`}</span>
                </div>
                <p data-goal-text class="text-[13px] leading-snug text-slate-700 dark:text-slate-200">${escapeHtml(plan.text)}</p>
                ${plan.run ? `<button type="button" data-goal-play class="${PRIMARY_BUTTON}"><i data-lucide="play" class="h-5 w-5"></i> ${escapeHtml(plan.label)}</button>` : ''}
                ${dialogBackButton()}
            </div>`, {
            onClick: (event) => {
                if (event.target.closest('[data-goal-play]') && plan.run) { closeDialog(); plan.run(); }
            }
        });
        applyProgress(document.getElementById('dialog-overlay'));
    };

    // --- Odměny (rewards.js): Truhla Mudrlanta za cíle týdne, ochrana série a diplomy za mistrovství tématu ---
    // Stav v zařízení (mudrlant.rewards), po přihlášení i v účtu (profiles.rewards, schéma 9; se starší databází jen v zařízení)
    const Rewards = window.MudrlantRewards || null;
    // Album sbírky (album.js): co všechno jde sbírat, co hráč má a co chybí; okno a napojení v oddílu „Album sbírky“ u Mého postupu
    const Album = window.MudrlantAlbum || null;
    const loadRewards = () => (Rewards ? Rewards.parse(readJson(Rewards.KEY)) : null);
    const saveRewards = (state) => {
        if (!Rewards) return;
        writeJson(Rewards.KEY, state);
        if (Look) Look.setGifts(Rewards.gifts(state));
    };
    // Dny zachráněné ochranou série: série dnešních otázek i Kvízu dne přes ně pokračují
    const frozenDays = () => (Rewards ? loadRewards().frozen : []);
    const topicStreak = (results, today = getDayKey()) => computeStreak(results || {}, today, frozenDays());
    // Řádek „Další odměna za sérii: Stovka za 100 dní (zbývá 37)“ (rewards.js); prázdný, když už má hráč všechny odměny za sérii
    const nextStreakReward = (streak, badges = loadProgress().badges) => {
        if (!Rewards || !Look) return null;
        const group = BADGE_GROUPS.find(entry => entry.id === 'serie');
        return group ? Rewards.nextStreakReward(group.badges, badges, streak) : null;
    };
    const streakRewardLine = (streak, cls = '') => { const next = nextStreakReward(streak); return next ? Rewards.streakRewardHtml(next, chestHelpers(), cls) : ''; };
    // Nejdelší běžící série dnešních otázek (přes všechna témata), podle ní se počítá odznak série
    const longestStreak = () => { const stats = loadStats(); return Math.max(0, ...TOPICS.map(topic => topicStreak(stats.daily[topic.id]))); };
    // Popisek štítku série na úvodu (úvod je bez posouvání plný, řádek se tam nevejde)
    const streakRewardTitle = (streak, badges) => { const next = nextStreakReward(streak, badges); return `Série ${streak} ${streak === 1 ? 'den' : streak <= 4 ? 'dny' : 'dní'}${next ? ` · ${Rewards.streakRewardText(next)}` : ''}`; };
    const quizStreakOf = (played, today) => (DailyQuiz ? DailyQuiz.streakOf(played, today, frozenDays()) : 0);
    // Počítadla odměn (otevřené truhly, použité ochrany, sdílené obrázky) jsou s ostatními počítadly postupu (tipy, odznaky)
    const bumpCounter = (key, by = 1) => {
        const progress = loadProgress();
        progress.counters[key] = (progress.counters[key] || 0) + by;
        saveProgress(progress);
    };
    // Ochrana série: jednou denně po spuštění; včera nevyšla žádná série aspoň tří dní → ochrana ji zachrání (rewards.js)
    const checkStreakFreeze = () => {
        if (!Rewards || devActive()) return;
        try {
            const stats = loadStats();
            const quizDays = new Set(DailyQuiz ? DailyQuiz.playedDays(quizState(), DailyQuiz.pragueDay()) : []);
            const series = [
                ...TOPICS.map(topic => ({ id: topic.id, ok: (day) => Boolean(((stats.daily[topic.id] || {})[day] || {}).correct) })),
                { id: 'kviz-dne', ok: (day) => quizDays.has(day) }
            ];
            const before = loadRewards();
            const result = Rewards.checkFreeze(before, getDayKey(), series);
            if (result.state.checked === before.checked) return;
            saveRewards(result.state);
            if (!result.used) return;
            bumpCounter('freezesUsed');
            const left = result.state.freezes;
            showCelebration('serie', 'Ochrana série zabrala', `Včerejší den je zachráněný, série ti zůstala. ${left ? `Zbývá ${left} ${Rewards.freezeWord(left)}.` : 'Další ochranu získáš z truhly nebo za 7 dní v řadě.'}`);
            syncRewards();
        } catch (error) { console.error(error); }
    };
    // Nová ochrana za 7 dní v řadě (dnešní otázky: d, Kvíz dne: q); nad strop 2 se nepřidá
    const earnStreakFreeze = (source, day, streak) => {
        if (!Rewards || devActive()) return;
        const result = Rewards.streakFreeze(loadRewards(), source, day, streak);
        if (!result.gained) return;
        saveRewards(result.state);
        showCelebration('serie', 'Ochrana série', `Za ${streak} dní v řadě máš ochranu série (${result.state.freezes} z ${Rewards.MAX_FREEZES}). Zachrání ti jeden vynechaný den.`);
        syncRewards();
    };
    const topicStarsNow = () => { const learned = loadLearned(); return Object.fromEntries(TOPICS.map(topic => [topic.id, masteryStars((learned[topic.id] || []).length)])); };
    // Diplomy za plné mistrovství tématu: zapíší se s dnešním dnem a oslaví se jednou (volá grantBadges, úvod a Můj postup – hráč,
    // který plné mistrovství měl už před touto verzí, dostane diplom hned)
    const noteDiplomas = (topicStars) => {
        if (!Rewards || devActive()) return;
        const result = Rewards.noteDiplomas(loadRewards(), topicStars, getDayKey(), MASTERY_STEPS.length);
        if (!result.fresh.length) return;
        saveRewards(result.state);
        // K diplomu patří legendární postavička (look.js diploma): oslava ji ukáže místo sovy a řekne, kde se vybírá
        result.fresh.forEach(id => {
            if (!TOPIC_BY_ID[id]) return;
            const legend = Look && Look.rewardsForDiploma ? Look.rewardsForDiploma(id).find(entry => entry.category === 'avatars') : null;
            showCelebration('vitez', 'Nový diplom', `${Rewards.diplomaTitle(TOPIC_BY_ID[id])} – najdeš ho v Mém postupu${legend ? `. Odměna: legendární postavička ${legend.item.title} – vyber si ji v ${rewardPlace('avatars')}` : ''}`, 'badge',
                legend ? avatarArt(legend.item.id, 'h-20 w-20 -my-4 drop-shadow-lg') : '');
        });
        syncRewards();
    };
    // Odměny v účtu: sjednocení se zařízením (věci a truhly se sčítají, počet ochran platí z novější změny); bez sloupce nic
    let syncingRewards = false;
    const syncRewards = async () => {
        const user = signedUser();
        if (!Rewards || !user || !Social || syncingRewards || devActive()) return;
        if (Season && progressSyncedFor !== user.id) return;
        syncingRewards = true;
        try {
            const remote = await Social.getRewards(user.id);
            if (!remote) return;
            const local = loadRewards();
            const merged = Rewards.merge(local, remote.rewards || {});
            if (!Rewards.samePayload(merged, local)) {
                saveRewards(merged);
                if (screen === 'home') paintGoalsCard();
                // Nové věci z truhly z jiného zařízení: rámeček či sova z účtu se teď dají převzít
                applyLook();
                syncLookWithAccount();
            }
            // Prázdné odměny (hráč zatím nic nezískal, sezóna jen založená) se do účtu nezapisují – zbytečný zápis při každém prvním přihlášení
            const nothing = Rewards.isEmpty(merged);
            if (!nothing && (!remote.rewards || !Rewards.samePayload(merged, remote.rewards))) await Social.saveRewards(user.id, Rewards.payload(merged));
        } catch (error) { /* bez sítě nebo sloupce zůstanou odměny v zařízení */ } finally { syncingRewards = false; }
    };
    const paintGoalsCard = () => {
        const card = document.getElementById('weekly-goals');
        if (!card || screen !== 'home') return;
        card.outerHTML = renderGoalsCard();
        applyProgress(appContent);
        renderIcons(appContent);
    };
    // Obrázek do sdílení (ShareCard.shareImage) s počítadlem pro tip a odznaky
    const shareImageCounted = async (input, options) => {
        const result = await ShareCard.shareImage(input, options);
        if (result === 'shared' || result === 'downloaded') bumpCounter('sharedImages');
        return result;
    };

    // Truhla Mudrlanta: okno přes celou obrazovku, klepnutím na truhlu se otevře (animace v src/input.css, .chest-*); věc jde hned nasadit
    const closeChestOverlay = () => {
        const overlay = document.getElementById('chest-overlay');
        if (overlay) overlay.remove();
        if (screen === 'home') paintGoalsCard();
    };
    const chestHelpers = () => ({ frameClass: (id) => (window.MudrlantLookFrames ? window.MudrlantLookFrames.frameClass(id) : '') });
    // Nasazení věci z truhly (talár, téma, rámeček, doplněk do jeho místa); barva doplňků se volí v Nastavení. Do účtu (rámeček,
    // sova profilu) se změna pošle sama přes Look.onChange
    const wearGift = (gift) => {
        if (!Look || !gift) return;
        const ctx = lookContext();
        const key = { robes: 'robe', themes: 'theme', frames: 'frame' }[gift.category];
        if (key) Look.setPref(key, gift.item.id, ctx);
        else if (gift.category === 'accessories') Look.setPref('acc', { ...(ctx.prefs.acc || {}), [gift.item.slot]: { id: gift.item.id, color: 'original' } }, ctx);
        applyLook();
    };
    const openChestOverlay = () => {
        if (!Rewards) return;
        const week = Rewards.pendingChest(loadRewards());
        if (!week || document.getElementById('chest-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'chest-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Truhla Mudrlanta');
        // Ukotvené shora (odsazení v .chest-overlay): po otevření truhla zůstane na místě a obsah přibude pod ní
        overlay.className = 'chest-overlay fade-in fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 pb-4';
        let opened = null;
        let opening = false;
        const paint = () => {
            overlay.innerHTML = Rewards.chestHtml({ opened }, chestHelpers());
            renderIcons(overlay);
            const focus = overlay.querySelector(opened ? '[data-chest-wear], [data-chest-close]' : 'button[data-chest-go]:not([disabled])');
            if (focus) focus.focus({ preventScroll: true });
        };
        const reveal = () => {
            // Okno zavřené během natřásání: truhla zůstane zavřená a čeká dál
            if (!overlay.isConnected) return;
            const progress = loadProgress();
            const result = Rewards.openChest(loadRewards(), week, { level: levelProgress(progress.xp).level, badges: progress.badges });
            if (!result.opened) { overlay.remove(); return; }
            saveRewards(result.state);
            progress.counters.chestsOpened = (progress.counters.chestsOpened || 0) + 1;
            const levelBefore = levelProgress(progress.xp).level;
            if (result.xp) { progress.xp += result.xp; chronicleLog({ xp: result.xp }); }
            const titles = grantBadges(progress);
            saveProgress(progress);
            opened = result;
            paint();
            if (Sound) Sound.play('record');
            announce(levelBefore, levelProgress(progress.xp).level, titles);
            applyLook();
            updateControlsUI();
            syncRewards();
            syncProgress();
        };
        overlay.addEventListener('click', (event) => {
            if (event.target.closest('[data-chest-close]') || event.target === overlay) { closeChestOverlay(); return; }
            if (event.target.closest('[data-chest-wear]') && opened && opened.gift) {
                wearGift(opened.gift);
                closeChestOverlay();
                showToast(`${opened.gift.item.title}: hotovo. Změníš to v ${rewardPlace(opened.gift.category)}.`);
                return;
            }
            const go = event.target.closest('[data-chest-go]');
            if (go && !opened && !opening && !go.disabled) {
                // Krátké natřesení, pak se víko otevře (při omezeném pohybu hned); další klepnutí už nic neudělají. Tlačítko se
                // nevypíná, ať na něm zůstane fokus (Escape okno zavře i během natřásání)
                opening = true;
                const stage = overlay.querySelector('[data-chest-stage]');
                const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (still || !stage) { reveal(); return; }
                stage.classList.add('chest-shaking');
                setTimeout(reveal, 350);
            }
        });
        overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeChestOverlay(); });
        trapFocus(overlay);
        document.body.appendChild(overlay);
        paint();
    };
    const openFreezeHelp = () => {
        if (!Rewards) return;
        showDialog('Ochrana série', `${Rewards.freezeHelpHtml(loadRewards().freezes)}${streakRewardLine(longestStreak(), 'mt-2.5 rounded-xl bg-white px-2.5 py-2 shadow-sm dark:bg-slate-800')}${dialogBackButton('mt-3')}`);
    };
    const lastChestText = (state) => {
        const week = Object.keys(state.chests).sort().pop();
        const reward = week ? Rewards.chestReward(state, week) : null;
        return !reward ? '' : reward.xp ? `+${reward.xp} XP` : reward.item.title;
    };
    const openChestHelp = () => {
        if (!Rewards) return;
        if (Rewards.pendingChest(loadRewards())) { closeDialog(); openChestOverlay(); return; }
        showDialog('Truhla Mudrlanta', `${Rewards.chestHelpHtml(lastChestText(loadRewards()))}<div class="mt-3 grid ${dialogTrail.length ? 'grid-cols-2' : 'grid-cols-1'} gap-2"><button type="button" data-goals-open class="${SECONDARY_BUTTON} !py-2.5 text-sm"><i data-lucide="target" class="h-4 w-4"></i> Cíle týdne</button>${dialogTrail.length ? dialogBackButton().replace('Zpět na ', '') : ''}</div>`,
            { onClick: (event) => { if (event.target.closest('[data-goals-open]')) openChild('Zpět na Truhlu', openChestHelp, openGoals); } });
    };

    // --- Sezóna Mudrlanta (season.js): měsíční cesta 20 stupňů odměn; stav je v odměnách (rewards.js season, past) ---
    const Season = window.MudrlantSeason || null;
    // Album sbírky: sezónní věci (rámeček, doplněk a postavička měsíce) jdou získat jen v sezóně svého měsíce, dřívější jsou „už nejde získat“
    if (Album && Season) Album.setAvailability(Season.availability);
    // XP pro sezónu: ve vývojářském režimu skutečné XP ze zálohy (zkušební úroveň se do sezóny nepočítá)
    const seasonXp = () => {
        if (devActive()) {
            try {
                const backup = JSON.parse(localStorage.getItem(DEV_BACKUP));
                const extra = Math.max(0, Math.floor(Number(localStorage.getItem(DEV_SEASON_XP)) || 0));
                return (backup && Number.isFinite(backup.xp) ? Math.max(0, Math.floor(backup.xp)) : 0) + extra;
            } catch (e) { return 0; }
        }
        return loadProgress().xp;
    };
    const seasonNow = () => ({ today: Season.pragueDay(), xp: seasonXp() });
    // Sezóna podle dneška (založí ji, nebo přejde do nového měsíce) a přehled pro okna; null bez modulů
    const seasonView = () => {
        if (!Season || !Rewards) return null;
        const now = seasonNow();
        const result = Season.ensure(loadRewards(), now);
        if (result.changed) { saveRewards(result.state); syncRewards(); }
        return Season.info(result.state, now);
    };
    const seasonUser = () => { const user = signedUser(); return user ? user.id : 'host'; };
    // Nový dosažený stupeň během hry: oslava (jednou za stupeň; po spuštění se jen zapamatuje, kde hráč je)
    let seasonTierSeen = null;
    const noteSeasonTier = () => {
        const view = seasonView();
        if (!view) return;
        const tier = view.progress.tier;
        if (seasonTierSeen !== null && tier > seasonTierSeen) showCelebration('oslava', `Sezóna: stupeň ${tier}`, 'Odměna čeká na úvodu.', 'badge');
        seasonTierSeen = tier;
    };
    // Nasazení věcí ze sezóny (talár, téma, rámeček, doplněk, titul); postavička a barvy se volí v Nastavení
    const wearSeasonParts = (parts) => {
        if (!Look) return;
        parts.filter(part => part.item && ['robes', 'themes', 'frames', 'accessories'].includes(part.category)).forEach(part => wearGift(part));
        const title = parts.find(part => part.category === 'titles');
        if (title) { Look.setPref('title', title.item.id, lookContext()); applyLook(); }
    };
    const closeSeasonOverlay = () => {
        const overlay = document.getElementById('season-overlay');
        if (overlay) overlay.remove();
        if (screen === 'home') paintGoalsCard();
    };
    // Odhalení odměny stupně: pečeť (nebo truhla na 10. a 20. stupni) přes celou obrazovku; klepnutím se odměna vyzvedne
    // (jako Truhla Mudrlanta: krátké natřesení, při omezeném pohybu hned). „Další“ otevře další čekající stupeň.
    // back = kam se po zavření vrátit (okno sezóny nebo Můj postup, odkud se vyzvedávalo); z úvodu nikam
    const openSeasonReveal = (target = null, back = null) => {
        if (!Season || document.getElementById('season-overlay') || document.getElementById('chest-overlay')) return;
        const view = seasonView();
        const entry = target ? view.pending.find(item => item.which === target.which && item.tier === target.tier) : view.pending[0];
        if (!entry) return;
        // Návrat po zavření vrátí i cestu mezi okny (okno sezóny z Mého postupu má dál tlačítko zpět)
        if (back && !back.keepsTrail) {
            const to = back;
            const trail = dialogTrail;
            back = () => { dialogNavigating = true; try { dialogTrail = trail; to(); } finally { dialogNavigating = false; } dialogTrail = trail; };
            back.keepsTrail = true;
        }
        closeDialog();
        const overlay = document.createElement('div');
        overlay.id = 'season-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', `Sezóna ${Season.label(entry.id)}: stupeň ${entry.tier}`);
        overlay.className = 'chest-overlay fade-in fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 pb-4';
        let opened = null;
        let opening = false;
        const left = () => Math.max(0, seasonView().pending.length);
        const paint = () => {
            overlay.innerHTML = Season.revealHtml({ id: entry.id, tier: entry.tier, opened, next: opened ? left() : 0, h: chestHelpers() });
            renderIcons(overlay);
            // Fokus na hlavní akci (ne na křížek v rohu, ten je v pořadí první)
            const focus = opened ? ['[data-season-wear]', '[data-season-next]', '[data-season-close]:not([data-season-x])'].map(css => overlay.querySelector(css)).find(Boolean) : overlay.querySelector('button[data-season-go]:not([disabled])');
            if (focus) focus.focus({ preventScroll: true });
        };
        const reveal = () => {
            if (!overlay.isConnected) return;
            const progress = loadProgress();
            const result = Season.claim(loadRewards(), { which: entry.which, tier: entry.tier, ctx: { level: levelProgress(progress.xp).level, badges: progress.badges }, xp: seasonXp(), today: Season.pragueDay(), user: seasonUser() });
            if (!result.opened) { overlay.remove(); return; }
            saveRewards(result.state);
            const levelBefore = levelProgress(progress.xp).level;
            if (result.xp) { progress.xp += result.xp; chronicleLog({ xp: result.xp }); }
            const titles = grantBadges(progress);
            saveProgress(progress);
            opened = result;
            paint();
            if (Sound) Sound.play('record');
            announce(levelBefore, levelProgress(progress.xp).level, titles);
            applyLook();
            updateControlsUI();
            syncRewards();
            if (result.xp) syncProgress();
        };
        overlay.addEventListener('click', (event) => {
            if (event.target.closest('[data-season-close]') || event.target === overlay) { closeSeasonOverlay(); if (back) back(); return; }
            if (event.target.closest('[data-season-next]')) { closeSeasonOverlay(); openSeasonReveal(null, back); return; }
            if (event.target.closest('[data-season-wear]') && opened) {
                wearSeasonParts(opened.parts);
                const more = left();
                closeSeasonOverlay();
                const first = opened.parts.find(part => part.item);
                showToast(`${opened.parts.filter(part => part.item && part.category !== 'colors' && part.category !== 'avatars').map(part => part.item.title).join(', ')}: hotovo. Změníš to v ${rewardPlace(first ? first.category : 'frames')}.`);
                if (more) setTimeout(() => openSeasonReveal(null, back), 250); else if (back) back();
                return;
            }
            const go = event.target.closest('[data-season-go]');
            if (go && !opened && !opening && !go.disabled) {
                opening = true;
                const stage = overlay.querySelector('[data-chest-stage]');
                const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (still || !stage) { reveal(); return; }
                stage.classList.add('chest-shaking');
                setTimeout(reveal, 350);
            }
        });
        overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeSeasonOverlay(); if (back) back(); } });
        trapFocus(overlay);
        document.body.appendChild(overlay);
        paint();
    };
    // Okno sezóny: celá cesta odměn; klepnutí na stupeň ukáže, co dává (čekající rovnou vyzvedne)
    const openSeason = (selected = null) => {
        if (!Season || !Rewards) return;
        touchTip('season');
        const view = seasonView();
        showDialog(`Sezóna ${Season.label(view.id)}`, `${Season.pathHtml(view, { selected, h: chestHelpers() })}${dialogBackButton('mt-2')}`, {
            onClick: (event) => {
                if (event.target.closest('[data-season-claim-past]')) { openSeasonReveal(view.pastPending[0], () => openSeason()); return; }
                if (event.target.closest('[data-season-claim]')) { openSeasonReveal(null, () => openSeason()); return; }
                const tile = event.target.closest('[data-season-tier]');
                if (!tile) return;
                const tier = Number(tile.dataset.seasonTier);
                if (tile.dataset.state === 'ready') openSeasonReveal({ which: 'season', tier }, () => openSeason());
                else openSeason(tier);
            }
        });
        applyProgress(document.getElementById('dialog-overlay'));
    };
    // Pruh na úvodu, když čeká odměna sezóny (místo cílů týdne; Truhla Mudrlanta má přednost)
    const seasonStripHtml = () => {
        const view = seasonView();
        if (!view || !view.pending.length) return '';
        const past = view.pastPending.length > 0;
        return Season.stripHtml({ id: past ? view.past.id : view.id, count: past ? view.pastPending.length : view.pending.length, past, until: view.pastUntil });
    };
    // --- Mudrlantova kronika (chronicle.js): týden v kostce. Denní záznamy (mudrlant.week) jsou jen v zařízení; dny před kronikou
    // doplní dnešní otázky a Kvíz dne. Pruh na úvodu (místo pruhu cílů) od neděle 18:00 do konce pondělí, jednou za týden; okno i z Mého postupu ---
    const chronicleLog = (event) => {
        if (!Chronicle) return;
        try { writeJson(Chronicle.KEY, Chronicle.record(readJson(Chronicle.KEY), event)); } catch (error) { console.error(error); }
    };
    const chronicleLegacy = () => {
        const quiz = window.MudrlantDailyQuiz;
        return { daily: loadStats().daily, quiz: quiz ? quiz.parseState(readJson(quiz.KEY)).days : {} };
    };
    const chronicleTitles = () => Object.fromEntries(TOPICS.map(topic => [topic.id, topic.title]));
    const chronicleView = (week) => {
        const state = readJson(Chronicle.KEY);
        const legacy = chronicleLegacy();
        const summary = Chronicle.summarize(state, week, legacy);
        return {
            summary, verdict: Chronicle.verdict(summary, chronicleTitles()), pages: Chronicle.pagesFor(summary),
            comparison: Chronicle.compare(summary, Chronicle.summarize(state, Chronicle.addDays(week, -7), legacy)),
            goal: Chronicle.nextGoal(summary, groupedTopics().flatMap(group => group.topics))
        };
    };
    const chronicleStripHtml = () => {
        if (!Chronicle) return '';
        try {
            const summary = Chronicle.stripSummary(readJson(Chronicle.KEY), chronicleLegacy());
            return summary ? Chronicle.stripHtml(summary, Chronicle.verdict(summary, chronicleTitles()), { uiArt }) : '';
        } catch (error) { console.error(error); return ''; }
    };
    const markChronicleSeen = (week) => writeJson(Chronicle.KEY, Chronicle.markSeen(readJson(Chronicle.KEY), week));
    const dismissChronicle = () => {
        const week = Chronicle && Chronicle.stripWeek();
        if (week) markChronicleSeen(week);
        paintGoalsCard();
    };
    const openChronicleFromStrip = () => {
        const week = Chronicle && Chronicle.stripWeek();
        if (!week) { paintGoalsCard(); return; }
        markChronicleSeen(week);
        paintGoalsCard();
        openChronicle(week);
    };
    const chronicleCard = (view) => Chronicle.cardInput(view.summary, view.verdict, { robe: robeNow(), url: appUrl(), appName: APP_NAME });
    const chronicleFile = (view) => ShareCard.fileName('tyden', view.summary.week);
    // week = týden z pruhu; bez něj (z Mého postupu) s přepínačem Minulý / Tento týden. Příběh ve 3–5 kartách: klepnutí na kartu nebo Dál
    let chronicleNav = null;
    const openChronicle = (week = null) => {
        if (!Chronicle) return;
        touchTip('chronicle');
        const now = Chronicle.thisWeek();
        const toggle = week ? null : Chronicle.stripWeek() === now ? 'this' : 'last';
        chronicleNav = { week: week || (toggle === 'this' ? now : Chronicle.lastWeek()), toggle, page: 0 };
        paintChronicle();
    };
    const paintChronicle = () => {
        const nav = chronicleNav;
        if (!nav) return;
        const view = chronicleView(nav.week);
        nav.page = Math.max(0, Math.min(nav.page, view.pages.length - 1));
        const last = nav.page === view.pages.length - 1;
        showDialog('Kronika týdne', Chronicle.pageHtml(view.summary, { ...view, page: nav.page, toggle: nav.toggle }, { topicIcon, uiArt, topicById: TOPIC_BY_ID }), {
            onClick: (event) => {
                const pick = event.target.closest('[data-kr-week]');
                if (pick) {
                    nav.toggle = pick.dataset.krWeek;
                    nav.week = nav.toggle === 'this' ? Chronicle.thisWeek() : Chronicle.lastWeek();
                    nav.page = 0;
                    paintChronicle();
                    return;
                }
                if (event.target.closest('[data-kr-share]')) {
                    if (ShareCard) shareImageCounted(chronicleCard(view), { name: chronicleFile(view), text: Chronicle.shareText(view.summary, view.verdict, appUrl()), toast: showToast });
                    return;
                }
                if (event.target.closest('[data-kr-prev]')) { nav.page -= 1; paintChronicle(); return; }
                const next = event.target.closest('[data-kr-next]');
                // Klepnutí na kartu (mimo tlačítka) = další karta jako v příběhu
                const card = !next && !event.target.closest('button') && event.target.closest('[data-kr-card]');
                if (next && last) { chronicleNav = null; dialogStepBack(); return; }
                if ((next || card) && !last) { nav.page += 1; paintChronicle(); }
            }
        });
        // Obrázek do sdílení se kreslí dopředu, ať ho Safari po klepnutí pustí do sdílení
        if (last && ShareCard) ShareCard.prepare(chronicleCard(view), chronicleFile(view));
    };
    // Legendární postavička z okna diplomu: Nastavení → Profil se skupinou Legendy a fokusem na ní (vybere a uloží si ji hráč sám);
    // bez účtu jen věta (profilový obrázek mají přihlášení)
    const openLegend = (id) => {
        if (!(signedUser() && Social)) { showToast('Legendární postavičku si dáš jako profilový obrázek po přihlášení.'); return; }
        closeDialog();
        openSettings('', null, 'profile');
        pictureGroup = 'legendy';
        touchTip('legends');
        openSettings('', `[data-pick-avatar="${id}"], [data-locked-avatar="${id}"]`, 'profile');
    };
    // Diplomy: řádek za každé téma (získaný, kdy, kolik chybí do plného mistrovství)
    const diplomaRows = () => {
        const learned = loadLearned();
        const state = loadRewards();
        const needed = MASTERY_STEPS[MASTERY_STEPS.length - 1];
        return TOPICS.map(topic => {
            const known = (learned[topic.id] || []).length;
            const day = state.diplomas[topic.id] || null;
            return { topic, title: Rewards.diplomaTitle(topic), earned: Boolean(day), day, known, needed, missing: Math.max(0, needed - known) };
        });
    };
    const diplomaName = () => {
        const saved = loadRewards().name;
        if (saved) return saved;
        const user = signedUser();
        return (myProfile && myProfile.display_name) || (user && user.name) || '';
    };
    const diplomaInput = (row, name) => ({
        kind: 'diploma', topic: { id: row.topic.id, title: row.topic.title, color: row.topic.color }, title: row.title, name, day: row.day,
        known: Math.max(row.known, row.needed), robe: robeNow(), url: appUrl(), appName: APP_NAME
    });
    const openDiploma = (topicId) => {
        if (!Rewards) return;
        touchTip('diplomas');
        const row = diplomaRows().find(entry => entry.topic.id === topicId);
        if (!row) return;
        let name = diplomaName();
        // Získaný diplom jde vystavit ve vitríně profilu (schéma 18): Vystavit vedle tlačítka Diplomy, okno se tím nezvětší
        const entry = Showcase ? Showcase.diploma(row.topic.id) : '';
        const backButton = dialogBackButton();
        const backRow = () => (row.earned && showcaseToggle(entry) ? `<div class="mt-2.5 grid ${backButton ? 'grid-cols-2' : 'grid-cols-1'} gap-2" data-diploma-showcase>${backButton}${showcaseToggle(entry, true)}</div>` : `<div class="mt-2.5">${backButton}</div>`);
        const back = backRow();
        if (row.earned && myShowcase === null && signedUser()) loadMyShowcase(signedUser()).then(() => {
            const box = document.querySelector('#dialog-overlay [data-diploma-dialog]');
            if (box && box.parentElement && box.nextElementSibling && myShowcase) { box.nextElementSibling.outerHTML = backRow(); renderIcons(document.getElementById('dialog-overlay')); }
        });
        const fileName = () => ShareCard.fileName(`diplom-${row.topic.id}`, row.day);
        let drawn = 0;
        // Náhled je samotné plátno (obrázek z adresy blob: by CSP nepustila)
        const draw = async () => {
            const token = ++drawn;
            const box = document.querySelector('#dialog-overlay [data-diploma-preview]');
            if (!box || !ShareCard) return;
            try {
                const canvas = await ShareCard.render(diplomaInput(row, name));
                if (token !== drawn || !box.isConnected) return;
                canvas.className = 'h-full w-full object-contain';
                canvas.setAttribute('role', 'img');
                canvas.setAttribute('aria-label', `Diplom ${row.title}${name ? `, ${name}` : ''}`);
                box.replaceChildren(canvas);
            } catch (error) { box.innerHTML = '<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Diplom se nepodařilo nakreslit.</p>'; }
        };
        let typing = null;
        showDialog(row.earned ? 'Diplom' : row.title, Rewards.diplomaDialogHtml(row, { name, needName: !name }, { topicIcon, styleOf, avatar: (id, cls) => avatarArt(id, cls) }) + back, {
            onClick: (event) => {
                // Vystavit: překreslí se jen řádek s tlačítky (náhled diplomu zůstane)
                const toggle = event.target.closest('[data-showcase-toggle]');
                if (toggle) {
                    onShowcaseToggle(toggle, () => {
                        const rowBox = document.querySelector('#dialog-overlay [data-diploma-showcase]');
                        if (rowBox) { rowBox.outerHTML = backRow(); renderIcons(document.getElementById('dialog-overlay')); }
                    });
                    return;
                }
                const legend = event.target.closest('[data-diploma-legend]');
                if (legend) { openLegend(legend.dataset.diplomaLegend); return; }
                if (!ShareCard) return;
                if (event.target.closest('[data-diploma-share]')) shareImageCounted(diplomaInput(row, name), { name: fileName(), text: `${row.title} · ${APP_NAME}`, toast: showToast });
                if (event.target.closest('[data-diploma-download]')) ShareCard.saveImage(diplomaInput(row, name), { name: fileName(), toast: showToast }).then(result => { if (result === 'downloaded') bumpCounter('sharedImages'); });
            },
            onInput: (event) => {
                const field = event.target.closest('[data-diploma-name]');
                if (!field) return;
                name = field.value.replace(/\s+/g, ' ').trim().slice(0, 30);
                saveRewards(Rewards.setName(loadRewards(), name));
                clearTimeout(typing);
                typing = setTimeout(draw, 300);
            }
        });
        applyProgress(document.getElementById('dialog-overlay'));
        if (row.earned) draw();
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
        if (isNumeric(current) && !round.gaveUp && round.score) {
            if (current.numeric.kind === 'order') { counters.orderAnswered += 1; if (round.score.base === Numeric.MAX_BASE) counters.orderPerfect += 1; }
            else { counters.estimateAnswered += 1; if (round.score.base >= 3) counters.estimateGood += 1; }
        }
        if (current.question && current.question.type === 'map' && round.map && !round.gaveUp) {
            counters.mapAnswered += 1;
            if (MapQuestion && round.map.points >= MapQuestion.maxPoints(round.variant === 'typed')) counters.mapExact += 1;
        }
        const parts = [{ label: round.correct ? 'za správnou odpověď' : 'za pokus o odpověď', xp: answerXp(round) }];
        if (mode === 'daily' && current.dailyDate && round.dailyFirst !== false) {
            parts.push({ label: 'za dnešní otázku tématu', xp: DAILY_XP });
            if (round.correct) {
                const streak = topicStreak(stats.daily[current.topic]);
                if (streak > 1) parts.push({ label: `za sérii ${streak} dní v řadě`, xp: streakXp(streak) });
            }
            const dayStreak = topicStreak(stats.daily[current.topic]);
            counters.bestStreak = Math.max(counters.bestStreak, dayStreak);
            if (round.correct && [3, 7, 14, 30, 60, 100, 200, 365].includes(dayStreak)) {
                // S výhledem na další odměnu za sérii (odznaky do této délky se počítají jako získané, dostane je hráč právě teď)
                const serie = BADGE_GROUPS.find(group => group.id === 'serie');
                const upcoming = nextStreakReward(dayStreak, { ...before.badges, ...Object.fromEntries((serie ? serie.badges : []).filter(badge => badge.goal <= dayStreak).map(badge => [badge.id, true])) });
                showCelebration('serie', `Série ${dayStreak} dní`, upcoming ? `Dnešní otázky ti jdou! ${Rewards.streakRewardText(upcoming)}.` : 'Dnešní otázky ti jdou! Jen tak dál.');
            }
            // Každých 7 dní v řadě (v některém tématu) ochrana série, nejvýš jedna za den
            if (round.correct) earnStreakFreeze('d', getDayKey(), dayStreak);
            const done = TOPICS.filter(topic => (stats.daily[topic.id] || {})[current.dailyDate]).length;
            if (done === TOPICS.length) { parts.push({ label: 'za dnešní otázky ze všech témat', xp: DAILY_ALL_XP }); counters.perfectDays += 1; }
        }
        const gained = parts.reduce((sum, part) => sum + part.xp, 0);
        const progress = { ...before, xp: before.xp + gained };
        const badgeTitles = grantBadges(progress);
        round.xp = { total: gained, parts: parts.filter(part => part.xp > 0), badges: badgeTitles };
        saveProgress(progress);
        chronicleLog({ answered: true, correct: round.correct, points: round.points, xp: gained, topic: current.topic, run: counters.run,
            map: Boolean(current.question && current.question.type === 'map'), quiz: mode === 'quiz', learned: round.newLearned ? { name: current.name, topic: current.topic } : null });
        announce(levelProgress(before.xp).level, levelProgress(progress.xp).level, badgeTitles);
        settleGoals();
        applyLook();
        syncProgress();
    };

    // Podrobnosti odpovědi do Rozpisu otázek: text odpovědi (zvolená možnost, napsaný text, u mapy a čísel krátké shrnutí; „Nevím“ = vzdal),
    // počet použitých nápověd (0–4) a čas od ukázání otázky (nejvýš hodina)
    const ANSWER_LABEL_MAX = 120;
    const answerDetails = () => {
        const text = round.gaveUp ? 'Nevím' : String(round.answer || '').replace(/\s+/g, ' ').trim();
        const since = round.shownAt || round.timerStart;
        return {
            answer: text ? (text.length > ANSWER_LABEL_MAX ? `${text.slice(0, ANSWER_LABEL_MAX - 1)}…` : text) : null,
            hints: Math.max(0, Math.min(4, (round.hintLevel || 1) - 1)),
            ms: Number.isFinite(since) ? Math.max(0, Math.min(3600000, Date.now() - since)) : null
        };
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
            // Výzva se do běžných statistik nepočítá, jen do svého výsledku. Odpověď, kterou už server má (zodpovězená na jiném zařízení), platí ze serveru.
            // S odpovědí i podrobnosti do Rozpisu otázek (schéma 10): co hráč odpověděl, kolik použil nápověd a jak dlouho otázku měl
            if (!(knownSynced(challenge) > challenge.index)) challenge.results[challenge.index] = { correct: round.correct, points: round.points, ...answerDetails() };
        } else if (mode === 'quiz') {
            // Kvíz dne má svůj výsledek (daily-quiz.js), do statistik tréninku se nepočítá
            quizRecord();
        } else {
            stats.practice.played += 1;
            stats.practice.correct += round.correct ? 1 : 0;
            stats.practice.points += round.points;
            recordPracticeRun();
        }
        writeJson(KEYS.stats, stats);
        // Číselná otázka se ptá na čísla, ne na položku: do chyb, opakování ani poznaných položek nejde
        if (isNumeric(current)) { awardXp(stats); return; }
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
            round.newLearned = !ids.has(current.id);
            ids.add(current.id);
            learned[current.topic] = [...ids];
            writeJson(KEYS.learned, learned);
        }
        awardXp(stats);
    };

    // answerRef: položka (nebo stát) ze špatné odpovědi – výsledek k ní nabídne okno s popisem
    // points = body spočítané otázkou samou (Ukaž na mapě podle vzdálenosti, Seřaď a Odhadni číslo podle přesnosti; správně = aspoň bod),
    // jinak podle nápověd; extra = další údaje do kola (tip na mapě)
    const submitAnswer = ({ correct, typed, answer, answerRef = null, gaveUp = false, points: given = null, extra = null }) => {
        if (!round || round.answered) return;
        const points = correct ? (Number.isInteger(given) ? given : pointsFor(round.hintLevel, typed)) : 0;
        const ref = !correct && isKnownRef(answerRef) ? answerRef : null;
        Object.assign(round, extra || {}, { answered: true, correct, typed, answer, answerRef: ref, gaveUp, points });
        mapZoom = DEFAULT_MAP_ZOOM;
        // Zvuk odpovědi (Nevím = bez zvuku); oslavy nové úrovně a odznaku zazní až po něm
        if (Sound && !gaveUp) Sound.answer(correct);
        recordResult();
        recordAnswerStat({ correct, answerRef, gaveUp });
        renderRound();
        // Odpověď výzvy (zápasu turnaje) hned na server; bez spojení počká v zařízení
        if (mode === 'challenge' && challenge) syncAnswers(challenge);
        if (mode === 'quiz' && quiz) syncQuiz(quiz);
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
            streak: topicStreak(results),
            url: `${window.location.origin}${window.location.pathname}`
        });
        // Sdílení (systémové, jinak schránka) je pro celou aplikaci v share-card.js
        if (window.MudrlantShareCard) await window.MudrlantShareCard.shareText({ text }, { toast: showToast, copied: 'Výsledek je zkopírovaný ve schránce' });
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
            if (session.challenge && !session.challenge.done && !session.challenge.tournament && !finishedChallenges().includes(session.challenge.code)) challenge = session.challenge;
            return false;
        }
        // Dnešní otázka z uložené relace platí jen do půlnoci
        const isCurrent = session.mode !== 'daily' || session.data.dailyDate === getDayKey();
        // Kvíz dne se obnovuje jen přes svou kartu (stav má v mudrlant.dailyQuiz)
        if (!isFresh || !isCurrent || (session.mode === 'challenge' && !session.challenge) || session.mode === 'quiz') return false;
        try {
            current = upgradeRoundData(session.data);
            round = session.round;
            mode = session.mode;
            challenge = session.challenge || challenge;
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
        if (session && session.version === STATE_VERSION && session.challenge && !session.challenge.done && !session.challenge.tournament
            && !finishedChallenges().includes(session.challenge.code) && Date.now() - session.timestamp < SESSION_MAX_AGE) challenge = session.challenge;
        // Relaci přepsal zápas turnaje nebo jiná hra: poslední rozehraná výzva ze seznamu
        if (!challenge) challenge = latestOpenChallenge();
        return false;
    };
    // Rozehraný zápas turnaje: z paměti (právě hraný), jinak z uložené relace; { mid, challenge } nebo null
    const savedTournamentChallenge = () => {
        if (challenge && challenge.tournament && !challenge.done) return { mid: challenge.tournament.mid, challenge };
        const session = readJson(KEYS.session);
        const fromSession = session && session.version === STATE_VERSION ? session.challenge : null;
        const usable = (saved) => Boolean(saved && !saved.done && saved.tournament && saved.tournament.mid && Array.isArray(saved.results));
        // Relaci mohla přepsat jiná výzva: pak se vezme zápas ze seznamu rozehraných
        const saved = usable(fromSession) ? fromSession : savedOpenChallenges().filter(usable).pop();
        if (!saved) return null;
        return { mid: saved.tournament.mid, challenge: saved };
    };
    const savedTournamentMatch = () => { const saved = savedTournamentChallenge(); return saved ? saved.mid : null; };

    // --- Zamrzlé otázky (schéma 17): výzva (i skupině a odveta), zápas turnaje a Kvíz dne dávají všem hráčům stejné otázky se stejnými možnostmi ---
    // Otázka se sestaví v zařízení ze semínka a dat tématu jako dřív, pak se uloží na server (Social.claimQuestion) a hraje se ta, kterou server
    // vrátí: platí první uložená, takže hráč s jinou verzí dat (po aktualizaci) dostane přesně tu otázku, kterou hrál soupeř. Uloženou otázku
    // aplikace stáhne i předem (Social.questionSnapshots; s ní i dřívější otázky téže hry, ať se jejich položky neopakují) a Rozpis otázek
    // ji vezme místo nového sestavení. Bez přihlášení a se starší databází se hraje otázka ze zařízení jako dřív; bez spojení (server neodpoví
    // do SNAPSHOT_WAIT) také, jen se zapamatuje jako nepotvrzená (PENDING_SNAPSHOTS_KEY) a uloží se později (pozdní odpověď, před odesláním
    // odpovědi na server), ať platí aspoň pro hráče, kteří ji budou hrát po ní. Pozdní odpověď s jinou otázkou ji vymění, dokud hráč neodpověděl.
    const SNAPSHOT_WAIT = 4000;
    const PENDING_SNAPSHOTS_KEY = 'mudrlant.pendingSnapshots';
    const snapshotsReady = () => Boolean(Social && Social.claimQuestion && Social.questionSnapshots && signedUser());
    // Otázka ze serveru jde hrát: tvarově úplná a z tématu, které aplikace zná (jinak se hraje otázka ze zařízení)
    // Otázka na mapě (výzva, turnaj) jde hrát jen s úplnými údaji o místě a s aplikací, která mapu umí
    const playableSnapshot = (data) => Boolean(data && typeof data === 'object' && !Array.isArray(data) && TOPIC_BY_ID[data.topic] && typeof data.id === 'string'
        && data.question && typeof data.question === 'object' && typeof data.question.title === 'string' && typeof data.question.answerLabel === 'string'
        && Array.isArray(data.hints) && Array.isArray(data.funFacts) && Array.isArray(data.resultFacts) && typeof data.typeLabel === 'string'
        && (isNumeric(data) || (data.question.type === 'map' ? Boolean(MapQuestion && MapQuestion.playableMap(data.question))
            : Array.isArray(data.question.choices) && data.question.choices.length > 0 && Array.isArray(data.question.accepted))));
    // Otázku na server ukládá klient (soupeř): texty se vykreslují escapované, pole vkládaná do atributů (ikony, klíče záložek, druhy)
    // se z ní berou jen s bezpečnými znaky
    const SNAPSHOT_TOKENS = new Set(['icon', 'key', 'kind', 'type', 'category', 'categoryIcon', 'spec', 'dir', 'mode', 'inputmode']);
    const cleanSnapshot = (value, name = '') => {
        if (Array.isArray(value)) return value.map(entry => cleanSnapshot(entry));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__proto__').map(([key, entry]) => [key, cleanSnapshot(entry, key)]));
        return typeof value === 'string' && SNAPSHOT_TOKENS.has(name) ? value.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80) : value;
    };
    // Položky, na které se uložená otázka ptá (u Seřaď všechny čtyři): dál ve hře se už neopakují
    const snapshotIds = (data) => [data.id, ...(data.numeric && Array.isArray(data.numeric.items) ? data.numeric.items.map(entry => entry && entry.id) : []),
        ...(data.numeric && data.numeric.item ? [data.numeric.item.id] : [])].filter(id => typeof id === 'string');
    // Porovnání dvou verzí otázky bez ohledu na pořadí klíčů (databáze je v jsonb přeskládá)
    const stableText = (value) => (Array.isArray(value) ? `[${value.map(stableText).join(',')}]`
        : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableText(value[key])}`).join(',')}}` : JSON.stringify(value));
    // Odmítnutí serverem (neplatné semínko, cizí výzva, budoucí den): uložení se nezkouší znovu; síť, 5xx a vypršené přihlášení ano
    const claimRefused = (error) => Boolean(error && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status));
    const pendingSnapshots = () => { const saved = readJson(PENDING_SNAPSHOTS_KEY); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; };
    const rememberPendingSnapshot = (seed, data) => {
        const user = signedUser();
        if (!user) return;
        const kept = Object.entries(pendingSnapshots()).filter(([key, entry]) => key !== seed && entry && entry.data && Date.now() - Number(entry.at) < 2 * 86400000).slice(-11);
        writeJson(PENDING_SNAPSHOTS_KEY, Object.fromEntries([...kept, [seed, { data, owner: user.id, at: Date.now() }]]));
    };
    const forgetPendingSnapshot = (seed) => {
        const all = pendingSnapshots();
        if (!Object.prototype.hasOwnProperty.call(all, seed)) return;
        delete all[seed];
        writeJson(PENDING_SNAPSHOTS_KEY, all);
    };
    // Nepotvrzené otázky se dopošlou (nejvýš SNAPSHOT_WAIT): uloží se, když je server ještě nemá; odmítnutá se zahodí, při chybě spojení počká na příště
    let snapshotFlush = null;
    const flushPendingSnapshots = () => {
        if (snapshotFlush) return snapshotFlush;
        const user = signedUser();
        const entries = Object.entries(pendingSnapshots()).filter(([, entry]) => entry && entry.data && user && entry.owner === user.id);
        if (!snapshotsReady() || !entries.length) return Promise.resolve();
        const run = Promise.all(entries.map(([seed, entry]) => Social.claimQuestion(seed, entry.data)
            .then(() => forgetPendingSnapshot(seed), (error) => { if (claimRefused(error)) forgetPendingSnapshot(seed); })));
        snapshotFlush = within(run, SNAPSHOT_WAIT).finally(() => { snapshotFlush = null; });
        return snapshotFlush;
    };
    // Uložené otázky k semínkům ({ [semínko]: data }, jen ty, které jde hrát); bez přihlášení, spojení nebo se starší databází prázdné
    const frozenQuestions = async (seeds) => {
        const usable = Object.create(null);
        if (!snapshotsReady() || !seeds.length) return usable;
        try {
            const found = await within(Social.questionSnapshots(seeds), SNAPSHOT_WAIT);
            Object.entries(found || {}).forEach(([seed, data]) => { if (playableSnapshot(data)) usable[seed] = cleanSnapshot(data); });
        } catch (error) { /* bez spojení se otázky sestaví v zařízení */ }
        return usable;
    };
    // Otázka sestavená v zařízení se uloží na server a vrátí se ta, která platí (první uložená). late = odpověď serveru, která nestihla SNAPSHOT_WAIT
    const settleSnapshot = async (seed, local) => {
        const data = JSON.parse(JSON.stringify(local));
        if (!seed || !snapshotsReady()) return { data, late: null };
        const claim = Social.claimQuestion(seed, data).then(stored => ({ stored }), error => ({ error }));
        const settled = await within(claim, SNAPSHOT_WAIT);
        if (settled && !settled.error) return { data: playableSnapshot(settled.stored) ? upgradeRoundData(cleanSnapshot(settled.stored)) : data, late: null };
        if (settled && claimRefused(settled.error)) return { data, late: null };
        rememberPendingSnapshot(seed, data);
        return { data, late: settled ? null : claim };
    };
    // Pozdní odpověď serveru: otázka je potvrzená; má-li server jinou (soupeř ji uložil dřív), vymění se, dokud hráč neodpověděl
    const lateSnapshot = (seed, shown, outcome) => {
        if (!outcome || (outcome.error && !claimRefused(outcome.error))) return;
        forgetPendingSnapshot(seed);
        const stored = !outcome.error && playableSnapshot(outcome.stored) ? cleanSnapshot(outcome.stored) : null;
        if (!stored || stableText(stored) === stableText(shown)) return;
        if (current !== shown || !round || round.answered) return;
        const keep = { timerStart: round.timerStart, shownAt: round.shownAt, variant: round.variant };
        current = upgradeRoundData(stored);
        round = Object.assign(createRound(), keep);
        // Nápovědy ukázané k předchozí verzi se nepočítají
        if (mode === 'quiz' && quiz && quiz.open && quiz.open.index === quizIndex) quiz.open.hint = 1;
        if (mode === 'quiz') quizRoundReady();
        if (screen === 'round') { renderRound(); showToast('Otázka se upravila, ať je stejná pro všechny hráče'); } else persistState();
    };

    // Průběh načtení otázky: vybrat položku, dotáhnout popis a fotku, zobrazit
    // pick() vrací { item, ctx, rng, numeric? }, u hry pro víc hráčů i snapshotSeed (semínko otázky) a případně frozen (otázka uložená na serveru)
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
            // Otázka uložená na serveru (soupeř ji hrál dřív): hraje se ta, místní se nesestavuje
            let data = picked.frozen && playableSnapshot(picked.frozen) ? upgradeRoundData(picked.frozen) : null;
            let late = null;
            if (!data) {
                if (!picked.item) throw new Error('Není z čeho vybírat');
                // Číselná otázka, když ji výběr naplánoval (bez popisu z Wikipedie, takže chudý popis se jí netýká)
                data = (picked.numeric && Numeric && Numeric.buildRound(picked.numeric, picked.ctx)) || await createRoundData(picked.item, picked.ctx, picked.rng, { map: Boolean(picked.map) });
                // Chudý popis: vybere se jiná otázka (u dnešní otázky další určená položka), nejvýš třikrát; pak se vezme, co je
                // (výzva ne: všichni hráči musí dostat stejné otázky, i když se někomu Wikipedie nenačte)
                for (let attempt = 1; data.thin && mode !== 'challenge' && mode !== 'quiz' && !wikiPaused() && attempt <= MAX_THIN_RETRIES; attempt++) {
                    const next = await pick(attempt);
                    if (!next.item) break;
                    const candidate = await createRoundData(next.item, next.ctx, next.rng);
                    picked = next;
                    data = candidate;
                }
                // Hra pro víc hráčů: platí otázka uložená na serveru jako první (možná soupeřova), místní verze je jen záloha
                if (picked.snapshotSeed) ({ data, late } = await settleSnapshot(picked.snapshotSeed, data));
            }
            const { dailyDate } = picked;
            current = dailyDate ? { ...data, dailyDate } : data;
            round = createRound();
            // Čas otázky do Rozpisu otázek se měří od jejího ukázání (uloží se s kolem, po obnovení stránky běží dál)
            round.shownAt = Date.now();
            // Výzva má pevný způsob odpovídání pro všechny hráče
            if (mode === 'challenge' && challenge && challenge.variant) round.variant = challenge.variant;
            // Kvíz dne: výběr z možností, čas a nápovědy jako před zavřením aplikace
            if (mode === 'quiz') quizRoundReady();
            isLoading = false;
            renderRound();
            // Server neodpověděl včas: jeho pozdní odpověď otázku potvrdí, nebo vymění za platnou
            if (late) { const shown = current; const seed = picked.snapshotSeed; late.then(outcome => lateSnapshot(seed, shown, outcome)); }
            // Souhrn odpovědí ostatních k tématu (stáhne se, jen když v zařízení chybí nebo je starší než den)
            refreshAnswerStats(current.topic);
            // Obrysy států pro slepou mapu stáhneme dopředu, ať je nápověda hned po ruce
            if (data.visual && data.visual.type === 'map') (data.visual.regional ? loadRegions() : loadWorld()).catch(() => {});
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
            const harder = hard ? ctx.items.filter(candidate => levelOf(candidate) === 2) : [];
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
        const items = filterItems(ctx.items, { tier: special ? 'expert' : settings.tier, collection: collectionId });
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
            let numeric = null;
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
            if (pool.kind === 'map') {
                // Jen místa, která jde ukázat na mapě (podle známosti z nastavení, když jich je dost); pár pokusů, kdyby místo nebylo na kreslené mapě
                // Nejdřív druh místa (město, řeka, bitva, stát…) – každý přijde zhruba stejně často, ne samé stadiony –, pak místo
                // z jeho tématu; druh bez vhodných míst se pro tuto otázku vynechá
                const map = await loadMapData();
                let groups = MapQuestion.MAP_GROUPS.filter(group => !pool.topic || group.topics.includes(pool.topic));
                for (let attempt = 0; attempt < 10 && !item && groups.length; attempt++) {
                    const group = pickRandom(groups, Math.random);
                    const topicIds = pool.topic ? [pool.topic] : group.topics;
                    ctx = await loadTopic(pickRandom(topicIds, Math.random));
                    const all = ctx.items.filter(entry => group.test(entry) && MapQuestion.candidate(entry, ctx, map));
                    const tiered = filterItems(all, { tier: settings.tier });
                    const choices = tiered.length >= 8 ? tiered : all;
                    if (!choices.length) { groups = groups.filter(other => other !== group); continue; }
                    const pickedItem = pickItem(choices, Math.random, history, ctx.topic.categories.map(c => c.key));
                    if (pickedItem && MapQuestion.buildQuestion(pickedItem, ctx, map)) item = pickedItem;
                }
            }
            if (pool.kind === 'topic' || pool.kind === 'mix') {
                ctx = await loadTopic(pool.kind === 'topic' ? pool.topic : pickRandom(settings.topics, Math.random));
                // Trénink bez semínka: mírná kalibrace obtížnosti podle odpovědí ostatních (pravidlo v answer-stats.js)
                item = pickItem(playableItems(ctx), Math.random, history, ctx.topic.categories.map(c => c.key), answerStatsWeigher(ctx.topic.id));
                // Tu a tam Seřaď nebo Odhadni číslo z vybraných kategorií (v okruzích, chybách a opakování z učení ne)
                numeric = numericPlan(ctx, item, playableItems(ctx), Math.random);
            }
            if (item) rememberPlayed(item);
            return { item, ctx, rng: Math.random, numeric };
        }, pool.kind === 'topic' || pool.kind === 'collection' || (pool.kind === 'map' && pool.topic) ? TOPIC_BY_ID[pool.topic] : pool.kind === 'mix' || pool.kind === 'map' ? MIX : null);
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
        startPractice((pool.kind === 'topic' && TOPIC_BY_ID[pool.topic]) || pool.kind === 'map' ? pool : { kind: 'mix' });
    };

    const continueAfterResult = () => {
        if (mode === 'challenge' && challenge) {
            // Další nezodpovězená otázka (ze serveru mohly přibýt odpovědi z jiného zařízení); všechny zodpovězené = konec
            const next = challengeNextIndex(challenge);
            if (next >= 0) startChallenge(challenge, next, challenge.results);
            else finishChallenge();
            return;
        }
        if (mode === 'quiz') {
            if (quiz) playQuizQuestion(DailyQuiz.nextIndex(quiz));
            else renderHome();
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
        else if (mode === 'quiz' && quiz) playQuizQuestion(quizIndex);
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
            <button type="button" data-action="learn-topic" data-topic="${topic.id}" class="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white px-1 py-2 text-center shadow-sm transition-all hover:border-brand-300 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-600">
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
        const reviewText = reviewSummary ? reviewSummary.text : due ? 'Špatné odpovědi se vrací po 1, 3, 7, 14 a 30 dnech' : next ? `Nic na řadě, ${next}` : 'Co v kvízu spleteš, sem přijde k procvičení';
        const reviewSection = reviewEnabled() ? `
            <section data-review-section class="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                ${uiArt('procvicovani', 'h-11 w-11 -my-1')}
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-black leading-tight text-slate-800 dark:text-slate-100">K procvičení dnes (${due})</span>
                    <span class="block text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(reviewText)}</span>
                </span>
                ${due ? `<button type="button" data-action="review-start" class="flex shrink-0 items-center gap-1.5 rounded-xl btn-3d bg-brand-700 px-3 py-2.5 text-[13px] font-black text-white"><i data-lucide="play" class="h-4 w-4"></i> Procvičit</button>` : ''}
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
                        <span class="min-w-0 font-bold leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(label)}</span>
                        <span class="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">${done ? `${done} / ` : ''}${items.length}</span>
                    </span>
                    ${text ? `<span class="mt-0.5 block line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(text)}</span>` : ''}
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
                    <p class="text-sm text-slate-500 dark:text-slate-400">Celé téma · obtížnost ${TIERS[settings.tier].title} · <button type="button" data-action="settings" class="-my-2.5 px-1 py-2.5 font-bold text-slate-700 underline underline-offset-2 dark:text-slate-200">změnit</button></p>
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
                ${uiArt('ucit-prohlizet', 'h-12 w-12')}
                <span><span class="block text-lg font-black">Prohlížet</span><span class="block text-sm opacity-80">${learn.collection ? 'Popořadě, s fotkou, mapou a fakty' : 'Náhodně, s fotkou, mapou a fakty'}</span></span>
            </button>
            <button type="button" data-action="learn-practice" class="flex w-full items-center gap-3 rounded-[1.5rem] p-4 text-left text-white shadow-lg transition-all active:scale-[0.98] ${styleOf(ctx.topic).button} btn-3d">
                ${uiArt('ucit-procvicit', 'h-12 w-12')}
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
                    ${uiArt('sova-cisty-sesit', 'h-24 w-24')}
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
        touchTip('learn');
        closeChooser();
        learn.view = view;
        learn.topic = topicId;
        flushAnswerStats();
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

    // --- Bleskovka a Přežití: režimy pro jednoho hráče (pravidla, hodiny, rekordy a XP v modes.js, zvuky v sound.js) ---
    // Vlastní obrazovka (screen 'mode'): úvod s pravidly a rekordy → otázky (vždy výběr z možností, bez nápověd) → výsledek s rekordy a XP.
    // Otázka se sestaví stejně jako v běžné hře (createRoundData) a další se chystá už během té současné, ať se nečeká na Wikipedii.
    // Chyby jdou do Mých chyb a procvičování jako v běžné hře, správně uhodnuté do postupu v okruzích; do dnešních otázek, výzev,
    // statistik tréninku ani počítadel odpovědí pro odznaky a cíle týdne se odpovědi nepočítají (rychlé otázky by je jinak nafoukly);
    // počítá se jen den hraní a poznané položky (mistrovství).
    // Hra se neukládá: odchod z obrazovky (Domů, Zpět, jiná hra) ji ukončí bez výsledku, tlačítko Ukončit hru s výsledkem.
    // phase: 'intro' | 'loading' | 'question' | 'feedback' | 'error' | 'result'
    let modeGame = null;
    let modeTimer = null;
    let modeFeedbackTimer = null;
    // Okna, během kterých čas Bleskovky stojí (Nastavení, popis položky…)
    const MODE_OVERLAYS = ['settings-overlay', 'dialog-overlay', 'play-chooser', 'place-info', 'photo-zoom', 'photo-source', 'fact-overlay'];
    const MODE_BADGE = { blitz: 'bg-gold-500 text-brand-950', survival: 'bg-rose-600 text-white' };
    const modeTopicOf = (game) => game.pool.kind === 'topic' ? TOPIC_BY_ID[game.pool.topic] : MIX;
    const loadModeState = () => Modes.parse(readJson(Modes.STORAGE_KEY));
    const modeLive = (game) => Boolean(game) && game === modeGame && screen === 'mode';
    const stopModeTimers = () => {
        clearInterval(modeTimer);
        clearTimeout(modeFeedbackTimer);
        modeTimer = null;
        modeFeedbackTimer = null;
    };
    // Štítek v hlavičce: režim a téma v barvě tématu (při mixu téma právě hrané otázky); klepnutím nic nemění
    const modePlace = (game) => {
        const def = Modes.MODES[game.kind];
        const scopeTopic = modeTopicOf(game);
        const playing = current && (game.phase === 'question' || game.phase === 'feedback') ? TOPIC_BY_ID[current.topic] : null;
        return { icon: def.icon, art: MODE_ART[game.kind], text: `${def.title} · ${scopeTopic.title}`, topic: playing || scopeTopic };
    };
    // Co se hraje: kategorie tématu (nebo témata mixu), u Bleskovky i známost z výběru; Přežití má vlastní obtížnost
    const modeScopeText = (game) => {
        const parts = [];
        if (game.pool.kind === 'mix') parts.push(settings.topics.length === TOPICS.length ? 'všechna témata' : `${settings.topics.length} z ${TOPICS.length} témat`);
        else {
            const topic = TOPIC_BY_ID[game.pool.topic];
            const chosen = selectedCategories(topic);
            parts.push(chosen.length === topic.categories.length ? 'všechny kategorie' : chosen.length === 1 ? categoryOf(topic, chosen[0]).label : `${chosen.length} z ${topic.categories.length} kategorií`);
        }
        if (game.kind === 'blitz') parts.push(TIERS[settings.tier].title);
        return parts.join(' · ');
    };

    // Úvod režimu: pravidla, rekordy a kolik XP dnes ještě jde získat
    const openModeIntro = (kind, nextPool) => {
        if (!Modes || !Modes.MODES[kind] || isLoading) return;
        stopModeTimers();
        closeChooser();
        closeSettings();
        closePlaceInfo();
        pool = nextPool.kind === 'topic' && TOPIC_BY_ID[nextPool.topic] ? { kind: 'topic', topic: nextPool.topic } : { kind: 'mix' };
        mode = kind;
        current = null;
        round = null;
        modeGame = { kind, pool: { ...pool }, scope: Modes.scopeOf(pool), phase: 'intro' };
        screen = 'mode';
        renderModeScreen();
    };
    const startModeGame = (kind = modeGame && modeGame.kind, gamePool = modeGame && modeGame.pool) => {
        if (!Modes || !Modes.MODES[kind] || !gamePool) return;
        const def = Modes.MODES[kind];
        stopModeTimers();
        closePlaceInfo();
        if (Sound) Sound.unlock();
        mode = kind;
        pool = { ...gamePool };
        screen = 'mode';
        modeGame = {
            kind, pool: { ...gamePool }, scope: Modes.scopeOf(gamePool), phase: 'loading',
            score: 0, asked: 0, wrong: 0, lives: def.lives || 0, picked: null, penalty: false, lostLife: false,
            clock: kind === 'blitz' ? Modes.createClock(def.seconds) : null, shown: def.seconds || 0,
            seen: new Set(), missed: [], next: null, outcome: null, xp: null
        };
        modeTimer = setInterval(modeTick, 100);
        showNextModeQuestion(modeGame);
    };
    // Odchod z obrazovky režimu (Zpět, Domů): rozehraná hra se zahodí
    const leaveMode = () => {
        stopModeTimers();
        modeGame = null;
        current = null;
        round = null;
        renderHome();
    };

    // Další otázka: položka z vybraných kategorií (mix: náhodné téma z vybraných), bez opakování v jedné hře.
    // Bleskovka bere známost z výběru, Přežití podle počtu položených otázek (modes.js: survivalTier).
    const prepareModeQuestion = async (game) => {
        const history = readJson(KEYS.history) || [];
        for (let attempt = 0; attempt < 4; attempt++) {
            const topicId = game.pool.kind === 'topic' ? game.pool.topic : pickRandom(settings.topics, Math.random);
            const ctx = await loadTopic(topicId);
            const chosen = selectedCategories(ctx.topic);
            const inCategories = ctx.items.filter(item => chosen.includes(item.c));
            const base = inCategories.length ? inCategories : ctx.items;
            const tiered = filterItems(base, { tier: game.kind === 'survival' ? Modes.survivalTier(game.asked, Math.random) : settings.tier });
            const candidates = tiered.length ? tiered : base;
            const fresh = candidates.filter(item => !game.seen.has(`${topicId}:${item.q}`));
            const item = pickItem(fresh.length ? fresh : candidates, Math.random, history, ctx.topic.categories.map(category => category.key));
            if (!item) continue;
            game.seen.add(`${topicId}:${item.q}`);
            const data = await createRoundData(item, ctx, Math.random);
            // Jen otázky s výběrem z možností; chudý popis (bez nápověd by nešlo odpovědět) nejvýš dvakrát vymění
            if (!Modes.playable(data) || (data.thin && attempt < 2 && !wikiPaused())) continue;
            rememberPlayed(item);
            return data;
        }
        throw new Error('Není z čeho vybírat');
    };
    const queueModeQuestion = (game) => {
        const slot = { data: null };
        slot.promise = prepareModeQuestion(game).then(data => { slot.data = data; return data; });
        slot.promise.catch(() => {});
        return slot;
    };
    const showNextModeQuestion = async (game) => {
        if (!modeLive(game)) return;
        const slot = game.next || queueModeQuestion(game);
        game.next = null;
        if (!slot.data) {
            game.phase = 'loading';
            renderModeScreen();
            try {
                await slot.promise;
            } catch (error) {
                if (!modeLive(game)) return;
                console.error(error);
                game.phase = 'error';
                game.error = error;
                renderModeScreen();
                return;
            }
            if (!modeLive(game) || game.phase !== 'loading') return;
        }
        game.asked += 1;
        game.picked = null;
        game.penalty = false;
        game.lostLife = false;
        game.phase = 'question';
        current = slot.data;
        round = { hintLevel: 1, variant: 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false, review: false };
        renderModeScreen();
        // Další otázka se chystá hned, dokud hráč přemýšlí
        game.next = queueModeQuestion(game);
    };

    // Hodiny Bleskovky: běží, jen když je vidět otázka (ne při načítání, po odpovědi, ve skryté aplikaci ani pod otevřeným oknem)
    const modeTick = () => {
        const game = modeGame;
        if (!game || screen !== 'mode') {
            // Hráč odešel jinam: hra skončila bez výsledku
            stopModeTimers();
            if (game && screen !== 'mode') modeGame = null;
            return;
        }
        if (game.kind !== 'blitz' || !game.clock) return;
        const now = Date.now();
        const run = game.phase === 'question' && !document.hidden && !MODE_OVERLAYS.some(id => document.getElementById(id));
        if (run && !Modes.clockRunning(game.clock)) game.clock = Modes.startClock(game.clock, now);
        if (!run && Modes.clockRunning(game.clock)) game.clock = Modes.pauseClock(game.clock, now);
        const left = Modes.clockLeft(game.clock, now);
        const shown = Modes.secondsShown(left);
        const tick = Modes.tickDue(game.shown, shown);
        game.shown = shown;
        paintModeClock(left);
        if (tick && Sound) Sound.play(tick === 1 ? 'tickLast' : 'tick');
        if (left <= 0 && game.phase === 'question') finishModeGame(game);
    };
    document.addEventListener('visibilitychange', () => { if (modeGame && screen === 'mode') modeTick(); });
    // Čas a pruh se překreslují bez překreslení otázky (posledních 10 s červeně)
    const paintModeClock = (left) => {
        const box = appContent.querySelector('[data-mode-timer]');
        if (!box) return;
        const shown = Modes.secondsShown(left);
        box.querySelector('[data-mode-clock]').textContent = String(shown);
        const bar = box.querySelector('[data-mode-bar]');
        bar.style.width = `${Math.max(0, Math.min(100, left / (Modes.MODES.blitz.seconds * 10)))}%`;
        const urgent = shown <= 10;
        if (box.dataset.urgent === String(urgent)) return;
        box.dataset.urgent = String(urgent);
        bar.classList.toggle('bg-gold-500', !urgent);
        bar.classList.toggle('bg-rose-500', urgent);
        bar.classList.toggle('mode-urgent', urgent);
        const chip = box.querySelector('[data-mode-clock-chip]');
        chip.classList.toggle('text-rose-700', urgent);
        chip.classList.toggle('dark:text-rose-300', urgent);
    };

    // Odpověď: krátce ukáže správnou (a špatnou) možnost, pak další otázka; Bleskovka za chybu ubere čas, Přežití život
    const answerMode = (index) => {
        const game = modeGame;
        if (!modeLive(game) || game.phase !== 'question' || !current) return;
        const choice = current.question.choices[index];
        if (!choice) return;
        const def = Modes.MODES[game.kind];
        const now = Date.now();
        game.picked = index;
        game.phase = 'feedback';
        Object.assign(round, { answered: true, correct: Boolean(choice.correct), answer: choice.label });
        if (game.clock) game.clock = Modes.pauseClock(game.clock, now);
        if (choice.correct) game.score += 1;
        else {
            game.wrong += 1;
            if (game.kind === 'blitz') { game.clock = Modes.penalize(game.clock, def.penalty * 1000, now); game.penalty = true; }
            if (game.kind === 'survival') { game.lives = Math.max(0, game.lives - 1); game.lostLife = true; }
            if (!game.missed.some(miss => miss.topic === current.topic && miss.id === current.id)) game.missed.push({ topic: current.topic, id: current.id, name: current.name });
        }
        noteModeAnswer(current, Boolean(choice.correct));
        if (Sound) Sound.answer(Boolean(choice.correct));
        renderModeScreen();
        const over = game.kind === 'survival' ? game.lives <= 0 : Modes.clockLeft(game.clock, now) <= 0;
        modeFeedbackTimer = setTimeout(() => {
            if (!modeLive(game) || game.phase !== 'feedback') return;
            if (over) finishModeGame(game);
            else showNextModeQuestion(game);
        }, choice.correct ? def.feedback.correct : def.feedback.wrong);
    };
    // Chyby a procvičování jako v běžné hře: špatně = do Mých chyb a karta opakování, správně = z chyb pryč a do poznaných položek
    const noteModeAnswer = (data, correct) => {
        const key = `${data.topic}:${data.id}`;
        writeJson(KEYS.mistakes, updateMistakes(loadMistakes(), key, correct));
        if (reviewEnabled()) saveReview(Review.onAnswer(loadReview(), key, correct, getDayKey(), { force: false }));
        if (correct) {
            const learned = loadLearned();
            learned[data.topic] = [...new Set([...(learned[data.topic] || []), data.id])];
            writeJson(KEYS.learned, learned);
        }
    };
    // XP za hru (rozpis a denní strop z modes.js); den hraní se počítá jako u běžné hry, odznaky za poznané položky a úroveň také
    const awardModeXp = (xp, game = null) => {
        const before = loadProgress();
        const progress = { ...before, xp: before.xp + xp.total };
        if (progress.counters.lastDay !== getDayKey()) { progress.counters.days += 1; progress.counters.lastDay = getDayKey(); }
        // Rekord a hry pro odznaky Bleskovka a Přežití a cíle týdne (aspoň 10 správně, 15 přežitých otázek v jedné hře)
        if (game && game.kind === 'blitz') {
            progress.counters.blitzGames += 1;
            progress.counters.blitzBest = Math.max(progress.counters.blitzBest, game.score);
            if (game.score >= 10) progress.counters.blitzTen += 1;
        } else if (game && game.kind === 'survival') {
            progress.counters.survivalGames += 1;
            progress.counters.survivalBest = Math.max(progress.counters.survivalBest, game.score);
            if (game.score >= 15) progress.counters.survivalFifteen += 1;
        }
        const badgeTitles = grantBadges(progress);
        saveProgress(progress);
        announce(levelProgress(before.xp).level, levelProgress(progress.xp).level, badgeTitles);
        settleGoals();
        applyLook();
        syncProgress();
        return { ...xp, badges: badgeTitles };
    };
    // Konec hry (čas, poslední život nebo Ukončit hru): rekordy, XP, oslava nového rekordu se zvukem a vibrací
    const finishModeGame = (game) => {
        if (!modeLive(game) || game.phase === 'result') return;
        stopModeTimers();
        game.next = null;
        current = null;
        round = null;
        // Ukončeno hned na začátku (žádná otázka): zpět na úvod, hra se nepočítá
        if (!game.asked) {
            modeGame = { kind: game.kind, pool: game.pool, scope: game.scope, phase: 'intro' };
            renderModeScreen();
            return;
        }
        const def = Modes.MODES[game.kind];
        const outcome = Modes.finish(loadModeState(), game.kind, game.scope, game.score, getDayKey());
        writeJson(Modes.STORAGE_KEY, outcome.state);
        game.outcome = outcome;
        game.phase = 'result';
        if (outcome.record) {
            if (Sound) { Sound.play('record'); Sound.vibrate('record'); }
            showCelebration('vitez', 'Nový rekord!', `${def.title} · ${modeTopicOf(game).title}: ${Modes.scoreLabel(game.kind, game.score)}`);
        }
        game.xp = awardModeXp(outcome.xp, game);
        renderModeScreen();
        if (ShareCard) ShareCard.prepare(modeCardInput(game), modeCardName(game));
    };

    // Obrázek výsledku Bleskovky či Přežití (share-card.js): skóre, rekord a sova podle výsledku
    const modeCardInput = (game) => {
        const def = Modes.MODES[game.kind];
        const { outcome } = game;
        return {
            kicker: `${def.title} · ${modeTopicOf(game).title}`, headline: String(game.score),
            detail: Modes.scoreLabel(game.kind, game.score).replace(/^\d+ /, '') + (game.kind === 'blitz' ? ' za 60 s' : ''),
            grid: null, note: outcome.record ? 'Nový rekord!' : outcome.after.overall ? `Můj rekord: ${outcome.after.overall}` : '',
            day: getDayKey(), robe: robeNow(), pose: outcome.record ? 'vitez' : game.score > 0 ? 'radost' : 'smutek', url: appUrl(), appName: APP_NAME
        };
    };
    const modeCardName = (game) => ShareCard.fileName(game.kind === 'blitz' ? 'bleskovka' : 'preziti', getDayKey());
    const shareModeImage = () => {
        const game = modeGame;
        if (!game || game.phase !== 'result' || !ShareCard) return;
        const def = Modes.MODES[game.kind];
        shareImageCounted(modeCardInput(game), { name: modeCardName(game), text: `${def.title} v Mudrlantu: ${Modes.scoreLabel(game.kind, game.score)}. Zvládneš víc?\n${appUrl()}`, toast: showToast });
    };

    // --- Obrazovky režimu ---
    // Symbol režimu: vlastní ilustrace (Bleskovka, Přežití; jejich odznaky zůstávají odznakům); bez obrázku barevné kolečko s ikonou
    const MODE_ART = { blitz: 'rezim-bleskovka', survival: 'rezim-preziti' };
    const modeBadge = (kind, cls = 'h-7 w-7', icon = 'h-4 w-4') => MODE_ART[kind]
        ? uiArt(MODE_ART[kind], cls)
        : `<span class="flex ${cls} shrink-0 items-center justify-center rounded-full ${MODE_BADGE[kind]}"><i data-lucide="${Modes.MODES[kind].icon}" class="${icon}"></i></span>`;
    const modeStat = (label, value, attrs = '') => `
        <div ${attrs} class="flex flex-col justify-between rounded-2xl bg-white px-2 py-2 text-center shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
            <p class="text-[10px] font-black uppercase leading-tight tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(label)}</p>
            <p class="mt-0.5 text-2xl font-black tabular-nums leading-tight text-slate-800 dark:text-slate-100">${value}</p>
        </div>`;
    const modeScoreChip = (game) => `<span class="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-lg font-black tabular-nums leading-none text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800" aria-label="Správně: ${game.score}"><i data-lucide="check" class="h-4 w-4"></i>${game.score}</span>`;
    // Horní řádek hry: Bleskovka = zbývající čas s pruhem, Přežití = srdíčka a obtížnost; vpravo počet správných
    const modeStatus = (game) => {
        if (game.kind === 'blitz') {
            return `
                <div data-mode-timer class="flex items-center gap-2.5">
                    <span class="relative shrink-0">
                        <span data-mode-clock-chip role="timer" aria-label="Zbývající čas v sekundách" class="flex min-w-[4.5rem] items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-lg font-black tabular-nums leading-none text-slate-800 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/70"><i data-lucide="zap" class="h-4 w-4 text-gold-600 dark:text-gold-400"></i><span data-mode-clock>${Modes.secondsShown(Modes.clockLeft(game.clock, Date.now()))}</span><span class="text-xs font-bold text-slate-500 dark:text-slate-400">s</span></span>
                        ${game.penalty ? `<span data-mode-penalty class="mode-pop absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-rose-600 px-2 py-0.5 text-xs font-black text-white shadow">−${Modes.MODES.blitz.penalty} s</span>` : ''}
                    </span>
                    <span class="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><span data-mode-bar class="block h-full w-full rounded-full bg-gold-500"></span></span>
                    ${modeScoreChip(game)}
                </div>`;
        }
        const hearts = Array.from({ length: Modes.MODES.survival.lives }, (_, index) => {
            const alive = index < game.lives;
            const justLost = game.lostLife && index === game.lives;
            return `<i data-lucide="heart" class="h-5 w-5 ${alive ? 'fill-rose-500 text-rose-600 dark:text-rose-400' : `text-slate-300 dark:text-slate-600 ${justLost ? 'mode-heart-lost' : ''}`}"></i>`;
        }).join('');
        return `
            <div data-mode-lives="${game.lives}" class="flex items-center gap-2.5">
                <span class="flex shrink-0 items-center gap-0.5 rounded-xl bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70" role="img" aria-label="Životy: ${game.lives} ze ${Modes.MODES.survival.lives}">${hearts}</span>
                <span class="min-w-0 flex-1 text-center text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(Modes.difficultyLabel(Math.max(0, game.asked - 1)))}</span>
                ${modeScoreChip(game)}
            </div>`;
    };
    const renderModeIntro = (game) => {
        const def = Modes.MODES[game.kind];
        const topic = modeTopicOf(game);
        const style = styleOf(topic);
        const state = loadModeState();
        const records = Modes.recordsOf(state, game.kind, game.scope);
        const left = Modes.xpLeftToday(state, game.kind, getDayKey());
        const xpText = left > 0
            ? `+${def.xpPer} XP za každou ${def.xpUnit[0]} (dnes ještě až ${left} XP) a +${Modes.RECORD_XP} XP za překonaný rekord.`
            : `Dnešní strop ${Modes.DAILY_XP_CAP} XP za ${def.titleAcc} je vyčerpaný – rekordy se počítají dál.`;
        appContent.innerHTML = `
            <div data-mode-intro="${game.kind}" class="fade-in flex min-h-full w-full flex-col gap-3 bg-slate-50 p-4 short:gap-2 short:p-3 dark:bg-slate-900">
                <div class="flex items-center gap-3">
                    <span class="relative shrink-0">
                        ${modeBadge(game.kind, 'h-14 w-14', 'h-7 w-7')}
                        <span class="absolute -bottom-1 -right-1">${topicIcon(topic, 'h-7 w-7', `flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white ${style.tile}`, 'h-4 w-4')}</span>
                    </span>
                    <div class="min-w-0">
                        <h2 class="text-2xl font-black leading-tight text-slate-800 dark:text-slate-50">${escapeHtml(def.title)}</h2>
                        <p class="text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(topic.title)} · ${escapeHtml(modeScopeText(game))}</p>
                    </div>
                </div>
                <ul class="${CARD} flex flex-col gap-2.5 p-3.5 short:gap-2 short:p-3">
                    ${Modes.rules(game.kind).map(rule => `<li class="flex items-center gap-2.5 text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200"><i data-lucide="${rule.icon}" class="h-5 w-5 shrink-0 ${style.text}"></i><span>${escapeHtml(rule.text)}</span></li>`).join('')}
                </ul>
                <div class="grid grid-cols-2 gap-2">
                    ${modeStat(game.pool.kind === 'mix' ? 'Rekord mixu' : 'Rekord tématu', records.scope || '–', 'data-mode-record-scope')}
                    ${modeStat('Celkový rekord', records.overall || '–', 'data-mode-record-overall')}
                </div>
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(xpText)}</p>
                <div class="mt-auto flex flex-col gap-1">
                    <button type="button" data-action="mode-start" class="flex w-full items-center justify-center gap-2 rounded-[1.2rem] py-3.5 text-lg font-black text-white shadow-lg transition-all active:scale-95 short:py-3 ${style.button} btn-3d"><i data-lucide="play" class="h-5 w-5"></i> Start</button>
                    <button type="button" data-action="mode-home" class="${BACK_LINK} mx-auto"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět na úvod</button>
                </div>
            </div>`;
    };
    const renderModeQuestion = (game) => {
        const data = current;
        const topic = TOPIC_BY_ID[data.topic];
        const style = styleOf(topic);
        const category = categoryOf(topic, data.category);
        const feedback = game.phase === 'feedback';
        const BASE = 'btn-3d-light min-h-[3rem] rounded-xl px-3 py-1.5 text-sm font-bold leading-tight';
        const choiceClass = (choice, index) => !feedback ? `${BASE} bg-white text-slate-700 dark:bg-slate-700 dark:text-slate-100`
            : choice.correct ? `${BASE} border-emerald-700 bg-emerald-600 text-white dark:border-emerald-900 dark:bg-emerald-700`
            : index === game.picked ? `${BASE} border-rose-800 bg-rose-600 text-white dark:border-rose-900 dark:bg-rose-700`
            : `${BASE} bg-white text-slate-700 opacity-50 dark:bg-slate-700 dark:text-slate-100`;
        const choices = data.question.choices.map((choice, index) => `
            <button type="button" data-action="mode-choice" data-index="${index}"${feedback ? ' disabled' : ''} class="${choiceClass(choice, index)}">${escapeHtml(choice.label)}</button>`).join('');
        const verdict = !feedback ? '' : round.correct ? 'Správně!' : `Špatně. Správně je ${data.question.answerLabel}.`;
        appContent.innerHTML = `
            <div data-mode-question="${game.kind}" data-phase="${game.phase}" data-asked="${game.asked}" class="flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 pb-2 dark:bg-slate-900">
                ${modeStatus(game)}
                <div class="flex flex-col items-center gap-1 text-center">
                    <span class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm ${style.solid}"><i data-lucide="${category.icon}" class="h-3 w-3"></i> ${escapeHtml(data.typeLabel)}</span>
                    <h2 class="text-[22px] font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(data.question.title)}</h2>
                </div>
                ${questionPanel(data)}
                <section class="${CARD} p-3"><div class="grid grid-cols-2 gap-2">${choices}</div></section>
                <p class="sr-only" role="status">${escapeHtml(verdict)}</p>
                <button type="button" data-action="mode-quit" class="mx-auto flex min-h-[2.75rem] items-center gap-2 px-3 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"><i data-lucide="flag" class="h-4 w-4"></i> Ukončit hru</button>
            </div>`;
        renderIcons(appContent);
        mountPanels();
        if (game.clock) paintModeClock(Modes.clockLeft(game.clock, Date.now()));
        if (!feedback) appContent.scrollTo(0, 0);
    };
    const renderModeLoading = (game) => {
        const topic = modeTopicOf(game);
        appContent.innerHTML = `
            <div data-mode-loading class="flex min-h-full w-full flex-col gap-2.5 bg-slate-50 p-3 dark:bg-slate-900">
                ${game.asked || game.kind === 'blitz' ? modeStatus(game) : ''}
                <div class="flex flex-1 flex-col items-center justify-center">
                    ${topicArt(topic) ? topicIcon(topic, 'bob mb-4 h-20 w-20') : LOADING_OWL}
                    <p class="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">${game.asked ? 'Chystám další otázku…' : 'Chystám otázky…'}</p>
                    ${game.kind === 'blitz' ? '<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Čas zatím stojí</p>' : ''}
                </div>
            </div>`;
        renderIcons(appContent);
        if (game.clock) paintModeClock(Modes.clockLeft(game.clock, Date.now()));
    };
    const renderModeError = (game) => {
        const offline = game.error instanceof NetworkError || !navigator.onLine;
        appContent.innerHTML = `
            <div data-mode-error class="fade-in flex min-h-full flex-col items-center justify-center gap-2 bg-slate-50 p-8 text-center dark:bg-slate-900">
                <i data-lucide="${offline ? 'wifi-off' : 'search-x'}" class="mb-2 h-14 w-14 text-slate-300 dark:text-slate-600"></i>
                <h2 class="text-xl font-bold text-slate-700 dark:text-slate-200">${offline ? 'Chyba spojení' : 'Něco se pokazilo'}</h2>
                <p class="mb-4 text-slate-500 dark:text-slate-400">${offline ? 'Další otázku se nepodařilo načíst. Zkontroluj připojení k internetu a zkus to znovu.' : 'Další otázku se nepodařilo připravit. Zkus to prosím znovu.'}${game.kind === 'blitz' ? ' Čas mezitím stojí.' : ''}</p>
                <button type="button" data-action="mode-retry" class="rounded-2xl bg-brand-700 px-6 py-3 font-bold text-white shadow-lg active:scale-95">Zkusit znovu</button>
                <button type="button" data-action="mode-quit" class="${BACK_LINK}">Ukončit hru</button>
            </div>`;
        renderIcons(appContent);
    };
    const renderModeResult = (game) => {
        const def = Modes.MODES[game.kind];
        const topic = modeTopicOf(game);
        const style = styleOf(topic);
        const { outcome } = game;
        const owl = outcome.record ? 'sova-vitez' : game.score > 0 ? 'sova-radost' : 'sova-smutek';
        const unit = Modes.scoreLabel(game.kind, game.score).replace(/^\d+ /, '');
        const recordLine = outcome.record
            ? `<p data-mode-new-record class="mode-pop mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-sm font-black text-brand-950 shadow"><i data-lucide="trophy" class="h-4 w-4"></i> Nový rekord!${outcome.overallRecord && !outcome.scopeRecord ? ' (celkový)' : outcome.overallRecord ? ' I celkový.' : ''}</p>`
            : outcome.firstRecord ? `<p class="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">${game.pool.kind === 'mix' ? 'První rekord v mixu' : 'První rekord v tématu'}</p>`
            : outcome.before.scope ? `<p class="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">Rekord je ${outcome.before.scope}, ${outcome.before.scope - game.score === 1 ? 'chyběla 1' : outcome.before.scope - game.score <= 4 ? `chyběly ${outcome.before.scope - game.score}` : `chybělo ${outcome.before.scope - game.score}`}</p>` : '';
        const missed = game.missed.filter(isKnownRef);
        const missedHtml = missed.length ? `
            <section class="${CARD} p-3">
                <h3 class="${CARD_TITLE}"><i data-lucide="repeat" class="h-4 w-4 ${style.text}"></i> Co ti uteklo</h3>
                <p class="mb-2 mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">${reviewEnabled() ? 'Vrátí se ti v procvičování chyb.' : 'Najdeš to v Mých chybách v Učení.'}</p>
                <div class="flex flex-wrap gap-1.5">
                    ${missed.slice(0, 8).map(miss => `<button type="button" data-action="item-info" data-topic="${escapeHtml(miss.topic)}" data-id="${escapeHtml(miss.id)}" class="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] font-bold text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100"><i data-lucide="info" class="h-4 w-4 ${style.text}"></i> ${escapeHtml(miss.name)}</button>`).join('')}
                    ${missed.length > 8 ? `<span class="self-center text-xs font-bold text-slate-500 dark:text-slate-400">a ${missed.length - 8} další v Mých chybách</span>` : ''}
                </div>
            </section>` : '';
        appContent.innerHTML = `
            <div data-mode-result="${game.kind}" class="fade-in flex min-h-full w-full flex-col bg-slate-50 dark:bg-slate-900">
                <div class="flex flex-grow flex-col gap-3 p-4 short:gap-2.5 short:p-3">
                    <div data-verdict tabindex="-1" class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm outline-none ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
                        ${uiArt(owl, 'h-20 w-20 -my-2')}
                        <div class="min-w-0 flex-1">
                            <p class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${modeBadge(game.kind, 'h-7 w-7 -my-1.5', 'h-3 w-3')} ${escapeHtml(def.title)} · ${escapeHtml(topic.title)}</p>
                            <p class="mt-1 flex items-baseline gap-2"><span data-mode-score class="text-5xl font-black tabular-nums leading-none text-slate-800 dark:text-slate-50">${game.score}</span><span class="text-sm font-bold leading-tight text-slate-600 dark:text-slate-300">${escapeHtml(unit)}</span></p>
                            ${recordLine}
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        ${modeStat(game.pool.kind === 'mix' ? 'Rekord mixu' : 'Rekord tématu', outcome.after.scope || '–')}
                        ${modeStat('Celkový rekord', outcome.after.overall || '–')}
                        ${game.kind === 'blitz' ? modeStat('Chyby', game.wrong) : modeStat('Otázek', game.asked)}
                    </div>
                    <div class="flex items-stretch gap-2">
                        ${game.xp && (game.xp.total || game.xp.note) ? `<div data-mode-xp class="min-w-0 flex-1 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">${xpLine(game.xp, 'text-slate-700 dark:text-slate-200')}${game.xp.note ? `<p class="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(game.xp.note)}</p>` : ''}</div>` : ''}
                        ${ShareCard && game.score > 0 ? `<button type="button" data-action="mode-share-image" class="flex min-h-[2.75rem] ${game.xp && (game.xp.total || game.xp.note) ? 'w-[5.5rem] shrink-0 flex-col' : 'flex-1'} items-center justify-center gap-1 rounded-2xl btn-3d-light bg-white px-2 py-1.5 text-center text-[12px] font-bold leading-tight text-slate-800 dark:bg-slate-800 dark:text-slate-100"><i data-lucide="image" class="h-4 w-4 shrink-0"></i> Sdílet obrázek</button>` : ''}
                    </div>
                    ${missedHtml}
                </div>
                <div class="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200/70 bg-slate-50/95 px-4 pb-4 pt-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
                    <button type="button" data-action="mode-home" class="flex shrink-0 items-center justify-center gap-1.5 rounded-[1.2rem] bg-slate-200 px-4 py-3.5 text-base font-bold text-slate-700 transition-all active:scale-95 dark:bg-slate-800 dark:text-slate-200"><i data-lucide="house" class="h-5 w-5"></i> Úvod</button>
                    <button type="button" data-action="mode-again" class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[1.2rem] py-3.5 text-lg font-bold text-white shadow-lg transition-all active:scale-95 max-[389px]:text-base ${style.button} btn-3d"><i data-lucide="repeat" class="h-5 w-5 shrink-0"></i> Hrát znovu</button>
                </div>
            </div>`;
        const verdict = appContent.querySelector('[data-verdict]');
        if (verdict) verdict.focus({ preventScroll: true });
    };
    const renderModeScreen = () => {
        const game = modeGame;
        if (!game || !Modes) return;
        screen = 'mode';
        if (game.phase === 'intro') renderModeIntro(game);
        else if (game.phase === 'loading') renderModeLoading(game);
        else if (game.phase === 'error') renderModeError(game);
        else if (game.phase === 'result') renderModeResult(game);
        else renderModeQuestion(game);
        if (game.phase !== 'question' && game.phase !== 'feedback') {
            applyProgress(appContent);
            renderIcons(appContent);
            if (game.phase !== 'loading') appContent.scrollTo(0, 0);
        }
        updateControlsUI();
    };
    // Tlačítko režimu v okně Co hrát (pod Hrát, všechna v jednom řádku): po dvou široké s obrázkem vedle názvu,
    // po třech (s Ukaž na mapě) svislé dlaždice s obrázkem nad názvem, ať se okno vejde na telefon bez posouvání
    // (na nejužších telefonech bez podtitulku; celý popis je v title a aria-label)
    const chooserTile = ({ attrs, art, title, sub, subCompact = sub }, compact) => compact ? `
            <button type="button" ${attrs} class="btn-3d-light flex min-h-[2.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1.2rem] bg-white px-1 pb-1 pt-1.5 text-center text-slate-800 short:pt-1 dark:bg-slate-800 dark:text-slate-100">
                ${art('-my-0.5 h-9 w-9 short:h-8 short:w-8')}<span class="block max-w-full text-[13px] font-black leading-tight max-[380px]:text-[12px]">${escapeHtml(title)}</span><span class="block max-w-full text-[11px] font-semibold leading-tight text-slate-500 max-[340px]:hidden dark:text-slate-400">${escapeHtml(subCompact)}</span>
            </button>` : `
            <button type="button" ${attrs} class="btn-3d-light flex min-h-[3.5rem] min-w-0 items-center gap-2.5 rounded-[1.2rem] bg-white px-3 py-2 text-left short:min-h-[2.75rem] short:py-1 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                ${art('h-10 w-10 short:h-9 short:w-9')}<span class="min-w-0"><span class="block text-[15px] font-black leading-tight">${escapeHtml(title)}</span><span class="block text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(sub)}</span></span>
            </button>`;
    // Řádek Bleskovka a Přežití (u Mixu a témat s mapou i Ukaž na mapě) pro okno Co hrát
    const modeChooserButtons = (withMap = false) => {
        const tiles = (Modes ? Modes.IDS : []).map(id => {
            const def = Modes.MODES[id];
            const label = escapeHtml(`${def.title}: ${def.tagline}`);
            return { attrs: `data-chooser-mode="${id}" title="${label}" aria-label="${label}"`, art: (cls) => modeBadge(id, cls, 'h-5 w-5'), title: def.title, sub: id === 'blitz' ? '60 sekund' : id === 'survival' ? '3 životy' : '' };
        });
        const mapLabel = 'Ukaž na mapě: jen otázky na mapě, zkušební režim';
        if (withMap) tiles.push({ attrs: `data-chooser-map title="${mapLabel}" aria-label="${mapLabel}"`, art: (cls) => uiArt('rezim-mapa', cls), title: 'Ukaž na mapě', sub: 'jen otázky na mapě · zkušební režim', subCompact: 'zkušební režim' });
        if (!tiles.length) return '';
        const compact = tiles.length > 2;
        return `<div class="mt-2 grid ${compact ? 'grid-cols-3' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 short:mt-1.5">${tiles.map(tile => chooserTile(tile, compact)).join('')}</div>`;
    };
    const modeActions = {
        'mode-start': () => startModeGame(),
        'mode-choice': (button) => answerMode(Number(button.dataset.index)),
        'mode-quit': () => { if (modeGame && modeGame.phase !== 'intro' && modeGame.phase !== 'result') finishModeGame(modeGame); },
        'mode-again': () => { if (modeGame) startModeGame(modeGame.kind, modeGame.pool); },
        'mode-home': () => leaveMode(),
        'mode-share-image': () => shareModeImage(),
        'mode-retry': () => { if (modeGame && modeGame.phase === 'error') { modeGame.phase = 'loading'; showNextModeQuestion(modeGame); } }
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
    // Barvy částí postaviček, které si hráč nastavil, pro každou postavičku zvlášť ({ id: zápis jako 'krecek13' }); po přepnutí
    // na jinou postavičku a zpět se vrátí. Jen v tomto zařízení; v účtu je uložená jen právě zvolená postavička.
    const AVATAR_PARTS_KEY = 'mudrlant.avatarParts';
    const rememberPartColors = (value) => {
        const pic = Look && Look.avatarPicture ? Look.avatarPicture(value) : null;
        if (!pic) return;
        const saved = readJson(AVATAR_PARTS_KEY);
        const map = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        map[pic.item.id] = Look.formatAvatar(pic.item.id, pic.colors);
        writeJson(AVATAR_PARTS_KEY, map);
    };
    const rememberedPartColors = (id) => {
        const saved = readJson(AVATAR_PARTS_KEY);
        const code = saved && typeof saved === 'object' && typeof saved[id] === 'string' ? saved[id] : null;
        const pic = code && Look && Look.avatarPicture ? Look.avatarPicture(code) : null;
        return pic && pic.item.id === id ? Look.formatAvatar(id, pic.colors) : id;
    };
    let myProfile = null;
    let myChallenges = null;
    let myRating = null;
    let incomingList = null;
    // Přátelé (friends.js): řádky z friends_list (null = nenačtené nebo databáze přátele nemá), reakce k posledním výzvám, moji zablokovaní (null = nenačtení)
    const Friends = window.MudrlantFriends;
    // Skupiny (groups.js): okna a čip na záložce Více hráčů; vytvoří se u ACTIONS, až jsou pomocné funkce oken hotové
    let GroupsUI = null;
    let friendRows = null;
    let recentReactions = [];
    let myBlocks = null;
    let recentExpanded = false; // Poslední výzvy: rozbalené všechny (jinak jen tři nejnovější)
    // Starší výzvy načtené při posouvání rozbaleného seznamu (stránky po RECENT_PAGE); done = už žádné starší nejsou
    const RECENT_PAGE = 15;
    let recentOlder = { rows: [], loading: false, done: false, error: false };
    let recentObserver = null;
    let challengesLoading = false;
    const signedUser = () => (Auth && Auth.getState().user) || null;
    const playerName = (player) => (player && player.display_name) || 'Hráč';
    // Hráči, jejichž obrázek jde klepnout (klepnutí otevře profil); id → údaje o hráči
    const knownPlayers = new Map();
    // Moje sova (barva obleku + doplňky z lokální volby, případně sova titulu) jako text pro profil; pose = jiná sova titulu než uložená
    // (náhled v Profilu), null = sova s doplňky. Sova titulu se omezí na dosaženou úroveň: po ztrátě úrovně nejvyšší dosažená.
    const ownOwlText = (pose) => {
        if (!Owl || !Owl.encodeOwl || !Look) return '';
        const ctx = lookContext();
        return Owl.encodeOwl({ ...ctx.prefs, pose: Owl.allowedPose(pose, ctx.level) });
    };
    const myOwlText = () => Look ? ownOwlText(Look.prefs(lookContext()).pose) : '';
    // Postavička (look.js, icons/avatars): základní obrázek a přes něj vrstvy přebarvených částí v jedné buňce mřížky. Zabere 82 % kolečka,
    // takže je celá vidět i s obrysem (obrázky jsou skoro čtvercové); velikost se bere z kolečka, ne z písma. Hodnota, která není postavička,
    // dá prázdný text (vykreslí se jako emoji).
    const avatarArt = (value, sizeClass = 'h-[82%] w-[82%]') => {
        const picture = Look && Look.avatarPicture ? Look.avatarPicture(value) : null;
        if (!picture) return '';
        return `<span data-avatar-art="${picture.item.id}" class="grid shrink-0 ${sizeClass}">${[picture.base, ...picture.layers].map((src, index) => `<img src="${src}" alt=""${index ? ' data-avatar-layer' : ''} draggable="false" class="pointer-events-none h-full w-full select-none object-contain [grid-area:1/1]">`).join('')}</span>`;
    };
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
        // Náhled v Profilu (draft) má sovu z rozpracované volby (třeba jinou sovu titulu)
        const owlHtml = showsOwl && Owl && Owl.owlAvatarHtml ? Owl.owlAvatarHtml(isMe && Look && !player.draft ? myOwlText() : player.owl) : '';
        return `<span ${linked ? `data-player-id="${escapeHtml(player.id)}" role="button" tabindex="0" aria-label="Profil hráče ${escapeHtml(playerName(player))}"` : 'aria-hidden="true"'} class="flex shrink-0 items-center justify-center rounded-full ${size} ${avatarBg(isMe && !player.draft && myProfile && myProfile.color ? myProfile.color : player && player.color)}${frame}${linked ? ' cursor-pointer' : ''}">${owlHtml || avatarArt(player && player.avatar) || escapeHtml((player && player.avatar) || '🦊')}</span>`;
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
    let acceptsSaving = Promise.resolve(); // ukládání přijímaných témat jedno po druhém
    let acceptsConfirmed = null; // poslední stav potvrzený serverem ({ blocked, mix })
    const adoptAccepts = (accepts) => { myBlocked = accepts.blocked; myAcceptsMix = accepts.mix; acceptsConfirmed = { blocked: [...accepts.blocked], mix: accepts.mix }; };
    const acceptSummary = () => !myBlocked ? 'nastavit' : `${myBlocked.length ? `${TOPICS.length - myBlocked.length} z ${TOPICS.length} témat` : 'všechna témata'}${myAcceptsMix ? '' : ', bez Mixu'}`;
    // Okno „Přijímané výzvy“: každé téma jde vypnout; ukládá se hned po klepnutí
    const openAccepted = async () => {
        const user = signedUser();
        if (!user || !Social) { openLoginDialog(); return; }
        let note = '';
        const render = () => {
            const blocked = myBlocked || [];
            showDialog('Přijímané výzvy', `
                <div class="flex flex-col gap-3 short:gap-2">
                    <p class="text-xs leading-snug text-slate-500 short:text-[11px] dark:text-slate-400">Vyber, z jakých témat tě ostatní můžou vyzývat. U <b class="text-slate-700 dark:text-slate-200">vypnutých</b> témat ti výzvu nezadají a náhodný soupeř tě v nich nedostane. Třeba když historii vůbec neznáš.</p>
                    <button type="button" data-accept-mix role="switch" aria-checked="${myAcceptsMix}" class="btn-3d-light flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left short:p-2 ${myAcceptsMix ? 'bg-white dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-800/60'}">
                        ${uiArt('mix', 'h-9 w-9 short:h-8 short:w-8')}
                        <span class="min-w-0 flex-1"><span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">Mix všech témat</span><span class="block text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${myAcceptsMix ? (TOPICS.length - blocked.length > 0 ? `Dostaneš ho jen z tvých ${TOPICS.length - blocked.length} zapnutých témat.` : 'Nemáš zapnuté žádné téma.') : 'Vypnuto: přijímáš jen výzvy z konkrétních témat.'}</span></span>
                        <span class="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 ${myAcceptsMix ? 'justify-end bg-emerald-500' : 'justify-start bg-slate-300 dark:bg-slate-600'}"><span class="h-5 w-5 rounded-full bg-white shadow"></span></span>
                    </button>
                    <ul class="grid grid-cols-2 gap-1.5 short:gap-1">${TOPICS.map(topic => {
                        const off = blocked.includes(topic.id);
                        return `<li><button type="button" data-accept-topic="${topic.id}" role="switch" aria-checked="${!off}" class="btn-3d-light flex min-h-[2.5rem] w-full items-center gap-2 rounded-xl p-2 text-left short:py-1 ${off ? 'bg-slate-100 opacity-70 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-800'}">
                            ${topicIcon(topic, 'h-8 w-8 short:h-7 short:w-7', `rounded-lg p-1.5 short:p-1 ${styleOf(topic).soft}`, 'h-5 w-5')}
                            <span class="min-w-0 flex-1 text-[11.5px] font-black leading-tight ${off ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}">${escapeHtml(topic.title)}</span>
                            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${off ? 'bg-slate-300 text-white dark:bg-slate-600' : 'bg-emerald-500 text-white'}"><i data-lucide="${off ? 'ban' : 'check'}" class="h-3 w-3"></i></span>
                        </button></li>`;
                    }).join('')}</ul>
                    <div class="flex items-center justify-between gap-2">
                        <p class="text-xs font-bold text-slate-600 dark:text-slate-300">Přijímáš: ${escapeHtml(acceptSummary())}</p>
                        ${blocked.length ? '<button type="button" data-accept-all class="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200">Zapnout vše</button>' : ''}
                    </div>
                    <p class="min-h-[1rem] text-xs font-semibold short:-mt-1 ${note.startsWith('Uloženo') ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-400'}" role="status">${escapeHtml(note)}</p>
                </div>`, {
                onClick: async (event) => {
                    const toggle = event.target.closest('[data-accept-topic]');
                    const all = event.target.closest('[data-accept-all]');
                    const mixSwitch = event.target.closest('[data-accept-mix]');
                    // Dokud se nastavení nenačte, klepnutí by uložilo změnu proti prázdnému seznamu a přepsalo uložená témata
                    if ((!toggle && !all && !mixSwitch) || myBlocked === null) return;
                    const before = myBlocked;
                    if (mixSwitch) myAcceptsMix = !myAcceptsMix;
                    else myBlocked = all ? [] : before.includes(toggle.dataset.acceptTopic) ? before.filter(id => id !== toggle.dataset.acceptTopic) : [...before, toggle.dataset.acceptTopic];
                    note = '';
                    render();
                    // Rychlá klepnutí za sebou: ukládá se po jednom (pořadí na serveru = pořadí klepnutí) a vždy aktuální stav;
                    // při chybě se vrátí poslední uložený stav
                    const saved = acceptsSaving.then(async () => {
                        const sent = { blocked: [...(myBlocked || [])], mix: myAcceptsMix };
                        await Social.saveAccepts(user.id, sent);
                        acceptsConfirmed = sent;
                    });
                    acceptsSaving = saved.catch(() => {});
                    try {
                        await saved;
                        note = 'Uloženo.';
                        paintChallenges();
                    } catch (error) {
                        if (acceptsConfirmed) { myBlocked = [...acceptsConfirmed.blocked]; myAcceptsMix = acceptsConfirmed.mix; }
                        note = 'Uložení se nepodařilo. Zkontroluj připojení a že je v databázi nejnovější SQL.';
                    }
                    if (document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === 'Přijímané výzvy') render();
                }
            });
        };
        render();
        if (myBlocked === null) { const accepts = await Social.getAccepts(user.id); if (myBlocked === null) adoptAccepts(accepts); const overlay = document.getElementById('dialog-overlay'); if (overlay && overlay.dataset.title === 'Přijímané výzvy') render(); }
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
            // Sova titulu jako profilovka z účtu (nové zařízení): převezme se, když tu žádná zvolená není
            const accountPose = Owl && myProfile.owl ? (Owl.parseOwl(myProfile.owl) || {}).pose : null;
            if (accountPose && !ctx.prefs.pose) Look.setPref('pose', accountPose, ctx);
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
    // Celý look tématu (look.js activeTopicLook): když sova poprvé oblékne celou sadu tématu (nasadí poslední kus), oslava s její podobou.
    // Které looky už slavila, si pamatuje zařízení (mudrlant.looks); znovu oblečený look se neslaví.
    const LOOKS_KEY = 'mudrlant.looks';
    const celebrateLook = (prefs) => {
        const look = Look && Look.activeTopicLook ? Look.activeTopicLook(prefs.acc) : null;
        if (!look) return;
        const seen = Array.isArray(readJson(LOOKS_KEY)) ? readJson(LOOKS_KEY) : [];
        if (seen.includes(look.topic)) return;
        writeJson(LOOKS_KEY, [...seen, look.topic]);
        const art = Owl && Owl.owlAvatarHtml ? Owl.owlAvatarHtml({ robe: prefs.robe, acc: prefs.acc }, 'h-full w-auto', 'h-20 -my-4 drop-shadow-lg') : '';
        showCelebration('vitez', 'Celý look', `${look.title} – celá sada tématu ${look.topicTitle}`, 'badge', art);
    };
    if (Look) Look.onChange((prefs, key) => {
        if (key === 'acc') celebrateLook(prefs);
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
        scheduleNicknameOffer(user, !loaded);
        if (myBlocked === null) Social.getAccepts(user.id).then(accepts => { if (!signedUser() || signedUser().id !== user.id || myBlocked !== null) return; adoptAccepts(accepts); paintChallenges(); });
        return myProfile;
    };

    // Přezdívka po prvním přihlášení: profil z Googlu nese celé jméno – hra jednou (na účet a zařízení) nabídne zvolit si přezdívku,
    // pod kterou ho uvidí ostatní (výzvy, žebříčky, skupiny). Jen když je profil nový nebo jméno je pořád to z Googlu; počká,
    // až nebude nic jiného na obrazovce (tutoriál, otázka, jiné okno – stejná pravidla jako nabídka upozornění).
    const NICK_ASKED_KEY = 'mudrlant.nickAsked';
    const nickAsked = (id) => { const list = readJson(NICK_ASKED_KEY); return Array.isArray(list) && list.includes(id); };
    const markNickAsked = (id) => { const list = readJson(NICK_ASKED_KEY); writeJson(NICK_ASKED_KEY, [...(Array.isArray(list) ? list : []), id].slice(-20)); };
    // Přihlášení přes Google: značka, že se hráč právě přihlašuje (po návratu z Googlu se pak nabídne přezdívka)
    const NICK_PENDING_KEY = 'mudrlant.nickPending';
    const startLogin = () => { writeJson(NICK_PENDING_KEY, Date.now()); if (Auth) Auth.login(); };
    let nickTimer = null;
    const scheduleNicknameOffer = (user, fresh, tries = 0) => {
        clearTimeout(nickTimer);
        const pending = readJson(NICK_PENDING_KEY);
        // Jen hned po přihlášení přes Google (nejvýš 30 minut od klepnutí), ne při každém načtení profilu
        if (!Number.isFinite(pending) || Date.now() - pending > 30 * 60 * 1000) return;
        if (!user || !Social || !myProfile) return;
        if (nickAsked(user.id)) { writeJson(NICK_PENDING_KEY, null); return; }
        const googleName = String(user.name || '').trim();
        if (!fresh && myProfile.display_name !== googleName) { markNickAsked(user.id); writeJson(NICK_PENDING_KEY, null); return; }
        if (pushOfferBlocked()) { if (tries < 40) nickTimer = setTimeout(() => scheduleNicknameOffer(user, fresh, tries + 1), 3000); return; }
        markNickAsked(user.id);
        writeJson(NICK_PENDING_KEY, null);
        openNicknameOffer(user);
    };
    const openNicknameOffer = (user) => {
        // Návrh: křestní jméno z Googlu, když projde pravidly přezdívky
        const first = String(user.name || '').trim().split(/\s+/)[0] || '';
        const draft = { name: Social.isValidName && Social.isValidName(first) ? first : '', note: '', busy: false };
        const render = () => {
            showDialog('Jak ti mají ostatní říkat?', `
                <form id="nick-offer" class="flex flex-col gap-3" autocomplete="off">
                    <p class="text-sm text-slate-600 dark:text-slate-300">Vyber si přezdívku. Uvidí ji ostatní hráči ve výzvách, žebříčcích a skupinách – tvé celé jméno z Googlu ne. Změnit ji jde kdykoli v Nastavení → Profil.</p>
                    <label for="nick-input" class="sr-only">Přezdívka</label>
                    <input id="nick-input" data-autofocus type="text" maxlength="${Social.NAME_MAX || 24}" value="${escapeHtml(draft.name)}" placeholder="Přezdívka" class="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                    ${draft.note ? DIALOG_NOTE(draft.note) : ''}
                    <button type="submit" ${draft.busy ? 'disabled' : ''} class="${PRIMARY_BUTTON}">${draft.busy ? 'Ukládám…' : 'Uložit přezdívku'}</button>
                    <button type="button" data-close class="${SECONDARY_BUTTON}">Teď ne</button>
                </form>`, {
                onInput: (event) => { if (event.target.id === 'nick-input') draft.name = event.target.value; },
                onSubmit: async () => {
                    if (draft.busy) return;
                    const input = document.getElementById('nick-input');
                    if (input) draft.name = input.value;
                    draft.busy = true; draft.note = ''; render();
                    try {
                        const base = myProfile || {};
                        myProfile = await Social.saveProfile(user.id, { name: draft.name, avatar: base.avatar, color: base.color, owl: base.owl || null });
                        meDraft = null;
                        updateProfileButton();
                        paintChallenges();
                        closeDialog();
                        showToast(`Přezdívka uložena: ${myProfile.display_name}`);
                        return;
                    } catch (error) {
                        draft.note = error.status === 400 || error.status === 409 ? error.message : 'Uložení se nepodařilo, zkus to znovu.';
                    }
                    draft.busy = false; render();
                }
            });
        };
        render();
    };

    // Část Výzvy na úvodní stránce: bez nastaveného Supabase se neukáže, bez přihlášení láká k přihlášení
    const challengeRow = (row) => {
        const count = row.challenge ? row.challenge.count : 0;
        // Stejně jako výsledek výzvy a rating: víc bodů, při shodě víc správných (proti nejlepšímu soupeři)
        const best = row.others.reduce((top, other) => !top || compareResults(other, top) > 0 ? other : top, null);
        const versus = !best ? null : compareResults(row, best);
        const outcome = versus === null ? 'čeká' : versus > 0 ? 'vyhráno' : versus === 0 ? 'remíza' : 'prohráno';
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
                <span class="w-12 shrink-0 text-right leading-tight tabular-nums"><span class="block text-[15px] font-black text-slate-800 dark:text-slate-100">${Number(row.points) || 0} b</span><span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">${row.correct}/${count}</span></span>
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
    // Pořadí ve výzvách a zápasech: víc bodů, při shodě víc správných (jediné pravidlo v rating.js, shodné s databází)
    const compareResults = (Rating && Rating.compareResults) || ((a, b) => ((Number(a.points) || 0) - (Number(b.points) || 0)) || ((Number(a.correct) || 0) - (Number(b.correct) || 0)));
    const BAR_WIDTHS = ['w-0', 'w-[10%]', 'w-[20%]', 'w-[30%]', 'w-[40%]', 'w-[50%]', 'w-[60%]', 'w-[70%]', 'w-[80%]', 'w-[90%]', 'w-full'];
    // Erb ligy (vlastní ilustrace icons/topics/liga-<id>.webp)
    const leagueEmblem = (league, cls) => `<img src="icons/topics/liga-${league.id}.webp" alt="" data-league-emblem="${league.id}" class="${cls} shrink-0 object-contain drop-shadow-sm">`;
    const leagueBubble = (league, size = 'h-11 w-11') => `<span class="flex ${size} shrink-0 items-center justify-center" title="Liga ${escapeHtml(league.name)}">${leagueEmblem(league, 'h-full w-full')}</span>`;
    // Malý popisek „ikona Liga · rating“ pro profil soupeře a žebříček
    const leagueChip = (rating) => {
        if (!Rating || rating === null || rating === undefined) return '';
        const league = Rating.leagueFor(rating);
        return `<span class="league-fg-${league.id} inline-flex items-center gap-1 text-xs font-black">${leagueEmblem(league, 'h-4 w-4')}${escapeHtml(league.name)} · ${Rating.cleanRating(rating)}</span>`;
    };
    // Karta „Moje liga“ na záložce Více hráčů: ikona ligy, rating, ukazatel do další ligy a tlačítko týdenního žebříčku
    const leagueCard = () => {
        if (!Rating || !myRating) return '';
        const progress = Rating.leagueProgress(myRating.rating);
        const hint = progress.next ? `Do ligy ${progress.next.name} ještě ${progress.toNext}` : 'Nejvyšší liga';
        // Pod řádkem ligy pruh ligové sezóny (schéma 18): sezóna, kolik dní zbývá a další odměna
        const strip = leagueSeasonStrip();
        return `
            <div id="league-card" class="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">
              <div class="flex items-center gap-2.5">
                ${leagueBubble(progress.league, 'h-10 w-10')}
                <div class="min-w-0 flex-1">
                    <p class="truncate text-[15px] font-black leading-tight text-slate-800 dark:text-slate-100"><span class="sr-only">Moje liga </span>${escapeHtml(progress.league.name)} · ${myRating.rating}</p>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}" aria-label="Postup do další ligy"><div class="league-${progress.league.id} h-full rounded-full ${BAR_WIDTHS[Math.round(progress.percent / 10)]}"></div></div>
                    <p class="mt-0.5 truncate text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">${myRating.games ? hint : 'Rating se mění výzvami'}</p>
                </div>
                <button type="button" data-action="weekly-board" class="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gold-50 px-3 text-[12px] font-black text-brand-950 ring-1 ring-gold-300/70 active:scale-95 dark:bg-gold-900/20 dark:text-gold-200 dark:ring-gold-700/60"><i data-lucide="trophy" class="h-4 w-4"></i> Týden</button>
                <button type="button" data-action="league-help" aria-label="Jak fungují ligy" title="Jak to funguje?" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-black text-brand-700 active:scale-95 dark:bg-slate-700 dark:text-cream">?</button>
              </div>
              ${strip ? `<div class="mt-1.5">${strip}</div>` : ''}
            </div>`;
    };
    // Vysvětlení ratingu a lig (z karty ligy i z týdenního žebříčku). Hranice a vzhled lig se čtou z rating.js. fromBoard = tlačítko Zpět na žebříček.
    const openLeagueHelp = () => {
        if (!Rating) return;
        // Ligové sezóny (schéma 18): bod s pravidlem a tlačítko do okna sezón, jen když je databáze zná. Zpět vede tam, odkud hráč přišel
        // (žebříček, Ligové sezóny); z Ligových sezón stačí tlačítko zpět, druhé tlačítko do sezón by bylo navíc
        const seasons = Boolean(LeagueSeasons && leagueSeasons);
        const hasBack = dialogTrail.length > 0;
        const seasonsLink = seasons && !(hasBack && dialogTrail[dialogTrail.length - 1].title === 'Ligové sezóny');
        const mine = myRating ? Rating.leagueFor(myRating.rating) : null;
        const range = (league, index) => {
            const next = Rating.LEAGUES[index + 1];
            if (!next) return `od ${league.from}`;
            return index === 0 ? `do ${next.from - 1}` : `${league.from}–${next.from - 1}`;
        };
        const leagues = Rating.LEAGUES.map((league, index) => `
            <li data-league="${league.id}" class="flex items-center gap-2 rounded-xl bg-white p-1.5 shadow-sm dark:bg-slate-800 ${mine && mine.id === league.id ? 'ring-2 ring-brand-600' : ''}">
                ${leagueBubble(league, 'h-8 w-8')}
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
                ${seasons ? `<p class="${POINT}" data-help-seasons>${DOT}<span><b class="text-slate-800 dark:text-slate-100">Ligová sezóna</b> trvá kalendářní měsíc. Výsledek je nejvyšší liga, které v něm dosáhneš. Za Stříbro a výš dostaneš rámeček profilu navždy.</span></p>` : ''}
                ${hasBack || seasonsLink ? `<div class="grid ${hasBack && seasonsLink ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
                    ${hasBack ? `<button type="button" data-dialog-back class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-brand-700 px-3 py-2.5 text-sm font-black text-white"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(backLabel())}</button>` : ''}
                    ${seasonsLink ? `<button type="button" data-help-seasons-open class="flex w-full items-center justify-center gap-2 rounded-2xl ${hasBack ? 'btn-3d-light bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100' : 'btn-3d bg-brand-700 text-white'} px-3 py-2.5 text-sm font-black"><i data-lucide="calendar-days" class="h-4 w-4"></i> Ligové sezóny</button>` : ''}
                </div>` : ''}
            </div>`, { onClick: (event) => {
            if (event.target.closest('[data-help-seasons-open]')) openChild('Zpět na Jak fungují ligy', () => openLeagueHelp(), openLeagueSeasons);
        } });
        renderIcons(document.getElementById('dialog-overlay'));
    };
    // Okno Týdenní žebříček: top hráči týdne podle součtu změn ratingu (server vrací jen veřejné údaje)
    const openWeeklyBoard = async () => {
        const user = signedUser();
        if (!user || !Social || !Rating) { openLoginDialog(); return; }
        const head = `<div class="flex items-start gap-2"><p class="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Týden ${escapeHtml(Rating.weekLabel())} · řazeno podle změny ratingu ve výzvách proti jiným hráčům. V pondělí se počítá znovu.</p><button type="button" data-league-help aria-label="Jak fungují ligy" title="Jak to funguje?" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-50 text-base font-black text-brand-950 ring-1 ring-gold-300/70 active:scale-95 dark:bg-gold-900/20 dark:text-gold-200 dark:ring-gold-700/60">?</button></div>`;
        const onClick = (event) => { if (event.target.closest('[data-league-help]')) openChild('Zpět na žebříček', openWeeklyBoard, () => openLeagueHelp()); };
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
    // ===== Ligové sezóny a vitrína v profilu (schéma 18; league-seasons.js, showcase.js) =====
    // Sezóna = kalendářní měsíc (pražský čas), výsledek = nejvyšší liga v měsíci; za vrchol skončené sezóny Stříbro a výš rámeček profilu.
    // Vitrína = nejvýš 3 trofeje (odznak, diplom, ligová sezóna), které ostatní uvidí v Profilu hráče. Se starší databází se nic z toho neukáže.
    const LeagueSeasons = window.MudrlantLeagueSeasons || null;
    const Showcase = window.MudrlantShowcase || null;
    // Sezóny přihlášeného hráče (null = nenačtené nebo je databáze nemá), kdy se načetly, a moje vitrína (null = nenačtená nebo ji databáze nemá)
    let leagueSeasons = null;
    let leagueSeasonsAt = 0;
    let myShowcase = null;
    let myShowcaseAt = 0;
    let showcaseBusy = false;
    const leagueCache = () => readJson(LeagueSeasons.KEY);
    const leagueBestNow = () => (LeagueSeasons ? LeagueSeasons.cachedBest(leagueCache()) : null);
    // Náhled rámečku sezóny na mém obrázku (bez id, ať se nevezme můj vybraný rámeček)
    const framePreview = (frame, cls) => {
        const me = myProfile || { avatar: '🦉', color: 'emerald' };
        return avatarHtml({ avatar: me.avatar, color: me.color, owl: me.owl ? myOwlText() || me.owl : null, frame }, cls);
    };
    const seasonHelpers = () => ({ esc: escapeHtml, emblem: (league, cls) => leagueEmblem({ id: league }, cls), frameAvatar: framePreview });
    // Pruh sezóny pod kartou ligy (jen když databáze sezóny zná)
    const leagueSeasonStrip = () => (LeagueSeasons && leagueSeasons
        ? LeagueSeasons.stripHtml({ data: leagueSeasons, best: leagueBestNow(), rating: myRating ? myRating.rating : null, now: new Date() }, seasonHelpers()) : '');
    // Nový rámeček za skončenou sezónu: oslava „Nová odměna“ jednou (nejvyšší nový rámeček, ostatní v textu)
    const celebrateLeagueFrames = (fresh, cache) => {
        if (!fresh.length || !Look) return;
        const top = Look.find('frames', fresh[0].frame);
        if (!top) return;
        const when = cache.bestMonth && cache.best === fresh[0].league ? ` (${LeagueSeasons.monthLabel(cache.bestMonth)})` : '';
        const more = fresh.length - 1;
        // Doplňky za ligovou sezónu (look.js league, Pochodeň vítěze za Diamant) se odemknou se stejnou ligou
        const items = (Look.ACCESSORIES || []).filter(item => item.league && fresh.some(reward => reward.league === item.league));
        const extra = items.length ? ` a doplněk ${items.map(item => item.title).join(', ')}` : '';
        const place = items.length ? `${rewardPlace('frames')} a ${rewardPlace('accessories')}` : rewardPlace('frames');
        showCelebration('vitez', 'Nová odměna', `Rámeček ${top.title}${when}${more ? ` a ${more} další` : ''}${extra} – vyber si ${more || items.length ? 'je' : 'ho'} v ${place}`, 'badge',
            framePreview(top.id, 'h-16 w-16 text-3xl -my-1 ml-1'));
    };
    // Sezóny ze serveru (nejvýš jednou za 5 minut, force po ohodnocené výzvě): nejlepší liga se zapamatuje v zařízení (rámečky platí i bez připojení)
    let seasonsRender = null;
    const refreshLeagueSeasons = async (user, force = false) => {
        if (!LeagueSeasons || !Social || !Social.leagueSeasons || !user) return;
        // Uložené sezóny se ukážou hned (i bez připojení), čerstvé je pak přepíšou
        if (!leagueSeasons) { leagueSeasons = LeagueSeasons.cachedData(leagueCache(), user.id); if (leagueSeasons) paintChallenges(); }
        if (!force && leagueSeasonsAt && Date.now() - leagueSeasonsAt < 5 * 60 * 1000) return;
        leagueSeasonsAt = Date.now();
        let response;
        try { response = await Social.leagueSeasons(); } catch (error) { return; }
        if (!signedUser() || signedUser().id !== user.id) return;
        // Databáze sezóny nemá (starší schéma): nic se neukáže
        if (response === null) { leagueSeasons = null; paintChallenges(); return; }
        const { cache, fresh } = LeagueSeasons.adopt(leagueCache(), response, user.id);
        if (!cache.data) { leagueSeasons = null; paintChallenges(); return; }
        writeJson(LeagueSeasons.KEY, cache);
        leagueSeasons = cache.data;
        if (Look && Look.setLeagueBest) Look.setLeagueBest(cache.best);
        celebrateLeagueFrames(fresh, cache);
        paintChallenges();
        const overlay = document.getElementById('dialog-overlay');
        if (overlay && overlay.dataset.title === 'Ligové sezóny' && seasonsRender) seasonsRender();
    };
    // Moje vitrína ze serveru (nejvýš jednou za 5 minut)
    const loadMyShowcase = async (user, force = false) => {
        if (!Showcase || !Social || !Social.getShowcase || !user) return myShowcase;
        if (!force && myShowcaseAt && Date.now() - myShowcaseAt < 5 * 60 * 1000) return myShowcase;
        myShowcaseAt = Date.now();
        try {
            const list = await Social.getShowcase(user.id);
            if (signedUser() && signedUser().id === user.id && !showcaseBusy) myShowcase = list;
        } catch (error) { myShowcaseAt = 0; }
        return myShowcase;
    };
    // Diplom jako trofej: svitek a na něm ikona tématu
    const diplomaArt = (topic, cls) => `<span class="relative flex ${cls} shrink-0 items-center justify-center">${uiArt('diplom', 'h-full w-full')}<span class="absolute -bottom-1 -right-1 flex h-[58%] w-[58%] items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gold-300 dark:bg-slate-800 dark:ring-gold-700">${topicIcon(topic, 'h-[78%] w-[78%]', '', 'h-3 w-3')}</span></span>`;
    const showcaseHelpers = () => ({
        badge: (id) => BADGE_BY_ID[id] || null,
        medal: (badge, cls) => medalHtml(badge, true, cls, 'h-4 w-4'),
        topic: (id) => TOPIC_BY_ID[id] || null,
        diplomaTitle: (topic) => (Rewards ? Rewards.diplomaTitle(topic) : topic.title),
        diplomaArt,
        leagueName: (id) => (LeagueSeasons ? LeagueSeasons.leagueName(id) : ''),
        emblem: (league, cls) => leagueEmblem({ id: league }, cls),
        monthLabel: (month) => (LeagueSeasons ? LeagueSeasons.monthLabel(month) : month)
    });
    // Přepínač Vystavit (prázdný, když vitrína není: bez přihlášení, starší databáze, ještě nenačtená)
    const showcaseToggle = (entry, wide = false) => (Showcase && myShowcase && signedUser()
        ? Showcase.toggleHtml({ entry, on: myShowcase.includes(entry), count: myShowcase.length, busy: showcaseBusy, wide }) : '');
    // Vystavit / odebrat trofej: hned se ukáže, pak se uloží (server vrátí, co přijal); vrátí hlášku pro hráče
    const toggleShowcase = async (entry) => {
        const user = signedUser();
        if (!user || !Showcase || myShowcase === null || showcaseBusy) return '';
        const result = Showcase.toggle(myShowcase, entry);
        if (result.full) return `Vitrína je plná (${Showcase.MAX} z ${Showcase.MAX}). Nejdřív něco odeber v okně Vitrína (Nastavení → Profil).`;
        if (!result.changed) return '';
        const before = myShowcase;
        myShowcase = result.list;
        showcaseBusy = true;
        try {
            // Odznak musí být v účtu: nově získaný se tam nejdřív nahraje
            if (result.added && entry.startsWith('b:')) await syncProgress();
            const saved = await Social.saveShowcase(user.id, result.list);
            if (saved === null) { myShowcase = null; return 'Vitrína zatím není k dispozici (databáze potřebuje nejnovější schema.sql).'; }
            myShowcase = saved;
            myShowcaseAt = Date.now();
            if (result.added && !saved.includes(entry)) return 'Tuhle trofej server nepřijal. Zkus to za chvíli znovu.';
            return result.added ? 'Vystaveno ve tvém profilu.' : 'Odebráno z vitríny.';
        } catch (error) {
            myShowcase = before;
            return 'Uložení se nepodařilo. Zkontroluj připojení.';
        } finally {
            showcaseBusy = false;
        }
    };
    // Klepnutí na Vystavit v okně: překreslí se hned (vystaveno) i po uložení, ale jen dokud je to okno otevřené; hláška jako toast
    const onShowcaseToggle = async (button, rerender) => {
        const overlay = document.getElementById('dialog-overlay');
        const title = overlay ? overlay.dataset.title : '';
        const stillOpen = () => { const now = document.getElementById('dialog-overlay'); return Boolean(now && now.dataset.title === title); };
        const pending = toggleShowcase(button.dataset.showcaseToggle);
        rerender();
        const message = await pending;
        if (message) showToast(message);
        if (stillOpen()) rerender();
    };
    // Malý náhled vitríny v hlavičce Nastavení → Profil (jak mě vidí ostatní); klepnutí otevře okno Vitrína
    const showcaseMiniButton = () => {
        if (!Showcase || myShowcase === null) return '';
        return `<button type="button" data-open-showcase aria-label="Vitrína v profilu: ${myShowcase.length} ze ${Showcase.MAX} trofejí" title="Vitrína: trofeje, které uvidí ostatní" class="-my-2.5 flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-xl px-1 active:scale-95">${Showcase.miniHtml(myShowcase, showcaseHelpers())}</button>`;
    };
    // Okno Vitrína: moje tři místa (s Odebrat) a kde trofeje přidat (odznaky, diplomy, ligové sezóny)
    const openShowcase = async () => {
        const user = signedUser();
        if (!user || !Social || !Showcase) return;
        touchTip('showcase');
        let opened = false;
        let loading = myShowcase === null;
        const ROW = 'btn-3d-light flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-2xl bg-white px-2.5 py-1.5 text-left dark:bg-slate-800';
        const link = (go, art, title, text) => `<button type="button" data-showcase-go="${go}" class="${ROW}">${art}<span class="min-w-0 flex-1"><span class="block text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${title}</span><span class="block text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${text}</span></span><i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-400"></i></button>`;
        const render = () => {
            const overlay = document.getElementById('dialog-overlay');
            if (opened && !(overlay && overlay.dataset.title === 'Vitrína')) return;
            opened = true;
            const body = myShowcase === null
                ? `<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">${loading ? 'Načítám…' : 'Vitrína zatím není k dispozici (databáze potřebuje nejnovější schema.sql).'}</p>`
                : `<div class="flex flex-col gap-3" data-showcase-dialog>
                    <div class="flex items-center gap-3">${uiArt('vitrina', 'h-14 w-14 -my-1')}<p class="min-w-0 flex-1 text-[13px] leading-snug text-slate-600 dark:text-slate-300">Vyber až ${Showcase.MAX} trofeje, které uvidí ostatní ve tvém profilu. Přidáš je tlačítkem <b class="text-slate-800 dark:text-slate-100">Vystavit</b> u odznaku, diplomu nebo ligové sezóny.</p></div>
                    ${Showcase.tilesHtml(myShowcase, showcaseHelpers(), { remove: true, slots: true, label: 'Moje vitrína' })}
                    <div class="flex flex-col gap-1.5">
                        ${link('badges', '<i data-lucide="medal" class="h-6 w-6 shrink-0 text-gold-600"></i>', 'Odznaky', 'Vystavit jde nejvyšší získaný stupeň')}
                        ${Rewards ? link('diplomas', uiArt('diplom', 'h-7 w-7'), 'Diplomy', 'Za plné mistrovství tématu') : ''}
                        ${LeagueSeasons && leagueSeasons ? link('seasons', leagueEmblem({ id: leagueBestNow() || 'zlato' }, 'h-7 w-7'), 'Ligové sezóny', 'Vrchol skončeného měsíce') : ''}
                    </div>
                </div>`;
            showDialog('Vitrína', body, {
                onClick: async (event) => {
                    const go = event.target.closest('[data-showcase-go]');
                    if (go) { openChild('Zpět na Vitrínu', openShowcase, ({ badges: openBadges, diplomas: openDiplomas, seasons: openLeagueSeasons })[go.dataset.showcaseGo]); return; }
                    const remove = event.target.closest('[data-showcase-remove]');
                    if (!remove) return;
                    const pending = toggleShowcase(remove.dataset.showcaseRemove);
                    render();
                    const message = await pending;
                    if (message) showToast(message);
                    render();
                }
            });
            renderIcons(document.getElementById('dialog-overlay'));
        };
        render();
        await loadMyShowcase(user, loading);
        loading = false;
        render();
    };
    // Okno Ligové sezóny (z pruhu pod kartou ligy, z Jak fungují ligy a z Vitríny)
    let seasonPick = null;
    const openLeagueSeasons = async () => {
        touchTip('leagueSeasons');
        const user = signedUser();
        if (!user || !Social || !LeagueSeasons) { openLoginDialog(); return; }
        if (!leagueSeasons) leagueSeasons = LeagueSeasons.cachedData(leagueCache(), user.id);
        if (seasonPick && !(leagueSeasons && LeagueSeasons.seasonOf(leagueSeasons, seasonPick))) seasonPick = null;
        const render = () => {
            const showcase = Showcase && myShowcase && signedUser() ? { on: (entry) => myShowcase.includes(entry), toggle: (entry) => showcaseToggle(entry) } : null;
            const body = leagueSeasons
                ? LeagueSeasons.dialogHtml({ data: leagueSeasons, best: leagueBestNow(), rating: myRating ? myRating.rating : null, now: new Date(), selected: seasonPick, showcase }, seasonHelpers())
                : '<p class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>';
            showDialog('Ligové sezóny', `${body}
                <button type="button" data-league-help class="mt-1 flex short:mt-0 min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-black text-brand-700 dark:text-cream"><i data-lucide="info" class="h-4 w-4"></i> Jak fungují ligy a sezóny</button>`, {
                onClick: (event) => {
                    if (event.target.closest('[data-league-help]')) {
                        // Z nápovědy otevřené z této nápovědy jen zpět (bez nekonečné cesty tam a zpátky)
                        if (dialogTrail.length && dialogTrail[dialogTrail.length - 1].title === 'Jak fungují ligy') dialogBack();
                        else openChild('Zpět na Ligové sezóny', openLeagueSeasons, () => openLeagueHelp());
                        return;
                    }
                    const toggle = event.target.closest('[data-showcase-toggle]');
                    if (toggle) { onShowcaseToggle(toggle, render); return; }
                    const month = event.target.closest('[data-season-month]');
                    if (month && !month.disabled) { seasonPick = seasonPick === month.dataset.seasonMonth ? null : month.dataset.seasonMonth; render(); }
                }
            });
            renderIcons(document.getElementById('dialog-overlay'));
        };
        seasonsRender = render;
        render();
        await Promise.all([refreshLeagueSeasons(user), loadMyShowcase(user)]);
        const overlay = document.getElementById('dialog-overlay');
        if (overlay && overlay.dataset.title === 'Ligové sezóny') render();
    };
    // Přepínač nahoře na úvodní stránce: Jeden hráč (dnešní otázky a témata) / Více hráčů (výzvy); bez Supabase se nezobrazuje
    const homeTab = () => {
        if (!(Auth && Auth.isConfigured() && Social)) return 'single';
        const saved = readJson(KEYS.homeTab);
        return saved === 'multi' ? 'multi' : 'single';
    };
    // Pozvánky do výzev bez těch od hráčů, které jsem zablokoval (výzvy založené před blokem v databázi zůstávají)
    const visibleIncoming = () => (incomingList || []).filter(invite => !(myBlocks || []).some(row => invite.creator && row.id === invite.creator.id));
    const renderHomeTabs = () => {
        if (!(Auth && Auth.isConfigured() && Social)) return '';
        const tab = homeTab();
        const waiting = visibleIncoming().length;
        const option = (id, icon, label, badge = 0) => `
            <button type="button" role="tab" data-action="home-tab" data-tab="${id}" aria-selected="${tab === id}" class="relative flex flex-1 items-center justify-center gap-2 rounded-xl min-h-[2.75rem] px-3 text-[13px] font-black transition-colors ${tab === id ? 'btn-3d bg-brand-700 text-white' : 'text-slate-600 dark:text-slate-400'}">
                <i data-lucide="${icon}" class="h-4 w-4"></i> ${label}${badge ? `<span class="rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-brand-950">${badge}</span>` : ''}
            </button>`;
        return `<div id="home-tabs" role="tablist" class="flex shrink-0 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">${option('single', 'user-round', 'Jeden hráč')}${option('multi', 'users', 'Více hráčů', waiting)}</div>`;
    };
    // Rychlé akce: tři dlaždice (Vyzvat, Náhodný soupeř, Zadat kód) a pod nimi drobný čip s nastavením přijímaných výzev
    // Na nízkém displeji (short:) menší ikony a nižší dlaždice, ať se nad ohyb vejde i liga
    const QUICK_TILE = 'flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-[12px] font-black leading-tight short:min-h-[3.75rem] short:gap-0.5 short:py-1.5';
    // Kostky a klíč jsou vzdušnější kresby než meče u Vyzvat: obrázek je o kousek větší, místo zabere stejné (h-9, na nízkém displeji h-7)
    const QUICK_ART = 'h-11 w-11 -my-1 short:h-8 short:w-8 short:-my-0.5';
    const QUICK_LIGHT = 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/70 active:scale-95 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/70';
    const quickActions = () => `
        <div class="flex flex-col gap-1.5">
            <div class="grid grid-cols-3 gap-2">
                <button type="button" data-action="new-challenge" class="${QUICK_TILE} btn-3d bg-brand-700 text-white">${uiArt('vyzva', 'h-9 w-9 short:h-7 short:w-7')}Vyzvat</button>
                <button type="button" data-action="random-challenge" class="${QUICK_TILE} ${QUICK_LIGHT}">${uiArt('nahodny', QUICK_ART)}Náhodný soupeř</button>
                <button type="button" data-action="join-challenge" class="${QUICK_TILE} ${QUICK_LIGHT}">${uiArt('kod', QUICK_ART)}Zadat kód</button>
            </div>
            <div class="flex max-w-full items-center justify-center gap-1.5">
                ${GroupsUI ? GroupsUI.chip() : ''}
                <button type="button" data-action="open-accept" title="Změnit, z jakých témat přijímám výzvy" class="flex min-h-[2rem] min-w-0 max-w-full items-center gap-1.5 rounded-full bg-slate-200/60 px-3 py-1 text-[11.5px] font-bold text-slate-600 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300"><i data-lucide="shield-check" class="h-3.5 w-3.5 shrink-0 text-brand-700 dark:text-brand-300"></i><span class="min-w-0 truncate">Přijímám výzvy z: <b class="text-slate-800 dark:text-slate-100">${escapeHtml(acceptSummary())}</b></span><i data-lucide="pencil" class="h-3 w-3 shrink-0 text-brand-700 dark:text-cream"></i></button>
            </div>
        </div>`;
    // Poslední výzvy: jen tři nejnovější, Zobrazit vše rozbalí zbytek
    const recentSection = (incoming) => {
        const LABEL = 'px-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
        const seen = new Set();
        const rows = myChallenges === null ? [] : [...myChallenges, ...(recentExpanded ? recentOlder.rows : [])]
            .filter(row => !incoming.some(invite => invite.id === row.challenge_id) && !seen.has(row.challenge_id) && seen.add(row.challenge_id));
        const more = rows.length > 3 || (myChallenges || []).length >= 8;
        const toggle = more ? `<button type="button" data-action="recent-more" aria-expanded="${recentExpanded}" class="flex min-h-[2rem] items-center gap-1 rounded-lg px-1.5 text-[11px] font-black text-brand-700 active:scale-95 dark:text-cream">${recentExpanded ? 'Méně' : 'Zobrazit vše'}<i data-lucide="chevron-down" class="h-3.5 w-3.5 ${recentExpanded ? 'rotate-180' : ''}"></i></button>` : '';
        // Rozbalený seznam: na konci hlídka, která při dojetí dolů načte starší výzvy (a tlačítko pro případ, že posouvání nejde)
        const tail = !recentExpanded ? '' : recentOlder.done
            ? `<p data-recent-end class="px-1 py-1 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">${rows.length > 3 ? 'To jsou všechny tvoje výzvy.' : ''}</p>`
            : `<button type="button" data-action="recent-older" data-recent-sentinel class="flex min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-slate-500 dark:text-slate-400">${recentOlder.loading ? 'Načítám starší výzvy…' : recentOlder.error ? 'Starší výzvy se nepodařilo načíst. Zkusit znovu' : 'Načíst starší výzvy'}</button>`;
        const body = myChallenges === null
            ? '<p class="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Načítám výzvy…</p>'
            : rows.length ? `<div data-recent-list class="flex flex-col gap-1.5">${(recentExpanded ? rows : rows.slice(0, 3)).map(challengeRow).join('')}${tail}</div>`
                : `<div class="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700/70">${uiArt('sova-prazdna-posta', 'h-12 w-12 -my-1')}<p class="text-sm text-slate-600 dark:text-slate-300">Zatím žádné výzvy. Založ první tlačítkem Vyzvat.</p></div>`;
        return `<div class="flex flex-col gap-1"><div class="flex min-h-[2rem] items-center justify-between gap-2"><p class="${LABEL}">Poslední výzvy</p>${toggle}</div>${body}</div>`;
    };
    // První nezodpovězená otázka rozehrané výzvy (-1 = všechny zodpovězené)
    const challengeNextIndex = (c) => { for (let i = 0; i < c.count; i++) if (!(c.results || [])[i]) return i; return -1; };
    const resumeLabel = (c) => { const next = challengeNextIndex(c); return next < 0 ? 'Dokončit výzvu (odeslat výsledek)' : `Pokračovat ve výzvě (${next + 1}/${c.count})`; };
    // Rozehraná výzva přihlášeného hráče (cizí, rozehranou jiným účtem na tomtéž zařízení, ne)
    const ownChallengeInProgress = () => {
        const user = signedUser();
        return Boolean(user && challenge && !challenge.done && !challenge.tournament && (!challenge.owner || challenge.owner === user.id));
    };
    // Pokračuje se první nezodpovězenou otázkou: zodpovězená (aplikace se zavřela před „Další“, nebo ji zná server) se znovu nehraje, jinak by šla
    // po zobrazení správné odpovědi zodpovědět podruhé. Všechny zodpovězené: nic se nehraje znovu, výzva se rovnou odešle.
    let resumingChallenge = false;
    const continueChallenge = () => {
        if (!ownChallengeInProgress()) return;
        const next = challengeNextIndex(challenge);
        if (next < 0) { mode = 'challenge'; finishChallenge(); return; }
        startChallenge(challenge, next, challenge.results);
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
        const incoming = visibleIncoming();
        const resume = ownChallengeInProgress()
            ? `<button type="button" data-action="challenge-resume" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-gradient-to-b from-gold-400 to-gold-600 px-4 py-2.5 text-[15px] font-black text-brand-950"><i data-lucide="play" class="h-5 w-5"></i> ${resumeLabel(challenge)}</button>` : '';
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
        watchRecentEnd();
    };
    // Starší výzvy: další stránka od nejstarší načtené (podle času dohrání)
    const loadOlderChallenges = async () => {
        const user = signedUser();
        if (!user || !Social || !recentExpanded || recentOlder.loading || recentOlder.done || myChallenges === null) return;
        const all = [...myChallenges, ...recentOlder.rows];
        if (all.length < 8 && !recentOlder.rows.length) { recentOlder.done = true; paintChallenges(); return; }
        const oldest = all.reduce((min, row) => (!min || String(row.finished_at) < min ? String(row.finished_at) : min), '');
        recentOlder.loading = true;
        recentOlder.error = false;
        paintChallenges();
        try {
            const page = await Social.myChallenges(user.id, RECENT_PAGE, oldest);
            if (!signedUser() || signedUser().id !== user.id) return;
            recentOlder.rows = [...recentOlder.rows, ...page];
            if (page.length < RECENT_PAGE) recentOlder.done = true;
        } catch (error) {
            recentOlder.error = true;
        } finally {
            recentOlder.loading = false;
            paintChallenges();
        }
    };
    // Hlídka na konci rozbaleného seznamu: jakmile se při posouvání ukáže, načtou se starší výzvy
    const watchRecentEnd = () => {
        if (recentObserver) { recentObserver.disconnect(); recentObserver = null; }
        const sentinel = document.querySelector('#challenges-section [data-recent-sentinel]');
        if (!sentinel || recentOlder.loading || recentOlder.error || typeof IntersectionObserver === 'undefined') return;
        recentObserver = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) { recentObserver.disconnect(); recentObserver = null; loadOlderChallenges(); }
        }, { root: appContent, rootMargin: '0px 0px 200px 0px' });
        recentObserver.observe(sentinel);
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
            // Otázky, které se minule nepodařilo uložit (bez spojení), se uloží teď
            flushPendingSnapshots();
            myChallenges = mine;
            recentOlder = { rows: [], loading: false, done: false, error: false };
            myRating = rating;
            incomingList = incoming;
            paintChallenges();
            // Ligové sezóny a moje vitrína (schéma 18; starší databáze vrátí null a nic se neukáže)
            refreshLeagueSeasons(user);
            loadMyShowcase(user);
            // Přátelé a reakce až po hlavním obsahu (záložka se vykreslí dřív); poslední aktivita se zapíše nejvýš jednou za 5 minut
            if (Friends) Social.touchSeen().catch(() => {});
            if (GroupsUI) GroupsUI.refresh();
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
        </div>`, { onClick: (event) => { if (event.target.closest('[data-auth-login-dialog]')) startLogin(); } });

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
                    <button type="button" data-action="play-as-host" class="mt-1 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-800 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-100">Pokračovat bez přihlášení</button>
                    <p class="text-center text-xs text-slate-500 dark:text-slate-400">Hra funguje i bez účtu, jen bez profilu a výzev. Přihlásit se můžeš kdykoli později.</p>
                </div>
                <p class="mt-2 text-center text-xs text-slate-500 dark:text-slate-400"><a href="soukromi.html" class="inline-block rounded-lg px-1.5 py-3 font-bold underline underline-offset-2">Ochrana osobních údajů</a> · <a href="licence.html" class="inline-block rounded-lg px-1.5 py-3 font-bold underline underline-offset-2">Zdroje a licence</a></p>
            </div>`;
        renderIcons(appContent);
        updateControlsUI();
    };

    // Okna (profil, nová výzva, kód, detail výzvy): jedno společné. Nadpis se zavíráním je lepkavý: u dlouhého seznamu, který se posouvá,
    // zůstane vidět (lepkavé prvky uvnitř okna se proto lepí pod něj, top-11)
    let dialogHandler = null;
    let dialogSubmit = null;
    let dialogInput = null;
    // Cesta mezi okny: okno otevřené z jiného okna (openChild) si pamatuje, kam se vrátit. Křížek, Escape, Zpět na mobilu i tlačítko
    // „Zpět na …“ (data-dialog-back) vrátí do rodičovského okna (Vitrína, Můj postup, Nastavení…), klepnutí vedle okna zavře všechno.
    // Okno s vlastním krokem zpět uvnitř (detail v albu, cíl týdne…) ho označí data-x-back a křížek udělá nejdřív ten.
    // dialogTrail = [{ label, reopen, title, scroll }]: label tlačítka zpět, reopen otevře rodiče znovu (s čerstvými daty)
    let dialogTrail = [];
    let dialogNavigating = false;
    const closeDialog = () => {
        const overlay = document.getElementById('dialog-overlay');
        if (overlay) overlay.remove();
        dialogHandler = null;
        dialogSubmit = null;
        dialogInput = null;
        if (!dialogNavigating) dialogTrail = [];
    };
    const openChild = (label, reopen, open) => {
        const overlay = document.getElementById('dialog-overlay');
        const entry = { label, reopen, title: overlay ? overlay.dataset.title : '', scroll: overlay && overlay.firstElementChild ? overlay.firstElementChild.scrollTop : 0 };
        const before = dialogTrail;
        const trail = [...before, entry];
        dialogNavigating = true;
        try { dialogTrail = trail; open(); } finally { dialogNavigating = false; }
        // Okno se neotevřelo (chybí modul, přihlášení, místo okna přišla truhla): cesta zůstane, jak byla
        const after = document.getElementById('dialog-overlay');
        dialogTrail = after && after.dataset.title !== entry.title ? trail : (after ? before : []);
    };
    const dialogBack = () => {
        const entry = dialogTrail[dialogTrail.length - 1];
        if (!entry) { closeDialog(); return; }
        const rest = dialogTrail.slice(0, -1);
        dialogNavigating = true;
        try { dialogTrail = rest; entry.reopen(); } finally { dialogNavigating = false; }
        dialogTrail = rest;
        const overlay = document.getElementById('dialog-overlay');
        if (overlay && entry.scroll && overlay.dataset.title === entry.title) overlay.firstElementChild.scrollTop = entry.scroll;
    };
    // Křížek (a Escape, Zpět na mobilu): nejdřív krok zpět uvnitř okna, pak do rodičovského okna, jinak zavřít
    const dialogStepBack = () => {
        const overlay = document.getElementById('dialog-overlay');
        const local = overlay && overlay.querySelector('[data-x-back]');
        if (local) local.click();
        else dialogBack();
    };
    // Tlačítko zpět do rodičovského okna; bez rodiče nic (okno se zavírá křížkem)
    const backLabel = () => (dialogTrail.length ? dialogTrail[dialogTrail.length - 1].label : '');
    const dialogBackButton = (extra = '') => (dialogTrail.length ? `<button type="button" data-dialog-back class="${SECONDARY_BUTTON} !py-2.5 text-sm ${extra}"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(backLabel())}</button>` : '');
    // aside = drobný údaj v záhlaví vedle nadpisu (Můj postup: celkové XP)
    const showDialog = (title, body, { onClick = null, onSubmit = null, onInput = null, aside = '' } = {}) => {
        closeChooser();
        closeSettings();
        let overlay = document.getElementById('dialog-overlay');
        const created = !overlay;
        if (!overlay) {
            if (!dialogNavigating) dialogTrail = [];
            overlay = document.createElement('div');
            overlay.id = 'dialog-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'dialog-title');
            overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) { closeDialog(); return; }
                if (event.target.closest('[data-close]')) { dialogStepBack(); return; }
                if (event.target.closest('[data-dialog-back]')) { dialogBack(); return; }
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
                <div data-dialog-head class="sticky -top-5 z-20 -mx-5 -mt-5 mb-2 flex items-center justify-between bg-slate-50 px-5 pb-2 pt-5 dark:bg-slate-900">
                    <h2 id="dialog-title" class="text-lg font-black text-slate-800 dark:text-slate-100">${escapeHtml(title)}</h2>
                    ${aside ? `<span class="ml-auto mr-1 shrink-0">${aside}</span>` : ''}
                    <button type="button" data-close aria-label="Zavřít" class="-m-0.5 rounded-xl p-2.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
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
                if (stillOpen()) openQuestionReports();
            }
        });
        // Zavřené okno se po pozdní odpovědi znovu neotevře
        const stillOpen = () => { const overlay = document.getElementById('dialog-overlay'); return Boolean(overlay && overlay.dataset.title === 'Hlášení otázek'); };
        draw('<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">Načítám hlášení…</p>');
        let rows;
        try { rows = await Social.getQuestionReports(100); } catch (error) {
            if (stillOpen()) draw(DIALOG_NOTE(error.status === 401 || error.status === 403 ? 'Tenhle účet není v dev_admins (návod v docs/SUPABASE.md).' : (error.message || 'Hlášení se nepodařilo načíst.')));
            return;
        }
        if (!stillOpen()) return;
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

    // --- Jak odpověděli ostatní (answer-stats.js): souhrny odpovědí ostatních hráčů, fronta vlastních odpovědí a kalibrace losování ---
    // Sbírá se jen od přihlášených hráčů. Souhrn tématu se stáhne nejvýš jednou denně při načtení tématu (jedno volání na téma, nic na něj
    // nečeká) a řádek po odpovědi i kalibrace ho čtou synchronně ze zařízení; bez sítě, účtu nebo souhrnu se nic neukazuje.
    const AnswerStats = window.MudrlantAnswerStats || null;
    const statsUser = () => (AnswerStats && Auth && Auth.isConfigured() && Social ? signedUser() : null);
    const statsStorage = () => reportStorage();
    const refreshAnswerStats = (topicId) => {
        if (!statsUser() || navigator.onLine === false) return;
        AnswerStats.refresh(topicId, { storage: statsStorage(), fetchRows: (topic) => Social.answerStatsTopic(topic) }).catch(() => {});
    };
    const answerStatsIndex = (topicId) => (AnswerStats ? AnswerStats.topicIndex(statsStorage(), topicId) : null);
    const answerStatsWeigher = (topicId) => (AnswerStats ? AnswerStats.weigher(answerStatsIndex(topicId), { level: levelProgress(loadProgress().xp).level }) : null);
    // Řádek pod verdiktem („Správně odpovědělo 23 % hráčů“); jen z aspoň 20 odpovědí a jen se sítí
    const answerStatsLine = (data, tone) => {
        if (!AnswerStats || !round || navigator.onLine === false) return '';
        const stat = AnswerStats.statFor(answerStatsIndex(data.topic), data.id, data.question.type, round.variant);
        const text = AnswerStats.lineFor(stat, round.variant);
        return text ? `<p data-answer-stats title="${escapeHtml(AnswerStats.sampleText(stat))}" class="mt-0.5 flex items-center gap-1 text-xs font-semibold leading-tight ${tone}"><i data-lucide="users" class="h-3.5 w-3.5 shrink-0"></i><span class="truncate">${escapeHtml(text)}</span></p>` : '';
    };
    // Odpověď do fronty: bez opakování karet a procvičování chyb (odpověď už hráč viděl) a bez dnešní otázky zodpovězené podruhé
    const recordAnswerStat = ({ correct, answerRef, gaveUp }) => {
        const user = statsUser();
        if (!user || !current || !round) return;
        if (mode === 'practice' && (pool.kind === 'review' || pool.kind === 'mistakes')) return;
        if (mode === 'daily' && round.dailyFirst === false) return;
        // Seřaď se ptá na čtyři položky naráz: žádná z nich otázku sama neurčuje (Odhadni číslo patří jedné položce, ten se zapíše)
        if (isNumeric(current) && current.numeric.kind === 'order') return;
        const waiting = AnswerStats.record(statsStorage(), user.id, { topic: current.topic, itemId: current.id, kind: current.question.type, variant: round.variant,
            correct, wrongId: !correct && !gaveUp && answerRef ? answerRef.id : null });
        // Dlouhý trénink: plná dávka se pošle hned (jinak až po hře)
        if (waiting >= AnswerStats.BATCH_MAX) flushAnswerStats();
    };
    // Odeslání po dohrané hře (návrat domů nebo do učení, konec výzvy či zápasu): jedna dávka = jedno volání databáze
    const flushAnswerStats = () => {
        const user = statsUser();
        if (!user || navigator.onLine === false) return;
        AnswerStats.flush({ user: user.id, send: (answers) => Social.submitAnswerStats(answers), storage: statsStorage() }).catch(() => {});
    };
    // Dev panel: Podezřelé otázky (databáze je pustí jen účtu v dev_admins); názvy položek a možností se doplní z dat témat
    const SUSPICIOUS_TITLE = 'Podezřelé otázky';
    const openSuspiciousQuestions = async () => {
        if (!statsUser()) { showToast('Podezřelé otázky vidí přihlášený účet z dev_admins.'); return; }
        const stillOpen = () => { const overlay = document.getElementById('dialog-overlay'); return Boolean(overlay && overlay.dataset.title === SUSPICIOUS_TITLE); };
        const onClick = (event) => {
            const button = event.target.closest('[data-suspicious-item]');
            if (button) openItemInfo(button.dataset.topic, button.dataset.id);
        };
        showDialog(SUSPICIOUS_TITLE, '<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">Načítám statistiky…</p>', { onClick });
        let rows;
        try { rows = AnswerStats.cleanSuspicious(await Social.devSuspiciousQuestions()); } catch (error) {
            if (stillOpen()) showDialog(SUSPICIOUS_TITLE, DIALOG_NOTE(error.message || 'Statistiky se nepodařilo načíst.'), { onClick });
            return;
        }
        const contexts = new Map();
        await Promise.all([...new Set(rows.map(row => row.topic))].filter(id => TOPIC_BY_ID[id]).map(id => loadTopic(id).then(ctx => { contexts.set(id, ctx); }).catch(() => {})));
        if (!stillOpen()) return;
        const lookupIn = (topicId) => (id) => {
            const ctx = contexts.get(topicId);
            const item = ctx && ctx.byId.get(id);
            return item ? item.n : (ctx && ctx.countries && Object.prototype.hasOwnProperty.call(ctx.countries, id) ? ctx.countries[id].name : null);
        };
        const intro = `<p class="mb-2 text-xs text-slate-500 dark:text-slate-400">Úspěšnost pod 25 % z aspoň 50 odpovědí výběrem z možností, nebo nesprávná možnost, kterou hráči volí častěji než správnou. Bez údajů o hráčích.</p>`;
        showDialog(SUSPICIOUS_TITLE, intro + (rows.length ? `<ul id="suspicious-list" class="flex flex-col gap-2">${rows.map(row => {
            const lookup = lookupIn(row.topic);
            const name = lookup(row.itemId);
            const wrong = row.topWrong ? AnswerStats.optionLabel(row.topWrong, lookup) : '';
            return `
            <li data-suspicious="${escapeHtml(`${row.topic}:${row.itemId}:${row.kind}:${row.variant}`)}" class="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                <p class="flex flex-wrap items-center gap-x-2 text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300"><span>${escapeHtml(AnswerStats.REASONS[row.reason])}</span><span class="font-bold normal-case tracking-normal text-slate-500 dark:text-slate-400">${escapeHtml(TOPIC_BY_ID[row.topic] ? TOPIC_BY_ID[row.topic].title : row.topic)} · ${escapeHtml(AnswerStats.kindLabel(row.kind))} · ${row.variant === 'typed' ? 'psaní' : 'možnosti'}</span></p>
                <p class="mt-1 font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(name || row.itemId)}${name ? ` <span class="text-xs font-normal text-slate-500 dark:text-slate-400">${escapeHtml(row.itemId)}</span>` : ''}</p>
                <div class="mt-1 flex items-end justify-between gap-2">
                    <p class="min-w-0 text-[13px] text-slate-700 dark:text-slate-200"><b>${AnswerStats.percentOf(row.correct, row.shown)}&nbsp;%</b> správně z&nbsp;${row.shown}${wrong ? `<br>Nejčastější chyba: <b>${escapeHtml(wrong)}</b> <span class="whitespace-nowrap">(${AnswerStats.percentOf(row.topWrongCount, row.shown)}&nbsp;%)</span>` : ''}</p>
                    ${contexts.has(row.topic) && name ? `<button type="button" data-suspicious-item data-topic="${escapeHtml(row.topic)}" data-id="${escapeHtml(row.itemId)}" class="flex min-h-[2.25rem] shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-100"><i data-lucide="info" class="h-3.5 w-3.5"></i> Detail</button>` : ''}
                </div>
            </li>`;
        }).join('')}</ul>` : '<p id="suspicious-list" class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">Zatím žádné podezřelé otázky.</p>'), { onClick });
    };

    // Profil: jméno, emoji a barva obrázku
    // Vlastní profil se upravuje v okně Nastavení (záložka Profil)
    const openProfile = () => openSettings('', null, 'profile');

    // Nová výzva: komu (konkrétní hráč / náhodný / odkaz), téma (i víc témat), počet otázek a nastavení. Téma a nastavení jsou
    // souhrnné řádky, které se rozbalí klepnutím; tlačítko Vytvořit a hrát je stále dole na očích.
    // preset = { opponent, last }: výzva se předvyplní nastavením z poslední hry s tímto hráčem (úprava před odvetou); { who: 'random' }: rovnou náhodný soupeř
    // Proč se výzva nezaložila: hláška databáze (česky: soupeř nepřijímá téma, blok mezi hráči), jinak výpadek spojení
    const challengeErrorText = (error) => {
        const message = String((error && error.message) || '');
        if (error && error.status === 400 && /nepřijímá/.test(message)) return 'Tenhle hráč mezitím vypnul některé z vybraných témat. Zkus jiné.';
        if (error && error.status >= 400 && error.status < 500 && /[ěščřžýáíéúůďťň]/i.test(message)) return message;
        return 'Výzvu se nepodařilo založit. Zkontroluj připojení a zkus to znovu.';
    };
    let newChallengeToken = 0;
    // Náhodný soupeř se nenašel: místo červené hlášky sova s dalekohledem, která hráče vyhlíží
    const NO_RANDOM_OPPONENT = { all: 'Zatím tu nejsou žádní jiní hráči. Zkus „Kamaráda přes odkaz“.', topics: 'Nikdo, kdo přijímá tato témata, teď není k dispozici. Zkus jiné téma nebo „Kamaráda přes odkaz“.' };
    const lookoutNote = (text) => `<div data-no-opponent class="mt-2 flex items-center gap-2.5" role="status">${uiArt('sova-dalekohled', 'h-14 w-14 -my-1')}<p class="min-w-0 text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(text)}</p></div>`;
    const openNewChallenge = (preset = null) => {
        if (!signedUser()) return;
        // group = výzva skupině (groups.js): výzva pro kohokoli s kódem, kterou server připojí ke skupině
        const draft = { topics: [], count: 10, who: 'player', opponent: null, blocked: null, mixOk: true, query: '', found: null, level: 1, variant: 'choices', cats: null, open: null, group: null };
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
        const settingsSummary = () => [LEVEL_TIERS[draft.level].title, draft.variant === 'typed' ? 'Psaní' : 'Možnosti'].join(' · ');
        const chip = (attr, value, active, content) => `<button type="button" ${attr}="${escapeHtml(String(value))}" aria-pressed="${active}" class="min-w-0 rounded-xl border-2 px-2 py-1.5 text-[13px] font-bold leading-tight active:scale-[0.98] ${active ? 'border-brand-600 bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100' : 'border-transparent bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">${content}</button>`;
        const LABEL = 'text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
        const foundRows = () => {
            // Prázdné pole nic nepíše (radí zástupný text), rada o dvou znacích až po prvním písmenu
            if (draft.found === null) return draft.query.trim().length >= 2 ? '<p class="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Hledám…</p>' : draft.query.trim() ? '<p class="px-1 text-xs text-slate-500 dark:text-slate-400">Napiš aspoň 2 znaky přezdívky.</p>' : '';
            if (!draft.found.length) return `<div class="flex items-center gap-2.5 px-1">${uiArt('sova-dalekohled', 'h-12 w-12')}<p class="min-w-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Žádný takový hráč. Zkus jinou přezdívku.</p></div>`;
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
            return `${quick}<input id="opp-search" type="text" maxlength="24" autocomplete="off" placeholder="${quick ? 'Nebo začni psát přezdívku hráče' : 'Začni psát přezdívku hráče'}" value="${escapeHtml(draft.query)}" class="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base font-bold text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"><div id="opp-results" class="mt-2 flex flex-col gap-1.5 empty:mt-0">${foundRows()}</div>`;
        };
        // Tři jasně odlišené možnosti: konkrétní hráč (výchozí), náhodný hráč, odkaz pro kohokoli
        const whoCard = (id, icon, title, text) => {
            const active = draft.who === id;
            return `
                <div>
                    <button type="button" data-ch-who="${id}" role="radio" aria-checked="${active}" class="flex min-h-[2.75rem] w-full items-center gap-3 rounded-2xl border-2 px-3 py-1.5 text-left active:scale-[0.99] ${active ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-transparent bg-white dark:bg-slate-800'}">
                        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full short:h-7 short:w-7 ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}"><i data-lucide="${icon}" class="h-[1.125rem] w-[1.125rem]"></i></span>
                        <span class="min-w-0 flex-1"><span class="block text-[14px] font-black leading-tight text-slate-800 dark:text-slate-100">${title}</span><span class="block truncate text-[11px] text-slate-500 dark:text-slate-400${active ? '' : ' short:hidden'}">${text}</span></span>
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
                    <button type="button" data-ch-open="${id}" aria-expanded="${open}" class="flex w-full items-center gap-3 px-3 py-2 text-left short:py-1.5">
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
                ${cats.length > 1 ? `<div class="mb-1.5 mt-3 flex items-center justify-between gap-2"><p class="${LABEL}">Okruh</p><span class="flex gap-1"><button type="button" data-ch-cats="all" class="rounded-lg px-2 py-1.5 text-xs font-bold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">Vybrat vše</button><button type="button" data-ch-cats="none" class="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 underline-offset-2 hover:underline dark:text-slate-400">Zrušit vše</button></span></div><div class="flex flex-wrap gap-1.5">${cats.map(category => chip('data-ch-cat', category.key, chosen.includes(category.key), `<span class="flex items-center gap-1.5"><i data-lucide="${chosen.includes(category.key) ? 'check' : 'plus'}" class="h-3.5 w-3.5"></i>${escapeHtml(category.label)}</span>`)).join('')}</div>` : ''}`;
        };
        const settingsBody = () => `
            <p class="${LABEL} mb-1.5">Obtížnost</p>
            <div class="mb-3 grid grid-cols-3 gap-1.5">${[1, 2, 3].map(level => chip('data-ch-level', level, draft.level === level, `${LEVEL_TIERS[level].short}<span class="block text-[11px] font-semibold opacity-70">${TIER_BRIEF[LEVEL_TIERS[level].key]}</span>`)).join('')}</div>
            <p class="${LABEL} mb-1.5">Odpovídání (pro všechny stejně)</p>
            <div class="grid grid-cols-2 gap-1.5">${chip('data-ch-variant', 'choices', draft.variant === 'choices', 'Možnosti<span class="block text-[11px] font-semibold opacity-70">vybíráš ze 4</span>')}${chip('data-ch-variant', 'typed', draft.variant === 'typed', 'Psaní<span class="block text-[11px] font-semibold opacity-70">dvojnásobek bodů</span>')}</div>`;
        // Pozdní odpovědi (přijímaná témata soupeře, chyba založení) překreslí okno, jen když je pořád otevřené
        const token = ++newChallengeToken;
        let opened = false;
        const render = () => {
            const overlay = document.getElementById('dialog-overlay');
            if (opened && !(token === newChallengeToken && overlay && overlay.dataset.title === 'Nová výzva')) return;
            opened = true;
            draw();
        };
        const draw = () => showDialog('Nová výzva', `
            <div class="flex flex-col gap-2.5 short:gap-2">
                ${draft.group ? `<div data-ch-group class="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm ring-2 ring-brand-600 dark:bg-slate-800"><span aria-hidden="true" class="text-2xl">${escapeHtml(draft.group.icon)}</span><span class="min-w-0 flex-1"><span class="block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Výzva skupině</span><span class="block truncate text-[14px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(draft.group.name)}</span></span></div>` : `
                <div role="radiogroup" aria-label="Koho vyzvat" class="flex flex-col gap-1.5">
                    <p class="${LABEL} short:hidden">Koho vyzvat</p>
                    ${whoCard('player', 'user-round', 'Konkrétního hráče', 'Najdeš ho podle přezdívky')}
                    ${whoCard('random', 'shuffle', 'Náhodného hráče', 'Soupeře vybereme za tebe')}
                    ${whoCard('anyone', 'share-2', 'Kamaráda přes odkaz', 'Pošleš odkaz nebo kód komukoli')}
                </div>`}
                ${accordion('topics', challengeTopicIcon(topicValue()), 'Téma', topicSummary(), topicBody())}
                <div class="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm dark:bg-slate-800/70">
                    <i data-lucide="hash" class="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400"></i>
                    <span class="min-w-0 flex-1 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Počet otázek</span>
                    <div class="grid grid-cols-3 gap-1">${Social.COUNTS.map(count => chip('data-ch-count', count, draft.count === count, `<span class="px-1.5 font-black">${count}</span>`)).join('')}</div>
                </div>
                ${accordion('settings', 'pencil', 'Nastavení', settingsSummary(), settingsBody())}
                <div class="sticky -bottom-5 -mx-5 mt-1 bg-slate-50/95 px-5 pb-5 pt-3 backdrop-blur short:pt-2 dark:bg-slate-900/95">
                    <button type="button" data-ch-create ${busy ? 'disabled' : ''} class="${PRIMARY_BUTTON} short:py-2.5">${uiArt('vyzva', 'h-7 w-7')} ${busy ? 'Zakládám…' : 'Vytvořit a hrát'}</button>
                    ${note ? (Object.values(NO_RANDOM_OPPONENT).includes(note) ? lookoutNote(note) : DIALOG_NOTE(note)) : ''}
                </div>
            </div>`, {
            onClick: async (event) => {
                const open = event.target.closest('[data-ch-open]');
                const topic = event.target.closest('[data-ch-topic]');
                const count = event.target.closest('[data-ch-count]');
                const who = event.target.closest('[data-ch-who]');
                const pick = event.target.closest('[data-pick-opp]');
                const category = event.target.closest('[data-ch-cat]');
                const hard = event.target.closest('[data-ch-level]');
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
                    // Po „Zrušit vše“ se dá začít od nuly; prázdný výběr ale výzvu nezaloží (hláška u tlačítka)
                    draft.cats = chosen.includes(key) ? chosen.filter(other => other !== key) : [...chosen, key];
                    render();
                }
                const allCats = event.target.closest('[data-ch-cats]');
                if (allCats) { draft.cats = allCats.dataset.chCats === 'all' ? null : []; note = ''; render(); }
                if (hard) { draft.level = Number(hard.dataset.chLevel) || 1; render(); }
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
                if (event.target.closest('[data-ch-create]') && !busy && draft.topics.length === 1 && Array.isArray(draft.cats) && !draft.cats.length) {
                    note = 'Vyber aspoň jeden okruh.';
                    render();
                    return;
                }
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
                            if (!opponent) { busy = false; note = explicit.length ? NO_RANDOM_OPPONENT.topics : NO_RANDOM_OPPONENT.all; render(); return; }
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
                        const created = await Social.createChallenge(signedUser().id, { topic: resolved.value, count: draft.count, invitedId: opponent ? opponent.id : null, includeHard: draft.level >= 2, level: draft.level, categories: cats, variant: draft.variant });
                        // Výzva skupině: připojí se ke skupině (členové ji uvidí v detailu skupiny); když to nevyjde, hraje se jako výzva přes odkaz
                        if (draft.group) await Social.groupSetChallenge(draft.group.id, created.id).catch(error => showToast(error && error.message ? error.message : 'Výzvu se nepodařilo poslat skupině.'));
                        closeDialog();
                        await loadMyProfile();
                        startChallenge({ ...created, creator: myProfile, invited: opponent, group: draft.group || null, fresh: true }, 0, []);
                    } catch (error) {
                        busy = false;
                        note = challengeErrorText(error);
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
        if (preset && preset.group) { draft.who = 'anyone'; draft.group = preset.group; }
        if (preset && preset.opponent) {
            const last = preset.last;
            if (last) {
                draft.topics = last.topic === 'mix' ? [] : challengeTopicIds(last.topic);
                draft.count = Social.COUNTS.includes(last.count) ? last.count : draft.count;
                draft.level = challengeLevel(last);
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
                ${uiArt('kod', 'mx-auto -my-1 h-14 w-14')}
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

    // Místo v pořadí: hráči se stejným počtem správných i bodů ho sdílejí (při remíze mají pohár oba)
    const rankingPlace = (rows, row) => 1 + rows.filter(other => compareResults(other, row) > 0).length;
    const rankingRows = (rows, count, meId) => rows.map((row) => `
        <li class="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800 ${row.user_id === meId ? 'ring-2 ring-brand-600' : ''}">
            <span data-place="${rankingPlace(rows, row)}" class="w-5 text-center text-sm font-black text-slate-500 dark:text-slate-400">${rankingPlace(rows, row) === 1 ? '🏆' : rankingPlace(rows, row)}</span>
            ${avatarHtml(row.player, 'h-9 w-9 text-lg', true)}
            <span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${escapeHtml(playerName(row.player))}${row.user_id === meId ? ' (ty)' : ''}</span>
            <span class="text-right"><span class="block text-base font-black text-slate-800 dark:text-slate-100">${escapeHtml(formatPoints(row.points))}</span><span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">${row.correct}/${count} správně</span></span>
        </li>`).join('');
    // Výzvu zatím nikdo nehrál: sova s kapesními hodinkami trpělivě čeká
    const NOBODY_PLAYED = `<div data-nobody-played class="flex items-center gap-3">${uiArt('sova-ceka', 'h-16 w-16 -my-1')}<p class="min-w-0 text-sm font-semibold text-slate-500 dark:text-slate-400">Zatím nikdo nehrál.</p></div>`;
    // Výzva, kterou hráč ještě nedohrál: u ostatních jen „dohráno“ / „ještě nehrál“, bez bodů, správných odpovědí, poháru a pořadí podle výsledku
    // (seřazené podle času dohrání), ať výsledek soupeře neovlivní hru ani taktiku. Výsledky se ukážou, až výzvu dohraje (rankingRows).
    const waitingPlayers = (def, results, meId) => {
        const done = [...results].filter(row => row.user_id !== meId).sort((a, b) => String(a.finished_at || '').localeCompare(String(b.finished_at || '')))
            .map(row => ({ id: row.user_id, player: row.player, done: true }));
        const waiting = [def.creator, def.invited].filter(player => player && player.id && player.id !== meId && !done.some(row => row.id === player.id))
            .filter((player, index, list) => list.findIndex(other => other.id === player.id) === index).map(player => ({ id: player.id, player, done: false }));
        const rows = [...done, ...waiting];
        if (!rows.length) return NOBODY_PLAYED;
        return `<ol data-ch-waiting class="flex flex-col gap-1.5">${rows.map(row => `
            <li data-ch-player="${escapeHtml(row.id)}" data-ch-state="${row.done ? 'done' : 'waiting'}" class="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800">
                ${avatarHtml(row.player, 'h-9 w-9 text-lg', true)}
                <span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">${escapeHtml(playerName(row.player))}</span>
                <span class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${row.done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">${row.done ? 'dohráno' : 'ještě nehrál'}</span>
            </li>`).join('')}</ol>
            ${done.length ? '<p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Výsledky ostatních uvidíš, až výzvu dohraješ.</p>' : ''}`;
    };

    // Odznak jako medaile ve stylu hry: získaný zlatý nebo vínový se ikonou, nezískaný šedý
    const MEDAL_TONES = {
        bronze: 'bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 ring-amber-300',
        silver: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 ring-white',
        gold: 'bg-gradient-to-br from-gold-300 to-gold-600 text-brand-950 ring-cream',
        brand: 'bg-gradient-to-br from-brand-500 to-brand-800 text-gold-200 ring-gold-400',
        diamond: 'bg-gradient-to-br from-sky-300 to-indigo-500 text-white ring-cyan-100'
    };
    // Skupiny odznaků s ilustrovaným symbolem (branding/ikony/odznak-<skupina>.png → scripts/topic-icons.py; stejný seznam má sw.js)
    const BADGE_ART = new Set(['sberatel', 'odpovedi', 'rada', 'serie', 'dny', 'dokonale', 'dnes', 'bez-napovedy', 'psani', 'tezke', 'chyby', 'vyzvy', 'vyhry',
        'vyhry-v-rade', 'zalozene', 'perfektni-vyzvy', 'uroven', 'poznane', 'vsestrannost', 'hvezdy', 'vsechna-temata', 'turnaje', 'turnaj-postupy',
        'tydenni-cile', 'kviz-dne', 'kviz-serie', 'kviz-perfekt', 'bleskovka', 'preziti', 'mapa', 'odhad', 'serad', 'detektiv']);
    // Obrázek symbolu skupiny (bez přípony); odznaky alba sbírky mají obrázek Sběratel (Album.BADGE_ART)
    const badgeArtOf = (group) => BADGE_ART.has(group) ? `odznak-${group}` : Album && Album.isAlbumGroup(BADGE_GROUPS.find(entry => entry.id === group)) ? Album.BADGE_ART : null;
    // Nezískaný odznak ukazuje svou ikonu zašedlou a ztlumenou, přes ni malý zámek v rohu
    const medalHtml = (badge, earned, size = 'h-11 w-11', iconSize = 'h-5 w-5') => {
        const dim = earned ? '' : ' opacity-50 grayscale';
        // Symbol odznaku: ikona tématu, ilustrace skupiny (icons/topics/odznak-<skupina>.webp), jinak čárová ikona
        const art = badge.topic && topicArt({ id: badge.topic })
            ? `<img src="icons/topics/${badge.topic}.webp" alt="" class="h-[72%] w-[72%] object-contain${dim}">`
            : badgeArtOf(badge.group)
                ? `<img src="icons/topics/${badgeArtOf(badge.group)}.webp" alt="" data-badge-art class="h-[74%] w-[74%] object-contain drop-shadow-sm${dim}">`
                : `<i data-lucide="${badge.icon}" class="${iconSize}${dim}"></i>`;
        const lock = earned ? '' : '<span class="absolute -bottom-0.5 -right-0.5 flex h-[46%] w-[46%] items-center justify-center rounded-full bg-slate-600 text-white ring-1 ring-white dark:bg-slate-300 dark:text-slate-900 dark:ring-slate-800" data-medal-lock><i data-lucide="lock" class="h-[62%] w-[62%]"></i></span>';
        return `<span class="relative flex ${size} shrink-0 items-center justify-center rounded-full ring-2 ${earned
            ? (MEDAL_TONES[badge.tone] || MEDAL_TONES.gold)
            : 'bg-slate-200 text-slate-500 ring-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-600'} shadow-sm">${art}${lock}</span>`;
    };
    // Co hráč za odznak dostane: „Odměna: Kompas (doplněk Mudrlanta)“; odznak jen pro slávu odměnu neuvádí (prázdný text)
    const badgeReward = (badge) => Look ? Look.badgeRewardText(badge.id) : '';
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
    // Tlačítko Zpět dole v dlouhém seznamu (odznaky, úrovně): lepkavé, při posouvání zůstane vidět
    // Tlačítko zpět do okna, odkud hráč přišel (Můj postup, Vitrína…), přilepené dole; bez rodičovského okna nic
    const STICKY_BACK = () => (dialogTrail.length ? `<div class="sticky -bottom-5 z-10 -mx-5 -mb-5 bg-slate-50 px-5 pb-5 pt-2 dark:bg-slate-900">${dialogBackButton()}</div>` : '');
    // Vitrína (schéma 18): u získaného odznaku přepínač Vystavit; vystavit jde nejvyšší získaný stupeň skupiny (ten je v účtu), u nižšího jen věta
    const showcaseBadge = (badge, progress) => {
        if (!progress.badges[badge.id] || !Showcase || myShowcase === null || !signedUser()) return '';
        if (!compactBadges(BADGES.filter(item => progress.badges[item.id]).map(item => item.id)).includes(badge.id)) return '<p class="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Do vitríny v profilu jde vystavit nejvyšší získaný stupeň.</p>';
        return `<div class="mt-1.5">${showcaseToggle(Showcase.badge(badge.id))}</div>`;
    };
    // Všechny odznaky po skupinách: řada medailí (získané barevné, další šedé), klepnutím na medaili podrobnosti
    const openBadges = () => {
        let selected = null;
        const user = signedUser();
        if (user && myShowcase === null) loadMyShowcase(user).then(() => { const overlay = document.getElementById('dialog-overlay'); if (overlay && overlay.dataset.title === 'Odznaky' && selected) render(); });
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
                    ${badgeReward(detail) ? `<p class="mt-0.5 text-[11px] font-bold leading-snug text-gold-800 dark:text-gold-300" data-badge-reward>${escapeHtml(badgeReward(detail))}</p>` : ''}${earned && compactBadges(BADGES.filter(badge => progress.badges[badge.id]).map(badge => badge.id)).includes(detail.id) ? '<p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">Můžeš ho mít jako titul u svého jména (Nastavení → Profil).</p>' : ''}
                    <p class="mt-0.5 text-[11px] font-bold ${earned ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}">${earned ? 'Získáno' : `${value} / ${detail.goal}`}</p>${earned ? '' : goalBar(value / detail.goal)}${showcaseBadge(detail, progress)}</div></div>`;
            })() : '<p class="text-center text-xs text-slate-500 dark:text-slate-400">Klepni na medaili a uvidíš, jak ji získat.</p>';
            const sections = BADGE_GROUPS.map(group => {
                const earned = group.badges.filter(badge => progress.badges[badge.id]).length;
                return `<section class="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-slate-800">
                    <div class="mb-1.5 flex items-center justify-between gap-2"><h4 class="min-w-0 text-[12px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(group.title)}</h4><span class="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">${earned}/${group.badges.length}</span></div>
                    <div class="flex flex-wrap gap-1.5">${group.badges.map(badge => `<button type="button" data-badge="${badge.id}" aria-label="${escapeHtml(badge.title)}" title="${escapeHtml(`${badge.title}: ${badge.text}${badgeReward(badge) ? ` ${badgeReward(badge)}` : ''}`)}" class="-m-0.5 rounded-full p-0.5 ${selected === badge.id ? 'ring-2 ring-brand-600 ring-offset-2 dark:ring-offset-slate-800' : ''}">${medalHtml(badge, Boolean(progress.badges[badge.id]), 'h-9 w-9', 'h-4 w-4')}</button>`).join('')}</div>
                </section>`;
            }).join('');
            showDialog('Odznaky', `
                <div class="flex flex-col gap-3">
                    <p class="text-sm font-black text-slate-800 dark:text-slate-100">${have} / ${total} <span class="font-semibold text-slate-500 dark:text-slate-400">získaných odznaků</span></p>
                    <div class="sticky top-11 z-10 -mx-1 bg-slate-50 px-1 pb-2 dark:bg-slate-900">${detailHtml}</div>
                    <div class="grid grid-cols-2 gap-1.5">${sections}</div>
                    ${STICKY_BACK()}
                </div>`, {
                onClick: (event) => {
                    const toggle = event.target.closest('[data-showcase-toggle]');
                    if (toggle) { onShowcaseToggle(toggle, render); return; }
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
                    ${uiArt(titleOwlArt(entry.from), `h-14 w-14 ${reached ? '' : 'opacity-40 grayscale'}`)}
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
                ${STICKY_BACK()}
            </div>`);
        const here = document.querySelector('#dialog-overlay [data-here]');
        if (here) here.scrollIntoView({ block: 'center' });
    };

    // Můj postup: úroveň, titul, XP do další úrovně a mistrovství jednotlivých témat (hvězdičky podle poznaných položek)
    // Můj postup se vejde bez posouvání (390×780, na 360×640 nejvýš trochu): úroveň, dva nejbližší odznaky na řádek, mistrovství jako
    // mřížka ikon témat s hvězdičkami a řádek odměn (ochrana série, truhla, diplomy), každá část s podrobnostmi ve vlastním okně
    const openProgress = () => {
        touchTip('progress');
        noteDiplomas(topicStarsNow());
        noteAlbum();
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
                <li>
                    <button type="button" data-mastery="${topic.id}" class="flex w-full flex-col items-center gap-0.5 rounded-xl bg-white px-0.5 pb-1 pt-1 shadow-sm dark:bg-slate-800" title="${escapeHtml(`${topic.title}: ${known} poznaných${goal ? ` · další hvězda za ${goal}` : ' · plné mistrovství'}`)}" aria-label="${escapeHtml(topic.title)}: ${stars} z ${MASTERY_STEPS.length} hvězd, klepnutím se dozvíš víc">
                        ${topicIcon(topic, 'h-7 w-7 short:h-6 short:w-6', `rounded-lg p-1 ${styleOf(topic).soft}`, 'h-5 w-5')}
                        <span class="flex" aria-hidden="true">${MASTERY_STEPS.map((_, index) => `<i data-lucide="star" class="h-[7px] w-[7px] ${index < stars ? 'fill-gold-500 text-gold-500' : 'text-slate-300 dark:text-slate-600'}"></i>`).join('')}</span>
                    </button>
                </li>`;
        }).join('');
        const badgeRow = (goal) => {
            const reward = badgeReward(goal.badge);
            return `<li class="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800" title="${escapeHtml(`${goal.badge.title}: ${goal.badge.text}${reward ? ` ${reward}` : ''}`)}">${medalHtml(goal.badge, false, 'h-8 w-8', 'h-4 w-4')}<span class="min-w-0 flex-1"><span class="flex items-baseline justify-between gap-2"><span class="truncate text-[12px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(goal.badge.title)}</span><span class="shrink-0 text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">${goal.value} / ${goal.badge.goal}</span></span>${reward
                ? `<span class="block truncate text-[10px] font-bold leading-tight text-gold-800 dark:text-gold-300" data-badge-reward>${escapeHtml(reward)}</span>`
                : `<span class="block truncate text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">${escapeHtml(goal.badge.text)}</span>`}${goalBar(goal.ratio)}</span></li>`;
        };
        const rewardsState = Rewards ? loadRewards() : null;
        const season = seasonView();
        showDialog('Můj postup', `
            <div class="flex flex-col gap-2.5 short:gap-1.5" data-progress-dialog>
                <button type="button" data-open-levels class="btn-3d flex w-full items-center gap-2.5 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-2.5 text-left text-white" aria-label="Tabulka úrovní">
                    <span class="relative h-14 w-14 shrink-0" data-title-owl>${uiArt(titleOwlArt(level.level), 'h-full w-full')}<span class="absolute -bottom-1 -right-1.5 flex h-8 w-8 flex-col items-center justify-center rounded-full bg-gold-500 text-brand-950 shadow-md ring-2 ring-brand-800"><span class="text-[7px] font-black uppercase leading-none">úr.</span><span class="text-[13px] font-black leading-none">${level.level}</span></span></span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-lg font-black leading-tight">${escapeHtml(titleForLevel(level.level))}</span>
                        <span class="mt-1 block h-2 overflow-hidden rounded-full bg-white/25" aria-hidden="true"><span class="block h-full w-0 rounded-full bg-gold-400" data-progress="${Math.round(level.ratio * 100)}"></span></span>
                        <span class="mt-0.5 flex items-center justify-between gap-2 text-[11px] font-bold text-white/85"><span>${level.needed ? `${formatXp(level.into)} / ${formatXp(level.needed)} XP` : 'Nejvyšší úroveň'}</span>${level.needed ? `<span>do úr. ${level.level + 1}</span>` : ''}</span>
                        ${next ? `<span class="block truncate text-[11px] font-semibold leading-tight text-gold-300">Další titul: ${escapeHtml(next.title)} (úr. ${next.from})</span>` : ''}
                    </span>
                    <i data-lucide="chevron-right" class="h-5 w-5 shrink-0 text-white/60"></i>
                </button>
                ${season ? Season.cardHtml(season) : ''}
                <div>
                    <div class="mb-1 flex items-center justify-between gap-2"><h3 class="${CARD_TITLE} whitespace-nowrap">Nejbližší odznaky</h3>
                        <button type="button" data-open-badges aria-label="Všechny odznaky ${earnedCount} / ${BADGES.length}" class="-my-1.5 flex min-h-[2.25rem] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-[12px] font-black text-brand-700 dark:text-brand-300"><i data-lucide="medal" class="h-3.5 w-3.5"></i>Všechny ${earnedCount} / ${BADGES.length}<i data-lucide="chevron-right" class="h-3.5 w-3.5"></i></button></div>
                    <ul class="flex flex-col gap-1">${goals.map(badgeRow).join('')}</ul>
                </div>
                <div>
                    <div class="mb-1 flex items-center justify-between gap-2"><h3 class="${CARD_TITLE} whitespace-nowrap">Mistrovství témat</h3>${Chronicle
                        ? '<button type="button" data-open-chronicle aria-label="Kronika týdne: můj týden v kostce" class="-my-2.5 flex min-h-[2.25rem] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-[12px] font-black text-brand-700 dark:text-brand-300"><i data-lucide="book-open" class="h-3.5 w-3.5"></i>Kronika týdne<i data-lucide="chevron-right" class="h-3.5 w-3.5"></i></button>'
                        : '<span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">klepni na téma</span>'}</div>
                    <ul class="grid grid-cols-7 gap-1">${rows}</ul>
                </div>
                ${Rewards ? Rewards.progressHtml({ freezes: rewardsState.freezes, chest: Rewards.pendingChest(rewardsState), lastReward: lastChestText(rewardsState), diplomas: Object.keys(rewardsState.diplomas).filter(id => TOPIC_BY_ID[id]).length, topics: TOPICS.length,
                    album: Album ? { percent: Album.build(albumInput(progress)).percent, art: Album.ALBUM_ART } : null }) : ''}
            </div>`, { aside: `<span data-total-xp class="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-black leading-tight text-gold-800 dark:bg-slate-800 dark:text-gold-300" title="Celkem získané XP">celkem ${formatXp(xp)} XP</span>`, onClick: (event) => {
            const child = (open) => openChild('Zpět na Můj postup', openProgress, open);
            if (event.target.closest('[data-open-badges]')) child(openBadges);
            if (event.target.closest('[data-open-levels]')) child(openLevels);
            if (event.target.closest('[data-open-chronicle]')) { child(() => openChronicle()); return; }
            if (event.target.closest('[data-season-claim]')) { openSeasonReveal(null, openProgress); return; }
            if (event.target.closest('[data-season-open]')) { child(() => openSeason()); return; }
            const info = event.target.closest('[data-rewards-info]');
            if (info) child(({ freeze: openFreezeHelp, chest: openChestHelp, diplomas: openDiplomas, album: () => openAlbum() })[info.dataset.rewardsInfo]);
            const mastery = event.target.closest('[data-mastery]');
            if (mastery) child(() => openMastery(mastery.dataset.mastery));
        } });
        applyProgress(document.getElementById('dialog-overlay'));
    };
    // Diplomy: mřížka všech témat (získané barevně, ostatní se zámkem), klepnutím diplom nebo co chybí
    const openDiplomas = () => {
        if (!Rewards) return;
        touchTip('diplomas');
        showDialog('Diplomy', `${Rewards.diplomasHtml(diplomaRows(), { topicIcon, styleOf })}${dialogBackButton('mt-3')}`, {
            onClick: (event) => {
                const diploma = event.target.closest('[data-diploma]');
                if (diploma) openChild('Zpět na Diplomy', openDiplomas, () => openDiploma(diploma.dataset.diploma));
            }
        });
    };

    // --- Album sbírky (album.js): okno z Mého postupu (dlaždice Album v řádku Odměny) se sekcemi, podrobnostmi věci a Nasadit,
    // odznaky Sběratel za milníky sbírky (oslava jednou, při získání odznaku) ---
    // Vstup alba z postupu (úroveň, odznaky) a odměn (věci z truhly, diplomy); výpočet si album pamatuje, opakované volání nic nestojí
    const albumInput = (progress = loadProgress()) => {
        const rewards = loadRewards();
        return { level: levelProgress(progress.xp).level, badges: progress.badges, gifts: rewards ? rewards.gifts : {}, diplomas: rewards ? rewards.diplomas : {}, topics: TOPICS, today: getDayKey() };
    };
    const albumBadgeContext = (progress) => (Album ? Album.badgeContext(albumInput(progress)) : { percent: 0, sections: {} });
    const albumDueBadges = (progress) => (Album ? Album.dueBadges(albumInput(progress)).filter(id => !progress.badges[id]) : []);
    // Kontrola na úvodu, v Mém postupu a v albu: dosažený milník (třeba po truhle nebo po synchronizaci s účtem) se připíše a oslaví hned.
    // Jen odznaky alba – ostatní odznaky přibývají při hře (grantBadges), tady se nepřepočítávají
    const noteAlbum = () => {
        if (!Album) return;
        try {
            const progress = loadProgress();
            const due = albumDueBadges(progress);
            if (!due.length) return;
            due.forEach(id => { progress.badges[id] = getDayKey(); });
            saveProgress(progress);
            freshBadgeIds = due;
            const level = levelProgress(progress.xp).level;
            announce(level, level, due.map(id => BADGE_BY_ID[id].title));
            syncProgress();
        } catch (error) { console.error(error); }
    };
    // Oslava milníku alba nebo celé sekce (volá announce pro čerstvé odznaky alba)
    const celebrateAlbum = (id) => {
        const badge = BADGE_BY_ID[id];
        if (!badge || !Album) return;
        const milestone = Album.MILESTONES.find(entry => entry.id === id);
        const owner = milestone ? null : Album.SECTIONS.find(entry => `album-${entry.id}` === id);
        if (milestone) showCelebration('vitez', `Album sbírky: ${milestone.goal} %`, `Nový titul „${badge.title}“ – můžeš ho mít u jména`, 'badge');
        else showCelebration('oslava', `Celá sekce: ${owner ? owner.title : 'album'}`, `Nový titul „${badge.title}“ – můžeš ho mít u jména`, 'badge');
    };
    const albumHelpers = () => ({
        medal: medalHtml, avatar: (id, cls) => avatarArt(id, cls), topicIcon, styleOf,
        frameClass: (id) => (window.MudrlantLookFrames ? window.MudrlantLookFrames.frameClass(id) : '')
    });
    // Co mám teď nasazené (klíče položek alba): téma, talár, rámeček, doplňky, titul u jména a postavička v profilu
    const albumWorn = () => {
        const worn = new Set();
        if (!Look) return worn;
        const prefs = lookContext().prefs;
        ['theme:themes', 'robe:robes', 'frame:frames'].forEach(pair => { const [key, category] = pair.split(':'); if (prefs[key]) worn.add(`${category}:${prefs[key]}`); });
        Object.values(prefs.acc || {}).forEach(entry => worn.add(`accessories:${entry.id}`));
        if (prefs.title && BADGE_BY_ID[prefs.title]) worn.add(`badges:${BADGE_BY_ID[prefs.title].group}`);
        const picture = signedUser() && myProfile && !myProfile.owl && Look.avatarPicture ? Look.avatarPicture(myProfile.avatar) : null;
        if (picture) worn.add(`avatars:${picture.item.id}`);
        return worn;
    };
    // Co jde s věcí ve sbírce udělat (tlačítko v podrobnostech): nasadit jako v Nastavení a v truhle, dát odznak jako titul, ukázat diplom
    const albumWear = (entry, worn) => {
        if (!entry.owned || !Look) return null;
        const on = worn.has(entry.key);
        if (entry.category === 'themes') return { label: 'Použít', on, onLabel: 'Používáš ho' };
        if (['robes', 'frames', 'accessories'].includes(entry.category)) return { label: 'Nasadit', on, onLabel: 'Nasazeno' };
        if (entry.category === 'avatars') return signedUser() && Social ? { label: 'Nasadit jako profilový obrázek', on, onLabel: 'Je to tvůj profilový obrázek' } : null;
        if (entry.category === 'badges') return entry.top ? { label: `Titul u jména: ${entry.top.title}`, on: lookContext().prefs.title === entry.top.id, onLabel: `Titul u jména: ${entry.top.title}` } : null;
        if (entry.category === 'diplomas') return Rewards ? { label: 'Ukázat diplom', on: false } : null;
        return null;
    };
    // Věta pod tlačítkem, když věc nejde nasadit z alba
    const albumHint = (entry) => {
        if (!entry.owned) return '';
        if (entry.category === 'avatars' && !(signedUser() && Social)) return 'Postavičku si dáš jako profilový obrázek po přihlášení.';
        if (entry.category === 'colors') return `Barvu doplňku vybereš v ${rewardPlace('colors')}.`;
        return '';
    };
    // Postavička jako profilový obrázek: stejně jako výběr v Nastavení → Profil (barvy částí, které hráč postavičce dal naposledy) a uložení
    const wearAlbumAvatar = (id) => {
        closeDialog();
        openSettings('', null, 'profile');
        if (!meDraft) return;
        const same = !meDraft.owl && Look.avatarPicture(meDraft.avatar) && Look.avatarPicture(meDraft.avatar).item.id === id;
        if (!same) { rememberPartColors(meDraft.avatar); meDraft.avatar = rememberedPartColors(id); }
        meDraft.owl = false;
        meDirty = true;
        meNote = '';
        saveMeProfile();
    };
    // Stav okna alba: sekce, otevřená věc (klíč), odměny alba, hláška po nasazení a posun mřížky (vrátí se po návratu z podrobností)
    let albumView = { section: 'avatars', detail: null, rewards: false, note: '', scroll: 0 };
    const openAlbum = (section = null) => {
        if (!Album) return;
        touchTip('album');
        noteAlbum();
        albumView = { ...albumView, section: section || albumView.section, detail: null, rewards: false, note: '', scroll: 0 };
        renderAlbum(0);
    };
    const ALBUM_BACK = `<button type="button" data-album-back data-x-back class="${SECONDARY_BUTTON} !py-2.5 text-sm"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět do alba</button>`;
    // Překreslí okno; scrollTo = posun panelu (null = nechat), focus = co dostane fokus (klávesnice a čtečka zůstanou na místě)
    const renderAlbum = (scrollTo = null, focus = null) => {
        const progress = loadProgress();
        const album = Album.build(albumInput(progress));
        const h = albumHelpers();
        const found = albumView.detail ? Album.findEntry(album, albumView.detail) : null;
        let body;
        if (albumView.rewards) body = `${Album.rewardsHtml(album, progress.badges, h)}<div class="mt-2.5">${ALBUM_BACK}</div>`;
        else if (found) body = `${Album.detailHtml(found, { badges: progress.badges, wear: albumWear(found.entry, albumWorn()), note: albumView.note || albumHint(found.entry) }, h)}<div class="mt-2.5">${ALBUM_BACK}</div>`;
        else {
            const look = Look && Look.activeTopicLook ? Look.activeTopicLook(lookContext().prefs.acc) : null;
            body = `${Album.albumHtml(album, { section: albumView.section, badges: progress.badges, worn: albumWorn(), wornLook: look ? look.topic : null }, h)}${STICKY_BACK()}`;
        }
        const overlay = showDialog('Album sbírky', body, { onClick: albumClick });
        applyProgress(overlay);
        if (scrollTo !== null) overlay.firstElementChild.scrollTop = scrollTo;
        const target = focus ? overlay.querySelector(focus) : null;
        if (target) target.focus({ preventScroll: scrollTo !== null });
    };
    const albumClick = (event) => {
        const panel = document.getElementById('dialog-overlay').firstElementChild;
        if (event.target.closest('[data-album-back]')) {
            const from = albumView.detail;
            albumView = { ...albumView, detail: null, rewards: false, note: '' };
            renderAlbum(albumView.scroll, from ? `[data-album-item="${CSS.escape(from)}"]` : '[data-album-rewards]');
            return;
        }
        const tab = event.target.closest('[data-album-tab]');
        if (tab) { albumView = { ...albumView, section: tab.dataset.albumTab, scroll: 0 }; renderAlbum(0, `[data-album-tab="${CSS.escape(tab.dataset.albumTab)}"]`); return; }
        if (event.target.closest('[data-album-rewards]')) { albumView = { ...albumView, rewards: true, scroll: panel.scrollTop }; renderAlbum(0, '[data-album-back]'); return; }
        // Sada tématu (Sady témat v sekci Doplňky): Mistrovství tématu se sadou a tlačítkem Obléknout celou sadu, zpět do alba na stejné místo
        const look = event.target.closest('[data-album-look]');
        if (look) {
            const scroll = panel.scrollTop;
            openChild('Zpět do alba', () => renderAlbum(scroll), () => openMastery(look.dataset.albumLook));
            return;
        }
        const item = event.target.closest('[data-album-item]');
        if (item) { albumView = { ...albumView, detail: item.dataset.albumItem, note: '', scroll: panel.scrollTop }; renderAlbum(0, '[data-album-wear], [data-album-back]'); return; }
        if (event.target.closest('[data-album-wear]') && albumView.detail) {
            const found = Album.findEntry(Album.build(albumInput()), albumView.detail);
            if (!found || !found.entry.owned) return;
            const { entry } = found;
            if (entry.category === 'avatars') { wearAlbumAvatar(entry.id); return; }
            if (entry.category === 'diplomas') { const back = albumView.detail; openChild('Zpět do alba', () => { albumView = { ...albumView, detail: back }; renderAlbum(0); }, () => openDiploma(entry.id)); return; }
            if (entry.category === 'badges') {
                Look.setPref('title', entry.top.id, lookContext());
                albumView.note = 'Titul se ukáže u tvého jména. Změníš ho v Nastavení → Profil.';
            } else {
                wearGift({ category: entry.category, item: entry.item });
                albumView.note = `${entry.title}: hotovo. Změníš to v ${rewardPlace(entry.category)}.`;
            }
            updateControlsUI();
            renderAlbum(null, '[data-album-back]');
        }
    };

    // Mistrovství jednoho tématu: co to je, kolik už hráč poznal, kolik chybí do další hvězdičky a co hvězdičky přinášejí (jen to, co hra opravdu dává)
    const openMastery = (topicId) => {
        const topic = TOPIC_BY_ID[topicId];
        if (!topic) return;
        touchTip('looks');
        const known = (loadLearned()[topic.id] || []).length;
        const stars = masteryStars(known);
        const goal = nextMastery(known);
        const before = MASTERY_STEPS[stars - 1] || 0;
        const skill = BADGE_BY_ID[`zbehly-${topic.id}`];
        const accessory = Look ? Look.ACCESSORIES.find(item => item.badge === `zbehly-${topic.id}`) : null;
        const master = BADGE_BY_ID['mistr-oboru'];
        // Sada doplňků tématu (look.js topicSet): kus za zběhlost, za 300 a za 1000 správných odpovědí v tématu; získané s fajfkou
        const ctx = Look ? lookContext() : null;
        const correct = (loadProgress().counters.topics || {})[topic.id] || 0;
        const pieces = Look && Look.topicSet ? Look.topicSet(topic.id) : [];
        const pieceHow = ({ step, badge }) => step === 'skill' ? '3 hvězdičky nebo 12 správně v řadě' : `${step} správných${BADGE_BY_ID[badge] ? ` (odznak ${BADGE_BY_ID[badge].title})` : ''}`;
        const piece = (entry) => {
            const owned = Look.isUnlocked(entry.item, ctx);
            return `<li data-set-piece="${entry.item.id}" class="flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-slate-50 px-1 py-1.5 text-center dark:bg-slate-700/50">
                <span class="relative"><img src="icons/doplnky/${entry.item.id}-ikona.webp" alt="" class="h-8 w-8 object-contain ${owned ? '' : 'opacity-50 grayscale'}">${owned ? '<i data-lucide="circle-check" class="absolute -bottom-1 -right-1.5 h-4 w-4 rounded-full bg-white text-emerald-600 dark:bg-slate-800 dark:text-emerald-400"></i>' : ''}</span>
                <b class="text-[11px] leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(entry.item.title)}</b>
                <span class="text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300">${escapeHtml(pieceHow(entry))}</span></li>`;
        };
        // Celý look sady (look.js topicLook): název, jestli ho Mudrlant nosí, nebo kolik kusů chybí; s celou sadou tlačítko, které ji oblékne najednou
        const look = Look && Look.topicLook ? Look.topicLook(topic.id) : null;
        const lookState = look ? Look.topicLookProgress(topic.id, ctx) : null;
        const lookWorn = Boolean(look && Look.wearsTopicSet(ctx.prefs.acc, topic.id));
        const lookStatus = !look ? '' : lookWorn ? 'Mudrlant ho právě nosí' : lookState.complete ? 'máš všechny kusy' : `chybí ${plural(lookState.total - lookState.owned, 'kus', 'kusy', 'kusů')}`;
        const lookHtml = look ? `<div data-mastery-look="${lookWorn ? 'worn' : lookState.complete ? 'complete' : 'missing'}" class="flex items-center gap-2 rounded-xl px-2 py-1 ${lookWorn || lookState.complete ? 'bg-gold-50 ring-1 ring-gold-300 dark:bg-gold-900/20 dark:ring-gold-700' : 'bg-slate-50 dark:bg-slate-700/50'}">
                <i data-lucide="${lookWorn ? 'circle-check' : 'sparkles'}" class="h-4 w-4 shrink-0 ${lookWorn ? 'text-emerald-600 dark:text-emerald-400' : lookState.complete ? 'text-gold-600 dark:text-gold-300' : 'text-slate-400 dark:text-slate-500'}"></i>
                <p role="status" class="line-clamp-2 min-w-0 flex-1 text-[11px] leading-tight text-slate-600 dark:text-slate-300"><b class="text-slate-800 dark:text-slate-100">Celý look: ${escapeHtml(look.title)}</b> · ${escapeHtml(lookStatus)}</p>
                ${lookState.complete && !lookWorn ? `<button type="button" data-wear-set="${topic.id}" class="flex min-h-[2.5rem] shrink-0 items-center gap-1.5 rounded-xl btn-3d bg-brand-700 px-2 py-1 text-left text-[11.5px] font-black leading-tight text-white"><i data-lucide="sparkles" class="h-4 w-4 shrink-0"></i><span class="max-w-[5.5rem]">Obléknout celou sadu</span></button>` : ''}
            </div>` : '';
        const setHtml = pieces.length > 1 ? `<div data-mastery-set class="flex flex-col gap-1">
                <p class="flex items-baseline justify-between gap-2 text-[11px] font-black text-slate-700 dark:text-slate-200"><span>Sada pro Mudrlanta</span><span class="font-semibold text-slate-500 dark:text-slate-400">správně v tématu: ${correct}</span></p>
                <ul class="grid grid-cols-3 gap-1.5" aria-label="Sada doplňků tématu">${pieces.map(piece).join('')}</ul>
                ${lookHtml}
            </div>` : '';
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
                ${setHtml}
                ${dialogBackButton()}
            </div>`, { onClick: (event) => {
            // Obléknout celou sadu: všechny kusy najednou do svých míst (nasazený kus si nechá barvu), okno se překreslí na místě
            if (!event.target.closest('[data-wear-set]') || !Look) return;
            const now = lookContext();
            if (!Look.topicLookProgress(topic.id, now).complete) return;
            Look.setPref('acc', Look.wearTopicSet(now.prefs.acc, topic.id), now);
            applyLook();
            updateControlsUI();
            openMastery(topic.id);
        } });
        applyProgress(document.getElementById('dialog-overlay'));
    };

    // Profil cizího hráče (klepnutí na jeho obrázek): statistiky z výzev, vzájemná bilance a odveta se stejným nastavením
    let profileToken = 0;
    const openPlayerProfile = async (playerId) => {
        const user = signedUser();
        if (!user || !Social) { openLoginDialog(); return; }
        if (playerId === user.id) { openProfile(); return; }
        const player = knownPlayers.get(playerId);
        if (!player) return;
        // Pozdní odpovědi (statistiky, přátelé, uložení) překreslí jen tohle okno, dokud je otevřené: zavřené okno se znovu neotevře
        // a profil jiného hráče (nebo jiné okno) se nepřepíše
        const token = ++profileToken;
        let opened = false;
        const isOpen = () => { const overlay = document.getElementById('dialog-overlay'); return token === profileToken && Boolean(overlay && /^(Profil hráče|Nahlásit hráče)$/.test(overlay.dataset.title)); };
        let stats = null;
        let theirProgress = null;
        let theirRating = null;
        // Vitrína hráče (schéma 18): nejvýš 3 trofeje; null = nenačtená nebo databáze vitrínu nemá
        let theirShowcase = null;
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
            // Přátelství a poslední reakce drobně pod tlačítky (jméno hráče je v hlavičce, u emoji v popisku)
            const info = [
                friend && friend.status === 'accepted' && (act.text || balance) ? `<span>${[act.text ? `Přítel · ${escapeHtml(act.text)}` : 'Přítel', balance ? `bilance ${escapeHtml(balance)}` : ''].filter(Boolean).join(' · ')}</span>` : '',
                lastReaction && lastReaction.emoji ? `<span class="inline-flex items-center gap-1" data-last-reaction>Poslední reakce: ${Friends.reactionBadge(lastReaction.emoji, playerName(player))} ${escapeHtml(Friends.REACTION_LABELS[lastReaction.emoji] || '')}</span>` : ''
            ].filter(Boolean);
            return `<div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2">${isBlocked() ? `<div class="min-w-0 flex-1">${Friends.blockedNote(playerName(player))}</div>` : button}${Friends.moreButton(menuOpen)}</div>
                ${menuOpen ? Friends.moreMenu(isBlocked()) : ''}
                ${info.length ? `<p class="flex flex-col items-center gap-0.5 text-center text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">${info.join('')}</p>` : ''}
            </div>`;
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
        // Titul u jména podle volby hráče: úroveň (výchozí), nic, nebo jeden ze získaných odznaků
        const titlePref = (value) => Social.cleanTitlePref(value.title_pref) || 'level';
        const titleLine = (value) => {
            const pref = titlePref(value);
            if (pref === 'none') return '';
            if (pref !== 'level' && BADGE_BY_ID[pref]) return `<p class="flex min-w-0 items-center gap-1.5 text-sm font-bold text-brand-700 dark:text-cream">${medalHtml(BADGE_BY_ID[pref], true, 'h-6 w-6', 'h-3 w-3')}<span class="truncate">${escapeHtml(BADGE_BY_ID[pref].title)}</span></p>`;
            // Vlastní titul (Šampion sezóny ze Sezóny Mudrlanta): zlatá korunka
            const ownTitle = pref !== 'level' && Look && Look.titleItem ? Look.titleItem(pref) : null;
            if (ownTitle) return `<p class="flex min-w-0 items-center gap-1.5 text-sm font-bold text-brand-700 dark:text-cream" data-own-title><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-200 to-gold-500 text-brand-950 ring-2 ring-gold-300 shadow-sm"><i data-lucide="crown" class="h-3.5 w-3.5"></i></span><span class="truncate">${escapeHtml(ownTitle.title)}</span></p>`;
            const level = levelProgress(value.xp || 0).level;
            return `<p class="truncate text-sm font-bold text-brand-700 dark:text-cream">Úr. ${level} · ${escapeHtml(titleForLevel(level))}</p>`;
        };
        // Odznaky (jen u titulu podle úrovně): jedna řada malých medailí, „+N“ rozbalí všechny
        let badgesOpen = false;
        const BADGES_SHOWN = 6;
        const badgesRow = (value) => {
            if (titlePref(value) !== 'level') return '';
            const earned = compactBadges(expandBadges((value.badges || []).filter(id => BADGE_BY_ID[id]))).map(id => BADGE_BY_ID[id]);
            if (!earned.length) return '';
            const fold = earned.length > BADGES_SHOWN + 1;
            const shown = fold && !badgesOpen ? earned.slice(0, BADGES_SHOWN) : earned;
            const medal = (badge) => `<span title="${escapeHtml(`${badge.title}: ${badge.text}`)}">${medalHtml(badge, true, 'h-8 w-8', 'h-4 w-4')}</span>`;
            const toggle = fold ? `<button type="button" data-profile-badges aria-expanded="${badgesOpen}" aria-label="${badgesOpen ? 'Méně odznaků' : `Všechny odznaky (${earned.length})`}" class="flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center rounded-full bg-slate-200 px-2.5 text-[12px] font-black text-slate-700 active:scale-95 dark:bg-slate-700 dark:text-slate-200">${badgesOpen ? '<i data-lucide="chevron-down" class="h-4 w-4 rotate-180"></i>' : `+${earned.length - BADGES_SHOWN}`}</button>` : '';
            return `<div class="flex ${badgesOpen ? 'flex-wrap' : 'flex-nowrap overflow-hidden'} items-center justify-center gap-1.5" aria-label="Odznaky" data-profile-badge-row>${shown.map(medal).join('')}${toggle}</div>`;
        };
        // Statistiky z výzev a vzájemná bilance v jedné kartě: tři čísla v řádku, pod nimi bilance jako čipy
        const stat = (label, value) => `<div class="px-1 text-center"><p class="text-lg font-black leading-tight text-slate-800 dark:text-slate-100">${value}</p><p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${label}</p></div>`;
        const chip = (label, tone) => `<span class="rounded-lg px-2 py-0.5 text-[12px] font-black ${tone}">${escapeHtml(label)}</span>`;
        const render = () => {
            if (opened && !isOpen()) return;
            opened = true;
            let body;
            if (failed) body = '<p class="text-sm font-semibold text-rose-700 dark:text-rose-400">Profil se nepodařilo načíst. Zkontroluj připojení.</p>';
            else if (!stats) body = '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám…</p>';
            else {
                const percent = stats.answered ? `${Math.round(stats.correct / stats.answered * 100)} %` : '–';
                const versus = stats.versus && (stats.versus.wins + stats.versus.draws + stats.versus.losses)
                    ? `<div class="flex flex-wrap items-center justify-center gap-1.5"><p class="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400"><span class="max-[380px]:sr-only">Vaše </span>bilance</p>${chip(plural(stats.versus.wins, 'výhra', 'výhry', 'výher'), 'bg-emerald-600 text-white')}${chip(plural(stats.versus.draws, 'remíza', 'remízy', 'remíz'), 'bg-slate-500 text-white')}${chip(plural(stats.versus.losses, 'prohra', 'prohry', 'proher'), 'bg-rose-600 text-white')}</div>`
                    : '<p class="text-center text-xs text-slate-500 dark:text-slate-400">Ještě jste spolu nehráli.</p>';
                const same = stats.last ? `${challengeTopicTitle(stats.last.topic)} · ${Social.COUNTS.includes(stats.last.count) ? stats.last.count : 10} otázek` : 'Mix · 10 otázek';
                body = `
                    <div class="rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800" data-player-stats>
                        <div class="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">${stat('Výzvy', stats.games)}${stat('Úspěšnost', percent)}${stat('Nejlepší', stats.best ? `${stats.best.correct}/${stats.best.count}` : '–')}</div>
                        <div class="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">${versus}</div>
                    </div>
                    <div>
                        <button type="button" data-rematch ${busy ? 'disabled' : ''} class="${PRIMARY_BUTTON}">${uiArt('vyzva', 'h-7 w-7')} ${busy ? 'Zakládám…' : stats.last ? 'Vyzvat k odvetě' : 'Vyzvat'}</button>
                        <div class="mt-1 flex items-center gap-2">
                            <p class="min-w-0 flex-1 text-xs leading-snug text-slate-500 dark:text-slate-400">${stats.last ? 'Stejné nastavení jako naposledy' : 'První výzva'}: ${escapeHtml(same)}</p>
                            <button type="button" data-edit-challenge ${busy ? 'disabled' : ''} class="flex min-h-[2.5rem] shrink-0 items-center gap-1 rounded-xl px-2 text-[13px] font-black text-brand-700 hover:bg-slate-200 disabled:opacity-50 dark:text-cream dark:hover:bg-slate-800"><i data-lucide="settings-2" class="h-4 w-4"></i> Upravit<span class="sr-only"> nastavení výzvy</span></button>
                        </div>
                    </div>`;
            }
            if (view === 'report' && Friends) {
                body = Friends.reportBody(Social.REPORT_REASONS, reportReason, reportNote, { busy: reportBusy }) + `<button type="button" data-report-back data-x-back class="mt-2 flex min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] font-black text-slate-600 dark:text-slate-300"><i data-lucide="chevron-left" class="h-4 w-4"></i> Zpět na profil</button>`;
            }
            // Vitrína hráče (schéma 18): tři trofeje pod hlavičkou; na nízkém displeji místo řady všech odznaků a s hustším oknem, ať se vejde
            // Celý look tématu na jeho sově (odvozený z uloženého textu sovy v profilu, look-owl.js lookOf): zlatý štítek vedle ligy
            const look = player.owl && Owl && Owl.lookOf ? Owl.lookOf(player.owl) : null;
            const showcaseRow = theirShowcase && Showcase && view !== 'report' ? Showcase.tilesHtml(theirShowcase, showcaseHelpers(), { label: `Vitrína hráče ${playerName(player)}` }) : '';
            showDialog(view === 'report' ? 'Nahlásit hráče' : 'Profil hráče', `
                <div class="flex flex-col gap-3${showcaseRow ? ' short:gap-2' : ''}">
                    <div class="flex items-center gap-3" data-profile-head>${avatarHtml(player, 'h-16 w-16 text-4xl')}
                        <div class="min-w-0 flex-1"><p class="truncate text-xl font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(playerName(player))}</p>${theirProgress ? titleLine(theirProgress) : ''}${theirRating || look ? `<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">${theirRating ? `<span id="player-league">${leagueChip(theirRating.rating)}</span>` : ''}${look ? Owl.lookTagHtml(look) : ''}</p>` : ''}</div>
                    </div>
                    ${showcaseRow}
                    ${theirProgress && view !== 'report' && badgesRow(theirProgress) ? (showcaseRow ? `<div class="short:hidden">${badgesRow(theirProgress)}</div>` : badgesRow(theirProgress)) : ''}
                    ${view === 'report' ? '' : socialRow()}
                    ${isBlocked() && view !== 'report' ? '' : body}
                    ${note ? DIALOG_NOTE(note, /přijali|přítel|odeslána|odblokovaný|zablokovaný/.test(note) ? 'text-emerald-700 dark:text-emerald-300' : undefined) : ''}
                </div>`, {
                onSubmit: (event) => { if (event.target.id === 'report-form') sendReport(); },
                onInput: (event) => { if (event.target.id === 'report-note') reportNote = event.target.value; },
                onClick: async (event) => {
                    const friendButton = event.target.closest('[data-friend]');
                    if (friendButton) { friendAction(friendButton.dataset.friend); return; }
                    if (event.target.closest('[data-profile-badges]')) { badgesOpen = !badgesOpen; render(); return; }
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
                            topic: last ? last.topic : 'mix', count: last && Social.COUNTS.includes(last.count) ? last.count : 10, invitedId: player.id,
                            includeHard: Boolean(last && last.include_hard), level: last ? challengeLevel(last) : 1, categories: (last && last.categories) || [], variant: (last && last.variant) || 'choices'
                        });
                        closeDialog();
                        await loadMyProfile();
                        startChallenge({ ...created, creator: myProfile, invited: player, fresh: true }, 0, []);
                    } catch (error) {
                        busy = false;
                        note = challengeErrorText(error);
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
        if (Showcase && Social.getShowcase) Social.getShowcase(playerId).then(value => { theirShowcase = value; if (value && value.length && document.getElementById('dialog-overlay')) render(); }).catch(() => {});
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
                if (document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === 'Zablokovaní hráči') render();
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
                if (document.getElementById('dialog-overlay') && document.getElementById('dialog-overlay').dataset.title === 'Nahlášení hráči') render();
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
        if (window.MudrlantShareCard) await window.MudrlantShareCard.shareText({ title: 'Výzva v Mudrlantu', text: message, url: challengeLink(code) }, { toast: showToast, copied: 'Odkaz na výzvu zkopírován', failed: 'Kopírování se nepodařilo' });
    };

    // Detail výzvy podle kódu: kdo vyzývá, o co jde, žebříček; hrát jde, dokud hráč nemá výsledek
    let challengeToken = 0;
    // group = výzva se hraje z detailu skupiny ({ id, name, icon }): v záhlaví otázky bude místo zakladatele skupina
    const openChallenge = async (rawCode, group = null) => {
        const code = Social ? Social.parseCode(rawCode) : '';
        if (!code) { showDialog('Výzva', DIALOG_NOTE('Tenhle kód výzvy není platný.')); return; }
        const user = signedUser();
        if (!user) {
            writeJson(KEYS.pendingChallenge, code);
            showDialog('Výzva', `
                <p class="mb-4 text-sm text-slate-600 dark:text-slate-300">Někdo tě vyzval. Pro hru výzvy se nejdřív přihlas, hned potom se výzva otevře.</p>
                <button type="button" data-auth-login-dialog class="${PRIMARY_BUTTON}"><i data-lucide="log-in" class="h-5 w-5"></i> Přihlásit se přes Google</button>`,
            { onClick: (event) => { if (event.target.closest('[data-auth-login-dialog]')) startLogin(); } });
            return;
        }
        showDialog('Výzva', '<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám výzvu…</p>');
        // Hráč mezitím okno zavřel nebo otevřel jinou výzvu: pozdní odpověď se zahodí (okno se samo znovu neotevře)
        const token = ++challengeToken;
        const stillOpen = () => { const overlay = document.getElementById('dialog-overlay'); return token === challengeToken && Boolean(overlay && overlay.dataset.title === 'Výzva'); };
        let def;
        let results;
        // Průběh ze serveru (schéma 3): pole odpovědí, null = databáze ho neeviduje, undefined = nepodařilo se ho načíst
        let progress;
        try {
            [def, results, progress] = await Promise.all([Social.getChallenge(code), Social.getResults(code), Social.challengeProgress(user.id, code).catch(() => undefined)]);
        } catch (error) {
            if (stillOpen()) showDialog('Výzva', DIALOG_NOTE('Výzvu se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'));
            return;
        }
        if (!stillOpen()) return;
        if (!def) { showDialog('Výzva', DIALOG_NOTE('Výzva s tímhle kódem neexistuje.')); return; }
        const mine = results.find(row => row.user_id === user.id);
        const myChange = mine && Rating && results.length > 1 ? await Social.getRatingChange(user.id, code).catch(() => null) : null;
        if (!stillOpen()) return;
        const own = def.creator && def.creator.id === user.id;
        // Výsledky ostatních (body, správné, pořadí) až po vlastním dohrání; kdo výzvu hrát nemůže (je určená jinému), je jen divák a vidí je hned
        const canPlay = !def.invited || def.invited.id === user.id || Boolean(own);
        // Rozehraná výzva (v paměti, nebo uložená mezi rozehranými): pokračuje se, nehraje se znovu od první otázky
        let resumable = mine ? null : ownChallengeInProgress() && challenge.code === code ? challenge
            : savedOpenChallenges().find(saved => !saved.tournament && saved.code === code && (!saved.owner || saved.owner === user.id)) || null;
        // Server zná rozehraný průběh (i po smazání dat nebo z jiného zařízení): pokračuje se podle něj, ne od první otázky
        if (!mine && Array.isArray(progress) && progress.length) resumable = mergeAnswers(resumable || makeChallenge({ ...def, owner: user.id }), progress);
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
                    const tags = [`Obtížnost ${LEVEL_TIERS[challengeLevel(def)].title}`, def.variant === 'typed' ? 'Psaní odpovědí' : def.variant === 'choices' ? 'Výběr z možností' : null,
                        ...(def.categories || []).length && topicDef ? [`Okruh: ${def.categories.map(key => categoryOf(topicDef, key).label).join(', ')}`] : []].filter(Boolean);
                    return `<div class="flex flex-wrap gap-1.5">${tags.map(tag => `<span class="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">${escapeHtml(tag)}</span>`).join('')}</div>`;
                })()}
                ${def.invited ? `<p class="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Vyzvaný hráč: ${avatarHtml(def.invited, 'h-6 w-6 text-sm')} <b>${escapeHtml(def.invited.id === user.id ? 'ty' : playerName(def.invited))}</b></p>` : ''}
                ${mine || !canPlay ? (results.length ? `<ol class="flex flex-col gap-1.5">${rankingRows(results, def.count, user.id)}</ol>` : NOBODY_PLAYED) : waitingPlayers(def, results, user.id)}
                ${myChange ? `<p class="text-sm font-bold text-slate-600 dark:text-slate-300">Tvůj rating: <b class="${myChange.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : myChange.delta < 0 ? 'text-rose-700 dark:text-rose-400' : ''}">${Rating.formatDelta(myChange.delta)}</b> (${myChange.after})</p>` : ''}
                ${mine && results.some(row => row.user_id !== user.id) ? `<button type="button" data-ch-breakdown class="${SECONDARY_BUTTON}"><i data-lucide="list-ordered" class="h-5 w-5"></i> Rozpis otázek</button>` : ''}
                ${mine ? '' : `<button type="button" data-ch-play class="${PRIMARY_BUTTON}"><i data-lucide="play" class="h-5 w-5"></i> ${resumable ? resumeLabel(resumable) : 'Hrát výzvu'}</button>`}
                <button type="button" data-ch-share class="${SECONDARY_BUTTON}"><i data-lucide="share-2" class="h-5 w-5"></i> Sdílet výzvu · ${code}</button>
            </div>`, {
            onClick: (event) => {
                if (event.target.closest('[data-ch-share]')) shareChallenge(code, text);
                if (event.target.closest('[data-ch-breakdown]')) openChallengeBreakdown({ ...def, code }, results);
                if (event.target.closest('[data-ch-play]')) {
                    closeDialog();
                    // Tahle výzva je už rozehraná: pokračuje se od další otázky (ne znovu od první)
                    if (resumable) { challenge = resumable; if (group && !challenge.group) challenge.group = challengeGroup(group); continueChallenge(); }
                    else startChallenge({ ...def, group, synced: Array.isArray(progress) ? 0 : -1 }, 0, []);
                }
            }
        });
    };

    // Rozehraná výzva z řádku výzvy (nebo z dřívější rozehrané): co a kým se hraje, odpovědi a kolik jich potvrdil server
    const challengeGroup = (group) => (group && group.name ? { id: group.id || null, name: String(group.name), icon: typeof group.icon === 'string' ? group.icon : '' } : null);
    const makeChallenge = (def, index = 0, results = []) => ({
        code: def.code || def.id, topic: def.topic, seed: def.seed, count: def.count, index, results, creator: def.creator || null, invited: def.invited || null, done: false,
        // Výzva skupině (soupeř v záhlaví otázky je skupina): { id, name, icon }, jen když se výzva hraje ze skupiny
        group: challengeGroup(def.group),
        level: challengeLevel(def), categories: def.categories || [], variant: def.variant || null, tournament: def.tournament || null,
        // Kdo výzvu hraje: po odhlášení a přihlášení jiného účtu na stejném zařízení se mu cizí rozehraná výzva nenabízí
        owner: def.owner || (signedUser() ? signedUser().id : null),
        // Kolik odpovědí má server (průběh, schéma 3); právě založená výzva žádné, jinak -1 = neví se (před prvním uložením se načte)
        synced: def.fresh ? 0 : knownSynced(def)
    });
    // Smí výzva (zápas turnaje) mít otázky na mapě: výzva nové aplikace (konec semínka), turnaj od týdne MULTIPLAYER_TOURNAMENTS_FROM
    // (tournament.maps z tournamentChallengeDef); výzvy a turnaje starších verzí aplikace ne (viz question-map.js)
    const challengeAllowsMaps = (c) => Boolean(MapQuestion && c && (c.tournament ? c.tournament.maps === true : MapQuestion.seedAllowsMaps(c.seed)));
    // Výběr otázek výzvy (i zápasu turnaje): stejná otázka pro všechny, položku určuje semínko výzvy a pořadí; u jednoho tématu se dřívější
    // otázky nezopakují. Stejná položka bývá ve dvou tématech (stavba v Architektuře i Zeměpisu): v Mixu a turnaji se nezopakuje ani napříč tématy.
    // step(semínko) vybere otázku daného semínka (s remember = true si její položky zapamatuje jako použité); earlierSeeds(index) = semínka otázek
    // před otázkou index (u turnaje i všech dřívějších kol). Hra i Rozpis otázek procházejí semínka ve stejném pořadí, takže vyjdou stejné otázky.
    // frozen = otázky uložené na serveru podle semínka (zamrzlé otázky): jejich položky se dál nezopakují, i když místní výběr vyšel jinak (jiná data).
    const challengePicker = (c, frozen = {}) => {
        const usedIds = new Set();
        const offered = (candidate) => levelOf(candidate) <= challengeLevel(c) && (!c.categories.length || c.categories.includes(candidate.c));
        const pickFor = (ctx, rng, history) => {
            const all = ctx.items.filter(offered);
            const unused = all.filter(candidate => !usedIds.has(candidate.q));
            const pool = unused.length ? unused : all;
            const keys = ctx.topic.categories.map(category => category.key).filter(key => !c.categories.length || c.categories.includes(key));
            return pickItem(pool.length ? pool : ctx.items.filter(candidate => candidate.k === 1), rng, history, keys);
        };
        // Číselná otázka (Seřaď, Odhadni číslo): vlastní řada náhodných čísel ze semínka otázky (výběr položky se nemění)
        // a jen položky, které výzva nabízí a které v ní ještě nebyly; všichni hráči tak dostanou stejnou
        const challengeNumeric = (ctx, item, seedText) => numericPlan(ctx, item, ctx.items.filter(candidate => offered(candidate) && !usedIds.has(candidate.q)), createSeededRandom(`${seedText}:cisla`));
        // Otázka na mapě (question-map.js): jen ve hře, která to nese, ne místo číselné otázky a jen s položkou, která na mapu jde
        // (vlastní řada čísel ze semínka otázky, rng otázky se nemění); jestli otázka na mapě opravdu vyjde, rozhodne až buildQuestion s mapou
        const mapsOn = challengeAllowsMaps(c);
        const challengeMap = (ctx, item, numeric, seedText) => Boolean(mapsOn && item && !numeric && MapQuestion.multiplayerDue(seedText) && MapQuestion.candidate(item, ctx));
        const ids = challengeTopicIds(c.topic);
        const histories = new Map();
        const historyOf = (topicId) => { if (!histories.has(topicId)) histories.set(topicId, []); return histories.get(topicId); };
        const step = async (seedText, remember = true) => {
            const rng = createSeededRandom(seedText);
            const topicId = ids.length > 1 ? pickRandom(ids, rng) : ids[0];
            const ctx = await loadTopic(topicId);
            const item = pickFor(ctx, rng, historyOf(topicId));
            // Číselná otázka dřívějšího pořadí (stejné semínko, stejný plán): ani její položky se nezopakují
            const numeric = challengeNumeric(ctx, item, seedText);
            const map = challengeMap(ctx, item, numeric, seedText);
            if (remember) {
                if (item) { historyOf(topicId).push(item.q); usedIds.add(item.q); }
                if (numeric) numeric.ids.forEach(id => usedIds.add(id));
                const snapshot = frozen[seedText];
                if (snapshot) { snapshotIds(snapshot).forEach(id => usedIds.add(id)); historyOf(snapshot.topic).push(snapshot.id); }
            }
            return { item, ctx, rng, numeric, map };
        };
        // Turnaj: otázky se nesmí zopakovat ani v dřívějších kolech (každé kolo má semínko `<turnaj>-r<kolo>`)
        const earlierSeeds = (index) => {
            const seeds = [];
            const tour = c.tournament;
            if (tour && tour.seedBase && tour.round > 1) {
                for (let tourRound = 1; tourRound < tour.round; tourRound++) for (let before = 0; before < c.count; before++) seeds.push(`${tour.seedBase}-r${tourRound}:${before}`);
            }
            for (let before = 0; before < index; before++) seeds.push(`${c.seed}:${before}`);
            return seeds;
        };
        return { step, earlierSeeds };
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
        challenge = makeChallenge(def, index, results);
        mode = 'challenge';
        closeDialog();
        runRound(async () => {
            const seed = `${challenge.seed}:${index}`;
            const frozen = Object.create(null);
            const picker = challengePicker(challenge, frozen);
            const earlier = picker.earlierSeeds(index);
            // Otázky uložené na serveru (tahle i dřívější): tahle se hraje taková, jakou ji dostal soupeř
            Object.assign(frozen, await frozenQuestions([...earlier, seed]));
            if (frozen[seed]) { await loadTopic(frozen[seed].topic).catch(() => null); return { frozen: frozen[seed], snapshotSeed: seed }; }
            // Dřívější otázky se přehrají se stejným semínkem (i u Mixu a turnaje, kde se téma losuje), takže se žádná položka v rámci výzvy nezopakuje
            for (const earlierSeed of earlier) await picker.step(earlierSeed);
            return { ...(await picker.step(seed, false)), snapshotSeed: seed };
        }, challengeTopicIds(challenge.topic).length === 1 ? TOPIC_BY_ID[challengeTopicIds(challenge.topic)[0]] : MIX);
    };

    const challengeHome = () => {
        // Výzva, jejíž výsledek se nepodařilo odeslat, zůstává: úvod nabídne její dokončení
        if (!ownChallengeInProgress()) challenge = latestOpenChallenge();
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
        return `<p id="rating-change" class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-sm font-black text-white"><span class="${change.delta > 0 ? 'text-emerald-300' : change.delta < 0 ? 'text-rose-300' : 'text-white/80'}">${Rating.formatDelta(change.delta)}</span> rating ${leagueEmblem(league, 'h-5 w-5')} ${escapeHtml(league.name)} ${change.after || myRating.rating}</p>${change.capped ? '<p class="mt-1 text-[11px] font-semibold text-white/70">S tímhle hráčem už tento týden rating nestoupá (max. 3 výzvy).</p>' : ''}`;
    };
    const renderChallengeDone = (results = null, state = 'ok') => {
        const c = challenge;
        if (!c) return;
        screen = 'challenge-done';
        closePlaceInfo();
        const user = signedUser();
        const correct = c.results.filter(row => row && row.correct).length;
        const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
        // Sova podle výsledku: vítěz s pohárem, poražený s „dobrá hra“, remíza s radostí, čekání na soupeře s hodinkami (bez výsledku oslava)
        const rivals = user && results ? results.filter(row => row.user_id !== user.id) : [];
        const bestRival = rivals.reduce((top, row) => !top || compareResults(row, top) > 0 ? row : top, null);
        // Výsledek slovy a hláška (stejná pro tutéž výzvu); bez soupeře se čeká, až dohraje
        const outcome = Rating && state === 'ok' ? Rating.outcomeOf({ correct, points }, bestRival) : null;
        const outcomeOwl = !outcome ? 'oslava' : outcome === 'cekani' ? 'ceka' : outcome === 'vyhra' ? 'vitez' : outcome === 'remiza' ? 'radost' : 'prohra';
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
        if (state === 'ok') { c.lastResults = results; flushAnswerStats(); }
        // Rozpis otázek se po dohrání otevře sám (jednou na výzvu), jakmile je s kým srovnávat; tlačítko na výsledku zůstává
        if (state === 'ok' && !c.tournament && rivals.length && !c.breakdownShown) {
            c.breakdownShown = true;
            setTimeout(() => { if (challenge === c && screen === 'challenge-done' && !document.getElementById('dialog-overlay')) openChallengeBreakdown(c, results); }, 700);
        }
        // Upozornění, že vyzvaný hráč výzvu uvidí: ne vyzvanému samotnému a ne potom, co už ji dohrál
        const invitedWaiting = Boolean(c.invited && c.invited.id && (!user || c.invited.id !== user.id) && !(results || []).some(row => row.user_id === c.invited.id));
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-4 pb-6 dark:bg-slate-900">
                <div class="rounded-[1.5rem] bg-gradient-to-br from-brand-600 to-brand-900 p-5 text-center text-white shadow-lg">
                    ${uiArt(`sova-${outcomeOwl}`, 'mx-auto -mt-1 mb-1 h-24 w-24')}${verdictHtml}
                    <p class="mt-2 text-xs font-black uppercase tracking-widest text-white/80">${escapeHtml(challengeTopicTitle(c.topic))}</p>
                    <p data-result-points class="mt-0.5 text-4xl font-black">${escapeHtml(formatPoints(points))}</p>
                    <p data-result-correct class="mt-1 text-sm font-bold text-white/90">${correct}/${c.count} správně</p>
                    ${ratingNote(c, results)}
                </div>
                ${body}
                ${invitedWaiting ? `<p data-invited-note class="text-center text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300"><span class="inline-flex max-w-full items-center gap-1.5 align-middle">${avatarHtml(c.invited, 'h-6 w-6 text-sm')}<b class="truncate">${escapeHtml(playerName(c.invited))}</b></span> uvidí výzvu na úvodní stránce.</p>` : ''}
                ${state === 'ok' && rivals.length ? `<button type="button" data-action="challenge-breakdown" class="${SECONDARY_BUTTON}"><i data-lucide="list-ordered" class="h-5 w-5"></i> Rozpis otázek</button>` : ''}
                <button type="button" data-action="challenge-share" data-code="${escapeHtml(c.code)}" data-text="Zahrál jsem výzvu v Mudrlantu: ${correct}/${c.count}. Zvládneš to líp?" class="${SECONDARY_BUTTON}"><i data-lucide="share-2" class="h-5 w-5"></i> Sdílet výzvu · ${escapeHtml(c.code)}</button>
                ${outcome === 'vyhra' && ShareCard ? `<button type="button" data-action="challenge-share-image" class="${SECONDARY_BUTTON}"><i data-lucide="image" class="h-5 w-5"></i> Sdílet obrázek</button>` : ''}
                <button type="button" data-action="challenge-home" class="${PRIMARY_BUTTON}">Zpět domů</button>
            </div>`;
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
        // Vyhraná výzva: obrázek ke sdílení se připraví hned (share-card.js)
        if (outcome === 'vyhra' && ShareCard) { const card = challengeCardInput(c); if (card) ShareCard.prepare(card, ShareCard.fileName('vyzva', card.day)); }
        // Dohraná výzva, na jejíhož soupeře se čeká (i právě založená): nabídka upozornění, ať se hráč dozví, až soupeř dohraje
        if (state === 'ok' && results && (!rivals.length || invitedWaiting)) schedulePushOffer('challenge');
    };

    // --- Rozpis otázek po výzvě a zápasu turnaje (schéma 10): otázka po otázce, co který hráč odpověděl, s body, nápovědami a časem ---
    // Otázky se znovu vyberou ze semínka (challengePicker, stejně jako ve hře), odpovědi hráčů vrátí server (challenge_details, tournament_details),
    // a to jen tomu, kdo sám dohrál, a cizí až po dohrání soupeře (nebo po vypršení). Starší odpovědi podrobnosti nemají: ukáže se, co je.
    const BREAKDOWN_TITLE = 'Rozpis otázek';
    const breakdownQuestions = new Map();
    // Otázka do rozpisu: zadání, u otázky „ve kterém státě“ i místo, správná odpověď a položka pro okno s popisem
    // Otázka na mapě v rozpisu: „Ukaž na mapě“ a místo (odpověď hráče je „Vedle o 312 km“ a body)
    const MAP_BREAKDOWN_TITLE = 'Ukaž na mapě';
    const describeChallengeQuestion = ({ item, ctx, rng, numeric }) => {
        if (!item || !ctx) return null;
        const built = numeric && Numeric ? Numeric.buildRound(numeric, ctx) : null;
        if (built) return { topic: ctx.topic.id, id: built.id, title: built.question.title, subject: built.numeric.kind === 'estimate' ? built.name : '', answer: built.question.answerLabel };
        // Stejné pořadí losování jako createRoundData (otázka na mapě rng nebere, tu řeší describeChallengeStep)
        const special = ctx.topic.specialQuestion ? ctx.topic.specialQuestion(item, ctx, rng) : null;
        const category = categoryOf(ctx.topic, item.c);
        return {
            topic: ctx.topic.id, id: item.q, title: special ? special.title : (category.question || ctx.topic.words.question),
            subject: special && special.showName ? item.n : '', answer: special ? special.answerLabel : item.n
        };
    };
    // Otázka výzvy ze semínka: stejně jako createRoundData otázka na mapě, když ji semínko určilo a položka na mapu jde, jinak obyčejná
    const describeChallengeStep = async (step) => {
        const onMap = step && step.map && step.item && !step.numeric && MapQuestion
            ? await loadMapData().then(data => MapQuestion.multiplayerQuestion(step.item, step.ctx, data)).catch(() => null) : null;
        return onMap ? { topic: step.ctx.topic.id, id: step.item.q, title: MAP_BREAKDOWN_TITLE, subject: '', answer: onMap.answerLabel, map: true } : describeChallengeQuestion(step);
    };
    // Zadání do rozpisu z otázky uložené na serveru (zamrzlé otázky): stejné údaje jako describeChallengeQuestion
    const describeSnapshot = (data) => (data.question.type === 'map' ? { topic: data.topic, id: data.id, title: MAP_BREAKDOWN_TITLE, subject: '', answer: data.question.answerLabel, map: true } : {
        topic: data.topic, id: data.id, title: data.question.title, answer: data.question.answerLabel,
        subject: isNumeric(data) ? (data.numeric.kind === 'estimate' ? data.name || '' : '') : data.question.showName ? data.name || '' : ''
    });
    // Otázky výzvy (zápasu) do rozpisu: uložené na serveru, jak je hráči opravdu hráli; jen chybějící (starší hry, databáze bez nich) se sestaví ze semínka
    const challengeQuestionList = (def) => {
        const c = { ...def, level: challengeLevel(def), categories: Array.isArray(def.categories) ? def.categories : [] };
        const tour = c.tournament;
        const key = [c.topic, c.seed, c.count, c.level, c.categories.join(','), tour ? `${tour.seedBase}:${tour.round}:${tour.maps === true}` : ''].join('|');
        if (!breakdownQuestions.has(key)) {
            let complete = false;
            const promise = (async () => {
                const seeds = Array.from({ length: c.count }, (_, index) => `${c.seed}:${index}`);
                const frozen = Object.create(null);
                const picker = challengePicker(c, frozen);
                const earlier = picker.earlierSeeds(0);
                Object.assign(frozen, await frozenQuestions([...earlier, ...seeds]));
                complete = seeds.every(seed => frozen[seed]);
                // Všechny otázky uložené: nic se nesestavuje (stačí načíst jejich témata kvůli oknu s popisem)
                if (!complete) for (const seed of earlier) await picker.step(seed);
                const list = [];
                for (const seed of seeds) {
                    let question = null;
                    if (frozen[seed]) {
                        try { question = describeSnapshot(frozen[seed]); } catch (error) { console.error(error); }
                        if (!complete) await picker.step(seed);
                    } else {
                        const step = await picker.step(seed);
                        try { question = await describeChallengeStep(step); } catch (error) { console.error(error); }
                    }
                    list.push(question);
                }
                await Promise.all([...new Set(list.filter(Boolean).map(question => question.topic))].map(id => loadTopic(id).catch(() => null)));
                return list;
            })();
            breakdownQuestions.set(key, promise);
            // Sestavené ze semínka (server otázky neměl nebo nebyl k zastižení) se příště zkusí načíst znovu
            promise.then(() => { if (!complete) breakdownQuestions.delete(key); }, () => breakdownQuestions.delete(key));
        }
        return breakdownQuestions.get(key);
    };
    const hasDetails = (row) => Boolean(row) && (row.answer !== null && row.answer !== undefined || Number.isInteger(row.hints) || Number.isInteger(row.ms));
    // question = zadání otázky: u správné odpovědi bez uloženého textu (boti, starší odpovědi) se ukáže správná odpověď ze zadání
    const breakdownCell = (row, who, question = null) => {
        if (!row) {
            return `<div data-bd-cell="none" class="min-w-0 rounded-xl bg-slate-100 px-2 py-1 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"><p class="text-[12.5px] font-bold"><span class="sr-only">${escapeHtml(who)}: </span>bez odpovědi</p></div>`;
        }
        const tone = row.correct ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-900/30 dark:text-rose-100';
        const text = row.answer || (row.correct ? (question && question.answer) || 'Správně' : 'Špatně');
        const facts = [`<span>${escapeHtml(`${row.points} b`)}</span>`];
        if (Number.isInteger(row.hints)) facts.push(`<span class="inline-flex items-center gap-0.5" title="Použité nápovědy"><i data-lucide="lightbulb" class="h-3 w-3"></i>${row.hints}<span class="sr-only"> nápověd</span></span>`);
        if (Number.isInteger(row.ms)) facts.push(`<span class="inline-flex items-center gap-0.5" title="Čas na otázku"><i data-lucide="timer" class="h-3 w-3"></i>${escapeHtml(formatQuestionTime(row.ms))}</span>`);
        return `<div data-bd-cell="${row.correct ? 'ok' : 'bad'}" class="min-w-0 rounded-xl px-2 py-1 ${tone}">
                <p class="flex items-center gap-1 text-[12.5px] font-bold leading-tight"><span class="sr-only">${escapeHtml(who)}: </span><i data-lucide="${row.correct ? 'check' : 'x'}" class="h-3.5 w-3.5 shrink-0"></i><span class="line-clamp-2 break-words">${escapeHtml(text)}</span><span class="sr-only">${row.correct ? ' (správně)' : ' (špatně)'}</span></p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] font-semibold tabular-nums opacity-80">${facts.join('')}</p>
            </div>`;
    };
    const breakdownHead = (entry, label) => `
        <div class="flex min-w-0 items-center gap-1.5">
            ${avatarHtml(entry.player, 'h-7 w-7 text-sm')}
            <span class="min-w-0"><span class="block truncate text-[12.5px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(label)}</span>
            <span class="block text-[10.5px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">${entry.correct === null ? '' : `<b class="font-black text-slate-700 dark:text-slate-200">${entry.points} b</b> · ${entry.correct}/${entry.count}${Number.isInteger(entry.time_ms) ? ` · ${formatQuestionTime(entry.time_ms)}` : ''}`}</span></span>
        </div>`;
    // state: { def, players: [{ user_id, player, correct, points }], meId, rivalId, questions, answers ({ [userId]: [...] } | null), local, error }
    const renderBreakdown = (state) => {
        const { def, meId } = state;
        const me = state.players.find(row => row.user_id === meId) || { user_id: meId, player: null, correct: null, points: null };
        const meLabel = state.spectator ? playerName(me.player) : 'Ty';
        const rivals = state.players.filter(row => row.user_id !== meId);
        const rival = rivals.find(row => row.user_id === state.rivalId) || rivals[0] || null;
        const count = def.count;
        const mineRows = (state.answers && state.answers[meId]) || state.local || [];
        const rivalRows = rival && state.answers ? state.answers[rival.user_id] || [] : [];
        const notes = [];
        if (!state.answers) notes.push('Soupeřovy odpovědi po otázkách teď databáze neposílá (je potřeba aktualizovat schéma). Vidíš jen své odpovědi z tohoto zařízení.');
        else if (state.spectator && !mineRows.some(Boolean)) notes.push(`${meLabel}: odpovědi po otázkách se u téhle hry neuložily.`);
        if (state.answers && rival && !rivalRows.some(Boolean)) notes.push(state.spectator ? `${playerName(rival.player)}: odpovědi po otázkách se u téhle hry neuložily.` : 'Soupeřovy odpovědi po otázkách se u téhle hry neuložily.');
        const shown = [...mineRows, ...rivalRows].filter(Boolean);
        if (shown.some(row => !hasDetails(row))) notes.push('U starších odpovědí se ukládalo jen, jestli byly správně, a body (bez textu odpovědi, nápověd a času).');
        if (!state.questions) notes.push('Zadání otázek se teď nepodařilo načíst.');
        const rows = Array.from({ length: count }, (_, index) => {
            const question = state.questions ? state.questions[index] : null;
            const head = `<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">${index + 1}</span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(question ? `${question.title}${question.subject ? ` · ${question.subject}` : ''}` : `Otázka ${index + 1}`)}</span>
                    ${question ? `<span class="line-clamp-2 break-words text-[13px] font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(question.answer)}</span>` : ''}
                </span>`;
            return `<li data-bd-row="${index}" class="rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800">
                ${question && isKnownRef(question) ? `<button type="button" data-bd-info data-topic="${escapeHtml(question.topic)}" data-id="${escapeHtml(question.id)}" class="flex w-full items-start gap-2 rounded-xl text-left" aria-label="${escapeHtml(`Otázka ${index + 1}: ${question.answer} – popis`)}">${head}<i data-lucide="info" class="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"></i></button>`
                    : `<div class="flex items-start gap-2">${head}</div>`}
                <div class="mt-1.5 grid grid-cols-2 gap-1.5">${breakdownCell(mineRows[index] || null, meLabel, question)}${rival ? breakdownCell(rivalRows[index] || null, playerName(rival.player), question) : ''}</div>
            </li>`;
        }).join('');
        const picker = rivals.length > 1 ? `<div role="group" aria-label="Porovnat s hráčem" class="flex gap-1.5 overflow-x-auto pb-1">${rivals.slice(0, 20).map(row => `<button type="button" data-bd-rival="${escapeHtml(row.user_id)}" aria-pressed="${rival && row.user_id === rival.user_id}" class="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-bold ${rival && row.user_id === rival.user_id ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}">${avatarHtml(row.player, 'h-5 w-5 text-[11px]')}<span class="max-w-[7rem] truncate">${escapeHtml(playerName(row.player))}</span></button>`).join('')}</div>` : '';
        return `<div class="flex flex-col gap-2">
                ${picker}
                <div class="sticky top-11 z-10 -mx-1 grid grid-cols-2 gap-1.5 bg-slate-50 px-1 py-1.5 dark:bg-slate-900">
                    ${breakdownHead({ ...me, count }, meLabel)}
                    ${rival ? breakdownHead({ ...rival, count }, playerName(rival.player)) : ''}
                </div>
                <ol id="breakdown-list" class="flex flex-col gap-1.5">${rows}</ol>
                ${notes.map(note => `<p data-bd-note class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">${escapeHtml(note)}</p>`).join('')}
                <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">Klepnutím na otázku se ukáže popis odpovědi.</p>
            </div>`;
    };
    let breakdownToken = 0;
    // players: výsledky hráčů (user_id, player, correct, points); load: odpovědi ze serveru; local: moje odpovědi z tohoto zařízení
    // viewAs = divák cizího zápasu: první sloupec patří tomuto hráči (jménem, ne „Ty“)
    // questions = vlastní seznam zadání (Kvíz dne); jinak se otázky vyberou ze semínka výzvy (def)
    // back = { label, run }: nahoře tlačítko zpět do okna, ze kterého se rozpis otevřel (okno turnaje, turnaj z archivu)
    const openBreakdown = async ({ def, players, load, local = null, viewAs = null, questions: questionList = null, back = null }) => {
        const user = signedUser();
        if (!user || !Social) return;
        const token = ++breakdownToken;
        const stillOpen = () => { const overlay = document.getElementById('dialog-overlay'); return token === breakdownToken && Boolean(overlay && overlay.dataset.title === BREAKDOWN_TITLE); };
        const backHtml = back ? `<button type="button" data-bd-back data-x-back class="mb-2 inline-flex min-h-[2.5rem] items-center gap-1 rounded-xl bg-white px-2.5 text-[12px] font-black text-slate-700 ring-1 ring-slate-300/70 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"><i data-lucide="chevron-left" class="h-4 w-4"></i>${escapeHtml(back.label)}</button>` : '';
        const goBack = (event) => { if (back && event.target.closest('[data-bd-back]')) { back.run(); return true; } return false; };
        showDialog(BREAKDOWN_TITLE, `${backHtml}<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám rozpis…</p>`, { onClick: goBack });
        const [answers, questions] = await Promise.all([
            Promise.resolve().then(load).then(value => ({ value }), error => ({ error })),
            (questionList || challengeQuestionList(def)).catch(error => { console.error(error); return null; })
        ]);
        if (!stillOpen()) return;
        if (answers.error) {
            const denied = answers.error.status === 403 || answers.error.status === 401;
            const deniedText = viewAs ? 'Rozpis zápasů tohoto kola uvidíš, až odehraješ svůj zápas (a databáze je ve verzi 13).' : 'Rozpis otázek uvidíš, až hru dohraješ ty i soupeř.';
            showDialog(BREAKDOWN_TITLE, backHtml + DIALOG_NOTE(denied ? deniedText : 'Rozpis se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'), { onClick: goBack });
            return;
        }
        const ranked = players.map(row => ({ user_id: row.user_id, player: row.player || null, correct: Number.isInteger(row.correct) ? row.correct : null, points: Number.isInteger(row.points) ? row.points : null, time_ms: Number.isInteger(row.time_ms) ? row.time_ms : null }));
        const meId = viewAs || user.id;
        const state = { def, players: ranked, meId, spectator: Boolean(viewAs), rivalId: null, questions, answers: answers.value, local: Array.isArray(local) ? local : null };
        // Výchozí soupeř: ten, kdo má odpovědi (u výzvy pro víc hráčů první v pořadí)
        const withRows = ranked.filter(row => row.user_id !== meId && state.answers && state.answers[row.user_id]);
        state.rivalId = (withRows[0] || ranked.find(row => row.user_id !== meId) || {}).user_id || null;
        const draw = () => showDialog(BREAKDOWN_TITLE, backHtml + renderBreakdown(state), {
            onClick: (event) => {
                if (goBack(event)) return;
                const info = event.target.closest('[data-bd-info]');
                if (info) { openItemInfo(info.dataset.topic, info.dataset.id); return; }
                const pick = event.target.closest('[data-bd-rival]');
                if (pick) { state.rivalId = pick.dataset.bdRival; draw(); }
            }
        });
        draw();
    };
    // Rozpis výzvy (z výsledku výzvy i z okna výzvy): moje odpovědi z tohoto zařízení, když je databáze nemá
    const openChallengeBreakdown = (def, results) => {
        const code = def.code || def.id;
        const user = signedUser();
        const local = challenge && !challenge.tournament && challenge.code === code && (!challenge.owner || !user || challenge.owner === user.id) ? challenge.results : null;
        openBreakdown({
            def: { topic: def.topic, seed: def.seed, count: def.count, level: challengeLevel(def), categories: def.categories || [], tournament: null },
            players: results || [], load: () => Social.challengeDetails(code, def.count), local
        });
    };
    // Rozpis zápasu turnaje: otázky ze semínka turnaje a kola (stejně jako tournamentChallengeDef)
    // back = { label, run }: tlačítko zpět do okna turnaje (z okna turnaje i z archivu)
    const openTournamentBreakdown = (tid, mid, back = null) => {
        const view = findTournament(tid);
        const match = view && view.matches.find(item => item.id === mid);
        if (!view || !match || !Tournament) return;
        const entries = new Map(view.entries.map(entry => [entry.user_id, entry]));
        const players = [match.p1, match.p2].map(userId => {
            const result = match.results.find(item => item.user_id === userId && item.finished_at);
            return { user_id: userId, player: (entries.get(userId) || {}).player || null, correct: result ? result.correct : null, points: result ? result.points : null, time_ms: result ? result.time_ms : null };
        });
        const user = signedUser();
        // Cizí zápas: divák vidí oba hráče jménem (první sloupec = hráč 1)
        const spectator = !user || !Tournament.involves(match, user.id);
        const local = !spectator && challenge && challenge.tournament && challenge.tournament.mid === mid ? challenge.results : null;
        openBreakdown({
            def: { topic: view.tournament.topic, seed: `${view.tournament.seed}-r${match.round}`, count: Tournament.QUESTIONS, level: 1, categories: [],
                tournament: { seedBase: view.tournament.seed, round: match.round, maps: tournamentMaps(view.tournament) } },
            players, load: () => Social.tournamentDetails(mid), local, viewAs: spectator ? match.p1 : null, back
        });
    };
    // Rozpis zápasu jde otevřít, když ho hráč dohrál a soupeř také (nebo je zápas rozhodnutý). Cizí zápas (stejně jako
    // tournament_details v databázi): rozhodnutý, aspoň jeden hráč ho odehrál a já nemám v tomtéž kole vlastní zápas neodehraný
    // (zápasy kola mají stejné otázky). matches = všechny zápasy turnaje.
    const canTournamentBreakdown = (match, meId, matches = []) => {
        if (!match || !meId) return false;
        const done = (m, userId) => (m.results || []).some(item => item.user_id === userId && item.finished_at);
        if (!Tournament.involves(match, meId)) {
            if (!match.winner || !(done(match, match.p1) || done(match, match.p2))) return false;
            return !matches.some(other => other.round === match.round && Tournament.involves(other, meId) && !other.winner && !done(other, meId));
        }
        const rival = match.p1 === meId ? match.p2 : match.p1;
        return done(match, meId) && (done(match, rival) || Boolean(match.winner));
    };
    const BREAKDOWN_LINK = 'flex min-h-[2.25rem] items-center justify-center gap-1.5 self-start rounded-lg px-1 text-[12px] font-black text-brand-700 hover:underline dark:text-brand-200';

    // Po poslední otázce: zapíše výsledek (první platí) a ukáže žebříček výzvy
    // Dohraná výzva se zapamatuje (kód) a uložená relace se označí jako hotová, ať ji úvod po dalším spuštění nenabízí k pokračování
    const FINISHED_KEY = 'mudrlant.finishedChallenges';
    const finishedChallenges = () => { const list = readJson(FINISHED_KEY); return Array.isArray(list) ? list.filter(code => typeof code === 'string') : []; };
    const markChallengeFinished = (code) => {
        if (!code) return;
        forgetOpenChallenge(`c:${code}`);
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
        // Výzvu rozehrál jiný účet (mezitím se v jiné kartě přihlásil někdo jiný): jeho odpovědi se pod tenhle účet neodešlou
        if (c.owner && c.owner !== user.id) { challenge = null; mode = 'daily'; renderHome(); showToast('Tuhle výzvu rozehrál jiný účet.'); return; }
        c.sending = true;
        c.done = true;
        renderChallengeDone(null, 'sending');
        let correct = 0;
        let points = 0;
        try {
            try {
                // Odpovědi, které server ještě nemá (bez spojení), se odešlou nejdřív: výsledek server sečte z nich
                if ((await syncAnswers(c)) === false) throw new Error('Odpovědi se nepodařilo uložit.');
                correct = c.results.filter(row => row && row.correct).length;
                points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
                await Social.submitResult(user.id, c.code, { correct, points });
            } catch (error) {
                // Výsledek není uložený: výzva zůstane rozehraná (úvod nabídne její dokončení, i po zavření aplikace), ať se neztratí
                // a nejde ji hrát znovu od začátku. Server průběh odmítl: příště se načte znovu.
                c.done = false;
                if (error && error.status === 400) c.synced = -1;
                throw error;
            }
            // Až uložený výsledek: dohraná výzva se zapamatuje a úvod ji už nenabízí
            markChallengeFinished(c.code);
            const results = await Social.getResults(c.code);
            // Rating po výzvě počítá databáze; změnu (a nový rating do karty ligy) načteme, ať ji hráč vidí hned
            if (Rating && results.length > 1 && !c.ratingChange) {
                c.ratingChange = await Social.getRatingChange(user.id, c.code).catch(() => null);
                if (c.ratingChange) myRating = await Social.getRating(user.id).catch(() => myRating);
                // Vrchol ligové sezóny se mohl zvýšit
                if (c.ratingChange) refreshLeagueSeasons(user, true);
            }
            if (!c.counted) {
                c.counted = true;
                const rivals = results.filter(row => row.user_id !== user.id);
                const won = rivals.length > 0 && rivals.every(row => compareResults({ correct, points }, row) > 0);
                const progress = loadProgress();
                const counters = progress.counters;
                counters.challenges += 1;
                if (won) { counters.wins += 1; counters.winRun += 1; counters.bestWinRun = Math.max(counters.bestWinRun, counters.winRun); }
                else if (rivals.length) counters.winRun = 0;
                chronicleLog({ challenge: won ? 'win' : rivals.length ? 'loss' : 'played' });
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

    // --- Kvíz dne (daily-quiz.js): stejných 10 otázek pro všechny, jeden započítaný pokus denně, pořadí dne a přátel ---
    // Pokus (otázky, odpovědi, otázka na obrazovce) drží zařízení v mudrlant.dailyQuiz; přihlášenému ho drží i server (schéma 6, daily_quiz_*):
    // každá odpověď se hned uloží, pokus nejde začít znovu a po zavření aplikace se pokračuje stejnou otázkou (nápovědy zůstanou, čas běží dál).
    // Po půlnoci se nedohraný pokus počítá, jak stál. Host hraje jen v zařízení (jeden pokus za den a zařízení) a do pořadí se nezapíše;
    // po přihlášení se jeho dnešní výsledek zapíše na účet, pokud tam Kvíz dne ještě není. Sdílení textem i obrázkem dělá share-card.js.
    const DailyQuiz = window.MudrlantDailyQuiz || null;
    const ShareCard = window.MudrlantShareCard || null;
    const QUIZ_LOGIN_KEY = 'mudrlant.quizLogin';
    let quiz = null; // hraný pokus (attempt z daily-quiz.js)
    let quizIndex = 0; // otázka, která se právě hraje
    let quizView = null; // obrazovka výsledku: { day, tab ('all' | 'friends'), board, friends } – null = načítá se, false = nedostupné
    let quizServer = null; // poslední stav ze serveru { userId, day, state (null = databáze Kvíz dne nemá) }
    let quizServerAt = 0;
    let quizOpening = false;
    const quizGroups = () => groupedTopics().map(group => group.topics.map(topic => topic.id));
    const quizRanked = () => Boolean(DailyQuiz && Social && Auth && Auth.isConfigured() && signedUser());
    const quizState = () => DailyQuiz.rollover(DailyQuiz.parseState(readJson(DailyQuiz.KEY)), DailyQuiz.pragueDay());
    const storeQuiz = (attempt = quiz) => { const state = quizState(); if (attempt) state.attempt = attempt; writeJson(DailyQuiz.KEY, state); return state; };
    const quizServerState = (day) => { const user = signedUser(); return user && quizServer && quizServer.userId === user.id && quizServer.state && quizServer.state.day === day ? quizServer.state : null; };
    const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(undefined), ms))]);
    const appUrl = () => `${window.location.origin}${window.location.pathname}`;
    const robeNow = () => document.documentElement.dataset.robe || 'vinova';
    const fromServer = (state) => ({ answered: state.answered, correct: state.correct, score: state.score, time_ms: state.time_ms, bitmap: state.bitmap });
    // Server platí: odpovědi, které má jinak (jiné zařízení), přepíšou místní; místní za nimi zůstanou a dopošlou se
    const applyQuizServer = (attempt, state) => {
        const user = signedUser();
        if (user) { quizServer = { userId: user.id, day: state.day, state }; quizServerAt = Date.now(); }
        if (state.day !== attempt.day) return false;
        const bits = DailyQuiz.bitsOf(state.bitmap, state.answered);
        for (let i = 0; i < state.answered; i++) if (!attempt.results[i] || attempt.results[i].correct !== bits[i]) attempt.results[i] = { correct: bits[i], points: null, ms: 0 };
        if (attempt.open && attempt.open.index < state.answered) attempt.open = null;
        attempt.server = fromServer(state);
        attempt.synced = state.answered;
        if (state.finished) attempt.done = true;
        if (attempt === quiz) storeQuiz(attempt);
        return true;
    };
    // Dnešní pokus pro tohoto hráče: hostovi patří pokus zařízení, přihlášenému jeho (nebo hostovský, který si tím převezme); server má přednost
    const reconcileQuiz = (attempt, server, today) => {
        const user = signedUser();
        if (!user) return attempt;
        let own = attempt && (attempt.owner === user.id || attempt.owner === 'host') ? attempt : null;
        if (own) own.owner = user.id;
        if (!server) return own;
        if (server.started) {
            if (!own) own = DailyQuiz.newAttempt(today, user.id);
            applyQuizServer(own, server);
            return own;
        }
        // Server pokus ještě nemá: hostovský nebo neodeslaný se mu pošle celý (od začátku)
        if (own) own.synced = -1;
        return own;
    };

    // Odesílání odpovědí na server jde po sobě; true = server má vše, false = nepodařilo se (bez spojení), null = databáze Kvíz dne nemá
    let quizSync = Promise.resolve(true);
    const pushQuiz = async (attempt) => {
        const user = signedUser();
        if (!attempt || !quizRanked() || attempt.owner !== user.id) return false;
        let retried = false;
        for (;;) {
            try {
                if (attempt.synced < 0) {
                    const state = await Social.dailyQuizStart();
                    if (!state) return null;
                    if (!applyQuizServer(attempt, state)) return false;
                }
                while (attempt.synced < attempt.results.length) {
                    const index = attempt.synced;
                    const state = await Social.dailyQuizAnswer(attempt.day, index, attempt.results[index]);
                    if (!state) return null;
                    if (!applyQuizServer(attempt, state) || attempt.synced <= index) return false;
                }
                return true;
            } catch (error) {
                // Server odpověď odmítl (má jinou, chybí mu předchozí): načte se jeho stav a zbytek se dopošle; podruhé už se nezkouší
                if (retried || !error || !(error.status >= 400 && error.status < 500) || error.status === 401) return false;
                retried = true;
                const state = await Social.dailyQuizState().catch(() => null);
                if (!state || !applyQuizServer(attempt, state)) return false;
                if (!state.started) attempt.synced = -1;
            }
        }
    };
    const syncQuiz = (attempt = quiz) => { quizSync = quizSync.then(() => flushPendingSnapshots()).then(() => pushQuiz(attempt)).catch(() => false); return quizSync; };

    // Stav serveru pro kartu na úvodu (nejvýš jednou za 5 minut; po dohrání a přihlášení hned)
    const refreshQuizServer = async (force = false) => {
        const user = signedUser();
        if (!quizRanked()) return;
        const today = DailyQuiz.pragueDay();
        if (!force && quizServer && quizServer.userId === user.id && quizServer.day === today && Date.now() - quizServerAt < 5 * 60000) return;
        quizServerAt = Date.now();
        try {
            const state = await Social.dailyQuizState();
            quizServer = { userId: user.id, day: state ? state.day : today, state };
        } catch (error) { quizServerAt = 0; return; }
        paintQuizCard();
    };
    const quizHomeView = () => {
        const today = DailyQuiz.pragueDay();
        const state = quizState();
        const user = signedUser();
        const attempt = state.attempt && state.attempt.day === today && (!user || state.attempt.owner === 'host' || state.attempt.owner === user.id) ? state.attempt : null;
        const server = quizServerState(today);
        let summary = attempt ? DailyQuiz.attemptSummary(attempt) : null;
        let done = Boolean(attempt && attempt.done);
        if (server && server.started && (!summary || server.answered >= summary.answered)) { summary = fromServer(server); done = done || server.finished; }
        const status = done ? 'done' : (summary && summary.answered) || (attempt && attempt.open) ? 'progress' : 'new';
        const streak = Math.max(server ? server.streak : 0, quizStreakOf(DailyQuiz.playedDays(state, today), today));
        return { status, answered: summary ? summary.answered : 0, summary, rank: attempt && attempt.rank ? attempt.rank.rank : null, streak };
    };
    const quizHomeCard = () => (DailyQuiz ? DailyQuiz.homeCardHtml(quizHomeView()) : '');
    const paintQuizCard = () => {
        const card = document.getElementById('quiz-card');
        if (!card || screen !== 'home') return;
        card.outerHTML = quizHomeCard();
        renderIcons(appContent);
    };
    const quizHelpers = () => {
        const user = signedUser();
        return {
            avatarHtml, xpLine: (xp) => xpLine(xp, 'text-white/90'),
            topicIcon: (id) => (TOPIC_BY_ID[id] ? topicIcon(TOPIC_BY_ID[id], 'h-6 w-6', `rounded-md p-1 ${styleOf(TOPIC_BY_ID[id]).soft}`, 'h-4 w-4') : ''),
            meRow: user ? { id: user.id, display_name: (myProfile && myProfile.display_name) || 'Ty', avatar: myProfile ? myProfile.avatar : '🦉', color: myProfile ? myProfile.color : 'emerald', owl: myProfile ? myProfile.owl : null, frame: myProfile ? myProfile.frame : null } : {}
        };
    };

    // Zadání deseti otázek Kvízu dne pro rozpis: položky z plánu dne (u mého pokusu uložené), otázka se stejným semínkem jako ve hře
    // Otázka uložená na serveru (zamrzlé otázky) má přednost: je přesně ta, kterou hráči hráli, i když se data mezitím změnila
    const quizQuestionList = async (day) => {
        const groups = quizGroups();
        const slots = DailyQuiz.slotsFor(day, groups);
        const seeds = Array.from({ length: DailyQuiz.QUESTIONS }, (_, index) => DailyQuiz.questionSeed(day, index));
        const ids = [...new Set(slots.map(slot => slot.topic))].filter(id => TOPIC_BY_ID[id]);
        const [frozen, loaded] = await Promise.all([frozenQuestions(seeds), Promise.all(ids.map(id => loadTopic(id)))]);
        const contexts = new Map(loaded.map(ctx => [ctx.topic.id, ctx]));
        const own = quiz && quiz.day === day ? quiz.plan : [];
        const plan = DailyQuiz.planDay(day, groups, (id) => { const ctx = contexts.get(id); return ctx ? { items: ctx.items, categories: ctx.topic.categories.map(category => category.key) } : null; }, DailyQuiz.QUESTIONS - 1);
        return Array.from({ length: DailyQuiz.QUESTIONS }, (_, index) => {
            if (frozen[seeds[index]]) { try { return describeSnapshot(frozen[seeds[index]]); } catch (error) { console.error(error); } }
            const pick = own[index] && contexts.get(own[index].topic) ? own[index] : plan[index];
            const ctx = pick ? contexts.get(pick.topic) : null;
            const item = ctx ? ctx.byId.get(pick.q) : null;
            try { return describeChallengeQuestion({ item, ctx, rng: createSeededRandom(DailyQuiz.questionSeed(day, index)) }); } catch (error) { console.error(error); return null; }
        });
    };
    // Rozpis Kvízu dne z pořadí: klepnutý hráč vedle mě (moje odpovědi i z tohoto zařízení); cizí odpovědi pošle server až po dohrání
    const openQuizBreakdown = (playerId) => {
        const user = signedUser();
        if (!user || !quizView || !Social || !Social.dailyQuizDetails) return;
        const rows = [...((quizView.board && quizView.board.top) || []), ...((quizView.friends && quizView.friends.rows) || [])];
        const target = rows.find(row => row.id === playerId);
        if (!target) return;
        const toPlayer = (row) => ({ user_id: row.id, player: row, correct: row.correct, points: row.score, time_ms: row.time_ms });
        const mine = rows.find(row => row.me || row.id === user.id) || (quizView.board && quizView.board.me ? { ...quizView.board.me, ...quizHelpers().meRow, id: user.id } : null);
        const players = [...(mine ? [toPlayer(mine)] : []), ...(target.id !== user.id ? [toPlayer(target)] : [])];
        const day = quizView.day;
        openBreakdown({
            def: { count: DailyQuiz.QUESTIONS }, players, questions: quizQuestionList(day),
            load: () => Social.dailyQuizDetails(day, players.map(row => row.user_id)),
            local: quiz && quiz.day === day ? quiz.results : null
        });
    };
    // Úvod Kvízu dne jde vypnout (zaškrtnutím na úvodu): kvíz pak po klepnutí rovnou začne; zapnout zpět jde v Nastavení → Hra
    const QUIZ_SKIP_INTRO_KEY = 'mudrlant.quizSkipIntro';
    const quizSkipIntro = () => { try { return localStorage.getItem(QUIZ_SKIP_INTRO_KEY) === '1'; } catch (e) { return false; } };
    const setQuizSkipIntro = (on) => { try { if (on) localStorage.setItem(QUIZ_SKIP_INTRO_KEY, '1'); else localStorage.removeItem(QUIZ_SKIP_INTRO_KEY); } catch (e) {} };
    // Úvod Kvízu dne (pravidla a Začít / Pokračovat), nebo rovnou výsledek, když je dnešní pokus dohraný
    const openQuiz = async () => {
        if (!DailyQuiz || quizOpening || isLoading) return;
        quizOpening = true;
        try {
            let today = DailyQuiz.pragueDay();
            const state = quizState();
            let server;
            if (quizRanked()) {
                screen = 'quiz';
                renderLoading('Načítám Kvíz dne…');
                updateControlsUI();
                server = await within(Social.dailyQuizState().catch(() => undefined), 6000);
                if (server) { quizServer = { userId: signedUser().id, day: server.day, state: server }; quizServerAt = Date.now(); }
                if (server === null) quizServer = { userId: signedUser().id, day: today, state: null };
                // Den určuje server (telefon může mít jiný čas)
                if (server && server.day) today = server.day;
            }
            const local = state.attempt && state.attempt.day === today ? state.attempt : null;
            quiz = reconcileQuiz(local, server, today);
            if (quiz) storeQuiz(quiz);
            // Všech deset otázek zodpovězených v tomto zařízení bez připsaných XP (aplikace se zavřela před „Dokončit“): dokončí se teď;
            // pokus dohraný jinde (odpovědi ze serveru nemají body) se jen ukáže
            const playedHere = Boolean(quiz) && quiz.results.length === DailyQuiz.QUESTIONS && quiz.results.every(row => row.points !== null);
            if (quiz && playedHere && !quiz.xp) { finishQuiz(); return; }
            if (quiz && (quiz.done || DailyQuiz.nextIndex(quiz) < 0)) { if (quiz.done) showQuizResult(); else finishQuiz(); return; }
            if (quizSkipIntro()) { startQuiz(); return; }
            renderQuizIntro(today, server === null);
        } finally {
            quizOpening = false;
        }
    };
    const renderQuizIntro = (day, offline = false) => {
        screen = 'quiz';
        closePlaceInfo();
        const topics = DailyQuiz.slotsFor(day, quizGroups()).map(slot => slot.topic);
        appContent.innerHTML = DailyQuiz.introHtml({ day, topics, answered: quiz ? quiz.results.length : 0, open: Boolean(quiz && quiz.open), guest: !quizRanked() && Boolean(Auth && Auth.isConfigured()), offline: offline && quizRanked(), skipIntro: quizSkipIntro() }, quizHelpers());
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
    };
    const startQuiz = () => {
        if (!DailyQuiz || isLoading) return;
        const user = signedUser();
        const server = user && quizServer && quizServer.userId === user.id ? quizServer.state : null;
        const today = server && server.day ? server.day : DailyQuiz.pragueDay();
        if (!quiz || quiz.day !== today) quiz = DailyQuiz.newAttempt(today, user ? user.id : 'host');
        if (quiz.done) { showQuizResult(); return; }
        storeQuiz(quiz);
        // Přihlášený: server založí pokus (a začne měřit čas) hned, ještě během načítání první otázky; bez spojení se to dožene s první odpovědí
        if (quizRanked() && quiz.owner === user.id) syncQuiz(quiz);
        playQuizQuestion(DailyQuiz.nextIndex(quiz));
    };
    // Otázka index: položku určuje plán dne (stejný pro všechny); jednou ukázaná otázka se při pokračování vezme stejná i po aktualizaci dat
    const playQuizQuestion = (index) => {
        if (!quiz) return;
        if (index < 0) { finishQuiz(); return; }
        const attempt = quiz;
        quizIndex = index;
        mode = 'quiz';
        const groups = quizGroups();
        const slot = DailyQuiz.slotsFor(attempt.day, groups)[index];
        runRound(async () => {
            const seed = DailyQuiz.questionSeed(attempt.day, index);
            // Otázka uložená na serveru (zamrzlé otázky): stejná pro všechny, i když má tohle zařízení jinou verzi dat
            const frozen = (await frozenQuestions([seed]))[seed];
            if (frozen) { await loadTopic(frozen.topic).catch(() => null); return { frozen, snapshotSeed: seed }; }
            const rng = createSeededRandom(seed);
            const local = async () => {
                const saved = attempt.plan[index];
                if (saved && TOPIC_BY_ID[saved.topic]) {
                    const ctx = await loadTopic(saved.topic);
                    const item = ctx.byId.get(saved.q);
                    if (item) return { item, ctx, rng };
                }
                const ids = [...new Set(DailyQuiz.slotsFor(attempt.day, groups).slice(0, index + 1).map(entry => entry.topic))].filter(id => TOPIC_BY_ID[id]);
                const contexts = new Map((await Promise.all(ids.map(id => loadTopic(id)))).map(ctx => [ctx.topic.id, ctx]));
                const plan = DailyQuiz.planDay(attempt.day, groups, (id) => { const ctx = contexts.get(id); return ctx ? { items: ctx.items, categories: ctx.topic.categories.map(category => category.key) } : null; }, index);
                const pick = plan[index];
                const ctx = pick ? contexts.get(pick.topic) : null;
                return { item: ctx ? ctx.byId.get(pick.q) : null, ctx, rng };
            };
            return { ...(await local()), snapshotSeed: seed };
        }, slot ? TOPIC_BY_ID[slot.topic] || null : null);
    };
    // Otázka je na obrazovce: vždy výběr z možností, čas od prvního zobrazení (po návratu běží dál), nápovědy jako před zavřením
    const quizRoundReady = () => {
        if (!quiz || !round || !current) return;
        round.variant = 'choices';
        const open = quiz.open && quiz.open.index === quizIndex ? quiz.open : { index: quizIndex, at: Date.now(), hint: 1 };
        round.timerStart = open.at;
        round.hintLevel = Math.min(Math.max(1, open.hint || 1), getLevelCount(current));
        quiz.open = open;
        // Položka otázky do plánu pokusu (u otázky ze serveru platí její, i kdyby ji místní plán vybral jinak)
        if (!quiz.plan[quizIndex] || quiz.plan[quizIndex].topic !== current.topic || quiz.plan[quizIndex].q !== current.id) quiz.plan[quizIndex] = { topic: current.topic, q: current.id };
        storeQuiz(quiz);
    };
    // Při každém překreslení otázky: použité nápovědy do uloženého stavu (zavření aplikace je nevrátí)
    const quizKeepOpen = () => {
        if (!quiz || !round || round.answered || !quiz.open || quiz.open.index !== quizIndex || quiz.open.hint === round.hintLevel) return;
        quiz.open.hint = round.hintLevel;
        storeQuiz(quiz);
    };
    const quizRecord = () => {
        if (!quiz || quiz.results.length !== quizIndex) return;
        const ms = Math.max(0, Date.now() - (round.timerStart || Date.now()));
        const details = answerDetails();
        quiz.results.push({ correct: Boolean(round.correct), points: round.correct ? Math.min(DailyQuiz.MAX_POINTS, round.points) : 0, ms: Math.min(ms, 3600000),
            ...(details.answer ? { answer: details.answer } : {}), hints: details.hints });
        quiz.open = null;
        storeQuiz(quiz);
    };
    const quizNextLabel = () => (quiz && quiz.results.length < DailyQuiz.QUESTIONS ? `Další otázka (${quiz.results.length + 1}/${DailyQuiz.QUESTIONS})` : 'Dokončit Kvíz dne');

    // Konec: XP jednou za den a zařízení (dokončení, série, bez chyby), záznam dne do série hosta, pak výsledek s pořadím
    const finishQuiz = async () => {
        const attempt = quiz;
        if (!attempt) { renderHome(); return; }
        attempt.open = null;
        attempt.done = true;
        storeQuiz(attempt);
        quizView = { day: attempt.day, tab: 'all', board: null, friends: null };
        if (quizRanked() && attempt.owner === signedUser().id) {
            renderQuizResult();
            await within(syncQuiz(attempt), 8000);
        }
        // XP jen jednou za den a zařízení (awardQuizXp to hlídá sama)
        awardQuizXp(attempt);
        showQuizResult();
    };
    const awardQuizXp = (attempt) => {
        const state = quizState();
        const day = attempt.day;
        const summary = DailyQuiz.attemptSummary(attempt);
        const record = state.days[day] || {};
        state.days[day] = { ...summary, done: true, xp: Boolean(record.xp || attempt.xp) };
        state.attempt = attempt;
        if (record.xp || attempt.xp) { writeJson(DailyQuiz.KEY, state); return; }
        const server = quizServerState(day);
        const streak = Math.max(quizStreakOf(DailyQuiz.playedDays(state, day), day), server && server.finished ? server.streak : 0);
        attempt.xp = DailyQuiz.xpFor({ correct: summary.correct, streak });
        state.days[day].xp = true;
        writeJson(DailyQuiz.KEY, state);
        const before = loadProgress();
        const progress = { ...before, xp: before.xp + attempt.xp.total };
        // Odznaky a cíle Kvízu dne (jednou za den, jako XP)
        progress.counters.quizDone += 1;
        if (summary.correct >= DailyQuiz.QUESTIONS) progress.counters.quizPerfect += 1;
        progress.counters.quizBestStreak = Math.max(progress.counters.quizBestStreak, streak);
        earnStreakFreeze('q', day, streak);
        const titles = grantBadges(progress);
        saveProgress(progress);
        announce(levelProgress(before.xp).level, levelProgress(progress.xp).level, titles);
        settleGoals();
        applyLook();
        syncProgress();
    };
    const showQuizResult = () => {
        if (!quiz) return;
        if (!quizView || quizView.day !== quiz.day) quizView = { day: quiz.day, tab: 'all', board: null, friends: null };
        // Den do série hosta i u pokusu, který se dohrál jinde (přihlášený na jiném zařízení)
        const state = quizState();
        if (!state.days[quiz.day] || !state.days[quiz.day].done) { state.days[quiz.day] = { ...DailyQuiz.attemptSummary(quiz), done: true, xp: Boolean(quiz.xp) }; state.attempt = quiz; writeJson(DailyQuiz.KEY, state); }
        renderQuizResult();
        loadQuizBoard();
    };
    const quizCardInput = (attempt, summary, streak) => ({
        kicker: 'Kvíz dne', headline: formatPoints(summary.score), detail: `${summary.correct}/${DailyQuiz.QUESTIONS} správně · čas ${DailyQuiz.formatTime(summary.time_ms)}`,
        grid: DailyQuiz.bitsOf(summary.bitmap, summary.answered),
        note: attempt.rank ? `${attempt.rank.rank}. místo z ${attempt.rank.total}` : streak > 1 ? `Série ${DailyQuiz.daysWord(streak)}` : 'Stejných 10 otázek pro všechny',
        day: attempt.day, robe: robeNow(), pose: DailyQuiz.poseFor(summary.correct), url: appUrl(), appName: APP_NAME
    });
    const quizResultData = () => {
        const attempt = quiz;
        const user = signedUser();
        const today = DailyQuiz.pragueDay();
        const state = quizState();
        const summary = DailyQuiz.attemptSummary(attempt);
        const ranked = quizRanked() && attempt.owner === user.id;
        const server = ranked ? quizServerState(attempt.day) : null;
        const played = DailyQuiz.playedDays(state, today);
        const streak = Math.max(server ? server.streak : 0, quizStreakOf(played, today));
        const best = Math.max(streak, server ? server.best_streak : DailyQuiz.bestStreakOf(played));
        return { attempt, summary, ranked, streak, best, pending: ranked && quizServer && quizServer.state !== null && (attempt.synced < 0 || attempt.synced < attempt.results.length) };
    };
    const renderQuizResult = () => {
        if (!quiz) return;
        const keep = screen === 'quiz-done' ? appContent.scrollTop : 0;
        screen = 'quiz-done';
        closePlaceInfo();
        const { attempt, summary, ranked, streak, best, pending } = quizResultData();
        const canLogin = Boolean(Auth && Auth.isConfigured() && Social) && !signedUser();
        appContent.innerHTML = DailyQuiz.resultHtml({
            day: attempt.day, summary, xp: attempt.xp, streak, best, guest: !ranked, canLogin, closed: summary.answered < DailyQuiz.QUESTIONS, pending,
            freezes: Rewards ? Rewards.freezeChip(loadRewards().freezes) : '',
            ranking: ranked ? { tab: quizView.tab, board: quizView.board, friends: quizView.friends } : null
        }, quizHelpers());
        renderIcons(appContent);
        appContent.scrollTo(0, keep);
        updateControlsUI();
        // Obrázek ke sdílení se připraví hned, ať klepnutí na „Sdílet obrázek“ může sdílet bez čekání
        if (ShareCard) ShareCard.prepare(quizCardInput(attempt, summary, streak), ShareCard.fileName('kviz-dne', attempt.day));
    };
    const paintQuizRanking = () => {
        const section = document.getElementById('quiz-ranking');
        if (!section || screen !== 'quiz-done' || !quizView) return;
        section.outerHTML = DailyQuiz.rankingHtml({ tab: quizView.tab, board: quizView.board, friends: quizView.friends }, quizHelpers());
        renderIcons(appContent);
    };
    const loadQuizBoard = async () => {
        const attempt = quiz;
        const view = quizView;
        if (!attempt || !view || !quizRanked() || attempt.owner !== signedUser().id) return;
        // Neodeslané odpovědi nejdřív (jinak by hráč v pořadí chyběl)
        if (attempt.synced < attempt.results.length) await within(syncQuiz(attempt), 8000);
        const [board, friends] = await Promise.all([Social.dailyQuizBoard(attempt.day).catch(() => false), Social.dailyQuizFriends(attempt.day).catch(() => false)]);
        if (quizView !== view || quiz !== attempt) return;
        view.board = board || false;
        view.friends = friends || false;
        if (board && board.me) { attempt.rank = { rank: board.me.rank, total: board.total }; storeQuiz(attempt); }
        if (board && quizServer && quizServer.state && quizServer.state.day === attempt.day) Object.assign(quizServer.state, { streak: board.streak, best_streak: board.best_streak });
        if (screen === 'quiz-done') renderQuizResult();
    };
    const shareQuiz = () => {
        if (!quiz || !ShareCard) return;
        const summary = DailyQuiz.attemptSummary(quiz);
        ShareCard.shareText({ text: DailyQuiz.shareText({ appName: APP_NAME, day: quiz.day, summary, url: appUrl() }) }, { toast: showToast, copied: 'Výsledek je zkopírovaný ve schránce' });
    };
    const shareQuizImage = () => {
        if (!quiz || !ShareCard) return;
        const { attempt, summary, streak } = quizResultData();
        shareImageCounted(quizCardInput(attempt, summary, streak), { name: ShareCard.fileName('kviz-dne', attempt.day), text: DailyQuiz.shareText({ appName: APP_NAME, day: attempt.day, summary, url: appUrl() }), toast: showToast });
    };

    // --- Tajemná otázka dne (mystery.js): jedna tajemná položka denně pro všechny, nápovědy přibývají podle hodin, 3 tipy na den ---
    // Stav (tipy, vyřešení, XP, skrytí včerejší odpovědi) drží zařízení v mudrlant.mystery i s otázkou dne (data z createRoundData, ať se
    // nápovědy během dne nemění). Přihlášenému se každý tip uloží i na server (schéma 19, mystery_*): body a čas vyřešení počítá server,
    // po dořešení (a za minulé dny) ukáže, kolik hráčů otázku uhodlo, nejrychlejší vyřešení, průměr nápověd a výsledky přátel.
    // Starší databáze bez funkcí: hraje se jen v zařízení, bez výsledků ostatních.
    const Mystery = window.MudrlantMystery || null;
    let mysteryView = null; // obrazovka: { day, past, stats, friends, notice } – stats/friends null = načítá se, false = nedostupné
    let mysteryTimer = 0;
    let mysteryBusy = false;
    const mysteryRanked = () => Boolean(Mystery && Social && Auth && Auth.isConfigured() && signedUser());
    const loadMystery = () => Mystery.parseState(readJson(Mystery.KEY));
    const saveMystery = (state) => writeJson(Mystery.KEY, state);
    const mysteryToday = () => Mystery.pragueDay(Date.now());
    const mysteryTopicIds = () => TOPICS.map(topic => topic.id);
    // Položka dne: téma ze semínka dne, v něm známá položka s fotkou (stejně pro všechny)
    const mysteryPick = async (day) => {
        const topicId = Mystery.topicForDay(day, mysteryTopicIds());
        const ctx = await loadTopic(topicId);
        return { ctx, item: Mystery.pickItem(day, topicId, ctx.items) };
    };
    // Otázka dne (zakrytý popis, fakta, fotka, obrazová nápověda, možnosti a přijímané odpovědi); jednou sestavená se pamatuje
    const mysteryRoundFor = async (day) => {
        const state = loadMystery();
        if (state.rounds[day]) return state.rounds[day];
        const { ctx, item } = await mysteryPick(day);
        if (!item) throw new Error('Tajemná otázka nemá položku');
        const data = await createRoundData(item, ctx, createSeededRandom(Mystery.seedFor(day)), { plain: true });
        const fresh = loadMystery();
        fresh.rounds[day] = data;
        if (!fresh.days[day] && day === mysteryToday()) fresh.days[day] = Mystery.newEntry({ topic: ctx.topic.id, q: item.q, name: item.n });
        else if (fresh.days[day] && !fresh.days[day].name) Object.assign(fresh.days[day], { topic: ctx.topic.id, q: item.q, name: item.n });
        saveMystery(fresh);
        return data;
    };
    // Odpověď je pro hráče ještě tajná (zdroj fotky neprozradí autora ani název souboru): dnešní, nevyřešená
    const mysteryHidden = () => {
        if (!Mystery || !mysteryView || mysteryView.past) return false;
        const entry = loadMystery().days[mysteryView.day];
        return !entry || !entry.solved;
    };
    // Včerejší odpověď na úvodu: jen když ji hráč hrál (nebo aspoň otevřel) a ještě ji neskryl
    const mysteryReveal = (state, today) => {
        const day = Mystery.addDays(today, -1);
        const entry = state.days[day];
        return entry && entry.name && !entry.dismissed ? { day, entry } : null;
    };
    let mysteryRevealStats = null; // { day, stats } pro kartu na úvodu
    const mysteryHomeView = () => {
        const now = Date.now();
        const today = Mystery.pragueDay(now);
        const state = loadMystery();
        const reveal = mysteryReveal(state, today);
        if (reveal) return { kind: 'reveal', status: Mystery.statusOf(reveal.entry), name: reveal.entry.name, stats: mysteryRevealStats && mysteryRevealStats.day === reveal.day ? mysteryRevealStats.stats : null };
        const entry = state.days[today] || null;
        const status = Mystery.statusOf(entry);
        return { kind: 'today', status, shown: Mystery.cluesAt(now), next: Mystery.nextClue(now), entry, solvedAt: entry && entry.solved ? Mystery.formatClock(entry.at) : '' };
    };
    const mysteryHomeCard = () => (Mystery ? Mystery.homeCardHtml(mysteryHomeView()) : '');
    const paintMysteryCard = () => {
        const card = document.getElementById('mystery-card');
        if (!card || screen !== 'home') return;
        card.outerHTML = mysteryHomeCard();
        renderIcons(appContent);
    };
    // Statistiky včerejška pro kartu na úvodu (jednou za den)
    const refreshMysteryReveal = async () => {
        if (!Mystery || !mysteryRanked()) return;
        const reveal = mysteryReveal(loadMystery(), mysteryToday());
        if (!reveal || (mysteryRevealStats && mysteryRevealStats.day === reveal.day)) return;
        mysteryRevealStats = { day: reveal.day, stats: null };
        const stats = await Social.mysteryStats(reveal.day).catch(() => null);
        mysteryRevealStats = { day: reveal.day, stats: stats && !stats.hidden ? stats : null };
        paintMysteryCard();
    };
    const dismissMysteryReveal = () => {
        const state = loadMystery();
        const reveal = mysteryReveal(state, mysteryToday());
        if (reveal) { state.days[reveal.day].dismissed = true; saveMystery(state); }
        if (screen === 'mystery') openMystery();
        else paintMysteryCard();
    };

    // Tipy na server po sobě (od prvního neodeslaného); stav serveru (jiné zařízení) se převezme, když má víc tipů
    let mysterySync = Promise.resolve();
    const adoptMysteryServer = (day, server) => {
        if (!server || server.day !== day) return;
        const state = loadMystery();
        const entry = state.days[day];
        if (!entry || server.guesses <= entry.tips.length) return;
        const at = server.solved_at ? Mystery.pragueTime(day, ...server.solved_at.split(':').map(Number)) : Date.now();
        const tips = Array.from({ length: server.guesses }, (_, i) => entry.tips[i] || { text: '', correct: false, clues: server.clues, at });
        if (server.solved) tips[server.guesses - 1] = { ...tips[server.guesses - 1], correct: true, clues: server.clues, at };
        state.days[day] = Mystery.cleanEntry({ ...entry, tips, synced: server.guesses });
        saveMystery(state);
    };
    const pushMystery = async (day) => {
        if (!mysteryRanked() || day !== mysteryToday()) return;
        for (let guard = 0; guard < Mystery.MAX_TIPS; guard++) {
            const state = loadMystery();
            const entry = state.days[day];
            if (!entry || entry.synced >= entry.tips.length) return;
            const idx = entry.synced;
            const tip = entry.tips[idx];
            let server;
            try { server = await Social.mysteryGuess(day, idx, tip.correct, tip.clues); } catch (error) {
                // Server tip odmítl (má jiný, jiné zařízení): převezme se jeho stav a dál se nezkouší
                const current = await Social.mysteryState().catch(() => null);
                if (current) { adoptMysteryServer(day, current); const fresh = loadMystery(); if (fresh.days[day]) { fresh.days[day].synced = Math.min(fresh.days[day].tips.length, current.guesses); saveMystery(fresh); } }
                return;
            }
            if (!server) return;
            const fresh = loadMystery();
            if (fresh.days[day]) { fresh.days[day].synced = Math.max(fresh.days[day].synced, idx + 1); saveMystery(fresh); }
        }
    };
    const syncMystery = (day) => { mysterySync = mysterySync.then(() => pushMystery(day)).catch(() => {}); return mysterySync; };

    // XP za vyřešení jednou za den a zařízení, počítadlo odznaků Detektiv
    const awardMysteryXp = (day) => {
        const state = loadMystery();
        const entry = state.days[day];
        if (!entry || !entry.solved || entry.xp) return;
        const xp = Mystery.xpFor(entry.points);
        entry.xp = xp;
        saveMystery(state);
        const before = loadProgress();
        const progress = { ...before, xp: before.xp + xp };
        progress.counters.mysterySolved = (progress.counters.mysterySolved || 0) + 1;
        const titles = grantBadges(progress);
        saveProgress(progress);
        announce(levelProgress(before.xp).level, levelProgress(progress.xp).level, titles);
        settleGoals();
        applyLook();
        syncProgress();
    };

    const mysteryHelpers = () => ({
        avatarHtml, xpLine: (xp) => xpLine(xp, 'text-white/90'), photoFrame,
        visualFrame: (spec, id) => renderVisualFrame(spec, { id, height: 'h-44' })
    });
    const renderMystery = () => {
        if (!Mystery || !mysteryView) return;
        const view = mysteryView;
        const state = loadMystery();
        const data = state.rounds[view.day];
        if (!data) return;
        const now = Date.now();
        const entry = state.days[view.day] || Mystery.newEntry({ name: data.name });
        const status = Mystery.statusOf(entry);
        const shown = view.past ? Mystery.CLUES : Mystery.cluesAt(now);
        const keep = screen === 'mystery' ? appContent.scrollTop : 0;
        screen = 'mystery';
        closePlaceInfo();
        const topic = TOPIC_BY_ID[data.topic];
        appContent.innerHTML = Mystery.screenHtml({
            day: view.day, past: view.past, shown, next: view.past ? null : Mystery.nextClue(now),
            clues: Mystery.buildClues(data, { topicTitle: topic ? topic.title : '' }), entry, name: entry.name || data.name,
            canGuess: !view.past && (status === 'new' || status === 'open'), finished: view.past || status === 'solved',
            guest: !mysteryRanked(), canLogin: Boolean(Auth && Auth.isConfigured() && Social) && !signedUser(),
            stats: view.stats, friends: view.friends, notice: view.notice,
            xp: entry.xp && !view.past ? { total: entry.xp, parts: [{ label: 'za Tajemnou otázku dne', xp: entry.xp }] } : null,
            placeholder: data.question.placeholder, pointsNow: Mystery.pointsFor(shown, Mystery.wrongTips(entry))
        }, mysteryHelpers());
        renderIcons(appContent);
        // Adresa fotky (název souboru bývá názvem místa) v atributu nezůstane
        appContent.querySelectorAll('[data-mystery-photo="blur"]').forEach(element => { element.style.backgroundImage = cssUrl(element.dataset.url); delete element.dataset.url; });
        appContent.querySelectorAll('[data-mystery-photo="sharp"]').forEach(element => { const url = element.dataset.url; delete element.dataset.url; showPhoto(element, url, null, false, data.photoMasks); });
        appContent.querySelectorAll('[id^="mystery-visual-"]').forEach(element => {
            const clue = Mystery.buildClues(data).find(entry => `mystery-visual-${entry.n}` === element.id);
            const part = clue && clue.parts.find(item => item.type === 'visual');
            if (part) Visuals.render(element, part.spec, visualDeps);
        });
        appContent.scrollTo(0, keep);
        updateControlsUI();
        // Další nápověda se odkryje sama, když hráč zůstane na obrazovce
        clearTimeout(mysteryTimer);
        if (!view.past && shown < Mystery.CLUES && status !== 'solved') {
            const wait = Math.max(1000, Mystery.clueTime(view.day, shown + 1) - now + 500);
            if (wait < 2 ** 31 - 1) mysteryTimer = setTimeout(() => { if (screen === 'mystery' && mysteryView === view) { view.notice = ''; markMysterySeen(view.day); renderMystery(); } }, wait);
        }
    };
    const markMysterySeen = (day) => {
        const state = loadMystery();
        const entry = state.days[day];
        const shown = Mystery.cluesAt(Date.now());
        if (entry && day === Mystery.pragueDay(Date.now()) && entry.seen < shown) { entry.seen = shown; saveMystery(state); }
    };
    // Statistiky a přátelé (po dořešení nebo za minulý den)
    const loadMysteryStats = async () => {
        const view = mysteryView;
        if (!view || !mysteryRanked()) return;
        const entry = loadMystery().days[view.day];
        const status = Mystery.statusOf(entry);
        if (!view.past && status !== 'solved' && status !== 'failed') return;
        await within(mysterySync, 8000);
        const [stats, friends] = await Promise.all([Social.mysteryStats(view.day).catch(() => false), Social.mysteryFriends(view.day).catch(() => false)]);
        if (mysteryView !== view) return;
        view.stats = stats === null ? false : stats;
        view.friends = friends || false;
        if (screen === 'mystery') renderMystery();
    };
    const openMystery = async ({ past = false } = {}) => {
        if (!Mystery || mysteryBusy) return;
        mysteryBusy = true;
        try {
            const today = mysteryToday();
            const state = loadMystery();
            const reveal = past ? mysteryReveal(state, today) : null;
            const day = reveal ? reveal.day : today;
            mysteryView = { day, past: Boolean(reveal), stats: null, friends: null, notice: '' };
            screen = 'mystery';
            closePlaceInfo();
            appContent.innerHTML = `<div class="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">${uiArt(Mystery.ART, 'h-24 w-24')}<p class="text-sm font-bold text-slate-600 dark:text-slate-300">Načítám tajemnou otázku…</p></div>`;
            updateControlsUI();
            try { await mysteryRoundFor(day); } catch (error) {
                console.error(error);
                if (screen === 'mystery') { showToast('Tajemnou otázku se teď nepodařilo načíst.'); renderHome(); }
                return;
            }
            if (!reveal) {
                const fresh = loadMystery();
                if (!fresh.days[day]) { fresh.days[day] = Mystery.newEntry({ name: fresh.rounds[day].name, q: fresh.rounds[day].id, topic: fresh.rounds[day].topic }); saveMystery(fresh); }
                markMysterySeen(day);
                if (mysteryRanked()) {
                    const server = await within(Social.mysteryState().catch(() => undefined), 5000);
                    if (server) adoptMysteryServer(day, server);
                    syncMystery(day);
                    if (Mystery.statusOf(loadMystery().days[day]) === 'solved') awardMysteryXp(day);
                }
            }
            if (screen !== 'mystery' || !mysteryView || mysteryView.day !== day) return;
            renderMystery();
            loadMysteryStats();
        } finally {
            mysteryBusy = false;
        }
    };
    // Tip: psaný (stejné porovnání jako psaná odpověď: diakritika, překlepy, přijímané názvy) nebo výběr z možností v poslední nápovědě
    const submitMysteryTip = async ({ text = '', choice = null }) => {
        const view = mysteryView;
        if (!Mystery || !view || view.past || screen !== 'mystery') return;
        const state = loadMystery();
        const data = state.rounds[view.day];
        const entry = state.days[view.day];
        const status = Mystery.statusOf(entry);
        if (!data || !entry || (status !== 'new' && status !== 'open')) return;
        if (view.day !== mysteryToday()) { showToast('Tahle tajemná otázka už skončila. Dnes je nová.'); openMystery(); return; }
        const now = Date.now();
        const shown = Mystery.cluesAt(now);
        let label = text;
        let correct;
        if (choice !== null) {
            const option = shown >= Mystery.CLUES ? data.question.choices[choice] : null;
            if (!option) return;
            label = option.label;
            correct = Boolean(option.correct);
        } else {
            if (!text) return;
            correct = checkAnswer(text, data.question);
            // Přesně název jiné položky tématu (Slovinsko u Slovenska) není překlep, ale jiná odpověď
            const ctx = loadedTopics.get(data.topic);
            const item = ctx && ctx.byId.get(data.id);
            if (correct && item) {
                const otherId = findAnswerItem(text, item, ctx.items);
                const other = otherId && ctx.byId.get(otherId);
                const exactlyOwn = data.question.accepted.some(accepted => normalizeAnswer(accepted) === normalizeAnswer(text));
                if (other && !exactlyOwn && normalizeAnswer(other.n) === normalizeAnswer(text)) correct = false;
            }
        }
        // Stejný špatný tip podruhé se nepočítá
        if (!correct && entry.tips.some(tip => normalizeAnswer(tip.text) === normalizeAnswer(label))) {
            view.notice = `„${label}“ už jsi zkoušel(a). Zkus něco jiného.`;
            renderMystery();
            return;
        }
        state.days[view.day] = Mystery.addTip(entry, { text: label, correct, clues: shown, at: now });
        saveMystery(state);
        const after = state.days[view.day];
        const left = Mystery.tipsLeft(after);
        view.notice = correct ? '' : left ? `„${label}“ to není. ${left === 1 ? 'Zbývá poslední tip.' : `${Mystery.leftWord(left).replace(/^z/, 'Z')}.`}` : `„${label}“ to není. Tipy na dnešek došly, odpověď se dozvíš zítra.`;
        if (Sound) Sound.play(correct ? 'correct' : 'wrong');
        if (!correct && Sound) Sound.vibrate('wrong');
        if (correct) awardMysteryXp(view.day);
        renderMystery();
        if (mysteryRanked()) syncMystery(view.day);
        if (correct || !left) loadMysteryStats();
    };
    const mysteryShareEntry = () => {
        if (!mysteryView) return null;
        const entry = loadMystery().days[mysteryView.day];
        return entry && entry.tips.length ? entry : null;
    };
    const shareMystery = () => {
        const entry = mysteryShareEntry();
        if (!entry || !ShareCard) { if (!entry) showToast('Ještě nemáš žádný tip, není co sdílet.'); return; }
        ShareCard.shareText({ text: Mystery.shareText({ appName: APP_NAME, day: mysteryView.day, entry, url: appUrl() }) }, { toast: showToast, copied: 'Výsledek je zkopírovaný ve schránce' });
    };
    const shareMysteryImage = () => {
        const entry = mysteryShareEntry();
        if (!entry || !ShareCard) { if (!entry) showToast('Ještě nemáš žádný tip, není co sdílet.'); return; }
        const input = Mystery.cardInput({ day: mysteryView.day, entry, robe: robeNow(), url: appUrl(), appName: APP_NAME });
        shareImageCounted(input, { name: ShareCard.fileName('tajemna-otazka', mysteryView.day), text: Mystery.shareText({ appName: APP_NAME, day: mysteryView.day, entry, url: appUrl() }), toast: showToast });
    };
    // Obrázek k výsledku dnešní otázky tématu (bez názvu položky, ať nikomu nic neprozradí)
    const dailyCardInput = () => {
        const dayKey = current && current.dailyDate;
        const results = dayKey && loadStats().daily[current.topic];
        const result = results && results[dayKey];
        if (!result) return null;
        const topic = TOPIC_BY_ID[current.topic];
        const levels = `nápovědy ${result.hintLevel - 1}/${(result.levelCount || result.hintLevel) - 1}`;
        const streak = topicStreak(results);
        return { kicker: `Dnešní otázka · ${topic.title}`, headline: result.correct ? 'Správně!' : 'Tentokrát ne', detail: result.correct ? `${formatPoints(result.points)} · ${levels}` : levels,
            grid: null, note: streak ? `Série ${plural(streak, 'den', 'dny', 'dní')} v řadě` : '', day: dayKey, robe: robeNow(), pose: result.correct ? 'radost' : 'smutek', url: appUrl(), appName: APP_NAME };
    };
    const shareDailyImage = () => {
        const input = dailyCardInput();
        if (input && ShareCard) shareImageCounted(input, { name: ShareCard.fileName(`dnesni-${current.topic}`, input.day), toast: showToast });
    };
    // Obrázek po vyhrané výzvě: skóre, mřížka otázek a soupeř
    const challengeCardInput = (c) => {
        if (!c || !Array.isArray(c.results)) return null;
        const correct = c.results.filter(row => row && row.correct).length;
        const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
        const user = signedUser();
        const rivals = user && Array.isArray(c.lastResults) ? c.lastResults.filter(row => row.user_id !== user.id) : [];
        const rival = rivals.length === 1 ? playerName(rivals[0].player) : '';
        return { kicker: `Výzva · ${challengeTopicTitle(c.topic)}`, headline: formatPoints(points), detail: `${correct}/${c.count} správně · vítězství`, grid: Array.from({ length: c.count }, (_, i) => (c.results[i] ? Boolean(c.results[i].correct) : null)),
            note: rival ? `Vyhráno proti hráči ${rival}` : rivals.length ? `Vyhráno proti ${plural(rivals.length, 'hráči', 'hráčům', 'hráčům')}` : 'Zvládneš to líp?', day: getDayKey(), robe: robeNow(), pose: 'vitez', url: appUrl(), appName: APP_NAME };
    };
    const shareChallengeImage = () => {
        const input = challengeCardInput(challenge);
        if (input && ShareCard) shareImageCounted(input, { name: ShareCard.fileName('vyzva', input.day), text: `Vyhrál jsem výzvu v Mudrlantu: ${input.headline}. Zvládneš to líp?\n${challengeLink(challenge.code)}`, toast: showToast });
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
    const tournamentServerResume = new Set(); // rozehrané zápasy, jejichž odpovědi zná server (dají se dohrát bez uložené relace)
    let tournamentMode = 'bracket'; // pohled v okně turnaje: 'bracket' (pavouk) nebo 'rounds' (seznam kol)
    let bracketFull = true; // výchozí je celý pavouk; tlačítko Celý pavouk přepne na pohled od osmifinále (volba hráče)
    let bracketFocus = ''; // hráč, jehož cesta pavoukem je zvýrazněná (klepnutí na hráče)
    let bracketReset = true; // po otevření a změně pohledu se pavouk posune na moje kolo, při dalším překreslení zůstane, kde je
    // Archiv turnajů: načtené stránky skončených turnajů (rows) a otevřené turnaje z archivu (archiveViews, skončený turnaj se už nemění)
    const newArchive = () => ({ user: '', rows: [], loading: false, done: false, error: false, at: 0, scroll: 0 });
    let archive = newArchive();
    const archiveViews = new Map();
    let tournamentArchived = false; // okno turnaje ukazuje turnaj z archivu (nahoře Zpět na archiv a Aktuální turnaj)
    let archiveObserver = null;
    const resetArchive = () => { archive = newArchive(); archiveViews.clear(); };
    const resetTournaments = () => { resetArchive(); tournamentOffer = null; tournamentView = null; tournamentTickAt = 0; tournamentStatsAt = 0; tournamentBusy = ''; tournamentAgain = null; tournamentServerResume.clear(); };
    const plainText = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // Za vyhraný zápas XP, jednou za účet: vyplacení eviduje server (claim_tournament_xp, schéma 3) a XP se připíše jen za zápasy, které právě vrátil,
    // takže nové zařízení ani smazaná data už nic nepřipíšou znovu. Seznam v zařízení (mudrlant.tourXp) je jen záložní ochrana proti dvojímu připsání
    // (dvě volání v jedné relaci, opakování se stejným klíčem); ve starší databázi bez evidence (404) se podle něj vyplácí jako dřív.
    // Počítadla pro odznaky se doplní z účtu (maximum s lokální hodnotou).
    const TOUR_CLAIM_KEY = 'mudrlant.tourXpClaim';
    let tournamentPaying = null;
    const paidTournamentMatches = () => { const list = readJson(TOUR_XP_KEY); return Array.isArray(list) ? list.filter(id => typeof id === 'string') : []; };
    // Výhry k vyplacení ze serveru ([{ id, round }]); null = databáze vyplácení neeviduje, undefined = bez spojení (zkusí se příště).
    // Klíč (zvlášť pro každý účet na zařízení) zůstane uložený, dokud se XP nepřipíše: když se odpověď serveru ztratí, další volání se stejným klíčem vrátí tytéž zápasy.
    const claimKeys = () => { const saved = readJson(TOUR_CLAIM_KEY); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; };
    const dropClaimKey = (userId) => { const keys = claimKeys(); if (keys[userId]) { delete keys[userId]; writeJson(TOUR_CLAIM_KEY, keys); } };
    const claimTournamentXp = async (userId) => {
        const keys = claimKeys();
        let key = keys[userId];
        if (typeof key !== 'string' || !/^[0-9a-f]{24}$/.test(key)) {
            const bytes = new Uint8Array(12);
            crypto.getRandomValues(bytes);
            key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
            writeJson(TOUR_CLAIM_KEY, Object.fromEntries([...Object.entries(keys).filter(([id, value]) => id !== userId && typeof value === 'string').slice(-4), [userId, key]]));
        }
        try { return await Social.claimTournamentXp(key); } catch (error) { return undefined; }
    };
    const applyTournamentProgress = (options = {}) => {
        // Vyplácí se po jednom (výsledek turnaje a obnova karty se můžou sejít): druhé volání počká na první
        const run = (tournamentPaying || Promise.resolve()).then(() => payTournamentProgress(options)).catch(error => console.error(error));
        tournamentPaying = run;
        return run;
    };
    const payTournamentProgress = async ({ wonIds = [], wonRounds = {}, stats = false } = {}) => {
        const user = signedUser();
        if (!user || !Social) return;
        const candidates = [...new Set(wonIds)].filter(id => !paidTournamentMatches().includes(id));
        let fresh = []; // [{ id, round }] k připsání
        let settled = []; // zápasy, které už se nemají nabízet k vyplacení
        let claimed = false;
        if (candidates.length || stats) {
            const rows = await claimTournamentXp(user.id);
            if (rows === null) {
                fresh = candidates.map(id => ({ id, round: wonRounds[id] }));
                settled = candidates;
            } else if (rows) {
                claimed = true;
                fresh = rows;
                // vyhrané zápasy, které server nevrátil, už vyplacené jsou (jiné zařízení, starší verze aplikace)
                settled = [...candidates, ...rows.map(row => row.id)];
            }
        }
        let remote = null;
        if (stats || fresh.length) {
            tournamentStatsAt = Date.now();
            try { remote = await Social.myTournamentStats(); } catch (error) { remote = null; }
        }
        if (!signedUser() || signedUser().id !== user.id) return;
        // Záložní ochrana: co už zařízení připsalo, se nepřipíše znovu (ani když ho server vrátí podruhé se stejným klíčem)
        const known = paidTournamentMatches();
        fresh = fresh.filter(row => !known.includes(row.id));
        // Až po připsání XP: vyřízené zápasy do seznamu v zařízení a klíč pro opakování pryč
        const settle = () => {
            if (settled.length) writeJson(TOUR_XP_KEY, [...new Set([...known, ...settled])].slice(-300));
            if (claimed) dropClaimKey(user.id);
        };
        if (!fresh.length && !remote) { settle(); return; }
        const progress = loadProgress();
        const levelBefore = levelProgress(progress.xp).level;
        const tourXp = fresh.reduce((sum, row) => sum + Tournament.winXp(row.round), 0);
        progress.xp += tourXp;
        chronicleLog({ xp: tourXp, tourWins: fresh.length });
        if (remote) {
            progress.counters.tourBest = Math.max(progress.counters.tourBest || 0, remote.best);
            progress.counters.tourWins = Math.max(progress.counters.tourWins || 0, remote.wins);
        }
        const titles = grantBadges(progress);
        saveProgress(progress);
        settle();
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
    // --- Tipy od Mudrlanta: žárovka s vysvětlením jedné funkce hry (výběr a pravidla v tips.js) ---
    const readTipsState = () => Tips.parse(readJson(KEYS.tips));
    const writeTipsState = (value) => writeJson(KEYS.tips, value);
    const tipsOn = () => Boolean(Tips) && !readTipsState().off;
    const touchTip = (feature) => {
        if (!Tips) return;
        const before = readTipsState();
        const after = Tips.touch(before, feature);
        if (after !== before && JSON.stringify(after.visited) !== JSON.stringify(before.visited)) writeTipsState(after);
    };
    // Další tip k ukázání (jen na úvodu, po tutoriálu); null = žádný
    const nextTip = () => {
        if (!Tips || screen !== 'home') return null;
        try { if (Tutorial && !Tutorial.isDone(window.localStorage)) return null; } catch (error) { return null; }
        return Tips.pick(readTipsState(), {
            counters: loadProgress().counters, today: getDayKey(), now: Date.now(), launches: promoLaunches,
            signedIn: Boolean(signedUser()), multiAvailable: Boolean(Auth && Auth.isConfigured() && Social), reviewOn: reviewEnabled(),
            quiz: Boolean(DailyQuiz), mystery: Boolean(Mystery), modes: Boolean(Modes), goals: Boolean(Goals && Rewards), freezes: Rewards ? loadRewards().freezes : 0,
            season: Boolean(Season && Rewards), album: Boolean(Album), chronicle: Boolean(Chronicle), showcase: Boolean(Showcase && myShowcase !== null), leagueSeasons: Boolean(LeagueSeasons && leagueSeasons),
            maxStars: Math.max(0, ...Object.values(loadLearned()).map(ids => masteryStars((ids || []).length)))
        });
    };
    // Záložka Nastavení, kterou otevře tlačítko tipu (tip „Obleč si Mudrlanta“ → Mudrlant); bez ní poslední otevřená
    let tipSettingsTab = null;
    const TIP_ACTIONS = {
        settings: () => { closeDialog(); openSettings('', null, tipSettingsTab); },
        learn: () => { closeDialog(); openLearn('home'); },
        progress: () => { closeDialog(); openProgress(); },
        multi: () => { closeDialog(); openHomeTabFromPush('multi'); },
        single: () => { closeDialog(); openHomeTabFromPush('single'); },
        quiz: () => { closeDialog(); openQuiz(); },
        modes: () => { closeDialog(); openChooser({ kind: 'mix' }); },
        goals: () => { closeDialog(); openGoals(); },
        chronicle: () => { closeDialog(); openChronicle(); },
        mystery: () => { closeDialog(); openMystery(); },
        leagueSeasons: () => { closeDialog(); openLeagueSeasons(); },
        groups: () => { closeDialog(); openHomeTabFromPush('multi'); if (GroupsUI) GroupsUI.openList(); }
    };
    const openTip = (tip) => {
        if (!tip || document.getElementById('dialog-overlay')) return;
        writeTipsState(Tips.markShown(readTipsState(), tip.id, getDayKey(), Date.now()));
        updateFactHint();
        showDialog('Tip od Mudrlanta', `
            <div id="tip-dialog" data-tip="${escapeHtml(tip.id)}" class="flex flex-col gap-3">
                <div class="flex items-start gap-3">
                    ${tip.art ? uiArt(tip.art, 'h-[4.5rem] w-[4.5rem] -my-1') : uiArt('sova-tip', 'h-[4.5rem] w-[4.5rem] -my-1')}
                    <div class="min-w-0"><p class="text-base font-black leading-tight text-slate-800 dark:text-slate-100">${escapeHtml(tip.title)}</p>
                        <p class="mt-1 text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">${escapeHtml(Tips.textFor(tip, Boolean(signedUser())))}</p></div>
                </div>
                ${tip.action ? `<button type="button" data-tip-go="${escapeHtml(tip.action.kind)}" class="${PRIMARY_BUTTON}">${escapeHtml(tip.action.label)}</button>` : ''}
                <div class="flex items-center justify-between gap-2"><button type="button" data-tip-off class="${TOUR_LINK}">Tipy už nechci</button><button type="button" data-close class="rounded-xl px-3 py-2.5 text-[13px] font-bold text-slate-600 dark:text-slate-300">Rozumím</button></div>
            </div>`, {
            onClick: (event) => {
                const go = event.target.closest('[data-tip-go]');
                if (go && TIP_ACTIONS[go.dataset.tipGo]) { tipSettingsTab = (tip.action && tip.action.tab) || null; TIP_ACTIONS[go.dataset.tipGo](); return; }
                if (event.target.closest('[data-tip-off]')) { writeTipsState(Tips.setOff(readTipsState(), true)); closeDialog(); updateFactHint(); showToast('Tipy jsou vypnuté. Zapneš je v Nastavení.'); }
            }
        });
        renderIcons(document.getElementById('dialog-overlay'));
    };
    const closeTournamentOffer = () => { if (document.getElementById('tournament-offer')) closeDialog(); };
    const openTournamentOffer = (source) => {
        if (!tournamentOffer || document.getElementById('dialog-overlay')) return;
        const { tournament } = tournamentOffer;
        if (source === 'bulb') { promoBulbDone = true; updateFactHint(); }
        const when = `${Tournament.weekdayName(tournament.week_start)} ${Tournament.formatDay(tournament.week_start)}`;
        showDialog(TOUR_DIALOG, `
            <div id="tournament-offer" class="flex flex-col gap-3">
                <div class="flex items-center gap-3">${uiArt('turnaj', 'h-14 w-14')}
                    <p class="text-sm font-semibold leading-snug text-slate-700 dark:text-slate-200">Přihlášky do týdenního turnaje jsou otevřené. Začíná <b>${escapeHtml(when)}</b>, každý den jedno kolo (10 otázek), vítěz postupuje dál až do finále.</p></div>
                <button type="button" data-offer-join="${escapeHtml(tournament.id)}" class="flex w-full items-center justify-center gap-2 rounded-2xl btn-3d bg-emerald-600 px-4 py-3 text-base font-black text-white active:scale-[0.98]"><i data-lucide="trophy" class="h-5 w-5"></i> Přihlásit se</button>
                <div class="flex items-center justify-between gap-2"><button type="button" data-offer-rules class="${TOUR_LINK}">Jak turnaje fungují</button><button type="button" data-close class="rounded-xl px-3 py-2.5 text-[13px] font-bold text-slate-500 underline underline-offset-2 dark:text-slate-400">Teď ne</button></div>
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
            // Rozehraný zápas bez uložené relace: eviduje-li server odpovědi (schéma 3), karta nabídne Pokračovat místo „nedokončil“
            await Promise.all(tournamentView.filter(view => view.state.step === 'unfinished' && !tournamentServerResume.has(view.state.matchId)).map(async (view) => {
                const rows = await Social.tournamentAnswers(user.id, view.state.matchId).catch(() => undefined);
                if (Array.isArray(rows)) { tournamentServerResume.add(view.state.matchId); view.state = tournamentStateOf(view, user.id, today); }
            }));
            if (!signedUser() || signedUser().id !== user.id) return;
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
    const findTournament = (tid) => (tournamentView || []).find(view => view.tournament.id === tid) || archiveViews.get(tid) || null;
    // Stav karty z toho, co spočítal server, plus rozehraný zápas tohoto zařízení (uložená relace → krok 'resume')
    // Bez uložené relace (smazaná data, jiné zařízení) jde rozehraný zápas dohrát, když jeho odpovědi eviduje server (schéma 3, tournamentServerResume);
    // ve starší databázi se kolo počítá jako neodehrané
    const tournamentStateOf = (view, meId, today = Tournament.pragueToday()) => {
        const input = { tournament: view.tournament, entries: view.entries, matches: view.matches, me: meId, today };
        const state = Tournament.cardState({ ...input, savedMatch: savedTournamentMatch() });
        return state.step === 'unfinished' && tournamentServerResume.has(state.matchId) ? Tournament.cardState({ ...input, savedMatch: state.matchId }) : state;
    };
    // Před vykreslením se stavy přepočítají: uložená relace se mezitím mohla změnit (zápas začal, dohrál se), server ne
    const syncTournamentStates = () => {
        const user = signedUser();
        if (!user || !Tournament || !tournamentView) return;
        const today = Tournament.pragueToday();
        tournamentView.forEach(view => { view.state = tournamentStateOf(view, user.id, today); });
    };

    // --- Karta na záložce Více hráčů ---
    // Ilustrace turnaje (icons/topics/turnaj.webp): o kousek větší než místo, které zabere (40 px jako dřív kroužek), ať se řádek nezvýší ani nezúží text
    const TOUR_ART = 'h-12 w-12 -m-1';
    const TOUR_LINK = 'inline-flex min-h-[2.5rem] items-center rounded px-1 text-[11px] font-black text-brand-700 underline decoration-brand-700/40 underline-offset-2 dark:text-cream dark:decoration-cream/40';
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
                    ${uiArt('turnaj', TOUR_ART)}
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
                ${uiArt('turnaj', TOUR_ART)}
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
                    <div class="flex items-center gap-1.5">
                        <button type="button" data-action="tournament-archive" aria-label="Archiv turnajů" title="Archiv turnajů" class="flex h-7 w-7 items-center justify-center rounded-full active:scale-95">${uiArt('archiv-turnaju', 'h-9 w-9 -m-1')}</button>
                        <button type="button" data-action="tournament-help" aria-label="Jak to funguje" title="Jak to funguje" class="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[13px] font-black text-brand-700 ring-1 ring-gold-300/70 active:scale-95 dark:bg-slate-900/40 dark:text-gold-200 dark:ring-gold-700/60">?</button>
                    </div>
                </div>
                <div class="relative flex flex-col divide-y divide-gold-300/50 dark:divide-slate-700">${tournamentView.map(tournamentRow).join('')}</div>
            </div>`;
    };

    // --- Okno turnaje: stav, konečné pořadí, kola se zápasy (aktuální rozbalené) ---
    // Jeden zápas: dva hráči pod sebou, výsledek (až když ho server ukáže), vítěz; můj zápas je zvýrazněný
    const tournamentMatchHtml = (match, players, meId, { breakdown = false, tid = '', matches = [] } = {}) => {
        const mine = Tournament.involves(match, meId);
        const how = match.decided_by === 'walkover' ? 'Kontumačně: soupeř kolo neodehrál.' : match.decided_by === 'earlier' ? 'Nikdo neodehrál, postupuje dřívější přihlášený.' : '';
        const row = (id) => {
            const entry = players.get(id);
            const result = match.results.find(item => item.user_id === id);
            const done = result && result.finished_at;
            const won = match.winner === id;
            const score = done ? `${result.points} b · ${result.correct}/${Tournament.QUESTIONS}${Number.isInteger(result.time_ms) ? ` · ${Tournament.formatDuration(result.time_ms)}` : ''}` : match.winner ? 'neodehráno' : '';
            return `<div class="flex items-center gap-2 ${match.winner && !won ? 'opacity-60' : ''}">
                ${avatarHtml(entry ? entry.player : null, 'h-7 w-7 text-sm')}
                <span class="min-w-0 flex-1 truncate text-[12.5px] ${won ? 'font-black' : 'font-bold'} text-slate-800 dark:text-slate-100">${escapeHtml(playerName(entry ? entry.player : null))}${id === meId ? ' (ty)' : ''}</span>
                <span class="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">${escapeHtml(score)}</span>
                <span class="flex h-4 w-4 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">${won ? '<i data-lucide="check" class="h-4 w-4"></i>' : ''}</span>
            </div>`;
        };
        const names = plainText(`${playerName((players.get(match.p1) || {}).player)} ${playerName((players.get(match.p2) || {}).player)}`);
        return `<li data-match="${escapeHtml(match.id)}" ${mine ? 'data-mine' : ''} data-names="${escapeHtml(names)}" class="flex flex-col gap-1 rounded-xl bg-white px-2.5 py-1.5 shadow-sm dark:bg-slate-800 ${mine ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}">${row(match.p1)}${row(match.p2)}${how ? `<p class="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(how)}</p>` : ''}${breakdown && tid && canTournamentBreakdown(match, meId, matches) ? `<button type="button" data-action="tournament-breakdown" data-tid="${escapeHtml(tid)}" data-mid="${escapeHtml(match.id)}" class="${BREAKDOWN_LINK}"><i data-lucide="list-ordered" class="h-3.5 w-3.5"></i> ${mine ? 'Rozpis otázek' : 'Rozpis zápasu'}</button>` : ''}</li>`;
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
                <ul class="mt-1.5 flex flex-col gap-1.5">${group.matches.map(match => tournamentMatchHtml(match, players, meId, { breakdown: true, tid: tournament.id, matches })).join('')}</ul>
            </details>`;
        }).join('');
    };
    // --- Celé pořadí: místa 1.–4., pak skupiny podle kola vyřazení (za běhu nahoře ti, kdo ještě hrají) ---
    const rankingHtml = (view, meId, { open = false } = {}) => {
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
            <details data-keep="ranking" ${open ? 'open' : ''} class="group rounded-2xl bg-slate-100/70 p-1.5 dark:bg-slate-800/50">
                <summary data-ranking class="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 text-[13px] font-black text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden"><i data-lucide="medal" class="h-4 w-4 shrink-0 text-gold-600 dark:text-gold-300"></i><span class="flex-1">Celé pořadí (${escapeHtml(Tournament.playersWord(result.total))})</span><i data-lucide="chevron-down" class="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"></i></summary>
                <div id="tournament-ranking" class="mt-1.5 flex flex-col gap-2">${parts.join('')}</div>
            </details>`;
    };

    // --- Pavouk jako v NHL playoff: sloupce kol zleva doprava, kompaktní karty se dvěma řádky, spojnice, vítěz vpravo ---
    const BRACKET_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"><path d="M5 13l4 4L19 7"/></svg>';
    const BRACKET_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-3.5 w-3.5"><path d="M10 6h11M10 12h11M10 18h11M4 6h1M4 12h1M4 18h1"/></svg>';
    const bracketRowHtml = (card, index, ctx) => {
        const side = card.sides[index];
        if (!side.id) return '<div class="flex h-5 items-center gap-1 px-1.5"><span class="h-4 w-4 shrink-0 rounded-full border border-dashed border-slate-300 dark:border-slate-600"></span><span class="text-[11px] font-semibold text-slate-400 dark:text-slate-500">—</span></div>';
        const entry = ctx.players.get(side.id);
        const name = playerName(entry ? entry.player : null);
        const mine = side.id === ctx.me;
        const tone = side.won ? 'font-black text-slate-900 dark:text-white' : side.lost ? 'font-semibold text-slate-400 dark:text-slate-500' : mine ? 'font-black text-brand-700 dark:text-brand-200' : 'font-bold text-slate-700 dark:text-slate-200';
        const score = side.points != null ? `${side.points} b` : '—';
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
        // Rozhodnutý zápas, který smím vidět: úzké tlačítko vpravo otevře rozpis zápasu (kdo co odpověděl, body, čas)
        const match = card.id && ctx.tid ? ctx.matches.find(item => item.id === card.id) : null;
        const open = match && canTournamentBreakdown(match, ctx.me, ctx.matches)
            ? `<button type="button" data-action="tournament-breakdown" data-tid="${escapeHtml(ctx.tid)}" data-mid="${escapeHtml(card.id)}" aria-label="${escapeHtml(`Rozpis zápasu ${names}`)}" title="Rozpis zápasu" class="flex w-6 shrink-0 items-center justify-center border-l border-slate-200 text-brand-700 hover:bg-brand-50 dark:border-slate-700 dark:text-brand-200 dark:hover:bg-slate-700">${BRACKET_LIST}</button>` : '';
        return `<div data-bcard ${onPath ? 'data-onpath' : ''} data-names="${escapeHtml(names)}" ${card.id ? `data-match="${escapeHtml(card.id)}"` : ''} class="flex overflow-hidden rounded-lg shadow-sm ${card.exists ? 'bg-white dark:bg-slate-800' : 'bg-slate-100/80 dark:bg-slate-800/50'} ${ring}"><div class="min-w-0 flex-1">${bracketRowHtml(card, 0, ctx)}<div class="h-px bg-slate-200 dark:bg-slate-700"></div>${bracketRowHtml(card, 1, ctx)}</div>${open}</div>`;
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
        const ctx = { players, me: meId, focus: bracketFocus, path, matches, tid: tournament.id };
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
        // Turnaj z archivu má vlastní nadpis (pozadí ho nepřekresluje) a nahoře cestu zpět na archiv a na aktuální turnaj
        const view = tournamentArchived ? archiveViews.get(tournamentDialogId) || null : findTournament(tournamentDialogId);
        const archived = Boolean(tournamentArchived && view);
        const title = tournamentArchived ? ARCHIVE_DETAIL : TOUR_DIALOG;
        if (!user || !view) { showDialog(title, '<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám turnaj…</p>'); return null; }
        const { tournament, entries, matches, state } = view;
        const today = Tournament.pragueToday();
        const names = Tournament.nameMap(entries);
        const rules = archived
            ? `<button type="button" data-t-help class="${TOUR_LINK} self-start">Jak turnaje fungují</button>`
            : `<div class="flex flex-wrap items-center justify-between gap-x-3"><button type="button" data-t-help class="${TOUR_LINK}">Jak turnaje fungují</button><button type="button" data-t-archive class="${TOUR_LINK} gap-1">${uiArt('archiv-turnaju', 'h-7 w-7')}Archiv turnajů</button></div>`;
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
            // Rozpis posledního mého zápasu (i v pohledu Pavouk, kde zápasy nemají vlastní řádky)
            const lastMine = Tournament.myMatch(matches, user.id);
            const lastBreakdown = canTournamentBreakdown(lastMine, user.id)
                ? `<button type="button" data-action="tournament-breakdown" data-tid="${escapeHtml(tournament.id)}" data-mid="${escapeHtml(lastMine.id)}" class="${BREAKDOWN_LINK}"><i data-lucide="list-ordered" class="h-3.5 w-3.5"></i> Rozpis otázek mého posledního zápasu</button>` : '';
            const podium = state.phase === 'finished' ? Tournament.podium(entries) : [];
            const hasBracket = Boolean(matches.length && tournament.size >= 2);
            const bracketOn = hasBracket && tournamentMode === 'bracket';
            const medals = ['text-gold-600 dark:text-gold-300', 'text-slate-500 dark:text-slate-300', 'text-amber-700 dark:text-amber-500', 'text-slate-500 dark:text-slate-400'];
            body = archived ? `
                ${archiveNavHtml()}
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Týden ${escapeHtml(Tournament.archiveWeekLabel(tournament.week_start))} · ${tournament.size ? `${Tournament.playersWord(tournament.size)}` : ''} · ${escapeHtml(challengeTopicTitle(tournament.topic))}, ${Tournament.QUESTIONS} otázek v kole</p>
                ${archivePodiumHtml(entries, user.id)}
                ${archiveMeHtml(entries, user.id)}
                ${lastBreakdown}
                ${rankingHtml(view, user.id, { open: tournament.size <= 16 })}` : `
                <p class="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Týden ${escapeHtml(Tournament.weekLabel(tournament.week_start))} · ${tournament.size ? `${Tournament.playersWord(tournament.size)}` : ''} · Mix všech témat, ${Tournament.QUESTIONS} otázek v kole</p>
                ${state.role === 'player' || (state.phase === 'finished' && state.playing) ? `<div class="sticky top-11 z-20 -mx-1 -my-1 bg-slate-50 px-1 py-1 dark:bg-slate-900"><div id="tournament-status" class="flex items-center gap-2.5 rounded-2xl bg-gold-50 p-2.5 ring-1 ring-gold-300/70 dark:bg-gold-900/20 dark:ring-gold-700/60"><p class="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-800 dark:text-slate-100">${state.roundName ? `<span class="font-black">${escapeHtml(state.roundName)}:</span> ` : ''}${escapeHtml(status)}</p>${state.step === 'play' || state.step === 'resume' ? `<button type="button" data-t-play class="shrink-0 rounded-xl bg-gold-500 px-3.5 py-2 text-[13px] font-black text-brand-950 shadow-sm active:scale-[0.97]">${state.step === 'resume' ? 'Pokračovat' : 'Hrát'}</button>` : ''}</div></div>` : `<p id="tournament-status" class="text-sm font-semibold text-slate-600 dark:text-slate-300">${escapeHtml(status)}</p>`}
                ${lastBreakdown}
                ${podium.length ? `<ol id="tournament-podium" class="flex flex-col gap-1">${podium.map(entry => `<li class="flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 shadow-sm dark:bg-slate-800 ${entry.user_id === user.id ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}"><span class="flex w-8 shrink-0 items-center justify-center gap-0.5 text-sm font-black ${medals[entry.place - 1]}">${entry.place}.${entry.place === 1 ? '<i data-lucide="trophy" class="h-3.5 w-3.5"></i>' : ''}</span>${avatarHtml(entry.player, 'h-8 w-8 text-base')}<span class="min-w-0 flex-1 truncate text-[13px] font-black text-slate-800 dark:text-slate-100">${escapeHtml(playerName(entry.player))}${entry.user_id === user.id ? ' (ty)' : ''}</span></li>`).join('')}</ol>` : ''}
                ${rankingHtml(view, user.id)}`;
            body += `
                ${hasBracket ? `<div role="group" aria-label="Pohled na turnaj" class="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">${[['rounds', 'Seznam kol'], ['bracket', 'Pavouk']].map(([mode, title]) => `<button type="button" data-t-mode="${mode}" aria-pressed="${(mode === 'bracket') === bracketOn}" class="rounded-lg px-2 py-1.5 text-[13px] font-black ${(mode === 'bracket') === bracketOn ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'}">${title}</button>`).join('')}</div>` : ''}
                ${tournament.size >= 16 ? `<input id="tournament-search" type="search" value="${escapeHtml(tournamentQuery)}" placeholder="Najít hráče…" autocomplete="off" maxlength="24" aria-label="Najít hráče v pavouku" class="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600">` : ''}
                ${bracketOn ? `<div id="tournament-bracket" class="flex flex-col gap-2">${bracketHtml(view, user.id, today)}</div>` : `<div id="tournament-rounds" class="flex flex-col gap-1.5">${matches.length ? tournamentRoundsHtml(view, user.id, today) : '<p class="text-sm text-slate-500 dark:text-slate-400">Zápasy zatím nejsou.</p>'}</div>`}
                <p id="tournament-empty" class="hidden text-sm text-slate-500 dark:text-slate-400">Takový hráč tu není.</p>
                ${rules}`;
        }
        // Překreslení po načtení nových dat nesmí sbalit kola, která hráč rozbalil ani posunout pavouk
        const before = document.getElementById('dialog-overlay');
        const sameDialog = Boolean(before && before.dataset.title === title);
        const opened = sameDialog ? Object.fromEntries([...before.querySelectorAll('details[data-keep]')].map(item => [item.dataset.keep, item.open])) : {};
        const oldBox = sameDialog ? before.querySelector('#bracket-scroll') : null;
        const oldScroll = oldBox ? { left: oldBox.scrollLeft, top: oldBox.scrollTop } : null;
        const oldFocus = sameDialog && before.contains(document.activeElement) && document.activeElement.dataset.bp ? { bp: document.activeElement.dataset.bp, bk: document.activeElement.dataset.bk } : null;
        const rerender = () => renderTournamentDialog();
        const overlay = showDialog(title, `<div class="flex flex-col gap-3">${body}</div>`, {
            onClick: (event) => {
                const target = event.target;
                if (target.closest('[data-t-archive]')) openTournamentArchive();
                else if (target.closest('[data-t-archive-back]')) backToArchive();
                else if (target.closest('[data-t-current]')) openTournament(currentTournamentId());
                else if (target.closest('[data-t-join]')) changeTournamentEntry(tournamentDialogId, true);
                else if (target.closest('[data-t-leave]')) changeTournamentEntry(tournamentDialogId, false);
                else if (target.closest('[data-t-play]')) { const view = findTournament(tournamentDialogId); if (view && view.state.step === 'resume') resumeTournament(tournamentDialogId); else playTournament(tournamentDialogId); }
                else if (target.closest('[data-t-help]')) openTournamentHelp(true);
                else if (target.closest('[data-action="tournament-breakdown"]')) {
                    // Z rozpisu se jde zpět do tohoto okna na stejné místo (posun okna i pavouku)
                    const button = target.closest('[data-action="tournament-breakdown"]');
                    const panel = document.querySelector('#dialog-overlay > div');
                    const box = document.getElementById('bracket-scroll');
                    const memo = { panel: panel ? panel.scrollTop : 0, box: box ? { left: box.scrollLeft, top: box.scrollTop } : null, archived: tournamentArchived, tid: tournamentDialogId };
                    openTournamentBreakdown(button.dataset.tid, button.dataset.mid, { label: tournamentArchived ? 'Zpět na turnaj z archivu' : 'Zpět na turnaj', run: () => returnToTournament(memo) });
                }
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
        if (!signedUser() || !Tournament || !tid) return;
        tournamentDialogId = tid;
        tournamentArchived = false;
        tournamentQuery = '';
        tournamentMode = 'bracket';
        bracketFull = true;
        bracketFocus = '';
        bracketReset = true;
        renderTournamentDialog();
        dialogScrollTo(0);
        refreshTournaments({ force: true });
    };
    const openTournamentHelp = (back = false) => {
        showDialog('Jak turnaje fungují', `
            <div class="flex flex-col gap-3 short:gap-2">
                <ul id="tournament-rules" class="flex flex-col gap-2 short:gap-1.5">${Tournament.RULES.map(rule => `<li class="flex gap-2 text-sm leading-snug text-slate-700 short:text-[13px] short:leading-tight dark:text-slate-200"><i data-lucide="check" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"></i><span>${escapeHtml(rule)}</span></li>`).join('')}</ul>
                <p class="text-xs leading-snug text-slate-500 short:text-[11px] short:leading-tight dark:text-slate-400">Názvy kol podle počtu hráčů v kole: 128 hráčů 1. kolo, 64 2. kolo, 32 šestnáctifinále, 16 osmifinále, 8 čtvrtfinále, 4 semifinále, 2 finále a zápas o 3. místo.</p>
                ${back && findTournament(tournamentDialogId) ? `<button type="button" data-t-back class="${SECONDARY_BUTTON}">Zpět na turnaj</button>` : ''}
            </div>`, { onClick: (event) => { if (event.target.closest('[data-t-back]')) { bracketReset = true; renderTournamentDialog(); } } });
    };

    // --- Archiv turnajů: skončené turnaje od nejnovějšího (po stránkách, další se načte při posouvání), u každého vítěz a moje místo.
    // Otevřený turnaj z archivu ukáže pódium, celé pořadí a pavouk jen ke čtení se stejným rozpisem zápasů jako běžící turnaj
    // (všechny zápasy jsou rozhodnuté, takže pravidlo pro diváky nic neblokuje). Data jsou v databázi napořád, čtou se přes pravidla řádků.
    const ARCHIVE_TITLE = 'Archiv turnajů';
    const ARCHIVE_DETAIL = 'Turnaj z archivu';
    const ARCHIVE_FRESH = 5 * 60000; // načtený archiv platí 5 minut (nový skončený turnaj přibude nejvýš jednou za týden)
    const IN_BRACKET = ['playing', 'out', 'finished'];
    const dialogScrollTo = (top) => { const panel = document.querySelector('#dialog-overlay > div'); if (panel) panel.scrollTop = top; };
    const dialogScroll = () => { const panel = document.querySelector('#dialog-overlay > div'); return panel ? panel.scrollTop : 0; };
    const dialogTitled = (title) => { const overlay = document.getElementById('dialog-overlay'); return Boolean(overlay && overlay.dataset.title === title); };
    // Aktuální turnaj z karty: běžící, jinak s otevřenými přihláškami, jinak poslední skončený
    const currentTournamentId = () => {
        const list = tournamentView || [];
        const pick = list.find(view => view.tournament.status === 'running') || list.find(view => view.tournament.status === 'open') || list[0];
        return pick ? pick.tournament.id : '';
    };
    const archiveRowHtml = (row, meId) => {
        const { tournament, winner, mine } = row;
        const id = escapeHtml(tournament.id);
        const played = Boolean(mine && IN_BRACKET.includes(mine.status));
        const medal = played && mine.place >= 1 && mine.place <= 3;
        const me = played ? `Ty: ${mine.place ? Tournament.placeLabel(mine.place) : 'v turnaji'}` : mine && mine.status === 'excluded' ? 'Ty: mimo pavouka' : '';
        const cup = '<span class="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-brand-950 ring-2 ring-white dark:ring-slate-800"><i data-lucide="trophy" class="h-3 w-3"></i></span>';
        const face = winner ? avatarHtml(winner.player, 'h-11 w-11 text-xl') : '<span class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"><i data-lucide="trophy" class="h-5 w-5"></i></span>';
        return `<li data-archive="${id}" ${played ? 'data-played' : ''}>
            <button type="button" data-archive-open="${id}" class="flex w-full items-center gap-2.5 rounded-2xl bg-white p-2.5 text-left shadow-sm active:scale-[0.99] dark:bg-slate-800 ${played ? 'ring-2 ring-brand-600/70 dark:ring-brand-400/70' : 'ring-1 ring-slate-200/70 dark:ring-slate-700/70'}">
                <span class="relative shrink-0">${face}${winner ? cup : ''}</span>
                <span class="min-w-0 flex-1">
                    <span data-archive-week class="block truncate text-[13.5px] font-black leading-tight text-slate-800 dark:text-slate-100">Týden ${escapeHtml(Tournament.archiveWeekLabel(tournament.week_start))}</span>
                    <span class="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(challengeTopicTitle(tournament.topic))}${tournament.size ? ` · ${escapeHtml(Tournament.playersWord(tournament.size))}` : ''}</span>
                    <span data-archive-winner class="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] font-bold text-slate-700 dark:text-slate-200"><span class="shrink-0 font-black text-gold-700 dark:text-gold-300">Vítěz:</span><span class="truncate">${winner ? `${escapeHtml(playerName(winner.player))}${winner.user_id === meId ? ' (ty)' : ''}` : 'neznámý'}</span></span>
                    ${me ? `<span data-archive-me class="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-black ${medal ? 'bg-gold-100 text-gold-900 dark:bg-gold-900/50 dark:text-gold-100' : 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'}">${medal ? '<i data-lucide="medal" class="h-3 w-3 shrink-0"></i>' : ''}${escapeHtml(me)}</span>` : ''}
                </span>
                <i data-lucide="chevron-right" class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"></i>
            </button>
        </li>`;
    };
    const renderArchive = () => {
        const user = signedUser();
        if (!user || !Tournament) return null;
        const { rows } = archive;
        const current = currentTournamentId();
        const note = (text, extra = '') => `<p ${extra} class="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">${escapeHtml(text)}</p>`;
        const retry = `<button type="button" data-archive-more class="${SECONDARY_BUTTON}">Zkusit znovu</button>`;
        let list = '';
        if (rows.length) list = `<ol id="tournament-archive" class="flex flex-col gap-2">${rows.map(row => archiveRowHtml(row, user.id)).join('')}</ol>`;
        else if (archive.error) list = `${DIALOG_NOTE('Archiv se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.')}${retry}`;
        else if (archive.done) list = `<div id="archive-empty" class="flex flex-col items-center gap-1 py-2 text-center">${uiArt('sova-prach', 'h-24 w-24')}<p class="text-sm font-semibold text-slate-500 dark:text-slate-400">Zatím žádný turnaj neskončil. Až první dohraje, najdeš ho tady.</p></div>`;
        else list = note('Načítám archiv…', 'data-archive-loading');
        let foot = '';
        if (rows.length) {
            if (archive.loading) foot = note('Načítám starší turnaje…', 'data-archive-loading');
            else if (archive.error) foot = `${DIALOG_NOTE('Starší turnaje se nepodařilo načíst.')}${retry}`;
            else if (archive.done) foot = `<p data-archive-end class="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">${rows.length > 1 ? 'Starší turnaje už nejsou.' : 'Jiné skončené turnaje zatím nejsou.'}</p>`;
            else foot = `<div data-archive-sentinel></div><button type="button" data-archive-more class="${SECONDARY_BUTTON}">Starší turnaje</button>`;
        }
        const overlay = showDialog(ARCHIVE_TITLE, `
            <div class="flex flex-col gap-3">
                <div class="flex items-center gap-3">${uiArt('archiv-turnaju', 'h-14 w-14')}<p class="min-w-0 text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">Výsledky skončených týdenních turnajů, nejnovější nahoře. Klepni na turnaj a uvidíš pódium, celé pořadí, pavouk i rozpis zápasů.</p></div>
                ${list}
                ${foot}
                ${current ? `<button type="button" data-t-current class="${SECONDARY_BUTTON}"><i data-lucide="trophy" class="h-5 w-5"></i> Aktuální turnaj</button>` : ''}
            </div>`, {
            onClick: (event) => {
                const target = event.target;
                const row = target.closest('[data-archive-open]');
                if (row) { archive.scroll = dialogScroll(); openArchivedTournament(row.dataset.archiveOpen); }
                else if (target.closest('[data-archive-more]')) { archive.error = false; loadArchive(); }
                else if (target.closest('[data-t-current]')) openTournament(currentTournamentId());
            }
        });
        watchArchiveEnd(overlay);
        return overlay;
    };
    // Hlídka na konci seznamu: jakmile se při posouvání okna ukáže, načte se další stránka
    const watchArchiveEnd = (overlay) => {
        if (archiveObserver) { archiveObserver.disconnect(); archiveObserver = null; }
        const sentinel = overlay && overlay.querySelector('[data-archive-sentinel]');
        if (!sentinel || archive.loading || archive.error || archive.done || typeof IntersectionObserver === 'undefined') return;
        archiveObserver = new IntersectionObserver((items) => {
            if (items.some(item => item.isIntersecting)) { archiveObserver.disconnect(); archiveObserver = null; loadArchive(); }
        }, { root: overlay.firstElementChild, rootMargin: '0px 0px 200px 0px' });
        archiveObserver.observe(sentinel);
    };
    const loadArchive = async () => {
        const user = signedUser();
        if (!user || !Social || archive.loading || archive.done) return;
        if (archive.user !== user.id) { resetArchive(); archive.user = user.id; }
        const mine = archive;
        mine.loading = true;
        mine.error = false;
        if (dialogTitled(ARCHIVE_TITLE)) renderArchive();
        try {
            const page = await Social.tournamentArchive(user.id, mine.rows.length, Social.ARCHIVE_PAGE);
            if (archive !== mine || !signedUser() || signedUser().id !== user.id) return;
            if (page === null) mine.done = true;
            else {
                const known = new Set(mine.rows.map(row => row.tournament.id));
                mine.rows = [...mine.rows, ...page.filter(row => !known.has(row.tournament.id))];
                if (page.length < Social.ARCHIVE_PAGE) mine.done = true;
            }
            mine.at = Date.now();
        } catch (error) {
            mine.error = true;
        } finally {
            mine.loading = false;
            if (archive === mine && dialogTitled(ARCHIVE_TITLE)) renderArchive();
        }
    };
    const openTournamentArchive = () => {
        const user = signedUser();
        if (!user || !Social || !Tournament) return;
        if (archive.user !== user.id || (!archive.loading && archive.at && Date.now() - archive.at > ARCHIVE_FRESH)) { archive = newArchive(); archive.user = user.id; }
        tournamentArchived = false;
        renderArchive();
        dialogScrollTo(0);
        if (!archive.rows.length && !archive.done) loadArchive();
    };
    const backToArchive = () => {
        tournamentArchived = false;
        if (!archive.rows.length) { openTournamentArchive(); return; }
        renderArchive();
        dialogScrollTo(archive.scroll || 0);
    };
    // Navigace nahoře v turnaji z archivu
    const archiveNavHtml = () => {
        const current = currentTournamentId();
        return `<div class="flex items-center justify-between gap-2">
            <button type="button" data-t-archive-back data-x-back class="${TOUR_SMALL} min-h-[2.5rem] px-2.5"><i data-lucide="chevron-left" class="h-4 w-4"></i>Archiv</button>
            ${current ? `<button type="button" data-t-current class="${TOUR_SMALL} min-h-[2.5rem] px-2.5"><i data-lucide="trophy" class="h-3.5 w-3.5"></i>Aktuální turnaj</button>` : ''}
        </div>`;
    };
    // Pódium: 2. vlevo, 1. uprostřed a nejvýš, 3. vpravo (v pořadí čtení 1., 2., 3.); můj sloupek je zvýrazněný
    const archivePodiumHtml = (entries, meId) => {
        const spots = [1, 2, 3].map(place => ({ place, entry: entries.find(entry => entry.place === place && entry.status === 'finished') || null }));
        if (!spots.some(spot => spot.entry)) return '';
        const looks = {
            1: { order: 'order-2', step: 'h-16', face: 'h-14 w-14 text-2xl', tone: 'bg-gradient-to-b from-gold-300 to-gold-500 text-brand-950' },
            2: { order: 'order-1', step: 'h-11', face: 'h-11 w-11 text-xl', tone: 'bg-gradient-to-b from-slate-200 to-slate-400 text-slate-800 dark:from-slate-400 dark:to-slate-600 dark:text-slate-50' },
            3: { order: 'order-3', step: 'h-8', face: 'h-11 w-11 text-xl', tone: 'bg-gradient-to-b from-amber-500 to-amber-700 text-white' }
        };
        const spot = ({ place, entry }) => {
            const look = looks[place];
            if (!entry) return `<li class="${look.order} min-w-0 flex-1"></li>`;
            const mine = entry.user_id === meId;
            return `<li data-podium="${place}" ${mine ? 'data-me' : ''} class="${look.order} flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                ${place === 1 ? '<i data-lucide="crown" class="h-5 w-5 text-gold-500 dark:text-gold-300"></i>' : ''}
                ${avatarHtml(entry.player, look.face)}
                <span class="line-clamp-2 w-full break-words text-center text-[12px] font-black leading-tight ${mine ? 'text-brand-700 dark:text-brand-200' : 'text-slate-800 dark:text-slate-100'}">${escapeHtml(playerName(entry.player))}${mine ? ' (ty)' : ''}</span>
                <span class="flex w-full ${look.step} items-start justify-center rounded-t-xl pt-1 text-base font-black ${look.tone} ${mine ? 'ring-2 ring-brand-600 dark:ring-brand-400' : ''}"><span class="sr-only">místo </span>${place}.</span>
            </li>`;
        };
        return `<ol id="archive-podium" aria-label="Pódium" class="flex items-end gap-2 rounded-2xl bg-gradient-to-b from-gold-50 to-white px-2.5 pt-2.5 ring-1 ring-gold-300/60 dark:from-gold-900/30 dark:to-slate-800 dark:ring-gold-700/50">${spots.map(spot).join('')}</ol>`;
    };
    // Moje umístění v turnaji z archivu (ve skupině vypadlých i s rozmezím skupiny)
    const archiveMeHtml = (entries, meId) => {
        const mine = entries.find(entry => entry.user_id === meId);
        if (!mine) return '';
        if (!IN_BRACKET.includes(mine.status)) return mine.status === 'excluded' ? '<p id="archive-me" class="rounded-2xl bg-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Přihláška byla, ale do pavouka se tenkrát nevešla.</p>' : '';
        const medal = mine.place >= 1 && mine.place <= 3;
        return `<p id="archive-me" class="flex items-center gap-2 rounded-2xl px-3 py-2 text-[13px] font-black ring-2 ${medal ? 'bg-gold-50 text-gold-900 ring-gold-400 dark:bg-gold-900/30 dark:text-gold-100 dark:ring-gold-600' : 'bg-brand-50 text-brand-800 ring-brand-600 dark:bg-brand-900/40 dark:text-brand-100 dark:ring-brand-400'}"><i data-lucide="${medal ? 'medal' : 'user'}" class="h-4 w-4 shrink-0"></i><span>${mine.place ? `Ty: ${escapeHtml(Tournament.placeLabel(mine.place))}${mine.place === 1 ? ', vítěz turnaje!' : ''}` : 'Ty: v turnaji'}</span></p>`;
    };
    // Turnaj z archivu: přihlášky a zápasy se načtou jednou (skončený turnaj se nemění), chybějící místa se dopočítají ze zápasů
    const openArchivedTournament = async (tid) => {
        const user = signedUser();
        if (!user || !Social || !Tournament || !tid) return;
        tournamentDialogId = tid;
        tournamentArchived = true;
        tournamentQuery = '';
        tournamentMode = 'bracket';
        bracketFull = true;
        bracketFocus = '';
        bracketReset = true;
        const row = archive.rows.find(item => item.tournament.id === tid);
        if (archiveViews.has(tid) || !row) { renderTournamentDialog(); dialogScrollTo(0); return; }
        const back = `<button type="button" data-t-archive-back data-x-back class="${SECONDARY_BUTTON}"><i data-lucide="chevron-left" class="h-5 w-5"></i> Zpět na archiv</button>`;
        showDialog(ARCHIVE_DETAIL, `<p class="py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Načítám turnaj…</p>${back}`, { onClick: (event) => { if (event.target.closest('[data-t-archive-back]')) backToArchive(); } });
        dialogScrollTo(0);
        const still = () => tournamentArchived && tournamentDialogId === tid && dialogTitled(ARCHIVE_DETAIL) && signedUser() && signedUser().id === user.id;
        try {
            const [entries, matches] = await Promise.all([Social.getTournamentEntries(tid), Social.getTournamentMatches(tid)]);
            if (!still()) return;
            const { tournament } = row;
            const placed = Tournament.finalPlaces(entries || [], tournament, matches || []);
            archiveViews.set(tid, { tournament, entries: placed, matches: matches || [], archived: true,
                state: Tournament.cardState({ tournament, entries: placed, matches: matches || [], me: user.id, today: Tournament.pragueToday() }) });
            renderTournamentDialog();
        } catch (error) {
            if (!still()) return;
            showDialog(ARCHIVE_DETAIL, `${DIALOG_NOTE('Turnaj se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.')}<div class="mt-2 flex flex-col gap-2"><button type="button" data-archive-retry class="${PRIMARY_BUTTON}">Zkusit znovu</button>${back}</div>`, {
                onClick: (event) => { if (event.target.closest('[data-t-archive-back]')) backToArchive(); else if (event.target.closest('[data-archive-retry]')) openArchivedTournament(tid); }
            });
        }
    };
    // Z rozpisu zápasu zpět do okna turnaje (běžícího i z archivu) na stejné místo
    const returnToTournament = (memo) => {
        tournamentDialogId = memo.tid;
        tournamentArchived = memo.archived;
        const overlay = renderTournamentDialog();
        if (!overlay) return;
        dialogScrollTo(memo.panel);
        const box = overlay.querySelector('#bracket-scroll');
        if (box && memo.box) box.scrollTo({ left: memo.box.left, top: memo.box.top, behavior: 'auto' });
    };

    // Přihlášení a odhlášení: hlášku (i chybu) ukáže toast, pak se turnaje načtou znovu
    const changeTournamentEntry = async (tid, join) => {
        if (!tid || tournamentBusy || !Social) return;
        tournamentBusy = tid;
        paintChallenges();
        if (document.getElementById('tournament-status') || document.getElementById('tournament-entries')) renderTournamentDialog();
        let joined = false;
        try {
            await (join ? Social.joinTournament(tid) : Social.leaveTournament(tid));
            showToast(join ? 'Jsi přihlášen do turnaje' : 'Odhlášen z turnaje');
            joined = join;
        } catch (error) {
            showToast(error.message);
        }
        tournamentBusy = '';
        // Hned po přihlášení do turnaje nabídka upozornění (kdo kolo neodehraje, vypadává); počká, až se zavře okno turnaje
        if (joined) schedulePushOffer('tournament');
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
        // Zápas právě začal: server od něj ještě žádnou odpověď nemá
        startChallenge({ ...tournamentChallengeDef(tournament, state, view.entries), synced: 0 }, 0, []);
    };
    // Zápas turnaje jako výzva: otázky ze semínka turnaje a kola, vždy výběr z možností a jen známější položky
    // entries = přihlášení hráči: soupeř se uloží k zápasu (záhlaví otázky ho ukáže, i kdyby se turnaje nenačetly)
    // Turnaj s otázkami na mapě (od týdne MULTIPLAYER_TOURNAMENTS_FROM, question-map.js): pro všechny hráče stejně podle týdne turnaje
    const tournamentMaps = (tournament) => Boolean(MapQuestion && MapQuestion.tournamentAllowsMaps(tournament));
    const tournamentChallengeDef = (tournament, state, entries = []) => {
        const opponent = state.opponent ? (entries || []).find(entry => entry.user_id === state.opponent) : null;
        return {
            code: 'turnaj', topic: tournament.topic, seed: `${tournament.seed}-r${state.round}`, count: Tournament.QUESTIONS, variant: 'choices', include_hard: false,
            tournament: { tid: tournament.id, mid: state.matchId, round: state.round, name: state.roundName, seedBase: tournament.seed, opponent: opponent && opponent.player ? opponent.player : null,
                maps: tournamentMaps(tournament) }
        };
    };
    // Pokračování rozehraného zápasu od první nezodpovězené otázky; server měří čas od začátku zápasu. Odpovědi se vezmou ze serveru (schéma 3),
    // takže zápas jde dohrát i po smazání dat nebo na jiném zařízení; starší databáze jen z uložené relace tohoto zařízení.
    // Když jsou všechny otázky zodpovězené (aplikace se zavřela před odesláním), výsledek se rovnou odešle.
    const resumeTournament = async (tid) => {
        if (!findTournament(tid) || !Social || tournamentStarting || isLoading) return;
        tournamentStarting = true;
        // Server rozhoduje: před pokračováním se stav zápasu načte znovu (mezitím mohl skončit den kola nebo se zápas rozhodl)
        try { await refreshTournaments({ force: true }); } catch (error) { /* bez spojení se pokračuje podle posledního známého stavu */ }
        const view = findTournament(tid);
        if (!view) { tournamentStarting = false; return; }
        syncTournamentStates();
        const saved = savedTournamentChallenge();
        const local = saved && saved.mid === view.state.matchId ? saved.challenge : null;
        const fromServer = !local && tournamentServerResume.has(view.state.matchId);
        if (view.state.step !== 'resume' || (!local && !fromServer)) {
            tournamentStarting = false;
            if (saved && view.state.matchId === saved.mid) markTournamentFinished(saved.mid);
            const expired = view.state.step === 'counting' || view.state.step === 'lost' || view.state.step === 'won';
            if (document.getElementById('dialog-overlay')) closeDialog();
            showToast(expired ? 'Tenhle zápas už vypršel, kolo skončilo.' : 'Tenhle zápas už nejde dohrát.');
            paintChallenges();
            return;
        }
        const def = { ...(local || tournamentChallengeDef(view.tournament, view.state, view.entries)) };
        // Zápas rozehraný ve starší verzi aplikace (bez údaje o mapě): údaj podle týdne turnaje, jako u nově začatého
        if (def.tournament && typeof def.tournament.maps !== 'boolean') def.tournament = { ...def.tournament, maps: tournamentMaps(view.tournament) };
        def.results = Array.from({ length: def.count }, (_, index) => (local && local.results[index]) || null);
        // Odpovědi ze serveru platí (mohly přibýt na jiném zařízení); bez spojení se pokračuje podle zařízení
        const user = signedUser();
        let rows;
        try { rows = user ? await Social.tournamentAnswers(user.id, view.state.matchId) : undefined; } catch (error) { rows = undefined; }
        tournamentStarting = false;
        if (Array.isArray(rows)) mergeAnswers(def, rows);
        else if (fromServer) { showToast('Rozehraný zápas se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'); return; }
        const next = def.results.findIndex(row => !row);
        showToast('Čas běží od začátku zápasu');
        if (next < 0) {
            challenge = makeChallenge(def, def.count - 1, def.results);
            mode = 'challenge';
            closeDialog();
            finishTournamentMatch();
            return;
        }
        startChallenge(def, next, def.results);
    };
    // Dohraný zápas se v uložené relaci označí jako hotový, ať ho karta po dalším spuštění nenabízí k pokračování
    const markTournamentFinished = (mid) => {
        tournamentServerResume.delete(mid);
        forgetOpenChallenge(`t:${mid}`);
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
        try {
            // Odpovědi, které server ještě nemá, se odešlou nejdřív: výsledek zápasu server sečte z nich
            const pushed = await syncAnswers(c);
            if (pushed === false) throw new Error('Výsledek se nepodařilo uložit. Zkontroluj připojení.');
            const correct = c.results.filter(row => row && row.correct).length;
            const points = c.results.reduce((sum, row) => sum + (row ? row.points : 0), 0);
            try {
                await Social.finishTournamentMatch(c.tournament.mid, correct, points);
            } catch (error) {
                // Odpověď se ztratila a výsledek už na serveru je: pokračuje se k výsledku zápasu
                if (!/jen jednou/.test(error.message)) {
                    // Server odpovědi nemá všechny (jiné zařízení, stará relace): při dalším pokusu se průběh načte znovu
                    if (error && error.status === 400) c.synced = -1;
                    throw error;
                }
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
        if (state === 'ok') flushAnswerStats();
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
                    <p data-result-points class="mt-0.5 text-4xl font-black">${escapeHtml(formatPoints(points))}</p>
                    <p data-result-correct class="mt-1 text-sm font-bold text-white/90">${correct}/${c.count} správně</p>
                </div>
                ${body}
                ${state === 'ok' && canTournamentBreakdown(match, user && user.id) ? `<button type="button" data-action="tournament-breakdown" data-tid="${escapeHtml(tour.tid)}" data-mid="${escapeHtml(tour.mid)}" class="${SECONDARY_BUTTON}"><i data-lucide="list-ordered" class="h-5 w-5"></i> Rozpis otázek</button>` : ''}
                <button type="button" data-action="tournament-back" class="${PRIMARY_BUTTON}"><i data-lucide="trophy" class="h-5 w-5"></i> Zpět na turnaj</button>
                <button type="button" data-action="challenge-home" class="${SECONDARY_BUTTON}">Zpět domů</button>
            </div>`;
        // Rozpis zápasu se po dohrání otevře sám (jednou), když soupeř už dohrál nebo je zápas rozhodnutý
        if (state === 'ok' && canTournamentBreakdown(match, user && user.id) && !c.breakdownShown) {
            c.breakdownShown = true;
            setTimeout(() => { if (challenge === c && screen === 'challenge-done' && !document.getElementById('dialog-overlay')) openTournamentBreakdown(tour.tid, tour.mid); }, 700);
        }
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
        'tournament-archive': () => openTournamentArchive(),
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

    // Skupiny (groups.js): okna dostanou pomocné funkce aplikace; Vyzvat skupinu otevře Novou výzvu pro skupinu
    // Skupina otevřená v okně (detail skupiny): název a ikona ze seznamu mých skupin, jinak název z okna
    const openGroupOf = () => {
        const detail = document.getElementById('group-detail');
        if (!detail || !detail.dataset.groupId) return null;
        const list = GroupsUI ? GroupsUI.groups() : null;
        const known = Array.isArray(list) ? list.find(item => item.id === detail.dataset.groupId) : null;
        const nameEl = detail.querySelector('[data-group-name]');
        return challengeGroup({ id: detail.dataset.groupId, name: known ? known.name : nameEl ? nameEl.textContent.trim() : '', icon: known ? known.icon : '' });
    };
    if (window.MudrlantGroups && Social) {
        GroupsUI = window.MudrlantGroups.createUI({
            Social, showDialog, closeDialog, avatarHtml, showToast, signedUser, renderIcons,
            login: () => { if (Auth) startLogin(); },
            // Hra z detailu skupiny: skupina se vezme z otevřeného okna (soupeř v záhlaví otázky)
            openChallenge: (code) => openChallenge(code, openGroupOf()),
            openQuiz: () => { if (DailyQuiz) openQuiz(); },
            newGroupChallenge: (group) => openNewChallenge({ group }),
            topicTitle: challengeTopicTitle, topicIcon: challengeTopicIcon,
            share: (payload) => ShareCard ? ShareCard.shareText(payload, { toast: showToast, copied: 'Odkaz do skupiny zkopírován', failed: 'Kopírování se nepodařilo' }) : null
        });
    }

    // Všechny akce přes delegaci událostí – stránka nepotřebuje inline JavaScript (kvůli CSP)
    const ACTIONS = {
        daily: (button) => { lastDailyTopic = button.dataset.topic; startDaily(button.dataset.topic); },
        'auth-login': () => Auth && startLogin(),
        'play-as-host': () => {
            writeJson(KEYS.account, 'host');
            showStart();
        },
        'open-profile': () => openProfile(),
        'open-accept': () => openAccepted(),
        'groups-open': () => { touchTip('groups'); if (GroupsUI) GroupsUI.openList(); },
        // Přátelé a reakce (friends.js)
        'friend-accept': (button) => answerFriendRequest(button.dataset.id, true),
        'friend-decline': (button) => answerFriendRequest(button.dataset.id, false),
        react: (button) => sendReaction(button.dataset.emoji, button.dataset.to),
        'weekly-board': () => openWeeklyBoard(),
        'league-help': () => openLeagueHelp(),
        'league-seasons': () => openLeagueSeasons(),
        'home-tab': (button) => { writeJson(KEYS.homeTab, button.dataset.tab === 'multi' ? 'multi' : 'single'); renderHome(); refreshTournaments(); },
        ...tournamentActions,
        ...modeActions,
        'new-challenge': () => openNewChallenge(),
        'random-challenge': () => openNewChallenge({ who: 'random' }),
        'recent-more': () => { recentExpanded = !recentExpanded; paintChallenges(); },
        'recent-older': () => { recentOlder.error = false; loadOlderChallenges(); },
        'join-challenge': () => openJoinChallenge(),
        'challenge-open': (button) => openChallenge(button.dataset.code),
        'challenge-resume': async () => {
            if (!ownChallengeInProgress() || resumingChallenge) return;
            // Server mohl mezitím dostat další odpovědi (hráč pokračoval na jiném zařízení): pokračuje se podle něj
            const c = challenge;
            resumingChallenge = true;
            try { await refreshAnswers(c); } finally { resumingChallenge = false; }
            if (challenge === c) continueChallenge();
        },
        'challenge-share': (button) => shareChallenge(button.dataset.code, button.dataset.text || ''),
        'challenge-share-image': () => shareChallengeImage(),
        // Kvíz dne (daily-quiz.js) a obrázek k výsledku dnešní otázky (share-card.js)
        'quiz-open': () => openQuiz(),
        'quiz-start': () => startQuiz(),
        'quiz-breakdown': (button) => openQuizBreakdown(button.dataset.player),
        'quiz-skip-intro': (button) => {
            const on = button.getAttribute('aria-checked') !== 'true';
            setQuizSkipIntro(on);
            button.outerHTML = DailyQuiz.introHtml({ skipIntro: on, day: DailyQuiz.pragueDay() }, quizHelpers()).match(/<button type="button" data-action="quiz-skip-intro"[\s\S]*?<\/button>/)[0];
            renderIcons(appContent);
            showToast(on ? 'Příště Kvíz dne začne rovnou. Úvod jde zapnout v Nastavení → Hra.' : 'Úvod Kvízu dne se zase ukáže.');
        },
        'quiz-home': () => renderHome(),
        'quiz-tab': (button) => { if (quizView) { quizView.tab = button.dataset.tab === 'friends' ? 'friends' : 'all'; paintQuizRanking(); } },
        'quiz-share': () => shareQuiz(),
        'quiz-share-image': () => shareQuizImage(),
        'quiz-login': () => { writeJson(QUIZ_LOGIN_KEY, DailyQuiz.pragueDay()); if (Auth) startLogin(); },
        'share-image': () => shareDailyImage(),
        // Tajemná otázka dne (mystery.js)
        'mystery-open': () => openMystery(),
        'mystery-reveal': () => openMystery({ past: true }),
        'mystery-dismiss': () => dismissMysteryReveal(),
        'mystery-home': () => renderHome(),
        'mystery-choice': (button) => submitMysteryTip({ choice: Number(button.dataset.index) }),
        'mystery-share': () => shareMystery(),
        'mystery-share-image': () => shareMysteryImage(),
        'mystery-login': () => { if (Auth) startLogin(); },
        'challenge-retry': () => finishChallenge(true),
        'challenge-home': () => challengeHome(),
        'challenge-breakdown': () => { if (challenge && !challenge.tournament) openChallengeBreakdown(challenge, challenge.lastResults || []); },
        'tournament-breakdown': (button) => openTournamentBreakdown(button.dataset.tid, button.dataset.mid),
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
        // Potvrzení tipu na mapě: body podle vzdálenosti (question-map.js), správně = aspoň bod
        'map-confirm': () => {
            if (!MapQuestion || !round || round.answered || !current || current.question.type !== 'map') return;
            const result = MapQuestion.evaluate(current.question, round.mapGuess, round.variant === 'typed');
            if (result) submitAnswer({ correct: result.points > 0, typed: false, answer: `Vedle o ${MapQuestion.formatKm(result.km)}`, points: result.points, extra: { map: result } });
        },
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
        'chronicle-open': () => openChronicleFromStrip(),
        'chronicle-dismiss': () => dismissChronicle(),
        'chest-open': () => openChestOverlay(),
        'season-claim': () => openSeasonReveal(),
        'season-open': () => openSeason(),
        'freeze-info': () => openFreezeHelp(),
        'clear-mistakes': () => clearMistakes(),
        'order-pick': (button) => numericPick(Number(button.dataset.index)),
        'order-confirm': () => numericConfirm(),
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

    // Obrázek k výsledku dnešní otázky se začne kreslit už při stisku (před klepnutím), ať se sdílí co nejdřív po klepnutí
    appContent.addEventListener('pointerdown', (event) => {
        if (!ShareCard || !event.target.closest('[data-action="share-image"]')) return;
        const card = dailyCardInput();
        if (card) ShareCard.prepare(card, ShareCard.fileName(`dnesni-${current.topic}`, card.day));
    });

    appContent.addEventListener('submit', (event) => {
        if (event.target.id === 'estimate-form') { event.preventDefault(); numericEstimate(event.target); return; }
        if (event.target.id === 'mystery-form') { event.preventDefault(); submitMysteryTip({ text: event.target.elements.answer.value.trim() }); return; }
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

    // Odhadni číslo: pod polem se ukazuje, jak aplikace číslo čte (dlouhá čísla, miliony)
    appContent.addEventListener('input', (event) => {
        if (event.target.id !== 'estimate-input' || !isNumeric(current)) return;
        event.target.removeAttribute('aria-invalid');
        Numeric.notePreview(document.getElementById('estimate-note'), current, event.target.value);
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
        else if (nextTip()) openTip(nextTip());
        else openFact();
    });
    // Zvětšení fotky funguje všude: v nápovědě, ve výsledku, v okně s popisem i v atlasu
    document.addEventListener('click', (event) => {
        const zoom = event.target.closest('[data-photo-zoom]');
        if (zoom && zoom.dataset.url) openPhotoZoom(zoom.dataset.url, zoom.dataset.masks ? JSON.parse(zoom.dataset.masks) : null);
        // Zdroj obrázku: tlačítko „i“ u fotky, obrázku otázky i obrazové nápovědy z Commons
        const source = event.target.closest('[data-photo-info]');
        if (source && source.dataset.url) openPhotoSource(source);
    });
    // Escape zavře nejdřív okno s popisem, pak výběr co hrát, pak nastavení
    // Tlačítko Zpět na mobilu jako zpět v aplikaci: mimo čistou úvodní obrazovku drží aplikace v historii prohlížeče jeden
    // krok navíc. Zpět ho spotřebuje a aplikace udělá svůj krok zpět (zavře okno, z otázky domů, v učení o úroveň výš);
    // teprve na úvodní obrazovce Zpět aplikaci opustí. Krok se doplní či odebere po každé změně obrazovky nebo okna.
    const OVERLAY_IDS = ['photo-source', 'photo-zoom', 'place-info', 'play-chooser', 'settings-overlay', 'dialog-overlay'];
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
        if (document.getElementById('photo-source')) closePhotoSource();
        else if (document.getElementById('fact-overlay')) closeFact();
        else if (document.getElementById('dialog-overlay')) dialogStepBack();
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
        } else if (screen === 'quiz' || screen === 'quiz-done' || screen === 'mystery') {
            renderHome();
        } else if (screen === 'mode') {
            leaveMode();
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
        if (document.getElementById('photo-source')) closePhotoSource();
        else if (document.getElementById('fact-overlay')) closeFact();
        else if (document.getElementById('dialog-overlay')) dialogStepBack();
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
            if (!event.data || event.data.type !== 'push-open') return;
            // Zkušební upozornění (vývojářský režim): klepnutí zavře okno zkoušky i Nastavení a potvrdí, že klepnutí funguje
            const test = event.data.kind === 'test';
            if (test && pushTestOpen()) closeDialog();
            if (test && screen === 'home') closeSettings();
            openHomeTabFromPush(String(event.data.tab || ''));
            // Upozornění k výzvě (pozvánka, soupeř dohrál): rovnou okno výzvy s výsledky
            const pushCode = Social ? Social.parseCode(String(event.data.vyzva || '')) : '';
            if (pushCode) openChallenge(pushCode);
            if (test) showToast('Klepnutí na upozornění funguje: otevřela se záložka Více hráčů');
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
        const groupInvite = GroupsUI ? GroupsUI.takeLink() : '';
        let shownUserId = null;
        Auth.onChange((state) => {
            if (document.getElementById('settings-overlay')) openSettings();
            // Úvod s přihlášením: po přihlášení dál (k variantě nebo domů), po neúspěchu znovu s chybou
            if (document.getElementById('account-welcome') && (Auth.hasSession() || state.error)) showStart();
            // Odhlášení, nebo přihlášení jiného účtu (třeba v jiné kartě): údaje předchozího účtu se zahodí, ať se nepromítnou do nového
            // (jeho bloky, přijímaná témata a výzvy by se jinak ukazovaly a ukládaly pod novým účtem)
            const userId = state.user ? state.user.id : null;
            if (userId !== shownUserId) {
                shownUserId = userId;
                myProfile = null; myBlocked = null; myAcceptsMix = true; acceptsConfirmed = null; myChallenges = null; myRating = null; incomingList = null; friendRows = null; recentReactions = []; myBlocks = null; resetTournaments();
                quizServer = null; quizServerAt = 0;
                leagueSeasons = null; leagueSeasonsAt = 0; myShowcase = null; myShowcaseAt = 0; seasonPick = null;
                if (GroupsUI) GroupsUI.reset();
                updateProfileButton();
                paintChallenges();
            }
            if (!state.user) return;
            // Po přihlášení (i návratu z Googlu) se otevře výzva, na kterou hráč klepl v odkazu
            const pending = readJson(KEYS.pendingChallenge);
            if (pending) {
                try { localStorage.removeItem(KEYS.pendingChallenge); } catch (e) { /* bez úložiště se kód nepamatuje */ }
                openChallenge(pending);
            } else if (GroupsUI) GroupsUI.afterLogin();
            refreshChallenges();
            if (state.user) { flushReports(); flushAnswerStats(); }
            // Přihlášení z výsledku Kvízu dne („Přihlas se a uvidíš se v pořadí“): výsledek se otevře znovu a zapíše na účet
            if (DailyQuiz && readJson(QUIZ_LOGIN_KEY)) {
                try { localStorage.removeItem(QUIZ_LOGIN_KEY); } catch (e) { /* bez úložiště se nic nepamatuje */ }
                if (screen === 'home' || screen === 'quiz-done') openQuiz();
            }
        });
        window.addEventListener('online', flushReports);
        // Po obnovení připojení se dopošlou odpovědi z dohraných her (rozehraná hra počká na svůj konec)
        window.addEventListener('online', () => { if (screen !== 'round') flushAnswerStats(); });
        Auth.init().then(state => {
            if (!state.user && invite) openChallenge(invite);
            // Odkaz do skupiny: přihlášený se rovnou přidá (náhled a Přidat se), nepřihlášený se nejdřív přihlásí
            else if (groupInvite && GroupsUI) GroupsUI.openJoin(groupInvite);
        });
    }
    // Klávesnice na telefonu: Chrome i Safari při jejím otevření zmenší jen viditelnou plochu, okna zarovnaná ke spodku by zůstala pod ní.
    // Výška klávesnice jde do proměnné --kb (styles: okna se o ni zvednou a zkrátí) a zaměřené pole se posune do viditelné části okna.
    const viewport = window.visualViewport;
    if (viewport) {
        const syncKeyboard = () => {
            const inset = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
            // Klávesnice jen při psaní do pole: menší rozdíl je lišta prohlížeče, přiblížení prsty není klávesnice a rozdíl bez
            // zaměřeného pole je chybně nahlášená výška okna (řeší syncAppHeight níž)
            const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
            const open = typing && inset > 80 && viewport.scale < 1.05;
            const root = document.documentElement;
            const was = root.classList.contains('kb-open');
            root.style.setProperty('--kb', `${open ? inset : 0}px`);
            root.classList.toggle('kb-open', open);
            const field = document.activeElement;
            if (open && !was && field && field.closest && field.closest('#dialog-overlay, #settings-overlay')) {
                requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
            }
        };
        viewport.addEventListener('resize', syncKeyboard);
        viewport.addEventListener('scroll', syncKeyboard);
    }
    // Výška aplikace = skutečně viditelná plocha (--app-h). Android po obnovení stránky (aktualizace aplikace) občas nahlásí
    // výšku i se systémovou lištou a 100dvh pak sahá pod spodek obrazovky – aplikace by byla useknutá, dokud se nezavře.
    // Proto se výška přeměří po načtení, po změně velikosti, po návratu do aplikace a ještě chvíli po startu.
    // Při otevřené klávesnici se nemění (okna se zvedají přes --kb).
    const syncAppHeight = () => {
        const root = document.documentElement;
        if (root.classList.contains('kb-open')) return;
        const visible = viewport && viewport.scale < 1.05 ? viewport.height : window.innerHeight;
        if (visible > 200) root.style.setProperty('--app-h', `${Math.round(visible)}px`);
    };
    if (viewport) viewport.addEventListener('resize', syncAppHeight);
    document.addEventListener('focusout', () => setTimeout(() => { if (viewport) viewport.dispatchEvent(new Event('resize')); else syncAppHeight(); }, 250));
    window.addEventListener('resize', syncAppHeight);
    window.addEventListener('pageshow', syncAppHeight);
    window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 300));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { syncAppHeight(); setTimeout(syncAppHeight, 400); } });
    syncAppHeight();
    [300, 1000, 2500].forEach(delay => setTimeout(syncAppHeight, delay));
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
    if (Tutorial && gameVariant) Tutorial.maybeStart({ ready: factLoading });
})();
