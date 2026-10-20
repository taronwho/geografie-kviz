// Mudrlant – rozhraní kvízu: dnešní otázky témat, trénink, učení, okno s popisem, nastavení a ukládání stavu.
// Téma (topics/*.js) dodá kategorie, znění otázek, obrazovou nápovědu a fakta; všechno ostatní je společné.
(() => {
    'use strict';

    const {
        SATELLITE_TILES, OSM_TILES,
        escapeHtml, isRealPhoto, commonsPhotoUrl, displayName, formatPoints, getDayKey, formatDayKey, createSeededRandom, pickRandom,
        censorName, processWikiText, isAnswerMatch, filterItems, pickItem, sortItems,
        buildItemChoices, findAnswerItem, updateMistakes, nameAnswers, getHintSteps, pointsFor,
        computeStreak, buildShareText, getTileLayout
    } = window.MudrlantCore;
    const Visuals = window.MudrlantVisuals;
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
        learned: 'mudrlant.learned'
    };
    const STATE_VERSION = 8;
    const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
    const HISTORY_SIZE = 200;
    const REQUEST_TIMEOUT = 12000;
    const PHOTO_TIMEOUT = 8000;
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
    // Odkud trénink bere otázky: { kind: 'mix' } (vybraná témata), { kind: 'collection', topic, collection }, { kind: 'mistakes' }
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

    const loadSettings = () => {
        const saved = readJson(KEYS.settings) || {};
        const topics = Array.isArray(saved.topics) ? saved.topics.filter(id => TOPIC_BY_ID[id]) : [];
        return { tier: saved.tier === 'all' ? 'all' : 'known', topics: topics.length ? topics : TOPICS.map(topic => topic.id) };
    };

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
    const loadLearned = () => readJson(KEYS.learned) || {};

    const createRound = () => ({ hintLevel: 1, variant: gameVariant || 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false });
    const getLevelCount = (data) => 1 + data.hints.length;

    const VARIANTS = {
        choices: { icon: 'layout-grid', title: 'Výběr ze 4 možností', text: 'Klasický kvíz. Bez nápovědy až 4 body, každá nápověda bod ubere.' },
        typed: { icon: 'keyboard', title: 'Psaní odpovědi', text: 'Těžší varianta za dvojnásobek bodů. Na diakritice, velkých písmenech ani drobném překlepu nezáleží.' }
    };
    const TIERS = {
        known: { title: 'Jen známé', text: 'Hlavní města, slavné osobnosti, běžná zvířata…' },
        all: { title: 'I méně známé', text: 'Těžší – celá sada' }
    };

    // Barvy témat (celé názvy tříd kvůli Tailwindu)
    const TOPIC_STYLES = {
        emerald: { soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300', solid: 'border-emerald-400 bg-emerald-600' },
        amber: { soft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', solid: 'border-amber-400 bg-amber-600' },
        lime: { soft: 'bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300', solid: 'border-lime-500 bg-lime-600' },
        sky: { soft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300', solid: 'border-sky-400 bg-sky-600' },
        violet: { soft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', solid: 'border-violet-400 bg-violet-600' },
        rose: { soft: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', solid: 'border-rose-400 bg-rose-600' }
    };
    const styleOf = (topic) => TOPIC_STYLES[topic && topic.color] || TOPIC_STYLES.emerald;

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

    const showToast = (message) => {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.setAttribute('role', 'status');
            toast.className = 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white opacity-0 shadow-lg transition-opacity duration-300 dark:bg-white dark:text-slate-900';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.remove('opacity-0');
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => toast.classList.add('opacity-0'), 2500);
    };

    // --- Data: témata, tabulka států a obrysy států (vlastní soubory, service worker je drží i bez internetu) ---

    // Při výpadku, omezení (429) nebo zaseknutém spojení zkusí dotaz znovu, pak to vzdá jako chybu spojení
    const fetchJson = async (url, attempts = 3) => {
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 800 * attempt));
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
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
    // Kontext tématu: definice, položky, okruhy a tabulka států; po načtení dostupný i synchronně
    const loadedTopics = new Map();
    const loadTopic = memoizeBy(async (topicId) => {
        const topic = TOPIC_BY_ID[topicId];
        if (!topic) throw new Error(`Neznámé téma ${topicId}`);
        const [data, countries] = await Promise.all([fetchJson(topic.dataFile), loadCountries()]);
        const ctx = { topic, items: data.items, collections: data.collections || [], countries, byId: new Map(data.items.map(item => [item.q, item])) };
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
            const data = await fetchJson(`${WIKI_API}&action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&redirects=1&titles=${encodeURIComponent(item.t)}`, 2);
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
        return { description: shortDescription, funFacts: [] };
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

    // Popis bez odpovědi: téma může zakrývat po svém (u otázky na stát stát), jinak se zakryje název položky
    const censorFor = (type, text, item, ctx) => {
        if (!text) return '';
        const custom = ctx.topic.censor ? ctx.topic.censor(type, text, item, ctx) : null;
        if (custom !== null && custom !== undefined) return custom;
        const aliases = ctx.topic.nameAliases ? ctx.topic.nameAliases(item, ctx) : [];
        return censorName(text, [item.n, displayName(item.t), ...aliases].join(', '));
    };

    // Data jedné otázky – vše, co se uloží a po obnovení stránky zobrazí znovu
    const createRoundData = async (item, ctx, rng) => {
        const { topic, items } = ctx;
        // Pořadí volání rng je stálé, aby dnešní otázka vyšla všem stejně
        const special = topic.specialQuestion ? topic.specialQuestion(item, ctx, rng) : null;
        const category = categoryOf(topic, item.c);
        const question = special || {
            type: 'name',
            title: category.question || topic.words.question,
            showName: false,
            choices: buildItemChoices(item, items, rng, other => topic.groupOf ? topic.groupOf(other, ctx) : ''),
            accepted: nameAnswers(item, topic.nameAliases ? topic.nameAliases(item, ctx) : []),
            placeholder: category.placeholder || topic.words.placeholder,
            answerLabel: item.n
        };
        const [text, photoUrl] = await Promise.all([fetchItemText(item), probePhoto(photoOf(item, 960))]);
        const visual = topic.visual ? topic.visual(item, ctx, question.type) : null;
        const facts = topic.facts(item, ctx, question.type);
        // Typ položky („obec ve Španělsku“, „král“) nesmí prozradit odpověď
        const typeLabel = item.ty && !censorFor(question.type, item.ty, item, ctx).includes('[***]') ? item.ty : category.one;
        return {
            topic: topic.id,
            id: item.q,
            title: item.t,
            name: item.n,
            category: item.c,
            known: item.k === 1,
            typeLabel,
            question,
            questionText: censorFor(question.type, text.description, item, ctx),
            photoUrl,
            visual,
            // Ve výsledku už odpověď známe, takže nápověda může ukázat vše (u otázky na století časovou osu)
            resultVisual: topic.visual ? topic.visual(item, ctx, 'result') : null,
            facts,
            resultFacts: topic.facts(item, ctx, 'result'),
            hints: getHintSteps({ hasPhoto: Boolean(photoUrl), hasVisual: Boolean(visual && Visuals.info(visual)), hasFacts: facts.length > 0 }),
            subtitle: topic.subtitle(item, ctx),
            coords: topic.coords ? topic.coords(item, ctx) : null,
            isCzech: Boolean(topic.isCzech && topic.isCzech(item, ctx)),
            description: text.description,
            funFacts: text.funFacts
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
        <button type="button" data-variant="${key}" aria-pressed="${selected === key}" class="flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition-colors active:scale-[0.98] ${selected === key ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700'}">
            <span class="shrink-0 rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"><i data-lucide="${variant.icon}" class="h-6 w-6"></i></span>
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
                    <i data-lucide="graduation-cap" class="mx-auto mb-3 h-12 w-12 text-emerald-500"></i>
                    <h2 class="text-2xl font-black text-slate-800 dark:text-slate-50">Vítej v Mudrlantovi</h2>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Kvíz ze zeměpisu a dalších oborů. Jak chceš odpovídat? Změníš to kdykoli v nastavení vpravo nahoře.</p>
                </div>
                <div id="variant-welcome" class="flex flex-col gap-3">${renderVariantCards(null)}</div>
            </div>`;
        renderIcons(appContent);
        updateControlsUI();
    };

    const SETTINGS_HEADING = 'text-xs font-black uppercase tracking-widest text-slate-400';
    const TOGGLE_ON = 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
    const TOGGLE_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700';

    const renderPracticeSettings = () => {
        const tierButtons = Object.entries(TIERS).map(([key, tier]) => `
            <button type="button" data-tier="${key}" aria-pressed="${settings.tier === key}" class="rounded-2xl border-2 p-3 text-left transition-colors active:scale-[0.98] ${settings.tier === key ? TOGGLE_ON : TOGGLE_OFF}">
                <span class="block text-sm font-black">${tier.title}</span>
                <span class="mt-0.5 block text-xs leading-snug opacity-80">${tier.text}</span>
            </button>`).join('');
        const topicButtons = TOPICS.map(topic => {
            const isOn = settings.topics.includes(topic.id);
            return `
                <button type="button" data-topic-toggle="${topic.id}" aria-pressed="${isOn}" class="flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors active:scale-95 ${isOn ? TOGGLE_ON : TOGGLE_OFF}">
                    <i data-lucide="${isOn ? 'check' : topic.icon}" class="h-4 w-4"></i> ${escapeHtml(topic.title)}
                </button>`;
        }).join('');
        return `
            <h3 class="${SETTINGS_HEADING} mb-1 mt-6">Známost</h3>
            <p class="mb-3 text-sm text-slate-500 dark:text-slate-400">Pro trénink a prohlížení celých témat. Dnešní otázky jsou vždy ze známých.</p>
            <div class="grid grid-cols-2 gap-2" role="group" aria-label="Známost">${tierButtons}</div>
            <h3 class="${SETTINGS_HEADING} mb-1 mt-6">Témata v tréninku</h3>
            <p class="mb-3 text-sm text-slate-500 dark:text-slate-400">Trénink střídá otázky ze zapnutých témat.</p>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Témata v tréninku">${topicButtons}</div>`;
    };

    const closeSettings = () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.remove();
    };

    const openSettings = (note = '', focusSelector = null) => {
        closeSettings();
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'settings-title');
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
        overlay.innerHTML = `
            <div class="fade-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-slate-50 p-5 shadow-2xl dark:bg-slate-900">
                <div class="mb-4 flex items-center justify-between">
                    <h2 id="settings-title" class="text-lg font-black text-slate-800 dark:text-slate-100">Nastavení</h2>
                    <button type="button" data-close aria-label="Zavřít" class="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                <h3 class="${SETTINGS_HEADING} mb-3">Varianta hry</h3>
                <div class="flex flex-col gap-3">${renderVariantCards(gameVariant)}</div>
                ${renderPracticeSettings()}
                <p id="settings-note" class="mt-4 min-h-[1.25rem] text-sm font-semibold text-emerald-700 dark:text-emerald-300" role="status">${escapeHtml(note)}</p>
            </div>`;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) {
                closeSettings();
                return;
            }
            const variantButton = event.target.closest('[data-variant]');
            if (variantButton) changeVariant(variantButton.dataset.variant);
            const tierButton = event.target.closest('[data-tier]');
            if (tierButton) changeSettings({ tier: tierButton.dataset.tier }, `[data-tier="${tierButton.dataset.tier}"]`);
            const topicButton = event.target.closest('[data-topic-toggle]');
            if (topicButton) togglePracticeTopic(topicButton.dataset.topicToggle);
        });
        document.body.appendChild(overlay);
        renderIcons(overlay);
        (overlay.querySelector(focusSelector || '[data-variant][aria-pressed="true"]') || overlay.querySelector('[data-close]')).focus();
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
        if (round && !round.answered && round.variant !== variant) {
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

    const changeSettings = (change, focusSelector, note = 'Uloženo, platí od další otázky v tréninku.') => {
        settings = { ...settings, ...change };
        writeJson(KEYS.settings, settings);
        openSettings(note, focusSelector);
        if (screen === 'learn') renderLearn();
    };

    const togglePracticeTopic = (topicId) => {
        const isOn = settings.topics.includes(topicId);
        if (isOn && settings.topics.length === 1) {
            openSettings('Aspoň jedno téma musí zůstat zapnuté.', `[data-topic-toggle="${topicId}"]`);
            return;
        }
        const topics = isOn ? settings.topics.filter(id => id !== topicId) : [...settings.topics, topicId];
        changeSettings({ topics: TOPICS.map(topic => topic.id).filter(id => topics.includes(id)) }, `[data-topic-toggle="${topicId}"]`);
    };

    // --- Hlavička ---

    const BUTTON_BASE = 'p-2 rounded-2xl transition-all shadow-md active:scale-95 border';
    const BUTTON_ACTIVE = {
        home: `${BUTTON_BASE} bg-emerald-600 text-white border-emerald-500`,
        practice: `${BUTTON_BASE} bg-sky-600 text-white border-sky-500`,
        learn: `${BUTTON_BASE} bg-violet-600 text-white border-violet-500`
    };
    const BUTTON_INACTIVE = `${BUTTON_BASE} bg-white/90 text-slate-600 hover:text-emerald-600 border-slate-200/60 dark:bg-slate-800/90 dark:text-slate-300 dark:border-slate-700 dark:hover:text-emerald-400`;

    const shortDay = (dayKey) => formatDayKey(dayKey).replace(/ \d{4}$/, '');

    const describePool = () => {
        if (pool.kind === 'mistakes') return { icon: 'repeat', text: `Opakování chyb · ${loadMistakes().length}` };
        if (pool.kind === 'collection') {
            const ctx = loadedTopics.get(pool.topic);
            return { icon: 'layers', text: ctx ? `${ctx.topic.title} · ${collectionLabel(ctx, pool.collection)}` : 'Procvičování' };
        }
        return { icon: 'shuffle', text: `Trénink · ${formatPoints(loadStats().practice.points)}` };
    };

    const updateControlsUI = () => {
        const section = screen === 'learn' ? 'learn' : screen === 'round' ? (mode === 'daily' ? 'home' : 'practice') : 'home';
        const buttons = { home: document.getElementById('btn-home'), practice: document.getElementById('btn-practice'), learn: document.getElementById('btn-learn') };
        Object.entries(buttons).forEach(([key, button]) => {
            button.className = section === key ? BUTTON_ACTIVE[key] : BUTTON_INACTIVE;
            button.setAttribute('aria-pressed', String(section === key));
            button.disabled = isLoading;
            button.classList.toggle('opacity-50', isLoading);
        });
        const practiceIcon = document.getElementById('practice-icon');
        if (practiceIcon) practiceIcon.classList.toggle('spin', isLoading && mode === 'practice');

        // Štítek vlevo nahoře ukazuje, kde hráč je
        let icon = 'calendar-days';
        let status = `${APP_NAME} · ${shortDay(getDayKey())}`;
        if (screen === 'learn') {
            icon = 'graduation-cap';
            status = learn.topic && learn.view !== 'home' && learn.view !== 'mistakes' ? `Učení · ${TOPIC_BY_ID[learn.topic].title}` : 'Učení';
        } else if (screen === 'round' && current) {
            const topic = TOPIC_BY_ID[current.topic];
            if (mode === 'daily') {
                icon = topic.icon;
                status = `${topic.title} · ${shortDay(current.dailyDate || getDayKey())}`;
            } else {
                ({ icon, text: status } = describePool());
            }
        }
        const iconSlot = document.getElementById('status-icon-slot');
        iconSlot.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i>`;
        renderIcons(iconSlot);
        document.getElementById('status-text').textContent = status;
    };

    const renderLoading = (text = 'Vybírám otázku…') => {
        appContent.innerHTML = `
            <div class="absolute inset-0 z-10 flex flex-col items-center justify-center fade-in bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <i data-lucide="globe" class="w-14 h-14 text-emerald-500 spin mb-5 drop-shadow-md"></i>
                <p class="text-slate-600 dark:text-slate-300 font-bold tracking-wider text-sm uppercase">${escapeHtml(text)}</p>
            </div>
        `;
        renderIcons(appContent);
    };

    const CARD = 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-sm';
    const CARD_TITLE = 'text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2';
    const HINT_CHIP = 'mb-4 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 inline-flex items-center gap-2';
    const IMAGE_LABEL = 'absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm';
    const BACK_LINK = 'flex w-fit items-center gap-1 rounded-lg py-1 pr-2 text-sm font-bold text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-300';

    // --- Domů: dnešní otázky všech témat ---

    const dailyStatus = (topicId, stats) => {
        const result = (stats.daily[topicId] || {})[getDayKey()];
        if (!result) return { text: 'Čeká na tebe', tone: 'text-slate-500 dark:text-slate-400', icon: '' };
        return result.correct
            ? { text: `Správně · ${formatPoints(result.points)}`, tone: 'text-emerald-700 dark:text-emerald-400', icon: 'circle-check' }
            : { text: 'Tentokrát ne', tone: 'text-rose-600 dark:text-rose-400', icon: 'circle-x' };
    };

    const renderHome = () => {
        screen = 'home';
        closePlaceInfo();
        const stats = loadStats();
        const today = getDayKey();
        const cards = TOPICS.map(topic => {
            const status = dailyStatus(topic.id, stats);
            const streak = computeStreak(stats.daily[topic.id] || {}, today);
            return `
                <button type="button" data-action="daily" data-topic="${topic.id}" class="flex w-full items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700">
                    <span class="shrink-0 rounded-2xl p-3 ${styleOf(topic).soft}"><i data-lucide="${topic.icon}" class="h-6 w-6"></i></span>
                    <span class="min-w-0 flex-1">
                        <span class="block text-lg font-black text-slate-800 dark:text-slate-100">${escapeHtml(topic.title)}</span>
                        <span class="flex items-center gap-1 text-sm font-semibold ${status.tone}">${status.icon ? `<i data-lucide="${status.icon}" class="h-4 w-4"></i>` : ''}${status.text}</span>
                    </span>
                    ${streak ? `<span class="flex shrink-0 items-center gap-1 rounded-xl bg-orange-50 px-2 py-1 text-sm font-black text-orange-600 dark:bg-orange-950/50 dark:text-orange-400" title="Série dní"><i data-lucide="flame" class="h-4 w-4"></i>${streak}</span>` : ''}
                    <i data-lucide="chevron-right" class="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600"></i>
                </button>`;
        }).join('');
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-5 pb-6 dark:bg-slate-900">
                <div class="text-center">
                    <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">Dnešní otázky</h2>
                    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Každé téma má jednu otázku denně – stejnou pro všechny. ${formatDayKey(today)}</p>
                </div>
                <div class="flex flex-col gap-3">${cards}</div>
                <div class="grid grid-cols-2 gap-3">
                    <button type="button" data-action="practice-mix" class="flex flex-col items-start gap-1 rounded-[1.5rem] bg-sky-600 p-4 text-left text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-700 active:scale-95">
                        <i data-lucide="shuffle" class="h-6 w-6"></i>
                        <span class="text-base font-black">Trénink</span>
                        <span class="text-xs leading-snug text-sky-100">Neomezeně otázek z vybraných témat</span>
                    </button>
                    <button type="button" data-action="open-learn" class="flex flex-col items-start gap-1 rounded-[1.5rem] bg-violet-600 p-4 text-left text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-95">
                        <i data-lucide="graduation-cap" class="h-6 w-6"></i>
                        <span class="text-base font-black">Učení</span>
                        <span class="text-xs leading-snug text-violet-100">Okruhy, atlas a chyby k zopakování</span>
                    </button>
                </div>
                <!-- Bezpečnostní mezera pro spodní okraj displeje -->
                <div class="h-12 w-full shrink-0"></div>
            </div>`;
        renderIcons(appContent);
        appContent.scrollTo(0, 0);
        updateControlsUI();
    };

    // --- Otázka: popis hned, pak nápovědy fotka → obrazová nápověda tématu → fakta ---

    const cssUrl = (url) => `url("${url.replace(/["\\]/g, '\\$&')}")`;

    // Fotka je pozadí prvku, ne <img> – podržením nejde otevřít a z adresy souboru vyčíst název
    const setBackgroundPhoto = async (element, url) => {
        try {
            await loadImage(url);
            if (element.isConnected) element.style.backgroundImage = cssUrl(url);
        } catch (e) {
            const failure = element.parentElement.querySelector('[data-photo-failed]');
            if (failure) failure.classList.remove('hidden');
        }
    };

    const HINT_INFO = {
        photo: { label: 'fotka', icon: 'image' },
        facts: { label: 'čísla a fakta', icon: 'info' }
    };
    const hintInfo = (step, data) => step === 'visual'
        ? { label: Visuals.info(data.visual).name, icon: Visuals.info(data.visual).icon }
        : HINT_INFO[step];

    const renderFactsList = (facts) => `
        <dl class="grid grid-cols-2 gap-2">
            ${facts.map(fact => `
                <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                    <dt class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(fact.label)}</dt>
                    <dd class="mt-0.5 font-bold leading-snug text-slate-800 dark:text-slate-100">${escapeHtml(fact.value)}</dd>
                </div>`).join('')}
        </dl>`;

    // Rámeček obrazové nápovědy (mapa, časová osa…) – obsah dokreslí visuals.js
    // showLabel: popisek „místo je uprostřed“ jen u nápovědy, v kartě a výsledku stačí název nápovědy
    const renderVisualFrame = (spec, { id, height = 'h-56', newestId = '', showLabel = true, rounded = 'rounded-[1.5rem] shadow-sm' }) => {
        const visual = Visuals.info(spec);
        if (!visual) return '';
        const corner = visual.corner ? visual.corner(spec) : '';
        return `
            <section ${newestId} class="relative ${height} shrink-0 overflow-hidden border ${rounded} ${visual.frame}">
                <div ${id ? `id="${id}"` : 'data-visual'} class="absolute inset-0" role="img" aria-label="${escapeHtml(visual.describe(spec))}"></div>
                <span class="${IMAGE_LABEL}"><i data-lucide="${visual.icon}" class="h-3.5 w-3.5"></i> ${escapeHtml(visual.name.charAt(0).toUpperCase() + visual.name.slice(1))}${showLabel && spec.label ? ` · ${escapeHtml(spec.label.toLowerCase())}` : ''}</span>
                ${corner ? `<span class="absolute bottom-3 right-3 rounded-lg bg-black/45 px-2 py-1 text-[11px] font-bold text-white">${escapeHtml(corner)}</span>` : ''}
            </section>`;
    };

    const renderHintCard = (step, data, isNewest) => {
        const newestId = isNewest ? 'id="newest-hint"' : '';
        if (step === 'photo') {
            return `
                <section ${newestId} class="relative h-60 shrink-0 overflow-hidden rounded-[1.5rem] bg-slate-200 shadow-sm dark:bg-slate-800">
                    <div class="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-600"><i data-lucide="image" class="h-10 w-10"></i></div>
                    <p data-photo-failed class="hidden absolute inset-x-0 top-1/2 mt-8 text-center text-sm text-slate-500">Fotku se nepodařilo načíst</p>
                    <div id="hint-photo" class="absolute inset-0 bg-cover bg-center" aria-hidden="true"></div>
                    <span class="${IMAGE_LABEL}"><i data-lucide="image" class="h-3.5 w-3.5"></i> Fotka</span>
                </section>`;
        }
        if (step === 'visual') return renderVisualFrame(data.visual, { id: 'hint-visual', newestId });
        return `
            <section ${newestId} class="${CARD} p-5">
                <h3 class="${CARD_TITLE} mb-4"><i data-lucide="info" class="w-4 h-4 text-emerald-500"></i> Čísla a fakta</h3>
                ${renderFactsList(data.facts)}
            </section>`;
    };

    const renderAnswerInput = (data) => {
        if (round.variant === 'typed') {
            return `
                <form id="answer-form" class="flex gap-2" autocomplete="off">
                    <label for="answer-input" class="sr-only">Odpověď</label>
                    <input id="answer-input" name="answer" type="text" enterkeyhint="send" placeholder="${escapeHtml(data.question.placeholder)}" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    <button type="submit" aria-label="Odeslat odpověď" class="flex items-center justify-center rounded-xl bg-emerald-600 px-4 text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95">
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>
                </form>`;
        }
        const choicesHtml = data.question.choices.map((choice, index) => `
            <button type="button" data-action="choice" data-index="${index}" class="min-h-[3.25rem] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold leading-tight text-slate-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/40">
                ${escapeHtml(choice.label)}
            </button>
        `).join('');
        return `<div class="grid grid-cols-2 gap-2">${choicesHtml}</div>`;
    };

    const renderQuestion = (keepScroll) => {
        const data = current;
        const topic = TOPIC_BY_ID[data.topic];
        const level = round.hintLevel;
        const levelCount = getLevelCount(data);
        const typed = round.variant === 'typed';
        const category = categoryOf(topic, data.category);
        // Popis je vidět hned, nápovědy se přidávají pod něj
        const unlocked = data.hints.slice(0, level - 1);
        const nextHint = data.hints[level - 1];
        const next = nextHint ? hintInfo(nextHint, data) : null;

        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-5 pb-6 dark:bg-slate-900">
                <div class="text-center">
                    <h2 class="mb-3 text-2xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(data.question.title)}</h2>
                    <span class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm ${styleOf(topic).solid}">
                        <i data-lucide="${category.icon}" class="h-3.5 w-3.5"></i> ${escapeHtml(data.typeLabel)}
                    </span>
                </div>

                <section class="${CARD} p-5">
                    <div class="mb-4 flex items-center justify-between">
                        <h3 class="${CARD_TITLE}"><i data-lucide="book-open" class="w-4 h-4 text-emerald-500"></i> Popis</h3>
                        <span class="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" title="Použité nápovědy">Nápověda ${level}/${levelCount}</span>
                    </div>
                    ${data.question.showName ? `
                        <div class="${HINT_CHIP}">
                            <i data-lucide="tag" class="w-4 h-4 text-sky-500"></i>
                            <span class="font-medium">Název:</span> <b class="text-slate-800 dark:text-slate-100">${escapeHtml(data.name)}</b>
                        </div>
                    ` : ''}
                    ${data.questionText ? `
                        <p class="text-slate-700 dark:text-slate-200 leading-relaxed font-medium text-[16px] italic border-l-4 border-emerald-200 dark:border-emerald-700 pl-4 py-1">„${escapeHtml(data.questionText)}“</p>
                    ` : `
                        <p class="text-sm text-slate-500 dark:text-slate-400">Popis se teď nepodařilo načíst z Wikipedie – pomůžou nápovědy níž.</p>
                    `}
                </section>

                ${unlocked.map((step, index) => renderHintCard(step, data, keepScroll && index === unlocked.length - 1)).join('')}

                ${next ? `
                    <button type="button" data-action="hint" class="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 px-4 py-3 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 active:scale-95 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30">
                        <i data-lucide="${next.icon}" class="w-4 h-4"></i> Nápověda: ${escapeHtml(next.label)} · pak za ${formatPoints(pointsFor(level + 1, levelCount, typed))}
                    </button>
                ` : ''}

                <section class="${CARD} p-5">
                    <div class="mb-2 flex items-center justify-between gap-2">
                        <h3 class="${CARD_TITLE}"><i data-lucide="target" class="w-4 h-4 text-emerald-500"></i> Tvoje odpověď</h3>
                        <button type="button" data-action="settings" class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-slate-700 dark:hover:text-emerald-300">
                            <i data-lucide="${VARIANTS[round.variant].icon}" class="h-3.5 w-3.5"></i> ${typed ? 'Psaní' : 'Možnosti'}
                        </button>
                    </div>
                    <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">Teď za ni získáš <b class="text-slate-700 dark:text-slate-200">${formatPoints(pointsFor(level, levelCount, typed))}</b>.</p>
                    ${renderAnswerInput(data)}
                </section>

                <button type="button" data-action="give-up" class="mx-auto flex items-center gap-2 py-2 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                    <i data-lucide="eye" class="w-4 h-4"></i> Nevím, ukázat odpověď
                </button>

                <!-- Bezpečnostní mezera pro spodní okraj displeje -->
                <div class="h-12 w-full shrink-0"></div>
            </div>
        `;

        renderIcons(appContent);
        const photo = document.getElementById('hint-photo');
        if (photo) setBackgroundPhoto(photo, data.photoUrl);
        const visual = document.getElementById('hint-visual');
        if (visual) Visuals.render(visual, data.visual, visualDeps);
        const newestHint = document.getElementById('newest-hint');
        if (newestHint) newestHint.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        else if (!keepScroll) appContent.scrollTo(0, 0);
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
                <div data-card-photo class="relative ${compact ? 'h-44' : 'h-56'} shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
                    <div data-photo class="absolute inset-0 bg-cover bg-center" aria-hidden="true"></div>
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
                        <i data-lucide="${topic.subtitleIcon || 'navigation'}" class="h-4 w-4 shrink-0 text-emerald-500"></i> ${escapeHtml(topic.subtitle(item, ctx))}
                    </p>
                </div>
                <p data-card-text class="text-[15px] leading-relaxed text-slate-400">Načítám popis…</p>
                ${visual && Visuals.info(visual) ? renderVisualFrame(visual, { height: compact ? 'h-40' : 'h-52', showLabel: false, rounded: 'rounded-2xl' }) : ''}
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
            loadImage(photoOf(item, photoWidth))
                .then(url => { if (photo.isConnected) photo.style.backgroundImage = cssUrl(url); })
                .catch(() => { const box = root.querySelector('[data-card-photo]'); if (box) box.remove(); });
        }
        const visualBox = root.querySelector('[data-visual]');
        if (visualBox) Visuals.render(visualBox, ctx.topic.visual(item, ctx, 'card'), visualDeps);
        const text = await fetchItemText(item);
        const target = root.querySelector('[data-card-text]');
        if (!target || !target.isConnected) return;
        target.textContent = text.description || 'Popis se teď nepodařilo načíst – víc najdeš na Wikipedii.';
        target.classList.replace('text-slate-400', 'text-slate-700');
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
                <button type="button" data-close aria-label="Zavřít" class="absolute right-3 top-3 z-10 rounded-full bg-slate-900/60 p-2 text-white backdrop-blur-sm hover:bg-slate-900/80">
                    <i data-lucide="x" class="h-5 w-5"></i>
                </button>
                ${renderItemCard(item, ctx, { titleId: 'place-info-title', compact: true })}
            </div>`;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) closePlaceInfo();
        });
        document.body.appendChild(overlay);
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
        return !ctx || ctx.byId.has(ref.id);
    };
    // „Kdo je Richard II.?“ u osob, jinak „Co je …?“ (kategorie to říká v ask)
    const askAbout = (ref) => {
        const ctx = loadedTopics.get(ref.topic);
        const item = ctx && ctx.byId.get(ref.id);
        return (item && categoryOf(ctx.topic, item.c).ask) || 'Co je';
    };

    const renderResultBanner = (data) => {
        const levels = `${round.hintLevel}/${getLevelCount(data)}`;
        if (round.correct) {
            return `
                <div class="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/30">
                    <i data-lucide="circle-check" class="h-9 w-9 shrink-0 text-emerald-600 dark:text-emerald-400"></i>
                    <div>
                        <p class="font-black text-emerald-800 dark:text-emerald-200">Správně! +${formatPoints(round.points)}</p>
                        <p class="text-sm text-emerald-700/80 dark:text-emerald-300/80">${round.typed ? 'Napsaná odpověď' : 'Výběr z možností'} · nápověda ${levels}</p>
                    </div>
                </div>`;
        }
        return `
            <div class="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/30">
                <i data-lucide="circle-x" class="h-9 w-9 shrink-0 text-rose-600 dark:text-rose-400"></i>
                <div>
                    <p class="font-black text-rose-800 dark:text-rose-200">${round.gaveUp ? 'Tentokrát bez odpovědi' : 'Bohužel, to není ono'}</p>
                    <p class="text-sm text-rose-700/80 dark:text-rose-300/80">${round.answer ? `Tvoje odpověď: ${escapeHtml(round.answer)} · ` : ''}Správně: ${escapeHtml(data.question.answerLabel)}</p>
                    ${round.answerRef ? `
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(round.answerRef.topic)}" data-id="${escapeHtml(round.answerRef.id)}" class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900">
                            <i data-lucide="info" class="h-3.5 w-3.5"></i> ${askAbout(round.answerRef)} ${escapeHtml(round.answer)}?
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
            <section class="${CARD} p-5">
                <h3 class="${CARD_TITLE} mb-3"><i data-lucide="graduation-cap" class="w-4 h-4 text-emerald-500"></i> ${answered ? 'A ostatní možnosti?' : 'Co byly ostatní možnosti?'}</h3>
                <div class="flex flex-wrap gap-2">
                    ${others.map(choice => `
                        <button type="button" data-action="item-info" data-topic="${escapeHtml(choice.topic)}" data-id="${escapeHtml(choice.id)}" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:border-emerald-500">
                            <i data-lucide="info" class="h-4 w-4 text-emerald-600 dark:text-emerald-400"></i> ${escapeHtml(choice.label)}
                        </button>`).join('')}
                </div>
            </section>`;
    };

    const renderStatsCard = (data) => {
        const stats = loadStats();
        if (mode === 'daily' && data.dailyDate) {
            const results = Object.values(stats.daily[data.topic] || {});
            const wins = results.filter(result => result.correct).length;
            return `
                <section class="${CARD} flex items-center gap-3 p-4">
                    <div class="grid flex-1 grid-cols-3 text-center">
                        <div><p class="text-2xl font-black text-slate-800 dark:text-slate-100">${computeStreak(stats.daily[data.topic] || {}, getDayKey())}</p><p class="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"><i data-lucide="flame" class="h-3 w-3 text-orange-500"></i>Série</p></div>
                        <div><p class="text-2xl font-black text-slate-800 dark:text-slate-100">${results.length}</p><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Odehráno</p></div>
                        <div><p class="text-2xl font-black text-slate-800 dark:text-slate-100">${wins}</p><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uhodnuto</p></div>
                    </div>
                    <button type="button" data-action="share" class="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95">
                        <i data-lucide="share-2" class="h-4 w-4"></i> Sdílet
                    </button>
                </section>`;
        }
        return `
            <section class="${CARD} flex items-center gap-3 p-4">
                <i data-lucide="trophy" class="h-8 w-8 shrink-0 text-amber-500"></i>
                <p class="text-sm text-slate-600 dark:text-slate-300">Trénink: <b class="text-slate-800 dark:text-slate-100">${formatPoints(stats.practice.points)}</b> · správně ${stats.practice.correct} z ${stats.practice.played}</p>
            </section>`;
    };

    const renderMapCard = () => `
        <section class="${CARD} overflow-hidden">
            <div class="relative h-56 bg-slate-200 dark:bg-slate-700">
                <div id="map-tiles" class="absolute inset-0 overflow-hidden" aria-label="Mapa s polohou" role="img"></div>
                <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md">
                    <i data-lucide="map-pin" class="h-10 w-10 fill-rose-500 stroke-white"></i>
                </div>
                <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md dark:border-slate-600 dark:bg-slate-800/95">
                    <button type="button" data-action="zoom-in" aria-label="Přiblížit mapu" class="p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="plus" class="h-4 w-4"></i></button>
                    <button type="button" data-action="zoom-out" aria-label="Oddálit mapu" class="border-t border-slate-200 p-2 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><i data-lucide="minus" class="h-4 w-4"></i></button>
                </div>
            </div>
            <div class="flex items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" class="hover:underline">© přispěvatelé OpenStreetMap</a>
                <a id="map-open-link" href="#" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 font-bold text-emerald-700 hover:underline dark:text-emerald-400">Otevřít mapu <i data-lucide="external-link" class="h-3 w-3"></i></a>
            </div>
        </section>`;

    const renderMap = () => {
        const container = document.getElementById('map-tiles');
        if (!container || !current || !current.coords) return;
        const { lat, lon } = current.coords;
        renderTiles(container, lat, lon, mapZoom, OSM_TILES);
        document.getElementById('map-open-link').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${Math.min(mapZoom + 4, 18)}/${lat}/${lon}`;
    };

    // Nahoře ve výsledku fotka, bez ní u míst satelitní snímek okolí, jinak jen barevné pozadí tématu
    const showResultVisual = async () => {
        const element = document.getElementById('result-visual');
        if (!element) return;
        const { photoUrl, coords } = current;
        if (photoUrl) {
            try {
                await loadImage(photoUrl);
                if (element.isConnected) element.style.backgroundImage = cssUrl(photoUrl);
                return;
            } catch (e) {}
        }
        if (element.isConnected && coords) renderTiles(element, coords.lat, coords.lon, RESULT_SATELLITE_ZOOM, SATELLITE_TILES);
    };

    const collectionLabel = (ctx, collectionId) => {
        if (!collectionId) return `Celé téma`;
        if (collectionId.startsWith('c:')) return categoryOf(ctx.topic, collectionId.slice(2)).label;
        const collection = ctx.collections.find(c => c.id === collectionId);
        return collection ? collection.label : collectionId;
    };

    // Text hlavního tlačítka pod výsledkem
    const getNextLabel = () => {
        if (mode === 'daily') return 'Zpět na dnešní otázky';
        if (pool.kind === 'mistakes') {
            const remaining = loadMistakes().length;
            return remaining ? `Další chyba (zbývá ${remaining})` : 'Hotovo – zpět do učení';
        }
        return pool.kind === 'collection' ? 'Další z okruhu' : 'Další otázka';
    };

    const renderResult = () => {
        const data = current;
        const topic = TOPIC_BY_ID[data.topic];
        const category = categoryOf(topic, data.category);
        // Rozehraná otázka uložená starší verzí výsledkovou nápovědu nemá
        const resultVisual = data.resultVisual || data.visual;

        const funFactsHtml = data.funFacts.map((fact, i) => `
            <div class="flex items-start gap-4">
                <div class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 rounded-lg w-8 h-8 flex items-center justify-center flex-shrink-0 text-sm font-black border border-emerald-200 dark:border-emerald-800 mt-0.5">
                    ${i + 1}
                </div>
                <p class="text-slate-700 dark:text-slate-200 text-[15px] leading-relaxed pt-1">${escapeHtml(fact)}</p>
            </div>
        `).join('');

        const originBadge = data.isCzech
            ? `<span class="text-[10px] font-bold text-white bg-rose-600/90 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm border border-rose-500"><i data-lucide="map-pin" class="w-3 h-3"></i>Česká stopa</span>`
            : `<span class="text-[10px] font-bold text-white bg-slate-800/60 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm border border-slate-600"><i data-lucide="${data.known ? 'star' : 'compass'}" class="w-3 h-3 text-sky-300"></i>${data.known ? 'Známé' : 'Méně známé'}</span>`;

        appContent.innerHTML = `
            <div class="fade-in flex flex-col w-full min-h-full pb-6 bg-slate-50 dark:bg-slate-900">
                <div class="relative h-[42vh] w-full shrink-0 bg-slate-900">
                    <div id="result-visual" class="absolute inset-0 overflow-hidden bg-cover bg-center opacity-90" aria-hidden="true">
                        <div class="absolute inset-0 flex items-center justify-center text-white/10"><i data-lucide="${topic.icon}" class="h-40 w-40"></i></div>
                    </div>
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent"></div>

                    <div class="absolute bottom-0 left-0 p-6 w-full text-white">
                        <div class="flex flex-wrap items-center gap-2 mb-3">
                            <span class="text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-md border ${styleOf(topic).solid}">
                                <i data-lucide="${category.icon}" class="w-3.5 h-3.5"></i>
                                ${escapeHtml(data.typeLabel)}
                            </span>
                            ${originBadge}
                        </div>
                        <h1 class="text-4xl font-black tracking-tight leading-tight text-white drop-shadow-xl mb-3">${escapeHtml(data.name)}</h1>

                        <div class="flex items-center gap-2 text-sm font-semibold text-emerald-50 bg-slate-800/60 backdrop-blur-md w-fit px-3.5 py-2 rounded-xl border border-slate-600 shadow-lg">
                            <i data-lucide="${topic.subtitleIcon || 'navigation'}" class="w-4 h-4 text-emerald-400"></i>
                            ${escapeHtml(data.subtitle)}
                        </div>
                    </div>
                </div>

                <div class="p-6 flex flex-col gap-6 flex-grow bg-slate-50 dark:bg-slate-900 rounded-t-[2.5rem] -mt-6 z-10 relative">
                    ${renderResultBanner(data)}
                    ${renderOtherChoices(data)}
                    ${renderStatsCard(data)}
                    ${data.coords ? renderMapCard() : Visuals.info(resultVisual) ? renderVisualFrame(resultVisual, { id: 'result-visual-hint', height: 'h-52', showLabel: false }) : ''}

                    ${data.description ? `<div class="text-slate-700 dark:text-slate-200 leading-relaxed text-[16px] font-medium">${escapeHtml(data.description)}</div>` : ''}

                    ${data.resultFacts.length ? `
                        <section class="${CARD} p-5">
                            <h3 class="${CARD_TITLE} mb-4"><i data-lucide="info" class="w-4 h-4 text-emerald-500"></i> Čísla a fakta</h3>
                            ${renderFactsList(data.resultFacts)}
                        </section>
                    ` : ''}

                    ${data.funFacts.length ? `
                        <section class="${CARD} p-6">
                            <h3 class="${CARD_TITLE} mb-6"><i data-lucide="compass" class="w-4 h-4 text-emerald-500"></i> Zajímavosti</h3>
                            <div class="space-y-5">${funFactsHtml}</div>
                        </section>
                    ` : ''}

                    <div class="flex flex-col gap-3">
                        <button type="button" data-action="next" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-[1.2rem] font-bold text-lg shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                            ${escapeHtml(getNextLabel())} <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                        <a href="${wikipediaUrl(data.title)}" target="_blank" rel="noopener noreferrer" class="w-full bg-slate-800 active:bg-slate-700 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white py-4 rounded-[1.2rem] text-center font-bold text-[16px] shadow-xl flex items-center justify-center gap-2 transition-colors">
                            <i data-lucide="book-open" class="w-5 h-5 text-slate-300"></i>
                            Číst na Wikipedii
                        </a>
                    </div>

                    <!-- Bezpečnostní mezera pro spodní okraj displeje -->
                    <div class="h-12 w-full shrink-0"></div>
                </div>
            </div>
        `;

        renderIcons(appContent);
        showResultVisual();
        renderMap();
        const resultHint = document.getElementById('result-visual-hint');
        if (resultHint) Visuals.render(resultHint, resultVisual, visualDeps);
        appContent.scrollTo(0, 0);
    };

    // --- Průběh hry ---

    const renderRound = ({ keepScroll = false } = {}) => {
        if (!current || !round) return;
        screen = 'round';
        closePlaceInfo();
        persistState();
        if (round.answered) renderResult();
        else renderQuestion(keepScroll);
        updateControlsUI();
    };

    const persistState = () => {
        if (!current) return;
        writeJson(KEYS.session, { version: STATE_VERSION, data: current, round, mode, pool, timestamp: Date.now() });
        if (mode === 'daily' && current.dailyDate) {
            const daily = readJson(KEYS.daily) || {};
            daily[current.topic] = { date: current.dailyDate, data: current, round };
            writeJson(KEYS.daily, daily);
        }
    };

    const recordResult = () => {
        const stats = loadStats();
        if (mode === 'daily' && current.dailyDate) {
            const topicDaily = stats.daily[current.topic] || {};
            if (!topicDaily[current.dailyDate]) {
                topicDaily[current.dailyDate] = {
                    correct: round.correct, points: round.points, hintLevel: round.hintLevel, levelCount: getLevelCount(current),
                    typed: round.typed, category: current.category
                };
            }
            stats.daily[current.topic] = topicDaily;
        } else {
            stats.practice.played += 1;
            stats.practice.correct += round.correct ? 1 : 0;
            stats.practice.points += round.points;
        }
        writeJson(KEYS.stats, stats);
        // Neuhodnutá položka jde do seznamu chyb v učení, správně uhodnutá z něj zmizí a počítá se do postupu v okruzích
        writeJson(KEYS.mistakes, updateMistakes(loadMistakes(), `${current.topic}:${current.id}`, round.correct));
        if (round.correct) {
            const learned = loadLearned();
            const ids = new Set(learned[current.topic] || []);
            ids.add(current.id);
            learned[current.topic] = [...ids];
            writeJson(KEYS.learned, learned);
        }
    };

    // answerRef: položka (nebo stát) ze špatné odpovědi – výsledek k ní nabídne okno s popisem
    const submitAnswer = ({ correct, typed, answer, answerRef = null, gaveUp = false }) => {
        if (!round || round.answered) return;
        const points = correct ? pointsFor(round.hintLevel, getLevelCount(current), typed) : 0;
        const ref = !correct && isKnownRef(answerRef) ? answerRef : null;
        Object.assign(round, { answered: true, correct, typed, answer, answerRef: ref, gaveUp, points });
        mapZoom = DEFAULT_MAP_ZOOM;
        recordResult();
        renderRound();
    };

    const showNextHint = () => {
        if (!round || round.answered || round.hintLevel >= getLevelCount(current)) return;
        round.hintLevel += 1;
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

    const restoreSession = () => {
        const session = readJson(KEYS.session);
        if (!session || session.version !== STATE_VERSION || !session.data || !session.round || !TOPIC_BY_ID[session.data.topic]) return false;
        const isFresh = Date.now() - session.timestamp < SESSION_MAX_AGE;
        // Dnešní otázka z uložené relace platí jen do půlnoci
        const isCurrent = session.mode !== 'daily' || session.data.dailyDate === getDayKey();
        if (!isFresh || !isCurrent) return false;
        current = session.data;
        round = session.round;
        mode = session.mode;
        pool = session.pool || { kind: 'mix' };
        renderRound();
        loadTopic(current.topic).catch(() => {});
        return true;
    };

    // Průběh načtení otázky: vybrat položku, dotáhnout popis a fotku, zobrazit
    const runRound = async (pick) => {
        if (isLoading) return;
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        isLoading = true;
        screen = 'round';
        closePlaceInfo();
        updateControlsUI();
        renderLoading();
        try {
            const { item, ctx, rng, dailyDate } = await pick();
            const data = await createRoundData(item, ctx, rng);
            current = dailyDate ? { ...data, dailyDate } : data;
            round = createRound();
            isLoading = false;
            renderRound();
            // Obrysy států pro slepou mapu stáhneme dopředu, ať je nápověda hned po ruce
            if (data.visual && data.visual.type === 'map') loadWorld().catch(() => {});
        } catch (error) {
            isLoading = false;
            renderError(error);
        }
    };

    const dailySeed = (topic, dayKey) => `${topic.dailySeed || `mudrlant-${topic.id}-`}${dayKey}`;

    // Dnešní otázka tématu: pro všechny stejná, ze známých položek; odehraná zůstane uložená
    const startDaily = (topicId) => {
        const today = getDayKey();
        const saved = (readJson(KEYS.daily) || {})[topicId];
        if (saved && saved.date === today && saved.data) {
            mode = 'daily';
            current = saved.data;
            round = saved.round || createRound();
            renderRound();
            return;
        }
        mode = 'daily';
        runRound(async () => {
            const ctx = await loadTopic(topicId);
            const rng = createSeededRandom(dailySeed(ctx.topic, today));
            const item = pickItem(ctx.items.filter(candidate => candidate.k === 1), rng, [], ctx.topic.categories.map(c => c.key));
            return { item, ctx, rng, dailyDate: today };
        });
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

    // Trénink: z vybraných témat, z okruhu, nebo z chyb
    const startPractice = (nextPool = pool) => {
        pool = nextPool;
        mode = 'practice';
        runRound(async () => {
            const history = readJson(KEYS.history) || [];
            let ctx;
            let item;
            if (pool.kind === 'mistakes') {
                const keys = loadMistakes();
                if (keys.length) {
                    const fresh = keys.filter(key => !history.includes(key.split(':')[1]));
                    const [topicId, id] = pickRandom(fresh.length ? fresh : keys, Math.random).split(':');
                    ctx = await loadTopic(topicId);
                    item = ctx.byId.get(id);
                }
                if (!item) {
                    showToast('Všechny chyby máš zopakované');
                    pool = { kind: 'mix' };
                }
            }
            if (pool.kind === 'collection') {
                ctx = await loadTopic(pool.topic);
                item = pickItem(collectionItems(ctx, pool.collection), Math.random, history, ctx.topic.categories.map(c => c.key));
            }
            if (pool.kind === 'mix') {
                ctx = await loadTopic(pickRandom(settings.topics, Math.random));
                const items = filterItems(ctx.items, { tier: settings.tier });
                item = pickItem(items.length ? items : ctx.items, Math.random, history, ctx.topic.categories.map(c => c.key));
            }
            rememberPlayed(item);
            return { item, ctx, rng: Math.random };
        });
    };

    // Tlačítko tréninku: vrátí se k rozehrané otázce z tréninku, jinak nová otázka ze všech vybraných témat
    const showPractice = () => {
        if (current && mode === 'practice' && round && !round.answered && screen !== 'round') {
            renderRound();
            return;
        }
        startPractice({ kind: 'mix' });
    };

    const continueAfterResult = () => {
        if (mode === 'daily') {
            renderHome();
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
                <button type="button" data-action="retry" class="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold active:scale-95 shadow-lg">Zkusit znovu</button>
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

    const LEARN_ROW = 'flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700';

    const progressBar = (done, total) => `
        <span class="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
            <span class="block h-full w-0 rounded-full bg-emerald-500" data-progress="${total ? Math.round(done / total * 100) : 0}"></span>
        </span>`;
    // Šířku pruhů nastavíme přes CSSOM (inline styly zakazuje CSP)
    const applyProgress = (root) => root.querySelectorAll('[data-progress]').forEach(bar => { bar.style.width = `${bar.dataset.progress}%`; });

    const learnedCount = (topicId, items) => {
        const learned = new Set(loadLearned()[topicId] || []);
        return items.filter(item => learned.has(item.q)).length;
    };

    const renderLearnHome = () => {
        const mistakes = loadMistakes();
        const cards = TOPICS.map(topic => `
            <button type="button" data-action="learn-topic" data-topic="${topic.id}" class="flex flex-col items-start gap-2 rounded-[1.5rem] border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700">
                <span class="rounded-2xl p-2.5 ${styleOf(topic).soft}"><i data-lucide="${topic.icon}" class="h-6 w-6"></i></span>
                <span class="text-base font-black text-slate-800 dark:text-slate-100">${escapeHtml(topic.title)}</span>
            </button>`).join('');
        return `
            <div class="text-center">
                <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">Učení</h2>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Vyber téma a okruh: projdi si ho popořadě, pak se z něj nech vyzkoušet. Bez bodů a bez spěchu.</p>
            </div>
            <div class="grid grid-cols-2 gap-3">${cards}</div>
            <button type="button" data-action="learn-mistakes" class="${LEARN_ROW}">
                <span class="shrink-0 rounded-xl bg-rose-100 p-2 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"><i data-lucide="repeat" class="h-5 w-5"></i></span>
                <span class="min-w-0 flex-1">
                    <span class="block font-bold text-slate-800 dark:text-slate-100">Moje chyby${mistakes.length ? ` (${mistakes.length})` : ''}</span>
                    <span class="block text-xs text-slate-500 dark:text-slate-400">Co ti v kvízu nevyšlo – ze všech témat</span>
                </span>
                <i data-lucide="chevron-right" class="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600"></i>
            </button>`;
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
                        <span class="shrink-0 text-xs font-semibold text-slate-400">${done ? `${done} / ` : ''}${items.length}</span>
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
                <span class="rounded-2xl p-3 ${styleOf(topic).soft}"><i data-lucide="${topic.icon}" class="h-7 w-7"></i></span>
                <div>
                    <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">${escapeHtml(topic.title)}</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${settings.tier === 'all' ? 'Celé téma i se méně známými' : 'Celé téma a kategorie jen se známými'} · <button type="button" data-action="settings" class="font-bold text-emerald-700 underline underline-offset-2 dark:text-emerald-400">změnit</button></p>
                </div>
            </div>
            ${ctx.collections.length ? `
                <h3 class="${CARD_TITLE} mt-1">Okruhy</h3>
                <div class="flex flex-col gap-2">${ctx.collections.map(collection => collectionRow(ctx, collection.id, collection.label, collection.text, 'layers')).join('')}</div>
            ` : ''}
            <h3 class="${CARD_TITLE} mt-1">Kategorie</h3>
            <div class="flex flex-col gap-2">
                ${collectionRow(ctx, null, 'Celé téma', '', topic.icon)}
                ${topic.categories.map(category => collectionRow(ctx, `c:${category.key}`, category.label, '', category.icon)).join('')}
            </div>`;
    };

    const renderLearnCollection = (ctx) => {
        const items = collectionItems(ctx, learn.collection);
        const done = learnedCount(ctx.topic.id, items);
        const collection = ctx.collections.find(c => c.id === learn.collection);
        return `
            <button type="button" data-action="learn-topic" data-topic="${ctx.topic.id}" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(ctx.topic.title)}</button>
            <section class="${CARD} p-5">
                <h2 class="text-2xl font-black leading-tight text-slate-800 dark:text-slate-50">${escapeHtml(collectionLabel(ctx, learn.collection))}</h2>
                ${collection && collection.text ? `<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${escapeHtml(collection.text)}</p>` : ''}
                <p class="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">${items.length} položek · uhodnuto ${done}</p>
                ${progressBar(done, items.length)}
            </section>
            <button type="button" data-action="learn-browse" class="flex w-full items-center gap-3 rounded-[1.5rem] bg-violet-600 p-4 text-left text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98]">
                <i data-lucide="book-open" class="h-7 w-7 shrink-0"></i>
                <span><span class="block text-lg font-black">Prohlížet</span><span class="block text-sm text-violet-100">${learn.collection ? 'Popořadě, s fotkou, mapou a fakty' : 'Náhodně, s fotkou, mapou a fakty'}</span></span>
            </button>
            <button type="button" data-action="learn-practice" class="flex w-full items-center gap-3 rounded-[1.5rem] bg-emerald-600 p-4 text-left text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-[0.98]">
                <i data-lucide="target" class="h-7 w-7 shrink-0"></i>
                <span><span class="block text-lg font-black">Procvičit</span><span class="block text-sm text-emerald-100">Otázky jen z tohoto okruhu</span></span>
            </button>`;
    };

    const renderLearnAtlas = (ctx) => {
        const item = ctx.byId.get(learn.order[learn.index]);
        if (!item) return renderLearnCollection(ctx);
        return `
            <div class="flex items-center justify-between gap-2">
                <button type="button" data-action="learn-collection" data-collection="${escapeHtml(learn.collection || '')}" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> ${escapeHtml(collectionLabel(ctx, learn.collection))}</button>
                <span class="text-sm font-bold text-slate-400">${learn.index + 1} / ${learn.order.length}</span>
            </div>
            <article id="learn-card" class="${CARD} shrink-0 overflow-hidden">
                ${renderItemCard(item, ctx, { titleId: 'learn-title', compact: false })}
            </article>
            <div class="grid grid-cols-2 gap-3">
                <button type="button" data-action="learn-prev" ${learn.index <= 0 ? 'disabled' : ''} class="flex items-center justify-center gap-1.5 rounded-[1.2rem] border border-slate-200 bg-white py-3.5 font-bold text-slate-700 shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <i data-lucide="chevron-left" class="h-5 w-5"></i> Předchozí
                </button>
                <button type="button" data-action="learn-next" ${learn.index >= learn.order.length - 1 ? 'disabled' : ''} class="flex items-center justify-center gap-1.5 rounded-[1.2rem] bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:active:scale-100">
                    Další <i data-lucide="chevron-right" class="h-5 w-5"></i>
                </button>
            </div>`;
    };

    const renderLearnMistakes = (contexts) => {
        const mistakes = loadMistakes()
            .map(key => {
                const [topicId, id] = key.split(':');
                const ctx = contexts.get(topicId);
                const item = ctx && ctx.byId.get(id);
                return item ? { ctx, item } : null;
            })
            .filter(Boolean);
        const back = `<button type="button" data-action="learn-back" class="${BACK_LINK}"><i data-lucide="chevron-left" class="h-4 w-4"></i> Učení</button>`;
        if (!mistakes.length) {
            return `${back}
                <section class="${CARD} flex flex-col items-center gap-2 p-8 text-center">
                    <i data-lucide="circle-check" class="h-12 w-12 text-emerald-500"></i>
                    <h3 class="text-lg font-black text-slate-800 dark:text-slate-100">Zatím tu nic není</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Co v kvízu neuhodneš, se sem uloží. Tady si to pak můžeš prohlédnout a procvičit.</p>
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
                    <i data-lucide="info" class="h-5 w-5 shrink-0 text-slate-400"></i>
                </button>
            </li>`).join('');
        return `${back}
            <h2 class="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-50">Moje chyby</h2>
            <button type="button" data-action="practice-mistakes" class="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-emerald-600 py-4 text-lg font-bold text-white shadow-xl shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-95">
                <i data-lucide="repeat" class="h-5 w-5"></i> Procvičit chyby (${mistakes.length})
            </button>
            <p class="-mt-2 text-center text-xs text-slate-500 dark:text-slate-400">Co pak uhodneš, ze seznamu zmizí. Klepnutím si to prohlédneš.</p>
            <ul class="flex flex-col gap-2">${rows}</ul>
            <button type="button" data-action="clear-mistakes" class="mx-auto flex items-center gap-1.5 py-2 text-sm font-semibold text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                <i data-lucide="trash-2" class="h-4 w-4"></i> Vymazat seznam
            </button>`;
    };

    const renderLearn = async () => {
        screen = 'learn';
        closePlaceInfo();
        updateControlsUI();
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
            renderError(error);
            return;
        }
        if (screen !== 'learn') return;
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-5 pb-6 dark:bg-slate-900">
                ${body}
                <!-- Bezpečnostní mezera pro spodní okraj displeje -->
                <div class="h-12 w-full shrink-0"></div>
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
        learn.view = view;
        learn.topic = topicId;
        renderLearn().then(() => appContent.scrollTo(0, 0));
    };

    // Prohlížení okruhu: zvláštní okruhy a kategorie popořadě (podle výšky, roku, abecedy…), celé téma náhodně
    const browseCollection = async () => {
        const ctx = await loadTopic(learn.topic);
        const items = collectionItems(ctx, learn.collection);
        let ordered;
        if (!learn.collection) ordered = [...items].sort(() => Math.random() - 0.5);
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

    // Všechny akce přes delegaci událostí – stránka nepotřebuje inline JavaScript (kvůli CSP)
    const ACTIONS = {
        daily: (button) => { lastDailyTopic = button.dataset.topic; startDaily(button.dataset.topic); },
        'practice-mix': () => startPractice({ kind: 'mix' }),
        'open-learn': () => openLearn('home'),
        hint: () => showNextHint(),
        'give-up': () => submitAnswer({ correct: false, typed: false, answer: null, gaveUp: true }),
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
        const correct = isAnswerMatch(answer, current.question.accepted);
        // Napsal hráč jinou položku ze sady (nebo jiný stát)? Pak k ní výsledek nabídne popis
        let answerRef = null;
        const ctx = loadedTopics.get(current.topic);
        const item = ctx && ctx.byId.get(current.id);
        if (!correct && item) {
            answerRef = ctx.topic.findAnswer ? ctx.topic.findAnswer(current.question.type, answer, item, ctx) : null;
            if (!answerRef && current.question.type === 'name') {
                const id = findAnswerItem(answer, item, ctx.items);
                answerRef = id ? { topic: current.topic, id } : null;
            }
        }
        submitAnswer({ correct, typed: true, answer, answerRef });
    });

    // Chyba načtení obrázku (dlaždice mapy) nebublá, zachytíme ji ve fázi capture a obrázek skryjeme
    appContent.addEventListener('error', (event) => {
        if (event.target instanceof HTMLImageElement) event.target.classList.add('invisible');
    }, true);

    // Bez varianty uvítání, jinak rozehraná otázka, jinak domovská obrazovka s dnešními otázkami
    const showStart = () => {
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        if (!restoreSession()) renderHome();
    };

    document.getElementById('btn-home').addEventListener('click', () => renderHome());
    document.getElementById('btn-practice').addEventListener('click', () => showPractice());
    document.getElementById('btn-learn').addEventListener('click', () => openLearn('home'));
    document.getElementById('btn-settings').addEventListener('click', () => openSettings());
    // Escape zavře nejdřív okno s popisem, pak nastavení
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (document.getElementById('place-info')) closePlaceInfo();
        else closeSettings();
    });

    migrateFromGeoQuiz();
    gameVariant = readVariant();
    settings = loadSettings();
    renderIcons(document);
    showStart();

    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('sw.js').catch(error => console.error(error));
    }
})();
