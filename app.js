// Uživatelské rozhraní Geo Kvízu: načítání míst z Wikipedie, otázka s nápovědami, výsledek a ukládání stavu
(() => {
    'use strict';

    const {
        escapeHtml, isRealPhoto, displayName, formatPoints, getDayKey, formatDayKey, createSeededRandom, pickRandom,
        isInsideCzechia, inferGeoCategory, getCategoryIconName, censorName, censorCountry, isKnownCountry, processWikiText, getPopulation,
        isAnswerMatch, buildNameChoices, buildCountryChoices, isCountryItself, canAskForCountry, getAcceptedAnswers, pointsFor,
        computeStreak, buildShareText, getTileLayout, SATELLITE_TILES, OSM_TILES, SATELLITE_ZOOM_BY_HINT,
        CATEGORY_CITY, UNKNOWN_COUNTRY, INTERNATIONAL_WATERS, CZECHIA_QID, MAX_HINT_LEVEL
    } = window.GeoQuizCore;

    const DAILY_STORAGE_KEY = 'geoQuizDaily17';
    const SESSION_STORAGE_KEY = 'geoSessionState';
    const STATS_STORAGE_KEY = 'geoQuizStats';
    const VARIANT_STORAGE_KEY = 'geoQuizVariant';
    const STATE_VERSION = 5;
    const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
    const MAX_ATTEMPTS = 25;
    const REQUEST_TIMEOUT = 12000;
    const SEARCH_TIMEOUT = 60000;
    const DEFAULT_MAP_ZOOM = 5;
    const MIN_MAP_ZOOM = 2;
    const MAX_MAP_ZOOM = 12;
    const WIKI_API = 'https://cs.wikipedia.org/w/api.php?format=json&origin=*';
    const WIKIDATA_API = 'https://www.wikidata.org/w/api.php?format=json&origin=*';

    const appContent = document.getElementById('app-content');

    let isDailyMode = true;
    let isLoading = false;
    let currentPlace = null;
    let round = null;
    let mapZoom = DEFAULT_MAP_ZOOM;
    // Varianta hry: 'choices' (výběr ze 4 možností) nebo 'typed' (psaní odpovědi za dvojnásobek bodů)
    let gameVariant = null;

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

    const createRound = () => ({ hintLevel: 1, variant: gameVariant || 'choices', answered: false, correct: false, points: 0, typed: false, answer: null, gaveUp: false });

    const VARIANTS = {
        choices: { icon: 'layout-grid', title: 'Výběr ze 4 možností', text: 'Klasický kvíz. Za správnou odpověď 3, 2 nebo 1 bod podle počtu použitých nápověd.' },
        typed: { icon: 'keyboard', title: 'Psaní odpovědi', text: 'Těžší varianta za dvojnásobek bodů (6, 4 nebo 2). Na diakritice, velkých písmenech ani drobném překlepu nezáleží.' }
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
                    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Variantu můžeš kdykoli změnit tlačítkem nastavení vpravo nahoře.</p>
                </div>
                <div id="variant-welcome" class="flex flex-col gap-3">${renderVariantCards(null)}</div>
            </div>`;
        renderIcons(appContent);
    };

    const closeSettings = () => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.remove();
    };

    const openSettings = (note = '') => {
        closeSettings();
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'settings-title');
        overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center';
        overlay.innerHTML = `
            <div class="fade-in w-full max-w-md rounded-[1.75rem] bg-slate-50 p-5 shadow-2xl dark:bg-slate-900">
                <div class="mb-4 flex items-center justify-between">
                    <h2 id="settings-title" class="text-lg font-black text-slate-800 dark:text-slate-100">Varianta hry</h2>
                    <button type="button" data-close aria-label="Zavřít" class="rounded-xl p-2 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"><i data-lucide="x" class="h-5 w-5"></i></button>
                </div>
                <div class="flex flex-col gap-3">${renderVariantCards(gameVariant)}</div>
                <p id="settings-note" class="mt-4 min-h-[1.25rem] text-sm text-slate-500 dark:text-slate-400">${escapeHtml(note)}</p>
            </div>`;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close]')) {
                closeSettings();
                return;
            }
            const button = event.target.closest('[data-variant]');
            if (button) changeVariant(button.dataset.variant);
        });
        document.body.appendChild(overlay);
        renderIcons(overlay);
        overlay.querySelector('[aria-pressed="true"]')?.focus();
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
        openSettings(note);
    };

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
                <p class="text-slate-600 dark:text-slate-300 font-bold tracking-wider text-sm uppercase">Prozkoumávám atlas světa...</p>
            </div>
        `;
        renderIcons(appContent);
    };

    const loadImage = (url) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(url);
        image.onerror = reject;
        image.src = url;
    });

    const cssUrl = (url) => `url("${url.replace(/["\\]/g, '\\$&')}")`;

    // Fotka je pozadí prvku, ne <img> – podržením nejde otevřít a z adresy souboru vyčíst název místa
    const setHintPhoto = async (element, url) => {
        try {
            await loadImage(url);
            if (element.isConnected) element.style.backgroundImage = cssUrl(url);
        } catch (e) {
            const card = element.closest('section');
            if (card) card.remove();
        }
    };

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

    const CARD = 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-sm';
    const CARD_TITLE = 'text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2';
    const HINT_CHIP = 'mb-4 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 inline-flex items-center gap-2';

    // Poloha jako nápověda u otázky na název: stát, u samotného státu kontinent
    const getLocationHint = (data) => data.locationHint !== undefined ? data.locationHint : (isKnownCountry(data.country) ? data.country : '');

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

    const renderQuestion = (keepScroll) => {
        const data = currentPlace;
        const level = round.hintLevel;
        const isNameQuiz = data.quizType === 'name';
        const points = pointsFor(level, round.variant === 'typed');
        const hintText = isNameQuiz ? censorName(data.description, data.name) : censorCountry(data.description, data.country);
        const locationHint = isNameQuiz ? getLocationHint(data) : '';
        // Každá nápověda oddálí satelitní snímek; druhá k tomu přidá popis (a u otázky na název polohu)
        const satelliteView = { 1: 'okolí místa', 2: 'širší region', 3: 'kontinent' }[level];
        const nextHintLabel = level === 1 ? `širší region na mapě, ${locationHint ? 'poloha a popis' : 'popis'}` : 'celý kontinent na mapě';

        appContent.innerHTML = `
            <div class="fade-in flex min-h-full w-full flex-col gap-5 bg-slate-50 p-5 pb-6 dark:bg-slate-900">
                <div class="text-center">
                    <h2 class="mb-3 text-2xl font-black leading-tight tracking-tight text-slate-800 dark:text-slate-50">
                        ${isNameQuiz ? 'Jak se jmenuje toto místo?' : 'Ve kterém státě leží toto místo?'}
                    </h2>
                    <span class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400 bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-sm">
                        <i data-lucide="${getCategoryIconName(data.category)}" class="h-3.5 w-3.5"></i> ${escapeHtml(data.category)}
                    </span>
                </div>

                <section class="relative h-56 shrink-0 overflow-hidden rounded-[1.5rem] bg-slate-800 shadow-sm">
                    <div id="hint-satellite" class="absolute inset-0 overflow-hidden" role="img" aria-label="Satelitní snímek bez popisků: ${satelliteView}"></div>
                    <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-md">
                        <i data-lucide="map-pin" class="h-9 w-9 fill-rose-500 stroke-white"></i>
                    </div>
                    <span class="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                        <i data-lucide="globe" class="h-3.5 w-3.5"></i> Satelit: ${satelliteView}
                    </span>
                    <span class="absolute bottom-3 right-3 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/80">NASA Blue Marble</span>
                </section>

                ${data.photoUrl ? `
                    <section class="relative h-56 shrink-0 overflow-hidden rounded-[1.5rem] bg-slate-200 shadow-sm dark:bg-slate-800">
                        <div class="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-600"><i data-lucide="image" class="h-10 w-10"></i></div>
                        <div id="hint-photo" class="absolute inset-0 bg-cover bg-center" aria-hidden="true"></div>
                        <span class="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                            <i data-lucide="image" class="h-3.5 w-3.5"></i> Fotka místa
                        </span>
                    </section>
                ` : ''}

                <section class="${CARD} p-5">
                    <div class="mb-4 flex items-center justify-between">
                        <h3 class="${CARD_TITLE}"><i data-lucide="radar" class="w-4 h-4 text-emerald-500"></i> Nápovědy</h3>
                        <span class="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">${level}/${MAX_HINT_LEVEL}</span>
                    </div>

                    ${!isNameQuiz ? `
                        <div class="${HINT_CHIP}">
                            <i data-lucide="tag" class="w-4 h-4 text-sky-500"></i>
                            <span class="font-medium">Název:</span> <b class="text-slate-800 dark:text-slate-100">${escapeHtml(displayName(data.name))}</b>
                        </div>
                    ` : ''}
                    ${level >= 2 && locationHint ? `
                        <div class="${HINT_CHIP}">
                            <i data-lucide="navigation" class="w-4 h-4 text-sky-500"></i>
                            <span class="font-medium">Poloha:</span> <b class="text-slate-800 dark:text-slate-100">${escapeHtml(locationHint)}</b>
                        </div>
                    ` : ''}

                    ${level >= 2 ? `
                        <p class="text-slate-700 dark:text-slate-200 leading-relaxed font-medium text-[16px] italic border-l-4 border-emerald-200 dark:border-emerald-700 pl-4 py-1">
                            „${escapeHtml(hintText)}“
                        </p>
                    ` : `
                        <p class="text-sm text-slate-500 dark:text-slate-400">Zatím vidíš ${isNameQuiz ? '' : 'název, '}kategorii a satelitní snímek okolí${data.photoUrl ? ' s fotkou' : ''}. Hádej hned za nejvíc bodů, nebo si vezmi další nápovědu.</p>
                    `}
                    ${level < MAX_HINT_LEVEL ? `
                        <button type="button" data-action="hint" class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 px-4 py-3 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 active:scale-95 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30">
                            <i data-lucide="lightbulb" class="w-4 h-4"></i> Další nápověda: ${nextHintLabel}
                        </button>
                    ` : ''}
                </section>

                <section class="${CARD} p-5">
                    <div class="mb-2 flex items-center justify-between gap-2">
                        <h3 class="${CARD_TITLE}"><i data-lucide="target" class="w-4 h-4 text-emerald-500"></i> Tvoje odpověď</h3>
                        <button type="button" data-action="settings" class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-slate-700 dark:hover:text-emerald-300">
                            <i data-lucide="${VARIANTS[round.variant].icon}" class="h-3.5 w-3.5"></i> ${round.variant === 'typed' ? 'Psaní' : 'Možnosti'}
                        </button>
                    </div>
                    <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">Teď za ni získáš <b class="text-slate-700 dark:text-slate-200">${formatPoints(points)}</b>.</p>
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
        renderTiles(document.getElementById('hint-satellite'), data.lat, data.lon, SATELLITE_ZOOM_BY_HINT[level], SATELLITE_TILES);
        if (data.photoUrl) setHintPhoto(document.getElementById('hint-photo'), data.photoUrl);
        if (!keepScroll) appContent.scrollTo(0, 0);
    };

    const renderResultBanner = (data) => {
        const correctAnswer = data.quizType === 'name' ? displayName(data.name) : data.country;
        if (round.correct) {
            return `
                <div class="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/30">
                    <i data-lucide="circle-check" class="h-9 w-9 shrink-0 text-emerald-600 dark:text-emerald-400"></i>
                    <div>
                        <p class="font-black text-emerald-800 dark:text-emerald-200">Správně! +${formatPoints(round.points)}</p>
                        <p class="text-sm text-emerald-700/80 dark:text-emerald-300/80">${round.typed ? 'Napsaná odpověď' : 'Výběr z možností'} · nápovědy ${round.hintLevel}/${MAX_HINT_LEVEL}</p>
                    </div>
                </div>`;
        }
        return `
            <div class="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/30">
                <i data-lucide="circle-x" class="h-9 w-9 shrink-0 text-rose-600 dark:text-rose-400"></i>
                <div>
                    <p class="font-black text-rose-800 dark:text-rose-200">${round.gaveUp ? 'Tentokrát bez odpovědi' : 'Bohužel, to není ono'}</p>
                    <p class="text-sm text-rose-700/80 dark:text-rose-300/80">${round.answer ? `Tvoje odpověď: ${escapeHtml(round.answer)} · ` : ''}Správně: ${escapeHtml(correctAnswer)}</p>
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

    const renderMapCard = (data) => {
        if (typeof data.lat !== 'number' || typeof data.lon !== 'number') return '';
        return `
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
    };

    const renderMap = () => {
        const container = document.getElementById('map-tiles');
        if (!container || !currentPlace) return;
        const { lat, lon } = currentPlace;
        renderTiles(container, lat, lon, mapZoom, OSM_TILES);
        document.getElementById('map-open-link').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${Math.min(mapZoom + 4, 18)}/${lat}/${lon}`;
    };

    // Nahoře ve výsledku fotka místa, a když žádná není (nebo se nenačte), satelitní snímek regionu
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
        if (element.isConnected) renderTiles(element, lat, lon, SATELLITE_ZOOM_BY_HINT[2], SATELLITE_TILES);
    };

    const renderResult = () => {
        const data = currentPlace;
        const name = escapeHtml(data.name);
        const country = escapeHtml(data.isCountry && data.locationHint ? data.locationHint : data.country);

        const funFactsHtml = data.funFacts.map((fact, i) => `
            <div class="flex items-start gap-4">
                <div class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 rounded-lg w-8 h-8 flex items-center justify-center flex-shrink-0 text-sm font-black border border-emerald-200 dark:border-emerald-800 mt-0.5">
                    ${i + 1}
                </div>
                <p class="text-slate-700 dark:text-slate-200 text-[15px] leading-relaxed pt-1">${escapeHtml(fact)}</p>
            </div>
        `).join('');

        const originBadge = data.isCzech ?
            `<span class="text-[10px] font-bold text-white bg-rose-600/90 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm border border-rose-500"><i data-lucide="map-pin" class="w-3 h-3"></i>Česká stopa</span>` :
            `<span class="text-[10px] font-bold text-white bg-slate-800/60 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm border border-slate-600"><i data-lucide="globe-2" class="w-3 h-3 text-sky-300"></i>Světové (Jazyků: ${escapeHtml(data.langCount)}+)</span>`;

        appContent.innerHTML = `
            <div class="fade-in flex flex-col w-full min-h-full pb-6 bg-slate-50 dark:bg-slate-900">
                <div class="relative h-[42vh] w-full shrink-0 bg-slate-900">
                    <div id="result-visual" class="absolute inset-0 overflow-hidden bg-cover bg-center opacity-90" aria-hidden="true"></div>
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent"></div>

                    <div class="absolute bottom-0 left-0 p-6 w-full text-white">
                        <div class="flex flex-wrap items-center gap-2 mb-3">
                            <span class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-md border border-emerald-400">
                                <i data-lucide="${getCategoryIconName(data.category)}" class="w-3.5 h-3.5"></i>
                                ${escapeHtml(data.category)}
                            </span>
                            ${originBadge}
                        </div>
                        <h1 class="text-4xl font-black tracking-tight leading-tight text-white drop-shadow-xl mb-3">${name}</h1>

                        <div class="flex items-center gap-2 text-sm font-semibold text-emerald-50 bg-slate-800/60 backdrop-blur-md w-fit px-3.5 py-2 rounded-xl border border-slate-600 shadow-lg">
                            <i data-lucide="navigation" class="w-4 h-4 text-emerald-400"></i>
                            ${country}
                        </div>
                    </div>
                </div>

                <div class="p-6 flex flex-col gap-6 flex-grow bg-slate-50 dark:bg-slate-900 rounded-t-[2.5rem] -mt-6 z-10 relative">
                    ${renderResultBanner(data)}
                    ${renderStatsCard(data)}
                    ${renderMapCard(data)}

                    <div class="text-slate-700 dark:text-slate-200 leading-relaxed text-[16px] font-medium">
                        ${escapeHtml(data.description)}
                    </div>

                    <section class="${CARD} p-6">
                        <h3 class="${CARD_TITLE} mb-6">
                            <i data-lucide="compass" class="w-4 h-4 text-emerald-500"></i> Kvízová fakta z map
                        </h3>
                        <div class="space-y-5">
                            ${funFactsHtml}
                        </div>
                    </section>

                    <div class="flex flex-col gap-3">
                        <button type="button" data-action="next" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-[1.2rem] font-bold text-lg shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                            Další místo <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                        <a href="https://cs.wikipedia.org/?curid=${encodeURIComponent(data.id)}" target="_blank" rel="noopener noreferrer" class="w-full bg-slate-800 active:bg-slate-700 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white py-4 rounded-[1.2rem] text-center font-bold text-[16px] shadow-xl flex items-center justify-center gap-2 transition-colors">
                            <i data-lucide="book-open" class="w-5 h-5 text-slate-300"></i>
                            Číst encyklopedii
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
                stats.daily[currentPlace.dailyDate] = { correct: round.correct, points: round.points, hintLevel: round.hintLevel, typed: round.typed, category: currentPlace.category };
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
        Object.assign(round, { answered: true, correct, typed, answer, gaveUp, points: correct ? pointsFor(round.hintLevel, typed) : 0 });
        mapZoom = DEFAULT_MAP_ZOOM;
        recordResult();
        renderPlace();
    };

    const showNextHint = () => {
        if (!round || round.answered || round.hintLevel >= MAX_HINT_LEVEL) return;
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

    // Při výpadku, omezení (429) nebo zaseknutém spojení zkusí dotaz ještě dvakrát, pak to vzdá jako chybu spojení
    const fetchJson = async (url) => {
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
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

    const TITLE_FIRST_LETTERS = [...'ABCČDEFGHIJKLMNOPRŘSŠTUVZŽ'];
    const TITLE_NEXT_LETTERS = [...'abcdefghijklmnoprstuvyzáéíóúýčďěňřšťůž'];
    const PAGE_DETAILS_PARAMS = '&prop=coordinates|extracts|pageimages|pageprops&colimit=max&exlimit=max&exintro=1&explaintext=1&exchars=1200&pithumbsize=800&ppprop=wikibase_item';

    // API vrací souřadnice a úvody nejvýš pro 20 stránek najednou, proto dávky po 20
    const buildBatchUrl = (rng, isDaily) => {
        if (!isDaily) return `${WIKI_API}&action=query&generator=random&grnnamespace=0&grnlimit=20${PAGE_DETAILS_PARAMS}`;
        // Náhodný generátor Wikipedie nejde zopakovat, dnešní místo proto hledáme abecedně od místa daného semínkem
        const titlePrefix = pickRandom(TITLE_FIRST_LETTERS, rng) + pickRandom(TITLE_NEXT_LETTERS, rng) + pickRandom(TITLE_NEXT_LETTERS, rng);
        return `${WIKI_API}&action=query&generator=allpages&gapnamespace=0&gapfilterredir=nonredirects&gaplimit=20&gapfrom=${encodeURIComponent(titlePrefix)}${PAGE_DETAILS_PARAMS}`;
    };

    // Odkazy na jiné jazyky API vrací nejvýš 500 na dotaz pro všechny stránky dohromady, proto pokračujeme přes „continue“
    const fetchLangCounts = async (pageIds) => {
        const counts = {};
        pageIds.forEach(id => { counts[id] = 0; });
        let continueParams = null;
        for (let i = 0; i < 10; i++) {
            const continueQuery = continueParams ? '&' + new URLSearchParams(continueParams).toString() : '';
            const data = await fetchJson(`${WIKI_API}&action=query&prop=langlinks&lllimit=max&pageids=${pageIds.join('|')}${continueQuery}`);
            Object.values((data.query && data.query.pages) || {}).forEach(p => {
                counts[p.pageid] += (p.langlinks || []).length;
            });
            if (!data.continue) break;
            continueParams = data.continue;
        }
        return counts;
    };

    // Aktuální hodnoty vlastnosti z Wikidat (preferované, bez data konce, bez zastaralých)
    const fetchCurrentClaimIds = async (qid, property) => {
        const data = await fetchJson(`${WIKIDATA_API}&action=wbgetclaims&entity=${encodeURIComponent(qid)}&property=${property}`);
        const claims = ((data.claims || {})[property] || [])
            .filter(c => c.rank !== 'deprecated' && c.mainsnak.datavalue);
        const preferred = claims.filter(c => c.rank === 'preferred');
        const ranked = preferred.length ? preferred : claims;
        const current = ranked.filter(c => !(c.qualifiers && c.qualifiers.P582));
        return [...new Set((current.length ? current : ranked).map(c => c.mainsnak.datavalue.value.id))].slice(0, 50);
    };

    // Stát z Wikidat (P17), u moří a pohoří bez státu aspoň kontinent (P30).
    // U samotného státu (Řecko má jako stát samo sebe) navíc jeho kontinent – poslouží jako nápověda polohy.
    const fetchCountry = async (qid) => {
        const unknown = { ids: [], names: [], name: UNKNOWN_COUNTRY, source: null, continent: '' };
        if (!qid) return unknown;
        try {
            let source = 'P17';
            let ids = await fetchCurrentClaimIds(qid, 'P17');
            if (ids.length === 0) {
                source = 'P30';
                ids = await fetchCurrentClaimIds(qid, 'P30');
            }
            if (ids.length === 0) return { ...unknown, name: INTERNATIONAL_WATERS };
            const continentIds = source === 'P17' && ids.includes(qid) ? await fetchCurrentClaimIds(qid, 'P30') : [];

            const data = await fetchJson(`${WIKIDATA_API}&action=wbgetentities&ids=${[...ids, ...continentIds].join('|')}&props=labels&languages=cs&languagefallback=1`);
            const label = (id) => { const entity = (data.entities || {})[id]; return entity && entity.labels && entity.labels.cs && entity.labels.cs.value; };
            const names = ids.map(label).filter(Boolean);
            if (names.length === 0) return unknown;
            return { ids, names, name: names.join(', '), source, continent: continentIds.map(label).filter(Boolean).join(', ') };
        } catch (e) {
            console.error(e);
            return unknown;
        }
    };

    const fetchGeoLocation = async (rng, isDaily) => {
        let foundPage = null;
        // Všechna prověřená místa – poslouží jako nesprávné možnosti odpovědí
        const pools = { all: [], notable: [] };
        const strictBlacklist = ['společnost', 'firma', 'podnik', 'korporace', 'bitva', 'obléhání', 'válka', 'smlouva', 'dohoda', 'zemětřesení', 'povodeň', 'atentát', 'turnaj', 'mistrovství', 'olympiáda', 'masakr', 'dálnice', 'silnice', 'planetka', 'asteroid', 'film', 'album', 'seznam', 'letiště', 'nádraží', 'gymnázium', 'fakulta', 'univerzita', 'kostel', 'kaple', 'klášter', 'organizace', 'klub'];

        const deadline = Date.now() + SEARCH_TIMEOUT;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !foundPage; attempt++) {
            // Pomalé spojení nesmí nechat uživatele čekat donekonečna
            if (Date.now() > deadline) throw new NetworkError('Hledání místa trvá příliš dlouho');
            const data = await fetchJson(buildBatchUrl(rng, isDaily));
            const pages = Object.values((data.query && data.query.pages) || {});

            const candidates = pages.filter(p => {
                if (!p.coordinates || !p.extract || p.extract.length < 150) return false;

                const titleLower = p.title.toLowerCase();
                const extractLower = p.extract.toLowerCase().substring(0, 250);

                if (strictBlacklist.some(word => titleLower.includes(word) || extractLower.includes(word))) return false;

                const strictCategory = inferGeoCategory(p.extract);
                if (strictCategory === null) return false;

                p.looksLikeVillage = false;
                if (strictCategory === CATEGORY_CITY) {
                    const pop = getPopulation(p.extract);
                    if (pop !== null && pop < 6000) return false;
                    p.looksLikeVillage = pop === null && (extractLower.includes('vesnice') || extractLower.includes('osada') || extractLower.includes('městys') || /\bobec\b/.test(extractLower));
                }

                const { lat, lon } = p.coordinates[0];
                p.isTextCzech = extractLower.includes('v česku') || extractLower.includes('české republice');
                p.isCzech = isInsideCzechia(lat, lon) || p.isTextCzech;
                p.finalCategory = strictCategory;
                return true;
            });
            candidates.forEach(p => pools.all.push({ pageid: p.pageid, title: p.title, category: p.finalCategory }));
            if (candidates.length === 0) continue;

            const langCounts = await fetchLangCounts(candidates.map(p => p.pageid));
            const validPages = candidates.filter(p => {
                p.langCount = langCounts[p.pageid] || 0;
                if (p.looksLikeVillage && p.langCount < 10) return false;

                let requiredLangs = p.isCzech ? 4 : 7;
                if (attempt > 12) requiredLangs = p.isCzech ? 3 : 5;
                return p.langCount >= requiredLangs;
            });
            validPages.forEach(p => pools.notable.push({ pageid: p.pageid, title: p.title, category: p.finalCategory }));
            if (validPages.length === 0) continue;

            const groupedPages = {};
            validPages.forEach(p => {
                if (!groupedPages[p.finalCategory]) groupedPages[p.finalCategory] = [];
                groupedPages[p.finalCategory].push(p);
            });

            const availableCategories = Object.keys(groupedPages);
            const nonCityCategories = availableCategories.filter(c => c !== CATEGORY_CITY);

            let selectedCategory;

            if (nonCityCategories.length > 0 && availableCategories.includes(CATEGORY_CITY)) {
                if (rng() < 0.85) {
                    selectedCategory = pickRandom(nonCityCategories, rng);
                } else {
                    selectedCategory = CATEGORY_CITY;
                }
            } else {
                selectedCategory = pickRandom(availableCategories, rng);
            }

            foundPage = pickRandom(groupedPages[selectedCategory], rng);
        }

        if (!foundPage) throw new Error('Nepodařilo se najít vhodné místo. Zkus to prosím znovu.');

        const ownQid = foundPage.pageprops && foundPage.pageprops.wikibase_item;
        const country = await fetchCountry(ownQid);
        const { description, funFacts } = processWikiText(foundPage.extract);
        const countryFacts = { title: foundPage.title, ownQid, countryIds: country.ids, countryNames: country.names, countrySource: country.source };
        const placeIsCountry = country.source === 'P17' && isCountryItself(countryFacts);
        // Na stát se ptáme, jen když ho Wikidata znají a neprozradí ho už název – jinak by otázka neměla smysl
        const wantsCountryQuestion = rng() > 0.5;
        const quizType = wantsCountryQuestion && canAskForCountry(countryFacts) ? 'location' : 'name';
        const otherPlaces = {
            all: pools.all.filter(p => p.pageid !== foundPage.pageid),
            notable: pools.notable.filter(p => p.pageid !== foundPage.pageid)
        };
        let choices;
        if (quizType === 'location') choices = buildCountryChoices(country.ids, country.names, rng);
        // U státu jsou nesprávnými možnostmi jiné státy, ne regiony
        else if (placeIsCountry) choices = buildCountryChoices(country.ids, [displayName(foundPage.title)], rng);
        else choices = buildNameChoices(foundPage.title, foundPage.finalCategory, otherPlaces, rng);
        const { lat, lon } = foundPage.coordinates[0];

        return {
            id: foundPage.pageid,
            name: foundPage.title,
            category: foundPage.finalCategory,
            langCount: foundPage.langCount,
            isCzech: country.source === 'P17' ? country.ids.includes(CZECHIA_QID) || foundPage.isTextCzech : foundPage.isCzech,
            country: country.name,
            countryIds: country.source === 'P17' ? country.ids : [],
            countryNames: country.source === 'P17' ? country.names : [],
            isCountry: placeIsCountry,
            locationHint: placeIsCountry ? country.continent : (isKnownCountry(country.name) ? country.name : ''),
            lat,
            lon,
            // Jen skutečná fotka – vlajky, znaky a mapy z článku nápovědou nejsou
            photoUrl: foundPage.thumbnail && isRealPhoto(foundPage.pageimage) ? foundPage.thumbnail.source : null,
            description,
            funFacts,
            quizType,
            choices
        };
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

    const loadDailyLocation = async () => {
        if (isLoading) return;
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        isLoading = true;
        isDailyMode = true;
        updateControlsUI();
        renderLoading();

        const today = getDayKey();
        // Uložené dnešní místo včetně stavu odpovědi – po návratu z tréninku zůstane odhalené
        const savedDaily = readJson(DAILY_STORAGE_KEY);
        if (savedDaily && savedDaily.date === today && savedDaily.data) {
            currentPlace = savedDaily.data;
            round = savedDaily.round || createRound();
            isLoading = false;
            renderPlace();
            return;
        }

        try {
            const place = await fetchGeoLocation(createSeededRandom('geo-kviz-' + today), true);
            currentPlace = { ...place, dailyDate: today };
            round = createRound();
            isLoading = false;
            renderPlace();
        } catch (error) {
            isLoading = false;
            renderError(error);
        }
    };

    const loadRandomLocation = async () => {
        if (isLoading) return;
        if (!gameVariant) {
            renderVariantWelcome();
            return;
        }
        isLoading = true;
        isDailyMode = false;
        updateControlsUI();
        renderLoading();

        try {
            currentPlace = await fetchGeoLocation(Math.random, false);
            round = createRound();
            isLoading = false;
            renderPlace();
        } catch (error) {
            isLoading = false;
            renderError(error);
        }
    };

    const retryLoad = () => isDailyMode ? loadDailyLocation() : loadRandomLocation();

    const renderError = (error) => {
        console.error(error);
        const isNetworkError = error instanceof NetworkError || !navigator.onLine;
        const title = isNetworkError ? 'Chyba spojení' : 'Místo se nenašlo';
        const message = isNetworkError
            ? 'Nepodařilo se spojit s Wikipedií. Zkontroluj připojení k internetu a zkus to znovu.'
            : 'Nepodařilo se najít vhodné místo. Zkus to prosím znovu.';

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
    renderIcons(document);
    removeOldStorage();
    updateControlsUI();
    if (gameVariant) checkSessionAndLoad();
    else renderVariantWelcome();

    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('sw.js').catch(error => console.error(error));
    }
})();
