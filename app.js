// Uživatelské rozhraní Geo Kvízu: výběr místa ze sady data/places.json, otázka s nápovědami, výsledek a ukládání stavu
(() => {
    'use strict';

    const {
        CATEGORIES, CONTINENT_NAMES, CZECHIA_QID, SATELLITE_TILES, OSM_TILES,
        escapeHtml, isRealPhoto, commonsPhotoUrl, displayName, formatPoints, getDayKey, formatDayKey, createSeededRandom,
        getCategory, censorName, censorCountry, processWikiText, isAnswerMatch,
        filterPlaces, pickPlace, getCountryNames, getContinent, buildPlaceChoices, buildCountryChoices, canAskForCountry,
        getCountryAliases, getAcceptedAnswers, getHintSteps, pointsFor, buildFacts, getMapSpan, buildBlindMap,
        computeStreak, buildShareText, getTileLayout
    } = window.GeoQuizCore;

    const DAILY_STORAGE_KEY = 'geoQuizDaily19';
    const SESSION_STORAGE_KEY = 'geoSessionState';
    const STATS_STORAGE_KEY = 'geoQuizStats';
    const VARIANT_STORAGE_KEY = 'geoQuizVariant';
    const FILTERS_STORAGE_KEY = 'geoQuizFilters';
    const HISTORY_STORAGE_KEY = 'geoQuizHistory';
    const STATE_VERSION = 7;
    const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
    const HISTORY_SIZE = 150;
    // Jak často se místo „Co je to za místo?“ ptáme „Ve kterém státě to je?“ (jen kde to dává smysl)
    const LOCATION_QUIZ_SHARE = 0.35;
    const REQUEST_TIMEOUT = 12000;
    const PHOTO_TIMEOUT = 8000;
    const DEFAULT_MAP_ZOOM = 5;
    const RESULT_SATELLITE_ZOOM = 5;
    const MIN_MAP_ZOOM = 2;
    const MAX_MAP_ZOOM = 12;
    const WIKI_API = 'https://cs.wikipedia.org/w/api.php?format=json&origin=*';

    const appContent = document.getElementById('app-content');

    let isDailyMode = true;
    let isLoading = false;
    let currentPlace = null;
    let round = null;
    let mapZoom = DEFAULT_MAP_ZOOM;
    // Varianta hry: 'choices' (výběr ze 4 možností) nebo 'typed' (psaní odpovědi za dvojnásobek bodů)
    let gameVariant = null;
    // Co hrát v tréninku: kategorie a jestli jen známá místa ('known'), nebo i méně známá ('all')
    let filters = null;

    class NetworkError extends Error {}

    // localStorage může být zakázaný (soukromé okno), proto vše přes try/catch
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

    const loadStats = () => {
        const saved = readJson(STATS_STORAGE_KEY) || {};
        return { daily: saved.daily || {}, practice: { played: 0, correct: 0, points: 0, ...(saved.practice || {}) } };
    };

    const ALL_CATEGORY_KEYS = CATEGORIES.map(category => category.key);
    const TIERS = {
        known: { title: 'Jen známá místa', text: 'Hlavní města, velké řeky, slavné stavby' },
        all: { title: 'I méně známá', text: 'Těžší – celá sada míst' }
    };
    const loadFilters = () => {
        const saved = readJson(FILTERS_STORAGE_KEY) || {};
        const categories = Array.isArray(saved.categories) ? saved.categories.filter(key => ALL_CATEGORY_KEYS.includes(key)) : [];
        return { categories: categories.length ? categories : ALL_CATEGORY_KEYS, tier: TIERS[saved.tier] ? saved.tier : 'known' };
    };

    const createRound = () => ({ hintLevel: 1, variant: gameVariant || 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false });
    const getLevelCount = (data) => 1 + data.hints.length;

    const VARIANTS = {
        choices: { icon: 'layout-grid', title: 'Výběr ze 4 možností', text: 'Klasický kvíz. Bez nápovědy až 4 body, každá nápověda bod ubere.' },
        typed: { icon: 'keyboard', title: 'Psaní odpovědi', text: 'Těžší varianta za dvojnásobek bodů. Na diakritice, velkých písmenech ani drobném překlepu nezáleží.' }
    };

    // Ikony: zástupné <i data-lucide="…"> nahradíme SVG z icons.js (podmnožina Lucide)
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SVG_ATTRIBUTES = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    const renderIcons = (root = document) => {
        root.querySelectorAll('i[data-lucide]').forEach(placeholder => {
            const iconNode = (window.GEO_ICONS || {})[placeholder.dataset.lucide];
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

    // --- Data hry: sada míst a obrysy států (vlastní soubory, service worker je drží i bez internetu) ---

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
    const memoize = (load) => {
        let promise = null;
        return () => {
            if (!promise) promise = load().catch(error => { promise = null; throw error; });
            return promise;
        };
    };
    const loadDataset = memoize(() => fetchJson('data/places.json'));
    const loadWorld = memoize(() => fetchJson('data/world.json'));

    // Úvod článku z české Wikipedie; bez spojení aspoň krátký popis z Wikidat, ať jde hrát dál
    const fetchPlaceText = async (place) => {
        try {
            const data = await fetchJson(`${WIKI_API}&action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&redirects=1&titles=${encodeURIComponent(place.t)}`, 2);
            const page = Object.values((data.query && data.query.pages) || {})[0];
            if (page && page.extract && page.extract.length > 40) return processWikiText(page.extract);
        } catch (e) {
            console.error(e);
        }
        const shortDescription = place.d ? `${place.d.charAt(0).toUpperCase()}${place.d.slice(1)}.` : '';
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

    const createRoundData = async (place, dataset, rng) => {
        const { countries, places } = dataset;
        const quizType = rng() < LOCATION_QUIZ_SHARE && canAskForCountry(place, countries) ? 'location' : 'name';
        const choices = quizType === 'location'
            ? buildCountryChoices(place.co[0], countries, rng)
            : buildPlaceChoices(place, places, countries, rng);
        const [text, photoUrl] = await Promise.all([
            fetchPlaceText(place),
            probePhoto(isRealPhoto(place.im) && place.ih ? commonsPhotoUrl(place.im, place.ih) : null)
        ]);
        const facts = buildFacts(place, countries, quizType);
        return {
            id: place.q,
            title: place.t,
            name: place.n,
            category: place.c,
            known: place.k === 1,
            // Typ místa nesmí u otázky na stát prozradit odpověď
            typeLabel: place.ty && !(quizType === 'location' && censorCountry(place.ty, getCountryNames(place, countries)[0], getCountryAliases(place.co)).includes('[***]'))
                ? place.ty
                : getCategory(place.c).one,
            lat: place.la,
            lon: place.lo,
            countryIds: place.co || [],
            countryNames: getCountryNames(place, countries),
            continent: getContinent(place, countries),
            isCzech: (place.co || []).includes(CZECHIA_QID),
            quizType,
            choices,
            photoUrl,
            facts,
            resultFacts: buildFacts(place, countries, 'name'),
            hints: getHintSteps({ hasPhoto: Boolean(photoUrl), hasFacts: facts.length > 0 }),
            mapSpan: getMapSpan(place, quizType),
            highlightIso: place.c === 'stat' && countries[place.q] ? countries[place.q].iso : '',
            description: text.description,
            funFacts: text.funFacts
        };
    };

    // --- Varianta hry a nastavení ---

    const readVariant = () => {
        try {
            const variant = localStorage.getItem(VARIANT_STORAGE_KEY);
            return VARIANTS[variant] ? variant : null;
        } catch (e) {
            return null;
        }
    };
    const saveVariant = (variant) => {
        try { localStorage.setItem(VARIANT_STORAGE_KEY, variant); } catch (e) {}
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
        appContent.innerHTML = `
            <div class="fade-in flex min-h-full flex-col justify-center gap-4 p-6">
                <div class="mb-2 text-center">
                    <i data-lucide="globe-2" class="mx-auto mb-3 h-12 w-12 text-emerald-500"></i>
                    <h2 class="text-2xl font-black text-slate-800 dark:text-slate-50">Jak chceš hrát?</h2>
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Variantu i to, co hádat v tréninku, změníš kdykoli v nastavení vpravo nahoře.</p>
                </div>
                <div id="variant-welcome" class="flex flex-col gap-3">${renderVariantCards(null)}</div>
            </div>`;
        renderIcons(appContent);
    };

    const SETTINGS_HEADING = 'text-xs font-black uppercase tracking-widest text-slate-400';
    const TOGGLE_ON = 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
    const TOGGLE_OFF = 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700';

    const renderFilterSettings = (dataset) => {
        const countIn = (key) => dataset ? dataset.places.filter(place => place.c === key && (filters.tier === 'all' || place.k === 1)).length : null;
        const tierButtons = Object.entries(TIERS).map(([key, tier]) => `
            <button type="button" data-tier="${key}" aria-pressed="${filters.tier === key}" class="rounded-2xl border-2 p-3 text-left transition-colors active:scale-[0.98] ${filters.tier === key ? TOGGLE_ON : TOGGLE_OFF}">
                <span class="block text-sm font-black">${tier.title}</span>
                <span class="mt-0.5 block text-xs leading-snug opacity-80">${tier.text}</span>
            </button>`).join('');
        const categoryButtons = CATEGORIES.map(category => {
            const isOn = filters.categories.includes(category.key);
            const count = countIn(category.key);
            return `
                <button type="button" data-category="${category.key}" aria-pressed="${isOn}" class="flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors active:scale-95 ${isOn ? TOGGLE_ON : TOGGLE_OFF}">
                    <i data-lucide="${isOn ? 'check' : category.icon}" class="h-4 w-4"></i> ${category.label}${count === null ? '' : ` <span class="text-xs font-semibold opacity-60">${count}</span>`}
                </button>`;
        }).join('');
        return `
            <h3 class="${SETTINGS_HEADING} mb-1 mt-6">Co hádat v tréninku</h3>
            <p class="mb-3 text-sm text-slate-500 dark:text-slate-400">Dnešní místo je pro všechny stejné – vždy známé místo z kterékoli kategorie.</p>
            <div class="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Známost míst">${tierButtons}</div>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Kategorie míst">${categoryButtons}</div>`;
    };

    const closeSettings = () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.remove();
    };

    const openSettings = async (note = '', focusSelector = null) => {
        // Počty míst v kategoriích ukážeme, jen když už je sada načtená
        const dataset = await loadDataset().catch(() => null);
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
                    <h2 id="settings-title" class="text-lg font-black text-slate-800 dark:text-slate-100">Nastavení hry</h2>
                    <button type="button" data-close aria-label="Zavřít" class="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                <h3 class="${SETTINGS_HEADING} mb-3">Varianta hry</h3>
                <div class="flex flex-col gap-3">${renderVariantCards(gameVariant)}</div>
                ${renderFilterSettings(dataset)}
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
            if (tierButton) changeFilters({ tier: tierButton.dataset.tier }, `[data-tier="${tierButton.dataset.tier}"]`);
            const categoryButton = event.target.closest('[data-category]');
            if (categoryButton) toggleCategory(categoryButton.dataset.category);
        });
        document.body.appendChild(overlay);
        renderIcons(overlay);
        (overlay.querySelector(focusSelector || '[data-variant][aria-pressed="true"]') || overlay.querySelector('[data-close]')).focus();
    };

    const changeVariant = (variant) => {
        if (!VARIANTS[variant]) return;
        gameVariant = variant;
        saveVariant(variant);
        if (!currentPlace) {
            closeSettings();
            checkSessionAndLoad();
            return;
        }
        let note = 'Uloženo, platí od další otázky.';
        if (round && !round.answered && round.variant !== variant) {
            if (variant === 'choices') {
                // Na možnosti jde přepnout hned – je to snazší varianta
                round.variant = 'choices';
                renderPlace({ keepScroll: true });
                note = 'Uloženo, platí hned pro tuto otázku.';
            } else {
                // Na psaní (dvojnásobek bodů) až od další otázky – možnosti už tady byly vidět
                note = 'Uloženo. Psaní platí od další otázky, tady už byly možnosti vidět.';
            }
        }
        openSettings(note, `[data-variant="${variant}"]`);
    };

    const changeFilters = (change, focusSelector) => {
        filters = { ...filters, ...change };
        writeJson(FILTERS_STORAGE_KEY, filters);
        openSettings('Uloženo, platí od dalšího místa v tréninku.', focusSelector);
    };

    const toggleCategory = (key) => {
        const isOn = filters.categories.includes(key);
        if (isOn && filters.categories.length === 1) {
            openSettings('Aspoň jedna kategorie musí zůstat zapnutá.', `[data-category="${key}"]`);
            return;
        }
        const categories = isOn ? filters.categories.filter(other => other !== key) : [...filters.categories, key];
        changeFilters({ categories: ALL_CATEGORY_KEYS.filter(other => categories.includes(other)) }, `[data-category="${key}"]`);
    };

    // --- Hlavička ---

    const BUTTON_ACTIVE_DAILY = 'p-2.5 rounded-2xl transition-all bg-emerald-600 text-white shadow-md active:scale-95 border border-emerald-500';
    const BUTTON_ACTIVE_RANDOM = 'p-2.5 rounded-2xl transition-all bg-sky-600 text-white shadow-md active:scale-95 border border-sky-500';
    const BUTTON_INACTIVE = 'p-2.5 rounded-2xl transition-all bg-white/90 text-slate-600 hover:text-emerald-600 shadow-md active:scale-95 border border-slate-200/60 dark:bg-slate-800/90 dark:text-slate-300 dark:border-slate-700 dark:hover:text-emerald-400';

    const updateControlsUI = () => {
        const btnDaily = document.getElementById('btn-daily');
        const btnRandom = document.getElementById('btn-random');
        const randomIcon = document.getElementById('random-icon');

        btnDaily.className = isDailyMode ? BUTTON_ACTIVE_DAILY : BUTTON_INACTIVE;
        btnRandom.className = isDailyMode ? BUTTON_INACTIVE : BUTTON_ACTIVE_RANDOM;
        btnDaily.setAttribute('aria-pressed', String(isDailyMode));
        btnRandom.setAttribute('aria-pressed', String(!isDailyMode));

        [btnDaily, btnRandom].forEach(button => {
            button.disabled = isLoading;
            button.classList.toggle('opacity-50', isLoading);
        });
        if (randomIcon) randomIcon.classList.toggle('spin', isLoading && !isDailyMode);

        // Štítek vlevo nahoře ukazuje režim: dnešní místo s datem, nebo trénink s body
        const iconSlot = document.getElementById('status-icon-slot');
        iconSlot.innerHTML = `<i data-lucide="${isDailyMode ? 'calendar-days' : 'shuffle'}" class="w-5 h-5 text-emerald-600 dark:text-emerald-400"></i>`;
        renderIcons(iconSlot);
        document.getElementById('status-text').textContent = isDailyMode
            ? `Dnešní místo · ${formatDayKey((currentPlace && currentPlace.dailyDate) || getDayKey()).replace(/ \d{4}$/, '')}`
            : `Trénink · ${formatPoints(loadStats().practice.points)}`;
    };

    const renderLoading = () => {
        appContent.innerHTML = `
            <div class="absolute inset-0 z-10 flex flex-col items-center justify-center fade-in bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <i data-lucide="globe" class="w-14 h-14 text-emerald-500 spin mb-5 drop-shadow-md"></i>
                <p class="text-slate-600 dark:text-slate-300 font-bold tracking-wider text-sm uppercase">Vybírám místo…</p>
            </div>
        `;
        renderIcons(appContent);
    };

    // --- Nápovědy: fotka, slepá mapa, fakta ---

    const cssUrl = (url) => `url("${url.replace(/["\\]/g, '\\$&')}")`;

    // Fotka je pozadí prvku, ne <img> – podržením nejde otevřít a z adresy souboru vyčíst název místa
    const setBackgroundPhoto = async (element, url) => {
        try {
            await loadImage(url);
            if (element.isConnected) element.style.backgroundImage = cssUrl(url);
        } catch (e) {
            const failure = element.parentElement.querySelector('[data-photo-failed]');
            if (failure) failure.classList.remove('hidden');
        }
    };

    const svgElement = (tag, attributes) => {
        const element = document.createElementNS(SVG_NS, tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    };

    // Slepá mapa: obrysy států bez jediného popisku, místo označené terčem uprostřed (u států zvýrazněný celý stát)
    const renderBlindMap = async (container, data) => {
        let world;
        try {
            world = await loadWorld();
        } catch (e) {
            const failure = container.querySelector('[data-map-failed]');
            if (failure) failure.classList.remove('hidden');
            return;
        }
        if (!container.isConnected) return;
        const width = Math.round(container.clientWidth) || 360;
        const height = Math.round(container.clientHeight) || 224;
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true' });
        const shapes = buildBlindMap(world, { lat: data.lat, lon: data.lon, spanLon: data.mapSpan, width, height, highlightIso: data.highlightIso });
        for (const shape of shapes) {
            svg.appendChild(svgElement('path', {
                d: shape.d,
                'stroke-width': 0.8,
                'stroke-linejoin': 'round',
                class: shape.highlight
                    ? 'fill-emerald-400 stroke-emerald-700 dark:fill-emerald-600 dark:stroke-emerald-300'
                    : 'fill-amber-50 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-400'
            }));
        }
        // Malé státy (Malta, Monako) na mapě obrys nemají – pak i u státu terč
        if (!shapes.some(shape => shape.highlight)) {
            svg.appendChild(svgElement('circle', { cx: width / 2, cy: height / 2, r: 15, fill: 'none', 'stroke-width': 2.5, class: 'stroke-rose-500/60' }));
            svg.appendChild(svgElement('circle', { cx: width / 2, cy: height / 2, r: 6, 'stroke-width': 2.5, class: 'fill-rose-500 stroke-white' }));
        }
        container.prepend(svg);
    };

    const formatDistance = (km) => `${(km >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10).toLocaleString('cs-CZ')} km`;
    // Šířka výřezu mapy v kilometrech (na rovnoběžce místa) – dává představu o měřítku
    const getMapWidthKm = (data) => data.mapSpan * 111.32 * Math.cos(data.lat * Math.PI / 180);

    const CARD = 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-sm';
    const CARD_TITLE = 'text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2';
    const HINT_CHIP = 'mb-4 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 inline-flex items-center gap-2';
    const IMAGE_LABEL = 'absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm';

    const HINT_INFO = {
        photo: { label: 'fotka místa', icon: 'image' },
        map: { label: 'slepá mapa', icon: 'map' },
        facts: { label: 'čísla a fakta', icon: 'info' }
    };

    const renderFactsList = (facts) => `
        <dl class="grid grid-cols-2 gap-2">
            ${facts.map(fact => `
                <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                    <dt class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(fact.label)}</dt>
                    <dd class="mt-0.5 font-bold leading-snug text-slate-800 dark:text-slate-100">${escapeHtml(fact.value)}</dd>
                </div>`).join('')}
        </dl>`;

    const renderHintCard = (step, data, isNewest) => {
        const newestId = isNewest ? 'id="newest-hint"' : '';
        if (step === 'photo') {
            return `
                <section ${newestId} class="relative h-60 shrink-0 overflow-hidden rounded-[1.5rem] bg-slate-200 shadow-sm dark:bg-slate-800">
                    <div class="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-600"><i data-lucide="image" class="h-10 w-10"></i></div>
                    <p data-photo-failed class="hidden absolute inset-x-0 top-1/2 mt-8 text-center text-sm text-slate-500">Fotku se nepodařilo načíst</p>
                    <div id="hint-photo" class="absolute inset-0 bg-cover bg-center" aria-hidden="true"></div>
                    <span class="${IMAGE_LABEL}"><i data-lucide="image" class="h-3.5 w-3.5"></i> Fotka místa</span>
                </section>`;
        }
        if (step === 'map') {
            const what = data.category === 'stat' ? 'Stát je uprostřed' : 'Místo je uprostřed';
            const width = formatDistance(getMapWidthKm(data));
            return `
                <section ${newestId} class="relative h-56 shrink-0 overflow-hidden rounded-[1.5rem] border border-sky-200 bg-sky-200 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    <div id="hint-map" class="absolute inset-0" role="img" aria-label="Slepá mapa bez popisků. ${what}, výřez je široký asi ${width}.">
                        <p data-map-failed class="hidden absolute inset-0 flex items-center justify-center text-sm text-slate-500">Mapu se nepodařilo načíst</p>
                    </div>
                    <span class="${IMAGE_LABEL}"><i data-lucide="map" class="h-3.5 w-3.5"></i> Slepá mapa · ${what.toLowerCase()}</span>
                    <span class="absolute bottom-3 right-3 rounded-lg bg-black/45 px-2 py-1 text-[11px] font-bold text-white">↔ ${width}</span>
                </section>`;
        }
        return `
            <section ${newestId} class="${CARD} p-5">
                <h3 class="${CARD_TITLE} mb-4"><i data-lucide="info" class="w-4 h-4 text-emerald-500"></i> Čísla a fakta</h3>
                ${renderFactsList(data.facts)}
            </section>`;
    };

    const renderAnswerInput = (data, isNameQuiz) => {
        if (round.variant === 'typed') {
            return `
                <form id="answer-form" class="flex gap-2" autocomplete="off">
                    <label for="answer-input" class="sr-only">${isNameQuiz ? 'Název místa' : 'Stát'}</label>
                    <input id="answer-input" name="answer" type="text" enterkeyhint="send" placeholder="${isNameQuiz ? 'Napiš název místa…' : 'Napiš stát…'}" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    <button type="submit" aria-label="Odeslat odpověď" class="flex items-center justify-center rounded-xl bg-emerald-600 px-4 text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95">
                        <i data-lucide="send" class="w-5 h-5"></i>
                    </button>
                </form>`;
        }
        const choicesHtml = (data.choices || []).map((choice, index) => `
            <button type="button" data-action="choice" data-index="${index}" class="min-h-[3.25rem] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold leading-tight text-slate-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/40">
                ${escapeHtml(choice.label)}
            </button>
        `).join('');
        return `<div class="grid grid-cols-2 gap-2">${choicesHtml}</div>`;
    };

    // Popis bez názvu místa (u otázky na stát bez státu, národnosti a kontinentu)
    const getQuestionDescription = (data) => {
        if (!data.description) return '';
        if (data.quizType === 'name') {
            const countryAliases = data.category === 'stat' ? getCountryAliases([data.id]) : [];
            return censorName(data.description, [data.name, displayName(data.title), ...countryAliases].join(', '));
        }
        return censorCountry(data.description, data.countryNames[0], getCountryAliases(data.countryIds));
    };

    const renderQuestion = (keepScroll) => {
        const data = currentPlace;
        const level = round.hintLevel;
        const levelCount = getLevelCount(data);
        const isNameQuiz = data.quizType === 'name';
        const typed = round.variant === 'typed';
        const category = getCategory(data.category);
        const description = getQuestionDescription(data);
        // Popis je vidět hned, nápovědy se přidávají pod něj v pořadí fotka → slepá mapa → fakta
        const unlocked = data.hints.slice(0, level - 1);
        const nextHint = data.hints[level - 1];

        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-4 bg-slate-50 p-5 pb-6 dark:bg-slate-900">
                <div class="text-center">
                    <h2 class="mb-3 text-2xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">
                        ${isNameQuiz ? 'Co je to za místo?' : 'Ve kterém státě to je?'}
                    </h2>
                    <span class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400 bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm">
                        <i data-lucide="${category.icon}" class="h-3.5 w-3.5"></i> ${escapeHtml(data.typeLabel)}
                    </span>
                </div>

                <section class="${CARD} p-5">
                    <div class="mb-4 flex items-center justify-between">
                        <h3 class="${CARD_TITLE}"><i data-lucide="book-open" class="w-4 h-4 text-emerald-500"></i> Popis</h3>
                        <span class="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" title="Použité nápovědy">Nápověda ${level}/${levelCount}</span>
                    </div>
                    ${!isNameQuiz ? `
                        <div class="${HINT_CHIP}">
                            <i data-lucide="tag" class="w-4 h-4 text-sky-500"></i>
                            <span class="font-medium">Název:</span> <b class="text-slate-800 dark:text-slate-100">${escapeHtml(data.name)}</b>
                        </div>
                    ` : ''}
                    ${description ? `
                        <p class="text-slate-700 dark:text-slate-200 leading-relaxed font-medium text-[16px] italic border-l-4 border-emerald-200 dark:border-emerald-700 pl-4 py-1">„${escapeHtml(description)}“</p>
                    ` : `
                        <p class="text-sm text-slate-500 dark:text-slate-400">Popis se teď nepodařilo načíst z Wikipedie – pomůžou nápovědy níž.</p>
                    `}
                </section>

                ${unlocked.map((step, index) => renderHintCard(step, data, keepScroll && index === unlocked.length - 1)).join('')}

                ${nextHint ? `
                    <button type="button" data-action="hint" class="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 px-4 py-3 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 active:scale-95 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30">
                        <i data-lucide="${HINT_INFO[nextHint].icon}" class="w-4 h-4"></i> Nápověda: ${HINT_INFO[nextHint].label} · pak za ${formatPoints(pointsFor(level + 1, levelCount, typed))}
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
                    ${renderAnswerInput(data, isNameQuiz)}
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
        const map = document.getElementById('hint-map');
        if (map) renderBlindMap(map, data);
        const newestHint = document.getElementById('newest-hint');
        if (newestHint) newestHint.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        else if (!keepScroll) appContent.scrollTo(0, 0);
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

    const getCorrectAnswer = (data) => data.quizType === 'name' ? data.name : data.countryNames[0];

    // Kde místo leží: státy, u států a míst mimo státy kontinent
    const getLocationLabel = (data) => {
        if (data.category !== 'stat' && data.countryNames.length) return data.countryNames.join(', ');
        if (data.continent) return CONTINENT_NAMES[data.continent];
        return data.category === 'jezero' ? 'Mezinárodní vody' : 'Mimo území států';
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
                    <p class="text-sm text-rose-700/80 dark:text-rose-300/80">${round.answer ? `Tvoje odpověď: ${escapeHtml(round.answer)} · ` : ''}Správně: ${escapeHtml(getCorrectAnswer(data))}</p>
                </div>
            </div>`;
    };

    const renderStatsCard = (data) => {
        const stats = loadStats();
        if (isDailyMode && data.dailyDate) {
            const results = Object.values(stats.daily);
            const wins = results.filter(result => result.correct).length;
            return `
                <section class="${CARD} flex items-center gap-3 p-4">
                    <div class="grid flex-1 grid-cols-3 text-center">
                        <div><p class="text-2xl font-black text-slate-800 dark:text-slate-100">${computeStreak(stats.daily, getDayKey())}</p><p class="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"><i data-lucide="flame" class="h-3 w-3 text-orange-500"></i>Série</p></div>
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
                <div id="map-tiles" class="absolute inset-0 overflow-hidden" aria-label="Mapa s polohou místa" role="img"></div>
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
        if (!container || !currentPlace) return;
        const { lat, lon } = currentPlace;
        renderTiles(container, lat, lon, mapZoom, OSM_TILES);
        document.getElementById('map-open-link').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${Math.min(mapZoom + 4, 18)}/${lat}/${lon}`;
    };

    // Nahoře ve výsledku fotka místa, a když žádná není (nebo se nenačte), satelitní snímek okolí
    const showResultVisual = async () => {
        const element = document.getElementById('result-visual');
        if (!element) return;
        const { photoUrl, lat, lon } = currentPlace;
        if (photoUrl) {
            try {
                await loadImage(photoUrl);
                if (element.isConnected) element.style.backgroundImage = cssUrl(photoUrl);
                return;
            } catch (e) {}
        }
        if (element.isConnected) renderTiles(element, lat, lon, RESULT_SATELLITE_ZOOM, SATELLITE_TILES);
    };

    const wikipediaUrl = (title) => `https://cs.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

    const renderResult = () => {
        const data = currentPlace;
        const category = getCategory(data.category);

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
            : `<span class="text-[10px] font-bold text-white bg-slate-800/60 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm border border-slate-600"><i data-lucide="${data.known ? 'star' : 'compass'}" class="w-3 h-3 text-sky-300"></i>${data.known ? 'Známé místo' : 'Méně známé místo'}</span>`;

        appContent.innerHTML = `
            <div class="fade-in flex flex-col w-full min-h-full pb-6 bg-slate-50 dark:bg-slate-900">
                <div class="relative h-[42vh] w-full shrink-0 bg-slate-900">
                    <div id="result-visual" class="absolute inset-0 overflow-hidden bg-cover bg-center opacity-90" aria-hidden="true"></div>
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent"></div>

                    <div class="absolute bottom-0 left-0 p-6 w-full text-white">
                        <div class="flex flex-wrap items-center gap-2 mb-3">
                            <span class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-md border border-emerald-400">
                                <i data-lucide="${category.icon}" class="w-3.5 h-3.5"></i>
                                ${escapeHtml(data.typeLabel)}
                            </span>
                            ${originBadge}
                        </div>
                        <h1 class="text-4xl font-black tracking-tight leading-tight text-white drop-shadow-xl mb-3">${escapeHtml(data.name)}</h1>

                        <div class="flex items-center gap-2 text-sm font-semibold text-emerald-50 bg-slate-800/60 backdrop-blur-md w-fit px-3.5 py-2 rounded-xl border border-slate-600 shadow-lg">
                            <i data-lucide="navigation" class="w-4 h-4 text-emerald-400"></i>
                            ${escapeHtml(getLocationLabel(data))}
                        </div>
                    </div>
                </div>

                <div class="p-6 flex flex-col gap-6 flex-grow bg-slate-50 dark:bg-slate-900 rounded-t-[2.5rem] -mt-6 z-10 relative">
                    ${renderResultBanner(data)}
                    ${renderStatsCard(data)}
                    ${renderMapCard()}

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
                            Další místo <i data-lucide="arrow-right" class="w-5 h-5"></i>
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
        appContent.scrollTo(0, 0);
    };

    // --- Průběh hry ---

    const renderPlace = ({ keepScroll = false } = {}) => {
        if (!currentPlace || !round) return;
        persistState();
        if (round.answered) renderResult();
        else renderQuestion(keepScroll);
        updateControlsUI();
    };

    const persistState = () => {
        if (!currentPlace) return;
        writeJson(SESSION_STORAGE_KEY, { version: STATE_VERSION, data: currentPlace, round, isDailyMode, timestamp: Date.now() });
        if (isDailyMode && currentPlace.dailyDate) writeJson(DAILY_STORAGE_KEY, { date: currentPlace.dailyDate, data: currentPlace, round });
    };

    const recordResult = () => {
        const stats = loadStats();
        if (isDailyMode && currentPlace.dailyDate) {
            if (!stats.daily[currentPlace.dailyDate]) {
                stats.daily[currentPlace.dailyDate] = {
                    correct: round.correct, points: round.points, hintLevel: round.hintLevel, levelCount: getLevelCount(currentPlace),
                    typed: round.typed, category: currentPlace.category
                };
            }
        } else {
            stats.practice.played += 1;
            stats.practice.correct += round.correct ? 1 : 0;
            stats.practice.points += round.points;
        }
        writeJson(STATS_STORAGE_KEY, stats);
    };

    const submitAnswer = ({ correct, typed, answer, gaveUp = false }) => {
        if (!round || round.answered) return;
        const points = correct ? pointsFor(round.hintLevel, getLevelCount(currentPlace), typed) : 0;
        Object.assign(round, { answered: true, correct, typed, answer, gaveUp, points });
        mapZoom = DEFAULT_MAP_ZOOM;
        recordResult();
        renderPlace();
    };

    const showNextHint = () => {
        if (!round || round.answered || round.hintLevel >= getLevelCount(currentPlace)) return;
        round.hintLevel += 1;
        renderPlace({ keepScroll: true });
    };

    const shareResult = async () => {
        const stats = loadStats();
        const dayKey = currentPlace && currentPlace.dailyDate;
        const result = dayKey && stats.daily[dayKey];
        if (!result) return;
        const text = buildShareText({
            dayKey,
            category: currentPlace.category,
            result,
            streak: computeStreak(stats.daily, getDayKey()),
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

    const removeOldStorage = () => {
        try {
            Object.keys(localStorage)
                .filter(key => /^geoQuiz(Data|Daily)\d+$/.test(key) && key !== DAILY_STORAGE_KEY)
                .forEach(key => localStorage.removeItem(key));
        } catch (e) {}
    };

    const checkSessionAndLoad = () => {
        const session = readJson(SESSION_STORAGE_KEY);
        if (session && session.version === STATE_VERSION && session.data && session.round) {
            const isFresh = Date.now() - session.timestamp < SESSION_MAX_AGE;
            // Dnešní místo z uložené relace platí jen do půlnoci
            const isCurrent = !session.isDailyMode || session.data.dailyDate === getDayKey();
            if (isFresh && isCurrent) {
                currentPlace = session.data;
                round = session.round;
                isDailyMode = session.isDailyMode;
                renderPlace();
                return;
            }
        }
        loadDailyLocation();
    };

    // Společný průběh: vybrat místo ze sady, dotáhnout popis a fotku, zobrazit otázku
    const startRound = async (daily) => {
        if (isLoading) return;
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        isLoading = true;
        isDailyMode = daily;
        updateControlsUI();
        renderLoading();

        const today = getDayKey();
        // Uložené dnešní místo včetně stavu odpovědi – po návratu z tréninku zůstane odhalené
        const savedDaily = daily ? readJson(DAILY_STORAGE_KEY) : null;
        if (savedDaily && savedDaily.date === today && savedDaily.data) {
            currentPlace = savedDaily.data;
            round = savedDaily.round || createRound();
            isLoading = false;
            renderPlace();
            return;
        }

        try {
            const dataset = await loadDataset();
            let place;
            let rng;
            if (daily) {
                // Dnešní místo je pro všechny stejné: známé místo z kterékoli kategorie
                rng = createSeededRandom('geo-kviz-' + today);
                place = pickPlace(dataset.places.filter(candidate => candidate.k === 1), rng);
            } else {
                rng = Math.random;
                const pool = filterPlaces(dataset.places, filters);
                const history = readJson(HISTORY_STORAGE_KEY) || [];
                place = pickPlace(pool.length ? pool : dataset.places, rng, history);
                writeJson(HISTORY_STORAGE_KEY, [place.q, ...history.filter(id => id !== place.q)].slice(0, HISTORY_SIZE));
            }
            const data = await createRoundData(place, dataset, rng);
            currentPlace = daily ? { ...data, dailyDate: today } : data;
            round = createRound();
            isLoading = false;
            renderPlace();
            // Obrysy států pro slepou mapu stáhneme dopředu, ať je nápověda hned po ruce
            loadWorld().catch(() => {});
        } catch (error) {
            isLoading = false;
            renderError(error);
        }
    };

    const loadDailyLocation = () => startRound(true);
    const loadRandomLocation = () => startRound(false);
    const retryLoad = () => isDailyMode ? loadDailyLocation() : loadRandomLocation();

    const renderError = (error) => {
        console.error(error);
        const isNetworkError = error instanceof NetworkError || !navigator.onLine;
        const title = isNetworkError ? 'Chyba spojení' : 'Něco se pokazilo';
        const message = isNetworkError
            ? 'Nepodařilo se načíst data hry. Zkontroluj připojení k internetu a zkus to znovu.'
            : 'Místo se nepodařilo připravit. Zkus to prosím znovu.';

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

    const changeMapZoom = (delta) => {
        mapZoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, mapZoom + delta));
        renderMap();
    };

    // Všechny akce přes delegaci událostí – stránka nepotřebuje inline JavaScript (kvůli CSP)
    const ACTIONS = {
        hint: () => showNextHint(),
        'give-up': () => submitAnswer({ correct: false, typed: false, answer: null, gaveUp: true }),
        next: () => loadRandomLocation(),
        retry: () => retryLoad(),
        share: () => shareResult(),
        'zoom-in': () => changeMapZoom(1),
        'zoom-out': () => changeMapZoom(-1),
        settings: () => openSettings(),
        choice: (button) => {
            if (!round || round.variant === 'typed') return;
            const choice = currentPlace && (currentPlace.choices || [])[Number(button.dataset.index)];
            if (choice) submitAnswer({ correct: choice.correct, typed: false, answer: choice.label });
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
        if (!answer || !currentPlace) return;
        submitAnswer({ correct: isAnswerMatch(answer, getAcceptedAnswers(currentPlace)), typed: true, answer });
    });

    // Chyba načtení obrázku (dlaždice mapy) nebublá, zachytíme ji ve fázi capture a obrázek skryjeme
    appContent.addEventListener('error', (event) => {
        if (event.target instanceof HTMLImageElement) event.target.classList.add('invisible');
    }, true);

    document.getElementById('btn-daily').addEventListener('click', loadDailyLocation);
    document.getElementById('btn-random').addEventListener('click', loadRandomLocation);
    document.getElementById('btn-settings').addEventListener('click', () => openSettings());
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSettings(); });

    gameVariant = readVariant();
    filters = loadFilters();
    renderIcons(document);
    removeOldStorage();
    updateControlsUI();
    if (gameVariant) checkSessionAndLoad();
    else renderVariantWelcome();

    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('sw.js').catch(error => console.error(error));
    }
})();
